/***********************************************************************
 *          c_yui_window_manager.js
 *
 *  Window manager / dock (taskbar).
 *
 *  A light registry + dock strip for C_YUI_WINDOW instances. Windows
 *  opt in via their `manager` attr: on create they REGISTER, on
 *  destroy they UNREGISTER, their minimize button MINIMIZEs (roll to
 *  the dock instead of shading in place), and any pointer press
 *  FOCUSes (raise z-order + highlight the dock chip).
 *
 *  The manager never owns window lifecycle: it only toggles a
 *  window's `$container` display / z-index and reflects state in the
 *  dock. Closing stays the window's own affordance (its ✕ →
 *  gobj_destroy → EV_UNREGISTER_WINDOW removes the chip).
 *
 *  Orthogonal to C_YUI_PAGER (page-stack): a window may host a pager
 *  in its body; the manager only arranges the windows themselves.
 *
 *  The dock placement is configurable via `dock_mode`:
 *    - "floating"   (default) a detached bar pinned to a corner
 *                   (`dock_corner`), hovering over the content.
 *    - "inline"     a full-width taskbar row mounted inside a layout
 *                   container (`inline_selector`, e.g. a shell zone).
 *    - "responsive" floating on wide viewports, inline on narrow ones
 *                   (`responsive_query`) — so on mobile it lives above
 *                   the bottom menu instead of covering it.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {
    SDATA,
    SDATA_END,
    data_type_t,
    gclass_create,
    log_error,
    is_gobj,
    gobj_full_name,
    gobj_short_name,
    gobj_read_pointer_attr,
    gobj_subscribe_event,
    gobj_send_event,
    createElement2,
    gobj_write_attr,
    gobj_read_attr,
    gobj_name,
    html_markup,
} from "@yuneta/gobj-js";

import {t} from "i18next";
import {text_node} from "./yui_text.js";
import {
    yui_shell_of,
    yui_shell_raise_window,
    yui_shell_watch_changes,
    yui_shell_unwatch_changes,
} from "./c_yui_shell.js";
import {yui_shell_popup_layer} from "./shell_modals.js";


/***************************************************************
 *              Constants
 ***************************************************************/
const GCLASS_NAME = "C_YUI_WINDOW_MANAGER";

/*  The floating dock sits at the top of the layer it lives in
 *  (dock_place()), the shell's popup layer: every window is in the
 *  window layer below it, whatever number it takes, and the shell's
 *  dialogs and toasts are layers above. */
const DOCK_Z = 1000000;

/*  Chip close glyph (currentColor → theme-aware). */
const WC_X = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 4.5 L11.5 11.5 M11.5 4.5 L4.5 11.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';

/*  Unique ids for the label spans a chip is named by (aria-labelledby).  */
let __chip_seq__ = 0;


/***************************************************************
 *              Data
 ***************************************************************/
const attrs_table = [
SDATA(data_type_t.DTP_POINTER,  "subscriber",       0,  null,           "Subscriber of output events"),
SDATA(data_type_t.DTP_STRING,   "dock_mode",        0,  "floating",     "floating | inline | responsive (floating on wide screens, inline on narrow)"),
SDATA(data_type_t.DTP_STRING,   "dock_corner",      0,  "bottom-left",  "Floating placement: top-left | top-right | bottom-left | bottom-right"),
SDATA(data_type_t.DTP_STRING,   "inline_selector",  0,  "",             "CSS selector of the container the dock mounts into when inline (e.g. a shell zone)"),
SDATA(data_type_t.DTP_STRING,   "responsive_query", 0,  "(max-width: 768px)", "Media query that selects inline placement when dock_mode is 'responsive'"),
SDATA(data_type_t.DTP_POINTER,  "$parent",          0,  null,           "Where the floating dock mounts (default: the popup layer of the shell, document.body while there is none)"),
SDATA(data_type_t.DTP_POINTER,  "$container",       0,  null,           "Internal: the dock element"),
SDATA_END()
];

