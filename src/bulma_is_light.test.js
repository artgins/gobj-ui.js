/***********************************************************************
 *          bulma_is_light.test.js
 *
 *      `is-light` MUST NEVER BE THE ONLY BULMA COLOUR ON AN ELEMENT.
 *
 *      'light' is one of Bulma's colours, so `is-light` is both a colour
 *      and the "soften it" modifier.  A compound selector may match the
 *      same class twice, so `.tag.is-light.is-light` matches an element
 *      that carries the class ONCE -- and that rule sets the text to
 *      var(--bulma-light-light-invert-l), WHICH BULMA NEVER DEFINES:
 *      referenced four times in bulma.css, declared zero times.  The
 *      colour declaration is then invalid while the background still
 *      resolves, and what is left on screen is a pill with no readable
 *      label.
 *
 *      Two selectors in Bulma 1 reach that undefined variable:
 *
 *          .tag.is-light.is-light
 *          .notification.is-light.is-light
 *
 *      It cost three unreadable chips in the schema editor -- the topic
 *      count, the schema version, and every column flag without a colour
 *      of its own ('writable', 'image', 'wild'...).  They looked like
 *      empty pills, which reads as a rendering bug in the data and is a
 *      missing CSS variable.
 *
 *      THIS IS A SOURCE SCAN AND NOT A RENDER TEST ON PURPOSE: jsdom does
 *      not load Bulma, so no mounted test can see the contrast.  What can
 *      be checked is the rule that produces it.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {describe, it, expect} from "vitest";
import {readdirSync, readFileSync} from "node:fs";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

import {yui_tint, TINTABLE} from "./bulma_tint.js";

const SRC = dirname(fileURLToPath(import.meta.url));

/*
 *  The ONE file allowed to write the literal: yui_tint() emits it only
 *  next to a colour it has already checked against TINTABLE, and the
 *  colour is interpolated, so no source scan can see it. What guards
 *  that file is the behaviour suite at the bottom, not the scan.
 */
const EMITTER = "bulma_tint.js";

/*  Every Bulma colour except 'light' itself. */
const COLOURS = [
    "is-primary", "is-link", "is-info", "is-success", "is-warning",
    "is-danger", "is-black", "is-dark", "is-white", "is-text", "is-ghost"
];

/*
 *  How far around an occurrence to look for its colour.  The colour does
 *  not have to sit on the same line: it may come from a ternary, from a
 *  string concatenation split across two lines, or from a variable
 *  interpolated just before.  A window is what covers all three without
 *  parsing javascript.
 */
const WINDOW = 260;

function offenders(source)
{
    let out = [];
    let at = source.indexOf("is-light");
    while(at >= 0) {
        const from = Math.max(0, at - WINDOW);
        const to = Math.min(source.length, at + WINDOW);
        const around = source.slice(from, to);

        /*  A comment ABOUT the rule is not a use of it. */
        const line_start = source.lastIndexOf("\n", at) + 1;
        const line = source.slice(line_start, source.indexOf("\n", at));
        const is_comment = /^\s*(\*|\/\/|\/\*)/.test(line);

        if(!is_comment && !COLOURS.some((c) => around.includes(c))) {
            out.push(line.trim());
        }
        at = source.indexOf("is-light", at + 1);
    }
    return out;
}

describe("bulma: is-light never travels alone", () => {
    const files = readdirSync(SRC).filter(
        (f) => f.endsWith(".js") && !f.endsWith(".test.js") && f !== EMITTER
    );

    it("scans every source file of the library", () => {
        expect(files.length).toBeGreaterThan(0);
    });

    for(let file of files) {
        it(`${file} carries no colourless is-light`, () => {
            const source = readFileSync(join(SRC, file), "utf-8");
            expect(offenders(source)).toEqual([]);
        });
    }
});

describe("the scan itself", () => {
    it("catches a colourless is-light", () => {
        const bad = 'return ["span", {class: `SOMETHING tag is-light`}, "x"];';
        expect(offenders(bad)).toHaveLength(1);
    });

    it("accepts one that travels with a colour", () => {
        const good = 'return ["span", {class: `SOMETHING tag is-warning is-light`}, "x"];';
        expect(offenders(good)).toEqual([]);
    });

    it("accepts a colour that arrives split across lines", () => {
        const good = 'const c = `tag ${x ? "is-danger" : "is-warning"}`\n'
                   + '    + " is-light";';
        expect(offenders(good)).toEqual([]);
    });
});

describe("yui_tint", () => {
    it("softens every colour that CAN be softened", () => {
        for(let name of TINTABLE) {
            expect(yui_tint(name)).toBe(`is-${name} is-light`);
            expect(yui_tint(`is-${name}`)).toBe(`is-${name} is-light`);
        }
    });

    it("refuses to soften 'light' with itself", () => {
        expect(yui_tint("light")).toBe("");
        expect(yui_tint("is-light")).toBe("");
    });

    it("answers nothing for nothing", () => {
        expect(yui_tint("")).toBe("");
        expect(yui_tint(undefined)).toBe("");
        expect(yui_tint(null)).toBe("");
        expect(yui_tint(7)).toBe("");
    });

    it("does not pass through what it cannot vouch for", () => {
        /*  A class this function cannot recognise is exactly the case it
         *  exists to stop, so it comes back empty instead of forwarded.  */
        expect(yui_tint("is-whatever")).toBe("");
        expect(yui_tint("has-text-danger")).toBe("");
    });

    it("never emits is-light on its own", () => {
        for(let input of TINTABLE.concat(
            ["light", "is-light", "", "nope", "is-nope"]
        )) {
            const out = yui_tint(input);
            if(out.includes("is-light")) {
                expect(out).toMatch(/is-(primary|link|info|success|warning|danger|black|dark|white|text|ghost) is-light/);
            }
        }
    });
});
