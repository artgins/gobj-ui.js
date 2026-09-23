/***********************************************************************
 *          schema_editor_transport.wiring.test.js
 *
 *      C_YUI_SCHEMA_EDITOR when the transport drops (M-1 of the
 *      independent review of 7.25.4). A drop used to leave the editor
 *      where it was: in ST_SAVING with its body busy, or in ST_LOADING
 *      -- and the reconnect skipped the reload BECAUSE the state was
 *      ST_LOADING. Only a reload of the page got it out.
 *
 *      Driven through the FSM on a document double, with a fake
 *      transport whose state is the one the library reads
 *      (`ST_SESSION` or not).
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {describe, test, expect, beforeAll, beforeEach, vi} from "vitest";
import {install_dom_double} from "../test/dom_double.js";

install_dom_double();

/*  What the editor SAYS is asserted on the call.  */
const shown = [];
vi.mock("./shell_modals.js", () => ({
    yui_shell_show_error: (shell, message) => {
        shown.push(message);
        return {close() {}};
    },
    yui_shell_show_info: () => ({close() {}}),
    yui_shell_show_modal: () => ({close() {}}),
    yui_shell_confirm_danger: () => ({close() {}}),
}));

const {
    SDATA_END,
    gclass_create,
    gobj_start_up, gobj_create_yuno, gobj_create, gobj_create_service,
    gobj_start, gobj_send_event, gobj_read_attr,
    gobj_change_state, gobj_current_state,
    set_log_callback,
} = await import("@yuneta/gobj-js");
const {register_c_yui_schema_editor} = await import("./c_yui_schema_editor.js");

const logged = [];
const commands = [];

const RECORDS = {
    treedbs: [{id: "db", schema_version: 4}],
    topics: [
        {id: "db.users", value: "users", order: 1, pkey: "id", topic_version: 2,
         treedbs: ["treedbs^db^topics"]},
    ],
    cols: [
        {id: "db.users.id", value: "id", order: 1, type: "string",
         flag: ["persistent", "required"], topics: ["topics^db.users^cols"]},
    ],
};

function remote_command_parser(gobj, command, kw, src)
{
    commands.push({command, kw, src});
    return null;
}

let yuno = null;

beforeAll(() => {
    gobj_start_up(null, null, null, null, null, null, null);
    set_log_callback((level, msg) => {
        logged.push({level: String(level), msg: String(msg)});
    });
    gclass_create("C_TEST_HOST", [], [["ST_IDLE", []]], {}, 0, [SDATA_END()], {}, 0, 0, 0, 0);
    gclass_create(
        "C_TEST_EDITOR_HOST",
        [["EV_POSITION_CHANGED", 0], ["EV_RECORD_WRITTEN", 0], ["EV_SCHEMA_CHECKED", 0]],
        [["ST_IDLE", [
            ["EV_POSITION_CHANGED", () => 0, null],
            ["EV_RECORD_WRITTEN",   () => 0, null],
            ["EV_SCHEMA_CHECKED",   () => 0, null]
        ]]],
        {}, 0, [SDATA_END()], {}, 0, 0, 0, 0
    );
    /*  The two states the library reads off a transport.  */
    gclass_create(
        "C_TEST_REMOTE",
        [],
        [["ST_DISCONNECTED", []], ["ST_SESSION", []]],
        {mt_command_parser: remote_command_parser},
        0, [SDATA_END()], {}, 0, 0, 0, 0
    );
    register_c_yui_schema_editor();
    yuno = gobj_create_yuno("transport_yuno", "C_TEST_HOST", {});
    gobj_start(yuno);
});

beforeEach(() => {
    logged.length = 0;
    commands.length = 0;
    shown.length = 0;
});

function take(command)
{
    const out = commands.filter((c) => c.command === command);
    for(const c of out) {
        commands.splice(commands.indexOf(c), 1);
    }
    return out;
}

/*  The answer, the way a transport gives it: the request's frame on top.  */
function answer(editor, remote, request, result, data, comment)
{
    gobj_send_event(editor, "EV_MT_COMMAND_ANSWER", {
        result: result,
        comment: comment || "",
        data: data,
        __md_iev__: {command_stack: [{command: request.command, kw: request.kw}]}
    }, remote);
}

function answer_the_load(editor, remote)
{
    const asked = take("nodes");
    for(const c of asked) {
        answer(editor, remote, c, 0, RECORDS[c.kw.topic_name]);
    }
    return asked.length;
}

function drop(editor, remote, host)
{
    gobj_change_state(remote, "ST_DISCONNECTED");
    gobj_send_event(editor, "EV_TRANSPORT_STATE", {connected: false}, host);
}

function reconnect(editor, remote, host)
{
    gobj_change_state(remote, "ST_SESSION");
    gobj_send_event(editor, "EV_TRANSPORT_STATE", {connected: true}, host);
}

function build(name, loaded)
{
    const remote = gobj_create_service(`${name}_remote`, "C_TEST_REMOTE", {}, yuno);
    gobj_change_state(remote, "ST_SESSION");
    const host = gobj_create(`${name}_host`, "C_TEST_EDITOR_HOST", {}, yuno);
    const editor = gobj_create(`${name}_editor`, "C_YUI_SCHEMA_EDITOR", {
        gobj_remote_yuno: remote,
        treedb_name: "treedb_system_schema",
        base_route: "/schemas"
    }, host);
    gobj_start(editor);
    gobj_send_event(editor, "EV_TRANSPORT_STATE", {connected: true}, host);
    if(loaded) {
        expect(answer_the_load(editor, remote)).toBe(3);
        gobj_send_event(editor, "EV_SHOW", {subpath: "db/users"}, host);
        expect(gobj_current_state(editor)).toBe("ST_COLUMNS");
    }
    return {editor, remote, host};
}

