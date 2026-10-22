// @vitest-environment jsdom
/***********************************************************************
 *          selector_from_data.wiring.test.js
 *
 *      A NAME IS DATA, NOT A SELECTOR (REV-CLOUD V40.3.1).
 *
 *      The G6 views gave their canvas mount the id
 *      `<prefix><gobj name>` and found it again with
 *      `querySelector("#" + id)`. A gobj name may hold any character,
 *      and gui_agent names its gobj tree window
 *      `<encoded node>~<encoded key>`:
 *
 *        - `~` is a CSS combinator: the lookup answered null, so every
 *          open logged "no canvas mount" and the canvas never resized;
 *        - `%` (a `^` encoded as `%5E`) makes the selector INVALID:
 *          querySelector THROWS, out of mt_start and out of the host's
 *          action, and leaves an orphan window behind it -- every later
 *          open of that card is "service ALREADY registered";
 *        - `.` turns the rest of the id into a class.
 *
 *      The real gclasses, in jsdom (whose querySelector throws on an
 *      invalid selector as a browser does -- asserted first, or the
 *      test proves nothing), on a G6 Graph double.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {describe, test, expect, beforeAll, beforeEach, vi} from "vitest";

/*  What each view watches: the element it handed to observe().  */
const observed = vi.hoisted(() => []);
globalThis.ResizeObserver = class {
    observe($el) {
        observed.push($el);
    }
    unobserve() {
    }
    disconnect() {
    }
};

vi.mock("@antv/g6", async (importOriginal) => {
    const real = await importOriginal();
    class FakeGraph {
        constructor(options) {
            this.options = options;
            return new Proxy(this, {
                get: (t, k) => (k in t) ? t[k] : (() => undefined),
            });
        }
        render() {
            return Promise.resolve();
        }
        draw() {
            return Promise.resolve();
        }
        on() {
        }
        getZoom() {
            return 1;
        }
        getPosition() {
            return [0, 0];
        }
        zoomTo() {
            return Promise.resolve();
        }
        translateTo() {
            return Promise.resolve();
        }
        getData() {
            return {nodes: [], edges: [], combos: []};
        }
        getNodeData() {
            return [];
        }
        getEdgeData() {
            return [];
        }
        getPlugins() {
            return [];
        }
        getBehaviors() {
            return [];
        }
        getOptions() {
            return {behaviors: []};
        }
        getCanvas() {
            return {getLayers: () => ({}), getContainer: () => null};
        }
        fitView() {
            return Promise.resolve();
        }
        destroy() {
        }
    }
    return {...real, Graph: FakeGraph};
});

const {
    SDATA_END, gclass_create, gobj_start_up, gobj_create_yuno, gobj_create,
    gobj_create_pure_child, gobj_start, gobj_read_attr, gobj_read_str_attr,
    gobj_find_service, gobj_name, set_log_callback, register_c_timer,
} = await import("@yuneta/gobj-js");
const {register_c_yui_gobj_tree_js} = await import("./c_yui_gobj_tree_js.js");
const {register_c_yui_json_graph} = await import("./c_yui_json_graph.js");
const {register_c_yui_fsm_graph} = await import("./c_yui_fsm_graph.js");
const {register_c_yui_window} = await import("./c_yui_window.js");
const {open_gobj_tree_view, close_gobj_tree_view} = await import("./yui_gobj_tree_view.js");
const {css_string, find_by_id} = await import("./yui_selector.js");

const logged = [];
let yuno = null;
let host = null;
let seq = 0;

/*  The names of the review, and the old one with a dot.  */
const NAMES = [
    "local~gate",               /*  gui_agent 0.29.106: node~key  */
    "n~x%5Ey",                  /*  a `^` in the key, encoded  */
    "node.a~key.b",             /*  a dot: a class selector  */
    "a b#c:d[e]\"f\\g",         /*  what clean_name() leaves and what it does not  */
];

beforeAll(async () => {
    const i18next = (await import("i18next")).default;
    await i18next.init({lng: "en", resources: {en: {translation: {}}}});
    gobj_start_up(null, null, null, null, null, null, null);
    set_log_callback((level, msg) => {
        logged.push({level: String(level), msg: String(msg)});
    });
    register_c_timer();
    register_c_yui_gobj_tree_js();
    register_c_yui_json_graph();
    register_c_yui_fsm_graph();
    register_c_yui_window();
    gclass_create("C_TEST_SEL_YUNO", [], [["ST_IDLE", []]], {}, 0,
        [SDATA_END()], {}, 0, 0, 0, 0);
    gclass_create("C_TEST_SEL_HOST",
        [["EV_TREE_WANTED", 0], ["EV_TRACE_INFO_WANTED", 0],
         ["EV_SET_TRACE_LEVEL", 0], ["EV_GCLASS_WANTED", 0]],
        [["ST_IDLE", [
            ["EV_TREE_WANTED",       null, null],
            ["EV_TRACE_INFO_WANTED", null, null],
            ["EV_SET_TRACE_LEVEL",   null, null],
            ["EV_GCLASS_WANTED",     null, null],
        ]]],
        {}, 0, [SDATA_END()], {}, 0, 0, 0, 0);
    yuno = gobj_create_yuno("sel_yuno", "C_TEST_SEL_YUNO", {});
    host = gobj_create("host", "C_TEST_SEL_HOST", {}, yuno);
});

