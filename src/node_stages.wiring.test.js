/***********************************************************************
 *          node_stages.wiring.test.js
 *
 *      A shell with TWO stages (SHELL.md §3: `right` as a secondary
 *      stage). A route of the second stage changes what THAT stage
 *      shows and nothing else: the C_YUI_NODE tree the main stage still
 *      shows stays on its path. Up to 7.27.30 the root compared only the
 *      base of the route, so a route of the other stage sent it to
 *      ST_OFF and emptied it while the shell kept it on screen.
 *
 *      A route of its OWN stage still takes it off the path, and the
 *      showing that follows tells its content once (EV_VIEW_SHOWN).
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
    SDATA, SDATA_END, data_type_t, gclass_create, gobj_write_attr, gobj_read_attr,
    gobj_start_up, gobj_create_yuno, gobj_create, gobj_find_child,
    gobj_start, gobj_stop, gobj_destroy, gobj_is_running, gobj_name,
    gobj_current_state, set_log_callback,
} = await import("@yuneta/gobj-js");
const {register_c_yui_shell, yui_shell_navigate} = await import("./c_yui_shell.js");
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
    gclass_create("C_TEST_STAGES_HOST", [], [["ST_IDLE", []]], {}, 0, [SDATA_END()], {}, 0, 0, 0, 0);

    const attrs = [
        SDATA(data_type_t.DTP_POINTER, "$container", 0, null, "view root"),
        SDATA_END()
    ];
    const gmt = {
        mt_create: (gobj) => {
            gobj_write_attr(gobj, "$container", document.createElement("div"));
        }
    };
    gclass_create(
        "C_TEST_STAGES_VIEW",
        [["EV_VIEW_SHOWN", 0]],
        [["ST_IDLE", [
            ["EV_VIEW_SHOWN", (gobj, event, kw) => {
                shown.push({name: gobj_name(gobj), kw: kw});
                return 0;
            }, null]
        ]]],
        gmt, 0, attrs, {}, 0, 0, 0, 0
    );

    register_c_yui_shell();
    register_c_yui_nav();
    register_c_yui_node();
    yuno = gobj_create_yuno("node_stages_yuno", "C_TEST_STAGES_HOST", {});
    gobj_start(yuno);
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

function config()
{
    const view = (stage, name) => ({
        stage: stage, gclass: "C_TEST_STAGES_VIEW", kw: {}, lifecycle: "keep_alive", name: name
    });
    return {
        shell: {
            zones: {
                left:   {host: "menu.primary"},
                center: {host: "stage.main"},
                right:  {host: "stage.detail"}
            },
            stages: {
                main:   {zone: "center", default_route: "/plain"},
                detail: {zone: "right"}
            }
        },
        menu: {
            primary: {
                render: {left: {layout: "vertical", icon_pos: "left"}},
                items: [
                    {id: "plain", name: "plain", route: "/plain", target: view("main", "plain_view")},
                    {id: "detail", name: "detail", route: "/detail", target: view("detail", "detail_view")},
                    {id: "tree", name: "tree", route: "/tree",
                        target: {
                            stage: "main", gclass: "C_YUI_NODE", lifecycle: "keep_alive",
                            name: "the_tree",
                            kw: {
                                node_id: "tree", base_route: "/tree",
                                children: [
                                    {id: "acc", label: "acc",
                                        content: {gclass: "C_TEST_STAGES_VIEW", kw: {}}}
                                ]
                            }
                        }}
                ]
            }
        }
    };
}

function new_shell()
{
    const shell = gobj_create(`stages_shell_${++seq}`, "C_YUI_SHELL",
        {config: config(), use_hash: false}, yuno);
    gobj_start(shell);
    alive.push(shell);
    return shell;
}

function problems()
{
    return logged.filter((l) => l.level === "error" || l.level === "warning").map((l) => l.msg);
}

/*  What the main stage shows of the tree: its state, whether its
 *  container is visible, and whether the content of `acc` is in it.  */
function tree_on_screen(shell)
{
    const tree = gobj_find_child(shell, {__gobj_name__: "the_tree"});
    expect(tree).toBeTruthy();
    const $c = gobj_read_attr(tree, "$container");
    const acc = tree.priv.children.find((c) => gobj_read_attr(c, "node_id") === "acc");
    const content = acc && acc.priv.content_gobj;
    const $content = content ? gobj_read_attr(content, "$container") : null;
    return {
        state: gobj_current_state(tree),
        visible: !$c.classList.contains("is-hidden"),
        content_drawn: !!$content && $c.contains($content),
    };
}

describe("C_YUI_NODE under a shell with two stages", () => {
    test("a route of ANOTHER stage leaves the tree on its path", () => {
        const shell = new_shell();
        yui_shell_navigate(shell, "/tree/acc");
        const before = tree_on_screen(shell);
        expect(before.state).not.toBe("ST_OFF");
        expect(before.visible).toBe(true);
        expect(before.content_drawn).toBe(true);

        yui_shell_navigate(shell, "/detail");
        expect(tree_on_screen(shell)).toEqual(before);

        /*  Back to the tree: it was never hidden, so it is not told
         *  it is shown again.  */
        yui_shell_navigate(shell, "/tree/acc");
        expect(tree_on_screen(shell)).toEqual(before);
        expect(shown).toEqual([]);
        expect(problems()).toEqual([]);
    });

    test("a route of ITS stage takes it off the path, and the next showing tells the content once", () => {
        const shell = new_shell();
        yui_shell_navigate(shell, "/tree/acc");
        yui_shell_navigate(shell, "/detail");
        yui_shell_navigate(shell, "/plain");
        const off = tree_on_screen(shell);
        expect([off.state, off.visible, off.content_drawn]).toEqual(["ST_OFF", false, false]);

        yui_shell_navigate(shell, "/tree/acc");
        expect(tree_on_screen(shell).content_drawn).toBe(true);
        /*  (plain_view, the default route the shell opened on, is
         *  told too: it was shown before.)  */
        expect(shown.filter((s) => s.name !== "plain_view").map((s) => s.kw.route))
            .toEqual(["/tree/acc"]);
        expect(problems()).toEqual([]);
    });
});
