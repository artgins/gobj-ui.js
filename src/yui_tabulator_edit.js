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
 *          stays open under the reader. It is NOT opened again, and the
 *          log says why, when: the cell is out of the page (a row the
 *          virtual DOM does not render, or a filter hides), its column is
 *          gone or has no editor any more, the call answered a REFUSAL
 *          (it rebuilt nothing) or threw, or -- before a promise answers
 *          -- the table was destroyed or another cell's editor was opened
 *          (the same cell opened again by the code is left as it is).
 *
 *          A call that WIPES the rows (setData, replaceData, clearData,
 *          destroy) cancels the edit first with
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

    function stays_closed(field, why)
    {
        log_warning(`yui_tabulator_keep_edit_on_redraw: the edit of '${field}' stays closed: ${why}`);
    }

    function has_column(field)
    {
        return tabulator.getColumns().some((c) => c.getField() === field);
    }

    function edit_again(row, field, name)
    {
        if(tabulator.destroyed) {
            stays_closed(field, `the table was destroyed after ${name}()`);
            return;
        }
        let $open = editing? editing.getElement() : null;
        if($open && $open.classList.contains("tabulator-editing")) {
            if(editing.getRow() !== row || editing.getField() !== field) {
                stays_closed(field, `another cell ('${editing.getField()}') was opened after ${name}()`);
            }
            return;     // else the code opened this same cell again: it is open
        }
        /*  A row the page does not draw keeps the cells of the old
         *  columns, so it answers no cell for a column that does exist.  */
        let again = row.getCell(field);
        if(!again) {
            if(has_column(field)) {
                stays_closed(field, `its row is not in the page after ${name}()`);
            } else {
                stays_closed(field, `no column '${field}' after ${name}()`);
            }
            return;
        }
        let $again = again.getElement();
        if(!$again || !$again.isConnected) {
            stays_closed(field, `its row is not in the page after ${name}()`);
            return;
        }
        if(!again.getColumn().getDefinition().editor) {
            stays_closed(field, `the column has no editor after ${name}()`);
            return;
        }
        try {
            again.edit(true);
        } catch(e) {
            stays_closed(field, `Tabulator refused to open it after ${name}(): ${e}`);
        }
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
            let ret;
            try {
                ret = original(...args);
            } catch(e) {
                stays_closed(field, `${name}() threw: ${e}`);
                throw e;
            }
            if(ret && typeof ret.then === "function") {
                return ret.then(
                    (value) => {
                        edit_again(row, field, name);
                        return value;
                    },
                    (reason) => {
                        /*  The edit had to be ended before asking; a refused
                         *  call rebuilt nothing, so nothing is opened again.  */
                        stays_closed(field, `${name}() was refused: ${reason}`);
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
