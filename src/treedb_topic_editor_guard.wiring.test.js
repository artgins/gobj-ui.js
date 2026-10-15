/***********************************************************************
 *          treedb_topic_editor_guard.wiring.test.js
 *
 *      C_YUI_TREEDB_TOPIC_WITH_FORM cancels an open cell editor before
 *      each call of its table that would throw under it in Tabulator
 *      6.6.0: setData (EV_LOAD_NODES), replaceData (EV_REPULL_PAGE),
 *      destroy (mt_stop), and updateData (EV_LOAD_NODE_UPDATED) that
 *      changes the cell being edited -- not the backend echo of the
 *      write the reader just made of the previous cell, which arrives
 *      while the next cell's editor is open and must leave it. A
 *      refused updateData is logged, not left unhandled. The table is a
 *      double that records the order of the calls; that the real
 *      Tabulator throws without this is proved in a browser by
 *      scripts/qa-cell-editor.mjs.
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

const state = vi.hoisted(() => ({tables: [], calls: [], edited_row: null, edited_field: "age", refuse: false}));
vi.mock("tabulator-tables", () => {
    class FakeTabulator {
        constructor($el, settings) {
            this.element = $el;
            this.options = settings;
            this.modules = {edit: {
                get currentCell() {
                    return state.edited_row? {row: state.edited_row} : false;
                },
                cancelEdit() {
                    state.calls.push(`cancel ${state.edited_row}`);
                    state.edited_row = null;
                },
            }};
            state.tables.push(this);
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
        getRow(id) {
            return {
                getElement: () => ({
                    querySelector: (s) => (s === ".tabulator-editing" && state.edited_row === id)?
                        {getAttribute: (a) => (a === "tabulator-field")? state.edited_field : null} : null,
                }),
                getData: () => ({id, name: `${id}0`, age: 41}),
            };
        }
        getDataCount() {
            return 2;
        }
        setData() {
            state.calls.push(`setData edited=${state.edited_row}`);
        }
        replaceData() {
            state.calls.push(`replaceData edited=${state.edited_row}`);
        }
        updateData(records) {
            state.calls.push(`updateData ${records[0].id} edited=${state.edited_row}`);
            return state.refuse? Promise.reject("Update Error - Unable to update row") : Promise.resolve();
        }
        destroy() {
            state.calls.push(`destroy edited=${state.edited_row}`);
        }
    }
    return {TabulatorFull: FakeTabulator, Tabulator: FakeTabulator};
});

const {
    SDATA_END, gclass_create, set_log_callback, gobj_send_event, gobj_stop,
    gobj_start_up, gobj_create_yuno, gobj_create_service, gobj_start,
} = await import("@yuneta/gobj-js");
const {register_c_yui_treedb_topic_with_form} = await import("./c_yui_treedb_topic_with_form.js");

const logged = [];
let yuno = null;
let n = 0;

beforeAll(async () => {
    const i18next = (await import("i18next")).default;
    await i18next.init({lng: "en", resources: {}});
    gobj_start_up(null, null, null, null, null, null, null);
    set_log_callback((level, msg) => {
        logged.push({level: String(level), msg: String(msg)});
    });
    gclass_create("C_TEST_EDITOR_GUARD_HOST", [], [["ST_IDLE", []]], {}, 0, [SDATA_END()], {}, 0, 0, 0, 0);
    register_c_yui_treedb_topic_with_form();
    yuno = gobj_create_yuno("editor_guard_yuno", "C_TEST_EDITOR_GUARD_HOST", {});
    gobj_start(yuno);
});

beforeEach(() => {
    state.calls.length = 0;
    state.edited_row = null;
    state.refuse = false;
    logged.length = 0;
});

function make_view()
{
    const view = gobj_create_service(`editor_guard_view_${++n}`, "C_YUI_TREEDB_TOPIC_WITH_FORM", {
        treedb_name: "treedb_test",
        topic_name: "people",
        desc: {id: "people", pkey: "id", cols: [
            {id: "id", header: "Id", type: "string", flag: ["persistent", "required"]},
            {id: "name", header: "name", type: "string", flag: ["persistent", "writable"]},
        ]}
    }, yuno);
    gobj_start(view);
    state.tables[state.tables.length - 1]._ready = true;
    return view;
}

describe("an open cell editor of a treedb topic's table", () => {
    test("is cancelled before setData (EV_LOAD_NODES)", () => {
        const view = make_view();
        state.edited_row = "b";
        gobj_send_event(view, "EV_LOAD_NODES", [{id: "x"}], view);
        expect(state.calls).toEqual(["cancel b", "setData edited=null"]);
    });

    test("is cancelled before replaceData (EV_REPULL_PAGE)", () => {
        const view = make_view();
        state.edited_row = "b";
        gobj_send_event(view, "EV_REPULL_PAGE", {}, view);
        expect(state.calls).toEqual(["cancel b", "replaceData edited=null"]);
    });

    test("is cancelled before the table is destroyed (stop)", () => {
        const view = make_view();
        state.edited_row = "b";
        gobj_stop(view);
        expect(state.calls).toEqual(["cancel b", "destroy edited=null"]);
    });

    test("is cancelled, with a WARNING, before updateData changes ITS cell; left alone otherwise", () => {
        const view = make_view();
        state.edited_row = "b";
        gobj_send_event(view, "EV_LOAD_NODE_UPDATED", [{id: "a", age: 99}], view);
        /*  The echo of the reader's own write of the previous cell (7.26.58 cancelled here)  */
        gobj_send_event(view, "EV_LOAD_NODE_UPDATED", [{id: "b", name: "B"}], view);
        gobj_send_event(view, "EV_LOAD_NODE_UPDATED", [{id: "b", name: "B", age: 41}], view);
        expect(logged.filter((l) => /under its open editor/.test(l.msg)).length).toBe(0);
        gobj_send_event(view, "EV_LOAD_NODE_UPDATED", [{id: "b", age: 99}], view);
        expect(state.calls).toEqual([
            "updateData a edited=b",
            "updateData b edited=b",
            "updateData b edited=b",
            "cancel b", "updateData b edited=null",
        ]);
        expect(logged.filter((l) => /row 'b' changed 'age' under its open editor: the edit is cancelled/
            .test(l.msg)).length).toBe(1);
    });

    test("a refused updateData is logged as an error, not left unhandled", async () => {
        const view = make_view();
        state.refuse = true;
        gobj_send_event(view, "EV_LOAD_NODE_UPDATED", [{id: "a", name: "A"}], view);
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(logged.filter((l) => /cannot update row 'a'.*Unable to update row/.test(l.msg)).length).toBe(1);
    });
});
