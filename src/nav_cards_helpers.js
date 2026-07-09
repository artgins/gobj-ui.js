/***********************************************************************
 *          nav_cards_helpers.js
 *
 *      Pure descriptor builders for C_YUI_NAV's "cards" layout — a
 *      grid of tappable cards, one per item, used as the section-index
 *      landing of a submenu (list → detail pattern).  Split out of
 *      c_yui_nav.js so it can be unit-tested without a DOM: the
 *      functions return createElement2 node descriptors, never
 *      HTMLElements.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/

/************************************************************
 *  Descriptor of one card: an <a> carrying the same data-*
 *  contract as every other nav item (data-route/data-item-id/
 *  data-disabled), so C_YUI_NAV's delegated click handler and
 *  active-route highlight work unchanged.
 ************************************************************/
export function card_descriptor(it, show_label)
{
    let children = [];
    let label = it.name || "";

    if(it.icon) {
        children.push(["span", {class: "icon is-medium"},
            ["i", {class: it.icon, "aria-hidden": "true"}]]);
    }
    if(show_label && label) {
        children.push(["span", {class: "yui-nav-label", i18n: label}, label]);
    }

    let a_attrs = {
        class: "yui-nav-item yui-nav-card",
        href: it.route ? "#" + it.route : "#",
        "data-item-id": it.id,
        "data-route": it.route || "",
        "data-disabled": it.disabled ? "1" : "0",
        "aria-label": label || it.id
    };
    if(label) {
        a_attrs["data-i18n-aria-label"] = label;
    }
    let tip = it.tooltip || it.aria_label;
    if(tip) {
        a_attrs.title = tip;
        a_attrs["data-i18n-title"] = tip;
    }
    if(it.disabled) {
        a_attrs["aria-disabled"] = "true";
        a_attrs["tabindex"] = "-1";
    }
    return ["a", a_attrs, children];
}

/************************************************************
 *  Descriptor of the whole grid.  Decorative items (`header`/
 *  `divider`) are dropped, same policy as the tabs layout.
 ************************************************************/
export function cards_grid_descriptor(items, show_label)
{
    let cards = [];
    for(let it of (items || [])) {
        if(!it || it.type === "header" || it.type === "divider") {
            continue;
        }
        cards.push(card_descriptor(it, show_label));
    }
    return ["div", {}, cards];
}
