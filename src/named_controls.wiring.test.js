/***********************************************************************
 *          named_controls.wiring.test.js
 *
 *      Controls the library drew without a name:
 *      each carries a `title` AND an `aria-label` now, through t() and
 *      with its key where the key is the library's, as every control.
 *
 *        - the find boxes of C_YUI_JSON, C_YUI_JSON_GRAPH,
 *          C_YUI_GOBJ_TREE_JS and C_YUI_GCLASS (an aria-label, no title);
 *        - the buttons of a file field (a title only after a pass of
 *          refresh_language());
 *        - a topic tab of C_YUI_TREEDB_TOPICS (only its text);
 *        - a link of the site map (named by ALL its content: label,
 *          route, gclass, event);
 *        - a crumb (no title; no name without a `name`) and a card of
 *          C_YUI_NAV (a title only with a `tooltip`);
 *        - a chip of the dock (a role=button holding its ✕ button,
 *          named by all its content, "close" included): two sibling
 *          buttons now, each named;
 *        - the ✕ of an option of a Tom Select ("Remove", in English,
 *          title only, out of the keyboard's reach);
 *        - an item of C_YUI_NAV without a `name`, in every layout: its
 *          raw id was its aria-label, with no key and no title.
 *          Its id is its KEY now, or its
 *          `aria_label` when it declares one.
 *
 *      The real gclasses on a document double; G6 and Tom Select as
 *      doubles (what is checked is built before either draws).
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

/*  G6: the views build their toolbar before any graph draws.  */
vi.mock("@antv/g6", async (importOriginal) => {
    const real = await importOriginal();
    class FakeGraph {
        constructor(options) {
            this.options = options;
            return new Proxy(this, {
                get: (t, k) => (k in t) ? t[k] : (() => undefined),
            });
        }
        render() {
            return Promise.resolve();
        }
        draw() {
            return Promise.resolve();
        }
        on() {
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
        destroy() {
        }
    }
    return {...real, Graph: FakeGraph};
});

/*  Tabulator: the topic forms build one; nothing here reads a table,
 *  and the real one lays its columns out with DOM the double lacks.  */
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
        destroy() {
        }
    }
    return {TabulatorFull: FakeTabulator, Tabulator: FakeTabulator};
});

/*  Tom Select: keeps the settings it was built with.  */
const selects = vi.hoisted(() => []);
vi.mock("tom-select", () => ({
    default: class FakeTomSelect {
        constructor(el, settings) {
            this.el = el;
            this.settings = settings;
            selects.push(this);
        }
        on() {
        }
        disable() {
        }
        enable() {
        }
        getValue() {
            return [];
        }
        clear() {
        }
        setValue() {
        }
        addOption() {
        }
        destroy() {
        }
    }
}));

const {
    SDATA, SDATA_END, data_type_t, gclass_create, gobj_write_attr,
    gobj_start_up, gobj_create_yuno, gobj_create, gobj_create_pure_child, gobj_create_service,
    gobj_start, gobj_read_attr, gobj_send_event, gobj_change_state, gobj_current_state,
    gobj_is_destroying, set_log_callback, register_c_timer, refresh_language,
} = await import("@yuneta/gobj-js");
const {register_c_yui_shell, yui_shell_navigate} = await import("./c_yui_shell.js");
const {register_c_yui_nav} = await import("./c_yui_nav.js");
const {register_c_yui_window} = await import("./c_yui_window.js");
const {register_c_yui_window_manager} = await import("./c_yui_window_manager.js");
const {register_c_yui_json} = await import("./c_yui_json.js");
const {register_c_yui_json_graph} = await import("./c_yui_json_graph.js");
const {register_c_yui_gobj_tree_js} = await import("./c_yui_gobj_tree_js.js");
const {register_c_yui_form} = await import("./c_yui_form.js");
const {register_c_yui_treedb_topics} = await import("./c_yui_treedb_topics.js");
const {register_c_yui_treedb_topic_with_form} = await import("./c_yui_treedb_topic_with_form.js");
const {register_c_yui_gclass} = await import("./c_yui_gclass.js");
const {yui_file_control} = await import("./yui_file_field.js");
const {yui_shell_show_route_map} = await import("./shell_route_map.js");

