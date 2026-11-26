/***********************************************************************
 *          preferences.wiring.test.js
 *
 *      The Preferences page every app shows (C_YUI_PREFERENCES and the
 *      parts of yui_preferences.js):
 *
 *        - three rows: theme, language, navigation, each marking the
 *          current choice;
 *        - a press applies through what the app registered
 *          (yui_preferences_setup), and the page marks the new choice;
 *        - the navigation is the shell's (yui_shell_nav_mode): a
 *          C_YUI_NODE tree with no mode of its own follows it, one with
 *          its own keeps it;
 *        - a language is shown and named in its own words, with `lang`;
 *        - the boxes the app adds come after the three rows.
 *
 *      Driven through the real gclasses on a document double.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {test, expect, beforeAll, beforeEach} from "vitest";
import {install_dom_double} from "../test/dom_double.js";

install_dom_double();

const {
    SDATA_END, gclass_create,
    gobj_start_up, gobj_create_yuno, gobj_create, gobj_create_pure_child,
    gobj_start, gobj_send_event, gobj_read_attr,
    set_log_callback,
} = await import("@yuneta/gobj-js");
const {register_c_yui_shell, yui_shell_nav_mode} = await import("./c_yui_shell.js");
const {register_c_yui_nav} = await import("./c_yui_nav.js");
const {register_c_yui_node, yui_node_nav_mode} = await import("./c_yui_node.js");
const {register_c_yui_preferences} = await import("./c_yui_preferences.js");
const {yui_preferences_setup} = await import("./yui_preferences.js");

const logged = [];
const applied = [];
const state = {theme: "light", language: "en"};
let yuno = null;
let seq = 0;

beforeAll(async () => {
    const i18next = (await import("i18next")).default;
    await i18next.init({lng: "en", resources: {}});
    gobj_start_up(null, null, null, null, null, null, null);
    set_log_callback((level, msg) => {
        logged.push({level: String(level), msg: String(msg)});
    });
    gclass_create("C_TEST_PREF_HOST", [], [["ST_IDLE", []]], {}, 0, [SDATA_END()], {}, 0, 0, 0, 0);
    register_c_yui_shell();
    register_c_yui_nav();
    register_c_yui_node();
    register_c_yui_preferences();
    yuno = gobj_create_yuno("pref_yuno", "C_TEST_PREF_HOST", {});
    gobj_start(yuno);

    yui_preferences_setup({
        current_theme:    () => state.theme,
        set_theme:        (v) => { state.theme = v; applied.push(["theme", v]); },
        languages:        [{value: "en", text: "English"}, {value: "es", text: "Español"}],
        current_language: () => state.language,
        set_language:     (v) => { state.language = v; applied.push(["language", v]); },
        sections:         () => [["div", {class: "APP_BOX box"}, "the app's own"]],
    });
});

beforeEach(() => {
    logged.length = 0;
    applied.length = 0;
    window.localStorage.removeItem("yui_nav_mode");
});

/*  The errors of the page, without the routing of a shell that has no
 *  routes: it starts on "/home" and has no target for it.  */
function errors()
{
    return logged.filter((l) => l.level === "error").map((l) => l.msg)
        .filter((m) => !m.includes("no target for route"));
}

function new_page()
{
    const n = ++seq;
    const shell = gobj_create(`pref_shell_${n}`, "C_YUI_SHELL",
        {config: {shell: {}}, default_route: "/home"}, yuno);
    gobj_start(shell);
    const page = gobj_create(`pref_page_${n}`, "C_YUI_PREFERENCES", {}, shell);
    gobj_start(page);
    return {shell, page, $c: gobj_read_attr(page, "$container")};
}

/*  The value of the marked option of a row  */
function marked($c, row)
{
    const $on = $c.querySelector(`.${row} .PREF_SEGMENT_ITEM.is-selected`);
    return $on ? $on.querySelector(".PREF_SEGMENT_TEXT").textContent : null;
}

test("three rows, each marking the current choice, then the app's boxes", () => {
    const {$c} = new_page();
    expect($c.querySelector(".PREF_TITLE")).not.toBe(null);
    expect($c.querySelectorAll(".PREF_APPEARANCE .PREF_FIELD").length).toBe(3);
    expect(marked($c, "PREF_THEME")).toBe("light theme");
    expect(marked($c, "PREF_LANGUAGE")).toBe("English");
    expect(marked($c, "PREF_NAVIGATION")).toBe("stacked strips");
    expect($c.querySelector(".APP_BOX")).not.toBe(null);
    expect(errors()).toEqual([]);
});

test("a language is shown and named in its own words, with its lang", () => {
    const {$c} = new_page();
    const $es = $c.querySelectorAll(".PREF_LANGUAGE .PREF_SEGMENT_ITEM")[1];
    expect($es.getAttribute("aria-label")).toBe("Español");
    expect($es.getAttribute("lang")).toBe("es");
});

test("a press applies through the app and the page marks it", () => {
    const {page, $c} = new_page();
    gobj_send_event(page, "EV_SET_THEME", {value: "dark"}, page);
    gobj_send_event(page, "EV_SET_LANGUAGE", {value: "es"}, page);
    expect(applied).toEqual([["theme", "dark"], ["language", "es"]]);
    expect(marked($c, "PREF_THEME")).toBe("dark theme");
    expect(marked($c, "PREF_LANGUAGE")).toBe("Español");
    state.theme = "light";
    state.language = "en";
    expect(errors()).toEqual([]);
});

test("the navigation is the shell's, and a tree with no mode of its own follows it", () => {
    const {shell, page, $c} = new_page();
    const follows = gobj_create_pure_child(`pref_tree_a_${seq}`, "C_YUI_NODE", {
        node_id: "a", base_route: "/a", children: [{id: "x", label: "X"}]
    }, shell);
    gobj_start(follows);
    const pinned = gobj_create_pure_child(`pref_tree_b_${seq}`, "C_YUI_NODE", {
        node_id: "b", base_route: "/b", nav_mode: "back", children: [{id: "y", label: "Y"}]
    }, shell);
    gobj_start(pinned);

    gobj_send_event(page, "EV_SET_NAV_MODE", {value: "path"}, page);
    expect(yui_shell_nav_mode(shell)).toBe("path");
    expect(marked($c, "PREF_NAVIGATION")).toBe("breadcrumb");
    expect(yui_node_nav_mode(follows)).toBe("path");
    expect(yui_node_nav_mode(pinned)).toBe("back");

    gobj_send_event(page, "EV_SET_NAV_MODE", {value: "stack"}, page);
    expect(yui_node_nav_mode(follows)).toBe("stack");
    expect(errors()).toEqual([]);
});

test("an unknown navigation mode is refused, and said", () => {
    const {shell, page} = new_page();
    gobj_send_event(page, "EV_SET_NAV_MODE", {value: "sideways"}, page);
    expect(yui_shell_nav_mode(shell)).toBe("stack");
    expect(errors().some((e) => e.includes("unknown nav_mode 'sideways'"))).toBe(true);
});
