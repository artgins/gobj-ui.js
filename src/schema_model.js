/***********************************************************************
 *          schema_model.js
 *
 *      A SCHEMA out of the three meta-topics that store it.
 *
 *      `treedb_system_schema` keeps every schema of a yuno as DATA, in
 *      three flat topics — `treedbs`, `topics`, `cols` — linked by
 *      fkeys. That is the right STORAGE and the wrong thing to put in
 *      front of an operator: adding one column to one topic means
 *      finding it in a table holding every column of every topic of
 *      every treedb the yuno has.
 *
 *      This module turns those three lists back into what they
 *      describe: treedb -> topics -> columns, each in its declared
 *      `order`. Pure, so the editor's model can be tested with no DOM
 *      and no backend — the gclass fetches and draws, this decides
 *      what the records MEAN.
 *
 *      TWO THINGS IT EXISTS TO STATE ONCE:
 *
 *      1. A record is grouped by its FKEY, not by its id. The id is
 *         qualified (`<treedb>.<topic>.<column>`) and reading it back
 *         with a split on '.' works right up to the first treedb or
 *         topic whose name carries one. The fkey is the link the store
 *         itself uses; the id is only the fallback for a record whose
 *         fkey never arrived.
 *
 *      2. A fkey reaches this code in FOUR shapes, because `nodes`
 *         answers differently depending on the options it was called
 *         with: the bare ref string, the expanded object, a list of
 *         either, or a dict keyed by the ref. All four are the same
 *         fact and parse_fkey_ref() flattens them to it.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/

/*  What a node with nothing to say about its place gets: the projector
 *  stamps `order` from the position the C schema declares, and a record
 *  created by hand says nothing, so it goes last (treedb_system_schema.c).  */
const DEFAULT_ORDER = 9999;

/*  The separator of a fkey reference, `<topic>^<id>^<hook>`. It is why an
 *  id may never carry one (treedb_system_schema.c).  */
const REF_SEP = "^";


/***************************************************************
 *  parse_fkey_ref(value) -> [{topic_name, id, hook_name}, ...]
 *
 *      Every shape a fkey column can arrive in, flattened to the
 *      refs it names. Anything unrecognizable contributes nothing —
 *      a schema drawn without one link beats a screen that throws.
 ***************************************************************/
function parse_fkey_ref(value)
{
    let refs = [];

    let push_one = (v) => {
        if(typeof v === "string") {
            let parts = v.split(REF_SEP);
            if(parts.length !== 3) {
                return;
            }
            refs.push({topic_name: parts[0], id: parts[1], hook_name: parts[2]});
            return;
        }
        if(v && typeof v === "object") {
            let id = v.id;
            if(typeof id !== "string" || id.length === 0) {
                return;
            }
            refs.push({
                topic_name: v.topic_name || "",
                id:         id,
                hook_name:  v.hook_name || ""
            });
        }
    };

    if(value === null || value === undefined) {
        return refs;
    }
    if(typeof value === "string") {
        push_one(value);
        return refs;
    }
    if(Array.isArray(value)) {
        for(let v of value) {
            push_one(v);
        }
        return refs;
    }
    if(typeof value === "object") {
        /*  A dict fkey is keyed BY the ref and carries `true` (or the
         *  expanded node) as the value: the key is the fact.  */
        for(let [key, v] of Object.entries(value)) {
            if(v && typeof v === "object" && typeof v.id === "string") {
                push_one(v);
            } else {
                push_one(key);
            }
        }
    }

    return refs;
}

/***************************************************************
 *  The id of the FIRST parent a record names, or "" when it
 *  names none. A record has one parent here — a column belongs to
 *  one topic, a topic to one treedb — and a second ref would be a
 *  store this editor cannot draw anyway.
 ***************************************************************/
function parent_id(record, fkey_col)
{
    let refs = parse_fkey_ref(record ? record[fkey_col] : null);

    return refs.length > 0 ? refs[0].id : "";
}

/***************************************************************
 *  The name a record is KNOWN by, which is not what it is keyed
 *  by: `topics` and `cols` key by the qualified id and carry the
 *  bare name in `value` (its pkey2). An older store that still
 *  keyed by rowid has no `value` worth showing, so the id stands
 *  in — the same fallback as node_label().
 ***************************************************************/
function record_name(record)
{
    if(!record) {
        return "";
    }
    if(typeof record.value === "string" && record.value.length > 0) {
        return record.value;
    }
    return typeof record.id === "string" ? record.id : "";
}

/***************************************************************
 *  The `order` of a record as a NUMBER, whatever the store put
 *  there: an integer column read back from JSON may arrive as a
 *  string, and comparing "10" with 9 sorts the schema wrong.
 ***************************************************************/
function record_order(record)
{
    let order = record ? record.order : undefined;

    if(typeof order === "number" && isFinite(order)) {
        return order;
    }
    if(typeof order === "string" && order.trim().length > 0) {
        let n = Number(order);
        if(isFinite(n)) {
            return n;
        }
    }
    return DEFAULT_ORDER;
}

