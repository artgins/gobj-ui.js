/***********************************************************************
 *          treedb_graph_writes.wiring.test.js
 *
 *      C_YUI_TREEDB_GRAPH and the writes of `__graphs__`, the topic
 *      where the graph keeps its arrangement. The engine
 *      (C_G6_NODES_TREE) takes such a write for granted before it
 *      leaves: nothing answers it when it lands. So the host must say
 *      when one did NOT land -- refused by the backend, refused on the
 *      way out, or never sent for want of a session. Without that, the
 *      engine believed the backend held the arrangement, and the next
 *      Save had nothing to write.
 *
 *      Driven through the real host on a document double, with a fake
 *      engine that records what it is told and a fake transport whose
 *      state is the one the host reads.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {describe, test, expect, beforeAll, beforeEach} from "vitest";
import {install_dom_double} from "../test/dom_double.js";

install_dom_double();

/*  The host watches its container's size; the document double has no
 *  layout to watch.  */
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
    gobj_start, gobj_send_event, gobj_publish_event,
    gobj_read_pointer_attr, gobj_subscribe_event,
    gobj_change_state, gobj_current_state,
    set_log_callback,
} = await import("@yuneta/gobj-js");

const logged = [];
const commands = [];        /*  what the fake transport was asked  */
const told = [];            /*  what the fake engine was told  */
let refuse_on_the_way = false;

function remote_command_parser(gobj, command, kw, src)
{
    if(refuse_on_the_way) {
        return `cannot route '${command}'`;
    }
    commands.push({command, kw, src});
    return null;
}

let yuno = null;

beforeAll(async () => {
    gobj_start_up(null, null, null, null, null, null, null);
    set_log_callback((level, msg) => {
        logged.push({level: String(level), msg: String(msg)});
    });

    gclass_create("C_TEST_HOST", [], [["ST_IDLE", []]], {}, 0, [SDATA_END()], {}, 0, 0, 0, 0);
    gclass_create(
        "C_TEST_REMOTE",
        [],
        [["ST_SESSION", []], ["ST_DISCONNECTED", []]],
        {mt_command_parser: remote_command_parser},
        0, [SDATA_END()], {}, 0, 0, 0, 0
    );

    /*  The engine, registered BEFORE the host so the host uses it. It
     *  publishes what the real one publishes on a Save, and records every
     *  event it is sent.  */
    const record = (gobj, event, kw) => {
        told.push({event, kw});
        return 0;
    };
    const ENGINE_EVENTS = [
        "EV_DESCS", "EV_CLEAR_DATA", "EV_LOAD_DATA", "EV_NODE_CREATED",
        "EV_NODE_UPDATED", "EV_NODE_DELETED", "EV_GRAPHS_WRITE_REFUSED",
        "EV_SHOW", "EV_HIDE", "EV_RESIZE", "EV_THEME", "EV_LANGUAGE_CHANGED",
        "EV_SET_OPERATION_MODE", "EV_SET_LAYOUT"
    ];
    gclass_create(
        "C_G6_NODES_TREE",
        ENGINE_EVENTS.map((e) => [e, 0]).concat([["EV_UPDATE_NODE", 2]]),
        [["ST_IDLE", ENGINE_EVENTS.map((e) => [e, record, null])]],
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

    const {register_c_yui_treedb_graph} = await import("./c_yui_treedb_graph.js");
    register_c_yui_treedb_graph();

    yuno = gobj_create_yuno("graph_writes_yuno", "C_TEST_HOST", {});
    gobj_start(yuno);
});

beforeEach(() => {
    logged.length = 0;
    commands.length = 0;
    told.length = 0;
    refuse_on_the_way = false;
});

function build(name)
{
    const remote = gobj_create_service(`${name}_remote`, "C_TEST_REMOTE", {}, yuno);
    gobj_change_state(remote, "ST_SESSION");
    const host = gobj_create_service(`${name}_graph`, "C_YUI_TREEDB_GRAPH", {
        gobj_remote_yuno: remote,
        treedb_name: "treedb_test"
    }, yuno);
    const engine = host.priv.gobj_nodes_tree;
    expect(engine).toBeTruthy();
    return {remote, host, engine};
}

/*  What the engine publishes on a Save of one topic's arrangement.  */
function save_arrangement(engine, topic)
{
    gobj_publish_event(engine, "EV_UPDATE_NODE", {
        treedb_name: "treedb_test",
        topic_name: "__graphs__",
        record: {id: topic, topic: topic, active: true, properties: {nodes: {}}},
        options: {list_dict: true, autolink: false, create: true}
    });
}

function answer(host, remote, request, result, comment)
{
    gobj_send_event(host, "EV_MT_COMMAND_ANSWER", {
        result: result,
        comment: comment || "",
        data: null,
        __md_iev__: {command_stack: [{command: request.command, kw: request.kw}]}
    }, remote);
}

function refused()
{
    return told.filter((t) => t.event === "EV_GRAPHS_WRITE_REFUSED").map((t) => t.kw.topic);
}

describe("a __graphs__ write that does not land is said to the engine", () => {

    test("refused by the backend", () => {
        const {remote, host, engine} = build("g1");
        save_arrangement(engine, "yunos");
        expect(commands.length).toBe(1);
        answer(host, remote, commands[0], -1, "not authorized");
        expect(refused()).toEqual(["yunos"]);
    });

    test("landed: nothing is said", () => {
        const {remote, host, engine} = build("g2");
        save_arrangement(engine, "yunos");
        answer(host, remote, commands[0], 0);
        expect(refused()).toEqual([]);
    });

    test("with no session: not sent, and said", () => {
        const {remote, host, engine} = build("g3");
        gobj_change_state(remote, "ST_DISCONNECTED");
        save_arrangement(engine, "realms");
        expect(commands).toEqual([]);
        expect(refused()).toEqual(["realms"]);
        expect(logged.some((l) => /not sent/.test(l.msg))).toBe(true);
    });

    test("refused on the way out by the transport", () => {
        const {remote, host, engine} = build("g4");
        refuse_on_the_way = true;
        save_arrangement(engine, "binaries");
        expect(refused()).toEqual(["binaries"]);
    });

    test("a refused write of another topic says nothing to the engine", () => {
        const {remote, host, engine} = build("g5");
        gobj_send_event(host, "EV_UPDATE_NODE", {
            topic_name: "yunos", record: {id: "1", x: 1}
        }, engine);
        answer(host, remote, commands[0], -1, "refused");
        expect(refused()).toEqual([]);
    });
});
