/***********************************************************************
 *          c_yui_window.js
 *
 *          Window - position fixed
 *
 *  A window is a DIALOG for the keyboard and for a reader:
 *
 *    - it says so (`role="dialog"`) and is named by its title
 *      (`aria-labelledby` on its two halves, the kind half carrying
 *      its key, so the name changes language with it);
 *    - when it starts in answer to the reader (a press, a key) it
 *      takes the focus (`focus`: an element, a selector, a number;
 *      by default the window itself, which is focusable with
 *      tabindex=-1) -- not one the app restores on its own at start
 *      up -- and when it goes it gives the focus back to where it
 *      came from, if the focus was in it;
 *    - Escape closes it (`keyboard`) the way its ✕ does, through
 *      EV_CLOSE_WINDOW, so EV_WINDOW_TO_CLOSE can still veto or
 *      ask; not an Escape that what it was typed in took first
 *      (escape_is_taken());
 *    - a `modal` one blocks the rest of the app: it hangs over a
 *      backdrop in the shell's dialog layer (above the dock, the
 *      drawer, every other window), a press outside it does
 *      nothing, Tab stays inside (activate_focus_trap_on(), the
 *      trap of the shell's dialogs), and it never goes to the dock.
 *
 *  Up to 7.26.42 `focus`, `modal` and `keyboard` were declared and
 *  did nothing.
 *
 *          Copyright (c) 2025-2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/

import {
    SDATA,
    SDATA_END,
    data_type_t,
    gclass_create,
    event_flag_t,
    log_error,
    log_warning,
    gobj_read_pointer_attr,
    gobj_subscribe_event,
    gobj_write_attr,
    gobj_short_name,
    clean_name,
    gobj_send_event,
    gobj_find_service,
    createElement2,
    is_gobj,
    kw_get_local_storage_value,
    kw_set_local_storage_value,
    gobj_read_attr,
    gobj_read_bool_attr,
    gobj_read_str_attr,
    gobj_is_service,
    gobj_name,
    gobj_read_integer_attr,
    gobj_publish_event,
    gobj_destroy,
    gobj_write_bool_attr,
    gobj_write_integer_attr,
    gobj_stop,
    gobj_stop_children,
    gobj_is_running,
    gobj_is_destroying,
    refresh_language,
    empty_string,
    gobj_full_name,
    html_markup,
} from "@yuneta/gobj-js";

import {t} from "i18next";

import {yui_shell_confirm_yesnocancel} from "./shell_modals.js";
import {
    yui_shell_of,
    yui_shell_register_overlay,
    yui_shell_overlay_dismissed,
    yui_shell_window_layer,
    yui_shell_modal_layer,
    yui_shell_raise_window,
    yui_shell_watch_changes,
    yui_shell_unwatch_changes,
} from "./c_yui_shell.js";
import {activate_focus_trap_on, FOCUSABLE_SELECTOR} from "./shell_focus_trap.js";
import {escape_is_taken} from "./escape_taken.js";

import "./c_yui_window.css";
import {text_node} from "./yui_text.js";

/***************************************************************
 *              Constants
 ***************************************************************/
const GCLASS_NAME = "C_YUI_WINDOW";

/*  Window-control glyphs as inline SVG (currentColor → theme-aware,
 *  pixel-consistent). There is no minimize/restore glyph in the
 *  yui_icons.css mask set, and chrome affordances read better as
 *  crisp SVG than as content icons. */
const WC_MIN = '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="11" width="10" height="1.6" rx="0.8" fill="currentColor"/></svg>';
const WC_MAX = '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3.3" y="3.3" width="9.4" height="9.4" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>';
const WC_RESTORE = '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="5.2" y="3" width="7.8" height="7.8" rx="1.3" fill="none" stroke="currentColor" stroke-width="1.4"/><rect x="3" y="5.2" width="7.8" height="7.8" rx="1.3" fill="var(--bulma-scheme-main)" stroke="currentColor" stroke-width="1.4"/></svg>';
const WC_CLOSE = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4 L12 12 M12 4 L4 12" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';

/*  Bulma mobile breakpoint: at or below this a window becomes a
 *  full-screen sheet (no float / drag / resize). */
const MOBILE_MAX = 768;

/*  The band a FLOATING dock keeps at the top or the foot of the
 *  viewport (C_YUI_WINDOW_MANAGER publishes it on the root element).
 *  A window that fills the screen -- the sheet of a phone, a
 *  maximized one -- leaves it free: under the dock it lost its foot,
 *  or its ✕ at a top corner.  */
const DOCK_INSET_TOP = "var(--yui-dock-inset-top, 0px)";
const DOCK_INSET_BOTTOM = "var(--yui-dock-inset-bottom, 0px)";

/*  The z-index Bulma gives a `.modal` (--bulma-modal-z): a modal
 *  window and the shell's dialogs, in the same layer, stack in the
 *  order they opened in.  */
const MODAL_WINDOW_Z = 40;

/*  Unique ids for the title node a window is named by.  */
let __title_seq__ = 0;

/***************************************************************
 *              Data
 ***************************************************************/
const attrs_table = [
SDATA(data_type_t.DTP_POINTER,  "subscriber",   0,  null,   "Subscriber of output events"),
SDATA(data_type_t.DTP_POINTER,  "$parent",      0,  null,   "$container will be appended to $parent if not null, else to the window layer of the shell (document.body while there is none), following the shell when it is destroyed or another is built"),
SDATA(data_type_t.DTP_INTEGER,  "x",            0,  "300",  "X position"),
SDATA(data_type_t.DTP_INTEGER,  "y",            0,  "100",  "Y position"),
SDATA(data_type_t.DTP_INTEGER,  "width",        0,  "700",  "Width of the window"),
SDATA(data_type_t.DTP_INTEGER,  "height",       0,  "500",  "Height of the window"),
SDATA(data_type_t.DTP_BOOLEAN,  "auto_save_size_and_position", 0, false, "Automatically save size and position"),
SDATA(data_type_t.DTP_POINTER,  "header",       0,  null,   "Title-bar content, overriding the default `icon`+`title` strip: a gobj with $container or any createElement2() 'content' parameter. Only for a bar that is more than a title (e.g. a toolbar)"),
SDATA(data_type_t.DTP_POINTER,  "body",         0,  null,   "Can be a gobj with $container or any createElement2() 'content' parameter"),
SDATA(data_type_t.DTP_POINTER, "footer",       0,  null,   "Can be a gobj with $container or any createElement2() 'content' parameter"),
SDATA(data_type_t.DTP_BOOLEAN,  "center",       0,  true,   "Center the window"),
SDATA(data_type_t.DTP_BOOLEAN,  "force_center", 0,  false,  "After resize, re-center"),
SDATA(data_type_t.DTP_BOOLEAN,  "content_size", 0,  false,  "Height automatic, consider use max-height"),
SDATA(data_type_t.DTP_BOOLEAN,  "resizable",    0,  true,   "Allow resizing"),
SDATA(data_type_t.DTP_BOOLEAN,  "showFooter",   0,  true,   "Show footer"),
SDATA(data_type_t.DTP_BOOLEAN,  "openMaximized",0,  false,  "Open the window maximized"),
SDATA(data_type_t.DTP_BOOLEAN,  "showMax",      0,  true,   "Show maximize button"),
SDATA(data_type_t.DTP_BOOLEAN,  "showMin",      0,  true,   "Show minimize (to dock) button; ignored without a `manager`"),
SDATA(data_type_t.DTP_BOOLEAN,  "maximized",    0,  false,  "Flag to indicate if maximized"),
SDATA(data_type_t.DTP_JSON,     "window_style", 0,  "{}",   "Override window style"),
SDATA(data_type_t.DTP_POINTER,  "on_close",     0,  null,   "Callback on destroy"),
SDATA(data_type_t.DTP_POINTER,  "manager",      0,  null,   "Optional C_YUI_WINDOW_MANAGER (gobj or service name) for dock/taskbar"),
SDATA(data_type_t.DTP_STRING,   "logical_class",0,  "",     "Logical UPPER_SNAKE class(es) added to the window root, so the app can target THIS window exactly (e.g. 'TRANGER_KEYS_WINDOW')"),
SDATA(data_type_t.DTP_STRING,   "title_prefix", 0,  "",     "Optional DATA half of the title (a topic/service/marker name), shown before `title` and never translated. Use it instead of composing `${name} · ${t(key)}` into `title`, which cannot re-translate"),
SDATA(data_type_t.DTP_STRING,   "title",        0,  "",     "Window title, an i18n KEY: painted in the title bar (unless `header` overrides it) and on the dock chip. Pass the key, not t(key), or it cannot re-translate"),
SDATA(data_type_t.DTP_STRING,   "icon",         0,  "",     "Window icon (by window type), leading the title bar and the dock chip: a yi-* class name or inline SVG"),
SDATA(data_type_t.DTP_POINTER,  "focus",        0,  null,   "What takes the focus when the window starts in answer to the reader (a press, a key; a window the app restores on its own leaves the focus in the page, a modal one takes it always): an element of the window, a CSS selector looked up in it, or a number (the n-th control of the body, from 0). Null: the window itself. The focus goes back where it came from when the window goes, if it was in the window"),
SDATA(data_type_t.DTP_BOOLEAN,  "modal",        0,  false,  "Block the rest of the app while the window is open: a backdrop in the shell's dialog layer (above the dock, the drawer, every other window), a press outside does nothing, Tab stays inside, aria-modal. A modal window never goes to the dock: `manager` is ignored"),
SDATA(data_type_t.DTP_BOOLEAN,  "keyboard",     0,  true,   "Escape closes the window the way its ✕ does (EV_WINDOW_TO_CLOSE can veto or ask), when the focus is in it -- not an Escape that what it was typed in took first: a handler that used it, a cell editor that closed with it, a textarea or a contenteditable"),
SDATA(data_type_t.DTP_BOOLEAN,  "back_dismissable", 0, true, "Browser Back closes this window (floating overlays only; ignored when it has a `manager`)"),
SDATA(data_type_t.DTP_BOOLEAN,  "keep_on_navigate", 0, false, "This window is a navigation PANEL: a route change does not close it"),
SDATA(data_type_t.DTP_POINTER,  "back_overlay", 0,  null,   "Internal: overlay-history entry (Back-button integration)"),
SDATA(data_type_t.DTP_POINTER,  "$container",   0,  null,   "Internal: Window container element"),
SDATA(data_type_t.DTP_STRING,   "window_id",    0,  "",     "Internal: Window ID"),
SDATA(data_type_t.DTP_POINTER,  "win_resize_handler", 0, null, "Internal: native window 'resize' listener"),
SDATA_END()
];

