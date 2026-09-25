/***********************************************************************
 *          g6_graphs_write_owed.wiring.test.js
 *
 *      A `__graphs__` write that did not land is OWED, and the Save
 *      button says so until a Save writes it again.
 *
 *      EV_GRAPHS_WRITE_REFUSED lit the Save (in edition only), and
 *      the next repaint of the history buttons put it out again:
 *      update_history_buttons() decides the Save from
 *      `history.canUndo()` alone, and it runs on every history
 *      change, every change of mode and every redraw of the theme.
 *      A refusal heard in reading was never shown at all.
 *
 *      The real C_G6_NODES_TREE, on a fake G6 graph: only the history
 *      plugin and the Save button are what is looked at.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {describe, test, expect, beforeAll, beforeEach} from "vitest";
import {install_dom_double} from "../test/dom_double.js";

install_dom_double();

const {
    SDATA, SDATA_END, data_type_t,
    gclass_create, gobj_start_up, gobj_create_yuno, gobj_create_pure_child,
    gobj_send_event, register_c_timer, set_log_callback,
} = await import("@yuneta/gobj-js");
const {register_c_g6_nodes_tree} = await import("./c_g6_nodes_tree.js");

const logged = [];
const published = [];

/*  G6, as far as these paths ask it: plugins by key, and nothing on
 *  screen. Any other method answers undefined.  */
function fake_graph(history)
{
    let plugins = [];
    const known = {
        rendered: true,
        getPlugins: () => plugins,
        setPlugins: (fn) => {
            plugins = (typeof fn === "function") ? fn(plugins) : fn;
        },
        getPluginInstance: (key) => (key === "history") ? history : {on() {}, off() {}},
        updatePlugin: () => {},
        getBehaviors: () => [],
        setBehaviors: () => {},
        getData: () => ({nodes: [], edges: [], combos: []}),
        getZoom: () => 1,
    };
    return new Proxy(known, {
        get: (t, k) => (k in t) ? t[k] : (() => undefined)
    });
}

let yuno = null;

beforeAll(() => {
    gobj_start_up(null, null, null, null, null, null, null);
    set_log_callback((level, msg) => {
        logged.push({level: String(level), msg: String(msg)});
    });
    register_c_timer();
    register_c_g6_nodes_tree();
    /*  The host: what the tree publishes lands here.  */
    const host_events = ["EV_UPDATE_NODE"];
    gclass_create(
        "C_TEST_GRAPH_HOST",
        host_events.map((e) => [e, 0]),
        [["ST_IDLE", host_events.map((e) => [e, (gobj, ev, kw) => {
            published.push({event: ev, kw: kw});
            return 0;
        }, null])]],
        {}, 0,
        [SDATA(data_type_t.DTP_STRING, "node_uuid", 0, "test-node-uuid", ""), SDATA_END()],
        {}, 0, 0, 0, 0
    );
    yuno = gobj_create_yuno("owed_yuno", "C_TEST_GRAPH_HOST", {});
});

beforeEach(() => {
    logged.length = 0;
    published.length = 0;
});

let seq = 0;

/*  A tree whose `users` arrangement the backend holds, in `mode`,
 *  with a Save button in its container and a history that has
 *  nothing to undo.  */
function build(mode)
{
    const $container = document.createElement("div");
    const tree = gobj_create_pure_child(`tree_${++seq}`, "C_G6_NODES_TREE",
        {$container: $container}, yuno);
    const listeners = [];
    const history = {
        undo: false,
        canUndo() {
            return this.undo;
        },
        canRedo: () => false,
        on: (ev, fn) => {
            listeners.push(fn);
        },
        clear() {
            this.undo = false;
        }
    };
    tree.priv.graph = fake_graph(history);
    tree.priv.graph_rendered = true;
    tree.priv.treedb_name = "treedb_x";
    tree.priv._graph_properties = {users: {nodes: {u1: {x: 10, y: 20}}}};
    tree.priv._saved_graph_properties = {users: {nodes: {u1: {x: 10, y: 20}}}};

    const $save = document.createElement("div");
    $save.className = "EV_SAVE_GRAPH";
    $save.setAttribute("disabled", "");
    $container.appendChild($save);

    gobj_send_event(tree, "EV_SET_OPERATION_MODE", {operation_mode: mode}, tree);
    return {
        tree,
        lit: () => !$save.hasAttribute("disabled"),
        history_changed: () => {
            for(const fn of listeners) {
                fn();
            }
        }
    };
}