let PRIVATE_DATA = {
    windows: null,      /*  [{gobj, $chip, minimized}]  */
    mql: null,          /*  MediaQueryList when dock_mode is 'responsive'  */
    mql_handler: null,  /*  its change listener (kept for teardown)  */
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
    let priv = gobj.priv;

    priv.windows = [];

    /*  In 'responsive' mode the placement follows a media query: watch it
     *  so the dock re-homes (floating <-> inline) when the viewport crosses
     *  the breakpoint. Set up BEFORE build_dock so the first placement is
     *  already correct. */
    if((gobj_read_attr(gobj, "dock_mode") || "floating") === "responsive") {
        let q = gobj_read_attr(gobj, "responsive_query") || "(max-width: 768px)";
        priv.mql = window.matchMedia(q);
        priv.mql_handler = () => {
            apply_placement(gobj);
        };
        priv.mql.addEventListener("change", priv.mql_handler);
    }

    build_dock(gobj);

    /*  The dock lives in a shell (its popup layer, or a zone when
     *  inline), and it outlives the shell: the app builds it once, a
     *  logout destroys the shell, the login builds another. Told when
     *  a shell is built or destroyed, it places itself again
     *  (ac_shell_changed). Unwatched in mt_destroy.  */
    yui_shell_watch_changes(gobj);

    /*
     *  SERVICE subscription model
     */
    const subscriber = gobj_read_pointer_attr(gobj, "subscriber");
    if(subscriber) {
        gobj_subscribe_event(gobj, null, {}, subscriber);
    }
}

/***************************************************************
 *          Framework Method: Destroy
 ***************************************************************/
function mt_destroy(gobj)
{
    let priv = gobj.priv;

    yui_shell_unwatch_changes(gobj);

    if(priv.mql && priv.mql_handler) {
        priv.mql.removeEventListener("change", priv.mql_handler);
        priv.mql = null;
        priv.mql_handler = null;
    }

    destroy_dock(gobj);
}




                    /***************************
                     *      Local Methods
                     ***************************/




/************************************************************
 *   Inject the dock stylesheet once (theme-aware).
 ************************************************************/
