/***********************************************************************
 *          schema_flags.js
 *
 *      WHAT A COLUMN FLAG MEANS, next to the checkbox that sets it.
 *
 *      `flag` is the field of a column definition that decides the
 *      most and explains the least: an array picked from 30-odd words
 *      whose effects live in tr_treedb.c. Edited as a raw array — which
 *      is how it is edited today — the difference between `required`
 *      and `notnull`, or between `hook` and `fkey`, is something the
 *      operator has to already know or find out by restarting a yuno.
 *
 *      So the flags are DATA here: grouped the way they act, each with
 *      one line of what it does, and each knowing which column types it
 *      is meaningful on. The editor draws checkboxes from this table
 *      and nothing else knows the list.
 *
 *      The descriptions are English sentences used as i18n keys, the
 *      same convention as the rest of the library's strings.
 *
 *      The catalogue is not a whitelist: a flag this table does not
 *      know is still shown and still editable. A newer node may declare
 *      one, and a schema editor that silently drops what it does not
 *      recognize is worse than one that admits it.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/

/*  Every column type, for the flags that are meaningful on all of them.  */
const ANY = null;

/*  The groups, in the order the editor draws them: what the column IS
 *  before what it looks like.  */
const FLAG_GROUPS = ["storage", "validation", "access", "relation", "key", "stats", "format"];

/*  name    the word written into `flag`
 *  group   which block it is drawn in
 *  desc    one line of what it does (an i18n key)
 *  types   the column types it is meaningful on, or ANY  */
const FLAG_CATALOG = [
    /*  ---- storage ---- */
    {name: "persistent", group: "storage", types: ANY,
     desc: "saved to disk; a column without it lives only while the yuno runs"},
    {name: "wild", group: "storage", types: ANY,
     desc: "convert a value of another type instead of refusing it"},
    {name: "inherit", group: "storage", types: ANY,
     desc: "copied from the primary record to its other instances"},

    /*  ---- validation ---- */
    {name: "required", group: "validation", types: ANY,
     desc: "the field must be present when the record is written"},
    {name: "notnull", group: "validation", types: ANY,
     desc: "the field may be absent, but never null"},
    {name: "enum", group: "validation", types: ["string", "array", "list"],
     desc: "the value must be one of the `enum` list"},
    {name: "template", group: "validation", types: ANY,
     desc: "the value is built from the `template` field"},

    /*  ---- access ---- */
    {name: "writable", group: "access", types: ANY,
     desc: "may be changed after the record is created"},
    {name: "readable", group: "access", types: ANY,
     desc: "may be read back"},
    {name: "hidden", group: "access", types: ANY,
     desc: "left out of listings"},

    /*  ---- relation ---- */
    {name: "hook", group: "relation", types: ["dict", "object", "list", "array"],
     desc: "holds the children this record owns; needs a `hook` mapping"},
    {name: "fkey", group: "relation", types: ["string", "dict", "object", "list", "array"],
     desc: "holds the reference to a parent; written by the parent's hook"},

    /*  ---- key ---- */
    {name: "rowid", group: "key", types: ["string", "integer"],
     desc: "key generated as a counter when none is given"},
    {name: "uuid", group: "key", types: ["string"],
     desc: "key generated as a uuid when none is given"},
    {name: "qualified", group: "key", types: ["string"],
     desc: "key composed as the parent's id plus this record's name"},
    {name: "id", group: "key", types: ["string"],
     desc: "the value is an identifier of something else"},

    /*  ---- stats ---- */
    {name: "stats", group: "stats", types: ["integer", "real"],
     desc: "a counter, reported in the yuno statistics"},
    {name: "rstats", group: "stats", types: ["integer", "real"],
     desc: "a counter read through mt_reading when it is asked for"},
    {name: "pstats", group: "stats", types: ["integer", "real"],
     desc: "a counter kept across restarts"},

    /*  ---- format ---- */
    {name: "time", group: "format", types: ["integer", "string"],
     desc: "the value is a timestamp"},
    {name: "now", group: "format", types: ["integer"],
     desc: "stamped with the current time when the record is created"},
    {name: "date", group: "format", types: ["integer", "string"], desc: "a date"},
    {name: "password", group: "format", types: ["string"],
     desc: "shown masked, and never echoed back"},
    {name: "email", group: "format", types: ["string"], desc: "an email address"},
    {name: "url", group: "format", types: ["string"], desc: "a url"},
    {name: "tel", group: "format", types: ["string"], desc: "a telephone number"},
    {name: "color", group: "format", types: ["string"], desc: "a colour"},
    {name: "image", group: "format", types: ["string"], desc: "an image"},
    {name: "coordinates", group: "format", types: ["string", "array", "list"],
     desc: "a geographic position"},
    {name: "currency", group: "format", types: ["integer", "real"], desc: "an amount of money"},
    {name: "percent", group: "format", types: ["integer", "real"], desc: "a percentage"},
    {name: "hex", group: "format", types: ["integer", "string"], desc: "written in hexadecimal"},
    {name: "binary", group: "format", types: ["string", "blob"], desc: "binary content"},
    {name: "base64", group: "format", types: ["string", "blob"], desc: "encoded in base64"},
    {name: "gbuffer", group: "format", types: ["blob"], desc: "carried as a gbuffer"},
    {name: "table", group: "format", types: ["array", "list", "dict", "object"],
     desc: "drawn as a table"},
];

