/***********************************************************************
 *          c_demo_backend.js
 *
 *      C_DEMO_BACKEND — a REMOTE YUNO that is not remote.
 *
 *      `C_YUI_TREEDB_GRAPH` does not ask its parent for data the way
 *      the topic table does: it calls `gobj_command()` on a
 *      `gobj_remote_yuno`, which in a real app is a `C_IEVENT_CLI`
 *      over a websocket.  That is why the treedb graph — the component
 *      whose camera vocabulary the other two graphs copy — was the one
 *      graph this offline demo could not show.
 *
 *      This gclass fills that hole by answering the same protocol with
 *      no wire underneath:
 *
 *        - `mt_command_parser` is what `gobj_command()` reaches, and it
 *          returns 0.  A non-falsy return is read by the caller as an
 *          ERROR STRING, not as an answer.
 *        - the answer travels back as `EV_MT_COMMAND_ANSWER` carrying
 *          `{result, comment, schema, data}` plus a `command_stack`
 *          pushed with `msg_iev_push_stack` — the stack is how the
 *          caller knows WHICH command it is reading, and without it the
 *          answer is dropped.
 *        - it is POSTED, not sent.  `gobj_command()` runs inside the
 *          caller's own action, so answering synchronously would
 *          re-enter its FSM from its own stack; a real backend always
 *          answers on a later turn, and the demo has to be wrong in the
 *          same direction as production, not in a comfortable one.
 *
 *      Commands: `descs` (the whole schema) and `nodes` (one topic's
 *      rows).  Those are the two the graph needs to draw.  The writes
 *      (create/update/delete/link/unlink) answer a refusal rather than
 *      pretending: this demo has no backend to write to, and a silent
 *      success that changes nothing is worse than a visible "no".
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {
    SDATA, SDATA_END, data_type_t,
    gclass_create, gclass_find_by_name,
    event_flag_t,
    log_error,
    gobj_post_event,
    gobj_find_service, gobj_name,
    gobj_read_attr, gobj_write_attr,
    json_deep_copy,
    msg_iev_push_stack,
} from "@yuneta/gobj-js";


/***************************************************************
 *              Constants
 ***************************************************************/
const GCLASS_NAME = "C_DEMO_BACKEND";

/*
 *  The schema the graph draws.  Three topics and the links between
 *  them, which is the minimum that makes a GRAPH worth looking at:
 *  a `users` topic pointing at `departments` and at `teams`, so the
 *  picture has two different edge kinds and a node with two parents.
 */
const DESCS = {
    departments: {
        topic_name: "departments",
        pkey: "id",
        cols: [
            {id: "id",            header: "Id",          type: "string",
             flag: ["persistent", "required"]},
            {id: "name",          header: "Name",        type: "string",
             flag: ["persistent", "writable"]},
            /*  Self-referent: a department inside a department.  This
             *  pair is what makes the topic HIERARCHICAL, and that is
             *  not decoration — see the note under RECORDS.  */
            {id: "departments",   header: "Departments", type: "list",
             flag: ["hook"], hook: {"departments": "department_id"}},
            {id: "department_id", header: "Parent",      type: "string",
             flag: ["persistent", "fkey"], fkey: {"departments": "departments"}},
            {id: "teams",         header: "Teams",       type: "list",
             flag: ["hook"], hook: {"teams": "department"}},
            {id: "users",         header: "Users",       type: "list",
             flag: ["hook"], hook: {"users": "department"}}
        ]
    },
    teams: {
        topic_name: "teams",
        pkey: "id",
        cols: [
            {id: "id",         header: "Id",         type: "string",
             flag: ["persistent", "required"]},
            {id: "name",       header: "Name",       type: "string",
             flag: ["persistent", "writable"]},
            {id: "department", header: "Department", type: "string",
             flag: ["persistent", "fkey"], fkey: {"departments": "teams"}},
            {id: "members",    header: "Members",    type: "list",
             flag: ["hook"], hook: {"users": "teams"}}
        ]
    },
    users: {
        topic_name: "users",
        pkey: "id",
        cols: [
            {id: "id",         header: "Id",         type: "string",
             flag: ["persistent", "required"]},
            {id: "name",       header: "Name",       type: "string",
             flag: ["persistent", "writable"]},
            {id: "age",        header: "Age",        type: "integer",
             flag: ["persistent", "writable"]},
            {id: "department", header: "Department", type: "string",
             flag: ["persistent", "fkey"], fkey: {"departments": "users"}},
            {id: "teams",      header: "Teams",      type: "list",
             flag: ["persistent", "fkey"], fkey: {"teams": "members"}}
        ]
    }
};

