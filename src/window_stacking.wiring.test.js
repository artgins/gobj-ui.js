/***********************************************************************
 *          window_stacking.wiring.test.js
 *
 *      Every window the library opens lives in the shell's WINDOW layer,
 *      and every window -- docked or not -- is ordered by ONE number
 *      (yui_shell_raise_window).
 *
 *      Up to 7.26.34 four places of the library put their windows in
 *      the shell's POPUP layer -- the site map, the raw json of the
 *      treedb graph and of the treedb topics, the gclass viewer opened
 *      from no window, the json of a treedb topic form: above the
 *      drawer, in the way of the toolbar's dropdowns (which opened
 *      behind them where they met). And there were two orders: the
 *      dock raised its windows to a counter of its own, a window with
 *      no dock sat at 3 and was moved to the end of its parent to rise,
 *      so a window opened later without a dock opened UNDER any docked
 *      one, and no click brought it up.
 *
 *      The real gclasses on a document double, with doubles of what
 *      draws (Tabulator, the treedb graph's engine) and of a backend.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {describe, test, expect, beforeAll, beforeEach, vi} from "vitest";
import {readFileSync} from "node:fs";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";
import {install_dom_double} from "../test/dom_double.js";

install_dom_double();

/*  A laptop: a json opens in a window, not in a phone's sheet.  */
globalThis.innerWidth = 1280;
if(globalThis.window) {
    globalThis.window.innerWidth = 1280;
}

if(typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    };
}
if(typeof globalThis.matchMedia === "undefined") {
    globalThis.matchMedia = () => ({matches: false, addEventListener() {}, removeEventListener() {}});
}

vi.mock("tabulator-tables", () => {
    class FakeTabulator {
        constructor($el, settings) {
            this.element = $el;
            this.options = settings;
            this.externalEvents = {events: {}};
            return new Proxy(this, {
                get(target, prop) {
                    if(prop in target) {
                        return target[prop];
                    }
                    return () => [];
                }
            });
        }
        on(ev, fn) {
            (this.externalEvents.events[ev] = this.externalEvents.events[ev] || []).push(fn);
        }
        off(ev) {
            delete this.externalEvents.events[ev];
        }
        destroy() {}
    }
    return {TabulatorFull: FakeTabulator, Tabulator: FakeTabulator};
});

const {
    SDATA, SDATA_END, data_type_t, gclass_create, gobj_write_attr,
    gobj_start_up, gobj_create_yuno, gobj_create, gobj_create_service, gobj_create_pure_child,
    gobj_start, gobj_read_attr, gobj_read_pointer_attr, gobj_subscribe_event, gobj_send_event,
    gobj_change_state, gobj_full_name, set_log_callback,
} = await import("@yuneta/gobj-js");
const {register_c_yui_shell, yui_shell_window_layer} = await import("./c_yui_shell.js");
const {register_c_yui_nav} = await import("./c_yui_nav.js");
const {register_c_yui_window} = await import("./c_yui_window.js");
const {register_c_yui_window_manager} = await import("./c_yui_window_manager.js");
const {register_c_yui_json} = await import("./c_yui_json.js");
const {register_c_yui_gclass} = await import("./c_yui_gclass.js");
const {register_c_yui_treedb_topics} = await import("./c_yui_treedb_topics.js");
const {register_c_yui_treedb_graph} = await import("./c_yui_treedb_graph.js");
const {register_c_yui_treedb_topic_with_form} = await import("./c_yui_treedb_topic_with_form.js");
const {yui_shell_show_route_map} = await import("./shell_route_map.js");
const {open_gclass_view} = await import("./yui_gclass_view.js");

const SRC = dirname(fileURLToPath(import.meta.url));
const logged = [];
let yuno = null;
let shell = null;
let seq = 0;

