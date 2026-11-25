/***********************************************************************
 *          tabulator_css.test.js
 *
 *      The paginator on a narrow screen (tabulator.css): its icons are
 *      the size of the icons of a view's toolbar, and each step button
 *      reads its mask from a property that yui_icons.css defines.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {test, expect} from "vitest";
import fs from "node:fs";
import {install_dom_double} from "../test/dom_double.js";

install_dom_double();

const {YUI_TOOLBAR_ICON_SIZE} = await import("./yui_toolbar.js");

const CSS = fs.readFileSync(new URL("./tabulator.css", import.meta.url), "utf8");
const ICONS = fs.readFileSync(new URL("./yui_icons.css", import.meta.url), "utf8");

/*  The block of the narrow screen.  */
function narrow()
{
    let start = CSS.indexOf("@media screen and (max-width: 768px) {");
    expect(start).toBeGreaterThan(0);
    return CSS.slice(start, CSS.indexOf("\n}\n", start));
}

test("the paginator's icons are the size of the toolbar's", () => {
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
