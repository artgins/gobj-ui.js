/***********************************************************************
 *          tabulator_css.test.js
 *
 *      The stylesheet of the tables: an editor fills its cell only when
 *      it is a box to TYPE in. A checkbox or a radio given width and
 *      height 100% is drawn as a square the size of the cell (the
 *      tickCross editor of an app's "validated" opened as a huge
 *      empty box on a phone, gobj-ui 7.26.36).
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
