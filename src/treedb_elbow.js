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
 *      - Several forward edges sharing one END: the children of one
 *        card, or the parents of one card (all its fkeys enter by one
 *        point). They are STAGGERED: each turns at its own height in
 *        the channel, so their runs lie side by side instead of on top
 *        of each other. Leaving a card, the one that runs farthest
 *        turns highest; reaching a card, the one that comes from
 *        farthest turns lowest -- the two orders in which the lines of
 *        one end nest without crossing.
 *
 *      - A card in a lower row of a STACK (treedb_layout.js lays a
 *        run of leaf children out as two columns with a corridor
 *        between them): the card above it stands in the way of the
 *        channel, so its edge runs down the corridor in a lane of
 *        its own -- a COMB -- and turns into the gap above its card.
 *
 *      And for CURVED edges (curve_hits, rounded_path): a curve
 *      that would cross another card follows the same way an elbow
 *      would, with round corners, so it reads as a curve.
 *
 *      Written for the top-down reading; left to right is the same
 *      geometry with the axes swapped.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/

import {STACK_GAP, STACK_LANE_PAD, STACK_LANE_STEP, STACK_TRUNK_MIN} from "./treedb_layout.js";

export const ELBOW_STEP = 10;      /*  between two lanes  */
export const ELBOW_JETTY = 16;     /*  straight run out of a port before a detour turns  */
export const ELBOW_CLEAR = 24;     /*  how far outside the two cards a detour runs  */
export const ELBOW_STAGGER_PAD = 6;    /*  staggered turns keep this far from the rows  */

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

/************************************************************
 *  The rank of `id` among `items` ([{id, span}]): the forward
 *  edges that share one end with it, each with how far it runs
 *  ACROSS. Farthest first; a tie goes to the edge made first.
 *  Returns {rank, count}.
 ************************************************************/
export function elbow_rank(items, id)
{
    let sorted = items.slice().sort((a, b) => {
        if(b.span !== a.span) {
            return b.span - a.span;
        }
        return String(a.id).localeCompare(String(b.id), undefined, {numeric: true});
    });
    let rank = sorted.findIndex((it) => it.id === id);
    return {rank: (rank < 0)? 0 : rank, count: sorted.length};
}

function swap(p)
{
    return [p[1], p[0]];
}

function swap_box(b)
{
    return {x1: b.y1, y1: b.x1, x2: b.y2, y2: b.x2};
}

/*  Where a forward edge turns between `lo` and `hi`: the middle, or
 *  its staggered place among the edges sharing one of its ends --
 *  leaving, the farthest highest; arriving, the farthest lowest.  */
function staggered_turn(lo, hi, st)
{
    let mid = (lo + hi) / 2;
    let group = null;
    let k = 0;
    if(st.dep && st.dep.count > 1) {
        group = st.dep;
        k = st.dep.rank;
    } else if(st.arr && st.arr.count > 1) {
        group = st.arr;
        k = st.arr.count - 1 - st.arr.rank;
    }
    if(group) {
        let room = Math.max(0, hi - lo - 2 * ELBOW_STAGGER_PAD);
        let step = Math.min(ELBOW_STEP, room / (group.count - 1));
        mid = mid - (group.count - 1) * step / 2 + k * step;
    }
    return mid;
}

/************************************************************
 *  The combs of the stacks under one card.
 *
 *  treedb_layout.js lays a run of leaf children out as two columns
 *  with a corridor between them. A card in the first row is reached
 *  from the channel like any other; one in a lower row cannot be --
 *  the card above it stands in the way -- so its edge runs down
 *  the corridor in a LANE of its own and turns into the gap above
 *  its card, which it shares only with the other card of its row,
 *  reached from the other side.
 *
 *      targets     [{id, box}]: the forward edges leaving one card,
 *                  each with the box of the card it reaches
 *      vertical    as in elbow_points; false swaps the boxes
 *
 *  Returns Map id -> {lane, z, top}: the lane, the height of the
 *  gap it turns into, and the top of the stack's first row (where
 *  the channel over the stack ends). Only for a card that stands
 *  under another of the group, within a stack gap and lined up
 *  with it on the corridor side -- what a stack looks like.
 *
 *  Lanes go outermost first, row by row: a line into a higher row
 *  keeps outside the lines going deeper, and none crosses another.
 ************************************************************/
