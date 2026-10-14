/***********************************************************************
 *          deploy-round.test.js
 *
 *      The deploy round's raise of the range and of the app's version,
 *      on fake consumers in a temp dir, through a manifest of a fake
 *      HOME. Nothing is installed, built or deployed: each target builds
 *      with `true`, tests nothing, deploys nothing and has no host.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {describe, test, expect} from "vitest";
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, chmodSync} from "node:fs";
import {join, dirname, delimiter} from "node:path";
import {tmpdir} from "node:os";
import {spawnSync, execFileSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "deploy-round.mjs");
const PKG = JSON.parse(readFileSync(join(dirname(SCRIPT), "..", "package.json"), "utf8"));
const VERSION = PKG.version;
const [MAJOR, MINOR, PATCH] = VERSION.split(".").map(Number);
const OLDER = `${MAJOR}.${MINOR}.${PATCH - 1}`;
const NEWER = `${MAJOR}.${MINOR}.${PATCH + 8}`;

function package_json(name, version, deps)
{
    return JSON.stringify({name, version, dependencies: deps}, null, 4) + "\n";
}

/*  A consumer dir holding a package.json; `git`: committed in a repo of its own  */
function consumer(root, name, version, deps, git = false)
{
    let dir = join(root, name);
    mkdirSync(dir, {recursive: true});
    writeFileSync(join(dir, "package.json"), package_json(name, version, deps));
    if(git) {
        execFileSync("git", ["init", "-q"], {cwd: dir});
        commit(dir, "init");
    }
    return dir;
}

function commit(dir, msg)
{
    execFileSync("git", ["add", "-A"], {cwd: dir});
    execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", msg], {cwd: dir});
}

function edit(dir, fn)
{
    let f = join(dir, "package.json");
    let pkg = JSON.parse(readFileSync(f, "utf8"));
    fn(pkg);
    writeFileSync(f, JSON.stringify(pkg, null, 4) + "\n");
}

function read(dir)
{
    return JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
}

/*  Run the round on ONE target of a fake manifest  */
function round(root, target, args = ["--no-wait"], env = {})
{
    let home = join(root, "home");
    mkdirSync(join(home, ".yuneta"), {recursive: true});
    let entry = Object.assign({install: false, build: ["true"], test: false, deploys: [], urls: []}, target);
    writeFileSync(join(home, ".yuneta", "gobj-ui-consumers.json"), JSON.stringify({consumers: [entry]}));
    let r = spawnSync(process.execPath, [SCRIPT, "--only", target.name, ...args], {
        encoding: "utf8", timeout: 60000,
        env: Object.assign({}, process.env, {HOME: home}, env)
    });
    return {status: r.status, out: r.stdout + r.stderr};
}

