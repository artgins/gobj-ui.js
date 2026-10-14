/***********************************************************************
 *          form_close_asks_for_edits.wiring.test.js
 *
 *      Closing a C_YUI_FORM asks "all changes will be lost" only for what
 *      the READER changed. A field the record lacks is filled with its
 *      default when the record is loaded: the form then differs from what
 *      is stored, and its save lights (`changes`) -- but the reader did
 *      nothing, and the close asked all the same. In estadodelaire that
 *      was every device whose alarm colours a save had wiped (16 of 19),
 *      on every close of its settings. What the reader does -- types,
 *      clears, pastes -- is `edited`, and that is what the close asks
 *      about.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {describe, test, expect, beforeAll, beforeEach} from "vitest";
import {install_dom_double} from "../test/dom_double.js";

install_dom_double();

if(typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class {
        observe() {
        }
        unobserve() {
        }
        disconnect() {
        }
    };
}

const {
    SDATA_END, gclass_create,
    gobj_start_up, gobj_create_yuno, gobj_create_pure_child,
    gobj_start, gobj_send_event, gobj_read_attr,
    set_log_callback,
} = await import("@yuneta/gobj-js");
const {register_c_yui_form} = await import("./c_yui_form.js");

const logged = [];
let yuno = null;

/*  The settings template of an estadodelaire device type, cut down: a
 *  field with a default beside a sub-form of three.  */
const TEMPLATE = {
    template_version: {
        type: "integer",
        default: 7,
        flag: ["hidden", "persistent"]
    },
    alarm_colors: {
        type: "object",
        flag: ["writable", "persistent", "template"],
        template: {
            active_not_validated: {
                type: "string",
                default: "red",
                flag: ["writable", "persistent", "color"]
            },
            active_validated: {
                type: "string",
                default: "#e5a50a",
                flag: ["writable", "persistent", "color"]
            },
            not_active_not_validated: {
                type: "string",
                default: "Fuchsia",
                flag: ["writable", "persistent", "color"]
            }
        }
    }
};

const COMPLETE = {
    template_version: 7,
    alarm_colors: {
        active_not_validated: "#ff0000",
        active_validated: "#e5a50a",
        not_active_not_validated: "#ff00ff"
    }
};

beforeAll(async () => {
    const i18next = (await import("i18next")).default;
    await i18next.init({lng: "en", resources: {}});
    gobj_start_up(null, null, null, null, null, null, null);
    set_log_callback((level, msg) => {
        logged.push({level: String(level), msg: String(msg)});
    });
    gclass_create("C_TEST_CLOSE_HOST", [], [["ST_IDLE", []]], {}, 0, [SDATA_END()], {}, 0, 0, 0, 0);
    gclass_create(
        "C_TEST_CLOSE_APP",
        [["EV_SAVE_RECORD", 0]],
        [["ST_IDLE", [
            ["EV_SAVE_RECORD", () => 0, null],
        ]]],
        {}, 0, [SDATA_END()], {}, 0, 0, 0, 0
    );
    register_c_yui_form();
    yuno = gobj_create_yuno("form_close_yuno", "C_TEST_CLOSE_HOST", {});
    gobj_start(yuno);
});

beforeEach(() => {
    logged.length = 0;
});

let seq = 0;

function build(record)
{
    const app = gobj_create_pure_child(`capp${++seq}`, "C_TEST_CLOSE_APP", {}, yuno);
    gobj_start(app);
    const form = gobj_create_pure_child(`cform${seq}`, "C_YUI_FORM", {
        template: TEMPLATE,
        record: record,
        editable: true,
    }, app);
    gobj_start(form);
    return form;
}

/*  What a window or a sheet asks the form before it closes.  */
function close_asks(form)
{
    const kw = {abort_close: false};
    gobj_send_event(form, "EV_WINDOW_TO_CLOSE", kw, form);
    return kw.abort_close ? (kw.warning || "(no warning)") : "";
}

function errors()
{
    return logged.filter(l => /error/i.test(l.level) || /ERROR/.test(l.msg));
}

describe("the close of a form asks for what the reader changed", () => {
    test("a record that lacks a defaulted field opens changed, and closes without asking", () => {
        const form = build({template_version: 7, alarm_colors: null});
        expect(gobj_read_attr(form, "changes")).toBe(true);
        expect(gobj_read_attr(form, "edited")).toBe(false);
        expect(close_asks(form)).toBe("");
        expect(errors()).toEqual([]);
    });

    test("a change of the reader makes it ask", () => {
        const form = build(COMPLETE);
        expect(gobj_read_attr(form, "changes")).toBe(false);
        expect(close_asks(form)).toBe("");

        gobj_send_event(form, "EV_RECORD_CHANGED", {}, form);
        expect(gobj_read_attr(form, "changes")).toBe(true);
        expect(gobj_read_attr(form, "edited")).toBe(true);
        expect(close_asks(form)).toBe("all changes will be lost");
        expect(errors()).toEqual([]);
    });

    test("an undo, a save or a record loaded end what the close would lose", () => {
        const form = build(COMPLETE);

        gobj_send_event(form, "EV_RECORD_CHANGED", {}, form);
        gobj_send_event(form, "EV_UNDO_RECORD", {}, form);
        expect(gobj_read_attr(form, "edited")).toBe(false);
        expect(close_asks(form)).toBe("");

        gobj_send_event(form, "EV_RECORD_CHANGED", {}, form);
        gobj_send_event(form, "EV_SAVE_RECORD", {}, form);
        expect(gobj_read_attr(form, "edited")).toBe(false);
        expect(close_asks(form)).toBe("");

        gobj_send_event(form, "EV_RECORD_CHANGED", {}, form);
        gobj_send_event(form, "EV_LOAD_RECORD", {template_version: 7, alarm_colors: null}, form);
        expect(gobj_read_attr(form, "changes")).toBe(true);     // the defaults again
        expect(gobj_read_attr(form, "edited")).toBe(false);
        expect(close_asks(form)).toBe("");
        expect(errors()).toEqual([]);
    });

    test("clearing and pasting are changes of the reader", () => {
        const cleared = build(COMPLETE);
        gobj_send_event(cleared, "EV_CLEAR_RECORD", {}, cleared);
        expect(gobj_read_attr(cleared, "changes")).toBe(true);
        expect(gobj_read_attr(cleared, "edited")).toBe(true);
        expect(close_asks(cleared)).toBe("all changes will be lost");

        const pasted = build(COMPLETE);
        gobj_send_event(pasted, "EV_PASTE_RECORD", {record: {
            template_version: 7,
            alarm_colors: {
                active_not_validated: "#00ff00",
                active_validated: "#e5a50a",
                not_active_not_validated: "#ff00ff"
            }
        }}, pasted);
        expect(gobj_read_attr(pasted, "changes")).toBe(true);
        expect(gobj_read_attr(pasted, "edited")).toBe(true);
        expect(close_asks(pasted)).toBe("all changes will be lost");
        expect(errors()).toEqual([]);
    });
});
