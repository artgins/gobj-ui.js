/***********************************************************************
 *          c_yui_fsm_graph.js
 *
 *  A finite state machine, drawn.
 *
 *  The second view of C_YUI_GCLASS's machine zone. The matrix is the
 *  first, and it stays the default: it is the shape the FSM is
 *  DECLARED in, it reads every gclass the same way, and it never lies
 *  about what is missing. A graph answers a different question --
 *  where does this machine GO -- and it answers it best exactly where
 *  the matrix is worst: many states, few events per state.
 *
 *  G6, not a canvas of our own, and for one reason: what is expensive
 *  in a graph is not the drawing. It is the layout, the hit testing,
 *  the camera and the finger -- and all four are already paid for in
 *  this library (`yui_graph_camera.js`, `g6_touch_gestures.js`,
 *  `g6_drag_canvas_touch.js`), spoken with one vocabulary by the other
 *  three graphs. A fourth vocabulary is what a hand-rolled canvas
 *  would cost, and it would go on costing it.
 *
 *  WHAT IT DRAWS, and what it refuses to draw:
 *
 *      - one card per STATE, with how many events it handles and how
 *        many of them leave.
 *      - one edge per PAIR of states, labelled with the events that
 *        make the jump. Several transitions between the same two
 *        states are ONE edge with several labels: G6 draws overlapping
 *        edges on top of each other, so a second one is invisible and
 *        the reader has no way to know it is there.
 *      - an event a state handles WITHOUT leaving is not an edge. Ten
 *        self-loops on one card say nothing a number cannot say
 *        better, and they bury the transitions that do move.
 *      - a state nothing declares a way INTO is marked, never drawn as
 *        unreachable: an action may jump with `gobj_change_state()`
 *        (C_IEVENT_CLI enters ST_SESSION that way) and no description
 *        can see inside an action.
 *
 *  It publishes NOTHING. A child that publishes an event forces a
 *  declaration into every host's FSM, and the machine of a gclass has
 *  nothing to say back to the viewer around it.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {
    SDATA,
    SDATA_END,
    data_type_t,
    gclass_create,
    gclass_find_by_name,
    log_error,
    gobj_read_pointer_attr,
    gobj_parent,
    gobj_subscribe_event,
    gobj_read_attr,
    gobj_write_attr,
    gobj_read_str_attr,
    gobj_send_event,
    gobj_short_name,
    gobj_name,
    clean_name,
    createElement2,
    refresh_language,
} from "@yuneta/gobj-js";

import {yui_toolbar} from "./yui_toolbar.js";
import {
    yui_graph_camera_items,
    yui_graph_update_zoom,
} from "./yui_graph_camera.js";
import {yui_is_dark, yui_theme_now, yui_watch_theme} from "./yui_theme.js";
import {ensure_drag_canvas_patch} from "./g6_drag_canvas_touch.js";
import {ensure_pinch_zoom_patch} from "./g6_touch_gestures.js";

import {t} from "i18next";

import {Graph} from "@antv/g6";

import "./c_yui_fsm_graph.css";


/***************************************************************
 *              Constants
 ***************************************************************/
const GCLASS_NAME = "C_YUI_FSM_GRAPH";

/*
 *  Left-to-right is the house direction for a topology, and a machine
 *  reads as one: it starts somewhere and it goes somewhere. Top-down
 *  is offered for the machines that are deep rather than wide.
 */
const LAYOUTS = {
    "dagre-lr": {
        g6_layout: {type: 'antv-dagre', rankdir: 'LR', nodesep: 28, ranksep: 70},
    },
    "dagre-tb": {
        g6_layout: {type: 'antv-dagre', rankdir: 'TB', nodesep: 28, ranksep: 60},
    },
};

const DEFAULT_LAYOUT = "dagre-lr";

/*
 *  How many event names an edge label prints before it gives up and
 *  counts. Three fit beside an edge at the zoom a reader starts at,
 *  and the matrix has the full list either way.
 */
const MAX_EDGE_LABELS = 3;

const CARD_W = 210;
const CARD_H = 46;

const BEHAVIORS = ['zoom-canvas', 'drag-canvas', 'drag-element'];

