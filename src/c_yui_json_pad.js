/***********************************************************************
 *          c_yui_json_pad.js
 *
 *          C_YUI_JSON_PAD -- a pad to paste JSON from OUTSIDE and read it
 *          with the library's own viewer, and a second one to compare it
 *          with.
 *
 *          The viewer (C_YUI_JSON: the lazy tree, the raw text and the
 *          graph) only ever showed what an app fetched.  A JSON that came
 *          from anywhere else -- a log line, a config file, an answer copied
 *          from a terminal -- had to be read in whatever the operator had
 *          at hand.  This is the blank page for it: paste, and read it the
 *          way every other document of the app is read.
 *
 *          Two documents are the other half of the job: the config that
 *          works and the one that does not, a record before and after.  The
 *          second pane is there on demand ("second json"), and "compare"
 *          puts their differences in place of the two viewers -- one row
 *          per id of the flat form (json2flat), the form a person reads
 *          when two configurations disagree.
 *
 *          DOM (UPPER_SNAKE logical classes):
 *
 *              JSON_PAD                the root
 *                JSON_PAD_TOOLBAR      the notice and the two toggles
 *                  JSON_PAD_NOTICE     "json not kept": the storage refused
 *                  JSON_PAD_SECOND     show / hide the second pane
 *                  JSON_PAD_COMPARE    show / hide the differences
 *                JSON_PAD_PANES        the panes, side by side (stacked when
 *                                      the pad is narrow)
 *                  JSON_PAD_PANE       JSON_PAD_PANE_A / JSON_PAD_PANE_B
 *                    JSON_PAD_BAR      the text area and its two buttons
 *                      JSON_PAD_INPUT  where the text goes
 *                      JSON_PAD_VIEW   read what is in the text area
 *                      JSON_PAD_CLEAR  empty the pane
 *                    JSON_PAD_ERROR    "invalid JSON" and the parser's reason
 *                    JSON_PAD_BODY     the pane's C_YUI_JSON child
 *                JSON_PAD_DIFF         the differences: JSON_PAD_DIFF_SUMMARY
 *                                      and JSON_PAD_DIFF_TABLE, one
 *                                      JSON_PAD_DIFF_ROW per id
 *
 *          Every way in is an event, and a pane event names its pane
 *          (`pane`: "a" or "b"):
 *
 *              EV_PASTE {pane, text}   a paste ANYWHERE in a pane replaces
 *                                      its document and shows it at once --
 *                                      a pane holds one document, not a
 *                                      text to edit
 *              EV_VIEW {pane}          the text area as it is (typed, or
 *                                      edited after a paste); also Ctrl+Enter
 *              EV_CLEAR {pane}         back to a blank pane
 *              EV_TEXT_CHANGED {pane}  the text area was edited: keep it
 *              EV_TOGGLE_SECOND        show / hide the second pane
 *              EV_TOGGLE_DIFF          show / hide the differences
 *
 *          FSM: the states are the LAYOUT -- ST_SINGLE (one pane), ST_DUAL
 *          (two), ST_DIFF (two, with their differences in place of the
 *          viewers).  Comparing needs two panes, so EV_TOGGLE_DIFF is not
 *          defined in ST_SINGLE and its button is not on screen there.
 *          EV_EXPAND_PATH, which a viewer publishes when a `__collapsed__`
 *          sentinel is opened, is answered with EV_SUBTREE_ERROR to the
 *          viewer that asked: a pasted document has no backend to fetch the
 *          rest from -- the source truncated it, and the pad says so.  It is
 *          not defined in ST_DIFF, where no viewer is on screen.
 *
 *          What is kept: both texts and the layout, in localStorage under
 *          `storage_key` (empty: nothing is kept), written when a text is
 *          pasted, viewed, cleared or edited and when the layout changes,
 *          so the next pad opens as this one was left.  localStorage is per
 *          browser and per origin, and has a quota: a text too big for it
 *          is not kept, the toolbar says so, and the log says why.
 *
 *          Hosted by setup_json_pad() (yui_json_pad.js) in a C_YUI_WINDOW;
 *          any host can mount `$container` itself.
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
    log_warning,
    gobj_create_pure_child,
    gobj_read_pointer_attr,
    gobj_read_str_attr,
    gobj_read_attr,
    gobj_write_attr,
    gobj_subscribe_event,
    gobj_send_event,
    gobj_change_state,
    gobj_current_state,
    gobj_start,
    gobj_stop,
    gobj_is_running,
    gobj_short_name,
    gobj_parent,
    createElement2,
    kw_get_local_storage_value,
    kw_set_local_storage_value,
} from "@yuneta/gobj-js";

import {register_c_yui_json} from "./c_yui_json.js";
import {yui_toolbar_icon, set_pressed_state} from "./yui_toolbar.js";
import {json_diff_rows} from "./json_view_helpers.js";

import {t} from "i18next";

import "./c_yui_json_pad.css";

/***************************************************************
 *              Constants
 ***************************************************************/
