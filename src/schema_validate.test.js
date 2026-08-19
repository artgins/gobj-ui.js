/***********************************************************************
 *          schema_validate.test.js
 *
 *      What must be caught BEFORE the restart, pinned.
 *
 *      Each of these is a way to spend an outage finding out something
 *      the records already said: a link that saves nothing, a topic
 *      that will not open, or — the expensive one — a restart that
 *      succeeds and changes nothing because the version did not move.
 ***********************************************************************/
import { describe, test, expect } from "vitest";
import { build_schema_model } from "./schema_model.js";
import { validate_schema, validate_model, has_errors } from "./schema_validate.js";


/*  A treedb of two topics linked by departments.users -> users.departments,
    which is the shape every test below breaks in one place.  */
function schema(overrides)
{
    let o = overrides || {};
    const records = {
        treedbs: [{id: "db", schema_version: 1}],
        topics: [
            {id: "db.departments", value: "departments", order: 1, pkey: "id",
             topic_version: o.dep_version === undefined ? 1 : o.dep_version,
             treedbs: ["treedbs^db^topics"]},
            {id: "db.users", value: "users", order: 2, pkey: o.users_pkey || "id",
             topic_version: 1, pkey2s: o.users_pkey2s,
             treedbs: ["treedbs^db^topics"]},
        ],
        cols: [
            {id: "db.departments.id", value: "id", order: 1, type: "string",
             flag: ["persistent"], topics: ["topics^db.departments^cols"]},
            {id: "db.departments.users", value: "users", order: 2,
             type: o.hook_type === undefined ? "dict" : o.hook_type,
             flag: ["hook"], hook: o.hook === undefined ? {users: "departments"} : o.hook,
             topics: ["topics^db.departments^cols"]},
            {id: "db.users.id", value: "id", order: 1, type: "string",
             flag: ["persistent"], topics: ["topics^db.users^cols"]},
            {id: "db.users.departments", value: "departments", order: 2,
             type: o.fkey_type === undefined ? "array" : o.fkey_type,
             flag: o.fkey_flag === undefined ? ["fkey"] : o.fkey_flag,
             topics: ["topics^db.users^cols"]},
        ],
    };
    if(o.extra_col) {
        records.cols.push(o.extra_col);
    }
    return build_schema_model(records).treedbs[0];
}

function codes(findings)
{
    return findings.map(f => f.code);
}


describe("a schema with nothing wrong", () => {
    test("says nothing", () => {
        expect(validate_schema(schema())).toEqual([]);
    });

    test("no treedb at all is not a crash", () => {
        expect(validate_schema(null)).toEqual([]);
        expect(validate_schema(undefined, {})).toEqual([]);
    });
});

describe("the topic will not open", () => {
    test("a pkey naming no column", () => {
        const f = validate_schema(schema({users_pkey: "user_id"}));
        expect(codes(f)).toContain("pkey names no column");
        expect(f[0].detail).toBe("user_id");
        expect(has_errors(f)).toBe(true);
    });

    test("a pkey2 naming no column", () => {
        expect(codes(validate_schema(schema({users_pkey2s: ["name"]}))))
            .toContain("pkey2 names no column");
    });

    test("a pkey2 declared as a bare string is read the same way", () => {
        expect(codes(validate_schema(schema({users_pkey2s: "name"}))))
            .toContain("pkey2 names no column");
    });

    test("a topic with no column", () => {
        const model = build_schema_model({
            treedbs: [{id: "db"}],
            topics:  [{id: "db.empty", value: "empty", treedbs: ["treedbs^db^topics"]}],
            cols:    [],
        });
        expect(codes(validate_schema(model.treedbs[0]))).toContain("topic has no column");
    });
});

describe("the link does nothing, and the write succeeded", () => {
    test("a hook with no mapping", () => {
        expect(codes(validate_schema(schema({hook: null})))).toContain("hook has no mapping");
        expect(codes(validate_schema(schema({hook: {}})))).toContain("hook has no mapping");
    });

    test("a hook naming a topic that is not in this treedb", () => {
        expect(codes(validate_schema(schema({hook: {clients: "departments"}}))))
            .toContain("hook names no topic");
    });

    test("a hook naming a column the child does not have", () => {
        const f = validate_schema(schema({hook: {users: "department_id"}}));
        expect(codes(f)).toContain("hook names no fkey column");
        expect(f[0].detail).toBe("users.department_id");
    });

    test("a hook whose target column is NOT flagged fkey", () => {
        expect(codes(validate_schema(schema({fkey_flag: ["persistent"]}))))
            .toContain("hook target is not a fkey");
    });

    test("a hook typed as a scalar cannot hold children", () => {
        expect(codes(validate_schema(schema({hook_type: "string"}))))
            .toContain("hook must be a collection");
    });

    test("a fkey typed as an integer", () => {
        expect(codes(validate_schema(schema({fkey_type: "integer"}))))
            .toContain("fkey has a bad type");
    });

    test("a fkey no hook names is a WARNING — the parent side went away", () => {
        const f = validate_schema(schema({hook: {users: "departments"},
            extra_col: {id: "db.users.boss", value: "boss", order: 3, type: "string",
                        flag: ["fkey"], topics: ["topics^db.users^cols"]}}));
        const orphan = f.filter(x => x.code === "fkey with no hook");
        expect(orphan.length).toBe(1);
        expect(orphan[0].col).toBe("boss");
        expect(orphan[0].severity).toBe("warning");
    });
});

