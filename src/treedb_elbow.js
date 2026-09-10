/***********************************************************************
 *          treedb_elbow.js
 *
 *      Where an elbow edge of the treedb graph turns, as plain
 *      geometry: the two elbow edge types of c_g6_nodes_tree.js ask
 *      this module for their control points on every draw, and it
 *      can be tested without G6.
 *
 *      An elbow is mxGraph's tree routing: straight out of the
 *      parent's port to the channel half way to the child, along it,
 *      and straight into the child's port. Two cases are not that:
 *
 *      - An edge that does not run FORWARD: the child above its
 *        parent, or in the same row. One of the two edges of a
 *        reciprocal pair (A -> B and B -> A) is always one. A channel
 *        half way between would cross both cards and lie on top of
 *        its partner, so it goes ROUND: a short run out of its port,
 *        along the outside of both cards, and into the other port
 *        from that port's own side.
 *
 *      - Several edges joining the SAME two cards: a reciprocal pair,
 *        or two hooks of one parent reaching one child. Each gets a
 *        LANE: the first stays where it is, the next moves one step to
 *        one side, the next one step to the other. The lane follows
 *        the order the edges were made, so a new edge never moves the
 *        ones already drawn.
 *
 *      Written for the top-down reading; left to right is the same
 *      geometry with the axes swapped.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/

export const ELBOW_STEP = 10;      /*  between two lanes  */
export const ELBOW_JETTY = 16;     /*  straight run out of a port before a detour turns  */
export const ELBOW_CLEAR = 24;     /*  how far outside the two cards a detour runs  */

/************************************************************
 *  The lane of `id` among `ids`, the edges joining the same two
 *  cards: 0, then +1, -1, +2, -2... in the order they were made.
 *  Edge ids end in a counter, so a numeric sort is that order.
 ************************************************************/
export function elbow_lane(ids, id)
{
    let sorted = ids.slice().sort(
        (a, b) => String(a).localeCompare(String(b), undefined, {numeric: true})
    );
    let k = sorted.indexOf(id);
    if(k <= 0) {
        return 0;
    }
    let side = (k % 2)? 1 : -1;
    return side * Math.ceil(k / 2);
}

function swap(p)
{
    return [p[1], p[0]];
}

function swap_box(b)
{
    return {x1: b.y1, y1: b.x1, x2: b.y2, y2: b.x2};
}

/************************************************************
 *  The control points of an elbow from the port `s` to the port
 *  `t` ([x, y] each), knowing the boxes of the two cards
 *  ({x1, y1, x2, y2}) and the edge's lane.
 *
 *      vertical    the rows are stacked (top to bottom); false
 *                  when they are side by side (left to right)
 ************************************************************/
export function elbow_points(s, t, box_s, box_t, lane, vertical)
{
    if(!vertical) {
        return elbow_points(swap(s), swap(t), swap_box(box_s), swap_box(box_t), lane, true)
            .map(swap);
    }

    let shift = lane * ELBOW_STEP;

    /*  Forward: the channel half way down, moved by the lane and
     *  kept strictly between the two ports.  */
    if(t[1] - s[1] > 2 * ELBOW_STEP) {
        let mid = (s[1] + t[1]) / 2 + shift;
        mid = Math.min(Math.max(mid, s[1] + ELBOW_STEP), t[1] - ELBOW_STEP);
        return [[s[0], mid], [t[0], mid]];
    }

    /*  Backwards, or across one row: round the outside. A negative
     *  lane goes round the left, any other the right, so the two
     *  detours of one pair never share a side.  */
    let out = ELBOW_JETTY + Math.abs(shift);
    let side = (lane < 0)
        ? Math.min(box_s.x1, box_t.x1) - ELBOW_CLEAR - Math.abs(shift)
        : Math.max(box_s.x2, box_t.x2) + ELBOW_CLEAR + Math.abs(shift);
    let y1 = s[1] + out;        /*  a hook port is on the bottom edge  */
    let y2 = t[1] - out;        /*  an fkey port is on the top edge  */
    return [[s[0], y1], [side, y1], [side, y2], [t[0], y2]];
}
