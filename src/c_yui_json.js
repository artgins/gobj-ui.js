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
 *  TWO VIEWS over the same working document, chosen by the `view_mode`
 *  attr ("tree" | "text") and switched from the toolbar: the lazy tree
 *  above, and the raw `JSON.stringify(…, 4)` dump of what is currently
 *  loaded.  The text view is what you reach for to read a document as
 *  it is written, to select a slab of it, or to search it with the
 *  browser's own Ctrl+F; it shows the `__collapsed__` sentinels
 *  verbatim, because that is honestly what the client holds.  The
 *  tree-only controls (search, expand/collapse) hide with the tree.
 *
 *  DOM is self-describing (UPPER_SNAKE logical classes): JSON_VIEWER /
 *  JSON_TOOLBAR / JSON_SEARCH / JSON_VIEW_MODE / JSON_TREE / JSON_TEXT /
 *  JSON_TEXT_BODY / JSON_ROW / JSON_KEY / JSON_VALUE / JSON_SUMMARY /
 *  JSON_COLLAPSED / JSON_TIME.
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
    gobj_read_attr,
    gobj_write_attr,
    gobj_read_str_attr,
    gobj_send_event,
    gobj_publish_event,
    createElement2,
    json_deep_copy,
    json_object_size,
    refresh_language,
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
} from "./json_view_helpers.js";

import {yui_toolbar} from "./yui_toolbar.js";
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

/***************************************************************
 *              Data
 ***************************************************************/
