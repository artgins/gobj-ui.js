/***********************************************************************
 *          c_demo_chart.js
 *
 *      C_DEMO_CHART — a chart view for the demo. Hosts the gobj-ui uPlot
 *      component C_YUI_UPLOT as a child, adds two series and feeds a
 *      static time-series (unix-epoch-seconds x-axis). Fully offline.
 *
 *      C_YUI_UPLOT takes its data via events, not kw: EV_ADD_SERIE per
 *      series (id = the field name in each row), then EV_LOAD_DATA with
 *      the row array. It publishes nothing back.
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
    gobj_create_pure_child, gobj_start, gobj_send_event,
    createElement2,
    refresh_language,
} from "@yuneta/gobj-js";

import {t} from "i18next";


/***************************************************************
 *              Constants
 ***************************************************************/
const GCLASS_NAME = "C_DEMO_CHART";

/*  Static sample series: 12 hourly points. tm is unix epoch SECONDS. */
const T0 = 1720000000;
const TEMP = [20, 21, 22, 23, 24, 23, 22, 21, 20, 19, 20, 21];
const HUM  = [45, 44, 43, 40, 38, 39, 41, 43, 45, 47, 46, 44];
const ROWS = TEMP.map((v, i) => ({tm: T0 + i * 3600, temp: v, hum: HUM[i]}));


/***************************************************************
 *              Attrs
 ***************************************************************/
const attrs_table = [
SDATA(data_type_t.DTP_POINTER,  "subscriber",   0,  null,    "Subscriber of output events"),

SDATA(data_type_t.DTP_STRING,   "title",        0,  "Chart", "Card title"),
SDATA(data_type_t.DTP_STRING,   "lead",         0,  "",      "Explanatory paragraph"),
SDATA(data_type_t.DTP_POINTER,  "$container",   0,  null,    "Root HTMLElement (shell contract)"),
SDATA_END()
];

let PRIVATE_DATA = {
    chart: null,
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
     *  CHILD subscription model
     */
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
    let priv = gobj.priv;
    let $c = gobj_read_attr(gobj, "$container");
    let $holder = $c ? $c.querySelector(".DEMO_CHART_HOLDER") : null;
    if(!$holder) {
        log_error(`${GCLASS_NAME}: no chart holder`);
        return;
    }

    /*  C_YUI_UPLOT builds uPlot INTO the $container it is given; provide a
     *  sized, in-DOM element (it reads clientWidth on build) rather than
     *  reading one back — its self-created container is not exposed cleanly. */
    let $chartEl = createElement2(["div", {class: "DEMO_CHART_EL", style: "width:100%;"}]);
    $holder.appendChild($chartEl);

    let chart = gobj_create_pure_child(
        "demo_uplot",
        "C_YUI_UPLOT",
        {$container: $chartEl, width: 720, height: 320, tm: "tm", title: ""},
        gobj
    );
    priv.chart = chart;

    gobj_start(chart);
    gobj_send_event(chart, "EV_ADD_SERIE", {id: "temp", label: "Temp (°C)",   width: 2}, gobj);
    gobj_send_event(chart, "EV_ADD_SERIE", {id: "hum",  label: "Humidity (%)", width: 2}, gobj);
    gobj_send_event(chart, "EV_LOAD_DATA", ROWS, gobj);
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
 *  Build the card: header + a holder for the uPlot chart.
 ***************************************************************/
function build_ui(gobj)
{
    let title = gobj_read_attr(gobj, "title") || "Chart";
    let lead  = gobj_read_attr(gobj, "lead")  || "";

    let head = [
        ["h1", {class: "DEMO_TITLE title is-3 mb-2", i18n: title}, title]
    ];
    if(lead) {
        head.push(["p", {class: "DEMO_LEAD content", i18n: lead, style: "max-width:60ch;"}, lead]);
    }

    let $c = createElement2(
        ["div", {class: "C_DEMO_CHART DEMO_CARD view-card"}, [
            ["div", {class: "DEMO_HEAD"}, head],
            ["div", {class: "DEMO_CHART_HOLDER", style: "max-width:760px;"}, []]
        ]]
    );
    gobj_write_attr(gobj, "$container", $c);
    refresh_language($c, t);
}




                    /***************************
                     *      Actions
                     ***************************/




/***************************************************************
 *              FSM
 ***************************************************************/
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
        ["ST_IDLE", []]
    ];

    const event_types = [];

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
function register_c_demo_chart()
{
    return create_gclass(GCLASS_NAME);
}

export {register_c_demo_chart};