/*
 *  Below this a card carries no readable text at all. A six-state
 *  machine fits a panel at 38%, which is the whole graph and worth
 *  nothing; stopping here and centring shows a part that can be read,
 *  and the reader pans for the rest. The same floor `C_G6_NODES_TREE`
 *  uses, for the same reason.
 */
const MIN_READABLE_ZOOM = 0.5;

/***************************************************************
 *              Data
 ***************************************************************/
const attrs_table = [
/*---------------- Public Attributes ----------------*/
SDATA(data_type_t.DTP_POINTER,  "subscriber",   0,  null,   "Subscriber of output events"),

/*---------------- Data ----------------*/
SDATA(data_type_t.DTP_JSON,     "fsm",          0,  null,   "The `fsm` block of a gclass view model: {entry_state, states, rows, published, unreachable}"),
SDATA(data_type_t.DTP_STRING,   "current_state",0,  "",     "State of the instance the host is showing, lit in the graph"),

/*---------------- UI ----------------*/
SDATA(data_type_t.DTP_POINTER,  "$container",   0,  null,   "HTMLElement root, mounted by the parent"),
SDATA(data_type_t.DTP_STRING,   "canvas_id",    0,  "",     "Canvas id"),
SDATA(data_type_t.DTP_STRING,   "wide",         0,  "36px", "Height of the toolbar buttons"),
SDATA(data_type_t.DTP_STRING,   "layout",       0,  DEFAULT_LAYOUT, "Layout key (see LAYOUTS)"),
SDATA_END()
];

