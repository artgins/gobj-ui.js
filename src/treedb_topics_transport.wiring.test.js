/***********************************************************************
 *          treedb_topics_transport.wiring.test.js
 *
 *      The WIRING of a form's write and the backend going away, driven
 *      through the real gclasses (C_YUI_SHELL, C_YUI_TREEDB_TOPICS) on a
 *      document double. The helper (form_writes_in_flight.js) was tested
 *      and right; what failed was that two hosts never called the action
 *      that uses it, which no helper test
 *      can see.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {describe, test, expect, beforeAll, beforeEach} from "vitest";
import {install_dom_double} from "../test/dom_double.js";

install_dom_double();

const gobj_js = await import("@yuneta/gobj-js");
const {
    SDATA, SDATA_END, data_type_t, event_flag_t,
    gclass_create,
    gobj_start_up, gobj_create_yuno, gobj_create, gobj_create_service,
    gobj_start, gobj_send_event,
    gobj_change_state, gobj_current_state,
    set_log_callback,
} = gobj_js;
const {register_c_yui_shell, yui_shell_set_connection_state} = await import("./c_yui_shell.js");
const {register_c_yui_treedb_topics} = await import("./c_yui_treedb_topics.js");

const logged = [];
const answers = [];         /*  what the fake forms were told  */
const loaded = [];          /*  the rows each fake form was loaded with  */
const commands = [];        /*  what the fake transport was asked  */

/*
 *  The transport: answers nothing, like a C_IEVENT_CLI whose socket is
 *  about to drop. Its state is what `is_connected()` reads. Out of
 *  session it refuses what it is asked, as gui_agent's routing adapter
 *  (C_AGENT_TREEDB_LINK) does.
 */
function remote_command_parser(gobj, command, kw, src)
{
    commands.push({command, kw});
    if(gobj_current_state(gobj) !== "ST_SESSION") {
        return `cannot route '${command}' -- not in session`;
    }
    return null;
}

/*
 *  A topic form, as C_YUI_TREEDB_TOPICS finds it (by gclass name and
 *  `topic_name`) to answer its write.
 */
function ac_form_answer(gobj, event, kw, src)
{
    answers.push({topic: gobj.priv_topic, event, form_write: kw.form_write});
    return 0;
}

function ac_form_load(gobj, event, kw, src)
{
    loaded.push({topic: gobj.priv_topic, rows: kw});
    return 0;
}

let yuno = null;
let remote = null;

beforeAll(() => {
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
    gclass_create(
        "C_YUI_TREEDB_TOPIC_WITH_FORM",
        [["EV_WRITE_DONE", 0], ["EV_WRITE_REFUSED", 0], ["EV_LOAD_NODES", 0]],
        [["ST_IDLE", [
            ["EV_WRITE_DONE",    ac_form_answer, null],
            ["EV_WRITE_REFUSED", ac_form_answer, null],
            ["EV_LOAD_NODES",    ac_form_load,   null]
        ]]],
        {},
        0,
        [
            SDATA(data_type_t.DTP_STRING, "topic_name", 0, "", "topic"),
            SDATA(data_type_t.DTP_BOOLEAN, "with_remote_paging", 0, false, "pulls its pages"),
            SDATA_END()
        ],
        {}, 0, 0, 0, 0
    );
    /*  The host of the view: it hears what a CHILD view publishes.  */
    gclass_create(
        "C_TEST_VIEW_HOST",
        [["EV_RECORD_WRITTEN", 0], ["EV_TOPIC_SELECTED", 0]],
        [["ST_IDLE", [
            ["EV_RECORD_WRITTEN", () => 0, null],
            ["EV_TOPIC_SELECTED", () => 0, null]
        ]]],
        {}, 0, [SDATA_END()], {}, 0, 0, 0, 0
    );
    /*  An app that subscribes to EVERY event of its shell and declares
     *  none of the new ones: wattyzer's and yunovatios' shape.  */
    gclass_create("C_TEST_APP", [], [["ST_IDLE", []]], {}, 0, [SDATA_END()], {}, 0, 0, 0, 0);

    register_c_yui_shell();
    register_c_yui_treedb_topics();

    yuno = gobj_create_yuno("wiring_yuno", "C_TEST_HOST", {});
    gobj_start(yuno);
});