export function elbow_combs(targets, vertical)
{
    let list = vertical? targets : targets.map((it) => ({id: it.id, box: swap_box(it.box)}));
    let cy = (b) => (b.y1 + b.y2) / 2;
    let near = (a, b) => Math.abs(a - b) < 1.5;

    let under = [];
    for(let it of list) {
        let b = it.box;
        let above = null;
        for(let o of list) {
            let a = o.box;
            if(o === it || a.y2 > b.y1 || b.y1 - a.y2 > STACK_GAP) {
                continue;
            }
            if(!(near(a.x2, b.x2) || near(a.x1, b.x1))) {
                continue;
            }
            if(!above || a.y2 > above.y2) {
                above = a;
            }
        }
        if(!above) {
            continue;
        }
        /*  Its column: lined up on the corridor side, which is the
         *  right edge of the first column and the left edge of the
         *  second. Two cards of one width line up on both; then the
         *  card beside it in its row says.  */
        let side;
        if(near(above.x2, b.x2) && !near(above.x1, b.x1)) {
            side = 0;
        } else if(near(above.x1, b.x1) && !near(above.x2, b.x2)) {
            side = 1;
        } else {
            let left_of_it = list.some((o) => o !== it && near(cy(o.box), cy(b)) &&
                                               o.box.x2 <= b.x1);
            side = left_of_it? 1 : 0;
        }
        under.push({id: it.id, box: b, above: above, side: side});
    }

    /*  The corridor of a card: from the first column's edge to the
     *  second's, read off any row of the stack that has both.  */
    let corridor = (u) => {
        if(u.side === 0) {
            let l = u.box.x2;
            let col = list.filter((o) => near(o.box.x2, l));
            let r = Infinity;
            for(let c of col) {
                for(let o of list) {
                    if(o !== c && near(cy(o.box), cy(c.box)) && o.box.x1 >= l - 0.5) {
                        r = Math.min(r, o.box.x1);
                    }
                }
            }
            return {l: l, r: isFinite(r)? r : l + STACK_TRUNK_MIN, col: col};
        }
        let r = u.box.x1;
        let col = list.filter((o) => near(o.box.x1, r));
        let l = -Infinity;
        for(let c of col) {
            for(let o of list) {
                if(o !== c && near(cy(o.box), cy(c.box)) && o.box.x2 <= r + 0.5) {
                    l = Math.max(l, o.box.x2);
                }
            }
        }
        return {l: isFinite(l)? l : r - STACK_TRUNK_MIN, r: r, col: col};
    };

    let groups = new Map();
    for(let u of under) {
        let c = corridor(u);
        u.top = Math.min(...c.col.map((o) => o.box.y1));
        let key = `${Math.round(c.l)}|${Math.round(c.r)}`;
        if(!groups.has(key)) {
            groups.set(key, {l: c.l, r: c.r, left: [], right: []});
        }
        groups.get(key)[(u.side === 0)? 'left' : 'right'].push(u);
    }

    let out = new Map();
    for(let g of groups.values()) {
        g.left.sort((a, b) => a.box.y1 - b.box.y1);
        g.right.sort((a, b) => a.box.y1 - b.box.y1);
        let n = g.left.length + g.right.length;
        let room = g.r - g.l - 2 * STACK_LANE_PAD;
        let step = (n > 1)? Math.max(0, Math.min(STACK_LANE_STEP, room / (n - 1))) : 0;
        g.left.forEach((u, i) => {
            out.set(u.id, {lane: g.l + STACK_LANE_PAD + i * step,
                           z: (u.above.y2 + u.box.y1) / 2, top: u.top});
        });
        g.right.forEach((u, j) => {
            out.set(u.id, {lane: g.r - STACK_LANE_PAD - j * step,
                           z: (u.above.y2 + u.box.y1) / 2, top: u.top});
        });
    }
    return out;
}

/************************************************************
 *  The control points of an elbow from the port `s` to the port
 *  `t` ([x, y] each), knowing the boxes of the two cards
 *  ({x1, y1, x2, y2}) and the edge's lane.
 *
 *      vertical    the rows are stacked (top to bottom); false
 *                  when they are side by side (left to right)
 *      stagger     {dep, arr, comb}: the edge's rank among the
 *                  forward edges leaving its source card and among
 *                  those reaching its target card (elbow_rank), and
 *                  its comb when the target is in a lower row of a
 *                  stack (elbow_combs). Absent, the channel is the
 *                  middle.
 ************************************************************/
