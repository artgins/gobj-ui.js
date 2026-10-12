/***********************************************************************
 *          nav_backbar_name.wiring.test.js
 *
 *      The back arrow of a C_YUI_NAV `backbar` is a control, and a
 *      control is named twice -- `title` and `aria-label` -- each through
 *      t() and each with its key. With no `nav_label` it took the literal
 *      "back" as its aria-label: no t(), no key, so it read "back" in
 *      every language and no locale could change that; with one, it
 *      carried the raw key until something re-translated it, and no
 *      title at all.
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
    gobj_read_attr, refresh_language,
} = await import("@yuneta/gobj-js");
const {register_c_yui_nav} = await import("./c_yui_nav.js");

let i18next = null;
let yuno = null;
let seq = 0;

beforeAll(async () => {
    i18next = (await import("i18next")).default;
    await i18next.init({lng: "es", resources: {
        es: {translation: {"back": "Atrás", "settings": "Ajustes"}},
        en: {translation: {"back": "Back", "settings": "Settings"}},
    }});
    gobj_start_up(null, null, null, null, null, null, null);
    gclass_create("C_TEST_NAV_HOST", [], [["ST_IDLE", []]], {}, 0, [SDATA_END()], {}, 0, 0, 0, 0);
    register_c_yui_nav();
    yuno = gobj_create_yuno("nav_backbar_yuno", "C_TEST_NAV_HOST", {});
});

/*  The back arrow of a new backbar  */
function back_arrow(kw)
{
    const nav = gobj_create(`backbar_${++seq}`, "C_YUI_NAV",
        Object.assign({layout: "backbar", back_route: "/home"}, kw), yuno);
    const $container = gobj_read_attr(nav, "$container");
    return {$container, $a: $container.querySelector(".yui-nav-back")};
}

function names($a)
{
    return {
        title: $a.getAttribute("title"),
        aria: $a.getAttribute("aria-label"),
        title_key: $a.getAttribute("data-i18n-title"),
        aria_key: $a.getAttribute("data-i18n-aria-label"),
    };
}

test("with no nav_label it is named \"back\", translated, with its keys", () => {
    const {$a} = back_arrow({});
    expect(names($a)).toEqual({title: "Atrás", aria: "Atrás", title_key: "back", aria_key: "back"});
});

test("with a nav_label it is named by it, translated, with its keys", () => {
    const {$a} = back_arrow({nav_label: "settings"});
    expect(names($a)).toEqual({title: "Ajustes", aria: "Ajustes", title_key: "settings", aria_key: "settings"});
});

test("a language change renames it", async () => {
    const {$container, $a} = back_arrow({});
    await i18next.changeLanguage("en");
    try {
        refresh_language($container, i18next.t.bind(i18next));
        expect(names($a)).toEqual({title: "Back", aria: "Back", title_key: "back", aria_key: "back"});
    } finally {
        await i18next.changeLanguage("es");
    }
});
