/***********************************************************************
 *          c_yui_json.js
 *
 *  Lazy JSON tree viewer.
 *
 *  Container-agnostic (like C_YUI_PAGER): the gclass owns ONLY the
 *  viewer chrome (a toolbar + a scrollable tree body).  The parent
 *  mounts `gobj_read_attr(json_view, "$container")` wherever it wants
 *  (a C_YUI_WINDOW body, a Bulma modal-card, or inline) and feeds it
 *  JSON with EV_SET_JSON.
 *
 *  Built for ARBITRARILY LARGE JSON via server-driven lazy expansion.
 *  The kernel's `kw_collapse()` (kwid.c) truncates over-limit dicts and
 *  arrays into sentinels:
 *          { "__collapsed__": { "path": ..., "size": N } }
 *  The viewer renders those as an expandable stub; opening one does NOT
 *  fetch anything itself — it PUBLISHES EV_EXPAND_PATH {path, size} to
 *  its subscriber, which is the ONLY party that knows the backend (e.g.
 *  it re-issues `print-tranger path=<path>`), then hands the subtree
 *  back with EV_SUBTREE_LOADED {path, json}.  This keeps the component
 *  decoupled from any command / transport.  With no sentinels present
 *  it degrades to a plain client-side collapsible tree.
 *
 *  Only expanded containers are materialised in the DOM, so the tree
 *  stays bounded no matter how large the source document is.
 *
 *  THREE VIEWS over the same working document, chosen by the
 *  `view_mode` attr ("tree" | "text" | "graph") and switched from the
 *  toolbar.  The viewer opens on what the host asked for, else on the
 *  view the reader chose last (kept in localStorage), else on the tree.
 *  They answer three different questions:
 *
 *      tree    where is this value, and what is around it — the lazy
 *              view above, the only one that can drill.
 *      text    what does this document SAY, verbatim — for reading it
 *              as written, selecting a slab of it, or searching it with
 *              the browser's own Ctrl+F.
 *      graph   what SHAPE is this — nesting as a hierarchy, drawn by a
 *              hosted C_YUI_JSON_GRAPH child (AntV/G6).
 *
 *  Neither text nor graph is lazy: both show what the client currently
 *  holds, `__collapsed__` sentinels included, because that is honestly
 *  what it has.  Drill in the tree and they grow with it.  The
 *  tree-only controls (search, expand/collapse) hide with the tree.
 *
 *  The graph child is built on FIRST entry into graph mode and not
 *  before: G6 measures its container, so a graph created behind
 *  `is-hidden` comes up 0x0, and a viewer nobody switches to graph
 *  should not pay for a canvas.
 *
 *  DOM is self-describing (UPPER_SNAKE logical classes): JSON_VIEWER /
 *  JSON_TOOLBAR / JSON_SEARCH / JSON_VIEW_SWITCH / JSON_VIEW_MODE /
 *  JSON_TREE / JSON_TEXT / JSON_TEXT_BODY / JSON_GRAPH / JSON_ROW /
 *  JSON_KEY / JSON_VALUE / JSON_SUMMARY / JSON_COLLAPSED / JSON_TIME.
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
    gclass_find_by_name,
    log_error,
    gobj_read_pointer_attr,
    gobj_parent,
    gobj_subscribe_event,
    gobj_create_pure_child,
    gobj_start,
    gobj_stop,
    gobj_destroy,
    gobj_is_running,
    gobj_short_name,
    clean_name,
    gobj_name,
    gobj_read_attr,
    gobj_write_attr,
    gobj_read_str_attr,
    gobj_send_event,
    gobj_publish_event,
    createElement2,
    json_deep_copy,
    json_object_size,
    refresh_language,
    kw_get_local_storage_value,
    kw_set_local_storage_value,
} from "@yuneta/gobj-js";

import {
    json_type,
    is_collapsed,
    seg_join,
    seg_split,
    set_by_segments,
    subtree_matches,
    is_time_field,
    format_epoch,
    json_text_dump,
    pick_view_mode,
    container_label,
} from "./json_view_helpers.js";

import {yui_toolbar} from "./yui_toolbar.js";
import {register_c_yui_json_graph} from "./c_yui_json_graph.js";
import {attach_clear} from "./yui_inputs.js";

import {t} from "i18next";

import "./c_yui_json.css";


/***************************************************************
 *              Constants
 ***************************************************************/
const GCLASS_NAME = "C_YUI_JSON";

/*
 *  Hard cap on rows painted in one render pass.  A guard against an
 *  accidental "expand all" over a giant already-loaded document; the
 *  cap is announced in the tree (never silently truncated).
 */
const MAX_RENDER_ROWS = 5000;

/*
 *  Hard cap on characters painted by the text view.  Same guard as
 *  MAX_RENDER_ROWS, one layer down: a document the tree renders lazily
 *  is dumped whole here, so the cap is announced under the text and
 *  never applied silently.
 */
const MAX_TEXT_CHARS = 2000000;

/*
 *  How much of a container's id label fits beside its size.  It
 *  rides on a row whose job is to stay one line, and an id is
 *  usually short; the ones that are not are uuids, where the head
 *  is what a person compares anyway.
 */
const MAX_LABEL_CHARS = 40;

/*
 *  The three views, in switch order — this table IS the order of the
 *  buttons, and EV_SET_VIEW_MODE with no mode advances along it.
 *  Note the order is not the default: the viewer OPENS on the tree
 *  unless something says otherwise, it just sits second in the row.
 */
const VIEWS = [
    {mode: "text",  icon: "yi-code",          key: "text view"},
    {mode: "tree",  icon: "yi-sitemap",       key: "tree view"},
    {mode: "graph", icon: "yi-hexagon-nodes", key: "graph view"},
];

