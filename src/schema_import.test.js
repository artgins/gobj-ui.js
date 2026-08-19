/***********************************************************************
 *          schema_import.test.js
 *
 *      The plan that makes a stored schema equal a given one, pinned.
 *
 *      Two properties matter more than the rest and both are here: a
 *      plan that changes columns ALWAYS raises the topic version (else
 *      the import succeeds and nothing moves), and a plan run against
 *      the schema it was computed from is empty (else every import
 *      rewrites the whole store and every restart looks like a change).
 ***********************************************************************/
import { describe, test, expect } from "vitest";
import { build_schema_model } from "./schema_model.js";
import { schema_to_json } from "./schema_to_c.js";
import { plan_import, plan_deletes, same_value } from "./schema_import.js";


function model_of(cols_extra, topic_version)
{
    return build_schema_model({
        treedbs: [{id: "db", schema_version: 4}],
        topics: [{id: "db.users", value: "users", order: 1, pkey: "id",
                  system_flag: "sf_string_key",
                  topic_version: topic_version === undefined ? 2 : topic_version,
                  treedbs: ["treedbs^db^topics"]}],
        cols: [
            {id: "db.users.id", value: "id", order: 1, header: "Id", fillspace: 20,
             type: "string", flag: ["persistent", "required"],
             topics: ["topics^db.users^cols"]},
            {id: "db.users.name", value: "name", order: 2, header: "Name", fillspace: 10,
             type: "string", flag: ["persistent"], topics: ["topics^db.users^cols"]},
        ].concat(cols_extra || []),
    }).treedbs[0];
}

const INCOMING = {
    id: "db",
    schema_version: "4",
    topics: [{
        id: "users", pkey: "id", system_flag: "sf_string_key", topic_version: "2",
        cols: {
            id:   {header: "Id", fillspace: 20, type: "string",
                   flag: ["persistent", "required"]},
            name: {header: "Name", fillspace: 10, type: "string", flag: ["persistent"]},
        }
    }]
};

function clone(o)
{
    return JSON.parse(JSON.stringify(o));
}


describe("a schema that is already there", () => {
    test("plans nothing at all", () => {
        const plan = plan_import(model_of(), INCOMING);
        expect(plan.writes).toEqual([]);
        expect(plan.conflicts).toEqual([]);
    });

    test("an export of the store re-imports as nothing — the round trip closes", () => {
        const treedb = model_of();
        const plan = plan_import(treedb, schema_to_json(treedb));
        expect(plan.writes).toEqual([]);
    });

    test("flags in another order are the same flags", () => {
        const incoming = clone(INCOMING);
        incoming.topics[0].cols.id.flag = ["required", "persistent"];
        expect(plan_import(model_of(), incoming).writes).toEqual([]);
    });

    test("a hook written as JSON text is the same hook", () => {
        expect(same_value("hook", {a: "b"}, '{"a":"b"}')).toBe(true);
        expect(same_value("flag", "fkey", ["fkey"])).toBe(true);
        expect(same_value("header", "Id", "Id")).toBe(true);
        expect(same_value("header", "Id", "Name")).toBe(false);
    });
});

describe("adding a column", () => {
    const incoming = clone(INCOMING);
    incoming.topics[0].cols.email = {header: "Email", fillspace: 15, type: "string",
                                     flag: ["persistent", "writable"]};
    const plan = plan_import(model_of(), incoming);

    test("creates it with the fkey and the order composed, not asked for", () => {
        const create = plan.writes.find(w => w.op === "create");
        expect(create.topic_name).toBe("cols");
        expect(create.record.value).toBe("email");
        expect(create.record.topics).toEqual(["topics^db.users^cols"]);
        expect(create.record.order).toBe(3);
        expect(create.record.header).toBe("Email");
    });

    test("RAISES the topic version even though the incoming schema kept it", () => {
        const update = plan.writes.find(w => w.topic_name === "topics");
        expect(update.op).toBe("update");
        expect(update.record.id).toBe("db.users");
        expect(update.record.topic_version).toBe(3);
    });

    test("raises the treedb's schema_version too", () => {
        const treedb_write = plan.writes.find(w => w.topic_name === "treedbs");
        expect(treedb_write.record.schema_version).toBe(5);
    });

    test("the topic is written BEFORE the column that references it", () => {
        const topic_at = plan.writes.findIndex(w => w.topic_name === "topics");
        const col_at = plan.writes.findIndex(w => w.topic_name === "cols");
        expect(topic_at).toBeLessThan(col_at);
    });

    test("the summary counts what it did", () => {
        expect(plan.summary.cols_created).toBe(1);
        expect(plan.summary.topics_updated).toBe(1);
        expect(plan.summary.cols_deleted).toBe(0);
    });
});