let PRIVATE_DATA = {
    prevSize: 0,
    /*  The window lives in the place the shell gives it (its host
     *  named no `$parent`, or the one it named went with a shell):
     *  it follows the shell, see ac_shell_changed().  */
    placed_by_shell: false,
    /*  The shell that holds this window's Back entry (`back_overlay`).  */
    back_shell: null,
    /*  Where the focus was when the window started: it goes back
     *  there when the window goes.  */
    opener: null,
    /*  A modal window: the element that holds it over its backdrop
     *  (what is placed and removed instead of $container), and the
     *  release of its focus trap.  */
    $lock: null,
    release_focus: null,
};

let __gclass__ = null;




                    /******************************
                     *      Framework Methods
                     ******************************/




/***************************************************************
 *          Framework Method: Create
 ***************************************************************/
function mt_create(gobj)
{
    /*
     *  SERVICE subscription model
     */
    const subscriber = gobj_read_pointer_attr(gobj, "subscriber");
    if(subscriber) {
        gobj_subscribe_event(gobj, null, {}, subscriber);
    }

    let window_id = "window-" + clean_name(gobj_short_name(gobj));
    gobj_write_attr(gobj, "window_id", window_id);

    /*  A modal window blocks the dock too: minimized to it, it would
     *  leave its backdrop up and nothing to bring it back with.  */
    if(gobj_read_bool_attr(gobj, "modal") && gobj_read_pointer_attr(gobj, "manager")) {
        log_warning(`${gobj_short_name(gobj)}: a modal window does not go to the dock: its manager is ignored`);
        gobj_write_attr(gobj, "manager", null);
    }

    /*  Optional window manager (dock/taskbar): register, and raise/
     *  highlight on any pointer press. Resolved BEFORE build_ui: minimize
     *  means "send to the dock", so without a manager there is nowhere to
     *  minimize TO and build_ui must not paint the button at all. */
    let manager = resolve_manager(gobj);

    build_ui(gobj);

    /*  Its place belongs to a shell, and the window may outlive it (a
     *  window parented to the app, across a logout): told when a shell
     *  is built or destroyed, it takes its place again
     *  (ac_shell_changed). Unwatched in mt_destroy.  */
    yui_shell_watch_changes(gobj);

    if(manager) {
        let $c = gobj_read_attr(gobj, "$container");
        if($c) {
            $c.addEventListener("pointerdown", function() {
                let m = gobj_read_pointer_attr(gobj, "manager");
                if(m) {
                    gobj_send_event(m, "EV_FOCUS_WINDOW", {window: gobj_full_name(gobj)}, gobj);
                }
            }, true);
        }
        /*  The chip gets the SPLIT halves so its label re-translates
         *  like the title bar: `title_key` is the i18n KEY (the chip
         *  renders it with data-i18n, so refresh_language reaches it),
         *  `title` the translated fallback text so the chip is born in
         *  the current language (the manager has no translator of its
         *  own), `title_prefix` the DATA half, never translated. */
        let chip_title = composed_title(gobj);
        gobj_send_event(manager, "EV_REGISTER_WINDOW", {
            window: gobj_full_name(gobj),
            title: chip_title ? chip_title : gobj_short_name(gobj),
            title_key: gobj_read_str_attr(gobj, "title") || "",
            title_kind_text: empty_string(gobj_read_str_attr(gobj, "title"))
                ? "" : t(gobj_read_str_attr(gobj, "title")),
            title_prefix: gobj_read_str_attr(gobj, "title_prefix") || "",
            icon: gobj_read_attr(gobj, "icon") || "",
        }, gobj);
    } else {
        /*  No dock: the window orders itself, on the SAME counter the
         *  dock raises its windows to (yui_shell_raise_window). Opened on
         *  top of every window, docked or not -- it opened under any
         *  docked one -- and brought up again by any press on it, which
         *  crosses the FSM as EV_SHOW, as a docked window's crosses it as
         *  the dock's EV_FOCUS_WINDOW.  */
        let $c = gobj_read_attr(gobj, "$container");
        if($c) {
            yui_shell_raise_window($c);
            $c.addEventListener("pointerdown", function() {
                if(!gobj_is_destroying(gobj)) {
                    gobj_send_event(gobj, "EV_SHOW", {}, gobj);
                }
            }, true);
        }
        if(gobj_read_bool_attr(gobj, "back_dismissable")) {
            /*  Floating overlay window (no dock manager): the browser Back
             *  button closes it, like a modal/popup.  Dock-managed windows
             *  are persistent workspace surfaces and are left out — which
             *  is also why a navigation panel prefers a manager, and falls
             *  back to `keep_on_navigate` when the app has no dock.
             *  Retired in mt_destroy (covers every teardown path). */
            register_back_overlay(gobj);
        }
    }

    /*  Keep the window inside the viewport on a breakpoint change.
     *  The browser's own 'resize' is the source: this IS the OS
     *  notification, and handleResize() clamps to screen (+ optional
     *  re-center).  The legacy path — subscribing to EV_RESIZE from a
     *  C_YUI_MAIN "__yui_main__" service — was retired: C_YUI_SHELL has
     *  no such service, so it never fired under v2, and it duplicated
     *  this listener wherever an app did provide one.  Detached in
     *  mt_destroy. */
    let on_win_resize = function() {
        handleResize(gobj);
    };
    gobj_write_attr(gobj, "win_resize_handler", on_win_resize);
    window.addEventListener("resize", on_win_resize);
}

/***************************************************************
 *          Framework Method: Start
 *
 *  The window takes the focus when it STARTS, not when it is
 *  created: a host fills the body between the two (the json pad,
 *  the frontend view), and `focus` may name what it put there.
 *
 *  Only a window the READER opened takes it (opened_by_the_reader()).
 *  One the app opens on its own -- the Developer window restored at
 *  start up from the last session -- leaves the focus in the page:
 *  the first Tab of a keyboard reader landed in a window they had
 *  not opened. A modal window takes it all the same: nothing else
 *  can be used while it is up.
 ***************************************************************/
