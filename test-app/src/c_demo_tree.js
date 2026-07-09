/***********************************************************************
 *          c_demo_tree.js
 *
 *      C_DEMO_TREE — a gobj-tree view for the demo. Hosts the gobj-ui
 *      component C_YUI_GOBJ_TREE_JS, which introspects the running yuno
 *      and draws its live gobj tree as a G6 graph — a self-referential
 *      view (you see the yuno + this wrapper + the tree component
 *      itself). Needs no data and no backend; the G6 graph is built on
 *      start, so the holder must be in the DOM by then (it is — the
 *      shell appends our $container before gobj_start).
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
const GCLASS_NAME = "C_DEMO_TREE";

let __instance_counter__ = 0;


/***************************************************************
 *              Attrs
 ***************************************************************/
const attrs_table = [
SDATA(data_type_t.DTP_POINTER,  "subscriber",   0,  null,   "Subscriber of output events"),

SDATA(data_type_t.DTP_STRING,   "title",        0,  "Gobj tree", "Card title"),
SDATA(data_type_t.DTP_STRING,   "lead",         0,  "",     "Explanatory paragraph"),
SDATA(data_type_t.DTP_POINTER,  "$container",   0,  null,   "Root HTMLElement (shell contract)"),
SDATA_END()
];

let PRIVATE_DATA = {
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
    let $holder = $c ? $c.querySelector(".DEMO_TREE_HOLDER") : null;

    /*  Unique name → unique internal canvas id. */
    let tree = gobj_create_pure_child(
        "demo_gobjtree_" + (++__instance_counter__),
        "C_YUI_GOBJ_TREE_JS",
        {layout: "vertical-compact"},
        gobj
    );
    priv.tree = tree;

    let $tree = gobj_read_attr(tree, "$container");
    if($tree && $holder) {
        $holder.appendChild($tree);
        gobj_start(tree);
    } else {
        log_error(`${GCLASS_NAME}: C_YUI_GOBJ_TREE_JS has no $container`);
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
 *  Build the card: header + a full-height holder for the G6 tree.
 ***************************************************************/
function build_ui(gobj)
{
    let title = gobj_read_attr(gobj, "title") || "Gobj tree";
    let lead  = gobj_read_attr(gobj, "lead")  || "";

    let head = [
        ["h1", {class: "DEMO_TITLE title is-3 mb-2", i18n: title}, title]
    ];
    if(lead) {
        head.push(["p", {class: "DEMO_LEAD content", i18n: lead, style: "max-width:60ch;"}, lead]);
    }

    let $c = createElement2(
        ["div", {class: "C_DEMO_TREE DEMO_CARD view-card"}, [
            ["div", {class: "DEMO_HEAD"}, head],
            ["div", {class: "DEMO_TREE_HOLDER box p-0",
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
function register_c_demo_tree()
{
    return create_gclass(GCLASS_NAME);
}

export {register_c_demo_tree};
