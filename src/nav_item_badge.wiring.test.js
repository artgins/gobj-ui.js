/***********************************************************************
 *          nav_item_badge.wiring.test.js
 *
 *      The badge of a MENU item: `badge` / `badge_tone` on an item of
 *      app_config.json or of yui_shell_set_submenu(), and
 *      yui_shell_set_nav_item_badge(), the twin of the toolbar's
 *      yui_shell_set_toolbar_item_badge() -- which takes a tone now too.
 *
 *      Driven through the real C_YUI_SHELL and C_YUI_NAV on a document
 *      double: one entry drawn by a rail, an icon bar and a drawer; a
 *      tab strip rebuilt by yui_shell_set_submenu(); a section-index
 *      landing mounted after the badge was set; and each layout's place
 *      for the badge, on a nav created on its own.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {describe, test, expect, beforeAll, beforeEach, afterEach} from "vitest";
import {install_dom_double} from "../test/dom_double.js";

install_dom_double();

const {
    SDATA, SDATA_END, data_type_t, gclass_create, gobj_write_attr,
    gobj_start_up, gobj_create_yuno, gobj_create, gobj_start, gobj_stop,
    gobj_destroy, gobj_is_running, gobj_read_attr, gobj_send_event,
    set_log_callback,
} = await import("@yuneta/gobj-js");
const {
    register_c_yui_shell,
    yui_shell_navigate,
    yui_shell_set_nav_item_badge,
    yui_shell_set_toolbar_item_badge,
    yui_shell_set_submenu,
    yui_shell_set_translator,
    yui_shell_language_changed,
} = await import("./c_yui_shell.js");
const {register_c_yui_nav} = await import("./c_yui_nav.js");
const {BADGE_TONES} = await import("./yui_badge.js");

const logged = [];
const alive = [];
let yuno = null;
let seq = 0;

beforeAll(async () => {
    const i18next = (await import("i18next")).default;
    await i18next.init({lng: "en", resources: {}});
    gobj_start_up(null, null, null, null, null, null, null);
    set_log_callback((level, msg) => {
        logged.push({level: String(level), msg: String(msg)});
    });
    gclass_create("C_TEST_BADGE_HOST", [], [["ST_IDLE", []]], {}, 0, [SDATA_END()], {}, 0, 0, 0, 0);
    gclass_create(
        "C_TEST_BADGE_VIEW", [], [["ST_IDLE", []]], {
            mt_create: (gobj) => {
                gobj_write_attr(gobj, "$container", document.createElement("div"));
            }
        }, 0, [
            SDATA(data_type_t.DTP_POINTER, "$container", 0, null, "view root"),
            SDATA_END()
        ], {}, 0, 0, 0, 0
    );
    register_c_yui_shell();
    register_c_yui_nav();
    yuno = gobj_create_yuno("nav_badge_yuno", "C_TEST_BADGE_HOST", {});
    gobj_start(yuno);
});

beforeEach(() => {
    logged.length = 0;
});

afterEach(() => {
    for(const gobj of alive.splice(0)) {
        if(gobj_is_running(gobj)) {
            gobj_stop(gobj);
        }
        gobj_destroy(gobj);
    }
});


/***************************************************************
 *  The app: one alarms entry in the primary menu, which a rail
 *  (desktop) and an icon bar (phone) both draw, and which a drawer
 *  menu repeats; a section with a tab strip; a section-index
 *  landing; and a toolbar bell.
 ***************************************************************/
function view()
{
    return {stage: "main", gclass: "C_TEST_BADGE_VIEW", kw: {}};
}

function devices_items(extra)
{
    return [
        {id: "list", name: "list", route: "/devices/list", target: view()},
        {id: "map",  name: "map",  route: "/devices/map",  target: view()},
        ...(extra || [])
    ];
}

