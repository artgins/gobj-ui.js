/***********************************************************************
 *          c_yui_treedb_graph.js
 *
 *          Manage treedb topics with graphs
 *
 *          This gclass manages the communication between backend and graph gobj.
 *
 *          Copyright (c) 2021 Niyamaka.
 *          Copyright (c) 2025-2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {
    SDATA,
    SDATA_END,
    data_type_t,
    kw_flag_t,
    event_flag_t,
    sdata_flag_t,
    gclass_create,
    log_error,
    gobj_read_pointer_attr,
    gobj_parent,
    gobj_subscribe_event,
    gobj_name,
    clean_name,
    gobj_read_attr,
    gobj_write_attr,
    gobj_send_event,
    gobj_publish_event,
    gobj_find_service,
    createElement2,
    sprintf,
    kw_get_int,
    is_string,
    is_array,
    kw_get_str,
    kw_get_dict_value,
    gobj_short_name,
    gobj_read_str_attr,
    gobj_destroy,
    json_object_update,
    is_object,
    gobj_create_service,
    kwid_find_one_record,
    json_object_size,
    kw_set_dict_value,
    kw_clone_by_keys,
    treedb_get_field_desc,
    treedb_decoder_fkey,
    gobj_write_str_attr,
    gobj_command,
    msg_iev_get_stack,
    kw_get_dict,
    gobj_hsdata,
    msg_iev_write_key,
    log_warning,
    trace_json,
    json_object_update_missing,
    gobj_start,
    gobj_stop,
    gobj_is_running,
    gobj_current_state,
    is_gobj,
    gobj_is_destroying,
    log_info,
    trace_msg,
    refresh_language,
    gobj_unsubscribe_event,
    str_in_list,
    delete_from_list,
    gobj_save_persistent_attrs,
    gobj_read_bool_attr,
    json_size,
    escapeHtml,
    safeSrc,
    gclass_find_by_name,
    gobj_stop_children,
} from "@yuneta/gobj-js";

import {yui_toolbar} from "./yui_toolbar.js";
import {attach_clear} from "./yui_inputs.js";
import {register_c_g6_nodes_tree} from "./c_g6_nodes_tree.js";
import {
    removeChildElements,
    disableElements,
    enableElements,
    set_submit_state,
    set_active_state,
} from "./lib_graph.js";
import {yui_shell_show_error, yui_shell_show_modal, yui_shell_popup_layer} from "./shell_modals.js";
import {yui_shell_of, yui_shell_set_sub_routes} from "./c_yui_shell.js";

import {t} from "i18next";

/***************************************************************
 *              Constants
 ***************************************************************/
const GCLASS_NAME = "C_YUI_TREEDB_GRAPH";

/***************************************************************
 *              Data
 ***************************************************************/
const attrs_table = [
/*---------------- Public Attributes ----------------*/
SDATA(data_type_t.DTP_POINTER,  "subscriber",       0,  null,   "Subscriber of output events"),
SDATA(data_type_t.DTP_LIST,     "operation_modes",  0,
'["reading", "operation", "writing", "edition"]',
"Available **permission** or behaviour modes. These operation modes are required to be accomplish by the graph handler (G6 child). TODO permissions must match treedb permissions."),
SDATA(data_type_t.DTP_BOOLEAN,  "with_treedb_tables",0, false,  "Include treedb tables"),

/*---------------- User last selections  ----------------*/
SDATA(data_type_t.DTP_STRING,   "operation_mode",   sdata_flag_t.SDF_PERSIST, "reading", "Current operation mode (internal behaviour or role). Changed by the user trough the gui."),
SDATA(data_type_t.DTP_STRING,   "layout",           sdata_flag_t.SDF_PERSIST, "", "Current graph layout. User preference. Changed by the user through the gui."),

/*---------------- Remote Connection ----------------*/
SDATA(data_type_t.DTP_POINTER,  "gobj_remote_yuno", 0,  null,   "Remote Yuno to request data"),
SDATA(data_type_t.DTP_STRING,   "treedb_name",      0,  null,   "Remote service treedb name"),
SDATA(data_type_t.DTP_DICT,     "descs",            0,  null,   "Descriptions of topics obtained"),
SDATA(data_type_t.DTP_BOOLEAN,  "system",           0,  false,  "Manage system topics (true) or user topics (false)"),
SDATA(data_type_t.DTP_BOOLEAN,  "readonly",         0,  false,  "The whole treedb is read-only: the graph drops its `edition` mode (the only one that draws write affordances) and refuses every write event. Set it when this yuno is not the MASTER of the treedb's tranger -- only the master can write, and the yuno answers 'READ-ONLY' to a write since SDK 7.13.0 (ask `treedb-info`)"),
SDATA(data_type_t.DTP_STRING,   "back_route",       0,  "",     "Optional hash route for a '← topics' button back to the topics grid (host-supplied; empty = no button)"),
SDATA(data_type_t.DTP_STRING,   "base_route",       0,  "",     "This view's base route (host-supplied); used to declare its per-topic focus sub-routes to the site map (ROUTING.md contributor)."),
SDATA(data_type_t.DTP_DICT,     "records",          0,  "{}",   "Data of topics"),
SDATA(data_type_t.DTP_LIST,     "topics",           0,  "[]",   "List of topic objects"),

/*---------------- Sub-container ----------------*/
SDATA(data_type_t.DTP_POINTER,  "$container",       0,  null,   "Container element"),
SDATA(data_type_t.DTP_STRING,   "href",             0,  "",     "Tab href"),
SDATA(data_type_t.DTP_STRING,   "label",            0,  "",     "Tab label"),
SDATA(data_type_t.DTP_STRING,   "image",            0,  "",     "Tab image"),
SDATA(data_type_t.DTP_STRING,   "icon",             0,  "yi-question", "Tab icon"),

/*---------------- Particular Attributes ----------------*/
SDATA(data_type_t.DTP_POINTER,  "hook_data_viewer",     0,  null,   "GClass Manager/Viewer of hook data"),
SDATA(data_type_t.DTP_BOOLEAN,  "is_pinhold_window",    0,  false,  "Select default: window or container panel"),

SDATA(data_type_t.DTP_STRING,   "wide",                 0,  "40px", "Height of header"),
SDATA(data_type_t.DTP_STRING,   "padding",              0,  "m-1",  "Padding or margin value"),
SDATA(data_type_t.DTP_STRING,   "canvas_id",            0,  "",     "Canvas ID"),

SDATA_END()
];

let PRIVATE_DATA = {
    $container:         null,
    treedb_name:        "",
    gobj_remote_yuno:   null,
    descs:              null,
    topics:             [],
    records:            {},
    gobj_nodes_tree:    null,
    find_timer:         null,       // rate-limits the find box (see make_toolbar)
    focus_topic:        "",         // topic the graph is focused on (marks the legend)
    gobj_treedb_tables: null,
    hook_data_viewer:   null,
    json_gobj:          null,   /*  C_YUI_JSON viewer of the raw tranger (or null)  */
    json_win:           null,   /*  C_YUI_WINDOW hosting it, desktop (or null)  */
    json_modal:         null,   /*  shell modal hosting it, mobile (or null)  */
    with_treedb_tables: false,
    canvas_id:          null,
    operation_mode:     null,
    layout:             null,
    _topics_subscribed: {},
    _links_subscribed:  false,  /*  EV_TREEDB_NODE_LINKED/UNLINKED (treedb-wide)  */

    is_pinhold_window:  false, // inherited of v6, todo review
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

    if(!priv.treedb_name) {
        log_error(`${gobj_name(gobj)} -> treedb_name not configured`);
    }

    /*
     *  `edition` is the ONLY mode that draws write affordances, and the
     *  mode is a PERSISTED user preference: a graph that was left in
     *  edition on a master would come back in edition on a replica.
     *  Fall back to `reading` before the G6 child is born with it.
     */
    if(gobj_read_bool_attr(gobj, "readonly") && priv.operation_mode === "edition") {
        gobj_write_str_attr(gobj, "operation_mode", "reading");
    }

    /*
     *  set canvas_id, before build_ui()
     */
    let canvas_id = clean_name(gobj_name(gobj)) + "-canvas";
    gobj_write_attr(gobj, "canvas_id", canvas_id);

    /*
     *  Build UI
     */
    let $container = build_ui(gobj);

    /*
     *  Get canvas container
     */
    let $container_canvas = $container.querySelector(`#${priv.canvas_id}`);

    priv.gobj_nodes_tree = gobj_create_service(
        `${gobj_name(gobj)}-g6`,
        "C_G6_NODES_TREE",
        {
            $container: $container_canvas,
            subscriber: gobj,
            gobj_remote_yuno: priv.gobj_remote_yuno,
            treedb_name: priv.treedb_name,
            topics: priv.topics,
            operation_mode: priv.operation_mode,
            layout: priv.layout,
            // TODO review if needed
            // topics_style: priv.topics_style,
            with_treedb_tables: priv.with_treedb_tables,
            hook_port_position: "bottom",
            fkey_port_position: "top",
        },
        gobj
    );

    /*
     *  Populate layout dropdown from child's available layouts
     */
    populate_nodes_tree_options(gobj);

    /*
     *  Treedb tables at start
     */
    if(priv.with_treedb_tables) {
        // priv.gobj_treedb_tables = gobj_create_service( TODO
        //     "", // TODO build_name(self, "Topics"),
        //     "Ui_treedb_tables", // TODO
        //     {
        //         subscriber: gobj,
        //         with_treedb_tables: priv.with_treedb_tables,
        //         // hook_data_viewer: Ui_hook_viewer_popup, TODO
        //         gobj_remote_yuno: priv.gobj_remote_yuno,
        //         treedb_name: priv.treedb_name,
        //         topics: priv.topics,
        //     },
        //     gobj
        // );
    }
}

/***************************************************************
 *          Framework Method: Writing
 ***************************************************************/
function mt_writing(gobj, path)
{
    let priv = gobj.priv;
}

/***************************************************************
 *          Framework Method: Start
 ***************************************************************/
function mt_start(gobj)
{
    let priv = gobj.priv;

    if(priv.gobj_nodes_tree) {
        gobj_start(priv.gobj_nodes_tree);
    }
    if(priv.gobj_treedb_tables) {
        gobj_start(priv.gobj_treedb_tables);
    }

    request_treedb_descs(gobj);

    return 0;
}

/***************************************************************
 *          Framework Method: Stop
 ***************************************************************/
function mt_stop(gobj)
{
    let shell = yui_shell_of(gobj);
    if(shell) {
        yui_shell_set_sub_routes(shell, gobj_read_str_attr(gobj, "base_route"), null);
    }
    close_json_viewer(gobj);
    gobj_stop_children(gobj);
}

