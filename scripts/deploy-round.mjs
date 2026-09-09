/***********************************************************************
 *          deploy-round.mjs
 *
 *          The deploy loop of a gobj-ui round, as ONE command.
 *
 *          A published version reaches an app only through this loop:
 *          wait for the registry, raise the range, install, build,
 *          deploy, then read back what the host actually serves. Run by
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
 *          The other consumers are private repositories on this machine,
 *          so they are read from `~/.yuneta/gobj-ui-consumers.json`
 *          (see `gobj-ui-consumers.example.json`) and nothing about them
 *          is committed here.
 *
 *          Usage:
 *              node scripts/deploy-round.mjs            # the whole loop
 *              node scripts/deploy-round.mjs --check    # only read what is live
 *              node scripts/deploy-round.mjs --only gui_treedb
 *              node scripts/deploy-round.mjs --no-wait  # skip the registry wait
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {execFileSync} from "node:child_process";
import {readFileSync, existsSync} from "node:fs";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {homedir} from "node:os";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PKG = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
const VERSION = PKG.version;
const MANIFEST = join(homedir(), ".yuneta", "gobj-ui-consumers.json");

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
    process.stdout.write(`registry: waiting for @yuneta/gobj-ui@${VERSION} `);
    for(let i = 0; i < 30; i++) {
        let served = "";
        try {
            served = run("npm", ["view", "@yuneta/gobj-ui", "version"]).trim();
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
 *  Raise the range and rewrite the package.json.
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
    const f = join(dir, "package.json");
    if(!existsSync(f)) {
        return false;
    }
    const before = readFileSync(f, "utf8");
    const after = before.replace(/("@yuneta\/gobj-ui":\s*")\^[0-9][^"]*(")/, `$1^${VERSION}$2`);
    if(after === before) {
        return false;
    }
    write_file(f, after);
    return true;
}

/*  One target's failure does not end the round: the other seven
 *  hosts are not to blame, and a report that lists what is live is
 *  worth more than a stack trace where the loop stopped.  */
function do_round(c)
{
    console.log(`\n=== ${c.name}`);
    if(!existsSync(c.path)) {
        console.log("    absent on this machine -- skipped");
        return {name: c.name, urls: c.urls || [], state: "skipped"};
    }

    try {
        if(!c.worktree) {
            const dirs = (c.range_dirs && c.range_dirs.length)? c.range_dirs : [c.path];
            for(const d of dirs) {
                console.log(`    range  ${raise_range(d)? "raised" : "already"} ^${VERSION}  (${d})`);
            }
            for(const d of dirs) {
                console.log(`    install ${d}`);
                run("npm", ["install"], d);
            }
        }

        console.log("    build");
        run("npm", ["run", "build"], c.path);

        for(const cmd of c.deploys) {
            console.log(`    deploy ${cmd.join(" ")}`);
            run(cmd[0], cmd.slice(1), c.path);
        }
    } catch(e) {
        let out = (e.stderr || e.stdout || "").toString().trim().split("\n").slice(-3).join(" | ");
        console.log(`    FAILED: ${out || e.message}`);
        return {name: c.name, urls: c.urls || [], path: c.path, state: "failed"};
    }
    return {name: c.name, urls: c.urls || [], path: c.path, state: "deployed"};
}

/************************************************************
 *  Read back what each host actually serves
 ************************************************************/
function verify(entry)
{
    const local = local_bundle(entry.path || "");
    const rows = [];
    for(const url of (entry.urls || [])) {
        const live = entry_bundle(curl(url));
        let state;
        if(!live) {
            state = "UNREACHABLE";
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

console.log(`\ngobj-ui ${VERSION} -- ${targets.length} target(s), ` +
            `${targets.reduce((n, c) => n + (c.urls || []).length, 0)} vhost(s)\n`);

const done = [];
if(CHECK_ONLY) {
    for(const c of targets) {
        done.push({name: c.name, urls: c.urls || [], path: c.path, state: "checked"});
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