function config()
{
    return {
        shell: {
            zones: {
                top:       {host: "toolbar"},
                left:      {host: "menu.primary"},
                bottom:    {host: "menu.primary"},
                "top-sub": {host: "menu.secondary"},
                center:    {host: "stage.main"}
            },
            stages: {main: {zone: "center", default_route: "/home"}}
        },
        toolbar: {
            zone: "top",
            items: [
                {id: "bell", icon: "yi-triangle-exclamation", aria_label: "alarms",
                    badge: 4, badge_tone: "info",
                    action: {type: "navigate", route: "/alarms"}}
            ]
        },
        menu: {
            primary: {
                render: {
                    left:   {layout: "vertical", icon_pos: "left"},
                    bottom: {layout: "icon-bar", icon_pos: "top"}
                },
                items: [
                    {id: "home", name: "home", icon: "yi-house", route: "/home", target: view()},
                    {id: "alarms", name: "alarms", icon: "yi-triangle-exclamation", route: "/alarms",
                        badge: 2, badge_tone: "warning", target: view()},
                    {id: "devices", name: "devices", icon: "yi-cog", route: "/devices",
                        submenu: {render: {"top-sub": "tabs"}, items: devices_items()}},
                    {id: "reports", name: "reports", icon: "yi-table", route: "/reports",
                        submenu: {index: true, items: [
                            {id: "daily", name: "daily", icon: "yi-eye",
                                route: "/reports/daily", target: view()},
                            {id: "weekly", name: "weekly", icon: "yi-cog",
                                route: "/reports/weekly", target: view()}
                        ]}}
                ]
            },
            quick: {
                render: {overlay: "drawer"},
                items: [
                    {id: "alarms", name: "alarms", icon: "yi-triangle-exclamation", route: "/alarms"}
                ]
            }
        }
    };
}

function new_shell(cfg)
{
    const shell = gobj_create(`badge_shell_${++seq}`, "C_YUI_SHELL",
        {config: cfg || config(), use_hash: false}, yuno);
    gobj_start(shell);
    alive.push(shell);
    return shell;
}

function new_nav(kw)
{
    const nav = gobj_create(`badge_nav_${++seq}`, "C_YUI_NAV", kw, yuno);
    gobj_start(nav);
    alive.push(nav);
    return nav;
}

function root(gobj)
{
    return gobj_read_attr(gobj, "$container");
}

function zone(shell, id)
{
    return root(shell).querySelector(`[data-zone="${id}"]`);
}

function drawer(shell)
{
    return root(shell).querySelector(".yui-layer-overlay");
}

function badge_in($where, item_id)
{
    return $where.querySelector(`[data-item-id="${item_id}"] .NAV_ITEM_BADGE`);
}

function badges_in($where, item_id)
{
    return $where.querySelectorAll(`[data-item-id="${item_id}"] .NAV_ITEM_BADGE`);
}

/*  What a badge shows: its text, or null while hidden, and its tones.  */
function shows($badge)
{
    return {
        text:  $badge.hasAttribute("hidden") ? null : $badge.textContent,
        tones: BADGE_TONES.filter((tone) => $badge.classList.contains(`is-${tone}`))
    };
}

function errors()
{
    return logged.filter((l) => l.level === "error" || l.level === "warning").map((l) => l.msg);
}


describe("a badge declared in app_config.json", () => {
    test("renders: after the label in the rail, on the icon in the icon bar", () => {
        const shell = new_shell();

        const $rail = badge_in(zone(shell, "left"), "alarms");
        expect(shows($rail)).toEqual({text: "2", tones: ["warning"]});
        expect($rail.getAttribute("role")).toBe("status");
        expect($rail.classList.contains("yui-badge")).toBe(true);
        expect($rail.classList.contains("yui-nav-badge-pinned")).toBe(false);
        expect($rail.parentNode.tagName).toBe("A");
        expect($rail.previousElementSibling.classList.contains("yui-nav-label")).toBe(true);

        const $bar = badge_in(zone(shell, "bottom"), "alarms");
        expect(shows($bar)).toEqual({text: "2", tones: ["warning"]});
        expect($bar.classList.contains("yui-nav-badge-pinned")).toBe(true);
        expect($bar.parentNode.classList.contains("yui-nav-icon")).toBe(true);
        expect(errors()).toEqual([]);
    });

    test("each declaration seeds its own paint: the drawer's alarms declares none", () => {
        const shell = new_shell();
        expect(shows(badge_in(drawer(shell), "alarms"))).toEqual({text: null, tones: []});
    });

    test("an item without a badge carries an empty one, hidden", () => {
        const shell = new_shell();
        const $b = badge_in(zone(shell, "left"), "home");
        expect(shows($b)).toEqual({text: null, tones: []});
        expect($b.textContent).toBe("");
    });
});