function mt_start(gobj)
{
    let priv = gobj.priv;

    let $container = gobj_read_attr(gobj, "$container");
    if(!$container) {
        log_error(`${gobj_short_name(gobj)}: started without a container`);
        return;
    }

    let active = document.activeElement;
    if(active && active !== document.body && !$container.contains(active)) {
        priv.opener = active;
    }
    let modal = gobj_read_bool_attr(gobj, "modal");
    if(modal && !priv.release_focus) {
        /*  Saves the opener itself, and gives it back on release.  */
        priv.release_focus = activate_focus_trap_on($container);
    }
    if(modal || opened_by_the_reader()) {
        focus_target(gobj, $container).focus();
    }
}

/***************************************************************
 *          Framework Method: Destroy
 ***************************************************************/
function mt_destroy(gobj)
{
    let priv = gobj.priv;

    give_focus_back(gobj);

    yui_shell_unwatch_changes(gobj);

    /*  A dock destroyed first took this window's chip with it.  */
    let manager = gobj_read_pointer_attr(gobj, "manager");
    if(manager && !gobj_is_destroying(manager)) {
        gobj_send_event(manager, "EV_UNREGISTER_WINDOW", {window: gobj_full_name(gobj)}, gobj);
    }

    /*  Retire the overlay-history entry, if this was a Back-dismissable
     *  floating window (no-op when Back itself triggered the teardown),
     *  in the shell that HOLDS it: the one this window governs now may
     *  be another (ac_shell_changed).  */
    let back_overlay = gobj_read_attr(gobj, "back_overlay");
    if(back_overlay) {
        if(priv.back_shell) {
            yui_shell_overlay_dismissed(priv.back_shell, back_overlay);
        }
        gobj_write_attr(gobj, "back_overlay", null);
        priv.back_shell = null;
    }

    let on_win_resize = gobj_read_attr(gobj, "win_resize_handler");
    if(on_win_resize) {
        window.removeEventListener("resize", on_win_resize);
        gobj_write_attr(gobj, "win_resize_handler", null);
    }
    destroy_ui(gobj);
}




                    /***************************
                     *      Local Methods
                     ***************************/




/************************************************************
 *   Inject the window-chrome stylesheet once. Theme-aware via
 *   Bulma scheme vars (flips on <html data-theme>); replaces the
 *   old saturated `has-background-info` bar + forced black text.
 ************************************************************/
function ensure_window_style()
{
    if(document.getElementById('yui-window-style')) {
        return;
    }
    let css = `
.yui-window-header {
    background: var(--bulma-scheme-main-bis);
    color: var(--bulma-text-strong);
    -webkit-user-select: none; user-select: none;
}
.yui-window-titlebar-controls { display: flex; align-items: center; gap: 2px; padding-left: 6px; }
.yui-window-title { white-space: nowrap; }
.yui-window-title .icon { flex: 0 0 auto; }
.yui-window-title svg { width: 14px; height: 14px; display: block; }
/*  Separator between the data half and the translated kind half. CSS,
 *  not a text node: createElement2 trims text nodes and eats the spaces.
 *  Decorative ("/ ''"): the halves NAME the window, and a reader read
 *  the dot into the kind half ("#1 ·demo window"). */
.WINDOW_TITLE_PREFIX + .WINDOW_TITLE_KIND::before {
    content: "·";
    content: "·" / "";
    padding: 0 0.4em;
    color: var(--bulma-text-weak);
}
.yui-wc {
    width: 30px; height: 26px; display: inline-flex; align-items: center; justify-content: center;
    padding: 0; border: 0; background: transparent; color: var(--bulma-text); cursor: pointer;
    border-radius: 5px; -webkit-tap-highlight-color: transparent;
}
.yui-wc:hover { background: var(--bulma-scheme-main-ter); color: var(--bulma-text-strong); }
.yui-wc.wc-close:hover { background: #e0364a; color: #fff; }
.yui-wc svg { width: 15px; height: 15px; display: block; }
.yui-window-resize { color: var(--bulma-text-weak); opacity: 0.55; }
.yui-window-resize:hover { opacity: 1; color: var(--bulma-text); }
/*  A modal window over its backdrop: the backdrop of a Bulma .modal,
 *  which the shell's dialogs wear (its variable lives on .modal).  */
.yui-window-lock { position: fixed; inset: 0; }
.yui-window-backdrop {
    position: absolute; inset: 0;
    background-color: hsla(var(--bulma-scheme-h), var(--bulma-scheme-s), var(--bulma-scheme-invert-l), 0.86);
}
@media (max-width: ${MOBILE_MAX}px) {
    .C_YUI_WINDOW.is-mobile-sheet { border-radius: 0 !important; box-shadow: none !important; }
    .C_YUI_WINDOW.is-mobile-sheet .yui-window-resize { display: none !important; }
    .yui-wc { width: 42px; height: 38px; }
    .yui-wc.wc-max { display: none !important; }
    .yui-wc svg { width: 18px; height: 18px; }
}
`;
    let $style = document.createElement('style');
    $style.id = 'yui-window-style';
    $style.textContent = css;
    document.head.appendChild($style);
}

/************************************************************
 *   The title bar's default content: `icon` + `title_prefix` +
 *   `title`, used when the caller supplies no `header`. Until this
 *   existed, `title` only reached the dock chip, so a window without
 *   a hand-rolled header painted an EMPTY bar — every caller that
 *   wanted a title built the same icon+text strip itself, and the
 *   ones that didn't (Keys, Raw JSON) ended up anonymous or titled
 *   inside their body.
 *
 *   `icon` follows the dock chip's convention: inline SVG when it
 *   starts with '<', otherwise a yi-* class name.
 *
 *   The two halves are separate text nodes on purpose. Titles here are
 *   nearly always "<what> · <kind>" — `raw_tracks · keys` — and
 *   composing that into one string is what makes a title untranslatable:
 *   `${topic} · ${t("keys")}` is not an i18n key, so i18next answers it
 *   with itself and it stays in the language it was built in for the
 *   life of the window. Split, the DATA half (`title_prefix`) is left
 *   alone and the KIND half carries its key, so a host
 *   refresh_language() re-translates just that one. The separator is
 *   CSS (::before), never a text node: createElement2 TRIMS text nodes
 *   and would eat the spaces around it.
 *
 *   The same halves NAME the window: aria-labelledby lists them
 *   (`<id>-prefix`, `<id>-kind`), so a reader joins them with a space
 *   and leaves out the CSS separator, and the kind half changes
 *   language. Under a `header` of the caller's the node is still
 *   built, `hidden` (is-sr-only, no icon): a header is a toolbar more
 *   often than a title, and the name of a dialog is its title.
 ************************************************************/
function build_title_node(gobj, id, hidden)
{
    let title = gobj_read_str_attr(gobj, "title");
    let prefix = gobj_read_str_attr(gobj, "title_prefix");
    if(empty_string(title) && empty_string(prefix)) {
        return null;
    }

    let icon = hidden ? "" : gobj_read_str_attr(gobj, "icon");
    let items = [];
    if(!empty_string(icon)) {
        if(icon.charAt(0) === '<') {
            /*  The `icon` attr is the app's own: inline svg is markup.  */
            items.push(['span', {class: 'icon'}, html_markup(icon)]);
        } else {
            items.push(['span', {class: 'icon'}, [['i', {class: icon}]]]);
        }
    }
    if(!empty_string(prefix)) {
        items.push(
            ['span', {class: 'WINDOW_TITLE_PREFIX has-text-weight-semibold', id: `${id}-prefix`},
             text_node(prefix)]     // data, not markup
        );
    }
    if(!empty_string(title)) {
        items.push(
            ['span', {class: 'WINDOW_TITLE_KIND has-text-weight-semibold', id: `${id}-kind`,
                      i18n: title}, text_node(title)]
        );
    }

    return createElement2(
        ['span', {
            id: id,
            class: hidden ? 'WINDOW_TITLE is-sr-only' : 'WINDOW_TITLE yui-window-title icon-text ml-1'
        }, items]
    );
}

/************************************************************
 *   The window's title as ONE plain string, for consumers that
 *   cannot hold markup: the dock chip's label and its `title`
 *   tooltip. Same two halves as the bar, joined here.
 ************************************************************/
function composed_title(gobj)
{
    let title = gobj_read_str_attr(gobj, "title");
    let prefix = gobj_read_str_attr(gobj, "title_prefix");
    let kind = empty_string(title) ? "" : t(title);

    if(!empty_string(prefix) && !empty_string(kind)) {
        return `${prefix} · ${kind}`;
    }
    return empty_string(prefix) ? kind : prefix;
}