const logged = [];
let yuno = null;
let seq = 0;

beforeAll(async () => {
    const i18next = (await import("i18next")).default;
    await i18next.init({lng: "en", resources: {}});
    gobj_start_up(null, null, null, null, null, null, null);
    set_log_callback((level, msg) => {
        logged.push({level: String(level), msg: String(msg)});
    });
    register_c_timer();
    gclass_create("C_TEST_NAMED_HOST", [], [["ST_IDLE", []]], {}, 0, [SDATA_END()], {}, 0, 0, 0, 0);
    gclass_create(
        "C_TEST_NAMED_APP",
        [["EV_RECORD_CHANGED", 0], ["EV_SAVE_RECORD", 0],
         ["EV_RECORD_WRITTEN", 0], ["EV_TOPIC_SELECTED", 0], ["EV_OPERATION_MODE_CHANGED", 0]],
        [["ST_IDLE", [
            ["EV_RECORD_CHANGED", () => 0, null],
            ["EV_SAVE_RECORD", () => 0, null],
            ["EV_RECORD_WRITTEN", () => 0, null],
            ["EV_TOPIC_SELECTED", () => 0, null],
            ["EV_OPERATION_MODE_CHANGED", () => 0, null],
        ]]],
        {}, 0, [SDATA_END()], {}, 0, 0, 0, 0
    );
    gclass_create(
        "C_TEST_NAMED_VIEW", [], [["ST_IDLE", []]], {
            mt_create: (gobj) => {
                gobj_write_attr(gobj, "$container", document.createElement("div"));
            }
        }, 0, [
            SDATA(data_type_t.DTP_POINTER, "$container", 0, null, "view root"),
            SDATA_END()
        ], {}, 0, 0, 0, 0
    );
    gclass_create(
        "C_TEST_NAMED_REMOTE",
        [],
        [["ST_SESSION", []]],
        {mt_command_parser: () => null},
        0, [SDATA_END()], {}, 0, 0, 0, 0
    );
    register_c_yui_shell();
    register_c_yui_nav();
    register_c_yui_window();
    register_c_yui_window_manager();
    register_c_yui_json();
    register_c_yui_json_graph();
    register_c_yui_gobj_tree_js();
    register_c_yui_form();
    register_c_yui_treedb_topics();
    register_c_yui_treedb_topic_with_form();
    register_c_yui_gclass();
    yuno = gobj_create_yuno("named_controls_yuno", "C_TEST_NAMED_HOST", {});
    gobj_start(yuno);
});

beforeEach(() => {
    logged.length = 0;
    selects.length = 0;
});

function errors()
{
    return logged.filter((l) => l.level === "error" || l.level === "warning").map((l) => l.msg);
}

/*  title and aria-label, both, and the key of each when it is `key`.  */
function expect_named($el, key)
{
    expect(!!$el, "the control is drawn").toBe(true);
    expect($el.getAttribute("title")).toBe(key);
    expect($el.getAttribute("aria-label")).toBe(key);
    expect($el.getAttribute("data-i18n-title")).toBe(key);
    expect($el.getAttribute("data-i18n-aria-label")).toBe(key);
}

describe("the find boxes", () => {
    test("of the JSON viewer", () => {
        const jv = gobj_create_pure_child(`jv${++seq}`, "C_YUI_JSON", {json_data: {a: 1}}, yuno);
        expect_named(gobj_read_attr(jv, "$container").querySelector(".JSON_SEARCH"), "search");
    });

    test("of the JSON graph", () => {
        const g = gobj_create_pure_child(`jg${++seq}`, "C_YUI_JSON_GRAPH",
            {$container: document.createElement("div"), json_data: {a: 1}}, yuno);
        expect_named(gobj_read_attr(g, "$container").querySelector(".JSON_GRAPH_FIND_INPUT"), "search");
    });

    test("of the gobj tree", () => {
        const g = gobj_create_pure_child(`gt${++seq}`, "C_YUI_GOBJ_TREE_JS",
            {$container: document.createElement("div")}, yuno);
        expect_named(gobj_read_attr(g, "$container").querySelector(".GOBJ_TREE_FIND_INPUT"), "search");
    });

    test("of the gclass view", () => {
        const v = gobj_create(`gc${++seq}`, "C_YUI_GCLASS", {
            description: {id: "C_X", gcflag: [], attrs: [], commands: [],
                          gclass_methods: [], internal_methods: [],
                          FSM: {events: [], states: {}}},
            current_state: "ST_IDLE",
        }, yuno);
        gobj_start(v);
        expect_named(gobj_read_attr(v, "$container").querySelector(".GCLASS_SEARCH"), "search");
    });
});

