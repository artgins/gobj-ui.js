/***********************************************************************
 *          window_veto_back.wiring.test.js
 *
 *      A floating C_YUI_WINDOW registers an entry in the shell's
 *      overlay history, so the browser Back closes it. The shell takes
 *      that entry off its stack BEFORE it calls the close; when a
 *      subscriber vetoed the close (EV_WINDOW_TO_CLOSE + abort_close),
 *      the window stayed up with no entry: the next Back did not close
 *      it, and a route change left it floating over the next view.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {describe, test, expect, beforeAll, beforeEach} from "vitest";
import {install_dom_double} from "../test/dom_double.js";

install_dom_double();

const {
    SDATA_END, gclass_create,
    gobj_start_up, gobj_create_yuno, gobj_create, gobj_create_service,
    gobj_start, gobj_read_attr, gobj_is_destroying,
    set_log_callback,
} = await import("@yuneta/gobj-js");
const {register_c_yui_shell} = await import("./c_yui_shell.js");
const {register_c_yui_window} = await import("./c_yui_window.js");

const logged = [];
let veto = true;
let yuno = null;

beforeAll(async () => {
    const i18next = (await import("i18next")).default;
    await i18next.init({lng: "en", resources: {}});
    gobj_start_up(null, null, null, null, null, null, null);
    set_log_callback((level, msg) => {
        logged.push({level: String(level), msg: String(msg)});
    });
    gclass_create("C_TEST_VETO_HOST", [], [["ST_IDLE", []]], {}, 0, [SDATA_END()], {}, 0, 0, 0, 0);
    gclass_create(
        "C_TEST_VETO_APP",
        [["EV_WINDOW_TO_CLOSE", 0]],
        [["ST_IDLE", [
            ["EV_WINDOW_TO_CLOSE", (gobj, event, kw) => {
                kw.abort_close = veto;
                return 0;
            }, null]
        ]]],
        {}, 0, [SDATA_END()], {}, 0, 0, 0, 0
    );
    register_c_yui_shell();
    register_c_yui_window();
    yuno = gobj_create_yuno("veto_yuno", "C_TEST_VETO_HOST", {});
    gobj_start(yuno);
});

beforeEach(() => {
    logged.length = 0;
    veto = true;
});

function errors()
{
    return logged.filter((l) => l.level === "error").map((l) => l.msg);
}

function press_back()
{
    window.history.state = null;
    window.dispatchEvent(new Event("popstate", {state: null}));
}

describe("a floating window that vetoes its close", () => {
    test("keeps a Back entry, and closes on the Back after the veto is lifted", () => {
        const app = gobj_create("vapp", "C_TEST_VETO_APP", {}, yuno);
        gobj_start(app);
        const shell = gobj_create("vshell", "C_YUI_SHELL",
            {config: {shell: {}}, default_route: "/home", subscriber: app}, app);
        gobj_start(shell);
        logged.length = 0;     /*  the shell's own start: no route table here  */

        const win = gobj_create_service("vwin", "C_YUI_WINDOW",
            {subscriber: app, header: "x", body: ["div", {}, "body"]}, app);
        gobj_start(win);
        const first = gobj_read_attr(win, "back_overlay");
        expect(first).toBeTruthy();

        press_back();
        expect(gobj_is_destroying(win)).toBe(false);
        const second = gobj_read_attr(win, "back_overlay");
        expect(second).toBeTruthy();
        expect(second).not.toBe(first);
        expect(shell.priv.overlay_stack).toEqual([second]);

        veto = false;
        press_back();
        expect(gobj_is_destroying(win)).toBe(true);
        expect(shell.priv.overlay_stack).toEqual([]);
        expect(errors()).toEqual([]);
    });
});
