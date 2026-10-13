/***********************************************************************
 *          window_layer.wiring.test.js
 *
 *      Where a C_YUI_WINDOW lives when its host names no `$parent`:
 *      the WINDOW layer of the shell, a stacking context inside the
 *      overlay layer, below the drawer, the dropdowns, the dialogs and
 *      the toasts -- not document.body, where it covered the whole
 *      shell (a stacking context of its own) and the dialog of its own
 *      close opened under it.
 *
 *      And that the place FOLLOWS the shell (REV-CLOUD V23.3): a window
 *      parented to the app outlives a logout that destroys the shell.
 *      From 7.26.31 to 7.26.34 it stayed in the destroyed shell's layer,
 *      alive and detached, and the next shell never placed it again: the
 *      developer window of gui_agent, gui_treedb and wattyzer vanished
 *      after a logout and a login. The dock, the same.
 *
 *      The gclass viewer opened from such a window follows it
 *      (REV-CLOUD V24.5.6): up to 7.26.41 it was told the element its
 *      opener hung from as its `$parent` -- the body, between a logout and
 *      the next login -- and stayed there after the login, above the new
 *      shell's dialogs. And with two shells alive, destroying the last one
 *      gives the windows to the other (it gave them to the body).
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {describe, test, expect, beforeAll, beforeEach} from "vitest";
import {readFileSync} from "node:fs";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";
import {install_dom_double} from "../test/dom_double.js";

install_dom_double();

if(typeof globalThis.matchMedia === "undefined") {
    globalThis.matchMedia = () => ({matches: false, addEventListener() {}, removeEventListener() {}});
}

/*  The gclass viewer watches its container; nothing resizes here.  */
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
    gobj_start_up, gobj_create_yuno, gobj_create, gobj_create_service,
    gobj_start, gobj_stop, gobj_destroy, gobj_read_attr, gobj_is_destroying,
    set_log_callback,
} = await import("@yuneta/gobj-js");
const {register_c_yui_shell, yui_shell_window_layer, yui_shell_language_changed} = await import("./c_yui_shell.js");
const {register_c_yui_nav} = await import("./c_yui_nav.js");
const {register_c_yui_window} = await import("./c_yui_window.js");
const {register_c_yui_window_manager} = await import("./c_yui_window_manager.js");
const {open_gclass_view, close_gclass_view} = await import("./yui_gclass_view.js");

const SRC = dirname(fileURLToPath(import.meta.url));

const logged = [];
let yuno = null;
let seq = 0;

beforeAll(async () => {
    const i18next = (await import("i18next")).default;
    await i18next.init({lng: "en", resources: {}});
    gobj_start_up(null, null, null, null, null, null, null);
    set_log_callback((level, msg) => {
        logged.push({level: String(level), msg: String(msg)});
    });
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
    register_c_yui_window_manager();
    yuno = gobj_create_yuno("layer_yuno", "C_TEST_LAYER_HOST", {});
    gobj_start(yuno);
});

beforeEach(() => {
    logged.length = 0;
});

function errors()
{
    return logged.filter((l) => l.level === "error").map((l) => l.msg);
}

/*  A shell with one routed view, as an app builds it at login.  */
function build_shell(opts)
{
    const shell = gobj_create(`layer_shell_${++seq}`, "C_YUI_SHELL", Object.assign({
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
    }, opts || {}), yuno);
    gobj_start(shell);
    return shell;
}

/*  What an app does at logout (gui_agent's destroy_shell()).  */
function logout(shell)
{
    gobj_stop(shell);
    gobj_destroy(shell);
}

function open_window(name, kw, parent)
{
    const w = gobj_create_service(name, "C_YUI_WINDOW",
        Object.assign({header: name, body: ["div", {}, name]}, kw || {}), parent || yuno);
    gobj_start(w);
    return w;
}

function close(w)
{
    gobj_stop(w);
    gobj_destroy(w);
}

/*  Identity, asked as a boolean: a failing toBe() over a DOM double
 *  makes vitest pretty-print it, and the double has no attribute list.  */
function lives_in(w, $place)
{
    return gobj_read_attr(w, "$container").parentNode === $place;
}

function on_page(w)
{
    return document.documentElement.contains(gobj_read_attr(w, "$container"));
}

