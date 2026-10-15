/***********************************************************************
 *          deploy-round.mjs
 *
 *          The deploy loop of a release round, as ONE command.
 *
 *          A published version reaches an app only through this loop:
 *          wait for the registry, raise the range, install, build,
 *          deploy, then read back what the host actually serves.
 *
 *          RAISING THE RANGE RAISES THE APP'S VERSION too, its third
 *          number, in the same edit of each package.json: a new range is
 *          a new bundle, and an app whose "About" shows one number for
 *          five different bundles cannot tell anybody which one is in
 *          front of them (yunovatios stayed at one version through four
 *          rounds). A package.json whose range was already raised is not
 *          touched again, so running the round twice bumps once. Run by
 *          hand it has been skipped twice in the same place -- the DEMO,
 *          which is the only surface that does NOT wait for the registry
 *          (it consumes the working tree through `file:..`), so it falls
 *          outside the rhythm of the others and is finished before the
 *          loop even starts.
 *
 *          So the demo is not a line of this file's manifest, it is
 *          built IN: it cannot be left out by editing a config, and
 *          `--check` reports it beside every other host.
 *
 *          AN APP IS TESTED BEFORE IT IS DEPLOYED: after its build, its
 *          `npm test` (or the command its manifest entry names in
 *          `test`), and a red test leaves it undeployed. The round used to
 *          build and deploy only, and yunomusica went out six times with
 *          its catalogue check red. And EVERY STEP SHOWS WHAT IT SAYS: the
 *          output of install, build, test and deploy goes to the console
 *          as it comes -- a warning of a step that exits 0 (a backup that
 *          ran out of disk) was swallowed whole, and of a failing step
 *          only its last three lines were shown.
 *
 *          A TEMPLATE is a target too (the js_gui scaffold): its
 *          `range_files` are raised without a version of their own (it
 *          is a marker there), nothing is installed, its `build` is the
 *          check that generates an app from it and builds that, and it
 *          has no host to read back. A key the library adds and a
 *          template lacks fails every app generated from it.
 *
 *          A range it cannot raise SAFELY is refused, never "already":
 *          anything but a caret range of the version's major (an exact
 *          version, a `~`, a `^1.x` that a v2 version would rewrite), a
 *          range AHEAD of the version (raising it would lower it: the
 *          source tree the version is read from is behind), and a package
 *          version that is not x.y.z. Every package.json of the app is
 *          checked before any is written, so a refused app is reported
 *          FAILED and left as it was -- all of it (up to gobj-ui 7.26.42
 *          the files before the refused one kept their raise).
 *
 *          A range found ALREADY raised raises the version all the same
 *          when nobody raised it with the range -- a range raised by hand,
 *          committed or not -- and leaves it when the version moved with
 *          it (the round run twice, or a package.json two apps share): the
 *          git history of the package.json says which -- every state it
 *          had, every branch merged in and a rename followed, also one git
 *          does not see as a rename (a package.json born with the range is
 *          asked of every package.json before it, by version, or of the
 *          other history when it is born in the root of a history joined
 *          to another; what that search reads is kept between rounds, per
 *          package, in ~/.yuneta/deploy-round-history.json), and a state
 *          that is not json read by its lines: the version is raised when
 *          one of them carries it with ANOTHER range. One
 *          whose history cannot be read is refused, and so is a shallow
 *          clone cut where the range was already raised (it says `git
 *          fetch --unshallow`). Up to gobj-ui 7.26.42 "already" was
 *          taken as done, and a range raised by hand went out in a new
 *          bundle under the old number.
 *
 *          The other consumers are private repositories on this machine,
 *          so they are read from `~/.yuneta/gobj-ui-consumers.json`
 *          (see `gobj-ui-consumers.example.json`) and nothing about them
 *          is committed here.
 *
 *          WHICH PACKAGE the round is for is an argument, and defaults
 *          to this one. The SPAs consume `@yuneta/gobj-js` as well, and
 *          it reaches them through exactly the same loop -- the same
 *          consumers, the same builds, the same hosts read back. A
 *          second copy of this file for the runtime would have been a
 *          second thing to keep in step with the manifest; the only
 *          things that actually differ are the name to wait for, the
 *          range to rewrite, and where its version is read from.
 *
 *          Usage:
 *              node scripts/deploy-round.mjs            # the whole loop
 *              node scripts/deploy-round.mjs --check    # only read what is live
 *              node scripts/deploy-round.mjs --only gui_treedb
 *              node scripts/deploy-round.mjs --only test-app   # the demo
 *              node scripts/deploy-round.mjs --no-wait  # skip the registry wait
 *              node scripts/deploy-round.mjs --pkg @yuneta/gobj-js
 *          (`--only=x` / `--pkg=x` too). Anything else is exit 2,
 *          before anything is done.
 *
 *          The demo is deployed only when this repo AND the sibling
 *          gobj-js are each a clean tree of their own at the commit of
 *          origin/main (untracked files count); otherwise it is reported
 *          NOT DEPLOYED, and there is no option to skip that check.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {execFileSync} from "node:child_process";
import {readFileSync, existsSync, statSync, writeFileSync, renameSync, mkdirSync, realpathSync} from "node:fs";
import {basename, dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {homedir} from "node:os";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST = join(homedir(), ".yuneta", "gobj-ui-consumers.json");
const HISTORY_CACHE = join(homedir(), ".yuneta", "deploy-round-history.json");

/*
 *  The package this round is for, and the source tree its version is
 *  read from. The runtime is a SIBLING submodule of this one
 *  (kernel/js/gobj-js next to kernel/js/gobj-ui), which is what makes
 *  the version readable at all -- the registry would answer the version
 *  it is already serving, which is precisely what the wait below exists
 *  to stop trusting.
 */
/*
 *  The arguments are read STRICTLY: a misspelt option (`--chek`), an
 *  `--only=x` read as nothing, or an `--only` with no name used to run
 *  the WHOLE round, real deploys included. Anything not understood is
 *  exit 2 before anything is done.
 */
