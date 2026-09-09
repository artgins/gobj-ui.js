/***********************************************************************
 *          yui_tabulator_i18n.js
 *
 *      The strings TABULATOR renders on its own — the paginator ("Page
 *      Size", "First", "Prev", "Next", "Last"), the placeholder ("No Data
 *      Available"), the loading/error notices — through the app's i18n.
 *
 *      They are not built by any gclass, so nothing here or in an app ever
 *      passed them through t(): a table sat in English inside an otherwise
 *      Spanish view, and a language switch did not touch it.
 *
 *      Two calls:
 *
 *          new Tabulator($el, {..., ...yui_tabulator_lang(t)});
 *          yui_tabulator_relocalize(table, t);   // on a language change
 *
 *      Every key carries an English `defaultValue`, so an app that does not
 *      define it renders exactly what Tabulator rendered before — the
 *      keys are an OPPORTUNITY to translate, never a requirement.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {log_warning} from "@yuneta/gobj-js";


/*  Tabulator re-renders the parts it owns only when the locale NAME changes:
 *  setLocale() with the name already in force is a no-op, so re-registering
 *  fresh strings under "default" left the paginator in the old language. Each
 *  application of a language therefore gets its own name.  */
let __lang_seq__ = 0;

function next_lang_name()
{
    return `yui-${++__lang_seq__}`;
}

/***************************************************************
 *  Tabulator's own strings, in the CURRENT language.
 *
 *  ONE lang dict (not one per locale): the app owns the locales and hands us
 *  only its live `t`, so a language change rebuilds the dict and re-applies
 *  it under a fresh name (yui_tabulator_relocalize).
 ***************************************************************/
function yui_tabulator_lang(t)
{
    let name = next_lang_name();
    let langs = {};
    langs[name] = tabulator_strings(t);
    return {
        locale: name,
        langs:  langs
    };
}

function tabulator_strings(t)
{
    let tr = (key, def) => t(key, {defaultValue: def});

    return {
        data: {
            loading: tr("loading", "Loading"),
            error:   tr("error", "Error")
        },
        pagination: {
            page_size:   tr("page size", "Page Size"),
            page_title:  tr("show page", "Show Page"),
            first:       tr("first", "First"),
            first_title: tr("first page", "First Page"),
            last:        tr("last", "Last"),
            last_title:  tr("last page", "Last Page"),
            prev:        tr("prev", "Prev"),
            prev_title:  tr("prev page", "Prev Page"),
            next:        tr("next", "Next"),
            next_title:  tr("next page", "Next Page"),
            all:         tr("all", "All")
        },
        headerFilters: {
            default: tr("filter column", "filter column...")
        }
    };
}

/***************************************************************
 *  Put an EXISTING table in the current language: rebuild the strings and
 *  re-apply the locale, which is what makes Tabulator re-render the parts
 *  it owns (the paginator above all — it is drawn once, at build).
 *
 *  Silent no-op on a table that is gone: a language switch races nothing,
 *  but a view torn down mid-switch must not log a failure it cannot act on.
 ***************************************************************/

/***************************************************************
 *  Name the HEADER FILTER inputs.
 *
 *  Tabulator draws one text box per filterable column and gives
 *  it nothing: no label, no `aria-label`, no placeholder. On
 *  screen its position says what it filters -- it sits under the
 *  column's title -- and to anything that is not an eye it is a
 *  row of anonymous text boxes.
 *
 *  The name is composed from the column's own title, so it needs
 *  ONE consumer key with an interpolation (`filter by column` ->
 *  "Filtrar por {{column}}") instead of one per column, and it
 *  follows a language change because this runs from
 *  `yui_tabulator_relocalize()` as well as at build.
 ***************************************************************/
