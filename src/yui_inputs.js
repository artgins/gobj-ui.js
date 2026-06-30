/***********************************************************************
 *          yui_inputs.js
 *
 *      Reusable editable-input helpers.
 *
 *      NORM: every editable text/search input gets a clear (✕) button
 *      that appears only while the field has content. `attach_clear()`
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
 *  Add a clear (✕) button to a Bulma control wrapping an input.
 *  Returns the button element (already appended to $control).
 ***************************************************************/
function attach_clear($control, $input, on_clear)
{
    if(!$control || !$input) {
        return null;
    }
    $control.classList.add("has-clear");

    let $btn = createElement2(["button", {
        type:         "button",
        class:        "delete is-medium yui-input-clear",
        tabindex:     "-1",
        title:        i18next.t("clear"),
        "aria-label": i18next.t("clear")
    }]);

    function sync()
    {
        $btn.classList.toggle("is-visible", !!$input.value);
    }

    $input.addEventListener("input", sync);
    $btn.addEventListener("click", () => {
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

export {attach_clear};
