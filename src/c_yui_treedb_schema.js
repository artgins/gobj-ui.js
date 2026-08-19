/***********************************************************************
 *          c_yui_treedb_schema.js
 *
 *      Schema-graph landing: the treedb drawn the way its `.c` literal
 *      draws it in ASCII (treedb_schema_*.c, treedb_system_schema.c) —
 *      one CARD per topic listing its fields in schema order, one edge
 *      per hook, from the row that declares the hook to the fkey row of
 *      the child it names. Built from the schema `descs` alone: no data,
 *      no backend calls.
 *
 *      WHY THE CARD AND NOT A DOT. A topic is its fields; a schema is
 *      read to find out what a topic holds and what links to what. A
 *      graph of labelled dots answers neither, and the node graph next
 *      door (C_G6_NODES_TREE) answers a different question entirely —
 *      it draws the RECORDS, so on a treedb whose records are schemas
 *      it draws one box per column, hundreds of them, each labelled by
 *      a pkey that may be a rowid. This view draws the schema itself.
 *
 *      The marks are the notation of the `.c` literals, so the drawing
 *      and the source read the same — see schema_rows().
 *
 *      A node click opens that topic's table (a real hash navigation
 *      via the host-supplied `node_route`). An alternate landing to the
 *      topic cards, in the spirit of "every treedb is a graph".
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
    gobj_publish_event,
    gobj_read_pointer_attr,
    gobj_subscribe_event,
    gobj_send_event,
    gobj_parent,
    gobj_read_attr,
    createElement2,
    gobj_write_attr,
    gobj_short_name,
    gobj_read_bool_attr,
    gobj_read_str_attr,
    is_object,
    escapeHtml,
} from "@yuneta/gobj-js";

import {Graph, NodeEvent} from "@antv/g6";

import {getStrokeColor} from "./lib_graph.js";

import {yui_is_dark, yui_watch_theme} from "./yui_theme.js";

import {t} from "i18next";

/***************************************************************
 *              Constants
 ***************************************************************/
const GCLASS_NAME = "C_YUI_TREEDB_SCHEMA";

/************************************************************
 *   Geometry of a card, in one place: the row height is what
 *   turns a field's index into the vertical position of its
 *   port, so an edge leaves the very row that declares the
 *   hook and lands on the row that declares the fkey.
 ************************************************************/
const CARD_HEADER_H = 30;
const CARD_ROW_H    = 19;
const CARD_PAD_V    = 7;
const CARD_MIN_W    = 210;
const CARD_MAX_W    = 340;

/*  Same palette as the node graph (C_G6_NODES_TREE), so a topic
 *  keeps its colour when the operator moves between the two.  */
const topic_colors = [
    'rgb(237, 201, 73)',
    'rgb(118, 183, 178)',
    'rgb(255, 157, 167)',
    'rgb(175, 122, 161)',
    'rgb(89, 161, 79)',
    'rgb(186, 176, 171)',
    'rgb(66, 146, 198)',
];
const SYSTEM_TOPIC_COLOR = 'rgb(148, 163, 184)';

/***************************************************************
 *              Data
 ***************************************************************/
const attrs_table = [
SDATA(data_type_t.DTP_POINTER,  "subscriber",   0,  null,   "Subscriber of output events"),
SDATA(data_type_t.DTP_JSON,     "descs",        0,  null,   "Treedb schema: {topic_name: desc}"),
SDATA(data_type_t.DTP_STRING,   "node_route",   0,  "",     "Hash-route template with a {topic} placeholder: a node click opens that topic (e.g. '#/topics/db/<sel>/{topic}')"),
SDATA(data_type_t.DTP_BOOLEAN,  "with_node_click", 0, false, "With no `node_route`, PUBLISH a node click as EV_NODE_CLICK instead of dropping it. Opt-in, because a subscriber has to DECLARE the event: the hosts that route by hash, and the ones that want nothing, must not have it appear underneath them"),
SDATA(data_type_t.DTP_BOOLEAN,  "system",       0,  false,  "Include system topics (__*__) too"),
SDATA(data_type_t.DTP_POINTER,  "$container",   0,  null,   "Root HTML element"),
SDATA_END()
];

