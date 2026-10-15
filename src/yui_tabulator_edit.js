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
 *          C_YUI_TREEDB_TOPIC_WITH_FORM runs it) and `setHeight`,
 *          `setMaxHeight` and `setMinHeight` build the cells again the
 *          same way, and Tabulator throws the same.
 *
 *          So the edit is ended BEFORE each of those calls, while its cell
 *          is alive, and opened again on the new cell of the same row
 *          and column after it. What was typed in the box is lost; the
 *          editor stays open under the reader.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ****************************************************************************/
import {log_warning} from "@yuneta/gobj-js";

/************************************************************
 *  Wrap the calls of `tabulator` that build the cells again --
 *  a forced `redraw`, `setColumns` and the three height setters
 *  -- so that each ends the open edit first and opens it again
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
            let again = row.getCell(field);
            if(!again) {
                log_warning(`yui_tabulator_keep_edit_on_redraw: no cell '${field}' after ${name}()`);
                return ret;
            }
            again.edit(true);
            return ret;
        };
    }

    keep_edit_around("redraw", (args) => !!args[0]);
    for(const name of ["setColumns", "setHeight", "setMaxHeight", "setMinHeight"]) {
        keep_edit_around(name, () => true);
    }
}

export {yui_tabulator_keep_edit_on_redraw};
