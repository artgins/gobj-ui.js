/***********************************************************************
 *          c_demo_history.js
 *
 *      C_DEMO_HISTORY — the browser-history case of a navigation PANEL
 *      over a view that writes its position in the URL, offline, for
 *      scripts/qa-history.mjs.
 *
 *      - "open panel" opens a C_YUI_WINDOW with NO window manager and
 *        `keep_on_navigate`: a floating overlay that the browser Back
 *        closes and that a route change does not close (the site map
 *        of an app without a dock).
 *      - "write position" moves the URL to /history/pos-N with
 *        yui_shell_navigate(..., {replace: true}): what a view does
 *        when it writes where the reader is (a tree, a page, a tab).
 *
 *      With the panel open, a replace moves the panel's history marker
 *      to the new hash; Back must still close the panel, and keep the
 *      position the view wrote.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {
    SDATA, SDATA_END, data_type_t,
    gclass_create, log_error,
    gobj_parent,
    gobj_read_attr, gobj_read_pointer_attr, gobj_write_attr,
    gobj_subscribe_event,
    gobj_create, gobj_start, gobj_send_event, gobj_post_event,
    gobj_find_child,
    createElement2,
    refresh_language,
    gobj_stop_children,
} from "@yuneta/gobj-js";

import {yui_shell_of, yui_shell_navigate} from "@yuneta/gobj-ui/src/c_yui_shell.js";
import {yui_shell_confirm_yesno} from "@yuneta/gobj-ui/src/shell_modals.js";

import {lead_block} from "./demo_lead.js";

import {t} from "i18next";


/***************************************************************
 *              Constants
 ***************************************************************/
const GCLASS_NAME = "C_DEMO_HISTORY";

const PANEL_NAME = "history_panel";


/***************************************************************
 *              Attrs
 ***************************************************************/
const attrs_table = [
SDATA(data_type_t.DTP_POINTER,  "subscriber",   0,  null,   "Subscriber of output events"),

SDATA(data_type_t.DTP_STRING,   "title",        0,  "History", "Card title"),
SDATA(data_type_t.DTP_STRING,   "lead",         0,  "",     "Explanatory paragraph"),
SDATA(data_type_t.DTP_POINTER,  "$container",   0,  null,   "Root HTMLElement (shell contract)"),
SDATA_END()
];

let PRIVATE_DATA = {
    position: 0,
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
    let subscriber = gobj_read_pointer_attr(gobj, "subscriber");
    if(!subscriber) {
        subscriber = gobj_parent(gobj);
    }
    gobj_subscribe_event(gobj, null, {}, subscriber);

    build_ui(gobj);
}

/***************************************************************
 *          Framework Method: Start
 ***************************************************************/
function mt_start(gobj)
{
}

/***************************************************************
 *          Framework Method: Stop
 ***************************************************************/
function mt_stop(gobj)
{
    gobj_stop_children(gobj);
}

/***************************************************************
 *          Framework Method: Destroy
 ***************************************************************/
function mt_destroy(gobj)
{
    let $c = gobj_read_attr(gobj, "$container");
    if($c && $c.parentNode) {
        $c.parentNode.removeChild($c);
    }
    gobj_write_attr(gobj, "$container", null);
}




                    /***************************
                     *      Local Methods
                     ***************************/




/***************************************************************
 *  A button that sends its event: the work is in the action.
 ***************************************************************/
function action_button(gobj, cls, key, icon, event)
{
    return ["button", {
        class: `${cls} button`,
        title: t(key),
        "data-i18n-title": key,
        "aria-label": t(key),
        "data-i18n-aria-label": key
    }, [
        ["i", {class: icon, "aria-hidden": "true"}],
        ["span", {i18n: key, style: "padding-left:5px;"}, key]
    ], {
        click: function(evt) {
            evt.stopPropagation();
            gobj_send_event(gobj, event, {}, gobj);
        }
    }];
}

/***************************************************************
 *  Build the card.
 ***************************************************************/
