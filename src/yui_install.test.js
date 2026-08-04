/***********************************************************************
 *          yui_install.test.js
 *
 *      The install offer, without a browser. What matters here is the
 *      GATING — never promise an install this browser cannot deliver,
 *      and never ask twice — because that is the part that decides
 *      whether a user is helped or nagged.
 ***********************************************************************/
import { test, expect, beforeEach, afterEach, vi } from "vitest";

const STASH = "__yuneta_install__";

/*  `S.installed` is per-SESSION state by design: once an install is
 *  accepted the module stops offering for the life of the page. So each
 *  test gets a fresh module, or the first acceptance would silence every
 *  test after it -- which is exactly what happened when they shared one.  */
async function fresh()
{
    vi.resetModules();
    return await import("./yui_install.js");
}

function fake_event(outcome)
{
    return {
        prompted: false,
        prompt() {
            this.prompted = true;
        },
        userChoice: Promise.resolve({outcome: outcome})
    };
}

let saved_window;

beforeEach(() => {
    saved_window = globalThis.window;
    /*  A window faithful enough to import against: gobj-js reads
     *  window.console at module scope, so a bare {} breaks the import
     *  itself rather than the test.  */
    globalThis.window = {
        console: console,
        addEventListener: () => {},
        removeEventListener: () => {},
        localStorage: {
            getItem: () => null,
            setItem: () => {},
            removeItem: () => {}
        },
        matchMedia: () => ({matches: false})
    };
    window[STASH] = null;
});

afterEach(() => {
    /*  Put the global back: this file swaps out window wholesale, and a
     *  leaked fake would poison whatever test file runs next.  */
    globalThis.window = saved_window;
});

test("can(): false when the browser never offered", async () => {
    const {yui_install_can} = await fresh();
    expect(yui_install_can()).toBe(false);
});

test("can(): true once the early script stashed an event", async () => {
    const {yui_install_can} = await fresh();
    window[STASH] = fake_event("accepted");
    expect(yui_install_can()).toBe(true);
});

test("can(): false when already running installed", async () => {
    const {yui_install_can} = await fresh();
    window[STASH] = fake_event("accepted");
    window.matchMedia = () => ({matches: true});   /*  display-mode: standalone  */
    expect(yui_install_can()).toBe(false);
});

test("is_installed(): reads the display mode", async () => {
    const {yui_install_is_installed} = await fresh();
    window.matchMedia = () => ({matches: true});
    expect(yui_install_is_installed()).toBe(true);
});

test("is_installed(): a matchMedia that throws is not installed", async () => {
    const {yui_install_is_installed} = await fresh();
    window.matchMedia = () => { throw new Error("nope"); };
    expect(yui_install_is_installed()).toBe(false);
});

test("prompt(): nothing to prompt with resolves null", async () => {
    const {yui_install_prompt} = await fresh();
    await expect(yui_install_prompt()).resolves.toBe(null);
});

test("prompt(): calls prompt() and reports the outcome", async () => {
    const {yui_install_prompt} = await fresh();
    let ev = fake_event("accepted");
    window[STASH] = ev;
    await expect(yui_install_prompt()).resolves.toBe("accepted");
    expect(ev.prompted).toBe(true);
});

test("prompt(): the event is SINGLE USE -- a second call has nothing", async () => {
    const {yui_install_prompt} = await fresh();
    window[STASH] = fake_event("dismissed");
    await expect(yui_install_prompt()).resolves.toBe("dismissed");
    await expect(yui_install_prompt()).resolves.toBe(null);
});

test("prompt(): a dismissal does NOT count as installed", async () => {
    const {yui_install_prompt, yui_install_can} = await fresh();
    window[STASH] = fake_event("dismissed");
    await yui_install_prompt();
    window[STASH] = fake_event("accepted");
    expect(yui_install_can()).toBe(true);   /*  still offerable  */
});

test("subscribe(): listeners hear the outcome, and unsubscribe works", async () => {
    const {yui_install_prompt, yui_install_subscribe} = await fresh();
    let beats = 0;
    let off = yui_install_subscribe(() => { beats++; });
    window[STASH] = fake_event("accepted");
    await yui_install_prompt();
    expect(beats).toBe(1);
    off();
    window[STASH] = fake_event("accepted");
    await yui_install_prompt();
    expect(beats).toBe(1);
});

test("subscribe(): a throwing listener does not break the others", async () => {
    const {yui_install_prompt, yui_install_subscribe} = await fresh();
    let ok = 0;
    let off1 = yui_install_subscribe(() => { throw new Error("boom"); });
    let off2 = yui_install_subscribe(() => { ok++; });
    window[STASH] = fake_event("accepted");
    await yui_install_prompt();
    expect(ok).toBe(1);
    off1();
    off2();
});