beforeEach(() => {
    logged.length = 0;
    answers.length = 0;
    commands.length = 0;
    loaded.length = 0;
});

function build(name)
{
    const app = gobj_create(`${name}_app`, "C_TEST_APP", {}, yuno);
    gobj_start(app);
    const shell = gobj_create(`${name}_shell`, "C_YUI_SHELL", {config: {shell: {}}, default_route: "/home", subscriber: app}, app);
    gobj_start(shell);

    remote = gobj_create_service(`${name}_remote`, "C_TEST_REMOTE", {}, yuno);
    gobj_change_state(remote, "ST_SESSION");

    const host = gobj_create(`${name}_host`, "C_TEST_VIEW_HOST", {}, yuno);
    const topics = gobj_create_service(`${name}_topics`, "C_YUI_TREEDB_TOPICS", {
        treedb_name: "treedb_test",
        gobj_remote_yuno: remote
    }, host);
    gobj_start(topics);

    const forms = {};
    for(const topic of ["users", "roles"]) {
        /*  Named as the view names its forms: the answer of a `nodes`
         *  finds its table by that name.  */
        forms[topic] = gobj_create(`${name}_topics?${topic}`, "C_YUI_TREEDB_TOPIC_WITH_FORM",
            {topic_name: topic}, topics);
        forms[topic].priv_topic = topic;
    }
    /*  What the start of a shell with no routes says is the fixture's,
     *  not the behaviour under test: the check starts here.  */
    logged.length = 0;
    return {app, shell, topics, forms};
}

function save(topics, form, form_write)
{
    gobj_send_event(topics, "EV_UPDATE_RECORD",
        {record: {id: "x"}, form_write: form_write}, form);
}

/*  EVERY error the run logged: the check a deployed page gets too.  */
function errors()
{
    return logged.filter((l) => l.level === "error").map((l) => l.msg);
}

describe("a Save in flight when the backend drops", () => {

    test("the shell's connection edge answers every form, with no host forwarding", () => {
        const {shell, topics, forms} = build("t1");
        yui_shell_set_connection_state(shell, true);

        /*  Two forms, each at ITS serial 1: two writes, not one.  */
        save(topics, forms.users, 1);
        save(topics, forms.roles, 1);
        expect(commands.filter((c) => c.command === "update-node").length).toBe(2);
        expect(answers).toEqual([]);

        yui_shell_set_connection_state(shell, false);

        expect(answers).toEqual([
            {topic: "users", event: "EV_WRITE_REFUSED", form_write: 1},
            {topic: "roles", event: "EV_WRITE_REFUSED", form_write: 1},
        ]);
        expect(errors()).toEqual([]);
    });

    test("a host that also forwards EV_TRANSPORT_STATE: each write answered once", () => {
        const {shell, topics, forms} = build("t2");
        yui_shell_set_connection_state(shell, true);
        save(topics, forms.users, 1);

        gobj_send_event(topics, "EV_TRANSPORT_STATE", {connected: false}, topics);
        yui_shell_set_connection_state(shell, false);

        expect(answers).toEqual([
            {topic: "users", event: "EV_WRITE_REFUSED", form_write: 1},
        ]);
    });

    test("only an EDGE is published: a repeated 'down' answers nothing twice", () => {
        const {shell, topics, forms} = build("t3");
        yui_shell_set_connection_state(shell, true);
        save(topics, forms.users, 1);
        yui_shell_set_connection_state(shell, false);
        yui_shell_set_connection_state(shell, false);
        expect(answers.length).toBe(1);
    });

    test("an app subscribed to every shell event is not sent the new one", () => {
        /*  C_TEST_APP declares no event at all: were EV_CONNECTION_STATE
         *  published to it, the FSM would log "Event NOT DEFINED".  */
        const {shell} = build("t4");
        yui_shell_set_connection_state(shell, true);
        yui_shell_set_connection_state(shell, false);
        expect(errors()).toEqual([]);
    });

    test("an answer from the backend settles its own form only", () => {
        const {shell, topics, forms} = build("t5");
        yui_shell_set_connection_state(shell, true);
        save(topics, forms.users, 1);
        save(topics, forms.roles, 1);

        /*  The answer of the users write, the way C_IEVENT_CLI delivers it:
         *  the request's frame on top of the command_stack.  */
        const ok = {result: 0, comment: "", data: [{id: "x"}], __md_iev__: {
            command_stack: [{command: "update-node", kw: {
                topic_name: "users", treedb_name: "treedb_test", form_write: 1, record: {id: "x"}
            }}]
        }};
        gobj_send_event(topics, "EV_MT_COMMAND_ANSWER", ok, remote);
        expect(answers).toEqual([
            {topic: "users", event: "EV_WRITE_DONE", form_write: 1},
        ]);

        yui_shell_set_connection_state(shell, false);
        expect(answers).toEqual([
            {topic: "users", event: "EV_WRITE_DONE", form_write: 1},
            {topic: "roles", event: "EV_WRITE_REFUSED", form_write: 1},
        ]);
    });
});

