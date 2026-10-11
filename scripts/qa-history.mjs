#!/usr/bin/env node
/***********************************************************************
 *          qa-history.mjs
 *
 *      The browser history of a navigation PANEL over a view that writes
 *      its position in the URL, in a REAL browser (yunovatios
 *      REV-CLOUD.md V5.1). The unit tests of the shell drive a model of
 *      the history; this drives Chromium and Firefox, where the
 *      traversals are asynchronous and a hashchange is queued behind its
 *      popstate.
 *
 *      Surface: the test-app chapter /history (C_DEMO_HISTORY): a panel
 *      (C_YUI_WINDOW, no dock, keep_on_navigate) and a button that writes
 *      /history/pos-N with yui_shell_navigate(..., {replace: true}).
 *
 *      Cases, in each browser:
 *        (a) panel open, position written, Back: the panel closes, the
 *            position stays in the URL, and the NEXT Back goes to the
 *            previous route (it is not swallowed).
 *        (b) panel open, position written, the panel's x: the position
 *            stays in the URL, and the next Back goes to the previous
 *            route.
 *        (c) a dialog's action that closes the panel and navigates in
 *            the same turn (yui_shell_navigate): the navigation must
 *            survive the back() the shell issues to retire the panel's
 *            marker, no marker may be left orphaned, and the next Back
 *            goes to the chapter.
 *        (d) panel open, a link away and a link BACK to the hash it was
 *            opened on: a link is a push, not a Back -- the panel stays
 *            and the chapter is the view on screen (REV-CLOUD V6.1, p10).
 *        (e) the same after a position was written: the URL and the view
 *            on screen agree (V6.1, p11).
 *        (f) from the position, a link to the chapter's own hash: a push;
 *            Back returns to the position with the panel up, the next
 *            Back closes it keeping the position, and the next leaves
 *            the chapter (V6.1, p8).
 *        (g) as (c), by the other road: the panel closes and a menu
 *            click (EV_NAV_CLICKED) navigates in the same turn (V6.2, p9).
 *
 *      Besides the cases, a warning of the shell (C_YUI_SHELL: ...) in
 *      the console is a failure: the false "did not land ... dropped" of
 *      7.26.13 was such a warning, and nothing failed on it.
 *
 *      It starts the test-app's vite dev server on its own port and stops
 *      it at the end. Exit 0 when every case passes, 1 otherwise.
 *
 *      Usage (from the package root):
 *          node scripts/qa-history.mjs [--browser chromium|firefox] [--headed]
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {spawn} from "node:child_process";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";
import {createRequire} from "node:module";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_DIR = join(HERE, "..", "test-app");
const PORT = 5287;
const BASE = `http://localhost:${PORT}/`;

/*  Playwright comes from the test-app, which carries it.  */
const require_app = createRequire(join(APP_DIR, "package.json"));
const {chromium, firefox} = require_app("playwright");

const argv = process.argv.slice(2);
const only = argv.includes("--browser") ? argv[argv.indexOf("--browser") + 1] : null;
const headed = argv.includes("--headed");

/*
 *  The dev server
 */
function start_vite()
{
    const child = spawn(
        process.execPath,
        [join(APP_DIR, "node_modules", "vite", "bin", "vite.js"),
         "--port", String(PORT), "--strictPort"],
        {cwd: APP_DIR, stdio: ["ignore", "pipe", "pipe"]}
    );
    return new Promise((resolve, reject) => {
        let out = "";
        const timer = setTimeout(() => {
            reject(new Error(`vite did not start:\n${out}`));
        }, 30000);
        const on_data = (d) => {
            out += String(d);
            if(out.includes(`localhost:${PORT}`)) {
                clearTimeout(timer);
                resolve(child);
            }
        };
        child.stdout.on("data", on_data);
        child.stderr.on("data", on_data);
        child.on("exit", (code) => {
            clearTimeout(timer);
            reject(new Error(`vite exited (${code}):\n${out}`));
        });
    });
}

/*
 *  The page
 */
