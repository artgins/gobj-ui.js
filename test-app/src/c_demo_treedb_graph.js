/***********************************************************************
 *          c_demo_treedb_graph.js
 *
 *      C_DEMO_TREEDB_GRAPH — the treedb graph, offline.
 *
 *      Hosts the real C_YUI_TREEDB_GRAPH (and therefore the real
 *      C_G6_NODES_TREE under it), which is the component whose camera
 *      and toolbar vocabulary the other two graphs in this demo copy —
 *      and which, until this chapter, nobody could see here, because it
 *      is the one that needs a BACKEND.
 *
 *      The backend is C_DEMO_BACKEND, a sibling gobj that answers
 *      `descs` and `nodes` with no wire underneath.  We pass it as the
 *      graph's `gobj_remote_yuno`, which is the whole trick: the graph
 *      does not know or care that its remote yuno is in the same page.
 *
 *      Read-only on purpose (`readonly: true`): there is nothing behind
 *      this to write to, and the graph's edition mode draws affordances
 *      for writes that would only be refused.
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
    gobj_stop_children,
} from "@yuneta/gobj-js";

import {lead_block} from "./demo_lead.js";

import {t} from "i18next";


/***************************************************************
 *              Constants
 ***************************************************************/
const GCLASS_NAME = "C_DEMO_TREEDB_GRAPH";

let __instance_counter__ = 0;


/***************************************************************
 *              Attrs
 ***************************************************************/
const attrs_table = [
SDATA(data_type_t.DTP_POINTER,  "subscriber",   0,  null,   "Subscriber of output events"),

SDATA(data_type_t.DTP_STRING,   "title",        0,  "Frontend view", "Card title"),
SDATA(data_type_t.DTP_STRING,   "lead",         0,  "",     "Explanatory paragraph"),
SDATA(data_type_t.DTP_POINTER,  "$container",   0,  null,   "Root HTMLElement (shell contract)"),
SDATA_END()
];

let PRIVATE_DATA = {
    backend: null,   // C_DEMO_BACKEND playing the remote yuno
    tree: null,
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
    let $holder = $c ? $c.querySelector(".DEMO_TREEDB_GRAPH_HOLDER") : null;

    /*  The backend FIRST: the graph asks for `descs` the moment it
     *  starts, so its remote yuno has to exist before that.  */
    let backend = gobj_create_pure_child(
        "demo_backend_" + (++__instance_counter__),
        "C_DEMO_BACKEND",
        {treedb_name: "demo_treedb"},
        gobj
    );
    priv.backend = backend;
    gobj_start(backend);

    /*  Unique name → unique internal canvas id. */
    let tree = gobj_create_pure_child(
        "demo_treedbgraph_" + (++__instance_counter__),
        "C_YUI_TREEDB_GRAPH",
        {
            gobj_remote_yuno: backend,
            treedb_name:      "demo_treedb",
            readonly:         true
        },
        gobj
    );
    priv.tree = tree;

    let $tree = gobj_read_attr(tree, "$container");
    if($tree && $holder) {
        $holder.appendChild($tree);
        gobj_start(tree);
    } else {
        log_error(`${GCLASS_NAME}: C_YUI_TREEDB_GRAPH has no $container`);
    }
}

/***************************************************************
 *          Framework Method: Stop
 ***************************************************************/
function mt_stop(gobj)
{
    /*  What this wrapper started, it stops.  gobj_destroy() destroys the
     *  children BEFORE mt_destroy, and destroying a RUNNING gobj is an
     *  error — invisible while a chapter is keep_alive, loud the moment
     *  it becomes lazy_destroy. */
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
 *  Build the card: header + a full-height holder for the G6 tree.
 ***************************************************************/
function build_ui(gobj)
{
    let title = gobj_read_attr(gobj, "title") || "TreeDB graph";
    let lead  = gobj_read_attr(gobj, "lead")  || "";

    let head = [
        ["h1", {class: "DEMO_TITLE title is-3 mb-2", i18n: title}, title]
    ];
    if(lead) {
        head.push(...lead_block(lead));
    }

    let $c = createElement2(
        ["div", {class: "C_DEMO_TREEDB_GRAPH DEMO_CARD view-card"}, [
            ["div", {class: "DEMO_HEAD"}, head],
            ["div", {class: "DEMO_TREEDB_GRAPH_HOLDER box p-0",
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
function register_c_demo_treedb_graph()
{
    return create_gclass(GCLASS_NAME);
}

export {register_c_demo_treedb_graph};
