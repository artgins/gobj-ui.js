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
 *          A TREE table (`dataTree`) filters each column with
 *          `yui_tree_filter()`: Tabulator filters a tree from its roots,
 *          and a parent that fails hides the children that match.
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
 *  count: the rows the filters leave, all pages together. With a
 *  filter on, the count says both: "12 / 27 rows".
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

    /*  With a filter on, both numbers: the rows it leaves of the rows
     *  the table holds ("12 / 27"). The status lines the apps kept under
     *  their tables said it that way, and this count replaces them.  */
    let shown = total_rows || 0;
    let all = shown;
    try {
        if(this && this.table && typeof this.table.getDataCount === "function") {
            all = this.table.getDataCount();
        }
    } catch(e) {
        all = shown;
    }
    let $number = document.createElement("span");
    $number.className = "YUI_TABLE_COUNT_NUMBER";
    $number.textContent = (all > shown) ? `${shown} / ${all}` : String(shown);

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
 *  The header filter of a column whose cell SHOWS something else
 *  than its value: a boolean drawn as "enabled", a time drawn as a
 *  date, a list drawn as names.
 *
 *  `text_of(data)` answers the text that the row shows in the
 *  column. The row passes when it holds the term, in any case. A
 *  plain text filter compares the VALUE, so "enabled" finds nothing
 *  in a column of `false`.
 *
 *      {title: t("status"), field: "disabled",
 *       headerFilterFunc: yui_text_filter((d) => t(d.disabled ? "disabled" : "enabled"))}
 *
 *  `yui_table_filters()` then gives the column its text box.
 ***************************************************************/
function yui_text_filter(text_of)
{
    return function(term, value, data) {
        let needle = String(term ?? "").trim().toLowerCase();
        if(!needle) {
            return true;
        }
        let text = "";
        try {
            text = String(text_of(data) ?? "");
        } catch(e) {
            text = "";
        }
        return text.toLowerCase().includes(needle);
    };
}

/***************************************************************
 *  The header filter of a column of a TREE table (`dataTree`).
 *
 *  `text_of(data)` answers the text that a row shows in the column.
 *  A row passes when its own text holds the term (in any case), or
 *  when the text of one of its descendants does.
 *
 *  Why the descendants: Tabulator filters a tree from its roots, and
 *  a parent that fails is hidden with all its children. A filter on
 *  the name of a yuno would hide every node, and the yunos with
 *  them. With this one the node stays, and Tabulator then filters
 *  its children with the same function (`dataTreeFilter`, on by
 *  default), so only the yunos that match are shown.
 *
 *  `child_field` is the table's `dataTreeChildField` ("_children").
 *
 *      {title: t("name"), field: "id",
 *       headerFilterFunc: yui_tree_filter((d) => d.label || d.host)}
 *
 *  `yui_table_filters()` then gives the column its text box.
 ***************************************************************/
function yui_tree_filter(text_of, child_field)
{
    let field = child_field || "_children";

    function matches(data, needle, depth)
    {
        if(!data || typeof data !== "object") {
            return false;
        }
        let text = "";
        try {
            text = String(text_of(data) ?? "");
        } catch(e) {
            text = "";
        }
        if(text.toLowerCase().includes(needle)) {
            return true;
        }
        /*  A guard against a cycle in data that is not a tree.  */
        if(depth > 32) {
            return false;
        }
        let children = data[field];
        if(!Array.isArray(children)) {
            return false;
        }
        return children.some((child) => matches(child, needle, depth + 1));
    }

    return function(term, value, data) {
        let needle = String(term ?? "").trim().toLowerCase();
        if(!needle) {
            return true;
        }
        return matches(data, needle, 0);
    };
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
    yui_text_filter,
    yui_tree_filter,
    yui_table_wire,
};