/***************************************************************
 *          Framework Method: Destroy
 ***************************************************************/
function mt_destroy(gobj)
{
    let priv = gobj.priv;
    /*  The find box rate-limits itself with a timer; a view torn down
     *  between the keystroke and the send would fire an event into a
     *  destroyed gobj. */
    if(priv.find_timer) {
        clearTimeout(priv.find_timer);
        priv.find_timer = null;
    }
    destroy_ui(gobj);
}




                    /***************************
                     *      Local Methods
                     ***************************/




/************************************************************
 *   Build UI
 ************************************************************/
function build_ui(gobj)
{
    let priv = gobj.priv;

    /*----------------------------------------------*
     *  Layout Schema
     *----------------------------------------------*/
    let padding = gobj_read_attr(gobj, "padding");
    let $toolbar = make_toolbar(gobj);

    /*  The back link is pinned in the row, BEFORE the toolbar, so the
     *  toolbar's horizontal scroll never carries it off-screen. */
    let $back = make_back_to_topics(gobj);
    let row_items = $back ? [$back, $toolbar] : [$toolbar];

    let $container = createElement2(
        // Don't use is-flex, don't work well with is-hidden
        ['div', {class: 'C_YUI_TREEDB_GRAPH', style: `height:100%; display:flex; flex-direction:column;`}, [
            ['div', {class: 'GRAPH_TOOLBAR_ROW is-flex-grow-0 is-flex is-align-items-center'}, row_items],
            /*  Topic colour legend: a strip, not an overlay. It is opened to
             *  be READ against the graph, and an overlay would cover the
             *  thing it explains. Built on first open (the colours are the
             *  child's, assigned when the schema arrives). */
            ['div', {class: 'GRAPH_LEGEND is-hidden is-flex-grow-0',
                     style: 'display:flex; flex-wrap:wrap; align-items:center; ' +
                            'gap:.4rem; padding:.35rem .5rem;'}, []],
            ['div', {class: `GRAPH_BODY is-flex-grow-1 ${padding}`, style: 'height:100%; min-height:0; overflow:hidden;'}, [
                ['div', {id: priv.canvas_id, class: `GRAPH_CANVAS graph-container`, style: 'height:100%; min-height:0;border: 1px solid var(--bulma-border-weak);border-radius:0.2rem;'}, [
                ]]
            ]]
        ]]
    );

    gobj_write_attr(gobj, "$container", $container);
    refresh_language($container, t);
    refresh_raw_json_button(gobj);  /*  disabled until the backend session is up  */
    return $container;
}

/************************************************************
 *  The "Raw JSON" viewer issues a remote print-tranger, so it only makes
 *  sense with a live backend session — the remote (C_IEVENT_CLI) is in
 *  ST_SESSION exactly while connected. Enable the button only then; native
 *  `disabled` dims it (Bulma) and blocks its click.
 ************************************************************/
function is_connected(gobj)
{
    let remote = gobj_read_pointer_attr(gobj, "gobj_remote_yuno");
    return !!remote && gobj_current_state(remote) === "ST_SESSION";
}

function refresh_raw_json_button(gobj, connected)
{
    let $container = gobj_read_attr(gobj, "$container");
    if(!$container) {
        return;
    }
    if(typeof connected !== "boolean") {
        connected = is_connected(gobj);
    }
    let $raw = $container.querySelector(".TREEDB_JSON_BTN");
    if($raw) {
        $raw.disabled = !connected;
    }
}

/************************************************************
 *  The host (C_TREEDB_VIEW) forwards the backend transport edges here so the
 *  "Raw JSON" button disables the moment the session drops and re-enables on
 *  reconnect. The library view must not subscribe to the C_IEVENT_CLI itself
 *  (that forwards the subscription upstream and breaks the session).
 ************************************************************/
function ac_transport_state(gobj, event, kw, src)
{
    refresh_raw_json_button(gobj, !!(kw && kw.connected));
    return 0;
}

/************************************************************
 *   Show a non-blocking inline error banner at the top of the view
 *   (used when the treedb schema `descs` cannot load). Reuses a single
 *   banner so retries don't stack.
 ************************************************************/
function show_load_error(gobj, message)
{
    let $container = gobj_read_attr(gobj, "$container");
    if(!$container) {
        return;
    }
    let $err = $container.querySelector(".GRAPH_LOAD_ERROR");
    if(!$err) {
        $err = createElement2(
            ["div", {class: "GRAPH_LOAD_ERROR notification is-danger is-light m-3"}, []]
        );
        $container.insertBefore($err, $container.firstChild);
    }
    let treedb = gobj_read_attr(gobj, "treedb_name") || "";
    $err.textContent = (treedb ? `${treedb}: ` : "") + (message || "cannot load treedb");
}

/************************************************************
 *   Destroy UI
 ************************************************************/
function destroy_ui(gobj)
{
    let $container = gobj_read_attr(gobj, "$container");
    if($container) {
        if($container.parentNode) {
            $container.parentNode.removeChild($container);
        }
        gobj_write_attr(gobj, "$container", null);
    }
}

/************************************************************
 *  The label of an option of the two selects of the toolbar.
 *
 *  Both of them used to render their RAW names -- `reading`,
 *  `edition`, `dagre`, `manual` -- in every language, because
 *  neither went through `t()` at all. Not a missing key: a
 *  missing call.
 *
 *  Written as one literal per case, and deliberately not as
 *  `t(name)`: a consumer's `validate-locales.mjs` reads
 *  LITERALS, so a variable key is invisible to it -- the app
 *  ships without the entry and nothing says so, because
 *  i18next answers an unknown key with the key itself, which
 *  is exactly the English word that was there before. The
 *  same reason the keys are listed in the README.
 *
 *  The default is what a host that adds a layout of its own
 *  gets: the name it chose, which is what all of them got
 *  until now.
 ************************************************************/
function option_label(name)
{
    switch(name) {
        /*  Operation modes (`operation_modes` attr).  */
        case "reading":
            return t("reading");
        case "operation":
            return t("operation");
        case "writing":
            return t("writing");
        case "edition":
            return t("edition");

        /*  Layouts (`layout_names` of the G6 child).  */
        case "manual":
            return t("manual");
        case "dagre":
            return t("dagre");
        case "antv-dagre":
            return t("antv-dagre");
        case "d3-force":
            return t("d3-force");
        case "force-atlas2":
            return t("force-atlas2");

        default:
            return name;
    }
}

/************************************************************
 *
 ************************************************************/
function make_toolbar(gobj)
{
    let priv = gobj.priv;

    /*---------------------------------------*
     *      Top Header toolbar
     *---------------------------------------*/
    let modes = gobj_read_attr(gobj, "operation_modes");
    if(gobj_read_bool_attr(gobj, "readonly")) {
        /*  A mode the user cannot have is not offered: `edition` is the
         *  one that draws the create / delete / link affordances.  */
        modes = modes.filter(mode => mode !== "edition");
    }
    /*  `value` EXPLICIT, and that is not decoration: an <option>
     *  with no value attribute answers with its own TEXT, so the
     *  moment the label is translated `evt.target.value` becomes
     *  "Edición" and the mode the FSM is told to enter is a word
     *  no `switch` of this gclass knows.  */
    let mode_options = modes.map(item =>
        ['option', {value: item, 'data-i18n': item}, option_label(item)]
    );

    /*
     *  Left: layout and mode selectors
     *  Layout options are empty — populated after child creation
     *  via populate_nodes_tree_options()
     */
    let left_items = [
        ['span', {class: 'GRAPH_LAYOUT_LABEL is-hidden-mobile', style: 'padding-right:5px;', i18n: 'layout'}, 'layout'],
        ['div', {class: 'select'}, [
            ['select', {class: 'GRAPH_LAYOUT_SELECT'}]
        ], {
            change: (evt) => {
                evt.stopPropagation();
                gobj_send_event(gobj, "EV_SET_LAYOUT", {layout: evt.target.value}, gobj);
            }
        }],

        ['span', {class: 'GRAPH_MODE_LABEL is-hidden-mobile', style: 'padding-left:10px; padding-right:5px;', i18n: 'operation mode'}, 'operation mode'],
        ['div', {class: 'select'}, [
            ['select', {class: 'GRAPH_MODE_SELECT'}, mode_options]
        ], {
            change: (evt) => {
                evt.stopPropagation();
                gobj_send_event(gobj, "EV_SET_OPERATION_MODE", {operation_mode: evt.target.value}, gobj);
            }
        }],

        ['button', {class: 'GRAPH_REFRESH button'}, [
            ['i', {class: 'yi-arrows-rotate'}],
            ['span', {class: 'is-hidden-mobile', style: 'padding-left:5px;', i18n: 'refresh'}, 'refresh']
        ], {
            click: (evt) => {
                evt.stopPropagation();
                gobj_send_event(gobj, "EV_REFRESH_TREEDB", {evt}, gobj);
            }
        }],

        /*  Which colour is which topic. The port colour of a node encodes
         *  the topic it links to, which is the whole point of the graph and
         *  which nothing on screen explained. Clicking an entry focuses that
         *  topic, so the legend is also the way to say "show me these" —
         *  and clicking the focused one again clears it.  */
        ['button', {class: 'GRAPH_LEGEND_BTN button ml-2',
                    title: t('legend'), 'aria-label': t('legend'),
                    'data-i18n-title': 'legend', 'data-i18n-aria-label': 'legend'}, [
            ['i', {class: 'yi-square'}],
            ['span', {class: 'is-hidden-mobile', style: 'padding-left:5px;', i18n: 'legend'}, 'legend']
        ], {
            click: (evt) => {
                evt.stopPropagation();
                gobj_send_event(gobj, "EV_TOGGLE_LEGEND", {}, gobj);
            }
        }],

        /*  Inspect the treedb's raw tranger json in the lazy tree viewer
         *  (print-tranger on the C_NODE service). A treedb can be huge, so
         *  the viewer drills in on demand — see open_json_viewer.  */
        ['button', {class: 'button ml-2 TREEDB_JSON_BTN',
                    title: t('raw json'), 'aria-label': t('raw json'),
                    'data-i18n-title': 'raw json', 'data-i18n-aria-label': 'raw json'}, [
            ['i', {class: 'yi-eye'}],
            ['span', {class: 'is-hidden-mobile', style: 'padding-left:5px;', i18n: 'raw json'}, 'raw json']
        ], {
            click: (evt) => {
                evt.stopPropagation();
                gobj_send_event(gobj, "EV_OPEN_JSON", {}, gobj);
            }
        }],
    ];

    /*
     *  Center: find a node.
     *
     *  A graph of a few hundred records has no other way in: the only way
     *  to locate one was to read every card. The box highlights every
     *  match with the same amber the topic focus uses and centres the
     *  viewport on them, and it SAYS how many it found — a graph that did
     *  not move looks the same whether nothing matched or the match was
     *  already on screen.
     */
    /*  Materialised, not a spec: attach_clear() hangs the NORM clear (✕)
     *  on a real element.  Clearing dispatches a synthetic `input`, which
     *  goes through the same rate-limited handler and fires EV_FIND_NODES
     *  with an empty term — the box and the highlight clear together.  */
    let $find_input = createElement2(
        ['input', {
            class: 'GRAPH_FIND_INPUT input',
            type: 'text',
            /*  A placeholder is not a text node, so the data-i18n walk
             *  cannot reach it: it needs its own key. */
            placeholder: t('search'),
            'data-i18n-placeholder': 'search',
            'aria-label': t('search'),
            'data-i18n-aria-label': 'search'
        }, [], {
            /*  Rate-limited, not delayed for effect: a match repaints the
             *  cards it lands on, and on a large treedb the first letter
             *  typed can match hundreds. This is input plumbing — the
             *  event still carries every action to the FSM, just not one
             *  per keystroke. */
            input: (evt) => {
                evt.stopPropagation();
                let text = evt.target.value.trim();
                if(priv.find_timer) {
                    clearTimeout(priv.find_timer);
                }
                priv.find_timer = setTimeout(function() {
                    priv.find_timer = null;
                    gobj_send_event(gobj, "EV_FIND_NODES", {text: text}, gobj);
                }, 250);
            }
        }]);

    let $find_control = createElement2(
        ['div', {class: 'GRAPH_FIND control has-icons-left',
                 style: 'margin-right:.5rem; max-width:12rem; min-width:7rem;'}, [
            $find_input,
            ['span', {class: 'icon is-left'}, [['i', {class: 'yi-magnifying-glass'}]]]
        ]]);
    attach_clear($find_control, $find_input);

    let center_items = [
        $find_control,
        /*  ONE counted span, not a number beside a word: "1 matches" is
         *  what two spans always produce, because nothing there can see
         *  the count. `t(key, {count})` picks `matches_one` for one and
         *  falls back to the base key for the rest, in both languages.
         *  No `i18n` attribute on it: refresh_language() would call t()
         *  WITHOUT the count and put the plural back over the singular.
         *  Nothing re-translates it, so it is repainted on the next
         *  find, and it is hidden while the box is empty.  */
        /*  `display:flex` inline and NOT the `is-flex` helper: both Bulma
         *  helpers carry !important, so `is-hidden is-flex` on one element
         *  is decided by whichever lands later in the stylesheet — and the
         *  count showed with an empty box. An inline rule loses to
         *  `is-hidden`'s !important and applies the moment it is removed,
         *  which is the toggle this needs. */
        ['div', {class: 'GRAPH_FIND_RESULT is-hidden',
                 style: 'display:flex; align-items:center; gap:.3rem; ' +
                        'margin-right:.5rem; font-size:.85rem;'}, [
            ['span', {class: 'GRAPH_FIND_COUNT'}, '']
        ]]
    ];

    /*
     *  Right, fill in set_mode
     */
    let right_items = [
    ];

    const $toolbar_header = yui_toolbar({}, [
        ['div', {class: 'yui-horizontal-toolbar-section left'}, left_items],
        ['div', {class: 'yui-horizontal-toolbar-section center'}, center_items],
        ['div', {class: 'GRAPH_MODE_BUTTONS yui-horizontal-toolbar-section right'}, right_items]
    ]);

    refresh_language($toolbar_header, t);

    return $toolbar_header;
}

