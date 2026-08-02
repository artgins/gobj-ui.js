/***********************************************************************
 *          form_toolbar_plan.js
 *
 *      Which buttons the C_YUI_FORM toolbar shows, and where.
 *
 *      Pure, so it can be tested without a DOM: the gclass turns the
 *      plan into elements, this decides the plan.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/

/*  Save/undo/clear sit on the left of the bar, copy/paste on the right.
 *  That split is what the layout has always drawn, and keeping it means
 *  a caller who drops one group does not leave a hole in the middle. */
const LEFT_BUTTONS  = ["save", "undo", "clear"];
const RIGHT_BUTTONS = ["copy", "paste"];

const DEFAULT_TOOLBAR = ["save", "undo", "clear", "copy", "paste"];


/***************************************************************
 *  plan_toolbar(wanted) -> {left, right, unknown}
 *
 *      wanted   an array of button names, in the order asked for.
 *               Anything that is not an array means "the default
 *               five", so a caller that sets nothing keeps exactly
 *               the toolbar this gclass always had.
 *               [] means no toolbar at all.
 *
 *      unknown  names that match no button.  They are reported and
 *               NOT silently dropped: a typo in the list would
 *               otherwise remove the save button with no trace.
 ***************************************************************/
function plan_toolbar(wanted)
{
    if(!Array.isArray(wanted)) {
        wanted = DEFAULT_TOOLBAR;
    }

    let left = [];
    let right = [];
    let unknown = [];

    for(let name of wanted) {
        if(LEFT_BUTTONS.indexOf(name) >= 0) {
            left.push(name);
        } else if(RIGHT_BUTTONS.indexOf(name) >= 0) {
            right.push(name);
        } else {
            unknown.push(name);
        }
    }

    return {left, right, unknown};
}


export {plan_toolbar, DEFAULT_TOOLBAR};
