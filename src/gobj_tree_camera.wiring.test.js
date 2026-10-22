/***********************************************************************
 *          gobj_tree_camera.wiring.test.js
 *
 *      C_YUI_GOBJ_TREE_JS keeps where the reader left the camera
 *      (localStorage, yui_gobj_tree_view:<name>). Before G6 paints, its
 *      getZoom() / getPosition() answer NaN: written as they came, the
 *      camera was saved as nulls (a NaN has no json text) and gobj-js
 *      7.26.27 refuses the whole value with an ERROR. Only real numbers
 *      are written now; a camera that is not readable keeps the one
 *      saved before, and a saved camera of nulls is not restored. What
 *      is saved is getPosition(), and it is brought back with
 *      translateTo() through G6's closed forms, at any zoom.
 *
 *      The real gclass, on a G6 Graph double whose camera the test sets.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {describe, test, expect, beforeAll, beforeEach, vi} from "vitest";
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

const camera = vi.hoisted(() => ({zoom: NaN, position: [NaN, NaN], zoomed: [], moved: [],
                                   size: null, viewport: null, plugins: [], g6: null}));

/*  `camera.g6`, when set, is a camera that obeys G6 5.x's own closed
 *  forms, with C the canvas centre, Z the zoom and P the camera's
 *  position: getPosition() = C/Z - P, an absolute translateTo(T) leaves
 *  P = C - T/Z, zoomTo() keeps P, and a point n lands at (n - P)*Z + C.
 *  {Z, P, node}: `node` is where every card is.  */
const CENTRE = [400, 300];
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
            return camera.g6? camera.g6.Z: camera.zoom;
        }
        getPosition() {
            const g = camera.g6;
            if(g) {
                return [CENTRE[0] / g.Z - g.P[0], CENTRE[1] / g.Z - g.P[1]];
            }
            return camera.position;
        }
        zoomTo(z) {
            camera.zoomed.push(z);
            if(camera.g6) {
                camera.g6.Z = z;
            }
            return Promise.resolve();
        }
        translateTo(p) {
            camera.moved.push(p);
            const g = camera.g6;
            if(g) {
                g.P = [CENTRE[0] - p[0] / g.Z, CENTRE[1] - p[1] / g.Z];
            }
            return Promise.resolve();
        }
        /*  Where a card lands on screen: `camera.viewport` for every one
         *  of them, and the canvas `camera.size`. Unset, the camera cannot
         *  be read, which is what the older tests expect.  */
        getSize() {
            if(!camera.size) {
                throw new Error("no size");
            }
            return camera.size;
        }
        getElementPosition() {
            return camera.g6? camera.g6.node: [0, 0];
        }
        getElementData() {
            return {};
        }
        getCanvasCenter() {
            return CENTRE;
        }
        getViewportByCanvas(n) {
            const g = camera.g6;
            if(g) {
                return [(n[0] - g.P[0]) * g.Z + CENTRE[0], (n[1] - g.P[1]) * g.Z + CENTRE[1]];
            }
            return camera.viewport;
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
        /*  The plugins the view asked for, kept so a test can read
         *  them (camera.plugins).  */
        getPlugins() {
            return camera.plugins;
        }
        setPlugins(arg) {
            camera.plugins = (typeof arg === "function")? arg(camera.plugins) : arg;
        }
        getPluginInstance(key) {
            return camera.plugins.some((p) => p.key === key)? {destroyed: false} : undefined;
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
const {register_c_yui_gobj_tree_js} = await import("./c_yui_gobj_tree_js.js");
const {describe_js_gobj} = await import("./gobj_tree_model.js");

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
    register_c_yui_gobj_tree_js();
    gclass_create("C_TEST_CAMERA_HOST", [], [["ST_IDLE", []]], {}, 0,
        [SDATA_END()], {}, 0, 0, 0, 0);
    yuno = gobj_create_yuno("camera_yuno", "C_TEST_CAMERA_HOST", {});
});

beforeEach(() => {
    logged.length = 0;
    camera.zoom = NaN;
    camera.position = [NaN, NaN];
    camera.zoomed = [];
    camera.moved = [];
    camera.size = null;
    camera.viewport = null;
    camera.plugins = [];
    camera.g6 = null;
});

function errors()
{
    return logged.filter((l) => l.level === "error").map((l) => l.msg);
}

