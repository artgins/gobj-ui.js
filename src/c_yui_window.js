/***********************************************************************
 *          c_yui_window.js
 *
 *          Window - position fixed
 *
 *          Copyright (c) 2025, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/

import {
    SDATA,
    SDATA_END,
    data_type_t,
    gclass_create,
    event_flag_t,
    log_error,
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
    gobj_unsubscribe_event,
    gobj_stop,
    gobj_stop_children,
    gobj_is_running,
    gobj_is_destroying,
    refresh_language,
    empty_string,
} from "@yuneta/gobj-js";

import {t} from "i18next";

import {yui_shell_confirm_yesnocancel} from "./shell_modals.js";
import {
    yui_shell_of,
    yui_shell_register_overlay,
    yui_shell_overlay_dismissed,
} from "./c_yui_shell.js";

import "./c_yui_window.css";

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

/***************************************************************
 *              Data
 ***************************************************************/
const attrs_table = [
SDATA(data_type_t.DTP_POINTER,  "subscriber",   0,  null,   "Subscriber of output events"),
SDATA(data_type_t.DTP_POINTER,  "$parent",      0,  null,   "$container will be appended to $parent if not null, else to document.body"),
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
SDATA(data_type_t.DTP_STRING,   "title",        0,  "",     "Window title, an i18n KEY: painted in the title bar (unless `header` overrides it) and on the dock chip. Pass the key, not t(key), or it cannot re-translate"),
SDATA(data_type_t.DTP_STRING,   "icon",         0,  "",     "Window icon (by window type), leading the title bar and the dock chip: a yi-* class name or inline SVG"),
// TODO pendiente focus modal keyboard
SDATA(data_type_t.DTP_POINTER,  "focus",        0,  null,   "Brings focus to the element, can be a number or selector"),
SDATA(data_type_t.DTP_BOOLEAN,  "modal",        0,  false,  "Enable modal mode"),
SDATA(data_type_t.DTP_BOOLEAN,  "keyboard",     0,  true,   "Close window on ESC if not modal"),
SDATA(data_type_t.DTP_BOOLEAN,  "back_dismissable", 0, true, "Browser Back closes this window (floating overlays only; ignored when it has a `manager`)"),
SDATA(data_type_t.DTP_POINTER,  "back_overlay", 0,  null,   "Internal: overlay-history entry (Back-button integration)"),
SDATA(data_type_t.DTP_POINTER,  "$container",   0,  null,   "Internal: Window container element"),
SDATA(data_type_t.DTP_STRING,   "window_id",    0,  "",     "Internal: Window ID"),
SDATA(data_type_t.DTP_POINTER,  "win_resize_handler", 0, null, "Internal: native window 'resize' listener"),
SDATA_END()
];