function build_ui(gobj)
{
    let title = gobj_read_attr(gobj, "title") || "History";
    let lead  = gobj_read_attr(gobj, "lead")  || "";

    let head = [
        ["h1", {class: "DEMO_TITLE title is-3 mb-2", i18n: title}, title]
    ];
    if(lead) {
        head.push(...lead_block(lead));
    }

    let $c = createElement2(
        ["div", {class: "C_DEMO_HISTORY DEMO_CARD view-card"}, [
            ["div", {class: "DEMO_HEAD"}, head],
            ["div", {class: "DEMO_HISTORY_ACTIONS buttons"}, [
                action_button(gobj, "DEMO_HISTORY_OPEN", "open panel",
                    "yi-window-maximize", "EV_OPEN_PANEL"),
                action_button(gobj, "DEMO_HISTORY_WRITE", "write position",
                    "yi-link", "EV_WRITE_POSITION"),
                action_button(gobj, "DEMO_HISTORY_RELOGIN", "log out and in",
                    "yi-arrows-rotate", "EV_RELOGIN"),
                action_button(gobj, "DEMO_HISTORY_RELOGIN_LATER", "log out, and in later",
                    "yi-right-from-bracket", "EV_RELOGIN_LATER")
            ]]
        ]]
    );

    gobj_write_attr(gobj, "$container", $c);
    refresh_language($c, t);
}




                    /***************************
                     *      Actions
                     ***************************/




/***************************************************************
 *  Open the panel: no manager (so it is an overlay on the shell's
 *  history), and keep_on_navigate (a route change does not close it).
 ***************************************************************/
function ac_open_panel(gobj, event, kw, src)
{
    if(gobj_find_child(gobj, {__gobj_name__: PANEL_NAME})) {
        return 0;       // already open: the button is idempotent
    }
    let win = gobj_create(
        PANEL_NAME,
        "C_YUI_WINDOW",
        {
            subscriber: null,
            title: "history panel",
            header: ['span', {class: 'DEMO_HISTORY_PANEL_TITLE px-2 has-text-weight-semibold',
                              i18n: "history panel"}, t("history panel")],
            body: ['div', {class: 'DEMO_HISTORY_PANEL p-3'}, [
                ['p', {i18n: "Back closes this panel; a route change does not."},
                    t("Back closes this panel; a route change does not.")],
                ['div', {class: 'DEMO_HISTORY_PANEL_ACTIONS buttons'}, [
                    action_button(gobj, "DEMO_HISTORY_CLOSE_AND_GO", "close and go to table",
                        "yi-table", "EV_CLOSE_AND_GO"),
                    action_button(gobj, "DEMO_HISTORY_CLOSE_AND_CLICK", "close and click the menu",
                        "yi-bars", "EV_CLOSE_AND_CLICK"),
                    action_button(gobj, "DEMO_HISTORY_CLOSE_AND_RELOGIN", "close, log out and in",
                        "yi-arrows-rotate", "EV_CLOSE_AND_RELOGIN")
                ]]
            ]],
            x: 760,
            y: 420,
            width: 320,
            height: 230,
            center: false,
            showFooter: false,
            modal: false,
            manager: null,
            back_dismissable: true,
            keep_on_navigate: true,
        },
        gobj
    );
    gobj_start(win);
    return 0;
}

/***************************************************************
 *  What a dialog's action does: close the panel, then go somewhere
 *  -- in the same turn, through the shell.
 ***************************************************************/
function ac_close_and_go(gobj, event, kw, src)
{
    let win = gobj_find_child(gobj, {__gobj_name__: PANEL_NAME});
    if(win) {
        gobj_send_event(win, "EV_CLOSE_WINDOW", {}, gobj);
    }
    yui_shell_navigate(yui_shell_of(gobj), "/table");
    return 0;
}

/***************************************************************
 *  The same, by the other road a navigation takes: a menu click
 *  (EV_NAV_CLICKED, what C_YUI_NAV publishes to the shell).
 ***************************************************************/
function ac_close_and_click(gobj, event, kw, src)
{
    let win = gobj_find_child(gobj, {__gobj_name__: PANEL_NAME});
    if(win) {
        gobj_send_event(win, "EV_CLOSE_WINDOW", {}, gobj);
    }
    gobj_send_event(yui_shell_of(gobj), "EV_NAV_CLICKED", {route: "/table"}, gobj);
    return 0;
}