let PRIVATE_DATA = {
    graph:           null,
    theme:           null,
    theme_observer:  null,  // MutationObserver on <html data-theme>
    resize_observer: null,  // ResizeObserver on the canvas mount
    _resize_raf:     0,     // rAF id debouncing resize -> EV_RESIZE
    $layout_select:  null,  // the direction select
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

    if(!gobj_read_str_attr(gobj, "canvas_id")) {
        gobj_write_attr(gobj, "canvas_id",
            "fsm_graph_" + clean_name(gobj_name(gobj)));
    }

    priv.theme = yui_theme_now();

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

/***************************************************************
 *          Framework Method: Start
 ***************************************************************/
function mt_start(gobj)
{
    /*  The mount has to be IN the document by now: G6 sizes itself
     *  from its container, and one behind `is-hidden` measures 0x0.  */
    build_graph(gobj);
    load_fsm(gobj);

    gobj.priv.theme_observer = yui_watch_theme(function() {
        gobj_send_event(gobj, "EV_THEME_CHANGED", {}, gobj);
    });
}

/***************************************************************
 *          Framework Method: Stop
 ***************************************************************/
function mt_stop(gobj)
{
    let priv = gobj.priv;

    if(priv.theme_observer) {
        try {
            priv.theme_observer.disconnect();
        } catch(e) {
            /*  it went with its document  */
        }
        priv.theme_observer = null;
    }
    if(priv.resize_observer) {
        try {
            priv.resize_observer.disconnect();
        } catch(e) {
            /*  it went with its element  */
        }
        priv.resize_observer = null;
    }
    if(priv._resize_raf) {
        cancelAnimationFrame(priv._resize_raf);
        priv._resize_raf = 0;
    }
    if(priv.graph) {
        try {
            priv.graph.destroy();
        } catch(e) {
            log_error(`${gobj_short_name(gobj)}: the graph refused to die: ${e}`);
        }
        priv.graph = null;
    }
}

/***************************************************************
 *          Framework Method: Destroy
 ***************************************************************/
function mt_destroy(gobj)
{
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
    let canvas_id = gobj_read_str_attr(gobj, "canvas_id");

    let $container = createElement2(
        ['div', {class: 'C_YUI_FSM_GRAPH FSM_GRAPH',
                 style: 'height:100%; display:flex; flex-direction:column;'}, [
            ['div', {class: 'FSM_GRAPH_TOOLBAR is-flex-grow-0'}, [make_toolbar(gobj)]],
            ['div', {class: 'is-flex-grow-1',
                     style: 'flex:1 1 auto; min-height:0; overflow:hidden;'}, [
                ['div', {id: canvas_id, class: 'FSM_GRAPH_CANVAS',
                         style: 'height:100%; min-height:0;'}, []]
            ]]
        ]]
    );

    gobj_write_attr(gobj, "$container", $container);
    priv.$layout_select = $container.querySelector('.FSM_GRAPH_LAYOUT');

    refresh_language($container, t);
}

/************************************************************
 *   Destroy UI
 ************************************************************/
function destroy_ui(gobj)
{
    let priv = gobj.priv;
    let $container = gobj_read_attr(gobj, "$container");

    if($container) {
        if($container.parentNode) {
            $container.parentNode.removeChild($container);
        }
        gobj_write_attr(gobj, "$container", null);
    }
    priv.$layout_select = null;
}

/************************************************************
 *   Toolbar: the direction, and the camera every other graph
 *   in this library speaks with.
 ************************************************************/
function make_toolbar(gobj)
{
    let priv = gobj.priv;
    let wide = gobj_read_str_attr(gobj, "wide");
    let layout = gobj_read_str_attr(gobj, "layout");

    /*  Each option's label goes through t() with the key SPELLED OUT:
     *  a key reached through a variable is invisible to the apps'
     *  locale validator, and i18next answers an unknown key with the
     *  key itself -- which renders in lower-case English and never
     *  changes language.  */
    let $select = createElement2(
        ['select', {class: 'FSM_GRAPH_LAYOUT', style: {height: wide},
                    title: t("layout"), 'data-i18n-title': 'layout',
                    'aria-label': t("layout"), 'data-i18n-aria-label': 'layout'}, [
            ['option', {value: 'dagre-lr', i18n: 'dagre left-right'},
             t("dagre left-right")],
            ['option', {value: 'dagre-tb', i18n: 'dagre top-down'},
             t("dagre top-down")]
        ], {
            change: function(evt) {
                gobj_send_event(gobj, "EV_CHANGE_LAYOUT",
                    {layout: evt.target.value}, gobj);
            }
        }]);

    /*  The value is set on the ELEMENT, never with a `selected`
     *  attribute: translating an option means writing its text, and a
     *  rebuilt option list would come back pointing at the first one.  */
    $select.value = LAYOUTS[layout]? layout: DEFAULT_LAYOUT;

    const $toolbar = yui_toolbar({}, [
        ['div', {class: 'yui-horizontal-toolbar-section left is-flex is-align-items-center',
                 style: 'gap:.25rem;'}, [
            ['div', {class: 'select', style: {height: wide}}, [$select]]
        ]],
        ['div', {class: 'yui-horizontal-toolbar-section center'}, []],
        ['div', {class: 'yui-horizontal-toolbar-section right is-flex is-align-items-center',
                 style: 'gap:.25rem;'},
         yui_graph_camera_items(gobj, priv.graph, wide)],
    ]);

    refresh_language($toolbar, t);
    return $toolbar;
}

/************************************************************
 *   The canvas mount element, or null.
 ************************************************************/
function canvas_mount(gobj)
{
    let $container = gobj_read_attr(gobj, "$container");
    if(!$container) {
        return null;
    }
    return $container.querySelector("#" + gobj_read_str_attr(gobj, "canvas_id"));
}

/************************************************************
 *   Build the G6 graph instance.
 ************************************************************/
function build_graph(gobj)
{
    let priv = gobj.priv;

    if(priv.graph) {
        return;
    }
    if(!canvas_mount(gobj)) {
        log_error(`${gobj_short_name(gobj)}: no canvas mount, no graph`);
        return;
    }

    /*  Both patches are what make a graph work under a FINGER: G6
     *  re-issues pointer ids mid-gesture, and its drag-canvas needs
     *  the touch fix the other three graphs already use.  */
    ensure_drag_canvas_patch();
    ensure_pinch_zoom_patch();

    let cfg = LAYOUTS[gobj_read_str_attr(gobj, "layout")] || LAYOUTS[DEFAULT_LAYOUT];

    priv.graph = new Graph({
        container: gobj_read_str_attr(gobj, "canvas_id"),
        animation: false,
        autoResize: false,
        zoomRange: [0.2, 3],
        /*  Room for the outermost cards: a fit that ends exactly on
         *  the bounds leaves the first and last state cut in half by
         *  the edge of the box.  */
        padding: 24,
        edge: {
            /*
             *  A FUNCTION, not a name: a `type` written on the edge
             *  datum is overridden by the graph-level default, so a
             *  reciprocal pair went on drawing as two straight
             *  segments on top of each other. Asking the datum here is
             *  what G6 documents for varying the type per element.
             */
            type: (d) => (d && d.data && d.data.reciprocal)?
                'quadratic': 'polyline',
            style: {
                stroke: edge_color(),
                lineWidth: 1.2,
                endArrow: true,
                labelFontSize: 10,
                labelFill: edge_label_color(),
                labelBackground: true,
                labelBackgroundFill: card_bg(),
                labelBackgroundOpacity: 1,
                labelPadding: [1, 3],
            },
        },
        layout: cfg.g6_layout,
        behaviors: BEHAVIORS.slice(),
    });

    if(priv.theme) {
        try {
            priv.graph.setTheme(priv.theme);
        } catch(e) {
            log_error(`${gobj_short_name(gobj)}: the theme was refused: ${e}`);
        }
    }

    priv.graph.on('aftertransform', () => {
        yui_graph_update_zoom(gobj_read_attr(gobj, "$container"), priv.graph);
    });

    /*
     *  G6 v5's autoResize only listens to the window: a graph inside a
     *  panel, a tab, or a window somebody drags never hears about it,
     *  and a canvas whose configured size drifts from its on-screen one
     *  pans by the wrong amount under a finger.
     */
    if(typeof ResizeObserver !== "undefined") {
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
        ro.observe(canvas_mount(gobj));
        priv.resize_observer = ro;
    }
}

/************************************************************
 *   Colours for what is drawn on the CANVAS.
 *
 *   The cards are HTML and take theirs from the stylesheet;
 *   an edge cannot, so its three colours are read here and
 *   rewritten when the page changes theme.
 ************************************************************/
function edge_color()
{
    return yui_is_dark()? "#6d7690": "#a9b0c0";
}

function edge_label_color()
{
    return yui_is_dark()? "#b3bacb": "#5d6474";
}

function card_bg()
{
    return yui_is_dark()? "#171A21": "#FBFBFD";
}

/************************************************************
 *   HTML escaping. A card is built as an innerHTML string --
 *   that is what a G6 html node takes -- and a state name
 *   comes from a description some backend answered.
 ************************************************************/
function esc(text)
{
    return String((text === null || text === undefined)? "": text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

/************************************************************
 *   How many of a state's events move it somewhere else.
 ************************************************************/
function count_leaving(fsm, state_name)
{
    let i = fsm.states.findIndex((s) => s.name === state_name);
    if(i < 0) {
        return 0;
    }

    let n = 0;
    for(let row of fsm.rows) {
        let cell = row.cells[i];
        if(cell && cell.next_state) {
            n++;
        }
    }
    return n;
}

/************************************************************
 *   One state, as a card.
 *
 *   Three things it can be at once -- where the machine
 *   starts, where this instance IS, and a state nothing
 *   declares a way into -- so they are classes, not a type.
 ************************************************************/
function state_html(state, fsm, current, unreachable)
{
    let classes = ["FSM_CARD"];
    let marks = "";

    if(state.name === current) {
        classes.push("is-current");
    }
    if(state.name === fsm.entry_state) {
        classes.push("is-entry");
        marks += `<span class="FSM_CARD_MARK is-entry" ` +
                 `title="${esc(t("entry state"))}">&#9654;</span>`;
    }
    if(unreachable.has(state.name)) {
        classes.push("is-unreachable");
        marks += `<span class="FSM_CARD_MARK is-warn" ` +
                 `title="${esc(t("state with no declared entry"))}">&#9888;</span>`;
    }

    /*  How many of the events it handles LEAVE. The rest are the ones
     *  the matrix shows and this graph deliberately does not draw, so
     *  the number is the only place they are counted.  */
    let leaving = count_leaving(fsm, state.name);
    let sub = `${state.count} ${esc(t("events"))}`;
    if(leaving) {
        sub += ` &middot; ${leaving} ${esc(t("leave"))}`;
    }

    return `<div class="${classes.join(" ")}">` +
        `<div class="FSM_CARD_HEAD">` +
            `<span class="FSM_CARD_NAME">${esc(state.name)}</span>${marks}` +
        `</div>` +
        `<div class="FSM_CARD_SUB">${sub}</div>` +
    `</div>`;
}

/************************************************************
 *   The graph data: one node per state, one edge per PAIR.
 ************************************************************/
function build_data(gobj)
{
    let fsm = gobj_read_attr(gobj, "fsm");

    if(!fsm || !Array.isArray(fsm.states) || !Array.isArray(fsm.rows)) {
        return {nodes: [], edges: []};
    }

    let current = gobj_read_str_attr(gobj, "current_state");
    let unreachable = new Set(Array.isArray(fsm.unreachable)? fsm.unreachable: []);

    let nodes = fsm.states.map(function(state) {
        return {
            id: state.name,
            type: 'html',
            data: {state: state.name},
            style: {
                innerHTML: state_html(state, fsm, current, unreachable),
                size: [CARD_W, CARD_H],
                dx: -(CARD_W / 2),
                dy: -(CARD_H / 2),
            },
        };
    });

    /*
     *  One edge per PAIR of states, not per transition: G6 draws two
     *  edges with the same ends on top of each other, so the second is
     *  invisible -- and nothing would tell a reader that an edge
     *  carrying one event is not an edge carrying four.
     */
    let by_pair = new Map();
    fsm.states.forEach(function(state, i) {
        for(let row of fsm.rows) {
            let cell = row.cells[i];
            if(!cell || !cell.next_state) {
                continue;
            }
            if(cell.next_state === state.name) {
                continue;   /*  a jump to itself is not a move  */
            }
            let key = state.name + " " + cell.next_state;
            if(!by_pair.has(key)) {
                by_pair.set(key, {
                    source: state.name,
                    target: cell.next_state,
                    events: [],
                });
            }
            by_pair.get(key).events.push(row.event);
        }
    });

    let edges = [];
    for(let pair of by_pair.values()) {
        let shown = pair.events.slice(0, MAX_EDGE_LABELS);
        let label = shown.join("\n");
        if(pair.events.length > shown.length) {
            label += "\n+" + (pair.events.length - shown.length);
        }

        let style = {labelText: label};

        /*
         *  A pair that goes BOTH ways is drawn as two arcs, one bowing
         *  each way.
         *
         *  Grouping by pair fixed the transitions that share an ordered
         *  pair; a RECIPROCAL pair is a different key and lands on the
         *  same straight segment -- so the two arrows overlap and the
         *  second label is painted under the first. Real case:
         *  C_WEBSOCKET goes to ST_WAIT_HANDSHAKE on EV_CONNECTED and
         *  comes back on EV_DISCONNECTED, and only the return was
         *  readable.
         */
        let reciprocal = by_pair.has(pair.target + " " + pair.source);
        if(reciprocal) {
            /*  Bowed opposite ways so the two arrows separate -- and
             *  the two LABELS moved off the midpoint as well, one to
             *  each third of its own curve. Bowing alone was not
             *  enough: both labels are placed at the middle by default,
             *  they carry an opaque background, and the one drawn last
             *  simply covered the other.  */
            /*  The SAME offset on both, not opposite ones. G6 measures
             *  `curveOffset` from the edge's OWN direction, and a
             *  reciprocal pair runs in opposite directions -- so equal
             *  signs bow them to opposite sides of the screen, and
             *  opposite signs put them on the same side, one on top of
             *  the other.
             *
             *  The label stays at the MIDDLE of its arc, where the two
             *  are furthest apart. Moving it along the curve instead
             *  (0.3 / 0.7) pushed it under a state card: G6's html
             *  nodes are DOM elements ABOVE the canvas, so whatever the
             *  curve draws under one is invisible.  */
            style.curveOffset = 34;
            style.labelPlacement = 0.5;
        }

        edges.push({
            id: "e_" + edges.length,
            source: pair.source,
            target: pair.target,
            data: {reciprocal: reciprocal},
            style: style,
        });
    }

    return {nodes: nodes, edges: edges};
}

/************************************************************
 *   Fit the graph, but never past legibility.
 *
 *   `fitCenter()` before `fitView()` is the house pair: fitView
 *   alone leaves an html-node graph off centre, because the
 *   cards are DOM elements over the canvas and the bounds it
 *   measures are not where the reader is looking.
 ************************************************************/
async function fit_readable(graph)
{
    await graph.fitCenter();
    await graph.fitView();

    if(graph.getZoom() < MIN_READABLE_ZOOM) {
        await graph.zoomTo(MIN_READABLE_ZOOM);
        await graph.fitCenter();
    }
}

/************************************************************
 *   Feed the graph and fit it.
 ************************************************************/
function load_fsm(gobj)
{
    let priv = gobj.priv;

    if(!priv.graph) {
        return;
    }

    let data = build_data(gobj);
    if(!data.nodes.length) {
        return;     /*  nothing to draw; the zone said so already  */
    }

    try {
        priv.graph.setData(data);
        priv.graph.render().then(function() {
            return fit_readable(priv.graph);
        }).then(function() {
            yui_graph_update_zoom(gobj_read_attr(gobj, "$container"), priv.graph);
        }).catch(function(e) {
            log_error(`${gobj_short_name(gobj)}: the graph did not render: ${e}`);
        });
    } catch(e) {
        log_error(`${gobj_short_name(gobj)}: cannot load the machine: ${e}`);
    }
}

/************************************************************
 *   A camera move, with one place to report a refusal.
 ************************************************************/
function camera(gobj, what, fn)
{
    let priv = gobj.priv;

    if(!priv.graph) {
        return 0;
    }
    try {
        fn(priv.graph);
    } catch(e) {
        log_error(`${gobj_short_name(gobj)}: cannot ${what}: ${e}`);
        return -1;
    }
    return 0;
}




                    /***************************
                     *      Actions
                     ***************************/




/************************************************************
 *   EV_SET_FSM {fsm, current_state}
 ************************************************************/
function ac_set_fsm(gobj, event, kw, src)
{
    if(kw.fsm === undefined) {
        log_error(`${GCLASS_NAME}: EV_SET_FSM without an fsm`);
        return -1;
    }

    gobj_write_attr(gobj, "fsm", kw.fsm);
    if(typeof kw.current_state === "string") {
        gobj_write_attr(gobj, "current_state", kw.current_state);
    }
    load_fsm(gobj);
    return 0;
}

/************************************************************
 *   EV_CHANGE_LAYOUT {layout}
 ************************************************************/
function ac_change_layout(gobj, event, kw, src)
{
    let priv = gobj.priv;
    let key = kw.layout;

    if(!LAYOUTS[key]) {
        log_error(`${GCLASS_NAME}: unknown layout '${key}'`);
        return -1;
    }

    gobj_write_attr(gobj, "layout", key);
    if(!priv.graph) {
        return 0;
    }

    try {
        priv.graph.setLayout(LAYOUTS[key].g6_layout);
        priv.graph.layout().then(function() {
            return fit_readable(priv.graph);
        }).catch(function(e) {
            log_error(`${gobj_short_name(gobj)}: the layout failed: ${e}`);
        });
    } catch(e) {
        log_error(`${gobj_short_name(gobj)}: cannot change the layout: ${e}`);
    }
    return 0;
}

/************************************************************
 *   EV_RESIZE -- the container changed size under us.
 ************************************************************/
function ac_resize(gobj, event, kw, src)
{
    let priv = gobj.priv;
    let $canvas = canvas_mount(gobj);

    if(!priv.graph || !$canvas) {
        return 0;
    }
    if(!$canvas.offsetWidth || !$canvas.offsetHeight) {
        return 0;   /*  hidden: measuring now would store a 0x0 canvas  */
    }

    return camera(gobj, "resize the graph", function(graph) {
        graph.setSize($canvas.offsetWidth, $canvas.offsetHeight);
    });
}

/************************************************************
 *   EV_THEME_CHANGED -- the page went dark, or light.
 *
 *   The cards are HTML and follow the stylesheet on their own;
 *   the EDGES are canvas and keep the colours they were built
 *   with, so those three are rewritten.
 ************************************************************/
function ac_theme_changed(gobj, event, kw, src)
{
    let priv = gobj.priv;

    priv.theme = yui_theme_now();
    if(!priv.graph) {
        return 0;
    }

    return camera(gobj, "repaint the graph", function(graph) {
        graph.setTheme(priv.theme);
        graph.setOptions({
            edge: {
                style: {
                    stroke: edge_color(),
                    labelFill: edge_label_color(),
                    labelBackgroundFill: card_bg(),
                },
            },
        });
        graph.draw();
    });
}

/************************************************************
 *   EV_LANGUAGE_CHANGED
 *
 *   A rebuild, not a re-translation: the words of a card live
 *   inside an innerHTML string, where refresh_language()
 *   cannot reach.
 ************************************************************/
function ac_language_changed(gobj, event, kw, src)
{
    let $container = gobj_read_attr(gobj, "$container");

    if($container) {
        refresh_language($container, t);
    }
    load_fsm(gobj);
    return 0;
}

/************************************************************
 *   The camera.
 ************************************************************/
function ac_zoom_in(gobj, event, kw, src)
{
    return camera(gobj, "zoom in", (graph) => graph.zoomBy(1.2));
}

function ac_zoom_out(gobj, event, kw, src)
{
    return camera(gobj, "zoom out", (graph) => graph.zoomBy(1 / 1.2));
}

function ac_zoom_reset(gobj, event, kw, src)
{
    return camera(gobj, "reset the zoom", (graph) => graph.zoomTo(1));
}

function ac_center(gobj, event, kw, src)
{
    return camera(gobj, "fit the graph", (graph) => fit_readable(graph));
}

/************************************************************
 *   EV_SHOW / EV_HIDE -- host visibility
 ************************************************************/
function ac_show(gobj, event, kw, src)
{
    let $container = gobj_read_attr(gobj, "$container");

    if($container) {
        $container.classList.remove('is-hidden');
    }
    gobj_send_event(gobj, "EV_RESIZE", {}, gobj);
    return 0;
}

function ac_hide(gobj, event, kw, src)
{
    let $container = gobj_read_attr(gobj, "$container");

    if($container) {
        $container.classList.add('is-hidden');
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
    mt_create:  mt_create,
    mt_start:   mt_start,
    mt_stop:    mt_stop,
    mt_destroy: mt_destroy,
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
            ["EV_SET_FSM",          ac_set_fsm,             null],
            ["EV_CHANGE_LAYOUT",    ac_change_layout,       null],
            ["EV_ZOOM_IN",          ac_zoom_in,             null],
            ["EV_ZOOM_OUT",         ac_zoom_out,            null],
            ["EV_ZOOM_RESET",       ac_zoom_reset,          null],
            ["EV_CENTER",           ac_center,              null],
            ["EV_RESIZE",           ac_resize,              null],
            ["EV_THEME_CHANGED",    ac_theme_changed,       null],
            ["EV_LANGUAGE_CHANGED", ac_language_changed,    null],
            ["EV_SHOW",             ac_show,                null],
            ["EV_HIDE",             ac_hide,                null]
        ]]
    ];

    /*---------------------------------------------*
     *          Events
     *---------------------------------------------*/
    const event_types = [
        ["EV_SET_FSM",          0],
        ["EV_CHANGE_LAYOUT",    0],
        ["EV_ZOOM_IN",          0],
        ["EV_ZOOM_OUT",         0],
        ["EV_ZOOM_RESET",       0],
        ["EV_CENTER",           0],
        ["EV_RESIZE",           0],
        ["EV_THEME_CHANGED",    0],
        ["EV_LANGUAGE_CHANGED", 0],
        ["EV_SHOW",             0],
        ["EV_HIDE",             0]
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
function register_c_yui_fsm_graph()
{
    /*  Idempotent: C_YUI_GCLASS registers it for its machine zone, so
     *  an app that also registers it explicitly must not trip
     *  "GClass ALREADY created".  */
    if(gclass_find_by_name(GCLASS_NAME, false)) {
        return 0;
    }
    return create_gclass(GCLASS_NAME);
}

export { register_c_yui_fsm_graph };
