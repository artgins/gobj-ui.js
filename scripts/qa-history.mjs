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
    return page.evaluate(() => ({
        hash: location.hash,
        panel: !!document.querySelector(".DEMO_HISTORY_PANEL"),
        state: history.state,
    }));
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
                                      ["c: close and go", case_c]]) {
                const context = await browser.newContext({viewport: {width: 1250, height: 850}});
                const page = await context.newPage();
                page.on("pageerror", (e) => {
                    errors.push(`${name} ${label}: ${e.message || e}`);
                });
                page.on("console", (m) => {
                    if(m.type() === "error") {
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