/************************************************************
 *  "← topics": a real hash link back to the topics grid (host-supplied
 *  `back_route`), shown only when set. Lets a graph reached from a topic
 *  card's graph icon return to the cards landing — symmetric with the
 *  topics view's own back button. Absent (e.g. wattyzer) ⇒ no button.
 *
 *  It is deliberately NOT a toolbar item: yui_toolbar() lays its items in
 *  a horizontally SCROLLING container, and this is the only control here
 *  that leaves the view instead of acting on the graph — a way out cannot
 *  depend on where the toolbar happens to be scrolled. It sits pinned
 *  ahead of the toolbar, on the same row (see build_ui), like the topics
 *  view's back button, whose plain non-scrolling strip never moves.
 ************************************************************/
function make_back_to_topics(gobj)
{
    let back_route = gobj_read_attr(gobj, "back_route") || "";
    if(!back_route) {
        return null;
    }

    let $back = createElement2(
        ['a', {class: 'GRAPH_BACK_TOPICS button ml-1 mr-1 is-flex-shrink-0',
               href: back_route,
               title: t('topics'), 'aria-label': t('topics'),
               'data-i18n-title': 'topics', 'data-i18n-aria-label': 'topics'}, [
            ['span', {class: 'icon'}, [['i', {class: 'yi-arrow-left'}]]],
            ['span', {class: 'is-hidden-mobile', style: 'padding-left:5px;',
                      i18n: 'topics'}, 'topics']
        ]]
    );
    refresh_language($back, t);

    return $back;
}

/************************************************************
 *  True on a phone-width viewport (Bulma's mobile breakpoint).
 ************************************************************/
function is_mobile()
{
    return typeof window !== "undefined" && window.innerWidth <= 768;
}

/************************************************************
 *  Raw-tranger JSON viewer: a C_YUI_JSON driving its own DOM, hosted in a
 *  moveable C_YUI_WINDOW on desktop / an adaptive modal sheet on mobile. It
 *  is a helper of THIS view (CHILD model: it publishes EV_EXPAND_PATH back
 *  to us), single at a time.
 *
 *  A treedb's tranger can be enormous, so the first fetch is collapsed
 *  (print-tranger with lists/dicts limits) and the viewer drills in on
 *  demand: EV_EXPAND_PATH -> print-tranger path=<path> -> EV_SUBTREE_LOADED.
 *
 *  print-tranger must exist on the backend C_NODE service (SDK >= the
 *  release that added it); against an older backend the command answers
 *  "command not found" and the viewer shows that error.
 ************************************************************/
function open_json_viewer(gobj)
{
    let priv = gobj.priv;
    if(priv.json_win || priv.json_modal) {
        return;     /*  already open  */
    }
    if(!gclass_find_by_name("C_YUI_JSON")) {
        log_error(`${gobj_short_name(gobj)}: C_YUI_JSON not registered by the app`);
        yui_shell_show_error(yui_shell_of(gobj), "raw json viewer unavailable", {t: t});
        return;
    }

    let mobile = is_mobile();
    let shell = yui_shell_of(gobj);

    let jv = gobj_create_service(
        `treedb-json-${clean_name(gobj_name(gobj))}`,
        "C_YUI_JSON",
        {
            /*  No `title`: the host titles it — the window's title bar on
             *  desktop, the dialog's header on mobile. The viewer's own
             *  title would land INSIDE that host, doubling it.  */
            subscriber: gobj        /*  publishes EV_EXPAND_PATH to us  */
        },
        gobj
    );
    if(!jv) {
        log_error(`${gobj_short_name(gobj)}: cannot create the JSON viewer`);
        return;
    }
    priv.json_gobj = jv;

    /*  CREATED, not started. `mt_create` builds the DOM; `mt_start`
     *  RENDERS it -- and the viewer's graph view measures a canvas and
     *  puts a ResizeObserver on it, both of which need the element to be
     *  in the document, which the presenter below is what does. Started
     *  here it worked only while the reader had last used the tree view;
     *  with the graph view remembered it built detached, attached no
     *  observer, and the canvas never followed the window again.  */
    let $box = gobj_read_pointer_attr(jv, "$container");

    if(mobile) {
        if(!shell) {
            log_error(`${gobj_short_name(gobj)}: no shell, cannot open the JSON sheet`);
            close_json_viewer(gobj);
            return;
        }
        priv.json_modal = yui_shell_show_modal(shell, $box, {
            dialog:        true,
            logical_class: "TREEDB_JSON_SHEET",
            title_prefix: priv.treedb_name,
            title:         "raw json",
            t:             t,
            on_close: () => {
                if(gobj_is_destroying(gobj)) {
                    return;
                }
                gobj_send_event(gobj, "EV_JSON_CLOSED", {}, gobj);
            }
        });
        gobj_start(jv);     /*  mounted: now it can measure itself  */
    } else {
        let $win_parent = (shell && yui_shell_popup_layer(shell)) ||
            (typeof document !== "undefined" && document.getElementById("top-layer")) ||
            null;

        priv.json_win = gobj_create_service(
            `treedb-jsonwin-${clean_name(gobj_name(gobj))}`,
            "C_YUI_WINDOW",
            {
                $parent:    $win_parent,
                subscriber: null,
                modal:      false,
                showMax:    true,
                showFooter: false,
                resizable:  true,
                center:     true,
                auto_save_size_and_position: true,
                width:      640,
                height:     620,
                logical_class: "TREEDB_JSON_WINDOW",
                title_prefix: priv.treedb_name,
                title:      "raw json",
                icon:       "yi-eye",
                body:       $box,
                manager:    null,
                on_close: () => {
                    if(gobj_is_destroying(gobj)) {
                        return;
                    }
                    gobj_send_event(gobj, "EV_JSON_CLOSED", {}, gobj);
                }
            },
            gobj
        );
        if(!priv.json_win) {
            log_error(`${gobj_short_name(gobj)}: cannot create the JSON window`);
            close_json_viewer(gobj);
            return;
        }
        gobj_start(priv.json_win);
        gobj_start(jv);     /*  mounted: now it can measure itself  */
    }

    request_print_tranger(gobj, "");    /*  first fetch: whole tranger, collapsed  */
}

/************************************************************
 *  Close the JSON viewer (user dismiss / teardown). Destroys the viewer
 *  gobj and whichever presenter is up, then clears the refs.
 ************************************************************/
