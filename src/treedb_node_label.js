/***********************************************************************
 *          treedb_node_label.js
 *
 *      Pure, testable logic behind the label of a node in the treedb
 *      graph: WHAT A RECORD IS CALLED, which is not always what it is
 *      keyed by. Kept out of the gclass so it can be unit-tested with
 *      no DOM and no G6.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/

/************************************************************
 *  What a node is CALLED, which is not always what it is
 *  keyed by.
 *
 *  A topic whose id column is flagged `rowid` or `uuid` keys
 *  its records by a value nobody reads — that is the point of
 *  those flags — and the name a human knows the record by
 *  lives in the secondary key the topic declares (`pkey2s`,
 *  carried in the desc since SDK > 7.13.0). The `topics` and
 *  `cols` topics of treedb_system_schema are the case that
 *  forced this: keyed by rowid, named in `value`, so every
 *  card in the graph read "181", "225", "193".
 *
 *  The pkey stays reachable: it is the card's tooltip.
 *
 *  Falls back to the id whenever the schema does not say
 *  otherwise — an older node whose desc carries no `pkey2s`
 *  included.
 ************************************************************/
export function node_label(desc, record)
{
    /*  treedb stores every record under `id` (the pkey name is fixed in
     *  tranger2_create_topic), so the fallback reads `id` while the FLAGS
     *  are read from whatever column the desc names as the pkey.  */
    let id = record.id;

    let id_col = null;
    if(Array.isArray(desc.cols)) {
        for(let col of desc.cols) {
            if(col && col.id === (desc.pkey || "id")) {
                id_col = col;
                break;
            }
        }
    }
    if(!id_col || !Array.isArray(id_col.flag)) {
        return id;
    }
    if(id_col.flag.indexOf("rowid") < 0 && id_col.flag.indexOf("uuid") < 0) {
        return id;
    }

    /*  `pkey2s` is a list in the desc, but the schema literal may
     *  declare it as a bare string — take either.  */
    let pkey2s = desc.pkey2s;
    if(typeof pkey2s === "string") {
        pkey2s = pkey2s? [pkey2s] : [];
    }
    if(!Array.isArray(pkey2s)) {
        return id;
    }
    for(let name of pkey2s) {
        let value = record[name];
        if(typeof value === "string" && value.length > 0) {
            return value;
        }
    }

    return id;
}

