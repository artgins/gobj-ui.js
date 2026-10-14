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
        expect(JSON.parse(readFileSync(cache_file, "utf8"))[parent]).toEqual([]);

        /*  What is kept is what is read: a carrier written into it raises the version  */
        writeFileSync(cache_file, JSON.stringify({[parent]: [{specs: [`^${OLDER}`], versions: ["1.0.0"]}]}));
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
        expect(JSON.parse(readFileSync(cache_file, "utf8"))[parent]).toEqual([]);
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
