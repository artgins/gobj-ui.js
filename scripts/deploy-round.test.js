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
import {describe, test, expect, vi} from "vitest";

/*  Each test spawns node (and git): under a loaded machine 5 s is not enough.  */
vi.setConfig({testTimeout: 30000});
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, chmodSync, existsSync, symlinkSync} from "node:fs";
import {join, dirname, delimiter} from "node:path";
import {tmpdir} from "node:os";
import {spawnSync, execFileSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "deploy-round.mjs");
const PKG = JSON.parse(readFileSync(join(dirname(SCRIPT), "..", "package.json"), "utf8"));
const VERSION = PKG.version;
const [MAJOR, MINOR, PATCH] = VERSION.split(".").map(Number);
/*  An older version of the same major: at x.y.0 the one before is of the minor before  */
const OLDER = PATCH > 0? `${MAJOR}.${MINOR}.${PATCH - 1}` : `${MAJOR}.${MINOR - 1}.99`;
const NEWER = `${MAJOR}.${MINOR}.${PATCH + 8}`;
/*  The runtime, a round of its own (`--pkg @yuneta/gobj-js`) on the same consumers  */
const JS_VERSION = JSON.parse(readFileSync(join(dirname(SCRIPT), "..", "..", "gobj-js", "package.json"), "utf8")).version;
const [JS_MAJOR, JS_MINOR, JS_PATCH] = JS_VERSION.split(".").map(Number);
const JS_OLDER = JS_PATCH > 0? `${JS_MAJOR}.${JS_MINOR}.${JS_PATCH - 1}` : `${JS_MAJOR}.${JS_MINOR - 1}.99`;
const JS_ROUND = ["--no-wait", "--pkg", "@yuneta/gobj-js"];
const CACHE_FORMAT = 2;

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

function git(dir, ...args)
{
    return execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...args],
                        {cwd: dir, encoding: "utf8"}).trim();
}