async function snap(page)
{
    return page.evaluate(() => {
        /*  The view on screen, not the one the URL names.  */
        const shown = (sel) => {
            const el = document.querySelector(sel);
            return !!(el && el.offsetParent !== null);
        };
        return {
            hash: location.hash,
            panel: !!document.querySelector(".DEMO_HISTORY_PANEL"),
            view: shown(".C_DEMO_HISTORY")? "history" :
                  shown(".C_DEMO_TABLE")? "table" : "other",
            state: history.state,
        };
    });
}

/*  A click on a real fragment link, as a reader's.  */
async function link_to(page, hash)
{
    await page.evaluate((h) => {
        const a = document.createElement("a");
        a.href = h;
        document.body.appendChild(a);
        a.click();
        a.remove();
    }, hash);
    await settle(page);
}

async function settle(page)
{
    await page.waitForTimeout(400);
}

async function fresh(page)
{
    /*  A previous route, then the chapter: Back has somewhere to go.  */
    await page.goto(BASE + "#/windows", {waitUntil: "networkidle", timeout: 30000});
    await page.waitForSelector(".C_DEMO_WINDOWS", {timeout: 15000});
    await page.evaluate(() => {
        location.hash = "#/history";
    });
    await page.waitForSelector(".C_DEMO_HISTORY", {timeout: 15000});
    await settle(page);
}

async function open_and_write(page)
{
    await page.click(".DEMO_HISTORY_OPEN");
    await page.waitForSelector(".DEMO_HISTORY_PANEL", {timeout: 5000});
    await settle(page);
    await page.click(".DEMO_HISTORY_WRITE");
    await settle(page);
}

async function close_panel_x(page)
{
    /*  The x of the window that holds the panel's body.  */
    await page.evaluate(() => {
        const body = document.querySelector(".DEMO_HISTORY_PANEL");
        let win = body;
        while(win && !(win.querySelector && win.querySelector(".yui-wc.wc-close"))) {
            win = win.parentElement;
        }
        win.querySelector(".yui-wc.wc-close").click();
    });
}

/*
 *  The cases
 */
async function case_a(page)
{
    await fresh(page);
    await open_and_write(page);
    const before = await snap(page);
    await page.goBack();
    await settle(page);
    const after_back = await snap(page);
    await page.goBack();
    await settle(page);
    const after_second = await snap(page);

    const ok =
        before.panel && before.hash === "#/history/pos-1" &&
        !after_back.panel && after_back.hash === "#/history/pos-1" &&
        after_second.hash === "#/windows";
    return {ok, before, after_back, after_second};
}

async function case_b(page)
{
    await fresh(page);
    await open_and_write(page);
    const before = await snap(page);
    await close_panel_x(page);
    await settle(page);
    const after_x = await snap(page);
    await page.goBack();
    await settle(page);
    const after_back = await snap(page);

    const ok =
        before.panel && before.hash === "#/history/pos-1" &&
        !after_x.panel && after_x.hash === "#/history/pos-1" &&
        after_back.hash === "#/windows";
    return {ok, before, after_x, after_back};
}

async function case_c(page)
{
    await fresh(page);
    await page.click(".DEMO_HISTORY_OPEN");
    await page.waitForSelector(".DEMO_HISTORY_PANEL", {timeout: 5000});
    await settle(page);
    /*  A dialog's action: it closes the panel (the shell retires its
     *  marker with a back()) and navigates, in the same turn.  */
    await page.click(".DEMO_HISTORY_CLOSE_AND_GO");
    await page.waitForTimeout(800);
    const after_go = await snap(page);
    await page.goBack();
    await settle(page);
    const after_back = await snap(page);

    const orphan = !!(after_go.state && after_go.state.__yui_overlay__);
    const ok =
        !after_go.panel && after_go.hash === "#/table" && !orphan &&
        after_back.hash === "#/history";
    return {ok, after_go, after_back, orphan};
}