const attrs_table = [
/*---------------- Public Attributes ----------------*/
SDATA(data_type_t.DTP_POINTER,  "subscriber",   0,  null,   "Subscriber of output events"),

/*---------------- Config ----------------*/
SDATA(data_type_t.DTP_STRING,   "title",        0,  "",     "Optional header title (i18n key)"),
SDATA(data_type_t.DTP_JSON,     "json_data",    0,  null,   "Initial JSON to render (usually already collapsed)"),
SDATA(data_type_t.DTP_STRING,   "view_mode",    0,  "tree", "View: 'tree' (lazy tree) or 'text' (raw JSON dump)"),

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
    $search:    null,   // the search input element
    $search_ctl: null,  // the search control (hidden in text view)
    $expand_btn: null,  // "expand loaded" button (hidden in text view)
    $collapse_btn: null,// "collapse all" button (hidden in text view)
    $mode_btn:  null,   // the tree/text switch
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
                     style: 'flex:1 1 auto; min-height:0; overflow:auto;'}, []]
        ]]
    );

    gobj_write_attr(gobj, "$container", $container);
    priv.$tree = $container.querySelector('.JSON_TREE');
    priv.$text = $container.querySelector('.JSON_TEXT');
    priv.$search = $container.querySelector('.JSON_SEARCH');
    priv.$search_ctl = $container.querySelector('.JSON_SEARCH_CONTROL');
    priv.$expand_btn = $container.querySelector('.EV_EXPAND_ALL');
    priv.$collapse_btn = $container.querySelector('.EV_COLLAPSE_ALL');
    priv.$mode_btn = $container.querySelector('.JSON_VIEW_MODE');

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
    priv.$search = null;
    priv.$search_ctl = null;
    priv.$expand_btn = null;
    priv.$collapse_btn = null;
    priv.$mode_btn = null;
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
            ['span', {class: 'JSON_TITLE is-flex is-align-items-center px-2',
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
    attach_clear($search_control, $search_input);
    left_items.push($search_control);

    let right_items = [
        view_mode_button(gobj),
        icon_button(gobj, "yi-chevron-right",  "EV_EXPAND_ALL",   "expand loaded"),
        icon_button(gobj, "yi-chevron-right",  "EV_COLLAPSE_ALL", "collapse all"),
        icon_button(gobj, "yi-copy",           "EV_COPY_ALL",     "copy json"),
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
 *   The tree/text switch.
 *
 *   It shows the view it takes you TO — the `code` glyph while the
 *   tree is on screen, the `sitemap` glyph while the text is — and
 *   sends EV_SET_VIEW_MODE with no mode, which the action reads as
 *   "toggle".  apply_view_mode() keeps the icon and its i18n keys in
 *   step with the attr.
 ************************************************************/
function view_mode_button(gobj)
{
    return ['button', {class: 'button JSON_VIEW_MODE', style: 'width:2.5em;',
                       title: t("text view"), 'data-i18n-title': "text view",
                       'aria-label': t("text view"), 'data-i18n-aria-label': "text view"}, [
        ['span', {class: 'icon'}, [['i', {class: 'yi-code'}]]]
    ], {
        click: function(evt) {
            evt.stopPropagation();
            gobj_send_event(gobj, "EV_SET_VIEW_MODE", {}, gobj);
        }
    }];
}

/************************************************************
 *   The current view, normalised.  Anything but "text" is the tree.
 ************************************************************/
function current_view_mode(gobj)
{
    return (gobj_read_str_attr(gobj, "view_mode") === "text")? "text": "tree";
}

/************************************************************
 *   Show the chrome of the current view and hide the other's.
 ************************************************************/
function apply_view_mode(gobj)
{
    let priv = gobj.priv;
    let text_mode = current_view_mode(gobj) === "text";

    if(priv.$tree) {
        priv.$tree.classList.toggle('is-hidden', text_mode);
    }
    if(priv.$text) {
        priv.$text.classList.toggle('is-hidden', !text_mode);
    }

    /*
     *  Search and expand/collapse act on TREE rows; in the text view
     *  they have nothing to act on, and a control that answers nothing
     *  is worse than an absent one.  A <pre> is searched with the
     *  browser's own Ctrl+F.
     */
    [priv.$search_ctl, priv.$expand_btn, priv.$collapse_btn].forEach(function($el) {
        if($el) {
            $el.classList.toggle('is-hidden', text_mode);
        }
    });

    if(priv.$mode_btn) {
        let icon = text_mode? "yi-sitemap": "yi-code";
        let key = text_mode? "tree view": "text view";
        let $i = priv.$mode_btn.querySelector('i');
        if($i) {
            $i.className = icon;
        }
        priv.$mode_btn.setAttribute("data-i18n-title", key);
        priv.$mode_btn.setAttribute("data-i18n-aria-label", key);
        priv.$mode_btn.setAttribute("title", t(key));
        priv.$mode_btn.setAttribute("aria-label", t(key));
    }
}

/************************************************************
 *   Render whichever view is current.
 ************************************************************/
function render_view(gobj)
{
    if(current_view_mode(gobj) === "text") {
        render_text(gobj);
    } else {
        render_tree(gobj);
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
    rows.push(toggle_row(ctx.gobj, key, size, is_object, depth, path, open));

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
function toggle_row(gobj, key, size, is_object, depth, path, open)
{
    let summary = (is_object ? "{" : "[") + String(size) + (is_object ? "}" : "]");

    let body = [];
    if(key !== null && key !== "") {
        body.push(['span', {class: 'JSON_KEY'}, String(key)]);
        body.push(['span', {class: 'JSON_PUNCT'}, ': ']);
    }
    body.push(['span', {class: 'JSON_SUMMARY has-text-grey'}, summary]);

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
 *   EV_SET_VIEW_MODE { mode } — "tree" | "text".
 *
 *   With no mode it toggles, which is what the toolbar button sends.
 ************************************************************/
function ac_set_view_mode(gobj, event, kw, src)
{
    let mode = kw.mode;

    if(mode === undefined || mode === null || mode === "") {
        mode = (current_view_mode(gobj) === "text")? "tree": "text";
    } else if(mode !== "tree" && mode !== "text") {
        log_error(`${GCLASS_NAME}: unknown view_mode '${mode}'`);
        return -1;
    }

    gobj_write_attr(gobj, "view_mode", mode);

    apply_view_mode(gobj);
    render_view(gobj);
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
    return create_gclass(GCLASS_NAME);
}

export { register_c_yui_json };