export function elbow_points(s, t, box_s, box_t, lane, vertical, stagger)
{
    if(!vertical) {
        return elbow_points(swap(s), swap(t), swap_box(box_s), swap_box(box_t), lane, true,
                            stagger).map(swap);
    }

    let shift = lane * ELBOW_STEP;

    /*  Forward: the channel half way between the two cards, each
     *  edge of a shared end at its own height round it, moved by the
     *  lane, and kept between the two rows. Into a lower row of a
     *  stack: along the channel to its corridor lane, down the lane,
     *  and into the gap above its card.  */
    if(t[1] - s[1] > 2 * ELBOW_STEP) {
        let st = stagger || {};
        let lo = Math.max(s[1], box_s.y2);
        if(st.comb) {
            let c = st.comb;
            let turn = staggered_turn(lo, c.top, {dep: st.dep}) + shift;
            turn = Math.min(Math.max(turn, lo + 4), c.top - 4);
            return [[s[0], turn], [c.lane, turn], [c.lane, c.z], [t[0], c.z]];
        }
        let hi = Math.min(t[1], box_t.y1);
        let mid = staggered_turn(lo, hi, st) + shift;
        mid = Math.min(Math.max(mid, lo + 4), hi - 4);
        return [[s[0], mid], [t[0], mid]];
    }

    /*  Backwards, or across one row: round the outside. A negative
     *  lane goes round the left, any other the right, so the two
     *  detours of one pair never share a side.  */
    let out = ELBOW_JETTY + Math.abs(shift);
    let side = (lane < 0)
        ? Math.min(box_s.x1, box_t.x1) - ELBOW_CLEAR - Math.abs(shift)
        : Math.max(box_s.x2, box_t.x2) + ELBOW_CLEAR + Math.abs(shift);
    /*  From the border of the whole box, which holds the ports: a
     *  port sticks out of its card, and the run has to clear it.  */
    let y1 = Math.max(s[1], box_s.y2) + out;     /*  a hook port is on the bottom edge  */
    let y2 = Math.min(t[1], box_t.y1) - out;     /*  an fkey port is on the top edge  */
    return [[s[0], y1], [side, y1], [side, y2], [t[0], y2]];
}

/*----------------------------------------------------------------*
 *      Round the OTHER cards too
 *----------------------------------------------------------------*/
export const ROUTE_REACH = 400;     /*  how far around the two cards the first search looks  */
export const ROUTE_BEND = 40;       /*  a turn costs as much as this many pixels of line  */

function box_expand(b, m)
{
    return {x1: b.x1 - m, y1: b.y1 - m, x2: b.x2 + m, y2: b.y2 + m};
}

function box_overlaps(a, b)
{
    return a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1;
}

function point_inside(p, b)
{
    return p[0] > b.x1 && p[0] < b.x2 && p[1] > b.y1 && p[1] < b.y2;
}

/*  Does the axis-aligned segment a-c pass through the INSIDE of b?
 *  Running along its border does not count.  */
function segment_hits(a, c, b)
{
    let x1 = Math.min(a[0], c[0]);
    let x2 = Math.max(a[0], c[0]);
    let y1 = Math.min(a[1], c[1]);
    let y2 = Math.max(a[1], c[1]);
    return x1 < b.x2 && x2 > b.x1 && y1 < b.y2 && y2 > b.y1;
}

function same_box(a, b)
{
    return !!a && !!b && a.x1 === b.x1 && a.y1 === b.y1 && a.x2 === b.x2 && a.y2 === b.y2;
}

/************************************************************
 *  Does the polyline `points` (its ends included) cross any of
 *  `boxes`? A box is shrunk by a pixel, so a line along its
 *  border is not a hit.
 *
 *  A box is a whole node, its ports included, and the edge's own
 *  ports stick out of its own two cards: its first segment starts
 *  inside `box_s` and its last one ends inside `box_t`. Those two
 *  segments are not tested against their own box; every other
 *  segment is, so a line may not run back over its own cards.
 ************************************************************/
export function elbow_path_hits(points, boxes, box_s, box_t)
{
    let last = points.length - 2;
    for(let b of boxes) {
        let inner = box_expand(b, -1);
        let own_s = same_box(b, box_s);
        let own_t = same_box(b, box_t);
        for(let i = 0; i <= last; i++) {
            if((own_s && i === 0) || (own_t && i === last)) {
                continue;
            }
            if(segment_hits(points[i], points[i + 1], inner)) {
                return true;
            }
        }
    }
    return false;
}

