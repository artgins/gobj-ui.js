/***********************************************************************
 *          schema_to_diagram.js
 *
 *      The graph of a treedb schema, drawn as text.
 *
 *      It is the comment that heads every `treedb_schema_<db>.c`: one
 *      box per topic, in the order the schema declares them, a row per
 *      column, and every hook -> fkey link drawn as a line from the
 *      hook's row (`◀`) to the fkey's row. It is DERIVED from the
 *      schema, never drawn by hand, so the file that holds the literal
 *      can be replaced whole with an export and its picture is never
 *      behind it.
 *
 *      Each link runs down its own LANE to the right of the boxes, the
 *      shorter links nearer to them, so no search is needed to lay it
 *      out. Where the line of one link crosses the lane of ANOTHER, the
 *      horizontal passes over it (`─`): a junction (`┬`, `┴`) is only
 *      ever drawn where the lines of one hook meet.
 *
 *      The input is the schema as its literal holds it (what
 *      schema_to_json() answers, or the parsed literal itself):
 *          {id, schema_version, topics: [{id, pkey2s, tkey, main_topic,
 *                                         cols: {name: {type, flag, hook}}}]}
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/


/*  Where the boxes start, and their narrowest inside: the widths of
 *  the diagrams drawn by hand before this, so a generated one reads
 *  like them.  */
const INDENT = 8;
const MIN_INNER = 27;

/*  From a box's right edge to its first lane, and between lanes.  */
const LANE_GAP = 4;

const LEGEND = [
    "{}  dict hook   (N unique children)",
    "[]  list hook   (n not-unique children)",
    "()  string hook (1 unique child)",
    "(↖) 1 fkey      (1 parent)",
    "[↖] n fkeys     (n parents)",
    "{↖} N fkeys     (N parents)",
    "",
    "(2) pkey2 - secondary key",
    "(t) tkey  - time key",
    "*   field required",
    "=   field inherited",
];

/*  A cell of a line is a set of the directions it joins; the glyph is
 *  what those directions draw.  */
const L = 1, R = 2, U = 4, D = 8;
const GLYPH = {
    [L|R]: "─", [L]: "─", [R]: "─",
    [U|D]: "│", [U]: "│", [D]: "│",
    [R|D]: "┌", [L|D]: "┐", [R|U]: "└", [L|U]: "┘",
    [L|R|D]: "┬", [L|R|U]: "┴", [U|D|R]: "├", [U|D|L]: "┤",
    [L|R|U|D]: "┼",
};


/***************************************************************
 *  A value that may be one string or a list of them, as a list.
 ***************************************************************/
function as_list(value)
{
    if(typeof value === "string") {
        return value ? [value] : [];
    }
    if(Array.isArray(value)) {
        let list = [];
        for(let v of value) {
            list.push(...as_list(v));
        }
        return list;
    }
    if(value && typeof value === "object") {
        let list = [];
        for(let v of Object.values(value)) {
            list.push(...as_list(v));
        }
        return list;
    }
    return [];
}

/***************************************************************
 *  The columns of a topic as [name, desc] in declared order: a
 *  dict in the literals, a list of {id} in some stores.
 ***************************************************************/
function topic_cols(topic)
{
    let cols = topic.cols || {};
    if(Array.isArray(cols)) {
        return cols.map((c) => [c.id, c]);
    }
    return Object.entries(cols);
}

/***************************************************************
 *  What a link column looks like at its end of the line.
 ***************************************************************/
function hook_marker(type)
{
    if(type === "dict" || type === "object") {
        return "{}";
    }
    if(type === "array" || type === "list") {
        return "[]";
    }
    return "()";
}

function fkey_marker(type)
{
    if(type === "dict" || type === "object") {
        return "{↖}";
    }
    if(type === "array" || type === "list") {
        return "[↖]";
    }
    return "(↖)";
}

/***************************************************************
 *  One row of a box: the text inside it, and whether it is a
 *  link column (written against the right edge, where its line
 *  leaves the box).
 ***************************************************************/
function col_row(topic, name, desc, pkey2s)
{
    let flags = as_list(desc.flag);
    if(flags.indexOf("hook") >= 0) {
        return {text: `${name} ${hook_marker(desc.type)}`, link: true};
    }
    if(flags.indexOf("fkey") >= 0) {
        return {text: `${name} ${fkey_marker(desc.type)}`, link: true};
    }
    let mark = flags.indexOf("required") >= 0 ? "*" :
               flags.indexOf("inherit") >= 0 ? "=" : " ";
    let text = `${mark} ${name}`;
    if(pkey2s.indexOf(name) >= 0) {
        text += " (2)";
    }
    if(topic.tkey && topic.tkey === name) {
        text += " (t)";
    }
    return {text: text, link: false};
}

/***************************************************************
 *  schema_to_diagram(schema) -> the text, one string with a
 *  newline per line and no trailing spaces.
 ***************************************************************/
