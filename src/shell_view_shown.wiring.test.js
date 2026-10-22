/***********************************************************************
 *          shell_view_shown.wiring.test.js
 *
 *      EV_VIEW_SHOWN: a view the shell shows AGAIN after hiding it
 *      (`keep_alive`) is told so, if it declares the event, and
 *      C_YUI_SERVICE_VIEW hands it on to the view it hosts. A
 *      C_YUI_NODE tree tells the content on screen once, from its own
 *      route change, and the shell does not tell it again.
 *
 *      Driven through the real C_YUI_SHELL on a document double.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {describe, test, expect, beforeAll, beforeEach, afterEach} from "vitest";
import {install_dom_double} from "../test/dom_double.js";

install_dom_double();

const {
    SDATA, SDATA_END, data_type_t, gclass_create, gobj_write_attr,
    gobj_start_up, gobj_create_yuno, gobj_create, gobj_create_service,
    gobj_start, gobj_stop, gobj_destroy, gobj_is_running, gobj_name,
    set_log_callback,
} = await import("@yuneta/gobj-js");
const {register_c_yui_shell, yui_shell_navigate} = await import("./c_yui_shell.js");
const {register_c_yui_service_view} = await import("./c_yui_service_view.js");
const {register_c_yui_node} = await import("./c_yui_node.js");
const {register_c_yui_nav} = await import("./c_yui_nav.js");

const logged = [];
const alive = [];
const shown = [];       /*  {name, kw} per EV_VIEW_SHOWN received  */
let yuno = null;
let seq = 0;

beforeAll(async () => {
    const i18next = (await import("i18next")).default;
    await i18next.init({lng: "en", resources: {}});
    gobj_start_up(null, null, null, null, null, null, null);
    set_log_callback((level, msg) => {
        logged.push({level: String(level), msg: String(msg)});
    });
    gclass_create("C_TEST_SHOWN_HOST", [], [["ST_IDLE", []]], {}, 0, [SDATA_END()], {}, 0, 0, 0, 0);

    const attrs = [
        SDATA(data_type_t.DTP_POINTER, "$container", 0, null, "view root"),
        SDATA(data_type_t.DTP_POINTER, "gobj_remote_yuno", 0, null, "transport"),
        SDATA_END()
    ];
    const gmt = {
        mt_create: (gobj) => {
            gobj_write_attr(gobj, "$container", document.createElement("div"));
        }
    };
    /*  A view that reads its data when created, and again when shown  */
    gclass_create(
        "C_TEST_SHOWN_VIEW",
        [["EV_VIEW_SHOWN", 0]],
        [["ST_IDLE", [
            ["EV_VIEW_SHOWN", (gobj, event, kw) => {
                shown.push({name: gobj_name(gobj), kw: kw});
                return 0;
            }, null]
        ]]],
        gmt, 0, attrs, {}, 0, 0, 0, 0
    );
    /*  A view that does not care  */
    gclass_create("C_TEST_PLAIN_VIEW", [], [["ST_IDLE", []]], gmt, 0, attrs, {}, 0, 0, 0, 0);

    register_c_yui_shell();
    register_c_yui_nav();
    register_c_yui_service_view();
    register_c_yui_node();
    yuno = gobj_create_yuno("view_shown_yuno", "C_TEST_SHOWN_HOST", {});
    gobj_start(yuno);
    gobj_create_service("test_transport", "C_TEST_SHOWN_HOST", {}, yuno);
});

beforeEach(() => {
    logged.length = 0;
    shown.length = 0;
});

afterEach(() => {
    for(const gobj of alive.splice(0)) {
        if(gobj_is_running(gobj)) {
            gobj_stop(gobj);
        }
        gobj_destroy(gobj);
    }
});

function target(gclass, lifecycle, name)
{
    return {stage: "main", gclass: gclass, kw: {}, lifecycle: lifecycle, name: name};
}

function config()
{
    return {
        shell: {
            zones: {
                left:   {host: "menu.primary"},
                center: {host: "stage.main"}
            },
            stages: {main: {zone: "center", default_route: "/kept"}}
        },
        menu: {
            primary: {
                render: {left: {layout: "vertical", icon_pos: "left"}},
                items: [
                    {id: "kept", name: "kept", route: "/kept",
                        target: target("C_TEST_SHOWN_VIEW", "keep_alive", "kept_view")},
                    {id: "plain", name: "plain", route: "/plain",
                        target: target("C_TEST_PLAIN_VIEW", "keep_alive", "plain_view")},
                    {id: "gone", name: "gone", route: "/gone",
                        target: target("C_TEST_SHOWN_VIEW", "lazy_destroy", "gone_view")},
                    {id: "tree", name: "tree", route: "/tree",
                        target: {
                            stage: "main", gclass: "C_YUI_NODE", lifecycle: "keep_alive",
                            name: "the_tree",
                            kw: {
                                node_id: "tree", base_route: "/tree",
                                content: {gclass: "C_TEST_SHOWN_VIEW", kw: {}},
                                children: [
                                    {id: "acc", label: "acc",
                                        content: {gclass: "C_TEST_SHOWN_VIEW", kw: {}}},
                                    {id: "deep", label: "deep", children: [
                                        {id: "leaf", label: "leaf",
                                            content: {gclass: "C_TEST_SHOWN_VIEW", kw: {}}}
                                    ]},
                                    {id: "svc", label: "svc", content: {
                                        gclass: "C_YUI_SERVICE_VIEW",
                                        kw: {
                                            view_gclass: "C_TEST_SHOWN_VIEW",
                                            service_name: "#tree_svc_view",
                                            transport_service: "test_transport"
                                        }
                                    }}
                                ]
                            }
                        }},
                    {id: "hosted", name: "hosted", route: "/hosted",
                        target: {
                            stage: "main", gclass: "C_YUI_SERVICE_VIEW", lifecycle: "keep_alive",
                            name: "hosted_host",
                            kw: {
                                view_gclass: "C_TEST_SHOWN_VIEW",
                                service_name: "#hosted_view",
                                transport_service: "test_transport"
                            }
                        }}
                ]
            }
        }
    };
}