/*  A binary heap of [cost, state], smallest cost first.  */
function heap_push(h, item)
{
    h.push(item);
    let i = h.length - 1;
    while(i > 0) {
        let p = (i - 1) >> 1;
        if(h[p][0] <= h[i][0]) {
            break;
        }
        [h[p], h[i]] = [h[i], h[p]];
        i = p;
    }
}

function heap_pop(h)
{
    let top = h[0];
    let last = h.pop();
    if(h.length) {
        h[0] = last;
        let i = 0;
        for(;;) {
            let l = 2 * i + 1;
            let r = l + 1;
            let m = i;
            if(l < h.length && h[l][0] < h[m][0]) {
                m = l;
            }
            if(r < h.length && h[r][0] < h[m][0]) {
                m = r;
            }
            if(m === i) {
                break;
            }
            [h[m], h[i]] = [h[i], h[m]];
            i = m;
        }
    }
    return top;
}

/************************************************************
 *  The shortest orthogonal line from `a` to `z` that enters none
 *  of `boxes` (already expanded by the clearance), a turn costing
 *  ROUTE_BEND. The line leaves `a` SIDEWAYS and reaches `z`
 *  SIDEWAYS: the column straight under a port and the one straight
 *  over it belong to the forward edges that share that port, which
 *  run along them to their staggered turns -- a route going down
 *  that column lay on top of them. So a routed line shares only
 *  the stub between the port and `a` (or `z`).
 *
 *  The grid is SPARSE: only the lines of the boxes' borders and
 *  of the two ends, which is all an orthogonal shortest path ever
 *  needs to turn on. Returns [a, ...turns, z], or null when every
 *  way is closed.
 ************************************************************/
function orth_search(a, z, boxes)
{
    for(let b of boxes) {
        if(point_inside(a, b) || point_inside(z, b)) {
            return null;
        }
    }

    let uniq = (list) => [...new Set(list)].sort((p, q) => p - q);
    let xs = uniq([a[0], z[0]].concat(...boxes.map((b) => [b.x1, b.x2])));
    let ys = uniq([a[1], z[1]].concat(...boxes.map((b) => [b.y1, b.y2])));
    let W = xs.length;
    let H = ys.length;

    let free = (x, y) => !boxes.some((b) => point_inside([x, y], b));
    let ok = new Uint8Array(W * H);
    for(let j = 0; j < H; j++) {
        for(let i = 0; i < W; i++) {
            ok[j * W + i] = free(xs[i], ys[j])? 1 : 0;
        }
    }
    /*  A step to the next line is open when both points are free and
     *  so is the middle of the step: consecutive lines have no border
     *  between them, so the middle speaks for the whole step.  */
    let step_right = new Uint8Array(W * H);
    let step_down = new Uint8Array(W * H);
    for(let j = 0; j < H; j++) {
        for(let i = 0; i < W; i++) {
            let k = j * W + i;
            if(!ok[k]) {
                continue;
            }
            if(i + 1 < W && ok[k + 1] && free((xs[i] + xs[i + 1]) / 2, ys[j])) {
                step_right[k] = 1;
            }
            if(j + 1 < H && ok[k + W] && free(xs[i], (ys[j] + ys[j + 1]) / 2)) {
                step_down[k] = 1;
            }
        }
    }

    /*  States are (point, heading): 0 right, 1 left, 2 down, 3 up.  */
    let start = ys.indexOf(a[1]) * W + xs.indexOf(a[0]);
    let goal = ys.indexOf(z[1]) * W + xs.indexOf(z[0]);
    let best = new Float64Array(W * H * 4).fill(Infinity);
    let prev = new Int32Array(W * H * 4).fill(-1);
    let heap = [];
    best[start * 4 + 2] = 0;
    heap_push(heap, [0, start * 4 + 2]);

    let moves = (k) => {
        let i = k % W;
        let j = (k - i) / W;
        let out = [];
        if(step_right[k]) {
            out.push([k + 1, 0, xs[i + 1] - xs[i]]);
        }
        if(i > 0 && step_right[k - 1]) {
            out.push([k - 1, 1, xs[i] - xs[i - 1]]);
        }
        if(step_down[k]) {
            out.push([k + W, 2, ys[j + 1] - ys[j]]);
        }
        if(j > 0 && step_down[k - W]) {
            out.push([k - W, 3, ys[j] - ys[j - 1]]);
        }
        return out;
    };

    let found = -1;
    let found_cost = Infinity;
    while(heap.length) {
        let [cost, state] = heap_pop(heap);
        if(cost > best[state] || cost >= found_cost) {
            continue;
        }
        let k = state >> 2;
        let dir = state & 3;
        if(k === goal) {
            if(dir >= 2) {
                continue;       /*  down the port's own column: not allowed  */
            }
            let total = cost + ROUTE_BEND;      /*  the turn into the port  */
            if(total < found_cost) {
                found_cost = total;
                found = state;
            }
            continue;
        }
        for(let [nk, nd, len] of moves(k)) {
            if(k === start && nd >= 2) {
                continue;       /*  out of the port sideways, not down its column  */
            }
            let c = cost + len + ((nd === dir)? 0 : ROUTE_BEND);
            let ns = nk * 4 + nd;
            if(c < best[ns]) {
                best[ns] = c;
                prev[ns] = state;
                heap_push(heap, [c, ns]);
            }
        }
    }
    if(found < 0) {
        return null;
    }

    /*  Back from the goal, keeping only the points where it turns.  */
    let states = [];
    for(let s = found; s >= 0; s = prev[s]) {
        states.push(s);
    }
    states.reverse();
    let pts = [a];
    for(let n = 1; n < states.length; n++) {
        let turn = (n + 1 < states.length) && ((states[n + 1] & 3) !== (states[n] & 3));
        if(turn) {
            let k = states[n] >> 2;
            pts.push([xs[k % W], ys[Math.floor(k / W)]]);
        }
    }
    pts.push(z);
    return pts;
}

