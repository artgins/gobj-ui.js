/***********************************************************************
 *          treedb_fold_model.js
 *
 *      A treedb read as a TREE, and which part of it is on screen.
 *
 *      A treedb is a graph: a record hangs from every parent one of its
 *      fkeys names, and a parent reaches its children through a hook.
 *      Drawn whole it is a pile -- a nave with a hundred and forty
 *      devices is a row of a hundred and forty cards -- so the graph
 *      opens FOLDED, the way a JSON viewer opens: the roots, a level or
 *      two under them, and a count on every cut saying what went with it.
 *
 *      This module is the arithmetic of that, and nothing else: no G6,
 *      no DOM, no gobj. The graph engine (c_g6_nodes_tree.js) asks it
 *      what is visible and draws exactly that.
 *
 *      Vocabulary
 *
 *          node key    "topic^id" -- one record
 *          group       the children of ONE node through ONE hook,
 *                      keyed "topic^id|hook"; the roots of a topic are
 *                      a group of their own, keyed "|topic"
 *          shown       how many of a group's children are on screen:
 *                      absent means folded, a number means the first
 *                      N, in record order, a page at a time
 *
 *      Two rules that are not obvious:
 *
 *      - A node is visible when SOME visible parent shows it, or it is
 *        a shown root. A record with two parents (a device hangs from
 *        its place AND its controller) is drawn ONCE, under whichever
 *        opened first, and folding one of the two leaves it where the
 *        other one shows it. The union, never the intersection.
 *
 *      - A parent that the engine does not draw an edge to is not a
 *        parent here either: the `extended` tier (hooks and no fkeys)
 *        gets no edges in draw_link(), so its children are roots. The
 *        tree on screen and the tree in this model have to agree, or a
 *        pill counts children that no line reaches.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {
    is_array,
    is_object,
    treedb_decoder_fkey,
} from "@yuneta/gobj-js";

const PAGE_SIZE_DEFAULT = 24;

/************************************************************
 *  Keys
 ************************************************************/
export function fold_node_key(topic_name, id)
{
    return `${topic_name}^${id}`;
}

export function fold_group_key(node_key, hook_name)
{
    return `${node_key}|${hook_name}`;
}

export function fold_root_group_key(topic_name)
{
    return `|${topic_name}`;
}

/*  "topic^id|hook" -> {node_key, hook}; "|topic" -> {node_key: "", hook: topic}  */
export function fold_split_group_key(group_key)
{
    let i = group_key.lastIndexOf("|");
    if(i < 0) {
        return null;
    }
    return {node_key: group_key.slice(0, i), hook: group_key.slice(i + 1)};
}

/************************************************************
 *  Every parent a record names, decoded, in column order.
 *
 *  Only the parents that will be DRAWN: a topic missing from
 *  `descs` (a system topic such as `__assets__`, never fetched)
 *  and an `extended` parent (no edge is drawn to one, see the
 *  header) are left out, so a child of nothing else is a root.
 ************************************************************/
function parents_of(descs, desc, record)
{
    let out = [];
    let cols = desc.cols || [];

    for(let i = 0; i < cols.length; i++) {
        let col = cols[i];
        if(!col.fkey) {
            continue;
        }
        let fkeys = record[col.id];
        if(!fkeys) {
            continue;
        }
        let list = is_array(fkeys)? fkeys : [fkeys];
        for(let j = 0; j < list.length; j++) {
            let ref = treedb_decoder_fkey(col, list[j]);
            if(!ref || !ref.topic_name || !ref.hook_name) {
                continue;   /* Error already logged by the decoder */
            }
            let parent_desc = descs[ref.topic_name];
            if(!parent_desc) {
                continue;   /* a topic that is not drawn: no parent here */
            }
            if(parent_desc.node_treedb_type === "extended") {
                continue;   /* the engine draws no edge to it, see draw_link */
            }
            out.push({
                node_key: fold_node_key(ref.topic_name, String(ref.id)),
                hook: ref.hook_name,
                fkey_name: col.id,
            });
        }
    }

    return out;
}

