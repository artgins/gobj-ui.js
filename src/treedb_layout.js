/***********************************************************************
 *          treedb_layout.js
 *
 *      Two layouts made for a treedb, and nothing else.
 *
 *      What a treedb graph IS, once it is folded (treedb_fold_model.js):
 *      a forest read top to bottom. A main topic is a tree (places:
 *      country, region, site, hall), the other topics hang from its
 *      nodes through hooks (devices, users, controllers), a record may
 *      hang from two parents (a device from its place AND its
 *      controller), and every visible node was reached from a root.
 *      Tens to a few hundred cards on screen, never the whole store.
 *
 *      G6's own layouts either do not know that or pay for not knowing:
 *
 *      - `dagre` gets the reading direction right and then ranks by
 *        longest path and minimises crossings with a heuristic that
 *        REORDERS the siblings on every run -- open one hook and the
 *        column next to it shuffles. It is O(n·m) per sweep and it is
 *        the one thing that takes time on a big expansion.
 *      - the tree layouts (`compact-box`, `indented`, `dendrogram`,
 *        `mindmap`) draw exactly the shape wanted, but G6 runs them on
 *        a TREE it builds from the edges: a node with two parents is
 *        placed by whichever parent the builder met first, unstably.
 *      - the force family scatters a tree, which is the pile with
 *        physics.
 *
 *      So: a tidy tree (`tree`) and a radial tree (`radial`), both fed
 *      by the SAME spanning tree, chosen deterministically:
 *
 *      - roots are the nodes with no incoming edge, in node order;
 *      - a node belongs to the FIRST parent that reaches it in a
 *        breadth-first walk from the roots -- the place, not the
 *        controller, because the place's column came first -- and the
 *        other links are drawn as edges across the tree;
 *      - the children of a node are ordered by the HOOK they hang from
 *        (the parent's port order, which is the schema's column order)
 *        and then by node order (record order, the pages' order);
 *      - a node nothing reaches (a cycle) is a root too.
 *
 *      `tree`: the classic tidy tree, top to bottom. Each depth is a
 *      row as tall as its tallest card; a node is centred over the
 *      block of its children; siblings sit side by side with `nodesep`
 *      between them. O(n), and opening a hook moves NOTHING that is
 *      not below or beside it -- the cards keep their order, the eye
 *      keeps its place. It reads DOWN because that is the direction a
 *      tree with many children has room in: a hall with a hundred
 *      devices is a wide row, not a tall column beside a card. (The
 *      left-to-right reading is `direction: "LR"`, kept for a host
 *      that wants it; `dagre` reads that way in the graph.)
 *
 *      `radial`: the root in the middle and a ring per depth, each
 *      subtree owning a sector proportional to its leaves; the radius
 *      of a ring grows until its neighbours sit side by side AND
 *      until it clears the ring inside it, so nothing overlaps by
 *      construction, across the ring or along the radius (see
 *      `layout_radial`).
 *
 *      Pure: takes plain nodes and edges, returns positions. The G6
 *      classes in c_g6_nodes_tree.js are two thin adapters over it.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/

const DEFAULTS = {
    nodesep: 18,        /*  gap between siblings (tree) / neighbours (radial)  */
    ranksep: 90,        /*  gap between a depth and the next  */
    direction: "TB",    /*  tree: "TB" reads down, "LR" reads right  */
};

/************************************************************
 *  The spanning tree of a graph, deterministic.
 *
 *      nodes   [{id, w, h, order}]        order: creation index
 *      edges   [{source, target, rank}]   rank: the hook's position in
 *                                         the parent's ports (0 = first)
 *
 *  Returns {roots: [id], children: Map<id, [id]>, depth: Map<id, n>,
 *           by_id: Map<id, node>}
 ************************************************************/