/***************************************************************
 *  Sort in place by `order`, ties broken by name so a schema
 *  whose records all default to 9999 still draws the same way
 *  twice.
 ***************************************************************/
function sort_by_order(list)
{
    list.sort((a, b) => {
        if(a.order !== b.order) {
            return a.order - b.order;
        }
        return a.name < b.name ? -1 : (a.name > b.name ? 1 : 0);
    });
    return list;
}

/***************************************************************
 *  build_schema_model({treedbs, topics, cols}) -> model
 *
 *      model = {
 *          treedbs: [{
 *              id, name, record,
 *              schema_version, c_schema_version, system_schema_version,
 *              topics: [{
 *                  id, name, order, record,
 *                  pkey, topic_version, system_topic,
 *                  cols: [{id, name, order, record}]
 *              }]
 *          }],
 *          orphan_topics: [...],   topics whose treedb is not in the store
 *          orphan_cols:   [...]    columns whose topic is not in the store
 *      }
 *
 *      An orphan is NOT dropped. A column whose topic was deleted is
 *      exactly the kind of leftover an operator opens this editor to
 *      find, and a model that hides it makes the editor lie.
 ***************************************************************/
function build_schema_model(records)
{
    let r = records || {};
    let treedb_rows = Array.isArray(r.treedbs) ? r.treedbs : [];
    let topic_rows  = Array.isArray(r.topics)  ? r.topics  : [];
    let col_rows    = Array.isArray(r.cols)    ? r.cols    : [];

    let treedbs = [];
    let by_treedb_id = {};
    for(let record of treedb_rows) {
        if(!record || typeof record.id !== "string") {
            continue;
        }
        let entry = {
            id:                    record.id,
            name:                  record.id,
            record:                record,
            schema_version:        record.schema_version,
            c_schema_version:      record.c_schema_version,
            system_schema_version: record.system_schema_version,
            topics:                []
        };
        treedbs.push(entry);
        by_treedb_id[entry.id] = entry;
    }

    let orphan_topics = [];
    let by_topic_id = {};
    for(let record of topic_rows) {
        if(!record || typeof record.id !== "string") {
            continue;
        }
        let entry = {
            id:            record.id,
            name:          record_name(record),
            order:         record_order(record),
            record:        record,
            treedb_id:     parent_id(record, "treedbs"),
            pkey:          record.pkey || "",
            pkey2s:        record.pkey2s,
            system_flag:   record.system_flag || "",
            tkey:          record.tkey || "",
            topic_version: record.topic_version,
            system_topic:  !!record.system_topic,
            cols:          []
        };
        by_topic_id[entry.id] = entry;

        let parent = by_treedb_id[entry.treedb_id];
        if(parent) {
            parent.topics.push(entry);
        } else {
            orphan_topics.push(entry);
        }
    }

    let orphan_cols = [];
    for(let record of col_rows) {
        if(!record || typeof record.id !== "string") {
            continue;
        }
        let entry = {
            id:       record.id,
            name:     record_name(record),
            order:    record_order(record),
            record:   record,
            topic_id: parent_id(record, "topics")
        };

        let parent = by_topic_id[entry.topic_id];
        if(parent) {
            parent.cols.push(entry);
        } else {
            orphan_cols.push(entry);
        }
    }

    for(let treedb of treedbs) {
        sort_by_order(treedb.topics);
        for(let topic of treedb.topics) {
            sort_by_order(topic.cols);
        }
    }
    for(let topic of orphan_topics) {
        sort_by_order(topic.cols);
    }
    treedbs.sort((a, b) => {
        return a.id < b.id ? -1 : (a.id > b.id ? 1 : 0);
    });
    sort_by_order(orphan_topics);
    sort_by_order(orphan_cols);

    return {
        treedbs:       treedbs,
        orphan_topics: orphan_topics,
        orphan_cols:   orphan_cols
    };
}

/***************************************************************
 *  Is there a value here at all?
 *
 *  The store answers a `blob` column that was never set with an
 *  EMPTY COLLECTION, not with nothing: `enum: {}`, `hook: {}`,
 *  `default: {}`. Read as "a value", those turn every export into
 *  a schema full of empty objects — and `'hook': {}` in a literal
 *  is a hook with no mapping, which is a link the treedb builds
 *  and nothing writes.
 ***************************************************************/
function is_empty_value(value)
{
    if(value === null || value === undefined || value === "") {
        return true;
    }
    if(Array.isArray(value)) {
        return value.length === 0;
    }
    if(typeof value === "object") {
        return Object.keys(value).length === 0;
    }
    return false;
}


/***************************************************************
 *  The fields of a column that are DECLARED as one thing and
 *  STORED as another.
 *
 *  `hook`, `enum`, `default`, `pkey2s` and `properties` are `blob`
 *  columns of the `cols` topic (treedb_system_schema.c), so what
 *  comes back may be the value or the JSON text of the value,
 *  depending on how it was written — a projection writes the
 *  value, a hand edit through a plain text field writes the text.
 *  `flag` is an array that a single-flag edit can leave as a bare
 *  string. Reading these without saying so is how a hook drawn
 *  from `{"users":"department"}` becomes no hook at all.
 ***************************************************************/
