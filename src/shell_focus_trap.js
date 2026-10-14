/***********************************************************************
 *          shell_focus_trap.js
 *
 *      Generic focus-trap helper used by C_YUI_SHELL for drawers,
 *      modals and any other overlay that must capture keyboard
 *      navigation while open.
 *
 *      Usage:
 *          let release = activate_focus_trap_on($panel);
 *          // ... when the overlay closes:
 *          release();
 *
 *      The trap:
 *          - captures Tab / Shift+Tab so focus cycles inside $panel,
 *          - moves focus to the first focusable child on activate,
 *          - restores focus to whatever element had it before
 *            activation when release() runs.
 *
 *      Only a control that is DRAWN counts: focus() on one that is
 *      not (display:none) does nothing. The adaptive dialog's back
 *      arrow is the first control of every dialog and is hidden on a
 *      laptop: up to 7.26.42 the trap gave it the focus on activation
 *      (so the focus stayed outside the dialog), and every Tab after
 *      that wrapped to it, did nothing and was prevented -- the
 *      keyboard never got into the dialog.
 *
 *      A trap whose panel is out of the document is not the top:
 *      the top is the highest trap whose panel is in it. Up to
 *      gobj-ui 7.26.45 a trap left behind by an owner torn down with
 *      it stayed the top: every window opened later believed itself
 *      under an overlay and took no focus, and a live trap under it
 *      no longer heard Tab. 7.26.46 dropped such a trap from the
 *      stack, which was for good: a panel that only moved (taken out
 *      and put back, its trap never released) lost its trap. It is
 *      skipped now, and leaves the stack only by its release().
 *
 *      No gobj dependency: only gobj-js's logger.  The optional
 *      second argument lets callers inject a mock document object
 *      for unit tests.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/

/*  Selector matching the elements typically considered focusable.
 *  Kept conservative: items that are explicitly removed from the tab
 *  order (`tabindex="-1"`) are excluded; everything else is in. */
export const FOCUSABLE_SELECTOR =
    "a[href], button:not([disabled]), input:not([disabled])," +
    " select:not([disabled]), textarea:not([disabled])," +
    " [tabindex]:not([tabindex=\"-1\"])";


/*  Module-local LIFO stack of active traps.  Multiple overlays can
 *  be open simultaneously (modal over drawer, popup over modal, …)
 *  and each registers its own document-level keydown listener.
 *  Without arbitration every Tab fires every listener, which forces
 *  focus to the deepest trap's first/last on every press and makes
 *  middle elements unreachable.  We keep one stack and only run the
 *  topmost trap; the rest short-circuit. */
const __trap_stack__ = [];

/*  The top trap whose panel is in the document. One that is not
 *  is skipped, not dropped: a panel that only MOVES (taken out and
 *  put back) is the top again once it is back. Only a panel that
 *  SAYS so (isConnected === false) is out: a stub that cannot say
 *  is taken as in. A trap leaves the stack only by its release().  */
function top_trap()
{
    for(let i = __trap_stack__.length - 1; i >= 0; i--) {
        let trap = __trap_stack__[i];
        if(trap.$panel.isConnected !== false) {
            return trap;
        }
    }
    return null;
}


/*  Whether `el` is drawn, so focus() on it can take. An element that
 *  cannot say (a stub with no getClientRects) is taken as drawn.  */
function is_drawn(el)
{
    if(typeof el.checkVisibility === "function") {
        return el.checkVisibility();
    }
    if(typeof el.getClientRects === "function") {
        return el.getClientRects().length > 0;
    }
    return true;
}

/*  The controls of $panel that can take the focus, in order.  */
function focusables_of($panel)
{
    return Array.from($panel.querySelectorAll(FOCUSABLE_SELECTOR)).filter(is_drawn);
}


/***************************************************************
 *  Activate the focus-trap on $panel.
 *
 *  Returns a `release` function that must be called to tear the
 *  trap down when the overlay closes.  Calling release() multiple
 *  times is safe (becomes a no-op after the first call).
 *
 *  `doc` defaults to globalThis.document; pass a stub for tests.
 ***************************************************************/
export function activate_focus_trap_on($panel, doc)
{
    if(!doc) {
        doc = globalThis.document;
    }
    if(!$panel || !doc) {
        return function noop() {};
    }

    let saved = doc.activeElement || null;
    let released = false;

    let trap = function(ev) {
        if(ev.key !== "Tab" && ev.keyCode !== 9) {
            return;
        }
        /*  LIFO arbitration: only the topmost active trap acts.
         *  Earlier-registered listeners fire too (capture phase),
         *  but they short-circuit unless they own the top of the
         *  stack. */
        if(top_trap() !== trap) {
            return;
        }
        let nodes = focusables_of($panel);
        if(nodes.length === 0) {
            return;
        }
        let first = nodes[0];
        let last  = nodes[nodes.length - 1];
        let inside = $panel.contains(doc.activeElement);

        if(ev.shiftKey) {
            if(!inside || doc.activeElement === first) {
                last.focus();
                ev.preventDefault();
            }
        } else {
            if(!inside || doc.activeElement === last) {
                first.focus();
                ev.preventDefault();
            }
        }
    };
    trap.$panel = $panel;
    doc.addEventListener("keydown", trap, true);
    __trap_stack__.push(trap);

    /*  Move focus to the first focusable child of the panel. */
    let firstFocusable = focusables_of($panel)[0];
    if(firstFocusable && typeof firstFocusable.focus === "function") {
        firstFocusable.focus();
    }

    return function release_focus_trap() {
        if(released) {
            return;
        }
        released = true;
        doc.removeEventListener("keydown", trap, true);
        let idx = __trap_stack__.indexOf(trap);
        if(idx >= 0) {
            __trap_stack__.splice(idx, 1);
        }
        if(saved && typeof saved.focus === "function" &&
           (!doc.body || !doc.body.contains || doc.body.contains(saved)))
        {
            saved.focus();
        }
    };
}


/***************************************************************
 *  The panel of the trap that holds the focus now (the top of the
 *  stack), or null when none is up. What holds one -- a modal, a
 *  dialog, a drawer, a menu -- is drawn above every window that is
 *  not modal: such a window that took the focus would take it
 *  where it cannot be seen, and the next Tab would give it back.
 ***************************************************************/
export function focus_trap_panel()
{
    let top = top_trap();
    return top ? top.$panel : null;
}
