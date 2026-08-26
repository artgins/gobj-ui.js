/***********************************************************************
 *          c_yui_gobj_tree_js.js
 *
 *          Hierarchical tree graph (G6) of the gobj tree of the own yuno.
 *
 *          Copyright (c) 2025-2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {
    SDATA,
    SDATA_END,
    data_type_t,
    event_flag_t,
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
    gobj_post_event,
    kw_get_local_storage_value,
    kw_set_local_storage_value,
    gobj_write_str_attr,
    gobj_read_str_attr,
    gobj_yuno,
    gobj_yuno_name,
    gobj_short_name,
    gobj_is_destroying,
    gobj_unsubscribe_event,
    createElement2,
    escapeHtml,
    log_warning,
    refresh_language,
} from "@yuneta/gobj-js";

import {
    describe_js_gobj,
    node_badge_keys,
    node_info_rows,
    node_labels,
    node_role,
    node_status,
    node_status_key,
} from "./gobj_tree_model.js";
import {
    close_gclass_view,
    gclass_view_available,
    open_gclass_view,
} from "./yui_gclass_view.js";
import {yui_shell_of} from "./c_yui_shell.js";

import {yui_toolbar} from "./yui_toolbar.js";
import {
    yui_graph_camera_items,
    yui_graph_anchor_item,
    yui_graph_update_anchor,
    yui_graph_center_on,
    yui_graph_fold_items,
    yui_graph_refresh_item,
    yui_graph_update_zoom,
} from "./yui_graph_camera.js";

import {t} from "i18next";

import {
    BaseLayout,
    ExtensionCategory,
    Graph,
    NodeEvent,
    CanvasEvent,
    register,
} from '@antv/g6';

import { ensure_drag_canvas_patch } from "./g6_drag_canvas_touch.js";
import { ensure_pinch_zoom_patch } from "./g6_touch_gestures.js";
import { yui_is_dark, yui_theme_now, yui_watch_theme } from "./yui_theme.js";

/***************************************************************
 *              Constants
 ***************************************************************/
const GCLASS_NAME = "C_YUI_GOBJ_TREE_JS";

/***************************************************************
 *              Data
 ***************************************************************/
const attrs_table = [
/*---------------- Public Attributes ----------------*/
SDATA(data_type_t.DTP_POINTER,  "subscriber",       0,  null,   "Subscriber of output events"),

/*---------------- Sub-container ----------------*/
SDATA(data_type_t.DTP_POINTER,  "$container",       0,  null,   "Container element"),
SDATA(data_type_t.DTP_STRING,   "canvas_id",        0,  "",     "Canvas ID"),

/*---------------- Graph Settings ----------------*/
SDATA(data_type_t.DTP_STRING,   "wide",             0,  "36px", "Height of header"),
SDATA(data_type_t.DTP_STRING,   "layout",           0,  "vertical-compact", "Current layout key"),
SDATA(data_type_t.DTP_INTEGER,  "collapse_threshold", 0, 10, "Auto-collapse a node whose direct children exceed this number. 0 disables auto-collapse."),

SDATA_END()
];

/*
 *  What the graph listens for while you are READING it, and while you
 *  are PICKING the node to anchor.
 *
 *  The difference is `drag-element`: with it on, a click that drifts
 *  two pixels -- which is every click a hand makes -- becomes a drag,
 *  G6 fires no `node:click`, and the pick silently does not happen.
 *  Swapped with `setBehaviors()` and not with a behavior's `enable`,
 *  which REPLACES the behavior's own default test rather than adding
 *  to it.
 */
/*
 *  `zoom-canvas` with NO animation, and that is two rules at once.
 *
 *  The house rule first: nothing in this GUI slides or fades, and G6's
 *  200ms zoom easing is a transition nobody chose -- it comes with the
 *  behavior's defaults.
 *
 *  And it is what makes an anchor possible on the WHEEL. `aftertransform`
 *  fires while that easing is still running, so the re-centring measured
 *  a camera that was still moving: measured, its passes went -272, then
 *  +411 the other side, then +183 -- oscillating, because between two
 *  reads the easing had moved the ground. With the zoom instantaneous
 *  the camera is still by the time anything measures it.
 */
const ZOOM_CANVAS = {type: 'zoom-canvas', animation: false};

const BEHAVIORS_READING = ['drag-canvas', ZOOM_CANVAS, 'drag-element'];
const BEHAVIORS_PICKING = ['drag-canvas', ZOOM_CANVAS];

/*
 *  Where this view is remembered between visits.
 *
 *  In localStorage and not in a persistent attr, for the reason the
 *  framework gives itself: only a SERVICE can load or save persistent
 *  attrs, and this gclass is hosted as a child. It is also the right
 *  place on its own terms -- how somebody left THEIR tree arranged is
 *  a fact about that browser, not about the yuno.
 *
 *  Keyed by the gobj's name so two trees in one app do not overwrite
 *  each other's arrangement.
 */
const VIEW_STORE_PREFIX = "yui_gobj_tree_view:";

/*  What is worth carrying back: the layout, where the camera was, and
 *  which branches were folded. The anchor goes too -- it is a camera
 *  state like the other two, and coming back to a tree still holding
 *  the node you left it on is the point of holding it.  */
function view_store_key(gobj)
{
    return VIEW_STORE_PREFIX + gobj_name(gobj);
}

function restore_view_shape(gobj)
{
    let priv = gobj.priv;
    let state = load_view_state(gobj);

    if(!state) {
        return;
    }
    if(state.layout && LAYOUTS[state.layout]) {
        gobj_write_str_attr(gobj, "layout", state.layout);
        /*  And the picker with it: the toolbar was built from the
         *  attr's default a moment ago, so without this the graph draws
         *  the remembered layout while the control names another.  */
        if(priv.$layout_select) {
            priv.$layout_select.value = state.layout;
        }
    }
    if(state.collapsed && typeof state.collapsed === "object") {
        priv.collapse_state = Object.assign({}, state.collapsed);
    }
}

function restore_view_state(gobj)
{
    let priv = gobj.priv;
    let graph = priv.graph;
    let state = load_view_state(gobj);

    if(!graph || !state) {
        return false;
    }

    let done = false;
    priv.restoring = true;
    try {
        if(typeof state.zoom === "number" && state.zoom > 0) {
            graph.zoomTo(state.zoom);
            priv.last_zoom = state.zoom;
            done = true;
        }
        if(Array.isArray(state.position) && state.position.length >= 2) {
            graph.translateTo([state.position[0], state.position[1]]);
            done = true;
        }
        if(state.anchor) {
            /*  By NAME, never by node id: ids are generated per build,
             *  and this one was written in another session.  */
            priv.anchor_name = state.anchor;
            priv.anchor_state = "on";
            reanchor(gobj);
            yui_graph_update_anchor(gobj_read_attr(gobj, "$container"), priv.anchor_state);
            paint_anchor_mark(gobj);
        }
    } catch(e) {
        log_error(`${gobj_short_name(gobj)}: cannot restore the saved view: ${e}`);
    } finally {
        priv.restoring = false;
    }

    yui_graph_update_zoom(gobj_read_attr(gobj, "$container"), priv.graph);
    return done;
}

function save_view_state(gobj)
{
    let priv = gobj.priv;
    let graph = priv.graph;

    if(!graph || priv.restoring) {
        return;     /*  mid-restore: that is our own writing coming back  */
    }

    let state = {
        layout: gobj_read_str_attr(gobj, "layout"),
        collapsed: priv.collapse_state || {},
        anchor: (priv.anchor_state === "on")? priv.anchor_name: "",
    };
    try {
        state.zoom = graph.getZoom();
        state.position = graph.getPosition();
    } catch(e) {
        /*  between renders: keep the rest, the camera is not readable  */
    }

    kw_set_local_storage_value(view_store_key(gobj), state);
}

function load_view_state(gobj)
{
    let state = kw_get_local_storage_value(view_store_key(gobj), null, false);

    return (state && typeof state === "object")? state: null;
}

let PRIVATE_DATA = {
    canvas_id: "",
    graph: null,
    node_counter: 0,
    theme: null,
    theme_observer: null,    // MutationObserver on <html data-theme>
    $layout_select: null,
    $popover: null,
    $popover_title: null,
    $popover_body: null,
    $popover_gclass: null,  // the "gclass" button, or null when unavailable
    popover_node: null,     // the descriptor the popover is showing
    gclass_view: null,      // handle of the open gclass window (or null)
    node_by_id: null,       // map of node_id -> node_data (for popover)
    collapse_state: null,   // map of full_name -> "collapsed" | "expanded"
    resize_observer: null,  // ResizeObserver on the canvas mount element
    _resize_raf: 0,         // rAF id debouncing resize -> EV_RESIZE

    /*---------------- camera anchor ----------------*/
    /*
     *  NOT `pending_anchor`, which is a different job with the same
     *  word: that one keeps a node at the SAME SCREEN SPOT across a
     *  re-render, so expanding a branch does not throw the reader off
     *  the node they expanded. This one keeps a node in the MIDDLE
     *  across a ZOOM, and the reader chooses it from the toolbar.
     */
    anchor_id:      "",     // the node the camera keeps in the middle
    anchor_name:    "",     // its full_name, which survives a rebuild
    anchor_state:   "off",  // "off" | "arming" | "on"
    restoring:      false,  // guards the store against its own restore
    restored:       false,  // the saved arrangement is applied ONCE
    last_zoom:      1,      // tells a wheel zoom from a drag in aftertransform
};

let __gclass__ = null;
let __layout_registered__ = false;

/***************************************************************
 *  Node colours by role.
 *
 *  Saturated hues, one family apart from the next, and the same
 *  five everywhere the reader meets a gobj. `stroke` draws the
 *  border and the edge; `accent` is the brighter sibling used
 *  for the bar down the left of the card and the toggle badge,
 *  so a card carries its colour twice at two intensities and is
 *  readable at the zoom where the text is not.
 ***************************************************************/
