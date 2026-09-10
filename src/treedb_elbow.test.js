/***********************************************************************
 *          treedb_elbow.test.js
 *
 *      The elbow edges of the treedb graph, pinned: the lane of an
 *      edge among those joining the same two cards, the channel of a
 *      forward edge, the detour of one that is not.
 ***********************************************************************/
import { describe, test, expect } from "vitest";
import {
    elbow_lane, elbow_points, elbow_route, elbow_path_hits, elbow_rank, elbow_combs,
    curve_hits, rounded_path, ELBOW_STEP, ELBOW_CLEAR,
} from "./treedb_elbow.js";
import { layout_compact } from "./treedb_layout.js";

/*  Two cards 100x40: A on top, B one row below it.  */
const A = {x1: 0, y1: 0, x2: 100, y2: 40};
const B = {x1: 0, y1: 130, x2: 100, y2: 170};
const A_HOOK = [50, 40];        /*  A's bottom edge  */
const A_FKEY = [50, 0];         /*  A's top edge  */
const B_HOOK = [60, 170];
const B_FKEY = [50, 130];

describe("the lane", () => {
    test("one edge alone keeps the middle", () => {
        expect(elbow_lane(["edge-t-7"], "edge-t-7")).toBe(0);
    });

    test("lanes follow the order the edges were made, not the string order", () => {
        let ids = ["edge-t-10", "edge-t-9", "edge-t-11"];
        expect(elbow_lane(ids, "edge-t-9")).toBe(0);
        expect(elbow_lane(ids, "edge-t-10")).toBe(1);
        expect(elbow_lane(ids, "edge-t-11")).toBe(-1);
    });

    test("a new edge does not move the ones already drawn", () => {
        let before = ["edge-t-1", "edge-t-2"];
        let after = before.concat(["edge-t-3"]);
        for(let id of before) {
            expect(elbow_lane(after, id)).toBe(elbow_lane(before, id));
        }
    });
});

describe("a forward edge", () => {
    test("turns in the channel half way between the ports", () => {
        let pts = elbow_points(A_HOOK, B_FKEY, A, B, 0, true);
        expect(pts).toEqual([[50, 85], [50, 85]]);
    });

    test("its lane moves the channel, and keeps it between the ports", () => {
        let pts = elbow_points(A_HOOK, B_FKEY, A, B, 1, true);
        expect(pts[0][1]).toBe(85 + ELBOW_STEP);
        let far = elbow_points(A_HOOK, B_FKEY, A, B, 20, true);
        expect(far[0][1]).toBeLessThan(B_FKEY[1]);
        expect(far[0][1]).toBeGreaterThan(A_HOOK[1]);
    });
});

describe("an edge that does not run forward", () => {
    test("goes round the outside of both cards", () => {
        /*  B -> A: out of B's bottom, back up into A's top.  */
        let pts = elbow_points(B_HOOK, A_FKEY, B, A, 0, true);
        expect(pts.length).toBe(4);
        let side = pts[1][0];
        expect(side).toBeGreaterThanOrEqual(100 + ELBOW_CLEAR);
        expect(pts[2][0]).toBe(side);
        expect(pts[0][1]).toBeGreaterThan(B.y2);     /*  below B  */
        expect(pts[3][1]).toBeLessThan(A.y1);        /*  above A  */
    });

    test("a reciprocal pair shares no segment", () => {
        let forward = elbow_points(A_HOOK, B_FKEY, A, B, 0, true);
        let back = elbow_points(B_HOOK, A_FKEY, B, A, 1, true);
        let channel = forward[0][1];
        expect(back.every((p) => p[1] !== channel)).toBe(true);
        expect(back[1][0]).toBeGreaterThan(A.x2);
    });

    test("a negative lane goes round the other side", () => {
        let right = elbow_points(B_HOOK, A_FKEY, B, A, 1, true);
        let left = elbow_points(B_HOOK, A_FKEY, B, A, -1, true);
        expect(right[1][0]).toBeGreaterThan(A.x2);
        expect(left[1][0]).toBeLessThan(A.x1);
    });

    test("two cards in one row are not joined through them", () => {
        /*  C beside A, same row: A's hook (bottom) to C's fkey (top).  */
        let C = {x1: 200, y1: 0, x2: 300, y2: 40};
        let pts = elbow_points(A_HOOK, [250, 0], A, C, 0, true);
        expect(pts.length).toBe(4);
        expect(pts[1][0]).toBeGreaterThan(C.x2);
    });
});

