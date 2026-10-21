/***********************************************************************
 *          c_yui_update_watch.js
 *
 *          Is this page still running the build that is deployed?
 *
 *          Every route of these apps is a hash: moving around reloads
 *          nothing, and neither does a login or a logout. A page opened
 *          before a deploy runs the old bundle until somebody reloads it
 *          by hand, and the only symptom is that a fix "did not work" --
 *          or worse: the deploy deleted the old lazy chunks, and the old
 *          page breaks the first time it opens a view it had not loaded.
 *
 *          This service compares the build of the page (yui_build_stamp.js,
 *          the stamp the build writes into index.html) with the one the
 *          server hands out now, fetching that same document with
 *          `cache: "no-store"`. A difference is SAID, never acted on: a
 *          bar with the new version, a reload button and a ✕. Reloading
 *          is the reader's call -- they may be in the middle of something.
 *
 *          When it asks (every one an event, through the FSM):
 *            - at start;
 *            - the tab comes back to the front, or the window gets the
 *              focus (at most once each `min_interval_ms`);
 *            - the browser is online again;
 *            - a lazy chunk failed to load (`vite:preloadError`): the
 *              symptom of exactly this, so it asks at once;
 *            - every `period_ms`: a screen that is always in view (a
 *              control room, a wall display) never gets the focus back.
 *              A periodic query is a discarded pattern in Yuneta; THIS
 *              one is a deliberate exception approved by the user
 *              (2026-10-21), for every SPA. 0 turns it off;
 *            - whenever the app sends EV_CHECK_BUILD -- on its backend's
 *              EV_ON_OPEN, typically: a backend deploy often comes with
 *              a deploy of the SPA.
 *
 *          A build that comes back to the running one (a rollback) takes
 *          the bar away again. A page with no stamp (`vite dev`) watches
 *          nothing.
 *
 *          The bar lives in the shell's notification layer, above its
 *          dialogs; with no shell (the login, between a logout and the
 *          next login) in document.body. It follows the shell across a
 *          logout (yui_shell_watch_changes()), as the dock does.
 *
 *          Usage (an app, once, after creating the yuno):
 *
 *              register_c_yui_update_watch();
 *              const watch = gobj_create_service(
 *                  "__update_watch__", "C_YUI_UPDATE_WATCH", {}, yuno
 *              );
 *              gobj_start(watch);
 *
 *              // on its backend's EV_ON_OPEN:
 *              gobj_send_event(watch, "EV_CHECK_BUILD", {}, gobj);
 *
 *          Input events:
 *              EV_CHECK_BUILD      {force?}    ask the server (force skips
 *                                              the minimum interval)
 *              EV_RELOAD           {}          the bar's reload button
 *              EV_DISMISS          {}          the bar's ✕: hidden for THIS
 *                                              build, a later one shows it
 *
 *          Output events (optional subscribers):
 *              EV_NEW_BUILD        {running, deployed, version}
 *              EV_BUILD_CURRENT    {running}   the deployed build is the
 *                                              running one again
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {
    SDATA,
    SDATA_END,
    data_type_t,
    event_flag_t,
    gclass_create,
    log_error,
    log_warning,
    log_info,
    createElement2,
    refresh_language,
    set_timeout_periodic,
    clear_timeout,
    gobj_create_pure_child,
    gobj_name,
    gobj_short_name,
    gobj_start,
    gobj_stop,
    gobj_is_running,
    gobj_is_destroying,
    gobj_read_pointer_attr,
    gobj_read_integer_attr,
    gobj_read_bool_attr,
    gobj_subscribe_event,
    gobj_unsubscribe_event,
    gobj_send_event,
    gobj_publish_event,
    gobj_change_state,
    gobj_current_state,
} from "@yuneta/gobj-js";

import {t} from "i18next";
import {text_node} from "./yui_text.js";
import {yui_tint} from "./bulma_tint.js";
import {
    yui_shell_of,
    yui_shell_watch_changes,
    yui_shell_unwatch_changes,
} from "./c_yui_shell.js";
import {yui_shell_notification_layer} from "./shell_modals.js";
import {running_build, parse_build, build_page_url} from "./yui_build_stamp.js";
import "./c_yui_update_watch.css";

/***************************************************************
 *              Constants
 ***************************************************************/
const GCLASS_NAME = "C_YUI_UPDATE_WATCH";

/***************************************************************
 *              Data
 ***************************************************************/