const ROLE_COLORS = {
    yuno:    {stroke: "#0284c7", accent: "#38bdf8"},    // sky
    service: {stroke: "#059669", accent: "#34d399"},    // emerald
    pure:    {stroke: "#d97706", accent: "#fbbf24"},    // amber
    volatil: {stroke: "#db2777", accent: "#f472b6"},    // pink
    child:   {stroke: "#7c3aed", accent: "#a78bfa"},    // violet
};

/***************************************************************
 *  Status colours: what the gobj is DOING.
 *
 *  A pill and not a word: three states of one gobj are told
 *  apart across a whole tree by colour long before anybody
 *  reads them, and the dot alone never said which was which.
 *  `disabled` is a fourth entry and not a status -- a disabled
 *  gobj is still stopped or running -- but it takes the pill,
 *  because it is the fact that explains the other one.
 ***************************************************************/
const STATUS_COLORS = {
    light: {
        playing:  {fg: "#065f46", bg: "#a7f3d0", dot: "#10b981"},
        running:  {fg: "#92400e", bg: "#fde68a", dot: "#f59e0b"},
        stopped:  {fg: "#991b1b", bg: "#fecaca", dot: "#ef4444"},
        disabled: {fg: "#334155", bg: "#e2e8f0", dot: "#94a3b8"},
    },
    dark: {
        playing:  {fg: "#6ee7b7", bg: "rgba(16,185,129,0.28)",  dot: "#34d399"},
        running:  {fg: "#fcd34d", bg: "rgba(245,158,11,0.28)",  dot: "#fbbf24"},
        stopped:  {fg: "#fca5a5", bg: "rgba(239,68,68,0.28)",   dot: "#f87171"},
        disabled: {fg: "#cbd5e1", bg: "rgba(148,163,184,0.28)", dot: "#94a3b8"},
    },
};

/***************************************************************
 *  Fixed node sizes per role (px).
 *  Services are drawn bigger than pure children to visually
 *  emphasise the service boundary in the hierarchy.
 ***************************************************************/
const NODE_SIZES = {
    full: {
        yuno:    {w: 260, h: 96},
        service: {w: 232, h: 92},
        child:   {w: 196, h: 86},
    },
    compact: {
        yuno:    {w: 210, h: 30},
        service: {w: 185, h: 26},
        child:   {w: 150, h: 22},
    },
};

/***************************************************************
 *  Shared card typography.
 ***************************************************************/
const GT_FONT =
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, " +
    "Helvetica, Arial, sans-serif";

/***************************************************************
 *  Theme-aware card palette derived from the role colour.
 *
 *  Brighter than a tint: at 9% of the role colour every card
 *  was the same near-white rectangle and the tree read as a
 *  wireframe. The fill carries enough of the hue to be named
 *  from across the canvas, and the border and the accent bar
 *  carry the rest.
 ***************************************************************/
function role_card_style(colors, dark)
{
    let stroke = colors.stroke;
    let accent = colors.accent;

    return {
        bg: dark
            ? `color-mix(in srgb, ${stroke} 34%, #253044)`
            : `color-mix(in srgb, ${stroke} 13%, #ffffff)`,
        border: dark? accent: stroke,
        accent: dark? accent: stroke,
        title: dark ? "#f1f5f9" : "#0f172a",
        sub: dark ? "#a8b3c2" : "#475569",
        tagbg: dark
            ? `color-mix(in srgb, ${stroke} 48%, #253044)`
            : `color-mix(in srgb, ${stroke} 20%, #ffffff)`,
        tagfg: dark? "#f1f5f9": stroke,
        shadow: dark
            ? "0 2px 6px rgba(0,0,0,0.50)"
            : "0 2px 5px rgba(15,23,42,0.16)",
    };
}

/***************************************************************
 *  The pill colours of a node, for the theme in force.
 ***************************************************************/
function status_card_style(d, dark)
{
    let table = dark? STATUS_COLORS.dark: STATUS_COLORS.light;
    if(d.disabled) {
        return table.disabled;
    }
    return table[node_status(d)] || table.stopped;
}

/***************************************************************
 *  Map a node to its visual size class. Services are drawn
 *  bigger than plain children so the service boundary of the
 *  hierarchy is visible before anything is read.
 ***************************************************************/
function get_node_category(d)
{
    switch(node_role(d)) {
        case "yuno":
            return "yuno";
        case "service":
            return "service";
        default:
            return "child";
    }
}

/***************************************************************
 *  Layouts registry.
 *
 *    orientation: "V" top->down | "H" left->right
 *    compact:     one-line nodes (narrow); full:  multi-line nodes
 *    g6_layout:   G6 layout config object applied to the graph
 *    edge_type:   matching G6 edge type
 ***************************************************************/
const LAYOUTS = {
    "vertical": {
        label: "Vertical",
        orientation: "V",
        compact: false,
        g6_layout: {type: 'gobj-tree-v'},
        edge_type: 'cubic-vertical',
    },
    "vertical-compact": {
        label: "Vertical compact",
        orientation: "V",
        compact: true,
        g6_layout: {type: 'gobj-tree-v'},
        edge_type: 'cubic-vertical',
    },
    "horizontal": {
        label: "Horizontal",
        orientation: "H",
        compact: false,
        g6_layout: {type: 'gobj-tree-h'},
        edge_type: 'cubic-horizontal',
    },
    "horizontal-compact": {
        label: "Horizontal compact",
        orientation: "H",
        compact: true,
        g6_layout: {type: 'gobj-tree-h'},
        edge_type: 'cubic-horizontal',
    },
    "lanes-v": {
        label: "Lanes vertical",
        orientation: "V",
        compact: true,
        g6_layout: {type: 'gobj-lanes-v'},
        edge_type: 'polyline',
    },
    "lanes-h": {
        label: "Lanes horizontal",
        orientation: "H",
        compact: true,
        g6_layout: {type: 'gobj-lanes-h'},
        edge_type: 'polyline',
    },
    "dagre-tb": {
        label: "Dagre (top → bottom)",
        orientation: "V",
        compact: true,
        g6_layout: {type: 'antv-dagre', rankdir: 'TB', nodesep: 20, ranksep: 40},
        edge_type: 'polyline',
    },
    "dagre-lr": {
        label: "Dagre (left → right)",
        orientation: "H",
        compact: true,
        g6_layout: {type: 'antv-dagre', rankdir: 'LR', nodesep: 20, ranksep: 40},
        edge_type: 'polyline',
    },
};

function get_layout_cfg(layout_key)
{
    return LAYOUTS[layout_key] || LAYOUTS["vertical-compact"];
}




                    /******************************
                     *      Framework Methods
                     ******************************/




/***************************************************************
 *          Framework Method: Create
 ***************************************************************/
function mt_create(gobj)
{
    let priv = gobj.priv;

    let name = clean_name(gobj_name(gobj));
    priv.canvas_id = "gobj-tree-canvas-" + name;
    gobj_write_str_attr(gobj, "canvas_id", priv.canvas_id);

    priv.collapse_state = {};

    /*
     *  CHILD subscription model
     */
    let subscriber = gobj_read_pointer_attr(gobj, "subscriber");
    if(!subscriber) {
        subscriber = gobj_parent(gobj);
    }
    gobj_subscribe_event(gobj, null, {}, subscriber);

    /*  Follow the app theme. This used to read a legacy C_YUI_MAIN
     *  "__yui_main__" service's `theme` attr when one existed, falling
     *  back to <html data-theme> otherwise — but nothing ever WROTE that
     *  attr, so the service branch answered "light" for the life of the
     *  app. And neither branch WATCHED: the theme was read once, so
     *  toggling to dark with the view open left a white canvas on a dark
     *  app. Watch it, and restyle in ac_theme. */
    priv.theme = yui_theme_now();
    priv.theme_observer = yui_watch_theme(gobj);

    build_ui(gobj);

    ensure_drag_canvas_patch();
    ensure_pinch_zoom_patch();

    if(!__layout_registered__) {
        register(ExtensionCategory.LAYOUT, 'gobj-tree-v', GobjTreeVLayout);
        register(ExtensionCategory.LAYOUT, 'gobj-tree-h', GobjTreeHLayout);
        register(ExtensionCategory.LAYOUT, 'gobj-lanes-v', GobjLanesVLayout);
        register(ExtensionCategory.LAYOUT, 'gobj-lanes-h', GobjLanesHLayout);
        __layout_registered__ = true;
    }
}

/***************************************************************
 *          Framework Method: Start
 ***************************************************************/
function mt_start(gobj)
{
    /*
     *  The layout and the folds go back BEFORE the first build: they
     *  decide what is built, so restoring them afterwards would mean
     *  building the tree twice and showing the wrong one first.
     *  The camera goes back after, once there is something to point at.
     */
    restore_view_shape(gobj);

    /*  The cards carry translated text now (the status pill, the
     *  badges), and G6 draws them as innerHTML inside its own
     *  canvas: refresh_language() cannot reach in there, so a
     *  language switch is a REBUILD. Subscribe to the shell
     *  directly, like C_YUI_PERIOD -- a host that mounts a bare
     *  tree gets the repaint without having to forward anything. */
    let shell = yui_shell_of(gobj);
    if(shell) {
        gobj_subscribe_event(shell, "EV_LANGUAGE_CHANGED", {}, gobj);
    }

    build_graph(gobj);
    load_tree(gobj);
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

    /*  In mt_stop and NOT in mt_destroy: gobj_destroy() destroys the
     *  children BEFORE calling mt_destroy, so a hosted gobj retired
     *  there is retired after the framework already took it down.  */
    close_gclass_view(priv.gclass_view);
    priv.gclass_view = null;
}

/***************************************************************
 *          Framework Method: Destroy
 ***************************************************************/
