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
 *          version, a `~`, a `^1.x` that a v2 version would rewrite), and
 *          a package version that is not x.y.z. The app is reported
 *          FAILED and left as it was.
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
 *              node scripts/deploy-round.mjs --no-wait  # skip the registry wait
 *              node scripts/deploy-round.mjs --pkg @yuneta/gobj-js
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {execFileSync} from "node:child_process";
import {readFileSync, existsSync, statSync} from "node:fs";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {homedir} from "node:os";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST = join(homedir(), ".yuneta", "gobj-ui-consumers.json");

/*
 *  The package this round is for, and the source tree its version is
 *  read from. The runtime is a SIBLING submodule of this one
 *  (kernel/js/gobj-js next to kernel/js/gobj-ui), which is what makes
 *  the version readable at all -- the registry would answer the version
 *  it is already serving, which is precisely what the wait below exists
 *  to stop trusting.
 */
const PKG_NAME = (() => {
    const i = process.argv.indexOf("--pkg");
    return i >= 0? process.argv[i + 1] : "@yuneta/gobj-ui";
})();
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
 */
const DEMO = {
    name: "test-app",
    path: join(ROOT, "test-app"),
    worktree: true,                     /*  no range to raise  */
    deploys: [["./deploy.sh", "--no-build"], ["./deploy.sh", "niyamaka.com", "--no-build"]],
    urls: ["https://demo.yuneta.io/", "https://niyamaka.com/"],
};

const args = process.argv.slice(2);
const CHECK_ONLY = args.includes("--check");
const NO_WAIT = args.includes("--no-wait");
const ONLY = (() => {
    const i = args.indexOf("--only");
    return i >= 0? args[i + 1] : null;
})();

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
    const jn = JSON.parse(readFileSync(MANIFEST, "utf8"));
    return jn.consumers || [];
}

/************************************************************
 *  Wait for the registry to SERVE the version.
 *
 *  `npm publish` returning is not the same as `npm install` finding it:
 *  a consumer installed in that window silently keeps the version
 *  before.
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
            return true;
        }
        process.stdout.write(".");
        execFileSync("sleep", ["5"]);
    }
    console.log(" TIMEOUT");
    return false;
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

function raise_range(dir)
{
    return raise_range_in(join(dir, "package.json"), true);
}

/*  `bump`: raise the package's own version too. A template's file has
 *  a marker for a version, and is raised without.  */
function raise_range_in(f, bump)
{
    if(!existsSync(f)) {
        throw new Error(`${f}: not there`);
    }
    const before = readFileSync(f, "utf8");
    const name = PKG_NAME.replace("/", "\\/");

    /*  Every spec it carries for the package -- gobj-ui declares the
     *  runtime TWICE, as a peer and as a devDependency, and a consumer
     *  may too -- must be a caret range of the version's major: that is
     *  the one shape this round can raise without changing what it
     *  means. An exact or a `~` range used to be taken for "already"
     *  and deployed unraised; a `^1.x` would be rewritten to v2.  */
    const specs = [...before.matchAll(new RegExp(`"${name}":\\s*"([^"]*)"`, "g"))].map(m => m[1]);
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
    }

    const re = new RegExp(`("${name}":\\s*")\\^[0-9][^"]*(")`, "g");
    let after = before.replace(re, `$1^${VERSION}$2`);
    if(after === before) {
        return false;
    }
    if(bump) {
        after = bump_patch_version(f, after);
    }
    write_file(f, after);
    return true;
}

/************************************************************
 *  The third number of the package's own version, up by one, in
 *  the text of its package.json (its formatting kept). A version
 *  that is not x.y.z refuses the app: a new bundle under the old
 *  number is what the bump exists to prevent (the js_gui template
 *  leaves a literal "{{version}}").
 ************************************************************/
function bump_patch_version(f, text)
{
    const version = JSON.parse(text).version;
    const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(version || "");
    if(!m) {
        throw new Error(`${f}: version '${version}' is not x.y.z -- not raised, not deployed`);
    }
    const next = `${m[1]}.${m[2]}.${Number(m[3]) + 1}`;
    const at = new RegExp(`("version":\\s*")${version.replace(/\./g, "\\.")}(")`);
    if(!at.test(text)) {
        throw new Error(`${f}: no "version": "${version}" in its text -- not raised, not deployed`);
    }
    console.log(`    version ${version} -> ${next}  (${f})`);
    return text.replace(at, `$1${next}$2`);
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
    const scripts = JSON.parse(readFileSync(f, "utf8")).scripts || {};
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

    try {
        if(!c.worktree) {
            const dirs = Array.isArray(c.range_dirs)? c.range_dirs : [c.path];
            for(const d of dirs) {
                console.log(`    range  ${raise_range(d)? "raised" : "already"} ^${VERSION}  (${d})`);
            }
            for(const rf of (c.range_files || [])) {
                const f = rf.startsWith("/")? rf : join(c.path, rf);
                console.log(`    range  ${raise_range_in(f, false)? "raised" : "already"} ^${VERSION}  (${f})`);
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
    targets = targets.filter((c) => c.name === ONLY);
    if(!targets.length) {
        console.error(`no target named "${ONLY}"`);
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
        if(!wait_for_registry()) {
            console.error("the registry is not serving this version yet -- stopping");
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
process.exit(bad? 1 : 0);
