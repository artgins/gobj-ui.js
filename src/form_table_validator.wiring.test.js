/***********************************************************************
 *          form_table_validator.wiring.test.js
 *
 *      A table field of a C_YUI_FORM ('exec' mode) and its validators.
 *
 *      - A template item may carry Tabulator validators of its own
 *        (`validator`: a name or a function), which its column runs
 *        besides `required`: what a host knows and a schema cannot say
 *        (a consumer app refuses a trigger value that its measure can
 *        never match).
 *      - A table that does not validate refuses the save. Tabulator's
 *        validate() answers `true` or the LIST of the bad cells, and
 *        validate_form() asked `!validate()`, which a list never is: a
 *        `required` cell left empty was saved.
 *
 *      Driven through the real gclass on a document double, with a
 *      Tabulator double that keeps its settings and answers validate()
 *      as told.
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
            this.$el = $el;
            this.settings = settings;
            this.externalEvents = {events: {}};
            this.initialized = true;
            this.answer = true;     // what validate() says
            this.validated = 0;
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
        validate() {
            this.validated++;
            return this.answer;
        }
        getRows() {
            return [];
        }
        destroy() {
        }
    }
    return {TabulatorFull: FakeTabulator, Tabulator: FakeTabulator};
});

const {
    SDATA_END, gclass_create,
    gobj_start_up, gobj_create_yuno, gobj_create_pure_child,
    gobj_start, gobj_send_event,
    set_log_callback,
} = await import("@yuneta/gobj-js");
const {register_c_yui_form} = await import("./c_yui_form.js");

const saved = [];
let yuno = null;

beforeAll(async () => {
    const i18next = (await import("i18next")).default;
    await i18next.init({lng: "en", resources: {}});
    gobj_start_up(null, null, null, null, null, null, null);
    set_log_callback(() => {
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
    yuno = gobj_create_yuno("form_validator_yuno", "C_TEST_FORM_HOST", {});
    gobj_start(yuno);
});

beforeEach(() => {
    saved.length = 0;
    tables.length = 0;
});

let seq = 0;

/*  The alarms of an app's device, cut down: a table whose
 *  `value` column carries a validator the host added.  */
function build(validator)
{
    const value = {
        type: "string",
        flag: ["writable", "persistent"]
    };
    if(validator) {
        value.validator = validator;
    }
    const app = gobj_create_pure_child(`vapp${++seq}`, "C_TEST_FORM_APP", {}, yuno);
    gobj_start(app);
    const form = gobj_create_pure_child(`vform${seq}`, "C_YUI_FORM", {
        template: {
            triggers: {
                type: "array",
                flag: ["persistent", "writable", "table"],
                table: {
                    id: {
                        type: "string",
                        flag: ["writable", "persistent", "required"]
                    },
                    value: value
                }
            }
        },
        record: {triggers: []},
        editable: true,
    }, app);
    gobj_start(form);
    expect(tables.length).toBe(1);
    return {form, table: tables[0]};
}

function column(table, field)
{
    return table.settings.columns.find((c) => c.field === field);
}

describe("a table field's validators", () => {
    test("a template item's validator runs in its column, besides required", () => {
        const fits = () => true;
        const {table} = build(fits);
        expect(column(table, "id").validator).toEqual(["required"]);
        expect(column(table, "value").validator).toEqual([fits]);
    });

    test("a list of them, names and functions, is taken whole", () => {
        const fits = () => true;
        const {table} = build(["numeric", fits]);
        expect(column(table, "value").validator).toEqual(["numeric", fits]);
    });

    test("an item without one keeps what the schema says", () => {
        const {table} = build(null);
        expect(column(table, "value").validator).toEqual([]);
    });

    test("a table with a bad cell refuses the save, and shows the cell", () => {
        const {form, table} = build(null);
        const $cell = document.createElement("div");
        let shown = 0;
        $cell.scrollIntoView = () => {
            shown++;
        };
        table.answer = [{getElement: () => $cell}];      // what Tabulator answers
        gobj_send_event(form, "EV_SAVE_RECORD", {}, form);
        expect(table.validated).toBe(1);
        expect(saved).toEqual([]);
        expect(shown).toBe(1);

        table.answer = true;
        gobj_send_event(form, "EV_SAVE_RECORD", {}, form);
        expect(saved.length).toBe(1);
    });
});
