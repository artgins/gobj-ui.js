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
    gobj_start, gobj_read_attr, gobj_send_event, gobj_full_name,
    set_log_callback, set_strings_are_text,
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

        gobj_send_event(dock, "EV_MINIMIZE_WINDOW", {window: gobj_full_name(w)}, w);
        expect($w.style.getPropertyValue("display")).toBe("none");

        gobj_send_event(w, "EV_SHOW", {}, yuno);
        expect($w.style.getPropertyValue("display")).toBe("");
        expect(errors()).toEqual([]);
    });

    test("the dock's events carry the window's NAME, plain json; the gobj is the src", () => {
        const dock = gobj_create_service("name_dock", "C_YUI_WINDOW_MANAGER", {}, yuno);
        gobj_start(dock);
        const w = gobj_create_service("name_w", "C_YUI_WINDOW",
            {header: "w", body: ["div", {}, "w"], manager: dock}, yuno);
        gobj_start(w);
        const $w = gobj_read_attr(w, "$container");

        /*  What the window itself sent to register is json.  */
        expect(dock.priv.windows.some((e) => e.gobj === w)).toBe(true);

        /*  A name that is not the src's is refused, loudly.  */
        logged.length = 0;
        gobj_send_event(dock, "EV_MINIMIZE_WINDOW", {window: "someone^else"}, w);
        expect($w.style.getPropertyValue("display")).toBe("");
        expect(errors().some((m) => m.includes("is not the src"))).toBe(true);

        /*  The old form (the gobj in the kw) is refused since 7.26.14,
         *  even from the window itself.  */
        logged.length = 0;
        gobj_send_event(dock, "EV_MINIMIZE_WINDOW", {window: w}, w);
        expect($w.style.getPropertyValue("display")).toBe("");
        expect(errors().some((m) => m.includes("carries the window gobj"))).toBe(true);
    });

    test("with plain strings as TEXT (set_strings_are_text) the controls are still svg", () => {
        set_strings_are_text(true);
        try {
            logged.length = 0;
            const dock = gobj_create_service("strict_dock", "C_YUI_WINDOW_MANAGER", {}, yuno);
            gobj_start(dock);
            const w = gobj_create_service("strict_w", "C_YUI_WINDOW",
                {header: "w", body: ["div", {}, "w"], manager: dock}, yuno);
            gobj_start(w);
            const $w = gobj_read_attr(w, "$container");
            for(const cls of ["wc-min", "wc-max", "wc-close"]) {
                const $b = $w.querySelector(`.yui-wc.${cls}`);
                expect($b, cls).not.toBe(null);
                expect($b.textContent.includes("<svg"), cls).toBe(false);
                expect($b.querySelector("svg"), cls).not.toBe(null);
            }
            expect(logged.some((l) => l.msg.includes("html_markup"))).toBe(false);
        } finally {
            set_strings_are_text(false);
        }
    });

    test("only the window speaks for itself: a name or a gobj that is not the src is refused", () => {
        const dock = gobj_create_service("src_dock", "C_YUI_WINDOW_MANAGER", {}, yuno);
        gobj_start(dock);
        const w = gobj_create_service("src_w", "C_YUI_WINDOW",
            {header: "w", body: ["div", {}, "w"], manager: dock}, yuno);
        gobj_start(w);
        const other = gobj_create_service("src_other", "C_YUI_WINDOW",
            {header: "o", body: ["div", {}, "o"]}, yuno);
        gobj_start(other);
        const $w = gobj_read_attr(w, "$container");
        const n_windows = dock.priv.windows.length;

        for(const ev of ["EV_REGISTER_WINDOW", "EV_FOCUS_WINDOW", "EV_UNREGISTER_WINDOW", "EV_MINIMIZE_WINDOW"]) {
            /*  w's name, sent by another gobj.  */
            logged.length = 0;
            gobj_send_event(dock, ev, {window: gobj_full_name(w)}, other);
            expect(errors().some((m) => m.includes("is not the src"))).toBe(true);
            /*  The OLD form (the gobj in the kw), sent by another gobj.  */
            logged.length = 0;
            gobj_send_event(dock, ev, {window: w}, other);
            expect(errors().some((m) => m.includes("carries the window gobj"))).toBe(true);
        }
        expect(dock.priv.windows.length).toBe(n_windows);     // nothing unregistered
        expect(dock.priv.windows.some((e) => e.gobj === other)).toBe(false);  // nothing registered
        expect($w.style.getPropertyValue("display")).toBe("");                // nothing minimized
    });

    test("an inline-svg icon is the app's markup, in strict mode too", async () => {
        const {set_strings_are_text} = await import("@yuneta/gobj-js");
        set_strings_are_text(true);
        try {
            logged.length = 0;
            const dock = gobj_create_service("icon_dock", "C_YUI_WINDOW_MANAGER", {}, yuno);
            gobj_start(dock);
            const svg = '<svg viewBox="0 0 8 8"><rect width="8" height="8"/></svg>';
            const w = gobj_create_service("icon_w", "C_YUI_WINDOW",
                {title: "w", icon: svg, body: ["div", {}, "w"], manager: dock}, yuno);
            gobj_start(w);
            const $w = gobj_read_attr(w, "$container");
            expect($w.querySelector(".icon svg")).not.toBe(null);
            const $dock = gobj_read_attr(dock, "$container");
            expect($dock.querySelector(".yui-dock-icon svg")).not.toBe(null);
            expect(logged.filter((l) => l.msg.includes("html_markup"))).toEqual([]);
        } finally {
            set_strings_are_text(false);
        }
    });
});
