/***********************************************************************
 *          treedb_write_plan.js
 *
 *      Which write affordances a treedb topic offers.
 *
 *      Pure, so it can be tested without a DOM: the gclass turns the
 *      plan into buttons and columns, this decides the plan. Same split
 *      as form_toolbar_plan.js.
 *
 *      The rule it exists to state ONCE: `readonly` is not one more
 *      button flag, it is the STATE of the topic and it wins over all of
 *      them. A treedb whose tranger this yuno does not master answers
 *      every write with "READ-ONLY" (the yuno refuses since SDK 7.13.0),
 *      so offering the buttons anyway only turns a fact into an error
 *      message per click. Written as `!readonly && with_x` in five
 *      places it is five places to forget the sixth.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/

import {treedb_get_field_desc} from "@yuneta/gobj-js";
import {topic_pkey2s} from "./schema_model.js";

/*  What a read-only form keeps: reading a record includes taking it with
 *  you, so `copy` stays and the write half goes.  */
const READONLY_FORM_TOOLBAR = ["copy"];


/***************************************************************
 *  plan_treedb_writes(flags) -> plan
 *
 *      flags   {readonly, with_edition_mode, with_new_button,
 *               with_delete_button, with_paste_button,
 *               with_in_row_edit_icons}
 *              Every with_* defaults to TRUE when absent, which is
 *              what the gclass attrs default to: a caller that sets
 *              nothing gets the toolbar this view always had.
 *
 *      plan    the same names without the `with_` prefix, plus
 *              `form_toolbar`: the list to hand C_YUI_FORM, or null
 *              to leave the form's own default alone.
 ***************************************************************/
function plan_treedb_writes(flags)
{
    let f = flags || {};
    let readonly = !!f.readonly;
    let want = (name) => {
        return (f[name] === undefined) ? true : !!f[name];
    };

    if(readonly) {
        return {
            readonly:      true,
            edition_mode:  false,
            new_button:    false,
            delete_button: false,
            paste_button:  false,
            in_row_icons:  false,
            form_toolbar:  READONLY_FORM_TOOLBAR.slice()
        };
    }

    return {
        readonly:      false,
        edition_mode:  want("with_edition_mode"),
        new_button:    want("with_new_button"),
        delete_button: want("with_delete_button"),
        paste_button:  want("with_paste_button"),
        in_row_icons:  want("with_in_row_edit_icons"),
        form_toolbar:  null
    };
}


/************************************************************
 *  Does column `col` travel back to treedb on a write?
 *
 *  The form SHOWS every field and sends back only what the topic
 *  accepts: the writable cols, the fkeys (a link is edited by
 *  linking) and the pkey, which is not written but is what
 *  ADDRESSES the record.
 *
 *  It matters because `treedb_update_node()` does not check
 *  `writable` -- it writes any col it is handed -- so a read-only
 *  field travelling back is written with whatever the form made of
 *  it, and the fields that describe a record are exactly the ones
 *  that do not survive a round trip through a widget: a `time` is an
 *  integer rendered as a `datetime-local`, with no seconds, so every
 *  save moved it back up to 59 s. Nothing looked wrong until the
 *  stored timestamp had moved.
 *
 *  `is_file` and not the type: a `file` column IS an fkey (it is
 *  flagged ['fkey','file']) but answers `type: "file"`, and the write
 *  goes out with `autolink`, which rebuilds the links from what the
 *  record carries. Dropped, a read-only `file` column -- the one only
 *  a load fills -- was UNLINKED by every save of any other field.
 *
 *  The pkey2s go back for the same reason as the pkey: a secondary key
 *  names the INSTANCE the update is for (`yunos.yuno_release` in the
 *  agent), and it is `persistent, required`, not `writable`. Dropped,
 *  the update reached the backend with no pkey2 and C_NODE resolved it
 *  to the PRIMARY instance -- right by chance while the table lists
 *  primaries, wrong from a form opened on a row of `instances`.
 ************************************************************/
function col_goes_back_to_treedb(desc, col)
{
    let d = desc || {};
    let pkey = d.pkey || "id";
    const field_desc = treedb_get_field_desc(col);

    if(field_desc.is_writable || field_desc.type === "fkey" ||
            field_desc.is_file || col.id === pkey) {
        return true;
    }
    return topic_pkey2s(d).includes(col.id);
}

export {plan_treedb_writes, READONLY_FORM_TOOLBAR, col_goes_back_to_treedb};
