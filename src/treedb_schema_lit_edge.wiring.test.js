/***********************************************************************
 *          treedb_schema_lit_edge.wiring.test.js
 *
 *      The schema graph (C_YUI_TREEDB_SCHEMA) has a minimap, and a click
 *      on an edge LIGHTS it: the line takes the `lit` state, and its two
 *      cards are repainted in amber with the hook row and the fkey row
 *      washed. A second click on the same edge, or a click on the
 *      canvas, puts it out; a theme switch keeps it lit.
 *
 *      Driven through the real gclass, on a document double, with a G6
 *      double that keeps the data it is given.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {describe, test, expect, beforeAll, vi} from "vitest";
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

const graphs = vi.hoisted(() => []);
vi.mock("@antv/g6", async (importOriginal) => {
    const real = await importOriginal();
    class FakeGraph {
        constructor(options) {
            this.options = options;
            this.handlers = {};
            this.nodes = {};
            this.edges = {};
            for(const nd of options.data.nodes) {
                this.nodes[nd.id] = JSON.parse(JSON.stringify(nd));
            }
            for(const ed of options.data.edges) {
                this.edges[ed.id] = {...JSON.parse(JSON.stringify(ed)), states: []};
            }
            this.edge_options = options.edge;
            graphs.push(this);
            return new Proxy(this, {
                get: (t, k) => (k in t) ? t[k] : (() => undefined),
            });
        }
        render() {
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
        getNodeData(id) {
            if(id === undefined) {
                return Object.values(this.nodes);
            }
            if(!this.nodes[id]) {
                throw new Error(`node ${id} not found`);
            }
            return this.nodes[id];
        }
        getEdgeData(id) {
            if(!this.edges[id]) {
                throw new Error(`edge ${id} not found`);
            }
            return this.edges[id];
        }
        updateNodeData(updates) {
            for(const u of updates) {
                Object.assign(this.nodes[u.id].style, u.style);
            }
        }
        updateData(data) {
            for(const u of (data.edges || [])) {
                this.edges[u.id].states = u.states;
            }
        }
        setEdge(options) {
            this.edge_options = options;
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
        draw() {
            return Promise.resolve();
        }
        destroy() {
        }
    }
    return {...real, Graph: FakeGraph};
});

const {
    SDATA_END,
    gclass_create,
    gobj_start_up, gobj_create_yuno, gobj_create, gobj_start, gobj_send_event,
    set_log_callback,
} = await import("@yuneta/gobj-js");
const {EdgeEvent, CanvasEvent} = await import("@antv/g6");
const {register_c_yui_treedb_schema} = await import("./c_yui_treedb_schema.js");

const logged = [];

const DESCS = {
    places: {
        id: "places",
        cols: [
            {id: "id", flag: ["persistent", "required"], type: "string"},
            {id: "sites", flag: ["hook"], type: "dict", hook: {sites: "place"}},
        ],
    },
    sites: {
        id: "sites",
        cols: [
            {id: "id", flag: ["persistent", "required"], type: "string"},
            {id: "name", flag: ["persistent"], type: "string"},
            {id: "place", flag: ["fkey"], type: "list", fkey: {places: "sites"}},
        ],
    },
};

let yuno = null;
let seq = 0;

beforeAll(() => {
    set_log_callback((priority, ...args) => {
        logged.push(args.join(" "));
    });
    gobj_start_up(null, null, null, null, null, null, null);
    gclass_create("C_LIT_HOST", [], [["ST_IDLE", []]], {}, 0,
        [SDATA_END()], {}, 0, 0, 0, 0);
    register_c_yui_treedb_schema();
    yuno = gobj_create_yuno("yuno", "C_LIT_HOST", {});
});

async function mount()
{
    let host = gobj_create(`host_${++seq}`, "C_LIT_HOST", {}, yuno);
    let view = gobj_create(`schema_${seq}`, "C_YUI_TREEDB_SCHEMA", {descs: DESCS}, host);
    gobj_start(view);
    await Promise.resolve();
    if(!graphs.length) {
        throw new Error(logged.join("\n"));
    }
    return {view, graph: graphs[graphs.length - 1]};
}

const EDGE = "places|sites|sites|place";

describe("C_YUI_TREEDB_SCHEMA: minimap and lit edge", () => {
    test("the graph carries a minimap anchored by css", async () => {
        const {graph} = await mount();
        const minimap = (graph.options.plugins || []).find((p) => p.key === "minimap");
        expect(minimap).toBeTruthy();
        expect(minimap.type).toBe("minimap");
        expect(minimap.containerStyle).toMatchObject({top: "auto", bottom: "12px"});
        expect(graph.edge_options.state.lit).toBeTruthy();
        /*  a 2px line is a 2px target: the click is taken well around it  */
        expect(graph.edge_options.style.lineWidth).toBeGreaterThanOrEqual(2);
        expect(graph.edge_options.style.increasedLineWidthForHitTesting).toBeGreaterThanOrEqual(10);
    });

    test("an edge click lights the edge, its two cards and the two rows", async () => {
        const {graph} = await mount();
        const before = graph.nodes.sites.style.innerHTML;
        expect(before).not.toContain("3px solid");

        graph.emit(EdgeEvent.CLICK, {target: {id: EDGE}});

        expect(graph.edges[EDGE].states).toEqual(["lit"]);
        for(const topic of ["places", "sites"]) {
            expect(graph.nodes[topic].style.innerHTML).toContain("3px solid");
        }
        /*  the fkey row of the child and the hook row of the parent,
         *  and not the other rows  */
        const washed = (html) => (html.match(/color-mix\(in srgb, #[0-9a-f]+ \d+%, transparent\)/g) || []).length;
        expect(washed(graph.nodes.sites.style.innerHTML)).toBe(1);
        expect(washed(graph.nodes.places.style.innerHTML)).toBe(1);
    });

    test("a second click on it, or a canvas click, puts it out", async () => {
        const {graph} = await mount();
        graph.emit(EdgeEvent.CLICK, {target: {id: EDGE}});
        graph.emit(EdgeEvent.CLICK, {target: {id: EDGE}});
        expect(graph.edges[EDGE].states).toEqual([]);
        expect(graph.nodes.sites.style.innerHTML).not.toContain("3px solid");

        graph.emit(EdgeEvent.CLICK, {target: {id: EDGE}});
        graph.emit(CanvasEvent.CLICK, {});
        expect(graph.edges[EDGE].states).toEqual([]);
        expect(graph.nodes.places.style.innerHTML).not.toContain("3px solid");
    });

    test("a theme switch keeps the lit cards lit and the lit state defined", async () => {
        const {view, graph} = await mount();
        graph.emit(EdgeEvent.CLICK, {target: {id: EDGE}});
        gobj_send_event(view, "EV_THEME", {theme: "light"}, view);
        expect(graph.nodes.sites.style.innerHTML).toContain("3px solid");
        expect(graph.edge_options.state.lit.stroke).toBe("#b45309");
        expect(logged.filter((l) => /ERROR|failed/i.test(l))).toEqual([]);
    });
});