/*
 *  Where the reader's last choice of view is kept.  ONE key for the
 *  whole library and not one per host: which of the three views someone
 *  reads JSON in is a habit of the PERSON, not a property of the
 *  document, so the next document they open opens the way they read the
 *  last one.  It lives in localStorage, which is per browser and per
 *  artifact origin, and reaches nobody else.
 */
const VIEW_MODE_STORAGE_KEY = "yui_json_view_mode";

/***************************************************************
 *              Data
 ***************************************************************/
const attrs_table = [
/*---------------- Public Attributes ----------------*/
SDATA(data_type_t.DTP_POINTER,  "subscriber",   0,  null,   "Subscriber of output events"),

/*---------------- Config ----------------*/
SDATA(data_type_t.DTP_STRING,   "title",        0,  "",     "Optional header title (i18n key)"),
SDATA(data_type_t.DTP_JSON,     "json_data",    0,  null,   "Initial JSON to render (usually already collapsed)"),
SDATA(data_type_t.DTP_STRING,   "view_mode",    0,  "",     "View: 'tree' (lazy tree), 'text' (raw dump) or 'graph'. Empty means the host does not care: the reader's last choice wins, and the tree if there is none"),

/*---------------- UI ----------------*/
SDATA(data_type_t.DTP_POINTER,  "$container",   0,  null,   "HTMLElement root, mounted by the parent"),
SDATA_END()
];

let PRIVATE_DATA = {
    root:       null,   // working JSON tree (deep-copied, mutated on splice)
    expanded:   null,   // Set<string> of expanded absolute paths
    pending:    null,   // Set<string> of paths whose subtree is being fetched
    errors:     null,   // Map<string,string> of per-path expand errors
    search:     "",     // current search term (lower-cased)
    $tree:      null,   // the scrollable tree body element
    $text:      null,   // the scrollable text body element
    $text_body: null,   // the <pre> inside it
    $graph:     null,   // the graph body element
    graph_gobj: null,   // hosted C_YUI_JSON_GRAPH child (built on first use)
    $search:    null,   // the search input element
    $search_ctl: null,  // the search control (hidden in text view)
    $expand_btn: null,  // "expand loaded" button (hidden in text view)
    $collapse_btn: null,// "collapse all" button (hidden in text view)
    $mode_btns: null,   // Map<mode, HTMLElement> of the view switch
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

    priv.expanded = new Set();
    priv.pending = new Set();
    priv.errors = new Map();
    priv.search = "";

    let json_data = gobj_read_attr(gobj, "json_data");
    if(json_data !== null && json_data !== undefined) {
        priv.root = json_deep_copy(json_data);
    }

    build_ui(gobj);
    resolve_initial_view_mode(gobj);
    apply_view_mode(gobj);

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
    render_view(gobj);
}

/***************************************************************
 *          Framework Method: Stop
 ***************************************************************/
function mt_stop(gobj)
{
    /*
     *  The graph child dies with the parent's RUNNING state, not with
     *  its destruction, and the difference is not cosmetic:
     *  gobj_destroy() destroys the children BEFORE calling mt_destroy(),
     *  so tearing it down there arrived after the framework had already
     *  destroyed it — while it was still running.  Closing the window
     *  logged "Destroying a RUNNING gobj" for the child and then
     *  "gobj NULL or DESTROYED" for this gobj's own attempt to stop it.
     *
     *  Here it is stopped and destroyed while everything is still whole,
     *  and gobj_destroy() finds no child left to rescue.  A later
     *  gobj_start + a switch back to the graph rebuilds it, which is the
     *  same lazy path a first entry takes.
     */
    teardown_graph_child(gobj);
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

    let $toolbar = make_toolbar(gobj);

    let $container = createElement2(
        ['div', {class: 'C_YUI_JSON JSON_VIEWER view-card',
                 style: 'height:100%; display:flex; flex-direction:column;'}, [
            ['div', {class: 'JSON_TOOLBAR is-flex-grow-0'}, [$toolbar]],
            ['div', {class: 'JSON_TREE is-flex-grow-1',
                     style: 'flex:1 1 auto; min-height:0; overflow:auto;'}, []],
            ['div', {class: 'JSON_TEXT is-flex-grow-1 is-hidden',
                     style: 'flex:1 1 auto; min-height:0; overflow:auto;'}, []],
            /*  The graph body does NOT scroll: G6 owns its viewport and
             *  pans inside it.  An `overflow:auto` here would give the
             *  canvas a second, competing scroller.  */
            ['div', {class: 'JSON_GRAPH is-flex-grow-1 is-hidden',
                     style: 'flex:1 1 auto; overflow:hidden;'}, []]
        ]]
    );

    gobj_write_attr(gobj, "$container", $container);
    priv.$tree = $container.querySelector('.JSON_TREE');
    priv.$text = $container.querySelector('.JSON_TEXT');
    priv.$search = $container.querySelector('.JSON_SEARCH');
    priv.$search_ctl = $container.querySelector('.JSON_SEARCH_CONTROL');
    priv.$expand_btn = $container.querySelector('.EV_EXPAND_ALL');
    priv.$collapse_btn = $container.querySelector('.EV_COLLAPSE_ALL');
    priv.$graph = $container.querySelector('.JSON_GRAPH');
    priv.$mode_btns = new Map();
    VIEWS.forEach(function(v) {
        let $btn = $container.querySelector('.JSON_VIEW_MODE_' + v.mode.toUpperCase());
        if($btn) {
            priv.$mode_btns.set(v.mode, $btn);
        }
    });

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
    priv.$tree = null;
    priv.$text = null;
    priv.$text_body = null;
    priv.$graph = null;
    priv.$search = null;
    priv.$search_ctl = null;
    priv.$expand_btn = null;
    priv.$collapse_btn = null;
    priv.$mode_btns = null;
}