function close_json_viewer(gobj)
{
    let priv = gobj.priv;
    let jv = priv.json_gobj;
    let win = priv.json_win;
    let modal = priv.json_modal;

    priv.json_gobj = null;
    priv.json_win = null;
    priv.json_modal = null;

    if(win && is_gobj(win)) {
        try {
            /*  STOP, then destroy — same rule as the viewer below: the
             *  window was STARTED on open, and gobj_destroy() raises the
             *  `destroying` flag before it can stop a running gobj, so
             *  destroying it straight logs two errors and skips mt_stop.
             *  The ✕ path already stopped it (close_window) — guard. */
            if(gobj_is_running(win)) {
                gobj_stop(win);
            }
            gobj_destroy(win);
        } catch(e) {
            log_warning(`${gobj_short_name(gobj)}: already gone: ${e}`);
        }
    }
    if(modal && typeof modal.close === "function") {
        try {
            modal.close();
        } catch(e) {
            log_warning(`${gobj_short_name(gobj)}: already gone: ${e}`);
        }
    }
    if(jv && is_gobj(jv)) {
        try {
            /*  STOP, then destroy: gobj_destroy() raises the `destroying`
             *  flag before it can stop a running gobj, so destroying it
             *  straight logs "Destroying a RUNNING gobj" + "gobj NULL or
             *  DESTROYED" and skips its mt_stop. GUARDED, because the
             *  viewer is now started AFTER its presenter is up: the two
             *  failure paths that get here arrive with it created and
             *  never started. */
            if(gobj_is_running(jv)) {
                gobj_stop(jv);
            }
            gobj_destroy(jv);
        } catch(e) {
            log_warning(`${gobj_short_name(gobj)}: already gone: ${e}`);
        }
    }
}

/************************************************************
 *  Fetch the treedb's raw tranger (or one subtree when `path` is set) as
 *  bounded, drillable JSON. Collapsed at 100 so a huge tranger stays a
 *  small payload of `__collapsed__` stubs the viewer expands on demand.
 ************************************************************/
function request_print_tranger(gobj, path)
{
    let priv = gobj.priv;
    if(!priv.gobj_remote_yuno) {
        log_error(`${gobj_short_name(gobj)}: No gobj_remote_yuno defined`);
        let jv = priv.json_gobj;
        if(path && jv && is_gobj(jv) && !gobj_is_destroying(jv)) {
            gobj_send_event(jv, "EV_SUBTREE_ERROR",
                {path: path, error: t("no session")}, gobj);
        }
        return;
    }
    let ret = gobj_command(priv.gobj_remote_yuno, "print-tranger",
        {
            service:     priv.treedb_name,
            expanded:    1,
            lists_limit: 100,
            dicts_limit: 100,
            path:        path || ""
        }, gobj);
    if(ret) {
        log_error(ret);
    }
}

/************************************************************
 *  Populate layout dropdown from child's available layouts
 ************************************************************/
function populate_nodes_tree_options(gobj)
{
    let priv = gobj.priv;
    let $container = priv.$container;

    let layout_names = gobj_read_attr(priv.gobj_nodes_tree, "layout_names");
    let $layout_select = $container.querySelector('.GRAPH_LAYOUT_SELECT');
    if($layout_select && layout_names) {
        for(let name of layout_names) {
            let option = document.createElement('option');
            option.value = name;
            /*  The key travels in the attribute so a language change
             *  re-translates it: `refresh_language()` only touches a
             *  node that carries its own key, and this select is built
             *  once, after the child answers with its layouts.  */
            option.setAttribute('data-i18n', name);
            option.textContent = option_label(name);
            $layout_select.appendChild(option);
        }
        // Restore persisted layout selection
        let current_layout = gobj_read_str_attr(priv.gobj_nodes_tree, "layout");
        if(current_layout) {
            $layout_select.value = current_layout;
        }
    }

    // Restore persisted operation_mode selection
    let $operation_mode_select = $container.querySelector('.GRAPH_MODE_SELECT');
    $operation_mode_select.value = priv.operation_mode;
}

/************************************************************
 *  Command to remote service
 *  Get nodes of a topic
 ************************************************************/
function treedb_nodes(gobj, treedb_name, topic_name, options)
{
    let priv = gobj.priv;

    if(!priv.gobj_remote_yuno) {
        log_error(`${gobj_short_name(gobj)}: No gobj_remote_yuno defined`);
        return;
    }

    let command = "nodes";

    let kw = {
        service: treedb_name,
        treedb_name: treedb_name,
        topic_name: topic_name,
        options: options || {}
    };

    kw.__md_command__ = { // Data to be returned
        topic_name: topic_name,
    };

    let ret = gobj_command(priv.gobj_remote_yuno,
        command,
        kw,
        gobj
    );
    if(ret) {
        log_error(ret);
    }
}

/************************************************************
 *  Command to remote service: re-read ONE node (by id).
 *
 *  Used to resync a node whose links changed: the answer is fed to the
 *  nodes-tree as EV_NODE_UPDATED, whose fkey diff (old vs new refs) is what
 *  draws or clears the edge. Reusing that path keeps the tree the single
 *  owner of the edge model — the alternative (deriving the edge here from
 *  the event's parent/child ids) would duplicate it.
 ************************************************************/
function treedb_get_node(gobj, treedb_name, topic_name, node_id)
{
    let priv = gobj.priv;

    if(!priv.gobj_remote_yuno) {
        log_error(`${gobj_short_name(gobj)}: No gobj_remote_yuno defined`);
        return;
    }

    let kw = {
        service: treedb_name,
        treedb_name: treedb_name,
        topic_name: topic_name,
        node_id: node_id,
        options: {
            list_dict: true     /*  same shape as the initial `nodes` load  */
        }
    };

    kw.__md_command__ = { // Data to be returned
        topic_name: topic_name,
    };

    let ret = gobj_command(priv.gobj_remote_yuno,
        "node",
        kw,
        gobj
    );
    if(ret) {
        log_error(ret);
    }
}

/************************************************************
 *  Command to remote service
 ************************************************************/
function treedb_create_node(gobj, treedb_name, topic_name, record, options)
{
    let priv = gobj.priv;

    if(!priv.gobj_remote_yuno) {
        log_error(`${gobj_short_name(gobj)}: No gobj_remote_yuno defined`);
        return;
    }

    let command = "create-node";

    let kw = {
        service: treedb_name,
        treedb_name: treedb_name,
        topic_name: topic_name,
        record: record,
        options: options || {}
    };

    kw.__md_command__ = { // Data to be returned
        topic_name: topic_name,
    };

    let ret = gobj_command(priv.gobj_remote_yuno,
        command,
        kw,
        gobj
    );
    if(ret) {
        log_error(ret);
    }
}

/************************************************************
 *  Command to remote service
 ************************************************************/
function treedb_update_node(gobj, treedb_name, topic_name, record, options)
{
    let priv = gobj.priv;

    if(!priv.gobj_remote_yuno) {
        log_error(`${gobj_short_name(gobj)}: No gobj_remote_yuno defined`);
        return;
    }

    let command = "update-node";

    let kw = {
        service: treedb_name,
        treedb_name: treedb_name,
        topic_name: topic_name,
        record: record,
        options: options || {}
    };

    kw.__md_command__ = { // Data to be returned
        topic_name: topic_name,
    };

    let ret = gobj_command(priv.gobj_remote_yuno,
        command,
        kw,
        gobj
    );
    if(ret) {
        log_error(ret);
    }
}

/************************************************************
 *  Command to remote service
 ************************************************************/
function treedb_delete_node(gobj, treedb_name, topic_name, record, options)
{
    let priv = gobj.priv;

    if(!priv.gobj_remote_yuno) {
        log_error(`${gobj_short_name(gobj)}: No gobj_remote_yuno defined`);
        return;
    }

    let command = "delete-node";

    let kw = {
        service: treedb_name,
        treedb_name: treedb_name,
        topic_name: topic_name,
        record: record,
        options: options || {}
    };

    kw.__md_command__ = { // Data to be returned
        topic_name: topic_name,
    };

    let ret = gobj_command(priv.gobj_remote_yuno,
        command,
        kw,
        gobj
    );
    if(ret) {
        log_error(ret);
    }
}

/************************************************************
 *  Command to remote service
 ************************************************************/
function treedb_link_nodes(gobj, treedb_name, parent_ref, child_ref, options)
{
    let priv = gobj.priv;

    if(!priv.gobj_remote_yuno) {
        log_error(`${gobj_short_name(gobj)}: No gobj_remote_yuno defined`);
        return;
    }

    let command = "link-nodes";

    let kw = {
        service: treedb_name,
        treedb_name: treedb_name,
        parent_ref: parent_ref,
        child_ref: child_ref,
        options: options || {}
    };

    let ret = gobj_command(priv.gobj_remote_yuno,
        command,
        kw,
        gobj
    );
    if(ret) {
        log_error(ret);
    }
}

/************************************************************
 *  Command to remote service
 ************************************************************/
function treedb_unlink_nodes(gobj, treedb_name, parent_ref, child_ref, options)
{
    let priv = gobj.priv;

    if(!priv.gobj_remote_yuno) {
        log_error(`${gobj_short_name(gobj)}: No gobj_remote_yuno defined`);
        return;
    }

    let command = "unlink-nodes";

    let kw = {
        service: treedb_name,
        treedb_name: treedb_name,
        parent_ref: parent_ref,
        child_ref: child_ref,
        options: options || {}
    };

    let ret = gobj_command(priv.gobj_remote_yuno,
        command,
        kw,
        gobj
    );
    if(ret) {
        log_error(ret);
    }
}

/************************************************************
 *  Command to remote service
 ************************************************************/
function request_treedb_descs(gobj)
{
    let priv = gobj.priv;

    if(!priv.gobj_remote_yuno) {
        log_error(`${gobj_short_name(gobj)}: No gobj_remote_yuno defined`);
        return;
    }

    let command = "descs";

    let kw = {
        service: priv.treedb_name,
        treedb_name: priv.treedb_name
    };

    let ret = gobj_command(priv.gobj_remote_yuno,
        command,
        kw,
        gobj
    );
    if(ret) {
        log_error(ret);
    }
}

/************************************************************
 *  Process topic descriptions received from remote
 ************************************************************/
function process_treedb_descs(gobj, descs)
{
    let priv = gobj.priv;

    gobj_write_attr(gobj, "descs", descs);  // TRIGGER POINT: Topics cleared

    /*
     *  descs is a dict: { __snaps__: {…}, roles: {…}, users: {…} }
     */

    if(priv.gobj_nodes_tree) {
        gobj_send_event(priv.gobj_nodes_tree,
            "EV_DESCS",
            descs,
            gobj
        );
    }

    /*
     *  System topics
     *  Get firstly __graphs__, it contains data to personalize graph nodes
     */
    for(const topic_name of Object.keys(descs)) {
        if(topic_name.substring(0, 2) === "__") {
            /*
             *  Only get __graphs__
             */
            if(topic_name === '__graphs__') {
                get_nodes(gobj, topic_name);
            }
        }
    }

    /*
     *  User topics
     */
    for(const [topic_name, desc] of Object.entries(descs)) {
        if(topic_name.substring(0, 2) === "__") {
            continue;   // ignore system topics
        }
        //create_combo(gobj, desc);
        get_nodes(gobj, topic_name);
    }

    /*  Declare per-topic focus sub-routes to the site map (ROUTING.md). */
    register_sub_routes(gobj);
}

