/***********************************************************************
 *          yui_dev_preview.test.js
 *
 *          What a FOLDED object says about itself in the Developer
 *          window: its first fields, the way a browser console says it.
 *
 *          Importing the module at all is half of this file's job: the
 *          monitor's stylesheet is a template literal, so a single
 *          backtick in a CSS comment stops yui_dev.js from parsing --
 *          twice now -- and nothing else in the suite imports it.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {describe, it, expect} from "vitest";
import {object_preview} from "./yui_dev.js";

describe("object_preview", () => {
    it("names the first fields instead of counting them", () => {
        const col = {
            header: "id", fillspace: 18, type: "string",
            flag: ["persistent"], hidden: false,
        };
        expect(object_preview(col, Object.keys(col).length)).toBe(
            '{header: "id", fillspace: 18, type: "string", flag: […], …}'
        );
    });

    it("quotes strings, so a value does not run into the next key", () => {
        expect(object_preview({result: 0, comment: "ok"}, 2)).toBe(
            '{result: 0, comment: "ok"}'
        );
    });

    it("does not enter a nested container", () => {
        const o = {a: {x: 1}, b: [1, 2]};
        expect(object_preview(o, 2)).toBe("{a: {…}, b: […]}");
    });

    it("says there is more with an ellipsis", () => {
        const o = {a: 1, b: 2, c: 3, d: 4, e: 5};
        expect(object_preview(o, 5)).toBe("{a: 1, b: 2, c: 3, d: 4, …}");
    });

    it("clips a long string at 28 characters", () => {
        const o = {comment: "x".repeat(60)};
        expect(object_preview(o, 1)).toBe('{comment: "' + "x".repeat(28) + '…"}');
    });

    it("keeps one field even when it alone is too wide", () => {
        const o = {only: "y".repeat(200), other: 1};
        expect(object_preview(o, 2).startsWith('{only: "yyy')).toBe(true);
    });

    it("renders null and booleans as themselves", () => {
        expect(object_preview({a: null, b: true}, 2)).toBe("{a: null, b: true}");
    });
});