export function spanning_tree(nodes, edges)
{
    let by_id = new Map();
    for(let i = 0; i < nodes.length; i++) {
        let n = nodes[i];
        by_id.set(n.id, Object.assign({order: i}, n));
    }

    /*  Outgoing links per node, with the rank of the hook they leave by.  */
    let out = new Map();
    let has_parent = new Set();
    for(let e of edges) {
        if(!by_id.has(e.source) || !by_id.has(e.target) || e.source === e.target) {
            continue;
        }
        if(!out.has(e.source)) {
            out.set(e.source, []);
        }
        out.get(e.source).push({id: e.target, rank: (e.rank > 0)? e.rank : 0});
        has_parent.add(e.target);
    }
    for(let list of out.values()) {
        list.sort((a, b) => {
            if(a.rank !== b.rank) {
                return a.rank - b.rank;
            }
            return by_id.get(a.id).order - by_id.get(b.id).order;
        });
    }

    let roots = [];
    for(let n of by_id.values()) {
        if(!has_parent.has(n.id)) {
            roots.push(n.id);
        }
    }

    let children = new Map();
    let depth = new Map();
    let assign = (start) => {
        let queue = [start];
        depth.set(start, 0);
        while(queue.length) {
            let id = queue.shift();
            let kids = [];
            for(let link of (out.get(id) || [])) {
                if(depth.has(link.id)) {
                    continue;   /*  reached before: that parent keeps it  */
                }
                depth.set(link.id, depth.get(id) + 1);
                kids.push(link.id);
                queue.push(link.id);
            }
            children.set(id, kids);
        }
    };
    for(let root of roots) {
        assign(root);
    }
    /*  A cycle with no way in: its first node, in node order, is a root.  */
    for(let n of by_id.values()) {
        if(!depth.has(n.id)) {
            roots.push(n.id);
            assign(n.id);
        }
    }

    return {roots: roots, children: children, depth: depth, by_id: by_id};
}

/************************************************************
 *  The ids of a spanning tree in PARENT-BEFORE-CHILD order.
 *
 *  Every pass below used to be a recursive walk, which is the natural
 *  way to write it and the one that dies on a deep tree: a
 *  self-referent hook (a place inside a place inside a place) is as
 *  deep as the data says, and the stack is not. Read this list
 *  forwards for a pre-order pass and BACKWARDS for a post-order one
 *  -- a child always sits after its parent, so reversed it always
 *  sits before it, which is the whole of what post-order was for.
 ************************************************************/
function walk_order(t)
{
    let order = [];
    let stack = t.roots.slice().reverse();
    while(stack.length) {
        let id = stack.pop();
        order.push(id);
        let kids = t.children.get(id) || [];
        for(let i = kids.length - 1; i >= 0; i--) {
            stack.push(kids[i]);
        }
    }
    return order;
}

/************************************************************
 *  The tidy tree.
 *
 *  Returns Map<id, {x, y}> with the CENTRE of each node, the way G6
 *  positions a node.
 *
 *  The algorithm is written ONCE, reading left to right (depths are
 *  columns, siblings stack down). Top to bottom -- the default -- is
 *  the same tree with the axes swapped: every card is fed in
 *  transposed (its height as its width), and every position comes
 *  back transposed. That is the whole difference, and it is the
 *  reason the code is not duplicated for a second direction.
 ************************************************************/
export function layout_tree(nodes, edges, opts)
{
    let o = Object.assign({}, DEFAULTS, opts || {});
    if(o.direction === "LR") {
        return tidy_tree_lr(nodes, edges, o);
    }
    let transposed = nodes.map((n) => Object.assign({}, n, {w: n.h, h: n.w}));
    let lr = tidy_tree_lr(transposed, edges, o);
    let pos = new Map();
    for(let [id, p] of lr) {
        pos.set(id, {x: p.y, y: p.x});
    }
    return pos;
}

