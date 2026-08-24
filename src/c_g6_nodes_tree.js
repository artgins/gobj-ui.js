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
    gobj_parent,
    gobj_name,
    gobj_short_name,
    gobj_is_destroying,
    gobj_subscribe_event,
    gobj_publish_event,
    gobj_send_event,
    gobj_save_persistent_attrs,
    clean_name,
    sprintf,
    is_string,
    is_array,
    empty_string,
    is_object,
    is_number,
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
    getStrokeColor,
} from "./lib_graph.js";

import {node_label} from "./treedb_node_label.js";
import {delete_impact} from "./delete_impact.js";

import {
    BaseLayout,
    ExtensionCategory,
    Graph,
    NodeEvent,
    CanvasEvent,
    HistoryEvent,
    EdgeEvent,
    Circle,
    Toolbar,
    register,
} from '@antv/g6';

import {Circle as CircleGeometry, Rect as RectGeometry} from '@antv/g';
import i18next, {t} from "i18next";

import {inject_svg_icons} from "./lib_icons.js";
import {ensure_drag_canvas_patch} from "./g6_drag_canvas_touch.js";
import {
    ensure_pinch_zoom_patch,
    install_long_press_contextmenu,
} from "./g6_touch_gestures.js";
import {yui_theme_now, yui_watch_theme} from "./yui_theme.js";

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
const HIGHLIGHT_COLOR = "#f0a020";
const HIGHLIGHT_HALO  = "rgba(240,160,32,0.35)";

/*
 *  The selection ring. Deliberately NOT the amber of the highlight:
 *  a node can be a find match AND be selected, and two amber rings
 *  would say nothing about either. Blue is what a selection is in
 *  every editor, and the ring is drawn OUTSIDE the highlight's halo
 *  so the two compose instead of overwriting one another.
 */
const SELECT_RING = "rgba(59,130,246,0.95)";

/***************************************************************
 *  Internal layout and operation mode definitions
 ***************************************************************/
const _layouts = {
    // set manual the first
    "manual": {
        type: 'manual',
    },
    "dagre": {
        type: 'dagre',
    },
    "antv-dagre": {
        type: 'antv-dagre',
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
SDATA(data_type_t.DTP_BOOLEAN,  "confirm_delete_node",  0,  true,   "Ask confirmation before deleting a node"),
SDATA(data_type_t.DTP_BOOLEAN,  "confirm_unlink_edge",  0,  true,   "Ask confirmation before unlinking an edge"),

SDATA(data_type_t.DTP_STRING,   "wide",                 0,  "40px", "Height of header"),

SDATA_END()
];

let PRIVATE_DATA = {
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
    _node_icon_el:      null,       // floating node properties icon element
    _node_delete_el:    null,       // floating delete icon element for node
    _node_popover_el:   null,       // node properties popover element
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
    _uninstall_long_press: null,    // touch door to the context menu
    toolbar_collapsed:  true,       // floating toolbars folded (narrow only)
    _toolbars_could_collapse: null, // last answer, to notice it changed
    _on_focusout_restore: null,     // ...and putting it back when it goes nowhere
    _selected_paint_ids: [],        // node ids whose card is PAINTED selected
                                    // (G6's 'selected' state is the selection
                                    //  itself; this is what is on screen, and
                                    //  it exists to diff the repaint)
    _pending_focus_topic: null,     // focus requested before data was loaded
    _pending_find:      null,       // find requested before data was loaded
    _layout_asked:      "",         // layout the host asked for at create (see mt_create)
    _nodes_total:       0,          // nodes built so far (auto_layout)
    _nodes_placed:      0,          // ...of which carried a saved position
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
    return 0;
}

/***************************************************************
 *          Framework Method: Stop
 ***************************************************************/
function mt_stop(gobj)
{
    return 0;
}

/***************************************************************
 *          Framework Method: Destroy
 ***************************************************************/
function mt_destroy(gobj)
{
    let priv = gobj.priv;

    if(priv._on_language_changed) {
        i18next.off('languageChanged', priv._on_language_changed);
        priv._on_language_changed = null;
    }

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
        register(ExtensionCategory.NODE, 'light', LightNode);
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

    graph.on(CanvasEvent.CLICK, (evt) => {
        gobj_send_event(gobj, "EV_CANVAS_CLICK", {evt: evt}, gobj);
    });

    graph.on(NodeEvent.DRAG, (evt) => {
        update_resize_handles_position(gobj);
        update_port_resize_handles_position(gobj);
        update_edge_icon_position(gobj);
        update_node_icon_position(gobj);
        update_link_icon_position(gobj);
    });

    graph.on(NodeEvent.DRAG_END, (evt) => {
        gobj_send_event(gobj, "EV_NODE_DRAG_END", {evt: evt}, gobj);
    });

    graph.on(NodeEvent.CLICK, (evt) => {
        gobj_send_event(gobj, "EV_NODE_CLICK", {evt: evt}, gobj);
    });

    graph.on(NodeEvent.CONTEXT_MENU, (evt) => {
        gobj_send_event(gobj, "EV_NODE_CONTEXT_MENU", {evt: evt}, gobj);
    });

    graph.on(EdgeEvent.CLICK, (evt) => {
        gobj_send_event(gobj, "EV_EDGE_CLICK", {evt: evt}, gobj);
    });

    graph.on('aftertransform', () => {
        update_resize_handles_position(gobj);
        update_port_resize_handles_position(gobj);
        update_edge_icon_position(gobj);
        update_node_icon_position(gobj);
        update_link_icon_position(gobj);
        update_zoom_readout(gobj);
    });

    // Re-render G6 toolbars when language changes
    priv._on_language_changed = () => {
        update_toolbar(gobj);
    };
    i18next.on('languageChanged', priv._on_language_changed);

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
            enable: (e) => {
                return e.targetType === 'node' || e.targetType === 'edge';
            },
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
    priv._uninstall_long_press = install_long_press_contextmenu(priv.graph);

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
                "zoom-canvas",
            ];
            break;
        case "edition":
            priv.edit_mode = true;
            behaviors = [
                /*  Panning gives way while Shift is held: that is the
                 *  marquee's gesture, and G6 binds drag-canvas straight
                 *  to the drag events, so without this the canvas pans
                 *  under the rubber band.  */
                {
                    type: "drag-canvas",
                    key: "drag-canvas",
                    enable: (event) => !event.shiftKey,
                },
                "zoom-canvas",
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
                    type: "brush-select",
                    key: "brush-select",
                    trigger: ["shift"],
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
                "zoom-canvas",
            ];
            break;
        default:
            log_error(`operation mode unknown: ${operation_mode}`);
            break;
    }
    if(!priv.edit_mode) {
        deselect_node(gobj);
    }
    graph_write_behaviors(gobj, behaviors);
}

