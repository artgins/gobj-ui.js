/***********************************************************************
 *          modal_guard_back.wiring.test.js
 *
 *      A modal whose `before_close` guard ASKS (unsaved changes). The
 *      browser Back takes the modal's history entry before the guard
 *      runs; the guard opens a question, and the modal stays. When the
 *      modal took its entry back at once, it went ABOVE the question's
 *      own entry: the next Back -- the one meant for the question --
 *      reached the modal, which asked again, and every Back stacked
 *      one more question. A guard that asks answers the question's
 *      promise, and the modal takes its entry back once the question
 *      is over.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {describe, test, expect, beforeAll, beforeEach} from "vitest";
import {install_dom_double} from "../test/dom_double.js";

install_dom_double();

const {
    SDATA_END, gclass_create,
    gobj_start_up, gobj_create_yuno, gobj_create, gobj_start,
    set_log_callback,
} = await import("@yuneta/gobj-js");
const {register_c_yui_shell} = await import("./c_yui_shell.js");
const {
    yui_shell_show_modal,
    yui_shell_confirm_yesnocancel,
} = await import("./shell_modals.js");

const logged = [];
let yuno = null;
let seq = 0;

beforeAll(async () => {
    const i18next = (await import("i18next")).default;
    await i18next.init({lng: "en", resources: {}});
    gobj_start_up(null, null, null, null, null, null, null);
    set_log_callback((level, msg) => {
        logged.push({level: String(level), msg: String(msg)});
    });
    gclass_create("C_TEST_GUARD_HOST", [], [["ST_IDLE", []]], {}, 0, [SDATA_END()], {}, 0, 0, 0, 0);
    register_c_yui_shell();
    yuno = gobj_create_yuno("guard_yuno", "C_TEST_GUARD_HOST", {});
    gobj_start(yuno);
});

beforeEach(() => {
    logged.length = 0;
    /*  What a failed test left open belongs to its own shell.  */
    for(const $n of document.querySelectorAll(".CONFIRM, .TEST_SHEET")) {
        if($n.parentNode) {
            $n.parentNode.removeChild($n);
        }
    }
});

function errors()
{
    return logged.filter((l) => l.level === "error").map((l) => l.msg);
}

/*  Same Back as window_veto_back: a Back off a marker lands on the entry
 *  under it, which the shell stamped with the TOP overlay's id.  */
function press_back(shell)
{
    const stack = shell.priv.overlay_stack;
    const ev = new Event("popstate");
    ev.state = {__yui_below__: stack.length ? stack[stack.length - 1].id : 0};
    window.dispatchEvent(ev);
}

function settle()
{
    return new Promise(resolve => setTimeout(resolve, 0));
}

function sheets()
{
    return document.querySelectorAll(".TEST_SHEET").length;
}

function questions()
{
    return document.querySelectorAll(".CONFIRM").length;
}

/*  A shell, and a sheet over it whose guard asks while `state.dirty`.  */
function open_guarded_sheet(state)
{
    seq++;
    const app = gobj_create(`gapp${seq}`, "C_TEST_GUARD_HOST", {}, yuno);
    gobj_start(app);
    const shell = gobj_create(`gshell${seq}`, "C_YUI_SHELL",
        {config: {shell: {}}, default_route: "/home", subscriber: app}, app);
    gobj_start(shell);
    logged.length = 0;     /*  the shell's own start: no route table here  */

    const handle = yui_shell_show_modal(shell, "the sheet", {
        dialog:        true,
        logical_class: "TEST_SHEET",
        title:         "settings",
        before_close:  function() {
            if(!state.dirty) {
                return true;
            }
            state.asked++;
            return yui_shell_confirm_yesnocancel(shell, "all changes will be lost", {
                yes_label: "yes", no_label: "no", cancel_label: "cancel"
            }).then(function(answer) {
                if(answer === "yes") {
                    handle.close();
                }
            });
        }
    });
    return {shell, handle};
}

describe("a modal whose guard asks before it closes", () => {
    test("Back asks ONCE, and the next Back takes the question, not the modal", async () => {
        const state = {dirty: true, asked: 0};
        const {shell, handle} = open_guarded_sheet(state);
        expect(shell.priv.overlay_stack.length).toBe(1);

        /*  Back: the guard asks. The modal stays, and only the question
         *  is on the stack -- the modal's entry went with the Back.  */
        press_back(shell);
        expect(sheets()).toBe(1);
        expect(questions()).toBe(1);
        expect(state.asked).toBe(1);
        expect(shell.priv.overlay_stack.length).toBe(1);

        /*  Back again: it is the question that goes (its safe default,
         *  cancel), and the modal takes its entry back only then.  */
        press_back(shell);
        await settle();
        expect(questions()).toBe(0);
        expect(sheets()).toBe(1);
        expect(state.asked).toBe(1);
        expect(shell.priv.overlay_stack.length).toBe(1);

        /*  And a third Back asks again: one question, not two.  */
        press_back(shell);
        expect(questions()).toBe(1);
        expect(state.asked).toBe(2);
        press_back(shell);
        await settle();
        expect(questions()).toBe(0);
        expect(sheets()).toBe(1);
        expect(errors()).toEqual([]);

        handle.close();
        expect(sheets()).toBe(0);
    });

    test("the back arrow that asks leaves the modal's entry UNDER the question", async () => {
        const state = {dirty: true, asked: 0};
        const {shell, handle} = open_guarded_sheet(state);
        const entry = shell.priv.overlay_stack[0];

        document.querySelector(".TEST_SHEET .yui-dialog-back").click();
        expect(questions()).toBe(1);
        expect(shell.priv.overlay_stack.length).toBe(2);
        expect(shell.priv.overlay_stack[0]).toBe(entry);

        press_back(shell);
        await settle();
        expect(questions()).toBe(0);
        expect(sheets()).toBe(1);
        expect(shell.priv.overlay_stack).toEqual([entry]);
        expect(errors()).toEqual([]);

        handle.close();
        expect(sheets()).toBe(0);
    });

    test("with nothing to lose, Back closes it at once", async () => {
        const state = {dirty: false, asked: 0};
        const {shell} = open_guarded_sheet(state);
        expect(sheets()).toBe(1);

        press_back(shell);
        await settle();
        expect(sheets()).toBe(0);
        expect(questions()).toBe(0);
        expect(state.asked).toBe(0);
        expect(shell.priv.overlay_stack).toEqual([]);
        expect(errors()).toEqual([]);
    });
});
