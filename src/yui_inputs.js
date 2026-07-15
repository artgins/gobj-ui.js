/***********************************************************************
 *          yui_inputs.js
 *
 *      Reusable editable-input helpers.
 *
 *      NORM: every editable text/search input gets a clear (✕) button
 *      that appears only while the field has content AND is focused for
 *      editing (`:focus-within`, see yui_inputs.css) — so a form full of
 *      pre-filled fields shows the ✕ on the field the user is on, not on
 *      every populated field at once. `attach_clear()`
 *      wires it onto any Bulma `.control` that wraps an `<input>`:
 *
 *          let $input = createElement2(["input", {class:"input"}, ...]);
 *          let $control = createElement2(["div", {class:"control"}, [$input]]);
 *          attach_clear($control, $input);
 *
 *      The button is Bulma's own `.delete` (theme-aware). On click it
 *      clears the value, refocuses the input, and dispatches a synthetic
 *      `input` event so any existing listener (filter, etc.) reacts
 *      exactly as if the user emptied the field by hand. An optional
 *      `on_clear` callback runs after, for extra teardown (e.g. a
 *      console wiping its response panel).
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import "./yui_inputs.css";

import {createElement2} from "@yuneta/gobj-js";

import i18next from "i18next";


/***************************************************************
 *  The ✕ shows only when there is something to clear AND the field
 *  can actually be edited — a readonly/disabled input (e.g. the pkey
 *  in "update" mode) must not offer it.
 ***************************************************************/
function clear_visible($input)
{
    return !!$input.value && !$input.readOnly && !$input.disabled;
}

/***************************************************************
 *  Add a clear (✕) button to a Bulma control wrapping an input.
 *  Returns the button element (already appended to $control).
 ***************************************************************/
function attach_clear($control, $input, on_clear)
{
    if(!$control || !$input) {
        return null;
    }
    $control.classList.add("has-clear");

    /*  The key travels with the button: a `title` set from t() at build time
     *  is invisible to refresh_language(), so the tooltip stayed in the old
     *  language for the life of the input.  */
    let $btn = createElement2(["button", {
        type:                    "button",
        class:                   "delete is-medium yui-input-clear",
        tabindex:                "-1",
        title:                   i18next.t("clear"),
        "aria-label":            i18next.t("clear"),
        "data-i18n-title":       "clear",
        "data-i18n-aria-label":  "clear"
    }]);

    function sync()
    {
        $btn.classList.toggle("is-visible", clear_visible($input));
    }

    $input.addEventListener("input", sync);
    $btn.addEventListener("click", () => {
        if($input.readOnly || $input.disabled) {
            return;
        }
        $input.value = "";
        $input.dispatchEvent(new Event("input", {bubbles: true}));
        if(typeof on_clear === "function") {
            on_clear();
        }
        $input.focus();
        sync();
    });

    $control.appendChild($btn);
    sync();
    return $btn;
}

/***************************************************************
 *  Re-evaluate a clear (✕) after a PROGRAMMATIC change to its input
 *  — a value loaded into the form, or `readonly` toggled by the form
 *  mode — neither of which fires an `input` event. No-op on inputs
 *  that never got a clear.
 ***************************************************************/
function refresh_clear($input)
{
    if(!$input) {
        return;
    }
    let $control = $input.closest(".control.has-clear");
    if(!$control) {
        return;
    }
    let $btn = $control.querySelector(".yui-input-clear");
    if(!$btn) {
        return;
    }
    $btn.classList.toggle("is-visible", clear_visible($input));
}

export {attach_clear, refresh_clear};