function ensure_dock_style()
{
    if(document.getElementById('yui-dock-style')) {
        return;
    }
    let css = `
.yui-dock {
    z-index: ${DOCK_Z};
    display: flex; gap: 6px; align-items: center; padding: 5px 8px;
    overflow-x: auto;
    background: var(--bulma-scheme-main-bis); color: var(--bulma-text);
    border: 1px solid var(--bulma-border);
    font-family: var(--bulma-family-primary, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
}
.yui-dock.is-empty { display: none; }

/*  Floating: a detached bar hovering over the content, pinned to a corner.  */
.yui-dock--floating {
    position: fixed;
    max-width: calc(100vw - 24px);
    border-radius: 10px;
    box-shadow: 0 6px 22px rgba(0,0,0,0.25);
}
.yui-dock--bottom-left  { bottom: 12px; left: 12px; }
.yui-dock--bottom-right { bottom: 12px; right: 12px; }
.yui-dock--top-left     { top: 12px;    left: 12px; }
.yui-dock--top-right    { top: 12px;    right: 12px; }

/*  Inline: flows inside a layout zone as a full-width taskbar row (the zone
 *  already provides the separating border, so the bar itself stays flat).  */
.yui-dock--inline {
    position: relative;
    width: 100%; max-width: 100%;
    border: 0;
    border-radius: 0;
    box-shadow: none;
}
.yui-dock-chip {
    display: inline-flex; align-items: center; gap: 7px; font: inherit; font-size: 12px;
    padding: 0 5px 0 0; border: 1px solid var(--bulma-border); border-radius: 7px;
    background: var(--bulma-scheme-main); color: var(--bulma-text); white-space: nowrap;
}
.yui-dock-chip:hover { border-color: var(--bulma-text-weak); }
/*  The chip is the look; its toggle a button that adds none, and
 *  takes the pill's padding, so the whole label is what a press lands
 *  on and the chip reads as one pill with its ✕ at the end.  */
.yui-dock-chip-toggle {
    display: inline-flex; align-items: center; gap: 7px;
    padding: 4px 0 4px 11px; margin: 0; border: 0; border-radius: 7px 0 0 7px;
    background: transparent; font: inherit; color: inherit; cursor: pointer; white-space: nowrap;
}
/*  The BORDER says active, not the text: blue ink on a blue tint is
 *  the same hue on itself -- 4.49:1 on the light chip, under the 4.5
 *  its 12px label needs. The label takes the text colour (11:1).  */
.yui-dock-chip.is-active { border-color: #2563eb; color: var(--bulma-text, #2e333d); background: rgba(37,99,235,0.10); font-weight: 600; }
/*  A minimised window is quieter, not unreadable. 0.65 was 4.3:1 for a
 *  12px label; 0.7 (7.23.95) was measured against the PAGE and is 4.10
 *  against what the label actually sits on, which is the chip's own
 *  white. 0.8 is 5.34 / 5.81, and an active chip at 9.45 is still
 *  plainly the loud one.  */
.yui-dock-chip.is-min { opacity: 0.8; }
.yui-dock-dot { width: 8px; height: 8px; border-radius: 50%; background: #22c55e; flex: 0 0 auto; }
.yui-dock-chip.is-min .yui-dock-dot { background: var(--bulma-text-weak); }
.yui-dock-icon { display: inline-flex; align-items: center; justify-content: center; width: 15px; height: 15px; font-size: 14px; flex: 0 0 auto; }
.yui-dock-icon svg { width: 14px; height: 14px; display: block; }
.yui-dock-icon i { line-height: 1; }
.yui-dock-label { flex: 0 0 auto; }
/*  Split label halves (prefix = DATA, kind = translatable). The
 *  separator is CSS, never a text node — same rule as the window
 *  title bar (createElement2 trims text nodes). */
.yui-dock-label .yui-dock-label-prefix + .yui-dock-label-kind::before { content: " \\00b7 "; }
.yui-dock-close {
    width: 18px; height: 18px; display: inline-flex; align-items: center; justify-content: center;
    padding: 0; margin-left: 1px; border: 0; border-radius: 4px;
    background: transparent; color: var(--bulma-text-weak); cursor: pointer; flex: 0 0 auto;
}
.yui-dock-close:hover { background: #e0364a; color: #fff; }
.yui-dock-close svg { width: 11px; height: 11px; display: block; }
:root[data-theme="dark"] .yui-dock-chip.is-active { border-color: #60a5fa; color: var(--bulma-text, #ebecf0); background: rgba(96,165,250,0.16); }
`;
    let $style = document.createElement('style');
    $style.id = 'yui-dock-style';
    $style.textContent = css;
    document.head.appendChild($style);
}

/************************************************************
 *   Build the dock element (empty, hidden until a window
 *   registers).
 ************************************************************/
function build_dock(gobj)
{
    ensure_dock_style();

    let $dock = createElement2(['div', {class: 'C_YUI_WINDOW_MANAGER yui-dock is-empty'}, []]);
    gobj_write_attr(gobj, "$container", $dock);

    apply_placement(gobj);
}

/************************************************************
 *   Whether the dock should render inline (in a layout zone)
 *   rather than floating, given the mode and — for
 *   'responsive' — the current viewport.
 ************************************************************/
function want_inline_placement(gobj)
{
    let mode = gobj_read_attr(gobj, "dock_mode") || "floating";
    if(mode === "inline") {
        return true;
    }
    if(mode === "responsive") {
        let priv = gobj.priv;
        return !!(priv.mql && priv.mql.matches);
    }
    return false;
}

/************************************************************
 *   Place (or re-place) the dock: pick floating vs inline,
 *   set the modifier classes, and mount it in the right
 *   container. Also re-attaches the dock if it got detached
 *   (e.g. a shell that replaced its parent's children after
 *   the dock was first mounted, or the responsive breakpoint
 *   flipped). Idempotent — safe to call on every register and
 *   on every media-query change.
 ************************************************************/
