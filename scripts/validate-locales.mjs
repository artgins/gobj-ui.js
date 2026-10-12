#!/usr/bin/env node
/***********************************************************************
 *          validate-locales.mjs
 *
 *          The i18n check of every app that builds on gobj-ui, run from the
 *          APP's directory (its `prebuild`):
 *
 *              node node_modules/@yuneta/gobj-ui/scripts/validate-locales.mjs
 *
 *          It enforces, on every locale of the app:
 *
 *            1. Keys are ASCII (no em-dash, accents, etc.).
 *            2. Keys are lower-case.
 *            3. All locales carry the same key set (symmetric).
 *            4. No duplicate key in a locale file (an object literal keeps
 *               the LAST one and says nothing -- a stale entry silently
 *               overrides a new one; it happened to "last" and "loading").
 *            5. Every key the SOURCE uses is defined (i18next answers an
 *               unknown key with the key ITSELF, so a missing entry renders
 *               fine and simply never changes language -- invisible by
 *               construction, and it shipped: a Settings `label` column).
 *
 *          Rule 5 reads the app's own source, the shell declaration
 *          (`src/app_config.json`) and the gobj-ui modules the app MOUNTS,
 *          transitively: the library translates through the APP's i18next,
 *          so a key it asks for and the app does not define renders raw
 *          (that is how the treedb editor shipped reading "edit", "new",
 *          "delete" in every language). The library scanned is THIS one --
 *          the package the app installed and builds with, the one this
 *          script ships in.
 *
 *          Options (paths relative to the app's directory):
 *
 *              --src <dir>       a source directory to scan, besides src/
 *                                (repeatable: code shared by several apps)
 *              --locales <dir>   where the locales are (default src/locales/)
 *              --config <file>   the shell declaration
 *                                (default src/app_config.json)
 *
 *          A locale is a file <code>.js of the locales directory (en.js,
 *          es.js; flags.js and locales.js are not) exporting
 *          `{<code>}` with a `translation` dict. It is imported directly,
 *          not through locales.js, which drags in gobj-js and i18next and
 *          expects a browser.
 *
 *          Exits 1 on any violation, so the build fails loudly.
 *
 *          Up to gobj-ui 7.26.24 every app carried its own copy, and the
 *          copies drifted into three families with different rules: only
 *          one read the codes of the schema editor, only the other two the
 *          barrel imports and the keys built by concatenation (REV-CLOUD
 *          V17.3.4). This one is their union, and an app keeps no copy.
 *
 *          Copyright (c) 2025-2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {readdirSync, readFileSync, existsSync} from "fs";
import {resolve} from "path";
import {pathToFileURL} from "url";

const ASCII_RE = /^[\x20-\x7e]+$/;
const LOCALE_FILE_RE = /^([a-z]{2,3})\.js$/;

/*  This package: the library the app builds with.  */
const LIB       = new URL("../", import.meta.url);
const LIB_SRC   = new URL("src/", LIB);
const LIB_INDEX = new URL("index.js", LIB);

/*  The app: the directory it is run from.  */
const APP_DIR = pathToFileURL(process.cwd() + "/");

let errors = 0;

/***************************************************************
 *
 ***************************************************************/
function fail(msg)
{
    process.stderr.write(`validate-locales: ${msg}\n`);
    errors++;
}

/***************************************************************
 *  A fatal problem of the setup, not a violation: said, exit 1
 ***************************************************************/
function abort(msg)
{
    process.stderr.write(`validate-locales: ${msg}\n`);
    process.exit(1);
}

/***************************************************************
 *  The directory a path names, as a URL ending in '/'
 ***************************************************************/
function dir_url(path)
{
    let p = resolve(process.cwd(), path);
    return pathToFileURL(p.endsWith("/") ? p : p + "/");
}

/***************************************************************
 *
 ***************************************************************/
function parse_args(argv)
{
    let opts = {
        src: [new URL("src/", APP_DIR)],
        locales: new URL("src/locales/", APP_DIR),
        config: new URL("src/app_config.json", APP_DIR)
    };
    for(let i = 0; i < argv.length; i++) {
        let a = argv[i];
        let v = argv[i + 1];
        if(a === "--src" || a === "--locales" || a === "--config") {
            if(!v) {
                abort(`${a} needs a value`);
            }
            i++;
        }
        if(a === "--src") {
            opts.src.push(dir_url(v));
        } else if(a === "--locales") {
            opts.locales = dir_url(v);
        } else if(a === "--config") {
            opts.config = pathToFileURL(resolve(process.cwd(), v));
        } else {
            abort(`unknown argument: ${a} (--src <dir>, --locales <dir>, --config <file>)`);
        }
    }
    return opts;
}