let PRIVATE_DATA = {
    $container:     null,
    graph:          null,
    theme_observer: null,   // MutationObserver on <html data-theme>
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
    /*  The graph picks its colours from the theme. Translate the DOM
     *  mutation into EV_THEME and let the action restyle the live graph
     *  (ac_theme) — a rebuild would reset the camera. */
    gobj.priv.theme_observer = yui_watch_theme(gobj);

    build_graph(gobj);
}

function mt_stop(gobj)
{
    let priv = gobj.priv;

    if(priv.theme_observer) {
        priv.theme_observer.disconnect();
        priv.theme_observer = null;
    }
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
 *   The shape of a hook/fkey field, from the type it declares.
 *   `dict` and `object` are the SAME thing to treedb (both build
 *   a json object keyed by child id), and so are `list` and
 *   `array` — see the hook/fkey switches in tr_treedb.c. A
 *   `string` holds one reference, so it draws as one.
 ************************************************************/
function hook_mark(type)
{
    if(type === "dict" || type === "object") {
        return "{}";
    }
    if(type === "list" || type === "array") {
        return "[]";
    }
    return "()";
}

/************************************************************
 *   The fields of one topic, as the schema declares them.
 *
 *   The marks are the notation of the schema `.c` literals
 *   (treedb_schema_*.c, treedb_system_schema.c), so the
 *   drawing and the source read the same:
 *      {}   dict hook   (N unique children)
 *      []   list hook   (n not-unique children)
 *      ()   1 child
 *      (↖)  1 fkey      (1 parent)
 *      [↖]  n fkeys     (n parents)
 *      {↖}  N fkeys     (N parents)
 *      *    required
 *      #    the primary key
 *
 *   A column can be BOTH hook and fkey, so the flags are read
 *   here rather than through treedb_get_field_desc's single
 *   `type`, which keeps only the last flag it saw.
 ************************************************************/
function schema_rows(desc)
{
    let rows = [];
    if(!is_object(desc) || !Array.isArray(desc.cols)) {
        return rows;
    }
    for(let col of desc.cols) {
        if(!is_object(col) || !col.id) {
            continue;
        }
        let flags = Array.isArray(col.flag)? col.flag : [];
        let is_hook = flags.indexOf("hook") >= 0;
        let is_fkey = flags.indexOf("fkey") >= 0;
        let mark = "";
        if(is_hook) {
            mark = hook_mark(col.type);
        }
        if(is_fkey) {
            let fmark = hook_mark(col.type).replace("}", "↖}")
                                           .replace("]", "↖]")
                                           .replace(")", "↖)");
            mark = mark? (mark + " " + fmark) : fmark;
        }
        rows.push({
            name:     col.id,
            type:     col.type || "",
            mark:     mark,
            is_hook:  is_hook,
            is_fkey:  is_fkey,
            is_pkey:  (col.id === desc.pkey),
            required: (flags.indexOf("required") >= 0 || flags.indexOf("notnull") >= 0),
        });
    }
    return rows;
}

/************************************************************
 *   Size of the card that holds those rows. The width follows
 *   the longest line so a long field name is not clipped into
 *   an ellipsis — the point of the drawing is to read them.
 ************************************************************/
function card_size(rows)
{
    let longest = 0;
    for(let row of rows) {
        let len = row.name.length + (row.mark? row.mark.length + 2 : 0) + 2;
        if(len > longest) {
            longest = len;
        }
    }
    let w = Math.round(26 + longest * 6.6);
    if(w < CARD_MIN_W) {
        w = CARD_MIN_W;
    }
    if(w > CARD_MAX_W) {
        w = CARD_MAX_W;
    }
    let h = CARD_HEADER_H + CARD_PAD_V * 2 + rows.length * CARD_ROW_H;
    return [w, h];
}

/************************************************************
 *   Vertical placement of a field's port, as a fraction of the
 *   card height: the centre of its own row.
 ************************************************************/
function row_placement(index, height)
{
    let y = CARD_HEADER_H + CARD_PAD_V + index * CARD_ROW_H + CARD_ROW_H / 2;
    return y / height;
}

/************************************************************
 *   The card itself. Header = topic name on its topic colour;
 *   body = one line per field, in schema order.
 ************************************************************/
function build_card_innerHTML(topic, rows, color, dark)
{
    let surface     = dark? "#1b2230" : "#ffffff";
    let bg          = dark
        ? `color-mix(in srgb, ${color} 18%, #232b38)`
        : `color-mix(in srgb, ${color} 6%, ${surface})`;
    let border      = dark
        ? `color-mix(in srgb, ${color} 85%, #ffffff)`
        : color;
    let header_bg   = dark
        ? `color-mix(in srgb, ${color} 45%, #2c3542)`
        : `color-mix(in srgb, ${color} 28%, ${surface})`;
    let title_color = dark? "#e8eaed" : "#0f172a";
    let text_color  = dark? "#d3d8de" : "#334155";
    let mute_color  = dark? "#98a2b0" : "#7c8694";
    let rule_color  = dark
        ? "rgba(255,255,255,0.06)"
        : "rgba(15,23,42,0.05)";
    let shadow      = dark
        ? "0 1px 3px rgba(0,0,0,0.45), 0 1px 2px rgba(0,0,0,0.30)"
        : "0 1px 3px rgba(15,23,42,0.12), 0 1px 2px rgba(15,23,42,0.06)";

    let rows_html = "";
    for(let row of rows) {
        let lead = row.is_pkey? "#" : (row.required? "*" : "");
        let name_weight = (row.is_pkey || row.required)? "600" : "400";
        let name_color = (row.is_hook || row.is_fkey)? title_color : text_color;
        rows_html +=
`    <div class="TREEDB_SCHEMA_FIELD" style="
        display: flex; align-items: center; gap: 6px;
        height: ${CARD_ROW_H}px; line-height: ${CARD_ROW_H}px;
        padding: 0 10px; border-top: 1px solid ${rule_color};
    ">
        <span style="
            width: 8px; flex: 0 0 8px; text-align: center;
            color: ${mute_color}; font-size: 11px;
        ">${lead}</span>
        <span style="
            flex: 1 1 auto; min-width: 0; overflow: hidden;
            text-overflow: ellipsis; white-space: nowrap;
            font-size: 12px; font-weight: ${name_weight}; color: ${name_color};
        ">${escapeHtml(row.name)}</span>
        <span style="
            flex: 0 0 auto; font-size: 11px; color: ${mute_color};
            font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        ">${escapeHtml(row.mark)}</span>
    </div>
`;
    }

    return `
<div class="TREEDB_SCHEMA_CARD" title="${escapeHtml(topic)}" style="
    box-sizing: border-box;
    width: 100%;
    height: 100%;
    background: ${bg};
    border: 1.5px solid ${border};
    border-radius: 8px;
    box-shadow: ${shadow};
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    cursor: pointer;
">
    <div class="TREEDB_SCHEMA_CARD_HEADER" style="
        height: ${CARD_HEADER_H}px; line-height: ${CARD_HEADER_H}px;
        flex: 0 0 ${CARD_HEADER_H}px;
        padding: 0 10px; background: ${header_bg}; color: ${title_color};
        font-size: 13px; font-weight: 700;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    ">${escapeHtml(topic)}</div>
    <div class="TREEDB_SCHEMA_CARD_BODY" style="
        flex: 1 1 auto; padding: ${CARD_PAD_V}px 0; overflow: hidden;
    ">
${rows_html}    </div>
</div>
`;
}

/************************************************************
 *   Derive {nodes, edges} from the schema.
 *
 *   Node = a topic, drawn as the card the `.c` literal draws in
 *   ASCII: its name and its fields. Edge = a hook, from the row
 *   that declares it to the fkey row of the child it names —
 *   `'hook': {'users': 'departments'}` says both ends, so the
 *   arrow can land where the `.c` drawing lands it. An fkey
 *   whose parent declares no hook still gets its edge, or a
 *   half-declared schema would draw as disconnected.
 *
 *   Left-to-right dagre follows the parent -> child data flow.
 ************************************************************/
function schema_to_graph(gobj)
{
    let descs = gobj_read_attr(gobj, "descs");
    let system = gobj_read_bool_attr(gobj, "system");
    let dark = yui_is_dark();
    let nodes = [];
    let cards = {};     /*  topic -> {rows, size, color}  */

    if(!is_object(descs)) {
        return {nodes: nodes, edges: []};
    }

    let idx = 0;
    for(let topic of Object.keys(descs)) {
        let is_system = (topic.substring(0, 2) === "__");
        if(!system && is_system) {
            continue;
        }
        let rows = schema_rows(descs[topic]);
        let color;
        if(is_system) {
            color = SYSTEM_TOPIC_COLOR;
        } else {
            color = topic_colors[idx % topic_colors.length];
            idx++;
        }
        cards[topic] = {rows: rows, size: card_size(rows), color: color};
    }

    /*
     *  Ports: a hook leaves on the right, an fkey arrives on the
     *  left, each at the height of its own row.
     */
    for(let topic of Object.keys(cards)) {
        let card = cards[topic];
        let [w, h] = card.size;
        let ports = [];
        for(let i = 0; i < card.rows.length; i++) {
            let row = card.rows[i];
            if(!row.is_hook && !row.is_fkey) {
                continue;
            }
            ports.push({
                key:       row.name,
                placement: [row.is_hook? 1 : 0, row_placement(i, h)],
                fill:      card.color,
                stroke:    getStrokeColor(card.color),
            });
        }
        nodes.push({
            id:   topic,
            type: "html",
            style: {
                size:      [w, h],
                dx:        -w / 2,
                dy:        -h / 2,
                innerHTML: build_card_innerHTML(topic, card.rows, card.color, dark),
                port:      ports.length > 0,
                ports:     ports,
                portR:     3,
                portLineWidth: 1,
            },
            /*  What a theme switch needs to repaint this card without
             *  rebuilding the graph (which would drop zoom/pan).  */
            data: {topic_name: topic, rows: card.rows, color: card.color},
        });
    }

    let edge_seen = {};
    let edges = [];
    let add_edge = (source, source_port, target, target_port) => {
        if(!cards[source] || !cards[target]) {
            return;
        }
        let key = `${source}|${source_port}|${target}|${target_port}`;
        if(edge_seen[key]) {
            return;
        }
        edge_seen[key] = true;
        edges.push({
            id:     key,
            type:   "cubic",
            source: source,
            target: target,
            style:  {sourcePort: source_port, targetPort: target_port},
        });
    };

    for(let topic of Object.keys(cards)) {
        let desc = descs[topic];
        if(!is_object(desc) || !Array.isArray(desc.cols)) {
            continue;
        }
        for(let col of desc.cols) {
            if(!is_object(col) || !col.id) {
                continue;
            }
            if(is_object(col.hook)) {
                /*  {child_topic: fkey_field_of_the_child}  */
                for(let child of Object.keys(col.hook)) {
                    add_edge(topic, col.id, child, col.hook[child]);
                }
            }
            if(is_object(col.fkey)) {
                /*  {parent_topic: hook_field_of_the_parent}  */
                for(let parent of Object.keys(col.fkey)) {
                    add_edge(parent, col.fkey[parent], topic, col.id);
                }
            }
        }
    }

    return {nodes: nodes, edges: edges};
}

/************************************************************
 *   The theme-dependent edge style, in ONE place: applied as
 *   the graph is built and re-applied on a theme switch
 *   (ac_theme), which restyles the LIVE graph — rebuilding it
 *   would drop the user's zoom/pan and any dragged node.
 ************************************************************/
function edge_style(dark)
{
    return {
        stroke:   dark ? "#7a8593" : "#9aa4b2",
        lineWidth: 1.2,
        endArrow: true,
    };
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

    let dark = yui_is_dark();
    let graph;
    try {
        graph = new Graph({
            container:  $container,
            autoResize: true,
            data:       data,
            edge: {
                style: edge_style(dark),
            },
            layout: {
                type:    "antv-dagre",
                rankdir: "LR",
                nodesep: 28,
                ranksep: 90,
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
 *   A topic node was clicked.
 *
 *   With a `node_route` the click IS a navigation and this view
 *   makes it: that is what the route was handed down for.
 *
 *   Without one it is still an action, and it can belong to
 *   whoever mounted this view — the schema editor draws the same
 *   picture inside its own screens, where a topic opens in place
 *   and no hash is involved. That host asks for it with
 *   `with_node_click` and DECLARES EV_NODE_CLICK in its own FSM,
 *   as with every event a child publishes.
 *
 *   It is opt-in and not the default for exactly that reason: the
 *   CHILD subscription model subscribes the host to ALL of this
 *   view's events, so publishing one unasked turns a click into
 *   "Event NOT DEFINED in state" in every host that never wanted
 *   it — the topics view that mounts this as its schema landing,
 *   and the offline demo that mounts it against a json file.
 ************************************************************/
function ac_node_click(gobj, event, kw, src)
{
    let topic = kw && kw.node_id;
    let route = gobj_read_str_attr(gobj, "node_route");

    if(!topic) {
        return 0;
    }
    if(!route) {
        if(gobj_read_bool_attr(gobj, "with_node_click")) {
            gobj_publish_event(gobj, "EV_NODE_CLICK", {topic: topic});
        }
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
 *   {theme: "dark"|"light"} — the app switched theme.
 *   A restyle, not new data: repaint the LIVE graph and redraw,
 *   so the user's zoom/pan and dragged nodes survive.  A rebuild
 *   is only right when there is no graph to restyle — the "no
 *   topics" empty state, whose message is built, not drawn.
 ************************************************************/
function ac_theme(gobj, event, kw, src)
{
    let priv = gobj.priv;
    let graph = priv.graph;

    if(!graph) {
        build_graph(gobj);
        return 0;
    }

    let dark = (kw && kw.theme) ? (kw.theme === "dark") : yui_is_dark();
    try {
        graph.setTheme(dark ? "dark" : "light");
        graph.setEdge({style: edge_style(dark)});

        /*  A card is HTML, so its colours live in its markup: repaint
         *  each one from the rows kept in its node data.  */
        let updates = [];
        for(let node of graph.getNodeData()) {
            let data = node.data;
            if(!is_object(data) || !Array.isArray(data.rows)) {
                continue;
            }
            updates.push({
                id: node.id,
                style: {
                    innerHTML: build_card_innerHTML(
                        data.topic_name, data.rows, data.color, dark
                    )
                }
            });
        }
        if(updates.length > 0) {
            graph.updateNodeData(updates);
        }

        graph.draw().catch((e) => {
            log_error(`${gobj_short_name(gobj)}: schema graph redraw failed: ${e}`);
        });
    } catch(e) {
        log_error(`${gobj_short_name(gobj)}: schema graph restyle failed: ${e}`);
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
            ["EV_THEME",        ac_theme,       null],
            ["EV_REBUILD",      ac_rebuild,     null],
        ]]
    ];

    const event_types = [
        /*  Sent to itself by the graph, and published to the host when no
         *  `node_route` was given: optional there, so no warning.  */
        ["EV_NODE_CLICK",   event_flag_t.EVF_OUTPUT_EVENT|event_flag_t.EVF_NO_WARN_SUBS],
        ["EV_SHOW",         0],
        ["EV_THEME",        0],
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
