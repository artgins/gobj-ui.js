/***********************************************************************
 *          node_tree_model.test.js
 *
 *      Unit tests for the pure node-tree helpers.
 ***********************************************************************/
import { describe, test, expect } from "vitest";
import {
    chrome_visible,
    split_subpath,
    head_tail,
    join_route,
    projection_renders,
    child_nav_items,
    nav_route_with_tail,
    normalize_spec,
    is_nav_mode,
    nav_mode_renders,
    nav_mode_depth,
} from "./node_tree_model.js";


/***************************************************************
 *      subpath splitting
 ***************************************************************/
test("split_subpath drops empty segments", () => {
    expect(split_subpath("a/b/c")).toEqual(["a", "b", "c"]);
    expect(split_subpath("/a//b/")).toEqual(["a", "b"]);
    expect(split_subpath("")).toEqual([]);
    expect(split_subpath(null)).toEqual([]);
});

test("head_tail names the child and hands down the rest", () => {
    expect(head_tail("energy/north/m1")).toEqual({head: "energy", tail: "north/m1"});
    expect(head_tail("energy")).toEqual({head: "energy", tail: ""});
    expect(head_tail("")).toEqual({head: "", tail: ""});
});


/***************************************************************
 *      canonical routes
 ***************************************************************/
test("join_route builds the canonical route of a node", () => {
    expect(join_route("/cards", ["energy", "north"])).toBe("/cards/energy/north");
    expect(join_route("/cards", [])).toBe("/cards");
    expect(join_route("/cards/", ["a"])).toBe("/cards/a");
    expect(join_route("cards", ["a"])).toBe("/cards/a");
    expect(join_route("/", ["a", "b"])).toBe("/a/b");
});


/***************************************************************
 *      projections
 ***************************************************************/
test("no projection means: show my children as cards, no chrome", () => {
    expect(projection_renders(undefined, "index")).toEqual([{layout: "cards"}]);
    expect(projection_renders(undefined, "chrome")).toEqual([]);
});

test("a bare string or render object is the INDEX projection only", () => {
    expect(projection_renders("vertical", "index")).toEqual([{layout: "vertical"}]);
    expect(projection_renders("vertical", "chrome")).toEqual([]);
    expect(projection_renders({layout: "cards", show_label: false}, "index"))
        .toEqual([{layout: "cards", show_label: false}]);
});

test("index + chrome, chrome as an array (tabs on desktop, backbar on mobile)", () => {
    let p = {
        index: {layout: "cards"},
        chrome: [
            {layout: "tabs", show_on: ">=tablet"},
            {layout: "backbar", show_on: "<tablet"}
        ]
    };
    expect(projection_renders(p, "index")).toEqual([{layout: "cards"}]);
    expect(projection_renders(p, "chrome")).toEqual([
        {layout: "tabs", show_on: ">=tablet"},
        {layout: "backbar", show_on: "<tablet"}
    ]);
});

test("projection_renders returns copies, never the caller's objects", () => {
    let p = {index: {layout: "cards"}};
    let r = projection_renders(p, "index");
    r[0].layout = "tabs";
    expect(p.index.layout).toBe("cards");
});


/***************************************************************
 *      children → nav items
 ***************************************************************/
test("child_nav_items builds C_YUI_NAV items with canonical routes", () => {
    let children = [
        {id: "a", label: "Alpha", icon: "yi-eye", tooltip: "", disabled: false},
        {id: "b", label: "Beta",  icon: "",       tooltip: "hi", disabled: true},
    ];
    let items = child_nav_items(children, (id) => `/cards/${id}`);
    expect(items).toEqual([
        {id: "a", name: "Alpha", route: "/cards/a", icon: "yi-eye"},
        {id: "b", name: "Beta",  route: "/cards/b", tooltip: "hi", disabled: true},
    ]);
});


/***************************************************************
 *      spec validation
 ***************************************************************/
test("normalize_spec fills defaults and recurses into children", () => {
    let errors = [];
    let spec = normalize_spec({
        id: "root",
        children: [
            {id: "a", label: "Alpha", content: {gclass: "C_TEST_VIEW"}},
            {id: "b"}
        ]
    }, errors, "/");

    expect(errors).toEqual([]);
    expect(spec.id).toBe("root");
    expect(spec.label).toBe("root");            /*  label defaults to id  */
    expect(spec.children.length).toBe(2);
    expect(spec.children[0].content).toEqual({gclass: "C_TEST_VIEW", kw: {}});
    expect(spec.children[1].label).toBe("b");
    expect(spec.children[1].content).toBe(null);
});

test("an id is ONE url segment", () => {
    let errors = [];
    expect(normalize_spec({id: "a/b"}, errors, "/")).toBe(null);
    expect(errors.length).toBe(1);
    expect(errors[0]).toMatch(/contains '\/'/);
});

test("a node without id is rejected, loudly", () => {
    let errors = [];
    expect(normalize_spec({label: "no id"}, errors, "/")).toBe(null);
    expect(errors[0]).toMatch(/has no 'id'/);
});

