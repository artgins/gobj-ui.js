/***********************************************************************
 *          gobj_tree_remote.wiring.test.js
 *
 *      C_YUI_GOBJ_TREE_JS with `source: "remote"`: the tree of a BACKEND
 *      yuno, which the view cannot fetch itself. It publishes what it
 *      wants (the tree, the trace levels of a gclass, a trace set) and
 *      the host loads the answers. Asserted here: what reaches the host,
 *      what the TRACES block of a card shows for each origin of a level,
 *      that a reload keeps the card open, and that a LOCAL tree publishes
 *      none of it (its hosts declare none of these events).
 *
 *      The real gclass, on a G6 Graph double.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {describe, test, expect, beforeAll, beforeEach, vi} from "vitest";
import {install_dom_double, fake_event} from "../test/dom_double.js";

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
    gobj_start, gobj_read_attr, gobj_send_event, set_log_callback, register_c_timer,
} = await import("@yuneta/gobj-js");
const {register_c_yui_gobj_tree_js} = await import("./c_yui_gobj_tree_js.js");

const logged = [];
const wanted = [];
let yuno = null;
let host = null;
let seq = 0;

/*  The `view-gobj-tree` answer of a small backend yuno.  */
const TREE = {
    "C_YUNO^gate": {
        gclass: "C_YUNO", name: "gate", shortname: "C_YUNO^gate", fullname: "C_YUNO^gate",
        state: "ST_YUNO_RUNNING", running: true, playing: true,
        gobj_flags: ["gobj_flag_yuno"], gobj_trace_level: [],
        children: {
            "C_TCP^tcp1": {
                gclass: "C_TCP", name: "tcp1", shortname: "C_TCP^tcp1",
                fullname: "C_YUNO^gate`C_TCP^tcp1", parent: "C_YUNO^gate",
                state: "ST_CONNECTED", running: true, playing: true,
                gobj_trace_level: ["traffic", "connections"],
                children: {}
            }
        }
    }
};

/*  What the host fetched for C_TCP: `connections` is on for the gclass,
 *  `traffic` only for tcp1, `machine` for nobody.  */
const TCP_INFO = {
    gclass: "C_TCP",
    gclass_levels: {traffic: "Trace dump traffic", connections: "Trace connections"},
    global_levels: {machine: "Trace machine"},
    gclass_on: ["connections"],
    global_on: [],
};

function record(gobj, event, kw, src)
{
    wanted.push({event: event, kw: kw});
    return 0;
}

beforeAll(async () => {
    const i18next = (await import("i18next")).default;
    await i18next.init({lng: "en", resources: {en: {translation: {}}}});
    gobj_start_up(null, null, null, null, null, null, null);
    set_log_callback((level, msg) => {
        logged.push({level: String(level), msg: String(msg)});
    });
    register_c_timer();
    register_c_yui_gobj_tree_js();
    gclass_create("C_TEST_TREE_YUNO", [], [["ST_IDLE", []]], {}, 0,
        [SDATA_END()], {}, 0, 0, 0, 0);
    gclass_create("C_TEST_TREE_HOST",
        [["EV_TREE_WANTED", 0], ["EV_TRACE_INFO_WANTED", 0],
         ["EV_SET_TRACE_LEVEL", 0], ["EV_GCLASS_WANTED", 0]],
        [["ST_IDLE", [
            ["EV_TREE_WANTED",       record, null],
            ["EV_TRACE_INFO_WANTED", record, null],
            ["EV_SET_TRACE_LEVEL",   record, null],
            ["EV_GCLASS_WANTED",     record, null],
        ]]],
        {}, 0, [SDATA_END()], {}, 0, 0, 0, 0);
    yuno = gobj_create_yuno("tree_yuno", "C_TEST_TREE_YUNO", {});
    host = gobj_create("host", "C_TEST_TREE_HOST", {}, yuno);
});

beforeEach(() => {
    logged.length = 0;
    wanted.length = 0;
});

function problems()
{
    return logged.filter((l) => l.level === "error" || l.level === "warning").map((l) => l.msg);
}

async function mount(source, parent)
{
    const view = gobj_create(`tree_${++seq}`, "C_YUI_GOBJ_TREE_JS",
        {source: source, yuno_name: "gate^1"}, parent);
    document.body.appendChild(gobj_read_attr(view, "$container"));
    gobj_start(view);
    await new Promise((resolve) => setTimeout(resolve, 0));
    return view;
}

function node_id_of(view, fullname)
{
    const by_id = view.priv.node_by_id || {};
    return Object.keys(by_id).find((id) => by_id[id].full_name === fullname);
}

function row_of(view, level)
{
    const $pop = view.priv.$popover;
    const $gobj = $pop.querySelectorAll(".GOBJ_TREE_TRACE_GOBJ")
        .find((b) => b.getAttribute("data-level") === level);
    const $gclass = $pop.querySelectorAll(".GOBJ_TREE_TRACE_GCLASS")
        .find((b) => b.getAttribute("data-level") === level);
    return {$gobj, $gclass};
}

