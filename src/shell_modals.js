/***********************************************************************
 *          shell_modals.js
 *
 *      Modal / notification API on top of the layers C_YUI_SHELL
 *      already creates (`priv.layers.notification`,
 *      `priv.layers.modal`).  Naming convention:
 *
 *          yui_shell_show_*     — non-blocking notifications/modal
 *          yui_shell_confirm_*  — blocking dialog, returns Promise
 *
 *      Bulma `.notification` / `.modal-card` markup is reused
 *      verbatim so apps importing Bulma get the visual styling for
 *      free.
 *
 *      Every blocking dialog and every modal pushes a close handler
 *      onto the shell's Escape priority chain (see
 *      yui_shell_push_escape / yui_shell_pop_escape) so Escape
 *      closes the topmost overlay only.
 *
 *      The legacy display_* / get_yes* helpers in c_yui_main.js are
 *      NOT changed — apps that ride on the legacy shell keep using
 *      them (see SHELL.md §10 drift policy).
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
/* global document */

import {
    gobj_read_attr,
    createElement2,
    refresh_language,
    empty_string,
    log_warning,
} from "@yuneta/gobj-js";
import {yui_tint} from "./bulma_tint.js";


import {t} from "i18next";
import {
    activate_focus_trap_on,
} from "./shell_focus_trap.js";

import {
    yui_shell_push_escape,
    yui_shell_pop_escape,
    yui_shell_register_overlay,
    yui_shell_overlay_dismissed,
} from "./c_yui_shell.js";
import {text_node} from "./yui_text.js";


/***************************************************************
 *              Layer accessors
 ***************************************************************/
function notification_layer(shell)
{
    if(!shell) {
        return null;
    }
    let priv = shell.priv;
    return priv && priv.layers && priv.layers.notification;
}

function modal_layer(shell)
{
    if(!shell) {
        return null;
    }
    let priv = shell.priv;
    return priv && priv.layers && priv.layers.modal;
}

/*  What each shell has opened in its modal layer, modals and questions
 *  alike: a `before_close` that settles with undefined having opened
 *  nothing left the reader with a modal that does not close, and only
 *  this tells it from a question answered "no" (guarded_close).  */
const __opened_by_shell__ = new WeakMap();

function note_opened(shell)
{
    __opened_by_shell__.set(shell, opened_count(shell) + 1);
}

function opened_count(shell)
{
    return __opened_by_shell__.get(shell) || 0;
}

/*  Unique ids for the nodes a dialog is named and described by.  */
let __dialog_seq__ = 0;

/*  Public: where a component should mount its own popup/dialog DOM
 *  (e.g. the treedb edit dialog).  The popup layer (z 20) sits below
 *  the modal layer (z 99), so shell confirms always paint above the
 *  component's dialog — matching the Escape chain LIFO order.  Null
 *  when there is no shell: the caller picks its legacy fallback. */
export function yui_shell_popup_layer(shell)
{
    if(!shell) {
        return null;
    }
    let priv = shell.priv;
    return (priv && priv.layers && priv.layers.popup) || null;
}


/***************************************************************
 *  i18n bridge:
 *      - `text` is rendered as the canonical English key.
 *      - The hosting element is tagged with `data-i18n="<key>"`,
 *        so a later `refresh_language(shell.$container, t)` call
 *        retranslates the modal even if it was created BEFORE the
 *        language was switched.
 *      - If `opts.t` is a function, the helper translates the
 *        node right after creating it — so a modal opened AFTER
 *        the user has already toggled to ES renders in ES on the
 *        first frame, not the canonical English key.
 ***************************************************************/
function maybe_apply_translator($node, opts)
{
    if(opts && typeof opts.t === "function") {
        refresh_language($node, opts.t);
    }
}


/***************************************************************
 *              Notifications (Bulma .notification)
 *
 *      Non-blocking, auto-dismiss after `opts.timeout` ms (default
 *      5000).  `opts.timeout = 0` disables auto-dismiss.
 *      Returns `{ close() }` so callers can dismiss programmatically.
 *
 *      ONE toast per message on screen: a string message of the same
 *      kind as a toast still showing is not stacked under it. One
 *      close of a transport settles every request it cut, each view
 *      shows its failure, and the operator got a column of identical
 *      "the connection dropped". A message built of nodes is never
 *      merged: its text is not a key.
 *
 *      A repeat is still a CALLER of its own: it gets its own handle
 *      and its own time, and the toast stays while any caller holds
 *      it -- until every handle is closed or has timed out. Handed the
 *      first caller's handle and timer, a repeat asking `timeout: 0`
 *      was dismissed on the first one's timer, and closing one
 *      caller's handle closed a toast another was still showing.
 *      The operator's ✕ closes it for everybody.
 ***************************************************************/
