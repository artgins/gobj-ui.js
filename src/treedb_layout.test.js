/***********************************************************************
 *          treedb_layout.test.js
 *
 *      The two treedb layouts, pinned: the spanning tree they share
 *      (roots, first parent wins, hook order then record order), the
 *      tidy tree's rows and centring, the radial tree's rings.
 ***********************************************************************/
import { describe, test, expect } from "vitest";
import { spanning_tree, layout_tree, layout_radial } from "./treedb_layout.js";

/*  es -> (norte, sur); norte -> nave; nave -> d0, d1 (hook rank 1) and
 *  c1 (hook rank 2); c1 -> d0 as well (second parent).  */
const N = (id, w, h) => ({id, w, h});
const nodes = [
    N("es", 172, 96), N("norte", 172, 96), N("sur", 172, 96), N("nave", 172, 120),
    N("d0", 116, 40), N("d1", 116, 40), N("c1", 172, 96),
];
const edges = [
    {source: "es", target: "norte", rank: 0},
    {source: "es", target: "sur", rank: 0},
    {source: "norte", target: "nave", rank: 0},
    {source: "nave", target: "c1", rank: 2},
    {source: "nave", target: "d0", rank: 1},
    {source: "nave", target: "d1", rank: 1},
    {source: "c1", target: "d0", rank: 0},
];

describe("the spanning tree", () => {
    test("roots are the nodes with no incoming edge, in node order", () => {
        let t = spanning_tree(nodes, edges);
        expect(t.roots).toEqual(["es"]);
        expect(t.depth.get("nave")).toBe(2);
        expect(t.depth.get("d0")).toBe(3);
    });

    test("children are ordered by hook rank, then by node order", () => {
        let t = spanning_tree(nodes, edges);
        expect(t.children.get("nave")).toEqual(["d0", "d1", "c1"]);
        expect(t.children.get("es")).toEqual(["norte", "sur"]);
    });

    test("a node with two parents belongs to the first that reaches it", () => {
        let t = spanning_tree(nodes, edges);
        expect(t.children.get("c1")).toEqual([]);        /*  d0 is nave's  */
        expect(t.depth.get("d0")).toBe(3);
    });

    test("a cycle nothing reaches gets a root; a self edge is ignored", () => {
        let t = spanning_tree(
            [N("a", 10, 10), N("b", 10, 10), N("c", 10, 10)],
            [{source: "a", target: "b"}, {source: "b", target: "c"}, {source: "c", target: "a"},
             {source: "b", target: "b"}]
        );
        expect(t.roots).toEqual(["a"]);
        expect(t.children.get("a")).toEqual(["b"]);
        expect(t.depth.get("c")).toBe(2);
    });

    test("an edge to an unknown node is ignored", () => {
        let t = spanning_tree([N("a", 10, 10)], [{source: "a", target: "ghost"}]);
        expect(t.roots).toEqual(["a"]);
        expect(t.children.get("a")).toEqual([]);
    });
});

describe("the tidy tree, read down (the default)", () => {
    test("depths are rows; a row is as tall as its tallest card", () => {
        let pos = layout_tree(nodes, edges, {nodesep: 10, ranksep: 100});
        expect(pos.get("es").y).toBe(48);                       /*  96/2  */
        expect(pos.get("norte").y).toBe(96 + 100 + 48);
        expect(pos.get("sur").y).toBe(pos.get("norte").y);
        /*  depth 2 holds nave (120 tall): the row is 120 tall  */
        expect(pos.get("nave").y).toBe(2 * (96 + 100) + 60);
        /*  depth 3 holds chips (40) and c1 (96): row is 96 tall, the
         *  chips are centred in it  */
        let row3 = 2 * (96 + 100) + 120 + 100;
        expect(pos.get("c1").y).toBe(row3 + 48);
        expect(pos.get("d0").y).toBe(row3 + 48);
    });

    test("siblings sit side by side; a parent is centred over its children", () => {
        let pos = layout_tree(nodes, edges, {nodesep: 10, ranksep: 100});
        /*  nave's children: d0 (116), d1 (116), c1 (172) = 424 wide  */
        expect(pos.get("d1").x - pos.get("d0").x).toBe(126);
        expect(pos.get("c1").x - pos.get("d1").x).toBe(58 + 10 + 86);
        let first = pos.get("d0").x - 58;
        let last = pos.get("c1").x + 86;
        expect(pos.get("nave").x).toBe((first + last) / 2);
    });

    test("two trees sit side by side, not overlapped", () => {
        let pos = layout_tree(
            [N("a", 100, 50), N("b", 100, 50)], [], {nodesep: 10}
        );
        expect(pos.get("a").x).toBe(50);
        expect(pos.get("b").x).toBe(50 + 100 + 20);
    });
});

