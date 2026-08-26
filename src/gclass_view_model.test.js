import {describe, it, expect} from "vitest";

import {
    normalize_flags,
    normalize_type,
    normalize_default,
    normalize_commands,
    normalize_trace_levels,
    build_fsm,
    gclass_view_model,
} from "./gclass_view_model.js";


/*
 *  C_IEVENT_CLI as the C kernel answers it (`gclass2json()`), cut to
 *  what the model reads. Its FSM is the interesting one: three states,
 *  an output event handled nowhere, and ST_SESSION reached only from
 *  inside an action with gobj_change_state().
 */
const C_DIALECT = {
    id: "C_IEVENT_CLI",
    gcflag: [],
    priv_size: 312,
    attrs: [
        {id: "url", type: "string", default_value: "", flag: "SDF_PERSIST",
         description: "Url to connect"},
        {id: "timeout_idack", type: "integer", default_value: "5000", flag: "SDF_RD",
         description: "timeout waiting idAck"},
        {id: "subscriber", type: "pointer", default_value: "", flag: "",
         description: "subscriber of output-events"},
    ],
    commands: [],
    gclass_methods: ["mt_create", "mt_start", "mt_stop"],
    internal_methods: [],
    info_gclass_trace: {
        "ievents": "Trace inter-events with metadata of kw",
        "identity-card": "Trace identity_card messages",
    },
    instances: 4,
    FSM: {
        events: [
            {event_name: "EV_ON_MESSAGE", event_flag: ""},
            {event_name: "EV_ON_OPEN", event_flag: "EVF_OUTPUT_EVENT|EVF_NO_WARN_SUBS"},
            {event_name: "EV_ON_CLOSE", event_flag: "EVF_OUTPUT_EVENT|EVF_NO_WARN_SUBS"},
            {event_name: "EV_ON_ID_NAK", event_flag: "EVF_OUTPUT_EVENT"},
        ],
        states: {
            "ST_DISCONNECTED": [
                {event_name: "EV_ON_OPEN", action: "action",
                 next_state: "ST_WAIT_IDENTITY_CARD_ACK"},
            ],
            "ST_WAIT_IDENTITY_CARD_ACK": [
                {event_name: "EV_ON_MESSAGE", action: "action", next_state: ""},
                {event_name: "EV_ON_CLOSE", action: "action",
                 next_state: "ST_DISCONNECTED"},
            ],
            "ST_SESSION": [
                {event_name: "EV_ON_MESSAGE", action: "action", next_state: ""},
                {event_name: "EV_ON_CLOSE", action: "action",
                 next_state: "ST_DISCONNECTED"},
            ],
        },
    },
};

/*  The same gclass as the browser registry describes it.  */
const JS_DIALECT = {
    id: "C_YUI_JSON",
    gcflag: ["gcflag_no_check_output_events"],
    attrs: [
        {id: "title", type: "DTP_STRING", flag: ["SDF_RD"], default_value: "",
         description: "Optional header title"},
        {id: "$container", type: "DTP_POINTER", flag: [], default_value: null,
         description: "HTMLElement root"},
    ],
    commands: [
        {id: "help", alias: ["h"], description: "Command's help",
         parameters: [
             {id: "cmd", type: "DTP_STRING", flag: [], default_value: "",
              description: "The command"},
         ]},
    ],
    gclass_methods: ["mt_create", "mt_start"],
    internal_methods: [],
    trace_levels: [{name: "rows", description: "Trace rendered rows"}],
    instances: 0,
    FSM: {
        events: [
            {event_name: "EV_SET_JSON", event_flag: []},
            {event_name: "EV_EXPAND_PATH",
             event_flag: ["EVF_OUTPUT_EVENT", "EVF_NO_WARN_SUBS"]},
        ],
        states: {
            "ST_EMPTY": [
                {event_name: "EV_SET_JSON", action: "ac_set_json",
                 next_state: "ST_READY"},
            ],
            "ST_READY": [
                {event_name: "EV_SET_JSON", action: "ac_set_json", next_state: ""},
            ],
        },
    },
};


describe("normalize_flags", () => {
    it("splits the C string form", () => {
        expect(normalize_flags("SDF_WR|SDF_PERSIST")).toEqual(["SDF_WR", "SDF_PERSIST"]);
    });
    it("keeps the browser array form", () => {
        expect(normalize_flags(["SDF_RD"])).toEqual(["SDF_RD"]);
    });
    it("answers a list for nothing at all", () => {
        expect(normalize_flags("")).toEqual([]);
        expect(normalize_flags(undefined)).toEqual([]);
        expect(normalize_flags(0)).toEqual([]);
    });
});

describe("normalize_type", () => {
    it("shortens the browser form", () => {
        expect(normalize_type("DTP_STRING")).toBe("string");
    });
    it("lowers the C form", () => {
        expect(normalize_type("integer")).toBe("integer");
    });
    it("reports an unknown type as what it is", () => {
        expect(normalize_type(17)).toBe("17");
        expect(normalize_type(undefined)).toBe("");
    });
});

describe("normalize_default", () => {
    it("spells out a null pointer instead of drawing an empty cell", () => {
        expect(normalize_default(null)).toBe("null");
    });
    it("leaves a missing default empty", () => {
        expect(normalize_default(undefined)).toBe("");
    });
    it("prints a json default", () => {
        expect(normalize_default({a: 1})).toBe('{"a":1}');
    });
});

