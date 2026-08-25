/***********************************************************************
 *          c_yui_json_graph.js
 *
 *          JSON Graph Viewer with AntV/G6
 *          Displays JSON data as a hierarchical graph visualization
 *          Migrated from mx_json_viewer.js (mxGraph)
 *
 *          Copyright (c) 2025, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {
    SDATA,
    SDATA_END,
    data_type_t,
    sdata_flag_t,
    event_flag_t,
    gclass_create,
    gclass_find_by_name,
    log_error,
    gobj_read_pointer_attr,
    gobj_parent,
    gobj_subscribe_event,
    gobj_name,
    clean_name,
    gobj_read_attr,
    gobj_write_attr,
    gobj_send_event,
    gobj_find_service,
    gobj_short_name,
    gobj_read_str_attr,
    gobj_write_str_attr,
    gobj_publish_event,
    gobj_save_persistent_attrs,
    gobj_read_bool_attr,
    createElement2,
    is_string,
    is_array,
    is_object,
    is_number,
    is_boolean,
    is_null,
    json_object_size,
    json_deep_copy,
    empty_string,
    escapeHtml,
    refresh_language,
} from "@yuneta/gobj-js";

import {yui_toolbar} from "./yui_toolbar.js";
import {attach_clear} from "./yui_inputs.js";
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
import {
    is_pure_collection,
    has_branch,
    count_branches,
} from "./json_view_helpers.js";

/***************************************************************
 *              Constants
 ***************************************************************/
const GCLASS_NAME = "C_YUI_JSON_GRAPH";

/*
 *  What a click on a fold handle has to swallow so G6 never turns it
 *  into a node click.  `click` is the one that ACTS; the rest are cut
 *  because G6 assembles its own click from the pointer sequence.
 */
const FOLD_SWALLOWED_EVENTS = ["pointerdown", "pointerup", "mousedown", "click"];

/*
 *  Layouts, same shape the gobj tree's registry uses
 *  (`c_yui_gobj_tree_js.js`): a G6 layout config plus the edge type
 *  that matches its direction — a vertical layout with horizontal
 *  cubics draws every edge going the wrong way round.
 *
 *  `json-tree` is this gclass's own layout, the one it always had, and
 *  it stays the default: it sizes each level from the real card widths,
 *  which a generic layout cannot do with `html` nodes.  The dagre pair
 *  is there for the documents it does badly — a wide, shallow object
 *  reads better left→right, which is also the house direction for a
 *  topology.
 */
const LAYOUTS = {
    "json-tree": {
        label: "vertical tree",
        g6_layout: {type: 'json-tree-layout'},
        edge_type: 'cubic-vertical',
    },
    "dagre-tb": {
        label: "dagre top-down",
        g6_layout: {type: 'antv-dagre', rankdir: 'TB', nodesep: 20, ranksep: 40},
        edge_type: 'polyline',
    },
    "dagre-lr": {
        label: "dagre left-right",
        g6_layout: {type: 'antv-dagre', rankdir: 'LR', nodesep: 20, ranksep: 40},
        edge_type: 'polyline',
    },
    /*  `compact-box` is NOT here on purpose: it lays out from a fixed
     *  node size, and an `html` card is nothing like it — every card
     *  landed on top of the next.  A layout that draws the document
     *  unreadable is worse than one option fewer.  dagre reads the real
     *  sizes, which is why both of its directions are here.  */
};

const DEFAULT_LAYOUT = "json-tree";

function get_layout_cfg(key)
{
    return LAYOUTS[key] || LAYOUTS[DEFAULT_LAYOUT];
}

/************************************************************
 *  A layout's label, with every key SPELLED OUT inside t().
 *
 *  Never t(LAYOUTS[key].label) nor a `data-i18n` fed from that
 *  table: the apps' validate-locales scans for t("literal"),
 *  so a key reached through a variable is a key it cannot
 *  demand — and i18next answers an undefined key with the key
 *  itself, which renders in lower-case English and never
 *  changes language.  Twice already in this component's
 *  history (7.20.0 `tree view`, and this table on its first
 *  draft).
 ************************************************************/
function layout_label(key)
{
    switch(key) {
        case "dagre-tb":
            return t("dagre top-down");
        case "dagre-lr":
            return t("dagre left-right");
        default:
            return t("vertical tree");
    }
}

/***************************************************************
 *              Data
 ***************************************************************/
const attrs_table = [
/*---------------- Public Attributes ----------------*/
SDATA(data_type_t.DTP_POINTER,  "subscriber",       0,  null,   "Subscriber of output events"),

/*---------------- Data ----------------*/
SDATA(data_type_t.DTP_STRING,   "path",             0,  "",     "Root path label"),
SDATA(data_type_t.DTP_JSON,     "json_data",        0,  null,   "JSON data to visualize"),

/*---------------- Sub-container ----------------*/
SDATA(data_type_t.DTP_POINTER,  "$container",       0,  null,   "Container element"),
SDATA(data_type_t.DTP_STRING,   "canvas_id",        0,  "",     "Canvas ID"),

/*---------------- Graph Settings ----------------*/
SDATA(data_type_t.DTP_STRING,   "wide",             0,  "36px", "Height of header"),
SDATA(data_type_t.DTP_STRING,   "layout",           0,  "json-tree", "Layout key (see LAYOUTS)"),

SDATA_END()
];

let PRIVATE_DATA = {
    canvas_id: "",
    graph: null,
    node_counter: 0,
    theme: null,
    theme_observer: null,   // MutationObserver on <html data-theme>
    resize_observer: null,  // ResizeObserver on the canvas mount element
    _resize_raf: 0,         // rAF id debouncing resize -> EV_RESIZE

    /*---------------- find + collapse ----------------*/
    search:         "",     // current find term, lower-cased
    collapsed:      null,   // Set<string> of paths whose children are hidden
    match_count:    0,      // matches of the last find, for the count chip
    find_timer:     null,   // rate-limits the find box
    fold_listener:  null,   // delegated click on the card fold handles
    $layout_select: null,   // the layout picker
    $find_input:    null,
    $find_result:   null,
    $find_count:    null,

    /*---------------- camera anchor ----------------*/
    anchor_id:      "",     // the node the camera keeps in the middle
    anchor_path:    "",     // its path, so a rebuild can find it again
    anchor_state:   "off",  // "off" | "arming" | "on"
    last_zoom:      1,      // tells a wheel zoom from a drag in aftertransform
};

let __gclass__ = null;
let __layout_registered__ = false;


