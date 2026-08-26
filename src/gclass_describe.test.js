import {describe, it, expect, beforeAll} from "vitest";
import {
    SDATA,
    SDATA_END,
    SDATACM,
    data_type_t,
    event_flag_t,
    gclass_create,
    gclass_flag_t,
    sdata_flag_t,
} from "@yuneta/gobj-js";

import {bits2names, describe_local_gclass} from "./gclass_describe.js";

/*  A gclass with one of everything the viewer draws.  */
beforeAll(() => {
    const attrs_table = [
        SDATA(data_type_t.DTP_STRING, "title", sdata_flag_t.SDF_RD, "", "The title"),
        SDATA(data_type_t.DTP_INTEGER, "timeout",
            sdata_flag_t.SDF_WR|sdata_flag_t.SDF_PERSIST, 1000, "Timeout"),
        SDATA(data_type_t.DTP_POINTER, "$container", 0, null, "The DOM node"),
        SDATA_END(),
    ];
    const command_table = [
        SDATACM(data_type_t.DTP_STRING, "help", ["h"], [
            SDATA(data_type_t.DTP_STRING, "cmd", 0, "", "The command"),
            SDATA_END(),
        ], null, "Ask for help"),
        SDATA_END(),
    ];

    gclass_create(
        "C_TEST_DESCRIBE",
        [
            ["EV_GO",   0],
            ["EV_DONE", event_flag_t.EVF_OUTPUT_EVENT|event_flag_t.EVF_NO_WARN_SUBS],
        ],
        [
            ["ST_IDLE",    [["EV_GO", function ac_go() {}, "ST_WORKING"]]],
            ["ST_WORKING", [["EV_DONE", function ac_done() {}, "ST_IDLE"]]],
        ],
        {mt_create: function() {}, mt_start: function() {}},
        0,
        attrs_table,
        {},
        0,
        command_table,
        0,
        gclass_flag_t.gcflag_singleton
    );
});

describe("bits2names", () => {
    it("names every bit set, and nothing else", () => {
        expect(bits2names(sdata_flag_t,
            sdata_flag_t.SDF_RD|sdata_flag_t.SDF_PERSIST))
            .toEqual(["SDF_RD", "SDF_PERSIST"]);
        expect(bits2names(sdata_flag_t, 0)).toEqual([]);
    });
});

describe("describe_local_gclass", () => {
    it("an unregistered gclass is null, never an empty document", () => {
        expect(describe_local_gclass("C_NOT_THERE")).toBe(null);
        expect(describe_local_gclass("")).toBe(null);
    });

    it("answers the shape the backend view-gclass answers", () => {
        let g = describe_local_gclass("C_TEST_DESCRIBE");
        expect(Object.keys(g)).toEqual([
            "id", "gcflag", "attrs", "commands", "gclass_methods",
            "internal_methods", "FSM", "instances", "trace_levels",
        ]);
        expect(g.id).toBe("C_TEST_DESCRIBE");
        expect(g.gcflag).toEqual(["gcflag_singleton"]);
    });

    it("names the type and the flags of every attr", () => {
        let attrs = describe_local_gclass("C_TEST_DESCRIBE").attrs;
        expect(attrs.length).toBe(3);
        expect(attrs[0]).toEqual({
            id: "title",
            type: "DTP_STRING",
            flag: ["SDF_RD"],
            description: "The title",
            default_value: "",
        });
        expect(attrs[1].flag).toEqual(["SDF_WR", "SDF_PERSIST"]);
        expect(attrs[1].default_value).toBe(1000);
    });

    it("never prints a pointer default -- it names it", () => {
        let attrs = describe_local_gclass("C_TEST_DESCRIBE").attrs;
        let container = attrs.find(a => a.id === "$container");
        expect(container.type).toBe("DTP_POINTER");
        expect(container.default_value).toBe(null);
    });

    it("carries the commands with their parameters", () => {
        let cmds = describe_local_gclass("C_TEST_DESCRIBE").commands;
        expect(cmds.length).toBe(1);
        expect(cmds[0].id).toBe("help");
        expect(cmds[0].alias).toEqual(["h"]);
        expect(cmds[0].parameters.map(p => p.id)).toEqual(["cmd"]);
    });

    it("lists only the methods the gclass implements", () => {
        let g = describe_local_gclass("C_TEST_DESCRIBE");
        expect(g.gclass_methods).toEqual(["mt_create", "mt_start"]);
        expect(g.internal_methods).toEqual([]);
    });

    it("draws the FSM as events plus what each state does with them", () => {
        let fsm = describe_local_gclass("C_TEST_DESCRIBE").FSM;
        expect(fsm.events).toEqual([
            {event_name: "EV_GO", event_flag: []},
            {event_name: "EV_DONE",
             event_flag: ["EVF_NO_WARN_SUBS", "EVF_OUTPUT_EVENT"]},
        ]);
        expect(Object.keys(fsm.states)).toEqual(["ST_IDLE", "ST_WORKING"]);
        expect(fsm.states["ST_IDLE"]).toEqual([
            {event_name: "EV_GO", action: "ac_go", next_state: "ST_WORKING"},
        ]);
    });
});