test("sibling ids must be unique — they are url segments", () => {
    let errors = [];
    expect(normalize_spec({
        id: "root",
        children: [{id: "dup"}, {id: "dup"}]
    }, errors, "/")).toBe(null);
    expect(errors.some((e) => /duplicated child id 'dup'/.test(e))).toBe(true);
});

test("an unknown layout is a config error, not a silent fallback", () => {
    let errors = [];
    expect(normalize_spec({id: "x", projection: "carousel"}, errors, "/")).toBe(null);
    expect(errors[0]).toMatch(/unknown projection layout 'carousel'/);

    errors = [];
    expect(normalize_spec({
        id: "x",
        projection: {index: {layout: "grid"}}
    }, errors, "/")).toBe(null);
    expect(errors[0]).toMatch(/unknown projection.index layout 'grid'/);
});

test("content needs a gclass", () => {
    let errors = [];
    expect(normalize_spec({id: "x", content: {kw: {}}}, errors, "/")).toBe(null);
    expect(errors[0]).toMatch(/'content.gclass' is required/);
});

test("errors name the offending node's path", () => {
    let errors = [];
    normalize_spec({
        id: "root",
        children: [{id: "energy", children: [{label: "orphan"}]}]
    }, errors, "/");
    expect(errors[0]).toMatch(/'\/root\/energy\/'/);
});


/***************************************************************
 *      chrome depth
 ***************************************************************/
test("no declared chrome_depth means every ancestor paints its strip", () => {
    expect(chrome_visible(1, null)).toBe(true);
    expect(chrome_visible(5, null)).toBe(true);
    expect(chrome_visible(3, undefined)).toBe(true);
});

test("chrome_depth caps how many strips are painted above the tip", () => {
    /*  distance 1 is the tip's own parent  */
    expect(chrome_visible(1, 1)).toBe(true);
    expect(chrome_visible(2, 1)).toBe(false);
    expect(chrome_visible(3, 1)).toBe(false);
    expect(chrome_visible(1, 0)).toBe(false);      /*  no chrome at all  */
    expect(chrome_visible(2, 2)).toBe(true);
});

test("chrome_depth is validated as a non-negative integer", () => {
    let errors = [];
    expect(normalize_spec({id: "x", chrome_depth: 2}, errors, "/").chrome_depth).toBe(2);
    expect(normalize_spec({id: "x", chrome_depth: 0}, errors, "/").chrome_depth).toBe(0);
    expect(normalize_spec({id: "x"}, errors, "/").chrome_depth).toBe(-1);   /*  inherit  */
    expect(errors).toEqual([]);

    expect(normalize_spec({id: "x", chrome_depth: -2}, errors, "/")).toBe(null);
    expect(errors[0]).toMatch(/must be an integer >= 0/);
});

test("normalize_spec accepts its own output (every level re-normalizes)", () => {
    let errors = [];
    let once = normalize_spec({
        id: "root",
        chrome_depth: 1,
        children: [{id: "a", children: [{id: "b"}]}]
    }, errors, "/");
    let twice = normalize_spec(once, errors, "/");
    expect(errors).toEqual([]);
    expect(twice).toEqual(once);
});


/***************************************************************
 *      aliases — the tree's paths are a contract
 ***************************************************************/
test("aliases carry the former ids of a node", () => {
    let errors = [];
    let spec = normalize_spec({id: "north", aliases: ["hall1", "h1"]}, errors, "/");
    expect(errors).toEqual([]);
    expect(spec.aliases).toEqual(["hall1", "h1"]);
    expect(normalize_spec({id: "x"}, errors, "/").aliases).toEqual([]);
});

test("an alias is one url segment, like an id", () => {
    let errors = [];
    expect(normalize_spec({id: "x", aliases: ["a/b"]}, errors, "/")).toBe(null);
    expect(errors[0]).toMatch(/is not a valid id/);

    errors = [];
    expect(normalize_spec({id: "x", aliases: "hall1"}, errors, "/")).toBe(null);
    expect(errors[0]).toMatch(/'aliases' must be an array/);
});


/***************************************************************
 *      link — where structure ends and data begins
 ***************************************************************/
test("a link declares the data space and its viewer", () => {
    let errors = [];
    let spec = normalize_spec({
        id: "m1",
        link: {kind: "tranger", gclass: "C_TRANGER_VIEW", kw: {topic: "t"}}
    }, errors, "/");
    expect(errors).toEqual([]);
    expect(spec.link).toEqual({
        kind: "tranger", gclass: "C_TRANGER_VIEW", kw: {topic: "t"}
    });
    expect(normalize_spec({id: "x"}, errors, "/").link).toBe(null);
});

test("a link needs both what it points into and what reads it", () => {
    let errors = [];
    expect(normalize_spec({id: "m1", link: {gclass: "C_V"}}, errors, "/")).toBe(null);
    expect(errors[0]).toMatch(/'link.kind' is required/);

    errors = [];
    expect(normalize_spec({id: "m1", link: {kind: "tranger"}}, errors, "/")).toBe(null);
    expect(errors[0]).toMatch(/'link.gclass' is required/);
});