/***************************************************************
 *  The locales of the app: {code: translation}
 ***************************************************************/
async function load_locales(locales_dir)
{
    if(!existsSync(locales_dir)) {
        abort(`no locales directory at ${locales_dir.pathname}`);
    }
    let codes = readdirSync(locales_dir)
        .map((f) => (f.match(LOCALE_FILE_RE) || [])[1])
        .filter(Boolean)
        .sort();
    /*  The reference is English when there is one  */
    if(codes.includes("en")) {
        codes = ["en", ...codes.filter((c) => c !== "en")];
    }
    if(codes.length === 0) {
        abort(`no locale (<code>.js) in ${locales_dir.pathname}`);
    }
    let locales = {};
    for(let code of codes) {
        let mod = await import(new URL(`${code}.js`, locales_dir).href);
        let locale = mod[code] || mod.default;
        if(!locale || !locale.translation || typeof locale.translation !== "object") {
            abort(`${code}.js does not export {${code}} with a translation dict`);
        }
        locales[code] = locale.translation;
    }
    return locales;
}

/***************************************************************
 *
 ***************************************************************/
async function main()
{
    let opts = parse_args(process.argv.slice(2));
    let locales = await load_locales(opts.locales);
    let codes = Object.keys(locales);

    /*  Per-locale key checks (ASCII + lower-case)  */
    let key_sets = {};
    for(let code of codes) {
        let keys = Object.keys(locales[code]);
        key_sets[code] = new Set(keys);
        for(let k of keys) {
            if(!ASCII_RE.test(k)) {
                fail(`[${code}] non-ASCII key: ${JSON.stringify(k)}`);
            }
            if(k !== k.toLowerCase()) {
                fail(`[${code}] non-lower-case key: ${JSON.stringify(k)}`);
            }
        }
    }

    /*  Symmetry: every locale carries the same keys as the first  */
    let ref = codes[0];
    let ref_keys = key_sets[ref];
    for(let code of codes.slice(1)) {
        let cur = key_sets[code];
        for(let k of ref_keys) {
            if(!cur.has(k)) {
                fail(`[${code}] missing key present in [${ref}]: ${JSON.stringify(k)}`);
            }
        }
        for(let k of cur) {
            if(!ref_keys.has(k)) {
                fail(`[${code}] extra key not in [${ref}]: ${JSON.stringify(k)}`);
            }
        }
    }

    /*
     *  No DUPLICATE key in a locale file. A JS object literal keeps the LAST
     *  of two identical keys and says nothing, so the imported dict looks
     *  fine while the file lies. Only the raw text can see it.
     */
    for(let code of codes) {
        let src = strip_comments(readFileSync(new URL(`${code}.js`, opts.locales), "utf8"));
        let seen = new Set();
        let re = /^\s*"([^"]+)":/gm;
        let m;
        while((m = re.exec(src)) !== null) {
            if(seen.has(m[1])) {
                fail(`[${code}] DUPLICATE key (the later one silently wins): ${JSON.stringify(m[1])}`);
            }
            seen.add(m[1]);
        }
    }

    /*  Every key the source asks for exists: a missing one is a violation, not a fallback  */
    let used = collect_used_keys(opts);
    for(let k of used) {
        if(!ref_keys.has(k)) {
            fail(`key used in the source but defined in NO locale: ${JSON.stringify(k)}`);
        }
    }

    if(errors > 0) {
        process.stderr.write(`validate-locales: ${errors} violation(s), see above\n`);
        process.exit(1);
    }

    process.stdout.write(
        `validate-locales: OK (${codes.length} locales x ${ref_keys.size} keys, ` +
        `${used.size} used in the source)\n`);
}

/***************************************************************
 *  The i18n keys the source asks for
 ***************************************************************/