function show_notification(shell, kind, message, opts)
{
    let $layer = notification_layer(shell);
    if(!$layer) {
        log_warning("yui_shell_show_*: shell has no notification layer");
        return { close: () => {} };
    }

    let timeout = (opts && opts.timeout != null) ? opts.timeout : 5000;
    let key = (typeof message === "string") ? `${kind}\u0000${message}` : null;
    if(key !== null) {
        for(let $shown of Array.from($layer.children)) {
            if($shown.__toast_key__ === key && $shown.__toast__) {
                return $shown.__toast__.hold(timeout);
            }
        }
    }

    let p_attrs = (typeof message === "string")
        ? {i18n: message}
        : {};
    let $note = createElement2(
        ["div", {class: `TOAST notification yui-notification ${yui_tint(kind)}`,
                 role: kind === "danger" ? "alert" : "status"},
            [
                ["button", {class: "TOAST_CLOSE delete", title: t("close"), "data-i18n-title": "close",
                    "aria-label": t("close"), "data-i18n-aria-label": "close"}],
                ["p", {...p_attrs, class: "TOAST_MSG"},
                    (typeof message === "string")? text_node(message) : message]
            ]
        ]
    );
    $layer.appendChild($note);
    maybe_apply_translator($note, opts);

    let holders = new Set();
    let closed = false;

    let close_toast = function() {
        if(closed) {
            return;
        }
        closed = true;
        for(let holder of holders) {
            if(holder.timeout_id) {
                clearTimeout(holder.timeout_id);
                holder.timeout_id = null;
            }
        }
        holders.clear();
        if($note.parentNode) {
            $note.parentNode.removeChild($note);
        }
    };

    /*  One caller of this toast: its handle, and its time.  */
    let hold = function(ms) {
        let holder = {timeout_id: null};
        let release = function() {
            if(!holders.has(holder)) {
                return;
            }
            if(holder.timeout_id) {
                clearTimeout(holder.timeout_id);
                holder.timeout_id = null;
            }
            holders.delete(holder);
            if(holders.size === 0) {
                close_toast();
            }
        };
        holders.add(holder);
        if(ms > 0) {
            holder.timeout_id = setTimeout(release, ms);
        }
        return { close: release };
    };

    let $del = $note.querySelector(".delete");
    if($del) {
        $del.addEventListener("click", close_toast);
    }

    $note.__toast_key__ = key;
    $note.__toast__ = {hold: hold};
    return hold(timeout);
}


export function yui_shell_show_info(shell, message, opts)
{
    return show_notification(shell, "info", message, opts);
}
export function yui_shell_show_warning(shell, message, opts)
{
    return show_notification(shell, "warning", message, opts);
}
export function yui_shell_show_error(shell, message, opts)
{
    return show_notification(shell, "danger", message, opts);
}


/***************************************************************
 *              Modal (Bulma .modal — non-blocking)
 *
 *      Drops a Bulma `.modal-content` overlay into the modal layer.
 *      `content` may be a string (rendered inside a Bulma .box) or
 *      an HTMLElement (rendered as-is).  Returns `{ close() }`.
 *      The caller decides when to dismiss; click on background,
 *      the `.modal-close` button, or `Escape` also close it.
 ***************************************************************/