const GCLASS_NAME = "C_YUI_JSON_PAD";

const PANES = ["a", "b"];

/*  The layout each state is kept as.  */
const MODE_OF_STATE = {
    ST_SINGLE:  "single",
    ST_DUAL:    "dual",
    ST_DIFF:    "diff"
};

/*  The tag of each kind of difference.  Written out, so every key is
 *  a literal the consumers' validate-locales can see.  */
const KIND_TAG = {
    added:   () => ['span', {class: 'tag is-success is-light', i18n: 'added'}, 'added'],
    removed: () => ['span', {class: 'tag is-danger is-light', i18n: 'removed'}, 'removed'],
    changed: () => ['span', {class: 'tag is-warning is-light', i18n: 'changed'}, 'changed'],
};

/***************************************************************
 *              Data
 ***************************************************************/
const attrs_table = [
SDATA(data_type_t.DTP_POINTER,  "subscriber",   0,  null,           "Subscriber of output events"),
SDATA(data_type_t.DTP_STRING,   "storage_key",  0,  "yui_json_pad", "localStorage key the two texts and the layout are kept under. Empty: nothing is kept"),
SDATA(data_type_t.DTP_POINTER,  "$container",   0,  null,           "HTMLElement root, mounted by the host"),
SDATA_END()
];

let PRIVATE_DATA = {
    panes:      null,   /*  {a, b}: $pane $input $error $reason $body gobj_json doc has_doc  */
    $compare:   null,   /*  the "compare" toggle  */
    $notice:    null,   /*  "json not kept"  */
    $diff:      null,   /*  the differences  */
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

    build_ui(gobj);

    /*
     *  One viewer per pane, as pure children: each publishes
     *  EV_EXPAND_PATH to its parent (this gobj).
     */
    for(const id of PANES) {
        let pane = priv.panes[id];
        pane.gobj_json = gobj_create_pure_child(`json_pad_view_${id}`, "C_YUI_JSON", {}, gobj);
        let $view = pane.gobj_json? gobj_read_attr(pane.gobj_json, "$container") : null;
        if(!$view) {
            log_error(`${gobj_short_name(gobj)}: C_YUI_JSON without $container`);
            continue;
        }
        pane.$body.appendChild($view);
    }
}

/***************************************************************
 *          Framework Method: Start
 ***************************************************************/
function mt_start(gobj)
{
    let priv = gobj.priv;

    for(const id of PANES) {
        if(priv.panes[id].gobj_json) {
            gobj_start(priv.panes[id].gobj_json);
        }
    }

    restore_state(gobj);

    /*  The caret goes where a paste lands.  */
    priv.panes.a.$input.focus();
}

/***************************************************************
 *          Framework Method: Stop
 ***************************************************************/
function mt_stop(gobj)
{
    let priv = gobj.priv;

    /*  A text typed and never left has had no `change` yet.  */
    save_state(gobj);

    for(const id of PANES) {
        let gobj_json = priv.panes[id].gobj_json;
        if(gobj_json && gobj_is_running(gobj_json)) {
            gobj_stop(gobj_json);
        }
    }
}

/***************************************************************
 *          Framework Method: Destroy
 ***************************************************************/
function mt_destroy(gobj)
{
}




                    /***************************
                     *      Local Methods
                     ***************************/