/*
 *  The answer the routing adapter gives a write it had in flight when
 *  its session closed: a failure, settled by the adapter itself.
 */
function failed_write(topic_name, form_write)
{
    const md = {topic_name: topic_name, treedb_name: "treedb_test", record: {id: "x"}};
    if(form_write) {
        md.form_write = form_write;
    }
    return {result: -1, comment: "the session closed", data: null, __md_iev__: {
        command_stack: [{command: "update-node", kw: md}]
    }};
}

function nodes_asked()
{
    return commands.filter((c) => c.command === "nodes").map((c) => c.kw.topic_name);
}

describe("a write cut by the drop does not reload out of session", () => {

    test("the failure lands before the edge: no reload now, one on the reconnect", () => {
        const {shell, topics} = build("t6");
        yui_shell_set_connection_state(shell, true);

        /*  A cell edited in place: it looks saved until the topic is read again.  */
        gobj_send_event(topics, "EV_UPDATE_FIELD",
            {topic_name: "users", id: "x", field: "name", value: "typed"}, topics);
        expect(commands.filter((c) => c.command === "update-node").length).toBe(1);

        /*  The adapter leaves ST_SESSION and settles what it had in flight.  */
        gobj_change_state(remote, "ST_DISCONNECTED");
        gobj_send_event(topics, "EV_MT_COMMAND_ANSWER", failed_write("users", 0), remote);

        expect(nodes_asked()).toEqual([]);
        expect(errors().filter((m) => m.includes("not in session"))).toEqual([]);

        gobj_send_event(topics, "EV_TRANSPORT_STATE", {connected: false}, topics);
        expect(nodes_asked()).toEqual([]);

        /*  The reconnect reads every open table -- once, though two edges
         *  report it.  */
        gobj_change_state(remote, "ST_SESSION");
        gobj_send_event(topics, "EV_TRANSPORT_STATE", {connected: true}, topics);
        yui_shell_set_connection_state(shell, true);
        expect(nodes_asked().sort()).toEqual(["roles", "users"]);
        expect(errors()).toEqual([]);
    });

    test("the edge lands first: the form is answered once, the reload waits", () => {
        const {shell, topics, forms} = build("t7");
        yui_shell_set_connection_state(shell, true);
        save(topics, forms.users, 1);

        gobj_change_state(remote, "ST_DISCONNECTED");
        yui_shell_set_connection_state(shell, false);
        gobj_send_event(topics, "EV_MT_COMMAND_ANSWER", failed_write("users", 1), remote);

        expect(answers).toEqual([
            {topic: "users", event: "EV_WRITE_REFUSED", form_write: 1},
        ]);
        expect(nodes_asked()).toEqual([]);

        gobj_change_state(remote, "ST_SESSION");
        yui_shell_set_connection_state(shell, true);
        expect(nodes_asked().sort()).toEqual(["roles", "users"]);
        expect(errors()).toEqual([]);
    });

    test("an edge that says 'up' before the transport is: the reload still waits", () => {
        const {shell, topics} = build("t8");
        yui_shell_set_connection_state(shell, true);
        gobj_send_event(topics, "EV_UPDATE_FIELD",
            {topic_name: "roles", id: "x", field: "name", value: "typed"}, topics);
        gobj_change_state(remote, "ST_DISCONNECTED");
        gobj_send_event(topics, "EV_MT_COMMAND_ANSWER", failed_write("roles", 0), remote);
        yui_shell_set_connection_state(shell, false);

        /*  The app's connection is back, the view's transport is not yet.  */
        yui_shell_set_connection_state(shell, true);
        expect(nodes_asked()).toEqual([]);

        gobj_change_state(remote, "ST_SESSION");
        gobj_send_event(topics, "EV_TRANSPORT_STATE", {connected: true}, topics);
        expect(nodes_asked().sort()).toEqual(["roles", "users"]);
        expect(errors().filter((m) => m.includes("not in session"))).toEqual([]);
    });

    test("a write refused IN session reloads its topic at once", () => {
        const {shell, topics} = build("t9");
        yui_shell_set_connection_state(shell, true);
        gobj_send_event(topics, "EV_UPDATE_FIELD",
            {topic_name: "users", id: "x", field: "name", value: "typed"}, topics);
        gobj_send_event(topics, "EV_MT_COMMAND_ANSWER", failed_write("users", 0), remote);
        expect(nodes_asked()).toEqual(["users"]);
    });
});

