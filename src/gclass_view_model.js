/***********************************************************************
 *          gclass_view_model.js
 *
 *          The description of a gclass, turned into what a viewer
 *          draws: zones, a matrix, and the states nothing declares a
 *          way into.
 *
 *          Pure data, no DOM -- so the shape of the view is testable
 *          without a browser, and the gclass that draws it has nothing
 *          to decide.
 *
 *          IT READS TWO DIALECTS. The C kernel (`gclass2json()` in
 *          `kernel/c/gobj-c/src/gobj.c`) and the browser registry
 *          (`gclass_describe.js`) answer the same DOCUMENT in
 *          different words, and a viewer that only knew one of them
 *          would draw half a page for the other side:
 *
 *              key         C kernel                browser
 *              ------------------------------------------------------
 *              flag        "SDF_RD|SDF_PERSIST"    ["SDF_RD", ...]
 *              type        "string"                "DTP_STRING"
 *              command     "command"               "id"
 *              parameter   "parameter"             "id"
 *              traces      "info_gclass_trace"     "trace_levels"
 *              action      "action" (a marker)     the function's name
 *
 *          The last one is not a rename: the C side cannot name an
 *          action at all -- `states2json()` writes the literal string
 *          "action" for every one of them. So a cell coming from a
 *          backend gclass says THAT there is an action and never which,
 *          and the model reports the difference instead of printing a
 *          name nobody wrote.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/

/*
 *  What the C side writes where a function name would go. It is not a
 *  name -- every action in every backend gclass carries this one.
 */
const C_ANONYMOUS_ACTION = "action";


/************************************************************
 *  Flags, from either dialect, as a list of names.
 *
 *  The C side joins them with '|' (`bits2gbuffer`), the
 *  browser side keeps the array `bits2names()` built.
 ************************************************************/
function normalize_flags(flag)
{
    if(Array.isArray(flag)) {
        return flag.filter((f) => typeof f === "string" && f.length > 0);
    }
    if(typeof flag === "string" && flag.length > 0) {
        return flag.split("|").map((f) => f.trim()).filter((f) => f.length > 0);
    }
    return [];
}

/************************************************************
 *  A data type, short and lower case, from either dialect.
 *
 *  An unknown type is reported as what it is: a viewer that
 *  silently drew "string" for something nobody registered
 *  would be lying about the schema.
 ************************************************************/
function normalize_type(type)
{
    if(typeof type === "string" && type.length > 0) {
        if(type.startsWith("DTP_")) {
            return type.slice(4).toLowerCase();
        }
        return type.toLowerCase();
    }
    if(type === null || type === undefined) {
        return "";
    }
    return String(type);
}

/************************************************************
 *  A default value as one short line.
 *
 *  The C side stringifies everything, the browser side keeps
 *  the live value -- including `null` for a pointer, which
 *  prints as an empty cell unless it is spelled out.
 ************************************************************/
function normalize_default(value)
{
    if(value === undefined) {
        return "";
    }
    if(value === null) {
        return "null";
    }
    if(typeof value === "string") {
        return value;
    }
    if(typeof value === "number" || typeof value === "boolean") {
        return String(value);
    }
    try {
        return JSON.stringify(value);
    } catch(e) {
        return String(value);
    }
}

/************************************************************
 *  One attr / parameter row, from either dialect.
 ************************************************************/
function normalize_field(row)
{
    if(!row || typeof row !== "object") {
        return null;
    }

    let id = row.id || row.parameter || row.name || "";
    if(!id) {
        return null;
    }

    return {
        id:            id,
        type:          normalize_type(row.type),
        flags:         normalize_flags(row.flag),
        default_value: normalize_default(row.default_value),
        description:   row.description || "",
    };
}

/************************************************************
 *  The attrs zone.
 ************************************************************/
function normalize_attrs(attrs)
{
    if(!Array.isArray(attrs)) {
        return [];
    }
    let rows = [];
    for(let it of attrs) {
        let row = normalize_field(it);
        if(row) {
            rows.push(row);
        }
    }
    return rows;
}

