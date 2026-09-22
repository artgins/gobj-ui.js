import {describe, it, expect} from "vitest";
import {host_draft_ids, mark_host_drafts, drafts_of_saved_answer} from "./host_drafts.js";

const model = {
    treedbs: [
        {id: "treedb_a", name: "treedb_a", topics: [
            {id: "treedb_a^users", name: "users"},
            {id: "treedb_a^roles", name: "roles"},
        ]},
        {id: "treedb_b", name: "treedb_b", topics: [
            {id: "treedb_b^users", name: "users"},
        ]},
    ],
};

describe("mark_host_drafts", () => {

    it("marks the topics the host names, by treedb (N13)", () => {
        /*  The mark lived in the memory of one session: after a reload the
         *  editor showed no draft while __system__ still differed from the
         *  file in use. Rebuilt from the host's data.  */
        const written = {};
        const n = mark_host_drafts(written, model, {treedb_a: ["users"]});
        expect(n).toBe(1);
        expect(written).toEqual({"treedb_a^users": true});
    });

    it("a topic of the same name in another treedb is another topic", () => {
        const written = {};
        mark_host_drafts(written, model, {treedb_b: ["users"]});
        expect(written).toEqual({"treedb_b^users": true});
    });

    it("keeps what the session wrote, ignores what the model does not hold", () => {
        const written = {"treedb_a^roles": true};
        const n = mark_host_drafts(written, model, {treedb_a: ["nobody"], treedb_z: ["users"]});
        expect(n).toBe(0);
        expect(written).toEqual({"treedb_a^roles": true});
    });

    it("no model, no drafts: nothing", () => {
        expect(mark_host_drafts({}, null, {treedb_a: ["users"]})).toBe(0);
        expect(mark_host_drafts({}, model, null)).toBe(0);
    });
});

describe("drafts_of_saved_answer", () => {

    it("reads draft_changed of each treedb row", () => {
        const rows = [
            {treedb_name: "treedb_a", result: 0, data: {draft_changed: {users: true, roles: false}}},
            {treedb_name: "treedb_b", result: 0, data: {draft_changed: {}}},
            {treedb_name: "treedb_c", result: -1, comment: "not open here"},
        ];
        expect(drafts_of_saved_answer(rows)).toEqual({treedb_a: ["users"], treedb_b: []});
    });

    it("a node older than draft_changed says nothing", () => {
        expect(drafts_of_saved_answer([{treedb_name: "t", data: {can_apply: false}}])).toEqual({});
        expect(drafts_of_saved_answer(null)).toEqual({});
    });
});

describe("host_draft_ids", () => {

    it("resolves the host's names on the model, as topic ids", () => {
        expect(host_draft_ids(model, {treedb_a: ["users"], treedb_b: ["users"]}))
            .toEqual({"treedb_a^users": true, "treedb_b^users": true});
    });

    it("is a fresh map every time: what the host stopped naming is gone (M1)", () => {
        /*  mark_host_drafts() only ADDS, and the editor fed it the same map
         *  every time: a topic the host named before the Save stayed a
         *  draft after it.  */
        const before = host_draft_ids(model, {treedb_a: ["users", "roles"]});
        const after = host_draft_ids(model, {treedb_a: []});
        expect(before).toEqual({"treedb_a^users": true, "treedb_a^roles": true});
        expect(after).toEqual({});
    });

    it("no model, no drafts: empty", () => {
        expect(host_draft_ids(null, {treedb_a: ["users"]})).toEqual({});
        expect(host_draft_ids(model, null)).toEqual({});
    });
});
