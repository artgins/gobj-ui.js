#!/usr/bin/env node
/***********************************************************************
 *          qa-cell-editor.mjs
 *
 *      A cell editor of a C_YUI_FORM table survives a FORCED redraw of
 *      its table, and setColumns() and setHeight(), in a REAL browser
 *      (Chromium and Firefox).
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
 *        (d) setColumns(), (e) setHeight(), (f) addColumn(),
 *            (g) updateColumnDefinition() of the edited column and
 *            (h) moveColumn() while the editor is open (they build the
 *            cells again too): still open, on the same cell. Run
 *            before (c).
 *      Any pageerror or console error is a failure.
 *
 *      And C_YUI_TREEDB_TOPIC_WITH_FORM (chapter /treedb), with an
 *      editor open in the SECOND row (Tabulator 6.6.0 survives the
 *      first): (i) a reload (EV_LOAD_NODES, setData), (j) a stop of
 *      the view (gobj_stop, the table destroyed: the view no longer
 *      runs and no cell is left in edition) and (k) an update of the
 *      row (EV_LOAD_NODE_UPDATED, updateData) that changes `age` while
 *      the `age` editor is open cancel it without a pageerror or an
 *      exception, and (k) paints the whole row (the changed `name`
 *      comes after `age` in the record, where a half painted row shows);
 *      (l) the backend echo of the reader's own write to `name`, with
 *      `age` unchanged, leaves the `age` editor open and paints `name`.
 *      Up to gobj-ui 7.26.56 the reload threw four times ("reading
 *      'add'") and the stop threw out of mt_stop; up to 7.26.57 (k)
 *      threw ("Update Error - Unable to update row", unhandled) and left
 *      the row half painted; 7.26.58 cancelled the editor in (l) too,
 *      and what was being typed in it was lost.
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

/*  A call that builds the cells again: table.redraw(true), as
 *  ResizeTable issues it, setColumns(), as a language change of
 *  C_YUI_TREEDB_TOPIC_WITH_FORM issues it, or a height setter.  */
async function rebuild(page, sel, how, problems)
{
    try {
        await rebuild_in_page(page, sel, how);
    } catch(e) {
        problems.push(`${how}() threw: ${e.message.split("\n")[0]}`);
    }
}

async function rebuild_in_page(page, sel, how)
{
    await page.evaluate(async ([s, how]) => {
        const url = performance.getEntriesByType("resource").map((r) => r.name)
            .find((n) => n.includes("tabulator-tables.js"));
        const mod = await import(url);
        const T = mod.TabulatorFull || mod.default;
        const table = T.findTable(document.querySelector(s).closest(".tabulator"))[0];
        if(how === "redraw") {
            table.redraw(true);
        } else if(how === "setColumns") {
            table.setColumns(table.getColumnDefinitions());
        } else if(how === "addColumn") {
            await table.addColumn({title: "Extra", field: "qa_extra"});
        } else if(how === "updateColumnDefinition") {
            const field = document.querySelector(s).getAttribute("tabulator-field");
            await table.updateColumnDefinition(field, {title: field.toUpperCase()});
        } else if(how === "moveColumn") {
            const fields = table.getColumns().map((c) => c.getField()).filter((f) => f);
            table.moveColumn(fields[0], fields[fields.length - 1], true);
        } else {
            table.setHeight(table.element.offsetHeight);
        }
    }, [sel, how]);
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

        await rebuild(page, sel, "redraw", problems);
        await page.waitForTimeout(300);
        results.push(["(b) open after a forced redraw", is_open(await cell_state(page, sel))]);

        await rebuild(page, sel, "setColumns", problems);
        await page.waitForTimeout(300);
        results.push(["(d) open after setColumns()", is_open(await cell_state(page, sel))]);

        await rebuild(page, sel, "setHeight", problems);
        await page.waitForTimeout(300);
        results.push(["(e) open after setHeight()", is_open(await cell_state(page, sel))]);

        for(const [label, how] of [["(f)", "addColumn"],
                                   ["(g)", "updateColumnDefinition"],
                                   ["(h)", "moveColumn"]]) {
            await rebuild(page, sel, how, problems);
            await page.waitForTimeout(300);
            results.push([`${label} open after ${how}()`, is_open(await cell_state(page, sel))]);
        }

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
    failures += await run_treedb(name, browser, "reload");
    failures += await run_treedb(name, browser, "stop");
    failures += await run_treedb(name, browser, "update");
    failures += await run_treedb(name, browser, "echo");
    await browser.close();
    return failures;
}

/*
 *  C_YUI_TREEDB_TOPIC_WITH_FORM: wipe the table with an editor open
 */
