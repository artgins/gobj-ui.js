/***********************************************************************
 *          g6_patches_first_graph.wiring.test.js
 *
 *      Every G6 view of the library is fixed for touch on its OWN, when
 *      it is the first graph of the page (REV-CLOUD V40.2 note 1).
 *
 *      gobj-ui replaces two built-ins of G6 -- `drag-canvas` (a pan
 *      that reads the pointer, not `movementX`, which a touch screen
 *      leaves at 0) and `zoom-canvas` (pinch) -- globally, the first
 *      time a view asks. C_YUI_TREEDB_SCHEMA asked only for the pinch
 *      and still put `drag-canvas` in its behaviors: as the first graph
 *      of a page it kept G6's own, and panned only when another view
 *      had been opened before it.
 *
 *      Each test starts from a fresh module registry -- the page before
 *      any graph -- and mounts ONE view, the real gclass on a G6 Graph
 *      double (the registry of behaviors is G6's own).
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {describe, test, expect, vi, beforeAll, beforeEach} from "vitest";
import {install_dom_double} from "../test/dom_double.js";

install_dom_double();

if(typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class {
        observe() {
        }
        unobserve() {
        }
        disconnect() {
        }
    };
}

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
        zoomTo() {
            return Promise.resolve();
        }
        destroy() {
        }
    }
    return {...real, Graph: FakeGraph};
});

const DESC = {topic_name: "users", cols: [
    {id: "id", type: "string", flag: ["persistent"]},
]};

/*  Each view: its module, its register function, what it needs to
 *  draw a first time. C_YUI_FSM_GRAPH goes first: the gobj tree
 *  registers it too (through C_YUI_GCLASS), and a gclass registered
 *  by an EARLIER evaluation of its module would run that module's
 *  code -- asserted below, so the order cannot hide a stale one.  */
const VIEWS = {
    C_YUI_FSM_GRAPH:     ["./c_yui_fsm_graph.js", "register_c_yui_fsm_graph", {fsm: {
        entry_state: "ST_IDLE",
        states: [{name: "ST_IDLE"}],
        rows: [],
        published: [],
        unreachable: [],
    }}],
    C_YUI_TREEDB_SCHEMA: ["./c_yui_treedb_schema.js", "register_c_yui_treedb_schema",
        {descs: {users: DESC}}],
    C_YUI_JSON_GRAPH:    ["./c_yui_json_graph.js", "register_c_yui_json_graph",
        {json_data: {a: 1}}],
    C_YUI_GOBJ_TREE_JS:  ["./c_yui_gobj_tree_js.js", "register_c_yui_gobj_tree_js", {}],
    C_G6_NODES_TREE:     ["./c_g6_nodes_tree.js", "register_c_g6_nodes_tree",
        {with_toolbar: false, operation_mode: "reading"}],
};

const gobj_js = await import("@yuneta/gobj-js");
const logged = [];
let yuno = null;

beforeAll(async () => {
    const i18next = (await import("i18next")).default;
    await i18next.init({lng: "en", resources: {en: {translation: {}}}});
    gobj_js.gobj_start_up(null, null, null, null, null, null, null);
    gobj_js.set_log_callback((level, msg) => {
        logged.push({level: String(level), msg: String(msg)});
    });
    gobj_js.register_c_timer();
    gobj_js.gclass_create("C_TEST_FIRST_GRAPH", [], [["ST_IDLE", []]], {}, 0,
        [gobj_js.SDATA_END()], {}, 0, 0, 0, 0);
    yuno = gobj_js.gobj_create_yuno("first_graph", "C_TEST_FIRST_GRAPH", {});
});

/*  gobj-js is a dependency, loaded once; the modules of THIS package
 *  are evaluated again for each test, their "patched once" flags
 *  with them.  */
beforeEach(() => {
    vi.resetModules();
    logged.length = 0;
});


describe("the first graph of a page takes both touch patches", () => {
    for(const [gclass_name, [module, register, attrs]] of Object.entries(VIEWS)) {
        test(`${gclass_name}, alone on the page`, async () => {
            const g6 = await import("@antv/g6");
            const B = g6.ExtensionCategory.BEHAVIOR;

            /*  A fresh page: G6's own behaviors, nobody patched yet. The
             *  mocked G6 survives resetModules(), so its registry is put
             *  back by hand; gobj-ui's modules (and their "patched once"
             *  flags) are evaluated again.  */
            g6.getExtensions(B)["drag-canvas"] = g6.DragCanvas;
            g6.getExtensions(B)["zoom-canvas"] = g6.ZoomCanvas;
            expect(g6.getExtension(B, "drag-canvas")).toBe(g6.DragCanvas);
            expect(g6.getExtension(B, "zoom-canvas")).toBe(g6.ZoomCanvas);

            expect(gobj_js.gclass_find_by_name(gclass_name, false)).toBeFalsy();
            const mod = await import(/* @vite-ignore */ module);
            mod[register]();

            const $container = document.createElement("div");
            document.body.appendChild($container);
            const view = gobj_js.gobj_create_pure_child(`view_${gclass_name}`, gclass_name,
                Object.assign({$container: $container}, attrs), yuno);
            document.body.appendChild(gobj_js.gobj_read_attr(view, "$container"));
            gobj_js.gobj_start(view);
            await new Promise((resolve) => setTimeout(resolve, 0));

            const drag = g6.getExtension(B, "drag-canvas");
            const zoom = g6.getExtension(B, "zoom-canvas");
            expect(drag, "drag-canvas replaced").not.toBe(g6.DragCanvas);
            expect(Object.getPrototypeOf(drag)).toBe(g6.DragCanvas);
            expect(zoom, "zoom-canvas replaced").not.toBe(g6.ZoomCanvas);
            expect(Object.getPrototypeOf(zoom)).toBe(g6.ZoomCanvas);
            expect(logged.filter((l) => l.level === "error").map((l) => l.msg)).toEqual([]);
        });
    }
});
