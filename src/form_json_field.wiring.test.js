/***********************************************************************
 *          form_json_field.wiring.test.js
 *
 *      A C_YUI_FORM json field (a jsoneditor) whose TEXT does not parse
 *      was saved as `{}` or `[]`: validate_form() asked the browser
 *      (checkValidity) and the tables, and a jsoneditor is neither; the
 *      conversion then caught the parse error and stored the empty
 *      value. Driven through the real gclass on a document double, with
 *      the editor replaced by a double that answers what the real one
 *      answers in text mode.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {describe, test, expect, beforeAll, beforeEach, vi} from "vitest";
import {install_dom_double} from "../test/dom_double.js";

install_dom_double();

if(typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    };
}

/*  The editor: what the reader typed, in text mode.  */
const editors = vi.hoisted(() => []);
vi.mock("vanilla-jsoneditor", () => ({
    createJSONEditor: (opts) => {
        const ed = {
            content: {text: ""},
            props: opts.props,
            get() {
                return this.content;
            },
            set(content) {
                this.content = content;
            },
            destroy() {},
        };
        editors.push(ed);
        return ed;
    },
}));

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
    yuno = gobj_create_yuno("form_json_yuno", "C_TEST_FORM_HOST", {});
    gobj_start(yuno);
});

beforeEach(() => {
    saved.length = 0;
    logged.length = 0;
    editors.length = 0;
});

let seq = 0;

function build()
{
    const app = gobj_create_pure_child(`fapp${++seq}`, "C_TEST_FORM_APP", {}, yuno);
    gobj_start(app);
    const form = gobj_create_pure_child(`form${seq}`, "C_YUI_FORM", {
        template: [
            {id: "id", header: "id", type: "string", flag: ["persistent", "required"]},
            {id: "settings", header: "settings", type: "dict", flag: ["persistent", "writable"]},
        ],
        record: {id: "a", settings: {}},
        render_mode: "edit",
        editable: true,
    }, app);
    gobj_start(form);
    const $c = gobj_read_attr(form, "$container");
    const $editor = $c.querySelector(".jsoneditor");
    expect($editor).toBeTruthy();
    expect(editors.length).toBe(1);
    return {form, $editor, editor: editors[0]};
}

describe("a json field that does not parse", () => {
    test("is refused, marked, and nothing is saved", () => {
        const {form, $editor, editor} = build();
        editor.content = {text: '{"a": 1,}'};
        gobj_send_event(form, "EV_SAVE_RECORD", {}, form);
        expect(saved).toEqual([]);
        expect($editor.classList.contains("is-danger")).toBe(true);
        expect($editor.yui_json_error).toBe("invalid json");
    });

    test("is saved once it holds json again", () => {
        const {form, $editor, editor} = build();
        editor.content = {text: '[1]'};
        gobj_send_event(form, "EV_SAVE_RECORD", {}, form);
        expect(saved).toEqual([]);

        editor.content = {text: '{"a": 1}'};
        editor.props.onChange();
        expect($editor.classList.contains("is-danger")).toBe(false);
        gobj_send_event(form, "EV_SAVE_RECORD", {}, form);
        expect(saved.length).toBe(1);
        expect(saved[0].settings).toEqual({a: 1});     // parsed: the backend gets json, not text
    });
});
