/***********************************************************************
 *          graph_save_plan.test.js
 *
 *      A Save of the graph writes the topics that CHANGED.
 *
 *      Measured before this existed, on a live agent treedb: one node
 *      of `public_services` dragged, Save pressed, and the store took
 *      five `__graphs__` records -- one per topic the view had loaded
 *      -- of which four were identical, byte for byte, to the records
 *      under them. An append-only store keeps them for ever.
 *
 *      The cases below are the ones that decide whether a topic is
 *      written, and two of them are the reason this is a module of its
 *      own rather than three lines inside the Save.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {describe, test, expect} from "vitest";
import {
    plan_graph_saves, topic_arrangement_changed, arrangement_of, apply_graphs_echo
} from "./graph_save_plan.js";

const ORIGIN = "f3163a9f-1f37-412a-b8c9-87a4341f14de";

function layout(nodes, extra)
{
    return Object.assign({nodes: nodes, __origin__: ORIGIN}, extra || {});
}

/*  The shape of the real case: five topics, one card moved.  */
function five_topics()
{
    return {
        realms:          layout({"artgins.utilities.all": {x: 398, y: 605}}),
        yunos:           layout({"1": {x: 130, y: 815}, "2": {x: 398, y: 815}}),
        binaries:        layout({emailsender: {x: 197, y: 985}}),
        configurations:  layout({"emailsender.artgins": {x: 63, y: 985}}),
        public_services: layout({"1": {x: 993.7299656271935, y: 1119.9412968754768}}),
    };
}

describe("plan_graph_saves", () => {
    test("nothing moved, nothing is written", () => {
        const live = five_topics();
        const saved = five_topics();
        expect(plan_graph_saves(live, saved)).toEqual([]);
    });

    test("one card moved writes ONE topic, not five", () => {
        const live = five_topics();
        const saved = five_topics();
        live.public_services.nodes["1"].x = 811.7299656271935;
        live.public_services.nodes["1"].y = 1167.9412968754768;
        expect(plan_graph_saves(live, saved)).toEqual(["public_services"]);
    });

    test("a topic the backend has never seen is written", () => {
        const live = five_topics();
        const saved = five_topics();
        delete saved.binaries;
        expect(plan_graph_saves(live, saved)).toEqual(["binaries"]);
    });

    test("...unless it holds nothing: an empty arrangement is not a layout", () => {
        const live = five_topics();
        const saved = five_topics();
        delete saved.binaries;
        live.binaries = {};
        expect(plan_graph_saves(live, saved)).toEqual([]);
    });

    test("no saved side at all is the first Save: every topic with content", () => {
        expect(plan_graph_saves(five_topics(), {})).toEqual(
            ["realms", "yunos", "binaries", "configurations", "public_services"]
        );
    });

    test("a different __origin__ is not a change", () => {
        const live = five_topics();
        const saved = five_topics();
        live.yunos.__origin__ = "another-browser-entirely";
        expect(plan_graph_saves(live, saved)).toEqual([]);
    });

    test("the order the keys were built in is not a change", () => {
        const saved = {yunos: {nodes: {a: {x: 1, y: 2}}, __origin__: ORIGIN}};
        const live = {yunos: {__origin__: ORIGIN, nodes: {a: {y: 2, x: 1}}}};
        expect(plan_graph_saves(live, saved)).toEqual([]);
    });

    test("a node that lost its entry is a change", () => {
        const live = five_topics();
        const saved = five_topics();
        delete live.yunos.nodes["2"];
        expect(plan_graph_saves(live, saved)).toEqual(["yunos"]);
    });

    test("what is not a position counts too: defaults and edges", () => {
        const live = five_topics();
        const saved = five_topics();
        live.realms.defaults = {fill: "#123456"};
        live.binaries.edges = {"binaries^a|yunos": {lineWidth: 3}};
        expect(plan_graph_saves(live, saved)).toEqual(["realms", "binaries"]);
    });

    test("a size added to a card is a change", () => {
        const live = five_topics();
        const saved = five_topics();
        live.binaries.nodes.emailsender.size = [260, 120];
        expect(plan_graph_saves(live, saved)).toEqual(["binaries"]);
    });

    test("it answers a plan, never undefined", () => {
        expect(plan_graph_saves(null, null)).toEqual([]);
        expect(plan_graph_saves(undefined, five_topics())).toEqual([]);
    });
});