describe("normalize_commands", () => {
    it("reads the C command key and the browser id key", () => {
        expect(normalize_commands([{command: "view-channels"}])[0].id)
            .toBe("view-channels");
        expect(normalize_commands([{id: "help"}])[0].id).toBe("help");
    });

    it("turns a nameless C row into a section heading", () => {
        const rows = normalize_commands([
            {command: "help", description: "Command's help"},
            {command: "", description: "\nOperation\n-----------"},
            {command: "enable-channel", description: "Enable channel."},
        ]);
        expect(rows.map((r) => r.kind))
            .toEqual(["command", "section", "command"]);
        expect(rows[1].label).toBe("Operation");
    });

    it("drops a nameless row that says nothing", () => {
        expect(normalize_commands([{command: "", description: ""}])).toEqual([]);
    });

    it("reads parameters from either key", () => {
        const c = normalize_commands([
            {command: "x", parameters: [{parameter: "channel_name", type: "string"}]},
        ]);
        expect(c[0].parameters[0].id).toBe("channel_name");
        const js = normalize_commands([
            {id: "y", schema: [{id: "cmd", type: "DTP_STRING"}]},
        ]);
        expect(js[0].parameters[0].id).toBe("cmd");
    });
});

describe("normalize_trace_levels", () => {
    it("reads the C dict", () => {
        expect(normalize_trace_levels({info_gclass_trace: {a: "A"}}))
            .toEqual([{id: "a", description: "A"}]);
    });
    it("reads the browser array", () => {
        expect(normalize_trace_levels({trace_levels: [{name: "rows", description: "R"}]}))
            .toEqual([{id: "rows", description: "R"}]);
    });
    it("answers a list when there are none", () => {
        expect(normalize_trace_levels({})).toEqual([]);
    });
});

describe("build_fsm", () => {
    const fsm = build_fsm(C_DIALECT.FSM);

    it("puts the events in the rows and the states in the columns", () => {
        expect(fsm.states.map((s) => s.name)).toEqual([
            "ST_DISCONNECTED", "ST_WAIT_IDENTITY_CARD_ACK", "ST_SESSION",
        ]);
        expect(fsm.rows.map((r) => r.event)).toEqual([
            "EV_ON_MESSAGE", "EV_ON_OPEN", "EV_ON_CLOSE",
        ]);
        expect(fsm.rows[0].cells.length).toBe(3);
    });

    it("leaves a cell null where the state declares nothing", () => {
        const on_open = fsm.rows.find((r) => r.event === "EV_ON_OPEN");
        expect(on_open.cells[0].next_state).toBe("ST_WAIT_IDENTITY_CARD_ACK");
        expect(on_open.cells[1]).toBe(null);
        expect(on_open.cells[2]).toBe(null);
    });

    it("keeps an event out of the matrix when no state handles it", () => {
        expect(fsm.published.map((p) => p.event)).toEqual(["EV_ON_ID_NAK"]);
        expect(fsm.published[0].flags).toEqual(["EVF_OUTPUT_EVENT"]);
    });

    it("says an action exists without inventing its name", () => {
        expect(fsm.rows[0].cells[1]).toEqual({
            action: "", has_action: true, next_state: "",
        });
    });

    it("keeps the action name when the browser gives one", () => {
        const js = build_fsm(JS_DIALECT.FSM);
        expect(js.rows[0].cells[0].action).toBe("ac_set_json");
    });

    it("marks a state nothing declares a way into", () => {
        expect(fsm.unreachable).toEqual(["ST_SESSION"]);
        expect(fsm.entry_state).toBe("ST_DISCONNECTED");
    });

    it("never marks the entry state", () => {
        const one = build_fsm({events: [], states: {"ST_IDLE": []}});
        expect(one.unreachable).toEqual([]);
    });

    it("counts what each state handles", () => {
        expect(fsm.states.map((s) => s.count)).toEqual([1, 2, 2]);
    });

    it("shows an event a state handles but the table forgot to declare", () => {
        const orphan = build_fsm({
            events: [],
            states: {"ST_IDLE": [{event_name: "EV_GHOST", action: "ac_x", next_state: ""}]},
        });
        expect(orphan.rows.map((r) => r.event)).toEqual(["EV_GHOST"]);
        expect(orphan.rows[0].flags).toEqual([]);
    });

    it("survives a gclass with no machine at all", () => {
        const none = build_fsm(undefined);
        expect(none.states).toEqual([]);
        expect(none.rows).toEqual([]);
        expect(none.published).toEqual([]);
    });
});

describe("gclass_view_model", () => {
    it("reads the C dialect whole", () => {
        const m = gclass_view_model(C_DIALECT);
        expect(m.id).toBe("C_IEVENT_CLI");
        expect(m.instances).toBe(4);
        expect(m.priv_size).toBe(312);
        expect(m.attrs[0]).toEqual({
            id: "url", type: "string", flags: ["SDF_PERSIST"],
            default_value: "", description: "Url to connect",
        });
        expect(m.trace_levels.map((r) => r.id)).toEqual(["ievents", "identity-card"]);
        expect(m.commands).toEqual([]);
    });

    it("reads the browser dialect whole", () => {
        const m = gclass_view_model(JS_DIALECT);
        expect(m.gcflag).toEqual(["gcflag_no_check_output_events"]);
        expect(m.attrs[1].default_value).toBe("null");
        expect(m.commands[0].parameters[0].id).toBe("cmd");
        expect(m.methods).toEqual(["mt_create", "mt_start"]);
        expect(m.instances).toBe(0);
    });

    it("answers null for nothing", () => {
        expect(gclass_view_model(null)).toBe(null);
        expect(gclass_view_model("C_TIMER")).toBe(null);
    });

    it("draws empty zones for a description missing keys", () => {
        const m = gclass_view_model({id: "C_BARE"});
        expect(m.attrs).toEqual([]);
        expect(m.commands).toEqual([]);
        expect(m.trace_levels).toEqual([]);
        expect(m.instances).toBe(null);
        expect(m.fsm.rows).toEqual([]);
    });
});
