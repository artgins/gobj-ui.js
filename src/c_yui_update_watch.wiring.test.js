/***********************************************************************
 *          c_yui_update_watch.wiring.test.js
 *
 *      C_YUI_UPDATE_WATCH driven through its FSM on a document double,
 *      with the server played by a fake fetch: the bar appears for
 *      another build and not for the same one, the ✕ hides it for THAT
 *      build only, a rollback takes it away, a check too soon or
 *      offline asks nothing (navigator.onLine is stubbed: vitest has
 *      none, and the guard never ran) and coming back online asks at
 *      once, a failure is said once, the reload asks the host first,
 *      and with no shell (the login) the app's language switch reaches
 *      the bar through yui_update_watch_language_changed().
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {describe, test, expect, beforeAll, beforeEach, afterEach} from "vitest";
import {install_dom_double, fake_event} from "../test/dom_double.js";

install_dom_double();

const {
    gclass_create, SDATA_END,
    gobj_start_up, gobj_create_yuno, gobj_create_service, gobj_start, gobj_stop,
    gobj_destroy, gobj_is_running, gobj_send_event, gobj_current_state,
    set_log_callback, register_c_timer,
} = await import("@yuneta/gobj-js");
const {register_c_yui_update_watch, yui_update_watch_language_changed} =
    await import("./c_yui_update_watch.js");

const RUNNING = "aaaaaaaaaaaaaaaa";

const logged = [];
const heard = [];
let yuno = null;
let host = null;
let watch = null;
let seq = 0;
let i18next = null;

/*  navigator.onLine as the browser says it: vitest has no such
 *  property, so `undefined` unless a test sets it.  */
const network = {online: undefined};
Object.defineProperty(globalThis.navigator, "onLine", {
    configurable: true,
    get: () => network.online,
});

/*  The server: what the next fetches answer, and what was asked.  */
const server = {
    stamp: RUNNING,
    version: "1.0.0",
    fail: null,         /*  null | "network" | number (HTTP status) | "no-stamp"  */
    asked: 0,
};

function page(stamp, version)
{
    return `<!doctype html><html><head><title>x</title>` +
        `<meta name="yuneta-build" content="${stamp}" data-version="${version}">` +
        `</head><body></body></html>`;
}

function fake_fetch(url, opts)
{
    server.asked++;
    expect(opts.cache).toBe("no-store");
    if(server.fail === "network") {
        return Promise.reject(new TypeError("Failed to fetch"));
    }
    if(typeof server.fail === "number") {
        return Promise.resolve({ok: false, status: server.fail, text: () => Promise.resolve("")});
    }
    const body = server.fail === "no-stamp"
        ? "<html><head><title>Hotel wifi</title></head></html>"
        : page(server.stamp, server.version);
    return Promise.resolve({ok: true, status: 200, text: () => Promise.resolve(body)});
}

