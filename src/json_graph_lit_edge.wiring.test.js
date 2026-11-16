// @vitest-environment jsdom
/***********************************************************************
 *          json_graph_lit_edge.wiring.test.js
 *
 *      The JSON graph (C_YUI_JSON_GRAPH) zooms out to 2% (a document
 *      of a few hundred cards did not fit at the old 10% floor), shows
 *      a minimap from `minimap_min_nodes` cards on, and a click on an
 *      edge LIGHTS it: the line in amber, its two cards ringed, and
 *      the row of the parent's key the line leaves from washed. A
 *      second click on it, or a click on the canvas, puts it out; a
 *      fold that takes its child card away puts it out too.
 *
 *      Driven through the real gclass, in jsdom, with a G6 double that
 *      keeps the data it is given.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {describe, test, expect, beforeAll, beforeEach, vi} from "vitest";

globalThis.ResizeObserver = class {
    observe() {
    }
    unobserve() {
    }
    disconnect() {
    }
};

const graphs = vi.hoisted(() => []);
vi.mock("@antv/g6", async (importOriginal) => {
    const real = await importOriginal();
    class FakeGraph {
        constructor(options) {
            this.options = options;
            this.handlers = {};
            this.plugins = (options.plugins || []).slice();
            this.data = {nodes: [], edges: []};
            graphs.push(this);
            return new Proxy(this, {
                get: (t, k) => (k in t) ? t[k] : (() => undefined),
            });
        }
        setData(data) {
            /*  Edges get the ids G6 would give them  */
            data.edges.forEach((e, i) => {
                e.id = e.id || `e${i}`;
            });
            this.data = data;
        }
        clear() {
            this.data = {nodes: [], edges: []};
        }
        render() {
            return Promise.resolve();
        }
        draw() {
            return Promise.resolve();
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
            return this.data;
        }
        getNodeData(id) {
            if(id === undefined) {
                return this.data.nodes;
            }
            const nd = this.data.nodes.find((n) => n.id === id);
            if(!nd) {
                throw new Error(`node ${id} not found`);
            }
            return nd;
        }
        getEdgeData(id) {
            const ed = this.data.edges.find((e) => e.id === id);
            if(!ed) {
                throw new Error(`edge ${id} not found`);
            }
            return ed;
        }
        getPlugins() {
            return this.plugins;
        }
        setPlugins(p) {
            this.plugins = (typeof p === "function")? p(this.plugins) : p;
        }
        getPluginInstance() {
            return {destroyed: false, destroy() {
            }};
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
    SDATA_END, gclass_create, gobj_start_up, gobj_create_yuno, gobj_create_pure_child,
    gobj_start, gobj_read_attr, gobj_send_event, set_log_callback, register_c_timer,
} = await import("@yuneta/gobj-js");
const {EdgeEvent, CanvasEvent} = await import("@antv/g6");
const {register_c_yui_json_graph} = await import("./c_yui_json_graph.js");

const logged = [];
let yuno = null;
let seq = 0;

beforeAll(async () => {
    const i18next = (await import("i18next")).default;
    await i18next.init({lng: "en", resources: {en: {translation: {}}}});
    gobj_start_up(null, null, null, null, null, null, null);
    set_log_callback((level, msg) => {
        logged.push({level: String(level), msg: String(msg)});
    });
    register_c_timer();
    register_c_yui_json_graph();
    gclass_create("C_TEST_JG_YUNO", [], [["ST_IDLE", []]], {}, 0,
        [SDATA_END()], {}, 0, 0, 0, 0);
    yuno = gobj_create_yuno("jg_yuno", "C_TEST_JG_YUNO", {});
});

beforeEach(() => {
    logged.length = 0;
});

function settle()
{
    return new Promise((resolve) => setTimeout(resolve, 0));
}

async function mount(json, attrs)
{
    const $container = document.createElement("div");
    document.body.appendChild($container);
    const view = gobj_create_pure_child(`json-lit-${++seq}`, "C_YUI_JSON_GRAPH",
        Object.assign({$container: $container, json_data: json}, attrs || {}), yuno);
    document.body.appendChild(gobj_read_attr(view, "$container"));
    gobj_start(view);
    await settle();
    return {view, graph: graphs[graphs.length - 1]};
}