/************************************************************
 *  Build the model from the topic descriptions and their records.
 *
 *      descs    {topic_name: desc}, system topics included (skipped)
 *      records  {topic_name: [record, ...]}, in the order the
 *               backend returned them -- that order is the order of
 *               the children on screen, and of the pages
 *
 *  Returns
 *      {
 *          nodes:  Map<node_key, {key, topic_name, id, record,
 *                                 parents: [{node_key, hook, fkey_name}],
 *                                 hooks: {hook: [child_key, ...]}}>
 *          groups: Map<group_key, [child_key, ...]>   (roots included)
 *          topics: [topic_name, ...]  topics with records, in desc order
 *      }
 ************************************************************/
export function fold_build_model(descs, records)
{
    let nodes = new Map();
    let groups = new Map();
    let topics = [];

    descs = is_object(descs)? descs : {};
    records = is_object(records)? records : {};

    /*  Pass 1: every record is a node.  */
    for(let topic_name of Object.keys(descs)) {
        if(topic_name.substring(0, 2) === "__") {
            continue;
        }
        let desc = descs[topic_name];
        let list = records[topic_name];
        if(!is_array(list)) {
            continue;
        }
        topics.push(topic_name);
        for(let i = 0; i < list.length; i++) {
            let record = list[i];
            if(!is_object(record) || record.id === undefined || record.id === null) {
                continue;
            }
            let key = fold_node_key(topic_name, String(record.id));
            nodes.set(key, {
                key: key,
                topic_name: topic_name,
                id: String(record.id),
                record: record,
                parents: [],
                hooks: {},
            });
        }
    }

    /*  Pass 2: the parents, and through them the children groups. A
     *  parent that names a record nobody fetched is not a parent.  */
    for(let node of nodes.values()) {
        let desc = descs[node.topic_name];
        let parents = parents_of(descs, desc, node.record);
        for(let p of parents) {
            let parent = nodes.get(p.node_key);
            if(!parent) {
                continue;
            }
            node.parents.push(p);
            if(!parent.hooks[p.hook]) {
                parent.hooks[p.hook] = [];
            }
            parent.hooks[p.hook].push(node.key);
        }
    }

    /*  Children groups, in parent order (Map order = insertion = record
     *  order within a topic, topics in desc order).  */
    for(let node of nodes.values()) {
        for(let hook of Object.keys(node.hooks)) {
            groups.set(fold_group_key(node.key, hook), node.hooks[hook]);
        }
    }

    /*  Roots: no drawable parent. Then whatever the roots cannot reach
     *  -- a cycle with no way in -- becomes a root too, so that every
     *  record has a place on screen to be opened from.  */
    let roots = {};
    for(let topic_name of topics) {
        roots[topic_name] = [];
    }
    for(let node of nodes.values()) {
        if(node.parents.length === 0) {
            roots[node.topic_name].push(node.key);
        }
    }
    let reached = reach_from(nodes, [].concat(...Object.values(roots)));
    for(let node of nodes.values()) {
        if(!reached.has(node.key)) {
            roots[node.topic_name].push(node.key);
            /*  Its own subtree is reachable now; mark it so a whole
             *  cycle does not become a row of roots.  */
            for(let k of reach_from(nodes, [node.key])) {
                reached.add(k);
            }
        }
    }
    for(let topic_name of topics) {
        if(roots[topic_name].length > 0) {
            groups.set(fold_root_group_key(topic_name), roots[topic_name]);
        }
    }

    return {nodes: nodes, groups: groups, topics: topics};
}

/************************************************************
 *  Everything reachable downwards from `start`, cycles included.
 ************************************************************/
function reach_from(nodes, start)
{
    let seen = new Set();
    let queue = start.slice();
    while(queue.length) {
        let key = queue.shift();
        if(seen.has(key)) {
            continue;
        }
        seen.add(key);
        let node = nodes.get(key);
        if(!node) {
            continue;
        }
        for(let hook of Object.keys(node.hooks)) {
            for(let child of node.hooks[hook]) {
                if(!seen.has(child)) {
                    queue.push(child);
                }
            }
        }
    }
    return seen;
}

/************************************************************
 *  Fold state: which groups are open, and how far.
 ************************************************************/
export function fold_new_state(page_size)
{
    return {
        page_size: (page_size > 0)? page_size : PAGE_SIZE_DEFAULT,
        shown: new Map(),   /*  group_key -> number of children shown  */
    };
}

export function fold_group_total(model, group_key)
{
    let list = model.groups.get(group_key);
    return list? list.length : 0;
}

