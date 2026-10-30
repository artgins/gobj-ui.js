/***********************************************************************
 *          gobj_tree_remote.wiring.test.js
 *
 *      C_YUI_GOBJ_TREE_JS with `source: "remote"`: the tree of a BACKEND
 *      yuno, which the view cannot fetch itself. It publishes what it
 *      wants (the tree, the trace levels of a gclass, a trace set) and
 *      the host loads the answers. Asserted here: what reaches the host,
 *      what the TRACES block of a card shows for each origin of a level,
 *      that a reload keeps the card open, that the open gclass viewer is
 *      locked only by a set that moves what it shows (and unlocked by
 *      the answer it waits for), and that a LOCAL tree publishes none of
 *      it (its hosts declare none of these events).
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
const {register_c_yui_window} = await import("./c_yui_window.js");

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
    register_c_yui_window();
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
    const $global = $pop.querySelectorAll(".GOBJ_TREE_TRACE_GLOBAL")
        .find((b) => b.getAttribute("data-level") === level);
    const $row = ($gobj || $global) ? ($gobj || $global).closest("tr") : null;
    const $origin = $row ? $row.querySelector(".GOBJ_TREE_TRACES_ORIGIN") : null;
    return {$gobj, $global, origin: $origin ? $origin.textContent : ""};
}

/*  What the host fetched for the root's gclass: it carries the yuno's
 *  own scope (`machine` on for every gobj).  */