function mt_destroy(gobj)
{
    let priv = gobj.priv;

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

    if(priv.graph) {
        priv.graph.destroy();
        priv.graph = null;
    }

    destroy_ui(gobj);

    priv.$popover = null;
    priv.$popover_title = null;
    priv.$popover_body = null;
    priv.$popover_gclass = null;
    priv.popover_node = null;
    priv.$layout_select = null;
    priv.node_by_id = null;
    priv.collapse_state = null;
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

    let $toolbar = make_toolbar(gobj);

    let $container = createElement2(
        ['div', {class: 'C_YUI_GOBJ_TREE_JS', style: 'height:100%; display:flex; flex-direction:column; position:relative;'}, [
            ['div', {class: 'is-flex-grow-0 is-flex toolbar_yui_gobj_tree'}, $toolbar],
            ['div', {class: 'is-flex-grow-1', style: 'height:100%; min-height:0; overflow:hidden;'}, [
                                ['div', {id: priv.canvas_id, class: 'gobj-tree-container', style: 'height:100%; min-height:0; border: 1px solid var(--bulma-border-weak); border-radius:0.2rem;'}, [
                ]]
            ]]
        ]]
    );

    gobj_write_attr(gobj, "$container", $container);
    build_popover(gobj, $container);

    /*
     *  Delegated click handler for the per-node +/- toggle.
     *  Runs in capture phase so it can stop the click from
     *  reaching G6 (which would otherwise also fire a node
     *  click and open the popover).
     */
    $container.addEventListener("click", (evt) => {
        let target = evt.target;
        if(!target || typeof target.closest !== "function") {
            return;
        }
        let $toggle = target.closest('[data-gobj-toggle="true"]');
        if(!$toggle) {
            return;
        }
        evt.stopPropagation();
        evt.stopImmediatePropagation();
        evt.preventDefault();

        let node_id = $toggle.getAttribute("data-node-id");
        if(node_id) {
            gobj_send_event(gobj, "EV_TOGGLE_COLLAPSE", {node_id: node_id}, gobj);
        }
    }, true);

    refresh_language($container, t);
}

/************************************************************
 *   Build node popover (hidden by default).
 *   Kept as a persistent DOM subtree so listeners on the
 *   close button survive popover refreshes.
 ************************************************************/
