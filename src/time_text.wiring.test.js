/***********************************************************************
 *          time_text.wiring.test.js
 *
 *      A time value a view shows as text is shown in the APP's language
 *      (i18next's, never the browser's) with a clock of 24 hours, the
 *      same in the four views that show one (fmt_date_time of
 *      yui_time.js), and it changes language with the app: on the
 *      shell's EV_LANGUAGE_CHANGED.
 *
 *      Up to gobj-ui 7.26.51:
 *        - C_YUI_TREEDB_TOPIC_WITH_FORM wrote its time cells in the
 *          BROWSER's language with `hour12: true` ("14 oct 2026,
 *          03:05:09 p. m."), so the app's language button changed
 *          nothing in them;
 *        - C_YUI_FORM wrote "2026-10-14 15:05:09";
 *        - C_YUI_JSON wrote toLocaleString() beside a time field, and
 *          never heard the language change: it did not subscribe to
 *          the shell, and no host forwarded the event;
 *        - C_YUI_UPLOT let uPlot write its English 12 hours ("3pm",
 *          legend "2026-03-14 3:26pm"), and never heard the change.
 *
 *      Driven through the real gclasses and the real shell on a document
 *      double, with a Tabulator double that draws a cell by running its
 *      column's formatter, and draws every row again on setColumns(), as
 *      Tabulator does. The real Tabulator is checked in the browser.
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
if(typeof globalThis.matchMedia === "undefined") {
    globalThis.matchMedia = () => ({matches: false, addEventListener() {}, removeEventListener() {}});
}

const tables = vi.hoisted(() => []);
vi.mock("tabulator-tables", () => {
    class FakeTabulator {
        constructor($el, settings) {
            this.element = $el;
            this.settings = settings;
            this.options = Object.assign({}, settings);
            this.columns = (settings && settings.columns) || [];
            this.handlers = {};
            this.initialized = false;
            this.destroyed = false;
            this.rows = [];
            this.calls = {setColumns: 0};
            this.modules = {
                localize: {
                    installLang: () => {
                    }
                },
                edit: {currentCell: false}
            };
            tables.push(this);
            setTimeout(() => {
                if(!this.destroyed) {
                    for(const record of (settings && settings.data) || []) {
                        this.add(record);
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
                    if(typeof prop === "string" && prop.startsWith("_")) {
                        return undefined;   // a property a view hangs on it
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
        leaf_columns() {
            const out = [];
            const walk = (defs) => {
                for(const def of defs || []) {
                    if(def.columns) {
                        walk(def.columns);
                    } else if(def.field) {
                        out.push(def);
                    }
                }
            };
            walk(this.columns);
            return out;
        }
        /*  A cell as Tabulator draws it: its element holds what the
         *  column's formatter returns.  */
        draw_cell(row, def) {
            const cell = row.cells[def.field] || {
                $el: document.createElement("div"),
                getValue: () => row.data[def.field],
                getData: () => row.data,
                getField: () => def.field,
                getRow: () => row.component,
                getElement: () => cell.$el,
            };
            row.cells[def.field] = cell;
            cell.$el.className = "tabulator-cell";
            while(cell.$el.firstChild) {
                cell.$el.removeChild(cell.$el.firstChild);
            }
            const out = (typeof def.formatter === "function")?
                def.formatter(cell, def.formatterParams || {}, () => {}) : row.data[def.field];
            if(out && typeof out === "object") {
                cell.$el.appendChild(out);
            } else if(out !== undefined && out !== null) {
                cell.$el.textContent = String(out);
            }
        }
        draw_row(row) {
            for(const def of this.leaf_columns()) {
                this.draw_cell(row, def);
            }
        }
        add(record) {
            const row = {data: record, cells: {}};
            row.component = {
                getData: () => row.data,
                getElement: () => document.createElement("div"),
                getCells: () => Object.values(row.cells),
            };
            this.rows.push(row);
            this.draw_row(row);
            return row.component;
        }
        addRow(record) {
            return Promise.resolve(this.add(record));
        }
        addData(records) {
            return Promise.resolve(records.map((record) => this.add(record)));
        }
        setData(records) {
            this.rows = [];
            for(const record of records || []) {
                this.add(record);
            }
            return Promise.resolve();
        }
        clearData() {
            this.rows = [];
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
        getColumns(structured) {
            if(structured) {
                return [];
            }
            return this.leaf_columns().map((def) => ({
                getDefinition: () => def,
                getField: () => def.field,
                getElement: () => null,
                getCells: () => this.rows.filter((row) => row.cells[def.field])
                    .map((row) => row.cells[def.field]),
            }));
        }
        getColumnDefinitions() {
            return this.columns;
        }
        /*  Tabulator draws every row again with the new columns.  */
        setColumns(defs) {
            this.calls.setColumns++;
            this.columns = defs;
            for(const row of this.rows) {
                this.draw_row(row);
            }
        }
        cell_text(index, field) {
            return this.rows[index].cells[field].$el.textContent;
        }
        validate() {
            return true;
        }
        destroy() {
            this.destroyed = true;
        }
    }
    return {TabulatorFull: FakeTabulator, Tabulator: FakeTabulator};
});

