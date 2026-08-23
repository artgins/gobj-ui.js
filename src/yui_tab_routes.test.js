/***********************************************************************
 *          yui_tab_routes.test.js
 *
 *      The two decisions a runtime-opened tab costs its url.
 *
 *      The split is here because of what it cost to find: a reload on
 *      a deep tab route answered with another tab's default for as
 *      long as nobody reloaded on one.
 *
 *      The position plan is here because the case that makes it
 *      non-trivial reads like a duplicate of the one above it: the
 *      root of the tab you are already in is not the same event as
 *      the root of a tab you are coming back to, and reading them as
 *      one breaks the view's own way out of a topic.
 ***********************************************************************/
import { describe, test, expect } from "vitest";
import {
    yui_tab_decode_id,
    yui_tab_split_subpath,
    yui_tab_position_plan,
} from "./yui_tab_routes.js";

const US = String.fromCharCode(31);   /*  the composite-id separator  */


describe("yui_tab_split_subpath", () => {
    test("a bare tab tail is all id", () => {
        expect(yui_tab_split_subpath("wattyzer")).toEqual({id: "wattyzer", tail: ""});
    });

    test("a deep tail keeps the id and hands the rest back", () => {
        expect(yui_tab_split_subpath("wattyzer/treedb_authzs/__graphs__"))
            .toEqual({id: "wattyzer", tail: "treedb_authzs/__graphs__"});
    });

    test("a composite id survives the url it travelled in", () => {
        /*  0x1F joins the two halves of these ids and reaches the url
         *  percent-encoded.  */
        expect(yui_tab_split_subpath("yunovatios-controlador%1F1630/treedb_authzs/__graphs__"))
            .toEqual({id: "yunovatios-controlador" + US + "1630",
                      tail: "treedb_authzs/__graphs__"});
    });

    test("an encoded slash inside the id stays inside the id", () => {
        /*  Which is why the WHOLE tail must not be decoded first: that
         *  would turn this %2F into a separator and cut the id in two.  */
        expect(yui_tab_split_subpath("a%2Fb/treedb_x"))
            .toEqual({id: "a/b", tail: "treedb_x"});
    });

    test("a malformed escape is taken as it came, not thrown", () => {
        expect(yui_tab_split_subpath("%E0%A4%A/treedb_x"))
            .toEqual({id: "%E0%A4%A", tail: "treedb_x"});
    });

    test("nothing in, nothing out", () => {
        expect(yui_tab_split_subpath("")).toEqual({id: "", tail: ""});
        expect(yui_tab_split_subpath(null)).toEqual({id: "", tail: ""});
        expect(yui_tab_split_subpath(undefined)).toEqual({id: "", tail: ""});
    });
});

describe("yui_tab_decode_id", () => {
    test("decodes, and survives what cannot be decoded", () => {
        expect(yui_tab_decode_id("a%2Fb")).toBe("a/b");
        expect(yui_tab_decode_id("%E0%A4%A")).toBe("%E0%A4%A");
        expect(yui_tab_decode_id("")).toBe("");
        expect(yui_tab_decode_id(null)).toBe("");
    });
});

const A = "/topics/db/conn1%1Fdb1";
const B = "/topics/db/conn1%1Fdb2";


describe("inside a tab", () => {
    test("a position is recorded, and nothing is replayed", () => {
        expect(yui_tab_position_plan(A, A, "users", "")).toEqual(
            {record: `${A}/users`, replay: null});
    });

    test("a deeper position is recorded whole", () => {
        expect(yui_tab_position_plan(A, A, "users/info", `${A}/users`)).toEqual(
            {record: `${A}/users/info`, replay: null});
    });

    test("arriving deep from ANOTHER tab records too — the url won", () => {
        expect(yui_tab_position_plan(B, A, "users", `${A}/roles`)).toEqual(
            {record: `${A}/users`, replay: null});
    });
});

describe("the root of the tab you were already in", () => {
    test("is the way OUT of a topic, so it records and never replays", () => {
        /*  The view's own "back to Topics" button lands here. Replaying
            the position would make that button do nothing at all.  */
        expect(yui_tab_position_plan(A, A, "", `${A}/users`)).toEqual(
            {record: A, replay: null});
    });
});

describe("the root of a tab you are coming back to", () => {
    test("replays what was left open", () => {
        expect(yui_tab_position_plan(B, A, "", `${A}/users`)).toEqual(
            {record: null, replay: `${A}/users`});
    });

    test("...including from OUTSIDE the tabs — the picker, the settings", () => {
        /*  The caller says "no tab" with an empty prev_base. It must, or a
         *  return from Select reads as the walk UP that records the root
         *  (and the tab comes back on its cards, its position gone).  */
        expect(yui_tab_position_plan("", A, "", `${A}/users`)).toEqual(
            {record: null, replay: `${A}/users`});
    });

    test("...and does nothing when the tab was left at its own root", () => {
        expect(yui_tab_position_plan(B, A, "", A)).toEqual({record: null, replay: null});
    });

    test("...or when it has never been visited", () => {
        expect(yui_tab_position_plan(B, A, "", "")).toEqual({record: null, replay: null});
        expect(yui_tab_position_plan("", A, "", undefined)).toEqual({record: null, replay: null});
    });
});

describe("edges", () => {
    test("no base is no decision", () => {
        expect(yui_tab_position_plan(A, "", "users", A)).toEqual({record: null, replay: null});
    });

    test("record and replay are never both set", () => {
        for(const args of [[A, A, "users", A], [A, A, "", A], [B, A, "", `${A}/x`],
                           [B, A, "", ""], ["", A, "", ""]]) {
            const plan = yui_tab_position_plan(...args);
            expect(!!(plan.record && plan.replay)).toBe(false);
        }
    });
});
