/***********************************************************************
 *          shell_focus_trap.test.mjs
 *
 *      Unit tests for the generic focus-trap helper.  Uses a tiny
 *      hand-rolled DOM stub injected via the second arg of
 *      `activate_focus_trap_on($panel, doc)` — no extra devDep.
 ***********************************************************************/
import { test, expect } from "vitest";
import {
    FOCUSABLE_SELECTOR,
    activate_focus_trap_on,
} from "./shell_focus_trap.js";


/***************************************************************
 *  Minimal stubs.  Just enough to drive the focus-trap module.
 ***************************************************************/
function make_focusable(name, opts = {})
{
    let calls = [];
    return {
        __name: name,
        focus: () => calls.push(`${name}.focus`),
        focus_calls: calls,
        ...opts
    };
}

function make_panel(focusables)
{
    return {
        querySelector(_sel) {
            return focusables[0] || null;
        },
        querySelectorAll(_sel) {
            return focusables;
        },
        contains(node) {
            return focusables.indexOf(node) >= 0;
        }
    };
}

function make_doc(initial_active, body_contains = true)
{
    let listeners = [];
    return {
        activeElement: initial_active,
        addEventListener(_t, fn, _opts) {
            listeners.push(fn);
        },
        removeEventListener(_t, fn, _opts) {
            let i = listeners.indexOf(fn);
            if(i >= 0) {
                listeners.splice(i, 1);
            }
        },
        body: {
            contains: () => body_contains
        },
        listeners
    };
}


test("FOCUSABLE_SELECTOR covers the standard focusable elements", () => {
    /*  Sanity: just check the string is non-trivial. */
    expect(FOCUSABLE_SELECTOR.includes("a[href]")).toBeTruthy();
    expect(FOCUSABLE_SELECTOR.includes("button:not([disabled])")).toBeTruthy();
    expect(FOCUSABLE_SELECTOR.includes("input:not([disabled])")).toBeTruthy();
    expect(FOCUSABLE_SELECTOR.includes("[tabindex]:not([tabindex=\"-1\"])")).toBeTruthy();
});

test("activate moves focus to the first focusable child of the panel", () => {
    let first = make_focusable("first");
    let last  = make_focusable("last");
    let panel = make_panel([first, last]);
    let doc   = make_doc(null);

    let release = activate_focus_trap_on(panel, doc);

    expect(first.focus_calls).toEqual(["first.focus"]);
    expect(last.focus_calls).toEqual([]);
    /*  Listener registered. */
    expect(doc.listeners.length).toBe(1);

    release();
    /*  Listener removed. */
    expect(doc.listeners.length).toBe(0);
});

test("Tab from the last focusable wraps to the first", () => {
    let first = make_focusable("first");
    let last  = make_focusable("last");
    let panel = make_panel([first, last]);
    let doc   = make_doc(null);

    activate_focus_trap_on(panel, doc);

    /*  Reset focus_calls so we only see what the trap does. */
    first.focus_calls.length = 0;
    last.focus_calls.length  = 0;

    /*  Pretend `last` is focused now, then user presses Tab. */
    doc.activeElement = last;
    let prevented = false;
    let ev = {
        key: "Tab",
        shiftKey: false,
        preventDefault() {
            prevented = true;
        }
    };
    doc.listeners[0](ev);

    expect(prevented).toBe(true);
    expect(first.focus_calls).toEqual(["first.focus"]);
    expect(last.focus_calls).toEqual([]);
});

test("Shift+Tab from the first focusable wraps to the last", () => {
    let first = make_focusable("first");
    let last  = make_focusable("last");
    let panel = make_panel([first, last]);
    let doc   = make_doc(null);

    activate_focus_trap_on(panel, doc);
    first.focus_calls.length = 0;
    last.focus_calls.length  = 0;

    doc.activeElement = first;
    let prevented = false;
    let ev = {
        key: "Tab",
        shiftKey: true,
        preventDefault() {
            prevented = true;
        }
    };
    doc.listeners[0](ev);

    expect(prevented).toBe(true);
    expect(last.focus_calls).toEqual(["last.focus"]);
});

test("non-Tab keys are ignored by the trap", () => {
    let first = make_focusable("first");
    let panel = make_panel([first]);
    let doc   = make_doc(null);

    activate_focus_trap_on(panel, doc);
    first.focus_calls.length = 0;

    let prevented = false;
    let ev = {
        key: "Escape",
        shiftKey: false,
        preventDefault() {
            prevented = true;
        }
    };
    doc.listeners[0](ev);

    expect(prevented).toBe(false);
    expect(first.focus_calls).toEqual([]);
});

test("focus jumps into the panel when activeElement is outside", () => {
    let first = make_focusable("first");
    let last  = make_focusable("last");
    let panel = make_panel([first, last]);
    let doc   = make_doc(null);
    let outside = make_focusable("outside");

    activate_focus_trap_on(panel, doc);
    first.focus_calls.length = 0;

    doc.activeElement = outside;   /*  not in panel.contains() */

    let prevented = false;
    let ev = {
        key: "Tab",
        shiftKey: false,
        preventDefault() {
            prevented = true;
        }
    };
    doc.listeners[0](ev);

    expect(prevented).toBe(true);
    expect(first.focus_calls).toEqual(["first.focus"]);
});

test("release restores the previously-active element", () => {
    let prev = make_focusable("prev");
    let inside_first = make_focusable("first");
    let panel = make_panel([inside_first]);
    let doc   = make_doc(prev);   /*  prev was active before the trap */

    let release = activate_focus_trap_on(panel, doc);
    /*  After activation, the trap focuses the first inside element. */
    expect(inside_first.focus_calls).toEqual(["first.focus"]);

    release();
    expect(prev.focus_calls).toEqual(["prev.focus"]);
});

