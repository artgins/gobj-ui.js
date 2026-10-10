/***********************************************************************
 *          window_show.wiring.test.js
 *
 *      EV_SHOW brings a C_YUI_WINDOW back in front of the reader. Its
 *      action was an empty stub, so the map's second click on the same
 *      marker -- which finds the marker's window by name and sends it
 *      EV_SHOW instead of opening a second one -- did nothing for a
 *      window that was minimized or covered.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {describe, test, expect, beforeAll} from "vitest";
import {install_dom_double} from "../test/dom_double.js";

install_dom_double();

if(typeof globalThis.matchMedia === "undefined") {
    globalThis.matchMedia = () => ({matches: false, addEventListener() {}, removeEventListener() {}});
}

const {
    SDATA_END, gclass_create,
    gobj_start_up, gobj_create_yuno, gobj_create, gobj_create_service,
    gobj_start, gobj_read_attr, gobj_send_event,
    set_log_callback,
} = await import("@yuneta/gobj-js");
const {register_c_yui_window} = await import("./c_yui_window.js");
const {register_c_yui_window_manager} = await import("./c_yui_window_manager.js");

const logged = [];
let yuno = null;

beforeAll(async () => {
    const i18next = (await import("i18next")).default;
    await i18next.init({lng: "en", resources: {}});
    gobj_start_up(null, null, null, null, null, null, null);
    set_log_callback((level, msg) => {
        logged.push({level: String(level), msg: String(msg)});
    });
    gclass_create("C_TEST_SHOW_HOST", [], [["ST_IDLE", []]], {}, 0, [SDATA_END()], {}, 0, 0, 0, 0);
    register_c_yui_window();
    register_c_yui_window_manager();
    yuno = gobj_create_yuno("show_yuno", "C_TEST_SHOW_HOST", {});
    gobj_start(yuno);
});

function errors()
{
    return logged.filter((l) => l.level === "error").map((l) => l.msg);
}

describe("EV_SHOW", () => {
    test("without a dock: a hidden window is shown, and goes on top of its layer", () => {
        const a = gobj_create_service("show_a", "C_YUI_WINDOW", {header: "a", body: ["div", {}, "a"]}, yuno);
        gobj_start(a);
        const b = gobj_create_service("show_b", "C_YUI_WINDOW", {header: "b", body: ["div", {}, "b"]}, yuno);
        gobj_start(b);
        const $a = gobj_read_attr(a, "$container");
        $a.style.setProperty("display", "none", "important");

        gobj_send_event(a, "EV_SHOW", {}, yuno);
        expect($a.style.getPropertyValue("display")).toBe("");
        expect($a.parentNode.lastChild).toBe($a);
        expect(errors()).toEqual([]);
    });

    test("with a dock: a minimized window comes back out of it", () => {
        const dock = gobj_create_service("show_dock", "C_YUI_WINDOW_MANAGER", {}, yuno);
        gobj_start(dock);
        const w = gobj_create_service("show_w", "C_YUI_WINDOW",
            {header: "w", body: ["div", {}, "w"], manager: dock}, yuno);
        gobj_start(w);
        const $w = gobj_read_attr(w, "$container");

        gobj_send_event(dock, "EV_MINIMIZE_WINDOW", {window: w}, w);
        expect($w.style.getPropertyValue("display")).toBe("none");

        gobj_send_event(w, "EV_SHOW", {}, yuno);
        expect($w.style.getPropertyValue("display")).toBe("");
        expect(errors()).toEqual([]);
    });
});
