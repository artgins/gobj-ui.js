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
export function fold_build_model(descs, records, opts)
{
    let nodes = new Map();
    let groups = new Map();
    let topics = [];

    descs = is_object(descs)? descs : {};
    records = is_object(records)? records : {};
    opts = is_object(opts)? opts : {};

    let hidden = new Set(is_array(opts.hidden_topics)? opts.hidden_topics : []);
    let loose_shown = new Set(is_array(opts.loose_topics)? opts.loose_topics : []);
    let main_topic = opts.main_topic || fold_main_topic(descs);
    if(main_topic && (!descs[main_topic] || hidden.has(main_topic))) {
        main_topic = "";    /*  a main topic that is not drawn governs nothing  */
    }
    let linked = fold_linked_topics(descs, main_topic);
    let totals = {};

    /*  Pass 1: every record is a node -- of the topics that are SHOWN.
     *  A hidden topic leaves the model whole: no pills count it, no
     *  edge reaches it, and the records that hung from it alone become
     *  roots, the way any record with no drawable parent does.  */
    for(let topic_name of Object.keys(descs)) {
        if(topic_name.substring(0, 2) === "__") {
            continue;
        }
        let desc = descs[topic_name];
        let list = records[topic_name];
        if(!is_array(list)) {
            continue;
        }
        totals[topic_name] = list.length;
        if(hidden.has(topic_name)) {
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

    /*  Roots: no drawable parent -- with one distinction when there is
     *  a MAIN topic. A record of a topic the schema hangs from the main
     *  one (`linked`) that has no parent is LOOSE: a device with no
     *  place. It should hang and does not, so it is not a root of the
     *  tree; it is counted per topic and shown only on request
     *  (`loose_topics`). A topic the schema does not tie to the main
     *  one at all is a tree of its own, and its parentless records are
     *  its roots, as before.
     *
     *  Then whatever the roots cannot reach -- a cycle with no way in
     *  -- becomes a root too, so that every record has a place on
     *  screen to be opened from.  */
    let roots = {};
    let loose = {};
    for(let topic_name of topics) {
        roots[topic_name] = [];
        loose[topic_name] = [];
    }
    for(let node of nodes.values()) {
        if(node.parents.length > 0) {
            continue;
        }
        let t = node.topic_name;
        if(main_topic && t !== main_topic && linked.has(t)) {
            loose[t].push(node.key);
            if(loose_shown.has(t)) {
                roots[t].push(node.key);
            }
        } else {
            roots[t].push(node.key);
        }
    }
    let reached = reach_from(nodes, [].concat(...Object.values(roots)));
    for(let node of nodes.values()) {
        if(reached.has(node.key)) {
            continue;
        }
        let t = node.topic_name;
        if(main_topic && t !== main_topic && linked.has(t)) {
            /*  Reachable through a loose record that is not shown, or
             *  through a hidden topic: loose as well, not a root.  */
            if(node.parents.length > 0) {
                loose[t].push(node.key);
            }
            if(!loose_shown.has(t)) {
                continue;
            }
        }
        roots[t].push(node.key);
        /*  Its own subtree is reachable now; mark it so a whole
         *  cycle does not become a row of roots.  */
        for(let k of reach_from(nodes, [node.key])) {
            reached.add(k);
        }
    }
    for(let topic_name of topics) {
        if(roots[topic_name].length > 0) {
            groups.set(fold_root_group_key(topic_name), roots[topic_name]);
        }
    }

    return {
        nodes: nodes,
        groups: groups,
        topics: topics,
        totals: totals,         /*  {topic: records}, hidden topics included  */
        hidden: hidden,         /*  Set of hidden topics  */
        main_topic: main_topic, /*  "" when nothing governs the tree  */
        linked: linked,         /*  Set of topics the schema hangs from main  */
        loose: loose,           /*  {topic: [key, ...]} records that should hang and do not  */
        loose_shown: loose_shown,
    };
}

/************************************************************
 *  The topic the schema hangs the others from: the one whose hooks
 *  reach the most OTHER topics, a self-referent hook breaking a tie
 *  (a tree of places over a flat list of groups), schema order
 *  breaking the rest. "" when no topic reaches another -- a treedb of
 *  unrelated lists has no trunk, and every topic is a tree of its own.
 ************************************************************/
export function fold_main_topic(descs)
{
    descs = is_object(descs)? descs : {};
    let best = "";
    let best_score = 0;
    let best_self = false;

    for(let topic_name of Object.keys(descs)) {
        if(topic_name.substring(0, 2) === "__") {
            continue;
        }
        let reach = hook_targets(descs, topic_name);
        let self = reach.has(topic_name);
        reach.delete(topic_name);
        let score = reach.size;
        if(score === 0) {
            continue;
        }
        if(score > best_score || (score === best_score && self && !best_self)) {
            best = topic_name;
            best_score = score;
            best_self = self;
        }
    }
    return best;
}

/*  The topics a topic's hooks name (drawn topics only). An `extended`
 *  topic names nothing: the engine draws no edge from one, so its
 *  records hang nothing and it can govern no tree.  */
function hook_targets(descs, topic_name)
{
    let out = new Set();
    let desc = descs[topic_name];
    if(!desc || desc.node_treedb_type === "extended") {
        return out;
    }
    let cols = is_array(desc.cols)? desc.cols : [];
    for(let col of cols) {
        if(!is_object(col.hook) || !is_array(col.flag) || col.flag.indexOf("hook") < 0) {
            continue;
        }
        for(let child of Object.keys(col.hook)) {
            if(child.substring(0, 2) !== "__" && descs[child]) {
                out.add(child);
            }
        }
    }
    return out;
}

/************************************************************
 *  The topics the schema hangs from `main_topic`, main included:
 *  reached by following hooks from it. A record of one of these
 *  with no parent is LOOSE; a topic outside the set is its own tree.
 *  Empty when there is no main topic.
 ************************************************************/
export function fold_linked_topics(descs, main_topic)
{
    let linked = new Set();
    if(!main_topic || !is_object(descs) || !descs[main_topic]) {
        return linked;
    }
    let queue = [main_topic];
    while(queue.length) {
        let t = queue.shift();
        if(linked.has(t)) {
            continue;
        }
        linked.add(t);
        for(let child of hook_targets(descs, t)) {
            if(!linked.has(child)) {
                queue.push(child);
            }
        }
    }
    return linked;
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
    let n;
    if(state.shown.has(group_key)) {
        n = state.shown.get(group_key);
    } else if(group_key.charAt(0) === "|") {
        /*  A ROOT group nobody has set is open on its first page: no
         *  pill folds the roots, so "unset" cannot mean "folded" -- a
         *  topic shown again after being hidden, or one that appears
         *  when the main topic moves, would otherwise draw nothing.  */
        n = state.page_size;
    } else {
        n = 0;
    }
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