export function yui_shell_show_modal(shell, content, opts)
{
    let $layer = modal_layer(shell);
    if(!$layer) {
        log_warning("yui_shell_show_modal: shell has no modal layer");
        return { close: () => {} };
    }

    let label_id = `yui-modal-${++__dialog_seq__}`;
    let inner = (typeof content === "string")
        ? ["div", {class: "box"}, [["p", {class: "MODAL_MESSAGE", id: `${label_id}-msg`,
                                         i18n: content}, content]]]
        : null;

    /*  Adaptive DIALOG mode (`opts.dialog: true`): the standardized
     *  "single window / popup" chrome — a centered card with the close X
     *  at the top-right on desktop, and a full-screen sheet with a back
     *  arrow at the top-left on mobile. A header bar carries `opts.title`
     *  and BOTH dismiss controls; CSS shows the right one per breakpoint.
     *  Both call close() — the app's on_close decides navigation (usually
     *  history.back()), so gobj-ui stays routing-agnostic. */
    let dialog = !!(opts && opts.dialog);
    let title = (opts && opts.title) || "";
    /*  Optional DATA half of the title (a topic/service name), never
     *  translated, shown before `title`. Same contract as C_YUI_WINDOW's
     *  `title_prefix`, and for the same reason: composing
     *  `${topic} · ${t("keys")}` into `title` yields a string that is not
     *  an i18n key, so it never re-translates. Split, only the kind half
     *  carries a key. The separator is CSS — createElement2 trims text
     *  nodes and would eat the spaces around it. */
    let title_prefix = (opts && opts.title_prefix) || "";

    /*  The halves of the title NAME the dialog (aria-labelledby), in
     *  the dialog's header -- or, with no dialog chrome, in a title
     *  only a reader sees: a reader joins them with a space, and the
     *  kind half changes language. With no title, a plain message
     *  names it; with nothing, it has no name, and that is said.  */
    let title_halves = (title_prefix
        ? [["span", {class: "MODAL_TITLE_PREFIX", id: `${label_id}-prefix`},
            text_node(title_prefix)]]
        : []).concat(title
        ? [["span", {class: "MODAL_TITLE_KIND", id: `${label_id}-kind`, i18n: title},
            text_node(title)]]
        : []);
    let label_ids = [];
    if(title_prefix) {
        label_ids.push(`${label_id}-prefix`);
    }
    if(title) {
        label_ids.push(`${label_id}-kind`);
    }
    if(label_ids.length === 0 && inner) {
        label_ids.push(`${label_id}-msg`);
    }

    /*  The external Bulma `.modal-close is-large` sits at the
     *  top-right of the viewport, outside the content box.  Callers
     *  whose content provides its own in-box close (e.g. a
     *  C_YUI_PAGER header) pass `with_close_button: false` to omit
     *  it; Escape and the backdrop still close the modal. */
    let with_close = !(opts && opts.with_close_button === false);
    let modal_children;
    if(dialog) {
        let header = ["div", {class: "MODAL_HEADER yui-dialog-header"}, [
            ["button", {class: "MODAL_BACK yui-dialog-back", type: "button", title: t("back"), "data-i18n-title": "back",
                    "aria-label": t("back"), "data-i18n-aria-label": "back"},
                [["i", {class: "yi-arrow-left"}]]],
            ["span", {class: "MODAL_TITLE yui-dialog-title"}, title_halves],
            ["button", {class: "MODAL_CLOSE yui-dialog-x", type: "button", title: t("close"), "data-i18n-title": "close",
                    "aria-label": t("close"), "data-i18n-aria-label": "close"},
                [["i", {class: "yi-xmark"}]]],
        ]];
        let body = ["div", {class: "MODAL_BODY yui-dialog-body"}, inner ? [inner] : []];
        modal_children = [
            ["div", {class: "MODAL_BACKDROP modal-background"}],
            ["div", {class: "MODAL_CONTENT modal-content yui-dialog-content"}, [header, body]]
        ];
        /*  The header X replaces the external Bulma close button. */
        with_close = false;
    } else {
        modal_children = [
            ["div", {class: "MODAL_BACKDROP modal-background"}],
            ["div", {class: "MODAL_CONTENT modal-content"},
                inner ? [inner] : []
            ]
        ];
        if(title_halves.length > 0) {
            modal_children.unshift(["span", {class: "MODAL_TITLE is-sr-only"}, title_halves]);
        }
        if(with_close) {
            modal_children.push(
                ["button", {class: "MODAL_CLOSE modal-close is-large",
                            title: t("close"), "data-i18n-title": "close",
                    "aria-label": t("close"), "data-i18n-aria-label": "close"}]
            );
        }
    }

    /*  `opts.logical_class`: the CALLER's UPPER_SNAKE name for THIS modal
     *  (e.g. TRANGER_KEYS_SHEET). Every modal shares the MODAL block names,
     *  only this tells one popup from another in the Inspector or a selector. */
    let logical = (opts && opts.logical_class) || "";

    /*  `opts.wide`: a dialog that holds a DOCUMENT and not a form. The
     *  640px of the standard card is a width for a question with two
     *  buttons; a json viewer, a log or a record read in it wraps every
     *  long value and pushes its own toolbar behind a scroll arrow. It
     *  only lifts the desktop cap -- on mobile a dialog is a full-screen
     *  sheet already, and the media query below still wins.  */
    let wide = !!(opts && opts.wide);

    let modal_attrs = {class: "MODAL" + (logical ? " " + logical : "") +
                              " modal yui-modal" + (dialog ? " yui-dialog" : "") +
                              (dialog && wide ? " yui-dialog-wide" : "") + " is-active",
                       role: "dialog", "aria-modal": "true"};
    if(label_ids.length > 0) {
        modal_attrs["aria-labelledby"] = label_ids.join(" ");
    } else {
        log_warning(
            `yui_shell_show_modal: a dialog with no title and no message has no name for a reader` +
            (logical ? ` (${logical})` : "") + `: give it opts.title`
        );
    }
    let $modal = createElement2(["div", modal_attrs, modal_children]);
    $layer.appendChild($modal);
    note_opened(shell);

    if(!inner && content && typeof content.appendChild !== "undefined") {
        let $content = dialog
            ? $modal.querySelector(".yui-dialog-body")
            : $modal.querySelector(".modal-content");
        $content.appendChild(content);
    }

    maybe_apply_translator($modal, opts);

    let closed = false;
    let release_focus = null;
    let overlay = null;
    let escape_handler = null;

    /*  Unconditional teardown. The returned close() maps here: a
     *  programmatic close always closes, bypassing before_close. */
    let do_close = function() {
        if(closed) {
            return;
        }
        closed = true;
        if(release_focus) {
            release_focus();
            release_focus = null;
        }
        if(escape_handler) {
            yui_shell_pop_escape(shell, escape_handler);
            escape_handler = null;
        }
        if($modal.parentNode) {
            $modal.parentNode.removeChild($modal);
        }
        /*  Retire the browser-history entry (no-op when Back triggered
         *  this close — the entry is already gone). */
        yui_shell_overlay_dismissed(shell, overlay);
        if(opts && typeof opts.on_close === "function") {
            try {
                opts.on_close();
            } catch(e) {
                log_warning(`yui_shell_show_modal: on_close threw: ${e}`);
            }
        }
    };

    /*  `opts.before_close`: a guard consulted on EVERY user-driven dismiss
     *  (Escape, backdrop, the X / back-arrow, browser Back). Return false to
     *  VETO — the modal stays up and the caller takes over (e.g. an
     *  unsaved-changes prompt that calls close() itself on confirm). Return
     *  true/undefined to let it close. Absent guard ⇒ always closes, so
     *  existing callers are unaffected.
     *
     *  A guard that ASKS first returns the question's PROMISE: a veto, and
     *  the modal is told when the question is over. It matters on browser
     *  Back, which took the modal's history entry before the guard ran:
     *  the entry goes back once the question is gone, never above it.
     *  Returned false after opening the question, the entry went back at
     *  once, over the question's own, and the next Back -- the one meant
     *  for the question -- reached the modal, which asked again: every
     *  Back stacked one more question. Same contract as the `asking`
     *  close of C_YUI_WINDOW.
     *
     *  What the promise SETTLES with is the answer: `true` closes the
     *  modal, as a `true` returned at once does; anything else -- what a
     *  question that closed the modal itself on "yes" settles with, a
     *  `false`, a rejection (said) -- is the veto, and a Back that asked
     *  gets its entry back then. Up to 7.26.41 any promise was a veto,
     *  so an `async () => true` left a modal nobody could close. A
     *  `true` that comes after the modal closed closes nothing twice.
     *
     *  An undefined from a guard that opened nothing -- an `async`
     *  guard ending in `return;`, which closes when written without
     *  `async` -- is the veto too, but nothing on the screen says so:
     *  it is said in the log. From a guard that asked, it is its "no". */
    let guarded_close = function(on_veto) {
        if(closed) {
            return;
        }
        let allow = true;
        let opened_before = opened_count(shell);
        if(opts && typeof opts.before_close === "function") {
            try {
                allow = opts.before_close();
            } catch(e) {
                log_warning(`yui_shell_show_modal: before_close threw: ${e}`);
                allow = true;
            }
        }
        if(allow && typeof allow.then === "function") {
            let vetoed = function() {
                if(typeof on_veto === "function") {
                    on_veto();
                }
            };
            allow.then(function(answer) {
                if(answer === true) {
                    do_close();
                    return;
                }
                if(answer === undefined && !closed && opened_count(shell) === opened_before) {
                    log_warning("yui_shell_show_modal: before_close settled with undefined and " +
                                "asked nothing: the modal stays open (only true closes it)");
                }
                vetoed();
            }, function(e) {
                log_warning(`yui_shell_show_modal: before_close rejected: ${e}`);
                vetoed();
            });
            return;
        }
        if(allow === false) {
            if(typeof on_veto === "function") {
                on_veto();
            }
            return;
        }
        do_close();
    };
    let request_close = function() {
        guarded_close(null);
    };
    /*  Browser Back already consumed the history entry; if the guard vetoes,
     *  re-arm a fresh entry so a later Back still targets this modal --
     *  unless the answer to its question closed it.  */
    let on_back = function() {
        guarded_close(function() {
            if(!closed) {
                overlay = yui_shell_register_overlay(shell, on_back);
            }
        });
    };

    escape_handler = request_close;
    yui_shell_push_escape(shell, "modal", request_close, do_close);
    /*  Browser Back closes the top-most modal (see overlay history in
     *  c_yui_shell.js).  Null when history integration is off. */
    overlay = yui_shell_register_overlay(shell, on_back);
    /*  Trap on $modal (not on .modal-content) so the .modal-close
     *  button — rendered as a SIBLING of .modal-content — is
     *  reachable via Tab.  Without this, Tab/Shift+Tab can only
     *  cycle among focusables that the caller put inside
     *  .modal-content; the X button can only be clicked. */
    release_focus = activate_focus_trap_on($modal);

    if((opts == null || opts.dismiss_on_background !== false)) {
        $modal.querySelector(".modal-background").addEventListener("click", request_close);
    }
    let $close_btn = $modal.querySelector(".modal-close");
    if($close_btn) {
        $close_btn.addEventListener("click", request_close);
    }
    if(dialog) {
        let $back = $modal.querySelector(".yui-dialog-back");
        if($back) {
            $back.addEventListener("click", request_close);
        }
        let $x = $modal.querySelector(".yui-dialog-x");
        if($x) {
            $x.addEventListener("click", request_close);
        }
    }

    return { close: do_close };
}