/************************************************************
 *   Is the window opening in answer to the reader -- a press, a
 *   key (the browser's user activation)? Not one the app restores
 *   at start up. A browser that cannot say is taken at its word
 *   that the reader asked.
 ************************************************************/
function opened_by_the_reader()
{
    let ua = (typeof navigator !== "undefined") ? navigator.userActivation : null;
    if(!ua) {
        return true;
    }
    return !!ua.isActive;
}

/************************************************************
 *   What takes the focus when the window starts (`focus`): an
 *   element of the window, a selector looked up in it, or the
 *   n-th control of the body. Null, or one that names nothing
 *   (said): the window itself.
 ************************************************************/
function focus_target(gobj, $container)
{
    let focus = gobj_read_attr(gobj, "focus");
    if(focus === null || focus === undefined) {
        return $container;
    }

    let $target = null;
    if(typeof focus === "number") {
        let $body = $container.querySelector(".WINDOW_BODY");
        let controls = $body ? $body.querySelectorAll(FOCUSABLE_SELECTOR) : [];
        $target = controls[focus] || null;
    } else if(typeof focus === "string") {
        $target = $container.querySelector(focus);
    } else if(focus && typeof focus.focus === "function" && $container.contains(focus)) {
        $target = focus;
    }

    if(!$target) {
        log_warning(`${gobj_short_name(gobj)}: focus '${String(focus)}' names nothing in the window: the window takes it`);
        return $container;
    }
    return $target;
}

/************************************************************
 *   The window goes: the focus goes back where it came from --
 *   if it was in the window, or lost with what the window held
 *   (a child torn down first takes its focused element with
 *   it). A focus the reader has put elsewhere stays there. A
 *   modal window's trap gives it back itself.
 ************************************************************/
function give_focus_back(gobj)
{
    let priv = gobj.priv;

    let opener = priv.opener;
    priv.opener = null;

    if(priv.release_focus) {
        let release = priv.release_focus;
        priv.release_focus = null;
        release();
        return;
    }

    let $container = gobj_read_attr(gobj, "$container");
    let active = document.activeElement;
    let lost = !active || active === document.body;
    if(!lost && !($container && $container.contains(active))) {
        return;
    }
    if(opener && opener.isConnected !== false && typeof opener.focus === "function") {
        opener.focus();
    }
}

/************************************************************
 *   A window that fills the screen -- the sheet of a phone, a
 *   maximized one -- fills it but for the band a floating dock
 *   keeps (DOCK_INSET_*). CSS, so the band moves with the dock
 *   and no one has to tell the window.
 ************************************************************/
function fill_work_area($container)
{
    let vw = window.innerWidth || document.documentElement.offsetWidth;
    let vh = window.innerHeight || document.documentElement.offsetHeight;

    $container.style.left = '0px';
    $container.style.top = DOCK_INSET_TOP;
    $container.style.width = vw + 'px';
    $container.style.height = `calc(${vh}px - ${DOCK_INSET_TOP} - ${DOCK_INSET_BOTTOM})`;
    return {x: 0, y: 0, width: vw, height: vh};
}

/************************************************************
 *   What is placed in the DOM, and removed from it: the window,
 *   or the lock that holds a modal one over its backdrop.
 ************************************************************/
function window_root(gobj)
{
    return gobj.priv.$lock || gobj_read_attr(gobj, "$container");
}

/************************************************************
 *   An Escape typed in the window. The callback only decides
 *   whether the key is the window's -- not when `keyboard` is
 *   off, nor one that what it was typed in took -- and sends
 *   the event: the close is the ✕'s, in the action.
 ************************************************************/
function on_escape_key(gobj, evt)
{
    if(evt.key !== "Escape" && evt.keyCode !== 27) {
        return;
    }
    if(gobj_is_destroying(gobj) || !gobj_read_bool_attr(gobj, "keyboard")) {
        return;
    }
    if(escape_is_taken(evt)) {
        /*  An inline editor that closed with the key took the focus
         *  with it (to <body>): the window takes it back, or the next
         *  Escape -- and Tab -- would not be heard here.  */
        let $container = gobj_read_attr(gobj, "$container");
        let active = document.activeElement;
        if(evt.target && evt.target.isConnected === false && $container &&
                (!active || active === document.body)) {
            $container.focus();
        }
        return;
    }
    evt.preventDefault();
    evt.stopPropagation();
    gobj_send_event(gobj, "EV_CLOSE_WINDOW", {key: "Escape"}, gobj);
}

/************************************************************
 *   Below the mobile breakpoint the window is a full-screen
 *   sheet (no float / drag / resize).
 ************************************************************/
function is_mobile()
{
    let w = window.innerWidth || document.documentElement.offsetWidth;
    return w <= MOBILE_MAX;
}

/************************************************************
 *   Resolve the optional `manager` attr (a gobj or a service
 *   name) to a gobj, caching the resolution back into the attr.
 ************************************************************/
function resolve_manager(gobj)
{
    let m = gobj_read_pointer_attr(gobj, "manager");
    if(!m) {
        return null;
    }
    if(typeof m === "string") {
        let name = m;
        m = gobj_find_service(name, false) || null;
        if(!m) {
            log_warning(`${GCLASS_NAME}: window manager '${name}' not found: no dock, no minimize`);
        }
        gobj_write_attr(gobj, "manager", m);
    }
    return m;
}

/************************************************************
 *   Minimize: send the window to the dock. Only reachable when
 *   a manager exists — the button is not painted otherwise.
 ************************************************************/
function do_minimize(gobj)
{
    let manager = gobj_read_pointer_attr(gobj, "manager");
    if(!manager) {
        log_error(`${gobj_short_name(gobj)}: minimize without a window manager`);
        return;
    }
    gobj_send_event(manager, "EV_MINIMIZE_WINDOW", {window: gobj_full_name(gobj)}, gobj);
}

/************************************************************
 *   Build UI
 ************************************************************/
