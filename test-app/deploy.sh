#!/bin/sh
#
#   Deploy the gobj-ui test-app (the nav-layouts demo).
#
#   Default target is demo.yuneta.io, the public demo linked from
#   doc.yuneta.io. The node that serves it is named by the environment
#   variable DEMO_SSH_HOST (required, no default): its nginx serves the
#   demo from /yuneta/gui/demo.yuneta.io, with its own Let's Encrypt
#   certificate, and the bundle goes there as yuneta@$DEMO_SSH_HOST.
#
#   niyamaka.com is the second target, kept for mobile testing. It is the
#   same bundle on the same box, under /yuneta/gui/niyamaka.com.
#
#   No backend: the test-app is a pure gobj tree with hash routing, so the
#   static bundle is all that is needed.
#
#   Usage:
#       export DEMO_SSH_HOST=<node that serves the demo>
#       ./deploy.sh                     # build, then deploy to demo.yuneta.io
#       ./deploy.sh --no-build          # deploy the existing ./dist/
#       ./deploy.sh niyamaka.com        # deploy to the mobile-test host
#       ./deploy.sh niyamaka.com --no-build
#
#   or for one call: DEMO_SSH_HOST=<node> ./deploy.sh --no-build
#   (`npm run deploy-round` hands its environment down, so export it there
#   too).
#
set -e

if [ -z "$DEMO_SSH_HOST" ]; then
    echo "DEMO_SSH_HOST is not set: export DEMO_SSH_HOST=<node that serves the demo>" >&2
    exit 2
fi
SSH_HOST="$DEMO_SSH_HOST"
TARGET="demo.yuneta.io"
BUILD=1

for arg in "$@"; do
    case "$arg" in
        --no-build) BUILD=0 ;;
        -*)         echo "unknown option: $arg" >&2; exit 2 ;;
        *)          TARGET="$arg" ;;
    esac
done

case "$TARGET" in
    demo.yuneta.io|niyamaka.com) ;;
    *) echo "unknown target: $TARGET (demo.yuneta.io or niyamaka.com)" >&2; exit 2 ;;
esac

DEST_DIR="/yuneta/gui/$TARGET"

cd "$(dirname "$0")"

if [ "$BUILD" = "1" ]; then
    echo ">>> Building test-app ..."
    npm run build
fi

echo ">>> Deploying ./dist/ -> yuneta@$SSH_HOST:$DEST_DIR ..."
ssh "yuneta@$SSH_HOST" "mkdir -p $DEST_DIR"
# --delay-updates + --delete-after: the new files land together at the end
# of the upload and the old ones are removed only after them, so a page
# loaded during the upload never gets an index.html whose chunks are not
# there yet. The demo carries no build stamp (it does not use
# yunetaHtmlPlugin) and creates no C_YUI_UPDATE_WATCH, so a tab still
# running the old build is NOT told: it is reloaded by hand.
rsync -avzL --delete-after --delay-updates \
    --exclude \.webassets-cache --exclude \.sass-cache --exclude \.cache \
    ./dist/ \
    "yuneta@$SSH_HOST:$DEST_DIR"

echo ">>> Verifying https://$TARGET ..."
code=$(curl -sS -o /dev/null -w '%{http_code}' "https://$TARGET/")
if [ "$code" != "200" ]; then
    echo ">>> FAILED: https://$TARGET answered $code" >&2
    exit 1
fi
echo ">>> Done: https://$TARGET ($code)"