/************************************************************
 *  The control points of an elbow that does not cross any card.
 *
 *  The simple elbow first (elbow_points): the channel, or the
 *  detour round the two cards. Only when that line crosses a card
 *  -- a third record standing in a detour's way, a row in the way
 *  of an edge that drops several rows -- is it ROUTED: out of the
 *  port, the shortest way along the gaps between the cards, in.
 *  A parent and the row of children under it keep their bus.
 *
 *  `boxes` are all the nodes on screen, the two of the edge
 *  included, each as the box of the WHOLE node -- card, ports and
 *  label -- so a line clears the ports too. `box_s` and `box_t`
 *  are the edge's own two, measured the same way. The route keeps
 *  a clearance from every box, which
 *  grows with the lane so that two routed edges of one pair do not
 *  coincide. Nearby cards first; all of them if that finds no way;
 *  the simple elbow if nothing does.
 ************************************************************/
export function elbow_route(s, t, box_s, box_t, lane, vertical, boxes, stagger)
{
    let others = boxes || [];
    if(!vertical) {
        return elbow_route(swap(s), swap(t), swap_box(box_s), swap_box(box_t), lane, true,
                           others.map(swap_box), stagger).map(swap);
    }

    /*  A comb runs where the layout left room for it: its corridor
     *  and its gap are empty by construction.  */
    if(stagger && stagger.comb) {
        return elbow_points(s, t, box_s, box_t, lane, true, stagger);
    }

    let simple = elbow_points(s, t, box_s, box_t, lane, true, stagger);
    if(!elbow_path_hits([s, ...simple, t], others, box_s, box_t)) {
        return simple;
    }

    let m = ELBOW_CLEAR / 2 + Math.abs(lane) * ELBOW_STEP;
    /*  Just outside the grown box of each end, which holds its ports.  */
    let a = [s[0], Math.max(s[1], box_s.y2) + m + 1];     /*  out of a bottom port  */
    let z = [t[0], Math.min(t[1], box_t.y1) - m - 1];     /*  into a top port  */
    let region = box_expand({
        x1: Math.min(a[0], z[0], box_s.x1, box_t.x1),
        y1: Math.min(a[1], z[1], box_s.y1, box_t.y1),
        x2: Math.max(a[0], z[0], box_s.x2, box_t.x2),
        y2: Math.max(a[1], z[1], box_s.y2, box_t.y2),
    }, ROUTE_REACH);
    let near = others.filter((b) => box_overlaps(b, region));

    let route = orth_search(a, z, near.map((b) => box_expand(b, m)));
    if(!route && near.length < others.length) {
        route = orth_search(a, z, others.map((b) => box_expand(b, m)));
    }
    return route || simple;
}

/*----------------------------------------------------------------*
 *      CURVED edges that would cross a card
 *----------------------------------------------------------------*/