/************************************************************
 *  The commands zone.
 *
 *  A command with no name is not a command: the C tables use
 *  `SDATACM(DTP_SCHEMA, "", ...)` rows as SECTION HEADINGS,
 *  carrying the heading in the description (c_iogate, c_agent
 *  and every large gclass do it). Dropping them would glue
 *  four unrelated groups of commands into one list; drawing
 *  them as commands would offer the reader a nameless one.
 ************************************************************/
function normalize_commands(commands)
{
    if(!Array.isArray(commands)) {
        return [];
    }

    let rows = [];
    for(let it of commands) {
        if(!it || typeof it !== "object") {
            continue;
        }

        let id = it.command || it.id || it.name || "";
        if(!id) {
            let label = String(it.description || "")
                .split("\n")
                .map((s) => s.trim())
                .filter((s) => s.length > 0 && !/^[-=_]+$/.test(s))[0] || "";
            if(label) {
                rows.push({kind: "section", label: label});
            }
            continue;
        }

        let parameters = [];
        for(let p of (Array.isArray(it.parameters)? it.parameters:
                      (Array.isArray(it.schema)? it.schema: []))) {
            let param = normalize_field(p);
            if(param) {
                parameters.push(param);
            }
        }

        rows.push({
            kind:        "command",
            id:          id,
            alias:       Array.isArray(it.alias)? it.alias.slice(): [],
            flags:       normalize_flags(it.flag),
            description: it.description || "",
            usage:       it.usage || "",
            parameters:  parameters,
        });
    }

    return rows;
}

/************************************************************
 *  The trace levels, from either dialect.
 *
 *  C answers a dict {name: description} (`gobj_trace_level_list`),
 *  the browser hands over the `s_user_trace_level` array.
 ************************************************************/
function normalize_trace_levels(description)
{
    let src = description.trace_levels;
    if(src === undefined || src === null) {
        src = description.info_gclass_trace;
    }

    let rows = [];
    if(Array.isArray(src)) {
        for(let it of src) {
            if(!it) {
                continue;
            }
            if(typeof it === "string") {
                rows.push({id: it, description: ""});
            } else if(it.name || it.id) {
                rows.push({id: it.name || it.id, description: it.description || ""});
            }
        }
    } else if(src && typeof src === "object") {
        for(let key of Object.keys(src)) {
            rows.push({id: key, description: String(src[key] || "")});
        }
    }
    return rows;
}

/************************************************************
 *  A list of method names, defensively.
 ************************************************************/
function normalize_methods(methods)
{
    if(!Array.isArray(methods)) {
        return [];
    }
    return methods.filter((m) => typeof m === "string" && m.length > 0);
}

/************************************************************
 *  One cell of the matrix, or null where the state declares
 *  nothing for that event.
 *
 *  `has_action` and `action` are separate on purpose: a
 *  backend gclass has actions it cannot name.
 ************************************************************/
function normalize_cell(entry)
{
    let action = (typeof entry.action === "string")? entry.action: "";
    let named = (action.length > 0 && action !== C_ANONYMOUS_ACTION);

    return {
        action:     named? action: "",
        has_action: action.length > 0,
        next_state: entry.next_state || "",
    };
}

/************************************************************
 *  The machine: a matrix, the events nobody handles, and the
 *  states nothing declares a way into.
 *
 *  ROWS ARE EVENTS AND COLUMNS ARE STATES, not the other way
 *  round: a gclass almost always declares more events than
 *  states (12 against 3 in C_IEVENT_CLI, 86 commands and one
 *  state in c_agent), and a table grows better downwards than
 *  sideways.
 ************************************************************/
