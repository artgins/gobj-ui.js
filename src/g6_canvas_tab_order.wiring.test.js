/***********************************************************************
 *          g6_canvas_tab_order.wiring.test.js
 *
 *      Every view that draws a G6 graph puts its canvases in the page's
 *      Tab order the same way (g6_canvas_tab_order.js): the main canvas
 *      0, the other layers -1 (REV-CLOUD V20.5 #2, and the four views
 *      the second pass left out).
 *
 *      G6 stacks four canvases and gives each `tabIndex = 1`; a
 *      positive tabindex goes before every control of the page, so Tab
 *      from a graph went through its other canvases and the whole page
 *      before it reached the graph's own buttons.
 *
 *      The real gclasses, on a G6 Graph double that does what G6 does
 *      here: the FIRST render() builds the four canvases with
 *      `tabIndex = 1` and says so with `aftercanvasinit`; a renderer
 *      change writes the 1 again and says `afterrendererchange`.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {describe, test, expect, beforeAll, beforeEach, vi} from "vitest";
import {install_dom_double} from "../test/dom_double.js";

install_dom_double();

/*  The views watch their container; nothing resizes here.  */
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

const graphs = vi.hoisted(() => []);
vi.mock("@antv/g6", async (importOriginal) => {
    const real = await importOriginal();
    class FakeGraph {
        constructor(options) {
            this.options = options;
            this.handlers = {};
            this.layers = null;
            graphs.push(this);
            return new Proxy(this, {
                get: (t, k) => (k in t) ? t[k] : (() => undefined),
            });
        }
        container_el() {
            const c = this.options.container;
            return (typeof c === "string") ? document.getElementById(c) : c;
        }
        write_canvas_dom() {
            for(const name of Object.keys(this.layers)) {
                this.layers[name].el.tabIndex = 1;
            }
        }
        render() {
            if(!this.layers) {
                const $c = this.container_el();
                this.layers = {};
                for(const name of ["background", "main", "label", "transient"]) {
                    const el = document.createElement("canvas");
                    el.setAttribute("data-layer", name);
                    $c.appendChild(el);
                    this.layers[name] = {
                        el: el,
                        getContextService: () => ({getDomElement: () => el}),
                    };
                }
                this.write_canvas_dom();
                this.emit(real.GraphEvent.AFTER_CANVAS_INIT, {canvas: this.getCanvas()});
            }
            return Promise.resolve();
        }
        setRenderer() {
            this.write_canvas_dom();
            this.emit(real.GraphEvent.AFTER_RENDERER_CHANGE, {});
        }
        getCanvas() {
            return {
                getLayers: () => this.layers,
                getContainer: () => this.container_el(),
            };
        }
        on(name, fn) {
            (this.handlers[name] = this.handlers[name] || []).push(fn);
        }
        emit(name, ev) {
            for(const fn of (this.handlers[name] || [])) {
                fn(ev);
            }
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
        draw() {
            return Promise.resolve();
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

const {
    SDATA_END, gclass_create, gobj_start_up, gobj_create_yuno, gobj_create_pure_child,
    gobj_start, gobj_read_attr, set_log_callback, register_c_timer,
} = await import("@yuneta/gobj-js");
const {register_c_yui_json_graph} = await import("./c_yui_json_graph.js");
const {register_c_yui_gobj_tree_js} = await import("./c_yui_gobj_tree_js.js");
const {register_c_yui_fsm_graph} = await import("./c_yui_fsm_graph.js");
const {register_c_yui_treedb_schema} = await import("./c_yui_treedb_schema.js");
const {register_c_g6_nodes_tree} = await import("./c_g6_nodes_tree.js");

const logged = [];
let yuno = null;

beforeAll(async () => {
    const i18next = (await import("i18next")).default;
    await i18next.init({lng: "en", resources: {en: {translation: {}}}});
    gobj_start_up(null, null, null, null, null, null, null);
    set_log_callback((level, msg) => {
        logged.push({level: String(level), msg: String(msg)});
    });
    register_c_timer();
    register_c_yui_json_graph();
    register_c_yui_gobj_tree_js();
    register_c_yui_fsm_graph();
    register_c_yui_treedb_schema();
    register_c_g6_nodes_tree();
    gclass_create("C_TEST_TAB_ORDER_HOST", [], [["ST_IDLE", []]], {}, 0,
        [SDATA_END()], {}, 0, 0, 0, 0);
    yuno = gobj_create_yuno("tab_order_yuno", "C_TEST_TAB_ORDER_HOST", {});
});

beforeEach(() => {
    logged.length = 0;
});

const DESC = {topic_name: "users", cols: [
    {id: "id", type: "string", flag: ["persistent"]},
]};

/*  Each view, with what it needs to render a first time.  */
const VIEWS = {
    C_YUI_JSON_GRAPH:   {json_data: {a: 1, b: [1, 2]}},
    C_YUI_GOBJ_TREE_JS: {},
    C_YUI_FSM_GRAPH:    {fsm: {
        entry_state: "ST_IDLE",
        states: [{name: "ST_IDLE"}, {name: "ST_BUSY"}],
        rows: [
            {event: "EV_GO",   cells: [{next_state: "ST_BUSY"}, null]},
            {event: "EV_DONE", cells: [null, {next_state: "ST_IDLE"}]},
        ],
        published: [],
        unreachable: [],
    }},
    C_YUI_TREEDB_SCHEMA: {descs: {users: DESC}},
    C_G6_NODES_TREE:    {with_toolbar: false, operation_mode: "reading"},
};

let seq = 0;

async function mount(gclass_name, attrs)
{
    const $container = document.createElement("div");
    document.body.appendChild($container);
    const n0 = graphs.length;
    const view = gobj_create_pure_child(`tab_order_${++seq}`, gclass_name,
        Object.assign({$container: $container}, attrs), yuno);
    /*  Mounted as a host mounts it: a view that builds its own root
     *  (json, gobj tree) is in the document before it starts, and
     *  G6 finds its canvas mount there by id.  */
    document.body.appendChild(gobj_read_attr(view, "$container"));
    gobj_start(view);
    /*  render() resolves on its own time, as G6's does.  */
    await new Promise((resolve) => setTimeout(resolve, 0));
    return {view, $container, graph: graphs.length > n0 ? graphs[graphs.length - 1] : null};
}

function tab_order(graph)
{
    const order = {};
    for(const [name, layer] of Object.entries(graph.layers || {})) {
        order[name] = layer.el.tabIndex;
    }
    return order;
}

describe("every G6 view: the main canvas in the Tab order, the other layers out", () => {
    for(const [gclass_name, attrs] of Object.entries(VIEWS)) {
        test(`${gclass_name}: after its first render, and after a renderer change`, async () => {
            const {graph} = await mount(gclass_name, attrs);
            expect(graph, `${gclass_name} built a graph`).toBeTruthy();
            expect(graph.layers, `${gclass_name} rendered when it started`).toBeTruthy();
            expect(tab_order(graph)).toEqual({background: -1, main: 0, label: -1, transient: -1});

            graph.setRenderer();
            expect(tab_order(graph)).toEqual({background: -1, main: 0, label: -1, transient: -1});

            expect(logged.filter((l) => l.level === "error").map((l) => l.msg)).toEqual([]);
        });
    }
});
