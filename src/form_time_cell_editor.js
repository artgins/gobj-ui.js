/****************************************************************************
 *          form_time_cell_editor.js
 *
 *          The cell editor of a `time` / `now` column in a table of
 *          C_YUI_FORM: a `datetime-local` box, as the form's own time
 *          field, converting with the same helpers (form_time_value.js)
 *          -- an epoch in SECONDS for an integer column, an ISO text
 *          for a string one -- and to the second (`step` 1).
 *
 *          Up to gobj-ui 7.26.45 the column used Tabulator's `datetime`
 *          editor with a `format`, which needs luxon, and nothing gives
 *          gobj-ui luxon: the editor said "'date' editor 'format' param
 *          is dependant on luxon.js" in the console, opened empty, and
 *          threw when it was committed. Its format ("dd/MM/yyyy hh:mm",
 *          12-hour) could not have read an epoch either. Luxon is not
 *          taken in for it: one editor is not worth a dependency every
 *          app would have to dedupe, and the conversion it needs is the
 *          one the form already makes.
 *
 *          It behaves as Tabulator's own: `elementAttributes` are
 *          written on the box (the column's name, see
 *          yui_tabulator_name_editor), a true blur or Enter commits,
 *          Escape cancels, `verticalNavigation: "editor"` keeps the
 *          arrows, and a value that did not change is a cancel.
 *
 *          A date with a part cleared is NOT a value: the box answers
 *          `value ""` for it, as for an empty box, and only
 *          `validity.badInput` tells them apart. Enter leaves the
 *          editor open with `aria-invalid` until the date is whole
 *          again (or Escape); a blur cancels, and the cell keeps what
 *          it had. Up to gobj-ui 7.26.46 both committed null: one
 *          Backspace and Enter erased the stored time. To clear a time
 *          on purpose, clear EVERY part of the box: an empty box
 *          commits null. Inside the box the Left and Right arrows move
 *          between its parts; Tab is the table's (Tabulator's navNext):
 *          it leaves the cell and opens the editor of the next one, in
 *          Chromium and Firefox alike.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ****************************************************************************/
import {
    date_to_datetime_local, datetime_local_to_epoch, time_value_to_date, epoch_to_time_value
} from "./form_time_value.js";

/************************************************************
 *  A cell's value -> the text of the box ("" when empty).
 ************************************************************/
function time_to_datetime_local(value, real_type)
{
    return date_to_datetime_local(time_value_to_date(value, real_type));
}

/************************************************************
 *  The text of the box -> the cell's value (null when empty).
 ************************************************************/
function datetime_local_to_time(text, real_type)
{
    return epoch_to_time_value(datetime_local_to_epoch(text), real_type);
}

/************************************************************
 *  The editor of a time column whose values are `real_type`
 *  ("integer": epoch seconds; "string": ISO text).
 ************************************************************/
function form_time_cell_editor(real_type)
{
    return function(cell, onRendered, success, cancel, editorParams) {
        let params = editorParams || {};
        let vertical = params.verticalNavigation || "editor";
        let original = cell.getValue();
        let original_text = time_to_datetime_local(original, real_type);

        let input = document.createElement("input");
        input.type = "datetime-local";
        input.setAttribute("step", "1");
        input.style.padding = "4px";
        input.style.width = "100%";
        input.style.boxSizing = "border-box";
        let attrs = params.elementAttributes;
        if(attrs && typeof attrs === "object") {
            for(let key of Object.keys(attrs)) {
                input.setAttribute(key, attrs[key]);
            }
        }
        input.value = original_text;
        /*  What the box holds, as the browser writes it: Chromium and
         *  Firefox drop seconds of :00 ("…T02:30:00" reads "…T02:30"),
         *  so the text written never equals the text read back. Up to
         *  gobj-ui 7.26.48 a confirm with nothing changed then fell to
         *  the epoch, which in the repeated hour of autumn is one hour
         *  earlier (form_time_value.js): Enter wrote -3600 s.  */
        let shown_text = input.value;

        onRendered(function() {
            if(cell.getType() === "cell") {
                input.focus({preventScroll: true});
                input.style.height = "100%";
            }
        });

        /*  A part of the date cleared (one Backspace) reads "" as an
         *  empty box does: only badInput tells "not a time yet" from
         *  "no time".  */
        let incomplete = function() {
            return !!(input.validity && input.validity.badInput);
        };

        let commit = function(from_blur) {
            if(incomplete()) {
                if(from_blur) {
                    cancel();
                } else {
                    input.setAttribute("aria-invalid", "true");
                }
                return;
            }
            if(input.value === shown_text) {
                cancel();
                return;
            }
            let value = datetime_local_to_time(input.value, real_type);
            if(value === original || (value === null && original_text === "")) {
                cancel();
                return;
            }
            success(value);
        };

        /*  Only a TRUE blur: not the one of the browser's own picker.  */
        input.addEventListener("blur", function(e) {
            if(e.relatedTarget || e.rangeParent || e.explicitOriginalTarget !== input) {
                commit(true);
            }
        });

        /*  On every key too: a part cleared in a box whose value was
         *  already "" (incomplete) changes no value, and Chromium fires
         *  `input` only when the value changes -- the last part
         *  cleared left `aria-invalid` on an empty, valid box.  */
        let recheck = function() {
            if(!incomplete()) {
                input.removeAttribute("aria-invalid");
            }
        };
        input.addEventListener("input", recheck);
        input.addEventListener("keyup", recheck);

        input.addEventListener("keydown", function(e) {
            switch(e.key) {
                case "Enter":
                    commit(false);
                    break;
                case "Escape":
                    cancel();
                    break;
                case "End":
                case "Home":
                    e.stopPropagation();
                    break;
                case "ArrowUp":
                case "ArrowDown":
                    if(vertical === "editor") {
                        e.stopImmediatePropagation();
                        e.stopPropagation();
                    }
                    break;
            }
        });

        return input;
    };
}

export {form_time_cell_editor, time_to_datetime_local, datetime_local_to_time};