describe("the default parent of a window", () => {
    test("with no shell: document.body", () => {
        const w = open_window("layer_w0");
        expect(lives_in(w, document.body)).toBe(true);
        close(w);
    });

    test("with a shell: its window layer, inside the overlay layer, also for a window that is not its child", () => {
        const shell = build_shell();

        /*  A child of the shell, and one parented to the app (the dev
         *  window, a device window of a view): both in the window layer.  */
        const inside = open_window("layer_w1", {}, shell);
        const outside = open_window("layer_w2");

        const overlay = shell.priv.layers.overlay;
        const windows = yui_shell_window_layer(shell);
        expect(!!overlay).toBe(true);
        expect(windows.parentNode === overlay).toBe(true);
        expect(windows.classList.contains("SHELL_WINDOW_LAYER")).toBe(true);
        expect(lives_in(inside, windows)).toBe(true);
        expect(lives_in(outside, windows)).toBe(true);

        /*  And a `$parent` named by the host still wins.  */
        const $mine = document.createElement("div");
        const named = open_window("layer_w3", {$parent: $mine});
        expect(lives_in(named, $mine)).toBe(true);

        for(const w of [inside, outside, named]) {
            close(w);
        }
        logout(shell);
        expect(errors()).toEqual([]);
    });
});

describe("a window outlives its shell (logout, then login)", () => {
    test("it goes to the body with the shell, and the next shell takes it in", () => {
        const shell1 = build_shell();
        const dev = open_window("layer_dev");       /*  parented to the app  */
        expect(lives_in(dev, yui_shell_window_layer(shell1))).toBe(true);

        /*  Logout: the shell and its layers go, the window does not.  */
        logout(shell1);
        expect(gobj_is_destroying(dev)).toBe(false);
        expect(lives_in(dev, document.body)).toBe(true);
        expect(on_page(dev)).toBe(true);

        /*  Login: a new shell, and the window in it, on the page.  */
        const shell2 = build_shell();
        expect(lives_in(dev, yui_shell_window_layer(shell2))).toBe(true);
        expect(on_page(dev)).toBe(true);

        close(dev);
        logout(shell2);
        expect(errors()).toEqual([]);
    });

    test("a window created before any shell is taken in by the first one", () => {
        const early = open_window("layer_early");
        expect(lives_in(early, document.body)).toBe(true);

        const shell = build_shell();
        expect(lives_in(early, yui_shell_window_layer(shell))).toBe(true);

        close(early);
        logout(shell);
        expect(errors()).toEqual([]);
    });

    test("a window its host placed stays there; one whose place went with the shell takes the window place", () => {
        const shell1 = build_shell();

        /*  Placed by its host in an element of the page: never moved.  */
        const $mine = document.createElement("div");
        document.body.appendChild($mine);
        const placed = open_window("layer_placed", {$parent: $mine});

        /*  Placed by its host INSIDE the shell (a layer of it), but not
         *  its child: the place goes with the shell, the window does not.  */
        const $popup = shell1.priv.layers.popup;
        const stranded = open_window("layer_stranded", {$parent: $popup});

        logout(shell1);
        expect(lives_in(placed, $mine)).toBe(true);
        expect(lives_in(stranded, document.body)).toBe(true);

        const shell2 = build_shell();
        expect(lives_in(placed, $mine)).toBe(true);
        expect(lives_in(stranded, yui_shell_window_layer(shell2))).toBe(true);

        close(placed);
        close(stranded);
        $mine.remove();
        logout(shell2);
        expect(errors()).toEqual([]);
    });

    test("a child of the shell goes with it, and nobody is told about it later", () => {
        const shell1 = build_shell();
        const child = open_window("layer_child", {}, shell1);
        logout(shell1);
        expect(gobj_is_destroying(child)).toBe(true);

        /*  The next shell tells only the live ones: no event to a dead
         *  window, no "destroyed gobj still watches".  */
        const shell2 = build_shell();
        logout(shell2);
        expect(errors()).toEqual([]);
    });

    test("its Back entry goes with the shell that held it", () => {
        const shell1 = build_shell({use_hash: true});
        const floating = open_window("layer_back");
        expect(!!gobj_read_attr(floating, "back_overlay")).toBe(true);

        logout(shell1);
        expect(gobj_read_attr(floating, "back_overlay")).toBe(null);

        /*  The next shell holds no entry of it, and closing it retires
         *  nothing there.  */
        const shell2 = build_shell({use_hash: true});
        expect(shell2.priv.overlay_stack.length).toBe(0);
        close(floating);
        expect(shell2.priv.overlay_stack.length).toBe(0);
        logout(shell2);
        expect(errors()).toEqual([]);
    });
});

