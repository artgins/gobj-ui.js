/***********************************************************************
 *          host_drafts.js
 *
 *          The topics a schema editor shows as DRAFTS (edited in
 *          __system__, not yet saved), told by the host from data. The
 *          editor marks a topic when a write of this session lands on
 *          it, and that mark lived in the memory of the session only:
 *          a reload of the page, a reconnect or a refresh of the model
 *          lost the chip, the banner and the export warning while
 *          __system__ still differed from the file in use (N13 of the
 *          2026-09-22 review). The host reads that difference from
 *          C_TREEDB's `saved-schema` (`draft_changed`, by treedb) and
 *          hands it here; the editor applies it to its model.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/

/************************************************************
 *  Mark in `written` the topics of `model` the host names as
 *  drafts: `drafts` is {treedb_name: [topic names]}. A treedb or a
 *  topic the model does not hold is ignored. Returns how many were
 *  marked.
 ************************************************************/
function mark_host_drafts(written, model, drafts)
{
    let marked = 0;
    if(!written || !model || !Array.isArray(model.treedbs) || !drafts) {
        return marked;
    }
    for(let treedb of model.treedbs) {
        const names = drafts[treedb.id];
        if(!Array.isArray(names) || names.length === 0) {
            continue;
        }
        for(let topic of treedb.topics || []) {
            if(names.includes(topic.name)) {
                written[topic.id] = true;
                marked++;
            }
        }
    }
    return marked;
}

/************************************************************
 *  What a `saved-schema` answer says, as {treedb_name: [topic names]}:
 *  its `data` is one row per treedb (the unnamed form of the command),
 *  each carrying `draft_changed` {topic: true}.
 ************************************************************/
function drafts_of_saved_answer(rows, into)
{
    const drafts = into || {};
    for(let row of Array.isArray(rows)? rows: []) {
        const treedb_name = row && row.treedb_name;
        const changed = row && row.data && row.data.draft_changed;
        if(!treedb_name || !changed || typeof changed !== "object") {
            continue;
        }
        drafts[treedb_name] = Object.keys(changed).filter((k) => !!changed[k]);
    }
    return drafts;
}

export {
    mark_host_drafts,
    drafts_of_saved_answer,
};