describe("the route round the other cards", () => {
    test("a line that crosses no card is left as it is", () => {
        let others = [A, B, {x1: 400, y1: 0, x2: 500, y2: 40}];
        expect(elbow_route(A_HOOK, B_FKEY, A, B, 0, true, others))
            .toEqual(elbow_points(A_HOOK, B_FKEY, A, B, 0, true));
    });

    test("a detour with a third card in its way goes round that one too", () => {
        /*  D stands right where the detour of B -> A runs, beside both.  */
        let D = {x1: 110, y1: -20, x2: 210, y2: 200};
        let boxes = [A, B, D];
        let simple = elbow_points(B_HOOK, A_FKEY, B, A, 0, true);
        expect(elbow_path_hits([B_HOOK, ...simple, A_FKEY], boxes)).toBe(true);
        let route = elbow_route(B_HOOK, A_FKEY, B, A, 0, true, boxes);
        expect(elbow_path_hits([B_HOOK, ...route, A_FKEY], boxes)).toBe(false);
        expect(route).not.toEqual(simple);
    });

    test("an edge dropping several rows goes round the row in between", () => {
        /*  P on top, M in the row between, C two rows down.  */
        let P = {x1: 0, y1: 0, x2: 100, y2: 40};
        let M = {x1: -40, y1: 130, x2: 140, y2: 170};
        let C = {x1: 0, y1: 260, x2: 100, y2: 300};
        let boxes = [P, M, C];
        let route = elbow_route([50, 40], [50, 260], P, C, 0, true, boxes);
        expect(elbow_path_hits([[50, 40], ...route, [50, 260]], boxes)).toBe(false);
    });

    test("when every way is closed it keeps the simple elbow", () => {
        let wall = {x1: -1000, y1: 60, x2: 1000, y2: 100};
        let route = elbow_route(A_HOOK, B_FKEY, A, B, 0, true, [A, B, wall]);
        expect(route).toEqual(elbow_points(A_HOOK, B_FKEY, A, B, 0, true));
    });

    test("two routed edges of one pair keep apart", () => {
        let D = {x1: 110, y1: -20, x2: 210, y2: 200};
        let boxes = [A, B, D];
        let r1 = elbow_route(B_HOOK, A_FKEY, B, A, 1, true, boxes);
        let r2 = elbow_route(B_HOOK, A_FKEY, B, A, -1, true, boxes);
        expect(elbow_path_hits([B_HOOK, ...r1, A_FKEY], boxes)).toBe(false);
        expect(elbow_path_hits([B_HOOK, ...r2, A_FKEY], boxes)).toBe(false);
        expect(r1).not.toEqual(r2);
    });

    test("read left to right, the route is the transpose", () => {
        let sw = (p) => [p[1], p[0]];
        let swb = (b) => ({x1: b.y1, y1: b.x1, x2: b.y2, y2: b.x2});
        let D = {x1: 110, y1: -20, x2: 210, y2: 200};
        let down = elbow_route(B_HOOK, A_FKEY, B, A, 0, true, [A, B, D]);
        let right = elbow_route(sw(B_HOOK), sw(A_FKEY), swb(B), swb(A), 0, false,
                                [A, B, D].map(swb));
        expect(right).toEqual(down.map(sw));
    });

    test("a screen of eighty cards is routed in a few milliseconds", () => {
        let boxes = [];
        for(let r = 0; r < 4; r++) {
            for(let c = 0; c < 20; c++) {
                boxes.push({x1: c * 190, y1: r * 186, x2: c * 190 + 172, y2: r * 186 + 96});
            }
        }
        /*  From a card of the bottom row back up to one of the top row,
         *  across the whole screen.  */
        let src = boxes[3 * 20 + 18];
        let dst = boxes[2];
        let s = [(src.x1 + src.x2) / 2, src.y2];
        let t = [(dst.x1 + dst.x2) / 2, dst.y1];
        let t0 = performance.now();
        let route = elbow_route(s, t, src, dst, 0, true, boxes);
        let ms = performance.now() - t0;
        expect(elbow_path_hits([s, ...route, t], boxes)).toBe(false);
        expect(ms).toBeLessThan(200);
    });
});

