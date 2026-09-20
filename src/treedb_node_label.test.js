/***********************************************************************
 *          treedb_node_label.test.js
 *
 *      The label of a treedb graph node: its id, and the secondary
 *      keys it carries. A record is one thing and an INSTANCE of it
 *      another, and a card that shows one without the other cannot be
 *      identified.
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
    const DOT = " \u00b7 ";

    it("says the id AND the secondary key that names the record", () => {
        expect(node_label(COLS_DESC, {id: "181", value: "yuno_role"}))
            .toBe("181" + DOT + "yuno_role");
    });

    it("says the id AND the instance: the case that brought it", () => {
        /*  Three yunos of one agent, all of release 7.23.0-1: the cards
         *  read `7.23.0-1` three times and never said which yuno.  */
        let yunos = {
            topic_name: "yunos",
            pkey:       "id",
            pkey2s:     ["yuno_release"],
            cols: [
                {id: "id",           type: "string", flag: ["persistent", "rowid"]},
                {id: "yuno_release", type: "string", flag: ["persistent"]},
            ],
        };
        expect(node_label(yunos, {id: "1", yuno_release: "7.23.0-1"}))
            .toBe("1" + DOT + "7.23.0-1");
        expect(node_label(yunos, {id: "1600", yuno_release: "1.8.1.0-2"}))
            .toBe("1600" + DOT + "1.8.1.0-2");
    });

    it("gives the bare id when the topic declares no secondary key", () => {
        expect(node_label(REALMS_DESC, {id: "artgins.utilities.all", realm_name: "all"}))
            .toBe("artgins.utilities.all");
    });

    it("accepts a pkey2s declared as a bare string", () => {
        let desc = {...COLS_DESC, pkey2s: "value"};
        expect(node_label(desc, {id: "181", value: "yuno_role"}))
            .toBe("181" + DOT + "yuno_role");
    });

    it("does not care what the id column is flagged", () => {
        /*  rowid, uuid, qualified or nothing at all: the id is shown
         *  either way, and the flags decide nothing here any more.  */
        for(let flag of [["persistent", "uuid"], ["persistent", "qualified"], ["persistent"]]) {
            let desc = {
                ...COLS_DESC,
                cols: [
                    {id: "id",    type: "string", flag: flag},
                    {id: "value", type: "string", flag: ["persistent", "required"]},
                ],
            };
            expect(node_label(desc, {id: "k", value: "named"})).toBe("k" + DOT + "named");
        }
    });

    it("says every secondary key the topic declares, in its order", () => {
        let desc = {topic_name: "x", pkey: "id", pkey2s: ["a", "b"], cols: []};
        expect(node_label(desc, {id: "7", a: "one", b: "two"}))
            .toBe("7" + DOT + "one" + DOT + "two");
    });

    it("skips a secondary key that is empty, absent or the id again", () => {
        expect(node_label(COLS_DESC, {id: "181", value: ""})).toBe("181");
        expect(node_label(COLS_DESC, {id: "181"})).toBe("181");
        expect(node_label(COLS_DESC, {id: "181", value: "181"})).toBe("181");
    });

    it("falls back to the id when the desc carries no pkey2s (older node)", () => {
        let desc = {topic_name: "cols", pkey: "id", cols: COLS_DESC.cols};
        expect(node_label(desc, {id: "181", value: "yuno_role"})).toBe("181");
    });

    it("takes a numeric secondary key as the text it is", () => {
        expect(node_label(COLS_DESC, {id: "emailsender.artgins", value: 1}))
            .toBe("emailsender.artgins" + DOT + "1");
    });

    it("survives a desc with no cols, and no desc at all", () => {
        expect(node_label({topic_name: "x", pkey: "id"}, {id: "42"})).toBe("42");
        expect(node_label(null, {id: "42"})).toBe("42");
    });
});
