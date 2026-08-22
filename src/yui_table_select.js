/***********************************************************************
 *          yui_table_select.js
 *
 *          SELECT ROWS IN A TABLE, and act on the lot.
 *
 *          Deleting twenty rows one confirmation at a time is not a
 *          workflow, it is a punishment, and every table that lets you
 *          remove a row will eventually be asked to remove twenty. This
 *          is that facility, once: the checkbox column, the settings
 *          that make selection behave, and the bar that appears while
 *          something is selected and carries what can be done to it.
 *
 *          Two decisions are baked in, both learned in the treedb
 *          topic table:
 *
 *          - Selection is driven ONLY by the checkbox, never by
 *            clicking the row (`selectableRows: "highlight"`). A table
 *            row is full of things to click -- an editor, an icon, a
 *            nested table -- and click-to-select ticks a row every time
 *            you reach for one of them.
 *
 *          - The header checkbox covers the ACTIVE rows, the ones the
 *            filters leave on screen. "Select all" over rows nobody can
 *            see is how a filtered delete takes the whole topic with
 *            it.
 *
 *          The bar takes its words from the HOST's `t`: this library
 *          translates through the app's i18next, and the app owns the
 *          keys. It needs "{{n}} selected" and "clear selection"; each
 *          action brings its own key.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {createElement2, log_error} from "@yuneta/gobj-js";

/***************************************************************
 *      The checkbox column. Put it FIRST in the column list.
 *
 *      opts:
 *          field   the (virtual) field name, default "_select"
 *          width   default 44
 ***************************************************************/
function yui_selection_column(opts)
{
    let o = opts || {};
    return {
        title:                "",
        field:                o.field || "_select",
        width:                o.width || 44,
        minWidth:             o.width || 44,
        hozAlign:             "center",
        headerHozAlign:       "center",
        headerSort:           false,
        resizable:            false,
        formatter:            "rowSelection",
        titleFormatter:       "rowSelection",
        /*  The header ticks what is ON SCREEN, not what the filters hide. */
        titleFormatterParams: {rowRange: "active"},
        cssClass:             "TABLE_SELECT_CELL"
    };
}

/***************************************************************
 *      What the Tabulator settings need for the column above.
 *      Spread it into the settings object.
 ***************************************************************/
function yui_selection_settings()
{
    return {selectableRows: "highlight"};
}

/***************************************************************
 *      The rows selected right now (never null).
 ***************************************************************/
function yui_selected_rows(tabulator)
{
    if(!tabulator || typeof tabulator.getSelectedData !== "function") {
        return [];
    }
    try {
        return tabulator.getSelectedData() || [];
    } catch(e) {
        return [];      /*  asked before the table was built  */
    }
}

/***************************************************************
 *      Drop the selection (after acting on it, or after a
 *      reload that leaves the ticked rows behind).
 ***************************************************************/
function yui_clear_selection(tabulator)
{
    if(!tabulator || typeof tabulator.deselectRow !== "function") {
        return;
    }
    try {
        tabulator.deselectRow();
    } catch(e) {
        /*  the table is gone: there is no selection to drop  */
    }
}

/***************************************************************
 *      Tell me when the selection changes.
 *
 *      `on_change(count)` is a DOM/widget notification and nothing
 *      else: in a gclass its whole job is to SEND AN EVENT.
 ***************************************************************/
function yui_wire_selection(tabulator, on_change)
{
    if(!tabulator || typeof tabulator.on !== "function") {
        log_error("yui_wire_selection(): no tabulator");
        return;
    }
    if(typeof on_change !== "function") {
        log_error("yui_wire_selection(): on_change is not a function");
        return;
    }
    tabulator.on("rowSelectionChanged", function(data) {
        on_change((data && data.length) || 0);
    });
}

/***************************************************************
 *      The bar that appears while rows are selected.
 *
 *      t           the HOST's translator
 *      opts:
 *          actions   [{label, icon, class, on_click}] -- `label` is an
 *                    i18n KEY, `class` extra Bulma classes for the
 *                    button (e.g. "is-danger"), `on_click` the DOM
 *                    handler, whose job is to send an event
 *          on_clear  called by the "clear selection" button
 *          name      logical-class prefix, default "TABLE"
 *
 *      -> {$el, set_count(n), refresh()}
 *
 *      `refresh()` redraws it in the current language: the count is
 *      composed at render time, so it cannot re-translate itself
 *      through `refresh_language()`. Call it on EV_LANGUAGE_CHANGED.
 ***************************************************************/
function yui_selection_bar(t, opts)
{
    let o = opts || {};
    let actions = Array.isArray(o.actions) ? o.actions : [];
    let name = o.name || "TABLE";
    let count = 0;

    let $count = createElement2(
        ["span", {class: `${name}_SELECTION_COUNT has-text-weight-semibold`}, ""]);

    let $buttons = [];
    for(let action of actions) {
        let $b = createElement2(
            ["button", {class: `${name}_SELECTION_ACTION button ${action.class || ""}`,
                        type: "button"}, [
                ["span", {class: "icon"}, [["i", {class: action.icon || "yi-check"}]]],
                ["span", {}, ""]
            ], {
                click: action.on_click
            }]
        );
        $b._yui_label = action.label || "";
        $buttons.push($b);
    }

    let $clear = createElement2(
        ["button", {class: `${name}_SELECTION_CLEAR button is-ghost`, type: "button"}, [
            ["span", {class: "icon"}, [["i", {class: "yi-xmark"}]]],
            ["span", {}, ""]
        ], {
            click: function(e) {
                if(typeof o.on_clear === "function") {
                    o.on_clear(e);
                }
            }
        }]
    );
    $clear._yui_label = "clear selection";

    /*  NOT `is-flex` in the class list: Bulma's helpers all carry
     *  `!important`, so `is-flex` and `is-hidden` would fight as equals and
     *  the stylesheet's order would decide -- `is-flex` wins, and the bar
     *  sits there saying "0 selected" for ever. The layout goes inline (a
     *  plain declaration, which `is-hidden !important` beats whenever the
     *  class is on), and only `is-hidden` toggles.  */
    let $el = createElement2(
        ["div", {class: `${name}_SELECTION_BAR is-align-items-center `
                      + "is-flex-wrap-wrap mb-2 is-hidden",
                 style: "display:flex; gap:0.5rem;"},
            [$count].concat($buttons, [$clear])]
    );

    function label_of($b)
    {
        /*  The second span: the icon carries the first one. */
        return $b.querySelector("span.icon ~ span");
    }

    function refresh()
    {
        $count.textContent = t("{{n}} selected", {n: count});
        for(let $b of $buttons.concat([$clear])) {
            let $label = label_of($b);
            let key = $b._yui_label;
            if($label && key) {
                $label.textContent = t(key);
            }
            $b.title = key ? t(key) : "";
            $b.setAttribute("aria-label", $b.title);
        }
        /*  Bulma's `is-hidden` carries `!important`: the class is what
         *  toggles, an inline display would lose to it. */
        $el.classList.toggle("is-hidden", count <= 0);
    }

    function set_count(n)
    {
        count = n > 0 ? n : 0;
        refresh();
    }

    refresh();

    return {$el: $el, set_count: set_count, refresh: refresh};
}


export {
    yui_selection_column,
    yui_selection_settings,
    yui_selected_rows,
    yui_clear_selection,
    yui_wire_selection,
    yui_selection_bar,
};
