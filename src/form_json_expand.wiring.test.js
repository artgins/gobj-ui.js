/***********************************************************************
 *          form_json_expand.wiring.test.js
 *
 *      C_YUI_TREEDB_TOPIC_WITH_FORM hosts C_YUI_JSON as a pure CHILD
 *      (the schema, a cell, the table's records), so it hears every
 *      event the viewer publishes -- and it did not declare
 *      EV_EXPAND_PATH, which the viewer publishes when the reader opens
 *      a `__collapsed__` sentinel. The click answered "Event NOT DEFINED
 *      in state" and the stub stayed on "loading" for good. The form
 *      cannot read a subtree (that is print-tranger, which the TOPICS
 *      view runs for its own viewer), so it says so, and the stub shows
 *      it.
 *
 *      Driven through the real gclasses (C_YUI_SHELL,
 *      C_YUI_TREEDB_TOPIC_WITH_FORM, C_YUI_JSON) on a document double:
 *      the event is published by the real viewer the form created.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {describe, test, expect, beforeAll, beforeEach} from "vitest";
import {install_dom_double} from "../test/dom_double.js";

install_dom_double();

/*  A phone: the viewer opens in the shell's sheet, not in a
 *  C_YUI_WINDOW, whose markup the document double cannot parse.  */
globalThis.innerWidth = 400;
if(globalThis.window) {
    globalThis.window.innerWidth = 400;
}

/*  Tabulator watches its table; the document double has no observer.  */
if(typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    };
}

const {
    SDATA_END, gclass_create,
    gobj_start_up, gobj_create_yuno, gobj_create, gobj_create_service,
    gobj_start, gobj_send_event, gobj_current_state,
    set_log_callback,
} = await import("@yuneta/gobj-js");
const {register_c_yui_shell} = await import("./c_yui_shell.js");
const {register_c_yui_json} = await import("./c_yui_json.js");
const {register_c_yui_treedb_topic_with_form} = await import("./c_yui_treedb_topic_with_form.js");

const logged = [];
let yuno = null;

beforeAll(async () => {
    /*  The app's i18next, with no locale: a key answers itself.  */
    const i18next = (await import("i18next")).default;
    await i18next.init({lng: "en", resources: {}});
    gobj_start_up(null, null, null, null, null, null, null);
    set_log_callback((level, msg) => {
        logged.push({level: String(level), msg: String(msg)});
    });
    gclass_create("C_TEST_HOST", [], [["ST_IDLE", []]], {}, 0, [SDATA_END()], {}, 0, 0, 0, 0);
    register_c_yui_shell();
    register_c_yui_json();
    register_c_yui_treedb_topic_with_form();
    yuno = gobj_create_yuno("form_json_yuno", "C_TEST_HOST", {});
    gobj_start(yuno);
});

beforeEach(() => {
    logged.length = 0;
});

const DESC = {
    id: "users",
    pkey: "id",
    cols: {
        id:   {id: "id", header: "Id", type: "string", flag: ["persistent", "required"]},
        name: {id: "name", header: "Name", type: "string", flag: ["persistent", "writable"]}
    }
};

function errors()
{
    return logged.filter((l) => l.level === "error").map((l) => l.msg);
}

describe("a viewer of the form asks to load a truncated part", () => {

    test("the form answers that it cannot, and the stub stops loading", () => {
        const app = gobj_create("f1_app", "C_TEST_HOST", {}, yuno);
        const shell = gobj_create("f1_shell", "C_YUI_SHELL",
            {config: {shell: {}}, default_route: "/home", subscriber: app}, app);
        gobj_start(shell);
        const form = gobj_create_service("f1_form", "C_YUI_TREEDB_TOPIC_WITH_FORM", {
            treedb_name: "treedb_test",
            topic_name: "users",
            desc: DESC
        }, shell);
        gobj_start(form);

        logged.length = 0;
        gobj_send_event(form, "EV_SHOW_SCHEMA", {}, form);
        const viewer = form.priv.schema_gobj;
        expect(viewer).toBeTruthy();
        expect(gobj_current_state(viewer)).toBe("ST_READY");
        logged.length = 0;

        /*  What the stub's click sends: the viewer then PUBLISHES
         *  EV_EXPAND_PATH to its host.  */
        gobj_send_event(viewer, "EV_EXPAND_COLLAPSED", {path: "cols`name", size: 40}, viewer);

        expect(viewer.priv.pending.has("cols`name")).toBe(false);
        expect(viewer.priv.errors.get("cols`name")).toBe("this part cannot be loaded here");
        /*  The viewer logs what it could not load; nothing else is.  */
        expect(errors()).toEqual([
            "C_YUI_JSON: subtree load failed at 'cols`name': this part cannot be loaded here"
        ]);
    });
});