/***************************************************************
 *  A question up, and then -- on the next turn -- a logout and a new
 *  login in one turn, the new shell opening the panel (C_DEMO's
 *  ac_relogin). The stopped shell must not move the history: up to
 *  gobj-ui 7.26.46 it retired the question's marker with a
 *  history.back() that took the new panel's marker, and the next
 *  Back left the app (Chromium).
 ***************************************************************/
function ac_relogin(gobj, event, kw, src)
{
    let shell = yui_shell_of(gobj);
    yui_shell_confirm_yesno(shell, "log out and in?");     // answered by the stop
    gobj_post_event(gobj_parent(shell), "EV_RELOGIN", {}, gobj);
    return 0;
}

/***************************************************************
 *  The same with a login page between: the new shell is built on a
 *  later turn (C_DEMO's ac_relogin, `later`). What the stopped shell
 *  left in the history waits for it.
 ***************************************************************/
function ac_relogin_later(gobj, event, kw, src)
{
    let shell = yui_shell_of(gobj);
    yui_shell_confirm_yesno(shell, "log out and in?");     // answered by the stop
    gobj_post_event(gobj_parent(shell), "EV_RELOGIN", {later: true}, gobj);
    return 0;
}

/***************************************************************
 *  The panel closed by a control of its own -- its shell retires the
 *  marker with a history.back() -- and, in the same turn as that
 *  close, a logout and a new login (C_DEMO's ac_relogin,
 *  `close_panel`): the back() is still in flight when the shell stops.
 ***************************************************************/
function ac_close_and_relogin(gobj, event, kw, src)
{
    gobj_post_event(gobj_parent(yui_shell_of(gobj)), "EV_RELOGIN", {close_panel: true}, gobj);
    return 0;
}

/***************************************************************
 *  Close the panel (C_DEMO's ac_relogin, before it stops the shell).
 ***************************************************************/
function ac_close_panel(gobj, event, kw, src)
{
    let win = gobj_find_child(gobj, {__gobj_name__: PANEL_NAME});
    if(win) {
        gobj_send_event(win, "EV_CLOSE_WINDOW", {}, gobj);
    }
    return 0;
}

/***************************************************************
 *  Write the position in the URL, replacing the entry.
 ***************************************************************/
function ac_write_position(gobj, event, kw, src)
{
    let priv = gobj.priv;
    priv.position++;
    yui_shell_navigate(yui_shell_of(gobj), `/history/pos-${priv.position}`, {replace: true});
    return 0;
}




                    /***************************
                     *      FSM
                     ***************************/




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
    if(__gclass__) {
        log_error(`GClass ALREADY created: ${gclass_name}`);
        return -1;
    }

    const states = [
        ["ST_IDLE", [
            ["EV_OPEN_PANEL",       ac_open_panel,      null],
            ["EV_WRITE_POSITION",   ac_write_position,  null],
            ["EV_CLOSE_AND_GO",     ac_close_and_go,    null],
            ["EV_CLOSE_AND_CLICK",  ac_close_and_click, null],
            ["EV_RELOGIN",          ac_relogin,         null],
            ["EV_RELOGIN_LATER",    ac_relogin_later,   null],
            ["EV_CLOSE_AND_RELOGIN", ac_close_and_relogin, null],
            ["EV_CLOSE_PANEL",      ac_close_panel,     null]
        ]]
    ];

    const event_types = [
        ["EV_OPEN_PANEL",       0],
        ["EV_WRITE_POSITION",   0],
        ["EV_CLOSE_AND_GO",     0],
        ["EV_CLOSE_AND_CLICK",  0],
        ["EV_RELOGIN",          0],
        ["EV_RELOGIN_LATER",    0],
        ["EV_CLOSE_AND_RELOGIN", 0],
        ["EV_CLOSE_PANEL",      0]
    ];

    __gclass__ = gclass_create(
        gclass_name,
        event_types,
        states,
        gmt,
        0,  // lmt
        attrs_table,
        PRIVATE_DATA,
        0,  // authz_table
        0,  // command_table
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
function register_c_demo_history()
{
    return create_gclass(GCLASS_NAME);
}

export {register_c_demo_history};