const attrs_table = [
SDATA(data_type_t.DTP_POINTER,  "subscriber",       0,  null,       "Subscriber of output events"),
SDATA(data_type_t.DTP_INTEGER,  "min_interval_ms",  0,  "60000",    "Minimum time between two checks, except a forced one"),
SDATA(data_type_t.DTP_INTEGER,  "period_ms",        0,  "3600000",  "Periodic check, for a screen that never gets the focus back; 0 = off (user-approved exception to No polling)"),
SDATA(data_type_t.DTP_BOOLEAN,  "with_bar",         0,  "1",        "Show the bar; false leaves EV_NEW_BUILD to the app"),
SDATA(data_type_t.DTP_POINTER,  "before_reload",    0,  null,       "fn() -> bool|Promise<bool>, asked before the reload; false vetoes it (unsaved edits)"),
SDATA(data_type_t.DTP_POINTER,  "$parent",          0,  null,       "Where the bar mounts (default: the shell's notification layer, document.body while there is none)"),
SDATA_END()
];

let PRIVATE_DATA = {
    running:        null,   /*  {stamp, version} of this page, null = watch nothing  */
    deployed:       null,   /*  {stamp, version} last read from the server  */
    dismissed:      "",     /*  stamp whose bar the reader closed  */
    in_flight:      false,  /*  a fetch is out  */
    last_check:     0,      /*  performance.now() of the last fetch  */
    failing:        false,  /*  the last check failed (log on the transition only)  */
    gobj_timer:     null,
    $bar:           null,
    lang_shell:     null,   /*  the shell whose EV_LANGUAGE_CHANGED we hear  */
    dom_handlers:   null,   /*  [[target, type, fn]] added in mt_start  */
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

    priv.running = running_build(typeof document !== "undefined" ? document : null);
    priv.dom_handlers = [];

    /*
     *  Create children
     */
    priv.gobj_timer = gobj_create_pure_child(gobj_name(gobj), "C_TIMER", {}, gobj);

    /*  The bar lives in a shell and outlives it: a logout destroys the
     *  shell, the login builds another (ac_shell_changed).  */
    yui_shell_watch_changes(gobj);
    follow_language(gobj);

    /*
     *  SERVICE subscription model
     */
    const subscriber = gobj_read_pointer_attr(gobj, "subscriber");
    if(subscriber) {
        gobj_subscribe_event(gobj, null, {}, subscriber);
    }
}

/***************************************************************
 *          Framework Method: Start
 ***************************************************************/
function mt_start(gobj)
{
    let priv = gobj.priv;

    gobj_start(priv.gobj_timer);

    if(!priv.running) {
        log_info(`${gobj_short_name(gobj)}: this page carries no build stamp (vite dev?): nothing to watch`);
        return 0;
    }

    /*  The OS notifications, translated into events and nothing else.  */
    listen_dom(gobj, document, "visibilitychange", () => {
        if(document.visibilityState === "visible") {
            gobj_send_event(gobj, "EV_CHECK_BUILD", {}, gobj);
        }
    });
    listen_dom(gobj, window, "focus", () => {
        gobj_send_event(gobj, "EV_CHECK_BUILD", {}, gobj);
    });
    listen_dom(gobj, window, "online", () => {
        gobj_send_event(gobj, "EV_CHECK_BUILD", {force: true}, gobj);
    });
    listen_dom(gobj, window, "vite:preloadError", () => {
        gobj_send_event(gobj, "EV_CHECK_BUILD", {force: true}, gobj);
    });

    let period = gobj_read_integer_attr(gobj, "period_ms");
    if(period > 0) {
        set_timeout_periodic(priv.gobj_timer, period);
    }

    gobj_send_event(gobj, "EV_CHECK_BUILD", {force: true}, gobj);
    return 0;
}

/***************************************************************
 *          Framework Method: Stop
 ***************************************************************/
function mt_stop(gobj)
{
    let priv = gobj.priv;

    for(let [target, type, fn] of priv.dom_handlers) {
        target.removeEventListener(type, fn);
    }
    priv.dom_handlers = [];

    clear_timeout(priv.gobj_timer);
    if(gobj_is_running(priv.gobj_timer)) {
        gobj_stop(priv.gobj_timer);
    }
}

/***************************************************************
 *          Framework Method: Destroy
 ***************************************************************/