describe("the buttons of a file field", () => {
    test("carry their title where they are built, not only after a translation pass", () => {
        const app = gobj_create_pure_child(`fapp${++seq}`, "C_TEST_NAMED_APP", {}, yuno);
        const file = yui_file_control(app, {name: "logo", value: "", readonly: false});
        expect_named(file.$control.querySelector(".FILE_PICK"), "choose a file");
        expect_named(file.$control.querySelector(".FILE_CLEAR"), "remove the file");
    });
});

describe("a topic tab of the treedb view", () => {
    test("carries a title and an aria-label, with the topic as key", () => {
        const remote = gobj_create_service(`tremote${++seq}`, "C_TEST_NAMED_REMOTE", {}, yuno);
        gobj_change_state(remote, "ST_SESSION");
        expect(gobj_current_state(remote)).toBe("ST_SESSION");
        const host = gobj_create(`thost${seq}`, "C_TEST_NAMED_APP", {}, yuno);
        const topics = gobj_create_service(`ttopics${seq}`, "C_YUI_TREEDB_TOPICS", {
            treedb_name: "treedb_test",
            gobj_remote_yuno: remote,
            subscriber: host
        }, host);
        gobj_start(topics);

        /*  The backend's answer to `descs`: one topic, one tab.  */
        gobj_send_event(topics, "EV_MT_COMMAND_ANSWER", {
            result: 0, comment: "",
            data: {users: {topic_name: "users", pkey: "id", cols: [
                {id: "id", header: "Id", type: "string", flag: ["persistent", "required"]}
            ]}},
            __md_iev__: {command_stack: [{command: "descs", kw: {}}]}
        }, remote);

        const $tab = gobj_read_attr(topics, "$container").querySelector(`a[href="ttopics${seq}?users"]`);
        expect_named($tab, "users");
    });
});

