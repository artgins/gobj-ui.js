/***********************************************************************
 *          schema_model.test.js
 *
 *      The three flat topics turned back into a schema, pinned.
 *
 *      Most of these are about the two ways the grouping can go wrong
 *      quietly: a fkey shape the backend answers with and the parser
 *      does not know (the record disappears from its topic), and an id
 *      split on '.' standing in for the link (the record lands under
 *      the wrong topic the day a name carries a dot).
 ***********************************************************************/
import { describe, test, expect } from "vitest";
import {
    DEFAULT_ORDER,
    parse_fkey_ref,
    record_name,
    record_order,
    build_schema_model,
    find_treedb,
    find_topic,
    find_col,
    fkey_ref,
    next_order,
    moved_orders,
    is_empty_value,
} from "./schema_model.js";


function col(treedb, topic, name, order, extra)
{
    return Object.assign({
        id:     `${treedb}.${topic}.${name}`,
        value:  name,
        order:  order,
        topics: [`topics^${treedb}.${topic}^cols`],
    }, extra || {});
}

function topic(treedb, name, order, extra)
{
    return Object.assign({
        id:      `${treedb}.${name}`,
        value:   name,
        order:   order,
        treedbs: [`treedbs^${treedb}^topics`],
    }, extra || {});
}


describe("parse_fkey_ref — the four shapes of one fact", () => {
    test("the bare ref string", () => {
        expect(parse_fkey_ref("topics^db.users^cols")).toEqual([
            {topic_name: "topics", id: "db.users", hook_name: "cols"}
        ]);
    });

    test("a list of ref strings", () => {
        expect(parse_fkey_ref(["topics^db.users^cols"])[0].id).toBe("db.users");
    });

    test("the expanded object", () => {
        expect(parse_fkey_ref([{topic_name: "topics", id: "db.users", hook_name: "cols"}])).toEqual([
            {topic_name: "topics", id: "db.users", hook_name: "cols"}
        ]);
    });

    test("a dict keyed BY the ref", () => {
        expect(parse_fkey_ref({"topics^db.users^cols": true})[0].id).toBe("db.users");
    });

    test("a dict whose value is the expanded node reads the value, not the key", () => {
        const refs = parse_fkey_ref({
            "topics^stale^cols": {topic_name: "topics", id: "db.users", hook_name: "cols"}
        });
        expect(refs[0].id).toBe("db.users");
    });

    test("nothing, and rubbish, contribute nothing", () => {
        expect(parse_fkey_ref(null)).toEqual([]);
        expect(parse_fkey_ref(undefined)).toEqual([]);
        expect(parse_fkey_ref([])).toEqual([]);
        expect(parse_fkey_ref("not-a-ref")).toEqual([]);
        expect(parse_fkey_ref(["a^b"])).toEqual([]);
        expect(parse_fkey_ref([{topic_name: "topics"}])).toEqual([]);
    });
});

describe("record_name / record_order", () => {
    test("the name is the pkey2, not the qualified id", () => {
        expect(record_name({id: "db.users.name", value: "name"})).toBe("name");
    });

    test("no pkey2 falls back to the id — an older store keyed by rowid", () => {
        expect(record_name({id: "181"})).toBe("181");
        expect(record_name({id: "181", value: ""})).toBe("181");
    });

    test("an order arriving as a STRING still sorts as a number", () => {
        expect(record_order({order: "10"})).toBe(10);
    });

    test("no order at all goes last", () => {
        expect(record_order({})).toBe(DEFAULT_ORDER);
        expect(record_order({order: "not a number"})).toBe(DEFAULT_ORDER);
    });
});