function as_json(value)
{
    if(typeof value !== "string") {
        return value;
    }
    let text = value.trim();
    if(text.length === 0) {
        return null;
    }
    try {
        return JSON.parse(text);
    } catch(e) {
        return value;   /*  plain text that is not JSON: the caller decides  */
    }
}

/*  The flags of a column, always as a list.  */
function col_flags(record)
{
    let flag = record ? record.flag : null;

    if(Array.isArray(flag)) {
        return flag.filter(f => typeof f === "string" && f.length > 0);
    }
    if(typeof flag === "string" && flag.length > 0) {
        let parsed = as_json(flag);
        if(Array.isArray(parsed)) {
            return parsed.filter(f => typeof f === "string" && f.length > 0);
        }
        return [flag];
    }
    return [];
}

function col_has_flag(record, name)
{
    return col_flags(record).indexOf(name) >= 0;
}

/*  The hook mapping of a column, `{child_topic: fkey_col}`, or null.  */
function col_hook(record)
{
    let hook = as_json(record ? record.hook : null);

    if(hook && typeof hook === "object" && !Array.isArray(hook)) {
        return hook;
    }
    return null;
}

/*  The enum list of a column, always as a list.  */
function col_enum(record)
{
    let e = as_json(record ? record.enum : null);

    if(Array.isArray(e)) {
        return e;
    }
    return [];
}

/*  The secondary keys a topic declares: a list here, a bare string
 *  in the schema literal (see node_label.js).  */
function topic_pkey2s(record)
{
    let pkey2s = as_json(record ? record.pkey2s : null);

    if(Array.isArray(pkey2s)) {
        return pkey2s.filter(k => typeof k === "string" && k.length > 0);
    }
    if(typeof pkey2s === "string" && pkey2s.length > 0) {
        return [pkey2s];
    }
    return [];
}


/***************************************************************
 *  Lookups by id. The editor addresses a position by NAME (the
 *  url carries `<treedb>/<topic>`), so both are offered.
 ***************************************************************/
function find_treedb(model, treedb_id)
{
    if(!model || !Array.isArray(model.treedbs)) {
        return null;
    }
    for(let treedb of model.treedbs) {
        if(treedb.id === treedb_id) {
            return treedb;
        }
    }
    return null;
}

function find_topic(model, treedb_id, topic_name)
{
    let treedb = find_treedb(model, treedb_id);

    if(!treedb) {
        return null;
    }
    for(let topic of treedb.topics) {
        if(topic.name === topic_name || topic.id === topic_name) {
            return topic;
        }
    }
    return null;
}

function find_col(model, treedb_id, topic_name, col_name)
{
    let topic = find_topic(model, treedb_id, topic_name);

    if(!topic) {
        return null;
    }
    for(let col of topic.cols) {
        if(col.name === col_name || col.id === col_name) {
            return col;
        }
    }
    return null;
}

/***************************************************************
 *  The fkey a NEW record must carry to belong to `parent_id`.
 *  Written here because the editor is the only writer that has to
 *  compose one, and getting the hook name wrong links the record
 *  to nothing while the write still succeeds.
 ***************************************************************/
function fkey_ref(parent_topic, parent_id_, hook_name)
{
    return `${parent_topic}${REF_SEP}${parent_id_}${REF_SEP}${hook_name}`;
}

/***************************************************************
 *  Where a new sibling goes: after the last one. The store's own
 *  default (9999) would put every hand-made column in the same
 *  place and let their names decide the schema's order.
 ***************************************************************/
function next_order(siblings)
{
    let max = 0;

    if(Array.isArray(siblings)) {
        for(let s of siblings) {
            let order = (s && typeof s.order === "number") ? s.order : DEFAULT_ORDER;
            if(order < DEFAULT_ORDER && order > max) {
                max = order;
            }
        }
    }
    return max + 1;
}

/***************************************************************
 *  Renumber a list AFTER a move, as the writes it takes: only the
 *  records whose order actually changed, so a drag of one row in a
 *  40-column topic is not 40 writes.
 *
 *      moved_orders(list) -> [{id, order}, ...]
 ***************************************************************/
function moved_orders(list)
{
    let writes = [];

    if(!Array.isArray(list)) {
        return writes;
    }
    for(let i = 0; i < list.length; i++) {
        let entry = list[i];
        let order = i + 1;
        if(!entry || typeof entry.id !== "string") {
            continue;
        }
        if(entry.order !== order) {
            writes.push({id: entry.id, order: order});
        }
    }
    return writes;
}


export {
    DEFAULT_ORDER,
    REF_SEP,
    parse_fkey_ref,
    as_json,
    is_empty_value,
    col_flags,
    col_has_flag,
    col_hook,
    col_enum,
    topic_pkey2s,
    record_name,
    record_order,
    build_schema_model,
    find_treedb,
    find_topic,
    find_col,
    fkey_ref,
    next_order,
    moved_orders,
};