export function fold_group_shown(model, state, group_key)
{
    let total = fold_group_total(model, group_key);
    let n = state.shown.get(group_key) || 0;
    return Math.min(n, total);
}

export function fold_is_open(state, group_key)
{
    return (state.shown.get(group_key) || 0) > 0;
}

/*  The next page boundary at or above `n`: 25 -> 48 with pages of 24.  */
function page_ceiling(state, n)
{
    let p = state.page_size;
    return Math.ceil(n / p) * p;
}

/************************************************************
 *  Open a group on its first page, or close it.
 *  Returns true when it ends OPEN.
 ************************************************************/
export function fold_toggle(model, state, group_key)
{
    if(fold_is_open(state, group_key)) {
        state.shown.delete(group_key);
        return false;
    }
    if(fold_group_total(model, group_key) === 0) {
        return false;   /* nothing to open */
    }
    state.shown.set(group_key, state.page_size);
    return true;
}

/************************************************************
 *  One more page of a group. Returns how many are shown now.
 ************************************************************/
export function fold_show_more(model, state, group_key)
{
    let total = fold_group_total(model, group_key);
    let n = fold_group_shown(model, state, group_key) + state.page_size;
    n = Math.min(n, total);
    if(n > 0) {
        state.shown.set(group_key, n);
    }
    return n;
}

/************************************************************
 *  Every group open on ALL its children. This is the reader
 *  asking for the whole thing; the pages are for the other way in.
 ************************************************************/
export function fold_expand_all(model, state)
{
    state.shown.clear();
    for(let [group_key, list] of model.groups) {
        if(list.length > 0) {
            state.shown.set(group_key, list.length);
        }
    }
}

/************************************************************
 *  The roots and nothing else -- the first page of each topic's
 *  roots, the way the graph looks before anything is opened.
 ************************************************************/
export function fold_collapse_all(model, state)
{
    state.shown.clear();
    for(let topic_name of model.topics) {
        let key = fold_root_group_key(topic_name);
        if(fold_group_total(model, key) > 0) {
            state.shown.set(key, state.page_size);
        }
    }
}

/************************************************************
 *  Open the tree down to `depth` levels: the roots are level 1,
 *  their children level 2. A node reached by two paths takes the
 *  shallowest. Each group opens on its first page. `depth` of 1
 *  is the roots alone; anything below that is treated as 1.
 ************************************************************/
export function fold_expand_to_depth(model, state, depth)
{
    fold_collapse_all(model, state);
    if(!(depth > 1)) {
        return;
    }

    let level = new Map();
    let queue = [];
    for(let topic_name of model.topics) {
        let roots = model.groups.get(fold_root_group_key(topic_name)) || [];
        for(let key of roots) {
            if(!level.has(key)) {
                level.set(key, 1);
                queue.push(key);
            }
        }
    }
    while(queue.length) {
        let key = queue.shift();
        let lv = level.get(key);
        if(lv >= depth) {
            continue;
        }
        let node = model.nodes.get(key);
        if(!node) {
            continue;
        }
        for(let hook of Object.keys(node.hooks)) {
            let children = node.hooks[hook];
            if(children.length === 0) {
                continue;
            }
            state.shown.set(fold_group_key(key, hook), state.page_size);
            for(let child of children) {
                if(!level.has(child)) {
                    level.set(child, lv + 1);
                    queue.push(child);
                }
            }
        }
    }
}

/************************************************************
 *  The set of node keys on screen, from the roots down through
 *  every open group -- and only through open groups whose parent
 *  is itself on screen: a group remembered open under a folded
 *  ancestor stays remembered, not shown.
 ************************************************************/
export function fold_visible_set(model, state)
{
    let visible = new Set();
    let queue = [];

    let push_group = (group_key, children) => {
        let n = fold_group_shown(model, state, group_key);
        for(let i = 0; i < n; i++) {
            let key = children[i];
            if(!visible.has(key)) {
                visible.add(key);
                queue.push(key);
            }
        }
    };

    for(let topic_name of model.topics) {
        let key = fold_root_group_key(topic_name);
        let roots = model.groups.get(key);
        if(roots) {
            push_group(key, roots);
        }
    }
    while(queue.length) {
        let key = queue.shift();
        let node = model.nodes.get(key);
        if(!node) {
            continue;
        }
        for(let hook of Object.keys(node.hooks)) {
            push_group(fold_group_key(key, hook), node.hooks[hook]);
        }
    }

    return visible;
}