function tidy_tree_lr(nodes, edges, o)
{
    let t = spanning_tree(nodes, edges);
    let pos = new Map();

    /*  Column widths: the widest card of each depth.  */
    let col_w = [];
    for(let [id, d] of t.depth) {
        let w = t.by_id.get(id).w;
        col_w[d] = Math.max(col_w[d] || 0, w);
    }
    let col_x = [];
    let x = 0;
    for(let d = 0; d < col_w.length; d++) {
        col_x[d] = x;
        x += (col_w[d] || 0) + o.ranksep;
    }

    /*  Subtree heights: post-order, so children before parents.  */
    let order = walk_order(t);
    let height = new Map();
    for(let i = order.length - 1; i >= 0; i--) {
        let id = order[i];
        let kids = t.children.get(id) || [];
        let own = t.by_id.get(id).h;
        let sum = 0;
        for(let k = 0; k < kids.length; k++) {
            sum += height.get(kids[k]);
            if(k > 0) {
                sum += o.nodesep;
            }
        }
        height.set(id, kids.length? Math.max(own, sum) : own);
    }

    /*  Placement, pre-order: a node is centred on the block of its
     *  children, which starts at the top of its own block. Every node
     *  in a column is centred on the column, whatever its own width --
     *  the cards of one depth line up by their middles.  */
    let tops = new Map();
    let top = 0;
    for(let root of t.roots) {
        tops.set(root, top);
        top += height.get(root) + o.nodesep * 2;
    }
    for(let id of order) {
        let d = t.depth.get(id);
        let kids = t.children.get(id) || [];
        let block = height.get(id);
        let own_top = tops.get(id);
        pos.set(id, {x: col_x[d] + col_w[d] / 2, y: own_top + block / 2});
        if(!kids.length) {
            continue;
        }
        let kids_h = 0;
        for(let k = 0; k < kids.length; k++) {
            kids_h += height.get(kids[k]);
            if(k > 0) {
                kids_h += o.nodesep;
            }
        }
        let cursor = own_top + (block - kids_h) / 2;
        for(let kid of kids) {
            tops.set(kid, cursor);
            cursor += height.get(kid) + o.nodesep;
        }
    }

    return pos;
}

/*  How much of a card lies along the direction `a`: the projection
 *  of its rectangle on that direction. Full width when the card is
 *  read along its width, full height across it, and the honest
 *  mixture in between.  */
function extent_at(n, a)
{
    if(!n) {
        return 0;
    }
    return Math.abs(n.w * Math.cos(a)) + Math.abs(n.h * Math.sin(a));
}

/************************************************************
 *  The radial tree: the root in the middle, a ring per depth.
 *
 *  G6's `radial` places by MDS on the graph distances and pushes
 *  overlaps apart afterwards, with a ring radius it is TOLD; twenty
 *  cards of 172px on a ring of radius 200 have 52px each and pile
 *  up. This one is the radial form of the tidy tree above: every
 *  subtree gets an angular SECTOR proportional to its leaves, a node
 *  sits in the middle of its sector, and the radius of each ring is
 *  the larger of "one step further out than the ring before" and
 *  "long enough for its nodes to sit side by side" -- so a hall
 *  with a hundred devices is a wide, sparse fan, and nothing
 *  overlaps by construction. Several roots share the circle around
 *  a virtual centre.
 *
 *      ranksep   the step between rings
 *      nodesep   the gap between neighbours on a ring
 ************************************************************/
