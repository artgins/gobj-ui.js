/***********************************************************************
 *          schema_import.js
 *
 *      The writes that make a STORED schema equal a given one.
 *
 *      The export says what the node is running, in the form the source
 *      can hold. This is the way back in: a schema written in C — or
 *      exported from another node, or edited in a text editor — turned
 *      into the create/update/delete calls that put it in
 *      `treedb_system_schema`.
 *
 *      It is a PLAN and not a write. Import is the one operation here
 *      that can delete a column, so what it is about to do is shown
 *      first and executed second; and the plan is a value, so what is
 *      shown is what runs.
 *
 *      THE VERSION IS PART OF THE PLAN, not an afterthought. A topic
 *      whose columns changed and whose `topic_version` did not is a
 *      topic whose persisted `topic_cols.json` masks the whole import:
 *      the restart succeeds and nothing moved. So a changed topic
 *      always leaves this plan with a version above the stored one,
 *      whatever the incoming schema said.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {
    col_flags,
    col_hook,
    col_enum,
    as_json,
    is_empty_value,
    fkey_ref,
} from "./schema_model.js";


/*  Fields of a `topics` record an import owns. The rest (`id`, `value`,
 *  the fkey, `order`) is composed, and `_geometry` belongs to whoever
 *  laid the graph out — an import must not move their boxes.  */
const TOPIC_FIELDS = [
    "pkey", "pkey2s", "system_flag", "tkey", "topic_version", "system_topic"
];

/*  Same for a `cols` record.  */
const COL_FIELDS = [
    "header", "fillspace", "type", "flag", "enum", "hook", "default",
    "placeholder", "description", "template", "properties", "pkey2s"
];

/*  Read as values whatever they were stored as.  */
const JSON_FIELDS = ["enum", "hook", "default", "template", "properties", "pkey2s"];


/***************************************************************
 *  Two values, compared the way the store would see them: a flag
 *  list written in another order is the same flags, and a hook
 *  written as text is the same hook.
 ***************************************************************/
function same_value(field, a, b)
{
    let norm = (v) => {
        if(JSON_FIELDS.indexOf(field) >= 0) {
            v = as_json(v);
        }
        if(field === "flag") {
            let list = Array.isArray(v) ? v.slice() : (typeof v === "string" && v ? [v] : []);
            list = list.filter(f => typeof f === "string" && f.length > 0).sort();
            return JSON.stringify(list);
        }
        if(is_empty_value(v)) {
            return "";
        }
        if(typeof v === "object") {
            return JSON.stringify(v);
        }
        return String(v);
    };
    return norm(a) === norm(b);
}

/***************************************************************
 *  The declared fields of an incoming column, normalized.
 ***************************************************************/
function incoming_col_fields(col)
{
    let out = {};

    for(let field of COL_FIELDS) {
        let value = col ? col[field] : undefined;
        if(is_empty_value(value)) {
            continue;
        }
        let read = JSON_FIELDS.indexOf(field) >= 0 ? as_json(value) : value;
        if(is_empty_value(read)) {
            continue;
        }
        out[field] = read;
    }
    if(Array.isArray(out.flag)) {
        out.flag = out.flag.filter(f => typeof f === "string" && f.length > 0);
    } else if(typeof out.flag === "string" && out.flag) {
        out.flag = [out.flag];
    }
    return out;
}

/***************************************************************
 *  The same for a stored column, read off its record.
 ***************************************************************/
function stored_col_fields(record)
{
    let out = {};

    for(let field of COL_FIELDS) {
        let value = record ? record[field] : undefined;
        if(is_empty_value(value)) {
            continue;
        }
        let read = JSON_FIELDS.indexOf(field) >= 0 ? as_json(value) : value;
        if(is_empty_value(read)) {
            continue;
        }
        out[field] = read;
    }
    let flags = col_flags(record);
    if(flags.length > 0) {
        out.flag = flags;
    } else {
        delete out.flag;
    }
    let hook = col_hook(record);
    if(hook && !is_empty_value(hook)) {
        out.hook = hook;
    } else {
        delete out.hook;
    }
    let e = col_enum(record);
    if(e.length > 0) {
        out.enum = e;
    }
    return out;
}

