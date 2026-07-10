/***********************************************************************
 *          c_demo_treedb.js
 *
 *      C_DEMO_TREEDB — a treedb-topic view for the layouts demo. It
 *      hosts the real C_YUI_TREEDB_TOPIC_WITH_FORM as a pure child
 *      against an IN-MEMORY backend: this wrapper plays the role of
 *      C_YUI_TREEDB_TOPICS (the topics manager) — it feeds the table
 *      with EV_LOAD_NODES, answers the "get_topic_data" command the
 *      edit dialog uses to collect fkey options, and applies the
 *      published EV_CREATE/UPDATE/DELETE_RECORD to its local data,
 *      echoing them back (EV_LOAD_NODE_CREATED/UPDATED, EV_NODE_DELETED)
 *      exactly like the backend broadcast would.
 *
 *      The edit dialog is a hosted C_YUI_FORM (single form engine):
 *      press EDIT then the row pen icon, or NEW — the pkey follows the
 *      form_mode contract, fkeys are TomSelects fed with sibling-topic
 *      rows, the dict col edits as raw JSON, and every published
 *      record event is echoed as JSON below the table.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {
    SDATA, SDATA_END, data_type_t,
    gclass_create, log_error,
    gobj_parent,
    gobj_read_attr, gobj_read_pointer_attr, gobj_write_attr,
    gobj_subscribe_event,
    gobj_create_pure_child, gobj_start, gobj_send_event,
    json_deep_copy,
    sprintf,
    createElement2,
    refresh_language,
} from "@yuneta/gobj-js";

import {t} from "i18next";


/***************************************************************
 *              Constants
 ***************************************************************/
const GCLASS_NAME = "C_DEMO_TREEDB";

/*  Topic schema (treedb desc): a "users" topic with the field kinds
 *  the edit dialog must prove — pkey, plain writables, a boolean, a
 *  free-form dict (raw JSON editor), a single fkey (string) and a
 *  multi fkey (list). The non-writable "secret" col must NOT appear
 *  in the form (only in no column either: hidden). */
const USERS_DESC = {
    topic_name: "users",
    pkey: "id",
    cols: [
        {id: "id",         header: "Id",         type: "string",
         flag: ["persistent", "required"]},
        {id: "name",       header: "Name",       type: "string",
         flag: ["persistent", "writable"]},
        {id: "age",        header: "Age",        type: "integer",
         flag: ["persistent", "writable"]},
        {id: "enabled",    header: "Enabled",    type: "boolean",
         flag: ["persistent", "writable"]},
        {id: "config",     header: "Config",     type: "dict",
         flag: ["persistent", "writable"]},
        {id: "department", header: "Department", type: "string",
         flag: ["persistent", "fkey"],
         fkey: {"departments": "users"}},
        {id: "teams",      header: "Teams",      type: "list",
         flag: ["persistent", "fkey"],
         fkey: {"teams": "members"}},
        {id: "secret",     header: "Secret",     type: "string",
         flag: ["persistent", "hidden"]}
    ]
};

/*  In-memory "backend" data, reset on every page load. */
function initial_data()
{
    return {
        users: [
            {id: "ada",   name: "Ada Lovelace",  age: 36, enabled: true,
             config: {theme: "dark", limits: {cpu: 2}},
             department: "departments^engineering^users",
             teams: ["teams^core^members", "teams^ui^members"],
             secret: "s3cr3t"},
            {id: "alan",  name: "Alan Turing",   age: 41, enabled: true,
             config: {theme: "light"},
             department: "departments^engineering^users",
             teams: ["teams^core^members"],
             secret: "enigma"},
            {id: "grace", name: "Grace Hopper",  age: 85, enabled: false,
             config: {},
             department: "departments^operations^users",
             teams: [],
             secret: "cobol"}
        ],
        departments: [
            {id: "engineering", name: "Engineering"},
            {id: "sales",       name: "Sales"},
            {id: "operations",  name: "Operations"}
        ],
        teams: [
            {id: "core",  name: "Core"},
            {id: "ui",    name: "UI"},
            {id: "field", name: "Field"}
        ]
    };
}


/***************************************************************
 *              Attrs
 ***************************************************************/
const attrs_table = [
SDATA(data_type_t.DTP_POINTER,  "subscriber",   0,  null,     "Subscriber of output events"),

SDATA(data_type_t.DTP_STRING,   "title",        0,  "TreeDB", "Card title"),
SDATA(data_type_t.DTP_STRING,   "lead",         0,  "",       "Explanatory paragraph"),
SDATA(data_type_t.DTP_POINTER,  "$container",   0,  null,     "Root HTMLElement (shell contract)"),
SDATA_END()
];