function new_shell()
{
    const shell = gobj_create(`shown_shell_${++seq}`, "C_YUI_SHELL",
        {config: config(), use_hash: false}, yuno);
    gobj_start(shell);
    alive.push(shell);
    return shell;
}

function errors()
{
    return logged.filter((l) => l.level === "error" || l.level === "warning").map((l) => l.msg);
}

describe("EV_VIEW_SHOWN", () => {
    test("a keep_alive view is told when it is shown AGAIN, not the first time", () => {
        const shell = new_shell();
        yui_shell_navigate(shell, "/kept");
        expect(shown).toEqual([]);

        yui_shell_navigate(shell, "/plain");
        yui_shell_navigate(shell, "/kept");
        expect(shown.length).toBe(1);
        expect(shown[0].name).toBe("kept_view");
        expect(shown[0].kw.base).toBe("/kept");
        expect(errors()).toEqual([]);
    });

    test("a move inside the view (a subpath) is not a new showing", () => {
        const shell = new_shell();
        yui_shell_navigate(shell, "/kept");
        yui_shell_navigate(shell, "/kept/table");
        yui_shell_navigate(shell, "/kept/cards");
        expect(shown).toEqual([]);
    });

    test("a view that does not declare it is not told, and nothing complains", () => {
        const shell = new_shell();
        yui_shell_navigate(shell, "/plain");
        yui_shell_navigate(shell, "/kept");
        yui_shell_navigate(shell, "/plain");
        expect(shown.filter((s) => s.name === "plain_view")).toEqual([]);
        expect(errors()).toEqual([]);
    });

    test("a lazy_destroy view comes back NEW, and a new view is not told", () => {
        const shell = new_shell();
        yui_shell_navigate(shell, "/gone");
        yui_shell_navigate(shell, "/kept");
        yui_shell_navigate(shell, "/gone");
        expect(shown.filter((s) => s.name === "gone_view")).toEqual([]);
    });

    /*  The tree is told by its own route change (each node on the path
     *  comes back from ST_OFF to a content it already built), so the
     *  shell must not tell it a second time: C_YUI_NODE does not declare
     *  EV_VIEW_SHOWN. A view that asks for its data when shown and is
     *  busy until the answer took the second one as "action in progress".  */
    test("a keep_alive C_YUI_NODE tree tells the content on screen ONCE", () => {
        const shell = new_shell();
        yui_shell_navigate(shell, "/tree/acc");
        expect(shown).toEqual([]);

        yui_shell_navigate(shell, "/plain");
        yui_shell_navigate(shell, "/tree/acc");
        expect(shown.map((s) => s.kw.route)).toEqual(["/tree/acc"]);
        expect(errors()).toEqual([]);
    });

    test("the root's own content, and a content deeper down, are told once", () => {
        const shell = new_shell();
        yui_shell_navigate(shell, "/tree");
        yui_shell_navigate(shell, "/plain");
        yui_shell_navigate(shell, "/tree");
        expect(shown.map((s) => s.kw.route)).toEqual(["/tree"]);

        shown.length = 0;
        yui_shell_navigate(shell, "/tree/deep/leaf");
        expect(shown).toEqual([]);
        yui_shell_navigate(shell, "/plain");
        yui_shell_navigate(shell, "/tree/deep/leaf");
        expect(shown.map((s) => s.kw.route)).toEqual(["/tree/deep/leaf"]);
        expect(errors()).toEqual([]);
    });

    test("a C_YUI_SERVICE_VIEW content of a node hands it on, once", () => {
        const shell = new_shell();
        yui_shell_navigate(shell, "/tree/svc");
        yui_shell_navigate(shell, "/plain");
        yui_shell_navigate(shell, "/tree/svc");
        expect(shown.map((s) => s.name)).toEqual(["#tree_svc_view"]);
        expect(errors()).toEqual([]);
    });

    test("C_YUI_SERVICE_VIEW hands it on to the view it hosts", () => {
        const shell = new_shell();
        yui_shell_navigate(shell, "/hosted");
        yui_shell_navigate(shell, "/kept");
        yui_shell_navigate(shell, "/hosted");
        expect(shown.filter((s) => s.name === "#hosted_view").length).toBe(1);
        expect(errors()).toEqual([]);
    });
});
