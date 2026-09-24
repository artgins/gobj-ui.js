/***********************************************************************
 *          schema_editor_reload.wiring.test.js
 *
 *      C_YUI_SCHEMA_EDITOR while it RELOADS. A reload entered
 *      ST_LOADING and drew nothing: the screen it replaced stayed up and
 *      clickable, and ST_LOADING declares none of its actions, so a click
 *      on a card, on Back, on the drawing -- or the Save of a column form
 *      left open -- answered "Event NOT DEFINED in state ST_LOADING" and
 *      the click, or the edit, was lost.
 *
 *      And what a reload left behind: a position left over from a load
 *      that could not leave, a drop during a WRITE that dropped the
 *      host's position (a drop during a load applies it), the drawing of
 *      a treedb that is gone drawn over the old screen, the reload of a
 *      late write that forgot this session's marks and never told the
 *      host a write had landed, a dialog opened on the model it replaced
 *      (its Save wrote the old record over the newer one), a load refused
 *      IN session that blanked the model, a late write whose list_dict
 *      fkey marked nothing, a write answered with no record that owed a
 *      second reload and dropped the rest of its queue in silence, and a
 *      toolbar gated on the state instead of on the treedb being there.
 *
 *      And where the owed reload lingered: a load that LANDED by another
 *      road (the operator's Refresh, a late write) left it owed, so the
 *      next edit was refused and read the store again; a move sent by the
 *      host did not run it; a load that failed forgot the import plan of
 *      a dialog it left up; and the export's two views switched in a DOM
 *      handler, out of the machine.
 *
 *      And a dialog that outlives its screen through a move sent by the
 *      host: its Save answered "Event NOT DEFINED", and a confirmation
 *      answered after a move to another treedb deleted there.
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
const confirms = [];
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
    yui_shell_confirm_danger: (shell, message, opts) => {
        /*  Answered by the test that needs it (`resolve`), or never.  */
        return new Promise((resolve) => {
            confirms.push({message, opts, resolve});
        });
    },
}));

