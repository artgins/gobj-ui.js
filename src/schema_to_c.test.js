/***********************************************************************
 *          schema_to_c.test.js
 *
 *      The stored schema written back as its C literal, pinned.
 *
 *      The test that matters is the ROUND TRIP: the emitted text is put
 *      through the same two steps the yuno puts it through — the C
 *      compiler's unescaping and helper_quote2doublequote() — and the
 *      JSON that comes out must be the JSON that went in. Everything
 *      else about the format is cosmetic; that is the part that decides
 *      whether the paste compiles and opens.
 ***********************************************************************/
import { describe, test, expect } from "vitest";
import { build_schema_model } from "./schema_model.js";
import { schema_to_json, schema_to_c } from "./schema_to_c.js";


/***************************************************************
 *  What the yuno does to the literal before parsing it:
 *      1. the C compiler resolves `\<newline>` continuations and
 *         the `\\` / `\"` escapes,
 *      2. helper_quote2doublequote() turns EVERY ' into ",
 *      3. jansson parses what is left.
 ***************************************************************/
function load_like_the_yuno(source)
{
    const start = source.indexOf('"\\\n');
    const end = source.lastIndexOf('";');
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);

    let body = source.slice(start + 3, end);

    /*  Line continuations: a line ends with `\n\` + newline, which the
        compiler turns into one newline.  */
    let text = body.split("\\n\\\n").join("\n");
    text = text.replace(/\\n\\$/, "");

    /*  C escapes, innermost last: `\\` is a backslash, `\"` a quote.  */
    let out = "";
    for(let i = 0; i < text.length; i++) {
        if(text[i] === "\\" && i + 1 < text.length) {
            const next = text[i + 1];
            if(next === "\\") {
                out += "\\";
                i++;
                continue;
            }
            if(next === '"') {
                out += '"';
                i++;
                continue;
            }
        }
        out += text[i];
    }

    /*  helper_quote2doublequote(): every single quote, no exception.  */
    out = out.split("'").join('"');

    return JSON.parse(out);
}


const MODEL = build_schema_model({
    treedbs: [{id: "treedb_sample", schema_version: 4}],
    topics: [
        {id: "treedb_sample.departments", value: "departments", order: 1, pkey: "id",
         system_flag: "sf_string_key", topic_version: 2,
         treedbs: ["treedbs^treedb_sample^topics"]},
        {id: "treedb_sample.users", value: "users", order: 2, pkey: "id",
         system_flag: "sf_string_key", topic_version: 3, pkey2s: "name",
         treedbs: ["treedbs^treedb_sample^topics"]},
    ],
    cols: [
        {id: "treedb_sample.departments.id", value: "id", order: 1, header: "Id",
         fillspace: 20, type: "string", flag: ["persistent", "required"],
         topics: ["topics^treedb_sample.departments^cols"]},
        {id: "treedb_sample.departments.users", value: "users", order: 2,
         header: "Users", fillspace: 20, type: "dict", flag: ["hook"],
         hook: {users: "departments"},
         topics: ["topics^treedb_sample.departments^cols"]},
        {id: "treedb_sample.users.id", value: "id", order: 1, header: "Id",
         fillspace: 20, type: "string", flag: ["persistent"],
         topics: ["topics^treedb_sample.users^cols"]},
        {id: "treedb_sample.users.name", value: "name", order: 2, header: "Name",
         fillspace: 10, type: "string", flag: ["persistent", "writable"],
         topics: ["topics^treedb_sample.users^cols"]},
        {id: "treedb_sample.users.departments", value: "departments", order: 3,
         header: "Departments", fillspace: 20, type: "array", flag: ["fkey"],
         topics: ["topics^treedb_sample.users^cols"]},
    ],
});
const TREEDB = MODEL.treedbs[0];


