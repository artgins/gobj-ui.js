/***********************************************************************
 *          schema_descs.test.js
 *
 *      The records drawn as the schema they describe, pinned.
 *
 *      The half worth testing is the derived `fkey`: it is declared
 *      nowhere in the store, every view reads it, and a desc built
 *      without it draws links that are simply not there.
 ***********************************************************************/
import { describe, test, expect } from "vitest";
import { build_schema_model } from "./schema_model.js";
import { topic_descs, col_desc } from "./schema_descs.js";


const MODEL = build_schema_model({
    treedbs: [{id: "db", schema_version: 4}],
    topics: [
        {id: "db.departments", value: "departments", order: 1, pkey: "id",
         topic_version: 3, system_flag: "sf_string_key", treedbs: ["treedbs^db^topics"]},
        {id: "db.users", value: "users", order: 2, pkey: "id", topic_version: 5,
         pkey2s: "name", treedbs: ["treedbs^db^topics"]},
    ],
    cols: [
        {id: "db.departments.id", value: "id", order: 1, type: "string",
         header: "Id", flag: ["persistent", "required"], topics: ["topics^db.departments^cols"]},
        {id: "db.departments.users", value: "users", order: 2, type: "dict",
         header: "Users", flag: ["hook"], hook: {users: "departments"},
         topics: ["topics^db.departments^cols"]},
        {id: "db.users.id", value: "id", order: 1, type: "string", header: "Id",
         flag: ["persistent"], topics: ["topics^db.users^cols"]},
        {id: "db.users.name", value: "name", order: 2, type: "string", header: "Name",
         flag: ["persistent"], topics: ["topics^db.users^cols"]},
        {id: "db.users.departments", value: "departments", order: 3, type: "array",
         header: "Departments", flag: ["fkey"], topics: ["topics^db.users^cols"]},
    ],
});


describe("topic_descs", () => {
    const descs = topic_descs(MODEL.treedbs[0]);

    test("one desc per topic, keyed by the topic NAME", () => {
        expect(Object.keys(descs).sort()).toEqual(["departments", "users"]);
        expect(descs.users.topic_name).toBe("users");
    });

    test("a column is keyed by its bare name, not by its whole path", () => {
        expect(descs.users.cols.map(c => c.id)).toEqual(["id", "name", "departments"]);
    });

    test("the columns keep their declared order", () => {
        expect(descs.departments.cols.map(c => c.id)).toEqual(["id", "users"]);
    });

    test("topic metadata the views read travels", () => {
        expect(descs.users.topic_version).toBe(5);
        expect(descs.users.pkey).toBe("id");
        expect(descs.departments.system_flag).toBe("sf_string_key");
    });

    test("a pkey2 declared as a bare string becomes the list the desc uses", () => {
        expect(descs.users.pkey2s).toEqual(["name"]);
    });

    test("no storage field leaks into the desc", () => {
        for(const key of ["value", "treedbs", "order"]) {
            expect(descs.users[key]).toBeUndefined();
        }
        for(const col of descs.users.cols) {
            for(const key of ["value", "topics", "order"]) {
                expect(col[key]).toBeUndefined();
            }
        }
    });

    test("the FKEY the store never holds is derived onto the child column", () => {
        const fkey_col = descs.users.cols.find(c => c.id === "departments");
        expect(fkey_col.fkey).toEqual({departments: "users"});
    });

    test("the hook stays on the parent, whole", () => {
        const hook_col = descs.departments.cols.find(c => c.id === "users");
        expect(hook_col.hook).toEqual({users: "departments"});
    });
});

describe("what a broken hook derives", () => {
    test("a hook naming a topic that is not there derives nothing and throws nothing", () => {
        const model = build_schema_model({
            treedbs: [{id: "db"}],
            topics:  [{id: "db.a", value: "a", treedbs: ["treedbs^db^topics"]}],
            cols:    [{id: "db.a.x", value: "x", type: "dict", flag: ["hook"],
                       hook: {gone: "parent"}, topics: ["topics^db.a^cols"]}],
        });
        const descs = topic_descs(model.treedbs[0]);
        expect(descs.a.cols[0].hook).toEqual({gone: "parent"});
        expect(descs.a.cols[0].fkey).toBeUndefined();
    });

    test("a hook naming a column that is not there derives nothing", () => {
        const model = build_schema_model({
            treedbs: [{id: "db"}],
            topics:  [{id: "db.a", value: "a", order: 1, treedbs: ["treedbs^db^topics"]},
                      {id: "db.b", value: "b", order: 2, treedbs: ["treedbs^db^topics"]}],
            cols:    [{id: "db.a.x", value: "x", type: "dict", flag: ["hook"],
                       hook: {b: "nope"}, topics: ["topics^db.a^cols"]},
                      {id: "db.b.y", value: "y", type: "string", topics: ["topics^db.b^cols"]}],
        });
        const descs = topic_descs(model.treedbs[0]);
        expect(descs.b.cols[0].fkey).toBeUndefined();
    });
});

describe("the fields stored as JSON text", () => {
    test("an enum, hook and default written as text come back as values", () => {
        const desc = col_desc({name: "x", record: {
            id: "db.a.x", value: "x", type: "string",
            flag: '["enum","persistent"]',
            enum: '["a","b"]',
            hook: '{"c":"parent"}',
            default: '{"k":1}'
        }});
        expect(desc.flag).toEqual(["enum", "persistent"]);
        expect(desc.enum).toEqual(["a", "b"]);
        expect(desc.hook).toEqual({c: "parent"});
        expect(desc.default).toEqual({k: 1});
    });

    test("a default that is plain text stays plain text", () => {
        expect(col_desc({name: "x", record: {default: "hello"}}).default).toBe("hello");
    });

    test("an empty value is left out rather than declared as empty", () => {
        const desc = col_desc({name: "x", record: {type: "string", tkey: "", hook: null}});
        expect("tkey" in desc).toBe(false);
        expect("hook" in desc).toBe(false);
    });
});

describe("edges", () => {
    test("no treedb gives an empty descs, never a throw", () => {
        expect(topic_descs(null)).toEqual({});
        expect(topic_descs({})).toEqual({});
    });
});

describe("the empty collections the store answers with", () => {
    const model = build_schema_model({
        treedbs: [{id: "db"}],
        topics: [{id: "db.t", value: "t", _geometry: {}, treedbs: ["treedbs^db^topics"]}],
        cols: [{id: "db.t.id", value: "id", type: "string",
                enum: {}, hook: {}, default: {}, _geometry: {},
                topics: ["topics^db.t^cols"]}],
    });
    const descs = topic_descs(model.treedbs[0]);

    test("an unset blob does not become a value in the desc", () => {
        for(const key of ["enum", "hook", "default", "_geometry"]) {
            expect(key in descs.t.cols[0]).toBe(false);
        }
    });

    test("an empty hook is NOT a hook — the info panel would draw an arrow to nothing", () => {
        expect(descs.t.cols[0].hook).toBeUndefined();
    });

    test("the topic record's own _geometry does not travel", () => {
        expect("_geometry" in descs.t).toBe(false);
    });
});