describe("edges sharing an end are staggered", () => {
    test("the rank is farthest first, a tie to the edge made first", () => {
        let items = [{id: "e-3", span: 10}, {id: "e-1", span: 300}, {id: "e-2", span: 10}];
        expect(elbow_rank(items, "e-1")).toEqual({rank: 0, count: 3});
        expect(elbow_rank(items, "e-2")).toEqual({rank: 1, count: 3});
        expect(elbow_rank(items, "e-3")).toEqual({rank: 2, count: 3});
    });

    /*  One parent on top (port at x 50, bottom at 40) and a row of
     *  children below (tops at 130).  */
    const P = {x1: 0, y1: 0, x2: 100, y2: 40};
    const PORT = [50, 40];
    const KIDS = [50, 160, 290, 420, -120].map((x, i) => ({
        id: `e-${i + 1}`, x: x, box: {x1: x - 50, y1: 130, x2: x + 50, y2: 170},
    }));
    const channel_of = (kid) => {
        let items = KIDS.map((k) => ({id: k.id, span: Math.abs(k.x - PORT[0])}));
        let dep = elbow_rank(items, kid.id);
        return elbow_points(PORT, [kid.x, 130], P, kid.box, 0, true, {dep: dep})[0][1];
    };

    test("the children of one port turn each at its own height, inside the channel", () => {
        let ys = KIDS.map(channel_of);
        expect(new Set(ys).size).toBe(KIDS.length);
        for(let y of ys) {
            expect(y).toBeGreaterThan(40);
            expect(y).toBeLessThan(130);
        }
    });

    test("the farthest turns highest, and the lines of one port do not cross", () => {
        let y = Object.fromEntries(KIDS.map((k) => [k.id, channel_of(k)]));
        expect(y["e-4"]).toBeLessThan(y["e-2"]);        /*  420 is farther than 160  */
        /*  A crossing: one edge's drop (at its child's x, from its turn
         *  down to the row) cut by another's run (from the port to its
         *  child, at its own turn).  */
        for(let a of KIDS) {
            for(let b of KIDS) {
                if(a === b) {
                    continue;
                }
                let lo = Math.min(PORT[0], b.x);
                let hi = Math.max(PORT[0], b.x);
                let cuts = a.x > lo && a.x < hi && y[b.id] > y[a.id] && y[b.id] < 130;
                expect(cuts).toBe(false);
            }
        }
    });

    test("the parents of one card: the farthest turns lowest, and they do not cross", () => {
        /*  Parents on top at these x (port at the middle of each bottom),
         *  one child below at x 200 whose fkeys all enter at its top.  */
        const C = {x1: 150, y1: 130, x2: 250, y2: 170};
        const T0 = [200, 130];
        const PARENTS = [0, 120, 330, 560].map((x, i) => ({id: `p-${i + 1}`, x: x}));
        let items = PARENTS.map((p) => ({id: p.id, span: Math.abs(p.x - T0[0])}));
        let y = {};
        for(let p of PARENTS) {
            let box = {x1: p.x - 50, y1: 0, x2: p.x + 50, y2: 40};
            let arr = elbow_rank(items, p.id);
            y[p.id] = elbow_points([p.x, 40], T0, box, C, 0, true, {arr: arr})[0][1];
        }
        expect(new Set(Object.values(y)).size).toBe(PARENTS.length);
        expect(y["p-4"]).toBeGreaterThan(y["p-2"]);     /*  560 is farther than 120  */
        /*  A crossing: one parent's drop (at its x, from its row down to
         *  its turn) cut by another's run (from its x to the child).  */
        for(let a of PARENTS) {
            for(let b of PARENTS) {
                if(a === b) {
                    continue;
                }
                let lo = Math.min(b.x, T0[0]);
                let hi = Math.max(b.x, T0[0]);
                let cuts = a.x > lo && a.x < hi && y[b.id] > 40 && y[b.id] < y[a.id];
                expect(cuts).toBe(false);
            }
        }
    });

    test("a routed edge leaves and reaches its ports sideways, sharing only the stub", () => {
        /*  A same-row edge from A to C, with D standing between them:
         *  it is routed. It must not run down the column over C's
         *  port, which is where a forward edge into C drops.  */
        const A2 = {x1: 0, y1: 200, x2: 100, y2: 240};
        const D2 = {x1: 150, y1: 180, x2: 250, y2: 260};
        const C2 = {x1: 300, y1: 200, x2: 400, y2: 240};
        let s = [50, 240];
        let t = [350, 200];
        let boxes = [A2, D2, C2];
        let route = elbow_route(s, t, A2, C2, 0, true, boxes);
        expect(route.length).toBeGreaterThan(2);
        expect(elbow_path_hits([s, ...route, t], boxes, A2, C2)).toBe(false);
        let a = route[0];
        let z = route[route.length - 1];
        expect(route[1][1]).toBe(a[1]);                     /*  leaves a sideways  */
        expect(route[route.length - 2][1]).toBe(z[1]);      /*  reaches z sideways  */
        expect(t[1] - z[1]).toBeLessThan(20);               /*  the stub is short  */
    });

    test("an end shared by nobody keeps the middle", () => {
        let one = {rank: 0, count: 1};
        expect(elbow_points(PORT, [160, 130], P, KIDS[1].box, 0, true, {dep: one, arr: one}))
            .toEqual(elbow_points(PORT, [160, 130], P, KIDS[1].box, 0, true));
    });
});

