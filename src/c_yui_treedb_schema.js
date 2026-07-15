/***********************************************************************
 *          c_yui_treedb_schema.js
 *
 *      Schema-graph landing (prototype): the treedb drawn as a GRAPH OF
 *      TOPICS — one node per topic, one edge per hook/fkey relationship
 *      — from the schema `descs` alone (no data, no backend calls). A
 *      node click opens that topic's table (a real hash navigation via
 *      the host-supplied `node_route`). An alternate landing to the
 *      topic cards, in the spirit of "every treedb is a graph".
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
    gobj_read_pointer_attr,
    gobj_subscribe_event,
    gobj_parent,
    gobj_read_attr,
    createElement2,
    gobj_write_attr,
    gobj_short_name,
    gobj_read_bool_attr,
    gobj_read_str_attr,
    is_object,
} from "@yuneta/gobj-js";

import {Graph, NodeEvent} from "@antv/g6";

import {t} from "i18next";

/***************************************************************
 *              Constants
 ***************************************************************/
const GCLASS_NAME = "C_YUI_TREEDB_SCHEMA";

/***************************************************************
 *              Data
 ***************************************************************/
const attrs_table = [
SDATA(data_type_t.DTP_POINTER,  "subscriber",   0,  null,   "Subscriber of output events"),
SDATA(data_type_t.DTP_JSON,     "descs",        0,  null,   "Treedb schema: {topic_name: desc}"),
SDATA(data_type_t.DTP_STRING,   "node_route",   0,  "",     "Hash-route template with a {topic} placeholder: a node click opens that topic (e.g. '#/topics/db/<sel>/{topic}')"),
SDATA(data_type_t.DTP_BOOLEAN,  "system",       0,  false,  "Include system topics (__*__) too"),
SDATA(data_type_t.DTP_POINTER,  "$container",   0,  null,   "Root HTML element"),
SDATA_END()
];

let PRIVATE_DATA = {
    $container:     null,
    graph:          null,
};

let __gclass__ = null;




                    /******************************
                     *      Framework Methods
                     ******************************/




