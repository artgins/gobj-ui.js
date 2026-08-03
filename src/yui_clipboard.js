/***********************************************************************
 *          yui_clipboard.js
 *
 *          Put things on the clipboard, from any view.
 *
 *          Four views had grown their own copy code, and they had
 *          drifted: two of them wrote unindented JSON and reported
 *          nothing when the write failed. This is that code, once.
 *
 *          The Clipboard API is absent in an insecure context (plain
 *          http, some embedded webviews) and REJECTS when the document
 *          does not have focus — which happens whenever the click that
 *          asked for the copy also moved focus. Neither is something
 *          the caller can act on, so a hidden-textarea copy covers both
 *          rather than failing.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {log_error} from "@yuneta/gobj-js";

/***************************************************************
 *      Last-resort copy: a hidden textarea + execCommand.
 *      Deprecated in the spec, still the only route in an
 *      insecure context. Returns TRUE when it worked.
 ***************************************************************/
function fallback_copy(text)
{
    let ok = false;
    let $ta = document.createElement("textarea");

    $ta.value = text;
    $ta.style.position = "fixed";
    $ta.style.left = "-9999px";
    document.body.appendChild($ta);
    $ta.select();
    try {
        ok = document.execCommand("copy");
    } catch(e) {
        log_error(`yui_clipboard: execCommand copy failed: ${e}`);
    }
    document.body.removeChild($ta);

    if(!ok) {
        log_error("yui_clipboard: could not reach the clipboard");
    }
    return ok;
}

/***************************************************************
 *      Copy text.
 *      Resolves TRUE when the text reached the clipboard.
 ***************************************************************/
function yui_copy_text(text)
{
    if(typeof text !== "string") {
        log_error("yui_copy_text(): text must be a string");
        return Promise.resolve(false);
    }

    if(navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text).then(
            function() {
                return true;
            },
            function() {
                return fallback_copy(text);
            }
        );
    }

    return Promise.resolve(fallback_copy(text));
}

/***************************************************************
 *      Copy a value as JSON, indented FOUR spaces — the same
 *      width the rest of the family uses to show structure.
 *      Resolves TRUE when it reached the clipboard.
 ***************************************************************/
function yui_copy_json(value)
{
    let text;

    try {
        text = JSON.stringify(value, null, 4);
    } catch(e) {
        log_error(`yui_copy_json(): value is not serializable: ${e}`);
        return Promise.resolve(false);
    }

    if(text === undefined) {
        log_error("yui_copy_json(): value is not serializable");
        return Promise.resolve(false);
    }

    return yui_copy_text(text);
}

/***************************************************************
 *      What the user is LOOKING AT, as an array of records:
 *      the selected rows when there is a selection, otherwise
 *      every row that passes the current filters, in the order
 *      shown.
 *
 *      Deliberately not the whole dataset: the point is to hand
 *      over what is on screen. A table with no selection and no
 *      filter therefore copies everything, which is what the
 *      screen shows too.
 ***************************************************************/
function yui_table_rows(tabulator)
{
    if(!tabulator) {
        log_error("yui_table_rows(): no tabulator");
        return [];
    }

    let selected = tabulator.getSelectedData();
    if(selected && selected.length) {
        return selected;
    }

    return tabulator.getData("active");
}

/***************************************************************
 *      Copy what the table shows, as JSON.
 *      Resolves to the NUMBER of records copied, 0 if none —
 *      so the caller can tell the user, or stay quiet.
 ***************************************************************/
function yui_copy_table_json(tabulator)
{
    let rows = yui_table_rows(tabulator);

    if(!rows.length) {
        return Promise.resolve(0);
    }

    return yui_copy_json(rows).then(function(ok) {
        return ok? rows.length : 0;
    });
}

/***************************************************************
 *      Show a button as "done": swap its icon for a check and
 *      its label for the given text. Idempotent — calling it
 *      twice does not lose the original.
 *
 *      The TIMING is not here on purpose. A view arms its own
 *      C_TIMER and calls yui_button_unmark() from the timeout
 *      action, so going back is an FSM transition and shows up
 *      in the machine trace, instead of a setTimeout nobody can
 *      see. gobj-ui owns the look; the view owns the when.
 *
 *      Expects the Bulma button shape both views use:
 *          <button><span class="icon"><span class="yi-…">
 *                  <span>label</span></button>
 *      The label is optional (icon-only buttons on a phone).
 ***************************************************************/
function yui_button_mark_done($button, label)
{
    if(!$button) {
        log_error("yui_button_mark_done(): no button");
        return;
    }

    let $icon = $button.querySelector("span.icon > span");
    let $label = $button.querySelector("span.icon ~ span");

    if($icon && $button.dataset.yuiIconWas === undefined) {
        $button.dataset.yuiIconWas = $icon.className;
        $icon.className = "yi-check";
    }
    if($label && $button.dataset.yuiLabelWas === undefined) {
        $button.dataset.yuiLabelWas = $label.textContent;
        $label.textContent = label;
    }
}

/***************************************************************
 *      Put the button back the way it was. Safe to call when
 *      it was never marked.
 ***************************************************************/
function yui_button_unmark($button)
{
    if(!$button) {
        return;
    }

    let $icon = $button.querySelector("span.icon > span");
    let $label = $button.querySelector("span.icon ~ span");

    if($icon && $button.dataset.yuiIconWas !== undefined) {
        $icon.className = $button.dataset.yuiIconWas;
        delete $button.dataset.yuiIconWas;
    }
    if($label && $button.dataset.yuiLabelWas !== undefined) {
        $label.textContent = $button.dataset.yuiLabelWas;
        delete $button.dataset.yuiLabelWas;
    }
}

export {
    yui_copy_text,
    yui_copy_json,
    yui_table_rows,
    yui_copy_table_json,
    yui_button_mark_done,
    yui_button_unmark,
};