/*  uPlot draws on a canvas the document double has not: this one keeps
 *  its options, and writes a tick and the legend with them as uPlot
 *  does -- through `fmtDate` -- on a build, a redraw and a setLegend.  */
const plots = vi.hoisted(() => []);
vi.mock("uplot", async () => {
    if(typeof globalThis.devicePixelRatio === "undefined") {
        globalThis.devicePixelRatio = 1;
    }
    const real = (await vi.importActual("uplot")).default;
    class FakeUPlot {
        constructor(opts, data, $el) {
            this.opts = opts;
            this.series = [{}];
            this.data = data;
            this.root = $el;
            this.cursor = {idx: 0};
            const fmt = opts.fmtDate || ((tpl) => real.fmtDate(tpl));
            this.tick_of = fmt("{h}{aa}");
            this.legend_of = fmt("{YYYY}-{MM}-{DD} {h}:{mm}{aa}");
            this.calls = {redraw: 0, setLegend: 0};
            plots.push(this);
            this.draw();
        }
        draw() {
            this.tick = this.tick_of(this.at);
            this.legend = this.legend_of(this.at);
        }
        redraw() {
            this.calls.redraw++;
            this.draw();
        }
        setLegend() {
            this.calls.setLegend++;
            this.legend = this.legend_of(this.at);
        }
        setSize() {
        }
        destroy() {
        }
    }
    FakeUPlot.prototype.at = new Date(2026, 2, 14, 15, 26, 53);
    return {default: FakeUPlot};
});

const {
    SDATA_END, gclass_create,
    gobj_start_up, gobj_create_yuno, gobj_create, gobj_create_pure_child,
    gobj_create_service, gobj_start, gobj_stop, gobj_destroy,
    gobj_read_attr, gobj_send_event,
    set_log_callback,
} = await import("@yuneta/gobj-js");
const {register_c_yui_shell, yui_shell_language_changed} = await import("./c_yui_shell.js");
const {register_c_yui_form} = await import("./c_yui_form.js");
const {register_c_yui_json} = await import("./c_yui_json.js");
const {register_c_yui_treedb_topic_with_form} = await import("./c_yui_treedb_topic_with_form.js");
const {register_c_yui_uplot} = await import("./c_yui_uplot.js");

const logged = [];
let yuno = null;
let shell = null;
let i18next = null;

/*  A local wall time and its epoch, whatever the zone of the run.  */
const WALL = new Date(2026, 2, 14, 9, 26, 53);
const EPOCH = Math.floor(WALL.getTime() / 1000);
const ISO = WALL.toISOString();
const ES = "14 mar 2026, 09:26:53";
const EN = "Mar 14, 2026, 09:26:53";