export const CURVE_RADIUS = 24;     /*  the corners of a curve that goes round  */
export const CURVE_STEPS = 16;      /*  samples of each curved stretch  */

/*  Points along a G6 path: the ends of its runs and CURVE_STEPS
 *  samples of each quadratic or cubic stretch.  */
function path_points(path)
{
    let pts = [];
    let cur = null;
    for(let c of path) {
        if(c[0] === 'M' || c[0] === 'L') {
            cur = [c[1], c[2]];
            pts.push(cur);
        } else if(c[0] === 'C' && cur) {
            let [x0, y0] = cur;
            for(let k = 1; k <= CURVE_STEPS; k++) {
                let u = k / CURVE_STEPS;
                let v = 1 - u;
                pts.push([
                    v * v * v * x0 + 3 * v * v * u * c[1] + 3 * v * u * u * c[3] + u * u * u * c[5],
                    v * v * v * y0 + 3 * v * v * u * c[2] + 3 * v * u * u * c[4] + u * u * u * c[6],
                ]);
            }
            cur = [c[5], c[6]];
        } else if(c[0] === 'Q' && cur) {
            let [x0, y0] = cur;
            for(let k = 1; k <= CURVE_STEPS; k++) {
                let u = k / CURVE_STEPS;
                let v = 1 - u;
                pts.push([
                    v * v * x0 + 2 * v * u * c[1] + u * u * c[3],
                    v * v * y0 + 2 * v * u * c[2] + u * u * c[4],
                ]);
            }
            cur = [c[3], c[4]];
        }
    }
    return pts;
}

/************************************************************
 *  Does the G6 path `path` of a curved edge cross a card other than
 *  its own two? Measured on the curve itself -- the path G6 would
 *  draw, sampled -- and not on the rectangle round it, which took
 *  every card the curve merely passed near: the ports of a row
 *  stick well into the space above it. Its own two cards are left
 *  out: the curve starts and ends on their ports.
 ************************************************************/
export function curve_hits(path, boxes, box_s, box_t)
{
    let pts = path_points(path);
    if(pts.length < 2) {
        return false;
    }
    let bb = {x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity};
    for(let p of pts) {
        bb.x1 = Math.min(bb.x1, p[0]);
        bb.y1 = Math.min(bb.y1, p[1]);
        bb.x2 = Math.max(bb.x2, p[0]);
        bb.y2 = Math.max(bb.y2, p[1]);
    }
    for(let b of (boxes || [])) {
        if(same_box(b, box_s) || same_box(b, box_t) || !box_overlaps(b, box_expand(bb, 1))) {
            continue;
        }
        let inner = box_expand(b, -1);
        for(let k = 0; k + 1 < pts.length; k++) {
            if(segment_hits(pts[k], pts[k + 1], inner)) {
                return true;
            }
        }
    }
    return false;
}

/************************************************************
 *  A G6 path (['M'|'L'|'Q', ...]) along `points` with every corner
 *  rounded -- by `radius`, or by half the shorter of its two
 *  segments, so a short run is never overshot. The rounding is the
 *  quadratic G6's own polyline uses.
 ************************************************************/
export function rounded_path(points, radius)
{
    let path = [['M', points[0][0], points[0][1]]];
    for(let i = 1; i + 1 < points.length; i++) {
        let a = points[i - 1];
        let m = points[i];
        let b = points[i + 1];
        let len_in = Math.hypot(m[0] - a[0], m[1] - a[1]);
        let len_out = Math.hypot(b[0] - m[0], b[1] - m[1]);
        let r = Math.min(radius, len_in / 2, len_out / 2);
        let collinear = Math.abs((m[0] - a[0]) * (b[1] - m[1]) - (m[1] - a[1]) * (b[0] - m[0])) < 1e-9;
        if(r <= 0 || collinear) {
            path.push(['L', m[0], m[1]]);
            continue;
        }
        let p1 = [m[0] - (m[0] - a[0]) / len_in * r, m[1] - (m[1] - a[1]) / len_in * r];
        let p2 = [m[0] + (b[0] - m[0]) / len_out * r, m[1] + (b[1] - m[1]) / len_out * r];
        path.push(['L', p1[0], p1[1]]);
        path.push(['Q', m[0], m[1], p2[0], p2[1]]);
    }
    let last = points[points.length - 1];
    path.push(['L', last[0], last[1]]);
    return path;
}
