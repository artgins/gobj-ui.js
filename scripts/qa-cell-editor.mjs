#!/usr/bin/env node
/***********************************************************************
 *          qa-cell-editor.mjs
 *
 *      A cell editor of a C_YUI_FORM table survives a FORCED redraw of
 *      its table, in a REAL browser (Chromium and Firefox).
 *
 *      Tabulator redraws a table with `force` the first time a table
 *      built out of sight comes into view (ResizeTable's
 *      IntersectionObserver), and a forced redraw builds every row's
 *      cells again -- the one being edited too -- without ending the
 *      edit. A click on a cell of a table still below the fold scrolls
 *      it into view AND opens the editor in the same turn, so the
 *      redraw lands on an open editor. Chromium blurs the box it takes
 *      out, the editor's blur ends the edit on a cell that no longer
 *      exists, and Tabulator throws ("Cannot read properties of
 *      undefined (reading 'remove')", Validate.editorClear); Firefox
 *      does not blur, and throws at the NEXT edit. Up to gobj-ui
 *      7.26.53 both happened, with our time editor and with
 *      Tabulator's own `input` editor alike.
 *
 *      Surface: the test-app chapter /form, table `visits` (columns
 *      `when`, a time, and `note`, a text), below the fold.
 *
 *      Cases, in each browser and for each column:
 *        (a) a click on the cell, the table never scrolled into view
 *            before: the editor is open after the redraw.
 *        (b) a forced redraw while the editor is open: it is still
 *            open, on the same cell.
 *        (c) Escape closes it, and the cell opens again.
 *      Any pageerror or console error is a failure.
 *
 *      It starts the test-app's vite dev server on its own port and
 *      stops it at the end. Exit 0 when every case passes, 1 otherwise.
 *
 *      Usage (from the package root):
 *          node scripts/qa-cell-editor.mjs [--browser chromium|firefox]
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
const PORT = 5288;
const BASE = `http://localhost:${PORT}/`;

const require_app = createRequire(join(APP_DIR, "package.json"));
const {chromium, firefox} = require_app("playwright");

const argv = process.argv.slice(2);
const only = argv.includes("--browser") ? argv[argv.indexOf("--browser") + 1] : null;

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
async function cell_state(page, sel)
{
    return page.$eval(sel, (e) => ({
        editing: e.classList.contains("tabulator-editing"),
        has_box: !!e.querySelector("input"),
        focused: !!(document.activeElement && e.contains(document.activeElement)),
    }));
}

/*  table.redraw(true), as ResizeTable issues it.  */
async function force_redraw(page, sel)
{
    await page.evaluate(async (s) => {
        const url = performance.getEntriesByType("resource").map((r) => r.name)
            .find((n) => n.includes("tabulator-tables.js"));
        const mod = await import(url);
        const T = mod.TabulatorFull || mod.default;
        T.findTable(document.querySelector(s).closest(".tabulator"))[0].redraw(true);
    }, sel);
}

function is_open(st)
{
    return st.editing && st.has_box && st.focused;
}

async function run_browser(name, bt)
{
    const browser = await bt.launch();
    let failures = 0;
    for(const field of ["when", "note"]) {
        const ctx = await browser.newContext({locale: "es-ES", timezoneId: "Europe/Madrid"});
        const page = await ctx.newPage();
        const problems = [];
        page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
        page.on("console", (m) => {
            if(m.type() === "error") {
                problems.push(`console.error: ${m.text()}`);
            }
        });
        const sel = `.tabulator-cell[tabulator-field="${field}"]`;
        await page.goto(BASE + "#/form");
        await page.waitForSelector(sel);
        await page.waitForTimeout(400);

        const results = [];
        await page.click(sel);
        await page.waitForTimeout(400);
        results.push(["(a) open after the first-view redraw", is_open(await cell_state(page, sel))]);

        await force_redraw(page, sel);
        await page.waitForTimeout(300);
        results.push(["(b) open after a forced redraw", is_open(await cell_state(page, sel))]);

        await page.keyboard.press("Escape");
        await page.waitForTimeout(200);
        const closed = !(await cell_state(page, sel)).editing;
        await page.click(sel);
        await page.waitForTimeout(300);
        const reopened = is_open(await cell_state(page, sel));
        results.push(["(c) Escape closes, opens again", closed && reopened]);
        results.push(["no pageerror / console error", problems.length === 0]);

        for(const [label, ok] of results) {
            console.log(`${ok? "PASS" : "FAIL"}  ${name} ${field}: ${label}`);
            if(!ok) {
                failures++;
            }
        }
        for(const p of problems) {
            console.log(`      ${p}`);
        }
        await ctx.close();
    }
    await browser.close();
    return failures;
}

const vite = await start_vite();
let failures = 0;
try {
    for(const [name, bt] of [["chromium", chromium], ["firefox", firefox]]) {
        if(only && only !== name) {
            continue;
        }
        failures += await run_browser(name, bt);
    }
} finally {
    vite.kill();
}
console.log(failures? `${failures} FAILED` : "ALL PASS");
process.exit(failures? 1 : 0);