describe("yui_shell_set_nav_item_badge()", () => {
    test("reaches every instance of the item: rail, icon bar and drawer", () => {
        const shell = new_shell();
        yui_shell_set_nav_item_badge(shell, "alarms", 7);

        const all = [...badges_in(root(shell), "alarms")];
        expect(all.length).toBe(3);
        for(const $b of all) {
            /*  No tone given: the default look, not the seed's warning  */
            expect(shows($b)).toEqual({text: "7", tones: []});
        }
        expect(errors()).toEqual([]);
    });

    test("0, \"\" and null clear it", () => {
        const shell = new_shell();
        for(const value of [0, "", null]) {
            yui_shell_set_nav_item_badge(shell, "alarms", 5, "danger");
            yui_shell_set_nav_item_badge(shell, "alarms", value);
            for(const $b of badges_in(root(shell), "alarms")) {
                expect(shows($b), String(value)).toEqual({text: null, tones: []});
                expect($b.textContent).toBe("");
            }
        }
    });

    test("over 99 reads 99+, and a text passes through", () => {
        const shell = new_shell();
        yui_shell_set_nav_item_badge(shell, "alarms", 150);
        expect(shows(badge_in(zone(shell, "left"), "alarms")).text).toBe("99+");
        yui_shell_set_nav_item_badge(shell, "alarms", "!");
        expect(shows(badge_in(zone(shell, "left"), "alarms")).text).toBe("!");
    });

    test("the same value again touches no DOM: the badge is a live region", () => {
        const shell = new_shell();
        yui_shell_set_nav_item_badge(shell, "alarms", 3);
        const $b = badge_in(zone(shell, "left"), "alarms");
        const text = $b.firstChild;
        yui_shell_set_nav_item_badge(shell, "alarms", 3);
        expect($b.firstChild).toBe(text);
    });
});

describe("the tone", () => {
    test("is set, changed and cleared, without rewriting the count", () => {
        const shell = new_shell();
        yui_shell_set_nav_item_badge(shell, "alarms", 3, "danger");
        const $b = badge_in(zone(shell, "bottom"), "alarms");
        const text = $b.firstChild;
        expect(shows($b)).toEqual({text: "3", tones: ["danger"]});

        yui_shell_set_nav_item_badge(shell, "alarms", 3, "info");
        expect(shows($b)).toEqual({text: "3", tones: ["info"]});

        yui_shell_set_nav_item_badge(shell, "alarms", 3);
        expect(shows($b)).toEqual({text: "3", tones: []});
        expect($b.firstChild).toBe(text);
        expect(errors()).toEqual([]);
    });

    test("an unknown one is logged and drawn with the default look", () => {
        const shell = new_shell();
        yui_shell_set_nav_item_badge(shell, "alarms", 3, "red");
        for(const $b of badges_in(root(shell), "alarms")) {
            expect(shows($b)).toEqual({text: "3", tones: []});
        }
        const e = errors();
        expect(e.length).toBe(1);
        expect(e[0]).toContain("yui_shell_set_nav_item_badge('alarms')");
        expect(e[0]).toContain("'red'");
    });

    test("an unknown one is logged even where the id is not", () => {
        const shell = new_shell();
        yui_shell_set_nav_item_badge(shell, "nope", 3, "red");
        expect(errors().length).toBe(1);
    });

    test("an unknown declared one is logged when it is drawn", () => {
        new_nav({layout: "vertical", menu_id: "lab",
            menu_items: [{id: "x", name: "x", route: "/x", badge: 1, badge_tone: "red"}]});
        const e = errors();
        expect(e.length).toBe(1);
        expect(e[0]).toContain("C_YUI_NAV 'lab': item 'x'");
    });
});

