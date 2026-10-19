/***********************************************************************
 *          gclass_traces.wiring.test.js
 *
 *      C_YUI_GCLASS, the gclass viewer, as the gobj tree opens it for a
 *      BACKEND gclass: its trace levels can be set for every gobj of
 *      the gclass (`set-gclass-trace`), one box per level, the yuno's
 *      own scope shown locked; and the layout that came out of the
 *      review of 7.27.27 -- the short zones first, a long table capped,
 *      the instance named beside its state, the methods in the head.
 *
 *      The real gclass, hosted by a test gclass that declares what the
 *      viewer publishes.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {describe, test, expect, beforeAll, beforeEach} from "vitest";
import {install_dom_double, fake_event} from "../test/dom_double.js";

install_dom_double();

if(typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class {
        observe() {
        }
        unobserve() {
        }
        disconnect() {
        }
    };
}

const {
    SDATA_END, gclass_create,
    gobj_start_up, gobj_create_yuno, gobj_create,
    gobj_start, gobj_read_attr, gobj_send_event,
    set_log_callback,
} = await import("@yuneta/gobj-js");
const {register_c_yui_gclass} = await import("./c_yui_gclass.js");

const logged = [];
const asked = [];
let yuno = null;
let host = null;
let seq = 0;

/*  A C-dialect description: 25 attrs, a machine whose actions the
 *  backend does not name, one output event.  */
const DESCRIPTION = {
    id: "C_TCP",
    gcflag: [],
    instances: 4,
    attrs: Array.from({length: 25}, (_, i) => ({
        id: `attr_${i}`, type: "string", flag: "SDF_RD|SDF_REQUIRED",
        default_value: "", description: `attribute ${i}`
    })),
    commands: [],
    gclass_methods: ["mt_create", "mt_start"],
    internal_methods: [],
    FSM: {
        events: [
            {event_name: "EV_RX_DATA", event_flag: ""},
            {event_name: "EV_CONNECTED", event_flag: "EVF_OUTPUT_EVENT|EVF_PUBLIC_EVENT"},
        ],
        states: {
            ST_CONNECTED: [{event_name: "EV_RX_DATA", action: "action", next_state: ""}],
        },
    },
    info_gclass_trace: {traffic: "Trace dump traffic", connections: "Trace connections"},
};

/*  What the host read: `connections` on for the gclass, `machine` for
 *  the whole yuno (so get-gclass-trace answers it too).  */
const INFO = {
    gclass_levels: {traffic: "Trace dump traffic", connections: "Trace connections"},
    global_levels: {machine: "Trace machine", ev_kw: "Trace event keywords"},
    gclass_on: ["connections", "machine"],
    global_on: ["machine"],
    error: "",
};

function record(gobj, event, kw, src)
{
    asked.push({event: event, kw: kw});
    return 0;
}

beforeAll(async () => {
    const i18next = (await import("i18next")).default;
    await i18next.init({lng: "en", resources: {en: {translation: {
        "instances": "instances",
        "instances_one": "instance",
        "machine states": "{{count}} states",
        "machine states_one": "{{count}} state",
        "machine events": "{{count}} events",
        "machine events_one": "{{count}} event",
        "show all {{n}}": "show all {{n}}",
    }}}});
    gobj_start_up(null, null, null, null, null, null, null);
    set_log_callback((level, msg) => {
        logged.push({level: String(level), msg: String(msg)});
    });
    gclass_create("C_TEST_GCLASS_YUNO", [], [["ST_IDLE", []]], {}, 0,
        [SDATA_END()], {}, 0, 0, 0, 0);
    gclass_create("C_TEST_GCLASS_TRACES_HOST",
        [["EV_SET_GCLASS_TRACE", 0]],
        [["ST_IDLE", [["EV_SET_GCLASS_TRACE", record, null]]]],
        {}, 0, [SDATA_END()], {}, 0, 0, 0, 0);
    register_c_yui_gclass();
    yuno = gobj_create_yuno("gclass_traces_yuno", "C_TEST_GCLASS_YUNO", {});
    gobj_start(yuno);
    host = gobj_create("host", "C_TEST_GCLASS_TRACES_HOST", {}, yuno);
});

beforeEach(() => {
    logged.length = 0;
    asked.length = 0;
});

function problems()
{
    return logged.filter((l) => l.level === "error" || l.level === "warning").map((l) => l.msg);
}

function open(kw)
{
    const view = gobj_create(`gclass_view_${++seq}`, "C_YUI_GCLASS",
        Object.assign({description: DESCRIPTION}, kw || {}), host);
    gobj_start(view);
    return view;
}

function box_of(view, level)
{
    return gobj_read_attr(view, "$container").querySelectorAll(".GCLASS_TRACE_GCLASS")
        .find((b) => b.getAttribute("data-level") === level);
}

function visible_rows(view, zone)
{
    return gobj_read_attr(view, "$container")
        .querySelectorAll(`.GCLASS_ZONE[data-zone="${zone}"] tbody tr`)
        .filter((tr) => !tr.classList.contains("is-hidden")).length;
}

