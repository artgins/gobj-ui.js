/***********************************************************************
 *          schema_to_diagram.test.js
 *
 *      The graph of a schema as text, pinned on a small schema that has
 *      every case: a self-referent hook, a hook to another topic, one
 *      hook filling two topics, a pkey2, a tkey, required and inherited
 *      fields, and the main topic.
 ***********************************************************************/
import { describe, test, expect } from "vitest";
import { schema_to_diagram } from "./schema_to_diagram.js";


const SCHEMA = {
    id: "treedb_sample",
    schema_version: "4",
    topics: [
        {
            id: "departments",
            pkey: "id",
            main_topic: true,
            cols: {
                id:             {type: "string", flag: ["persistent", "required"]},
                departments:    {type: "dict", flag: ["hook"], hook: {departments: "department_id"}},
                department_id:  {type: "string", flag: ["fkey"]},
                users:          {type: "dict", flag: ["hook"], hook: {users: "departments"}},
                managers:       {type: "list", flag: ["hook"],
                                 hook: {users: "manager", departments: "manager"}},
                manager:        {type: "array", flag: ["fkey"]},
            }
        },
        {
            id: "users",
            pkey: "id",
            pkey2s: "name",
            tkey: "tm",
            cols: {
                id:             {type: "string", flag: "required"},
                name:           {type: "string", flag: ["persistent"]},
                enabled:        {type: "boolean", flag: ["persistent", "inherit"]},
                tm:             {type: "integer", flag: ["time"]},
                departments:    {type: "array", flag: ["fkey"]},
                manager:        {type: "array", flag: ["fkey"]},
            }
        },
    ]
};

const EXPECTED = `treedb_sample  (schema_version 4)

{}  dict hook   (N unique children)
[]  list hook   (n not-unique children)
()  string hook (1 unique child)
(↖) 1 fkey      (1 parent)
[↖] n fkeys     (n parents)
{↖} N fkeys     (N parents)

(2) pkey2 - secondary key
(t) tkey  - time key
*   field required
=   field inherited


          departments  (main_topic)
        ┌───────────────────────────┐
        │* id                       │
        │            departments {} │ ◀─┐
        │         department_id (↖) │ ──┘
        │                  users {} │ ◀─────┐
        │               managers [] │ ◀─┬───────┐
        │               manager [↖] │ ──┘   │   │
        └───────────────────────────┘       │   │
                                            │   │
                    users                   │   │
        ┌───────────────────────────┐       │   │
        │* id                       │       │   │
        │  name (2)                 │       │   │
        │= enabled                  │       │   │
        │  tm (t)                   │       │   │
        │           departments [↖] │ ──────┘   │
        │               manager [↖] │ ──────────┘
        └───────────────────────────┘`;


describe("schema_to_diagram", () => {
    const diagram = schema_to_diagram(SCHEMA);

    test("the whole picture", () => {
        expect(diagram).toBe(EXPECTED);
    });

    test("crossing another link's lane is a bridge, not a junction", () => {
        const managers = diagram.split("\n").find((l) => l.includes("managers []"));
        expect(managers).toContain("◀─┬───────┐");
        expect(managers).not.toContain("┼");
    });

    test("no line ends in a space", () => {
        for(const line of diagram.split("\n")) {
            expect(line).toBe(line.trimEnd());
        }
    });

    test("a link to a column that does not exist is not drawn", () => {
        const broken = JSON.parse(JSON.stringify(SCHEMA));
        broken.topics[0].cols.users.hook = {users: "nowhere"};
        expect(schema_to_diagram(broken)).not.toContain("◀─────┐");
    });

    test("nothing to draw is an empty string, not a throw", () => {
        expect(schema_to_diagram(null)).toBe("");
        expect(schema_to_diagram({id: "x"})).toBe("");
    });
});
