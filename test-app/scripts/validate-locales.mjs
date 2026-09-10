/***********************************************************************
 *          validate-locales.mjs
 *
 *          The guard the demo did not have -- and it is the consumer
 *          that mounts EVERY gadget of the library, so it is the first
 *          place a key the library asks for should be caught.
 *
 *          This app inverts the convention of the other consumers, on
 *          purpose: **English is the source**, so a key IS the English
 *          string the UI ships and the `en` bundle is nearly empty, each
 *          key falling back to itself. Two consequences for the rules:
 *
 *            - keys are NOT required to be lower-case (they are English
 *              prose, Title Case included);
 *            - only the `es` bundle is checked for coverage. A key
 *              missing there renders in English and never changes
 *              language, which is exactly what a dump of the deployed
 *              demo showed for 40+ of them -- the paginator, the modal
 *              buttons, the wizard, the JSON viewer's own toolbar.
 *
 *          What it does check, like every other copy:
 *
 *            1. No duplicate key (an object literal keeps the LAST one
 *               and says nothing).
 *            2. Every key the SOURCE asks for is defined -- the app's
 *               own views, the gobj-ui modules it MOUNTS (transitively:
 *               the library translates through THIS app's i18next), and
 *               the shell declaration, which holds keys as DATA.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {readdirSync, readFileSync} from "fs";

function fail(msg) {
    process.stderr.write(`validate-locales: ${msg}\n`);
}

/***************************************************************
 *  The `es` bundle, read from the SOURCE.
 *
 *  Not imported: locales.js pulls in i18next, which expects a
 *  browser. The bundle is one object literal, so the raw text is
 *  enough -- and it is what the duplicate check needs anyway.
 ***************************************************************/
function es_keys_and_dups() {
    const src = strip_comments(
        readFileSync(new URL("../src/locales.js", import.meta.url), "utf8"));
    const start = src.indexOf("const es_translation = {");
    const end = src.indexOf("const en_translation = {");
    if(start < 0 || end < 0 || end < start) {
        fail("locales.js: cannot find the es_translation block");
        process.exit(1);
    }
    const block = src.slice(start, end);
    const keys = new Set();
    const dups = [];
    /*  `[^"]+` would stop at the first ESCAPED quote and hand back half a
     *  key: this app's keys are English PROSE, and one of them quotes
     *  `layout:"drawer"`. Allow `\\.` inside, and unescape what comes out,
     *  or the guard demands a translation for a key that is already
     *  there.  */
    const re = /^\s*"((?:[^"\\]|\\.)*)":/gm;
    let m;
    while((m = re.exec(block)) !== null) {
        const key = JSON.parse(`"${m[1]}"`);
        if(keys.has(key)) {
            dups.push(key);
        }
        keys.add(key);
    }
    return {keys, dups};
}

function main() {
    let errors = 0;
    const {keys: es, dups} = es_keys_and_dups();

    /*  No ASCII rule here, unlike every other copy: in this app a key IS
     *  the English string the UI ships, so an em-dash in a lead paragraph
     *  is typography, not a mistake.  */
    for(const k of dups) {
        fail(`[es] DUPLICATE key (the later one silently wins): ${JSON.stringify(k)}`);
        errors++;
    }

    const used = collect_used_keys();
    for(const k of used) {
        if(!es.has(k)) {
            fail(`key used but NOT translated in [es]: ${JSON.stringify(k)}`);
            errors++;
        }
    }

    if(errors > 0) {
        fail(`${errors} violation(s) -- see above`);
        process.exit(1);
    }

    process.stdout.write(
        `validate-locales: OK (${es.size} es keys, ${used.size} used in the source)\n`);
}

/***************************************************************
 *  The i18n keys the source asks for: t("…") and the attributes
 *  refresh_language() re-translates.
 ***************************************************************/