test("below a link there are no nodes — link + children is a contradiction", () => {
    let errors = [];
    expect(normalize_spec({
        id: "m1",
        link: {kind: "tranger", gclass: "C_V"},
        children: [{id: "nope"}]
    }, errors, "/")).toBe(null);
    expect(errors.some((e) => /both 'link' and 'children'/.test(e))).toBe(true);
});

test("a link IS the node's content — declaring both is rejected", () => {
    let errors = [];
    expect(normalize_spec({
        id: "m1",
        content: {gclass: "C_OTHER"},
        link: {kind: "tranger", gclass: "C_V"}
    }, errors, "/")).toBe(null);
    expect(errors.some((e) => /both 'link' and 'content'/.test(e))).toBe(true);
});


/***************************************************************
 *      navigation modes
 ***************************************************************/
const DECLARED = {
    index:  {layout: "cards"},
    chrome: [
        {layout: "tabs", show_on: ">=tablet"},
        {layout: "backbar", show_on: "<tablet"}
    ]
};

test("only the three modes are modes", () => {
    expect(is_nav_mode("stack")).toBe(true);
    expect(is_nav_mode("back")).toBe(true);
    expect(is_nav_mode("path")).toBe(true);
    expect(is_nav_mode("breadcrumb")).toBe(false);   /*  that is a LAYOUT  */
    expect(is_nav_mode("")).toBe(false);
});

test("stack gives back exactly what the node declared", () => {
    expect(nav_mode_renders(DECLARED, "stack", "chrome", true))
        .toEqual(DECLARED.chrome);
    expect(nav_mode_renders("vertical", "stack", "index", false))
        .toEqual([{layout: "vertical"}]);
    /*  An unknown mode must not silently reshape a tree  */
    expect(nav_mode_renders(DECLARED, "nonsense", "chrome", true))
        .toEqual(DECLARED.chrome);
});

test("back replaces every chrome with one backbar, and drops the trail", () => {
    expect(nav_mode_renders(DECLARED, "back", "chrome", true))
        .toEqual([{layout: "backbar"}]);
    expect(nav_mode_renders(DECLARED, "back", "chrome", false))
        .toEqual([{layout: "backbar"}]);
    expect(nav_mode_renders({path: {layout: "breadcrumb"}}, "back", "path", true))
        .toEqual([]);
});

test("path draws the trail ONCE, at the root, and no strips anywhere", () => {
    expect(nav_mode_renders(DECLARED, "path", "path", true))
        .toEqual([{layout: "breadcrumb"}]);
    expect(nav_mode_renders(DECLARED, "path", "path", false)).toEqual([]);
    expect(nav_mode_renders(DECLARED, "path", "chrome", true)).toEqual([]);
    expect(nav_mode_renders(DECLARED, "path", "chrome", false)).toEqual([]);
});

test("the index projection survives every mode", () => {
    for(const mode of ["stack", "back", "path"]) {
        expect(nav_mode_renders(DECLARED, mode, "index", true))
            .toEqual([{layout: "cards"}]);
    }
    /*  and an undeclared projection keeps defaulting to cards  */
    expect(nav_mode_renders(null, "path", "index", true))
        .toEqual([{layout: "cards"}]);
});

test("back is depth 1 and path is depth 0, whatever the tree declared", () => {
    expect(nav_mode_depth(null, "back")).toBe(1);
    expect(nav_mode_depth(3, "back")).toBe(1);
    expect(nav_mode_depth(null, "path")).toBe(0);
    expect(nav_mode_depth(3, "path")).toBe(0);
    /*  stack keeps the declaration, unlimited included  */
    expect(nav_mode_depth(null, "stack")).toBe(null);
    expect(nav_mode_depth(2, "stack")).toBe(2);
});

describe("nav_route_with_tail — a nav item that points where you left", () => {
    test("no tail is the canonical route: the child's own home", () => {
        expect(nav_route_with_tail("/schemas/db", "")).toBe("/schemas/db");
        expect(nav_route_with_tail("/schemas/db", null)).toBe("/schemas/db");
        expect(nav_route_with_tail("/schemas/db", undefined)).toBe("/schemas/db");
    });

    test("a tail is appended, which is the whole point", () => {
        expect(nav_route_with_tail("/schemas/db", "users")).toBe("/schemas/db/users");
        expect(nav_route_with_tail("/schemas/db", "users/info"))
            .toBe("/schemas/db/users/info");
    });

    test("it never doubles a slash, whichever side carries one", () => {
        expect(nav_route_with_tail("/schemas/db/", "users")).toBe("/schemas/db/users");
        expect(nav_route_with_tail("/schemas/db", "/users")).toBe("/schemas/db/users");
        expect(nav_route_with_tail("/schemas/db/", "/users/")).toBe("/schemas/db/users");
    });

    test("a tail of only slashes is no tail", () => {
        expect(nav_route_with_tail("/schemas/db", "/")).toBe("/schemas/db");
    });

    test("no route at all is not a crash", () => {
        expect(nav_route_with_tail("", "users")).toBe("/users");
        expect(nav_route_with_tail(null, null)).toBe("");
    });
});
