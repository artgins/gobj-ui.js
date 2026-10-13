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
 *      And the main canvas, a control in the Tab order, is NAMED
 *      (REV-CLOUD V24.5.4): a `title` and an `aria-label` through t(),
 *      each with its key, saying which graph it is -- and changing
 *      language with the page. From 7.26.28 to 7.26.41 Tab landed on it
 *      and a reader announced nothing.
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
import {readFileSync} from "node:fs";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";
import {install_dom_double} from "../test/dom_double.js";

install_dom_double();

const SRC = dirname(fileURLToPath(import.meta.url));

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
    gobj_start, gobj_read_attr, set_log_callback, register_c_timer, refresh_language,
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

/*  The name each view gives its main canvas: the key, and its text in
 *  the two languages of this test.  */
const NAMES = {
    C_YUI_JSON_GRAPH:    {key: "json graph",      en: "JSON graph",          es: "Grafo del JSON"},
    C_YUI_GOBJ_TREE_JS:  {key: "gobj tree graph", en: "Gobj tree graph",     es: "Grafo del árbol de gobjs"},
    C_YUI_FSM_GRAPH:     {key: "fsm graph",       en: "State machine graph", es: "Grafo de la máquina de estados"},
    C_YUI_TREEDB_SCHEMA: {key: "schema graph",    en: "Schema graph",        es: "Grafo del esquema"},
    C_G6_NODES_TREE:     {key: "treedb graph",    en: "Treedb graph",        es: "Grafo de la treedb"},
};

function name_of_canvas(graph)
{
    const $main = graph.layers.main.el;
    return {
        role:  $main.getAttribute("role"),
        title: $main.getAttribute("title"),
        aria:  $main.getAttribute("aria-label"),
        title_key: $main.getAttribute("data-i18n-title"),
        aria_key:  $main.getAttribute("data-i18n-aria-label"),
    };
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

describe("REV-CLOUD V24.5.4: the main canvas is named, says which graph it is, and changes language", () => {
    for(const [gclass_name, attrs] of Object.entries(VIEWS)) {
        test(`${gclass_name}: "${NAMES[gclass_name].key}", after its first render and a renderer change`, async () => {
            const i18next = (await import("i18next")).default;
            const name = NAMES[gclass_name];
            i18next.addResourceBundle("en", "translation", {[name.key]: name.en}, true, true);
            i18next.addResourceBundle("es", "translation", {[name.key]: name.es}, true, true);
            await i18next.changeLanguage("en");

            const {graph, $container} = await mount(gclass_name, attrs);
            const named = {
                role: "region", title: name.en, aria: name.en,
                title_key: name.key, aria_key: name.key
            };
            expect(name_of_canvas(graph)).toEqual(named);

            /*  The other layers are out of the Tab order: no control,
             *  no name.  */
            for(const layer of ["background", "label", "transient"]) {
                expect(graph.layers[layer].el.getAttribute("aria-label")).toBe(null);
            }

            graph.setRenderer();
            expect(name_of_canvas(graph)).toEqual(named);

            /*  A language switch reaches it as it reaches every control:
             *  by its keys (the shell's refresh over the page).  */
            await i18next.changeLanguage("es");
            refresh_language(document.body, i18next.t.bind(i18next));
            expect(name_of_canvas(graph)).toEqual(Object.assign({}, named,
                {title: name.es, aria: name.es}));
            await i18next.changeLanguage("en");

            expect($container).toBeTruthy();
            expect(logged.filter((l) => l.level === "error").map((l) => l.msg)).toEqual([]);
        });
    }
});

/*  G6 writes `outline: none` on its canvases, INLINE, and the main one
 *  is a control in the Tab order now: a keyboard that landed on the
 *  graph saw no sign of where it was. CSS is read as text: the double
 *  has no layout.  */
describe("the focused canvas can be SEEN: a ring G6's inline outline does not erase", () => {
    test("every view marks its main canvas, and only that one, with the class the ring hangs from", async () => {
        for(const [gclass_name, attrs] of Object.entries(VIEWS)) {
            const {graph} = await mount(gclass_name, attrs);
            expect(graph.layers.main.el.classList.contains("G6_MAIN_CANVAS"), gclass_name).toBe(true);
            for(const layer of ["background", "label", "transient"]) {
                expect(graph.layers[layer].el.classList.contains("G6_MAIN_CANVAS"), layer).toBe(false);
            }
            graph.setRenderer();
            expect(graph.layers.main.el.classList.contains("G6_MAIN_CANVAS"), gclass_name).toBe(true);
        }
        expect(logged.filter((l) => l.level === "error").map((l) => l.msg)).toEqual([]);
    });

    test("the ring: on :focus-visible, !important over the inline outline, the ink of the scheme, no transition", () => {
        const css = readFileSync(join(SRC, "g6_canvas_tab_order.css"), "utf8");
        const m = css.match(/\.G6_MAIN_CANVAS:focus-visible\s*\{([^}]*)\}/);
        expect(!!m, "a .G6_MAIN_CANVAS:focus-visible rule").toBe(true);
        const body = m[1];
        expect(body).toMatch(/outline:\s*2px solid var\(--bulma-link-on-scheme,[^;]*\)\s*!important\s*;/);
        expect(body).toMatch(/outline-offset:[^;]*!important\s*;/);
        expect(body).not.toMatch(/transition/);

        /*  The module brings it along: every view that draws a graph
         *  imports the module.  */
        const js = readFileSync(join(SRC, "g6_canvas_tab_order.js"), "utf8");
        expect(js).toMatch(/import\s+"\.\/g6_canvas_tab_order\.css";/);
    });
});
