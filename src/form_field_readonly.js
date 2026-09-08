/***********************************************************************
 *          form_field_readonly.js
 *
 *      Is this field of the form read-only?
 *
 *      Pure, so the rule can be tested without a DOM: the gclass turns
 *      the answer into `readonly`/`disabled` on a control, this decides
 *      the answer. Same split as form_toolbar_plan.js and
 *      treedb_write_plan.js.
 *
 *      The rule it exists to state ONCE: **`writable` governs the WRITE
 *      of a column's VALUE, and an fkey is not written — it is LINKED.**
 *      An fkey column is normally declared with no `writable` flag at
 *      all (`treedb_authzs`'s `users.roles` is `['fkey']`, and so is
 *      almost every fkey in the tree), so reading "not writable" as "not
 *      editable" takes away the only way to link a record to its parent
 *      — with `users.roles`, the only way to give a person a role.
 *
 *      The other half of this rule is already written down in
 *      c_yui_treedb_topic_with_form.js, where the record travels back:
 *      the form sends "the writable cols, the fkeys (a link is edited by
 *      linking) and the pkey". The two halves have to agree, and when
 *      they did not, the form disabled the control whose value the save
 *      path was still waiting for.
 *
 *      A `file` column is an fkey too (flagged `['fkey','file']`) and is
 *      NOT covered: it answers `type: "file"`, its bytes travel beside
 *      the record, and the SDK declares as legal a `file` column that
 *      only a load fills.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/


/***************************************************************
 *  field_is_readonly(form_readonly, field_desc) -> boolean
 *
 *      form_readonly   the FORM is read-only: a record opened to be
 *                      looked at, or a store nobody may write. It is
 *                      a property of the opening, not of the schema,
 *                      and it wins over everything.
 *      field_desc      as treedb_get_field_desc() answers it
 *                      (`type`, `is_writable`).
 ***************************************************************/
function field_is_readonly(form_readonly, field_desc)
{
    if(form_readonly) {
        return true;
    }

    let desc = field_desc || {};
    if(desc.type === "fkey") {
        return false;
    }

    return !desc.is_writable;
}


export {field_is_readonly};