/************************************************************
 * Returns the proportional position (between 0 and 1) of a specific point,
 * centered and spaced with margins.
 *
 * index - Index of the point (0 to count-1)
 * count - Total number of points
 * margin - Total margin space (default 0.2 means 10% on each end)
 ************************************************************/
function getPointPosition(count, index, margin = 0.2)
{
    if(count <= 0 || index < 0 || index >= count) {
        log_error("Invalid count or index");
        return 0.5;
    }

    const start = margin / 2;
    const end = 1 - margin / 2;
    const step = (end - start) / count;

    return start + index * step + step / 2;
}

/************************************************************
 *  Count hooks and fkeys in topic desc, classify node type
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
        desc.node_treedb_type = 'hierarchical';
    }
}

/************************************************************
 *  Build ports for a topic desc
 ************************************************************/
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
                        stroke: getStrokeColor(desc.color),
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
                    stroke: getStrokeColor(desc.color),
                };
                top_ports.push(port);
                break;
        }
    }

    /*
     *  Place the ports
     */
    for(let i=0; i<top_ports.length; i++) {
        top_ports[i].placement = [0.5, 0]; // all from same top point
    }
    for(let i=0; i<bottom_ports.length; i++) {
        let point = getPointPosition(bottom_ports.length, i);
        if(top_ports.length === 0) {
            bottom_ports[i].placement = [0, 0.5];
        } else {
            bottom_ports[i].placement = [point, 1];
        }
    }

    return [...top_ports, ...bottom_ports];
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

    /*  Counted HERE, and before the two kw_get_int() below, because those
     *  carry KW_CREATE: `get_node_graph_props()` hands back the record's own
     *  `_geometry` object when it has one — and `{}` is one — so the very
     *  next lines WRITE the invented cascade coordinates into it. Ask the
     *  question a moment later and every node of every treedb answers
     *  "placed", which is exactly how the dagre default kept refusing to
     *  fire: 126 of 126, all of them positions the app had just made up. */
    priv._nodes_total++;
    if(geometry_has_position(geometry)) {
        priv._nodes_placed++;
    }

    let x = kw_get_int(gobj, geometry, "x", xy, kw_flag_t.KW_CREATE);
    let y = kw_get_int(gobj, geometry, "y", xy, kw_flag_t.KW_CREATE);

    //log_warning(`create node ==> ${node_name}`);

    let ports = build_ports(gobj, desc);

    let node_graph_type = null;
    let node_treedb_type = desc.node_treedb_type;

    let style = {
        x: x,
        y: y,
        fill: desc.color,     // Fill color
        stroke: getStrokeColor(desc.color),   // Stroke color
        lineWidth: 1,           // Stroke width
        //labelText: desc.topic_name + "^" + record.id,
    };

    if(node_treedb_type === 'child') {
        // Pure child (LEAF): smallest tier. Rounded-rect chip,
        // same card language as entities, lighter.
        node_graph_type = 'html';
        style.size = [116, 40];
        style.dx = -58;
        style.dy = -20;
        style.innerHTML = build_chip_innerHTML(
            desc.color, priv.theme, record.icon,
            node_label(desc, record), record.id
        );

    } else if(node_treedb_type === 'extended') {
        // Extended (structural / INTERMEDIATE): middle tier. Card
        // with name; "structural" style (neutral grey, dashed
        // border) to read as a container/junction.
        node_graph_type = 'html';
        style.size = [144, 66];
        style.dx = -72;
        style.dy = -33;
        style.innerHTML = build_node_innerHTML(
            desc.color, priv.theme, record.icon, node_label(desc, record),
            desc.topic_name, true, record.id
        );

    } else {
        // Hierarchical entity (ROOT / container): largest tier.
        node_graph_type = 'html';
        style.size = [172, 96];
        style.dx = -86;
        style.dy = -48;
        style.innerHTML = build_node_innerHTML(
            desc.color, priv.theme, record.icon, node_label(desc, record),
            desc.topic_name, false, record.id
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
            if(node_graph_type === 'html') {
                style.dx = -def_size[0] / 2;
                style.dy = -(def_size.length > 1 ? def_size[1] : def_size[0]) / 2;
            }
        }
        if(!geometry.portR && topic_defaults.portR > 0) {
            style.portR = topic_defaults.portR;
        }
    }

    // Override size and portR with saved per-node geometry
    let saved_size = geometry.size;
    if(Array.isArray(saved_size) && saved_size.length > 0) {
        style.size = saved_size;
        // Recalculate dx/dy for HTML nodes to keep content centered
        if(node_graph_type === 'html') {
            style.dx = -saved_size[0] / 2;
            style.dy = -(saved_size.length > 1 ? saved_size[1] : saved_size[0]) / 2;
        }
    }
    if(geometry.portR > 0) {
        style.portR = geometry.portR;
    }

    let node_def = {
        id: node_name,
        type: node_graph_type,
        style: style,
        data: {
            // This 4 keys are available in user `data` of G6 Node.
            topic_name: desc.topic_name,
            desc: desc,
            record: record,
            graph_props: geometry  // from __graphs__ (or _geometry fallback)
        }
    };

    if(json_size(ports)) {
        json_object_update_missing(style, {
            port: true,
            ports: ports,
            portR: node_treedb_type === 'child' ? 2 : 6,
            portLineWidth: 1,
        });

        // Restore per-port radius: saved geometry first, then topic defaults
        let port_sizes = geometry.port_sizes;
        let default_port_sizes = topic_defaults ? topic_defaults.port_sizes : null;
        if(is_object(port_sizes) || is_object(default_port_sizes)) {
            for(let i = 0; i < style.ports.length; i++) {
                let key = style.ports[i].key;
                let r = is_object(port_sizes) ? port_sizes[key] : null;
                if(r == null && is_object(default_port_sizes)) {
                    r = default_port_sizes[key];
                }
                if(r != null) {
                    style.ports[i].r = r;
                }
            }
        }
    }

    if(node_graph_type) {
        graph.addNodeData([node_def]);
    }
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

        // Regenerate the card/chip innerHTML for the new record
        if(desc.node_treedb_type === 'child') {
            graph.updateNodeData([{
                id: node_name,
                style: {
                    innerHTML: build_chip_innerHTML(
                        desc.color, priv.theme, record.icon,
                        node_label(desc, record), record.id
                    ),
                }
            }]);
        } else if(desc.node_treedb_type === 'extended') {
            graph.updateNodeData([{
                id: node_name,
                style: {
                    innerHTML: build_node_innerHTML(
                        desc.color, priv.theme, record.icon,
                        node_label(desc, record),
                        desc.topic_name, true, record.id
                    ),
                }
            }]);
        } else if(desc.node_treedb_type === 'hierarchical') {
            graph.updateNodeData([{
                id: node_name,
                style: {
                    innerHTML: build_node_innerHTML(
                        desc.color, priv.theme, record.icon,
                        node_label(desc, record),
                        desc.topic_name, false, record.id
                    ),
                }
            }]);
        }
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
 *  Create all links from records, initial load from parent
 ************************************************************/
