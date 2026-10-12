/***********************************************************************
 *          g6_nodes_tree_focus.wiring.test.js
 *
 *      The real C_G6_NODES_TREE, on a G6 Graph double that behaves as
 *      G6 does where it matters here: the first render() leaves FOUR
 *      canvases in the container, each with `tabIndex = 1` (G6's
 *      configCanvasDom), and says so with `aftercanvasinit`; and a
 *      keydown inside the container is forwarded to the graph's
 *      `keydown` listeners (G6's forwardContainerEvents).
 *
 *      What it holds (REV-CLOUD V20.5, second pass):
 *
 *      - **The keyboard is not lost when a focused button goes.** A
 *        floating button reached with Tab, or the ✕ of the detail
 *        popover, is removed by what the reader does next (Escape
 *        deselects, the ✕ closes). Firefox fires no focusout for a
 *        removed element: the focus fell to <body> and the graph heard
 *        no other key. The view gives the focus to the main canvas
 *        BEFORE it removes the element.
 *      - **Tab goes from the graph to the graph's own buttons.** The
 *        main canvas takes tabindex 0, the other layers -1: a positive
 *        tabindex put them before every control of the page.
 *      - **A button's click is an EVENT.** The ✕ and the floating
 *        buttons send an input event with the identity of what they
 *        belong to, and the ACTION does the work.
 *      - **The detail popover's ✕ is the named, keyed button** of
 *        create_detail_close, and "no fields" carries its key.
 *
 *      And from the third pass (V20.5 #4 and #5):
 *
 *      - **Every other button of the view is an event too**: the
 *        edit toolbar's create, the cancel / apply / confirm rows of
 *        the popovers, and the press on the link icon that may be a
 *        drag -- with its release. Each carries the identity of what
 *        it is about (and what the form held), and an identity that
 *        is not the one open is refused, loudly.
 *      - **A toggle of the toolbars says its state** in
 *        `aria-pressed`, and a disabled item is born out of the Tab
 *        order.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {describe, test, expect, beforeAll, beforeEach, afterEach, vi} from "vitest";
import {install_dom_double, FakeElement} from "../test/dom_double.js";

install_dom_double();

/*  What G6 leaves in the container, and what it forwards.  */
const graphs = vi.hoisted(() => []);
vi.mock("@antv/g6", async (importOriginal) => {
    const real = await importOriginal();
    class FakeGraph {
        constructor(options) {
            this.options = options;
            this.handlers = {};
            this.plugins = [];
            this.layers = null;
            this.nodes = new Map();
            this.edges = new Map();
            this.rendered = false;
            const $c = options.container;
            $c.addEventListener("keydown", (ev) => {
                this.emit("keydown", ev);
            });
            graphs.push(this);
            return new Proxy(this, {
                get: (t, k) => (k in t) ? t[k] : (() => undefined),
            });
        }
        render() {
            /*  The canvas is built by the FIRST render, and G6 says so
             *  with `aftercanvasinit` once it is (initCanvas).  */
            if(!this.layers) {
                const $c = this.options.container;
                this.layers = {};
                for(const name of ["background", "main", "label", "transient"]) {
                    const el = document.createElement("canvas");
                    el.setAttribute("data-layer", name);
                    el.tabIndex = 1;
                    el.isConnected = true;
                    if(name !== "main") {
                        el.style.pointerEvents = "none";
                    }
                    $c.appendChild(el);
                    this.layers[name] = {getContextService: () => ({getDomElement: () => el})};
                }
                this.emit(real.GraphEvent.AFTER_CANVAS_INIT, {canvas: this.getCanvas()});
            }
            this.rendered = true;
            return Promise.resolve();
        }
        getCanvas() {
            return {
                getLayers: () => this.layers,
                getContainer: () => this.options.container,
                getContextService: () => this.layers.main.getContextService(),
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
        getOptions() {
            return {behaviors: []};
        }
        getPlugins() {
            return this.plugins;
        }
        setPlugins(fn) {
            this.plugins = (typeof fn === "function") ? fn(this.plugins) : fn;
        }
        getPluginInstance() {
            /*  A plugin that answers anything with "no": nothing to
             *  undo, nothing to redo.  */
            return new Proxy({undoStack: [], redoStack: []}, {
                get: (t, k) => (k in t) ? t[k] : (() => false),
            });
        }
        getBehaviors() {
            return [];
        }
        getData() {
            return {nodes: [...this.nodes.values()], edges: [], combos: []};
        }
        getNodeData(id) {
            if(id === undefined) {
                return [...this.nodes.values()];
            }
            const nd = this.nodes.get(id);
            if(!nd) {
                throw new Error(`node ${id} not found`);
            }
            return nd;
        }
        getEdgeData(id) {
            if(id === undefined) {
                return [...this.edges.values()];
            }
            const ed = this.edges.get(id);
            if(!ed) {
                throw new Error(`edge ${id} not found`);
            }
            return ed;
        }
        getElementDataByState() {
            return [];
        }
        getElementPosition() {
            return [100, 100];
        }
        getViewportByCanvas(p) {
            return p;
        }
        getCanvasByViewport(p) {
            return p;
        }
        getZoom() {
            return 1;
        }
        draw() {
            return Promise.resolve();
        }
    }
    return {...real, Graph: FakeGraph};
});

const {
    SDATA, SDATA_END, data_type_t,
    gclass_create, gclass_find_by_name, gclass_check_fsm, gclass_event_type,
    gobj_start_up, gobj_create_yuno, gobj_create_pure_child,
    gobj_send_event, register_c_timer, set_log_callback,
} = await import("@yuneta/gobj-js");
const {register_c_g6_nodes_tree, toolbar_item_html} = await import("./c_g6_nodes_tree.js");

const logged = [];

/*  A DOM event as the browser dispatches it: at the target, then up
 *  its ancestors, until a listener stops it.  */
function dispatch(target, type, init)
{
    const ev = Object.assign({
        type: type, target: target,
        prevented: false, stopped: false,
        preventDefault() {
            this.prevented = true;
        },
        stopPropagation() {
            this.stopped = true;
        },
    }, init || {});
    for(let n = target; n && !ev.stopped; n = n.parentNode) {
        ev.currentTarget = n;
        for(const fn of [...((n.listeners && n.listeners[type]) || [])]) {
            fn.call(n, ev);
        }
    }
    return ev;
}

FakeElement.prototype.click = function() {
    dispatch(this, "click");
};

/*  focus() moves document.activeElement, as in a browser. A removed
 *  element KEEPS it here, which is what Firefox does in effect -- no
 *  focusout, nothing gives it back -- so a test reads exactly the
 *  focus the view left behind.  */
FakeElement.prototype.focus = function() {
    document.activeElement = this;
};

/*  main_canvas_of() finds the main layer by its `pointer-events`.  */
window.getComputedStyle = (el) => el.style;

/*  Which actions ran, by event: each action of the machine, wrapped.  */
const actions_run = [];

/*  What the view published to its host.  */
const published = [];

let yuno = null;

beforeAll(async () => {
    const i18next = (await import("i18next")).default;
    await i18next.init({lng: "en", resources: {en: {translation: {
        "close": "Close", "no fields": "No fields", "node properties": "Node properties",
    }}}});
    gobj_start_up(null, null, null, null, null, null, null);
    set_log_callback((level, msg) => {
        logged.push({level: String(level), msg: String(msg)});
    });
    register_c_timer();
    register_c_g6_nodes_tree();

    const gclass = gclass_find_by_name("C_G6_NODES_TREE", false);
    for(const st of gclass.dl_states) {
        for(const a of st.dl_actions) {
            const action = a.action;
            a.action = (gobj, event, kw, src) => {
                actions_run.push({event: event, kw: JSON.parse(JSON.stringify(kw || {}))});
                return action(gobj, event, kw, src);
            };
        }
    }

    const host_events = ["EV_VERTEX_CLICKED", "EV_EDGE_CLICKED", "EV_UPDATE_NODE",
        "EV_DELETE_NODE", "EV_LAYOUT_AUTOSET", "EV_LEGEND_STATE", "EV_FIND_RESULT",
        "EV_CREATE_NODE", "EV_LINK_NODES", "EV_UNLINK_NODES"];
    gclass_create(
        "C_TEST_FOCUS_HOST",
        host_events.map((e) => [e, 0]),
        [["ST_IDLE", host_events.map((e) => [e, (gobj, ev, kw) => {
            published.push({event: ev, kw: JSON.parse(JSON.stringify(kw || {}))});
            return 0;
        }, null])]],
        {}, 0,
        [SDATA(data_type_t.DTP_STRING, "node_uuid", 0, "test-node-uuid", ""), SDATA_END()],
        {}, 0, 0, 0, 0
    );
    yuno = gobj_create_yuno("focus_yuno", "C_TEST_FOCUS_HOST", {});
});

/*  Nothing but what a test asks for is logged as an error: a test
 *  that expects a refusal says so in its name.  */
afterEach((ctx) => {
    if(!ctx.task.name.includes("refused")) {
        expect(errors()).toEqual([]);
    }
});

beforeEach(() => {
    logged.length = 0;
    actions_run.length = 0;
    published.length = 0;
    document.activeElement = document.body;
});

let seq = 0;

const DESC = {topic_name: "users", cols: [
    {id: "id", type: "string", flag: ["persistent"]},
    {id: "manager", type: "array", flag: ["fkey"], fkey: {users: "managers"}},
]};

/*  A tree, rendered, in `mode`, holding one node of `record`.  */
async function build(mode, record, attrs)
{
    const $container = document.createElement("div");
    const tree = gobj_create_pure_child(`focus_tree_${++seq}`, "C_G6_NODES_TREE", Object.assign({
        $container: $container, operation_mode: mode,
        with_toolbar: false, confirm_delete_node: true,
    }, attrs || {}), yuno);
    /*  render() resolves on its own time, as G6's does.  */
    await new Promise((resolve) => setTimeout(resolve, 0));
    const graph = graphs[graphs.length - 1];
    /*  n1 has one port, `manager`, on its right edge: (160, 100) on
     *  the canvas, which the double maps 1:1 to the viewport.  */
    graph.nodes.set("n1", {
        id: "n1",
        data: {desc: DESC, record: record || {}},
        style: {size: [120, 40], ports: [{key: "manager", placement: [1, 0.5], r: 14}]},
    });
    graph.edges.set("e1", {
        id: "e1", source: "n1", target: "n1",
        data: {parent_topic: "users", parent_id: "u1", hook_name: "managers",
               child_topic: "users", child_id: "u1", fkey_name: "manager"},
    });
    gobj_send_event(tree, "EV_SET_OPERATION_MODE", {operation_mode: mode}, tree);
    const $main = $container.querySelector('canvas[data-layer="main"]');
    return {tree, $container, graph, $main};
}

function errors()
{
    return logged.filter((l) => l.level === "error").map((l) => l.msg);
}

function ran(event)
{
    return actions_run.filter((a) => a.event === event);
}

describe("the machine hears the buttons' events", () => {
    test("each one is declared, with an action", () => {
        const gclass = gclass_find_by_name("C_G6_NODES_TREE", false);
        const idle = gclass.dl_states.find((st) => st.state_name === "ST_IDLE");
        for(const ev of ["EV_TOGGLE_NODE_POPOVER", "EV_TOGGLE_EDGE_POPOVER",
                         "EV_TOGGLE_PORT_POPOVER", "EV_ENTER_LINKING_MODE",
                         "EV_CLOSE_NODE_DETAIL", "EV_REQUEST_DELETE_NODE",
                         "EV_REQUEST_UNLINK_EDGE"]) {
            expect(gclass_event_type(gclass, ev), ev).toBeTruthy();
            expect(idle.dl_actions.some((a) => a.event_name === ev &&
                typeof a.action === "function"), ev).toBe(true);
        }
        expect(gclass_check_fsm(gclass)).toBe(0);
    });
});

describe("Tab order: the main canvas in its place, the other layers out", () => {
    test("after render, main is 0 and the other three are -1", async () => {
        const {$container} = await build("reading");
        const order = {};
        for(const c of $container.querySelectorAll("canvas")) {
            order[c.getAttribute("data-layer")] = c.tabIndex;
        }
        expect(order).toEqual({background: -1, main: 0, label: -1, transient: -1});
    });

    test("the canvas the focus handlers use is the one in the Tab order", async () => {
        const {$container, $main} = await build("reading");
        const card = document.createElement("div");
        $container.appendChild(card);
        dispatch(card, "pointerdown");
        expect(document.activeElement === $main, "the focus is on $main").toBe(true);
        expect($main.tabIndex).toBe(0);
    });
});

describe("the detail popover (reading)", () => {
    test("its ✕ is the keyed button, and 'no fields' carries its key", async () => {
        const {tree, $container} = await build("reading", {__md_treedb__: {}});
        gobj_send_event(tree, "EV_NODE_CLICK", {id: "n1"}, tree);
        const popover = $container.querySelector(".g6-node-detail");
        expect(popover).toBeTruthy();
        const close = popover.querySelector(".g6-detail-head .g6-detail-close");
        expect(close).toBeTruthy();
        expect(close.getAttribute("role")).toBe("button");
        expect(close.getAttribute("tabindex")).toBe("0");
        expect(close.getAttribute("data-i18n-title")).toBe("close");
        expect(close.getAttribute("data-i18n-aria-label")).toBe("close");
        expect(close.getAttribute("title")).toBe("Close");
        expect(close.getAttribute("aria-label")).toBe("Close");
        const empty = popover.querySelector(".g6-detail-empty");
        expect(empty).toBeTruthy();
        expect(empty.getAttribute("data-i18n")).toBe("no fields");
        expect(empty.textContent).toBe("No fields");
        expect(popover.querySelector(".g6-detail-id").textContent).toBe("n1");
        expect(popover.querySelector(".g6-detail-topic").textContent).toBe("users");
    });

    test("a record's fields are rows of TEXT, and then there is no 'no fields'", async () => {
        const {tree, $container} = await build("reading",
            {id: "u1", name: "<b>Ann</b>", tags: ["a"], __md_treedb__: {}});
        gobj_send_event(tree, "EV_NODE_CLICK", {id: "n1"}, tree);
        const popover = $container.querySelector(".g6-node-detail");
        const rows = popover.querySelectorAll(".g6-detail-row");
        expect(rows.map((r) => [
            r.querySelector(".g6-detail-key").textContent,
            r.querySelector(".g6-detail-val").textContent,
        ])).toEqual([["id", "u1"], ["name", "<b>Ann</b>"], ["tags", '["a"]']]);
        expect(popover.querySelector(".g6-detail-empty")).toBe(null);
    });

    test("the ✕ click is EV_CLOSE_NODE_DETAIL, and the action closes it", async () => {
        const {tree, $container} = await build("reading");
        gobj_send_event(tree, "EV_NODE_CLICK", {id: "n1"}, tree);
        const close = $container.querySelector(".g6-detail-close");
        close.click();
        expect(ran("EV_CLOSE_NODE_DETAIL")).toEqual([
            {event: "EV_CLOSE_NODE_DETAIL", kw: {node_id: "n1"}}
        ]);
        expect($container.querySelector(".g6-node-detail")).toBe(null);
        expect(tree.priv._detail_node_id).toBe(null);
        expect(errors()).toEqual([]);
    });

    test("Enter on the focused ✕ closes it, and the focus goes back to the canvas", async () => {
        const {tree, $container, $main} = await build("reading");
        gobj_send_event(tree, "EV_NODE_CLICK", {id: "n1"}, tree);
        const close = $container.querySelector(".g6-detail-close");
        close.focus();                                  /*  reached with Tab  */
        const ev = dispatch(close, "keydown", {key: "Enter"});
        expect(ev.stopped).toBe(true);
        expect($container.querySelector(".g6-node-detail")).toBe(null);
        expect(document.activeElement === $main, "the focus is on $main").toBe(true);
        expect(ran("EV_KEY_DOWN")).toEqual([]);         /*  the key was the button's  */
    });

    test("a pointer press on the ✕ does not take the focus from the canvas", async () => {
        const {tree, $container, $main} = await build("reading");
        gobj_send_event(tree, "EV_NODE_CLICK", {id: "n1"}, tree);
        const close = $container.querySelector(".g6-detail-close");
        $main.focus();
        const ev = dispatch(close, "pointerdown");
        expect(ev.prevented).toBe(true);
        expect(document.activeElement === $main, "the focus is on $main").toBe(true);
    });

    test("a ✕ of another popover is refused, loudly", async () => {
        const {tree, $container} = await build("reading");
        gobj_send_event(tree, "EV_NODE_CLICK", {id: "n1"}, tree);
        gobj_send_event(tree, "EV_CLOSE_NODE_DETAIL", {node_id: "n9"}, tree);
        expect($container.querySelector(".g6-node-detail")).toBeTruthy();
        expect(errors().some((m) => m.includes("EV_CLOSE_NODE_DETAIL"))).toBe(true);
    });
});

/*  The button of `$container` named by `key` (the double's selectors
 *  split at a space, so an attribute value with one is matched here).  */
function by_key($container, key)
{
    return $container.querySelectorAll("[data-i18n-title]")
        .find((el) => el.getAttribute("data-i18n-title") === key) || null;
}

/*  A tree in edition with node n1 selected: its gear and its trash.  */
async function selected()
{
    const b = await build("edition");
    gobj_send_event(b.tree, "EV_NODE_CLICK", {id: "n1", client_x: 0, client_y: 0}, b.tree);
    b.gear = by_key(b.$container, "node properties");
    b.trash = by_key(b.$container, "delete node");
    return b;
}

describe("the floating buttons beside a selected node (edition)", () => {
    test("are there once the node is selected", async () => {
        const {tree, gear, trash} = await selected();
        expect(tree.priv._selected_node_id).toBe("n1");
        expect(gear).toBeTruthy();
        expect(trash).toBeTruthy();
    });

    test("Escape with the gear focused: the gear goes, the focus goes to the canvas", async () => {
        const {tree, $container, $main, gear} = await selected();
        gear.focus();                                   /*  reached with Tab  */
        /*  Not the button's key: it reaches the container, which G6
         *  forwards to the graph -- EV_KEY_DOWN.  */
        const ev = dispatch(gear, "keydown", {key: "Escape"});
        expect(ev.stopped).toBe(false);
        expect(ran("EV_KEY_DOWN").map((a) => a.kw.key)).toEqual(["Escape"]);
        expect(tree.priv._selected_node_id).toBe(null);
        expect(by_key($container, "node properties")).toBe(null);
        /*  The graph still has the keyboard: the next key reaches it.  */
        expect(document.activeElement === $main, "the focus is on $main").toBe(true);
        dispatch(document.activeElement, "keydown", {key: "Delete"});
        expect(ran("EV_KEY_DOWN").map((a) => a.kw.key)).toEqual(["Escape", "Delete"]);
    });

    test("a pointer press on the gear leaves the focus on the canvas", async () => {
        const {$main, gear} = await selected();
        /*  The container's listener puts it on the canvas, and the
         *  gear's own cancels the mousedown that would move it on to
         *  the gear.  */
        const ev = dispatch(gear, "pointerdown");
        expect(ev.prevented).toBe(true);
        expect(document.activeElement === $main, "the focus is on $main").toBe(true);
    });

    test("the gear's click is EV_TOGGLE_NODE_POPOVER with the node's identity", async () => {
        const {$container, gear} = await selected();
        gear.click();
        expect(ran("EV_TOGGLE_NODE_POPOVER")).toEqual([
            {event: "EV_TOGGLE_NODE_POPOVER", kw: {node_id: "n1"}}
        ]);
        expect($container.querySelector(".g6-node-popover")).toBeTruthy();
        gear.click();
        expect($container.querySelector(".g6-node-popover")).toBe(null);
    });

    test("Enter on the trash is EV_REQUEST_DELETE_NODE, and the graph hears no key", async () => {
        const {trash} = await selected();
        trash.focus();
        dispatch(trash, "keydown", {key: "Enter"});
        expect(ran("EV_REQUEST_DELETE_NODE")).toEqual([
            {event: "EV_REQUEST_DELETE_NODE", kw: {node_id: "n1"}}
        ]);
        expect(ran("EV_KEY_DOWN")).toEqual([]);
    });

    test("an identity that is not the selection is refused, loudly", async () => {
        const {tree, $container} = await selected();
        gobj_send_event(tree, "EV_TOGGLE_NODE_POPOVER", {node_id: "n9"}, tree);
        gobj_send_event(tree, "EV_REQUEST_DELETE_NODE", {}, tree);
        expect($container.querySelector(".g6-node-popover")).toBe(null);
        expect(errors().filter((m) => m.includes("but the selection is")).length).toBe(2);
    });
});

describe("the floating buttons beside a selected edge (edition)", () => {
    async function edge_selected()
    {
        const b = await build("edition");
        gobj_send_event(b.tree, "EV_EDGE_CLICK", {id: "e1"}, b.tree);
        b.gear = by_key(b.$container, "edge properties");
        b.trash = by_key(b.$container, "unlink");
        return b;
    }

    test("the gear's click is EV_TOGGLE_EDGE_POPOVER, Enter on the trash EV_REQUEST_UNLINK_EDGE", async () => {
        const {tree, gear, trash} = await edge_selected();
        expect(tree.priv._selected_edge_id).toBe("e1");
        gear.click();
        expect(ran("EV_TOGGLE_EDGE_POPOVER")).toEqual([
            {event: "EV_TOGGLE_EDGE_POPOVER", kw: {edge_id: "e1"}}
        ]);
        dispatch(trash, "keydown", {key: "Enter"});
        expect(ran("EV_REQUEST_UNLINK_EDGE")).toEqual([
            {event: "EV_REQUEST_UNLINK_EDGE", kw: {edge_id: "e1"}}
        ]);
        expect(ran("EV_KEY_DOWN")).toEqual([]);
    });

    test("Escape with the trash focused: the focus goes to the canvas", async () => {
        const {$container, $main, trash} = await edge_selected();
        trash.focus();
        dispatch(trash, "keydown", {key: "Escape"});
        expect(by_key($container, "unlink")).toBe(null);
        expect(document.activeElement === $main, "the focus is on $main").toBe(true);
    });
});

describe("the floating buttons beside a selected fkey port (edition)", () => {
    async function port_selected()
    {
        const b = await build("edition");
        gobj_send_event(b.tree, "EV_NODE_CLICK", {id: "n1", client_x: 160, client_y: 100}, b.tree);
        b.link = by_key(b.$container, "link to hook");
        b.gear = by_key(b.$container, "port properties");
        return b;
    }

    test("the link and the gear send their events with the port's identity", async () => {
        const {tree, link, gear} = await port_selected();
        expect(tree.priv._selected_port_key).toBe("manager");
        expect(link).toBeTruthy();
        expect(gear).toBeTruthy();
        gear.click();
        expect(ran("EV_TOGGLE_PORT_POPOVER")).toEqual([
            {event: "EV_TOGGLE_PORT_POPOVER", kw: {node_id: "n1", port_key: "manager"}}
        ]);
        link.click();
        expect(ran("EV_ENTER_LINKING_MODE")).toEqual([
            {event: "EV_ENTER_LINKING_MODE", kw: {node_id: "n1", port_key: "manager"}}
        ]);
    });

    test("Escape with the port gear focused: the focus goes to the canvas", async () => {
        const {$container, $main, gear} = await port_selected();
        gear.focus();
        dispatch(gear, "keydown", {key: "Escape"});
        expect(by_key($container, "port properties")).toBe(null);
        expect(document.activeElement === $main, "the focus is on $main").toBe(true);
    });
});

/*  What the view published to its host, of `events` only: a click
 *  on a node also tells the host (EV_VERTEX_CLICKED).  */
function published_of(...events)
{
    return published.filter((p) => events.includes(p.event));
}

/*  A browser's <select> holds its first option until somebody picks
 *  another; the double's holds "". Picked here, as the person would.  */
function pick_first_options($popover)
{
    for(const $sel of $popover.querySelectorAll("select")) {
        const first = $sel.querySelectorAll("option")[0];
        $sel.value = first? first.value : "";
    }
}

/*  The button of `$popover` whose text carries `key`.  */
function button_of($popover, key)
{
    return $popover.querySelectorAll("button")
        .find((b) => b.getAttribute("data-i18n") === key) || null;
}

/*  The plugin a view handed G6, by key: its getItems and onClick.  */
function plugin_def(graph, key)
{
    return graph.plugins.find((p) => p && p.key === key) || null;
}

/*  What the view writes on the live style, recorded.  */
function record_updates(graph)
{
    const calls = [];
    graph.updateNodeData = (arr) => {
        calls.push(JSON.parse(JSON.stringify(arr)));
    };
    graph.updateEdgeData = (arr) => {
        calls.push(JSON.parse(JSON.stringify(arr)));
    };
    return calls;
}

describe("the edit toolbar's create button is an EVENT (third pass)", () => {
    async function edition_with_toolbar()
    {
        const b = await build("edition", null, {with_toolbar: true});
        gobj_send_event(b.tree, "EV_DESCS", {users: JSON.parse(JSON.stringify(DESC))}, b.tree);
        b.edit = plugin_def(b.graph, "toolbar-edit");
        return b;
    }

    test("create-node is EV_TOGGLE_CREATE_POPOVER, and the action opens and closes it", async () => {
        const {tree, $container, edit} = await edition_with_toolbar();
        expect(edit).toBeTruthy();
        edit.onClick("create-node");
        expect(ran("EV_TOGGLE_CREATE_POPOVER")).toEqual([
            {event: "EV_TOGGLE_CREATE_POPOVER", kw: {}}
        ]);
        expect($container.querySelector(".g6-create-popover")).toBeTruthy();
        edit.onClick("create-node");
        expect($container.querySelector(".g6-create-popover")).toBe(null);
        expect(tree.priv._create_popover_el).toBe(null);
    });

    test("its cancel and Escape are EV_CLOSE_CREATE_POPOVER", async () => {
        const {$container, edit} = await edition_with_toolbar();
        edit.onClick("create-node");
        let $pop = $container.querySelector(".g6-create-popover");
        button_of($pop, "cancel").click();
        expect(ran("EV_CLOSE_CREATE_POPOVER")).toEqual([
            {event: "EV_CLOSE_CREATE_POPOVER", kw: {}}
        ]);
        expect($container.querySelector(".g6-create-popover")).toBe(null);

        edit.onClick("create-node");
        $pop = $container.querySelector(".g6-create-popover");
        dispatch($pop.querySelector(".G6_CREATE_ID"), "keydown", {key: "Escape"});
        expect(ran("EV_CLOSE_CREATE_POPOVER").length).toBe(2);
        expect($container.querySelector(".g6-create-popover")).toBe(null);
    });

    test("create sends what the form holds; an empty id is said in the popover", async () => {
        const {$container, edit} = await edition_with_toolbar();
        edit.onClick("create-node");
        const $pop = $container.querySelector(".g6-create-popover");
        pick_first_options($pop);
        const $id = $pop.querySelector(".G6_CREATE_ID");
        const $create = button_of($pop, "create");

        $create.click();
        expect(ran("EV_SUBMIT_NEW_NODE")).toEqual([
            {event: "EV_SUBMIT_NEW_NODE", kw: {topic_name: "users", id: ""}}
        ]);
        const $error = $pop.querySelector(".G6_CREATE_ERROR");
        expect($error.getAttribute("data-i18n")).toBe("node id required");
        expect($error.style.display).toBe("block");
        expect(document.activeElement === $id, "the focus is on the id").toBe(true);
        expect(published_of("EV_CREATE_NODE")).toEqual([]);

        $id.value = "  u7 ";
        dispatch($id, "keydown", {key: "Enter"});
        expect(ran("EV_SUBMIT_NEW_NODE")[1]).toEqual(
            {event: "EV_SUBMIT_NEW_NODE", kw: {topic_name: "users", id: "  u7 "}}
        );
        expect(published_of("EV_CREATE_NODE").map((p) => [p.kw.topic_name, p.kw.record])).toEqual([
            ["users", {id: "u7"}]
        ]);
        expect($container.querySelector(".g6-create-popover")).toBe(null);
    });

    test("a close with no create popover open is refused, loudly", async () => {
        const {tree} = await edition_with_toolbar();
        gobj_send_event(tree, "EV_CLOSE_CREATE_POPOVER", {}, tree);
        expect(errors().some((m) => m.includes("no create popover open"))).toBe(true);
    });

    test("a create toggle outside edition is refused, loudly", async () => {
        const {tree, $container} = await build("reading");
        gobj_send_event(tree, "EV_TOGGLE_CREATE_POPOVER", {}, tree);
        expect($container.querySelector(".g6-create-popover")).toBe(null);
        expect(errors().some((m) => m.includes("EV_TOGGLE_CREATE_POPOVER outside edition"))).toBe(true);
    });
});

describe("the popover button rows are EVENTS (third pass)", () => {
    test("node popover: apply sends the identity and the form, the action applies it", async () => {
        const {tree, $container, graph, gear} = await selected();
        gear.click();
        const $pop = $container.querySelector(".g6-node-popover");
        pick_first_options($pop);
        const inputs = $pop.querySelectorAll("input");
        inputs[0].value = "#ff0000";                        /*  fill  */
        const calls = record_updates(graph);
        button_of($pop, "apply").click();
        const sent = ran("EV_APPLY_NODE_POPOVER");
        expect(sent.length).toBe(1);
        expect(sent[0].kw).toMatchObject({node_id: "n1", fill: "#ff0000", scope: "this"});
        expect(Object.keys(sent[0].kw).sort()).toEqual(
            ["fill", "line_width", "node_id", "scope", "shape", "shape_before", "stroke"]);
        expect(calls[0][0]).toMatchObject({id: "n1", style: {fill: "#ff0000"}});
        expect($container.querySelector(".g6-node-popover")).toBe(null);
        expect(tree.priv._node_preview_undo).toBe(null);
    });

    test("node popover: cancel is EV_CANCEL_NODE_POPOVER, and the preview is undone", async () => {
        const {tree, $container, graph, gear} = await selected();
        gear.click();
        const $pop = $container.querySelector(".g6-node-popover");
        const calls = record_updates(graph);
        button_of($pop, "cancel").click();
        expect(ran("EV_CANCEL_NODE_POPOVER")).toEqual([
            {event: "EV_CANCEL_NODE_POPOVER", kw: {node_id: "n1"}}
        ]);
        expect($container.querySelector(".g6-node-popover")).toBe(null);
        /*  The undo of the preview repaints the node as it opened.  */
        expect(calls.length).toBe(1);
        expect(tree.priv._node_preview_undo).toBe(null);
    });

    test("node popover: another node's apply, or none open, is refused, loudly", async () => {
        const {tree, $container, gear} = await selected();
        gobj_send_event(tree, "EV_APPLY_NODE_POPOVER", {node_id: "n1", fill: "#000"}, tree);
        expect(errors().some((m) => m.includes("its popover is not open"))).toBe(true);
        gear.click();
        gobj_send_event(tree, "EV_CANCEL_NODE_POPOVER", {node_id: "n9"}, tree);
        expect($container.querySelector(".g6-node-popover")).toBeTruthy();
        expect(errors().some((m) => m.includes("but the selection is"))).toBe(true);
    });

    test("edge popover: apply and cancel are events, with the edge's identity", async () => {
        const b = await build("edition");
        gobj_send_event(b.tree, "EV_EDGE_CLICK", {id: "e1"}, b.tree);
        by_key(b.$container, "edge properties").click();
        let $pop = b.$container.querySelector(".g6-edge-popover");
        pick_first_options($pop);
        const calls = record_updates(b.graph);
        /*  The double's getData() lists no edge; G6's lists them all.  */
        b.graph.getData = () => ({nodes: [...b.graph.nodes.values()],
                                  edges: [...b.graph.edges.values()], combos: []});
        $pop.querySelectorAll("input")[0].value = "7";      /*  line width  */
        button_of($pop, "apply").click();
        expect(ran("EV_APPLY_EDGE_POPOVER").map((a) => a.kw)).toEqual([
            {edge_id: "e1", line_width: "7", color: $pop.querySelectorAll("input")[1].value, scope: "this"}
        ]);
        expect(calls[0][0]).toMatchObject({id: "e1", style: {lineWidth: 7}});
        expect(b.tree.priv._selected_edge_id).toBe(null);

        gobj_send_event(b.tree, "EV_EDGE_CLICK", {id: "e1"}, b.tree);
        by_key(b.$container, "edge properties").click();
        $pop = b.$container.querySelector(".g6-edge-popover");
        button_of($pop, "cancel").click();
        expect(ran("EV_CANCEL_EDGE_POPOVER")).toEqual([
            {event: "EV_CANCEL_EDGE_POPOVER", kw: {edge_id: "e1"}}
        ]);
        expect(b.$container.querySelector(".g6-edge-popover")).toBe(null);
        expect(b.tree.priv._selected_edge_id).toBe(null);
    });

    test("port popover: apply and cancel are events, with the port's identity", async () => {
        const b = await build("edition");
        gobj_send_event(b.tree, "EV_NODE_CLICK", {id: "n1", client_x: 160, client_y: 100}, b.tree);
        by_key(b.$container, "port properties").click();
        let $pop = b.$container.querySelector(".g6-port-popover");
        pick_first_options($pop);
        $pop.querySelectorAll("input")[0].value = "20";     /*  radius  */
        button_of($pop, "apply").click();
        const sent = ran("EV_APPLY_PORT_POPOVER");
        expect(sent.length).toBe(1);
        expect(sent[0].kw).toMatchObject({node_id: "n1", port_key: "manager", r: "20", scope: "this"});
        expect(b.$container.querySelector(".g6-port-popover")).toBe(null);

        by_key(b.$container, "port properties").click();
        $pop = b.$container.querySelector(".g6-port-popover");
        button_of($pop, "cancel").click();
        expect(ran("EV_CANCEL_PORT_POPOVER")).toEqual([
            {event: "EV_CANCEL_PORT_POPOVER", kw: {node_id: "n1", port_key: "manager"}}
        ]);
        expect(b.$container.querySelector(".g6-port-popover")).toBe(null);
    });

    test("confirm popover: cancel is EV_CANCEL_CONFIRM, confirm EV_CONFIRMED, same question", async () => {
        const {tree, $container, trash} = await selected();
        trash.click();
        let $pop = $container.querySelector(".g6-confirm-popover");
        expect($pop).toBeTruthy();
        button_of($pop, "cancel").click();
        expect(ran("EV_CANCEL_CONFIRM")).toEqual([
            {event: "EV_CANCEL_CONFIRM", kw: {what: "delete_node", id: "n1"}}
        ]);
        expect($container.querySelector(".g6-confirm-popover")).toBe(null);
        expect(published_of("EV_DELETE_NODE")).toEqual([]);

        trash.click();
        $pop = $container.querySelector(".g6-confirm-popover");
        button_of($pop, "delete").click();
        expect(ran("EV_CONFIRMED")).toEqual([
            {event: "EV_CONFIRMED", kw: {what: "delete_node", id: "n1"}}
        ]);
        expect(published_of("EV_DELETE_NODE").length).toBe(1);
        expect(tree.priv._delete_confirm_el).toBe(null);
    });

    test("a cancel of a question that is not the one open is refused, loudly", async () => {
        const {tree, $container, trash} = await selected();
        trash.click();
        gobj_send_event(tree, "EV_CANCEL_CONFIRM", {what: "delete_node", id: "n9"}, tree);
        gobj_send_event(tree, "EV_CANCEL_CONFIRM", {what: "unlink_edge", id: "n1"}, tree);
        expect($container.querySelector(".g6-confirm-popover")).toBeTruthy();
        expect(errors().filter((m) => m.includes("but the question open is")).length).toBe(2);
    });
});

/*  Each of the six actions of the popover rows asks the same two
 *  questions before it does anything (popover_is_current): is its
 *  popover open, and is the identity in the kw the selection? A row
 *  only checked through its own buttons never asks either -- the
 *  button exists only while its popover does -- so each is asked here
 *  with the event sent by hand (V20, a fourth pass: dropping the check
 *  from the edge apply or the port cancel left every test green).  */
describe("a popover's apply and cancel act only on the popover open (fourth pass)", () => {
    /*  The selection each popover belongs to, made with the popover
     *  CLOSED; `open` opens it.  */
    async function node_selected()
    {
        const b = await selected();
        b.open = () => {
            b.gear.click();
        };
        return b;
    }

    async function edge_selected()
    {
        const b = await build("edition");
        gobj_send_event(b.tree, "EV_EDGE_CLICK", {id: "e1"}, b.tree);
        b.open = () => {
            by_key(b.$container, "edge properties").click();
        };
        return b;
    }

    async function port_selected()
    {
        const b = await build("edition");
        gobj_send_event(b.tree, "EV_NODE_CLICK", {id: "n1", client_x: 160, client_y: 100}, b.tree);
        b.open = () => {
            by_key(b.$container, "port properties").click();
        };
        return b;
    }

    const CASES = [
        {event: "EV_APPLY_NODE_POPOVER", popover: ".g6-node-popover", select: node_selected,
         kw: {node_id: "n1", shape_before: "", fill: "#ff0000", stroke: "#000000",
              line_width: "3", scope: "this", shape: ""},
         wrong: {node_id: "n9"}},
        {event: "EV_CANCEL_NODE_POPOVER", popover: ".g6-node-popover", select: node_selected,
         kw: {node_id: "n1"},
         wrong: {node_id: "n9"}},
        {event: "EV_APPLY_EDGE_POPOVER", popover: ".g6-edge-popover", select: edge_selected,
         kw: {edge_id: "e1", line_width: "7", color: "#ff0000", scope: "this"},
         wrong: {edge_id: "e9"}},
        {event: "EV_CANCEL_EDGE_POPOVER", popover: ".g6-edge-popover", select: edge_selected,
         kw: {edge_id: "e1"},
         wrong: {edge_id: "e9"}},
        {event: "EV_APPLY_PORT_POPOVER", popover: ".g6-port-popover", select: port_selected,
         kw: {node_id: "n1", port_key: "manager", r_before: 14, shape: "circle", r: "20", scope: "this"},
         wrong: {port_key: "other"}},
        {event: "EV_CANCEL_PORT_POPOVER", popover: ".g6-port-popover", select: port_selected,
         kw: {node_id: "n1", port_key: "manager"},
         wrong: {port_key: "other"}},
    ];

    function selection_of(tree)
    {
        return {
            node: tree.priv._selected_node_id,
            port: tree.priv._selected_port_key,
            edge: tree.priv._selected_edge_id,
        };
    }

    for(const c of CASES) {
        test(`${c.event}: with its popover closed, or for another selection, it is refused, loudly`, async () => {
            const b = await c.select();
            /*  The double's getData() lists no edge; G6's lists them all,
             *  and an apply that ran would write e1.  */
            b.graph.getData = () => ({nodes: [...b.graph.nodes.values()],
                                      edges: [...b.graph.edges.values()], combos: []});
            const calls = record_updates(b.graph);
            const before = selection_of(b.tree);

            gobj_send_event(b.tree, c.event, JSON.parse(JSON.stringify(c.kw)), b.tree);
            expect(errors().length).toBe(1);
            expect(errors()[0]).toContain(`${c.event} for `);
            expect(errors()[0]).toContain("but its popover is not open");
            expect(calls).toEqual([]);
            expect(selection_of(b.tree)).toEqual(before);

            b.open();
            const $pop = b.$container.querySelector(c.popover);
            expect($pop).toBeTruthy();
            logged.length = 0;
            const written = calls.length;

            gobj_send_event(b.tree, c.event, Object.assign(JSON.parse(JSON.stringify(c.kw)), c.wrong), b.tree);
            expect(errors().length).toBe(1);
            expect(errors()[0]).toContain("but the selection is");
            expect(b.$container.querySelector(c.popover) === $pop, "the popover is still open").toBe(true);
            expect(calls.length).toBe(written);
            expect(selection_of(b.tree)).toEqual(before);
        });
    }
});

describe("the link icon's drag is an EVENT, and so is its release (third pass)", () => {
    const DESC_LINK = {topic_name: "users", cols: [
        {id: "id", type: "string", flag: ["persistent"]},
        {id: "manager", type: "array", flag: ["fkey"], fkey: {users: "managers"}},
        {id: "managers", type: "object", flag: ["hook"], hook: {users: "manager"}},
    ]};

    /*  n1's fkey port selected, and n2 -- another user -- whose
     *  `managers` hook is at (40, 100) on the canvas.  */
    async function linkable()
    {
        const b = await build("edition");
        gobj_send_event(b.tree, "EV_DESCS", {users: JSON.parse(JSON.stringify(DESC_LINK))}, b.tree);
        b.graph.nodes.get("n1").data.desc = DESC_LINK;
        b.graph.nodes.set("n2", {
            id: "n2",
            data: {desc: DESC_LINK, record: {id: "u2"}},
            style: {size: [120, 40], ports: [{key: "managers", placement: [0, 0.5], r: 14}]},
        });
        b.graph.nodes.get("n1").data.record = {id: "u1"};
        gobj_send_event(b.tree, "EV_NODE_CLICK", {id: "n1", client_x: 160, client_y: 100}, b.tree);
        b.link = by_key(b.$container, "link to hook");
        return b;
    }

    function on_document(type, init)
    {
        document.dispatchEvent(Object.assign({type: type}, init || {}));
    }

    test("the press is EV_START_LINK_DRAG with the port's identity and where it went down", async () => {
        const {tree, $container, link} = await linkable();
        expect(link).toBeTruthy();
        const ev = dispatch(link, "pointerdown", {clientX: 170, clientY: 105});
        expect(ev.prevented).toBe(true);
        expect(ran("EV_START_LINK_DRAG")).toEqual([
            {event: "EV_START_LINK_DRAG",
             kw: {node_id: "n1", port_key: "manager", client_x: 170, client_y: 105}}
        ]);
        expect(tree.priv._linking_mode).toBe(true);
        expect(tree.priv._link_drag_svg).toBeTruthy();

        /*  No move: a click. The release takes the drag down, and the
         *  click that follows is the icon's own event.  */
        on_document("pointerup", {clientX: 170, clientY: 105});
        expect(ran("EV_LINK_DRAG_END")).toEqual([
            {event: "EV_LINK_DRAG_END", kw: {client_x: 170, client_y: 105, dragged: false}}
        ]);
        expect(tree.priv._link_drag).toBe(null);
        expect(tree.priv._link_drag_svg).toBe(null);
        expect(tree.priv._linking_mode).toBe(true);
        expect(published_of("EV_LINK_NODES")).toEqual([]);
        expect($container.style.cursor).toBe("");
    });

    test("a drag dropped on a hook links, through EV_LINK_DRAG_END", async () => {
        const {tree, link} = await linkable();
        dispatch(link, "pointerdown", {clientX: 170, clientY: 105});
        on_document("pointermove", {clientX: 100, clientY: 100});
        on_document("pointerup", {clientX: 40, clientY: 100});
        expect(ran("EV_LINK_DRAG_END").map((a) => a.kw)).toEqual([
            {client_x: 40, client_y: 100, dragged: true}
        ]);
        expect(published_of("EV_LINK_NODES").map((p) => [p.kw.parent_ref, p.kw.child_ref])).toEqual([
            ["users^u2^managers", "users^u1"]
        ]);
        expect(tree.priv._linking_mode).toBe(false);
        /*  The listeners are off: another release is nobody's.  */
        on_document("pointerup", {clientX: 40, clientY: 100});
        expect(ran("EV_LINK_DRAG_END").length).toBe(1);
    });

    test("a drag dropped on nothing leaves the linking mode", async () => {
        const {tree, link} = await linkable();
        dispatch(link, "pointerdown", {clientX: 170, clientY: 105});
        on_document("pointermove", {clientX: 300, clientY: 300});
        on_document("pointerup", {clientX: 300, clientY: 300});
        expect(published_of("EV_LINK_NODES")).toEqual([]);
        expect(tree.priv._linking_mode).toBe(false);
    });

    test("a cancelled pointer is EV_LINK_DRAG_CANCEL: no drop, no linking mode", async () => {
        const {tree, link} = await linkable();
        dispatch(link, "pointerdown", {clientX: 170, clientY: 105});
        on_document("pointercancel", {});
        expect(ran("EV_LINK_DRAG_CANCEL")).toEqual([
            {event: "EV_LINK_DRAG_CANCEL", kw: {}}
        ]);
        expect(tree.priv._linking_mode).toBe(false);
        expect(tree.priv._link_drag_svg).toBe(null);
        expect(published_of("EV_LINK_NODES")).toEqual([]);
    });

    /*  What a view leaves on `document`, of the pointer listeners a
     *  link drag puts there: the kind of each one still on.  */
    function track_document_pointer_listeners()
    {
        const add = document.addEventListener;
        const remove = document.removeEventListener;
        const live = [];
        document.addEventListener = (type, fn) => {
            live.push({type, fn});
            return add(type, fn);
        };
        document.removeEventListener = (type, fn) => {
            const i = live.findIndex((l) => l.type === type && l.fn === fn);
            if(i >= 0) {
                live.splice(i, 1);
            }
            return remove(type, fn);
        };
        return {
            live: () => live.map((l) => l.type).filter((t) => t.startsWith("pointer")).sort(),
            restore() {
                document.addEventListener = add;
                document.removeEventListener = remove;
            },
        };
    }

    test("a press while a drag is still in flight takes that drag down first: its listeners, its line", async () => {
        const {tree, $container} = await linkable();
        const doc = track_document_pointer_listeners();
        try {
            gobj_send_event(tree, "EV_START_LINK_DRAG",
                {node_id: "n1", port_key: "manager", client_x: 170, client_y: 105}, tree);
            expect(doc.live()).toEqual(["pointercancel", "pointermove", "pointerup"]);
            const first_line = tree.priv._link_drag_svg;
            expect(first_line).toBeTruthy();

            /*  Its release never came (the window lost the pointer, a
             *  press went down on another device): this press starts
             *  over, and the last one is not left behind on document.  */
            gobj_send_event(tree, "EV_START_LINK_DRAG",
                {node_id: "n1", port_key: "manager", client_x: 171, client_y: 106}, tree);
            expect(logged.filter((l) => l.level === "warning" &&
                l.msg.includes("EV_START_LINK_DRAG with a link drag still in flight")).length).toBe(1);
            expect(doc.live()).toEqual(["pointercancel", "pointermove", "pointerup"]);
            expect($container.querySelectorAll("svg").filter((s) => s === first_line)).toEqual([]);
            expect(tree.priv._link_drag_svg).toBeTruthy();

            /*  One release, one end -- not one per press.  */
            on_document("pointerup", {clientX: 171, clientY: 106});
            expect(ran("EV_LINK_DRAG_END").length).toBe(1);
            expect(doc.live()).toEqual([]);
            expect(tree.priv._link_drag).toBe(null);
            expect(tree.priv._link_drag_svg).toBe(null);
            expect(tree.priv._linking_mode).toBe(true);
        } finally {
            doc.restore();
        }
    });

    test("a drag of another port, or a release of no drag, is refused, loudly", async () => {
        const {tree} = await linkable();
        gobj_send_event(tree, "EV_START_LINK_DRAG",
            {node_id: "n1", port_key: "other", client_x: 0, client_y: 0}, tree);
        expect(tree.priv._link_drag).toBe(null);
        gobj_send_event(tree, "EV_LINK_DRAG_END", {client_x: 0, client_y: 0, dragged: true}, tree);
        gobj_send_event(tree, "EV_LINK_DRAG_CANCEL", {}, tree);
        expect(errors().filter((m) => m.includes("but the selection is")).length).toBe(1);
        expect(errors().filter((m) => m.includes("with no link drag in flight")).length).toBe(2);
    });
});

describe("the toggles of the toolbars say their state (third pass)", () => {
    test("the anchor item: aria-pressed only when it is ON", async () => {
        const {tree, graph} = await build("reading", null, {with_toolbar: true});
        const bar = plugin_def(graph, "toolbar");
        const anchor = () => bar.getItems().find((it) => it.value === "anchor");
        expect(anchor().pressed).toBe(false);
        gobj_send_event(tree, "EV_TOGGLE_ANCHOR", {}, tree);         /*  arming  */
        expect(anchor().pressed).toBe(false);
        gobj_send_event(tree, "EV_NODE_CLICK", {id: "n1"}, tree);     /*  on  */
        expect(tree.priv.anchor_state).toBe("on");
        expect(anchor().pressed).toBe(true);
    });

    test("selection mode: aria-pressed baked into the item, and set on the element", async () => {
        const {tree, $container, graph} = await build("edition", null, {with_toolbar: true});
        const edit = plugin_def(graph, "toolbar-edit");
        const mode = () => edit.getItems().find((it) => it.value === "selection-mode");
        expect(mode().pressed).toBe(false);
        /*  The item G6 would draw from that list.  */
        const $item = document.createElement("div");
        $item.className = "g6-toolbar-item EV_TOGGLE_SELECTION_MODE";
        $item.setAttribute("aria-pressed", "false");
        $container.appendChild($item);
        gobj_send_event(tree, "EV_TOGGLE_SELECTION_MODE", {}, tree);
        expect(mode().pressed).toBe(true);
        expect($item.getAttribute("aria-pressed")).toBe("true");
        gobj_send_event(tree, "EV_TOGGLE_SELECTION_MODE", {}, tree);
        expect($item.getAttribute("aria-pressed")).toBe("false");
    });

    test("save, undo and redo are born disabled; full screen is one control", async () => {
        const {graph} = await build("edition", null, {with_toolbar: true});
        const edit = plugin_def(graph, "toolbar-edit");
        for(const v of ["save", "undo", "redo"]) {
            expect(edit.getItems().find((it) => it.value === v).disabled, v).toBe(true);
        }
        const bar = plugin_def(graph, "toolbar");
        const fs = bar.getItems().find((it) => it.value === "request-fullscreen");
        expect(fs.control).toBe("fullscreen");
    });
});

/*  G6 as it rebuilds a toolbar. Every setPlugins() -- an
 *  updatePlugin(), a plugin added or taken away -- updates EVERY
 *  plugin it keeps, and a toolbar's update reads its getItems() right
 *  there; the innerHTML drawn from them lands once that promise
 *  resolves, over whatever the old element was told meanwhile.
 *  `drawn[key]` is the list each toolbar shows after the last one.  */
function rebuild_like_g6(graph)
{
    const drawn = {};
    const set_plugins = graph.setPlugins.bind(graph);
    const read_items = () => {
        for(const key of Object.keys(drawn)) {
            delete drawn[key];
        }
        for(const p of graph.plugins) {
            if(p && p.type === "yui-toolbar") {
                drawn[p.key] = p.getItems();
            }
        }
    };
    graph.setPlugins = (fn) => {
        set_plugins(fn);
        read_items();
    };
    graph.updatePlugin = (def) => {
        graph.setPlugins((plugins) => plugins.map((p) => {
            return (p && p.key === def.key) ? Object.assign({}, p, def) : p;
        }));
    };
    read_items();
    return drawn;
}

/*  The history plugin of a tree in edition, with `undo` / `redo`
 *  commands on its stacks; `record()` changes them and says so, as
 *  G6 does after every draw (HistoryEvent.CHANGE). Out of edition and
 *  back, so the view takes THIS one as the history of its edition and
 *  wires its listener on it.  */
function history_double(tree, graph)
{
    const listeners = [];
    const history = {
        undo: 0,
        redo: 0,
        canUndo() {
            return this.undo > 0;
        },
        canRedo() {
            return this.redo > 0;
        },
        on(ev, fn) {
            listeners.push(fn);
        },
        off() {
        },
        clear() {
            this.undo = 0;
            this.redo = 0;
        },
        record(undo, redo) {
            this.undo = undo;
            this.redo = redo;
            for(const fn of listeners) {
                fn();
            }
        },
    };
    const instance_of = graph.getPluginInstance.bind(graph);
    graph.getPluginInstance = (key) => (key === "history") ? history : instance_of(key);
    gobj_send_event(tree, "EV_SET_OPERATION_MODE", {operation_mode: "reading"}, tree);
    gobj_send_event(tree, "EV_SET_OPERATION_MODE", {operation_mode: "edition"}, tree);
    expect(listeners.length).toBe(1);
    return history;
}

/*  What an item of a drawn toolbar shows: disabled, and lit (the
 *  colour of its kind of action).  */
function shown(drawn, key, value)
{
    const it = drawn[key].find((i) => i.value === value);
    return {
        disabled: !!it.disabled,
        lit: /\bcolor_(submit|active)_state\b/.test(it.className),
    };
}

const DARK = {disabled: true, lit: false};
const LIT = {disabled: false, lit: true};

describe("a rebuilt toolbar shows what its items were told (fourth pass)", () => {
    test("zoom to selection: a selection made before a rebuild is enabled after it", async () => {
        const {tree, graph} = await build("edition", null, {with_toolbar: true});
        const drawn = rebuild_like_g6(graph);
        const fit = () => drawn.toolbar.find((it) => it.value === "fit-selection");
        expect(fit().disabled).toBe(true);

        gobj_send_event(tree, "EV_NODE_CLICK", {id: "n1", client_x: 0, client_y: 0}, tree);
        expect(tree.priv._selected_paint_ids).toEqual(["n1"]);
        gobj_send_event(tree, "EV_LANGUAGE_CHANGED", {}, tree);
        expect(fit().disabled).toBe(false);
        /*  What the reader got instead: `tabindex="-1"
         *  aria-disabled="true" disabled` over a selection.  */
        const html = toolbar_item_html(fit());
        expect(html).toContain(' tabindex="0"');
        expect(html).not.toContain("aria-disabled");

        /*  The anchor rebuilds the same toolbar (the verifier's repro).  */
        gobj_send_event(tree, "EV_TOGGLE_ANCHOR", {}, tree);
        expect(tree.priv.anchor_state).toBe("arming");
        expect(fit().disabled).toBe(false);
        gobj_send_event(tree, "EV_TOGGLE_ANCHOR", {}, tree);

        gobj_send_event(tree, "EV_KEY_DOWN", {key: "Escape"}, tree);
        expect(tree.priv._selected_paint_ids).toEqual([]);
        gobj_send_event(tree, "EV_LANGUAGE_CHANGED", {}, tree);
        expect(fit().disabled).toBe(true);
    });

    test("save, undo and redo: history pending before a rebuild is shown after it", async () => {
        const {tree, graph} = await build("edition", null, {with_toolbar: true});
        const history = history_double(tree, graph);
        const drawn = rebuild_like_g6(graph);
        for(const v of ["save", "undo", "redo"]) {
            expect(shown(drawn, "toolbar-edit", v), v).toEqual(DARK);
        }

        history.record(1, 0);                                   /*  a move G6 recorded  */
        gobj_send_event(tree, "EV_LANGUAGE_CHANGED", {}, tree);
        expect(shown(drawn, "toolbar-edit", "save")).toEqual(LIT);
        expect(shown(drawn, "toolbar-edit", "undo")).toEqual(LIT);
        expect(shown(drawn, "toolbar-edit", "redo")).toEqual(DARK);

        history.record(1, 1);                                   /*  ...one undone, one left  */
        gobj_send_event(tree, "EV_TOGGLE_ANCHOR", {}, tree);
        expect(shown(drawn, "toolbar-edit", "redo")).toEqual(LIT);
        const html = toolbar_item_html(drawn["toolbar-edit"].find((it) => it.value === "undo"));
        expect(html).toContain(' tabindex="0"');
        expect(html).not.toContain("aria-disabled");
    });

    test("a Save lit for a change the history does not record survives a rebuild and a fold", async () => {
        const {tree, graph, $container} = await build("edition", null, {with_toolbar: true});
        history_double(tree, graph);
        const drawn = rebuild_like_g6(graph);

        gobj_send_event(tree, "EV_NODE_DRAG_END", {}, tree);   /*  mark_graph_dirty  */
        gobj_send_event(tree, "EV_LANGUAGE_CHANGED", {}, tree);
        expect(shown(drawn, "toolbar-edit", "save")).toEqual(LIT);
        expect(shown(drawn, "toolbar-edit", "undo")).toEqual(DARK);

        /*  Narrow: the toolbars fold, and the edit toolbar is taken
         *  away and made again.  */
        $container.getBoundingClientRect = () => ({left: 0, top: 0, right: 300, bottom: 400,
                                                   width: 300, height: 400, x: 0, y: 0});
        gobj_send_event(tree, "EV_TOGGLE_TOOLBARS", {}, tree);  /*  unfolded  */
        gobj_send_event(tree, "EV_TOGGLE_TOOLBARS", {}, tree);  /*  folded  */
        expect(drawn["toolbar-edit"]).toBe(undefined);
        gobj_send_event(tree, "EV_TOGGLE_TOOLBARS", {}, tree);  /*  unfolded: made again  */
        expect(shown(drawn, "toolbar-edit", "save")).toEqual(LIT);
    });

    test("a clear (a refresh) puts the Save out: the next rebuild draws it dark", async () => {
        const {tree, graph} = await build("edition", null, {with_toolbar: true});
        history_double(tree, graph);
        const drawn = rebuild_like_g6(graph);

        gobj_send_event(tree, "EV_NODE_DRAG_END", {}, tree);   /*  mark_graph_dirty  */
        gobj_send_event(tree, "EV_LANGUAGE_CHANGED", {}, tree);
        expect(shown(drawn, "toolbar-edit", "save")).toEqual(LIT);

        /*  What a refresh does first: the data goes, and the history
         *  with it. The Save stayed lit in `_save_lit`, so every rebuild
         *  drew it lit over a graph with nothing to save.  */
        gobj_send_event(tree, "EV_CLEAR_DATA", {}, tree);
        expect(tree.priv._save_lit).toBe(false);
        gobj_send_event(tree, "EV_LANGUAGE_CHANGED", {}, tree);
        expect(shown(drawn, "toolbar-edit", "save")).toEqual(DARK);
    });

    test("leaving edition and coming back: the Save says what the new history says", async () => {
        const {tree, graph} = await build("edition", null, {with_toolbar: true});
        const history = history_double(tree, graph);
        const drawn = rebuild_like_g6(graph);

        history.record(2, 0);
        gobj_send_event(tree, "EV_NODE_DRAG_END", {}, tree);
        gobj_send_event(tree, "EV_SET_OPERATION_MODE", {operation_mode: "reading"}, tree);
        expect(drawn["toolbar-edit"]).toBe(undefined);

        /*  The history goes with the edition: the one it comes back
         *  with has nothing to undo, and nothing is owed.  */
        history.clear();
        gobj_send_event(tree, "EV_SET_OPERATION_MODE", {operation_mode: "edition"}, tree);
        for(const v of ["save", "undo", "redo"]) {
            expect(shown(drawn, "toolbar-edit", v), v).toEqual(DARK);
        }

        /*  A write refused while reading is owed: shown as the edit
         *  toolbar is made, not at the next draw.  */
        gobj_send_event(tree, "EV_SET_OPERATION_MODE", {operation_mode: "reading"}, tree);
        gobj_send_event(tree, "EV_GRAPHS_WRITE_REFUSED", {topic: "users"}, tree);
        gobj_send_event(tree, "EV_SET_OPERATION_MODE", {operation_mode: "edition"}, tree);
        expect(shown(drawn, "toolbar-edit", "save")).toEqual(LIT);
        expect(shown(drawn, "toolbar-edit", "undo")).toEqual(DARK);
    });
});
