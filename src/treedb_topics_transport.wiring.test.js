/***********************************************************************
 *          treedb_topics_transport.wiring.test.js
 *
 *      The WIRING of a form's write and the backend going away, driven
 *      through the real gclasses (C_YUI_SHELL, C_YUI_TREEDB_TOPICS) on a
 *      document double. The helper (form_writes_in_flight.js) was tested
 *      and right; what failed was that two hosts never called the action
 *      that uses it (M8 of the 2026-09-23 review), which no helper test
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
    gobj_change_state,
    set_log_callback,
} = gobj_js;
const {register_c_yui_shell, yui_shell_set_connection_state} = await import("./c_yui_shell.js");
const {register_c_yui_treedb_topics} = await import("./c_yui_treedb_topics.js");

const logged = [];
const answers = [];         /*  what the fake forms were told  */
const commands = [];        /*  what the fake transport was asked  */

/*
 *  The transport: answers nothing, like a C_IEVENT_CLI whose socket is
 *  about to drop. Its state is what `is_connected()` reads.
 */
function remote_command_parser(gobj, command, kw, src)
{
    commands.push({command, kw});
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
        [["EV_WRITE_DONE", 0], ["EV_WRITE_REFUSED", 0]],
        [["ST_IDLE", [
            ["EV_WRITE_DONE",    ac_form_answer, null],
            ["EV_WRITE_REFUSED", ac_form_answer, null]
        ]]],
        {},
        0,
        [SDATA(data_type_t.DTP_STRING, "topic_name", 0, "", "topic"), SDATA_END()],
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
        forms[topic] = gobj_create(`${name}_form_${topic}`, "C_YUI_TREEDB_TOPIC_WITH_FORM",
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

describe("a Save in flight when the backend drops (M8)", () => {

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