/***************************************************************
 *  The columns of an incoming topic, as a list in schema order.
 *  A literal writes them as an ordered dict; an exported plan may
 *  hand a list instead, and both mean the same thing.
 ***************************************************************/
function incoming_cols(topic)
{
    let cols = topic ? topic.cols : null;

    if(Array.isArray(cols)) {
        return cols.filter(c => c && c.id).map(c => ({name: c.id, col: c}));
    }
    if(cols && typeof cols === "object") {
        return Object.entries(cols).map(([name, col]) => ({name: name, col: col || {}}));
    }
    return [];
}

/***************************************************************
 *  plan_import(treedb, incoming, options) -> plan
 *
 *      treedb    one entry of build_schema_model().treedbs, or null
 *                for a treedb the store does not have yet
 *      incoming  the schema as the .c literal holds it:
 *                {id, schema_version, topics: [{id, ..., cols: {...}}]}
 *      options   {prune: true}  delete what the incoming schema does
 *                not declare. Off leaves it alone: two schemas that
 *                only ADD are merged.
 *
 *      plan = {
 *          writes:  [{op, topic_name, record, what}],   in order
 *          summary: {topics_created, topics_updated, topics_deleted,
 *                    cols_created, cols_updated, cols_deleted},
 *          conflicts: [{code, topic, col}]
 *      }
 *
 *      `writes` is ordered so it can be run straight through: a topic
 *      exists before its columns reference it, and a delete runs after
 *      the writes that may have moved things out of its way.
 ***************************************************************/
