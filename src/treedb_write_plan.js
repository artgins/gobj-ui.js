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


export {plan_treedb_writes, READONLY_FORM_TOOLBAR};