describe("C_YUI_GCLASS: the gclass' trace levels, set from the viewer", () => {
    test("one box per level, own and kernel, the yuno's locked", () => {
        const view = open({traces: {info: INFO, pending: false}});
        expect([box_of(view, "traffic").checked, box_of(view, "traffic").disabled]).toEqual([false, false]);
        expect([box_of(view, "connections").checked, box_of(view, "connections").disabled])
            .toEqual([true, false]);
        expect([box_of(view, "machine").checked, box_of(view, "machine").disabled]).toEqual([true, true]);
        expect([box_of(view, "ev_kw").checked, box_of(view, "ev_kw").disabled]).toEqual([false, false]);
        expect(problems()).toEqual([]);
    });

    test("a box asks the host, and the zone stays locked until it answers", () => {
        const view = open({traces: {info: INFO, pending: false}});
        const $b = box_of(view, "ev_kw");
        $b.checked = true;
        $b.dispatchEvent(fake_event("change"));
        expect(asked).toEqual([{event: "EV_SET_GCLASS_TRACE",
            kw: {gclass: "C_TCP", levels: ["ev_kw"], set: true}}]);
        expect(box_of(view, "traffic").disabled).toBe(true);

        gobj_send_event(view, "EV_SET_TRACES", {info: Object.assign({}, INFO,
            {gclass_on: ["connections", "machine", "ev_kw"]}), pending: false}, host);
        expect([box_of(view, "ev_kw").checked, box_of(view, "ev_kw").disabled]).toEqual([true, false]);
        expect(problems()).toEqual([]);
    });

    test("remove the traces of the gclass turns off its own, not the yuno's", () => {
        const view = open({traces: {info: INFO, pending: false}});
        gobj_read_attr(view, "$container").querySelector(".GCLASS_TRACES_CLEAR").click();
        expect(asked.map((a) => [a.kw.levels, a.kw.set])).toEqual([[["connections"], false]]);
        expect(problems()).toEqual([]);
    });

    test("with no host that can set them, the levels are only listed", () => {
        const view = open({});
        const $c = gobj_read_attr(view, "$container");
        expect($c.querySelectorAll(".GCLASS_TRACE_GCLASS").length).toBe(0);
        expect($c.querySelectorAll('.GCLASS_ZONE[data-zone="traces"] tbody tr').length).toBe(2);
        expect(problems()).toEqual([]);
    });
});

describe("C_YUI_GCLASS: the layout", () => {
    test("the short zones first, the long tables last, the methods in the head", () => {
        const view = open({});
        const $c = gobj_read_attr(view, "$container");
        expect($c.querySelectorAll(".GCLASS_ZONE").map((z) => z.getAttribute("data-zone")))
            .toEqual(["machine", "traces", "attrs", "commands"]);
        expect($c.querySelectorAll(".GCLASS_HEAD .GCLASS_METHOD").map((m) => m.textContent))
            .toEqual(["mt_create", "mt_start"]);
        expect($c.querySelector('.GCLASS_ZONE[data-zone="machine"] .GCLASS_ZONE_COUNT').textContent)
            .toBe("1 state · 1 event");
        expect($c.querySelector(".GCLASS_INSTANCES_LABEL").textContent).toBe("instances");
    });

    test("the state the reader came from is said with its instance", () => {
        const view = open({current_state: "ST_CONNECTED", instance_name: "tcp1"});
        const $c = gobj_read_attr(view, "$container");
        expect($c.querySelector(".GCLASS_CURRENT_INSTANCE").textContent).toBe("tcp1");
        expect($c.querySelector(".GCLASS_CURRENT_STATE").textContent).toBe("ST_CONNECTED");
    });

    test("an action the backend does not name has its own line in the legend", () => {
        const view = open({});
        const $c = gobj_read_attr(view, "$container");
        expect($c.querySelector(".GCLASS_LEGEND_SWATCH.is-unnamed")).not.toBe(null);
        /*  no empty cell is drawn, so no legend for one  */
        expect($c.querySelector(".GCLASS_LEGEND_SWATCH.is-none")).toBe(null);
        expect($c.querySelectorAll(".GCLASS_PUB_ROW").length).toBe(1);
    });

    test("a long table shows 20 rows and a button for the rest; a search shows every match", () => {
        const view = open({});
        const $c = gobj_read_attr(view, "$container");
        expect(visible_rows(view, "attrs")).toBe(20);
        const $more = $c.querySelector('.GCLASS_SHOW_ALL[data-zone="attrs"]');
        expect($more.classList.contains("is-hidden")).toBe(false);

        gobj_send_event(view, "EV_SEARCH", {text: "attr_24"}, view);
        expect(visible_rows(view, "attrs")).toBe(1);
        expect($more.classList.contains("is-hidden")).toBe(true);

        gobj_send_event(view, "EV_SEARCH", {text: ""}, view);
        expect(visible_rows(view, "attrs")).toBe(20);
        $more.click();
        expect(visible_rows(view, "attrs")).toBe(25);
        expect($more.classList.contains("is-hidden")).toBe(true);
        expect(problems()).toEqual([]);
    });
});