describe("a link of the site map", () => {
    test("is named by its label, and says where the reader is", () => {
        const shell = gobj_create(`rshell${++seq}`, "C_YUI_SHELL", {
            config: {
                shell: {
                    zones: {left: {host: "menu.primary"}, center: {host: "stage.main"}},
                    stages: {main: {zone: "center", default_route: "/home"}}
                },
                menu: {primary: {items: [
                    {id: "home", name: "home", icon: "yi-house", route: "/home",
                        target: {stage: "main", gclass: "C_TEST_NAMED_VIEW", kw: {}}},
                    {id: "devices", name: "devices", route: "/devices",
                        target: {stage: "main", gclass: "C_TEST_NAMED_VIEW", kw: {}}}
                ]}}
            },
            use_hash: false
        }, yuno);
        gobj_start(shell);
        logged.length = 0;

        const win = yui_shell_show_route_map(shell);
        expect(!!win).toBe(true);
        const $body = gobj_read_attr(win, "$container");
        const $link = $body.querySelector('.ROUTEMAP_LINK[href="#/devices"]');
        expect(!!$link).toBe(true);
        expect($link.getAttribute("aria-label")).toBe("devices");
        expect($link.getAttribute("data-i18n-aria-label")).toBe("devices");
        expect($link.getAttribute("title")).toBe("/devices");          // the route: data
        expect($body.querySelector(".ROUTEMAP_ICON i").getAttribute("aria-hidden")).toBe("true");
        /*  The shell rests on /home: that row is "you are here".  */
        const $here = $body.querySelector(".ROUTEMAP_LINK.ROUTEMAP_CURRENT");
        expect(!!$here).toBe(true);
        expect($here.getAttribute("href")).toBe("#/home");
        expect($here.getAttribute("aria-current")).toBe("page");
        expect($link.getAttribute("aria-current")).toBe(null);
    });

    /*  One rule names an item everywhere: up to
     *  7.26.41 a row was labelled `name || wordmark || id || route`, so an
     *  entry that declares only an `aria_label` read its id in the map, the
     *  language button "ES/EN", a menu's id and a route were asked of the
     *  locales as keys.  */
    test("a row says the name its control says; a menu's id is data; a route is no name", () => {
        const view = {stage: "main", gclass: "C_TEST_NAMED_VIEW", kw: {}};
        const shell = gobj_create(`rshell${++seq}`, "C_YUI_SHELL", {
            config: {
                shell: {
                    zones: {top: {host: "toolbar"}, left: {host: "menu.primary"},
                            center: {host: "stage.main"}},
                    stages: {main: {zone: "center", default_route: "/home"}},
                    routes: {"/orphan": view}
                },
                toolbar: {zone: "top", items: [
                    {id: "lang", icon: "yi-language", name: "ES/EN", aria_label: "toggle language",
                        action: {type: "navigate", route: "/lang"}}
                ]},
                menu: {
                    primary: {items: [
                        {id: "home", name: "home", route: "/home", target: view},
                        {id: "x9", aria_label: "active alarms", icon: "yi-eye", route: "/x9",
                            target: view}
                    ]},
                    quick: {render: {overlay: "drawer"}, items: [
                        {id: "q1", name: "first", route: "/q1", target: view}
                    ]}
                }
            },
            use_hash: false
        }, yuno);
        gobj_start(shell);
        logged.length = 0;

        /*  A map an earlier test left open is closed by the first call.  */
        let win = yui_shell_show_route_map(shell);
        if(!win) {
            win = yui_shell_show_route_map(shell);
        }
        const $body = gobj_read_attr(win, "$container");

        /*  The row of a menu entry, and the entry in the nav: one name.  */
        const $x9 = $body.querySelector('.ROUTEMAP_LINK[href="#/x9"]');
        expect($x9.getAttribute("aria-label")).toBe("active alarms");
        expect($x9.getAttribute("data-i18n-aria-label")).toBe("active alarms");
        expect($x9.querySelector(".ROUTEMAP_NAME").getAttribute("data-i18n")).toBe("active alarms");
        const $entry = gobj_read_attr(shell, "$container").querySelector('a[data-item-id="x9"]');
        expect($entry.getAttribute("data-i18n-aria-label")).toBe("active alarms");

        /*  A toolbar button: as the toolbar names it.  */
        const $lang = $body.querySelector('.ROUTEMAP_LINK[href="#/lang"]');
        expect($lang.getAttribute("data-i18n-aria-label")).toBe("toggle language");

        /*  Another menu is a group named by its id, drawn as data.  */
        const $quick = Array.from($body.querySelectorAll(".ROUTEMAP_STRUCT .ROUTEMAP_NAME"))
            .find(($n) => $n.textContent === "quick");
        expect(!!$quick).toBe(true);
        expect($quick.getAttribute("data-i18n")).toBe(null);

        /*  A route of the route table that no item names: its route in
         *  its column, and no name of its own.  */
        const $orphan = $body.querySelector('.ROUTEMAP_LINK[href="#/orphan"]');
        expect(!!$orphan).toBe(true);
        expect($orphan.querySelector(".ROUTEMAP_NAME")).toBe(null);
        expect($orphan.getAttribute("aria-label")).toBe("/orphan");     // data, as its title
        expect($orphan.getAttribute("data-i18n-aria-label")).toBe(null);
        expect($orphan.querySelector(".ROUTEMAP_ROUTE").textContent).toBe("/orphan");

        yui_shell_show_route_map(shell);       // closes it
        expect(errors()).toEqual([]);
    });
});