function build_ui(gobj)
{
    ensure_window_style();
    let mobile = is_mobile();

    let header = gobj_read_attr(gobj, "header");
    if(is_gobj(header)) {
        header = gobj_read_attr(header, "$container");
    }
    let title_id = `yui-window-title-${++__title_seq__}`;
    let $title = build_title_node(gobj, title_id, !!header);
    let $hidden_title = header ? $title : null;
    if(!header) {
        header = $title;
    }
    let modal = gobj_read_bool_attr(gobj, "modal");
    let body = gobj_read_attr(gobj, "body");
    if(is_gobj(body)) {
        body = gobj_read_attr(body, "$container");
    }
    let footer = gobj_read_attr(gobj, "footer");
    if(is_gobj(footer)) {
        footer = gobj_read_attr(footer, "$container");
    }

    /*----------------------------------------------*
     *  Layout Schema
     *----------------------------------------------*/
    if(gobj_read_bool_attr(gobj, "auto_save_size_and_position")) {
        if(gobj_is_service(gobj)) {
            let rect = kw_get_local_storage_value(`${gobj_name(gobj)}-rect`);
            if(rect) {
                rect.x = rect.x<0?0:rect.x;
                rect.y = rect.y<0?0:rect.y;
                gobj_write_attr(gobj, "center", false);
                gobj_write_attr(gobj, "x", rect.x);
                gobj_write_attr(gobj, "y", rect.y);
                gobj_write_attr(gobj, "width", rect.width);
                gobj_write_attr(gobj, "height", rect.height);
            }
        }
    }

    let rect = do_fix_dimension_to_screen(
        gobj,
        gobj_read_integer_attr(gobj, "x"),
        gobj_read_integer_attr(gobj, "y"),
        gobj_read_integer_attr(gobj, "width"),
        gobj_read_integer_attr(gobj, "height")
    );
    if(gobj_read_bool_attr(gobj, "center")) {
        rect = do_center(gobj, rect.x, rect.y, rect.width, rect.height);
    }

    /*  On mobile the window is a full-screen sheet: ignore the saved
     *  rect / centering and fill the viewport. */
    if(mobile) {
        rect = {
            x: 0, y: 0,
            width: window.innerWidth || document.documentElement.offsetWidth,
            height: window.innerHeight || document.documentElement.offsetHeight,
        };
    }

    let window_style = {
        position: "fixed",
        "z-index": 3,
        overflow: "hidden",
        "font-family": "var(--bulma-family-primary)",
        "border-radius": "6px",
        padding: "0px",
        margin: "0px",
        "background-color": "var(--bulma-scheme-main)",
        left: `${rect.x}px`,
        top: `${rect.y}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        "min-width": "300px",
        "min-height": "200px",
        "box-sizing": "border-box",
    };
    Object.assign(window_style, gobj_read_attr(gobj, "window_style"));

    /*  Logical (UPPER_SNAKE) block names, per the repo's DOM convention:
     *  uppercase identifies the block, lowercase styles it. `logical_class`
     *  is the CALLER's name for this particular window (e.g.
     *  TRANGER_KEYS_WINDOW) — several windows share the C_YUI_WINDOW class,
     *  only this tells them apart in the Inspector or in a selector. */
    let logical = gobj_read_str_attr(gobj, "logical_class");

    let dialog_attrs = {role: 'dialog', tabindex: '-1'};
    let label_ids = [];
    if(!empty_string(gobj_read_str_attr(gobj, "title_prefix"))) {
        label_ids.push(`${title_id}-prefix`);
    }
    if(!empty_string(gobj_read_str_attr(gobj, "title"))) {
        label_ids.push(`${title_id}-kind`);
    }
    if(label_ids.length > 0) {
        dialog_attrs['aria-labelledby'] = label_ids.join(' ');
    }
    if(modal) {
        dialog_attrs['aria-modal'] = 'true';
    }

    let $container = createElement2(
        ['div', Object.assign({
            class: 'C_YUI_WINDOW' + (logical ? ' ' + logical : '') +
                   ' strong-shadow is-flex is-flex-direction-column' + (mobile ? ' is-mobile-sheet' : ''),
            style: window_style}, dialog_attrs), [

            /*----------------------------*
             *          Header
             *----------------------------*/
            ['div', {
                class: 'WINDOW_HEADER yui-window-header p-1 is-flex-shrink-0 is-flex is-flex-nowrap is-justify-content-space-between is-align-items-center', style: 'border-bottom:1px solid var(--bulma-border); cursor:move; box-sizing: border-box;'
                }, [
                /*  Custom header content: a single-row, horizontally
                 *  scrollable strip.  It takes the remaining width and
                 *  may shrink (min-width:0); its content is laid out in
                 *  ONE row (inline-flex, nowrap) so a wide header (e.g.
                 *  the dev toolbar) scrolls sideways instead of wrapping
                 *  taller and eating the body.  The header height stays
                 *  ~one row on every breakpoint, and the max/close group
                 *  to the right is never pushed out. */
                ['div', { class: 'is-flex-grow-1', style: 'min-width:0; overflow-x:auto; overflow-y:hidden;'}, [
                    /*  width:max-content sizes this to the UNWRAPPED
                     *  (single-line) width of the header content, so a
                     *  Bulma .buttons bar inside lays out in one row and
                     *  OVERFLOWS the scroll viewport above instead of
                     *  wrapping taller.  inline-flex alone didn't: the
                     *  child still inherited the column's constrained
                     *  width and kept wrapping. */
                    ['div', {class: '', style: 'width:max-content; display:flex; flex-wrap:nowrap; align-items:center;'}, header]
                ]],
                /*  Window controls: pinned top-right, never shrink,
                 *  never wrap, always on top so the click always lands.
                 *  Minimize (to dock) · maximize/restore · close.
                 *  Minimize exists ONLY with a window manager: it means
                 *  "send to the dock", and there is no such place without
                 *  one. `manager` is already resolved (mt_create). */
                ['div', {class: 'WINDOW_CONTROLS yui-window-titlebar-controls is-flex-shrink-0', style: 'position:relative; z-index:1; cursor:default;'}, [
                    /*----------------------------*
                     *      Minimize (to dock)
                     *----------------------------*/
                    ['button', {
                        class: 'WINDOW_MIN yui-wc wc-min', type: 'button',
                        title: t('minimize'), 'data-i18n-title': 'minimize',
                        'aria-label': t('minimize'), 'data-i18n-aria-label': 'minimize',
                        style: (gobj_read_bool_attr(gobj, "showMin") &&
                                gobj_read_pointer_attr(gobj, "manager")) ? '' : 'display:none;',
                    }, html_markup(WC_MIN), {
                        click: (evt) => {
                            evt.stopPropagation();
                            do_minimize(gobj);
                        }
                    }],
                    /*----------------------------*
                     *      Maximize / restore
                     *----------------------------*/
                    ['button', {
                        class: 'WINDOW_MAX yui-wc wc-max', type: 'button',
                        title: t('maximize'), 'data-i18n-title': 'maximize',
                        'aria-label': t('maximize'), 'data-i18n-aria-label': 'maximize',
                        style: gobj_read_bool_attr(gobj, "showMax") ? '' : 'display:none;',
                    }, html_markup(WC_MAX), {
                        click: (evt) => {
                            evt.stopPropagation();
                            toggle(gobj);
                        }
                    }],
                    /*----------------------------*
                     *      Close
                     *----------------------------*/
                    ['button', {
                        class: 'WINDOW_CLOSE yui-wc wc-close', type: 'button',
                        title: t('close'), 'data-i18n-title': 'close',
                        'aria-label': t('close'), 'data-i18n-aria-label': 'close',
                    }, html_markup(WC_CLOSE), {
                        click: (evt) => {
                            evt.stopPropagation();
                            gobj_send_event(gobj, "EV_CLOSE_WINDOW", {}, gobj);
                        }
                    }]
                ]]
            ],
                {
                    pointerdown: (evt) => {
                        /*  Never start a window-move when the press
                         *  lands on a header control button (max /
                         *  close) — anywhere on the button, not just
                         *  its <i> glyph.  The old `target is the
                         *  yi-xmark <i>` test failed on the button
                         *  padding and entirely on the max button, so
                         *  a narrow/wrapped header made the X
                         *  un-closable (drag ate the click). */
                        if(evt.target.closest && evt.target.closest("button")) {
                            return;
                        }
                        /*  Pressing the scrollbar of the single-row
                         *  header strip (overflow-x:auto) must scroll,
                         *  not drag the window.  When the press is on
                         *  the scroll container itself and falls in
                         *  the scrollbar gutter (offset beyond the
                         *  client box of an overflowing element), skip
                         *  the move.  Pressing the title text / a
                         *  button has its own target, so dragging by
                         *  the header content still works. */
                        let t = evt.target;
                        if(t && t.scrollWidth > t.clientWidth &&
                            evt.offsetY > t.clientHeight) {
                            return;
                        }
                        if(t && t.scrollHeight > t.clientHeight &&
                            evt.offsetX > t.clientWidth) {
                            return;
                        }
                        mvStart(gobj, evt);
                    }
                }
            ],

            /*----------------------------*
             *          Body
             *----------------------------*/
            ['div', {
                class: 'WINDOW_BODY yui-window-body is-flex-grow-1 p-1',
                style: {
                    "position": "relative", // to resize button (absolute position) when no footer bar
                    "overflow": "auto",
                    "overscroll-behavior": "contain",
                    "box-sizing": "border-box",
                    "min-height": 0,
                }}, body],

            /*----------------------------*
             *          Footer
             *----------------------------*/
            ['div', {class: 'WINDOW_FOOTER yui-window-footer is-flex-shrink-0'}, [
                ['div', {
                    class: 'is-justify-content-space-between is-align-items-center p-1',
                    style: {
                        "display": gobj_read_bool_attr(gobj, "showFooter")?'flex':'none',
                        "flex-wrap": "nowrap",
                        "border-top": "1px solid var(--bulma-border)",
                        "min-height": "30px",
                        "box-sizing": "border-box",
                    }
                }, [

                    /*  Same single-row, horizontally scrollable strip
                     *  as the header: a wide status bar scrolls
                     *  sideways instead of wrapping taller, and the
                     *  resize handle stays pinned bottom-right. */
                    ['div', { class: 'is-flex-grow-1', style: 'min-width:0; overflow-x:auto; overflow-y:hidden;'}, [
                        ['div', {class: '', style: 'width:max-content; display:flex; flex-wrap:nowrap; align-items:center;'}, footer]
                    ]],

                    /*----------------------------*
                     *  Resize button in footer
                     *----------------------------*/
                    ['div', {class: 'is-flex-shrink-0 is-flex'}, [
                        ['div', {
                            class: 'without-border',
                            style: {
                                cursor: "nwse-resize",
                                display: gobj_read_bool_attr(gobj, "resizable")?'flex':'none',
                                "box-sizing": "border-box",
                           }
                        }, [
                            ['span', {style: 'display:inline-block;height:1.4em; width:1.4em;'}, html_markup('<svg viewBox="0 0 500 500"><path d="m427.87 493.69a33.778 33.78 0 0 1-23.882-57.661l33.778-33.78a33.799 33.8 0 0 1 47.83 47.763l-33.778 33.78a33.778 33.78 0 0 1-23.882 9.8976zm-190.44 0a33.778 33.78 0 0 1-23.882-57.661l224.22-224.23a33.799 33.8 0 0 1 47.83 47.763l-224.22 224.23a33.778 33.78 0 0 1-23.882 9.8976zm-197.26 0a33.778 33.78 0 0 1-23.882-57.661l421.46-421.47a33.786 33.786 0 1 1 47.797 47.763l-421.49 421.47a33.778 33.78 0 0 1-23.882 9.8976z" fill="var(--bulma-text)" stroke-width="33.78"/></svg>')]

                        ], {
                            pointerdown: (evt) => {
                                rsStart(gobj, evt);
                            }
                        }]
                    ]]
                ]]
            ]]
        ]]
    );
    gobj_write_attr(gobj, "$container", $container);

    if($hidden_title) {
        $container.insertBefore($hidden_title, $container.firstChild);
    }
    $container.addEventListener("keydown", function(evt) {
        on_escape_key(gobj, evt);
    });
    if(mobile) {
        fill_work_area($container);
    }

    /*----------------------------*
     *  Resize button in body
     *----------------------------*/
    if(gobj_read_bool_attr(gobj, "resizable") && !gobj_read_bool_attr(gobj, "showFooter")) {
        let $resizable_btn = createElement2(['div', {
            class: 'WINDOW_RESIZE without-border yui-window-resize',
            style: {
                cursor: "nwse-resize",
                display: "flex",
                position: "absolute",
                right: "0px",
                bottom: "0px",
                padding: "4px",
                "background-color": "transparent",
            }
        }, [
            ['span',
                {
                    style: 'display:inline-block;height:1.4em; width:1.4em;'
                },
                html_markup('<svg viewBox="0 0 500 500"><path d="m427.87 493.69a33.778 33.78 0 0 1-23.882-57.661l33.778-33.78a33.799 33.8 0 0 1 47.83 47.763l-33.778 33.78a33.778 33.78 0 0 1-23.882 9.8976zm-190.44 0a33.778 33.78 0 0 1-23.882-57.661l224.22-224.23a33.799 33.8 0 0 1 47.83 47.763l-224.22 224.23a33.778 33.78 0 0 1-23.882 9.8976zm-197.26 0a33.778 33.78 0 0 1-23.882-57.661l421.46-421.47a33.786 33.786 0 1 1 47.797 47.763l-421.49 421.47a33.778 33.78 0 0 1-23.882 9.8976z" fill="var(--bulma-text)" stroke-width="33.78"/></svg>')
            ]

        ], {
            pointerdown: (evt) => {
                rsStart(gobj, evt);
            }
        }]);

        $container.appendChild($resizable_btn);
    }

    refresh_language($container, t);

    if(modal) {
        /*  A press on the backdrop closes nothing: a modal is answered,
         *  not dismissed by a click beside it. Nor does it take the
         *  focus out of the window, where Escape and Tab are heard.  */
        let $lock = createElement2(
            ['div', {class: 'WINDOW_MODAL_LOCK yui-window-lock',
                     style: `z-index:${MODAL_WINDOW_Z};`}, [
                ['div', {class: 'WINDOW_MODAL_BACKDROP yui-window-backdrop'}, [], {
                    mousedown: (evt) => {
                        evt.preventDefault();
                    }
                }]
            ]]
        );
        $lock.appendChild($container);
        gobj.priv.$lock = $lock;
    }

    let $parent = gobj_read_attr(gobj, "$parent");
    gobj.priv.placed_by_shell = !$parent;
    if(!$parent) {
        $parent = window_place(gobj);
    }
    $parent.appendChild(window_root(gobj));

    if (gobj_read_bool_attr(gobj, "openMaximized")) {
        max(gobj);
    } else if(!mobile) {
        if(gobj_read_bool_attr(gobj, "content_size")) {
            $container.style.height = "auto";
        }
        if (gobj_read_bool_attr(gobj, "center")) {
            rect = $container.getBoundingClientRect();
            rect = do_center(gobj, rect.x, rect.y, rect.width, rect.height);
            $container.style.left = parseInt(rect.x) + 'px';
            $container.style.top = parseInt(rect.y) + 'px';
        }
    }
}

/************************************************************
 *   Destroy UI
 ************************************************************/
function destroy_ui(gobj)
{
    let $root = window_root(gobj);
    if($root && $root.parentNode) {
        $root.parentNode.removeChild($root);
    }
    gobj.priv.$lock = null;
    gobj_write_attr(gobj, "$container", null);
}

/************************************************************
 *  Register this floating window in the shell's overlay history,
 *  so the browser Back closes it.
 *
 *  The shell takes the entry off its stack BEFORE it calls the
 *  close function (Back, or a route change draining overlays). When
 *  a subscriber of EV_WINDOW_TO_CLOSE vetoes the close, the window
 *  stays up with no entry: Back would no longer close it, and it
 *  would float over the next views. So a window that survives its
 *  own close function registers again.
 ************************************************************/
function register_back_overlay(gobj)
{
    let shell = yui_shell_of(gobj);
    if(!shell) {
        return;
    }
    /*  A window that survives its close gets its entry back -- but only
     *  once the question is over. A close that ASKS (unsaved changes)
     *  opened a dialog that registered its own entry; one put back now
     *  would sit ABOVE the question, and every Back would stack another
     *  dialog instead of closing the one on screen.  */
    const rearm = function() {
        if(!gobj_is_destroying(gobj) && !gobj_read_attr(gobj, "back_overlay")) {
            register_back_overlay(gobj);
        }
    };
    let overlay = yui_shell_register_overlay(
        shell,
        function() {
            gobj_write_attr(gobj, "back_overlay", null);
            gobj.priv.back_shell = null;
            const closing = close_window(gobj);
            if(closing.state === "vetoed") {
                rearm();
            } else if(closing.state === "asking") {
                closing.answer.then(rearm);
            }
        },
        {keep_on_navigate: gobj_read_bool_attr(gobj, "keep_on_navigate")}
    );
    gobj_write_attr(gobj, "back_overlay", overlay);
    gobj.priv.back_shell = overlay? shell : null;
}

/************************************************************
 *  Ask to close the window. Answers what happened:
 *      {state: "closed"}               the window is destroyed
 *      {state: "vetoed"}               a subscriber kept it open
 *      {state: "asking", answer}       a subscriber asked a question
 *                                      first; `answer` resolves to
 *                                      it once it is over
 ************************************************************/
function close_window(gobj)
{
    let kw_close = {
        abort_close: false
    };
    gobj_publish_event(gobj, "EV_WINDOW_TO_CLOSE", kw_close);

    /*  on_close only fires when the close actually proceeds:
     *  a subscriber may abort it and keep the window open. */
    let on_close = gobj_read_attr(gobj, "on_close");

    if(!kw_close.abort_close) {
        if(on_close) {
            on_close();
        }
        if(gobj_is_running(gobj)) {
            gobj_stop(gobj);
        }
        gobj_stop_children(gobj);
        gobj_destroy(gobj);
        return {state: "closed"};
    }
    if(!kw_close.warning) {
        return {state: "vetoed"};
    }
    const answer = yui_shell_confirm_yesnocancel(
        yui_shell_of(gobj), /* i18n: data */ kw_close.warning,
        {t: t, yes_label: "yes", no_label: "no", cancel_label: "cancel"}
    ).then(function(answer) {
        if(answer !== "yes") {
            return answer;
        }
        /*  The question was asynchronous: the window may have been
         *  torn down by another path while it was open.  */
        if(gobj_is_destroying(gobj)) {
            return answer;
        }
        if(on_close) {
            on_close();
        }
        if(gobj_is_running(gobj)) {
            gobj_stop(gobj);
        }
        gobj_stop_children(gobj);
        gobj_destroy(gobj);
        return answer;
    });
    return {state: "asking", answer: answer};
}

/************************************************************
 *  Where a window lives when its host names no `$parent`: the
 *  WINDOW layer of its shell (yui_shell_window_layer()), inside
 *  the overlay layer -- above the content, below the drawer, the
 *  toolbar's dropdowns, the dialogs and the toasts.
 *
 *  It used to be document.body, and that put every window above
 *  the WHOLE shell: `.yui-shell` is position:fixed, a stacking
 *  context of its own, so the z-index of its modal layer (99)
 *  counted only inside it, and a window at z-index 11 on the body
 *  covered it. The confirmation a window's own close asks ("all
 *  changes will be lost") opened UNDER the window that asked it,
 *  where no click could reach it; a toast, a dropdown of the
 *  toolbar, any dialog opened with a window on screen, the same.
 *
 *  Inside the layer the dock's z-index still orders the windows
 *  among themselves, and no number it gives them reaches the
 *  drawer (7.26.31 put them in the overlay layer itself, beside
 *  it). No shell (a page with windows and no shell, or the time
 *  between a logout and the next login): the body.
 *
 *  The place is the shell's, and a window parented to the app
 *  outlives it: ac_shell_changed() moves it when a shell goes or
 *  comes.
 *
 *  A MODAL window lives in the shell's dialog layer instead, with
 *  its backdrop: it blocks the drawer, the dock and every other
 *  window, and a question it asks (a dialog of the same layer)
 *  opens above it.
 ************************************************************/
function window_place(gobj)
{
    let shell = yui_shell_of(gobj);
    if(gobj_read_bool_attr(gobj, "modal")) {
        return yui_shell_modal_layer(shell) || document.body;
    }
    return yui_shell_window_layer(shell) || document.body;
}

/************************************************************
 *
 ************************************************************/
function toggle(gobj)
{
    if(gobj_read_bool_attr(gobj, "maximized") === true) {
        min(gobj);
    } else {
        max(gobj);
    }
}

/************************************************************
 *
 ************************************************************/
function max(gobj)
{
    let priv = gobj.priv;

    let $container = gobj_read_attr(gobj, "$container");
    priv.prevSize = $container.getBoundingClientRect();

    let rect = fill_work_area($container);

    gobj_write_bool_attr(gobj, "maximized", true);
    set_max_icon(gobj, true);

    return rect;
}

/************************************************************
 *   Swap the maximize/restore glyph to match the state.
 ************************************************************/
function set_max_icon(gobj, maximized)
{
    let $container = gobj_read_attr(gobj, "$container");
    if(!$container) {
        return;
    }
    let $btn = $container.querySelector('.wc-max');
    if($btn) {
        const key = maximized ? 'restore' : 'maximize';
        $btn.innerHTML = maximized ? WC_RESTORE : WC_MAX;
        $btn.setAttribute('title', t(key));
        $btn.setAttribute('data-i18n-title', key);
        $btn.setAttribute('aria-label', t(key));
        $btn.setAttribute('data-i18n-aria-label', key);
    }
}

/************************************************************
 *
 ************************************************************/
function min(gobj)
{
    let priv = gobj.priv;

    let rect = priv.prevSize;
    rect = do_fix_dimension_to_screen(gobj, rect.x, rect.y, rect.width, rect.height);
    if (gobj_read_bool_attr(gobj, "center")) {
        rect = do_center(gobj, rect.x, rect.y, rect.width, rect.height);
    }

    let $container = gobj_read_attr(gobj, "$container");
    $container.style.left = parseInt(rect.x) + 'px';
    $container.style.top = parseInt(rect.y) + 'px';
    $container.style.width = parseInt(rect.width) +'px';
    $container.style.height = parseInt(rect.height) +'px';

    gobj_write_bool_attr(gobj, "maximized", false);
    set_max_icon(gobj, false);

    return rect;
}

/************************************************************
 *  handlers moving
 ************************************************************/
function mvStart(gobj, evt)
{
    /*  No window-dragging on a mobile full-screen sheet. */
    if(is_mobile()) {
        return;
    }

    let $container = gobj_read_attr(gobj, "$container");

    let window_rect = $container.getBoundingClientRect();
    let x = evt.screenX;
    let y = evt.screenY;
    let pos_x = window_rect.x;
    let pos_y = window_rect.y;
    let div_x, div_y;

    document.addEventListener('pointermove', mvMove);
    document.addEventListener('pointerup', mvStop);

    evt.stopPropagation();
    evt.preventDefault();

    function mvMove(evt)
    {
        div_x = evt.screenX - x;
        div_y = evt.screenY - y;

        // default behavior
        $container.style.transition = 'none';
        $container.style.transform = 'translate3d('+ div_x +'px, '+ div_y +'px, 0px)';
    }

    function mvStop(evt)
    {
        document.removeEventListener('pointermove', mvMove);
        document.removeEventListener('pointerup', mvStop);

        /*  The window can be destroyed mid-drag (e.g. dock ✕). */
        if(gobj_is_destroying(gobj)) {
            return;
        }

        div_x      = (evt.screenX - x);
        div_y      = (evt.screenY - y);
        let xx = pos_x + div_x;
        let yy = pos_y + div_y;

        $container.style.left = xx + 'px';
        $container.style.top = yy + 'px';
        $container.style.transition = 'none';
        $container.style.transform = 'translate3d(0px, 0px, 0px)';

        // trigger event
        let rect = $container.getBoundingClientRect();

        gobj_write_integer_attr(gobj, "x", rect.x);
        gobj_write_integer_attr(gobj, "y", rect.y);
        gobj_write_integer_attr(gobj, "width", rect.width);
        gobj_write_integer_attr(gobj, "height", rect.height);

        if(gobj_read_bool_attr(gobj, "auto_save_size_and_position")) {
            if(gobj_is_service(gobj)) {
                kw_set_local_storage_value(`${gobj_name(gobj)}-rect`, {
                    x:rect.x, y:rect.y, width:rect.width, height: rect.height
                });
            }
        }
        gobj_publish_event(gobj, "EV_WINDOW_MOVED", {rect: rect});
    }
}

/************************************************************
 *  handlers resizing
 ************************************************************/
function rsStart(gobj, evt)
{
    let $container = gobj_read_attr(gobj, "$container");

    let window_rect = $container.getBoundingClientRect();

    let width = window_rect.width;
    let height = window_rect.height;
    let pageX = evt.pageX;
    let pageY = evt.pageY;
    let rel_w = 0;
    let rel_h = 0;

    document.addEventListener('pointermove', rsMove);
    document.addEventListener('pointerup', rsStop);

    evt.stopPropagation();
    evt.preventDefault();

    function rsMove(evt)
    {
        rel_w = evt.pageX - pageX;
        rel_h = evt.pageY - pageY;

        $container.style.width = (width + rel_w) +'px';
        $container.style.height = (height + rel_h) +'px';
    }

    function rsStop(evt)
    {
        document.removeEventListener('pointermove', rsMove);
        document.removeEventListener('pointerup', rsStop);

        /*  The window can be destroyed mid-resize (e.g. dock ✕). */
        if(gobj_is_destroying(gobj)) {
            return;
        }

        rel_w = evt.pageX - pageX;
        rel_h = evt.pageY - pageY;

        $container.style.width = (width + rel_w) +'px';
        $container.style.height = (height + rel_h) +'px';

        // trigger event
        let rect = $container.getBoundingClientRect();
        if(gobj_read_bool_attr(gobj, "force_center")) {
            rect = do_center(gobj,
                rect.x, rect.y, rect.width, rect.height
            );
            $container.style.left = rect.x + 'px';
            $container.style.top = rect.y + 'px';
            $container.style.width = rect.width +'px';
            $container.style.height = rect.height +'px';
        }

        gobj_write_integer_attr(gobj, "x", rect.x);
        gobj_write_integer_attr(gobj, "y", rect.y);
        gobj_write_integer_attr(gobj, "width", rect.width);
        gobj_write_integer_attr(gobj, "height", rect.height);

        if(gobj_read_bool_attr(gobj, "auto_save_size_and_position")) {
            if(gobj_is_service(gobj)) {
                kw_set_local_storage_value(`${gobj_name(gobj)}-rect`, {
                    x:rect.x, y:rect.y, width:rect.width, height: rect.height
                });
            }
        }
        gobj_publish_event(gobj, "EV_WINDOW_RESIZED", {rect: rect});
    }
}

/************************************************************
 *
 ************************************************************/
function do_fix_dimension_to_screen(gobj, x, y, width, height)
{
    let maxW, maxH;
    if (window.innerHeight === undefined) {
        maxW = document.documentElement.offsetWidth;
        maxH = document.documentElement.offsetHeight;
    } else {
        maxW = window.innerWidth;
        maxH = window.innerHeight;
    }

    if (maxW > width) {
        if (x + width > maxW) {
            x = maxW - width;
        }
    } else if (maxW <= width) {
        x = 0;
        width = maxW;
    }

    if (maxH > height) {
        if (y + height > maxH) {
            y = maxH - height;
        }
    } else if (maxH <= height) {
        y = 0;
        height = maxH;
    }

    return {x, y, width, height};
}

/************************************************************
 *
 ************************************************************/
function do_center(gobj, x, y, width, height)
{
    let maxW, maxH;
    if (window.innerHeight === undefined) {
        maxW = document.documentElement.offsetWidth;
        maxH = document.documentElement.offsetHeight;
    } else {
        maxW = window.innerWidth;
        maxH = window.innerHeight;
    }

    if (maxW > width) {
        x = (maxW - width)/2;
    } else if (maxW <= width) {
        x = 0;
    }

    if (maxH > height) {
        y = (maxH - height)/4;
    } else if (maxH <= height) {
        y = 0;
    }

    return {x, y, width, height};
}

/************************************************************
 *
 ************************************************************/
function handleResize(gobj)
{
    let $container = gobj_read_attr(gobj, "$container");

    // Browser window resize
    if(!$container) {
        return;
    }

    /*  Mobile: full-screen sheet, refit to the viewport and stop. */
    if(is_mobile()) {
        $container.classList.add("is-mobile-sheet");
        fill_work_area($container);
        return;
    }
    $container.classList.remove("is-mobile-sheet");

    /*  Maximized: just refit to the (new) viewport. */
    if(gobj_read_bool_attr(gobj, "maximized") === true) {
        fill_work_area($container);
        return;
    }

    /*  Smart restore: clamp the DESIRED size (the configured /
     *  last user-resized width & height attrs — rsStop keeps them
     *  in sync) to the viewport, NOT the already-rendered rect.
     *  Clamping the current rect made the window shrink on mobile
     *  and never grow back on desktop (every resize started from
     *  the already-shrunk size).  Position is kept and re-clamped. */
    let want_x = gobj_read_integer_attr(gobj, "x");
    let want_y = gobj_read_integer_attr(gobj, "y");
    let want_w = gobj_read_integer_attr(gobj, "width");
    let want_h = gobj_read_integer_attr(gobj, "height");
    let rect = do_fix_dimension_to_screen(gobj, want_x, want_y, want_w, want_h);
    if(gobj_read_bool_attr(gobj, "center")) {
        rect = do_center(gobj, rect.x, rect.y, rect.width, rect.height);
    }
    $container.style.left = rect.x + 'px';
    $container.style.top = rect.y + 'px';
    $container.style.width = rect.width + 'px';
    $container.style.height = gobj_read_bool_attr(gobj, "content_size") ? "auto" : parseInt(rect.height) + 'px';
}




                    /***************************
                     *      Actions
                     ***************************/




/************************************************************
 *
 ************************************************************/
function ac_refresh(gobj, event, kw, src)
{
    return 0;
}

/************************************************************
 *
 ************************************************************/
function ac_show(gobj, event, kw, src)
{
    /*  Bring the window back in front of the reader: out of the dock if
     *  it was minimized, above the others. The manager owns both when
     *  there is one; without one the window is made visible and given
     *  the next number of the windows' one z-order -- the same counter
     *  the dock raises its windows to. It used to be MOVED to the end of
     *  its parent, an order the dock's numbers always beat; and a move
     *  takes the focus, the scroll positions and the press that started
     *  on the window.  */
    let manager = gobj_read_pointer_attr(gobj, "manager");
    if(manager) {
        gobj_send_event(manager, "EV_FOCUS_WINDOW", {window: gobj_full_name(gobj)}, gobj);
        return 0;
    }
    let $container = gobj_read_attr(gobj, "$container");
    if(!$container) {
        log_error(`${gobj_short_name(gobj)}: EV_SHOW without a container`);
        return -1;
    }
    $container.style.removeProperty('display');
    yui_shell_raise_window($container);
    return 0;
}

/************************************************************
 *
 ************************************************************/
function ac_hide(gobj, event, kw, src)
{
    return 0;
}

/************************************************************
 *   EV_CLOSE_WINDOW — close from outside (e.g. the dock chip ✕),
 *   the same teardown as the title-bar close button.
 ************************************************************/
function ac_close(gobj, event, kw, src)
{
    close_window(gobj);
    return 0;
}

/************************************************************
 *   EV_SHELL_CHANGED -- a shell was built, or is being destroyed
 *   (`src`, then destroying): the place this window lives in may
 *   have gone with it, or be in the new one
 *   (yui_shell_watch_changes()).
 *
 *   - A window whose host named no `$parent` takes the window place
 *     again: the window layer of the shell that governs it NOW,
 *     document.body while there is none. So the developer window
 *     outlives a logout in the body, and the login's shell takes it
 *     in -- above its content, under its dialogs. From 7.26.31 to
 *     7.26.34 it stayed in the destroyed shell's layer: alive,
 *     detached, invisible.
 *   - A window its host placed stays where it was put, unless that
 *     element was inside the shell being destroyed: then no place
 *     is left, and it takes the window place from now on.
 *   - Its Back entry, when the shell being destroyed held it, went
 *     with that shell's history and is forgotten. The next shell
 *     does not get one: a history entry pushed while a shell is
 *     still being built would sit under its first route. Back no
 *     longer closes such a window; its ✕ does, as before 7.26.31.
 ************************************************************/
function ac_shell_changed(gobj, event, kw, src)
{
    let priv = gobj.priv;
    let going = gobj_is_destroying(src);

    if(going && priv.back_shell === src) {
        gobj_write_attr(gobj, "back_overlay", null);
        priv.back_shell = null;
    }

    let $container = gobj_read_attr(gobj, "$container");
    if(!$container) {
        log_error(`${gobj_short_name(gobj)}: EV_SHELL_CHANGED without a container`);
        return -1;
    }

    if(!priv.placed_by_shell) {
        let $shell = going? gobj_read_attr(src, "$container") : null;
        if(!$shell || !$shell.contains($container)) {
            return 0;   // the place its host chose is still there
        }
        priv.placed_by_shell = true;
    }

    let $place = window_place(gobj);
    let $root = window_root(gobj);
    if($root.parentNode !== $place) {
        $place.appendChild($root);
    }
    return 0;
}




                    /***************************
                     *          FSM
                     ***************************/




/*---------------------------------------------*
 *          Global methods table
 *---------------------------------------------*/
const gmt = {
    mt_create:  mt_create,
    mt_start:   mt_start,
    mt_destroy: mt_destroy
};

/***************************************************************
 *          Create the GClass
 ***************************************************************/
function create_gclass(gclass_name)
{
    if (__gclass__) {
        log_error(`GClass ALREADY created: ${gclass_name}`);
        return -1;
    }

    /*---------------------------------------------*
     *          States
     *---------------------------------------------*/
    const states = [
        ["ST_IDLE", [
            ["EV_REFRESH",      ac_refresh,     null],
            ["EV_SHOW",         ac_show,        null],
            ["EV_HIDE",         ac_hide,        null],
            ["EV_CLOSE_WINDOW", ac_close,       null],
            ["EV_SHELL_CHANGED",ac_shell_changed, null]
        ]]
    ];

    /*---------------------------------------------*
     *          Events
     *---------------------------------------------*/
    const event_types = [
        ["EV_WINDOW_TO_CLOSE",  event_flag_t.EVF_OUTPUT_EVENT|event_flag_t.EVF_NO_WARN_SUBS],
        ["EV_WINDOW_MOVED",     event_flag_t.EVF_OUTPUT_EVENT|event_flag_t.EVF_NO_WARN_SUBS],
        ["EV_WINDOW_RESIZED",   event_flag_t.EVF_OUTPUT_EVENT|event_flag_t.EVF_NO_WARN_SUBS],
        ["EV_REFRESH",          0],
        ["EV_SHOW",             0],
        ["EV_HIDE",             0],
        ["EV_CLOSE_WINDOW",     0],
        ["EV_SHELL_CHANGED",    0]
    ];

    __gclass__ = gclass_create(
        gclass_name,
        event_types,
        states,
        gmt,
        0,  // lmt,
        attrs_table,
        PRIVATE_DATA,
        0,  // authz_table,
        0,  // command_table,
        0,  // s_user_trace_level
        0   // gclass_flag
    );
    if(!__gclass__) {
        return -1;
    }

    return 0;
}

/***************************************************************
 *          Register GClass
 ***************************************************************/
function register_c_yui_window()
{
    return create_gclass(GCLASS_NAME);
}

export { register_c_yui_window };
