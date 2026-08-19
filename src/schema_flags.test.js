/***********************************************************************
 *          schema_flags.test.js
 *
 *      The flag catalogue, pinned.
 *
 *      The two properties that matter: a flag the catalogue does not
 *      know must survive an edit (a newer node declares one, and
 *      dropping it silently rewrites that node's schema), and turning
 *      on a flag that excludes another must turn the other off (a
 *      column flagged both `hook` and `fkey` is a link the treedb
 *      writes from both ends).
 ***********************************************************************/
import { describe, test, expect } from "vitest";
import {
    FLAG_CATALOG, FLAG_GROUPS,
    flags_for_type, grouped_flags, toggle_flag, flag_description,
} from "./schema_flags.js";


describe("the catalogue", () => {
    test("every entry has a group the editor draws", () => {
        for(const flag of FLAG_CATALOG) {
            expect(FLAG_GROUPS).toContain(flag.group);
        }
    });

    test("every entry says what it does", () => {
        for(const flag of FLAG_CATALOG) {
            expect(typeof flag.desc).toBe("string");
            expect(flag.desc.length).toBeGreaterThan(0);
        }
    });

    test("no flag is listed twice", () => {
        const names = FLAG_CATALOG.map(f => f.name);
        expect(new Set(names).size).toBe(names.length);
    });

    test("it covers the flags the meta schema declares", () => {
        /*  The `flag` column of `cols` (treedb_system_schema.c) is the
            list this table has to keep up with.  */
        const names = FLAG_CATALOG.map(f => f.name);
        for(const flag of ["persistent", "required", "notnull", "wild", "inherit",
                           "readable", "writable", "hidden", "stats", "rstats", "pstats",
                           "hook", "fkey", "enum", "template", "uuid", "rowid",
                           "qualified", "password", "email", "url", "time", "now",
                           "date", "color", "image", "tel", "table", "id", "currency",
                           "hex", "binary", "percent", "base64", "coordinates", "gbuffer"]) {
            expect(names).toContain(flag);
        }
    });
});

describe("what is meaningful on a type", () => {
    test("a hook is meaningful on a collection and not on a string", () => {
        const on_dict = flags_for_type("dict").find(f => f.name === "hook");
        const on_string = flags_for_type("string").find(f => f.name === "hook");
        expect(on_dict.meaningful).toBe(true);
        expect(on_string.meaningful).toBe(false);
    });

    test("persistent is meaningful on everything", () => {
        for(const type of ["string", "integer", "dict", "blob"]) {
            expect(flags_for_type(type).find(f => f.name === "persistent").meaningful).toBe(true);
        }
    });

    test("nothing is filtered out — a set flag must stay visible", () => {
        expect(flags_for_type("string").length).toBe(FLAG_CATALOG.length);
    });
});

describe("grouped_flags", () => {
    test("groups come out in the drawing order", () => {
        const groups = grouped_flags("string", []).map(g => g.group);
        expect(groups).toEqual(FLAG_GROUPS);
    });

    test("what the column carries is marked on", () => {
        const relation = grouped_flags("dict", ["hook"]).find(g => g.group === "relation");
        expect(relation.flags.find(f => f.name === "hook").on).toBe(true);
        expect(relation.flags.find(f => f.name === "fkey").on).toBe(false);
    });

    test("a flag the catalogue does not know is kept, in its own group", () => {
        const groups = grouped_flags("string", ["persistent", "from_a_newer_node"]);
        const other = groups.find(g => g.group === "other");
        expect(other.flags.map(f => f.name)).toEqual(["from_a_newer_node"]);
        expect(other.flags[0].on).toBe(true);
    });

    test("no unknown flag means no extra group", () => {
        expect(grouped_flags("string", ["persistent"]).find(g => g.group === "other"))
            .toBeUndefined();
    });
});

describe("toggle_flag", () => {
    test("turning one on adds it once", () => {
        expect(toggle_flag(["persistent"], "required", true))
            .toEqual(["persistent", "required"]);
        expect(toggle_flag(["persistent"], "persistent", true)).toEqual(["persistent"]);
    });

    test("turning one off removes it", () => {
        expect(toggle_flag(["persistent", "required"], "required", false))
            .toEqual(["persistent"]);
    });

    test("hook and fkey exclude each other — a link is written from ONE end", () => {
        expect(toggle_flag(["fkey", "persistent"], "hook", true))
            .toEqual(["persistent", "hook"]);
        expect(toggle_flag(["hook"], "fkey", true)).toEqual(["fkey"]);
    });

    test("only one way of generating a key at a time", () => {
        expect(toggle_flag(["rowid"], "qualified", true)).toEqual(["qualified"]);
        expect(toggle_flag(["uuid", "persistent"], "rowid", true))
            .toEqual(["persistent", "rowid"]);
    });

    test("an absent or rubbish list is a list", () => {
        expect(toggle_flag(null, "hook", true)).toEqual(["hook"]);
        expect(toggle_flag(["", null], "hook", true)).toEqual(["hook"]);
    });
});

describe("flag_description", () => {
    test("answers for a known flag and says nothing for an unknown one", () => {
        expect(flag_description("persistent").length).toBeGreaterThan(0);
        expect(flag_description("from_a_newer_node")).toBe("");
    });
});
