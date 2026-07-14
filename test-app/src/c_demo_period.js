/***********************************************************************
 *          c_demo_period.js
 *
 *      C_DEMO_PERIOD — the date navigator for the demo. Hosts TWO
 *      C_YUI_PERIOD instances so the point of the component is visible:
 *      the same code, two different sets of granularities.
 *
 *        - the left one is what a phone energy app shows (the five
 *          everybody knows) plus the rolling windows a log is read with,
 *          plus "custom" — whose slot here is a plain from/to pair;
 *        - the right one is the CALENDAR set (bimester, quarter,
 *          semester, decade), the ones an app that reports by quarter
 *          asks for. Nothing was added to the component to get them:
 *          they are (unit, count) declarations.
 *
 *      Every EV_PERIOD_CHANGED is echoed below, with the two timestamps
 *      the bucket resolves to — which is what a query builder receives.
 *      No backend.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {
    SDATA, SDATA_END, data_type_t,
    gclass_create, log_error,
    gobj_parent,
    gobj_read_attr, gobj_read_pointer_attr, gobj_write_attr,
    gobj_subscribe_event, gobj_unsubscribe_event,
    gobj_create_pure_child, gobj_start, gobj_send_event, gobj_name,
    createElement2,
    refresh_language,
} from "@yuneta/gobj-js";

import {fmt_epoch} from "@yuneta/gobj-ui/src/yui_time.js";
import {yui_shell_of} from "@yuneta/gobj-ui/src/c_yui_shell.js";

import {t} from "i18next";


/***************************************************************
 *              Constants
 ***************************************************************/
const GCLASS_NAME = "C_DEMO_PERIOD";


/***************************************************************
 *              Attrs
 ***************************************************************/
const attrs_table = [
SDATA(data_type_t.DTP_POINTER,  "subscriber",   0,  null,   "Subscriber of output events"),

SDATA(data_type_t.DTP_STRING,   "title",        0,  "Period", "Card title"),
SDATA(data_type_t.DTP_STRING,   "lead",         0,  "",     "Explanatory paragraph"),
SDATA(data_type_t.DTP_POINTER,  "$container",   0,  null,   "Root HTMLElement (shell contract)"),
SDATA_END()
];

let PRIVATE_DATA = {
    log:        null,       /*  the echo panel  */
    $echo:      null,
    pickers:    null,       /*  name -> gobj  */
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

    priv.log = [];
    priv.pickers = {};

    build_ui(gobj);

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
    /*  The navigators compose their labels at build time ("Week 27", a
     *  month name): no attribute can reach them, so they must re-render on
     *  the shell's EV_LANGUAGE_CHANGED — which means subscribing to it.  */
    let shell = yui_shell_of(gobj);
    if(shell) {
        gobj_subscribe_event(shell, "EV_LANGUAGE_CHANGED", {}, gobj);
    }
}

/***************************************************************
 *          Framework Method: Stop
 ***************************************************************/
