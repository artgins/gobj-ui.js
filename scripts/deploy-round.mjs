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
 *          git history of the package.json says which: the version
 *          before the commit whose parent had ANOTHER range. One whose
 *          history cannot be read is refused, a shallow clone too (it may
 *          not hold that parent). Up to gobj-ui 7.26.42 "already" was
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
 *              node scripts/deploy-round.mjs --no-wait  # skip the registry wait
 *              node scripts/deploy-round.mjs --pkg @yuneta/gobj-js
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {execFileSync} from "node:child_process";
import {readFileSync, existsSync, statSync} from "node:fs";
import {basename, dirname, join, resolve} from "node:path";
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
    return {text: text.replace(at, `$1${next}$2`), note: `version ${version} -> ${next}  (${f})`};
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
 *    - it is committed: raised with it when the version differs from
 *      the one before the commit that brought the range (a package.json
 *      born with the range carries a version of its own). The commit
 *      that brought it is the newest one whose parent has ANOTHER
 *      range: a commit that only reformats the line touches it too, and
 *      up to gobj-ui 7.26.44 it was taken for the one, so a round run
 *      again raised the version a second time.
 *
 *  A version that is not x.y.z, or a history it cannot read, refuses
 *  the app: "already" would deploy a new bundle under a number that
 *  may be the old one. A SHALLOW clone is such a history: the commit
 *  before the one that brought the range may not be there, and up to
 *  gobj-ui 7.26.44 a parent missing was taken for "born with the
 *  range" -- a range raised by hand went out under the old number.
 ************************************************************/
function version_raised_with_range(f)
{
    const dir = dirname(f);
    const rel = "./" + basename(f);
    const version = JSON.parse(readFileSync(f, "utf8")).version;
    if(!/^\d+\.\d+\.\d+$/.test(version || "")) {
        throw new Error(`${f}: version '${version}' is not x.y.z -- not raised, not deployed`);
    }
    const git = (git_args) => run("git", git_args, dir);
    try {
        const raised = (text) => {
            const specs = specs_of(text);
            return specs.length > 0 && specs.every((spec) => spec === `^${VERSION}`);
        };
        const head = git(["show", `HEAD:${rel}`]);
        if(!raised(head)) {
            return version !== JSON.parse(head).version;
        }
        if(git(["rev-parse", "--is-shallow-repository"]).trim() !== "false") {
            throw new Error("a shallow clone: the history of the range is cut");
        }
        const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const touching = git(["log", "--format=%H", "-G",
                              `"${esc(PKG_NAME)}":[[:space:]]*"${esc("^" + VERSION)}"`, "--", rel])
            .split("\n").filter((h) => h.length > 0);
        for(const commit of touching) {
            const parents = git(["rev-list", "--parents", "-n", "1", commit]).trim().split(" ");
            if(parents.length < 2 || git(["ls-tree", "--name-only", `${commit}^`, "--", rel]).trim() === "") {
                return true;    // born with the range: no number of it went out with another one
            }
            const before = git(["show", `${commit}^:${rel}`]);
            if(!raised(before)) {
                return version !== JSON.parse(before).version;
            }
        }
        throw new Error("no commit brought the range");
    } catch(e) {
        throw new Error(`${f}: its range is already ^${VERSION}, and the round cannot tell whether its ` +
                        `version was raised with the range (${String(e.message).split("\n")[0]}) -- ` +
                        `not raised, not deployed`);
    }
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
