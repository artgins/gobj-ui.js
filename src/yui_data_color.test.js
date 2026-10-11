/***********************************************************************
 *          yui_data_color.test.js
 *
 *      A colour from data goes into a card's `style="..."`: only a
 *      colour passes.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {describe, test, expect} from "vitest";
import {css_color_or_null} from "./yui_data_color.js";

describe("css_color_or_null", () => {
    test("the colour syntaxes pass", () => {
        for(const c of ["#abc", "#AABBCC", "#aabbcc80", "red", "rgb(1, 2, 3)",
                        "rgba(1,2,3,0.5)", "hsl(120 50% 50%)", "hsla(120, 50%, 50%, .2)"]) {
            expect(css_color_or_null(c)).toBe(c);
        }
    });

    test("anything that could leave the attribute does not", () => {
        for(const c of ['red" onmouseover="x()', "red; background:url(x)", "url(x)",
                        "<b>", "red\"", "expression(alert(1))", "", "  red", 5, null, {}]) {
            expect(css_color_or_null(c)).toBe(null);
        }
    });
});
