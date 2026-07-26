/***********************************************************************
 *          shell_toolbar_helpers.test.mjs
 *
 *      Unit tests for the pure toolbar helpers used by C_YUI_SHELL.
 *      Run with: node --test tests/
 ***********************************************************************/
import { test, expect } from "vitest";
import {
    TOOLBAR_ITEM_KINDS,
    TOOLBAR_ACTION_TYPES,
    classify_toolbar_item,
    validate_toolbar_item,
    validate_action,
    validate_dropdown_action,
} from "./shell_toolbar_helpers.js";


/*============================================================
 *      classify_toolbar_item
 *============================================================*/
test("classify: legacy item without 'type' is 'action'", () => {
    expect(classify_toolbar_item({ id: "home", icon: "yi-home" })).toBe("action");
});

test("classify: type:'brand' classifies as 'brand'", () => {
    expect(classify_toolbar_item({ id: "b", type: "brand", logo: "/x.svg", wordmark: "X" })).toBe("brand");
});

test("classify: type:'avatar' classifies as 'avatar'", () => {
    expect(classify_toolbar_item({ id: "u", type: "avatar" })).toBe("avatar");
});

test("classify: type:'connection' classifies as 'connection'", () => {
    expect(classify_toolbar_item({ id: "conn", type: "connection" })).toBe("connection");
});

test("validate: bad context_action surfaces a warning", () => {
    let r = validate_toolbar_item({
        id: "conn", type: "connection",
        context_action: { type: "bogus" }
    });
    expect(r.ok).toBe(false);
    expect(r.warnings.some(w => w.includes("unknown action.type"))).toBeTruthy();
});

test("classify: unknown type falls back to 'action'", () => {
    expect(classify_toolbar_item({ id: "?", type: "phantom" })).toBe("action");
});

test("classify: null/undefined are 'action'", () => {
    expect(classify_toolbar_item(null)).toBe("action");
    expect(classify_toolbar_item(undefined)).toBe("action");
});


/*============================================================
 *      validate_toolbar_item — brand
 *============================================================*/
test("validate brand: ok with logo + wordmark", () => {
    let r = validate_toolbar_item({
        id: "brand", type: "brand",
        logo: "/wm.svg", wordmark: "Wattyzer",
        action: { type: "navigate", route: "/welcome" }
    });
    expect(r.ok).toBe(true);
    expect(r.warnings).toEqual([]);
});

test("validate brand: missing logo flags warning", () => {
    let r = validate_toolbar_item({
        id: "brand", type: "brand", wordmark: "X"
    });
    expect(r.ok).toBe(false);
    expect(r.warnings.join("\n")).toMatch(/requires 'logo'/);
});

test("validate brand: missing wordmark flags warning", () => {
    let r = validate_toolbar_item({
        id: "brand", type: "brand", logo: "/x.svg"
    });
    expect(r.ok).toBe(false);
    expect(r.warnings.join("\n")).toMatch(/requires 'wordmark'/);
});

test("validate brand: empty-string fields count as missing", () => {
    let r = validate_toolbar_item({
        id: "brand", type: "brand", logo: "  ", wordmark: ""
    });
    expect(r.ok).toBe(false);
    expect(r.warnings.length).toBe(2);
});


/*============================================================
 *      validate_toolbar_item — avatar
 *============================================================*/
test("validate avatar: ok with no extra fields", () => {
    let r = validate_toolbar_item({ id: "user", type: "avatar" });
    expect(r.ok).toBe(true);
});

test("validate avatar: ok with dropdown action", () => {
    let r = validate_toolbar_item({
        id: "user", type: "avatar",
        action: {
            type: "dropdown",
            items: [
                { id: "p", name: "Profile",
                  action: { type: "navigate", route: "/me" } }
            ]
        }
    });
    expect(r.ok).toBe(true);
});


/*============================================================
 *      validate_action
 *============================================================*/
test("action: navigate without route flags warning", () => {
    let w = validate_action({ type: "navigate" }, "x");
    expect(w.join("\n")).toMatch(/requires 'route'/);
});

