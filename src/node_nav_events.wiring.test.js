/***********************************************************************
 *          node_nav_events.wiring.test.js
 *
 *      C_YUI_NODE hosts C_YUI_NAV as a pure CHILD, so it hears every
 *      event the nav publishes -- and it declared only EV_NAV_CLICKED.
 *      EV_NAV_ITEM_CLOSE (the ✕ of a closable item) and
 *      EV_DRAWER_CLOSE_REQUESTED (the backdrop of a drawer projection,
 *      a layout a node may declare) answered "Event NOT DEFINED in
 *      state" -- and the drawer stayed open, because the shell that
 *      closes drawers knows only its own navs. A zone projection also
 *      outlives the path (it is stopped only in mt_stop), so the clicks
 *      of a root that is off the path landed on ST_OFF, which declared
 *      none of the three.
 *
 *      Driven through the real gclasses (C_YUI_SHELL, C_YUI_NODE,
 *      C_YUI_NAV) on a document double: each event is published by the
 *      real nav the node created.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {describe, test, expect, beforeAll, beforeEach} from "vitest";
import {install_dom_double} from "../test/dom_double.js";

install_dom_double();

const {
    SDATA_END, gclass_create,
    gobj_start_up, gobj_create_yuno, gobj_create, gobj_create_pure_child,
    gobj_start, gobj_send_event, gobj_publish_event, gobj_read_attr,
    gobj_current_state, gobj_change_state,
    set_log_callback,
} = await import("@yuneta/gobj-js");
const {register_c_yui_shell} = await import("./c_yui_shell.js");
const {register_c_yui_nav} = await import("./c_yui_nav.js");
const {register_c_yui_node} = await import("./c_yui_node.js");

const logged = [];
const closed = [];          /*  the EV_NAV_ITEM_CLOSE the app heard  */
let yuno = null;

beforeAll(() => {
    gobj_start_up(null, null, null, null, null, null, null);
    set_log_callback((level, msg) => {
        logged.push({level: String(level), msg: String(msg)});
    });
    gclass_create("C_TEST_HOST", [], [["ST_IDLE", []]], {}, 0, [SDATA_END()], {}, 0, 0, 0, 0);
    /*  An app that uses closable items: it declares what the shell
     *  re-publishes.  */
    gclass_create(
        "C_TEST_APP",
        [["EV_NAV_ITEM_CLOSE", 0]],
        [["ST_IDLE", [
            ["EV_NAV_ITEM_CLOSE", (gobj, event, kw) => {
                closed.push(kw);
                return 0;
            }, null]
        ]]],
        {}, 0, [SDATA_END()], {}, 0, 0, 0, 0
    );
    register_c_yui_shell();
    register_c_yui_nav();
    register_c_yui_node();
    yuno = gobj_create_yuno("node_nav_yuno", "C_TEST_HOST", {});
    gobj_start(yuno);
});

beforeEach(() => {
    logged.length = 0;
    closed.length = 0;
});

let seq = 0;

/*  A tree under a shell, on the path, projecting its children with
 *  `layout`. Returns the tree and the nav it created.  */
function build(layout)
{
    const name = `n${++seq}`;
    const app = gobj_create(`${name}_app`, "C_TEST_APP", {}, yuno);
    gobj_start(app);
    const shell = gobj_create(`${name}_shell`, "C_YUI_SHELL",
        {config: {shell: {}}, default_route: "/home", subscriber: app}, app);
    gobj_start(shell);
    const tree = gobj_create_pure_child(`${name}_tree`, "C_YUI_NODE", {
        node_id: "root",
        base_route: "/tree",
        projection: {index: {layout: layout}},
        children: [{id: "a", label: "A"}, {id: "b", label: "B"}]
    }, shell);
    gobj_start(tree);
    gobj_send_event(tree, "EV_ROUTE_CHANGED", {base: "/tree", subpath: ""}, shell);
    expect(gobj_current_state(tree)).toBe("ST_SELF");
    const nav = tree.priv.navs[0];
    expect(nav).toBeTruthy();
    expect(gobj_read_attr(nav, "layout")).toBe(layout);
    logged.length = 0;
    return {app, shell, tree, nav};
}

function errors()
{
    return logged.filter((l) => l.level === "error").map((l) => l.msg);
}

describe("the events of a C_YUI_NAV reach its C_YUI_NODE", () => {

    test("EV_NAV_ITEM_CLOSE is handed to the shell, and the app hears it", () => {
        const {nav} = build("tabs");
        gobj_publish_event(nav, "EV_NAV_ITEM_CLOSE", {
            item_id: "a", route: "/tree/a", menu_id: "node./tree", zone: ""
        });
        expect(errors()).toEqual([]);
        expect(closed).toEqual([{
            item_id: "a", route: "/tree/a", menu_id: "node./tree", zone: ""
        }]);
    });

    test("EV_DRAWER_CLOSE_REQUESTED closes the node's own drawer", () => {
        const {nav} = build("drawer");
        const $drawer = gobj_read_attr(nav, "$container");
        $drawer.classList.add("is-active");

        gobj_publish_event(nav, "EV_DRAWER_CLOSE_REQUESTED", {
            menu_id: gobj_read_attr(nav, "menu_id")
        });
        expect(errors()).toEqual([]);
        expect($drawer.classList.contains("is-active")).toBe(false);
    });

    test("a drawer of another menu is left open", () => {
        const {nav} = build("drawer");
        const $drawer = gobj_read_attr(nav, "$container");
        $drawer.classList.add("is-active");
        gobj_publish_event(nav, "EV_DRAWER_CLOSE_REQUESTED", {menu_id: "other"});
        expect(errors()).toEqual([]);
        expect($drawer.classList.contains("is-active")).toBe(true);
    });

    test("off the path, a nav that is still there is heard too", () => {
        const {tree, nav} = build("tabs");
        /*  What a zone nav is: alive while its root is off the path.  */
        gobj_change_state(tree, "ST_OFF");
        gobj_publish_event(nav, "EV_NAV_ITEM_CLOSE", {item_id: "b"});
        gobj_publish_event(nav, "EV_DRAWER_CLOSE_REQUESTED", {menu_id: "x"});
        gobj_publish_event(nav, "EV_NAV_CLICKED", {route: "/tree/a", item_id: "a"});
        expect(errors()).toEqual([]);
        expect(closed.map((c) => c.item_id)).toEqual(["b"]);
    });
});
