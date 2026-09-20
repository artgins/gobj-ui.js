/***********************************************************************
 *          treedb_node_label.js
 *
 *      Pure, testable logic behind the label of a node in the treedb
 *      graph: WHAT A RECORD IS CALLED. Kept out of the gclass so it can
 *      be unit-tested with no DOM and no G6.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/

const SEP = " · ";     /*  the middle dot the shell titles use  */

/************************************************************
 *  What a node is CALLED: **its id, and the secondary keys it
 *  carries**.
 *
 *  A record is one thing and an INSTANCE of it is another: the
 *  topic keys the record by `id` and the instance by the
 *  columns it declares in `pkey2s`. A card that shows one
 *  without the other is a card that cannot be identified --
 *  and it used to show one INSTEAD of the other, so the yunos
 *  of an agent read `7.23.0-1`, `7.23.0-1`, `7.23.0-1` (the
 *  release, which they share) and never said which yuno each
 *  one was, while a `configurations` card read `1`.
 *
 *  It came from the opposite case, and that one still works:
 *  the `topics` and `cols` of treedb_system_schema are keyed
 *  by a rowid, so the card said "181" and the name lived in
 *  the pkey2. Now it says both -- `181 · yuno_role` -- which
 *  is what the record is: that name, under that key.
 *
 *  Rules:
 *      - the id always opens the label;
 *      - every pkey2 the record carries follows it, in the
 *        order the topic declares them, separated by `·`;
 *      - a pkey2 whose value is empty, absent or equal to the
 *        id adds nothing;
 *      - a desc with no `pkey2s` (an older node's schema
 *        included) gives the bare id.
 ************************************************************/
export function node_label(desc, record)
{
    /*  treedb stores every record under `id`: the pkey name is fixed in
     *  tranger2_create_topic, whatever the desc calls it.  */
    let id = record.id;

    let pkey2s = desc? desc.pkey2s : null;
    /*  `pkey2s` is a list in the desc, but the schema literal may
     *  declare it as a bare string -- take either.  */
    if(typeof pkey2s === "string") {
        pkey2s = pkey2s? [pkey2s] : [];
    }
    if(!Array.isArray(pkey2s) || pkey2s.length === 0) {
        return id;
    }

    let parts = [];
    for(let name of pkey2s) {
        if(!name) {
            continue;
        }
        let value = record[name];
        if(typeof value === "number") {
            value = String(value);
        }
        if(typeof value !== "string" || value.length === 0) {
            continue;
        }
        if(value === String(id)) {
            continue;   /*  the same thing twice says nothing  */
        }
        parts.push(value);
    }
    if(parts.length === 0) {
        return id;
    }
    return [id, ...parts].join(SEP);
}