describe("the comb of a stack", () => {
    /*  A parent over eight leaves, laid out by the compact tree (a
     *  stack: four rows of two). Boxes as the graph measures them,
     *  with 14px ports sticking 7px out of the top and bottom.  */
    const P = {id: "p", w: 172, h: 96};
    const LEAVES = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({id: `l${i}`, w: 116, h: 40}));
    const pos = layout_compact([P, ...LEAVES], LEAVES.map((l) => ({source: "p", target: l.id})),
                               {nodesep: 18, ranksep: 90});
    const box = (n) => {
        let c = pos.get(n.id);
        return {x1: c.x - n.w / 2, y1: c.y - n.h / 2 - 7, x2: c.x + n.w / 2, y2: c.y + n.h / 2 + 7};
    };
    const BOX_P = box(P);
    const PORT = [pos.get("p").x, pos.get("p").y + 48];
    const targets = LEAVES.map((l, i) => ({id: `e-${i + 1}`, box: box(l), leaf: l}));
    const combs = elbow_combs(targets.map((t) => ({id: t.id, box: t.box})), true);
    const paths = targets.map((t) => {
        let comb = combs.get(t.id) || null;
        let items = targets.map((u) => {
            let c = combs.get(u.id);
            let far = c? c.lane : pos.get(u.leaf.id).x;
            return {id: u.id, span: Math.abs(far - PORT[0])};
        });
        let end = [pos.get(t.leaf.id).x, t.box.y1 + 7];
        let pts = elbow_points(PORT, end, BOX_P, t.box, 0, true,
                               {dep: elbow_rank(items, t.id), comb: comb});
        return {id: t.id, box: t.box, full: [PORT, ...pts, end]};
    });

    test("only the cards under another card get a comb", () => {
        expect(combs.size).toBe(6);
        expect(combs.has("e-1")).toBe(false);
        expect(combs.has("e-2")).toBe(false);
    });

    test("no line crosses a card", () => {
        let all = [BOX_P, ...targets.map((t) => t.box)];
        for(let p of paths) {
            expect(elbow_path_hits(p.full, all, BOX_P, p.box)).toBe(false);
        }
    });

    test("no two lines lie on each other past the stub of the port", () => {
        /*  Two axis-aligned segments overlap when they are on one line
         *  and share more than a point of it.  */
        let overlap = (a, b, c, d) => {
            let va = a[0] === b[0];
            let vc = c[0] === d[0];
            let ha = a[1] === b[1];
            let hc = c[1] === d[1];
            if(va && vc && Math.abs(a[0] - c[0]) < 0.5) {
                return Math.min(Math.max(a[1], b[1]), Math.max(c[1], d[1])) -
                       Math.max(Math.min(a[1], b[1]), Math.min(c[1], d[1])) > 0.5;
            }
            if(ha && hc && Math.abs(a[1] - c[1]) < 0.5) {
                return Math.min(Math.max(a[0], b[0]), Math.max(c[0], d[0])) -
                       Math.max(Math.min(a[0], b[0]), Math.min(c[0], d[0])) > 0.5;
            }
            return false;
        };
        for(let i = 0; i < paths.length; i++) {
            for(let j = i + 1; j < paths.length; j++) {
                let A = paths[i].full;
                let B = paths[j].full;
                for(let m = 1; m + 1 < A.length; m++) {
                    for(let n = 1; n + 1 < B.length; n++) {
                        expect(overlap(A[m], A[m + 1], B[n], B[n + 1])).toBe(false);
                    }
                }
            }
        }
    });

    test("a comb is drawn as laid out, not routed", () => {
        let t = targets[6];
        let c = combs.get(t.id);
        let end = [pos.get(t.leaf.id).x, t.box.y1 + 7];
        let st = {comb: c};
        expect(elbow_route(PORT, end, BOX_P, t.box, 0, true, [BOX_P, ...targets.map((u) => u.box)], st))
            .toEqual(elbow_points(PORT, end, BOX_P, t.box, 0, true, st));
    });
});