function merge(dir, branch)
{
    git(dir, "merge", "-q", "--no-edit", branch);
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

    test("a range found already raised says so: the version is what was raised, not the range", () => {
        let root = mkdtempSync(join(tmpdir(), "dr-"));
        let hand = consumer(root, "hand", "4.0.0", {"@yuneta/gobj-ui": `^${OLDER}`}, true);
        edit(hand, (p) => {
            p.dependencies["@yuneta/gobj-ui"] = `^${VERSION}`;
        });
        let r = round(root, {name: "hand", path: hand});
        expect(read(hand).version).toBe("4.0.1");
        expect(r.out).toContain(`range  already ^${VERSION}, version raised  (${join(hand, "package.json")})`);
        expect(r.out).not.toMatch(/range {2}raised/);
    });

    test("a commit that only REFORMATS the range is not the one that brought it: a round run again raises nothing", () => {
        let root = mkdtempSync(join(tmpdir(), "dr-"));
        let dir = consumer(root, "fmt", "6.0.0", {"@yuneta/gobj-ui": `^${OLDER}`}, true);
        round(root, {name: "fmt", path: dir});
        expect(read(dir).version).toBe("6.0.1");
        commit(dir, "the round");
        writeFileSync(join(dir, "package.json"), JSON.stringify(read(dir), null, 2) + "\n");
        commit(dir, "indented by two");
        let r = round(root, {name: "fmt", path: dir});
        expect(r.out).toMatch(/range {2}already/);
        expect(read(dir).version).toBe("6.0.1");
    });

    test("a SHALLOW clone is refused: the commit before the one that brought the range is not there to read", () => {
        let root = mkdtempSync(join(tmpdir(), "dr-"));
        let full = consumer(root, "full", "7.0.0", {"@yuneta/gobj-ui": `^${OLDER}`}, true);
        edit(full, (p) => {
            p.dependencies["@yuneta/gobj-ui"] = `^${VERSION}`;
        });
        commit(full, "raised by hand, the version left");
        let shallow = join(root, "shallow");
        execFileSync("git", ["clone", "-q", "--depth", "1", `file://${full}`, shallow]);
        let r = round(root, {name: "shallow", path: shallow});
        expect(r.out).toMatch(/cannot tell whether its version was raised with the range \(a shallow clone/);
        expect(r.out).toMatch(/FAILED in this round/);
        expect(read(shallow).version).toBe("7.0.0");
        /*  ...the full history of the same commit raises the version  */
        r = round(root, {name: "full", path: full});
        expect(read(full).version).toBe("7.0.1");
    });

    test("a SHALLOW clone that holds the commit before the raise is read; one that does not says how to get it", () => {
        let root = mkdtempSync(join(tmpdir(), "dr-"));
        let full = consumer(root, "full", "7.0.0", {"@yuneta/gobj-ui": `^${OLDER}`}, true);
        edit(full, (p) => {
            p.description = "a commit that does not touch the range";
        });
        commit(full, "another change");
        edit(full, (p) => {
            p.dependencies["@yuneta/gobj-ui"] = `^${VERSION}`;
        });
        commit(full, "raised by hand, the version left");
        let two = join(root, "two");
        execFileSync("git", ["clone", "-q", "--depth", "2", `file://${full}`, two]);
        expect(git(two, "rev-parse", "--is-shallow-repository")).toBe("true");
        let r = round(root, {name: "two", path: two});
        expect(r.out).not.toMatch(/FAILED in this round/);
        expect(read(two).version).toBe("7.0.1");
        let one = join(root, "one");
        execFileSync("git", ["clone", "-q", "--depth", "1", `file://${full}`, one]);
        r = round(root, {name: "one", path: one});
        expect(r.out).toMatch(/a shallow clone.*git fetch --unshallow/);
        expect(r.out).toMatch(/FAILED in this round/);
        expect(read(one).version).toBe("7.0.0");
    });

    test("a MERGE that brings a range raised by hand next to a version already out raises the version", () => {
        let root = mkdtempSync(join(tmpdir(), "dr-"));
        /*  main raises the version with the old range (a bundle that went out),
         *  a branch raises the range by hand: merged either way  */
        for(let into of ["main", "branch"]) {
            let dir = consumer(root, `merge-${into}`, "1.0.0", {"@yuneta/gobj-ui": `^${OLDER}`}, true);
            let main = git(dir, "rev-parse", "--abbrev-ref", "HEAD");
            git(dir, "checkout", "-qb", "branch");
            edit(dir, (p) => {
                p.dependencies["@yuneta/gobj-ui"] = `^${VERSION}`;
            });
            commit(dir, "the range raised by hand");
            git(dir, "checkout", "-q", main);
            edit(dir, (p) => {
                p.version = "1.0.1";
            });
            commit(dir, "1.0.1, with the old range");
            if(into === "main") {
                merge(dir, "branch");
            } else {
                git(dir, "checkout", "-q", "branch");
                merge(dir, main);
            }
            expect(read(dir)).toMatchObject({version: "1.0.1", dependencies: {"@yuneta/gobj-ui": `^${VERSION}`}});
            let r = round(root, {name: `merge-${into}`, path: dir});
            expect(r.out).toContain("version 1.0.1 -> 1.0.2");
            expect(read(dir).version).toBe("1.0.2");
        }

        /*  A range the round raised, lowered by hand and shipped under the same
         *  number, and raised again by a merge of a branch that raised it by hand  */
        let dir = consumer(root, "revert", "2.0.0", {"@yuneta/gobj-ui": `^${OLDER}`}, true);
        let main = git(dir, "rev-parse", "--abbrev-ref", "HEAD");
        git(dir, "checkout", "-qb", "branch");
        edit(dir, (p) => {
            p.dependencies["@yuneta/gobj-ui"] = `^${VERSION}`;
        });
        commit(dir, "the range raised by hand");
        git(dir, "checkout", "-q", main);
        round(root, {name: "revert", path: dir});
        commit(dir, "the round");
        edit(dir, (p) => {
            p.dependencies["@yuneta/gobj-ui"] = `^${OLDER}`;
        });
        commit(dir, "the range lowered, 2.0.1 shipped with it");
        merge(dir, "branch");
        expect(read(dir)).toMatchObject({version: "2.0.1", dependencies: {"@yuneta/gobj-ui": `^${VERSION}`}});
        let r = round(root, {name: "revert", path: dir});
        expect(r.out).toContain("version 2.0.1 -> 2.0.2");
    });

    test("a package.json MOVED after its range was raised by hand is followed to its old name", () => {
        let root = mkdtempSync(join(tmpdir(), "dr-"));
        for(let same_commit of [false, true]) {
            let repo = join(root, `repo-${same_commit}`);
            consumer(repo, "old", "3.0.0", {"@yuneta/gobj-ui": `^${OLDER}`});
            execFileSync("git", ["init", "-q"], {cwd: repo});
            commit(repo, "init");
            if(!same_commit) {
                edit(join(repo, "old"), (p) => {
                    p.dependencies["@yuneta/gobj-ui"] = `^${VERSION}`;
                });
                commit(repo, "the range raised by hand");
            }
            git(repo, "mv", "old", "new");
            if(same_commit) {
                edit(join(repo, "new"), (p) => {
                    p.dependencies["@yuneta/gobj-ui"] = `^${VERSION}`;
                });
            }
            commit(repo, "moved");
            let r = round(root, {name: "moved", path: join(repo, "new")});
            expect(r.out).toContain("version 3.0.0 -> 3.0.1");
            expect(read(join(repo, "new")).version).toBe("3.0.1");
        }
        /*  ...and one BORN with the range is left as it is  */
        let born = consumer(root, "born", "0.1.0", {"@yuneta/gobj-ui": `^${VERSION}`}, true);
        let r = round(root, {name: "born", path: born});
        expect(r.out).toMatch(/range {2}already/);
        expect(read(born).version).toBe("0.1.0");
    });

    test("a state of the history that is not json is read by its text: no refusal for ever, and its version counts", () => {
        let root = mkdtempSync(join(tmpdir(), "dr-"));
        /*  A package.json committed broken (",,") and fixed: the round, committed, run again  */
        let dir = consumer(root, "commas", "1.0.0", {"@yuneta/gobj-ui": `^${OLDER}`}, true);
        let f = join(dir, "package.json");
        writeFileSync(f, readFileSync(f, "utf8").replace(/\n}\n$/, ",,\n}\n"));
        commit(dir, "broken");
        writeFileSync(f, package_json("commas", "1.0.0", {"@yuneta/gobj-ui": `^${OLDER}`}));
        commit(dir, "fixed");
        let r = round(root, {name: "commas", path: dir});
        expect(r.out).toContain("version 1.0.0 -> 1.0.1");
        commit(dir, "the round");
        r = round(root, {name: "commas", path: dir});
        expect(r.out).not.toMatch(/FAILED/);
        expect(r.out).toMatch(/range {2}already/);
        expect(read(dir).version).toBe("1.0.1");

        /*  A commit with conflict markers whose text carries this version beside the old
         *  range, fixed with the range raised by hand: the version is raised  */
        let conflict = consumer(root, "conflict", "2.0.0", {"@yuneta/gobj-ui": `^${OLDER}`}, true);
        f = join(conflict, "package.json");
        writeFileSync(f, readFileSync(f, "utf8").replace(/ {4}"version": "2\.0\.0",\n/,
            "<<<<<<< HEAD\n    \"version\": \"2.0.0\",\n=======\n    \"version\": \"2.0.1\",\n>>>>>>> other\n"));
        commit(conflict, "committed in the middle of a conflict");
        writeFileSync(f, package_json("conflict", "2.0.1", {"@yuneta/gobj-ui": `^${VERSION}`}));
        commit(conflict, "fixed, the range raised by hand");
        r = round(root, {name: "conflict", path: conflict});
        expect(r.out).not.toMatch(/FAILED/);
        expect(r.out).toContain("version 2.0.1 -> 2.0.2");
    });

    test("a package.json that is not json is named in the refusal", () => {
        let root = mkdtempSync(join(tmpdir(), "dr-"));
        let markers = (dir) => {
            let f = join(dir, "package.json");
            writeFileSync(f, readFileSync(f, "utf8").replace(/\n}\n$/, ",\n<<<<<<< HEAD\n=======\n>>>>>>> b\n}\n"));
            return f;
        };
        for(let range of [OLDER, VERSION]) {
            let main = consumer(root, `main-${range}`, "1.0.0", {"@yuneta/gobj-ui": `^${range}`}, true);
            let common = consumer(root, `common-${range}`, "0.1.0", {"@yuneta/gobj-ui": `^${range}`}, true);
            let f = markers(common);
            let r = round(root, {name: `m-${range}`, path: main, range_dirs: [main, common]});
            expect(r.out).toMatch(/FAILED in this round/);
            expect(r.out).toContain(`${f}: not json (`);
        }
        /*  ...and HEAD's, when the round must read it  */
        let head = consumer(root, "head", "1.0.0", {"@yuneta/gobj-ui": `^${OLDER}`}, true);
        let f = join(head, "package.json");
        writeFileSync(f, "{\n<<<<<<< HEAD\n=======\n>>>>>>> b\n}\n");
        commit(head, "only markers");
        writeFileSync(f, package_json("head", "1.0.0", {"@yuneta/gobj-ui": `^${VERSION}`}));
        let r = round(root, {name: "head", path: head});
        expect(r.out).toMatch(/FAILED in this round/);
        expect(r.out).toMatch(/HEAD \([0-9a-f]{10}\):\.\/package\.json carries no version/);
    });

    test("a package.json moved in a way git does not see as a rename is followed by its version", () => {
        let root = mkdtempSync(join(tmpdir(), "dr-"));
        let filler = (n) => Object.fromEntries(Array.from({length: n}, (_, i) => [`dep${i}`, `^1.${i}.0`]));
        for(let how of ["mv-changed", "delete-add", "copy"]) {
            let repo = join(root, `repo-${how}`);
            consumer(repo, "old", "3.0.0", {"@yuneta/gobj-ui": `^${OLDER}`});
            execFileSync("git", ["init", "-q"], {cwd: repo});
            commit(repo, "init, 3.0.0 out with the old range");
            edit(join(repo, "old"), (p) => {
                p.dependencies["@yuneta/gobj-ui"] = `^${VERSION}`;
            });
            commit(repo, "the range raised by hand");
            let text = package_json("new", "3.0.0", Object.assign({"@yuneta/gobj-ui": `^${VERSION}`}, filler(40)));
            if(how === "mv-changed") {
                git(repo, "mv", "old", "new");
                writeFileSync(join(repo, "new", "package.json"), text);
                commit(repo, "moved, with many changes");
            } else if(how === "delete-add") {
                git(repo, "rm", "-rq", "old");
                commit(repo, "removed");
                mkdirSync(join(repo, "new"));
                writeFileSync(join(repo, "new", "package.json"), text);
                commit(repo, "added again");
            } else {
                mkdirSync(join(repo, "new"));
                writeFileSync(join(repo, "new", "package.json"), readFileSync(join(repo, "old", "package.json")));
                commit(repo, "copied");
            }
            let r = round(root, {name: how, path: join(repo, "new")});
            expect(r.out).toContain("version 3.0.0 -> 3.0.1");
            expect(read(join(repo, "new")).version).toBe("3.0.1");
            commit(repo, "the round");
            r = round(root, {name: how, path: join(repo, "new")});
            expect(r.out).toMatch(/range {2}already/);
            expect(read(join(repo, "new")).version).toBe("3.0.1");
        }
        /*  A NEW app born with the range beside one that shipped its number with the
         *  old range: raised once (a number spent), and left after that  */
        let repo = join(root, "two-apps");
        consumer(repo, "first", "1.0.0", {"@yuneta/gobj-ui": `^${OLDER}`});
        execFileSync("git", ["init", "-q"], {cwd: repo});
        commit(repo, "init");
        consumer(repo, "second", "1.0.0", {"@yuneta/gobj-ui": `^${VERSION}`});
        commit(repo, "a new app");
        let r = round(root, {name: "second", path: join(repo, "second")});
        expect(r.out).toContain("version 1.0.0 -> 1.0.1");
        r = round(root, {name: "second", path: join(repo, "second")});
        expect(r.out).toMatch(/range {2}already/);
        commit(repo, "the round");
        r = round(root, {name: "second", path: join(repo, "second")});
        expect(r.out).toMatch(/range {2}already/);
        expect(read(join(repo, "second")).version).toBe("1.0.1");
    });

    test("the version raised is the package's own: a nested \"version\" equal to it is left alone", () => {
        let root = mkdtempSync(join(tmpdir(), "dr-"));
        let dir = join(root, "nested");
        mkdirSync(dir, {recursive: true});
        let text = `{\n    "name": "nested",\n    "config": {"version": "1.0.0"},\n    "scripts": {"version": "1.0.0"},\n` +
                   `    "versions": ["1.0.0"],\n    "version": "1.0.0",\n` +
                   `    "dependencies": {"@yuneta/gobj-ui": "^${OLDER}"}\n}\n`;
        writeFileSync(join(dir, "package.json"), text);
        let r = round(root, {name: "nested", path: dir});
        expect(r.out).toContain("version 1.0.0 -> 1.0.1");
        let pkg = read(dir);
        expect(pkg.version).toBe("1.0.1");
        expect(pkg.config.version).toBe("1.0.0");
        expect(pkg.scripts.version).toBe("1.0.0");
        expect(readFileSync(join(dir, "package.json"), "utf8"))
            .toBe(text.replace(`"version": "1.0.0",\n    "dep`, `"version": "1.0.1",\n    "dep`)
                      .replace(`^${OLDER}`, `^${VERSION}`));
    });

    test("a package.json that starts with a BOM is read, as npm reads it, and keeps it", () => {
        let root = mkdtempSync(join(tmpdir(), "dr-"));
        let dir = join(root, "bom");
        mkdirSync(dir, {recursive: true});
        writeFileSync(join(dir, "package.json"), "\ufeff" + package_json("bom", "2.1.0", {"@yuneta/gobj-ui": `^${OLDER}`}));
        let r = round(root, {name: "bom", path: dir});
        expect(r.out).toContain("version 2.1.0 -> 2.1.1");
        expect(r.out).not.toMatch(/FAILED in this round/);
        let after = readFileSync(join(dir, "package.json"), "utf8");
        expect(after.startsWith("\ufeff")).toBe(true);
        expect(JSON.parse(after.slice(1))).toEqual({name: "bom", version: "2.1.1",
                                                    dependencies: {"@yuneta/gobj-ui": `^${VERSION}`}});
    });

    test("a package.json born with the range in the root of a history joined to another is asked of the other one", () => {
        let root = mkdtempSync(join(tmpdir(), "dr-"));
        let repo = join(root, "repo");
        consumer(repo, "old", "3.0.0", {"@yuneta/gobj-ui": `^${OLDER}`});
        execFileSync("git", ["init", "-q", "-b", "main"], {cwd: repo});
        commit(repo, "3.0.0 out with the old range");
        git(repo, "checkout", "-q", "--orphan", "side");
        git(repo, "rm", "-rqf", ".");
        consumer(repo, "new", "3.0.0", {"@yuneta/gobj-ui": `^${VERSION}`});
        commit(repo, "the app again, in a history of its own");
        git(repo, "checkout", "-q", "main");
        git(repo, "merge", "-q", "--no-edit", "--allow-unrelated-histories", "side");
        let r = round(root, {name: "joined", path: join(repo, "new")});
        expect(r.out).toContain("version 3.0.0 -> 3.0.1");
        commit(repo, "the round");
        r = round(root, {name: "joined", path: join(repo, "new")});
        expect(r.out).toMatch(/range {2}already/);
        expect(read(join(repo, "new")).version).toBe("3.0.1");
        /*  A repository of one root: nothing is before it, nothing is asked  */
        let solo = consumer(join(root, "solo"), "app", "1.0.0", {"@yuneta/gobj-ui": `^${VERSION}`}, true);
        r = round(root, {name: "solo", path: solo});
        expect(r.out).toMatch(/range {2}already/);
        expect(read(solo).version).toBe("1.0.0");
    });

    test("the states of the history before a birth are kept between rounds, never for a shallow clone", () => {
        let root = mkdtempSync(join(tmpdir(), "dr-"));
        let repo = join(root, "repo");
        mkdirSync(repo, {recursive: true});
        execFileSync("git", ["init", "-q"], {cwd: repo});
        writeFileSync(join(repo, "README"), "x\n");
        commit(repo, "before the app");
        let parent = git(repo, "rev-parse", "HEAD");
        consumer(repo, "app", "1.0.0", {"@yuneta/gobj-ui": `^${VERSION}`});
        commit(repo, "a new app, born with the range");
        let cache_file = join(root, "home", ".yuneta", "deploy-round-history.json");
        let r = round(root, {name: "app", path: join(repo, "app")});
        expect(r.out).toMatch(/range {2}already/);

        /*  What is kept is what is read: a carrier written into it raises the version  */
        let key = `@yuneta/gobj-ui ${parent}`;
        expect(JSON.parse(readFileSync(cache_file, "utf8"))).toEqual({format: CACHE_FORMAT, entries: {[key]: []}});
        writeFileSync(cache_file, JSON.stringify({format: CACHE_FORMAT,
            entries: {[key]: [{specs: [`^${OLDER}`], versions: ["1.0.0"]}]}}));
        r = round(root, {name: "app", path: join(repo, "app")});
        expect(r.out).toContain("version 1.0.0 -> 1.0.1");
        git(repo, "checkout", "-q", ".");

        /*  A shallow clone reads git, whatever is kept  */
        let clone = join(root, "clone");
        execFileSync("git", ["clone", "-q", "--depth", "2", `file://${repo}`, clone]);
        r = round(root, {name: "app", path: join(clone, "app")});
        expect(r.out).toMatch(/range {2}already/);
        expect(read(join(clone, "app")).version).toBe("1.0.0");

        /*  A cache that is not json is said, and read again from git  */
        writeFileSync(cache_file, "{not json");
        r = round(root, {name: "app", path: join(repo, "app")});
        expect(r.out).toContain(`${cache_file}: `);
        expect(r.out).toContain("read again from git");
        expect(r.out).toMatch(/range {2}already/);
        expect(JSON.parse(readFileSync(cache_file, "utf8")).entries[`@yuneta/gobj-ui ${parent}`]).toEqual([]);

        /*  One kept by a round of another format (7.26.49 and 7.26.50 keyed it by the commits
         *  alone) is not read: a carrier in it raises nothing, and it is written again  */
        writeFileSync(cache_file, JSON.stringify({[parent]: [{specs: [`^${OLDER}`], versions: ["1.0.0"]}]}));
        r = round(root, {name: "app", path: join(repo, "app")});
        expect(r.out).toMatch(/range {2}already/);
        expect(read(join(repo, "app")).version).toBe("1.0.0");
        expect(JSON.parse(readFileSync(cache_file, "utf8"))).toEqual(
            {format: CACHE_FORMAT, entries: {[`@yuneta/gobj-ui ${parent}`]: []}});

        /*  An entry of this format that is not a list of {specs: [string], versions: [string]} is
         *  said, read again from git and written again (up to 7.26.54 `[null]` refused the app on
         *  every round, naming no file)  */
        let bad_entries = [[null], {}, "x", [{specs: "^1.0.0", versions: []}], [{specs: [1], versions: []}],
            [{specs: [], versions: [1]}], [{specs: []}], [[]]];
        for(let bad of bad_entries) {
            writeFileSync(cache_file, JSON.stringify({format: CACHE_FORMAT,
                entries: {[`@yuneta/gobj-ui ${parent}`]: bad}}));
            r = round(root, {name: "app", path: join(repo, "app")});
            let what = JSON.stringify(bad);
            expect(r.out, what).toContain(`${cache_file}: `);
            expect(r.out, what).toContain("read again from git");
            expect(r.out, what).toMatch(/range {2}already/);
            expect(read(join(repo, "app")).version, what).toBe("1.0.0");
            expect(JSON.parse(readFileSync(cache_file, "utf8")), what).toEqual(
                {format: CACHE_FORMAT, entries: {[`@yuneta/gobj-ui ${parent}`]: []}});
        }
    });

    test("a state with no version of text is kept and read back as kept, with no warning", () => {
        let root = mkdtempSync(join(tmpdir(), "dr-"));
        let repo = join(root, "repo");
        mkdirSync(join(repo, "old"), {recursive: true});
        mkdirSync(join(repo, "num"), {recursive: true});
        execFileSync("git", ["init", "-q"], {cwd: repo});
        writeFileSync(join(repo, "old", "package.json"),
                      JSON.stringify({name: "old", dependencies: {"@yuneta/gobj-ui": `^${OLDER}`}}));
        writeFileSync(join(repo, "num", "package.json"),
                      JSON.stringify({name: "num", version: 1, dependencies: {"@yuneta/gobj-ui": `^${OLDER}`}}));
        commit(repo, "two package.json with no version of text");
        let parent = git(repo, "rev-parse", "HEAD");
        consumer(repo, "app", "1.0.0", {"@yuneta/gobj-ui": `^${VERSION}`});
        commit(repo, "a new app, born with the range");
        let cache_file = join(root, "home", ".yuneta", "deploy-round-history.json");
        let r = round(root, {name: "app", path: join(repo, "app")});
        expect(r.out).toMatch(/range {2}already/);
        let kept = JSON.parse(readFileSync(cache_file, "utf8")).entries[`@yuneta/gobj-ui ${parent}`];
        expect(kept.map((st) => st.versions)).toEqual([[null]]);
        /*  Up to gobj-ui 7.26.56 the round refused what it had written, on every round  */
        r = round(root, {name: "app", path: join(repo, "app")});
        expect(r.out).not.toContain("read again from git");
        expect(r.out).toMatch(/range {2}already/);
        expect(read(join(repo, "app")).version).toBe("1.0.0");
    });

    test("what is kept is kept per PACKAGE: a round of the runtime after one of the library reads its own states", () => {
        let filler = (n) => Object.fromEntries(Array.from({length: n}, (_, i) => [`dep${i}`, `^1.${i}.0`]));
        let born = (repo, name, deps) => {
            mkdirSync(join(repo, name));
            writeFileSync(join(repo, name, "package.json"), package_json(name, "2.0.0", Object.assign(deps, filler(40))));
        };
        for(let order of [["ui", "js"], ["js", "ui"]]) {
            /*  2.0.0 went out depending on the runtime alone, with its old range; the app
             *  moves with many changes (no rename git sees) and is born with both new ranges  */
            let root = mkdtempSync(join(tmpdir(), "dr-"));
            let repo = join(root, "repo");
            mkdirSync(repo, {recursive: true});
            execFileSync("git", ["init", "-q"], {cwd: repo});
            consumer(repo, "gui", "2.0.0", {"@yuneta/gobj-js": `^${JS_OLDER}`});
            commit(repo, "2.0.0 out with the old runtime range");
            git(repo, "rm", "-rq", "gui");
            born(repo, "guinew", {"@yuneta/gobj-js": `^${JS_VERSION}`, "@yuneta/gobj-ui": `^${VERSION}`});
            commit(repo, "moved, with both ranges new");
            let target = {name: "guinew", path: join(repo, "guinew")};
            for(let pkg of order) {
                let r = round(root, target, pkg === "js"? JS_ROUND : ["--no-wait"]);
                if(pkg === "js") {
                    /*  Up to gobj-ui 7.26.50, after the library's round, "already": 2.0.0 again  */
                    expect(r.out, order.join(">")).toContain("version 2.0.0 -> 2.0.1");
                } else {
                    expect(r.out, order.join(">")).toMatch(/range {2}already/);
                }
            }
            expect(read(join(repo, "guinew")).version).toBe("2.0.1");

            /*  Born with both new ranges and moved: nothing went out with an old one, and
             *  neither round raises it, in either order (up to 7.26.50 the second did)  */
            root = mkdtempSync(join(tmpdir(), "dr-"));
            repo = join(root, "repo");
            mkdirSync(repo, {recursive: true});
            execFileSync("git", ["init", "-q"], {cwd: repo});
            writeFileSync(join(repo, "README"), "x\n");
            commit(repo, "before the app");
            consumer(repo, "gui", "2.0.0", {"@yuneta/gobj-js": `^${JS_VERSION}`, "@yuneta/gobj-ui": `^${VERSION}`});
            commit(repo, "the app, born with both ranges new");
            git(repo, "rm", "-rq", "gui");
            born(repo, "guinew", {"@yuneta/gobj-js": `^${JS_VERSION}`, "@yuneta/gobj-ui": `^${VERSION}`});
            commit(repo, "moved, with many changes");
            target = {name: "guinew", path: join(repo, "guinew")};
            for(let pkg of order) {
                let r = round(root, target, pkg === "js"? JS_ROUND : ["--no-wait"]);
                expect(r.out, `${order.join(">")} ${pkg}`).toMatch(/range {2}already/);
            }
            expect(read(join(repo, "guinew")).version).toBe("2.0.0");
            let kept = JSON.parse(readFileSync(join(root, "home", ".yuneta", "deploy-round-history.json"), "utf8"));
            expect(Object.keys(kept.entries).map((k) => k.split(" ")[0]).sort())
                .toEqual(["@yuneta/gobj-js", "@yuneta/gobj-ui"]);
        }
    });

    test("what is kept is pruned: the entries used last, up to a limit", () => {
        let root = mkdtempSync(join(tmpdir(), "dr-"));
        let repo = join(root, "repo");
        mkdirSync(repo, {recursive: true});
        execFileSync("git", ["init", "-q"], {cwd: repo});
        writeFileSync(join(repo, "README"), "x\n");
        commit(repo, "before the app");
        let parent = git(repo, "rev-parse", "HEAD");
        consumer(repo, "app", "1.0.0", {"@yuneta/gobj-ui": `^${VERSION}`});
        commit(repo, "a new app, born with the range");
        let cache_file = join(root, "home", ".yuneta", "deploy-round-history.json");
        mkdirSync(dirname(cache_file), {recursive: true});
        let key = `@yuneta/gobj-ui ${parent}`;
        let stale = Object.fromEntries(Array.from({length: 300}, (_, i) => [`@yuneta/gobj-ui ${"0".repeat(39)}${i % 10}${i}`, []]));
        /*  Read: moved to the end, kept  */
        writeFileSync(cache_file, JSON.stringify({format: CACHE_FORMAT, entries: {[key]: [], ...stale}}));
        let r = round(root, {name: "app", path: join(repo, "app")});
        expect(r.out).toMatch(/range {2}already/);
        let kept = Object.keys(JSON.parse(readFileSync(cache_file, "utf8")).entries);
        expect(kept.length).toBe(64);
        expect(kept[kept.length - 1]).toBe(key);
        /*  Not there: read from git, added at the end, the oldest dropped  */
        writeFileSync(cache_file, JSON.stringify({format: CACHE_FORMAT, entries: stale}));
        r = round(root, {name: "app", path: join(repo, "app")});
        kept = Object.keys(JSON.parse(readFileSync(cache_file, "utf8")).entries);
        expect(kept.length).toBe(64);
        expect(kept[kept.length - 1]).toBe(key);
        expect(kept[0]).toBe(Object.keys(stale)[300 - 63]);
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

describe("deploy-round: the public demo", () => {
    /*  A copy of the repo: the script, a package.json, a test-app whose build is `true` and whose
     *  deploy.sh writes a line in `deployed`; an `origin` it was pushed to; curl that answers nothing  */
    function repo_copy()
    {
        let root = mkdtempSync(join(tmpdir(), "dr-demo-"));
        let ui = join(root, "ui");
        mkdirSync(join(ui, "scripts"), {recursive: true});
        mkdirSync(join(ui, "test-app"), {recursive: true});
        mkdirSync(join(root, "home"), {recursive: true});
        mkdirSync(join(root, "bin"), {recursive: true});
        writeFileSync(join(ui, "scripts", "deploy-round.mjs"), readFileSync(SCRIPT));
        writeFileSync(join(ui, "package.json"), JSON.stringify({name: "@yuneta/gobj-ui", version: VERSION}));
        writeFileSync(join(ui, "test-app", "package.json"), JSON.stringify({name: "test-app", scripts: {build: "true"}}));
        writeFileSync(join(ui, "test-app", "deploy.sh"), `#!/bin/sh\necho "$@" >> ${join(root, "deployed")}\n`);
        chmodSync(join(ui, "test-app", "deploy.sh"), 0o755);
        writeFileSync(join(root, "bin", "curl"), "#!/bin/sh\nexit 7\n");
        chmodSync(join(root, "bin", "curl"), 0o755);
        execFileSync("git", ["init", "-q", "-b", "main"], {cwd: ui});
        commit(ui, "the repo");
        execFileSync("git", ["clone", "-q", "--bare", ui, join(root, "origin.git")]);
        git(ui, "remote", "add", "origin", join(root, "origin.git"));
        git(ui, "fetch", "-q", "origin");
        /*  The sibling gobj-js the demo bundles from its working tree (test-app/vite.config.js)  */
        let js = join(root, "gobj-js");
        mkdirSync(join(js, "src"), {recursive: true});
        writeFileSync(join(js, "src", "index.js"), "export {};\n");
        execFileSync("git", ["init", "-q", "-b", "main"], {cwd: js});
        commit(js, "the runtime");
        execFileSync("git", ["clone", "-q", "--bare", js, join(root, "js-origin.git")]);
        git(js, "remote", "add", "origin", join(root, "js-origin.git"));
        git(js, "fetch", "-q", "origin");
        return {root, ui, js};
    }
    function demo_round(root, ui)
    {
        let r = spawnSync(process.execPath, [join(ui, "scripts", "deploy-round.mjs"), "--only", "test-app", "--no-wait"], {
            encoding: "utf8", timeout: 60000,
            env: Object.assign({}, process.env,
                               {HOME: join(root, "home"), PATH: join(root, "bin") + delimiter + process.env.PATH})
        });
        let deployed = "";
        try {
            deployed = readFileSync(join(root, "deployed"), "utf8");
        } catch(e) {
            deployed = "";
        }
        return {status: r.status, out: r.stdout + r.stderr, deployed};
    }

    test("it is deployed only from a clean tree at origin/main (up to 7.26.54 from any copy, in any state)", () => {
        let {root, ui, js} = repo_copy();
        let r = demo_round(root, ui);
        expect(r.deployed).toBe("--no-build\nniyamaka.com --no-build\n");

        let refused = [
            ["a changed file", () => writeFileSync(join(ui, "package.json"),
                JSON.stringify({name: "@yuneta/gobj-ui", version: VERSION, x: 1})), "changes in the working tree"],
            ["a new file", () => writeFileSync(join(ui, "test-app", "new.js"), "x\n"), "changes in the working tree"],
            ["a commit origin/main does not have", () => {
                writeFileSync(join(ui, "test-app", "new.js"), "x\n");
                commit(ui, "not pushed");
            }, "is not origin/main"],
            ["no origin", () => git(ui, "remote", "remove", "origin"), "cannot read origin/main"],
            /*  Up to gobj-ui 7.26.56 these four went out  */
            ["a new file, untracked files hidden by the config", () => {
                git(ui, "config", "status.showUntrackedFiles", "no");
                writeFileSync(join(ui, "test-app", "new.js"), "x\n");
            }, "changes in the working tree"],
            ["a copy with no git of its own, ignored by a clean repo around it", () => {
                execFileSync("rm", ["-rf", join(ui, ".git")]);
                writeFileSync(join(root, ".gitignore"), "*\n!.gitignore\n");
                execFileSync("git", ["init", "-q", "-b", "main"], {cwd: root});
                commit(root, "around the copy");
                execFileSync("git", ["clone", "-q", "--bare", root, join(root, "around.git")]);
                git(root, "remote", "add", "origin", join(root, "around.git"));
                git(root, "fetch", "-q", "origin");
            }, "is not the top of its own git tree"],
            ["a changed file in the sibling gobj-js", () => writeFileSync(join(js, "src", "index.js"), "export {x};\n"),
             /changes in the working tree of \S*\/gobj-js /],
            ["a commit the sibling gobj-js's origin/main does not have", () => {
                writeFileSync(join(js, "src", "index.js"), "export {x};\n");
                commit(js, "not pushed");
            }, /HEAD \w+ of \S*\/gobj-js is not origin\/main/],
            /*  Up to gobj-ui 7.26.57 these four went out: `git status` does not look at them  */
            ["a changed file marked assume-unchanged", () => {
                git(ui, "update-index", "--assume-unchanged", "package.json");
                writeFileSync(join(ui, "package.json"), JSON.stringify({name: "@yuneta/gobj-ui", version: VERSION, x: 1}));
            }, "marked assume-unchanged or skip-worktree"],
            ["a changed file marked skip-worktree", () => {
                git(ui, "update-index", "--skip-worktree", "package.json");
                writeFileSync(join(ui, "package.json"), JSON.stringify({name: "@yuneta/gobj-ui", version: VERSION, x: 1}));
            }, "marked assume-unchanged or skip-worktree"],
            ["a changed file of the sibling gobj-js marked skip-worktree", () => {
                git(js, "update-index", "--skip-worktree", "src/index.js");
                writeFileSync(join(js, "src", "index.js"), "export {x};\n");
            }, /of \S*\/gobj-js marked assume-unchanged or skip-worktree/],
            /*  Up to gobj-ui 7.26.59 a marked file missing from disk was taken as out of a sparse cone  */
            ["a file deleted under core.ignoreStat", () => {
                writeFileSync(join(ui, "test-app", "x.js"), "x\n");
                commit(ui, "x");
                git(ui, "push", "-q", "origin", "main");
                git(ui, "config", "core.ignoreStat", "true");
                git(ui, "update-index", "--really-refresh");
                execFileSync("rm", [join(ui, "test-app", "x.js")]);
            }, "marked assume-unchanged or skip-worktree"],
            ["a file marked assume-unchanged, deleted", () => {
                git(ui, "update-index", "--assume-unchanged", "test-app/deploy.sh");
                execFileSync("rm", [join(ui, "test-app", "deploy.sh")]);
            }, "marked assume-unchanged or skip-worktree"],
            ["a file marked skip-worktree, deleted, with no sparse checkout", () => {
                git(js, "update-index", "--skip-worktree", "src/index.js");
                execFileSync("rm", [join(js, "src", "index.js")]);
            }, /of \S*\/gobj-js marked assume-unchanged or skip-worktree/],
            ["a symlink marked assume-unchanged, pointing elsewhere", () => {
                symlinkSync("package.json", join(ui, "link"));
                commit(ui, "a link");
                git(ui, "push", "-q", "origin", "main");
                git(ui, "update-index", "--assume-unchanged", "link");
                execFileSync("rm", [join(ui, "link")]);
                symlinkSync("test-app", join(ui, "link"));
            }, "marked assume-unchanged or skip-worktree"],
            ["no sibling gobj-js", () => execFileSync("rm", ["-rf", js]), /there is no gobj-js directory at /],
            ["a sibling gobj-js that is a file", () => {
                execFileSync("rm", ["-rf", js]);
                writeFileSync(js, "x\n");
            }, /there is no gobj-js directory at /],
            /*  Up to gobj-ui 7.26.58 an fsmonitor hook answered for `git status`  */
            ["a changed file an fsmonitor hook says nothing of", () => {
                writeFileSync(join(root, "bin", "fsmon"), "#!/bin/sh\nprintf 'tok\\0'\n");
                chmodSync(join(root, "bin", "fsmon"), 0o755);
                git(ui, "config", "core.fsmonitor", join(root, "bin", "fsmon"));
                git(ui, "status", "--porcelain");
                writeFileSync(join(ui, "package.json"), JSON.stringify({name: "@yuneta/gobj-ui", version: VERSION, x: 1}));
            }, "changes in the working tree"]
        ];
        for(let [what, make, says] of refused) {
            ({root, ui, js} = repo_copy());
            make();
            r = demo_round(root, ui);
            expect(r.deployed, what).toBe("");
            expect(r.out, what).toContain("NOT DEPLOYED");
            expect(r.out, what).toMatch(says);
            expect(r.status, what).toBe(1);
        }
    });

    test("an argument it does not understand stops the round before anything is done (up to 7.26.57 the WHOLE round ran)", () => {
        let {root, ui} = repo_copy();
        let bad = [
            [["--chek"], 'unknown argument "--chek"'],
            [["--only"], "--only needs a name"],
            [["--only="], "--only needs a name"],
            [["--only", "--no-wait"], "--only needs a name"],
            [["--pkg"], "--pkg needs a name"],
            [["--check=yes"], "--check takes no value"],
            [["--check", "--check"], "--check given twice"],
            [["--only", "test-app", "--only=x"], "--only given twice"]
        ];
        for(let [argv, says] of bad) {
            let r = spawnSync(process.execPath, [join(ui, "scripts", "deploy-round.mjs"), ...argv], {
                encoding: "utf8", timeout: 60000,
                env: Object.assign({}, process.env,
                                   {HOME: join(root, "home"), PATH: join(root, "bin") + delimiter + process.env.PATH})
            });
            expect(r.status, argv.join(" ")).toBe(2);
            expect(r.stderr, argv.join(" ")).toContain(says);
        }
        expect(existsSync(join(root, "deployed"))).toBe(false);
        /*  The `=` form is read  */
        let r = spawnSync(process.execPath, [join(ui, "scripts", "deploy-round.mjs"), "--only=demo", "--no-wait"], {
            encoding: "utf8", timeout: 60000,
            env: Object.assign({}, process.env,
                               {HOME: join(root, "home"), PATH: join(root, "bin") + delimiter + process.env.PATH})
        });
        expect(r.status).toBe(2);
        expect(r.stderr).toContain(`no target named "demo"`);
    });

    test("a mark alone is no change: a clean file marked, core.ignoreStat, a sparse checkout (up to 7.26.58 refused)", () => {
        let goes = [
            ["a clean file marked assume-unchanged", (ui) => git(ui, "update-index", "--assume-unchanged", "package.json")],
            ["a clean file marked skip-worktree", (ui) => git(ui, "update-index", "--skip-worktree", "package.json")],
            ["core.ignoreStat", (ui) => {
                git(ui, "config", "core.ignoreStat", "true");
                git(ui, "update-index", "--really-refresh");
                git(ui, "add", "-A");
            }],
            ["a clean marked file whose path holds a newline", (ui) => {
                writeFileSync(join(ui, "a\nb.txt"), "x\n");
                commit(ui, "a newline in a path");
                git(ui, "push", "-q", "origin", "main");
                git(ui, "update-index", "--assume-unchanged", "a\nb.txt");
            }],
            ["a sparse checkout with a file out of the cone", (ui) => {
                mkdirSync(join(ui, "docs"));
                writeFileSync(join(ui, "docs", "a.md"), "x\n");
                commit(ui, "docs");
                git(ui, "push", "-q", "origin", "main");
                git(ui, "sparse-checkout", "set", "--no-cone", "/*", "!/docs/");
            }],
        ];
        for(let [what, make] of goes) {
            let {root, ui} = repo_copy();
            make(ui);
            let r = demo_round(root, ui);
            expect(r.out, what).not.toContain("NOT DEPLOYED");
            expect(r.deployed, what).toBe("--no-build\nniyamaka.com --no-build\n");
        }
    });

    test("--only with a name that is no target names the targets, the demo among them", () => {
        let {root, ui} = repo_copy();
        let r = spawnSync(process.execPath, [join(ui, "scripts", "deploy-round.mjs"), "--only", "demo", "--no-wait"], {
            encoding: "utf8", timeout: 60000, env: Object.assign({}, process.env, {HOME: join(root, "home")})
        });
        expect(r.status).toBe(2);
        expect(r.stderr).toContain(`no target named "demo"; the targets are: test-app (the demo)`);
    });
});
