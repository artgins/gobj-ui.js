/***********************************************************************
 *          window_icon_size.wiring.test.js
 *
 *      The glyphs of a window's title bar and of a dialog's header are
 *      the size of a toolbar's: YUI_TOOLBAR_ICON_SIZE (yui_toolbar_icon.js).
 *      A json cell of a treedb table opens in a C_YUI_WINDOW on a
 *      desktop and in a dialog of the shell on a phone, and a toolbar of
 *      20px sits right under either header.
 *
 *      Up to 7.32.8 the title icon took the 16px of the title, the
 *      minimize / maximize / close glyphs were drawn in a box of 15px
 *      (marks of 7.5 to 9.4px), and the back arrow and the close of a
 *      dialog took the 16px of its title.
 *
 *      Driven through the real gclasses on a document double.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {test, expect, beforeAll} from "vitest";
import {install_dom_double} from "../test/dom_double.js";

install_dom_double();

const {
    SDATA_END, gclass_create, gobj_start_up, gobj_create_yuno, gobj_create,
    gobj_create_service, gobj_start, gobj_read_attr,
} = await import("@yuneta/gobj-js");
const {register_c_yui_window} = await import("./c_yui_window.js");
const {register_c_yui_shell} = await import("./c_yui_shell.js");
const {yui_shell_show_modal} = await import("./shell_modals.js");
const {YUI_TOOLBAR_ICON_SIZE} = await import("./yui_toolbar_icon.js");

let yuno = null;
let shell = null;

beforeAll(async () => {
    const i18next = (await import("i18next")).default;
    await i18next.init({lng: "en", resources: {}});
    gobj_start_up(null, null, null, null, null, null, null);
    gclass_create("C_TEST_WIN_ICON_HOST", [], [["ST_IDLE", []]], {}, 0, [SDATA_END()], {}, 0, 0, 0, 0);
    register_c_yui_window();
    register_c_yui_shell();
    yuno = gobj_create_yuno("win_icon_yuno", "C_TEST_WIN_ICON_HOST", {});
    gobj_start(yuno);
    shell = gobj_create("win_icon_shell", "C_YUI_SHELL",
        {config: {shell: {}}, default_route: "/home"}, yuno);
    gobj_start(shell);
});

/*  The font size a glyph carries in its own style  */
function size_of($i)
{
    const m = /font-size:\s*([^;]+)/.exec(($i && $i.style.cssText) || "");
    return m ? m[1].trim() : "";
}

test("the icon of a window's title is the size of a toolbar's", () => {
    const w = gobj_create_service("win_icon_w", "C_YUI_WINDOW",
        {title: "keys", title_prefix: "raw_events", icon: "yi-code",
         body: ["div", {}, "w"]}, yuno);
    gobj_start(w);
    const $w = gobj_read_attr(w, "$container");
    const $i = $w.querySelector(".WINDOW_TITLE .icon i.yi-code");
    expect(size_of($i)).toBe(YUI_TOOLBAR_ICON_SIZE);
    expect($i.getAttribute("aria-hidden")).toBe("true");
});

test("the glyphs of minimize, maximize and close are drawn in a box of that size", () => {
    const css = document.getElementById("yui-window-style").textContent;
    expect(css).toContain(`.yui-wc svg { width: ${YUI_TOOLBAR_ICON_SIZE}; height: ${YUI_TOOLBAR_ICON_SIZE};`);
    expect(css).toContain(`.yui-window-title svg { width: ${YUI_TOOLBAR_ICON_SIZE}; height: ${YUI_TOOLBAR_ICON_SIZE};`);
    /*  One size on a phone too: the buttons grow there, not the glyphs.  */
    expect(css).not.toMatch(/\.yui-wc svg \{ width: \d+px/);
});

test("the back arrow and the close of a dialog are the size of a toolbar's", () => {
    const handle = yui_shell_show_modal(shell, document.createElement("div"),
        {dialog: true, title: "keys", logical_class: "ICON_SIZE_SHEET"});
    const $modal = document.querySelector(".ICON_SIZE_SHEET");
    expect(size_of($modal.querySelector(".MODAL_BACK i.yi-arrow-left"))).toBe(YUI_TOOLBAR_ICON_SIZE);
    expect(size_of($modal.querySelector(".MODAL_CLOSE i.yi-xmark"))).toBe(YUI_TOOLBAR_ICON_SIZE);
    handle.close();
});