/************************************************************
 *   Toolbar: search + tree/text switch + expand-all /
 *   collapse-all / copy
 ************************************************************/
function make_toolbar(gobj)
{
    let title = gobj_read_str_attr(gobj, "title");

    let left_items = [];
    if(title) {
        left_items.push(
            /*  is-hidden-mobile: on a phone the toolbar cannot hold the
             *  title AND a usable search AND six buttons, and the title
             *  is the one thing the host usually repeats — a dialog
             *  header, a card heading — so it is the one that goes. */
            ['span', {class: 'JSON_TITLE is-flex is-align-items-center px-2 is-hidden-mobile',
                      style: 'font-weight:600;', 'data-i18n': title}, title]
        );
    }
    /*  Search box: a magnifier on the left and the NORM clear (✕) via
     *  attach_clear on the right. Clearing dispatches a synthetic `input`,
     *  which re-fires EV_SEARCH with an empty term through the FSM.  */
    let $search_input = createElement2(
        ['input', {class: 'JSON_SEARCH input', type: 'text',
                   placeholder: t("search")}, [], {
            input: function(evt) {
                gobj_send_event(gobj, "EV_SEARCH", {text: evt.target.value}, gobj);
            }
        }]);
    let $search_control = createElement2(
        ['div', {class: 'control has-icons-left JSON_SEARCH_CONTROL',
                 style: 'max-width:22em;'}, [
            $search_input,
            ['span', {class: 'icon is-left'}, [['i', {class: 'yi-magnifying-glass'}]]]
        ]]);
    /*  The GLOBAL fold leads the row, ahead of the find box — the same
     *  place both graphs put theirs.  It opens the whole document; the
     *  per-row toggles live in the rows.  */
    left_items.push(
        icon_button(gobj, "yi-chevron-right", "EV_EXPAND_ALL",   "expand loaded"),
        icon_button(gobj, "yi-chevron-right", "EV_COLLAPSE_ALL", "collapse all")
    );

    attach_clear($search_control, $search_input);
    left_items.push($search_control);

    let right_items = [
        view_mode_switch(gobj),
        icon_button(gobj, "yi-copy", "EV_COPY_ALL", "copy json"),
    ];

    const $toolbar = yui_toolbar({}, [
        ['div', {class: 'yui-horizontal-toolbar-section left is-flex is-align-items-center',
                 style: 'gap:.25rem;'}, left_items],
        ['div', {class: 'yui-horizontal-toolbar-section center'}, []],
        ['div', {class: 'yui-horizontal-toolbar-section right is-flex is-align-items-center',
                 style: 'gap:.25rem;'}, right_items],
    ]);

    refresh_language($toolbar, t);
    return $toolbar;
}

/************************************************************
 *   A single icon toolbar button that fires `event_name`
 ************************************************************/
function icon_button(gobj, icon, event_name, label_key)
{
    return ['button', {class: `button ${event_name}`, style: 'width:2.5em;',
                       title: t(label_key), 'data-i18n-title': label_key,
                       'aria-label': t(label_key), 'data-i18n-aria-label': label_key}, [
        ['span', {class: 'icon'}, [['i', {class: icon}]]]
    ], {
        click: function(evt) {
            evt.stopPropagation();
            gobj_send_event(gobj, event_name, {}, gobj);
        }
    }];
}

/************************************************************
 *   The view switch: one button per view, the current one marked.
 *
 *   Three views do not fit a toggle.  A button that CYCLES cannot be
 *   aimed — reaching the graph from the tree would mean passing
 *   through the text and rebuilding it on the way — so each view gets
 *   its own button and says where it goes.  apply_view_mode() moves
 *   the `is-active` mark.
 ************************************************************/
function view_mode_switch(gobj)
{
    let buttons = VIEWS.map(function(v) {
        let label = view_label(v.mode);
        return ['button', {class: `button JSON_VIEW_MODE JSON_VIEW_MODE_${v.mode.toUpperCase()}`,
                           type: 'button', style: 'width:2.5em;',
                           title: label, 'data-i18n-title': v.key,
                           'aria-label': label, 'data-i18n-aria-label': v.key}, [
            ['span', {class: 'icon'}, [['i', {class: v.icon}]]]
        ], {
            click: function(evt) {
                evt.stopPropagation();
                gobj_send_event(gobj, "EV_SET_VIEW_MODE", {mode: v.mode}, gobj);
            }
        }];
    });

    return ['div', {class: 'buttons has-addons is-flex-wrap-nowrap mb-0 JSON_VIEW_SWITCH'},
            buttons];
}

/************************************************************
 *   The label of a view, with every key SPELLED OUT inside t().
 *
 *   Never t(VIEWS[i].key): the apps' validate-locales scans for
 *   t("literal"), so a key reached through a variable is a key it
 *   cannot demand — and i18next answers an undefined key with the key
 *   ITSELF, which renders in lower-case English and never changes
 *   language.  That shipped once already (7.20.0, `tree view`); this
 *   table would have hidden all three.
 ************************************************************/
function view_label(mode)
{
    switch(mode) {
        case "text":
            return t("text view");
        case "graph":
            return t("graph view");
        default:
            return t("tree view");
    }
}

/************************************************************
 *   The view the viewer OPENS on.
 *
 *   Three answers, in order of authority: what the HOST asked for, what
 *   the READER chose last time, and the tree.  The host wins because a
 *   viewer mounted to show a graph has to show one; the memory comes
 *   next, because reopening a document in the view you just left is the
 *   whole point of remembering it; the tree is the floor.
 *
 *   This is why the attr no longer declares "tree" as its default: as a
 *   default and as a host's explicit choice it was the same string, so
 *   nothing could tell "show me the tree" from "I have no opinion", and
 *   a memory that cannot see the difference has to lose to both.
 *
 *   Resolved ONCE here and written into the attr, so every later read
 *   is a plain attr read and no render touches the store.
 ************************************************************/
