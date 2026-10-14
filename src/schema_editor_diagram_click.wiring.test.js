/***********************************************************************
 *          schema_editor_diagram_click.wiring.test.js
 *
 *      A click on a topic of C_YUI_SCHEMA_EDITOR's drawing opens that
 *      topic's columns -- and leaves the drawing, which the editor takes
 *      down. It took it down INSIDE the click: the drawing
 *      (C_YUI_TREEDB_SCHEMA) publishes EV_NODE_CLICK from the action of
 *      G6's own node-click event, and the editor's answer stopped and
 *      destroyed it there -- the gobj under its own publication, and its
 *      G6 graph under G6's own event dispatch, which goes on when the
 *      handler returns.
 *
 *      A subscriber must not destroy the tree of its publisher
 *      synchronously (the C kernel says it since 7.26.10, gobj-js since
 *      7.26.22: "Destroying a gobj while its tree is publishing"). The
 *      screen changes at once, as before; the drawing it leaves is
 *      detached at once and destroyed on the next turn.
 *
 *      Driven through the real C_YUI_SCHEMA_EDITOR and the real
 *      C_YUI_TREEDB_SCHEMA, on a document double, with a G6 double that
 *      remembers whether it was destroyed while it was dispatching an
 *      event of its own.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {describe, test, expect, beforeAll, beforeEach, vi} from "vitest";
import {install_dom_double} from "../test/dom_double.js";

install_dom_double();

if(typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class {
        observe() {
        }
        unobserve() {
        }
        disconnect() {
        }
    };
}

vi.mock("./shell_modals.js", () => ({
    yui_shell_show_error: () => ({close() {}}),
    yui_shell_show_info: () => ({close() {}}),
    yui_shell_show_modal: () => ({close() {}}),
    yui_shell_confirm_danger: () => new Promise(() => {}),
}));

const graphs = vi.hoisted(() => []);
vi.mock("@antv/g6", async (importOriginal) => {
    const real = await importOriginal();
    class FakeGraph {
        constructor(options) {
            this.options = options;
            this.handlers = {};
            this.emitting = 0;
            this.destroyed = false;
            this.destroyed_while_emitting = false;
            graphs.push(this);
            return new Proxy(this, {
                get: (t, k) => (k in t) ? t[k] : (() => undefined),
            });
        }
        render() {
            return Promise.resolve();
        }
        on(name, fn) {
            (this.handlers[name] = this.handlers[name] || []).push(fn);
        }
        emit(name, ev) {
            this.emitting++;
            try {
                for(const fn of (this.handlers[name] || [])) {
                    fn(ev);
                }
            } finally {
                this.emitting--;
            }
        }
        getZoom() {
            return 1;
        }
        getData() {
            return {nodes: [], edges: [], combos: []};
        }
        getNodeData() {
            return [];
        }
        getEdgeData() {
            return [];
        }
        getPlugins() {
            return [];
        }
        getBehaviors() {
            return [];
        }
        getOptions() {
            return {behaviors: []};
        }
        getCanvas() {
            return {getLayers: () => ({}), getContainer: () => null};
        }
        draw() {
            return Promise.resolve();
        }
        destroy() {
            this.destroyed = true;
            if(this.emitting > 0) {
                this.destroyed_while_emitting = true;
            }
        }
    }
    return {...real, Graph: FakeGraph};
});

const {
    SDATA_END,
    gclass_create,
    gobj_start_up, gobj_create_yuno, gobj_create, gobj_create_service,
    gobj_start, gobj_send_event, gobj_read_attr,
    gobj_change_state, gobj_current_state, gobj_is_destroying,
    set_log_callback,
} = await import("@yuneta/gobj-js");
const {NodeEvent} = await import("@antv/g6");
const {register_c_yui_treedb_schema} = await import("./c_yui_treedb_schema.js");
const {register_c_yui_schema_editor} = await import("./c_yui_schema_editor.js");

const logged = [];
const commands = [];

const RECORDS = {
    treedbs: [{id: "db", schema_version: 4}],
    topics: [
        {id: "db.users", value: "users", order: 1, pkey: "id", topic_version: 2,
         treedbs: ["treedbs^db^topics"]},
    ],
    cols: [
        {id: "db.users.id", value: "id", order: 1, type: "string",
         flag: ["persistent", "required"], topics: ["topics^db.users^cols"]},
    ],
};

let yuno = null;

beforeAll(async () => {
    const i18next = (await import("i18next")).default;
    await i18next.init({lng: "en", resources: {en: {translation: {}}}});
    gobj_start_up(null, null, null, null, null, null, null);
    set_log_callback((level, msg) => {
        logged.push({level: String(level), msg: String(msg)});
    });
    gclass_create("C_TEST_HOST", [], [["ST_IDLE", []]], {}, 0, [SDATA_END()], {}, 0, 0, 0, 0);
    /*  The editor's host hears what the editor publishes.  */
    const EDITOR_OUT = ["EV_POSITION_CHANGED", "EV_RECORD_WRITTEN", "EV_SCHEMA_CHECKED"];
    gclass_create(
        "C_TEST_EDITOR_HOST",
        EDITOR_OUT.map((ev) => [ev, 0]),
        [["ST_IDLE", EDITOR_OUT.map((ev) => [ev, () => 0, null])]],
        {}, 0, [SDATA_END()], {}, 0, 0, 0, 0
    );
    gclass_create(
        "C_TEST_REMOTE",
        [],
        [["ST_DISCONNECTED", []], ["ST_SESSION", []]],
        {mt_command_parser: (gobj, command, kw, src) => {
            commands.push({command, kw, src});
            return null;
        }},
        0, [SDATA_END()], {}, 0, 0, 0, 0
    );
    register_c_yui_treedb_schema();
    register_c_yui_schema_editor();
    yuno = gobj_create_yuno("diagram_click_yuno", "C_TEST_HOST", {});
    gobj_start(yuno);
});