async function open_tcp_card(view)
{
    gobj_send_event(view, "EV_LOAD_TREE", {tree: TREE}, host);
    const id = node_id_of(view, "C_YUNO^gate`C_TCP^tcp1");
    expect(id).toBeTruthy();
    gobj_send_event(view, "EV_NODE_CLICK", {id: id, client_x: 10, client_y: 10}, view);
}

describe("C_YUI_GOBJ_TREE_JS, source remote", () => {
    test("draws nothing until the host loads a tree, and asks for it on Refresh", async () => {
        const view = await mount("remote", host);
        expect(view.priv.node_by_id && Object.keys(view.priv.node_by_id).length || 0).toBe(0);
        gobj_send_event(view, "EV_REFRESH", {}, view);
        expect(wanted.map((w) => w.event)).toEqual(["EV_TREE_WANTED"]);

        gobj_send_event(view, "EV_LOAD_TREE", {tree: TREE}, host);
        expect(Object.keys(view.priv.node_by_id).length).toBe(2);
        expect(problems()).toEqual([]);
    });

    test("a card asks for the trace levels of its gclass, and shows where each comes from", async () => {
        const view = await mount("remote", host);
        await open_tcp_card(view);
        expect(wanted.map((w) => [w.event, w.kw.gclass])).toEqual([["EV_TRACE_INFO_WANTED", "C_TCP"]]);
        expect(view.priv.$popover.querySelectorAll(".GOBJ_TREE_TRACES_TABLE").length).toBe(0);

        gobj_send_event(view, "EV_TRACE_INFO", TCP_INFO, host);
        const traffic = row_of(view, "traffic");
        const connections = row_of(view, "connections");
        const machine = row_of(view, "machine");

        /*  only tcp1: its own, so it can be turned off here  */
        expect([traffic.$gobj.checked, traffic.$gobj.disabled]).toEqual([true, false]);
        expect([traffic.$gclass.checked, traffic.$gclass.disabled]).toEqual([false, false]);
        /*  the gclass holds it: on and locked for the gobj  */
        expect([connections.$gobj.checked, connections.$gobj.disabled]).toEqual([true, true]);
        expect([connections.$gclass.checked, connections.$gclass.disabled]).toEqual([true, false]);
        /*  nobody  */
        expect([machine.$gobj.checked, machine.$gobj.disabled]).toEqual([false, false]);
        expect(problems()).toEqual([]);
    });

    test("a box sends the set to the host and locks the block until the backend answers", async () => {
        const view = await mount("remote", host);
        await open_tcp_card(view);
        gobj_send_event(view, "EV_TRACE_INFO", TCP_INFO, host);
        wanted.length = 0;

        const {$gobj} = row_of(view, "machine");
        $gobj.checked = true;
        $gobj.dispatchEvent(fake_event("change"));
        expect(wanted).toEqual([{event: "EV_SET_TRACE_LEVEL", kw: {
            scope: "gobj", gobj: "C_YUNO^gate`C_TCP^tcp1", gclass: "C_TCP",
            levels: ["machine"], set: true
        }}]);
        expect(row_of(view, "traffic").$gobj.disabled).toBe(true);

        /*  The host loads what the backend says now: the card is still
         *  open on tcp1, and unlocked.  */
        const tree = JSON.parse(JSON.stringify(TREE));
        tree["C_YUNO^gate"].children["C_TCP^tcp1"].gobj_trace_level.push("machine");
        gobj_send_event(view, "EV_LOAD_TREE", {tree: tree}, host);
        expect(view.priv.popover_node.full_name).toBe("C_YUNO^gate`C_TCP^tcp1");
        expect(view.priv.$popover.style.display).toBe("block");
        expect([row_of(view, "machine").$gobj.checked, row_of(view, "machine").$gobj.disabled])
            .toEqual([true, false]);
        expect(problems()).toEqual([]);
    });

    test("remove the traces of the gobj turns off what it holds on its own, not what the gclass holds", async () => {
        const view = await mount("remote", host);
        await open_tcp_card(view);
        gobj_send_event(view, "EV_TRACE_INFO", TCP_INFO, host);
        wanted.length = 0;

        const $clear = view.priv.$popover.querySelector(".GOBJ_TREE_TRACES_CLEAR_GOBJ");
        expect($clear.disabled).toBe(false);
        $clear.click();
        expect(wanted.map((w) => [w.kw.scope, w.kw.levels, w.kw.set])).toEqual([["gobj", ["traffic"], false]]);
        expect(problems()).toEqual([]);
    });

    test("the gclass button asks the host for the backend gclass", async () => {
        const view = await mount("remote", host);
        await open_tcp_card(view);
        wanted.length = 0;
        gobj_send_event(view, "EV_OPEN_GCLASS", {}, view);
        expect(wanted.map((w) => [w.event, w.kw.gclass])).toEqual([["EV_GCLASS_WANTED", "C_TCP"]]);
        expect(view.priv.gclass_view).toBe(null);
    });
});

describe("C_YUI_GOBJ_TREE_JS, source local", () => {
    test("publishes nothing: its host declares none of the remote events", async () => {
        const view = await mount("local", yuno);
        gobj_send_event(view, "EV_REFRESH", {}, view);
        expect(wanted).toEqual([]);
        expect(problems()).toEqual([]);
    });
});
