/***********************************************************************
 *          treedb_time_cell.wiring.test.js
 *
 *      A time column of C_YUI_TREEDB_TOPIC_WITH_FORM's table reads its
 *      value as the form does (form_time_value.js): an ISO text for a
 *      string column, an epoch in seconds for any other, nothing for no
 *      time. Up to gobj-ui 7.26.46 it read every column with parseInt --
 *      an ISO text as 2026 SECONDS, in January 1970 -- and showed a
 *      column with no time as January 1970.
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
    gclass_create("C_TEST_TIME_CELL_HOST", [], [["ST_IDLE", []]], {}, 0, [SDATA_END()], {}, 0, 0, 0, 0);
    register_c_yui_treedb_topic_with_form();
    yuno = gobj_create_yuno("time_cell_yuno", "C_TEST_TIME_CELL_HOST", {});
    gobj_start(yuno);
});

describe("a time column of a treedb topic's table", () => {
    test("reads an ISO text column as ISO, and shows no time as nothing", () => {
        const view = gobj_create_service("time_cell_view", "C_YUI_TREEDB_TOPIC_WITH_FORM", {
            treedb_name: "treedb_test",
            topic_name: "events",
            desc: {id: "events", pkey: "id", cols: [
                {id: "id", header: "Id", type: "string", flag: ["persistent", "required"]},
                {id: "at", header: "at", type: "string", flag: ["persistent", "time"]},
                {id: "when", header: "when", type: "integer", flag: ["persistent", "time"]}
            ]}
        }, yuno);
        gobj_start(view);
        const columns = tables[tables.length - 1].options.columns;
        const text = (field, value) => {
            const col = columns.find((c) => c.field === field);
            const out = col.formatter({getValue: () => value, getData: () => ({}), getField: () => field}, {}, () => {});
            return (out && typeof out === "object") ? out.textContent : String(out);
        };
        const year = (s) => (s.match(/\b(19|20)\d\d\b/) || [""])[0];
        const epoch = Math.floor(new Date("2026-03-14T09:26:53").getTime() / 1000);
        expect(year(text("at", new Date(epoch * 1000).toISOString()))).toBe("2026");
        expect(year(text("when", epoch))).toBe("2026");
        expect(text("when", null)).toBe("");
        expect(logged.filter((l) => l.level === "error")).toEqual([]);
    });
});