let PRIVATE_DATA = {
    topic: null,    // hosted C_YUI_TREEDB_TOPIC_WITH_FORM child
    data:  null,    // in-memory backend: {users, departments, teams}
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

    priv.data = initial_data();
    build_ui(gobj);
}

/***************************************************************
 *          Framework Method: Start
 *          The shell mounted $container before starting us, so
 *          the child (Tabulator inside) can attach now.
 ***************************************************************/
function mt_start(gobj)
{
    let priv = gobj.priv;

    if(priv.topic) {
        gobj_start(priv.topic);
        gobj_send_event(
            priv.topic, "EV_LOAD_NODES", json_deep_copy(priv.data.users), gobj
        );
    }
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
    let $c = gobj_read_attr(gobj, "$container");
    if($c && $c.parentNode) {
        $c.parentNode.removeChild($c);
    }
    gobj_write_attr(gobj, "$container", null);
}

/************************************************************
 *      Framework Method command
 *      The topic's edit dialog asks its parent (us) for the
 *      rows of the fkey topics — the C_YUI_TREEDB_TOPICS
 *      contract.
 ************************************************************/
function mt_command_parser(gobj, command, kw, src)
{
    let priv = gobj.priv;

    switch(command) {
        case "get_topic_data": {
            let rows = priv.data[kw.topic_name];
            if(!rows) {
                return {
                    "result": -1,
                    "comment": sprintf("Topic not found: %s", kw.topic_name),
                    "schema": null,
                    "data": null
                };
            }
            return {
                "result": 0,
                "comment": "",
                "schema": null,
                "data": json_deep_copy(rows)
            };
        }
        default:
            log_error(`${GCLASS_NAME}: command not found: ${command}`);
            return {
                "result": -1,
                "comment": sprintf("Command not found: %s", command),
                "schema": null,
                "data": null
            };
    }
}




                    /***************************
                     *      Local Methods
                     ***************************/




/***************************************************************
 *  Build the card: header + hosted topic table + event echo.
 ***************************************************************/
function build_ui(gobj)
{
    let priv  = gobj.priv;
    let title = gobj_read_attr(gobj, "title") || "TreeDB";
    let lead  = gobj_read_attr(gobj, "lead")  || "";

    let topic = gobj_create_pure_child(
        "demo_treedb_topic",
        "C_YUI_TREEDB_TOPIC_WITH_FORM",
        {
            treedb_name: "demo",
            topic_name:  "users",
            desc:        USERS_DESC
        },
        gobj
    );
    priv.topic = topic;
    let $topic = gobj_read_attr(topic, "$container");

    let head = [
        ["h1", {class: "DEMO_TITLE title is-3 mb-2", i18n: title}, title]
    ];
    if(lead) {
        head.push(["p", {class: "DEMO_LEAD content", i18n: lead, style: "max-width:70ch;"}, lead]);
    }

    let $c = createElement2(
        ["div", {class: "C_DEMO_TREEDB DEMO_CARD view-card"}, [
            ["div", {class: "DEMO_HEAD"}, head],
            ["div", {class: "DEMO_TREEDB_HOST box p-2"}, []],
            ["div", {class: "DEMO_TREEDB_RESULT"}, [
                ["p", {class: "is-size-7 has-text-grey mb-1",
                       i18n: "Last published record event:"}, "Last published record event:"],
                ["pre", {class: "DEMO_TREEDB_JSON is-size-7",
                         style: "overflow:auto;"},
                    "(edit, create or delete a row)"]
            ]]
        ]]
    );

    let $host = $c.querySelector(".DEMO_TREEDB_HOST");
    if($topic && $host) {
        $host.appendChild($topic);
    } else {
        log_error(`${GCLASS_NAME}: C_YUI_TREEDB_TOPIC_WITH_FORM has no $container`);
    }

    gobj_write_attr(gobj, "$container", $c);
    refresh_language($c, t);
}

/***************************************************************
 *  Echo the published event into the JSON panel.
 ***************************************************************/
function echo_event(gobj, event, kw)
{
    let $c = gobj_read_attr(gobj, "$container");
    if($c) {
        let $json = $c.querySelector(".DEMO_TREEDB_JSON");
        if($json) {
            $json.textContent = event + " " + JSON.stringify(kw || {}, null, 2);
        }
    }
}




                    /***************************
                     *      Actions
                     ***************************/