function schema_to_diagram(schema)
{
    if(!schema || !Array.isArray(schema.topics)) {
        return "";
    }

    /*
     *  The boxes, and where each column landed
     */
    let boxes = [];
    let inner = MIN_INNER;
    for(let topic of schema.topics) {
        let pkey2s = as_list(topic.pkey2s);
        let rows = topic_cols(topic).map(([name, desc]) =>
            Object.assign({name: name}, col_row(topic, name, desc || {}, pkey2s))
        );
        for(let row of rows) {
            inner = Math.max(inner, row.text.length + 2);
        }
        let title = topic.id + (topic.main_topic ? "  (main_topic)" : "");
        inner = Math.max(inner, title.length);
        boxes.push({topic: topic, title: title, rows: rows});
    }

    let lines = [];
    let where = {};     /*  "topic`col" -> line index  */
    let edge = INDENT + inner + 1;

    lines.push(`${schema.id || ""}  (schema_version ${schema.schema_version || "?"})`);
    lines.push("");
    for(let l of LEGEND) {
        lines.push(l);
    }
    lines.push("");
    lines.push("");

    for(let box of boxes) {
        let pad = Math.max(0, Math.floor((inner + 2 - box.title.length) / 2));
        lines.push(" ".repeat(INDENT + pad) + box.title);
        lines.push(" ".repeat(INDENT) + "┌" + "─".repeat(inner) + "┐");
        for(let row of box.rows) {
            let text = row.link ?
                row.text.padStart(inner - 1) + " " :
                row.text.padEnd(inner);
            where[`${box.topic.id}\`${row.name}`] = lines.length;
            lines.push(" ".repeat(INDENT) + "│" + text + "│");
        }
        lines.push(" ".repeat(INDENT) + "└" + "─".repeat(inner) + "┘");
        lines.push("");
    }

    /*
     *  The links: from a hook's row to the row of the fkey it fills
     */
    let links = [];
    for(let topic of schema.topics) {
        for(let [name, desc] of topic_cols(topic)) {
            desc = desc || {};
            if(as_list(desc.flag).indexOf("hook") < 0) {
                continue;
            }
            let hook = desc.hook;
            if(!hook || typeof hook !== "object" || Array.isArray(hook)) {
                continue;
            }
            for(let [child_topic, fkey_col] of Object.entries(hook)) {
                let from = where[`${topic.id}\`${name}`];
                let to = where[`${child_topic}\`${fkey_col}`];
                if(from === undefined || to === undefined) {
                    continue;
                }
                links.push({from: from, to: to,
                            top: Math.min(from, to), bottom: Math.max(from, to)});
            }
        }
    }

    /*  Shorter links nearer the boxes: a lane holds links whose rows
     *  do not overlap.  */
    links.sort((a, b) => (a.bottom - a.top) - (b.bottom - b.top) || a.top - b.top);
    let lanes = [];
    for(let link of links) {
        let k = 0;
        for(;; k++) {
            let used = lanes[k] || [];
            let free = used.every((o) => link.bottom < o.top || o.bottom < link.top);
            if(free) {
                break;
            }
        }
        lanes[k] = (lanes[k] || []).concat([link]);
        link.x = edge + LANE_GAP + LANE_GAP * k;
    }

    /*
     *  Draw them on a grid of direction bits, then as glyphs
     */
    /*  Bits are kept per link: two links meeting in a cell is a
     *  CROSSING unless they share a hook row or an fkey row.  */
    let cells = {};
    let fixed = {};
    let join = (id, y, x, b) => {
        let key = `${y},${x}`;
        let cell = cells[key] = cells[key] || {};
        cell[id] = (cell[id] || 0) | b;
    };
    let hline = (id, y, x1, x2) => {
        for(let x = x1; x <= x2; x++) {
            join(id, y, x, (x > x1 ? L : 0) | (x < x2 ? R : 0));
        }
    };
    let vline = (id, x, y1, y2) => {
        for(let y = y1; y <= y2; y++) {
            join(id, y, x, (y > y1 ? U : 0) | (y < y2 ? D : 0));
        }
    };
    links.forEach((link, id) => {
        hline(id, link.from, edge + 2, link.x);
        hline(id, link.to, edge + 2, link.x);
        vline(id, link.x, link.top, link.bottom);
        fixed[`${link.from},${edge + 2}`] = "◀";
    });
    let bits = {};
    for(let [key, cell] of Object.entries(cells)) {
        let parts = Object.values(cell);
        let passing = parts.filter((b) => b === (L|R)).length;
        let lane = parts.filter((b) => b === (U|D)).length;
        let across = passing && lane && passing + lane === parts.length;
        bits[key] = across ? (L|R) : parts.reduce((a, b) => a | b, 0);
    }

    let out = lines.map((line, y) => {
        let chars = Array.from(line);
        for(let key of Object.keys(bits)) {
            let [ky, kx] = key.split(",").map(Number);
            if(ky !== y) {
                continue;
            }
            while(chars.length <= kx) {
                chars.push(" ");
            }
            chars[kx] = fixed[key] || GLYPH[bits[key]] || " ";
        }
        return chars.join("").replace(/\s+$/, "");
    });

    while(out.length && out[out.length - 1] === "") {
        out.pop();
    }
    return out.join("\n");
}


export {
    schema_to_diagram,
};