describe("the links of a nav", () => {
    function nav(kw, items)
    {
        const n = gobj_create(`nnav${++seq}`, "C_YUI_NAV",
            Object.assign({menu_id: "lab", menu_items: items}, kw), yuno);
        gobj_start(n);
        return gobj_read_attr(n, "$container");
    }

    test("a crumb: a title and a name, also without a `name`", () => {
        const $c = nav({layout: "breadcrumb"}, [
            {id: "b", name: "devices", route: "/b"},
            {id: "i", icon: "yi-eye", route: "/i"}
        ]);
        expect_named($c.querySelector('a[data-item-id="b"]'), "devices");
        /*  Its id, AS A KEY: up to 7.26.41 the raw
         *  id was its aria-label, with no key and no title.  */
        expect_named($c.querySelector('a[data-item-id="i"]'), "i");
    });

    /*  The same in every layout that draws an item
     *  (c_yui_nav.js item_li, item_iconbar, the tabs, and the cards of
     *  nav_cards_helpers.js).  */
    for(const layout of ["vertical", "icon-bar", "tabs", "cards", "breadcrumb"]) {
        test(`an item without a \`name\` (${layout}): named by its id as a key, or by its \`aria_label\``, () => {
            const $c = nav({layout: layout, show_label: false}, [
                {id: "alarms", icon: "yi-eye", route: "/alarms"},
                {id: "x7", icon: "yi-eye", route: "/x7", aria_label: "active alarms"}
            ]);
            expect_named($c.querySelector('a[data-item-id="alarms"]'), "alarms");
            expect_named($c.querySelector('a[data-item-id="x7"]'), "active alarms");
            expect(errors()).toEqual([]);
        });
    }

    test("an accordion head without a `name`: named by its id as a key, or by its `aria_label`", () => {
        const $c = nav({layout: "accordion"}, [
            {id: "alarms", submenu: {items: [{id: "open", name: "open", route: "/alarms/open"}]}},
            {id: "s2", aria_label: "settings", submenu: {items: []}}
        ]);
        expect_named($c.querySelector('button[data-item-id="alarms"]'), "alarms");
        expect_named($c.querySelector('button[data-item-id="s2"]'), "settings");
        expect(errors()).toEqual([]);
    });

    test("a nameless item changes language with the page, by its key", async () => {
        const i18next = (await import("i18next")).default;
        i18next.addResourceBundle("es", "translation", {"alarms": "alarmas"}, true, true);
        const $c = nav({layout: "vertical", show_label: false}, [
            {id: "alarms", icon: "yi-eye", route: "/alarms"}
        ]);
        refresh_language($c, i18next.getFixedT("es"));
        const $a = $c.querySelector('a[data-item-id="alarms"]');
        expect($a.getAttribute("aria-label")).toBe("alarmas");
        expect($a.getAttribute("title")).toBe("alarmas");
    });

    test("a card: a title without a tooltip", () => {
        const $c = nav({layout: "cards"}, [{id: "c", name: "reports", icon: "yi-eye", route: "/c"}]);
        expect_named($c.querySelector('a[data-item-id="c"]'), "reports");
    });

    /*  The navigation a parent entry opens -- its tab strip, its
     *  section-index landing -- is named by that entry, by the same
     *  rule. Up to 7.26.41 a tab strip took `name || ""` (a parent with
     *  only an `aria_label` gave a navigation named "navigation"), and a
     *  landing `name || id`.  */
    test("the navigation an entry opens is named by the entry's name: `name`, else `aria_label`, else id", () => {
        const view = {stage: "main", gclass: "C_TEST_NAMED_VIEW", kw: {}};
        const shell = gobj_create(`sshell${++seq}`, "C_YUI_SHELL", {
            config: {
                shell: {
                    zones: {left: {host: "menu.primary"}, "top-sub": {host: "menu.secondary"},
                            center: {host: "stage.main"}},
                    stages: {main: {zone: "center", default_route: "/home"}}
                },
                menu: {primary: {items: [
                    {id: "home", name: "home", route: "/home", target: view},
                    {id: "dev", aria_label: "device settings", icon: "yi-cog", route: "/dev",
                        submenu: {render: {"top-sub": "tabs"}, items: [
                            {id: "a", name: "a", route: "/dev/a", target: view}
                        ]}},
                    {id: "rep", aria_label: "reports", icon: "yi-table", route: "/rep",
                        submenu: {index: true, items: [
                            {id: "d", name: "daily", route: "/rep/d", target: view}
                        ]}}
                ]}}
            },
            use_hash: false
        }, yuno);
        gobj_start(shell);
        const $root = gobj_read_attr(shell, "$container");

        const $tabs = $root.querySelector('[data-zone="top-sub"] [role="navigation"]');
        expect(!!$tabs).toBe(true);
        expect($tabs.getAttribute("aria-label")).toBe("device settings");
        expect($tabs.getAttribute("data-i18n-aria-label")).toBe("device settings");

        yui_shell_navigate(shell, "/rep");
        const $landing = $root.querySelector('[data-zone="center"] [role="navigation"]');
        expect(!!$landing).toBe(true);
        expect($landing.getAttribute("aria-label")).toBe("reports");
        expect($landing.getAttribute("data-i18n-aria-label")).toBe("reports");
        expect(errors()).toEqual([]);
    });
});

