/***********************************************************************
 *          schema_editor_column_data.wiring.test.js
 *
 *      C_YUI_SCHEMA_EDITOR deleting a column with data behind it. The
 *      records keep their values for the column, and no reader shows
 *      them any more: a legal schema and a data decision, so the
 *      operator is WARNED, not stopped. Before the confirmation the
 *      editor reads the topic's records of the treedb whose schema it
 *      is (paged `nodes`), until one holds a value in the column, the
 *      topic ends, or the read is capped; the confirmation says which.
 *      Up to 7.25.24 it asked the same with data or without.
 *
 *      Driven through the FSM on a document double, with a fake
 *      transport whose state is the one the library reads.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {describe, test, expect, beforeAll, beforeEach, vi} from "vitest";
import {install_dom_double} from "../test/dom_double.js";

install_dom_double();

const confirms = [];
vi.mock("./shell_modals.js", () => ({
    yui_shell_show_error: () => ({close() {}}),
    yui_shell_show_info: () => ({close() {}}),
    yui_shell_show_modal: () => ({close() {}}),
    yui_shell_confirm_danger: (shell, message, opts) => {
        return new Promise((resolve) => {
            confirms.push({message, opts, resolve});
        });
    },
}));

const {
    SDATA_END,
    gclass_create,
    gobj_start_up, gobj_create_yuno, gobj_create, gobj_create_service,
    gobj_start, gobj_send_event,
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
        {id: "db.users.name", value: "name", order: 2, type: "string",
         flag: ["persistent"], topics: ["topics^db.users^cols"]},
    ],
};

const FOUND = "records of this topic hold values in this column: they keep them, but no reader shows them any more";
const CAPPED = "the records read hold no value in this column, but not all were read: the rest may hold values that no reader will show any more";
const UNKNOWN = "the records of this topic could not be read: if they hold values in this column, they keep them, but no reader shows them any more";

function remote_command_parser(gobj, command, kw, src)
{
    if(gobj_current_state(gobj) !== "ST_SESSION") {
        return `${command}: not in session`;
    }
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
    const heard = () => 0;
    gclass_create(
        "C_TEST_EDITOR_HOST",
        [["EV_POSITION_CHANGED", 0], ["EV_RECORD_WRITTEN", 0], ["EV_SCHEMA_CHECKED", 0]],
        [["ST_IDLE", [
            ["EV_POSITION_CHANGED", heard, null],
            ["EV_RECORD_WRITTEN",   heard, null],
            ["EV_SCHEMA_CHECKED",   heard, null]
        ]]],
        {}, 0, [SDATA_END()], {}, 0, 0, 0, 0
    );
    gclass_create(
        "C_TEST_REMOTE",
        [],
        [["ST_DISCONNECTED", []], ["ST_SESSION", []]],
        {mt_command_parser: remote_command_parser},
        0, [SDATA_END()], {}, 0, 0, 0, 0
    );
    register_c_yui_schema_editor();
    yuno = gobj_create_yuno("column_data_yuno", "C_TEST_HOST", {});
    gobj_start(yuno);
});

beforeEach(() => {
    logged.length = 0;
    commands.length = 0;
    confirms.length = 0;
});

function take(filter)
{
    const out = commands.filter(filter);
    for(const c of out) {
        commands.splice(commands.indexOf(c), 1);
    }
    return out;
}

function is_check(c)
{
    return c.command === "nodes" && c.kw.__md_command__ && c.kw.__md_command__.column_check;
}

function answer(editor, remote, request, result, data, comment)
{
    gobj_send_event(editor, "EV_MT_COMMAND_ANSWER", {
        result: result,
        comment: comment || "",
        data: data,
        __md_iev__: {command_stack: [{command: request.command, kw: request.kw}]}
    }, remote);
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
    gobj_send_event(editor, "EV_TRANSPORT_STATE", {connected: true}, host);
    const load = take((c) => c.command === "nodes");
    expect(load.length).toBe(3);
    for(const c of load) {
        answer(editor, remote, c, 0, JSON.parse(JSON.stringify(RECORDS[c.kw.topic_name])));
    }
    gobj_send_event(editor, "EV_SHOW", {subpath: "db/users"}, host);
    expect(gobj_current_state(editor)).toBe("ST_COLUMNS");
    return {editor, remote, host};
}

function page(records, total)
{
    return {total_rows: total, pages: Math.ceil(total / 500) || 1, data: records};
}

/*  What the confirmation says: its key when it is the plain question,
 *  else the key of its warning and the count of the records read (the
 *  locale is not loaded here: the keys are what re-translate).  */