describe("build_schema_model", () => {
    const records = {
        treedbs: [
            {id: "treedb_b", schema_version: 3, c_schema_version: 3},
            {id: "treedb_a", schema_version: 24, c_schema_version: 23},
        ],
        topics: [
            topic("treedb_a", "users", 2, {pkey: "id", topic_version: 7}),
            topic("treedb_a", "departments", 1, {pkey: "id", topic_version: 4}),
            topic("treedb_b", "logs", 1),
        ],
        cols: [
            col("treedb_a", "users", "name", 2),
            col("treedb_a", "users", "id", 1),
            col("treedb_a", "departments", "id", 1),
        ],
    };

    test("treedbs carry their topics, topics their columns", () => {
        const model = build_schema_model(records);
        expect(model.treedbs.map(d => d.id)).toEqual(["treedb_a", "treedb_b"]);
        const a = find_treedb(model, "treedb_a");
        expect(a.topics.map(x => x.name)).toEqual(["departments", "users"]);
        expect(find_topic(model, "treedb_a", "users").cols.map(c => c.name)).toEqual(["id", "name"]);
    });

    test("the schema keeps its DECLARED order, not the store's", () => {
        /*  `users` is order 2 and comes first in the record list; the model
            puts `departments` (order 1) ahead of it.  */
        const model = build_schema_model(records);
        expect(find_treedb(model, "treedb_a").topics[0].name).toBe("departments");
    });

    test("versions and topic metadata travel with the entry", () => {
        const model = build_schema_model(records);
        expect(find_treedb(model, "treedb_a").schema_version).toBe(24);
        expect(find_treedb(model, "treedb_a").c_schema_version).toBe(23);
        expect(find_topic(model, "treedb_a", "users").topic_version).toBe(7);
        expect(find_topic(model, "treedb_a", "users").pkey).toBe("id");
    });

    test("grouping follows the FKEY, so a name carrying a dot still lands right", () => {
        /*  Splitting the qualified id on '.' would file this column under a
            treedb called "my" and a topic called "db".  */
        const model = build_schema_model({
            treedbs: [{id: "my.db"}],
            topics:  [{id: "my.db.users", value: "users", treedbs: ["treedbs^my.db^topics"]}],
            cols:    [{id: "my.db.users.name", value: "name",
                       topics: ["topics^my.db.users^cols"]}],
        });
        expect(find_col(model, "my.db", "users", "name")).toBeTruthy();
        expect(model.orphan_cols).toEqual([]);
    });

    test("a record whose parent is gone is an ORPHAN, not a silent drop", () => {
        const model = build_schema_model({
            treedbs: [{id: "treedb_a"}],
            topics:  [topic("treedb_gone", "users", 1)],
            cols:    [col("treedb_a", "vanished", "name", 1)],
        });
        expect(model.orphan_topics.map(x => x.name)).toEqual(["users"]);
        expect(model.orphan_cols.map(x => x.name)).toEqual(["name"]);
        expect(find_treedb(model, "treedb_a").topics).toEqual([]);
    });

    test("equal orders break the tie by name, so two runs draw the same schema", () => {
        const model = build_schema_model({
            treedbs: [{id: "db"}],
            topics:  [topic("db", "zeta"), topic("db", "alpha")],
            cols:    [],
        });
        expect(find_treedb(model, "db").topics.map(x => x.name)).toEqual(["alpha", "zeta"]);
    });

    test("empty and absent inputs give an empty model, never a throw", () => {
        expect(build_schema_model().treedbs).toEqual([]);
        expect(build_schema_model({}).orphan_cols).toEqual([]);
        expect(build_schema_model({treedbs: null, topics: 7}).treedbs).toEqual([]);
    });

    test("a record with no id is not a record", () => {
        const model = build_schema_model({treedbs: [{}, {id: "db"}], topics: [], cols: []});
        expect(model.treedbs.map(d => d.id)).toEqual(["db"]);
    });
});

describe("writing helpers", () => {
    test("fkey_ref composes what a new child must carry", () => {
        expect(fkey_ref("topics", "db.users", "cols")).toBe("topics^db.users^cols");
    });

    test("a new sibling goes AFTER the last one, not into the 9999 crowd", () => {
        expect(next_order([{order: 1}, {order: 3}, {order: 2}])).toBe(4);
    });

    test("siblings that all defaulted to 9999 still start a real numbering", () => {
        expect(next_order([{order: DEFAULT_ORDER}, {order: DEFAULT_ORDER}])).toBe(1);
        expect(next_order([])).toBe(1);
        expect(next_order(null)).toBe(1);
    });

    test("moved_orders writes only the rows whose place actually changed", () => {
        const list = [
            {id: "a", order: 2, record: {order: 2}},
            {id: "b", order: 1, record: {order: 1}},
            {id: "c", order: 3, record: {order: 3}},
        ];
        /*  `a` moved to the front: only a and b change, c keeps order 3.  */
        expect(moved_orders(list)).toEqual([{id: "a", order: 1}, {id: "b", order: 2}]);
    });

    test("a list already in order is no writes at all", () => {
        const list = [
            {id: "a", order: 1, record: {order: 1}},
            {id: "b", order: 2, record: {order: 2}},
        ];
        expect(moved_orders(list)).toEqual([]);
    });

    test("a list of 9999s is renumbered from 1", () => {
        const list = [
            {id: "a", order: DEFAULT_ORDER, record: {}},
            {id: "b", order: DEFAULT_ORDER, record: {}},
        ];
        expect(moved_orders(list)).toEqual([{id: "a", order: 1}, {id: "b", order: 2}]);
    });
});

describe("is_empty_value — what the store answers when a blob was never set", () => {
    test("nothing is nothing", () => {
        expect(is_empty_value(null)).toBe(true);
        expect(is_empty_value(undefined)).toBe(true);
        expect(is_empty_value("")).toBe(true);
    });

    test("an EMPTY COLLECTION is nothing too — this is the whole point", () => {
        /*  A `blob` column that was never set comes back as `{}`, not as
            nothing. Read as a value it puts `'hook': {}` into an exported
            literal, which is a hook with no mapping.  */
        expect(is_empty_value({})).toBe(true);
        expect(is_empty_value([])).toBe(true);
    });

    test("anything with something in it is something", () => {
        expect(is_empty_value({a: 1})).toBe(false);
        expect(is_empty_value(["a"])).toBe(false);
        expect(is_empty_value("x")).toBe(false);
        expect(is_empty_value(0)).toBe(false);
        expect(is_empty_value(false)).toBe(false);
    });
});