/***************************************************************
 *  Type colours, ONE EXPLICIT PALETTE PER THEME and not a
 *  derivation, for the same reason the tree keeps two sets of
 *  CSS tokens: a colour that reads on white is not the same
 *  colour lightened, and deriving one from the other made the
 *  two views of one document disagree about what a string is.
 *  These ARE the tree's tokens (`c_yui_json.css`), so the tree
 *  and the graph now say green with the same green.
 *
 *  The light values are darker than the `mx_json_viewer` ones
 *  they came from, because those could not be read: `#FF8C00`
 *  is mid-luminance, so it reaches at most **2.33:1 against any
 *  background that exists** -- no card colour and no highlight
 *  could have fixed it, only the colour itself. Orange and blue
 *  moved until every type clears 4.5:1 on all five surfaces this
 *  viewer paints (two light cards, the match chip, two dark
 *  cards); red and green were already there.
 ***************************************************************/
const TYPE_COLORS_LIGHT = {
    string:  "#006000",     // green
    number:  "#b5330b",     // red
    boolean: "#8C4D00",     // orange
    null:    "#4359C6",     // blue
    list:    "#4C0099",     // purple
    dict:    "#4C0099",     // purple
};

const TYPE_COLORS_DARK = {
    string:  "#7ec87e",
    number:  "#ff8a65",
    boolean: "#ffb74d",
    null:    "#90a4f4",
    list:    "#B799D6",
    dict:    "#B799D6",
};

/***************************************************************
 *  Group (card) colours. `fill` is the light-theme card; `tint`
 *  is the hue that fill hints at, used to derive the dark card —
 *  dict and list share a stroke, so the tint is what keeps them
 *  apart at a glance (with the dashed/solid border).
 ***************************************************************/
const GROUP_COLORS = {
    dict: {fill: "#FBFBFB", tint: "#006658", stroke: "#006658"},
    list: {fill: "#fffbd1", tint: "#ffd54a", stroke: "#006658"},
};

/***************************************************************
 *  Soft, theme-aware card palette, same visual language as the
 *  gobj-tree's role_card_style(): a near-neutral fill and a
 *  group-colour border.
 *
 *  The SURFACE stays out of the hue, on both themes, and that is
 *  the whole rule here.  The light card is near-white and lets
 *  saturated dark text carry the colour; the dark card is its
 *  mirror -- a near-neutral dark surface under bright text -- and
 *  the group's hue lives in the border and the header bar, which
 *  is where the light theme had always put it.
 *
 *  It shipped tinting the dark surface 30% instead, and that put
 *  green values on a green card.  Worse, `list` (a yellow tint)
 *  landed mid-luminance, a muddy olive where nothing contrasted
 *  with anything: its purple values measured 1.60:1, against 11.48
 *  for the same values on the light card.  The 12% left is enough
 *  to tell a dict card from a list one and not enough to fight the
 *  text.
 *
 *  The header bar is always the border colour, so its text flips:
 *  white on the dark-teal light bar, near-black on the brightened
 *  dark one.  The dark bar is mixed lighter than the border used
 *  to be so that near-black reads on it (6.87:1, which is what
 *  white gets on the light bar).
 ***************************************************************/
function json_card_style(group, dark)
{
    return {
        bg: dark
            ? `color-mix(in srgb, ${group.tint} 12%, #1E242E)`
            : group.fill,
        border: dark
            ? `color-mix(in srgb, ${group.stroke} 55%, #ffffff)`
            : group.stroke,
        header_fg: dark ? "#12181f" : "#ffffff",
        key: dark ? "#c9cfd8" : "#1A1A1A",
    };
}

/***************************************************************
 *  A scalar's colour by type, straight out of the palette for
 *  the theme.  It used to be the light colour mixed with white,
 *  which is how a document ended up green in one view and a
 *  paler green in the other, and how the amount of white became
 *  a knob nobody could set: enough of it to read on a dark card
 *  washed the six types into one pastel.
 ***************************************************************/
function type_color(type, dark)
{
    let palette = dark? TYPE_COLORS_DARK: TYPE_COLORS_LIGHT;
    return palette[type] || (dark ? "#e8eaed" : "black");
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

    priv.collapsed = new Set();
    priv.search = "";

    let name = clean_name(gobj_name(gobj));
    priv.canvas_id = "json-canvas-" + name;
    gobj_write_str_attr(gobj, "canvas_id", priv.canvas_id);

    /*
     *  CHILD subscription model
     */
    let subscriber = gobj_read_pointer_attr(gobj, "subscriber");
    if(!subscriber) {
        subscriber = gobj_parent(gobj);
    }
    gobj_subscribe_event(gobj, null, {}, subscriber);

    /*  Follow the app theme. This used to read a legacy C_YUI_MAIN
     *  "__yui_main__" service's `theme` attr — and looked it up with
     *  verbose=true, so under C_YUI_SHELL (which has no such service) it
     *  logged "gobj service not found: __yui_main__" on every mount. It
     *  never watched either, so the theme was read once. Watch
     *  <html data-theme> and restyle in ac_theme. */
    priv.theme = yui_theme_now();
    priv.theme_observer = yui_watch_theme(gobj);

    build_ui(gobj);

    ensure_drag_canvas_patch();
    ensure_pinch_zoom_patch();

    if(!__layout_registered__) {
        register(ExtensionCategory.LAYOUT, 'json-tree-layout', JsonTreeLayout);
        __layout_registered__ = true;
    }
}

/***************************************************************
 *          Framework Method: Start
 ***************************************************************/
function mt_start(gobj)
{
    build_graph(gobj);
    load_json(gobj);
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
    if(gobj.priv.find_timer) {
        clearTimeout(gobj.priv.find_timer);
        gobj.priv.find_timer = null;
    }
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
        ['div', {class: 'C_YUI_JSON_GRAPH', style: 'height:100%; display:flex; flex-direction:column;'}, [
            ['div', {class: 'is-flex-grow-0 is-flex toolbar_yui_json_graph'}, $toolbar],
            ['div', {class: 'is-flex-grow-1', style: 'height:100%; min-height:0; overflow:hidden;'}, [
                ['div', {id: priv.canvas_id, class: 'json-graph-container', style: 'height:100%; min-height:0; border: 1px solid var(--bulma-border-weak); border-radius:0.2rem;'}, [
                ]]
            ]]
        ]]
    );

    gobj_write_attr(gobj, "$container", $container);

    /*
     *  The fold handles live inside an `innerHTML` string, so no handler
     *  can be attached to them: the click is delegated from the canvas
     *  mount, in the CAPTURE phase, over FOUR event types.
     *
     *  Capture because G6 binds on the html node ELEMENT, a descendant
     *  of this one: in the bubble phase G6 has already run by the time
     *  this listener sees the event, so stopping it there stops nothing.
     *
     *  Four types because G6 does not use the DOM `click` at all — it
     *  builds its own from the POINTER sequence.  Swallowing `click`
     *  alone left the fold working and the card ALSO reporting an item
     *  click; `pointerdown`/`pointerup` are the pair that has to be cut,
     *  and `mousedown` goes with them for a browser that still sends it.
     *  Measured by instrumenting the mount, not guessed.
     */
    let $mount = $container.querySelector('#' + priv.canvas_id);
    if($mount) {
        priv.fold_listener = function(evt) {
            let $handle = evt.target && evt.target.closest
                ? evt.target.closest('[data-fold-path]')
                : null;
            if(!$handle) {
                return;
            }
            evt.stopPropagation();
            evt.preventDefault();
            if(evt.type !== "click") {
                return;     /*  swallowed so G6 never sees a node click  */
            }
            gobj_send_event(gobj, "EV_TOGGLE_FOLD",
                {path: $handle.getAttribute('data-fold-path')}, gobj);
        };
        for(let type of FOLD_SWALLOWED_EVENTS) {
            $mount.addEventListener(type, priv.fold_listener, true);
        }
    } else {
        log_error(`${gobj_short_name(gobj)}: no canvas mount, fold handles are dead`);
    }

    priv.$layout_select = $container.querySelector('.JSON_GRAPH_LAYOUT');
    priv.$find_input = $container.querySelector('.JSON_GRAPH_FIND_INPUT');
    priv.$find_result = $container.querySelector('.JSON_GRAPH_FIND_RESULT');
    priv.$find_count = $container.querySelector('.JSON_GRAPH_FIND_COUNT');

    refresh_language($container, t);
}