/***************************************************************
 *  A button of the pad: an icon, its label, and an event.
 ***************************************************************/
function pad_button(gobj, cls, icon, key, event_name, kw)
{
    return ['button', {class: `${cls} button`, type: 'button',
                       title: t(key), 'data-i18n-title': key,
                       'aria-label': t(key), 'data-i18n-aria-label': key},
        [
            yui_toolbar_icon(icon),
            ['span', {style: 'padding-left:5px;', i18n: key}, key]
        ],
        {
            click: (evt) => {
                evt.stopPropagation();
                gobj_send_event(gobj, event_name, {...kw}, gobj);
            }
        }
    ];
}

/***************************************************************
 *  The toolbar, the two panes, and the differences.
 ***************************************************************/
function build_ui(gobj)
{
    let priv = gobj.priv;

    priv.$notice = createElement2(
        ['div', {class: 'JSON_PAD_NOTICE is-hidden has-text-danger is-size-7', role: 'status'}, [
            ['span', {style: 'font-weight:600;', i18n: 'json not kept'}, 'json not kept']
        ]]
    );
    priv.$compare = createElement2(
        pad_button(gobj, 'JSON_PAD_COMPARE is-hidden', 'yi-right-left', 'compare', 'EV_TOGGLE_DIFF', {})
    );

    priv.panes = {
        a: build_pane(gobj, "a", "first json"),
        b: build_pane(gobj, "b", "second json"),
    };
    priv.panes.b.$pane.classList.add('is-hidden');

    priv.$diff = createElement2(
        ['div', {class: 'JSON_PAD_DIFF is-hidden'}, []]
    );

    let $container = createElement2(
        ['div', {class: 'C_YUI_JSON_PAD JSON_PAD'}, [
            ['div', {class: 'JSON_PAD_TOOLBAR'}, [
                priv.$notice,
                pad_button(gobj, 'JSON_PAD_SECOND', 'yi-columns', 'second json', 'EV_TOGGLE_SECOND', {}),
                priv.$compare
            ]],
            ['div', {class: 'JSON_PAD_PANES'}, [
                priv.panes.a.$pane,
                priv.panes.b.$pane
            ]],
            priv.$diff
        ]]
    );

    gobj_write_attr(gobj, "$container", $container);

    press_toggle(gobj, '.JSON_PAD_SECOND', false);
    press_toggle(gobj, '.JSON_PAD_COMPARE', false);
}

/***************************************************************
 *  One pane: the text area and its buttons, the error line, and
 *  the body its viewer is mounted in.  `name_key` names the pane
 *  for a reader (its text area's title and aria-label).
 ***************************************************************/
