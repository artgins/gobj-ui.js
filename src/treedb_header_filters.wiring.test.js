/***********************************************************************
 *          treedb_header_filters.wiring.test.js
 *
 *      Every column of data of C_YUI_TREEDB_TOPIC_WITH_FORM's table has
 *      a header filter (gobj-ui README, "Conventions" -> "A table: a
 *      filter on every column, the paginator always, the toolbar in one
 *      row"). Up to 7.32.3 a document (dict, list, blob, coordinates), a
 *      hook, a file and a time had none. A document is searched as its
 *      JSON text, a time as the date the cell shows.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {describe, test, expect, beforeAll, vi} from "vitest";
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

const tables = vi.hoisted(() => []);
vi.mock("tabulator-tables", () => {
    class FakeTabulator {
        constructor($el, settings) {
            this.element = $el;
            this.options = settings;
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
        on() {
        }
        off() {
        }
        destroy() {
        }
    }
    return {TabulatorFull: FakeTabulator, Tabulator: FakeTabulator};
});

const {
    SDATA_END, gclass_create, set_log_callback,
    gobj_start_up, gobj_create_yuno, gobj_create_service, gobj_start,
} = await import("@yuneta/gobj-js");
const {register_c_yui_treedb_topic_with_form} = await import("./c_yui_treedb_topic_with_form.js");

const logged = [];
let yuno = null;

beforeAll(async () => {
    const i18next = (await import("i18next")).default;
    await i18next.init({lng: "en", resources: {}});
    gobj_start_up(null, null, null, null, null, null, null);
    set_log_callback((level, msg) => {
        logged.push({level: String(level), msg: String(msg)});
    });
    gclass_create("C_TEST_FILTERS_HOST", [], [["ST_IDLE", []]], {}, 0, [SDATA_END()], {}, 0, 0, 0, 0);
    register_c_yui_treedb_topic_with_form();
    yuno = gobj_create_yuno("filters_yuno", "C_TEST_FILTERS_HOST", {});
    gobj_start(yuno);
});

describe("the header filters of a treedb topic's table", () => {
    test("a column of every kind of data has one", () => {
        const view = gobj_create_service("filters_view", "C_YUI_TREEDB_TOPIC_WITH_FORM", {
            treedb_name: "treedb_test",
            topic_name: "devices",
            desc: {id: "devices", pkey: "id", cols: [
                {id: "id", header: "Id", type: "string", flag: ["persistent", "required"]},
                {id: "settings", header: "settings", type: "dict", flag: ["persistent"]},
                {id: "notes", header: "notes", type: "array", flag: ["persistent"]},
                {id: "props", header: "props", type: "blob", flag: ["persistent"]},
                {id: "enabled", header: "enabled", type: "boolean", flag: ["persistent"]},
                {id: "updated", header: "updated", type: "integer", flag: ["persistent", "time"]}
            ]}
        }, yuno);
        gobj_start(view);
        const options = tables[tables.length - 1].options;
        const columns = options.columns;
        const col = (field) => columns.find((c) => c.field === field);

        for(const field of ["id", "settings", "notes", "props", "updated"]) {
            expect(col(field).headerFilter, field).toBe("input");
        }
        expect(col("enabled").headerFilter).toBe("tickCross");

        /*  A document: its JSON text  */
        const doc = col("settings").headerFilterFunc;
        expect(doc("volt", {volts: 230})).toBe(true);
        expect(doc("amp", {volts: 230})).toBe(false);

        /*  A time: the date the cell shows  */
        const epoch = Math.floor(new Date("2026-03-14T09:26:53").getTime() / 1000);
        const when = col("updated").headerFilterFunc;
        expect(when("2026", epoch)).toBe(true);
        expect(when("1999", epoch)).toBe(false);
        expect(when("", null)).toBe(true);

        /*  The paginator is drawn always: nothing in the settings hides it  */
        expect(options.pagination).toBe(true);
        expect(logged.filter((l) => l.level === "error")).toEqual([]);
    });
});