/*
 *  The answer of a `nodes`, the way C_IEVENT_CLI delivers it.
 */
function nodes_answer_of(topic_name, rows)
{
    return {result: 0, comment: "", data: rows, __md_iev__: {
        command_stack: [{command: "nodes", kw: {topic_name: topic_name}}]
    }};
}

describe("what the drop hid is read again on the reconnect", () => {

    test("a node created during the drop is in its table after the reconnect", () => {
        const {shell, topics} = build("t10");
        yui_shell_set_connection_state(shell, true);

        /*  No write in flight: the session just drops. While it is down,
         *  another writer creates a user; its EV_TREEDB_NODE_CREATED is
         *  published to nobody.  */
        gobj_change_state(remote, "ST_DISCONNECTED");
        gobj_send_event(topics, "EV_TRANSPORT_STATE", {connected: false}, topics);
        yui_shell_set_connection_state(shell, false);
        expect(nodes_asked()).toEqual([]);

        gobj_change_state(remote, "ST_SESSION");
        gobj_send_event(topics, "EV_TRANSPORT_STATE", {connected: true}, topics);
        yui_shell_set_connection_state(shell, true);

        /*  Every open table is read once, though two edges said "up".  */
        expect(nodes_asked().sort()).toEqual(["roles", "users"]);

        gobj_send_event(topics, "EV_MT_COMMAND_ANSWER",
            nodes_answer_of("users", [{id: "x"}, {id: "created_during_the_drop"}]), remote);
        expect(loaded).toEqual([
            {topic: "users", rows: [{id: "x"}, {id: "created_during_the_drop"}]}
        ]);
        expect(errors()).toEqual([]);
    });

    test("an 'up' with no drop before it reads nothing", () => {
        const {shell, topics} = build("t11");
        yui_shell_set_connection_state(shell, true);
        gobj_send_event(topics, "EV_TRANSPORT_STATE", {connected: true}, topics);
        expect(nodes_asked()).toEqual([]);
    });

    test("an edge that says 'up' before the transport is in session waits", () => {
        const {shell, topics} = build("t12");
        yui_shell_set_connection_state(shell, true);
        gobj_change_state(remote, "ST_DISCONNECTED");
        yui_shell_set_connection_state(shell, false);

        yui_shell_set_connection_state(shell, true);
        expect(nodes_asked()).toEqual([]);
        expect(errors().filter((m) => m.includes("not in session"))).toEqual([]);

        gobj_change_state(remote, "ST_SESSION");
        gobj_send_event(topics, "EV_TRANSPORT_STATE", {connected: true}, topics);
        expect(nodes_asked().sort()).toEqual(["roles", "users"]);
    });
});