/************************************************************
 *  Declare this graph's per-topic focus sub-routes to the site map.
 *  Route-agnostic except for the host-supplied `base_route`. Cleared
 *  on stop.
 ************************************************************/
function register_sub_routes(gobj)
{
    let shell = yui_shell_of(gobj);
    let base = gobj_read_str_attr(gobj, "base_route");
    if(!shell || !base) {
        return;
    }
    let descs = gobj_read_attr(gobj, "descs");
    let system = gobj_read_bool_attr(gobj, "system");
    let nodes = [];
    if(descs) {
        for(const topic of Object.keys(descs)) {
            if(!system && topic.substring(0, 2) === "__") {
                continue;
            }
            nodes.push({route: base + "/" + topic, label: topic,
                        icon: "yi-hexagon-nodes", gclass: GCLASS_NAME});
        }
    }
    yui_shell_set_sub_routes(shell, base, nodes);
}

/************************************************************
 *
 ************************************************************/
function get_nodes(gobj, topic_name)
{
    let priv = gobj.priv;
    const treedb_name = priv.treedb_name;

    subscribe_treedb(gobj, topic_name);

    /*
     *  Get data
     */
    treedb_nodes(
        gobj,
        treedb_name,
        topic_name,
        {
            list_dict: true
        }
    );
}

/************************************************************
 *  EV_TREEDB_NODE_LINKED / EV_TREEDB_NODE_UNLINKED are TREEDB-wide, not
 *  per-topic: their kw is the RELATIONSHIP
 *  ({hook_name, parent_topic_name, child_topic_name, parent_id, child_id,
 *  treedb_name}), with no `topic_name` — so they are subscribed ONCE, and
 *  filtered by treedb_name alone (a {topic_name} filter would match nothing).
 *
 *  NOTE: the backend only publishes them when its C_NODE service is
 *  configured with `with_link_events` (SDF_RD, default FALSE). Without it,
 *  a link/unlink is announced the backward-compatible way — an
 *  EV_TREEDB_NODE_UPDATED of the PARENT — which cannot move an edge here:
 *  an edge IS a fkey of the CHILD (link-saves-child), and the parent's fkeys
 *  did not change. That is why an open Graph kept showing stale edges when
 *  another operator linked two nodes.
 ************************************************************/
function subscribe_treedb_links(gobj)
{
    let priv = gobj.priv;
    if(priv._links_subscribed) {
        return;
    }
    priv._links_subscribed = true;

    for(let event of ["EV_TREEDB_NODE_LINKED", "EV_TREEDB_NODE_UNLINKED"]) {
        gobj_subscribe_event(priv.gobj_remote_yuno,
            event,
            {
                __service__: priv.treedb_name,
                __filter__: {
                    "treedb_name": priv.treedb_name
                }
            },
            gobj
        );
    }
}

/************************************************************
 *
 ************************************************************/
function subscribe_treedb(gobj, topic_name)
{
    let priv = gobj.priv;
    const gobj_remote_yuno = priv.gobj_remote_yuno;
    const treedb_name = priv.treedb_name;

    subscribe_treedb_links(gobj);

    /*
     *  Avoid repetitions of subscribings
     */
    if(priv._topics_subscribed[topic_name]) {
        return;
    }
    priv._topics_subscribed[topic_name] = true;

    gobj_subscribe_event(gobj_remote_yuno,
        "EV_TREEDB_NODE_CREATED",
        {
            __service__: treedb_name,
            __filter__: {
                "treedb_name": treedb_name,
                "topic_name": topic_name
            }
        },
        gobj
    );
    gobj_subscribe_event(gobj_remote_yuno,
        "EV_TREEDB_NODE_UPDATED",
        {
            __service__: treedb_name,
            __filter__: {
                "treedb_name": treedb_name,
                "topic_name": topic_name
            }
        },
        gobj
    );
    gobj_subscribe_event(gobj_remote_yuno,
        "EV_TREEDB_NODE_DELETED",
        {
            __service__: treedb_name,
            __filter__: {
                "treedb_name": treedb_name,
                "topic_name": topic_name
            }
        },
        gobj
    );
}

/************************************************************
 *
 ************************************************************/
function unsubscribe_treedb(gobj, topic_name)
{
    let priv = gobj.priv;
    const gobj_remote_yuno = priv.gobj_remote_yuno;
    const treedb_name = priv.treedb_name;

    /*
     *  Avoid repetitions of unsubscribings
     */
    if(!priv._topics_subscribed[topic_name]) {
        return;
    }
    priv._topics_subscribed[topic_name] = false;

    gobj_unsubscribe_event(gobj_remote_yuno,
        "EV_TREEDB_NODE_CREATED",
        {
            __service__: treedb_name,
            __filter__: {
                "treedb_name": treedb_name,
                "topic_name": topic_name
            }
        },
        gobj
    );
    gobj_unsubscribe_event(gobj_remote_yuno,
        "EV_TREEDB_NODE_UPDATED",
        {
            __service__: treedb_name,
            __filter__: {
                "treedb_name": treedb_name,
                "topic_name": topic_name
            }
        },
        gobj
    );
    gobj_unsubscribe_event(gobj_remote_yuno,
        "EV_TREEDB_NODE_DELETED",
        {
            __service__: treedb_name,
            __filter__: {
                "treedb_name": treedb_name,
                "topic_name": topic_name
            }
        },
        gobj
    );

    /*  The treedb-wide LINKED/UNLINKED subscription rides the per-topic
     *  ones: when the last topic goes, it goes too — otherwise it outlives
     *  every view of the treedb and keeps pushing events nobody will use
     *  (the handler's _topics_subscribed guards make them no-ops, but the
     *  traffic still crosses the wire).  */
    let any_left = false;
    for(let k in priv._topics_subscribed) {
        if(priv._topics_subscribed[k]) {
            any_left = true;
            break;
        }
    }
    if(!any_left && priv._links_subscribed) {
        priv._links_subscribed = false;
        for(let ev of ["EV_TREEDB_NODE_LINKED", "EV_TREEDB_NODE_UNLINKED"]) {
            gobj_unsubscribe_event(gobj_remote_yuno,
                ev,
                {
                    __service__: treedb_name,
                    __filter__: {
                        "treedb_name": treedb_name
                    }
                },
                gobj
            );
        }
    }
}

/********************************************
 *  Refresh data from remote
 ********************************************/
function refresh_data(gobj)
{
    let priv = gobj.priv;

    if(priv.gobj_nodes_tree) { // TODO must do clear_graph(gobj)
        gobj_send_event(priv.gobj_nodes_tree,
            "EV_CLEAR_DATA",
            {},
            gobj
        );
    }
    request_treedb_descs(gobj);
}

/********************************************
 *  The last gate before a write leaves for the yuno. The `edition`
 *  mode is gone on a replica, so no button can raise these -- but the
 *  G6 child also publishes them from its undo/redo history and from
 *  saving the node geometry, and a write that got this far would
 *  travel, be refused by the yuno, and come back as a toast with the
 *  graph already redrawn.
 ********************************************/
function refuse_if_readonly(gobj, event)
{
    if(!gobj_read_bool_attr(gobj, "readonly")) {
        return false;
    }
    log_error(`${gobj_short_name(gobj)}: ${event} refused, treedb ` +
        `'${gobj_read_str_attr(gobj, "treedb_name")}' is READ-ONLY`);
    return true;
}




                    /***************************
                     *      Actions
                     ***************************/




/********************************************
 *  Remote response
 ********************************************/
function ac_mt_command_answer(gobj, event, kw, src)
{
    let priv = gobj.priv;

    let result;
    let comment;
    let schema;
    let data;

    try {
        result = kw.result;
        comment = kw.comment;
        schema = kw.schema;
        data = kw.data;
    } catch (e) {
        log_error(e);
        return -1;
    }
    let __command__ = msg_iev_get_stack(gobj, kw, "command_stack", true);
    let command = kw_get_str(gobj, __command__, "command", "", kw_flag_t.KW_REQUIRED);
    let kw_command = kw_get_dict(gobj, __command__, "kw", {}, kw_flag_t.KW_REQUIRED);

    /*
     *  print-tranger feeds the raw-JSON viewer, correlated by the echoed
     *  `path`: empty = first whole-tranger fetch (EV_SET_JSON), a set path =
     *  a lazy drill (EV_SUBTREE_LOADED). Handled before the generic error
     *  path so a failed drill marks its own branch, not the whole view.
     */
    if(command === "print-tranger") {
        let jv = priv.json_gobj;
        if(!jv || !is_gobj(jv) || gobj_is_destroying(jv)) {
            return 0;   /*  viewer closed before its answer landed: benign  */
        }
        let path = kw_get_str(gobj, kw_command, "path", "", 0);
        if(result < 0) {
            if(path) {
                gobj_send_event(jv, "EV_SUBTREE_ERROR",
                    {path: path, error: comment || "print-tranger failed"}, gobj);
            } else {
                yui_shell_show_error(yui_shell_of(gobj),
                    comment || "print-tranger failed", {t: t});
            }
            return 0;
        }
        if(path) {
            gobj_send_event(jv, "EV_SUBTREE_LOADED", {path: path, json: data}, gobj);
        } else {
            gobj_send_event(jv, "EV_SET_JSON", {json: data}, gobj);
        }
        return 0;
    }

    if(result < 0) {
        if(command === "descs") {
            /*  The schema couldn't load (not a treedb, no authz for it, backend
             *  down…). Show an inline banner in the view rather than a blocking
             *  app-modal that wedges the whole SPA behind an empty tab. */
            show_load_error(gobj, t(comment));
        } else {
            yui_shell_show_error(yui_shell_of(gobj), comment, {t: t});
        }
        // HACK don't return for non-descs, pass errors when need it.
    }

    switch(command) {
        case "descs":
            if(result >= 0) {
                process_treedb_descs(gobj, data);
            }
            break;

        case "nodes":
            if(result >= 0) {
                /*
                 *  Here it could update cols of `descs`
                 *  seeing if they have changed in schema argument (controlling the version?)
                 *  Now the schema pass to creation of nodes is get from `descs`.
                 */
                gobj_send_event(priv.gobj_nodes_tree,
                    "EV_LOAD_DATA",
                    {
                        kw_command: kw_command,
                        schema: schema,
                        data: data
                    },
                    gobj
                );
            }
            break;

        case "node":
            if(result >= 0) {
                /*
                 *  A node we re-read because its links changed. Feed it as an
                 *  UPDATE: the tree diffs its fkey refs against the ones it
                 *  holds and draws / clears exactly the edges that moved.
                 */
                gobj_send_event(priv.gobj_nodes_tree,
                    "EV_NODE_UPDATED",
                    {
                        topic_name: kw_get_str(gobj, kw_command, "topic_name", "", 0),
                        node: data
                    },
                    gobj
                );
            }
            break;

        case "create-node":
        case "update-node":
        case "delete-node":
        case "link-nodes":
        case "unlink-nodes":
            /*
             *  The graph redraws itself from the treedb's own EV_TREEDB_NODE_*
             *  events, which arrive for EVERY writer. This says what those
             *  cannot: THIS view has just written, and the yuno took it. A host
             *  whose save is not finished with the record -- a schema editor,
             *  where the yuno still has to be restarted to re-read the schema --
             *  needs exactly that, and cannot use the node events without
             *  answering its own writes in a loop.
             *
             *  Same event and same kw as C_YUI_TREEDB_TOPICS, plus `command`:
             *  in a graph a LINK is as much a write as a record is, and the
             *  three of them carry different halves of the kw.
             *
             *  `__graphs__` is EXCLUDED, and that exclusion is the point of
             *  reading this comment: the view writes that topic ITSELF, one
             *  record per topic, every time the layout is saved. It is this
             *  view's bookkeeping, not the operator's data -- reporting it
             *  would tell a schema editor that the schema changed because
             *  somebody dragged a node.
             */
            if(result >= 0 &&
                kw_get_str(gobj, kw_command, "topic_name", "", 0) !== "__graphs__") {
                gobj_publish_event(gobj, "EV_RECORD_WRITTEN", {
                    treedb_name: kw_get_str(gobj, kw_command, "treedb_name", "", 0),
                    topic_name:  kw_get_str(gobj, kw_command, "topic_name", "", 0),
                    record:      kw_get_dict(gobj, kw_command, "record", {}, 0),
                    created:     (command === "create-node"),
                    command:     command
                });
            }
            break;

        default:
            log_error(`${gobj_short_name(gobj)} Command unknown: ${command}`);
    }

    return 0;
}