/***************************************************************
 *              Blocking dialogs (icon-centric .modal-card)
 *
 *      build_dialog returns a Promise that resolves with the
 *      clicked button's `value`.  Escape, the close button and
 *      the dismiss action all resolve with the LAST button's value
 *      (cancel/no/ok by convention — the safe-default action).
 *
 *      Layout ported from the legacy volatil modals (2.5.0
 *      redesign, removed in 3.0.0): a narrow rounded card with a
 *      tinted round icon of the `opts.type`
 *      (question/success/info/warning/error, `danger` aliases
 *      error), optional capitalized title, centered message and
 *      buttons.  Everything maps to Bulma vars (light and dark).
 ***************************************************************/
const CONFIRM_TYPE_ICONS = {
    "info":     "yi-circle-info",
    "question": "yi-question",
    "success":  "yi-square-check",
    "warning":  "yi-triangle-exclamation",
    "error":    "yi-circle-exclamation",
};

function build_dialog(shell, message, buttons, opts)
{
    let $layer = modal_layer(shell);
    if(!$layer) {
        log_warning("yui_shell_confirm_*: shell has no modal layer");
        return Promise.resolve(buttons[buttons.length - 1].value);
    }

    let title = (opts && opts.title) || "";
    let dismiss_value = buttons[buttons.length - 1].value;

    let type = ((opts && opts.type) || "question").toLowerCase();
    if(type === "danger") {
        type = "error";
    }
    let icon = CONFIRM_TYPE_ICONS[type] || CONFIRM_TYPE_ICONS["question"];

    let $body_children = (typeof message === "string")
        ? [["p", {class: "CONFIRM_MSG yui-confirm-msg", i18n: message}, text_node(message)]]
        : [message];

    let $footer_children = buttons.map(b => {
        let cls = "CONFIRM_BTN button px-5";
        if(b.kind === "primary") {
            cls += " is-link";
        } else if(b.kind === "danger") {
            cls += " is-danger";
        }
        let btn_attrs = {class: cls, type: "button",
                         "data-modal-button-value": b.value};
        /*  Named by its own label key: its text is its name for the eye,
         *  and the title and aria-label say the same to the pointer and
         *  to a reader, re-translated with it.  */
        if(typeof b.label === "string") {
            btn_attrs.i18n = b.label;
            btn_attrs.title = t(b.label);
            btn_attrs["data-i18n-title"] = b.label;
            btn_attrs["aria-label"] = t(b.label);
            btn_attrs["data-i18n-aria-label"] = b.label;
        }
        return ["button", btn_attrs, b.label];
    });

    let $card_children = [
        ["div", {class: "CONFIRM_ICON yui-confirm-icon"},
            [["i", {class: icon, "aria-hidden": "true"}]]
        ]
    ];
    let label_id = `yui-confirm-${++__dialog_seq__}`;
    if(!empty_string(title)) {
        $card_children.push(
            ["p", {class: "CONFIRM_TITLE yui-confirm-title has-text-centered",
                   id: `${label_id}-title`, i18n: title}, text_node(title)]
        );
    }
    $card_children.push(
        ["button", {class: "CONFIRM_CLOSE delete yui-confirm-x", title: t("close"), "data-i18n-title": "close",
                    "aria-label": t("close"), "data-i18n-aria-label": "close"}],
        ["section", {class: "CONFIRM_BODY modal-card-body has-text-centered",
                     id: `${label_id}-body`},
            $body_children],
        ["footer", {class: "CONFIRM_FOOT modal-card-foot"}, $footer_children]
    );

    /*  Caller's own UPPER_SNAKE name for THIS confirm, same contract as
     *  yui_shell_show_modal's `logical_class`. */
    let logical = (opts && opts.logical_class) ? " " + opts.logical_class : "";

    /*  Named by its title and described by its message -- or, with no
     *  title, named by the message, which is then the whole of it.  */
    let confirm_attrs = {class: `CONFIRM${logical} modal yui-modal yui-confirm is-active is-${type}`,
                         role: "dialog", "aria-modal": "true"};
    if(!empty_string(title)) {
        confirm_attrs["aria-labelledby"] = `${label_id}-title`;
        confirm_attrs["aria-describedby"] = `${label_id}-body`;
    } else {
        confirm_attrs["aria-labelledby"] = `${label_id}-body`;
    }
    let $modal = createElement2(
        ["div", confirm_attrs,
            [
                ["div", {class: "CONFIRM_BACKDROP modal-background"}],
                ["div", {class: "CONFIRM_CARD modal-card"}, $card_children]
            ]
        ]
    );
    $layer.appendChild($modal);
    note_opened(shell);
    maybe_apply_translator($modal, opts);

    return new Promise(resolve => {
        let resolved = false;
        let close_fn = null;
        let release_focus = null;
        let overlay = null;

        let close = function(value) {
            if(resolved) {
                return;
            }
            resolved = true;
            if(release_focus) {
                release_focus();
                release_focus = null;
            }
            if(close_fn) {
                yui_shell_pop_escape(shell, close_fn);
                close_fn = null;
            }
            if($modal.parentNode) {
                $modal.parentNode.removeChild($modal);
            }
            /*  Retire the browser-history entry (no-op when Back
             *  triggered this close). */
            yui_shell_overlay_dismissed(shell, overlay);
            resolve(value);
        };
        close_fn = () => close(dismiss_value);

        yui_shell_push_escape(shell, "modal", close_fn, close_fn);
        /*  Browser Back dismisses the dialog with the safe-default value,
         *  exactly like Escape. */
        overlay = yui_shell_register_overlay(shell, close_fn);
        release_focus = activate_focus_trap_on(
            $modal.querySelector(".modal-card")
        );

        $modal.querySelector(".modal-background").addEventListener(
            "click", () => close(dismiss_value)
        );
        $modal.querySelector(".modal-card .delete").addEventListener(
            "click", () => close(dismiss_value)
        );
        let footer_buttons = $modal.querySelectorAll(
            ".modal-card-foot button"
        );
        footer_buttons.forEach($btn => {
            $btn.addEventListener("click", () => {
                close($btn.getAttribute("data-modal-button-value"));
            });
        });

        /*  Enter answers the primary action, like the volatil modals. */
        let $primary = $modal.querySelector(".modal-card-foot button");
        if($primary) {
            $primary.focus();
        }
    });
}