function build_pane(gobj, id, name_key)
{
    let pane = {
        $pane:      null,
        $input:     null,
        $error:     null,
        $reason:    null,
        $body:      null,
        gobj_json:  null,
        doc:        null,
        has_doc:    false,  /*  `null` is a document too  */
    };

    pane.$input = createElement2(
        ['textarea', {class: 'JSON_PAD_INPUT textarea', rows: 3, spellcheck: 'false',
                      placeholder: t('paste json here'), 'data-i18n-placeholder': 'paste json here',
                      title: t(name_key), 'data-i18n-title': name_key,
                      'aria-label': t(name_key), 'data-i18n-aria-label': name_key,
                      style: 'font-family:monospace; resize:vertical; min-height:4.5em;'}, '', {
            keydown: (evt) => {
                if((evt.ctrlKey || evt.metaKey) && evt.key === 'Enter') {
                    evt.preventDefault();
                    gobj_send_event(gobj, "EV_VIEW", {pane: id}, gobj);
                }
            },
            change: () => {
                gobj_send_event(gobj, "EV_TEXT_CHANGED", {pane: id}, gobj);
            }
        }]
    );

    pane.$reason = createElement2(
        ['span', {class: 'JSON_PAD_ERROR_REASON', style: 'margin-left:.5em; font-family:monospace;'}, '']
    );
    pane.$error = createElement2(
        ['div', {class: 'JSON_PAD_ERROR is-hidden has-text-danger is-size-7', role: 'alert'}, [
            ['span', {class: 'JSON_PAD_ERROR_LABEL', style: 'font-weight:600;', i18n: 'invalid json'},
             'invalid json'],
            pane.$reason
        ]]
    );
    pane.$body = createElement2(
        ['div', {class: 'JSON_PAD_BODY',
                 style: 'flex:1 1 auto; min-height:0; display:flex; flex-direction:column;'}, []]
    );

    pane.$pane = createElement2(
        ['div', {class: `JSON_PAD_PANE JSON_PAD_PANE_${id.toUpperCase()}`}, [
            ['div', {class: 'JSON_PAD_BAR',
                     style: 'display:flex; gap:.5rem; align-items:flex-start;'}, [
                ['div', {style: 'flex:1 1 auto; min-width:0;'}, [pane.$input]],
                ['div', {style: 'flex:0 0 auto; display:flex; flex-direction:column; gap:.5rem;'}, [
                    pad_button(gobj, 'JSON_PAD_VIEW', 'yi-eye', 'view', 'EV_VIEW', {pane: id}),
                    pad_button(gobj, 'JSON_PAD_CLEAR', 'yi-broom', 'clear', 'EV_CLEAR', {pane: id}),
                ]]
            ]],
            pane.$error,
            pane.$body
        ], {
            /*  A paste anywhere in the pane is its document: it replaces
             *  what the text area held instead of landing at the caret.  */
            paste: (evt) => {
                let text = evt.clipboardData? evt.clipboardData.getData("text") : "";
                if(!text) {
                    return;     /*  an image or nothing: the browser's business  */
                }
                evt.preventDefault();
                gobj_send_event(gobj, "EV_PASTE", {pane: id, text: text}, gobj);
            }
        }]
    );

    return pane;
}

/***************************************************************
 *  The pane a pane event names.
 ***************************************************************/
function pane_of(gobj, kw)
{
    let priv = gobj.priv;
    let id = kw? kw.pane : undefined;

    if(!PANES.includes(id)) {
        log_error(`${gobj_short_name(gobj)}: no pane '${id}'`);
        return null;
    }
    return priv.panes[id];
}

/***************************************************************
 *  A toggle of the toolbar, pressed or not -- for the eye and
 *  for a reader.
 ***************************************************************/
function press_toggle(gobj, selector, on)
{
    let $container = gobj_read_attr(gobj, "$container");

    set_pressed_state($container, selector, on);
    $container.querySelectorAll(selector).forEach(($el) => {
        $el.setAttribute('aria-pressed', on? 'true' : 'false');
    });
}

/***************************************************************
 *  Read `text` as JSON and show it in `pane`, or say why it is
 *  not.  A text that is not JSON leaves the last document up.
 ***************************************************************/
function show_text(gobj, pane, text)
{
    let src = String(text || "").trim();

    if(!src) {
        clear_pane(gobj, pane, false);
        return 0;
    }

    let doc;
    try {
        doc = JSON.parse(src);
    } catch(e) {
        /*  The reader's text, not a fault of the app: said on the pad, and
         *  a warning for whoever reads the console.  */
        log_warning(`${gobj_short_name(gobj)}: the pasted text is not JSON: ${e.message}`);
        pane.$reason.textContent = e.message;
        pane.$error.classList.remove('is-hidden');
        return -1;
    }

    pane.$error.classList.add('is-hidden');
    pane.$reason.textContent = "";
    pane.doc = doc;
    pane.has_doc = true;
    gobj_send_event(pane.gobj_json, "EV_SET_JSON", {json: doc}, gobj);
    return 0;
}

/***************************************************************
 *  A blank pane again; `with_text` empties the text area too.
 ***************************************************************/
function clear_pane(gobj, pane, with_text)
{
    if(with_text) {
        pane.$input.value = "";
    }
    pane.$error.classList.add('is-hidden');
    pane.$reason.textContent = "";
    pane.doc = null;
    pane.has_doc = false;
    gobj_send_event(pane.gobj_json, "EV_SET_JSON", {json: null}, gobj);
}

