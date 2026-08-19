/***********************************************************************
 *          schema_validate.js
 *
 *      What is wrong with a schema, BEFORE the yuno is restarted to
 *      read it.
 *
 *      Applying a schema is restarting the yuno that owns it. A schema
 *      the treedb refuses therefore costs an outage to discover, and
 *      the message arrives in that yuno's log, on the node, minutes
 *      after the edit that caused it. Everything checked here is
 *      checkable from the records alone.
 *
 *      TWO CLASSES OF FINDING, and the difference matters:
 *
 *        `error`   the treedb will refuse the topic, or the link the
 *                  operator drew does nothing at all. Restarting on
 *                  this is an outage with no gain.
 *        `warning` the schema opens and something is not what it looks
 *                  like — an unbumped `topic_version` masking the whole
 *                  edit is the one that costs the most time, because
 *                  the restart SUCCEEDS and the change is simply not
 *                  there.
 *
 *      Every `code` is an i18n key: the caller renders, this decides.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {
    col_flags,
    col_hook,
    col_enum,
    topic_pkey2s,
} from "./schema_model.js";


/*  What a column may be typed as: the `type` enum of the `cols` topic
 *  (treedb_system_schema.c). A type outside it is refused by the
 *  validator the treedb builds from that same enum.  */
const COL_TYPES = [
    "string", "integer", "object", "dict", "array", "list",
    "real", "boolean", "blob"
];

/*  What a HOOK may be typed as: a hook holds its children, so it is a
 *  collection. `{}` (dict) for N unique children, `[]` (list) for n.  */
const HOOK_TYPES = ["dict", "object", "list", "array"];

/*  What a FKEY may be typed as: one parent is a string, n parents a
 *  collection.  */
const FKEY_TYPES = ["string", "dict", "object", "list", "array"];


/***************************************************************
 *  validate_schema(treedb, options) -> [finding, ...]
 *
 *      treedb    one entry of build_schema_model().treedbs
 *      options   {
 *          written_topics: [topic id, ...]   topics this session wrote
 *          baseline: {topic id: topic_version}   version at load time
 *      }
 *
 *      finding   {severity, code, treedb, topic, col, detail}
 *
 *      Findings come out worst-first, so a caller that shows three
 *      lines shows the three that matter.
 ***************************************************************/