describe("changing a column", () => {
    test("only the fields that moved are written", () => {
        const incoming = clone(INCOMING);
        incoming.topics[0].cols.name.header = "Full name";
        const plan = plan_import(model_of(), incoming);
        const update = plan.writes.find(w => w.topic_name === "cols");
        expect(update.record).toEqual({id: "db.users.name", header: "Full name"});
    });

    test("a field the incoming schema DROPPED is cleared, not left behind", () => {
        const incoming = clone(INCOMING);
        delete incoming.topics[0].cols.name.fillspace;
        const update = plan_import(model_of(), incoming).writes
            .find(w => w.topic_name === "cols");
        expect(update.record.fillspace).toBe("");
    });

    test("dropping every flag clears the list rather than writing an empty string", () => {
        const incoming = clone(INCOMING);
        delete incoming.topics[0].cols.name.flag;
        const update = plan_import(model_of(), incoming).writes
            .find(w => w.topic_name === "cols");
        expect(update.record.flag).toEqual([]);
    });

    test("reordering the columns writes their new order", () => {
        const incoming = clone(INCOMING);
        incoming.topics[0].cols = {
            name: INCOMING.topics[0].cols.name,
            id:   INCOMING.topics[0].cols.id,
        };
        const plan = plan_import(model_of(), incoming);
        const by_id = {};
        for(const w of plan.writes.filter(w => w.topic_name === "cols")) {
            by_id[w.record.id] = w.record.order;
        }
        expect(by_id["db.users.name"]).toBe(1);
        expect(by_id["db.users.id"]).toBe(2);
    });

    test("an incoming version ABOVE the stored one is honoured as it is", () => {
        const incoming = clone(INCOMING);
        incoming.topics[0].topic_version = "9";
        incoming.topics[0].cols.name.header = "Full name";
        const update = plan_import(model_of(), incoming).writes
            .find(w => w.topic_name === "topics");
        expect(update.record.topic_version).toBe("9");
    });
});

describe("removing", () => {
    const stored_extra = [{id: "db.users.legacy", value: "legacy", order: 3,
                           header: "Legacy", type: "string",
                           topics: ["topics^db.users^cols"]}];

    test("a column the incoming schema does not declare is deleted", () => {
        const plan = plan_import(model_of(stored_extra), INCOMING);
        const del = plan_deletes(plan);
        expect(del.length).toBe(1);
        expect(del[0].record.id).toBe("db.users.legacy");
        expect(plan.summary.cols_deleted).toBe(1);
    });

    test("prune off MERGES instead: the extra column stays", () => {
        const plan = plan_import(model_of(stored_extra), INCOMING, {prune: false});
        expect(plan_deletes(plan)).toEqual([]);
        expect(plan.writes).toEqual([]);
    });

    test("a whole topic that is gone takes its columns with it, columns first", () => {
        const treedb = build_schema_model({
            treedbs: [{id: "db", schema_version: 1}],
            topics: [{id: "db.old", value: "old", order: 1, treedbs: ["treedbs^db^topics"]}],
            cols: [{id: "db.old.x", value: "x", order: 1, type: "string",
                    topics: ["topics^db.old^cols"]}],
        }).treedbs[0];
        const plan = plan_import(treedb, {id: "db", schema_version: "1", topics: []});
        const deletes = plan_deletes(plan);
        expect(deletes.map(d => d.record.id)).toEqual(["db.old.x", "db.old"]);
    });
});

describe("a treedb the store does not have yet", () => {
    test("every topic and column is a create, and nothing is deleted", () => {
        const plan = plan_import(null, INCOMING);
        expect(plan.summary.topics_created).toBe(1);
        expect(plan.summary.cols_created).toBe(2);
        expect(plan_deletes(plan)).toEqual([]);
    });

    test("the new topic carries its fkey to the treedb", () => {
        const create = plan_import(null, INCOMING).writes[0];
        expect(create.record.treedbs).toEqual(["treedbs^db^topics"]);
        expect(create.record.value).toBe("users");
    });
});

describe("what is not a schema", () => {
    test("says so instead of planning writes", () => {
        expect(plan_import(model_of(), null).conflicts[0].code).toBe("not a schema");
        expect(plan_import(model_of(), {topics: "nope"}).conflicts[0].code).toBe("not a schema");
        expect(plan_import(model_of(), {}).writes).toEqual([]);
    });

    test("a topic with no name is a conflict, not a nameless record", () => {
        const plan = plan_import(model_of(), {id: "db", topics: [{cols: {}}]});
        expect(plan.conflicts[0].code).toBe("topic has no name");
    });

    test("no stored treedb and no id in the incoming schema plans nothing", () => {
        expect(plan_import(null, {topics: []}).conflicts[0].code).toBe("schema has no id");
    });
});
