/***********************************************************************
 *          yui_tabulator_edit.test.js
 *
 *      yui_tabulator_keep_edit_on_redraw(): every Tabulator call that
 *      builds the cells again -- a forced redraw, setColumns(), the
 *      three height setters, addColumn(), updateColumnDefinition() and
 *      moveColumn() -- ends the open edit BEFORE it, while its cell is
 *      alive, and opens it again on the new cell after it (after the
 *      promise, for a call that answers one), unless that cell is not
 *      in the page. Nothing else is touched. The table is a double that records the
 *      order of the calls; that the real Tabulator throws without this
 *      is proved in a browser by scripts/qa-cell-editor.mjs.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {describe, test, expect, beforeEach, vi} from "vitest";
import {yui_tabulator_keep_edit_on_redraw} from "./yui_tabulator_edit.js";

let calls = [];
let connected = true;

function make_cell(row, field, editing)
{
    const cell = {
        field,
        classes: new Set(editing? ["tabulator-editing"] : []),
        getElement() {
            return {classList: {contains: (c) => cell.classes.has(c)}, isConnected: connected};
        },
        getRow() {
            return row;
        },
        getField() {
            return field;
        },
        cancelEdit() {
            calls.push(`cancel ${field}`);
            cell.classes.delete("tabulator-editing");
        },
        edit(force) {
            calls.push(`edit ${field} ${force}`);
        },
    };
    return cell;
}

function make_table()
{
    const handlers = {};
    const row = {
        getCell(field) {
            calls.push(`getCell ${field}`);
            return field === "gone"? false : make_cell(row, field, false);
        },
    };
    const table = {
        row,
        on(name, fn) {
            handlers[name] = fn;
        },
        emit(name, cell) {
            handlers[name](cell);
        },
    };
    for(const name of ["redraw", "setColumns", "setHeight", "setMaxHeight", "setMinHeight",
                       "moveColumn"]) {
        table[name] = function(...args) {
            calls.push(`${name}(${args.join(",")})`);
            return `${name} done`;
        };
    }
    for(const name of ["addColumn", "updateColumnDefinition"]) {
        table[name] = function(...args) {
            calls.push(`${name}(${args.join(",")})`);
            return Promise.resolve().then(() => {
                calls.push(`${name} resolved`);
                if(args[0] === "reject") {
                    throw new Error("refused");
                }
                return `${name} done`;
            });
        };
    }
    yui_tabulator_keep_edit_on_redraw(table);
    return table;
}

beforeEach(() => {
    calls = [];
    connected = true;
});

describe("an open edit around a call that builds the cells again", () => {
    for(const [name, args] of [
        ["redraw", [true]],
        ["setColumns", [["defs"]]],
        ["setHeight", [300]],
        ["setMaxHeight", [400]],
        ["setMinHeight", [100]],
        ["moveColumn", ["a", "b", true]],
    ]) {
        test(`${name}: ended before, opened again after, the answer passed on`, () => {
            const table = make_table();
            table.emit("cellEditing", make_cell(table.row, "when", true));
            const ret = table[name](...args);
            expect(ret).toBe(`${name} done`);
            expect(calls).toEqual([
                "cancel when",
                `${name}(${args.join(",")})`,
                "getCell when",
                "edit when true",
            ]);
        });
    }
});

describe("what it leaves alone", () => {
    test("a redraw that is not forced", () => {
        const table = make_table();
        table.emit("cellEditing", make_cell(table.row, "when", true));
        table.redraw();
        table.redraw(false);
        expect(calls).toEqual(["redraw()", "redraw(false)"]);
    });

    test("no edit open: never opened, ended, or ended without cellEdited", () => {
        const table = make_table();
        table.setColumns(["a"]);
        const cell = make_cell(table.row, "when", true);
        table.emit("cellEditing", cell);
        table.emit("cellEdited", cell);
        table.setHeight(10);
        table.emit("cellEditing", cell);
        table.emit("cellEditCancelled", cell);
        table.redraw(true);
        /*  A success() with the value unchanged fires no cellEdited.  */
        table.emit("cellEditing", cell);
        cell.classes.delete("tabulator-editing");
        table.setMinHeight(5);
        expect(calls).toEqual(["setColumns(a)", "setHeight(10)", "redraw(true)", "setMinHeight(5)"]);
    });

    test("a column the new columns do not have: the edit stays closed", () => {
        const table = make_table();
        table.emit("cellEditing", make_cell(table.row, "gone", true));
        expect(table.setColumns(["other"])).toBe("setColumns done");
        expect(calls).toEqual(["cancel gone", "setColumns(other)", "getCell gone"]);
    });
});

describe("a call that answers a promise", () => {
    for(const name of ["addColumn", "updateColumnDefinition"]) {
        test(`${name}: opened again after the promise, its answer passed on`, async () => {
            const table = make_table();
            table.emit("cellEditing", make_cell(table.row, "when", true));
            const ret = table[name]("x");
            expect(calls).toEqual(["cancel when", `${name}(x)`]);
            expect(await ret).toBe(`${name} done`);
            expect(calls).toEqual([
                "cancel when", `${name}(x)`, `${name} resolved`,
                "getCell when", "edit when true",
            ]);
        });
    }

    test("a refusal still opens it again, and is passed on", async () => {
        const table = make_table();
        table.emit("cellEditing", make_cell(table.row, "when", true));
        await expect(table.updateColumnDefinition("reject")).rejects.toThrow("refused");
        expect(calls.slice(-2)).toEqual(["getCell when", "edit when true"]);
    });
});

describe("a cell the call left out of the page", () => {
    test("the edit stays closed, and the log says why", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        const table = make_table();
        table.emit("cellEditing", make_cell(table.row, "when", true));
        connected = false;
        expect(table.setHeight(50)).toBe("setHeight done");
        expect(calls).toEqual(["cancel when", "setHeight(50)", "getCell when"]);
        expect(warn.mock.calls.flat().join(" ")).toMatch(/'when' stays closed: its row is not in the page after setHeight\(\)/);
        warn.mockRestore();
    });
});