test("action: event without event name flags warning", () => {
    let w = validate_action({ type: "event" }, "x");
    expect(w.join("\n")).toMatch(/requires 'event'/);
});

test("action: unknown action.type flags warning", () => {
    let w = validate_action({ type: "teleport" }, "x");
    expect(w.join("\n")).toMatch(/unknown action\.type/);
});

test("action: missing type flags warning", () => {
    let w = validate_action({}, "x");
    expect(w.join("\n")).toMatch(/action without 'type'/);
});

test("action: drawer with op only is accepted", () => {
    let w = validate_action({ type: "drawer", op: "toggle" }, "x");
    expect(w).toEqual([]);
});


/*============================================================
 *      validate_dropdown_action
 *============================================================*/
test("dropdown: missing items[] flags warning", () => {
    let w = validate_dropdown_action({ type: "dropdown" }, "user");
    expect(w.join("\n")).toMatch(/requires items\[\]/);
});

test("dropdown: empty items[] flags warning", () => {
    let w = validate_dropdown_action({ type: "dropdown", items: [] }, "user");
    expect(w.join("\n")).toMatch(/empty items\[\]/);
});

test("dropdown: dividers are accepted without action", () => {
    let w = validate_dropdown_action({
        type: "dropdown",
        items: [
            { id: "p", name: "Profile",
              action: { type: "navigate", route: "/me" } },
            { type: "divider" },
            { id: "out", name: "Logout",
              action: { type: "event", event: "EV_LOGOUT" } }
        ]
    }, "user");
    expect(w).toEqual([]);
});

test("dropdown: sub-item without action flags warning", () => {
    let w = validate_dropdown_action({
        type: "dropdown",
        items: [{ id: "x", name: "X" }]
    }, "user");
    expect(w.join("\n")).toMatch(/requires an action object/);
});

test("dropdown: nested dropdowns rejected", () => {
    let w = validate_dropdown_action({
        type: "dropdown",
        items: [{
            id: "x", name: "X",
            action: { type: "dropdown", items: [] }
        }]
    }, "user");
    expect(w.join("\n")).toMatch(/nested dropdowns are not supported/);
});

test("dropdown: invalid sub-action surfaces underlying warning", () => {
    let w = validate_dropdown_action({
        type: "dropdown",
        items: [{ id: "x", name: "X", action: { type: "navigate" } }]
    }, "user");
    expect(w.join("\n")).toMatch(/requires 'route'/);
});


/*============================================================
 *      Constants exported are stable
 *============================================================*/
test("kinds + action-type constants are exposed", () => {
    expect(TOOLBAR_ITEM_KINDS).toEqual(["brand", "avatar", "connection", "action"]);
    expect(TOOLBAR_ACTION_TYPES).toEqual(["navigate", "drawer", "event", "dropdown"]);
});


/*============================================================
 *      dropdown items: selected + image  (5.2.0)
 *============================================================*/
test("dropdown: 'selected' and 'image' are accepted", () => {
    let r = validate_dropdown_action({
        type: "dropdown",
        items: [
            { id: "es", name: "spanish", image: "data:image/svg+xml,%3Csvg/%3E",
              selected: true, action: { type: "navigate", route: "/language/set/es" } },
            { id: "en", name: "english", image: "data:image/svg+xml,%3Csvg/%3E",
              selected: false, action: { type: "navigate", route: "/language/set/en" } },
        ],
    }, "language");
    expect(r).toEqual([]);
});

test("dropdown: declaring both icon and image warns", () => {
    let r = validate_dropdown_action({
        type: "dropdown",
        items: [
            { id: "es", name: "spanish", icon: "yi-language", image: "/es.svg",
              action: { type: "navigate", route: "/language/set/es" } },
        ],
    }, "language");
    expect(r.length).toBe(1);
    expect(r[0]).toContain("both icon and image");
});

test("dropdown: non-boolean 'selected' warns", () => {
    let r = validate_dropdown_action({
        type: "dropdown",
        items: [
            { id: "es", name: "spanish", selected: "yes",
              action: { type: "navigate", route: "/language/set/es" } },
        ],
    }, "language");
    expect(r.length).toBe(1);
    expect(r[0]).toContain("non-boolean");
});