describe("the badge survives the nav being rebuilt", () => {
    test("yui_shell_set_submenu() rebuilds the tab strip with it", () => {
        const shell = new_shell();
        yui_shell_set_nav_item_badge(shell, "list", 4, "danger");
        const $old = badge_in(zone(shell, "top-sub"), "list");
        expect(shows($old)).toEqual({text: "4", tones: ["danger"]});

        yui_shell_set_submenu(shell, "devices", devices_items([
            {id: "grid", name: "grid", route: "/devices/grid", target: view(), badge: 9}
        ]));
        const $new = badge_in(zone(shell, "top-sub"), "list");
        expect($new).not.toBe($old);
        expect(shows($new)).toEqual({text: "4", tones: ["danger"]});
        /*  An item given at runtime seeds its own  */
        expect(shows(badge_in(zone(shell, "top-sub"), "grid"))).toEqual({text: "9", tones: []});
        expect(errors()).toEqual([]);
    });

    test("once set, the value of the id wins over a descriptor's own badge", () => {
        const shell = new_shell();
        yui_shell_set_nav_item_badge(shell, "list", 4);
        yui_shell_set_submenu(shell, "devices", [
            {id: "list", name: "list", route: "/devices/list", target: view(),
                badge: 1, badge_tone: "success"}
        ]);
        expect(shows(badge_in(zone(shell, "top-sub"), "list"))).toEqual({text: "4", tones: []});
    });

    test("an item given by yui_shell_set_submenu() is a menu item too", () => {
        const shell = new_shell();
        yui_shell_set_submenu(shell, "devices", devices_items([
            {id: "grid", name: "grid", route: "/devices/grid", target: view()}
        ]));
        yui_shell_set_nav_item_badge(shell, "grid", 2, "warning");
        expect(shows(badge_in(zone(shell, "top-sub"), "grid"))).toEqual({text: "2", tones: ["warning"]});
    });

    test("a submenu of a sibling and a language change leave it as it was", () => {
        const shell = new_shell();
        yui_shell_set_nav_item_badge(shell, "alarms", 6, "info");
        yui_shell_set_submenu(shell, "devices", devices_items());
        yui_shell_set_translator(shell, (key) => String(key).toUpperCase());
        yui_shell_language_changed(shell);

        const $a = zone(shell, "left").querySelector('a[data-item-id="alarms"]');
        expect($a.getAttribute("aria-label")).toBe("ALARMS");     // it did change language
        for(const $b of badges_in(root(shell), "alarms")) {
            expect(shows($b)).toEqual({text: "6", tones: ["info"]});
        }
    });

    test("a nav created after the call draws it: the section-index landing", () => {
        const shell = new_shell();
        yui_shell_set_nav_item_badge(shell, "daily", 5, "success");
        yui_shell_navigate(shell, "/reports");

        const $stage = zone(shell, "center");
        const $b = badge_in($stage, "daily");
        expect($b).toBeTruthy();
        expect(shows($b)).toEqual({text: "5", tones: ["success"]});
        expect($b.parentNode.classList.contains("yui-nav-icon")).toBe(true);
        expect(shows(badge_in($stage, "weekly"))).toEqual({text: null, tones: []});

        /*  ...and, mounted, it is one of the navs the call reaches  */
        yui_shell_set_nav_item_badge(shell, "daily", 8);
        expect(shows(badge_in($stage, "daily"))).toEqual({text: "8", tones: []});
        expect(errors()).toEqual([]);
    });

    test("on its own, a nav keeps what EV_SET_ITEM_BADGE set across EV_SET_ITEMS", () => {
        const nav = new_nav({layout: "vertical", menu_id: "lab",
            menu_items: [{id: "a", name: "a", route: "/a"}]});
        gobj_send_event(nav, "EV_SET_ITEM_BADGE", {item_id: "a", badge: 3, badge_tone: "warning"}, yuno);
        /*  An id it does not draw yet is kept all the same  */
        gobj_send_event(nav, "EV_SET_ITEM_BADGE", {item_id: "c", badge: 1}, yuno);
        expect(shows(badge_in(root(nav), "a"))).toEqual({text: "3", tones: ["warning"]});

        gobj_send_event(nav, "EV_SET_ITEMS", {items: [
            {id: "a", name: "a", route: "/a"},
            {id: "c", name: "c", route: "/c"}
        ]}, yuno);
        expect(shows(badge_in(root(nav), "a"))).toEqual({text: "3", tones: ["warning"]});
        expect(shows(badge_in(root(nav), "c"))).toEqual({text: "1", tones: []});
        expect(errors()).toEqual([]);
    });

    test("EV_SET_ITEM_BADGE without an item id is refused, loudly", () => {
        const nav = new_nav({layout: "vertical", menu_id: "lab", menu_items: []});
        gobj_send_event(nav, "EV_SET_ITEM_BADGE", {badge: 3}, yuno);
        expect(errors().length).toBe(1);
        expect(errors()[0]).toContain("EV_SET_ITEM_BADGE without item_id");
    });
});

