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
