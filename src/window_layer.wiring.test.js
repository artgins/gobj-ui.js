/***********************************************************************
 *          window_layer.wiring.test.js
 *
 *      Where a C_YUI_WINDOW lives when its host names no `$parent`:
 *      the OVERLAY layer of the shell, below the layers of the
 *      dropdowns, the dialogs and the toasts -- not document.body,
 *      where it covered the whole shell (a stacking context of its
 *      own) and the dialog of its own close opened under it.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {describe, test, expect, beforeAll} from "vitest";
import {install_dom_double} from "../test/dom_double.js";

install_dom_double();

if(typeof globalThis.matchMedia === "undefined") {
    globalThis.matchMedia = () => ({matches: false, addEventListener() {}, removeEventListener() {}});
}

const {
    SDATA, SDATA_END, data_type_t, gclass_create, gobj_write_attr,
    gobj_start_up, gobj_create_yuno, gobj_create, gobj_create_service,
    gobj_start, gobj_stop, gobj_destroy, gobj_read_attr,
} = await import("@yuneta/gobj-js");
const {register_c_yui_shell} = await import("./c_yui_shell.js");
const {register_c_yui_nav} = await import("./c_yui_nav.js");
const {register_c_yui_window} = await import("./c_yui_window.js");

let yuno = null;

beforeAll(async () => {
    const i18next = (await import("i18next")).default;
    await i18next.init({lng: "en", resources: {}});
    gobj_start_up(null, null, null, null, null, null, null);
    gclass_create("C_TEST_LAYER_HOST", [], [["ST_IDLE", []]], {}, 0, [SDATA_END()], {}, 0, 0, 0, 0);
    gclass_create(
        "C_TEST_LAYER_VIEW", [], [["ST_IDLE", []]], {
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
    register_c_yui_window();
    yuno = gobj_create_yuno("layer_yuno", "C_TEST_LAYER_HOST", {});
    gobj_start(yuno);
});

describe("the default parent of a window", () => {
    test("with no shell: document.body", () => {
        const w = gobj_create_service("layer_w0", "C_YUI_WINDOW", {header: "w", body: ["div", {}, "w"]}, yuno);
        gobj_start(w);
        expect(gobj_read_attr(w, "$container").parentNode).toBe(document.body);
        gobj_stop(w);
        gobj_destroy(w);
    });

    test("with a shell: its overlay layer, also for a window that is not its child", () => {
        const shell = gobj_create("layer_shell", "C_YUI_SHELL", {
            config: {
                shell: {
                    zones: {center: {host: "stage.main"}},
                    stages: {main: {zone: "center", default_route: "/a"}}
                },
                menu: {primary: {items: [
                    {id: "a", name: "a", route: "/a",
                     target: {stage: "main", gclass: "C_TEST_LAYER_VIEW", kw: {}}}
                ]}}
            },
            use_hash: false
        }, yuno);
        gobj_start(shell);

        /*  A child of the shell, and one parented to the app (the dev
         *  window, a device window of a view): both in the overlay.  */
        const inside = gobj_create_service("layer_w1", "C_YUI_WINDOW", {header: "a", body: ["div", {}, "a"]}, shell);
        gobj_start(inside);
        const outside = gobj_create_service("layer_w2", "C_YUI_WINDOW", {header: "b", body: ["div", {}, "b"]}, yuno);
        gobj_start(outside);

        const overlay = shell.priv.layers.overlay;
        expect(overlay).toBeTruthy();
        expect(gobj_read_attr(inside, "$container").parentNode).toBe(overlay);
        expect(gobj_read_attr(outside, "$container").parentNode).toBe(overlay);

        /*  And a `$parent` named by the host still wins.  */
        const $mine = document.createElement("div");
        const named = gobj_create_service("layer_w3", "C_YUI_WINDOW",
            {header: "c", body: ["div", {}, "c"], $parent: $mine}, yuno);
        gobj_start(named);
        expect(gobj_read_attr(named, "$container").parentNode).toBe($mine);

        for(const w of [inside, outside, named]) {
            gobj_stop(w);
            gobj_destroy(w);
        }
        gobj_stop(shell);
        gobj_destroy(shell);
    });
});
