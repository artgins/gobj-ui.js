/***********************************************************************
 *          schema_to_c.js
 *
 *      The stored schema written back as the C literal it came from.
 *
 *      A treedb's schema has two homes. It is DECLARED in C, as a
 *      `treedb_schema_*.c` string literal compiled into the yuno, and
 *      it is STORED in `treedb_system_schema`, which is what the
 *      operator edits here. The stored one wins at run time, so an
 *      edit made in this console works — and lives nowhere the next
 *      build knows about. Rebuild that yuno on a machine with an empty
 *      store and the column is gone.
 *
 *      `diff-schema` says the two halves have drifted. This is the
 *      other half of that answer: the edit, in the form that can be
 *      pasted into the source, so the declaration catches up with what
 *      the node is actually running.
 *
 *      Two outputs, because they answer different questions:
 *        schema_to_json() — the schema as a value: to diff, to keep, to
 *                           feed back in.
 *        schema_to_c()    — the same value as the literal: single
 *                           quotes, `\n\` continuations, padded, ready
 *                           to paste.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {
    col_flags,
    col_hook,
    col_enum,
    topic_pkey2s,
    as_json,
} from "./schema_model.js";


/*  Column where the `\n\` continuation sits in the .c literals. Not a
 *  law — the files in the tree do not agree on it (68 in the app
 *  schemas, 56 in the meta one) — so it is an option with the most
 *  common value as its default.  */
const DEFAULT_PAD = 68;

/*  The order a topic declares itself in. The store has no order of its
 *  own (a JSON object), so without this the literal comes out shuffled
 *  and every export diffs against the last one.  */
const TOPIC_KEY_ORDER = [
    "id", "pkey", "pkey2s", "system_flag", "tkey",
    "topic_version", "system_topic"
];

/*  Same for a column, in the order the .c literals write it.  */
const COL_KEY_ORDER = [
    "header", "fillspace", "type", "enum", "flag", "hook",
    "default", "placeholder", "description", "template", "properties"
];

/*  Written as quoted strings in the literals even though they are
 *  integer columns. Kept that way so an export can be pasted next to a
 *  hand-written schema without looking foreign.  */
const VERSION_KEYS = ["schema_version", "topic_version"];

/*  Storage-only: they say where the record lives, not what it declares.  */
const COL_SKIP = ["id", "value", "topics", "order", "__md_treedb__"];
const TOPIC_SKIP = ["id", "value", "treedbs", "cols", "order", "__md_treedb__"];

/*  Fields whose stored form may be the JSON text of the value.  */
const JSON_FIELDS = ["enum", "hook", "default", "template", "properties", "pkey2s"];


/*  Escaping a value crosses TWO layers, and the second one is not
 *  JSON's.
 *
 *  The literal is a C string, so a backslash is `\\` and a quote is
 *  `\"` in the source. Then the yuno calls helper_quote2doublequote()
 *  on the whole block before parsing it (c_controlcenter.c and every
 *  other schema loader): EVERY single quote becomes a double one. That
 *  is what makes `'id'` legal JSON — and it means a single quote inside
 *  a VALUE cannot survive as itself, whatever it is delimited with.
 *
 *  So a quote is written as the JSON escape `\u0027`, which that pass
 *  cannot see. Spelled out as constants because counting backslashes
 *  inside a regexp replacement is how the wrong number gets committed.  */
const BACKSLASH      = "\\";
const DQUOTE         = "\"";
const C_BACKSLASH    = BACKSLASH + BACKSLASH;                   /*  \\      -> \      */
const JSON_BACKSLASH = C_BACKSLASH + C_BACKSLASH;               /*  \\\\    -> \\ -> \ */
const JSON_DQUOTE    = C_BACKSLASH + BACKSLASH + DQUOTE;        /*  \\\"    -> \"  -> " */
const JSON_QUOTE     = C_BACKSLASH + "u0027";                   /*  \\u0027 -> \u0027 -> ' */


/***************************************************************
 *  Order the keys of a plain object: the known ones first, in
 *  the declared order, the rest after in a stable one.
 ***************************************************************/