/*  Flags that decide the SHAPE of the record and cannot both be on the
 *  same column: the treedb writes one half of a link, never both.  */
const EXCLUSIVE = [["hook", "fkey"], ["rowid", "uuid", "qualified"]];


/***************************************************************
 *  flags_for_type(type) -> [{name, group, desc, meaningful}]
 *
 *      The whole catalogue, every entry saying whether it is
 *      meaningful on this type. Not filtered: a flag already SET on
 *      a column of another type has to stay visible, or the editor
 *      silently drops it on the next save.
 ***************************************************************/
function flags_for_type(type)
{
    return FLAG_CATALOG.map((flag) => {
        return {
            name:       flag.name,
            group:      flag.group,
            desc:       flag.desc,
            meaningful: flag.types === ANY || flag.types.indexOf(type) >= 0
        };
    });
}

/***************************************************************
 *  The catalogue as the editor draws it: by group, plus a last
 *  group holding whatever this column carries that the catalogue
 *  does not know.
 *
 *      grouped_flags(type, current) -> [{group, flags: [...]}]
 ***************************************************************/
function grouped_flags(type, current)
{
    let set = Array.isArray(current) ? current : [];
    let known = {};
    let by_group = {};

    for(let flag of flags_for_type(type)) {
        known[flag.name] = true;
        if(!by_group[flag.group]) {
            by_group[flag.group] = [];
        }
        by_group[flag.group].push(Object.assign({on: set.indexOf(flag.name) >= 0}, flag));
    }

    let out = [];
    for(let group of FLAG_GROUPS) {
        if(by_group[group]) {
            out.push({group: group, flags: by_group[group]});
        }
    }

    let unknown = set.filter(f => typeof f === "string" && f.length > 0 && !known[f]);
    if(unknown.length > 0) {
        out.push({
            group: "other",
            flags: unknown.map(name => ({
                name: name, group: "other", desc: "", meaningful: true, on: true
            }))
        });
    }
    return out;
}

/***************************************************************
 *  Turning a flag on may turn another off. Returns the flag list
 *  the change produces, so the caller never has to know which
 *  pairs exclude each other.
 *
 *      toggle_flag(current, name, on) -> [flag, ...]
 ***************************************************************/
function toggle_flag(current, name, on)
{
    let set = (Array.isArray(current) ? current : [])
        .filter(f => typeof f === "string" && f.length > 0);

    if(!on) {
        return set.filter(f => f !== name);
    }
    let excluded = {};
    for(let group of EXCLUSIVE) {
        if(group.indexOf(name) < 0) {
            continue;
        }
        for(let other of group) {
            if(other !== name) {
                excluded[other] = true;
            }
        }
    }
    let out = set.filter(f => !excluded[f]);
    if(out.indexOf(name) < 0) {
        out.push(name);
    }
    return out;
}

/***************************************************************
 *  What a flag does, or "" when the catalogue does not know it.
 ***************************************************************/
function flag_description(name)
{
    for(let flag of FLAG_CATALOG) {
        if(flag.name === name) {
            return flag.desc;
        }
    }
    return "";
}


export {
    FLAG_GROUPS,
    FLAG_CATALOG,
    EXCLUSIVE,
    flags_for_type,
    grouped_flags,
    toggle_flag,
    flag_description,
};
