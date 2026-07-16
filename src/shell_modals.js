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

import {
    activate_focus_trap_on,
} from "./shell_focus_trap.js";

import {
    yui_shell_push_escape,
    yui_shell_pop_escape,
    yui_shell_register_overlay,
    yui_shell_overlay_dismissed,
} from "./c_yui_shell.js";


/***************************************************************
 *              Layer accessors
 ***************************************************************/
function notification_layer(shell)
{
    if(!shell) {
        return null;
    }
    let priv = gobj_read_attr(shell, "priv");
    return priv && priv.layers && priv.layers.notification;
}

function modal_layer(shell)
{
    if(!shell) {
        return null;
    }
    let priv = gobj_read_attr(shell, "priv");
    return priv && priv.layers && priv.layers.modal;
}

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
    let priv = gobj_read_attr(shell, "priv");
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
 ***************************************************************/
function show_notification(shell, kind, message, opts)
{
    let $layer = notification_layer(shell);
    if(!$layer) {
        log_warning("yui_shell_show_*: shell has no notification layer");
        return { close: () => {} };
    }

    let p_attrs = (typeof message === "string")
        ? {i18n: message}
        : {};
    let $note = createElement2(
        ["div", {class: `TOAST notification yui-notification is-${kind} is-light`,
                 role: kind === "danger" ? "alert" : "status"},
            [
                ["button", {class: "TOAST_CLOSE delete", "aria-label": "close"}],
                ["p", {...p_attrs, class: "TOAST_MSG"}, message]
            ]
        ]
    );
    $layer.appendChild($note);
    maybe_apply_translator($note, opts);

    let timeout_id = null;
    let closed = false;

    let close = function() {
        if(closed) {
            return;
        }
        closed = true;
        if(timeout_id) {
            clearTimeout(timeout_id);
            timeout_id = null;
        }
        if($note.parentNode) {
            $note.parentNode.removeChild($note);
        }
    };

    let $del = $note.querySelector(".delete");
    if($del) {
        $del.addEventListener("click", close);
    }

    let timeout = (opts && opts.timeout != null) ? opts.timeout : 5000;
    if(timeout > 0) {
        timeout_id = setTimeout(close, timeout);
    }

    return { close };
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

    let inner = (typeof content === "string")
        ? ["div", {class: "box"}, [["p", {i18n: content}, content]]]
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

    /*  The external Bulma `.modal-close is-large` sits at the
     *  top-right of the viewport, outside the content box.  Callers
     *  whose content provides its own in-box close (e.g. a
     *  C_YUI_PAGER header) pass `with_close_button: false` to omit
     *  it; Escape and the backdrop still close the modal. */
    let with_close = !(opts && opts.with_close_button === false);
    let modal_children;
    if(dialog) {
        let header = ["div", {class: "MODAL_HEADER yui-dialog-header"}, [
            ["button", {class: "MODAL_BACK yui-dialog-back", type: "button", "aria-label": "back"},
                [["i", {class: "yi-arrow-left"}]]],
            ["span", {class: "MODAL_TITLE yui-dialog-title"},
                (title_prefix ? [["span", {class: "MODAL_TITLE_PREFIX"}, title_prefix]] : [])
                    .concat(title
                        ? [["span", {class: "MODAL_TITLE_KIND", i18n: title}, title]]
                        : [])],
            ["button", {class: "MODAL_CLOSE yui-dialog-x", type: "button", "aria-label": "close"},
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
        if(with_close) {
            modal_children.push(
                ["button", {class: "MODAL_CLOSE modal-close is-large",
                            "aria-label": "close"}]
            );
        }
    }

    /*  `opts.logical_class`: the CALLER's UPPER_SNAKE name for THIS modal
     *  (e.g. TRANGER_KEYS_SHEET). Every modal shares the MODAL block names,
     *  only this tells one popup from another in the Inspector or a selector. */
    let logical = (opts && opts.logical_class) || "";

    let $modal = createElement2(
        ["div", {class: "MODAL" + (logical ? " " + logical : "") +
                        " modal yui-modal" + (dialog ? " yui-dialog" : "") + " is-active",
                 role: "dialog", "aria-modal": "true"},
            modal_children
        ]
    );
    $layer.appendChild($modal);

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
     *  existing callers are unaffected. */
    let guarded_close = function(on_veto) {
        if(closed) {
            return;
        }
        let allow = true;
        if(opts && typeof opts.before_close === "function") {
            try {
                allow = opts.before_close();
            } catch(e) {
                log_warning(`yui_shell_show_modal: before_close threw: ${e}`);
                allow = true;
            }
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
     *  re-arm a fresh entry so a later Back still targets this modal. */
    let on_back = function() {
        guarded_close(function() {
            overlay = yui_shell_register_overlay(shell, on_back);
        });
    };

    escape_handler = request_close;
    yui_shell_push_escape(shell, "modal", request_close);
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
        ? [["p", {class: "CONFIRM_MSG yui-confirm-msg", i18n: message}, message]]
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
        if(typeof b.label === "string") {
            btn_attrs.i18n = b.label;
        }
        return ["button", btn_attrs, b.label];
    });

    let $card_children = [
        ["div", {class: "CONFIRM_ICON yui-confirm-icon"},
            [["i", {class: icon, "aria-hidden": "true"}]]
        ]
    ];
    if(!empty_string(title)) {
        $card_children.push(
            ["p", {class: "CONFIRM_TITLE yui-confirm-title has-text-centered",
                   i18n: title}, title]
        );
    }
    $card_children.push(
        ["button", {class: "CONFIRM_CLOSE delete yui-confirm-x", "aria-label": "close"}],
        ["section", {class: "CONFIRM_BODY modal-card-body has-text-centered"},
            $body_children],
        ["footer", {class: "CONFIRM_FOOT modal-card-foot"}, $footer_children]
    );

    /*  Caller's own UPPER_SNAKE name for THIS confirm, same contract as
     *  yui_shell_show_modal's `logical_class`. */
    let logical = (opts && opts.logical_class) ? " " + opts.logical_class : "";

    let $modal = createElement2(
        ["div", {class: `CONFIRM${logical} modal yui-modal yui-confirm is-active is-${type}`,
                 role: "dialog", "aria-modal": "true"},
            [
                ["div", {class: "CONFIRM_BACKDROP modal-background"}],
                ["div", {class: "CONFIRM_CARD modal-card"}, $card_children]
            ]
        ]
    );
    $layer.appendChild($modal);
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

        yui_shell_push_escape(shell, "modal", close_fn);
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


export function yui_shell_confirm_ok(shell, message, opts)
{
    let label = (opts && opts.ok_label) || "OK";
    if(!opts || !opts.type) {
        opts = Object.assign({}, opts, {type: "success"});
    }
    return build_dialog(shell, message, [
        {label: label, value: "ok", kind: "primary"}
    ], opts).then(() => undefined);
}

export function yui_shell_confirm_yesno(shell, message, opts)
{
    let yes_label = (opts && opts.yes_label) || "Yes";
    let no_label  = (opts && opts.no_label)  || "No";
    return build_dialog(shell, message, [
        {label: yes_label, value: "yes", kind: "primary"},
        {label: no_label,  value: "no"}
    ], opts).then(v => v === "yes");
}

export function yui_shell_confirm_yesnocancel(shell, message, opts)
{
    let yes_label    = (opts && opts.yes_label)    || "Yes";
    let no_label     = (opts && opts.no_label)     || "No";
    let cancel_label = (opts && opts.cancel_label) || "Cancel";
    return build_dialog(shell, message, [
        {label: yes_label,    value: "yes", kind: "primary"},
        {label: no_label,     value: "no"},
        {label: cancel_label, value: "cancel"}
    ], opts);
}
