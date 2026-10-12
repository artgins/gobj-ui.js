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
 *               allowed (i18next uses it for a count of 0). i18next itself
 *               falls back to the bare key for ANY missing form: asking for
 *               `one`/`few` is a policy of grammar, not of i18next. A group
 *               is a plural only when some locale has its bare base
 *               (`songs`) or its `_other` form: keys that only END like
 *               forms are plain keys (`pick_one` alone; `step_one`,
 *               `step_two`, `step_three`, an enumeration). A form asked for
 *               directly, `t("pick_one")` next to a bare `pick`, is a key
 *               the source uses like any other. Ordinals
 *               (`place_ordinal_one`) are checked with the ordinal
 *               categories of each language; the `_ordinal_` infix says
 *               they are plural forms.
 *            4. No duplicate key in a locale file (an object literal keeps
 *               the LAST one and says nothing -- a stale entry silently
 *               overrides a new one; it happened to "last" and "loading").
 *            5. Every key the SOURCE uses is defined (i18next answers an
 *               unknown key with the key ITSELF, so a missing entry renders
 *               fine and simply never changes language -- invisible by
 *               construction, and it shipped: a Settings `label` column).
 *
 *          Rule 5 PARSES the app's own source -- acorn reads a source file
 *          as a syntax tree, it never RUNS one --, recursively, .js and
 *          .mjs (not tests, not a locales/ directory), the shell
 *          declaration (`src/app_config.json`) and the gobj-ui modules the
 *          app MOUNTS, transitively -- deep, through the barrel, or by a
 *          dynamic import(): the library translates through the APP's
 *          i18next, so a key it asks for and the app does not define
 *          renders raw (that is how the treedb editor shipped reading
 *          "edit", "new", "delete" in every language). The library scanned
 *          is THIS one -- the package the app installed and builds with,
 *          the one this script ships in. (A LOCALE is not a source: it is
 *          parsed and then imported, and its top-level code runs; see
 *          below.) In each file it reads as keys:
 *
 *            - the string given to t() / tr(), to an `i18n` or `code`
 *              property, to a `data-i18n*` attribute (as a property, as a
 *              member written, `x.i18n = k` / `x["data-i18n-title"] = k`,
 *              by setAttribute(), or written in markup), and the codes of
 *              the schema checks (`add("error", "<code>")`);
 *            - the strings given to a gobj-ui function that RECEIVES a key
 *              as an argument (`yui_shell_show_error(shell, "<key>")`,
 *              `icon_button(..., "<key>")`), at the positions its table
 *              names: I18N_KEY_FUNCTIONS, src/i18n_key_functions.js. A
 *              position may hold DOM as well, which is no key: an array
 *              (a createElement2 spec), createElement2(), createOneHtml()
 *              or html_markup() of gobj-js, text_node() of gobj-ui,
 *              document.createElement() and the like -- known by where
 *              they come from, never by the name of a variable;
 *            - the keys a module PUBLISHES as data: an exported
 *              `<NAME>_I18N_KEYS` array of string literals (the keys it
 *              hands to t() as variables, yui_dev.js's 51). Read as data
 *              -- `export const`, `let` or `var`, `export {X}`, wrapped in
 *              Object.freeze(), spreading another array of the module read
 *              the same way (`[...BASE_I18N_KEYS, "k"]`: a top-level const,
 *              or a list it publishes) --; anything so named that cannot be
 *              read so is a violation, never skipped (a list not exported,
 *              declared in a function, by destructuring, or exported under
 *              another name; an element that is a variable, a call, a spread
 *              of an import or of a `let`).
 *
 *          A string is read where it is written, and FOLLOWED where the
 *          source writes it out: a literal, a template with no `${}`,
 *          every branch of `?:`, `||` and `??`, the right one of `&&`; a
 *          `const` to its value (`const KEY = "save"; t(KEY)` asks for
 *          "save"); a property of a const object literal (`DEFAULTS.ok`;
 *          every value of it for `NOTES[verdict]`); the element of a const
 *          array literal its `.map()`, `.forEach()`, ... callback or a
 *          for...of iterates, and what a destructuring reads from it;
 *          `String(x)`, and a template that is only `${x}`, as x; the
 *          default of a parameter; a call of a function of the same module
 *          whose every `return` is one of these (`t(pick())`, `pick`
 *          returning "a" or "b", asks for both). A key built by
 *          concatenation, held in a `let`, or arriving as data cannot be
 *          known: its module publishes it in a `<NAME>_I18N_KEYS` list.
 *
 *          A MARKER at the place a key is read says where the keys of what
 *          follows it come from: `/\* i18n: <NAME>_I18N_KEYS *\/` (that
 *          published list; several by commas) or `/\* i18n: data *\/` (data,
 *          no key a list can hold). This script checks the markers it
 *          reads: each one must be a marker and stand before a place a key
 *          is read, the lists it names must be published by a module the
 *          app mounts (the app's own included), and the keys it marks that
 *          can be read must be in them. A `data` marker on what the reader
 *          follows to keys and nothing else -- a literal, a const that is
 *          one, a `?:` branch that is one, a call of a function of the
 *          module that returns literals -- is a violation: it claims data
 *          where the reader reads a key. A marked `let` / `var` is READ,
 *          and so is one a marked member or element is read from (`LABELS[k]`,
 *          `picked = LIST[0]`, the `x` of `LIST.forEach((x) => ...)`):
 *          everything it is given in its scope (its value, every `=` to
 *          it; for a member, also what is written into it: `x.a = v`,
 *          `x.push(v)`, Object.assign()) is followed, each literal is a key
 *          asked for and must be in the lists named, and one given nothing
 *          but literals is a violation: it is a const.
 *
 *          THE RULE PER CALL holds the app's own code, as a test holds the
 *          library (i18n_key_functions.test.js): every value a key position
 *          of a key function can take is a literal (a branch of them,
 *          nothing, DOM), a const the reader follows to one, a `let` that
 *          is only ever given DOM, or MARKED where it is handed. Anything
 *          else -- a `let` given literals, an options variable, a
 *          concatenation, a parameter of a wrapper of the app's own -- is a
 *          violation, with the file and the line. So is a TRANSLATED text
 *          handed there, `t("k")`, even marked: the function translates it
 *          again and marks it data-i18n with the translation, so it never
 *          changes language; hand it the key. A function of the app is in
 *          no table, so what a wrapper of its own hands on is marked where
 *          it hands it -- and what its callers give it is read only if the
 *          module publishes it.
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
 *          t() the scan can read. A name declared that no source uses is a
 *          violation (a typo would turn its check off).
 *
 *          A locale is a file <code>.js of the locales directory (en.js,
 *          es.js, pt-br.js; flags.js and locales.js are not) exporting
 *          `{<code>}` with a `translation` dict. It is parsed first, and
 *          then IMPORTED, so its top-level code runs -- the app's own code,
 *          but code. It is imported directly, not through locales.js, which
 *          drags in gobj-js and i18next and expects a browser. A file that
 *          LOOKS like a locale -- it holds a `translation` dict, it exports
 *          its own name (es.js exporting `es`), or it has a default export
 *          -- and fails to load, or that cannot even be parsed, is a
 *          violation: skipping it would validate one language less and say
 *          OK. Any other file with a locale's name (app.js, a helper
 *          needing a browser) is said and skipped.
 *
 *          Exits 1 on any violation, so the build fails loudly.
 *
 *          Needs `acorn`, a dependency of gobj-ui since 7.26.29: it is
 *          installed with the package, and an app need not declare it.
 *
 *          Its readers are exported: an app whose catalog has another shape
 *          (gobj-ui's own test-app, English as the source) loads the catalog
 *          itself and reuses collect_used_keys() for everything else.
 *
 *          Up to gobj-ui 7.26.24 every app carried its own copy, and the
 *          copies drifted into three families with different rules
 *          (REV-CLOUD V17.3.4). This one is their union, and an app keeps
 *          no copy.
 *
 *          Copyright (c) 2025-2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {readdirSync, readFileSync, existsSync, statSync, realpathSync} from "fs";
import {resolve, relative} from "path";
import {pathToFileURL, fileURLToPath} from "url";
import {I18N_KEY_FUNCTIONS} from "../src/i18n_key_functions.js";

const ASCII_RE = /^[\x20-\x7e]+$/;
const LOCALE_FILE_RE = /^([a-z]{2,3}(?:[-_][a-zA-Z]{2,4})?)\.js$/;
const PLURAL_RE = /^(.+?)(_ordinal)?_(zero|one|two|few|many|other)$/;
const PUBLISHED_LIST_RE = /_I18N_KEYS$/i;
const DATA_I18N_ATTR_RE = /^data-i18n(?:-title|-aria-label|-placeholder)?$/;
const DATA_I18N_MARKUP_RE = /data-i18n(?:-title|-aria-label|-placeholder)?=["']([^"']+)["']/g;

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
 *  The violations reported so far (by fail())
 ***************************************************************/
function violation_count()
{
    return errors;
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

/*
 *  The parser: a dependency of this package, resolved from this script up
 *  (the package's own node_modules, or the app's where npm hoists it).
 */
let acorn_parse;
try {
    ({parse: acorn_parse} = await import("acorn"));
} catch(e) {
    abort(`cannot load acorn (${e.message}): it is a dependency of @yuneta/gobj-ui, ` +
          `so the install is incomplete: run npm install`);
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
 *  The names a locale file <code>.js may export its locale under:
 *  pt-br -> pt-br, pt_br, ptBr, ptBR
 ***************************************************************/
function locale_export_names(code)
{
    let camel = code.replace(/[-_]([a-z])/gi, (m, c) => c.toUpperCase());     // pt-br -> ptBr
    let upper = code.replace(/[-_]([a-z]+)/gi, (m, c) => c.toUpperCase());    // pt-br -> ptBR
    return [...new Set([code, code.replace(/-/g, "_"), camel, upper])];
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
    let names = new Set();
    for(let code of codes) {
        let url = new URL(`${code}.js`, locales_dir);
        let export_names = locale_export_names(code);

        /*  Parsed first, never trusted to the import: a syntax error is
         *  a broken file, not "a helper that needs a browser".  */
        let ast;
        try {
            ast = parse_source(readFileSync(url, "utf8"));
        } catch(e) {
            fail(`${code}.js cannot be parsed (${e.message}): its language is NOT validated`);
            continue;
        }
        let looks = looks_like_a_locale(ast, export_names);

        let mod;
        try {
            mod = await import(url.href);
        } catch(e) {
            if(looks) {
                fail(`${code}.js ${looks} and cannot be loaded (${e.message}): ` +
                     `its language is NOT validated`);
            } else {
                /*  A helper that happens to have a locale's name (app.js),
                 *  and needs a browser to load: said and skipped  */
                note(`${code}.js cannot be loaded here (${e.message}): not a locale, skipped`);
            }
            continue;
        }
        let locale = null;
        for(let name of export_names) {
            if(mod[name]) {
                locale = mod[name];
                break;
            }
        }
        locale = locale || mod.default;
        if(!locale || !locale.translation || typeof locale.translation !== "object") {
            if(looks) {
                fail(`${code}.js ${looks} but exports no {${code}} with a translation dict: ` +
                     `its language is NOT validated`);
            } else {
                note(`${code}.js exports no {${code}} with a translation dict: not a locale, skipped`);
            }
            continue;
        }
        locales[code] = locale.translation;
        if(typeof locale.name === "string" && locale.name) {
            names.add(locale.name);     // its endonym: a literal of a language menu
        }
    }
    if(Object.keys(locales).length === 0) {
        abort(`no locale (<code>.js exporting {<code>: {translation}}) in ${locales_dir.pathname}`);
    }
    return {locales, names};
}

/***************************************************************
 *  Does a parsed file look like a locale? It does when it holds an
 *  object literal with a `translation` dict, when it exports one of
 *  the names of its locale (es.js exporting `es`), or when it has a
 *  default export. Returns what it saw (for the message), or "".
 ***************************************************************/
function looks_like_a_locale(ast, export_names)
{
    let saw = "";
    for(let node of ast.body) {
        if(node.type === "ExportDefaultDeclaration") {
            return "has a default export";
        }
        if(node.type !== "ExportNamedDeclaration") {
            continue;
        }
        let exported = [];
        if(node.declaration && node.declaration.type === "VariableDeclaration") {
            for(let d of node.declaration.declarations) {
                exported.push(...pattern_names(d.id));
            }
        } else if(node.declaration && node.declaration.id) {
            exported.push(node.declaration.id.name);
        }
        for(let spec of node.specifiers || []) {
            exported.push(spec.exported.name || spec.exported.value);
        }
        let own = exported.find((name) => export_names.includes(name));
        if(own) {
            return `exports ${own}`;
        }
        if(exported.includes("default")) {
            return "has a default export";
        }
    }
    walk(ast, (n, ancestors) => {
        if(!saw && n.type === "Property" && prop_name(n) === "translation"
                && n.value.type === "ObjectExpression"
                && ancestors[ancestors.length - 1].type === "ObjectExpression") {
            saw = "holds a translation dict";
        }
    });
    return saw;
}

/***************************************************************
 *  The plural categories of a language (Intl.PluralRules)
 ***************************************************************/
function plural_categories(code, ordinal)
{
    try {
        return new Set(new Intl.PluralRules(code.replace(/_/g, "-"),
            {type: ordinal? "ordinal" : "cardinal"}).resolvedOptions().pluralCategories);
    } catch(e) {
        return new Set(["one", "other"]);
    }
}

/***************************************************************
 *  A locale's keys split: plain ones, and {group: Set(categories)}, a
 *  group being a base, or "<base>#ordinal" for `<base>_ordinal_<cat>`
 ***************************************************************/
function split_plurals(keys, plural_groups)
{
    let plain = new Set();
    let plurals = new Map();
    for(let k of keys) {
        let m = k.match(PLURAL_RE);
        let group = m? m[1] + (m[2]? "#ordinal" : "") : null;
        if(m && plural_groups.has(group)) {
            if(!plurals.has(group)) {
                plurals.set(group, new Set());
            }
            plurals.get(group).add(m[3]);
        } else {
            plain.add(k);
        }
    }
    return {plain, plurals};
}

/***************************************************************
 *  Which `<x>_<category>` keys ARE plurals: a key that only ends like one
 *  (`pick_one`; `step_one` / `step_two` / `step_three`, an enumeration)
 *  is a key. A cardinal group is a plural when some locale has its bare
 *  base or its `_other` form -- every language has `other`, so a real
 *  plural always carries one of the two. An ordinal says it with its
 *  `_ordinal_` infix.
 ***************************************************************/
function find_plural_groups(locales)
{
    let forms = new Map();      // group -> Set of categories, in any locale
    let bare = new Set();
    for(let translation of Object.values(locales)) {
        for(let k of Object.keys(translation)) {
            bare.add(k);
            let m = k.match(PLURAL_RE);
            if(m) {
                let group = m[1] + (m[2]? "#ordinal" : "");
                if(!forms.has(group)) {
                    forms.set(group, new Set());
                }
                forms.get(group).add(m[3]);
            }
        }
    }
    let groups = new Set();
    for(let [group, cats] of forms) {
        if(group.endsWith("#ordinal") || bare.has(group) || cats.has("other")) {
            groups.add(group);
        }
    }
    return groups;
}

/***************************************************************
 *
 ***************************************************************/
async function main()
{
    let opts = parse_args(process.argv.slice(2));
    let {locales, names} = await load_locales(opts.locales);
    opts.language_names = names;
    let codes = Object.keys(locales);

    /*  Per-locale key checks (ASCII + lower-case)  */
    let plural_groups = find_plural_groups(locales);
    let split = {};
    for(let code of codes) {
        let keys = Object.keys(locales[code]);
        split[code] = split_plurals(keys, plural_groups);
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
    let bases = new Set();      // the plain base of each plural group
    for(let group of plural_groups) {
        bases.add(group.replace(/#ordinal$/, ""));
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
        for(let group of plural_groups) {
            let ordinal = group.endsWith("#ordinal");
            let base = group.replace(/#ordinal$/, "");
            let wanted = plural_categories(code, ordinal);
            let have = split[code].plurals.get(group) || new Set();
            let has_base = split[code].plain.has(base);
            for(let c of wanted) {
                if(!have.has(c) && !(has_base && SERVED_BY_THE_BASE.has(c))) {
                    fail(`[${code}] ${ordinal? "ordinal" : "plural"} ${JSON.stringify(base)} lacks the form "${c}" of its language` +
                        (SERVED_BY_THE_BASE.has(c)? ` (or the key ${JSON.stringify(base)} itself)` : ""));
                }
            }
            for(let c of have) {
                if(!wanted.has(c) && c !== "zero") {
                    fail(`[${code}] ${ordinal? "ordinal" : "plural"} ${JSON.stringify(base)} has a form "${c}" its language never uses`);
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

    /*
     *  A FORM asked for by its own name (`t("pick_one")`, a bare `pick`
     *  beside it) is defined when a locale carries that form.
     */
    let is_defined_form = (k) => {
        let m = k.match(PLURAL_RE);
        if(!m) {
            return false;
        }
        let group = m[1] + (m[2]? "#ordinal" : "");
        if(!plural_groups.has(group)) {
            return false;
        }
        return codes.some((code) => (split[code].plurals.get(group) || new Set()).has(m[3]));
    };

    /*  Every key the source asks for exists: a missing one is a violation, not a fallback  */
    let {keys: used} = collect_used_keys(opts);
    for(let k of used) {
        if(!ref_plain.has(k) && !bases.has(k) && !is_defined_form(k)) {
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


                    /***************************
                     *      The parsed source
                     ***************************/


/***************************************************************
 *  A source file as an ESTree (acorn). Throws on a syntax error.
 *  Its comments (the i18n markers live there) and its text ride
 *  along as `ast.comments` and `ast.code`, not enumerable, so
 *  walk() never visits them.
 ***************************************************************/
function parse_source(code)
{
    let comments = [];
    let ast = acorn_parse(code, {
        ecmaVersion: "latest",
        sourceType: "module",
        allowHashBang: true,
        onComment: comments
    });
    Object.defineProperty(ast, "comments", {value: comments, enumerable: false});
    Object.defineProperty(ast, "code", {value: code, enumerable: false});
    return ast;
}

/***************************************************************
 *  Visit every node, with the chain of its ancestors (the last one
 *  is its parent). The chain is the walker's own: copy it to keep it.
 ***************************************************************/
function walk(node, visit, ancestors = [])
{
    visit(node, ancestors);
    ancestors.push(node);
    for(let key of Object.keys(node)) {
        if(key === "type" || key === "start" || key === "end" || key === "loc") {
            continue;
        }
        let v = node[key];
        if(Array.isArray(v)) {
            for(let c of v) {
                if(c && typeof c.type === "string") {
                    walk(c, visit, ancestors);
                }
            }
        } else if(v && typeof v.type === "string") {
            walk(v, visit, ancestors);
        }
    }
    ancestors.pop();
}

/***************************************************************
 *  The line of a position of a parsed file
 ***************************************************************/
function line_of(ast, pos)
{
    return ast.code.slice(0, pos).split("\n").length;
}

/***************************************************************
 *  The name of a property (`a:`, `"a-b":`, `["a"]:`), null when it is
 *  computed from a value
 ***************************************************************/
function prop_name(p)
{
    if(!p.computed && p.key.type === "Identifier") {
        return p.key.name;
    }
    if(p.key.type === "Literal") {
        return String(p.key.value);
    }
    return null;
}

/***************************************************************
 *  The name a call is made by: `f(...)` and `x.f(...)` are both `f`
 ***************************************************************/
function callee_name(callee)
{
    if(callee.type === "Identifier") {
        return callee.name;
    }
    if(callee.type === "MemberExpression" && !callee.computed && callee.property.type === "Identifier") {
        return callee.property.name;
    }
    return null;
}

function is_string_literal(n, re)
{
    return !!n && n.type === "Literal" && typeof n.value === "string" && (!re || re.test(n.value));
}

/***************************************************************
 *  `Object.<name>(...)`?
 ***************************************************************/
function is_object_call(n, name)
{
    return n.type === "CallExpression" && n.callee.type === "MemberExpression"
        && !n.callee.computed && n.callee.object.type === "Identifier"
        && n.callee.object.name === "Object" && n.callee.property.name === name;
}


                    /***************************
                     *      Scopes
                     ***************************/


const FUNCTION_RE = /^(FunctionDeclaration|FunctionExpression|ArrowFunctionExpression)$/;

/*  The array methods whose callback receives each ELEMENT first  */
const ITERATION_METHODS = new Set([
    "map", "flatMap", "forEach", "filter", "find", "findLast", "some", "every"
]);

/***************************************************************
 *  The names a binding pattern declares
 ***************************************************************/
function pattern_names(p, out = [])
{
    if(!p) {
        return out;
    }
    switch(p.type) {
        case "Identifier":
            out.push(p.name);
            break;
        case "AssignmentPattern":
            pattern_names(p.left, out);
            break;
        case "RestElement":
            pattern_names(p.argument, out);
            break;
        case "ArrayPattern":
            for(let e of p.elements) {
                pattern_names(e, out);
            }
            break;
        case "ObjectPattern":
            for(let q of p.properties) {
                pattern_names(q.type === "RestElement"? q : q.value, out);
            }
            break;
        default:
            break;
    }
    return out;
}

/***************************************************************
 *  The `var`s a function body declares, hoisted to it (not those
 *  of a function nested in it), and its own name for a function
 *  expression: the names it binds besides its parameters, each
 *  with the declarators of a `var` (null when it is not a plain
 *  `var <name>`). Cached: a module asks for them once per name it
 *  reads.
 *
 *      -> Map(name -> [VariableDeclarator] | null)
 ***************************************************************/
const FN_NAMES = new WeakMap();

function function_scope_names(fn)
{
    if(FN_NAMES.has(fn)) {
        return FN_NAMES.get(fn);
    }
    let names = new Map();
    if(fn.type === "FunctionExpression" && fn.id) {
        names.set(fn.id.name, null);
    }
    let visit = (n) => {
        if(!n || typeof n.type !== "string" || FUNCTION_RE.test(n.type)) {
            return;
        }
        if(n.type === "VariableDeclaration" && n.kind === "var") {
            for(let d of n.declarations) {
                for(let name of pattern_names(d.id)) {
                    let plain = (d.id.type === "Identifier");
                    let had = names.has(name)? names.get(name) : [];
                    names.set(name, (plain && had)? [...had, d] : null);
                }
            }
        }
        for(let key of Object.keys(n)) {
            let v = n[key];
            if(Array.isArray(v)) {
                for(let c of v) {
                    visit(c);
                }
            } else if(v && typeof v.type === "string") {
                visit(v);
            }
        }
    };
    if(fn.body && fn.body.type === "BlockStatement") {
        for(let s of fn.body.body) {
            visit(s);
        }
    }
    FN_NAMES.set(fn, names);
    return names;
}

/***************************************************************
 *  The name a function is known by: its own, or that of the variable
 *  or the property it is assigned to
 ***************************************************************/
function function_name(fn, parent)
{
    if(fn.id) {
        return fn.id.name;
    }
    if(parent && parent.type === "VariableDeclarator" && parent.id.type === "Identifier") {
        return parent.id.name;
    }
    if(parent && (parent.type === "Property" || parent.type === "MethodDefinition")) {
        return prop_name(parent);
    }
    return null;
}

/***************************************************************
 *  The names a node that is not a function binds for what is inside
 *  it: name -> {kind: "const", init} | {kind: "each", of} |
 *  {kind: "var", declarators} (a plain `let <name>`; a `var` belongs
 *  to its function, or here to the module) | {kind: "other"}.
 *  Cached, like function_scope_names().
 ***************************************************************/
const SCOPE_NAMES = new WeakMap();

function scope_names(a)
{
    if(SCOPE_NAMES.has(a)) {
        return SCOPE_NAMES.get(a);
    }
    let names = new Map();
    let declare = (name, what) => {
        let had = names.get(name);
        if(!had) {
            names.set(name, what);
        } else if(had.kind === "var" && what.kind === "var") {
            /*  `var x = 1; ... var x = 2;`: one binding, two values  */
            names.set(name, {kind: "var", decl: "var", declarators: [...had.declarators, ...what.declarators]});
        }
    };
    let statements = [];
    switch(a.type) {
        case "Program":
        case "BlockStatement":
        case "StaticBlock":
            statements = a.body;
            break;
        case "SwitchStatement":
            statements = a.cases.flatMap((c) => c.consequent);
            break;
        case "ForStatement":
            statements = (a.init && a.init.type === "VariableDeclaration")? [a.init] : [];
            break;
        case "ForOfStatement":
        case "ForInStatement":
            if(a.left.type === "VariableDeclaration") {
                for(let d of a.left.declarations) {
                    for(let name of pattern_names(d.id)) {
                        let at = (a.type === "ForOfStatement")? param_path(d.id, name) : null;
                        declare(name, at? {kind: "each", of: a.right, steps: at.steps} : {kind: "other"});
                    }
                }
            }
            break;
        case "CatchClause":
            for(let name of pattern_names(a.param)) {
                declare(name, {kind: "other"});
            }
            break;
        case "ClassExpression":
            if(a.id) {
                declare(a.id.name, {kind: "other"});
            }
            break;
        default:
            break;
    }
    for(let s of statements) {
        let d = (s.type === "ExportNamedDeclaration" || s.type === "ExportDefaultDeclaration")?
            s.declaration : s;
        if(!d) {
            continue;
        }
        if(d.type === "VariableDeclaration") {
            if(d.kind === "var" && a.type !== "Program") {
                continue;       // hoisted: function_scope_names() holds it
            }
            for(let v of d.declarations) {
                let plain = (v.id.type === "Identifier");
                let what = {kind: "other"};
                if(plain && d.kind === "const" && v.init) {
                    what = {kind: "const", init: v.init};
                } else if(plain && d.kind !== "const") {
                    what = {kind: "var", decl: d.kind, declarators: [v]};
                }
                for(let name of pattern_names(v.id)) {
                    declare(name, what);
                }
            }
        } else if(d.type === "FunctionDeclaration" && d.id) {
            declare(d.id.name, {kind: "function", fn: d});
        } else if(d.type === "ClassDeclaration" && d.id) {
            declare(d.id.name, {kind: "other"});
        } else if(d.type === "ImportDeclaration") {
            for(let sp of d.specifiers) {
                let imported = (sp.type === "ImportSpecifier")? (sp.imported.name || sp.imported.value)
                    : (sp.type === "ImportDefaultSpecifier")? "default" : "*";
                declare(sp.local.name, {kind: "import", source: d.source.value, imported});
            }
        }
    }
    SCOPE_NAMES.set(a, names);
    return names;
}

/***************************************************************
 *  Where a binding pattern puts `name`, when properties alone reach
 *  it: {steps, path, default}. `steps` are the properties read from
 *  the value bound to reach it (none for a plain name; member_step()
 *  form), `path` the same as text (".opts.title"), `default` the
 *  value written for it when there is none. null when an array
 *  pattern, a rest element or a computed key stands on the way.
 *
 *      function f(msg = "fallback")        msg: {path: "", default: "fallback"}
 *      function f({title, opts: {label}})  title: ".title", label: ".opts.label"
 ***************************************************************/
function param_path(p, name, steps = [], dflt = null)
{
    if(!p) {
        return null;
    }
    switch(p.type) {
        case "Identifier":
            if(p.name !== name) {
                return null;
            }
            return {steps, path: steps.map((s) => "." + s.prop).join(""), default: dflt};
        case "AssignmentPattern":
            return param_path(p.left, name, steps, p.right);
        case "ObjectPattern":
            for(let q of p.properties) {
                let key = (q.type === "RestElement")? null : prop_name(q);
                let target = (q.type === "RestElement")? q : q.value;
                if(key === null) {
                    if(pattern_names(target).includes(name)) {
                        return null;
                    }
                    continue;
                }
                let r = param_path(target, name, [...steps, {prop: key, computed: false}], null);
                if(r) {
                    return r;
                }
            }
            return null;
        default:
            return null;
    }
}

/***************************************************************
 *  What a name used in `scope` (the chain of ancestors of the use,
 *  outermost first) is bound to:
 *
 *      {kind: "const", init, scope}    a `const` with a value; `scope`
 *                                      is the chain down to the block
 *                                      that declares it, where its
 *                                      value is read
 *      {kind: "each", of, steps, scope}
 *                                      an ELEMENT of `of`: the first
 *                                      parameter of a callback of
 *                                      `of.map()`, `.forEach()`, ...,
 *                                      or the variable of a for...of;
 *                                      `steps`, the properties read
 *                                      from it by a destructuring
 *      {kind: "param", fn, name, index, path, default, scope}
 *                                      parameter `index` of the
 *                                      function `fn`, called `name`;
 *                                      `path` what a destructuring
 *                                      reads from it ("" or
 *                                      ".title"), `default` the
 *                                      value written for it when the
 *                                      caller gives none
 *      {kind: "var", decl, name, declarators, scope}
 *                                      a plain `let` or `var` (`decl`
 *                                      says which): what it
 *                                      holds is never followed, except
 *                                      where a marker says what it
 *                                      holds (var_leaves()); `scope`
 *                                      is the chain down to the node
 *                                      that declares it
 *      {kind: "function", fn, scope}   a function declaration
 *      {kind: "import", source, imported}
 *                                      an import: from module
 *                                      `source`, its name there
 *                                      (or "default", "*")
 *      {kind: "other"}                 anything else: a class, a
 *                                      name an array pattern or a
 *                                      rest element declares
 *      null                            declared nowhere: a global
 ***************************************************************/
function binding_of(name, scope)
{
    for(let i = scope.length - 1; i >= 0; i--) {
        let a = scope[i];
        if(FUNCTION_RE.test(a.type)) {
            let parent = scope[i - 1];
            for(let j = 0; j < a.params.length; j++) {
                if(!pattern_names(a.params[j]).includes(name)) {
                    continue;
                }
                let at = param_path(a.params[j], name);
                if(!at) {
                    return {kind: "other"};
                }
                if(j === 0 && parent && parent.type === "CallExpression" && parent.arguments[0] === a
                        && parent.callee.type === "MemberExpression" && !parent.callee.computed
                        && ITERATION_METHODS.has(parent.callee.property.name)) {
                    return {kind: "each", of: parent.callee.object, steps: at.steps,
                            scope: scope.slice(0, i - 1)};
                }
                return {kind: "param", fn: a, name: function_name(a, parent), index: j,
                        path: at.path, default: at.default, scope: scope.slice(0, i + 1)};
            }
            let hoisted = function_scope_names(a);
            if(hoisted.has(name)) {
                let declarators = hoisted.get(name);
                return declarators? {kind: "var", decl: "var", name, declarators, scope: scope.slice(0, i + 1)}
                                  : {kind: "other"};
            }
            continue;
        }
        let d = scope_names(a).get(name);
        if(!d) {
            continue;
        }
        if(d.kind === "const") {
            return {kind: "const", init: d.init, scope: scope.slice(0, i + 1)};
        }
        if(d.kind === "each") {
            return {kind: "each", of: d.of, steps: d.steps || [], scope: scope.slice(0, i)};
        }
        if(d.kind === "var") {
            return {kind: "var", decl: d.decl, name, declarators: d.declarators, scope: scope.slice(0, i + 1)};
        }
        if(d.kind === "function") {
            return {kind: "function", fn: d.fn, scope: scope.slice(0, i + 1)};
        }
        return d;
    }
    return null;
}


                    /***************************
                     *      What a value can be
                     ***************************/


/*  How far a chain of consts is followed: a cycle stops here  */
const MAX_DEPTH = 24;

/***************************************************************
 *  The values an expression can take, as far as the source writes
 *  them out. Each is one of
 *
 *      {kind: "value", node}           an expression it cannot follow
 *                                      further: a literal, an object
 *                                      or array literal, a call
 *      {kind: "nothing", node}         `undefined`, or the property of
 *                                      an object that has none
 *      {kind: "param", node, binding, path}
 *                                      a parameter of the enclosing
 *                                      function, `path` what is read
 *                                      from it (".title", "[].label",
 *                                      a destructuring included)
 *      {kind: "unknown", node}         a `let`, a `var` (with its
 *                                      `binding`), an import, a
 *                                      property of something unknown
 *
 *  with `scope` (the ancestors of `node`, to read it further) and
 *  `via`, the nodes of the place it is READ that it went through,
 *  outermost first: where a marker may stand (markers_of()). An
 *  unknown read from a plain `let` / `var` -- the variable itself, a
 *  property of it, an element of it -- carries `var_root`: {binding,
 *  steps}, the variable and the steps from it to what is read
 *  (extend_root()), so a marker standing there can have it followed
 *  (var_leaves()). What it follows:
 *
 *    - every branch of `?:`, of `||` and `??`, the right one of `&&`
 *      (the left one is a condition: when it is the value, it is
 *      falsy, not a key);
 *    - a `const`, to its value, read in the scope that declares it;
 *    - a property of an object literal it reached (`DEFAULTS.ok`; for
 *      a computed one, `NOTES[verdict]`, every value it holds), and an
 *      element of an array literal (`LIST[i]`);
 *    - an ELEMENT of an array literal it reached: the parameter of a
 *      `.map()`, `.forEach()`, ... callback over it, the variable of a
 *      for...of over it (and what a destructuring there reads from
 *      it: `for(const {key} of ROWS)`);
 *    - the default of a parameter (`function f(msg = "fallback")`),
 *      besides the parameter itself;
 *    - a call of a function of the same module whose every return is
 *      known (local_call_values());
 *    - Object.freeze(), String(x) and `${x}` (a template that is only
 *      that), which change nothing it reads.
 *
 *  ctx: {scope, via, off}. `off` is set once it left the place it is
 *  read for the declaration of a const: `via` stops growing there.
 ***************************************************************/
function expand(node, ctx, depth = 0)
{
    if(!node) {
        return [];
    }
    let via = ctx.off? ctx.via : [...ctx.via, node];
    let here = {scope: ctx.scope, via: via, off: ctx.off};
    let item = (kind, extra) => Object.assign({kind, node, scope: ctx.scope, via, off: ctx.off}, extra);
    if(depth > MAX_DEPTH) {
        return [item("unknown")];
    }

    switch(node.type) {
        case "ConditionalExpression":
            return [...expand(node.consequent, here, depth + 1),
                    ...expand(node.alternate, here, depth + 1)];

        case "LogicalExpression":
            return [...(node.operator !== "&&"? expand(node.left, here, depth + 1) : []),
                    ...expand(node.right, here, depth + 1)];

        case "Identifier": {
            if(node.name === "undefined") {
                return [item("nothing")];
            }
            let b = binding_of(node.name, ctx.scope);
            if(!b) {
                return [item("unknown")];
            }
            if(b.kind === "const") {
                return expand(b.init, {scope: b.scope, via: via, off: true}, depth + 1);
            }
            if(b.kind === "each") {
                let out = elements_of(b.of, {scope: b.scope, via: via, off: true}, depth + 1);
                for(let step of b.steps) {
                    out = out.flatMap((o) => step_values(o, step, node, depth + 1));
                }
                return out;
            }
            if(b.kind === "param") {
                let out = [item("param", {binding: b, path: b.path})];
                if(b.default) {
                    out.push(...expand(b.default, {scope: b.scope, via: via, off: true}, depth + 1));
                }
                return out;
            }
            if(b.kind === "var") {
                return [item("unknown", {binding: b, var_root: {binding: b, steps: []}})];
            }
            return [item("unknown")];
        }

        case "MemberExpression": {
            let step = member_step(node);
            let out = [];
            for(let o of expand(node.object, here, depth + 1)) {
                out.push(...step_values(o, step, node, depth + 1));
            }
            return out;
        }

        case "CallExpression":
            if(is_object_call(node, "freeze") && node.arguments.length === 1) {
                return expand(node.arguments[0], here, depth + 1);
            }
            if(node.callee.type === "Identifier" && node.callee.name === "String"
                    && node.arguments.length === 1 && binding_of("String", ctx.scope) === null) {
                return expand(node.arguments[0], here, depth + 1);
            }
            return local_call_values(node, ctx, via, depth) || [item("value")];

        case "TemplateLiteral":
            /*  `${x}` and nothing else: x as a string  */
            if(node.expressions.length === 1 && node.quasis.every((q) => q.value.cooked === "")) {
                return expand(node.expressions[0], here, depth + 1);
            }
            return [item("value")];

        default:
            return [item("value")];
    }
}

/*  The leaves the reader KNOWS: no key hides behind them  */
const KNOWN = new Set(["key", "nothing", "dom"]);

/***************************************************************
 *  What a call of a function of the same module returns, when every
 *  value it returns is known (classify(): a key, nothing, DOM): the
 *  call is read as those values -- `t(pick())`, `pick` returning
 *  "a" or "b", asks for both. null otherwise (a return the reader
 *  cannot follow, a parameter of the callee, none at all): the call
 *  stays a value it cannot follow. Only a plain call of a name bound
 *  to a function declaration or to a const function; not an async
 *  function, not a generator.
 ***************************************************************/
function local_call_values(call, ctx, via, depth)
{
    if(call.callee.type !== "Identifier") {
        return null;
    }
    let b = binding_of(call.callee.name, ctx.scope);
    let fn = null;
    if(b && b.kind === "function") {
        fn = b.fn;
    } else if(b && b.kind === "const" && FUNCTION_RE.test(b.init.type)) {
        fn = b.init;
    }
    if(!fn || fn.async || fn.generator) {
        return null;
    }
    let out = [];
    for(let r of returned_values(fn)) {
        out.push(...expand(r.node, {scope: [...b.scope, fn, ...r.path], via: via, off: true}, depth + 1));
    }
    if(out.length === 0 || !out.every((v) => KNOWN.has(classify(v).kind))) {
        return null;
    }
    return out;
}

/***************************************************************
 *  The step a member expression takes from its object:
 *
 *      {prop: name, computed}      a property: `x.label`, `x["a"]`,
 *                                  `x[0]` (`computed` for brackets:
 *                                  on an array, an index reads an
 *                                  element)
 *      {prop: null, computed}      any property: `x[k]`
 *      {each: true}                an element: what a `.map()` /
 *                                  `.forEach()` callback, a for...of
 *                                  or a `[]` key position reads
 ***************************************************************/
function member_step(node)
{
    let name = null;
    if(!node.computed && node.property.type === "Identifier") {
        name = node.property.name;
    } else if(node.computed && node.property.type === "Literal") {
        name = String(node.property.value);
    }
    return {prop: name, computed: !!node.computed};
}

/***************************************************************
 *  The var_root of what is read one step further from something read
 *  from a `let` / `var` (null when it was not)
 ***************************************************************/
function extend_root(root, step)
{
    return root? {binding: root.binding, steps: [...root.steps, step]} : null;
}

/***************************************************************
 *  The values one step (member_step()) reads from a value of expand():
 *  a property, or an element. `node` is the node that reads it (null:
 *  the value's own)
 ***************************************************************/
function step_values(o, step, node, depth)
{
    let at = node || o.node;
    if(step.each) {
        return element_values(o, depth);
    }
    if(o.kind === "param") {
        return [step.prop !== null? Object.assign({}, o, {path: o.path + "." + step.prop, node: at}) :
            Object.assign({}, o, {kind: "unknown", binding: null, var_root: null, node: at})];
    }
    if(o.kind === "value" && o.node.type === "ObjectExpression") {
        return property_values(o, step.prop, depth + 1);
    }
    if(o.kind === "value" && o.node.type === "ArrayExpression" && step.computed) {
        return element_values(o, depth + 1);
    }
    if(o.kind === "nothing" || (o.kind === "value" && o.node.type === "Literal")) {
        return [Object.assign({}, o, {kind: "nothing", node: at})];
    }
    return [Object.assign({}, o, {kind: "unknown", binding: null, node: at,
                                  var_root: extend_root(o.var_root, step)})];
}

/***************************************************************
 *  The values of property `name` of an object literal (`name` null:
 *  of every property), each followed with expand()
 ***************************************************************/
function property_values(o, name, depth)
{
    let out = [];
    let scope = [...o.scope, o.node];
    let found = false;
    for(let p of o.node.properties) {
        if(p.type === "SpreadElement") {
            for(let s of expand(p.argument, {scope, via: o.via, off: true}, depth + 1)) {
                if(s.kind === "value" && s.node.type === "ObjectExpression") {
                    let r = property_values(s, name, depth + 1).filter((x) => x.kind !== "nothing");
                    found = found || r.length > 0;
                    out.push(...r);
                } else if(s.kind !== "nothing") {
                    found = true;
                    out.push(Object.assign({}, s, {kind: "unknown", binding: null,
                        var_root: extend_root(s.var_root, {prop: name, computed: false})}));
                }
            }
            continue;
        }
        let pn = prop_name(p);
        if(pn === null) {
            found = true;
            out.push({kind: "unknown", node: p, scope, via: o.via, off: o.off});
            continue;
        }
        if(name === null || pn === name) {
            found = true;
            let v = (p.kind === "init" && !p.method)? p.value : null;
            if(v) {
                out.push(...expand(v, {scope: [...scope, p], via: o.via, off: o.off}, depth + 1));
            } else {
                out.push({kind: "unknown", node: p, scope, via: o.via, off: o.off});
            }
        }
    }
    if(!found) {
        out.push({kind: "nothing", node: o.node, scope: o.scope, via: o.via, off: o.off});
    }
    return out;
}

/***************************************************************
 *  The elements of whatever `node` is, when it is an array literal
 *  (after expand()): each element followed with expand(). A `.map()`
 *  of one is the values its callback returns, each element bound to
 *  the callback's parameter. Anything else is unknown, or a param.
 ***************************************************************/
function elements_of(node, ctx, depth)
{
    let out = [];
    for(let v of expand(node, ctx, depth + 1)) {
        out.push(...element_values(v, depth));
    }
    return out;
}

/***************************************************************
 *  The elements of one value of expand(): see elements_of()
 ***************************************************************/
function element_values(v, depth)
{
    let out = [];
    if(v.kind === "param") {
        out.push(Object.assign({}, v, {path: v.path + "[]"}));
    } else if(v.kind === "nothing" || (v.kind === "value" && v.node.type === "Literal")) {
        return out;
    } else if(v.kind === "value" && v.node.type === "ArrayExpression") {
        let scope = [...v.scope, v.node];
        for(let el of v.node.elements) {
            if(!el) {
                continue;
            }
            if(el.type === "SpreadElement") {
                out.push(...elements_of(el.argument, {scope, via: v.via, off: v.off}, depth + 1));
                continue;
            }
            out.push(...expand(el, {scope, via: v.via, off: v.off}, depth + 1));
        }
    } else if(v.kind === "value" && is_mapping(v.node)) {
        let cb = v.node.arguments[0];
        let scope = [...v.scope, v.node, cb];
        for(let r of returned_values(cb)) {
            out.push(...expand(r.node, {scope: [...scope, ...r.path], via: v.via, off: v.off}, depth + 1));
        }
    } else {
        out.push(Object.assign({}, v, {kind: "unknown", binding: null,
                                       var_root: extend_root(v.var_root, {each: true})}));
    }
    return out;
}

/***************************************************************
 *  `<array>.map(callback)` (or flatMap), the callback a function
 *  literal with a plain first parameter?
 ***************************************************************/
function is_mapping(n)
{
    if(n.type !== "CallExpression" || n.callee.type !== "MemberExpression" || n.callee.computed
            || !/^(map|flatMap)$/.test(n.callee.property.name)) {
        return false;
    }
    let cb = n.arguments[0];
    return !!cb && FUNCTION_RE.test(cb.type) && cb.params.length > 0
        && cb.params[0].type === "Identifier";
}

/***************************************************************
 *  What a function returns: its expression body, or the argument of
 *  every `return` of its block (not of a function nested in it), each
 *  with the nodes between the function and it
 ***************************************************************/
function returned_values(fn)
{
    if(fn.body.type !== "BlockStatement") {
        return [{node: fn.body, path: []}];
    }
    let out = [];
    let visit = (n, path) => {
        if(!n || typeof n.type !== "string" || FUNCTION_RE.test(n.type)) {
            return;
        }
        if(n.type === "ReturnStatement") {
            if(n.argument) {
                out.push({node: n.argument, path: [...path, n]});
            }
            return;
        }
        for(let key of Object.keys(n)) {
            let v = n[key];
            if(Array.isArray(v)) {
                for(let c of v) {
                    visit(c, [...path, n]);
                }
            } else if(v && typeof v.type === "string") {
                visit(v, [...path, n]);
            }
        }
    };
    visit(fn.body, []);
    return out;
}

/***************************************************************
 *  The leaves of what an expression can be, each one of
 *
 *      {kind: "key", value}    a non-empty string: a literal, a
 *                              template with no `${}`
 *      {kind: "nothing"}       null, undefined, "", a number, a
 *                              boolean: no key
 *      {kind: "dom"}           DOM, or what builds it (is_dom()): no
 *                              key either -- a key position takes DOM
 *                              as it is, only a string there is a key
 *      {kind: "param", ...}    a parameter (of an enclosing function),
 *                              see expand()
 *      {kind: "unknown"}       anything else: a variable it cannot
 *                              follow, a call, a concatenation, an
 *                              object
 *
 *  each with its `node` and `via`. `scope` is the ancestors of `node`
 *  (outermost first); `root` the node of the place it is read (a call,
 *  a property), where a marker of the whole place stands.
 ***************************************************************/
function leaves_of(node, scope = [], root = null)
{
    let out = [];
    let ctx = {scope, via: root? [root] : [], off: false};
    for(let v of expand(node, ctx)) {
        out.push(classify(v));
    }
    return out;
}

function classify(v)
{
    if(v.kind !== "value") {
        return v;
    }
    let n = v.node;
    if(n.type === "Literal") {
        let kind = (typeof n.value === "string" && n.value)? "key" : "nothing";
        return Object.assign({}, v, {kind, value: n.value});
    }
    if(n.type === "TemplateLiteral" && n.expressions.length === 0) {
        let s = n.quasis[0].value.cooked;
        return Object.assign({}, v, {kind: s? "key" : "nothing", value: s});
    }
    if(is_dom(n, v.scope)) {
        return Object.assign({}, v, {kind: "dom"});
    }
    return Object.assign({}, v, {kind: "unknown"});
}

/*
 *  What BUILDS DOM, known by where it comes from, never by a name the
 *  code chose (`$box` says nothing): the builders of gobj-js and
 *  gobj-ui by the module they are imported from, and the document's.
 */
const DOM_BUILDERS = [
    {name: "createElement2", from: /^@yuneta\/gobj-js$/},
    {name: "createOneHtml",  from: /^@yuneta\/gobj-js$/},
    {name: "html_markup",    from: /^@yuneta\/gobj-js$/},
    {name: "text_node",      from: /^(?:@yuneta\/gobj-ui(?:\/index\.js|\/src\/yui_text\.js)?|\.\/yui_text\.js)$/}
];
const DOCUMENT_BUILDERS = new Set([
    "createElement", "createElementNS", "createTextNode", "createDocumentFragment"
]);

/***************************************************************
 *  Is a value DOM? An array literal (a createElement2 spec), or a
 *  call of a DOM builder: createElement2(), createOneHtml(),
 *  html_markup() imported from gobj-js, text_node() from gobj-ui,
 *  document.createElement() and the like. `scope` is the chain of
 *  ancestors of the node, where its names are resolved.
 ***************************************************************/
function is_dom(n, scope = [])
{
    if(n.type === "ArrayExpression") {
        return true;
    }
    if(n.type !== "CallExpression") {
        return false;
    }
    let c = n.callee;
    if(c.type === "MemberExpression" && !c.computed && c.object.type === "Identifier"
            && c.object.name === "document" && c.property.type === "Identifier"
            && DOCUMENT_BUILDERS.has(c.property.name)) {
        return binding_of("document", scope) === null;     // the global, not a name of the module
    }
    if(c.type !== "Identifier") {
        return false;
    }
    let b = binding_of(c.name, scope);
    return !!b && b.kind === "import"
        && DOM_BUILDERS.some((x) => x.name === b.imported && x.from.test(b.source));
}

/***************************************************************
 *  The strings an expression can be, as far as they are WRITTEN:
 *  the keys of leaves_of(). `complete` says every value it can take
 *  is known (keys, nothing, DOM). `scope` is the chain of ancestors of
 *  `node`: without it, no name is followed.
 ***************************************************************/
function static_keys(node, scope = [])
{
    let keys = [];
    let complete = true;
    for(let leaf of leaves_of(node, scope)) {
        if(leaf.kind === "key") {
            keys.push(leaf.value);
        } else if(!KNOWN.has(leaf.kind)) {
            complete = false;
        }
    }
    return {keys, complete};
}

/***************************************************************
 *  The leaves at a key position of I18N_KEY_FUNCTIONS in one call:
 *  "1", "2.title", "1.actions[].label", "2[].label". `scope` is the
 *  chain of ancestors of the call. Each leaf is one of leaves_of(),
 *  its `via` starting at the call.
 *
 *  A position the call does not reach (an argument not given) has no
 *  leaf: its default applies. An options object held in a variable,
 *  a spread, a parameter: followed like any value.
 ***************************************************************/
function values_at(call, path, scope = [])
{
    let segs = String(path).split(".");
    let first = segs.shift().match(/^(\d+)(\[\])?$/);
    let at_call = {kind: "unknown", node: call, scope, via: [call], off: false};
    if(!first) {
        return [at_call];
    }
    let idx = Number(first[1]);
    let call_scope = [...scope, call];
    for(let i = 0; i <= idx && i < call.arguments.length; i++) {
        if(call.arguments[i].type === "SpreadElement") {
            return [Object.assign({}, at_call, {node: call.arguments[i]})];
        }
    }
    let arg = call.arguments[idx];
    if(!arg) {
        return [];
    }

    let ctx = {scope: call_scope, via: [call], off: false};
    let cur = first[2]? elements_of(arg, ctx, 0) : expand(arg, ctx);
    for(let seg of segs) {
        let m = seg.match(/^([\w$]+)(\[\])?$/);
        if(!m) {
            return [at_call];
        }
        let next = [];
        for(let v of cur) {
            if(v.kind === "param") {
                next.push(Object.assign({}, v, {path: v.path + "." + m[1]}));
            } else if(v.kind === "value" && v.node.type === "ObjectExpression") {
                next.push(...property_values(v, m[1], 0));
            } else if(v.kind === "value" && is_object_call(v.node, "assign")) {
                let assigned = v.node.arguments.flatMap((a) =>
                    expand(a, {scope: [...v.scope, v.node], via: v.via, off: v.off}));
                for(let a of assigned) {
                    if(a.kind === "value" && a.node.type === "ObjectExpression") {
                        next.push(...property_values(a, m[1], 0)
                            .filter((x) => x.kind !== "nothing"));
                    } else if(a.kind === "param") {
                        next.push(Object.assign({}, a, {path: a.path + "." + m[1]}));
                    } else if(a.kind !== "nothing") {
                        next.push(Object.assign({}, a, {kind: "unknown", binding: null,
                            var_root: extend_root(a.var_root, {prop: m[1], computed: false})}));
                    }
                }
            } else if(v.kind === "nothing" || (v.kind === "value" && v.node.type === "Literal")) {
                continue;
            } else {
                next.push(Object.assign({}, v, {kind: "unknown", binding: null,
                    var_root: extend_root(v.var_root, {prop: m[1], computed: false})}));
            }
        }
        if(m[2]) {
            let els = [];
            for(let v of next) {
                if(v.kind === "param") {
                    els.push(Object.assign({}, v, {path: v.path + "[]"}));
                } else if(v.kind === "value") {
                    els.push(...elements_of(v.node, v, 0));
                } else if(v.kind !== "nothing") {
                    els.push(Object.assign({}, v, {var_root: extend_root(v.var_root, {each: true})}));
                }
            }
            next = els;
        }
        cur = next;
    }
    return cur.map(classify);
}

/***************************************************************
 *  The steps from a `let` / `var` to the member a node names, when
 *  the node is the variable itself (no step) or a member of it
 *  (`x.a`, `x[k]`, `x.a.b`): [step] (member_step()), or null when it
 *  is not read from the variable. `is_it(id)` says whether an
 *  identifier is the variable.
 ***************************************************************/
function steps_to(node, is_it)
{
    let steps = [];
    let n = node;
    while(n.type === "MemberExpression") {
        steps.unshift(member_step(n));
        n = n.object;
    }
    return is_it(n)? steps : null;
}

/***************************************************************
 *  Can two steps (member_step()) reach the same value? An element
 *  meets an index (`x[0]`) and any property (`x[k]`); a property
 *  meets the same name, and any property.
 ***************************************************************/
function steps_meet(a, b)
{
    if(a.each || b.each) {
        let other = a.each? b : a;
        return !!other.each || other.prop === null || (other.computed && /^\d+$/.test(other.prop));
    }
    return a.prop === null || b.prop === null || a.prop === b.prop;
}

/***************************************************************
 *  Do two paths of steps meet: is the shorter one a prefix of the
 *  longer one, step by step?
 ***************************************************************/
function paths_meet(a, b)
{
    let n = Math.min(a.length, b.length);
    for(let i = 0; i < n; i++) {
        if(!steps_meet(a[i], b[i])) {
            return false;
        }
    }
    return true;
}

/*  The array methods that write ELEMENTS into an array: the index of
 *  the first argument that is one (fill: only that one)  */
const ELEMENT_WRITERS = new Map([["push", 0], ["unshift", 0], ["splice", 2], ["fill", 0]]);

/***************************************************************
 *  Everything a plain `let` / `var` is GIVEN, in the scope that
 *  declares it: the value of each declarator (one with none holds
 *  nothing), and the right side of every `=` to it (`||=`, `??=`,
 *  `&&=` too: the old value stays possible besides). A write whose
 *  value cannot be read -- `+=`, `++`, a destructuring, a for...in/of
 *  over it -- is listed in `unknown`. A name of another binding
 *  (shadowing) is not a write to it.
 *
 *  With `members` (it holds a table, and what is read is a member of
 *  it), also what is written INTO it: `x.a = v`, `x[k] = v`,
 *  `x.a.b = v` (`steps`: from the variable to the member written),
 *  the elements `x.push(v)`, `x.unshift(v)`, `x.splice(i, n, v)`,
 *  `x.fill(v)` give it (a spread: every element of what is spread),
 *  and `Object.assign(x, v)` (v written over x). A `+=` or `++` on a
 *  member is unknown at that member.
 *
 *      -> {values: [{node, scope, steps, spread, into}], unknown: [{node, steps}]}
 *          `node` null: nothing (a declarator with no value); `into`:
 *          written into the variable, not given to it
 ***************************************************************/
function assigned_values(binding, members = false)
{
    let values = [];
    let unknown = [];
    let first = binding.declarators[0];
    let root = binding.scope[binding.scope.length - 1];
    let is_it = (id, chain) => {
        if(!id || id.type !== "Identifier" || id.name !== binding.name) {
            return false;
        }
        let b = binding_of(id.name, chain);
        return !!b && b.kind === "var" && b.declarators[0] === first;
    };
    walk(root, (n, ancestors) => {
        let chain = [...ancestors, n];
        let into = (node) => (members? steps_to(node, (id) => is_it(id, chain)) : null);
        switch(n.type) {
            case "VariableDeclarator":
                if(binding.declarators.includes(n)) {
                    values.push(n.init? {node: n.init, scope: chain, steps: []} : {node: null, steps: []});
                }
                break;
            case "AssignmentExpression": {
                let readable = /^(=|\|\|=|\?\?=|&&=)$/.test(n.operator);
                if(n.left.type === "Identifier") {
                    if(is_it(n.left, chain)) {
                        if(readable) {
                            values.push({node: n.right, scope: chain, steps: []});
                        } else {
                            unknown.push({node: n, steps: []});
                        }
                    }
                } else if(n.left.type === "MemberExpression") {
                    let steps = into(n.left);
                    if(steps && readable) {
                        values.push({node: n.right, scope: chain, steps, into: true});
                    } else if(steps) {
                        unknown.push({node: n, steps});
                    }
                } else if(pattern_names(n.left).includes(binding.name)
                        && is_it({type: "Identifier", name: binding.name}, chain)) {
                    unknown.push({node: n, steps: []});
                }
                break;
            }
            case "UpdateExpression":
                if(is_it(n.argument, chain)) {
                    unknown.push({node: n, steps: []});
                } else if(n.argument.type === "MemberExpression") {
                    let steps = into(n.argument);
                    if(steps) {
                        unknown.push({node: n, steps});
                    }
                }
                break;
            case "CallExpression": {
                if(!members) {
                    break;
                }
                let c = n.callee;
                if(c.type === "MemberExpression" && !c.computed && c.property.type === "Identifier"
                        && ELEMENT_WRITERS.has(c.property.name)) {
                    let steps = into(c.object);
                    if(!steps) {
                        break;
                    }
                    let from = ELEMENT_WRITERS.get(c.property.name);
                    let to = (c.property.name === "fill")? from + 1 : n.arguments.length;
                    for(let a of n.arguments.slice(from, to)) {
                        let spread = (a.type === "SpreadElement");
                        values.push({node: spread? a.argument : a, scope: chain,
                                     steps: [...steps, {each: true}], spread, into: true});
                    }
                } else if(is_object_call(n, "assign") && n.arguments.length > 0) {
                    let steps = into(n.arguments[0]);
                    if(!steps) {
                        break;
                    }
                    for(let a of n.arguments.slice(1)) {
                        if(a.type === "SpreadElement") {
                            unknown.push({node: a, steps});
                        } else {
                            values.push({node: a, scope: chain, steps, into: true});
                        }
                    }
                }
                break;
            }
            case "ForOfStatement":
            case "ForInStatement":
                if(is_it(n.left, chain)) {
                    unknown.push({node: n, steps: []});
                }
                break;
            default:
                break;
        }
    }, binding.scope.slice(0, -1));
    return {values, unknown};
}

/***************************************************************
 *  The leaves of what is read from a `let` / `var` -- the variable
 *  itself, or a member or an element of it (`root`, a var_root of
 *  expand()): every value it is given (assigned_values()), followed
 *  with expand() and then along the steps of `root`, a `let` met on
 *  the way followed into it.
 *
 *      -> {leaves: [leaf], complete, written, unread: [node], lets: [binding]}
 *
 *  `complete`: every leaf is known (a literal, a const that is one,
 *  nothing, DOM) and every write was read. `written`: some leaf was
 *  written INTO the variable (`x.a = "k"`, `x.push("k")`), which a
 *  const would not carry to the reader. `unread`: the node of each
 *  value it could not read. `lets`: the variables it went through,
 *  the first one first.
 ***************************************************************/
function var_leaves(root, seen = new Set(), depth = 0)
{
    let b = root.binding;
    let steps = root.steps;
    let out = {leaves: [], complete: true, written: false, unread: [], lets: [b]};
    let id = `${b.declarators[0].start}:${JSON.stringify(steps)}`;
    if(seen.has(id)) {
        return out;
    }
    seen.add(id);
    if(depth > MAX_DEPTH) {
        out.complete = false;
        out.unread.push(b.declarators[0]);
        return out;
    }
    let {values, unknown} = assigned_values(b, steps.length > 0);
    for(let u of unknown) {
        if(paths_meet(u.steps, steps)) {
            out.complete = false;
            out.unread.push(u.node);
        }
    }
    for(let v of values) {
        if(!v.node || !paths_meet(v.steps, steps)) {
            continue;
        }
        if(v.steps.length > steps.length) {
            /*  Written below what is read: what is read holds it, a table  */
            out.complete = false;
            out.unread.push(v.node);
            continue;
        }
        if(v.into) {
            out.written = true;
        }
        let ctx = {scope: v.scope, via: [], off: false};
        let cur = v.spread? elements_of(v.node, ctx, 0) : expand(v.node, ctx);
        for(let step of steps.slice(v.steps.length)) {
            cur = cur.flatMap((o) => step_values(o, step, null, 0));
        }
        for(let o of cur) {
            let leaf = classify(o);
            if(leaf.kind === "unknown" && leaf.var_root) {
                let r = var_leaves(leaf.var_root, seen, depth + 1);
                out.leaves.push(...r.leaves);
                out.unread.push(...r.unread);
                out.lets.push(...r.lets);
                out.complete = out.complete && r.complete;
                out.written = out.written || r.written;
                continue;
            }
            out.leaves.push(leaf);
            if(!KNOWN.has(leaf.kind)) {
                out.complete = false;
                out.unread.push(leaf.node);
            }
        }
    }
    return out;
}

/***************************************************************
 *  What a SOURCE can hold, for a test that derives a published list
 *  from it (i18n_key_functions.test.js): the keys of leaves_of(), a
 *  `let` / `var` met followed into everything it is given
 *  (var_leaves()). `scope` is the chain of ancestors of `node`.
 *
 *      -> {keys: [string], unread: [{at, node}]}
 *
 *  `unread`: every value it cannot read (a parameter, a call, a
 *  write it cannot follow). `at` is the node of the place it is read,
 *  `node` the value there -- or inside the `let` read there -- that
 *  stops the reader.
 ***************************************************************/
function source_keys(node, scope = [])
{
    let keys = [];
    let unread = [];
    for(let leaf of leaves_of(node, scope)) {
        if(leaf.kind === "unknown" && leaf.var_root) {
            let r = var_leaves(leaf.var_root);
            for(let l of r.leaves) {
                if(l.kind === "key") {
                    keys.push(l.value);
                } else if(l.kind === "dom") {
                    unread.push({at: leaf.node, node: l.node});     // DOM is no key of a list
                }
            }
            for(let n of r.unread) {
                unread.push({at: leaf.node, node: n});
            }
        } else if(leaf.kind === "key") {
            keys.push(leaf.value);
        } else if(leaf.kind !== "nothing") {
            unread.push({at: leaf.node, node: leaf.node});
        }
    }
    return {keys, unread};
}


                    /***************************
                     *      Markers
                     ***************************/


/*
 *  A marker is a comment, at the place a key is read, that says where
 *  the keys of what stands after it come from:
 *
 *      /\* i18n: data *\/                  data, no key of the library:
 *                                          a backend's comment, a topic
 *                                          name, a host's own key, a
 *                                          DOM node
 *      /\* i18n: C_YUI_FOO_I18N_KEYS *\/   the keys a published list
 *                                          holds (several, by commas)
 *
 *  It marks the node that starts right after it (only whitespace in
 *  between) and everything inside that node: an argument, a branch of
 *  it, a property, or the whole call.
 */
const MARKER_START_RE = /^\s*i18n\s*:/;
const MARKER_RE = /^\s*i18n\s*:\s*(.*?)\s*$/;
const MARKER_LIST_RE = /^[A-Za-z_$][\w$]*_I18N_KEYS$/;

/***************************************************************
 *  The markers of a parsed file
 *
 *      -> {at: Map(position of the node marked -> marker),
 *          all: [marker], errors: [{line, why}]}
 *
 *  marker: {kind: "data" | "lists", lists: [name], line, used: false}
 ***************************************************************/
function markers_of(ast)
{
    let at = new Map();
    let all = [];
    let errors = [];
    for(let c of ast.comments || []) {
        if(!MARKER_START_RE.test(c.value)) {
            continue;
        }
        let line = line_of(ast, c.start);
        let body = c.value.match(MARKER_RE)[1];
        let marker = null;
        if(body === "data") {
            marker = {kind: "data", lists: [], line, used: false};
        } else {
            let lists = body.split(/\s*,\s*/);
            if(lists.length > 0 && lists.every((x) => MARKER_LIST_RE.test(x))) {
                marker = {kind: "lists", lists, line, used: false};
            }
        }
        if(!marker) {
            errors.push({line, why: `"${c.value.trim()}" is no i18n marker: ` +
                `\`i18n: data\` or \`i18n: <NAME>_I18N_KEYS[, ...]\``});
            continue;
        }
        let next = c.end;
        while(next < ast.code.length && /\s/.test(ast.code[next])) {
            next++;
        }
        marker.next = next;
        at.set(next, marker);
        all.push(marker);
    }
    return {at, all, errors};
}

/***************************************************************
 *  The marker of a leaf: the innermost one standing before a node of
 *  the place it was read (its `via`), or null
 ***************************************************************/
function marker_of(leaf, markers)
{
    let via = leaf.via || [];
    for(let i = via.length - 1; i >= 0; i--) {
        let m = markers.at.get(via[i].start);
        if(m) {
            return m;
        }
    }
    return null;
}


                    /***************************
                     *      Key functions
                     ***************************/


/***************************************************************
 *  A table of key functions (I18N_KEY_FUNCTIONS, or one a test
 *  builds) indexed: {exported: Map(name -> entry), by_module:
 *  Map(module -> Map(name -> entry))}. Cached per table.
 ***************************************************************/
const KEY_FN_INDEX = new WeakMap();

function key_fn_index(table = I18N_KEY_FUNCTIONS)
{
    if(KEY_FN_INDEX.has(table)) {
        return KEY_FN_INDEX.get(table);
    }
    let exported = new Map();
    let by_module = new Map();
    for(let entry of table) {
        if(entry.exported) {
            exported.set(entry.name, entry);
        }
        if(!by_module.has(entry.module)) {
            by_module.set(entry.module, new Map());
        }
        by_module.get(entry.module).set(entry.name, entry);
    }
    let index = {exported, by_module};
    KEY_FN_INDEX.set(table, index);
    return index;
}

/***************************************************************
 *  Does an import source name a gobj-ui module (the barrel, a deep
 *  `src/` module, or, inside the library, a sibling)?
 ***************************************************************/
function is_gobj_ui_source(src, lib_module)
{
    if(/^@yuneta\/gobj-ui(?:\/index\.js|\/src\/[\w.-]+\.js)?$/.test(src)) {
        return true;
    }
    return !!lib_module && /^\.\/[\w.-]+\.js$/.test(src);
}

/***************************************************************
 *  The calls of a file to a key function, each with what the file
 *  bound the callee to: an import of a gobj-ui function (by its
 *  exported name), or, in the library module that defines it, the
 *  function itself. `table` is I18N_KEY_FUNCTIONS by default.
 *
 *      -> [{entry, call, scope}], `scope` the ancestors of the call
 ***************************************************************/
function key_calls(ast, lib_module, table)
{
    let index = key_fn_index(table);
    let direct = new Map();         // local name -> entry
    let namespaces = new Set();     // `import * as ns` of a gobj-ui module
    for(let node of ast.body) {
        if(node.type !== "ImportDeclaration" || !is_gobj_ui_source(node.source.value, lib_module)) {
            continue;
        }
        for(let spec of node.specifiers) {
            if(spec.type === "ImportSpecifier") {
                let name = spec.imported.name || spec.imported.value;
                let entry = index.exported.get(name);
                if(entry) {
                    direct.set(spec.local.name, entry);
                }
            } else if(spec.type === "ImportNamespaceSpecifier") {
                namespaces.add(spec.local.name);
            }
        }
    }
    if(lib_module && index.by_module.has(lib_module)) {
        for(let [name, entry] of index.by_module.get(lib_module)) {
            direct.set(name, entry);
        }
    }
    if(direct.size === 0 && namespaces.size === 0) {
        return [];
    }

    let out = [];
    walk(ast, (n, ancestors) => {
        if(n.type !== "CallExpression") {
            return;
        }
        let entry = null;
        let c = n.callee;
        if(c.type === "Identifier") {
            entry = direct.get(c.name) || null;
        } else if(c.type === "MemberExpression" && !c.computed
                && c.object.type === "Identifier" && namespaces.has(c.object.name)) {
            entry = index.exported.get(c.property.name) || null;
        }
        if(entry) {
            out.push({entry, call: n, scope: ancestors.slice()});
        }
    });
    return out;
}

/***************************************************************
 *  Is a leaf a key position of the function it is in, handed on?
 *  `message` where `message` is a key parameter of that function,
 *  `opts.title` where it reads `opts.title` (or destructures it).
 *  Only a function of the table forwards: its own callers are read
 *  where they call it.
 ***************************************************************/
function is_forwarded(leaf, lib_module, table)
{
    let index = key_fn_index(table);
    if(leaf.kind !== "param" || !lib_module || !index.by_module.has(lib_module)) {
        return false;
    }
    let entry = index.by_module.get(lib_module).get(leaf.binding.name);
    if(!entry) {
        return false;
    }
    return entry.keys.includes(`${leaf.binding.index}${leaf.path}`);
}

/***************************************************************
 *  Is a leaf a TRANSLATED text, `t("...")` / `i18next.t("...")`?
 *  At a key position it is a bug of its own: the function translates
 *  it again and marks it data-i18n with the translation, so it never
 *  changes language. What goes there is the key.
 ***************************************************************/
function is_translation(leaf)
{
    return !!leaf.node && leaf.node.type === "CallExpression" && callee_name(leaf.node.callee) === "t";
}

/***************************************************************
 *  Is a leaf a plain `let` / `var` (itself, not a member of it) that
 *  only ever holds DOM, or nothing: `let $msg = createElement2(...)`?
 *  Everything it is given is followed (var_leaves()).
 ***************************************************************/
function holds_only_dom(leaf)
{
    if(leaf.kind !== "unknown" || !leaf.var_root || leaf.var_root.steps.length > 0) {
        return false;
    }
    let r = var_leaves(leaf.var_root);
    return r.complete && !r.written && r.leaves.length > 0
        && r.leaves.every((l) => l.kind === "dom" || l.kind === "nothing");
}

/***************************************************************
 *  The rule a file keeps at every key position of a key function it
 *  calls -- a gobj-ui module (i18n_key_functions.test.js holds it)
 *  and an app's own source (validate-locales fails it): every value
 *  the position can take is
 *
 *    a) a string literal, or a `?:` / `||` / `??` of them, nothing,
 *       or DOM (an array spec, createElement2(), ...: is_dom());
 *    b) a `const` the reader follows to one of those (also through a
 *       const object or array, the element of a const array its
 *       `.map()` / for...of iterates, a call of a function of the
 *       module whose every return is one), or a plain `let` that is
 *       only ever given DOM;
 *    c) a key position of the enclosing table function, handed on
 *       (only in the library: an app's functions are in no table);
 *    d) MARKED where it is handed: `/\* i18n: <NAME>_I18N_KEYS *\/`
 *       (a module publishes those keys) or `/\* i18n: data *\/`.
 *
 *  A TRANSLATED text, `t("...")`, fails even when marked: what goes
 *  there is the key (`why: "translated"`). `table` is
 *  I18N_KEY_FUNCTIONS by default.
 *
 *      -> [{line, call_line, name, path, text, why}]
 ***************************************************************/
function call_rule_violations(ast, lib_module, table)
{
    let markers = markers_of(ast);
    let out = [];
    for(let {entry, call, scope} of key_calls(ast, lib_module, table)) {
        for(let path of entry.keys) {
            for(let leaf of values_at(call, path, scope)) {
                let why = null;
                if(is_translation(leaf)) {
                    why = "translated";
                } else if(KNOWN.has(leaf.kind) || is_forwarded(leaf, lib_module, table)
                        || marker_of(leaf, markers) || holds_only_dom(leaf)) {
                    continue;
                }
                out.push({
                    line: line_of(ast, leaf.node.start),
                    call_line: line_of(ast, call.start),
                    name: entry.name,
                    path: path,
                    text: ast.code.slice(leaf.node.start, leaf.node.end).slice(0, 120),
                    why: why
                });
            }
        }
    }
    return out;
}

/***************************************************************
 *  A violation of call_rule_violations() said to whoever has to fix
 *  it, from the file `label`
 ***************************************************************/
function call_rule_message(label, v)
{
    let where = `${label}:${v.line}${v.call_line !== v.line? ` (call at line ${v.call_line})` : ""}`;
    let what = `${v.name}() [${v.path}] is given ${v.text.replace(/\s+/g, " ")}`;
    if(v.why === "translated") {
        return `${where}: ${what}: a TRANSLATED text where a KEY goes (translated again and ` +
               `marked data-i18n with the translation, it never changes language): hand it the key`;
    }
    return `${where}: ${what}, which the reader cannot follow: hand it a literal or a const, ` +
           `or mark it /* i18n: data */ or /* i18n: <NAME>_I18N_KEYS */`;
}


                    /***************************
                     *      Published lists
                     ***************************/


/***************************************************************
 *  The `<NAME>_I18N_KEYS` arrays a module exports, READ, never run:
 *  `export const|let|var X = [...]`, `const X = [...]; export {X}`,
 *  either wrapped in Object.freeze(). Each element is a string literal,
 *  a template with no `${}`, or a spread of another array of the same
 *  module read the same way -- a top-level `const`, or a list it
 *  publishes: `[...BASE_I18N_KEYS, "k"]`.
 *
 *      -> {lists: [{name, keys}], errors: [why]}
 *
 *  Anything else so named is an ERROR, never skipped: the keys it
 *  holds would go unasked, and the build say OK. That covers an
 *  export that is not an array of literals (a spread of anything else
 *  included: an import, a `let`, a call), and a list nobody can
 *  read: one declared and not exported, one declared inside a
 *  function or a block, one declared by destructuring, one exported
 *  under a name that does not end in _I18N_KEYS. A re-export
 *  (`export {X} from "./y.js"`) is read in its own module.
 ***************************************************************/
function published_lists(ast)
{
    let top = new Map();        // a top-level name -> its declaration
    for(let node of ast.body) {
        let decl = (node.type === "ExportNamedDeclaration")? node.declaration : node;
        if(!decl) {
            continue;
        }
        if(decl.type === "VariableDeclaration") {
            for(let d of decl.declarations) {
                if(d.id.type === "Identifier") {
                    top.set(d.id.name, {init: d.init, kind: decl.kind});
                }
            }
        } else if(decl.id && (decl.type === "FunctionDeclaration" || decl.type === "ClassDeclaration")) {
            top.set(decl.id.name, {init: null, what: decl.type});
        }
    }

    /*  What a list may spread: a const of the module, or a list it publishes  */
    let base_of = (name) => {
        let d = top.get(name);
        if(!d || !d.init || !d.kind) {
            return null;
        }
        return (d.kind === "const" || PUBLISHED_LIST_RE.test(name))? d.init : null;
    };

    let lists = [];
    let errors = [];
    let read_as = new Set();    // local names exported under a list's name
    let read = (exported, local) => {
        read_as.add(local);
        let d = top.get(local);
        if(!d) {
            errors.push(`${exported}: not declared at the top of the module`);
            return;
        }
        if(!d.init) {
            errors.push(`${exported}: ${d.what? "a " + d.what : "declared with no value"}, not an array`);
            return;
        }
        let r = read_string_array(d.init, base_of, new Set([local]));
        if(r.error) {
            errors.push(`${exported}: ${r.error}`);
            return;
        }
        lists.push({name: exported, keys: r.keys});
    };
    let exported_as = new Map();    // local name -> [exported names]
    for(let node of ast.body) {
        if(node.type !== "ExportNamedDeclaration") {
            continue;
        }
        if(node.declaration) {
            let decl = node.declaration;
            if(decl.type === "VariableDeclaration") {
                for(let d of decl.declarations) {
                    if(d.id.type === "Identifier" && PUBLISHED_LIST_RE.test(d.id.name)) {
                        read(d.id.name, d.id.name);
                    }
                }
            } else if(decl.id && PUBLISHED_LIST_RE.test(decl.id.name)) {
                read(decl.id.name, decl.id.name);
            }
            continue;
        }
        if(node.source) {
            continue;       // a re-export: read where it is declared
        }
        for(let spec of node.specifiers) {
            let exported = spec.exported.name || spec.exported.value;
            if(!exported_as.has(spec.local.name)) {
                exported_as.set(spec.local.name, []);
            }
            exported_as.get(spec.local.name).push(exported);
            if(PUBLISHED_LIST_RE.test(exported)) {
                read(exported, spec.local.name);
            }
        }
    }

    /*  A list that no export makes readable  */
    walk(ast, (n, ancestors) => {
        if(n.type !== "VariableDeclarator") {
            return;
        }
        for(let name of pattern_names(n.id)) {
            if(!PUBLISHED_LIST_RE.test(name)) {
                continue;
            }
            let at_top = (ancestors.length === 2 && ancestors[1].type === "VariableDeclaration")
                || (ancestors.length === 3 && ancestors[1].type === "ExportNamedDeclaration");
            if(n.id.type !== "Identifier") {
                errors.push(`${name}: declared by destructuring, which no reader follows: ` +
                            `write it as an array of literals`);
            } else if(!at_top) {
                errors.push(`${name}: declared inside a function or a block, where no consumer reads it`);
            } else if(!read_as.has(name)) {
                let as = exported_as.get(name);
                errors.push(as? `${name}: exported as ${as.join(", ")}, a name the validator does not read` :
                                `${name}: not exported, so no consumer reads it`);
            }
        }
    });
    return {lists, errors};
}

/***************************************************************
 *  An array of string literals, through any Object.freeze(). A
 *  spread `...NAME` is read where `base_of(NAME)` says it is declared
 *  (null: it cannot be read); `seen` holds the names on the way, so a
 *  cycle is an error, not a loop.
 ***************************************************************/
function read_string_array(init, base_of = () => null, seen = new Set())
{
    let n = init;
    while(is_object_call(n, "freeze") && n.arguments.length === 1) {
        n = n.arguments[0];
    }
    if(n.type !== "ArrayExpression") {
        return {error: `a ${n.type}, not an array of string literals`};
    }
    let keys = [];
    for(let i = 0; i < n.elements.length; i++) {
        let el = n.elements[i];
        if(el && el.type === "SpreadElement") {
            let name = (el.argument.type === "Identifier")? el.argument.name : null;
            let base = (name && !seen.has(name))? base_of(name) : null;
            if(!base) {
                return {error: `element ${i} spreads ${name || "a " + el.argument.type}, which is neither a ` +
                               `const of the module nor a list it publishes`};
            }
            let r = read_string_array(base, base_of, new Set([...seen, name]));
            if(r.error) {
                return {error: `element ${i} spreads ${name}, ${r.error}`};
            }
            keys.push(...r.keys);
            continue;
        }
        let s = null;
        if(el && el.type === "Literal" && typeof el.value === "string") {
            s = el.value;
        } else if(el && el.type === "TemplateLiteral" && el.expressions.length === 0) {
            s = el.quasis[0].value.cooked;
        }
        if(!s) {
            return {error: `element ${i} is ${el? "a " + el.type : "a hole"}` +
                           `${s === ""? " (an empty string)" : ""}, not a string literal`};
        }
        keys.push(s);
    }
    return {keys};
}


                    /***************************
                     *      The scan
                     ***************************/


/***************************************************************
 *  Every place a parsed file READS a key, with the leaves of what
 *  stands there (leaves_of(), values_at()):
 *
 *      -> [{what, node, leaves, entry, path}]
 *
 *  `what` says which place it is:
 *
 *      "t"           the first argument of t() / tr()
 *      "code"        the code of a schema check, add("error", <code>)
 *      "attribute"   setAttribute("data-i18n*", <key>)
 *      "property"    an `i18n`, `code` or `data-i18n*` property of an
 *                    object literal, or one of ctx.attr_keys
 *      "array"       an element of one of ctx.array_keys
 *      "assignment"  `x.i18n = <key>`, `x["data-i18n-title"] = <key>`
 *      "call"        a key position of a key function: `entry` and
 *                    `path` say which
 *
 *  `node` is the node of the place (the call, the property, the
 *  assignment), where a marker of the whole place stands.
 *
 *      ctx: {lib_module, attr_keys, array_keys (Sets), table}
 ***************************************************************/
function key_places(ast, ctx = {})
{
    let attr_keys = ctx.attr_keys || new Set();
    let array_keys = ctx.array_keys || new Set();
    let calls = key_calls(ast, ctx.lib_module || null, ctx.table);
    let of_the_table = new Set(calls.map((c) => c.call));
    let out = [];
    let read = (what, node, scope, root) => {
        if(node) {
            out.push({what, node: root, leaves: leaves_of(node, scope, root)});
        }
    };
    walk(ast, (n, ancestors) => {
        switch(n.type) {
            case "CallExpression": {
                let name = callee_name(n.callee);
                let scope = [...ancestors, n];
                if(of_the_table.has(n)) {
                    break;      // a key function (a `tr` of the library too): read where its table says
                }
                if(name === "t" || name === "tr") {
                    read("t", n.arguments[0], scope, n);
                } else if(name === "add" && is_string_literal(n.arguments[0], /^(error|warning)$/)) {
                    /*  The codes the schema checks hand to `t(finding.code)`  */
                    read("code", n.arguments[1], scope, n);
                } else if(name === "setAttribute" && is_string_literal(n.arguments[0], DATA_I18N_ATTR_RE)) {
                    read("attribute", n.arguments[1], scope, n);
                }
                break;
            }
            case "Property": {
                let name = prop_name(n);
                if(name === null || ancestors[ancestors.length - 1].type !== "ObjectExpression") {
                    break;      // computed, or a destructuring pattern
                }
                let scope = [...ancestors, n];
                if(name === "i18n" || name === "code" || DATA_I18N_ATTR_RE.test(name) || attr_keys.has(name)) {
                    read("property", n.value, scope, n);
                }
                if(array_keys.has(name) && n.value.type === "ArrayExpression") {
                    for(let el of n.value.elements) {
                        read("array", el, [...scope, n.value], n);
                    }
                }
                break;
            }
            case "AssignmentExpression": {
                if(n.operator !== "=" || n.left.type !== "MemberExpression") {
                    break;
                }
                let name = member_step(n.left).prop;
                if(name === "i18n" || (name !== null && DATA_I18N_ATTR_RE.test(name))) {
                    read("assignment", n.right, [...ancestors, n], n);
                }
                break;
            }
            default:
                break;
        }
    });
    for(let {entry, call, scope} of calls) {
        for(let path of entry.keys) {
            out.push({what: "call", node: call, entry, path, leaves: values_at(call, path, scope)});
        }
    }
    return out;
}

/***************************************************************
 *  The keys one parsed file asks for.
 *
 *      ctx: {lib_module (its name in src/, or null for an app file),
 *            attr_keys, array_keys (Sets), declared (Set)}
 *      -> {keys: Set, read_keys: Set (those READ, not published by a
 *          list), declared_seen: Set,
 *          lists: [{name, keys}], list_errors: [why],
 *          marker_refs: [{lists, keys, line}], marker_errors: [{line, why}]}
 *
 *  Every place a key is read (key_places()) goes through leaves_of(),
 *  so a marker standing there is found: one that marks no such place,
 *  or that is not a marker at all, is an error. So is a DATA marker
 *  on what the reader follows to keys and nothing else (a literal, a
 *  const that is one, a `?:` branch that is one, a call of a function
 *  of the module that returns literals): it claims data where the
 *  reader reads a key.
 ***************************************************************/
function scan_ast(ast, ctx)
{
    let keys = new Set();
    let declared_seen = new Set();
    let declared = ctx.declared || new Set();
    let markers = markers_of(ast);
    let var_errors = [];
    let vars_checked = new Set();

    /*
     *  A marker says where the keys of what it marks come from, and a
     *  `let` / `var` it marks -- itself, or a member or an element read
     *  from it -- is held to it: everything the variable is given (and,
     *  for a member, written into it) is read, each key of it is asked
     *  for and must be in the lists the marker names. One that is only
     *  ever given literals needs no marker at all: it is a const that
     *  was not written as one. (What is WRITTEN into a table is not that
     *  case: a const would not carry it to the reader.)
     */
    let check_marked_var = (leaf, m) => {
        let root = leaf.var_root;
        let b = root.binding;
        let id = `${m.line}:${b.declarators[0].start}:${JSON.stringify(root.steps)}`;
        if(vars_checked.has(id)) {
            return;
        }
        vars_checked.add(id);
        let r = var_leaves(root);
        let held = [...new Set(r.leaves.filter((l) => l.kind === "key").map((l) => l.value))];
        for(let k of held) {
            keys.add(k);
        }
        if(r.complete && !r.written && held.length > 0) {
            let decl_line = (x) => line_of(ast, x.declarators[0].start);
            let seen_lets = new Set([b.declarators[0]]);
            let others = r.lets.filter((x) => {
                let had = seen_lets.has(x.declarators[0]);
                seen_lets.add(x.declarators[0]);
                return !had;
            });
            let through = others.map((x) => `the ${x.decl} \`${x.name}\` (line ${decl_line(x)})`);
            var_errors.push({line: line_of(ast, leaf.node.start),
                why: `\`${b.name}\` is a ${b.decl} (line ${decl_line(b)}) that only ` +
                     `ever holds literals (${held.map((k) => JSON.stringify(k)).join(", ")})` +
                     (through.length? `, through ${through.join(", ")}` : "") +
                     `: make ${through.length? "them consts" : "it a const"}, which the reader follows, ` +
                     `and drop the marker`});
            return;
        }
        if(m.kind === "lists") {
            for(let k of held) {
                m.keys.add(k);
            }
        }
    };

    let take = (leaves) => {
        for(let leaf of leaves) {
            if(leaf.kind === "key") {
                keys.add(leaf.value);
            }
            let m = marker_of(leaf, markers);
            if(m) {
                m.used = true;
                if(!m.keys) {
                    m.keys = new Set();
                }
                if(!m.leaves) {
                    m.leaves = [];
                }
                m.leaves.push(leaf);
                if(leaf.kind === "key") {
                    m.keys.add(leaf.value);
                }
                if(leaf.kind === "unknown" && leaf.var_root) {
                    check_marked_var(leaf, m);
                }
            }
        }
    };
    let add_markup = (text) => {
        if(typeof text !== "string" || !text.includes("data-i18n")) {
            return;
        }
        DATA_I18N_MARKUP_RE.lastIndex = 0;
        let m;
        while((m = DATA_I18N_MARKUP_RE.exec(text)) !== null) {
            if(!m[1].includes("${")) {
                keys.add(m[1]);
            }
        }
    };

    for(let place of key_places(ast, ctx)) {
        take(place.leaves);
    }
    walk(ast, (n) => {
        if(n.type === "Property") {
            let name = prop_name(n);
            if(name !== null && declared.has(name)) {
                declared_seen.add(name);
            }
        } else if(n.type === "Literal") {
            add_markup(n.value);
        } else if(n.type === "TemplateElement") {
            add_markup(n.value.cooked);
        }
    });

    /*  The keys a module publishes as data  */
    let read_keys = new Set(keys);
    let published = published_lists(ast);
    for(let list of published.lists) {
        for(let k of list.keys) {
            keys.add(k);
        }
    }

    /*  The markers: each one stands where a key is read, and is one  */
    let marker_errors = [...markers.errors, ...var_errors];
    let marker_refs = [];
    for(let m of markers.all) {
        if(!m.used) {
            marker_errors.push({line: m.line, why: `the i18n marker stands before no place a key is read ` +
                `(a key position of a key function, t(), an i18n or data-i18n* value)`});
        } else if(m.kind === "lists") {
            marker_refs.push({lists: m.lists, keys: [...(m.keys || [])], line: m.line});
        } else if(m.kind === "data" && m.leaves.every((l) => KNOWN.has(l.kind)) && m.keys.size > 0) {
            let held = [...m.keys].map((k) => JSON.stringify(k)).join(", ");
            marker_errors.push({line: m.line, why: `marked as data, but what it marks is the key ` +
                `${held}, which the reader follows: drop the marker (it is no data)`});
        }
    }

    return {
        keys,
        read_keys,
        declared_seen,
        lists: published.lists,
        list_errors: published.errors,
        marker_refs,
        marker_errors
    };
}

/***************************************************************
 *  The i18n keys the source asks for.
 *
 *      opts: {src: [dir URL], locales: dir URL (not scanned),
 *             exclude: [file URL] (not scanned either),
 *             config: file URL or [file URL] (the shell declarations),
 *             config_key: (value) -> bool (a config value is a key?),
 *             attr_keys, array_keys: [property name],
 *             language_names: Set}
 *      -> {keys: Set (all), lib_keys: Set (those of the gobj-ui
 *          modules the app mounts)}
 *
 *  A violation found on the way (a file that cannot be parsed, a list
 *  that cannot be read, a marker that is wrong, a key position of a
 *  key function in the app's own code that breaks the per-call rule,
 *  call_rule_violations()) is reported with fail(): see
 *  violation_count().
 ***************************************************************/
function collect_used_keys(opts)
{
    let keys = new Set();
    let lib_keys = new Set();
    let attr_keys = opts.attr_keys || [];
    let array_keys = opts.array_keys || [];
    let ctx = {
        attr_keys: new Set(attr_keys),
        array_keys: new Set(array_keys),
        declared: new Set([...attr_keys, ...array_keys])
    };
    let declared_seen = new Set();
    let barrel = barrel_export_map();
    let published = new Map();      // list name -> Set of keys
    let refs = [];                  // [{label, line, lists, keys}]

    let scan = (url, lib_module) => {
        let label = lib_module? `gobj-ui/src/${lib_module}` : relative(process.cwd(), fileURLToPath(url));
        let ast;
        try {
            ast = parse_source(readFileSync(url, "utf8"));
        } catch(e) {
            fail(`${label} cannot be parsed (${e.message}): the keys it asks for are NOT checked`);
            return [];
        }
        let r = scan_ast(ast, {...ctx, lib_module});
        for(let k of r.keys) {
            keys.add(k);
            if(lib_module) {
                lib_keys.add(k);
            }
        }
        for(let name of r.declared_seen) {
            declared_seen.add(name);
        }
        for(let why of r.list_errors) {
            fail(`${label}: the published list ${why}: its keys are NOT asked for`);
        }
        for(let list of r.lists) {
            if(!published.has(list.name)) {
                published.set(list.name, new Set());
            }
            for(let k of list.keys) {
                published.get(list.name).add(k);
            }
        }
        for(let e of r.marker_errors) {
            fail(`${label}:${e.line}: ${e.why}`);
        }
        for(let ref of r.marker_refs) {
            refs.push({label, ...ref});
        }
        if(!lib_module) {
            /*  The library keeps the rule by its own test; the app's code here  */
            for(let v of call_rule_violations(ast, null)) {
                fail(call_rule_message(label, v));
            }
        }
        return lib_imports(ast, barrel, lib_module);
    };

    /*  The app's own source, and the code it shares with others  */
    let pending = [];
    let excluded = new Set((opts.exclude || []).map((u) => u.href));
    for(let dir of opts.src) {
        if(!existsSync(dir)) {
            abort(`no source directory at ${dir.pathname}`);
        }
        for(let url of source_files(dir, opts.locales)) {
            if(!excluded.has(url.href)) {
                pending.push(...scan(url, null));
            }
        }
    }

    /*  A name declared and found in no source is a typo that turns its check off  */
    for(let name of ctx.declared) {
        if(!declared_seen.has(name)) {
            fail(`package.json "validate-locales" names ${JSON.stringify(name)}, which no source uses: a typo turns its check off`);
        }
    }

    let configs = [].concat(opts.config || []);
    let is_key = opts.config_key || ((v) => v === v.toLowerCase() && !(opts.language_names || new Set()).has(v));
    for(let url of configs) {
        keys_from_shell_config(url, keys, is_key);
    }

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
        pending.push(...scan(url, name));
    }
    if(missing.length > 0) {
        abort(`modules of gobj-ui not found in ${LIB_SRC.pathname}: ${missing.join(", ")}`);
    }

    /*  A marker names lists that were read, and what it marks is in them  */
    for(let ref of refs) {
        let names = ref.lists.filter((name) => published.has(name));
        for(let name of ref.lists) {
            if(!published.has(name)) {
                fail(`${ref.label}:${ref.line}: the i18n marker names ${name}, ` +
                     `a list no module the app mounts publishes`);
            }
        }
        if(names.length < ref.lists.length) {
            continue;
        }
        for(let k of ref.keys) {
            if(!names.some((name) => published.get(name).has(k))) {
                fail(`${ref.label}:${ref.line}: ${JSON.stringify(k)} is marked as a key of ` +
                     `${ref.lists.join(", ")}, and is not in it`);
            }
        }
    }

    return {keys, lib_keys};
}

/***************************************************************
 *  The .js / .mjs files of a source directory, recursively: not the tests
 *  (*.test.js, *.spec.js, __tests__/, test/, tests/), not a locales/
 *  directory (its keys are definitions, not uses), not node_modules or a
 *  build
 ***************************************************************/
const SKIPPED_DIRS = new Set(["node_modules", "dist", "locales", "__tests__", "test", "tests"]);

function source_files(dir, locales_dir)
{
    let out = [];
    let walk_dir = (d) => {
        if(locales_dir && d.href === locales_dir.href) {
            return;
        }
        for(let f of readdirSync(d).sort()) {
            let url = new URL(f, d);
            let st = statSync(url);
            if(st.isDirectory()) {
                if(SKIPPED_DIRS.has(f) || f.startsWith(".")) {
                    continue;
                }
                walk_dir(new URL(f + "/", d));
            } else if(/\.m?js$/.test(f) && !/\.(test|spec)\.m?js$/.test(f)) {
                out.push(url);
            }
        }
    };
    walk_dir(dir);
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
 *  `is_key(value)` says which values are keys. By default, a value that
 *  is not lower-case is a literal the config carries on purpose ("ES/EN"
 *  on a language button); so is the endonym of one of the app's locales
 *  (its `name`: "中文", "español") in a language menu. Any other value is
 *  a key -- "configuración" is a Spanish literal that forgot its key,
 *  and it is reported, as an ASCII one would be. `wordmark` and `alt` are
 *  deliberately out: a brand name is not translated. A key starting with
 *  `_` is a comment.
 ***************************************************************/
const CONFIG_I18N_FIELDS = ["name", "aria_label", "tooltip", "label", "title", "subtitle"];

function keys_from_shell_config(url, keys, is_key)
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
    let walk_config = (node) => {
        if(Array.isArray(node)) {
            for(let item of node) {
                walk_config(item);
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
            if(CONFIG_I18N_FIELDS.includes(k) && typeof v === "string" && v && is_key(v)) {
                keys.add(v);
            }
            walk_config(v);
        }
    };
    walk_config(config);
}

/***************************************************************
 *  Drop /* ... *\/ and // ... comments (good enough for the duplicate
 *  key scan of a locale file)
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
    let ast;
    try {
        ast = parse_source(readFileSync(LIB_INDEX, "utf8"));
    } catch(e) {
        abort(`cannot read the gobj-ui barrel at ${LIB_INDEX.pathname}: ${e.message}`);
    }
    for(let node of ast.body) {
        if(node.type !== "ExportNamedDeclaration" || !node.source) {
            continue;
        }
        let m = String(node.source.value).match(/^\.\/src\/([\w.-]+\.js)$/);
        if(!m) {
            continue;
        }
        for(let spec of node.specifiers) {
            /*  `a as b` is published as `b`  */
            map.set(spec.exported.name || spec.exported.value, m[1]);
        }
    }
    return map;
}

/***************************************************************
 *  The gobj-ui source modules a parsed file imports (or re-exports):
 *    - deep:    "@yuneta/gobj-ui/src/x.js", also by a dynamic import()
 *    - barrel:  "@yuneta/gobj-ui[/index.js]", resolved per imported symbol
 *    - inside the library: "./x.js" (in the app it names an app file,
 *      scanned already)
 ***************************************************************/
function lib_imports(ast, barrel, lib_module)
{
    let out = [];
    let module_of = (src) => {
        if(typeof src !== "string") {
            return null;
        }
        let m = src.match(/^@yuneta\/gobj-ui\/src\/([\w.-]+\.js)$/);
        if(m) {
            return m[1];
        }
        if(lib_module) {
            m = src.match(/^\.\/([\w.-]+\.js)$/);
            if(m) {
                return m[1];
            }
        }
        return null;
    };
    let is_barrel = (src) => /^@yuneta\/gobj-ui(?:\/index\.js)?$/.test(src);

    walk(ast, (n) => {
        let src = null;
        let names = null;
        if(n.type === "ImportDeclaration") {
            src = n.source.value;
            names = n.specifiers
                .filter((s) => s.type === "ImportSpecifier")
                .map((s) => s.imported.name || s.imported.value);
        } else if((n.type === "ExportNamedDeclaration" || n.type === "ExportAllDeclaration") && n.source) {
            src = n.source.value;
            names = (n.specifiers || []).map((s) => s.local.name || s.local.value);
        } else if(n.type === "ImportExpression" && n.source.type === "Literal") {
            src = n.source.value;
        }
        if(src === null) {
            return;
        }
        let mod = module_of(src);
        if(mod) {
            out.push(mod);
        } else if(is_barrel(src) && names) {
            for(let name of names) {
                let m = barrel.get(name);
                if(m) {
                    out.push(m);
                }
            }
        }
    });
    return out;
}

/*  The readers, for a test of the library and for an app whose catalog
 *  has another shape (gobj-ui's test-app)  */
export {
    parse_source,
    walk,
    line_of,
    prop_name,
    binding_of,
    leaves_of,
    static_keys,
    source_keys,
    var_leaves,
    values_at,
    is_dom,
    markers_of,
    marker_of,
    key_calls,
    key_places,
    is_forwarded,
    call_rule_violations,
    call_rule_message,
    published_lists,
    scan_ast,
    collect_used_keys,
    keys_from_shell_config,
    source_files,
    lib_imports,
    find_plural_groups,
    violation_count
};

/*
 *  Run when it is the script, not when a test or another script imports
 *  it. Both sides are resolved: with --preserve-symlinks-main (also from
 *  NODE_OPTIONS) and a symlinked package, argv[1] and import.meta.url
 *  both keep the link, and only the real paths compare.
 */
let is_main = false;
try {
    is_main = !!process.argv[1]
        && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
} catch(e) {
    is_main = false;
}
if(is_main) {
    await main();
}