function mt_destroy(gobj)
{
    let priv = gobj.priv;

    yui_shell_unwatch_changes(gobj);
    if(priv.lang_shell) {
        if(!gobj_is_destroying(priv.lang_shell)) {
            gobj_unsubscribe_event(priv.lang_shell, "EV_LANGUAGE_CHANGED", {}, gobj);
        }
        priv.lang_shell = null;
    }
    remove_bar(gobj);
}




                    /***************************
                     *      Local Methods
                     ***************************/




/************************************************************
 *  Add a DOM listener, kept to be removed in mt_stop.
 ************************************************************/
function listen_dom(gobj, target, type, fn)
{
    target.addEventListener(type, fn);
    gobj.priv.dom_handlers.push([target, type, fn]);
}

/************************************************************
 *  Hear the language of the shell that holds the bar -- the
 *  bar outlives a shell, so it follows them.
 ************************************************************/
function follow_language(gobj)
{
    let priv = gobj.priv;

    let shell = yui_shell_of(gobj);
    if(shell && gobj_is_destroying(shell)) {
        shell = null;
    }
    if(shell === priv.lang_shell) {
        return;
    }
    if(priv.lang_shell && !gobj_is_destroying(priv.lang_shell)) {
        gobj_unsubscribe_event(priv.lang_shell, "EV_LANGUAGE_CHANGED", {}, gobj);
    }
    priv.lang_shell = null;
    if(shell) {
        gobj_subscribe_event(shell, "EV_LANGUAGE_CHANGED", {}, gobj);
        priv.lang_shell = shell;
    }
}

/************************************************************
 *  Where the bar goes: the host's `$parent`, else the toasts'
 *  layer of the live shell, else the body.
 ************************************************************/
function bar_place(gobj)
{
    let $parent = gobj_read_pointer_attr(gobj, "$parent");
    if($parent) {
        return $parent;
    }
    let shell = yui_shell_of(gobj);
    if(shell && gobj_is_destroying(shell)) {
        shell = null;
    }
    return yui_shell_notification_layer(shell) || document.body;
}

/************************************************************
 *  Show the bar for the deployed build, or move it to its
 *  place. Not shown for a build the reader dismissed.
 ************************************************************/
function show_bar(gobj)
{
    let priv = gobj.priv;

    if(!gobj_read_bool_attr(gobj, "with_bar")) {
        return;
    }
    if(!priv.deployed || priv.deployed.stamp === priv.dismissed) {
        remove_bar(gobj);
        return;
    }

    remove_bar(gobj);
    priv.$bar = createElement2(
        ["div", {class: `C_YUI_UPDATE_WATCH UPDATE_BAR notification ${yui_tint("info")}`, role: "status"}, [
            ["span", {class: "UPDATE_TEXT", i18n: "new version available"},
                t("new version available")],
            ["span", {class: "UPDATE_VERSION"}, text_node(priv.deployed.version)],
            ["button", {class: "UPDATE_RELOAD button is-info", type: "button",
                        i18n: "reload",
                        title: t("reload"), "data-i18n-title": "reload",
                        "aria-label": t("reload"), "data-i18n-aria-label": "reload"},
                t("reload"),
                {click: () => gobj_send_event(gobj, "EV_RELOAD", {}, gobj)}],
            ["button", {class: "UPDATE_DISMISS delete", type: "button",
                        title: t("close"), "data-i18n-title": "close",
                        "aria-label": t("close"), "data-i18n-aria-label": "close"},
                null,
                {click: () => gobj_send_event(gobj, "EV_DISMISS", {}, gobj)}]
        ]]
    );
    bar_place(gobj).appendChild(priv.$bar);
}

/************************************************************
 *  Take the bar off the page.
 ************************************************************/
function remove_bar(gobj)
{
    let priv = gobj.priv;

    if(priv.$bar && priv.$bar.parentNode) {
        priv.$bar.parentNode.removeChild(priv.$bar);
    }
    priv.$bar = null;
}

/************************************************************
 *  Ask the server which build it hands out. The answer comes
 *  back as an event (a resolved promise is an OS notification).
 ************************************************************/
