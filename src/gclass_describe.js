/***********************************************************************
 *          gclass_describe.js
 *
 *          A gclass, as plain JSON, in the shape the BACKEND answers.
 *
 *          There is no gclass viewer in the framework: the C kernel
 *          answers `view-gclass` with `gclass2json()`
 *          (`kernel/c/gobj-c/src/gobj.c`) and nothing draws it. This
 *          module builds the same document for a gclass of the BROWSER
 *          yuno, out of the gobj-js registry, so one viewer can show a
 *          gclass of either side:
 *
 *              {id, gcflag, attrs, commands, gclass_methods,
 *               internal_methods, FSM: {events, states}}
 *
 *          Two keys the backend does not carry are added at the end,
 *          because the browser can answer them for free and the reader
 *          asks them first: `instances` and `trace_levels`.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {
    data_type_t,
    sdata_flag_t,
    event_flag_t,
    gclass_flag_t,
    gclass_find_by_name,
} from "@yuneta/gobj-js";


/***************************************************************
 *              Bit tables
 ***************************************************************/
const DATA_TYPE_NAMES = {
    [data_type_t.DTP_STRING]:  "DTP_STRING",
    [data_type_t.DTP_BOOLEAN]: "DTP_BOOLEAN",
    [data_type_t.DTP_INTEGER]: "DTP_INTEGER",
    [data_type_t.DTP_REAL]:    "DTP_REAL",
    [data_type_t.DTP_LIST]:    "DTP_LIST",
    [data_type_t.DTP_DICT]:    "DTP_DICT",
    [data_type_t.DTP_JSON]:    "DTP_JSON",
    [data_type_t.DTP_POINTER]: "DTP_POINTER",
};

/************************************************************
 *  The names of the bits set in `bits`, in table order.
 ************************************************************/
function bits2names(table, bits)
{
    let names = [];
    let value = Number(bits) || 0;

    for(let name of Object.keys(table)) {
        if((value & table[name]) !== 0) {
            names.push(name);
        }
    }
    return names;
}

/************************************************************
 *  The name of a data type. An unknown type is reported as
 *  the number it is -- silently drawing "DTP_STRING" for a
 *  type nobody registered would be worse than saying "17".
 ************************************************************/
function data_type_name(type)
{
    return DATA_TYPE_NAMES[type] || String(type);
}

/************************************************************
 *  One SDATA descriptor -> one row.
 *
 *  A DTP_POINTER default is a live object (a DOM node, a
 *  gobj): it is never printed, only named, because a viewer
 *  that serializes it would either throw or dump the page.
 ************************************************************/
function sdatadesc2json(it)
{
    let row = {
        id:          it.name,
        type:        data_type_name(it.type),
        flag:        bits2names(sdata_flag_t, it.flag),
        description: it.description || "",
    };

    if(it.type === data_type_t.DTP_POINTER) {
        row.default_value = (it.default_value === null ||
            it.default_value === undefined)? null: "<pointer>";
    } else {
        row.default_value = (it.default_value === undefined)?
            null: it.default_value;
    }

    return row;
}

/************************************************************
 *  The attrs table of a gclass.
 ************************************************************/
function attrs2json(attrs_table)
{
    let rows = [];
    if(!Array.isArray(attrs_table)) {
        return rows;
    }
    for(let it of attrs_table) {
        if(!it || !it.name) {
            continue;   /*  SDATA_END()  */
        }
        rows.push(sdatadesc2json(it));
    }
    return rows;
}

/************************************************************
 *  The command table of a gclass, with the parameters of
 *  each command (the `schema` slot of SDATACM).
 ************************************************************/
function commands2json(command_table)
{
    let rows = [];
    if(!Array.isArray(command_table)) {
        return rows;
    }
    for(let it of command_table) {
        if(!it || !it.name) {
            continue;   /*  SDATA_END()  */
        }
        let row = {
            id:          it.name,
            alias:       it.alias || [],
            description: it.description || "",
        };
        if(Array.isArray(it.schema)) {
            row.parameters = attrs2json(it.schema);
        }
        rows.push(row);
    }
    return rows;
}

/************************************************************
 *  The methods the gclass actually implements. A table of
 *  every possible one, mostly empty, tells the reader nothing.
 ************************************************************/
function methods2json(mt)
{
    let names = [];
    if(!mt || typeof mt !== "object") {
        return names;
    }
    for(let key of Object.keys(mt)) {
        if(typeof mt[key] === "function") {
            names.push(key);
        }
    }
    return names;
}

/************************************************************
 *  The FSM: the events the gclass declares, and what each
 *  state does with them.
 ************************************************************/
function fsm2json(gclass)
{
    let events = [];
    for(let ev of (gclass.dl_events || [])) {
        events.push({
            event_name: ev.event_name,
            event_flag: bits2names(event_flag_t, ev.event_flag),
        });
    }

    let states = {};
    for(let st of (gclass.dl_states || [])) {
        let actions = [];
        for(let ac of (st.dl_actions || [])) {
            actions.push({
                event_name: ac.event_name,
                action:     ac.action? (ac.action.name || "action"): "",
                next_state: ac.next_state || "",
            });
        }
        states[st.state_name] = actions;
    }

    return {events: events, states: states};
}

/************************************************************
 *  The description of a gclass REGISTERED IN THIS BROWSER YUNO,
 *  or null when the registry does not know that name.
 *
 *  Null is the answer for a gclass of a BACKEND yuno too: the
 *  browser registry carries the GUI gclasses and nothing else,
 *  so the caller asks the backend `view-gclass` for those and
 *  shows whatever it answers -- this same shape.
 ************************************************************/
function describe_local_gclass(gclass_name)
{
    if(!gclass_name) {
        return null;
    }

    let gclass = gclass_find_by_name(gclass_name, false);
    if(!gclass) {
        return null;
    }

    return {
        id:               gclass.gclass_name,
        gcflag:           bits2names(gclass_flag_t, gclass.gclass_flag),
        attrs:            attrs2json(gclass.attrs_table),
        commands:         commands2json(gclass.command_table),
        gclass_methods:   methods2json(gclass.gmt),
        internal_methods: methods2json(gclass.lmt),
        FSM:              fsm2json(gclass),
        instances:        Number(gclass.instances) || 0,
        trace_levels:     Array.isArray(gclass.s_user_trace_level)?
                            gclass.s_user_trace_level: [],
    };
}

export {
    bits2names,
    data_type_name,
    attrs2json,
    commands2json,
    methods2json,
    fsm2json,
    describe_local_gclass,
};