/********************************************
 *  Remote subscription response
 ********************************************/
function ac_treedb_node_created(gobj, event, kw, src)
{
    let priv = gobj.priv;
    let treedb_name = kw_get_str(gobj, kw, "treedb_name", "", 0);
    let topic_name = kw_get_str(gobj, kw, "topic_name", "", 0);
    let node = kw_get_dict_value(gobj, kw, "node", null, 0);

    if(treedb_name !== priv.treedb_name) {
        log_error("It's not my treedb_name: " + treedb_name);
        return 0;
    }

    let schema = priv.descs[topic_name];

    if(priv.gobj_nodes_tree) {
        gobj_send_event(priv.gobj_nodes_tree,
            "EV_NODE_CREATED",
            {
                schema: schema,
                topic_name: topic_name,
                node: node
            },
            gobj
        );
    }

    return 0;
}

/********************************************
 *  Remote subscription response
 ********************************************/
function ac_treedb_node_updated(gobj, event, kw, src)
{
    let priv = gobj.priv;
    let treedb_name = kw_get_str(gobj, kw, "treedb_name", "", 0);
    let topic_name = kw_get_str(gobj, kw, "topic_name", "", 0);
    let node = kw_get_dict_value(gobj, kw, "node", null, 0);

    if(treedb_name !== priv.treedb_name) {
        log_error("It's not my treedb_name: " + treedb_name);
        return 0;
    }

    if(priv.gobj_nodes_tree) {
        gobj_send_event(priv.gobj_nodes_tree,
            "EV_NODE_UPDATED",
            {
                topic_name: topic_name,
                node: node
            },
            gobj
        );
    }

    return 0;
}

/********************************************
 *  Remote subscription response: two nodes were LINKED or UNLINKED
 *  (by us, or by another operator on the same treedb).
 *
 *  The kw is the relationship, not a node:
 *      {hook_name, parent_topic_name, child_topic_name,
 *       parent_id, child_id, treedb_name}
 *
 *  An edge IS a fkey of the CHILD (link-saves-child), so the child is what
 *  must be resynced — re-read it, and its EV_NODE_UPDATED diff moves the
 *  edge. The PARENT is re-read too: its hook (the children list it shows,
 *  and what the hook-data viewer reads) changed in memory even though it was
 *  never saved.
 *
 *  Only topics already loaded in the graph are re-read: a link to a topic
 *  the user never opened has no node here to update.
 ********************************************/
function ac_treedb_node_linked(gobj, event, kw, src)
{
    let priv = gobj.priv;
    let treedb_name = kw_get_str(gobj, kw, "treedb_name", "", 0);
    let parent_topic_name = kw_get_str(gobj, kw, "parent_topic_name", "", 0);
    let child_topic_name = kw_get_str(gobj, kw, "child_topic_name", "", 0);
    let parent_id = kw_get_str(gobj, kw, "parent_id", "", 0);
    let child_id = kw_get_str(gobj, kw, "child_id", "", 0);

    if(treedb_name !== priv.treedb_name) {
        log_error("It's not my treedb_name: " + treedb_name);
        return 0;
    }
    if(!child_id || !parent_id) {
        log_error(`${gobj_short_name(gobj)}: ${event} without parent_id/child_id`);
        return -1;
    }

    if(priv._topics_subscribed[child_topic_name]) {
        treedb_get_node(gobj, treedb_name, child_topic_name, child_id);
    }
    if(priv._topics_subscribed[parent_topic_name]) {
        treedb_get_node(gobj, treedb_name, parent_topic_name, parent_id);
    }

    return 0;
}

/********************************************
 *  Remote subscription response
 ********************************************/
function ac_treedb_node_deleted(gobj, event, kw, src)
{
    let priv = gobj.priv;
    let treedb_name = kw_get_str(gobj, kw, "treedb_name", "", 0);
    let topic_name = kw_get_str(gobj, kw, "topic_name", "", 0);
    let node = kw_get_dict_value(gobj, kw, "node", null, 0);

    if(treedb_name !== priv.treedb_name) {
        log_error("It's not my treedb_name: " + treedb_name);
        return 0;
    }

    if(priv.gobj_nodes_tree) {
        gobj_send_event(priv.gobj_nodes_tree,
            "EV_NODE_DELETED",
            {
                topic_name: topic_name,
                node: node
            },
            gobj
        );
    }

    return 0;
}

/********************************************
 *  Refresh treedb action
 ********************************************/
function ac_refresh_treedb(gobj, event, kw, src)
{
    /*
     *  Get data
     */
    refresh_data(gobj);
    return 0;
}

/********************************************
 *  Open the raw-tranger JSON viewer.
 ********************************************/
function ac_open_json(gobj, event, kw, src)
{
    open_json_viewer(gobj);
    return 0;
}

/********************************************
 *  The viewer asked to load a collapsed subtree: re-issue print-tranger
 *  for that path. The answer returns through ac_mt_command_answer and is
 *  fed back as EV_SUBTREE_LOADED / EV_SUBTREE_ERROR.
 ********************************************/
function ac_json_expand_path(gobj, event, kw, src)
{
    request_print_tranger(gobj, (kw && kw.path) || "");
    return 0;
}

/********************************************
 *  The JSON viewer was dismissed (X / dock / Escape / back), or torn down
 *  by close_json_viewer(): release the viewer and clear the refs.
 ********************************************/
function ac_json_closed(gobj, event, kw, src)
{
    let priv = gobj.priv;
    let jv = priv.json_gobj;
    priv.json_gobj = null;
    priv.json_win = null;
    priv.json_modal = null;
    if(jv && is_gobj(jv)) {
        try {
            /*  STOP before destroy — the viewer was STARTED in open_json_viewer
             *  (see close_json_viewer for the full rationale). */
            gobj_stop(jv);
            gobj_destroy(jv);
        } catch(e) {
            log_warning(`${gobj_short_name(gobj)}: already gone: ${e}`);
        }
    }
    return 0;
}

/********************************************
 *  Event from G6_nodes_tree
 *  kw: {
 *      treedb_name,
 *      parent_topic_name,
 *      child_topic_name,
 *      child_field_name,
 *      child_field_value,
 *      click_x,
 *      click_y
 *  }
 ********************************************/
function ac_show_hook_data(gobj, event, kw, src)
{
    let priv = gobj.priv;
    let treedb_name = kw.treedb_name;
    let parent_topic_name = kw.parent_topic_name;
    let child_topic_name = kw.child_topic_name;
    let child_field_name = kw.child_field_name;
    let child_field_value = kw.child_field_value;

    if(!priv.hook_data_viewer) {
        trace_msg(kw);
        return 0;
    }

    let name = "Graph Hook>" + treedb_name + ">" +
        parent_topic_name + ">" +
        child_topic_name + ">" +
        child_field_name + ">" +
        child_field_value;
    let found_gobj = gobj_find_service(name);
    if(!found_gobj) {
        found_gobj = gobj_create_service(
            name,
            priv.hook_data_viewer,
            kw,
            gobj
        );
        gobj_start(found_gobj);
    } else {
        gobj_send_event(found_gobj, "EV_TOGGLE", {}, gobj);
    }

    return 0;
}

/********************************************
 *  Event from G6_nodes_tree
 ********************************************/
function ac_show_treedb_topic(gobj, event, kw, src)
{
    let priv = gobj.priv;
    let topic_name = kw.topic_name;

    if(!priv.gobj_treedb_tables) {
        log_error("gobj_treedb_tables not available");
        return 0;
    }

    let gobj_topic_formtable = gobj_send_event(priv.gobj_treedb_tables,
        "EV_GET_TOPIC_FORMTABLE",
        {
            topic_name: topic_name
        },
        gobj
    );

    if(gobj_topic_formtable) {
        gobj_send_event(gobj_topic_formtable, "EV_TOGGLE", {}, gobj);
    } else {
        log_error("Topic Formtable not found: " + topic_name);
    }

    return 0;
}

/********************************************
 *  Event from G6_nodes_tree
 *  kw: {
 *      treedb_name,
 *      topic_name,
 *      record
 *  }
 ********************************************/
function ac_vertex_clicked(gobj, event, kw, src)
{
    return 0;
}