beforeAll(async () => {
    i18next = (await import("i18next")).default;
    await i18next.init({lng: "es", resources: {}});
    gobj_start_up(null, null, null, null, null, null, null);
    set_log_callback((level, msg) => {
        logged.push({level: String(level), msg: String(msg)});
    });
    gclass_create("C_TEST_TT_HOST", [], [["ST_IDLE", []]], {}, 0, [SDATA_END()], {}, 0, 0, 0, 0);
    gclass_create(
        "C_TEST_TT_APP",
        [["EV_EXPAND_PATH", 0]],
        [["ST_IDLE", [["EV_EXPAND_PATH", () => 0, null]]]],
        {}, 0, [SDATA_END()], {}, 0, 0, 0, 0
    );
    register_c_yui_shell();
    register_c_yui_form();
    register_c_yui_json();
    register_c_yui_treedb_topic_with_form();
    register_c_yui_uplot();
    yuno = gobj_create_yuno("time_text_yuno", "C_TEST_TT_HOST", {});
    gobj_start(yuno);
    shell = gobj_create("time_text_shell", "C_YUI_SHELL", {config: {
        shell: {
            zones: {center: {host: "stage.main"}},
            stages: {main: {zone: "center", default_route: "/home"}}
        },
        menu: {primary: {items: []}}
    }}, yuno);
    gobj_start(shell);
});

beforeEach(async () => {
    logged.length = 0;
    await i18next.changeLanguage("es");
});

function errors()
{
    return logged.filter(l => /error/i.test(l.level) || /ERROR/.test(l.msg));
}

/*  What the app does when the reader picks a language.  */
async function switch_language(lng)
{
    await i18next.changeLanguage(lng);
    yui_shell_language_changed(shell);
}