describe("the items of the toolbar: what the nav got", () => {
    /*  A shell whose toolbar is `items`, on the page.  */
    function toolbar_shell(items)
    {
        const shell = gobj_create(`tshell${++seq}`, "C_YUI_SHELL", {
            config: {
                shell: {
                    zones: {top: {host: "toolbar"}, center: {host: "stage.main"}},
                    stages: {main: {zone: "center", default_route: "/home"}}
                },
                toolbar: {zone: "top", items: items},
                menu: {primary: {items: [
                    {id: "home", name: "home", route: "/home",
                        target: {stage: "main", gclass: "C_TEST_NAMED_VIEW", kw: {}}}
                ]}}
            },
            use_hash: false
        }, yuno);
        gobj_start(shell);
        return shell;
    }

    function item_of(shell, id)
    {
        return gobj_read_attr(shell, "$container").querySelector(`[data-toolbar-item-id="${id}"]`);
    }

    test("an action item with no `aria_label` nor `name`: named by its id, as a key, with a title", () => {
        const shell = toolbar_shell([
            {id: "help", icon: "yi-circle-question", action: {type: "event", event: "EV_HELP"}},
            /*  The toolbar's own order is kept: its explicit `aria_label`
             *  names it, over a visible `name` that is a symbol.  */
            {id: "lang", icon: "yi-language", name: "ES/EN", aria_label: "toggle language",
                action: {type: "event", event: "EV_LANG"}}
        ]);
        /*  Up to 7.26.41: its raw id, with no key and no title.  */
        expect_named(item_of(shell, "help"), "help");
        expect_named(item_of(shell, "lang"), "toggle language");
        expect(errors()).toEqual([]);
    });

    test("a row of a toolbar menu with neither: named by its id as a key; the menu as its trigger", () => {
        const shell = toolbar_shell([
            {id: "user", type: "avatar", action: {type: "dropdown", items: [
                {id: "logout", icon: "yi-xmark", action: {type: "event", event: "EV_LOGOUT"}},
                {id: "prefs", name: "preferences", action: {type: "event", event: "EV_PREFS"}}
            ]}}
        ]);
        /*  An avatar that says nothing is the library's "user menu" from
         *  the start: up to 7.26.41 it showed its raw id until a pass of
         *  translation replaced it with that key.  */
        const $avatar = item_of(shell, "user");
        expect_named($avatar, "user menu");

        $avatar.click();
        const $panel = document.querySelector('[data-toolbar-dropdown-for="user"]');
        expect(!!$panel).toBe(true);
        expect($panel.getAttribute("aria-label")).toBe("user menu");
        expect($panel.getAttribute("data-i18n-aria-label")).toBe("user menu");
        expect_named($panel.querySelector('[data-dropdown-item-id="logout"]'), "logout");
        expect_named($panel.querySelector('[data-dropdown-item-id="prefs"]'), "preferences");
        $avatar.click();        // the trigger closes its menu
        expect(document.querySelector('[data-toolbar-dropdown-for="user"]')).toBe(null);
        expect(errors()).toEqual([]);
    });

    test("a menu named by its trigger's id says its trigger's key", () => {
        const shell = toolbar_shell([
            {id: "more", icon: "yi-ellipsis", action: {type: "dropdown", items: [
                {id: "about", name: "about", action: {type: "event", event: "EV_ABOUT"}}
            ]}}
        ]);
        const $more = item_of(shell, "more");
        expect_named($more, "more");
        $more.click();
        const $panel = document.querySelector('[data-toolbar-dropdown-for="more"]');
        expect($panel.getAttribute("aria-label")).toBe("more");
        expect($panel.getAttribute("data-i18n-aria-label")).toBe("more");
        $more.click();
        expect(errors()).toEqual([]);
    });

    test("the menu a right-click opens is named as its trigger, as the left-click one is", () => {
        const shell = toolbar_shell([
            {id: "conn", type: "connection", aria_label: "server link",
                context_action: {type: "dropdown", items: [
                    {id: "logs", icon: "yi-list", action: {type: "event", event: "EV_LOGS"}}
                ]}},
            {id: "tools", icon: "yi-gear", name: "tools key", action: {type: "event", event: "EV_TOOLS"},
                context_action: {type: "dropdown", items: [
                    {id: "about", name: "about", action: {type: "event", event: "EV_ABOUT"}}
                ]}}
        ]);
        const right_click = ($el) => $el.dispatchEvent({type: "contextmenu", preventDefault() {}});
        /*  Up to 7.26.42 it was named by the raw id: the right-click handed
         *  the shell `{id, action}`, which dropped the trigger's names  */
        right_click(item_of(shell, "conn"));
        let $panel = document.querySelector('[data-toolbar-dropdown-for="conn"]');
        expect($panel.getAttribute("aria-label")).toBe("server link");
        expect($panel.getAttribute("data-i18n-aria-label")).toBe("server link");
        expect_named($panel.querySelector('[data-dropdown-item-id="logs"]'), "logs");
        right_click(item_of(shell, "conn"));
        right_click(item_of(shell, "tools"));
        $panel = document.querySelector('[data-toolbar-dropdown-for="tools"]');
        expect($panel.getAttribute("aria-label")).toBe("tools key");
        right_click(item_of(shell, "tools"));
        expect(errors()).toEqual([]);
    });

    test("a connection dot with neither: the library's own key, from the start", () => {
        const shell = toolbar_shell([{id: "conn", type: "connection"}]);
        expect_named(item_of(shell, "conn"), "backend connection");
        expect(errors()).toEqual([]);
    });

    test("a nameless toolbar item changes language with the page, by its key", async () => {
        const i18next = (await import("i18next")).default;
        i18next.addResourceBundle("es", "translation", {"help": "ayuda"}, true, true);
        const shell = toolbar_shell([
            {id: "help", icon: "yi-circle-question", action: {type: "event", event: "EV_HELP"}}
        ]);
        refresh_language(gobj_read_attr(shell, "$container"), i18next.getFixedT("es"));
        const $help = item_of(shell, "help");
        expect($help.getAttribute("aria-label")).toBe("ayuda");
        expect($help.getAttribute("title")).toBe("ayuda");
    });
});

