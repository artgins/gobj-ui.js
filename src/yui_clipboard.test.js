/***********************************************************************
 *          yui_clipboard.test.js
 *
 *      Unit tests for the shared clipboard helpers.
 *      Run with: npm test
 ***********************************************************************/
import { test, expect, vi, beforeEach, afterEach } from "vitest";
import {
    yui_copy_text,
    yui_copy_json,
    yui_table_rows,
    yui_copy_table_json,
} from "./yui_clipboard.js";

let written;

beforeEach(() => {
    written = [];
    /*  A clipboard that accepts everything.  */
    Object.defineProperty(navigator, "clipboard", {
        value: {
            writeText: (text) => {
                written.push(text);
                return Promise.resolve();
            }
        },
        configurable: true,
        writable: true
    });
});

afterEach(() => {
    vi.restoreAllMocks();
});

/*  A Tabulator stand-in: only the two methods the helper calls.  */
function fake_table(active, selected)
{
    return {
        getData: () => active,
        getSelectedData: () => selected || []
    };
}

/*============================================================
 *      yui_copy_text
 *============================================================*/
test("copy_text: writes the text and resolves true", async () => {
    await expect(yui_copy_text("hello")).resolves.toBe(true);
    expect(written).toEqual(["hello"]);
});

test("copy_text: a non-string is refused, nothing is written", async () => {
    await expect(yui_copy_text({a: 1})).resolves.toBe(false);
    expect(written).toEqual([]);
});

/*============================================================
 *      yui_copy_json
 *============================================================*/
test("copy_json: indents FOUR spaces", async () => {
    await yui_copy_json({a: 1});
    expect(written[0]).toBe("{\n    \"a\": 1\n}");
});

test("copy_json: a cycle is reported, not thrown", async () => {
    let cyclic = {};
    cyclic.self = cyclic;
    await expect(yui_copy_json(cyclic)).resolves.toBe(false);
    expect(written).toEqual([]);
});

test("copy_json: an undefined value is refused", async () => {
    await expect(yui_copy_json(undefined)).resolves.toBe(false);
});

/*============================================================
 *      yui_table_rows
 *============================================================*/
test("table_rows: with no selection, the filtered rows", () => {
    let rows = [{id: 1}, {id: 2}];
    expect(yui_table_rows(fake_table(rows))).toEqual(rows);
});

test("table_rows: a selection WINS over the filtered rows", () => {
    let active = [{id: 1}, {id: 2}, {id: 3}];
    let selected = [{id: 2}];
    expect(yui_table_rows(fake_table(active, selected))).toEqual(selected);
});

test("table_rows: no table is an empty array, not a throw", () => {
    expect(yui_table_rows(null)).toEqual([]);
});

/*============================================================
 *      yui_copy_table_json
 *============================================================*/
test("copy_table_json: resolves to the number of records copied", async () => {
    let rows = [{id: 1}, {id: 2}, {id: 3}];
    await expect(yui_copy_table_json(fake_table(rows))).resolves.toBe(3);
    expect(JSON.parse(written[0])).toEqual(rows);
});

test("copy_table_json: an empty table copies nothing and reports 0", async () => {
    await expect(yui_copy_table_json(fake_table([]))).resolves.toBe(0);
    expect(written).toEqual([]);
});

test("copy_table_json: counts the SELECTION when there is one", async () => {
    let active = [{id: 1}, {id: 2}, {id: 3}];
    await expect(yui_copy_table_json(fake_table(active, [{id: 2}]))).resolves.toBe(1);
});
