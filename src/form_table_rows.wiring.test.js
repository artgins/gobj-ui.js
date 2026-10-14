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
 *      A click on a row toggles it before `rowClick`, as Tabulator's
 *      SelectRow does when the table selects rows: a form that toggled
 *      it again in `rowClick` (7.26.44) undid every click.
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
            this.options = Object.assign({}, settings);
            this.handlers = {};
            this.initialized = false;
            this.destroyed = false;
            this.rows = [];
            this.row_header = null;
            this.calls = {addRow: 0, addData: 0, redraw: 0};
            this.modules = {
                localize: {
                    installLang: () => {
                    }
                },
                edit: {
                    currentCell: false,
                    cancelEdit: () => {
                        this.modules.edit.currentCell = false;
                    }
                }
            };
            tables.push(this);
            /*  Tabulator builds itself a turn after it is made, with
             *  the rows it was given (`data`), saying no `dataChanged`.  */
            setTimeout(() => {
                if(!this.destroyed) {
                    for(const record of (settings && settings.data) || []) {
                        this.add(record, true);
                    }
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
        add(record, silent) {
            const $row = document.createElement("div");
            this.element.appendChild($row);
            const row = {data: record, $row: $row};
            row.component = {
                getElement: () => row.$row,
                getData: () => row.data,
                toggleSelect: () => {
                    this.toggle_row(row);
                },
                delete: () => {
                    this.delete_row(this.rows.indexOf(row));
                },
            };
            if(this.settings && typeof this.settings.rowFormatter === "function") {
                this.settings.rowFormatter(row.component);
            }
            this.rows.push(row);
            if(!silent) {
                this.emit("dataChanged");
            }
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
        /*  SelectRow's own toggle, gated by `selectableRowsCheck`.  */
        toggle_row(row) {
            let check = this.options.selectableRowsCheck || (() => true);
            if(check(row.component)) {
                row.selected = !row.selected;
            }
        }
        /*  A click on a row: SelectRow toggles it on its own `click`
         *  when the table selects rows, then Tabulator says `rowClick`.  */
        click_row(index) {
            const row = this.rows[index];
            let selectable_rows = this.options.selectableRows;
            if(selectable_rows === true || typeof selectable_rows === "number") {
                this.toggle_row(row);
            }
            this.emit("rowClick", {
                preventDefault: () => {
                }
            }, row.component);
        }
        getRows() {
            return this.rows.map((row) => row.component);
        }
        getSelectedRows() {
            return this.rows.filter((row) => row.selected).map((row) => row.component);
        }
        /*  SelectRow's deselectRow(): with no argument every row, and
         *  it asks no `selectableRowsCheck`.  */
        deselectRow() {
            for(const row of this.rows) {
                row.selected = false;
            }
        }
        /*  The structured columns start with the row header, as
         *  Tabulator's (ColumnManager.columns).  */
        getColumns(structured) {
            const def = this.settings && this.settings.rowHeader;
            if(!structured || !def) {
                return [];
            }
            if(!this.row_header) {
                const header = {visible: def.visible !== false};
                this.row_header = {
                    getDefinition: () => def,
                    isVisible: () => header.visible,
                    show: () => {
                        header.visible = true;
                    },
                    hide: () => {
                        header.visible = false;
                    },
                };
            }
            return [this.row_header];
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
        /*  A cell editor opened in a row, as a click on a cell does.  */
        open_editor(index) {
            this.modules.edit.currentCell = this.rows[index];
        }
        /*  What Tabulator 6.6.0 does when it wipes its rows with an
         *  editor open: the row that holds it closes it, and the redraw
         *  that follows walks the rows already wiped -- it throws when
         *  any row came before.  */
        wipe_rows() {
            const editing = this.modules.edit.currentCell;
            if(editing && this.rows.indexOf(editing) > 0) {
                throw new TypeError("Cannot read properties of undefined (reading 'add')");
            }
        }
        clearData() {
            this.must_be_built();
            this.wipe_rows();
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
            this.wipe_rows();
            this.destroyed = true;
        }
    }
    return {TabulatorFull: FakeTabulator, Tabulator: FakeTabulator};
});

const {
    SDATA_END, gclass_create,
    gobj_start_up, gobj_create_yuno, gobj_create_pure_child,
    gobj_start, gobj_stop, gobj_destroy, gobj_send_event, gobj_read_attr, gobj_write_attr,
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
function build(rec, then, extra)
{
    const first = tables.length;
    const app = gobj_create_pure_child(`trapp${++seq}`, "C_TEST_TR_APP", {}, yuno);
    gobj_start(app);
    const form = gobj_create_pure_child(`trform${seq}`, "C_YUI_FORM", Object.assign({
        template: TEMPLATE,
        record: rec,
        editable: true,
    }, extra || {}), app);
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

    /*  Up to 7.26.44 a nested table was built empty and loaded after
     *  its build -- laid out twice and redrawn once more, per row: with
     *  a nested table per row, most of the time of a load.  */
    test("a nested table is BUILT with its rows: no load of its own, no redraw", async () => {
        const host_record = record();
        const {form, first} = build(host_record);
        await settle();
        await new Promise(resolve => setTimeout(resolve, 60));
        const alarms = alarms_of(first);
        const triggers = triggers_of(alarms, 0);
        expect(triggers.rows.map((r) => r.data)).toEqual([{measure: "temperature", value: 30}]);
        expect(triggers.calls.addData).toBe(0);
        expect(triggers.calls.redraw).toBe(0);
        /*  A copy: an edit there does not write into the record.  */
        triggers.edit_cell(0, "value", 31);
        expect(host_record.alarms[0].triggers[0].value).toBe(30);
        expect(gobj_read_attr(form, "record").alarms[0].triggers[0].value).toBe(30);
        expect(gobj_read_attr(form, "edited")).toBe(true);
        expect(errors()).toEqual([]);
    });
});

describe("a click on a row", () => {
    function click(alarms, index)
    {
        alarms.click_row(index);
    }

    test("does not WRITE the `selectable` attribute, and selects nothing when Tabulator selects no rows", async () => {
        const {form, first} = build(record());
        await settle();
        const alarms = alarms_of(first);
        click(alarms, 0);
        expect(gobj_read_attr(form, "selectable")).toBe(true);
        expect(alarms.rows[0].selected).toBeFalsy();
        expect(errors()).toEqual([]);
    });

    test("selects the row when the form is selectable and its table selects rows", async () => {
        const {first} = build(record(), null, {tabulator_settings: {selectableRows: true}});
        await settle();
        const alarms = alarms_of(first);
        click(alarms, 1);
        expect(alarms.rows[1].selected).toBe(true);
        click(alarms, 1);
        expect(alarms.rows[1].selected).toBeFalsy();
        expect(errors()).toEqual([]);
    });

    test("selects nothing when the form is not selectable", async () => {
        const {first} = build(record(), null, {
            selectable: false,
            tabulator_settings: {selectableRows: true}
        });
        await settle();
        const alarms = alarms_of(first);
        click(alarms, 1);
        expect(alarms.rows[1].selected).toBeFalsy();
        expect(errors()).toEqual([]);
    });
});

/*  Tabulator 6.6.0's row checkbox goes through `selectableRowsCheck`
 *  (toggleRow), but the box ticks on its own first, so a refused
 *  toggle leaves it ticked over a row that is not selected; and its
 *  header box calls selectRow(), which asks no check at all and
 *  selects every row. Checked in Chromium: with `selectable: false`
 *  the row box ticked and selected nothing, the header selected every
 *  row; and with the default `selectableRows` ("highlight") the
 *  `selectable` of the form was not asked at all.  */
describe("the checkbox column", () => {
    test("is not shown when the form is not selectable", async () => {
        const {first} = build(record(), null, {with_checkbox: true, selectable: false});
        await settle();
        const alarms = alarms_of(first);
        expect(alarms.getColumns(true)[0].isVisible()).toBe(false);
        expect(triggers_of(alarms, 0).getColumns(true)[0].isVisible()).toBe(false);
        expect(errors()).toEqual([]);
    });

    /*  Up to 7.26.46 `selectable` was read when a table was built: written
     *  false after it, the boxes stayed, and ticked over rows that the
     *  check no longer let be selected.  */
    test("follows `selectable` written after the tables are built", async () => {
        const {form, first} = build(record(), null, {with_checkbox: true});
        await settle();
        const alarms = alarms_of(first);
        const nested = triggers_of(alarms, 0);
        expect(alarms.getColumns(true)[0].isVisible()).toBe(true);
        gobj_write_attr(form, "selectable", false);
        expect(alarms.getColumns(true)[0].isVisible()).toBe(false);
        expect(nested.getColumns(true)[0].isVisible()).toBe(false);
        gobj_write_attr(form, "selectable", true);
        expect(alarms.getColumns(true)[0].isVisible()).toBe(true);
        expect(nested.getColumns(true)[0].isVisible()).toBe(true);
        expect(errors()).toEqual([]);
    });

    /*  Up to 7.26.48 the rows selected before stayed selected: no box
     *  to untick, and a click asks the check, which refuses.  */
    test("written false, it takes off what was selected", async () => {
        const {form, first} = build(record(), null, {
            with_checkbox: true, tabulator_settings: {selectableRows: true}
        });
        await settle();
        const alarms = alarms_of(first);
        alarms.click_row(0);
        alarms.click_row(1);
        expect(alarms.getSelectedRows().length).toBe(2);
        gobj_write_attr(form, "selectable", false);
        expect(alarms.getColumns(true)[0].isVisible()).toBe(false);
        expect(alarms.getSelectedRows().length).toBe(0);
        alarms.click_row(0);
        expect(alarms.getSelectedRows().length).toBe(0);
        gobj_write_attr(form, "selectable", true);
        alarms.click_row(0);
        expect(alarms.getSelectedRows().length).toBe(1);
        expect(errors()).toEqual([]);
    });

    test("a table built after `selectable` was written follows it", async () => {
        const {form, first} = build(record(), (f) => {
            gobj_write_attr(f, "selectable", false);
        }, {with_checkbox: true});
        await settle();
        expect(alarms_of(first).getColumns(true)[0].isVisible()).toBe(false);
        expect(errors()).toEqual([]);
    });

    test("is drawn when it is, and every toggle asks the form's `selectable`", async () => {
        const {form, first} = build(record(), null, {with_checkbox: true});
        await settle();
        const alarms = alarms_of(first);
        expect(alarms.settings.rowHeader.formatter).toBe("rowSelection");
        expect(typeof alarms.settings.selectableRowsCheck).toBe("function");
        expect(alarms.settings.selectableRowsCheck()).toBe(true);
        gobj_write_attr(form, "selectable", false);
        expect(alarms.settings.selectableRowsCheck()).toBe(false);
        expect(errors()).toEqual([]);
    });
});

/*  Enter in a box of a <form> is an implicit submission: the browser
 *  clicks the form's first SUBMIT button, and with none and a single text
 *  box it submits the form. Up to 7.26.46 the table's "add" button had no
 *  `type`, so it was that button: Enter in any field (or in a cell editor
 *  that stays open) added an empty row; and a form of one text box
 *  reloaded the page (Chromium and Firefox).  */
describe("Enter in a box of the form", () => {
    test("the table's add button is no submit button", async () => {
        const {form} = build(record());
        await settle();
        const $container = gobj_read_attr(form, "$container");
        const $buttons = Array.from($container.querySelector("form").querySelectorAll("button"));
        expect($buttons.length).toBeGreaterThan(0);
        for(const $b of $buttons) {
            expect($b.getAttribute("type"), $b.className).toBe("button");
        }
    });

    test("the form is never submitted", async () => {
        const {form} = build(record());
        await settle();
        const $form = gobj_read_attr(form, "$container").querySelector("form");
        let prevented = 0;
        $form.dispatchEvent({type: "submit", target: $form, preventDefault() {
            prevented++;
        }, stopPropagation() {}});
        expect(prevented).toBe(1);
    });
});

/*  A cell half typed: Tabulator says `dataChanged` only when its editor
 *  commits, and a host that reloads the form by code asks `edited`
 *  first -- the reload dropped what was typed without a question.  */
describe("typing in a cell editor", () => {
    /*  The document double does not bubble: the event is handed to the
     *  table's element with the box as its target, as a browser does.  */
    function type_in(alarms, $box)
    {
        alarms.element.dispatchEvent({type: "input", target: $box, bubbles: true});
    }

    function editing_box($row, editing)
    {
        const $cell = document.createElement("div");
        $cell.className = editing ? "tabulator-cell tabulator-editing" : "tabulator-col";
        const $box = document.createElement("input");
        $cell.appendChild($box);
        $row.appendChild($cell);
        return $box;
    }

    test("is `edited` at once, before the editor commits", async () => {
        const {form, first} = build(record());
        await settle();
        const alarms = alarms_of(first);
        expect(gobj_read_attr(form, "edited")).toBe(false);
        type_in(alarms, editing_box(alarms.rows[0].$row, true));
        expect(gobj_read_attr(form, "edited")).toBe(true);
        expect(errors()).toEqual([]);
    });

    test("but not a box that edits no cell (a header filter)", async () => {
        const {form, first} = build(record());
        await settle();
        const alarms = alarms_of(first);
        type_in(alarms, editing_box(alarms.element, false));
        expect(gobj_read_attr(form, "edited")).toBe(false);
    });

    /*  Escape, or a box left as it was: what was typed is gone, and up
     *  to 7.26.46 it still counted -- closing asked about nothing.  */
    test("a cancelled edit gives back the `edited` the form had when it opened", async () => {
        const {form, first} = build(record());
        await settle();
        const alarms = alarms_of(first);
        alarms.emit("cellEditing");
        type_in(alarms, editing_box(alarms.rows[0].$row, true));
        expect(gobj_read_attr(form, "edited")).toBe(true);
        alarms.emit("cellEditCancelled");
        expect(gobj_read_attr(form, "edited")).toBe(false);
        expect(gobj_read_attr(form, "changes")).toBe(false);
        expect(close_asks(form)).toBe(false);

        /*  An edit already made stays one: the cancel gives back what
         *  was there when THIS editor opened.  */
        alarms.edit_cell(0, "name", "renamed");
        expect(gobj_read_attr(form, "edited")).toBe(true);
        alarms.emit("cellEditing");
        type_in(alarms, editing_box(alarms.rows[0].$row, true));
        alarms.emit("cellEditCancelled");
        expect(gobj_read_attr(form, "edited")).toBe(true);
        expect(errors()).toEqual([]);
    });

    test("a cancel gives nothing back when something else changed the form meanwhile", async () => {
        const {form, first} = build(record());
        await settle();
        const alarms = alarms_of(first);
        alarms.emit("cellEditing");
        type_in(alarms, editing_box(alarms.rows[0].$row, true));
        alarms.edit_cell(1, "name", "elsewhere");
        alarms.emit("cellEditCancelled");
        expect(gobj_read_attr(form, "edited")).toBe(true);
        expect(errors()).toEqual([]);
    });

    test("a committed edit stays `edited`", async () => {
        const {form, first} = build(record());
        await settle();
        const alarms = alarms_of(first);
        alarms.emit("cellEditing");
        type_in(alarms, editing_box(alarms.rows[0].$row, true));
        alarms.edit_cell(0, "name", "typed");
        expect(gobj_read_attr(form, "edited")).toBe(true);
        expect(errors()).toEqual([]);
    });
});

/*  A time column was edited by Tabulator's `datetime` with a `format`,
 *  which needs luxon, which nobody gives gobj-ui: in Chromium it said
 *  "'date' editor 'format' param is dependant on luxon.js", opened
 *  empty, and threw when committed.  */
describe("a time column of a table", () => {
    test("is edited by the form's own editor, which needs no luxon", async () => {
        const first = tables.length;
        const app = gobj_create_pure_child(`trapp${++seq}`, "C_TEST_TR_APP", {}, yuno);
        gobj_start(app);
        const form = gobj_create_pure_child(`trform${seq}`, "C_YUI_FORM", {
            template: {
                events: {
                    type: "array",
                    flag: ["writable", "persistent", "table"],
                    table: {
                        when: {type: "integer", flag: ["writable", "persistent", "time"]}
                    }
                }
            },
            record: {events: [{when: 1700000000}]},
            editable: true,
        }, app);
        gobj_start(form);
        await settle();
        const column = tables[first].settings.columns.find((c) => c.field === "when");
        expect(typeof column.editor).toBe("function");
        const params = column.editorParams({getValue: () => 1700000000});
        expect(params.format).toBeUndefined();
        expect(params.elementAttributes["aria-label"]).toBe("when");
        expect(params.elementAttributes.title).toBe("when");
        gobj_stop(form);
        gobj_destroy(form);
        expect(errors()).toEqual([]);
    });

    /*  Up to 7.26.46 the cell showed the raw epoch (1700000000); up
     *  to 7.26.51 "2026-03-14 09:26:53". The app's language is "en".  */
    test("shows its time as the local clock, in the app's language, not the epoch", async () => {
        const first = tables.length;
        const app = gobj_create_pure_child(`trapp${++seq}`, "C_TEST_TR_APP", {}, yuno);
        gobj_start(app);
        const form = gobj_create_pure_child(`trform${seq}`, "C_YUI_FORM", {
            template: {
                events: {
                    type: "array",
                    flag: ["writable", "persistent", "table"],
                    table: {
                        when: {type: "integer", flag: ["writable", "persistent", "time"]},
                        at: {type: "string", flag: ["writable", "persistent", "time"]}
                    }
                }
            },
            record: {events: []},
            editable: true,
        }, app);
        gobj_start(form);
        await settle();
        const columns = tables[first].settings.columns;
        const text = (field, value) => {
            const column = columns.find((c) => c.field === field);
            const out = column.formatter({getValue: () => value});
            return typeof out === "string" ? out : out.textContent;
        };
        const wall = "2026-03-14T09:26:53";
        const epoch = Math.floor(new Date(wall).getTime() / 1000);
        expect(text("when", epoch)).toBe("Mar 14, 2026, 09:26:53");
        expect(text("at", new Date(epoch * 1000).toISOString())).toBe("Mar 14, 2026, 09:26:53");
        expect(text("when", null)).toBe("");
        expect(text("at", "not a time")).toBe("not a time");
        gobj_stop(form);
        gobj_destroy(form);
        expect(errors()).toEqual([]);
    });
});

/*  A click in a nested table is the nested table's: it bubbled up to
 *  the row that holds it, and Tabulator 6.6.0's SelectRow -- listening
 *  on that row's element -- toggled the outer row too (Chromium). So
 *  does a Shift+press, which starts its range selection.  */
describe("a click in a nested table", () => {
    function event(type, init)
    {
        let stopped = 0;
        const ev = Object.assign({
            type: type,
            bubbles: true,
            preventDefault() {
            },
            stopPropagation() {
                stopped++;
            },
        }, init || {});
        return {ev, stopped: () => stopped};
    }

    test("does not reach the row that holds the table", async () => {
        const {first} = build(record(), null, {tabulator_settings: {selectableRows: true}});
        await settle();
        const $nested = alarms_of(first).rows[0].$row.querySelector(".yui-tabulator-table-nested");

        const click = event("click");
        $nested.dispatchEvent(click.ev);
        expect(click.stopped()).toBe(1);

        const shift_press = event("mousedown", {shiftKey: true});
        $nested.dispatchEvent(shift_press.ev);
        expect(shift_press.stopped()).toBe(1);

        /*  A plain press goes on: what closes a popup listens for it.  */
        const press = event("mousedown", {shiftKey: false});
        $nested.dispatchEvent(press.ev);
        expect(press.stopped()).toBe(0);
        expect(errors()).toEqual([]);
    });
});

describe("a cell editor open while its table goes", () => {
    function warnings()
    {
        return logged.filter((l) => /warn|error/i.test(l.level) || /WARNING|ERROR/.test(l.msg));
    }

    test("a reload with an editor open in the second row reloads the rows", async () => {
        const {form, first} = build(record());
        await settle();
        const alarms = alarms_of(first);
        alarms.open_editor(1);
        triggers_of(alarms, 1).open_editor(0);
        gobj_send_event(form, "EV_LOAD_RECORD", {
            template_version: 7,
            alarms: [{name: "cold", triggers: [{measure: "temperature", value: 5}]}]
        }, form);
        await settle();
        expect(shown(alarms)).toEqual([{name: "cold", values: [5]}]);
        expect(warnings()).toEqual([]);
    });

    test("a destroy with an editor open in a second row destroys every table, silently", async () => {
        const before = live();
        const {form, first} = build({
            template_version: 7,
            alarms: [
                {name: "a", triggers: [{measure: "m", value: 1}, {measure: "n", value: 2}]},
                {name: "b", triggers: [{measure: "m", value: 3}]}
            ]
        });
        await settle();
        const alarms = alarms_of(first);
        alarms.open_editor(1);
        triggers_of(alarms, 0).open_editor(1);
        gobj_stop(form);
        gobj_destroy(form);
        expect(live() - before).toBe(0);
        expect(warnings()).toEqual([]);
    });

    /*  The guard reads Tabulator's edit module, which is no public
     *  API: a Tabulator that moved it would leave the guard doing
     *  nothing, and the crash back. That is said.  */
    test("a Tabulator with no edit module is said, not trusted", async () => {
        const {form, first} = build(record());
        await settle();
        const alarms = alarms_of(first);
        alarms.modules.edit = {editingCell: false, cancel: () => {}};     /*  renamed  */
        gobj_send_event(form, "EV_LOAD_RECORD", record(), form);
        await settle();
        const said = warnings().map((l) => l.msg);
        expect(said.length).toBe(1);
        expect(said[0]).toContain("has no modules.edit.currentCell/cancelEdit()");
    });
});
