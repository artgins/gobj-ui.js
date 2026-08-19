/***********************************************************************
 *          treedb_node_label.test.js
 *
 *      The label of a treedb graph node: the pkey when it names the
 *      record, the secondary key when the pkey is synthetic.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {describe, it, expect} from "vitest";

import {node_label} from "./treedb_node_label.js";

/*  The `cols` topic of treedb_system_schema, as the backend describes
 *  it: keyed by rowid, named in `value` (its pkey2).  */
const COLS_DESC = {
    topic_name: "cols",
    pkey:       "id",
    pkey2s:     ["value"],
    cols: [
        {id: "id",     header: "rowid",  type: "string", flag: ["persistent", "rowid"]},
        {id: "value",  header: "Column", type: "string", flag: ["persistent", "required"]},
        {id: "header", header: "Header", type: "string", flag: ["persistent", "required"]},
    ],
};

/*  An ordinary topic: the pkey IS the name.  */
const REALMS_DESC = {
    topic_name: "realms",
    pkey:       "id",
    cols: [
        {id: "id",         header: "id", type: "string", flag: ["persistent", "required"]},
        {id: "realm_name", header: "Name", type: "string", flag: ["persistent", "required"]},
    ],
};

describe("node_label", () => {
    it("uses the secondary key when the pkey is a rowid", () => {
        expect(node_label(COLS_DESC, {id: "181", value: "yuno_role"}))
            .toBe("yuno_role");
    });

    it("uses the pkey when it names the record", () => {
        expect(node_label(REALMS_DESC, {id: "artgins.utilities.all", realm_name: "all"}))
            .toBe("artgins.utilities.all");
    });

    it("accepts a pkey2s declared as a bare string", () => {
        let desc = {...COLS_DESC, pkey2s: "value"};
        expect(node_label(desc, {id: "181", value: "yuno_role"})).toBe("yuno_role");
    });

    it("treats a qualified pkey like a rowid one", () => {
        let desc = {
            ...COLS_DESC,
            cols: [
                {id: "id",    type: "string", flag: ["persistent", "qualified"]},
                {id: "value", type: "string", flag: ["persistent", "required"]},
            ],
        };
        expect(node_label(desc, {
            id:    "treedb_yunovatioscodb.yunos.yuno_role",
            value: "yuno_role",
        })).toBe("yuno_role");
    });

    it("treats a uuid pkey like a rowid one", () => {
        let desc = {
            ...COLS_DESC,
            cols: [
                {id: "id",    type: "string", flag: ["persistent", "uuid"]},
                {id: "value", type: "string", flag: ["persistent", "required"]},
            ],
        };
        expect(node_label(desc, {id: "3f2a…", value: "named"})).toBe("named");
    });

    it("falls back to the id when the desc carries no pkey2s (older node)", () => {
        let desc = {topic_name: "cols", pkey: "id", cols: COLS_DESC.cols};
        expect(node_label(desc, {id: "181", value: "yuno_role"})).toBe("181");
    });

    it("falls back to the id when the secondary key is empty in the record", () => {
        expect(node_label(COLS_DESC, {id: "181", value: ""})).toBe("181");
        expect(node_label(COLS_DESC, {id: "181"})).toBe("181");
    });

    it("honours a pkey that is not called 'id'", () => {
        let desc = {
            topic_name: "x",
            pkey:       "key",
            pkey2s:     ["name"],
            cols: [
                {id: "key",  type: "string", flag: ["persistent", "rowid"]},
                {id: "name", type: "string", flag: ["persistent", "required"]},
                /*  A col called `id` that is NOT the pkey must not decide.  */
                {id: "id",   type: "string", flag: ["persistent"]},
            ],
        };
        expect(node_label(desc, {id: "7", key: "7", name: "seven"})).toBe("seven");
    });

    it("survives a desc with no cols", () => {
        expect(node_label({topic_name: "x", pkey: "id"}, {id: "42"})).toBe("42");
    });
});
