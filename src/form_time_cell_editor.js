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
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ****************************************************************************/
import {date_to_datetime_local, datetime_local_to_epoch} from "./form_time_value.js";

/************************************************************
 *  A cell's value -> the text of the box ("" when empty).
 ************************************************************/
function time_to_datetime_local(value, real_type)
{
    if(value === null || value === undefined || value === "") {
        return "";
    }
    if(real_type === "string") {
        return date_to_datetime_local(new Date(String(value)));
    }
    let seconds = Number(value);
    if(!Number.isFinite(seconds)) {
        return "";
    }
    return date_to_datetime_local(new Date(seconds * 1000));
}

/************************************************************
 *  The text of the box -> the cell's value (null when empty).
 ************************************************************/
function datetime_local_to_time(text, real_type)
{
    let epoch = datetime_local_to_epoch(text);
    if(epoch === null) {
        return null;
    }
    if(real_type === "string") {
        return new Date(epoch * 1000).toISOString();
    }
    return epoch;
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

        onRendered(function() {
            if(cell.getType() === "cell") {
                input.focus({preventScroll: true});
                input.style.height = "100%";
            }
        });

        let commit = function() {
            if(input.value === original_text) {
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
                commit();
            }
        });

        input.addEventListener("keydown", function(e) {
            switch(e.key) {
                case "Enter":
                    commit();
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