async function mount(name, kw)
{
    const view = gobj_create_pure_child(name, "C_YUI_GOBJ_TREE_JS",
        {$container: document.createElement("div"), ...(kw || {})}, yuno);
    document.body.appendChild(gobj_read_attr(view, "$container"));
    gobj_start(view);
    await new Promise((resolve) => setTimeout(resolve, 0));
    return view;
}

function saved(name)
{
    const raw = window.localStorage.getItem(`yui_gobj_tree_view:${name}`);
    return raw? JSON.parse(raw) : null;
}

describe("C_YUI_GOBJ_TREE_JS saves only a camera of numbers", () => {
    test("a camera G6 cannot tell yet (NaN) is not written", async () => {
        const name = `camera_${++seq}`;
        const view = await mount(name);
        gobj_send_event(view, "EV_REFRESH", {}, view);
        const state = saved(name);
        expect(state).not.toBe(null);
        expect("zoom" in state).toBe(false);
        expect("position" in state).toBe(false);
        expect(errors()).toEqual([]);
    });

    test("it keeps the camera saved before", async () => {
        const name = `camera_${++seq}`;
        const view = await mount(name);
        camera.zoom = 2;
        camera.position = [10, 20];
        gobj_send_event(view, "EV_REFRESH", {}, view);
        expect(saved(name)).toMatchObject({zoom: 2, position: [10, 20]});

        camera.zoom = NaN;
        camera.position = [NaN, NaN];
        gobj_send_event(view, "EV_REFRESH", {}, view);
        expect(saved(name)).toMatchObject({zoom: 2, position: [10, 20]});
        expect(errors()).toEqual([]);
    });

    test("a saved camera of nulls is not restored", async () => {
        const name = `camera_${++seq}`;
        window.localStorage.setItem(`yui_gobj_tree_view:${name}`,
            JSON.stringify({layout: "", collapsed: {}, anchor: "", zoom: null, position: [null, null]}));
        await mount(name);
        /*  zoomTo(1) is the view's own first framing, not the restore.  */
        expect(camera.zoomed.every((z) => Number.isFinite(z))).toBe(true);
        expect(camera.moved).toEqual([]);
        expect(errors()).toEqual([]);
    });
});

describe("C_YUI_GOBJ_TREE_JS does not restore a camera that shows nothing", () => {
    test("a saved camera with every card off the canvas is framed again", async () => {
        const name = `camera_${++seq}`;
        window.localStorage.setItem(`yui_gobj_tree_view:${name}`,
            JSON.stringify({layout: "", collapsed: {}, anchor: "", zoom: 0.18, position: [-20000, -20000]}));
        camera.size = [800, 600];
        camera.viewport = [-5000, -5000];
        /*  what G6 answers once the opening has framed the tree  */
        camera.zoom = 1;
        camera.position = [5, 6];
        await mount(name);
        await new Promise((resolve) => setTimeout(resolve, 0));
        /*  judged before it is applied: only the opening's own framing  */
        expect(camera.zoomed).toEqual([1]);
        /*  and the refused camera is replaced by the framing's, so the
         *  next opening does not refuse it again  */
        expect(saved(name)).toMatchObject({zoom: 1, position: [5, 6]});
        expect(logged.filter((l) => l.level === "warning").map((l) => l.msg).join(" "))
            .toMatch(/the saved view shows none of the/);
        expect(errors()).toEqual([]);
    });

    test("a saved camera that shows a card is kept", async () => {
        const name = `camera_${++seq}`;
        window.localStorage.setItem(`yui_gobj_tree_view:${name}`,
            JSON.stringify({layout: "", collapsed: {}, anchor: "", zoom: 0.5, position: [10, 20]}));
        camera.size = [800, 600];
        camera.viewport = [400, 300];
        await mount(name);
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(camera.zoomed).toEqual([0.5]);
        /*  getPosition() handed back to translateTo() at zoom 0.5:
         *  T = (S + C) * Z - C, not S itself  */
        expect(camera.moved).toEqual([[(10 + 400) * 0.5 - 400, (20 + 300) * 0.5 - 300]]);
        expect(errors()).toEqual([]);
    });
});