function ordered_entries(obj, order)
{
    let entries = [];
    let seen = {};

    for(let key of order) {
        if(Object.prototype.hasOwnProperty.call(obj, key)) {
            entries.push([key, obj[key]]);
            seen[key] = true;
        }
    }
    let rest = Object.keys(obj).filter(k => !seen[k]);
    rest.sort();
    for(let key of rest) {
        entries.push([key, obj[key]]);
    }
    return entries;
}

/***************************************************************
 *  schema_to_json(treedb) -> the schema as the .c literal holds it
 *
 *      {id, schema_version, topics: [{id, pkey, ..., cols: {...}}]}
 *
 *      `topics` is a LIST (the order is the schema's) and `cols` is a
 *      DICT keyed by column name (its order is the insertion order,
 *      which is the schema's too).
 ***************************************************************/
function schema_to_json(treedb)
{
    if(!treedb) {
        return null;
    }

    /*  A version is an INTEGER column of the store and a QUOTED STRING
     *  in every .c literal in the tree. This output is the literal's
     *  shape, so it is the literal's spelling too — otherwise an export
     *  re-read is not equal to the export.  */
    let version = (v) => {
        return (v === null || v === undefined) ? v : String(v);
    };

    let out = {
        id: treedb.id,
        schema_version: version(treedb.schema_version),
        topics: []
    };

    for(let topic of (treedb.topics || [])) {
        let record = topic.record || {};
        let jn_topic = {id: topic.name};

        for(let [key, value] of Object.entries(record)) {
            if(TOPIC_SKIP.indexOf(key) >= 0) {
                continue;
            }
            if(value === null || value === undefined || value === "") {
                continue;
            }
            jn_topic[key] = JSON_FIELDS.indexOf(key) >= 0 ? as_json(value) : value;
        }
        if(jn_topic.topic_version !== undefined) {
            jn_topic.topic_version = version(jn_topic.topic_version);
        }

        let pkey2s = topic_pkey2s(record);
        if(pkey2s.length === 1) {
            jn_topic.pkey2s = pkey2s[0];    /*  the literals write the single one bare  */
        } else if(pkey2s.length > 1) {
            jn_topic.pkey2s = pkey2s;
        } else {
            delete jn_topic.pkey2s;
        }

        let cols = {};
        for(let col of (topic.cols || [])) {
            let col_record = col.record || {};
            let jn_col = {};
            for(let [key, value] of Object.entries(col_record)) {
                if(COL_SKIP.indexOf(key) >= 0) {
                    continue;
                }
                if(value === null || value === undefined || value === "") {
                    continue;
                }
                jn_col[key] = JSON_FIELDS.indexOf(key) >= 0 ? as_json(value) : value;
            }
            let flags = col_flags(col_record);
            if(flags.length > 0) {
                jn_col.flag = flags;
            } else {
                delete jn_col.flag;
            }
            let hook = col_hook(col_record);
            if(hook) {
                jn_col.hook = hook;
            }
            let e = col_enum(col_record);
            if(e.length > 0) {
                jn_col.enum = e;
            }
            let ordered_col = {};
            for(let [key, value] of ordered_entries(jn_col, COL_KEY_ORDER)) {
                ordered_col[key] = value;
            }
            cols[col.name] = ordered_col;
        }
        jn_topic.cols = cols;

        /*  Re-created in the declared order: an object built by
         *  assignment keeps its insertion order, and the loop above ran
         *  in whatever order the record's keys happened to be in.  */
        let ordered = {};
        for(let [key, value] of ordered_entries(jn_topic, TOPIC_KEY_ORDER)) {
            if(key === "cols") {
                continue;
            }
            ordered[key] = value;
        }
        ordered.cols = jn_topic.cols;
        out.topics.push(ordered);
    }

    return out;
}

/***************************************************************
 *  A scalar as the literal writes it. Single quotes, because the
 *  whole thing lives inside a C string delimited by double ones —
 *  a value that carries a single quote has to swap, and escape.
 ***************************************************************/
function c_scalar(value, key)
{
    if(typeof value === "boolean") {
        return value ? "true" : "false";
    }
    if(typeof value === "number") {
        if(VERSION_KEYS.indexOf(key) >= 0) {
            return `'${value}'`;
        }
        return String(value);
    }
    return `'${c_text(String(value))}'`;
}

