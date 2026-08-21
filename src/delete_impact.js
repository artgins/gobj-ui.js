/***********************************************************************
 *          delete_impact.js
 *
 *      What a delete takes with it, read off the record itself.
 *
 *      A treedb delete is not one thing. The backend refuses a node
 *      that has links — UNLESS the caller sends `force`, and the topic
 *      views do. With `force`:
 *
 *          children  are UNLINKED, not deleted. They survive, loose.
 *          parents   lose the node from their hook.
 *
 *      So "delete this row" can mean "detach eleven records from their
 *      only parent", and the question that used to be asked — `are you
 *      sure` — said none of it. This counts what is at stake so the
 *      question can name it.
 *
 *      Read from the record the table ALREADY has (`list_dict` fills
 *      the hook and fkey columns), so asking costs no round trip.
 *
 *      Pure and tested, because the shapes are the fiddly part: a hook
 *      or fkey value arrives as a list of refs, a dict keyed by id, or
 *      a single ref string, depending on the column's declared type.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/

/***************************************************************
 *  How many things a hook/fkey value holds.
 ***************************************************************/
function ref_count(value)
{
    if(Array.isArray(value)) {
        return value.length;
    }
    if(value && typeof value === "object") {
        return Object.keys(value).length;
    }
    if(typeof value === "string" && value.length > 0) {
        return 1;
    }
    return 0;
}

/***************************************************************
 *  delete_impact(desc, records) -> {records, children, parents}
 *
 *  `records` is one record or a list of them, so the same answer
 *  serves the one-row delete and the selection.
 ***************************************************************/
function delete_impact(desc, records)
{
    let list = Array.isArray(records)? records : (records? [records] : []);
    let out = {records: list.length, children: 0, parents: 0};

    let cols = (desc && Array.isArray(desc.cols))? desc.cols : [];
    if(!cols.length) {
        return out;
    }

    for(let record of list) {
        if(!record) {
            continue;
        }
        for(let col of cols) {
            if(!col || !col.id || !Array.isArray(col.flag)) {
                continue;
            }
            let n = ref_count(record[col.id]);
            if(n === 0) {
                continue;
            }
            /*  A column can be BOTH (a department's `users` is a hook to its
             *  users and a fkey to the department that manages it). Counting
             *  it on both sides is right: the delete does both things. */
            if(col.flag.indexOf("hook") >= 0) {
                out.children += n;
            }
            if(col.flag.indexOf("fkey") >= 0) {
                out.parents += n;
            }
        }
    }

    return out;
}


export {delete_impact, ref_count};
