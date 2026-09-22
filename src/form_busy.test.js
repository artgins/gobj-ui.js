import {describe, it, expect} from "vitest";
import {set_toolbar_busy} from "./form_busy.js";

/*  A toolbar double: the two things the helper touches on a button are
 *  `disabled` and `dataset`, and on the save button its class list.  */
function button(cls, disabled)
{
    const classes = new Set(cls.split(" "));
    return {
        disabled: disabled,
        dataset: {},
        classList: {
            toggle: (c, on) => {
                if(on) {
                    classes.add(c);
                } else {
                    classes.delete(c);
                }
            },
            contains: (c) => classes.has(c),
        },
    };
}

function toolbar()
{
    const save = button("button-save", false);
    const cancel = button("button-cancel", false);
    const undo = button("button-undo", true);     /*  disabled on its own  */
    const buttons = [save, cancel, undo];
    return {
        save, cancel, undo,
        $container: {
            querySelectorAll: () => buttons,
            querySelector: () => save,
        },
    };
}

describe("set_toolbar_busy", () => {

    it("busy then free: every button is as it was", () => {
        const tb = toolbar();
        const state = {busy: false};
        expect(set_toolbar_busy(tb.$container, state, true)).toBe(true);
        expect(tb.save.disabled).toBe(true);
        expect(tb.cancel.disabled).toBe(true);
        expect(tb.save.classList.contains("is-loading")).toBe(true);
        expect(set_toolbar_busy(tb.$container, state, false)).toBe(true);
        expect(tb.save.disabled).toBe(false);
        expect(tb.cancel.disabled).toBe(false);
        expect(tb.undo.disabled).toBe(true);
        expect(tb.save.classList.contains("is-loading")).toBe(false);
    });

    it("busy twice then free: Save and Cancel come back (N9)", () => {
        /*  A record with a picked file went busy for the read and busy
         *  again for the write; the second pass recorded the buttons the
         *  first had disabled as disabled on their own, and the free of a
         *  refused write left Save and Cancel dead.  */
        const tb = toolbar();
        const state = {busy: false};
        set_toolbar_busy(tb.$container, state, true);
        expect(set_toolbar_busy(tb.$container, state, true)).toBe(false);
        set_toolbar_busy(tb.$container, state, false);
        expect(tb.save.disabled).toBe(false);
        expect(tb.cancel.disabled).toBe(false);
        expect(tb.undo.disabled).toBe(true);
        expect(state.busy).toBe(false);
    });

    it("free while free touches nothing", () => {
        const tb = toolbar();
        const state = {busy: false};
        expect(set_toolbar_busy(tb.$container, state, false)).toBe(false);
        expect(tb.save.disabled).toBe(false);
        expect(tb.undo.disabled).toBe(true);
    });

    it("no container, no state: nothing, and says so", () => {
        expect(set_toolbar_busy(null, {busy: false}, true)).toBe(false);
        expect(set_toolbar_busy(toolbar().$container, null, true)).toBe(false);
    });
});
