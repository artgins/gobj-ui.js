#!/bin/sh
#
#   Deploy the gobj-ui test-app (the nav-layouts demo).
#
#   Default target is demo.yuneta.io, the public demo linked from
#   doc.yuneta.io. The nginx on the wattyzer node (37.187.89.46) serves it
#   from /yuneta/gui/demo.yuneta.io, with its own Let's Encrypt certificate.
#
#   niyamaka.com is the second target, kept for mobile testing. It is the
#   same bundle on the same box, under /yuneta/gui/niyamaka.com.
#
#   No backend: the test-app is a pure gobj tree with hash routing, so the
#   static bundle is all that is needed.
#
#   Usage:
#       ./deploy.sh                     # build, then deploy to demo.yuneta.io
#       ./deploy.sh --no-build          # deploy the existing ./dist/
#       ./deploy.sh niyamaka.com        # deploy to the mobile-test host
#       ./deploy.sh niyamaka.com --no-build
#
set -e

SSH_HOST="app.wattyzer.com"
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
rsync -avzL --delete \
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
