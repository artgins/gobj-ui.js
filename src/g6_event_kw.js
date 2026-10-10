/***********************************************************************
 *          g6_event_kw.js
 *
 *      The kw an FSM event carries for a G6 pointer event: an identity
 *      and three scalars, never the event. Shared by the three graphs
 *      (C_G6_NODES_TREE, C_YUI_JSON_GRAPH, C_YUI_GOBJ_TREE_JS), which
 *      each had a copy.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/

/************************************************************
 *  A G6 event, as PLAIN JSON.
 *
 *  A kw is dumped by the `machine` trace (`trace_json(kw)`), and a
 *  G6 / @antv/g event is circular: serializing one THROWS, so the
 *  first thing a kw carrying `evt` breaks is the trace the FSM
 *  exists to feed. It also drags a live graph element into a
 *  message that may be read after that element is gone.
 *
 *  What the actions read of it is an id and three scalars. The
 *  event itself never leaves the callback that received it.
 ************************************************************/
export function g6_event_kw(evt)
{
    let target = (evt && evt.target)? evt.target : null;
    let client = (evt && evt.client)? evt.client : null;

    return {
        id:       (target && target.id)? String(target.id) : "",
        shift:    !!(evt && evt.shiftKey),
        client_x: (client && typeof client.x === "number")? client.x : 0,
        client_y: (client && typeof client.y === "number")? client.y : 0
    };
}