function build_popover(gobj, $container)
{
    let priv = gobj.priv;

    let $popover = document.createElement("div");
    $popover.className = "gobj-tree-popover";
    $popover.style.cssText = `
        position: absolute;
        display: none;
        top: 0;
        left: 0;
        background: var(--bulma-scheme-main, #fff);
        color: var(--bulma-text-strong, #1A1A1A);
        border: 1px solid var(--bulma-border-weak, #9CA3AF);
        border-radius: 6px;
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.18);
        min-width: 260px;
        max-width: 380px;
        font-family: sans-serif;
        font-size: 12px;
        z-index: 1000;
    `;
    $popover.addEventListener("click", (evt) => {
        evt.stopPropagation();
    });

    let $header = document.createElement("div");
    $header.style.cssText = `
        display: flex;
        align-items: center;
        padding: 4px 8px;
        background: var(--bulma-scheme-main-bis, #F3F4F6);
        border-bottom: 1px solid var(--bulma-border-weak, #E5E7EB);
        border-top-left-radius: 6px;
        border-top-right-radius: 6px;
    `;

    let $title = document.createElement("span");
    $title.style.cssText = `
        flex: 1;
        font-weight: bold;
        font-size: 12px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    `;
    $header.appendChild($title);

    /*  What this gobj IS: its gclass, opened in the gclass viewer.
     *
     *  Built only where the app registers C_YUI_JSON -- the viewer
     *  the window hosts. An app that does not carry it gets no
     *  button rather than a button that fails, and the reason is
     *  logged once, at build time.  */
    if(gclass_view_available()) {
        let $gclass = document.createElement("button");
        $gclass.type = "button";
        $gclass.className = "GOBJ_TREE_POPOVER_GCLASS button is-small";
        $gclass.style.cssText = `
            margin-right: 6px;
            padding: 0 8px;
            height: 22px;
            font-size: 11px;
            white-space: nowrap;
        `;
        $gclass.textContent = t("gclass");
        $gclass.setAttribute("i18n", "gclass");
        $gclass.title = t("view gclass");
        $gclass.setAttribute("data-i18n-title", "view gclass");
        $gclass.setAttribute("aria-label", t("view gclass"));
        $gclass.setAttribute("data-i18n-aria-label", "view gclass");
        $gclass.addEventListener("click", (evt) => {
            evt.stopPropagation();
            gobj_send_event(gobj, "EV_OPEN_GCLASS", {}, gobj);
        });
        $header.appendChild($gclass);
        priv.$popover_gclass = $gclass;
    } else {
        log_warning(
            `${gobj_short_name(gobj)}: no C_YUI_JSON registered, ` +
            `the gclass viewer is not offered`
        );
    }

    let $close = document.createElement("button");
    $close.type = "button";
    /*  Named so a stylesheet can reach it: the size a FINGER needs is a
     *  media query, and a media query cannot beat an inline style
     *  without one to hang off. See `lib_graph.css`.  */
    $close.className = "GOBJ_TREE_POPOVER_CLOSE";
    $close.textContent = "×";
    $close.title = t("close");
    $close.setAttribute("data-i18n-title", "close");
    $close.setAttribute("aria-label", t("close"));
    $close.setAttribute("data-i18n-aria-label", "close");
    $close.style.cssText = `
        background: transparent;
        border: none;
        cursor: pointer;
        font-size: 18px;
        line-height: 1;
        padding: 0 4px;
        color: inherit;
    `;
    $close.addEventListener("click", (evt) => {
        evt.stopPropagation();
        hide_popover(gobj);
    });
    $header.appendChild($close);

    let $body = document.createElement("div");
    $body.style.cssText = `
        padding: 6px 8px;
        max-height: 40vh;
        overflow: auto;
    `;

    $popover.appendChild($header);
    $popover.appendChild($body);
    $container.appendChild($popover);

    priv.$popover = $popover;
    priv.$popover_title = $title;
    priv.$popover_body = $body;
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
 *   Toolbar
 ************************************************************/
function make_toolbar(gobj)
{
    let priv = gobj.priv;
    let toolbar_wide = gobj_read_attr(gobj, "wide");
    let current_layout = gobj_read_str_attr(gobj, "layout");

    /*  The GLOBAL fold opens the whole tree; it is not a camera control
     *  and not a per-node one, so it sits on its own at the left — ahead
     *  of a find box where the toolbar has one.  The per-node handles
     *  live inside the cards, on the right of each header.  */
    let left_items = yui_graph_fold_items(gobj, toolbar_wide);
    let center_items = [];
    let right_items = [];

    /*
     *  The camera and the fold pair come from yui_graph_camera.js.
     *
     *  This toolbar used to draw two of these its own way — a bare
     *  magnifier for actual size, `arrows-to-eye` for fit — and fold as
     *  an eye, which means show/hide and not open/closed.  The same
     *  console shows this graph and the JSON one side by side, so the
     *  drawings have to be the same drawings.
     */
    center_items = yui_graph_camera_items(gobj, priv.graph, toolbar_wide);
    center_items.push(yui_graph_anchor_item(gobj, toolbar_wide));
    center_items.push(yui_graph_refresh_item(gobj, toolbar_wide));

    /*
     *  Layout selector
     */
    let options = [];
    for(let key of Object.keys(LAYOUTS)) {
        let opt_attrs = {value: key};
        if(key === current_layout) {
            opt_attrs.selected = "selected";
        }
        options.push(['option', opt_attrs, LAYOUTS[key].label]);
    }

    let $select = createElement2(
        ['select', {
                class: 'select',
                style: {height: toolbar_wide, "margin-left": "0.5em"},
                title: t("layout"),
            },
            options,
            {
                change: (evt) => {
                    let value = evt.target.value;
                    gobj_send_event(gobj, "EV_CHANGE_LAYOUT", {layout: value}, gobj);
                }
            }
        ]
    );
    priv.$layout_select = $select;
    right_items.push($select);

    const $toolbar = yui_toolbar({}, [
        ['div', {class: 'yui-horizontal-toolbar-section left'}, left_items],
        ['div', {class: 'yui-horizontal-toolbar-section center'}, center_items],
        ['div', {class: 'yui-horizontal-toolbar-section right'}, right_items],
    ]);

    refresh_language($toolbar, t);
    return $toolbar;
}

/************************************************************
 *  The element G6 mounts its canvas in.
 *
 *  Read from THIS gclass's own $container, never with
 *  `document.getElementById()`: a view is not always in the
 *  document when it is started -- a host that builds the
 *  viewer and mounts it into a window afterwards starts it
 *  DETACHED -- and a global lookup answers null there. It cost
 *  a resize that never worked: the ResizeObserver below was
 *  simply never attached, silently, and the canvas kept the
 *  size it was born with for the life of the window.
 *
 *  Null only if the UI was never built; that is a bug, and it
 *  is logged where it matters rather than skipped.
 ************************************************************/
function canvas_mount(gobj)
{
    let $container = gobj_read_attr(gobj, "$container");
    if(!$container) {
        return null;
    }
    return $container.querySelector("#" + gobj.priv.canvas_id);
}

/************************************************************
 *  Build a G6 graph instance
 ************************************************************/
function build_graph(gobj)
{
    let priv = gobj.priv;
    let layout_cfg = get_layout_cfg(gobj_read_str_attr(gobj, "layout"));

    const graph = priv.graph = new Graph({
        container: priv.canvas_id,
        animation: false,
        autoResize: false,
        zoomRange: [0.1, 4],

        node: {
            style: {
                labelPlacement: 'center',
            },
        },

        edge: {
            type: layout_cfg.edge_type,
            style: {
                stroke: yui_is_dark() ? '#8b94a3' : '#6b7280',
                lineWidth: 1,
                endArrow: true,
            },
        },

        layout: layout_cfg.g6_layout,

        behaviors: BEHAVIORS_READING.slice(),
    });

    if(priv.theme) {
        graph.setTheme(priv.theme);
    }

    /*  The readout follows ANY camera change, the wheel included — a
     *  wheel notch passes through no action of ours.  */
    graph.on('aftertransform', () => {
        yui_graph_update_zoom(gobj_read_attr(gobj, "$container"), priv.graph);

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
        /*  Where the reader left the camera. One hook covers the wheel,
         *  the drag and every zoom button, which is why it is not
         *  written into each of them.  */
        save_view_state(gobj);
    });

    graph.on(NodeEvent.CLICK, (evt) => {
        gobj_send_event(gobj, "EV_NODE_CLICK", {evt: evt}, gobj);
    });

    graph.on(CanvasEvent.CLICK, (evt) => {
        hide_popover(gobj);
    });

    /*
     *  Self-contained resize.  G6 v5 autoResize only listens to the
     *  global window 'resize'; it ignores container-only changes
     *  (panel/tab/splitter/mobile chrome).  If the configured canvas
     *  size drifts from its on-screen size, @antv/g getScale() scales
     *  the pointer delta by bbox.width/offsetWidth and drag-canvas
     *  panning desyncs (badly on mobile).  Observe the mount box and
     *  re-sync on every change; rAF-debounced, setSize does not change
     *  the observed box so there is no feedback loop.
     */
    if(typeof ResizeObserver !== "undefined") {
        let $canvas = canvas_mount(gobj);
        if(!$canvas) {
            log_error(`${gobj_short_name(gobj)}: no canvas mount, the graph will never resize`);
        } else {
            let ro = new ResizeObserver(() => {
                if(priv._resize_raf) {
                    cancelAnimationFrame(priv._resize_raf);
                }
                priv._resize_raf = requestAnimationFrame(() => {
                    priv._resize_raf = 0;
                    if(priv.graph) {
                        gobj_send_event(gobj, "EV_RESIZE", {}, gobj);
                    }
                });
            });
            ro.observe($canvas);
            priv.resize_observer = ro;
        }
    }
}

/************************************************************
 *  Apply layout (edge type + layout config) to existing graph
 ************************************************************/
function apply_layout(gobj)
{
    let priv = gobj.priv;
    let graph = priv.graph;
    if(!graph) {
        return;
    }

    let layout_cfg = get_layout_cfg(gobj_read_str_attr(gobj, "layout"));

    graph.setOptions({
        edge: {
            type: layout_cfg.edge_type,
            style: {
                stroke: yui_is_dark() ? '#8b94a3' : '#6b7280',
                lineWidth: 1,
                endArrow: true,
            },
        },
        layout: layout_cfg.g6_layout,
    });
}

/************************************************************
 *  The role colours of a node.
 *
 *  Note the ORDER: volatil before service. A volatil gobj that
 *  is also a service is drawn volatil, because that is the fact
 *  that decides how long it lives.
 ************************************************************/
function get_role_colors(d)
{
    switch(node_role(d)) {
        case "yuno":
            return ROLE_COLORS.yuno;
        case "volatil":
            return ROLE_COLORS.volatil;
        case "service":
            return ROLE_COLORS.service;
        case "pure":
            return ROLE_COLORS.pure;
        default:
            return ROLE_COLORS.child;
    }
}

/************************************************************
 *  Generate a unique node id
 ************************************************************/
function gen_node_id(gobj)
{
    let priv = gobj.priv;
    priv.node_counter++;
    return "gt-" + priv.node_counter;
}

/************************************************************
 *  Decide whether a node should be drawn collapsed given the
 *  user's explicit overrides and the auto-collapse threshold.
 ************************************************************/
function is_node_collapsed(gobj, full_name, num_children)
{
    if(num_children === 0) {
        return false;
    }

    let priv = gobj.priv;
    let state = priv.collapse_state ? priv.collapse_state[full_name] : undefined;
    if(state === "collapsed") {
        return true;
    }
    if(state === "expanded") {
        return false;
    }

    let threshold = gobj_read_attr(gobj, "collapse_threshold");
    if(threshold > 0 && num_children > threshold) {
        return true;
    }
    return false;
}

/************************************************************
 *  HTML for the +/- toggle badge.
 *
 *  Uses data-gobj-toggle / data-node-id attributes picked up
 *  by the delegated click listener in build_ui().
 ************************************************************/
function render_toggle_html(node_id, collapsed, num_children, cs)
{
    let label = collapsed ? ("+" + num_children) : "\u2212";
    let title = collapsed ? t("expand children") : t("collapse children");
    return `<span
        data-gobj-toggle="true"
        data-node-id="${node_id}"
        title="${escapeHtml(title)}"
        style="
            flex: 0 0 auto;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-width: 24px;
            height: 18px;
            padding: 0 6px;
            margin-left: 4px;
            background: ${cs.accent};
            color: #ffffff;
            border: 1px solid ${cs.accent};
            border-radius: 9px;
            font-size: 10px;
            font-weight: 700;
            line-height: 1;
            cursor: pointer;
            user-select: none;
        ">${label}</span>`;
}

/************************************************************
 *  HTML for the status pill: what the gobj is DOING.
 *
 *  A dot plus a word, and the word is dropped in the compact
 *  card where there is no room for it -- the colour still
 *  carries it, and the `title` says it in full either way.
 ************************************************************/
function render_status_html(d, ss, labels, with_label)
{
    let full = d.disabled?
        labels.field.disabled:
        (labels.status[node_status_key(d)] || node_status_key(d));
    let label = d.disabled?
        labels.field.disabled:
        (labels.status_short[node_status(d)] || node_status(d));

    if(!with_label) {
        return `<span title="${escapeHtml(full)}" style="
            flex: 0 0 auto;
            width: 10px; height: 10px; border-radius: 50%;
            background: ${ss.dot};
            box-shadow: 0 0 0 2px ${ss.bg};
            margin-left: 6px;
        "></span>`;
    }

    return `<span title="${escapeHtml(full)}" style="
        flex: 0 0 auto;
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 1px 7px 1px 5px;
        background: ${ss.bg};
        color: ${ss.fg};
        border-radius: 9px;
        font-size: 10px;
        font-weight: 700;
        line-height: 1.45;
        white-space: nowrap;
    "><span style="width:7px; height:7px; border-radius:50%; background:${ss.dot};"></span>${escapeHtml(label)}</span>`;
}

/************************************************************
 *  HTML for the badges: what the gobj IS, besides its colour.
 ************************************************************/
function render_badges_html(d, cs, labels)
{
    let html = "";
    for(let key of node_badge_keys(d)) {
        let label = labels.badge[key] || key;
        html += `<span style="
            font-size: 10px;
            font-weight: 600;
            padding: 0 6px;
            margin-right: 4px;
            background: ${cs.tagbg};
            color: ${cs.tagfg};
            border: 1px solid ${cs.accent};
            border-radius: 9px;
            white-space: nowrap;
        ">${escapeHtml(label)}</span>`;
    }
    return html;
}

/************************************************************
 *  Recursively build nodes and edges from a NODE DESCRIPTOR
 *  tree (gobj_tree_model.js), never from gobjs: the same
 *  builder draws the browser yuno and a backend one.
 *
 *  The descriptor is also what the popover reads, so the view
 *  fields it needs are written onto it here (`full_name`,
 *  `short_name`, `num_children`, `is_collapsed`,
 *  `direct_children`) instead of copied into a second object
 *  that can then disagree with the first.
 ************************************************************/
function build_gobj_nodes(gobj, d, nodes, edges, parent_id, compact, labels)
{
    let priv = gobj.priv;
    let node_id = gen_node_id(gobj);

    let dark = yui_is_dark();
    let colors = get_role_colors(d);
    let cs = role_card_style(colors, dark);
    let ss = status_card_style(d, dark);

    let category = get_node_category(d);
    let size = NODE_SIZES[compact ? "compact" : "full"][category];
    let width = size.w;
    let height = size.h;

    /*
     *  Emphasise services with a thicker border so the hierarchy
     *  boundary is visible even when siblings are the same colour.
     */
    let border_width = (category === "yuno" || category === "service") ? 2 : 1;

    /*  A disabled gobj is drawn as one: a dashed border says
     *  "this branch is out of the game" at any zoom.  */
    let border_style = d.disabled? "dashed": "solid";

    let children = d.children || [];
    let num_children = children.length;
    let has_children = num_children > 0;
    let collapsed = has_children &&
        is_node_collapsed(gobj, d.fullname, num_children);

    /*
     *  Direct-children index (collected even when this node is
     *  drawn collapsed, so expanding it can set them to the
     *  "collapsed" state to avoid expanding the whole subtree).
     */
    let direct_children = [];
    for(let child of children) {
        direct_children.push({
            full_name: child.fullname,
            has_grandchildren: (child.children || []).length > 0,
        });
    }

    /*  What the VIEW needs on top of the descriptor. Written onto
     *  it, because the popover reads the same object.  */
    d.full_name = d.fullname;
    d.short_name = d.shortname;
    d.num_children = num_children;
    d.is_collapsed = collapsed;
    d.direct_children = direct_children;
    d.node_id = node_id;

    let toggle_html = has_children
        ? render_toggle_html(node_id, collapsed, num_children, cs)
        : "";

    let card_title = d.gclass + (d.name? ("^" + d.name): "");
    let node_html;

    if(compact) {
        /*
         *  Compact one-line node: "gclass^name" with a left colour bar
         *  and the status dot. Name truncates with "...".
         */
        let compact_label = escapeHtml(card_title);

        node_html = `
<div class="GOBJ_CARD" data-gobj-name="${escapeHtml(d.fullname)}" style="
    width: ${width}px;
    height: ${height}px;
    background: ${cs.bg};
    border: ${border_width}px ${border_style} ${cs.border};
    border-left: 6px solid ${cs.accent};
    border-radius: 7px;
    box-shadow: ${cs.shadow};
    font-family: ${GT_FONT};
    display: flex;
    align-items: center;
    padding: 0 8px;
    box-sizing: border-box;
    overflow: hidden;
    opacity: ${d.disabled? "0.72": "1"};
    cursor: pointer;
" title="${compact_label}">
    <span style="flex:1 1 auto; min-width:0; font-size:11px; font-weight:600; color:${cs.title}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${compact_label}</span>
    ${render_status_html(d, ss, labels, false)}
    ${toggle_html}
</div>`;
    } else {
        /*
         *  Full node: header (gclass + optional toggle), name, state,
         *  badges + status pill. All rows truncate with "..." -- the
         *  width is fixed.
         */
        let header_label = escapeHtml(d.gclass);
        let name_label = escapeHtml(d.name);
        let state_label = escapeHtml(d.state);

        node_html = `
<div class="GOBJ_CARD" data-gobj-name="${escapeHtml(d.fullname)}" style="
    width: ${width}px;
    height: ${height}px;
    background: ${cs.bg};
    border: ${border_width}px ${border_style} ${cs.border};
    border-left: 6px solid ${cs.accent};
    border-radius: 9px;
    box-shadow: ${cs.shadow};
    overflow: hidden;
    font-family: ${GT_FONT};
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 6px 9px;
    gap: 2px;
    opacity: ${d.disabled? "0.72": "1"};
    cursor: pointer;
" title="${escapeHtml(card_title)}">
    <div style="flex:0 0 auto; display:flex; align-items:center; gap:6px; overflow:hidden;">
        <span style="flex:1 1 auto; min-width:0; font-size:12px; line-height:1.25; font-weight:700; color:${cs.title}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${header_label}</span>
        ${toggle_html}
    </div>
    <div style="flex:0 0 auto; font-size:12px; line-height:1.25; color:${cs.sub}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${name_label || "&nbsp;"}</div>
    <div style="flex:0 0 auto; display:flex; justify-content:space-between; align-items:center; gap:6px; overflow:hidden;">
        <span style="flex:1 1 auto; min-width:0; font-size:10px; line-height:1.25; color:${cs.sub}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${state_label || "&nbsp;"}</span>
        ${render_status_html(d, ss, labels, true)}
    </div>
    <div style="flex:0 0 auto; overflow:hidden; white-space:nowrap; text-overflow:ellipsis;">${render_badges_html(d, cs, labels)}</div>
</div>`;
    }

    if(!priv.node_by_id) {
        priv.node_by_id = {};
    }
    priv.node_by_id[node_id] = d;

    let node = {
        id: node_id,
        type: 'html',
        data: d,
        style: {
            innerHTML: node_html,
            size: [width, height],
            dx: -(width / 2),
            dy: -(height / 2),
        },
    };
    nodes.push(node);

    if(parent_id) {
        edges.push({
            source: parent_id,
            target: node_id,
            style: {
                stroke: colors.accent,
                lineWidth: 1.4,
            }
        });
    }

    /*
     *  Recurse only if not collapsed
     */
    if(!collapsed) {
        for(let child of children) {
            build_gobj_nodes(gobj, child, nodes, edges, node_id, compact, labels);
        }
    }

    return node_id;
}

/************************************************************
 *  Load the yuno tree into the graph.
 *
 *  The caller may have set one of:
 *    priv.pending_anchor       — {full_name, viewport_x, viewport_y, zoom}
 *                                anchors the node with `full_name` so it stays
 *                                at the same screen position (and zoom).
 *    priv.pending_preserve_view — keep the current zoom/translate as-is.
 *  Otherwise we fit the whole tree to the viewport.
 ************************************************************/
function load_tree(gobj)
{
    let priv = gobj.priv;
    let graph = priv.graph;

    if(!graph) {
        return;
    }

    /*
     *  The tree, as data.
     *
     *  The graph draws DESCRIPTORS, so this is the one line that
     *  says which yuno is on screen. A backend yuno enters here:
     *  describe_backend_tree(<the `view-gobj-tree` answer>) in
     *  place of describe_js_gobj(gobj_yuno(), true), and nothing
     *  below this point changes.
     */
    let root = describe_js_gobj(gobj_yuno(), true);
    if(!root) {
        log_error(`${gobj_short_name(gobj)}: no yuno to draw`);
        return;
    }

    let layout_cfg = get_layout_cfg(gobj_read_str_attr(gobj, "layout"));
    let labels = node_labels(t);

    let anchor = priv.pending_anchor || null;
    let preserve_view = !!priv.pending_preserve_view;
    priv.pending_anchor = null;
    priv.pending_preserve_view = false;

    priv.node_counter = 0;
    priv.node_by_id = {};

    let nodes = [];
    let edges = [];

    build_gobj_nodes(gobj, root, nodes, edges, null, layout_cfg.compact, labels);

    if(nodes.length > 0) {
        let root_id = nodes[0].id;      /*  built before its children  */
        graph.setData({nodes: nodes, edges: edges});
        graph.render().then(() => {
            /*  Ids are generated per build: point the camera anchor at
             *  its gobj again before anybody asks the camera to go
             *  there.  (`anchor` below is the OTHER one -- see the
             *  note in PRIVATE_DATA.)  */
            reanchor(gobj);
            paint_anchor_mark(gobj);

            if(anchor) {
                restore_view_anchored(gobj, anchor);
                return;
            }
            if(preserve_view) {
                return;
            }

            /*
             *  The arrangement this browser was left in, once: after
             *  that the reader's own camera wins, and a restore on
             *  every rebuild would drag them back every time they
             *  folded something.
             */
            if(!priv.restored) {
                priv.restored = true;
                if(restore_view_state(gobj)) {
                    return;
                }
            }

            /*
             *  ACTUAL SIZE, not fit.  A tree of anything real does not
             *  fit at a zoom anybody can read, so fitting answered
             *  "where is everything" when the question on opening is
             *  "what does this say".
             *
             *  Centred on the ANCHOR if there is one, else on the ROOT
             *  -- never parked at the layout's origin, which is a
             *  corner with nothing in it.
             */
            Promise.resolve(graph.zoomTo(1)).then(() => {
                if(!yui_graph_center_on(graph, priv.anchor_id)) {
                    yui_graph_center_on(graph, root_id);
                }
                priv.last_zoom = 1;
                yui_graph_update_zoom(gobj_read_attr(gobj, "$container"), priv.graph);
            });
        });
    }
}

/************************************************************
 *  Keep the given node visually anchored (same screen
 *  position and zoom) across a re-render.
 ************************************************************/
function restore_view_anchored(gobj, anchor)
{
    let priv = gobj.priv;
    let graph = priv.graph;
    if(!graph || !anchor) {
        return;
    }

    /*
     *  Find the new node id that maps to the same gobj as before
     */
    let new_node_id = null;
    if(priv.node_by_id) {
        for(let id of Object.keys(priv.node_by_id)) {
            if(priv.node_by_id[id].full_name === anchor.full_name) {
                new_node_id = id;
                break;
            }
        }
    }
    if(!new_node_id) {
        return;
    }

    /*
     *  Restore zoom first — translate math is done in viewport pixels,
     *  which depend on the current zoom.
     */
    if(typeof anchor.zoom === "number" && anchor.zoom > 0) {
        try {
            graph.zoomTo(anchor.zoom);
        } catch(e) {}
    }

    /*
     *  Shift the graph so the anchor node lands at its old screen spot
     */
    try {
        let canvas_pos = graph.getElementPosition(new_node_id);
        let vp = graph.getViewportByCanvas([canvas_pos[0], canvas_pos[1]]);
        let dx = anchor.viewport_x - vp[0];
        let dy = anchor.viewport_y - vp[1];
        graph.translateBy([dx, dy]);
    } catch(e) {}
}

/************************************************************
 *  Capture the current screen position + zoom of a node,
 *  so a later re-render can keep it anchored.
 *  Returns null on failure.
 ************************************************************/
function capture_anchor(gobj, node_id)
{
    let priv = gobj.priv;
    let graph = priv.graph;
    if(!graph || !priv.node_by_id || !priv.node_by_id[node_id]) {
        return null;
    }
    let full_name = priv.node_by_id[node_id].full_name;
    if(!full_name) {
        return null;
    }
    try {
        let canvas_pos = graph.getElementPosition(node_id);
        let vp = graph.getViewportByCanvas([canvas_pos[0], canvas_pos[1]]);
        return {
            full_name: full_name,
            viewport_x: vp[0],
            viewport_y: vp[1],
            zoom: graph.getZoom(),
        };
    } catch(e) {
        return null;
    }
}

/************************************************************
 *  Clear and reload.
 *
 *  opts (optional):
 *      {anchor: {full_name, viewport_x, viewport_y, zoom}}
 *          keep the given node anchored at its current screen spot.
 *      {preserve_view: true}
 *          keep the current zoom and translate (no fitView).
 *  Default: fit the whole tree to the viewport.
 ************************************************************/
function refresh_tree(gobj, opts)
{
    let priv = gobj.priv;
    let graph = priv.graph;
    opts = opts || {};

    if(graph) {
        hide_popover(gobj);
        priv.pending_anchor = opts.anchor || null;
        priv.pending_preserve_view = !!opts.preserve_view;
        graph.clear();
        load_tree(gobj);
    }
}

/************************************************************
 *  Render popover body from the info rows of a node.
 *
 *  The rows come from gobj_tree_model.js, so a node of the
 *  browser yuno and a node of a backend one are read out with
 *  the same words in the same order.
 ************************************************************/
function render_popover_body(gobj, node_data)
{
    let priv = gobj.priv;
    let $body = priv.$popover_body;
    if(!$body) {
        return;
    }

    let rows = node_info_rows(node_data, t);

    /*  Bulma scheme vars, like the popover chrome around it (build_popover):
     *  they flip with <html data-theme>, so the popover follows the theme
     *  with no redraw. Hardcoding them is what made the value near-black
     *  (#1A1A1A) on the near-black dark card background — invisible. */
    let rows_html = rows.map(([label, value]) => `
        <div style="display:grid; grid-template-columns: 96px 1fr; column-gap:10px; padding: 2px 0;">
            <span style="color:var(--bulma-text-weak, #6B7280); font-weight:500;">${escapeHtml(String(label))}</span>
            <span style="color:var(--bulma-text-strong, #1A1A1A); word-break:break-all;">${escapeHtml(String(value))}</span>
        </div>
    `).join("");

    $body.innerHTML = rows_html;
}

/************************************************************
 *  Show popover next to the click position.
 *
 *  client_x/client_y are viewport coordinates (evt.client.x/y).
 ************************************************************/
function show_popover(gobj, node_data, client_x, client_y)
{
    let priv = gobj.priv;
    let $popover = priv.$popover;
    let $title = priv.$popover_title;
    let $container = gobj_read_attr(gobj, "$container");
    if(!$popover || !$title || !$container) {
        return;
    }

    priv.popover_node = node_data;

    $title.textContent = node_data.short_name ||
        (node_data.gclass + (node_data.name ? "^" + node_data.name : ""));
    $title.title = $title.textContent;

    render_popover_body(gobj, node_data);

    /*
     *  Position relative to container (absolute positioning inside it)
     */
    let rect = $container.getBoundingClientRect();
    let offset = 10;
    let local_x = client_x - rect.left + offset;
    let local_y = client_y - rect.top + offset;

    $popover.style.display = "block";
    $popover.style.left = local_x + "px";
    $popover.style.top = local_y + "px";

    /*
     *  Nudge back inside if we'd overflow the container on the right or bottom
     */
    let pop_rect = $popover.getBoundingClientRect();
    if(pop_rect.right > rect.right - 4) {
        local_x = (client_x - rect.left) - pop_rect.width - offset;
        if(local_x < 4) {
            local_x = 4;
        }
        $popover.style.left = local_x + "px";
    }
    if(pop_rect.bottom > rect.bottom - 4) {
        local_y = (client_y - rect.top) - pop_rect.height - offset;
        if(local_y < 4) {
            local_y = 4;
        }
        $popover.style.top = local_y + "px";
    }
}

/************************************************************
 *  Hide popover.
 ************************************************************/
function hide_popover(gobj)
{
    let priv = gobj.priv;
    if(priv.$popover) {
        priv.$popover.style.display = "none";
    }
    if(priv.$popover_body) {
        priv.$popover_body.innerHTML = "";
    }
    if(priv.$popover_title) {
        priv.$popover_title.textContent = "";
    }
    priv.popover_node = null;
}

/************************************************************
 *  Generic tree layout engine.
 *
 *  orientation = "V": parents above, children below (y grows down)
 *  orientation = "H": parents on the left, children on the right
 *                     (x grows right)
 *
 *  In both cases nodes are positioned so that the subtree of each
 *  node is centered on its "perpendicular" axis. The "along" axis
 *  advances one level at a time.
 ************************************************************/
function compute_tree_positions(nodes, edges, orientation, gap_along, gap_cross)
{
    let children_map = {};
    let has_parent = new Set();
    for(let edge of edges) {
        if(!children_map[edge.source]) {
            children_map[edge.source] = [];
        }
        children_map[edge.source].push(edge.target);
        has_parent.add(edge.target);
    }

    let roots = nodes.filter(n => !has_parent.has(n.id));
    if(roots.length === 0 && nodes.length > 0) {
        roots = [nodes[0]];
    }

    let node_dims = {};
    for(let node of nodes) {
        let w = (node.style && node.style.size) ? node.style.size[0] : 200;
        let h = (node.style && node.style.size) ? node.style.size[1] : 80;
        node_dims[node.id] = {w, h};
    }

    /*
     *  "cross" is the dimension perpendicular to the tree growth:
     *     V: cross = width, along = height
     *     H: cross = height, along = width
     */
    function cross_of(id)
    {
        if(orientation === "V") {
            return node_dims[id].w;
        }
        return node_dims[id].h;
    }
    function along_of(id)
    {
        if(orientation === "V") {
            return node_dims[id].h;
        }
        return node_dims[id].w;
    }

    let subtree_cross = {};
    function calc_subtree_cross(node_id) {
        let kids = children_map[node_id] || [];
        if(kids.length === 0) {
            subtree_cross[node_id] = cross_of(node_id);
            return subtree_cross[node_id];
        }
        let total = 0;
        for(let i = 0; i < kids.length; i++) {
            if(i > 0) {
                total += gap_cross;
            }
            total += calc_subtree_cross(kids[i]);
        }
        subtree_cross[node_id] = Math.max(total, cross_of(node_id));
        return subtree_cross[node_id];
    }

    for(let root of roots) {
        calc_subtree_cross(root.id);
    }

    let positions = {};
    function position_node(node_id, cross_pos, along_pos) {
        if(orientation === "V") {
            positions[node_id] = {x: cross_pos, y: along_pos};
        } else {
            positions[node_id] = {x: along_pos, y: cross_pos};
        }

        let kids = children_map[node_id] || [];
        if(kids.length === 0) {
            return;
        }

        let total_cross = 0;
        for(let i = 0; i < kids.length; i++) {
            if(i > 0) {
                total_cross += gap_cross;
            }
            total_cross += subtree_cross[kids[i]];
        }

        let child_along = along_pos + along_of(node_id) + gap_along;
        let start_cross = cross_pos - total_cross / 2;

        for(let kid of kids) {
            let kid_c = subtree_cross[kid];
            let kid_cross_pos = start_cross + kid_c / 2;
            position_node(kid, kid_cross_pos, child_along);
            start_cross += kid_c + gap_cross;
        }
    }

    let root_cross = 0;
    for(let root of roots) {
        let rc = subtree_cross[root.id];
        position_node(root.id, root_cross + rc / 2, 0);
        root_cross += rc + gap_cross;
    }

    return nodes.map(node => ({
        id: node.id,
        style: {
            x: positions[node.id] ? positions[node.id].x : 0,
            y: positions[node.id] ? positions[node.id].y : 0,
        },
    }));
}

/************************************************************
 *  Custom tree layout — vertical (top → bottom)
 ************************************************************/
class GobjTreeVLayout extends BaseLayout {
    async execute(data, options) {
        const { nodes = [], edges = [] } = data;
        if(nodes.length === 0) {
            return {nodes: []};
        }
        return {
            nodes: compute_tree_positions(nodes, edges, "V", 50, 20),
        };
    }
}

/************************************************************
 *  Custom tree layout — horizontal (left → right)
 ************************************************************/
class GobjTreeHLayout extends BaseLayout {
    async execute(data, options) {
        const { nodes = [], edges = [] } = data;
        if(nodes.length === 0) {
            return {nodes: []};
        }
        return {
            nodes: compute_tree_positions(nodes, edges, "H", 70, 12),
        };
    }
}

/************************************************************
 *  Lanes layout engine.
 *
 *  Each expanded node reserves its own dedicated lane (row in
 *  the V variant, column in the H variant) for its children;
 *  lanes never get re-used or re-ordered when other nodes
 *  expand. Allocation order is pre-order DFS, so the lane
 *  assignment matches the expansion sequence visible to the
 *  user.
 *
 *  Children of one node form a horizontal cluster centered on
 *  the parent's cross-axis position. Different parents' clusters
 *  may overlap on the cross axis but never on the along axis
 *  (because each lives on its own lane).
 *
 *      orientation = "V":   along = y (rows go top→bottom)
 *                            cross = x
 *      orientation = "H":   along = x (lanes go left→right)
 *                            cross = y
 ************************************************************/
function compute_lane_positions(nodes, edges, orientation, gap_along, gap_cross)
{
    const children_map = {};
    const has_parent = new Set();
    for(const edge of edges) {
        if(!children_map[edge.source]) {
            children_map[edge.source] = [];
        }
        children_map[edge.source].push(edge.target);
        has_parent.add(edge.target);
    }

    let roots = nodes.filter(n => !has_parent.has(n.id));
    if(roots.length === 0 && nodes.length > 0) {
        roots = [nodes[0]];
    }

    const node_dims = {};
    for(const node of nodes) {
        const w = (node.style && node.style.size) ? node.style.size[0] : 200;
        const h = (node.style && node.style.size) ? node.style.size[1] : 80;
        node_dims[node.id] = {w, h};
    }

    function cross_size(id) {
        if(orientation === "V") {
            return node_dims[id].w;
        }
        return node_dims[id].h;
    }
    function along_size(id) {
        if(orientation === "V") {
            return node_dims[id].h;
        }
        return node_dims[id].w;
    }

    /*
     *  Pass 1: pre-order DFS allocation of lane indices.
     *      lane_of[id] = the lane this node sits on.
     *  Each expanded node reserves a fresh lane for its children
     *  using next_lane (which only ever increases).
     */
    const lane_of = {};
    let next_lane = 0;

    function visit(id, lane) {
        lane_of[id] = lane;
        next_lane = Math.max(next_lane, lane + 1);
        const kids = children_map[id] || [];
        if(kids.length > 0) {
            const child_lane = next_lane;
            next_lane = child_lane + 1;
            for(const kid of kids) {
                visit(kid, child_lane);
            }
        }
    }

    for(const root of roots) {
        const root_lane = next_lane;
        next_lane = root_lane + 1;
        visit(root.id, root_lane);
    }

    /*
     *  Pass 2: cross-axis position. Children of a parent are
     *  laid out side-by-side, centered on the parent's cross
     *  position. Roots are seeded at 0.
     */
    const cross_of = {};
    let root_seed = 0;
    for(const root of roots) {
        cross_of[root.id] = root_seed;
        root_seed += cross_size(root.id) + gap_cross;
    }

    function place_children(id) {
        const kids = children_map[id] || [];
        if(kids.length === 0) {
            return;
        }
        let total = 0;
        for(let i = 0; i < kids.length; i++) {
            if(i > 0) {
                total += gap_cross;
            }
            total += cross_size(kids[i]);
        }
        let start = cross_of[id] - total / 2;
        for(const kid of kids) {
            const c = cross_size(kid);
            cross_of[kid] = start + c / 2;
            start += c + gap_cross;
            place_children(kid);
        }
    }
    for(const root of roots) {
        place_children(root.id);
    }

    /*
     *  Pass 3: along-axis position per lane. Each lane gets a
     *  thickness equal to the largest along_size of any node
     *  that lives on it, plus gap_along.
     */
    const lane_thickness = {};
    for(const node of nodes) {
        const lane = lane_of[node.id];
        if(lane === undefined) {
            continue;
        }
        const a = along_size(node.id);
        if(!lane_thickness[lane] || lane_thickness[lane] < a) {
            lane_thickness[lane] = a;
        }
    }

    const lane_along = {};
    let cumul = 0;
    const lane_indices = Object.keys(lane_thickness)
        .map(Number)
        .sort((a, b) => a - b);
    for(const lane of lane_indices) {
        lane_along[lane] = cumul + lane_thickness[lane] / 2;
        cumul += lane_thickness[lane] + gap_along;
    }

    return nodes.map(node => {
        const lane = lane_of[node.id];
        const along = (lane !== undefined) ? lane_along[lane] : 0;
        const cross = (cross_of[node.id] !== undefined) ? cross_of[node.id] : 0;
        if(orientation === "V") {
            return {id: node.id, style: {x: cross, y: along}};
        }
        return {id: node.id, style: {x: along, y: cross}};
    });
}

/************************************************************
 *  Lanes vertical layout — each expansion gets a new row.
 ************************************************************/
class GobjLanesVLayout extends BaseLayout {
    async execute(data, options) {
        const { nodes = [], edges = [] } = data;
        if(nodes.length === 0) {
            return {nodes: []};
        }
        return {
            nodes: compute_lane_positions(nodes, edges, "V", 50, 20),
        };
    }
}

/************************************************************
 *  Lanes horizontal layout — each expansion gets a new column.
 ************************************************************/
class GobjLanesHLayout extends BaseLayout {
    async execute(data, options) {
        const { nodes = [], edges = [] } = data;
        if(nodes.length === 0) {
            return {nodes: []};
        }
        return {
            nodes: compute_lane_positions(nodes, edges, "H", 70, 12),
        };
    }
}




                    /***************************
                     *      Actions
                     ***************************/




/************************************************************
 *
 ************************************************************/
function ac_refresh(gobj, event, kw, src)
{
    save_view_state(gobj);
    refresh_tree(gobj);
    return 0;
}

/************************************************************
 *  {theme: "dark"|"light"} — the app switched theme.
 *
 *  G6 gets the new theme, and the tree is rebuilt: the node/edge
 *  colours are picked from yui_is_dark() as they are drawn, so only a
 *  redraw actually repaints them.
 ************************************************************/
function ac_theme(gobj, event, kw, src)
{
    let priv = gobj.priv;

    priv.theme = kw.theme || yui_theme_now();
    if(priv.graph) {
        priv.graph.setTheme(priv.theme);
    }
    /*  A restyle, not new data: keep the user's zoom/pan. */
    refresh_tree(gobj, {preserve_view: true});

    return 0;
}

/************************************************************
 *  {layout: "<key>"}
 ************************************************************/
function ac_change_layout(gobj, event, kw, src)
{
    let priv = gobj.priv;
    let new_key = kw.layout;
    if(!LAYOUTS[new_key]) {
        return 0;
    }

    gobj_write_str_attr(gobj, "layout", new_key);

    /*
     *  Keep the dropdown in sync if the event came from elsewhere
     */
    if(priv.$layout_select && priv.$layout_select.value !== new_key) {
        priv.$layout_select.value = new_key;
    }

    apply_layout(gobj);
    save_view_state(gobj);

    /*
     *  Rebuild nodes because compact/full HTML differs per layout
     */
    save_view_state(gobj);
    refresh_tree(gobj);

    return 0;
}

/************************************************************
 *  {node_id: "..."}   toggle collapse/expand for one node
 ************************************************************/
function ac_toggle_collapse(gobj, event, kw, src)
{
    let priv = gobj.priv;
    let node_id = kw.node_id;
    if(!node_id || !priv.node_by_id) {
        return 0;
    }
    let node_data = priv.node_by_id[node_id];
    if(!node_data || !node_data.full_name) {
        return 0;
    }
    if(!node_data.num_children) {
        return 0;
    }

    if(!priv.collapse_state) {
        priv.collapse_state = {};
    }

    /*
     *  Capture the anchor BEFORE changing state — we want the clicked
     *  node to stay at the same screen position after the rebuild.
     */
    let anchor = capture_anchor(gobj, node_id);

    /*
     *  Flip the effective state (handles auto-collapse by threshold too)
     */
    let currently_collapsed = is_node_collapsed(
        gobj, node_data.full_name, node_data.num_children
    );

    if(currently_collapsed) {
        /*
         *  Expanding: reveal ONLY the next level. Force every direct
         *  child that has grandchildren to render as collapsed, so
         *  thresholded auto-expansion down the subtree does not kick in.
         *  The user can drill further by clicking their own `+`.
         */
        priv.collapse_state[node_data.full_name] = "expanded";
        for(let child_info of (node_data.direct_children || [])) {
            if(child_info.has_grandchildren) {
                priv.collapse_state[child_info.full_name] = "collapsed";
            }
        }
    } else {
        priv.collapse_state[node_data.full_name] = "collapsed";
    }

    save_view_state(gobj);
    refresh_tree(gobj, {anchor: anchor});
    return 0;
}

/************************************************************
 *  Force every node visible (overrides threshold).
 ************************************************************/
function ac_expand_all(gobj, event, kw, src)
{
    let priv = gobj.priv;
    if(!priv.collapse_state) {
        priv.collapse_state = {};
    }
    /*
     *  Walk the current nodes and mark every one with children
     *  as explicitly expanded. Nodes encountered later (after the
     *  tree grows) default to expanded if threshold is 0, or will
     *  auto-collapse otherwise — acceptable compromise.
     */
    if(priv.node_by_id) {
        for(let id of Object.keys(priv.node_by_id)) {
            let nd = priv.node_by_id[id];
            if(nd.full_name && nd.num_children > 0) {
                priv.collapse_state[nd.full_name] = "expanded";
            }
        }
    }
    refresh_tree(gobj, {preserve_view: true});
    return 0;
}

/************************************************************
 *  Collapse every node that has children.
 ************************************************************/
function ac_collapse_all(gobj, event, kw, src)
{
    let priv = gobj.priv;
    if(!priv.collapse_state) {
        priv.collapse_state = {};
    }
    if(priv.node_by_id) {
        for(let id of Object.keys(priv.node_by_id)) {
            let nd = priv.node_by_id[id];
            if(nd.full_name && nd.num_children > 0) {
                priv.collapse_state[nd.full_name] = "collapsed";
            }
        }
    }
    refresh_tree(gobj, {preserve_view: true});
    return 0;
}

/************************************************************
 *   Every camera action ends the same way once an anchor is
 *   set: the thing you were reading goes back to the middle.
 *
 *   Chained on the promise G6 returns rather than run beside it
 *   -- centring before the zoom has finished centres the OLD
 *   view, and the reader watches the node slide away and come
 *   back.
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
 *   Point the anchor back at its node after a rebuild.
 *
 *   Node ids are generated per build, so the id the reader chose
 *   does not survive an expand, a collapse or a refresh -- the
 *   `full_name` does, and it is what the anchor really means:
 *   "this gobj", not "this card".
 *
 *   A gobj no longer drawn (its branch got collapsed, or it went
 *   away) releases the anchor rather than leaving a button that
 *   claims to be locked onto something invisible.
 ************************************************************/
function reanchor(gobj)
{
    let priv = gobj.priv;

    if(priv.anchor_state !== "on" || !priv.anchor_name) {
        return;
    }

    let found = "";
    if(priv.node_by_id) {
        for(let id of Object.keys(priv.node_by_id)) {
            if(priv.node_by_id[id].full_name === priv.anchor_name) {
                found = id;
                break;
            }
        }
    }

    priv.anchor_id = found;
    if(!found) {
        priv.anchor_state = "off";
        priv.anchor_name = "";
    }
    yui_graph_update_anchor(gobj_read_attr(gobj, "$container"), priv.anchor_state);
}

/************************************************************
 *   Centre on the anchor, one cycle after it was chosen.
 ************************************************************/
function ac_center_anchor(gobj, event, kw, src)
{
    let priv = gobj.priv;

    paint_anchor_mark(gobj);
    save_view_state(gobj);
    if(priv.anchor_state === "on" && priv.anchor_id) {
        yui_graph_center_on(priv.graph, priv.anchor_id);
    }
    return 0;
}

/************************************************************
 *   Mark the card the camera is holding.
 *
 *   A class on the card's own element and not a G6 node state:
 *   G6 paints no state style on an html node.
 *
 *   Re-applied after every rebuild, because the cards are new
 *   DOM each time and the mark would otherwise last until the
 *   next expand.
 ************************************************************/
function paint_anchor_mark(gobj)
{
    let priv = gobj.priv;
    let $container = gobj_read_attr(gobj, "$container");

    if(!$container) {
        return;
    }
    for(let $card of $container.querySelectorAll('.GOBJ_CARD_ANCHORED')) {
        $card.classList.remove('GOBJ_CARD_ANCHORED');
    }
    if(priv.anchor_state !== "on" || !priv.anchor_name) {
        return;
    }
    let $it = $container.querySelector(
        '.GOBJ_CARD[data-gobj-name="' + CSS.escape(priv.anchor_name) + '"]'
    );
    if($it) {
        $it.classList.add('GOBJ_CARD_ANCHORED');
    }
}

/************************************************************
 *   Reading, or picking the node to anchor.
 ************************************************************/
function set_picking_mode(gobj, picking)
{
    let graph = gobj.priv.graph;

    if(graph && typeof graph.setBehaviors === "function") {
        graph.setBehaviors((picking? BEHAVIORS_PICKING: BEHAVIORS_READING).slice());
    }

    let $container = gobj_read_attr(gobj, "$container");
    let $mount = $container? $container.querySelector('.gobj-tree-container'): null;
    if($mount) {
        $mount.classList.toggle('GOBJ_TREE_PICKING', !!picking);
    }
}

/************************************************************
 *   Arm the anchor, or let it go.
 *
 *   Three states and one button, so a press ADVANCES: with no
 *   target it starts waiting for one, and with a target it
 *   releases.  Pressing it while it waits is a cancel, which is
 *   what somebody who pressed it by mistake will try.
 ************************************************************/
function ac_toggle_anchor(gobj, event, kw, src)
{
    let priv = gobj.priv;

    if(priv.anchor_state === "off") {
        priv.anchor_state = "arming";
    } else {
        priv.anchor_state = "off";
        priv.anchor_id = "";
        priv.anchor_name = "";
    }

    yui_graph_update_anchor(gobj_read_attr(gobj, "$container"), priv.anchor_state);
    set_picking_mode(gobj, priv.anchor_state === "arming");
    paint_anchor_mark(gobj);
    save_view_state(gobj);
    return 0;
}

/************************************************************
 *
 ************************************************************/
function ac_zoom_in(gobj, event, kw, src)
{
    let graph = gobj.priv.graph;
    if(graph) {
        let z = graph.getZoom();
        after_camera(gobj, graph.zoomTo(z * 1.2));
    }
    return 0;
}

/************************************************************
 *
 ************************************************************/
function ac_zoom_out(gobj, event, kw, src)
{
    let graph = gobj.priv.graph;
    if(graph) {
        let z = graph.getZoom();
        after_camera(gobj, graph.zoomTo(z * 0.8));
    }
    return 0;
}

/************************************************************
 *
 ************************************************************/
function ac_zoom_reset(gobj, event, kw, src)
{
    let priv = gobj.priv;
    let graph = priv.graph;

    if(graph && graph.rendered) {
        /*
         *  With an anchor, actual size means "this node, life size".
         *  Without one it means the layout's origin, which is where
         *  `1:1` always landed -- a corner nobody was looking at.
         */
        if(priv.anchor_state === "on" && priv.anchor_id) {
            after_camera(gobj, graph.zoomTo(1));
        } else {
            graph.zoomTo(1);
            graph.translateTo([0, 0]);
        }
    }
    return 0;
}

/************************************************************
 *
 ************************************************************/
function ac_center(gobj, event, kw, src)
{
    let graph = gobj.priv.graph;
    if(graph) {
        graph.fitCenter();
        graph.fitView();
    }
    return 0;
}

/************************************************************
 *
 ************************************************************/
function ac_node_click(gobj, event, kw, src)
{
    let priv = gobj.priv;
    let graph = priv.graph;
    let node_id = kw.evt.target.id;

    /*
     *  Prefer our own cached node_data (richer) and fall back to
     *  what the graph exposes.
     */
    let node_data = (priv.node_by_id && priv.node_by_id[node_id]) || null;
    if(!node_data) {
        try {
            let nd = graph.getNodeData(node_id);
            if(nd && nd.data) {
                node_data = nd.data;
            }
        } catch(e) {}
    }

    if(!node_data) {
        return 0;
    }

    /*
     *  A waiting anchor TAKES the click: it is what the reader armed
     *  the button for, and letting the same press also open the
     *  popover would make picking a target a side effect of doing
     *  something else.
     */
    if(priv.anchor_state === "arming") {
        priv.anchor_id = node_id;
        priv.anchor_name = node_data.full_name || "";
        priv.anchor_state = "on";
        yui_graph_update_anchor(gobj_read_attr(gobj, "$container"), priv.anchor_state);
        set_picking_mode(gobj, false);

        /*  POSTED, not made here: a camera move issued inside G6's click
         *  dispatch is swallowed -- see the note in yui_graph_center_on.
         *  An event to itself and not a timer: a deferral is not a TIME.  */
        gobj_post_event(gobj, "EV_CENTER_ANCHOR", {}, gobj);
        return 0;
    }

    /*
     *  Show popover at click position
     */
    let client_x = (kw.evt && kw.evt.client) ? kw.evt.client.x : 0;
    let client_y = (kw.evt && kw.evt.client) ? kw.evt.client.y : 0;
    show_popover(gobj, node_data, client_x, client_y);

    return 0;
}

/************************************************************
 *
 ************************************************************/
function ac_show(gobj, event, kw, src)
{
    let priv = gobj.priv;
    let graph = priv.graph;

    /*
     *  Always refresh on show: the tree may have changed while hidden
     */
    save_view_state(gobj);
    refresh_tree(gobj);

    if(graph) {
        let $canvas = canvas_mount(gobj);
        if($canvas) {
            /*
             *  Content box (clientWidth/Height), not getBoundingClientRect:
             *  @antv/g lays the canvas into the element's content area and
             *  getScale() compares bbox.width / offsetWidth.  Sizing to the
             *  content box keeps that ratio at exactly 1 (no border / sub-px
             *  drift) so drag-canvas panning stays 1:1.
             */
            let cw = $canvas.clientWidth;
            let ch = $canvas.clientHeight;
            if(cw > 0 && ch > 0) {
                graph.setSize(cw, ch);
                graph.render().then(() => {
                    graph.fitView();
                });
            }
        }
    }

    return 0;
}

/************************************************************
 *  Keep the canvas size in sync with its on-screen box.
 *  No fitView: preserve the user's current pan/zoom.
 ************************************************************/
function ac_resize(gobj, event, kw, src)
{
    let priv = gobj.priv;
    let graph = priv.graph;

    if(graph) {
        let $canvas = canvas_mount(gobj);
        if($canvas) {
            let cw = $canvas.clientWidth;
            let ch = $canvas.clientHeight;
            if(cw > 0 && ch > 0) {
                graph.setSize(cw, ch);
            }
        }
    }

    return 0;
}

/************************************************************
 *
 ************************************************************/
function ac_hide(gobj, event, kw, src)
{
    hide_popover(gobj);
    return 0;
}

/************************************************************
 *  Open the gclass of the node the popover is showing.
 *
 *  One window at a time: opening a second gclass replaces the
 *  first rather than stacking windows nobody closes.
 ************************************************************/
function ac_open_gclass(gobj, event, kw, src)
{
    let priv = gobj.priv;
    let node_data = priv.popover_node;

    if(!node_data || !node_data.gclass) {
        log_error(`${gobj_short_name(gobj)}: EV_OPEN_GCLASS with no node`);
        return -1;
    }

    close_gclass_view(priv.gclass_view);
    priv.gclass_view = null;

    priv.gclass_view = open_gclass_view(gobj, node_data.gclass, {
        title_prefix: gobj_yuno_name() || "",
        on_close: () => {
            if(gobj_is_destroying(gobj)) {
                return;
            }
            gobj_send_event(gobj, "EV_GCLASS_CLOSED", {}, gobj);
        },
    });

    return 0;
}

/************************************************************
 *  The reader dismissed the gclass window (its own ✕).
 *
 *  C_YUI_WINDOW.close_window() calls on_close and THEN destroys
 *  itself, so here we only drop our reference -- destroying it
 *  again would destroy it twice.
 ************************************************************/
function ac_gclass_closed(gobj, event, kw, src)
{
    gobj.priv.gclass_view = null;
    return 0;
}

/************************************************************
 *  The gclass viewer asked for a subtree.
 *
 *  It cannot: the gclass description is a COMPLETE document,
 *  it carries no `__collapsed__` stub, so nothing in it is
 *  fetchable. The event is declared because the viewer is
 *  hosted as a child and subscribes its host to everything it
 *  publishes -- and it is logged, because arriving here means
 *  the document was not the one we built.
 ************************************************************/
function ac_gclass_expand_path(gobj, event, kw, src)
{
    log_error(
        `${gobj_short_name(gobj)}: EV_EXPAND_PATH on a complete document: ` +
        `${kw && kw.path}`
    );
    return -1;
}

/************************************************************
 *  The app switched language.
 *
 *  A rebuild, not a re-translation: the words live inside the
 *  innerHTML of G6 nodes, where refresh_language() cannot go.
 ************************************************************/
function ac_language_changed(gobj, event, kw, src)
{
    let $container = gobj_read_attr(gobj, "$container");
    if($container) {
        refresh_language($container, t);
    }
    hide_popover(gobj);
    refresh_tree(gobj);
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
            ["EV_REFRESH",              ac_refresh,             null],
            ["EV_THEME",                ac_theme,               null],
            ["EV_CHANGE_LAYOUT",        ac_change_layout,       null],
            ["EV_TOGGLE_COLLAPSE",      ac_toggle_collapse,     null],
            ["EV_EXPAND_ALL",           ac_expand_all,          null],
            ["EV_COLLAPSE_ALL",         ac_collapse_all,        null],
            ["EV_ZOOM_IN",              ac_zoom_in,             null],
            ["EV_ZOOM_OUT",             ac_zoom_out,            null],
            ["EV_ZOOM_RESET",           ac_zoom_reset,          null],
            ["EV_CENTER",               ac_center,              null],
            ["EV_NODE_CLICK",           ac_node_click,          null],
            ["EV_TOGGLE_ANCHOR",        ac_toggle_anchor,       null],
            ["EV_CENTER_ANCHOR",        ac_center_anchor,       null],
            ["EV_RESIZE",               ac_resize,              null],
            ["EV_SHOW",                 ac_show,                null],
            ["EV_HIDE",                 ac_hide,                null],
            ["EV_OPEN_GCLASS",          ac_open_gclass,         null],
            ["EV_GCLASS_CLOSED",        ac_gclass_closed,       null],
            ["EV_EXPAND_PATH",          ac_gclass_expand_path,  null],
            ["EV_LANGUAGE_CHANGED",     ac_language_changed,    null],
        ]]
    ];

    /*---------------------------------------------*
     *          Events
     *---------------------------------------------*/
    const event_types = [
        ["EV_REFRESH",              0],
        ["EV_THEME",                0],
        ["EV_CHANGE_LAYOUT",        0],
        ["EV_TOGGLE_COLLAPSE",      0],
        ["EV_EXPAND_ALL",           0],
        ["EV_COLLAPSE_ALL",         0],
        ["EV_ZOOM_IN",              0],
        ["EV_ZOOM_OUT",             0],
        ["EV_ZOOM_RESET",           0],
        ["EV_CENTER",               0],
        ["EV_NODE_CLICK",           0],
        ["EV_TOGGLE_ANCHOR",        0],
        ["EV_CENTER_ANCHOR",        0],
        ["EV_RESIZE",               0],
        ["EV_SHOW",                 0],
        ["EV_HIDE",                 0],
        ["EV_OPEN_GCLASS",          0],
        ["EV_GCLASS_CLOSED",        0],
        ["EV_EXPAND_PATH",          0],
        ["EV_LANGUAGE_CHANGED",     0],
    ];

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
function register_c_yui_gobj_tree_js()
{
    return create_gclass(GCLASS_NAME);
}

export { register_c_yui_gobj_tree_js };