describe("the dock follows the shell", () => {
    test("a floating dock lives in the shell's popup layer, under the dialogs; in the body while there is none", () => {
        const dock = gobj_create_service("layer_dock1", "C_YUI_WINDOW_MANAGER", {}, yuno);
        gobj_start(dock);
        const $dock = gobj_read_attr(dock, "$container");
        expect($dock.parentNode === document.body).toBe(true);

        const shell1 = build_shell();
        expect($dock.parentNode === shell1.priv.layers.popup).toBe(true);

        logout(shell1);
        expect($dock.parentNode === document.body).toBe(true);

        const shell2 = build_shell();
        expect($dock.parentNode === shell2.priv.layers.popup).toBe(true);

        gobj_stop(dock);
        gobj_destroy(dock);
        logout(shell2);
        expect(errors()).toEqual([]);
    });

    test("a docked window survives a logout, and its chip still brings it back", () => {
        const dock = gobj_create_service("layer_dock2", "C_YUI_WINDOW_MANAGER", {}, yuno);
        gobj_start(dock);
        const shell1 = build_shell();
        const dev = open_window("layer_docked", {manager: dock});
        const $win = gobj_read_attr(dev, "$container");
        expect(lives_in(dev, yui_shell_window_layer(shell1))).toBe(true);

        logout(shell1);
        const shell2 = build_shell();
        expect(lives_in(dev, yui_shell_window_layer(shell2))).toBe(true);
        expect(on_page(dev)).toBe(true);

        /*  Its chip is still in the dock, and the dock on the page: a
         *  press of its toggle minimises it, another one brings it back
         *  on top.  */
        const $toggle = gobj_read_attr(dock, "$container").querySelector(".DOCK_CHIP_TOGGLE");
        expect(!!$toggle).toBe(true);
        expect(document.documentElement.contains($toggle)).toBe(true);
        $toggle.click();
        expect($win.style.display).toBe("none");
        $toggle.click();
        expect($win.style.display).toBe(undefined);
        expect(Number($win.style.zIndex) > 10).toBe(true);

        close(dev);
        gobj_stop(dock);
        gobj_destroy(dock);
        logout(shell2);
        expect(errors()).toEqual([]);
    });

    test("an inline dock moves to the next shell's zone, and floats in the body between them", () => {
        const dock = gobj_create_service("layer_dock3", "C_YUI_WINDOW_MANAGER", {
            dock_mode: "inline",
            inline_selector: '[data-zone="bottom-sub"]'
        }, yuno);
        gobj_start(dock);
        const $dock = gobj_read_attr(dock, "$container");

        const shell1 = build_shell();
        expect($dock.parentNode === shell1.priv.zones["bottom-sub"]).toBe(true);

        logout(shell1);
        expect($dock.parentNode === document.body).toBe(true);
        expect($dock.classList.contains("yui-dock--floating")).toBe(true);

        const shell2 = build_shell();
        expect($dock.parentNode === shell2.priv.zones["bottom-sub"]).toBe(true);
        expect($dock.classList.contains("yui-dock--inline")).toBe(true);

        gobj_stop(dock);
        gobj_destroy(dock);
        logout(shell2);
        expect(errors()).toEqual([]);
    });
});

describe("the stacking of the windows", () => {
    /*  The z-index a window takes from the dock grows on every focus.
     *  In the overlay layer itself it competed with the drawer (18):
     *  after a few focus changes a new drawer opened UNDER the windows.
     *  The window layer is a stacking context below the drawer, so no
     *  number a window takes reaches it. CSS, read as text: the double
     *  has no layout.  */
    test("the window layer is a stacking context under the drawer", () => {
        const css = readFileSync(join(SRC, "c_yui_shell.css"), "utf8");
        const rule = (selector) => {
            const m = css.match(new RegExp(selector + "\\s*\\{([^}]*)\\}"));
            return m? m[1] : "";
        };
        const z_of = (body) => {
            const m = body.match(/z-index:\s*(\d+)/);
            return m? Number(m[1]) : NaN;
        };
        const windows = rule("\\.yui-layer > \\.yui-window-layer");
        const drawer = rule("\\.yui-drawer");
        expect(windows).toMatch(/position:\s*absolute/);
        expect(windows).toMatch(/pointer-events:\s*none/);
        expect(z_of(windows) < z_of(drawer)).toBe(true);
    });
});