export function layout_radial(nodes, edges, opts)
{
    let o = Object.assign({}, DEFAULTS, opts || {});
    let t = spanning_tree(nodes, edges);
    let pos = new Map();
    if(!t.roots.length) {
        return pos;
    }

    /*  Leaves under each node: the sector it deserves. Post-order.  */
    let order = walk_order(t);
    let leaves = new Map();
    for(let i = order.length - 1; i >= 0; i--) {
        let id = order[i];
        let kids = t.children.get(id) || [];
        if(!kids.length) {
            leaves.set(id, 1);
            continue;
        }
        let n = 0;
        for(let kid of kids) {
            n += leaves.get(kid);
        }
        leaves.set(id, n);
    }
    let total = 0;
    for(let root of t.roots) {
        total += leaves.get(root);
    }

    /*  One root sits at the centre; several sit on the first ring
     *  around an empty centre, so every depth shifts out by one.  */
    let single = (t.roots.length === 1);
    let ring_of = (id) => t.depth.get(id) + (single? 0 : 1);

    /*  Pass 1, the ANGLES: a node's children split its sector by
     *  their leaves, and a node sits at the middle of its sector.
     *  Angles do not depend on the radii, so they come first.  */
    let angle = new Map();
    let rings = [];         /*  ring -> [{id, angle, diag}]  */
    /*  An explicit stack, not recursion: the sectors of a ring are
     *  sorted by angle in pass 2, so the order they are pushed in does
     *  not matter -- only that every node gets its own.  */
    let sector = (root_id, root_from, root_span, root_parent) => {
        let stack = [{id: root_id, from: root_from, span: root_span, parent: root_parent}];
        while(stack.length) {
            let {id, from, span, parent} = stack.pop();
            let a = from + span / 2;
            angle.set(id, a);
            let ring = ring_of(id);
            if(!rings[ring]) {
                rings[ring] = [];
            }
            let n = t.by_id.get(id);
            rings[ring].push({
                id: id,
                angle: a,
                diag: Math.hypot(n.w, n.h),
                /*  How much of the card lies along the RADIUS at this
                 *  angle -- the projection of the rectangle on that
                 *  direction -- for itself and for the node it hangs
                 *  from, which is the one it has to clear.  */
                ext: extent_at(n, a),
                parent_ext: parent? extent_at(t.by_id.get(parent), a) : 0,
            });
            let cursor = from;
            for(let kid of (t.children.get(id) || [])) {
                let part = span * leaves.get(kid) / leaves.get(id);
                stack.push({id: kid, from: cursor, span: part, parent: id});
                cursor += part;
            }
        }
    };
    if(single) {
        let root = t.roots[0];
        angle.set(root, 0);
        let cursor = -Math.PI / 2;      /*  the first child at the top  */
        for(let kid of (t.children.get(root) || [])) {
            let part = 2 * Math.PI * leaves.get(kid) / leaves.get(root);
            sector(kid, cursor, part, root);
            cursor += part;
        }
    } else {
        let cursor = -Math.PI / 2;
        for(let root of t.roots) {
            let part = 2 * Math.PI * leaves.get(root) / total;
            sector(root, cursor, part, null);
            cursor += part;
        }
    }

    /*  Pass 2, the RADII. Two constraints, and the larger wins.
     *
     *  ACROSS the ring: its two closest neighbours have to sit side
     *  by side -- the arc between two adjacent centres is r·Δangle,
     *  and it has to hold half of each card plus the gap. Measured on
     *  NEIGHBOURS, not on the ring's total length: a leafless root
     *  squeezed between two big subtrees gets a sliver of angle, and
     *  it is the sliver that sets the radius.
     *
     *  ALONG the radius: `ranksep` is a step between CENTRES, so a
     *  ring one step out was one step out whatever the cards
     *  measured -- 180 between the centres of two cards that reach
     *  95 each way is two cards touching. The tidy tree never had
     *  this: its `ranksep` is a gap between COLUMNS, and a column
     *  carries its own width. Here every card is measured against
     *  the one it HANGS FROM, in the direction it hangs in -- the
     *  two are radially aligned, or nearly, since a child lives
     *  inside its parent's sector -- and the ring goes out far
     *  enough for the worst of them.  */
    let radius = [0];
    for(let ring = 1; ring < rings.length; ring++) {
        let r = radius[ring - 1] + o.ranksep;
        for(let n of (rings[ring] || [])) {
            r = Math.max(r, radius[ring - 1] + (n.parent_ext + n.ext) / 2 + o.nodesep);
        }
        let list = (rings[ring] || []).slice().sort((a, b) => a.angle - b.angle);
        for(let i = 0; i < list.length && list.length > 1; i++) {
            let a = list[i];
            let b = list[(i + 1) % list.length];
            let gap = (i + 1 < list.length)
                ? b.angle - a.angle
                : b.angle + 2 * Math.PI - a.angle;
            if(gap > 1e-9) {
                r = Math.max(r, (a.diag / 2 + b.diag / 2 + o.nodesep) / gap);
            }
        }
        radius[ring] = r;
    }

    /*  Pass 3, the positions.  */
    for(let [id, a] of angle) {
        let r = radius[ring_of(id)] || 0;
        pos.set(id, {x: r * Math.cos(a), y: r * Math.sin(a)});
    }

    return pos;
}