/***************************************************************
 *  The labels a confirmation shows when the caller names none.
 *
 *  They are i18n KEYS, lower-case like every key: a button
 *  translates its label with the app's t() -- its text, its title
 *  and its aria-label. Until 7.25.16 they were "OK", "Yes", "No",
 *  "Delete" and "Cancel", keys that no locale carries, so a dialog
 *  that took the defaults read in English in every language.
 *
 *  An app that mounts these dialogs must define the five keys. A
 *  consumer's validate-locales reads them where build_dialog() gets
 *  them (a const, `DEFAULT_LABEL.ok`, it follows), and in
 *  SHELL_MODALS_I18N_KEYS, which a test holds to this table. (Up to
 *  7.26.27 they were written as `i18n:` entries, which only a regex
 *  scan of `i18n: "..."` happened to see.)
 ***************************************************************/
const DEFAULT_LABEL = Object.freeze({
    ok:     "ok",
    yes:    "yes",
    no:     "no",
    delete: "delete",
    cancel: "cancel"
});
export const SHELL_MODALS_I18N_KEYS = ["ok", "yes", "no", "delete", "cancel"];

export function yui_shell_confirm_ok(shell, message, opts)
{
    const label = (opts && opts.ok_label) || DEFAULT_LABEL.ok;
    if(!opts || !opts.type) {
        opts = Object.assign({}, opts, {type: "success"});
    }
    return build_dialog(shell, message, [
        {label: label, value: "ok", kind: "primary"}
    ], opts).then(() => undefined);
}