const DOC = {a: 1, b: {x: 1, y: {z: 2}}, c: [1, 2]};

/*  The edge to the card of `path`, and the card of a path  */
function edge_to(graph, path)
{
    const nd = graph.data.nodes.find((n) => n.data && n.data.path === path && !n.data.phantom);
    return graph.data.edges.find((e) => e.target === nd.id);
}
function card(graph, path)
{
    return graph.data.nodes.find((n) => n.data && n.data.path === path && !n.data.phantom).style.innerHTML;
}
const RING = /border: 3px solid/;
const WASH = /background:color-mix\(in srgb, #[0-9a-f]+ 28%, transparent\)/g;

function problems()
{
    return logged.filter((l) => l.level === "error" || l.level === "warning").map((l) => l.msg);
}

describe("C_YUI_JSON_GRAPH: zoom floor, minimap, lit edge", () => {
    test("the zoom goes down to 2%, and an edge takes a click well around its line", async () => {
        const {graph} = await mount(DOC);
        expect(graph.options.zoomRange[0]).toBeLessThanOrEqual(0.02);
        for(const e of graph.data.edges) {
            if(e.style.opacity === 0) {
                continue;
            }
            expect(e.style.increasedLineWidthForHitTesting).toBeGreaterThanOrEqual(10);
        }
    });

    test("the minimap is there from minimap_min_nodes cards on, and not below", async () => {
        const few = await mount(DOC, {minimap_min_nodes: 10});
        expect(few.graph.plugins.some((p) => p.key === "minimap")).toBe(false);
        const many = await mount(DOC, {minimap_min_nodes: 2});
        const minimap = many.graph.plugins.find((p) => p.key === "minimap");
        expect(minimap).toBeTruthy();
        expect(minimap.containerStyle).toMatchObject({top: "auto", bottom: "12px", left: "12px"});
    });

    test("an edge click lights the line, its two cards and the parent's row; again puts it out", async () => {
        const {graph} = await mount(DOC);
        const root = graph.data.nodes[0].data.path;
        const child = graph.data.nodes.find((n) => n.data && n.data.path !== root && !n.data.phantom).data.path;
        expect(card(graph, child)).not.toMatch(RING);

        graph.emit(EdgeEvent.CLICK, {target: {id: edge_to(graph, child).id}});
        await settle();

        const lit = edge_to(graph, child);
        expect(lit.style.lineWidth).toBe(3);
        expect(lit.style.halo).toBe(true);
        expect(card(graph, child)).toMatch(RING);
        expect(card(graph, root)).toMatch(RING);
        expect((card(graph, root).match(WASH) || []).length).toBe(1);
        /*  only those two  */
        const ringed = graph.data.nodes.filter((n) => RING.test(n.style.innerHTML || ""));
        expect(ringed.length).toBe(2);

        graph.emit(EdgeEvent.CLICK, {target: {id: edge_to(graph, child).id}});
        await settle();
        expect(edge_to(graph, child).style.lineWidth).not.toBe(3);
        expect(card(graph, root)).not.toMatch(RING);
        expect(problems()).toEqual([]);
    });

    test("a canvas click puts it out; a new document starts with nothing lit", async () => {
        const {view, graph} = await mount(DOC);
        const root = graph.data.nodes[0].data.path;
        const child = graph.data.nodes.find((n) => n.data && n.data.path !== root && !n.data.phantom).data.path;

        graph.emit(EdgeEvent.CLICK, {target: {id: edge_to(graph, child).id}});
        await settle();
        expect(card(graph, child)).toMatch(RING);
        graph.emit(CanvasEvent.CLICK, {});
        await settle();
        expect(card(graph, child)).not.toMatch(RING);

        graph.emit(EdgeEvent.CLICK, {target: {id: edge_to(graph, child).id}});
        await settle();
        gobj_send_event(view, "EV_LOAD_DATA", {data: DOC}, view);
        await settle();
        expect(graph.data.nodes.some((n) => RING.test(n.style.innerHTML || ""))).toBe(false);
        expect(problems()).toEqual([]);
    });
});
