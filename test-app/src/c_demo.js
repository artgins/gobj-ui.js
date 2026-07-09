/***********************************************************************
 *          c_demo.js
 *
 *      C_DEMO — the demo's root service (the default service of the
 *      yuno). Its whole job is to host the declarative shell and wire
 *      the two host-owned escape hatches the shell can't own itself:
 *          - the light/dark theme (Bulma data-theme on <html>), toggled
 *            from the toolbar via EV_TOGGLE_THEME;
 *          - the avatar badge text, supplied by a provider callback.
 *      Everything else — menus, submenus, routing, layouts — is
 *      declared in app_config.json and materialised by C_YUI_SHELL.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {
    SDATA, SDATA_END, data_type_t,
    gclass_create, log_error,
    gobj_read_attr, gobj_write_attr,
    gobj_create_pure_child,
    gobj_subscribe_event,
    gobj_start_tree,
    gobj_find_service,
    gobj_is_running,
    gobj_stop_tree,
    gobj_destroy,
    refresh_language,
} from "@yuneta/gobj-js";

import {
    yui_shell_set_avatar_provider,
    yui_shell_refresh_avatars,
    yui_shell_set_translator,
} from "@yuneta/gobj-ui/src/c_yui_shell.js";

import {setup_dev, dev_window_was_open} from "@yuneta/gobj-ui/src/yui_dev.js";

import {t} from "i18next";
import {toggle_locale} from "./locales.js";


/***************************************************************
 *              Constants
 ***************************************************************/
const GCLASS_NAME = "C_DEMO";


/***************************************************************
 *              Attrs
 ***************************************************************/
const attrs_table = [
SDATA(data_type_t.DTP_JSON,     "config",    0,  null,  "Shell config (app_config.json)"),
SDATA(data_type_t.DTP_BOOLEAN,  "use_hash",  0,  true,  "Pass-through to C_YUI_SHELL"),
SDATA_END()
];

let PRIVATE_DATA = {
    shell: null,
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

    let shell = gobj_create_pure_child(
        "shell",
        "C_YUI_SHELL",
        {
            config:   gobj_read_attr(gobj, "config"),
            use_hash: gobj_read_attr(gobj, "use_hash")
        },
        gobj
    );
    priv.shell = shell;

    /*  Opt in to the toolbar-published events we act on (not
     *  subscriber=ALL, so we never receive events we don't declare). */
    gobj_subscribe_event(shell, "EV_TOGGLE_THEME",    {}, gobj);
    gobj_subscribe_event(shell, "EV_TOGGLE_LANGUAGE", {}, gobj);
    gobj_subscribe_event(shell, "EV_OPEN_DEVTOOLS",   {}, gobj);

    /*  The shell never reads a user model; it asks this provider for
     *  the avatar text. A static badge is enough for the demo. */
    yui_shell_set_avatar_provider(shell, () => "UI");

    /*  Register the translator so the shell translates its static tree
     *  and any DOM it builds lazily (dropdown panel, synthesized navs). */
    yui_shell_set_translator(shell, t);
}

/***************************************************************
 *          Framework Method: Start
 ***************************************************************/
function mt_start(gobj)
{
    let priv = gobj.priv;

    apply_theme(current_theme());
    gobj_start_tree(priv.shell);
    yui_shell_refresh_avatars(priv.shell);

    /*  Translate the freshly-built shell tree + initial view to the
     *  current language (English on first load; keys map to themselves). */
    refresh_language(document.body, t);

    /*  Reopen the developer window if it was open last session (setup_dev
     *  persists the flag), so it survives a refresh — handy on mobile. */
    if(dev_window_was_open() && !gobj_find_service("Developer-Window", false)) {
        setup_dev(gobj, true);
    }
}

/***************************************************************
 *          Framework Method: Stop
 ***************************************************************/
function mt_stop(gobj)
{
}

/***************************************************************
 *          Framework Method: Destroy
 ***************************************************************/
function mt_destroy(gobj)
{
}




                    /***************************
                     *      Local Methods
                     ***************************/




/***************************************************************
 *  Light / dark theme via Bulma's data-theme on <html>.
 ***************************************************************/
function current_theme()
{
    return document.documentElement.getAttribute("data-theme") === "dark"
        ? "dark" : "light";
}

function apply_theme(theme)
{
    let t = (theme === "dark") ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", t);
    return t;
}




                    /***************************
                     *      Actions
                     ***************************/




/***************************************************************
 *  Toolbar theme button (action:event EV_TOGGLE_THEME).
 ***************************************************************/
function ac_toggle_theme(gobj, event, kw, src)
{
    apply_theme(current_theme() === "dark" ? "light" : "dark");
    return 0;
}

/***************************************************************
 *  Toolbar language button (action:event EV_TOGGLE_LANGUAGE).
 *  Flip es<->en and repaint every [data-i18n] node in the page
 *  (shell chrome + views) with the new language.
 ***************************************************************/
function ac_toggle_language(gobj, event, kw, src)
{
    toggle_locale();
    refresh_language(document.body, t);
    return 0;
}

/***************************************************************
 *  Account-menu "Developer window" entry (action:event
 *  EV_OPEN_DEVTOOLS). Toggles the dev window (a C_YUI_WINDOW built
 *  by setup_dev: inter-event traffic + trace toggles). If it is up,
 *  tear it down; otherwise open it.
 ***************************************************************/
function ac_open_devtools(gobj, event, kw, src)
{
    let win = gobj_find_service("Developer-Window", false);
    if(win) {
        if(gobj_is_running(win)) {
            gobj_stop_tree(win);
        }
        gobj_destroy(win);
        return 0;
    }
    setup_dev(gobj, true);
    return 0;
}




/***************************************************************
 *              FSM
 ***************************************************************/
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
    if(__gclass__) {
        log_error(`GClass ALREADY created: ${gclass_name}`);
        return -1;
    }

    /*---------------------------------------------*
     *          States
     *---------------------------------------------*/
    const states = [
        ["ST_IDLE", [
            ["EV_TOGGLE_THEME",     ac_toggle_theme,     null],
            ["EV_TOGGLE_LANGUAGE",  ac_toggle_language,  null],
            ["EV_OPEN_DEVTOOLS",    ac_open_devtools,    null]
        ]]
    ];

    /*---------------------------------------------*
     *          Events
     *---------------------------------------------*/
    const event_types = [
        ["EV_TOGGLE_THEME",     0],
        ["EV_TOGGLE_LANGUAGE",  0],
        ["EV_OPEN_DEVTOOLS",    0]
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
function register_c_demo()
{
    return create_gclass(GCLASS_NAME);
}

export {register_c_demo};
