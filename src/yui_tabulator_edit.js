/****************************************************************************
 *          yui_tabulator_edit.js
 *
 *          An open cell editor survives a FORCED redraw of its table,
 *          and the other calls that build its cells again.
 *
 *          `table.redraw(true)` builds every row's cells again, the one
 *          being edited too, and leaves Tabulator's edit pointing at the
 *          cell it threw away (it ends the edit before a data refresh,
 *          not before a redraw). Tabulator issues one itself, from
 *          ResizeTable's IntersectionObserver, the first time a table
 *          built out of sight comes into view -- and a click on a cell
 *          of a table below the fold scrolls it in AND opens the editor
 *          in the same turn. Chromium blurs the box it takes out, the
 *          editor's blur ends the edit on the dead cell, and Tabulator
 *          throws in Validate.editorClear ("reading 'remove'"); Firefox
 *          does not blur, and throws at the next edit. Any editor, ours
 *          (form_time_cell_editor.js) or Tabulator's own.
 *
 *          `setColumns()` (a language change of
 *          C_YUI_TREEDB_TOPIC_WITH_FORM runs it), `setHeight`,
 *          `setMaxHeight`, `setMinHeight`, `addColumn`,
 *          `updateColumnDefinition` and `moveColumn` build the cells
 *          again the same way, and Tabulator throws the same.
 *
 *          So the edit is ended BEFORE each of those calls, while its cell
 *          is alive, and opened again on the new cell of the same row
 *          and column after it (after the promise, for the calls that
 *          answer one). What was typed in the box is lost; the editor
 *          stays open under the reader. A cell the call left out of the
 *          page (a row the virtual DOM no longer renders) is not opened:
 *          the edit stays closed, and the log says so.
 *
 *          A call that WIPES the rows (setData, replaceData, clearData,
 *          destroy) closes the edit first with
 *          `yui_tabulator_close_editor()`: there is no cell to open it
 *          on again.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ****************************************************************************/
import {log_warning} from "@yuneta/gobj-js";

/************************************************************
 *  Close the cell editor a table has open, dropping what is
 *  typed in it, before its rows are wiped (setData, replaceData,
 *  clearData, destroy). Tabulator 6.6.0 closes it while it wipes
 *  them, and the redraw that follows walks the rows already
 *  wiped: with an editor open in any row but the first it threw
 *  ("reading 'add'"), and left the table half wiped.
 *
 *  Tabulator has no public way to ask which cell is edited: this
 *  reads its edit module (`modules.edit`, `currentCell`,
 *  `cancelEdit()`), names pinned against the installed Tabulator
 *  by tabulator_edit_internals.test.js. A Tabulator without them
 *  is said: the guard would do nothing, and the crash come back.
 *  `who` names the owner in that warning.
 ************************************************************/
function yui_tabulator_close_editor(tabulator, who)
{
    let edit = tabulator.modules? tabulator.modules.edit : null;
    if(!edit || !("currentCell" in edit) || typeof edit.cancelEdit !== "function") {
        log_warning(`${who}: this Tabulator has no modules.edit.currentCell/cancelEdit(): ` +
                    `an open cell editor is not closed before its table is wiped`);
        return;
    }
    if(edit.currentCell) {
        edit.cancelEdit();
    }
}

/************************************************************
 *  Wrap the calls of `tabulator` that build the cells again --
 *  a forced `redraw`, `setColumns`, the three height setters
 *  and `addColumn`, `updateColumnDefinition`, `moveColumn` --
 *  so that each ends the open edit first and opens it again
 *  after.
 ************************************************************/
function yui_tabulator_keep_edit_on_redraw(tabulator)
{
    let editing = null;
    tabulator.on("cellEditing", function(cell) {
        editing = cell;
    });
    tabulator.on("cellEdited", function() {
        editing = null;
    });
    tabulator.on("cellEditCancelled", function() {
        editing = null;
    });

    function edit_again(row, field, name)
    {
        let again = row.getCell(field);
        if(!again) {
            log_warning(`yui_tabulator_keep_edit_on_redraw: the edit of '${field}' stays closed: ` +
                        `no column '${field}' after ${name}()`);
            return;
        }
        let $again = again.getElement();
        if(!$again || !$again.isConnected) {
            log_warning(`yui_tabulator_keep_edit_on_redraw: the edit of '${field}' stays closed: ` +
                        `its row is not in the page after ${name}()`);
            return;
        }
        again.edit(true);
    }

    function keep_edit_around(name, rebuilds)
    {
        let original = tabulator[name].bind(tabulator);
        tabulator[name] = function(...args) {
            let cell = editing;
            /*  A success() with the value unchanged fires no cellEdited:
             *  the cell's class says whether it is still being edited.  */
            let $cell = cell? cell.getElement() : null;
            if(!rebuilds(args) || !$cell || !$cell.classList.contains("tabulator-editing")) {
                return original(...args);
            }
            let row = cell.getRow();
            let field = cell.getField();
            cell.cancelEdit();
            let ret = original(...args);
            if(ret && typeof ret.then === "function") {
                return ret.then(
                    (value) => {
                        edit_again(row, field, name);
                        return value;
                    },
                    (reason) => {
                        edit_again(row, field, name);
                        throw reason;
                    }
                );
            }
            edit_again(row, field, name);
            return ret;
        };
    }

    keep_edit_around("redraw", (args) => !!args[0]);
    for(const name of ["setColumns", "setHeight", "setMaxHeight", "setMinHeight",
                       "addColumn", "updateColumnDefinition", "moveColumn"]) {
        keep_edit_around(name, () => true);
    }
}

export {yui_tabulator_keep_edit_on_redraw, yui_tabulator_close_editor};
