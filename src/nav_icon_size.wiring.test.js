/***********************************************************************
 *          nav_icon_size.wiring.test.js
 *
 *      The glyph of a tab and of a menu entry of C_YUI_NAV is the size
 *      of the glyphs of a toolbar: YUI_TOOLBAR_ICON_SIZE (yui_toolbar.js).
 *      Up to 7.32.6 a tab and a menu entry took the 16px of their text,
 *      and right under a toolbar of 20px their icons read as smaller.
 *      The icon bar and the cards are other bands: they keep their own
 *      size. The close mark of a tab is no icon of the tab: it keeps
 *      its own size too.
 *
 *      Driven through the real gclass on a document double.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {test, expect, beforeAll} from "vitest";
import {install_dom_double} from "../test/dom_double.js";

install_dom_double();

const {
    SDATA_END, gclass_create, gobj_start_up, gobj_create_yuno, gobj_create,
    gobj_read_attr,
} = await import("@yuneta/gobj-js");
const {register_c_yui_nav} = await import("./c_yui_nav.js");
const {YUI_TOOLBAR_ICON_SIZE} = await import("./yui_toolbar.js");

let yuno = null;
let seq = 0;

beforeAll(async () => {
    const i18next = (await import("i18next")).default;
    await i18next.init({lng: "en", resources: {en: {translation: {}}}});
    gobj_start_up(null, null, null, null, null, null, null);
    gclass_create("C_TEST_NAV_ICON_HOST", [], [["ST_IDLE", []]], {}, 0, [SDATA_END()], {}, 0, 0, 0, 0);
    register_c_yui_nav();
    yuno = gobj_create_yuno("nav_icon_size_yuno", "C_TEST_NAV_ICON_HOST", {});
});

const ITEMS = [
    {id: "topics", name: "topics", route: "/topics", icon: "yi-table", closable: true},
    {id: "graphs", name: "graphs", route: "/graphs", icon: "yi-hexagon-nodes", badge: 2},
];

/*  The container of a new C_YUI_NAV of this layout  */
function nav_container(kw)
{
    const nav = gobj_create(`nav_icon_${++seq}`, "C_YUI_NAV",
        Object.assign({menu_items: ITEMS}, kw), yuno);
    return gobj_read_attr(nav, "$container");
}

/*  The font size each glyph of the items carries in its own style  */
function glyph_sizes($container, selector)
{
    return $container.querySelectorAll(selector).map(($i) => {
        const m = /font-size:\s*([^;]+)/.exec($i.style.cssText || "");
        return m ? m[1].trim() : "";
    });
}

test("a tab's glyph is the size of a toolbar's", () => {
    const $c = nav_container({layout: "tabs"});
    expect(glyph_sizes($c, "i.yi-table")).toEqual([YUI_TOOLBAR_ICON_SIZE]);
    expect(glyph_sizes($c, "i.yi-hexagon-nodes")).toEqual([YUI_TOOLBAR_ICON_SIZE]);
});

test("the close mark of a tab keeps its own size", () => {
    const $c = nav_container({layout: "tabs"});
    expect(glyph_sizes($c, "i.yi-xmark")).toEqual([""]);
});

test("a menu entry's glyph is the size of a toolbar's", () => {
    const $c = nav_container({layout: "vertical"});
    expect(glyph_sizes($c, "i.yi-table")).toEqual([YUI_TOOLBAR_ICON_SIZE]);
    expect(glyph_sizes($c, "i.yi-hexagon-nodes")).toEqual([YUI_TOOLBAR_ICON_SIZE]);
});

test("the back arrow of a backbar is the size of a toolbar's", () => {
    const $c = nav_container({layout: "backbar", back_route: "/home"});
    expect(glyph_sizes($c, "i.yi-arrow-left")).toEqual([YUI_TOOLBAR_ICON_SIZE]);
});

test("the icon bar keeps its own size", () => {
    const $c = nav_container({layout: "icon-bar"});
    expect(glyph_sizes($c, "i.yi-table")).toEqual([""]);
});

test("the glyph is decoration: the control carries the name", () => {
    const $c = nav_container({layout: "tabs"});
    const $i = $c.querySelector("i.yi-table");
    expect($i.getAttribute("aria-hidden")).toBe("true");
});
