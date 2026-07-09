/***********************************************************************
 *          c_demo_json.js
 *
 *      C_DEMO_JSON — a JSON-graph view for the demo. Hosts the gobj-ui
 *      component C_YUI_JSON_GRAPH, which renders an arbitrary JSON value
 *      as a hierarchical G6 graph (objects/arrays as group nodes,
 *      scalars as rows). Fully offline. It publishes EV_JSON_ITEM_CLICKED
 *      on a node click, so this wrapper declares that event.
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
    gobj_create_pure_child, gobj_start,
    createElement2,
    refresh_language,
} from "@yuneta/gobj-js";

import {t} from "i18next";


/***************************************************************
 *              Constants
 ***************************************************************/
const GCLASS_NAME = "C_DEMO_JSON";

let __instance_counter__ = 0;

/*  A sample nested JSON value to visualise. */
const SAMPLE_JSON = {
    yuno: "gobj_ui_demo",
    version: "1.0.0",
    services: ["shell", "demo"],
    shell: {
        zones: ["top", "left", "bottom", "top-sub", "right", "center"],
        stages: {main: {default_route: "/tabs"}}
    },
    menu: {
        primary: {layouts: ["vertical", "icon-bar"], items: 12},
        quick: {layout: "drawer"}
    },
    flags: {use_hash: true, theme: "light", i18n: null}
};


/***************************************************************
 *              Attrs
 ***************************************************************/
const attrs_table = [
SDATA(data_type_t.DTP_POINTER,  "subscriber",   0,  null,   "Subscriber of output events"),

SDATA(data_type_t.DTP_STRING,   "title",        0,  "JSON graph", "Card title"),
SDATA(data_type_t.DTP_STRING,   "lead",         0,  "",     "Explanatory paragraph"),
SDATA(data_type_t.DTP_POINTER,  "$container",   0,  null,   "Root HTMLElement (shell contract)"),
SDATA_END()
];

let PRIVATE_DATA = {
    graph: null,
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
    let priv = gobj.priv;
    let $c = gobj_read_attr(gobj, "$container");
    let $holder = $c ? $c.querySelector(".DEMO_JSON_HOLDER") : null;

    let graph = gobj_create_pure_child(
        "demo_jsongraph_" + (++__instance_counter__),
        "C_YUI_JSON_GRAPH",
        {path: "config", json_data: SAMPLE_JSON},
        gobj
    );
    priv.graph = graph;

    let $graph = gobj_read_attr(graph, "$container");
    if($graph && $holder) {
        $holder.appendChild($graph);
        gobj_start(graph);
    } else {
        log_error(`${GCLASS_NAME}: C_YUI_JSON_GRAPH has no $container`);
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
 *  Build the card: header + a full-height holder for the G6 graph.
 ***************************************************************/
function build_ui(gobj)
{
    let title = gobj_read_attr(gobj, "title") || "JSON graph";
    let lead  = gobj_read_attr(gobj, "lead")  || "";

    let head = [
        ["h1", {class: "DEMO_TITLE title is-3 mb-2", i18n: title}, title]
    ];
    if(lead) {
        head.push(["p", {class: "DEMO_LEAD content", i18n: lead, style: "max-width:60ch;"}, lead]);
    }

    let $c = createElement2(
        ["div", {class: "C_DEMO_JSON DEMO_CARD view-card"}, [
            ["div", {class: "DEMO_HEAD"}, head],
            ["div", {class: "DEMO_JSON_HOLDER box p-0",
                     style: "flex:1; min-height:0; overflow:hidden;"}, []]
        ]]
    );
    gobj_write_attr(gobj, "$container", $c);
    refresh_language($c, t);
}




                    /***************************
                     *      Actions
                     ***************************/




/***************************************************************
 *  A node in the JSON graph was clicked (kw = {path, id}). Nothing
 *  to do in the demo — declared so the published event has a home.
 ***************************************************************/
function ac_json_item_clicked(gobj, event, kw, src)
{
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
            ["EV_JSON_ITEM_CLICKED",  ac_json_item_clicked,  null]
        ]]
    ];

    const event_types = [
        ["EV_JSON_ITEM_CLICKED",  0]
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
function register_c_demo_json()
{
    return create_gclass(GCLASS_NAME);
}

export {register_c_demo_json};
