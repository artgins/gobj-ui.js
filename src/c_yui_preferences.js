/***********************************************************************
 *          c_yui_preferences.js
 *          C_YUI_PREFERENCES GClass.
 *
 *          The Preferences page of an app, whole: a view the shell
 *          mounts at /preferences (a route target of the app config).
 *
 *              "/preferences": {"target": {"gclass": "C_YUI_PREFERENCES"}}
 *
 *          It draws the three rows every app shows -- theme, language,
 *          navigation (yui_preferences.js) -- and then the boxes the
 *          app adds in its yui_preferences_setup(). A press applies at
 *          once and is kept in this browser; the page is drawn again
 *          to mark the new choice, and when the language or the theme
 *          changes from elsewhere (the toolbar), because which option
 *          is marked is markup. The theme has no event of the shell:
 *          the page watches data-theme (yui_watch_theme). Up to 7.32.11
 *          a theme chosen on the toolbar left the Theme row marking the
 *          old one until the page was drawn again.
 *
 *          An app whose page has fields with actions of its own keeps
 *          its own view and draws the same rows with the parts of
 *          yui_preferences.js.
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
    gobj_parent,
    gobj_read_attr,
    gobj_write_attr,
    gobj_read_pointer_attr,
    gobj_subscribe_event,
    gobj_unsubscribe_event,
    createElement2,
    refresh_language,
} from "@yuneta/gobj-js";

import {t} from "i18next";

import {yui_shell_of} from "./c_yui_shell.js";
import {yui_watch_theme} from "./yui_theme.js";
import {
    yui_pref_header,
    yui_pref_box,
    yui_pref_appearance_fields,
    yui_pref_sections,
    yui_pref_apply,
} from "./yui_preferences.js";

/***************************************************************
 *              Constants
 ***************************************************************/
const GCLASS_NAME = "C_YUI_PREFERENCES";

/***************************************************************
 *              Data
 ***************************************************************/
const attrs_table = [
SDATA(data_type_t.DTP_POINTER,  "subscriber",   0,  null,   "Subscriber of output events"),
SDATA(data_type_t.DTP_POINTER,  "$container",   0,  null,   "Root HTMLElement (shell view contract)"),
SDATA_END()
];

/*
 *  A field named like an attribute is written by the framework on every
 *  write of that attribute.
 */
let PRIVATE_DATA = {
    shell: null,
    theme_watch: null,      /*  data-theme, as an EV_THEME  */
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
    let $container = createElement2(
        ["div", {class: "C_YUI_PREFERENCES PREF_PAGE p-4"}, []]
    );
    gobj_write_attr(gobj, "$container", $container);

    /*
     *  CHILD subscription model
     */
    let subscriber = gobj_read_pointer_attr(gobj, "subscriber");
    if(!subscriber) {
        subscriber = gobj_parent(gobj);
    }
    gobj_subscribe_event(gobj, null, {}, subscriber);
}

/***************************************************************
 *          Framework Method: Start
 ***************************************************************/
function mt_start(gobj)
{
    let priv = gobj.priv;

    /*  The language can change from the toolbar while the page is
     *  open: which option is marked is markup, drawn again.  */
    priv.shell = yui_shell_of(gobj);
    if(priv.shell) {
        gobj_subscribe_event(priv.shell, "EV_LANGUAGE_CHANGED", {}, gobj);
    }
    priv.theme_watch = yui_watch_theme(gobj);
    render(gobj);
}

/***************************************************************
 *          Framework Method: Stop
 ***************************************************************/
function mt_stop(gobj)
{
    let priv = gobj.priv;

    if(priv.shell) {
        gobj_unsubscribe_event(priv.shell, "EV_LANGUAGE_CHANGED", {}, gobj);
        priv.shell = null;
    }
    if(priv.theme_watch) {
        priv.theme_watch.disconnect();
        priv.theme_watch = null;
    }
}

/***************************************************************
 *          Framework Method: Destroy
 ***************************************************************/
function mt_destroy(gobj)
{
    let $container = gobj_read_attr(gobj, "$container");
    if($container && $container.parentNode) {
        $container.parentNode.removeChild($container);
    }
    gobj_write_attr(gobj, "$container", null);
}




                    /***************************
                     *      Local Methods
                     ***************************/




/***************************************************************
 *  Draw the page: the header, the box of the three rows, the
 *  boxes of the app.
 ***************************************************************/
function render(gobj)
{
    let $container = gobj_read_attr(gobj, "$container");
    if(!$container) {
        return;
    }
    $container.replaceChildren();
    $container.appendChild(createElement2(yui_pref_header()));
    $container.appendChild(createElement2(
        yui_pref_box(yui_pref_appearance_fields(gobj), "PREF_APPEARANCE")
    ));
    for(let box of yui_pref_sections(gobj)) {
        $container.appendChild((box && box.nodeType) ? box : createElement2(box));
    }
    refresh_language($container, t);
}




                    /***************************
                     *      Actions
                     ***************************/




/***************************************************************
 *  EV_SET_THEME / EV_SET_LANGUAGE / EV_SET_NAV_MODE {value}:
 *  a press on one of the three rows.
 ***************************************************************/
function ac_set_preference(gobj, event, kw, src)
{
    let ret = yui_pref_apply(gobj, event, kw);
    render(gobj);
    return ret;
}

/***************************************************************
 *  The language (EV_LANGUAGE_CHANGED) or the theme (EV_THEME)
 *  changed somewhere else: the toolbar.
 ***************************************************************/
function ac_changed_elsewhere(gobj, event, kw, src)
{
    render(gobj);
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
            ["EV_SET_THEME",            ac_set_preference,      null],
            ["EV_SET_LANGUAGE",         ac_set_preference,      null],
            ["EV_SET_NAV_MODE",         ac_set_preference,      null],
            ["EV_LANGUAGE_CHANGED",     ac_changed_elsewhere,   null],
            ["EV_THEME",                ac_changed_elsewhere,   null]
        ]]
    ];

    /*---------------------------------------------*
     *          Events
     *---------------------------------------------*/
    const event_types = [
        ["EV_SET_THEME",            0],
        ["EV_SET_LANGUAGE",         0],
        ["EV_SET_NAV_MODE",         0],
        ["EV_LANGUAGE_CHANGED",     0],
        ["EV_THEME",                0]
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
function register_c_yui_preferences()
{
    return create_gclass(GCLASS_NAME);
}

export { register_c_yui_preferences };
