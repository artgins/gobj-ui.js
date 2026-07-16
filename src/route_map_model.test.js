/***********************************************************************
 *          route_map_model.test.js
 *
 *          Unit tests for the pure site-map (nav map) builder.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import { describe, test, expect } from "vitest";
import { build_nav_map } from "./route_map_model.js";

const view = (gclass) => ({ stage: "main", gclass: gclass });

/*  A config + index shaped like a small wattyzer-style app:
 *  toolbar (brand + account dropdown), a primary menu with a submenu,
 *  a second menu, and a route table with URL-only routes. */
function make_input(extra)
{
    const config = {
        toolbar: { items: [
            { type: "brand", id: "brand", wordmark: "demo",
              action: { type: "navigate", route: "/" } },
            { id: "theme", name: "theme",
              action: { type: "event", event: "EV_TOGGLE_THEME" } },
            { type: "avatar", id: "user", name: "account",
              action: { type: "dropdown", items: [
                  { id: "sitemap", name: "site map",
                    action: { type: "navigate", route: "/sitemap" } },
                  { type: "divider" },
                  { id: "logout", name: "logout",
                    action: { type: "event", event: "EV_LOGOUT" } }
              ] } }
        ] },
        menu: {
            primary: { items: [
                { id: "reports", name: "reports", route: "/reports",
                  submenu: { items: [
                      { id: "a", name: "a", route: "/reports/a" }
                  ] } },
                { id: "form", name: "form", route: "/form" }
            ] },
            footer: { items: [
                { id: "legal", name: "legal", route: "/legal" }
            ] }
        }
    };
    const item_index = {
        "/":          { item: null, target: view("C_HOME") },
        "/reports":   { item: config.menu.primary.items[0], target: null },
        "/reports/a": { item: null, target: view("C_REPORT_A") },
        "/form":      { item: null, target: view("C_FORM") },
        "/legal":     { item: null, target: view("C_LEGAL") },
        "/sitemap":   { item: null,
                        target: { kind: "action", event: "EV_OPEN_SITEMAP",
                                  redirect: "back" } },
        "/hidden":    { item: null, target: view("C_HIDDEN") }
    };
    return Object.assign({
        config: config,
        item_index: item_index,
        sub_routes: {},
        event_handlers: {},
        current_route: ""
    }, extra || {});
}