const {
    SDATA, SDATA_END, data_type_t, event_flag_t,
    gclass_create,
    gobj_read_pointer_attr, gobj_write_attr, gobj_parent,
    gobj_subscribe_event, gobj_publish_event,
    gobj_start_up, gobj_create_yuno, gobj_create, gobj_create_service,
    gobj_start, gobj_send_event, gobj_read_attr,
    gobj_change_state, gobj_current_state,
    gobj_set_gobj_trace,
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
    confirms.length = 0;
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
const KEPT = "cannot read the schemas again: the ones shown may be out of date, your next change reads them first";
const OWED = "the schemas shown may be out of date: they are read again, try again when they are in";
const OWED_FORM = "the schemas shown may be out of date: they are read again, and the form opens again on them with your changes";
const GONE = "the schemas were read again and what the form was editing is not there any more";
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

        /*  The shape the store answers with: `nodes`/`update-node` ask
         *  for list_dict, so a fkey comes back as a list of refs.  */
        answer(editor, remote, w2, 0, {id: "db.users.email", value: "email",
            type: "string", topics: [{id: "db.users", topic_name: "topics", hook_name: "cols"}]});
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

describe("a dialog built on the model a reload replaced", () => {

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
        answer_the_load_with(editor, remote, records_with((r) => {
            r.cols.push({id: "db.users.email", value: "email", order: 2, type: "integer",
                         topics: ["topics^db.users^cols"]});
        }));
        /*  Forgotten when the load LANDS, not when it leaves.  */
        expect(editor.priv.import_plan).toBe(null);
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

describe("a load that fails IN session", () => {

    test("keeps the model, the screen and the open form, says so, and owes the reload", () => {
        const {editor, remote, host} = build("b1", "db/users");
        gobj_send_event(editor, "EV_EDIT_COLUMN", {col: "id"}, host);
        const form = modals[modals.length - 1];
        form.$content.querySelector('[data-name="header"]').value = "Identifier";
        gobj_send_event(editor, "EV_REFRESH", {}, host);
        const asked = take("nodes");
        answer(editor, remote, asked[0], -1, null, "deadline");
        answer(editor, remote, asked[1], 0, RECORDS[asked[1].kw.topic_name]);
        answer(editor, remote, asked[2], 0, RECORDS[asked[2].kw.topic_name]);

        expect(gobj_current_state(editor)).toBe("ST_COLUMNS");
        expect(editor.priv.model.treedbs.length).toBe(1);
        expect(editor.priv.records.treedbs.length).toBe(1);
        expect(editor.priv.reload_on_open).toBe(true);
        expect(shown).toEqual([KEPT]);
        expect(form.closed).toBe(false);
        expect($in(editor, ".SCHEMA_BODY .SCHEMA_COLUMNS")).toBeTruthy();

        /*  The form was built on a model that may be older than the
         *  store: its Save would write every field of it. It runs the
         *  reload owed instead. The load that lands closes the form,
         *  and opens it again ON THE SCHEMAS JUST READ with what the
         *  operator changed: closed alone, what was typed was lost.  */
        form.$content.querySelector(".SCHEMA_COL_FORM_SAVE").click();
        expect(not_defined()).toEqual([]);
        expect(take("update-node")).toEqual([]);
        expect(shown).toEqual([KEPT, OWED_FORM]);
        const before = modals.length;
        expect(answer_the_load(editor, remote)).toBe(3);
        expect(form.closed).toBe(true);
        expect(modals.length).toBe(before + 1);
        const again = modals[modals.length - 1];
        expect(again.closed).toBe(false);
        expect(again.$content.querySelector('[data-name="header"]').value).toBe("Identifier");
        expect(shown).toEqual([KEPT, OWED_FORM]);
        expect(editor.priv.reload_on_open).toBe(false);

        /*  Its Save writes, on the record just read.  */
        again.$content.querySelector(".SCHEMA_COL_FORM_SAVE").click();
        const [write] = take("update-node");
        expect(write.kw.record.id).toBe("db.users.id");
        expect(write.kw.record.header).toBe("Identifier");
        expect(errors()).toEqual([]);
    });

    test("with no model before it, it is the empty screen it always was", () => {
        const remote = gobj_create_service("b2_remote", "C_TEST_REMOTE", {}, yuno);
        gobj_change_state(remote, "ST_SESSION");
        const host = gobj_create("b2_host", "C_TEST_EDITOR_HOST", {}, yuno);
        const editor = gobj_create("b2_editor", "C_YUI_SCHEMA_EDITOR", {
            gobj_remote_yuno: remote, treedb_name: "treedb_system_schema"
        }, host);
        gobj_start(editor);
        for(const c of take("nodes")) {
            answer(editor, remote, c, -1, null, "deadline");
        }
        expect(gobj_current_state(editor)).toBe("ST_IDLE");
        expect(editor.priv.model).toBe(null);
        expect(errors()).toEqual([]);
    });

    test("a drop that cuts a reload keeps the records the model was built on", () => {
        const {editor, remote, host} = build("b3", "db/users");
        gobj_send_event(editor, "EV_REFRESH", {}, host);
        const asked = take("nodes");
        answer(editor, remote, asked[0], 0, []);   /*  half a load  */
        drop(editor, remote, host);
        expect(editor.priv.records.treedbs.length).toBe(1);
        expect(editor.priv.records.cols.length).toBe(1);
        expect(gobj_current_state(editor)).toBe("ST_COLUMNS");
    });
});

describe("a late write, in the shape the store answers", () => {

    test("a list_dict fkey marks the topic the column belongs to", () => {
        const {editor, remote, host} = build("c1", "db/users");
        const w = start_a_write(editor, host, "name");
        drop(editor, remote, host);
        reconnect(editor, remote, host);
        answer_the_load(editor, remote);
        expect(editor.priv.written).toEqual({});
        answer(editor, remote, w, 0, {id: "db.users.name", value: "name", type: "string",
            topics: [{id: "db.users", topic_name: "topics", hook_name: "cols"}]});
        expect(editor.priv.written).toEqual({"db.users": true});
        answer_the_load(editor, remote);
        expect(errors()).toEqual([]);
    });
});

describe("a write answered with no record", () => {

    test("the reload it asks is the one owed: the next write does not load again", () => {
        const {editor, remote, host} = build("n1", "db/users");
        const w1 = start_a_write(editor, host, "a1");
        drop(editor, remote, host);
        reconnect(editor, remote, host);
        answer_the_load(editor, remote);
        const w2 = start_a_write(editor, host, "a2");
        answer(editor, remote, w1, 0, {id: "db.users.a1", value: "a1",
            topics: [{id: "db.users", topic_name: "topics", hook_name: "cols"}]});
        expect(editor.priv.reload_after_write).toBe(true);
        answer(editor, remote, w2, 0, null);
        expect(editor.priv.reload_after_write).toBe(false);
        answer_the_load(editor, remote);

        const w3 = start_a_write(editor, host, "a3");
        answer(editor, remote, w3, 0, {id: "db.users.a3", value: "a3",
            topics: [{id: "db.users", topic_name: "topics", hook_name: "cols"}]});
        expect(gobj_current_state(editor)).toBe("ST_COLUMNS");
        expect(take("nodes")).toEqual([]);
        expect(errors()).toEqual([]);
    });

    test("the writes queued after it are said, not dropped in silence", () => {
        const {editor, remote, host} = build("n2", "db/users");
        for(const name of ["a", "b"]) {
            const w = start_a_write(editor, host, name);
            answer(editor, remote, w, 0, {id: `db.users.${name}`, value: name, type: "string",
                order: name === "a" ? 2 : 3, topics: ["topics^db.users^cols"]});
        }
        gobj_send_event(editor, "EV_MOVE_COLUMN", {from: 0, to: 3}, host);
        expect(gobj_current_state(editor)).toBe("ST_SAVING");
        expect(editor.priv.save_queue.length).toBeGreaterThan(1);
        const [first] = take("update-node");
        answer(editor, remote, first, 0, null);
        expect(take("update-node")).toEqual([]);
        expect(shown).toEqual([NOT_SENT]);
        expect(logged.some((l) => l.level === "warning" && /not sent/.test(l.msg))).toBe(true);
        answer_the_load(editor, remote);
        expect(errors()).toEqual([]);
    });
});

describe("the toolbar of a treedb that is not there", () => {

    test("offers Back and Refresh, and nothing that needs the treedb", () => {
        const {editor, remote, host} = build("t1", "db");
        gobj_send_event(editor, "EV_REFRESH", {}, host);
        answer_the_load_with(editor, remote, records_with((r) => {
            r.treedbs = [{id: "other", schema_version: 1}];
            r.topics = [];
            r.cols = [];
        }));
        expect($in(editor, ".SCHEMA_BACK")).toBeTruthy();
        expect($in(editor, ".SCHEMA_REFRESH_BTN")).toBeTruthy();
        for(const cls of ["SCHEMA_DIAGRAM_BTN", "SCHEMA_VALIDATE_BTN", "SCHEMA_EXPORT_BTN",
                          "SCHEMA_IMPORT_BTN", "SCHEMA_ADD_TOPIC_BTN"]) {
            expect([cls, !!$in(editor, `.${cls}`)]).toEqual([cls, false]);
        }
        for(const $b of $all(editor, ".SCHEMA_TOOLBAR button")) {
            if($b.classList.contains("SCHEMA_REFRESH_BTN") || $b.classList.contains("SCHEMA_BACK")) {
                continue;
            }
            $b.click();
        }
        expect(errors()).toEqual([]);
    });

    test("a topic that is not there offers no New column", () => {
        const {editor, remote, host} = build("t2", "db/users");
        gobj_send_event(editor, "EV_REFRESH", {}, host);
        answer_the_load_with(editor, remote, records_with((r) => {
            r.topics = [];
            r.cols = [];
        }));
        expect(!!$in(editor, ".SCHEMA_ADD_COL_BTN")).toBe(false);
        expect($in(editor, ".SCHEMA_BACK")).toBeTruthy();
    });
});

describe("every control of the editor's dialogs is named", () => {

    /*  A control a wrapping <label> names is the one shape that needs no
     *  attribute (CLAUDE.md, "title + aria-label").  */
    function unnamed($root)
    {
        const out = [];
        for(const $c of $root.querySelectorAll("button, input, select, textarea")) {
            if($c.getAttribute("type") === "checkbox" && $c.closest("label")) {
                continue;
            }
            const ok = $c.getAttribute("title") !== null &&
                $c.getAttribute("aria-label") !== null &&
                !!$c.getAttribute("data-i18n-title") &&
                !!$c.getAttribute("data-i18n-aria-label");
            if(!ok) {
                out.push(`${$c.tagName} ${$c.className || $c.getAttribute("data-name") || ""}`);
            }
        }
        return out;
    }

    test("the column form, the topic form and the import", () => {
        const {editor, remote, host} = build("a1", "db/users");
        gobj_send_event(editor, "EV_EDIT_COLUMN", {col: "id"}, host);
        expect(unnamed(modals[modals.length - 1].$content)).toEqual([]);

        gobj_send_event(editor, "EV_SHOW", {subpath: "db"}, host);
        gobj_send_event(editor, "EV_EDIT_TOPIC", {topic: "users"}, host);
        expect(unnamed(modals[modals.length - 1].$content)).toEqual([]);

        gobj_send_event(editor, "EV_IMPORT", {}, host);
        expect(unnamed(modals[modals.length - 1].$content)).toEqual([]);
        expect(errors()).toEqual([]);
    });
});

describe("the export's two views are controls", () => {

    test("each is a named button that says which one is shown, and switches the text", () => {
        const {editor, remote, host} = build("x1", "db");
        gobj_send_event(editor, "EV_EXPORT", {}, host);
        const $content = modals[modals.length - 1].$content;
        const $tabs = [...$content.querySelectorAll(".SCHEMA_EXPORT_TAB")];
        expect($tabs.map(($b) => [
            $b.tagName.toLowerCase(),
            $b.getAttribute("type"),
            $b.getAttribute("title") !== null,
            $b.getAttribute("data-i18n-title"),
            $b.getAttribute("aria-label") !== null,
            $b.getAttribute("data-i18n-aria-label"),
            $b.getAttribute("aria-pressed"),
        ])).toEqual([
            ["button", "button", true, "schema as c source", true, "schema as c source", "true"],
            ["button", "button", true, "schema as json", true, "schema as json", "false"],
        ]);

        const $text = $content.querySelector(".SCHEMA_EXPORT_TEXT");
        $tabs[1].click();
        expect($text.value.trim().startsWith("{")).toBe(true);
        expect($tabs.map(($b) => $b.getAttribute("aria-pressed"))).toEqual(["false", "true"]);
        $tabs[0].click();
        expect($text.value.trim().startsWith("{")).toBe(false);
        expect(errors()).toEqual([]);
    });
});

describe("a Refresh asked while a load is in flight", () => {

    test("keeps the records of the model shown, not the half the first load got", () => {
        const {editor, remote, host} = build("h1", "db/users");
        gobj_send_event(editor, "EV_REFRESH", {}, host);
        const first = take("nodes");
        answer(editor, remote, first[0], 0, []);    /*  half a load  */

        gobj_send_event(editor, "EV_REFRESH", {}, host);
        const second = take("nodes");
        expect(second.length).toBe(3);
        drop(editor, remote, host);
        expect(editor.priv.records.treedbs.length).toBe(1);
        expect(editor.priv.records.topics.length).toBe(1);
        expect(editor.priv.records.cols.length).toBe(1);
        expect(gobj_current_state(editor)).toBe("ST_COLUMNS");
        expect(errors()).toEqual([]);
    });

    test("...and so does one that fails in session", () => {
        const {editor, remote, host} = build("h2", "db/users");
        gobj_send_event(editor, "EV_REFRESH", {}, host);
        const first = take("nodes");
        answer(editor, remote, first[0], 0, []);

        gobj_send_event(editor, "EV_REFRESH", {}, host);
        const second = take("nodes");
        answer(editor, remote, second[0], -1, null, "deadline");
        answer(editor, remote, second[1], 0, []);
        answer(editor, remote, second[2], 0, []);
        expect(editor.priv.records.cols.length).toBe(1);
        expect(editor.priv.model.treedbs.length).toBe(1);
        expect(errors()).toEqual([]);
    });
});

describe("the reload a load refused in session owes", () => {

    function refused_load(name, subpath)
    {
        const built = build(name, subpath);
        gobj_send_event(built.editor, "EV_REFRESH", {}, built.host);
        const asked = take("nodes");
        answer(built.editor, built.remote, asked[0], -1, null, "deadline");
        answer(built.editor, built.remote, asked[1], 0, RECORDS[asked[1].kw.topic_name]);
        answer(built.editor, built.remote, asked[2], 0, RECORDS[asked[2].kw.topic_name]);
        expect(built.editor.priv.reload_on_open).toBe(true);
        expect(shown).toEqual([KEPT]);
        return built;
    }

    test("RUNS on the next edit, which is refused and said: nothing is opened on the old model", () => {
        const {editor, remote, host} = refused_load("o1", "db/users");
        const before = modals.length;
        gobj_send_event(editor, "EV_EDIT_COLUMN", {col: "id"}, host);
        expect(modals.length).toBe(before);
        expect(gobj_current_state(editor)).toBe("ST_LOADING");
        expect(shown).toEqual([KEPT, OWED]);
        expect(answer_the_load(editor, remote)).toBe(3);
        expect(gobj_current_state(editor)).toBe("ST_COLUMNS");
        expect(editor.priv.reload_on_open).toBe(false);

        /*  Once: the next edit opens its form.  */
        gobj_send_event(editor, "EV_EDIT_COLUMN", {col: "id"}, host);
        expect(modals.length).toBe(before + 1);
        expect(take("nodes")).toEqual([]);
        expect(errors()).toEqual([]);
        expect(not_defined()).toEqual([]);
    });

    test.each([
        ["EV_ADD_COLUMN", {}],
        ["EV_DUPLICATE_COLUMN", {col: "id"}],
        ["EV_DELETE_COLUMN", {col: "id"}],
        ["EV_MOVE_COLUMN", {from: 0, to: 1}],
        ["EV_EXPORT", {}],
        ["EV_IMPORT", {}],
        ["EV_VALIDATE", {}],
        ["EV_CONFIRMED", {what: "column", topic: "users", col: "id"}],
    ])("%s runs it too, and writes nothing", (event, kw) => {
        const {editor, remote, host} = refused_load(`o2_${event}`, "db/users");
        kw = Object.assign({model_gen: editor.priv.model_gen}, kw);
        const before = modals.length;
        gobj_send_event(editor, event, kw, host);
        expect(modals.length).toBe(before);
        expect(take("update-node")).toEqual([]);
        expect(take("delete-node")).toEqual([]);
        expect(answer_the_load(editor, remote)).toBe(3);
        expect(errors()).toEqual([]);
        expect(not_defined()).toEqual([]);
    });

    test("a move goes where it was going, and reads the schemas there", () => {
        const {editor, remote, host} = refused_load("o3", "db/users");
        gobj_send_event(editor, "EV_BACK", {}, host);
        expect(gobj_current_state(editor)).toBe("ST_LOADING");
        expect(shown).toEqual([KEPT]);
        expect(answer_the_load(editor, remote)).toBe(3);
        expect(gobj_current_state(editor)).toBe("ST_TOPICS");
        expect(editor.priv.reload_on_open).toBe(false);
        expect(errors()).toEqual([]);
    });

    test("keeps what this session wrote", () => {
        const {editor, remote, host} = build("o4", "db/users");
        const w = start_a_write(editor, host, "name");
        answer(editor, remote, w, 0, {id: "db.users.name", value: "name", order: 2,
            type: "string", topics: ["topics^db.users^cols"]});
        expect(editor.priv.written).toEqual({"db.users": true});
        editor.priv.reload_on_open = true;      /*  as a refused load leaves it  */
        gobj_send_event(editor, "EV_ADD_COLUMN", {}, host);
        answer_the_load(editor, remote);
        expect(editor.priv.written).toEqual({"db.users": true});
    });
});

describe("the import plan", () => {

    const IMPORT = JSON.stringify({id: "db", topics: [{id: "users", pkey: "id", cols: [
        {id: "id", type: "string", flag: ["persistent", "required"]},
        {id: "email", type: "string"}
    ]}]});

    test("a load that could not be sent keeps it: the model it was planned on stays", () => {
        const {editor, remote, host} = build("i1", "db");
        gobj_send_event(editor, "EV_IMPORT", {}, host);
        const dialog = modals[modals.length - 1];
        gobj_send_event(editor, "EV_PREVIEW_IMPORT", {prune: false, text: IMPORT,
            model_gen: editor.priv.model_gen}, editor);
        const plan = editor.priv.import_plan;
        expect(plan.writes.length).toBeGreaterThan(0);

        gobj_change_state(remote, "ST_DISCONNECTED");
        gobj_send_event(editor, "EV_REFRESH", {}, host);
        expect(editor.priv.import_plan).toBe(plan);
        expect(dialog.$content.querySelector(".SCHEMA_IMPORT_RUN").disabled).toBe(false);
        expect(errors()).toEqual([]);
    });

    test("a Yes that finds it gone is a warning, and said -- not an ERROR", () => {
        const {editor, remote, host} = build("i2", "db");
        gobj_send_event(editor, "EV_CONFIRMED", {what: "import",
            model_gen: editor.priv.model_gen}, editor);
        expect(errors()).toEqual([]);
        expect(logged.some((l) => l.level === "warning" && /import plan is gone/.test(l.msg))).toBe(true);
        expect(shown).toEqual(["the import plan is gone: preview it again"]);
        expect(take("update-node")).toEqual([]);
    });
});

describe("a confirmation answered where no treedb is open", () => {

    test("after a reload that landed on zero treedbs: refused as stale, not NOT DEFINED", () => {
        const {editor, remote, host} = build("e1", "db/users");
        const kw = {what: "column", topic: "users", col: "id", model_gen: editor.priv.model_gen};
        gobj_send_event(editor, "EV_REFRESH", {}, host);
        answer_the_load_with(editor, remote, records_with((r) => {
            r.treedbs = [];
            r.topics = [];
            r.cols = [];
        }));
        expect(gobj_current_state(editor)).toBe("ST_EMPTY");
        gobj_send_event(editor, "EV_CONFIRMED", kw, editor);
        expect(not_defined()).toEqual([]);
        expect(errors()).toEqual([]);
        expect(shown).toEqual([STALE]);
        expect(take("delete-node")).toEqual([]);
    });

    test("with no model at all (ST_IDLE): refused and said", () => {
        const remote = gobj_create_service("e2_remote", "C_TEST_REMOTE", {}, yuno);
        gobj_change_state(remote, "ST_SESSION");
        const host = gobj_create("e2_host", "C_TEST_EDITOR_HOST", {}, yuno);
        const editor = gobj_create("e2_editor", "C_YUI_SCHEMA_EDITOR", {
            gobj_remote_yuno: remote, treedb_name: "treedb_system_schema"
        }, host);
        gobj_start(editor);
        for(const c of take("nodes")) {
            answer(editor, remote, c, -1, null, "deadline");
        }
        expect(gobj_current_state(editor)).toBe("ST_IDLE");
        gobj_send_event(editor, "EV_CONFIRMED", {what: "column", topic: "users", col: "id",
            model_gen: editor.priv.model_gen - 1}, editor);
        gobj_send_event(editor, "EV_CONFIRMED", {what: "column", topic: "users", col: "id",
            model_gen: editor.priv.model_gen}, editor);
        expect(not_defined()).toEqual([]);
        expect(errors()).toEqual([]);
        expect(shown).toEqual([STALE, STALE]);
    });
});

describe("the answers of the editor's confirmations are i18n keys", () => {

    /*  shell_modals names each answer by its label; its defaults ("Delete",
     *  "Cancel") are not lower-case, so no validated locale holds them and
     *  the buttons -- and now their title and aria-label -- read English in
     *  every language (seen on the deployed agent console, in Spanish).  */
    test("a column delete asks with `delete` / `cancel`", () => {
        const {editor, remote, host} = build("k1", "db/users");
        gobj_send_event(editor, "EV_DELETE_COLUMN", {col: "id"}, host);
        expect(confirms.length).toBe(1);
        expect([confirms[0].opts.confirm_label, confirms[0].opts.cancel_label])
            .toEqual(["delete", "cancel"]);
    });
});

describe("the owed reload, settled wherever a load lands", () => {

    function refused_load(name, subpath)
    {
        const built = build(name, subpath);
        gobj_send_event(built.editor, "EV_REFRESH", {}, built.host);
        const asked = take("nodes");
        answer(built.editor, built.remote, asked[0], -1, null, "deadline");
        answer(built.editor, built.remote, asked[1], 0, RECORDS[asked[1].kw.topic_name]);
        answer(built.editor, built.remote, asked[2], 0, RECORDS[asked[2].kw.topic_name]);
        expect(built.editor.priv.reload_on_open).toBe(true);
        expect(shown).toEqual([KEPT]);
        return built;
    }

    test("the operator's Refresh that lands pays it: the next edit opens its form", () => {
        const {editor, remote, host} = refused_load("q1", "db/users");
        gobj_send_event(editor, "EV_REFRESH", {}, host);
        expect(answer_the_load(editor, remote)).toBe(3);
        expect(gobj_current_state(editor)).toBe("ST_COLUMNS");
        expect(editor.priv.reload_on_open).toBe(false);

        const before = modals.length;
        gobj_send_event(editor, "EV_EDIT_COLUMN", {col: "id"}, host);
        expect(modals.length).toBe(before + 1);
        expect(take("nodes")).toEqual([]);
        expect(shown).toEqual([KEPT]);
        expect(errors()).toEqual([]);
        expect(not_defined()).toEqual([]);
    });

    test("the reload of a late write that lands pays it too", () => {
        const {editor, remote, host} = build("q2", "db/users");
        const w = start_a_write(editor, host, "name");
        drop(editor, remote, host);
        reconnect(editor, remote, host);
        expect(answer_the_load(editor, remote)).toBe(3);

        gobj_send_event(editor, "EV_REFRESH", {}, host);
        const asked = take("nodes");
        answer(editor, remote, asked[0], -1, null, "deadline");
        answer(editor, remote, asked[1], 0, RECORDS[asked[1].kw.topic_name]);
        answer(editor, remote, asked[2], 0, RECORDS[asked[2].kw.topic_name]);
        expect(editor.priv.reload_on_open).toBe(true);

        /*  The write given up answers DONE: the model is read again.  */
        answer(editor, remote, w, 0, {id: "db.users.name", value: "name", type: "string",
            order: 2, topics: [{id: "db.users", topic_name: "topics", hook_name: "cols"}]});
        expect(gobj_current_state(editor)).toBe("ST_LOADING");
        expect(answer_the_load(editor, remote)).toBe(3);
        expect(editor.priv.reload_on_open).toBe(false);

        const before = modals.length;
        gobj_send_event(editor, "EV_EDIT_COLUMN", {col: "id"}, host);
        expect(modals.length).toBe(before + 1);
        expect(take("nodes")).toEqual([]);
        expect(errors()).toEqual([]);
    });

    test("a move sent by the HOST (a url, the browser's Back) runs it, as the editor's own moves do", () => {
        const {editor, remote, host} = refused_load("q3", "db/users");
        gobj_send_event(editor, "EV_SHOW", {subpath: "db"}, host);
        expect(gobj_current_state(editor)).toBe("ST_LOADING");
        expect(editor.priv.reload_on_open).toBe(false);
        expect(shown).toEqual([KEPT]);      /*  a move is not refused  */
        expect(answer_the_load(editor, remote)).toBe(3);
        expect(gobj_current_state(editor)).toBe("ST_TOPICS");
        expect(errors()).toEqual([]);
        expect(not_defined()).toEqual([]);
    });

    test("a host EV_SHOW with nothing owed asks for nothing", () => {
        const {editor, remote, host} = build("q4", "db/users");
        gobj_send_event(editor, "EV_SHOW", {subpath: "db"}, host);
        expect(gobj_current_state(editor)).toBe("ST_TOPICS");
        expect(take("nodes")).toEqual([]);
    });
});

describe("the import plan outlives a load that fails", () => {

    const IMPORT = JSON.stringify({id: "db", topics: [{id: "users", pkey: "id", cols: [
        {id: "id", type: "string", flag: ["persistent", "required"]},
        {id: "email", type: "string"}
    ]}]});

    test("a load that LEFT and failed replaced nothing: the plan and its Import stay", () => {
        const {editor, remote, host} = build("m1", "db");
        gobj_send_event(editor, "EV_IMPORT", {}, host);
        const dialog = modals[modals.length - 1];
        gobj_send_event(editor, "EV_PREVIEW_IMPORT", {prune: false, text: IMPORT,
            model_gen: editor.priv.model_gen}, editor);
        const plan = editor.priv.import_plan;
        expect(plan.writes.length).toBeGreaterThan(0);

        gobj_send_event(editor, "EV_REFRESH", {}, host);
        const asked = take("nodes");
        answer(editor, remote, asked[0], -1, null, "deadline");
        answer(editor, remote, asked[1], 0, RECORDS[asked[1].kw.topic_name]);
        answer(editor, remote, asked[2], 0, RECORDS[asked[2].kw.topic_name]);

        expect(dialog.closed).toBe(false);
        expect(editor.priv.import_plan).toBe(plan);
        expect(dialog.$content.querySelector(".SCHEMA_IMPORT_RUN").disabled).toBe(false);
        expect(dialog.$content.querySelector(".SCHEMA_IMPORT_PLAN").childNodes.length)
            .toBeGreaterThan(0);
        expect(errors()).toEqual([]);
    });

    test("a load that LANDS forgets it, and closes the dialog it was shown in", () => {
        const {editor, remote, host} = build("m2", "db");
        gobj_send_event(editor, "EV_IMPORT", {}, host);
        const dialog = modals[modals.length - 1];
        gobj_send_event(editor, "EV_PREVIEW_IMPORT", {prune: false, text: IMPORT,
            model_gen: editor.priv.model_gen}, editor);
        expect(editor.priv.import_plan).toBeTruthy();

        gobj_send_event(editor, "EV_REFRESH", {}, host);
        expect(editor.priv.import_plan).toBeTruthy();   /*  in the air: nothing replaced yet  */
        expect(answer_the_load(editor, remote)).toBe(3);
        expect(editor.priv.import_plan).toBe(null);
        expect(dialog.closed).toBe(true);
        expect(shown).toEqual([STALE]);
        expect(errors()).toEqual([]);
    });
});

describe("the export's two views go through the machine", () => {

    test("a click on a view is an event, and the action switches the text", () => {
        const {editor, remote, host} = build("y1", "db");
        gobj_send_event(editor, "EV_EXPORT", {}, host);
        const $content = modals[modals.length - 1].$content;
        const $tabs = [...$content.querySelectorAll(".SCHEMA_EXPORT_TAB")];
        const $text = $content.querySelector(".SCHEMA_EXPORT_TEXT");

        gobj_set_gobj_trace(editor, "machine", true);
        try {
            $tabs[1].click();
        } finally {
            gobj_set_gobj_trace(editor, "machine", false);
        }
        expect(logged.some((l) => /EV_EXPORT_VIEW/.test(l.msg))).toBe(true);
        expect($text.value.trim().startsWith("{")).toBe(true);
        expect($tabs.map(($b) => $b.getAttribute("aria-pressed"))).toEqual(["false", "true"]);
        expect($tabs.map(($b) => $b.classList.contains("selected_state"))).toEqual([false, true]);

        gobj_send_event(editor, "EV_EXPORT_VIEW", {pane: "c"}, editor);
        expect($text.value.trim().startsWith("{")).toBe(false);
        expect($tabs.map(($b) => $b.getAttribute("aria-pressed"))).toEqual(["true", "false"]);
        expect(errors()).toEqual([]);
        expect(not_defined()).toEqual([]);
    });

    test("answered while a load is in the air, where the dialog is still up", () => {
        const {editor, remote, host} = build("y2", "db");
        gobj_send_event(editor, "EV_EXPORT", {}, host);
        const $content = modals[modals.length - 1].$content;
        gobj_send_event(editor, "EV_REFRESH", {}, host);
        expect(gobj_current_state(editor)).toBe("ST_LOADING");
        $content.querySelectorAll(".SCHEMA_EXPORT_TAB")[1].click();
        expect($content.querySelector(".SCHEMA_EXPORT_TEXT").value.trim().startsWith("{")).toBe(true);
        expect(not_defined()).toEqual([]);
        expect(answer_the_load(editor, remote)).toBe(3);
        expect(errors()).toEqual([]);
    });

    test("a view that is not one, or no export open, is an ERROR, not a guess", () => {
        const {editor, remote, host} = build("y3", "db");
        gobj_send_event(editor, "EV_EXPORT_VIEW", {pane: "c"}, editor);
        gobj_send_event(editor, "EV_EXPORT", {}, host);
        gobj_send_event(editor, "EV_EXPORT_VIEW", {pane: "yaml"}, editor);
        expect(errors().length).toBe(2);
    });
});

describe("a move sent by the host while a dialog is up", () => {

    /*  C_YUI_SHELL keeps the overlays open on a move that changes only
     *  the subpath (a url typed in, a link). The dialog of the screen the
     *  editor left sends what only that screen declares.  */
    const MOVED = "the view moved: open the dialog again";

    const IMPORT = JSON.stringify({id: "db", topics: [{id: "users", pkey: "id", cols: [
        {id: "id", type: "string", flag: ["persistent", "required"]},
        {id: "email", type: "string"}
    ]}]});

    function settle()
    {
        return new Promise((resolve) => {
            setTimeout(resolve, 0);
        });
    }

    test("a column form: closed and said, not left to answer NOT DEFINED", () => {
        const {editor, remote, host} = build("mv1", "db/users");
        gobj_send_event(editor, "EV_EDIT_COLUMN", {col: "id"}, host);
        const form = modals[modals.length - 1];
        expect(form.closed).toBe(false);

        gobj_send_event(editor, "EV_SHOW", {subpath: "db"}, host);
        expect(gobj_current_state(editor)).toBe("ST_TOPICS");
        expect(form.closed).toBe(true);
        expect(editor.priv.dialog).toBe(null);
        expect(shown).toEqual([MOVED]);
        expect(not_defined()).toEqual([]);
        expect(errors()).toEqual([]);
        expect(commands).toEqual([]);
    });

    test("the import dialog: closed, and its plan forgotten", () => {
        const {editor, remote, host} = build("mv2", "db");
        gobj_send_event(editor, "EV_IMPORT", {}, host);
        const dialog = modals[modals.length - 1];
        gobj_send_event(editor, "EV_PREVIEW_IMPORT", {prune: false, text: IMPORT,
            model_gen: editor.priv.model_gen}, editor);
        expect(editor.priv.import_plan).not.toBe(null);

        gobj_send_event(editor, "EV_SHOW", {subpath: ""}, host);
        expect(gobj_current_state(editor)).toBe("ST_TREEDBS");
        expect(dialog.closed).toBe(true);
        expect(editor.priv.import_plan).toBe(null);
        expect(shown).toEqual([MOVED]);
        expect(not_defined()).toEqual([]);
        expect(errors()).toEqual([]);
    });

    test("a move that arrives during a load that fails: the same, when it is applied", () => {
        const {editor, remote, host} = build("mv3", "db/users");
        gobj_send_event(editor, "EV_EDIT_COLUMN", {col: "id"}, host);
        const form = modals[modals.length - 1];
        gobj_send_event(editor, "EV_REFRESH", {}, host);
        gobj_send_event(editor, "EV_SHOW", {subpath: "db"}, host);
        expect(form.closed).toBe(false);
        for(const c of take("nodes")) {
            answer(editor, remote, c, -1, null, "deadline");
        }
        expect(gobj_current_state(editor)).toBe("ST_TOPICS");
        expect(form.closed).toBe(true);
        expect(shown).toEqual([KEPT, MOVED]);
        expect(not_defined()).toEqual([]);
    });

    test("the same position sent again leaves the dialog alone", () => {
        const {editor, remote, host} = build("mv4", "db/users");
        gobj_send_event(editor, "EV_EDIT_COLUMN", {col: "id"}, host);
        const form = modals[modals.length - 1];
        gobj_send_event(editor, "EV_SHOW", {subpath: "db/users"}, host);
        expect(form.closed).toBe(false);
        expect(shown).toEqual([]);
    });

    test("the export and the check read nothing of the screen: they stay up", () => {
        const {editor, remote, host} = build("mv5", "db");
        gobj_send_event(editor, "EV_EXPORT", {}, host);
        const exported = modals[modals.length - 1];
        gobj_send_event(editor, "EV_SHOW", {subpath: ""}, host);
        expect(exported.closed).toBe(false);
        exported.$content.querySelectorAll(".SCHEMA_EXPORT_TAB")[1].click();
        expect(exported.$content.querySelector(".SCHEMA_EXPORT_TEXT").value.trim()
            .startsWith("{")).toBe(true);

        gobj_send_event(editor, "EV_SHOW", {subpath: "db"}, host);
        gobj_send_event(editor, "EV_VALIDATE", {}, host);
        const report = modals[modals.length - 1];
        gobj_send_event(editor, "EV_SHOW", {subpath: "db/users"}, host);
        expect(report.closed).toBe(false);
        expect(shown).toEqual([]);
        expect(not_defined()).toEqual([]);
        expect(errors()).toEqual([]);
    });

    test("a confirmation answered after a move to another treedb deletes nothing", async () => {
        const {editor, remote, host} = build("mv6", "db/users");
        gobj_send_event(editor, "EV_REFRESH", {}, host);
        answer_the_load_with(editor, remote, records_with((r) => {
            r.treedbs.push({id: "db2", schema_version: 1});
            r.topics.push({id: "db2.users", value: "users", order: 1, pkey: "id",
                topic_version: 1, treedbs: ["treedbs^db2^topics"]});
            r.cols.push({id: "db2.users.id", value: "id", order: 1, type: "string",
                flag: ["persistent", "required"], topics: ["topics^db2.users^cols"]});
        }));
        expect(gobj_current_state(editor)).toBe("ST_COLUMNS");

        gobj_send_event(editor, "EV_DELETE_COLUMN", {col: "id"}, host);
        expect(confirms.length).toBe(1);
        gobj_send_event(editor, "EV_SHOW", {subpath: "db2/users"}, host);
        expect(gobj_current_state(editor)).toBe("ST_COLUMNS");
        confirms[0].resolve(true);
        await settle();

        expect(take("delete-node")).toEqual([]);
        expect(commands).toEqual([]);
        expect(shown).toEqual([MOVED]);
        expect(errors()).toEqual([]);
    });

    test("a confirmation answered on the screen it was asked from still runs", async () => {
        const {editor, remote, host} = build("mv7", "db/users");
        gobj_send_event(editor, "EV_DELETE_COLUMN", {col: "id"}, host);
        confirms[0].resolve(true);
        await settle();
        expect(take("delete-node").length).toBe(1);
        expect(shown).toEqual([]);
    });
});

describe("the form opened again after the owed reload", () => {

    function owing(name, subpath)
    {
        const built = build(name, subpath);
        built.editor.priv.reload_on_open = true;    /*  as a load refused in session leaves it  */
        return built;
    }

    test("only what was CHANGED is carried: a field the store changed meanwhile shows the store's", () => {
        const {editor, remote, host} = build("ro6", "db/users");
        gobj_send_event(editor, "EV_EDIT_COLUMN", {col: "id"}, host);
        editor.priv.reload_on_open = true;
        const form = modals[modals.length - 1];
        form.$content.querySelector('[data-name="header"]').value = "Identifier";
        form.$content.querySelector(".SCHEMA_COL_FORM_SAVE").click();
        answer_the_load_with(editor, remote, records_with((r) => {
            r.cols[0].description = "written by somebody else";
        }));
        const again = modals[modals.length - 1];
        expect(again.$content.querySelector('[data-name="header"]').value).toBe("Identifier");
        expect(again.$content.querySelector('[data-name="description"]').value)
            .toBe("written by somebody else");
        again.$content.querySelector(".SCHEMA_COL_FORM_SAVE").click();
        const [write] = take("update-node");
        expect(write.kw.record.description).toBe("written by somebody else");
        expect(write.kw.record.header).toBe("Identifier");
        expect(errors()).toEqual([]);
    });

    test("a NEW column comes back whole: its name, its type and its flags", () => {
        const {editor, remote, host} = owing("ro2", "db/users");
        /*  The owed reload runs on the form's opening too: open it on a
         *  model that is current, then owe the reload.  */
        editor.priv.reload_on_open = false;
        gobj_send_event(editor, "EV_ADD_COLUMN", {}, host);
        editor.priv.reload_on_open = true;
        const form = modals[modals.length - 1];
        form.$content.querySelector('[data-name="value"]').value = "email";
        form.$content.querySelector('[data-name="header"]').value = "Email";
        for(const $box of form.$content.querySelectorAll(".SCHEMA_FLAG_BOX")) {
            if($box.dataset.flag === "required") {
                $box.checked = true;
            }
        }
        form.$content.querySelector(".SCHEMA_COL_FORM_SAVE").click();
        expect(shown).toEqual([OWED_FORM]);
        answer_the_load(editor, remote);
        const again = modals[modals.length - 1];
        expect(again).not.toBe(form);
        expect(again.$content.querySelector('[data-name="value"]').value).toBe("email");
        expect(again.$content.querySelector('[data-name="header"]').value).toBe("Email");
        const on = [...again.$content.querySelectorAll(".SCHEMA_FLAG_BOX")]
            .filter(($b) => $b.checked).map(($b) => $b.dataset.flag);
        expect(on).toContain("required");
        expect(errors()).toEqual([]);
    });

    test("a topic form comes back the same way", () => {
        const {editor, remote, host} = build("ro3", "db");
        gobj_send_event(editor, "EV_EDIT_TOPIC", {topic: "users"}, host);
        editor.priv.reload_on_open = true;
        const form = modals[modals.length - 1];
        form.$content.querySelector('[data-name="tkey"]').value = "tm";
        form.$content.querySelector(".SCHEMA_TOPIC_FORM_SAVE").click();
        expect(shown).toEqual([OWED_FORM]);
        answer_the_load(editor, remote);
        const again = modals[modals.length - 1];
        expect(again).not.toBe(form);
        expect(again.$content.querySelector('[data-name="tkey"]').value).toBe("tm");
        expect(errors()).toEqual([]);
    });

    test("what the form edited is gone after the reload: not opened again, and SAID", () => {
        const {editor, remote, host} = build("ro4", "db/users");
        gobj_send_event(editor, "EV_EDIT_COLUMN", {col: "id"}, host);
        editor.priv.reload_on_open = true;
        const form = modals[modals.length - 1];
        form.$content.querySelector(".SCHEMA_COL_FORM_SAVE").click();
        const before = modals.length;
        answer_the_load_with(editor, remote, records_with((r) => {
            r.cols = [];
        }));
        expect(form.closed).toBe(true);
        expect(modals.length).toBe(before);
        expect(shown).toEqual([OWED_FORM, GONE]);
        expect(errors()).toEqual([]);
    });

    test("a form closed by the operator while the reload ran is not opened again", () => {
        const {editor, remote, host} = build("ro5", "db/users");
        gobj_send_event(editor, "EV_EDIT_COLUMN", {col: "id"}, host);
        editor.priv.reload_on_open = true;
        const form = modals[modals.length - 1];
        form.$content.querySelector(".SCHEMA_COL_FORM_SAVE").click();
        form.$content.querySelector(".SCHEMA_COL_FORM_CANCEL").click();
        const before = modals.length;
        answer_the_load(editor, remote);
        expect(modals.length).toBe(before);
        expect(shown).toEqual([OWED_FORM]);
        expect(errors()).toEqual([]);
    });
});

describe("EV_REFRESH while a write is in flight", () => {

    test("waits for the end of the writes: the queue is written whole, then the schemas are read", () => {
        const {editor, remote, host} = build("rq1", "db");
        gobj_send_event(editor, "EV_CONFIRMED", {what: "topic", topic: "users",
            model_gen: editor.priv.model_gen}, editor);
        expect(gobj_current_state(editor)).toBe("ST_SAVING");
        const [first] = take("delete-node");
        expect(first.kw.topic_name).toBe("cols");

        gobj_send_event(editor, "EV_REFRESH", {}, host);
        expect(gobj_current_state(editor)).toBe("ST_SAVING");
        expect(take("nodes")).toEqual([]);
        expect(logged.some((l) => l.level === "warning" &&
            /EV_REFRESH.*when the writes end/.test(l.msg))).toBe(true);

        answer(editor, remote, first, 0, {});
        const [second] = take("delete-node");
        expect(second.kw.topic_name).toBe("topics");
        answer(editor, remote, second, 0, {});

        expect(gobj_current_state(editor)).toBe("ST_LOADING");
        expect(answer_the_load(editor, remote)).toBe(3);
        expect(editor.priv.written).toEqual({});
        expect(errors()).toEqual([]);
        expect(not_defined()).toEqual([]);
    });
});

describe("the body while a write is in flight", () => {

    /*  pointer-events stops the mouse and nothing else: the shell's
     *  focus trap puts the focus back on the row control that had it,
     *  and Delete or Enter there sent an action ST_SAVING does not
     *  declare. `inert` takes the body out of the keyboard's reach too.  */
    test("is inert, and answers again when the write ends", () => {
        const {editor, remote, host} = build("r16k1", "db/users");
        const $body = $in(editor, ".SCHEMA_BODY");
        expect($body.hasAttribute("inert")).toBe(false);

        const write = start_a_write(editor, host, "name");
        expect($body.hasAttribute("inert")).toBe(true);

        answer(editor, remote, write, 0, write.kw.record);
        expect(gobj_current_state(editor)).toBe("ST_COLUMNS");
        expect($in(editor, ".SCHEMA_BODY").hasAttribute("inert")).toBe(false);
        expect(errors()).toEqual([]);
    });

    test("a drop that ends the write gives the body back too", () => {
        const {editor, remote, host} = build("r16k2", "db/users");
        start_a_write(editor, host, "name");
        drop(editor, remote, host);
        expect($in(editor, ".SCHEMA_BODY").hasAttribute("inert")).toBe(false);
    });
});

describe("the writes of an import mark the topic they write", () => {

    /*  An import that adds a topic, `roles`.  */
    const IMPORT = JSON.stringify({id: "db", topics: [
        {id: "users", pkey: "id", cols: [
            {id: "id", type: "string", flag: ["persistent", "required"]}
        ]},
        {id: "roles", pkey: "id", cols: [
            {id: "id", type: "string", flag: ["persistent", "required"]}
        ]}
    ]});

    /*  The record as the store answers it: with the id it gave a new
     *  one, and its fkeys in list_dict.  */
    function as_the_store_answers(write)
    {
        const record = JSON.parse(JSON.stringify(write.kw.record));
        const to_dict = (refs) => refs.map((ref) => {
            const [topic_name, id, hook_name] = ref.split("^");
            return {topic_name, id, hook_name};
        });
        if(write.kw.topic_name === "topics") {
            record.id = record.id || `db.${record.value}`;
            record.treedbs = to_dict(record.treedbs || []);
        }
        if(write.kw.topic_name === "cols") {
            record.id = record.id || `${record.topics[0].split("^")[1]}.${record.value}`;
            record.topics = to_dict(record.topics || []);
        }
        return record;
    }

    function run_the_import(editor, host)
    {
        gobj_send_event(editor, "EV_IMPORT", {}, host);
        gobj_send_event(editor, "EV_PREVIEW_IMPORT", {prune: false, text: IMPORT,
            model_gen: editor.priv.model_gen}, editor);
        expect(editor.priv.import_plan.writes.length).toBeGreaterThan(0);
        gobj_send_event(editor, "EV_APPLY_IMPORT", {model_gen: editor.priv.model_gen}, editor);
        expect(gobj_current_state(editor)).toBe("ST_SAVING");
    }

    function answer_every_write(editor, remote)
    {
        for(let i = 0; i < 10; i++) {
            const [write] = take("update-node");
            if(!write) {
                break;
            }
            answer(editor, remote, write, 0, as_the_store_answers(write));
        }
    }

    test("from another topic's screen: the topic it wrote, not the one on screen", () => {
        const {editor, remote, host} = build("r16m1", "db/users");
        run_the_import(editor, host);
        answer_every_write(editor, remote);
        expect(gobj_current_state(editor)).toBe("ST_COLUMNS");
        expect(editor.priv.written).toEqual({"db.roles": true});
        expect(errors()).toEqual([]);
    });

    test("from the topics screen, where no topic is on screen", () => {
        const {editor, remote, host} = build("r16m2", "db");
        run_the_import(editor, host);
        answer_every_write(editor, remote);
        expect(gobj_current_state(editor)).toBe("ST_TOPICS");
        expect(editor.priv.written).toEqual({"db.roles": true});
        expect(errors()).toEqual([]);
    });

    test("a column answered with no record: the record it queued says the topic", () => {
        const {editor, remote, host} = build("r16m3", "db/users");
        run_the_import(editor, host);
        const [topic] = take("update-node");
        expect(topic.kw.topic_name).toBe("topics");
        answer(editor, remote, topic, 0, as_the_store_answers(topic));
        const [col] = take("update-node");
        expect(col.kw.topic_name).toBe("cols");
        answer(editor, remote, col, 0, null);
        expect(editor.priv.written).toEqual({"db.roles": true});
    });
});

describe("the reason a load failed", () => {

    test("is a key the notice translates, not a string frozen in one language", () => {
        const remote = gobj_create_service("r16e1_remote", "C_TEST_REMOTE", {}, yuno);
        gobj_change_state(remote, "ST_SESSION");
        const host = gobj_create("r16e1_host", "C_TEST_EDITOR_HOST", {}, yuno);
        const editor = gobj_create("r16e1_editor", "C_YUI_SCHEMA_EDITOR", {
            gobj_remote_yuno: remote, treedb_name: "treedb_system_schema"
        }, host);
        gobj_start(editor);
        for(const c of take("nodes")) {
            answer(editor, remote, c, -1, null, "");
        }
        expect(gobj_current_state(editor)).toBe("ST_IDLE");
        expect(editor.priv.load_error).toBe("cannot load the schemas");
        /*  The notice already says it: no detail repeating the title.  */
        expect($in(editor, ".SCHEMA_NOTICE_DETAIL")).toBe(null);
    });

    test("the backend's own words travel as its key", () => {
        const remote = gobj_create_service("r16e2_remote", "C_TEST_REMOTE", {}, yuno);
        gobj_change_state(remote, "ST_SESSION");
        const host = gobj_create("r16e2_host", "C_TEST_EDITOR_HOST", {}, yuno);
        const editor = gobj_create("r16e2_editor", "C_YUI_SCHEMA_EDITOR", {
            gobj_remote_yuno: remote, treedb_name: "treedb_system_schema"
        }, host);
        gobj_start(editor);
        for(const c of take("nodes")) {
            answer(editor, remote, c, -1, null, "treedb not found");
        }
        const $detail = $in(editor, ".SCHEMA_NOTICE_DETAIL");
        expect($detail.getAttribute("data-i18n")).toBe("treedb not found");
    });

    test("a load that cannot leave keeps its key", () => {
        const remote = gobj_create_service("r16e3_remote", "C_TEST_REMOTE", {}, yuno);
        const host = gobj_create("r16e3_host", "C_TEST_EDITOR_HOST", {}, yuno);
        const editor = gobj_create("r16e3_editor", "C_YUI_SCHEMA_EDITOR", {
            gobj_remote_yuno: remote, treedb_name: "treedb_system_schema"
        }, host);
        gobj_start(editor);
        gobj_change_state(remote, "ST_DISCONNECTED");
        gobj_send_event(editor, "EV_REFRESH", {}, host);
        expect(editor.priv.load_error).toBe("cannot reach the treedb");
        const $detail = $in(editor, ".SCHEMA_NOTICE_DETAIL");
        expect($detail.getAttribute("data-i18n")).toBe("cannot reach the treedb");
    });
});
