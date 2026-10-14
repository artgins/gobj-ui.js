/***********************************************************************
 *          form_table_rows.wiring.test.js
 *
 *      The rows of a C_YUI_FORM's tables: whose objects they are, when
 *      they are loaded, and what happens to the nested tables they hold.
 *
 *      - Tabulator KEEPS the objects it is given (Row.setData() copies
 *        nothing) and a cell edit writes into them. Up to 7.26.42 the
 *        form handed it the objects of its `record`: an edit wrote into
 *        the record, Undo loaded that record again -- the edited values
 *        -- and cleared `edited`, so a later save sent what the reader
 *        believed undone. The record of the host was written too, and
 *        so was what the form published on a save.
 *      - A load waits for the table to be built (`tableBuilt`). Each load
 *        hung a listener of its own, and a clear skipped a table not
 *        built yet: two loads before the build drew the rows twice.
 *      - A row builds its nested tables when it is drawn. Nothing
 *        destroyed them -- not a reload, not an undo, not a deleted row,
 *        not the form -- and a row drawn AGAIN built new ones, empty.
 *      - A load added its rows one by one and redrew the table once per
 *        row, a redraw of every row each time: quadratic.
 *
 *      Driven through the real gclass on a document double, with a
 *      Tabulator double that does what Tabulator does with rows: it
 *      keeps the objects it is given, writes an edit into them, answers
 *      getData() with copies and a row's getData() with the row itself,
 *      draws a row by running its formatter, says `dataChanged` per row
 *      added, synchronously, and builds itself a turn after it is made.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {describe, test, expect, beforeAll, beforeEach, vi} from "vitest";
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
            this.settings = settings;
            this.options = {};
            this.handlers = {};
            this.initialized = false;
            this.destroyed = false;
            this.rows = [];
            this.calls = {addRow: 0, addData: 0, redraw: 0};
            this.modules = {
                localize: {
                    installLang: () => {
                    }
                }
            };
            tables.push(this);
            /*  Tabulator builds itself a turn after it is made.  */
            setTimeout(() => {
                if(!this.destroyed) {
                    this.initialized = true;
                    this.emit("tableBuilt");
                }
            }, 0);
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
            (this.handlers[ev] = this.handlers[ev] || []).push(fn);
        }
        off(ev) {
            delete this.handlers[ev];
        }
        emit(ev, ...args) {
            for(const fn of (this.handlers[ev] || [])) {
                fn(...args);
            }
        }
        must_be_built() {
            if(!this.initialized) {
                throw new Error("Table Not Initialized");
            }
        }
        add(record) {
            const $row = document.createElement("div");
            this.element.appendChild($row);
            const row = {data: record, $row: $row};
            row.component = {
                getElement: () => row.$row,
                getData: () => row.data,
                delete: () => {
                    this.delete_row(this.rows.indexOf(row));
                },
            };
            if(this.settings && typeof this.settings.rowFormatter === "function") {
                this.settings.rowFormatter(row.component);
            }
            this.rows.push(row);
            this.emit("dataChanged");
            return row.component;
        }
        addRow(record) {
            this.must_be_built();
            this.calls.addRow++;
            return Promise.resolve(this.add(record));
        }
        addData(records) {
            this.must_be_built();
            this.calls.addData++;
            return Promise.resolve(records.map((record) => this.add(record)));
        }
        getRows() {
            return this.rows.map((row) => row.component);
        }
        getData() {
            return this.rows.map((row) => structuredClone(row.data));
        }
        getDataCount() {
            return this.rows.length;
        }
        /*  What an edited cell does: the row's own object is written.  */
        edit_cell(index, field, value) {
            this.rows[index].data[field] = value;
            this.emit("dataChanged");
        }
        /*  row.delete(): `rowDeleted` while the row still has its element.  */
        delete_row(index) {
            const row = this.rows[index];
            this.rows.splice(index, 1);
            this.emit("rowDeleted", row.component);
            row.$row.remove();
            this.emit("dataChanged");
        }
        /*  What a forced redraw does to a row: its children are taken off
         *  and its formatter runs again.  */
        draw_row_again(index) {
            const row = this.rows[index];
            while(row.$row.firstChild) {
                row.$row.removeChild(row.$row.firstChild);
            }
            this.settings.rowFormatter(row.component);
        }
        clearData() {
            this.must_be_built();
            for(const row of this.rows) {
                while(row.$row.firstChild) {
                    row.$row.removeChild(row.$row.firstChild);
                }
                row.$row.remove();
            }
            this.rows = [];
        }
        redraw() {
            this.calls.redraw++;
        }
        validate() {
            return true;
        }
        setLocale() {
        }
        destroy() {
            this.destroyed = true;
        }
    }
    return {TabulatorFull: FakeTabulator, Tabulator: FakeTabulator};
});

