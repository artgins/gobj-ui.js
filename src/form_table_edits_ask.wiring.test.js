/***********************************************************************
 *          form_table_edits_ask.wiring.test.js
 *
 *      What the reader does to the TABLES of a C_YUI_FORM is `edited`,
 *      whatever the record the form opened with -- so closing asks.
 *
 *      A form opens CHANGED when its record lacks a field the template
 *      fills with its default. Until 7.26.40 that also unwired the
 *      tables' `dataChanged` (and only a save, an undo or a load of what
 *      is stored wired it again), so adding a row, editing a cell,
 *      deleting a row or editing a nested table marked nothing: since
 *      7.26.39 the close asks only for `edited`, and it closed without a
 *      question -- the edit lost. In a consumer app that is the settings of
 *      every device without its alarm colours, whose alarms are tables.
 *
 *      And the column titles of those tables change language: they were
 *      drawn at build and never again.
 *
 *      Driven through the real gclass on a document double, with a
 *      Tabulator double that, like Tabulator, draws a row (its formatter
 *      runs) and says `dataChanged` INSIDE addRow() and addData(), once
 *      per row, synchronously.
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
            this.initialized = true;
            this.rows = [];
            this.installed = {};
            this.locale = null;
            this.modules = {
                localize: {
                    installLang: (name, strings) => {
                        this.installed[name] = strings;
                    }
                }
            };
            tables.push(this);
            /*  The rows it is built with (`data`): drawn, and no
             *  `dataChanged`, as Tabulator loads them.  */
            if(settings && Array.isArray(settings.data)) {
                for(const record of settings.data) {
                    this.add(record, true);
                }
            }
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
        emit(ev) {
            for(const fn of (this.handlers[ev] || [])) {
                fn([]);
            }
        }
        add(record, silent) {
            /*  The row's element lives in the table's, as in Tabulator:
             *  a nested table drawn in it is inside the form.  */
            const $row = document.createElement("div");
            this.element.appendChild($row);
            const row = {getElement: () => $row, getData: () => record};
            if(this.settings && typeof this.settings.rowFormatter === "function") {
                this.settings.rowFormatter(row);
            }
            this.rows.push(row);
            if(!silent) {
                this.emit("dataChanged");
            }
            return row;
        }
        addRow(record) {
            return Promise.resolve(this.add(record));
        }
        /*  Like Tabulator, `dataChanged` once per row, inside the call.  */
        addData(records) {
            return Promise.resolve(records.map((record) => this.add(record)));
        }
        /*  What the trash of a row ends in (row.delete()).  */
        delete_row() {
            const row = this.rows.pop();
            row.getElement().remove();
            this.emit("dataChanged");
        }
        /*  What an edited cell says.  */
        edit_cell() {
            this.emit("dataChanged");
        }
        validate() {
            return true;
        }
        clearData() {
            for(const row of this.rows) {
                row.getElement().remove();
            }
            this.rows = [];
        }
        setLocale(name) {
            this.locale = name;
        }
        destroy() {
        }
    }
    return {TabulatorFull: FakeTabulator, Tabulator: FakeTabulator};
});

const {
    SDATA_END, gclass_create,
    gobj_start_up, gobj_create_yuno, gobj_create_pure_child,
    gobj_start, gobj_send_event, gobj_read_attr,
    set_log_callback,
} = await import("@yuneta/gobj-js");
const {register_c_yui_form} = await import("./c_yui_form.js");
const i18next = (await import("i18next")).default;

const logged = [];
let yuno = null;

/*  A device's settings, cut down: a defaulted field, and the alarms as
 *  a table whose rows carry a nested table of triggers.  */
const TEMPLATE = {
    template_version: {
        type: "integer",
        default: 7,
        flag: ["hidden", "persistent"]
    },
    level: {
        type: "integer",
        default: 3,
        flag: ["writable", "persistent"]
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
                    }
                }
            }
        }
    }
};

/*  `level` missing: the form opens changed.  */
const LACKING = {
    template_version: 7,
    alarms: [{name: "hot", triggers: [{measure: "temperature"}]}]
};

