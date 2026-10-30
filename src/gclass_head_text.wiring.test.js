/***********************************************************************
 *          gclass_head_text.wiring.test.js
 *
 *      The header of C_YUI_GCLASS shows what a REMOTE description says:
 *      the gclass name and the instance's current state are data, so
 *      they are text, never markup.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {describe, test, expect, beforeAll} from "vitest";
import {install_dom_double} from "../test/dom_double.js";

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
    gobj_start, gobj_read_attr,
    set_log_callback,
} = await import("@yuneta/gobj-js");
const {register_c_yui_gclass} = await import("./c_yui_gclass.js");

const EVIL = '<img src=x onerror="window.__pwned=1">';
let yuno = null;

beforeAll(async () => {
    const i18next = (await import("i18next")).default;
    await i18next.init({lng: "en", resources: {}});
    gobj_start_up(null, null, null, null, null, null, null);
    set_log_callback(() => {});
    gclass_create("C_TEST_GCLASS_HOST", [], [["ST_IDLE", []]], {}, 0, [SDATA_END()], {}, 0, 0, 0, 0);
    register_c_yui_gclass();
    yuno = gobj_create_yuno("gclass_head_yuno", "C_TEST_GCLASS_HOST", {});
    gobj_start(yuno);
});

describe("C_YUI_GCLASS header", () => {
    test("the gclass name and the current state are text", () => {
        const view = gobj_create("gclass_head", "C_YUI_GCLASS", {
            description: {id: EVIL, gcflag: [], attrs: [], commands: [],
                          gclass_methods: [], internal_methods: [],
                          FSM: {events: [], states: {}}},
            current_state: EVIL,
        }, yuno);
        gobj_start(view);
        const $c = gobj_read_attr(view, "$container");
        expect($c.querySelector(".GCLASS_NAME").textContent).toBe(EVIL);
        expect($c.querySelector(".GCLASS_CURRENT").textContent).toBe(EVIL);
        expect($c.querySelector("img")).toBe(null);
    });

    test("the method chips are text (V3.1 #4)", () => {
        const view = gobj_create("gclass_methods_text", "C_YUI_GCLASS", {
            description: {id: "C_X", gcflag: [], attrs: [], commands: [],
                          gclass_methods: [EVIL], internal_methods: [EVIL],
                          FSM: {events: [], states: {}}},
        }, yuno);
        gobj_start(view);
        const $c = gobj_read_attr(view, "$container");
        const chips = $c.querySelectorAll(".GCLASS_METHOD");
        expect(chips.length).toBe(2);
        for(const chip of chips) {
            expect(chip.textContent).toBe(EVIL);
        }
        expect($c.querySelector("img")).toBe(null);
    });

    test("the error of the raw dump is text (V3.1 #4)", () => {
        const description = {
            id: "C_X", gcflag: [], attrs: [], commands: [],
            gclass_methods: [], internal_methods: [],
            FSM: {events: [], states: {}},
            toJSON() {
                /*  A bare string thrown is what reaches the screen as is:
                 *  String() of an Error starts with "Error:", never "<".  */
                throw EVIL;
            },
        };
        const view = gobj_create("gclass_raw_error_text", "C_YUI_GCLASS", {
            description: description, view_mode: "raw",
        }, yuno);
        gobj_start(view);
        const $c = gobj_read_attr(view, "$container");
        const $err = $c.querySelector(".GCLASS_RAW_ERROR");
        expect($err).not.toBe(null);
        expect($err.textContent.includes(EVIL)).toBe(true);
        expect($c.querySelector("img")).toBe(null);
    });
});

