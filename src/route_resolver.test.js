/***********************************************************************
 *          route_resolver.test.js
 *
 *          Unit tests for the pure shell route resolver.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import { describe, test, expect } from "vitest";
import { resolve_route, normalize_route } from "./route_resolver.js";

/*  Minimal route table shaped like C_YUI_SHELL.priv.item_index. */
function make_index() {
    const view = (gclass) => ({ stage: "main", gclass: gclass });
    return {
        "/":                 { item: null, target: view("C_WZ_VIEW") },
        "/monitoring/realtime": { item: null, target: view("C_WZ_MONITORING") },
        "/system":           { item: { submenu: { items: [] } }, target: null },
        "/system/db/wattyzer": { item: null, target: view("C_WZ_TREEDB") },
        "/user/preference":  { item: null, target: view("C_WZ_PREFERENCES") },
        "/user/logout":      { item: null, target: { kind: "action", event: "EV_LOGOUT" } },
    };
}

describe("resolve_route", () => {
    const idx = make_index();

    test("exact view hit → entry, no subpath", () => {
        const r = resolve_route(idx, "/monitoring/realtime");
        expect(r.matched_route).toBe("/monitoring/realtime");
        expect(r.subpath).toBe("");
        expect(r.entry.target.gclass).toBe("C_WZ_MONITORING");
    });

    test("exact root '/' matches exactly (not via walk)", () => {
        const r = resolve_route(idx, "/");
        expect(r.matched_route).toBe("/");
        expect(r.subpath).toBe("");
        expect(r.entry.target.gclass).toBe("C_WZ_VIEW");
    });

    test("3rd level → nearest declared ancestor + subpath", () => {
        const r = resolve_route(idx, "/user/preference/language");
        expect(r.matched_route).toBe("/user/preference");
        expect(r.subpath).toBe("language");
        expect(r.entry.target.gclass).toBe("C_WZ_PREFERENCES");
    });

    test("deeper dynamic tail is preserved whole", () => {
        const r = resolve_route(idx, "/system/db/wattyzer/topic/42");
        expect(r.matched_route).toBe("/system/db/wattyzer");
        expect(r.subpath).toBe("topic/42");
    });

    test("action route resolves exactly, kind untouched", () => {
        const r = resolve_route(idx, "/user/logout");
        expect(r.matched_route).toBe("/user/logout");
        expect(r.entry.target.kind).toBe("action");
        expect(r.entry.target.event).toBe("EV_LOGOUT");
    });

    test("root is NOT an ancestor catch-all → unknown stays unknown", () => {
        const r = resolve_route(idx, "/zzz");
        expect(r.matched_route).toBe("/zzz");
        expect(r.subpath).toBe("");
        expect(r.entry).toBeUndefined();        /*  caller → default route */
    });

    test("unknown deep route never collapses onto '/'", () => {
        const r = resolve_route(idx, "/nope/deeper/still");
        expect(r.matched_route).toBe("/nope/deeper/still");
        expect(r.entry).toBeUndefined();
    });

    test("targetless submenu parent is returned as-is (subpath empty)", () => {
        const r = resolve_route(idx, "/system");
        expect(r.matched_route).toBe("/system");
        expect(r.subpath).toBe("");
        expect(r.entry.target).toBeNull();
        expect(r.entry.item.submenu).toBeTruthy();
    });
});

describe("normalize_route", () => {
    test("already canonical → unchanged", () => {
        expect(normalize_route("/a/b")).toBe("/a/b");
    });

    test("trailing slash stripped", () => {
        expect(normalize_route("/a/b/")).toBe("/a/b");
    });

    test("multiple trailing slashes stripped", () => {
        expect(normalize_route("/a/b///")).toBe("/a/b");
    });

    test("duplicate inner slashes collapsed", () => {
        expect(normalize_route("//a///b")).toBe("/a/b");
    });

    test("missing leading slash added", () => {
        expect(normalize_route("a/b")).toBe("/a/b");
    });

    test("root stays root", () => {
        expect(normalize_route("/")).toBe("/");
        expect(normalize_route("///")).toBe("/");
    });

    test("empty stays empty (caller decides the error)", () => {
        expect(normalize_route("")).toBe("");
        expect(normalize_route(null)).toBe("");
    });

    test("normalized trailing-slash route resolves like the clean one", () => {
        const idx = make_index();
        const r = resolve_route(idx, normalize_route("/monitoring/realtime/"));
        expect(r.matched_route).toBe("/monitoring/realtime");
        expect(r.subpath).toBe("");
    });
});