beforeAll(async () => {
    const i18next = (await import("i18next")).default;
    await i18next.init({lng: "en", resources: {}});
    gobj_start_up(null, null, null, null, null, null, null);
    set_log_callback((level, msg) => {
        logged.push({level: String(level), msg: String(msg)});
    });
    gclass_create("C_TEST_STACK_HOST", [], [["ST_IDLE", []]], {}, 0, [SDATA_END()], {}, 0, 0, 0, 0);
    gclass_create(
        "C_TEST_STACK_VIEW", [], [["ST_IDLE", []]], {
            mt_create: (gobj) => {
                gobj_write_attr(gobj, "$container", document.createElement("div"));
            }
        }, 0, [
            SDATA(data_type_t.DTP_POINTER, "$container", 0, null, "view root"),
            SDATA_END()
        ], {}, 0, 0, 0, 0
    );
    gclass_create(
        "C_TEST_STACK_APP",
        [["EV_RECORD_WRITTEN", 0], ["EV_TOPIC_SELECTED", 0], ["EV_OPERATION_MODE_CHANGED", 0]],
        [["ST_IDLE", [
            ["EV_RECORD_WRITTEN", () => 0, null],
            ["EV_TOPIC_SELECTED", () => 0, null],
            ["EV_OPERATION_MODE_CHANGED", () => 0, null],
        ]]],
        {}, 0, [SDATA_END()], {}, 0, 0, 0, 0
    );
    /*  A backend in session that answers nothing.  */
    gclass_create("C_TEST_STACK_REMOTE", [], [["ST_SESSION", []]],
        {mt_command_parser: () => null}, 0, [SDATA_END()], {}, 0, 0, 0, 0);
    /*  The treedb graph's engine, silent: this is about its window.  */
    const ENGINE_EVENTS = [
        "EV_DESCS", "EV_CLEAR_DATA", "EV_LOAD_DATA", "EV_NODE_CREATED",
        "EV_NODE_UPDATED", "EV_NODE_DELETED", "EV_GRAPHS_WRITE_REFUSED",
        "EV_SHOW", "EV_HIDE", "EV_RESIZE", "EV_THEME", "EV_LANGUAGE_CHANGED",
        "EV_SET_OPERATION_MODE", "EV_SET_LAYOUT"
    ];
    gclass_create(
        "C_G6_NODES_TREE",
        ENGINE_EVENTS.map((e) => [e, 0]).concat([["EV_UPDATE_NODE", 2]]),
        [["ST_IDLE", ENGINE_EVENTS.map((e) => [e, () => 0, null])]],
        {
            mt_create: (gobj) => {
                const subscriber = gobj_read_pointer_attr(gobj, "subscriber");
                if(subscriber) {
                    gobj_subscribe_event(gobj, null, {}, subscriber);
                }
            }
        },
        0,
        [
            SDATA(data_type_t.DTP_POINTER, "subscriber", 0, null, ""),
            SDATA(data_type_t.DTP_POINTER, "$container", 0, null, ""),
            SDATA(data_type_t.DTP_POINTER, "gobj_remote_yuno", 0, null, ""),
            SDATA(data_type_t.DTP_STRING, "treedb_name", 0, "", ""),
            SDATA(data_type_t.DTP_JSON, "layout_names", 0, "[]", ""),
            SDATA(data_type_t.DTP_STRING, "layout", 0, "", ""),
            SDATA_END()
        ],
        {}, 0, 0, 0, 0
    );
    register_c_yui_shell();
    register_c_yui_nav();
    register_c_yui_window();
    register_c_yui_window_manager();
    register_c_yui_json();
    register_c_yui_gclass();
    register_c_yui_treedb_topics();
    register_c_yui_treedb_graph();
    register_c_yui_treedb_topic_with_form();
    yuno = gobj_create_yuno("stacking_yuno", "C_TEST_STACK_HOST", {});
    gobj_start(yuno);

    shell = gobj_create("stack_shell", "C_YUI_SHELL", {
        config: {
            shell: {
                zones: {left: {host: "menu.primary"}, center: {host: "stage.main"}},
                stages: {main: {zone: "center", default_route: "/home"}}
            },
            menu: {primary: {items: [
                {id: "home", name: "home", route: "/home",
                    target: {stage: "main", gclass: "C_TEST_STACK_VIEW", kw: {}}}
            ]}}
        },
        use_hash: false
    }, yuno);
    gobj_start(shell);
});

beforeEach(() => {
    logged.length = 0;
});

function errors()
{
    return logged.filter((l) => l.level === "error").map((l) => l.msg);
}

/*  Identity, asked as a boolean (a failing toBe() over a DOM double
 *  makes vitest pretty-print it, and the double cannot be printed).  */
function in_window_layer(win)
{
    return gobj_read_attr(win, "$container").parentNode === yui_shell_window_layer(shell);
}

function z_of(win)
{
    return Number(gobj_read_attr(win, "$container").style.zIndex);
}

function press(win)
{
    gobj_read_attr(win, "$container").dispatchEvent({type: "pointerdown"});
}

function remote()
{
    const r = gobj_create_service(`stack_remote${++seq}`, "C_TEST_STACK_REMOTE", {}, yuno);
    gobj_change_state(r, "ST_SESSION");
    return r;
}

