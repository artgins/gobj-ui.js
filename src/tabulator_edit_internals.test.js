/***********************************************************************
 *          tabulator_edit_internals.test.js
 *
 *      C_YUI_FORM and C_YUI_TREEDB_TOPIC_WITH_FORM close a table's
 *      open cell editor before they wipe the rows
 *      (yui_tabulator_close_editor): Tabulator 6.6.0 closes it while
 *      it wipes them and throws. Tabulator has no public way to ask
 *      which cell is being edited, so the helper reads its edit module:
 *      `table.modules.edit`, its `currentCell` and its `cancelEdit()`.
 *      This pins those names against the Tabulator INSTALLED: an
 *      upgrade that renames them fails here, not in a reader's
 *      reload. (The helper also says so in the log when they are
 *      missing.)
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {test, expect} from "vitest";
import {install_dom_double} from "../test/dom_double.js";

install_dom_double();     /*  Tabulator reads `document` when it loads  */

const {EditModule} = await import("tabulator-tables");

/*  Just what the module's constructor touches.  */
function stub_table()
{
    const registry = {register() {}};
    return {
        optionsList: registry,
        columnManager: {optionsList: registry},
        componentFunctionBinder: {bind() {}},
        eventBus: {subscribe() {}},
        externalEvents: {subscribe() {}},
    };
}

/*  A table keeps each module under its `moduleName`.  */
test("the edit module is `modules.edit`", () => {
    expect(EditModule.moduleName).toBe("edit");
});

test("it holds the cell being edited in `currentCell`, false when none", () => {
    const edit = new EditModule(stub_table());
    expect(Object.prototype.hasOwnProperty.call(edit, "currentCell")).toBe(true);
    expect(edit.currentCell).toBe(false);
});

test("and closes it with `cancelEdit()`", () => {
    expect(typeof EditModule.prototype.cancelEdit).toBe("function");
});