/***************************************************************
 *  A pane changed its document: the differences follow it, and
 *  the texts are kept.
 ***************************************************************/
function document_changed(gobj)
{
    if(gobj_current_state(gobj) === "ST_DIFF") {
        render_diff(gobj);
    }
    save_state(gobj);
}

/***************************************************************
 *  Enter one of the three layouts.  The state IS the layout;
 *  this is what the screen shows for it.
 ***************************************************************/
function enter_layout(gobj, state)
{
    let priv = gobj.priv;
    let $container = gobj_read_attr(gobj, "$container");
    let second = (state !== "ST_SINGLE");
    let diff = (state === "ST_DIFF");

    gobj_change_state(gobj, state);

    priv.panes.b.$pane.classList.toggle('is-hidden', !second);
    priv.$compare.classList.toggle('is-hidden', !second);
    press_toggle(gobj, '.JSON_PAD_SECOND', second);
    press_toggle(gobj, '.JSON_PAD_COMPARE', diff);

    $container.classList.toggle('is-comparing', diff);
    for(const id of PANES) {
        priv.panes[id].$body.classList.toggle('is-hidden', diff);
    }
    priv.$diff.classList.toggle('is-hidden', !diff);

    if(diff) {
        render_diff(gobj);
    } else {
        /*  A viewer that was hidden, or had another width, drew for a
         *  box it no longer has: its graph measures its canvas again.  */
        for(const id of PANES) {
            if(id === "b" && !second) {
                continue;
            }
            gobj_send_event(priv.panes[id].gobj_json, "EV_REFRESH", {}, gobj);
        }
    }

    save_state(gobj);
}

/***************************************************************
 *  The differences of the two documents, in place of the two
 *  viewers.  Only a pane that shows a document takes part: a
 *  text that is not JSON leaves its last document, as on screen.
 ***************************************************************/
function render_diff(gobj)
{
    let priv = gobj.priv;
    let a = priv.panes.a;
    let b = priv.panes.b;

    priv.$diff.replaceChildren();

    if(!a.has_doc || !b.has_doc) {
        priv.$diff.appendChild(createElement2(
            ['p', {class: 'JSON_PAD_DIFF_MESSAGE', i18n: 'compare needs two json'},
             'compare needs two json']
        ));
        return 0;
    }

    let rows;
    try {
        rows = json_diff_rows(a.doc, b.doc);
    } catch(e) {
        log_warning(`${gobj_short_name(gobj)}: cannot compare: ${e.message}`);
        priv.$diff.appendChild(createElement2(
            ['p', {class: 'JSON_PAD_DIFF_MESSAGE has-text-danger'}, [
                ['span', {style: 'font-weight:600;', i18n: 'cannot compare'}, 'cannot compare'],
                ['span', {class: 'JSON_PAD_DIFF_REASON',
                          style: 'margin-left:.5em; font-family:monospace;'}, e.message]
            ]]
        ));
        return -1;
    }

    if(rows.length === 0) {
        priv.$diff.appendChild(createElement2(
            ['p', {class: 'JSON_PAD_DIFF_MESSAGE has-text-success', i18n: 'no differences'},
             'no differences']
        ));
        return 0;
    }

    let count = {added: 0, removed: 0, changed: 0};
    for(const row of rows) {
        count[row.kind]++;
    }

    let value_cell = (cls, row, side) => {
        let has = Object.prototype.hasOwnProperty.call(row, side);
        return ['td', {class: cls}, has? JSON.stringify(row[side]) : ''];
    };

    priv.$diff.appendChild(createElement2(
        ['div', {class: 'JSON_PAD_DIFF_SUMMARY'},
            ["removed", "added", "changed"].map((kind) => {
                return ['span', {class: 'JSON_PAD_DIFF_COUNT'}, [
                    KIND_TAG[kind](),
                    ['strong', {}, String(count[kind])]
                ]];
            })
        ]
    ));

    priv.$diff.appendChild(createElement2(
        ['table', {class: 'JSON_PAD_DIFF_TABLE table is-fullwidth is-narrow is-hoverable'}, [
            ['thead', {}, [
                ['tr', {}, [
                    ['th', {}, ''],
                    ['th', {i18n: 'path'}, 'path'],
                    ['th', {i18n: 'first json'}, 'first json'],
                    ['th', {i18n: 'second json'}, 'second json']
                ]]
            ]],
            ['tbody', {}, rows.map((row) => {
                return ['tr', {class: `JSON_PAD_DIFF_ROW JSON_PAD_DIFF_${row.kind.toUpperCase()}`}, [
                    ['td', {}, [KIND_TAG[row.kind]()]],
                    ['td', {class: 'JSON_PAD_DIFF_PATH'}, row.id],
                    value_cell('JSON_PAD_DIFF_FROM', row, 'from'),
                    value_cell('JSON_PAD_DIFF_TO', row, 'to')
                ]];
            })]
        ]]
    ));
    return 0;
}

