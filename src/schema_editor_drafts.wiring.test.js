/***********************************************************************
 *          schema_editor_drafts.wiring.test.js
 *
 *      EV_DRAFTS driven through a real C_YUI_SCHEMA_EDITOR on a document
 *      double. The helper was right and tested; the ACTION folded the
 *      host's marks into the session's, so a topic the host named before
 *      a Save stayed a draft after it.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {describe, test, expect, beforeAll, beforeEach} from "vitest";
import {install_dom_double} from "../test/dom_double.js";

install_dom_double();

const {
    SDATA_END,
    gclass_create,
    gobj_start_up, gobj_create_yuno, gobj_create, gobj_create_service,
    gobj_start, gobj_send_event, gobj_read_attr,
    gobj_change_state,
    set_log_callback,
} = await import("@yuneta/gobj-js");
const {register_c_yui_schema_editor, topic_is_draft} = await import("./c_yui_schema_editor.js");

const logged = [];
const commands = [];

/*  The yuno's system schema: one treedb, two topics.  */
const RECORDS = {
    treedbs: [{id: "db", schema_version: 4}],
    topics: [
        {id: "db.users", value: "users", order: 1, pkey: "id", topic_version: 2,
         treedbs: ["treedbs^db^topics"]},
        {id: "db.roles", value: "roles", order: 2, pkey: "id", topic_version: 1,
         treedbs: ["treedbs^db^topics"]},
    ],
    cols: [
        {id: "db.users.id", value: "id", order: 1, type: "string",
         flag: ["persistent", "required"], topics: ["topics^db.users^cols"]},
        {id: "db.roles.id", value: "id", order: 1, type: "string",
         flag: ["persistent", "required"], topics: ["topics^db.roles^cols"]},
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
    gclass_create(
        "C_TEST_REMOTE",
        [],
        [["ST_SESSION", []]],
        {mt_command_parser: remote_command_parser},
        0, [SDATA_END()], {}, 0, 0, 0, 0
    );
    register_c_yui_schema_editor();
    yuno = gobj_create_yuno("drafts_yuno", "C_TEST_HOST", {});
    gobj_start(yuno);
});

beforeEach(() => {
    logged.length = 0;
    commands.length = 0;
});

/*  Answer every `nodes` the editor asked, the way a transport does: the
 *  request's frame on top of the command_stack.  */
function answer_the_load(editor, remote)
{
    const asked = commands.filter((c) => c.command === "nodes");
    commands.length = 0;
    for(const c of asked) {
        gobj_send_event(editor, "EV_MT_COMMAND_ANSWER", {
            result: 0,
            data: RECORDS[c.kw.topic_name],
            __md_iev__: {command_stack: [{command: "nodes", kw: c.kw}]}
        }, remote);
    }
    return asked.length;
}

function build(name)
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
    expect(answer_the_load(editor, remote)).toBe(3);
    gobj_send_event(editor, "EV_SHOW", {subpath: "db"}, host);
    return {editor, remote, host};
}

function drafts_on_screen(editor)
{
    const $c = gobj_read_attr(editor, "$container");
    return $c.querySelectorAll(".SCHEMA_TOPIC_VERSION .is-warning").length;
}

function is_draft(editor, topic_id)
{
    return topic_is_draft(editor.priv, {id: topic_id});
}

describe("EV_DRAFTS: the host is the truth", () => {

    test("the host names a topic: it is a draft, on screen too", () => {
        const {editor, host} = build("d1");
        gobj_send_event(editor, "EV_DRAFTS", {drafts: {db: ["users"]}}, host);
        expect(is_draft(editor, "db.users")).toBe(true);
        expect(is_draft(editor, "db.roles")).toBe(false);
        expect(drafts_on_screen(editor)).toBe(1);
    });

    test("the host names none any more (a Save): the mark goes (M1)", () => {
        /*  It only ever ADDED: after the Save the editor still said
         *  "unsaved schema changes".  */
        const {editor, host} = build("d2");
        gobj_send_event(editor, "EV_DRAFTS", {drafts: {db: ["users", "roles"]}}, host);
        expect(drafts_on_screen(editor)).toBe(2);

        gobj_send_event(editor, "EV_DRAFTS", {drafts: {db: []}}, host);
        expect(is_draft(editor, "db.users")).toBe(false);
        expect(is_draft(editor, "db.roles")).toBe(false);
        expect(drafts_on_screen(editor)).toBe(0);
    });

    test("a reload keeps what the host said last, and only that", () => {
        const {editor, remote, host} = build("d3");
        gobj_send_event(editor, "EV_DRAFTS", {drafts: {db: ["roles"]}}, host);
        gobj_send_event(editor, "EV_REFRESH", {}, host);
        expect(answer_the_load(editor, remote)).toBe(3);
        expect(is_draft(editor, "db.roles")).toBe(true);
        expect(is_draft(editor, "db.users")).toBe(false);
    });

    test("what this session wrote is not cleared by the host's answer", () => {
        const {editor, host} = build("d4");
        editor.priv.written["db.users"] = true;     /*  a write of this session  */
        gobj_send_event(editor, "EV_DRAFTS", {drafts: {}}, host);
        expect(is_draft(editor, "db.users")).toBe(true);
    });

    test("no error logged on the way", () => {
        const {editor, host} = build("d5");
        gobj_send_event(editor, "EV_DRAFTS", {drafts: {db: ["users"]}}, host);
        gobj_send_event(editor, "EV_DRAFTS", {drafts: {}}, host);
        expect(logged.filter((l) => l.level === "error").map((l) => l.msg)).toEqual([]);
    });
});
