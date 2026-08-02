import {describe, it, expect} from "vitest";
import {plan_toolbar, DEFAULT_TOOLBAR} from "./form_toolbar_plan.js";

describe("plan_toolbar", () => {

    it("says nothing -> the five buttons this gclass always had", () => {
        const p = plan_toolbar(undefined);
        expect(p.left).toEqual(["save", "undo", "clear"]);
        expect(p.right).toEqual(["copy", "paste"]);
        expect(p.unknown).toEqual([]);
        expect(DEFAULT_TOOLBAR.length).toBe(5);
    });

    it("a non-array is not an empty toolbar: it is the default", () => {
        /*  Reading a JSON attr that was never set must not silently
         *  leave a form with no save button. */
        for(const v of [null, "save", 0, {}]) {
            expect(plan_toolbar(v).left).toContain("save");
        }
    });

    it("[] leaves no toolbar at all", () => {
        const p = plan_toolbar([]);
        expect(p.left).toEqual([]);
        expect(p.right).toEqual([]);
        expect(p.unknown).toEqual([]);
    });

    it("one action: a dialog asks for save only", () => {
        const p = plan_toolbar(["save"]);
        expect(p.left).toEqual(["save"]);
        expect(p.right).toEqual([]);
    });

    it("keeps the order asked for inside each side", () => {
        const p = plan_toolbar(["clear", "save", "paste", "copy"]);
        expect(p.left).toEqual(["clear", "save"]);
        expect(p.right).toEqual(["paste", "copy"]);
    });

    it("an unknown name is REPORTED, never silently dropped", () => {
        /*  A typo here would otherwise remove a button and leave no
         *  trace of why it is missing. */
        const p = plan_toolbar(["save", "sav", "undo"]);
        expect(p.left).toEqual(["save", "undo"]);
        expect(p.unknown).toEqual(["sav"]);
    });

    it("drops one whole side without disturbing the other", () => {
        const p = plan_toolbar(["save", "undo", "clear"]);
        expect(p.left).toEqual(["save", "undo", "clear"]);
        expect(p.right).toEqual([]);
    });
});