function settle()
{
    return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("the time cells of C_YUI_FORM", () => {
    test("are the app's language and 24 hours, and change with it", async () => {
        const first = tables.length;
        const app = gobj_create_pure_child("tt_app_form", "C_TEST_TT_APP", {}, yuno);
        gobj_start(app);
        const form = gobj_create_pure_child("tt_form", "C_YUI_FORM", {
            template: {
                events: {
                    type: "array",
                    flag: ["writable", "persistent", "table"],
                    table: {
                        when: {type: "integer", flag: ["writable", "persistent", "time"]},
                        at: {type: "string", flag: ["writable", "persistent", "time"]},
                        noon: {type: "integer", flag: ["writable", "persistent", "time"]}
                    }
                }
            },
            record: {events: [{
                when: EPOCH, at: ISO,
                noon: Math.floor(new Date(2026, 2, 14, 12, 0, 0).getTime() / 1000)
            }]},
            editable: true,
        }, app);
        gobj_start(form);
        await settle();
        await settle();
        const table = tables[first];
        expect(table.rows.length).toBe(1);

        expect(table.cell_text(0, "when")).toBe(ES);
        expect(table.cell_text(0, "at")).toBe(ES);
        expect(table.cell_text(0, "noon")).toBe("14 mar 2026, 12:00:00");

        /*  A cell being edited is its editor's: left alone.  */
        const $editing = table.rows[0].cells.at.$el;
        $editing.classList.add("tabulator-editing");

        await switch_language("en");
        expect(table.cell_text(0, "when")).toBe(EN);
        expect(table.cell_text(0, "noon")).toBe("Mar 14, 2026, 12:00:00");
        expect(table.cell_text(0, "at")).toBe(ES);

        $editing.classList.remove("tabulator-editing");
        await switch_language("en");
        expect(table.cell_text(0, "at")).toBe(EN);
        await switch_language("es");
        expect(table.cell_text(0, "when")).toBe(ES);
        expect(table.cell_text(0, "at")).toBe(ES);

        gobj_stop(form);
        gobj_destroy(form);
        expect(errors()).toEqual([]);
    });
});

describe("the time cells of C_YUI_TREEDB_TOPIC_WITH_FORM", () => {
    test("are the app's language and 24 hours, not the browser's 12, and change with it", async () => {
        const first = tables.length;
        const view = gobj_create_service("tt_topic", "C_YUI_TREEDB_TOPIC_WITH_FORM", {
            treedb_name: "treedb_test",
            topic_name: "events",
            desc: {id: "events", pkey: "id", cols: [
                {id: "id", header: "Id", type: "string", flag: ["persistent", "required"]},
                {id: "at", header: "at", type: "string", flag: ["persistent", "time"]},
                {id: "when", header: "when", type: "integer", flag: ["persistent", "time"]},
                {id: "midnight", header: "midnight", type: "integer", flag: ["persistent", "time"]}
            ]}
        }, yuno);
        gobj_start(view);
        await settle();
        const table = tables[first];
        expect(table._ready).toBe(true);
        gobj_send_event(view, "EV_LOAD_NODES", [{
            id: "a", at: ISO, when: EPOCH,
            midnight: Math.floor(new Date(2026, 2, 14, 0, 0, 0).getTime() / 1000)
        }, {
            id: "b", at: "not a time", when: null, midnight: undefined
        }], view);
        expect(table.rows.length).toBe(2);
        /*  What a text column holds when it is not a time is shown as
         *  it is, as in the form; no time is nothing.  */
        expect(table.cell_text(1, "at")).toBe("not a time");
        expect(table.cell_text(1, "when")).toBe("");
        expect(table.cell_text(1, "midnight")).toBe("");

        expect(table.cell_text(0, "when")).toBe(ES);
        expect(table.cell_text(0, "at")).toBe(ES);
        expect(table.cell_text(0, "midnight")).toBe("14 mar 2026, 00:00:00");

        const before = table.calls.setColumns;
        await switch_language("en");
        expect(table.calls.setColumns).toBe(before + 1);
        expect(table.cell_text(0, "when")).toBe(EN);
        expect(table.cell_text(0, "at")).toBe(EN);
        expect(table.cell_text(0, "midnight")).toBe("Mar 14, 2026, 00:00:00");

        gobj_stop(view);
        gobj_destroy(view);
        expect(errors()).toEqual([]);
    });
});

describe("the reading C_YUI_JSON writes beside a time field", () => {
    test("is the app's language and 24 hours, and changes with it", async () => {
        const app = gobj_create_pure_child("tt_app_json", "C_TEST_TT_APP", {}, yuno);
        gobj_start(app);
        const viewer = gobj_create("tt_json", "C_YUI_JSON", {view_mode: "tree"}, app);
        gobj_start(viewer);
        gobj_send_event(viewer, "EV_SET_JSON", {json: {t: EPOCH, tm: EPOCH * 1000 + 250}}, app);
        const $c = gobj_read_attr(viewer, "$container");
        const readings = () => Array.from($c.querySelectorAll(".JSON_TIME")).map(($s) => $s.textContent);

        expect(readings()).toEqual([ES, ES]);

        await switch_language("en");
        expect(readings()).toEqual([EN, EN]);

        /*  Stopped, it hears the shell no more.  */
        gobj_stop(viewer);
        await switch_language("es");
        expect(readings()).toEqual([EN, EN]);

        gobj_destroy(viewer);
        expect(errors()).toEqual([]);
    });
});

describe("the moments C_YUI_UPLOT writes", () => {
    test("a tick and the legend are the app's language and 24 hours, and change with it", async () => {
        const first = plots.length;
        const app = gobj_create_pure_child("tt_app_plot", "C_TEST_TT_APP", {}, yuno);
        gobj_start(app);
        const chart = gobj_create("tt_plot", "C_YUI_UPLOT", {}, app);
        gobj_start(chart);
        const plot = plots[first];
        expect(plot.tick).toBe("15:00");
        expect(plot.legend).toBe("14 mar 2026, 15:26:53");

        await switch_language("en");
        expect(plot.calls.redraw).toBe(1);
        expect(plot.calls.setLegend).toBe(1);
        expect(plot.legend).toBe("Mar 14, 2026, 15:26:53");

        gobj_stop(chart);
        await switch_language("es");
        expect(plot.calls.redraw).toBe(1);

        gobj_destroy(chart);
        expect(errors()).toEqual([]);
    });
});
