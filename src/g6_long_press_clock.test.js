/***********************************************************************
 *          g6_long_press_clock.test.js
 *
 *      The long press of the G6 graphs is measured on a MONOTONIC clock
 *      (yunovatios REV-CLOUD.md V11.4 / V12.4). press_arbiter.test.js
 *      injects the time into classify_press(), so it passes whatever
 *      clock the handler reads; this drives the handler itself, with the
 *      wall clock set back an hour in the middle of the press -- an NTP
 *      step -- while the monotonic one moves on as a finger does.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {describe, test, expect, vi, afterEach} from "vitest";
import {install_dom_double} from "../test/dom_double.js";

install_dom_double();

const {CommonEvent} = await import("@antv/g6");
const {install_long_press_contextmenu} = await import("./g6_touch_gestures.js");
const {LONG_PRESS_MS} = await import("./press_arbiter.js");

afterEach(() => {
    vi.restoreAllMocks();
});

describe("the long press of a G6 graph and the clocks", () => {
    test("a wall clock set back mid-press does not turn a long press into a tap", () => {
        const handlers = {};
        const emitted = [];
        const graph = {
            on(name, fn) {
                handlers[name] = fn;
            },
            off() {
            },
            emit(name) {
                emitted.push(name);
            },
        };
        let mono = 1000;
        let wall = 1_800_000_000_000;
        vi.spyOn(performance, "now").mockImplementation(() => mono);
        vi.spyOn(Date, "now").mockImplementation(() => wall);

        install_long_press_contextmenu(graph, {});
        handlers[CommonEvent.POINTER_DOWN]({
            pointerType: "touch", client: {x: 10, y: 10}, targetType: "node"
        });
        mono += LONG_PRESS_MS + 100;      /*  the finger stays long enough  */
        wall -= 3600 * 1000;              /*  and the wall clock steps back  */
        handlers[CommonEvent.POINTER_UP]({client: {x: 10, y: 10}});

        expect(emitted).toContain(CommonEvent.CONTEXT_MENU);
    });
});