/************************************************************
 *   Destroy UI
 ************************************************************/
function destroy_ui(gobj)
{
    let priv = gobj.priv;
    let $container = gobj_read_attr(gobj, "$container");

    if(priv.fold_listener) {
        let $mount = $container? $container.querySelector('#' + priv.canvas_id): null;
        if($mount) {
            for(let type of FOLD_SWALLOWED_EVENTS) {
                $mount.removeEventListener(type, priv.fold_listener, true);
            }
        }
        priv.fold_listener = null;
    }

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

    /*
     *  Left: find a node.
     *
     *  A graph of a large document has no other way in — the only way to
     *  locate a key was to read every card.  Same shape as the treedb
     *  graph's box: a rate-limited input into EV_FIND_NODES, and a count
     *  that SAYS how many matched, because a graph that did not move
     *  looks the same whether nothing matched or the match was already
     *  on screen.
     */
    /*  Materialised, not a spec: attach_clear() hangs the NORM clear (✕)
     *  on a real element.  Clearing dispatches a synthetic `input`, which
     *  goes through the same rate-limited handler and fires EV_FIND_NODES
     *  with an empty term — the box and the highlight clear together.  */
    let $find_input = createElement2(
        ['input', {
            class: 'JSON_GRAPH_FIND_INPUT input',
            type: 'text',
            /*  A placeholder is not a text node, so the data-i18n walk
             *  cannot reach it: it needs its own key. */
            placeholder: t('search'),
            'data-i18n-placeholder': 'search',
            'aria-label': t('search'),
            'data-i18n-aria-label': 'search'
        }, [], {
            /*  Rate-limited, not delayed for effect: every keystroke
             *  REBUILDS the cards — an html node paints no G6 state, so
             *  the highlight has to live in the card's own markup — and
             *  the first letter typed can match most of a document. */
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
        ['div', {class: 'JSON_GRAPH_FIND control has-icons-left',
                 style: 'margin-right:.5rem; max-width:12rem; min-width:7rem;'}, [
            $find_input,
            ['span', {class: 'icon is-left'}, [['i', {class: 'yi-magnifying-glass'}]]]
        ]]);
    attach_clear($find_control, $find_input);

    /*
     *  Left: the global fold leads the row, then find a node.
     *
     *  A graph of a large document has no other way in — the only way to
     *  locate a key was to read every card.  The count SAYS how many
     *  matched, because a graph that did not move looks the same whether
     *  nothing matched or the match was already on screen.
     */
    let left_items = yui_graph_fold_items(gobj, toolbar_wide).concat([
        $find_control,
        /*  Two spans, not one string: the number is DATA and "matches"
         *  is the word, so a language switch re-translates the half that
         *  is a word.  `display:flex` inline and NOT the `is-flex`
         *  helper — both Bulma helpers carry !important, so
         *  `is-hidden is-flex` on one element is decided by stylesheet
         *  order. */
        ['div', {class: 'JSON_GRAPH_FIND_RESULT is-hidden',
                 style: 'display:flex; align-items:center; gap:.3rem; ' +
                        'margin-right:.5rem; font-size:.85rem;'}, [
            ['span', {class: 'JSON_GRAPH_FIND_COUNT'}, ''],
            ['span', {i18n: 'matches'}, 'matches']
        ]]
    ]);
    let center_items = [];

    /*
     *  The camera and the fold pair come from yui_graph_camera.js: the
     *  same drawings the gobj tree uses, because the two graphs sit in
     *  the same console and a copied toolbar drifts.
     */
    center_items = yui_graph_camera_items(gobj, priv.graph, toolbar_wide);
    center_items.push(yui_graph_anchor_item(gobj, toolbar_wide));
    center_items.push(yui_graph_refresh_item(gobj, toolbar_wide));

    /*
     *  Right: fold the tree.
     *
     *  A JSON graph of anything real is mostly cards nobody is looking
     *  at.  "Collapse all" leaves the root and marks every cut with a
     *  count, so the shape stays legible and you can see WHERE the rest
     *  went; "expand all" puts it back.  Same chevron as the lazy tree,
     *  rotated to point down for the open state.
     */
    /*
     *  A layout picker, same shape as the gobj tree's.  One layout
     *  cannot serve every document: the built-in one sizes each level
     *  from the real card widths, dagre packs a wide shallow object
     *  far better, and left→right is the house direction for reading a
     *  topology.
     */
    let current_layout = gobj_read_str_attr(gobj, "layout") || DEFAULT_LAYOUT;
    let options = Object.keys(LAYOUTS).map(function(key) {
        let attrs = {value: key, 'data-i18n': LAYOUTS[key].label};
        if(key === current_layout) {
            attrs.selected = "selected";
        }
        return ['option', attrs, layout_label(key)];
    });

    let $layout_select = createElement2(
        ['select', {
            class: 'JSON_GRAPH_LAYOUT select',
            style: {height: toolbar_wide, "margin-left": "0.5em"},
            title: t("layout"), 'data-i18n-title': "layout",
            'aria-label': t("layout"), 'data-i18n-aria-label': "layout"
        }, options, {
            change: (evt) => {
                evt.stopPropagation();
                gobj_send_event(gobj, "EV_CHANGE_LAYOUT", {layout: evt.target.value}, gobj);
            }
        }]
    );

    let right_items = [$layout_select];

    const $toolbar = yui_toolbar({}, [
        ['div', {class: 'yui-horizontal-toolbar-section left'}, left_items],
        ['div', {class: 'yui-horizontal-toolbar-section center'}, center_items],
        ['div', {class: 'yui-horizontal-toolbar-section right'}, right_items],
    ]);

    refresh_language($toolbar, t);
    return $toolbar;
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
                stroke: '#999',
                lineWidth: 1,
                endArrow: true,
            },
        },

        layout: layout_cfg.g6_layout,

        behaviors: [
            'drag-canvas',
            'zoom-canvas',
        ],
    });

    if(priv.theme) {
        graph.setTheme(priv.theme);
    }

    graph.on(NodeEvent.CLICK, (evt) => {
        gobj_send_event(gobj, "EV_NODE_CLICK", {evt: evt}, gobj);
    });

    /*  ONE hook for the readout, the same one the treedb graph uses:
     *  G6 fires it on any camera change, and the WHEEL is a camera
     *  change that passes through no action of ours — patching the text
     *  node from each zoom action would have left the readout lying
     *  after every notch.  */
    graph.on('aftertransform', () => {
        yui_graph_update_zoom(gobj_read_attr(gobj, "$container"), priv.graph);

        /*
         *  A ZOOM re-centres on the anchor; a PAN does not.
         *  `aftertransform` fires for both, and an anchor that also
         *  answered a drag would make the graph impossible to move
         *  while it is set. The zoom LEVEL is what tells them apart:
         *  it changes on a wheel notch and never on a drag.
         *
         *  No recursion: the centring translates without zooming, so
         *  the level it fires back with is the one just stored.
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

    graph.on(CanvasEvent.CLICK, (evt) => {
        // Canvas click
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
        let $canvas = document.getElementById(priv.canvas_id);
        if($canvas) {
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
 *  The port a container key opens on its card.
 *
 *  Prefixed so it can never collide with anything G6 puts in
 *  the same namespace, and stringified because an array index
 *  is a number and a port key is a string.
 ************************************************************/
function port_key(key)
{
    return "p_" + String(key);
}

/************************************************************
 *  Build cell value HTML (matching old mx_json_viewer colors)
 ************************************************************/
function build_cell_html(key, value, type, dark, matched, fold)
{
    /*
     *  A match is a LIGHT chip on BOTH themes, so what sits on it is
     *  light-surface text -- the same flip the header bar does.
     *
     *  A dark chip has no room to exist: dark enough for the brightened
     *  values to read on it is also dark enough to be invisible against
     *  the card, and the amber it used to be (#7a5d00) ended up failing
     *  at both ends, 2.52:1 under the text and 2.34:1 over the card.
     */
    let on_light = matched? false: dark;
    let color = type_color(type, on_light);
    let key_color = json_card_style(GROUP_COLORS.dict, on_light).key;
    let display_value = "";

    switch(type) {
        case "string":
            display_value = `"${escapeHtml(String(value))}"`;
            break;
        case "number":
            display_value = String(value);
            break;
        case "boolean":
            display_value = value ? "true" : "false";
            break;
        case "null":
            display_value = "null";
            break;
        case "list":
            display_value = `[${value.length}]`;
            break;
        case "dict":
            display_value = `{${json_object_size(value)}}`;
            break;
        default:
            display_value = String(value);
            break;
    }

    let row = `<span style="color:${key_color}">• ${escapeHtml(String(key))}: </span>` +
              `<span style="color:${color}">${display_value}</span>`;

    /*
     *  A fold chip ON THE ROW, for a container that gets no card of its
     *  own: the control belongs next to the key it folds, which is
     *  where a tree puts it, and it is the only handle those children
     *  have -- their parent's header chip folds every branch it has,
     *  not this one.
     */
    if(fold) {
        row += `<span style="margin-left:8px;">` +
               fold_toggle_html(fold.path, true, fold.folded, fold.branches, fold.colors) +
               `</span>`;
    }

    if(matched) {
        /*  The highlight is baked into the card's MARKUP and not set as
         *  a G6 node state: the key shape of an `html` node is a DOM
         *  element, and G6 paints no state style on it.  Setting
         *  'active' here would select correctly and show nothing. */
        row = `<span style="background:#ffe082; ` +
              `border-radius:2px; padding:0 2px;">${row}</span>`;
    }
    return row;
}

/************************************************************
 *  The per-node fold handle, drawn in the card's header.
 *
 *  Only a card with a BRANCH gets one — a leaf has nothing to
 *  fold, and a handle that does nothing is worse than none.
 *  It carries the path in `data-fold-path`, which is what the
 *  delegated listener in build_ui reads; the card is an
 *  innerHTML string, so there is no other way to hang a
 *  handler on it.
 *
 *  On the RIGHT of the header, and last, where the gobj tree
 *  puts its own — with a spacer of the same width on the left
 *  so the label stays centred on its own axis instead of
 *  drifting by the width of a chip that only some cards have.
 *
 *  A filled CHIP, the same one the gobj tree draws
 *  (`c_yui_gobj_tree_js.js`, render_toggle_html): background,
 *  border, radius, and `+N` / `−` rather than a triangle.  It
 *  shipped once as a bare `▾` and on a phone it was invisible —
 *  a glyph is a couple of pixels of ink at the zoom that fits a
 *  document on screen, while a filled chip stays a visible blob
 *  and reads as something you press.  `+N` also carries the
 *  count of what is hidden, which the open state does not need.
 *
 *  No `title`: it would be a word inside an innerHTML string,
 *  where it could carry no i18n key and would sit in English
 *  forever.  `+3` and `−` need no language.
 ************************************************************/
const FOLD_SPACER = `<span style="width:24px; flex:0 0 auto;"></span>`;

/*
 *  The card's geometry, in ONE place.
 *
 *  A container key's port is placed by computing WHICH ROW it is, so a
 *  row height changed in the markup and not here would slide every port
 *  off the line it belongs to -- silently, because nothing would fail:
 *  the dots would just stop pointing at anything.
 *
 *  These are the rendered heights of the header (`padding: 3px 8px` on
 *  12px bold) and of one body row (`padding: 1px 6px` on 13px monospace).
 */
const CARD_HEADER_H = 24;
const CARD_ROW_H = 22;

function fold_toggle_html(path, foldable, folded, branches, colors)
{
    if(!foldable) {
        return FOLD_SPACER;
    }

    let label = folded? ("+" + branches): "&#8722;";        /*  +N / −  */

    return `<span data-fold-path="${escapeHtml(path)}" style="
        flex: 0 0 auto;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 22px;
        height: 16px;
        padding: 0 5px;
        background: ${colors.bg};
        color: ${colors.border};
        border: 1px solid ${colors.bg};
        border-radius: 6px;
        font-size: 11px;
        font-weight: 700;
        line-height: 1;
        cursor: pointer;
        user-select: none;
    ">${label}</span>`;
}

/************************************************************
 *  Does this key/value pair match the find term?
 *
 *  Scalars are matched on what the card SHOWS.  A complex value
 *  is not: its contents are a card of their own and match there,
 *  so matching the `{3}` summary too would light up every
 *  ancestor of every hit.
 ************************************************************/
function cell_matches(key, value, type, needle)
{
    if(empty_string(needle)) {
        return false;
    }
    if(String(key).toLowerCase().includes(needle)) {
        return true;
    }
    switch(type) {
        case "string":
        case "number":
        case "boolean":
            return String(value).toLowerCase().includes(needle);
        case "null":
            return "null".includes(needle);
        default:
            return false;
    }
}

/************************************************************
 *  Get JSON type string
 ************************************************************/
function get_json_type(value)
{
    if(is_string(value))  return "string";
    if(is_null(value))    return "null";
    if(is_number(value))  return "number";
    if(is_boolean(value)) return "boolean";
    if(is_object(value))  return "dict";
    if(is_array(value))   return "list";
    return "unknown";
}

/************************************************************
 *  Generate a unique node ID
 ************************************************************/
function gen_node_id(gobj)
{
    let priv = gobj.priv;
    priv.node_counter++;
    return "jn-" + priv.node_counter;
}

/************************************************************
 *  Add path segment
 ************************************************************/
function add_segment(path, segment)
{
    if(path.length) {
        return path + "`" + segment;
    }
    return String(segment);
}

/************************************************************
 *  Get last two segments for group label
 ************************************************************/
function get_group_label(path)
{
    let segments = path.split("`");
    if(segments.length >= 2) {
        return segments[segments.length-2] + "." + segments[segments.length-1];
    }
    if(segments.length === 1) {
        return segments[0];
    }
    return path;
}

/************************************************************
 *  Recursively build nodes and edges from JSON
 ************************************************************/
function build_json_nodes(gobj, path, kw, nodes, edges, parent_id, parent_port)
{
    let group_id = gen_node_id(gobj);
    let is_dict = is_object(kw);
    let is_list = is_array(kw);

    if(!is_dict && !is_list) {
        return null;
    }

    /*
     *  Build HTML content for this group.
     *  The theme is read live as the card is drawn (like the gobj-tree's
     *  cards): ac_theme rebuilds on a switch, so this is always current.
     */
    let priv = gobj.priv;
    let needle = priv.search || "";
    let dark = yui_is_dark();
    let lines = [];
    let pending_complex = [];
    let card_matched = false;

    let colors = json_card_style(
        is_dict ? GROUP_COLORS.dict : GROUP_COLORS.list, dark
    );

    let entries = is_dict ? Object.entries(kw) : kw.map((v, i) => [i, v]);

    for(let [key, value] of entries) {
        let type = get_json_type(value);
        let matched = cell_matches(key, value, type, needle);
        if(matched) {
            card_matched = true;
            priv.match_count++;
        }

        /*
         *  EVERY key is a row, containers included: `cols` is one key of
         *  the topic dict exactly like `pkey` and `tkey`, and a drawing
         *  that leaves it out of the card does not say what the document
         *  says.
         *
         *  What a container key does NOT get is its contents repeated
         *  underneath it -- the row says `[14]` and the fourteen cards
         *  say the rest. That is the part which does not scale: an array
         *  of a thousand dicts would otherwise print a thousand-row card
         *  beside the thousand cards it duplicates.
         */
        let fold = null;
        if(has_branch(value)) {
            /*  `lines.length` is the index the row of this entry is about
             *  to take, and it is what puts the port on that line.  */
            pending_complex.push({
                key: key, value: value, port: port_key(key), row: lines.length
            });

            /*
             *  A child that gets no card of its own is folded from HERE
             *  or from nowhere.
             */
            if(is_pure_collection(value)) {
                let child_path = add_segment(path, key);
                fold = {
                    path: child_path,
                    folded: priv.collapsed.has(child_path),
                    branches: count_branches(value),
                    colors: colors,
                };
            }
        }

        lines.push(build_cell_html(key, value, type, dark, matched, fold));
    }

    /*
     *  A pure collection is not drawn: its row above names it and its
     *  children hang from THIS card's parent. The root always gets a
     *  card, or a document that is a plain list of records would have
     *  nothing to hang anything from.
     */
    if(parent_id && is_pure_collection(kw)) {
        if(priv.collapsed.has(path)) {
            return parent_id;
        }
        for(let pending of pending_complex) {
            /*
             *  `parent_port` and not one of ours: this collection has no
             *  card, so the port its row opened in the PARENT is the one
             *  every one of these lines leaves from -- fourteen columns
             *  out of the single `cols` port, which is what the document
             *  says and what the reader traces back.
             */
            build_json_nodes(
                gobj,
                add_segment(path, pending.key),
                pending.value,
                nodes,
                edges,
                parent_id,
                parent_port
            );
        }
        return parent_id;
    }

    let label = get_group_label(path) || (is_dict ? "{}" : "[]");

    /*
     *  Folded: keep the card, drop the branch, and SAY how much went
     *  with it.  A cut that is not marked reads as a document that ends
     *  there — the same rule the lazy tree follows for a `__collapsed__`
     *  sentinel.  The mark is a glyph and a number on purpose: the card
     *  is an innerHTML string, where a word could carry no i18n key and
     *  would sit there in English forever.
     */
    let foldable = pending_complex.length > 0;
    let folded = foldable && priv.collapsed.has(path);
    let border_color = card_matched? (dark? "#ffb300": "#ff8f00"): colors.border;
    let border_width = card_matched? 2: 1;

    /*
     *  Build node HTML content
     */
    let content_html = lines.map(line =>
        `<div style="font-family:monospace; font-size:13px; padding:1px 6px; white-space:nowrap;">${line}</div>`
    ).join("");

    let min_width = Math.max(180, label.length * 9);
    let card_height = CARD_HEADER_H + lines.length * CARD_ROW_H;

    let node_html = `
<div style="
    min-width: ${min_width}px;
    background: ${colors.bg};
    border: ${border_width}px ${is_dict ? 'dashed' : 'solid'} ${border_color};
    border-radius: ${is_dict ? '6px' : '0'};
    opacity: 0.9;
    overflow: hidden;
">
    <div style="
        background: ${colors.border};
        color: ${colors.header_fg};
        font-weight: bold;
        font-size: 12px;
        padding: 3px 8px;
        display: flex;
        align-items: center;
        gap: 6px;
    ">${FOLD_SPACER}<span style="flex:1 1 auto; text-align:center;">${escapeHtml(label)}</span>${fold_toggle_html(path, foldable, folded, pending_complex.length, colors)}</div>
    ${content_html}
</div>`;

    /*
     *  ONE PORT PER CONTAINER KEY, ON THE LINE OF ITS OWN ROW.
     *
     *  Without ports each card was a single anchor: fourteen lines came
     *  out of one point, and which row a line belonged to was a guess
     *  the reader made from where it landed.
     *
     *  Spread along the bottom edge they were distinguishable but still
     *  not ATTACHED to anything -- the reader had to count dots, count
     *  rows, and trust that the two orders matched. Placed at the row's
     *  own height there is nothing to match: the line leaves from beside
     *  the key it belongs to, which is the whole point of a port.
     *
     *  On the RIGHT edge, and exactly ON it (`x = 1`) rather than inside:
     *  an html node draws its HTML in a DOM layer above the canvas, so a
     *  port fully inside the box would be painted under the card and
     *  never seen. Half of it sticks out.
     *
     *  Coloured by what the row LEADS TO -- a dict or a list -- which is
     *  the one thing the port can say that the row does not.
     */
    let ports = [];

    /*
     *  The port a line ARRIVES at: one per card, above the title and
     *  centred, and only on a card that has a parent -- the root
     *  receives nothing, so a dot there would mark a door onto nothing.
     *
     *  One and not one-per-parent because a card has exactly ONE parent
     *  in a JSON document: what varies is which key of that parent it
     *  hangs from, and that is what the source ports say.
     *
     *  Keyed `in` with no prefix, which is why the key ports carry one:
     *  no `p_<key>` can ever collide with it.
     */
    if(parent_id) {
        ports.push({
            key: "in",
            placement: [0.5, 0],
            fill: colors.border,
            stroke: colors.border,
        });
    }

    for(let pending of pending_complex) {
        let child_colors = json_card_style(
            is_object(pending.value)? GROUP_COLORS.dict: GROUP_COLORS.list, dark
        );
        let row_mid = CARD_HEADER_H + pending.row * CARD_ROW_H + CARD_ROW_H / 2;
        ports.push({
            key: pending.port,
            placement: [1, row_mid / card_height],
            fill: child_colors.border,
            stroke: colors.border,
        });
    }

    let node = {
        id: group_id,
        type: 'html',
        data: {
            path: path,
            is_dict: is_dict,
        },
        style: {
            innerHTML: node_html,
            size: [min_width, card_height],
            dx: -(min_width / 2),
            dy: -(card_height / 2),
            port: ports.length > 0,
            ports: ports,
            portR: 4,
            portLineWidth: 1,
        },
    };
    nodes.push(node);

    /*
     *  Edge from parent to this group, out of the port its key opened.
     */
    if(parent_id) {
        let edge = {
            source: parent_id,
            target: group_id,
            style: {
                stroke: colors.border,
                lineWidth: 1,
                /*
                 *  Said on the EDGE and not left to the graph's element
                 *  default: a per-element `style` is what the reader of
                 *  this code sees, and an arrow that lives somewhere
                 *  else is an arrow nobody can find when it stops
                 *  being drawn.
                 *
                 *  Filled with the line's own colour, because an
                 *  arrowhead in the default fill is a black triangle on
                 *  a teal line in light and an invisible one in dark.
                 */
                endArrow: true,
                endArrowSize: 8,
                endArrowFill: colors.border,
                endArrowStroke: colors.border,
                /*  It lands on the card's `in` port, above the title. */
                targetPort: "in",
            }
        };
        if(parent_port) {
            edge.style.sourcePort = parent_port;
        }
        edges.push(edge);
    }

    /*
     *  Recurse into complex children — unless this card is folded.
     */
    if(folded) {
        return group_id;
    }
    for(let pending of pending_complex) {
        build_json_nodes(
            gobj,
            add_segment(path, pending.key),
            pending.value,
            nodes,
            edges,
            group_id,
            pending.port
        );
    }

    return group_id;
}

/************************************************************
 *  Load JSON data into graph
 ************************************************************/
function load_json(gobj)
{
    let priv = gobj.priv;
    let graph = priv.graph;

    if(!graph) {
        return;
    }

    let json_data = gobj_read_attr(gobj, "json_data");
    if(!json_data) {
        return;
    }

    let json = json_deep_copy(json_data);
    let path = gobj_read_str_attr(gobj, "path") || "`";
    if(empty_string(path)) {
        path = "`";
    }

    priv.node_counter = 0;
    priv.match_count = 0;

    let nodes = [];
    let edges = [];

    build_json_nodes(gobj, path, json, nodes, edges, null);

    let preserve_view = !!priv.pending_preserve_view;
    priv.pending_preserve_view = false;

    if(nodes.length > 0) {
        let root_id = nodes[0].id;      /*  built before its children  */
        graph.setData({nodes: nodes, edges: edges});
        graph.render().then(() => {
            /*  Ids are generated per build: point the anchor at its path
             *  again before anybody asks the camera to go there.  */
            reanchor(gobj);

            if(preserve_view) {
                yui_graph_update_zoom(gobj_read_attr(gobj, "$container"), priv.graph);
                return;
            }

            /*
             *  ACTUAL SIZE, not fit.  A JSON graph of anything real does
             *  not fit at a zoom anybody can read: the schema of one
             *  topic fits at 37%, where every card is grey texture.
             *  Fitting answered "where is everything" when the question
             *  on opening is "what does this say".
             *
             *  Centred on the ANCHOR if there is one, else on the ROOT
             *  -- never parked at the layout's origin, which is a corner
             *  with nothing in it and is where `1:1` used to land.
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
 *  Every path that HAS a branch to fold, in the same recursion
 *  build_json_nodes uses — so "collapse all" can never name
 *  something with no handle.  The handle is a card's header chip
 *  for a container that gets a card, and the chip on its ROW in
 *  the parent for a pure collection, which gets none; both are
 *  keyed by this same path.  The root is excluded: folding it
 *  would leave an empty canvas.
 ************************************************************/
function collect_foldable_paths(value, path, out, is_root)
{
    let is_dict = is_object(value);
    let is_list = is_array(value);
    if(!is_dict && !is_list) {
        return false;
    }

    /*  `found_branch` and not `has_branch`: that name belongs to the
     *  helper above, and a local would shadow it here.  */
    let found_branch = false;
    let entries = is_dict ? Object.entries(value) : value.map((v, i) => [i, v]);
    for(let [key, child] of entries) {
        if(has_branch(child)) {
            found_branch = true;
            collect_foldable_paths(child, add_segment(path, key), out, false);
        }
    }

    if(found_branch && !is_root) {
        out.push(path);
    }
    return found_branch;
}

/************************************************************
 *  Show the find count, or hide the chip when there is no
 *  term.  Zero is a RESULT and must show: a graph that did not
 *  move looks the same whether nothing matched or the match
 *  was already on screen.
 ************************************************************/
function update_find_result(gobj)
{
    let priv = gobj.priv;
    if(!priv.$find_result || !priv.$find_count) {
        return;
    }
    if(empty_string(priv.search)) {
        priv.$find_result.classList.add("is-hidden");
        priv.$find_count.textContent = "";
        return;
    }
    priv.$find_count.textContent = String(priv.match_count);
    priv.$find_result.classList.remove("is-hidden");
}

/************************************************************
 *  Clear and reload.
 *      {preserve_view: true}
 *          keep the current zoom and translate (no fitView) —
 *          a restyle (theme change) must not move the camera.
 *  Default: fit the whole graph to the viewport.
 ************************************************************/
function refresh_json(gobj, opts)
{
    let priv = gobj.priv;
    let graph = priv.graph;
    opts = opts || {};

    if(graph) {
        priv.pending_preserve_view = !!opts.preserve_view;
        graph.clear();
        load_json(gobj);
    }
}

/************************************************************
 *  Custom tree layout for JSON visualization
 ************************************************************/
class JsonTreeLayout extends BaseLayout {
    async execute(data, options) {
        const { nodes = [], edges = [] } = data;

        if(nodes.length === 0) {
            return {nodes: []};
        }

        /*
         *  Build adjacency: parent -> children
         */
        let children_map = {};
        let has_parent = new Set();
        for(let edge of edges) {
            if(!children_map[edge.source]) {
                children_map[edge.source] = [];
            }
            children_map[edge.source].push(edge.target);
            has_parent.add(edge.target);
        }

        /*
         *  Find roots (nodes without parents)
         */
        let roots = nodes.filter(n => !has_parent.has(n.id));
        if(roots.length === 0 && nodes.length > 0) {
            roots = [nodes[0]];
        }

        /*
         *  Node dimensions
         */
        let node_dims = {};
        for(let node of nodes) {
            let w = node.style && node.style.size ? node.style.size[0] : 200;
            let h = node.style && node.style.size ? node.style.size[1] : 60;
            node_dims[node.id] = {w, h};
        }

        const H_GAP = 60;  // horizontal gap between siblings
        const V_GAP = 50;  // vertical gap between levels

        /*
         *  Calculate subtree widths (bottom-up)
         */
        let subtree_widths = {};
        function calc_subtree_width(node_id) {
            let kids = children_map[node_id] || [];
            if(kids.length === 0) {
                subtree_widths[node_id] = node_dims[node_id].w;
                return subtree_widths[node_id];
            }
            let total = 0;
            for(let i = 0; i < kids.length; i++) {
                if(i > 0) total += H_GAP;
                total += calc_subtree_width(kids[i]);
            }
            subtree_widths[node_id] = Math.max(total, node_dims[node_id].w);
            return subtree_widths[node_id];
        }

        for(let root of roots) {
            calc_subtree_width(root.id);
        }

        /*
         *  Position nodes (top-down)
         */
        let positions = {};
        function position_node(node_id, x, y) {
            positions[node_id] = {x, y};

            let kids = children_map[node_id] || [];
            if(kids.length === 0) return;

            let total_width = 0;
            for(let i = 0; i < kids.length; i++) {
                if(i > 0) total_width += H_GAP;
                total_width += subtree_widths[kids[i]];
            }

            let child_y = y + node_dims[node_id].h + V_GAP;
            let start_x = x - total_width / 2;

            for(let kid of kids) {
                let kid_w = subtree_widths[kid];
                let kid_x = start_x + kid_w / 2;
                position_node(kid, kid_x, child_y);
                start_x += kid_w + H_GAP;
            }
        }

        /*
         *  Position roots side by side
         */
        let total_root_width = 0;
        for(let i = 0; i < roots.length; i++) {
            if(i > 0) total_root_width += H_GAP;
            total_root_width += subtree_widths[roots[i].id];
        }

        let root_x = 0;
        for(let root of roots) {
            let rw = subtree_widths[root.id];
            position_node(root.id, root_x + rw / 2, 0);
            root_x += rw + H_GAP;
        }

        return {
            nodes: nodes.map(node => ({
                id: node.id,
                style: {
                    x: positions[node.id] ? positions[node.id].x : 0,
                    y: positions[node.id] ? positions[node.id].y : 0,
                },
            })),
        };
    }
}




                    /***************************
                     *      Actions
                     ***************************/




/************************************************************
 *
 ************************************************************/
function ac_load_data(gobj, event, kw, src)
{
    if(kw.path !== undefined) {
        gobj_write_str_attr(gobj, "path", kw.path);
    }
    if(kw.data !== undefined) {
        gobj_write_attr(gobj, "json_data", kw.data);
    }

    refresh_json(gobj);

    return 0;
}

/************************************************************
 *
 ************************************************************/
function ac_refresh(gobj, event, kw, src)
{
    refresh_json(gobj);
    return 0;
}

/************************************************************
 *  {theme: "dark"|"light"} — the app switched theme.
 *  EV_CHANGE_LAYOUT { layout }
 *
 *  The layout AND the edge type move together — a vertical
 *  layout with horizontal cubics draws every edge the wrong way
 *  round — and then the graph is rebuilt and refitted, because a
 *  new layout is a new shape and the old camera framed the old
 *  one.
 ************************************************************/
function ac_change_layout(gobj, event, kw, src)
{
    let priv = gobj.priv;
    let key = (kw && kw.layout) || "";

    if(!LAYOUTS[key]) {
        log_error(`${gobj_short_name(gobj)}: unknown layout '${key}'`);
        return -1;
    }
    if(key === gobj_read_str_attr(gobj, "layout")) {
        return 0;
    }

    gobj_write_str_attr(gobj, "layout", key);

    /*  Keep the picker in step when the event came from elsewhere.  */
    if(priv.$layout_select && priv.$layout_select.value !== key) {
        priv.$layout_select.value = key;
    }

    let cfg = get_layout_cfg(key);
    if(priv.graph) {
        priv.graph.setOptions({
            layout: cfg.g6_layout,
            edge: {type: cfg.edge_type},
        });
    }
    refresh_json(gobj);
    update_find_result(gobj);
    return 0;
}

/************************************************************
 *  EV_TOGGLE_FOLD { path } — fold or unfold ONE card.
 *
 *  The camera does not move: folding one branch is a local
 *  edit of the picture, and refitting the whole graph for it
 *  would throw away where the reader was looking.  The toolbar
 *  pair, which changes everything at once, does refit.
 ************************************************************/
function ac_toggle_fold(gobj, event, kw, src)
{
    let priv = gobj.priv;
    let path = (kw && kw.path) || "";

    if(empty_string(path)) {
        log_error(`${gobj_short_name(gobj)}: EV_TOGGLE_FOLD with no path`);
        return -1;
    }

    if(priv.collapsed.has(path)) {
        priv.collapsed.delete(path);
    } else {
        priv.collapsed.add(path);
    }

    refresh_json(gobj, {preserve_view: true});
    update_find_result(gobj);
    return 0;
}

/************************************************************
 *  EV_FIND_NODES { text }
 *
 *  The camera does NOT move: a find is a way of reading what is
 *  already on screen, and a viewport that jumps on every
 *  keystroke is unusable.  The count says whether there is
 *  anything to look for elsewhere.
 ************************************************************/
function ac_find_nodes(gobj, event, kw, src)
{
    let priv = gobj.priv;

    priv.search = ((kw && kw.text) || "").trim().toLowerCase();
    refresh_json(gobj, {preserve_view: true});
    update_find_result(gobj);
    return 0;
}

/************************************************************
 *  EV_EXPAND_ALL
 ************************************************************/
function ac_expand_all(gobj, event, kw, src)
{
    let priv = gobj.priv;

    if(priv.collapsed.size === 0) {
        return 0;   // nothing folded; a relayout would only move the camera
    }
    priv.collapsed.clear();
    refresh_json(gobj);
    update_find_result(gobj);
    return 0;
}

/************************************************************
 *  EV_COLLAPSE_ALL — fold every card but the root.
 ************************************************************/
function ac_collapse_all(gobj, event, kw, src)
{
    let priv = gobj.priv;

    let json_data = gobj_read_attr(gobj, "json_data");
    if(!json_data) {
        return 0;
    }

    let paths = [];
    let path = gobj_read_str_attr(gobj, "path") || "`";
    if(empty_string(path)) {
        path = "`";
    }
    collect_foldable_paths(json_data, path, paths, true);

    priv.collapsed = new Set(paths);
    refresh_json(gobj);
    update_find_result(gobj);
    return 0;
}

/************************************************************
 *
 ************************************************************/
function ac_theme(gobj, event, kw, src)
{
    let priv = gobj.priv;

    priv.theme = kw.theme || yui_theme_now();
    if(priv.graph) {
        priv.graph.setTheme(priv.theme);
    }
    /*  A restyle, not new data: keep the user's zoom/pan. */
    refresh_json(gobj, {preserve_view: true});

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
 *   Node ids are generated per build, so the id the reader
 *   chose does not survive a refresh, a fold or a layout
 *   change -- the PATH does, and it is what the anchor really
 *   means: "this place in the document", not "this card".
 *
 *   A path that is no longer drawn (its parent got folded)
 *   releases the anchor rather than leaving a button that says
 *   it is locked onto something invisible.
 ************************************************************/
function reanchor(gobj)
{
    let priv = gobj.priv;

    if(priv.anchor_state !== "on" || !priv.anchor_path) {
        return;
    }

    let found = "";
    try {
        for(let node of priv.graph.getNodeData()) {
            if(node && node.data && node.data.path === priv.anchor_path) {
                found = node.id;
                break;
            }
        }
    } catch(e) {
        return;     /*  between renders: keep what we have and try later  */
    }

    priv.anchor_id = found;
    if(!found) {
        priv.anchor_state = "off";
        priv.anchor_path = "";
    }
    yui_graph_update_anchor(gobj_read_attr(gobj, "$container"), priv.anchor_state);
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
        priv.anchor_path = "";
    }

    yui_graph_update_anchor(gobj_read_attr(gobj, "$container"), priv.anchor_state);
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

    let nodedata;
    try {
        nodedata = graph.getNodeData(node_id);
    } catch(e) {}

    /*
     *  A waiting anchor TAKES the click: it is what the reader armed
     *  the button for, and letting the same press also open the item
     *  would make picking a target a side effect of doing something
     *  else.
     */
    if(priv.anchor_state === "arming") {
        priv.anchor_id = node_id;
        priv.anchor_path = (nodedata && nodedata.data)? nodedata.data.path: "";
        priv.anchor_state = "on";
        yui_graph_update_anchor(gobj_read_attr(gobj, "$container"), priv.anchor_state);
        yui_graph_center_on(graph, node_id);
        return 0;
    }

    if(nodedata && nodedata.data) {
        gobj_publish_event(gobj, "EV_JSON_ITEM_CLICKED", {
            path: nodedata.data.path,
            id: node_id
        });
    }

    return 0;
}

/************************************************************
 *
 ************************************************************/
function ac_show(gobj, event, kw, src)
{
    let priv = gobj.priv;
    let graph = priv.graph;

    if(graph) {
        let $canvas = document.getElementById(priv.canvas_id);
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
        let $canvas = document.getElementById(priv.canvas_id);
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
            ["EV_LOAD_DATA",            ac_load_data,           null],
            ["EV_REFRESH",              ac_refresh,             null],
            ["EV_FIND_NODES",           ac_find_nodes,          null],
            ["EV_TOGGLE_FOLD",          ac_toggle_fold,         null],
            ["EV_CHANGE_LAYOUT",        ac_change_layout,       null],
            ["EV_EXPAND_ALL",           ac_expand_all,          null],
            ["EV_COLLAPSE_ALL",         ac_collapse_all,        null],
            ["EV_THEME",                ac_theme,               null],
            ["EV_ZOOM_IN",              ac_zoom_in,             null],
            ["EV_ZOOM_OUT",             ac_zoom_out,            null],
            ["EV_ZOOM_RESET",           ac_zoom_reset,          null],
            ["EV_CENTER",               ac_center,              null],
            ["EV_NODE_CLICK",           ac_node_click,          null],
            ["EV_TOGGLE_ANCHOR",        ac_toggle_anchor,       null],
            ["EV_RESIZE",               ac_resize,              null],
            ["EV_SHOW",                 ac_show,                null],
            ["EV_HIDE",                 ac_hide,                null],
        ]]
    ];

    /*---------------------------------------------*
     *          Events
     *---------------------------------------------*/
    const event_types = [
        ["EV_LOAD_DATA",            0],
        ["EV_REFRESH",              0],
        ["EV_FIND_NODES",           0],
        ["EV_TOGGLE_FOLD",          0],
        ["EV_CHANGE_LAYOUT",        0],
        ["EV_EXPAND_ALL",           0],
        ["EV_COLLAPSE_ALL",         0],
        ["EV_THEME",                0],
        ["EV_ZOOM_IN",              0],
        ["EV_ZOOM_OUT",             0],
        ["EV_ZOOM_RESET",           0],
        ["EV_CENTER",               0],
        ["EV_NODE_CLICK",           0],
        ["EV_TOGGLE_ANCHOR",        0],
        ["EV_RESIZE",               0],
        ["EV_SHOW",                 0],
        ["EV_HIDE",                 0],
        ["EV_JSON_ITEM_CLICKED",    event_flag_t.EVF_OUTPUT_EVENT],
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
function register_c_yui_json_graph()
{
    /*  Idempotent: C_YUI_JSON auto-registers this gclass for its graph
     *  view, so an app that also registers it explicitly (in either
     *  order) must not trip "GClass ALREADY created".  Same arrangement
     *  C_YUI_JSON itself makes for C_YUI_FORM's hosts.  */
    if(gclass_find_by_name(GCLASS_NAME, false)) {
        return 0;
    }
    return create_gclass(GCLASS_NAME);
}

export { register_c_yui_json_graph };
