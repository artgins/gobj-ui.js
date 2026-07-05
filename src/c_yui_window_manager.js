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
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {
    SDATA,
    SDATA_END,
    data_type_t,
    gclass_create,
    log_error,
    gobj_read_pointer_attr,
    gobj_subscribe_event,
    gobj_send_event,
    createElement2,
    gobj_write_attr,
    gobj_read_attr,
    gobj_name,
} from "@yuneta/gobj-js";


/***************************************************************
 *              Constants
 ***************************************************************/
const GCLASS_NAME = "C_YUI_WINDOW_MANAGER";

/*  Dock sits above every window: windows raise to an incrementing
 *  counter that starts well below this. */
const DOCK_Z = 1000000;

/*  Chip close glyph (currentColor → theme-aware). */
const WC_X = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 4.5 L11.5 11.5 M11.5 4.5 L4.5 11.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';


/***************************************************************
 *              Data
 ***************************************************************/
const attrs_table = [
SDATA(data_type_t.DTP_POINTER,  "subscriber",   0,  null,   "Subscriber of output events"),
SDATA(data_type_t.DTP_POINTER,  "$parent",      0,  null,   "Where the dock mounts (default document.body)"),
SDATA(data_type_t.DTP_POINTER,  "$container",   0,  null,   "Internal: the dock element"),
SDATA_END()
];

let PRIVATE_DATA = {
    windows: null,      /*  [{gobj, $chip, minimized}]  */
    z: 0,               /*  z-order counter handed to focused windows  */
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
    priv.z = 10;

    build_dock(gobj);

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
    position: fixed; left: 12px; bottom: 12px;
    z-index: ${DOCK_Z};
    display: flex; gap: 6px; align-items: center; padding: 5px 8px;
    max-width: calc(100vw - 24px); overflow-x: auto;
    background: var(--bulma-scheme-main-bis); color: var(--bulma-text);
    border: 1px solid var(--bulma-border); border-radius: 10px;
    box-shadow: 0 6px 22px rgba(0,0,0,0.25);
    font-family: var(--bulma-family-primary, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
}
.yui-dock.is-empty { display: none; }
.yui-dock-chip {
    display: inline-flex; align-items: center; gap: 7px; font: inherit; font-size: 12px;
    padding: 4px 5px 4px 11px; border: 1px solid var(--bulma-border); border-radius: 7px;
    background: var(--bulma-scheme-main); color: var(--bulma-text); cursor: pointer; white-space: nowrap;
}
.yui-dock-chip:hover { border-color: var(--bulma-text-weak); }
.yui-dock-chip.is-active { border-color: #2563eb; color: #2563eb; background: rgba(37,99,235,0.10); font-weight: 600; }
.yui-dock-chip.is-min { opacity: 0.65; }
.yui-dock-dot { width: 8px; height: 8px; border-radius: 50%; background: #22c55e; flex: 0 0 auto; }
.yui-dock-chip.is-min .yui-dock-dot { background: var(--bulma-text-weak); }
.yui-dock-icon { display: inline-flex; align-items: center; justify-content: center; width: 15px; height: 15px; font-size: 14px; flex: 0 0 auto; }
.yui-dock-icon svg { width: 14px; height: 14px; display: block; }
.yui-dock-icon i { line-height: 1; }
.yui-dock-label { flex: 0 0 auto; }
.yui-dock-close {
    width: 18px; height: 18px; display: inline-flex; align-items: center; justify-content: center;
    padding: 0; margin-left: 1px; border: 0; border-radius: 4px;
    background: transparent; color: var(--bulma-text-weak); cursor: pointer; flex: 0 0 auto;
}
.yui-dock-close:hover { background: #e0364a; color: #fff; }
.yui-dock-close svg { width: 11px; height: 11px; display: block; }
:root[data-theme="dark"] .yui-dock-chip.is-active { border-color: #60a5fa; color: #93c5fd; background: rgba(96,165,250,0.16); }
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

    let $dock = createElement2(['div', {class: 'yui-dock is-empty'}, []]);
    gobj_write_attr(gobj, "$container", $dock);

    let $parent = gobj_read_attr(gobj, "$parent") || document.body;
    $parent.appendChild($dock);
}

/************************************************************
 *   Re-attach the dock to the DOM if it got detached (e.g. a
 *   shell that replaced document.body's children after the dock
 *   was first mounted). Called whenever a window registers, so
 *   the dock is guaranteed live before the first chip.
 ************************************************************/
function ensure_dock_mounted(gobj)
{
    let $dock = gobj_read_attr(gobj, "$container");
    if($dock && !$dock.isConnected) {
        let $parent = gobj_read_attr(gobj, "$parent") || document.body;
        $parent.appendChild($dock);
    }
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
        return ['span', {class: 'yui-dock-icon'}, icon];
    }
    return ['span', {class: 'yui-dock-icon'}, [['i', {class: icon}]]];
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
    let priv = gobj.priv;
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
        priv.z += 1;
        $win.style.zIndex = priv.z;
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
 *   EV_REGISTER_WINDOW { window, title }
 ************************************************************/
function ac_register_window(gobj, event, kw, src)
{
    let priv = gobj.priv;

    let win = kw.window;
    if(!win || find_entry(priv, win)) {
        return 0;
    }

    ensure_dock_mounted(gobj);

    let title = kw.title || gobj_name(win) || "window";

    let entry = {gobj: win, $chip: null, minimized: false};
    /*  A div (not a button) so it can hold the close button — a
     *  button inside a button is invalid. The chip toggles; the ✕
     *  closes the window (EV_CLOSE_WINDOW → the window's own teardown
     *  → EV_UNREGISTER_WINDOW removes this chip). */
    let $chip = createElement2(
        ['div', {class: 'yui-dock-chip', role: 'button', tabindex: '0', title: title}, [
            chip_lead(kw.icon),
            ['span', {class: 'yui-dock-label'}, title],
            ['button', {class: 'yui-dock-close', type: 'button', 'aria-label': 'close'}, WC_X, {
                click: (evt) => {
                    evt.stopPropagation();
                    gobj_send_event(entry.gobj, "EV_CLOSE_WINDOW", {}, gobj);
                }
            }],
        ], {
            click: (evt) => {
                evt.stopPropagation();
                on_chip_click(gobj, entry);
            }
        }]
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

    let entry = find_entry(priv, kw.window);
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
    let entry = find_entry(gobj.priv, kw.window);
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
    let entry = find_entry(gobj.priv, kw.window);
    if(entry) {
        focus_entry(gobj, entry);
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
