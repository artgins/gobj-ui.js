/***********************************************************************
 *          c_yui_schema_editor.js
 *
 *      C_YUI_SCHEMA_EDITOR — a treedb's schema edited AS A SCHEMA.
 *
 *      WHAT IT IS FOR.  Every schema a yuno holds lives in its
 *      `treedb_system_schema`, stored as data in three flat topics
 *      linked by fkeys: `treedbs` -> `topics` -> `cols`. Opened with
 *      the ordinary topic editor — which is how it was edited until
 *      now — adding one column to one topic means finding it in a
 *      table holding every column of every topic of every treedb the
 *      yuno has, composing the parent fkey by hand, and remembering to
 *      raise a `topic_version` that nothing asks about. The storage is
 *      right; it is not a screen.
 *
 *      So this view puts the schema back together and edits THAT:
 *      treedb -> topics -> columns, each in its declared `order`,
 *      with the storage composed underneath — the qualified id, the
 *      fkey, the order of a new sibling, the version that publishes
 *      the change.
 *
 *      THE VERSION IS THE POINT, not a detail. A topic whose columns
 *      changed and whose `topic_version` did not is a topic whose
 *      persisted `topic_cols.json` masks the whole edit: the restart
 *      succeeds and nothing moved. Nothing in the store says so, and
 *      the log that would is on the node. So every write here raises
 *      the version of the topic it touched, and the toolbar says which
 *      topics are waiting for a restart.
 *
 *      WHAT ELSE IS HERE, and why each is here and not somewhere else:
 *
 *        - the flags of a column as checkboxes with what they do
 *          (schema_flags.js): `flag` is the field that decides the most
 *          and explains the least.
 *        - the schema DRAWN (schema_descs.js + C_YUI_TREEDB_SCHEMA).
 *          The diagram of a treedb opened here is otherwise the META
 *          schema — treedbs/topics/cols, the same three cards on every
 *          yuno — never the schema the operator came to look at.
 *        - what the treedb would refuse, before the restart that finds
 *          out (schema_validate.js). Applying a schema is restarting the
 *          yuno that owns it.
 *        - the schema as its C literal (schema_to_c.js), because an
 *          edit made here works and lives nowhere the next build knows
 *          about; and the way back in, as a reviewed plan
 *          (schema_import.js).
 *
 *      STATES, because each is a different screen and a different set
 *      of legal actions — an action arriving in the wrong one fails
 *      loudly and names its sender, which is the whole point of
 *      routing a click through the machine:
 *          ST_IDLE       no transport yet, or hidden
 *          ST_LOADING    the three `nodes` requests in flight
 *          ST_EMPTY      the yuno's system schema holds no treedb
 *          ST_TREEDBS    the treedbs of this yuno
 *          ST_TOPICS     the topics of one treedb
 *          ST_DIAGRAM    that treedb drawn
 *          ST_COLUMNS    the columns of one topic
 *          ST_SAVING     a write, or a plan of them, in flight
 *
 *      THE URL CARRIES THE POSITION (ROUTING.md): the tail this view
 *      owns is `<treedb>[/<topic>]` or `<treedb>/diagram`. It is
 *      applied from the host's EV_SHOW and mirrored back with
 *      EV_POSITION_CHANGED; this gclass navigates nothing itself.
 *
 *      TRANSPORT: the `gobj_remote_yuno` every backend-talking view of
 *      this library declares. It answers `nodes` / `create-node` /
 *      `update-node` / `delete-node` on the treedb service, and it may
 *      be a routing adapter two hops away (the agent console's
 *      C_AGENT_TREEDB_LINK) — this view cannot tell, and must not.
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
    log_warning,
    gobj_read_attr,
    gobj_read_str_attr,
    gobj_read_bool_attr,
    gobj_read_pointer_attr,
    gobj_write_attr,
    gobj_name,
    gobj_short_name,
    gobj_parent,
    gobj_command,
    gobj_create_pure_child,
    gobj_start,
    gobj_stop,
    gobj_destroy,
    gobj_is_destroying,
    gobj_send_event,
    gobj_publish_event,
    gobj_subscribe_event,
    gobj_unsubscribe_event,
    gobj_current_state,
    gobj_change_state,
    createElement2,
    refresh_language,
    clean_name,
    msg_iev_get_stack,
    kw_get_str,
    kw_get_dict,
    is_object,
    empty_string,
} from "@yuneta/gobj-js";

import "./c_yui_schema_editor.css";

import {
    build_schema_model,
    find_treedb,
    find_topic,
    find_col,
    col_flags,
    col_hook,
    col_enum,
    is_empty_value,
    fkey_ref,
    next_order,
    moved_orders,
} from "./schema_model.js";
import {validate_schema, validate_model, has_errors} from "./schema_validate.js";
import {topic_descs} from "./schema_descs.js";
import {schema_to_json, schema_to_c} from "./schema_to_c.js";
import {plan_import, plan_deletes} from "./schema_import.js";
import {grouped_flags, toggle_flag} from "./schema_flags.js";
import {write_command, write_options} from "./schema_write_options.js";
import {COL_TYPES} from "./schema_validate.js";

import {yui_shell_of} from "./c_yui_shell.js";
import {
    yui_shell_show_modal,
    yui_shell_show_error,
    yui_shell_show_info,
    yui_shell_confirm_danger,
} from "./shell_modals.js";

import {t} from "i18next";


/***************************************************************
 *              Constants
 ***************************************************************/
const GCLASS_NAME = "C_YUI_SCHEMA_EDITOR";

/*  The three topics a schema is stored in. Named once: everything
 *  below addresses them by these constants and nothing composes the
 *  strings again.  */
const T_TREEDBS = "treedbs";
const T_TOPICS  = "topics";
const T_COLS    = "cols";

/*  The hook each level is reached through, which is what a new child's
 *  fkey has to name. Getting it wrong links the record to nothing
 *  while the write still succeeds.  */
const HOOK_TOPICS = "topics";
const HOOK_COLS   = "cols";

/*  The tail segment that opens the drawing instead of a topic. Reserved:
 *  a topic with this name is not reachable by its own name, the same
 *  bargain the treedb views already make with `schema` and `graph`.  */
const DIAGRAM_SEG = "diagram";

/*  Marker of OUR requests: the transport may be shared with other
 *  panels (the agent console publishes every answer to every one of
 *  them), and each filters on its own purpose.  */
const PURPOSE = "schema_editor";


/***************************************************************
 *              Attrs
 ***************************************************************/
const attrs_table = [
SDATA(data_type_t.DTP_POINTER,  "subscriber",       0,  null,   "Subscriber of output events"),
SDATA(data_type_t.DTP_POINTER,  "gobj_remote_yuno", 0,  null,   "Transport: the treedb's service, or an adapter that reaches it"),
SDATA(data_type_t.DTP_STRING,   "treedb_name",      0,  "",     "Service name of the system-schema treedb (the one holding the schemas as data)"),
SDATA(data_type_t.DTP_BOOLEAN,  "readonly",         0,  false,  "This yuno is not the MASTER of the treedb's tranger, so it refuses every write: mount without the write affordances instead of turning each click into an error"),
SDATA(data_type_t.DTP_STRING,   "base_route",       0,  "",     "This view's route: the position under it is <treedb>[/<topic>] (host-supplied; ROUTING.md)"),
SDATA(data_type_t.DTP_POINTER,  "$container",       0,  null,   "Root HTMLElement"),
SDATA_END()
];

let PRIVATE_DATA = {
    /*  What the store answered, and what it means  */
    records:        null,   /*  {treedbs, topics, cols} as they arrived  */
    model:          null,   /*  build_schema_model() of the above  */
    pending:        0,      /*  `nodes` requests still in flight  */
    load_error:     "",

    /*  Where the operator is. The url carries it; these mirror it.  */
    treedb_id:      "",
    topic_name:     "",
    diagram:        false,

    /*  What this session changed, which is what decides whether a
     *  version still has to move.  */
    baseline:       null,   /*  {topic id: topic_version} at load time  */
    written:        null,   /*  {topic id: true}  */

    /*  Children and overlays  */
    diagram_gobj:   null,
    dialog:         null,

    /*  A write, or a plan of them, in flight  */
    save_queue:     null,
    save_return:    "",
    save_wrote:     false,
    connected:      false,

    /*  A position that arrived while a write was in flight  */
    pending_seg:    null,

    /*  The import dialog's plan and the two nodes it draws into  */
    import_plan:    null,
    import_pane:    null,
    import_run:     null,
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

    priv.baseline = {};
    priv.written = {};
    priv.save_queue = [];

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
    let shell = yui_shell_of(gobj);

    /*  What a WIDGET draws is reachable by no i18n attribute, and this
     *  view draws all of its rows itself: it re-renders on the shell's
     *  language event rather than listening to i18next directly.  */
    if(shell) {
        gobj_subscribe_event(shell, "EV_LANGUAGE_CHANGED", {}, gobj);
    }
    request_model(gobj);
}

/***************************************************************
 *          Framework Method: Stop
 ***************************************************************/