const OPTIONS = (() => {
    const flags = new Set(["--check", "--no-wait"]);
    const valued = new Set(["--only", "--pkg"]);
    const opts = {"--check": false, "--no-wait": false, "--only": null, "--pkg": null};
    const argv = process.argv.slice(2);
    const refuse = (why) => {
        console.error(`deploy-round: ${why}; the options are --check, --no-wait, ` +
                      `--only <name>, --pkg <name>`);
        process.exit(2);
    };
    for(let i = 0; i < argv.length; i++) {
        let arg = argv[i];
        let value = null;
        const eq = arg.indexOf("=");
        if(arg.startsWith("--") && eq > 0) {
            value = arg.slice(eq + 1);
            arg = arg.slice(0, eq);
        }
        if(flags.has(arg)) {
            if(value !== null) {
                refuse(`${arg} takes no value`);
            }
            if(opts[arg]) {
                refuse(`${arg} given twice`);
            }
            opts[arg] = true;
        } else if(valued.has(arg)) {
            if(value === null) {
                i++;
                value = (i < argv.length)? argv[i] : null;
            }
            if(!value || value.startsWith("--")) {
                refuse(`${arg} needs a name`);
            }
            if(opts[arg] !== null) {
                refuse(`${arg} given twice`);
            }
            opts[arg] = value;
        } else {
            refuse(`unknown argument "${argv[i]}"`);
        }
    }
    return opts;
})();