function resolve_initial_view_mode(gobj)
{
    let mode = pick_view_mode(
        gobj_read_str_attr(gobj, "view_mode"),
        kw_get_local_storage_value(VIEW_MODE_STORAGE_KEY, "", false),
        VIEWS.map((v) => v.mode),
        "tree"
    );
    gobj_write_attr(gobj, "view_mode", mode);
}

/************************************************************
 *   The current view, normalised.  Anything unknown is the tree.
 ************************************************************/
function current_view_mode(gobj)
{
    let mode = gobj_read_str_attr(gobj, "view_mode");
    return VIEWS.some((v) => v.mode === mode)? mode: "tree";
}

/************************************************************
 *   Show the chrome of the current view and hide the other's.
 ************************************************************/
function apply_view_mode(gobj)
{
    let priv = gobj.priv;
    let mode = current_view_mode(gobj);

    let bodies = {tree: priv.$tree, text: priv.$text, graph: priv.$graph};
    for(let [m, $el] of Object.entries(bodies)) {
        if($el) {
            $el.classList.toggle('is-hidden', m !== mode);
        }
    }

    /*
     *  Search and expand/collapse act on TREE rows; the other two views
     *  have no rows to act on, and a control that answers nothing is
     *  worse than an absent one.  A <pre> is searched with the browser's
     *  own Ctrl+F, and the graph carries its own controls.
     */
    [priv.$search_ctl, priv.$expand_btn, priv.$collapse_btn].forEach(function($el) {
        if($el) {
            $el.classList.toggle('is-hidden', mode !== "tree");
        }
    });

    if(priv.$mode_btns) {
        for(let [m, $btn] of priv.$mode_btns) {
            $btn.classList.toggle('is-active', m === mode);
            $btn.setAttribute("aria-pressed", (m === mode)? "true": "false");
        }
    }
}

/************************************************************
 *   Render whichever view is current.
 ************************************************************/
function render_view(gobj)
{
    switch(current_view_mode(gobj)) {
        case "text":
            render_text(gobj);
            break;
        case "graph":
            render_graph(gobj);
            break;
        default:
            render_tree(gobj);
            break;
    }
}

/************************************************************
 *   Render the graph view.
 *
 *   The C_YUI_JSON_GRAPH child is built HERE, on first entry, and
 *   never in build_ui: G6 sizes itself from its container, and a
 *   container behind `is-hidden` measures 0x0.  By the time this
 *   runs apply_view_mode() has already revealed the body.
 ************************************************************/
function render_graph(gobj)
{
    let priv = gobj.priv;
    let $graph = priv.$graph;
    if(!$graph) {
        return;
    }

    if(priv.root === null || priv.root === undefined) {
        teardown_graph_child(gobj);
        $graph.textContent = "";
        $graph.appendChild(createElement2(
            ['div', {class: 'JSON_EMPTY has-text-grey p-3', 'data-i18n': 'no data'}, 'no data']
        ));
        refresh_language($graph, t);
        return;
    }

    if(!priv.graph_gobj) {
        $graph.textContent = "";
        if(!build_graph_child(gobj)) {
            return;   // Error already logged
        }
    }

    /*  The document, and then the size: the container may have changed
     *  while this view was hidden, and G6 does not watch it. */
    gobj_send_event(priv.graph_gobj, "EV_LOAD_DATA",
        {data: priv.root, path: gobj_read_str_attr(gobj, "title") || ""}, gobj);
    gobj_send_event(priv.graph_gobj, "EV_RESIZE", {}, gobj);
}

/************************************************************
 *   Build and mount the hosted graph child.  Returns true on
 *   success; every failure path logs.
 ************************************************************/
function build_graph_child(gobj)
{
    let priv = gobj.priv;

    let graph = gobj_create_pure_child(
        "graph_" + clean_name(gobj_name(gobj)),
        "C_YUI_JSON_GRAPH",
        {},
        gobj
    );
    if(!graph) {
        log_error(`${gobj_short_name(gobj)}: cannot create the graph viewer`);
        return false;
    }

    let $box = gobj_read_attr(graph, "$container");
    if(!$box) {
        log_error(`${gobj_short_name(gobj)}: the graph viewer built no $container`);
        gobj_destroy(graph);
        return false;
    }

    /*  Mounted BEFORE gobj_start: mt_start builds the G6 graph and
     *  measures the canvas, which is 0x0 while it is still detached. */
    priv.$graph.appendChild($box);
    priv.graph_gobj = graph;
    gobj_start(graph);
    return true;
}

/************************************************************
 *   Destroy the hosted graph child, if any.
 ************************************************************/
function teardown_graph_child(gobj)
{
    let priv = gobj.priv;
    if(priv.graph_gobj) {
        if(gobj_is_running(priv.graph_gobj)) {
            gobj_stop(priv.graph_gobj);
        }
        gobj_destroy(priv.graph_gobj);
        priv.graph_gobj = null;
    }
}

/************************************************************
 *   Render the text view: the whole loaded document, verbatim.
 *
 *   Unlike the tree, nothing here is lazy — what the client holds is
 *   what it prints, `__collapsed__` sentinels included.  Over
 *   MAX_TEXT_CHARS the dump is cut and the cut is announced.
 ************************************************************/
