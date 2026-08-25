/***********************************************************************
 *          press_arbiter.js
 *
 *          What ONE finger meant.
 *
 *          A graph gives a single finger three commands -- move the
 *          node, act on it, open its menu -- and nothing in the press
 *          says which one until the finger either moves or lets go.
 *          So the press is arbitrated, and arbitrated at the RELEASE:
 *
 *              moved                -> "drag"   (the node followed it)
 *              still, let go fast   -> "tap"    (the element's action)
 *              still, held >= 500ms -> "long"   (the context menu)
 *
 *          Deciding earlier is what breaks it.  A menu opened on a
 *          TIMER opens while `drag-element` is already carrying the
 *          node: the same press then means two things at once, and
 *          the user gets a menu over a card running away underneath
 *          it.  A timer cannot arbitrate, because at the moment it
 *          fires the gesture is not over.
 *
 *          Pure, and separate from `g6_touch_gestures.js` for that
 *          reason: the rule can be read and tested without a graph,
 *          a canvas or a finger.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/

/***************************************************************
 *              Constants
 ***************************************************************/

/*
 *  How long a finger must stay put to mean "context menu", and how
 *  far it may wander first.  500ms is what Android and iOS both use
 *  for their own long press.
 *
 *  The 10px is not a taste: it is the `dragstartDistanceThreshold`
 *  G6 gives the dragndrop plugin of its main canvas.  Keeping the
 *  two equal is what makes "still" mean the same thing to both --
 *  a press held inside the slop has NOT moved the node, so a menu
 *  it opens does not open over a card that quietly shifted.
 */
export const LONG_PRESS_MS   = 500;
export const LONG_PRESS_SLOP = 10;     /* CSS px */


/***************************************************************
 *              Arbitration
 ***************************************************************/

/************************************************************
 *   Did the finger travel far enough to mean a DRAG?
 *
 *   `press` is what the pointerdown recorded: {x, y, t0}.
 ************************************************************/
export function press_moved(press, x, y)
{
    if(!press) {
        return false;
    }
    return Math.abs(x - press.x) > LONG_PRESS_SLOP ||
           Math.abs(y - press.y) > LONG_PRESS_SLOP;
}

/************************************************************
 *   What the press meant, asked when the finger comes up.
 *
 *   Answers "none" when there was no press to arbitrate.
 ************************************************************/
export function classify_press(press, x, y, t)
{
    if(!press) {
        return "none";
    }
    if(press_moved(press, x, y)) {
        return "drag";
    }
    if(t - press.t0 >= LONG_PRESS_MS) {
        return "long";
    }
    return "tap";
}
