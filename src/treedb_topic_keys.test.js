/***********************************************************************
 *          treedb_topic_keys.test.js
 *
 *      The keys of a topic, read from its desc, pinned: the shapes the
 *      backend and the schema literals really send.
 ***********************************************************************/
import { describe, test, expect } from "vitest";
import {
    desc_pkey2s, desc_tkey, col_key_roles, system_flag_names
} from "./treedb_topic_keys.js";

/*  The `binaries` topic of treedb_yuneta_agent, as `descs` answers it.  */
const BINARIES = {
    topic_name: "binaries", pkey: "id", tkey: "", system_flag: 1,
    topic_version: 3, pkey2s: ["version"],
    cols: [{id: "id"}, {id: "version"}, {id: "size"}]
};

describe("desc_pkey2s", () => {
    test("a list, as the desc carries it", () => {
        expect(desc_pkey2s(BINARIES)).toEqual(["version"]);
    });
    test("a bare string, as a schema literal declares it", () => {
        expect(desc_pkey2s({pkey2s: "yuno_release"})).toEqual(["yuno_release"]);
    });
    test("absent or empty is no secondary key", () => {
        expect(desc_pkey2s({})).toEqual([]);
        expect(desc_pkey2s({pkey2s: ""})).toEqual([]);
        expect(desc_pkey2s(null)).toEqual([]);
    });
});

describe("desc_tkey", () => {
    test("empty is the append time", () => {
        expect(desc_tkey(BINARIES)).toBe("");
        expect(desc_tkey({})).toBe("");
        expect(desc_tkey(null)).toBe("");
    });
    test("a named column", () => {
        expect(desc_tkey({tkey: "tm"})).toBe("tm");
    });
});

describe("col_key_roles", () => {
    test("the pkey, a pkey2, and a column that is neither", () => {
        expect(col_key_roles(BINARIES, "id")).toEqual(["pkey"]);
        expect(col_key_roles(BINARIES, "version")).toEqual(["pkey2"]);
        expect(col_key_roles(BINARIES, "size")).toEqual([]);
    });
    test("a column can be a pkey2 AND the tkey", () => {
        expect(col_key_roles({pkey: "id", pkey2s: ["tm"], tkey: "tm"}, "tm"))
            .toEqual(["pkey2", "tkey"]);
    });
    test("an empty tkey marks no column", () => {
        expect(col_key_roles({pkey: "id", tkey: ""}, "")).toEqual([]);
    });
    test("the pkey defaults to id", () => {
        expect(col_key_roles({}, "id")).toEqual(["pkey"]);
    });
});

describe("system_flag_names", () => {
    test("the number the desc carries", () => {
        expect(system_flag_names(1)).toEqual(["sf_string_key"]);
        expect(system_flag_names(0x0002 | 0x0100)).toEqual(["sf_rowid_key", "sf_t_ms"]);
    });
    test("a set bit with no name is shown by its value", () => {
        expect(system_flag_names(0x0009)).toEqual(["sf_string_key", "0x0008"]);
    });
    test("the names a schema literal carries", () => {
        expect(system_flag_names("sf_string_key|sf_t_ms")).toEqual(["sf_string_key", "sf_t_ms"]);
        expect(system_flag_names(["sf_int_key"])).toEqual(["sf_int_key"]);
    });
    test("nothing, zero or garbage is no name", () => {
        expect(system_flag_names(0)).toEqual([]);
        expect(system_flag_names(undefined)).toEqual([]);
        expect(system_flag_names(1.5)).toEqual([]);
    });
});