function validate_schema(treedb, options)
{
    let findings = [];
    let opts = options || {};
    let written = Array.isArray(opts.written_topics) ? opts.written_topics : [];
    let baseline = opts.baseline || {};

    if(!treedb || !Array.isArray(treedb.topics)) {
        return findings;
    }

    let add = (severity, code, topic, col, detail) => {
        findings.push({
            severity: severity,
            code:     code,
            treedb:   treedb.id,
            topic:    topic || "",
            col:      col || "",
            detail:   detail || ""
        });
    };

    /*  Which topics exist, and which columns each one has: a hook is
     *  checked against the CHILD topic, so both are needed up front.  */
    let topic_by_name = {};
    for(let topic of treedb.topics) {
        topic_by_name[topic.name] = topic;
    }

    if(treedb.topics.length === 0) {
        add("warning", "schema has no topic", "", "", "");
    }

    for(let topic of treedb.topics) {
        let col_names = topic.cols.map(c => c.name);

        if(topic.cols.length === 0) {
            add("error", "topic has no column", topic.name, "", "");
        }

        /*  The pkey is the column every record is stored under: naming
         *  one that is not there is a topic that does not open.  */
        let pkey = topic.pkey || "id";
        if(col_names.indexOf(pkey) < 0) {
            add("error", "pkey names no column", topic.name, "", pkey);
        }
        for(let pkey2 of topic_pkey2s(topic.record)) {
            if(col_names.indexOf(pkey2) < 0) {
                add("error", "pkey2 names no column", topic.name, "", pkey2);
            }
        }

        /*  A version that did not move republishes nothing: the stored
         *  topic_cols.json masks the whole edit and the restart looks
         *  like it worked.  */
        if(written.indexOf(topic.id) >= 0) {
            let before = baseline[topic.id];
            if(before !== undefined && String(before) === String(topic.topic_version)) {
                add("warning", "topic version not bumped", topic.name, "",
                    String(topic.topic_version));
            }
        }

        for(let col of topic.cols) {
            let flags = col_flags(col.record);
            let type = col.record ? col.record.type : "";
            let is_hook = flags.indexOf("hook") >= 0;
            let is_fkey = flags.indexOf("fkey") >= 0;

            if(!type) {
                add("error", "column has no type", topic.name, col.name, "");
            } else if(COL_TYPES.indexOf(type) < 0) {
                add("error", "unknown column type", topic.name, col.name, type);
            }

            if(flags.indexOf("enum") >= 0 && col_enum(col.record).length === 0) {
                add("error", "enum column has no enum", topic.name, col.name, "");
            }

            if(is_hook) {
                if(HOOK_TYPES.indexOf(type) < 0) {
                    add("error", "hook must be a collection", topic.name, col.name, type);
                }
                let hook = col_hook(col.record);
                if(!hook || Object.keys(hook).length === 0) {
                    /*  A hook with no mapping links nothing, and the write
                     *  that made it succeeded.  */
                    add("error", "hook has no mapping", topic.name, col.name, "");
                } else {
                    for(let [child_topic, fkey_col] of Object.entries(hook)) {
                        let child = topic_by_name[child_topic];
                        if(!child) {
                            add("error", "hook names no topic", topic.name, col.name,
                                child_topic);
                            continue;
                        }
                        let child_col = null;
                        for(let c of child.cols) {
                            if(c.name === fkey_col) {
                                child_col = c;
                                break;
                            }
                        }
                        if(!child_col) {
                            add("error", "hook names no fkey column", topic.name, col.name,
                                `${child_topic}.${fkey_col}`);
                            continue;
                        }
                        if(col_flags(child_col.record).indexOf("fkey") < 0) {
                            /*  The column exists and is not a fkey: the link
                             *  saves nothing and the graph draws no edge.  */
                            add("error", "hook target is not a fkey", topic.name, col.name,
                                `${child_topic}.${fkey_col}`);
                        }
                    }
                }
            }

            if(is_fkey && FKEY_TYPES.indexOf(type) < 0) {
                add("error", "fkey has a bad type", topic.name, col.name, type);
            }
        }
    }

    /*  How many hooks name each fkey column. Both answers are a
     *  finding: NONE and the parent side of the link was renamed or
     *  deleted, so the references are written by nobody; TWO and the
     *  treedb refuses to open the schema ("Only can be one fkey",
     *  tr_treedb.c) because the column cannot hold both parents.  */
    let hooked = {};
    for(let topic of treedb.topics) {
        for(let col of topic.cols) {
            let hook = col_hook(col.record);
            if(!hook) {
                continue;
            }
            for(let [child_topic, fkey_col] of Object.entries(hook)) {
                let key = `${child_topic}.${fkey_col}`;
                hooked[key] = (hooked[key] || 0) + 1;
            }
        }
    }
    for(let topic of treedb.topics) {
        for(let col of topic.cols) {
            if(col_flags(col.record).indexOf("fkey") < 0) {
                continue;
            }
            let count = hooked[`${topic.name}.${col.name}`] || 0;
            if(count === 0) {
                add("warning", "fkey with no hook", topic.name, col.name, "");
            } else if(count > 1) {
                add("error", "fkey named by two hooks", topic.name, col.name, String(count));
            }
        }
    }

    findings.sort((a, b) => {
        if(a.severity !== b.severity) {
            return a.severity === "error" ? -1 : 1;
        }
        return 0;
    });
    return findings;
}

/***************************************************************
 *  The same over a whole model, plus what belongs to no treedb:
 *  an orphan is a leftover of a deletion and the editor is where
 *  it is found.
 ***************************************************************/
function validate_model(model, options)
{
    let findings = [];

    if(!model) {
        return findings;
    }
    for(let treedb of (model.treedbs || [])) {
        findings = findings.concat(validate_schema(treedb, options));
    }
    for(let topic of (model.orphan_topics || [])) {
        findings.push({
            severity: "warning", code: "topic belongs to no treedb",
            treedb: "", topic: topic.name, col: "", detail: topic.id
        });
    }
    for(let col of (model.orphan_cols || [])) {
        findings.push({
            severity: "warning", code: "column belongs to no topic",
            treedb: "", topic: "", col: col.name, detail: col.id
        });
    }
    return findings;
}

/***************************************************************
 *  Is there anything that should stop an Apply? Warnings do not:
 *  the operator may know better, and an unbumped version is worth
 *  saying and not worth refusing.
 ***************************************************************/
function has_errors(findings)
{
    if(!Array.isArray(findings)) {
        return false;
    }
    for(let f of findings) {
        if(f && f.severity === "error") {
            return true;
        }
    }
    return false;
}


export {
    COL_TYPES,
    HOOK_TYPES,
    FKEY_TYPES,
    validate_schema,
    validate_model,
    has_errors,
};