describe("topic_arrangement_changed", () => {
    test("no saved record and content: TRUE", () => {
        expect(topic_arrangement_changed(layout({a: {x: 1, y: 1}}), undefined)).toBe(true);
    });

    test("no saved record and nothing to say: FALSE", () => {
        expect(topic_arrangement_changed({}, undefined)).toBe(false);
        expect(topic_arrangement_changed({__origin__: ORIGIN}, undefined)).toBe(false);
    });

    test("the same arrangement: FALSE", () => {
        const props = layout({a: {x: 1, y: 1}});
        expect(topic_arrangement_changed(props, props)).toBe(false);
    });
});

describe("arrangement_of", () => {
    test("drops who wrote it and keeps the rest", () => {
        expect(arrangement_of(layout({a: {x: 1, y: 1}}, {defaults: {fill: "#fff"}})))
            .toEqual({nodes: {a: {x: 1, y: 1}}, defaults: {fill: "#fff"}});
    });

    test("anything that is not an object holds no arrangement", () => {
        expect(arrangement_of(null)).toEqual({});
        expect(arrangement_of("nodes")).toEqual({});
    });
});

/*
 *  An ECHO of one __graphs__ record -- the node event a save of it, or a
 *  save by another browser, sends back. It used to rebuild the saved
 *  snapshot of EVERY topic, taking the copies from the live objects the
 *  view had already rearranged: what was unsaved in OTHER topics counted
 *  as saved, and the next Save skipped it (M32 of the 2026-09-21 review).
 */
describe("an echo of one __graphs__ record", () => {
    function state()
    {
        let live = {
            realms: layout({a: {x: 1, y: 1}}),
            yunos:  layout({b: {x: 2, y: 2}}),
        };
        let saved = {
            realms: layout({a: {x: 1, y: 1}}),
            yunos:  layout({b: {x: 2, y: 2}}),
        };
        return {live, saved};
    }

    test("touches only the topic of its record", () => {
        let {live, saved} = state();
        live.yunos.nodes.b.x = 99;      /*  moved, not saved yet  */
        let echo = {id: "1", topic: "realms", active: true,
                    properties: layout({a: {x: 5, y: 5}})};
        apply_graphs_echo(live, saved, [echo], echo);
        expect(plan_graph_saves(live, saved)).toEqual(["yunos"]);
    });

    test("its topic becomes the echoed record, saved and live", () => {
        let {live, saved} = state();
        let echo = {id: "1", topic: "realms", active: true,
                    properties: layout({a: {x: 5, y: 5}})};
        apply_graphs_echo(live, saved, [echo], echo);
        expect(live.realms.nodes.a).toEqual({x: 5, y: 5});
        expect(saved.realms.nodes.a).toEqual({x: 5, y: 5});
        live.realms.nodes.a.x = 6;      /*  the view arranges it in place  */
        expect(saved.realms.nodes.a.x).toBe(5);
    });

    test("an inactive record drops its topic only when no active one is left", () => {
        let {live, saved} = state();
        let old = {id: "2", topic: "realms", active: false, properties: layout({})};
        let current = {id: "3", topic: "realms", active: true,
                       properties: layout({a: {x: 1, y: 1}})};
        apply_graphs_echo(live, saved, [old, current], old);
        expect(live.realms).toBeDefined();

        apply_graphs_echo(live, saved, [old], old);
        expect(live.realms).toBeUndefined();
        expect(saved.realms).toBeUndefined();
        expect(live.yunos).toBeDefined();
    });
});