/********************************************
 *  Event from G6_nodes_tree
 *  kw: {
 *      child_topic_name,
 *      child_topic_id,
 *      child_fkey,
 *      parent_topic_name,
 *      parent_topic_id,
 *      parent_hook
 * }
 ********************************************/
function ac_edge_clicked(gobj, event, kw, src)
{
    return 0;
}

/********************************************
 *  Message from G6_nodes_tree
 *  kw: {
 *      topic_name,
 *      record,
 *      options
 *  }
 *  Send to backend
 ********************************************/
function ac_create_node(gobj, event, kw, src)
{
    let priv = gobj.priv;

    if(refuse_if_readonly(gobj, event)) {
        return -1;
    }

    let treedb_name = priv.treedb_name;
    let topic_name = kw.topic_name;
    let record = kw.record;
    let options = kw.options || {};

    return treedb_create_node(
        gobj,
        treedb_name,
        topic_name,
        record,
        options
    );
}

/********************************************
 *  Message from G6_nodes_tree
 *  kw: {
 *      topic_name,
 *      record,
 *      options
 *  }
 *  Send to backend
 ********************************************/
function ac_update_node(gobj, event, kw, src)
{
    let priv = gobj.priv;

    if(refuse_if_readonly(gobj, event)) {
        return -1;
    }

    let treedb_name = priv.treedb_name;
    let topic_name = kw.topic_name;
    let record = kw.record;
    let options = kw.options || {};

    return treedb_update_node(
        gobj,
        treedb_name,
        topic_name,
        record,
        options
    );
}

/********************************************
 *  Message from G6_nodes_tree
 *  kw: {
 *      topic_name,
 *      record,
 *      options
 *  }
 *  Send to backend
 ********************************************/
function ac_delete_node(gobj, event, kw, src)
{
    let priv = gobj.priv;

    if(refuse_if_readonly(gobj, event)) {
        return -1;
    }

    let treedb_name = priv.treedb_name;
    let topic_name = kw.topic_name;
    let record = kw.record;
    let options = kw.options || {};

    return treedb_delete_node(
        gobj,
        treedb_name,
        topic_name,
        record,
        options
    );
}

/********************************************
 *  Message from G6_nodes_tree
 *  kw: {
 *      parent_ref,
 *      child_ref,
 *      options
 *  }
 *  Send to backend
 ********************************************/
function ac_link_nodes(gobj, event, kw, src)
{
    let priv = gobj.priv;

    if(refuse_if_readonly(gobj, event)) {
        return -1;
    }

    let treedb_name = priv.treedb_name;
    let parent_ref = kw.parent_ref;
    let child_ref = kw.child_ref;
    let options = kw.options || {};

    return treedb_link_nodes(
        gobj,
        treedb_name,
        parent_ref,
        child_ref,
        options
    );
}

/********************************************
 *  Message from G6_nodes_tree
 *  kw: {
 *      parent_ref,
 *      child_ref,
 *      options
 *  }
 *  Send to backend
 ********************************************/
function ac_unlink_nodes(gobj, event, kw, src)
{
    let priv = gobj.priv;

    if(refuse_if_readonly(gobj, event)) {
        return -1;
    }

    let treedb_name = priv.treedb_name;
    let parent_ref = kw.parent_ref;
    let child_ref = kw.child_ref;
    let options = kw.options || {};

    return treedb_unlink_nodes(
        gobj,
        treedb_name,
        parent_ref,
        child_ref,
        options
    );
}

/********************************************
 *  Message from G6_nodes_tree
 ********************************************/
function ac_run_node(gobj, event, kw, src)
{
    // TODO what is this?
    // let record = kw.record;
    //
    // let url = record.url;
    // let dst_role = record.dst_role;
    // let dst_service = record.dst_service;
    // let dst_yuno = record.dst_yuno;
    // let viewer_engine = record.viewer_engine;
    //
    // let gclass = gclass_find_by_name(viewer_engine);
    // if(!gclass) {
    //     log_error("Viewer engine (gclass) not found: " + viewer_engine);
    //     return -1;
    // }
    //
    // let name = viewer_engine + ">" + url + ">" + dst_role + ">" + dst_service;
    // let found_gobj = gobj_find_service(name);
    // if(!found_gobj) {
    //     found_gobj = gobj_create_service(
    //         name,
    //         gclass,
    //         {
    //             is_pinhold_window: true,
    //             window_title: name,
    //             window_image: "",
    //
    //             dst_role: dst_role,
    //             dst_service: dst_service,
    //             dst_yuno: dst_yuno,
    //             url: url
    //         },
    //         gobj
    //     );
    //     gobj_start(found_gobj);
    // } else {
    //     gobj_send_event(found_gobj, "EV_TOGGLE", {}, gobj);
    // }

    return 0;
}

/********************************************
 *  From wrapped $ui, destroy self
 *  - Top toolbar informing of window close
 *      {destroying: true}   Window destroying
 *      {destroying: false}  Window minifying
 ********************************************/
function ac_close_window(gobj, event, kw, src)
{
    let priv = gobj.priv;

    if(priv.is_pinhold_window) {
        gobj_destroy(gobj);
    }
    return 0;
}

/************************************************************
 *
 ************************************************************/
function ac_set_layout(gobj, event, kw, src)
{
    let priv = gobj.priv;

    let layout = kw.layout;
    gobj_write_str_attr(gobj, "layout", layout);
    gobj_save_persistent_attrs(gobj, "layout");

    let $layout_select = priv.$container.querySelector('.GRAPH_LAYOUT_SELECT');
    $layout_select.value = priv.layout;

    gobj_send_event(
        priv.gobj_nodes_tree,
        "EV_SET_LAYOUT",
        {
            layout: layout
        },
        gobj
    );

    return 0;
}

/************************************************************
 *
 ************************************************************/
function ac_set_operation_mode(gobj, event, kw, src)
{
    let priv = gobj.priv;

    let operation_mode = kw.operation_mode;
    if(operation_mode === "edition" && gobj_read_bool_attr(gobj, "readonly")) {
        /*  The select does not offer it on a replica, so getting here means
         *  the event came from somewhere else -- and it is the mode that
         *  turns on every write affordance.  */
        log_error(`${gobj_short_name(gobj)}: edition mode refused, treedb ` +
            `'${gobj_read_str_attr(gobj, "treedb_name")}' is READ-ONLY`);
        return -1;
    }
    gobj_write_str_attr(gobj, "operation_mode", operation_mode);
    gobj_save_persistent_attrs(gobj, "operation_mode");

    let $operation_mode_select = priv.$container.querySelector('.GRAPH_MODE_SELECT');
    $operation_mode_select.value = priv.operation_mode;

    gobj_send_event(
        priv.gobj_nodes_tree,
        "EV_SET_OPERATION_MODE",
        {
            operation_mode: operation_mode
        },
        gobj
    );

    /*
     *  Announce the change so an embedder can mirror it (e.g. into
     *  the URL route).  Optional subscriber: EVF_NO_WARN_SUBS.
     */
    gobj_publish_event(gobj, "EV_OPERATION_MODE_CHANGED", {
        operation_mode: operation_mode
    });

    return 0;
}

/************************************************************
 *  Focus the graph on a topic (a topic card's graph icon, or a
 *  `.../graphs/db/<sel>/<topic>` deep link): forward it to the G6
 *  tree, which centres + highlights that topic's nodes (deferring
 *  until its data is loaded).
 ************************************************************/
/************************************************************
 *  Fill the legend strip with one entry per topic: a swatch in the
 *  topic's colour and its name. The colours belong to the graph child —
 *  it assigns them from its palette when the schema arrives — so they
 *  are read from there and never guessed twice.
 *
 *  An entry is a BUTTON: clicking it focuses that topic, clicking the
 *  focused one clears the focus. The focus travels the same way a topic
 *  card's graph icon travels — as EV_TOPIC_SELECTED, which the host turns
 *  into the URL, so what you are looking at stays linkable.
 ************************************************************/
function refresh_legend(gobj)
{
    let priv = gobj.priv;
    let $container = gobj_read_attr(gobj, "$container");
    if(!$container) {
        return;
    }
    let $legend = $container.querySelector(".GRAPH_LEGEND");
    if(!$legend) {
        return;
    }

    let descs = priv.gobj_nodes_tree?
        gobj_read_attr(priv.gobj_nodes_tree, "descs") : null;
    $legend.textContent = "";
    if(!descs) {
        return;
    }

    for(const [topic_name, desc] of Object.entries(descs)) {
        if(topic_name.substring(0, 2) === "__") {
            continue;       /*  the internal topics are not drawn  */
        }
        if(!desc || !desc.color) {
            continue;
        }
        let focused = (priv.focus_topic === topic_name);
        let $item = createElement2(
            ['button', {
                /*  `is-light` on the focused one, not solid `is-primary`:
                 *  the solid fill sat right behind the swatch and swallowed
                 *  the one colour the entry exists to show. */
                class: 'GRAPH_LEGEND_ITEM button is-small' +
                       (focused? ' is-primary is-light' : ''),
                title: topic_name,
                'aria-label': topic_name,
                'aria-pressed': focused? 'true' : 'false'
            }, [
                ['span', {class: 'GRAPH_LEGEND_SWATCH',
                          style: `display:inline-block; width:.8rem; height:.8rem; ` +
                                 `border-radius:3px; margin-right:.4rem; ` +
                                 `background:${desc.color}; ` +
                                 `border:1px solid rgba(0,0,0,.25);`}],
                /*  The topic name is DATA: it carries no i18n key and is
                 *  never translated. */
                ['span', {}, topic_name]
            ], {
                click: (evt) => {
                    evt.stopPropagation();
                    gobj_send_event(gobj, "EV_LEGEND_TOPIC", {topic: topic_name}, gobj);
                }
            }]
        );
        $legend.appendChild($item);
    }
}

/************************************************************
 *
 ************************************************************/
function ac_toggle_legend(gobj, event, kw, src)
{
    let $container = gobj_read_attr(gobj, "$container");
    if(!$container) {
        return 0;
    }
    let $legend = $container.querySelector(".GRAPH_LEGEND");
    if(!$legend) {
        log_error(`${gobj_short_name(gobj)}: no legend strip to toggle`);
        return -1;
    }
    if($legend.classList.contains("is-hidden")) {
        refresh_legend(gobj);
        $legend.classList.remove("is-hidden");
    } else {
        $legend.classList.add("is-hidden");
    }
    return 0;
}

/************************************************************
 *  A legend entry was clicked: focus that topic, or clear the focus if
 *  it was already the focused one. Published UP rather than applied
 *  here, so the URL follows — the host owns the route.
 ************************************************************/
