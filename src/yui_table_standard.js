/***********************************************************************
 *          yui_table_standard.js
 *
 *          THE STANDARD TABLE: what every table of an admin view has.
 *
 *          The rule (README, "Conventions" -> "A table: a filter on
 *          every column, the paginator always, the toolbar in one
 *          row"):
 *
 *          - a FILTER on every column that holds data;
 *          - the PAGINATOR at the bottom, always -- also when every
 *            row fits in one page -- with every row loaded in the
 *            browser (local pagination);
 *          - the toolbars above the table in ONE row, which scrolls
 *            sideways when it does not fit (`yui_toolbar()`).
 *
 *          Three calls do the table's half of it:
 *
 *              let table = new Tabulator($div, {
 *                  ...yui_tabulator_lang(t),
 *                  ...yui_table_paging(),
 *                  columns: yui_table_filters(columns),
 *              });
 *              yui_table_wire(table, t);
 *
 *          WHY THE PAGINATOR STAYS WHEN EVERYTHING FITS: the footer is
 *          where a reader looks for "how many", and a control that
 *          comes and goes with the number of rows is a control that
 *          has to be looked for. The table also has the same shape in
 *          every view, which is the point of a standard.
 *
 *          WHY EVERY ROW IS LOADED: a filter and a sort work on what
 *          the browser holds. With remote pages, a filter searches one
 *          page and a "not found" is a lie. The exception is a store
 *          of records that cannot be loaded whole (the records of a
 *          timeranger2 topic), and it pages from the backend on
 *          purpose.
 *
 *          The row count needs the key "rows" in the app (every app
 *          that shows a treedb table has it already).
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {yui_tabulator_name_filters} from "./yui_tabulator_i18n.js";
import {yui_table_filter_clear} from "./yui_table_filter_clear.js";


/*  Rows per page, and the sizes the selector offers. `true` is
 *  Tabulator's "All".  */
const YUI_TABLE_PAGE_SIZE = 25;
const YUI_TABLE_PAGE_SIZES = [25, 50, 100, true];

/*  The width a column with a text filter needs: the placeholder in the
 *  LONGEST locale ("filtrar columna...", ~18 characters). The same
 *  floor as the treedb topic table.  */
const YUI_TABLE_FILTER_MIN_WIDTH = 150;

/*  Formatters whose cell is a CONTROL, not data: nothing to filter.  */
const CONTROL_FORMATTERS = ["rowSelection", "handle", "responsiveCollapse", "buttonCross"];


/***************************************************************
 *  The row count of the footer.
 *
 *  Called by Tabulator with `this` = its pagination module, on
 *  every page, filter and data change. `total_rows` is the ACTIVE
 *  count: the rows the filters leave, all pages together.
 *
 *  The number is data; the word comes from the table's locale
 *  (`pagination.counter.rows`, which `yui_tabulator_lang()` fills
 *  with the app's "rows"), and `langBind` changes it again when
 *  `yui_tabulator_relocalize()` installs a new language.
 *
 *  Returns a DOM node, never a string: Tabulator puts a string in
 *  with `innerHTML`.
 ***************************************************************/
function rows_counter(page_size, current_row, current_page, total_rows)
{
    let $count = document.createElement("span");
    $count.className = "YUI_TABLE_COUNT";

    let $number = document.createElement("span");
    $number.className = "YUI_TABLE_COUNT_NUMBER";
    $number.textContent = String(total_rows || 0);

    let $word = document.createElement("span");
    $word.className = "YUI_TABLE_COUNT_WORD";
    $word.textContent = "rows";
    let localize = this && this.table && this.table.modules ? this.table.modules.localize : null;
    if(localize && typeof localize.langBind === "function") {
        localize.langBind("pagination|counter|rows", (value) => {
            $word.textContent = value;
        });
    }

    $count.appendChild($number);
    $count.appendChild(document.createTextNode(" "));
    $count.appendChild($word);
    return $count;
}

/***************************************************************
 *  The pagination settings of a standard table.
 *
 *  opts:
 *      size    rows per page (default 25)
 *      sizes   what the selector offers (default [25, 50, 100, true])
 *
 *  Spread them into the Tabulator settings. Local pagination: the
 *  host gives the table every row (`data` or `setData()`).
 ***************************************************************/
function yui_table_paging(opts)
{
    let o = opts || {};
    let size = o.size || YUI_TABLE_PAGE_SIZE;
    let sizes = Array.isArray(o.sizes) ? o.sizes.slice() : YUI_TABLE_PAGE_SIZES.slice();
    if(typeof size === "number" && !sizes.includes(size)) {
        sizes.unshift(size);
    }
    return {
        pagination:             true,
        paginationMode:         "local",
        paginationSize:         size,
        paginationSizeSelector: sizes,
        paginationCounter:      rows_counter
    };
}

/***************************************************************
 *  The columns, each with its header filter.
 *
 *  A column gets a filter when it has a `field` and says nothing
 *  about one (`headerFilter` undefined):
 *
 *      - a tick (`formatter: "tickCross"`) gets a three-state tick:
 *        any, yes, no;
 *      - any other gets a text box ("like": a part of the value, in
 *        any case), and a minimum width for the box, unless the
 *        column sets `width` or `minWidth` itself.
 *
 *  A column that says something keeps it: its own filter, or
 *  `headerFilter: false` for a column whose cell is a control (a
 *  row of action buttons). A column with no field, or whose cell is
 *  a control by its formatter (the selection checkbox), gets none.
 *  The groups of columns are walked.
 *
 *  The definitions are copied, never changed in place.
 ***************************************************************/
function yui_table_filters(columns)
{
    if(!Array.isArray(columns)) {
        return columns;
    }
    return columns.map((column) => {
        if(!column || typeof column !== "object") {
            return column;
        }
        if(Array.isArray(column.columns)) {
            return {...column, columns: yui_table_filters(column.columns)};
        }
        if(!column.field || column.headerFilter !== undefined) {
            return column;
        }
        if(CONTROL_FORMATTERS.includes(column.formatter)) {
            return column;
        }
        if(column.formatter === "tickCross") {
            return {
                ...column,
                headerFilter:       "tickCross",
                headerFilterParams: {tristate: true}
            };
        }
        let filtered = {...column, headerFilter: "input"};
        if(filtered.width === undefined && filtered.minWidth === undefined) {
            filtered.minWidth = YUI_TABLE_FILTER_MIN_WIDTH;
        }
        return filtered;
    });
}

/***************************************************************
 *  What the header filters need after the table is drawn.
 *
 *  Tabulator draws the filter boxes with no name, and draws them
 *  again on every rebuild of the columns: each one gets its name
 *  ("filter by column") and its ✕ (`yui_table_filter_clear()`).
 *
 *  Call it right after `new Tabulator(...)`: the table announces
 *  `tableBuilt` later.
 ***************************************************************/
function yui_table_wire(table, t)
{
    if(!table || typeof table.on !== "function") {
        return;
    }
    table.on("tableBuilt", () => {
        yui_tabulator_name_filters(table, t);
        yui_table_filter_clear(table);
    });
    table.on("columnsLoaded", () => {
        yui_tabulator_name_filters(table, t);
    });
}

export {
    YUI_TABLE_PAGE_SIZE,
    YUI_TABLE_PAGE_SIZES,
    YUI_TABLE_FILTER_MIN_WIDTH,
    yui_table_paging,
    yui_table_filters,
    yui_table_wire,
};
