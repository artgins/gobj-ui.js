/***********************************************************************
 *          shell_stop_overlays.wiring.test.js
 *
 *      A shell stopped with an overlay up -- a logout, a session cut
 *      with the drawer or a dialog open -- closes the overlay first,
 *      as if it had been dismissed, and releases its focus trap. Up
 *      to gobj-ui 7.26.45 only the toolbar dropdown was closed: the
 *      trap of a drawer, a modal or a question stayed on the stack,
 *      every window opened afterwards believed itself under an
 *      overlay and took no focus, and the question's promise never
 *      settled.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {describe, test, expect, beforeAll, beforeEach, vi} from "vitest";
import {install_dom_double} from "../test/dom_double.js";

install_dom_double();

const {
    SDATA_END, gclass_create,
    gobj_start_up, gobj_create_yuno, gobj_create, gobj_start, gobj_stop, gobj_destroy,
    set_log_callback,
} = await import("@yuneta/gobj-js");
const {register_c_yui_shell, yui_shell_open_drawer} = await import("./c_yui_shell.js");
const {register_c_yui_nav} = await import("./c_yui_nav.js");
const {yui_shell_show_modal, yui_shell_confirm_yesno} = await import("./shell_modals.js");
const {focus_trap_panel} = await import("./shell_focus_trap.js");

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
    gclass_create("C_TEST_STOP_HOST", [], [["ST_IDLE", []]], {}, 0, [SDATA_END()], {}, 0, 0, 0, 0);
    register_c_yui_nav();
    register_c_yui_shell();
    yuno = gobj_create_yuno("stop_overlays_yuno", "C_TEST_STOP_HOST", {});
    gobj_start(yuno);
});

beforeEach(() => {
    logged.length = 0;
});

function errors()
{
    return logged.filter((l) => l.level === "error").map((l) => l.msg);
}

function settle()
{
    return new Promise(resolve => setTimeout(resolve, 0));
}

function make_shell(use_hash)
{
    seq++;
    const app = gobj_create(`sapp${seq}`, "C_TEST_STOP_HOST", {}, yuno);
    gobj_start(app);
    const shell = gobj_create(`sshell${seq}`, "C_YUI_SHELL", {
        config: {
            shell: {},
            menu: {
                quick: {
                    render: {overlay: "drawer"},
                    items: [{id: "home", name: "home", route: "/home"}]
                }
            }
        },
        subscriber: app,
        use_hash: !!use_hash
    }, app);
    gobj_start(shell);
    logged.length = 0;     /*  the shell's own start: no route table here  */
    return shell;
}

describe("a shell stopped with an overlay up", () => {
    test("the drawer, a modal and a question close, and no trap is left", async () => {
        const shell = make_shell();

        yui_shell_open_drawer(shell, "quick");
        const $drawer = document.querySelector(".is-active");
        expect($drawer).not.toBe(null);
        expect(focus_trap_panel()).not.toBe(null);

        let modal_closed = 0;
        yui_shell_show_modal(shell, "the sheet", {
            dialog:        true,
            logical_class: "TEST_STOP_SHEET",
            title:         "settings",
            /*  A guard is for the reader's dismissals, not for the
             *  shell going away.  */
            before_close:  () => false,
            on_close:      () => {
                modal_closed++;
            }
        });
        let answer = null;
        yui_shell_confirm_yesno(shell, "really?").then((a) => {
            answer = a;
        });
        expect(document.querySelectorAll(".TEST_STOP_SHEET").length).toBe(1);
        expect(document.querySelectorAll(".CONFIRM").length).toBe(1);

        gobj_stop(shell);
        gobj_destroy(shell);
        await settle();

        expect(focus_trap_panel()).toBe(null);
        expect(modal_closed).toBe(1);
        expect(answer).toBe(false);     /*  the answer Escape gives  */
        expect(document.querySelectorAll(".TEST_STOP_SHEET").length).toBe(0);
        expect(document.querySelectorAll(".CONFIRM").length).toBe(0);
        expect($drawer.classList.contains("is-active")).toBe(false);
        expect(errors()).toEqual([]);
    });

    test("destroyed without a stop, it closes them too", async () => {
        const shell = make_shell();

        yui_shell_open_drawer(shell, "quick");
        yui_shell_show_modal(shell, "the sheet", {
            dialog: true, logical_class: "TEST_STOP_SHEET", title: "settings"
        });
        expect(focus_trap_panel()).not.toBe(null);

        gobj_destroy(shell);
        await settle();

        expect(focus_trap_panel()).toBe(null);
        expect(document.querySelectorAll(".TEST_STOP_SHEET").length).toBe(0);
        /*  gobj-js says what the test did; nothing else is said.  */
        expect(errors().filter((m) => !m.includes("Destroying a RUNNING gobj"))).toEqual([]);
    });

    test("it moves no browser history: their markers are left in place", async () => {
        window.location.hash = "#/home";
        const shell = make_shell(true);

        yui_shell_show_modal(shell, "the sheet", {
            dialog: true, logical_class: "TEST_STOP_SHEET", title: "settings"
        });
        let answer = null;
        yui_shell_confirm_yesno(shell, "really?").then((a) => {
            answer = a;
        });
        expect(window.history.state && window.history.state.__yui_overlay__).toBeTruthy();

        /*  A stopped shell hears no landing: a back() of its own would be
         *  taken by whatever the next shell pushed in the same turn.  */
        const back = vi.spyOn(window.history, "back");
        try {
            gobj_stop(shell);
            gobj_destroy(shell);
            await settle();
            expect(back).not.toHaveBeenCalled();
        } finally {
            back.mockRestore();
            window.location.hash = "";
        }
        expect(answer).toBe(false);
        expect(document.querySelectorAll(".TEST_STOP_SHEET").length).toBe(0);
        expect(focus_trap_panel()).toBe(null);
        expect(errors()).toEqual([]);
    });
});