describe("a curve that would cross a card", () => {
    /*  Whole-node boxes (ports 7px out of top and bottom).  */
    const PB = {x1: 0, y1: -7, x2: 172, y2: 103};         /*  a parent  */
    const R0 = {x1: 0, y1: 183, x2: 116, y2: 237};        /*  row 0 of a stack  */
    const R1 = {x1: 0, y1: 277, x2: 116, y2: 331};        /*  row 1, under it  */
    const SIB = {x1: 200, y1: -7, x2: 372, y2: 103};      /*  the parent's sibling  */
    const S = [86, 96];

    /*  The cubic G6 draws between two vertical ports: tangents along
     *  the line, as its default curveOffset gives.  */
    const cubic = (s, t) => [["M", s[0], s[1]],
                             ["C", s[0], (s[1] + t[1]) / 2, t[0], (s[1] + t[1]) / 2, t[0], t[1]]];

    test("a curve into a card of the next row crosses nothing", () => {
        expect(curve_hits(cubic(S, [58, 190]), [PB, R0, R1, SIB], PB, R0)).toBe(false);
    });

    test("a curve into a lower row of a stack crosses the card above it", () => {
        expect(curve_hits(cubic(S, [58, 284]), [PB, R0, R1, SIB], PB, R1)).toBe(true);
    });

    test("a curve that passes NEAR a card, beside its ports, does not count", () => {
        /*  N0 in the target row with its port poking 7px up, beside
         *  where the curve lands; the rectangle round the curve took it.  */
        const T0 = {x1: 250, y1: 183, x2: 366, y2: 237};
        const N0 = {x1: 120, y1: 183, x2: 236, y2: 237};
        expect(curve_hits(cubic(S, [308, 190]), [PB, SIB, T0, N0], PB, T0)).toBe(false);
    });

    test("the rounded path: a straight line is one run", () => {
        expect(rounded_path([[0, 0], [0, 100]], 24)).toEqual([["M", 0, 0], ["L", 0, 100]]);
    });

    test("the rounded path: each corner a quadratic, never past half a short run", () => {
        let path = rounded_path([[0, 0], [0, 60], [100, 60], [100, 70]], 24);
        expect(path[0]).toEqual(["M", 0, 0]);
        expect(path[1]).toEqual(["L", 0, 36]);                  /*  24 before the corner  */
        expect(path[2]).toEqual(["Q", 0, 60, 24, 60]);
        expect(path[3]).toEqual(["L", 95, 60]);                 /*  the last run is 10: r = 5  */
        expect(path[4]).toEqual(["Q", 100, 60, 100, 65]);
        expect(path[5]).toEqual(["L", 100, 70]);
    });
});