function apply_placement(gobj)
{
    let $dock = gobj_read_attr(gobj, "$container");
    if(!$dock) {
        return;
    }

    /*  Inline needs a host in the DOM. The shell is often built lazily, so
     *  its zone may not exist yet — fall back to floating until it does, so
     *  the dock never vanishes. */
    let $inline = null;
    if(want_inline_placement(gobj)) {
        let sel = gobj_read_attr(gobj, "inline_selector");
        if(sel) {
            $inline = document.querySelector(sel);
        }
    }
    let inline = !!$inline;

    $dock.classList.toggle("yui-dock--inline", inline);
    $dock.classList.toggle("yui-dock--floating", !inline);

    let corner = gobj_read_attr(gobj, "dock_corner") || "bottom-left";
    for(let c of ["top-left", "top-right", "bottom-left", "bottom-right"]) {
        $dock.classList.toggle(`yui-dock--${c}`, !inline && c === corner);
    }

    let target = inline ? $inline : (gobj_read_attr(gobj, "$parent") || dock_place(gobj));
    if($dock.parentNode !== target) {
        target.appendChild($dock);
    }
}

/************************************************************
 *   Where the FLOATING dock lives when the app names no
 *   `$parent`: the popup layer of the shell, at the top of it.
 *
 *   It was document.body at z-index 1000000, and that put it
 *   above the WHOLE shell -- `.yui-shell` is a stacking context
 *   of its own, so its dialogs (modal layer, 99) and toasts (120)
 *   counted only inside it: the dock stayed clickable over a
 *   dialog's backdrop (a window could be closed from its chip
 *   while its own "all changes will be lost" question was open),
 *   and it covered a toast where they met.
 *
 *   The popup layer, not the window layer: the dock has to stay
 *   above EVERY window, and windows live in two layers -- the
 *   window layer (no `$parent`) and the popup layer, where the
 *   site map and the JSON windows of the treedb views put theirs.
 *   Above both; below the dialogs, the toasts and the loading
 *   cover. No shell (before the first, between a logout and the
 *   next login): the body.
 ************************************************************/
function dock_place(gobj)
{
    return yui_shell_popup_layer(yui_shell_of(gobj)) || document.body;
}

/************************************************************
 *   Destroy the dock element.
 ************************************************************/
function destroy_dock(gobj)
{
    let $dock = gobj_read_attr(gobj, "$container");
    if($dock) {
        if($dock.parentNode) {
            $dock.parentNode.removeChild($dock);
        }
        gobj_write_attr(gobj, "$container", null);
    }
}

/************************************************************
 *   The chip's leading mark: a per-type icon if the window
 *   provides one (a `yi-*` class name, or inline SVG/HTML), else
 *   the status dot. Returns a createElement2() spec.
 ************************************************************/
function chip_lead(icon)
{
    if(!icon) {
        return ['span', {class: 'yui-dock-dot'}, ''];
    }
    if(icon.charAt(0) === '<') {
        /*  The window's `icon` attr, the app's own: inline svg is markup.  */
        return ['span', {class: 'yui-dock-icon'}, html_markup(icon)];
    }
    return ['span', {class: 'yui-dock-icon'}, [['i', {class: icon}]]];
}

/************************************************************
 *  The window an event is about. A kw is plain json (the machine
 *  trace dumps it), so the window travels in it as its FULL NAME,
 *  which the trace can print, and the gobj is the event's src --
 *  every sender is the window itself. Up to 7.26.9 the kw carried
 *  the gobj; since 7.26.14 that is refused.
 ************************************************************/
function window_of(gobj, event, kw, src)
{
    let w = kw && kw.window;
    if(is_gobj(w)) {
        /*  The gobj in the kw was accepted up to 7.26.13 (with a warning
         *  since 7.26.10). A kw is plain json: refused.  */
        log_error(
            `${gobj_short_name(gobj)}: ${event} carries the window gobj in ` +
            `its kw: send {window: gobj_full_name(window)} from the window`
        );
        return null;
    }
    if(!is_gobj(src) || gobj_full_name(src) !== w) {
        log_error(
            `${gobj_short_name(gobj)}: ${event}: window '${w}' is not the ` +
            `src of the event (${is_gobj(src) ? gobj_full_name(src) : String(src)})`
        );
        return null;
    }
    return src;
}

