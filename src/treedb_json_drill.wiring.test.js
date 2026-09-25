/***********************************************************************
 *          treedb_json_drill.wiring.test.js
 *
 *      The raw-tranger viewer of C_YUI_TREEDB_TOPICS and of
 *      C_YUI_TREEDB_GRAPH drills into a `__collapsed__` stub by asking
 *      its host (EV_EXPAND_PATH), and the stub shows "loading" until the
 *      host answers EV_SUBTREE_LOADED or EV_SUBTREE_ERROR. While the
 *      path is pending, C_YUI_JSON ignores every further click on it.
 *
 *      Before gobj-ui 7.25.21 the host answered only when it had no
 *      transport at all. A drill asked out of session, or refused by the
 *      transport on the way out, was logged and never answered: the stub
 *      stayed on "loading" for the life of the viewer, and no click --
 *      not even after the reconnect -- asked again.
 *
 *      Before gobj-ui 7.25.22 a drill already SENT when the session
 *      dropped was never answered either: the transport answers nothing
 *      in flight on a close, and neither host remembered what it had
 *      asked. Each host now keeps its drills in flight and answers them
 *      on the disconnect edge.
 *
 *      Driven through the real hosts and the real viewer on a document
 *      double, with a fake transport whose state is the one the hosts
 *      read and which refuses on demand.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {describe, test, expect, beforeAll, beforeEach} from "vitest";
import {install_dom_double} from "../test/dom_double.js";

install_dom_double();

if(!globalThis.ResizeObserver) {
    globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    };
}

const {
    SDATA, SDATA_END, data_type_t,
    gclass_create,
    gobj_start_up, gobj_create_yuno, gobj_create, gobj_create_service,
    gobj_create_pure_child,
    gobj_start, gobj_send_event,
    gobj_read_pointer_attr, gobj_subscribe_event,
    gobj_change_state, gobj_current_state,
    set_log_callback,
} = await import("@yuneta/gobj-js");

const logged = [];
const commands = [];        /*  what the fake transport was asked  */
let refuse_in_session = false;

/*
 *  The transport. Out of session it refuses, as gui_agent's routing
 *  adapter (C_AGENT_TREEDB_LINK) does; in session it refuses only when
 *  the test says so (a transport that cannot route the command).
 */
function remote_command_parser(gobj, command, kw, src)
{
    commands.push({command, kw});
    if(gobj_current_state(gobj) !== "ST_SESSION") {
        return `cannot route '${command}' -- not in session`;
    }
    if(refuse_in_session) {
        return `cannot route '${command}'`;
    }
    return null;
}

let yuno = null;

beforeAll(async () => {
    const i18next = (await import("i18next")).default;
    await i18next.init({lng: "en", resources: {}});
    gobj_start_up(null, null, null, null, null, null, null);
    set_log_callback((level, msg) => {
        logged.push({level: String(level), msg: String(msg)});
    });

    gclass_create("C_TEST_HOST", [], [["ST_IDLE", []]], {}, 0, [SDATA_END()], {}, 0, 0, 0, 0);
    gclass_create(
        "C_TEST_VIEW_HOST",
        [["EV_RECORD_WRITTEN", 0], ["EV_TOPIC_SELECTED", 0], ["EV_OPERATION_MODE_CHANGED", 0]],
        [["ST_IDLE", [
            ["EV_RECORD_WRITTEN", () => 0, null],
            ["EV_TOPIC_SELECTED", () => 0, null],
            ["EV_OPERATION_MODE_CHANGED", () => 0, null]
        ]]],
        {}, 0, [SDATA_END()], {}, 0, 0, 0, 0
    );
    gclass_create(
        "C_TEST_REMOTE",
        [],
        [["ST_SESSION", []], ["ST_DISCONNECTED", []]],
        {mt_command_parser: remote_command_parser},
        0, [SDATA_END()], {}, 0, 0, 0, 0
    );

    /*  The graph's engine, as a silent double: this test is about the
     *  viewer, not about the graph.  */
    const ENGINE_EVENTS = [
        "EV_DESCS", "EV_CLEAR_DATA", "EV_LOAD_DATA", "EV_NODE_CREATED",
        "EV_NODE_UPDATED", "EV_NODE_DELETED", "EV_GRAPHS_WRITE_REFUSED",
        "EV_SHOW", "EV_HIDE", "EV_RESIZE", "EV_THEME", "EV_LANGUAGE_CHANGED",
        "EV_SET_OPERATION_MODE", "EV_SET_LAYOUT"
    ];
    gclass_create(
        "C_G6_NODES_TREE",
        ENGINE_EVENTS.map((e) => [e, 0]).concat([["EV_UPDATE_NODE", 2]]),
        [["ST_IDLE", ENGINE_EVENTS.map((e) => [e, () => 0, null])]],
        {
            mt_create: (gobj) => {
                const subscriber = gobj_read_pointer_attr(gobj, "subscriber");
                if(subscriber) {
                    gobj_subscribe_event(gobj, null, {}, subscriber);
                }
            }
        },
        0,
        [
            SDATA(data_type_t.DTP_POINTER, "subscriber", 0, null, ""),
            SDATA(data_type_t.DTP_POINTER, "$container", 0, null, ""),
            SDATA(data_type_t.DTP_POINTER, "gobj_remote_yuno", 0, null, ""),
            SDATA(data_type_t.DTP_STRING, "treedb_name", 0, "", ""),
            SDATA(data_type_t.DTP_JSON, "layout_names", 0, "[]", ""),
            SDATA(data_type_t.DTP_STRING, "layout", 0, "", ""),
            SDATA_END()
        ],
        {}, 0, 0, 0, 0
    );

    const {register_c_yui_json} = await import("./c_yui_json.js");
    const {register_c_yui_treedb_topics} = await import("./c_yui_treedb_topics.js");
    const {register_c_yui_treedb_graph} = await import("./c_yui_treedb_graph.js");
    register_c_yui_json();
    register_c_yui_treedb_topics();
    register_c_yui_treedb_graph();

    yuno = gobj_create_yuno("json_drill_yuno", "C_TEST_HOST", {});
    gobj_start(yuno);
});

