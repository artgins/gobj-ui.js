/***********************************************************************
 *          shell_escape_taken.wiring.test.js
 *
 *      The shell's Escape closes the overlay on top of its chain (a
 *      dialog, a popup, the drawer) -- but not an Escape that what it
 *      was typed in took first. Up to 7.26.42 it closed the dialog for
 *      ANY Escape: one typed in a cell of a table being edited
 *      cancelled the edit (Tabulator removes the box) and closed the
 *      whole dialog with it.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {describe, test, expect, beforeAll, beforeEach} from "vitest";
import {install_dom_double, FakeElement} from "../test/dom_double.js";

install_dom_double();

Object.defineProperty(FakeElement.prototype, "isConnected", {
    configurable: true,
    get() {
        let n = this;
        while(n) {
            if(n === document.documentElement) {
                return true;
            }
            n = n.parentNode;
        }
        return false;
    }
});

const {
    SDATA_END, gclass_create,
    gobj_start_up, gobj_create_yuno, gobj_create, gobj_start,
    set_log_callback,
} = await import("@yuneta/gobj-js");
const {
    register_c_yui_shell, yui_shell_push_escape, yui_shell_pop_escape,
} = await import("./c_yui_shell.js");
const {activate_focus_trap_on} = await import("./shell_focus_trap.js");

/*  focus() moves document.activeElement, as in a browser.  */
FakeElement.prototype.focus = function() {
    document.activeElement = this;
};

const logged = [];
let shell = null;
let closed = 0;
const close_fn = () => {
    closed++;
};

/*  An Escape as the window hears it, after what it was typed in had
 *  its turn (`init` says what that did).  */
function escape_at(target, init)
{
    const ev = Object.assign({
        type: "keydown", key: "Escape", target: target,
        defaultPrevented: false, isComposing: false,
        preventDefault() {
            this.defaultPrevented = true;
        },
        stopPropagation() {
        }
    }, init || {});
    window.dispatchEvent(ev);
    return ev;
}

beforeAll(async () => {
    const i18next = (await import("i18next")).default;
    await i18next.init({lng: "en", resources: {}});
    gobj_start_up(null, null, null, null, null, null, null);
    set_log_callback((level, msg) => {
        logged.push({level: String(level), msg: String(msg)});
    });
    gclass_create("C_TEST_ESC_HOST", [], [["ST_IDLE", []]], {}, 0, [SDATA_END()], {}, 0, 0, 0, 0);
    register_c_yui_shell();
    const yuno = gobj_create_yuno("esc_yuno", "C_TEST_ESC_HOST", {});
    gobj_start(yuno);
    shell = gobj_create("eshell", "C_YUI_SHELL",
        {config: {shell: {}}, default_route: "/home"}, yuno);
    gobj_start(shell);
});

beforeEach(() => {
    closed = 0;
    yui_shell_push_escape(shell, "modal", close_fn);
});

describe("the shell's Escape", () => {
    test("closes the overlay on top", () => {
        const $button = document.createElement("button");
        document.body.appendChild($button);
        const ev = escape_at($button);
        expect(closed).toBe(1);
        expect(ev.defaultPrevented).toBe(true);
        yui_shell_pop_escape(shell, close_fn);
        $button.remove();
    });

    test("not one a widget used, nor one composing", () => {
        const $input = document.createElement("input");
        document.body.appendChild($input);
        escape_at($input, {defaultPrevented: true});
        escape_at($input, {isComposing: true});
        expect(closed).toBe(0);
        yui_shell_pop_escape(shell, close_fn);
        $input.remove();
    });

    test("not one that went with what it was typed in (a cell editor)", () => {
        const $editor = document.createElement("input");   /*  removed: detached  */
        escape_at($editor);
        expect(closed).toBe(0);
        yui_shell_pop_escape(shell, close_fn);
    });

    test("not one that clears a search box, but one in an empty search box", () => {
        const $search = document.createElement("input");
        $search.setAttribute("type", "search");
        $search.value = "abc";
        document.body.appendChild($search);
        escape_at($search);
        expect(closed).toBe(0);
        $search.value = "";
        escape_at($search);
        expect(closed).toBe(1);
        yui_shell_pop_escape(shell, close_fn);
        $search.remove();
    });

    test("not one typed in a text editor", () => {
        const $text = document.createElement("textarea");
        const $editable = document.createElement("div");
        $editable.isContentEditable = true;
        document.body.appendChild($text);
        document.body.appendChild($editable);
        escape_at($text);
        escape_at($editable);
        expect(closed).toBe(0);
        yui_shell_pop_escape(shell, close_fn);
        $text.remove();
        $editable.remove();
    });

    /*  A cell editor that went with the key took the focus with it, to
     *  <body>: a reader was left on the page, outside the dialog. A
     *  window takes the focus back (7.26.43); the dialog on top of the
     *  shell does now too.  */
    test("one that went with a cell editor gives the focus back to the dialog on top", () => {
        const $dialog = document.createElement("div");
        const $cell = document.createElement("div");
        const $editor = document.createElement("input");
        $cell.appendChild($editor);
        $dialog.appendChild($cell);
        document.body.appendChild($dialog);
        const release = activate_focus_trap_on($dialog);
        $editor.focus();

        $cell.removeChild($editor);         /*  the editor goes with the key  */
        document.activeElement = document.body;
        escape_at($editor);
        expect(closed).toBe(0);
        expect(document.activeElement === $dialog, "the dialog has the focus").toBe(true);
        expect($dialog.getAttribute("tabindex")).toBe("-1");

        escape_at($dialog);
        expect(closed).toBe(1);
        release();
        yui_shell_pop_escape(shell, close_fn);
        $dialog.remove();
    });
});