async function case_d(page)
{
    await fresh(page);
    await page.click(".DEMO_HISTORY_OPEN");
    await page.waitForSelector(".DEMO_HISTORY_PANEL", {timeout: 5000});
    await settle(page);
    await link_to(page, "#/table");
    const away = await snap(page);
    await link_to(page, "#/history");
    const back_by_link = await snap(page);

    const ok =
        away.panel && away.hash === "#/table" && away.view === "table" &&
        back_by_link.panel && back_by_link.hash === "#/history" &&
        back_by_link.view === "history";
    return {ok, away, back_by_link};
}

async function case_e(page)
{
    await fresh(page);
    await open_and_write(page);
    await link_to(page, "#/table");
    await link_to(page, "#/history");
    const after = await snap(page);

    const ok = after.panel && after.hash === "#/history" && after.view === "history";
    return {ok, after};
}

async function case_f(page)
{
    await fresh(page);
    await open_and_write(page);
    await link_to(page, "#/history");
    const pushed = await snap(page);
    await page.goBack();
    await settle(page);
    const on_marker = await snap(page);
    await page.goBack();
    await settle(page);
    const off_marker = await snap(page);
    await page.goBack();
    await settle(page);
    const left = await snap(page);

    const ok =
        pushed.panel && pushed.hash === "#/history" && pushed.view === "history" &&
        on_marker.panel && on_marker.hash === "#/history/pos-1" &&
        !off_marker.panel && off_marker.hash === "#/history/pos-1" &&
        left.hash === "#/windows";
    return {ok, pushed, on_marker, off_marker, left};
}

async function case_g(page)
{
    await fresh(page);
    await page.click(".DEMO_HISTORY_OPEN");
    await page.waitForSelector(".DEMO_HISTORY_PANEL", {timeout: 5000});
    await settle(page);
    await page.click(".DEMO_HISTORY_CLOSE_AND_CLICK");
    await page.waitForTimeout(800);
    const after_click = await snap(page);
    await page.goBack();
    await settle(page);
    const after_back = await snap(page);

    const orphan = !!(after_click.state && after_click.state.__yui_overlay__);
    const ok =
        !after_click.panel && after_click.hash === "#/table" &&
        after_click.view === "table" && !orphan &&
        after_back.hash === "#/history";
    return {ok, after_click, after_back, orphan};
}

/*
 *  Main
 */
const browsers = [["chromium", chromium], ["firefox", firefox]]
    .filter(([name]) => !only || only === name);

let vite = null;
let failures = 0;
const errors = [];
try {
    vite = await start_vite();
    for(const [name, engine] of browsers) {
        const browser = await engine.launch({headless: !headed});
        try {
            for(const [label, fn] of [["a: Back", case_a], ["b: x", case_b],
                                      ["c: close and go", case_c],
                                      ["d: link back", case_d],
                                      ["e: link back after a position", case_e],
                                      ["f: link from the position", case_f],
                                      ["g: close and click", case_g]]) {
                const context = await browser.newContext({viewport: {width: 1250, height: 850}});
                const page = await context.newPage();
                page.on("pageerror", (e) => {
                    errors.push(`${name} ${label}: ${e.message || e}`);
                });
                page.on("console", (m) => {
                    if(m.type() === "error" ||
                            (m.type() === "warning" && m.text().includes("C_YUI_SHELL"))) {
                        errors.push(`${name} ${label}: ${m.text()}`);
                    }
                });
                let r;
                try {
                    r = await fn(page);
                } catch(e) {
                    r = {ok: false, error: String(e.message || e)};
                }
                await context.close();
                if(!r.ok) {
                    failures++;
                }
                console.log(`${r.ok ? "OK  " : "FAIL"} ${name.padEnd(8)} ${label}  ` +
                    JSON.stringify(r, (k, v) => (k === "ok" ? undefined : v)));
            }
        } finally {
            await browser.close();
        }
    }
} finally {
    if(vite) {
        vite.kill("SIGTERM");
    }
}

/*  The maplibre worker of the dev server is not this check's concern.  */
const relevant = errors.filter((e) => !/Worker|worker/.test(e));
for(const e of relevant) {
    console.log(`console error: ${e}`);
}
if(relevant.length) {
    failures++;
}
console.log(failures ? `qa-history: ${failures} failure(s)` : "qa-history: OK");
process.exit(failures ? 1 : 0);