function create_links(gobj)
{
    let priv = gobj.priv;

    for(const [topic_name, records] of Object.entries(priv.records)) {
        let desc = priv.descs[topic_name];
        for(let i = 0; i < records.length; i++) {
            let record = records[i];
            draw_links(gobj, desc, record, true);
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
     *  Child node (me)
     */
    let child_node = build_node_name(gobj, child_topic, child_id);

    /*
     *  Create the edge with independent id and semantic data
     *  HACK: source/target are interchanged so arrows point parent -> child
     */
    // Doc-style default: neutral grey edges, teal for the
    // containment/tree relation (parent and child same topic, i.e.
    // a self-hierarchy). Saturated topic colour is dropped.
    // `themed_default` marks edges still on the default colour so a
    // theme toggle can re-theme them without touching user-saved ones.
    let dark = (priv.theme === "dark");
    let is_tree = (parent_topic === child_topic);
    let saved_lineWidth = is_tree ? 2 : 1.6;
    let saved_stroke = is_tree
        ? (dark ? '#22a7c2' : '#0e7490')
        : (dark ? '#8b94a3' : '#6b7280');
    let themed_default = true;
    let topic_props = priv._graph_properties[parent_topic];
    if(topic_props) {
        // Per-edge saved style
        if(is_object(topic_props.edges)) {
            let edge_key = hook_name + ":" + parent_id + ":" + child_id;
            let edge_props = topic_props.edges[edge_key];
            if(edge_props) {
                if(edge_props.lineWidth != null) {
                    saved_lineWidth = edge_props.lineWidth;
                }
                if(edge_props.stroke) {
                    saved_stroke = edge_props.stroke;
                    themed_default = false;
                }
            }
        }
        // Fall back to topic defaults (only if not user-overridden)
        if(themed_default && is_object(topic_props.defaults)) {
            let defs = topic_props.defaults;
            if(defs.edge_styles && defs.edge_styles[hook_name]) {
                let hook_style = defs.edge_styles[hook_name];
                if(hook_style.lineWidth != null) {
                    saved_lineWidth = hook_style.lineWidth;
                }
                if(hook_style.stroke) {
                    saved_stroke = hook_style.stroke;
                    themed_default = false;
                }
            } else if(defs.edge_style) {
                if(defs.edge_style.lineWidth != null) {
                    saved_lineWidth = defs.edge_style.lineWidth;
                }
                if(defs.edge_style.stroke) {
                    saved_stroke = defs.edge_style.stroke;
                    themed_default = false;
                }
            }
        }
    }

    let edge = {
        id: build_edge_id(gobj),
        type: 'cubic',
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

    // Extract geometry from render style
    let node_props = topic_props.nodes[record.id] || {};
    json_object_update(
        node_props,
        kw_clone_by_keys(gobj, style, ["x", "y", "size", "portR"])
    );

    // Save per-port radius values (only ports with custom r)
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

    // Collect geometry for all nodes into _graph_properties
    const nodes = graph.getData().nodes;
    for(let i = 0; i < nodes.length; i++) {
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
function graph_focus_topic(gobj, topic)
{
    let priv = gobj.priv;
    let graph = priv.graph;
    if(!graph || !priv.graph_rendered) {
        priv._pending_focus_topic = topic;
        return;
    }

    let data = {};
    try {
        data = graph.getData() || {};
    } catch(e) {
        log_error(`${gobj_short_name(gobj)}: graph.getData() failed: ${e}`);
        return;
    }
    let nodes = is_array(data.nodes) ? data.nodes : [];

    /*  Clear the previous focus highlight, then set the new one. */
    let states = {};
    for(let id of (priv._focus_ids || [])) {
        states[id] = [];
    }
    let ids = [];
    if(!empty_string(topic)) {
        for(let n of nodes) {
            if(n && n.data && n.data.topic_name === topic) {
                ids.push(n.id);
            }
        }
        if(ids.length === 0) {
            log_warning(`${gobj_short_name(gobj)}: focus topic '${topic}' has no nodes`);
        }
        for(let id of ids) {
            states[id] = ['active'];
        }
    }
    let prev_ids = priv._focus_ids || [];
    priv._focus_ids = ids;
    priv._focus_topic = topic || null;

    try {
        if(typeof graph.setElementState === "function") {
            graph.setElementState(states);
        }
        apply_node_highlight(gobj, prev_ids, ids);
        if(ids.length && typeof graph.focusElement === "function") {
            graph.focusElement(ids);
        }
    } catch(e) {
        log_error(`${gobj_short_name(gobj)}: focus topic apply failed: ${e}`);
    }
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
    if(!graph || !priv.graph_rendered) {
        priv._pending_find = term;
        return 0;
    }

    let data = {};
    try {
        data = graph.getData() || {};
    } catch(e) {
        log_error(`${gobj_short_name(gobj)}: graph.getData() failed: ${e}`);
        return 0;
    }
    let nodes = is_array(data.nodes) ? data.nodes : [];

    let states = {};
    for(let id of (priv._focus_ids || [])) {
        states[id] = [];
    }

    let ids = [];
    if(!empty_string(term)) {
        let needle = String(term).toLowerCase();
        for(let n of nodes) {
            if(!n || !n.data) {
                continue;
            }
            let record = n.data.record || {};
            let label = "";
            try {
                label = node_label(n.data.desc || {}, record) || "";
            } catch(e) {
                label = "";
            }
            let haystack = [
                label,
                record.id,
                n.data.topic_name
            ].filter((v) => typeof v === "string").join(" ").toLowerCase();

            if(haystack.includes(needle)) {
                ids.push(n.id);
            }
        }
        for(let id of ids) {
            states[id] = ['active'];
        }
    }

    let prev_ids = priv._focus_ids || [];
    priv._focus_ids = ids;
    priv._focus_topic = null;       /*  a find takes over the highlight  */

    try {
        if(typeof graph.setElementState === "function") {
            graph.setElementState(states);
        }
        apply_node_highlight(gobj, prev_ids, ids);
        if(ids.length && typeof graph.focusElement === "function") {
            graph.focusElement(ids);
        }
    } catch(e) {
        log_error(`${gobj_short_name(gobj)}: find apply failed: ${e}`);
    }

    return ids.length;
}

async function graph_zoom_in(gobj)
{
    let priv = gobj.priv;
    let graph = priv.graph;

    const z = graph.getZoom();
    await graph.zoomTo(z * 1.1);
}

async function graph_zoom_out(gobj)
{
    let priv = gobj.priv;
    let graph = priv.graph;

    const z = graph.getZoom();
    await graph.zoomTo(z * 0.9);
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
            if(plugin) {
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
        const { nodes = [] } = data;
        return {
            nodes: nodes.map((node) => {
                let gp = node.data.graph_props;
                let geo = node.data.record._geometry;
                let x = (gp && gp.x != null) ? gp.x :
                         (geo && geo.x != null) ? geo.x : 0;
                let y = (gp && gp.y != null) ? gp.y :
                         (geo && geo.y != null) ? geo.y : 0;
                return {
                    id: node.id,
                    style: { x: x, y: y },
                };
            }),
        };
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

    /*  The union of the two views of the same thing. A brush clears
     *  G6's state on pointerdown without telling anybody, so reading
     *  only the state could drop a card that is on screen wearing a
     *  ring.  */
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
        if(nodeType === 'html') {
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
    return style.portR || 6;
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
    const defaultR = style.portR || 6;

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
         *  overlapping is not a tie -- it is the closer one.  */
        if(dist <= r + slop && dist < best_dist) {
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
}

/************************************************************
 *  Deselect port: clear port state, return to node selection.
 ************************************************************/
function deselect_port(gobj)
{
    let priv = gobj.priv;

    exit_linking_mode(gobj);
    hide_link_icon(gobj);
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
                    p.r = (style.portR || 6) + 4;
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
            let r = p.r != null ? p.r : (style.portR || 6);
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
                graph.updateEdgeData([{ id: edge_id, style: { lineWidth: origLW, stroke: origStroke } }]);
                graph.draw();
                deselect_edge(gobj);
            },
        },
        {
            text: 'apply',
            style: 'flex:1;padding:6px;background:#52c41a;color:#fff;border:none;' +
                   'border-radius:4px;cursor:pointer;font-size:13px;font-weight:500;',
            onClick: () => {
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

    let node_graph_type = nodeData.data && nodeData.data.desc ?
        nodeData.data.desc.node_treedb_type : null;

    // Live preview
    function preview_node() {
        let fill = fillInput.value;
        let stroke = strokeInput.value;
        let lw = parseInt(lwInput.value) || 1;
        let updateStyle = { fill: fill, stroke: stroke, lineWidth: lw };

        if(node_graph_type === 'hierarchical') {
            let record = nodeData.data.record || {};
            updateStyle.innerHTML = build_node_innerHTML(
                fill, priv.theme, record.icon,
                node_label(nodeData.data.desc, record),
                nodeData.data.desc.topic_name, false, record.id
            );
        }
        graph.updateNodeData([{ id: node_id, style: updateStyle }]);
        graph.draw();
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
                let restoreStyle = { fill: origFill, stroke: origStroke, lineWidth: origLW };
                if(node_graph_type === 'hierarchical') {
                    let record = nodeData.data.record || {};
                    restoreStyle.innerHTML = build_node_innerHTML(
                        origFill, priv.theme, record.icon,
                        node_label(nodeData.data.desc, record),
                        nodeData.data.desc.topic_name, false, record.id
                    );
                }
                graph.updateNodeData([{ id: node_id, style: restoreStyle }]);
                graph.draw();
                hide_node_popover(gobj);
            },
        },
        {
            text: 'apply',
            style: 'flex:1;padding:6px;background:#1890ff;color:#fff;border:none;' +
                   'border-radius:4px;cursor:pointer;font-size:13px;font-weight:500;',
            onClick: () => {
                apply_node_properties(gobj, node_id,
                    fillInput.value,
                    strokeInput.value,
                    parseInt(lwInput.value) || 1,
                    scopeSelect.value
                );
            },
        },
    ]);

    priv.$container.appendChild(popover);
    priv._node_popover_el = popover;

    // Clamp popover inside the container
    clamp_popover_position(gobj, popover);
}

function hide_node_popover(gobj)
{
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
            `<div style="display:flex;gap:10px;padding:5px 0;` +
            `border-top:1px solid ${rowbd};">` +
            `<div style="flex:0 0 38%;color:${sub};font-size:12px;` +
            `word-break:break-word;">${escapeHtml(key)}</div>` +
            `<div style="flex:1 1 auto;font-size:12px;` +
            `word-break:break-word;">${escapeHtml(vs)}</div>` +
            `</div>`;
    }

    popover.innerHTML =
        `<div style="display:flex;align-items:flex-start;gap:8px;` +
        `margin-bottom:6px;">` +
            `<div style="flex:1 1 auto;min-width:0;">` +
                `<div style="font-size:14px;font-weight:600;` +
                `word-break:break-word;">${escapeHtml(id)}</div>` +
                `<div style="font-size:11px;color:${sub};` +
                `margin-top:2px;">${escapeHtml(topic)}</div>` +
            `</div>` +
            `<div class="g6-detail-close" style="flex:0 0 auto;` +
            `cursor:pointer;font-size:16px;line-height:1;` +
            `color:${sub};padding:0 2px;">×</div>` +
        `</div>` +
        (rows || `<div style="font-size:12px;color:${sub};">` +
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
 *  Re-render every HTML (hierarchical) node so its card adopts
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

    let name = "dagre";
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
 *  state never painted (see HIGHLIGHT_COLOR). A block in the topic's
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
                border:       "1px solid var(--bulma-border-weak, #ddd)",
                borderRadius: "6px",
                boxShadow:    "0 2px 8px rgba(0, 0, 0, 0.15)",
            },
            /*  The viewport rectangle: G6 washes it in black, which is
             *  invisible over a dark minimap. A link-coloured outline
             *  reads on both.  */
            maskStyle: {
                border:     "2px solid var(--bulma-link, #3b82f6)",
                background: "rgba(59, 130, 246, 0.12)",
            },
            shape: (id, element_type, element) => {
                if(element_type !== "node") {
                    return element;     /*  edges clone themselves fine  */
                }
                try {
                    let nd = graph.getNodeData(id);
                    let size = (nd && nd.style && nd.style.size) || [120, 60];
                    let color = (nd && nd.data && nd.data.desc && nd.data.desc.color)
                        || "#94a3b8";
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
 *  The three treedb tiers (hierarchical / extended / child) each have
 *  their own card, and both the theme refresh and the highlight need the
 *  same three-way choice — it lived inline in the theme refresh and is
 *  shared now. Returns null for a node that carries no desc.
 ************************************************************/
function node_innerHTML_of(nd, theme, highlight, selected)
{
    if(!nd || !nd.data || !nd.data.desc) {
        return null;
    }
    let desc = nd.data.desc;
    let record = nd.data.record || {};
    let label = node_label(desc, record);

    switch(desc.node_treedb_type) {
        case 'child':
            return build_chip_innerHTML(
                desc.color, theme, record.icon, label, record.id,
                highlight, selected
            );
        case 'extended':
            return build_node_innerHTML(
                desc.color, theme, record.icon, label,
                desc.topic_name, true, record.id, highlight, selected
            );
        case 'hierarchical':
            return build_node_innerHTML(
                desc.color, theme, record.icon, label,
                desc.topic_name, false, record.id, highlight, selected
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
        let html = node_innerHTML_of(
            graph.getNodeData(id), priv.theme, focus.has(id), selected.has(id)
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
        let html = node_innerHTML_of(
            graph.getNodeData(id), theme, highlighted.has(id), selected.has(id)
        );
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
function ring_shadow(highlight, selected, base_shadow)
{
    let rings = [];

    if(highlight) {
        rings.push(`0 0 0 4px ${HIGHLIGHT_HALO}`);
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
function build_chip_innerHTML(color, theme, icon, label, key, highlight, selected)
{
    let title = key || label;
    let dark = (theme === "dark");
    let surface = dark ? "#1b2230" : "#ffffff";
    let bg = dark
        ? `color-mix(in srgb, ${color} 30%, #2c3542)`
        : `color-mix(in srgb, ${color} 10%, ${surface})`;
    let border = dark
        ? `color-mix(in srgb, ${color} 85%, #ffffff)`
        : color;
    let text_color = dark ? "#e8eaed" : "#0f172a";
    if(highlight) {
        border = HIGHLIGHT_COLOR;
    }

    let icon_html = "";
    if(icon) {
        icon_html = `<img src="${safeSrc(icon)}" alt="" style="
        width: 16px; height: 16px; object-fit: contain;
        margin-right: 6px; flex: 0 0 auto;
    "/>`;
    }

    return `
<div title="${escapeHtml(title)}" style="
    box-sizing: border-box;
    width: 100%;
    height: 100%;
    background: ${bg};
    border: ${highlight? "3px" : "1px"} solid ${border};
    ${ring_shadow(highlight, selected, "")}
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
 *  Build innerHTML for hierarchical (HTML) nodes.
 *
 *  Card style modelled on the documentation schema graphs
 *  (docs gen_treedb_graphs.py): rounded card, soft tint of the
 *  topic colour with a strong matching border, subtle elevation,
 *  system typography, bold id + muted topic subtitle. The topic
 *  colour is kept (per-topic differentiation) but softened via
 *  color-mix instead of a harsh saturated fill. Theme-aware.
 ************************************************************/
function build_node_innerHTML(color, theme, icon, label, topic_name, structural, key, highlight, selected)
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
        bg = dark
            ? `color-mix(in srgb, ${color} 30%, #2c3542)`
            : `color-mix(in srgb, ${color} 10%, ${surface})`;
        border = dark
            ? `color-mix(in srgb, ${color} 85%, #ffffff)`
            : color;
        border_style = "solid";
    }
    if(highlight) {
        border = HIGHLIGHT_COLOR;
        border_style = "solid";
    }
    let title_color = dark ? "#e8eaed" : "#0f172a";
    let sub_color = dark ? "#9aa4b2" : "#64748b";
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

    return `
<div title="${escapeHtml(title)}" style="
    box-sizing: border-box;
    width: 100%;
    height: 100%;
    background: ${bg};
    border: ${highlight? "3px" : "1.5px"} ${border_style} ${border};
    border-radius: 10px;
    ${ring_shadow(highlight, selected, shadow)}
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
    ">${escapeHtml(label)}</div>${sub_html}
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
    set_selection(gobj, nodes.map((nd) => nd.id));
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
function apply_node_properties(gobj, node_id, fill, stroke, lineWidth, scope)
{
    let priv = gobj.priv;
    let graph = priv.graph;

    let nodeData = graph.getNodeData(node_id);
    if(!nodeData || !nodeData.data) {
        return;
    }

    let source_topic = nodeData.data.desc ? nodeData.data.desc.topic_name : null;
    let updates = [];
    const nodes = graph.getData().nodes;

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

        let updateStyle = { fill: fill, stroke: stroke, lineWidth: lineWidth };
        if(nd.data.desc.node_treedb_type === 'hierarchical') {
            let record = nd.data.record || {};
            updateStyle.innerHTML = build_node_innerHTML(
                fill, priv.theme, record.icon,
                node_label(nd.data.desc, record),
                nd.data.desc.topic_name, false, record.id
            );
        }
        updates.push({ id: nodes[i].id, style: updateStyle });
    }

    if(updates.length > 0) {
        graph.updateNodeData(updates);
        graph.draw().then(() => {
            mark_graph_dirty(gobj);
        });
    }

    hide_node_popover(gobj);
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
 *  Save edge styles into _graph_properties (called from
 *  save_geometry).
 ************************************************************/
function update_edge_geometry(gobj, edge_id)
{
    let priv = gobj.priv;
    let graph = priv.graph;

    let edgeData = graph.getEdgeData(edge_id);
    if(!edgeData || !edgeData.data) {
        return;
    }

    let style = edgeData.style || {};
    let lineWidth = style.lineWidth;
    let stroke = style.stroke;

    let parent_topic = edgeData.data.parent_topic;
    let edge_key = edgeData.data.hook_name + ":" +
        edgeData.data.parent_id + ":" + edgeData.data.child_id;

    // If default values, remove any previously saved entry
    let hasCustom = (lineWidth != null && lineWidth !== 2);
    if(!hasCustom) {
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

    let edge_props = { lineWidth: lineWidth };
    if(stroke) {
        edge_props.stroke = stroke;
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

        if(port_key) {
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

    if(gobj.priv.edit_mode) {
        inject_svg_icons();
        items.push(ctx_item('g6-icon-resize', t('resize all'), 'resize_all_nodes'));
        items.push(ctx_item('g6-icon-resize', t('resize topic nodes'), 'resize_topic_nodes'));
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
        items.push(ctx_item('g6-icon-resize', t('resize all ports'), 'resize_all_ports'));
        items.push(ctx_item('g6-icon-resize', t('resize topic ports'), 'resize_topic_ports'));
    }

    return items;
}

/************************************************************
 *  Build edge context menu items (prepared for expansion).
 ************************************************************/
function build_edge_context_menu(gobj)
{
    let items = [];
    // Future: add edge-specific actions here
    return items;
}

/************************************************************
 *  Handle context menu click: dispatch by value.
 ************************************************************/
function handle_context_menu_click(gobj, value)
{
    let priv = gobj.priv;

    switch(value) {
        case 'resize_all_nodes':
            copy_size_to_nodes(gobj, false);
            break;
        case 'resize_topic_nodes':
            copy_size_to_nodes(gobj, true);
            break;
        case 'resize_all_ports':
            copy_size_to_ports(gobj, false);
            break;
        case 'resize_topic_ports':
            copy_size_to_ports(gobj, true);
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
        if(!nd || !nd.data) {
            continue;
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
        if(nd.type === 'html') {
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
     */
    let idx = 0;
    for(const [topic_name, desc] of Object.entries(descs)) {
        calculate_hooks_fkeys_counter(desc);
        if(topic_name.substring(0, 2) === "__") {
            continue;
        }
        desc.color = node_colors[idx % node_colors.length];
        idx++;
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

    /*--------------------------------------------------*
     *  Creating and loading topic cells from backend
     *--------------------------------------------------*/
    for(let i=0; i<data.length; i++) {
        let record = data[i];
        create_topic_node(gobj, desc, record);
    }

    /*----------------------------------------------------*
     *  Check if all topics are loaded to make the links
     *----------------------------------------------------*/
    let do_links = true;
    for (const [topic_name, desc] of Object.entries(priv.descs)) {
        if (topic_name.substring(0, 2) === "__") {
            continue;   // ignore system topics
        }
        if(!desc.loaded) {
            do_links = false;
            break;
        }
    }

    if(do_links && priv.graph) {
        /*  Decided BEFORE the drawing, not after it.
         *
         *  The plugin builds its canvas on its FIRST render, and it renders
         *  off the graph's draw events — so a minimap added after the last
         *  draw is instantiated, bound, and never painted: no container in
         *  the DOM at all, and nothing anywhere says so. Added here it rides
         *  the two draws and the layout that follow. The node count it needs
         *  is already known: the records were turned into nodes above.  */
        try {
            refresh_minimap(gobj);
        } catch(e) {
            log_error(`${gobj_short_name(gobj)}: refresh_minimap failed: ${e}`);
        }
        graph_draw(gobj).then(() => { // draw nodes, else the link fails
            create_links(gobj);
            graph_draw(gobj).then(() => {
                /*  Before the layout runs, and only now: whether anybody has
                 *  ever placed a node of this treedb is not known until its
                 *  records and __graphs__ are in. */
                let auto_laid = false;
                try {
                    auto_laid = auto_layout(gobj);
                } catch(e) {
                    log_error(`${gobj_short_name(gobj)}: auto_layout failed: ${e}`);
                }
                graph_layout(gobj).then(() => {
                    /*  A graph laid out by us opens WHOLE. dagre spreads a
                     *  126-node treedb over some 19000px, and the camera is
                     *  wherever it was: without this you get eight cards in
                     *  the top-left corner and no reason to think there are
                     *  118 more. Only when WE laid it out — a saved
                     *  arrangement includes where its owner was looking. */
                    if(auto_laid) {
                        graph_fit_readable(gobj).catch((e) => {
                            log_error(`${gobj_short_name(gobj)}: cannot fit the graph: ${e}`);
                        });
                    }
                    if(priv.edit_mode) {
                        graph_add_plugin(gobj, "history");
                    } else {
                        graph_remove_plugin(gobj, "history");
                    }
                    /*  Nodes exist and are positioned now: apply a focus
                     *  requested before the data was ready (deep link). */
                    if(priv._pending_focus_topic !== null) {
                        let ft = priv._pending_focus_topic;
                        priv._pending_focus_topic = null;
                        graph_focus_topic(gobj, ft);
                    }
                    if(priv._pending_find !== null) {
                        let term = priv._pending_find;
                        priv._pending_find = null;
                        publish_find_result(gobj, term, graph_find_nodes(gobj, term));
                    }
                });
            });
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
     *  Create graph node and draw its links
     */
    history_pause(gobj);
    create_topic_node(gobj, desc, node);
    draw_links(gobj, desc, node, false);
    graph_draw(gobj).then(() => {
        history_resume(gobj);
    });

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
     *  Update node data and local record
     */
    update_topic_node(gobj, desc, node_name, node);
    update_local_node(gobj, topic_name, node);

    // Draw edges for refs that appeared
    for(let ref of new_refs) {
        if(!old_refs.has(ref)) {
            let [col_idx, fkey_value] = ref.split("\t");
            draw_link(gobj, topic_name, node.id, cols[parseInt(col_idx)], fkey_value, false);
        }
    }

    graph_draw(gobj).then(() => {
        history_resume(gobj);
    });

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

    graph_draw(gobj).then(() => {
        history_resume(gobj);
    });

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

    graph.zoomTo(1);
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
    graph_focus_topic(gobj, kw && kw.topic);
    return 0;
}

/************************************************************
 *  Tell whoever asked how many nodes the term matched. The count is
 *  the answer to the question the box asks; without it "nothing moved"
 *  and "nothing matched" look the same.
 ************************************************************/
function publish_find_result(gobj, term, matches)
{
    gobj_publish_event(gobj, "EV_FIND_RESULT", {term: term, matches: matches});
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
 ************************************************************/
function ac_set_layout(gobj, event, kw, src)
{
    let priv = gobj.priv;
    let layout = select_layout(gobj, kw.layout);
    graph_set_layout(gobj, layout).then(() => {
        configure_behaviour(gobj);
        update_toolbar(gobj);
    });

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

    try {
        let nodedata = graph.getNodeData(node_id);
        if(nodedata && nodedata.data && nodedata.data.desc) {
            gobj_publish_event(gobj, "EV_VERTEX_CLICKED", {
                treedb_name: priv.treedb_name,
                topic_name: nodedata.data.desc.topic_name,
                record: nodedata.data.record
            });

            if(priv.edit_mode && kw.evt.shiftKey) {
                /*  Shift+click extends the selection, the way it does
                 *  everywhere. It never looks for a port: a port is a
                 *  one-node affordance, and this gesture is about the
                 *  set.  */
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
            ["EV_TOGGLE_TOOLBARS",          ac_toggle_toolbars,     null],
            ["EV_AUTO_FIT",                 ac_auto_fit,            null],
            ["EV_ZOOM_SELECTION",           ac_zoom_selection,      null],
            ["EV_FOCUS_TOPIC",              ac_focus_topic,         null],
            ["EV_FIND_NODES",               ac_find_nodes,          null],
            ["EV_CENTER",                   ac_center,              null],
            ["EV_FULLSCREEN",               ac_fullscreen,          null],
            ["EV_SET_LAYOUT",               ac_set_layout,          null],
            ["EV_SET_OPERATION_MODE",       ac_set_operation_mode,  null],
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
        ["EV_TOGGLE_TOOLBARS",          0],
        ["EV_AUTO_FIT",                 0],
        ["EV_ZOOM_SELECTION",           0],
        ["EV_FOCUS_TOPIC",              0],
        ["EV_FIND_NODES",               0],
        ["EV_FIND_RESULT",              event_flag_t.EVF_OUTPUT_EVENT],
        ["EV_LAYOUT_AUTOSET",           event_flag_t.EVF_OUTPUT_EVENT],
        ["EV_CENTER",                   0],
        ["EV_FULLSCREEN",               0],
        ["EV_SET_LAYOUT",               0],
        ["EV_SET_OPERATION_MODE",       0],
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
