/***********************************************************************
 *          data_as_text.wiring.test.js
 *
 *      Values that come from a backend, a schema or a record are
 *      DATA: they are shown as text, never parsed as markup. One case
 *      per sink fixed in the review of 2026-10-10 (yunovatios
 *      REV-CLOUD.md V3.1 #1, #2, #4, #5 and V4.2): each one is fed a
 *      markup string and must show it, with no element created.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {describe, test, expect, beforeAll} from "vitest";
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
if(typeof globalThis.matchMedia === "undefined") {
    globalThis.matchMedia = () => ({matches: false, addEventListener() {}, removeEventListener() {}});
}

const {
    SDATA, SDATA_END, data_type_t, gclass_create, gobj_write_attr,
    gobj_start_up, gobj_create_yuno, gobj_create,
    gobj_start, gobj_read_attr, gobj_send_event,
    createElement2,
    set_log_callback,
} = await import("@yuneta/gobj-js");

const EVIL = '<img src=x onerror="window.__pwned=1">';
let yuno = null;

beforeAll(async () => {
    const i18next = (await import("i18next")).default;
    await i18next.init({lng: "en", resources: {}});
    gobj_start_up(null, null, null, null, null, null, null);
    set_log_callback(() => {});
    gclass_create("C_TEST_TEXT_HOST", [], [["ST_IDLE", []]], {}, 0, [SDATA_END()], {}, 0, 0, 0, 0);
    gclass_create(
        "C_TEST_TEXT_JSON_HOST",
        [["EV_EXPAND_PATH", 0]],
        [["ST_IDLE", [["EV_EXPAND_PATH", () => 0, null]]]],
        {}, 0, [SDATA_END()], {}, 0, 0, 0, 0
    );
    gclass_create(
        "C_TEST_TEXT_VIEW", [], [["ST_IDLE", []]], {
            mt_create: (gobj) => {
                gobj_write_attr(gobj, "$container", document.createElement("div"));
            }
        }, 0, [
            SDATA(data_type_t.DTP_POINTER, "$container", 0, null, "view root"),
            SDATA(data_type_t.DTP_POINTER, "subscriber", 0, null, "subscriber"),
            SDATA_END()
        ], {}, 0, 0, 0, 0
    );
    yuno = gobj_create_yuno("data_text_yuno", "C_TEST_TEXT_HOST", {});
    gobj_start(yuno);
});

/*  What a reader sees, and no element built from the data.  */
function expect_text($el, text)
{
    expect($el.textContent.includes(text)).toBe(true);
    expect($el.querySelector("img")).toBe(null);
}