describe("every window the library opens lives in the window layer", () => {
    test("the site map", () => {
        const win = yui_shell_show_route_map(shell);
        expect(!!win).toBe(true);
        expect(in_window_layer(win)).toBe(true);
        yui_shell_show_route_map(shell);     // the second call closes it
    });

    test("the raw json of the treedb topics", () => {
        const app = gobj_create(`stack_app${++seq}`, "C_TEST_STACK_APP", {}, shell);
        const topics = gobj_create_service(`stack_topics${seq}`, "C_YUI_TREEDB_TOPICS", {
            treedb_name: "treedb_test",
            gobj_remote_yuno: remote(),
            subscriber: app
        }, app);
        gobj_start(topics);
        gobj_send_event(topics, "EV_OPEN_JSON", {}, topics);
        const win = topics.priv.json_win;
        expect(!!win).toBe(true);
        expect(in_window_layer(win)).toBe(true);
    });

    test("the raw json of the treedb graph", () => {
        const app = gobj_create(`stack_app${++seq}`, "C_TEST_STACK_APP", {}, shell);
        const graph = gobj_create_service(`stack_graph${seq}`, "C_YUI_TREEDB_GRAPH", {
            treedb_name: "treedb_test",
            gobj_remote_yuno: remote(),
            subscriber: app
        }, app);
        gobj_send_event(graph, "EV_OPEN_JSON", {}, graph);
        const win = graph.priv.json_win;
        expect(!!win).toBe(true);
        expect(in_window_layer(win)).toBe(true);
    });

    test("the gclass viewer opened from no window", () => {
        const host = gobj_create(`stack_host${++seq}`, "C_TEST_STACK_VIEW", {}, shell);
        const handle = open_gclass_view(host, "C_YUI_WINDOW", {});
        expect(!!(handle && handle.win)).toBe(true);
        expect(in_window_layer(handle.win)).toBe(true);
    });

    test("the json of a treedb topic form (its schema)", () => {
        const app = gobj_create(`stack_app${++seq}`, "C_TEST_STACK_APP", {}, shell);
        const form = gobj_create_service(`stack_form${seq}`, "C_YUI_TREEDB_TOPIC_WITH_FORM", {
            treedb_name: "treedb_test",
            topic_name: "users",
            desc: {id: "users", pkey: "id", cols: [
                {id: "id", header: "Id", type: "string", flag: ["persistent", "required"]}
            ]}
        }, app);
        gobj_start(form);
        gobj_send_event(form, "EV_SHOW_SCHEMA", {}, form);
        const win = form.priv.schema_win;
        expect(!!win).toBe(true);
        expect(in_window_layer(win)).toBe(true);
    });
});

describe("one z-order for every window, docked or not", () => {
    test("a window opened later is on top; a press brings either up", () => {
        const dock = gobj_create_service(`stack_dock${++seq}`, "C_YUI_WINDOW_MANAGER", {}, yuno);
        gobj_start(dock);
        const docked = gobj_create_service(`stack_docked${seq}`, "C_YUI_WINDOW",
            {header: "d", body: ["div", {}, "d"], manager: dock}, yuno);
        gobj_start(docked);
        const floating = gobj_create_service(`stack_floating${seq}`, "C_YUI_WINDOW",
            {header: "f", body: ["div", {}, "f"]}, yuno);
        gobj_start(floating);

        /*  Both in the window layer, the later one on top -- it opened
         *  UNDER the docked one, whatever came first.  */
        expect(in_window_layer(docked) && in_window_layer(floating)).toBe(true);
        expect(z_of(floating) > z_of(docked)).toBe(true);

        /*  A press on the docked one: the dock raises it, on the same
         *  counter.  */
        press(docked);
        expect(z_of(docked) > z_of(floating)).toBe(true);

        /*  A press on the floating one brings it up again: it crosses
         *  the FSM as EV_SHOW.  */
        press(floating);
        expect(z_of(floating) > z_of(docked)).toBe(true);

        /*  And the dock's chip, the same.  */
        gobj_send_event(dock, "EV_FOCUS_WINDOW", {window: gobj_full_name(docked)}, docked);
        expect(z_of(docked) > z_of(floating)).toBe(true);
        expect(errors()).toEqual([]);
    });
});

describe("the layers, as the stylesheet stacks them", () => {
    /*  CSS read as text: the double has no layout. Every window is in the
     *  window layer, inside the overlay layer; so the drawer (in the
     *  overlay, above the window layer), the toolbar's dropdowns (popup
     *  layer), the dialogs (modal) and the toasts (notification) are all
     *  above every window, whatever number it takes.  */
    test("the window layer is under the drawer, and every layer above it is above the overlay", () => {
        const css = readFileSync(join(SRC, "c_yui_shell.css"), "utf8");
        const z = (selector) => {
            const m = css.match(new RegExp(selector + "\\s*\\{([^}]*)\\}"));
            const v = m && m[1].match(/z-index:\s*(\d+)/);
            return v ? Number(v[1]) : NaN;
        };
        expect(z("\\.yui-layer > \\.yui-window-layer") < z("\\.yui-drawer")).toBe(true);
        const overlay = z("\\.yui-layer-overlay");
        for(const layer of ["popup", "modal", "notification"]) {
            expect(z(`\\.yui-layer-${layer}`) > overlay, layer).toBe(true);
        }
    });
});
