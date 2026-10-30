/***********************************************************************
 *          yui_badge.test.js
 *
 *      The badge shared by the toolbar items of C_YUI_SHELL and the
 *      menu items of C_YUI_NAV: what it shows for a value, which tones
 *      it takes, how it is drawn and how it is repainted. The text is a
 *      Text node, so a document double is installed.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {describe, test, expect, beforeAll, beforeEach} from "vitest";
import {install_dom_double} from "../test/dom_double.js";

install_dom_double();

const {createElement2, set_log_callback} = await import("@yuneta/gobj-js");
const {
    BADGE_TONES, badge_text, badge_tone, badge_node, paint_badge, name_control_with_badge,
} = await import("./yui_badge.js");

const logged = [];

beforeAll(() => {
    set_log_callback((level, msg) => {
        logged.push({level: String(level), msg: String(msg)});
    });
});

beforeEach(() => {
    logged.length = 0;
});

function errors()
{
    return logged.filter((l) => l.level === "error").map((l) => l.msg);
}

function tones_of($badge)
{
    return BADGE_TONES.filter((tone) => $badge.classList.contains(`is-${tone}`));
}


describe("badge_text", () => {
    test("empty is 0, '', null, false and undefined alike", () => {
        for(const v of [0, "", null, false, undefined, -3, NaN, Infinity, "   "]) {
            expect(badge_text(v), String(v)).toBe("");
        }
    });

    test("a count, capped at 99+, and a text passes through", () => {
        expect(badge_text(1)).toBe("1");
        expect(badge_text(99)).toBe("99");
        expect(badge_text(100)).toBe("99+");
        expect(badge_text(2.7)).toBe("2");
        expect(badge_text(" ! ")).toBe("!");
        expect(badge_text("3")).toBe("3");
    });
});

describe("badge_tone", () => {
    test("the six tones, and no tone, pass without a word", () => {
        expect(BADGE_TONES).toEqual(["danger", "warning", "info", "success", "primary", "link"]);
        for(const tone of BADGE_TONES) {
            expect(badge_tone(tone, "who")).toBe(tone);
        }
        expect(badge_tone(undefined, "who")).toBe("");
        expect(badge_tone(null, "who")).toBe("");
        expect(badge_tone("", "who")).toBe("");
        expect(errors()).toEqual([]);
    });

    test("an unknown one is logged, naming who asked, and answers the default", () => {
        expect(badge_tone("red", "C_TEST: item 'x'")).toBe("");
        expect(badge_tone("Danger", "C_TEST: item 'x'")).toBe("");
        expect(badge_tone(3, "C_TEST: item 'x'")).toBe("");
        let e = errors();
        expect(e.length).toBe(3);
        expect(e[0]).toContain("C_TEST: item 'x'");
        expect(e[0]).toContain("'red'");
    });
});

describe("badge_node", () => {
    test("the host's classes, its tone and its text as text; no live region of its own", () => {
        /*  It said "3" with no context, missed the first count while
         *  hidden, and was not in the tree inside a <button>: the shell
         *  says the change now.  */
        let $b = createElement2(badge_node(3, "warning", "X_BADGE yui-badge", "who"));
        expect($b.tagName).toBe("SPAN");
        expect($b.getAttribute("role")).toBe(null);
        expect($b.getAttribute("aria-live")).toBe(null);
        expect($b.hasAttribute("hidden")).toBe(false);
        expect([...$b.classList]).toEqual(["X_BADGE", "yui-badge", "is-warning"]);
        expect($b.textContent).toBe("3");
        expect($b.firstChild.nodeType).toBe(3);
    });

    test("empty: drawn all the same, hidden, so a setter can write into it", () => {
        let $b = createElement2(badge_node(0, "", "X_BADGE yui-badge", "who"));
        expect($b.hasAttribute("hidden")).toBe(true);
        expect($b.textContent).toBe("");
        expect(tones_of($b)).toEqual([]);
    });

    test("markup in a value is text", () => {
        let $b = createElement2(badge_node("<img src=x>", "", "X_BADGE", "who"));
        expect($b.children.length).toBe(0);
        expect($b.textContent).toBe("<img src=x>");
    });

    test("an unknown tone is logged and drawn with the default look", () => {
        let $b = createElement2(badge_node(3, "red", "X_BADGE", "C_TEST: item 'x'"));
        expect(tones_of($b)).toEqual([]);
        expect(errors().length).toBe(1);
    });
});

describe("paint_badge", () => {
    test("sets, changes and clears the tone, one at a time", () => {
        let $b = createElement2(badge_node(3, "danger", "X_BADGE", "who"));
        paint_badge($b, 3, "info");
        expect(tones_of($b)).toEqual(["info"]);
        paint_badge($b, 3, "");
        expect(tones_of($b)).toEqual([]);
        paint_badge($b, 3, "success");
        expect(tones_of($b)).toEqual(["success"]);
    });

    test("hides on empty, shows again on a count", () => {
        let $b = createElement2(badge_node(3, "", "X_BADGE", "who"));
        paint_badge($b, 0, "");
        expect($b.hasAttribute("hidden")).toBe(true);
        expect($b.textContent).toBe("");
        paint_badge($b, 150, "");
        expect($b.hasAttribute("hidden")).toBe(false);
        expect($b.textContent).toBe("99+");
    });

    test("the same text again, or only a new tone, does not rewrite the text", () => {
        let $b = createElement2(badge_node(5, "", "X_BADGE", "who"));
        let text = $b.firstChild;
        paint_badge($b, 5, "");
        paint_badge($b, 5, "warning");
        expect($b.firstChild).toBe(text);
        expect(tones_of($b)).toEqual(["warning"]);
        paint_badge($b, 6, "warning");
        expect($b.firstChild).not.toBe(text);
        expect($b.textContent).toBe("6");
    });
});

describe("name_control_with_badge", () => {
    /*  The count is part of the control's NAME: it is labelled by itself
     *  (its aria-label, re-translated by refresh_language) and by the
     *  badge -- "alarms 3" -- with nothing composed in javascript.  */
    test("the control is labelled by itself and by its badge", () => {
        let attrs = {"aria-label": "alarms", "data-i18n-aria-label": "alarms"};
        let badge = badge_node(3, "", "X_BADGE", "who");
        name_control_with_badge(attrs, badge);
        let $a = createElement2(["a", attrs, [badge]]);
        let $b = $a.firstElementChild;

        expect($a.id).toBeTruthy();
        expect($b.id).toBeTruthy();
        expect($a.getAttribute("aria-labelledby")).toBe(`${$a.id} ${$b.id}`);
        /*  The aria-label stays, and with its key: the self-reference reads it  */
        expect($a.getAttribute("aria-label")).toBe("alarms");
        expect($a.getAttribute("data-i18n-aria-label")).toBe("alarms");
    });

    test("an id the control has is kept, and every pair is its own", () => {
        let one = {id: "head-1", "aria-label": "a"};
        let two = {"aria-label": "b"};
        let b1 = badge_node(1, "", "X_BADGE", "who");
        let b2 = badge_node(2, "", "X_BADGE", "who");
        name_control_with_badge(one, b1);
        name_control_with_badge(two, b2);
        expect(one.id).toBe("head-1");
        expect(one["aria-labelledby"]).toBe(`head-1 ${b1[1].id}`);
        expect(two.id).not.toBe(one.id);
        expect(b2[1].id).not.toBe(b1[1].id);
    });
});