export function yui_shell_confirm_yesno(shell, message, opts)
{
    const yes_label = (opts && opts.yes_label) || DEFAULT_LABEL.yes;
    const no_label  = (opts && opts.no_label)  || DEFAULT_LABEL.no;
    return build_dialog(shell, message, [
        {label: yes_label, value: "yes", kind: "primary"},
        {label: no_label,  value: "no"}
    ], opts).then(v => v === "yes");
}

/***************************************************************
 *  A DESTRUCTIVE confirmation: the button that does the damage is
 *  red, not blue.
 *
 *  yui_shell_confirm_yesno() puts its yes in `is-link`, which is
 *  the right colour for "do you want to continue" and the wrong
 *  one for "this deletes an account": the two read the same at a
 *  glance, and the destructive one is the one that must not be
 *  clicked by reflex.  The safe answer is also the LAST button,
 *  so Escape, the backdrop and the X all resolve to it.
 *
 *  Returns a Promise<boolean>: true only if the red button was
 *  pressed.
 ***************************************************************/
export function yui_shell_confirm_danger(shell, message, opts)
{
    const confirm_label = (opts && opts.confirm_label) || DEFAULT_LABEL.delete;
    const cancel_label  = (opts && opts.cancel_label)  || DEFAULT_LABEL.cancel;
    if(!opts || !opts.type) {
        opts = Object.assign({}, opts, {type: "danger"});
    }
    return build_dialog(shell, message, [
        {label: confirm_label, value: "confirm", kind: "danger"},
        {label: cancel_label,  value: "cancel"}
    ], opts).then(v => v === "confirm");
}

export function yui_shell_confirm_yesnocancel(shell, message, opts)
{
    const yes_label    = (opts && opts.yes_label)    || DEFAULT_LABEL.yes;
    const no_label     = (opts && opts.no_label)     || DEFAULT_LABEL.no;
    const cancel_label = (opts && opts.cancel_label) || DEFAULT_LABEL.cancel;
    return build_dialog(shell, message, [
        {label: yes_label,    value: "yes", kind: "primary"},
        {label: no_label,     value: "no"},
        {label: cancel_label, value: "cancel"}
    ], opts);
}