/*  A write in flight: a new column, saved from its form.  */
function start_a_write(editor, host)
{
    gobj_send_event(editor, "EV_SAVE_COLUMN", {
        creating: true, topic: "users", values: {value: "name", type: "string"}
    }, host);
    expect(gobj_current_state(editor)).toBe("ST_SAVING");
    const [write] = take("update-node");
    expect(write).toBeTruthy();
    return write;
}

function is_busy(editor)
{
    const $c = gobj_read_attr(editor, "$container");
    return $c.querySelector(".SCHEMA_BODY").classList.contains("SCHEMA_BUSY");
}

function errors()
{
    return logged.filter((l) => l.level === "error").map((l) => l.msg);
}

describe("a drop while LOADING", () => {

    test("the editor leaves ST_LOADING, and the reconnect loads again", () => {
        const {editor, remote, host} = build("l1", false);
        expect(gobj_current_state(editor)).toBe("ST_LOADING");
        expect(take("nodes").length).toBe(3);   /*  never answered  */

        drop(editor, remote, host);
        expect(gobj_current_state(editor)).toBe("ST_IDLE");

        reconnect(editor, remote, host);
        expect(gobj_current_state(editor)).toBe("ST_LOADING");
        expect(answer_the_load(editor, remote)).toBe(3);
        expect(gobj_current_state(editor)).toBe("ST_TREEDBS");
        expect(errors()).toEqual([]);
    });

    test("an answer of the load the drop abandoned is not counted in the next one", () => {
        const {editor, remote, host} = build("l2", false);
        const old = take("nodes");
        drop(editor, remote, host);
        reconnect(editor, remote, host);
        const fresh = take("nodes");
        expect(fresh.length).toBe(3);

        /*  The three OLD answers arrive late: were they counted, the new
         *  round would end here with the old data and 3 answers owed.  */
        for(const c of old) {
            answer(editor, remote, c, 0, []);
        }
        expect(gobj_current_state(editor)).toBe("ST_LOADING");
        for(const c of fresh) {
            answer(editor, remote, c, 0, RECORDS[c.kw.topic_name]);
        }
        expect(gobj_current_state(editor)).toBe("ST_TREEDBS");
        expect(editor.priv.model.treedbs.length).toBe(1);
        expect(errors()).toEqual([]);
    });
});

describe("a drop while SAVING", () => {

    test("the write ends, said, the body answers again, and the reconnect reloads", () => {
        const {editor, remote, host} = build("s1", true);
        start_a_write(editor, host);
        expect(is_busy(editor)).toBe(true);

        drop(editor, remote, host);
        expect(gobj_current_state(editor)).toBe("ST_COLUMNS");
        expect(is_busy(editor)).toBe(false);
        expect(shown).toEqual(["the connection dropped during the write"]);

        /*  Whether the write landed is unknown: the model is asked again.  */
        reconnect(editor, remote, host);
        expect(answer_the_load(editor, remote)).toBe(3);
        expect(gobj_current_state(editor)).toBe("ST_COLUMNS");
        expect(errors()).toEqual([]);
    });

    test("the transport's own failure arriving FIRST is read as the drop it is", () => {
        /*  A routing adapter settles what it had in flight when its session
         *  closes, and that answer can reach the editor before the host's
         *  EV_TRANSPORT_STATE. Read as a refusal, it ended the write and the
         *  reconnect did not reload a model the write may have changed.  */
        const {editor, remote, host} = build("s2", true);
        const write = start_a_write(editor, host);

        gobj_change_state(remote, "ST_DISCONNECTED");
        answer(editor, remote, write, -1, null, "the connection dropped");
        expect(gobj_current_state(editor)).toBe("ST_COLUMNS");
        expect(shown).toEqual(["the connection dropped during the write"]);

        gobj_send_event(editor, "EV_TRANSPORT_STATE", {connected: false}, host);
        expect(shown.length).toBe(1);   /*  said once  */

        reconnect(editor, remote, host);
        expect(answer_the_load(editor, remote)).toBe(3);
        expect(errors()).toEqual([]);
    });

    test("the answer of the write the drop ended is not taken for the next one", () => {
        const {editor, remote, host} = build("s3", true);
        const write = start_a_write(editor, host);
        drop(editor, remote, host);
        reconnect(editor, remote, host);
        answer_the_load(editor, remote);

        const second = start_a_write(editor, host);
        /*  The first write's answer, late: it must not end the second.  */
        answer(editor, remote, write, 0, {id: "db.users.name", value: "name",
            topics: ["topics^db.users^cols"]});
        expect(gobj_current_state(editor)).toBe("ST_SAVING");

        answer(editor, remote, second, 0, {id: "db.users.name", value: "name", order: 2,
            type: "string", topics: ["topics^db.users^cols"]});
        expect(gobj_current_state(editor)).toBe("ST_COLUMNS");
        expect(errors()).toEqual([]);
    });
});