describe("schema_to_json", () => {
    const json = schema_to_json(TREEDB);

    test("the shape of the literal: topics a LIST, cols a DICT", () => {
        expect(Array.isArray(json.topics)).toBe(true);
        expect(json.topics.map(t => t.id)).toEqual(["departments", "users"]);
        expect(Array.isArray(json.topics[0].cols)).toBe(false);
        expect(Object.keys(json.topics[1].cols)).toEqual(["id", "name", "departments"]);
    });

    test("a topic is named by its NAME, a column by its own", () => {
        expect(json.topics[0].id).toBe("departments");
        expect(json.topics[0].cols.users.type).toBe("dict");
    });

    test("no storage field survives the export", () => {
        for(const key of ["value", "treedbs", "order"]) {
            expect(json.topics[0][key]).toBeUndefined();
        }
        for(const key of ["value", "topics", "order"]) {
            expect(json.topics[0].cols.id[key]).toBeUndefined();
        }
    });

    test("a single pkey2 is written bare, as the literals write it", () => {
        expect(json.topics[1].pkey2s).toBe("name");
    });

    test("the keys come out in the order the .c files declare them", () => {
        expect(Object.keys(json.topics[1]).slice(0, 3)).toEqual(["id", "pkey", "pkey2s"]);
        expect(Object.keys(json.topics[0].cols.id))
            .toEqual(["header", "fillspace", "type", "flag"]);
    });

    test("no treedb is null, not a throw", () => {
        expect(schema_to_json(null)).toBe(null);
    });
});

describe("schema_to_c — the round trip", () => {
    const source = schema_to_c(TREEDB);

    test("it is a C array declaration with the conventional name", () => {
        expect(source.startsWith("static char treedb_schema_sample[]= \"\\\n")).toBe(true);
        expect(source.trimEnd().endsWith('";')).toBe(true);
    });

    test("every line carries the continuation", () => {
        const body = source.split("\n").slice(1, -2);
        for(const line of body) {
            expect(line.endsWith("\\n\\")).toBe(true);
        }
    });

    test("loaded the way the yuno loads it, it is the schema it came from", () => {
        expect(load_like_the_yuno(source)).toEqual(schema_to_json(TREEDB));
    });

    test("the caller can name the array and set the continuation column", () => {
        const custom = schema_to_c(TREEDB, {var_name: "my_schema", pad: 40});
        expect(custom.startsWith("static char my_schema[]=")).toBe(true);
        expect(load_like_the_yuno(custom)).toEqual(schema_to_json(TREEDB));
    });

    test("a version is quoted, a fillspace is not — as the literals write them", () => {
        expect(source).toContain("'schema_version': '4'");
        expect(source).toContain("'topic_version': '2'");
        expect(source).toContain("'fillspace': 20");
    });

    test("a boolean stays a boolean", () => {
        const model = build_schema_model({
            treedbs: [{id: "treedb_x", schema_version: 1}],
            topics: [{id: "treedb_x.t", value: "t", system_topic: true,
                      treedbs: ["treedbs^treedb_x^topics"]}],
            cols: [{id: "treedb_x.t.id", value: "id", type: "string",
                    topics: ["topics^treedb_x.t^cols"]}],
        });
        const src = schema_to_c(model.treedbs[0]);
        expect(src).toContain("'system_topic': true");
        expect(load_like_the_yuno(src).topics[0].system_topic).toBe(true);
    });

    test("no treedb is an empty string, not a broken declaration", () => {
        expect(schema_to_c(null)).toBe("");
    });
});

describe("the characters that cannot be written as themselves", () => {
    function with_header(header)
    {
        const model = build_schema_model({
            treedbs: [{id: "treedb_x", schema_version: 1}],
            topics: [{id: "treedb_x.t", value: "t", treedbs: ["treedbs^treedb_x^topics"]}],
            cols: [{id: "treedb_x.t.id", value: "id", type: "string", header: header,
                    topics: ["topics^treedb_x.t^cols"]}],
        });
        return schema_to_c(model.treedbs[0]);
    }

    test("a SINGLE QUOTE survives — the pass that rewrites them cannot see \\u0027", () => {
        const src = with_header("Client's name");
        expect(src).toContain("\\\\u0027");
        expect(load_like_the_yuno(src).topics[0].cols.id.header).toBe("Client's name");
    });

    test("a double quote survives both layers", () => {
        const src = with_header('Say "hi"');
        expect(load_like_the_yuno(src).topics[0].cols.id.header).toBe('Say "hi"');
    });

    test("a backslash survives both layers", () => {
        const src = with_header("a\\b");
        expect(load_like_the_yuno(src).topics[0].cols.id.header).toBe("a\\b");
    });

    test("all three at once", () => {
        const header = 'a\\b "c" d\'e';
        expect(load_like_the_yuno(with_header(header)).topics[0].cols.id.header)
            .toBe(header);
    });
});