const COMPLETE = {
    template_version: 7,
    level: 3,
    alarms: [{name: "hot", triggers: [{measure: "temperature"}]}]
};

beforeAll(async () => {
    await i18next.init({
        lng: "en",
        resources: {
            en: {translation: {"alarm name": "Alarm name", "measure": "Measure"}},
            es: {translation: {"alarm name": "Nombre de la alarma", "measure": "Medida"}}
        }
    });
    gobj_start_up(null, null, null, null, null, null, null);
    set_log_callback((level, msg) => {
        logged.push({level: String(level), msg: String(msg)});
    });
    gclass_create("C_TEST_TE_HOST", [], [["ST_IDLE", []]], {}, 0, [SDATA_END()], {}, 0, 0, 0, 0);
    gclass_create(
        "C_TEST_TE_APP",
        [["EV_SAVE_RECORD", 0]],
        [["ST_IDLE", [
            ["EV_SAVE_RECORD", () => 0, null],
        ]]],
        {}, 0, [SDATA_END()], {}, 0, 0, 0, 0
    );
    register_c_yui_form();
    yuno = gobj_create_yuno("form_table_edits_yuno", "C_TEST_TE_HOST", {});
    gobj_start(yuno);
});

beforeEach(async () => {
    logged.length = 0;
    await i18next.changeLanguage("en");
});

let seq = 0;

function build(record)
{
    const first = tables.length;
    const app = gobj_create_pure_child(`teapp${++seq}`, "C_TEST_TE_APP", {}, yuno);
    gobj_start(app);
    const form = gobj_create_pure_child(`teform${seq}`, "C_YUI_FORM", {
        template: TEMPLATE,
        record: record,
        editable: true,
    }, app);
    gobj_start(form);
    return {form, first};
}

/*  The tables the form built since `first`: the alarms table first,
 *  then a triggers table per alarm row drawn.  */
function built(first)
{
    return tables.slice(first);
}

/*  The microtasks of addRow().then(): the nested rows load there.  */
async function settle()
{
    await new Promise(resolve => setTimeout(resolve, 0));
}

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

