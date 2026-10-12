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
 *            3. All locales carry the same key set (symmetric). A PLURAL key
 *               (`songs_one`, `songs_few`, ...: i18next's `_zero` `_one`
 *               `_two` `_few` `_many` `_other`) is compared by its base, and
 *               each locale carries the plural categories of ITS language
 *               (Intl.PluralRules): English `one`/`other`, Spanish
 *               `one`/`many`/`other`, Russian `one`/`few`/`many`/`other`,
 *               Chinese `other`. The key with no suffix (`songs`) serves
 *               `other` and `many` -- i18next falls back to it -- but
 *               `zero`, `one`, `two` and `few` change the grammar and need
 *               their own form when the language has them. A form the
 *               language never uses is a violation; `_zero` is always
 *               allowed (i18next uses it for a count of 0).
 *            4. No duplicate key in a locale file (an object literal keeps
 *               the LAST one and says nothing -- a stale entry silently
 *               overrides a new one; it happened to "last" and "loading").
 *            5. Every key the SOURCE uses is defined (i18next answers an
 *               unknown key with the key ITSELF, so a missing entry renders
 *               fine and simply never changes language -- invisible by
 *               construction, and it shipped: a Settings `label` column).
 *
 *          Rule 5 reads the app's own source (recursively), the shell
 *          declaration (`src/app_config.json`) and the gobj-ui modules the
 *          app MOUNTS, transitively -- deep, through the barrel, or by a
 *          dynamic import(): the library translates through the APP's
 *          i18next, so a key it asks for and the app does not define
 *          renders raw (that is how the treedb editor shipped reading
 *          "edit", "new", "delete" in every language). The library scanned
 *          is THIS one -- the package the app installed and builds with,
 *          the one this script ships in.
 *
 *          Options (paths relative to the app's directory):
 *
 *              --src <dir>       a source directory to scan, besides src/
 *                                (repeatable: code shared by several apps)
 *              --locales <dir>   where the locales are (default src/locales/)
 *              --config <file>   the shell declaration
 *                                (default src/app_config.json)
 *
 *          And, in the app's package.json, what is particular to it:
 *
 *              "validate-locales": {
 *                  "attr_keys":  ["app_title", "welcome_lead"],
 *                  "array_keys": ["welcome_features"]
 *              }
 *
 *          `attr_keys` names properties whose string value is an i18n key
 *          (`app_title: "central"`), `array_keys` properties whose value is
 *          an array of keys. A key the app hands over that way reaches no
 *          t() the scan can read.
 *
 *          A locale is a file <code>.js of the locales directory (en.js,
 *          es.js, pt-br.js; flags.js and locales.js are not) exporting
 *          `{<code>}` with a `translation` dict. It is imported directly,
 *          not through locales.js, which drags in gobj-js and i18next and
 *          expects a browser. A file with a locale's name and no such
 *          export is said and skipped.
 *
 *          Exits 1 on any violation, so the build fails loudly.
 *
 *          Up to gobj-ui 7.26.24 every app carried its own copy, and the
 *          copies drifted into three families with different rules
 *          (REV-CLOUD V17.3.4). This one is their union, and an app keeps
 *          no copy.
 *
 *          Copyright (c) 2025-2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {readdirSync, readFileSync, existsSync, statSync} from "fs";
import {resolve} from "path";
import {pathToFileURL} from "url";

const ASCII_RE = /^[\x20-\x7e]+$/;
const LOCALE_FILE_RE = /^([a-z]{2,3}(?:[-_][a-zA-Z]{2,4})?)\.js$/;
const PLURAL_RE = /^(.+)_(zero|one|two|few|many|other)$/;

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
 *  Said, not a violation
 ***************************************************************/
function note(msg)
{
    process.stdout.write(`validate-locales: ${msg}\n`);
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
        config: new URL("src/app_config.json", APP_DIR),
        attr_keys: [],
        array_keys: []
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

    /*  What is particular to the app, in its package.json  */
    let pkg_url = new URL("package.json", APP_DIR);
    if(existsSync(pkg_url)) {
        let pkg;
        try {
            pkg = JSON.parse(readFileSync(pkg_url, "utf8"));
        } catch(e) {
            abort(`${pkg_url.pathname} is not valid json: ${e.message}`);
        }
        let cfg = pkg["validate-locales"] || {};
        for(let name of ["attr_keys", "array_keys"]) {
            let list = cfg[name] || [];
            if(!Array.isArray(list) || !list.every((x) => /^[A-Za-z_$][\w$]*$/.test(x))) {
                abort(`package.json "validate-locales".${name} must be a list of property names`);
            }
            opts[name] = list;
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
    let locales = {};
    for(let code of codes) {
        let mod = await import(new URL(`${code}.js`, locales_dir).href);
        let locale = mod[code] || mod[code.replace(/-/g, "_")] || mod.default;
        if(!locale || !locale.translation || typeof locale.translation !== "object") {
            note(`${code}.js exports no {${code}} with a translation dict: not a locale, skipped`);
            continue;
        }
        locales[code] = locale.translation;
    }
    if(Object.keys(locales).length === 0) {
        abort(`no locale (<code>.js exporting {<code>: {translation}}) in ${locales_dir.pathname}`);
    }
    return locales;
}

/***************************************************************
 *  The plural categories of a language (Intl.PluralRules)
 ***************************************************************/
function plural_categories(code)
{
    try {
        return new Set(new Intl.PluralRules(code.replace(/_/g, "-")).resolvedOptions().pluralCategories);
    } catch(e) {
        return new Set(["one", "other"]);
    }
}

/***************************************************************
 *  A locale's keys split: plain ones, and {base: Set(categories)}
 ***************************************************************/
function split_plurals(keys)
{
    let plain = new Set();
    let plurals = new Map();
    for(let k of keys) {
        let m = k.match(PLURAL_RE);
        if(m) {
            if(!plurals.has(m[1])) {
                plurals.set(m[1], new Set());
            }
            plurals.get(m[1]).add(m[2]);
        } else {
            plain.add(k);
        }
    }
    return {plain, plurals};
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
    let split = {};
    for(let code of codes) {
        let keys = Object.keys(locales[code]);
        split[code] = split_plurals(keys);
        for(let k of keys) {
            if(!ASCII_RE.test(k)) {
                fail(`[${code}] non-ASCII key: ${JSON.stringify(k)}`);
            }
            if(k !== k.toLowerCase()) {
                fail(`[${code}] non-lower-case key: ${JSON.stringify(k)}`);
            }
        }
    }

    /*
     *  The plural bases, of any locale: a plain key that is one of them
     *  belongs to its plural, and is checked with it
     */
    let bases = new Set();
    for(let code of codes) {
        for(let base of split[code].plurals.keys()) {
            bases.add(base);
        }
    }

    /*  Symmetry of the plain keys: every locale carries those of the first  */
    let ref = codes[0];
    let plain_of = (code) => new Set([...split[code].plain].filter((k) => !bases.has(k)));
    let ref_plain = plain_of(ref);
    for(let code of codes.slice(1)) {
        let cur = plain_of(code);
        for(let k of ref_plain) {
            if(!cur.has(k)) {
                fail(`[${code}] missing key present in [${ref}]: ${JSON.stringify(k)}`);
            }
        }
        for(let k of cur) {
            if(!ref_plain.has(k)) {
                fail(`[${code}] extra key not in [${ref}]: ${JSON.stringify(k)}`);
            }
        }
    }

    /*
     *  The plural keys: every base in every locale, with the categories of
     *  ITS language -- not the same suffixes everywhere. The key with no
     *  suffix serves `other` and `many`.
     */
    const SERVED_BY_THE_BASE = new Set(["other", "many"]);
    for(let code of codes) {
        let wanted = plural_categories(code);
        for(let base of bases) {
            let have = split[code].plurals.get(base) || new Set();
            let has_base = split[code].plain.has(base);
            for(let c of wanted) {
                if(!have.has(c) && !(has_base && SERVED_BY_THE_BASE.has(c))) {
                    fail(`[${code}] plural ${JSON.stringify(base)} lacks the form "${c}" of its language` +
                        (SERVED_BY_THE_BASE.has(c)? ` (or the key ${JSON.stringify(base)} itself)` : ""));
                }
            }
            for(let c of have) {
                if(!wanted.has(c) && c !== "zero") {
                    fail(`[${code}] plural ${JSON.stringify(base)} has a form "${c}" its language never uses`);
                }
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
        if(!ref_plain.has(k) && !bases.has(k)) {
            fail(`key used in the source but defined in NO locale: ${JSON.stringify(k)}`);
        }
    }

    if(errors > 0) {
        process.stderr.write(`validate-locales: ${errors} violation(s), see above\n`);
        process.exit(1);
    }

    let n_keys = ref_plain.size + bases.size;
    process.stdout.write(
        `validate-locales: OK (${codes.length} locales x ${n_keys} keys` +
        (bases.size? `, ${bases.size} plural` : "") +
        `, ${used.size} used in the source)\n`);
}

/***************************************************************
 *  The i18n keys the source asks for
 *
 *  A string literal is matched by its own quote: an apostrophe inside
 *  double quotes ("don't") is part of the key.
 *
 *  The (?!\s*\+) guards skip a key BUILT BY CONCATENATION
 *  (`i18n: "kind_" + t.kind`): the literal is only a prefix, the real key
 *  cannot be known statically, and demanding "kind_" is a false positive.
 *  Such keys are not validated: keep them in sync by hand. The guard is
 *  right after the literal, INSIDE the call: `t('topic') + ':'`
 *  concatenates the result, and its key is asked for.
 ***************************************************************/
const STR = String.raw`(?:"([^"\n]+)"|'([^'\n]+)')`;
const STR_OR_TEMPLATE = String.raw`(?:"([^"\n]+)"|'([^'\n]+)'|` + "`" + String.raw`([^` + "`" + String.raw`$\n]+)` + "`" + ")";
const NOT_CONCAT = String.raw`(?!\s*\+)`;

function re(source)
{
    return new RegExp(source, "g");
}

const PATTERNS = [
    re(String.raw`\bt\(\s*` + STR_OR_TEMPLATE + NOT_CONCAT),
    /*  A local ALIAS of `t` is a blind spot: `yui_tabulator_i18n.js` asks
     *  for its whole chrome through `tr(key, default)`.  */
    re(String.raw`\btr\(\s*` + STR_OR_TEMPLATE + NOT_CONCAT),
    /*  The codes the schema checks hand to `t(finding.code)` /
     *  `t(conflict.code)`: an i18n key each, written where it is born.  */
    re(String.raw`\badd\(\s*['"](?:error|warning)['"]\s*,\s*` + STR),
    re(String.raw`\bcode:\s*` + STR + NOT_CONCAT),
    /*  What refresh_language() re-translates  */
    re(String.raw`\bi18n:\s*` + STR + NOT_CONCAT),
    re(String.raw`["']data-i18n(?:-title|-aria-label|-placeholder)?["']:\s*` + STR + NOT_CONCAT),
    re(String.raw`\bsetAttribute\(\s*["']data-i18n(?:-title|-aria-label|-placeholder)?["']\s*,\s*` + STR + NOT_CONCAT),
    /data-i18n(?:-title|-aria-label|-placeholder)?=["']([^"']+)["']/g
];

function literal_of(m)
{
    for(let i = 1; i < m.length; i++) {
        if(m[i] !== undefined) {
            return m[i];
        }
    }
    return undefined;
}

function collect_used_keys(opts)
{
    let keys = new Set();

    let patterns = [...PATTERNS];
    if(opts.attr_keys.length > 0) {
        /*  The app's own: properties whose value is a key  */
        patterns.push(re(String.raw`\b(?:` + opts.attr_keys.join("|") + String.raw`)\s*:\s*` + STR));
    }
    let array_re = opts.array_keys.length > 0?
        re(String.raw`\b(?:` + opts.array_keys.join("|") + String.raw`)\s*:\s*\[([^\]]*)\]`) : null;

    let scan = (url) => {
        /*  Comments are not code: the library documents the contract with
         *  examples like `data-i18n="<key>"`.  */
        let code = strip_comments(readFileSync(url, "utf8"));
        for(let r of patterns) {
            r.lastIndex = 0;
            let m;
            while((m = r.exec(code)) !== null) {
                let k = literal_of(m);
                /*  A key INTERPOLATED in a template (`data-i18n="${key}"`)
                 *  cannot be known statically either  */
                if(!k || k.includes("${")) {
                    continue;
                }
                keys.add(k);
            }
        }
        if(array_re) {
            array_re.lastIndex = 0;
            let f;
            while((f = array_re.exec(code)) !== null) {
                let lit_re = re(STR);
                let l;
                while((l = lit_re.exec(f[1])) !== null) {
                    keys.add(literal_of(l));
                }
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
        for(let url of source_files(dir, opts.locales)) {
            let src = scan(url);
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
 *  The .js files of a source directory, recursively: not the tests, not
 *  the locales (their keys are definitions, not uses), not node_modules
 *  or a build
 ***************************************************************/
function source_files(dir, locales_dir)
{
    let out = [];
    let walk = (d) => {
        if(d.href === locales_dir.href) {
            return;
        }
        for(let f of readdirSync(d).sort()) {
            let url = new URL(f, d);
            let st = statSync(url);
            if(st.isDirectory()) {
                if(f === "node_modules" || f === "dist" || f.startsWith(".")) {
                    continue;
                }
                walk(new URL(f + "/", d));
            } else if(f.endsWith(".js") && !f.endsWith(".test.js")) {
                out.push(url);
            }
        }
    };
    walk(dir);
    return out;
}

/***************************************************************
 *  The shell declaration (`app_config.json`) holds i18n keys in DATA:
 *  every `name`, `aria_label` and `tooltip` of an item, the `label` of a
 *  C_YUI_NODE node, the `title` / `subtitle` of a route's kw. No `t()`
 *  names them, and a missing one renders in raw lower-case English for
 *  ever -- which is how four toolbar buttons announced themselves as
 *  "toggle language" in Spanish.
 *
 *  A value that is not a KEY -- not lower-case ASCII -- is a literal the
 *  config carries on purpose: "ES/EN" on a language button, an endonym
 *  ("中文", "Español") in a language menu. `wordmark` and `alt` are
 *  deliberately out: a brand name is not translated. A key starting with
 *  `_` is a comment.
 ***************************************************************/
const CONFIG_I18N_FIELDS = ["name", "aria_label", "tooltip", "label", "title", "subtitle"];

function keys_from_shell_config(url, keys)
{
    if(!existsSync(url)) {
        note(`no ${url.pathname}: no shell keys checked`);
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
                    && ASCII_RE.test(v) && v === v.toLowerCase()) {
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
    let r = /export\s*\{([^}]*)\}\s*from\s*["']\.\/src\/([\w.-]+\.js)["']/g;
    let m;
    while((m = r.exec(src)) !== null) {
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
 *    - deep:    "@yuneta/gobj-ui/src/x.js", also by a dynamic import()
 *    - barrel:  "@yuneta/gobj-ui[/index.js]", resolved per imported symbol
 *    - inside the library: "./x.js" (in the app it names an app file,
 *      scanned already)
 ***************************************************************/
function lib_imports(src, barrel, inside_lib)
{
    let out = [];
    let m;

    let from_app = /(?:from\s+|import\(\s*)["']@yuneta\/gobj-ui\/src\/([\w.-]+\.js)["']/g;
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
        let inside = /(?:from\s+|import\(\s*)["']\.\/([\w.-]+\.js)["']/g;
        while((m = inside.exec(src)) !== null) {
            out.push(m[1]);
        }
    }
    return out;
}

await main();
