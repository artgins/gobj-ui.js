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
const written = [];         /*  the EV_RECORD_WRITTEN the host heard  */
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
    /*  The host of the view: it hears what the view publishes.  */
    gclass_create(
        "C_TEST_GRAPH_HOST",
        [["EV_RECORD_WRITTEN", 0], ["EV_TOPIC_SELECTED", 0], ["EV_OPERATION_MODE_CHANGED", 0]],
        [["ST_IDLE", [
            ["EV_RECORD_WRITTEN", (gobj, event, kw) => {
                written.push(kw);
                return 0;
            }, null],
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
    written.length = 0;
    commands.length = 0;
    told.length = 0;
    refuse_on_the_way = false;
});

function build(name)
{
    const remote = gobj_create_service(`${name}_remote`, "C_TEST_REMOTE", {}, yuno);
    gobj_change_state(remote, "ST_SESSION");
    const view_host = gobj_create(`${name}_view_host`, "C_TEST_GRAPH_HOST", {}, yuno);
    const host = gobj_create_service(`${name}_graph`, "C_YUI_TREEDB_GRAPH", {
        gobj_remote_yuno: remote,
        treedb_name: "treedb_test",
        subscriber: view_host
    }, yuno);
    const engine = host.priv.gobj_nodes_tree;
    expect(engine).toBeTruthy();
    return {remote, host, engine};
}

/*  What the engine publishes on a Save of one topic's arrangement,
 *  from its load number `graphs_load`.  */
function save_arrangement(engine, topic, graphs_load)
{
    let kw = {
        treedb_name: "treedb_test",
        topic_name: "__graphs__",
        record: {id: topic, topic: topic, active: true, properties: {nodes: {}}},
        options: {list_dict: true, autolink: false, create: true}
    };
    if(graphs_load !== undefined) {
        kw.graphs_load = graphs_load;
    }
    gobj_publish_event(engine, "EV_UPDATE_NODE", kw);
}

/*  The answer as the real transports build it: the command frame
 *  carries ONLY the request's `__md_command__` (C_IEVENT_CLI's
 *  mt_command, gui_agent's C_AGENT_TREEDB_LINK), never the request's
 *  own kw. Echoing the whole kw here once hid that the refusal read
 *  its topic from a `record` no real answer carries.  */
function answer(host, remote, request, result, comment, data)
{
    const md_command = request.kw.__md_command__ || {};
    gobj_send_event(host, "EV_MT_COMMAND_ANSWER", {
        result: result,
        comment: comment || "",
        data: (data === undefined) ? null : data,
        __md_iev__: {command_stack: [{command: request.command, kw: md_command}]}
    }, remote);
}

function refused()
{
    return told.filter((t) => t.event === "EV_GRAPHS_WRITE_REFUSED").map((t) => t.kw.topic);
}

function refused_kw()
{
    return told.filter((t) => t.event === "EV_GRAPHS_WRITE_REFUSED").map((t) => t.kw);
}

describe("a __graphs__ write that does not land is said to the engine", () => {

    test("refused by the backend", () => {
        const {remote, host, engine} = build("g1");
        save_arrangement(engine, "yunos");
        expect(commands.length).toBe(1);
        answer(host, remote, commands[0], -1, "not authorized");
        expect(refused()).toEqual(["yunos"]);
        expect(logged.filter((l) => /names no topic/.test(l.msg))).toEqual([]);
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

    /*  Before gobj-ui 7.25.20 the refusal carried only the topic, and
     *  the engine applied one answered after a reload to the fresh
     *  load. The engine's load number now travels in __md_command__
     *  and comes back with the refusal, on every path.  */
    test("the engine's load comes back with the refusal, on every path", () => {
        const {remote, host, engine} = build("g6");
        save_arrangement(engine, "yunos", 7);
        expect(commands[0].kw.__md_command__.graphs_load).toBe(7);
        answer(host, remote, commands[0], -1, "not authorized");

        refuse_on_the_way = true;
        save_arrangement(engine, "binaries", 7);
        refuse_on_the_way = false;

        gobj_change_state(remote, "ST_DISCONNECTED");
        save_arrangement(engine, "realms", 8);

        expect(refused_kw()).toEqual([
            {topic: "yunos", graphs_load: 7},
            {topic: "binaries", graphs_load: 7},
            {topic: "realms", graphs_load: 8}
        ]);
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

/*  What THIS view wrote, told to its host. The answer carries back only
 *  `__md_command__`: `treedb_name` and `record` read from that frame
 *  arrived empty with every real transport.  */
describe("EV_RECORD_WRITTEN carries what it says", () => {

    test("an update: the treedb, the topic and the record the store answered", () => {
        const {remote, host, engine} = build("w1");
        logged.length = 0;      /*  the fake engine's fixture, not the check  */
        gobj_send_event(host, "EV_UPDATE_NODE", {
            topic_name: "yunos", record: {id: "1", x: 1}
        }, engine);
        const [write] = commands;
        answer(host, remote, write, 0, "", {id: "1", x: 1, y: 2});
        expect(written).toEqual([{
            treedb_name: "treedb_test",
            topic_name: "yunos",
            record: {id: "1", x: 1, y: 2},
            created: false,
            command: "update-node"
        }]);
        expect(logged.filter((l) => l.level === "error")).toEqual([]);
    });

    test("a link: the child's topic, both refs, and the child the store answered", () => {
        const {remote, host, engine} = build("w2");
        gobj_send_event(host, "EV_LINK_NODES", {
            parent_ref: "realms^r1^yunos", child_ref: "yunos^1"
        }, engine);
        const [link] = commands;
        expect(link.command).toBe("link-nodes");
        answer(host, remote, link, 0, "", {id: "1", realms: ["realms^r1^yunos"]});
        expect(written).toEqual([{
            treedb_name: "treedb_test",
            topic_name: "yunos",
            record: {id: "1", realms: ["realms^r1^yunos"]},
            parent_ref: "realms^r1^yunos",
            child_ref: "yunos^1",
            created: false,
            command: "link-nodes"
        }]);
    });

    test("the arrangement (__graphs__) is not reported", () => {
        const {remote, host, engine} = build("w3");
        save_arrangement(engine, "yunos");
        answer(host, remote, commands[0], 0, "", {id: "yunos"});
        expect(written).toEqual([]);
    });
});