async function run_treedb(name, browser, how)
{
    const ctx = await browser.newContext({locale: "es-ES", timezoneId: "Europe/Madrid"});
    const page = await ctx.newPage();
    const problems = [];
    page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
    page.on("console", (m) => {
        if(m.type() === "error") {
            problems.push(`console.error: ${m.text()}`);
        }
    });
    const sel = `.tabulator-row .tabulator-cell[tabulator-field="name"]`;
    const on_age = (how === "update" || how === "echo");
    const open_sel = `.tabulator-row .tabulator-cell[tabulator-field="${on_age? "age" : "name"}"]`;
    await page.goto(BASE + "#/treedb");
    await page.waitForSelector(sel);
    await page.waitForTimeout(400);
    await page.evaluate(async () => {
        const url = performance.getEntriesByType("resource").map((r) => r.name)
            .find((n) => /gobj-js\/src\/gobj\.js/.test(n));
        const g = await import(url);
        let topic = null;
        g.gobj_walk_gobj_children_tree(g.gobj_yuno(), 3, (child) => {
            if(g.gobj_name(child) === "demo_treedb_topic") {
                topic = child;
            }
            return 0;
        });
        window.qa_g = g;
        window.qa_topic = topic;
        g.gobj_send_event(topic, "EV_EDITION_MODE", {}, topic);
    });
    await page.waitForTimeout(300);
    const age_before = (await page.$$eval(open_sel, (e) => e.map((c) => c.textContent.trim())))[1];
    await (await page.$$(open_sel))[1].click();
    await page.waitForTimeout(300);
    const opened = await page.$$eval(".tabulator-cell.tabulator-editing", (e) => e.length) === 1;
    let thrown = "";
    try {
        await page.evaluate(({how, age_before}) => {
            const g = window.qa_g;
            const topic = window.qa_topic;
            if(how === "reload") {
                g.gobj_send_event(topic, "EV_LOAD_NODES",
                    [{id: "x", name: "X"}, {id: "y", name: "Y"}], topic);
            } else if(how === "update") {
                g.gobj_send_event(topic, "EV_LOAD_NODE_UPDATED",
                    [{id: "alan", age: 99, name: "Alan M. Turing"}], topic);
            } else if(how === "echo") {
                const age = Number(age_before);
                g.gobj_send_event(topic, "EV_LOAD_NODE_UPDATED",
                    [{id: "alan", name: "Alan M. Turing", age: Number.isNaN(age)? age_before : age}], topic);
            } else {
                g.gobj_stop(topic);
            }
        }, {how, age_before});
    } catch(e) {
        thrown = e.message.split("\n")[0];
    }
    await page.waitForTimeout(400);
    let after = false;
    if(how === "reload") {
        after = await page.$$eval(sel, (e) => e.map((c) => c.textContent).join(",")) === "X,Y";
    } else if(how === "update") {
        after = await page.evaluate(() => {
            const $row = document.querySelectorAll(".tabulator-row")[1];
            const text = (f) => $row.querySelector(`.tabulator-cell[tabulator-field="${f}"]`).textContent.trim();
            return text("name") === "Alan M. Turing" && text("age") === "99" &&
                !document.querySelector(".tabulator-cell.tabulator-editing");
        });
    } else if(how === "echo") {
        after = await page.evaluate(() => {
            const $row = document.querySelectorAll(".tabulator-row")[1];
            const $name = $row.querySelector(`.tabulator-cell[tabulator-field="name"]`);
            const $ed = document.querySelector(".tabulator-cell.tabulator-editing");
            return $name.textContent.trim() === "Alan M. Turing" &&
                !!$ed && $ed.getAttribute("tabulator-field") === "age" && $row.contains($ed);
        });
    } else {
        after = await page.evaluate(() => !window.qa_g.gobj_is_running(window.qa_topic) &&
            !document.querySelector(".tabulator-cell.tabulator-editing"));
    }
    const CASES = {
        reload: ["i", "EV_LOAD_NODES", "the new rows drawn"],
        stop: ["j", "gobj_stop", "stopped, no cell in edition"],
        update: ["k", "EV_LOAD_NODE_UPDATED changing age", "the whole row painted, the edit cancelled"],
        echo: ["l", "EV_LOAD_NODE_UPDATED with age unchanged", "name painted, the age editor still open"],
    };
    const [letter, what, outcome] = CASES[how];
    const results = [
        [`(${letter}) an editor open in row 2`, opened],
        [`    ${what}: no exception`, !thrown],
        [`    ${outcome}`, after],
        ["    no pageerror / console error", problems.length === 0],
    ];
    let failures = 0;
    for(const [label, ok] of results) {
        console.log(`${ok? "PASS" : "FAIL"}  ${name} treedb: ${label}`);
        if(!ok) {
            failures++;
        }
    }
    if(thrown) {
        console.log(`      thrown: ${thrown}`);
    }
    for(const p of problems) {
        console.log(`      ${p}`);
    }
    await ctx.close();
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