let PRIVATE_DATA = {
    prevSize: 0,
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

    /*  Optional window manager (dock/taskbar): register, and raise/
     *  highlight on any pointer press. Resolved BEFORE build_ui: minimize
     *  means "send to the dock", so without a manager there is nowhere to
     *  minimize TO and build_ui must not paint the button at all. */
    let manager = resolve_manager(gobj);

    build_ui(gobj);

    if(manager) {
        let $c = gobj_read_attr(gobj, "$container");
        if($c) {
            $c.addEventListener("pointerdown", function() {
                let m = gobj_read_pointer_attr(gobj, "manager");
                if(m) {
                    gobj_send_event(m, "EV_FOCUS_WINDOW", {window: gobj}, gobj);
                }
            }, true);
        }
        /*  The chip paints its label as plain text (no data-i18n), so it
         *  needs the title already translated. `title` travels as an i18n
         *  key; a composed one (`${topic} · ${t("keys")}`) is not a key and
         *  i18next answers it with itself, unchanged.  */
        let chip_title = gobj_read_str_attr(gobj, "title");
        gobj_send_event(manager, "EV_REGISTER_WINDOW", {
            window: gobj,
            title: chip_title ? t(chip_title) : gobj_short_name(gobj),
            icon: gobj_read_attr(gobj, "icon") || "",
        }, gobj);
    } else if(gobj_read_bool_attr(gobj, "back_dismissable")) {
        /*  Floating overlay window (no dock manager): the browser Back
         *  button closes it, like a modal/popup.  Dock-managed windows
         *  are persistent workspace surfaces and are left out.  Retired
         *  in mt_destroy (covers every teardown path). */
        let shell = yui_shell_of(gobj);
        if(shell) {
            let overlay = yui_shell_register_overlay(
                shell, function() { close_window(gobj); }
            );
            gobj_write_attr(gobj, "back_overlay", overlay);
        }
    }

    /*  Keep the window inside the viewport on a breakpoint change.
     *  Wired in mt_create (NOT mt_start) on purpose: windows are
     *  often created via gobj_create_service WITHOUT being started
     *  (e.g. setup_dev, the connection-info window), so mt_start
     *  never runs — the legacy __yui_main__/EV_RESIZE path is dead
     *  under C_YUI_SHELL too.  A native 'resize' listener is
     *  start-independent and reuses handleResize() (clamp-to-screen
     *  + optional re-center).  Detached in mt_destroy. */
    let on_win_resize = function() {
        handleResize(gobj);
    };
    gobj_write_attr(gobj, "win_resize_handler", on_win_resize);
    window.addEventListener("resize", on_win_resize);
}

/***************************************************************
 *          Framework Method: Start
 ***************************************************************/
function mt_start(gobj)
{
    let __yui_main__ = gobj_find_service("__yui_main__", false);
    if(__yui_main__) {
        gobj_subscribe_event(__yui_main__, "EV_RESIZE", {}, gobj);
    }
}

/***************************************************************
 *          Framework Method: Stop
 ***************************************************************/
function mt_stop(gobj)
{
    // TODO quita esto para chequear el fallo dl_subscribings not implemented
    let __yui_main__ = gobj_find_service("__yui_main__", false);
    if(__yui_main__) {
        gobj_unsubscribe_event(__yui_main__, "EV_RESIZE", {}, gobj);
    }
}

/***************************************************************
 *          Framework Method: Destroy
 ***************************************************************/