describe("a form that opens changed hears what the reader does to its tables", () => {
    test("it opens changed, not edited, and closes without asking", async () => {
        const {form, first} = build(LACKING);
        await settle();
        expect(gobj_read_attr(form, "changes")).toBe(true);
        expect(gobj_read_attr(form, "edited")).toBe(false);
        expect(built(first).length).toBe(2);     // the alarms, and the triggers of its row
        expect(close_asks(form)).toBe("");
        expect(errors()).toEqual([]);
    });

    test("an edited cell makes it ask", async () => {
        const {form, first} = build(LACKING);
        await settle();
        built(first)[0].edit_cell();
        expect(gobj_read_attr(form, "edited")).toBe(true);
        expect(close_asks(form)).toBe("all changes will be lost");
        expect(errors()).toEqual([]);
    });

    test("a deleted row makes it ask", async () => {
        const {form, first} = build(LACKING);
        await settle();
        built(first)[0].delete_row();
        expect(close_asks(form)).toBe("all changes will be lost");
    });

    test("a row the reader adds makes it ask; the rows the form loads do not", async () => {
        const {form, first} = build(LACKING);
        await settle();
        const alarms = built(first)[0];
        expect(alarms.rows.length).toBe(1);     // loaded: no question
        expect(close_asks(form)).toBe("");

        /*  What the table's add button sends: the reader's row.  */
        const tables_before = tables.length;
        gobj_send_event(form, "EV_ADD_TABLE_ROW", {
            table_id: alarms.element.yui_table_id,
            record: {}
        }, form);
        expect(alarms.rows.length).toBe(2);
        expect(tables.length).toBe(tables_before + 1);  // the new row's triggers table
        expect(gobj_read_attr(form, "edited")).toBe(true);
        expect(close_asks(form)).toBe("all changes will be lost");
        expect(errors()).toEqual([]);
    });

    test("an edit of a NESTED table makes it ask, also one drawn after the load", async () => {
        const loaded = build(LACKING);
        await settle();
        const triggers = built(loaded.first)[1];
        expect(triggers.rows.length).toBe(1);     // loaded in its row: no question
        expect(close_asks(loaded.form)).toBe("");
        triggers.edit_cell();
        expect(close_asks(loaded.form)).toBe("all changes will be lost");

        /*  An undo draws the rows again, and each row builds its triggers
         *  table then: a table that did not exist when the form loaded.  */
        const before_undo = tables.length;
        gobj_send_event(loaded.form, "EV_UNDO_RECORD", {}, loaded.form);
        await settle();
        expect(close_asks(loaded.form)).toBe("");
        const redrawn = tables.slice(before_undo);
        expect(redrawn.length).toBe(1);
        expect(redrawn[0].rows.length).toBe(1);
        redrawn[0].edit_cell();
        expect(close_asks(loaded.form)).toBe("all changes will be lost");
        expect(errors()).toEqual([]);
    });

    test("a record loaded LATER that lacks a field (a reload, a refused save) still hears them", async () => {
        const {form, first} = build(COMPLETE);
        await settle();
        expect(gobj_read_attr(form, "changes")).toBe(false);
        gobj_send_event(form, "EV_LOAD_RECORD", LACKING, form);
        await settle();
        expect(gobj_read_attr(form, "changes")).toBe(true);
        expect(gobj_read_attr(form, "edited")).toBe(false);
        expect(close_asks(form)).toBe("");
        built(first)[0].edit_cell();
        expect(close_asks(form)).toBe("all changes will be lost");
        expect(errors()).toEqual([]);
    });

    test("a table built after the load (tableBuilt) takes its rows without a question", async () => {
        const {form, first} = build(COMPLETE);
        await settle();
        const alarms = built(first)[0];
        /*  A table not built yet: no rows, and the ones it is given wait
         *  for its `tableBuilt`.  */
        alarms.clearData();
        alarms.initialized = false;
        gobj_send_event(form, "EV_LOAD_RECORD", LACKING, form);
        await settle();
        expect(alarms.rows.length).toBe(0);
        /*  Tabulator builds the table now, long after the load returned.  */
        alarms.initialized = true;
        alarms.emit("tableBuilt");
        await settle();
        expect(alarms.rows.length).toBe(1);
        expect(gobj_read_attr(form, "edited")).toBe(false);
        expect(close_asks(form)).toBe("");
        expect(errors()).toEqual([]);
    });

    test("with a complete record it asks as before", async () => {
        /*  The waits are the 200 ms after which 7.26.40 wired the tables
         *  again: with them this case passes on the code before too.  */
        const wait = () => new Promise(resolve => setTimeout(resolve, 260));
        const {form, first} = build(COMPLETE);
        await wait();
        expect(gobj_read_attr(form, "changes")).toBe(false);
        built(first)[1].edit_cell();
        expect(close_asks(form)).toBe("all changes will be lost");
        gobj_send_event(form, "EV_SAVE_RECORD", {}, form);
        expect(close_asks(form)).toBe("");
        await wait();
        built(first)[0].edit_cell();
        expect(close_asks(form)).toBe("all changes will be lost");
        expect(errors()).toEqual([]);
    });
});

describe("the column titles of the tables change language", () => {
    test("each table, nested ones too, is given its titles in the new language", async () => {
        const {form, first} = build(COMPLETE);
        await settle();
        const [alarms, triggers] = built(first);

        await i18next.changeLanguage("es");
        gobj_send_event(form, "EV_LANGUAGE_CHANGED", {}, form);

        expect(alarms.locale).toBeTruthy();
        expect(alarms.installed[alarms.locale].columns).toEqual({
            name: "Nombre de la alarma",
            triggers: "triggers"
        });
        expect(triggers.installed[triggers.locale].columns).toEqual({measure: "Medida"});
        /*  No column was rebuilt to get there: the rows (and the nested
         *  table) are the ones loaded.  */
        expect(alarms.rows.length).toBe(1);
        expect(triggers.rows.length).toBe(1);
        expect(errors()).toEqual([]);
    });
});