/*
 *  Why every topic here has BOTH a hook and an fkey.
 *
 *  The engine classifies a topic by counting them
 *  (`calculate_hooks_fkeys_counter`): no hooks = `child`, hooks but NO
 *  FKEYS = `extended`, both = `hierarchical`.  And `draw_link` returns
 *  without drawing anything when the parent is `extended` — an extended
 *  topic is a container whose children are drawn INSIDE it, not on the
 *  end of an edge.
 *
 *  A first version of this demo gave `departments` and `teams` only
 *  hooks.  Every node appeared, no edge did, and nothing said why: the
 *  refusal is silent because it is not an error.  The schema was wrong,
 *  not the graph.
 */

/*
 *  The rows.  Same people the TreeDB chapter's table shows, so the two
 *  chapters are visibly the same treedb seen two ways — plus the shape
 *  that makes a graph worth drawing: `operations` hangs off
 *  `engineering`, the teams hang off their department, and a user
 *  points at both a department and one or more teams.
 */
const RECORDS = {
    departments: [
        {id: "engineering", name: "Engineering", department_id: ""},
        {id: "sales",       name: "Sales",       department_id: ""},
        {id: "operations",  name: "Operations",
         department_id: "departments^engineering^departments"}
    ],
    teams: [
        {id: "core",  name: "Core",
         department: "departments^engineering^teams"},
        {id: "ui",    name: "UI",
         department: "departments^engineering^teams"},
        {id: "field", name: "Field",
         department: "departments^operations^teams"}
    ],
    users: [
        {id: "ada",   name: "Ada Lovelace", age: 36,
         department: "departments^engineering^users",
         teams: ["teams^core^members", "teams^ui^members"]},
        {id: "alan",  name: "Alan Turing",  age: 41,
         department: "departments^engineering^users",
         teams: ["teams^core^members"]},
        {id: "grace", name: "Grace Hopper", age: 85,
         department: "departments^operations^users",
         teams: ["teams^field^members"]}
    ]
};


/***************************************************************
 *              Data
 ***************************************************************/
const attrs_table = [
SDATA(data_type_t.DTP_STRING,   "treedb_name",  0,  "demo_treedb", "The treedb this backend serves"),
SDATA_END()
];

let PRIVATE_DATA = {
};

let __gclass__ = null;




                    /***************************
                     *      Local Methods
                     ***************************/




/************************************************************
 *   Answer one command, the way a remote yuno answers.
 *
 *   `__md_command__` is the caller's own echo box: whatever it
 *   put there comes back in the stack, and it is how an answer
 *   about `users` is told apart from one about `teams`.
 *
 *   The destination is resolved BY NAME, and that is not a
 *   detour: `C_IEVENT_CLI` has the caller's gobj on the far
 *   side of a socket and can only find it again with
 *   `gobj_find_service(gobj_name(src))`, which finds
 *   REGISTERED SERVICES and nothing else.  Answering the
 *   pointer we were handed would work here and model a
 *   contract that does not exist -- a view mounted as a pure
 *   child would run in this demo and receive not one answer in
 *   production.  So the demo fails the same way the wire does.
 ************************************************************/