/************************************************************
 *  The open groups that still have children off screen, with the
 *  parent that owns each -- what the "+N" chips are drawn for.
 *  Only groups whose parent is visible (or root groups).
 *
 *  Returns [{group_key, node_key, hook, shown, total, rest}]
 ************************************************************/
export function fold_pending_groups(model, state, visible)
{
    let out = [];
    for(let [group_key, list] of model.groups) {
        let shown = fold_group_shown(model, state, group_key);
        if(shown === 0 || shown >= list.length) {
            continue;
        }
        let g = fold_split_group_key(group_key);
        if(g.node_key && !visible.has(g.node_key)) {
            continue;
        }
        out.push({
            group_key: group_key,
            node_key: g.node_key,
            hook: g.hook,
            shown: shown,
            total: list.length,
            rest: list.length - shown,
        });
    }
    return out;
}

/************************************************************
 *  The pills of one card: one per hook that has children.
 *
 *  Returns [{hook, group_key, total, shown, open, child_topic}]
 *  `child_topic` is the topic of the first child, which is what
 *  the pill is coloured with (a hook can name several topics in
 *  the schema, but the children it has are what it links).
 ************************************************************/
export function fold_pills_of(model, state, node_key)
{
    let node = model.nodes.get(node_key);
    if(!node) {
        return [];
    }
    let out = [];
    for(let hook of Object.keys(node.hooks)) {
        let children = node.hooks[hook];
        if(children.length === 0) {
            continue;
        }
        let group_key = fold_group_key(node_key, hook);
        let first = model.nodes.get(children[0]);
        out.push({
            hook: hook,
            group_key: group_key,
            total: children.length,
            shown: fold_group_shown(model, state, group_key),
            open: fold_is_open(state, group_key),
            child_topic: first? first.topic_name : "",
        });
    }
    return out;
}

/************************************************************
 *  Make ONE node visible, opening the groups on a path from a
 *  root to it, and as many pages of each as it takes for the
 *  node to be inside the shown prefix. Prefers the shortest path
 *  (breadth-first upwards). Returns false if no root reaches it,
 *  which cannot happen with a model built here (see roots) but
 *  is the honest answer for a key the model does not know.
 ************************************************************/
export function fold_reveal(model, state, node_key)
{
    let node = model.nodes.get(node_key);
    if(!node) {
        return false;
    }

    /*  Upwards BFS: from the node to the first ancestor that is a
     *  root, remembering how each step was reached.  */
    let root_group_of = (key) => {
        let n = model.nodes.get(key);
        let rg = fold_root_group_key(n.topic_name);
        let roots = model.groups.get(rg) || [];
        return roots.indexOf(key) >= 0? rg : null;
    };

    let via = new Map();        /*  key -> {parent_key, hook}  */
    let queue = [node_key];
    via.set(node_key, null);
    let root_key = null;
    while(queue.length) {
        let key = queue.shift();
        if(root_group_of(key)) {
            root_key = key;
            break;
        }
        let n = model.nodes.get(key);
        for(let p of n.parents) {
            if(!model.nodes.has(p.node_key) || via.has(p.node_key)) {
                continue;
            }
            via.set(p.node_key, {child_key: key, hook: p.hook});
            queue.push(p.node_key);
        }
    }
    if(root_key === null) {
        return false;
    }

    /*  Walk back down, opening each group far enough.  */
    let open_up_to = (group_key, child_key) => {
        let list = model.groups.get(group_key) || [];
        let idx = list.indexOf(child_key);
        if(idx < 0) {
            return;
        }
        let need = page_ceiling(state, idx + 1);
        let have = state.shown.get(group_key) || 0;
        if(need > have) {
            state.shown.set(group_key, Math.min(need, list.length));
        }
    };

    open_up_to(root_group_of(root_key), root_key);
    let key = root_key;
    while(true) {
        let step = via.get(key);
        if(!step) {
            break;
        }
        open_up_to(fold_group_key(key, step.hook), step.child_key);
        key = step.child_key;
    }
    return true;
}