function render_text(gobj)
{
    let priv = gobj.priv;
    let $text = priv.$text;
    if(!$text) {
        return;
    }

    let scroll_top = $text.scrollTop;
    $text.textContent = "";
    priv.$text_body = null;

    if(priv.root === null || priv.root === undefined) {
        $text.appendChild(createElement2(
            ['div', {class: 'JSON_EMPTY has-text-grey p-3', 'data-i18n': 'no data'}, 'no data']
        ));
        return;
    }

    let dump = json_text_dump(priv.root, MAX_TEXT_CHARS);
    if(dump.error) {
        log_error(`${GCLASS_NAME}: cannot dump the document as text: ${dump.error}`);
    }

    /*  textContent, not a createElement2 child: the dump is raw text
     *  that must reach the DOM untouched, and createElement2 trims its
     *  text nodes. */
    let $pre = createElement2(['pre', {class: 'JSON_TEXT_BODY'}, []]);
    $pre.textContent = dump.text;
    $text.appendChild($pre);
    priv.$text_body = $pre;

    if(dump.capped) {
        $text.appendChild(createElement2(
            ['div', {class: 'JSON_CAPPED has-text-warning p-2',
                     'data-i18n': 'text truncated; collapse some branches'},
             'text truncated; collapse some branches']
        ));
    }

    refresh_language($text, t);
    $text.scrollTop = scroll_top;
}

/************************************************************
 *   Re-render the whole tree from priv.root + priv.expanded.
 *
 *   Only expanded containers are walked, so the DOM size is
 *   bounded by what the user opened, not by the document size.
 ************************************************************/
function render_tree(gobj)
{
    let priv = gobj.priv;
    let $tree = priv.$tree;
    if(!$tree) {
        return;
    }

    let scroll_top = $tree.scrollTop;
    $tree.textContent = "";

    if(priv.root === null || priv.root === undefined) {
        $tree.appendChild(createElement2(
            ['div', {class: 'JSON_EMPTY has-text-grey p-3', 'data-i18n': 'no data'}, 'no data']
        ));
        return;
    }

    let ctx = {gobj: gobj, term: priv.search, count: 0, capped: false};
    let rows = [];

    let type = json_type(priv.root);
    if(is_collapsed(priv.root)) {
        push_collapsed_row(ctx, priv.root, [], 0, "", rows);
    } else if(type === "object") {
        for(let [k, v] of Object.entries(priv.root)) {
            push_entry_rows(ctx, k, v, [k], 0, rows);
        }
    } else if(type === "array") {
        priv.root.forEach(function(v, i) {
            push_entry_rows(ctx, i, v, [String(i)], 0, rows);
        });
    } else {
        push_entry_rows(ctx, null, priv.root, [], 0, rows);
    }

    if(ctx.capped) {
        rows.push(['div', {class: 'JSON_CAPPED has-text-warning p-2',
                           'data-i18n': 'too many rows; collapse some branches'},
                   'too many rows; collapse some branches']);
    }

    $tree.appendChild(createElement2(['div', {class: 'JSON_ROWS'}, rows]));
    refresh_language($tree, t);
    $tree.scrollTop = scroll_top;
}

/************************************************************
 *   Render one entry (key -> value) into `rows`.
 *   Dispatches to collapsed-stub / container / leaf.
 ************************************************************/
function push_entry_rows(ctx, key, value, segments, depth, rows)
{
    if(ctx.count >= MAX_RENDER_ROWS) {
        ctx.capped = true;
        return;
    }

    let term = ctx.term;
    let key_match = term && key !== null && String(key).toLowerCase().includes(term);

    if(is_collapsed(value)) {
        /*
         *  A not-yet-loaded subtree: searchable only by its key.
         */
        if(term && !key_match) {
            return;
        }
        push_collapsed_row(ctx, value, segments, depth, key, rows);
        return;
    }

    let type = json_type(value);
    if(type === "object" || type === "array") {
        if(term && !key_match && !subtree_matches(value, term)) {
            return;
        }
        push_container_rows(ctx, key, value, segments, depth, rows, key_match);
        return;
    }

    /*
     *  Leaf (primitive)
     */
    if(term && !key_match && !String_of(value).toLowerCase().includes(term)) {
        return;
    }
    ctx.count++;
    rows.push(leaf_row(key, value, depth));
}

/************************************************************
 *   Container (object/array) row + its expanded children
 ************************************************************/
function push_container_rows(ctx, key, value, segments, depth, rows, key_match)
{
    let priv = ctx.gobj.priv;
    let path = seg_join(segments);
    let is_object = json_type(value) === "object";
    let size = is_object ? json_object_size(value) : value.length;

    /*
     *  Auto-expand while searching so matches are visible; otherwise
     *  honour the user's expand/collapse state.
     */
    let searching_match = ctx.term && !key_match && subtree_matches(value, ctx.term);
    let open = priv.expanded.has(path) || searching_match;

    ctx.count++;
    rows.push(toggle_row(ctx.gobj, key, size, is_object, depth, path, open, value));

    if(!open) {
        return;
    }

    if(is_object) {
        for(let [k, v] of Object.entries(value)) {
            push_entry_rows(ctx, k, v, segments.concat(k), depth + 1, rows);
        }
    } else {
        value.forEach(function(v, i) {
            push_entry_rows(ctx, i, v, segments.concat(String(i)), depth + 1, rows);
        });
    }
}

/************************************************************
 *   Collapsed-sentinel stub row (fetch-on-open)
 ************************************************************/