function answer(gobj, src, command, kw, result, comment, data, schema)
{
    let dst = gobj_find_service(gobj_name(src), false);
    if(!dst) {
        log_error(
            `${GCLASS_NAME}: '${gobj_name(src)}' is not a registered service; ` +
            `a real backend could not answer it either`
        );
        return;
    }

    let answer_kw = {
        result:  result,
        comment: comment || "",
        schema:  schema || null,
        data:    data === undefined? null: data
    };

    msg_iev_push_stack(
        gobj,
        answer_kw,
        "command_stack",
        {
            command: command,
            kw: (kw && kw.__md_command__) || {}
        }
    );

    /*  POSTED: gobj_command() runs inside the caller's action.  */
    gobj_post_event(dst, "EV_MT_COMMAND_ANSWER", answer_kw, gobj);
}




                    /******************************
                     *      Framework Methods
                     ******************************/




/************************************************************
 *      Framework Method command
 ************************************************************/
function mt_command_parser(gobj, command, kw, src)
{
    switch(command) {
        case "descs":
            answer(gobj, src, command, kw, 0, "", json_deep_copy(DESCS));
            break;

        case "nodes": {
            let topic_name = kw && kw.topic_name;
            let rows = RECORDS[topic_name];
            if(!rows) {
                answer(gobj, src, command, kw, -1,
                    `unknown topic: ${topic_name}`, []);
                break;
            }
            answer(gobj, src, command, kw, 0, "",
                json_deep_copy(rows), json_deep_copy(DESCS[topic_name]));
            break;
        }

        case "create-node":
        case "update-node":
        case "delete-node":
        case "link-nodes":
        case "unlink-nodes":
            /*  Refused, and SAID.  There is nothing behind this demo to
             *  write to, and a write that silently changes nothing is
             *  worse than one that answers no.  */
            answer(gobj, src, command, kw, -1,
                "this demo has no backend to write to", null);
            break;

        default:
            answer(gobj, src, command, kw, -1,
                `command not available in the demo: ${command}`, null);
            break;
    }

    /*  0, not the answer: a non-falsy return is read as an error string. */
    return 0;
}


/*---------------------------------------------*
 *          Global methods table
 *---------------------------------------------*/
const gmt = {
    mt_command_parser: mt_command_parser,
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

    const states = [
        ["ST_IDLE", [
        ]]
    ];

    /*
     *  The treedb broadcast a real remote yuno publishes.  The graph
     *  SUBSCRIBES to them on start, and a subscription to an event a
     *  gclass does not declare is an error — "event NOT in output event
     *  list" — five of them, before anything is even drawn.
     *
     *  Declared and never fired: this demo is read-only, so no node is
     *  ever created, linked or deleted.  EVF_NO_WARN_SUBS says that
     *  absence is not a bug.
     */
    const event_types = [
        ["EV_TREEDB_NODE_CREATED",  event_flag_t.EVF_OUTPUT_EVENT|event_flag_t.EVF_NO_WARN_SUBS],
        ["EV_TREEDB_NODE_UPDATED",  event_flag_t.EVF_OUTPUT_EVENT|event_flag_t.EVF_NO_WARN_SUBS],
        ["EV_TREEDB_NODE_DELETED",  event_flag_t.EVF_OUTPUT_EVENT|event_flag_t.EVF_NO_WARN_SUBS],
        ["EV_TREEDB_NODE_LINKED",   event_flag_t.EVF_OUTPUT_EVENT|event_flag_t.EVF_NO_WARN_SUBS],
        ["EV_TREEDB_NODE_UNLINKED", event_flag_t.EVF_OUTPUT_EVENT|event_flag_t.EVF_NO_WARN_SUBS],
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
function register_c_demo_backend()
{
    if(gclass_find_by_name(GCLASS_NAME, false)) {
        return 0;
    }
    return create_gclass(GCLASS_NAME);
}

export { register_c_demo_backend };