const PKG_NAME = OPTIONS["--pkg"] || "@yuneta/gobj-ui";
const PKG_DIR = (PKG_NAME === "@yuneta/gobj-ui")?
    ROOT : resolve(ROOT, "..", PKG_NAME.replace(/^@[^/]+\//, ""));

if(!existsSync(join(PKG_DIR, "package.json"))) {
    console.error(`no source tree for ${PKG_NAME} at ${PKG_DIR}`);
    process.exit(2);
}
const PKG = JSON.parse(readFileSync(join(PKG_DIR, "package.json"), "utf8"));
const VERSION = PKG.version;
if(PKG.name !== PKG_NAME) {
    console.error(`${PKG_DIR} holds ${PKG.name}, not ${PKG_NAME}`);
    process.exit(2);
}

/*
 *  The DEMO. In the repo, so it is described here and not in the
 *  manifest: it runs the working tree (`file:..`), which is why it needs
 *  no range and no registry -- and why it is the one that gets skipped.
 *  And why it goes out only from a clean tree at origin/main, this
 *  repo's and the sibling gobj-js's (demo_problem()): up to gobj-ui
 *  7.26.54 any copy of the repo, on any commit, with any change,
 *  deployed the public demo, and up to 7.26.56 any gobj-js beside it.
 */
const DEMO = {
    name: "test-app",
    demo: true,
    path: join(ROOT, "test-app"),
    worktree: true,                     /*  no range to raise  */
    deploys: [["./deploy.sh", "--no-build"], ["./deploy.sh", "niyamaka.com", "--no-build"]],
    urls: ["https://demo.yuneta.io/", "https://niyamaka.com/"],
};

const CHECK_ONLY = OPTIONS["--check"];
const NO_WAIT = OPTIONS["--no-wait"];
const ONLY = OPTIONS["--only"];

/************************************************************
 *  Shell helpers
 ************************************************************/
/*  `NODE` is deleted from the environment on purpose. `npm run`
 *  exports it pointing at the node BINARY, and a deploy script that
 *  reads `NODE="${NODE:-<vhost>}"` -- as one of these did -- then
 *  rsyncs the site to `/yuneta/gui/<path to node>`. Removing it makes
 *  `npm run deploy-round` and a bare `node scripts/deploy-round.mjs`
 *  behave the same, which is the real argument: a runner must not
 *  hand a child anything the child would not get from a shell.  */
function child_env()
{
    let env = Object.assign({}, process.env);
    delete env.NODE;
    return env;
}

function run(cmd, cmd_args, cwd)
{
    return execFileSync(cmd, cmd_args, {
        cwd: cwd, encoding: "utf8", env: child_env(),
        stdio: ["ignore", "pipe", "pipe"]
    });
}

/*  A STEP of the round: what it says goes to the console as it comes,
 *  and a failure throws with its status. Never to a pipe nobody reads:
 *  a step that exits 0 can still say something that matters.  */
function run_step(cmd, cmd_args, cwd, extra_env)
{
    execFileSync(cmd, cmd_args, {
        cwd: cwd, env: Object.assign(child_env(), extra_env || {}),
        stdio: ["ignore", "inherit", "inherit"]
    });
}

function curl(url)
{
    try {
        return run("curl", ["-sS", "--max-time", "20", url]);
    } catch(e) {
        return "";
    }
}

/*  The name of the entry bundle, which is what tells a deployed host
 *  apart from the one before it: vite hashes it on every content
 *  change, so "same name" is "same bytes".  */
function entry_bundle(html)
{
    const m = html.match(/assets\/[A-Za-z0-9_.-]*\.js/);
    return m? m[0] : null;
}

function local_bundle(dir)
{
    const index = join(dir, "dist", "index.html");
    if(!existsSync(index)) {
        return null;
    }
    return entry_bundle(readFileSync(index, "utf8"));
}

/************************************************************
 *  The manifest of the npm consumers (machine-local)
 ************************************************************/
function read_consumers()
{
    if(!existsSync(MANIFEST)) {
        console.error(`\nNo manifest at ${MANIFEST} -- only the demo will run.`);
        console.error(`Copy scripts/gobj-ui-consumers.example.json there and fill it in.\n`);
        return [];
    }
    const jn = parse_json(readFileSync(MANIFEST, "utf8"));
    return jn.consumers || [];
}

/************************************************************
 *  Wait for the registry to SERVE the version.
 *
 *  `npm publish` returning is not the same as `npm install` finding it:
 *  a consumer installed in that window silently keeps the version
 *  before. A registry serving a NEWER version than the source tree is
 *  no wait: the tree is behind (up to gobj-ui 7.26.42 the round waited
 *  150 s for it and said "not serving this version yet").
 *
 *      -> null when it serves the version, else why the round stops
 ************************************************************/
function wait_for_registry()
{
    process.stdout.write(`registry: waiting for ${PKG_NAME}@${VERSION} `);
    for(let i = 0; i < 30; i++) {
        let served = "";
        try {
            served = run("npm", ["view", PKG_NAME, "version"]).trim();
        } catch(e) {
            served = "";
        }
        if(served === VERSION) {
            console.log("-> serving");
            return null;
        }
        if(compare_versions(served, VERSION) > 0) {
            /*  No wait ends that: the tree the version is read from is behind  */
            console.log("");
            return `the registry serves ${PKG_NAME} ${served}, NEWER than ${VERSION}, the version of ` +
                   `${PKG_DIR}: that tree is behind -- bring it up to date and run the round again`;
        }
        process.stdout.write(".");
        execFileSync("sleep", ["5"]);
    }
    console.log(" TIMEOUT");
    return `the registry is not serving ${PKG_NAME} ${VERSION} yet`;
}

/*  x.y.z against x.y.z: < 0, 0, > 0; 0 when either is not one  */
function compare_versions(a, b)
{
    const re = /^(\d+)\.(\d+)\.(\d+)$/;
    const x = re.exec(a || "");
    const y = re.exec(b || "");
    if(!x || !y) {
        return 0;
    }
    for(let i = 1; i <= 3; i++) {
        if(Number(x[i]) !== Number(y[i])) {
            return Number(x[i]) - Number(y[i]);
        }
    }
    return 0;
}

/************************************************************
 *  Raise the range and rewrite the package.json -- and with it
 *  the version of the package, its third number (see the header).
 *
 *  `write_file` and not `run()`: that helper cannot write stdin,
 *  and this is the one place that needs it.
 ************************************************************/
function write_file(path, content)
{
    execFileSync("tee", [path], {input: content, stdio: ["pipe", "ignore", "inherit"]});
}

/*  The specs a package.json text carries for the package -- gobj-ui
 *  declares the runtime TWICE, as a peer and as a devDependency, and a
 *  consumer may too  */
function specs_of(text)
{
    const name = PKG_NAME.replace("/", "\\/");
    return [...text.matchAll(new RegExp(`"${name}":\\s*"([^"]*)"`, "g"))].map(m => m[1]);
}

/************************************************************
 *  What raising the range of one package.json would write, checked
 *  and not written: {f, after (null: nothing to write), range_raised
 *  (false: only the version moves, or nothing), notes}, or
 *  an Error thrown for a file it cannot raise safely. `bump`: raise
 *  the package's own version too. A template's file has a marker for
 *  a version, and is raised without.
 *
 *  Every package.json of a target is planned before any is written
 *  (do_round()): a refusal leaves them all as they were.
 ************************************************************/
function plan_raise(f, bump)
{
    if(!existsSync(f)) {
        throw new Error(`${f}: not there`);
    }
    const before = readFileSync(f, "utf8");

    /*  Every spec must be a caret range of the version's major: that is
     *  the one shape this round can raise without changing what it
     *  means. An exact or a `~` range used to be taken for "already"
     *  and deployed unraised; a `^1.x` would be rewritten to v2. And
     *  not one ahead of the version: raising it would LOWER it.  */
    const specs = specs_of(before);
    if(!specs.length) {
        throw new Error(`${f} does not depend on ${PKG_NAME}`);
    }
    const major = VERSION.split(".")[0];
    const caret = new RegExp(`^\\^${major}\\.\\d+\\.\\d+$`);
    for(const spec of specs) {
        if(!caret.test(spec)) {
            throw new Error(`${f}: ${PKG_NAME} "${spec}" is not a ^${major}.x.y range -- ` +
                            `not raised, not deployed`);
        }
        if(compare_versions(spec.slice(1), VERSION) > 0) {
            throw new Error(`${f}: ${PKG_NAME} "${spec}" is AHEAD of ${VERSION}, the version of ` +
                            `${PKG_DIR}: raising it would lower it (is that tree behind?) -- ` +
                            `not raised, not deployed`);
        }
    }

    const re = new RegExp(`("${PKG_NAME.replace("/", "\\/")}":\\s*")\\^[0-9][^"]*(")`, "g");
    let after = before.replace(re, `$1^${VERSION}$2`);
    if(after === before) {
        if(!bump || version_raised_with_range(f)) {
            return {f, after: null, range_raised: false, notes: []};
        }
        const b = bump_patch_version(f, before);
        return {f, after: b.text, range_raised: false, notes: [`${b.note}, raised by hand without its version`]};
    }
    if(!bump) {
        return {f, after, range_raised: true, notes: []};
    }
    const b = bump_patch_version(f, after);
    return {f, after: b.text, range_raised: true, notes: [b.note]};
}

/************************************************************
 *  The third number of the package's own version, up by one, in
 *  the text of its package.json (its formatting kept): {text,
 *  note}. A version that is not x.y.z refuses the app: a new bundle
 *  under the old number is what the bump exists to prevent (the
 *  js_gui template leaves a literal "{{version}}").
 ************************************************************/
function bump_patch_version(f, text)
{
    const version = package_json_of(f, text).version;
    const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(version || "");
    if(!m) {
        throw new Error(`${f}: version '${version}' is not x.y.z -- not raised, not deployed`);
    }
    const next = `${m[1]}.${m[2]}.${Number(m[3]) + 1}`;
    const at = top_level_string(text, "version");
    if(!at || JSON.parse(text.slice(at.start, at.end)) !== version) {
        throw new Error(`${f}: no "version": "${version}" in its text -- not raised, not deployed`);
    }
    const after = text.slice(0, at.start) + JSON.stringify(next) + text.slice(at.end);
    if(package_json_of(f, after).version !== next) {
        throw new Error(`${f}: the version written is not read back as ${next} -- not raised, not deployed`);
    }
    return {text: after, note: `version ${version} -> ${next}  (${f})`};
}

/************************************************************
 *  Where the string value of a key of the TOP object of a json text
 *  is: {start, end} of the value with its quotes, the LAST one when
 *  the key is there twice (as JSON.parse() reads it), or null (not
 *  there, or not a string). Up to gobj-ui 7.26.48 the version was
 *  found by a pattern, which took the first `"version": "x.y.z"` of
 *  the text: a `config.version` or a `scripts.version` equal to it
 *  was raised in its place, and the app went out under its old number.
 ************************************************************/
function top_level_string(text, key)
{
    let depth = 0;
    let want_key = false;       // in the top object, where a key goes
    let last_key = null;
    let found = null;
    for(let i = 0; i < text.length; i++) {
        const c = text[i];
        if(c === "\"") {
            let j = i + 1;
            while(j < text.length && text[j] !== "\"") {
                j += (text[j] === "\\")? 2 : 1;
            }
            if(depth === 1 && want_key) {
                last_key = JSON.parse(text.slice(i, j + 1));
                want_key = false;
            } else if(depth === 1 && last_key === key) {
                found = {start: i, end: j + 1};
                last_key = null;
            }
            i = j;
        } else if(c === "{" || c === "[") {
            if(depth === 1 && last_key === key) {
                found = null;       // a later value that is no string
            }
            depth++;
            if(depth === 1) {
                want_key = (c === "{");
            }
        } else if(c === "}" || c === "]") {
            depth--;
        } else if(c === "," && depth === 1) {
            want_key = true;
            last_key = null;
        } else if(depth === 1 && last_key === key && /[-0-9tfn]/.test(c)) {
            found = null;
            last_key = null;
        }
    }
    return found;
}

/************************************************************
 *  A package.json whose range is ALREADY ^VERSION: was its own
 *  version raised with it? Asked of its git history, since the round
 *  commits nothing and runs again:
 *
 *    - the raise is not committed (HEAD has another range): raised
 *      with it when the version differs from HEAD's -- the round ran
 *      already, or a package.json two apps share was raised by the
 *      first one;
 *    - it is committed: raised with it when NO state of the file in
 *      its history (range_history()) carries this version with
 *      another range. A number that ever stood beside another range
 *      may have gone out with it, so the bundle of the new range needs
 *      a number of its own. Asked of the VALUES, not of a commit:
 *      every branch merged in is read (up to gobj-ui 7.26.45 only the
 *      newest commit whose parent had another range was, so a merge of
 *      a branch that raised the range by hand next to a version raised
 *      on main with the old one deployed under that version), and a
 *      commit that only reformats the line changes nothing (a package.
 *      json born with the range carries a version of its own). Where
 *      the file was BORN with the range and this version, every
 *      package.json before it is asked too (package_states()).
 *
 *  A version that is not x.y.z, or a history it cannot read, refuses
 *  the app: "already" would deploy a new bundle under a number that
 *  may be the old one.
 ************************************************************/
function version_raised_with_range(f)
{
    const dir = dirname(f);
    const rel = "./" + basename(f);
    const version = package_json_of(f, readFileSync(f, "utf8")).version;
    if(!/^\d+\.\d+\.\d+$/.test(version || "")) {
        throw new Error(`${f}: version '${version}' is not x.y.z -- not raised, not deployed`);
    }
    try {
        const head = run("git", ["show", `HEAD:${rel}`], dir);
        if(!range_is_raised(head)) {
            const versions = versions_of(head);
            if(versions.length === 0) {
                const sha = run("git", ["rev-parse", "HEAD"], dir).trim().slice(0, 10);
                throw new Error(`HEAD (${sha}):${rel} carries no version`);
            }
            return !versions.includes(version);
        }
        const carries = (st) => !state_is_raised(st) && st.versions.includes(version);
        const {texts, births} = range_history(dir, basename(f));
        if(texts.map(state_of).some(carries)) {
            return false;
        }
        for(const b of births) {
            if(range_is_raised(b.text) && versions_of(b.text).includes(version)
                    && package_states(dir, b.parents).some(carries)) {
                return false;
            }
        }
        return true;
    } catch(e) {
        throw new Error(`${f}: its range is already ^${VERSION}, and the round cannot tell whether its ` +
                        `version was raised with the range (${String(e.message).split("\n")[0]}) -- ` +
                        `not raised, not deployed`);
    }
}

/*  Does a package.json text carry ^VERSION in every spec of the package?  */
function range_is_raised(text)
{
    return state_is_raised(state_of(text));
}

/*  What the round reads of a package.json text: {specs, versions}  */
function state_of(text)
{
    return {specs: specs_of(text), versions: versions_of(text)};
}

function state_is_raised(st)
{
    return st.specs.length > 0 && st.specs.every((spec) => spec === `^${VERSION}`);
}

/*  A json text, with a byte order mark before it if it has one: npm
 *  reads a package.json that way (up to gobj-ui 7.26.48 the round
 *  refused it as "not json")  */
function parse_json(text)
{
    return JSON.parse(text.startsWith("\ufeff")? text.slice(1) : text);
}

/*  A package.json's text as json; one that is not json refuses the
 *  app, naming the file  */
function package_json_of(f, text)
{
    try {
        return parse_json(text);
    } catch(e) {
        throw new Error(`${f}: not json (${e.message}) -- not raised, not deployed`);
    }
}

/************************************************************
 *  The versions a package.json text of the history carries: its
 *  "version", or, in a text that is not json (a commit with a stray
 *  comma, or with conflict markers), every "version" its lines hold.
 *  Such a state is read, not refused: up to gobj-ui 7.26.46 one broken
 *  commit anywhere in the history refused the app on every round for
 *  ever. Nor is it skipped: npm cannot build from it, but the fix can
 *  have been built and shipped before it was committed, and this text
 *  is then the only record of the number that went out with its range.
 *  Read by its lines it can only raise a version once more than needed,
 *  never deploy a new bundle under an old number.
 ************************************************************/
function versions_of(text)
{
    try {
        const v = parse_json(text).version;
        return [typeof v === "string"? v : null];
    } catch(e) {
        return [...text.matchAll(/"version"\s*:\s*"([^"]*)"/g)].map((m) => m[1]);
    }
}

/************************************************************
 *  Every state of a file in the history of HEAD (and of MERGE_HEAD
 *  in a merge not yet committed): {texts, births}, each text what some
 *  commit left there, each birth {text, parents} a commit where the
 *  file appeared with no rename git sees (a root commit has nothing
 *  before it, and is no birth to ask about). `--full-history`: every branch merged in, and a
 *  merge that differs from all its parents (two sides combined) is a
 *  state of its own. A RENAME is followed to the old name, from the
 *  parent of the commit that made it: up to gobj-ui 7.26.45 a
 *  package.json moved was taken for one born with its range, and a
 *  range raised by hand before the move went out under the old number.
 *
 *  A SHALLOW clone holds part of the history: the reading goes on as
 *  long as what is cut away cannot matter, which is when the oldest
 *  state it holds does not carry the range yet (a clone of depth 2
 *  holding the commit before the raise is read). A state that carries
 *  it at the cut throws, and says how to get the rest.
 ************************************************************/
function range_history(dir, file)
{
    const top = run("git", ["rev-parse", "--show-toplevel"], dir).trim();
    const prefix = run("git", ["rev-parse", "--show-prefix"], dir).trim();
    const git = (args, input) => execFileSync("git", args, {
        cwd: top, env: child_env(), input: input, maxBuffer: 1 << 28,
        stdio: ["pipe", "pipe", "pipe"]
    });

    const shallow_file = resolve(top, run("git", ["rev-parse", "--git-path", "shallow"], top).trim());
    const cut = new Set(existsSync(shallow_file)?
        readFileSync(shallow_file, "utf8").split("\n").filter((h) => h.length > 0) : []);

    let revs = ["HEAD"];
    try {
        revs.push(run("git", ["rev-parse", "-q", "--verify", "MERGE_HEAD"], top).trim());
    } catch(e) {
        /*  no merge in progress  */
    }

    let roots = null;
    const other_root = (c) => {
        if(roots === null) {
            roots = String(git(["rev-list", "--max-parents=0", ...revs])).split("\n").filter((h) => h.length > 0);
        }
        return roots.some((r) => r !== c);
    };

    const texts = [];
    const births = [];
    const walked = new Set();
    const walk = (path, from) => {
        const key = `${path}\0${from.join(" ")}`;
        if(walked.has(key)) {
            return;
        }
        walked.add(key);
        const commits = String(git(["log", "--full-history", "--format=%H %P", ...from,
                                    "--", `:(top,literal)${path}`]))
            .split("\n").filter((l) => l.length > 0).map((l) => l.split(" ").filter((h) => h.length > 0));
        const blobs = read_blobs(git, commits.flatMap(([c, ...parents]) =>
            [c, ...parents].map((x) => `${x}:${path}`)));
        for(const [c, ...parents] of commits) {
            const text = blobs.get(`${c}:${path}`);
            if(text === null) {
                continue;       // deleted there
            }
            texts.push(text);
            if(parents.length === 0) {
                if(cut.has(c) && range_is_raised(text)) {
                    throw new Error(`a shallow clone: the history before ${c.slice(0, 10)} is not ` +
                                    `here -- run git fetch --unshallow in ${top}`);
                }
                if(range_is_raised(text) && other_root(c)) {
                    /*  A root of a joined history: the other history is what came before  */
                    births.push({text, parents: [...revs, `^${c}`]});
                }
                continue;       // born there
            }
            if(parents.some((p) => blobs.get(`${p}:${path}`) !== null)) {
                continue;
            }
            let renamed = false;
            for(const p of parents) {
                const old = renamed_from(git, p, c, path);
                if(old !== null) {
                    renamed = true;
                    walk(old, [p]);
                }
            }
            if(!renamed) {
                births.push({text, parents});
            }
        }
    };
    walk(prefix + file, revs);
    return {texts, births};
}

/************************************************************
 *  Every state of EVERY package.json (node_modules left out) in the
 *  history of `parents` (commits, `^c` to leave one's history out)
 *  that depends on the package, as state_of() reads it, kept between
 *  runs (read_history_cache()). Asked
 *  where a package.json is BORN with the range and the version of the
 *  working tree: a rename git does not see as one (a move with many
 *  changes, below -M's 50%; a removal and an addition in two commits; a
 *  copy) leaves the old states under another path, and up to gobj-ui
 *  7.26.46 such a file went out under the number it had shipped with
 *  the old range. Read by version, not by path: a package.json born in
 *  a repository where another app once had that number with another
 *  range (two apps of one repository) has its version raised once more
 *  than needed, which costs a number and nothing else.
 ************************************************************/
function package_states(dir, parents)
{
    if(parents.length === 0) {
        return [];
    }
    const top = run("git", ["rev-parse", "--show-toplevel"], dir).trim();
    const git = (args, input) => execFileSync("git", args, {
        cwd: top, env: child_env(), input: input, maxBuffer: 1 << 28,
        stdio: ["pipe", "pipe", "pipe"]
    });
    const shas = parents.map((p) => p.startsWith("^")?
        "^" + run("git", ["rev-parse", p.slice(1)], top).trim() : run("git", ["rev-parse", p], top).trim());
    const shallow = run("git", ["rev-parse", "--is-shallow-repository"], top).trim() === "true";
    const key = `${PKG_NAME} ${shas.join(" ")}`;
    const cache = shallow? null : read_history_cache();
    if(cache && key in cache.entries && !are_states(cache.entries[key])) {
        console.error(`    ${HISTORY_CACHE}: the entry of ${key} is not a list of states, read again from git`);
        delete cache.entries[key];
    }
    if(cache && key in cache.entries) {
        const kept = cache.entries[key];
        if(Object.keys(cache.entries).at(-1) !== key) {
            delete cache.entries[key];
            cache.entries[key] = kept;
            write_history_cache(cache);
        }
        return kept;
    }
    const raw = String(git(["log", "--full-history", "-m", "--raw", "--no-abbrev", "--no-renames", "--format=",
                            ...shas, "--", ":(top,glob)**/package.json",
                            ":(top,exclude,glob)**/node_modules/**"]));
    const blobs = new Set();
    for(const line of raw.split("\n")) {
        const m = /^:\d+ \d+ [0-9a-f]+ ([0-9a-f]+) /.exec(line);
        if(m && !/^0+$/.test(m[1])) {
            blobs.add(m[1]);
        }
    }
    const states = new Map();
    for(const t of read_blobs(git, [...blobs]).values()) {
        if(t === null) {
            continue;
        }
        const st = state_of(t);
        if(st.specs.length > 0) {
            states.set(JSON.stringify(st), st);
        }
    }
    const out = [...states.values()];
    if(cache) {
        cache.entries[key] = out;
        write_history_cache(cache);
    }
    return out;
}

/************************************************************
 *  What package_states() found, kept between runs: commits do not
 *  change, so the states of the history of a set of commits are the
 *  same on every run. Up to gobj-ui 7.26.48 a package.json born with
 *  the range and the version (a new app, a move git does not see)
 *  read every package.json of the history again on every round while
 *  that range was the current one -- 1.2 s per round on a history of
 *  30 000 commits, against 0.3 s without the search. A shallow clone
 *  is not kept: what it holds grows when it is fetched. A cache that
 *  cannot be read is said, and read again from git.
 *
 *  Kept PER PACKAGE: a state is what one package.json says of THE
 *  package of the round (state_of()), so the key is the package and
 *  the commits. Up to gobj-ui 7.26.50 it was the commits alone, and a
 *  round of the runtime after one of the library on the same HEAD
 *  read the library's states -- "already" for an app whose number had
 *  gone out with the runtime's old range, or a version raised for
 *  nothing. A file of another format (one of those rounds) is not
 *  read, and is written again in this one. The entries used last are
 *  kept, HISTORY_CACHE_ENTRIES of them: a key per birth asked about,
 *  and a key of a long history holds every state it ever had.
 *
 *      {format: HISTORY_CACHE_FORMAT,
 *       entries: {"<package> <sha> ...": [state]}}, oldest first
 ************************************************************/
const HISTORY_CACHE_FORMAT = 2;

/*  Is a kept entry what package_states() returns, a list of
 *  {specs: [string], versions: [string or null]} (null: a package.json
 *  with no version of text)? Anything else is a miss: up to gobj-ui
 *  7.26.54 `[null]` refused the app on every round, and up to 7.26.56
 *  an entry it had written itself was refused on every round  */
function are_states(v)
{
    const strings = (list) => Array.isArray(list) && list.every((x) => typeof x === "string");
    const versions = (list) => Array.isArray(list) && list.every((x) => typeof x === "string" || x === null);
    return Array.isArray(v) && v.every((st) => st !== null && typeof st === "object" && !Array.isArray(st)
        && strings(st.specs) && versions(st.versions));
}
const HISTORY_CACHE_ENTRIES = 64;

function read_history_cache()
{
    const empty = {format: HISTORY_CACHE_FORMAT, entries: {}};
    if(!existsSync(HISTORY_CACHE)) {
        return empty;
    }
    try {
        const jn = parse_json(readFileSync(HISTORY_CACHE, "utf8"));
        if(!jn || typeof jn !== "object" || Array.isArray(jn)) {
            console.error(`    ${HISTORY_CACHE}: not a json object, read again from git`);
        } else if(jn.format !== HISTORY_CACHE_FORMAT || !jn.entries || typeof jn.entries !== "object"
                  || Array.isArray(jn.entries)) {
            console.error(`    ${HISTORY_CACHE}: kept by a round of another format, read again from git`);
        } else {
            return {format: HISTORY_CACHE_FORMAT, entries: jn.entries};
        }
    } catch(e) {
        console.error(`    ${HISTORY_CACHE}: ${String(e.message).split("\n")[0]}, read again from git`);
    }
    return empty;
}

function write_history_cache(cache)
{
    const keys = Object.keys(cache.entries);
    const entries = {};
    for(const k of keys.slice(Math.max(keys.length - HISTORY_CACHE_ENTRIES, 0))) {
        entries[k] = cache.entries[k];
    }
    try {
        mkdirSync(dirname(HISTORY_CACHE), {recursive: true});
        const tmp = `${HISTORY_CACHE}.${process.pid}`;
        writeFileSync(tmp, JSON.stringify({format: HISTORY_CACHE_FORMAT, entries}));
        renameSync(tmp, HISTORY_CACHE);
    } catch(e) {
        console.error(`    ${HISTORY_CACHE}: not written (${String(e.message).split("\n")[0]})`);
    }
}

/*  The texts of `<commit>:<path>` specs, in one `git cat-file`: a Map
 *  spec -> text, null when the path is not in that commit  */
function read_blobs(git, specs)
{
    const out = new Map();
    if(specs.length === 0) {
        return out;
    }
    const buf = git(["cat-file", "--batch"], specs.join("\n") + "\n");
    let pos = 0;
    for(const spec of specs) {
        const eol = buf.indexOf(10, pos);
        const header = buf.subarray(pos, eol).toString("utf8").split(" ");
        pos = eol + 1;
        if(header[header.length - 1] === "missing") {
            out.set(spec, null);
            continue;
        }
        const size = Number(header[2]);
        out.set(spec, (header[1] === "blob")? buf.subarray(pos, pos + size).toString("utf8") : null);
        pos += size + 1;
    }
    return out;
}

/*  The path `path` of `commit` had in its parent `parent` when the
 *  commit renamed it, or null  */
function renamed_from(git, parent, commit, path)
{
    const fields = String(git(["diff", "-z", "--name-status", "-M", parent, commit])).split("\0");
    for(let i = 0; i < fields.length; i++) {
        if(/^R\d*$/.test(fields[i])) {
            if(fields[i + 2] === path) {
                return fields[i + 1];
            }
            i += 2;
        } else if(/^C\d*$/.test(fields[i])) {
            i += 2;
        } else if(/^[A-Z]\d*$/.test(fields[i])) {
            i += 1;
        }
    }
    return null;
}

/************************************************************
 *  The command that tests an app: what its manifest entry names
 *  (`test`: an argv array, or false for none), else its own
 *  `npm test` if it has one.
 ************************************************************/
function test_command(c)
{
    if(c.test === false) {
        return null;
    }
    if(Array.isArray(c.test)) {
        return c.test;
    }
    const f = join(c.path, "package.json");
    if(!existsSync(f)) {
        return null;
    }
    const scripts = package_json_of(f, readFileSync(f, "utf8")).scripts || {};
    return scripts.test? ["npm", "test"] : null;
}

/*  One target's failure does not end the round: the other seven
 *  hosts are not to blame, and a report that lists what is live is
 *  worth more than a stack trace where the loop stopped.  */
function do_round(c)
{
    console.log(`\n=== ${c.name}`);
    if(!existsSync(c.path)) {
        console.log("    absent on this machine -- skipped");
        return {name: c.name, urls: c.urls || [], worktree: c.worktree, state: "skipped"};
    }
    const refused = c.demo? demo_problem() : null;
    if(refused) {
        console.log(`    NOT DEPLOYED: ${refused}`);
        return {name: c.name, urls: c.urls || [], path: c.path, worktree: c.worktree, state: "refused",
                why: refused};
    }

    try {
        if(!c.worktree) {
            const dirs = Array.isArray(c.range_dirs)? c.range_dirs : [c.path];
            const plan = [
                ...dirs.map((d) => plan_raise(join(d, "package.json"), true)),
                ...(c.range_files || []).map((rf) => plan_raise(rf.startsWith("/")? rf : join(c.path, rf), false))
            ];
            for(const p of plan) {
                for(const note of p.notes) {
                    console.log(`    ${note}`);
                }
                if(p.after !== null) {
                    write_file(p.f, p.after);
                }
                const range = p.range_raised? "raised" : "already";
                const and_version = (!p.range_raised && p.after !== null)? ", version raised" : "";
                console.log(`    range  ${range} ^${VERSION}${and_version}  (${p.f})`);
            }
            if(c.install !== false) {
                for(const d of dirs) {
                    console.log(`    install ${d}`);
                    run_step("npm", ["install"], d);
                }
            }
        }

        const build = Array.isArray(c.build)? c.build : ["npm", "run", "build"];
        console.log(`    build  ${build.join(" ")}`);
        run_step(build[0], build.slice(1), c.path);

        /*  After the build: a suite may test what the build produced
         *  (yunomusica's runs against dist/).  */
        const test = test_command(c);
        if(test) {
            console.log(`    test   ${test.join(" ")}`);
            run_step(test[0], test.slice(1), c.path, c.test_env);
        } else {
            console.log("    test   none declared");
        }

        for(const cmd of c.deploys) {
            console.log(`    deploy ${cmd.join(" ")}`);
            run_step(cmd[0], cmd.slice(1), c.path);
        }
    } catch(e) {
        /*  What the step said is above, whole; this names the step.  */
        console.log(`    FAILED: ${String(e.message).split("\n")[0]}`);
        return {name: c.name, urls: c.urls || [], path: c.path, worktree: c.worktree, state: "failed"};
    }
    return {name: c.name, urls: c.urls || [], path: c.path, worktree: c.worktree, state: "deployed"};
}

/*  Why the demo must not go out, or null: it is built from the working
 *  trees of this repo AND of the sibling gobj-js (test-app/vite.config.js
 *  bundles ../../gobj-js/src), so each must be clean and at the commit
 *  origin/main holds now (asked of the remote, not of a local ref that
 *  may be old)  */
function demo_problem()
{
    return tree_problem(ROOT) || tree_problem(resolve(ROOT, "..", "gobj-js"));
}

/*  The files `git status` does not look at -- marked assume-unchanged
 *  (a lower-case tag: also every file under core.ignoreStat) or
 *  skip-worktree (`S`: also what a sparse checkout leaves out) -- whose
 *  bytes on disk are not the blob of the index. A mark alone is no
 *  change, and a file that is not on disk (out of a sparse cone) is
 *  not built from. Hashed as `git add` would (its filters applied).  */
function changed_behind_marks(dir)
{
    let marked = [];
    for(const entry of run("git", ["ls-files", "-v", "-s", "-z"], dir).split("\0")) {
        const m = /^([a-z]|S) (\d+) ([0-9a-f]+) \d\t(.*)$/s.exec(entry);
        if(!m || m[2] === "160000" || m[2] === "120000") {
            continue;       /*  not marked, a gitlink or a symlink  */
        }
        if(existsSync(join(dir, m[4]))) {
            marked.push({path: m[4], blob: m[3]});
        }
    }
    if(!marked.length) {
        return [];
    }
    const hashes = execFileSync("git", ["hash-object", "--stdin-paths"], {
        cwd: dir, encoding: "utf8", env: child_env(),
        input: marked.map((f) => f.path).join("\n") + "\n",
        stdio: ["pipe", "pipe", "pipe"]
    }).trim().split("\n");
    return marked.filter((f, i) => hashes[i] !== f.blob).map((f) => f.path);
}

function tree_problem(dir)
{
    const rule = "the demo goes out only from clean trees at origin/main";
    let top;
    let changes;
    let hidden;
    let head;
    let main;
    if(!existsSync(dir) || !statSync(dir).isDirectory()) {
        return `there is no ${basename(dir)} directory at ${dir}: ${rule}`;
    }
    try {
        top = run("git", ["rev-parse", "--show-toplevel"], dir).trim();
        /*  An fsmonitor hook answers for `git status`: it is not asked  */
        changes = run("git", ["-c", "core.fsmonitor=false", "status", "--porcelain",
                              "--untracked-files=all"], dir).trim();
        hidden = changed_behind_marks(dir);
        head = run("git", ["rev-parse", "HEAD"], dir).trim();
    } catch(e) {
        return `${dir} is not a git tree it can read (${String(e.message).split("\n")[0]})`;
    }
    /*  A copy with no .git inside another repo: git would answer for that one  */
    if(top !== realpathSync(dir)) {
        return `${dir} is not the top of its own git tree (git answers for ${top}): ${rule}`;
    }
    if(changes) {
        return `changes in the working tree of ${dir} (${changes.split("\n").length} file(s), ` +
               `\`git status\`): ${rule}`;
    }
    if(hidden.length) {
        return `${hidden.length} changed file(s) of ${dir} marked assume-unchanged or ` +
               `skip-worktree (\`git ls-files -v\`), which \`git status\` does not look at ` +
               `(${hidden.slice(0, 3).join(", ")}): ${rule}`;
    }
    try {
        main = run("git", ["ls-remote", "origin", "refs/heads/main"], dir).split(/\s/)[0];
    } catch(e) {
        main = "";
    }
    if(!main) {
        return `cannot read origin/main of ${dir}: ${rule}`;
    }
    if(main !== head) {
        return `HEAD ${head.slice(0, 12)} of ${dir} is not origin/main ${main.slice(0, 12)}: ${rule}`;
    }
    return null;
}

/************************************************************
 *  Is the local build one of THIS version?
 *
 *  The read-back compares the live bundle with `dist/`, and `dist/`
 *  is only this round's build if the build ran. A build that fails in
 *  `prebuild` (validate-locales) stops before vite writes anything, so
 *  `dist/` still holds the PREVIOUS build -- the one the host is
 *  serving -- and the comparison says OK. Three consumers stayed two
 *  rounds behind that way with an OK beside each.
 *
 *  So a consumer's `dist/` has to be newer than the dependency tree it
 *  was built from. `node_modules/.package-lock.json` is what npm
 *  rewrites when it changes that tree; the installed package's own
 *  files are no clock, npm packs them with a fixed 1985 date.
 *
 *  Returns what is wrong, or null. The demo builds from the working
 *  tree and has neither question to answer.
 ************************************************************/
function local_build_problem(entry)
{
    if(entry.worktree || !entry.path) {
        return null;
    }
    const nm = join(entry.path, "node_modules");
    const pkg = join(nm, ...PKG_NAME.split("/"), "package.json");
    const tree = join(nm, ".package-lock.json");
    const index = join(entry.path, "dist", "index.html");
    if(!existsSync(pkg)) {
        return null;    /*  resolved from elsewhere: nothing to judge here  */
    }
    const installed = JSON.parse(readFileSync(pkg, "utf8")).version;
    if(installed !== VERSION) {
        return `BEHIND (installed ${PKG_NAME} ${installed})`;
    }
    if(!existsSync(index)) {
        return "NOT BUILT (no dist/index.html)";
    }
    if(existsSync(tree) && statSync(index).mtimeMs < statSync(tree).mtimeMs) {
        return `NOT REBUILT (dist/ is older than the install of ${PKG_NAME} ${installed})`;
    }
    return null;
}

/************************************************************
 *  Read back what each host actually serves
 ************************************************************/
function verify(entry)
{
    const local = local_bundle(entry.path || "");
    const problem = (entry.state === "failed")? "FAILED in this round" :
                    (entry.state === "refused")? `NOT DEPLOYED (${entry.why})` :
                                                local_build_problem(entry);
    const rows = [];
    if(!(entry.urls || []).length) {
        /*  A template: built (its check), nothing to serve.  */
        rows.push({name: entry.name, url: "(no host)", state: problem || "OK"});
        return rows;
    }
    for(const url of (entry.urls || [])) {
        const live = entry_bundle(curl(url));
        let state;
        if(!live) {
            state = "UNREACHABLE";
        } else if(problem) {
            state = `${problem} -- still serving ${live}`;
        } else if(!local) {
            state = `live ${live}`;
        } else {
            state = (live === local)? "OK" : `STALE (live ${live}, built ${local})`;
        }
        rows.push({name: entry.name, url: url, state: state});
    }
    return rows;
}

/************************************************************
 *  Main
 ************************************************************/
let targets = [...read_consumers(), DEMO];
if(ONLY) {
    const all = targets;
    targets = targets.filter((c) => c.name === ONLY);
    if(!targets.length) {
        const names = all.map((c) => c.demo? `${c.name} (the demo)` : c.name);
        console.error(`no target named "${ONLY}"; the targets are: ${names.join(", ")}`);
        process.exit(2);
    }
}

console.log(`\n${PKG_NAME} ${VERSION} -- ${targets.length} target(s), ` +
            `${targets.reduce((n, c) => n + (c.urls || []).length, 0)} vhost(s)\n`);

const done = [];
if(CHECK_ONLY) {
    for(const c of targets) {
        done.push({name: c.name, urls: c.urls || [], path: c.path, worktree: c.worktree, state: "checked"});
    }
} else {
    if(!NO_WAIT && targets.some((c) => !c.worktree)) {
        const why = wait_for_registry();
        if(why) {
            console.error(`${why} -- stopping`);
            process.exit(1);
        }
    }
    for(const c of targets) {
        done.push(do_round(c));
    }
}

console.log("\n--- what each host serves ---");
let bad = 0;
for(const entry of done) {
    for(const row of verify(entry)) {
        if(row.state !== "OK") {
            bad++;
        }
        console.log(`  ${row.state === "OK"? "OK  " : "!!  "} ${row.name.padEnd(16)} ${row.url.padEnd(38)} ${row.state}`);
    }
}
console.log("");
process.exitCode = bad? 1 : 0;