const YUNO_INFO = {
    gclass: "C_YUNO",
    gclass_levels: {},
    global_levels: {machine: "Trace machine", ev_kw: "Trace event keywords"},
    gclass_on: ["machine"],
    global_on: ["machine"],
};

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
        expect([traffic.$gobj.checked, traffic.$gobj.disabled, traffic.origin]).toEqual([true, false, ""]);
        /*  the gclass holds it: on and locked for the gobj, saying which  */
        expect([connections.$gobj.checked, connections.$gobj.disabled, connections.origin])
            .toEqual([true, true, "C_TCP"]);
        /*  nobody  */
        expect([machine.$gobj.checked, machine.$gobj.disabled]).toEqual([false, false]);
        /*  ONE scope in a card: the gclass' is the gclass viewer's, the
         *  yuno's is the toolbar's.  */
        expect(view.priv.$popover.querySelectorAll(".GOBJ_TREE_TRACE_GCLASS").length).toBe(0);
        expect(view.priv.$popover.querySelector(".GOBJ_TREE_TRACES_CLEAR_GCLASS")).toBe(null);
        expect(problems()).toEqual([]);
    });

    test("a card says whether its gobj's traces survive a restart: a service's do", async () => {
        const view = await mount("remote", host);
        await open_tcp_card(view);
        gobj_send_event(view, "EV_TRACE_INFO", TCP_INFO, host);
        const note = () => view.priv.$popover.querySelector(".GOBJ_TREE_TRACES_NOTE").getAttribute("data-i18n");
        expect(note()).toBe("the traces of a gobj that is not a service end with the yuno");

        const tree = JSON.parse(JSON.stringify(TREE));
        tree["C_YUNO^gate"].children["C_TCP^tcp1"].service = true;
        gobj_send_event(view, "EV_LOAD_TREE", {tree: tree}, host);
        expect(note()).toBe("the traces of a service survive a restart");
        expect(problems()).toEqual([]);
    });

    test("a level the whole yuno traces is locked in a card, said as the yuno's", async () => {
        const view = await mount("remote", host);
        await open_tcp_card(view);
        gobj_send_event(view, "EV_TRACE_INFO", Object.assign({}, TCP_INFO,
            {gclass_on: ["connections", "machine"], global_on: ["machine"]}), host);
        const machine = row_of(view, "machine");
        expect([machine.$gobj.checked, machine.$gobj.disabled, machine.origin])
            .toEqual([true, true, "yuno"]);
        expect(problems()).toEqual([]);
    });

    test("the yuno's traces open from the toolbar, from the root's gclass", async () => {
        const view = await mount("remote", host);
        gobj_send_event(view, "EV_LOAD_TREE", {tree: TREE}, host);
        wanted.length = 0;

        const $btn = gobj_read_attr(view, "$container").querySelector(".GOBJ_TREE_YUNO_TRACES_BUTTON");
        expect($btn).toBeTruthy();
        $btn.click();
        expect(wanted.map((w) => [w.event, w.kw.gclass])).toEqual([["EV_TRACE_INFO_WANTED", "C_YUNO"]]);
        expect(view.priv.popover_mode).toBe("yuno");

        gobj_send_event(view, "EV_TRACE_INFO", YUNO_INFO, host);
        const machine = row_of(view, "machine");
        const ev_kw = row_of(view, "ev_kw");
        expect([machine.$global.checked, machine.$global.disabled]).toEqual([true, false]);
        expect([ev_kw.$global.checked, ev_kw.$global.disabled]).toEqual([false, false]);
        expect(view.priv.$popover.querySelectorAll(".GOBJ_TREE_TRACE_GOBJ").length).toBe(0);
        /*  no gclass button: the yuno's traces are no gclass  */
        expect(view.priv.$popover_gclass.classList.contains("is-hidden")).toBe(true);

        wanted.length = 0;
        ev_kw.$global.checked = true;
        ev_kw.$global.dispatchEvent(fake_event("change"));
        expect(wanted).toEqual([{event: "EV_SET_TRACE_LEVEL", kw: {
            scope: "global", gobj: "C_YUNO^gate", gclass: "C_YUNO",
            levels: ["ev_kw"], set: true, set_id: expect.any(Number)
        }}]);
        expect(row_of(view, "machine").$global.disabled).toBe(true);

        /*  The host reloads the tree: the yuno's traces stay open.  */
        gobj_send_event(view, "EV_LOAD_TREE", {tree: TREE}, host);
        expect(view.priv.popover_mode).toBe("yuno");
        expect(view.priv.$popover.style.display).toBe("block");

        wanted.length = 0;
        view.priv.$popover.querySelector(".GOBJ_TREE_TRACES_CLEAR_GLOBAL").click();
        expect(wanted.map((w) => [w.kw.scope, w.kw.levels, w.kw.set])).toEqual([["global", ["machine"], false]]);
        expect(problems()).toEqual([]);
    });

    test("the gclass viewer's set reaches the host as a set of the gclass", async () => {
        const view = await mount("remote", host);
        await open_tcp_card(view);
        wanted.length = 0;
        gobj_send_event(view, "EV_SET_GCLASS_TRACE", {gclass: "C_TCP", levels: ["machine"], set: true}, view);
        expect(wanted).toEqual([{event: "EV_SET_TRACE_LEVEL", kw: {
            scope: "gclass", gobj: "", gclass: "C_TCP", levels: ["machine"], set: true,
            set_id: expect.any(Number)
        }}]);
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
            levels: ["machine"], set: true, set_id: expect.any(Number)
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

/*  The `view-gclass` answer for C_TCP, enough for the viewer.  */
const TCP_DESCRIPTION = {
    id: "C_TCP", gcflag: [], instances: 1, attrs: [], commands: [],
    gclass_methods: [], internal_methods: [],
    FSM: {events: [], states: {}},
    info_gclass_trace: {traffic: "Trace dump traffic", connections: "Trace connections"},
};

/*  The tree with the gclass viewer of C_TCP open, and its levels read.  */
async function open_tcp_viewer()
{
    const view = await mount("remote", host);
    await open_tcp_card(view);
    gobj_send_event(view, "EV_TRACE_INFO", TCP_INFO, host);
    gobj_send_event(view, "EV_OPEN_GCLASS", {}, view);
    gobj_send_event(view, "EV_GCLASS_DESCRIPTION",
        {gclass: "C_TCP", description: TCP_DESCRIPTION}, host);
    const viewer = view.priv.gclass_view && view.priv.gclass_view.json_gobj;
    expect(viewer).toBeTruthy();
    wanted.length = 0;
    return {view, viewer};
}

function viewer_box(viewer, level)
{
    return gobj_read_attr(viewer, "$container").querySelectorAll(".GCLASS_TRACE_GCLASS")
        .find((b) => b.getAttribute("data-level") === level);
}

describe("C_YUI_GOBJ_TREE_JS, source remote: the open gclass viewer", () => {
    test("a set of the viewer's gclass locks it until ITS answer", async () => {
        const {view, viewer} = await open_tcp_viewer();
        expect(viewer_box(viewer, "traffic").disabled).toBe(false);
        gobj_send_event(view, "EV_SET_GCLASS_TRACE", {gclass: "C_TCP", levels: ["traffic"], set: true}, viewer);
        expect(viewer_box(viewer, "traffic").disabled).toBe(true);

        gobj_send_event(view, "EV_TRACE_INFO", Object.assign({}, TCP_INFO, {gclass: "C_TIMER"}), host);
        expect(viewer_box(viewer, "traffic").disabled).toBe(true);

        gobj_send_event(view, "EV_TRACE_INFO", Object.assign({}, TCP_INFO,
            {gclass_on: ["connections", "traffic"]}), host);
        expect([viewer_box(viewer, "traffic").checked, viewer_box(viewer, "traffic").disabled])
            .toEqual([true, false]);
        expect(problems()).toEqual([]);
    });

    test("a gobj set on the card of ANOTHER gclass leaves the viewer alone", async () => {
        const {view, viewer} = await open_tcp_viewer();
        const root_id = node_id_of(view, "C_YUNO^gate");
        gobj_send_event(view, "EV_NODE_CLICK", {id: root_id, client_x: 10, client_y: 10}, view);
        gobj_send_event(view, "EV_TRACE_INFO", YUNO_INFO, host);

        const {$gobj} = row_of(view, "ev_kw");
        $gobj.checked = true;
        $gobj.dispatchEvent(fake_event("change"));
        expect(wanted.filter((w) => w.event === "EV_SET_TRACE_LEVEL").map((w) => [w.kw.scope, w.kw.gclass]))
            .toEqual([["gobj", "C_YUNO"]]);
        expect(viewer_box(viewer, "traffic").disabled).toBe(false);

        gobj_send_event(view, "EV_TRACE_INFO", YUNO_INFO, host);
        expect(viewer_box(viewer, "traffic").disabled).toBe(false);
        expect(problems()).toEqual([]);
    });

    test("a set of the yuno's scope locks it until the yuno's answer AND its own", async () => {
        const {view, viewer} = await open_tcp_viewer();
        gobj_read_attr(view, "$container").querySelector(".GOBJ_TREE_YUNO_TRACES_BUTTON").click();
        gobj_send_event(view, "EV_TRACE_INFO", YUNO_INFO, host);
        wanted.length = 0;

        const ev_kw = row_of(view, "ev_kw");
        ev_kw.$global.checked = true;
        ev_kw.$global.dispatchEvent(fake_event("change"));
        expect(viewer_box(viewer, "traffic").disabled).toBe(true);

        /*  the answer of an unrelated gclass, arriving first  */
        gobj_send_event(view, "EV_TRACE_INFO", Object.assign({}, TCP_INFO, {gclass: "C_TIMER"}), host);
        expect(viewer_box(viewer, "traffic").disabled).toBe(true);
        wanted.length = 0;

        /*  the yuno's: the viewer's own is asked for, still locked  */
        gobj_send_event(view, "EV_TRACE_INFO", Object.assign({}, YUNO_INFO,
            {global_on: ["machine", "ev_kw"]}), host);
        expect(wanted.map((w) => [w.event, w.kw.gclass])).toEqual([["EV_TRACE_INFO_WANTED", "C_TCP"]]);
        expect(viewer_box(viewer, "traffic").disabled).toBe(true);

        gobj_send_event(view, "EV_TRACE_INFO", Object.assign({}, TCP_INFO,
            {global_levels: YUNO_INFO.global_levels,
             gclass_on: ["connections", "ev_kw"], global_on: ["ev_kw"]}), host);
        expect(viewer_box(viewer, "traffic").disabled).toBe(false);
        expect([viewer_box(viewer, "ev_kw").checked, viewer_box(viewer, "ev_kw").disabled])
            .toEqual([true, true]);
        expect(problems()).toEqual([]);
    });

    test("reopened while a set of ITS gclass is in flight, it opens locked until that answer", async () => {
        const {view, viewer} = await open_tcp_viewer();
        gobj_send_event(view, "EV_SET_GCLASS_TRACE", {gclass: "C_TCP", levels: ["traffic"], set: true}, viewer);
        expect(viewer_box(viewer, "traffic").disabled).toBe(true);

        /*  The card's gclass button, while the set is in flight: the
         *  viewer is replaced by a new one of the same gclass.  */
        const reopened = reopen_tcp_viewer(view);
        expect(reopened).not.toBe(viewer);
        expect(viewer_box(reopened, "traffic").disabled).toBe(true);

        gobj_send_event(view, "EV_TRACE_INFO", Object.assign({}, TCP_INFO, {gclass: "C_TIMER"}), host);
        expect(viewer_box(reopened, "traffic").disabled).toBe(true);

        gobj_send_event(view, "EV_TRACE_INFO", Object.assign({}, TCP_INFO,
            {gclass_on: ["connections", "traffic"]}), host);
        expect([viewer_box(reopened, "traffic").checked, viewer_box(reopened, "traffic").disabled])
            .toEqual([true, false]);
        expect(problems()).toEqual([]);
    });

    test("reopened after the answer, or with a set of ANOTHER gclass in flight, it opens unlocked", async () => {
        const {view, viewer} = await open_tcp_viewer();
        gobj_send_event(view, "EV_SET_GCLASS_TRACE", {gclass: "C_TCP", levels: ["traffic"], set: true}, viewer);
        gobj_send_event(view, "EV_TRACE_INFO", TCP_INFO, host);
        expect(viewer_box(reopen_tcp_viewer(view), "traffic").disabled).toBe(false);

        gobj_send_event(view, "EV_SET_GCLASS_TRACE", {gclass: "C_TIMER", levels: ["traffic"], set: true}, view);
        expect(viewer_box(reopen_tcp_viewer(view), "traffic").disabled).toBe(false);
        expect(problems()).toEqual([]);
    });

    test("reopened while a set of the yuno's scope is in flight, it waits for the yuno's answer AND its own", async () => {
        const {view, viewer} = await open_tcp_viewer();
        gobj_read_attr(view, "$container").querySelector(".GOBJ_TREE_YUNO_TRACES_BUTTON").click();
        gobj_send_event(view, "EV_TRACE_INFO", YUNO_INFO, host);
        const ev_kw = row_of(view, "ev_kw");
        ev_kw.$global.checked = true;
        ev_kw.$global.dispatchEvent(fake_event("change"));
        expect(viewer_box(viewer, "traffic").disabled).toBe(true);

        const reopened = reopen_tcp_viewer(view);
        expect(viewer_box(reopened, "traffic").disabled).toBe(true);
        wanted.length = 0;

        gobj_send_event(view, "EV_TRACE_INFO", Object.assign({}, YUNO_INFO,
            {global_on: ["machine", "ev_kw"]}), host);
        expect(wanted.map((w) => [w.event, w.kw.gclass])).toEqual([["EV_TRACE_INFO_WANTED", "C_TCP"]]);
        expect(viewer_box(reopened, "traffic").disabled).toBe(true);

        gobj_send_event(view, "EV_TRACE_INFO", Object.assign({}, TCP_INFO,
            {global_levels: YUNO_INFO.global_levels,
             gclass_on: ["connections", "ev_kw"], global_on: ["ev_kw"]}), host);
        expect(viewer_box(reopened, "traffic").disabled).toBe(false);
        expect(problems()).toEqual([]);
    });
});

/*  The card of tcp1 again, and its gclass button: the host's answer
 *  replaces the open viewer with a new one of C_TCP.  */
function reopen_tcp_viewer(view)
{
    const id = node_id_of(view, "C_YUNO^gate`C_TCP^tcp1");
    gobj_send_event(view, "EV_NODE_CLICK", {id: id, client_x: 10, client_y: 10}, view);
    gobj_send_event(view, "EV_OPEN_GCLASS", {}, view);
    gobj_send_event(view, "EV_GCLASS_DESCRIPTION",
        {gclass: "C_TCP", description: TCP_DESCRIPTION}, host);
    const viewer = view.priv.gclass_view && view.priv.gclass_view.json_gobj;
    expect(viewer).toBeTruthy();
    return viewer;
}

describe("C_YUI_GOBJ_TREE_JS, source local", () => {
    test("publishes nothing: its host declares none of the remote events", async () => {
        const view = await mount("local", yuno);
        gobj_send_event(view, "EV_REFRESH", {}, view);
        expect(wanted).toEqual([]);
        expect(problems()).toEqual([]);
    });

    test("an empty graph saves no camera: a fit before the tree loads frames nothing", async () => {
        const view = await mount("remote", host);
        const key = `yui_gobj_tree_view:tree_${seq}`;
        gobj_send_event(view, "EV_REFRESH", {}, view);
        const saved = JSON.parse(window.localStorage.getItem(key) || "null");
        expect(saved).not.toBe(null);
        expect("zoom" in saved).toBe(false);
        expect("position" in saved).toBe(false);

        gobj_send_event(view, "EV_LOAD_TREE", {tree: TREE}, host);
        gobj_send_event(view, "EV_REFRESH", {}, view);
        const after = JSON.parse(window.localStorage.getItem(key));
        expect(after.zoom).toBe(1);
        expect(problems()).toEqual([]);
    });
});

/*  A read asked BEFORE a set, answered after it, is
 *  not the set's answer. A host that says which set an answer follows
 *  (`set_id`, echoed from EV_SET_TRACE_LEVEL; null for a plain read)
 *  is taken at its word; one that says nothing is matched by gclass,
 *  as the tests above do.  */
describe("C_YUI_GOBJ_TREE_JS, source remote: a host that says which set it answers", () => {
    const last_set_id = () => {
        const sets = wanted.filter((w) => w.event === "EV_SET_TRACE_LEVEL");
        return sets.length ? sets[sets.length - 1].kw.set_id : undefined;
    };

    test("every set carries its own number", async () => {
        const view = await mount("remote", host);
        await open_tcp_card(view);
        gobj_send_event(view, "EV_TRACE_INFO", TCP_INFO, host);
        const {$gobj} = row_of(view, "machine");
        $gobj.checked = true;
        $gobj.dispatchEvent(fake_event("change"));
        const one = last_set_id();
        gobj_send_event(view, "EV_TRACE_INFO", Object.assign({}, TCP_INFO, {set_id: one}), host);
        const again = row_of(view, "machine").$gobj;
        again.checked = true;
        again.dispatchEvent(fake_event("change"));
        const two = last_set_id();
        expect(typeof one).toBe("number");
        expect(typeof two).toBe("number");
        expect(two).not.toBe(one);
        expect(problems()).toEqual([]);
    });

    test("the card's own read, answered after a tick, leaves the block locked", async () => {
        const view = await mount("remote", host);
        await open_tcp_card(view);          /*  the card asks: EV_TRACE_INFO_WANTED  */
        gobj_send_event(view, "EV_TRACE_INFO", Object.assign({}, TCP_INFO, {set_id: null}), host);
        gobj_send_event(view, "EV_NODE_CLICK",
            {id: node_id_of(view, "C_YUNO^gate`C_TCP^tcp1"), client_x: 10, client_y: 10}, view);

        /*  ticked before the second read is answered  */
        const {$gobj} = row_of(view, "machine");
        $gobj.checked = true;
        $gobj.dispatchEvent(fake_event("change"));
        const set_id = last_set_id();
        expect(row_of(view, "traffic").$gobj.disabled).toBe(true);

        /*  the read the click asked for: before the set  */
        gobj_send_event(view, "EV_TRACE_INFO", Object.assign({}, TCP_INFO, {set_id: null}), host);
        expect(row_of(view, "traffic").$gobj.disabled).toBe(true);
        /*  a tree a Refresh asked for before the tick  */
        gobj_send_event(view, "EV_LOAD_TREE", {tree: TREE, set_id: null}, host);
        expect(row_of(view, "traffic").$gobj.disabled).toBe(true);

        /*  what the backend says after the set  */
        const tree = JSON.parse(JSON.stringify(TREE));
        tree["C_YUNO^gate"].children["C_TCP^tcp1"].gobj_trace_level.push("machine");
        gobj_send_event(view, "EV_LOAD_TREE", {tree: tree, set_id: set_id}, host);
        expect([row_of(view, "machine").$gobj.checked, row_of(view, "machine").$gobj.disabled])
            .toEqual([true, false]);
        expect(problems()).toEqual([]);
    });

    test("the viewer is unlocked by its set's answer, not by a read asked before it", async () => {
        const {view, viewer} = await open_tcp_viewer();
        /*  the card asked for C_TCP again; not answered yet  */
        gobj_send_event(view, "EV_NODE_CLICK",
            {id: node_id_of(view, "C_YUNO^gate`C_TCP^tcp1"), client_x: 10, client_y: 10}, view);
        gobj_send_event(view, "EV_SET_GCLASS_TRACE", {gclass: "C_TCP", levels: ["traffic"], set: true}, viewer);
        const set_id = last_set_id();
        expect(viewer_box(viewer, "traffic").disabled).toBe(true);

        gobj_send_event(view, "EV_TRACE_INFO", Object.assign({}, TCP_INFO, {set_id: null}), host);
        expect([viewer_box(viewer, "traffic").checked, viewer_box(viewer, "traffic").disabled])
            .toEqual([false, true]);
        expect(view.priv.set_in_flight).not.toBe(null);

        gobj_send_event(view, "EV_TRACE_INFO", Object.assign({}, TCP_INFO,
            {gclass_on: ["connections", "traffic"], set_id: set_id}), host);
        expect([viewer_box(viewer, "traffic").checked, viewer_box(viewer, "traffic").disabled])
            .toEqual([true, false]);
        expect(view.priv.set_in_flight).toBe(null);
        expect(problems()).toEqual([]);
    });

    test("a set of the yuno's scope: the viewer's own read is asked as part of the set", async () => {
        const {view, viewer} = await open_tcp_viewer();
        /*  a read of C_TCP asked before the set (the card, opened again)  */
        gobj_send_event(view, "EV_NODE_CLICK",
            {id: node_id_of(view, "C_YUNO^gate`C_TCP^tcp1"), client_x: 10, client_y: 10}, view);
        gobj_read_attr(view, "$container").querySelector(".GOBJ_TREE_YUNO_TRACES_BUTTON").click();
        gobj_send_event(view, "EV_TRACE_INFO", Object.assign({}, YUNO_INFO, {set_id: null}), host);
        wanted.length = 0;

        const ev_kw = row_of(view, "ev_kw");
        ev_kw.$global.checked = true;
        ev_kw.$global.dispatchEvent(fake_event("change"));
        const set_id = last_set_id();
        wanted.length = 0;

        gobj_send_event(view, "EV_TRACE_INFO", Object.assign({}, YUNO_INFO,
            {global_on: ["machine", "ev_kw"], set_id: set_id}), host);
        expect(wanted.map((w) => [w.event, w.kw.gclass, w.kw.set_id]))
            .toEqual([["EV_TRACE_INFO_WANTED", "C_TCP", set_id]]);
        expect(viewer_box(viewer, "traffic").disabled).toBe(true);

        /*  the read asked before the set: not the one the viewer waits for  */
        gobj_send_event(view, "EV_TRACE_INFO", Object.assign({}, TCP_INFO, {set_id: null}), host);
        expect(viewer_box(viewer, "traffic").disabled).toBe(true);

        gobj_send_event(view, "EV_TRACE_INFO", Object.assign({}, TCP_INFO,
            {global_levels: YUNO_INFO.global_levels,
             gclass_on: ["connections", "ev_kw"], global_on: ["ev_kw"], set_id: set_id}), host);
        expect(viewer_box(viewer, "traffic").disabled).toBe(false);
        expect(problems()).toEqual([]);
    });

    /*  The host REPLACES the pending read of a gclass
     *  with the one of a newer set of that gclass, so the read the
     *  viewer waits for (the yuno's, of an older set) never comes.  */
    test("a newer set of the gclass the viewer waits for: it waits for the newer one", async () => {
        const {view, viewer} = await open_tcp_viewer();
        gobj_read_attr(view, "$container").querySelector(".GOBJ_TREE_YUNO_TRACES_BUTTON").click();
        gobj_send_event(view, "EV_TRACE_INFO", Object.assign({}, YUNO_INFO, {set_id: null}), host);

        /*  S1: a set of the yuno's scope; the viewer of C_TCP waits for C_YUNO  */
        const ev_kw = row_of(view, "ev_kw");
        ev_kw.$global.checked = true;
        ev_kw.$global.dispatchEvent(fake_event("change"));
        const s1 = last_set_id();
        expect(viewer_box(viewer, "traffic").disabled).toBe(true);
        gobj_send_event(view, "EV_LOAD_TREE", {tree: TREE, set_id: s1}, host);

        /*  S2: a gobj set on the root's card, before the C_YUNO read of S1  */
        gobj_send_event(view, "EV_NODE_CLICK",
            {id: node_id_of(view, "C_YUNO^gate"), client_x: 10, client_y: 10}, view);
        const {$gobj} = row_of(view, "machine");
        $gobj.checked = true;
        $gobj.dispatchEvent(fake_event("change"));
        const s2 = last_set_id();
        expect(s2).not.toBe(s1);
        wanted.length = 0;

        /*  the host sends only the C_YUNO read of S2: S1's was replaced  */
        gobj_send_event(view, "EV_TRACE_INFO", Object.assign({}, YUNO_INFO,
            {global_on: ["machine", "ev_kw"], set_id: s2}), host);
        expect(wanted.map((w) => [w.event, w.kw.gclass, w.kw.set_id]))
            .toEqual([["EV_TRACE_INFO_WANTED", "C_TCP", s2]]);
        gobj_send_event(view, "EV_TRACE_INFO", Object.assign({}, TCP_INFO,
            {global_levels: YUNO_INFO.global_levels,
             gclass_on: ["connections", "ev_kw"], global_on: ["ev_kw"], set_id: s2}), host);
        expect(viewer_box(viewer, "traffic").disabled).toBe(false);
        expect(problems()).toEqual([]);
    });
});