beforeEach(() => {
    logged.length = 0;
    commands.length = 0;
});

function answer_the_load(editor, remote)
{
    const asked = commands.splice(0).filter((c) => c.command === "nodes");
    for(const c of asked) {
        gobj_send_event(editor, "EV_MT_COMMAND_ANSWER", {
            result: 0,
            comment: "",
            data: JSON.parse(JSON.stringify(RECORDS[c.kw.topic_name])),
            __md_iev__: {command_stack: [{command: c.command, kw: c.kw}]}
        }, remote);
    }
    return asked.length;
}

function errors()
{
    return logged.filter((l) => l.level === "error").map((l) => l.msg);
}

const turn = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("a topic clicked in the editor's drawing", () => {

    test("opens its columns at once; the drawing goes on the next turn, not under the click", async () => {
        const remote = gobj_create_service("click_remote", "C_TEST_REMOTE", {}, yuno);
        gobj_change_state(remote, "ST_SESSION");
        const host = gobj_create("click_host", "C_TEST_EDITOR_HOST", {}, yuno);
        const editor = gobj_create("click_editor", "C_YUI_SCHEMA_EDITOR", {
            gobj_remote_yuno: remote,
            treedb_name: "treedb_system_schema",
            base_route: "/schemas"
        }, host);
        gobj_start(editor);
        gobj_send_event(editor, "EV_TRANSPORT_STATE", {connected: true}, host);
        expect(answer_the_load(editor, remote)).toBe(3);
        gobj_send_event(editor, "EV_SHOW", {subpath: "db/diagram"}, host);
        expect(gobj_current_state(editor)).toBe("ST_DIAGRAM");

        const diagram = editor.priv.diagram_gobj;
        expect(diagram).toBeTruthy();
        const graph = graphs[graphs.length - 1];
        expect(graph).toBeTruthy();

        graph.emit(NodeEvent.CLICK, {target: {id: "users"}});

        /*  The screen changed in the click...  */
        expect(gobj_current_state(editor)).toBe("ST_COLUMNS");
        const $container = gobj_read_attr(editor, "$container");
        expect($container.querySelector(".SCHEMA_BODY .SCHEMA_COLUMNS")).toBeTruthy();
        /*  ...and the drawing was not taken down under it.  */
        expect(graph.destroyed_while_emitting).toBe(false);
        expect(gobj_is_destroying(diagram)).toBe(false);

        await turn();
        expect(gobj_is_destroying(diagram)).toBe(true);
        expect(graph.destroyed).toBe(true);
        expect(editor.priv.diagram_gobj).toBe(null);
        expect(errors()).toEqual([]);
    });

    test("a drawing left on a stop goes with the stop", async () => {
        const remote = gobj_create_service("stop_remote", "C_TEST_REMOTE", {}, yuno);
        gobj_change_state(remote, "ST_SESSION");
        const host = gobj_create("stop_host", "C_TEST_EDITOR_HOST", {}, yuno);
        const editor = gobj_create("stop_editor", "C_YUI_SCHEMA_EDITOR", {
            gobj_remote_yuno: remote,
            treedb_name: "treedb_system_schema",
            base_route: "/schemas"
        }, host);
        gobj_start(editor);
        gobj_send_event(editor, "EV_TRANSPORT_STATE", {connected: true}, host);
        answer_the_load(editor, remote);
        gobj_send_event(editor, "EV_SHOW", {subpath: "db/diagram"}, host);
        const diagram = editor.priv.diagram_gobj;
        const graph = graphs[graphs.length - 1];

        graph.emit(NodeEvent.CLICK, {target: {id: "users"}});
        expect(gobj_is_destroying(diagram)).toBe(false);

        /*  Stopped before the next turn: nothing of the drawing is left
         *  for a turn that finds the editor stopped.  */
        gobj_send_event(editor, "EV_SHOW", {subpath: "db/diagram"}, host);
        const second = editor.priv.diagram_gobj;
        expect(second).toBeTruthy();
        expect(second).not.toBe(diagram);
        const {gobj_stop} = await import("@yuneta/gobj-js");
        gobj_stop(editor);
        expect(gobj_is_destroying(diagram)).toBe(true);
        expect(gobj_is_destroying(second)).toBe(true);

        await turn();
        expect(errors()).toEqual([]);
    });
});