/************************************************************
 *   Find a registry entry by its window gobj.
 ************************************************************/
function find_entry(priv, win)
{
    for(let e of priv.windows) {
        if(e.gobj === win) {
            return e;
        }
    }
    return null;
}

/************************************************************
 *   Show / hide the empty state.
 ************************************************************/
function sync_dock_visibility(gobj)
{
    let priv = gobj.priv;
    let $dock = gobj_read_attr(gobj, "$container");
    if($dock) {
        $dock.classList.toggle('is-empty', priv.windows.length === 0);
    }
}

/************************************************************
 *   Mark one entry active (raised), the rest inactive.
 ************************************************************/
function set_active(gobj, entry)
{
    let priv = gobj.priv;
    for(let e of priv.windows) {
        if(e.$chip) {
            e.$chip.classList.toggle('is-active', e === entry);
        }
    }
}

/************************************************************
 *   Bring a window to front and mark it active/visible.
 ************************************************************/
function focus_entry(gobj, entry)
{
    let $win = gobj_read_attr(entry.gobj, "$container");
    if($win) {
        if(entry.minimized) {
            /*  Clear the inline display so the window falls back to its
             *  Bulma `is-flex` layout (see minimize_entry). */
            $win.style.removeProperty('display');
            entry.minimized = false;
            if(entry.$chip) {
                entry.$chip.classList.remove('is-min');
            }
        }
        /*  The windows' ONE z-order, shared with the windows that have
         *  no dock (yui_shell_raise_window). A counter of its own put a
         *  window opened later without a dock UNDER every docked one.  */
        yui_shell_raise_window($win);
    }
    set_active(gobj, entry);
}

/************************************************************
 *   Send a window to the dock (hidden, chip dimmed).
 ************************************************************/
function minimize_entry(gobj, entry)
{
    let $win = gobj_read_attr(entry.gobj, "$container");
    if($win) {
        /*  The window container carries Bulma's `is-flex`
         *  (display:flex !important), so a plain inline display:none
         *  is overridden — hide with `!important` to win. */
        $win.style.setProperty('display', 'none', 'important');
    }
    entry.minimized = true;
    if(entry.$chip) {
        entry.$chip.classList.add('is-min');
        entry.$chip.classList.remove('is-active');
    }
}

/************************************************************
 *   Dock chip click: taskbar toggle — restore+focus a
 *   minimized/inactive window, minimize the active one.
 ************************************************************/
function on_chip_click(gobj, entry)
{
    if(entry.minimized || !entry.$chip.classList.contains('is-active')) {
        focus_entry(gobj, entry);
    } else {
        minimize_entry(gobj, entry);
    }
}




                    /***************************
                     *      Actions
                     ***************************/




/************************************************************
 *   EV_REGISTER_WINDOW { window, title, title_key,
 *                        title_kind_text, title_prefix, icon }
 *
 *   `title` is the composed, already-translated fallback (also the
 *   tooltip).  The label itself renders the SPLIT halves so it can
 *   change language: `title_prefix` (DATA, plain text) + the KIND
 *   half carrying `title_key` as data-i18n, born as
 *   `title_kind_text` (the manager has no translator of its own —
 *   the app's refresh_language() re-translates the key later).
 ************************************************************/
