/***********************************************************************
 *          json_view_helpers.test.js
 *
 *      Unit tests for the pure logic of C_YUI_JSON.
 *      Run with: npm test
 ***********************************************************************/
import { test, expect } from "vitest";
import {
    json_type,
    is_collapsed,
    seg_join,
    seg_split,
    get_by_segments,
    set_by_segments,
    subtree_matches,
    is_time_field,
    format_epoch,
    json_text_dump,
} from "./json_view_helpers.js";


/*============================================================
 *      json_type
 *============================================================*/
test("json_type discriminates every JSON kind", () => {
    expect(json_type(null)).toBe("null");
    expect(json_type("x")).toBe("string");
    expect(json_type(3)).toBe("number");
    expect(json_type(true)).toBe("boolean");
    expect(json_type([])).toBe("array");
    expect(json_type({})).toBe("object");
});


/*============================================================
 *      is_collapsed — both kernel sentinel shapes
 *============================================================*/
test("is_collapsed detects the dict sentinel", () => {
    let v = {__collapsed__: {path: "topics`nodes", size: 4231}};
    let c = is_collapsed(v);
    expect(c).not.toBeNull();
    expect(c.size).toBe(4231);
    expect(c.path).toBe("topics`nodes");
    expect(c.is_array).toBe(false);
});

test("is_collapsed detects the array sentinel", () => {
    let v = [{__collapsed__: {path: "topics`rows", size: 99}}];
    let c = is_collapsed(v);
    expect(c).not.toBeNull();
    expect(c.size).toBe(99);
    expect(c.is_array).toBe(true);
});

test("is_collapsed ignores ordinary dicts/arrays", () => {
    expect(is_collapsed({a: 1, __collapsed__: 2})).toBeNull();
    expect(is_collapsed({a: 1})).toBeNull();
    expect(is_collapsed([1, 2])).toBeNull();
    expect(is_collapsed([{a: 1}])).toBeNull();
    expect(is_collapsed("x")).toBeNull();
});


/*============================================================
 *      segments algebra
 *============================================================*/
test("seg_join / seg_split round-trip with the backtick delimiter", () => {
    expect(seg_join(["topics", "nodes", 4])).toBe("topics`nodes`4");
    expect(seg_split("topics`nodes`4")).toEqual(["topics", "nodes", "4"]);
    expect(seg_split("")).toEqual([]);
    expect(seg_join([])).toBe("");
});

test("get_by_segments walks dicts and arrays (numeric index)", () => {
    let root = {a: {b: [{id: "x"}, {id: "y"}]}};
    expect(get_by_segments(root, ["a", "b", "1", "id"])).toBe("y");
    expect(get_by_segments(root, ["a", "nope"])).toBeUndefined();
    expect(get_by_segments(root, [])).toBe(root);
});

test("set_by_segments splices a fetched subtree at a dict path", () => {
    let root = {topics: {nodes: {__collapsed__: {path: "topics`nodes", size: 5}}}};
    let full = {n1: {id: "n1"}, n2: {id: "n2"}};
    set_by_segments(root, ["topics", "nodes"], full);
    expect(root.topics.nodes).toBe(full);
});

test("set_by_segments splices at an array index", () => {
    let root = {rows: [ [{__collapsed__: {path: "rows`0", size: 3}}] ]};
    set_by_segments(root, ["rows", "0"], [10, 20, 30]);
    expect(root.rows[0]).toEqual([10, 20, 30]);
});

test("set_by_segments with [] returns the replacement (root swap)", () => {
    let out = set_by_segments({old: 1}, [], {fresh: 2});
    expect(out).toEqual({fresh: 2});
});


/*============================================================
 *      subtree_matches
 *============================================================*/
test("subtree_matches finds a term in keys and primitive values", () => {
    let v = {alpha: {beta: "HELLO world"}};
    expect(subtree_matches(v, "hello")).toBe(true);
    expect(subtree_matches(v, "beta")).toBe(true);
    expect(subtree_matches(v, "missing")).toBe(false);
});

test("subtree_matches never matches inside a collapsed subtree", () => {
    let v = {__collapsed__: {path: "x", size: 9}};
    expect(subtree_matches(v, "x")).toBe(false);
});

test("subtree_matches with empty term is always true", () => {
    expect(subtree_matches({a: 1}, "")).toBe(true);
});


/*============================================================
 *      time fields
 *============================================================*/
test("is_time_field matches the kernel timestamp field set", () => {
    ["__t__", "t", "tm", "from_t", "to_t", "t_input"].forEach((f) => {
        expect(is_time_field(f)).toBe(true);
    });
    expect(is_time_field("name")).toBe(false);
});

test("format_epoch handles seconds, milliseconds and the unset case", () => {
    expect(format_epoch(0)).toBeNull();
    expect(format_epoch(-5)).toBeNull();
    expect(format_epoch("x")).toBeNull();
    expect(typeof format_epoch(1700000000)).toBe("string");        // seconds
    expect(typeof format_epoch(1700000000000)).toBe("string");     // milliseconds
});


/*============================================================
 *      text view dump
 *============================================================*/
test("json_text_dump indents four characters, like every other tree", () => {
    let d = json_text_dump({a: {b: 1}}, 0);
    expect(d.capped).toBe(false);
    expect(d.error).toBeUndefined();
    expect(d.text).toBe('{\n    "a": {\n        "b": 1\n    }\n}');
});

test("json_text_dump prints a collapsed sentinel verbatim", () => {
    let d = json_text_dump({rows: {__collapsed__: {path: "rows", size: 900}}}, 0);
    expect(d.text).toContain("__collapsed__");
    expect(d.text).toContain("900");
});

test("json_text_dump cuts at max_chars and says so", () => {
    let d = json_text_dump({a: "x".repeat(500)}, 100);
    expect(d.capped).toBe(true);
    expect(d.text.length).toBe(100);
});

test("json_text_dump does not cap when max_chars is absent or zero", () => {
    let big = {a: "x".repeat(500)};
    expect(json_text_dump(big, 0).capped).toBe(false);
    expect(json_text_dump(big).capped).toBe(false);
});

test("json_text_dump reports a document with no JSON form instead of printing nothing", () => {
    let circular = {};
    circular.self = circular;
    let d = json_text_dump(circular, 0);
    expect(d.text).toBe("");
    expect(typeof d.error).toBe("string");

    let d2 = json_text_dump(undefined, 0);
    expect(d2.text).toBe("");
    expect(typeof d2.error).toBe("string");
});