describe("the tidy tree, read right", () => {
    test("depths are columns; a column is as wide as its widest card", () => {
        let pos = layout_tree(nodes, edges, {nodesep: 10, ranksep: 100, direction: "LR"});
        expect(pos.get("es").x).toBe(86);                       /*  172/2  */
        expect(pos.get("norte").x).toBe(172 + 100 + 86);
        expect(pos.get("sur").x).toBe(pos.get("norte").x);
        /*  depth 3 holds chips (116) and c1 (172): column is 172 wide,
         *  the chips are centred in it  */
        let col3 = 3 * (172 + 100);
        expect(pos.get("c1").x).toBe(col3 + 86);
        expect(pos.get("d0").x).toBe(col3 + 86);
    });

    test("siblings stack with the gap; a parent is centred on its children", () => {
        let pos = layout_tree(nodes, edges, {nodesep: 10, ranksep: 100, direction: "LR"});
        /*  nave's children: d0 (40), d1 (40), c1 (96) = 196 tall  */
        expect(pos.get("d1").y - pos.get("d0").y).toBe(50);
        expect(pos.get("c1").y - pos.get("d1").y).toBe(20 + 10 + 48);
        let first = pos.get("d0").y - 20;
        let last = pos.get("c1").y + 48;
        expect(pos.get("nave").y).toBe((first + last) / 2);
    });

    test("a parent taller than its children keeps its own height", () => {
        let pos = layout_tree(
            [N("p", 100, 200), N("k", 50, 20)],
            [{source: "p", target: "k"}], {nodesep: 10, ranksep: 50, direction: "LR"}
        );
        expect(pos.get("p").y).toBe(100);
        expect(pos.get("k").y).toBe(100);     /*  centred in the parent's block  */
    });

    test("two trees are stacked, not overlapped", () => {
        let pos = layout_tree(
            [N("a", 100, 50), N("b", 100, 50)], [], {nodesep: 10, direction: "LR"}
        );
        expect(pos.get("a").y).toBe(25);
        expect(pos.get("b").y).toBe(25 + 50 + 20);
    });

    test("opening a hook does not move what is not under or beside it", () => {
        let base = layout_tree(nodes, edges, {nodesep: 10, ranksep: 100, direction: "LR"});
        let more = nodes.concat([N("d2", 116, 40)]);
        let more_edges = edges.concat([{source: "nave", target: "d2", rank: 1}]);
        let pos = layout_tree(more, more_edges, {nodesep: 10, ranksep: 100, direction: "LR"});
        expect(pos.get("es").x).toBe(base.get("es").x);
        expect(pos.get("d0").y).toBe(base.get("d0").y);     /*  above the new one  */
        expect(pos.get("d1").y).toBe(base.get("d1").y);
        expect(pos.get("d2").y).toBe(base.get("d1").y + 50);
        expect(pos.get("c1").y).toBe(base.get("c1").y + 50); /*  pushed down, in order  */
    });
});