function errors()
{
    return logged.filter((l) => l.level === "error").map((l) => l.msg);
}

describe("a refused __graphs__ write keeps the Save lit", () => {

    test("in edition: a history change does not put it out", () => {
        const g = build("edition");
        expect(g.lit()).toBe(false);

        gobj_send_event(g.tree, "EV_GRAPHS_WRITE_REFUSED", {topic: "users"}, g.tree);
        expect(g.lit()).toBe(true);

        g.history_changed();                /*  nothing to undo  */
        expect(g.lit()).toBe(true);

        gobj_send_event(g.tree, "EV_SET_OPERATION_MODE", {operation_mode: "edition"}, g.tree);
        expect(g.lit()).toBe(true);
        expect(errors()).toEqual([]);
    });

    test("heard in reading, it is shown on entering edition", () => {
        const g = build("reading");
        gobj_send_event(g.tree, "EV_GRAPHS_WRITE_REFUSED", {topic: "users"}, g.tree);

        gobj_send_event(g.tree, "EV_SET_OPERATION_MODE", {operation_mode: "edition"}, g.tree);
        expect(g.lit()).toBe(true);
        expect(errors()).toEqual([]);
    });

    test("the Save writes it again, and then the Save goes dark", () => {
        const g = build("edition");
        gobj_send_event(g.tree, "EV_GRAPHS_WRITE_REFUSED", {topic: "users"}, g.tree);

        gobj_send_event(g.tree, "EV_SAVE_GRAPH", {}, g.tree);
        const writes = published.filter((p) => p.event === "EV_UPDATE_NODE");
        expect(writes.map((w) => w.kw.record.id)).toEqual(["users"]);
        expect(g.lit()).toBe(false);

        g.history_changed();
        expect(g.lit()).toBe(false);
        expect(errors()).toEqual([]);
    });

    test("refused again after that Save: lit again", () => {
        const g = build("edition");
        gobj_send_event(g.tree, "EV_GRAPHS_WRITE_REFUSED", {topic: "users"}, g.tree);
        gobj_send_event(g.tree, "EV_SAVE_GRAPH", {}, g.tree);
        gobj_send_event(g.tree, "EV_GRAPHS_WRITE_REFUSED", {topic: "users"}, g.tree);

        g.history_changed();
        expect(g.lit()).toBe(true);
        expect(errors()).toEqual([]);
    });

    /*  Before gobj-ui 7.25.19 only a Save that planned the topic paid
     *  what was owed. Save #1 and Save #2 both write `users`, #1 is
     *  refused and its answer lands after #2's echo: the echo made the
     *  topic saved, so no Save planned it again, and the button stayed
     *  lit over nothing to write until a reload.  */
    test("an echo of the topic pays what was owed: the Save goes dark", () => {
        const g = build("edition");
        g.tree.priv.descs = {};
        g.tree.priv.__graphs__ = [];
        gobj_send_event(g.tree, "EV_GRAPHS_WRITE_REFUSED", {topic: "users"}, g.tree);
        expect(g.lit()).toBe(true);

        gobj_send_event(g.tree, "EV_NODE_UPDATED", {
            topic_name: "__graphs__",
            node: {id: "users", topic: "users", active: true,
                properties: {nodes: {u1: {x: 30, y: 40}}}}
        }, g.tree);
        expect(g.lit()).toBe(false);

        gobj_send_event(g.tree, "EV_SAVE_GRAPH", {}, g.tree);
        expect(published.filter((p) => p.event === "EV_UPDATE_NODE")).toEqual([]);
        expect(errors()).toEqual([]);
    });

    test("an echo of ANOTHER topic leaves it owed", () => {
        const g = build("edition");
        g.tree.priv.descs = {};
        g.tree.priv.__graphs__ = [];
        gobj_send_event(g.tree, "EV_GRAPHS_WRITE_REFUSED", {topic: "users"}, g.tree);
        gobj_send_event(g.tree, "EV_NODE_UPDATED", {
            topic_name: "__graphs__",
            node: {id: "roles", topic: "roles", active: true, properties: {nodes: {}}}
        }, g.tree);
        expect(g.lit()).toBe(true);
        expect(errors()).toEqual([]);
    });

    test("a reload forgets it: the view holds what the backend holds", () => {
        const g = build("edition");
        gobj_send_event(g.tree, "EV_GRAPHS_WRITE_REFUSED", {topic: "users"}, g.tree);
        gobj_send_event(g.tree, "EV_CLEAR_DATA", {}, g.tree);
        /*  What the load does once the data is in again.  */
        gobj_send_event(g.tree, "EV_SET_OPERATION_MODE", {operation_mode: "edition"}, g.tree);
        expect(g.lit()).toBe(false);
        expect(errors()).toEqual([]);
    });
});

