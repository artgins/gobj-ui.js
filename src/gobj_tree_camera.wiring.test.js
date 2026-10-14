/***********************************************************************
 *          gobj_tree_camera.wiring.test.js
 *
 *      C_YUI_GOBJ_TREE_JS keeps where the reader left the camera
 *      (localStorage, yui_gobj_tree_view:<name>). Before G6 paints, its
 *      getZoom() / getPosition() answer NaN: written as they came, the
 *      camera was saved as nulls (a NaN has no json text) and gobj-js
 *      7.26.27 refuses the whole value with an ERROR. Only real numbers
 *      are written now; a camera that is not readable keeps the one
 *      saved before, and a saved camera of nulls is not restored.
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

const camera = vi.hoisted(() => ({zoom: NaN, position: [NaN, NaN], zoomed: [], moved: []}));
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
            return camera.zoom;
        }
        getPosition() {
            return camera.position;
        }
        zoomTo(z) {
            camera.zoomed.push(z);
            return Promise.resolve();
        }
        translateTo(p) {
            camera.moved.push(p);
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
    SDATA_END, gclass_create, gobj_start_up, gobj_create_yuno, gobj_create_pure_child,
    gobj_start, gobj_read_attr, gobj_send_event, set_log_callback, register_c_timer,
} = await import("@yuneta/gobj-js");
const {register_c_yui_gobj_tree_js} = await import("./c_yui_gobj_tree_js.js");

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
});

function errors()
{
    return logged.filter((l) => l.level === "error").map((l) => l.msg);
}

async function mount(name)
{
    const view = gobj_create_pure_child(name, "C_YUI_GOBJ_TREE_JS",
        {$container: document.createElement("div")}, yuno);
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
