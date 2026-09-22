/***********************************************************************
 *          form_busy.js
 *
 *          The toolbar of a topic form while a write is in flight: every
 *          button disabled, the save button spinning. Bulma's `is-loading`
 *          is the spinner; `disabled` is what stops the second click.
 *
 *          A transition, not a setting: each button remembers whether it
 *          was disabled BEFORE the toolbar went busy, and busy(false) puts
 *          that back. So a second busy(true) while already busy must not
 *          run at all -- it read the buttons it had just disabled as
 *          "disabled on their own", and the busy(false) of a refused write
 *          left Save and Cancel dead (N9 of the 2026-09-22 review: a record
 *          with a picked file went busy for the read, then busy again for
 *          the write). The caller owns `state` ({busy}) for the form's life.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/

/************************************************************
 *  Move the toolbar to `busy`. Returns true when it moved, false when
 *  it was already there (nothing touched).
 ************************************************************/
function set_toolbar_busy($container, state, busy)
{
    busy = !!busy;
    if(!$container || !state) {
        return false;
    }
    if(!!state.busy === busy) {
        return false;
    }
    state.busy = busy;

    $container.querySelectorAll('.yui-toolbar-form button').forEach(($b) => {
        if(busy) {
            $b.dataset.was_disabled = $b.disabled? "1": "0";
            $b.disabled = true;
        } else if($b.dataset.was_disabled !== undefined) {
            $b.disabled = ($b.dataset.was_disabled === "1");
            delete $b.dataset.was_disabled;
        }
    });
    const $save = $container.querySelector('.yui-toolbar-form .button-save');
    if($save) {
        $save.classList.toggle('is-loading', busy);
    }
    return true;
}

export {
    set_toolbar_busy,
};