describe("an unknown id behaves as the toolbar twin does", () => {
    test("a silent no-op, for the nav and for the toolbar", () => {
        const shell = new_shell();
        const before = badges_in(root(shell), "alarms").map(shows);
        expect(() => {
            yui_shell_set_nav_item_badge(shell, "nope", 3);
            yui_shell_set_toolbar_item_badge(shell, "nope", 3);
            yui_shell_set_nav_item_badge(null, "alarms", 3);
            yui_shell_set_toolbar_item_badge(null, "bell", 3);
            yui_shell_set_nav_item_badge(shell, "", 3);
            yui_shell_set_toolbar_item_badge(shell, "", 3);
        }).not.toThrow();
        expect(errors()).toEqual([]);
        expect(badges_in(root(shell), "alarms").map(shows)).toEqual(before);
    });

    test("and nothing is kept for it: an item that comes later starts with its own", () => {
        const shell = new_shell();
        yui_shell_set_nav_item_badge(shell, "nope", 3);
        yui_shell_set_submenu(shell, "devices", devices_items([
            {id: "nope", name: "nope", route: "/devices/nope", target: view()}
        ]));
        expect(shows(badge_in(zone(shell, "top-sub"), "nope"))).toEqual({text: null, tones: []});
    });
});

describe("where each layout puts it", () => {
    function nav_with(kw, items)
    {
        return root(new_nav(Object.assign({menu_id: "lab", menu_items: items}, kw)));
    }

    test("tabs: after the label, before the close; on the icon of an icon-only tab", () => {
        let $c = nav_with({layout: "tabs"}, [
            {id: "t", name: "t", icon: "yi-eye", route: "/t", closable: true, badge: 2}
        ]);
        let $b = badge_in($c, "t");
        expect($b.parentNode.tagName).toBe("A");
        expect($b.previousElementSibling.getAttribute("data-i18n")).toBe("t");
        expect($b.nextElementSibling.classList.contains("yui-nav-close")).toBe(true);

        $c = nav_with({layout: "tabs", show_label: false}, [
            {id: "t", name: "t", icon: "yi-eye", route: "/t", badge: 2}
        ]);
        expect(badge_in($c, "t").parentNode.classList.contains("yui-nav-icon")).toBe(true);
    });

    test("vertical: on the icon of a stacked item; between label and icon at icon_pos right", () => {
        let $c = nav_with({layout: "vertical", icon_pos: "top"}, [
            {id: "v", name: "v", icon: "yi-eye", route: "/v", badge: 2}
        ]);
        expect(badge_in($c, "v").classList.contains("yui-nav-badge-pinned")).toBe(true);

        $c = nav_with({layout: "vertical", icon_pos: "right"}, [
            {id: "v", name: "v", icon: "yi-eye", route: "/v", badge: 2}
        ]);
        let $b = badge_in($c, "v");
        expect($b.previousElementSibling.classList.contains("yui-nav-label")).toBe(true);
        expect($b.nextElementSibling.classList.contains("icon")).toBe(true);
    });

    test("drawer and submenu: after the label", () => {
        for(const layout of ["drawer", "submenu"]) {
            let $c = nav_with({layout: layout}, [
                {id: "d", name: "d", icon: "yi-eye", route: "/d", badge: 2}
            ]);
            let $b = badge_in($c, "d");
            expect(shows($b), layout).toEqual({text: "2", tones: []});
            expect($b.previousElementSibling.classList.contains("yui-nav-label"), layout).toBe(true);
        }
    });

    test("accordion: after the head's label, and after a leaf's", () => {
        let $c = nav_with({layout: "accordion"}, [
            {id: "s", name: "section", route: "/s", badge: 4, submenu: {items: [
                {id: "l", name: "leaf", route: "/s/l", badge: 1, badge_tone: "info"}
            ]}}
        ]);
        let $head = $c.querySelector(".yui-accordion-head");
        let $hb = $head.querySelector(".NAV_ITEM_BADGE");
        expect(shows($hb)).toEqual({text: "4", tones: []});
        expect($head.firstChild.nodeType).toBe(3);      // the label, which a language change rewrites
        expect(shows(badge_in($c, "l"))).toEqual({text: "1", tones: ["info"]});
    });

    test("cards: on the icon, or after the label of a card without one", () => {
        let $c = nav_with({layout: "cards"}, [
            {id: "c1", name: "c1", icon: "yi-eye", route: "/c1", badge: 2},
            {id: "c2", name: "c2", route: "/c2", badge: 3}
        ]);
        expect(badge_in($c, "c1").parentNode.classList.contains("yui-nav-icon")).toBe(true);
        let $b = badge_in($c, "c2");
        expect($b.parentNode.classList.contains("yui-nav-card")).toBe(true);
        expect($b.previousElementSibling.classList.contains("yui-nav-label")).toBe(true);
    });

    test("breadcrumb: none, deliberately", () => {
        let $c = nav_with({layout: "breadcrumb"}, [
            {id: "b", name: "b", icon: "yi-eye", route: "/b", badge: 2}
        ]);
        expect($c.querySelectorAll(".NAV_ITEM_BADGE").length).toBe(0);
    });
});