const PATTERNS = [
    /*
     *  Both quote styles: the apps quote with ", the library with '.
     *
     *  The (?!\s*\+) guards skip a key BUILT BY CONCATENATION
     *  (`i18n: "kind_" + t.kind`): the literal is only a prefix, the real
     *  key cannot be known statically, and demanding "kind_" is a false
     *  positive. Such keys are not validated: keep them in sync by hand.
     */
    /\bt\(\s*['"]([^'"]+)['"](?!\s*\+)/g,
    /*  A local ALIAS of `t` is a blind spot: `yui_tabulator_i18n.js` asks
     *  for its whole chrome through `tr(key, default)`.  */
    /\btr\(\s*['"]([^'"]+)['"](?!\s*\+)/g,
    /*  The codes the schema checks hand to `t(finding.code)` /
     *  `t(conflict.code)`: an i18n key each, written where it is born.  */
    /\badd\(\s*['"](?:error|warning)['"]\s*,\s*['"]([^'"]+)['"]/g,
    /\bcode:\s*['"]([^'"]+)['"](?!\s*\+)/g,
    /*  What refresh_language() re-translates  */
    /\bi18n:\s*['"]([^'"]+)['"](?!\s*\+)/g,
    /["']data-i18n(?:-title|-aria-label|-placeholder)?["']:\s*['"]([^'"]+)['"](?!\s*\+)/g,
    /data-i18n(?:-title|-aria-label|-placeholder)?=["']([^"']+)["']/g,
    /*  Keys an app hands its orchestrator as ATTRIBUTES (yunovatios):
     *  no t(), no i18n:, so a typo there rendered raw  */
    /\b(?:app_title|app_subtitle|welcome_title|welcome_lead)\s*:\s*['"]([^'"]+)['"]/g
];

function collect_used_keys(opts)
{
    let keys = new Set();

    let scan = (url) => {
        /*  Comments are not code: the library documents the contract with
         *  examples like `data-i18n="<key>"`.  */
        let code = strip_comments(readFileSync(url, "utf8"));
        for(let re of PATTERNS) {
            re.lastIndex = 0;
            let m;
            while((m = re.exec(code)) !== null) {
                /*  A key INTERPOLATED in a template (`data-i18n="${key}"`)
                 *  cannot be known statically either  */
                if(m[1].includes("${")) {
                    continue;
                }
                keys.add(m[1]);
            }
        }
        /*  The bullets of a welcome panel: an array of keys  */
        let feats = /welcome_features\s*:\s*\[([^\]]*)\]/g;
        let f;
        while((f = feats.exec(code)) !== null) {
            for(let lit of f[1].match(/['"]([^'"]+)['"]/g) || []) {
                keys.add(lit.slice(1, -1));
            }
        }
        return code;
    };

    let barrel = barrel_export_map();

    /*  The app's own source, and the code it shares with others  */
    let pending = [];
    for(let dir of opts.src) {
        if(!existsSync(dir)) {
            abort(`no source directory at ${dir.pathname}`);
        }
        let own = readdirSync(dir).filter((f) => {
            return f.endsWith(".js") && !f.endsWith(".test.js");
        });
        for(let f of own) {
            let src = scan(new URL(f, dir));
            pending.push(...lib_imports(src, barrel, false));
        }
    }

    keys_from_shell_config(opts.config, keys);

    /*
     *  ...and the gobj-ui views it MOUNTS. Only the modules actually
     *  imported are scanned, transitively: the library carries views the
     *  app never mounts.
     */
    if(!existsSync(LIB_SRC)) {
        abort(`no gobj-ui source at ${LIB_SRC.pathname}`);
    }
    let missing = [];
    let seen = new Set();
    while(pending.length > 0) {
        let name = pending.pop();
        if(seen.has(name)) {
            continue;
        }
        seen.add(name);
        let url = new URL(name, LIB_SRC);
        if(!existsSync(url)) {
            missing.push(name);
            continue;
        }
        let src = scan(url);
        pending.push(...lib_imports(src, barrel, true));
    }
    if(missing.length > 0) {
        abort(`modules of gobj-ui not found in ${LIB_SRC.pathname}: ${missing.join(", ")}`);
    }

    return keys;
}

/***************************************************************
 *  The shell declaration (`app_config.json`) holds i18n keys in DATA:
 *  every `name`, `aria_label` and `tooltip` of an item, the `label` of a
 *  C_YUI_NODE node, the `title` / `subtitle` of a route's kw. No `t()`
 *  names them, and a missing one renders in raw lower-case English for
 *  ever -- which is how four toolbar buttons announced themselves as
 *  "toggle language" in Spanish.
 *
 *  A value that is not lower-case is not a KEY: it is a literal the config
 *  carries on purpose ("ES/EN" on a language button). `wordmark` and `alt`
 *  are deliberately out: a brand name is not translated. A key starting
 *  with `_` is a comment.
 ***************************************************************/
const CONFIG_I18N_FIELDS = ["name", "aria_label", "tooltip", "label", "title", "subtitle"];

function keys_from_shell_config(url, keys)
{
    if(!existsSync(url)) {
        process.stdout.write(`validate-locales: no ${url.pathname}: no shell keys checked\n`);
        return;
    }
    let config;
    try {
        config = JSON.parse(readFileSync(url, "utf8"));
    } catch(e) {
        abort(`${url.pathname} is not valid json: ${e.message}`);
    }
    let walk = (node) => {
        if(Array.isArray(node)) {
            for(let item of node) {
                walk(item);
            }
            return;
        }
        if(!node || typeof node !== "object") {
            return;
        }
        for(let [k, v] of Object.entries(node)) {
            if(k.startsWith("_")) {
                continue;
            }
            if(CONFIG_I18N_FIELDS.includes(k) && typeof v === "string" && v
                    && v === v.toLowerCase()) {
                keys.add(v);
            }
            walk(v);
        }
    };
    walk(config);
}

/***************************************************************
 *  Drop /* ... *\/ and // ... comments (good enough for a key scan: a "//"
 *  or "/*" inside a string would only ever cost a key we then report)
 ***************************************************************/
function strip_comments(src)
{
    return src
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
}

/***************************************************************
 *  The barrel's public surface: exported symbol -> the src/ module that
 *  defines it, read from index.js's re-exports
 *  (`export {a, b as c} from "./src/x.js"`). A barrel import is resolved
 *  to the modules it really pulls in, not to the whole library.
 ***************************************************************/
function barrel_export_map()
{
    let map = new Map();
    let src;
    try {
        src = strip_comments(readFileSync(LIB_INDEX, "utf8"));
    } catch(e) {
        abort(`cannot read the gobj-ui barrel at ${LIB_INDEX.pathname}: ${e.message}`);
    }
    let re = /export\s*\{([^}]*)\}\s*from\s*["']\.\/src\/([\w.-]+\.js)["']/g;
    let m;
    while((m = re.exec(src)) !== null) {
        let mod = m[2];
        for(let sym of m[1].split(",")) {
            sym = sym.trim();
            if(!sym) {
                continue;
            }
            /*  `a as b` is published as `b`  */
            let parts = sym.split(/\s+as\s+/);
            map.set(parts[parts.length - 1].trim(), mod);
        }
    }
    return map;
}

/***************************************************************
 *  The gobj-ui source modules a file imports:
 *    - deep:   "@yuneta/gobj-ui/src/x.js"
 *    - barrel: "@yuneta/gobj-ui[/index.js]", resolved per imported symbol
 *    - inside the library: "./x.js" (in the app it names an app file,
 *      scanned already)
 ***************************************************************/
function lib_imports(src, barrel, inside_lib)
{
    let out = [];
    let m;

    let from_app = /from\s+["']@yuneta\/gobj-ui\/src\/([\w.-]+\.js)["']/g;
    while((m = from_app.exec(src)) !== null) {
        out.push(m[1]);
    }

    let from_barrel = /import\s*\{([^}]*)\}\s*from\s*["']@yuneta\/gobj-ui(?:\/index\.js)?["']/g;
    while((m = from_barrel.exec(src)) !== null) {
        for(let sym of m[1].split(",")) {
            sym = sym.trim().split(/\s+as\s+/)[0].trim();
            let mod = barrel.get(sym);
            if(mod) {
                out.push(mod);
            }
        }
    }

    if(inside_lib) {
        let inside = /from\s+["']\.\/([\w.-]+\.js)["']/g;
        while((m = inside.exec(src)) !== null) {
            out.push(m[1]);
        }
    }
    return out;
}

await main();
