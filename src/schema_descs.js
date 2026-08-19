/***********************************************************************
 *          schema_descs.js
 *
 *      The schema being EDITED, in the shape every treedb view already
 *      draws.
 *
 *      `C_YUI_TREEDB_SCHEMA` draws a `descs` — `{topic_name: desc}` —
 *      and gets one from the treedb it opened. In the schema editor
 *      that treedb is `treedb_system_schema`, so the picture it draws
 *      is the META schema (treedbs -> topics -> cols): three cards,
 *      the same three on every yuno, and never the schema the operator
 *      came to look at.
 *
 *      What the operator is editing is stored as RECORDS, and this
 *      turns those records back into a desc. The drawing then costs no
 *      backend call at all, and it follows an edit immediately —
 *      before the restart that publishes it, which is exactly when it
 *      is worth looking at.
 *
 *      THE ONE THING THAT IS NOT A COPY: `fkey`. A schema literal
 *      declares the link ONCE, on the parent's `hook`; the treedb
 *      derives `col.fkey = {parent_topic: hook_name}` on the child's
 *      column when it opens the schema (tr_treedb.c). Views read that
 *      derived field — `fkey_in_col()`, the info panel's "→", the
 *      graph's edges — so a desc built without it draws every link
 *      half missing.
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


/*  Storage-only fields of a `cols` record: they describe where the
 *  record LIVES in treedb_system_schema, not the column it declares.
 *  The C validator drops the same ones (_treedb_create_topic_cols_desc).  */
const COL_STORAGE_FIELDS = ["id", "value", "topics", "order", "__md_treedb__"];

/*  Same, one level up, for a `topics` record.  */
const TOPIC_STORAGE_FIELDS = ["id", "value", "treedbs", "cols", "order", "__md_treedb__"];

/*  Fields of a column whose stored form is TEXT and whose desc form is
 *  the value: they are `blob` columns of the `cols` topic.  */
const COL_JSON_FIELDS = ["enum", "hook", "default", "template", "properties", "pkey2s"];


/***************************************************************
 *  One column record -> the col of a desc.
 *
 *  The desc keys a column by its BARE name under `id`; the record
 *  keys it by the qualified one and carries the bare name in
 *  `value`. Getting that backwards names every column after its
 *  whole path.
 ***************************************************************/
function col_desc(col)
{
    let record = col.record || {};
    let desc = {};

    for(let [key, value] of Object.entries(record)) {
        if(COL_STORAGE_FIELDS.indexOf(key) >= 0) {
            continue;
        }
        if(value === null || value === undefined || value === "") {
            continue;
        }
        desc[key] = COL_JSON_FIELDS.indexOf(key) >= 0 ? as_json(value) : value;
    }
    desc.id = col.name;
    desc.flag = col_flags(record);
    let hook = col_hook(record);
    if(hook) {
        desc.hook = hook;
    }
    let e = col_enum(record);
    if(e.length > 0) {
        desc.enum = e;
    }
    return desc;
}

/***************************************************************
 *  topic_descs(treedb) -> {topic_name: desc}
 *
 *      treedb   one entry of build_schema_model().treedbs
 ***************************************************************/
function topic_descs(treedb)
{
    let descs = {};

    if(!treedb || !Array.isArray(treedb.topics)) {
        return descs;
    }

    for(let topic of treedb.topics) {
        let record = topic.record || {};
        let desc = {};
        for(let [key, value] of Object.entries(record)) {
            if(TOPIC_STORAGE_FIELDS.indexOf(key) >= 0) {
                continue;
            }
            if(value === null || value === undefined || value === "") {
                continue;
            }
            desc[key] = value;
        }
        desc.topic_name = topic.name;
        desc.pkey = topic.pkey || "id";
        let pkey2s = topic_pkey2s(record);
        if(pkey2s.length > 0) {
            desc.pkey2s = pkey2s;
        } else {
            delete desc.pkey2s;
        }
        desc.cols = topic.cols.map(col_desc);
        descs[topic.name] = desc;
    }

    /*  The link the schema declares once, given to the half that does
     *  not declare it — the same derivation the treedb makes when it
     *  opens a schema. A hook naming a topic or a column that is not
     *  there derives nothing: that is the validator's finding, not a
     *  reason to draw a broken desc.  */
    for(let topic of treedb.topics) {
        let desc = descs[topic.name];
        for(let col of desc.cols) {
            let hook = col.hook;
            if(!hook || typeof hook !== "object") {
                continue;
            }
            for(let [child_topic, fkey_col] of Object.entries(hook)) {
                let child = descs[child_topic];
                if(!child) {
                    continue;
                }
                for(let child_col of child.cols) {
                    if(child_col.id !== fkey_col) {
                        continue;
                    }
                    if(!child_col.fkey || typeof child_col.fkey !== "object") {
                        child_col.fkey = {};
                    }
                    child_col.fkey[topic.name] = col.id;
                }
            }
        }
    }

    return descs;
}


export {
    COL_STORAGE_FIELDS,
    TOPIC_STORAGE_FIELDS,
    col_desc,
    topic_descs,
};