function push_collapsed_row(ctx, value, segments, depth, key, rows)
{
    let priv = ctx.gobj.priv;
    let path = seg_join(segments);
    let info = is_collapsed(value) || {};
    let size = info.size;
    let is_pending = priv.pending.has(path);
    let err = priv.errors.get(path);

    ctx.count++;

    let key_spec = (key === null || key === "")
        ? null
        : ['span', {class: 'JSON_KEY'}, String(key)];

    let stub_text = (info.is_array ? "[" : "{") +
        (size !== undefined ? String(size) : "?") +
        (info.is_array ? "]" : "}");

    let children = [];
    if(key_spec) {
        children.push(key_spec);
        children.push(['span', {class: 'JSON_PUNCT'}, ': ']);
    }
    children.push(['span', {class: 'JSON_STUB'}, stub_text]);
    children.push(['span', {class: 'JSON_STUB_HINT is-size-7 ml-2',
                            'data-i18n': is_pending ? 'loading' : 'click to load'},
                   is_pending ? 'loading' : 'click to load']);
    if(err) {
        children.push(['span', {class: 'JSON_STUB_ERR has-text-danger is-size-7 ml-2'}, String(err)]);
    }

    let attrs = {
        class: 'JSON_ROW JSON_COLLAPSED' + (is_pending ? ' is-pending' : ''),
        style: row_indent(depth),
    };
    let events = is_pending ? undefined : {
        click: function(evt) {
            evt.stopPropagation();
            gobj_send_event(ctx.gobj, "EV_EXPAND_COLLAPSED",
                {path: path, size: size}, ctx.gobj);
        }
    };

    let content = [
        ['span', {class: 'JSON_TOGGLE JSON_TOGGLE_REMOTE'}, [['i', {class: 'yi-plus'}]]],
        ['span', {class: 'JSON_ROW_BODY'}, children],
    ];
    rows.push(events ? ['div', attrs, content, events] : ['div', attrs, content]);
}

/************************************************************
 *   Expandable container header row
 ************************************************************/
function toggle_row(gobj, key, size, is_object, depth, path, open, value)
{
    let summary = (is_object ? "{" : "[") + String(size) + (is_object ? "}" : "]");

    let body = [];
    if(key !== null && key !== "") {
        body.push(['span', {class: 'JSON_KEY'}, String(key)]);
        body.push(['span', {class: 'JSON_PUNCT'}, ': ']);
    }
    body.push(['span', {class: 'JSON_SUMMARY has-text-grey'}, summary]);

    /*
     *  A dict that carries an id says WHICH one it is, right here.
     *  Inside an array of records -- which is what a topic's nodes
     *  are -- the row read `2: {15}` and the only way to tell record
     *  2 from record 9 was to open both.
     *
     *  Shown open as well as closed: it is the row's label, and a
     *  label that disappears when you expand makes the row jump and
     *  costs you the name of the thing you just opened.
     */
    let label = container_label(value, MAX_LABEL_CHARS);
    if(label) {
        body.push(['span', {class: 'JSON_SUMMARY_ID ml-2'}, label]);
    }

    return ['div', {class: 'JSON_ROW JSON_CONTAINER', style: row_indent(depth)}, [
        ['span', {class: 'JSON_TOGGLE' + (open ? ' is-open' : '')}, [
            ['i', {class: 'yi-chevron-right'}]
        ]],
        ['span', {class: 'JSON_ROW_BODY'}, body],
    ], {
        click: function(evt) {
            evt.stopPropagation();
            gobj_send_event(gobj, "EV_TOGGLE_NODE", {path: path}, gobj);
        }
    }];
}

/************************************************************
 *   Leaf (primitive) row, type-coloured, timestamp-tagged
 ************************************************************/
function leaf_row(key, value, depth)
{
    let type = json_type(value);
    let text;
    switch(type) {
        case "string":
            text = '"' + value + '"';
            break;
        case "null":
            text = "null";
            break;
        case "boolean":
            text = value ? "true" : "false";
            break;
        default:
            text = String(value);
            break;
    }

    let body = [];
    if(key !== null && key !== "") {
        body.push(['span', {class: 'JSON_KEY'}, String(key)]);
        body.push(['span', {class: 'JSON_PUNCT'}, ': ']);
    }
    body.push(['span', {class: 'JSON_VALUE JSON_TYPE_' + type.toUpperCase()}, text]);

    if(key !== null && is_time_field(String(key))) {
        let wall = format_epoch(value);
        if(wall) {
            body.push(['span', {class: 'JSON_TIME is-size-7 has-text-grey ml-2'}, wall]);
        }
    }

    return ['div', {class: 'JSON_ROW JSON_LEAF', style: row_indent(depth)}, [
        ['span', {class: 'JSON_TOGGLE JSON_TOGGLE_SPACER'}, []],
        ['span', {class: 'JSON_ROW_BODY'}, body],
    ]];
}

/************************************************************
 *   Depth indentation (inline style keeps it CSS-framework free).
 *
 *   FOUR characters per level, house rule: structure is read as
 *   indentation, and it has to be the same four everywhere — this
 *   viewer, the raw dump behind it, the site map's tree.  `ch` is
 *   the character width of the row's own font, so the rows line up
 *   with the monospace text they carry instead of drifting from it
 *   at some zoom level.
 ************************************************************/
const INDENT_CH = 4;
const INDENT_PAD = 0.4;

function row_indent(depth)
{
    /*  `background-size` bounds the depth guides painted by the CSS to
     *  this row's own indentation: one vertical line per ancestor
     *  level, none across the content. */
    return 'padding-left:' + (INDENT_PAD + depth * INDENT_CH) + 'ch;' +
           'background-size:' + (depth * INDENT_CH) + 'ch 100%;';
}

/************************************************************
 *   String() that never throws on a non-primitive
 ************************************************************/
function String_of(value)
{
    try {
        return String(value);
    } catch(e) {
        return "";
    }
}

/************************************************************
 *   Recursively collect every loaded container path (for
 *   "expand loaded").  Collapsed sentinels are NOT expanded.
 ************************************************************/
function collect_loaded_paths(value, segments, out)
{
    if(is_collapsed(value)) {
        return;
    }
    let type = json_type(value);
    if(type === "object") {
        out.push(seg_join(segments));
        for(let [k, v] of Object.entries(value)) {
            collect_loaded_paths(v, segments.concat(k), out);
        }
    } else if(type === "array") {
        out.push(seg_join(segments));
        value.forEach(function(v, i) {
            collect_loaded_paths(v, segments.concat(String(i)), out);
        });
    }
}




                    /***************************
                     *      Actions
                     ***************************/