describe("the toolbar badge takes a tone too", () => {
    function bell(shell)
    {
        return root(shell).querySelector('[data-toolbar-item-id="bell"] .yui-toolbar-badge');
    }

    test("declared: badge_tone next to badge", () => {
        const shell = new_shell();
        const $b = bell(shell);
        expect(shows($b)).toEqual({text: "4", tones: ["info"]});
        expect($b.classList.contains("TOOLBAR_ITEM_BADGE")).toBe(true);
        expect($b.classList.contains("yui-badge")).toBe(true);
    });

    test("set, changed and cleared; a call with three arguments works as it did", () => {
        const shell = new_shell();
        yui_shell_set_toolbar_item_badge(shell, "bell", 3, "warning");
        expect(shows(bell(shell))).toEqual({text: "3", tones: ["warning"]});
        yui_shell_set_toolbar_item_badge(shell, "bell", 12);
        expect(shows(bell(shell))).toEqual({text: "12", tones: []});
        yui_shell_set_toolbar_item_badge(shell, "bell", 0);
        expect(shows(bell(shell))).toEqual({text: null, tones: []});
        expect(errors()).toEqual([]);
    });

    test("an unknown tone is logged and drawn with the default look", () => {
        const shell = new_shell();
        yui_shell_set_toolbar_item_badge(shell, "bell", 3, "red");
        expect(shows(bell(shell))).toEqual({text: "3", tones: []});
        const e = errors();
        expect(e.length).toBe(1);
        expect(e[0]).toContain("yui_shell_set_toolbar_item_badge('bell')");
    });
});