const {
    SDATA_END, gclass_create,
    gobj_start_up, gobj_create_yuno, gobj_create_pure_child,
    gobj_start, gobj_stop, gobj_destroy, gobj_send_event, gobj_read_attr,
    set_log_callback,
} = await import("@yuneta/gobj-js");
const {register_c_yui_form} = await import("./c_yui_form.js");

const logged = [];
const saved = [];
let yuno = null;

/*  A device's settings, cut down: the alarms as a table whose rows
 *  carry a nested table of triggers.  */
const TEMPLATE = {
    template_version: {
        type: "integer",
        default: 7,
        flag: ["hidden", "persistent"]
    },
    alarms: {
        type: "array",
        flag: ["writable", "persistent", "table"],
        table: {
            name: {
                type: "string",
                header: "alarm name",
                flag: ["writable", "persistent"]
            },
            triggers: {
                type: "array",
                flag: ["writable", "persistent", "table"],
                table: {
                    measure: {
                        type: "string",
                        header: "measure",
                        flag: ["writable", "persistent"]
                    },
                    value: {
                        type: "integer",
                        header: "value",
                        flag: ["writable", "persistent"]
                    }
                }
            }
        }
    }
};

function record()
{
    return {
        template_version: 7,
        alarms: [
            {name: "too hot", triggers: [{measure: "temperature", value: 30}]},
            {name: "too wet", triggers: [{measure: "humidity", value: 80}]}
        ]
    };
}

beforeAll(async () => {
    const i18next = (await import("i18next")).default;
    await i18next.init({lng: "en", resources: {}});
    gobj_start_up(null, null, null, null, null, null, null);
    set_log_callback((level, msg) => {
        logged.push({level: String(level), msg: String(msg)});
    });
    gclass_create("C_TEST_TR_HOST", [], [["ST_IDLE", []]], {}, 0, [SDATA_END()], {}, 0, 0, 0, 0);
    gclass_create(
        "C_TEST_TR_APP",
        [["EV_SAVE_RECORD", 0]],
        [["ST_IDLE", [
            ["EV_SAVE_RECORD", (gobj, event, kw) => {
                saved.push(kw);
                return 0;
            }, null],
        ]]],
        {}, 0, [SDATA_END()], {}, 0, 0, 0, 0
    );
    register_c_yui_form();
    yuno = gobj_create_yuno("form_table_rows_yuno", "C_TEST_TR_HOST", {});
    gobj_start(yuno);
});

beforeEach(() => {
    logged.length = 0;
    saved.length = 0;
});

let seq = 0;

/*  `then(form)` runs in the same turn as the start, before any table
 *  is built.  */
function build(rec, then)
{
    const first = tables.length;
    const app = gobj_create_pure_child(`trapp${++seq}`, "C_TEST_TR_APP", {}, yuno);
    gobj_start(app);
    const form = gobj_create_pure_child(`trform${seq}`, "C_YUI_FORM", {
        template: TEMPLATE,
        record: rec,
        editable: true,
    }, app);
    gobj_start(form);
    if(then) {
        then(form);
    }
    return {form, first};
}

/*  Every table builds itself a turn after it is made, and a nested one
 *  is made when its row is drawn: a few turns until all are loaded.  */
async function settle()
{
    for(let i = 0; i < 4; i++) {
        await new Promise(resolve => setTimeout(resolve, 0));
    }
}

/*  The alarms table of the form, and the tables alive.  */
function alarms_of(first)
{
    return tables[first];
}

function live()
{
    return tables.filter((tb) => !tb.destroyed).length;
}

/*  The triggers table drawn in a row of the alarms table.  */
function triggers_of(alarms, index)
{
    const $nested = alarms.rows[index].$row.querySelector(".yui-tabulator-table-nested");
    return $nested ? $nested.tabulator : null;
}

function shown(alarms)
{
    return alarms.rows.map((row) => {
        const triggers = triggers_of(alarms, alarms.rows.indexOf(row));
        return {
            name: row.data.name,
            values: triggers ? triggers.rows.map((r) => r.data.value) : null
        };
    });
}

function close_asks(form)
{
    const kw = {abort_close: false};
    gobj_send_event(form, "EV_WINDOW_TO_CLOSE", kw, form);
    return kw.abort_close;
}

function errors()
{
    return logged.filter((l) => /error/i.test(l.level) || /ERROR/.test(l.msg));
}