describe("the ports are obstacles too", () => {
    /*  Whole-node boxes: a port of 14px sticks 7px out of the bottom
     *  and the top of each card.  */
    const AP = {x1: 0, y1: -7, x2: 100, y2: 47};
    const BP = {x1: 350, y1: 123, x2: 450, y2: 177};
    const S = [50, 40];
    const T2 = [400, 130];

    test("an edge's own ports do not make its line a hit", () => {
        let simple = elbow_points(S, T2, AP, BP, 0, true);
        expect(elbow_path_hits([S, ...simple, T2], [AP, BP], AP, BP)).toBe(false);
        expect(elbow_route(S, T2, AP, BP, 0, true, [AP, BP])).toEqual(simple);
    });

    test("a port of a third card in the channel is gone round", () => {
        /*  F's card ends at y 80, above the channel (85); its port
         *  reaches down to 95, into it.  */
        const F_CARD = {x1: 200, y1: 0, x2: 300, y2: 80};
        const F = {x1: 200, y1: -7, x2: 300, y2: 95};
        let simple = elbow_points(S, T2, AP, BP, 0, true);
        expect(elbow_path_hits([S, ...simple, T2], [AP, BP, F_CARD], AP, BP)).toBe(false);
        expect(elbow_path_hits([S, ...simple, T2], [AP, BP, F], AP, BP)).toBe(true);
        let route = elbow_route(S, T2, AP, BP, 0, true, [AP, BP, F]);
        expect(elbow_path_hits([S, ...route, T2], [AP, BP, F], AP, BP)).toBe(false);
    });

    test("a detour clears the ports of its own two cards", () => {
        /*  B below A, both with their ports: B -> A goes round.  */
        const AB = {x1: 0, y1: -7, x2: 100, y2: 47};
        const BB = {x1: 0, y1: 123, x2: 100, y2: 177};
        let pts = elbow_points([60, 170], [50, 0], BB, AB, 0, true);
        expect(pts[0][1]).toBeGreaterThan(BB.y2);
        expect(pts[3][1]).toBeLessThan(AB.y1);
        expect(elbow_path_hits([[60, 170], ...pts, [50, 0]], [AB, BB], BB, AB)).toBe(false);
    });
});

describe("read left to right", () => {
    test("is the same geometry with the axes swapped", () => {
        let sw = (p) => [p[1], p[0]];
        let swb = (b) => ({x1: b.y1, y1: b.x1, x2: b.y2, y2: b.x2});
        for(let [s, t, bs, bt, lane] of [
            [A_HOOK, B_FKEY, A, B, 0],
            [A_HOOK, B_FKEY, A, B, 1],
            [B_HOOK, A_FKEY, B, A, -1],
        ]) {
            let down = elbow_points(s, t, bs, bt, lane, true);
            let right = elbow_points(sw(s), sw(t), swb(bs), swb(bt), lane, false);
            expect(right).toEqual(down.map(sw));
        }
    });
});