/***************************************************************
 *  EV_CREATE_RECORD {topic_name, record} published by the topic
 *  child. Apply to the in-memory data and echo the "broadcast"
 *  back (EV_LOAD_NODE_CREATED) like the real backend does.
 ***************************************************************/
function ac_create_record(gobj, event, kw, src)
{
    let priv = gobj.priv;
    let record = kw.record || {};

    if(!record.id) {
        log_error(`${GCLASS_NAME}: create without id`);
        return -1;
    }
    if(priv.data.users.find(u => u.id === record.id)) {
        log_error(`${GCLASS_NAME}: id already exists: ${record.id}`);
        return -1;
    }
    record.secret = "";     // non-form field, backend-owned
    priv.data.users.push(json_deep_copy(record));

    echo_event(gobj, event, kw);
    gobj_send_event(priv.topic, "EV_LOAD_NODE_CREATED", [json_deep_copy(record)], gobj);
    return 0;
}

/***************************************************************
 *  EV_UPDATE_RECORD {topic_name, record}
 ***************************************************************/
function ac_update_record(gobj, event, kw, src)
{
    let priv = gobj.priv;
    let record = kw.record || {};

    let row = priv.data.users.find(u => u.id === record.id);
    if(!row) {
        log_error(`${GCLASS_NAME}: id not found: ${record.id}`);
        return -1;
    }
    Object.assign(row, json_deep_copy(record));

    echo_event(gobj, event, kw);
    gobj_send_event(priv.topic, "EV_LOAD_NODE_UPDATED", [json_deep_copy(row)], gobj);
    return 0;
}

/***************************************************************
 *  EV_DELETE_RECORD {topic_name, record}
 ***************************************************************/
function ac_delete_record(gobj, event, kw, src)
{
    let priv = gobj.priv;
    let record = kw.record || {};

    let idx = priv.data.users.findIndex(u => u.id === record.id);
    if(idx < 0) {
        log_error(`${GCLASS_NAME}: id not found: ${record.id}`);
        return -1;
    }
    priv.data.users.splice(idx, 1);

    echo_event(gobj, event, kw);
    gobj_send_event(priv.topic, "EV_NODE_DELETED", [{id: record.id}], gobj);
    return 0;
}

/***************************************************************
 *  EV_REFRESH_TOPIC {topic_name}: resend the full list.
 ***************************************************************/
function ac_refresh_topic(gobj, event, kw, src)
{
    let priv = gobj.priv;
    gobj_send_event(
        priv.topic, "EV_LOAD_NODES", json_deep_copy(priv.data.users), gobj
    );
    return 0;
}




/***************************************************************
 *              FSM
 ***************************************************************/
/*---------------------------------------------*
 *          Global methods table
 *---------------------------------------------*/
const gmt = {
    mt_create:          mt_create,
    mt_start:           mt_start,
    mt_stop:            mt_stop,
    mt_destroy:         mt_destroy,
    mt_command_parser:  mt_command_parser,
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

    /*  CHILD model: the topic child publishes its output events to
     *  us — every one of them must be declared here. */
    const states = [
        ["ST_IDLE", [
            ["EV_CREATE_RECORD",    ac_create_record,   null],
            ["EV_UPDATE_RECORD",    ac_update_record,   null],
            ["EV_DELETE_RECORD",    ac_delete_record,   null],
            ["EV_REFRESH_TOPIC",    ac_refresh_topic,   null],
            ["EV_SELECT_ROWS",      null,               null],
            ["EV_UNSELECT_ROWS",    null,               null],
            ["EV_SHOW_HOOK_DATA",   null,               null]
        ]]
    ];

    const event_types = [
        ["EV_CREATE_RECORD",    0],
        ["EV_UPDATE_RECORD",    0],
        ["EV_DELETE_RECORD",    0],
        ["EV_REFRESH_TOPIC",    0],
        ["EV_SELECT_ROWS",      0],
        ["EV_UNSELECT_ROWS",    0],
        ["EV_SHOW_HOOK_DATA",   0]
    ];

    __gclass__ = gclass_create(
        gclass_name,
        event_types,
        states,
        gmt,
        0,  // lmt
        attrs_table,
        PRIVATE_DATA,
        0,  // authz_table
        0,  // command_table
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
function register_c_demo_treedb()
{
    return create_gclass(GCLASS_NAME);
}

export {register_c_demo_treedb};
