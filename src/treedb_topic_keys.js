/***********************************************************************
 *          treedb_topic_keys.js
 *
 *      The KEYS of a treedb topic, read from its desc: the pkey, the
 *      secondary keys (`pkey2s`) and the time key (`tkey`), plus the
 *      names behind its `system_flag` number.
 *
 *      Every view that describes a topic -- the schema diagram, the
 *      topic-info panel, the topic cards -- must say them, and say them
 *      the same way. A topic with `pkey2s` is not a topic with one more
 *      column: one id holds several INSTANCES, an update has to carry
 *      the pkey2 or it lands on the primary, and `delete-instance`
 *      exists. `tkey` names where the time of every record comes from.
 *      The views said neither, so this is where they ask.
 *
 *      Pure, so it is tested with no DOM.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {topic_pkey2s} from "./schema_model.js";

/*  The names of the system_flag bits, in bit order: the `sf_names`
 *  table of timeranger2.c, which the C enum points at. Keep the two in
 *  step -- an empty slot is a bit with no name.  */
const SF_NAMES = [
    "sf_string_key",            // 0x0001
    "sf_rowid_key",             // 0x0002
    "sf_int_key",               // 0x0004
    "",                         // 0x0008
    "sf_zip_record",            // 0x0010
    "sf_cipher_record",         // 0x0020
    "",                         // 0x0040
    "",                         // 0x0080
    "sf_t_ms",                  // 0x0100
    "sf_tm_ms",                 // 0x0200
    "sf_deleted_instance",      // 0x0400
    "sf_immutable_record",      // 0x0800
    "sf_loading_from_disk",     // 0x1000
    "",                         // 0x2000
    "",                         // 0x4000
    "",                         // 0x8000
];


/************************************************************
 *  The secondary keys of a topic, always a list. The desc
 *  carries a list; a schema literal may declare a bare
 *  string.
 ************************************************************/
function desc_pkey2s(desc)
{
    return topic_pkey2s(desc);
}

/************************************************************
 *  The time key of a topic, "" when it has none -- and then
 *  the time of a record is the time it was appended.
 ************************************************************/
function desc_tkey(desc)
{
    let tkey = desc ? desc.tkey : "";
    return (typeof tkey === "string") ? tkey : "";
}

/************************************************************
 *  Which keys of its topic a column IS, in the order the
 *  views print them: "pkey", "pkey2", "tkey". Empty for a
 *  column that is none.
 ************************************************************/
function col_key_roles(desc, col_id)
{
    let roles = [];
    if(!desc || typeof col_id !== "string" || col_id.length === 0) {
        return roles;
    }
    if(col_id === (desc.pkey || "id")) {
        roles.push("pkey");
    }
    if(desc_pkey2s(desc).includes(col_id)) {
        roles.push("pkey2");
    }
    if(desc_tkey(desc) === col_id) {
        roles.push("tkey");
    }
    return roles;
}

/************************************************************
 *  The names of a system_flag. The desc carries the NUMBER
 *  (`1`), a schema literal carries the names
 *  ("sf_string_key|sf_t_ms"); both come back as a list. A
 *  set bit with no name is shown by its value, never
 *  dropped.
 ************************************************************/
function system_flag_names(system_flag)
{
    if(Array.isArray(system_flag)) {
        return system_flag.filter(n => typeof n === "string" && n.length > 0);
    }
    if(typeof system_flag === "string") {
        return system_flag.split(/[|,]/).map(n => n.trim()).filter(n => n.length > 0);
    }
    if(typeof system_flag !== "number" || !Number.isInteger(system_flag) || system_flag <= 0) {
        return [];
    }
    let names = [];
    for(let bit = 0; bit < SF_NAMES.length; bit++) {
        let mask = 1 << bit;
        if(system_flag & mask) {
            names.push(SF_NAMES[bit] || `0x${mask.toString(16).padStart(4, "0")}`);
        }
    }
    return names;
}

export {
    desc_pkey2s,
    desc_tkey,
    col_key_roles,
    system_flag_names,
};
