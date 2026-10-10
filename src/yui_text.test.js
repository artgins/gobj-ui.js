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
const {text_node} = await import("./yui_text.js");
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
});
