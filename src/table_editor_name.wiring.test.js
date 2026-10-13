/***********************************************************************
 *          table_editor_name.wiring.test.js
 *
 *      The box Tabulator draws in a cell while it is edited had no
 *      name: no label, no aria-label, no title (REV-CLOUD V23.5.6, seen
 *      in the alarms of an estadodelaire device). Both tables of the
 *      library that edit in place -- a table field of C_YUI_FORM and
 *      the inline editing of C_YUI_TREEDB_TOPIC_WITH_FORM -- now name
 *      it after its column, asked at the moment of editing: Tabulator
 *      calls a function `editorParams` with the cell, and its built-in
 *      editors write the `elementAttributes` it answers.
 *
 *      Driven through the real gclasses on a document double, with a
 *      Tabulator double that keeps the settings it was built with.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {describe, test, expect, beforeAll, afterEach, vi} from "vitest";
import {install_dom_double} from "../test/dom_double.js";

install_dom_double();

if(typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    };
}

const tables = vi.hoisted(() => []);
vi.mock("tabulator-tables", () => {
    class FakeTabulator {
        constructor($el, settings) {
            this.$el = $el;
            this.element = $el;
            this.settings = settings;
            this.options = settings;
            this.externalEvents = {events: {}};
            this.initialized = true;
            tables.push(this);
            return new Proxy(this, {
                get(target, prop) {
                    if(prop in target) {
                        return target[prop];
                    }
                    return () => [];
                }
            });
        }
        on(ev, fn) {
            (this.externalEvents.events[ev] = this.externalEvents.events[ev] || []).push(fn);
        }
        off(ev) {
            delete this.externalEvents.events[ev];
        }
        getRows() {
            return [];
        }
        destroy() {
        }
    }
    return {TabulatorFull: FakeTabulator, Tabulator: FakeTabulator};
});

/*  No json field is opened here, but the form imports the editor.  */
vi.mock("vanilla-jsoneditor", () => ({
    createJSONEditor: () => ({
        get() {
            return {text: ""};
        },
        set() {},
        destroy() {},
    }),
}));

const {
    SDATA_END, gclass_create,
    gobj_start_up, gobj_create_yuno, gobj_create_pure_child, gobj_create_service,
    gobj_start, gobj_write_bool_attr,
} = await import("@yuneta/gobj-js");
const {register_c_yui_form} = await import("./c_yui_form.js");
const {register_c_yui_treedb_topic_with_form} = await import("./c_yui_treedb_topic_with_form.js");

let i18next = null;
let yuno = null;
let seq = 0;

beforeAll(async () => {
    i18next = (await import("i18next")).default;
    await i18next.init({
        lng: "en",
        resources: {
            en: {translation: {"threshold": "Threshold", "users.name": "User name"}},
            es: {translation: {"threshold": "Umbral", "users.name": "Nombre del usuario"}}
        }
    });
    gobj_start_up(null, null, null, null, null, null, null);
    gclass_create("C_TEST_EDITOR_HOST", [], [["ST_IDLE", []]], {}, 0, [SDATA_END()], {}, 0, 0, 0, 0);
    gclass_create(
        "C_TEST_EDITOR_APP",
        [["EV_RECORD_CHANGED", 0]],
        [["ST_IDLE", [["EV_RECORD_CHANGED", () => 0, null]]]],
        {}, 0, [SDATA_END()], {}, 0, 0, 0, 0
    );
    register_c_yui_form();
    register_c_yui_treedb_topic_with_form();
    yuno = gobj_create_yuno("editor_name_yuno", "C_TEST_EDITOR_HOST", {});
    gobj_start(yuno);
});

afterEach(async () => {
    tables.length = 0;
    await i18next.changeLanguage("en");
});

function column(table, field)
{
    return (table.settings.columns || []).find((c) => c.field === field);
}

/*  What Tabulator hands the editor when a cell of `col` starts editing.  */
function editor_params(col)
{
    return (typeof col.editorParams === "function")
        ? col.editorParams({getValue: () => ""})
        : (col.editorParams || {});
}

describe("a table field of C_YUI_FORM", () => {
    test("names the editor of an editable cell after its column, in the language of the moment", async () => {
        const app = gobj_create_pure_child(`eapp${++seq}`, "C_TEST_EDITOR_APP", {}, yuno);
        gobj_start(app);
        const form = gobj_create_pure_child(`eform${seq}`, "C_YUI_FORM", {
            template: {
                triggers: {
                    type: "array",
                    flag: ["persistent", "writable", "table"],
                    table: {
                        id:    {type: "string", flag: ["writable", "persistent", "required"]},
                        value: {type: "string", header: "threshold", flag: ["writable", "persistent"]},
                        note:  {type: "string", flag: ["persistent"]}      // not writable
                    }
                }
            },
            record: {triggers: []},
            editable: true,
        }, app);
        gobj_start(form);
        expect(tables.length).toBe(1);

        const value = column(tables[0], "value");
        expect(value.editor).toBe("input");
        expect(editor_params(value).elementAttributes).toEqual(
            {"aria-label": "Threshold", title: "Threshold"});

        await i18next.changeLanguage("es");
        expect(editor_params(value).elementAttributes).toEqual(
            {"aria-label": "Umbral", title: "Umbral"});

        /*  A column nobody edits has no editor to name: what params it
         *  had for one are left as they were.  */
        const note = column(tables[0], "note");
        expect(note.editor).toBe(undefined);
        expect(typeof note.editorParams).not.toBe("function");
    });
});

describe("the inline editing of C_YUI_TREEDB_TOPIC_WITH_FORM", () => {
    test("names the editor after the header's own cascade, in the language of the moment", async () => {
        const form = gobj_create_service(`etopic${++seq}`, "C_YUI_TREEDB_TOPIC_WITH_FORM", {
            treedb_name: "treedb_test",
            topic_name: "users",
            desc: {
                id: "users",
                pkey: "id",
                cols: [
                    {id: "id", header: "Id", type: "string", flag: ["persistent", "required"]},
                    {id: "name", header: "Name", type: "string", flag: ["persistent", "writable"]}
                ]
            }
        }, yuno);
        gobj_write_bool_attr(form, "editable", true);
        gobj_start(form);
        expect(tables.length > 0).toBe(true);
        const table = tables[tables.length - 1];

        const name = column(table, "name");
        expect(name.editor).toBe("input");
        expect(editor_params(name).elementAttributes).toEqual(
            {"aria-label": "User name", title: "User name"});

        await i18next.changeLanguage("es");
        expect(editor_params(name).elementAttributes).toEqual(
            {"aria-label": "Nombre del usuario", title: "Nombre del usuario"});

        /*  The pkey is never edited in place.  */
        expect(column(table, "id").editor).toBe(undefined);
    });
});