describe("build_nav_map", () => {
    test("brand + toolbar in declaration order, dividers skipped", () => {
        const m = build_nav_map(make_input());
        expect(m.brand).toEqual({ label: "demo", route: "/" });
        expect(m.toolbar.map(n => n.id)).toEqual(["theme", "user"]);
        expect(m.toolbar[1].children.map(n => n.id))
            .toEqual(["sitemap", "logout"]);
    });

    test("action-route item shows the event it fires", () => {
        const m = build_nav_map(make_input());
        const sitemap = m.toolbar[1].children[0];
        expect(sitemap.route).toBe("/sitemap");
        expect(sitemap.event).toBe("EV_OPEN_SITEMAP");
    });

    test("primary menu flat; other menus as labelled groups", () => {
        const m = build_nav_map(make_input());
        expect(m.nav.map(n => n.id)).toEqual(["reports", "form", "footer"]);
        const footer = m.nav[2];
        expect(footer.kind).toBe("group");
        expect(footer.children.map(n => n.route)).toEqual(["/legal"]);
    });

    test("other: uncovered route-table routes only, in index order", () => {
        const m = build_nav_map(make_input());
        /*  "/" is brand-covered; "/sitemap" is dropdown-covered;
         *  "/legal" is footer-covered → only "/hidden" is left. */
        expect(m.other.map(n => n.route)).toEqual(["/hidden"]);
        expect(m.other[0].gclass).toBe("C_HIDDEN");
    });

    test("dynamic submenu children merged by parent id", () => {
        const input = make_input();
        input.item_index["/reports/rt1"] = {
            item: { id: "rt1", name: "runtime tab" },
            parent_item: input.config.menu.primary.items[0],
            target: view("C_RT")
        };
        const m = build_nav_map(input);
        const reports = m.nav[0];
        expect(reports.children.map(n => n.route))
            .toEqual(["/reports/a", "/reports/rt1"]);
        /*  ...and a dynamic child is covered, not duplicated in other. */
        expect(m.other.map(n => n.route)).toEqual(["/hidden"]);
    });

    test("sub_routes enrich their base node (and count as covered)", () => {
        const input = make_input({
            sub_routes: { "/reports/a": [
                { route: "/reports/a/x", label: "x" }
            ] }
        });
        const m = build_nav_map(input);
        const a = m.nav[0].children[0];
        expect(a.children.map(n => n.route)).toEqual(["/reports/a/x"]);
    });

    test("event handlers stamp the implementing gclass", () => {
        const input = make_input({
            event_handlers: { "EV_LOGOUT": ["C_APP"] }
        });
        const m = build_nav_map(input);
        const logout = m.toolbar[1].children[1];
        expect(logout.gclass).toBe("C_APP");
    });

    test("current: exact route marked", () => {
        const m = build_nav_map(make_input({ current_route: "/form" }));
        const form = m.nav[1];
        expect(form.current).toBe(true);
    });

    test("current: deep subpath marks the longest base node", () => {
        const m = build_nav_map(
            make_input({ current_route: "/reports/a/topic/42" }));
        expect(m.nav[0].children[0].current).toBe(true);   /*  /reports/a  */
        expect(m.nav[0].current).toBeUndefined();
    });

    test("current: the brand's own route is markable (it renders as root)", () => {
        const m = build_nav_map(make_input({ current_route: "/" }));
        expect(m.brand.current).toBe(true);
    });

    test("current: a menu item beats the brand on the same route", () => {
        const input = make_input({ current_route: "/" });
        input.config.menu.primary.items.push(
            { id: "home", name: "home", route: "/" });
        const m = build_nav_map(input);
        expect(m.nav.find(n => n.id === "home").current).toBe(true);
        expect(m.brand.current).toBeUndefined();
    });

    /*  yui_shell_set_sub_routes stores the view's array BY REFERENCE, so a
     *  builder that splices those objects in and stamps `current` on one
     *  leaves the mark on a view-owned object forever: the next build shows
     *  a second "you are here" and the viewer scrolls to the stale one. */
    test("sub-route contributions are cloned, never marked in place", () => {
        const sub_routes = { "/reports": [
            { id: "", label: "a", icon: "", route: "/reports/topic",
              event: "", gclass: "C_TOPIC", kind: "route", children: [] }
        ] };
        const marked = (m) => {
            const out = [];
            const visit = (n) => {
                if(n.current) {
                    out.push(n.route);
                }
                (n.children || []).forEach(visit);
            };
            m.toolbar.forEach(visit);
            m.nav.forEach(visit);
            m.other.forEach(visit);
            return out;
        };

        const first = build_nav_map(
            make_input({ sub_routes: sub_routes, current_route: "/reports/topic" }));
        expect(marked(first)).toEqual(["/reports/topic"]);
        /*  the caller's own object was never touched  */
        expect(sub_routes["/reports"][0].current).toBeUndefined();

        const second = build_nav_map(
            make_input({ sub_routes: sub_routes, current_route: "/form" }));
        expect(marked(second)).toEqual(["/form"]);
    });

    test("current: at most one node, none when nothing matches", () => {
        const m = build_nav_map(make_input({ current_route: "/nope" }));
        const marked = [];
        const visit = (n) => {
            if(n.current) {
                marked.push(n.route);
            }
            (n.children || []).forEach(visit);
        };
        m.toolbar.forEach(visit);
        m.nav.forEach(visit);
        m.other.forEach(visit);
        expect(marked).toEqual([]);
    });
});