function ac_register_window(gobj, event, kw, src)
{
    let priv = gobj.priv;

    let win = window_of(gobj, event, kw, src);
    if(!win) {
        return -1;      // Error already logged
    }
    if(find_entry(priv, win)) {
        return 0;
    }

    apply_placement(gobj);

    let title = kw.title || gobj_name(win) || "window";
    let title_key = kw.title_key || "";
    let kind_text = kw.title_kind_text || "";
    let prefix = kw.title_prefix || "";
    let label_items = [];
    if(prefix) {
        label_items.push(['span', {class: 'yui-dock-label-prefix'},
            text_node(prefix)]);    // data, not markup
    }
    /*  An FSM action: what it is given is the kw of EV_REGISTER_WINDOW,
     *  which no reader can follow. `title_key` is the window's `title`,
     *  a key its HOST chose when it created the window.  */
    if(title_key) {
        label_items.push(
            ['span', {class: 'yui-dock-label-kind', i18n: /* i18n: data */ title_key},
             kind_text || title_key]
        );
    }
    if(label_items.length === 0) {
        /*  No split halves supplied (legacy caller): plain text. */
        label_items.push(['span', {class: 'yui-dock-label-kind'},
            text_node(title)]);     // data, not markup
    }

    /*  The toggle's NAME is its label, read from the label's own spans
     *  (aria-labelledby): the data half as it is, the kind half from the
     *  node that carries its key -- so the name changes language with the
     *  label, which a composed aria-label could not.  */
    let chip_seq = ++__chip_seq__;
    let label_ids = label_items.map(function(item, i) {
        item[1].id = `yui-dock-chip-${chip_seq}-${i}`;
        return item[1].id;
    });

    let entry = {gobj: win, $chip: null, minimized: false};
    /*  The chip is a CONTAINER of two sibling controls, and no control
     *  itself: the TOGGLE (minimise / bring back, the whole label) and
     *  the ✕ (EV_CLOSE_WINDOW → the window's own teardown →
     *  EV_UNREGISTER_WINDOW removes this chip). Up to 7.26.34 the chip
     *  was a role=button div HOLDING the ✕ button -- one control inside
     *  another, whose name read the label and then "close", and whose
     *  ✕ a reader could not reach as a control of its own.
     *
     *  Both are real <button>s: a key presses them, with no handler of
     *  ours. Each says what it does with a title and an aria-label: the
     *  toggle the window's composed title (with its key as
     *  data-i18n-title / -aria-label when there is no DATA half; a
     *  reader takes the aria-labelledby, which changes language with the
     *  label), the ✕ "close". The toggle's click crosses the FSM
     *  (EV_TOGGLE_WINDOW), by the window's name: a kw is plain json.  */
    let window_name = gobj_full_name(win);
    let $chip = createElement2(
        ['div', {class: 'DOCK_CHIP yui-dock-chip'}, [
            ['button', Object.assign(
                {class: 'DOCK_CHIP_TOGGLE yui-dock-chip-toggle', type: 'button',
                 title: title, 'aria-label': title, 'aria-labelledby': label_ids.join(" ")},
                (!prefix && title_key) ? {
                    'data-i18n-title': /* i18n: data */ title_key,
                    'data-i18n-aria-label': /* i18n: data */ title_key
                } : {}
            ), [
                chip_lead(kw.icon),
                ['span', {class: 'yui-dock-label'}, label_items]
            ], {
                click: (evt) => {
                    evt.stopPropagation();
                    gobj_send_event(gobj, "EV_TOGGLE_WINDOW", {window: window_name}, gobj);
                }
            }],
            ['button', {class: 'DOCK_CHIP_CLOSE yui-dock-close', type: 'button',
                        title: t('close'), 'data-i18n-title': 'close',
                        'aria-label': t('close'), 'data-i18n-aria-label': 'close'}, html_markup(WC_X), {
                click: (evt) => {
                    evt.stopPropagation();
                    gobj_send_event(entry.gobj, "EV_CLOSE_WINDOW", {}, gobj);
                }
            }],
        ]]
    );
    entry.$chip = $chip;
    priv.windows.push(entry);

    let $dock = gobj_read_attr(gobj, "$container");
    if($dock) {
        $dock.appendChild($chip);
    }
    sync_dock_visibility(gobj);
    focus_entry(gobj, entry);
    return 0;
}

/************************************************************
 *   EV_UNREGISTER_WINDOW { window }
 ************************************************************/
function ac_unregister_window(gobj, event, kw, src)
{
    let priv = gobj.priv;

    let win = window_of(gobj, event, kw, src);
    if(!win) {
        return -1;      // Error already logged
    }
    let entry = find_entry(priv, win);
    if(!entry) {
        return 0;
    }
    if(entry.$chip && entry.$chip.parentNode) {
        entry.$chip.parentNode.removeChild(entry.$chip);
    }
    priv.windows = priv.windows.filter((e) => e !== entry);
    sync_dock_visibility(gobj);
    return 0;
}

