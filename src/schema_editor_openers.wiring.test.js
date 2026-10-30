/***********************************************************************
 *          schema_editor_openers.wiring.test.js
 *
 *      What opens something in C_YUI_SCHEMA_EDITOR is a NAMED control:
 *
 *        - a card of the treedbs screen (a treedb, the leftovers of a
 *          deletion) is a role=button with a title and an aria-label,
 *          its counts its description; up to 7.26.40 it had neither;
 *        - a row of the topics screen keeps the table's semantics: it was
 *          a `<tr role=button>`, which unmakes the row for a reader (a
 *          button has no cells) and had no name either. Its opener is a
 *          real button in the name cell, named by the topic; the pointer
 *          still opens the topic from anywhere in the row.
 *
 *      A real C_YUI_SCHEMA_EDITOR on a document double, driven through
 *      its FSM.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {describe, test, expect, beforeAll, beforeEach} from "vitest";
import {install_dom_double, fake_event} from "../test/dom_double.js";

install_dom_double();

const {
    SDATA_END,
    gclass_create,
    gobj_start_up, gobj_create_yuno, gobj_create, gobj_create_service,
    gobj_start, gobj_send_event, gobj_read_attr, gobj_current_state,
    gobj_change_state, refresh_language,
    set_log_callback,
} = await import("@yuneta/gobj-js");
const {register_c_yui_schema_editor} = await import("./c_yui_schema_editor.js");

const logged = [];
const commands = [];

/*  One treedb with two topics, and a topic whose treedb is gone (the
 *  leftover of a deletion: the orphans card).  */
