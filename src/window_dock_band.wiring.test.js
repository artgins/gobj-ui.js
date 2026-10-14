/***********************************************************************
 *          window_dock_band.wiring.test.js
 *
 *      A FLOATING dock sits above every window, at a corner of the
 *      viewport. A window that fills the screen -- the sheet a window
 *      becomes on a phone, a maximized one on a laptop -- went under
 *      it: at a bottom corner the dock covered the foot of the window,
 *      at a top corner its ✕ and its minimize. The dock says the band
 *      it keeps (`--yui-dock-inset-top` / `--yui-dock-inset-bottom` on
 *      the root element), and a full-screen window leaves it free.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {describe, test, expect, beforeAll, beforeEach, afterEach} from "vitest";
import {install_dom_double} from "../test/dom_double.js";

install_dom_double();

const {
    SDATA_END, gclass_create,
    gobj_start_up, gobj_create_yuno, gobj_create_service,
    gobj_start, gobj_stop, gobj_destroy, gobj_read_attr,
    set_log_callback,
} = await import("@yuneta/gobj-js");
const {register_c_yui_window} = await import("./c_yui_window.js");
const {register_c_yui_window_manager} = await import("./c_yui_window_manager.js");

const logged = [];
let yuno = null;
let seq = 0;

const TOP = "var(--yui-dock-inset-top, 0px)";
const BOTTOM = "var(--yui-dock-inset-bottom, 0px)";

function errors()
{
    return logged.filter((l) => l.level === "error").map((l) => l.msg);
}

function root_style()
{
    return document.documentElement.style;
}

/*  A dock, drawn where a browser would draw it: `height` px high, at
 *  12px from the edge of its corner.  */
function open_dock(attrs, height)
{
    const dock = gobj_create_service(`band_dock${++seq}`, "C_YUI_WINDOW_MANAGER",
        Object.assign({dock_mode: "floating"}, attrs || {}), yuno);
    gobj_start(dock);
    const $dock = gobj_read_attr(dock, "$container");
    $dock.getBoundingClientRect = function() {
        const vh = window.innerHeight;
        const top_corner = this.classList.contains("yui-dock--top-left") ||
                           this.classList.contains("yui-dock--top-right");
        const shown = !this.classList.contains("is-empty") && this.isConnected !== false;
        if(!shown) {
            return {x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0};
        }
        const top = top_corner ? 12 : vh - 12 - height;
        return {x: 12, y: top, top: top, left: 12, right: 212, bottom: top + height,
                width: 200, height: height};
    };
    return dock;
}

function open_window(dock, attrs)
{
    const win = gobj_create_service(`band_win${++seq}`, "C_YUI_WINDOW", Object.assign({
        title: "demo window",
        body: ["div", {}, "body"],
        manager: dock,
    }, attrs || {}), yuno);
    gobj_start(win);
    return win;
}

function close(gobj)
{
    gobj_stop(gobj);
    gobj_destroy(gobj);
}

beforeAll(async () => {
    const i18next = (await import("i18next")).default;
    await i18next.init({lng: "en", resources: {}});
    gobj_start_up(null, null, null, null, null, null, null);
    set_log_callback((level, msg) => {
        logged.push({level: String(level), msg: String(msg)});
    });
    gclass_create("C_TEST_BAND_HOST", [], [["ST_IDLE", []]], {}, 0, [SDATA_END()], {}, 0, 0, 0, 0);
    register_c_yui_window();
    register_c_yui_window_manager();
    yuno = gobj_create_yuno("band_yuno", "C_TEST_BAND_HOST", {});
    gobj_start(yuno);
});

beforeEach(() => {
    logged.length = 0;
    window.innerWidth = 1280;
    window.innerHeight = 800;
});

afterEach(() => {
    window.innerWidth = 1280;
    window.innerHeight = 800;
    expect(errors()).toEqual([]);
});

describe("the floating dock says the band it keeps", () => {
    test("at a bottom corner, while it shows a window; none once it is empty", () => {
        const dock = open_dock({dock_corner: "bottom-left"}, 40);
        expect(root_style().getPropertyValue("--yui-dock-inset-bottom")).toBe("");

        const win = open_window(dock);
        expect(root_style().getPropertyValue("--yui-dock-inset-bottom")).toBe("52px");
        expect(root_style().getPropertyValue("--yui-dock-inset-top")).toBe("");

        close(win);
        expect(root_style().getPropertyValue("--yui-dock-inset-bottom")).toBe("");
        close(dock);
    });

    test("at a top corner, the top band; and the dock that goes takes its band", () => {
        const dock = open_dock({dock_corner: "top-right"}, 40);
        const win = open_window(dock);
        expect(root_style().getPropertyValue("--yui-dock-inset-top")).toBe("52px");
        expect(root_style().getPropertyValue("--yui-dock-inset-bottom")).toBe("");

        close(dock);
        expect(root_style().getPropertyValue("--yui-dock-inset-top")).toBe("");
        close(win);
    });

    test("an inline dock keeps no band: it is in the layout", () => {
        const $zone = document.createElement("div");
        $zone.className = "BAND_ZONE";
        document.body.appendChild($zone);
        const dock = open_dock({dock_mode: "inline", inline_selector: ".BAND_ZONE"}, 40);
        const win = open_window(dock);
        expect(root_style().getPropertyValue("--yui-dock-inset-bottom")).toBe("");
        expect(root_style().getPropertyValue("--yui-dock-inset-top")).toBe("");
        close(win);
        close(dock);
        $zone.remove();
    });
});

describe("a window that fills the screen leaves the band free", () => {
    test("the sheet of a phone", () => {
        window.innerWidth = 390;
        window.innerHeight = 844;
        const dock = open_dock({dock_corner: "bottom-right"}, 40);
        const win = open_window(dock);
        const $c = gobj_read_attr(win, "$container");

        expect($c.classList.contains("is-mobile-sheet")).toBe(true);
        expect($c.style.top).toBe(TOP);
        expect($c.style.height).toBe(`calc(844px - ${TOP} - ${BOTTOM})`);

        /*  And again when the viewport changes.  */
        window.innerHeight = 744;
        window.dispatchEvent({type: "resize"});
        expect($c.style.top).toBe(TOP);
        expect($c.style.height).toBe(`calc(744px - ${TOP} - ${BOTTOM})`);
        close(win);
        close(dock);
    });

    test("a maximized window of a laptop", () => {
        const dock = open_dock({dock_corner: "bottom-left"}, 40);
        const win = open_window(dock, {center: false, x: 40, y: 50, width: 500, height: 300});
        const $c = gobj_read_attr(win, "$container");

        $c.querySelector(".WINDOW_MAX").click();
        expect($c.style.top).toBe(TOP);
        expect($c.style.left).toBe("0px");
        expect($c.style.width).toBe("1280px");
        expect($c.style.height).toBe(`calc(800px - ${TOP} - ${BOTTOM})`);

        window.innerHeight = 700;
        window.dispatchEvent({type: "resize"});
        expect($c.style.height).toBe(`calc(700px - ${TOP} - ${BOTTOM})`);
        close(win);
        close(dock);
    });
});