describe("a chip of the dock", () => {
    function chip(dock)
    {
        return gobj_read_attr(dock, "$container").querySelector(".DOCK_CHIP");
    }

    test("is no control itself: two sibling buttons, each named, neither inside the other", () => {
        const dock = gobj_create_service(`ndock${++seq}`, "C_YUI_WINDOW_MANAGER", {}, yuno);
        gobj_start(dock);
        const w = gobj_create_service(`nwin${seq}`, "C_YUI_WINDOW",
            {header: "x", body: ["div", {}, "x"], title: "developer", manager: dock}, yuno);
        gobj_start(w);

        const $chip = chip(dock);
        /*  Up to 7.26.34: a role=button div holding the ✕ button.  */
        expect($chip.getAttribute("role")).toBe(null);
        expect($chip.getAttribute("tabindex")).toBe(null);

        const $toggle = $chip.querySelector(".DOCK_CHIP_TOGGLE");
        const $close = $chip.querySelector(".DOCK_CHIP_CLOSE");
        expect($toggle.tagName).toBe("BUTTON");
        expect($close.tagName).toBe("BUTTON");
        expect($toggle.parentNode === $chip && $close.parentNode === $chip).toBe(true);
        expect($toggle.querySelector("button")).toBe(null);

        expect_named($toggle, "developer");
        expect_named($close, "close");
        const ids = ($toggle.getAttribute("aria-labelledby") || "").split(" ").filter(Boolean);
        expect(ids.length).toBe(1);
        const $label = $toggle.querySelector(`#${ids[0]}`);
        expect($label.classList.contains("yui-dock-label-kind")).toBe(true);
        expect($label.getAttribute("data-i18n")).toBe("developer");
    });

    test("with a data half: both halves name the toggle", () => {
        const dock = gobj_create_service(`ndock${++seq}`, "C_YUI_WINDOW_MANAGER", {}, yuno);
        gobj_start(dock);
        const w = gobj_create_service(`nwin${seq}`, "C_YUI_WINDOW", {
            header: "x", body: ["div", {}, "x"],
            title: "keys", title_prefix: "raw_events", manager: dock
        }, yuno);
        gobj_start(w);

        const $toggle = chip(dock).querySelector(".DOCK_CHIP_TOGGLE");
        const names = ($toggle.getAttribute("aria-labelledby") || "").split(" ")
            .map((id) => $toggle.querySelector(`#${id}`).textContent);
        expect(names).toEqual(["raw_events", "keys"]);
    });

    test("its toggle minimises and brings back, through the FSM; its ✕ closes", () => {
        const dock = gobj_create_service(`ndock${++seq}`, "C_YUI_WINDOW_MANAGER", {}, yuno);
        gobj_start(dock);
        const w = gobj_create_service(`nwin${seq}`, "C_YUI_WINDOW",
            {header: "x", body: ["div", {}, "x"], title: "developer", manager: dock}, yuno);
        gobj_start(w);
        const $win = gobj_read_attr(w, "$container");
        const $chip = chip(dock);

        $chip.querySelector(".DOCK_CHIP_TOGGLE").click();          // active: to the dock
        expect($win.style.display).toBe("none");
        expect($chip.classList.contains("is-min")).toBe(true);
        $chip.querySelector(".DOCK_CHIP_TOGGLE").click();          // back
        expect($win.style.display).toBe(undefined);
        expect($chip.classList.contains("is-active")).toBe(true);

        /*  Only the dock's own chip toggles a window.  */
        logged.length = 0;
        gobj_send_event(dock, "EV_TOGGLE_WINDOW", {window: "x^y"}, w);
        expect(logged.some((l) => l.level === "error" && l.msg.includes("dock's own chip"))).toBe(true);

        $chip.querySelector(".DOCK_CHIP_CLOSE").click();
        expect(gobj_is_destroying(w)).toBe(true);
        expect(chip(dock)).toBe(null);
    });
});