describe("the title of a dock chip changes language (REV-CLOUD V23, QA of estadodelaire)", () => {
    /*  A window with a DATA half (a device id) and a KIND half (a key):
     *  the toggle's title and aria-label are COMPOSED, so no key carries
     *  them. Up to 7.26.35 they stayed in the language the window was
     *  opened in; the dock composes them again on the shell's
     *  EV_LANGUAGE_CHANGED -- of the shell that holds it now, across a
     *  logout.  */
    test("composed again in the new language, and after a logout by the next shell", async () => {
        const i18next = (await import("i18next")).default;
        i18next.addResourceBundle("en", "translation", {"device alarms": "Device alarms"}, true, true);
        i18next.addResourceBundle("es", "translation", {"device alarms": "Alarmas del dispositivo"}, true, true);
        await i18next.changeLanguage("en");

        const shell = build_shell();
        const dock = gobj_create_service(`lang_dock_${++seq}`, "C_YUI_WINDOW_MANAGER", {}, yuno);
        gobj_start(dock);
        const w = open_window(`lang_w_${seq}`,
            {title: "device alarms", title_prefix: "DEV-1", manager: dock});
        const $toggle = gobj_read_attr(dock, "$container").querySelector(".DOCK_CHIP_TOGGLE");
        expect($toggle.getAttribute("title")).toBe("DEV-1 · Device alarms");

        await i18next.changeLanguage("es");
        yui_shell_language_changed(shell);
        expect($toggle.getAttribute("title")).toBe("DEV-1 · Alarmas del dispositivo");
        expect($toggle.getAttribute("aria-label")).toBe("DEV-1 · Alarmas del dispositivo");

        logout(shell);
        const shell2 = build_shell();
        await i18next.changeLanguage("en");
        yui_shell_language_changed(shell2);
        expect($toggle.getAttribute("title")).toBe("DEV-1 · Device alarms");
        expect($toggle.getAttribute("aria-label")).toBe("DEV-1 · Device alarms");
        expect(errors()).toEqual([]);

        close(w);
        gobj_destroy(dock);
        logout(shell2);
    });
});

describe("REV-CLOUD V24.5.6: a gclass viewer opened from a window goes where its opener goes", () => {
    /*  A view inside a window parented to the app: the frontend view in
     *  the developer window, whose `gclass` button opens the viewer.  */
    function window_with_a_view(name, kw)
    {
        const view = gobj_create(`${name}_view`, "C_TEST_LAYER_VIEW", {}, yuno);
        const win = open_window(name, Object.assign({body: view}, kw || {}));
        return {view, win};
    }

    test("opened between a logout and the next login: the next shell takes it in with its opener", () => {
        const shell1 = build_shell();
        const {view, win} = window_with_a_view(`gv_dev_${++seq}`);
        logout(shell1);
        expect(lives_in(win, document.body)).toBe(true);

        const handle = open_gclass_view(view, "C_TEST_LAYER_VIEW", {});
        expect(!!(handle && handle.win)).toBe(true);
        expect(lives_in(handle.win, document.body)).toBe(true);

        /*  Login: both in the new shell's window layer, under its
         *  dialogs. Up to 7.26.41 the viewer stayed in the body.  */
        const shell2 = build_shell();
        expect(lives_in(win, yui_shell_window_layer(shell2))).toBe(true);
        expect(lives_in(handle.win, yui_shell_window_layer(shell2))).toBe(true);

        close_gclass_view(handle);
        close(win);
        gobj_destroy(view);
        logout(shell2);
        expect(errors()).toEqual([]);
    });

    test("opened in a shell: beside its opener, and with it through a logout and a login", () => {
        const shell1 = build_shell();
        const {view, win} = window_with_a_view(`gv_in_${++seq}`);
        const handle = open_gclass_view(view, "C_TEST_LAYER_VIEW", {});
        expect(lives_in(handle.win, yui_shell_window_layer(shell1))).toBe(true);

        logout(shell1);
        expect(lives_in(win, document.body)).toBe(true);
        expect(lives_in(handle.win, document.body)).toBe(true);

        const shell2 = build_shell();
        expect(lives_in(handle.win, yui_shell_window_layer(shell2))).toBe(true);

        close_gclass_view(handle);
        close(win);
        gobj_destroy(view);
        logout(shell2);
        expect(errors()).toEqual([]);
    });

    test("opened from a window its host placed in an element of the page: beside it, there for good", () => {
        const shell = build_shell();
        const $mine = document.createElement("div");
        document.body.appendChild($mine);
        const {view, win} = window_with_a_view(`gv_placed_${++seq}`, {$parent: $mine});

        /*  Any other place is another stacking context: the viewer could
         *  open BEHIND the window it was opened from.  */
        const handle = open_gclass_view(view, "C_TEST_LAYER_VIEW", {});
        expect(lives_in(handle.win, $mine)).toBe(true);
        logout(shell);
        const shell2 = build_shell();
        expect(lives_in(handle.win, $mine)).toBe(true);

        close_gclass_view(handle);
        close(win);
        gobj_destroy(view);
        $mine.remove();
        logout(shell2);
        expect(errors()).toEqual([]);
    });
});

describe("two shells alive: destroying the last one gives the windows to the other", () => {
    test("the windows go to the shell that remains, not to the body", () => {
        const first = build_shell();
        const second = build_shell();
        const w = open_window(`two_shells_${++seq}`);
        expect(lives_in(w, yui_shell_window_layer(second))).toBe(true);

        logout(second);
        expect(lives_in(w, yui_shell_window_layer(first))).toBe(true);

        logout(first);
        expect(lives_in(w, document.body)).toBe(true);

        close(w);
        expect(errors()).toEqual([]);
    });
});