describe("Undo gives the tables back the values the form was loaded with", () => {
    test("an edited cell and an edited nested cell are undone, and the record is untouched", async () => {
        const host_record = record();
        const {form, first} = build(host_record);
        await settle();
        const alarms = alarms_of(first);
        expect(shown(alarms)).toEqual([
            {name: "too hot", values: [30]},
            {name: "too wet", values: [80]}
        ]);

        alarms.edit_cell(0, "name", "too hot EDIT");
        triggers_of(alarms, 0).edit_cell(0, "value", 309);
        expect(gobj_read_attr(form, "edited")).toBe(true);
        expect(gobj_read_attr(form, "record")).toEqual(record());
        expect(host_record).toEqual(record());

        gobj_send_event(form, "EV_UNDO_RECORD", {}, form);
        await settle();
        expect(shown(alarms)).toEqual([
            {name: "too hot", values: [30]},
            {name: "too wet", values: [80]}
        ]);
        expect(gobj_read_attr(form, "edited")).toBe(false);
        expect(close_asks(form)).toBe(false);
        expect(errors()).toEqual([]);
    });

    test("what a save published is not written by a later edit", async () => {
        const {form, first} = build(record());
        await settle();
        const alarms = alarms_of(first);
        gobj_send_event(form, "EV_SAVE_RECORD", {}, form);
        expect(saved.length).toBe(1);
        const published = structuredClone(saved[0]);

        alarms.edit_cell(0, "name", "after the save");
        triggers_of(alarms, 0).edit_cell(0, "value", 1);
        expect(saved[0]).toEqual(published);
        expect(saved[0].alarms[0].name).toBe("too hot");
        expect(saved[0].alarms[0].triggers).toEqual([{measure: "temperature", value: 30}]);
        expect(errors()).toEqual([]);
    });
});

describe("a load before the table is built", () => {
    test("two loads in the turn the form starts in draw the rows once", async () => {
        const {first} = build(record(), (form) => {
            gobj_send_event(form, "EV_LOAD_RECORD", record(), form);
        });
        await settle();
        expect(shown(alarms_of(first))).toEqual([
            {name: "too hot", values: [30]},
            {name: "too wet", values: [80]}
        ]);
        expect(errors()).toEqual([]);
    });

    test("a Clear before the build leaves the table empty", async () => {
        const {first} = build(record(), (form) => {
            gobj_send_event(form, "EV_CLEAR_RECORD", {}, form);
        });
        await settle();
        expect(alarms_of(first).rows.length).toBe(0);
        expect(errors()).toEqual([]);
    });
});

describe("the nested tables go with what they belong to", () => {
    test("reloads and an undo destroy the nested tables they replace; the form takes the rest", async () => {
        const before = live();
        const {form} = build(record());
        await settle();
        expect(live() - before).toBe(3);     // the alarms, and a triggers table per row
        for(let i = 0; i < 5; i++) {
            gobj_send_event(form, "EV_LOAD_RECORD", record(), form);
            await settle();
        }
        expect(live() - before).toBe(3);
        gobj_send_event(form, "EV_UNDO_RECORD", {}, form);
        await settle();
        expect(live() - before).toBe(3);
        gobj_send_event(form, "EV_CLEAR_RECORD", {}, form);
        await settle();
        expect(live() - before).toBe(1);
        gobj_send_event(form, "EV_LOAD_RECORD", record(), form);
        await settle();
        gobj_stop(form);
        gobj_destroy(form);
        expect(live() - before).toBe(0);
        expect(errors()).toEqual([]);
    });

    test("a row the reader deletes takes its nested table with it", async () => {
        const before = live();
        const {form, first} = build(record());
        await settle();
        const alarms = alarms_of(first);
        const triggers = triggers_of(alarms, 0);
        alarms.delete_row(0);
        expect(triggers.destroyed).toBe(true);
        expect(live() - before).toBe(2);
        expect(close_asks(form)).toBe(true);
        expect(errors()).toEqual([]);
    });

    test("a row drawn again keeps its nested table, with its rows", async () => {
        const {form, first} = build(record());
        await settle();
        const alarms = alarms_of(first);
        const triggers = triggers_of(alarms, 0);
        triggers.edit_cell(0, "value", 31);
        const made = tables.length;

        alarms.draw_row_again(0);
        await settle();
        expect(tables.length).toBe(made);
        expect(triggers_of(alarms, 0)).toBe(triggers);
        expect(triggers.destroyed).toBe(false);
        expect(shown(alarms)[0]).toEqual({name: "too hot", values: [31]});

        gobj_send_event(form, "EV_SAVE_RECORD", {}, form);
        expect(saved[0].alarms[0].triggers).toEqual([{measure: "temperature", value: 31}]);
        expect(errors()).toEqual([]);
    });
});

describe("a table is loaded in one call", () => {
    test("one call for all its rows and one redraw, not one of each per row", async () => {
        const many = {
            template_version: 7,
            alarms: Array.from({length: 40}, (_, i) => ({name: `a${i}`, triggers: []}))
        };
        const {form, first} = build(many);
        await settle();
        await new Promise(resolve => setTimeout(resolve, 60));     // the redraw after the load
        const alarms = alarms_of(first);
        expect(alarms.rows.length).toBe(40);
        expect(alarms.calls.addRow).toBe(0);
        expect(alarms.calls.addData).toBe(1);
        expect(alarms.calls.redraw).toBe(1);
        expect(gobj_read_attr(form, "edited")).toBe(false);
        expect(close_asks(form)).toBe(false);
        expect(errors()).toEqual([]);
    });
});