describe("the ✕ of an option of a Tom Select", () => {
    test("is named through t() with its key, and a key presses it", () => {
        const app = gobj_create_pure_child(`sapp${++seq}`, "C_TEST_NAMED_APP", {}, yuno);
        gobj_start(app);
        const form = gobj_create_pure_child(`sform${seq}`, "C_YUI_FORM", {
            template: [
                {id: "id", header: "id", type: "string", flag: ["persistent", "required"]},
                {id: "roles", header: "roles", type: "array",
                    flag: ["enum", "persistent", "writable"], enum: ["admin", "user"]},
            ],
            record: {id: "a", roles: []},
            render_mode: "exec",
            editable: true,
        }, app);
        gobj_start(form);
        expect(selects.length).toBe(1);

        const plugin = selects[0].settings.plugins.remove_button;
        expect(typeof plugin.html).toBe("function");
        const $x = plugin.html({});
        expect_named($x, "remove this option");
        expect($x.getAttribute("role")).toBe("button");
        expect($x.getAttribute("tabindex")).toBe("0");
        expect($x.textContent).toBe("×");

        let clicks = 0;
        $x.addEventListener("click", () => {
            clicks++;
        });
        $x.dispatchEvent({type: "keydown", key: "Enter", preventDefault() {}, stopPropagation() {}});
        $x.dispatchEvent({type: "keydown", key: " ", preventDefault() {}, stopPropagation() {}});
        $x.dispatchEvent({type: "keydown", key: "a", preventDefault() {}, stopPropagation() {}});
        expect(clicks).toBe(2);
    });
});
