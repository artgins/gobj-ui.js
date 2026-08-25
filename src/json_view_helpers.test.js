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
    pick_view_mode,
    container_label,
    is_pure_collection,
    has_branch,
    count_branches,
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

/***************************************************************
 *      pick_view_mode()
 ***************************************************************/
const MODES = ["text", "tree", "graph"];

test("pick_view_mode: the tree when nothing is said", () => {
    expect(pick_view_mode("", "", MODES, "tree")).toBe("tree");
    expect(pick_view_mode(undefined, undefined, MODES, "tree")).toBe("tree");
    expect(pick_view_mode(null, null, MODES, "tree")).toBe("tree");
});

test("pick_view_mode: what the reader chose last wins over the fallback", () => {
    expect(pick_view_mode("", "graph", MODES, "tree")).toBe("graph");
    expect(pick_view_mode("", "text", MODES, "tree")).toBe("text");
});

test("pick_view_mode: the host outranks the memory", () => {
    expect(pick_view_mode("text", "graph", MODES, "tree")).toBe("text");
    /*  And "tree" asked for explicitly is a choice, not a default:
     *  it has to beat a remembered graph. */
    expect(pick_view_mode("tree", "graph", MODES, "tree")).toBe("tree");
});

test("pick_view_mode: a mode no longer offered is treated as unsaid", () => {
    /*  A string left in the store by an older release. */
    expect(pick_view_mode("", "webix", MODES, "tree")).toBe("tree");
    expect(pick_view_mode("webix", "graph", MODES, "tree")).toBe("graph");
});

test("pick_view_mode: no mode table at all still answers the fallback", () => {
    expect(pick_view_mode("graph", "text", undefined, "tree")).toBe("tree");
    expect(pick_view_mode("graph", "text", [], "tree")).toBe("tree");
});

/***************************************************************
 *      container_label()
 ***************************************************************/
test("container_label: a dict with a scalar id is labelled by it", () => {
    expect(container_label({id: "LAB-001-001-E-001", name: "x"}, 40))
        .toBe("LAB-001-001-E-001");
    expect(container_label({id: 42}, 40)).toBe("42");
    expect(container_label({id: false}, 40)).toBe("false");
});

test("container_label: nothing to say without a scalar id", () => {
    expect(container_label({name: "x"}, 40)).toBe("");
    expect(container_label({}, 40)).toBe("");
    expect(container_label({id: {a: 1}}, 40)).toBe("");
    expect(container_label({id: [1, 2]}, 40)).toBe("");
    expect(container_label({id: null}, 40)).toBe("");
    expect(container_label({id: "   "}, 40)).toBe("");
});

test("container_label: an array is not a record", () => {
    expect(container_label([{id: "a"}], 40)).toBe("");
    expect(container_label(null, 40)).toBe("");
    expect(container_label("id", 40)).toBe("");
});

test("container_label: cut at max_chars, and said with an ellipsis", () => {
    let uuid = "ff14fc16-2cb2-472c-9c0a-89fa43837130";
    expect(container_label({id: uuid}, 8)).toBe("ff14fc16…");
    expect(container_label({id: uuid}, 0)).toBe(uuid);
    expect(container_label({id: uuid}, undefined)).toBe(uuid);
});

/***************************************************************
 *      has_branch() / count_branches() / is_pure_collection()
 ***************************************************************/
test("has_branch: only a NON-EMPTY container branches", () => {
    expect(has_branch({a: 1})).toBe(true);
    expect(has_branch([1])).toBe(true);
    expect(has_branch({})).toBe(false);
    expect(has_branch([])).toBe(false);
    expect(has_branch("x")).toBe(false);
    expect(has_branch(0)).toBe(false);
    expect(has_branch(null)).toBe(false);
});

test("count_branches: counts what gets a card, not what is there", () => {
    expect(count_branches({a: 1, b: {}, c: {x: 1}, d: [1]})).toBe(2);
    expect(count_branches([{}, [], {a: 1}])).toBe(1);
    expect(count_branches({a: 1})).toBe(0);
    expect(count_branches("x")).toBe(0);
});

test("is_pure_collection: a LIST of things, not a thing", () => {
    /*  Every entry a container with something in it. */
    expect(is_pure_collection([{a: 1}, {b: 2}])).toBe(true);
    expect(is_pure_collection({x: {a: 1}, y: [1]})).toBe(true);

    /*  One scalar is enough to make it a thing with content of its own,
     *  and so is an EMPTY container: `{0}` has no child card to show it. */
    expect(is_pure_collection([{a: 1}, 2])).toBe(false);
    expect(is_pure_collection({x: {a: 1}, n: 3})).toBe(false);
    expect(is_pure_collection([{a: 1}, {}])).toBe(false);

    expect(is_pure_collection([])).toBe(false);
    expect(is_pure_collection({})).toBe(false);
    expect(is_pure_collection("x")).toBe(false);
});

test("is_pure_collection: the schema this came from", () => {
    /*  The `devices` topic descriptor, cut to shape: `cols` is one key of
     *  the dict like `pkey` is, and the only one that branches. */
    let col = {id: "id", header: "Device", type: "string", flag: [], enum: {}};
    let topic = {
        topic_name: "devices",
        pkey: "id",
        pkey2s: [],             /*  empty: a row, not a branch  */
        tkey: "tm",
        system_flag: 1,
        topic_version: 3,
        cols: [col, col, col],
    };

    /*  The topic is NOT a pure collection: it has six scalar rows, so it
     *  keeps its card. */
    expect(is_pure_collection(topic)).toBe(false);
    expect(count_branches(topic)).toBe(1);

    /*  `cols` IS one: nothing but columns. It gets no card of its own --
     *  its row in the topic names it, and the columns hang from the topic. */
    expect(is_pure_collection(topic.cols)).toBe(true);
    expect(count_branches(topic.cols)).toBe(3);

    /*  A column has content, so it keeps its card. */
    expect(is_pure_collection(col)).toBe(false);
});
