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
 *          hands it here; the editor applies it to its model, in place
 *          of what the host said before.
 *
 *          What `draft_changed` measures depends on the node: the draft
 *          against the SAVED schema on a node newer than yunetas 7.25.3,
 *          and against the file IN USE on a 7.25.3 node -- where a topic saved and
 *          not yet applied is still named, and the editor, which cannot
 *          tell the two apart, shows it as a draft until the Apply.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/

/************************************************************
 *  The topics of `model` the host names as drafts, as
 *  {topic id: true}: `drafts` is {treedb_name: [topic names]}. A
 *  treedb or a topic the model does not hold is ignored.
 *
 *  What the editor keeps is THIS, apart from what its own session
 *  wrote, and replaced whole on every EV_DRAFTS: the host is the
 *  truth after a reload. Folded into the session's marks, a topic the
 *  host once named stayed a draft after the save that published it.
 ************************************************************/
function host_draft_ids(model, drafts)
{
    const ids = {};
    mark_host_drafts(ids, model, drafts);
    return ids;
}

/************************************************************
 *  Mark in `written` the topics of `model` the host names as
 *  drafts: `drafts` is {treedb_name: [topic names]}. A treedb or a
 *  topic the model does not hold is ignored. Returns how many were
 *  marked. It only ADDS: a caller that must forget what the host
 *  no longer names starts from an empty map (host_draft_ids()).
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
    host_draft_ids,
    mark_host_drafts,
    drafts_of_saved_answer,
};