const RECORDS = {
    treedbs: [{id: "db", schema_version: 4}],
    topics: [
        {id: "db.users", value: "users", order: 1, pkey: "id", topic_version: 2,
         treedbs: ["treedbs^db^topics"]},
        {id: "db.roles", value: "roles", order: 2, pkey: "id", topic_version: 1,
         treedbs: ["treedbs^db^topics"]},
        {id: "gone.left", value: "left", order: 1, pkey: "id", topic_version: 1,
         treedbs: ["treedbs^gone^topics"]},
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
let seq = 0;

beforeAll(async () => {
    const i18next = (await import("i18next")).default;
    await i18next.init({lng: "en", resources: {}});
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
    yuno = gobj_create_yuno("openers_yuno", "C_TEST_HOST", {});
    gobj_start(yuno);
});

beforeEach(() => {
    logged.length = 0;
    commands.length = 0;
});

function errors()
{
    return logged.filter((l) => l.level === "error").map((l) => l.msg);
}

/*  Answer every `nodes` the editor asked, as a transport does.  */
function answer_the_load(editor, remote, records)
{
    const asked = commands.filter((c) => c.command === "nodes");
    commands.length = 0;
    for(const c of asked) {
        gobj_send_event(editor, "EV_MT_COMMAND_ANSWER", {
            result: 0,
            data: (records || RECORDS)[c.kw.topic_name],
            __md_iev__: {command_stack: [{command: "nodes", kw: c.kw}]}
        }, remote);
    }
    return asked.length;
}

/*  An editor with its schemas loaded, on the screen of `subpath`.  */
function build(subpath, records)
{
    const name = `openers_${++seq}`;
    const remote = gobj_create_service(`${name}_remote`, "C_TEST_REMOTE", {}, yuno);
    gobj_change_state(remote, "ST_SESSION");
    const host = gobj_create(`${name}_host`, "C_TEST_EDITOR_HOST", {}, yuno);
    const editor = gobj_create(`${name}_editor`, "C_YUI_SCHEMA_EDITOR", {
        gobj_remote_yuno: remote,
        treedb_name: "treedb_system_schema",
        base_route: "/schemas"
    }, host);
    gobj_start(editor);
    expect(answer_the_load(editor, remote, records)).toBe(3);
    gobj_send_event(editor, "EV_SHOW", {subpath: subpath}, host);
    return editor;
}

function root(editor)
{
    return gobj_read_attr(editor, "$container");
}

/*  The text of the element an IDREF of `$el` points at, in its tree.  */
function referenced_text($el, attr)
{
    let $top = $el;
    while($top.parentNode) {
        $top = $top.parentNode;
    }
    return ($el.getAttribute(attr) || "").split(/\s+/).filter(Boolean).map((id) => {
        const $ref = $top.querySelector(`#${id}`);
        expect(!!$ref, `${attr} points at '${id}', which is not in its tree`).toBe(true);
        return $ref.textContent;
    }).join(" ");
}

describe("a card of the treedbs screen", () => {
    test("is a named control: a title, an aria-label, and its counts as its description", () => {
        const editor = build("");
        expect(gobj_current_state(editor)).toBe("ST_TREEDBS");

        const $card = root(editor).querySelector(".SCHEMA_TREEDB_CARD");
        expect(!!$card).toBe(true);
        expect($card.getAttribute("role")).toBe("button");
        expect($card.getAttribute("tabindex")).toBe("0");
        /*  The treedb's name is DATA: it is not translated.  */
        expect($card.getAttribute("title")).toBe("db");
        expect($card.getAttribute("aria-label")).toBe("db");
        expect($card.getAttribute("data-i18n-aria-label")).toBe(null);
        expect(referenced_text($card, "aria-describedby")).toBe("topics2version4");
        expect(errors()).toEqual([]);
    });

    test("the orphans card is named by its key, and changes language with the page", async () => {
        const i18next = (await import("i18next")).default;
        i18next.addResourceBundle("es", "translation", {"orphans": "Huérfanos"}, true, true);
        const editor = build("");

        const $card = root(editor).querySelector(".SCHEMA_ORPHAN_CARD");
        expect(!!$card).toBe(true);
        expect($card.getAttribute("role")).toBe("button");
        expect($card.getAttribute("title")).toBe("orphans");
        expect($card.getAttribute("aria-label")).toBe("orphans");
        expect($card.getAttribute("data-i18n-title")).toBe("orphans");
        expect($card.getAttribute("data-i18n-aria-label")).toBe("orphans");
        expect($card.querySelector(".SCHEMA_ORPHAN_CARD_NAME").getAttribute("data-i18n")).toBe("orphans");

        /*  The text of its name carries the key too (data-i18n): the
         *  double does not translate text nodes, a browser does.  */
        refresh_language(root(editor), i18next.getFixedT("es"));
        expect($card.getAttribute("title")).toBe("Huérfanos");
        expect($card.getAttribute("aria-label")).toBe("Huérfanos");
    });

    test("Enter and Space open it, through the machine", () => {
        for(const key of ["Enter", " "]) {
            const editor = build("");
            const $card = root(editor).querySelector(".SCHEMA_TREEDB_CARD");
            const ev = fake_event("keydown", {key: key});
            $card.dispatchEvent(ev);
            expect(ev.defaultPrevented).toBe(true);     // Space would scroll the page
            expect(gobj_current_state(editor)).toBe("ST_TOPICS");
        }
        expect(errors()).toEqual([]);
    });
});

describe("a row of the topics screen", () => {
    test("is a row of the table, not a button; its opener is a real button in the name cell, named by the topic", () => {
        const editor = build("db");
        expect(gobj_current_state(editor)).toBe("ST_TOPICS");

        const $rows = root(editor).querySelectorAll(".SCHEMA_TOPIC_ROW");
        expect($rows.length).toBe(2);
        for(const $row of $rows) {
            expect($row.tagName).toBe("TR");
            expect($row.getAttribute("role")).toBe(null);
            expect($row.getAttribute("tabindex")).toBe(null);
        }

        const $open = $rows[0].querySelector(".SCHEMA_TOPIC_NAME .SCHEMA_TOPIC_OPEN");
        expect(!!$open).toBe(true);
        expect($open.tagName).toBe("BUTTON");
        expect($open.getAttribute("type")).toBe("button");
        /*  The topic's name is DATA: it is not translated.  */
        expect($open.getAttribute("title")).toBe("users");
        expect($open.getAttribute("aria-label")).toBe("users");
        expect($open.textContent).toBe("users");
        expect(errors()).toEqual([]);
    });

    test("its opener opens the topic -- a key presses a <button> with no handler of ours", () => {
        const editor = build("db");
        root(editor).querySelector(".SCHEMA_TOPIC_ROW .SCHEMA_TOPIC_OPEN").click();
        expect(gobj_current_state(editor)).toBe("ST_COLUMNS");
        expect(errors()).toEqual([]);
    });

    test("the pointer still opens it from anywhere in the row, and not from a row action", () => {
        const editor = build("db");
        const $row = root(editor).querySelector(".SCHEMA_TOPIC_ROW");

        /*  A press on a row action is the action's, not the row's.  */
        const $edit = $row.querySelector(".SCHEMA_TOPIC_EDIT");
        expect(!!$edit).toBe(true);
        $row.dispatchEvent(fake_event("click", {target: $edit}));
        expect(gobj_current_state(editor)).toBe("ST_TOPICS");

        $row.dispatchEvent(fake_event("click", {target: $row.querySelector(".SCHEMA_TOPIC_PKEY")}));
        expect(gobj_current_state(editor)).toBe("ST_COLUMNS");
        expect(errors()).toEqual([]);
    });

    /*  Two generations of one schema in a store: two topics named
     *  "users", told apart only by their ids.  */
    test("two topics of one name: each opener says the id that tells them apart", () => {
        const records = {
            treedbs: RECORDS.treedbs,
            topics: [
                {id: "db.users", value: "users", order: 1, pkey: "id", topic_version: 2,
                 treedbs: ["treedbs^db^topics"]},
                {id: "17", value: "users", order: 2, pkey: "id", topic_version: 1,
                 treedbs: ["treedbs^db^topics"]},
            ],
            cols: [],
        };
        const editor = build("db", records);
        const $opens = root(editor).querySelectorAll(".SCHEMA_TOPIC_OPEN");
        expect($opens.length).toBe(2);
        expect($opens.map(($o) => $o.getAttribute("aria-label"))).toEqual(["users", "users"]);
        expect($opens.map(($o) => referenced_text($o, "aria-describedby"))).toEqual(["db.users", "17"]);

        /*  And each opens its own: by id, the name would open the first.  */
        $opens[1].click();
        expect(gobj_current_state(editor)).toBe("ST_COLUMNS");
        expect(editor.priv.topic_name).toBe("17");
        expect(errors()).toEqual([]);
    });
});
