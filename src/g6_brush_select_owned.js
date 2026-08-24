/***********************************************************************
 *          g6_brush_select_owned.js
 *
 *          The rubber band, for a graph whose FSM owns the selection.
 *
 *          Why this exists
 *          ----------------
 *          G6 v5 `brush-select` does two things: it draws the band and
 *          it keeps the `selected` element state.  The second one is
 *          not ours to give away -- `C_G6_NODES_TREE` owns the
 *          selection, sets it in `set_selection()` and clears it in
 *          `deselect_node()`, both with the history recorder paused,
 *          because a selection is not an edit.
 *
 *          The built-in disagrees on one path: on EVERY canvas click
 *          it calls `clearElementsStates()`, which writes the state of
 *          every node and every edge of the graph -- whether or not
 *          any of them carried it -- outside our pause.  G6's history
 *          then records the redraw as a command whose `original` and
 *          `current` are identical: an undo entry that undoes nothing,
 *          and a Save button lit on a graph nobody has touched.  One
 *          click on the background was enough.
 *
 *          So this subclass drops that half and keeps the band.  The
 *          selection still clears on a canvas click -- through
 *          `EV_CANVAS_CLICK`, where the gclass has always cleared it.
 *
 *          Registered under its OWN id: the built-in `brush-select` is
 *          right for a graph that does not own its selection, and no
 *          other consumer of this library asked for this.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {
    BrushSelect,
    ExtensionCategory,
    register,
} from '@antv/g6';

/************************************************************
 *  Same band, no state bookkeeping behind the gclass's back
 ************************************************************/
class BrushSelectOwned extends BrushSelect {
    clearElementsStates() {
        /*
         *  Deliberately empty. The gclass clears the selection from
         *  its own EV_CANVAS_CLICK action, with history paused.
         */
    }
}

/************************************************************
 *  Register once, under our own id
 ************************************************************/
const BRUSH_SELECT_OWNED = 'yui-brush-select';

let __brush_select_registered__ = false;

function ensure_brush_select_owned()
{
    if(__brush_select_registered__) {
        return;
    }
    register(ExtensionCategory.BEHAVIOR, BRUSH_SELECT_OWNED, BrushSelectOwned);
    __brush_select_registered__ = true;
}

export { ensure_brush_select_owned, BRUSH_SELECT_OWNED };
