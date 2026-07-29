/***********************************************************************
 *          c_demo_jsontree.js
 *
 *      C_DEMO_JSONTREE — hosts the gobj-ui component C_YUI_JSON, the
 *      lazy JSON TREE viewer (the graph flavour lives in the JSON graph
 *      chapter, C_YUI_JSON_GRAPH).
 *
 *      It exists to make the viewer visible: it renders deep nesting,
 *      which is where its two indentation rules show — four characters
 *      per level and a guide line per ancestor — and those are hard to
 *      judge in a component nobody can open.
 *
 *      Offline: the value below is a literal.
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
    gobj_read_pointer_attr,
    gobj_write_attr,
    gobj_subscribe_event,
    gobj_create_pure_child,
    gobj_start,
    gobj_send_event,
    createElement2,
} from "@yuneta/gobj-js";

import {register_c_yui_json} from "@yuneta/gobj-ui/src/c_yui_json.js";


/***************************************************************
 *              Constants
 ***************************************************************/
const GCLASS_NAME = "C_DEMO_JSONTREE";

/*  Deep on purpose: the guides only earn their keep past level two. */
const SAMPLE = {
    yuno: "gobj_ui_demo",
    version: "1.0.0",
    tree: {
        energy: {
            north_hall: {
                m1: {
                    topic: "meters^north^m1",
                    records: 3418772,
                    keys: ["kwh_total", "kwh_p1", "voltage_l1"],
                    last: {t: "2026-07-29T08:00:00", kwh_total: 1200.0}
                },
                m2: {
                    topic: "meters^north^m2",
                    records: 2904331,
                    keys: ["kwh_total"],
                    last: {t: "2026-07-29T08:00:00", kwh_total: 987.5}
                }
            },
            south_hall: {
                m3: {topic: "meters^south^m3", records: 1755410}
            }
        },
        water: {
            tanks: [
                {id: "t1", litres: 12500, alarms: []},
                {id: "t2", litres: 9800, alarms: ["low_level"]}
            ]
        }
    },
    flags: {debug: false, readonly: true, retries: 3}
};


/***************************************************************
 *              Attrs
 ***************************************************************/
const attrs_table = [
SDATA(data_type_t.DTP_POINTER,  "subscriber",   0,  null,   "Subscriber of output events"),

SDATA(data_type_t.DTP_STRING,   "title",        0,  "",     "Card title"),
SDATA(data_type_t.DTP_STRING,   "lead",         0,  "",     "Explanatory paragraph"),
SDATA(data_type_t.DTP_POINTER,  "$container",   0,  null,   "Root HTMLElement (shell contract)"),
SDATA_END()
];

let PRIVATE_DATA = {
    viewer: null
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

    /*
     *  CHILD subscription model
     */
    let subscriber = gobj_read_pointer_attr(gobj, "subscriber");
    if(!subscriber) {
        subscriber = gobj_parent(gobj);
    }
    gobj_subscribe_event(gobj, null, {}, subscriber);

    let title = gobj_read_attr(gobj, "title") || "JSON tree";
    let lead  = gobj_read_attr(gobj, "lead") || "";

    let $slot = createElement2(["div", {class: "JSONTREE_VIEWER"}]);
    let $container = createElement2(
        ["div", {class: `${GCLASS_NAME} JSONTREE_CARD p-4`}, [
            ["h1", {class: "title is-5 JSONTREE_TITLE", i18n: title}, title],
            ["p", {class: "JSONTREE_LEAD mb-3", i18n: lead}, lead],
            $slot
        ]]
    );

    priv.viewer = gobj_create_pure_child("viewer", "C_YUI_JSON", {
        title: "sample"
    }, gobj);
    let $v = gobj_read_attr(priv.viewer, "$container");
    if($v) {
        $slot.appendChild($v);
    } else {
        log_error(`${GCLASS_NAME}: C_YUI_JSON built no $container`);
    }

    gobj_write_attr(gobj, "$container", $container);
}

/***************************************************************
 *          Framework Method: Start
 ***************************************************************/
function mt_start(gobj)
{
    let priv = gobj.priv;

    if(!priv.viewer) {
        return;   /*  Error already logged  */
    }
    gobj_start(priv.viewer);

    /*  The document arrives as an EVENT, not as an attr: `json_data`
     *  only pre-fills the first render and leaves the machine in
     *  ST_EMPTY, where every later toggle is rejected — loudly, which
     *  is how this demo found out. */
    gobj_send_event(priv.viewer, "EV_SET_JSON", {json: SAMPLE}, gobj);
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
        ["ST_IDLE", []]
    ];

    /*---------------------------------------------*
     *          Events
     *---------------------------------------------*/
    const event_types = [];

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
function register_c_demo_jsontree()
{
    register_c_yui_json();
    return create_gclass(GCLASS_NAME);
}

export { register_c_demo_jsontree };
