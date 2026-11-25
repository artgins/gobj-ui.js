/***********************************************************************
 *          tabulator_css.test.js
 *
 *      The stylesheet of the tables: an editor fills its cell only when
 *      it is a box to TYPE in. A checkbox or a radio given width and
 *      height 100% is drawn as a square the size of the cell (the
 *      tickCross editor of an app's "validated" opened as a huge
 *      empty box on a phone, gobj-ui 7.26.36).
 *
 *      And the paginator on a narrow screen: its icons are the size of
 *      the icons of a view's toolbar, and each step button reads its
 *      mask from a property that yui_icons.css defines (7.32.6).
 *
 *      Read as text, as the window layer's invariants are: jsdom applies
 *      no stylesheet.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {describe, test, expect} from "vitest";
import {readFileSync} from "node:fs";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";
import {install_dom_double} from "../test/dom_double.js";

install_dom_double();

const {YUI_TOOLBAR_ICON_SIZE} = await import("./yui_toolbar.js");

const ICONS = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "yui_icons.css"), "utf8");

const CSS = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "tabulator.css"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "");

/*  Every rule: its selectors, and its body.  */
function rules()
{
    const out = [];
    const re = /([^{}]+)\{([^{}]*)\}/g;
    let m;
    while((m = re.exec(CSS)) !== null) {
        out.push({
            selectors: m[1].split(",").map((s) => s.trim()).filter(Boolean),
            body: m[2]
        });
    }
    return out;
}

describe("an editor fills its cell only when it is a box to type in", () => {
    test("no rule sizes a checkbox or a radio of a table to its cell", () => {
        const offenders = [];
        for(const r of rules()) {
            if(!/\b(width|height)\s*:\s*100%/.test(r.body)) {
                continue;
            }
            for(const sel of r.selectors) {
                /*  A bare `input` in a cell editor or a header filter reaches
                 *  a checkbox too, unless the selector leaves it out.  */
                if(/\binput\b/.test(sel) && /tabulator/.test(sel) &&
                        !(/:not\(\[type=checkbox\]\)/.test(sel) && /:not\(\[type=radio\]\)/.test(sel))) {
                    offenders.push(sel);
                }
            }
        }
        expect(offenders).toEqual([]);
    });

    test("a text input of a cell being edited still fills it", () => {
        const fill = rules().filter((r) => /\bwidth\s*:\s*100%/.test(r.body) &&
            r.selectors.some((s) => /tabulator-editing input:not\(\[type=checkbox\]\)/.test(s)));
        expect(fill.length).toBeGreaterThan(0);
    });
});

describe("the paginator on a narrow screen", () => {
    /*  The block of the narrow screen.  */
    function narrow()
    {
        let start = CSS.indexOf("@media screen and (max-width: 768px) {");
        expect(start).toBeGreaterThan(0);
        return CSS.slice(start, CSS.indexOf("\n}\n", start));
    }

    test("its icons are the size of the toolbar's", () => {
        let m = /\[data-page=last\]\)::before \{[^}]*?width: ([\d.]+rem);\s*height: ([\d.]+rem);/.exec(narrow());
        expect(m).not.toBeNull();
        expect(m[1]).toBe(YUI_TOOLBAR_ICON_SIZE);
        expect(m[2]).toBe(YUI_TOOLBAR_ICON_SIZE);
    });

    test("each step has the icon of the period navigator, from yui_icons.css", () => {
        const STEPS = {
            first: "yi-backward-step",
            prev:  "yi-chevron-left",
            next:  "yi-chevron-right",
            last:  "yi-forward-step"
        };
        for(const [page, icon] of Object.entries(STEPS)) {
            expect(narrow()).toMatch(new RegExp(
                `\\[data-page=${page}\\]::before \\{\\s*-webkit-mask-image: var\\(--${icon}\\);` +
                `\\s*mask-image: var\\(--${icon}\\);`));
            expect(ICONS).toMatch(new RegExp(`\\n {4}--${icon}: url\\(`));
        }
    });

    test("the numbered pages keep their number: only the steps lose the word", () => {
        expect(narrow()).not.toMatch(/\.tabulator-page\[data-page\]/);
    });
});