beforeEach(() => {
    logged.length = 0;
    observed.length = 0;
});

function problems()
{
    return logged.filter((l) => l.level === "error" || l.level === "warning").map((l) => l.msg);
}

function settle()
{
    return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("the environment is a browser for selectors", () => {
    test("jsdom's querySelector throws on an invalid selector, and reads `~` as a combinator", () => {
        const $root = document.createElement("div");
        const $a = document.createElement("div");
        $a.id = "gobj-tree-canvas-gobj-tree-local~gate";
        $root.appendChild($a);
        const $b = document.createElement("div");
        $b.id = "gobj-tree-canvas-gobj-tree-n~x%5Ey";
        $root.appendChild($b);

        expect($root.querySelector("#" + $a.id)).toBe(null);
        expect(() => $root.querySelector("#" + $b.id)).toThrow(/selector/i);
    });
});

describe("yui_selector.js", () => {
    test("find_by_id() finds any id, in a detached tree, and only below the root", () => {
        const $root = document.createElement("div");
        for(const name of NAMES) {
            const $el = document.createElement("div");
            $el.id = "x-" + name;
            const $wrap = document.createElement("section");
            $wrap.appendChild($el);
            $root.appendChild($wrap);
            expect(find_by_id($root, "x-" + name)).toBe($el);
        }
        $root.id = "the-root";
        expect(find_by_id($root, "the-root")).toBe(null);
        expect(find_by_id($root, "x-absent")).toBe(null);
        expect(find_by_id(null, "x")).toBe(null);
        expect(find_by_id($root, "")).toBe(null);
    });

    test("css_string() quotes any value for an attribute selector", () => {
        const $root = document.createElement("div");
        const values = NAMES.concat(["a\"]b", "back\\slash", "new\nline", "tab\there", "]'\""]);
        for(const v of values) {
            const $el = document.createElement("a");
            $el.setAttribute("data-v", v);
            $root.appendChild($el);
        }
        for(const v of values) {
            const $found = $root.querySelector('[data-v="' + css_string(v) + '"]');
            expect($found, JSON.stringify(v)).toBeTruthy();
            expect($found.getAttribute("data-v")).toBe(v);
        }
    });
});

describe("C_YUI_GOBJ_TREE_JS in a window named by data", () => {
    for(const name of NAMES) {
        test(`open_gobj_tree_view(${JSON.stringify(name)}): the canvas is found and watched`, async () => {
            let handle = null;
            expect(() => {
                handle = open_gobj_tree_view(host, {source: "remote", name: name, title: name});
            }).not.toThrow();
            expect(handle).toBeTruthy();
            expect(handle.win).toBeTruthy();
            await settle();

            const canvas_id = gobj_read_str_attr(handle.tree, "canvas_id");
            const $canvas = document.getElementById(canvas_id);
            expect($canvas).toBeTruthy();
            expect(observed).toContain($canvas);
            expect(problems()).toEqual([]);

            /*  Closed and opened again: nothing was left registered.  */
            const win_name = gobj_name(handle.win);
            close_gobj_tree_view(handle);
            expect(gobj_find_service(win_name, false)).toBeFalsy();
            const again = open_gobj_tree_view(host, {source: "remote", name: name, title: name});
            expect(again && again.win).toBeTruthy();
            await settle();
            expect(problems()).toEqual([]);
            close_gobj_tree_view(again);
        });
    }
});

async function mount(gclass_name, name, attrs)
{
    const $container = document.createElement("div");
    document.body.appendChild($container);
    const view = gobj_create_pure_child(name, gclass_name,
        Object.assign({$container: $container}, attrs), yuno);
    document.body.appendChild(gobj_read_attr(view, "$container"));
    gobj_start(view);
    await settle();
    return view;
}

const FSM = {
    entry_state: "ST_IDLE",
    states: [{name: "ST_IDLE"}, {name: "ST_BUSY"}],
    rows: [
        {event: "EV_GO",   cells: [{next_state: "ST_BUSY"}, null]},
        {event: "EV_DONE", cells: [null, {next_state: "ST_IDLE"}]},
    ],
    published: [],
    unreachable: [],
};

describe("the other G6 views named by data", () => {
    for(const name of NAMES) {
        test(`C_YUI_JSON_GRAPH ${JSON.stringify(name)}: fold handles and resize on its canvas`, async () => {
            let view = null;
            await expect((async () => {
                view = await mount("C_YUI_JSON_GRAPH", `json-${++seq}-${name}`, {json_data: {a: 1}});
            })()).resolves.toBeUndefined();
            const $canvas = document.getElementById(gobj_read_str_attr(view, "canvas_id"));
            expect($canvas).toBeTruthy();
            expect(view.priv.fold_listener).toBeTruthy();
            expect(observed).toContain($canvas);
            expect(problems()).toEqual([]);
        });

        test(`C_YUI_FSM_GRAPH ${JSON.stringify(name)}: the graph is built on its canvas`, async () => {
            let view = null;
            await expect((async () => {
                view = await mount("C_YUI_FSM_GRAPH", `fsm-${++seq}-${name}`, {fsm: FSM});
            })()).resolves.toBeUndefined();
            const $canvas = document.getElementById(gobj_read_str_attr(view, "canvas_id"));
            expect($canvas).toBeTruthy();
            expect(view.priv.graph).toBeTruthy();
            expect(problems()).toEqual([]);
        });
    }
});