/***************************************************************
 *  Keep both texts and the layout.
 ***************************************************************/
function save_state(gobj)
{
    let priv = gobj.priv;
    let key = gobj_read_str_attr(gobj, "storage_key");

    if(!key) {
        return 0;
    }

    let ret = kw_set_local_storage_value(key, {
        a:      priv.panes.a.$input.value,
        b:      priv.panes.b.$input.value,
        mode:   MODE_OF_STATE[gobj_current_state(gobj)] || "single"
    });
    /*  On -1 the reason is already logged; the pad says it here.  */
    priv.$notice.classList.toggle('is-hidden', ret === 0);
    return ret;
}

/***************************************************************
 *  The pad as the last one was left: its texts, shown, and its
 *  layout -- through the same events a reader would send.
 ***************************************************************/
function restore_state(gobj)
{
    let priv = gobj.priv;
    let key = gobj_read_str_attr(gobj, "storage_key");

    if(!key) {
        return 0;
    }

    let kept = kw_get_local_storage_value(key, null, false);
    if(kept === null || kept === undefined) {
        return 0;   /*  nothing kept yet  */
    }
    if(typeof kept !== "object" || Array.isArray(kept)) {
        log_warning(`${gobj_short_name(gobj)}: '${key}' in localStorage is not what the pad keeps`);
        return -1;
    }

    for(const id of PANES) {
        if(typeof kept[id] === "string") {
            priv.panes[id].$input.value = kept[id];
        }
    }
    for(const id of PANES) {
        if(priv.panes[id].$input.value.trim()) {
            gobj_send_event(gobj, "EV_VIEW", {pane: id}, gobj);
        }
    }
    if(kept.mode === "dual" || kept.mode === "diff") {
        gobj_send_event(gobj, "EV_TOGGLE_SECOND", {}, gobj);
    }
    if(kept.mode === "diff") {
        gobj_send_event(gobj, "EV_TOGGLE_DIFF", {}, gobj);
    }
    return 0;
}




                    /***************************
                     *      Actions
                     ***************************/




/***************************************************************
 *  A paste: it becomes the pane's text area and its document
 *  at once.
 ***************************************************************/
function ac_paste(gobj, event, kw, src)
{
    let pane = pane_of(gobj, kw);
    if(!pane) {
        return -1;  // Error already logged
    }

    let text = (typeof kw.text === "string")? kw.text : "";
    pane.$input.value = text;
    let ret = show_text(gobj, pane, text);
    document_changed(gobj);
    return ret;
}

/***************************************************************
 *  The pane's text area as it is now.
 ***************************************************************/
function ac_view(gobj, event, kw, src)
{
    let pane = pane_of(gobj, kw);
    if(!pane) {
        return -1;  // Error already logged
    }

    let ret = show_text(gobj, pane, pane.$input.value);
    document_changed(gobj);
    return ret;
}

/***************************************************************
 *  A blank pane again.
 ***************************************************************/
function ac_clear(gobj, event, kw, src)
{
    let pane = pane_of(gobj, kw);
    if(!pane) {
        return -1;  // Error already logged
    }

    clear_pane(gobj, pane, true);
    pane.$input.focus();
    document_changed(gobj);
    return 0;
}

/***************************************************************
 *  A text area was edited and left: keep what it holds.  What
 *  is SHOWN changes only with a view, as before.
 ***************************************************************/