test("release is idempotent — calling it twice is safe", () => {
    let panel = make_panel([make_focusable("first")]);
    let doc   = make_doc(null);

    let release = activate_focus_trap_on(panel, doc);
    expect(doc.listeners.length).toBe(1);

    release();
    expect(doc.listeners.length).toBe(0);

    /*  Second release call must not throw and must not double-act. */
    release();
    expect(doc.listeners.length).toBe(0);
});

test("missing $panel returns a no-op release function", () => {
    let release = activate_focus_trap_on(null, make_doc(null));
    expect(typeof release).toBe("function");
    release();   /*  must not throw */
});

test("LIFO stacking: only the topmost trap acts on Tab", () => {
    /*  Two panels active simultaneously.  Pressing Tab must use
     *  the SECOND trap's panel, not the first — even though both
     *  listeners fire (capture phase). */
    let panel_a_first = make_focusable("a-first");
    let panel_a_last  = make_focusable("a-last");
    let panel_a = make_panel([panel_a_first, panel_a_last]);

    let panel_b_first = make_focusable("b-first");
    let panel_b_last  = make_focusable("b-last");
    let panel_b = make_panel([panel_b_first, panel_b_last]);

    let doc = make_doc(null);
    activate_focus_trap_on(panel_a, doc);
    activate_focus_trap_on(panel_b, doc);

    /*  Both listeners are attached. */
    expect(doc.listeners.length).toBe(2);

    /*  Reset focus_calls so we only see the Tab response. */
    panel_a_first.focus_calls.length = 0;
    panel_b_first.focus_calls.length = 0;

    /*  Pretend focus is "outside" both panels.  Press Tab. */
    doc.activeElement = make_focusable("outside");
    let ev = {
        key: "Tab",
        shiftKey: false,
        preventDefault() {}
    };
    /*  Listeners run in registration order. */
    doc.listeners[0](ev);
    doc.listeners[1](ev);

    /*  Only panel_b (the topmost) should have grabbed focus. */
    expect(panel_a_first.focus_calls).toEqual([]);
    expect(panel_b_first.focus_calls).toEqual(["b-first.focus"]);
});

test("LIFO stacking: releasing the top trap re-empowers the one underneath", () => {
    let panel_a_first = make_focusable("a-first");
    let panel_a = make_panel([panel_a_first]);
    let panel_b_first = make_focusable("b-first");
    let panel_b = make_panel([panel_b_first]);

    let doc = make_doc(null);
    activate_focus_trap_on(panel_a, doc);
    let release_b = activate_focus_trap_on(panel_b, doc);

    release_b();
    expect(doc.listeners.length).toBe(1);

    /*  Now Tab should drive panel_a — it is again the top. */
    panel_a_first.focus_calls.length = 0;
    doc.activeElement = make_focusable("outside");
    let ev = {
        key: "Tab",
        shiftKey: false,
        preventDefault() {}
    };
    doc.listeners[0](ev);
    expect(panel_a_first.focus_calls).toEqual(["a-first.focus"]);
});

test("an empty panel installs the listener but does nothing on Tab", () => {
    let panel = make_panel([]);
    let doc   = make_doc(null);

    activate_focus_trap_on(panel, doc);
    expect(doc.listeners.length).toBe(1);

    let prevented = false;
    let ev = {
        key: "Tab",
        shiftKey: false,
        preventDefault() {
            prevented = true;
        }
    };
    doc.listeners[0](ev);
    /*  No focusables → trap stays out of the way. */
    expect(prevented).toBe(false);
});


/***************************************************************
 *  A control that is not DRAWN cannot take the focus: focus() on
 *  it does nothing. The adaptive dialog's back arrow is the first
 *  control of every dialog and is display:none on a laptop (its
 *  ✕ is, on a phone): the trap gave it the focus on activation,
 *  so the focus stayed outside the dialog; and every Tab after
 *  that "wrapped" to it, did nothing and was prevented, so the
 *  keyboard never got into the dialog at all.
 ***************************************************************/
function drawn(name)
{
    return make_focusable(name, {getClientRects: () => [{width: 10, height: 10}]});
}

function not_drawn(name)
{
    return make_focusable(name, {getClientRects: () => []});
}

test("activation gives the focus to the first DRAWN control", () => {
    let back  = not_drawn("back");
    let close = drawn("close");
    let panel = make_panel([back, close]);
    let doc   = make_doc(null);

    let release = activate_focus_trap_on(panel, doc);

    expect(back.focus_calls).toEqual([]);
    expect(close.focus_calls).toEqual(["close.focus"]);
    release();
});

test("Tab and Shift+Tab wrap to the first and last DRAWN controls", () => {
    let back  = not_drawn("back");
    let a     = drawn("a");
    let b     = drawn("b");
    let x     = not_drawn("x");
    let panel = make_panel([back, a, b, x]);
    let doc   = make_doc(null);

    let release = activate_focus_trap_on(panel, doc);
    a.focus_calls.length = 0;

    doc.activeElement = b;
    let prevented = false;
    doc.listeners[0]({
        key: "Tab",
        shiftKey: false,
        preventDefault() {
            prevented = true;
        }
    });
    expect(prevented).toBe(true);
    expect(a.focus_calls).toEqual(["a.focus"]);
    expect(back.focus_calls).toEqual([]);

    doc.activeElement = a;
    prevented = false;
    doc.listeners[0]({
        key: "Tab",
        shiftKey: true,
        preventDefault() {
            prevented = true;
        }
    });
    expect(prevented).toBe(true);
    expect(b.focus_calls).toEqual(["b.focus"]);
    expect(x.focus_calls).toEqual([]);
    release();
});
