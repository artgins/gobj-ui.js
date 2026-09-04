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

/*  Two groups, and the split is a real one: `undo`, `clear` and `save`
 *  act on the RECORD being edited, `copy` and `paste` move it in and out
 *  of the clipboard. Keeping them apart means a caller who drops one
 *  group does not leave a hole in the middle.
 *
 *  WHICH SIDE EACH ONE TAKES CHANGED (2026-09-04), and the reason is that
 *  the form changed shape: it was an embedded panel and it opens as a
 *  MODAL DIALOG now. In a dialog the primary action goes bottom-RIGHT --
 *  every platform puts it there, and it is where the eye ends after
 *  reading the fields. `save` sat hard against the left edge, which is
 *  where a person looks last.
 *
 *  So: clipboard on the left, record actions on the right, and `save`
 *  LAST of all. The order inside a group is the order asked for, which
 *  is why DEFAULT_TOOLBAR is written in the order it is drawn.  */
const LEFT_BUTTONS  = ["copy", "paste"];
const RIGHT_BUTTONS = ["undo", "clear", "save"];

const DEFAULT_TOOLBAR = ["copy", "paste", "undo", "clear", "save"];


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

    /*  Con un solo grupo, repartir con `space-between` deja el boton
     *  pegado a un borde y el hueco entero al otro lado: un dialogo de
     *  una accion se ve mejor centrado.  Lo decide aqui y no el CSS de
     *  quien llama, porque la clase que lo reparte es un helper de Bulma
     *  y esos llevan `!important`: una regla de app no puede ganarles. */
    const single_group = (left.length === 0) !== (right.length === 0);

    return {left, right, unknown, single_group};
}


export {plan_toolbar, DEFAULT_TOOLBAR};