function fetch_deployed_build(gobj)
{
    let priv = gobj.priv;

    priv.in_flight = true;
    priv.last_check = performance.now();

    /*  no-store, or the check would be answered from the very cache
     *  it has to see past.  */
    fetch(build_page_url(window.location), {cache: "no-store", credentials: "same-origin"})
        .then((response) => {
            if(!response.ok) {
                throw {status: response.status};
            }
            return response.text();
        })
        .then((html) => {
            if(gobj_is_destroying(gobj)) {
                return;
            }
            let deployed = parse_build(html);
            if(!deployed) {
                gobj_send_event(gobj, "EV_CHECK_FAILED", {
                    reason: "the page served carries no build stamp", network: false
                }, gobj);
                return;
            }
            gobj_send_event(gobj, "EV_DEPLOYED_BUILD", deployed, gobj);
        })
        .catch((err) => {
            if(gobj_is_destroying(gobj)) {
                return;
            }
            let http = err && err.status;
            gobj_send_event(gobj, "EV_CHECK_FAILED", {
                reason: http ? `HTTP ${err.status}` : String((err && err.message) || err),
                network: !http
            }, gobj);
        });
}




                    /***************************
                     *      Actions
                     ***************************/




/************************************************************
 *  Ask the server, unless a question is out or the last one
 *  is too recent (a focus and a visibilitychange come
 *  together), or the browser says it is offline -- false is
 *  the one answer of navigator.onLine that can be trusted.
 ************************************************************/
function ac_check_build(gobj, event, kw, src)
{
    let priv = gobj.priv;

    if(!priv.running) {
        return 0;   // a page with no stamp watches nothing (logged in mt_start)
    }
    if(priv.in_flight) {
        return 0;
    }
    if(!kw.force) {
        let min_interval = gobj_read_integer_attr(gobj, "min_interval_ms");
        if(priv.last_check && performance.now() - priv.last_check < min_interval) {
            return 0;
        }
    }
    if(navigator.onLine === false) {
        return 0;
    }
    fetch_deployed_build(gobj);
    return 0;
}

/************************************************************
 *  EV_TIMEOUT_PERIODIC -- the screen that never gets the
 *  focus back asks too.
 ************************************************************/
function ac_periodic(gobj, event, kw, src)
{
    gobj_send_event(gobj, "EV_CHECK_BUILD", {}, gobj);
    return 0;
}

/************************************************************
 *  The server answered with a build.
 ************************************************************/
function ac_deployed_build(gobj, event, kw, src)
{
    let priv = gobj.priv;

    priv.in_flight = false;
    if(priv.failing) {
        log_info(`${gobj_short_name(gobj)}: the deployed build can be read again`);
        priv.failing = false;
    }

    let deployed = {stamp: kw.stamp, version: kw.version || ""};

    if(deployed.stamp === priv.running.stamp) {
        if(gobj_current_state(gobj) === "ST_STALE") {
            priv.deployed = null;
            remove_bar(gobj);
            gobj_change_state(gobj, "ST_CURRENT");
            gobj_publish_event(gobj, "EV_BUILD_CURRENT", {running: priv.running.stamp});
        }
        return 0;
    }

    if(priv.deployed && priv.deployed.stamp === deployed.stamp) {
        return 0;   // the same newer build, already said
    }

    priv.deployed = deployed;
    log_info(
        `${gobj_short_name(gobj)}: a new build is deployed: ` +
        `${deployed.version} ${deployed.stamp} (this page runs ` +
        `${priv.running.version} ${priv.running.stamp})`
    );
    gobj_change_state(gobj, "ST_STALE");
    show_bar(gobj);
    gobj_publish_event(gobj, "EV_NEW_BUILD", {
        running:  priv.running.stamp,
        deployed: deployed.stamp,
        version:  deployed.version
    });
    return 0;
}

/************************************************************
 *  The server did not say. Offline is a normal state, so a
 *  network failure is info; an answer that is not the app
 *  (an HTTP error, a page with no stamp) is a warning. Both
 *  are said on the transition only, not on every attempt.
 ************************************************************/
function ac_check_failed(gobj, event, kw, src)
{
    let priv = gobj.priv;

    priv.in_flight = false;
    if(priv.failing) {
        return 0;
    }
    priv.failing = true;
    let msg = `${gobj_short_name(gobj)}: cannot read the deployed build: ${kw.reason}`;
    if(kw.network) {
        log_info(msg);
    } else {
        log_warning(msg);
    }
    return 0;
}

/************************************************************
 *  The bar's reload button. The host may veto it (unsaved
 *  edits): its answer comes back as an event.
 ************************************************************/