function build_fsm(fsm)
{
    fsm = fsm || {};

    let states_src = (fsm.states && typeof fsm.states === "object")? fsm.states: {};
    let state_names = Object.keys(states_src);

    /*
     *  Every event, in DECLARATION order -- which is the order the
     *  gclass author chose, and the only one that carries meaning.
     *  An event handled by a state but missing from the table is a
     *  defect in that gclass; it is appended rather than dropped, so
     *  the viewer shows it instead of hiding it.
     */
    let order = [];
    let flags_of = new Map();
    for(let ev of (Array.isArray(fsm.events)? fsm.events: [])) {
        if(!ev || !ev.event_name) {
            continue;
        }
        if(!flags_of.has(ev.event_name)) {
            order.push(ev.event_name);
        }
        flags_of.set(ev.event_name, normalize_flags(ev.event_flag));
    }

    let cells_of = new Map();       // event -> Map<state, cell>
    let incoming = new Set();       // states some transition names
    let counts = new Map();         // state -> how many events it handles

    for(let state of state_names) {
        let actions = Array.isArray(states_src[state])? states_src[state]: [];
        counts.set(state, actions.length);

        for(let entry of actions) {
            if(!entry || !entry.event_name) {
                continue;
            }
            if(!flags_of.has(entry.event_name)) {
                order.push(entry.event_name);
                flags_of.set(entry.event_name, []);
            }
            if(!cells_of.has(entry.event_name)) {
                cells_of.set(entry.event_name, new Map());
            }
            let cell = normalize_cell(entry);
            cells_of.get(entry.event_name).set(state, cell);
            if(cell.next_state) {
                incoming.add(cell.next_state);
            }
        }
    }

    let rows = [];
    let published = [];
    for(let event of order) {
        let by_state = cells_of.get(event);
        if(!by_state || by_state.size === 0) {
            /*
             *  Declared and handled nowhere: an OUTPUT event. It has no
             *  place in a matrix -- it is not handled, it is published --
             *  and leaving it in would draw one empty row per output
             *  event across every column.
             */
            published.push({event: event, flags: flags_of.get(event) || []});
            continue;
        }
        rows.push({
            event: event,
            flags: flags_of.get(event) || [],
            cells: state_names.map((state) => by_state.get(state) || null),
        });
    }

    /*
     *  A state nothing declares a way into. The first state is where
     *  the machine starts, so it needs none.
     *
     *  This is NOT always a defect: an action is free to jump with
     *  `gobj_change_state()`, and several do (C_IEVENT_CLI reaches
     *  ST_SESSION that way). The description cannot see inside an
     *  action, so the viewer marks the state instead of drawing it
     *  as dead -- the alternative is a picture in which the working
     *  half of a gclass looks unreachable.
     */
    let unreachable = state_names.filter(
        (state, i) => i > 0 && !incoming.has(state)
    );

    return {
        entry_state: state_names.length? state_names[0]: "",
        states: state_names.map((name) => ({
            name:  name,
            count: counts.get(name) || 0,
        })),
        rows:        rows,
        published:   published,
        unreachable: unreachable,
    };
}

/************************************************************
 *  The whole model.
 *
 *  A missing key is an EMPTY zone, never a thrown viewer: the
 *  two dialects do not carry the same keys, and a description
 *  can also arrive from an old backend.
 ************************************************************/
function gclass_view_model(description)
{
    if(!description || typeof description !== "object") {
        return null;
    }

    let instances = description.instances;

    return {
        id:               description.id || "",
        gcflag:           normalize_flags(description.gcflag),
        instances:        (typeof instances === "number")? instances: null,
        priv_size:        (typeof description.priv_size === "number")?
                            description.priv_size: null,
        attrs:            normalize_attrs(description.attrs),
        commands:         normalize_commands(description.commands),
        methods:          normalize_methods(description.gclass_methods),
        internal_methods: normalize_methods(description.internal_methods),
        trace_levels:     normalize_trace_levels(description),
        fsm:              build_fsm(description.FSM),
    };
}

export {
    normalize_flags,
    normalize_type,
    normalize_default,
    normalize_commands,
    normalize_trace_levels,
    build_fsm,
    gclass_view_model,
};