function yui_tabulator_name_filters(table, t)
{
    if(!table || typeof table.getColumns !== "function") {
        return;
    }
    try {
        for(let col of table.getColumns()) {
            let $el = typeof col.getElement === "function" ? col.getElement() : null;
            if(!$el) {
                continue;
            }
            let $input = $el.querySelector(".tabulator-header-filter input, " +
                                           ".tabulator-header-filter select");
            if(!$input) {
                continue;
            }
            let title = (typeof col.getDefinition === "function")
                ? String(col.getDefinition().title || "") : "";
            let $title = $el.querySelector(".tabulator-col-title");
            if(!title && $title) {
                title = $title.textContent.trim();
            }
            if(!title) {
                continue;   /*  a column with no title names nothing  */
            }
            /*  `filter by column` and NOT `filter column`: that key
             *  already exists in two apps as the header filter's
             *  PLACEHOLDER ("filtrar columna...") and carries no
             *  interpolation, so reusing it named all five boxes the
             *  same -- which is where this started.  */
            $input.setAttribute("aria-label", t("filter by column", {column: title}));
        }
    } catch(e) {
        /*  a table between renders has no columns to name  */
    }
}

/***************************************************************
 *  Name the ROW-SELECTION checkboxes.
 *
 *  Tabulator's `rowSelection` formatter hard-codes
 *  `aria-label="Select Row"` on the box it draws -- no locale
 *  key, no option, nothing to configure -- so a table in any
 *  other language announces every row in English. Same shape as
 *  the header filters above: rename after the render, and again
 *  from `yui_tabulator_relocalize()` so a language change
 *  reaches them.
 *
 *  It matches Tabulator's OWN literal and only that, so a box a
 *  view named itself is left alone.
 ***************************************************************/
const TABULATOR_ROW_SELECT_ARIA = "Select Row";

function yui_tabulator_name_row_selects(table, t)
{
    if(!table) {
        return;
    }
    try {
        /*  A Tabulator INSTANCE carries its node as `.element`; only its
         *  Column/Row components have `getElement()`. Testing for the
         *  method and returning silently made this a no-op on every real
         *  table -- and a no-op is what a dump of the deployed page
         *  showed, with the boxes still saying "Select Row".  */
        let $el = table.element
            || (typeof table.getElement === "function" ? table.getElement() : null);
        if(!$el) {
            log_warning("yui_tabulator_name_row_selects: table has no element: "
                        + "its row-selection boxes keep Tabulator's English name");
            return;
        }
        let boxes = $el.querySelectorAll(
            `input[type=checkbox][aria-label="${TABULATOR_ROW_SELECT_ARIA}"]`);
        for(let $box of boxes) {
            $box.setAttribute("aria-label", t("select row"));
            $box.setAttribute("data-i18n-aria-label", "select row");
        }
    } catch(e) {
        /*  a table between renders has no boxes to name  */
    }
}

function yui_tabulator_relocalize(table, t)
{
    if(!table) {
        return;
    }
    try {
        let name = next_lang_name();
        let strings = tabulator_strings(t);

        /*  Tabulator DEEP-CLONES options.langs into its localize module when
         *  the table is built, and never looks at the option again: writing a
         *  new language there and calling setLocale() only earned a
         *  "Matching locale not found, using default: yui-5" — and the
         *  paginator it was meant to translate stayed in the old language.
         *  Install it where the module actually reads it. The option is still
         *  written, so a table rebuilt from its options keeps the language.  */
        table.options.langs = table.options.langs || {};
        table.options.langs[name] = strings;

        let localize = table.modules && table.modules.localize;
        if(localize && typeof localize.installLang === "function") {
            localize.installLang(name, strings);
        } else {
            log_warning(`yui_tabulator_relocalize: no localize module: ` +
                        `Tabulator's own chrome stays in the old language`);
        }

        table.setLocale(name);      /*  a NEW name: this is what re-renders  */

        /*  AFTER setLocale, never before. Neither the header filters nor
         *  the row-selection boxes have a name of their own, and the
         *  re-render setLocale triggers REBUILDS the header -- so a name
         *  written first is thrown away with the old header, and the boxes
         *  come back in Tabulator's English. Which is exactly what a dump
         *  of the deployed page showed: clean on first paint, "Select Row"
         *  again after one language change.  */
        yui_tabulator_name_filters(table, t);
        yui_tabulator_name_row_selects(table, t);
    } catch(e) {
        log_warning(`yui_tabulator_relocalize: table gone: ${e}`);
    }
}

export {
    yui_tabulator_lang,
    yui_tabulator_relocalize,
    yui_tabulator_name_filters,
    yui_tabulator_name_row_selects,
};