/************************************************************
 *   EV_MINIMIZE_WINDOW { window }
 ************************************************************/
function ac_minimize_window(gobj, event, kw, src)
{
    let win = window_of(gobj, event, kw, src);
    if(!win) {
        return -1;      // Error already logged
    }
    let entry = find_entry(gobj.priv, win);
    if(entry) {
        minimize_entry(gobj, entry);
    }
    return 0;
}

/************************************************************
 *   EV_FOCUS_WINDOW { window }
 ************************************************************/
function ac_focus_window(gobj, event, kw, src)
{
    let win = window_of(gobj, event, kw, src);
    if(!win) {
        return -1;      // Error already logged
    }
    let entry = find_entry(gobj.priv, win);
    if(entry) {
        focus_entry(gobj, entry);
    }
    return 0;
}

/************************************************************
 *   EV_TOGGLE_WINDOW { window } -- the toggle of a chip of THIS
 *   dock was pressed: bring a minimized or covered window to the
 *   front, send the one in front to the dock. Only the dock's own
 *   chip sends it (src is the dock): the events a window sends
 *   about itself come from the window, and this one from the chip
 *   that names it.
 ************************************************************/
function ac_toggle_window(gobj, event, kw, src)
{
    let priv = gobj.priv;

    if(src !== gobj) {
        log_error(
            `${gobj_short_name(gobj)}: ${event} comes from the dock's own chip, ` +
            `not from ${is_gobj(src) ? gobj_full_name(src) : String(src)}`
        );
        return -1;
    }
    let name = kw && kw.window;
    let entry = priv.windows.find((e) => gobj_full_name(e.gobj) === name);
    if(!entry) {
        log_error(`${gobj_short_name(gobj)}: ${event}: no window '${name}' in the dock`);
        return -1;
    }
    on_chip_click(gobj, entry);
    return 0;
}

/************************************************************
 *   EV_SHELL_CHANGED -- a shell was built, or is being destroyed
 *   (yui_shell_watch_changes()). The dock's place -- the shell's
 *   popup layer, or its zone when inline -- may have gone with
 *   it, or be in the new one: place it again. Up to 7.26.34 an
 *   inline dock stayed in the destroyed shell's zone after a
 *   logout, detached, until a window registered.
 ************************************************************/
function ac_shell_changed(gobj, event, kw, src)
{
    apply_placement(gobj);
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
    mt_destroy: mt_destroy,
};

/***************************************************************
 *          Create the GClass
 ***************************************************************/
function create_gclass(gclass_name)
{
    if(__gclass__) {
        log_error(`GClass ALREADY created: ${gclass_name}`);
        return -1;
    }

    /*---------------------------------------------*
     *          States
     *---------------------------------------------*/
    const states = [
        ["ST_IDLE", [
            ["EV_REGISTER_WINDOW",      ac_register_window,     null],
            ["EV_UNREGISTER_WINDOW",    ac_unregister_window,   null],
            ["EV_MINIMIZE_WINDOW",      ac_minimize_window,     null],
            ["EV_FOCUS_WINDOW",         ac_focus_window,        null],
            ["EV_TOGGLE_WINDOW",        ac_toggle_window,       null],
            ["EV_SHELL_CHANGED",        ac_shell_changed,       null],
        ]]
    ];

    /*---------------------------------------------*
     *          Events
     *---------------------------------------------*/
    const event_types = [
        ["EV_REGISTER_WINDOW",      0],
        ["EV_UNREGISTER_WINDOW",    0],
        ["EV_MINIMIZE_WINDOW",      0],
        ["EV_FOCUS_WINDOW",         0],
        ["EV_TOGGLE_WINDOW",        0],
        ["EV_SHELL_CHANGED",        0],
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
function register_c_yui_window_manager()
{
    return create_gclass(GCLASS_NAME);
}

export { register_c_yui_window_manager };