describe("C_YUI_GOBJ_TREE_JS brings the camera back where it was, at any zoom", () => {
    async function round_trip(zoom, P)
    {
        const name = `camera_${++seq}`;
        camera.size = [800, 600];
        camera.g6 = {Z: 1, P: [400, 300], node: [100, 50]};
        const first = await mount(name);
        await new Promise((resolve) => setTimeout(resolve, 0));

        /*  the reader zooms and pans; the move is saved  */
        camera.g6.Z = zoom;
        camera.g6.P = P.slice();
        gobj_send_event(first, "EV_REFRESH", {}, first);
        const S = [400 / zoom - P[0], 300 / zoom - P[1]];
        expect(saved(name).zoom).toBe(zoom);
        expect(saved(name).position[0]).toBeCloseTo(S[0], 6);
        expect(saved(name).position[1]).toBeCloseTo(S[1], 6);
        /*  (the refresh frames that view again, later: let it)  */
        await new Promise((resolve) => setTimeout(resolve, 0));

        /*  a new opening, on a fresh camera  */
        camera.g6 = {Z: 1, P: [400, 300], node: [100, 50]};
        camera.zoomed = [];
        await mount(name);
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(camera.zoomed).toEqual([zoom]);
        expect(camera.g6.Z).toBe(zoom);
        expect(camera.g6.P[0]).toBeCloseTo(P[0], 6);
        expect(camera.g6.P[1]).toBeCloseTo(P[1], 6);
        expect(logged.filter((l) => l.level === "warning").map((l) => l.msg).join(" "))
            .not.toMatch(/the saved view shows none of the/);
        expect(errors()).toEqual([]);
    }

    test("at zoom 0.3: kept, not judged to show nothing", async () => {
        await round_trip(0.3, [150, 80]);
    });

    test("at zoom 0.8: not shifted", async () => {
        await round_trip(0.8, [180, 20]);
    });

    test("at zoom 2", async () => {
        await round_trip(2, [90, 60]);
    });
});

describe("C_YUI_GOBJ_TREE_JS opens centred on its root", () => {
    test("with nothing saved, the camera is moved onto the root", async () => {
        /*  yui_graph_center_on() is async, and its answer was read
         *  unawaited -- a promise, always truthy -- so the root was never
         *  centred and the opening stayed where the camera happened to be.  */
        const name = `camera_${++seq}`;
        camera.viewport = [0, 0];       /*  the root, 400x300 off the centre  */
        await mount(name);
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(camera.zoomed).toEqual([1]);
        expect(camera.moved.length).toBeGreaterThan(0);
        expect(camera.moved[0]).toEqual([400, 300]);
        expect(errors()).toEqual([]);
    });
});

describe("C_YUI_GOBJ_TREE_JS shows a minimap when the tree is big enough", () => {
    test("from minimap_min_nodes cards on, anchored by css at the bottom left", async () => {
        await mount(`camera_${++seq}`, {minimap_min_nodes: 1});
        const minimap = camera.plugins.find((p) => p.key === "minimap");
        expect(minimap).toBeTruthy();
        expect(minimap.type).toBe("minimap");
        expect(minimap.containerStyle).toMatchObject({top: "auto", bottom: "12px", left: "12px"});
        expect(typeof minimap.shape).toBe("function");
        expect(errors()).toEqual([]);
    });

    test("none below the threshold, and none at all with 0", async () => {
        await mount(`camera_${++seq}`, {minimap_min_nodes: 100000});
        expect(camera.plugins.some((p) => p.key === "minimap")).toBe(false);
        await mount(`camera_${++seq}`, {minimap_min_nodes: 0});
        expect(camera.plugins.some((p) => p.key === "minimap")).toBe(false);
        expect(errors()).toEqual([]);
    });
});

describe("a gobj of this browser says whether play and pause mean anything to it", () => {
    test("play_methods follows the gclass' mt_play / mt_pause", () => {
        gclass_create("C_TEST_WITH_PLAY", [], [["ST_IDLE", []]],
            {mt_play: () => 0}, 0, [SDATA_END()], {}, 0, 0, 0, 0);
        const player = gobj_create_pure_child(`player_${++seq}`, "C_TEST_WITH_PLAY", {}, yuno);
        expect(describe_js_gobj(player, false).play_methods).toBe(true);
        expect(describe_js_gobj(yuno, true).play_methods).toBe(false);
    });
});