/************************************************************
 *   EV_SET_JSON { json } — replace the whole document
 ************************************************************/
function ac_set_json(gobj, event, kw, src)
{
    let priv = gobj.priv;

    priv.root = (kw.json === undefined || kw.json === null)
        ? null
        : json_deep_copy(kw.json);
    priv.expanded.clear();
    priv.pending.clear();
    priv.errors.clear();

    render_view(gobj);
    return 0;
}

/************************************************************
 *   EV_SUBTREE_LOADED { path, json } — splice a fetched subtree
 ************************************************************/
function ac_subtree_loaded(gobj, event, kw, src)
{
    let priv = gobj.priv;

    let path = kw.path || "";
    let segments = seg_split(path);

    if(segments.length === 0) {
        priv.root = (kw.json === undefined) ? null : json_deep_copy(kw.json);
    } else {
        priv.root = set_by_segments(priv.root, segments, json_deep_copy(kw.json));
    }

    priv.pending.delete(path);
    priv.errors.delete(path);
    if(path) {
        priv.expanded.add(path);   // reveal what we just loaded
    }

    render_view(gobj);
    return 0;
}

/************************************************************
 *   EV_SUBTREE_ERROR { path, error } — mark the failed branch
 ************************************************************/
function ac_subtree_error(gobj, event, kw, src)
{
    let priv = gobj.priv;

    let path = kw.path || "";
    priv.pending.delete(path);
    priv.errors.set(path, kw.error || "error");

    log_error(`${GCLASS_NAME}: subtree load failed at '${path}': ${kw.error || ""}`);

    render_view(gobj);
    return 0;
}

/************************************************************
 *   EV_TOGGLE_NODE { path } — expand/collapse a loaded container
 ************************************************************/
function ac_toggle_node(gobj, event, kw, src)
{
    let priv = gobj.priv;
    let path = kw.path || "";

    if(priv.expanded.has(path)) {
        priv.expanded.delete(path);
    } else {
        priv.expanded.add(path);
    }

    render_view(gobj);
    return 0;
}

/************************************************************
 *   EV_EXPAND_COLLAPSED { path, size } — ask the subscriber to
 *   load a truncated subtree, then republish EV_EXPAND_PATH.
 ************************************************************/
function ac_expand_collapsed(gobj, event, kw, src)
{
    let priv = gobj.priv;
    let path = kw.path || "";

    if(priv.pending.has(path)) {
        return 0;
    }
    priv.pending.add(path);
    priv.errors.delete(path);

    render_view(gobj);   // show the "loading…" state

    gobj_publish_event(gobj, "EV_EXPAND_PATH", {path: path, size: kw.size});
    return 0;
}

/************************************************************
 *   EV_SEARCH { text }
 ************************************************************/
function ac_search(gobj, event, kw, src)
{
    let priv = gobj.priv;
    priv.search = (kw.text || "").trim().toLowerCase();
    render_view(gobj);
    return 0;
}

/************************************************************
 *   EV_EXPAND_ALL — expand every already-loaded container
 ************************************************************/
function ac_expand_all(gobj, event, kw, src)
{
    let priv = gobj.priv;
    if(priv.root === null || priv.root === undefined) {
        return 0;
    }

    let paths = [];
    let type = json_type(priv.root);
    if(type === "object") {
        for(let [k, v] of Object.entries(priv.root)) {
            collect_loaded_paths(v, [k], paths);
        }
    } else if(type === "array") {
        priv.root.forEach(function(v, i) {
            collect_loaded_paths(v, [String(i)], paths);
        });
    }
    paths.forEach(function(p) {
        priv.expanded.add(p);
    });

    render_view(gobj);
    return 0;
}

/************************************************************
 *   EV_COLLAPSE_ALL
 ************************************************************/
function ac_collapse_all(gobj, event, kw, src)
{
    let priv = gobj.priv;
    priv.expanded.clear();
    render_view(gobj);
    return 0;
}

/************************************************************
 *   EV_COPY_ALL — copy the working document to the clipboard
 ************************************************************/
function ac_copy_all(gobj, event, kw, src)
{
    let priv = gobj.priv;
    if(priv.root === null || priv.root === undefined) {
        return 0;
    }
    let dump = json_text_dump(priv.root, 0);
    if(dump.error) {
        log_error(`${GCLASS_NAME}: cannot copy the document: ${dump.error}`);
        return -1;
    }
    let text = dump.text;
    if(navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).catch(function(e) {
            log_error(`${GCLASS_NAME}: clipboard write failed: ${e}`);
        });
    } else {
        log_error(`${GCLASS_NAME}: clipboard API unavailable`);
    }
    return 0;
}

/************************************************************
 *   EV_SET_VIEW_MODE { mode } — "tree" | "text" | "graph".
 *
 *   With no mode it ADVANCES to the next view in VIEWS order, which
 *   is what the two-view toggle did when the list was two long.  The
 *   toolbar buttons always name their mode.
 *
 *   Whatever lands here is REMEMBERED, so the next viewer opens on it.
 ************************************************************/
