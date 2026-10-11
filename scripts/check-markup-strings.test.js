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

    test("what is fine", () => {
        expect(rules_of(`x(['span', {}, 'plain text']);`)).toEqual([]);
        expect(rules_of(`x(['span', {}, html_markup('<i class="yi-a"></i>')]);`)).toEqual([]);
        expect(rules_of(`x(['span', {}, text_node(name)]);`)).toEqual([]);
        expect(rules_of(`x(['span', {}, name]);`)).toEqual([]);     // a variable: not visible here
        expect(rules_of(`const t3 = [a, b, '<b>'];`)).toEqual([]);  // not a description
    });
});
