import {describe, it, expect} from "vitest";

import {row_matches, is_fkey_ref} from "./yui_row_search.js";

describe("row_matches", () => {
    const row = {
        id: "E22003089",
        name: "",
        place: [
            {
                id: "es.madrid.bm-madrid-fuencarral-m-av.local-13-torno",
                topic_name: "places",
                hook_name: "devices"
            }
        ],
        tension: 400,
        enabled: true,
        _operation: "hidden",
        __md_treedb__: {topic_name: "devices"}
    };

    it("finds a plain field", () => {
        expect(row_matches(row, "e22003089")).toBe(true);
    });

    it("finds a number", () => {
        expect(row_matches(row, "400")).toBe(true);
    });

    it("finds a value INSIDE an fkey, which is the whole point", () => {
        expect(row_matches(row, "local-13-torno")).toBe(true);
    });

    it("does NOT match the structural halves of an fkey", () => {
        /*  `topic_name`/`hook_name` are the same two words on every row:
         *  matching them turns the term into a wildcard.  */
        expect(row_matches(row, "places")).toBe(false);
        expect(row_matches(row, "hook")).toBe(false);
    });

    it("ignores keys of the scaffolding", () => {
        expect(row_matches(row, "hidden")).toBe(false);
    });

    it("says no when nothing matches", () => {
        expect(row_matches(row, "zzz")).toBe(false);
    });

    it("says no for an empty term or a missing row", () => {
        expect(row_matches(row, "")).toBe(false);
        expect(row_matches(null, "a")).toBe(false);
    });
});

describe("is_fkey_ref", () => {
    it("wants the three keys", () => {
        expect(is_fkey_ref({id: "a", topic_name: "t", hook_name: "h"})).toBe(true);
        expect(is_fkey_ref({id: "a"})).toBe(false);
        expect(is_fkey_ref(["a"])).toBe(false);
        expect(is_fkey_ref(null)).toBe(false);
    });
});