/***************************************************************
 *  The characters of a string that cannot be written as
 *  themselves.
 ***************************************************************/
function c_text(text)
{
    return text
        .replace(/\\/g, JSON_BACKSLASH)
        .replace(/"/g, JSON_DQUOTE)
        .replace(/'/g, JSON_QUOTE);
}

/***************************************************************
 *  Render a value at `indent`, appending its lines to `lines`.
 *  Collections always go multiline: that is how every schema in
 *  the tree is written, and a one-line array in the middle of
 *  them reads as a different file.
 ***************************************************************/
function c_value(lines, value, indent, key, trailing)
{
    let pad = " ".repeat(indent);
    let end = trailing ? "," : "";

    if(Array.isArray(value)) {
        lines.push(`${pad}[`);
        for(let i = 0; i < value.length; i++) {
            c_value(lines, value[i], indent + 4, "", i < value.length - 1);
        }
        lines.push(`${pad}]${end}`);
        return;
    }
    if(value && typeof value === "object") {
        lines.push(`${pad}{`);
        let entries = Object.entries(value);
        for(let i = 0; i < entries.length; i++) {
            c_pair(lines, entries[i][0], entries[i][1], indent + 4, i < entries.length - 1);
        }
        lines.push(`${pad}}${end}`);
        return;
    }
    lines.push(`${pad}${c_scalar(value, key)}${end}`);
}

/***************************************************************
 *  Render `'key': value` at `indent`.
 ***************************************************************/
function c_pair(lines, key, value, indent, trailing)
{
    let pad = " ".repeat(indent);
    let end = trailing ? "," : "";

    if(Array.isArray(value)) {
        lines.push(`${pad}'${c_text(key)}': [`);
        for(let i = 0; i < value.length; i++) {
            c_value(lines, value[i], indent + 4, key, i < value.length - 1);
        }
        lines.push(`${pad}]${end}`);
        return;
    }
    if(value && typeof value === "object") {
        lines.push(`${pad}'${c_text(key)}': {`);
        let entries = Object.entries(value);
        for(let i = 0; i < entries.length; i++) {
            c_pair(lines, entries[i][0], entries[i][1], indent + 4, i < entries.length - 1);
        }
        lines.push(`${pad}}${end}`);
        return;
    }
    lines.push(`${pad}'${c_text(key)}': ${c_scalar(value, key)}${end}`);
}

/***************************************************************
 *  schema_to_c(treedb, options) -> the C source text
 *
 *      options {var_name, pad}
 *          var_name  the array's name; defaults to
 *                    `treedb_schema_<treedb id without its prefix>`
 *          pad       column of the `\n\` continuation
 ***************************************************************/
function schema_to_c(treedb, options)
{
    let opts = options || {};
    let json = schema_to_json(treedb);

    if(!json) {
        return "";
    }

    let name = opts.var_name;
    if(!name) {
        let id = String(json.id || "schema");
        name = id.indexOf("treedb_") === 0 ? `treedb_schema_${id.slice("treedb_".length)}`
                                           : `treedb_schema_${id}`;
    }
    let pad = (typeof opts.pad === "number" && opts.pad > 0) ? opts.pad : DEFAULT_PAD;

    let lines = [];
    lines.push("{");
    c_pair(lines, "id", json.id, 4, true);
    c_pair(lines, "schema_version", json.schema_version, 4, true);
    lines.push("    'topics': [");
    for(let i = 0; i < json.topics.length; i++) {
        c_value(lines, json.topics[i], 8, "", i < json.topics.length - 1);
    }
    lines.push("    ]");
    lines.push("}");

    /*  The continuation is what makes it a C literal: every line ends
     *  with `\n\`, padded to the same column so the block reads as a
     *  block. A line longer than the pad keeps one space — losing the
     *  separator would glue the `\n\` to the value.  */
    let body = lines.map((line) => {
        let padding = line.length < pad ? " ".repeat(pad - line.length) : " ";
        return `${line}${padding}\\n\\`;
    });

    return `static char ${name}[]= "\\\n${body.join("\n")}\n";\n`;
}


export {
    DEFAULT_PAD,
    TOPIC_KEY_ORDER,
    COL_KEY_ORDER,
    schema_to_json,
    schema_to_c,
};
