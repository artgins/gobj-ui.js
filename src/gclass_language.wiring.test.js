/***********************************************************************
 *          gclass_language.wiring.test.js
 *
 *      C_YUI_GCLASS, the gclass viewer, changes the language of its
 *      COUNTED words ("4 instances", "show all 25") when the app
 *      switches language. Those carry no key on purpose (a key would
 *      make refresh_language() write the bare word over the count), so
 *      only a re-render can change them, and nobody sent the viewer the
 *      switch: open_gclass_view() creates it with no subscriber and its
 *      host does not forward it. It hears the shell's
 *      EV_LANGUAGE_CHANGED itself now, as C_YUI_JSON does.
 *
 *      The real gclass and a real C_YUI_SHELL, on a document double.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {describe, test, expect, beforeAll, beforeEach} from "vitest";
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

const {
    SDATA, SDATA_END, data_type_t, gclass_create, gobj_write_attr,
    gobj_start_up, gobj_create_yuno, gobj_create, gobj_start, gobj_stop,
    gobj_destroy, gobj_read_attr, set_log_callback,
} = await import("@yuneta/gobj-js");
const {register_c_yui_shell, yui_shell_language_changed} = await import("./c_yui_shell.js");
const {register_c_yui_nav} = await import("./c_yui_nav.js");
const {register_c_yui_gclass} = await import("./c_yui_gclass.js");

const logged = [];
let i18next = null;
let yuno = null;
let host = null;
let shell = null;

const DESCRIPTION = {
    id: "C_TCP",
    gcflag: [],
    instances: 4,
    attrs: Array.from({length: 25}, (_, i) => ({
        id: `attr_${i}`, type: "string", flag: "SDF_RD",
        default_value: "", description: `attribute ${i}`
    })),
    commands: [],
    gclass_methods: [],
    internal_methods: [],
    FSM: {events: [], states: {}},
};

beforeAll(async () => {
    i18next = (await import("i18next")).default;
    await i18next.init({lng: "en", resources: {
        en: {translation: {
            "instances": "instances",
            "instances_one": "instance",
            "show all {{n}}": "show all {{n}}",
        }},
        es: {translation: {
            "instances": "instancias",
            "instances_one": "instancia",
            "show all {{n}}": "ver las {{n}}",
        }},
    }});
    gobj_start_up(null, null, null, null, null, null, null);
    set_log_callback((level, msg) => {
        logged.push({level: String(level), msg: String(msg)});
    });
    gclass_create("C_TEST_GCLASS_LANG_YUNO", [], [["ST_IDLE", []]], {}, 0,
        [SDATA_END()], {}, 0, 0, 0, 0);
    gclass_create("C_TEST_GCLASS_LANG_VIEW", [], [["ST_IDLE", []]], {
        mt_create: (gobj) => {
            gobj_write_attr(gobj, "$container", document.createElement("div"));
        }
    }, 0, [SDATA(data_type_t.DTP_POINTER, "$container", 0, null, "view root"), SDATA_END()],
    {}, 0, 0, 0, 0);
    register_c_yui_shell();
    register_c_yui_nav();
    register_c_yui_gclass();
    yuno = gobj_create_yuno("gclass_lang_yuno", "C_TEST_GCLASS_LANG_YUNO", {});
    gobj_start(yuno);
    host = gobj_create("host", "C_TEST_GCLASS_LANG_YUNO", {}, yuno);
    shell = gobj_create("gclass_lang_shell", "C_YUI_SHELL", {use_hash: false, config: {
        shell: {
            zones: {center: {host: "stage.main"}},
            stages: {main: {zone: "center", default_route: "/a"}}
        },
        menu: {primary: {items: [
            {id: "a", name: "a", route: "/a",
                target: {stage: "main", gclass: "C_TEST_GCLASS_LANG_VIEW", kw: {}}}
        ]}}
    }}, yuno);
    gobj_start(shell);
});

beforeEach(async () => {
    logged.length = 0;
    await i18next.changeLanguage("en");
});

function problems()
{
    return logged.filter((l) => l.level === "error" || l.level === "warning").map((l) => l.msg);
}

describe("C_YUI_GCLASS: the counted words follow the language", () => {
    test("the shell's language switch re-renders them", async () => {
        const view = gobj_create("gclass_lang_view", "C_YUI_GCLASS",
            {description: DESCRIPTION}, host);
        gobj_start(view);
        const $c = gobj_read_attr(view, "$container");
        const $more = () => $c.querySelector('.GCLASS_SHOW_ALL[data-zone="attrs"]');
        expect($c.querySelector(".GCLASS_INSTANCES_LABEL").textContent).toBe("instances");
        expect($more().textContent).toBe("show all 25");

        await i18next.changeLanguage("es");
        yui_shell_language_changed(shell);
        expect($c.querySelector(".GCLASS_INSTANCES_LABEL").textContent).toBe("instancias");
        expect([$more().textContent, $more().getAttribute("title"), $more().getAttribute("aria-label")])
            .toEqual(["ver las 25", "ver las 25", "ver las 25"]);

        /*  stopped, it no longer hears the shell  */
        gobj_stop(view);
        gobj_destroy(view);
        await i18next.changeLanguage("en");
        yui_shell_language_changed(shell);
        expect(problems()).toEqual([]);
    });
});