describe("the column itself", () => {
    test("no type", () => {
        expect(codes(validate_schema(schema({
            extra_col: {id: "db.users.x", value: "x", order: 9,
                        topics: ["topics^db.users^cols"]}
        })))).toContain("column has no type");
    });

    test("a type the treedb's own validator does not know", () => {
        expect(codes(validate_schema(schema({
            extra_col: {id: "db.users.x", value: "x", order: 9, type: "text",
                        topics: ["topics^db.users^cols"]}
        })))).toContain("unknown column type");
    });

    test("flagged enum with no enum list", () => {
        expect(codes(validate_schema(schema({
            extra_col: {id: "db.users.x", value: "x", order: 9, type: "string",
                        flag: ["enum"], topics: ["topics^db.users^cols"]}
        })))).toContain("enum column has no enum");
    });

    test("an enum stored as JSON TEXT counts as an enum", () => {
        expect(codes(validate_schema(schema({
            extra_col: {id: "db.users.x", value: "x", order: 9, type: "string",
                        flag: ["enum"], enum: '["a","b"]',
                        topics: ["topics^db.users^cols"]}
        })))).not.toContain("enum column has no enum");
    });

    test("a hook stored as JSON TEXT is still a hook mapping", () => {
        expect(validate_schema(schema({hook: '{"users":"departments"}'}))).toEqual([]);
    });

    test("a flag stored as a bare string is still a flag", () => {
        expect(codes(validate_schema(schema({fkey_flag: "fkey"}))))
            .not.toContain("hook target is not a fkey");
    });
});

describe("the version that did not move", () => {
    test("a written topic whose topic_version is unchanged is reported", () => {
        const f = validate_schema(schema(), {
            written_topics: ["db.departments"],
            baseline: {"db.departments": 1}
        });
        const v = f.filter(x => x.code === "topic version not bumped");
        expect(v.length).toBe(1);
        expect(v[0].topic).toBe("departments");
        expect(v[0].severity).toBe("warning");
    });

    test("a bumped version says nothing", () => {
        expect(validate_schema(schema({dep_version: 2}), {
            written_topics: ["db.departments"],
            baseline: {"db.departments": 1}
        })).toEqual([]);
    });

    test("a topic nobody wrote is not asked about its version", () => {
        expect(validate_schema(schema(), {baseline: {"db.departments": 1}})).toEqual([]);
    });

    test("a version compared across types still matches (2 vs '2')", () => {
        expect(validate_schema(schema({dep_version: "1"}), {
            written_topics: ["db.departments"],
            baseline: {"db.departments": 1}
        }).length).toBe(1);
    });
});

describe("errors come first, and orphans are the model's business", () => {
    test("an error outranks a warning in the list", () => {
        const f = validate_schema(schema({users_pkey: "nope",
            extra_col: {id: "db.users.boss", value: "boss", order: 3, type: "string",
                        flag: ["fkey"], topics: ["topics^db.users^cols"]}}));
        expect(f[0].severity).toBe("error");
        expect(f[f.length - 1].severity).toBe("warning");
    });

    test("validate_model reports what belongs to nothing", () => {
        const model = build_schema_model({
            treedbs: [{id: "db"}],
            topics:  [{id: "gone.users", value: "users", treedbs: ["treedbs^gone^topics"]}],
            cols:    [{id: "db.gone.x", value: "x", topics: ["topics^db.gone^cols"]}],
        });
        const c = codes(validate_model(model));
        expect(c).toContain("topic belongs to no treedb");
        expect(c).toContain("column belongs to no topic");
    });

    test("has_errors ignores warnings", () => {
        expect(has_errors([{severity: "warning"}])).toBe(false);
        expect(has_errors([{severity: "warning"}, {severity: "error"}])).toBe(true);
        expect(has_errors(null)).toBe(false);
    });
});

describe("only one hook may name a fkey column", () => {
    test("two hooks on the same fkey is what the treedb refuses to open", () => {
        const model = build_schema_model({
            treedbs: [{id: "db"}],
            topics: [
                {id: "db.a", value: "a", order: 1, treedbs: ["treedbs^db^topics"]},
                {id: "db.b", value: "b", order: 2, treedbs: ["treedbs^db^topics"]},
                {id: "db.c", value: "c", order: 3, treedbs: ["treedbs^db^topics"]},
            ],
            cols: [
                {id: "db.a.id", value: "id", order: 1, type: "string", topics: ["topics^db.a^cols"]},
                {id: "db.a.cs", value: "cs", order: 2, type: "dict", flag: ["hook"],
                 hook: {c: "parent"}, topics: ["topics^db.a^cols"]},
                {id: "db.b.id", value: "id", order: 1, type: "string", topics: ["topics^db.b^cols"]},
                {id: "db.b.cs", value: "cs", order: 2, type: "dict", flag: ["hook"],
                 hook: {c: "parent"}, topics: ["topics^db.b^cols"]},
                {id: "db.c.id", value: "id", order: 1, type: "string", topics: ["topics^db.c^cols"]},
                {id: "db.c.parent", value: "parent", order: 2, type: "array", flag: ["fkey"],
                 topics: ["topics^db.c^cols"]},
            ],
        });
        const f = validate_schema(model.treedbs[0]);
        const dup = f.filter(x => x.code === "fkey named by two hooks");
        expect(dup.length).toBe(1);
        expect(dup[0].col).toBe("parent");
        expect(dup[0].severity).toBe("error");
    });
});