function text_of(message)
{
    if(typeof message === "string") {
        return message;
    }
    const $note = message.querySelector(".SCHEMA_COLUMN_DATA_NOTE");
    const $read = message.querySelector(".SCHEMA_COLUMN_DATA_READ");
    return [
        $note ? $note.getAttribute("data-i18n") : "",
        $read ? $read.textContent : ""
    ].join(" ");
}

describe("deleting a column reads its records first", () => {

    test("the topic's records are asked of the treedb whose schema it is, a page at a time", () => {
        const {editor, host} = build("c1");
        gobj_send_event(editor, "EV_DELETE_COLUMN", {col: "name"}, host);
        const [ask] = take(is_check);
        expect(ask).toBeTruthy();
        expect(ask.kw.service).toBe("db");
        expect(ask.kw.treedb_name).toBe("db");
        expect(ask.kw.topic_name).toBe("users");
        expect(ask.kw.from).toBe(1);
        expect(ask.kw.limit).toBe(500);
        expect(confirms.length).toBe(0);    /*  no confirmation before the answer  */
    });

    test("a record holding a value: the confirmation warns what becomes of it", () => {
        const {editor, remote, host} = build("c2");
        gobj_send_event(editor, "EV_DELETE_COLUMN", {col: "name"}, host);
        const [ask] = take(is_check);
        answer(editor, remote, ask, 0, page([{id: "a"}, {id: "b", name: "Bob"}], 2));
        expect(confirms.length).toBe(1);
        expect(text_of(confirms[0].message)).toContain(FOUND);
        expect(take(is_check).length).toBe(0);
    });

    test("no record holding a value: the plain confirmation, as before", () => {
        const {editor, remote, host} = build("c3");
        gobj_send_event(editor, "EV_DELETE_COLUMN", {col: "name"}, host);
        const [ask] = take(is_check);
        answer(editor, remote, ask, 0, page([{id: "a"}, {id: "b", name: ""}, {id: "c", name: null}], 3));
        expect(confirms.length).toBe(1);
        expect(confirms[0].message).toBe("delete this column?");
    });

    test("the read is capped: the confirmation says the rest was not read", () => {
        const {editor, remote, host} = build("c4");
        gobj_send_event(editor, "EV_DELETE_COLUMN", {col: "name"}, host);
        const empty_page = Array.from({length: 500}, (_, i) => ({id: `r${i}`}));
        for(let i = 0; i < 10; i++) {
            const [ask] = take(is_check);
            expect(ask.kw.from).toBe(1 + i * 500);
            answer(editor, remote, ask, 0, page(empty_page, 100000));
        }
        expect(take(is_check).length).toBe(0);
        expect(confirms.length).toBe(1);
        const text = text_of(confirms[0].message);
        expect(text).toContain(CAPPED);
        expect(text).toContain("5000");
    });

    test("the read fails: the confirmation says it could not check, the delete is not blocked", async () => {
        const {editor, remote, host} = build("c5");
        gobj_send_event(editor, "EV_DELETE_COLUMN", {col: "name"}, host);
        const [ask] = take(is_check);
        answer(editor, remote, ask, -1, null, "no such topic");
        expect(confirms.length).toBe(1);
        expect(text_of(confirms[0].message)).toContain(UNKNOWN);
        expect(logged.some((l) => /cannot read 'users' to check column 'name'/.test(l.msg))).toBe(true);

        confirms[0].resolve(true);
        await Promise.resolve();
        await Promise.resolve();
        const writes = take((c) => c.command === "delete-node");
        expect(writes.length).toBe(1);
        expect(writes[0].kw.topic_name).toBe("cols");
    });

    test("no transport in session: the confirmation says it could not check", () => {
        const {editor, remote, host} = build("c6");
        gobj_change_state(remote, "ST_DISCONNECTED");
        gobj_send_event(editor, "EV_DELETE_COLUMN", {col: "name"}, host);
        expect(take(is_check).length).toBe(0);
        expect(confirms.length).toBe(1);
        expect(text_of(confirms[0].message)).toContain(UNKNOWN);
    });

    test("an answer after the view left the columns asks nothing", () => {
        const {editor, remote, host} = build("c7");
        gobj_send_event(editor, "EV_DELETE_COLUMN", {col: "name"}, host);
        const [ask] = take(is_check);
        gobj_send_event(editor, "EV_SHOW", {subpath: "db"}, host);
        expect(gobj_current_state(editor)).not.toBe("ST_COLUMNS");
        answer(editor, remote, ask, 0, page([{id: "b", name: "Bob"}], 1));
        expect(confirms.length).toBe(0);
        expect(logged.some((l) => /answered after the view left the columns/.test(l.msg))).toBe(true);
        expect(logged.some((l) => /NOT DEFINED/i.test(l.msg))).toBe(false);
    });
});