describe("the radial tree", () => {
    test("one root sits at the centre, its children on a ring around it", () => {
        let pos = layout_radial(nodes, edges, {nodesep: 10, ranksep: 100});
        expect(pos.get("es")).toEqual({x: 0, y: 0});
        let r = Math.hypot(pos.get("norte").x, pos.get("norte").y);
        expect(r).toBeGreaterThanOrEqual(100);
        expect(Math.hypot(pos.get("sur").x, pos.get("sur").y)).toBeCloseTo(r, 6);
        /*  norte carries 3 of es's 4 leaves: three quarters of the
         *  circle, from the top (-90°) clockwise, so its middle is at
         *  +45°; sur gets the last quarter, from 180° to 270°, centred
         *  at 225° (-135°)  */
        let ang = (id) => Math.atan2(pos.get(id).y, pos.get(id).x);
        expect(ang("norte")).toBeCloseTo(Math.PI / 4, 6);
        expect(ang("sur")).toBeCloseTo(-3 * Math.PI / 4, 6);
    });

    test("a ring is long enough for its nodes: no two neighbours closer than a card", () => {
        let many = [N("root", 172, 96)];
        let e = [];
        for(let i = 0; i < 40; i++) {
            many.push(N(`k${i}`, 172, 96));
            e.push({source: "root", target: `k${i}`, rank: 0});
        }
        let pos = layout_radial(many, e, {nodesep: 10, ranksep: 100});
        let r = Math.hypot(pos.get("k0").x, pos.get("k0").y);
        /*  40 diagonals of ~197 plus gaps on the circumference  */
        expect(2 * Math.PI * r).toBeGreaterThanOrEqual(40 * (Math.hypot(172, 96) + 10) - 1e-6);
        let d = Math.hypot(pos.get("k1").x - pos.get("k0").x, pos.get("k1").y - pos.get("k0").y);
        expect(d).toBeGreaterThan(190);
    });

    test("a ring clears the ring inside it: a card does not sit on its parent", () => {
        /*  One child, straight below its root: `ranksep` alone is a
         *  step between CENTRES, so two cards 96 tall 100 apart had
         *  48 + 48 of card and 4 of air. The ring adds the halves. */
        let pos = layout_radial(
            [N("root", 172, 96), N("kid", 172, 96)],
            [{source: "root", target: "kid", rank: 0}],
            {nodesep: 18, ranksep: 100}
        );
        let d = Math.hypot(
            pos.get("kid").x - pos.get("root").x, pos.get("kid").y - pos.get("root").y
        );
        expect(d).toBeGreaterThanOrEqual(48 + 48 + 18);
    });

    test("several roots share the circle around an empty centre", () => {
        let pos = layout_radial(
            [N("a", 100, 50), N("b", 100, 50), N("c", 100, 50)], [], {ranksep: 100}
        );
        for(let id of ["a", "b", "c"]) {
            expect(Math.hypot(pos.get(id).x, pos.get(id).y)).toBeCloseTo(100, 6);
        }
        expect(pos.get("a").x).not.toBe(pos.get("b").x);
    });
});

describe("a deep tree", () => {
    /*  A self-referent hook -- a place inside a place inside a place --
     *  is as deep as the data says. The walks are iterative for exactly
     *  this: recursive ones died here with "Maximum call stack size
     *  exceeded", and a graph that cannot be drawn is not a layout
     *  choice, it is an exception in the console.  */
    const DEEP = 20000;
    const deep_nodes = [];
    const deep_edges = [];
    for(let i = 0; i < DEEP; i++) {
        deep_nodes.push({id: `n${i}`, w: 100, h: 40});
        if(i > 0) {
            deep_edges.push({source: `n${i - 1}`, target: `n${i}`, rank: 0});
        }
    }

    test("the spanning tree reaches the bottom", () => {
        let t = spanning_tree(deep_nodes, deep_edges);
        expect(t.roots).toEqual(["n0"]);
        expect(t.depth.get(`n${DEEP - 1}`)).toBe(DEEP - 1);
    });

    test("the two layouts place every node of it", () => {
        for(let layout of [layout_tree, layout_radial]) {
            let pos = layout(deep_nodes, deep_edges);
            expect(pos.size).toBe(DEEP);
            expect(Number.isFinite(pos.get(`n${DEEP - 1}`).x)).toBe(true);
            expect(Number.isFinite(pos.get(`n${DEEP - 1}`).y)).toBe(true);
        }
    });
});