function ac_legend_topic(gobj, event, kw, src)
{
    let priv = gobj.priv;
    let topic = (kw && kw.topic) || "";
    if(!topic) {
        log_error(`${gobj_short_name(gobj)}: legend click with no topic`);
        return -1;
    }

    let next = (priv.focus_topic === topic)? "" : topic;

    /*  APPLY, then announce — in that order, and both halves are needed.
     *  The host mirrors the announcement into the URL and remembers the
     *  segment it just wrote, so the route change it causes comes back
     *  DEDUPED: a legend that only announced moved the URL and focused
     *  nothing. This is the same contract the topics view keeps, where
     *  clicking a topic shows it and says so.  */
    gobj_send_event(gobj, "EV_SET_FOCUS_TOPIC", {topic: next}, gobj);
    gobj_publish_event(gobj, "EV_TOPIC_SELECTED", {topic: next});
    return 0;
}

/************************************************************
 *  The child chose a layout for a treedb nobody has arranged yet.
 *  Only the SELECT is moved: the pick is a default, not the user's
 *  choice, so it is not persisted — the day somebody drags a node the
 *  saved geometry exists and `manual` is right again.
 ************************************************************/
function ac_layout_autoset(gobj, event, kw, src)
{
    let $container = gobj_read_attr(gobj, "$container");
    if(!$container) {
        return 0;
    }
    let $select = $container.querySelector(".GRAPH_LAYOUT_SELECT");
    let layout = (kw && kw.layout) || "";
    if(!$select || !layout) {
        return 0;
    }
    $select.value = layout;
    return 0;
}

/************************************************************
 *  Forward the find down to the graph child.
 ************************************************************/
function ac_find_nodes(gobj, event, kw, src)
{
    let priv = gobj.priv;
    if(priv.gobj_nodes_tree) {
        gobj_send_event(
            priv.gobj_nodes_tree,
            "EV_FIND_NODES",
            {text: (kw && kw.text) || ""},
            gobj
        );
    }
    return 0;
}

/************************************************************
 *  How many nodes the term matched, from the graph child. Zero with a
 *  term typed is an ANSWER and is shown; an empty box shows nothing.
 ************************************************************/
function ac_find_result(gobj, event, kw, src)
{
    let $container = gobj_read_attr(gobj, "$container");
    if(!$container) {
        return 0;
    }
    let $result = $container.querySelector(".GRAPH_FIND_RESULT");
    let $count = $container.querySelector(".GRAPH_FIND_COUNT");
    if(!$result || !$count) {
        return 0;
    }

    let term = (kw && kw.term) || "";
    if(!term) {
        $result.classList.add("is-hidden");
        $count.textContent = "";
        return 0;
    }

    $count.textContent = t("matches", {count: (kw && kw.matches) || 0});
    $result.classList.remove("is-hidden");
    return 0;
}

function ac_set_focus_topic(gobj, event, kw, src)
{
    let priv = gobj.priv;
    priv.focus_topic = (kw && kw.topic) || "";
    if(priv.gobj_nodes_tree) {
        gobj_send_event(
            priv.gobj_nodes_tree,
            "EV_FOCUS_TOPIC",
            {topic: priv.focus_topic},
            gobj
        );
    }
    /*  Keep the legend's mark on the topic that is actually focused —
     *  including when the focus arrives from the URL and not from a click. */
    let $container = gobj_read_attr(gobj, "$container");
    let $legend = $container? $container.querySelector(".GRAPH_LEGEND") : null;
    if($legend && !$legend.classList.contains("is-hidden")) {
        refresh_legend(gobj);
    }
    return 0;
}

/************************************************************
 *  Parent (routing) inform us that we go showing
 *
 *      {
 *          href: href
 *      }
 *
 *  WARNING href is the full path,
 *  the path relative to this gobj is the right part of split href by '?'
 ************************************************************/
function ac_show(gobj, event, kw, src)
{
    let priv = gobj.priv;
    return gobj_send_event(priv.gobj_nodes_tree, event, kw, gobj);
}

/************************************************************
 *   Parent (routing) inform us that we go hidden
 ************************************************************/
function ac_hide(gobj, event, kw, src)
{
    let priv = gobj.priv;
    return gobj_send_event(priv.gobj_nodes_tree, event, kw, gobj);
}




                    /***************************
                     *          FSM
                     ***************************/




/*---------------------------------------------*
 *          Global methods table
 *---------------------------------------------*/
const gmt = {
    mt_create:      mt_create,
    mt_writing:     mt_writing,
    mt_start:       mt_start,
    mt_stop:        mt_stop,
    mt_destroy:     mt_destroy,
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
            ["EV_MT_COMMAND_ANSWER",        ac_mt_command_answer,       null],
            ["EV_TREEDB_NODE_CREATED",      ac_treedb_node_created,     null],
            ["EV_TREEDB_NODE_UPDATED",      ac_treedb_node_updated,     null],
            ["EV_TREEDB_NODE_DELETED",      ac_treedb_node_deleted,     null],
            ["EV_TREEDB_NODE_LINKED",       ac_treedb_node_linked,      null],
            ["EV_TREEDB_NODE_UNLINKED",     ac_treedb_node_linked,      null],
            ["EV_REFRESH_TREEDB",           ac_refresh_treedb,          null],
            ["EV_OPEN_JSON",                ac_open_json,               null],
            ["EV_EXPAND_PATH",              ac_json_expand_path,        null],
            ["EV_JSON_CLOSED",              ac_json_closed,             null],
            ["EV_SHOW_HOOK_DATA",           ac_show_hook_data,          null],
            ["EV_SHOW_TREEDB_TOPIC",        ac_show_treedb_topic,       null],
            ["EV_VERTEX_CLICKED",           ac_vertex_clicked,          null],
            ["EV_EDGE_CLICKED",             ac_edge_clicked,            null],
            ["EV_CREATE_NODE",              ac_create_node,             null],
            ["EV_DELETE_NODE",              ac_delete_node,             null],
            ["EV_UPDATE_NODE",              ac_update_node,             null],
            ["EV_LINK_NODES",               ac_link_nodes,              null],
            ["EV_UNLINK_NODES",             ac_unlink_nodes,            null],
            ["EV_RUN_NODE",                 ac_run_node,                null],
            ["EV_CLOSE_WINDOW",             ac_close_window,            null],
            ["EV_SET_LAYOUT",               ac_set_layout,              null],
            ["EV_SET_OPERATION_MODE",       ac_set_operation_mode,      null],
            ["EV_SET_FOCUS_TOPIC",          ac_set_focus_topic,         null],
            ["EV_FIND_NODES",               ac_find_nodes,              null],
            ["EV_LAYOUT_AUTOSET",           ac_layout_autoset,          null],
            ["EV_TOGGLE_LEGEND",            ac_toggle_legend,           null],
            ["EV_LEGEND_TOPIC",             ac_legend_topic,            null],
            ["EV_FIND_RESULT",              ac_find_result,             null],
            ["EV_SHOW",                     ac_show,                    null],
            ["EV_HIDE",                     ac_hide,                    null],
            ["EV_TRANSPORT_STATE",          ac_transport_state,         null],
        ]]
    ];

    /*---------------------------------------------*
     *          Events
     *---------------------------------------------*/
    const event_types = [
        ["EV_MT_COMMAND_ANSWER",        event_flag_t.EVF_PUBLIC_EVENT],
        ["EV_TREEDB_NODE_CREATED",      event_flag_t.EVF_PUBLIC_EVENT],
        ["EV_TREEDB_NODE_UPDATED",      event_flag_t.EVF_PUBLIC_EVENT],
        ["EV_TREEDB_NODE_DELETED",      event_flag_t.EVF_PUBLIC_EVENT],
        ["EV_TREEDB_NODE_LINKED",       event_flag_t.EVF_PUBLIC_EVENT],
        ["EV_TREEDB_NODE_UNLINKED",     event_flag_t.EVF_PUBLIC_EVENT],
        ["EV_REFRESH_TREEDB",           0],
        ["EV_OPEN_JSON",                0],
        ["EV_EXPAND_PATH",              0],
        ["EV_JSON_CLOSED",              0],
        ["EV_SHOW_HOOK_DATA",           0],
        ["EV_SHOW_TREEDB_TOPIC",        0],
        ["EV_VERTEX_CLICKED",           0],
        ["EV_EDGE_CLICKED",             0],
        ["EV_CREATE_NODE",              0],
        ["EV_DELETE_NODE",              0],
        ["EV_UPDATE_NODE",              0],
        ["EV_LINK_NODES",               0],
        ["EV_UNLINK_NODES",             0],
        ["EV_RUN_NODE",                 0],
        ["EV_CLOSE_WINDOW",             0],
        ["EV_SET_LAYOUT",               0],
        ["EV_SET_OPERATION_MODE",       0],
        ["EV_SET_FOCUS_TOPIC",          0],
        ["EV_FIND_NODES",               0],
        ["EV_FIND_RESULT",              0],
        ["EV_LAYOUT_AUTOSET",           0],
        ["EV_TOGGLE_LEGEND",            0],
        ["EV_LEGEND_TOPIC",             0],
        ["EV_TOPIC_SELECTED",
            event_flag_t.EVF_OUTPUT_EVENT | event_flag_t.EVF_NO_WARN_SUBS],
        ["EV_OPERATION_MODE_CHANGED",
            event_flag_t.EVF_OUTPUT_EVENT | event_flag_t.EVF_NO_WARN_SUBS],
        ["EV_RECORD_WRITTEN",
            event_flag_t.EVF_OUTPUT_EVENT | event_flag_t.EVF_NO_WARN_SUBS],
        ["EV_SHOW",                     0],
        ["EV_HIDE",                     0],
        ["EV_TRANSPORT_STATE",          0],
    ];

    /*----------------------------------------*
     *          Create the gclass
     *----------------------------------------*/
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

/***************************************************************************
 *          Register GClass
 ***************************************************************************/
function register_c_yui_treedb_graph()
{
    if(gclass_find_by_name(GCLASS_NAME, false)) {
        return 0;
    }
    /*  This view hosts a C_G6_NODES_TREE child — the graph ENGINE — and
     *  creates it BY NAME.  Without its gclass the view builds fine, the
     *  child does not, and the failure lands as "GClass not registered"
     *  from inside a component the host never named.  Same arrangement
     *  C_YUI_JSON makes for C_YUI_JSON_GRAPH.  */
    if(!gclass_find_by_name("C_G6_NODES_TREE", false)) {
        register_c_g6_nodes_tree();
    }
    return create_gclass(GCLASS_NAME);
}

export { register_c_yui_treedb_graph };