function mt_stop(gobj)
{
    let shell = yui_shell_of(gobj);
    if(shell) {
        gobj_unsubscribe_event(shell, "EV_LANGUAGE_CHANGED", {}, gobj);
    }
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
 *  One navigator, its own set of granularities, inside a card.
 ***************************************************************/
function build_picker(gobj, name, heading, kw)
{
    let priv = gobj.priv;

    let picker = gobj_create_pure_child(name, "C_YUI_PERIOD", kw, gobj);
    gobj_start(picker);
    priv.pickers[name] = picker;

    return createElement2(
        ["div", {class: "column is-half DEMO_PERIOD_COL"},
            [
                ["div", {class: "box DEMO_PERIOD_BOX"},
                    [
                        ["p", {class: "label mb-2 DEMO_PERIOD_HEADING"}, heading],
                        gobj_read_attr(picker, "$container")
                    ]
                ]
            ]
        ]);
}

/***************************************************************
 *  The "custom" slot of the first picker: the component shows and hides
 *  it with the mode — the host only says what goes in it.
 ***************************************************************/
function build_custom_slot()
{
    let mk = () => createElement2(
        ["input", {class: "input DEMO_PERIOD_CUSTOM_INPUT",
                   type: "datetime-local", step: "1"}]);

    return createElement2(
        ["div", {class: "mt-2 DEMO_PERIOD_CUSTOM"},
            [
                ["div", {class: "columns is-mobile mb-0"},
                    [
                        ["div", {class: "column is-half"},
                            [["label", {class: "label is-small mb-1", "data-i18n": "from"},
                                t("from")], mk()]],
                        ["div", {class: "column is-half"},
                            [["label", {class: "label is-small mb-1", "data-i18n": "to"},
                                t("to")], mk()]]
                    ]
                ]
            ]
        ]);
}

function build_ui(gobj)
{
    let priv = gobj.priv;

    priv.$echo = createElement2(
        ["pre", {class: "is-size-7 DEMO_PERIOD_ECHO",
                 style: "max-height:12rem; overflow:auto;"}, t("nothing yet")]);

    let $left = build_picker(gobj, "period_log", t("a log: hours, days, weeks, years"), {
        periods:      ["hour", "day", "week", "year"],
        with_span:    true,
        with_custom:  true,
        mode:         "day",
        /*  The oldest record this "key" holds: it is what arms |< and greys
         *  out the arrow that would walk off the data.  */
        min:          Math.floor((Date.now() - 400 * 86400000) / 1000),
        max:          Math.floor(Date.now() / 1000),
        $custom:      build_custom_slot()
    });

    let $right = build_picker(gobj, "period_report", t("a report: quarters and semesters"), {
        periods:      ["month", "quarter", "semester", "year"],
        more_periods: ["bimester", "decade"],
        mode:         "quarter"
    });

    let $container = createElement2(
        ["div", {class: `${GCLASS_NAME} DEMO_PERIOD view-card`},
            [
                ["h2", {class: "title is-4 DEMO_PERIOD_TITLE"}, gobj_read_attr(gobj, "title")],
                ["p", {class: "mb-4 DEMO_PERIOD_LEAD"}, gobj_read_attr(gobj, "lead")],
                ["div", {class: "columns is-multiline DEMO_PERIOD_PICKERS"}, [$left, $right]],
                ["p", {class: "label mt-4 mb-1 DEMO_PERIOD_ECHO_LABEL"},
                    t("what the query builder receives")],
                priv.$echo
            ]
        ]);

    gobj_write_attr(gobj, "$container", $container);
}

/***************************************************************
 *  Show what a bucket RESOLVES to: a name is for the user, two
 *  timestamps are for the backend.
 ***************************************************************/
function echo(gobj, kw, src_name)
{
    let priv = gobj.priv;

    let from = kw.from ? fmt_epoch(kw.from, false) : "—";
    let to = kw.to ? fmt_epoch(kw.to, false) : "—";

    priv.log.unshift(`${src_name}  mode=${kw.mode}  from=${from}  to=${to}`);
    priv.log = priv.log.slice(0, 12);
    priv.$echo.textContent = priv.log.join("\n");
}




                    /***************************
                     *      Actions
                     ***************************/




/***************************************************************
 *  A navigator moved.
 ***************************************************************/
function ac_period_changed(gobj, event, kw, src)
{
    echo(gobj, kw, gobj_name(src) === "period_report" ? "report" : "log   ");
    return 0;
}

/***************************************************************
 *
 ***************************************************************/
function ac_language_changed(gobj, event, kw, src)
{
    let $c = gobj_read_attr(gobj, "$container");
    if($c) {
        refresh_language($c, t);
    }
    for(let name in gobj.priv.pickers) {
        gobj_send_event(gobj.priv.pickers[name], "EV_LANGUAGE_CHANGED", {}, gobj);
    }
    return 0;
}

/***************************************************************
 *              FSM
 ***************************************************************/
const gmt = {
    mt_create:  mt_create,
    mt_start:   mt_start,
    mt_stop:    mt_stop,
    mt_destroy: mt_destroy
};

function create_gclass(gclass_name)
{
    if(__gclass__) {
        log_error(`GClass ALREADY created: ${gclass_name}`);
        return -1;
    }

    const states = [
        ["ST_IDLE", [
            ["EV_PERIOD_CHANGED",       ac_period_changed,      null],
            ["EV_LANGUAGE_CHANGED",     ac_language_changed,    null]
        ]]
    ];

    const event_types = [
        ["EV_PERIOD_CHANGED",       0],
        ["EV_LANGUAGE_CHANGED",     0]
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

function register_c_demo_period()
{
    return create_gclass(GCLASS_NAME);
}

export {register_c_demo_period};