beforeEach(() => {
    logged.length = 0;
    commands.length = 0;
    refuse_in_session = false;
});

/*
 *  A host of each kind, with its viewer open on a tranger that carries
 *  one stub. The viewer is the one the host created: it publishes
 *  EV_EXPAND_PATH to the host, and the host answers it.
 */
function build(name, gclass)
{
    const remote = gobj_create_service(`${name}_remote`, "C_TEST_REMOTE", {}, yuno);
    gobj_change_state(remote, "ST_SESSION");
    const view_host = gobj_create(`${name}_view_host`, "C_TEST_VIEW_HOST", {}, yuno);
    const host = gobj_create_service(`${name}_host`, gclass, {
        gobj_remote_yuno: remote,
        treedb_name: "treedb_test",
        subscriber: view_host
    }, view_host);
    if(gclass === "C_YUI_TREEDB_TOPICS") {
        gobj_start(host);
    }
    const viewer = gobj_create_pure_child(`${name}_jv`, "C_YUI_JSON", {
        subscriber: host,
        json_data: {topics: {__collapsed__: {size: 3, path: "topics"}}}
    }, host);
    gobj_start(viewer);
    host.priv.json_gobj = viewer;
    logged.length = 0;
    commands.length = 0;
    return {remote, host, viewer};
}

function click_stub(viewer)
{
    gobj_send_event(viewer, "EV_EXPAND_COLLAPSED", {path: "topics", size: 3}, viewer);
}

function drills()
{
    return commands.filter((c) => c.command === "print-tranger").map((c) => c.kw.path);
}

