/***********************************************************************
 *          graph_save_plan.js
 *
 *      Which topics a Save of the graph has to write, and which it
 *      must leave alone.
 *
 *      The arrangement of a treedb graph lives in `__graphs__`, ONE
 *      record per topic. The Save collected every topic the view had
 *      loaded and wrote all of them, whatever had moved: on a treedb
 *      of five topics, dragging one card appended five records, four
 *      of them saying exactly what the record under them said. The
 *      store is append-only, so those four are there for ever.
 *
 *      This module is the decision, and nothing else: no G6, no DOM,
 *      no gobj. Give it what the view is holding and what the backend
 *      already has, and it answers which topics differ.
 *
 *      Two things it deliberately does NOT do:
 *
 *      - It does not ask the history plugin. The Save button lights
 *        from two places -- `history.canUndo()` for what G6 records
 *        (a move, a resize) and `mark_graph_dirty()` for what it does
 *        not (a colour, a pill, a per-topic default) -- so the undo
 *        stack is not the list of what changed, and reading it as one
 *        would silently drop half the changes. A value comparison
 *        sees both, and keeps working through undo, redo and a
 *        history that was just cleared.
 *
 *      - It does not compare `__origin__`. That key is the node_uuid
 *        of whoever wrote the record, bookkeeping about the write and
 *        not about the arrangement; comparing it would make every
 *        topic differ the first time a second browser saved, and the
 *        record it forces would say nothing new.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {
    is_object,
    json_is_identical,
} from "@yuneta/gobj-js";

/***************************************************************
 *  The properties as they are worth comparing: everything
 *  except who wrote them.
 ***************************************************************/
function arrangement_of(properties)
{
    if(!is_object(properties)) {
        return {};
    }
    let out = {};
    for(const [key, value] of Object.entries(properties)) {
        if(key === "__origin__") {
            continue;
        }
        out[key] = value;
    }
    return out;
}

/***************************************************************
 *  TRUE when the arrangement the view holds for `topic_name`
 *  is not the one the backend already has.
 *
 *  A topic with no saved record has never been written, so
 *  anything it holds is a change -- and an EMPTY arrangement
 *  is not: a topic the view loaded and nobody ever arranged
 *  has nothing to say, and saying it would create a record
 *  that means "no layout".
 ***************************************************************/
function topic_arrangement_changed(live, saved)
{
    let a = arrangement_of(live);
    if(!saved) {
        return Object.keys(a).length > 0;
    }
    return !json_is_identical(a, arrangement_of(saved));
}

/***************************************************************
 *  The topics a Save has to write.
 *
 *      live    {topic_name: properties}  what the view holds
 *      saved   {topic_name: properties}  what the backend has
 *
 *  Returns their names, in the order the view holds them.
 ***************************************************************/
function plan_graph_saves(live, saved)
{
    let plan = [];
    if(!is_object(live)) {
        return plan;
    }
    let have = is_object(saved)? saved: {};
    for(const [topic_name, properties] of Object.entries(live)) {
        if(topic_arrangement_changed(properties, have[topic_name])) {
            plan.push(topic_name);
        }
    }
    return plan;
}

export {
    plan_graph_saves,
    topic_arrangement_changed,
    arrangement_of,
};
