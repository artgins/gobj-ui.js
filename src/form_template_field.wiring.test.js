/***********************************************************************
 *          form_template_field.wiring.test.js
 *
 *      A `template` field of a C_YUI_FORM in 'exec' mode is a sub-form
 *      (a <fieldset>): a NODE of the record, whose value is the dict its
 *      own fields fill. From 7.26.8 to 7.26.32 the node went through the
 *      json conversion, which handed its null on: the fields below found
 *      no dict to write into (kw_set_dict_value() refuses a null segment)
 *      and the save stored the node as null -- the alarm colours of a
 *      device in estadodelaire, wiped by every save of its settings.
 *      Driven through the real gclass on a document double, with the
 *      template of those settings.
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

const saved = [];
const logged = [];
let yuno = null;

/*  The settings template of an estadodelaire device type, cut down to
 *  the sub-form and one field beside it.  */
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

beforeAll(async () => {
    const i18next = (await import("i18next")).default;
    await i18next.init({lng: "en", resources: {}});
    gobj_start_up(null, null, null, null, null, null, null);
    set_log_callback((level, msg) => {
        logged.push({level: String(level), msg: String(msg)});
    });
    gclass_create("C_TEST_FORM_HOST", [], [["ST_IDLE", []]], {}, 0, [SDATA_END()], {}, 0, 0, 0, 0);
    gclass_create(
        "C_TEST_FORM_APP",
        [["EV_SAVE_RECORD", 0], ["EV_RECORD_CHANGED", 0]],
        [["ST_IDLE", [
            ["EV_SAVE_RECORD", (gobj, event, kw) => {
                saved.push(kw);
                return 0;
            }, null],
            ["EV_RECORD_CHANGED", () => 0, null],
        ]]],
        {}, 0, [SDATA_END()], {}, 0, 0, 0, 0
    );
    register_c_yui_form();
    yuno = gobj_create_yuno("form_template_yuno", "C_TEST_FORM_HOST", {});
    gobj_start(yuno);
});

beforeEach(() => {
    saved.length = 0;
    logged.length = 0;
});

let seq = 0;

function build(record)
{
    const app = gobj_create_pure_child(`tapp${++seq}`, "C_TEST_FORM_APP", {}, yuno);
    gobj_start(app);
    const form = gobj_create_pure_child(`tform${seq}`, "C_YUI_FORM", {
        template: TEMPLATE,
        record: record,
        editable: true,
    }, app);
    gobj_start(form);
    const $c = gobj_read_attr(form, "$container");
    expect($c.querySelector("fieldset")).toBeTruthy();     // exec mode: a sub-form
    return form;
}

function errors()
{
    return logged.filter(l => /error/i.test(l.level) || /ERROR/.test(l.msg));
}

describe("a template field in exec mode (a sub-form)", () => {
    test("is saved as the dict its fields fill", () => {
        const form = build({
            template_version: 7,
            alarm_colors: {
                active_not_validated: "#ff0000",
                active_validated: "#e5a50a",
                not_active_not_validated: "#ff00ff"
            }
        });
        gobj_send_event(form, "EV_SAVE_RECORD", {}, form);
        expect(saved.length).toBe(1);
        expect(saved[0].alarm_colors).toEqual({
            active_not_validated: "#ff0000",
            active_validated: "#e5a50a",
            not_active_not_validated: "#ff00ff"
        });
        expect(saved[0].template_version).toBe(7);
        expect(errors()).toEqual([]);
    });

    test("a colour cleared is black, and its readout says so", () => {
        const form = build({
            template_version: 7,
            alarm_colors: {
                active_not_validated: "#ff0000",
                active_validated: "#e5a50a",
                not_active_not_validated: "#ff00ff"
            }
        });
        const $c = gobj_read_attr(form, "$container");
        const $colors = $c.querySelectorAll("fieldset input");
        expect($colors.length).toBe(3);
        gobj_send_event(form, "EV_CLEAR_RECORD", {}, form);
        for(const $input of $colors) {
            /*  Never "": a colour input refuses it (Chrome warns).  */
            expect($input.value).toBe("#000000");
            expect($input.yui_color_value.textContent).toBe("#000000");
        }
        expect(errors()).toEqual([]);
    });

    test("left null by a save before the fix, comes back with its defaults", () => {
        const form = build({
            template_version: 7,
            alarm_colors: null
        });
        gobj_send_event(form, "EV_SAVE_RECORD", {}, form);
        expect(saved.length).toBe(1);
        expect(saved[0].alarm_colors).toEqual({
            active_not_validated: "red",
            active_validated: "#e5a50a",
            not_active_not_validated: "Fuchsia"
        });
        expect(errors()).toEqual([]);
    });
});