function collect_used_keys() {
    const keys = new Set();

    const patterns = [
        /\bt\(\s*['"]([^'"]+)['"]/g,
        /\bi18n:\s*['"]([^'"]+)['"]/g,
        /["']data-i18n(?:-title|-aria-label|-placeholder)?["']:\s*['"]([^'"]+)['"]/g,
        /data-i18n(?:-title|-aria-label|-placeholder)?=["']([^"']+)["']/g
    ];
    const scan = (url) => {
        const src = readFileSync(url, "utf8");
        /*  Comments are not code: the library documents its contract with
         *  examples like `data-i18n="<key>"`, and a scan that reads them
         *  asks the locales for a key nobody uses.  */
        const code = strip_comments(src);
        for(const re of patterns) {
            let m;
            while((m = re.exec(code)) !== null) {
                keys.add(m[1]);
            }
        }
        return code;
    };

    /*  This app's own views -- locales.js excluded: it IS the bundle,
     *  and its Spanish values are not keys.  */
    const dir = new URL("../src/", import.meta.url);
    const own = readdirSync(dir)
        .filter((f) => f.endsWith(".js") && !f.endsWith(".test.js") && f !== "locales.js");
    const pending = [];
    for(const f of own) {
        const src = scan(new URL(f, dir));
        pending.push(...lib_imports(src));
    }

    /*  ...and the gobj-ui modules it MOUNTS. The library translates through
     *  the APP's i18next: a key it asks for and this app does not define
     *  renders as the raw key, in every language.  */
    const lib = new URL("../../src/", import.meta.url);
    const seen = new Set();
    while(pending.length > 0) {
        const name = pending.pop();
        if(seen.has(name)) {
            continue;
        }
        seen.add(name);
        let src;
        try {
            src = scan(new URL(name, lib));
        } catch(e) {
            continue;   /*  not a source module of the library (css, asset)  */
        }
        pending.push(...lib_imports(src));
    }

    keys_from_shell_config(keys, "app_config.json");
    keys_from_shell_config(keys, "app_config_tree.json");

    return keys;
}

/***************************************************************
 *  The shell declaration holds i18n keys in DATA: every `name`,
 *  `aria_label` and `tooltip` of an item is a key the shell asks
 *  i18next for. No `t()` names them, so the scan above never sees
 *  them -- and a missing one renders in English for ever.
 *
 *  `wordmark` and `alt` are DELIBERATELY out: a brand name is not
 *  translated, and demanding a key for it would only invite one.
 *  So is `ES/EN`, which is a symbol and not prose -- see the
 *  literal test below.
 ***************************************************************/
const CONFIG_I18N_FIELDS = ["name", "aria_label", "tooltip"];

/*  A value with no letter to translate (`ES/EN`, `19 px`, an arrow) is a
 *  literal the config carries on purpose, not a key.  */
function looks_like_prose(value) {
    return /[a-z]/.test(value);
}

function keys_from_shell_config(keys, file) {
    let cfg;
    try {
        cfg = JSON.parse(
            readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8"));
    } catch(e) {
        console.warn(`validate-locales: ${file} not read (${e.message}) -- `
            + `its keys will NOT be validated`);
        return;
    }
    const walk = (n) => {
        if(Array.isArray(n)) {
            for(const v of n) {
                walk(v);
            }
            return;
        }
        if(n && typeof n === "object") {
            for(const [k, v] of Object.entries(n)) {
                if(CONFIG_I18N_FIELDS.includes(k) && typeof v === "string" && v
                        && looks_like_prose(v)) {
                    keys.add(v);
                }
                walk(v);
            }
        }
    };
    walk(cfg);
}

/***************************************************************
 *  Drop /* … *\/ and // … comments.
 ***************************************************************/
function strip_comments(src) {
    return src
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
}

/***************************************************************
 *  The gobj-ui source modules a file imports ("@yuneta/gobj-ui/src/x.js"
 *  from the app, "./x.js" from inside the library).
 ***************************************************************/
function lib_imports(src) {
    const out = [];
    let m;
    const from_app = /from\s+["']@yuneta\/gobj-ui\/src\/([\w.-]+\.js)["']/g;
    while((m = from_app.exec(src)) !== null) {
        out.push(m[1]);
    }
    const inside = /from\s+["']\.\/([\w.-]+\.js)["']/g;
    while((m = inside.exec(src)) !== null) {
        out.push(m[1]);
    }
    return out;
}

main();