function ac_reload(gobj, event, kw, src)
{
    let before_reload = gobj_read_pointer_attr(gobj, "before_reload");
    if(typeof before_reload !== "function") {
        gobj_send_event(gobj, "EV_RELOAD_ALLOWED", {}, gobj);
        return 0;
    }
    Promise.resolve()
        .then(() => before_reload())
        .then(
            (allowed) => {
                if(gobj_is_destroying(gobj)) {
                    return;
                }
                if(allowed === false) {
                    log_info(`${gobj_short_name(gobj)}: the host vetoed the reload`);
                    return;
                }
                gobj_send_event(gobj, "EV_RELOAD_ALLOWED", {}, gobj);
            },
            (err) => {
                log_error(`${gobj_short_name(gobj)}: before_reload() failed: ${(err && err.message) || err}`);
            }
        );
    return 0;
}

/************************************************************
 *  Load the deployed build. The hash stays: the reader comes
 *  back to the same route.
 ************************************************************/
function ac_reload_allowed(gobj, event, kw, src)
{
    window.location.reload();
    return 0;
}

/************************************************************
 *  The bar's ✕: hidden for this build; a later deploy shows
 *  it again.
 ************************************************************/
function ac_dismiss(gobj, event, kw, src)
{
    let priv = gobj.priv;

    priv.dismissed = priv.deployed ? priv.deployed.stamp : "";
    remove_bar(gobj);
    return 0;
}

/************************************************************
 *  EV_SHELL_CHANGED -- a shell was built, or is being
 *  destroyed: the bar's place may have gone with it, or be in
 *  the new one. Its language is the new shell's too.
 ************************************************************/
function ac_shell_changed(gobj, event, kw, src)
{
    let priv = gobj.priv;

    follow_language(gobj);
    if(priv.$bar) {
        show_bar(gobj);
    }
    return 0;
}

/************************************************************
 *  EV_LANGUAGE_CHANGED -- from the shell that holds the bar.
 *  Every text of the bar carries its key; it may live outside
 *  the shell's container, where the app's refresh does not
 *  reach.
 ************************************************************/
function ac_language_changed(gobj, event, kw, src)
{
    let priv = gobj.priv;

    if(priv.$bar) {
        refresh_language(priv.$bar, t);
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
        ["ST_CURRENT", [
            ["EV_CHECK_BUILD",          ac_check_build,         null],
            ["EV_TIMEOUT_PERIODIC",     ac_periodic,            null],
            ["EV_DEPLOYED_BUILD",       ac_deployed_build,      null],
            ["EV_CHECK_FAILED",         ac_check_failed,        null],
            ["EV_SHELL_CHANGED",        ac_shell_changed,       null],
            ["EV_LANGUAGE_CHANGED",     ac_language_changed,    null]
        ]],
        ["ST_STALE", [
            ["EV_CHECK_BUILD",          ac_check_build,         null],
            ["EV_TIMEOUT_PERIODIC",     ac_periodic,            null],
            ["EV_DEPLOYED_BUILD",       ac_deployed_build,      null],
            ["EV_CHECK_FAILED",         ac_check_failed,        null],
            ["EV_RELOAD",               ac_reload,              null],
            ["EV_RELOAD_ALLOWED",       ac_reload_allowed,      null],
            ["EV_DISMISS",              ac_dismiss,             null],
            ["EV_SHELL_CHANGED",        ac_shell_changed,       null],
            ["EV_LANGUAGE_CHANGED",     ac_language_changed,    null]
        ]]
    ];

    /*---------------------------------------------*
     *          Events
     *---------------------------------------------*/
    const event_types = [
        ["EV_CHECK_BUILD",          0],
        ["EV_TIMEOUT_PERIODIC",     0],
        ["EV_DEPLOYED_BUILD",       0],
        ["EV_CHECK_FAILED",         0],
        ["EV_RELOAD",               0],
        ["EV_RELOAD_ALLOWED",       0],
        ["EV_DISMISS",              0],
        ["EV_SHELL_CHANGED",        0],
        ["EV_LANGUAGE_CHANGED",     0],
        ["EV_NEW_BUILD",            event_flag_t.EVF_OUTPUT_EVENT|event_flag_t.EVF_NO_WARN_SUBS],
        ["EV_BUILD_CURRENT",        event_flag_t.EVF_OUTPUT_EVENT|event_flag_t.EVF_NO_WARN_SUBS]
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
function register_c_yui_update_watch()
{
    return create_gclass(GCLASS_NAME);
}

export { register_c_yui_update_watch };
