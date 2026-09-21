import {describe, it, expect} from "vitest";

import {row_matches, is_fkey_ref, is_hook_size} from "./yui_row_search.js";

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

describe("row_matches, on a table loaded with hook_size", () => {
    /*  What a topic table gets since 7.23.163: the hook is the COUNT
     *  of its children, not their ids.  */
    const row = {
        id: "places-madrid",
        name: "Madrid",
        devices: [{size: 400}],
        __md_treedb__: {topic_name: "places"}
    };

    it("does NOT match the count of a hook", () => {
        /*  It did, and "400" then answered every place holding 400
         *  devices together with the ones that really say 400.  */
        expect(row_matches(row, "400")).toBe(false);
        expect(row_matches(row, "40")).toBe(false);
        expect(row_matches(row, "0")).toBe(false);
    });

    it("still matches the rest of the row", () => {
        expect(row_matches(row, "madrid")).toBe(true);
    });

    it("still walks a hook that DID come with its children", () => {
        /*  A node event carries whole hooks whatever the table asked
         *  for, so both shapes reach this row.  */
        const loaded = {
            id: "places-madrid",
            devices: [
                {id: "E22003089", topic_name: "devices", hook_name: "places"}
            ]
        };
        expect(row_matches(loaded, "e22003089")).toBe(true);
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

describe("is_hook_size", () => {
    it("wants the one-element list holding only a numeric size", () => {
        expect(is_hook_size([{size: 5}])).toBe(true);
        expect(is_hook_size([{size: 0}])).toBe(true);
        expect(is_hook_size([])).toBe(false);
        expect(is_hook_size([{size: 5}, {size: 6}])).toBe(false);
        expect(is_hook_size([{size: "5"}])).toBe(false);
        expect(is_hook_size({size: 5})).toBe(false);
        /*  A record that happens to carry a `size` column is data, and
         *  is searched like any other.  */
        expect(is_hook_size([{id: "a", size: 5}])).toBe(false);
        expect(is_hook_size(null)).toBe(false);
    });
});

/*
 *  The children of a hook as the NODE EVENTS deliver them: `{id,
 *  topic_name}`, with no hook_name. Not taken for a reference, their
 *  topic_name -- the same word on every row -- was a wildcard for every
 *  row that had received an UPDATED (M30 of the 2026-09-21 review).
 */
describe("a hook's children as the node events deliver them", () => {
    const row = {id: "w1", devices: [{id: "d7", topic_name: "devices"}]};

    it("are references: only their id is looked at", () => {
        expect(is_fkey_ref({id: "d7", topic_name: "devices"})).toBe(true);
        expect(row_matches(row, "d7")).toBe(true);
        expect(row_matches(row, "devices")).toBe(false);
    });

    it("an object that carries more than a reference is data, searched whole", () => {
        const data = {id: "x", topic_name: "devices", note: "blue"};
        expect(is_fkey_ref(data)).toBe(false);
        expect(row_matches({id: "r", payload: data}, "blue")).toBe(true);
    });
});