/*  A refusal is about the LOAD its write was sent from. Before gobj-ui
 *  7.25.20 it carried only the topic: Save, then Refresh, then the
 *  refusal landed and was applied to the FRESH load -- the Save lit
 *  over nothing changed, and pressing it wrote a record identical to
 *  what the backend holds.  */
describe("a refusal of an earlier load is not applied to the current one", () => {

    test("the write carries its load, and a refusal of it counts", () => {
        const g = build("edition");
        g.tree.priv._graph_properties.users.nodes.u1.x = 99;
        gobj_send_event(g.tree, "EV_SAVE_GRAPH", {}, g.tree);
        const [write] = published.filter((p) => p.event === "EV_UPDATE_NODE");
        expect(typeof write.kw.graphs_load).toBe("number");

        gobj_send_event(g.tree, "EV_GRAPHS_WRITE_REFUSED",
            {topic: "users", graphs_load: write.kw.graphs_load}, g.tree);
        expect(g.lit()).toBe(true);
        expect(g.tree.priv._saved_graph_properties.users).toBe(undefined);
        expect(errors()).toEqual([]);
    });

    test("Save, reload, then the refusal: ignored, and said", () => {
        const g = build("edition");
        g.tree.priv._graph_properties.users.nodes.u1.x = 99;
        gobj_send_event(g.tree, "EV_SAVE_GRAPH", {}, g.tree);
        const [write] = published.filter((p) => p.event === "EV_UPDATE_NODE");

        gobj_send_event(g.tree, "EV_CLEAR_DATA", {}, g.tree);
        /*  The reload brings what the backend holds.  */
        g.tree.priv._graph_properties = {users: {nodes: {u1: {x: 10, y: 20}}}};
        g.tree.priv._saved_graph_properties = {users: {nodes: {u1: {x: 10, y: 20}}}};
        gobj_send_event(g.tree, "EV_SET_OPERATION_MODE", {operation_mode: "edition"}, g.tree);
        logged.length = 0;

        gobj_send_event(g.tree, "EV_GRAPHS_WRITE_REFUSED",
            {topic: "users", graphs_load: write.kw.graphs_load}, g.tree);
        expect(g.lit()).toBe(false);
        expect(g.tree.priv._saved_graph_properties.users).toEqual({nodes: {u1: {x: 10, y: 20}}});
        expect(logged.map((l) => [l.level, l.msg.replace(/^\S+: /, "")])).toEqual([
            ["warning", "a refused write of the arrangement of 'users' belongs to an earlier load: ignored"]
        ]);
    });
});

/*  The FIRST record of a topic's arrangement arrives as a CREATE echo
 *  (from this browser or another). Before gobj-ui 7.25.20 it rebuilt
 *  every topic's saved copy from the live objects the view edits in
 *  place, so an unsaved change of ANOTHER topic counted as saved and
 *  the next Save did not write it.  */
describe("a __graphs__ create echo moves only its own topic", () => {

    test("an unsaved change of another topic stays unsaved", () => {
        const g = build("edition");
        g.tree.priv.descs = {};
        g.tree.priv.__graphs__ = [
            {id: "users", topic: "users", active: true,
                properties: g.tree.priv._graph_properties.users}
        ];
        /*  Edited in place, not saved.  */
        g.tree.priv._graph_properties.users.nodes.u1.x = 77;

        gobj_send_event(g.tree, "EV_NODE_CREATED", {
            topic_name: "__graphs__",
            node: {id: "roles", topic: "roles", active: true,
                properties: {nodes: {r1: {x: 1, y: 2}}}}
        }, g.tree);

        expect(g.tree.priv._saved_graph_properties.users).toEqual({nodes: {u1: {x: 10, y: 20}}});
        expect(g.tree.priv._saved_graph_properties.roles).toEqual({nodes: {r1: {x: 1, y: 2}}});

        gobj_send_event(g.tree, "EV_SAVE_GRAPH", {}, g.tree);
        const writes = published.filter((p) => p.event === "EV_UPDATE_NODE");
        expect(writes.map((w) => w.kw.record.id)).toEqual(["users"]);
        expect(errors()).toEqual([]);
    });
});
