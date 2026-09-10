/***********************************************************************
 *          c_yui_json_pad.js
 *
 *          C_YUI_JSON_PAD -- a pad to paste JSON from OUTSIDE and read it
 *          with the library's own viewer.
 *
 *          The viewer (C_YUI_JSON: the lazy tree, the raw text and the
 *          graph) only ever showed what an app fetched.  A JSON that came
 *          from anywhere else -- a log line, a config file, an answer copied
 *          from a terminal -- had to be read in whatever the operator had
 *          at hand.  This is the blank page for it: paste, and read it the
 *          way every other document of the app is read.
 *
 *          DOM (UPPER_SNAKE logical classes):
 *
 *              JSON_PAD            the root
 *                JSON_PAD_BAR      the text area and its two buttons
 *                  JSON_PAD_INPUT  where the text goes
 *                  JSON_PAD_VIEW   read what is in the text area
 *                  JSON_PAD_CLEAR  empty the pad
 *                JSON_PAD_ERROR    "invalid JSON" and the parser's reason
 *                JSON_PAD_BODY     the C_YUI_JSON child
 *
 *          Every way in is an event:
 *
 *              EV_PASTE {text}   a paste ANYWHERE in the pad replaces the
 *                                document and shows it at once -- there
 *                                is one document here, not a text to edit
 *              EV_VIEW           the text area as it is (typed, or edited
 *                                after a paste); also Ctrl+Enter
 *              EV_CLEAR          back to the blank pad
 *
 *          FSM: ST_EMPTY (nothing shown) and ST_SHOWING.  EV_EXPAND_PATH,
 *          which the viewer publishes when a `__collapsed__` sentinel is
 *          opened, only exists in ST_SHOWING, and is answered with
 *          EV_SUBTREE_ERROR: a pasted document has no backend to fetch the
 *          rest from -- the source truncated it, and the pad says so.
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
    gobj_read_attr,
    gobj_write_attr,
    gobj_subscribe_event,
    gobj_send_event,
    gobj_change_state,
    gobj_start,
    gobj_stop,
    gobj_is_running,
    gobj_short_name,
    gobj_parent,
    createElement2,
} from "@yuneta/gobj-js";

import {register_c_yui_json} from "./c_yui_json.js";
import {yui_toolbar_icon} from "./yui_toolbar.js";

import {t} from "i18next";

/***************************************************************
 *              Constants
 ***************************************************************/
const GCLASS_NAME = "C_YUI_JSON_PAD";

/***************************************************************
 *              Data
 ***************************************************************/
const attrs_table = [
SDATA(data_type_t.DTP_POINTER,  "subscriber",   0,  null,   "Subscriber of output events"),
SDATA(data_type_t.DTP_POINTER,  "$container",   0,  null,   "HTMLElement root, mounted by the host"),
SDATA_END()
];

let PRIVATE_DATA = {
    $input:     null,   /*  the text area  */
    $error:     null,   /*  the "invalid JSON" line  */
    $reason:    null,   /*  ...and the parser's reason inside it  */
    gobj_json:  null,   /*  the C_YUI_JSON child  */
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
     *  The viewer, as a pure child: it publishes EV_EXPAND_PATH to its
     *  parent (this gobj), which declares it in ST_SHOWING.
     */
    priv.gobj_json = gobj_create_pure_child("json_pad_view", "C_YUI_JSON", {}, gobj);
    let $view = gobj_read_attr(priv.gobj_json, "$container");
    if(!$view) {
        log_error(`${gobj_short_name(gobj)}: C_YUI_JSON without $container`);
        return;
    }
    gobj_read_attr(gobj, "$container").querySelector(".JSON_PAD_BODY").appendChild($view);
}

/***************************************************************
 *          Framework Method: Start
 ***************************************************************/
function mt_start(gobj)
{
    let priv = gobj.priv;

    if(priv.gobj_json) {
        gobj_start(priv.gobj_json);
    }
    /*  A blank pad is waiting for a paste: the caret goes where it lands.  */
    if(priv.$input) {
        priv.$input.focus();
    }
}

/***************************************************************
 *          Framework Method: Stop
 ***************************************************************/
