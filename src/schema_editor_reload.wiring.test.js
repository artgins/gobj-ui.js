/***********************************************************************
 *          schema_editor_reload.wiring.test.js
 *
 *      C_YUI_SCHEMA_EDITOR while it RELOADS (the third independent
 *      review, 2026-09-23). A reload entered ST_LOADING and drew
 *      nothing: the screen it replaced stayed up and clickable, and
 *      ST_LOADING declares none of its actions, so a click on a card,
 *      on Back, on the drawing -- or the Save of a column form left
 *      open -- answered "Event NOT DEFINED in state ST_LOADING" and
 *      the click, or the edit, was lost.
 *
 *      And the lows of the same review: a position left over from a
 *      load that could not leave, a drop during a WRITE that dropped
 *      the host's position (a drop during a load applies it), the
 *      drawing of a treedb that is gone drawn over the old screen, and
 *      the reload of a late write that forgot this session's marks and
 *      never told the host a write had landed.
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

/*  What the editor SAYS, and the dialogs it opens (their content is
 *  clicked like the operator would).  */
const shown = [];
const modals = [];
vi.mock("./shell_modals.js", () => ({
    yui_shell_show_error: (shell, message) => {
        shown.push(message);
        return {close() {}};
    },
    yui_shell_show_info: () => ({close() {}}),
    yui_shell_show_modal: (shell, $content, opts) => {
        const modal = {$content: $content, opts: opts, closed: false};
        modals.push(modal);
        return {close() {
            modal.closed = true;
        }};
    },
    yui_shell_confirm_danger: () => new Promise(() => {}),
}));

const {
    SDATA, SDATA_END, data_type_t, event_flag_t,
    gclass_create,
    gobj_read_pointer_attr, gobj_write_attr, gobj_parent,
    gobj_subscribe_event, gobj_publish_event,
    gobj_start_up, gobj_create_yuno, gobj_create, gobj_create_service,
    gobj_start, gobj_send_event, gobj_read_attr,
    gobj_change_state, gobj_current_state,
    set_log_callback,
} = await import("@yuneta/gobj-js");
const {register_c_yui_schema_editor} = await import("./c_yui_schema_editor.js");

const logged = [];
const commands = [];
const published = [];

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
    const heard = (gobj, event) => {
        published.push(event);
        return 0;
    };
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
    /*  The drawing, as the editor hosts it: a child that publishes a
     *  click on one of its nodes. The real one draws with G6.  */
    gclass_create(
        "C_YUI_TREEDB_SCHEMA",
        [["EV_SHOW", 0], ["EV_NODE_CLICK", event_flag_t.EVF_OUTPUT_EVENT]],
        [["ST_IDLE", [["EV_SHOW", () => 0, null]]]],
        {
            mt_create: (gobj) => {
                const $c = document.createElement("div");
                const $node = document.createElement("button");
                $node.className = "FAKE_DIAGRAM_NODE";
                $node.addEventListener("click", () => {
                    gobj_publish_event(gobj, "EV_NODE_CLICK", {topic: "users"});
                });
                $c.appendChild($node);
                gobj_write_attr(gobj, "$container", $c);
                let subscriber = gobj_read_pointer_attr(gobj, "subscriber");
                if(!subscriber) {
                    subscriber = gobj_parent(gobj);
                }
                gobj_subscribe_event(gobj, null, {}, subscriber);
            }
        },
        0,
        [
            SDATA(data_type_t.DTP_POINTER, "subscriber", 0, null, ""),
            SDATA(data_type_t.DTP_JSON, "descs", 0, null, ""),
            SDATA(data_type_t.DTP_STRING, "node_route", 0, "", ""),
            SDATA(data_type_t.DTP_BOOLEAN, "with_node_click", 0, false, ""),
            SDATA(data_type_t.DTP_BOOLEAN, "system", 0, false, ""),
            SDATA(data_type_t.DTP_POINTER, "$container", 0, null, ""),
            SDATA_END()
        ],
        {}, 0, 0, 0, 0
    );
    register_c_yui_schema_editor();
    yuno = gobj_create_yuno("reload_yuno", "C_TEST_HOST", {});
    gobj_start(yuno);
});

