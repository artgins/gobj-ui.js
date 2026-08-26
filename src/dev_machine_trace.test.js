import {describe, it, expect} from "vitest";
import {
    machine_event_of,
    is_periodic_event,
    log_signature,
    log_is_periodic,
} from "./dev_machine_trace.js";

/*  Real lines, copied from the developer window.  */
const VERBOSE_IN =
    "🔄 mach(C_TIMER^demo_yuno), st: ST_IDLE, ev: EV_TIMEOUT, ac: fi(), from(C_TIMER^demo_yuno)";
const VERBOSE_RET =
    "<- mach(C_YUNO^demo_yuno), st: ST_IDLE, ev: EV_TIMEOUT_PERIODIC, ret: 0";
const VERBOSE_WORK =
    "🔄 mach(C_YUI_SHELL^shell), st: ST_IDLE, ev: EV_ROUTE_CHANGED, ac: ac_route(), from(C_YUI_NAV^nav)";
const COMPACT =
    "🔄 EV_TIMEOUT C_TIMER^demo_yuno ST_IDLE from C_TIMER^demo_yuno";
const STATE_CHANGE =
    "🔀🔀 mach(C_TCP^conn), new st(ST_CONNECTED), prev st(ST_WAIT_CONNECTED)";
const NOT_DEFINED =
    "📛 mach(C_X^x), st: ST_IDLE, ev: EV_TIMEOUT, 📛📛ERROR Event NOT DEFINED in state📛📛, from(C_TIMER^t)";

describe("machine_event_of", () => {
    it("reads the event out of the verbose format, both lines of it", () => {
        expect(machine_event_of(VERBOSE_IN)).toBe("EV_TIMEOUT");
        expect(machine_event_of(VERBOSE_RET)).toBe("EV_TIMEOUT_PERIODIC");
        expect(machine_event_of(VERBOSE_WORK)).toBe("EV_ROUTE_CHANGED");
    });

    it("reads it out of the compact format, where it leads the line", () => {
        expect(machine_event_of(COMPACT)).toBe("EV_TIMEOUT");
    });

    it("a state change carries no event, and says so", () => {
        expect(machine_event_of(STATE_CHANGE)).toBe("");
    });

    it("a line that merely MENTIONS an event is not a transition", () => {
        expect(machine_event_of("subscribed to EV_TIMEOUT of C_TIMER^t")).toBe("");
        expect(machine_event_of("cannot send EV_ON_OPEN")).toBe("");
    });

    it("is safe on anything that is not a line", () => {
        expect(machine_event_of("")).toBe("");
        expect(machine_event_of(null)).toBe("");
        expect(machine_event_of(undefined)).toBe("");
        expect(machine_event_of(42)).toBe("");
    });
});

describe("is_periodic_event", () => {
    it("names the events that arrive by themselves for ever", () => {
        expect(is_periodic_event("EV_TIMEOUT")).toBe(true);
        expect(is_periodic_event("EV_TIMEOUT_PERIODIC")).toBe(true);
        expect(is_periodic_event("EV_HEARTBEAT")).toBe(true);
        expect(is_periodic_event("EV_PING")).toBe(true);
    });

    it("leaves the ones a user caused alone", () => {
        expect(is_periodic_event("EV_ROUTE_CHANGED")).toBe(false);
        expect(is_periodic_event("EV_ON_MESSAGE")).toBe(false);
        expect(is_periodic_event("")).toBe(false);
        expect(is_periodic_event(null)).toBe(false);
    });
});

describe("log_signature", () => {
    it("signs a machine line by its EVENT, so a hundred of them are one thing", () => {
        expect(log_signature("debug", VERBOSE_IN)).toBe("mach:EV_TIMEOUT");
        expect(log_signature("debug", VERBOSE_RET)).toBe("mach:EV_TIMEOUT_PERIODIC");
        expect(log_signature("debug", COMPACT)).toBe("mach:EV_TIMEOUT");
    });

    it("signs everything else by its level, as before", () => {
        expect(log_signature("error", "connect failed")).toBe("log:error");
        expect(log_signature("debug", "hello")).toBe("log:debug");
        expect(log_signature("", "hello")).toBe("log:debug");
    });
});

describe("log_is_periodic", () => {
    it("hides the timer traffic the filter is for", () => {
        expect(log_is_periodic("debug", VERBOSE_IN)).toBe(true);
        expect(log_is_periodic("debug", VERBOSE_RET)).toBe(true);
        expect(log_is_periodic("debug", COMPACT)).toBe(true);
    });

    it("NEVER hides an error or a warning that names a timeout", () => {
        expect(log_is_periodic("error", NOT_DEFINED)).toBe(false);
        expect(log_is_periodic("warning", VERBOSE_RET)).toBe(false);
        expect(log_is_periodic("error", "connection timeout")).toBe(false);
    });

    it("leaves a transition somebody caused alone", () => {
        expect(log_is_periodic("debug", VERBOSE_WORK)).toBe(false);
        expect(log_is_periodic("debug", "just a log line")).toBe(false);
    });
});
