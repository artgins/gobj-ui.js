/***********************************************************************
 *          treedb_write_plan.test.js
 *
 *      What a read-only treedb topic must NOT offer, pinned.
 *
 *      The point of the file under test is that one flag beats five, so
 *      these tests are mostly about the ways someone could get a write
 *      affordance back by accident.
 ***********************************************************************/
import { describe, test, expect } from "vitest";
import { plan_treedb_writes, READONLY_FORM_TOOLBAR } from "./treedb_write_plan.js";

const WRITES = ["edition_mode", "new_button", "delete_button", "paste_button", "in_row_icons"];


describe("writable (the default)", () => {
    test("nothing set is everything on — the toolbar this view always had", () => {
        const plan = plan_treedb_writes({});
        for(const k of WRITES) {
            expect(plan[k]).toBe(true);
        }
        expect(plan.readonly).toBe(false);
    });

    test("an absent flags object behaves the same", () => {
        expect(plan_treedb_writes(undefined).new_button).toBe(true);
        expect(plan_treedb_writes(null).delete_button).toBe(true);
    });

    test("the form keeps its OWN default toolbar (null, not a copy of it)", () => {
        /*  Repeating the five names here is how the default drifts from
         *  C_YUI_FORM's; null says "do not touch it".  */
        expect(plan_treedb_writes({}).form_toolbar).toBe(null);
    });

    test("a single with_* off turns off only that one", () => {
        const plan = plan_treedb_writes({with_delete_button: false});
        expect(plan.delete_button).toBe(false);
        expect(plan.new_button).toBe(true);
        expect(plan.edition_mode).toBe(true);
    });
});


describe("readonly beats every with_*", () => {
    test("all write affordances off, even when each is explicitly asked for", () => {
        const plan = plan_treedb_writes({
            readonly:               true,
            with_edition_mode:      true,
            with_new_button:        true,
            with_delete_button:     true,
            with_paste_button:      true,
            with_in_row_edit_icons: true
        });
        for(const k of WRITES) {
            expect(plan[k]).toBe(false);
        }
    });

    test("the form opens with copy only — reading includes taking the record", () => {
        expect(plan_treedb_writes({readonly: true}).form_toolbar).toEqual(["copy"]);
    });

    test("the plan hands out a COPY of the toolbar, so a caller cannot mutate the constant", () => {
        const plan = plan_treedb_writes({readonly: true});
        plan.form_toolbar.push("save");
        expect(READONLY_FORM_TOOLBAR).toEqual(["copy"]);
        expect(plan_treedb_writes({readonly: true}).form_toolbar).toEqual(["copy"]);
    });

    test("readonly is reported, so the gclass can refuse the EVENTS too", () => {
        /*  Hiding the buttons is not the same as refusing the write: an
         *  event can still arrive from a keyboard path or a stale form.  */
        expect(plan_treedb_writes({readonly: true}).readonly).toBe(true);
    });

    test("only a truthy readonly counts — a missing flag is writable", () => {
        expect(plan_treedb_writes({readonly: false}).new_button).toBe(true);
        expect(plan_treedb_writes({readonly: 0}).new_button).toBe(true);
        expect(plan_treedb_writes({readonly: undefined}).new_button).toBe(true);
        expect(plan_treedb_writes({readonly: "yes"}).new_button).toBe(false);
    });
});