describe("deploy-round: the range and the version", () => {
    test("a raise refused in one package.json leaves every package.json of the app as it was", () => {
        let root = mkdtempSync(join(tmpdir(), "dr-"));
        let m1 = consumer(root, "m1", "2.0.0", {"@yuneta/gobj-ui": `^${OLDER}`});
        let m2 = consumer(root, "m2", "1.0.0", {"other": "^1.0.0"});
        let before = readFileSync(join(m1, "package.json"), "utf8");
        let r = round(root, {name: "multi", path: m1, range_dirs: [m1, m2]});
        expect(r.out).toContain(`${join(m2, "package.json")} does not depend on @yuneta/gobj-ui`);
        expect(r.out).toMatch(/FAILED in this round/);
        expect(readFileSync(join(m1, "package.json"), "utf8")).toBe(before);
        expect(r.out).not.toMatch(/version 2\.0\.0 -> 2\.0\.1/);
    });

    test("a range AHEAD of the version is refused, never lowered", () => {
        let root = mkdtempSync(join(tmpdir(), "dr-"));
        let dir = consumer(root, "ahead", "3.0.0", {"@yuneta/gobj-ui": `^${NEWER}`});
        let before = readFileSync(join(dir, "package.json"), "utf8");
        let r = round(root, {name: "ahead", path: dir});
        expect(r.out).toContain(`@yuneta/gobj-ui "^${NEWER}" is AHEAD of ${VERSION}`);
        expect(r.out).toMatch(/FAILED in this round/);
        expect(readFileSync(join(dir, "package.json"), "utf8")).toBe(before);
    });

    test("a registry serving a NEWER version stops the round at once, and says the tree is behind", () => {
        let root = mkdtempSync(join(tmpdir(), "dr-"));
        let bin = join(root, "bin");
        mkdirSync(bin);
        writeFileSync(join(bin, "npm"), `#!/bin/sh\necho ${NEWER}\n`);
        chmodSync(join(bin, "npm"), 0o755);
        let dir = consumer(root, "app", "1.0.0", {"@yuneta/gobj-ui": `^${OLDER}`});
        let t0 = Date.now();
        let r = round(root, {name: "app", path: dir}, [], {PATH: bin + delimiter + process.env.PATH});
        expect(Date.now() - t0).toBeLessThan(20000);
        expect(r.status).toBe(1);
        expect(r.out).toContain(`the registry serves @yuneta/gobj-ui ${NEWER}, NEWER than ${VERSION}`);
        expect(r.out).not.toMatch(/not serving this version yet/);
        expect(read(dir).dependencies["@yuneta/gobj-ui"]).toBe(`^${OLDER}`);
    }, 30000);

    test("a range raised BY HAND raises the version in the round; one the round raised is not raised twice", () => {
        let root = mkdtempSync(join(tmpdir(), "dr-"));
        /*  Raised by hand, not committed, the version left  */
        let hand = consumer(root, "hand", "4.0.0", {"@yuneta/gobj-ui": `^${OLDER}`}, true);
        edit(hand, (p) => {
            p.dependencies["@yuneta/gobj-ui"] = `^${VERSION}`;
        });
        let r = round(root, {name: "hand", path: hand});
        expect(r.out).toContain("version 4.0.0 -> 4.0.1");
        expect(read(hand).version).toBe("4.0.1");
        /*  ...and the round run again leaves it  */
        r = round(root, {name: "hand", path: hand});
        expect(r.out).toMatch(/range {2}already/);
        expect(read(hand).version).toBe("4.0.1");

        /*  Raised by hand and COMMITTED, the version left  */
        let committed = consumer(root, "committed", "5.0.0", {"@yuneta/gobj-ui": `^${OLDER}`}, true);
        edit(committed, (p) => {
            p.dependencies["@yuneta/gobj-ui"] = `^${VERSION}`;
        });
        commit(committed, "raise by hand");
        r = round(root, {name: "committed", path: committed});
        expect(read(committed).version).toBe("5.0.1");

        /*  Raised by the round and committed with its version: nothing to do  */
        let done = consumer(root, "done", "6.0.0", {"@yuneta/gobj-ui": `^${OLDER}`}, true);
        round(root, {name: "done", path: done});
        expect(read(done).version).toBe("6.0.1");
        commit(done, "the round");
        r = round(root, {name: "done", path: done});
        expect(r.out).toMatch(/range {2}already/);
        expect(read(done).version).toBe("6.0.1");

        /*  Two apps sharing a package.json: the second one finds it raised  */
        let common = consumer(root, "common", "0.5.0", {"@yuneta/gobj-ui": `^${OLDER}`}, true);
        let a = consumer(root, "a", "0.7.0", {"@yuneta/gobj-ui": `^${OLDER}`}, true);
        let b = consumer(root, "b", "0.8.0", {"@yuneta/gobj-ui": `^${OLDER}`}, true);
        round(root, {name: "a", path: a, range_dirs: [a, common]});
        round(root, {name: "b", path: b, range_dirs: [b, common]});
        expect([read(a).version, read(b).version, read(common).version]).toEqual(["0.7.1", "0.8.1", "0.5.1"]);
    });

    test("a range already raised is held to the same rules: a version that is not x.y.z refuses the app", () => {
        let root = mkdtempSync(join(tmpdir(), "dr-"));
        let dir = consumer(root, "tmpl", "{{version}}", {"@yuneta/gobj-ui": `^${VERSION}`}, true);
        let r = round(root, {name: "tmpl", path: dir});
        expect(r.out).toContain("version '{{version}}' is not x.y.z -- not raised, not deployed");
        expect(r.out).toMatch(/FAILED in this round/);
    });

    test("an already raised package.json whose history cannot be read is refused, not deployed under its old number", () => {
        let root = mkdtempSync(join(tmpdir(), "dr-"));
        let dir = consumer(root, "loose", "1.2.3", {"@yuneta/gobj-ui": `^${VERSION}`});      // no git
        let r = round(root, {name: "loose", path: dir});
        expect(r.out).toMatch(/cannot tell whether its version was raised with the range/);
        expect(r.out).toMatch(/FAILED in this round/);
        expect(read(dir).version).toBe("1.2.3");
    });
});
