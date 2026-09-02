/***********************************************************************
 *          yui_asset.test.js
 *
 *      Unit tests for the pure logic of yui_asset.
 *      Run with: npm test
 ***********************************************************************/
import { test, expect } from "vitest";
import {
    yui_asset_id,
    yui_asset_ids,
    yui_asset_src,
} from "./yui_asset.js";

/*
 *  A treedb fkey is `topic^id^hook`.
 */
test("reads the id out of a single-valued fkey", () => {
    expect(yui_asset_id("assets^abc123^as_foto")).toBe("abc123");
    expect(yui_asset_ids("assets^abc123^as_foto")).toEqual(["abc123"]);
});

test("reads every id out of an array fkey, in order", () => {
    expect(yui_asset_ids([
        "assets^p1^as_plano",
        "assets^p2^as_plano",
    ])).toEqual(["p1", "p2"]);
    expect(yui_asset_id(["assets^p1^as_plano", "assets^p2^as_plano"])).toBe("p1");
});

/*
 *  `fkey_only_id` is a normal way to read a node -- yunovatios reads every
 *  device that way -- and it collapses a link to the bare id. Reading only
 *  the `topic^id^hook` form made every such link look like no link at all.
 */
test("reads a link collapsed by fkey_only_id, list or bare", () => {
    expect(yui_asset_id(["7b09b140"])).toBe("7b09b140");
    expect(yui_asset_id("7b09b140")).toBe("7b09b140");
    expect(yui_asset_ids(["p1", "p2"])).toEqual(["p1", "p2"]);
});

/*
 *  An UNSET single-valued fkey comes back as an EMPTY LIST, not as an empty
 *  string: that is the shape of "this device has no photo".
 */
test("an unset single-valued fkey is an empty list", () => {
    expect(yui_asset_id([])).toBe(null);
    expect(yui_asset_ids([])).toEqual([]);
});

test("reads an EXPANDED ref, which is what the refs options give back", () => {
    expect(yui_asset_id({id: "abc123", content_type: "image/jpeg"})).toBe("abc123");
});

/*
 *  An empty column is the normal state of a device nobody photographed. It
 *  must answer "nothing", never throw and never a half-parsed id.
 */
test("an empty or malformed column yields nothing, and does not throw", () => {
    expect(yui_asset_ids(null)).toEqual([]);
    expect(yui_asset_ids(undefined)).toEqual([]);
    expect(yui_asset_ids("")).toEqual([]);
    expect(yui_asset_ids([])).toEqual([]);
    expect(yui_asset_id(null)).toBe(null);
    expect(yui_asset_id({})).toBe(null);
    expect(yui_asset_ids(["assets^ok^as_foto", null, ""])).toEqual(["ok"]);
});

/*
 *  The two shapes the backend answers with, and the ONE code path they
 *  exist to give the caller.
 */
test("a signed url is used as it comes", () => {
    expect(yui_asset_src({
        mode: "url",
        url: "/assets/ab/cd/abcd.jpg?e=1&s=tok",
    })).toBe("/assets/ab/cd/abcd.jpg?e=1&s=tok");
});

test("inline bytes become a data url carrying their own type", () => {
    expect(yui_asset_src({
        mode: "inline",
        content_type: "image/jpeg",
        content64: "AAAA",
    })).toBe("data:image/jpeg;base64,AAAA");
});

/*
 *  Anything else is MISSING, and must come back as null rather than as an
 *  empty string: <img src=""> reloads the page in some browsers, which is a
 *  worse failure than the one being reported.
 */
test("an unusable answer is null, never an empty src", () => {
    expect(yui_asset_src(null)).toBe(null);
    expect(yui_asset_src({})).toBe(null);
    expect(yui_asset_src({mode: "url"})).toBe(null);
    expect(yui_asset_src({mode: "inline", content_type: "image/png"})).toBe(null);
    expect(yui_asset_src({mode: "url", url: ""})).toBe(null);
});
