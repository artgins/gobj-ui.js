/***********************************************************************
 *          form_table_rearm.wiring.test.js
 *
 *      A C_YUI_FORM with a table field, destroyed less than 200 ms after
 *      a save or an undo -- which is what a dialog does: it closes the
 *      moment the record is saved.
 *
 *      set_changed_stated(false) re-wires the tables' `dataChanged` from
 *      a 200 ms timer. Since 7.26.7 destroy_ui() destroys the widgets and
 *      nulls `$table.tabulator`, and the timer, left running, called
 *      `.on()` on that null: an uncaught TypeError. The timer is kept and
 *      cancelled now, and it skips a table that is gone.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {describe, test, expect, beforeAll, vi} from "vitest";
import {install_dom_double} from "../test/dom_double.js";

install_dom_double();

if(typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    };
}

/*  A Tabulator that answers anything: the form drives a dozen of its
 *  methods, and this test is about the timer, not about the table.  */
const tables = vi.hoisted(() => []);
vi.mock("tabulator-tables", () => {
    class FakeTabulator {
        constructor() {
            this.externalEvents = {events: {}};
            this.destroyed = false;
            this.initialized = true;
            this.added = [];
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
        destroy() {
            this.destroyed = true;
        }
        addRow(record) {
            this.added.push(record);
            return Promise.resolve({getElement: () => document.createElement("div")});
        }
    }
    return {TabulatorFull: FakeTabulator, Tabulator: FakeTabulator};
});

const {
    SDATA_END, gclass_create,
    gobj_start_up, gobj_create_yuno, gobj_create_pure_child,
    gobj_start, gobj_stop, gobj_destroy, gobj_send_event,
    set_log_callback,
} = await import("@yuneta/gobj-js");
const {register_c_yui_form} = await import("./c_yui_form.js");

let yuno = null;

beforeAll(async () => {
    const i18next = (await import("i18next")).default;
    await i18next.init({lng: "en", resources: {}});
    gobj_start_up(null, null, null, null, null, null, null);
    set_log_callback(() => {});
    gclass_create("C_TEST_RA_HOST", [], [["ST_IDLE", []]], {}, 0, [SDATA_END()], {}, 0, 0, 0, 0);
    gclass_create(
        "C_TEST_RA_APP",
        [["EV_SAVE_RECORD", 0], ["EV_RECORD_CHANGED", 0]],
        [["ST_IDLE", [
            ["EV_SAVE_RECORD", () => 0, null],
            ["EV_RECORD_CHANGED", () => 0, null],
        ]]],
        {}, 0, [SDATA_END()], {}, 0, 0, 0, 0
    );
    register_c_yui_form();
    yuno = gobj_create_yuno("form_rearm_yuno", "C_TEST_RA_HOST", {});
    gobj_start(yuno);
});

let seq = 0;

function build(rows)
{
    const app = gobj_create_pure_child(`raapp${++seq}`, "C_TEST_RA_APP", {}, yuno);
    gobj_start(app);
    const form = gobj_create_pure_child(`raform${seq}`, "C_YUI_FORM", {
        template: [
            {id: "id", header: "id", type: "string", flag: ["persistent", "required"]},
            {
                id: "rows", header: "rows", type: "array",
                flag: ["persistent", "writable", "table"],
                table: {k: ""},
            },
        ],
        record: {id: "a", rows: rows || []},
        editable: true,
    }, app);
    gobj_start(form);
    return {app, form};
}

describe("a form with a table, destroyed right after", () => {
    test("an undo: the deferred re-wiring does not throw", async () => {
        const {form} = build();
        expect(tables.length).toBeGreaterThan(0);
        const errors = [];
        const on_error = (e) => {
            errors.push(e);
        };
        process.on("uncaughtException", on_error);

        gobj_send_event(form, "EV_UNDO_RECORD", {}, form);
        gobj_stop(form);
        gobj_destroy(form);
        await new Promise(resolve => setTimeout(resolve, 260));

        process.off("uncaughtException", on_error);
        expect(errors).toEqual([]);
    });

    test("a live form is still re-wired", async () => {
        const {form} = build();
        const table = tables[tables.length - 1];
        gobj_send_event(form, "EV_UNDO_RECORD", {}, form);
        await new Promise(resolve => setTimeout(resolve, 260));
        expect(table.externalEvents.events["dataChanged"].length).toBe(1);
        gobj_stop(form);
        gobj_destroy(form);
    });

    test("a loaded row reaches its table through EV_ADD_TABLE_ROW's table id", async () => {
        const before = tables.length;
        const {form} = build([{k: "x"}, {k: "y"}]);
        const table = tables.slice(before).find(tb => tb.added.length > 0);
        expect(table).toBeTruthy();
        expect(table.added).toEqual([{k: "x"}, {k: "y"}]);
        gobj_stop(form);
        gobj_destroy(form);
        await new Promise(resolve => setTimeout(resolve, 60));
    });
});
