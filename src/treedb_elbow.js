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
 *      Written for the top-down reading; left to right is the same
 *      geometry with the axes swapped.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/

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

/************************************************************
 *  The control points of an elbow from the port `s` to the port
 *  `t` ([x, y] each), knowing the boxes of the two cards
 *  ({x1, y1, x2, y2}) and the edge's lane.
 *
 *      vertical    the rows are stacked (top to bottom); false
 *                  when they are side by side (left to right)
 *      stagger     {dep, arr}: the edge's rank among the forward
 *                  edges leaving its source card and among those
 *                  reaching its target card (elbow_rank). Absent,
 *                  the channel is the middle.
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
     *  lane, and kept between the two rows.  */
    if(t[1] - s[1] > 2 * ELBOW_STEP) {
        let lo = Math.max(s[1], box_s.y2);
        let hi = Math.min(t[1], box_t.y1);
        let mid = (lo + hi) / 2;
        let st = stagger || {};
        let group = null;
        let k = 0;
        if(st.dep && st.dep.count > 1) {
            group = st.dep;
            k = st.dep.rank;                          /*  farthest highest  */
        } else if(st.arr && st.arr.count > 1) {
            group = st.arr;
            k = st.arr.count - 1 - st.arr.rank;       /*  farthest lowest  */
        }
        if(group) {
            let room = Math.max(0, hi - lo - 2 * ELBOW_STAGGER_PAD);
            let step = Math.min(ELBOW_STEP, room / (group.count - 1));
            mid = mid - (group.count - 1) * step / 2 + k * step;
        }
        mid += shift;
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