function plan_import(treedb, incoming, options)
{
    let opts = options || {};
    let prune = opts.prune === undefined ? true : !!opts.prune;
    let writes = [];
    let conflicts = [];
    let summary = {
        topics_created: 0, topics_updated: 0, topics_deleted: 0,
        cols_created: 0, cols_updated: 0, cols_deleted: 0
    };

    if(!incoming || !Array.isArray(incoming.topics)) {
        conflicts.push({code: "not a schema", topic: "", col: ""});
        return {writes: writes, summary: summary, conflicts: conflicts};
    }

    let treedb_id = (treedb && treedb.id) || incoming.id;
    if(!treedb_id) {
        conflicts.push({code: "schema has no id", topic: "", col: ""});
        return {writes: writes, summary: summary, conflicts: conflicts};
    }

    let stored_topics = {};
    for(let topic of ((treedb && treedb.topics) || [])) {
        stored_topics[topic.name] = topic;
    }

    let seen_topics = {};

    for(let i = 0; i < incoming.topics.length; i++) {
        let in_topic = incoming.topics[i] || {};
        let name = in_topic.id;
        if(!name) {
            conflicts.push({code: "topic has no name", topic: "", col: ""});
            continue;
        }
        seen_topics[name] = true;

        let stored = stored_topics[name] || null;
        let order = i + 1;

        /*  What the incoming topic declares about itself.  */
        let fields = {};
        for(let field of TOPIC_FIELDS) {
            let value = in_topic[field];
            if(value === undefined || value === null || value === "") {
                continue;
            }
            fields[field] = value;
        }

        let in_cols = incoming_cols(in_topic);
        let stored_cols = {};
        for(let col of ((stored && stored.cols) || [])) {
            stored_cols[col.name] = col;
        }

        /*  Does anything under this topic move? Decided BEFORE the
         *  version, because it is what the version has to answer for.  */
        let col_writes = [];
        let seen_cols = {};
        for(let j = 0; j < in_cols.length; j++) {
            let col_name = in_cols[j].name;
            let in_fields = incoming_col_fields(in_cols[j].col);
            seen_cols[col_name] = true;

            let stored_col = stored_cols[col_name] || null;
            if(!stored_col) {
                let record = Object.assign({
                    value: col_name,
                    order: j + 1,
                    topics: [fkey_ref("topics", `${treedb_id}.${name}`, "cols")]
                }, in_fields);
                col_writes.push({
                    op: "create", topic_name: "cols", record: record,
                    what: {topic: name, col: col_name}
                });
                continue;
            }

            let changed = {};
            for(let [field, value] of Object.entries(in_fields)) {
                if(!same_value(field, stored_col.record[field], value)) {
                    changed[field] = value;
                }
            }
            /*  A field the stored column has and the incoming one does
             *  not is a REMOVAL, and clearing it is a write too.  */
            for(let field of Object.keys(stored_col_fields(stored_col.record))) {
                if(!(field in in_fields)) {
                    changed[field] = (field === "flag") ? [] : "";
                }
            }
            if(stored_col.order !== j + 1) {
                changed.order = j + 1;
            }
            if(Object.keys(changed).length > 0) {
                col_writes.push({
                    op: "update", topic_name: "cols",
                    record: Object.assign({id: stored_col.id}, changed),
                    what: {topic: name, col: col_name}
                });
            }
        }

        let col_deletes = [];
        if(prune && stored) {
            for(let col of stored.cols) {
                if(seen_cols[col.name]) {
                    continue;
                }
                col_deletes.push({
                    op: "delete", topic_name: "cols", record: {id: col.id},
                    what: {topic: name, col: col.name}
                });
            }
        }

        let topic_changed = col_writes.length > 0 || col_deletes.length > 0;

        if(!stored) {
            let record = Object.assign({
                value: name,
                order: order,
                treedbs: [fkey_ref("treedbs", treedb_id, "topics")]
            }, fields);
            writes.push({
                op: "create", topic_name: "topics", record: record,
                what: {topic: name, col: ""}
            });
            summary.topics_created++;
        } else {
            let changed = {};
            for(let [field, value] of Object.entries(fields)) {
                if(!same_value(field, stored.record[field], value)) {
                    changed[field] = value;
                }
            }
            if(stored.order !== order) {
                changed.order = order;
            }

            /*  The version that has to answer for the columns above. A
             *  topic that changed and kept its version publishes
             *  nothing, so it is raised here even when the incoming
             *  schema asked for the same number.  */
            if(topic_changed) {
                let stored_version = Number(stored.topic_version);
                let wanted = Number(changed.topic_version !== undefined ?
                    changed.topic_version : stored.topic_version);
                if(!isFinite(stored_version)) {
                    stored_version = 0;
                }
                if(!isFinite(wanted) || wanted <= stored_version) {
                    changed.topic_version = stored_version + 1;
                }
            }

            if(Object.keys(changed).length > 0) {
                writes.push({
                    op: "update", topic_name: "topics",
                    record: Object.assign({id: stored.id}, changed),
                    what: {topic: name, col: ""}
                });
                summary.topics_updated++;
            }
        }

        for(let w of col_writes) {
            writes.push(w);
            if(w.op === "create") {
                summary.cols_created++;
            } else {
                summary.cols_updated++;
            }
        }
        for(let w of col_deletes) {
            writes.push(w);
            summary.cols_deleted++;
        }
    }

    if(prune && treedb) {
        for(let topic of treedb.topics) {
            if(seen_topics[topic.name]) {
                continue;
            }
            for(let col of topic.cols) {
                writes.push({
                    op: "delete", topic_name: "cols", record: {id: col.id},
                    what: {topic: topic.name, col: col.name}
                });
                summary.cols_deleted++;
            }
            writes.push({
                op: "delete", topic_name: "topics", record: {id: topic.id},
                what: {topic: topic.name, col: ""}
            });
            summary.topics_deleted++;
        }
    }

    /*  The treedb's own version, for the same reason one level up: it
     *  is what makes a re-projection publish.  */
    if(treedb && writes.length > 0) {
        let stored_version = Number(treedb.schema_version);
        if(!isFinite(stored_version)) {
            stored_version = 0;
        }
        let wanted = Number(incoming.schema_version);
        let next = (isFinite(wanted) && wanted > stored_version) ? wanted : stored_version + 1;
        writes.push({
            op: "update", topic_name: "treedbs",
            record: {id: treedb.id, schema_version: next},
            what: {topic: "", col: ""}
        });
    }

    return {writes: writes, summary: summary, conflicts: conflicts};
}

/***************************************************************
 *  Is this plan going to remove anything? What an import dialog
 *  has to say out loud before its confirm button.
 ***************************************************************/
function plan_deletes(plan)
{
    if(!plan || !Array.isArray(plan.writes)) {
        return [];
    }
    return plan.writes.filter(w => w.op === "delete");
}


export {
    TOPIC_FIELDS,
    COL_FIELDS,
    same_value,
    plan_import,
    plan_deletes,
};