beforeEach(() => {
    logged.length = 0;
    commands.length = 0;
    shown.length = 0;
    modals.length = 0;
    published.length = 0;
});

function take(command)
{
    const out = commands.filter((c) => c.command === command);
    for(const c of out) {
        commands.splice(commands.indexOf(c), 1);
    }
    return out;
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

function answer_the_load(editor, remote)
{
    const asked = take("nodes");
    for(const c of asked) {
        answer(editor, remote, c, 0, JSON.parse(JSON.stringify(RECORDS[c.kw.topic_name])));
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

function build(name, subpath)
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
    expect(answer_the_load(editor, remote)).toBe(3);
    gobj_send_event(editor, "EV_SHOW", {subpath: subpath}, host);
    return {editor, remote, host};
}

function start_a_write(editor, host, name)
{
    gobj_send_event(editor, "EV_SAVE_COLUMN", {
        creating: true, topic: "users", values: {value: name || "name", type: "string"}
    }, host);
    expect(gobj_current_state(editor)).toBe("ST_SAVING");
    const [write] = take("update-node");
    expect(write).toBeTruthy();
    return write;
}

function $in(editor, selector)
{
    return gobj_read_attr(editor, "$container").querySelector(selector);
}

function $all(editor, selector)
{
    return gobj_read_attr(editor, "$container").querySelectorAll(selector);
}

function is_disabled($b)
{
    return $b.disabled === true || $b.getAttribute("disabled") != null;
}

/*  What an operator can reach: every clickable thing of the view, pressed
 *  the way a browser presses it -- a disabled button does not click.  */
function press_everything(editor)
{
    let pressed = 0;
    for(const $el of $all(editor, "button, [role=button]")) {
        if(is_disabled($el)) {
            continue;
        }
        $el.click();
        pressed++;
    }
    return pressed;
}

function errors()
{
    return logged.filter((l) => l.level === "error").map((l) => l.msg);
}

function not_defined()
{
    return logged.filter((l) => /NOT DEFINED/i.test(l.msg)).map((l) => l.msg);
}

/*  The load, answered with records other than the ones it started on:
 *  somebody else wrote the store meanwhile.  */
function answer_the_load_with(editor, remote, records)
{
    const asked = take("nodes");
    for(const c of asked) {
        answer(editor, remote, c, 0, JSON.parse(JSON.stringify(records[c.kw.topic_name])));
    }
    return asked.length;
}

function records_with(change)
{
    const records = JSON.parse(JSON.stringify(RECORDS));
    change(records);
    return records;
}

/*  What the editor says while a load is in the air, and when one lands
 *  under an open dialog.  */
const WAIT = "the schemas are loading: wait for them";
const STALE = "the schemas were read again: open the dialog again";
const KEPT = "cannot read the schemas again: the previous ones stay";
const NOT_SENT = "the treedb did not describe a write back: the writes after it were not sent";

describe("the screen of a reload", () => {

    test("Refresh on the columns: the old screen goes, the toolbar stops answering", () => {
        const {editor, remote, host} = build("r1", "db/users");
        expect($in(editor, ".SCHEMA_BODY .SCHEMA_COLUMNS")).toBeTruthy();

        gobj_send_event(editor, "EV_REFRESH", {}, host);
        expect(gobj_current_state(editor)).toBe("ST_LOADING");
        expect($in(editor, ".SCHEMA_BODY").childNodes.length).toBe(0);
        const $buttons = $all(editor, ".SCHEMA_TOOLBAR button");
        expect($buttons.length).toBeGreaterThan(0);
        for(const $b of $buttons) {
            expect(is_disabled($b)).toBe(true);
        }

        answer_the_load(editor, remote);
        expect(gobj_current_state(editor)).toBe("ST_COLUMNS");
        expect($in(editor, ".SCHEMA_BODY .SCHEMA_COLUMNS")).toBeTruthy();
        expect(errors()).toEqual([]);
    });

    test.each([
        ["the treedbs", ""],
        ["the topics", "db"],
        ["the columns", "db/users"],
        ["the drawing", "db/diagram"],
    ])("everything clickable on %s during a reload: nothing NOT DEFINED", (label, subpath) => {
        const {editor, remote, host} = build(`r2_${subpath.replace(/\W/g, "_")}`, subpath);
        gobj_send_event(editor, "EV_REFRESH", {}, host);
        press_everything(editor);
        expect(gobj_current_state(editor)).toBe("ST_LOADING");
        expect(errors()).toEqual([]);

        answer_the_load(editor, remote);
        expect(errors()).toEqual([]);
    });

    test("the reload of a reconnect draws the same screen", () => {
        const {editor, remote, host} = build("r3", "db/users");
        start_a_write(editor, host);
        drop(editor, remote, host);
        reconnect(editor, remote, host);
        expect(gobj_current_state(editor)).toBe("ST_LOADING");
        expect($in(editor, ".SCHEMA_BODY").childNodes.length).toBe(0);
        press_everything(editor);
        gobj_send_event(editor, "EV_SHOW", {subpath: "db"}, host);
        answer_the_load(editor, remote);
        expect(gobj_current_state(editor)).toBe("ST_TOPICS");
        expect(errors()).toEqual([]);
    });
});

describe("a form open when a reload starts", () => {

    test("its Save is refused and said, and the load that lands closes it: nothing written", () => {
        const {editor, remote, host} = build("f1", "db/users");
        gobj_send_event(editor, "EV_ADD_COLUMN", {}, editor);
        expect(modals.length).toBe(1);
        const form = modals[0];
        form.$content.querySelector('[data-name="value"]').value = "email";

        gobj_send_event(editor, "EV_REFRESH", {}, host);
        form.$content.querySelector(".SCHEMA_COL_FORM_SAVE").click();

        expect(errors()).toEqual([]);
        /*  Not "try again": the same Save, once the load is in, wrote a
         *  form built on the model the load replaced.  */
        expect(shown).toEqual([WAIT]);
        expect(form.closed).toBe(false);
        expect(take("update-node")).toEqual([]);

        answer_the_load(editor, remote);
        expect(form.closed).toBe(true);
        expect(shown).toEqual([WAIT, STALE]);
        form.$content.querySelector(".SCHEMA_COL_FORM_SAVE").click();
        expect(take("update-node")).toEqual([]);
        expect(errors()).toEqual([]);
    });

    test("a confirmation given during a reload is refused and said", () => {
        const {editor, remote, host} = build("f2", "db/users");
        gobj_send_event(editor, "EV_REFRESH", {}, host);
        gobj_send_event(editor, "EV_CONFIRMED", {what: "column", topic: "users", col: "id"}, editor);
        expect(errors()).toEqual([]);
        expect(shown).toEqual([WAIT]);
        expect(take("update-node")).toEqual([]);
        answer_the_load(editor, remote);
    });
});

describe("a position that waited", () => {

    test("a load that could not leave does not keep it for a later load", () => {
        const {editor, remote, host} = build("p1", "db/users");
        gobj_send_event(editor, "EV_REFRESH", {}, host);
        take("nodes");                              /*  never answered  */
        gobj_send_event(editor, "EV_SHOW", {subpath: "db"}, host);
        gobj_change_state(remote, "ST_DISCONNECTED");
        gobj_send_event(editor, "EV_REFRESH", {}, host);    /*  cannot leave  */

        gobj_send_event(editor, "EV_SHOW", {subpath: "db/users"}, host);
        expect(gobj_current_state(editor)).toBe("ST_COLUMNS");

        reconnect(editor, remote, host);
        answer_the_load(editor, remote);
        gobj_send_event(editor, "EV_REFRESH", {}, host);
        answer_the_load(editor, remote);
        expect(gobj_current_state(editor)).toBe("ST_COLUMNS");
        expect(editor.priv.topic_name).toBe("users");
        expect(editor.priv.model.treedbs.length).toBe(1);
    });

    test("a load that could not leave keeps the records the model was built on", () => {
        const {editor, remote, host} = build("p2", "db/users");
        gobj_change_state(remote, "ST_DISCONNECTED");
        gobj_send_event(editor, "EV_REFRESH", {}, host);
        expect(editor.priv.records.cols.length).toBe(1);

        /*  ...and the session back reads the model again.  */
        reconnect(editor, remote, host);
        expect(gobj_current_state(editor)).toBe("ST_LOADING");
        answer_the_load(editor, remote);
        expect(gobj_current_state(editor)).toBe("ST_COLUMNS");
    });

    test("a Refresh out of session asks nothing and logs no error: the session back loads", () => {
        const {editor, remote, host} = build("p4", "db/users");
        gobj_change_state(remote, "ST_DISCONNECTED");
        gobj_send_event(editor, "EV_REFRESH", {}, host);
        expect(errors()).toEqual([]);
        expect(shown).toEqual(["cannot reach the treedb"]);
        expect(gobj_current_state(editor)).toBe("ST_COLUMNS");
        reconnect(editor, remote, host);
        expect(answer_the_load(editor, remote)).toBe(3);
        expect(errors()).toEqual([]);
    });

    test("a drop during a WRITE applies it, as a drop during a load does", () => {
        const {editor, remote, host} = build("p3", "db/users");
        start_a_write(editor, host);
        gobj_send_event(editor, "EV_SHOW", {subpath: "db"}, host);
        drop(editor, remote, host);
        expect(shown).toEqual(["the connection dropped during the write"]);
        expect(gobj_current_state(editor)).toBe("ST_TOPICS");
        expect(editor.priv.topic_name).toBe("");
        expect(editor.priv.pending_seg).toBe(null);
    });
});

describe("the drawing of a treedb that is not there", () => {

    test("does not leave the old screen up", () => {
        const {editor, remote, host} = build("d1", "db/users");
        gobj_send_event(editor, "EV_SHOW", {subpath: "gone/diagram"}, host);
        expect(gobj_current_state(editor)).toBe("ST_DIAGRAM");
        expect($in(editor, ".SCHEMA_BODY .SCHEMA_COLUMNS")).toBe(null);
        expect($in(editor, ".SCHEMA_NOTICE_TEXT").getAttribute("data-i18n")).toBe("that treedb is not here any more");
        expect(errors()).toEqual([]);
    });
});

describe("a write given up that was DONE", () => {

    test("the host is told, and the reload keeps what this session wrote", () => {
        const {editor, remote, host} = build("l1", "db/users");
        const w1 = start_a_write(editor, host, "name");
        answer(editor, remote, w1, 0, {id: "db.users.name", value: "name", order: 2,
            type: "string", topics: ["topics^db.users^cols"]});
        expect(editor.priv.written).toEqual({"db.users": true});

        const w2 = start_a_write(editor, host, "email");
        drop(editor, remote, host);
        reconnect(editor, remote, host);
        answer_the_load(editor, remote);
        expect(editor.priv.written).toEqual({"db.users": true});
        published.length = 0;

        answer(editor, remote, w2, 0, {id: "db.users.email", value: "email",
            type: "string", topics: ["topics^db.users^cols"]});
        expect(published).toContain("EV_RECORD_WRITTEN");
        expect(gobj_current_state(editor)).toBe("ST_LOADING");
        answer_the_load(editor, remote);
        expect(editor.priv.written).toEqual({"db.users": true});
        expect(errors()).toEqual([]);
    });

    test("a write answered with no record: told, marked, and the body answers again", () => {
        const {editor, remote, host} = build("l3", "db/users");
        const w = start_a_write(editor, host, "name");
        answer(editor, remote, w, 0, null);
        expect(published).toContain("EV_RECORD_WRITTEN");
        expect(gobj_current_state(editor)).toBe("ST_LOADING");
        answer_the_load(editor, remote);
        expect(gobj_current_state(editor)).toBe("ST_COLUMNS");
        expect($in(editor, ".SCHEMA_BODY").classList.contains("SCHEMA_BUSY")).toBe(false);
        expect(editor.priv.written).toEqual({"db.users": true});
        expect(errors()).toEqual([]);
    });

    test("the host's Refresh still forgets them (a Save is what sends it)", () => {
        const {editor, remote, host} = build("l2", "db/users");
        const w1 = start_a_write(editor, host, "name");
        answer(editor, remote, w1, 0, {id: "db.users.name", value: "name", order: 2,
            type: "string", topics: ["topics^db.users^cols"]});
        gobj_send_event(editor, "EV_REFRESH", {}, host);
        answer_the_load(editor, remote);
        expect(editor.priv.written).toEqual({});
    });
});

describe("a dialog built on the model a reload replaced (fourth review)", () => {

    test("an edit form: the load that lands closes it, and its Save writes nothing", () => {
        const {editor, remote, host} = build("s1", "db/users");
        gobj_send_event(editor, "EV_EDIT_COLUMN", {col: "id"}, host);
        const form = modals[modals.length - 1];
        form.$content.querySelector('[data-name="description"]').value = "mine";

        gobj_send_event(editor, "EV_REFRESH", {}, host);
        answer_the_load_with(editor, remote, records_with((r) => {
            r.cols[0].description = "NEWER";
            r.cols[0].header = "Newer header";
        }));
        expect(form.closed).toBe(true);
        expect(shown).toEqual([STALE]);
        expect(editor.priv.dialog).toBe(null);

        /*  The form's button, pressed anyway (a stale screen, a keyboard):
         *  the record it would write is the OLD one with one field changed,
         *  over the newer one.  */
        form.$content.querySelector(".SCHEMA_COL_FORM_SAVE").click();
        expect(take("update-node")).toEqual([]);
        expect(errors()).toEqual([]);
    });

    test("the column of the open form is gone after the reload: closed, no ERROR", () => {
        const {editor, remote, host} = build("s2", "db/users");
        gobj_send_event(editor, "EV_EDIT_COLUMN", {col: "id"}, host);
        const form = modals[modals.length - 1];
        gobj_send_event(editor, "EV_REFRESH", {}, host);
        answer_the_load_with(editor, remote, records_with((r) => {
            r.cols = [];
        }));
        expect(form.closed).toBe(true);
        form.$content.querySelector(".SCHEMA_COL_FORM_SAVE").click();
        expect(take("update-node")).toEqual([]);
        expect(errors()).toEqual([]);
        expect(not_defined()).toEqual([]);
    });

    test("an import plan is not run on the model that replaced the one it was planned on", () => {
        const {editor, remote, host} = build("s3", "db");
        gobj_send_event(editor, "EV_IMPORT", {}, host);
        const dialog = modals[modals.length - 1];
        gobj_send_event(editor, "EV_PREVIEW_IMPORT", {
            prune: false,
            text: JSON.stringify({id: "db", topics: [{id: "users", pkey: "id", cols: [
                {id: "id", type: "string", flag: ["persistent", "required"]},
                {id: "email", type: "string"}
            ]}]})
        }, editor);
        expect(editor.priv.import_plan.writes.length).toBeGreaterThan(0);

        gobj_send_event(editor, "EV_REFRESH", {}, host);
        expect(editor.priv.import_plan).toBe(null);
        answer_the_load_with(editor, remote, records_with((r) => {
            r.cols.push({id: "db.users.email", value: "email", order: 2, type: "integer",
                         topics: ["topics^db.users^cols"]});
        }));
        expect(dialog.closed).toBe(true);

        dialog.$content.querySelector(".SCHEMA_IMPORT_RUN").disabled = false;
        dialog.$content.querySelector(".SCHEMA_IMPORT_RUN").click();
        expect(take("update-node")).toEqual([]);
        expect(take("delete-node")).toEqual([]);
        expect(errors()).toEqual([]);
    });

    test("a confirmation decided on the model a reload replaced is not applied", () => {
        const {editor, remote, host} = build("s4", "db/users");
        const kw = {what: "column", topic: "users", col: "id",
                    model_gen: editor.priv.model_gen};
        gobj_send_event(editor, "EV_REFRESH", {}, host);
        answer_the_load(editor, remote);
        gobj_send_event(editor, "EV_CONFIRMED", kw, editor);
        expect(take("update-node")).toEqual([]);
        expect(shown).toEqual([STALE]);
        expect(errors()).toEqual([]);
    });
});