function mt_stop(gobj)
{
    let priv = gobj.priv;

    if(priv.gobj_json && gobj_is_running(priv.gobj_json)) {
        gobj_stop(priv.gobj_json);
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
 *  The pad: the text area and its buttons, the error line, and
 *  the body the viewer is mounted in.
 ***************************************************************/
function build_ui(gobj)
{
    let priv = gobj.priv;

    let button = (cls, icon, key, event_name) => {
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
                    gobj_send_event(gobj, event_name, {}, gobj);
                }
            }
        ];
    };

    priv.$input = createElement2(
        ['textarea', {class: 'JSON_PAD_INPUT textarea', rows: 3, spellcheck: 'false',
                      placeholder: t('paste json here'), 'data-i18n-placeholder': 'paste json here',
                      title: t('paste json here'), 'data-i18n-title': 'paste json here',
                      'aria-label': t('paste json here'), 'data-i18n-aria-label': 'paste json here',
                      style: 'font-family:monospace; resize:vertical; min-height:4.5em;'}, '', {
            keydown: (evt) => {
                if((evt.ctrlKey || evt.metaKey) && evt.key === 'Enter') {
                    evt.preventDefault();
                    gobj_send_event(gobj, "EV_VIEW", {}, gobj);
                }
            }
        }]
    );

    priv.$reason = createElement2(
        ['span', {class: 'JSON_PAD_ERROR_REASON', style: 'margin-left:.5em; font-family:monospace;'}, '']
    );
    priv.$error = createElement2(
        ['div', {class: 'JSON_PAD_ERROR is-hidden has-text-danger is-size-7', role: 'alert'}, [
            ['span', {class: 'JSON_PAD_ERROR_LABEL', style: 'font-weight:600;', i18n: 'invalid json'},
             'invalid json'],
            priv.$reason
        ]]
    );

    let $container = createElement2(
        ['div', {class: 'C_YUI_JSON_PAD JSON_PAD',
                 style: 'height:100%; display:flex; flex-direction:column; gap:.5rem; padding:.5rem;'}, [
            ['div', {class: 'JSON_PAD_BAR',
                     style: 'display:flex; gap:.5rem; align-items:flex-start;'}, [
                ['div', {style: 'flex:1 1 auto; min-width:0;'}, [priv.$input]],
                ['div', {style: 'flex:0 0 auto; display:flex; flex-direction:column; gap:.5rem;'}, [
                    button('JSON_PAD_VIEW', 'yi-eye', 'view', 'EV_VIEW'),
                    button('JSON_PAD_CLEAR', 'yi-broom', 'clear', 'EV_CLEAR'),
                ]]
            ]],
            priv.$error,
            ['div', {class: 'JSON_PAD_BODY',
                     style: 'flex:1 1 auto; min-height:0; display:flex; flex-direction:column;'}, []]
        ], {
            /*  A paste anywhere in the pad is the document: it replaces
             *  what the text area held instead of landing at the caret.  */
            paste: (evt) => {
                let text = evt.clipboardData? evt.clipboardData.getData("text") : "";
                if(!text) {
                    return;     /*  an image or nothing: the browser's business  */
                }
                evt.preventDefault();
                gobj_send_event(gobj, "EV_PASTE", {text: text}, gobj);
            }
        }]
    );

    gobj_write_attr(gobj, "$container", $container);
}

/***************************************************************
 *  Read `text` as JSON and show it, or say why it is not.
 ***************************************************************/
function show_text(gobj, text)
{
    let priv = gobj.priv;
    let src = String(text || "").trim();

    if(!src) {
        clear_pad(gobj, false);
        return 0;
    }

    let doc;
    try {
        doc = JSON.parse(src);
    } catch(e) {
        /*  The reader's text, not a fault of the app: said on the pad, and
         *  a warning for whoever reads the console.  */
        log_warning(`${gobj_short_name(gobj)}: the pasted text is not JSON: ${e.message}`);
        priv.$reason.textContent = e.message;
        priv.$error.classList.remove('is-hidden');
        return -1;
    }

    priv.$error.classList.add('is-hidden');
    priv.$reason.textContent = "";
    gobj_send_event(priv.gobj_json, "EV_SET_JSON", {json: doc}, gobj);
    gobj_change_state(gobj, "ST_SHOWING");
    return 0;
}

/***************************************************************
 *  Back to the blank pad; `with_text` empties the text area too.
 ***************************************************************/
function clear_pad(gobj, with_text)
{
    let priv = gobj.priv;

    if(with_text) {
        priv.$input.value = "";
    }
    priv.$error.classList.add('is-hidden');
    priv.$reason.textContent = "";
    gobj_send_event(priv.gobj_json, "EV_SET_JSON", {json: null}, gobj);
    gobj_change_state(gobj, "ST_EMPTY");
}




                    /***************************
                     *      Actions
                     ***************************/




/***************************************************************
 *  A paste: it becomes the text area and the document at once.
 ***************************************************************/
function ac_paste(gobj, event, kw, src)
{
    let priv = gobj.priv;
    let text = (kw && typeof kw.text === "string")? kw.text : "";

    priv.$input.value = text;
    return show_text(gobj, text);
}

/***************************************************************
 *  The text area as it is now.
 ***************************************************************/
function ac_view(gobj, event, kw, src)
{
    let priv = gobj.priv;
    return show_text(gobj, priv.$input.value);
}

/***************************************************************
 *  The blank pad again.
 ***************************************************************/
function ac_clear(gobj, event, kw, src)
{
    let priv = gobj.priv;

    clear_pad(gobj, true);
    priv.$input.focus();
    return 0;
}

/***************************************************************
 *  The viewer asks for a `__collapsed__` subtree.  A pasted
 *  document has no backend to ask for it: the SOURCE truncated
 *  it, and that is the answer.
 ***************************************************************/
function ac_expand_path(gobj, event, kw, src)
{
    let priv = gobj.priv;

    gobj_send_event(priv.gobj_json, "EV_SUBTREE_ERROR", {
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
        ["ST_EMPTY", [
            ["EV_PASTE",            ac_paste,           null],
            ["EV_VIEW",             ac_view,            null],
            ["EV_CLEAR",            ac_clear,           null],
        ]],
        ["ST_SHOWING", [
            ["EV_PASTE",            ac_paste,           null],
            ["EV_VIEW",             ac_view,            null],
            ["EV_CLEAR",            ac_clear,           null],
            ["EV_EXPAND_PATH",      ac_expand_path,     null],
        ]]
    ];

    /*---------------------------------------------*
     *          Events
     *---------------------------------------------*/
    const event_types = [
        ["EV_PASTE",            0],
        ["EV_VIEW",             0],
        ["EV_CLEAR",            0],
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
