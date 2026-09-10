/***********************************************************************
 *          c_g6_nodes_tree.js
 *
 *          Treedb's Nodes Tree Manager using AntV/G6
 *
 *          Each G6 Node contains in his data:
 *          {
 *              topic_name: "...",
 *              desc: desc,         // Desc of topic
 *              record: null,       // Data of node
 *          }
 *
 *          The graph opens FOLDED, like a JSON viewer.
 *
 *          Every record of every topic is fetched, but only the ones on
 *          screen become G6 nodes: the roots, and the MAIN tree open to
 *          the reader's level (`fold_level`, `expand_depth` until they
 *          step it), one page (`fold_page_size`) of children per hook. Each
 *          card carries a pill per hook that has children -- `▸ devices
 *          142` -- which opens or folds that hook; an open hook with more
 *          children than its page ends in a `+N` chip that opens the next
 *          page. The arithmetic lives in treedb_fold_model.js; this file
 *          reconciles the G6 data with what that model says is visible
 *          (see reconcile_fold) and lays it out again.
 *
 *          `dagre` reads LEFT TO RIGHT: the children of a node are a
 *          column beside it, the ports move to the sides with it, and
 *          the edges are horizontal beziers. `antv-dagre` keeps the
 *          top-down reading.
 *
 *          Copyright (c) 2020-2021 Niyamaka.
 *          Copyright (c) 2025-2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {
    gobj_yuno,
    SDATA,
    SDATA_END,
    data_type_t,
    kw_flag_t,
    event_flag_t,
    sdata_flag_t,
    gclass_flag_t,
    gclass_create,
    gclass_find_by_name,
    log_error,
    log_warning,
    trace_msg,
    gobj_read_pointer_attr,
    gobj_read_attr,
    gobj_read_str_attr,
    gobj_read_bool_attr,
    gobj_read_integer_attr,
    gobj_write_attr,
    gobj_write_str_attr,
    gobj_write_bool_attr,
    gobj_parent,
    gobj_name,
    gobj_short_name,
    gobj_is_destroying,
    gobj_subscribe_event,
    gobj_unsubscribe_event,
    gobj_publish_event,
    gobj_send_event,
    gobj_post_event,
    gobj_save_persistent_attrs,
    clean_name,
    sprintf,
    is_string,
    is_array,
    empty_string,
    is_object,
    is_number,
    empty_json,
    kw_get_int,
    kw_get_str,
    kw_get_dict_value,
    kw_set_dict_value,
    kw_clone_by_keys,
    json_object_update,
    json_object_update_missing,
    json_object_size,
    json_size,
    treedb_get_field_desc,
    treedb_decoder_fkey,
    treedb_encoder_fkey,
    kwid_find_one_record,
    str_in_list,
    delete_from_list,
    escapeHtml,
    safeSrc,
} from "@yuneta/gobj-js";

import {
    addClasses,
    removeClasses,
    toggleClasses,
    removeChildElements,
    disableElements,
    enableElements,
    set_submit_state,
    set_cancel_state,
    set_active_state,
    set_pressed_state,
    getPointPosition,
    getStrokeColor,
} from "./lib_graph.js";

import {node_label} from "./treedb_node_label.js";
import {delete_impact} from "./delete_impact.js";
import {
    yui_graph_center_on,
    yui_graph_viewport_of,
    yui_graph_camera_behaviors,
    yui_graph_place_at,
} from "./yui_graph_camera.js";
import {
    fold_build_model,
    fold_new_state,
    fold_visible_set,
    fold_expand_to_level,
    fold_open_levels,
    fold_close_levels,
    fold_level_clamp,
    fold_is_hierarchical,
    fold_toggle,
    fold_show_more,
    fold_reveal,
    fold_pills_of,
    fold_pending_groups,
    fold_node_key,
    fold_split_group_key,
    fold_root_group_key,
} from "./treedb_fold_model.js";
import {layout_tree, layout_radial, layout_compact} from "./treedb_layout.js";

import {
    BaseLayout,
    ExtensionCategory,
    Graph,
    NodeEvent,
    CanvasEvent,
    HistoryEvent,
    EdgeEvent,
    Circle,
    HTML,
    Toolbar,
    register,
} from '@antv/g6';

import {Circle as CircleGeometry, Rect as RectGeometry} from '@antv/g';
import {t} from "i18next";

import {inject_svg_icons} from "./lib_icons.js";
import {ensure_drag_canvas_patch} from "./g6_drag_canvas_touch.js";
import {
    ensure_brush_select_owned,
    BRUSH_SELECT_OWNED,
} from "./g6_brush_select_owned.js";
import {
    ensure_pinch_zoom_patch,
    install_long_press_contextmenu,
    consume_long_press_click,
} from "./g6_touch_gestures.js";
import {yui_theme_now, yui_watch_theme} from "./yui_theme.js";
import {yui_shell_of} from "./c_yui_shell.js";

/***************************************************************
 *  YuiToolbar — G6 Toolbar subclass that adds per-item className
 *  and disabled support, plus three item kinds G6 does not have.
 *
 *  Each item in getItems() may carry:
 *    className  — CSS class added to the div (e.g. 'EV_SAVE_GRAPH')
 *    disabled   — boolean; sets the 'disabled' attribute initially
 *    text       — render this text instead of a sprite symbol; a
 *                 label is the only readable way to say `1:1`, and
 *                 every editor that offers actual-size writes it
 *    readout    — a text item that REPORTS instead of acting (the
 *                 zoom level); it is not a button
 *    separator  — a group divider, not an item
 *
 *  The base class fires onClick only for elements whose class list
 *  contains `g6-toolbar-item`, so a separator and a readout carry
 *  their own class and are inert by construction, with no guard in
 *  the click handler.
 *
 *  With className set to the event name, the lib_graph.js state
 *  functions (set_submit_state, disableElements, …) work on toolbar
 *  icons exactly like on regular Bulma/FA buttons — no special
 *  icon-specific helpers needed.
 ***************************************************************/
class YuiToolbar extends Toolbar
{
    async getDOMContent()
    {
        const items = await this.options.getItems();
        return items.map((item) => {
            if(item.separator) {
                return `<div class="g6-toolbar-sep" aria-hidden="true"></div>`;
            }

            const extra_class = item.className ? ` ${item.className}` : '';
            const title       = item.title ?? '';

            if(item.readout) {
                return (
                    `<div class="g6-toolbar-readout${extra_class}"` +
                    ` title="${title}" aria-label="${title}">` +
                    `${item.text ?? ''}` +
                    `</div>`
                );
            }

            const disabled = item.disabled ? ' disabled' : '';
            const is_text   = (item.text !== undefined);
            const kind_class = is_text ? ' g6-toolbar-item-text' : '';
            const body = is_text
                ? `<span class="g6-toolbar-text">${item.text}</span>`
                : `<svg aria-hidden="true" focusable="false">` +
                  `<use xlink:href="#${item.id}"></use>` +
                  `</svg>`;

            return (
                `<div class="g6-toolbar-item${kind_class}${extra_class}"` +
                ` value="${item.value}" title="${title}"` +
                ` aria-label="${title}"${disabled}>` +
                `${body}` +
                `</div>`
            );
        }).join('');
    }
}
register(ExtensionCategory.PLUGIN, 'yui-toolbar', YuiToolbar);
ensure_drag_canvas_patch();
ensure_brush_select_owned();
ensure_pinch_zoom_patch();

/***************************************************************
 *              Constants
 ***************************************************************/
const GCLASS_NAME = "C_G6_NODES_TREE";

/*  The highlight of a focused topic / a find match. It is drawn INTO the
 *  node's own html, not with G6's `active` element state: every node here
 *  is an `html` node, whose key shape is a DOM element — the state's
 *  `stroke` / `halo` have nothing to paint on and the amber never
 *  appeared, for the topic focus either.  */
/*  The mark of a focused topic and of a find: one amber for a
 *  near-black canvas (8.41:1) which on a WHITE one is 2.15 -- under
 *  the 3:1 a graphical mark needs, and this one is the whole answer
 *  to "which nodes matched". The light scheme takes the same hue
 *  burnt down (5.02:1); the halo follows it at the same alpha. Same
 *  rule as a brand colour used as ink: the colour that carries a
 *  mark is not one colour, it is one per scheme.  */
const HIGHLIGHT_COLOR_DARK  = "#f0a020";
const HIGHLIGHT_COLOR_LIGHT = "#b45309";
const HIGHLIGHT_HALO_DARK   = "rgba(240,160,32,0.35)";
const HIGHLIGHT_HALO_LIGHT  = "rgba(180,83,9,0.35)";

function highlight_color(theme)
{
    return (theme === "dark")? HIGHLIGHT_COLOR_DARK : HIGHLIGHT_COLOR_LIGHT;
}

function highlight_halo(theme)
{
    return (theme === "dark")? HIGHLIGHT_HALO_DARK : HIGHLIGHT_HALO_LIGHT;
}

/*
 *  The selection ring. Deliberately NOT the amber of the highlight:
 *  a node can be a find match AND be selected, and two amber rings
 *  would say nothing about either. Blue is what a selection is in
 *  every editor, and the ring is drawn OUTSIDE the highlight's halo
 *  so the two compose instead of overwriting one another.
 */
const SELECT_RING = "rgba(59,130,246,0.95)";

/*
 *  The ports of an open card. They are what a link is DRAWN from
 *  and what a resize takes hold of, and at a radius of 6 (2 on a
 *  chip) with a hairline stroke nobody could tell they were either:
 *  a port has to look like a handle. 10 / 5 in 7.23.75 was still
 *  read as a dot on a deployed treedb; 14 / 8 since 7.23.79. A
 *  saved geometry or a topic default (`resize all`) still wins.
 */
const PORT_R_ENTITY   = 14;
const PORT_R_CHILD    = 8;
const PORT_LINE_WIDTH = 2;

/*
 *  The three VIEWS of a record (`node_mode`), the same three the
 *  gobj tree view has: `expanded` is the card with its pills and
 *  its ports; `compact` is a one-line pill with the name inside
 *  and small ports, the half-way house; `shape` is a figure of the
 *  topic's colour -- a circle, a square, a diamond... chosen in the
 *  node's properties -- no ports, no text, topology and nothing
 *  else. The three tiers keep their order of size in every view,
 *  so a root is still bigger than a leaf when nothing says which
 *  is which.
 */
const NODE_MODES = ['expanded', 'compact', 'shape'];

const PILL_SIZE = {
    entity:       [200, 30],
    extended:     [180, 28],
    child:        [160, 26],
};
const PORT_R_PILL = 6;

const SHAPE_SIZE = {
    entity:       32,
    extended:     28,
    child:        22,
};
/*  The figures a `shape` node can be, by G6's own node types
 *  (`square` is G6's `rect` with rounded corners). A circle by
 *  default: a figure is a POINT of the topology, and a circle is
 *  the one figure that says nothing more than that.  */
const NODE_SHAPES = ['square', 'circle', 'diamond', 'triangle', 'hexagon', 'star'];
const DEFAULT_NODE_SHAPE = 'circle';

/***************************************************************
 *  Internal layout and operation mode definitions
 ***************************************************************/
const _layouts = {
    // set manual the first
    "manual": {
        type: 'manual',
    },
    /*  LEFT TO RIGHT, the house direction for a topology: a parent's
     *  children stack in a column beside it and read like a file tree.
     *  The separations are explicit because the default ones put the
     *  cards edge to edge. `antv-dagre` below keeps the top-down reading
     *  for whoever wants it -- the two are the same algorithm read two
     *  ways, so the layout picker is also the direction picker.  */
    /*  OURS, made for a treedb (treedb_layout.js): a tidy tree read
     *  TOP TO BOTTOM. It takes the spanning tree of what is on screen
     *  -- the roots, the first parent that reaches a node, the hooks
     *  in schema order, the records in their order -- so opening a
     *  hook moves nothing that is not under or beside it. Down and not
     *  right, because down is where a tree has room: a hall with a
     *  hundred devices is a wide row, not a column beside a card --
     *  and read right it was `dagre` with the siblings held still,
     *  which nobody could tell apart. The default for a treedb nobody
     *  has arranged (see auto_layout).  */
    "treedb-tree": {
        type: 'treedb-tree',
        direction: 'TB',
        nodesep: 18,
        ranksep: 90,
    },
    /*  The same tree packed by CONTOUR (Moen, as mxGraph drew it): a
     *  closed branch sits beside an open one at the depth they share,
     *  instead of beside the whole block of the open one. Same rows
     *  and order as `treedb-tree` (treedb_layout.js).  */
    "compact-tree": {
        type: 'treedb-compact',
        direction: 'TB',
        nodesep: 18,
        ranksep: 90,
    },
    "dagre": {
        type: 'dagre',
        rankdir: 'LR',
        nodesep: 18,
        ranksep: 110,
    },
    "antv-dagre": {
        type: 'antv-dagre',
        rankdir: 'TB',
        nodesep: 30,
        ranksep: 80,
    },
    /*  Ours too: the root in the middle, a ring per depth, every ring
     *  as long as its cards need. G6's `radial` was tried first and
     *  piled twenty cards of 172px on a ring of a fixed radius.  */
    "radial": {
        type: 'treedb-radial',
        nodesep: 24,
        ranksep: 180,
    },
    "d3-force": {
        type: 'd3-force',
        link: {
            distance: 200,
            strength: 2
        },
        collide: {
            radius: 80,
        },
    },
    "force-atlas2": {
        type: 'force-atlas2',
        preventOverlap: true,
        kr: 20,
        graph_center: [250, 250],
    },
};

const node_colors = [
    'rgb(237, 201, 73)',
    'rgb(118, 183, 178)',
    'rgb(255, 157, 167)',
    'rgb(175, 122, 161)',
    'rgb(89, 161, 79)',
    'rgb(186, 176, 171)',
    'rgb(66, 146, 198)',
];

/***************************************************************
 *              Data
 ***************************************************************/
const attrs_table = [
/*---------------- Public Attributes ----------------*/
SDATA(data_type_t.DTP_POINTER,  "subscriber",           0,  null,   "Subscriber of output events"),

/*---------------- User last selections  ----------------*/
SDATA(data_type_t.DTP_STRING,   "operation_mode",       0,  '["reading", "operation", "writing", "edition"]', // WARNING put only the implemented modes
"Current operation mode. Interface to fulfill requirements of the parent."),
SDATA(data_type_t.DTP_STRING,   "layout",               0,  "", "Current graph layout"),

/*---------------- Remote Connection ----------------*/
SDATA(data_type_t.DTP_POINTER,  "gobj_remote_yuno",     0,  null,   "Remote Yuno"),
SDATA(data_type_t.DTP_STRING,   "treedb_name",          0,  null,   "Treedb name"),
SDATA(data_type_t.DTP_DICT,     "descs",                0,  null,   "Descriptions of topics"),
SDATA(data_type_t.DTP_DICT,     "records",              0,  "{}",   "Data of topics"),
SDATA(data_type_t.DTP_LIST,     "topics",               0,  "[]",   "List of topic objects"),

/*---------------- Sub-container ----------------*/
SDATA(data_type_t.DTP_POINTER,  "$container",           0,  null,   "Graph container element, set externally"),

/*---------------- Graph Settings ----------------*/
SDATA(data_type_t.DTP_STRING,   "theme",                0,  "light", "Theme: light or dark"),
SDATA(data_type_t.DTP_BOOLEAN,  "with_treedb_tables",   0,  false,  "Include treedb tables"),
SDATA(data_type_t.DTP_BOOLEAN,  "with_gridline",        0,  true,   "Use gridline plugin"),
SDATA(data_type_t.DTP_BOOLEAN,  "with_fullscreen",      0,  true,   "Use fullscreen plugin"),
SDATA(data_type_t.DTP_BOOLEAN,  "with_toolbar",         0,  true,   "Use toolbar plugin"),
SDATA(data_type_t.DTP_INTEGER,  "minimap_min_nodes",    0,  30,     "Show the minimap from this many nodes on (0 = never). A minimap of a graph that fits on screen is decoration; one of two hundred cards is the only way to know where you are"),
SDATA(data_type_t.DTP_STRING,   "toolbar_position",     0,  "right-top",
    "Toolbar position: top-left, top-right, bottom-left, bottom-right, left-top, right-top"),
SDATA(data_type_t.DTP_LIST,     "layout_names",         sdata_flag_t.SDF_RD,
    JSON.stringify(Object.keys(_layouts)),
    "Available layout names (read-only, for parent to query)"),

SDATA(data_type_t.DTP_STRING,   "hook_port_position",   0,  "bottom",   "Hook port position"),
SDATA(data_type_t.DTP_STRING,   "fkey_port_position",   0,  "top",      "Fkey port position"),

/*---------------- Folding ----------------*/
SDATA(data_type_t.DTP_INTEGER,  "expand_depth",         0,  1,      "Levels open when a treedb loads, until the reader steps (`fold_level`): 1 = the roots alone (the default), 2 = the roots and their children. Every open hook shows its first page"),
SDATA(data_type_t.DTP_INTEGER,  "fold_level",           0,  0,      "The level of the MAIN tree the toolbar's stepper stands on: 1 = its roots, N = N-1 levels under them; 0 = `expand_depth`. The host persists it and sends EV_SET_FOLD_LEVEL; it is published back in EV_LEGEND_STATE (`fold`) with the levels the tree has"),
SDATA(data_type_t.DTP_INTEGER,  "fold_page_size",       0,  24,     "Children of one hook shown per page; the `+N` chip after the page opens the next one"),
SDATA(data_type_t.DTP_LIST,     "hidden_topics",        0,  "[]",   "Topics left out of the tree: no card, no pill counts them, no edge reaches them"),
SDATA(data_type_t.DTP_STRING,   "main_topic",           0,  "",     "The topic the tree hangs from; empty = deduced (the one whose hooks reach the most others). Its parentless records are the roots; a parentless record of a topic linked to it is LOOSE and shown only on request"),
SDATA(data_type_t.DTP_LIST,     "loose_topics",         0,  "[]",   "Topics whose loose records (no parent, in a topic the schema hangs from the main one) are shown as roots"),

/*---------------- Node shape ----------------*/
SDATA(data_type_t.DTP_STRING,   "node_mode",            0,  "expanded", "How a record is drawn: `expanded` = the card with its pills and ports; `compact` = a one-line pill with the name and small ports; `shape` = a figure of the topic's colour (square, circle, diamond... per node or topic, from the node properties), no ports, no text -- the topology alone. One node can be toggled against it (EV_TOGGLE_NODE_MODE)"),
SDATA(data_type_t.DTP_BOOLEAN,  "node_labels",          0,  true,   "A `shape` node says its name under the figure. Off, it is a coloured figure and nothing else"),
SDATA(data_type_t.DTP_BOOLEAN,  "confirm_delete_node",  0,  true,   "Ask confirmation before deleting a node"),
SDATA(data_type_t.DTP_BOOLEAN,  "confirm_unlink_edge",  0,  true,   "Ask confirmation before unlinking an edge"),

/*---------------- Camera ----------------*/
SDATA(data_type_t.DTP_DICT,     "camera",               0,  "{}",   "Where the reader left the viewport: {zoom, node, x, y} -- a NODE at a viewport pixel, not G6's own position, which does not restore. Empty = the graph opens fitted. Restored on the FIRST draw and published back as EV_CAMERA_CHANGED once a move settles, so a host can persist it"),

SDATA(data_type_t.DTP_STRING,   "wide",                 0,  "40px", "Height of header"),

SDATA_END()
];

let PRIVATE_DATA = {
    /*---------------- camera anchor ----------------*/
    anchor_id:      "",     // the node the camera keeps in the middle
    anchor_state:   "off",  // "off" | "arming" | "on"
    last_zoom:      1,      // tells a wheel zoom from a drag in aftertransform
    _camera_placed: false,  // the first draw has decided the viewport
    _camera_restoring: false,   // a move WE made: not the reader's, do not publish it
    _camera_timer:  null,   // browser timer: the gesture has to END before it is saved

    _xy:                100,
    _edge_seq:          0,
    _history_paused:    false,
    treedb_name:        "",
    gobj_remote_yuno:   null,
    descs:              null,
    records:            {},
    $container:         null,
    graph:              null,       // Instance of G6
    __graphs__:         [],         // Rows of __graphs__
    _graph_properties:  {},         // topic_name → {nodes: {node_id: {x,y,size,...}}}
    yet_showed:         false,
    edit_mode:          false,
    operation_mode:     null,
    layout:             null,
    theme:              null,
    theme_observer:     null,    // MutationObserver on <html data-theme>
    resize_observer:    null,    // ResizeObserver on $container
    _resize_raf:        0,       // rAF id debouncing resize bursts
    is_fullscreen:      false,   // tracked via G6 onEnter/onExit

    _selected_node_id:  null,
    _selected_port_key: null,       // key of selected port (null = node selected)
    _resize_handles_el: null,
    _resize_handles:    [],
    _resize_sel_rect:   null,
    _port_handles_el:   null,
    _port_handles:      [],
    _port_ring:         null,
    _selected_edge_id:  null,       // selected edge id
    _edge_icon_el:      null,       // floating properties icon element
    _edge_delete_el:    null,       // floating delete icon element for edge
    _edge_popover_el:   null,       // edge properties popover element
    _edge_preview_undo: null,       // ...and how to undo what it previewed
    _port_icon_el:      null,       // floating port properties icon element
    _port_popover_el:   null,       // port properties popover element
    _port_preview_undo: null,       // ...and how to undo what it previewed
    _node_icon_el:      null,       // floating node properties icon element
    _node_delete_el:    null,       // floating delete icon element for node
    _node_popover_el:   null,       // node properties popover element
    _node_preview_undo: null,       // ...and how to undo what it previewed
    _node_detail_el:    null,       // read-only detail popover (on click)
    _detail_node_id:    null,       // node id the detail popover is showing
    _delete_confirm_el: null,       // delete confirmation popover
    _unlink_confirm_el: null,       // unlink confirmation popover
    _create_popover_el: null,       // create node popover element
    _context_node_id:   null,       // node id for context menu target
    _context_port_key:  null,       // port key for context menu target (null = node body)
    _context_edge_id:   null,       // edge id for context menu target
    _linking_mode:      false,      // true when in link-drag mode
    _link_source:       null,       // {node_id, port_key, col, topic_name} of fkey being linked
    _link_icon_el:      null,       // floating link icon on fkey port
    _link_drag_svg:     null,       // SVG overlay for drag line
    _link_valid_hooks:  [],         // [{node_id, port_key}] compatible hook targets
    _link_saved_styles: [],         // saved port styles to restore on cancel
    _focus_topic:       null,       // topic currently focused (EV_FOCUS_TOPIC)
    _focus_ids:         [],         // node ids carrying the focus 'active' state
    _on_pointerdown_focus: null,    // listener keeping the keyboard on the canvas
    _on_native_contextmenu: null,   // listener keeping the browser's menu out
    _uninstall_long_press: null,    // touch door to the context menu
    toolbar_collapsed:  true,       // floating toolbars folded (narrow only)
    _toolbars_could_collapse: null, // last answer, to notice it changed
    _on_focusout_restore: null,     // ...and putting it back when it goes nowhere
    selection_mode:     false,      // taps pick cards, a canvas drag is the band
                                    // (edition only, transient: a mode nobody
                                    //  can see is a mode nobody can leave)
    _selected_paint_ids: [],        // node ids whose card is PAINTED selected
                                    // (G6's 'selected' state is the selection
                                    //  itself; this is what is on screen, and
                                    //  it exists to diff the repaint)
    _pending_focus_topic: null,     // focus requested before data was loaded
    _pending_focus_all: false,      // ...and whether it reveals the whole topic
    _find_hidden_matches: 0,        // matches of the last find in HIDDEN topics
    _pending_find:      null,       // find requested before data was loaded
    _layout_asked:      "",         // layout the host asked for at create (see mt_create)
    _nodes_total:       0,          // records of the treedb (auto_layout)
    _nodes_placed:      0,          // ...of which carry a saved position

    /*---------------- folding ----------------*/
    expand_depth:       1,
    fold_level:         0,
    fold_page_size:     24,
    hidden_topics:      null,
    main_topic:         "",
    loose_topics:       null,
    _fold_model:        null,       // treedb_fold_model: the tree of the records
    _fold_state:        null,       // ...and which groups of it are open
    _fold_listener:     null,       // delegated click on the card pills
    _pill_sig:          null,       // Map<node_id, string>: the pills a card was painted with
    _open_nodes:        null,       // Set<node_id>: the nodes toggled AGAINST `node_mode`
    _fold_busy:         false,      // a reconcile is in flight
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

    /*  What the HOST asked for, captured before anything overwrites it.
     *
     *  `gobj_write_attr()` also writes the private field of the same name,
     *  so the moment select_layout() resolves the empty preference to
     *  `manual` and stores it, `priv.layout` reads "manual" and no longer
     *  says whether anybody ever chose it. auto_layout() needs exactly that
     *  distinction. */
    priv._layout_asked = gobj_read_str_attr(gobj, "layout") || "";

    /*
     *  CHILD subscription model
     */
    let subscriber = gobj_read_pointer_attr(gobj, "subscriber");
    if(!subscriber) {
        subscriber = gobj_parent(gobj);
    }
    gobj_subscribe_event(gobj, null, {}, subscriber);

    /*  The theme is <html data-theme> (the Bulma/wz_theme convention) and
     *  the DOM mutation IS the notification: translate it into EV_THEME so
     *  ac_theme does the work inside the machine.  Without this priv.theme
     *  stays "light" and the grid-line uses the light colour (#EEEEEE) →
     *  glaring white grid on the dark canvas.
     *
     *  This used to be the ELSE of "did the app register a legacy
     *  C_YUI_MAIN __yui_main__ service?", whose `theme` attr we read and
     *  whose EV_THEME we subscribed to.  That branch was retired: nothing
     *  ever WROTE that attr (it stayed at its "light" default for the life
     *  of the app) and no shell published EV_THEME, so merely having such a
     *  service swapped this working observer for a dead path. */
    gobj_write_attr(gobj, "theme", yui_theme_now());
    gobj.priv.theme_observer = yui_watch_theme(gobj);

    build_ui(gobj);
    register_layouts(gobj);
    build_graph(gobj);
    install_fold_listener(gobj);

    /*  Self-contained resize: the old shell pushed EV_RESIZE from
     *  __yui_main__; the new C_YUI_SHELL does not.  Observe our own
     *  $container box and drive ac_resize ourselves so the canvas
     *  follows content-area resizes (devtools, window, layout).
     *  rAF-debounced; graph.setSize does not change the observed
     *  box, so there is no feedback loop. */
    if(typeof ResizeObserver !== "undefined" && priv.$container) {
        let ro = new ResizeObserver(() => {
            if(priv._resize_raf) {
                cancelAnimationFrame(priv._resize_raf);
            }
            priv._resize_raf = requestAnimationFrame(() => {
                priv._resize_raf = 0;
                if(priv.graph && priv.graph_rendered) {
                    gobj_send_event(gobj, "EV_RESIZE", {}, gobj);
                }
            });
        });
        ro.observe(priv.$container);
        priv.resize_observer = ro;
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
    /*  A language change reaches the toolbars and the `+N` chips as
     *  the shell's EVENT, not as a raw i18next listener: what the
     *  toolbar draws and what a chip says are built here, out of
     *  reach of refresh_language(), so somebody has to repaint them
     *  -- and that somebody is an action of this machine, where the
     *  `machine` trace can see it. Same wiring as C_YUI_PERIOD and
     *  C_YUI_GOBJ_TREE_JS.  */
    let shell = yui_shell_of(gobj);
    if(shell) {
        gobj_subscribe_event(shell, "EV_LANGUAGE_CHANGED", {}, gobj);
    }

    return 0;
}

/***************************************************************
 *          Framework Method: Stop
 ***************************************************************/
function mt_stop(gobj)
{
    let priv = gobj.priv;
    let shell = yui_shell_of(gobj);
    if(shell) {
        gobj_unsubscribe_event(shell, "EV_LANGUAGE_CHANGED", {}, gobj);
    }

    /*  A camera move that settles after the view is gone has nobody
     *  to tell and a graph that is no longer there to read.  */
    if(priv._camera_timer) {
        clearTimeout(priv._camera_timer);
        priv._camera_timer = null;
    }

    return 0;
}

/***************************************************************
 *          Framework Method: Destroy
 ***************************************************************/
function mt_destroy(gobj)
{
    let priv = gobj.priv;

    uninstall_fold_listener(gobj);

    if(priv._on_pointerdown_focus) {
        priv.$container.removeEventListener(
            "pointerdown", priv._on_pointerdown_focus, true
        );
        priv._on_pointerdown_focus = null;
    }

    if(priv._on_focusout_restore) {
        priv.$container.removeEventListener(
            "focusout", priv._on_focusout_restore
        );
        priv._on_focusout_restore = null;
    }

    if(priv._on_native_contextmenu) {
        priv.$container.removeEventListener(
            "contextmenu", priv._on_native_contextmenu, true
        );
        priv._on_native_contextmenu = null;
    }

    if(priv.theme_observer) {
        priv.theme_observer.disconnect();
        priv.theme_observer = null;
    }

    if(priv.resize_observer) {
        priv.resize_observer.disconnect();
        priv.resize_observer = null;
    }
    if(priv._resize_raf) {
        cancelAnimationFrame(priv._resize_raf);
        priv._resize_raf = 0;
    }

    if(priv._uninstall_long_press) {
        priv._uninstall_long_press();
        priv._uninstall_long_press = null;
    }

    if(priv.graph) {
        priv.graph.destroy();
        priv.graph = null;
    }

    destroy_ui(gobj);
}




                    /***************************
                     *      Local Methods
                     ***************************/




/************************************************************
 *  Build node name: unique ID for a G6 node
 ************************************************************/
function build_node_name(gobj, topic_name, id)
{
    let priv = gobj.priv;

    return sprintf("node-%s-%s-%s", priv.treedb_name, topic_name, id);
}

/************************************************************
 *  Build edge id: independent, stable, auto-incremented.
 *
 *  The id is decoupled from the treedb relationship so that
 *  an edge can exist in intermediate states (dangling,
 *  half-connected) during design-mode interactions.
 *  The treedb semantics live in edge.data (see create_edge_data).
 ************************************************************/
function build_edge_id(gobj)
{
    let priv = gobj.priv;
    priv._edge_seq++;
    return sprintf("edge-%s-%d", priv.treedb_name, priv._edge_seq);
}

/************************************************************
 *  Create edge data structure — the semantic treedb relationship.
 *
 *  Lifecycle states:
 *
 *  DANGLING (just created, not connected to any port):
 *    all fields null
 *
 *  HALF-CONNECTED (one port attached):
 *    parent side OR child side filled in
 *
 *  FULLY-CONNECTED (both ports attached):
 *    all fields filled — ready for treedb_link_nodes
 ************************************************************/
function create_edge_data()
{
    return {
        hook_name:    null,
        fkey_name:    null,
        parent_topic: null,
        parent_id:    null,
        child_topic:  null,
        child_id:     null,
    };
}

/************************************************************
 *  Edge connection state queries
 ************************************************************/
function edge_is_fully_connected(edge_data)
{
    return !!(edge_data.hook_name && edge_data.fkey_name &&
              edge_data.parent_id && edge_data.child_id);
}

function edge_is_half_connected(edge_data)
{
    let has_parent = !!(edge_data.hook_name && edge_data.parent_id);
    let has_child  = !!(edge_data.fkey_name && edge_data.child_id);
    return (has_parent || has_child) && !(has_parent && has_child);
}

function edge_is_dangling(edge_data)
{
    return (!edge_data.hook_name && !edge_data.fkey_name &&
            !edge_data.parent_id && !edge_data.child_id);
}

/************************************************************
 *  Find all edges connected to a hook port on a parent node
 ************************************************************/
function get_edges_by_hook(gobj, parent_topic, parent_id, hook_name)
{
    let priv = gobj.priv;
    let graph = priv.graph;
    let edges = graph.getData().edges || [];
    return edges.filter(e =>
        e.data &&
        e.data.parent_topic === parent_topic &&
        e.data.parent_id    === parent_id &&
        e.data.hook_name    === hook_name
    );
}

/************************************************************
 *  Find all edges connected to a fkey port on a child node
 ************************************************************/
function get_edges_by_fkey(gobj, child_topic, child_id, fkey_name)
{
    let priv = gobj.priv;
    let graph = priv.graph;
    let edges = graph.getData().edges || [];
    return edges.filter(e =>
        e.data &&
        e.data.child_topic === child_topic &&
        e.data.child_id    === child_id &&
        e.data.fkey_name   === fkey_name
    );
}

/************************************************************
 *  Find the exact edge for a specific fully-connected
 *  treedb link (parent hook <-> child fkey).
 ************************************************************/
function get_edge_by_link(gobj, parent_topic, parent_id, hook_name,
                                child_topic, child_id, fkey_name)
{
    let priv = gobj.priv;
    let graph = priv.graph;
    let edges = graph.getData().edges || [];
    return edges.find(e =>
        e.data &&
        e.data.parent_topic === parent_topic &&
        e.data.parent_id    === parent_id &&
        e.data.hook_name    === hook_name &&
        e.data.child_topic  === child_topic &&
        e.data.child_id     === child_id &&
        e.data.fkey_name    === fkey_name
    ) || null;
}

/************************************************************
 *  Get default x,y for new nodes
 ************************************************************/
function get_default_ne_xy(gobj)
{
    let priv = gobj.priv;
    let xy = priv._xy;
    priv._xy += 5;
    return xy;
}

/************************************************************
 *   Build UI
 ************************************************************/
function build_ui(gobj)
{
    // $container set externally; tag it so the gclass owning this
    // G6 canvas is identifiable in the browser Inspector.
    let $container = gobj_read_attr(gobj, "$container");
    if($container) {
        $container.classList.add(GCLASS_NAME);
    }
}

/************************************************************
 *   Destroy UI
 ************************************************************/
function destroy_ui(gobj)
{
    // Nothing to do, $container set externally
}

/************************************************************
 *  Register custom G6 layouts
 ************************************************************/
let _g6_extensions_registered = false;

function register_layouts(gobj)
{
    if(!_g6_extensions_registered) {
        _g6_extensions_registered = true;
        register(ExtensionCategory.LAYOUT, 'manual', ManualLayout);
        register(ExtensionCategory.LAYOUT, 'treedb-tree', TreedbTreeLayout);
        register(ExtensionCategory.LAYOUT, 'treedb-compact', TreedbCompactLayout);
        register(ExtensionCategory.LAYOUT, 'treedb-radial', TreedbRadialLayout);
        register(ExtensionCategory.NODE, 'light', LightNode);
        register(ExtensionCategory.NODE, 'treedb-card', TreedbCard);
    }
}

/************************************************************
 *  Build a G6 graph instance
 ************************************************************/
function build_graph(gobj)
{
    let priv = gobj.priv;

    let layout = select_layout(gobj, priv.layout);

    const graph = priv.graph = new Graph({
        x: 0,
        y: 0,
        container: priv.$container,
        animation: false,
        autoResize: false,
        zoomRange: [0.2, 4],
        node: {  // WARNING this affect to all nodes with prevalence over individual defines!
            palette: {
                type: 'group',
                color: 'tableau',
                field: 'topic_name',
            },
            state: {
                selected: {
                    lineWidth: 2,
                    stroke: '#1890ff',
                    labelFill: '#000',          // Force black; remove to let G6 dark theme control it
                    labelFontWeight: 'normal',
                },
                /*  Topic focus highlight (EV_FOCUS_TOPIC): an amber halo on
                 *  every node of the focused topic. */
                active: {
                    lineWidth: 4,
                    stroke: '#f0a020',
                    halo: true,
                    haloStroke: '#f0a020',
                    haloLineWidth: 8,
                },
            },
        },

        edge: { // WARNING this affect to all edges with prevalence over individual defines!
            style: {
                startArrow: true,   // HACK target/source interchanged
                endArrow: false,
            },
        },

        plugins: [],
    });

    /*
     *  Set theme
     */
    graph.setTheme(priv.theme);

    graph.setLayout(layout);
    //show_positions(gobj);

    priv.graph_rendered = false;
    graph_render(gobj).then(() => {
        configure_events(gobj);
        configure_behaviour(gobj);
        configure_plugins(gobj);
        /*
         *  G6 plugin context only exists after render(); until now
         *  any plugin access (toolbar reconfig) throws.  Mark ready
         *  so deferred mode/layout/theme changes can reconfigure.
         */
        priv.graph_rendered = true;
    });
}

/************************************************************
 *  Configure G6 event handlers
 ************************************************************/
function configure_events(gobj)
{
    let priv = gobj.priv;
    let graph = priv.graph;

    /*  @antv/g makes a `click` out of every pointerdown/pointerup
     *  pair, this one included -- so the press that just opened the
     *  context menu goes on to click what it opened the menu ON. One
     *  press, one meaning: the press was already spent.  */
    graph.on(CanvasEvent.CLICK, (evt) => {
        if(consume_long_press_click(graph)) {
            return;
        }
        gobj_send_event(gobj, "EV_CANVAS_CLICK", {evt: evt}, gobj);
    });

    graph.on(NodeEvent.DRAG, (evt) => {
        update_resize_handles_position(gobj);
        update_port_resize_handles_position(gobj);
        update_edge_icon_position(gobj);
        update_node_icon_position(gobj);
        update_link_icon_position(gobj);
        update_port_icon_position(gobj);
    });

    graph.on(NodeEvent.DRAG_END, (evt) => {
        gobj_send_event(gobj, "EV_NODE_DRAG_END", {evt: evt}, gobj);
    });

    graph.on(NodeEvent.CLICK, (evt) => {
        if(consume_long_press_click(graph)) {
            return;
        }
        gobj_send_event(gobj, "EV_NODE_CLICK", {evt: evt}, gobj);
    });

    graph.on(NodeEvent.CONTEXT_MENU, (evt) => {
        gobj_send_event(gobj, "EV_NODE_CONTEXT_MENU", {evt: evt}, gobj);
    });

    graph.on(NodeEvent.DBLCLICK, (evt) => {
        gobj_send_event(gobj, "EV_NODE_DBLCLICK", {evt: evt}, gobj);
    });

    graph.on(EdgeEvent.CLICK, (evt) => {
        if(consume_long_press_click(graph)) {
            return;
        }
        gobj_send_event(gobj, "EV_EDGE_CLICK", {evt: evt}, gobj);
    });

    graph.on('aftertransform', () => {
        update_resize_handles_position(gobj);
        update_port_resize_handles_position(gobj);
        update_edge_icon_position(gobj);
        update_node_icon_position(gobj);
        update_link_icon_position(gobj);
        update_port_icon_position(gobj);
        update_zoom_readout(gobj);

        /*  Before the zoom/pan test below and not inside it: a PAN is
         *  a camera move too, and it is the reader's just as much as
         *  a zoom is.  */
        publish_camera_later(gobj);

        /*
         *  A ZOOM re-centres on the anchor; a PAN does not.
         *  `aftertransform` fires for both, and an anchor that also
         *  answered a drag would make the graph impossible to move
         *  while it is set. The zoom LEVEL is what tells them apart:
         *  it changes on a wheel notch and never on a drag.
         */
        let z = priv.last_zoom;
        try {
            z = priv.graph.getZoom();
        } catch(e) {
            return;
        }
        if(z === priv.last_zoom) {
            return;
        }
        priv.last_zoom = z;
        if(priv.anchor_state === "on" && priv.anchor_id) {
            yui_graph_center_on(priv.graph, priv.anchor_id);
        }
    });


    /*  Clicking a CARD is clicking a DOM element inside the container,
     *  and that takes the keyboard away from G6's canvas -- the only
     *  element that receives keydown. Selecting two nodes by clicking
     *  them and then pressing Escape did nothing, which is the most
     *  ordinary way there is to reach for it. The focus goes back on
     *  every press inside the graph.
     *
     *  Except on what is there to be typed into: the popovers this
     *  gclass appends to its own container carry inputs, and stealing
     *  their focus on pointerdown would make them impossible to fill
     *  in.
     */
    priv._on_pointerdown_focus = (ev) => {
        let target = ev.target;
        if(target && typeof target.closest === "function") {
            if(target.closest("input, textarea, select, [contenteditable]")) {
                return;
            }
            if(target.closest(".g6-confirm-popover, .g6-create-popover," +
                              ".g6-node-popover, .g6-edge-popover")) {
                return;
            }
        }
        let $canvas = main_canvas_of(priv.$container);
        if($canvas && typeof $canvas.focus === "function") {
            $canvas.focus({preventScroll: true});
        }
    };
    /*  Capture: the cards are DOM and may stop the press from
     *  bubbling.  */
    priv.$container.addEventListener(
        "pointerdown", priv._on_pointerdown_focus, true
    );

    /*  And put it back when it is taken away to NOWHERE.
     *
     *  Focusing on pointerdown is not enough on its own, which is
     *  measurable: the press does focus the canvas, and then the
     *  browser runs its own focus handling for the mousedown -- after
     *  ours -- and a card is not focusable, so it moves the focus to
     *  <body>. The graph goes deaf right after the click that
     *  selected something, which is the worst possible moment.
     *
     *  Only when it goes nowhere (`relatedTarget` null). A focus
     *  moving to a REAL element -- the find box, a dialog, the next
     *  tab stop -- is the user leaving, and is left alone.
     */
    priv._on_focusout_restore = (ev) => {
        if(ev.relatedTarget) {
            return;
        }
        if(gobj_is_destroying(gobj)) {
            return;
        }
        let $canvas = main_canvas_of(priv.$container);
        if($canvas && $canvas.isConnected && document.activeElement !== $canvas) {
            $canvas.focus({preventScroll: true});
        }
    };
    priv.$container.addEventListener("focusout", priv._on_focusout_restore);

    /*  The browser's own menu never opens over the graph.
     *
     *  The context-menu plugin calls preventDefault() on the event
     *  it is handed, and that event is the one @antv/g SYNTHESISES
     *  from `pointerdown` with `button === 2` -- not the DOM's
     *  `contextmenu`, which nobody cancelled. So a right click opened
     *  both menus, and where ours had nothing to show (an edge, the
     *  empty canvas) it opened the browser's alone. A form field of a
     *  popover keeps it: that is where cut and paste live.  */
    if(priv._on_native_contextmenu) {
        priv.$container.removeEventListener(
            "contextmenu", priv._on_native_contextmenu, true
        );
    }
    priv._on_native_contextmenu = (ev) => {
        let target = ev.target;
        if(target && typeof target.closest === "function" &&
                target.closest("input, textarea, select, [contenteditable]")) {
            return;
        }
        ev.preventDefault();
    };
    priv.$container.addEventListener(
        "contextmenu", priv._on_native_contextmenu, true
    );

    /*  The canvas carries a `tabIndex` of its own, so a keydown reaches
     *  us only while the GRAPH has focus. That is what keeps Ctrl+A in
     *  the find box a text selection and not a selection of every node:
     *  the focus is in the input, and the input is not inside the
     *  canvas. The callback only translates -- the work is in the
     *  action, like every other gesture here.  */
    graph.on("keydown", (evt) => {
        let ctrl = !!(evt.ctrlKey || evt.metaKey);

        if(ctrl && (evt.key === "a" || evt.key === "A")) {
            /*  Or the browser selects the page's text underneath.  */
            if(typeof evt.preventDefault === "function") {
                evt.preventDefault();
            }
        }

        gobj_send_event(gobj, "EV_KEY_DOWN", {key: evt.key, ctrl: ctrl}, gobj);
    });
}

/************************************************************
 *  Plugin configuration
 ************************************************************/
function configure_plugins(gobj)
{
    let priv = gobj.priv;

    if(gobj_read_bool_attr(gobj, "with_gridline")) {
        graph_add_plugin(
            gobj,
            'grid-line',
            {
                follow: false,
                stroke: priv.theme === 'dark'?'#343434':'#EEEEEE',
                borderStroke: priv.theme === 'dark'?'#656565':'#EEEEEE',
            }
        );
    }

    if(gobj_read_bool_attr(gobj, "with_fullscreen")) {
        graph_add_plugin(
            gobj,
            'fullscreen',
            {
                autoFit: true,
                /*  Track real state (covers toolbar, F/Esc keys and
                 *  browser-driven exit) and rebuild the toolbar so
                 *  only the relevant enter/exit icon is shown. */
                onEnter: () => {
                    gobj.priv.is_fullscreen = true;
                    update_toolbar(gobj);
                },
                onExit: () => {
                    gobj.priv.is_fullscreen = false;
                    update_toolbar(gobj);
                },
            }
        );
    }

    /*  What the menu is FOR: a node or an edge. Shared with the long
     *  press below, so the gesture arms itself on exactly what the
     *  menu would agree to open on.  */
    let menu_enable = (e) => {
        if(e.targetType === 'node') {
            return true;
        }
        /*  An edge's commands (its properties, unlink) are edition
         *  commands: in reading mode it has nothing to offer.  */
        return e.targetType === 'edge' && !!priv.edit_mode;
    };

    graph_add_plugin(
        gobj,
        'contextmenu',
        {
            trigger: 'contextmenu',
            onClick: (value) => {
                handle_context_menu_click(gobj, value);
            },
            getItems: (e) => {
                return build_context_menu_items(gobj, e);
            },
            enable: menu_enable,
        }
    );

    /*
     *  The menu above is the way to link, unlink, delete and resize,
     *  and `contextmenu` is a RIGHT CLICK -- G6 synthesises it from
     *  `pointerdown` with `button === 2` and reads nothing from the
     *  DOM event of the same name. So on a touch screen those
     *  commands had no door at all, whatever the browser does with a
     *  long press. Give them one.
     */
    if(priv._uninstall_long_press) {
        priv._uninstall_long_press();
    }
    priv._uninstall_long_press = install_long_press_contextmenu(
        priv.graph, {enable: menu_enable}
    );

    if(gobj_read_bool_attr(gobj, "with_toolbar")) {
        configure_toolbar(gobj);
        configure_toolbar_edit(gobj);
    }
}

/************************************************************
 *  Configure G6 Toolbar plugin
 *  Uses G6 built-in icons: zoom-in, zoom-out, redo, undo,
 *  edit, delete, auto-fit, export, reset
 ************************************************************/
function update_toolbar(gobj)
{
    let priv = gobj.priv;
    let graph = priv.graph;

    if(!gobj_read_bool_attr(gobj, "with_toolbar")) {
        return;
    }
    if(!priv.graph_rendered) {
        /*
         *  Called before render() resolved (e.g. operation mode
         *  restored from the route during view start).  configure_
         *  plugins() will build the toolbars from the stored attrs
         *  once render completes — nothing to do here yet.
         */
        return;
    }

    let toolbar = graph_get_plugin(gobj, 'toolbar');
    if(toolbar) {
        /*
         *  Force toolbar to re-render by updating the plugin.
         */
        graph.updatePlugin({
            key: 'toolbar',
        });
    }

    // Add or remove edit toolbar based on edit mode
    configure_toolbar_edit(gobj);

    let toolbar_edit = graph_get_plugin(gobj, 'toolbar-edit');
    if(toolbar_edit) {
        graph.updatePlugin({
            key: 'toolbar-edit',
        });
    }

    /*  A re-render rebuilds the innerHTML, so a button whose enabled
     *  state is not part of getItems() has to be told again.  */
    update_zoom_selection_button(gobj);
    update_selection_mode_button(gobj);
}

/************************************************************
 *  The floating toolbars follow the theme.
 *
 *  They used to be pinned to a light background in BOTH themes,
 *  with the icon colour pinned dark so it survived that -- two
 *  light islands sitting over a dark canvas. The tokens do the
 *  flipping now; the fallbacks are the old forced-light values, so
 *  a host without Bulma gets exactly what it had.
 ************************************************************/
/************************************************************
 *  Is the canvas too narrow to give both floating toolbars a
 *  strip of it?
 *
 *  They are drawn INSIDE the canvas, one on each edge. On a
 *  desktop that is a corner; on a 356px-wide phone canvas the
 *  two of them take a third of the drawing area and stand on
 *  top of the nodes -- and a node under a toolbar cannot be
 *  read, tapped or dragged out from under it.
 *
 *  Measured on the CONTAINER, not on the window: the same
 *  graph is a full page in one app and a card in a column in
 *  another, and it is the box it actually got that decides.
 ************************************************************/
const TOOLBAR_COLLAPSE_WIDTH = 480;

function toolbars_can_collapse(gobj)
{
    let $container = gobj.priv.$container;

    if(!$container) {
        return false;
    }
    let width = $container.getBoundingClientRect().width;
    if(!width) {
        return false;   /*  not laid out yet: decided on the first resize  */
    }
    return width < TOOLBAR_COLLAPSE_WIDTH;
}

/************************************************************
 *  Are they folded RIGHT NOW?  Wide enough and the question
 *  does not arise -- the desktop toolbar never grows a button
 *  it does not need.
 ************************************************************/
function toolbars_collapsed(gobj)
{
    if(!toolbars_can_collapse(gobj)) {
        return false;
    }
    return gobj.priv.toolbar_collapsed !== false;
}

/************************************************************
 *  The one item a folded toolbar shows, and the one an
 *  unfolded narrow toolbar adds to fold itself again.
 ************************************************************/
function toolbar_fold_item(gobj)
{
    if(toolbars_collapsed(gobj)) {
        return {
            id: 'g6-icon-toolbar-show', value: 'toolbar-toggle',
            className: 'EV_TOGGLE_TOOLBARS', title: t('show toolbar')
        };
    }
    return {
        id: 'g6-icon-toolbar-hide', value: 'toolbar-toggle',
        className: 'EV_TOGGLE_TOOLBARS', title: t('hide toolbar')
    };
}

function toolbar_style(extra)
{
    return Object.assign({
        backgroundColor: 'var(--bulma-scheme-main, #f5f5f5)',
        color:           'var(--bulma-text-strong, #333)',
        padding:         '8px',
        boxShadow:       '0 2px 8px rgba(0, 0, 0, 0.15)',
        borderRadius:    '8px',
        border:          '1px solid var(--bulma-border-weak, #e8e8e8)',
        opacity:         '0.85',
    }, extra || {});
}

/************************************************************
 *  The zoom level as a percentage, the way every editor that
 *  shows one writes it. Empty while the graph cannot be asked --
 *  the toolbar is built before the first draw, and a viewport
 *  that does not exist yet has no zoom to report.
 ************************************************************/
function zoom_percent_text(gobj)
{
    let graph = gobj.priv.graph;

    if(!graph || typeof graph.getZoom !== "function") {
        return "";
    }

    let zoom;
    try {
        zoom = graph.getZoom();
    } catch(e) {
        return "";
    }
    if(!zoom) {
        return "";
    }

    return `${Math.round(zoom * 100)}%`;
}

/************************************************************
 *  Repaint the zoom readout in place.
 *
 *  The text node is patched instead of re-rendering the plugin:
 *  the readout follows the wheel, and updatePlugin() rebuilds the
 *  whole toolbar's innerHTML -- which would also drop the disabled
 *  state of the edit buttons on every notch of the wheel.
 ************************************************************/
function update_zoom_readout(gobj)
{
    let $container = gobj_read_attr(gobj, "$container");

    if(!$container) {
        return;
    }

    let $readout = $container.querySelector(".G6_ZOOM_LEVEL");
    if(!$readout) {
        return;     /* no toolbar (with_toolbar false): nobody to report to */
    }

    $readout.textContent = zoom_percent_text(gobj);
}

function configure_toolbar(gobj)
{
    let priv = gobj.priv;
    let toolbar_position = gobj_read_str_attr(gobj, "toolbar_position") || "top-left";

    /*  Icons now come from OUR sprite (g6-icon-*), not G6 built-ins.
     *  The sprite must be in the DOM or every <use> resolves to
     *  nothing → blank buttons. Idempotent. */
    inject_svg_icons();

    graph_add_plugin(
        gobj,
        'toolbar',
        {
            type: 'yui-toolbar',
            className: 'g6-toolbar-large',
            position: toolbar_position,
            style: toolbar_style({
                marginTop:  '12px',
                marginLeft: '12px',
            }),
            getItems: () => {
                /*  Folded: ONE button, and it is the one that
                 *  unfolds. Everything else is behind it.  */
                if(toolbars_collapsed(gobj)) {
                    return [toolbar_fold_item(gobj)];
                }

                let items = [
                    { id: 'g6-icon-zoom-in',  value: 'zoom-in',  className: 'EV_ZOOM_IN',  title: t('zoom in')  },
                    { id: 'g6-icon-zoom-out', value: 'zoom-out', className: 'EV_ZOOM_OUT', title: t('zoom out') },
                    /*  What the two buttons above change. Every editor
                     *  that offers a zoom shows the number; without it
                     *  `1:1` is a jump to a value nobody was told.  */
                    { readout: true, className: 'G6_ZOOM_LEVEL',
                      text: zoom_percent_text(gobj), title: t('zoom level') },
                    { separator: true },
                    { id: 'g6-icon-fit',      value: 'auto-fit', className: 'EV_AUTO_FIT', title: t('auto fit') },
                    /*  `1:1`, not a house. The action is `zoomTo(1)`: it
                     *  sets the SCALE and leaves the camera where it was,
                     *  which is neither of the two things a house means
                     *  anywhere -- a map's initial extent, an editor's
                     *  starting view. Sitting under `fit`, the house read
                     *  as a second way to get the whole graph back, and
                     *  answered with the same corner of it at 100%.
                     *  Actual size is WRITTEN in every editor that offers
                     *  it, never drawn: there is no glyph for it.  */
                    { text: '1:1', value: 'reset', className: 'EV_ZOOM_RESET', title: t('actual size') },
                    /*  Pick one node and every zoom leaves it in the
                     *  middle. The pressed classes are baked in HERE and
                     *  not set afterwards, for the same reason the
                     *  selection-mode button bakes its own: this list is
                     *  rebuilt asynchronously, and a button told after
                     *  the rebuild came back OFF.  */
                    {
                        id: 'g6-icon-anchor', value: 'anchor',
                        /*  PRESSED is "on" and only "on": pressed is the
                         *  state the control is IN, and while it is
                         *  arming it is asking for something instead.  */
                        className: 'EV_TOGGLE_ANCHOR' +
                            (priv.anchor_state === "on"? ' pressed_state' : '') +
                            (priv.anchor_state === "arming"? ' color_pending_state' : ''),
                        title: anchor_title(priv.anchor_state)
                    },
                ];

                /*  Only in edition, because that is where a selection
                 *  can exist: a button that is permanently disabled is
                 *  not a control, it is furniture. Disabled while the
                 *  selection is empty -- `paint_selection` is the one
                 *  funnel every change goes through, so it is the one
                 *  place that has to say so.  */
                if(priv.edit_mode) {
                    items.push({
                        id: 'g6-icon-fit-selection', value: 'fit-selection',
                        className: 'EV_ZOOM_SELECTION',
                        title: t('zoom to selection'), disabled: true
                    });
                }

                if(gobj_read_bool_attr(gobj, "with_fullscreen")) {
                    /*  Full screen is a WINDOW control, not a camera one:
                     *  it goes in its own group.  */
                    items.push({ separator: true });
                    if(priv.is_fullscreen) {
                        items.push(
                            { id: 'g6-icon-fullscreen-exit', value: 'exit-fullscreen', className: 'EV_EXIT_FULLSCREEN', title: t('exit full screen') }
                        );
                    } else {
                        items.push(
                            { id: 'g6-icon-fullscreen', value: 'request-fullscreen', className: 'EV_REQUEST_FULLSCREEN', title: t('enter full screen') }
                        );
                    }
                }

                /*  Getting the canvas back is a window control too,
                 *  and the last thing in the strip: it is where the
                 *  single folded button will be.  */
                if(toolbars_can_collapse(gobj)) {
                    items.push({ separator: true });
                    items.push(toolbar_fold_item(gobj));
                }

                return items;
            },
            onClick: (value) => {
                switch(value) {
                    case 'zoom-in':
                        gobj_send_event(gobj, "EV_ZOOM_IN", {}, gobj);
                        break;
                    case 'zoom-out':
                        gobj_send_event(gobj, "EV_ZOOM_OUT", {}, gobj);
                        break;
                    case 'reset':
                        gobj_send_event(gobj, "EV_ZOOM_RESET", {}, gobj);
                        break;
                    case 'anchor':
                        gobj_send_event(gobj, "EV_TOGGLE_ANCHOR", {}, gobj);
                        break;
                    case 'auto-fit':
                        gobj_send_event(gobj, "EV_AUTO_FIT", {}, gobj);
                        break;
                    case 'fit-selection':
                        gobj_send_event(gobj, "EV_ZOOM_SELECTION", {}, gobj);
                        break;
                    case 'center':
                        gobj_send_event(gobj, "EV_CENTER", {}, gobj);
                        break;
                    case 'request-fullscreen':
                        gobj_send_event(gobj, "EV_REQUEST_FULLSCREEN", {}, gobj);
                        break;
                    case 'exit-fullscreen':
                        gobj_send_event(gobj, "EV_EXIT_FULLSCREEN", {}, gobj);
                        break;
                    case 'toolbar-toggle':
                        gobj_send_event(gobj, "EV_TOGGLE_TOOLBARS", {}, gobj);
                        break;
                }
            },
        }
    );
}

/************************************************************
 *  Configure G6 Edit Toolbar plugin (horizontal, top-right)
 *  Contains edit-mode buttons: Undo, Redo, Save
 ************************************************************/
function configure_toolbar_edit(gobj)
{
    let priv = gobj.priv;

    /*  Folded with the camera strip: the two of them are the same
     *  wall over the canvas, and hiding one is half a fix. Removed
     *  rather than emptied -- an empty toolbar is still a card with
     *  a border sitting on the graph.  */
    if(!priv.edit_mode || toolbars_collapsed(gobj)) {
        // Remove edit toolbar when not in edit mode
        graph_remove_plugin(gobj, 'toolbar-edit');
        return;
    }

    // Already exists, just update it
    if(graph_get_plugin(gobj, 'toolbar-edit')) {
        return;
    }

    /*  g6-icon-plus / g6-icon-save are OUR sprite symbols (undo/redo
     *  are G6 built-ins).  The sprite must be injected or the
     *  <use href="#g6-icon-..."> resolves to nothing → blank buttons
     *  in BOTH themes.  Idempotent. */
    inject_svg_icons();

    graph_add_plugin(
        gobj,
        'toolbar-edit',
        {
            type: 'yui-toolbar',
            className: 'g6-toolbar-large',
            position: 'left-top',
            style: toolbar_style(),
            getItems: () => {
                return [
                    { id: 'g6-icon-plus',  value: 'create-node', className: 'EV_CREATE_NODE_BTN color_create_state', title: t('create node') },
                    /*  The mode is carried in the class getItems()
                     *  returns, not only pushed onto the element after
                     *  the fact: this toolbar is rebuilt whole (a fold,
                     *  a language change), and the rebuilt DOM is not
                     *  there yet when the rebuild returns -- so a
                     *  button told afterwards came back OFF while the
                     *  graph was still listening for a selection.  */
                    {
                        id: 'g6-icon-select-mode', value: 'selection-mode',
                        className: 'EV_TOGGLE_SELECTION_MODE' +
                            (priv.selection_mode? ' pressed_state' : ''),
                        title: t('selection mode')
                    },
                    { id: 'g6-icon-save', value: 'save', className: 'EV_SAVE_GRAPH',   title: t('save'), disabled: true },
                    { id: 'g6-icon-undo', value: 'undo', className: 'EV_HISTORY_UNDO', title: t('undo'), disabled: true },
                    { id: 'g6-icon-redo', value: 'redo', className: 'EV_HISTORY_REDO', title: t('redo'), disabled: true },
                ];
            },
            onClick: (value) => {
                switch(value) {
                    case 'create-node':
                        toggle_create_popover(gobj);
                        break;
                    case 'selection-mode':
                        gobj_send_event(gobj, "EV_TOGGLE_SELECTION_MODE", {}, gobj);
                        break;
                    case 'undo':
                        gobj_send_event(gobj, "EV_HISTORY_UNDO", {}, gobj);
                        break;
                    case 'redo':
                        gobj_send_event(gobj, "EV_HISTORY_REDO", {}, gobj);
                        break;
                    case 'save':
                        gobj_send_event(gobj, "EV_SAVE_GRAPH", {}, gobj);
                        break;
                }
            },
        }
    );
}

/************************************************************
 *
 ************************************************************/
function show_positions(gobj)
{
    let priv = gobj.priv;
    let graph = priv.graph;
    window.console.log(`${gobj_short_name(gobj)}: show, size ${graph.getSize()}`);
    window.console.log(`${gobj_short_name(gobj)}: show, canvas center ${graph.getCanvasCenter()}`);
    window.console.log(`${gobj_short_name(gobj)}: show, position ${graph.getPosition()}`);
    window.console.log(`${gobj_short_name(gobj)}: show, viewport center ${graph.getViewportCenter()}`);
    window.console.log(`${gobj_short_name(gobj)}: show, zoom ${graph.getZoom()}`);
    window.console.log(`${gobj_short_name(gobj)}: show, rotation ${graph.getRotation()}`);
}

/************************************************************
 *  Layout selection
 ************************************************************/
function select_layout(gobj, layout_name)
{
    let priv = gobj.priv;

    if(!layout_name) {
        layout_name = priv.layout;
    }

    let layouts = Object.keys(_layouts);

    if(!layout_name || !str_in_list(layouts, layout_name)) {
        layout_name = layouts[0];
    }
    gobj_write_attr(gobj, "layout", layout_name);

    return _layouts[layout_name];
}

/************************************************************
 *  Set behavior of operation mode:
 *  reading, operation, writing, edition
 ************************************************************/
function configure_behaviour(gobj)
{
    let priv = gobj.priv;
    let operation_mode = priv.operation_mode;

    /*
     *  Behaviors
     */
    let behaviors = [];
    switch(operation_mode) {
        case "writing":
        case "reading":
            priv.edit_mode = false;
            behaviors = [
                "drag-canvas",
                ...camera_behaviors(),
            ];
            break;
        case "edition":
            priv.edit_mode = true;
            behaviors = [
                /*  Panning gives way while Shift is held: that is the
                 *  marquee's gesture, and G6 binds drag-canvas straight
                 *  to the drag events, so without this the canvas pans
                 *  under the rubber band.
                 *
                 *  And it gives way to a NODE drag, which is what G6's
                 *  own default `enable` says and what this one has to
                 *  repeat: `enable` REPLACES it, it does not add to it.
                 *  Dropping the `targetType` half made every drag of a
                 *  card pan the canvas as well as move the card -- the
                 *  card ran at twice the pointer and the whole graph
                 *  slid underneath it, on a move whose RESULT was
                 *  right, because a pan writes nothing.  */
                {
                    type: "drag-canvas",
                    key: "drag-canvas",
                    enable: (event) => {
                        if(event.shiftKey || priv.selection_mode) {
                            return false;
                        }
                        if('targetType' in event) {
                            return event.targetType === 'canvas';
                        }
                        return true;    /* a key, not a pointer */
                    },
                },
                ...camera_behaviors(),
                /*  Moves EVERY node in the `selected` state, not just
                 *  the one under the pointer, and wraps the whole move
                 *  in one history batch -- so a group move is one drag
                 *  and one undo. Nothing to configure: `selected` is
                 *  already its default `state`.  */
                "drag-element",
                /*  Shift+drag on the canvas: the rubber band. The
                 *  GESTURE is G6's, its RESULT enters the machine --
                 *  `onSelect` fires before G6 writes the state, so the
                 *  ids travel with the event and the action does not
                 *  have to race it.  */
                {
                    /*  Ours: the built-in also rewrites the state of
                     *  EVERY element on a canvas click, behind the
                     *  gclass's back and outside its history pause --
                     *  a command that changed nothing, and a Save
                     *  button lit on a graph nobody had touched.  */
                    type: BRUSH_SELECT_OWNED,
                    key: "brush-select",
                    /*  There is no Shift on a phone. The toolbar's
                     *  selection mode is that key made into a state:
                     *  with it on, the band needs no modifier -- and
                     *  panning stands aside above, because the two
                     *  cannot both be a plain drag.  */
                    trigger: priv.selection_mode ? [] : ["shift"],
                    /*  A band starts on the BACKGROUND. G6's default
                     *  (`enable: true`) does not look at what is under
                     *  the pointer, so a drag that begins on a card
                     *  drew a band and moved the card at the same
                     *  time.  */
                    enable: (event) => event.targetType === 'canvas',
                    enableElements: ["node"],
                    /*  Left at G6's default (false): the set is read at
                     *  pointerup, not on every pointermove. Each answer
                     *  repaints the cards it touches, and doing that per
                     *  frame of a rubber band over a hundred nodes is
                     *  paid for nothing -- the band already shows what
                     *  it covers.  */
                    immediately: false,
                    onSelect: (states) => {
                        let ids = Object.keys(states || {}).filter(
                            (id) => (states[id] || []).includes("selected")
                        );
                        gobj_send_event(gobj, "EV_BRUSH_SELECT", {ids: ids}, gobj);
                    },
                },
            ];
            break;
        case "operation":
            priv.edit_mode = false;
            /*  The camera is not an edit affordance: a mode that
             *  cannot pan or zoom is a picture, and this one was one
             *  -- `behaviors` was left empty here while `reading` and
             *  `writing` next door both fill it. On a desktop the
             *  toolbar still zooms and nothing pans; on a phone,
             *  where the gestures ARE the camera, the graph froze.  */
            behaviors = [
                "drag-canvas",
                ...camera_behaviors(),
            ];
            break;
        default:
            log_error(`operation mode unknown: ${operation_mode}`);
            break;
    }
    if(!priv.edit_mode) {
        /*  The selection and the mode that picks it both belong to
         *  edition, and neither survives leaving it.  */
        priv.selection_mode = false;
        deselect_node(gobj);
    }
    graph_write_behaviors(gobj, behaviors);
}

/************************************************************
 *  Count hooks and fkeys in topic desc, classify node type:
 *  `child` (no hooks), `extended` (hooks, no fkeys), `entity`
 *  (both). It sizes the card and nothing else. It used to be
 *  called `hierarchical`, and that word means something else now:
 *  a topic hooked to ITSELF, the only kind a tree can hang from
 *  (treedb_fold_model).
 ************************************************************/
function calculate_hooks_fkeys_counter(desc)
{
    let cols = desc.cols;
    desc.hooks_counter = 0;
    desc.fkeys_counter = 0;

    for(let i=0; i<cols.length; i++) {
        let col = cols[i];
        const field_desc = treedb_get_field_desc(col);
        switch(field_desc.type) {
            case "hook":
                desc.hooks_counter++;
                break;
            case "fkey":
                desc.fkeys_counter++;
                break;
        }
    }

    if(desc.hooks_counter === 0) {
        desc.node_treedb_type = 'child';
    } else if(desc.fkeys_counter === 0) {
        desc.node_treedb_type = 'extended';
    } else {
        desc.node_treedb_type = 'entity';
    }
}

/************************************************************
 *  Build ports for a topic desc
 ************************************************************/
/************************************************************
 *  Mix two colours the way `color-mix(in srgb, a p%, b)` does,
 *  in JS.
 *
 *  The cards are html and can say `color-mix()`; a PORT is drawn
 *  on the canvas by `@antv/g`, which parses a colour string and
 *  knows nothing about CSS functions -- so the same arithmetic
 *  has to happen here.
 ************************************************************/
function mix_colors(a, p, b)
{
    let rgb = (c) => {
        if(c.charAt(0) === "#") {
            let h = c.slice(1);
            if(h.length === 3) {
                h = h.split("").map((x) => x + x).join("");
            }
            return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
        }
        let n = (c.match(/[\d.]+/g) || []).map(Number);
        return n.slice(0, 3);
    };
    let A = rgb(a);
    let B = rgb(b);
    return `rgb(${A.map((v, i) => Math.round(v * p + B[i] * (1 - p))).join(",")})`;
}

/************************************************************
 *  The rim of a port.
 *
 *  A port is a knob half on a CARD and half on the canvas, and
 *  the card is a tint of a topic colour -- so a port of that
 *  same topic used to sit on its own colour: 2.62:1 against the
 *  card in dark, 1.54 in light, where a graphical object needs
 *  3:1 to be told from what is next to it. The FILL keeps saying
 *  which topic links there; the rim is what separates it, and it
 *  is the port's own colour pushed towards the surface -- 60% of
 *  the hue is enough to clear 3:1 on both grounds in both
 *  themes (4.49 / 3.64 against the card, 9.11 / 3.80 against the
 *  canvas) and little enough to keep the hue.
 *
 *  It used to be `getStrokeColor(color)` called with no theme,
 *  which is its LIGHT branch always: a rim darkened by 20% of a
 *  colour, on a card of the same colour.
 ************************************************************/
function port_rim(color, theme)
{
    return mix_colors(color, 0.6, (theme === "dark")? "#ffffff" : "#0f172a");
}

function build_ports(gobj, desc)
{
    let priv = gobj.priv;

    let top_ports = [];
    let bottom_ports = [];

    let cols = desc.cols;
    for(let i=0; i<cols.length; i++) {
        let col = cols[i];
        const field_desc = treedb_get_field_desc(col);
        let port = null;
        switch(field_desc.type) {
            case "hook":
                {
                    let child_desc = null;
                    let child_topic_name = Object.keys(col.hook)[0];
                    if(child_topic_name) {
                        child_desc = priv.descs[child_topic_name];
                    }
                    // Hook port: colour of the CHILD topic that can
                    // attach here — the colour is the visual cue of
                    // what links there.
                    port = {
                        key: col.id,
                        fill: child_desc?child_desc.color:desc.color,
                        stroke: port_rim(child_desc?child_desc.color:desc.color, priv.theme),
                    };
                    bottom_ports.push(port);
                }
                break;
            case "fkey":
                // Fkey port: colour of this topic (the node that
                // links out from here).
                port = {
                    key: col.id,
                    fill: desc.color,
                    stroke: port_rim(desc.color, priv.theme),
                };
                top_ports.push(port);
                break;
        }
    }

    place_ports(gobj, top_ports, bottom_ports);

    return [...top_ports, ...bottom_ports];
}

/************************************************************
 *  Which way the graph reads. `dagre` is the left-to-right
 *  layout; everything else keeps the top-down reading, `manual`
 *  included, because the saved arrangements were made with the
 *  ports on the top and bottom edges. The treedb tree reads down
 *  too, since 7.23.75: read right it was dagre's twin.
 ************************************************************/
const LR_LAYOUTS = ["dagre"];

/************************************************************
 *  The camera behaviors every operation mode shares: the wheel
 *  SCROLLS and Ctrl + wheel zooms.
 *
 *  Written in `yui_graph_camera.js` now, with the reasoning and
 *  the two traps, so the json graph and the gobj tree speak it
 *  too. It was the last gesture of the camera that this graph
 *  said one way and its siblings another.
 ************************************************************/
function camera_behaviors()
{
    return yui_graph_camera_behaviors();
}

function layout_direction(gobj)
{
    return str_in_list(LR_LAYOUTS, gobj.priv.layout)? "LR" : "TB";
}

function edge_type_for(gobj)
{
    return (layout_direction(gobj) === "LR")? "cubic-horizontal" : "cubic";
}

/************************************************************
 *  Where the ports sit, by direction: fkeys (the way in from a
 *  parent) all on one point of the leading edge, hooks (the way
 *  out to the children) spread along the trailing edge. Left and
 *  right when the graph reads left to right; top and bottom
 *  otherwise.
 ************************************************************/
function place_ports(gobj, fkey_ports, hook_ports)
{
    let lr = (layout_direction(gobj) === "LR");

    for(let i = 0; i < fkey_ports.length; i++) {
        fkey_ports[i].placement = lr? [0, 0.5] : [0.5, 0];
    }
    for(let i = 0; i < hook_ports.length; i++) {
        let point = getPointPosition(hook_ports.length, i);
        if(fkey_ports.length === 0 && !lr) {
            hook_ports[i].placement = [0, 0.5];
        } else if(lr) {
            hook_ports[i].placement = [1, point];
        } else {
            hook_ports[i].placement = [point, 1];
        }
    }
}

/************************************************************
 *  The layout changed direction: move every port to the edge
 *  the new reading needs, and give every edge the curve that
 *  goes with it. Called before the layout runs, so the lines
 *  are drawn once, in the right place.
 ************************************************************/
function apply_layout_direction(gobj)
{
    let priv = gobj.priv;
    let graph = priv.graph;

    if(!graph) {
        return;
    }

    let node_updates = [];
    for(let nd of (graph.getNodeData() || [])) {
        if(!nd || !nd.data || !nd.data.desc || !nd.style || !is_array(nd.style.ports)) {
            continue;
        }
        let desc = nd.data.desc;
        let fkey_ports = [];
        let hook_ports = [];
        for(let port of nd.style.ports) {
            let col = get_col_by_id(desc, port.key);
            let copy = Object.assign({}, port);
            if(col && col.fkey) {
                fkey_ports.push(copy);
            } else {
                hook_ports.push(copy);
            }
        }
        place_ports(gobj, fkey_ports, hook_ports);
        node_updates.push({id: nd.id, style: {ports: [...fkey_ports, ...hook_ports]}});
    }

    let type = edge_type_for(gobj);
    let edge_updates = [];
    for(let ed of (graph.getEdgeData() || [])) {
        if(ed && ed.type !== type) {
            edge_updates.push({id: ed.id, type: type});
        }
    }

    try {
        if(node_updates.length) {
            graph.updateNodeData(node_updates);
        }
        if(edge_updates.length) {
            graph.updateEdgeData(edge_updates);
        }
    } catch(e) {
        log_error(`${gobj_short_name(gobj)}: cannot turn the ports: ${e}`);
    }
}

/************************************************************
 *  Create a topic node in the G6 graph
 ************************************************************/
function create_topic_node(gobj, desc, record)
{
    let priv = gobj.priv;
    const graph = priv.graph;

    /*------------------------------------------*
     *  Creating filled cell from backend data
     *------------------------------------------*/
    let node_name = build_node_name(gobj, desc.topic_name, record.id);
    let xy = get_default_ne_xy(gobj);
    let geometry = get_node_graph_props(gobj, desc.topic_name, record.id, record);

    /*  The two kw_get_int() below carry KW_CREATE: `get_node_graph_props()`
     *  hands back the record's own `_geometry` object when it has one — and
     *  `{}` is one — so they WRITE the invented cascade coordinates into
     *  it. That is why the placed/total count auto_layout decides on is
     *  taken over the records BEFORE any card is built
     *  (count_placed_records): asked afterwards, every node of every
     *  treedb answers "placed" -- 126 of 126, all of them positions the
     *  app had just made up. */
    let x = kw_get_int(gobj, geometry, "x", xy, kw_flag_t.KW_CREATE);
    let y = kw_get_int(gobj, geometry, "y", xy, kw_flag_t.KW_CREATE);

    //log_warning(`create node ==> ${node_name}`);

    let pills_html = pills_html_of_key(gobj, fold_node_key(desc.topic_name, String(record.id)));
    let shape = node_shape_of(gobj, node_name, desc, record, geometry, pills_html);

    let node_def = {
        id: node_name,
        type: shape.type,
        style: Object.assign({x: x, y: y}, shape.style),
        data: {
            // This 4 keys are available in user `data` of G6 Node.
            topic_name: desc.topic_name,
            desc: desc,
            record: record,
            graph_props: geometry,  // from __graphs__ (or _geometry fallback)
            /*  The ports in schema order, whatever shape the node
             *  wears: the tree layout ranks the children by them, and
             *  a closed node carries no ports on its style.  */
            port_keys: build_ports(gobj, desc).map((p) => p.key),
        }
    };

    graph.addNodeData([node_def]);
}

/************************************************************
 *  The shape of a record node: OPEN (the card, with its ports)
 *  or CLOSED (a coloured square), by `node_mode` and the nodes
 *  toggled against it.
 *
 *  Both answer {type, style} WITHOUT x/y, which belong to the node
 *  and not to its shape, and a node moves between the two on the
 *  fly: G6 rebuilds the element when `type` changes, and the
 *  style is MERGED, which is why each shape also writes the keys
 *  the other one would leave behind (`labelText`, `ports`).
 ************************************************************/
function node_shape_of(gobj, node_id, desc, record, geometry, pills_html)
{
    switch(node_mode_of(gobj, node_id)) {
        case 'shape':
            return figure_shape_of(gobj, desc, record, geometry, {});
        case 'compact':
            return pill_shape_of(gobj, desc, record, geometry);
        default:
            return card_shape_of(gobj, desc, record, geometry, pills_html);
    }
}

/*  The view of ONE node: the graph's `node_mode`, unless the node
 *  was toggled against it -- an expanded node in a compact or shape
 *  graph, a compact one in an expanded graph.  */
function node_mode_of(gobj, node_id)
{
    let priv = gobj.priv;
    if(!priv._open_nodes) {
        priv._open_nodes = new Set();
    }
    let mode = gobj_read_str_attr(gobj, "node_mode");
    if(!mode || !str_in_list(NODE_MODES, mode)) {
        mode = 'expanded';
    }
    if(priv._open_nodes.has(node_id)) {
        return (mode === 'expanded')? 'compact' : 'expanded';
    }
    return mode;
}

/*  Not the full card: a pill or a figure. What the size bookkeeping
 *  asks -- neither has a size anybody chose, or pills to grow for.  */
function node_is_compact(gobj, node_id)
{
    return node_mode_of(gobj, node_id) !== 'expanded';
}

function topic_defaults_of(gobj, topic_name)
{
    let topic_props = gobj.priv._graph_properties[topic_name];
    return (is_object(topic_props) && is_object(topic_props.defaults))?
        topic_props.defaults : null;
}

/************************************************************
 *  What a node is PAINTED with: its own colours, then the
 *  topic's default, then the topic's colour.
 *
 *  A card is html, and its html was built with `desc.color`
 *  every time it was repainted -- so a colour chosen in the node
 *  properties popover lasted until the next selection, focus,
 *  theme or pill change, and was never written to `__graphs__`
 *  at all. Only the `shape` view kept it, because a figure is a
 *  native G6 node and `style.fill` is what paints it. The FIGURE
 *  was already remembered (`node_shape`); this is the wiring the
 *  colour was missing.
 ************************************************************/
function node_paint_of(gobj, desc, geometry)
{
    let defaults = topic_defaults_of(gobj, desc.topic_name);
    let g = is_object(geometry)? geometry : {};
    let fill = g.fill || (defaults && defaults.fill) || desc.color;
    let stroke = g.stroke || (defaults && defaults.stroke) || getStrokeColor(fill);
    let line_width = g.lineWidth || (defaults && defaults.lineWidth) || 1;
    return {fill: fill, stroke: stroke, lineWidth: line_width};
}

/************************************************************
 *  Write a chosen paint into an entry of `__graphs__` -- a
 *  node's or a topic's defaults.
 *
 *  A colour nobody chose is not saved: the topic's own colour,
 *  with the stroke and the line width that go with it, is what a
 *  card wears anyway, and writing it down would freeze today's
 *  palette on that card -- the trap the SIZES fell into in
 *  7.23.80, and the palette is assigned by POSITION (`ac_descs`),
 *  so it moves when a topic is added. Choosing it back MEANS
 *  forgetting the entry.
 ************************************************************/
function paint_into(entry, desc, fill, stroke, line_width)
{
    if(fill === desc.color && stroke === getStrokeColor(desc.color) && line_width === 1) {
        delete entry.fill;
        delete entry.stroke;
        delete entry.lineWidth;
        return;
    }
    entry.fill = fill;
    entry.stroke = stroke;
    entry.lineWidth = line_width;
}

/************************************************************
 *  The CARD: an html node, the tier's size, the ports, the
 *  saved geometry on top. The flags (focus, selection, anchor)
 *  are not painted here: repaint_cards() reads them where they
 *  live and rebuilds the html.
 ************************************************************/
function card_shape_of(gobj, desc, record, geometry, pills_html)
{
    let priv = gobj.priv;
    let node_treedb_type = desc.node_treedb_type;
    let label = node_label(desc, record);
    let ports = build_ports(gobj, desc);
    let paint = node_paint_of(gobj, desc, geometry);

    let style = {
        fill: paint.fill,
        stroke: paint.stroke,
        lineWidth: paint.lineWidth,
        lineDash: [],
        halo: false,
        labelText: "",      /*  a card says its name inside; the label is the square's  */
    };

    /*  The pills are part of the card, so the card is taller when it
     *  has any: a row of them on a 96px card sat on the subtitle.  */
    let size = card_size_for(node_treedb_type, !!pills_html);
    style.size = size;
    style.dx = -size[0] / 2;
    style.dy = -size[1] / 2;

    if(node_treedb_type === 'child') {
        // Pure child (LEAF): smallest tier. Rounded-rect chip,
        // same card language as entities, lighter.
        style.innerHTML = build_chip_innerHTML(
            paint.fill, priv.theme, record.icon, label, record.id
        );
    } else if(node_treedb_type === 'extended') {
        // Extended (structural / INTERMEDIATE): middle tier. Card
        // with name; "structural" style (neutral grey, dashed
        // border) to read as a container/junction.
        style.innerHTML = build_node_innerHTML(
            paint.fill, priv.theme, record.icon, label,
            desc.topic_name, true, record.id, false, false, false, pills_html
        );
    } else {
        // Entity, hooks and fkeys (ROOT / container): largest tier.
        style.innerHTML = build_node_innerHTML(
            paint.fill, priv.theme, record.icon, label,
            desc.topic_name, false, record.id, false, false, false, pills_html
        );
    }

    // Apply topic defaults (from "resize all") for nodes without saved geometry
    let topic_props = priv._graph_properties[desc.topic_name];
    let topic_defaults = (is_object(topic_props) && is_object(topic_props.defaults))?
        topic_props.defaults : null;
    if(topic_defaults) {
        let def_size = topic_defaults.size;
        if(!geometry.size && Array.isArray(def_size) && def_size.length > 0) {
            style.size = [...def_size];
            style.dx = -def_size[0] / 2;
            style.dy = -(def_size.length > 1 ? def_size[1] : def_size[0]) / 2;
        }
        if(!geometry.portR && topic_defaults.portR > 0) {
            style.portR = topic_defaults.portR;
        }
    }

    // Override size and portR with saved per-node geometry
    let saved_size = geometry.size;
    if(Array.isArray(saved_size) && saved_size.length > 0) {
        style.size = saved_size;
        // Recalculate dx/dy to keep content centered
        style.dx = -saved_size[0] / 2;
        style.dy = -(saved_size.length > 1 ? saved_size[1] : saved_size[0]) / 2;
    }
    if(geometry.portR > 0) {
        style.portR = geometry.portR;
    }

    dress_ports(gobj, style, ports, geometry, topic_defaults,
        node_treedb_type === 'child' ? PORT_R_CHILD : PORT_R_ENTITY, false);

    return {type: 'treedb-card', style: style};
}

/************************************************************
 *  The ports of a card or a pill, dressed: the node-level radius
 *  (saved, topic default, or the tier's), each port's own radius
 *  and shape (saved first, then the topic's per-port defaults, then
 *  the topic's one shape for every port). `fixed_r` -- the pill --
 *  ignores every saved radius: a pill has one size of port.
 ************************************************************/
function dress_ports(gobj, style, ports, geometry, topic_defaults, r_default, fixed_r)
{
    if(!json_size(ports)) {
        style.port = false;
        style.ports = [];
        return;
    }
    json_object_update_missing(style, {
        port: true,
        ports: ports,
        portR: r_default,
        portLineWidth: PORT_LINE_WIDTH,
    });
    if(fixed_r) {
        style.portR = r_default;
    }

    let port_sizes = fixed_r? null : geometry.port_sizes;
    let default_port_sizes = (!fixed_r && topic_defaults)? topic_defaults.port_sizes : null;
    let port_shapes = geometry.port_shapes;
    let default_port_shapes = topic_defaults? topic_defaults.port_shapes : null;
    let default_shape = topic_defaults? topic_defaults.port_shape : null;
    for(let i = 0; i < style.ports.length; i++) {
        let key = style.ports[i].key;
        let r = is_object(port_sizes)? port_sizes[key] : null;
        if(r == null && is_object(default_port_sizes)) {
            r = default_port_sizes[key];
        }
        if(r != null) {
            style.ports[i].r = r;
        }
        let shape = is_object(port_shapes)? port_shapes[key] : null;
        if(!shape && is_object(default_port_shapes)) {
            shape = default_port_shapes[key];
        }
        if(!shape) {
            shape = default_shape;
        }
        if(shape && str_in_list(PORT_SHAPES, shape)) {
            style.ports[i].shape = shape;
        }
    }
}

/************************************************************
 *  The PILL: one line with the name inside, the tint and the
 *  border of the topic, small ports on its edges -- the half-way
 *  house between the card and the figure, and the same one-line
 *  chip a leaf record already is, at the tier's width. No pills:
 *  a hook is opened from the card (expand the node).
 ************************************************************/
function pill_shape_of(gobj, desc, record, geometry)
{
    let priv = gobj.priv;
    let tier = desc.node_treedb_type;
    let size = PILL_SIZE[tier] || PILL_SIZE.entity;
    let ports = build_ports(gobj, desc);
    let paint = node_paint_of(gobj, desc, geometry);

    let style = {
        fill: paint.fill,
        stroke: paint.stroke,
        lineWidth: paint.lineWidth,
        lineDash: [],
        halo: false,
        labelText: "",
        size: [...size],
        dx: -size[0] / 2,
        dy: -size[1] / 2,
        innerHTML: build_chip_innerHTML(
            paint.fill, priv.theme, record.icon, node_label(desc, record), record.id
        ),
    };
    dress_ports(gobj, style, ports, geometry, topic_defaults_of(gobj, desc.topic_name),
        PORT_R_PILL, true);
    return {type: 'treedb-card', style: style};
}

/*  The pill's html with the flags it carries right now.  */
function pill_innerHTML_of(gobj, nd, theme, highlight, selected, anchored)
{
    let desc = nd.data.desc;
    let record = nd.data.record || {};
    return build_chip_innerHTML(
        node_fill_of(nd), theme, record.icon, node_label(desc, record), record.id,
        highlight, selected, anchored
    );
}

/*  The figure a `shape` node wears: the node's own, then the
 *  topic's default (the node properties popover writes both), then
 *  a circle.  */
function node_figure_of(gobj, desc, geometry)
{
    let shape = geometry? geometry.node_shape : null;
    if(!shape) {
        let defaults = topic_defaults_of(gobj, desc.topic_name);
        shape = defaults? defaults.node_shape : null;
    }
    return (shape && str_in_list(NODE_SHAPES, shape))? shape : DEFAULT_NODE_SHAPE;
}

/************************************************************
 *  The FIGURE: a native G6 node of the topic's colour -- a square,
 *  a circle, a diamond, a triangle, a hexagon, a star -- no ports,
 *  the name as a label under it when `node_labels` says so. Native
 *  and not html on purpose: G6's own stroke and halo paint on it,
 *  so the focus, the selection and the anchor are three keys of
 *  the style instead of a rebuilt innerHTML.
 *
 *      flags   {highlight, selected, anchored}
 ************************************************************/
function figure_shape_of(gobj, desc, record, geometry, flags)
{
    let priv = gobj.priv;
    let dark = (priv.theme === "dark");
    let f = flags || {};
    let tier = desc.node_treedb_type;
    let side = SHAPE_SIZE[tier] || SHAPE_SIZE.entity;
    let labels = gobj_read_bool_attr(gobj, "node_labels");
    let figure = node_figure_of(gobj, desc, geometry || {});
    let paint = node_paint_of(gobj, desc, geometry);

    /*  THE SAME PAINT AS THE CARD, and that is the point: a card, a
     *  pill and a figure are one record drawn at three sizes, so they
     *  cannot wear two different colour languages. The card is html and
     *  writes `color-mix()`; a canvas shape cannot, so the same mix is
     *  computed here -- with `mix_colors()`, which is in this file
     *  already and for this very reason (the ports).
     *
     *  It also gives the figure an EDGE. It used to be the raw topic
     *  colour filled, ringed by `getStrokeColor()` -- the same colour
     *  darkened 20%, which measures 1.4:1 against its own fill: not a
     *  border, a ramp, and a fan of them reads as a blurred picture.
     *  Tint inside, vivid colour around it, and the canto is there.  */
    let fill = dark? mix_colors(paint.fill, 0.25, "#2c3542")
                   : mix_colors(paint.fill, 0.10, "#ffffff");
    let stroke = dark? mix_colors(paint.fill, 0.85, "#ffffff") : paint.fill;
    /*  The card's and the pill's line width, 1 unless somebody chose
     *  another: the three views of a record wear the same outline.  */
    let line_width = paint.lineWidth;
    /*  A paint somebody CHOSE (a node's or a topic's own, saved in
     *  `__graphs__`) is not ours to reinterpret: it comes through as
     *  it was chosen.  */
    if(paint.stroke !== getStrokeColor(paint.fill)) {
        stroke = paint.stroke;
    }
    if(f.selected) {
        stroke = SELECT_RING;
        line_width = 3;
    }
    if(f.highlight) {
        stroke = highlight_color(priv.theme);
        line_width = 3;
    }
    /*  Dashed says "structural", as the extended card does; the
     *  anchor's mark is a tighter dash, as on the card.  */
    let dash = [];
    if(tier === 'extended') {
        dash = [4, 3];
    }
    if(f.anchored) {
        dash = [2, 2];
        line_width = Math.max(line_width, 2.5);
    }

    let style = {
        size: [side, side],
        radius: (figure === 'square')? Math.round(side / 5) : 0,
        fill: fill,
        stroke: stroke,
        lineWidth: line_width,
        lineDash: dash,
        halo: !!f.highlight,
        haloStroke: highlight_halo(priv.theme),
        haloLineWidth: 8,
        port: false,
        ports: [],
        labelText: labels? node_label(desc, record) : "",
        labelPlacement: 'bottom',
        labelFontSize: 11,
        labelFill: dark? '#e6e9ef' : '#2e333d',
        labelMaxWidth: 150,
        labelWordWrap: true,
        labelMaxLines: 1,
        labelTextOverflow: 'ellipsis',
        labelBackground: true,
        labelBackgroundFill: dark? '#1b2230' : '#ffffff',
        labelBackgroundOpacity: 0.85,
        labelBackgroundRadius: 3,
        labelPadding: [1, 3],
    };
    return {type: (figure === 'square')? 'rect' : figure, style: style};
}

/************************************************************
 *  Give these record nodes the shape their mode says, then
 *  repaint them with the flags they carry. A `+N` chip is not a
 *  record and keeps its own shape.
 ************************************************************/
function reshape_nodes(gobj, ids)
{
    let priv = gobj.priv;
    let graph = priv.graph;
    if(!graph) {
        return;
    }
    let updates = [];
    let touched = new Set();
    for(let id of ids) {
        let nd;
        try {
            nd = graph.getNodeData(id);
        } catch(e) {
            continue;
        }
        if(!nd || !nd.data || !nd.data.desc || is_more_node(nd)) {
            continue;
        }
        let geometry = nd.data.graph_props || {};
        let shape = node_shape_of(
            gobj, id, nd.data.desc, nd.data.record || {}, geometry, pills_html_of(gobj, nd)
        );
        updates.push({id: id, type: shape.type, style: shape.style});
        touched.add(id);
    }
    if(!updates.length) {
        return;
    }
    try {
        graph.updateNodeData(updates);
    } catch(e) {
        log_error(`${gobj_short_name(gobj)}: cannot reshape the nodes: ${e}`);
        return;
    }
    repaint_cards(gobj, touched);
}

function all_record_node_ids(gobj)
{
    let graph = gobj.priv.graph;
    let ids = [];
    for(let nd of ((graph && graph.getNodeData()) || [])) {
        if(nd && nd.data && nd.data.desc && !is_more_node(nd)) {
            ids.push(nd.id);
        }
    }
    return ids;
}

/************************************************************
 *  Update topic node data
 ************************************************************/
function update_topic_node(gobj, desc, node_name, record)
{
    let priv = gobj.priv;
    let graph = priv.graph;

    try {
        let nodedata = graph.getNodeData(node_name);
        if(!nodedata) {
            log_error(`update_topic_node: node not found: ${node_name}`);
            return;
        }

        // Update record data
        nodedata.data.record = record;

        /*  Regenerate the card for the new record, with the flags it
         *  carries right now (repaint_cards reads them where they live).  */
        repaint_cards(gobj, new Set([node_name]));
    } catch(e) {
        log_error(e.message);
    }
}

/************************************************************
 *  Remove a topic node from G6 graph
 ************************************************************/
function remove_topic_node(gobj, node_name)
{
    let priv = gobj.priv;
    let graph = priv.graph;

    try {
        let nodedata = graph.getNodeData(node_name);
        if(nodedata) {
            graph.removeNodeData([node_name]);
        }
    } catch(e) {
        log_error(e.message);
    }
}

/************************************************************
 *  Update local record in records dict
 ************************************************************/
function update_local_node(gobj, topic_name, node)
{
    let priv = gobj.priv;

    let records = priv.records[topic_name];
    if(!records) {
        return;
    }

    for(let i=0; i<records.length; i++) {
        if(records[i].id === node.id) {
            records[i] = node;
            return;
        }
    }
}

/************************************************************
 *  Remove local record from records dict
 ************************************************************/
function remove_local_node(gobj, topic_name, node)
{
    let priv = gobj.priv;

    let records = priv.records[topic_name];
    if(!records) {
        return;
    }

    for(let i=0; i<records.length; i++) {
        if(records[i].id === node.id) {
            records.splice(i, 1);
            return;
        }
    }
}

/************************************************************
 *  Collect all fkey references from a record as a Set.
 *
 *  Each entry is a string: "col_id\tcol_idx\tfkey_value"
 *  where col_idx is the index into desc.cols for recovering
 *  the col object, and fkey_value is the raw fkey string
 *  (e.g. "departments^direction^departments" or just "admin").
 *
 *  This allows diffing old vs new records to find added/removed
 *  links without destroying and recreating all edges.
 ************************************************************/
function collect_fkey_refs(desc, record)
{
    let refs = new Set();
    let cols = desc.cols;
    for(let i=0; i<cols.length; i++) {
        let col = cols[i];
        if(!col.fkey) {
            continue;
        }
        let fkeys = record[col.id];
        if(fkeys) {
            if(is_array(fkeys)) {
                for(let j=0; j<fkeys.length; j++) {
                    let key = treedb_encoder_fkey(col, fkeys[j]);
                    if(key) {
                        refs.add(i + "\t" + key);
                    }
                }
            } else {
                // string or object — normalize to canonical form
                let key = treedb_encoder_fkey(col, fkeys);
                if(key) {
                    refs.add(i + "\t" + key);
                }
            }
        }
    }
    return refs;
}

/************************************************************
 *  Draw links for a record based on its fkey fields
 ************************************************************/
function draw_links(gobj, desc, record, initial_load)
{
    let cols = desc.cols;
    let topic_name = desc.topic_name;
    let record_id = record.id;

    for(let i=0; i<cols.length; i++) {
        let col = cols[i];
        if(!col.fkey) {
            continue;
        }

        let fkeys = record[col.id];

        if(fkeys) {
            if(is_array(fkeys)) {
                for(let j=0; j<fkeys.length; j++) {
                    draw_link(gobj, topic_name, record_id, col, fkeys[j], initial_load);
                }
            } else {
                // string or object
                draw_link(gobj, topic_name, record_id, col, fkeys, initial_load);
            }
        }
    }
}

/************************************************************
 *  Draw a single link (edge) between two nodes.
 *
 *  The edge gets an independent id (build_edge_id) and
 *  carries the full treedb relationship in its data section.
 ************************************************************/
function draw_link(
    gobj,
    child_topic,
    child_id,
    source_col,
    fkey,
    verbose
)
{
    let priv = gobj.priv;
    let graph = priv.graph;

    /*
     *  Decode fkey: the link to the parent
     */
    let target_fkey = treedb_decoder_fkey(source_col, fkey);
    if(!target_fkey) {
        log_error("draw_link: cannot decode fkey");
        return;
    }
    let parent_topic = target_fkey.topic_name;
    let parent_desc = priv.descs[parent_topic];
    if(parent_desc && parent_desc.node_treedb_type === 'extended') {
        return;
    }
    let parent_id  = target_fkey.id;
    let hook_name  = target_fkey.hook_name;
    let fkey_name  = source_col.id;

    let parent_node = build_node_name(gobj, parent_topic, parent_id);

    /*
     *  Parent node must exist
     */
    let parent_cell;
    try {
        parent_cell = graph.getNodeData(parent_node);
    } catch(e) {
        if(verbose) {
            log_error(e.message);
        }
    }
    if(!parent_cell) {
        if(verbose) {
            log_error(`${gobj_short_name(gobj)}: parent node NOT FOUND: ${parent_node}`);
        }
        return;
    }

    /*
     *  Child node (me) -- on screen too, or there is nothing to draw
     *  to: a folded child's parent is visible and the child is not.
     */
    let child_node = build_node_name(gobj, child_topic, child_id);
    let child_cell = null;
    try {
        child_cell = graph.getNodeData(child_node);
    } catch(e) {
        child_cell = null;
    }
    if(!child_cell) {
        if(verbose) {
            log_error(`${gobj_short_name(gobj)}: child node NOT FOUND: ${child_node}`);
        }
        return;
    }

    /*  Once. The reconcile after a fold redraws the links of every
     *  visible node, and an edge id is a counter: without this every
     *  reconcile laid a second line over the first.  */
    if(get_edge_by_link(gobj, parent_topic, parent_id, hook_name,
                        child_topic, child_id, fkey_name)) {
        return;
    }

    /*
     *  Create the edge with independent id and semantic data
     *  HACK: source/target are interchanged so arrows point parent -> child
     */
    let is_tree = (parent_topic === child_topic);
    let edge_style = edge_style_of(gobj, {
        parent_topic: parent_topic,
        parent_id:    parent_id,
        hook_name:    hook_name,
        child_id:     child_id,
        is_tree:      is_tree,
    });
    let saved_lineWidth = edge_style.lineWidth;
    let saved_stroke = edge_style.stroke;
    let themed_default = edge_style.themed_default;

    let edge = {
        id: build_edge_id(gobj),
        type: edge_type_for(gobj),
        source: parent_node,
        target: child_node,
        style: {
            sourcePort: hook_name,
            targetPort: fkey_name,
            lineWidth: saved_lineWidth,
            stroke: saved_stroke,
        },
        data: {
            parent_topic: parent_topic,
            parent_id:    parent_id,
            hook_name:    hook_name,
            child_topic:  child_topic,
            child_id:     child_id,
            fkey_name:    fkey_name,
            is_tree:        is_tree,
            themed_default: themed_default,
        }
    };

    try {
        graph.addEdgeData([edge]);
    } catch(e) {
        if(verbose) {
            log_error(e.message);
        }
    }
}

/************************************************************
 *  Clear links for a record
 ************************************************************/
function clear_links(gobj, desc, record, verbose)
{
    let cols = desc.cols;
    let topic_name = desc.topic_name;
    let record_id = record.id;

    for(let i=0; i<cols.length; i++) {
        let col = cols[i];
        if(!col.fkey) {
            continue;
        }

        let fkeys = record[col.id];

        if(fkeys) {
            if(is_array(fkeys)) {
                for(let j=0; j<fkeys.length; j++) {
                    clear_link(gobj, topic_name, record_id, col, fkeys[j], verbose);
                }
            } else {
                // string or object
                clear_link(gobj, topic_name, record_id, col, fkeys, verbose);
            }
        }
    }
}

/************************************************************
 *  Clear a single link (edge).
 *  Finds the edge by its semantic data, removes by its id.
 ************************************************************/
function clear_link(
    gobj,
    child_topic,
    child_id,
    source_col,
    fkey,
    verbose
)
{
    let target_fkey = treedb_decoder_fkey(source_col, fkey);
    if(!target_fkey) {
        log_error("clear_link: cannot decode fkey");
        return;
    }

    let edge = get_edge_by_link(gobj,
        target_fkey.topic_name, target_fkey.id, target_fkey.hook_name,
        child_topic, child_id, source_col.id
    );

    if(edge) {
        let priv = gobj.priv;
        let graph = priv.graph;
        try {
            graph.removeEdgeData([edge.id]);
        } catch(e) {
            if(verbose) {
                log_error(e.message);
            }
        }
    } else if(verbose) {
        log_error(`${gobj_short_name(gobj)}: clear_link: edge not found for ` +
            `${target_fkey.topic_name}^${target_fkey.id}^${target_fkey.hook_name} -> ` +
            `${child_topic}^${child_id}^${source_col.id}`
        );
    }
}

/************************************************************
 *  Build _graph_properties from __graphs__ records.
 *  Indexes active __graphs__ records by topic_name for
 *  fast per-node geometry/style lookups.
 ************************************************************/
function build_graph_properties(gobj)
{
    let priv = gobj.priv;
    priv._graph_properties = {};

    for(let i = 0; i < priv.__graphs__.length; i++) {
        let rec = priv.__graphs__[i];
        if(!rec.active || !rec.topic) {
            continue;
        }
        let props = rec.properties;
        if(is_object(props)) {
            priv._graph_properties[rec.topic] = props;
        }
    }
}

/************************************************************
 *  Get graph properties for a specific node.
 *  Returns the node's visual properties from __graphs__,
 *  falling back to record._geometry for backward compat.
 ************************************************************/
function get_node_graph_props(gobj, topic_name, node_id, record)
{
    let priv = gobj.priv;

    // Primary source: __graphs__ properties
    let topic_props = priv._graph_properties[topic_name];
    if(topic_props && is_object(topic_props.nodes)) {
        let node_props = topic_props.nodes[node_id];
        if(is_object(node_props)) {
            return node_props;
        }
    }

    // Fallback: legacy _geometry on the record
    if(is_object(record._geometry)) {
        return record._geometry;
    }

    return {};
}

/************************************************************
 *  Update geometry of a single node into _graph_properties.
 *  Collects x, y, size from the current render style and
 *  stores them in the in-memory _graph_properties structure.
 *  Also updates the node data's graph_props reference.
 ************************************************************/
function update_geometry(gobj, node_id)
{
    let priv = gobj.priv;
    let graph = priv.graph;

    let nodedata = graph.getNodeData(node_id);
    let style = graph.getElementRenderStyle(node_id);
    let topic_name = nodedata.data.topic_name;
    let record = nodedata.data.record;

    // Ensure topic entry exists in _graph_properties
    if(!is_object(priv._graph_properties[topic_name])) {
        priv._graph_properties[topic_name] = {};
    }
    let topic_props = priv._graph_properties[topic_name];
    if(!is_object(topic_props.nodes)) {
        topic_props.nodes = {};
    }

    /*  Extract geometry from render style -- the POSITION always, the
     *  SIZE only when somebody chose it. A card on the tier's default
     *  used to be saved with that default, so every Save froze the
     *  library's size of the day into `__graphs__` and a later default
     *  (bigger ports, 7.23.75/79) reached no saved treedb: the same
     *  trap as the invented cascade coordinates, for the size. And a
     *  CLOSED node is a square: its render size is not the card's and
     *  is never saved as one -- the entry keeps what it had.  */
    let node_props = topic_props.nodes[record.id] || {};
    let picked = kw_clone_by_keys(gobj, style, ["x", "y", "size", "portR"]);
    if(node_is_compact(gobj, node_id)) {
        delete picked.size;
        delete picked.portR;
    } else {
        let desc = nodedata.data.desc;
        let def_size = card_size_for(desc.node_treedb_type, !!pills_html_of(gobj, nodedata));
        if(is_array(picked.size) && picked.size[0] === def_size[0] &&
                picked.size[1] === def_size[1]) {
            delete picked.size;
            delete node_props.size;
        }
        let def_r = (desc.node_treedb_type === 'child')? PORT_R_CHILD : PORT_R_ENTITY;
        if(picked.portR === def_r) {
            delete picked.portR;
            delete node_props.portR;
        }
    }
    json_object_update(node_props, picked);

    // Save per-port radius values (only ports with custom r)
    if(!node_is_compact(gobj, node_id)) {
        let node_style = nodedata.style || {};
        let ports = node_style.ports || [];
        let port_sizes = {};
        for(let i = 0; i < ports.length; i++) {
            if(ports[i].r != null) {
                port_sizes[ports[i].key] = ports[i].r;
            }
        }
        if(Object.keys(port_sizes).length > 0) {
            node_props.port_sizes = port_sizes;
        } else {
            delete node_props.port_sizes;
        }
        // And the shape of each port that is not a circle
        let port_shapes = {};
        for(let i = 0; i < ports.length; i++) {
            if(ports[i].shape && ports[i].shape !== 'circle') {
                port_shapes[ports[i].key] = ports[i].shape;
            }
        }
        if(Object.keys(port_shapes).length > 0) {
            node_props.port_shapes = port_shapes;
        } else {
            delete node_props.port_shapes;
        }
    }

    topic_props.nodes[record.id] = node_props;

    // Keep node data's graph_props in sync
    nodedata.data.graph_props = node_props;
}

/************************************************************
 *  Save all node geometries to __graphs__ topic.
 *  One EV_UPDATE_NODE per topic instead of one per node.
 ************************************************************/
function save_geometry(gobj)
{
    let priv = gobj.priv;
    let graph = priv.graph;

    /*  Collect geometry for the nodes ON SCREEN into _graph_properties.
     *  A folded node keeps the entry it had: nothing here touches it.
     *  A `+N` chip is not a record and has no entry to keep.  */
    const nodes = graph.getData().nodes;
    for(let i = 0; i < nodes.length; i++) {
        if(!nodes[i].data || !nodes[i].data.desc) {
            continue;
        }
        update_geometry(gobj, nodes[i].id);
    }

    // Collect edge styles into _graph_properties
    const edges = graph.getData().edges;
    for(let i = 0; i < edges.length; i++) {
        update_edge_geometry(gobj, edges[i].id);
    }

    // Save one __graphs__ record per topic
    let origin = gobj_read_str_attr(gobj_yuno(), "node_uuid");

    for(const [topic_name, properties] of Object.entries(priv._graph_properties)) {
        // Add origin metadata
        properties.__origin__ = origin;

        let kw_update = {
            treedb_name: priv.treedb_name,
            topic_name: "__graphs__",
            record: {
                id: topic_name,
                topic: topic_name,
                active: true,
                properties: properties
            },
            options: {
                list_dict: true,
                autolink: false,
                create: true    // Create if doesn't exist, update if it does
            }
        };
        gobj_publish_event(gobj, "EV_UPDATE_NODE", kw_update);
    }
}

/************************************************************
 *  Save __graphs__ properties for a single topic to backend.
 ************************************************************/
function save_topic_graph_properties(gobj, topic_name)
{
    let priv = gobj.priv;
    let properties = priv._graph_properties[topic_name];
    if(!properties) {
        return;
    }

    let origin = gobj_read_str_attr(gobj_yuno(), "node_uuid");
    properties.__origin__ = origin;

    let kw_update = {
        treedb_name: priv.treedb_name,
        topic_name: "__graphs__",
        record: {
            id: topic_name,
            topic: topic_name,
            active: true,
            properties: properties
        },
        options: {
            list_dict: true,
            autolink: false,
            create: true
        }
    };
    gobj_publish_event(gobj, "EV_UPDATE_NODE", kw_update);
}

/************************************************************
 *  Pause/resume history recording.
 *
 *  Backend-driven updates (node created/updated/deleted) must
 *  not be recorded as undoable user actions.
 *
 *  Uses a flag checked by the history plugin's beforeAddCommand
 *  callback — when paused, beforeAddCommand returns false and
 *  the command is not added to the undo queue.
 ************************************************************/
function history_pause(gobj)
{
    gobj.priv._history_paused = true;
}

function history_resume(gobj)
{
    gobj.priv._history_paused = false;
}

/************************************************************
 *  The history plugin exists while the graph is in EDITION,
 *  and only there.
 *
 *  It used to be installed at one MOMENT -- the arrival of the
 *  last topic of the load -- and only if the graph happened to
 *  be in edition right then. Entering edition afterwards, which
 *  is the ordinary way in (the graph opens in reading and the
 *  mode selector is next to it), left no history at all: Undo
 *  and Redo were dead buttons that never even lit, `history_
 *  pause()` had no `beforeAddCommand` to answer, and the Save
 *  button was told the graph was dirty by `mark_graph_dirty()`
 *  alone -- which is why a move offered Save without Undo.
 *
 *  So it follows the MODE, and every place that changes the
 *  mode calls this.
 ************************************************************/
function sync_history_plugin(gobj)
{
    let priv = gobj.priv;

    if(!priv.graph || !priv.graph_rendered) {
        /*  Nothing to hang a plugin on yet: the load path calls
         *  this again once the graph is drawn.  */
        return;
    }

    if(priv.edit_mode) {
        graph_add_plugin(gobj, "history");
    } else {
        graph_remove_plugin(gobj, "history");
    }

    update_history_buttons(gobj);
}

/************************************************************
 *
 ************************************************************/
function update_history_buttons(gobj)
{
    let priv = gobj.priv;
    let $container = gobj_read_attr(gobj, "$container");

    if(priv.edit_mode) {
        const history = graph_get_plugin(gobj, "history");
        if(history) {
            if(history.canRedo()) {
                enableElements($container, ".EV_HISTORY_REDO");
                set_active_state($container, ".EV_HISTORY_REDO", true);
            } else {
                disableElements($container, ".EV_HISTORY_REDO");
                set_active_state($container, ".EV_HISTORY_REDO", false);
            }

            if (history.canUndo()) {
                enableElements($container, ".EV_HISTORY_UNDO");
                set_active_state($container, ".EV_HISTORY_UNDO", true);

                // Pending changes exist, enable save
                enableElements($container, ".EV_SAVE_GRAPH");
                set_submit_state($container, ".EV_SAVE_GRAPH", true);
            } else {
                disableElements($container, ".EV_HISTORY_UNDO");
                set_active_state($container, ".EV_HISTORY_UNDO", false);

                // No more undos: graph is back to original state, disable save
                disableElements($container, ".EV_SAVE_GRAPH");
                set_submit_state($container, ".EV_SAVE_GRAPH", false);
            }
        } else {
            disableElements($container, ".EV_HISTORY_REDO");
            set_active_state($container, ".EV_HISTORY_REDO", false);

            disableElements($container, ".EV_HISTORY_UNDO");
            set_active_state($container, ".EV_HISTORY_UNDO", false);
        }
    }
}

/************************************************************
 *  Graph utility functions
 *
 *  From the G6 documentation:
 *
 *  Reorganization after adding data
 *      // Add new nodes and edges
 *      graph.addData({
 *          nodes: [{id: 'newNode1'}, {id: 'newNode2'}],
 *          edges: [{id: 'newEdge', origin: 'existingNode', destination: 'newNode1'}]
 *      });
 *
 *      // Draw new nodes and edges
 *      await graph.draw();
 *
 *      // Recalculate the layout
 *      await graph.layout();

    What does graph.render() do? it calls internally to graph.layout()?
    graph.render() does call layout internally. Here's what it does

    render()
    ├── prepare()           // init canvas + runtime
    ├── BEFORE_RENDER event
    ├── [one of three branches depending on layout config:]
    │   ├── No layout       → draw({ type: 'render' }) + autoFit()
    │   ├── Pre-layout      → preLayoutDraw() + autoFit()
    │   └── Post-layout     → draw({ type: 'render' }) + postLayout() + autoFit()
    ├── this.rendered = true
    └── AFTER_RENDER event

    And graph.layout() (graph.ts:1209) is just a thin wrapper:
    public async layout(layoutOptions?: LayoutOptions) {
        await this.context.layout!.postLayout(layoutOptions);
    }

    So render() calls postLayout() directly (the same thing layout() calls) in the post-layout branch.

    Key difference from the documentation's draw() + layout() pattern:

    - render(): Full pipeline:
            initializes canvas/runtime + draw + layout + autoFit.
            Use on first render.
    - draw(): Only redraws elements — no layout recalculation.
    - layout(): Only recalculates positions and redraws — no canvas init.

    After addData(), using draw() + layout() is preferred over render()
    because render() re-runs prepare() (canvas init) which is unnecessary overhead.
    However, render() would also work since it does include layout.


 ************************************************************/
async function graph_center(gobj)
{
    let priv = gobj.priv;
    let graph = priv.graph;

    await graph.fitCenter();
}

async function graph_fitview(gobj)
{
    let priv = gobj.priv;
    let graph = priv.graph;

    await graph.fitView();
}

/*  Below this the cards carry no readable text at all. */
const MIN_READABLE_ZOOM = 0.5;


/************************************************************
 *  THE CAMERA IS THE READER'S.
 *
 *  Once somebody has chosen a zoom, nothing but a camera
 *  command may change it -- not a refresh, not a change of node
 *  mode, not a new main topic. Those rebuild the CONTENT, and
 *  the content moving is no reason to move the reader.
 *
 *  Two mechanisms, because they answer two different questions:
 *
 *    - across a rebuild in the same view, the anchor pair
 *      (`yui_graph_viewport_of` / `yui_graph_place_at`) keeps a
 *      NODE at the pixel it was on, which survives a relayout
 *      that moves everything;
 *    - across a RELOAD there is no node to hold on to yet, so
 *      the viewport itself is restored -- zoom and position, as
 *      G6 reports them.
 ************************************************************/
const CAMERA_SETTLE_MS = 700;

/*  A camera is saved as a NODE at a VIEWPORT PIXEL, plus the zoom --
 *  never as G6's own position.
 *
 *  `translateTo()` does not take viewport pixels: an absolute translate
 *  leaves the camera at `canvasCentre - T/zoom`, so `getPosition()` and
 *  `translateTo()` are only each other's inverse at zoom 1. Restoring
 *  one with the other brought the zoom back and put the graph somewhere
 *  else, which is exactly what it looks like -- and the reason to write
 *  the pair down (`yui_graph_place_at`, gobj-ui 7.23.29) was that it
 *  had already cost fifteen iterations once.
 *
 *  A node and a pixel is also the SAME thing the folds keep across a
 *  rebuild. One idea, used twice.  */
/*  The drawn node nearest the middle of the VIEWPORT, among the ones
 *  inside it; "" when there is none -- which is a blank view.  */
function node_nearest_view_centre(gobj)
{
    let graph = gobj.priv.graph;
    let size;
    try {
        size = graph.getSize();
    } catch(e) {
        return "";      /*  between renders: nothing is drawn  */
    }
    if(!is_array(size) || !(size[0] > 0) || !(size[1] > 0)) {
        return "";
    }
    let [w, h] = size;
    let best = "";
    let best_d = Infinity;
    for(let nd of (graph.getNodeData() || [])) {
        let vp = yui_graph_viewport_of(graph, nd.id);
        if(!vp || !is_number(vp[0]) || !is_number(vp[1])) {
            continue;
        }
        if(vp[0] < 0 || vp[1] < 0 || vp[0] > w || vp[1] > h) {
            continue;
        }
        let d = (vp[0] - w / 2) ** 2 + (vp[1] - h / 2) ** 2;
        if(d < best_d) {
            best_d = d;
            best = nd.id;
        }
    }
    return best;
}

/*  The node a camera is SAVED by: the anchor when one is set, else the
 *  node nearest the middle of the viewport.
 *
 *  It used to be fold_keep_node() -- the first root of the tree,
 *  wherever it was. A reader who had panned away saved a node OFF
 *  screen at a pixel off screen, and a reload whose layout had moved
 *  by a hair put that one node back at that pixel and nothing else in
 *  view: a blank graph, with the whole tree sitting in the minimap.  */
function camera_anchor_node(gobj)
{
    let priv = gobj.priv;

    if(priv.anchor_state === "on" && priv.anchor_id) {
        return priv.anchor_id;
    }
    return node_nearest_view_centre(gobj) || fold_keep_node(gobj);
}

function read_camera(gobj)
{
    let priv = gobj.priv;
    let graph = priv.graph;

    if(!graph || typeof graph.getZoom !== "function") {
        return null;
    }
    try {
        let z = graph.getZoom();
        let node = camera_anchor_node(gobj);
        let vp = node? yui_graph_viewport_of(graph, node) : null;
        if(!is_number(z) || !node || !vp || !is_number(vp[0]) || !is_number(vp[1])) {
            return null;
        }
        return {zoom: z, node: node, x: vp[0], y: vp[1]};
    } catch(e) {
        return null;    /*  between renders: there is no camera to read  */
    }
}

/*  Returns true when it placed the viewport, so the caller knows
 *  not to fit.  */
async function restore_camera(gobj)
{
    let priv = gobj.priv;
    let graph = priv.graph;
    let cam = gobj_read_attr(gobj, "camera");

    if(!graph || empty_json(cam) || !is_number(cam.zoom) ||
            !cam.node || !is_number(cam.x) || !is_number(cam.y)) {
        return false;   /*  nothing saved, or saved by a version that wrote
                            G6's own position -- which never restored  */
    }
    /*  Checked BEFORE the zoom is touched: a saved node that this load
     *  does not have (the treedb changed under it) must leave the graph
     *  to its opening fit, not at a zoom with no framing to go with it.  */
    if(!yui_graph_viewport_of(graph, cam.node)) {
        return false;
    }
    /*  A camera saved by a node OFF screen (before 7.23.137 the node was
     *  the first root, wherever it was) frames nothing it can promise:
     *  the opening fit instead.  */
    let size = graph.getSize() || [0, 0];
    if(cam.x < 0 || cam.y < 0 || cam.x > size[0] || cam.y > size[1]) {
        return false;
    }
    priv._camera_restoring = true;
    try {
        await graph.zoomTo(cam.zoom);
        await yui_graph_place_at(graph, cam.node, [cam.x, cam.y]);
        return true;
    } catch(e) {
        log_error(`${gobj_short_name(gobj)}: cannot restore the camera: ${e}`);
        return false;
    } finally {
        priv._camera_restoring = false;
    }
}

/************************************************************
 *  A move settled: tell whoever persists it.
 *
 *  Debounced on a REAL time and with the browser's timer: a
 *  wheel notch, a pinch and a drag each fire `aftertransform`
 *  many times, and what is worth saving is where the gesture
 *  ENDED. (`set_timeout` from gobj-js is a C_TIMER and shadows
 *  the global -- this module imports neither.)
 ************************************************************/
function publish_camera_later(gobj)
{
    let priv = gobj.priv;

    if(priv._camera_restoring || !priv._camera_placed) {
        return;     /*  our own move, or the opening one  */
    }
    if(priv._camera_timer) {
        clearTimeout(priv._camera_timer);
    }
    priv._camera_timer = setTimeout(() => {
        priv._camera_timer = null;
        if(gobj_is_destroying(gobj)) {
            return;
        }
        let cam = read_camera(gobj);
        if(!cam) {
            return;     /*  Error already logged, or nothing to read  */
        }
        gobj_write_attr(gobj, "camera", cam);
        gobj_publish_event(gobj, "EV_CAMERA_CHANGED", cam);
    }, CAMERA_SETTLE_MS);
}

/************************************************************
 *  Fit the graph in the viewport, but never zoom out past the point
 *  where nothing on a card can be read.
 *
 *  A wide fan — a schema treedb is one topic and a hundred columns —
 *  fits at about 0.2, which is a hairline strip: technically the whole
 *  graph, and worth nothing. Stopping at a legible zoom and centring
 *  shows a part you can actually read, and the minimap (which such a
 *  graph always has) says where that part is.
 ************************************************************/
async function graph_fit_readable(gobj)
{
    let priv = gobj.priv;
    let graph = priv.graph;

    await graph.fitView();

    if(graph.getZoom() < MIN_READABLE_ZOOM) {
        await graph.zoomTo(MIN_READABLE_ZOOM);
        await graph.fitCenter();
    }
}

/************************************************************
 *  Put the viewport on the selection: what `fit` does, for a part.
 *
 *  Computed rather than delegated because `fitView()` fits the whole
 *  graph and there is no subset form of it. The bounds come from the
 *  elements themselves, so a node's real card size is what is
 *  measured, not an assumed one; the zoom is clamped to the graph's
 *  own `zoomRange`, which is the only limit that is not invented
 *  here. A selection of one card filling the view is not a bug --
 *  that is what zooming to it means, and it is what every editor
 *  that offers the action does.
 ************************************************************/
async function graph_fit_selection(gobj, ids)
{
    let priv = gobj.priv;
    let graph = priv.graph;

    if(!graph || !ids || !ids.length) {
        return;
    }

    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    let found = 0;
    for(let id of ids) {
        let bounds;
        try {
            bounds = graph.getElementRenderBounds(id);
        } catch(e) {
            continue;       /* gone since it was selected */
        }
        if(!bounds || !bounds.min || !bounds.max) {
            continue;
        }
        minx = Math.min(minx, bounds.min[0]);
        miny = Math.min(miny, bounds.min[1]);
        maxx = Math.max(maxx, bounds.max[0]);
        maxy = Math.max(maxy, bounds.max[1]);
        found++;
    }
    if(!found) {
        log_error(`${gobj_short_name(gobj)}: the selection has no bounds to fit`);
        return;
    }

    const MARGIN = 48;
    let size = graph.getSize();
    let vw = Math.max(1, size[0] - MARGIN * 2);
    let vh = Math.max(1, size[1] - MARGIN * 2);
    let bw = Math.max(1, maxx - minx);
    let bh = Math.max(1, maxy - miny);

    let zoom = Math.min(vw / bw, vh / bh);
    let range = graph.getZoomRange() || [0.2, 4];
    zoom = Math.max(range[0], Math.min(range[1], zoom));

    await graph.zoomTo(zoom);
    await graph.focusElement(ids);
}

/************************************************************
 *  Focus the graph on one topic: highlight (amber 'active' state)
 *  every node of that topic and centre the viewport on them. An
 *  empty topic clears the highlight. If the graph is not rendered
 *  or its data has not arrived, remember the request and replay it
 *  once the data loads (see ac_load_data). Guarded end-to-end — a
 *  missing G6 API or an unknown topic logs and no-ops, never throws.
 ************************************************************/
function graph_focus_topic(gobj, topic, reveal_all)
{
    let priv = gobj.priv;
    let graph = priv.graph;
    if(!graph || !priv.graph_rendered || !priv._fold_model) {
        priv._pending_focus_topic = topic;
        priv._pending_focus_all = !!reveal_all;
        return;
    }

    let model = priv._fold_model;
    let state = priv._fold_state;

    /*  "Show me these": the ones on screen are highlighted, and the
     *  hidden ones are opened up to. How many depends on who asks.
     *  A click on the LEGEND (`reveal_all`) means every record of the
     *  topic, however deep it is folded away. The graph's per-topic
     *  ROUTE lands here on every load (`.../graph/devices` is a focus
     *  on `devices`) and gets ONE PAGE, the same cap the find has:
     *  revealing a whole topic on landing opened 563 groups of a
     *  6400-record treedb -- the pile, back, before anybody touched
     *  anything.  */
    let keys = [];
    if(!empty_string(topic)) {
        for(let node of model.nodes.values()) {
            if(node.topic_name === topic) {
                keys.push(node.key);
            }
        }
        if(keys.length === 0) {
            log_warning(`${gobj_short_name(gobj)}: focus topic '${topic}' has no nodes`);
        }
        let visible = fold_visible_set(model, state);
        let revealed = 0;
        for(let key of keys) {
            if(visible.has(key)) {
                continue;
            }
            if(!reveal_all && revealed >= state.page_size) {
                break;
            }
            fold_reveal(model, state, key);
            revealed++;
        }
    }
    priv._focus_topic = topic || null;

    reconcile_fold(gobj, {}).then(() => {
        apply_focus_ids(gobj, keys, "focus topic");
    });
}

/************************************************************
 *  Paint the highlight on these records (by model key) and put
 *  the first of them in the middle. Shared by the find and the
 *  topic focus, after the reconcile that brought them on screen.
 *  Keys that are still off screen are skipped: a match beyond the
 *  page a reveal opened is counted, not painted.
 ************************************************************/
function apply_focus_ids(gobj, keys, what)
{
    let priv = gobj.priv;
    let graph = priv.graph;
    if(!graph) {
        return;
    }

    let states = {};
    for(let id of (priv._focus_ids || [])) {
        states[id] = [];
    }
    let ids = [];
    for(let key of keys) {
        let id = node_id_of_key(gobj, key);
        let nd = null;
        try {
            nd = graph.getNodeData(id);
        } catch(e) {
            nd = null;
        }
        if(nd) {
            ids.push(id);
            states[id] = ['active'];
        }
    }
    let prev_ids = priv._focus_ids || [];
    priv._focus_ids = ids;

    try {
        if(typeof graph.setElementState === "function") {
            graph.setElementState(states);
        }
        apply_node_highlight(gobj, prev_ids, ids);
        if(ids.length) {
            yui_graph_center_on(graph, ids[0]);
        }
    } catch(e) {
        log_error(`${gobj_short_name(gobj)}: ${what} apply failed: ${e}`);
    }
}

/*  "topic^id" -> the G6 node id.  */
function node_id_of_key(gobj, key)
{
    let i = key.indexOf("^");
    if(i < 0) {
        return "";
    }
    return build_node_name(gobj, key.slice(0, i), key.slice(i + 1));
}

/************************************************************
 *  Find the nodes whose name, id or topic contains `term`, highlight
 *  them with the same amber 'active' state the topic focus uses, and
 *  centre the viewport on them. Returns how many matched, which is the
 *  half the toolbar needs: a search that finds nothing must SAY so,
 *  because a graph that did not move is also what a graph looks like
 *  when the match is off-screen.
 *
 *  It shares the highlight slot with graph_focus_topic on purpose —
 *  two amber sets at once would say nothing about either. An empty
 *  term clears it. Matching reads the node's LABEL and not only its
 *  id: on a topic keyed by rowid or by a qualified path, the id is a
 *  counter and the name a human knows is elsewhere (see node_label).
 ************************************************************/
function graph_find_nodes(gobj, term)
{
    let priv = gobj.priv;
    let graph = priv.graph;
    if(!graph || !priv.graph_rendered || !priv._fold_model) {
        priv._pending_find = term;
        return 0;
    }

    let model = priv._fold_model;
    let state = priv._fold_state;

    /*  Searched over the RECORDS, not the cards: most of the treedb is
     *  folded away, and a find that only read what was on screen would
     *  answer "nothing" for a device three levels down.  */
    let keys = [];
    let hidden_matches = 0;
    if(!empty_string(term)) {
        let needle = String(term).toLowerCase();
        let matches = (topic_name, record) => {
            let label = "";
            try {
                label = node_label(priv.descs[topic_name] || {}, record) || "";
            } catch(e) {
                label = "";
            }
            let haystack = [
                label,
                record.id,
                topic_name
            ].filter((v) => typeof v === "string").join(" ").toLowerCase();
            return haystack.includes(needle);
        };
        for(let node of model.nodes.values()) {
            if(matches(node.topic_name, node.record || {})) {
                keys.push(node.key);
            }
        }
        /*  A hidden topic is searched too, and COUNTED apart: a term
         *  that only matches there would otherwise answer "0", which
         *  reads as "does not exist" when it means "is hidden".  */
        for(let topic_name of model.hidden) {
            for(let record of (priv.records[topic_name] || [])) {
                if(is_object(record) && matches(topic_name, record)) {
                    hidden_matches++;
                }
            }
        }
    }
    priv._find_hidden_matches = hidden_matches;

    /*  Hidden matches are opened up to, one page of them at most: a
     *  single letter matches half the treedb, and unfolding half the
     *  treedb on a keystroke is the pile this whole thing exists to
     *  avoid. The count reported is of all the matches.  */
    let visible = fold_visible_set(model, state);
    let revealed = 0;
    for(let key of keys) {
        if(visible.has(key)) {
            continue;
        }
        if(revealed >= state.page_size) {
            break;
        }
        fold_reveal(model, state, key);
        revealed++;
    }

    priv._focus_topic = null;       /*  a find takes over the highlight  */

    reconcile_fold(gobj, {}).then(() => {
        apply_focus_ids(gobj, keys, "find");
    });

    return keys.length;
}

async function graph_zoom_in(gobj)
{
    let priv = gobj.priv;
    let graph = priv.graph;

    const z = graph.getZoom();
    after_camera(gobj, graph.zoomTo(z * 1.1));
}

async function graph_zoom_out(gobj)
{
    let priv = gobj.priv;
    let graph = priv.graph;

    const z = graph.getZoom();
    after_camera(gobj, graph.zoomTo(z * 0.9));
}

async function graph_render(gobj)
{
    let priv = gobj.priv;
    let graph = priv.graph;

    await graph.render();
}

async function graph_draw(gobj)
{
    let priv = gobj.priv;
    let graph = priv.graph;

    await graph.draw();
}

async function graph_layout(gobj)
{
    let priv = gobj.priv;
    let graph = priv.graph;

    await graph.layout();
}

function graph_get_plugin(gobj, plugin_key)
{
    let priv = gobj.priv;
    let graph = priv.graph;
    const plugins = graph.getPlugins();
    const exists = plugins.some((p) => typeof p === 'object' && p.key === plugin_key);
    if(exists) {
        return graph.getPluginInstance(plugin_key);
    } else {
        return null;
    }
}

function graph_add_plugin(gobj, plugin_key, options)
{
    let priv = gobj.priv;
    let graph = priv.graph;

    let plugin = graph_get_plugin(gobj, plugin_key);
    let existed = !!plugin;
    if(!plugin) {
        let plugin_def = {
            key: plugin_key,
            type: plugin_key,
        };
        if(json_object_size(options)) {
            json_object_update(plugin_def, options);  // options can override type
        }
        graph.setPlugins((plugins) => [...plugins, plugin_def]);
    }

    plugin = graph_get_plugin(gobj, plugin_key);

    switch(plugin_key) {
        case "history":
            /*  Wired once per INSTANCE: this is called again on every
             *  load and on every entry into edition, and a second
             *  listener on the same emitter is a second repaint of the
             *  same two buttons.  */
            if(plugin && !existed) {
                plugin.on(HistoryEvent.CHANGE, () => {
                    update_history_buttons(gobj);
                });
                graph.updatePlugin({
                    key: plugin_key,
                    beforeAddCommand: () => {
                        return !priv._history_paused;
                    }
                });
            }
            break;
    }
}

function graph_remove_plugin(gobj, plugin_key)
{
    let priv = gobj.priv;
    let graph = priv.graph;

    const plugin = graph_get_plugin(gobj, plugin_key);
    if(plugin) {
        let plugins = graph.getPlugins();
        plugins = plugins.filter((p) => p.key !== plugin_key);
        graph.setPlugins(plugins);
        if(!plugin.destroyed) {
            if(plugin.destroy) {
                plugin.destroy();
            }
        }
    }
}

async function graph_clear(gobj)
{
    let priv = gobj.priv;
    let graph = priv.graph;

    priv._xy = 100;
    priv._edge_seq = 0;
    priv.yet_showed = false;

    await graph.clear();
}

async function graph_set_layout(gobj, layout)
{
    let priv = gobj.priv;
    let graph = priv.graph;

    graph.setLayout(layout);
    if(graph.rendered) {
        await graph_layout(gobj);
    } else {
        await graph_render(gobj);
    }
}

function graph_resize(gobj, width, height)
{
    let priv = gobj.priv;
    let graph = priv.graph;

    // Deselect edge before resize
    deselect_edge(gobj);

    graph.setSize(width, height);

    // setSize() may not fire aftertransform, update overlays manually
    update_resize_handles_position(gobj);
    update_port_resize_handles_position(gobj);
    update_node_icon_position(gobj);
    update_link_icon_position(gobj);
    update_port_icon_position(gobj);
}

function graph_write_behaviors(gobj, behaviors)
{
    let priv = gobj.priv;
    let graph = priv.graph;

    graph.setOptions({
        behaviors: behaviors
    });
}

function graph_set_behavior(gobj, behavior, set)
{
    let priv = gobj.priv;
    let graph = priv.graph;

    let options = graph.getOptions();
    let behaviors = options.behaviors;

    if(set) {
        if(!str_in_list(behaviors, behavior)) {
            behaviors.push(behavior);
        }
    } else {
        if(str_in_list(behaviors, behavior)) {
            delete_from_list(behaviors, behavior);
        }
    }

    graph.setOptions({
        behaviors: behaviors
    });
}

/************************************************************
 *  Custom G6 node: TreedbCard -- G6's html node with ports that
 *  have a SHAPE.
 *
 *  G6 draws every port as a circle (`drawPortShapes` upserts a
 *  `Circle`, nothing in the port style says otherwise). A port's
 *  `shape` -- `circle`, `square`, `diamond`, `triangle` -- picks
 *  the G shape here, by the names G6 registers itself, and `r`
 *  stays the one size: the half-side of the square, the half-
 *  diagonal of the diamond, the half-height of the triangle. The
 *  hit test, the resize handles and the edge's landing point all
 *  read `r` and none of them care about the outline.
 ************************************************************/
const PORT_SHAPES = ['circle', 'square', 'diamond', 'triangle'];

class TreedbCard extends HTML
{
    drawPortShapes(attributes, container) {
        const portsStyle = this.getPortsStyle(attributes);
        Object.keys(portsStyle).forEach((key) => {
            const style = portsStyle[key];
            const shapeKey = `port-${key}`;
            if(style === false) {
                this.upsert(shapeKey, 'circle', false, container);
                return;
            }
            let r = Number(style.r) || 0;
            switch(style.shape) {
                case 'square':
                    this.upsert(shapeKey, 'rect', Object.assign({}, style, {
                        x: -r, y: -r, width: 2 * r, height: 2 * r,
                    }), container);
                    break;
                case 'diamond':
                    this.upsert(shapeKey, 'polygon', Object.assign({}, style, {
                        points: [[0, -r], [r, 0], [0, r], [-r, 0]],
                    }), container);
                    break;
                case 'triangle':
                    this.upsert(shapeKey, 'polygon', Object.assign({}, style, {
                        points: [[0, -r], [r, r], [-r, r]],
                    }), container);
                    break;
                default:
                    this.upsert(shapeKey, 'circle', style, container);
                    break;
            }
        });
    }
}

/*  A record's card is `treedb-card`; `html` is what it was until
 *  7.23.81 and what a `+N` chip still is.  */
function is_card_type(type)
{
    return type === 'treedb-card' || type === 'html';
}

/************************************************************
 *  Custom G6 node: LightNode (circle with status indicator)
 ************************************************************/
class LightNode extends Circle
{
    render(attributes, container) {
        super.render(attributes, container);
        this.upsert('light', CircleGeometry, { r: 8, fill: '#0f0', cx: 0, cy: -25 }, container);
    }
}

/************************************************************
 *  Custom G6 layout: ManualLayout
 *  Reads positions from graph_props (__graphs__),
 *  falls back to legacy _geometry on the record.
 ************************************************************/
class ManualLayout extends BaseLayout
{
    async execute(data, options) {
        const { nodes = [], edges = [] } = data;

        let placed = {};
        let out = [];
        let chips = [];
        for(let node of nodes) {
            let d = node.data || {};
            if(d.more) {
                chips.push(node);       /*  a `+N` chip: placed by its parent below  */
                continue;
            }
            let gp = d.graph_props;
            let geo = d.record? d.record._geometry : null;
            let x = (gp && gp.x != null) ? gp.x :
                     (geo && geo.x != null) ? geo.x : 0;
            let y = (gp && gp.y != null) ? gp.y :
                     (geo && geo.y != null) ? geo.y : 0;
            placed[node.id] = [x, y];
            out.push({id: node.id, style: {x: x, y: y}});
        }

        /*  A chip has no saved place of its own and never will: it sits
         *  under the card it continues, or where it was born if it is
         *  a root group's.  */
        for(let node of chips) {
            let edge = edges.find((e) => e.target === node.id);
            let p = edge? placed[edge.source] : null;
            let x = p? p[0] : ((node.style && node.style.x) || 0);
            let y = p? p[1] + 80 : ((node.style && node.style.y) || 0);
            out.push({id: node.id, style: {x: x, y: y}});
        }

        return {nodes: out};
    }
}

/************************************************************
 *  Custom G6 layouts: TreedbTreeLayout / TreedbRadialLayout.
 *
 *  Thin adapters over treedb_layout.js: the nodes with their sizes,
 *  the edges with the RANK of the hook they leave by (the position
 *  of the source port in the parent's ports, which is the schema's
 *  column order), and the positions back. A `+N` chip's edge has a
 *  source port too, so the chip sits at the end of its hook's
 *  children, where the page ends.
 ************************************************************/
function treedb_layout_input(data)
{
    const {nodes = [], edges = []} = data;

    let ports_of = new Map();
    let in_nodes = nodes.map((node) => {
        let size = (node.style && node.style.size) || [172, 96];
        let w = is_array(size)? size[0] : size;
        let h = is_array(size)? (size.length > 1? size[1] : size[0]) : size;
        /*  The hook order comes from `data.port_keys`, written when
         *  the node is born: a CLOSED node has no ports on its style,
         *  and its children still have to sit in schema order.  */
        let ports = (node.style && is_array(node.style.ports))? node.style.ports : [];
        let keys = (node.data && is_array(node.data.port_keys))
            ? node.data.port_keys : ports.map((p) => p.key);
        ports_of.set(node.id, keys);
        return {id: node.id, w: w, h: h};
    });

    let in_edges = edges.map((edge) => {
        let port = edge.style? edge.style.sourcePort : undefined;
        let keys = ports_of.get(edge.source) || [];
        let rank = port? keys.indexOf(port) : -1;
        return {source: edge.source, target: edge.target, rank: (rank >= 0)? rank : 0};
    });

    return {nodes: in_nodes, edges: in_edges};
}

function treedb_layout_output(pos)
{
    let out = [];
    for(let [id, p] of pos) {
        out.push({id: id, style: {x: p.x, y: p.y}});
    }
    return {nodes: out};
}

class TreedbTreeLayout extends BaseLayout
{
    async execute(data, options) {
        let input = treedb_layout_input(data);
        return treedb_layout_output(layout_tree(input.nodes, input.edges, options));
    }
}

class TreedbCompactLayout extends BaseLayout
{
    async execute(data, options) {
        let input = treedb_layout_input(data);
        return treedb_layout_output(layout_compact(input.nodes, input.edges, options));
    }
}

class TreedbRadialLayout extends BaseLayout
{
    async execute(data, options) {
        let input = treedb_layout_input(data);
        return treedb_layout_output(layout_radial(input.nodes, input.edges, options));
    }
}

/************************************************************
 *  Node selection and resize handles
 ************************************************************/
const RESIZE_HANDLE_SIZE = 8;
const RESIZE_MIN_VP = 20;
const RESIZE_MIN_WORLD = 30;

/*
 *  A handle is TWO boxes: the one you see and the one you can
 *  hit.  They are the same box for a mouse, and on a touch
 *  screen the hit box grows to a fingertip while the mark stays
 *  a mark -- a 44px white square on each corner would hide the
 *  node it is there to resize.
 */
const RESIZE_HANDLE_VISUAL_COARSE = 14;
const RESIZE_HANDLE_HIT_COARSE    = 44;

function resize_handle_visual()
{
    return coarse_pointer()? RESIZE_HANDLE_VISUAL_COARSE: RESIZE_HANDLE_SIZE;
}

function resize_handle_hit()
{
    return coarse_pointer()? RESIZE_HANDLE_HIT_COARSE: RESIZE_HANDLE_SIZE;
}

/************************************************************
 *  SVG icons for floating action buttons (28×28 circles).
 *  Each value is a raw SVG string sized 18×18 in a 24×24 viewBox.
 *  Stroke inherits from CSS `color` via `stroke="currentColor"`.
 ************************************************************/
const SVG_ICONS = {
    gear:
        '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" ' +
        'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
        'stroke-linejoin="round">' +
        '<circle cx="12" cy="12" r="3"/>' +
        '<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06' +
        'a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09' +
        'A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83' +
        'l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09' +
        'A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83' +
        'l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09' +
        'a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83' +
        'l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09' +
        'a1.65 1.65 0 0 0-1.51 1z"/>' +
        '</svg>',
    trash:
        '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" ' +
        'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
        'stroke-linejoin="round">' +
        '<polyline points="3 6 5 6 21 6"/>' +
        '<path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>' +
        '<path d="M10 11v6"/><path d="M14 11v6"/>' +
        '<path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>' +
        '</svg>',
    link:
        '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" ' +
        'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
        'stroke-linejoin="round">' +
        '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>' +
        '<path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>' +
        '</svg>',
    plus:
        '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" ' +
        'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
        'stroke-linejoin="round">' +
        '<line x1="12" y1="5" x2="12" y2="19"/>' +
        '<line x1="5" y1="12" x2="19" y2="12"/>' +
        '</svg>',
};

/************************************************************
 *  Is the primary pointer a FINGER?
 *
 *  Everything this gclass draws over the canvas is sized from
 *  this answer.  A mouse is a pixel and can hit an 8px square;
 *  a fingertip covers about 40, and the overlay it lands on
 *  decides between "open the properties" and "delete the node".
 *
 *  Asked per call, not cached: a tablet with a keyboard dock
 *  changes the answer without reloading the page.
 ************************************************************/
function coarse_pointer()
{
    if(typeof window.matchMedia !== "function") {
        return false;
    }
    try {
        return window.matchMedia("(pointer: coarse)").matches === true;
    } catch(e) {
        return false;
    }
}

/************************************************************
 *  The size of the round floating buttons (properties,
 *  delete, link), and the GAP between two of them.
 *
 *  The gap matters as much as the size: `node properties` and
 *  `delete node` are drawn one under the other, and at 28px
 *  with 4px between them a fingertip covers both -- with the
 *  destructive one underneath.
 ************************************************************/
function floating_icon_size()
{
    return coarse_pointer()? 44: 28;
}

function floating_icon_gap()
{
    return coarse_pointer()? 12: 4;
}

/*  Centre-to-top offset: the anchor names a point, the button
 *  hangs centred on it.  */
function floating_icon_dy()
{
    return -floating_icon_size() / 2;
}

/*  How far below the first button the second one starts.  */
function floating_icon_step()
{
    return floating_icon_size() + floating_icon_gap();
}

/*  Where a popover opens: clear of the button column.  */
function floating_popover_dx()
{
    return 4 + floating_icon_size() + 4;
}

/************************************************************
 *  Create a floating circular icon button.
 *  @param {string} svgKey   - key into SVG_ICONS
 *  @param {string} color    - border & text color (e.g. '#1890ff')
 *  @param {number} left     - CSS left in px
 *  @param {number} top      - CSS top in px
 *  @param {string} title    - tooltip text
 *  @param {Function} onClick
 *  @returns {HTMLElement}
 ************************************************************/
function create_floating_icon(svgKey, color, left, top, title, onClick)
{
    const size = floating_icon_size();
    const el = document.createElement('div');
    el.title = title;
    el.setAttribute('aria-label', title);
    el.innerHTML = SVG_ICONS[svgKey] || '';
    el.style.cssText =
        'position:absolute;' +
        'left:' + left + 'px;' +
        'top:' + top + 'px;' +
        'width:' + size + 'px;height:' + size + 'px;' +
        'display:flex;align-items:center;justify-content:center;' +
        'background:#fff;border:1px solid ' + color + ';border-radius:50%;' +
        'cursor:pointer;pointer-events:all;z-index:11;' +
        /*  The button is a drag handle in one case (the link icon)
         *  and the browser would claim that gesture as a scroll.  */
        'touch-action:none;' +
        'box-shadow:0 2px 6px rgba(0,0,0,0.15);' +
        'color:' + color + ';';

    /*  The glyphs are authored 18×18; on the bigger button that
     *  leaves a ring of empty white, so scale with the button.  */
    const $svg = el.querySelector('svg');
    if($svg) {
        const glyph = Math.round(size * 0.5);
        $svg.setAttribute('width',  String(glyph));
        $svg.setAttribute('height', String(glyph));
    }

    el.addEventListener('click', (e) => {
        e.stopPropagation();
        onClick();
    });
    return el;
}

/************************************************************
 *  Remove one or more overlay elements from priv and the DOM.
 *  @param {object} gobj
 *  @param {...string} keys  - priv property names to remove
 ************************************************************/
function hide_overlay(gobj, ...keys)
{
    let priv = gobj.priv;
    for(let key of keys) {
        if(priv[key]) {
            priv[key].remove();
            priv[key] = null;
        }
    }
}

/************************************************************
 *  Enable the save button (mark graph as dirty).
 ************************************************************/
/************************************************************
 *  A popover that PREVIEWS its changes owes an undo.
 *
 *  What the preview writes is not the reader's answer until
 *  `apply` is pressed, and `cancel` used to be the only way
 *  back: every other way out of the popover -- a click on the
 *  canvas, the icon pressed again, the element going away --
 *  left the preview standing on the element, and the next Save
 *  wrote it to `__graphs__`. So the undo is kept beside the
 *  popover and run by whoever hides it; `apply` drops it first,
 *  because then the preview IS the answer.
 ************************************************************/
function set_preview_undo(gobj, key, undo)
{
    gobj.priv[key] = undo;
}

function drop_preview_undo(gobj, key)
{
    gobj.priv[key] = null;
}

function run_preview_undo(gobj, key)
{
    let undo = gobj.priv[key];
    gobj.priv[key] = null;
    if(!undo || gobj_is_destroying(gobj)) {
        return;
    }
    try {
        undo();
    } catch(e) {
        log_error(`${gobj_short_name(gobj)}: cannot undo the preview: ${e}`);
    }
}

function mark_graph_dirty(gobj)
{
    let $container = gobj_read_attr(gobj, "$container");
    enableElements($container, ".EV_SAVE_GRAPH");
    set_submit_state($container, ".EV_SAVE_GRAPH", true);
}

/************************************************************
 *  Extract width/height from a style's size property.
 *  Returns {w, h}.
 ************************************************************/
function extract_size(style)
{
    const size = style.size || [60];
    const w = Array.isArray(size) ? size[0] : size;
    const h = Array.isArray(size) ? (size.length > 1 ? size[1] : size[0]) : size;
    return {w, h};
}

/************************************************************
 *  Show a pair of floating icons (gear + trash) next to an
 *  element. Returns {icon_el, delete_el}.
 ************************************************************/
function show_dual_icons(gobj, x, y, gear_title, gear_click, trash_title, trash_click)
{
    let priv = gobj.priv;

    const icon_el = create_floating_icon(
        'gear', '#1890ff', x, y, gear_title, gear_click
    );
    priv.$container.appendChild(icon_el);

    const delete_el = create_floating_icon(
        'trash', '#ff4d4f', x, y + floating_icon_step(), trash_title, trash_click
    );
    priv.$container.appendChild(delete_el);

    return {icon_el, delete_el};
}

/************************************************************
 *  Form helpers for popover construction (DRY).
 ************************************************************/
function create_popover_base(left, top, className, borderColor, minWidth)
{
    const popover = document.createElement('div');
    popover.className = className;
    popover.style.cssText =
        'position:absolute;' +
        'left:' + left + 'px;' +
        'top:' + top + 'px;' +
        /*  Bulma scheme vars, not #fff: the labels inside inherit their
         *  colour, so a hardcoded white card turned into light-on-white —
         *  invisible — the moment the app went dark. The vars flip with
         *  <html data-theme>, so these follow the theme with no redraw. */
        'background:var(--bulma-scheme-main, #fff);' +
        'color:var(--bulma-text-strong, #1A1A1A);' +
        'border:1px solid ' + borderColor + ';border-radius:6px;' +
        'padding:12px;z-index:100;pointer-events:all;' +
        'box-shadow:0 4px 12px rgba(0,0,0,0.15);' +
        'min-width:' + minWidth + 'px;font-size:13px;';
    popover.addEventListener('click', (e) => e.stopPropagation());
    popover.addEventListener('pointerdown', (e) => e.stopPropagation());
    /*
     *  AND THE WHEEL, or a popover that overflows cannot be scrolled with
     *  the wheel at all -- the scrollbar has to be dragged.
     *
     *  G6's zoom behavior binds a wheel listener on the CONTAINER and
     *  calls preventDefault() on every notch, whatever the target is;
     *  then it declines to zoom because the target is not the canvas. So
     *  the gesture is cancelled and nobody uses it: the graph does not
     *  zoom AND the box does not scroll. Measured on a live node: with
     *  the popover overflowing (scrollHeight 674 over 357 visible),
     *  scrollTop stayed at 0 and the zoom readout stayed at 50%.
     *
     *  Stopping it here -- in the bubble phase, where the click and the
     *  pointerdown above are already stopped -- is enough: G6 sees
     *  nothing and the browser scrolls the box normally. Not
     *  preventDefault: cancelling it ourselves would be the same bug
     *  from our side.
     */
    popover.addEventListener('wheel', (e) => e.stopPropagation());
    return popover;
}

/************************************************************
 *  Extra CSS every control inside a popover carries on a
 *  touch screen.
 *
 *  A popover is where the graph is TYPED into -- a colour, a
 *  radius, an id -- and its controls were sized by their
 *  padding alone, which lands them at 25-30px.  A finger needs
 *  44, and the number is not ours: it is the floor both Apple
 *  and Google publish, and the one every native control on the
 *  device already meets.
 ************************************************************/
function touch_control_css()
{
    if(!coarse_pointer()) {
        return '';
    }
    return 'min-height:44px;font-size:16px;';
}

/*
 *  16px is not a taste: iOS Safari ZOOMS the whole page when a
 *  text field smaller than that takes focus, and the page never
 *  zooms back -- the graph is left half off screen after typing
 *  one id.
 */

function create_form_label(parent, text)
{
    let label = document.createElement('label');
    label.textContent = t(text);
    label.style.cssText = 'display:block;margin-bottom:4px;font-weight:500;';
    parent.appendChild(label);
    return label;
}

function create_form_color_input(parent, value, onInput)
{
    let input = document.createElement('input');
    input.type = 'color';
    input.value = value;
    input.style.cssText =
        'width:100%;height:30px;padding:0;' +
        'border:1px solid var(--bulma-border-weak, #d9d9d9);border-radius:4px;' +
        'cursor:pointer;margin-bottom:10px;' + touch_control_css();
    if(onInput) {
        input.addEventListener('input', onInput);
    }
    parent.appendChild(input);
    return input;
}

function create_form_number_input(parent, value, min, max, onInput)
{
    let input = document.createElement('input');
    input.type = 'number';
    input.min = String(min);
    input.max = String(max);
    input.value = value;
    /*  Set the colours explicitly: a native control with only a border
     *  styled falls back to the BROWSER default (white + black), which is
     *  what kept it light inside a dark popover. The spinner arrows are
     *  OS-drawn and follow `color-scheme` (see c_yui_shell.css), not this. */
    input.style.cssText =
        'width:100%;padding:4px 6px;' +
        'background:var(--bulma-scheme-main-bis, #fff);' +
        'color:var(--bulma-text-strong, #333);' +
        'border:1px solid var(--bulma-border-weak, #d9d9d9);border-radius:4px;' +
        'box-sizing:border-box;margin-bottom:10px;' + touch_control_css();
    if(onInput) {
        input.addEventListener('input', onInput);
    }
    parent.appendChild(input);
    return input;
}

function create_form_select(parent, options, marginBottom)
{
    let select = document.createElement('select');
    select.style.cssText =
        'width:100%;padding:4px 6px;' +
        'background:var(--bulma-scheme-main-bis, #fff);' +
        'color:var(--bulma-text-strong, #333);' +
        'border:1px solid var(--bulma-border-weak, #d9d9d9);border-radius:4px;' +
        'box-sizing:border-box;margin-bottom:' + (marginBottom || '12px') + ';' +
        touch_control_css();
    for(let opt of options) {
        let o = document.createElement('option');
        o.value = opt.value;
        o.textContent = opt.label;
        select.appendChild(o);
    }
    parent.appendChild(select);
    return select;
}

const BTN_STYLE_CANCEL =
    'flex:1;padding:6px;background:var(--bulma-scheme-main-bis, #fff);' +
    'color:var(--bulma-text-strong, #333);' +
    'border:1px solid var(--bulma-border-weak, #d9d9d9);' +
    'border-radius:4px;cursor:pointer;font-size:13px;font-weight:500;';

function create_form_button_row(parent, buttons)
{
    let btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:8px;';
    for(let {text, style, onClick} of buttons) {
        let btn = document.createElement('button');
        btn.textContent = t(text);
        btn.style.cssText = style + touch_control_css();
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            onClick();
        });
        btnRow.appendChild(btn);
    }
    parent.appendChild(btnRow);
    return btnRow;
}

/************************************************************
 *  Show a confirmation popover next to a target element.
 *  Returns the popover element.
 ************************************************************/
function show_confirm_popover(gobj, target_el, message, confirm_text, confirm_color, onConfirm, priv_key)
{
    hide_overlay(gobj, priv_key);

    let priv = gobj.priv;
    let containerRect = priv.$container.getBoundingClientRect();
    let left, top;

    if(target_el) {
        let iconRect = target_el.getBoundingClientRect();
        left = iconRect.right - containerRect.left + 6;
        top  = iconRect.top   - containerRect.top  - 4;
    } else {
        /*  A question about a SET has no icon to hang off: it is asked
         *  in the middle of the graph it is about.  */
        left = Math.round(containerRect.width / 2) - 110;
        top  = Math.round(containerRect.height / 4);
    }

    const popover = create_popover_base(left, top, 'g6-confirm-popover', '#ff4d4f', 160);

    // Message
    let msg = document.createElement('div');
    /*  pre-line: a confirmation that has to say what it takes with it needs
     *  a second line, and textContent alone would run it together. */
    msg.style.cssText = 'margin-bottom:10px;font-weight:500;white-space:pre-line;';
    msg.textContent = message;
    popover.appendChild(msg);

    create_form_button_row(popover, [
        {
            text: 'cancel',
            style: BTN_STYLE_CANCEL,
            onClick: () => hide_overlay(gobj, priv_key),
        },
        {
            text: confirm_text,
            style: 'flex:1;padding:6px;background:' + confirm_color + ';color:#fff;border:none;' +
                   'border-radius:4px;cursor:pointer;font-size:13px;font-weight:500;',
            onClick: onConfirm,
        },
    ]);

    priv.$container.appendChild(popover);
    priv[priv_key] = popover;
    clamp_popover_position(gobj, popover);
}

/************************************************************
 *  Perform a history undo or redo operation.
 ************************************************************/
function perform_history_op(gobj, is_redo)
{
    let priv = gobj.priv;

    if(!priv.edit_mode) {
        return;
    }

    const history = graph_get_plugin(gobj, "history");
    if(!history) {
        return;
    }

    if(is_redo) {
        if(!history.canRedo()) {
            return;
        }
        const cmd = history.redoStack[history.redoStack.length - 1];
        history.redo();
        update_resize_handles_position(gobj);
        sync_history_to_backend(gobj, cmd ? cmd.current : null);
    } else {
        if(!history.canUndo()) {
            return;
        }
        const cmd = history.undoStack[history.undoStack.length - 1];
        history.undo();
        update_resize_handles_position(gobj);
        sync_history_to_backend(gobj, cmd ? cmd.original : null);
    }
}

/************************************************************
 *  The canvas G6 listens on.
 *
 *  A G6 graph stacks four canvases and gives every one of them a
 *  `tabIndex`, so `querySelector("canvas")` finds a focusable
 *  element that receives nothing: only the MAIN layer carries the
 *  listeners, and it is the only one G6 leaves with pointer events
 *  (`configCanvasDom` sets `pointerEvents: none` on the rest).
 *  Focusing the wrong one looks exactly like focusing the right one
 *  and delivers no key.
 ************************************************************/
function main_canvas_of($container)
{
    let canvases = $container.querySelectorAll("canvas");

    for(let i = 0; i < canvases.length; i++) {
        if(window.getComputedStyle(canvases[i]).pointerEvents !== "none") {
            return canvases[i];
        }
    }

    return canvases[0] || null;
}

/************************************************************
 *  The selection.
 *
 *  G6's `selected` element state IS the selection: `drag-element`
 *  reads it (`getElementDataByState`) to decide what a drag moves,
 *  so keeping the set anywhere else would be a second truth the
 *  drag does not consult. What this gclass keeps is what is
 *  PAINTED -- an html node draws no state style at all (its key
 *  shape is a DOM element), so the ring lives in the card's own
 *  html, exactly like the find highlight, and the painted set
 *  exists to diff the repaint.
 ************************************************************/
function selected_node_ids(gobj)
{
    let graph = gobj.priv.graph;

    if(!graph) {
        return [];
    }

    let data;
    try {
        data = graph.getElementDataByState('node', 'selected') || [];
    } catch(e) {
        return [];      /* asked before there is a graph to ask */
    }

    return data.map((nd) => nd.id);
}

/************************************************************
 *  Move the ring to these nodes and off the ones that had it.
 ************************************************************/
function paint_selection(gobj, ids)
{
    let priv = gobj.priv;
    let prev = priv._selected_paint_ids || [];
    let next = ids || [];

    priv._selected_paint_ids = next;

    repaint_cards(gobj, new Set([...prev, ...next]));
    update_zoom_selection_button(gobj);
}

/************************************************************
 *  Zoom-to-selection can only act on a selection.
 *
 *  The attribute is toggled on the element instead of re-rendering
 *  the toolbar, which would rebuild its innerHTML -- and with it
 *  drop the disabled state of every OTHER button -- each time a
 *  card is ticked.
 ************************************************************/
function update_zoom_selection_button(gobj)
{
    let priv = gobj.priv;
    let $container = gobj_read_attr(gobj, "$container");

    if(!$container) {
        return;
    }

    let $btn = $container.querySelector(".EV_ZOOM_SELECTION");
    if(!$btn) {
        return;     /* no toolbar, or not in edition: nothing to enable */
    }

    if((priv._selected_paint_ids || []).length > 0) {
        enableElements($container, ".EV_ZOOM_SELECTION");
    } else {
        disableElements($container, ".EV_ZOOM_SELECTION");
    }
}

/************************************************************
 *  The selection mode is a state, so it has to LOOK like one:
 *  a PRESSED toggle, not a button wearing one of the palette's
 *  action colours (see `pressed_state` in lib_graph.css).
 *
 *  Toggled on the element rather than re-rendered with the
 *  toolbar, for the same reason as the button above: a
 *  re-render rebuilds the innerHTML and drops what every OTHER
 *  button was told.
 ************************************************************/
function update_selection_mode_button(gobj)
{
    let priv = gobj.priv;
    let $container = gobj_read_attr(gobj, "$container");

    if(!$container) {
        return;
    }

    if(!$container.querySelector(".EV_TOGGLE_SELECTION_MODE")) {
        return;     /* no edit toolbar: not in edition, or folded away */
    }

    set_pressed_state($container, ".EV_TOGGLE_SELECTION_MODE", priv.selection_mode);
}

/************************************************************
 *  Select a SET of nodes: what a marquee and a shift-click do.
 *
 *  It leaves `_selected_node_id` null even for a set of one,
 *  because that field is not "the selection", it is "the node
 *  opened for editing" -- the resize handles, the ports and the
 *  popovers hang off it, and none of them means anything over a
 *  set. Clicking a node is what opens one (`select_node`); a
 *  marquee selects, it does not open.
 ************************************************************/
function set_selection(gobj, ids)
{
    let priv = gobj.priv;
    let graph = priv.graph;

    let next = [];
    for(let id of (ids || [])) {
        try {
            if(graph.getNodeData(id)) {
                next.push(id);
            }
        } catch(e) {
            /*  An id the graph does not have: a brush answers with what
             *  it enclosed, and a node can be gone by the time we ask.  */
        }
    }

    deselect_node(gobj);        /* the state, the paint and the affordances */

    if(!next.length) {
        return;
    }

    history_pause(gobj);
    try {
        let states = {};
        for(let id of next) {
            states[id] = ['selected'];
        }
        graph.setElementState(states);
    } catch(e) {
        log_error(`${gobj_short_name(gobj)}: cannot set the selection: ${e}`);
    }

    paint_selection(gobj, next);

    graph_draw(gobj).then(() => {
        history_resume(gobj);
    });
}

/************************************************************
 *  Add a node to the selection, or take it out of it.
 ************************************************************/
function toggle_in_selection(gobj, node_id)
{
    let priv = gobj.priv;

    /*  The union of the two views of the same thing: either can hold
     *  an id the other lost -- G6's state is what a drag moves, the
     *  painted set is what the reader can see -- and a card on screen
     *  wearing a ring belongs to the selection whichever view has it.  */
    let current = new Set(selected_node_ids(gobj));
    for(let id of (priv._selected_paint_ids || [])) {
        current.add(id);
    }

    if(current.has(node_id)) {
        current.delete(node_id);
    } else {
        current.add(node_id);
    }

    set_selection(gobj, [...current]);
}

function select_node(gobj, node_id)
{
    let priv = gobj.priv;
    let graph = priv.graph;

    // Deselect previous
    deselect_node(gobj);

    // Set selected state (not recorded in history, resume after draw)
    history_pause(gobj);
    try {
        graph.setElementState(node_id, ['selected']);
    } catch(e) {}
    priv._selected_node_id = node_id;
    paint_selection(gobj, [node_id]);

    // Show resize handles and properties icon
    show_resize_handles(gobj);
    show_node_icon(gobj);

    graph_draw(gobj).then(() => {
        history_resume(gobj);
    });
}

function deselect_node(gobj)
{
    let priv = gobj.priv;
    let graph = priv.graph;

    deselect_port(gobj);
    deselect_edge(gobj);
    hide_node_icon(gobj);
    hide_node_popover(gobj);
    hide_delete_confirm(gobj);
    hide_unlink_confirm(gobj);

    /*  Both views of the selection, because either can hold an id the
     *  other lost: G6's state is what a drag moves, the painted set is
     *  what the reader can see.  */
    let clearing = new Set([
        ...selected_node_ids(gobj),
        ...(priv._selected_paint_ids || [])
    ]);
    if(priv._selected_node_id) {
        clearing.add(priv._selected_node_id);
    }

    if(clearing.size) {
        history_pause(gobj);
        try {
            let states = {};
            for(let id of clearing) {
                states[id] = [];
            }
            graph.setElementState(states);
        } catch(e) {}
        priv._selected_node_id = null;
        paint_selection(gobj, []);

        graph_draw(gobj).then(() => {
            history_resume(gobj);
        });
    }

    hide_resize_handles(gobj);
}

function get_node_viewport_rect(gobj, node_id)
{
    let priv = gobj.priv;
    let graph = priv.graph;

    const pos = graph.getElementPosition(node_id);
    const nodeData = graph.getNodeData(node_id);
    const style = nodeData.style || {};
    const {w, h} = extract_size(style);

    const vpMin = graph.getViewportByCanvas([pos[0] - w/2, pos[1] - h/2]);
    const vpMax = graph.getViewportByCanvas([pos[0] + w/2, pos[1] + h/2]);

    return {
        left: vpMin[0], top: vpMin[1],
        right: vpMax[0], bottom: vpMax[1]
    };
}

function show_resize_handles(gobj)
{
    hide_resize_handles(gobj);

    let priv = gobj.priv;
    if(!priv._selected_node_id) {
        return;
    }

    // Create container for handles overlay
    const container = document.createElement('div');
    container.className = 'g6-resize-handles';
    container.style.cssText =
        'position:absolute;top:0;left:0;width:100%;height:100%;' +
        'pointer-events:none;z-index:10;';

    // Selection rectangle (dashed border)
    const selRect = document.createElement('div');
    container.appendChild(selRect);

    // 8 resize handles: nw, n, ne, w, e, sw, s, se
    let handle_defs = [
        { cursor: 'nw-resize', mx: -1, my: -1 },
        { cursor: 'n-resize',  mx:  0, my: -1 },
        { cursor: 'ne-resize', mx:  1, my: -1 },
        { cursor: 'w-resize',  mx: -1, my:  0 },
        { cursor: 'e-resize',  mx:  1, my:  0 },
        { cursor: 'sw-resize', mx: -1, my:  1 },
        { cursor: 's-resize',  mx:  0, my:  1 },
        { cursor: 'se-resize', mx:  1, my:  1 },
    ];

    /*
     *  On a touch screen, the CORNERS only.  Eight fingertip-sized
     *  hit boxes around a node 90px wide overlap into one blob, and
     *  the edge handles are the ones that lose -- a corner resizes
     *  both axes anyway, so nothing is out of reach.
     */
    const hit    = resize_handle_hit();
    const visual = resize_handle_visual();
    if(coarse_pointer()) {
        handle_defs = handle_defs.filter((def) => def.mx !== 0 && def.my !== 0);
    }

    const handles = [];
    for(const def of handle_defs) {
        /*  The box that catches the finger: transparent, and never
         *  in front of the mark of a NEIGHBOURING handle.  */
        const el = document.createElement('div');
        el.style.cssText =
            'position:absolute;' +
            'width:' + hit + 'px;' +
            'height:' + hit + 'px;' +
            'display:flex;align-items:center;justify-content:center;' +
            'cursor:' + def.cursor + ';' +
            'pointer-events:all;' +
            /*  Without this the browser reads the drag as a scroll
             *  and cancels the pointer mid-resize.  */
            'touch-action:none;' +
            'box-sizing:border-box;';

        /*  The box you see.  */
        const mark = document.createElement('div');
        mark.style.cssText =
            'width:' + visual + 'px;' +
            'height:' + visual + 'px;' +
            'background:#fff;' +
            'border:1px solid #1890ff;' +
            'pointer-events:none;' +
            'box-sizing:border-box;';
        el.appendChild(mark);

        el.addEventListener('pointerdown', (e) => {
            start_node_resize(gobj, e, def.mx, def.my);
        });
        handles.push({ el: el, mx: def.mx, my: def.my });
        container.appendChild(el);
    }

    priv.$container.appendChild(container);
    priv._resize_handles_el = container;
    priv._resize_handles = handles;
    priv._resize_sel_rect = selRect;

    update_resize_handles_position(gobj);
}

function hide_resize_handles(gobj)
{
    let priv = gobj.priv;

    if(priv._resize_handles_el) {
        hide_overlay(gobj, '_resize_handles_el');
        priv._resize_handles = [];
        priv._resize_sel_rect = null;
    }
}

function update_resize_handles_position(gobj)
{
    let priv = gobj.priv;

    if(!priv._selected_node_id || priv._selected_port_key) {
        return;
    }

    // Recreate handles if they were removed (e.g. by resize)
    if(!priv._resize_handles_el) {
        show_resize_handles(gobj);
        return;
    }

    try {
        const rect = get_node_viewport_rect(gobj, priv._selected_node_id);
        apply_handles_to_rect(gobj, rect);
    } catch(e) {
        // Node may have been removed
        hide_resize_handles(gobj);
    }
}

function apply_handles_to_rect(gobj, rect)
{
    let priv = gobj.priv;
    const HALF = resize_handle_hit() / 2;

    const left = rect.left;
    const top = rect.top;
    const w = rect.right - rect.left;
    const h = rect.bottom - rect.top;

    // Selection rectangle
    const selRect = priv._resize_sel_rect;
    if(selRect) {
        selRect.style.cssText =
            'position:absolute;' +
            'left:' + left + 'px;' +
            'top:' + top + 'px;' +
            'width:' + w + 'px;' +
            'height:' + h + 'px;' +
            'border:1px dashed #1890ff;' +
            'pointer-events:none;' +
            'box-sizing:border-box;';
    }

    /*  Each handle carries the corner it is: -1 / 0 / +1 maps to
     *  the near edge, the middle and the far edge.  Read from the
     *  handle instead of a parallel table, because the table is
     *  not the same length on a touch screen.  */
    for(const handle of priv._resize_handles) {
        const x = left + ((handle.mx + 1) / 2) * w;
        const y = top  + ((handle.my + 1) / 2) * h;
        handle.el.style.left = (x - HALF) + 'px';
        handle.el.style.top  = (y - HALF) + 'px';
    }
}

function start_node_resize(gobj, e, mx, my)
{
    let priv = gobj.priv;
    let graph = priv.graph;

    e.preventDefault();
    e.stopPropagation();

    const node_id = priv._selected_node_id;
    if(!node_id) {
        return;
    }

    // Capture original state
    const pos = graph.getElementPosition(node_id);
    const nodeData = graph.getNodeData(node_id);
    const nodeType = nodeData.type;
    const style = nodeData.style || {};
    const {w: origW, h: origH} = extract_size(style);
    const origPortR = style.portR || 0;
    const origCx = pos[0];
    const origCy = pos[1];

    const origVpRect = get_node_viewport_rect(gobj, node_id);
    const startX = e.clientX;
    const startY = e.clientY;
    const zoom = graph.getZoom();

    let currentRect = { ...origVpRect };

    function onPointerMove(ev) {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;

        currentRect = { ...origVpRect };

        if(mx === -1) {
            currentRect.left = Math.min(origVpRect.left + dx, origVpRect.right - RESIZE_MIN_VP);
        }
        if(mx === 1) {
            currentRect.right = Math.max(origVpRect.right + dx, origVpRect.left + RESIZE_MIN_VP);
        }
        if(my === -1) {
            currentRect.top = Math.min(origVpRect.top + dy, origVpRect.bottom - RESIZE_MIN_VP);
        }
        if(my === 1) {
            currentRect.bottom = Math.max(origVpRect.bottom + dy, origVpRect.top + RESIZE_MIN_VP);
        }

        apply_handles_to_rect(gobj, currentRect);
    }

    function onPointerUp(ev) {
        document.removeEventListener('pointermove', onPointerMove);
        document.removeEventListener('pointerup', onPointerUp);

        // Calculate final size in world coordinates from the viewport rect deltas
        const dLeft = (currentRect.left - origVpRect.left) / zoom;
        const dTop = (currentRect.top - origVpRect.top) / zoom;
        const dRight = (currentRect.right - origVpRect.right) / zoom;
        const dBottom = (currentRect.bottom - origVpRect.bottom) / zoom;

        // New world bounds
        const newLeft = (origCx - origW/2) + dLeft;
        const newTop = (origCy - origH/2) + dTop;
        const newRight = (origCx + origW/2) + dRight;
        const newBottom = (origCy + origH/2) + dBottom;

        let newW = newRight - newLeft;
        let newH = newBottom - newTop;
        const newCx = (newLeft + newRight) / 2;
        const newCy = (newTop + newBottom) / 2;

        let updateStyle = {
            x: newCx,
            y: newCy,
        };

        // Circle nodes: single size value (keep it a circle)
        if(nodeType === 'circle') {
            const d = Math.max(newW, newH);
            updateStyle.size = [d];
        } else {
            updateStyle.size = [newW, newH];
        }

        // HTML nodes: update dx, dy to keep content centered
        if(is_card_type(nodeType)) {
            updateStyle.dx = -newW / 2;
            updateStyle.dy = -newH / 2;
        }

        // Scale port radius proportionally to node size change
        if(origPortR > 0) {
            const scale = (nodeType === 'circle') ?
                Math.max(newW, newH) / Math.max(origW, origH) :
                Math.max(newW / origW, newH / origH);
            updateStyle.portR = Math.max(2, Math.round(origPortR * scale));
        }

        graph.updateNodeData([{ id: node_id, style: updateStyle }]);
        graph.draw().then(() => {
            update_resize_handles_position(gobj);
            mark_graph_dirty(gobj);
        });
    }

    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
}

/************************************************************
 *  Port selection and individual port resizing
 ************************************************************/
const PORT_HANDLE_SIZE = 8;

/*
 *  Same two-box idea as the node handles.  Kept smaller than a
 *  full 44: these four sit on the RIM of a port that is often a
 *  6px dot, so a fingertip-sized box on each would cover the
 *  neighbouring ports as well -- and picking a port is how a
 *  link is started.
 */
const PORT_HANDLE_VISUAL_COARSE = 12;
const PORT_HANDLE_HIT_COARSE    = 32;

function port_handle_visual()
{
    return coarse_pointer()? PORT_HANDLE_VISUAL_COARSE: PORT_HANDLE_SIZE;
}

function port_handle_hit()
{
    return coarse_pointer()? PORT_HANDLE_HIT_COARSE: PORT_HANDLE_SIZE;
}

/************************************************************
 *  Compute the canvas (world) position of a port on a node.
 *  Returns {x, y} in world coordinates.
 ************************************************************/
function get_port_canvas_position(gobj, node_id, port_key)
{
    let priv = gobj.priv;
    let graph = priv.graph;

    const pos = graph.getElementPosition(node_id);
    const nodeData = graph.getNodeData(node_id);
    const style = nodeData.style || {};
    const {w, h} = extract_size(style);
    const ports = style.ports || [];

    for(let i = 0; i < ports.length; i++) {
        if(ports[i].key === port_key) {
            let pl = ports[i].placement || [0.5, 0.5];
            return {
                x: pos[0] + (pl[0] - 0.5) * w,
                y: pos[1] + (pl[1] - 0.5) * h
            };
        }
    }
    return null;
}

/************************************************************
 *  Get the radius of a specific port on a node.
 ************************************************************/
function get_port_radius(gobj, node_id, port_key)
{
    let priv = gobj.priv;
    let graph = priv.graph;

    const nodeData = graph.getNodeData(node_id);
    const style = nodeData.style || {};
    const ports = style.ports || [];

    for(let i = 0; i < ports.length; i++) {
        if(ports[i].key === port_key) {
            // Per-port r overrides node-level portR
            if(ports[i].r != null) {
                return ports[i].r;
            }
            break;
        }
    }
    return style.portR || PORT_R_ENTITY;
}

/************************************************************
 *  How much wider than the port itself its hit area is,
 *  measured on the SCREEN and converted to world units.
 *
 *  It used to be a flat `+4` in WORLD units, which is a
 *  different target on every zoom: at the 50% a phone lands on
 *  after fit, a 6-unit port plus 4 is a 5px radius -- one
 *  fifth of a fingertip, and picking a port is the first step
 *  of every link.
 ************************************************************/
function port_hit_slop_world(graph)
{
    let slop = coarse_pointer()? 22: 6;
    let zoom = 1;
    try {
        zoom = graph.getZoom() || 1;
    } catch(e) {
        zoom = 1;
    }
    return slop / zoom;
}

/************************************************************
 *  Whether a point landed on a port, by the port's SHAPE.
 *
 *  A port was a circle and the test was a radius; since 7.23.81
 *  it can be a square, a diamond or a triangle too, and a circle
 *  around a diamond answers for the air off its corners while
 *  missing the middle of its edges. `r` is the drawn radius with
 *  the hit slop already added, and the shapes are the ones
 *  TreedbCard.drawPortShapes() draws from it.
 *
 *      dx, dy  the point, relative to the port's centre
 ************************************************************/
function port_shape_hit(shape, dx, dy, r)
{
    switch(shape) {
        case 'square':
            return Math.abs(dx) <= r && Math.abs(dy) <= r;
        case 'diamond':
            return Math.abs(dx) + Math.abs(dy) <= r;
        case 'triangle':
            /*  (0,-r), (r,r), (-r,r): under the base and inside the
             *  two slanted sides, which meet at 2|x| - y = r.  */
            return dy <= r && (2 * Math.abs(dx) - dy) <= r;
        default:
            return Math.hypot(dx, dy) <= r;
    }
}

/************************************************************
 *  Detect if a click in canvas coordinates hits a port.
 *  Returns the port key string, or null if no port hit.
 ************************************************************/
function detect_port_click(gobj, node_id, canvasX, canvasY)
{
    let priv = gobj.priv;
    let graph = priv.graph;

    const pos = graph.getElementPosition(node_id);
    const nodeData = graph.getNodeData(node_id);
    const style = nodeData.style || {};
    const {w, h} = extract_size(style);
    const ports = style.ports || [];
    const defaultR = style.portR || PORT_R_ENTITY;

    let best_key = null;
    let best_dist = Infinity;
    let slop = port_hit_slop_world(graph);

    for(let i = 0; i < ports.length; i++) {
        let pl = ports[i].placement || [0.5, 0.5];
        let px = pos[0] + (pl[0] - 0.5) * w;
        let py = pos[1] + (pl[1] - 0.5) * h;
        let r = ports[i].r != null ? ports[i].r : defaultR;

        let dx = canvasX - px;
        let dy = canvasY - py;
        let dist = Math.sqrt(dx * dx + dy * dy);

        /*  Nearest wins, so the enlarged areas of two ports
         *  overlapping is not a tie -- it is the closer one. The
         *  distance ranks them; the SHAPE says who is in the running. */
        if(port_shape_hit(ports[i].shape, dx, dy, r + slop) && dist < best_dist) {
            best_dist = dist;
            best_key = ports[i].key;
        }
    }

    return best_key;
}

/************************************************************
 *  Select a port: deselect node handles, show port handles.
 ************************************************************/
function select_port(gobj, node_id, port_key)
{
    let priv = gobj.priv;

    // Hide node resize handles and icon (but keep node selected state)
    hide_resize_handles(gobj);
    hide_node_icon(gobj);
    hide_node_popover(gobj);
    exit_linking_mode(gobj);

    priv._selected_node_id = node_id;
    priv._selected_port_key = port_key;

    show_port_resize_handles(gobj);
    show_link_icon_if_fkey(gobj);
    show_port_icon(gobj);
}

/************************************************************
 *  Deselect port: clear port state, return to node selection.
 ************************************************************/
function deselect_port(gobj)
{
    let priv = gobj.priv;

    exit_linking_mode(gobj);
    hide_link_icon(gobj);
    hide_port_icon(gobj);
    hide_port_popover(gobj);
    hide_port_resize_handles(gobj);
    priv._selected_port_key = null;
}

/************************************************************
 *  Show a link icon next to a selected fkey port.
 ************************************************************/
function show_link_icon_if_fkey(gobj)
{
    hide_link_icon(gobj);

    let priv = gobj.priv;
    let graph = priv.graph;
    if(!priv._selected_node_id || !priv._selected_port_key) {
        return;
    }

    let nodeData = graph.getNodeData(priv._selected_node_id);
    if(!nodeData || !nodeData.data || !nodeData.data.desc) {
        return;
    }
    let desc = nodeData.data.desc;
    let col = get_col_by_id(desc, priv._selected_port_key);
    if(!col) {
        return;
    }
    let field_desc = treedb_get_field_desc(col);
    if(field_desc.type !== 'fkey') {
        return;
    }

    // Get viewport position of the port
    let canvasPos = get_port_canvas_position(gobj, priv._selected_node_id, priv._selected_port_key);
    if(!canvasPos) {
        return;
    }
    let vp = graph.getViewportByCanvas([canvasPos.x, canvasPos.y]);

    let icon = create_floating_icon(
        'link', '#52c41a',
        vp[0] + floating_icon_size() / 2 + 4, vp[1] + floating_icon_dy(),
        t('link to hook'), () => {
            // Click (no drag) toggles linking mode
            if(!priv._linking_mode) {
                enter_linking_mode(gobj);
            }
        }
    );
    // Add drag support: pointerdown starts drag-link
    icon.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        start_link_drag(gobj, e);
    });
    priv.$container.appendChild(icon);
    priv._link_icon_el = icon;
}

function hide_link_icon(gobj)
{
    hide_overlay(gobj, '_link_icon_el');
}

function update_link_icon_position(gobj)
{
    let priv = gobj.priv;
    if(!priv._link_icon_el || !priv._selected_node_id || !priv._selected_port_key) {
        return;
    }
    try {
        let graph = priv.graph;
        let canvasPos = get_port_canvas_position(
            gobj, priv._selected_node_id, priv._selected_port_key
        );
        if(!canvasPos) {
            hide_link_icon(gobj);
            return;
        }
        let vp = graph.getViewportByCanvas([canvasPos.x, canvasPos.y]);
        priv._link_icon_el.style.left =
            (vp[0] + floating_icon_size() / 2 + 4) + 'px';
        priv._link_icon_el.style.top = (vp[1] + floating_icon_dy()) + 'px';
    } catch(e) {
        hide_link_icon(gobj);
    }
}

/************************************************************
 *  Port properties icon and popover: the gear beside a selected
 *  port, as the node has its own. The popover has the two things
 *  a port IS on screen -- its shape and its radius -- and the
 *  scope: this port, the same port of every card of the topic
 *  (the hook or fkey column), or every port there is.
 ************************************************************/
function port_icon_xy(gobj)
{
    let priv = gobj.priv;
    let graph = priv.graph;
    let canvasPos = get_port_canvas_position(
        gobj, priv._selected_node_id, priv._selected_port_key
    );
    if(!canvasPos) {
        return null;
    }
    let vp = graph.getViewportByCanvas([canvasPos.x, canvasPos.y]);
    /*  Under the link icon when there is one (an fkey), in its
     *  place otherwise.  */
    let below = priv._link_icon_el? floating_icon_step() : 0;
    return {
        x: vp[0] + floating_icon_size() / 2 + 4,
        y: vp[1] + floating_icon_dy() + below,
    };
}

function show_port_icon(gobj)
{
    hide_port_icon(gobj);

    let priv = gobj.priv;
    if(!priv._selected_node_id || !priv._selected_port_key) {
        return;
    }
    let xy = port_icon_xy(gobj);
    if(!xy) {
        return;
    }
    let icon = create_floating_icon(
        'gear', '#1890ff', xy.x, xy.y,
        t('port properties'), () => toggle_port_popover(gobj)
    );
    priv.$container.appendChild(icon);
    priv._port_icon_el = icon;
}

function hide_port_icon(gobj)
{
    hide_overlay(gobj, '_port_icon_el');
}

function update_port_icon_position(gobj)
{
    let priv = gobj.priv;
    if(!priv._port_icon_el || !priv._selected_node_id || !priv._selected_port_key) {
        return;
    }
    try {
        let xy = port_icon_xy(gobj);
        if(!xy) {
            hide_port_icon(gobj);
            hide_port_popover(gobj);
            return;
        }
        priv._port_icon_el.style.left = xy.x + 'px';
        priv._port_icon_el.style.top = xy.y + 'px';
        if(priv._port_popover_el) {
            priv._port_popover_el.style.left = (xy.x + floating_popover_dx()) + 'px';
            priv._port_popover_el.style.top = xy.y + 'px';
            clamp_popover_position(gobj, priv._port_popover_el);
        }
    } catch(e) {
        hide_port_icon(gobj);
        hide_port_popover(gobj);
    }
}

function toggle_port_popover(gobj)
{
    let priv = gobj.priv;
    if(priv._port_popover_el) {
        hide_port_popover(gobj);
    } else {
        show_port_popover(gobj);
    }
}

function hide_port_popover(gobj)
{
    run_preview_undo(gobj, '_port_preview_undo');
    hide_overlay(gobj, '_port_popover_el');
}

/*  The ports of a node with ONE of them rewritten.  */
function ports_with(ports, port_key, changes)
{
    return (ports || []).map((p) => (p.key === port_key)? Object.assign({}, p, changes) : p);
}

function show_port_popover(gobj)
{
    hide_port_popover(gobj);

    let priv = gobj.priv;
    let graph = priv.graph;
    let node_id = priv._selected_node_id;
    let port_key = priv._selected_port_key;
    if(!node_id || !port_key) {
        return;
    }
    let nodeData = graph.getNodeData(node_id);
    if(!nodeData || !nodeData.style) {
        return;
    }
    let ports = nodeData.style.ports || [];
    let port = ports.find((p) => p.key === port_key);
    if(!port) {
        return;
    }
    let orig_shape = port.shape || 'circle';
    let orig_r = get_port_radius(gobj, node_id, port_key);

    let xy = port_icon_xy(gobj);
    if(!xy) {
        return;
    }
    const popover = create_popover_base(
        xy.x + floating_popover_dx(), xy.y, 'g6-port-popover', '#d9d9d9', 180
    );

    /*  What the preview writes on this port, undone: whoever hides
     *  the popover without applying runs it (see set_preview_undo).  */
    let undo_port = () => {
        graph.updateNodeData([{id: node_id, style: {
            ports: ports_with(nodeData.style.ports, port_key, {shape: orig_shape, r: orig_r}),
        }}]);
        graph.draw().then(() => {
            update_port_resize_handles_position(gobj);
        });
    };

    /*  Live preview on THIS port; the others wait for apply.  */
    function preview_port() {
        let r = parseInt(rInput.value) || orig_r;
        graph.updateNodeData([{id: node_id, style: {
            ports: ports_with(nodeData.style.ports, port_key, {shape: shapeSelect.value, r: r}),
        }}]);
        graph.draw().then(() => {
            update_port_resize_handles_position(gobj);
        });
    }

    create_form_label(popover, 'shape');
    let shapeSelect = create_form_select(popover, PORT_SHAPES.map((shape) => {
        return {value: shape, label: t(shape)};
    }));
    shapeSelect.value = orig_shape;
    shapeSelect.addEventListener('change', preview_port);

    create_form_label(popover, 'radius');
    let rInput = create_form_number_input(popover, orig_r, 2, 40, preview_port);

    create_form_label(popover, 'apply to');
    let scopeSelect = create_form_select(popover, [
        {value: 'this', label: t('this port')},
        {value: 'same_topic', label: t('same port in topic')},
        {value: 'all', label: t('all ports')},
    ]);

    create_form_button_row(popover, [
        {
            text: 'cancel',
            style: BTN_STYLE_CANCEL,
            onClick: () => {
                hide_port_popover(gobj);    /*  which undoes the preview  */
            },
        },
        {
            text: 'apply',
            style: 'flex:1;padding:6px;background:#1890ff;color:#fff;border:none;' +
                   'border-radius:4px;cursor:pointer;font-size:13px;font-weight:500;',
            onClick: () => {
                drop_preview_undo(gobj, '_port_preview_undo');
                apply_port_properties(gobj, node_id, port_key,
                    shapeSelect.value, parseInt(rInput.value) || orig_r, scopeSelect.value
                );
            },
        },
    ]);

    priv.$container.appendChild(popover);
    priv._port_popover_el = popover;
    set_preview_undo(gobj, '_port_preview_undo', undo_port);
    clamp_popover_position(gobj, popover);
}

/************************************************************
 *  Apply a port's shape and radius to one port, to the same port
 *  of every card of the topic, or to every port -- and remember
 *  the choice as the topic's default, the way `resize all ports`
 *  does, so a card that arrives later is born with it.
 *      scope: 'this', 'same_topic', 'all'
 ************************************************************/
function apply_port_properties(gobj, node_id, port_key, shape, r, scope)
{
    let priv = gobj.priv;
    let graph = priv.graph;

    let nodeData = graph.getNodeData(node_id);
    if(!nodeData || !nodeData.data) {
        return;
    }
    let source_topic = nodeData.data.topic_name;

    if(scope === 'same_topic') {
        if(!is_object(priv._graph_properties[source_topic])) {
            priv._graph_properties[source_topic] = {};
        }
        let defaults = priv._graph_properties[source_topic].defaults || {};
        defaults.port_sizes = Object.assign({}, defaults.port_sizes, {[port_key]: r});
        defaults.port_shapes = Object.assign({}, defaults.port_shapes, {[port_key]: shape});
        priv._graph_properties[source_topic].defaults = defaults;
    } else if(scope === 'all') {
        for(const topic_name of Object.keys(priv.descs || {})) {
            if(!is_object(priv._graph_properties[topic_name])) {
                priv._graph_properties[topic_name] = {};
            }
            let defaults = priv._graph_properties[topic_name].defaults || {};
            defaults.portR = r;
            defaults.port_shape = shape;
            delete defaults.port_sizes;
            delete defaults.port_shapes;
            priv._graph_properties[topic_name].defaults = defaults;
        }
    }

    let updates = [];
    for(let nd of (graph.getNodeData() || [])) {
        if(!nd || !nd.data || !nd.data.desc || !nd.style || !is_array(nd.style.ports)) {
            continue;
        }
        let new_ports;
        if(scope === 'this') {
            if(nd.id !== node_id) {
                continue;
            }
            new_ports = ports_with(nd.style.ports, port_key, {shape: shape, r: r});
        } else if(scope === 'same_topic') {
            if(nd.data.topic_name !== source_topic) {
                continue;
            }
            new_ports = ports_with(nd.style.ports, port_key, {shape: shape, r: r});
        } else {
            new_ports = nd.style.ports.map((p) => Object.assign({}, p, {shape: shape, r: r}));
        }
        let upd = {ports: new_ports};
        if(scope === 'all') {
            upd.portR = r;
        }
        updates.push({id: nd.id, style: upd});
    }

    if(updates.length > 0) {
        graph.updateNodeData(updates);
        graph.draw().then(() => {
            update_port_resize_handles_position(gobj);
            update_port_icon_position(gobj);
            mark_graph_dirty(gobj);
        });
    }
    hide_port_popover(gobj);
}

/************************************************************
 *  Get a column descriptor by field id from a topic desc.
 ************************************************************/
function get_col_by_id(desc, col_id)
{
    let cols = desc.cols;
    for(let i = 0; i < cols.length; i++) {
        if(cols[i].id === col_id) {
            return cols[i];
        }
    }
    return null;
}

/************************************************************
 *  Linking mode: click-click flow.
 *  1. User clicks link icon on a fkey port → enter_linking_mode
 *  2. Compatible hook ports are highlighted
 *  3. User clicks on a valid hook port → complete_link
 *  4. User clicks elsewhere or ESC → exit_linking_mode
 ************************************************************/
function enter_linking_mode(gobj)
{
    let priv = gobj.priv;
    let graph = priv.graph;

    if(priv._linking_mode) {
        exit_linking_mode(gobj);
        return;
    }

    let node_id = priv._selected_node_id;
    let port_key = priv._selected_port_key;
    if(!node_id || !port_key) {
        return;
    }

    let nodeData = graph.getNodeData(node_id);
    if(!nodeData || !nodeData.data || !nodeData.data.desc) {
        return;
    }
    let desc = nodeData.data.desc;
    let col = get_col_by_id(desc, port_key);
    if(!col || !col.fkey) {
        return;
    }

    // col.fkey = { "parent_topic": "hook_name" }
    // Find all compatible hook ports on all nodes
    let valid_hooks = [];
    let saved_styles = [];

    for(const [parent_topic, hook_name] of Object.entries(col.fkey)) {
        let parent_desc = priv.descs[parent_topic];
        if(!parent_desc) {
            continue;
        }

        // Find all nodes of this topic
        let nodes = graph.getData().nodes || [];
        for(let n of nodes) {
            let nd = graph.getNodeData(n.id);
            if(!nd || !nd.data || !nd.data.desc) {
                continue;
            }
            if(nd.data.desc.topic_name !== parent_topic) {
                continue;
            }
            // Don't link to self
            if(n.id === node_id) {
                continue;
            }
            valid_hooks.push({
                node_id: n.id,
                port_key: hook_name,
                parent_topic: parent_topic,
                parent_id: nd.data.record ? nd.data.record.id : null,
            });
        }
    }

    if(valid_hooks.length === 0) {
        return;
    }

    // Highlight valid hook ports (enlarge + green stroke)
    // Pause history so highlighting doesn't pollute undo queue
    history_pause(gobj);
    for(let vh of valid_hooks) {
        let nd = graph.getNodeData(vh.node_id);
        if(!nd) {
            continue;
        }
        let style = nd.style || {};
        let ports = style.ports || [];
        for(let p of ports) {
            if(p.key === vh.port_key) {
                saved_styles.push({
                    node_id: vh.node_id,
                    port_key: vh.port_key,
                    orig_stroke: p.stroke,
                    orig_lineWidth: p.lineWidth,
                    orig_r: p.r,
                });
                p.stroke = '#52c41a';
                p.lineWidth = 3;
                if(p.r != null) {
                    p.r = p.r + 4;
                } else {
                    p.r = (style.portR || PORT_R_ENTITY) + 4;
                }
            }
        }
        graph.updateNodeData([{ id: vh.node_id, style: { ports: ports } }]);
    }

    priv._linking_mode = true;
    priv._link_source = {
        node_id: node_id,
        port_key: port_key,
        col: col,
        topic_name: desc.topic_name,
        child_id: nodeData.data.record ? nodeData.data.record.id : null,
    };
    priv._link_valid_hooks = valid_hooks;
    priv._link_saved_styles = saved_styles;

    graph.draw().then(() => {
        history_resume(gobj);
    });
}

function exit_linking_mode(gobj)
{
    let priv = gobj.priv;
    let graph = priv.graph;

    if(!priv._linking_mode) {
        return;
    }

    // Clean up drag line if active
    if(priv._link_drag_svg) {
        priv._link_drag_svg.remove();
        priv._link_drag_svg = null;
    }
    priv.$container.style.cursor = '';

    // Restore original port styles
    let updated_nodes = {};
    for(let saved of priv._link_saved_styles) {
        let nd = graph.getNodeData(saved.node_id);
        if(!nd) {
            continue;
        }
        let style = nd.style || {};
        let ports = style.ports || [];
        for(let p of ports) {
            if(p.key === saved.port_key) {
                p.stroke = saved.orig_stroke;
                p.lineWidth = saved.orig_lineWidth;
                if(saved.orig_r != null) {
                    p.r = saved.orig_r;
                } else {
                    delete p.r;
                }
            }
        }
        updated_nodes[saved.node_id] = { id: saved.node_id, style: { ports: ports } };
    }
    let updates = Object.values(updated_nodes);
    if(updates.length > 0) {
        history_pause(gobj);
        graph.updateNodeData(updates);
        graph.draw().then(() => {
            history_resume(gobj);
        });
    }

    priv._linking_mode = false;
    priv._link_source = null;
    priv._link_valid_hooks = [];
    priv._link_saved_styles = [];
}

function try_complete_link(gobj, clicked_node_id, clicked_port_key)
{
    let priv = gobj.priv;

    if(!priv._linking_mode || !priv._link_source) {
        return false;
    }

    // Check if the clicked port is a valid hook target
    let target = priv._link_valid_hooks.find(vh =>
        vh.node_id === clicked_node_id && vh.port_key === clicked_port_key
    );

    if(!target) {
        return false;
    }

    let source = priv._link_source;

    // Build parent_ref and child_ref for the backend
    // parent_ref = "parent_topic^parent_id^hook_name"
    // child_ref = "child_topic^child_id"
    let parent_ref = target.parent_topic + "^" + target.parent_id + "^" + target.port_key;
    let child_ref = source.topic_name + "^" + source.child_id;

    exit_linking_mode(gobj);
    deselect_port(gobj);
    deselect_node(gobj);

    gobj_publish_event(gobj, "EV_LINK_NODES", {
        treedb_name: priv.treedb_name,
        parent_ref: parent_ref,
        child_ref: child_ref,
    });

    return true;
}

/************************************************************
 *  Drag-link: drag from link icon to a hook port.
 *  Draws a temporary SVG line from the fkey port to the cursor.
 ************************************************************/
function start_link_drag(gobj, e)
{
    let priv = gobj.priv;
    let graph = priv.graph;

    // Enter linking mode first (highlights valid hooks)
    if(!priv._linking_mode) {
        enter_linking_mode(gobj);
    }
    if(!priv._linking_mode) {
        return; // no valid hooks, nothing to drag
    }

    // Line starts from the center of the link icon
    let containerRect = priv.$container.getBoundingClientRect();
    let iconRect = priv._link_icon_el.getBoundingClientRect();
    let startX = iconRect.left + iconRect.width / 2 - containerRect.left;
    let startY = iconRect.top + iconRect.height / 2 - containerRect.top;

    // Create SVG overlay for the drag line
    let svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.style.cssText =
        'position:absolute;top:0;left:0;width:100%;height:100%;' +
        'pointer-events:none;z-index:10;';
    let line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', startX);
    line.setAttribute('y1', startY);
    line.setAttribute('x2', e.clientX - containerRect.left);
    line.setAttribute('y2', e.clientY - containerRect.top);
    line.setAttribute('stroke', '#52c41a');
    line.setAttribute('stroke-width', '2');
    line.setAttribute('stroke-dasharray', '6 3');
    svg.appendChild(line);
    priv.$container.appendChild(svg);
    priv._link_drag_svg = svg;

    let dragged = false;

    function onPointerMove(ev) {
        dragged = true;
        let cx = ev.clientX - containerRect.left;
        let cy = ev.clientY - containerRect.top;
        line.setAttribute('x2', cx);
        line.setAttribute('y2', cy);

        // Check if cursor is over a valid hook port → change cursor
        let canvasPt = graph.getCanvasByViewport([cx, cy]);
        let hoverTarget = find_hook_at_point(gobj, canvasPt[0], canvasPt[1]);
        priv.$container.style.cursor = hoverTarget ? 'copy' : 'not-allowed';
    }

    function onPointerUp(ev) {
        document.removeEventListener('pointermove', onPointerMove);
        document.removeEventListener('pointerup', onPointerUp);
        priv.$container.style.cursor = '';

        // Remove drag line
        if(priv._link_drag_svg) {
            priv._link_drag_svg.remove();
            priv._link_drag_svg = null;
        }

        if(!dragged) {
            // It was a click, not a drag — let the click handler deal with it
            return;
        }

        // Check if dropped on a valid hook port
        let cx = ev.clientX - containerRect.left;
        let cy = ev.clientY - containerRect.top;
        let canvasPt = graph.getCanvasByViewport([cx, cy]);
        let target = find_hook_at_point(gobj, canvasPt[0], canvasPt[1]);

        if(target) {
            try_complete_link(gobj, target.node_id, target.port_key);
        } else {
            exit_linking_mode(gobj);
        }
    }

    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
}

/************************************************************
 *  Find if a canvas point hits a valid hook port during
 *  linking mode. Returns {node_id, port_key} or null.
 ************************************************************/
function find_hook_at_point(gobj, canvasX, canvasY)
{
    let priv = gobj.priv;
    let graph = priv.graph;

    for(let vh of priv._link_valid_hooks) {
        let nd = graph.getNodeData(vh.node_id);
        if(!nd) {
            continue;
        }
        let style = nd.style || {};
        let {w, h} = extract_size(style);
        let pos = graph.getElementPosition(vh.node_id);
        let ports = style.ports || [];

        for(let p of ports) {
            if(p.key !== vh.port_key) {
                continue;
            }
            let pl = p.placement || [0.5, 0.5];
            let px = pos[0] + (pl[0] - 0.5) * w;
            let py = pos[1] + (pl[1] - 0.5) * h;
            let r = p.r != null ? p.r : (style.portR || PORT_R_ENTITY);
            let dx = canvasX - px;
            let dy = canvasY - py;
            if(Math.sqrt(dx * dx + dy * dy) <= r + 6) {
                return { node_id: vh.node_id, port_key: vh.port_key };
            }
        }
    }
    return null;
}

/************************************************************
 *  Show 4 resize handles (N, E, S, W) around selected port.
 ************************************************************/
function show_port_resize_handles(gobj)
{
    hide_port_resize_handles(gobj);

    let priv = gobj.priv;
    if(!priv._selected_port_key || !priv._selected_node_id) {
        return;
    }

    const container = document.createElement('div');
    container.className = 'g6-port-resize-handles';
    container.style.cssText =
        'position:absolute;top:0;left:0;width:100%;height:100%;' +
        'pointer-events:none;z-index:11;';

    // Dashed circle indicator
    const ring = document.createElement('div');
    container.appendChild(ring);

    // 4 handles: N, E, S, W
    const handle_defs = [
        { cursor: 'n-resize',  dx:  0, dy: -1 },
        { cursor: 'e-resize',  dx:  1, dy:  0 },
        { cursor: 's-resize',  dx:  0, dy:  1 },
        { cursor: 'w-resize',  dx: -1, dy:  0 },
    ];

    const hit    = port_handle_hit();
    const visual = port_handle_visual();

    const handles = [];
    for(const def of handle_defs) {
        const el = document.createElement('div');
        el.style.cssText =
            'position:absolute;' +
            'width:' + hit + 'px;' +
            'height:' + hit + 'px;' +
            'display:flex;align-items:center;justify-content:center;' +
            'cursor:' + def.cursor + ';' +
            'pointer-events:all;' +
            'touch-action:none;' +
            'box-sizing:border-box;';

        const mark = document.createElement('div');
        mark.style.cssText =
            'width:' + visual + 'px;' +
            'height:' + visual + 'px;' +
            'background:#fff;' +
            'border:1px solid #fa8c16;' +
            'border-radius:50%;' +
            'pointer-events:none;' +
            'box-sizing:border-box;';
        el.appendChild(mark);

        el.addEventListener('pointerdown', (e) => {
            start_port_resize(gobj, e);
        });
        handles.push({ el: el, dx: def.dx, dy: def.dy });
        container.appendChild(el);
    }

    priv.$container.appendChild(container);
    priv._port_handles_el = container;
    priv._port_handles = handles;
    priv._port_ring = ring;

    update_port_resize_handles_position(gobj);
}

/************************************************************
 *  Hide port resize handles.
 ************************************************************/
function hide_port_resize_handles(gobj)
{
    let priv = gobj.priv;

    if(priv._port_handles_el) {
        hide_overlay(gobj, '_port_handles_el');
        priv._port_handles = [];
        priv._port_ring = null;
    }
}

/************************************************************
 *  Update port handle positions after zoom/pan/resize.
 ************************************************************/
function update_port_resize_handles_position(gobj)
{
    let priv = gobj.priv;
    let graph = priv.graph;

    if(!priv._selected_port_key || !priv._port_handles_el) {
        return;
    }

    try {
        let canvasPos = get_port_canvas_position(
            gobj, priv._selected_node_id, priv._selected_port_key
        );
        if(!canvasPos) {
            hide_port_resize_handles(gobj);
            return;
        }

        let r = get_port_radius(gobj, priv._selected_node_id, priv._selected_port_key);
        let vpCenter = graph.getViewportByCanvas([canvasPos.x, canvasPos.y]);
        let vpEdge = graph.getViewportByCanvas([canvasPos.x + r, canvasPos.y]);
        let vpR = vpEdge[0] - vpCenter[0]; // radius in viewport pixels

        apply_port_handles(gobj, vpCenter[0], vpCenter[1], vpR);
    } catch(e) {
        hide_port_resize_handles(gobj);
    }
}

/************************************************************
 *  Position port handles and ring around viewport center.
 ************************************************************/
function apply_port_handles(gobj, cx, cy, vpR)
{
    let priv = gobj.priv;
    const HALF = port_handle_hit() / 2;

    // Dashed ring
    const ring = priv._port_ring;
    if(ring) {
        const d = vpR * 2;
        ring.style.cssText =
            'position:absolute;' +
            'left:' + (cx - vpR) + 'px;' +
            'top:' + (cy - vpR) + 'px;' +
            'width:' + d + 'px;' +
            'height:' + d + 'px;' +
            'border:1px dashed #fa8c16;' +
            'border-radius:50%;' +
            'pointer-events:none;' +
            'box-sizing:border-box;';
    }

    // N, E, S, W handles
    const offsets = [
        { x: cx,        y: cy - vpR },  // N
        { x: cx + vpR,  y: cy },         // E
        { x: cx,        y: cy + vpR },  // S
        { x: cx - vpR,  y: cy },         // W
    ];

    for(let i = 0; i < priv._port_handles.length; i++) {
        const h = priv._port_handles[i];
        const o = offsets[i];
        h.el.style.left = (o.x - HALF) + 'px';
        h.el.style.top = (o.y - HALF) + 'px';
    }
}

/************************************************************
 *  Drag handler for port resize.
 *  Uses distance from port center to pointer as new radius.
 ************************************************************/
function start_port_resize(gobj, e)
{
    let priv = gobj.priv;
    let graph = priv.graph;

    e.preventDefault();
    e.stopPropagation();

    const node_id = priv._selected_node_id;
    const port_key = priv._selected_port_key;
    if(!node_id || !port_key) {
        return;
    }

    const canvasPos = get_port_canvas_position(gobj, node_id, port_key);
    if(!canvasPos) {
        return;
    }

    // Get viewport center of port for live feedback
    // vpCenter is container-relative; client coords need container offset
    const vpCenter = graph.getViewportByCanvas([canvasPos.x, canvasPos.y]);
    const containerRect = priv.$container.getBoundingClientRect();
    const clientCx = vpCenter[0] + containerRect.left;
    const clientCy = vpCenter[1] + containerRect.top;
    const zoom = graph.getZoom();

    function onPointerMove(ev) {
        const dx = ev.clientX - clientCx;
        const dy = ev.clientY - clientCy;
        let vpR = Math.max(PORT_HANDLE_SIZE, Math.sqrt(dx * dx + dy * dy));

        apply_port_handles(gobj, vpCenter[0], vpCenter[1], vpR);
    }

    function onPointerUp(ev) {
        document.removeEventListener('pointermove', onPointerMove);
        document.removeEventListener('pointerup', onPointerUp);

        // Calculate new radius in world coordinates
        const dx = ev.clientX - clientCx;
        const dy = ev.clientY - clientCy;
        let vpR = Math.max(PORT_HANDLE_SIZE, Math.sqrt(dx * dx + dy * dy));
        let newR = Math.max(2, Math.round(vpR / zoom));

        // Update the individual port's r in the ports array
        const nodeData = graph.getNodeData(node_id);
        const style = nodeData.style || {};
        let ports = style.ports ? [...style.ports] : [];
        for(let i = 0; i < ports.length; i++) {
            if(ports[i].key === port_key) {
                ports[i] = { ...ports[i], r: newR };
                break;
            }
        }

        graph.updateNodeData([{ id: node_id, style: { ports: ports } }]);
        graph.draw().then(() => {
            update_port_resize_handles_position(gobj);
            mark_graph_dirty(gobj);
        });
    }

    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
}

/************************************************************
 *  Edge selection: show a floating properties icon near
 *  the edge midpoint. Clicking it opens a popover form.
 ************************************************************/
function select_edge(gobj, edge_id)
{
    let priv = gobj.priv;
    let graph = priv.graph;

    deselect_edge(gobj);

    priv._selected_edge_id = edge_id;

    history_pause(gobj);
    try {
        graph.setElementState(edge_id, ['selected']);
    } catch(e) {}

    show_edge_icon(gobj);

    graph_draw(gobj).then(() => {
        history_resume(gobj);
    });
}

function deselect_edge(gobj)
{
    let priv = gobj.priv;
    let graph = priv.graph;

    hide_edge_popover(gobj);
    hide_edge_icon(gobj);
    hide_unlink_confirm(gobj);

    if(priv._selected_edge_id) {
        history_pause(gobj);
        try {
            graph.setElementState(priv._selected_edge_id, []);
        } catch(e) {}
        priv._selected_edge_id = null;

        graph_draw(gobj).then(() => {
            history_resume(gobj);
        });
    }
}

/************************************************************
 *  Get the midpoint of an edge in viewport coordinates.
 ************************************************************/
function get_edge_viewport_midpoint(gobj, edge_id)
{
    let priv = gobj.priv;
    let graph = priv.graph;

    let edgeData = graph.getEdgeData(edge_id);
    if(!edgeData) {
        return null;
    }

    let sourcePos = graph.getElementPosition(edgeData.source);
    let targetPos = graph.getElementPosition(edgeData.target);

    let midX = (sourcePos[0] + targetPos[0]) / 2;
    let midY = (sourcePos[1] + targetPos[1]) / 2;

    let vp = graph.getViewportByCanvas([midX, midY]);
    return { x: vp[0], y: vp[1] };
}

/************************************************************
 *  Show a floating properties icon at the edge midpoint.
 ************************************************************/
function show_edge_icon(gobj)
{
    hide_edge_icon(gobj);

    let priv = gobj.priv;
    if(!priv._selected_edge_id) {
        return;
    }

    let mid = get_edge_viewport_midpoint(gobj, priv._selected_edge_id);
    if(!mid) {
        return;
    }

    let icons = show_dual_icons(gobj, mid.x + 4, mid.y + floating_icon_dy(),
        t('edge properties'), () => toggle_edge_popover(gobj),
        t('unlink'), () => request_unlink_edge(gobj)
    );
    priv._edge_icon_el = icons.icon_el;
    priv._edge_delete_el = icons.delete_el;
}

function hide_edge_icon(gobj)
{
    hide_overlay(gobj, '_edge_icon_el', '_edge_delete_el');
}

function update_edge_icon_position(gobj)
{
    let priv = gobj.priv;
    if(!priv._selected_edge_id || !priv._edge_icon_el) {
        return;
    }

    try {
        let mid = get_edge_viewport_midpoint(gobj, priv._selected_edge_id);
        if(!mid) {
            hide_edge_icon(gobj);
            hide_edge_popover(gobj);
            return;
        }
        priv._edge_icon_el.style.left = (mid.x + 4) + 'px';
        priv._edge_icon_el.style.top = (mid.y + floating_icon_dy()) + 'px';
        if(priv._edge_delete_el) {
            priv._edge_delete_el.style.left = (mid.x + 4) + 'px';
            priv._edge_delete_el.style.top =
                (mid.y + floating_icon_dy() + floating_icon_step()) + 'px';
        }

        // Reposition popover if open
        if(priv._edge_popover_el) {
            priv._edge_popover_el.style.left =
                (mid.x + floating_popover_dx()) + 'px';
            priv._edge_popover_el.style.top = (mid.y + floating_icon_dy()) + 'px';
            clamp_popover_position(gobj, priv._edge_popover_el);
        }
    } catch(e) {
        hide_edge_icon(gobj);
        hide_edge_popover(gobj);
    }
}

/************************************************************
 *  Edge properties popover: form with lineWidth, color,
 *  and apply-to scope.
 ************************************************************/
function toggle_edge_popover(gobj)
{
    let priv = gobj.priv;
    if(priv._edge_popover_el) {
        hide_edge_popover(gobj);
    } else {
        show_edge_popover(gobj);
    }
}

function show_edge_popover(gobj)
{
    hide_edge_popover(gobj);

    let priv = gobj.priv;
    let graph = priv.graph;
    let edge_id = priv._selected_edge_id;
    if(!edge_id) {
        return;
    }

    let edgeData = graph.getEdgeData(edge_id);
    if(!edgeData) {
        return;
    }
    let style = edgeData.style || {};
    let currentLW = style.lineWidth || 2;
    let currentStroke = style.stroke || '#000000';

    // Save original style for cancel/restore
    let origLW = currentLW;
    let origStroke = currentStroke;

    // Clear selected state so the real style is visible during preview
    history_pause(gobj);
    try {
        graph.setElementState(edge_id, []);
    } catch(e) {}
    graph_draw(gobj).then(() => {
        history_resume(gobj);
    });

    let mid = get_edge_viewport_midpoint(gobj, edge_id);
    if(!mid) {
        return;
    }

    const popover = create_popover_base(
        mid.x + floating_popover_dx(), mid.y + floating_icon_dy(),
        'g6-edge-popover', '#d9d9d9', 180
    );

    /*  What the preview writes, undone (see set_preview_undo).  */
    let undo_edge = () => {
        graph.updateEdgeData([{ id: edge_id, style: { lineWidth: origLW, stroke: origStroke } }]);
        graph.draw();
    };

    // Live preview: update the selected edge in real time
    function preview_edge() {
        let lw = parseInt(lwInput.value) || 2;
        let color = colorInput.value;
        graph.updateEdgeData([{ id: edge_id, style: { lineWidth: lw, stroke: color } }]);
        graph.draw();
    }

    // Line width
    create_form_label(popover, 'line width');
    let lwInput = create_form_number_input(popover, currentLW, 1, 20, preview_edge);

    // Color
    create_form_label(popover, 'color');
    let colorInput = create_form_color_input(popover, currentStroke, preview_edge);

    // Apply-to scope
    create_form_label(popover, 'apply to');
    let scopeSelect = create_form_select(popover, [
        { value: 'this', label: t('this edge') },
        { value: 'same_type', label: t('same type edges') },
        { value: 'all', label: t('all edges') },
    ]);

    create_form_button_row(popover, [
        {
            text: 'cancel',
            style: BTN_STYLE_CANCEL,
            onClick: () => {
                deselect_edge(gobj);        /*  which undoes the preview  */
            },
        },
        {
            text: 'apply',
            style: 'flex:1;padding:6px;background:#52c41a;color:#fff;border:none;' +
                   'border-radius:4px;cursor:pointer;font-size:13px;font-weight:500;',
            onClick: () => {
                drop_preview_undo(gobj, '_edge_preview_undo');
                apply_edge_properties(gobj, edge_id,
                    parseInt(lwInput.value) || 2,
                    colorInput.value,
                    scopeSelect.value
                );
            },
        },
    ]);

    priv.$container.appendChild(popover);
    priv._edge_popover_el = popover;
    set_preview_undo(gobj, '_edge_preview_undo', undo_edge);

    // Clamp popover inside the container
    clamp_popover_position(gobj, popover);
}

/************************************************************
 *  Clamp a popover so it stays inside the container.
 ************************************************************/
function clamp_popover_position(gobj, popover)
{
    let priv = gobj.priv;
    if(!popover) {
        return;
    }

    let containerRect = priv.$container.getBoundingClientRect();
    let popRect = popover.getBoundingClientRect();
    let margin = 4;

    let left = popover.offsetLeft;
    let top = popover.offsetTop;

    // Clamp right edge
    if(left + popRect.width > containerRect.width - margin) {
        left = containerRect.width - popRect.width - margin;
    }
    // Clamp bottom edge
    if(top + popRect.height > containerRect.height - margin) {
        top = containerRect.height - popRect.height - margin;
    }
    // Clamp left/top
    if(left < margin) {
        left = margin;
    }
    if(top < margin) {
        top = margin;
    }

    popover.style.left = left + 'px';
    popover.style.top = top + 'px';
}

function hide_edge_popover(gobj)
{
    run_preview_undo(gobj, '_edge_preview_undo');
    hide_overlay(gobj, '_edge_popover_el');
}

/************************************************************
 *  Node properties icon and popover
 ************************************************************/
function show_node_icon(gobj)
{
    hide_node_icon(gobj);

    let priv = gobj.priv;
    if(!priv._selected_node_id || priv._selected_port_key) {
        return;
    }

    let rect = get_node_viewport_rect(gobj, priv._selected_node_id);
    if(!rect) {
        return;
    }

    let icons = show_dual_icons(gobj, rect.right + 4, rect.top + floating_icon_dy(),
        t('node properties'), () => toggle_node_popover(gobj),
        t('delete node'), () => request_delete_node(gobj)
    );
    priv._node_icon_el = icons.icon_el;
    priv._node_delete_el = icons.delete_el;
}

function hide_node_icon(gobj)
{
    hide_overlay(gobj, '_node_icon_el', '_node_delete_el');
}

function update_node_icon_position(gobj)
{
    let priv = gobj.priv;
    if(!priv._selected_node_id || priv._selected_port_key) {
        return;
    }

    // Recreate icon if it was removed (e.g. by resize)
    if(!priv._node_icon_el) {
        show_node_icon(gobj);
        return;
    }

    try {
        let rect = get_node_viewport_rect(gobj, priv._selected_node_id);
        if(!rect) {
            hide_node_icon(gobj);
            hide_node_popover(gobj);
            return;
        }
        priv._node_icon_el.style.left = (rect.right + 4) + 'px';
        priv._node_icon_el.style.top = (rect.top + floating_icon_dy()) + 'px';
        if(priv._node_delete_el) {
            priv._node_delete_el.style.left = (rect.right + 4) + 'px';
            priv._node_delete_el.style.top =
                (rect.top + floating_icon_dy() + floating_icon_step()) + 'px';
        }

        // Reposition popover if open
        if(priv._node_popover_el) {
            priv._node_popover_el.style.left =
                (rect.right + floating_popover_dx()) + 'px';
            priv._node_popover_el.style.top = (rect.top + floating_icon_dy()) + 'px';
            clamp_popover_position(gobj, priv._node_popover_el);
        }
    } catch(e) {
        hide_node_icon(gobj);
        hide_node_popover(gobj);
    }
}

/************************************************************
 *  Node properties popover: form with fill color, stroke
 *  color, lineWidth, and apply-to scope.
 ************************************************************/
function toggle_node_popover(gobj)
{
    let priv = gobj.priv;
    if(priv._node_popover_el) {
        hide_node_popover(gobj);
    } else {
        show_node_popover(gobj);
    }
}

function show_node_popover(gobj)
{
    hide_node_popover(gobj);

    let priv = gobj.priv;
    let graph = priv.graph;
    let node_id = priv._selected_node_id;
    if(!node_id) {
        return;
    }

    let nodeData = graph.getNodeData(node_id);
    if(!nodeData) {
        return;
    }
    let style = nodeData.style || {};
    let currentFill = style.fill || '#ffffff';
    let currentStroke = style.stroke || '#000000';
    let currentLW = style.lineWidth || 1;

    // Save original style for cancel/restore
    let origFill = currentFill;
    let origStroke = currentStroke;
    let origLW = currentLW;

    let rect = get_node_viewport_rect(gobj, node_id);
    if(!rect) {
        return;
    }

    const popover = create_popover_base(
        rect.right + floating_popover_dx(), rect.top + floating_icon_dy(),
        'g6-node-popover', '#d9d9d9', 180
    );

    /*  Paint the node with these colours, whatever it is wearing:
     *  the style for a figure, and the html of a card or a pill,
     *  which repaint_cards() rebuilds from the style it is given
     *  here (node_fill_of).  */
    let paint_node = (fill, stroke, lw) => {
        graph.updateNodeData([{
            id: node_id, style: {fill: fill, stroke: stroke, lineWidth: lw},
        }]);
        repaint_cards(gobj, new Set([node_id]));
        graph.draw();
    };

    /*  What the preview writes, undone (see set_preview_undo).  */
    let undo_node = () => {
        paint_node(origFill, origStroke, origLW);
    };

    // Live preview
    function preview_node() {
        paint_node(fillInput.value, strokeInput.value, parseInt(lwInput.value) || 1);
    }

    // Fill color
    create_form_label(popover, 'fill color');
    let fillInput = create_form_color_input(popover, currentFill, preview_node);

    // Stroke color
    create_form_label(popover, 'stroke color');
    let strokeInput = create_form_color_input(popover, currentStroke, preview_node);

    // Line width
    create_form_label(popover, 'line width');
    let lwInput = create_form_number_input(popover, currentLW, 1, 20, preview_node);

    /*  The figure the node wears in the `shape` view. No preview:
     *  it shows only in that view, and applying it is the same
     *  reshape either way.  */
    create_form_label(popover, 'shape');
    let shapeSelect = create_form_select(popover, NODE_SHAPES.map((shape) => {
        return {value: shape, label: t(shape)};
    }));
    shapeSelect.value = nodeData.data && nodeData.data.desc
        ? node_figure_of(gobj, nodeData.data.desc, nodeData.data.graph_props || {})
        : DEFAULT_NODE_SHAPE;
    let orig_figure = shapeSelect.value;

    // Apply-to scope
    create_form_label(popover, 'apply to');
    let scopeSelect = create_form_select(popover, [
        { value: 'this', label: t('this node') },
        { value: 'same_topic', label: t('same topic nodes') },
        { value: 'all', label: t('all nodes') },
    ]);

    create_form_button_row(popover, [
        {
            text: 'cancel',
            style: BTN_STYLE_CANCEL,
            onClick: () => {
                hide_node_popover(gobj);    /*  which undoes the preview  */
            },
        },
        {
            text: 'apply',
            style: 'flex:1;padding:6px;background:#1890ff;color:#fff;border:none;' +
                   'border-radius:4px;cursor:pointer;font-size:13px;font-weight:500;',
            onClick: () => {
                drop_preview_undo(gobj, '_node_preview_undo');
                apply_node_properties(gobj, node_id,
                    fillInput.value,
                    strokeInput.value,
                    parseInt(lwInput.value) || 1,
                    scopeSelect.value,
                    /*  Only a figure somebody CHOSE is written: the
                     *  one the select opened on is today's default,
                     *  and saving it would freeze it on the node.  */
                    (shapeSelect.value !== orig_figure)? shapeSelect.value : ""
                );
            },
        },
    ]);

    priv.$container.appendChild(popover);
    priv._node_popover_el = popover;
    set_preview_undo(gobj, '_node_preview_undo', undo_node);

    // Clamp popover inside the container
    clamp_popover_position(gobj, popover);
}

function hide_node_popover(gobj)
{
    run_preview_undo(gobj, '_node_preview_undo');
    hide_overlay(gobj, '_node_popover_el');
}

/************************************************************
 *  Read-only DETAIL popover, shown on node click.
 *  The node itself carries only the basic info (name + topic);
 *  the full record is shown here on demand. Click the same node
 *  again, or the canvas, to dismiss.
 ************************************************************/
function hide_node_detail(gobj)
{
    gobj.priv._detail_node_id = null;
    hide_overlay(gobj, '_node_detail_el');
}

function show_node_detail_popover(gobj, node_id)
{
    let priv = gobj.priv;
    let graph = priv.graph;

    // Toggle: clicking the same node again closes it.
    if(priv._node_detail_el && priv._detail_node_id === node_id) {
        hide_node_detail(gobj);
        return;
    }
    hide_node_detail(gobj);

    let nd = graph.getNodeData(node_id);
    if(!nd || !nd.data || !nd.data.desc) {
        return;
    }
    let rect = get_node_viewport_rect(gobj, node_id);
    if(!rect) {
        return;
    }

    let dark = (priv.theme === "dark");
    let record = nd.data.record || {};
    let topic = nd.data.desc.topic_name || '';
    let id = record.id != null ? String(record.id) : String(node_id);

    let bg = dark ? '#1f2733' : '#ffffff';
    let fg = dark ? '#e8eaed' : '#0f172a';
    let sub = dark ? '#9aa4b2' : '#64748b';
    let bd = dark ? '#3a4250' : '#d9d9d9';
    let rowbd = dark ? '#2c3440' : '#eef1f5';

    const popover = create_popover_base(
        rect.right + 16, rect.top, 'g6-node-detail', bd, 220
    );
    popover.style.background = bg;
    popover.style.color = fg;
    popover.style.maxWidth = '320px';
    popover.style.maxHeight = '60%';
    popover.style.overflow = 'auto';
    /*  The sticky head spans the full width, so the side padding moves
     *  to the rows; `create_popover_base` put 12px on the box itself. */
    popover.style.padding = '0 12px 12px';
    popover.style.fontFamily =
        "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, " +
        "Helvetica, Arial, sans-serif";

    let rows = '';
    for(let key of Object.keys(record)) {
        if(key.indexOf('__') === 0) {   // skip internal metadata
            continue;
        }
        let v = record[key];
        let vs;
        if(v === null || v === undefined) {
            vs = '';
        } else if(typeof v === 'object') {
            vs = JSON.stringify(v);
        } else {
            vs = String(v);
        }
        if(vs.length > 240) {
            vs = vs.slice(0, 240) + '…';
        }
        rows +=
            `<div class="g6-detail-row" style="border-top:1px solid ${rowbd};">` +
            `<div class="g6-detail-key" style="color:${sub};">` +
            `${escapeHtml(key)}</div>` +
            `<div class="g6-detail-val">${escapeHtml(vs)}</div>` +
            `</div>`;
    }

    /*
     *  The head is STICKY: the box scrolls, and with the head scrolling
     *  away the ✕ left the screen -- on a phone, where the box is most
     *  of the screen, that is a popover you cannot close without
     *  scrolling back up for the button. Its background is the
     *  popover's own, or the rows would show through it.
     */
    popover.innerHTML =
        `<div class="g6-detail-head" style="background:${bg};">` +
            `<div style="flex:1 1 auto;min-width:0;">` +
                `<div class="g6-detail-id">${escapeHtml(id)}</div>` +
                `<div class="g6-detail-topic" style="color:${sub};">` +
                `${escapeHtml(topic)}</div>` +
            `</div>` +
            `<div class="g6-detail-close" role="button" tabindex="0"` +
            ` aria-label="${escapeHtml(t('close'))}"` +
            ` title="${escapeHtml(t('close'))}"` +
            ` style="color:${sub};">×</div>` +
        `</div>` +
        (rows || `<div class="g6-detail-empty" style="color:${sub};">` +
            `${escapeHtml(t('no fields'))}</div>`);

    let close_el = popover.querySelector('.g6-detail-close');
    if(close_el) {
        close_el.addEventListener('click', (e) => {
            e.stopPropagation();
            hide_node_detail(gobj);
        });
    }

    priv.$container.appendChild(popover);
    priv._node_detail_el = popover;
    priv._detail_node_id = node_id;
    clamp_popover_position(gobj, popover);
}

/************************************************************
 *  Re-render every HTML (entity) node so its card adopts
 *  the given theme: entity cards and leaf chips (baked innerHTML,
 *  not re-themed by setTheme()) are regenerated; structural
 *  junction diamonds get their neutral fill/stroke re-themed.
 ************************************************************/
/************************************************************
 *  Does this geometry carry a POSITION?
 *
 *  An empty object does not. A treedb hands back `_geometry: {}` for a
 *  record nobody ever moved, and a `__graphs__` node entry can hold a
 *  port size and no coordinates — both are objects all the same.
 ************************************************************/
function geometry_has_position(g)
{
    if(!is_object(g)) {
        return false;
    }
    return is_number(g.x) || is_number(g.y);
}

/************************************************************
 *  Choose a layout for a treedb nobody has arranged yet.
 *
 *  `manual` means "leave every node where it was put", and where none
 *  was put it means a cascade: get_default_ne_xy() walks x and y
 *  together, so a treedb opened for the first time was a diagonal pile
 *  of cards — 126 of them on a real one — and the only way out was to
 *  know to pick a layout by hand. It is the right default only once
 *  there ARE saved positions to leave alone.
 *
 *  So: nothing saved and no preference of the user's ⇒ dagre. The pick
 *  is deliberately NOT persisted — it is a default, not a choice, and
 *  the moment the user drags one node the geometry exists and `manual`
 *  becomes right again by itself.
 ************************************************************/
function auto_layout(gobj)
{
    let priv = gobj.priv;

    if(priv._layout_asked) {
        return false;   /*  the user picked one for this treedb  */
    }
    /*  MOST of the nodes, not one of them.
     *
     *  The app saves the position it invented as readily as one a human
     *  chose, so a single stored coordinate proves nothing: the treedb
     *  that forced this had exactly ONE node of 126 carrying a geometry,
     *  and it was `{x:100, y:100}` — the first cascade slot, saved. One
     *  leftover is not an arrangement. A majority is. */
    /*  MOST of the nodes, not one of them: the app saves a position it
     *  invented as readily as one a human chose, so a single stored
     *  coordinate proves nothing. One leftover is not an arrangement. */
    if(priv._nodes_total > 0 && priv._nodes_placed * 2 > priv._nodes_total) {
        return false;   /*  somebody arranged it: leave it alone  */
    }
    if(!priv.graph) {
        return false;
    }

    /*  Ours, not dagre: the tidy tree keeps the records in their order
     *  and moves nothing on a fold that is not under it (see
     *  treedb_layout.js). dagre stays in the picker.  */
    let name = "treedb-tree";
    gobj_write_attr(gobj, "layout", name);
    try {
        priv.graph.setLayout(_layouts[name]);
    } catch(e) {
        log_error(`${gobj_short_name(gobj)}: cannot set the '${name}' layout: ${e}`);
        return false;
    }
    /*  The toolbar's select was filled before the data arrived, so it is
     *  still showing `manual`: tell it what the graph is actually doing. */
    gobj_publish_event(gobj, "EV_LAYOUT_AUTOSET", {layout: name});
    return true;
}

/************************************************************
 *  Paint the minimap again from where the nodes are NOW.
 *
 *  It repaints off the graph's draw events, and a layout emits none:
 *  G6 moves the nodes with a SILENT draw. So after a layout change
 *  the minimap went on showing the arrangement before it.
 ************************************************************/
function repaint_minimap(gobj)
{
    let plugin = graph_get_plugin(gobj, "minimap");
    if(!plugin || plugin.destroyed) {
        return;
    }
    try {
        plugin.renderMinimap();
        plugin.renderMask();
    } catch(e) {
        log_error(`${gobj_short_name(gobj)}: repaint_minimap failed: ${e}`);
    }
}

/************************************************************
 *  Show or hide the minimap, deciding by the SIZE of the graph.
 *
 *  A minimap of a graph that already fits on screen is decoration; one
 *  of two hundred cards is the only way to know where you are. So it is
 *  not a preference the reader has to find and set — it appears when
 *  there is something to be lost in, from `minimap_min_nodes` on.
 *
 *  Its shapes are drawn by hand. G6's minimap clones each element's key
 *  shape into its own canvas, and every node here is an `html` node
 *  whose key shape is a DOM element — the same reason the `active`
 *  state never painted (see highlight_color()). A block in the topic's
 *  colour is also what a minimap of cards SHOULD show: at that scale a
 *  card is a rectangle anyway.
 ************************************************************/
function refresh_minimap(gobj)
{
    let priv = gobj.priv;
    let graph = priv.graph;
    if(!graph) {
        return;
    }

    let threshold = gobj_read_integer_attr(gobj, "minimap_min_nodes");
    let n = 0;
    try {
        let data = graph.getData() || {};
        n = is_array(data.nodes)? data.nodes.length : 0;
    } catch(e) {
        n = 0;
    }

    if(!threshold || n < threshold) {
        graph_remove_plugin(gobj, "minimap");
        return;
    }

    if(graph_get_plugin(gobj, "minimap")) {
        return;         /*  already up  */
    }

    graph_add_plugin(
        gobj,
        "minimap",
        {
            size: [200, 140],
            position: "bottom-left",
            /*
             *  The anchor has to be CSS, not the pixels G6 computes.
             *
             *  `createPluginCanvas` turns `position` into `left`/`top`
             *  in PIXELS, once, from the canvas size at creation
             *  (`xRatio * (W - width)`). The container then grows --
             *  full screen, a window resize, a panel closing -- and the
             *  minimap stays at the `top` it was given: measured going
             *  full screen, `top` was still `511px` over a container
             *  that had become 768 tall, which put it floating halfway
             *  up the left edge, on top of the graph it is there to
             *  explain.
             *
             *  `containerStyle` is merged AFTER those pixels, so
             *  `top: auto` + `bottom` is a real anchor the browser
             *  keeps for every size the container ever takes.
             *
             *  And it follows the theme: G6's default is a `#fff` box
             *  with a `#ddd` border in BOTH themes, which over a
             *  near-black canvas is the brightest thing on screen.
             */
            containerStyle: {
                top:          "auto",
                bottom:       "12px",
                left:         "12px",
                background:   "var(--bulma-scheme-main, #fff)",
                /*  A mid grey and not a `--bulma-border-*` token: those
                 *  are made for a line INSIDE a surface, and this one has
                 *  to separate a floating panel from the CANVAS behind
                 *  it -- which is near-black in one scheme and white in
                 *  the other. `border-weak` was 1.43:1 over the dark
                 *  canvas and 1.18 over the light one; every border token
                 *  fails at least one of them. This one is 4.6 on both.
                 *  (The box-shadow below separates it only where there
                 *  is light to cast a shadow on.)  */
                border:       "1px solid var(--bulma-text-weak, #94a3b8)",
                borderRadius: "6px",
                boxShadow:    "0 2px 8px rgba(0, 0, 0, 0.15)",
            },
            /*  The viewport rectangle: G6 washes it in black, which is
             *  invisible over a dark minimap. A link-coloured outline
             *  reads on both.  */
            maskStyle: {
                border:     "2px solid var(--bulma-link-on-scheme, var(--bulma-link, #3b82f6))",
                background: "rgba(59, 130, 246, 0.12)",
            },
            shape: (id, element_type, element) => {
                if(element_type !== "node") {
                    return element;     /*  edges clone themselves fine  */
                }
                try {
                    let nd = graph.getNodeData(id);
                    let size = (nd && nd.style && nd.style.size) || [120, 60];
                    /*  The topic's colour PUSHED TOWARDS THE SURFACE, the
                     *  same treatment a port's rim takes: a block here is
                     *  the topic colour on the panel's own background, and
                     *  on the light scheme the palette's yellow was 1.61:1
                     *  on white -- a minimap whose content could not be
                     *  told from its paper. 3.80 in light, 9.11 in dark.  */
                    let color = port_rim(
                        (nd && nd.data && nd.data.desc && nd.data.desc.color) || "#94a3b8",
                        priv.theme
                    );
                    if(is_more_node(nd)) {
                        /*  A `+N` chip is a cut, not a card: quieter than a
                         *  block, and still visible. The slate had to become
                         *  a DARK slate on a white panel -- raising the alpha
                         *  of the light one only ever reached 1.86.  */
                        color = (priv.theme === "dark")
                            ? "rgba(148, 163, 184, 0.60)"    /*  3.35:1  */
                            : "rgba(71, 85, 105, 0.65)";     /*  3.19:1  */
                    }
                    return new RectGeometry({
                        style: {
                            x: -size[0] / 2,
                            y: -size[1] / 2,
                            width: size[0],
                            height: size[1],
                            fill: color,
                            radius: 4
                        }
                    });
                } catch(e) {
                    log_error(`${gobj_short_name(gobj)}: minimap shape failed: ${e}`);
                    return element;
                }
            }
        }
    );
}

/************************************************************
 *  The innerHTML of ONE node, in the given theme and highlight state.
 *  The three treedb tiers (entity / extended / child) each have
 *  their own card, and both the theme refresh and the highlight need the
 *  same three-way choice — it lived inline in the theme refresh and is
 *  shared now. Returns null for a node that carries no desc.
 ************************************************************/
/*  The colour a node is WEARING, from its live style: the shape
 *  functions put the node's own paint there when it has one (see
 *  node_paint_of), and a repaint has to keep it -- rebuilding the
 *  html from `desc.color` is what threw away every colour applied
 *  to a card at the first selection.  */
function node_fill_of(nd)
{
    return (nd && nd.style && nd.style.fill) || nd.data.desc.color;
}

function node_innerHTML_of(nd, theme, highlight, selected, anchored, pills_html)
{
    if(!nd || !nd.data || !nd.data.desc) {
        return null;
    }
    let desc = nd.data.desc;
    let record = nd.data.record || {};
    let label = node_label(desc, record);
    let fill = node_fill_of(nd);

    switch(desc.node_treedb_type) {
        case 'child':
            return build_chip_innerHTML(
                fill, theme, record.icon, label, record.id,
                highlight, selected, anchored
            );
        case 'extended':
            return build_node_innerHTML(
                fill, theme, record.icon, label,
                desc.topic_name, true, record.id, highlight, selected, anchored,
                pills_html
            );
        case 'entity':
            return build_node_innerHTML(
                fill, theme, record.icon, label,
                desc.topic_name, false, record.id, highlight, selected, anchored,
                pills_html
            );
    }
    return null;
}

/************************************************************
 *  Repaint these cards with the flags they carry RIGHT NOW.
 *
 *  One place, because the flags are independent and each used to
 *  be written by whoever repainted last: a find that repainted its
 *  matches erased the selection ring off them, and a selection
 *  repainted over a match erased the amber. Both are read here
 *  from where they live.
 ************************************************************/
function repaint_cards(gobj, ids)
{
    let priv = gobj.priv;
    let graph = priv.graph;

    if(!graph || !ids || !ids.size) {
        return;
    }

    let focus    = new Set(priv._focus_ids || []);
    let selected = new Set(priv._selected_paint_ids || []);

    let updates = [];
    for(let id of ids) {
        let nd;
        try {
            nd = graph.getNodeData(id);
        } catch(e) {
            continue;       /* gone since it was listed */
        }
        let anchored = (priv.anchor_state === "on" && id === priv.anchor_id);
        /*  A figure paints its flags on its own stroke; a pill in
         *  its one-line html; a card in its own.  */
        let mode = (nd && nd.data && nd.data.desc)? node_mode_of(gobj, id) : 'expanded';
        if(mode === 'shape') {
            updates.push({id: id, style: figure_shape_of(
                gobj, nd.data.desc, nd.data.record || {}, nd.data.graph_props || {},
                {highlight: focus.has(id), selected: selected.has(id), anchored: anchored}
            ).style});
            continue;
        }
        let html = (mode === 'compact')
            ? pill_innerHTML_of(gobj, nd, priv.theme, focus.has(id), selected.has(id), anchored)
            : node_innerHTML_of(
                nd, priv.theme, focus.has(id), selected.has(id), anchored,
                pills_html_of(gobj, nd)
            );
        if(html !== null) {
            updates.push({id: id, style: {innerHTML: html}});
        }
    }
    if(!updates.length) {
        return;
    }

    try {
        graph.updateNodeData(updates);
        graph.draw();
    } catch(e) {
        log_error(`${gobj_short_name(gobj)}: cannot repaint the cards: ${e}`);
    }
}

/************************************************************
 *  Repaint the cards whose highlight state CHANGES: the ones that had it
 *  and lose it, plus the ones that gain it. Only those — a treedb graph
 *  is redrawn per keystroke of the find box otherwise.
 ************************************************************/
function apply_node_highlight(gobj, prev_ids, next_ids)
{
    let priv = gobj.priv;
    let graph = priv.graph;
    if(!graph) {
        return;
    }

    let next = new Set(next_ids || []);
    let touched = new Set([...(prev_ids || []), ...next]);
    if(touched.size === 0) {
        return;
    }

    repaint_cards(gobj, touched);
}

function refresh_html_nodes_theme(gobj, theme)
{
    let priv = gobj.priv;
    let graph = priv.graph;
    if(!graph) {
        return;
    }
    let nodes = graph.getData().nodes || [];
    /*  The highlight is part of the card's html, so a theme switch that
     *  rebuilt every card without it would silently CLEAR the focus or the
     *  find that is on screen. Carry it across. */
    let highlighted = new Set(priv._focus_ids || []);
    let selected = new Set(priv._selected_paint_ids || []);
    let updates = [];
    for(let i = 0; i < nodes.length; i++) {
        let id = nodes[i].id;
        let nd = graph.getNodeData(id);
        let anchored = (priv.anchor_state === "on" && id === priv.anchor_id);
        let mode = (nd && nd.data && nd.data.desc)? node_mode_of(gobj, id) : 'expanded';
        if(mode === 'shape') {
            updates.push({id: id, style: figure_shape_of(
                gobj, nd.data.desc, nd.data.record || {}, nd.data.graph_props || {},
                {highlight: highlighted.has(id), selected: selected.has(id), anchored: anchored}
            ).style});
            continue;
        }
        let html = (mode === 'compact')
            ? pill_innerHTML_of(gobj, nd, theme, highlighted.has(id), selected.has(id), anchored)
            : node_innerHTML_of(
                nd, theme, highlighted.has(id), selected.has(id), anchored,
                pills_html_of(gobj, nd)
            );
        if(html === null) {
            html = more_innerHTML_of(gobj, nd, theme);   /* a `+N` chip, or null */
        }
        if(html !== null) {
            updates.push({id: id, style: {innerHTML: html}});
        }
    }
    if(updates.length > 0) {
        graph.updateNodeData(updates);
    }
}

/************************************************************
 *  Re-theme edges still on the default doc colour (themed_default).
 *  User-customised edge colours are left untouched.
 ************************************************************/
function refresh_default_edges_theme(gobj, theme)
{
    let priv = gobj.priv;
    let graph = priv.graph;
    if(!graph) {
        return;
    }
    let dark = (theme === "dark");
    let edges = graph.getData().edges || [];
    let updates = [];
    for(let i = 0; i < edges.length; i++) {
        let d = edges[i].data || {};
        if(!d.themed_default) {
            continue;
        }
        let stroke = d.is_tree
            ? (dark ? '#22a7c2' : '#0e7490')
            : (dark ? '#8b94a3' : '#6b7280');
        updates.push({ id: edges[i].id, style: { stroke: stroke } });
    }
    if(updates.length > 0) {
        graph.updateEdgeData(updates);
    }
}

/************************************************************
 *  The rings a card can wear, composed into one `box-shadow`.
 *
 *  A node can be a find match and be selected at the same time, so
 *  neither ring may be written by overwriting the other: the amber
 *  halo hugs the card and the blue selection ring is drawn outside
 *  it, which is also the order that reads correctly when only one
 *  of them is on.
 ************************************************************/
/************************************************************
 *  The mark of the card the CAMERA is holding.
 *
 *  An outline and not another ring, and DASHED: the two rings
 *  already mean things here -- amber is a find match or a
 *  focused topic, blue is the selection -- and a third solid
 *  ring would be a third thing to learn in the same channel.
 *  A dash is a different channel, so it reads beside either of
 *  them, and it says "provisional" the way a camera state is.
 *
 *  The same dash the other two viewers draw: this is one
 *  feature with one control, and it should not be three
 *  drawings.
 ************************************************************/
function anchor_outline(anchored)
{
    return anchored? "outline: 3px dashed #fa8c16; outline-offset: 2px;" : "";
}

function ring_shadow(highlight, selected, base_shadow, theme)
{
    let rings = [];

    if(highlight) {
        rings.push(`0 0 0 4px ${highlight_halo(theme)}`);
    }
    if(selected) {
        rings.push(`0 0 0 ${highlight? "7px" : "3px"} ${SELECT_RING}`);
    }
    if(base_shadow) {
        rings.push(base_shadow);
    }
    if(!rings.length) {
        return "";
    }

    return `box-shadow: ${rings.join(", ")};`;
}

/************************************************************
 *  Build innerHTML for pure-child (leaf) nodes: a compact
 *  chip-card. Same colour/typography family as the entity card
 *  but lighter (1px border, no shadow, single line). The name is
 *  always legible (ellipsis + native title tooltip on overflow).
 ************************************************************/
function build_chip_innerHTML(color, theme, icon, label, key, highlight, selected, anchored)
{
    let title = key || label;
    let dark = (theme === "dark");
    let surface = dark ? "#1b2230" : "#ffffff";
    /*  The same 25% as the card (build_node_innerHTML): a leaf chip and
     *  the card it hangs from are side by side, and two tints of one
     *  colour read as two topics.  */
    let bg = dark
        ? `color-mix(in srgb, ${color} 25%, #2c3542)`
        : `color-mix(in srgb, ${color} 10%, ${surface})`;
    let border = dark
        ? `color-mix(in srgb, ${color} 85%, #ffffff)`
        : color;
    let text_color = dark ? "#e8eaed" : "#0f172a";
    if(highlight) {
        border = highlight_color(theme);
    }

    let icon_html = "";
    if(icon) {
        icon_html = `<img src="${safeSrc(icon)}" alt="" style="
        width: 16px; height: 16px; object-fit: contain;
        margin-right: 6px; flex: 0 0 auto;
    "/>`;
    }

    return `
<div class="TREEDB_CARD" title="${escapeHtml(title)}" style="
    box-sizing: border-box;
    width: 100%;
    height: 100%;
    background: ${bg};
    border: ${highlight? "3px" : "1px"} solid ${border};
    ${ring_shadow(highlight, selected, "", theme)}
    ${anchor_outline(anchored)}
    border-radius: 8px;
    color: ${text_color};
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 12px;
    overflow: hidden;
">${icon_html}<span style="
        font-size: 12px; font-weight: 600; line-height: 1;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    ">${escapeHtml(label)}</span>
</div>
`;
}

/************************************************************
 *  Build innerHTML for entity (HTML) nodes.
 *
 *  Card style modelled on the documentation schema graphs
 *  (docs gen_treedb_graphs.py): rounded card, soft tint of the
 *  topic colour with a strong matching border, subtle elevation,
 *  system typography, bold id + muted topic subtitle. The topic
 *  colour is kept (per-topic differentiation) but softened via
 *  color-mix instead of a harsh saturated fill. Theme-aware.
 ************************************************************/
function build_node_innerHTML(color, theme, icon, label, topic_name, structural, key, highlight, selected, anchored, pills_html)
{
    let title = key || label;
    let dark = (theme === "dark");
    let surface = dark ? "#1b2230" : "#ffffff";
    let bg, border, border_style;
    if(structural) {
        // Structural node (extended): neutral grey, dashed border —
        // reads as "container/junction" but still shows its name.
        bg = dark ? "#2c3542" : "#f1f5f9";
        border = dark ? "#7c8694" : "#94a3b8";
        border_style = "dashed";
    } else {
        // Soft palette (like the topology diagram): a light tint of
        // the topic colour as fill, the topic colour as the border.
        // On dark, lift the card off the (near-black) canvas with a
        // clearly-lighter slate base + a vivid border, or the cards
        // become invisible.
        /*  25% and not 30% in dark: the tint is what says WHICH topic
         *  a card belongs to, and it is also the ground everything on
         *  the card is written on. At 30% the yellow of the palette
         *  left the record's name at 5.17:1 and the topic under it at
         *  2.47 -- unreadable at 11px. Five points of tint buy the
         *  name 5.80 and cost the colour almost nothing.  */
        bg = dark
            ? `color-mix(in srgb, ${color} 25%, #2c3542)`
            : `color-mix(in srgb, ${color} 10%, ${surface})`;
        border = dark
            ? `color-mix(in srgb, ${color} 85%, #ffffff)`
            : color;
        border_style = "solid";
    }
    if(highlight) {
        border = highlight_color(theme);
        border_style = "solid";
    }
    let title_color = dark ? "#e8eaed" : "#0f172a";
    /*  The topic name under the record's, at 11px, so it needs the
     *  4.5:1 of small text on the WORST tint of the palette: the old
     *  greys gave 2.47 in dark and 4.28 in light. These give 4.64 and
     *  5.65, and the hierarchy stays where it belongs -- in the size
     *  and the weight, not in a grey nobody can read.  */
    let sub_color = dark ? "#ccd3dd" : "#556173";
    let shadow = dark
        ? "0 1px 3px rgba(0,0,0,0.45), 0 1px 2px rgba(0,0,0,0.30)"
        : "0 1px 3px rgba(15,23,42,0.12), 0 1px 2px rgba(15,23,42,0.06)";

    let icon_html = "";
    if(icon) {
        icon_html = `
    <img src="${safeSrc(icon)}" alt="" style="
        width: 28px; height: 28px; object-fit: contain;
        margin-bottom: 6px; flex: 0 0 auto;
    "/>`;
    }

    let sub_html = "";
    if(topic_name) {
        sub_html = `
    <div style="
        font-size: 11px; line-height: 1.2; color: ${sub_color};
        margin-top: 2px; max-width: 100%;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    ">${escapeHtml(topic_name)}</div>`;
    }

    /*  The fold pills, one per hook with children: a row under the
     *  subtitle, built by pills_html_of(). Empty for a card with
     *  nothing to fold.  */
    let pills_row = "";
    if(pills_html) {
        pills_row = `
    <div class="TREEDB_PILLS" style="
        display: flex; flex-wrap: nowrap; gap: 4px; justify-content: center;
        margin-top: 6px; max-width: 100%; overflow: hidden;
    ">${pills_html}</div>`;
    }

    return `
<div class="TREEDB_CARD" title="${escapeHtml(title)}" style="
    box-sizing: border-box;
    width: 100%;
    height: 100%;
    background: ${bg};
    border: ${highlight? "3px" : "1.5px"} ${border_style} ${border};
    border-radius: 10px;
    ${ring_shadow(highlight, selected, shadow, theme)}
    ${anchor_outline(anchored)}
    color: ${title_color};
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    text-align: center;
    padding: 10px 12px;
    overflow: hidden;
">${icon_html}
    <div style="
        font-size: 14px; font-weight: 600; line-height: 1.25;
        max-width: 100%; overflow: hidden; text-overflow: ellipsis;
        display: -webkit-box; -webkit-line-clamp: 2;
        -webkit-box-orient: vertical; word-break: break-word;
    ">${escapeHtml(label)}</div>${sub_html}${pills_row}
</div>
`;
}

/************************************************************
 *  Request delete node: publish EV_DELETE_NODE to parent.
 ************************************************************/
function request_delete_node(gobj)
{
    let priv = gobj.priv;
    let graph = priv.graph;
    let node_id = priv._selected_node_id;
    if(!node_id) {
        return;
    }

    let nodeData = graph.getNodeData(node_id);
    if(!nodeData || !nodeData.data || !nodeData.data.desc) {
        return;
    }

    if(gobj_read_bool_attr(gobj, "confirm_delete_node")) {
        show_delete_confirm(gobj, nodeData);
    } else {
        execute_delete_node(gobj, nodeData);
    }
}

function execute_delete_node(gobj, nodeData)
{
    let priv = gobj.priv;

    hide_delete_confirm(gobj);

    gobj_publish_event(gobj, "EV_DELETE_NODE", {
        treedb_name: priv.treedb_name,
        topic_name: nodeData.data.desc.topic_name,
        record: nodeData.data.record,
    });

    deselect_node(gobj);
}

/************************************************************
 *  Every node in the graph.
 ************************************************************/
function select_all_nodes(gobj)
{
    let graph = gobj.priv.graph;

    if(!graph) {
        return;
    }

    let nodes = (graph.getData() || {}).nodes || [];
    set_selection(gobj, nodes.filter((nd) => nd.data && nd.data.desc).map((nd) => nd.id));
}

/************************************************************
 *  The nodes currently selected, as their node data.
 ************************************************************/
function selected_nodes_data(gobj)
{
    let priv = gobj.priv;
    let graph = priv.graph;

    let ids = new Set(selected_node_ids(gobj));
    for(let id of (priv._selected_paint_ids || [])) {
        ids.add(id);
    }
    if(priv._selected_node_id) {
        ids.add(priv._selected_node_id);
    }

    let out = [];
    for(let id of ids) {
        let nd;
        try {
            nd = graph.getNodeData(id);
        } catch(e) {
            continue;       /* gone since it was selected */
        }
        if(nd && nd.data && nd.data.desc) {
            out.push(nd);
        }
    }

    return out;
}

/************************************************************
 *  What a delete takes with it, for ONE node or for a set.
 *
 *  Same sentence in both cases and the same keys, because it is the
 *  same warning: these views delete with `force`, which UNLINKS the
 *  children (they survive, loose) and cleans the node off its
 *  parents. Over a set the two numbers are the sums -- an operator
 *  about to detach eleven records has to read eleven, not "are you
 *  sure".
 ************************************************************/
function delete_question(nodes)
{
    let children = 0;
    let parents = 0;

    for(let nd of nodes) {
        let impact = delete_impact(nd.data.desc, nd.data.record || {});
        children += impact.children;
        parents  += impact.parents;
    }

    let question;
    if(nodes.length === 1) {
        let nd = nodes[0];
        question = t('delete') + ' ' + nd.data.desc.topic_name + ': ' +
                   (nd.data.record || {}).id + '?';
    } else {
        question = t('delete') + ' ' + nodes.length + ' ' + t('records') + '?';
    }

    if(children > 0) {
        question += '\n' + children + ' ' +
                    t('children will be unlinked, not deleted', {count: children});
    }
    if(parents > 0) {
        question += '\n' + t('it will be detached from') + ' ' +
                    parents + ' ' + t('parents', {count: parents});
    }

    return question;
}

/************************************************************
 *  Delete every selected node (the Delete key).
 ************************************************************/
function request_delete_selection(gobj)
{
    let nodes = selected_nodes_data(gobj);

    if(!nodes.length) {
        return;     /* nothing selected: the key means nothing here */
    }

    if(!gobj_read_bool_attr(gobj, "confirm_delete_node")) {
        execute_delete_selection(gobj, nodes);
        return;
    }

    /*  No anchor: the set has no icon of its own, so the question is
     *  asked in the middle of the graph.  */
    show_confirm_popover(gobj, null,
        delete_question(nodes),
        'delete', '#ff4d4f',
        () => execute_delete_selection(gobj, nodes),
        '_delete_confirm_el'
    );
}

function execute_delete_selection(gobj, nodes)
{
    let priv = gobj.priv;

    hide_delete_confirm(gobj);

    /*  One event per node: a treedb deletes records, it has no bulk
     *  delete, and the host turns each of these into its own command
     *  exactly as the topic table's bulk delete does.  */
    for(let nd of nodes) {
        gobj_publish_event(gobj, "EV_DELETE_NODE", {
            treedb_name: priv.treedb_name,
            topic_name: nd.data.desc.topic_name,
            record: nd.data.record,
        });
    }

    deselect_node(gobj);
}

/************************************************************
 *  Show a confirmation popover next to the delete icon.
 ************************************************************/
function show_delete_confirm(gobj, nodeData)
{
    let priv = gobj.priv;

    /*  Same sentence as the Delete key's, from the same place: the
     *  warning does not depend on how the delete was asked for.  */
    show_confirm_popover(gobj, priv._node_delete_el,
        delete_question([nodeData]),
        'delete', '#ff4d4f',
        () => execute_delete_node(gobj, nodeData),
        '_delete_confirm_el'
    );
}

function hide_delete_confirm(gobj)
{
    hide_overlay(gobj, '_delete_confirm_el');
}

/************************************************************
 *  Create node: show a popover to select topic and enter id.
 ************************************************************/
function toggle_create_popover(gobj)
{
    let priv = gobj.priv;
    if(priv._create_popover_el) {
        hide_create_popover(gobj);
    } else {
        show_create_popover(gobj);
    }
}

function show_create_popover(gobj)
{
    hide_create_popover(gobj);

    let priv = gobj.priv;
    if(!priv.descs) {
        return;
    }

    /*
     *  Collect available topics (skip system topics starting with "__")
     */
    let topics = [];
    for(const [topic_name, desc] of Object.entries(priv.descs)) {
        if(topic_name.substring(0, 2) === "__") {
            continue;
        }
        topics.push({
            topic_name: topic_name,
            color: desc.color || '#ccc',
        });
    }
    if(topics.length === 0) {
        return;
    }

    /*
     *  Position: to the right of the edit toolbar's "+" button
     */
    let left = 60;
    let top = 12;
    let btnEl = priv.$container.querySelector('.EV_CREATE_NODE_BTN');
    if(btnEl) {
        let btnRect = btnEl.getBoundingClientRect();
        let containerRect = priv.$container.getBoundingClientRect();
        left = btnRect.right - containerRect.left + 8;
        top = btnRect.top - containerRect.top;
    }

    const popover = create_popover_base(left, top, 'g6-create-popover', '#1890ff', 220);

    // Title
    let titleEl = document.createElement('div');
    titleEl.style.cssText = 'margin-bottom:10px;font-weight:600;font-size:14px;';
    titleEl.textContent = t('create node');
    popover.appendChild(titleEl);

    // Topic selector
    let topicLabel = document.createElement('div');
    topicLabel.style.cssText = 'margin-bottom:4px;font-weight:500;';
    topicLabel.textContent = t('topic') + ':';
    popover.appendChild(topicLabel);

    let topicSelect = document.createElement('select');
    topicSelect.style.cssText =
        'width:100%;padding:6px;border:1px solid #d9d9d9;border-radius:4px;' +
        'font-size:13px;margin-bottom:8px;' + touch_control_css();
    for(let i = 0; i < topics.length; i++) {
        let opt = document.createElement('option');
        opt.value = topics[i].topic_name;
        opt.textContent = topics[i].topic_name;
        opt.style.cssText = 'padding:4px;';
        topicSelect.appendChild(opt);
    }
    popover.appendChild(topicSelect);

    // Color indicator (updates with topic selection)
    let colorRow = document.createElement('div');
    colorRow.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:8px;';
    let colorDot = document.createElement('span');
    colorDot.style.cssText =
        'display:inline-block;width:14px;height:14px;border-radius:50%;' +
        'border:1px solid #999;background:' + topics[0].color + ';';
    let colorText = document.createElement('span');
    colorText.style.cssText = 'font-size:12px;color:#666;';
    colorText.textContent = topics[0].topic_name;
    colorRow.appendChild(colorDot);
    colorRow.appendChild(colorText);
    popover.appendChild(colorRow);

    topicSelect.addEventListener('change', () => {
        let sel = topics.find(t => t.topic_name === topicSelect.value);
        if(sel) {
            colorDot.style.background = sel.color;
            colorText.textContent = sel.topic_name;
        }
    });

    // Node ID input
    let idLabel = document.createElement('div');
    idLabel.style.cssText = 'margin-bottom:4px;font-weight:500;';
    idLabel.textContent = 'Id:';
    popover.appendChild(idLabel);

    let idInput = document.createElement('input');
    idInput.type = 'text';
    idInput.placeholder = t('node id');
    idInput.style.cssText =
        'width:100%;padding:6px;border:1px solid #d9d9d9;border-radius:4px;' +
        'font-size:13px;margin-bottom:10px;box-sizing:border-box;' +
        touch_control_css();
    popover.appendChild(idInput);

    // Error message area
    let errorEl = document.createElement('div');
    errorEl.style.cssText =
        'color:#ff4d4f;font-size:12px;margin-bottom:8px;display:none;';
    popover.appendChild(errorEl);

    // Button row
    let createBtn;  // need reference for Enter key handler
    create_form_button_row(popover, [
        {
            text: 'cancel',
            style: BTN_STYLE_CANCEL,
            onClick: () => hide_create_popover(gobj),
        },
        {
            text: 'create',
            style: 'flex:1;padding:6px;background:#1890ff;color:#fff;border:none;' +
                   'border-radius:4px;cursor:pointer;font-size:13px;font-weight:500;',
            onClick: () => {
                let node_id = idInput.value.trim();
                if(!node_id) {
                    errorEl.textContent = t('node id') + ' required';
                    errorEl.style.display = 'block';
                    idInput.focus();
                    return;
                }
                execute_create_node(gobj, topicSelect.value, node_id);
            },
        },
    ]);
    createBtn = popover.querySelector('button:last-child');

    // Enter key submits
    idInput.addEventListener('keydown', (e) => {
        if(e.key === 'Enter') {
            e.preventDefault();
            createBtn.click();
        } else if(e.key === 'Escape') {
            e.preventDefault();
            hide_create_popover(gobj);
        }
    });

    priv.$container.appendChild(popover);
    priv._create_popover_el = popover;

    clamp_popover_position(gobj, popover);

    // Focus the id input
    idInput.focus();
}

function hide_create_popover(gobj)
{
    hide_overlay(gobj, '_create_popover_el');
}

function execute_create_node(gobj, topic_name, node_id)
{
    let priv = gobj.priv;

    hide_create_popover(gobj);

    gobj_publish_event(gobj, "EV_CREATE_NODE", {
        treedb_name: priv.treedb_name,
        topic_name: topic_name,
        record: {
            id: node_id,
        },
    });
}

/************************************************************
 *  Request unlink edge: publish EV_UNLINK_NODES to parent.
 ************************************************************/
function request_unlink_edge(gobj)
{
    let priv = gobj.priv;
    let graph = priv.graph;
    let edge_id = priv._selected_edge_id;
    if(!edge_id) {
        return;
    }

    let edgeData = graph.getEdgeData(edge_id);
    if(!edgeData || !edgeData.data) {
        return;
    }

    if(gobj_read_bool_attr(gobj, "confirm_unlink_edge")) {
        show_unlink_confirm(gobj, edgeData);
    } else {
        execute_unlink_edge(gobj, edgeData);
    }
}

function execute_unlink_edge(gobj, edgeData)
{
    let priv = gobj.priv;

    hide_unlink_confirm(gobj);

    const d = edgeData.data;

    /*
     * Backend decode_parent_ref() expects "topic^id^hook_name".
     * Backend decode_child_ref()  expects "topic^id".
     */
    gobj_publish_event(gobj, "EV_UNLINK_NODES", {
        treedb_name: priv.treedb_name,
        parent_ref: `${d.parent_topic}^${d.parent_id}^${d.hook_name}`,
        child_ref:  `${d.child_topic}^${d.child_id}`,
    });

    deselect_edge(gobj);
}

/************************************************************
 *  Show a confirmation popover next to the unlink icon.
 ************************************************************/
function show_unlink_confirm(gobj, edgeData)
{
    let priv = gobj.priv;
    const d = edgeData.data;

    /*  The reassurance is the point: an unlink removes the LINK and nothing
     *  else, and next to a delete button painted the same red, that is not
     *  obvious. */
    show_confirm_popover(gobj, priv._edge_delete_el,
        t('unlink') + ' ' + d.child_id + ' → ' + d.parent_id + '?' +
        '\n' + t('neither record is deleted'),
        'unlink', '#ff4d4f',
        () => execute_unlink_edge(gobj, edgeData),
        '_unlink_confirm_el'
    );
}

function hide_unlink_confirm(gobj)
{
    hide_overlay(gobj, '_unlink_confirm_el');
}

/************************************************************
 *  Apply node properties to one or more nodes.
 *  scope: 'this', 'same_topic', 'all'
 ************************************************************/
function apply_node_properties(gobj, node_id, fill, stroke, lineWidth, scope, shape)
{
    let priv = gobj.priv;
    let graph = priv.graph;

    let nodeData = graph.getNodeData(node_id);
    if(!nodeData || !nodeData.data) {
        return;
    }

    let source_topic = nodeData.data.desc ? nodeData.data.desc.topic_name : null;
    let updates = [];
    let repaint = new Set();
    const nodes = graph.getData().nodes;

    /*  The figure AND the colours: written where Save reads them (the
     *  node's entry in `__graphs__`), and as the topic's default for
     *  the wider scopes, so a record that arrives later is born with
     *  them. The colours used to be written on the live style alone,
     *  which on an html card is under the html: the first repaint
     *  rebuilt that html from the topic's colour and the choice was
     *  gone, and nothing of it ever reached the store.  */
    let figure = (shape && str_in_list(NODE_SHAPES, shape))? shape : "";
    let reshaped = [];
    if(scope !== 'this') {
        let topics = (scope === 'same_topic')? [source_topic] : Object.keys(priv.descs || {});
        for(let topic_name of topics) {
            let desc = priv.descs[topic_name];
            if(!desc) {
                continue;
            }
            if(!is_object(priv._graph_properties[topic_name])) {
                priv._graph_properties[topic_name] = {};
            }
            let defaults = priv._graph_properties[topic_name].defaults || {};
            if(figure) {
                defaults.node_shape = figure;
            }
            paint_into(defaults, desc, fill, stroke, lineWidth);
            priv._graph_properties[topic_name].defaults = defaults;
        }
    }

    for(let i = 0; i < nodes.length; i++) {
        let nd = graph.getNodeData(nodes[i].id);
        if(!nd || !nd.data || !nd.data.desc) {
            continue;
        }

        if(scope === 'this' && nodes[i].id !== node_id) {
            continue;
        }
        if(scope === 'same_topic' && nd.data.desc.topic_name !== source_topic) {
            continue;
        }

        let entry = node_props_entry(gobj, nd);
        if(figure) {
            entry.node_shape = figure;
            if(node_mode_of(gobj, nodes[i].id) === 'shape') {
                reshaped.push(nodes[i].id);
            }
        }
        paint_into(entry, nd.data.desc, fill, stroke, lineWidth);

        /*  The style for the figure, the html for the card and the
         *  pill: every tier is repainted, and the repaint reads the
         *  style it is given here (node_fill_of).  */
        let updateStyle = { fill: fill, stroke: stroke, lineWidth: lineWidth };
        updates.push({ id: nodes[i].id, style: updateStyle });
        repaint.add(nodes[i].id);
    }

    if(updates.length > 0) {
        graph.updateNodeData(updates);
        if(reshaped.length) {
            reshape_nodes(gobj, reshaped);
        }
        repaint_cards(gobj, repaint);
        graph.draw().then(() => {
            mark_graph_dirty(gobj);
        });
    }

    hide_node_popover(gobj);
}

/************************************************************
 *  The node's entry in `_graph_properties` -- the object Save
 *  reads and writes -- created if it has none yet, and the node's
 *  `data.graph_props` pointed at it, so a key written here is
 *  read by the next reshape and survives the next Save.
 ************************************************************/
function node_props_entry(gobj, nd)
{
    let priv = gobj.priv;
    let topic_name = nd.data.topic_name;
    let record = nd.data.record || {};

    if(!is_object(priv._graph_properties[topic_name])) {
        priv._graph_properties[topic_name] = {};
    }
    let topic_props = priv._graph_properties[topic_name];
    if(!is_object(topic_props.nodes)) {
        topic_props.nodes = {};
    }
    if(!is_object(topic_props.nodes[record.id])) {
        topic_props.nodes[record.id] = is_object(nd.data.graph_props)? nd.data.graph_props : {};
    }
    nd.data.graph_props = topic_props.nodes[record.id];
    return nd.data.graph_props;
}

/************************************************************
 *  Apply edge properties to one or more edges.
 *  scope: 'this', 'same_type', 'all'
 ************************************************************/
function apply_edge_properties(gobj, edge_id, lineWidth, stroke, scope)
{
    let priv = gobj.priv;
    let graph = priv.graph;

    let edgeData = graph.getEdgeData(edge_id);
    if(!edgeData || !edgeData.data) {
        return;
    }

    let source_hook = edgeData.data.hook_name;
    let newStyle = { lineWidth: lineWidth, stroke: stroke };

    let updates = [];
    const edges = graph.getData().edges;

    for(let i = 0; i < edges.length; i++) {
        let ed = graph.getEdgeData(edges[i].id);
        if(!ed || !ed.data) {
            continue;
        }

        if(scope === 'this' && edges[i].id !== edge_id) {
            continue;
        }
        if(scope === 'same_type' && ed.data.hook_name !== source_hook) {
            continue;
        }

        updates.push({ id: edges[i].id, style: { ...newStyle } });
    }

    if(updates.length > 0) {
        graph.updateEdgeData(updates);
        graph.draw().then(() => {
            mark_graph_dirty(gobj);
        });
    }

    // Store defaults in _graph_properties
    let parent_topic = edgeData.data.parent_topic;
    if(scope === 'same_type') {
        if(!is_object(priv._graph_properties[parent_topic])) {
            priv._graph_properties[parent_topic] = {};
        }
        let defaults = priv._graph_properties[parent_topic].defaults || {};
        let edge_defaults = defaults.edge_styles || {};
        edge_defaults[source_hook] = { lineWidth: lineWidth, stroke: stroke };
        defaults.edge_styles = edge_defaults;
        priv._graph_properties[parent_topic].defaults = defaults;
    } else if(scope === 'all') {
        for(const topic_name of Object.keys(priv.descs || {})) {
            if(!is_object(priv._graph_properties[topic_name])) {
                priv._graph_properties[topic_name] = {};
            }
            let defaults = priv._graph_properties[topic_name].defaults || {};
            defaults.edge_style = { lineWidth: lineWidth, stroke: stroke };
            priv._graph_properties[topic_name].defaults = defaults;
        }
    }

    deselect_edge(gobj);
}

/************************************************************
 *  The style an edge INHERITS, before anything saved for the
 *  edge itself: its hook's default in the parent topic, else the
 *  parent topic's default for every edge, else the library's.
 *
 *  The library's: neutral grey, teal for the containment/tree
 *  relation (parent and child of the same topic, a
 *  self-hierarchy). `themed_default` says the colour is still the
 *  library's, so a theme toggle re-themes it and leaves a chosen
 *  one alone.
 ************************************************************/
function edge_inherited_style_of(gobj, d)
{
    let priv = gobj.priv;
    let dark = (priv.theme === "dark");
    let style = {
        lineWidth: d.is_tree ? 2 : 1.6,
        stroke: d.is_tree
            ? (dark ? '#22a7c2' : '#0e7490')
            : (dark ? '#8b94a3' : '#6b7280'),
        themed_default: true,
    };

    let defs = topic_defaults_of(gobj, d.parent_topic);
    if(!defs) {
        return style;
    }
    let chosen = null;
    if(is_object(defs.edge_styles) && is_object(defs.edge_styles[d.hook_name])) {
        chosen = defs.edge_styles[d.hook_name];
    } else if(is_object(defs.edge_style)) {
        chosen = defs.edge_style;
    }
    if(chosen) {
        if(chosen.lineWidth != null) {
            style.lineWidth = chosen.lineWidth;
        }
        if(chosen.stroke) {
            style.stroke = chosen.stroke;
            style.themed_default = false;
        }
    }
    return style;
}

/*  The key of an edge's own entry in its parent topic's `edges`.  */
function edge_key_of(d)
{
    return d.hook_name + ":" + d.parent_id + ":" + d.child_id;
}

/************************************************************
 *  The style an edge WEARS: what it inherits, with what was saved
 *  for the edge itself on top.
 ************************************************************/
function edge_style_of(gobj, d)
{
    let style = edge_inherited_style_of(gobj, d);
    let topic_props = gobj.priv._graph_properties[d.parent_topic];
    let own = (is_object(topic_props) && is_object(topic_props.edges))?
        topic_props.edges[edge_key_of(d)] : null;
    if(is_object(own)) {
        if(own.lineWidth != null) {
            style.lineWidth = own.lineWidth;
        }
        if(own.stroke) {
            style.stroke = own.stroke;
            style.themed_default = false;
        }
    }
    return style;
}

/************************************************************
 *  Save edge styles into _graph_properties (called from
 *  save_geometry).
 *
 *  Only what differs from what the edge INHERITS is written. It
 *  used to be "any line width but 2", and the library's own width
 *  for an edge between two topics is 1.6: every Save wrote every
 *  such edge down with its width and its theme's colour, so the
 *  default was frozen on it -- a theme toggle no longer re-themed
 *  it after a reload, and a topic default never reached it.
 ************************************************************/
function update_edge_geometry(gobj, edge_id)
{
    let priv = gobj.priv;
    let graph = priv.graph;

    let edgeData = graph.getEdgeData(edge_id);
    if(!edgeData || !edgeData.data || !edgeData.data.parent_topic) {
        return;     /* a `+N` chip's line: not a link, nothing to save */
    }

    let style = edgeData.style || {};
    let d = edgeData.data;
    let inherited = edge_inherited_style_of(gobj, d);
    let parent_topic = d.parent_topic;
    let edge_key = edge_key_of(d);

    let edge_props = {};
    if(style.lineWidth != null && style.lineWidth !== inherited.lineWidth) {
        edge_props.lineWidth = style.lineWidth;
    }
    if(style.stroke && style.stroke !== inherited.stroke) {
        edge_props.stroke = style.stroke;
    }

    if(Object.keys(edge_props).length === 0) {
        let topic_props = priv._graph_properties[parent_topic];
        if(topic_props && is_object(topic_props.edges)) {
            delete topic_props.edges[edge_key];
            if(Object.keys(topic_props.edges).length === 0) {
                delete topic_props.edges;
            }
        }
        return;
    }

    if(!is_object(priv._graph_properties[parent_topic])) {
        priv._graph_properties[parent_topic] = {};
    }
    let topic_props = priv._graph_properties[parent_topic];
    if(!is_object(topic_props.edges)) {
        topic_props.edges = {};
    }
    topic_props.edges[edge_key] = edge_props;
}


/************************************************************
 *  Context menu: build items based on target element.
 *  Returns different menu items for nodes, ports, and edges.
 *  Stores the target in priv for use in the click handler.
 ************************************************************/
function build_context_menu_items(gobj, e)
{
    let priv = gobj.priv;
    let graph = priv.graph;

    // Reset context target
    priv._context_node_id = null;
    priv._context_port_key = null;
    priv._context_edge_id = null;

    if(e.targetType === 'edge') {
        priv._context_edge_id = e.target.id;
        return build_edge_context_menu(gobj);
    }

    if(e.targetType === 'node') {
        let node_id = e.target.id;
        priv._context_node_id = node_id;

        // Detect if right-click is on a port
        let containerRect = priv.$container.getBoundingClientRect();
        let canvasPoint = graph.getCanvasByViewport([
            e.client.x - containerRect.left,
            e.client.y - containerRect.top
        ]);
        let port_key = detect_port_click(
            gobj, node_id, canvasPoint[0], canvasPoint[1]
        );

        /*  A port's commands are edition commands; out of edition a
         *  port is part of its node, and gets the node's menu.  */
        if(port_key && priv.edit_mode) {
            priv._context_port_key = port_key;
            return build_port_context_menu(gobj, node_id, port_key);
        } else {
            return build_node_context_menu(gobj, node_id);
        }
    }

    return [];
}

/************************************************************
 *  Context-menu item with a sprite icon.
 *  G6 inserts `name` as innerHTML (<li ...>${name}</li>), so an
 *  inline <svg><use> from our g6-icon-* sprite renders fine and
 *  keeps the same visual language as the toolbars.
 ************************************************************/
function ctx_item(icon_id, label, value)
{
    let name = `<svg style="width:1em;height:1em;` +
        `vertical-align:-0.125em;margin-right:8px;` +
        `pointer-events:none;fill:currentColor">` +
        `<use href="#${icon_id}"></use></svg>` +
        `${label}`;
    return { name: name, value: value };
}

/************************************************************
 *  Build node context menu items.
 ************************************************************/
function build_node_context_menu(gobj, node_id)
{
    let items = [];

    inject_svg_icons();
    /*  Open or close THIS node against the mode: the door a finger
     *  has to it (a double click is the mouse's).  */
    if(node_is_compact(gobj, node_id)) {
        items.push(ctx_item('g6-icon-fullscreen', t('expand node'), 'toggle_node_mode'));
    } else {
        items.push(ctx_item('g6-icon-fullscreen-exit', t('collapse node'), 'toggle_node_mode'));
    }

    if(gobj.priv.edit_mode && !node_is_compact(gobj, node_id)) {
        items.push(ctx_item('g6-icon-resize', t('resize all'), 'resize_all_nodes'));
        items.push(ctx_item('g6-icon-resize', t('resize topic nodes'), 'resize_topic_nodes'));
    }
    if(gobj.priv.edit_mode) {
        /*  The way back, in every view: what the node properties and
         *  the resizes saved -- or a Save froze before 7.23.80 --
         *  forgotten, the library's defaults back.  */
        items.push(ctx_item('g6-icon-undo', t('reset node'), 'reset_node'));
        items.push(ctx_item('g6-icon-undo', t('reset topic nodes'), 'reset_topic_nodes'));
        items.push(ctx_item('g6-icon-undo', t('reset all nodes'), 'reset_all_nodes'));
    }

    return items;
}

/************************************************************
 *  Build port context menu items.
 ************************************************************/
function build_port_context_menu(gobj, node_id, port_key)
{
    let items = [];

    if(gobj.priv.edit_mode) {
        inject_svg_icons();
        /*  The popover, for a finger: the gear beside the port needs
         *  the port selected first, and a long press is the menu.  */
        items.push(ctx_item('g6-icon-edit', t('port properties'), 'port_properties'));
        items.push(ctx_item('g6-icon-resize', t('resize all ports'), 'resize_all_ports'));
        items.push(ctx_item('g6-icon-resize', t('resize topic ports'), 'resize_topic_ports'));
        /*  The way back from the popover and the two above: the
         *  library's own shape and radius.  */
        items.push(ctx_item('g6-icon-undo', t('reset port'), 'reset_port'));
        items.push(ctx_item('g6-icon-undo', t('reset topic ports'), 'reset_topic_ports'));
        items.push(ctx_item('g6-icon-undo', t('reset all ports'), 'reset_all_ports'));
    }

    return items;
}

/************************************************************
 *  Build edge context menu items: the two floating icons of a
 *  selected edge, for a right click and for a finger.
 ************************************************************/
function build_edge_context_menu(gobj)
{
    let items = [];

    if(gobj.priv.edit_mode) {
        inject_svg_icons();
        items.push(ctx_item('g6-icon-edit', t('edge properties'), 'edge_properties'));
        items.push(ctx_item('g6-icon-delete', t('unlink'), 'unlink_edge'));
        items.push(ctx_item('g6-icon-undo', t('reset edge'), 'reset_edge'));
        items.push(ctx_item('g6-icon-undo', t('reset same type edges'), 'reset_same_type_edges'));
        items.push(ctx_item('g6-icon-undo', t('reset all edges'), 'reset_all_edges'));
    }

    return items;
}

/************************************************************
 *  Handle context menu click: dispatch by value.
 ************************************************************/
function handle_context_menu_click(gobj, value)
{
    let priv = gobj.priv;

    switch(value) {
        case 'toggle_node_mode':
            if(priv._context_node_id) {
                gobj_send_event(gobj, "EV_TOGGLE_NODE_MODE", {id: priv._context_node_id}, gobj);
            }
            break;
        case 'resize_all_nodes':
            copy_size_to_nodes(gobj, false);
            break;
        case 'resize_topic_nodes':
            copy_size_to_nodes(gobj, true);
            break;
        case 'reset_node':
            reset_nodes(gobj, 'this');
            break;
        case 'reset_topic_nodes':
            reset_nodes(gobj, 'same_topic');
            break;
        case 'reset_all_nodes':
            reset_nodes(gobj, 'all');
            break;
        case 'reset_edge':
            reset_edges(gobj, 'this');
            break;
        case 'reset_same_type_edges':
            reset_edges(gobj, 'same_type');
            break;
        case 'reset_all_edges':
            reset_edges(gobj, 'all');
            break;
        case 'port_properties':
            if(priv._context_node_id && priv._context_port_key) {
                select_port(gobj, priv._context_node_id, priv._context_port_key);
                show_port_popover(gobj);
            }
            break;
        case 'resize_all_ports':
            copy_size_to_ports(gobj, false);
            break;
        case 'resize_topic_ports':
            copy_size_to_ports(gobj, true);
            break;
        case 'reset_port':
            reset_ports(gobj, 'this');
            break;
        case 'reset_topic_ports':
            reset_ports(gobj, 'same_topic');
            break;
        case 'reset_all_ports':
            reset_ports(gobj, 'all');
            break;
        case 'edge_properties':
            if(priv._context_edge_id) {
                deselect_node(gobj);
                select_edge(gobj, priv._context_edge_id);
                show_edge_popover(gobj);
            }
            break;
        case 'unlink_edge':
            if(priv._context_edge_id) {
                deselect_node(gobj);
                select_edge(gobj, priv._context_edge_id);
                request_unlink_edge(gobj);
            }
            break;
        default:
            log_error(`${gobj_short_name(gobj)}: unknown context menu item: ${value}`);
            break;
    }
}

/************************************************************
 *  Copy the selected node's size to other nodes.
 *  If same_topic_only=true, only nodes of the same topic.
 *  If same_topic_only=false, all nodes in the graph.
 *  Also copies portR and stores as default.
 ************************************************************/
function copy_size_to_nodes(gobj, same_topic_only)
{
    let priv = gobj.priv;
    let graph = priv.graph;

    let node_id = priv._context_node_id;
    if(!node_id) {
        return;
    }

    let nodedata = graph.getNodeData(node_id);
    if(!nodedata || !nodedata.data) {
        return;
    }

    let source_topic = nodedata.data.topic_name;
    let source_style = nodedata.style || {};
    let source_size = source_style.size;
    let source_portR = source_style.portR;
    let source_type = nodedata.type;

    if(!source_size) {
        return;
    }

    // Store as default for new nodes
    let defaults = { size: [...source_size] };
    if(source_portR != null) {
        defaults.portR = source_portR;
    }

    if(same_topic_only) {
        // Store default only for this topic
        if(!is_object(priv._graph_properties[source_topic])) {
            priv._graph_properties[source_topic] = {};
        }
        priv._graph_properties[source_topic].defaults = defaults;
    } else {
        // Store default for all topics present in the graph
        for(const topic_name of Object.keys(priv.descs || {})) {
            if(!is_object(priv._graph_properties[topic_name])) {
                priv._graph_properties[topic_name] = {};
            }
            priv._graph_properties[topic_name].defaults = { ...defaults };
        }
    }

    // Iterate nodes and update matching ones
    let updates = [];
    const nodes = graph.getData().nodes;
    for(let i = 0; i < nodes.length; i++) {
        let nd = graph.getNodeData(nodes[i].id);
        if(!nd || !nd.data || !nd.data.desc) {
            continue;   /* a `+N` chip keeps its own size */
        }
        if(same_topic_only && nd.data.topic_name !== source_topic) {
            continue;
        }
        if(nodes[i].id === node_id) {
            continue; // skip source
        }

        let updateStyle = {
            size: [...source_size],
        };

        if(source_portR != null) {
            updateStyle.portR = source_portR;
        }

        // Recalculate dx/dy for HTML nodes
        if(is_card_type(nd.type)) {
            updateStyle.dx = -source_size[0] / 2;
            let h = source_size.length > 1 ? source_size[1] : source_size[0];
            updateStyle.dy = -h / 2;
        }

        updates.push({ id: nodes[i].id, style: updateStyle });
    }

    if(updates.length > 0) {
        graph.updateNodeData(updates);
        graph.draw().then(() => {
            update_resize_handles_position(gobj);
            mark_graph_dirty(gobj);
        });
    }
}

/*
 *  What a reset forgets, by what it resets. A node's own look is
 *  its size, its colours, its line width and its figure; its ports
 *  have their own reset. The POSITION is not a property and no reset
 *  touches it: it is where somebody put the node.
 */
const NODE_STYLE_KEYS = ["size", "fill", "stroke", "lineWidth", "node_shape"];
const PORT_STYLE_KEYS = ["portR", "port_sizes", "port_shapes", "port_shape"];

/************************************************************
 *  Forget these saved keys -- on the node of the menu alone
 *  ('this'), or on every node of its topic and in the topic's
 *  defaults ('same_topic'), or everywhere ('all'). Both copies of
 *  an entry are stripped: the one in `_graph_properties` (which
 *  Save writes, folded nodes included) and the one the node
 *  carries. Returns the ids of the nodes on screen to reshape.
 ************************************************************/
function forget_saved_node_keys(gobj, nd, scope, keys)
{
    let priv = gobj.priv;
    let graph = priv.graph;
    let strip = (props) => {
        if(!is_object(props)) {
            return;
        }
        for(let k of keys) {
            delete props[k];
        }
    };

    if(scope === 'this') {
        strip(node_props_entry(gobj, nd));
        strip(nd.data.graph_props);
        if(nd.data.record) {
            strip(nd.data.record._geometry);
        }
        return [nd.id];
    }

    let topic = (scope === 'same_topic')? nd.data.topic_name : "";

    for(const [topic_name, props] of Object.entries(priv._graph_properties || {})) {
        if(topic && topic_name !== topic) {
            continue;
        }
        if(is_object(props.nodes)) {
            for(let node_props of Object.values(props.nodes)) {
                strip(node_props);
            }
        }
        strip(props.defaults);
    }

    let ids = [];
    for(let n of (graph.getNodeData() || [])) {
        if(!n || !n.data || !n.data.desc || is_more_node(n)) {
            continue;
        }
        if(topic && n.data.topic_name !== topic) {
            continue;
        }
        strip(n.data.graph_props);
        if(n.data.record) {
            strip(n.data.record._geometry);
        }
        ids.push(n.id);
    }
    return ids;
}

/*  The nodes are reshaped from what is left saved, and Save writes
 *  the cleared entries: a value nobody chose is not written back
 *  (see update_geometry).  */
function reshape_after_reset(gobj, ids)
{
    let graph = gobj.priv.graph;
    reshape_nodes(gobj, ids);
    graph.draw().then(() => {
        update_resize_handles_position(gobj);
        update_port_resize_handles_position(gobj);
        update_port_icon_position(gobj);
        mark_graph_dirty(gobj);
    });
}

/************************************************************
 *  Forget the saved look of nodes (NODE_STYLE_KEYS), back to the
 *  library's: this node, its topic's, or all of them. A figure
 *  saved as a square before the circle became the default goes
 *  back to the default this way.
 ************************************************************/
function reset_nodes(gobj, scope)
{
    let priv = gobj.priv;
    let nd = priv._context_node_id? priv.graph.getNodeData(priv._context_node_id) : null;
    if(!nd || !nd.data || !nd.data.topic_name) {
        log_error(`${gobj_short_name(gobj)}: reset nodes without a node`);
        return;
    }
    reshape_after_reset(gobj, forget_saved_node_keys(gobj, nd, scope, NODE_STYLE_KEYS));
}

/************************************************************
 *  Forget the saved SHAPE and RADIUS of ports, back to the
 *  library's own:
 *      'this'          the port of the menu, on its node only
 *      'same_topic'    every port of the node's topic, with the
 *                      topic's port defaults
 *      'all'           every port of every topic, likewise
 *  The node's own look is not touched: that is `reset node`.
 ************************************************************/
function reset_ports(gobj, scope)
{
    let priv = gobj.priv;
    let graph = priv.graph;

    let node_id = priv._context_node_id;
    let port_key = priv._context_port_key;
    let nd = node_id? graph.getNodeData(node_id) : null;
    if(!nd || !nd.data || !nd.data.topic_name || !port_key) {
        log_error(`${gobj_short_name(gobj)}: reset ports without a port`);
        return;
    }

    if(scope !== 'this') {
        reshape_after_reset(gobj, forget_saved_node_keys(gobj, nd, scope, PORT_STYLE_KEYS));
        return;
    }

    /*  One port: its entries in the per-port maps, not the maps.  */
    let strip_port = (props) => {
        if(!is_object(props)) {
            return;
        }
        for(let k of ["port_sizes", "port_shapes"]) {
            if(is_object(props[k])) {
                delete props[k][port_key];
                if(Object.keys(props[k]).length === 0) {
                    delete props[k];
                }
            }
        }
    };
    strip_port(node_props_entry(gobj, nd));
    strip_port(nd.data.graph_props);
    if(nd.data.record) {
        strip_port(nd.data.record._geometry);
    }
    reshape_after_reset(gobj, [node_id]);
}

/************************************************************
 *  Forget the saved style of edges, back to what they inherit:
 *      'this'          the edge of the menu, its own entry
 *      'same_type'     every edge of its hook in its parent topic,
 *                      with that hook's default
 *      'all'           every edge, with every edge default
 *  The same three scopes as the edge properties popover.
 ************************************************************/
function reset_edges(gobj, scope)
{
    let priv = gobj.priv;
    let graph = priv.graph;

    let ed = priv._context_edge_id? graph.getEdgeData(priv._context_edge_id) : null;
    if(!ed || !ed.data || !ed.data.parent_topic) {
        log_error(`${gobj_short_name(gobj)}: reset edges without an edge`);
        return;
    }
    let src = ed.data;
    let hits = (d) => {
        if(!d || !d.parent_topic) {
            return false;   /* a `+N` chip's line */
        }
        if(scope === 'this') {
            return edge_key_of(d) === edge_key_of(src) && d.parent_topic === src.parent_topic;
        }
        if(scope === 'same_type') {
            return d.parent_topic === src.parent_topic && d.hook_name === src.hook_name;
        }
        return true;
    };

    /*  The saved entries, on screen or folded away.  */
    for(const [topic_name, props] of Object.entries(priv._graph_properties || {})) {
        if(!is_object(props)) {
            continue;
        }
        if(scope !== 'all' && topic_name !== src.parent_topic) {
            continue;
        }
        if(is_object(props.edges)) {
            for(let key of Object.keys(props.edges)) {
                let hook_name = key.split(":")[0];
                if(scope === 'this' && key !== edge_key_of(src)) {
                    continue;
                }
                if(scope === 'same_type' && hook_name !== src.hook_name) {
                    continue;
                }
                delete props.edges[key];
            }
            if(Object.keys(props.edges).length === 0) {
                delete props.edges;
            }
        }
        if(is_object(props.defaults)) {
            if(scope === 'same_type' && is_object(props.defaults.edge_styles)) {
                delete props.defaults.edge_styles[src.hook_name];
                if(Object.keys(props.defaults.edge_styles).length === 0) {
                    delete props.defaults.edge_styles;
                }
            } else if(scope === 'all') {
                delete props.defaults.edge_styles;
                delete props.defaults.edge_style;
            }
        }
    }

    /*  The edges on screen, restyled from what is left.  */
    let updates = [];
    for(let e of (graph.getEdgeData() || [])) {
        if(!e || !hits(e.data)) {
            continue;
        }
        let style = edge_style_of(gobj, e.data);
        updates.push({
            id: e.id,
            style: {lineWidth: style.lineWidth, stroke: style.stroke},
            data: Object.assign({}, e.data, {themed_default: style.themed_default}),
        });
    }

    deselect_edge(gobj);
    if(updates.length > 0) {
        graph.updateEdgeData(updates);
    }
    graph.draw().then(() => {
        mark_graph_dirty(gobj);
    });
}

/************************************************************
 *  Copy the selected port's radius to matching ports.
 *  If same_topic_only=true, only ports in same-topic nodes.
 *  If same_topic_only=false, matching ports in all nodes.
 *  Also stores as default.
 ************************************************************/
function copy_size_to_ports(gobj, same_topic_only)
{
    let priv = gobj.priv;
    let graph = priv.graph;

    let node_id = priv._context_node_id;
    let port_key = priv._context_port_key;
    if(!node_id || !port_key) {
        return;
    }

    let nodedata = graph.getNodeData(node_id);
    if(!nodedata || !nodedata.data) {
        return;
    }

    let source_topic = nodedata.data.topic_name;
    let source_r = get_port_radius(gobj, node_id, port_key);

    // Store as default
    if(same_topic_only) {
        // Store for matching port key in this topic only
        if(!is_object(priv._graph_properties[source_topic])) {
            priv._graph_properties[source_topic] = {};
        }
        let defaults = priv._graph_properties[source_topic].defaults || {};
        let port_sizes = defaults.port_sizes || {};
        port_sizes[port_key] = source_r;
        defaults.port_sizes = port_sizes;
        priv._graph_properties[source_topic].defaults = defaults;
    } else {
        // Store for all topics — set portR as the global default
        for(const topic_name of Object.keys(priv.descs || {})) {
            if(!is_object(priv._graph_properties[topic_name])) {
                priv._graph_properties[topic_name] = {};
            }
            let defaults = priv._graph_properties[topic_name].defaults || {};
            defaults.portR = source_r;
            priv._graph_properties[topic_name].defaults = defaults;
        }
    }

    // Iterate nodes and update ports
    let updates = [];
    const nodes = graph.getData().nodes;
    for(let i = 0; i < nodes.length; i++) {
        let nd = graph.getNodeData(nodes[i].id);
        if(!nd || !nd.data) {
            continue;
        }
        if(same_topic_only && nd.data.topic_name !== source_topic) {
            continue;
        }

        let style = nd.style || {};
        let ports = style.ports;
        if(!ports) {
            continue;
        }

        let port_updated = false;
        let new_ports = ports.map((p) => {
            if(!same_topic_only || p.key === port_key) {
                port_updated = true;
                return { ...p, r: source_r };
            }
            return p;
        });

        if(port_updated) {
            let upd = { ports: new_ports };
            // When resizing all ports, also update node-level portR
            if(!same_topic_only) {
                upd.portR = source_r;
            }
            updates.push({ id: nodes[i].id, style: upd });
        }
    }

    if(updates.length > 0) {
        graph.updateNodeData(updates);
        graph.draw().then(() => {
            update_port_resize_handles_position(gobj);
            mark_graph_dirty(gobj);
        });
    }
}


                    /***************************
                     *      Folding
                     ***************************/




/*  A card with pills is this much taller; the row sits under the subtitle.  */
const PILL_ROW_HEIGHT = 24;
const MORE_CHIP_SIZE = [76, 26];
/*  The chip beside pills and figures: a square of 22 next to a chip of 76
 *  read as the biggest thing in the row, so it takes the closed
 *  scale -- the count and nothing else.  */
const MORE_CHIP_SIZE_COMPACT = [40, 22];

/*  A `+N` chip follows the shape of the card it continues: closed
 *  beside a square, open beside a card. A root group's chip has no
 *  parent and follows the mode.  */
function more_chip_is_compact(gobj, nd)
{
    let parent_id = nd && nd.data? nd.data.parent_node : "";
    if(parent_id) {
        return node_is_compact(gobj, parent_id);
    }
    return gobj_read_str_attr(gobj, "node_mode") !== "expanded";
}

function more_chip_style(gobj, nd, color, rest)
{
    let compact = more_chip_is_compact(gobj, nd);
    let size = compact? MORE_CHIP_SIZE_COMPACT : MORE_CHIP_SIZE;
    return {
        size: [...size],
        dx: -size[0] / 2,
        dy: -size[1] / 2,
        innerHTML: build_more_innerHTML(color, gobj.priv.theme, rest, compact),
    };
}

/*  Every `+N` chip re-sized to the shape of its parent: after a
 *  change of mode, or of one node.  */
function reshape_more_chips(gobj)
{
    let priv = gobj.priv;
    let graph = priv.graph;
    if(!graph) {
        return;
    }
    let updates = [];
    for(let nd of (graph.getNodeData() || [])) {
        if(!is_more_node(nd)) {
            continue;
        }
        let child_desc = priv.descs? priv.descs[nd.data.child_topic] : null;
        let color = (child_desc && child_desc.color) || "#94a3b8";
        updates.push({id: nd.id, style: more_chip_style(gobj, nd, color, nd.data.rest)});
    }
    if(updates.length) {
        try {
            graph.updateNodeData(updates);
        } catch(e) {
            log_error(`${gobj_short_name(gobj)}: cannot reshape the +N chips: ${e}`);
        }
    }
}

/************************************************************
 *  The three card sizes, with room for the pill row when there
 *  is one. A chip (pure child) never has pills: it has no hooks.
 ************************************************************/
function card_size_for(node_treedb_type, has_pills)
{
    let extra = has_pills? PILL_ROW_HEIGHT : 0;
    switch(node_treedb_type) {
        case 'child':
            return [116, 40];
        case 'extended':
            return [144, 66 + extra];
        default:
            return [172, 96 + extra];
    }
}

/************************************************************
 *  The model's key of a G6 record node, or "" for anything else.
 ************************************************************/
function node_key_of(nd)
{
    if(!nd || !nd.data || !nd.data.desc || !nd.data.record) {
        return "";
    }
    return fold_node_key(nd.data.desc.topic_name, String(nd.data.record.id));
}

function is_more_node(nd)
{
    return !!(nd && nd.data && nd.data.more);
}

function more_node_id(gobj, group_key)
{
    return sprintf("more-%s-%s", gobj.priv.treedb_name, group_key);
}

function more_edge_id(gobj, group_key)
{
    return sprintf("more-edge-%s-%s", gobj.priv.treedb_name, group_key);
}

/************************************************************
 *  The colours of a pill or a chip, from the topic colour it
 *  stands for -- the CHILD topic, the same colour its hook port
 *  wears, so the pill and the port say the same thing.
 ************************************************************/
function pill_colors(color, theme)
{
    let dark = (theme === "dark");
    return {
        bg: dark
            ? `color-mix(in srgb, ${color} 45%, #1b2230)`
            : `color-mix(in srgb, ${color} 22%, #ffffff)`,
        /*  The INK of a pill, a leaf chip and a `+N`: it carries the
         *  topic's hue, and it is 10-12px text on the same hue. At
         *  35/55 the palette's yellow read 4.36 in dark and 3.89 in
         *  light; at 25/45 the worst of the seven is 4.57 and 5.07,
         *  and the hue is still plainly there.  */
        fg: dark
            ? `color-mix(in srgb, ${color} 25%, #ffffff)`
            : `color-mix(in srgb, ${color} 45%, #0f172a)`,
        border: dark
            ? `color-mix(in srgb, ${color} 80%, #ffffff)`
            : color,
    };
}

/************************************************************
 *  One pill: `▸ devices 142` folded, `▾ devices 24/142` open on a
 *  page, `▾ devices 142` open whole. A glyph and numbers on
 *  purpose: the card is an innerHTML string where a WORD could
 *  carry no i18n key, and the hook name is a schema identifier,
 *  like the topic subtitle above it.
 ************************************************************/
function build_pill_html(pill, color, theme)
{
    let c = pill_colors(color, theme);
    let glyph = pill.open? "&#9662;" : "&#9656;";            /*  ▾ / ▸  */
    let count = (pill.open && pill.shown < pill.total)
        ? `${pill.shown}/${pill.total}`
        : `${pill.total}`;

    return `<span class="TREEDB_PILL" data-fold-group="${escapeHtml(pill.group_key)}"
        title="${escapeHtml(pill.hook)}" style="
        display: inline-flex; align-items: center; gap: 3px; flex: 0 1 auto;
        height: 16px; padding: 0 6px; border-radius: 8px;
        background: ${c.bg}; color: ${c.fg}; border: 1px solid ${c.border};
        font-size: 10px; font-weight: 700; line-height: 1; white-space: nowrap;
        overflow: hidden; text-overflow: ellipsis;
        cursor: pointer; user-select: none;
    "><span style="font-size: 9px;">${glyph}</span>${escapeHtml(pill.hook)}<span style="font-weight: 600;">${count}</span></span>`;
}

/************************************************************
 *  The pill row of one node, as html; "" when it has nothing to
 *  fold or the model is not built yet.
 ************************************************************/
function pills_html_of_key(gobj, node_key)
{
    let priv = gobj.priv;

    if(!priv._fold_model || !priv._fold_state || !node_key) {
        return "";
    }
    let pills = fold_pills_of(priv._fold_model, priv._fold_state, node_key);
    if(!pills.length) {
        return "";
    }
    let out = [];
    for(let pill of pills) {
        let child_desc = priv.descs? priv.descs[pill.child_topic] : null;
        let color = (child_desc && child_desc.color) || "#94a3b8";
        out.push(build_pill_html(pill, color, priv.theme));
    }
    return out.join("");
}

function pills_html_of(gobj, nd)
{
    return pills_html_of_key(gobj, node_key_of(nd));
}

/*  What a card's pills say, as one string -- to repaint only the
 *  cards whose pills changed.  */
function pills_signature(gobj, node_key)
{
    let priv = gobj.priv;

    if(!priv._fold_model || !priv._fold_state) {
        return "";
    }
    let pills = fold_pills_of(priv._fold_model, priv._fold_state, node_key);
    return pills.map((p) => `${p.hook}:${p.open? p.shown : "-"}/${p.total}`).join(",");
}

/************************************************************
 *  The `+N` chip at the end of a page: the rest of the group,
 *  in the child topic's colour, dashed like a cut. Its title is
 *  the one WORD of the folding, and it is translated at build
 *  time: the chips are rebuilt on a language change.
 ************************************************************/
function build_more_innerHTML(color, theme, rest, compact)
{
    let c = pill_colors(color, theme);
    let tail = compact? "" : `<span style="font-size: 10px; opacity: .8;">&#8230;</span>`;
    return `
<div class="TREEDB_MORE" title="${escapeHtml(t('show more'))}" style="
    box-sizing: border-box; width: 100%; height: 100%;
    display: flex; align-items: center; justify-content: center; gap: 4px;
    background: ${c.bg}; color: ${c.fg}; border: 1px dashed ${c.border};
    border-radius: ${compact? "6px" : "13px"};
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    font-size: ${compact? "10px" : "12px"}; font-weight: 700; line-height: 1;
    cursor: pointer; user-select: none;
">+${rest}${tail}</div>
`;
}

function more_innerHTML_of(gobj, nd, theme)
{
    if(!is_more_node(nd)) {
        return null;
    }
    let priv = gobj.priv;
    let child_desc = priv.descs? priv.descs[nd.data.child_topic] : null;
    let color = (child_desc && child_desc.color) || "#94a3b8";
    return build_more_innerHTML(color, theme, nd.data.rest, more_chip_is_compact(gobj, nd));
}

/************************************************************
 *  The pills live inside an `innerHTML` string, so no handler can
 *  be attached to them: the click is delegated from the container
 *  in the CAPTURE phase over four event types -- the same door the
 *  JSON graph opens for its fold handles, for the same reasons: G6
 *  binds on the html node element, a descendant, so only capture
 *  runs first; and G6 never reads the DOM `click`, it builds its
 *  own from the pointer pair, so `pointerdown`/`pointerup` are the
 *  ones that have to be cut or the card is ALSO clicked.
 ************************************************************/
const FOLD_SWALLOWED_EVENTS = ["pointerdown", "pointerup", "mousedown", "click"];

function install_fold_listener(gobj)
{
    let priv = gobj.priv;

    if(!priv.$container) {
        log_error(`${gobj_short_name(gobj)}: no container, the fold pills are dead`);
        return;
    }
    priv._fold_listener = function(evt) {
        let $pill = (evt.target && evt.target.closest)
            ? evt.target.closest('[data-fold-group]')
            : null;
        if(!$pill) {
            return;
        }
        evt.stopPropagation();
        evt.preventDefault();
        if(evt.type !== "click") {
            return;     /*  swallowed so G6 never sees a node click  */
        }
        gobj_send_event(gobj, "EV_TOGGLE_FOLD", {
            group: $pill.getAttribute('data-fold-group'),
        }, gobj);
    };
    for(let type of FOLD_SWALLOWED_EVENTS) {
        priv.$container.addEventListener(type, priv._fold_listener, true);
    }
}

function uninstall_fold_listener(gobj)
{
    let priv = gobj.priv;

    if(priv._fold_listener && priv.$container) {
        for(let type of FOLD_SWALLOWED_EVENTS) {
            priv.$container.removeEventListener(type, priv._fold_listener, true);
        }
    }
    priv._fold_listener = null;
}

/************************************************************
 *  (Re)build the tree of the records. Cheap -- one pass over the
 *  records -- so it runs again on every create/update/delete
 *  rather than being patched. The fold state survives: it is
 *  keyed by group, and a group that is gone is simply never read.
 ************************************************************/
function rebuild_fold_model(gobj)
{
    let priv = gobj.priv;

    priv._fold_model = fold_build_model(priv.descs || {}, priv.records || {}, {
        hidden_topics: gobj_read_attr(gobj, "hidden_topics") || [],
        main_topic: gobj_read_str_attr(gobj, "main_topic") || "",
        loose_topics: gobj_read_attr(gobj, "loose_topics") || [],
    });
    if(!priv._fold_state) {
        priv._fold_state = fold_new_state(gobj_read_integer_attr(gobj, "fold_page_size"));
    }
    if(!priv._pill_sig) {
        priv._pill_sig = new Map();
    }
}

/************************************************************
 *  How many records there are, and how many carry a saved
 *  position -- what auto_layout decides on. Counted over the
 *  RECORDS, because the nodes on screen are a fraction of them.
 ************************************************************/
function count_placed_records(gobj)
{
    let priv = gobj.priv;

    priv._nodes_total = 0;
    priv._nodes_placed = 0;
    for(const [topic_name, records] of Object.entries(priv.records || {})) {
        if(topic_name.substring(0, 2) === "__" || !is_array(records)) {
            continue;
        }
        for(let record of records) {
            priv._nodes_total++;
            let geometry = get_node_graph_props(gobj, topic_name, record.id, record);
            if(geometry_has_position(geometry)) {
                priv._nodes_placed++;
            }
        }
    }
}

/************************************************************
 *  Make the G6 data say what the fold model says is visible.
 *
 *  Record nodes not visible any more are removed (their edges go
 *  with them), the visible ones missing are created, the links
 *  between visible nodes are drawn, the `+N` chips are placed or
 *  taken away, and every card whose pills changed is repainted.
 *  Then a draw, a layout if the set of nodes changed, and the
 *  camera: fit the whole thing on the first load, or put `keep`
 *  back where it was on screen before the change.
 *
 *  Serialised: one reconcile at a time, in order. Two pills tapped
 *  quickly would otherwise interleave their draws.
 *
 *      opts.relayout   run the layout even if no node came or went
 *      opts.fit        fit the viewport afterwards
 *      opts.keep       node id to hold still on screen
 *      opts.keep_vp    where it was ([x, y] viewport px)
 ************************************************************/
function reconcile_fold(gobj, opts)
{
    let priv = gobj.priv;

    let run = () => reconcile_fold_now(gobj, opts || {}).catch((e) => {
        log_error(`${gobj_short_name(gobj)}: reconcile failed: ${e}`);
    });
    priv._fold_chain = (priv._fold_chain || Promise.resolve()).then(run, run);
    return priv._fold_chain;
}

async function reconcile_fold_now(gobj, opts)
{
    let priv = gobj.priv;
    let graph = priv.graph;
    let model = priv._fold_model;
    let state = priv._fold_state;

    if(!graph || !model || !state || gobj_is_destroying(gobj)) {
        return;
    }

    let visible = fold_visible_set(model, state);
    let changed = false;

    /*  Paused for the whole of it: every add and remove below is the
     *  fold's, not the user's, and none of it is a command to undo.  */
    history_pause(gobj);
    try {
        changed = await reconcile_fold_apply(gobj, opts, visible);
    } finally {
        history_resume(gobj);
    }
    publish_legend_state(gobj, visible);
    return changed;
}

/************************************************************
 *  What the legend has to say, published after every reconcile:
 *  one entry per topic of the treedb, hidden ones included, with
 *  its colour, how many records it has, how many are on screen,
 *  how many are LOOSE, and the flags -- plus which topic is the
 *  main one and whether it was deduced or chosen. The host draws
 *  the strip from this and nothing else; the engine is the truth.
 ************************************************************/
function publish_legend_state(gobj, visible)
{
    let priv = gobj.priv;
    let model = priv._fold_model;

    if(!model || !priv.descs) {
        return;
    }

    let on_screen = {};
    for(let key of visible) {
        let node = model.nodes.get(key);
        if(node) {
            on_screen[node.topic_name] = (on_screen[node.topic_name] || 0) + 1;
        }
    }

    let topics = [];
    for(const [topic_name, desc] of Object.entries(priv.descs)) {
        if(topic_name.substring(0, 2) === "__" || !desc) {
            continue;
        }
        let loose = model.loose[topic_name] || [];
        topics.push({
            topic: topic_name,
            color: desc.color || "",
            total: model.totals[topic_name] || 0,
            visible: on_screen[topic_name] || 0,
            loose: loose.length,
            loose_shown: model.loose_shown.has(topic_name),
            hidden: model.hidden.has(topic_name),
            linked: model.linked.has(topic_name),
            hierarchical: fold_is_hierarchical(priv.descs, topic_name),
        });
    }

    gobj_publish_event(gobj, "EV_LEGEND_STATE", {
        main_topic: model.main_topic,
        /*  CHOSEN only when the reader's pick is the one in force: a
         *  pick the rule refuses (not hierarchical) is ignored.  */
        main_chosen: !!model.main_topic &&
                     gobj_read_str_attr(gobj, "main_topic") === model.main_topic,
        topics: topics,
        /*  The toolbar's stepper: the tree it walks, where it stands,
         *  and how deep it goes. `levels` 0 = nothing to step through.  */
        fold: {
            topic: model.main_topic,
            level: current_fold_level(gobj),
            levels: model.levels,
        },
    });
}

async function reconcile_fold_apply(gobj, opts, visible)
{
    let priv = gobj.priv;
    let graph = priv.graph;
    let model = priv._fold_model;
    let state = priv._fold_state;
    let changed = false;

    /*  What is on screen now.  */
    let present = new Map();        /*  node_key -> node id  */
    let more_present = new Map();   /*  group_key -> node id  */
    for(let nd of (graph.getNodeData() || [])) {
        if(is_more_node(nd)) {
            more_present.set(nd.data.more, nd.id);
            continue;
        }
        let key = node_key_of(nd);
        if(key) {
            present.set(key, nd.id);
        }
    }

    /*  Gone.  */
    let to_remove = [];
    for(let [key, id] of present) {
        if(!visible.has(key)) {
            to_remove.push(id);
        }
    }
    if(to_remove.length) {
        let gone = new Set(to_remove);
        if(priv._selected_node_id && gone.has(priv._selected_node_id)) {
            deselect_node(gobj);
        }
        if(priv._detail_node_id && gone.has(priv._detail_node_id)) {
            hide_node_detail(gobj);
        }
        priv._focus_ids = (priv._focus_ids || []).filter((id) => !gone.has(id));
        priv._selected_paint_ids = (priv._selected_paint_ids || []).filter((id) => !gone.has(id));
        if(priv.anchor_state === "on" && gone.has(priv.anchor_id)) {
            priv.anchor_id = "";
            priv.anchor_state = "off";
            update_toolbar(gobj);
        }
        for(let id of to_remove) {
            priv._pill_sig.delete(id);
        }
        graph.removeNodeData(to_remove);
        changed = true;
    }

    /*  New.  */
    for(let key of visible) {
        if(present.has(key)) {
            continue;
        }
        let node = model.nodes.get(key);
        let desc = priv.descs[node.topic_name];
        if(!desc) {
            log_error(`${gobj_short_name(gobj)}: no desc for ${key}`);
            continue;
        }
        create_topic_node(gobj, desc, node.record);
        priv._pill_sig.set(
            build_node_name(gobj, node.topic_name, node.id),
            pills_signature(gobj, key)
        );
        changed = true;
    }

    /*  The links between what is visible. draw_link draws each once
     *  and skips the ones whose other end is off screen.  */
    for(let key of visible) {
        let node = model.nodes.get(key);
        let desc = priv.descs[node.topic_name];
        if(desc) {
            draw_links(gobj, desc, node.record, false);
        }
    }

    /*  The `+N` chips.  */
    let pending = fold_pending_groups(model, state, visible);
    let wanted = new Map();
    for(let p of pending) {
        wanted.set(p.group_key, p);
    }
    let more_gone = [];
    for(let [group_key, id] of more_present) {
        if(!wanted.has(group_key)) {
            more_gone.push(id);
        }
    }
    if(more_gone.length) {
        graph.removeNodeData(more_gone);
        changed = true;
    }
    for(let p of pending) {
        let first = model.nodes.get((model.groups.get(p.group_key) || [])[0]);
        let child_topic = first? first.topic_name : "";
        let child_desc = priv.descs[child_topic];
        let color = (child_desc && child_desc.color) || "#94a3b8";
        let id = more_node_id(gobj, p.group_key);
        if(more_present.has(p.group_key)) {
            let nd = graph.getNodeData(id);
            if(nd && nd.data.rest !== p.rest) {
                nd.data.rest = p.rest;
                graph.updateNodeData([{
                    id: id,
                    style: {innerHTML: build_more_innerHTML(
                        color, priv.theme, p.rest, more_chip_is_compact(gobj, nd)
                    )},
                }]);
            }
            continue;
        }
        let xy = get_default_ne_xy(gobj);
        let parent_node = "";
        if(p.node_key) {
            let parent = model.nodes.get(p.node_key);
            parent_node = build_node_name(gobj, parent.topic_name, parent.id);
        }
        let chip_data = {
            more: p.group_key,
            child_topic: child_topic,
            rest: p.rest,
            parent_node: parent_node,
        };
        graph.addNodeData([{
            id: id,
            type: 'html',
            style: Object.assign({x: xy, y: xy}, more_chip_style(gobj, {data: chip_data}, color, p.rest)),
            data: chip_data,
        }]);
        if(p.node_key) {
            let parent = model.nodes.get(p.node_key);
            let dark = (priv.theme === "dark");
            graph.addEdgeData([{
                id: more_edge_id(gobj, p.group_key),
                type: edge_type_for(gobj),
                source: build_node_name(gobj, parent.topic_name, parent.id),
                target: id,
                style: {
                    sourcePort: p.hook,
                    lineWidth: 1,
                    lineDash: [4, 3],
                    /*  The same grey as a cross link (refresh_default_edges_theme):
                     *  `#94a3b8` on a white canvas is 2.56:1, under the 3:1 a
                     *  line needs to be seen at all. The DASH is what says
                     *  this one leads to a cut, not the colour.  */
                    stroke: dark? '#8b94a3' : '#6b7280',
                    startArrow: false,
                    endArrow: false,
                },
                data: {more: p.group_key},
            }]);
        }
        changed = true;
    }

    /*  The cards whose pills changed.  */
    let repaint = new Set();
    let resize = [];
    for(let key of visible) {
        let node = model.nodes.get(key);
        let id = build_node_name(gobj, node.topic_name, node.id);
        let sig = pills_signature(gobj, key);
        if(priv._pill_sig.get(id) === sig) {
            continue;
        }
        let had = !!priv._pill_sig.get(id);
        priv._pill_sig.set(id, sig);
        repaint.add(id);
        if(had !== !!sig) {
            let nd = graph.getNodeData(id);
            let desc = nd && nd.data && nd.data.desc;
            let geometry = (nd && nd.data && nd.data.graph_props) || {};
            /*  A saved size is the owner's: only a card on the default
             *  size grows and shrinks with its pills. A closed node has
             *  no pills to grow for.  */
            if(desc && !is_array(geometry.size) && !node_is_compact(gobj, id)) {
                let size = card_size_for(desc.node_treedb_type, !!sig);
                resize.push({id: id, style: {
                    size: size, dx: -size[0] / 2, dy: -size[1] / 2,
                }});
            }
        }
    }
    if(resize.length) {
        graph.updateNodeData(resize);
    }
    if(repaint.size) {
        repaint_cards(gobj, repaint);
    }

    /*  Decided BEFORE the drawing, not after it: the minimap builds its
     *  canvas on its FIRST render, off the graph's draw events, so one
     *  added after the last draw is bound and never painted. The count
     *  it decides on is the nodes just reconciled.  */
    try {
        refresh_minimap(gobj);
    } catch(e) {
        log_error(`${gobj_short_name(gobj)}: refresh_minimap failed: ${e}`);
    }

    await graph_draw(gobj);
    if(changed || opts.relayout) {
        await graph_layout(gobj);
        repaint_minimap(gobj);
    }

    /*  THE VIEWPORT, and only here.
     *
     *  `restore` is the reader's saved camera coming back on the
     *  first draw after a reload; `fit` is the opening frame of a
     *  graph nobody has looked at yet; `keep` holds a node at the
     *  pixel it was on across a rebuild. Anything else leaves the
     *  camera alone, which is the default on purpose: a rebuild of
     *  the CONTENT is not a reason to move the reader.  */
    if(!(opts.restore && await restore_camera(gobj))) {
        if(opts.fit) {
            await graph_fit_readable(gobj);
        } else if(opts.keep && opts.keep_vp) {
            await yui_graph_place_at(graph, opts.keep, opts.keep_vp);
        }
    }
    /*  And never a BLANK viewport. Every branch above can leave one: a
     *  restore by a node whose surroundings moved, a refresh or a global
     *  fold holding the first root still at a pixel off screen, a saved
     *  arrangement opened with no camera (no fit: its owner's view is
     *  part of it) far from where G6 starts looking. A view with nothing
     *  in it is not a place anybody chose to be.  */
    if((graph.getNodeData() || []).length > 0 && !node_nearest_view_centre(gobj)) {
        await graph_fit_readable(gobj);
    }
    /*  Whichever branch ran -- including none of them, which is a
     *  graph somebody had arranged and left where it was -- the
     *  opening viewport is decided from here on, and every move after
     *  it is the reader's and worth remembering.  */
    priv._camera_placed = true;

    update_resize_handles_position(gobj);
    update_port_resize_handles_position(gobj);
    update_edge_icon_position(gobj);
    update_node_icon_position(gobj);
    update_link_icon_position(gobj);
    update_port_icon_position(gobj);

    return changed;
}

/************************************************************
 *  The application changed language: what this gclass DRAWS has
 *  to be drawn again. `refresh_language()` reaches what carries
 *  an i18n key in the DOM; a G6 toolbar and the html of a chip
 *  are built here and carry none.
 ************************************************************/
function ac_language_changed(gobj, event, kw, src)
{
    update_toolbar(gobj);
    repaint_more_chips(gobj);
    return 0;
}

/************************************************************
 *  The rims of every port, on a theme change.
 *
 *  A rim is half of the surface it sits on (see port_rim), so it
 *  belongs to the theme -- and it lives in each node's
 *  `style.ports`, which is the one place refresh_html_nodes_theme()
 *  does not reach: it rebuilds the html INSIDE a card.
 ************************************************************/
function refresh_port_rims(gobj, theme)
{
    let priv = gobj.priv;
    let graph = priv.graph;

    if(!graph) {
        return;
    }
    let updates = [];
    for(let nd of (graph.getNodeData() || [])) {
        if(!nd || !nd.style || !is_array(nd.style.ports) || !nd.style.ports.length) {
            continue;
        }
        updates.push({id: nd.id, style: {ports: nd.style.ports.map((p) =>
            Object.assign({}, p, {stroke: port_rim(p.fill, theme)})
        )}});
    }
    if(updates.length) {
        try {
            graph.updateNodeData(updates);
        } catch(e) {
            log_error(`${gobj_short_name(gobj)}: cannot repaint the port rims: ${e}`);
        }
    }
}

/************************************************************
 *  Repaint the `+N` chips (theme or language changed).
 ************************************************************/
function repaint_more_chips(gobj)
{
    let priv = gobj.priv;
    let graph = priv.graph;

    if(!graph) {
        return;
    }
    let updates = [];
    for(let nd of (graph.getNodeData() || [])) {
        let html = more_innerHTML_of(gobj, nd, priv.theme);
        if(html !== null) {
            updates.push({id: nd.id, style: {innerHTML: html}});
        }
    }
    if(updates.length) {
        try {
            graph.updateNodeData(updates);
            graph.draw();
        } catch(e) {
            log_error(`${gobj_short_name(gobj)}: cannot repaint the chips: ${e}`);
        }
    }
}




                    /***************************
                     *      Actions
                     ***************************/




/************************************************************
 *  Receive descs, from parent
 ************************************************************/
function ac_descs(gobj, event, kw, src)
{
    let priv = gobj.priv;
    let descs = kw;

    gobj_write_attr(gobj, "descs", descs); // TRIGGER POINT: Topics cleared

    // TODO register_nodes(gobj) = register(ExtensionCategory.NODE, 'light', LightNode);

    /*
     *  Assign colors and calculate counters
     *  descs is a dict: { __snaps__: {…}, roles: {…}, users: {…} }
     *
     *  The palette goes by ALPHABETICAL order of the topic names, not
     *  by the order the backend lists them in: that one is not the same
     *  from one load to the next, and two topics swapped colours with
     *  it. The legend is alphabetical too, so the strip reads as the
     *  palette in order.
     */
    for(const desc of Object.values(descs)) {
        calculate_hooks_fkeys_counter(desc);
    }
    let names = Object.keys(descs).filter((topic_name) => {
        return topic_name.substring(0, 2) !== "__";
    }).sort((a, b) => {
        return a.localeCompare(b);
    });
    for(let idx = 0; idx < names.length; idx++) {
        descs[names[idx]].color = node_colors[idx % node_colors.length];
    }

    return 0;
}

/************************************************************
 *  Clear all graph data, from parent
 ************************************************************/
function ac_clear_data(gobj, event, kw, src)
{
    let priv = gobj.priv;

    deselect_node(gobj);
    hide_create_popover(gobj);

    gobj_write_attr(gobj, "records", {});

    /*  The node counters belong to the data that is going away: a refresh
     *  that kept them would decide the layout on the previous treedb. */
    priv._nodes_total = 0;
    priv._nodes_placed = 0;

    /*  So does the fold: a reload opens at `expand_depth` again.  */
    priv._fold_model = null;
    priv._fold_state = null;
    priv._pill_sig = null;
    priv._open_nodes = null;

    graph_remove_plugin(gobj, "history");
    update_history_buttons(gobj);
    graph_clear(gobj);

    return 0;
}

/************************************************************
 *  Load batch data, from parent
 *  {
 *      kw_command,
 *      desc,
 *      data
 *  },
 ************************************************************/
function ac_load_data(gobj, event, kw, src)
{
    let priv = gobj.priv;
    let graph = priv.graph;

    let kw_command = kw.kw_command;
    let data = kw.data;

    let topic_name = kw_get_str(
        gobj, kw_command, "topic_name", "", kw_flag_t.KW_REQUIRED
    );

    if(!topic_name) {
        log_error(`${gobj_short_name(gobj)}: No topic_name in desc`);
        return 0;
    }

    if(topic_name.substring(0, 2) === "__") {
        if(topic_name === '__graphs__') {
            priv.__graphs__ = data;
            build_graph_properties(gobj);
        }
        return 0;
    }

    let desc = priv.descs[topic_name];

    /*-------------------------*
     *  Save topic's records
     *-------------------------*/
    priv.records[topic_name] = data;
    priv.descs[topic_name].loaded = true;

    /*----------------------------------------------------*
     *  Nothing is drawn until every topic is in: the tree
     *  needs the parents to exist before it can hang the
     *  children from them.
     *----------------------------------------------------*/
    let all_loaded = true;
    for (const [topic_name, desc] of Object.entries(priv.descs)) {
        if (topic_name.substring(0, 2) === "__") {
            continue;   // ignore system topics
        }
        if(!desc.loaded) {
            all_loaded = false;
            break;
        }
    }

    if(all_loaded && priv.graph) {
        /*  The tree of the records, the main one opened to the reader's
         *  level: the roots and their children by default. Only that
         *  much becomes G6 nodes -- a treedb of a thousand records opens
         *  as a handful of cards with a count on each cut.  */
        rebuild_fold_model(gobj);
        fold_expand_to_level(
            priv._fold_model, priv._fold_state, current_fold_level(gobj)
        );

        /*  Before the layout runs, and only now: whether anybody has
         *  ever placed a node of this treedb is not known until its
         *  records and __graphs__ are in. Counted over the records,
         *  not the cards: most of them are folded away. */
        count_placed_records(gobj);
        let auto_laid = false;
        try {
            auto_laid = auto_layout(gobj);
        } catch(e) {
            log_error(`${gobj_short_name(gobj)}: auto_layout failed: ${e}`);
        }
        /*  The ports and edges follow the layout's direction, and the
         *  nodes are about to be built: settle it first.  */
        apply_layout_direction(gobj);

        /*  THE FIRST load decides the viewport: the reader's saved
         *  camera if there is one, else the opening fit -- and only
         *  when WE laid the graph out, since a saved arrangement
         *  includes where its owner was looking.
         *
         *  Every load AFTER that is a REFRESH, and a refresh must not
         *  move the camera: the reader asked for fresh data, not for a
         *  new viewport. It holds a node instead, so the graph does not
         *  jump even if the layout changed under it.  */
        let vp_opts;
        if(!priv._camera_placed) {
            vp_opts = {restore: true, fit: auto_laid};
        } else {
            let keep = fold_keep_node(gobj);
            vp_opts = {keep: keep, keep_vp: yui_graph_viewport_of(priv.graph, keep)};
        }
        reconcile_fold(gobj, Object.assign({relayout: true}, vp_opts)).then(() => {
            sync_history_plugin(gobj);
            /*  Nodes exist and are positioned now: apply a focus
             *  requested before the data was ready (deep link). */
            if(priv._pending_focus_topic !== null) {
                let ft = priv._pending_focus_topic;
                let all = priv._pending_focus_all;
                priv._pending_focus_topic = null;
                priv._pending_focus_all = false;
                graph_focus_topic(gobj, ft, all);
            }
            if(priv._pending_find !== null) {
                let term = priv._pending_find;
                priv._pending_find = null;
                publish_find_result(gobj, term, graph_find_nodes(gobj, term));
            }
        });
    }

    return 0;
}

/************************************************************
 *  Save graph geometry, from click
 ************************************************************/
function ac_save_graph(gobj, event, kw, src)
{
    let priv = gobj.priv;

    if(priv.edit_mode) {
        let $container = gobj_read_attr(gobj, "$container");

        disableElements($container, ".EV_SAVE_GRAPH");
        set_submit_state($container, ".EV_SAVE_GRAPH", false);

        let history = graph_get_plugin(gobj, "history");
        if(history) {
            history.clear();
            update_history_buttons(gobj);
        }

        save_geometry(gobj); // Publish an EV_UPDATE_NODE of each node
    }

    return 0;
}

/************************************************************
 *  Node created, from subscription
 ************************************************************/
function ac_node_created(gobj, event, kw, src)
{
    let priv = gobj.priv;
    let desc_kw = kw.desc; // ignore changes in desc, by now
    let topic_name = kw.topic_name;
    let node = kw.node;

    if(!priv.descs || !priv.graph) {
        return 0;
    }

    // Handle __graphs__ creation: update _graph_properties
    if(topic_name === '__graphs__') {
        priv.__graphs__.push(node);
        build_graph_properties(gobj);
        return 0;
    }

    let desc = priv.descs[topic_name];
    if(!desc) {
        log_error(`ac_node_created: unknown topic: ${topic_name}`);
        return 0;
    }

    /*
     *  Add to local records
     */
    if(!priv.records[topic_name]) {
        priv.records[topic_name] = [];
    }
    priv.records[topic_name].push(node);

    /*
     *  Into the tree, and on screen: whoever created it wants to see
     *  it, so the path down to it is opened.
     */
    rebuild_fold_model(gobj);
    fold_reveal(priv._fold_model, priv._fold_state, fold_node_key(topic_name, String(node.id)));
    reconcile_fold(gobj, {});

    return 0;
}

/************************************************************
 *  Node updated, from subscription.
 *
 *  Diff old vs new fkey references:
 *  - removed refs → clear those edges
 *  - added refs   → draw those edges
 *  - unchanged    → leave as-is
 ************************************************************/
function ac_node_updated(gobj, event, kw, src)
{
    let priv = gobj.priv;
    let topic_name = kw.topic_name;
    let node = kw.node;

    if(!priv.descs || !priv.graph) {
        return 0;
    }

    // Handle __graphs__ updates: refresh _graph_properties
    if(topic_name === '__graphs__') {
        // Update the __graphs__ record in our local list
        let found = false;
        for(let i = 0; i < priv.__graphs__.length; i++) {
            if(priv.__graphs__[i].id === node.id) {
                priv.__graphs__[i] = node;
                found = true;
                break;
            }
        }
        if(!found) {
            priv.__graphs__.push(node);
        }
        build_graph_properties(gobj);
        return 0;
    }

    let desc = priv.descs[topic_name];
    if(!desc) {
        log_error(`ac_node_updated: unknown topic: ${topic_name}`);
        return 0;
    }

    let node_name = build_node_name(gobj, topic_name, node.id);
    let cols = desc.cols;

    /*
     *  Find old record
     */
    let old_record = null;
    let records = priv.records[topic_name];
    if(records) {
        for(let i=0; i<records.length; i++) {
            if(records[i].id === node.id) {
                old_record = records[i];
                break;
            }
        }
    }

    /*
     *  Diff fkey references: old vs new
     */
    let old_refs = old_record ? collect_fkey_refs(desc, old_record) : new Set();
    let new_refs = collect_fkey_refs(desc, node);

    history_pause(gobj);

    // Remove edges for refs that disappeared
    for(let ref of old_refs) {
        if(!new_refs.has(ref)) {
            let [col_idx, fkey_value] = ref.split("\t");
            clear_link(gobj, topic_name, node.id, cols[parseInt(col_idx)], fkey_value, false);
        }
    }

    /*
     *  Update node data and local record. The card may be off screen
     *  (folded): then only the record moves, and the reconcile below
     *  repaints the count on whatever pill reaches it.
     */
    update_local_node(gobj, topic_name, node);
    let on_screen = false;
    try {
        on_screen = !!graph.getNodeData(node_name);
    } catch(e) {
        on_screen = false;
    }
    if(on_screen) {
        update_topic_node(gobj, desc, node_name, node);
    }

    // Draw edges for refs that appeared (draw_link skips an end off screen)
    for(let ref of new_refs) {
        if(!old_refs.has(ref)) {
            let [col_idx, fkey_value] = ref.split("\t");
            draw_link(gobj, topic_name, node.id, cols[parseInt(col_idx)], fkey_value, false);
        }
    }

    graph_draw(gobj).then(() => {
        history_resume(gobj);
    });

    /*  The links are the tree: a moved fkey moves the record from one
     *  parent's pill to another's.  */
    rebuild_fold_model(gobj);
    reconcile_fold(gobj, {});

    return 0;
}

/************************************************************
 *  Node deleted, from subscription
 ************************************************************/
function ac_node_deleted(gobj, event, kw, src)
{
    let priv = gobj.priv;
    let topic_name = kw.topic_name;
    let node = kw.node;

    if(!priv.descs || !priv.graph) {
        return 0;
    }

    let desc = priv.descs[topic_name];
    if(!desc) {
        log_error(`ac_node_deleted: unknown topic: ${topic_name}`);
        return 0;
    }

    /*
     *  Remove node entry from __graphs__ properties and persist
     */
    let topic_props = priv._graph_properties[topic_name];
    if(topic_props && is_object(topic_props.nodes)) {
        delete topic_props.nodes[node.id];
        save_topic_graph_properties(gobj, topic_name);
    }

    /*
     *  Delete graph node and links
     */
    history_pause(gobj);
    let node_name = build_node_name(gobj, topic_name, node.id);
    clear_links(gobj, desc, node, false);
    remove_topic_node(gobj, node_name);
    remove_local_node(gobj, topic_name, node);
    if(priv._pill_sig) {
        priv._pill_sig.delete(node_name);
    }

    graph_draw(gobj).then(() => {
        history_resume(gobj);
    });

    rebuild_fold_model(gobj);
    reconcile_fold(gobj, {});

    return 0;
}

/************************************************************
 *  Show, from parent
 ************************************************************/
function ac_show(gobj, event, kw, src)
{
    let priv = gobj.priv;

    let $canvas_container = priv.$container;
    if(!$canvas_container) {
        return 0;
    }
    let rect = $canvas_container.getBoundingClientRect();

    if(!priv.yet_showed) {
        priv.yet_showed = true;

        graph_resize(gobj, rect.width, rect.height);
    }

    return 0;
}

/************************************************************
 *  Hide, from parent
 ************************************************************/
function ac_hide(gobj, event, kw, src)
{
    return 0;
}

/************************************************************
 *  Resize, from parent
 ************************************************************/
function ac_resize(gobj, event, kw, src)
{
    let priv = gobj.priv;

    let $canvas_container = priv.$container;
    if(!$canvas_container) {
        return 0;
    }
    let rect = $canvas_container.getBoundingClientRect();
    if(rect.width === 0 || rect.height === 0) {
        priv.yet_showed = false;
    } else {
        if(priv.graph) {
            let h = rect.height;
            if(h < 0) {
                h = 80;
            }
            graph_resize(gobj, rect.width, h);
        }
    }

    /*  Crossing the width where the toolbars start folding changes
     *  what they contain -- a fold button appears or goes away --
     *  and nothing else would ever rebuild them. Only on the
     *  CROSSING: a resize fires on every frame of a drag.  */
    let can_collapse = toolbars_can_collapse(gobj);
    if(can_collapse !== priv._toolbars_could_collapse) {
        priv._toolbars_could_collapse = can_collapse;
        update_toolbar(gobj);
    }

    return 0;
}

/************************************************************
 *  Theme change (<html data-theme>, via yui_watch_theme)
 ************************************************************/
function ac_theme(gobj, event, kw, src)
{
    let priv = gobj.priv;
    let graph = priv.graph;
    let theme = kw.theme || 'light';
    gobj_write_attr(gobj, "theme", theme);
    graph.setTheme(theme);

    graph.updatePlugin({
        key: 'grid-line',
        stroke: theme === 'dark' ? '#343434' : '#EEEEEE',
        borderStroke: theme === 'dark' ? '#656565' : '#EEEEEE',
    });

    refresh_html_nodes_theme(gobj, theme);
    refresh_default_edges_theme(gobj, theme);
    refresh_port_rims(gobj, theme);
    repaint_more_chips(gobj);

    /*  The minimap paints its blocks from the theme (see its `shape`),
     *  and it is created ONCE: rebuilt, or it keeps the colours of the
     *  scheme it was born in.  */
    if(graph_get_plugin(gobj, "minimap")) {
        graph_remove_plugin(gobj, "minimap");
        refresh_minimap(gobj);
    }

    graph_draw(gobj).then(() => {
        // Restore toolbar icon states lost when G6 re-renders the DOM
        update_history_buttons(gobj);
    });

    // Re-render toolbars to pick up language changes via t()
    update_toolbar(gobj);

    return 0;
}

/************************************************************
 *  Zoom controls
 ************************************************************/
function ac_zoom_in(gobj, event, kw, src)
{
    graph_zoom_in(gobj);
    return 0;
}

function ac_zoom_out(gobj, event, kw, src)
{
    graph_zoom_out(gobj);
    return 0;
}

function ac_zoom_reset(gobj, event, kw, src)
{
    let priv = gobj.priv;
    let graph = priv.graph;

    /*
     *  With an anchor, actual size means "this node, life size";
     *  without one it leaves the camera where it was, as before.
     */
    if(priv.anchor_state === "on" && priv.anchor_id) {
        after_camera(gobj, graph.zoomTo(1));
    } else {
        graph.zoomTo(1);
    }
    return 0;
}

/************************************************************
 *  What the anchor button says it will do next.
 ************************************************************/
function ac_center_anchor(gobj, event, kw, src)
{
    let priv = gobj.priv;

    if(priv.anchor_state === "on" && priv.anchor_id) {
        yui_graph_center_on(priv.graph, priv.anchor_id);
    }
    return 0;
}

/************************************************************
 *  What the anchor button says it will do next.
 ************************************************************/
function anchor_title(state)
{
    if(state === "arming") {
        return t('click the element to centre on');
    }
    if(state === "on") {
        return t('centred: click to release');
    }
    return t('anchor view');
}

/************************************************************
 *  Every camera action ends the same way once an anchor is
 *  set: the thing you were reading goes back to the middle.
 *
 *  Chained on the promise G6 returns rather than run beside it
 *  -- centring before the zoom has finished centres the OLD
 *  view, and the reader watches the node slide away and come
 *  back.
 ************************************************************/
function after_camera(gobj, moved)
{
    let priv = gobj.priv;

    if(priv.anchor_state !== "on" || !priv.anchor_id) {
        return;
    }
    Promise.resolve(moved).then(function() {
        yui_graph_center_on(priv.graph, priv.anchor_id);
    }).catch(function() {
        /*  a camera move that never finished has nothing to centre  */
    });
}

/************************************************************
 *  Arm the anchor, or let it go.
 *
 *  Three states and one button, so a press ADVANCES: with no
 *  target it starts waiting for one, and with a target it
 *  releases.  Pressing it while it waits is a cancel, which is
 *  what somebody who pressed it by mistake will try.
 *
 *  Unlike the DOM toolbars, the button is not repainted in
 *  place: this toolbar is a G6 plugin that rebuilds its whole
 *  item list, and the pressed classes are baked into that list.
 ************************************************************/
function ac_toggle_anchor(gobj, event, kw, src)
{
    let priv = gobj.priv;
    let was = priv.anchor_id;

    if(priv.anchor_state === "off") {
        priv.anchor_state = "arming";
    } else {
        priv.anchor_state = "off";
        priv.anchor_id = "";
    }

    update_toolbar(gobj);
    if(was) {
        repaint_cards(gobj, new Set([was]));
    }
    return 0;
}

/************************************************************
 *  Fold / unfold the floating toolbars.
 *
 *  One flag for BOTH: they are one wall over the canvas, and
 *  the button that unfolds them has to be the same button
 *  whichever edge the user reaches for.
 ************************************************************/
function ac_toggle_toolbars(gobj, event, kw, src)
{
    let priv = gobj.priv;

    priv.toolbar_collapsed = !toolbars_collapsed(gobj);
    update_toolbar(gobj);
    return 0;
}

function ac_auto_fit(gobj, event, kw, src)
{
    graph_fitview(gobj);
    return 0;
}

/************************************************************
 *  Zoom to what is selected.
 ************************************************************/
function ac_zoom_selection(gobj, event, kw, src)
{
    let ids = gobj.priv._selected_paint_ids || [];

    if(!ids.length) {
        /*  The button is disabled without a selection, so getting here
         *  means the event came from somewhere else.  */
        log_error(`${gobj_short_name(gobj)}: zoom to selection with nothing selected`);
        return -1;
    }

    graph_fit_selection(gobj, ids);

    return 0;
}

function ac_focus_topic(gobj, event, kw, src)
{
    graph_focus_topic(gobj, kw && kw.topic, !!(kw && kw.reveal === "all"));
    return 0;
}

/************************************************************
 *  A pill was tapped: open that hook on its first page, or fold
 *  it. The card the pill is on stays where it was on screen --
 *  the layout moves everything else around it.
 ************************************************************/
function ac_toggle_fold(gobj, event, kw, src)
{
    let priv = gobj.priv;
    let group = (kw && kw.group) || "";

    if(!priv._fold_model || !group) {
        log_error(`${gobj_short_name(gobj)}: fold of '${group}' with no tree loaded`);
        return -1;
    }
    let g = fold_split_group_key(group);
    if(!g) {
        log_error(`${gobj_short_name(gobj)}: bad fold group '${group}'`);
        return -1;
    }
    let node_id = g.node_key? node_id_of_key(gobj, g.node_key) : "";
    let vp = node_id? yui_graph_viewport_of(priv.graph, node_id) : null;

    fold_toggle(priv._fold_model, priv._fold_state, group);
    reconcile_fold(gobj, {keep: node_id, keep_vp: vp});

    return 0;
}

/************************************************************
 *  A `+N` chip was tapped: the next page of its group. The
 *  parent holds still; the chip itself moves down the column.
 ************************************************************/
function ac_show_more(gobj, event, kw, src)
{
    let priv = gobj.priv;
    let group = (kw && kw.group) || "";

    if(!priv._fold_model || !group) {
        log_error(`${gobj_short_name(gobj)}: show more of '${group}' with no tree loaded`);
        return -1;
    }
    let g = fold_split_group_key(group);
    if(!g) {
        log_error(`${gobj_short_name(gobj)}: bad fold group '${group}'`);
        return -1;
    }
    let node_id = g.node_key? node_id_of_key(gobj, g.node_key) : "";
    let vp = node_id? yui_graph_viewport_of(priv.graph, node_id) : null;

    fold_show_more(priv._fold_model, priv._fold_state, group);
    reconcile_fold(gobj, {keep: node_id, keep_vp: vp});

    return 0;
}

/************************************************************
 *  The level of the main tree the toolbar's stepper stands on:
 *  `fold_level` once the reader has stepped, `expand_depth`
 *  until then, clamped to the levels the tree has.
 ************************************************************/
function current_fold_level(gobj)
{
    let priv = gobj.priv;
    let level = gobj_read_integer_attr(gobj, "fold_level");

    if(!(level > 0)) {
        level = gobj_read_integer_attr(gobj, "expand_depth");
    }
    if(!priv._fold_model) {
        return level;
    }
    return fold_level_clamp(priv._fold_model, level);
}

/************************************************************
 *  The toolbar's stepper: one level more or one less of the
 *  MAIN tree (the host owns the number and persists it; this
 *  applies it). Deeper opens the hooks above the new level,
 *  shallower folds from it down -- a level is a floor, not a
 *  picture, so what the reader opened by its pill stays (see
 *  treedb_fold_model). Replaces expand all / collapse all
 *  (7.23.141): the whole treedb at once was the pile, and
 *  closing threw away everything the reader had opened.
 ************************************************************/
function ac_set_fold_level(gobj, event, kw, src)
{
    let priv = gobj.priv;
    let level = Number(kw && kw.level);

    if(!(level > 0)) {
        log_error(`${gobj_short_name(gobj)}: fold level '${kw && kw.level}' is not a level`);
        return -1;
    }
    if(!priv._fold_model) {
        gobj_write_attr(gobj, "fold_level", level);
        return 0;       /*  applied when the records arrive  */
    }

    let from = current_fold_level(gobj);
    level = fold_level_clamp(priv._fold_model, level);
    gobj_write_attr(gobj, "fold_level", level);
    if(level === from) {
        return 0;
    }

    let keep = fold_keep_node(gobj);
    let vp = yui_graph_viewport_of(priv.graph, keep);
    if(level > from) {
        fold_open_levels(priv._fold_model, priv._fold_state, level);
    } else {
        fold_close_levels(priv._fold_model, priv._fold_state, level);
    }
    reconcile_fold(gobj, {keep: keep, keep_vp: vp});

    return 0;
}

/************************************************************
 *  The node the camera holds still across a GLOBAL fold: the
 *  anchor when there is one, else the first root -- the top of
 *  the tree, which is where a JSON viewer keeps the eye when it
 *  opens or closes everything. The zoom does not move either way:
 *  a fold is not a reason to change the scale the reader chose,
 *  and until 7.23.78 both buttons fitted the whole graph, so
 *  opening everything zoomed out to a strip and closing it zoomed
 *  in on the roots, every time.
 ************************************************************/
function fold_keep_node(gobj)
{
    let priv = gobj.priv;

    if(priv.anchor_state === "on" && priv.anchor_id) {
        return priv.anchor_id;
    }
    let model = priv._fold_model;
    for(let topic_name of model.topics) {
        let roots = model.groups.get(fold_root_group_key(topic_name)) || [];
        if(roots.length) {
            return node_id_of_key(gobj, roots[0]);
        }
    }
    return "";
}

/************************************************************
 *  The legend's three settings, from the host, which persists
 *  them. Each rebuilds the tree; the fold state is kept -- it is
 *  keyed by group, and a group that is gone is never read -- except
 *  for a new MAIN topic, whose roots are other roots: the tree
 *  opens again at the reader's level, now counted from them.
 ************************************************************/
function ac_set_hidden_topics(gobj, event, kw, src)
{
    let priv = gobj.priv;
    let topics = (kw && is_array(kw.topics))? kw.topics : [];

    gobj_write_attr(gobj, "hidden_topics", topics);
    if(!priv._fold_model) {
        return 0;       /*  applied when the records arrive  */
    }
    rebuild_fold_model(gobj);
    reconcile_fold(gobj, {});
    return 0;
}

function ac_set_main_topic(gobj, event, kw, src)
{
    let priv = gobj.priv;

    gobj_write_str_attr(gobj, "main_topic", (kw && kw.topic) || "");
    if(!priv._fold_model) {
        return 0;
    }
    /*  Read BEFORE the model is rebuilt: the node is looked up in the
     *  tree that is on screen. If the new trunk leaves it out,
     *  `yui_graph_place_at` finds nothing and the camera simply stays
     *  where it was -- which is still not a refit.  */
    let keep = fold_keep_node(gobj);
    let vp = yui_graph_viewport_of(priv.graph, keep);
    rebuild_fold_model(gobj);
    fold_expand_to_level(
        priv._fold_model, priv._fold_state, current_fold_level(gobj)
    );
    reconcile_fold(gobj, {relayout: true, keep: keep, keep_vp: vp});
    return 0;
}

function ac_set_loose_topics(gobj, event, kw, src)
{
    let priv = gobj.priv;
    let topics = (kw && is_array(kw.topics))? kw.topics : [];

    gobj_write_attr(gobj, "loose_topics", topics);
    if(!priv._fold_model) {
        return 0;
    }
    rebuild_fold_model(gobj);
    reconcile_fold(gobj, {});
    return 0;
}

/************************************************************
 *  The shape of every record: open cards or closed squares.
 *  A change of mode forgets the nodes toggled against the old
 *  one -- they were exceptions to a rule that no longer holds --
 *  and lays the graph out again, because a square and a card
 *  do not occupy the same room.
 ************************************************************/
function ac_set_node_mode(gobj, event, kw, src)
{
    let priv = gobj.priv;
    let mode = (kw && kw.node_mode && str_in_list(NODE_MODES, kw.node_mode))? kw.node_mode : "expanded";

    gobj_write_str_attr(gobj, "node_mode", mode);
    priv._open_nodes = new Set();
    if(!priv.graph || !priv._fold_model) {
        return 0;       /*  applied when the records arrive  */
    }
    /*  The camera is the reader's: a square and a card do not occupy
     *  the same room, so the graph is laid out again -- and the node
     *  being read stays at its pixel, at the zoom it was chosen at,
     *  instead of the whole graph being fitted from scratch.  */
    let keep = fold_keep_node(gobj);
    let vp = yui_graph_viewport_of(priv.graph, keep);
    reshape_nodes(gobj, all_record_node_ids(gobj));
    reshape_more_chips(gobj);
    reconcile_fold(gobj, {relayout: true, keep: keep, keep_vp: vp});
    return 0;
}

/************************************************************
 *  The name under a figure, on or off. Only the `shape` nodes
 *  change, and nothing moves: the label hangs outside the figure
 *  and the layout measures the figure.
 ************************************************************/
function ac_set_node_labels(gobj, event, kw, src)
{
    let priv = gobj.priv;

    gobj_write_bool_attr(gobj, "node_labels", !!(kw && kw.node_labels));
    if(!priv.graph) {
        return 0;
    }
    let ids = all_record_node_ids(gobj).filter((id) => node_mode_of(gobj, id) === 'shape');
    reshape_nodes(gobj, ids);
    return 0;
}

/************************************************************
 *  ONE node opened or closed against the mode (a double click,
 *  or the context menu). It holds still on screen while the
 *  rest of the graph makes room, as a fold does.
 ************************************************************/
function ac_toggle_node_mode(gobj, event, kw, src)
{
    let priv = gobj.priv;
    let node_id = (kw && kw.id) || "";

    if(!priv.graph || !node_id) {
        log_error(`${gobj_short_name(gobj)}: toggle node mode without a node`);
        return -1;
    }
    if(!priv._open_nodes) {
        priv._open_nodes = new Set();
    }
    if(priv._open_nodes.has(node_id)) {
        priv._open_nodes.delete(node_id);
    } else {
        priv._open_nodes.add(node_id);
    }
    let vp = yui_graph_viewport_of(priv.graph, node_id);
    reshape_nodes(gobj, [node_id]);
    reshape_more_chips(gobj);
    if(priv._fold_model) {
        reconcile_fold(gobj, {relayout: true, keep: node_id, keep_vp: vp});
    }
    return 0;
}

/************************************************************
 *  A double click on a node: open it if closed, close it if open.
 *  A `+N` chip is not a record and has no shape to toggle.
 ************************************************************/
function ac_node_dblclick(gobj, event, kw, src)
{
    let priv = gobj.priv;
    let node_id = kw && kw.evt && kw.evt.target? kw.evt.target.id : "";
    let nd = null;
    try {
        nd = priv.graph.getNodeData(node_id);
    } catch(e) {
        nd = null;
    }
    if(!nd || !nd.data || !nd.data.desc || is_more_node(nd)) {
        return 0;
    }
    gobj_send_event(gobj, "EV_TOGGLE_NODE_MODE", {id: node_id}, gobj);
    return 0;
}

/************************************************************
 *  Tell whoever asked how many nodes the term matched. The count is
 *  the answer to the question the box asks; without it "nothing moved"
 *  and "nothing matched" look the same.
 ************************************************************/
function publish_find_result(gobj, term, matches)
{
    gobj_publish_event(gobj, "EV_FIND_RESULT", {
        term: term,
        matches: matches,
        hidden_matches: gobj.priv._find_hidden_matches || 0,
    });
}

/************************************************************
 *
 ************************************************************/
function ac_find_nodes(gobj, event, kw, src)
{
    let term = (kw && kw.text) || "";
    let matches = graph_find_nodes(gobj, term);
    publish_find_result(gobj, term, matches);
    return 0;
}

function ac_center(gobj, event, kw, src)
{
    graph_center(gobj);
    return 0;
}

function ac_fullscreen(gobj, event, kw, src)
{
    return ac_request_fullscreen(gobj, event, kw, src);
}

/************************************************************
 *  Layout change
 *
 *  A new layout moves EVERY node, so the camera cannot stay on the
 *  coordinates it had: it would look at empty grid where the old
 *  arrangement was. It goes through the reconcile instead, which
 *  holds the node the reader was looking at on the same pixel (the
 *  zoom is kept) and fits only if nothing is left in view.
 ************************************************************/
function ac_set_layout(gobj, event, kw, src)
{
    let priv = gobj.priv;
    let graph = priv.graph;
    let layout = select_layout(gobj, kw.layout);

    /*  The reader chose it: a later load must not auto-lay it back.  */
    priv._layout_asked = gobj_read_str_attr(gobj, "layout");

    /*  The ports turn with the reading direction, before the lines
     *  are laid out from them.  */
    apply_layout_direction(gobj);

    let done = () => {
        configure_behaviour(gobj);
        update_toolbar(gobj);
    };

    if(!priv._fold_model || !graph || !graph.rendered) {
        /*  No records yet: nothing on screen to hold still.  */
        graph_set_layout(gobj, layout).then(() => {
            repaint_minimap(gobj);
            done();
        });
        return 0;
    }

    let keep = camera_anchor_node(gobj);
    let vp = keep? yui_graph_viewport_of(graph, keep) : null;
    graph.setLayout(layout);
    reconcile_fold(gobj, {relayout: true, keep: keep, keep_vp: vp}).then(done);

    return 0;
}

/************************************************************
 *  Mode change
 ************************************************************/
function ac_set_operation_mode(gobj, event, kw, src)
{
    gobj_write_attr(gobj, "operation_mode", kw.operation_mode);
    configure_behaviour(gobj);
    update_toolbar(gobj);

    /*  `configure_behaviour` is what decides `edit_mode`, and the
     *  history plugin belongs to that decision.  */
    sync_history_plugin(gobj);
    return 0;
}

/************************************************************
 *  Selection mode on/off, from the edit toolbar.
 *
 *  Shift is what the selection is built on, and a telephone has
 *  no Shift: the marquee and the add-to-selection click were a
 *  desktop feature by construction. This makes that key a MODE
 *  -- while it is on, a tap picks a card and a drag on the
 *  background draws the band, so the same two gestures are
 *  reachable with one finger.
 *
 *  It costs panning while it is on, and deliberately: G6 binds
 *  both to a plain drag, and a gesture cannot be two things.
 *  That is why it is a button and not a heuristic -- the reader
 *  turns it off to move the camera, and the toolbar says which
 *  of the two the graph is listening for.
 ************************************************************/
function ac_toggle_selection_mode(gobj, event, kw, src)
{
    let priv = gobj.priv;

    if(!priv.edit_mode) {
        log_error(`${gobj_short_name(gobj)}: selection mode asked outside edition`);
        return 0;
    }

    priv.selection_mode = !priv.selection_mode;

    if(priv.selection_mode) {
        /*  A set has no handles, no ports and no popover: those hang
         *  off `_selected_node_id`, the node OPENED for editing, and
         *  in this mode a tap no longer opens one. The selection
         *  itself stays -- entering the mode is not a way to lose it.  */
        deselect_port(gobj);
        hide_node_icon(gobj);
        hide_node_popover(gobj);
        hide_resize_handles(gobj);
        priv._selected_node_id = null;
    }

    configure_behaviour(gobj);
    update_selection_mode_button(gobj);

    return 0;
}

/************************************************************
 *  Node drag end
 ************************************************************/
function ac_node_drag_end(gobj, event, kw, src)
{
    let priv = gobj.priv;

    if(priv.edit_mode) {
        mark_graph_dirty(gobj);
    }

    return 0;
}

/************************************************************
 *  A key, while the graph has focus.
 *
 *  Full screen keeps the two keys it always had. The rest belong to
 *  the selection, so they only mean anything in edition -- outside
 *  it there is nothing selected to clear, select or delete.
 ************************************************************/
function ac_key_down(gobj, event, kw, src)
{
    let priv = gobj.priv;
    let key = (kw && kw.key) || "";

    if(gobj_read_bool_attr(gobj, "with_fullscreen")) {
        let fullscreen = graph_get_plugin(gobj, "fullscreen");
        if(fullscreen) {
            if(key === "F" || key === "f") {
                fullscreen.request();
            } else if(key === "Escape" && priv.is_fullscreen) {
                /*  Only while actually IN full screen. Asking to leave
                 *  a full screen nobody entered throws, and since this
                 *  is now an action rather than a listener, that throw
                 *  takes the rest of the key with it -- which is how
                 *  Escape stopped clearing the selection.
                 *
                 *  Escape does both when both apply, and that is right:
                 *  the browser leaves full screen on Escape whatever we
                 *  do, so refusing to clear as well would only make the
                 *  key do less than it appears to.  */
                fullscreen.exit();
            }
        }
    }

    if(!priv.edit_mode) {
        return 0;
    }

    if(key === "Escape") {
        deselect_node(gobj);
        return 0;
    }
    if(kw.ctrl && (key === "a" || key === "A")) {
        select_all_nodes(gobj);
        return 0;
    }
    if(key === "Delete" || key === "Backspace") {
        request_delete_selection(gobj);
        return 0;
    }

    return 0;
}

/************************************************************
 *  The rubber band let go: these are the nodes it enclosed.
 *
 *  They arrive in the kw because `onSelect` runs BEFORE G6 writes
 *  the state, so asking the graph here would answer the previous
 *  selection.
 ************************************************************/
function ac_brush_select(gobj, event, kw, src)
{
    set_selection(gobj, (kw && kw.ids) || []);

    return 0;
}

/************************************************************
 *  Node click - publish vertex clicked event
 ************************************************************/
function ac_node_click(gobj, event, kw, src)
{
    let priv = gobj.priv;
    let graph = priv.graph;
    let node_id = kw.evt.target.id;

    /*
     *  A `+N` chip is one thing only: the next page of its group. It
     *  is not a record -- nothing to select, anchor, detail or link.
     */
    let more_nd = null;
    try {
        more_nd = graph.getNodeData(node_id);
    } catch(e) {
        more_nd = null;
    }
    if(is_more_node(more_nd)) {
        gobj_send_event(gobj, "EV_SHOW_MORE", {group: more_nd.data.more}, gobj);
        return 0;
    }

    /*
     *  A waiting anchor TAKES the click, before selection, before
     *  ports, before linking: it is what the reader armed the button
     *  for, and letting the same press also do the graph's own thing
     *  would make picking a target a side effect of doing something
     *  else.
     */
    if(priv.anchor_state === "arming") {
        priv.anchor_id = node_id;
        priv.anchor_state = "on";
        update_toolbar(gobj);
        repaint_cards(gobj, new Set([node_id]));

        /*  POSTED, not made here: a camera move issued inside G6's click
         *  dispatch is swallowed -- see the note in yui_graph_center_on.
         *  An event to itself and not a timer: a deferral is not a TIME.  */
        gobj_post_event(gobj, "EV_CENTER_ANCHOR", {}, gobj);
        return 0;
    }

    try {
        let nodedata = graph.getNodeData(node_id);
        if(nodedata && nodedata.data && nodedata.data.desc) {
            gobj_publish_event(gobj, "EV_VERTEX_CLICKED", {
                treedb_name: priv.treedb_name,
                topic_name: nodedata.data.desc.topic_name,
                record: nodedata.data.record
            });

            if(priv.edit_mode && (kw.evt.shiftKey || priv.selection_mode)) {
                /*  Shift+click extends the selection, the way it does
                 *  everywhere -- and so does a plain tap while the
                 *  toolbar's selection mode is on, which is that key
                 *  for a finger. It never looks for a port: a port is
                 *  a one-node affordance, and this gesture is about
                 *  the set.  */
                toggle_in_selection(gobj, node_id);
            } else if(priv.edit_mode) {
                // Check if click hits a port
                // Convert client coords to viewport (container-relative) then to canvas
                let containerRect = priv.$container.getBoundingClientRect();
                let canvasPoint = graph.getCanvasByViewport([
                    kw.evt.client.x - containerRect.left,
                    kw.evt.client.y - containerRect.top
                ]);
                let port_key = detect_port_click(
                    gobj, node_id, canvasPoint[0], canvasPoint[1]
                );

                // In linking mode, try to complete the link
                if(priv._linking_mode) {
                    if(port_key && try_complete_link(gobj, node_id, port_key)) {
                        return 0;
                    }
                    // Clicked on non-valid target, cancel linking
                    exit_linking_mode(gobj);
                    return 0;
                }

                if(port_key) {
                    select_port(gobj, node_id, port_key);
                } else {
                    deselect_port(gobj);
                    select_node(gobj, node_id);
                }
            } else {
                // Reading mode only: a plain click shows the detail
                // popover. Never in edit mode (it gets in the way).
                show_node_detail_popover(gobj, node_id);
            }
        }
    } catch(e) {
        // Clicked on non-node element
    }

    return 0;
}

/************************************************************
 *  Edge click - publish edge clicked event with semantic data
 ************************************************************/
function ac_edge_click(gobj, event, kw, src)
{
    let priv = gobj.priv;
    let graph = priv.graph;
    let edge_id = kw.evt.target.id;

    try {
        let edgedata = graph.getEdgeData(edge_id);
        if(edgedata && edgedata.data) {
            gobj_publish_event(gobj, "EV_EDGE_CLICKED", {
                treedb_name: priv.treedb_name,
                edge_id: edge_id,
                parent_topic: edgedata.data.parent_topic,
                parent_id:    edgedata.data.parent_id,
                hook_name:    edgedata.data.hook_name,
                child_topic:  edgedata.data.child_topic,
                child_id:     edgedata.data.child_id,
                fkey_name:    edgedata.data.fkey_name,
            });

            if(priv.edit_mode) {
                deselect_node(gobj);
                select_edge(gobj, edge_id);
            }
        }
    } catch(e) {
        // Clicked on non-edge element
    }

    return 0;
}

/************************************************************
 *  Node context menu
 ************************************************************/
function ac_node_context_menu(gobj, event, kw, src)
{
    return 0;
}

/************************************************************
 *  Canvas click
 ************************************************************/
function ac_canvas_click(gobj, event, kw, src)
{
    let priv = gobj.priv;

    hide_node_detail(gobj);

    if(priv._linking_mode) {
        exit_linking_mode(gobj);
        return 0;
    }

    if(priv.edit_mode) {
        deselect_node(gobj);
        hide_create_popover(gobj);
    }

    return 0;
}

/************************************************************
 *  Synchronize a history command with the treedb backend.
 *
 *  Call after undo (pass cmd.original) or after redo (pass cmd.current).
 *  `cmdData` has the shape produced by G6's parseCommand():
 *      { add: { nodes?, edges? }, update: { ... }, remove: { nodes?, edges? } }
 *
 *  Only structural add/remove operations require backend sync:
 *    - add.nodes    → nodes restored by undo/redo  → EV_CREATE_NODE
 *    - remove.nodes → nodes removed  by undo/redo  → EV_DELETE_NODE
 *    - add.edges    → edges restored by undo/redo  → EV_LINK_NODES
 *    - remove.edges → edges removed  by undo/redo  → EV_UNLINK_NODES
 *
 *  update.nodes/edges are style/position-only changes; they are saved
 *  to the backend in bulk via EV_SAVE_GRAPH, not individually.
 *
 *  Ref formats expected by the backend (c_node.c):
 *    parent_ref: "topic^id^hook_name"  (decoded by decode_parent_ref())
 *    child_ref:  "topic^id"            (decoded by decode_child_ref())
 ************************************************************/
function sync_history_to_backend(gobj, cmdData)
{
    if(!cmdData) {
        return;
    }
    let priv = gobj.priv;

    /*
     * Nodes re-added by undo (undo of a delete) or redo (redo of a create).
     * node.data carries topic_name and the full treedb record,
     * set when the node was first created via create_topic_node().
     */
    (cmdData.add?.nodes || []).forEach((node) => {
        const d = node.data;
        if(!d || !d.topic_name || !d.record) {
            return;
        }
        gobj_publish_event(gobj, "EV_CREATE_NODE", {
            treedb_name: priv.treedb_name,
            topic_name:  d.topic_name,
            record:      d.record,
        });
    });

    /*
     * Nodes removed by undo (undo of a create) or redo (redo of a delete).
     */
    (cmdData.remove?.nodes || []).forEach((node) => {
        const d = node.data;
        if(!d || !d.topic_name || !d.record) {
            return;
        }
        gobj_publish_event(gobj, "EV_DELETE_NODE", {
            treedb_name: priv.treedb_name,
            topic_name:  d.topic_name,
            record:      d.record,
        });
    });

    /*
     * Edges re-added by undo (undo of an unlink) or redo (redo of a link).
     * edge.data carries the full connection info set when the edge was drawn.
     */
    (cmdData.add?.edges || []).forEach((edge) => {
        const d = edge.data;
        if(!d || !d.parent_topic || !d.parent_id || !d.hook_name ||
                 !d.child_topic  || !d.child_id) {
            return;
        }
        gobj_publish_event(gobj, "EV_LINK_NODES", {
            treedb_name: priv.treedb_name,
            parent_ref: `${d.parent_topic}^${d.parent_id}^${d.hook_name}`,
            child_ref:  `${d.child_topic}^${d.child_id}`,
        });
    });

    /*
     * Edges removed by undo (undo of a link) or redo (redo of an unlink).
     */
    (cmdData.remove?.edges || []).forEach((edge) => {
        const d = edge.data;
        if(!d || !d.parent_topic || !d.parent_id || !d.hook_name ||
                 !d.child_topic  || !d.child_id) {
            return;
        }
        gobj_publish_event(gobj, "EV_UNLINK_NODES", {
            treedb_name: priv.treedb_name,
            parent_ref: `${d.parent_topic}^${d.parent_id}^${d.hook_name}`,
            child_ref:  `${d.child_topic}^${d.child_id}`,
        });
    });
}

/************************************************************
 *  History undo/redo
 ************************************************************/
function ac_history_redo(gobj, event, kw, src)
{
    perform_history_op(gobj, true);
    return 0;
}

function ac_history_undo(gobj, event, kw, src)
{
    perform_history_op(gobj, false);
    return 0;
}

/************************************************************
 *  Fullscreen
 ************************************************************/
function ac_request_fullscreen(gobj, event, kw, src)
{
    const fullscreen = graph_get_plugin(gobj, "fullscreen");
    if(fullscreen) {
        fullscreen.request();
    }

    return 0;
}

function ac_exit_fullscreen(gobj, event, kw, src)
{
    const fullscreen = graph_get_plugin(gobj, "fullscreen");
    if(fullscreen) {
        fullscreen.exit();
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
            /*--- Data events from parent ---*/
            ["EV_DESCS",                    ac_descs,               null],
            ["EV_CLEAR_DATA",               ac_clear_data,          null],
            ["EV_LOAD_DATA",                ac_load_data,           null],
            ["EV_NODE_CREATED",             ac_node_created,        null],
            ["EV_NODE_UPDATED",             ac_node_updated,        null],
            ["EV_NODE_DELETED",             ac_node_deleted,        null],

            /*--- Graph interaction events ---*/
            ["EV_NODE_CLICK",               ac_node_click,          null],
            ["EV_EDGE_CLICK",               ac_edge_click,          null],
            ["EV_NODE_CONTEXT_MENU",        ac_node_context_menu,   null],
            ["EV_CANVAS_CLICK",             ac_canvas_click,        null],
            ["EV_NODE_DRAG_END",            ac_node_drag_end,       null],
            ["EV_BRUSH_SELECT",             ac_brush_select,        null],
            ["EV_KEY_DOWN",                 ac_key_down,            null],

            /*--- Toolbar events ---*/
            ["EV_ZOOM_IN",                  ac_zoom_in,             null],
            ["EV_ZOOM_OUT",                 ac_zoom_out,            null],
            ["EV_ZOOM_RESET",               ac_zoom_reset,          null],
            ["EV_TOGGLE_ANCHOR",            ac_toggle_anchor,       null],
            ["EV_CENTER_ANCHOR",            ac_center_anchor,       null],
            ["EV_TOGGLE_TOOLBARS",          ac_toggle_toolbars,     null],
            ["EV_AUTO_FIT",                 ac_auto_fit,            null],
            ["EV_ZOOM_SELECTION",           ac_zoom_selection,      null],
            ["EV_FOCUS_TOPIC",              ac_focus_topic,         null],
            ["EV_FIND_NODES",               ac_find_nodes,          null],
            ["EV_TOGGLE_FOLD",              ac_toggle_fold,         null],
            ["EV_SHOW_MORE",                ac_show_more,           null],
            ["EV_SET_FOLD_LEVEL",           ac_set_fold_level,      null],
            ["EV_SET_HIDDEN_TOPICS",        ac_set_hidden_topics,   null],
            ["EV_SET_MAIN_TOPIC",           ac_set_main_topic,      null],
            ["EV_SET_LOOSE_TOPICS",         ac_set_loose_topics,    null],
            ["EV_SET_NODE_MODE",            ac_set_node_mode,       null],
            ["EV_SET_NODE_LABELS",          ac_set_node_labels,     null],
            ["EV_TOGGLE_NODE_MODE",         ac_toggle_node_mode,    null],
            ["EV_NODE_DBLCLICK",            ac_node_dblclick,       null],
            ["EV_CENTER",                   ac_center,              null],
            ["EV_FULLSCREEN",               ac_fullscreen,          null],
            ["EV_SET_LAYOUT",               ac_set_layout,          null],
            ["EV_SET_OPERATION_MODE",       ac_set_operation_mode,  null],
            ["EV_TOGGLE_SELECTION_MODE",    ac_toggle_selection_mode, null],
            ["EV_SAVE_GRAPH",               ac_save_graph,          null],
            ["EV_HISTORY_UNDO",             ac_history_undo,        null],
            ["EV_HISTORY_REDO",             ac_history_redo,        null],
            ["EV_REQUEST_FULLSCREEN",       ac_request_fullscreen,  null],
            ["EV_EXIT_FULLSCREEN",          ac_exit_fullscreen,     null],

            /*--- UI events ---*/
            ["EV_SHOW",                     ac_show,                null],
            ["EV_HIDE",                     ac_hide,                null],
            ["EV_RESIZE",                   ac_resize,              null],
            ["EV_THEME",                    ac_theme,               null],
            ["EV_LANGUAGE_CHANGED",         ac_language_changed,    null],
        ]]
    ];

    /*---------------------------------------------*
     *          Events
     *---------------------------------------------*/
    const event_types = [
        /*--- Data events (received) ---*/
        ["EV_DESCS",                    0],
        ["EV_CLEAR_DATA",               0],
        ["EV_LOAD_DATA",                0],
        ["EV_NODE_CREATED",             0],
        ["EV_NODE_UPDATED",             0],
        ["EV_NODE_DELETED",             0],

        /*--- Graph interaction (internal) ---*/
        ["EV_NODE_CLICK",               0],
        ["EV_EDGE_CLICK",               0],
        ["EV_NODE_CONTEXT_MENU",        0],
        ["EV_CANVAS_CLICK",             0],
        ["EV_NODE_DRAG_END",            0],
        ["EV_BRUSH_SELECT",             0],
        ["EV_KEY_DOWN",                 0],

        /*--- Toolbar (internal) ---*/
        ["EV_ZOOM_IN",                  0],
        ["EV_ZOOM_OUT",                 0],
        ["EV_ZOOM_RESET",               0],
        ["EV_TOGGLE_ANCHOR",            0],
        ["EV_CENTER_ANCHOR",            0],
        ["EV_TOGGLE_TOOLBARS",          0],
        ["EV_AUTO_FIT",                 0],
        ["EV_ZOOM_SELECTION",           0],
        ["EV_FOCUS_TOPIC",              0],
        ["EV_FIND_NODES",               0],
        ["EV_FIND_RESULT",              event_flag_t.EVF_OUTPUT_EVENT],
        ["EV_LAYOUT_AUTOSET",           event_flag_t.EVF_OUTPUT_EVENT],
        /*  Optional: a host that does not persist the viewport is not
         *  doing anything wrong, so no "publish without subscribers".  */
        ["EV_CAMERA_CHANGED",           event_flag_t.EVF_OUTPUT_EVENT|event_flag_t.EVF_NO_WARN_SUBS],
        ["EV_TOGGLE_FOLD",              0],
        ["EV_SHOW_MORE",                0],
        ["EV_SET_FOLD_LEVEL",           0],
        ["EV_SET_HIDDEN_TOPICS",        0],
        ["EV_SET_MAIN_TOPIC",           0],
        ["EV_SET_LOOSE_TOPICS",         0],
        ["EV_SET_NODE_MODE",            0],
        ["EV_SET_NODE_LABELS",          0],
        ["EV_TOGGLE_NODE_MODE",         0],
        ["EV_NODE_DBLCLICK",            0],
        ["EV_LEGEND_STATE",             event_flag_t.EVF_OUTPUT_EVENT],
        ["EV_CENTER",                   0],
        ["EV_FULLSCREEN",               0],
        ["EV_SET_LAYOUT",               0],
        ["EV_SET_OPERATION_MODE",       0],
        ["EV_TOGGLE_SELECTION_MODE",    0],
        ["EV_HISTORY_UNDO",             0],
        ["EV_HISTORY_REDO",             0],
        ["EV_SAVE_GRAPH",               0],
        ["EV_REQUEST_FULLSCREEN",       0],
        ["EV_EXIT_FULLSCREEN",          0],

        /*--- Published to parent ---*/
        ["EV_VERTEX_CLICKED",           event_flag_t.EVF_OUTPUT_EVENT],
        ["EV_EDGE_CLICKED",             event_flag_t.EVF_OUTPUT_EVENT],
        ["EV_CREATE_NODE",              event_flag_t.EVF_OUTPUT_EVENT],
        ["EV_UPDATE_NODE",              event_flag_t.EVF_OUTPUT_EVENT],
        ["EV_DELETE_NODE",              event_flag_t.EVF_OUTPUT_EVENT],
        ["EV_LINK_NODES",               event_flag_t.EVF_OUTPUT_EVENT],
        ["EV_UNLINK_NODES",             event_flag_t.EVF_OUTPUT_EVENT],

        // TODO some events to review from mx_nodes_tree.js
        // ["EV_SHOW_HOOK_DATA",           event_flag_t.EVF_OUTPUT_EVENT],
        // ["EV_SHOW_TREEDB_TOPIC",        event_flag_t.EVF_OUTPUT_EVENT],

        // "EV_CREATE_VERTEX",
        // "EV_DELETE_VERTEX",
        // "EV_CLONE_VERTEX",
        // "EV_DELETE_EDGE",
        // "EV_SHOW_CELL_DATA_FORM",
        // "EV_SHOW_CELL_DATA_JSON",
        // "EV_POPUP_MENU",
        // "EV_EXTEND_SIZE",    -> show levels
        // "EV_MX_CLICK",
        // "EV_MX_DOUBLECLICK",
        // "EV_MX_SELECTION_CHANGE",
        // "EV_MX_ADDCELLS",
        // "EV_MX_MOVECELLS",
        // "EV_MX_RESIZECELLS",
        // "EV_MX_CONNECTCELL",

        /*--- UI events ---*/
        ["EV_SHOW",                     0],
        ["EV_HIDE",                     0],
        ["EV_RESIZE",                   0],
        ["EV_THEME",                    0],
        ["EV_LANGUAGE_CHANGED",         0],
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
        gclass_flag_t.gcflag_manual_start   // gclass_flag
    );

    if(!__gclass__) {
        return -1;
    }

    return 0;
}

/***************************************************************************
 *          Register GClass
 ***************************************************************************/
function register_c_g6_nodes_tree()
{
    /*  Idempotent: C_YUI_TREEDB_GRAPH auto-registers this engine, so an
     *  app that also registers it explicitly (in either order) must not
     *  trip "GClass ALREADY created".  */
    if(gclass_find_by_name(GCLASS_NAME, false)) {
        return 0;
    }
    return create_gclass(GCLASS_NAME);
}

export { register_c_g6_nodes_tree };
