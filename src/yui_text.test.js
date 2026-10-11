/***********************************************************************
 *          yui_text.test.js
 *
 *      Data goes into createElement2() as a Text node: a string that
 *      starts with '<' is parsed as markup there.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {describe, test, expect} from "vitest";
import {install_dom_double} from "../test/dom_double.js";

install_dom_double();

const {createElement2} = await import("@yuneta/gobj-js");
const {
    SDATA_END, gclass_create, gobj_start_up, gobj_create_yuno, gobj_create,
    gobj_read_attr, set_log_callback
} = await import("@yuneta/gobj-js");
const {text_node, text_title_formatter} = await import("./yui_text.js");
const {register_c_yui_nav} = await import("./c_yui_nav.js");
const {card_descriptor} = await import("./nav_cards_helpers.js");

const EVIL = "<img src=x onerror=alert(1)>";

describe("text_node()", () => {
    test("a value that looks like markup stays text", () => {
        const $el = createElement2(["span", {}, text_node(EVIL)]);
        expect($el.querySelector("img")).toBe(null);
        expect($el.textContent).toBe(EVIL);
    });

    test("trimmed like a string content, and null is empty", () => {
        expect(text_node("  a  ").textContent).toBe("a");
        expect(text_node(null).textContent).toBe("");
        expect(text_node(0).textContent).toBe("0");
    });

    test("a nav card named by a backend (set_submenu) shows its name as text", () => {
        const $card = createElement2(card_descriptor({id: "x", name: EVIL, route: "/x"}, true));
        expect($card.querySelector("img")).toBe(null);
        expect($card.textContent).toContain(EVIL);
    });

    test("a Tabulator column titled from a schema `header` shows it as text", () => {
        const $title = text_title_formatter({getValue: () => EVIL});
        expect($title instanceof Text).toBe(true);
        expect($title.textContent).toBe(EVIL);
    });

    test("the accordion nav shows a section named by a backend as text", async () => {
        const i18next = (await import("i18next")).default;
        await i18next.init({lng: "en", resources: {}});
        gobj_start_up(null, null, null, null, null, null, null);
        set_log_callback(() => {});
        gclass_create("C_TEST_TEXT_HOST", [], [["ST_IDLE", []]], {}, 0, [SDATA_END()], {}, 0, 0, 0, 0);
        register_c_yui_nav();
        const yuno = gobj_create_yuno("text_yuno", "C_TEST_TEXT_HOST", {});
        const nav = gobj_create("acc", "C_YUI_NAV", {
            layout: "accordion",
            menu_items: [{id: "h", name: EVIL, submenu: {items: [{id: "s", name: EVIL, route: "/s"}]}}]
        }, yuno);
        const $c = gobj_read_attr(nav, "$container");
        expect($c.querySelector("img")).toBe(null);
        expect($c.querySelector(".yui-accordion-head").textContent).toBe(EVIL);
    });
});
