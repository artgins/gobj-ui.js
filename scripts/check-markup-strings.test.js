/***********************************************************************
 *          check-markup-strings.test.js
 *
 *      The static check of createElement2() descriptions: what it finds
 *      and what it leaves alone, on fixtures written to a temp dir.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {describe, test, expect} from "vitest";
import {mkdtempSync, writeFileSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {check_file} from "./check-markup-strings.mjs";

function rules_of(code)
{
    const dir = mkdtempSync(join(tmpdir(), "cms-"));
    const file = join(dir, "fixture.js");
    writeFileSync(file, code);
    return check_file(file, dir).map((f) => f.rule);
}

describe("check-markup-strings", () => {
    test("literal, built, in-list", () => {
        expect(rules_of(`x(['span', {}, '<i class="yi-a"></i>']);`)).toEqual(["literal"]);
        expect(rules_of("x(['span', {}, `<b>${name}</b>`]);")).toEqual(["built"]);
        expect(rules_of(`x(['span', {}, '<b>' + name]);`)).toEqual(["built"]);
        expect(rules_of(`x(['div', {}, [['b', {}, 'x'], '<i>y</i>']]);`)).toEqual(["in-list"]);
    });

    test("the gaps of 7.26.10: ternary, concat, computed tag, list head", () => {
        expect(rules_of(`x(['span', {}, cond ? '<b>' : name]);`)).toEqual(["literal"]);
        expect(rules_of(`x(['span', {}, name || '<b>x</b>']);`)).toEqual(["literal"]);
        expect(rules_of(`x(['span', {}, '<b>'.concat(name)]);`)).toEqual(["built"]);
        expect(rules_of(`x([tag, {class: 'a'}, '<b>x</b>']);`)).toEqual(["literal"]);
        expect(rules_of(`x([is_link ? 'a' : 'button', {}, '<b>x</b>']);`)).toEqual(["literal"]);
        expect(rules_of(`x(['div', {}, ['<b>x</b>', other]]);`)).toEqual(["list-head"]);
    });

    test("the gaps of 7.26.11: raw, join, empty heads, method on built markup, case, sequence", () => {
        expect(rules_of("x(['span', {}, String.raw`<b>${name}</b>`]);")).toEqual(["built"]);
        expect(rules_of(`x(['span', {}, ['<b>', name, '</b>'].join('')]);`)).toEqual(["built"]);
        expect(rules_of("x(['span', {}, `${''}<b>${name}`]);")).toEqual(["built"]);
        expect(rules_of(`x(['span', {}, '' + '<b>' + name]);`)).toEqual(["built"]);
        expect(rules_of(`x(['span', {}, ('<b>' + name).trim()]);`)).toEqual(["built"]);
        expect(rules_of(`x(['SPAN', {}, '<b>x</b>']);`)).toEqual(["literal"]);
        expect(rules_of(`x(['span', {}, (log(), '<b>x</b>')]);`)).toEqual(["literal"]);
    });

    test("the false readings of 7.26.12: replace, a static case change", () => {
        expect(rules_of(`x(['span', {}, '<b>x</b>'.replace(/<[^>]+>/g, '')]);`)).toEqual([]);
        expect(rules_of(`x(['span', {}, '<b>x</b>'.replaceAll('<b>', '')]);`)).toEqual([]);
        expect(rules_of(`x(['span', {}, '<b>s</b>'.toUpperCase()]);`)).toEqual(["literal"]);
        expect(rules_of(`x(['span', {}, ('<b>' + name).toUpperCase()]);`)).toEqual(["built"]);
    });

    test("V6.4: replace on markup that carries data, or puts data in, is still built", () => {
        expect(rules_of(`x(['span', {}, ('<b>' + name + '</b>').replaceAll('a', 'b')]);`)).toEqual(["built"]);
        expect(rules_of(`x(['span', {}, '<b>NAME</b>'.replace('NAME', name)]);`)).toEqual(["built"]);
        expect(rules_of(`x(['span', {}, \`<b>\${name}</b>\`.replace(/x/g, '')]);`)).toEqual(["built"]);
        expect(rules_of(`x(['span', {}, '<b>x</b>'.replace('x', 'y')]);`)).toEqual(["literal"]);
        expect(rules_of(`x(['span', {}, 'text'.replace('text', '<b>')]);`)).toEqual(["literal"]);
        expect(rules_of(`x(['span', {}, name.replace(/a/g, '')]);`)).toEqual([]);   // not visible
    });

    test("what is fine", () => {
        expect(rules_of(`x(['span', {}, 'plain text']);`)).toEqual([]);
        expect(rules_of(`x(['span', {}, html_markup('<i class="yi-a"></i>')]);`)).toEqual([]);
        expect(rules_of(`x(['span', {}, text_node(name)]);`)).toEqual([]);
        expect(rules_of(`x(['span', {}, name]);`)).toEqual([]);     // a variable: not visible here
        expect(rules_of(`const t3 = [a, b, '<b>'];`)).toEqual([]);  // not a description
    });

    test("as a command: an absolute path works, a missing one says so (exit 2)", async () => {
        const {spawnSync} = await import("node:child_process");
        const {fileURLToPath} = await import("node:url");
        const script = fileURLToPath(new URL("./check-markup-strings.mjs", import.meta.url));
        const dir = mkdtempSync(join(tmpdir(), "cms-cli-"));
        writeFileSync(join(dir, "ok.js"), "x(['span', {}, 'text']);");
        const ok = spawnSync(process.execPath, [script, dir], {cwd: tmpdir(), encoding: "utf8"});
        expect(ok.status).toBe(0);
        expect(ok.stdout).toContain("OK (1 files)");
        const missing = spawnSync(process.execPath, [script, join(dir, "nope")], {encoding: "utf8"});
        expect(missing.status).toBe(2);
        expect(missing.stderr).toContain("no such file or directory");
        expect(missing.stderr).not.toContain("    at ");
    });
});

