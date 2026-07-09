/***********************************************************************
 *          nav_cards_helpers.test.js
 *
 *      Unit tests for the pure "cards" layout descriptor builders.
 *      Descriptors are plain createElement2 arrays, so no DOM needed.
 ***********************************************************************/
import { test, expect } from "vitest";
import {
    card_descriptor,
    cards_grid_descriptor,
} from "./nav_cards_helpers.js";


/***************************************************************
 *  card_descriptor
 ***************************************************************/
test("card carries the nav item data-* contract", () => {
    let [tag, attrs, children] = card_descriptor(
        {id: "budgets", name: "budgets", icon: "wzi-coins", route: "/reports/budgets"},
        true
    );
    expect(tag).toBe("a");
    expect(attrs["data-item-id"]).toBe("budgets");
    expect(attrs["data-route"]).toBe("/reports/budgets");
    expect(attrs["data-disabled"]).toBe("0");
    expect(attrs.href).toBe("#/reports/budgets");
    expect(attrs["aria-label"]).toBe("budgets");
    expect(attrs["data-i18n-aria-label"]).toBe("budgets");
    expect(attrs.class).toContain("yui-nav-card");

    let [icon_tag, icon_attrs] = children[0];
    expect(icon_tag).toBe("span");
    expect(icon_attrs.class).toContain("icon");

    let [label_tag, label_attrs, label_text] = children[1];
    expect(label_tag).toBe("span");
    expect(label_attrs.i18n).toBe("budgets");
    expect(label_text).toBe("budgets");
});

test("card without icon renders label only", () => {
    let [, , children] = card_descriptor(
        {id: "x", name: "x label", route: "/x"},
        true
    );
    expect(children.length).toBe(1);
    expect(children[0][0]).toBe("span");
    expect(children[0][2]).toBe("x label");
});

test("show_label=false drops the label span", () => {
    let [, attrs, children] = card_descriptor(
        {id: "x", name: "x label", icon: "yi-gear", route: "/x"},
        false
    );
    expect(children.length).toBe(1);
    expect(children[0][1].class).toContain("icon");
    /*  aria still carries the name for icon-only cards. */
    expect(attrs["aria-label"]).toBe("x label");
});

test("disabled card is marked for the click handler and a11y", () => {
    let [, attrs] = card_descriptor(
        {id: "x", name: "x", route: "/x", disabled: true},
        true
    );
    expect(attrs["data-disabled"]).toBe("1");
    expect(attrs["aria-disabled"]).toBe("true");
    expect(attrs["tabindex"]).toBe("-1");
});

test("tooltip mirrors into title + data-i18n-title", () => {
    let [, attrs] = card_descriptor(
        {id: "x", name: "x", route: "/x", tooltip: "the tip"},
        true
    );
    expect(attrs.title).toBe("the tip");
    expect(attrs["data-i18n-title"]).toBe("the tip");
});

test("item without route degrades to inert href '#'", () => {
    let [, attrs] = card_descriptor({id: "x", name: "x"}, true);
    expect(attrs.href).toBe("#");
    expect(attrs["data-route"]).toBe("");
});


/***************************************************************
 *  cards_grid_descriptor
 ***************************************************************/
test("grid renders one card per navigable item", () => {
    let [tag, , cards] = cards_grid_descriptor(
        [
            {id: "a", name: "a", route: "/s/a"},
            {id: "b", name: "b", route: "/s/b"},
        ],
        true
    );
    expect(tag).toBe("div");
    expect(cards.length).toBe(2);
    expect(cards[0][1]["data-route"]).toBe("/s/a");
    expect(cards[1][1]["data-route"]).toBe("/s/b");
});

test("grid drops decorative items (same policy as tabs)", () => {
    let [, , cards] = cards_grid_descriptor(
        [
            {type: "header", name: "group"},
            {id: "a", name: "a", route: "/s/a"},
            {type: "divider"},
            {id: "b", name: "b", route: "/s/b"},
            null,
        ],
        true
    );
    expect(cards.length).toBe(2);
});

test("grid tolerates empty/missing items", () => {
    expect(cards_grid_descriptor([], true)[2].length).toBe(0);
    expect(cards_grid_descriptor(null, true)[2].length).toBe(0);
});