function mt_destroy(gobj)
{
    let manager = gobj_read_pointer_attr(gobj, "manager");
    if(manager) {
        gobj_send_event(manager, "EV_UNREGISTER_WINDOW", {window: gobj}, gobj);
    }

    /*  Retire the overlay-history entry, if this was a Back-dismissable
     *  floating window (no-op when Back itself triggered the teardown). */
    let back_overlay = gobj_read_attr(gobj, "back_overlay");
    if(back_overlay) {
        let shell = yui_shell_of(gobj);
        if(shell) {
            yui_shell_overlay_dismissed(shell, back_overlay);
        }
        gobj_write_attr(gobj, "back_overlay", null);
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
 *   The title bar's default content: `icon` + `title`, used when
 *   the caller supplies no `header`. Until this existed, `title`
 *   only reached the dock chip, so a window without a hand-rolled
 *   header painted an EMPTY bar — every caller that wanted a title
 *   built the same icon+text strip itself, and the ones that didn't
 *   (Keys, Raw JSON) ended up anonymous or titled inside their body.
 *
 *   `icon` follows the dock chip's convention: inline SVG when it
 *   starts with '<', otherwise a yi-* class name. The text carries
 *   its i18n key (like the modal's MODAL_TITLE, which renders the
 *   same string on mobile) so a host refresh_language() re-translates
 *   it; a composed title (`${topic} · ${t("keys")}`) is not a key and
 *   stays as built, same as the dock chip and the modal.
 ************************************************************/
function build_default_header(gobj)
{
    let title = gobj_read_str_attr(gobj, "title");
    if(empty_string(title)) {
        return null;
    }

    let icon = gobj_read_str_attr(gobj, "icon");
    let items = [];
    if(!empty_string(icon)) {
        if(icon.charAt(0) === '<') {
            items.push(['span', {class: 'icon'}, icon]);
        } else {
            items.push(['span', {class: 'icon'}, [['i', {class: icon}]]]);
        }
    }
    items.push(
        ['span', {class: 'has-text-weight-semibold', i18n: title}, title]
    );

    return createElement2(
        ['span', {class: 'WINDOW_TITLE yui-window-title icon-text ml-1'}, items]
    );
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
        m = gobj_find_service(m, false) || null;
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
    gobj_send_event(manager, "EV_MINIMIZE_WINDOW", {window: gobj}, gobj);
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
    if(!header) {
        header = build_default_header(gobj);
    }
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

    let $container = createElement2(
        ['div', {
            class: 'C_YUI_WINDOW' + (logical ? ' ' + logical : '') +
                   ' strong-shadow is-flex is-flex-direction-column' + (mobile ? ' is-mobile-sheet' : ''),
            style: window_style}, [

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
                        class: 'WINDOW_MIN yui-wc wc-min', type: 'button', 'aria-label': 'minimize',
                        style: (gobj_read_bool_attr(gobj, "showMin") &&
                                gobj_read_pointer_attr(gobj, "manager")) ? '' : 'display:none;',
                    }, WC_MIN, {
                        click: (evt) => {
                            evt.stopPropagation();
                            do_minimize(gobj);
                        }
                    }],
                    /*----------------------------*
                     *      Maximize / restore
                     *----------------------------*/
                    ['button', {
                        class: 'WINDOW_MAX yui-wc wc-max', type: 'button', 'aria-label': 'maximize',
                        style: gobj_read_bool_attr(gobj, "showMax") ? '' : 'display:none;',
                    }, WC_MAX, {
                        click: (evt) => {
                            evt.stopPropagation();
                            toggle(gobj);
                        }
                    }],
                    /*----------------------------*
                     *      Close
                     *----------------------------*/
                    ['button', {
                        class: 'WINDOW_CLOSE yui-wc wc-close', type: 'button', 'aria-label': 'close',
                    }, WC_CLOSE, {
                        click: (evt) => {
                            evt.stopPropagation();
                            close_window(gobj);
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
                            ['span', {style: 'display:inline-block;height:1.4em; width:1.4em;'}, '<svg viewBox="0 0 500 500"><path d="m427.87 493.69a33.778 33.78 0 0 1-23.882-57.661l33.778-33.78a33.799 33.8 0 0 1 47.83 47.763l-33.778 33.78a33.778 33.78 0 0 1-23.882 9.8976zm-190.44 0a33.778 33.78 0 0 1-23.882-57.661l224.22-224.23a33.799 33.8 0 0 1 47.83 47.763l-224.22 224.23a33.778 33.78 0 0 1-23.882 9.8976zm-197.26 0a33.778 33.78 0 0 1-23.882-57.661l421.46-421.47a33.786 33.786 0 1 1 47.797 47.763l-421.49 421.47a33.778 33.78 0 0 1-23.882 9.8976z" fill="var(--bulma-text)" stroke-width="33.78"/></svg>']

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
                '<svg viewBox="0 0 500 500"><path d="m427.87 493.69a33.778 33.78 0 0 1-23.882-57.661l33.778-33.78a33.799 33.8 0 0 1 47.83 47.763l-33.778 33.78a33.778 33.78 0 0 1-23.882 9.8976zm-190.44 0a33.778 33.78 0 0 1-23.882-57.661l224.22-224.23a33.799 33.8 0 0 1 47.83 47.763l-224.22 224.23a33.778 33.78 0 0 1-23.882 9.8976zm-197.26 0a33.778 33.78 0 0 1-23.882-57.661l421.46-421.47a33.786 33.786 0 1 1 47.797 47.763l-421.49 421.47a33.778 33.78 0 0 1-23.882 9.8976z" fill="var(--bulma-text)" stroke-width="33.78"/></svg>'
            ]

        ], {
            pointerdown: (evt) => {
                rsStart(gobj, evt);
            }
        }]);

        $container.appendChild($resizable_btn);
    }

    refresh_language($container, t);

    let $parent = gobj_read_attr(gobj, "$parent");
    if($parent) {
        $parent.appendChild($container);
    } else {
        document.body.appendChild($container);
    }

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
    let $container = gobj_read_attr(gobj, "$container");
    if($container) {
        if($container.parentNode) {
            $container.parentNode.removeChild($container);
        }
        gobj_write_attr(gobj, "$container", null);
    }
}

/************************************************************
 *
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
    } else if(kw_close.warning) {
        yui_shell_confirm_yesnocancel(
            yui_shell_of(gobj), kw_close.warning,
            {t: t, yes_label: "yes", no_label: "no", cancel_label: "cancel"}
        ).then(function(answer) {
            if(answer === "yes") {
                if(on_close) {
                    on_close();
                }
                gobj_stop(gobj);
                gobj_stop_children(gobj);
                gobj_destroy(gobj);
            }
        });
    }
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

    let rect = do_fix_dimension_to_screen(gobj, 0, 0, 10000, 10000);
    if (gobj_read_bool_attr(gobj, "center")) {
        rect = do_center(gobj, rect.x, rect.y, rect.width, rect.height);
    }

    $container.style.left = parseInt(rect.x) + 'px';
    $container.style.top = parseInt(rect.y) + 'px';
    $container.style.width = parseInt(rect.width) +'px';
    $container.style.height = parseInt(rect.height) +'px';

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
        $btn.innerHTML = maximized ? WC_RESTORE : WC_MAX;
        $btn.setAttribute('aria-label', maximized ? 'restore' : 'maximize');
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
        let vw = window.innerWidth || document.documentElement.offsetWidth;
        let vh = window.innerHeight || document.documentElement.offsetHeight;
        $container.style.left = '0px';
        $container.style.top = '0px';
        $container.style.width = vw + 'px';
        $container.style.height = vh + 'px';
        return;
    }
    $container.classList.remove("is-mobile-sheet");

    /*  Maximized: just refit to the (new) viewport. */
    if(gobj_read_bool_attr(gobj, "maximized") === true) {
        let r = do_fix_dimension_to_screen(gobj, 0, 0, 10000, 10000);
        if(gobj_read_bool_attr(gobj, "center")) {
            r = do_center(gobj, r.x, r.y, r.width, r.height);
        }
        $container.style.left = parseInt(r.x) + 'px';
        $container.style.top = parseInt(r.y) + 'px';
        $container.style.width = parseInt(r.width) + 'px';
        $container.style.height = parseInt(r.height) + 'px';
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
function ac_resize(gobj, event, kw, src)
{
    handleResize(gobj);
    return 0;
}

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




                    /***************************
                     *          FSM
                     ***************************/




/*---------------------------------------------*
 *          Global methods table
 *---------------------------------------------*/
const gmt = {
    mt_create:  mt_create,
    mt_start:   mt_start,
    mt_stop:    mt_stop,
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
            ["EV_RESIZE",       ac_resize,      null],
            ["EV_REFRESH",      ac_refresh,     null],
            ["EV_SHOW",         ac_show,        null],
            ["EV_HIDE",         ac_hide,        null],
            ["EV_CLOSE_WINDOW", ac_close,       null]
        ]]
    ];

    /*---------------------------------------------*
     *          Events
     *---------------------------------------------*/
    const event_types = [
        ["EV_WINDOW_TO_CLOSE",  event_flag_t.EVF_OUTPUT_EVENT|event_flag_t.EVF_NO_WARN_SUBS],
        ["EV_WINDOW_MOVED",     event_flag_t.EVF_OUTPUT_EVENT|event_flag_t.EVF_NO_WARN_SUBS],
        ["EV_WINDOW_RESIZED",   event_flag_t.EVF_OUTPUT_EVENT|event_flag_t.EVF_NO_WARN_SUBS],
        ["EV_RESIZE",           0],
        ["EV_REFRESH",          0],
        ["EV_SHOW",             0],
        ["EV_HIDE",             0],
        ["EV_CLOSE_WINDOW",     0]
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