function ac_text_changed(gobj, event, kw, src)
{
    if(!pane_of(gobj, kw)) {
        return -1;  // Error already logged
    }

    save_state(gobj);
    return 0;
}

/***************************************************************
 *  The second pane, beside the first.
 ***************************************************************/
function ac_show_second(gobj, event, kw, src)
{
    let priv = gobj.priv;

    enter_layout(gobj, "ST_DUAL");
    priv.panes.b.$input.focus();
    return 0;
}

/***************************************************************
 *  One pane again.  Its text is kept: hiding is not clearing.
 ***************************************************************/
function ac_hide_second(gobj, event, kw, src)
{
    enter_layout(gobj, "ST_SINGLE");
    return 0;
}

/***************************************************************
 *  The differences, in place of the viewers.
 ***************************************************************/
function ac_show_diff(gobj, event, kw, src)
{
    enter_layout(gobj, "ST_DIFF");
    return 0;
}

/***************************************************************
 *  The viewers again.
 ***************************************************************/
function ac_hide_diff(gobj, event, kw, src)
{
    enter_layout(gobj, "ST_DUAL");
    return 0;
}

/***************************************************************
 *  A viewer asks for a `__collapsed__` subtree.  A pasted
 *  document has no backend to ask for it: the SOURCE truncated
 *  it, and that is the answer, to the viewer that asked.
 ***************************************************************/
function ac_expand_path(gobj, event, kw, src)
{
    gobj_send_event(src, "EV_SUBTREE_ERROR", {
        path: (kw && kw.path) || "",
        error: t("collapsed in the source")
    }, gobj);
    return 0;
}

/***************************************************************
 *              FSM
 ***************************************************************/
/*---------------------------------------------*
 *          Global methods table
 *---------------------------------------------*/
const gmt = {
    mt_create:  mt_create,
    mt_start:   mt_start,
    mt_stop:    mt_stop,
    mt_destroy: mt_destroy
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
        ["ST_SINGLE", [
            ["EV_PASTE",            ac_paste,           null],
            ["EV_VIEW",             ac_view,            null],
            ["EV_CLEAR",            ac_clear,           null],
            ["EV_TEXT_CHANGED",     ac_text_changed,    null],
            ["EV_TOGGLE_SECOND",    ac_show_second,     null],
            ["EV_EXPAND_PATH",      ac_expand_path,     null],
        ]],
        ["ST_DUAL", [
            ["EV_PASTE",            ac_paste,           null],
            ["EV_VIEW",             ac_view,            null],
            ["EV_CLEAR",            ac_clear,           null],
            ["EV_TEXT_CHANGED",     ac_text_changed,    null],
            ["EV_TOGGLE_SECOND",    ac_hide_second,     null],
            ["EV_TOGGLE_DIFF",      ac_show_diff,       null],
            ["EV_EXPAND_PATH",      ac_expand_path,     null],
        ]],
        ["ST_DIFF", [
            ["EV_PASTE",            ac_paste,           null],
            ["EV_VIEW",             ac_view,            null],
            ["EV_CLEAR",            ac_clear,           null],
            ["EV_TEXT_CHANGED",     ac_text_changed,    null],
            ["EV_TOGGLE_SECOND",    ac_hide_second,     null],
            ["EV_TOGGLE_DIFF",      ac_hide_diff,       null],
        ]]
    ];

    /*---------------------------------------------*
     *          Events
     *---------------------------------------------*/
    const event_types = [
        ["EV_PASTE",            0],
        ["EV_VIEW",             0],
        ["EV_CLEAR",            0],
        ["EV_TEXT_CHANGED",     0],
        ["EV_TOGGLE_SECOND",    0],
        ["EV_TOGGLE_DIFF",      0],
        ["EV_EXPAND_PATH",      0],
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
function register_c_yui_json_pad()
{
    /*  the viewer it hosts, if the app did not register it  */
    if(!gclass_find_by_name("C_YUI_JSON", false)) {
        register_c_yui_json();
    }
    return create_gclass(GCLASS_NAME);
}

export { register_c_yui_json_pad };