function mt_stop(gobj)
{
    let shell = yui_shell_of(gobj);

    if(shell) {
        gobj_unsubscribe_event(shell, "EV_LANGUAGE_CHANGED", {}, gobj);
    }
    close_dialog(gobj);
    destroy_diagram(gobj);
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




/***************************************************************
 *  The frame: a toolbar that never changes place, a notice line
 *  for what the whole view has to say, and one body the screens
 *  take turns in. The screens are re-rendered, the frame is not.
 ***************************************************************/
function build_ui(gobj)
{
    let $container = createElement2(
        ["div", {class: `${GCLASS_NAME} SCHEMA_CARD view-card`,
                 style: "height:100%; display:flex; flex-direction:column; min-height:0;"}, [
            ["div", {class: "SCHEMA_TOOLBAR is-flex is-align-items-center",
                     style: "gap:.25rem; padding:.25rem;"}, []],
            ["div", {class: "SCHEMA_NOTICE p-4 has-text-grey is-hidden"}, []],
            ["div", {class: "SCHEMA_BODY", style: "flex:1 1 auto; min-height:0; overflow:auto;"}, []]
        ]]
    );

    gobj_write_attr(gobj, "$container", $container);
    refresh_language($container, t);
}

/***************************************************************
 *   Destroy UI
 ***************************************************************/
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

/***************************************************************
 *  Attributes, minus the ones that are not there.
 *
 *  createElement2() sets every key it is given with
 *  setAttribute(), so a key whose value is `undefined` renders
 *  the STRING "undefined" — and `disabled="undefined"` is a
 *  disabled button, `checked="undefined"` a checked box. Every
 *  conditional attribute in this file goes through here.
 ***************************************************************/
function el_attrs(attrs)
{
    for(let key of Object.keys(attrs)) {
        if(attrs[key] === undefined) {
            delete attrs[key];
        }
    }
    return attrs;
}

/***************************************************************
 *  The body stops answering while a write is in flight.
 ***************************************************************/
function set_busy(gobj, busy)
{
    let $body = $of(gobj, ".SCHEMA_BODY");

    if($body) {
        $body.classList.toggle("SCHEMA_BUSY", !!busy);
    }
}

/***************************************************************
 *  Shorthands for the three panes of the frame.
 ***************************************************************/
function $of(gobj, selector)
{
    let $container = gobj_read_attr(gobj, "$container");

    return $container ? $container.querySelector(selector) : null;
}

function clear($el)
{
    if(!$el) {
        return;
    }
    while($el.firstChild) {
        $el.removeChild($el.firstChild);
    }
}

/***************************************************************
 *  Is the store writable from here? A read-only mount is a
 *  property of the STORE (this yuno does not master the tranger),
 *  and it wins over every button.
 ***************************************************************/
function is_readonly(gobj)
{
    return gobj_read_bool_attr(gobj, "readonly");
}

/***************************************************************
 *  A write this view refuses to attempt. Called from the actions
 *  themselves and not from the code that draws the buttons: a
 *  hidden button is not a refused action, and an event arriving
 *  anyway — from a keyboard, from a stale screen — must be
 *  answered.
 ***************************************************************/
function refuse_if_readonly(gobj, event)
{
    if(!is_readonly(gobj)) {
        return false;
    }
    log_warning(`${gobj_short_name(gobj)}: ${event} refused, the treedb is read-only`);
    yui_shell_show_error(yui_shell_of(gobj), "the treedb is read-only", {t: t});
    return true;
}




                    /***************************
                     *      The model
                     ***************************/




/***************************************************************
 *  One request per meta-topic. Three round trips and the whole
 *  schema set of the yuno is here: everything below — the
 *  drawing, the validation, the export — is computed from these
 *  and asks the backend nothing more.
 ***************************************************************/
function request_model(gobj)
{
    let priv = gobj.priv;
    let remote = gobj_read_pointer_attr(gobj, "gobj_remote_yuno");

    if(!remote) {
        return -1;      /*  not mounted on a transport yet: mt_start retries via EV_TRANSPORT_STATE  */
    }

    priv.records = {treedbs: [], topics: [], cols: []};
    priv.load_error = "";
    priv.pending = 0;
    gobj_change_state(gobj, "ST_LOADING");
    show_notice(gobj, "loading the schemas");

    for(let topic_name of [T_TREEDBS, T_TOPICS, T_COLS]) {
        if(remote_command(gobj, "nodes", {
            topic_name: topic_name,
            options:    {list_dict: true}
        }) === 0) {
            priv.pending++;
        }
    }
    if(priv.pending === 0) {
        priv.load_error = t("cannot reach the treedb");
        gobj_change_state(gobj, "ST_IDLE");
        show_notice(gobj, "cannot reach the treedb");
        return -1;
    }
    return 0;
}

/***************************************************************
 *  Every request this view makes goes through here, so the
 *  service name, the purpose marker and the echo of what was
 *  asked are written ONCE.
 *
 *  `__md_command__` travels out and comes back: it is how an
 *  answer says which topic it is about, since the command is
 *  `nodes` for all three.
 ***************************************************************/
function remote_command(gobj, command, kw)
{
    let remote = gobj_read_pointer_attr(gobj, "gobj_remote_yuno");
    let treedb_name = gobj_read_str_attr(gobj, "treedb_name");

    if(!remote) {
        log_error(`${gobj_short_name(gobj)}: no transport for '${command}'`);
        return -1;
    }

    let full_kw = Object.assign({
        service:     treedb_name,
        treedb_name: treedb_name
    }, kw || {});

    /*  What has to come BACK with the answer.
     *
     *  Its keys repeat the ones the command already carries, on purpose:
     *  the transport may be a direct C_IEVENT_CLI, which echoes the whole
     *  request as the command_stack frame, or a routing adapter, which
     *  echoes `__md_command__` AS that frame (c_agent_treedb_link.js).
     *  Same names in both places is what makes the answer readable
     *  whichever one is under this view — and `record_id` is here and
     *  NOT at the top level because a delete answers with nothing, and a
     *  parameter the treedb does not know has no business travelling.  */
    full_kw.__md_command__ = {
        purpose:    PURPOSE,
        topic_name: (kw && kw.topic_name) || "",
        record_id:  (kw && kw.record_id) || ""
    };
    delete full_kw.record_id;

    let ret = gobj_command(remote, command, full_kw, gobj);
    if(ret) {
        log_error(ret);
        return -1;
    }
    return 0;
}

/***************************************************************
 *  The three answers are in: build the schema and remember the
 *  versions it arrived with. The baseline is what "this topic
 *  still needs its version raised" is measured against, so it is
 *  taken here and never touched again until the next load.
 ***************************************************************/
function build_model(gobj)
{
    let priv = gobj.priv;

    priv.model = build_schema_model(priv.records);
    priv.baseline = {};
    for(let treedb of priv.model.treedbs) {
        for(let topic of treedb.topics) {
            priv.baseline[topic.id] = topic.topic_version;
        }
    }
}

/***************************************************************
 *  Say what the whole store would be refused for.
 *
 *  Not for this view — it has a button for that — but for
 *  WHOEVER APPLIES. Applying a schema is restarting the yuno that
 *  owns it, and the restart is driven from a tab above this one
 *  that has no way to know what was edited. So the count travels
 *  up on every settle, and the confirmation up there can say what
 *  it is about to restart onto.
 ***************************************************************/
function publish_check(gobj)
{
    let priv = gobj.priv;

    if(!priv.model) {
        return;
    }
    let findings = validate_model(priv.model, {
        written_topics: Object.keys(priv.written),
        baseline:       priv.baseline
    });
    gobj_publish_event(gobj, "EV_SCHEMA_CHECKED", {
        treedb_name: gobj_read_str_attr(gobj, "treedb_name"),
        errors:      findings.filter(f => f.severity === "error").length,
        warnings:    findings.filter(f => f.severity === "warning").length,
        /*  Plain JSON, and capped: the kw of an event is dumped by the
         *  machine trace, and a schema with two hundred findings would
         *  put all of them in it.  */
        first:       findings.slice(0, 5).map((f) => {
            return {severity: f.severity, code: f.code, topic: f.topic,
                    col: f.col, detail: f.detail};
        })
    });
}

/***************************************************************
 *  What the store has to be asked again for. A write answers
 *  with the record it wrote, so the model is patched in place
 *  rather than reloaded: reloading three topics after every
 *  keystroke of an edit is three round trips per column.
 ***************************************************************/
function patch_record(gobj, topic_name, record)
{
    let priv = gobj.priv;

    if(!priv.records || !record || typeof record.id !== "string") {
        return;
    }
    let list = priv.records[topic_name];
    if(!Array.isArray(list)) {
        return;
    }
    let at = -1;
    for(let i = 0; i < list.length; i++) {
        if(list[i] && list[i].id === record.id) {
            at = i;
            break;
        }
    }
    if(at >= 0) {
        list[at] = Object.assign({}, list[at], record);
    } else {
        list.push(record);
    }
    build_model(gobj);
}

function forget_record(gobj, topic_name, id)
{
    let priv = gobj.priv;

    if(!priv.records || !Array.isArray(priv.records[topic_name])) {
        return;
    }
    priv.records[topic_name] = priv.records[topic_name].filter((r) => {
        return !r || r.id !== id;
    });
    build_model(gobj);
}

/***************************************************************
 *  Where the operator is, resolved against the model that is
 *  actually loaded. A deep link to a treedb or a topic that is
 *  no longer there lands one level up instead of on an empty
 *  screen.
 ***************************************************************/
function current_treedb(gobj)
{
    let priv = gobj.priv;

    return priv.model ? find_treedb(priv.model, priv.treedb_id) : null;
}

function current_topic(gobj)
{
    let priv = gobj.priv;

    return priv.model ? find_topic(priv.model, priv.treedb_id, priv.topic_name) : null;
}




                    /***************************
                     *      The screens
                     ***************************/




/***************************************************************
 *  One line for what the whole view has to say: loading, empty,
 *  or the reason nothing loaded. Carries its i18n key, so it
 *  follows a language change like any other text.
 ***************************************************************/
function show_notice(gobj, key, detail)
{
    let $notice = $of(gobj, ".SCHEMA_NOTICE");

    if(!$notice) {
        return;
    }
    clear($notice);
    if(!key) {
        $notice.classList.add("is-hidden");
        return;
    }
    $notice.classList.remove("is-hidden");
    $notice.appendChild(createElement2(
        ["span", {class: "SCHEMA_NOTICE_TEXT", i18n: key}, t(key)]
    ));
    if(detail) {
        $notice.appendChild(createElement2(
            ["span", {class: "SCHEMA_NOTICE_DETAIL has-text-grey ml-2"}, `${detail}`]
        ));
    }
}

/***************************************************************
 *  A button of the toolbar. Every one carries an icon and a
 *  label; the label hides on a phone because this toolbar holds
 *  more than two buttons at its widest.
 ***************************************************************/
function toolbar_button(logical, icon, key, event, disabled)
{
    return ["button", el_attrs({class: `${logical} button is-small`,
                       type: "button",
                       disabled: disabled ? "disabled" : undefined,
                       title: t(key), "aria-label": t(key),
                       "data-i18n-title": key, "data-i18n-aria-label": key}), [
        ["span", {class: "icon"}, [["i", {class: icon}]]],
        ["span", {class: "is-hidden-mobile", i18n: key}, t(key)]
    ], {
        click: (evt) => {
            evt.stopPropagation();
            gobj_send_event(evt.currentTarget.__gobj__, event, {}, evt.currentTarget.__gobj__);
        }
    }];
}

/***************************************************************
 *  The toolbar: where you are on the left, what you can do on
 *  the right. Rebuilt with the screen, because both halves
 *  depend on it.
 ***************************************************************/
function render_toolbar(gobj)
{
    let priv = gobj.priv;
    let $toolbar = $of(gobj, ".SCHEMA_TOOLBAR");

    if(!$toolbar) {
        return;
    }
    clear($toolbar);

    let state = gobj_current_state(gobj);
    let readonly = is_readonly(gobj);
    let has_model = !!priv.model;

    /*----------------------------------------------*
     *  Left: back, then the position as a trail.
     *----------------------------------------------*/
    let $left = [];
    if(priv.treedb_id) {
        $left.push(["button", {class: "SCHEMA_BACK button is-small",
                               type: "button",
                               title: t("back"), "aria-label": t("back"),
                               "data-i18n-title": "back", "data-i18n-aria-label": "back"}, [
            ["span", {class: "icon"}, [["i", {class: "yi-arrow-left"}]]]
        ], {
            click: (evt) => {
                evt.stopPropagation();
                gobj_send_event(gobj, "EV_BACK", {}, gobj);
            }
        }]);
    }

    let $trail = [
        ["span", {class: "SCHEMA_CRUMB_ROOT", i18n: "schemas"}, t("schemas")]
    ];
    if(priv.treedb_id) {
        $trail.push(["span", {class: "SCHEMA_CRUMB_SEP"}, "/"]);
        $trail.push(["span", {class: "SCHEMA_CRUMB_TREEDB"}, priv.treedb_id]);
    }
    if(priv.topic_name) {
        $trail.push(["span", {class: "SCHEMA_CRUMB_SEP"}, "/"]);
        $trail.push(["span", {class: "SCHEMA_CRUMB_TOPIC"}, priv.topic_name]);
    }
    if(priv.diagram) {
        $trail.push(["span", {class: "SCHEMA_CRUMB_SEP"}, "/"]);
        $trail.push(["span", {class: "SCHEMA_CRUMB_DIAGRAM", i18n: "diagram"}, t("diagram")]);
    }
    $left.push(["nav", {class: "SCHEMA_CRUMBS is-size-7 has-text-grey ml-1"}, $trail]);

    /*----------------------------------------------*
     *  Right: what is legal HERE. A button that is not
     *  legal is left out; a button that is legal and
     *  refused says why when it is pressed.
     *----------------------------------------------*/
    let $right = [];
    if(priv.treedb_id && has_model) {
        $right.push(toolbar_button("SCHEMA_DIAGRAM_BTN", "yi-hexagon-nodes",
            priv.diagram ? "topics" : "diagram", "EV_TOGGLE_DIAGRAM", false));
        $right.push(toolbar_button("SCHEMA_VALIDATE_BTN", "yi-square-check",
            "check", "EV_VALIDATE", false));
        $right.push(toolbar_button("SCHEMA_EXPORT_BTN", "yi-download",
            "export", "EV_EXPORT", false));
        if(!readonly) {
            $right.push(toolbar_button("SCHEMA_IMPORT_BTN", "yi-upload",
                "import", "EV_IMPORT", false));
        }
    }
    if(priv.topic_name && !readonly && !priv.diagram) {
        $right.push(toolbar_button("SCHEMA_ADD_COL_BTN", "yi-plus",
            "new column", "EV_ADD_COLUMN", false));
    }
    if(priv.treedb_id && !priv.topic_name && !readonly && !priv.diagram) {
        $right.push(toolbar_button("SCHEMA_ADD_TOPIC_BTN", "yi-plus",
            "new topic", "EV_ADD_TOPIC", false));
    }
    $right.push(toolbar_button("SCHEMA_REFRESH_BTN", "yi-arrows-rotate",
        "refresh", "EV_REFRESH", state === "ST_LOADING"));

    let $bar = createElement2(
        ["div", {class: "SCHEMA_TOOLBAR_INNER is-flex is-align-items-center",
                 style: "gap:.25rem; width:100%;"}, [
            ["div", {class: "SCHEMA_TOOLBAR_START is-flex is-align-items-center",
                     style: "gap:.25rem; min-width:0;"}, $left],
            ["div", {class: "SCHEMA_TOOLBAR_END is-flex is-align-items-center",
                     style: "gap:.25rem; margin-left:auto;"}, $right]
        ]]
    );

    /*  The click handlers above reach the gobj through the button they
     *  are on: a kw may not carry one (the machine trace dumps it), and
     *  a closure per button would keep this gclass alive after it is
     *  destroyed.  */
    for(let $button of $bar.querySelectorAll("button")) {
        $button.__gobj__ = gobj;
        if(state === "ST_SAVING") {
            $button.disabled = true;
        }
    }
    $toolbar.appendChild($bar);
    refresh_language($toolbar, t);
}

/***************************************************************
 *  Draw whatever the current state says. One place decides which
 *  screen is on, so a state change and a re-render cannot
 *  disagree.
 ***************************************************************/
function render(gobj)
{
    let priv = gobj.priv;
    let state = gobj_current_state(gobj);
    let $body = $of(gobj, ".SCHEMA_BODY");

    if(!$body) {
        return;
    }
    render_toolbar(gobj);

    if(state === "ST_LOADING") {
        show_notice(gobj, "loading the schemas");
        clear($body);
        return;
    }
    if(state === "ST_IDLE") {
        show_notice(gobj, priv.load_error ? "cannot load the schemas" : "not connected",
            priv.load_error);
        clear($body);
        return;
    }
    if(state === "ST_EMPTY") {
        show_notice(gobj, "this yuno stores no schema");
        clear($body);
        return;
    }
    if(state === "ST_SAVING") {
        return;     /*  the screen under it stays; end_writes redraws it  */
    }

    show_notice(gobj, "");
    if(state === "ST_DIAGRAM") {
        render_diagram(gobj);
        return;
    }
    destroy_diagram(gobj);
    clear($body);
    if(state === "ST_COLUMNS") {
        render_columns(gobj, $body);
        return;
    }
    if(state === "ST_TOPICS") {
        render_topics(gobj, $body);
        return;
    }
    render_treedbs(gobj, $body);
}

/***************************************************************
 *  A card that opens something, with its own logical name. The
 *  cards grid is the shell's, so a schema card and a nav card
 *  look alike on purpose.
 ***************************************************************/
function open_card(gobj, logical, title, icon, tags, event, kw)
{
    let $tags = tags.map((tag) => {
        return ["span", {class: `${logical}_TAG tag ${tag.style || "is-light"}`},
            tag.i18n
                ? [["span", {i18n: tag.i18n}, t(tag.i18n)],
                   ["span", {class: "ml-1"}, `${tag.text}`]]
                : `${tag.text}`];
    });

    return ["div", {class: `${logical} yui-nav-card card`, role: "button", tabindex: "0"}, [
        ["div", {class: `${logical}_BODY card-content p-3`}, [
            ["p", {class: `${logical}_TITLE is-flex is-align-items-center`,
                   style: "gap:.4rem;"}, [
                ["span", {class: "icon"}, [["i", {class: icon}]]],
                ["span", {class: `${logical}_NAME has-text-weight-semibold`}, `${title}`]
            ]],
            ["div", {class: `${logical}_TAGS tags mt-2`, style: "gap:.25rem;"}, $tags]
        ]]
    ], {
        click: (evt) => {
            evt.stopPropagation();
            gobj_send_event(gobj, event, kw, gobj);
        },
        keydown: (evt) => {
            if(evt.key !== "Enter" && evt.key !== " ") {
                return;
            }
            evt.preventDefault();
            gobj_send_event(gobj, event, kw, gobj);
        }
    }];
}

/***************************************************************
 *  ST_TREEDBS — the treedbs this yuno keeps a schema for.
 *
 *  The badge that matters is the version pair: `schema_version`
 *  above `c_schema_version` is the shape of an operator edit AND
 *  the shape of a plain re-projection, so it is shown and not
 *  interpreted — `diff-schema`, in the tab above this view, is
 *  what tells the two apart.
 ***************************************************************/
function render_treedbs(gobj, $body)
{
    let priv = gobj.priv;
    let $cards = [];

    for(let treedb of priv.model.treedbs) {
        let tags = [
            {i18n: "topics", text: treedb.topics.length},
            {i18n: "version", text: treedb.schema_version === undefined
                ? "?" : treedb.schema_version}
        ];
        if(treedb.c_schema_version !== undefined &&
            String(treedb.c_schema_version) !== String(treedb.schema_version)
        ) {
            tags.push({i18n: "from c", text: treedb.c_schema_version, style: "is-warning is-light"});
        }
        $cards.push(open_card(gobj, "SCHEMA_TREEDB_CARD", treedb.id, "yi-database",
            tags, "EV_SELECT_TREEDB", {treedb: treedb.id}));
    }

    if(priv.model.orphan_topics.length > 0 || priv.model.orphan_cols.length > 0) {
        /*  A leftover of a deletion belongs to no treedb and would be
         *  invisible in a screen that only draws the tree. Saying it
         *  here is the only place it can be said.  */
        $cards.push(open_card(gobj, "SCHEMA_ORPHAN_CARD", t("orphans"), "yi-triangle-exclamation",
            [{i18n: "topics", text: priv.model.orphan_topics.length},
             {i18n: "columns", text: priv.model.orphan_cols.length}],
            "EV_SHOW_ORPHANS", {}));
    }

    let $grid = createElement2(
        ["div", {class: "SCHEMA_TREEDBS yui-nav-cards p-3"}, $cards]
    );
    $body.appendChild($grid);
    refresh_language($grid, t);
}

/***************************************************************
 *  ST_TOPICS — the topics of one treedb, in schema order.
 *
 *  A row per topic rather than a card: the operator is comparing
 *  versions and column counts down a column, which a grid of
 *  cards makes them read across.
 ***************************************************************/
function render_topics(gobj, $body)
{
    let priv = gobj.priv;
    let treedb = current_treedb(gobj);

    if(!treedb) {
        show_notice(gobj, "that treedb is not here any more", priv.treedb_id);
        return;
    }

    let readonly = is_readonly(gobj);
    let twice = repeated_names(treedb.topics);
    let $rows = [];
    for(let topic of treedb.topics) {
        let pending = priv.written[topic.id] &&
            String(priv.baseline[topic.id]) === String(topic.topic_version);
        /*  Two topics of one name: the id is what tells them apart, and
         *  it is what the url has to carry — addressing by name would
         *  open the first one whichever row was clicked.  */
        let ambiguous = !!twice[topic.name];
        let address = ambiguous ? topic.id : topic.name;

        let $actions = [];
        if(!readonly) {
            $actions.push(row_icon(gobj, "SCHEMA_TOPIC_EDIT", "yi-pen", "edit topic",
                "EV_EDIT_TOPIC", {topic: address}));
            $actions.push(row_icon(gobj, "SCHEMA_TOPIC_DELETE", "yi-trash", "delete topic",
                "EV_DELETE_TOPIC", {topic: address}));
        }

        $rows.push(["tr", {class: "SCHEMA_TOPIC_ROW", role: "button", tabindex: "0"}, [
            ["td", {class: "SCHEMA_TOPIC_NAME"}, [
                ["span", {class: "has-text-weight-semibold"}, `${topic.name}`],
                topic.system_topic
                    ? ["span", {class: "SCHEMA_TOPIC_SYSTEM tag is-light ml-2",
                                i18n: "system"}, t("system")]
                    : ["span", {}, ""],
                ambiguous
                    ? ["div", {class: "SCHEMA_TOPIC_ID is-size-7 has-text-grey"},
                        [["code", {}, `${topic.id}`]]]
                    : ["span", {}, ""]
            ]],
            ["td", {class: "SCHEMA_TOPIC_PKEY"}, [["code", {}, `${topic.pkey || "id"}`]]],
            ["td", {class: "SCHEMA_TOPIC_COLS has-text-right"}, `${topic.cols.length}`],
            ["td", {class: "SCHEMA_TOPIC_VERSION"}, [
                ["span", {class: `tag ${pending ? "is-warning" : "is-info"} is-light`},
                    `${topic.topic_version === undefined ? "?" : topic.topic_version}`]
            ]],
            ["td", {class: "SCHEMA_TOPIC_ACTIONS has-text-right"}, $actions]
        ], {
            click: (evt) => {
                if(evt.target.closest(".SCHEMA_TOPIC_ACTIONS")) {
                    return;     /*  a row action, not the row  */
                }
                gobj_send_event(gobj, "EV_SELECT_TOPIC", {topic: address}, gobj);
            },
            keydown: (evt) => {
                if(evt.key !== "Enter" && evt.key !== " ") {
                    return;
                }
                evt.preventDefault();
                gobj_send_event(gobj, "EV_SELECT_TOPIC", {topic: address}, gobj);
            }
        }]);
    }

    let $table = createElement2(
        ["div", {class: "SCHEMA_TOPICS p-3", style: "overflow-x:auto;"}, [
            ["table", {class: "SCHEMA_TOPICS_TABLE table is-fullwidth is-narrow is-hoverable"}, [
                ["thead", {}, [
                    ["tr", {}, [
                        ["th", {i18n: "topic"}, t("topic")],
                        ["th", {i18n: "pkey"}, t("pkey")],
                        ["th", {class: "has-text-right", i18n: "columns"}, t("columns")],
                        ["th", {i18n: "version"}, t("version")],
                        ["th", {}, ""]
                    ]]
                ]],
                ["tbody", {}, $rows]
            ]]
        ]]
    );
    $body.appendChild($table);
    refresh_language($table, t);
}

/***************************************************************
 *  A small icon button inside a row. Icon only, with the label
 *  in `title`/`aria-label`: a row is the one place where the
 *  labels do not fit at 360px.
 ***************************************************************/
function row_icon(gobj, logical, icon, key, event, kw)
{
    return ["button", {class: `${logical} button is-small is-ghost`,
                       type: "button",
                       title: t(key), "aria-label": t(key),
                       "data-i18n-title": key, "data-i18n-aria-label": key}, [
        ["span", {class: "icon is-small"}, [["i", {class: icon}]]]
    ], {
        click: (evt) => {
            evt.stopPropagation();
            gobj_send_event(gobj, event, kw, gobj);
        }
    }];
}

/***************************************************************
 *  Which names appear more than once.
 *
 *  A store can hold TWO GENERATIONS of the same schema: the
 *  projector never deletes, so a treedb re-keyed by a newer SDK
 *  keeps its old rowid-keyed rows next to the qualified ones, and
 *  both are children of the same treedb with the same name. Drawn
 *  as two identical rows that behave differently, that reads as a
 *  bug in the editor; drawn with what tells them apart, it reads
 *  as what it is.
 ***************************************************************/
function repeated_names(list)
{
    let seen = {};
    let twice = {};

    for(let entry of list) {
        if(seen[entry.name]) {
            twice[entry.name] = true;
        }
        seen[entry.name] = true;
    }
    return twice;
}

/***************************************************************
 *  ST_COLUMNS — the columns of one topic, in schema order.
 *
 *  The order is a FIELD (`order`), so the rows are draggable and
 *  a drop writes the rows whose place actually changed — a drag
 *  in a forty-column topic is two or three writes, not forty.
 *
 *  What each row shows is what a schema is read for: the name,
 *  what it holds, and what it links to. The rest of a column
 *  definition is one click away, in the form.
 ***************************************************************/
function render_columns(gobj, $body)
{
    let priv = gobj.priv;
    let topic = current_topic(gobj);

    if(!topic) {
        show_notice(gobj, "that topic is not here any more", priv.topic_name);
        return;
    }

    let readonly = is_readonly(gobj);
    let $wrap = createElement2(["div", {class: "SCHEMA_COLUMNS p-3"}, []]);

    /*----------------------------------------------*
     *  The version banner: the one thing that makes
     *  an edit succeed and change nothing.
     *----------------------------------------------*/
    let $banner = version_banner(gobj, topic);
    if($banner) {
        $wrap.appendChild($banner);
    }

    let twice = repeated_names(topic.cols);
    let $rows = [];
    for(let i = 0; i < topic.cols.length; i++) {
        $rows.push(column_row(gobj, topic, topic.cols[i], i, readonly, twice));
    }

    let $table = createElement2(
        ["div", {class: "SCHEMA_COLUMNS_WRAP", style: "overflow-x:auto;"}, [
            ["table", {class: "SCHEMA_COLUMNS_TABLE table is-fullwidth is-narrow is-hoverable"}, [
                ["thead", {}, [
                    ["tr", {}, [
                        ["th", {class: "SCHEMA_COL_HANDLE_TH"}, ""],
                        ["th", {i18n: "column"}, t("column")],
                        ["th", {i18n: "header"}, t("header")],
                        ["th", {i18n: "type"}, t("type")],
                        ["th", {i18n: "flags"}, t("flags")],
                        ["th", {i18n: "link"}, t("link")],
                        ["th", {}, ""]
                    ]]
                ]],
                ["tbody", {class: "SCHEMA_COLUMNS_BODY"}, $rows]
            ]]
        ]]
    );
    $wrap.appendChild($table);

    if(topic.cols.length === 0) {
        $wrap.appendChild(createElement2(
            ["p", {class: "SCHEMA_COLUMNS_EMPTY has-text-grey p-3",
                   i18n: "this topic has no column"}, t("this topic has no column")]
        ));
    }

    $body.appendChild($wrap);
    refresh_language($wrap, t);
}

/***************************************************************
 *  "This topic changed and its version did not."
 *
 *  Only shown when it is TRUE — the topic was written in this
 *  session and its `topic_version` still reads what it read when
 *  the model loaded. Every write this view makes raises it, so
 *  the banner is for the case where something else did not: an
 *  edit made from the raw tables, or a bump undone by hand.
 ***************************************************************/
function version_banner(gobj, topic)
{
    let priv = gobj.priv;

    if(!priv.written[topic.id]) {
        return null;
    }
    if(String(priv.baseline[topic.id]) !== String(topic.topic_version)) {
        return null;
    }
    if(is_readonly(gobj)) {
        return null;
    }

    let $banner = createElement2(
        ["div", {class: "SCHEMA_VERSION_BANNER notification is-warning is-light p-3 mb-3 " +
                        "is-flex is-align-items-center", style: "gap:.5rem;"}, [
            ["span", {class: "icon"}, [["i", {class: "yi-triangle-exclamation"}]]],
            ["span", {class: "SCHEMA_VERSION_TEXT is-size-7", i18n: "version not raised"},
                t("version not raised")],
            ["button", {class: "SCHEMA_VERSION_BUMP button is-small is-warning",
                        type: "button",
                        style: "margin-left:auto;",
                        title: t("raise the version"), "aria-label": t("raise the version"),
                        "data-i18n-title": "raise the version",
                        "data-i18n-aria-label": "raise the version"}, [
                ["span", {class: "icon"}, [["i", {class: "yi-chevron-up"}]]],
                ["span", {i18n: "raise"}, t("raise")]
            ]]
        ]]
    );
    let $bump = $banner.querySelector(".SCHEMA_VERSION_BUMP");
    $bump.addEventListener("click", (evt) => {
        evt.stopPropagation();
        gobj_send_event(gobj, "EV_BUMP_VERSION", {topic: topic.name}, gobj);
    });
    return $banner;
}

/***************************************************************
 *  One column, as a row. The drag events carry INDEXES in the
 *  dataset and the drop turns them into an event: the kw of a
 *  Yuneta event is plain JSON, so a DOM node never travels in
 *  one.
 ***************************************************************/
function column_row(gobj, topic, col, index, readonly, twice)
{
    let record = col.record || {};
    /*  Same two generations as the topics above: when a name is not
     *  unique the id is what addresses the row.  */
    let ambiguous = !!(twice && twice[col.name]);
    let address = ambiguous ? col.id : col.name;
    let flags = col_flags(record);
    let hook = col_hook(record);
    let is_pkey = (col.name === (topic.pkey || "id"));

    let $flags = flags.map((flag) => {
        return ["span", {class: `SCHEMA_COL_FLAG tag is-light ${flag_style(flag)}`}, `${flag}`];
    });

    /*  An unset `blob` column comes back as `{}`, which is an object and
     *  is not a hook: read as one, every column in the topic draws an
     *  arrow pointing at nothing.  */
    let link = "";
    if(hook && !is_empty_value(hook)) {
        link = "→ " + Object.keys(hook).join(", ");
    } else if(flags.indexOf("fkey") >= 0) {
        link = "↖";
    }

    let $actions = [];
    if(!readonly) {
        $actions.push(row_icon(gobj, "SCHEMA_COL_EDIT", "yi-pen", "edit column",
            "EV_EDIT_COLUMN", {col: address}));
        $actions.push(row_icon(gobj, "SCHEMA_COL_DUPLICATE", "yi-copy", "duplicate column",
            "EV_DUPLICATE_COLUMN", {col: address}));
        $actions.push(row_icon(gobj, "SCHEMA_COL_DELETE", "yi-trash", "delete column",
            "EV_DELETE_COLUMN", {col: address}));
    }

    let $row = createElement2(
        ["tr", {class: "SCHEMA_COL_ROW", "data-index": `${index}`,
                draggable: readonly ? "false" : "true"}, [
            ["td", {class: "SCHEMA_COL_HANDLE"},
                readonly ? [] : [["span", {class: "icon is-small has-text-grey"},
                    [["i", {class: "yi-grip-vertical"}]]]]],
            ["td", {class: "SCHEMA_COL_NAME"}, [
                ["code", {}, `${col.name}`],
                ambiguous
                    ? ["span", {class: "SCHEMA_COL_ID is-size-7 has-text-grey ml-2"},
                        [["code", {}, `${col.id}`]]]
                    : ["span", {}, ""],
                is_pkey
                    ? ["span", {class: "SCHEMA_COL_PKEY tag is-info is-light ml-2",
                                i18n: "pkey"}, t("pkey")]
                    : ["span", {}, ""]
            ]],
            ["td", {class: "SCHEMA_COL_HEADER"}, `${record.header || ""}`],
            ["td", {class: "SCHEMA_COL_TYPE"}, [["code", {}, `${record.type || ""}`]]],
            ["td", {class: "SCHEMA_COL_FLAGS"}, [
                ["div", {class: "tags", style: "gap:.2rem;"}, $flags]
            ]],
            ["td", {class: "SCHEMA_COL_LINK"}, `${link}`],
            ["td", {class: "SCHEMA_COL_ACTIONS has-text-right"}, $actions]
        ]]
    );

    if(!readonly) {
        wire_row_drag(gobj, $row);
    }
    $row.addEventListener("dblclick", (evt) => {
        if(readonly || evt.target.closest(".SCHEMA_COL_ACTIONS")) {
            return;
        }
        gobj_send_event(gobj, "EV_EDIT_COLUMN", {col: address}, gobj);
    });
    return $row;
}

/***************************************************************
 *  Which flags are worth a colour: the ones that change what
 *  the record IS, rather than how it is drawn.
 ***************************************************************/
function flag_style(flag)
{
    if(flag === "hook" || flag === "fkey") {
        return "is-link";
    }
    if(flag === "required" || flag === "notnull") {
        return "is-danger";
    }
    if(flag === "persistent") {
        return "is-success";
    }
    return "";
}

/***************************************************************
 *  Dragging a row to a new place. The DOM events are the
 *  browser's — an operating system as far as this app is
 *  concerned — so their only job is to turn a drop into
 *  EV_MOVE_COLUMN, which is where the work happens.
 ***************************************************************/
function wire_row_drag(gobj, $row)
{
    $row.addEventListener("dragstart", (evt) => {
        evt.dataTransfer.effectAllowed = "move";
        evt.dataTransfer.setData("text/plain", $row.dataset.index);
        $row.classList.add("SCHEMA_COL_DRAGGING");
    });
    $row.addEventListener("dragend", () => {
        $row.classList.remove("SCHEMA_COL_DRAGGING");
        let $body = $row.parentNode;
        if($body) {
            for(let $other of $body.querySelectorAll(".SCHEMA_COL_DROP_BEFORE, .SCHEMA_COL_DROP_AFTER")) {
                $other.classList.remove("SCHEMA_COL_DROP_BEFORE", "SCHEMA_COL_DROP_AFTER");
            }
        }
    });
    $row.addEventListener("dragover", (evt) => {
        evt.preventDefault();
        evt.dataTransfer.dropEffect = "move";
        let rect = $row.getBoundingClientRect();
        let before = (evt.clientY - rect.top) < (rect.height / 2);
        $row.classList.toggle("SCHEMA_COL_DROP_BEFORE", before);
        $row.classList.toggle("SCHEMA_COL_DROP_AFTER", !before);
    });
    $row.addEventListener("dragleave", () => {
        $row.classList.remove("SCHEMA_COL_DROP_BEFORE", "SCHEMA_COL_DROP_AFTER");
    });
    $row.addEventListener("drop", (evt) => {
        evt.preventDefault();
        evt.stopPropagation();
        let from = parseInt(evt.dataTransfer.getData("text/plain"), 10);
        let to = parseInt($row.dataset.index, 10);
        let rect = $row.getBoundingClientRect();
        if((evt.clientY - rect.top) >= (rect.height / 2)) {
            to = to + 1;
        }
        $row.classList.remove("SCHEMA_COL_DROP_BEFORE", "SCHEMA_COL_DROP_AFTER");
        if(!isFinite(from) || !isFinite(to)) {
            log_error(`${gobj_short_name(gobj)}: drop with no row index`);
            return;
        }
        gobj_send_event(gobj, "EV_MOVE_COLUMN", {from: from, to: to}, gobj);
    });
}

/***************************************************************
 *  ST_DIAGRAM — the treedb drawn from the records being edited.
 *
 *  Built lazily and shown, never created hidden: G6 measures its
 *  canvas the first time it is painted and would size it to a
 *  zero rect.
 ***************************************************************/
function render_diagram(gobj)
{
    let priv = gobj.priv;
    let $body = $of(gobj, ".SCHEMA_BODY");
    let treedb = current_treedb(gobj);

    if(!$body || !treedb) {
        show_notice(gobj, "that treedb is not here any more", priv.treedb_id);
        return;
    }
    if(!gclass_find_by_name("C_YUI_TREEDB_SCHEMA")) {
        log_error(`${gobj_short_name(gobj)}: C_YUI_TREEDB_SCHEMA not registered by the app`);
        show_notice(gobj, "the schema drawing is not available");
        return;
    }

    let descs = topic_descs(treedb);
    if(priv.diagram_gobj) {
        gobj_write_attr(priv.diagram_gobj, "descs", descs);
        gobj_send_event(priv.diagram_gobj, "EV_SHOW", {}, gobj);
        return;
    }

    clear($body);
    let $pane = createElement2(
        ["div", {class: "SCHEMA_DIAGRAM", style: "height:100%; min-height:0; overflow:hidden;"}, []]
    );
    $body.appendChild($pane);

    let diagram = gobj_create_pure_child(
        "diagram_" + clean_name(gobj_name(gobj)),
        "C_YUI_TREEDB_SCHEMA",
        {
            subscriber: gobj,
            descs:      descs,
            /*  No `node_route`: this diagram lives inside the editor and
             *  a node click is answered here, not by a hash the shell
             *  would have to own.  */
            node_route: "",
            system:     true
        },
        gobj
    );
    if(!diagram) {
        log_error(`${gobj_short_name(gobj)}: cannot create the schema drawing`);
        return;
    }
    priv.diagram_gobj = diagram;
    let $d = gobj_read_attr(diagram, "$container");
    if($d) {
        $pane.appendChild($d);
    }
    gobj_start(diagram);
    gobj_send_event(diagram, "EV_SHOW", {}, gobj);
}

function destroy_diagram(gobj)
{
    let priv = gobj.priv;

    if(!priv.diagram_gobj) {
        return;
    }
    gobj_stop(priv.diagram_gobj);
    gobj_destroy(priv.diagram_gobj);
    priv.diagram_gobj = null;
}




                    /***************************
                     *      The forms
                     ***************************/




/***************************************************************
 *  One overlay at a time, closed from one place: a dialog left
 *  behind by a re-render is a screen the operator can still type
 *  into and nothing will read.
 ***************************************************************/
function close_dialog(gobj)
{
    let priv = gobj.priv;

    if(!priv.dialog) {
        return;
    }
    let dialog = priv.dialog;
    priv.dialog = null;
    try {
        dialog.close();
    } catch(e) {
        log_warning(`${gobj_short_name(gobj)}: closing a dialog threw: ${e}`);
    }
}

function open_dialog(gobj, $content, title, logical, title_prefix)
{
    let priv = gobj.priv;

    close_dialog(gobj);
    priv.dialog = yui_shell_show_modal(yui_shell_of(gobj), $content, {
        dialog:        true,
        title:         title,
        title_prefix:  title_prefix || "",
        logical_class: logical,
        t:             t,
        on_close:      () => {
            priv.dialog = null;
        }
    });
    refresh_language($content, t);
}

/***************************************************************
 *  A labelled field. The label carries its key and the input
 *  carries its name, so reading the form back is one query and
 *  a language change does not have to know the form exists.
 ***************************************************************/
function field(logical, name, label, $control, help)
{
    return ["div", {class: `${logical} field mb-3`}, [
        ["label", {class: "label is-small", i18n: label}, t(label)],
        ["div", {class: "control"}, [$control]],
        help
            ? ["p", {class: "help", i18n: help}, t(help)]
            : ["span", {}, ""]
    ]];
}

function text_input(name, value, placeholder, disabled)
{
    return ["input", el_attrs({class: "input is-small", type: "text",
                      "data-name": name,
                      value: value === undefined || value === null ? "" : `${value}`,
                      placeholder: placeholder || "",
                      disabled: disabled ? "disabled" : undefined})];
}

function number_input(name, value)
{
    return ["input", {class: "input is-small", type: "number",
                      "data-name": name,
                      value: (value === undefined || value === null || value === "")
                          ? "" : `${value}`}];
}

function select_input(name, value, options)
{
    let $options = options.map((option) => {
        return ["option", el_attrs({value: `${option}`,
                           selected: `${option}` === `${value}` ? "selected" : undefined}),
            `${option}`];
    });

    return ["div", {class: "select is-small is-fullwidth"}, [
        ["select", {"data-name": name}, $options]
    ]];
}

function textarea_input(name, value, rows, placeholder)
{
    return ["textarea", {class: "textarea is-small", "data-name": name,
                         rows: `${rows || 3}`,
                         placeholder: placeholder || ""},
        value === undefined || value === null ? "" : `${value}`];
}

/***************************************************************
 *  Read a form back: every control carries its own name, so
 *  this walks the dialog once and never knows which form it is.
 ***************************************************************/
function read_form($root)
{
    let out = {};

    for(let $control of $root.querySelectorAll("[data-name]")) {
        let name = $control.dataset.name;
        if($control.type === "checkbox") {
            out[name] = $control.checked;
            continue;
        }
        out[name] = $control.value;
    }
    return out;
}

/***************************************************************
 *  The flags of a column, as checkboxes that say what they do.
 *
 *  Grouped the way they act, greyed when they are meaningless on
 *  the chosen type, and never filtered: a flag already set on a
 *  column of another type has to stay visible or the next save
 *  drops it silently. Turning one on may turn another off —
 *  `hook` and `fkey` are the two ends of one link — and
 *  toggle_flag() is what knows that.
 ***************************************************************/
function flags_field(gobj, type, current)
{
    let $groups = [];

    for(let group of grouped_flags(type, current)) {
        let $boxes = group.flags.map((flag) => {
            return ["label", el_attrs({class: "SCHEMA_FLAG checkbox is-size-7 " +
                                     (flag.meaningful ? "" : "SCHEMA_FLAG_DIM has-text-grey-light"),
                              title: flag.desc ? t(flag.desc) : "",
                              "data-i18n-title": flag.desc || undefined}), [
                ["input", el_attrs({type: "checkbox", class: "SCHEMA_FLAG_BOX",
                           "data-flag": flag.name,
                           checked: flag.on ? "checked" : undefined})],
                ["span", {class: "SCHEMA_FLAG_NAME ml-1"}, `${flag.name}`]
            ]];
        });

        $groups.push(["div", {class: "SCHEMA_FLAG_GROUP mb-2"}, [
            ["p", {class: "SCHEMA_FLAG_GROUP_NAME is-size-7 has-text-weight-semibold has-text-grey",
                   i18n: group.group}, t(group.group)],
            ["div", {class: "SCHEMA_FLAG_LIST"}, $boxes]
        ]]);
    }

    return ["div", {class: "SCHEMA_FLAGS"}, $groups];
}

/***************************************************************
 *  The flags a dialog currently holds, in the order they were
 *  drawn.
 ***************************************************************/
function read_flags($root)
{
    let flags = [];

    for(let $box of $root.querySelectorAll(".SCHEMA_FLAG_BOX")) {
        if($box.checked) {
            flags.push($box.dataset.flag);
        }
    }
    return flags;
}

/***************************************************************
 *  The column form, for a new column and for an existing one.
 *
 *  A NAME IS NOT EDITABLE HERE, and the form says why: the store
 *  keys a column by its qualified id — treedb, topic and name —
 *  so renaming one is creating another and deleting this one.
 *  Offering a field that silently does something else is worse
 *  than not offering it.
 ***************************************************************/
function open_column_form(gobj, topic, col, prefill)
{
    let priv = gobj.priv;
    /*  A DUPLICATE is a creation whose fields start filled: the name must
     *  be typed (the store keys a column by its whole path) and everything
     *  else is the column it was copied from.  */
    let record = prefill || (col && col.record) || {};
    let creating = !col;
    let type = record.type || "string";
    let hook = col_hook(record);
    if(is_empty_value(hook)) {
        hook = {};
    }
    let hook_topic = Object.keys(hook)[0] || "";
    let hook_col = hook_topic ? hook[hook_topic] : "";
    let treedb = current_treedb(gobj);
    let sibling_topics = treedb ? treedb.topics.map(x => x.name) : [];

    let $form = createElement2(
        ["div", {class: "SCHEMA_COL_FORM box"}, [
            field("SCHEMA_COL_FORM_NAME", "value", "column",
                text_input("value", creating ? (prefill ? prefill.__name__ || "" : "") : col.name,
                    t("column name"), !creating),
                creating ? "" : "a column is keyed by its whole path: renaming it is creating another one"),
            field("SCHEMA_COL_FORM_HEADER", "header", "header",
                text_input("header", record.header, "")),
            field("SCHEMA_COL_FORM_TYPE", "type", "type",
                select_input("type", type, COL_TYPES)),
            field("SCHEMA_COL_FORM_FILLSPACE", "fillspace", "fillspace",
                number_input("fillspace", record.fillspace)),
            ["div", {class: "SCHEMA_COL_FORM_FLAGS field mb-3"}, [
                ["label", {class: "label is-small", i18n: "flags"}, t("flags")],
                flags_field(gobj, type, col_flags(record))
            ]],
            ["div", {class: "SCHEMA_COL_FORM_HOOK field mb-3"}, [
                ["label", {class: "label is-small", i18n: "hook"}, t("hook")],
                ["div", {class: "is-flex", style: "gap:.4rem;"}, [
                    select_input("hook_topic", hook_topic, [""].concat(sibling_topics)),
                    text_input("hook_col", hook_col, t("the fkey column of the child"))
                ]],
                ["p", {class: "help", i18n: "a hook names the child topic and the column of the child that points back"},
                    t("a hook names the child topic and the column of the child that points back")]
            ]],
            field("SCHEMA_COL_FORM_ENUM", "enum", "enum",
                textarea_input("enum", col_enum(record).join("\n"), 3, t("one value per line")),
                "only read when the column is flagged enum"),
            field("SCHEMA_COL_FORM_DEFAULT", "default", "default",
                text_input("default", stringify_field(record.default), "")),
            field("SCHEMA_COL_FORM_PLACEHOLDER", "placeholder", "placeholder",
                text_input("placeholder", record.placeholder, "")),
            field("SCHEMA_COL_FORM_DESCRIPTION", "description", "description",
                text_input("description", record.description, "")),
            ["div", {class: "SCHEMA_COL_FORM_ACTIONS is-flex mt-4",
                     style: "gap:.5rem; justify-content:flex-end;"}, [
                ["button", {class: "SCHEMA_COL_FORM_CANCEL button is-small", type: "button"},
                    [["span", {i18n: "cancel"}, t("cancel")]]],
                ["button", {class: "SCHEMA_COL_FORM_SAVE button is-small is-primary", type: "button"},
                    [["span", {class: "icon"}, [["i", {class: "yi-floppy-disk"}]]],
                     ["span", {i18n: "save"}, t("save")]]]
            ]]
        ]]
    );

    /*  The type decides which flags are meaningful, so changing it
     *  redraws them — keeping whatever is checked, including a flag the
     *  new type does not use.  */
    let $type = $form.querySelector('[data-name="type"]');
    $type.addEventListener("change", () => {
        let $holder = $form.querySelector(".SCHEMA_FLAGS");
        let current = read_flags($form);
        let $new = createElement2(flags_field(gobj, $type.value, current));
        $holder.parentNode.replaceChild($new, $holder);
        refresh_language($new, t);
    });

    /*  A flag that excludes another is answered here and not on save,
     *  so the form never shows a state the store would refuse.  */
    $form.addEventListener("change", (evt) => {
        let $box = evt.target.closest(".SCHEMA_FLAG_BOX");
        if(!$box) {
            return;
        }
        let wanted = toggle_flag(read_flags($form), $box.dataset.flag, $box.checked);
        for(let $other of $form.querySelectorAll(".SCHEMA_FLAG_BOX")) {
            $other.checked = wanted.indexOf($other.dataset.flag) >= 0;
        }
    });

    $form.querySelector(".SCHEMA_COL_FORM_CANCEL").addEventListener("click", (evt) => {
        evt.stopPropagation();
        close_dialog(gobj);
    });
    $form.querySelector(".SCHEMA_COL_FORM_SAVE").addEventListener("click", (evt) => {
        evt.stopPropagation();
        let values = read_form($form);
        values.flag = read_flags($form);
        gobj_send_event(gobj, "EV_SAVE_COLUMN", {
            topic:    topic.name,
            col:      creating ? "" : col.name,
            creating: creating,
            values:   values
        }, gobj);
    });

    open_dialog(gobj, $form, creating ? "new column" : "edit column",
        "SCHEMA_COL_FORM_DIALOG", creating ? topic.name : `${topic.name}.${col.name}`);
}

/***************************************************************
 *  A field whose stored form may be the JSON text of a value,
 *  shown as text either way.
 ***************************************************************/
function stringify_field(value)
{
    if(value === undefined || value === null) {
        return "";
    }
    if(typeof value === "object") {
        return JSON.stringify(value);
    }
    return `${value}`;
}

/***************************************************************
 *  The topic form. `pkey` is a SELECT of the columns the topic
 *  actually has: a pkey naming no column is a topic that does
 *  not open, and it is the first thing the validator looks for.
 ***************************************************************/
function open_topic_form(gobj, treedb, topic)
{
    let record = (topic && topic.record) || {};
    let creating = !topic;
    let col_names = topic ? topic.cols.map(c => c.name) : [];

    let $form = createElement2(
        ["div", {class: "SCHEMA_TOPIC_FORM box"}, [
            field("SCHEMA_TOPIC_FORM_NAME", "value", "topic",
                text_input("value", creating ? "" : topic.name, t("topic name"), !creating),
                creating ? "" : "a topic is keyed by its whole path: renaming it is creating another one"),
            field("SCHEMA_TOPIC_FORM_PKEY", "pkey", "pkey",
                creating
                    ? text_input("pkey", "id", "id")
                    : select_input("pkey", record.pkey || "id",
                        col_names.length > 0 ? col_names : [record.pkey || "id"])),
            field("SCHEMA_TOPIC_FORM_PKEY2S", "pkey2s", "secondary keys",
                text_input("pkey2s", stringify_field(record.pkey2s), ""),
                "the column a record is known by when its key is composed"),
            field("SCHEMA_TOPIC_FORM_SYSTEM_FLAG", "system_flag", "system flag",
                text_input("system_flag", record.system_flag || "sf_string_key", "")),
            field("SCHEMA_TOPIC_FORM_TKEY", "tkey", "time key",
                text_input("tkey", record.tkey, "")),
            field("SCHEMA_TOPIC_FORM_VERSION", "topic_version", "version",
                number_input("topic_version",
                    record.topic_version === undefined ? 1 : record.topic_version),
                "raising it is what publishes a change of the columns"),
            ["div", {class: "SCHEMA_TOPIC_FORM_SYSTEM field mb-3"}, [
                ["label", {class: "checkbox is-size-7"}, [
                    ["input", el_attrs({type: "checkbox", "data-name": "system_topic",
                               checked: record.system_topic ? "checked" : undefined})],
                    ["span", {class: "ml-1", i18n: "system topic"}, t("system topic")]
                ]]
            ]],
            ["div", {class: "SCHEMA_TOPIC_FORM_ACTIONS is-flex mt-4",
                     style: "gap:.5rem; justify-content:flex-end;"}, [
                ["button", {class: "SCHEMA_TOPIC_FORM_CANCEL button is-small", type: "button"},
                    [["span", {i18n: "cancel"}, t("cancel")]]],
                ["button", {class: "SCHEMA_TOPIC_FORM_SAVE button is-small is-primary",
                            type: "button"},
                    [["span", {class: "icon"}, [["i", {class: "yi-floppy-disk"}]]],
                     ["span", {i18n: "save"}, t("save")]]]
            ]]
        ]]
    );

    $form.querySelector(".SCHEMA_TOPIC_FORM_CANCEL").addEventListener("click", (evt) => {
        evt.stopPropagation();
        close_dialog(gobj);
    });
    $form.querySelector(".SCHEMA_TOPIC_FORM_SAVE").addEventListener("click", (evt) => {
        evt.stopPropagation();
        gobj_send_event(gobj, "EV_SAVE_TOPIC", {
            topic:    creating ? "" : topic.name,
            creating: creating,
            values:   read_form($form)
        }, gobj);
    });

    open_dialog(gobj, $form, creating ? "new topic" : "edit topic",
        "SCHEMA_TOPIC_FORM_DIALOG", creating ? treedb.id : `${treedb.id}.${topic.name}`);
}

/***************************************************************
 *  What the treedb would refuse, as a table.
 *
 *  Every `code` is an i18n key and carries it, so the report
 *  follows a language change; the detail beside it is DATA (a
 *  column name, a type) and never goes through t().
 ***************************************************************/
function open_report(gobj, findings, treedb_id)
{
    let $rows = findings.map((finding) => {
        return ["tr", {class: `SCHEMA_REPORT_ROW SCHEMA_REPORT_${finding.severity.toUpperCase()}`}, [
            ["td", {class: "SCHEMA_REPORT_SEVERITY"}, [
                ["span", {class: `tag ${finding.severity === "error" ? "is-danger" : "is-warning"}` +
                                 " is-light", i18n: finding.severity}, t(finding.severity)]
            ]],
            ["td", {class: "SCHEMA_REPORT_WHAT", i18n: finding.code}, t(finding.code)],
            ["td", {class: "SCHEMA_REPORT_TOPIC"}, `${finding.topic || ""}`],
            ["td", {class: "SCHEMA_REPORT_COL"}, `${finding.col || ""}`],
            ["td", {class: "SCHEMA_REPORT_DETAIL"}, [["code", {}, `${finding.detail || ""}`]]]
        ]];
    });

    let $content = createElement2(
        ["div", {class: "SCHEMA_REPORT box"}, [
            findings.length === 0
                ? ["p", {class: "SCHEMA_REPORT_CLEAN", i18n: "nothing to report"},
                    t("nothing to report")]
                : ["div", {class: "SCHEMA_REPORT_TABLE_WRAP", style: "overflow-x:auto;"}, [
                    ["table", {class: "SCHEMA_REPORT_TABLE table is-narrow is-fullwidth is-size-7"}, [
                        ["thead", {}, [
                            ["tr", {}, [
                                ["th", {i18n: "severity"}, t("severity")],
                                ["th", {i18n: "finding"}, t("finding")],
                                ["th", {i18n: "topic"}, t("topic")],
                                ["th", {i18n: "column"}, t("column")],
                                ["th", {i18n: "detail"}, t("detail")]
                            ]]
                        ]],
                        ["tbody", {}, $rows]
                    ]]
                ]]
        ]]
    );

    open_dialog(gobj, $content, "check", "SCHEMA_REPORT_DIALOG", treedb_id);
}

/***************************************************************
 *  The schema as its C literal, and as JSON.
 *
 *  This is the half `diff-schema` cannot give: it says the two
 *  halves drifted, and this is the edit in the form the SOURCE
 *  can hold. The text is selectable and copyable — never offered
 *  as a download, which a published page cannot start anyway.
 ***************************************************************/
function open_export(gobj, treedb)
{
    let c_text = schema_to_c(treedb);
    let json_text = JSON.stringify(schema_to_json(treedb), null, 4);

    let $content = createElement2(
        ["div", {class: "SCHEMA_EXPORT box"}, [
            ["div", {class: "SCHEMA_EXPORT_TABS tabs is-small is-toggle mb-2"}, [
                ["ul", {}, [
                    ["li", {class: "SCHEMA_EXPORT_TAB is-active", "data-pane": "c"},
                        [["a", {}, [["span", {}, "C"]]]]],
                    ["li", {class: "SCHEMA_EXPORT_TAB", "data-pane": "json"},
                        [["a", {}, [["span", {}, "JSON"]]]]]
                ]]
            ]],
            ["p", {class: "SCHEMA_EXPORT_HELP help mb-2",
                   i18n: "an edit made here works and lives in no source: this is what to paste back"},
                t("an edit made here works and lives in no source: this is what to paste back")],
            ["textarea", {class: "SCHEMA_EXPORT_TEXT textarea is-small is-family-monospace",
                          rows: "18", readonly: "readonly", spellcheck: "false"}, c_text],
            ["div", {class: "SCHEMA_EXPORT_ACTIONS is-flex mt-3",
                     style: "gap:.5rem; justify-content:flex-end;"}, [
                ["button", {class: "SCHEMA_EXPORT_COPY button is-small", type: "button"}, [
                    ["span", {class: "icon"}, [["i", {class: "yi-copy"}]]],
                    ["span", {i18n: "copy"}, t("copy")]
                ]]
            ]]
        ]]
    );

    let $text = $content.querySelector(".SCHEMA_EXPORT_TEXT");
    for(let $tab of $content.querySelectorAll(".SCHEMA_EXPORT_TAB")) {
        $tab.addEventListener("click", (evt) => {
            evt.stopPropagation();
            for(let $other of $content.querySelectorAll(".SCHEMA_EXPORT_TAB")) {
                $other.classList.toggle("is-active", $other === $tab);
            }
            $text.value = ($tab.dataset.pane === "c") ? c_text : json_text;
        });
    }
    $content.querySelector(".SCHEMA_EXPORT_COPY").addEventListener("click", (evt) => {
        evt.stopPropagation();
        copy_text(gobj, $text);
    });

    open_dialog(gobj, $content, "export", "SCHEMA_EXPORT_DIALOG", treedb.id);
}

/***************************************************************
 *  Copy through the clipboard when the page is allowed one, and
 *  through a selection when it is not: an artifact or an http
 *  origin has no navigator.clipboard, and a copy button that
 *  does nothing is worse than one that selects the text.
 ***************************************************************/
function copy_text(gobj, $text)
{
    let ok = () => {
        yui_shell_show_info(yui_shell_of(gobj), "copied", {t: t});
    };

    $text.select();
    if(navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText($text.value).then(ok, (e) => {
            log_warning(`${gobj_short_name(gobj)}: clipboard refused: ${e}`);
        });
        return;
    }
    log_warning(`${gobj_short_name(gobj)}: no clipboard here, the text is selected instead`);
}

/***************************************************************
 *  Import: paste a schema, see the plan, then run it.
 *
 *  Two steps and not one, because this is the only operation in
 *  the editor that can DELETE a column. What is shown is the
 *  plan itself, so what is confirmed is what runs.
 ***************************************************************/
function open_import(gobj, treedb)
{
    let $content = createElement2(
        ["div", {class: "SCHEMA_IMPORT box"}, [
            ["p", {class: "SCHEMA_IMPORT_HELP help mb-2",
                   i18n: "paste a schema as json: the plan is shown before anything is written"},
                t("paste a schema as json: the plan is shown before anything is written")],
            ["textarea", {class: "SCHEMA_IMPORT_TEXT textarea is-small is-family-monospace",
                          rows: "12", spellcheck: "false",
                          placeholder: '{"id": "...", "schema_version": "1", "topics": []}'}, ""],
            ["label", {class: "SCHEMA_IMPORT_PRUNE checkbox is-size-7 mt-2"}, [
                ["input", {type: "checkbox", class: "SCHEMA_IMPORT_PRUNE_BOX", checked: "checked"}],
                ["span", {class: "ml-1", i18n: "delete what the pasted schema does not declare"},
                    t("delete what the pasted schema does not declare")]
            ]],
            ["div", {class: "SCHEMA_IMPORT_PLAN mt-3"}, []],
            ["div", {class: "SCHEMA_IMPORT_ACTIONS is-flex mt-3",
                     style: "gap:.5rem; justify-content:flex-end;"}, [
                ["button", {class: "SCHEMA_IMPORT_CANCEL button is-small", type: "button"},
                    [["span", {i18n: "cancel"}, t("cancel")]]],
                ["button", {class: "SCHEMA_IMPORT_PREVIEW button is-small", type: "button"},
                    [["span", {class: "icon"}, [["i", {class: "yi-eye"}]]],
                     ["span", {i18n: "preview"}, t("preview")]]],
                ["button", {class: "SCHEMA_IMPORT_RUN button is-small is-warning",
                            type: "button", disabled: "disabled"},
                    [["span", {class: "icon"}, [["i", {class: "yi-upload"}]]],
                     ["span", {i18n: "import"}, t("import")]]]
            ]]
        ]]
    );

    let $text = $content.querySelector(".SCHEMA_IMPORT_TEXT");
    let $prune = $content.querySelector(".SCHEMA_IMPORT_PRUNE_BOX");
    let $plan_pane = $content.querySelector(".SCHEMA_IMPORT_PLAN");
    let $run = $content.querySelector(".SCHEMA_IMPORT_RUN");

    $content.querySelector(".SCHEMA_IMPORT_CANCEL").addEventListener("click", (evt) => {
        evt.stopPropagation();
        close_dialog(gobj);
    });
    $content.querySelector(".SCHEMA_IMPORT_PREVIEW").addEventListener("click", (evt) => {
        evt.stopPropagation();
        gobj_send_event(gobj, "EV_PREVIEW_IMPORT", {
            text:  $text.value,
            prune: $prune.checked
        }, gobj);
    });
    $run.addEventListener("click", (evt) => {
        evt.stopPropagation();
        gobj_send_event(gobj, "EV_APPLY_IMPORT", {}, gobj);
    });

    gobj.priv.import_pane = $plan_pane;
    gobj.priv.import_run = $run;
    open_dialog(gobj, $content, "import", "SCHEMA_IMPORT_DIALOG", treedb.id);
}

/***************************************************************
 *  The plan, drawn where the paste is: one line per write, the
 *  deletions apart and counted, because they are what the
 *  operator is being asked about.
 ***************************************************************/
function render_import_plan(gobj, plan)
{
    let priv = gobj.priv;
    let $pane = priv.import_pane;

    if(!$pane) {
        return;
    }
    clear($pane);

    if(plan.conflicts.length > 0) {
        $pane.appendChild(createElement2(
            ["div", {class: "SCHEMA_IMPORT_CONFLICTS notification is-danger is-light p-3"},
                plan.conflicts.map((conflict) => {
                    return ["p", {class: "SCHEMA_IMPORT_CONFLICT is-size-7", i18n: conflict.code},
                        t(conflict.code)];
                })]
        ));
        if(priv.import_run) {
            priv.import_run.disabled = true;
        }
        refresh_language($pane, t);
        return;
    }

    let deletes = plan_deletes(plan);
    let $lines = plan.writes.map((write) => {
        let what = write.what.col
            ? `${write.what.topic}.${write.what.col}`
            : (write.what.topic || write.topic_name);
        return ["li", {class: `SCHEMA_IMPORT_LINE SCHEMA_IMPORT_${write.op.toUpperCase()}`}, [
            ["span", {class: `tag is-light ${write.op === "delete" ? "is-danger" : "is-info"}`,
                      i18n: write.op}, t(write.op)],
            ["code", {class: "ml-2"}, `${what}`]
        ]];
    });

    $pane.appendChild(createElement2(
        ["div", {class: "SCHEMA_IMPORT_SUMMARY"}, [
            ["p", {class: "SCHEMA_IMPORT_COUNT is-size-7 has-text-grey mb-2"}, [
                ["span", {i18n: "writes"}, t("writes")],
                ["span", {class: "ml-1"}, `${plan.writes.length}`],
                ["span", {class: "ml-3", i18n: "deletions"}, t("deletions")],
                ["span", {class: "ml-1 has-text-weight-bold"}, `${deletes.length}`]
            ]],
            ["ul", {class: "SCHEMA_IMPORT_LINES is-size-7",
                    style: "max-height:14rem; overflow:auto;"}, $lines]
        ]]
    ));
    if(priv.import_run) {
        priv.import_run.disabled = (plan.writes.length === 0);
    }
    refresh_language($pane, t);
}

/***************************************************************
 *  What belongs to nothing: a topic whose treedb is gone, a
 *  column whose topic is gone. Leftovers of a deletion, and the
 *  only screen they can be seen on.
 ***************************************************************/
function open_orphans(gobj)
{
    let priv = gobj.priv;
    let readonly = is_readonly(gobj);

    let row = (kind, entry) => {
        return ["tr", {class: "SCHEMA_ORPHAN_ROW"}, [
            ["td", {class: "SCHEMA_ORPHAN_KIND", i18n: kind}, t(kind)],
            ["td", {class: "SCHEMA_ORPHAN_ID"}, [["code", {}, `${entry.id}`]]],
            ["td", {class: "SCHEMA_ORPHAN_ACTIONS has-text-right"},
                readonly ? [] : [row_icon(gobj, "SCHEMA_ORPHAN_DELETE", "yi-trash", "delete",
                    "EV_DELETE_ORPHAN", {kind: kind, id: entry.id})]]
        ]];
    };

    let $rows = priv.model.orphan_topics.map(x => row("topic", x))
        .concat(priv.model.orphan_cols.map(x => row("column", x)));

    let $content = createElement2(
        ["div", {class: "SCHEMA_ORPHANS box"}, [
            ["p", {class: "SCHEMA_ORPHANS_HELP help mb-2",
                   i18n: "these belong to no treedb or to no topic: leftovers of a deletion"},
                t("these belong to no treedb or to no topic: leftovers of a deletion")],
            ["table", {class: "SCHEMA_ORPHANS_TABLE table is-narrow is-fullwidth is-size-7"}, [
                ["tbody", {}, $rows]
            ]]
        ]]
    );

    open_dialog(gobj, $content, "orphans", "SCHEMA_ORPHANS_DIALOG");
}




                    /***************************
                     *      Writing
                     ***************************/




/***************************************************************
 *  THE TWO VERSIONS A SCHEMA EDIT HAS TO RAISE, and why both.
 *
 *  `topic_version` is what publishes a change of a topic's
 *  columns: leave it and the persisted `topic_cols.json` masks
 *  the edit, the restart succeeds and nothing moved.
 *
 *  `schema_version` is what publishes the schema as a whole —
 *  "the stored one wins on ties, and the incoming one has to be
 *  strictly newer to take over" (c_treedb.c). It is safe to
 *  raise: re-projection from C compares `c_schema_version`, the
 *  version of the LITERAL, precisely so that an edit made here
 *  survives every start until a newer literal arrives.
 *
 *  So every write that changes a schema carries both, and the
 *  operator is never asked to remember either.
 ***************************************************************/
function version_writes(gobj, topic)
{
    let treedb = current_treedb(gobj);
    let writes = [];

    if(topic) {
        let version = Number(topic.topic_version);
        if(!isFinite(version)) {
            version = 0;
        }
        writes.push({
            op: "update", topic_name: T_TOPICS,
            record: {id: topic.id, topic_version: version + 1}
        });
    }
    if(treedb) {
        let version = Number(treedb.schema_version);
        if(!isFinite(version)) {
            version = 0;
        }
        writes.push({
            op: "update", topic_name: T_TREEDBS,
            record: {id: treedb.id, schema_version: version + 1}
        });
    }
    return writes;
}

/***************************************************************
 *  Run a list of writes, one at a time, and say so while it
 *  runs. One at a time because each answer patches the model the
 *  next one is computed against, and because a treedb that
 *  refuses the third of five must not be left having done two
 *  and been asked for two more.
 ***************************************************************/
function queue_writes(gobj, writes)
{
    let priv = gobj.priv;

    if(!Array.isArray(writes) || writes.length === 0) {
        return 0;
    }
    if(gobj_current_state(gobj) === "ST_SAVING") {
        log_warning(`${gobj_short_name(gobj)}: a write is already in flight`);
        return -1;
    }
    priv.save_queue = writes.slice();
    priv.save_return = gobj_current_state(gobj);
    priv.save_wrote = false;
    gobj_change_state(gobj, "ST_SAVING");
    show_notice(gobj, "saving");
    /*  The screen stays up and stops answering. Not to be tidy: every
     *  action of a screen is computed against the model, and the answer
     *  still in the air is about to change it — so a click during a save
     *  would be an action decided on a schema that no longer exists.  */
    set_busy(gobj, true);
    render_toolbar(gobj);
    return run_next_write(gobj);
}

function run_next_write(gobj)
{
    let priv = gobj.priv;

    if(priv.save_queue.length === 0) {
        return end_writes(gobj, "");
    }
    let write = priv.save_queue[0];

    /*  Which command and which options: three words that decide whether
     *  a write does what it says, and each one wrong in a way that
     *  succeeds. They live in schema_write_options.js, with the reasons
     *  and the tests.  */
    let command = write_command(write.op);
    let options = write_options(write.op);

    if(remote_command(gobj, command, {
        topic_name: write.topic_name,
        record:     write.record,
        options:    options,
        record_id:  write.record.id || ""
    }) < 0) {
        return end_writes(gobj, t("cannot reach the treedb"));
    }
    return 0;
}

/***************************************************************
 *  The queue is done, or gave up. Either way the model is what
 *  the answers made it, so the screen is redrawn from it and the
 *  host is told once — the tab above owns the pending flag and
 *  the Apply button, and a write per event would blink it.
 ***************************************************************/
function end_writes(gobj, error)
{
    let priv = gobj.priv;

    priv.save_queue = [];
    gobj_change_state(gobj, priv.save_return || "ST_TREEDBS");
    priv.save_return = "";
    show_notice(gobj, "");
    set_busy(gobj, false);

    /*  A position that arrived while the write was in flight: applied
     *  now, so a Back pressed mid-save is not simply lost.  */
    if(priv.pending_seg !== null) {
        let seg = priv.pending_seg;
        priv.pending_seg = null;
        if(!error) {
            apply_seg(gobj, seg);
            if(priv.save_wrote) {
                gobj_publish_event(gobj, "EV_RECORD_WRITTEN", {
                    treedb_name: gobj_read_str_attr(gobj, "treedb_name")
                });
            }
            priv.save_wrote = false;
            return 0;
        }
    }

    if(error) {
        yui_shell_show_error(yui_shell_of(gobj), error, {t: t});
    }
    if(priv.save_wrote) {
        gobj_publish_event(gobj, "EV_RECORD_WRITTEN", {
            treedb_name: gobj_read_str_attr(gobj, "treedb_name")
        });
    }
    priv.save_wrote = false;
    render(gobj);
    publish_check(gobj);
    return error ? -1 : 0;
}

/***************************************************************
 *  The record a column form produces.
 *
 *  Everything the store needs and the operator did not type is
 *  composed here: the fkey to the parent topic, the place among
 *  its siblings, and the fields that are only meaningful when a
 *  flag says so.
 ***************************************************************/
function column_record(gobj, topic, col, values)
{
    let creating = !col;
    let flags = Array.isArray(values.flag) ? values.flag : [];
    let record = {};

    if(creating) {
        record.value = String(values.value || "").trim();
        record.topics = [fkey_ref(T_TOPICS, topic.id, HOOK_COLS)];
        record.order = next_order(topic.cols);
    } else {
        record.id = col.id;
    }

    record.header = values.header || "";
    record.type = values.type || "string";
    record.flag = flags;
    /*  An empty number field is ABSENT, not zero: sending "" stored a
     *  fillspace of 0 and the column's schema default (10) never
     *  applied.  */
    if(String(values.fillspace).trim() !== "") {
        record.fillspace = Number(values.fillspace);
    } else if(!creating) {
        record.fillspace = "";      /*  cleared on purpose  */
    }
    record.placeholder = values.placeholder || "";
    record.description = values.description || "";
    record.default = values.default || "";

    /*  A hook is a mapping and the form asks for its two halves; an
     *  incomplete pair is no mapping, not half of one.  */
    if(values.hook_topic && values.hook_col) {
        record.hook = {[values.hook_topic]: values.hook_col};
    } else {
        record.hook = "";
    }

    let enum_lines = String(values.enum || "")
        .split("\n").map(x => x.trim()).filter(x => x.length > 0);
    record.enum = enum_lines.length > 0 ? enum_lines : "";

    return record;
}

/***************************************************************
 *  The record a topic form produces.
 ***************************************************************/
function topic_record(gobj, treedb, topic, values)
{
    let creating = !topic;
    let record = {};

    if(creating) {
        record.value = String(values.value || "").trim();
        record.treedbs = [fkey_ref(T_TREEDBS, treedb.id, HOOK_TOPICS)];
        record.order = next_order(treedb.topics);
    } else {
        record.id = topic.id;
    }

    record.pkey = values.pkey || "id";
    record.pkey2s = values.pkey2s || "";
    record.system_flag = values.system_flag || "sf_string_key";
    record.tkey = values.tkey || "";
    record.topic_version = values.topic_version === "" ? 1 : Number(values.topic_version);
    record.system_topic = !!values.system_topic;

    return record;
}




                    /***************************
                     *      Positions
                     ***************************/




/***************************************************************
 *  Put the position in the model's terms and in the url's.
 *
 *  The state IS the screen, so moving is a state change and
 *  nothing else decides what is drawn. The url is mirrored
 *  outwards — this view navigates nothing itself, the host owns
 *  the route it hangs from (ROUTING.md).
 ***************************************************************/
function go(gobj, treedb_id, topic_name, diagram, mirror)
{
    let priv = gobj.priv;

    priv.treedb_id = treedb_id || "";
    priv.topic_name = topic_name || "";
    priv.diagram = !!diagram;

    let state = "ST_TREEDBS";
    if(!priv.model) {
        state = "ST_LOADING";
    } else if(priv.model.treedbs.length === 0) {
        state = "ST_EMPTY";
    } else if(priv.treedb_id && priv.diagram) {
        state = "ST_DIAGRAM";
    } else if(priv.treedb_id && priv.topic_name) {
        state = "ST_COLUMNS";
    } else if(priv.treedb_id) {
        state = "ST_TOPICS";
    }

    gobj_change_state(gobj, state);
    render(gobj);
    publish_check(gobj);

    if(mirror !== false) {
        gobj_publish_event(gobj, "EV_POSITION_CHANGED", {subpath: position_seg(gobj)});
    }
    return 0;
}

/***************************************************************
 *  The tail of the url this view owns.
 ***************************************************************/
function position_seg(gobj)
{
    let priv = gobj.priv;

    if(!priv.treedb_id) {
        return "";
    }
    if(priv.diagram) {
        return `${priv.treedb_id}/${DIAGRAM_SEG}`;
    }
    if(priv.topic_name) {
        return `${priv.treedb_id}/${priv.topic_name}`;
    }
    return priv.treedb_id;
}

/***************************************************************
 *  ...and the same in reverse. A tail naming a treedb or a topic
 *  the store does not have lands one level up rather than on an
 *  empty screen: a shared link outlives the schema it points at.
 ***************************************************************/
function apply_seg(gobj, seg)
{
    let parts = String(seg || "").split("/").filter(x => x.length > 0);
    let treedb_id = parts[0] || "";
    let tail = parts[1] || "";

    if(!treedb_id) {
        return go(gobj, "", "", false, false);
    }
    if(tail === DIAGRAM_SEG) {
        return go(gobj, treedb_id, "", true, false);
    }
    return go(gobj, treedb_id, tail, false, false);
}




                    /***************************
                     *      Actions
                     ***************************/




/***************************************************************
 *  An answer from the treedb.
 *
 *  Which request it answers is read from the command stack, not
 *  guessed: three of them are `nodes` and only the echoed
 *  `topic_name` tells them apart.
 ***************************************************************/
function ac_mt_command_answer(gobj, event, kw, src)
{
    let priv = gobj.priv;
    let result = kw.result;
    let comment = kw.comment;
    let data = kw.data;

    let __command__ = msg_iev_get_stack(gobj, kw, "command_stack", true);
    let command = kw_get_str(gobj, __command__, "command", "", 0);
    let kw_command = kw_get_dict(gobj, __command__, "kw", {}, 0);

    /*  The frame carries either the whole request (a direct transport)
     *  or the `__md_command__` this view sent (a routing adapter). Both
     *  answer the same questions under the same names, so unwrap one
     *  level when it is there and read from whichever it is.  */
    /*  Not kw_get_dict with a null default: it answers Object(null), which
     *  is `{}` and truthy, so the fallback would never run.  */
    let md = is_object(kw_command.__md_command__) ? kw_command.__md_command__ : kw_command;

    if(kw_get_str(gobj, md, "purpose", "", 0) !== PURPOSE) {
        return 0;       /*  another panel's answer on a shared transport  */
    }

    if(command === "nodes") {
        let topic_name = kw_get_str(gobj, md, "topic_name", "", 0);
        priv.pending--;
        if(result < 0) {
            priv.load_error = comment || t("cannot load the schemas");
        } else if(priv.records && Array.isArray(priv.records[topic_name])) {
            priv.records[topic_name] = Array.isArray(data) ? data : [];
        }
        if(priv.pending > 0) {
            return 0;
        }
        if(priv.load_error) {
            priv.model = null;
            gobj_change_state(gobj, "ST_IDLE");
            render(gobj);
            return 0;
        }
        build_model(gobj);
        /*  Back to where the operator was: the load may be a refresh, or
         *  the answer to a deep link that arrived before the model.  */
        return go(gobj, priv.treedb_id, priv.topic_name, priv.diagram, false);
    }

    if(command === "update-node" || command === "delete-node") {
        let topic_name = kw_get_str(gobj, md, "topic_name", "", 0);
        if(result < 0) {
            return end_writes(gobj, comment || t("the treedb refused the write"));
        }
        priv.save_wrote = true;
        if(command === "delete-node") {
            forget_record(gobj, topic_name, kw_get_str(gobj, md, "record_id", "", 0));
        } else {
            let record = is_object(data) ? data
                : (Array.isArray(data) && is_object(data[0]) ? data[0] : null);
            if(record) {
                patch_record(gobj, topic_name, record);
            } else {
                /*  The treedb wrote it and did not describe it back: ask
                 *  again rather than draw a model that has drifted.  */
                log_warning(`${gobj_short_name(gobj)}: '${command}' answered no record`);
                priv.save_queue = [];
                request_model(gobj);
                return 0;
            }
        }
        if(topic_name === T_TOPICS || topic_name === T_COLS) {
            /*  Which record it was is in the QUEUE, not in the answer: an
             *  adapter echoes only what it was asked to echo, and the
             *  record is not small enough to be worth echoing.  */
            let write = priv.save_queue[0];
            mark_written(gobj, topic_name, write ? write.record : null);
        }
        priv.save_queue.shift();
        return run_next_write(gobj);
    }

    log_error(`${gobj_short_name(gobj)}: unknown command answered: ${command}`);
    return 0;
}

/***************************************************************
 *  Remember which topic this write belongs to, which is what
 *  "its version still has to move" is asked about.
 ***************************************************************/
function mark_written(gobj, topic_name, record)
{
    let priv = gobj.priv;
    let topic = current_topic(gobj);

    if(topic_name === T_TOPICS && record && record.id) {
        priv.written[record.id] = true;
        return;
    }
    if(topic) {
        priv.written[topic.id] = true;
    }
}

/***************************************************************
 *  The host says where we are (ROUTING.md §5): everything under
 *  this view's route is ours.
 ***************************************************************/
function ac_show(gobj, event, kw, src)
{
    let priv = gobj.priv;
    let seg = (kw && kw.subpath) || "";

    if(gobj_current_state(gobj) === "ST_SAVING") {
        priv.pending_seg = seg;
        return 0;       /*  applied when the write lands (end_writes)  */
    }
    return apply_seg(gobj, seg);
}

/***************************************************************
 *  Hidden by the host: drop the overlays. A dialog outlives the
 *  screen it was opened from otherwise, and answers into it land
 *  nowhere.
 ***************************************************************/
function ac_hide(gobj, event, kw, src)
{
    close_dialog(gobj);
    return 0;
}

/***************************************************************
 *  The session came up or went down. The model stays either way
 *  — a schema does not change under you — but a first load may
 *  have had no transport to run on.
 ***************************************************************/
function ac_transport_state(gobj, event, kw, src)
{
    let priv = gobj.priv;

    priv.connected = !!(kw && kw.connected);
    if(priv.connected && !priv.model && gobj_current_state(gobj) !== "ST_LOADING") {
        return request_model(gobj);
    }
    render_toolbar(gobj);
    return 0;
}

/***************************************************************
 *  The shell switched language. What this view draws is drawn by
 *  itself, so it redraws: an i18n attribute reaches the chrome,
 *  never a row this gclass built.
 ***************************************************************/
function ac_language_changed(gobj, event, kw, src)
{
    render(gobj);
    return 0;
}

function ac_refresh(gobj, event, kw, src)
{
    return request_model(gobj);
}

/***************************************************************
 *  Moving about.
 ***************************************************************/
function ac_select_treedb(gobj, event, kw, src)
{
    return go(gobj, kw.treedb, "", false, true);
}

function ac_select_topic(gobj, event, kw, src)
{
    return go(gobj, gobj.priv.treedb_id, kw.topic, false, true);
}

function ac_back(gobj, event, kw, src)
{
    let priv = gobj.priv;

    if(priv.diagram) {
        return go(gobj, priv.treedb_id, "", false, true);
    }
    if(priv.topic_name) {
        return go(gobj, priv.treedb_id, "", false, true);
    }
    return go(gobj, "", "", false, true);
}

function ac_toggle_diagram(gobj, event, kw, src)
{
    let priv = gobj.priv;

    return go(gobj, priv.treedb_id, priv.topic_name, !priv.diagram, true);
}

/***************************************************************
 *  A topic clicked in the drawing. The diagram is a CHILD here
 *  and publishes to us, so the event is declared in this FSM —
 *  and it means the same thing a click on a row means.
 ***************************************************************/
function ac_node_click(gobj, event, kw, src)
{
    let topic = kw && kw.topic;

    if(!topic) {
        return 0;
    }
    return go(gobj, gobj.priv.treedb_id, topic, false, true);
}

function ac_show_orphans(gobj, event, kw, src)
{
    open_orphans(gobj);
    return 0;
}

/***************************************************************
 *  Ask, and turn the answer into an event.
 *
 *  `kw` carries an IDENTITY and never an object: the machine
 *  trace dumps it, and a gobj or a DOM node in there is a
 *  circular structure that breaks the very trace the FSM exists
 *  to feed.
 ***************************************************************/
function confirm_then(gobj, message, detail, kw)
{
    yui_shell_confirm_danger(yui_shell_of(gobj), message, {
        t:      t,
        detail: detail
    }).then((yes) => {
        if(!yes || gobj_is_destroying(gobj)) {
            return;
        }
        gobj_send_event(gobj, "EV_CONFIRMED", kw, gobj);
    });
}

/***************************************************************
 *  Editing a column.
 ***************************************************************/
function ac_add_column(gobj, event, kw, src)
{
    let topic = current_topic(gobj);

    if(refuse_if_readonly(gobj, event)) {
        return -1;
    }
    if(!topic) {
        log_error(`${gobj_short_name(gobj)}: ${event} with no topic open`);
        return -1;
    }
    open_column_form(gobj, topic, null);
    return 0;
}

function ac_edit_column(gobj, event, kw, src)
{
    let priv = gobj.priv;
    let topic = current_topic(gobj);
    let col = topic ? find_col(priv.model, priv.treedb_id, topic.name, kw.col) : null;

    if(refuse_if_readonly(gobj, event)) {
        return -1;
    }
    if(!col) {
        log_error(`${gobj_short_name(gobj)}: ${event} names no column: ${kw.col}`);
        return -1;
    }
    open_column_form(gobj, topic, col);
    return 0;
}

/***************************************************************
 *  Duplicating a column: the whole definition, a name that says
 *  it is a copy, and the form open on it. A schema is written by
 *  variations on a column far more often than from nothing.
 ***************************************************************/
function ac_duplicate_column(gobj, event, kw, src)
{
    let priv = gobj.priv;
    let topic = current_topic(gobj);
    let col = topic ? find_col(priv.model, priv.treedb_id, topic.name, kw.col) : null;

    if(refuse_if_readonly(gobj, event)) {
        return -1;
    }
    if(!col) {
        log_error(`${gobj_short_name(gobj)}: ${event} names no column: ${kw.col}`);
        return -1;
    }

    let prefill = Object.assign({}, col.record);
    delete prefill.id;
    delete prefill.value;
    delete prefill.order;
    delete prefill.topics;
    prefill.__name__ = `${col.name}_copy`;

    open_column_form(gobj, topic, null, prefill);
    return 0;
}

function ac_save_column(gobj, event, kw, src)
{
    let priv = gobj.priv;
    let topic = find_topic(priv.model, priv.treedb_id, kw.topic);
    let col = kw.creating ? null : find_col(priv.model, priv.treedb_id, kw.topic, kw.col);

    if(refuse_if_readonly(gobj, event)) {
        return -1;
    }
    if(!topic || (!kw.creating && !col)) {
        log_error(`${gobj_short_name(gobj)}: ${event} names no column: ${kw.topic}.${kw.col}`);
        return -1;
    }

    let values = kw.values || {};
    if(kw.creating && empty_string(String(values.value || "").trim())) {
        yui_shell_show_error(yui_shell_of(gobj), "a column needs a name", {t: t});
        return -1;
    }
    if(kw.creating && find_col(priv.model, priv.treedb_id, kw.topic, String(values.value).trim())) {
        yui_shell_show_error(yui_shell_of(gobj), "that column is already there", {t: t});
        return -1;
    }

    close_dialog(gobj);
    return queue_writes(gobj, [{
        op:         kw.creating ? "create" : "update",
        topic_name: T_COLS,
        record:     column_record(gobj, topic, col, values)
    }].concat(version_writes(gobj, topic)));
}

function ac_delete_column(gobj, event, kw, src)
{
    let priv = gobj.priv;
    let topic = current_topic(gobj);
    let col = topic ? find_col(priv.model, priv.treedb_id, topic.name, kw.col) : null;

    if(refuse_if_readonly(gobj, event)) {
        return -1;
    }
    if(!col) {
        log_error(`${gobj_short_name(gobj)}: ${event} names no column: ${kw.col}`);
        return -1;
    }

    confirm_then(gobj, "delete this column?", `${topic.name}.${col.name}`,
        {what: "column", topic: topic.name, col: col.name});
    return 0;
}

/***************************************************************
 *  Reordering. `order` is a field, so a drag is a write — of the
 *  rows whose place actually changed, which in a forty-column
 *  topic is two or three of them.
 ***************************************************************/
function ac_move_column(gobj, event, kw, src)
{
    let topic = current_topic(gobj);

    if(refuse_if_readonly(gobj, event)) {
        return -1;
    }
    if(!topic) {
        log_error(`${gobj_short_name(gobj)}: ${event} with no topic open`);
        return -1;
    }

    let from = kw.from;
    let to = kw.to;
    let list = topic.cols.slice();
    if(from < 0 || from >= list.length || to < 0 || to > list.length) {
        log_error(`${gobj_short_name(gobj)}: ${event} out of range: ${from} -> ${to}`);
        return -1;
    }
    let moved = list.splice(from, 1)[0];
    list.splice(from < to ? to - 1 : to, 0, moved);

    let writes = moved_orders(list).map((order) => {
        return {op: "update", topic_name: T_COLS,
                record: {id: order.id, order: order.order}};
    });
    if(writes.length === 0) {
        return 0;       /*  dropped where it already was  */
    }
    return queue_writes(gobj, writes.concat(version_writes(gobj, topic)));
}

/***************************************************************
 *  Editing a topic.
 ***************************************************************/
function ac_add_topic(gobj, event, kw, src)
{
    let treedb = current_treedb(gobj);

    if(refuse_if_readonly(gobj, event)) {
        return -1;
    }
    if(!treedb) {
        log_error(`${gobj_short_name(gobj)}: ${event} with no treedb open`);
        return -1;
    }
    open_topic_form(gobj, treedb, null);
    return 0;
}

function ac_edit_topic(gobj, event, kw, src)
{
    let priv = gobj.priv;
    let treedb = current_treedb(gobj);
    let topic = treedb ? find_topic(priv.model, priv.treedb_id, kw.topic) : null;

    if(refuse_if_readonly(gobj, event)) {
        return -1;
    }
    if(!topic) {
        log_error(`${gobj_short_name(gobj)}: ${event} names no topic: ${kw.topic}`);
        return -1;
    }
    open_topic_form(gobj, treedb, topic);
    return 0;
}

function ac_save_topic(gobj, event, kw, src)
{
    let priv = gobj.priv;
    let treedb = current_treedb(gobj);
    let topic = kw.creating ? null : find_topic(priv.model, priv.treedb_id, kw.topic);

    if(refuse_if_readonly(gobj, event)) {
        return -1;
    }
    if(!treedb || (!kw.creating && !topic)) {
        log_error(`${gobj_short_name(gobj)}: ${event} names no topic: ${kw.topic}`);
        return -1;
    }

    let values = kw.values || {};
    if(kw.creating) {
        let name = String(values.value || "").trim();
        if(empty_string(name)) {
            yui_shell_show_error(yui_shell_of(gobj), "a topic needs a name", {t: t});
            return -1;
        }
        if(find_topic(priv.model, priv.treedb_id, name)) {
            yui_shell_show_error(yui_shell_of(gobj), "that topic is already there", {t: t});
            return -1;
        }
    }

    close_dialog(gobj);
    /*  The topic record carries the version the form asked for, so it is
     *  not raised again here — only the treedb's.  */
    return queue_writes(gobj, [{
        op:         kw.creating ? "create" : "update",
        topic_name: T_TOPICS,
        record:     topic_record(gobj, treedb, topic, values)
    }].concat(version_writes(gobj, null)));
}

function ac_delete_topic(gobj, event, kw, src)
{
    let priv = gobj.priv;
    let topic = find_topic(priv.model, priv.treedb_id, kw.topic);

    if(refuse_if_readonly(gobj, event)) {
        return -1;
    }
    if(!topic) {
        log_error(`${gobj_short_name(gobj)}: ${event} names no topic: ${kw.topic}`);
        return -1;
    }

    confirm_then(gobj, "delete this topic and its columns?",
        `${topic.name} (${topic.cols.length})`, {what: "topic", topic: topic.name});
    return 0;
}

/***************************************************************
 *  Raising a version by hand: what the banner offers when
 *  something else wrote the topic and left its version alone.
 ***************************************************************/
function ac_bump_version(gobj, event, kw, src)
{
    let priv = gobj.priv;
    let topic = find_topic(priv.model, priv.treedb_id, kw.topic);

    if(refuse_if_readonly(gobj, event)) {
        return -1;
    }
    if(!topic) {
        log_error(`${gobj_short_name(gobj)}: ${event} names no topic: ${kw.topic}`);
        return -1;
    }
    return queue_writes(gobj, version_writes(gobj, topic));
}

/***************************************************************
 *  Deleting a leftover.
 ***************************************************************/
function ac_delete_orphan(gobj, event, kw, src)
{
    if(refuse_if_readonly(gobj, event)) {
        return -1;
    }
    if(empty_string(kw.id)) {
        log_error(`${gobj_short_name(gobj)}: ${event} names nothing`);
        return -1;
    }
    close_dialog(gobj);
    return queue_writes(gobj, [{
        op:         "delete",
        topic_name: kw.kind === "topic" ? T_TOPICS : T_COLS,
        record:     {id: kw.id}
    }]);
}

/***************************************************************
 *  Checking, exporting, importing.
 ***************************************************************/
function ac_validate(gobj, event, kw, src)
{
    let priv = gobj.priv;
    let treedb = current_treedb(gobj);

    if(!treedb) {
        log_error(`${gobj_short_name(gobj)}: ${event} with no treedb open`);
        return -1;
    }
    let findings = validate_schema(treedb, {
        written_topics: Object.keys(priv.written),
        baseline:       priv.baseline
    });
    open_report(gobj, findings, treedb.id);
    if(has_errors(findings)) {
        log_warning(`${gobj_short_name(gobj)}: ${treedb.id} would be refused as it is`);
    }
    return 0;
}

function ac_export(gobj, event, kw, src)
{
    let treedb = current_treedb(gobj);

    if(!treedb) {
        log_error(`${gobj_short_name(gobj)}: ${event} with no treedb open`);
        return -1;
    }
    open_export(gobj, treedb);
    return 0;
}

function ac_import(gobj, event, kw, src)
{
    let treedb = current_treedb(gobj);

    if(refuse_if_readonly(gobj, event)) {
        return -1;
    }
    if(!treedb) {
        log_error(`${gobj_short_name(gobj)}: ${event} with no treedb open`);
        return -1;
    }
    open_import(gobj, treedb);
    return 0;
}

/***************************************************************
 *  The paste, read and planned. Nothing is written here: what is
 *  shown is the plan, and the plan is what the next event runs.
 ***************************************************************/
function ac_preview_import(gobj, event, kw, src)
{
    let priv = gobj.priv;
    let treedb = current_treedb(gobj);
    let incoming = null;

    if(!treedb) {
        log_error(`${gobj_short_name(gobj)}: ${event} with no treedb open`);
        return -1;
    }
    try {
        incoming = JSON.parse(String(kw.text || ""));
    } catch(e) {
        priv.import_plan = null;
        render_import_plan(gobj, {writes: [], summary: {},
            conflicts: [{code: "that is not json", topic: "", col: ""}]});
        return -1;
    }

    let plan = plan_import(treedb, incoming, {prune: !!kw.prune});
    priv.import_plan = plan;
    render_import_plan(gobj, plan);
    return 0;
}

function ac_apply_import(gobj, event, kw, src)
{
    let priv = gobj.priv;
    let plan = priv.import_plan;

    if(refuse_if_readonly(gobj, event)) {
        return -1;
    }
    if(!plan || plan.writes.length === 0) {
        log_error(`${gobj_short_name(gobj)}: ${event} with no plan to run`);
        return -1;
    }

    let deletes = plan_deletes(plan);
    if(deletes.length === 0) {
        return run_import(gobj);
    }
    confirm_then(gobj, "this import deletes part of the schema", `${deletes.length}`,
        {what: "import"});
    return 0;
}

/***************************************************************
 *  Run the plan the dialog showed. Reached only through
 *  EV_CONFIRMED or from an import with nothing to delete.
 ***************************************************************/
function run_import(gobj)
{
    let priv = gobj.priv;
    let plan = priv.import_plan;

    if(!plan) {
        log_error(`${gobj_short_name(gobj)}: the import plan is gone`);
        return -1;
    }
    close_dialog(gobj);
    priv.import_plan = null;
    return queue_writes(gobj, plan.writes.map((write) => {
        return {op: write.op, topic_name: write.topic_name, record: write.record};
    }));
}

/***************************************************************
 *  A confirmation the operator gave.
 *
 *  The dialog's answer comes back as an EVENT and not as a
 *  continuation: a deletion decided in a modal is an action like
 *  any other, and an action that never crosses the machine
 *  leaves the `machine` trace saying nothing about the one thing
 *  in this view that destroys something.
 ***************************************************************/
function ac_confirmed(gobj, event, kw, src)
{
    let priv = gobj.priv;

    if(refuse_if_readonly(gobj, event)) {
        return -1;
    }
    if(kw.what === "import") {
        return run_import(gobj);
    }
    if(kw.what === "topic") {
        let topic = find_topic(priv.model, priv.treedb_id, kw.topic);
        if(!topic) {
            log_error(`${gobj_short_name(gobj)}: ${event} names no topic: ${kw.topic}`);
            return -1;
        }
        /*  The columns first: a topic deleted with children behind it
         *  leaves them belonging to nothing.  */
        let writes = topic.cols.map((col) => {
            return {op: "delete", topic_name: T_COLS, record: {id: col.id}};
        });
        writes.push({op: "delete", topic_name: T_TOPICS, record: {id: topic.id}});
        return queue_writes(gobj, writes.concat(version_writes(gobj, null)));
    }
    if(kw.what === "column") {
        let topic = find_topic(priv.model, priv.treedb_id, kw.topic);
        let col = topic ? find_col(priv.model, priv.treedb_id, kw.topic, kw.col) : null;
        if(!col) {
            log_error(`${gobj_short_name(gobj)}: ${event} names no column: ${kw.col}`);
            return -1;
        }
        return queue_writes(gobj, [{
            op: "delete", topic_name: T_COLS, record: {id: col.id}
        }].concat(version_writes(gobj, topic)));
    }

    log_error(`${gobj_short_name(gobj)}: ${event} of nothing this view asked about: ${kw.what}`);
    return -1;
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

    /*  What every screen answers: where the host says we are, whether
     *  the session is up, the language, and the treedb's answers.  */
    const COMMON = [
        ["EV_MT_COMMAND_ANSWER",    ac_mt_command_answer,   null],
        ["EV_SHOW",                 ac_show,                null],
        ["EV_HIDE",                 ac_hide,                null],
        ["EV_TRANSPORT_STATE",      ac_transport_state,     null],
        ["EV_LANGUAGE_CHANGED",     ac_language_changed,    null],
        ["EV_REFRESH",              ac_refresh,             null]
    ];

    /*  What a treedb is open for: reading it whole, and writing it
     *  back. Legal wherever a treedb is open, which is every screen
     *  below the first one.  */
    const TREEDB_WIDE = [
        ["EV_BACK",                 ac_back,                null],
        ["EV_TOGGLE_DIAGRAM",       ac_toggle_diagram,      null],
        ["EV_VALIDATE",             ac_validate,            null],
        ["EV_EXPORT",               ac_export,              null],
        ["EV_IMPORT",               ac_import,              null],
        ["EV_PREVIEW_IMPORT",       ac_preview_import,      null],
        ["EV_APPLY_IMPORT",         ac_apply_import,        null],
        ["EV_CONFIRMED",            ac_confirmed,           null]
    ];

    /*---------------------------------------------*
     *          States
     *
     *  Each is a screen and a set of legal actions. An
     *  event arriving in the wrong one is NOT swallowed
     *  by a no-op action: the framework says so, loudly,
     *  and names the sender — which is the only reason
     *  a click is worth routing through a machine.
     *---------------------------------------------*/
    const states = [
        ["ST_IDLE", COMMON.slice()],

        ["ST_LOADING", COMMON.slice()],

        ["ST_EMPTY", COMMON.slice()],

        ["ST_TREEDBS", COMMON.concat([
            ["EV_SELECT_TREEDB",    ac_select_treedb,       null],
            ["EV_SHOW_ORPHANS",     ac_show_orphans,        null],
            ["EV_DELETE_ORPHAN",    ac_delete_orphan,       null],
            ["EV_CONFIRMED",        ac_confirmed,           null]
        ])],

        ["ST_TOPICS", COMMON.concat(TREEDB_WIDE).concat([
            ["EV_SELECT_TOPIC",     ac_select_topic,        null],
            ["EV_ADD_TOPIC",        ac_add_topic,           null],
            ["EV_EDIT_TOPIC",       ac_edit_topic,          null],
            ["EV_DELETE_TOPIC",     ac_delete_topic,        null],
            ["EV_SAVE_TOPIC",       ac_save_topic,          null]
        ])],

        ["ST_DIAGRAM", COMMON.concat(TREEDB_WIDE).concat([
            ["EV_NODE_CLICK",       ac_node_click,          null]
        ])],

        ["ST_COLUMNS", COMMON.concat(TREEDB_WIDE).concat([
            ["EV_ADD_COLUMN",       ac_add_column,          null],
            ["EV_EDIT_COLUMN",      ac_edit_column,         null],
            ["EV_DUPLICATE_COLUMN", ac_duplicate_column,    null],
            ["EV_DELETE_COLUMN",    ac_delete_column,       null],
            ["EV_SAVE_COLUMN",      ac_save_column,         null],
            ["EV_MOVE_COLUMN",      ac_move_column,         null],
            ["EV_BUMP_VERSION",     ac_bump_version,        null]
        ])],

        /*  A write, or a plan of them, in flight. Only the answers and
         *  the host are heard: every other action would be computed
         *  against a model the answer still in the air is about to
         *  change.  */
        ["ST_SAVING", COMMON.slice()]
    ];

    /*---------------------------------------------*
     *          Events
     *---------------------------------------------*/
    const event_types = [
        /*  From the backend. PUBLIC, or the ievent drops it before this
         *  gclass is reached.  */
        ["EV_MT_COMMAND_ANSWER",    event_flag_t.EVF_PUBLIC_EVENT],

        /*  From the host.  */
        ["EV_SHOW",                 0],
        ["EV_HIDE",                 0],
        ["EV_TRANSPORT_STATE",      0],
        ["EV_LANGUAGE_CHANGED",     0],
        ["EV_REFRESH",              0],

        /*  From this view's own screens.  */
        ["EV_SELECT_TREEDB",        0],
        ["EV_SELECT_TOPIC",         0],
        ["EV_BACK",                 0],
        ["EV_TOGGLE_DIAGRAM",       0],
        ["EV_SHOW_ORPHANS",         0],
        ["EV_DELETE_ORPHAN",        0],
        ["EV_ADD_TOPIC",            0],
        ["EV_EDIT_TOPIC",           0],
        ["EV_DELETE_TOPIC",         0],
        ["EV_SAVE_TOPIC",           0],
        ["EV_ADD_COLUMN",           0],
        ["EV_EDIT_COLUMN",          0],
        ["EV_DUPLICATE_COLUMN",     0],
        ["EV_DELETE_COLUMN",        0],
        ["EV_SAVE_COLUMN",          0],
        ["EV_MOVE_COLUMN",          0],
        ["EV_BUMP_VERSION",         0],
        ["EV_VALIDATE",             0],
        ["EV_EXPORT",               0],
        ["EV_IMPORT",               0],
        ["EV_PREVIEW_IMPORT",       0],
        ["EV_APPLY_IMPORT",         0],
        ["EV_CONFIRMED",            0],

        /*  From the drawing, which is a child of this gobj.  */
        ["EV_NODE_CLICK",           0],

        /*  Outwards. The host mirrors the position into the url and
         *  carries the write up to whoever owns the Apply — both are
         *  optional, so neither warns when nobody listens.  */
        ["EV_POSITION_CHANGED",     event_flag_t.EVF_OUTPUT_EVENT|
                                    event_flag_t.EVF_NO_WARN_SUBS],
        ["EV_RECORD_WRITTEN",       event_flag_t.EVF_OUTPUT_EVENT|
                                    event_flag_t.EVF_NO_WARN_SUBS],
        ["EV_SCHEMA_CHECKED",       event_flag_t.EVF_OUTPUT_EVENT|
                                    event_flag_t.EVF_NO_WARN_SUBS]
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
function register_c_yui_schema_editor()
{
    return create_gclass(GCLASS_NAME);
}

export {register_c_yui_schema_editor};
