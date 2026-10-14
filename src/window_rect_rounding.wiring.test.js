/***********************************************************************
 *          window_rect_rounding.wiring.test.js
 *
 *      A C_YUI_WINDOW with auto_save_size_and_position keeps its x, y,
 *      width and height (DTP_INTEGER) in localStorage. They came from
 *      getBoundingClientRect(), which answers fractions of a pixel under
 *      a zoom or a device pixel ratio: a fraction was saved, and written
 *      back into the integer attrs. They are whole pixels now, when they
 *      are saved (a move, a resize) and when they are restored -- an
 *      entry saved before with fractions still restores, rounded. (A
 *      value is read as its attribute's type, as the C kernel reads it:
 *      2.5 to an integer is refused.)
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
    gobj_start_up, gobj_create_yuno, gobj_create_service,
    gobj_start, gobj_read_attr,
    set_log_callback,
} = await import("@yuneta/gobj-js");
const {register_c_yui_window} = await import("./c_yui_window.js");

const logged = [];
let yuno = null;

const FRACTIONS = {x: 10.3, y: 20.7, width: 400.5, height: 300.2};
const ROUNDED = {x: 10, y: 21, width: 401, height: 300};

beforeAll(async () => {
    const i18next = (await import("i18next")).default;
    await i18next.init({lng: "en", resources: {}});
    gobj_start_up(null, null, null, null, null, null, null);
    set_log_callback((level, msg) => {
        logged.push({level: String(level), msg: String(msg)});
    });
    gclass_create("C_TEST_RECT_HOST", [], [["ST_IDLE", []]], {}, 0, [SDATA_END()], {}, 0, 0, 0, 0);
    register_c_yui_window();
    yuno = gobj_create_yuno("rect_yuno", "C_TEST_RECT_HOST", {});
    gobj_start(yuno);
});

function errors()
{
    return logged.filter((l) => l.level === "error").map((l) => l.msg);
}

function saved(name)
{
    return JSON.parse(window.localStorage.getItem(`${name}-rect`));
}

function attrs_rect(win)
{
    return {
        x: gobj_read_attr(win, "x"),
        y: gobj_read_attr(win, "y"),
        width: gobj_read_attr(win, "width"),
        height: gobj_read_attr(win, "height"),
    };
}

function press(win, selector, at, end)
{
    const $container = gobj_read_attr(win, "$container");
    $container.getBoundingClientRect = () => ({...FRACTIONS});
    const $el = $container.querySelector(selector);
    $el.dispatchEvent({
        type: "pointerdown", target: $el, offsetX: 0, offsetY: 0, ...at,
        stopPropagation() {}, preventDefault() {},
    });
    document.dispatchEvent({type: "pointerup", ...end, stopPropagation() {}, preventDefault() {}});
}

describe("the saved rect of a window is whole pixels", () => {
    test("an entry saved with fractions restores rounded", () => {
        window.localStorage.setItem("rect_old-rect", JSON.stringify({...FRACTIONS}));
        logged.length = 0;
        const win = gobj_create_service("rect_old", "C_YUI_WINDOW", {
            header: "old", body: ["div", {}, "old"], auto_save_size_and_position: true,
        }, yuno);
        gobj_start(win);
        expect(attrs_rect(win)).toEqual(ROUNDED);
        expect(errors()).toEqual([]);
    });

    test("an entry that is not a rect is said, and the window opens where it would", () => {
        window.localStorage.setItem("rect_bad-rect", JSON.stringify({x: 10, y: "20", width: 400}));
        logged.length = 0;
        const win = gobj_create_service("rect_bad", "C_YUI_WINDOW", {
            header: "bad", body: ["div", {}, "bad"], auto_save_size_and_position: true,
            x: 5, y: 6, width: 300, height: 200,
        }, yuno);
        gobj_start(win);
        expect(attrs_rect(win)).toEqual({x: 5, y: 6, width: 300, height: 200});
        const warned = logged.filter((l) => l.level === "warning" && l.msg.includes("rect_bad-rect"));
        expect(warned.length, "the bad entry is said").toBe(1);
        expect(errors()).toEqual([]);

        /*  No entry at all is nothing to say.  */
        logged.length = 0;
        const fresh = gobj_create_service("rect_none", "C_YUI_WINDOW", {
            header: "none", body: ["div", {}, "none"], auto_save_size_and_position: true,
        }, yuno);
        gobj_start(fresh);
        expect(logged.filter((l) => l.msg.includes("rect_none-rect"))).toEqual([]);
    });

    test("a move saves whole pixels, and writes them into the attrs", () => {
        const win = gobj_create_service("rect_move", "C_YUI_WINDOW", {
            header: "move", body: ["div", {}, "move"], auto_save_size_and_position: true,
        }, yuno);
        gobj_start(win);
        logged.length = 0;
        press(win, ".WINDOW_HEADER", {screenX: 0, screenY: 0}, {screenX: 5, screenY: 5});
        expect(saved("rect_move")).toEqual(ROUNDED);
        expect(attrs_rect(win)).toEqual(ROUNDED);
        expect(errors()).toEqual([]);
    });

    test("a resize saves whole pixels, and writes them into the attrs", () => {
        const win = gobj_create_service("rect_resize", "C_YUI_WINDOW", {
            header: "resize", body: ["div", {}, "resize"], auto_save_size_and_position: true,
            showFooter: false,  // the resize handle in the body: WINDOW_RESIZE
        }, yuno);
        gobj_start(win);
        logged.length = 0;
        press(win, ".WINDOW_RESIZE", {pageX: 0, pageY: 0}, {pageX: 5, pageY: 5});
        expect(saved("rect_resize")).toEqual(ROUNDED);
        expect(attrs_rect(win)).toEqual(ROUNDED);
        expect(errors()).toEqual([]);
    });
});
