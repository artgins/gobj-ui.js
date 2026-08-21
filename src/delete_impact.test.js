import {describe, it, expect} from "vitest";
import {delete_impact, ref_count} from "./delete_impact.js";

const DESC = {
    cols: [
        {id: "id",       flag: ["persistent", "required"]},
        {id: "name",     flag: ["persistent", "writable"]},
        {id: "users",    flag: ["hook"]},
        {id: "parent",   flag: ["fkey"]},
        {id: "managers", flag: ["hook", "fkey"]}
    ]
};

describe("ref_count", () => {
    it("counts a list, a dict, a ref string and nothing", () => {
        expect(ref_count([1, 2, 3])).toBe(3);
        expect(ref_count({a: 1, b: 2})).toBe(2);
        expect(ref_count("topic^id^hook")).toBe(1);
        expect(ref_count("")).toBe(0);
        expect(ref_count(null)).toBe(0);
        expect(ref_count(undefined)).toBe(0);
        expect(ref_count(7)).toBe(0);
    });
});

describe("delete_impact", () => {
    it("a loose record takes nothing with it", () => {
        let i = delete_impact(DESC, {id: "a", name: "A"});
        expect(i).toEqual({records: 1, children: 0, parents: 0});
    });

    it("counts children off a hook and parents off a fkey", () => {
        let i = delete_impact(DESC, {
            id: "a", users: [{id: "u1"}, {id: "u2"}], parent: "roles^root^users"
        });
        expect(i.children).toBe(2);
        expect(i.parents).toBe(1);
    });

    it("a column that is BOTH counts on both sides: the delete does both", () => {
        let i = delete_impact(DESC, {id: "a", managers: [{id: "m1"}, {id: "m2"}]});
        expect(i.children).toBe(2);
        expect(i.parents).toBe(2);
    });

    it("adds up over a selection", () => {
        let i = delete_impact(DESC, [
            {id: "a", users: [{id: "u1"}]},
            {id: "b", users: {u2: {}, u3: {}}, parent: "x^y^z"}
        ]);
        expect(i.records).toBe(2);
        expect(i.children).toBe(3);
        expect(i.parents).toBe(1);
    });

    it("says nothing it cannot know", () => {
        expect(delete_impact(null, {id: "a"})).toEqual({records: 1, children: 0, parents: 0});
        expect(delete_impact(DESC, [])).toEqual({records: 0, children: 0, parents: 0});
        expect(delete_impact(DESC, null)).toEqual({records: 0, children: 0, parents: 0});
    });
});