async function settle()
{
    for(let i = 0; i < 5; i++) {
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
}

function bar()
{
    return document.body.querySelector(".UPDATE_BAR");
}

function make_watch(kw)
{
    watch = gobj_create_service(`update_watch_${++seq}`, "C_YUI_UPDATE_WATCH",
        {subscriber: host, period_ms: 0, ...(kw || {})}, yuno);
    gobj_start(watch);
    return watch;
}

beforeAll(async () => {
    i18next = (await import("i18next")).default;
    await i18next.init({lng: "en", resources: {
        es: {translation: {
            "new version available": "hay una versión nueva",
            "reload": "recargar",
            "close": "cerrar",
        }},
    }});

    const $meta = document.createElement("meta");
    $meta.setAttribute("name", "yuneta-build");
    $meta.setAttribute("content", RUNNING);
    $meta.setAttribute("data-version", "1.0.0");
    document.head.appendChild($meta);

    globalThis.fetch = fake_fetch;

    gobj_start_up(null, null, null, null, null, null, null);
    set_log_callback((level, msg) => {
        logged.push({level: String(level), msg: String(msg)});
    });
    register_c_timer();
    register_c_yui_update_watch();
    gclass_create("C_TEST_UPD_YUNO", [], [["ST_IDLE", []]], {}, 0, [SDATA_END()], {}, 0, 0, 0, 0);
    gclass_create(
        "C_TEST_UPD_HOST",
        [["EV_NEW_BUILD", 0], ["EV_BUILD_CURRENT", 0]],
        [["ST_IDLE", [
            ["EV_NEW_BUILD", (gobj, event, kw) => {
                heard.push({event, kw});
                return 0;
            }, null],
            ["EV_BUILD_CURRENT", (gobj, event, kw) => {
                heard.push({event, kw});
                return 0;
            }, null]
        ]]],
        {}, 0, [SDATA_END()], {}, 0, 0, 0, 0
    );
    yuno = gobj_create_yuno("update_watch_yuno", "C_TEST_UPD_YUNO", {});
    gobj_start(yuno);
    host = gobj_create_service("update_watch_host", "C_TEST_UPD_HOST", {}, yuno);
    gobj_start(host);
});

beforeEach(() => {
    logged.length = 0;
    heard.length = 0;
    server.stamp = RUNNING;
    server.version = "1.0.0";
    server.fail = null;
    server.asked = 0;
    network.online = undefined;
});

afterEach(() => {
    if(watch) {
        if(gobj_is_running(watch)) {
            gobj_stop(watch);
        }
        gobj_destroy(watch);
        watch = null;
    }
    expect(bar()).toBe(null);
    expect(logged.filter((l) => l.level === "error")).toEqual([]);
});

describe("C_YUI_UPDATE_WATCH", () => {
    test("the same build deployed: asked at start, no bar", async () => {
        make_watch();
        await settle();
        expect(server.asked).toBe(1);
        expect(gobj_current_state(watch)).toBe("ST_CURRENT");
        expect(bar()).toBe(null);
        expect(heard).toEqual([]);
    });

    test("another build: the bar, its version, EV_NEW_BUILD", async () => {
        server.stamp = "bbbbbbbbbbbbbbbb";
        server.version = "1.0.1";
        make_watch();
        await settle();
        expect(gobj_current_state(watch)).toBe("ST_STALE");
        const $bar = bar();
        expect($bar).not.toBe(null);
        expect($bar.querySelector(".UPDATE_VERSION").textContent).toBe("1.0.1");
        const $reload = $bar.querySelector(".UPDATE_RELOAD");
        expect($reload.getAttribute("title")).toBe("reload");
        expect($reload.getAttribute("aria-label")).toBe("reload");
        expect($reload.getAttribute("data-i18n-aria-label")).toBe("reload");
        const $x = $bar.querySelector(".UPDATE_DISMISS");
        expect($x.getAttribute("aria-label")).toBe("close");
        expect(heard).toEqual([{event: "EV_NEW_BUILD", kw: {
            running: RUNNING, deployed: "bbbbbbbbbbbbbbbb", version: "1.0.1"
        }}]);
    });

    test("the ✕ hides it for that build; a later build shows it again", async () => {
        server.stamp = "bbbbbbbbbbbbbbbb";
        make_watch();
        await settle();
        gobj_send_event(watch, "EV_DISMISS", {}, watch);
        expect(bar()).toBe(null);

        gobj_send_event(watch, "EV_CHECK_BUILD", {force: true}, watch);
        await settle();
        expect(bar()).toBe(null);

        server.stamp = "cccccccccccccccc";
        server.version = "1.0.2";
        gobj_send_event(watch, "EV_CHECK_BUILD", {force: true}, watch);
        await settle();
        expect(bar().querySelector(".UPDATE_VERSION").textContent).toBe("1.0.2");
        expect(heard.map((h) => h.kw.deployed)).toEqual(["bbbbbbbbbbbbbbbb", "cccccccccccccccc"]);
    });

    test("a rollback to the running build takes the bar away", async () => {
        server.stamp = "bbbbbbbbbbbbbbbb";
        make_watch();
        await settle();
        expect(bar()).not.toBe(null);

        server.stamp = RUNNING;
        gobj_send_event(watch, "EV_CHECK_BUILD", {force: true}, watch);
        await settle();
        expect(gobj_current_state(watch)).toBe("ST_CURRENT");
        expect(bar()).toBe(null);
        expect(heard[1]).toEqual({event: "EV_BUILD_CURRENT", kw: {running: RUNNING}});
    });

    test("the focus asks, but not twice within min_interval_ms", async () => {
        make_watch({min_interval_ms: 60000});
        await settle();
        expect(server.asked).toBe(1);
        window.dispatchEvent(fake_event("focus"));
        document.dispatchEvent(fake_event("visibilitychange"));
        await settle();
        expect(server.asked).toBe(1);

        window.dispatchEvent(fake_event("vite:preloadError"));
        await settle();
        expect(server.asked).toBe(2);
    });

    test("with min_interval_ms 0, the focus asks", async () => {
        make_watch({min_interval_ms: 0});
        await settle();
        window.dispatchEvent(fake_event("focus"));
        await settle();
        expect(server.asked).toBe(2);
    });

    test("period_ms asks on its own, for a screen that never gets the focus", async () => {
        make_watch({min_interval_ms: 0, period_ms: 20});
        await settle();
        expect(server.asked).toBe(1);
        await new Promise((resolve) => setTimeout(resolve, 70));
        await settle();
        expect(server.asked).toBeGreaterThanOrEqual(3);
    });

    test("offline asks nothing, not even forced", async () => {
        network.online = false;
        make_watch({min_interval_ms: 0});
        await settle();
        gobj_send_event(watch, "EV_CHECK_BUILD", {force: true}, watch);
        window.dispatchEvent(fake_event("focus"));
        await settle();
        expect(server.asked).toBe(0);
    });

    test("back online asks at once, inside min_interval_ms", async () => {
        network.online = true;
        make_watch({min_interval_ms: 60000});
        await settle();
        expect(server.asked).toBe(1);
        window.dispatchEvent(fake_event("focus"));
        await settle();
        expect(server.asked).toBe(1);

        network.online = false;
        gobj_send_event(watch, "EV_CHECK_BUILD", {force: true}, watch);
        await settle();
        expect(server.asked).toBe(1);

        network.online = true;
        window.dispatchEvent(fake_event("online"));
        await settle();
        expect(server.asked).toBe(2);
    });

    test("with no shell, the app's language switch re-translates the bar", async () => {
        server.stamp = "bbbbbbbbbbbbbbbb";
        make_watch();
        await settle();
        const $bar = bar();
        const $reload = $bar.querySelector(".UPDATE_RELOAD");
        expect($reload.getAttribute("aria-label")).toBe("reload");

        /*  The texts carry their key; the document double's text nodes
         *  have no nodeValue for refresh_language() to write, so what it
         *  rewrites is read from the attributes.  */
        expect($bar.querySelector(".UPDATE_TEXT").getAttribute("data-i18n")).toBe("new version available");
        await i18next.changeLanguage("es");
        try {
            expect($reload.getAttribute("aria-label")).toBe("reload");
            yui_update_watch_language_changed();
            expect([$reload.getAttribute("title"), $reload.getAttribute("aria-label")])
                .toEqual(["recargar", "recargar"]);
            expect($bar.querySelector(".UPDATE_DISMISS").getAttribute("aria-label")).toBe("cerrar");
            expect($bar.querySelector(".UPDATE_VERSION").textContent).toBe("1.0.0");
        } finally {
            await i18next.changeLanguage("en");
        }
    });

    test("stopped, the page events ask nothing", async () => {
        make_watch({min_interval_ms: 0});
        await settle();
        gobj_stop(watch);
        window.dispatchEvent(fake_event("focus"));
        window.dispatchEvent(fake_event("online"));
        await settle();
        expect(server.asked).toBe(1);
    });

    test("a failure is said once, and its end once", async () => {
        server.fail = 503;
        make_watch();
        await settle();
        gobj_send_event(watch, "EV_CHECK_BUILD", {force: true}, watch);
        await settle();
        const warnings = logged.filter((l) => l.level === "warning");
        expect(warnings.length).toBe(1);
        expect(warnings[0].msg).toContain("HTTP 503");

        server.fail = null;
        gobj_send_event(watch, "EV_CHECK_BUILD", {force: true}, watch);
        await settle();
        expect(logged.filter((l) => l.msg.includes("can be read again")).length).toBe(1);
    });

    test("a network failure is info, a page with no stamp a warning, neither a new build", async () => {
        server.fail = "network";
        make_watch();
        await settle();
        expect(logged.filter((l) => l.level === "warning")).toEqual([]);
        expect(logged.some((l) => l.level === "info" && l.msg.includes("Failed to fetch"))).toBe(true);
        gobj_stop(watch);
        gobj_destroy(watch);

        logged.length = 0;
        server.fail = "no-stamp";
        make_watch();
        await settle();
        expect(gobj_current_state(watch)).toBe("ST_CURRENT");
        expect(bar()).toBe(null);
        expect(logged.filter((l) => l.level === "warning").length).toBe(1);
    });

    test("the reload asks the host first, and a veto keeps the page", async () => {
        let reloads = 0;
        window.location.reload = () => {
            reloads++;
        };
        let answer = false;
        server.stamp = "bbbbbbbbbbbbbbbb";
        make_watch({before_reload: () => Promise.resolve(answer)});
        await settle();

        gobj_send_event(watch, "EV_RELOAD", {}, watch);
        await settle();
        expect(reloads).toBe(0);

        answer = true;
        bar().querySelector(".UPDATE_RELOAD").dispatchEvent(fake_event("click"));
        await settle();
        expect(reloads).toBe(1);
    });

    test("in ST_CURRENT a reload is not an event of the state", async () => {
        make_watch();
        await settle();
        const ret = gobj_send_event(watch, "EV_RELOAD", {}, watch);
        expect(ret).toBe(-1);
        const errors = logged.filter((l) => l.level === "error");
        expect(errors.length).toBeGreaterThan(0);
        logged.length = 0;
    });
});