function mt_create(gobj)
{
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

function mt_start(gobj)
{
    build_graph(gobj);
}

function mt_stop(gobj)
{
    destroy_graph(gobj);
}

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




/************************************************************
 *   Build UI
 ************************************************************/
function build_ui(gobj)
{
    let $container = createElement2(
        ['div', {class: 'C_YUI_TREEDB_SCHEMA TREEDB_SCHEMA_VIEW',
                 style: 'position:relative; height:100%; min-height:0;'}, []]
    );
    gobj_write_attr(gobj, "$container", $container);
}

/************************************************************
 *   True on <html data-theme="dark"> (or OS dark when unset).
 ************************************************************/
function is_dark_theme()
{
    let attr = document.documentElement.getAttribute("data-theme");
    if(attr) {
        return attr === "dark";
    }
    return typeof window !== "undefined" && window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/************************************************************
 *   Derive {nodes, edges} from the schema.
 *   Node  = a topic.  Edge  = a hook (parent -> child) or an
 *   fkey (child -> parent, reversed to parent -> child), deduped.
 *   Left-to-right dagre follows the parent -> child data flow.
 ************************************************************/
function schema_to_graph(gobj)
{
    let descs = gobj_read_attr(gobj, "descs");
    let system = gobj_read_bool_attr(gobj, "system");
    let nodes = [];
    let topic_set = {};

    if(!is_object(descs)) {
        return {nodes: nodes, edges: []};
    }

    for(let topic of Object.keys(descs)) {
        if(!system && topic.substring(0, 2) === "__") {
            continue;
        }
        topic_set[topic] = true;
        nodes.push({id: topic, data: {topic_name: topic}});
    }

    let edge_seen = {};
    let edges = [];
    let add_edge = (source, target) => {
        if(!topic_set[source] || !topic_set[target] || source === target) {
            return;
        }
        let key = source + "" + target;
        if(edge_seen[key]) {
            return;
        }
        edge_seen[key] = true;
        edges.push({id: key, source: source, target: target});
    };

    for(let topic of Object.keys(descs)) {
        let desc = descs[topic];
        if(!is_object(desc) || !Array.isArray(desc.cols)) {
            continue;
        }
        for(let col of desc.cols) {
            if(!col) {
                continue;
            }
            if(is_object(col.hook)) {
                for(let child of Object.keys(col.hook)) {
                    add_edge(topic, child);          /*  parent -> child  */
                }
            } else if(is_object(col.fkey)) {
                for(let parent of Object.keys(col.fkey)) {
                    add_edge(parent, topic);         /*  parent -> child  */
                }
            }
        }
    }

    return {nodes: nodes, edges: edges};
}

/************************************************************
 *   Build the G6 schema graph.
 ************************************************************/
function build_graph(gobj)
{
    let priv = gobj.priv;
    let $container = gobj_read_attr(gobj, "$container");
    if(!$container) {
        return;
    }
    destroy_graph(gobj);

    let data = schema_to_graph(gobj);
    if(data.nodes.length === 0) {
        let $empty = createElement2(
            ['div', {class: 'TREEDB_SCHEMA_EMPTY p-4 has-text-grey',
                     i18n: 'no topics'}, t('no topics', {defaultValue: 'No topics'})]
        );
        $container.appendChild($empty);
        return;
    }

    let dark = is_dark_theme();
    let graph;
    try {
        graph = new Graph({
            container:  $container,
            autoResize: true,
            data:       data,
            node: {
                style: {
                    size:           40,
                    fill:           "#5B8FF9",
                    labelText:      (d) => d.id,
                    labelPlacement: "bottom",
                    labelFill:      dark ? "#e6e6e6" : "#333333",
                    labelBackground: true,
                    labelBackgroundFill: dark ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.7)",
                    cursor:         "pointer",
                },
            },
            edge: {
                style: {
                    stroke:   dark ? "#666666" : "#bbbbbb",
                    endArrow: true,
                },
            },
            layout: {
                type:    "antv-dagre",
                rankdir: "LR",
                nodesep: 24,
                ranksep: 60,
            },
            behaviors: ["zoom-canvas", "drag-canvas", "drag-element"],
        });
    } catch(e) {
        log_error(`${gobj_short_name(gobj)}: schema graph create failed: ${e}`);
        return;
    }
    priv.graph = graph;

    graph.setTheme(dark ? "dark" : "light");

    /*  A node click opens that topic — a real hash navigation, so it is
     *  deep-linkable and Back-friendly like the cards. Crosses the FSM. */
    graph.on(NodeEvent.CLICK, (evt) => {
        let node_id = evt && evt.target && evt.target.id;
        gobj_send_event(gobj, "EV_NODE_CLICK", {node_id: node_id}, gobj);
    });

    graph.render().then(() => {
        try {
            graph.fitView();
        } catch(e) {
            // best-effort centring
        }
    }).catch((e) => {
        log_error(`${gobj_short_name(gobj)}: schema graph render failed: ${e}`);
    });
}

/************************************************************
 *   Destroy the G6 graph.
 ************************************************************/
function destroy_graph(gobj)
{
    let priv = gobj.priv;
    if(priv.graph) {
        try {
            priv.graph.destroy();
        } catch(e) {
            // already gone
        }
        priv.graph = null;
    }
    let $container = gobj_read_attr(gobj, "$container");
    if($container) {
        while($container.firstChild) {
            $container.removeChild($container.firstChild);
        }
    }
}




                    /***************************
                     *      Actions
                     ***************************/




/************************************************************
 *   A topic node was clicked: open its table via the host route.
 ************************************************************/
function ac_node_click(gobj, event, kw, src)
{
    let topic = kw && kw.node_id;
    let route = gobj_read_str_attr(gobj, "node_route");
    if(!topic || !route) {
        return 0;
    }
    let href = route.replace("{topic}", topic);
    if(typeof window !== "undefined") {
        window.location.hash = href;
    }
    return 0;
}

/************************************************************
 *   Shown by the host: (re)fit the view now the container is
 *   visible and sized (G6 renders at 0×0 while display:none).
 ************************************************************/
function ac_show(gobj, event, kw, src)
{
    let priv = gobj.priv;
    if(!priv.graph) {
        build_graph(gobj);
        return 0;
    }
    try {
        priv.graph.fitView();
    } catch(e) {
        // best-effort
    }
    return 0;
}

/************************************************************
 *   Rebuild from a fresh schema (descs arrived / changed).
 ************************************************************/
function ac_rebuild(gobj, event, kw, src)
{
    if(kw && is_object(kw.descs)) {
        gobj_write_attr(gobj, "descs", kw.descs);
    }
    build_graph(gobj);
    return 0;
}




                    /***************************
                     *          FSM
                     ***************************/




const gmt = {
    mt_create:  mt_create,
    mt_start:   mt_start,
    mt_stop:    mt_stop,
    mt_destroy: mt_destroy,
};

function create_gclass(gclass_name)
{
    if(__gclass__) {
        log_error(`GClass ALREADY created: ${gclass_name}`);
        return -1;
    }

    const states = [
        ["ST_IDLE", [
            ["EV_NODE_CLICK",   ac_node_click,  null],
            ["EV_SHOW",         ac_show,        null],
            ["EV_REBUILD",      ac_rebuild,     null],
        ]]
    ];

    const event_types = [
        ["EV_NODE_CLICK",   0],
        ["EV_SHOW",         0],
        ["EV_REBUILD",      0],
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

function register_c_yui_treedb_schema()
{
    return create_gclass(GCLASS_NAME);
}

export {register_c_yui_treedb_schema};