for(const gclass of ["C_YUI_TREEDB_TOPICS", "C_YUI_TREEDB_GRAPH"]) {
    describe(`${gclass}: a drill that cannot go out is answered`, () => {

        test("out of session: the stub says 'no session', and a click after the reconnect asks", () => {
            const {remote, viewer} = build(`${gclass}_a`, gclass);
            gobj_change_state(remote, "ST_DISCONNECTED");

            click_stub(viewer);

            expect(drills()).toEqual([]);   /*  not even tried  */
            expect(viewer.priv.pending.has("topics")).toBe(false);
            expect(viewer.priv.errors.get("topics")).toEqual(
                {error: "no session", is_key: true});

            /*  The reconnect: the same stub asks again.  */
            gobj_change_state(remote, "ST_SESSION");
            click_stub(viewer);
            expect(drills()).toEqual(["topics"]);
            expect(viewer.priv.pending.has("topics")).toBe(true);
        });

        test("refused by the transport: the stub says why, and can be clicked again", () => {
            const {viewer} = build(`${gclass}_b`, gclass);
            refuse_in_session = true;

            click_stub(viewer);

            expect(drills()).toEqual(["topics"]);
            expect(viewer.priv.pending.has("topics")).toBe(false);
            expect(viewer.priv.errors.get("topics")).toEqual(
                {error: "cannot route 'print-tranger'", is_key: false});

            refuse_in_session = false;
            click_stub(viewer);
            expect(drills()).toEqual(["topics", "topics"]);
            expect(viewer.priv.pending.has("topics")).toBe(true);
        });

        test("in session and sent: the stub waits for its answer", () => {
            const {viewer} = build(`${gclass}_c`, gclass);
            click_stub(viewer);
            expect(drills()).toEqual(["topics"]);
            expect(viewer.priv.pending.has("topics")).toBe(true);
            expect(logged.filter((l) => l.level === "error")).toEqual([]);
        });
    });

    describe(`${gclass}: a drill in flight when the session drops is answered`, () => {

        test("the drop answers the stub, and a click after the reconnect asks again", () => {
            const {remote, host, viewer} = build(`${gclass}_d`, gclass);
            click_stub(viewer);
            expect(viewer.priv.pending.has("topics")).toBe(true);

            /*  The session drops before the answer: the transport never
             *  answers a command in flight.  */
            gobj_change_state(remote, "ST_DISCONNECTED");
            gobj_send_event(host, "EV_TRANSPORT_STATE", {connected: false}, host);

            expect(viewer.priv.pending.has("topics")).toBe(false);
            expect(viewer.priv.errors.get("topics")).toEqual(
                {error: "the connection dropped", is_key: true});

            /*  The same edge again answers nothing more.  */
            logged.length = 0;
            gobj_send_event(host, "EV_TRANSPORT_STATE", {connected: false}, host);
            expect(logged.filter((l) => l.level === "error")).toEqual([]);

            gobj_change_state(remote, "ST_SESSION");
            gobj_send_event(host, "EV_TRANSPORT_STATE", {connected: true}, host);
            click_stub(viewer);
            expect(drills()).toEqual(["topics", "topics"]);
            expect(viewer.priv.pending.has("topics")).toBe(true);
        });

        test("a failure that lands after the drop answered is not answered twice", () => {
            /*  gui_agent's routing adapter answers every request in flight
             *  as failed on the close, and that answer can land after the
             *  edge that already answered the stub.  */
            const {remote, host, viewer} = build(`${gclass}_h`, gclass);
            click_stub(viewer);
            const request = commands.find((c) => c.command === "print-tranger");
            gobj_change_state(remote, "ST_DISCONNECTED");
            gobj_send_event(host, "EV_TRANSPORT_STATE", {connected: false}, host);

            logged.length = 0;
            gobj_send_event(host, "EV_MT_COMMAND_ANSWER", {
                result: -1, comment: "the connection dropped", data: null,
                __md_iev__: {
                    command_stack: [{command: "print-tranger", kw: request.kw.__md_command__}]
                }
            }, remote);
            expect(viewer.priv.errors.get("topics")).toEqual(
                {error: "the connection dropped", is_key: true});
            expect(logged.filter((l) => l.level === "error")).toEqual([]);
        });

        test("a drill already answered is not answered again by a drop", () => {
            const {remote, host, viewer} = build(`${gclass}_e`, gclass);
            click_stub(viewer);
            const request = commands.find((c) => c.command === "print-tranger");
            gobj_send_event(host, "EV_MT_COMMAND_ANSWER", {
                result: 0, comment: "", data: {a: 1, b: 2, c: 3},
                __md_iev__: {
                    command_stack: [{command: "print-tranger", kw: request.kw.__md_command__}]
                }
            }, remote);
            expect(viewer.priv.pending.has("topics")).toBe(false);
            expect(viewer.priv.errors.has("topics")).toBe(false);

            gobj_change_state(remote, "ST_DISCONNECTED");
            gobj_send_event(host, "EV_TRANSPORT_STATE", {connected: false}, host);
            expect(viewer.priv.errors.has("topics")).toBe(false);
            expect(logged.filter((l) => l.level === "error")).toEqual([]);
        });

        test("a drill that failed is not answered again by a drop", () => {
            const {remote, host, viewer} = build(`${gclass}_f`, gclass);
            click_stub(viewer);
            const request = commands.find((c) => c.command === "print-tranger");
            gobj_send_event(host, "EV_MT_COMMAND_ANSWER", {
                result: -1, comment: "no such path", data: null,
                __md_iev__: {
                    command_stack: [{command: "print-tranger", kw: request.kw.__md_command__}]
                }
            }, remote);
            expect(viewer.priv.errors.get("topics")).toEqual(
                {error: "no such path", is_key: false});

            gobj_change_state(remote, "ST_DISCONNECTED");
            gobj_send_event(host, "EV_TRANSPORT_STATE", {connected: false}, host);
            expect(viewer.priv.errors.get("topics")).toEqual(
                {error: "no such path", is_key: false});
        });
    });
}

/*
 *  wattyzer and yunovatios hear the edge from the SHELL
 *  (EV_CONNECTION_STATE), not from a host that forwards the transport.
 */
describe("C_YUI_TREEDB_TOPICS: the shell's 'down' answers a drill in flight", () => {
    test("EV_CONNECTION_STATE down answers the stub once, with its edge twin", () => {
        const {remote, host, viewer} = build("topics_g", "C_YUI_TREEDB_TOPICS");
        click_stub(viewer);

        gobj_change_state(remote, "ST_DISCONNECTED");
        gobj_send_event(host, "EV_CONNECTION_STATE", {connected: false}, host);
        expect(viewer.priv.pending.has("topics")).toBe(false);
        expect(viewer.priv.errors.get("topics")).toEqual(
            {error: "the connection dropped", is_key: true});

        const errors_after_first = logged.filter((l) => l.level === "error").length;
        gobj_send_event(host, "EV_TRANSPORT_STATE", {connected: false}, host);
        expect(logged.filter((l) => l.level === "error").length).toBe(errors_after_first);
    });
});
