/***********************************************************************
 *          yui_table_select.test.js
 *
 *      The part of the facility that is not DOM: what the checkbox
 *      column is, and reading a selection out of a table that may not
 *      be there any more. The bar itself is DOM, like every other view
 *      in this library, and this suite has no DOM.
 ***********************************************************************/
import { test, expect, describe } from "vitest";
import {
    yui_selection_column,
    yui_selection_settings,
    yui_selected_rows,
    yui_clear_selection,
    yui_row_ids,
    yui_rows_by_ids,
} from "./yui_table_select.js";

describe("the column", () => {
    test("is a rowSelection checkbox that does not sort", () => {
        let col = yui_selection_column();
        expect(col.formatter).toBe("rowSelection");
        expect(col.titleFormatter).toBe("rowSelection");
        expect(col.headerSort).toBe(false);
    });

    test("the header ticks the rows the filters leave on screen", () => {
        expect(yui_selection_column().titleFormatterParams).toEqual({rowRange: "active"});
    });

    test("the row itself is not clickable into selection", () => {
        expect(yui_selection_settings()).toEqual({selectableRows: "highlight"});
    });
});

describe("reading and dropping the selection", () => {
    test("a table that is not built yet has nothing selected", () => {
        expect(yui_selected_rows(null)).toEqual([]);
        expect(yui_selected_rows({})).toEqual([]);
    });

    test("a table that throws has nothing selected either", () => {
        expect(yui_selected_rows({getSelectedData: () => { throw new Error("gone"); }}))
            .toEqual([]);
    });

    test("the rows come back as the table gives them", () => {
        expect(yui_selected_rows({getSelectedData: () => [{id: "a"}]})).toEqual([{id: "a"}]);
    });

    test("clearing a table that is gone is not a crash", () => {
        expect(() => yui_clear_selection(null)).not.toThrow();
        expect(() => yui_clear_selection({deselectRow: () => { throw new Error("gone"); }}))
            .not.toThrow();
    });
});

/*
 *  A table as the delete of the treedb topic table meets it AFTER a
 *  confirmation: rows came and went while the dialog was open. A position
 *  names whatever row sits there now; an id names the row the question named
 *  (the regression of d60ec78, A6 of the 2026-09-21 review).
 */
function fake_table(rows, index)
{
    return {
        options: index ? {index: index} : {},
        getRow(id) {
            let data = rows.find((r) => r[index || "id"] === id);
            return data ? {getData: () => data} : false;
        }
    };
}

describe("row identity across a confirmation", () => {
    test("the ids are read from the table's index field", () => {
        let table = fake_table([], "name");
        expect(yui_row_ids(table, [{name: "a"}, {name: "b"}])).toEqual(["a", "b"]);
    });

    test("with no index configured the field is `id`, Tabulator's default", () => {
        expect(yui_row_ids(fake_table([]), [{id: "x"}])).toEqual(["x"]);
    });

    test("a row with no id has no identity to carry", () => {
        expect(yui_row_ids(fake_table([]), [{id: ""}, {}, null, {id: "k"}])).toEqual(["k"]);
    });

    test("the rows are the ones that carry the ids NOW, not the ones at a position", () => {
        /*  The question named "b". Before the answer, "a" went away: at
         *  position 2 there is now "c", and a position would delete it.  */
        let table = fake_table([{id: "b"}, {id: "c"}]);
        let found = yui_rows_by_ids(table, ["b"]);
        expect(found.rows).toEqual([{id: "b"}]);
        expect(found.missing).toEqual([]);
    });

    test("an id that is gone is reported, never replaced by another row", () => {
        let table = fake_table([{id: "c"}]);
        let found = yui_rows_by_ids(table, ["b", "c"]);
        expect(found.rows).toEqual([{id: "c"}]);
        expect(found.missing).toEqual(["b"]);
    });

    test("no table: nothing found, everything missing", () => {
        expect(yui_rows_by_ids(null, ["b"])).toEqual({rows: [], missing: ["b"]});
    });
});