describe("data is text, not markup", () => {
    test("V3.1 #1: an icon cell with a name that fails the check", async () => {
        const {icon_formatter} = await import("./c_yui_treedb_topic_with_form.js");
        const $cell = icon_formatter({getValue: () => EVIL});
        expect_text($cell, EVIL);
    });

    test("V3.1 #2: the schema editor's select options and textarea value", async () => {
        const {select_input, textarea_input} = await import("./c_yui_schema_editor.js");
        const $select = createElement2(select_input("topic", "x", [EVIL, "ok"]));
        expect_text($select, EVIL);
        expect($select.querySelectorAll("option").length).toBe(2);
        const $area = createElement2(textarea_input("desc", EVIL, 3, ""));
        expect_text($area, EVIL);
    });

    test("V3.1 #4: the error of a subtree the JSON viewer could not load", async () => {
        const {register_c_yui_json} = await import("./c_yui_json.js");
        register_c_yui_json();
        const host = gobj_create("json_text_host", "C_TEST_TEXT_JSON_HOST", {}, yuno);
        gobj_start(host);
        const viewer = gobj_create("json_text", "C_YUI_JSON", {view_mode: "tree"}, host);
        gobj_start(viewer);
        gobj_send_event(viewer, "EV_SET_JSON",
            {json: {a: {__collapsed__: {size: 3, path: "a"}}}}, host);
        gobj_send_event(viewer, "EV_SUBTREE_ERROR", {path: "a", error: EVIL}, host);
        const $c = gobj_read_attr(viewer, "$container");
        const $err = $c.querySelector(".JSON_STUB_ERR");
        expect($err).not.toBe(null);
        expect_text($err, EVIL);
    });

    test("V3.1 #5: the shell's toolbar label and dropdown label", async () => {
        const {register_c_yui_shell} = await import("./c_yui_shell.js");
        register_c_yui_shell();
        const config = {
            shell: {
                zones: {top: {host: "toolbar"}, center: {host: "stage.main"}},
                stages: {main: {zone: "center", default_route: "/home"}}
            },
            toolbar: {
                zone: "top",
                items: [
                    {id: "plain", name: EVIL,
                     action: {type: "event", event: "EV_TEXT_PLAIN"}},
                    {id: "menu", name: "menu",
                     action: {type: "dropdown", items: [
                         {id: "sub", name: EVIL,
                          action: {type: "event", event: "EV_TEXT_SUB"}}
                     ]}}
                ]
            },
            menu: {
                primary: {items: [{id: "home", route: "/home",
                    target: {stage: "main", gclass: "C_TEST_TEXT_VIEW", kw: {}}}]}
            }
        };
        const shell = gobj_create("text_shell", "C_YUI_SHELL", {config: config}, yuno);
        gobj_start(shell);
        const $c = gobj_read_attr(shell, "$container");

        const $label = $c.querySelector('[data-toolbar-item-id="plain"] .yui-toolbar-item-label');
        expect($label).not.toBe(null);
        expect_text($label, EVIL);

        const $menu = $c.querySelector('[data-toolbar-item-id="menu"]');
        expect($menu).not.toBe(null);
        $menu.click();
        const $sub = document.querySelector(".yui-toolbar-dropdown-label");
        expect($sub).not.toBe(null);
        expect_text($sub, EVIL);
    });

    test("V4.2: a topic name in the treedb graph legend", async () => {
        const {legend_name_item} = await import("./c_yui_treedb_graph.js");
        for(const [is_main, hidden] of [[false, false], [true, false], [false, true]]) {
            const $name = createElement2(legend_name_item(EVIL, is_main, hidden));
            expect($name.textContent).toBe(EVIL);
            expect($name.querySelector("img")).toBe(null);
        }
    });

    test("V4.2: the G6 toolbar escapes what it puts in its markup", async () => {
        const {toolbar_item_html} = await import("./c_g6_nodes_tree.js");
        const items = [
            {readout: true, text: EVIL, title: EVIL, className: EVIL},
            {id: EVIL, value: EVIL, title: EVIL},
            {text: EVIL, value: "v", title: "t"},
        ];
        /*  The DOM double builds no element out of markup, so the html is
         *  read here as a browser would: tags out, entities decoded. What
         *  the reader sees and what each attribute holds must be the
         *  value itself -- an unescaped value drops out of the text.  */
        const decode = (v) => v.replace(/&lt;/g, "<").replace(/&gt;/g, ">")
            .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
        const visible = (html) => decode(html.replace(/<[^>]*>/g, ""));
        const attr = (html, name) => {
            const m = html.match(new RegExp(` ${name}="([^"]*)"`));
            return m ? decode(m[1]) : null;
        };
        const read = toolbar_item_html(items[0]);
        expect(visible(read)).toBe(EVIL);
        expect(attr(read, "title")).toBe(EVIL);
        expect(attr(read, "aria-label")).toBe(EVIL);
        expect(attr(read, "class")).toBe(`g6-toolbar-readout ${EVIL}`);

        const icon = toolbar_item_html(items[1]);
        expect(visible(icon)).toBe("");
        expect(attr(icon, "value")).toBe(EVIL);
        expect(attr(icon, "title")).toBe(EVIL);
        expect(attr(icon, "xlink:href")).toBe(`#${EVIL}`);

        const text = toolbar_item_html(items[2]);
        expect(visible(text)).toBe(EVIL);

        for(const item of items) {
            expect(toolbar_item_html(item).includes("<img")).toBe(false);
        }
    });
});
