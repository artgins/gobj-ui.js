/***********************************************************************
 *          yui_table_filter_clear.js
 *
 *      THE ✕ OF A TABULATOR'S HEADER FILTERS.
 *
 *      A column filter is set by typing and removed by DELETING what
 *      was typed, letter by letter, and nothing in the header says it
 *      can be removed. With several columns filtered, getting the
 *      whole table back is an exercise of memory: which ones did I
 *      touch. The ✕ says it and does it.
 *
 *      THREE DECISIONS THAT ARE NOT OBVIOUS:
 *
 *      - **It shows while the filter has content, focused or not.**
 *        The opposite of a form's ✕ (`yui_inputs.js`), which appears
 *        only on the field being edited so as not to light a cross on
 *        every filled field. Here the use case is the reverse: the
 *        filter is already set, the focus is elsewhere, and what is
 *        wanted is to see it and remove it. Hidden behind the focus it
 *        would take two clicks.
 *
 *      - **It clears through the API, not by faking keys.**
 *        `setHeaderFilterValue(field, "")` is what Tabulator offers,
 *        and it keeps the value and the filter consistent. Synthesising
 *        an `input` on the `<input>` depends on what that filter's
 *        editor listens to, which changes with the column type.
 *
 *      - **The header is walked, the editor is not wrapped.** The
 *        columns are built from the topic's schema, so there is no
 *        single place to wrap the editor; and the header rebuilds
 *        itself when the columns change. The walk is idempotent -- it
 *        marks what already has its cross -- and is triggered by a
 *        one-pass `querySelector`, so repeating it on every render
 *        costs nothing.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import i18next from "i18next";

import {createElement2} from "@yuneta/gobj-js";

import "./yui_table_filter_clear.css";


const MARK = "data-yui-filter-clear";


/***************************************************************
 *  Put (or put back) the ✕ of every header filter of `table`.
 *
 *  Idempotent: the ones that already have it are skipped.
 ***************************************************************/
function decorate(table)
{
    if(!table || !table.element) {
        return;
    }
    let $pending = table.element.querySelector(`.tabulator-header-filter:not([${MARK}])`);
    if(!$pending) {
        return;     /*  nothing new in the header  */
    }

    let list = table.element.querySelectorAll(`.tabulator-header-filter:not([${MARK}])`);
    for(const $filter of list) {
        $filter.setAttribute(MARK, "1");

        let $input = $filter.querySelector("input");
        if(!$input) {
            continue;   /*  a filter that is not typed: a select, a range  */
        }

        /*  The field is read from the `.tabulator-col` holding it, which
         *  is what carries it; the `<input>` does not know its column.  */
        let $col = $filter.closest(".tabulator-col");
        let field = $col? $col.getAttribute("tabulator-field"): "";
        if(!field) {
            continue;   /*  without a field there is nobody to tell to clear  */
        }

        $filter.classList.add("yui-filter-has-clear");

        /*  The key travels with the button: a `title` set with t() at
         *  build time is invisible to refresh_language(), and stays in
         *  the language of that moment for ever.  */
        let $btn = createElement2(["button", {
            type:                   "button",
            class:                  "delete is-small yui-filter-clear",
            tabindex:               "-1",
            title:                  i18next.t("clear"),
            "aria-label":           i18next.t("clear"),
            "data-i18n-title":      "clear",
            "data-i18n-aria-label": "clear"
        }]);

        const sync = () => {
            $btn.classList.toggle("is-visible", !!$input.value);
        };

        $input.addEventListener("input", sync);
        $input.addEventListener("change", sync);
        $btn.addEventListener("click", (event) => {
            event.stopPropagation();    /*  a press must not sort the column  */
            table.setHeaderFilterValue(field, "");
            sync();
        });

        $filter.appendChild($btn);
        sync();
    }
}

/***************************************************************
 *  Hook the ✕ onto a table already created.
 *
 *  Called once, with the table built. The hooks cover the two
 *  moments the header appears or is rebuilt: when it is built
 *  and when the columns change.
 ***************************************************************/
export function yui_table_filter_clear(table)
{
    if(!table) {
        return;
    }
    decorate(table);
    table.on("renderComplete", () => {
        decorate(table);
    });
    table.on("columnVisibilityChanged", () => {
        decorate(table);
    });
}

/***************************************************************
 *  Go over the state of the ✕s after a change that did not come
 *  from the keyboard -- clearing every filter, loading a saved
 *  view -- because that fires no `input`.
 ***************************************************************/
export function yui_table_filter_clear_refresh(table)
{
    if(!table || !table.element) {
        return;
    }
    for(const $filter of table.element.querySelectorAll(".yui-filter-has-clear")) {
        let $input = $filter.querySelector("input");
        let $btn = $filter.querySelector(".yui-filter-clear");
        if($input && $btn) {
            $btn.classList.toggle("is-visible", !!$input.value);
        }
    }
}