function ac_set_view_mode(gobj, event, kw, src)
{
    let mode = kw.mode;

    if(mode === undefined || mode === null || mode === "") {
        let i = VIEWS.findIndex((v) => v.mode === current_view_mode(gobj));
        mode = VIEWS[(i + 1) % VIEWS.length].mode;
    } else if(!VIEWS.some((v) => v.mode === mode)) {
        log_error(`${GCLASS_NAME}: unknown view_mode '${mode}'`);
        return -1;
    }

    if(mode === current_view_mode(gobj)) {
        return 0;   // already there; re-rendering the graph would relayout it
    }

    gobj_write_attr(gobj, "view_mode", mode);

    /*
     *  Remembered here and not in resolve_initial_view_mode(): only a
     *  view the READER picked is a preference.  A mode a host pinned, or
     *  the tree we fell back to, would otherwise be written back as if
     *  somebody had chosen it.
     */
    kw_set_local_storage_value(VIEW_MODE_STORAGE_KEY, mode);

    apply_view_mode(gobj);
    render_view(gobj);
    return 0;
}

/************************************************************
 *   EV_JSON_ITEM_CLICKED — from the hosted graph child.
 *
 *   It STOPS here, and that is deliberate.  7.21.0 republished
 *   it "so the host has one contract", which got the framework
 *   backwards: this viewer is a CHILD of its host and subscribes
 *   it to everything it publishes, so a new output event is a
 *   new MANDATORY declaration in every host's FSM.  None of the
 *   six that mount this viewer asked for node clicks, and every
 *   one of them answered a click on a graph card with
 *   "Event NOT DEFINED in state".
 *
 *   A host that wants node clicks mounts C_YUI_JSON_GRAPH
 *   itself — that gclass publishes them, and a host that mounts
 *   it has declared them.
 ************************************************************/
function ac_json_item_clicked(gobj, event, kw, src)
{
    return 0;
}

/************************************************************
 *   EV_LANGUAGE_CHANGED — re-translate chrome + re-render
 ************************************************************/
function ac_language_changed(gobj, event, kw, src)
{
    let priv = gobj.priv;
    let $container = gobj_read_attr(gobj, "$container");
    if($container) {
        refresh_language($container, t);
        if(priv.$search) {
            priv.$search.setAttribute("placeholder", t("search"));
        }
        apply_view_mode(gobj);
    }
    render_view(gobj);
    return 0;
}

/************************************************************
 *   EV_SHOW / EV_HIDE — host visibility
 ************************************************************/
function ac_show(gobj, event, kw, src)
{
    let $container = gobj_read_attr(gobj, "$container");
    if($container) {
        $container.classList.remove('is-hidden');
    }
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

/************************************************************
 *   EV_REFRESH
 ************************************************************/
function ac_refresh(gobj, event, kw, src)
{
    render_view(gobj);
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
        ["ST_EMPTY", [
            ["EV_SET_JSON",         ac_set_json,            "ST_READY"],
            ["EV_SET_VIEW_MODE",    ac_set_view_mode,       null],
            ["EV_LANGUAGE_CHANGED", ac_language_changed,    null],
            ["EV_REFRESH",          ac_refresh,             null],
            ["EV_SHOW",             ac_show,                null],
            ["EV_HIDE",             ac_hide,                null]
        ]],
        ["ST_READY", [
            ["EV_SET_JSON",         ac_set_json,            null],
            ["EV_JSON_ITEM_CLICKED", ac_json_item_clicked,  null],
            ["EV_SUBTREE_LOADED",   ac_subtree_loaded,      null],
            ["EV_SUBTREE_ERROR",    ac_subtree_error,       null],
            ["EV_TOGGLE_NODE",      ac_toggle_node,         null],
            ["EV_EXPAND_COLLAPSED", ac_expand_collapsed,    null],
            ["EV_SEARCH",           ac_search,              null],
            ["EV_EXPAND_ALL",       ac_expand_all,          null],
            ["EV_COLLAPSE_ALL",     ac_collapse_all,        null],
            ["EV_COPY_ALL",         ac_copy_all,            null],
            ["EV_SET_VIEW_MODE",    ac_set_view_mode,       null],
            ["EV_LANGUAGE_CHANGED", ac_language_changed,    null],
            ["EV_REFRESH",          ac_refresh,             null],
            ["EV_SHOW",             ac_show,                null],
            ["EV_HIDE",             ac_hide,                null]
        ]]
    ];

    /*---------------------------------------------*
     *          Events
     *---------------------------------------------*/
    const event_types = [
        ["EV_SET_JSON",         0],
        ["EV_SUBTREE_LOADED",   0],
        ["EV_SUBTREE_ERROR",    0],
        ["EV_TOGGLE_NODE",      0],
        ["EV_EXPAND_COLLAPSED", 0],
        ["EV_SEARCH",           0],
        ["EV_EXPAND_ALL",       0],
        ["EV_COLLAPSE_ALL",     0],
        ["EV_COPY_ALL",         0],
        ["EV_SET_VIEW_MODE",    0],
        ["EV_JSON_ITEM_CLICKED", 0],
        ["EV_LANGUAGE_CHANGED", 0],
        ["EV_REFRESH",          0],
        ["EV_SHOW",             0],
        ["EV_HIDE",             0],
        ["EV_EXPAND_PATH",      event_flag_t.EVF_OUTPUT_EVENT|event_flag_t.EVF_NO_WARN_SUBS]
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
function register_c_yui_json()
{
    /*  Idempotent: C_YUI_TREEDB_TOPIC_WITH_FORM auto-registers this
     *  gclass for its schema dialog, so an app that also registers it
     *  explicitly (order-independent) must not trip
     *  "GClass ALREADY created".  */
    if(gclass_find_by_name(GCLASS_NAME, false)) {
        return 0;
    }
    /*  The graph view hosts a C_YUI_JSON_GRAPH child: make sure its
     *  gclass exists even if the app never registered it (same
     *  arrangement C_YUI_TREEDB_TOPIC_WITH_FORM makes for this one).  */
    if(!gclass_find_by_name("C_YUI_JSON_GRAPH", false)) {
        register_c_yui_json_graph();
    }
    return create_gclass(GCLASS_NAME);
}

export { register_c_yui_json };
