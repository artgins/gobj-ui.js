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
 *          parsed and then imported, in a process of its own, and its
 *          top-level code runs there; see below.) In each file it reads as
 *          keys:
 *
 *            - the key given to a TRANSLATOR: t() or tr() -- whatever binds
 *              the name --, `i18next.t()`, i18next's t imported under any
 *              name, an alias of one (`const translate = t`, a `.bind()`,
 *              a destructuring, `const {t: tt} = i18next` or a parameter
 *              `{t: tt}`, a re-export), called `t?.(k)`, `t.call(x, k)` or
 *              `t.apply(x, [k])` (`t["call"](x, k)` too, a computed
 *              `["bind"]`, a name a const gives, `t[M]`, or a template;
 *              and a spread of an array the source writes out,
 *              `t(...["k"])`, `t.apply(x, KEYS)` with KEYS a const
 *              array); an array there is i18next's list of
 *              fallback keys, each one a key (`t([k, "fallback"])`). A
 *              `.bind()` that binds a key (`const tk = t.bind(null, k)`)
 *              hands t() that key, read where the bind is written, and
 *              makes a translator whose calls hand i18next its options or
 *              its default value, not a key: what they hand is not read;
 *            - each element a translator handed as a CALLBACK walks, and
 *              only these: `.map`, `.flatMap`, `.forEach`, `.filter`,
 *              `.find`, `.findIndex`, `.findLast`, `.findLastIndex`,
 *              `.some`, `.every` -- called on the array (`keys.map(t)`,
 *              `keys["map"](t)`), or by `.call(keys, t)` / `.apply(keys,
 *              [t])` of the method (`Array.prototype.map.call(keys, t)`,
 *              `[].forEach.call(keys, t)`) --, `Array.from(keys, t)` and
 *              `Array.fromAsync(keys, t)`; and what `.then(t)` /
 *              `.catch(t)` settle with, which no source writes;
 *            - the string given to an `i18n` property, to a
 *              `data-i18n*` attribute (as a property, also computed by a
 *              const, `{[ATTR]: k}`; as a member written, `x.i18n = k`,
 *              `x["data-i18n-title"] = k`, `x[ATTR] = k`,
 *              `el.dataset.i18nTitle = k`; by setAttribute() or
 *              setAttributeNS(), the name a literal or a const; or written
 *              in markup), and to a `code` property in the modules of the
 *              library whose codes are keys (CODE_KEY_MODULES: the
 *              findings and conflicts of the schema checks, which the
 *              schema editor hands to t()); in an app a `code` is no key
 *              unless its package.json names it (`attr_keys`);
 *            - the strings given to a gobj-ui function that RECEIVES a key
 *              as an argument (`yui_shell_show_error(shell, "<key>")`,
 *              `icon_button(..., "<key>")`), at the positions its table
 *              names: I18N_KEY_FUNCTIONS, src/i18n_key_functions.js --
 *              however the call reaches it: its name, an import under any
 *              name, a re-export, a const alias, a map
 *              (`API.info(...)`), `.call()`, `.apply()`, and a `.bind()`
 *              (`f.bind(x, shell, k)`), read at the positions it binds. A
 *              position that is only the fallback of others (`fallbacks`:
 *              a card's id, behind its name and its aria_label) is not
 *              read where one of those is surely given. A position may
 *              hold DOM as well, which is no key: an array (a
 *              createElement2 spec; not an array of string literals,
 *              which is none), createElement2(), createOneHtml() or
 *              html_markup() of gobj-js, text_node() of gobj-ui,
 *              document.createElement() and the like -- known by where
 *              they come from, never by the name of a variable;
 *            - the keys a module PUBLISHES as data: an exported
 *              `<NAME>_I18N_KEYS` array of string literals (the keys it
 *              hands to t() as variables, yui_dev.js's 51). Read as data
 *              -- `export const`, `const X = [...]; export {X}`, wrapped
 *              in Object.freeze(), spreading another array of the module
 *              read the same way (`[...BASE_I18N_KEYS, "k"]`: a top-level
 *              const) --; anything so named that cannot be read so is a
 *              violation, never skipped (a list declared with `let` or
 *              `var`, not exported, declared in a function, by
 *              destructuring, or exported under another name; an element
 *              that is a variable, a call, a spread of an import or of a
 *              `let`). So is a list MUTATED, here or where it is imported
 *              (`.push()`, `.splice()`, `.unshift()`, `X[i] = k`,
 *              `X.length = n`, Object.assign()), by its name, as a member
 *              of a namespace import (`M.X_I18N_KEYS.push(k)`) or through
 *              an alias (`const a = X_I18N_KEYS; a.push(k)`): what it is
 *              given there is asked for by nobody.
 *
 *          A string is read where it is written, and FOLLOWED where the
 *          source writes it out: a literal, a template with no `${}`,
 *          every branch of `?:`, `||` and `??`, the right one of `&&`; a
 *          `const` to its value (`const KEY = "save"; t(KEY)` asks for
 *          "save"), and what a destructuring reads from one (`const
 *          {title} = OPTS`; its default only where what it reads can be
 *          undefined: with_default()); an import of a const or a function, into the
 *          module it names, when that module is one this script reads (a
 *          file of the app, a module of the library); a property of a
 *          const object literal (`DEFAULTS.ok`; every value of it for
 *          `NOTES[verdict]`), or of a copy of one (`{...o}`,
 *          `Object.assign({}, o)`); the element of a const array literal
 *          that a for...of iterates, or the first parameter of a callback
 *          of one of the methods above (in the same forms, and of
 *          `Array.from(items, cb)`), and what a destructuring reads from
 *          it -- an array one too, `([id, key]) => ...`; an element of an
 *          array by its index, `.at()` and `.slice()` (array_method_values(),
 *          is_nested_array()), or by every element where the index is not
 *          known or the array may hold others by then, never by nothing;
 *          `String(x)`, and a template that is only `${x}`, as x; a
 *          parameter however it is read (`opts?.title`, `arguments[1]`,
 *          `rest[0]`) and its default; a call of a function the script
 *          reads -- of the module, or imported -- whose every `return`
 *          is one of these (`t(pick())`, `pick` returning "a" or "b",
 *          asks for both). What a function returns is read ONCE, and a
 *          recursion is not followed (a call of a function being read is
 *          a value it cannot follow): up to 7.26.31 a recursive helper
 *          was read again at every call, and three recursive branches
 *          hung the build. And an UNMARKED plain `let` / `var` whose
 *          every value in its scope -- its initializer, every `=`, `||=`,
 *          `??=`, `&&=`, the value of a `var` of it declared again -- is
 *          written as a string literal, a const bound to one, `null`, or a
 *          `?:` / `||` / `??` of those (the right one of `&&`), read where
 *          t(), an i18n or a data-i18n* value reads a key: it can only
 *          ever hold those literals, and EVERY one of them is a key asked
 *          for. Every write counts: one whose value the reader does not
 *          read -- a property of a table, a call, data, a `+=`, a
 *          destructuring assignment, a for...of / for...in head that
 *          writes it (the variable, a destructuring of it, a `var` of it
 *          declared again there), a direct eval() -- leaves the variable
 *          not followed, and it fails nothing (up to 7.26.41 a
 *          destructuring loop head, and a `var` declared again in a loop
 *          head or in a block of the module, did not count, and the
 *          literal was asked for). The rule is flow-INSENSITIVE: a literal
 *          an `if` excludes, or one overwritten before the read, is asked
 *          for all the same; a sentinel that is no key is `null`, which is
 *          never asked for. A key built by concatenation, held in a `let`
 *          given anything else, or arriving as data cannot be known: its
 *          module publishes it in a `<NAME>_I18N_KEYS` list.
 *
 *          A MARKER at the place a key is read says where the keys of what
 *          follows it come from: `/\* i18n: <NAME>_I18N_KEYS *\/` (that
 *          published list; several by commas) or `/\* i18n: data *\/` (data,
 *          no key a list can hold). It marks what stands right after it,
 *          through a parenthesis (`/\* i18n: data *\/ (a || b)`). This
 *          script checks the markers it reads: each one must be a marker
 *          and stand before a place a key is read (one that does not is
 *          told what it stands before), the lists it names must be
 *          published by a module the app mounts (the app's own included),
 *          and the keys it marks that can be read must be in them; a
 *          template with `${}` it marks must have the shape of some key of
 *          them (`monitor ${control}`: "monitor start") that no NARROWER
 *          marked template builds (`monitor confirm ${control}` builds
 *          "monitor confirm start": `monitor ${control}` marked with the
 *          list of the confirms fails). A `data` marker
 *          is a claim too: on what the reader follows to keys and nothing
 *          else -- a literal, a const that is one, a `?:` branch that is
 *          one, a call that returns literals, imported or not -- it is a
 *          violation, and so is one that would HIDE a key the reader does
 *          not read -- a call whose returns mix keys with data (split the
 *          branches), an array of string literals. A marked `let` / `var`
 *          is READ, and so is one a marked member or element is read from
 *          (`LABELS[k]`, `picked = LIST[0]`, the `x` of
 *          `LIST.forEach((x) => ...)`): everything it is given in its
 *          scope (its value, every `=` to it; for a member, also what is
 *          written into it: `x.a = v`, `x.push(v)`, Object.assign()) is
 *          followed, each literal is a key asked for and must be in the
 *          lists named, and one given nothing but literals is a
 *          violation: it is a const.
 *
 *          A TRANSLATED text where a key is read -- `t("k")`, any
 *          translator above, or a string built from one, `t("k") + ":"`,
 *          `t("k").toUpperCase()` -- is a violation, MARKED OR NOT, given
 *          to t() (`t(t("k") + "!")`), to an i18n / data-i18n* value or a
 *          `code` where it is a key (`{i18n: t("k")}`), or to a data-i18n*
 *          attribute: the
 *          place keeps the translation as its key, and it never changes
 *          language. Up to 7.26.41 only a marked one failed.
 *
 *          THE RULE PER CALL holds the app's own code, as a test holds the
 *          library (i18n_key_functions.test.js): every value a key position
 *          of a key function can take is a literal (a branch of them,
 *          nothing, DOM), a const the reader follows to one, a `let` that
 *          is only ever given DOM, or MARKED where it is handed. Anything
 *          else -- a `let` given literals, an options variable, a
 *          concatenation, a parameter of a wrapper of the app's own -- is a
 *          violation, with the file and the line. So is a TRANSLATED text
 *          handed there -- `t("k")`, any translator above, or a string
 *          built from one (`t("k") + ":"`) --, even marked: the function
 *          translates it again and marks it data-i18n with the
 *          translation, so it never changes language; hand the key, not
 *          t(key). A translator handed as a CALLBACK is held to the same
 *          rule: each element `keys.map(t)` walks is such a position, and
 *          what `.then(t)` is handed, which no source writes, is marked or
 *          fails. A function of the app is in no table, so what a
 *          wrapper of its own hands on is marked where it hands it -- and
 *          what its callers give it is read only if the module publishes
 *          it.
 *
 *          What stays INVISIBLE, and fails nothing: a key handed to t(),
 *          an i18n or a data-i18n* value by an unmarked `let` given
 *          anything but literals (above), by a call the reader does not
 *          follow or by a computed string (only the
 *          key positions of the table, and a translator handed as a
 *          callback, are held to the rule per call); a translator under
 *          another name than t / tr that no const or import makes an
 *          alias of (a parameter `translate`, a `let` alias,
 *          `i18next.getFixedT()`), or called by what is no name of it --
 *          `(0, t)(k)`, `[t][0](k)`, `Reflect.apply(t, x, [k])`,
 *          `Function.prototype.call.call(t, x, k)`, a computed name the
 *          reader does not follow to one string --; a key in a spread of
 *          what is no array the source writes out (`t(...args)`); a
 *          parameter a closure returns (`const inner = () => key;
 *          t(inner())`: the search for the functions that forward a key
 *          does not see it); a translator
 *          handed to a function (`{t: t}`, `yui_tabulator_lang(t)`: it
 *          calls it with keys of its own), or to any method but those
 *          above (`keys.reduce(t)`, `keys.sort(t)`, an alias of a method,
 *          `Reflect.apply(Array.prototype.map, keys, [t])`); a translated
 *          text held in a `let`, marked or not (`let label = t(k); ...
 *          label`: the reader reads the literals of a `let`, not what it
 *          translates), or returned by a function (`{i18n:
 *          label_of(x)}`); a key function reached through a parameter, a
 *          `let` given more than one value, a computed member named by
 *          no const (`API[name](...)`); a data-i18n* attribute written
 *          through an alias of `dataset`, by Object.assign() into it, or
 *          named by a `let`; an export of a `let`; a published list mutated through a
 *          function it is handed to, or by
 *          `Array.prototype.push.call(X_I18N_KEYS, k)`; a module of a
 *          package (gobj-js, i18next); what is written into a const table
 *          after its declaration; a window's `title` given as an attr at
 *          gobj_create().
 *
 *          Where the reader GIVES UP on a value it says so, with the file
 *          and the line of the READ (and the place it went past), and
 *          that fails: a value read through more than MAX_DEPTH (24)
 *          steps -- each const, alias, call, property, element and branch
 *          of ?: / || / ?? is one --, a const that leads back to itself,
 *          an expression that can take more than MAX_VALUES (10000)
 *          values -- a key behind it would go unasked. Up to 7.26.42 it
 *          stopped there in silence, and a chain of consts that doubles at
 *          every link died with a RangeError naming no file. A const is
 *          read once, wherever it is read, and keeps the steps it took, so
 *          the verdict does not depend on what was read first. A chain of
 *          aliases of a function or of a published list is followed to its
 *          end, and is a give-up only when a translator, a key function or
 *          a list can be there.

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
 *          but code --, in a PROCESS OF ITS OWN that reports what it exports
 *          (import_locales()): whatever a locale does there, the run, which
 *          executes no code of the app, ends with its own verdict. It is
 *          imported directly, not through locales.js, which
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
import {spawnSync} from "child_process";
import {randomBytes} from "crypto";
import {resolve, relative} from "path";
import {pathToFileURL, fileURLToPath} from "url";
import {I18N_KEY_FUNCTIONS} from "../src/i18n_key_functions.js";

const ASCII_RE = /^[\x20-\x7e]+$/;
const LOCALE_FILE_RE = /^([a-z]{2,3}(?:[-_][a-zA-Z]{2,4})?)\.js$/;
const PLURAL_RE = /^(.+?)(_ordinal)?_(zero|one|two|few|many|other)$/;
const PUBLISHED_LIST_RE = /_I18N_KEYS$/i;
const DATA_I18N_ATTR_RE = /^data-i18n(?:-title|-aria-label|-placeholder)?$/;
const DATA_I18N_MARKUP_RE = /data-i18n(?:-title|-aria-label|-placeholder)?=["']([^"']+)["']/g;
/*  `el.dataset.i18nTitle` is the attribute data-i18n-title  */
const DATASET_I18N_RE = /^i18n(?:Title|AriaLabel|Placeholder)?$/;

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
 *  A fatal problem of the setup, not a violation: said, exit 1. It
 *  ends the run by throwing Abort (caught where the script runs main()),
 *  never by process.exit(): what was written before it to a pipe may
 *  still be on its way, and process.exit() drops it.
 ***************************************************************/
class Abort extends Error
{
}

function abort(msg)
{
    process.stderr.write(`validate-locales: ${msg}\n`);
    process.exitCode = 1;
    throw new Abort(msg);
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
    /*  Nothing was said before: exit at once, the module cannot load  */
    process.stderr.write(`validate-locales: cannot load acorn (${e.message}): it is a dependency of ` +
                         `@yuneta/gobj-ui, so the install is incomplete: run npm install\n`);
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
function load_locales(locales_dir)
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

    /*  Parsed first, never trusted to the import: a syntax error is
     *  a broken file, not "a helper that needs a browser".  */
    let parsed = new Map();     // code -> what it looks like ("" if not a locale), or an Error
    for(let code of codes) {
        try {
            let ast = parse_source(readFileSync(new URL(`${code}.js`, locales_dir), "utf8"));
            parsed.set(code, looks_like_a_locale(ast, locale_export_names(code)));
        } catch(e) {
            parsed.set(code, e);
        }
    }
    let loaded = import_locales(locales_dir, codes.filter((code) => !(parsed.get(code) instanceof Error)));

    let locales = {};
    let names = new Set();
    for(let code of codes) {
        let looks = parsed.get(code);
        if(looks instanceof Error) {
            fail(`${code}.js cannot be parsed (${looks.message}): its language is NOT validated`);
            continue;
        }
        let got = loaded[code];
        if(got.error !== undefined) {
            if(looks) {
                fail(`${code}.js ${looks} and cannot be loaded (${got.error}): ` +
                     `its language is NOT validated`);
            } else {
                /*  A helper that happens to have a locale's name (app.js),
                 *  and needs a browser to load: said and skipped  */
                note(`${code}.js cannot be loaded here (${got.error}): not a locale, skipped`);
            }
            continue;
        }
        if(!got.keys) {
            if(looks) {
                fail(`${code}.js ${looks} but exports no {${code}} with a translation dict: ` +
                     `its language is NOT validated`);
            } else {
                note(`${code}.js exports no {${code}} with a translation dict: not a locale, skipped`);
            }
            continue;
        }
        locales[code] = Object.fromEntries(got.keys.map((k) => [k, true]));
        if(got.name) {
            names.add(got.name);     // its endonym: a literal of a language menu
        }
    }
    if(Object.keys(locales).length === 0) {
        abort(`no locale (<code>.js exporting {<code>: {translation}}) in ${locales_dir.pathname}`);
    }
    return {locales, names};
}

/***************************************************************
 *  What the locale files `codes` export, read in a PROCESS OF THEIR
 *  OWN: a locale is imported, so its code runs, and whatever it does
 *  -- process.exit() or process.reallyExit() at its top or in a
 *  timer, an exit handler that sets process.exitCode, a timer that
 *  throws -- stays in that process, which reports what the files
 *  export and ends before any timer of theirs is due after it. Up
 *  to gobj-ui 7.26.50 they were imported into the run itself, and an
 *  exit handler of a locale (`process.exitCode = 0`, a
 *  `reallyExit(0)`), a `reallyExit(0)` at its top or the exit
 *  handlers removed turned a failing run into exit code 0, and a
 *  timer's exit cut short a list written to a pipe.
 *
 *  Returns {code: {keys, name} | {none: true} | {error}}. A
 *  promise rejected or an exception thrown with nothing to catch it,
 *  in the locales' process, is a violation; that process ending
 *  before its report, or not reporting in LOCALES_TIMEOUT_MS, aborts
 *  the run: no language could be checked.
 *
 *  The report must carry a nonce the process reads on its stdin
 *  before it imports any locale, so a report a locale writes to the
 *  channel itself is refused (up to gobj-ui 7.26.54 it was the
 *  verdict). This stops accidents and the shapes named here, not
 *  deliberate malice: a locale is the app's own code, and the
 *  process is no sandbox.
 ***************************************************************/
const LOCALES_TIMEOUT_MS = 60000;

function import_locales(locales_dir, codes)
{
    let request = JSON.stringify({
        dir: locales_dir.href,
        codes: codes.map((code) => [code, locale_export_names(code)])
    });
    let nonce = randomBytes(16).toString("hex");
    let r = spawnSync(process.execPath,
        [...process.execArgv, "-e", `(${report_locales.toString()})(${request});`], {
            input: nonce,
            stdio: ["pipe", "inherit", "inherit", "pipe"],
            timeout: LOCALES_TIMEOUT_MS,
            killSignal: "SIGKILL",
            maxBuffer: 1 << 30
        });
    const AT = "the locales are imported in a process of their own, and it";
    const WHY = "a locale is imported, so its code runs: it must not end the process, and its loading must end";
    if(r.error && r.error.code === "ETIMEDOUT") {
        abort(`${AT} did not report in ${LOCALES_TIMEOUT_MS / 1000} s: ${WHY} (a loop, or a top-level ` +
              `await that never settles while a timer runs, holds it)`);
    }
    if(r.error) {
        abort(`${AT} could not run: ${r.error.message}`);
    }
    let text = r.output[3]? r.output[3].toString("utf8") : "";
    let report = null;
    if(text.endsWith("\n")) {
        try {
            report = JSON.parse(text);
        } catch(e) {
            report = null;
        }
    }
    if(r.status !== 0 || !report || report.nonce !== nonce ||
            typeof report.locales !== "object" || !Array.isArray(report.problems)) {
        let how = r.signal? `killed by ${r.signal}` : `exit code ${r.status}`;
        abort(`${AT} ended (${how}) before it reported what they export` +
              `${text? ", or reported what is not its report" : ""}: ${WHY} (a top-level await that ` +
              `never settles ends it too)`);
    }
    for(let problem of report.problems) {
        fail(`${problem} (a locale is imported, so its code runs)`);
    }
    for(let code of codes) {
        if(!report.locales[code]) {
            abort(`the locales' process reported nothing of ${code}.js`);
        }
    }
    return report.locales;
}

/***************************************************************
 *  The code of the locales' process (import_locales()), run there
 *  from its text: it can use nothing of this module but its
 *  argument and the nonce on its stdin. What it calls after the
 *  locales ran is taken BEFORE them, so a locale that replaces
 *  process.reallyExit or JSON.stringify does not reach the report,
 *  and the report is written by hand from strings (JSON.stringify of
 *  a primitive string reads no toJSON): a toJSON a locale puts on
 *  Object.prototype or Array.prototype is never called. It reports after a
 *  timer of 0 and an immediate: a promise a locale rejects in such
 *  a timer, with nothing to handle it, is told first. Its own end is
 *  process.reallyExit(0): no exit handler of a locale runs, and a
 *  timer of a locale due later never does.
 ***************************************************************/
async function report_locales(request)
{
    const {writeSync, readFileSync} = await import("node:fs");
    const nonce = readFileSync(0, "utf8");
    const really_exit = process.reallyExit.bind(process);
    const stringify = JSON.stringify;
    const keys_of = Object.keys;
    const set_timeout = setTimeout;
    const set_immediate = setImmediate;
    const buffer_from = Buffer.from.bind(Buffer);
    const define = Object.defineProperty;
    const has_own = Object.hasOwn;
    const problems = [];
    const add_problem = (text) => {
        define(problems, problems.length, {value: String(text), enumerable: true});
    };
    const list_text = (list) => {
        let text = "[";
        for(let i = 0; i < list.length; i++) {
            text += (i? "," : "") + stringify(String(list[i]));
        }
        return text + "]";
    };
    process.on("unhandledRejection", (reason) => {
        add_problem(`a promise was rejected and nothing handled it: ${(reason && reason.stack) || reason}`);
    });
    process.on("uncaughtException", (e) => {
        add_problem(`an exception was thrown and nothing caught it: ${(e && e.stack) || e}`);
    });
    const locales = {};
    const set_locale = (code, value) => {
        define(locales, code, {value, enumerable: true});
    };
    for(let c = 0; c < request.codes.length; c++) {
        const code = request.codes[c][0];
        const names = request.codes[c][1];
        try {
            const mod = await import(new URL(`${code}.js`, request.dir).href);
            let locale = null;
            for(let n = 0; n < names.length; n++) {
                if(mod[names[n]]) {
                    locale = mod[names[n]];
                    break;
                }
            }
            locale = locale || mod.default;
            if(!locale || !locale.translation || typeof locale.translation !== "object") {
                set_locale(code, {none: true});
            } else {
                set_locale(code, {
                    keys: keys_of(locale.translation),
                    name: (typeof locale.name === "string" && locale.name)? locale.name : null
                });
            }
        } catch(e) {
            set_locale(code, {error: String((e && e.message) || e)});
        }
    }
    set_timeout(() => {
        set_immediate(() => {
            let text = `{"nonce":${stringify(nonce)},"problems":${list_text(problems)},"locales":{`;
            for(let i = 0; i < request.codes.length; i++) {
                const code = request.codes[i][0];
                const one = locales[code];
                text += (i? "," : "") + stringify(code) + ":" + (
                    has_own(one, "none")? `{"none":true}` :
                    has_own(one, "error")? `{"error":${stringify(one.error)}}` :
                    `{"keys":${list_text(one.keys)},"name":${one.name === null? "null" : stringify(one.name)}}`
                );
            }
            const buf = buffer_from(text + "}}\n", "utf8");
            let done = 0;
            while(done < buf.length) {
                done += writeSync(3, buf, done, buf.length - done);
            }
            really_exit(0);
        });
    }, 0);
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
    let {locales, names} = load_locales(opts.locales);
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
        /*  exitCode, not process.exit(): a long list written to a pipe is
         *  still on its way, and up to gobj-ui 7.26.44 it was cut short  */
        process.stderr.write(`validate-locales: ${errors} violation(s), see above\n`);
        process.exitCode = 1;
        return;
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
 *  walk() never visits them. `url` is the file it was read from
 *  (a URL or its href): with it, an import of the file is followed
 *  into the module it names (module_url()).
 ***************************************************************/
const PROGRAM_URL = new WeakMap();      // a parsed file -> the URL it was read from

function parse_source(code, url = null)
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
    if(url) {
        PROGRAM_URL.set(ast, (url instanceof URL)? url : new URL(url));
    }
    return ast;
}

/***************************************************************
 *  The URL of a parsed file. One parsed without it (a test's
 *  fixture) is a module of the library when `lib_module` names it:
 *  its imports of siblings resolve there.
 ***************************************************************/
function program_url(ast, lib_module = null)
{
    if(!PROGRAM_URL.has(ast) && lib_module) {
        PROGRAM_URL.set(ast, new URL(lib_module, LIB_SRC));
    }
    return PROGRAM_URL.get(ast) || null;
}

/***************************************************************
 *  A module of the disk, parsed once: the scan and the reader that
 *  follows an import share it. null when it cannot be read or
 *  parsed (the scan reports that itself).
 ***************************************************************/
const AST_CACHE = new Map();        // url.href -> ast | null

function load_ast(url)
{
    if(AST_CACHE.has(url.href)) {
        return AST_CACHE.get(url.href);
    }
    let ast = null;
    try {
        ast = parse_source(readFileSync(url, "utf8"), url);
    } catch(e) {
        ast = null;
    }
    AST_CACHE.set(url.href, ast);
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

/*  The array methods whose callback receives each ELEMENT first (up to
 *  7.26.41 without findIndex and findLastIndex)  */
const ITERATION_METHODS = new Set([
    "map", "flatMap", "forEach", "filter", "find", "findIndex", "findLast", "findLastIndex", "some", "every"
]);

/*  The builders of an array that hand their callback each element:
 *  Array.from(items, cb), Array.fromAsync(items, cb)  */
const ARRAY_BUILDERS = new Set(["from", "fromAsync"]);

/***************************************************************
 *  A call that hands each ELEMENT of an array to a callback, in the
 *  forms the reader reads -- for a method of ITERATION_METHODS:
 *
 *      items.map(cb)                   also `items?.map(cb)`, `items["map"](cb)`
 *      X.map.call(items, cb)           `Array.prototype.map.call(...)`, `[].map.call(...)`
 *      X.map.apply(items, [cb])
 *      Array.from(items, cb)           and Array.fromAsync(items, cb)
 *
 *      -> {method, receiver, callback, form} | null
 *
 *  `receiver` is the array walked, `callback` what it is handed (a
 *  function, a translator), `form` "" for a plain call, "call",
 *  "apply" or "from". `scope` is the chain of ancestors of the call:
 *  `Array` must be the global. Any other way to reach the method --
 *  an alias of it, Reflect.apply(), a computed name -- is not read.
 ***************************************************************/
function iteration_call(call, scope)
{
    let unchain = (x) => (x && x.type === "ChainExpression")? x.expression : x;
    let c = unchain(call.callee);
    if(c.type !== "MemberExpression") {
        return null;
    }
    let name = member_name(c, scope);
    if(ITERATION_METHODS.has(name)) {
        let cb = call.arguments[0];
        return (cb && cb.type !== "SpreadElement")? {method: name, receiver: c.object, callback: cb, form: ""} : null;
    }
    if(name === "call" || name === "apply") {
        let inner = unchain(c.object);
        let method = (inner.type === "MemberExpression")? member_name(inner, scope) : null;
        if(!ITERATION_METHODS.has(method)) {
            return null;
        }
        let [receiver, rest] = written_args(call.arguments, scope);
        let listed = (name === "apply" && rest && rest.type !== "SpreadElement")? written_elements(rest, scope) : null;
        let cb = (name === "call")? rest : (listed? listed[0] : null);
        if(!receiver || receiver.type === "SpreadElement" || !cb || cb.type === "SpreadElement") {
            return null;
        }
        return {method, receiver, callback: cb, form: name};
    }
    if(ARRAY_BUILDERS.has(name) && c.object.type === "Identifier" && c.object.name === "Array"
            && call.arguments.length >= 2 && binding_of("Array", scope) === null) {
        let [items, cb] = call.arguments;
        if(items.type === "SpreadElement" || cb.type === "SpreadElement") {
            return null;
        }
        return {method: `Array.${name}`, receiver: items, callback: cb, form: "from"};
    }
    return null;
}

/***************************************************************
 *  The iteration call (iteration_call()) a function is the CALLBACK
 *  of, when `scope[i]` is that function: {receiver, scope}, `scope`
 *  the chain of ancestors of the call, where `receiver` is read; or
 *  null
 ***************************************************************/
function iteration_callback_of(fn, scope, i)
{
    let k = i - 1;
    if(scope[k] && scope[k].type === "ArrayExpression") {
        k--;        // `.apply(items, [cb])`
    }
    let call = scope[k];
    if(!call || call.type !== "CallExpression") {
        return null;
    }
    let it = iteration_call(call, scope.slice(0, k));
    return (it && it.callback === fn)? {receiver: it.receiver, scope: scope.slice(0, k)} : null;
}

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
 *  with the declarators of a `var` and, for one declared by a
 *  destructuring, what the pattern reads (`var {title} = opts`:
 *  the pick of `title`, param_path()); null when a pattern the
 *  reader cannot follow declares it (an array pattern). Cached: a
 *  module asks for them once per name it reads.
 *
 *      -> Map(name -> {declarators: [VariableDeclarator],
 *                      picks: Map(declarator -> {steps, default})} | null)
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
    if(fn.body && fn.body.type === "BlockStatement") {
        hoisted_vars(fn.body.body, names);
    }
    FN_NAMES.set(fn, names);
    return names;
}

/***************************************************************
 *  The `var`s a list of statements declares, hoisted to the body
 *  they are in -- a function's, the module's, or a class's static
 *  block's: wherever they stand in it (a block, an `if`, a `switch`
 *  case, a `for(;;)` init, a for...of / for...in head), not inside a
 *  function or a static block nested in it, which have their own.
 *  Into `names`, in the form of function_scope_names().
 ***************************************************************/
function hoisted_vars(statements, names = new Map())
{
    let visit = (n) => {
        if(!n || typeof n.type !== "string" || FUNCTION_RE.test(n.type) || n.type === "StaticBlock") {
            return;
        }
        if(n.type === "VariableDeclaration" && n.kind === "var") {
            for(let d of n.declarations) {
                for(let name of pattern_names(d.id)) {
                    let plain = (d.id.type === "Identifier");
                    let at = plain? null : param_path(d.id, name);
                    let had = names.has(name)? names.get(name) : {declarators: [], picks: new Map()};
                    if(!had || (!plain && !at)) {
                        names.set(name, null);
                        continue;
                    }
                    if(at) {
                        had.picks.set(d, {steps: at.steps, default: at.default});
                    }
                    names.set(name, {declarators: [...had.declarators, d], picks: had.picks});
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
    for(let s of statements) {
        visit(s);
    }
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
 *  it: name -> {kind: "const", init, steps, default} |
 *  {kind: "each", of} | {kind: "each_part", of} | {kind: "var",
 *  declarators, picks} (a `let`; a `var` belongs to its function, or
 *  here to the module, wherever it stands in it: hoisted_vars()) |
 *  {kind: "other", init}. A name declared by a destructuring reads
 *  `steps` from the value (`const {title} = opts`: `.title`; `picks`
 *  per declarator for a `let`); one an array pattern declares is
 *  "other" (its `init`, for param_flows()), and an element of a
 *  for...of that an array pattern destructures is "each_part".
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
        if(!names.has(name)) {
            names.set(name, what);
        }
    };
    if((a.type === "Program" && has_var(a)) || a.type === "StaticBlock") {
        /*  Every `var` of the module (or of a class's static block, which has
         *  its own), one binding per name: up to 7.26.41 only those of the
         *  module's top-level statements, so a `var` redeclared in a block or
         *  in a loop head gave the variable a value the reader never saw, and
         *  a `var` of a static block was not seen at all  */
        for(let [name, h] of hoisted_vars(a.body)) {
            declare(name, h? {kind: "var", decl: "var", declarators: h.declarators, picks: h.picks}
                           : {kind: "other", init: null});
        }
    }
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
                        let at = (a.type === "ForOfStatement")? param_path(d.id, name, [], null, true) : null;
                        declare(name, at? {kind: "each", of: a.right, steps: at.steps, default: at.default} :
                                      {kind: "each_part", of: a.right});
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
            if(d.kind === "var") {
                continue;       // hoisted: its function's, module's or static block's hoisted_vars() holds it
            }
            for(let v of d.declarations) {
                let plain = (v.id.type === "Identifier");
                for(let name of pattern_names(v.id)) {
                    let at = plain? {steps: [], default: null} : param_path(v.id, name, [], null, d.kind === "const");
                    let what = {kind: "other", init: v.init || null};
                    if(at && d.kind === "const" && v.init) {
                        what = {kind: "const", init: v.init, steps: at.steps, default: at.default, name};
                    } else if(at && d.kind !== "const") {
                        let picks = new Map();
                        if(!plain) {
                            picks.set(v, {steps: at.steps, default: at.default});
                        }
                        what = {kind: "var", decl: d.kind, declarators: [v], picks};
                    }
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
 *  value written for it when there is none. A rest element of an
 *  object pattern holds the other properties of the object: it
 *  reads what the object does. null when an array pattern, the rest
 *  of an array or a computed key stands on the way.
 *
 *      function f(msg = "fallback")        msg: {path: "", default: "fallback"}
 *      function f({title, opts: {label}})  title: ".title", label: ".opts.label"
 *      const {id, ...rest} = opts          rest: "" (rest.title is opts.title)
 ***************************************************************/
function param_path(p, name, steps = [], dflt = null, arrays = false)
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
            return param_path(p.left, name, steps, p.right, arrays);
        case "ObjectPattern":
            for(let q of p.properties) {
                if(q.type === "RestElement") {
                    let r = param_path(q.argument, name, steps, null, arrays);
                    if(r) {
                        return r;
                    }
                    continue;
                }
                let key = prop_name(q);
                let target = q.value;
                if(key === null) {
                    if(pattern_names(target).includes(name)) {
                        return null;
                    }
                    continue;
                }
                let r = param_path(target, name, [...steps, {prop: key, computed: false}], null, arrays);
                if(r) {
                    return r;
                }
            }
            return null;
        case "ArrayPattern":
            /*  Only for a const (`arrays`): `const [a, b] = X` reads X[1]
             *  into b. Up to gobj-ui 7.26.48 it was read as nothing.  */
            if(!arrays) {
                return null;
            }
            for(let i = 0; i < p.elements.length; i++) {
                let e = p.elements[i];
                if(!e || !pattern_names(e).includes(name)) {
                    continue;
                }
                if(e.type === "RestElement") {
                    /*  `const [a, ...r] = X`: r is X.slice(1). Up to gobj-ui 7.26.50 read as nothing.  */
                    return param_path(e.argument, name, [...steps, {slice: true, from: i, to: "end"}], null, arrays);
                }
                return param_path(e, name, [...steps, {prop: String(i), computed: true}], null, arrays);
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
 *      {kind: "const", init, steps, default, name, scope}
 *                                      a `const` with a value; `scope`
 *                                      is the chain down to the block
 *                                      that declares it, where its
 *                                      value is read; `steps` what a
 *                                      destructuring reads from the
 *                                      value (`const {title} = opts`),
 *                                      `default` the value written for
 *                                      it there
 *      {kind: "each", of, steps, scope}
 *                                      an ELEMENT of `of`: the first
 *                                      parameter of a callback of
 *                                      `of.map()`, `.forEach()`, ...,
 *                                      or the variable of a for...of;
 *                                      `steps`, the properties read
 *                                      from it by a destructuring
 *      {kind: "each_part", of, scope}  part of an element of `of`
 *                                      that an array pattern
 *                                      destructures:
 *                                      `Object.entries(o).forEach(([k, v]) => ...)`
 *      {kind: "param", fn, name, index, path, default, rest, scope}
 *                                      parameter `index` of the
 *                                      function `fn`, called `name`;
 *                                      `path` what a destructuring
 *                                      reads from it ("" or
 *                                      ".title"), `default` the
 *                                      value written for it when the
 *                                      caller gives none; `rest`: a
 *                                      rest parameter, the array of
 *                                      the arguments from `index` on
 *      {kind: "param_part", fn, name, index, scope}
 *                                      part of parameter `index` that
 *                                      an array pattern destructures:
 *                                      no position can name it
 *      {kind: "var", decl, name, declarators, picks, scope}
 *                                      a `let` or `var` (`decl` says
 *                                      which): what it holds is never
 *                                      followed, except where a marker
 *                                      says what it holds
 *                                      (var_leaves()); `scope` is the
 *                                      chain down to the node that
 *                                      declares it; `picks`, what a
 *                                      destructuring declarator reads
 *      {kind: "function", fn, scope}   a function declaration
 *      {kind: "import", source, imported, scope}
 *                                      an import: from module
 *                                      `source`, its name there
 *                                      (or "default", "*")
 *      {kind: "other", init, scope}    anything else: a class, a
 *                                      name an array pattern declares
 *                                      (`init`, what it destructures),
 *                                      a catch parameter
 *      null                            declared nowhere: a global
 ***************************************************************/
const FN_PARAMS = new WeakMap();     // a function -> Map(name -> index of the parameter that declares it)

function params_of(fn)
{
    let m = FN_PARAMS.get(fn);
    if(!m) {
        m = new Map();
        for(let j = 0; j < fn.params.length; j++) {
            for(let n of pattern_names(fn.params[j])) {
                if(!m.has(n)) {
                    m.set(n, j);
                }
            }
        }
        FN_PARAMS.set(fn, m);
    }
    return m;
}

/*  Does a parsed file declare a `var` anywhere? Most declare none, and
 *  then no function body has to be searched for one  */
const HAS_VAR = new WeakMap();

function has_var(program)
{
    if(!program || program.type !== "Program" || typeof program.code !== "string") {
        return true;
    }
    if(!HAS_VAR.has(program)) {
        HAS_VAR.set(program, /\bvar\b/.test(program.code));
    }
    return HAS_VAR.get(program);
}

/*  The nodes that bind names for what is inside them (scope_names())  */
const SCOPE_TYPES = new Set(["Program", "BlockStatement", "StaticBlock", "SwitchStatement", "ForStatement",
                             "ForOfStatement", "ForInStatement", "CatchClause", "ClassExpression"]);
const FUNCTION_TYPES = new Set(["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"]);

function binding_of(name, scope)
{
    let vars = has_var(scope[0]);
    for(let i = scope.length - 1; i >= 0; i--) {
        let a = scope[i];
        if(!FUNCTION_TYPES.has(a.type)) {
            if(!SCOPE_TYPES.has(a.type)) {
                continue;       // an expression, a call, a property: it binds nothing
            }
        } else {
            let parent = scope[i - 1];
            let j = params_of(a).get(name);
            if(j !== undefined) {
                let p = a.params[j];
                let it = (j === 0 && parent && a.type !== "FunctionDeclaration")?
                    iteration_callback_of(a, scope, i) : null;
                /*  An element destructured as an array is read by its index: up to gobj-ui
                 *  7.26.50 `X.map(([a, b]) => t(b))` read nothing  */
                let at = param_path(p, name, [], null, !!it);
                if(it) {
                    return at? {kind: "each", of: it.receiver, steps: at.steps, default: at.default, scope: it.scope}
                             : {kind: "each_part", of: it.receiver, scope: it.scope};
                }
                let base = {fn: a, name: function_name(a, parent), index: j, scope: scope.slice(0, i + 1)};
                if(at) {
                    return Object.assign({kind: "param", path: at.path, default: at.default, rest: false}, base);
                }
                if(p.type === "RestElement" && p.argument.type === "Identifier") {
                    return Object.assign({kind: "param", path: "", default: null, rest: true}, base);
                }
                return Object.assign({kind: "param_part"}, base);
            }
            if(!vars && !(a.type === "FunctionExpression" && a.id && a.id.name === name)) {
                continue;
            }
            let hoisted = function_scope_names(a);
            if(hoisted.has(name)) {
                let h = hoisted.get(name);
                return h? {kind: "var", decl: "var", name, declarators: h.declarators, picks: h.picks,
                           scope: scope.slice(0, i + 1)}
                        : {kind: "other", init: null, scope: scope.slice(0, i + 1)};
            }
            continue;
        }
        let d = scope_names(a).get(name);
        if(!d) {
            continue;
        }
        if(d.kind === "const") {
            return {kind: "const", init: d.init, steps: d.steps || [], default: d.default || null,
                    name: d.name || name, scope: scope.slice(0, i + 1)};
        }
        if(d.kind === "each") {
            return {kind: "each", of: d.of, steps: d.steps || [], default: d.default || null, scope: scope.slice(0, i)};
        }
        if(d.kind === "each_part") {
            return {kind: "each_part", of: d.of, scope: scope.slice(0, i)};
        }
        if(d.kind === "var") {
            return {kind: "var", decl: d.decl, name, declarators: d.declarators, picks: d.picks || new Map(),
                    scope: scope.slice(0, i + 1)};
        }
        if(d.kind === "function") {
            return {kind: "function", fn: d.fn, scope: scope.slice(0, i + 1)};
        }
        if(d.kind === "import") {
            return Object.assign({}, d, {scope: scope.slice(0, i + 1)});
        }
        return {kind: "other", init: d.init || null, scope: scope.slice(0, i + 1)};
    }
    return null;
}

/***************************************************************
 *  The `arguments` of the function a use is in (the nearest one
 *  that is not an arrow: an arrow has none of its own), as a
 *  binding: {kind: "arguments", fn, name, scope}. null outside one.
 ***************************************************************/
function arguments_binding(scope)
{
    for(let i = scope.length - 1; i >= 0; i--) {
        let a = scope[i];
        if(a.type === "FunctionDeclaration" || a.type === "FunctionExpression") {
            return {kind: "arguments", fn: a, name: function_name(a, scope[i - 1]), scope: scope.slice(0, i + 1)};
        }
    }
    return null;
}


                    /***************************
                     *      Modules
                     ***************************/


/***************************************************************
 *  The file an import source names, seen from the file `from` (a
 *  URL): a relative path to a JavaScript file (`./x.js`, `../y.mjs`;
 *  `.js` and `/index.js` tried when it names no file), a module of
 *  this library (`@yuneta/gobj-ui/src/x.js`) or its barrel
 *  (`@yuneta/gobj-ui`). null for anything else -- a package
 *  (i18next, gobj-js), a stylesheet, a json --: the reader does not
 *  read it.
 ***************************************************************/
const MODULE_URLS = new Map();      // "<from>\n<source>" -> URL | null

function module_url(from, source)
{
    if(typeof source !== "string") {
        return null;
    }
    let m = source.match(/^@yuneta\/gobj-ui\/src\/([\w.-]+\.js)$/);
    if(m) {
        return new URL(m[1], LIB_SRC);
    }
    if(/^@yuneta\/gobj-ui(?:\/index\.js)?$/.test(source)) {
        return LIB_INDEX;
    }
    if(!from || !/^\.\.?\//.test(source)) {
        return null;
    }
    let id = `${from.href}\n${source}`;
    if(MODULE_URLS.has(id)) {
        return MODULE_URLS.get(id);
    }
    let found = null;
    for(let candidate of [source, source + ".js", source + "/index.js"]) {
        if(!/\.m?js$/.test(candidate)) {
            continue;       // a stylesheet, a json: no module the reader reads
        }
        let u = new URL(candidate, from);
        try {
            if(statSync(u).isFile()) {
                found = u;
                break;
            }
        } catch(e) {
            continue;
        }
    }
    MODULE_URLS.set(id, found);
    return found;
}

/***************************************************************
 *  What a module exports as `name`, followed through re-exports
 *  (`export {a as b} from "./x.js"`, `export * from`, a local
 *  `export {x}` of an import) into the module that declares it:
 *
 *      {kind: "fn", fn, scope, name, url}
 *                                  a function: a declaration, or a
 *                                  const bound to one (`name`, the
 *                                  one it is declared with)
 *      {kind: "const", init, steps, default, scope, url}
 *                                  a const bound to anything else
 *      {kind: "external", source, imported}
 *                                  an import of a package the
 *                                  reader does not read (i18next's
 *                                  t, a builder of gobj-js)
 *      null                        anything else: a `let`, a class,
 *                                  a name it does not export, a
 *                                  module that cannot be read
 *
 *  `scope` is the chain down to the declaration (the module).
 ***************************************************************/
const EXPORTS = new Map();          // "<url>#<name>" -> what it is

function module_export(url, name, seen = new Set())
{
    let id = `${url.href}#${name}`;
    if(EXPORTS.has(id)) {
        return EXPORTS.get(id);
    }
    if(seen.has(id)) {
        return null;            // a cycle of re-exports
    }
    seen.add(id);
    let ast = load_ast(url);
    let found = ast? find_export(ast, url, name, seen) : null;
    EXPORTS.set(id, found);
    return found;
}

function find_export(ast, url, name, seen)
{
    let local = (local_name) => {
        let b = binding_of(local_name, [ast]);
        return b? declared_value(b, url, seen) : null;
    };
    for(let node of ast.body) {
        if(node.type === "ExportDefaultDeclaration") {
            if(name !== "default") {
                continue;
            }
            let d = node.declaration;
            if(FUNCTION_RE.test(d.type)) {
                return {kind: "fn", fn: d, scope: [ast], name: d.id? d.id.name : "default", url};
            }
            if(d.type === "Identifier") {
                return local(d.name);
            }
            return {kind: "const", init: d, steps: [], default: null, scope: [ast], url};
        }
        if(node.type === "ExportAllDeclaration") {
            if(node.exported) {
                continue;       // `export * as ns from`: a namespace, not a value the reader reads
            }
            let target = module_url(url, node.source.value);
            let r = target? module_export(target, name, seen) : null;
            if(r) {
                return r;
            }
            continue;
        }
        if(node.type !== "ExportNamedDeclaration") {
            continue;
        }
        if(node.declaration) {
            let decl = node.declaration;
            if(decl.type === "FunctionDeclaration" && decl.id && decl.id.name === name) {
                return local(name);
            }
            if(decl.type === "VariableDeclaration" && decl.declarations.some((d) => pattern_names(d.id).includes(name))) {
                return local(name);
            }
            continue;
        }
        for(let spec of node.specifiers) {
            let exported = spec.exported.name || spec.exported.value;
            if(exported !== name) {
                continue;
            }
            let inner = spec.local.name || spec.local.value;
            if(!node.source) {
                return local(inner);
            }
            let target = module_url(url, node.source.value);
            if(!target) {
                return {kind: "external", source: node.source.value, imported: inner};
            }
            return module_export(target, inner, seen);
        }
    }
    return null;
}

/***************************************************************
 *  What a binding of a module's top level holds, for
 *  module_export(): a function, a const, or an import followed
 *  into its own module
 ***************************************************************/
function declared_value(b, url, seen)
{
    if(b.kind === "function") {
        return {kind: "fn", fn: b.fn, scope: b.scope, name: b.fn.id.name, url};
    }
    if(b.kind === "const") {
        if(b.steps.length === 0 && FUNCTION_RE.test(b.init.type)) {
            return {kind: "fn", fn: b.init, scope: b.scope, name: b.name, url};
        }
        return {kind: "const", init: b.init, steps: b.steps, default: b.default, scope: b.scope, url, name: b.name};
    }
    if(b.kind === "import") {
        return import_target(b, seen);
    }
    return null;
}

/***************************************************************
 *  What an import binding names (binding_of(): {kind: "import"}),
 *  as module_export() says it; a namespace (`import * as ns`) is
 *  {kind: "namespace", url}
 ***************************************************************/
function import_target(b, seen = new Set())
{
    let from = (b.scope && b.scope.length > 0)? (PROGRAM_URL.get(b.scope[0]) || null) : null;
    let url = module_url(from, b.source);
    if(!url) {
        return {kind: "external", source: b.source, imported: b.imported};
    }
    if(b.imported === "*") {
        return {kind: "namespace", url};
    }
    return module_export(url, b.imported, seen);
}

/***************************************************************
 *  The module of this library a URL is (its name in src/), or null
 ***************************************************************/
function lib_module_of(url)
{
    if(!url || !url.href.startsWith(LIB_SRC.href)) {
        return null;
    }
    let rest = url.href.slice(LIB_SRC.href.length);
    return /^[\w.-]+\.js$/.test(rest)? rest : null;
}

/*  The file a chain of ancestors is in (its first node, the module)  */
function url_of(scope)
{
    return (scope && scope.length > 0)? (PROGRAM_URL.get(scope[0]) || null) : null;
}


                    /***************************
                     *      What a call calls
                     ***************************/


/*  The names a translator goes by: i18next's t(), and the tr() an
 *  app or a module wraps it in  */
const TRANSLATOR_NAMES = new Set(["t", "tr"]);
const TRANSLATOR = Object.freeze({kind: "t", name: "t"});

/***************************************************************
 *  What a callee IS, as far as the source says it:
 *
 *      {kind: "t"}                 a TRANSLATOR: a name `t` or `tr`
 *                                  that binds no function the reader
 *                                  reads (a parameter, a `let`, a
 *                                  global), a member `.t` / `.tr`
 *                                  (`i18next.t`, `opts.t`), i18next's
 *                                  `t` imported under any name
 *                                  (`import {t as tt} from "i18next"`),
 *                                  or an alias of one of those: a
 *                                  const (`const translate = t`), a
 *                                  `.bind()` (`i18next.t.bind(i18next)`),
 *                                  a re-export of a module the reader
 *                                  reads. A `.bind()` that binds
 *                                  arguments too (`t.bind(null, k)`)
 *                                  adds `bound`, how many (and
 *                                  `bound_spread` when a spread hides
 *                                  it), to whatever it binds:
 *                                  call_target() counts them
 *      {kind: "fn", fn, scope, name, url}
 *                                  a FUNCTION the reader reads: a
 *                                  declaration, a const bound to one
 *                                  (or a `let` given nothing else), an
 *                                  import of one followed into the
 *                                  module that declares it, a member of
 *                                  a namespace import, a property of a
 *                                  const object literal holding one, or
 *                                  an alias of one of those. `name` is
 *                                  the one it is DECLARED with (the
 *                                  table's), `url` the file that
 *                                  declares it
 *      null                        anything else: a parameter or a
 *                                  `let` of another name, a method of
 *                                  an object, a function of a package
 *                                  the reader does not read
 ***************************************************************/
function callee_of(node, scope)
{
    return from_read(node, scope, () => {
        let far = {past: null, lost: null, seen: new Set()};
        let r = callee_at(node, scope, 0, far);
        if(far.lost) {
            give_up(far.lost.node, far.lost.scope, far.lost.why);
            return null;
        }
        if(far.past && may_translate(r)) {
            give_up(far.past.node, far.past.scope, GIVE_UP_DEEP);
            return null;
        }
        return r;
    });
}

/*  Can a callee (callee_of()) be a translator, or a key function of a
 *  table -- a function of the library?  */
function may_translate(r)
{
    return !!r && (r.kind === "t" || TRANSLATOR_NAMES.has(r.name) || lib_module_of(r.url) !== null);
}

/*  callee_of() `depth` steps down: past MAX_DEPTH it goes on, to see
 *  what the chain ends in (`far.past`: where it went past); past
 *  MAX_FOLLOW, or round a cycle, the end is not known (`far.lost`)  */
function callee_at(node, scope, depth, far)
{
    if(!node) {
        return null;
    }
    if(depth > MAX_DEPTH && !far.past) {
        far.past = {node, scope};
    }
    if(depth > MAX_FOLLOW) {
        far.lost = far.lost || {node, scope, why: GIVE_UP_DEEP};
        return null;
    }
    switch(node.type) {
        case "ChainExpression":
            return callee_at(node.expression, scope, depth + 1, far);

        case "Identifier": {
            let named = TRANSLATOR_NAMES.has(node.name)? TRANSLATOR : null;
            let b = binding_of(node.name, scope);
            if(!b) {
                return named;
            }
            switch(b.kind) {
                case "function":
                    return {kind: "fn", fn: b.fn, scope: b.scope, name: b.fn.id.name, url: url_of(b.scope)};
                case "const":
                    if(b.steps.length > 0) {
                        /*  `const {t: tt} = i18next` is `i18next.t`: a member `.t`  */
                        return TRANSLATOR_NAMES.has(b.steps[b.steps.length - 1].prop)? TRANSLATOR : named;
                    }
                    if(FUNCTION_RE.test(b.init.type)) {
                        return {kind: "fn", fn: b.init, scope: b.scope, name: b.name, url: url_of(b.scope)};
                    }
                    if(far.seen.has(b.init)) {
                        far.lost = far.lost || {node: b.init, scope: b.scope, why: GIVE_UP_CYCLE};
                        return null;
                    }
                    far.seen.add(b.init);
                    let r = callee_at(b.init, b.scope, depth + 1, far);
                    far.seen.delete(b.init);
                    return r || named;
                case "var": {
                    let fn = var_function(b);
                    return fn? {kind: "fn", fn, scope: b.scope, name: b.name, url: url_of(b.scope)} : named;
                }
                case "import":
                    return exported_callee(import_target(b), depth, far) || named;
                case "param":
                    /*  `function f({t: tt})` is `opts.t`, the same member  */
                    return /\.(?:t|tr)$/.test(b.path)? TRANSLATOR : named;
                default:
                    return named;
            }
        }

        case "MemberExpression": {
            let step = {prop: member_name(node, scope), computed: !!node.computed};
            if(step.prop === null) {
                return null;
            }
            if(node.object.type === "Identifier") {
                let b = binding_of(node.object.name, scope);
                let map = null;     // a const object literal the object is: {init, scope}
                if(b && b.kind === "import" && b.imported === "*") {
                    let ns = import_target(b);
                    if(ns && ns.kind === "namespace") {
                        let r = exported_callee(module_export(ns.url, step.prop), depth, far);
                        if(r) {
                            return r;
                        }
                    }
                } else if(b && b.kind === "import") {
                    let x = import_target(b);
                    if(x && x.kind === "const" && x.steps.length === 0 && x.init.type === "ObjectExpression") {
                        map = {init: x.init, scope: x.scope};
                    }
                } else if(b && b.kind === "const" && b.steps.length === 0 && b.init.type === "ObjectExpression") {
                    map = {init: b.init, scope: b.scope};
                }
                if(map) {
                    /*  A map: `const API = {info: yui_shell_show_info}; API.info(...)`  */
                    let p = map.init.properties.find((q) => q.type === "Property" && prop_name(q) === step.prop
                                                         && q.kind === "init" && !q.computed);
                    if(p) {
                        let r = callee_at(p.value, [...map.scope, map.init, p], depth + 1, far);
                        if(r) {
                            return r;
                        }
                    }
                }
            }
            return TRANSLATOR_NAMES.has(step.prop)? TRANSLATOR : null;
        }

        case "CallExpression": {
            /*  f.bind(x) is f; f.bind(x, a, ...) is f with its first arguments
             *  BOUND, so what a call of it is handed comes after them  */
            let c = node.callee;
            if(c.type !== "MemberExpression" || member_name(c, scope) !== "bind") {
                return null;
            }
            let inner = callee_at(c.object, scope, depth + 1, far);
            let given = written_args(node.arguments, scope);
            let hidden = is_spread(given[0]);     // `f.bind(...X)`: what it binds is not known
            let taken = given.slice(1);
            if(!inner || (taken.length === 0 && !hidden)) {
                return inner;
            }
            return Object.assign({}, inner, {
                bound: (inner.bound || 0) + taken.length,
                bound_spread: !!inner.bound_spread || hidden || taken.some(is_spread)
            });
        }

        default:
            return null;
    }
}

/***************************************************************
 *  What an export (module_export()) is as a callee: a function, the
 *  i18next `t`, or a const that is an alias of one
 ***************************************************************/
function exported_callee(x, depth, far)
{
    if(!x) {
        return null;
    }
    if(x.kind === "fn") {
        return x;
    }
    if(x.kind === "external") {
        return (x.source === "i18next" && x.imported === "t")? TRANSLATOR : null;
    }
    if(x.kind === "const" && x.steps.length === 0) {
        if(far.seen.has(x.init)) {
            far.lost = far.lost || {node: x.init, scope: x.scope, why: GIVE_UP_CYCLE};
            return null;
        }
        far.seen.add(x.init);
        let r = callee_at(x.init, x.scope, depth + 1, far);
        far.seen.delete(x.init);
        return r;
    }
    return null;
}

/***************************************************************
 *  The function a `let` / `var` holds when it is given one and
 *  nothing else (`let tr = (key) => ...`), or null
 ***************************************************************/
const VAR_FUNCTIONS = new WeakMap();    // a declarator -> the function it holds, or null

function var_function(b)
{
    if(b.declarators.length !== 1 || b.picks.size > 0) {
        return null;
    }
    let d = b.declarators[0];
    if(!d.init || !FUNCTION_RE.test(d.init.type)) {
        return null;
    }
    if(!VAR_FUNCTIONS.has(d)) {
        let {values, unknown} = assigned_values(b);
        VAR_FUNCTIONS.set(d, (values.length === 1 && unknown.length === 0)? d.init : null);
    }
    return VAR_FUNCTIONS.get(d);
}

/***************************************************************
 *  What a call calls (callee_of()), and the arguments the callee
 *  receives: `f(a)` a; `f.call(x, a)` a; `f.apply(x, [a, b])` a and
 *  b (null when `.apply()` hands an array the source does not write
 *  out). A callee with arguments BOUND (`const g = f.bind(x, a)`)
 *  receives those first: they stand as holes (null) before what the
 *  call hands -- a position not read HERE: what a bind binds is read
 *  where the bind is written (bind_kind()) --, and the arguments are
 *  null when a spread hides how many were bound. Cached per call: what
 *  it calls does not change.
 *
 *      -> {target, args} | null
 ***************************************************************/
const CALL_TARGETS = new WeakMap();

function call_target(call, scope)
{
    if(CALL_TARGETS.has(call)) {
        return CALL_TARGETS.get(call);
    }
    let r = null;
    let callee = call.callee;
    let method = (callee.type === "MemberExpression")? member_name(callee, scope) : null;
    if(method === "call" || method === "apply") {
        let inner = callee_of(callee.object, scope);
        if(inner) {
            let given = written_args(call.arguments, scope);
            let hidden = is_spread(given[0]);     // `f.call(...X)`: where its arguments start is not known
            let args = hidden? [given[0]] : given.slice(1);
            if(method === "apply") {
                let list = given[1];
                args = (hidden || is_spread(list))? null : !list? [] : written_elements(list, scope);
            }
            r = {target: inner, args};
        }
    }
    if(!r) {
        let target = callee_of(callee, scope);
        r = target? {target, args: written_args(call.arguments, scope)} : null;
    }
    if(r && r.target.bound) {
        /*  Up to 7.26.41 the bound arguments were not counted: what a call of
         *  `t.bind(null, k)` hands -- i18next's options, its default value -- was
         *  asked for as a key  */
        r = {target: r.target, args: (r.args && !r.target.bound_spread)?
            [...new Array(r.target.bound).fill(null), ...r.args] : null};
    }
    CALL_TARGETS.set(call, r);
    return r;
}

/***************************************************************
 *  A `.bind()` of a key function or of a translator, read as the
 *  call it prepares: `yui_shell_show_info.bind(null, shell, "k")`
 *  hands "k" at position 1 of yui_shell_show_info, `t.bind(null, "k")`
 *  hands t() its key -- where the bind is written, since a call of
 *  what it makes no longer hands those positions (call_target()).
 *  Up to 7.26.42 what a bind binds was not read: a key bound there
 *  went unasked, and a parameter bound there passed the rule per call.
 *
 *      -> {kind: "key", entry, target, args} | {kind: "t", target, args}
 *         | null, `args` the arguments the function receives, the ones
 *         bound before (`f.bind(x, a).bind(y, b)`) as holes, and null
 *         when a spread hides them
 ***************************************************************/
function bind_kind(call, scope, table = I18N_KEY_FUNCTIONS)
{
    let c = call.callee;
    if(c.type !== "MemberExpression" || member_name(c, scope) !== "bind") {
        return null;
    }
    let given = written_args(call.arguments, scope);
    let hidden = is_spread(given[0]);
    if(given.length < 2 && !hidden) {
        return null;
    }
    let inner = callee_of(c.object, scope);
    if(!inner) {
        return null;
    }
    let args = (inner.bound_spread || hidden)? null : [...new Array(inner.bound || 0).fill(null), ...given.slice(1)];
    if(inner.kind === "t") {
        return {kind: "t", target: inner, args};
    }
    let module = lib_module_of(inner.url);
    let fns = module? key_fn_index(table).by_module.get(module) : null;
    let entry = fns? (fns.get(inner.name) || null) : null;
    if(entry) {
        return {kind: "key", entry, target: inner, args};
    }
    if(TRANSLATOR_NAMES.has(inner.name)) {
        return {kind: "t", target: inner, args};
    }
    return null;
}

/***************************************************************
 *  What kind of call a call is, for the reader:
 *
 *      {kind: "key", entry, target, args}
 *                                  a call of a KEY FUNCTION of `table`
 *                                  (I18N_KEY_FUNCTIONS by default): a
 *                                  function the table names in its
 *                                  module, however the call reaches it
 *                                  -- its name, an import under any
 *                                  name, a re-export, an alias, a map,
 *                                  `.call()`, `.apply()`
 *      {kind: "t", target, args}   a call of a TRANSLATOR (callee_of()),
 *                                  or of a function called t or tr that
 *                                  the table does not name
 *      {kind: "fn", target, args}  a call of another function the
 *                                  reader reads
 *      null                        anything else
 ***************************************************************/
function call_kind(call, scope, table = I18N_KEY_FUNCTIONS)
{
    let r = call_target(call, scope);
    if(!r) {
        /*  A name a module of the library does not bind, called in it: its
         *  function of the table (a fixture of a test; real code declares it)  */
        let module = lib_module_of(url_of(scope));
        let fns = module? key_fn_index(table).by_module.get(module) : null;
        let entry = (fns && call.callee.type === "Identifier" && !binding_of(call.callee.name, scope))?
            (fns.get(call.callee.name) || null) : null;
        return entry? {kind: "key", entry, target: {kind: "unbound", name: entry.name},
                       args: written_args(call.arguments, scope)} : null;
    }
    let {target, args} = r;
    if(target.kind === "t") {
        return {kind: "t", target, args};
    }
    let module = lib_module_of(target.url);
    let fns = module? key_fn_index(table).by_module.get(module) : null;
    let entry = fns? (fns.get(target.name) || null) : null;
    if(entry) {
        return {kind: "key", entry, target, args};
    }
    if(TRANSLATOR_NAMES.has(target.name)) {
        return {kind: "t", target, args};
    }
    return {kind: "fn", target, args};
}

/***************************************************************
 *  Is a call one of a translator -- t(), or a function called t or
 *  tr (the library's tr() translate too)? Its value is a
 *  TRANSLATED text, never a key.
 ***************************************************************/
function is_translator_call(n, scope)
{
    while(n && n.type === "ChainExpression") {
        n = n.expression;
    }
    if(!n || n.type !== "CallExpression") {
        return false;
    }
    let c = call_kind(n, scope || []);
    return !!c && (c.kind === "t" || TRANSLATOR_NAMES.has(c.target.name));
}

/***************************************************************
 *  Is a value a TRANSLATED text: a call of a translator
 *  (is_translator_call()), or a string BUILT from one -- a
 *  concatenation or a template holding one (`t("k") + ":"`,
 *  `${t("k")}:`), a method called on one (`t("k").toUpperCase()`,
 *  `[t("a"), name].join(" ")`), String() of one, a branch of
 *  `?:` / `||` / `??` that is one? Its text is a translation: a place
 *  that wants a key and gets it keeps the translation as its key.
 *  A call of any other function is not read into (it may build DOM),
 *  nor is a function.
 ***************************************************************/
function is_translated_text(n, scope, depth = 0)
{
    while(n && n.type === "ChainExpression") {
        n = n.expression;
    }
    if(!n) {
        return false;
    }
    if(READ_AT.length === 0) {
        return from_read(n, scope, () => is_translated_text(n, scope, depth));
    }
    if(depth > MAX_DEPTH) {
        give_up(n, scope, GIVE_UP_DEEP);
        return false;
    }
    let sub = (x) => is_translated_text(x, scope, depth + 1);
    switch(n.type) {
        case "CallExpression": {
            if(is_translator_call(n, scope)) {
                return true;
            }
            let c = (n.callee.type === "ChainExpression")? n.callee.expression : n.callee;
            if(c.type === "MemberExpression") {
                /*  A method of a translated text, or of an array that holds one  */
                let o = c.object;
                if(o.type === "ArrayExpression") {
                    return o.elements.some((e) => !!e && sub((e.type === "SpreadElement")? e.argument : e));
                }
                return sub(o);
            }
            if(c.type === "Identifier" && c.name === "String" && binding_of("String", scope) === null) {
                return n.arguments.length > 0 && sub(n.arguments[0]);
            }
            return false;
        }
        case "BinaryExpression":
            return n.operator === "+" && (sub(n.left) || sub(n.right));
        case "TemplateLiteral":
            return n.expressions.some(sub);
        case "ConditionalExpression":
            return sub(n.consequent) || sub(n.alternate);
        case "LogicalExpression":
            return (n.operator !== "&&" && sub(n.left)) || sub(n.right);
        case "SequenceExpression":
            return sub(n.expressions[n.expressions.length - 1]);
        case "AwaitExpression":
            return sub(n.argument);
        default:
            return false;
    }
}

/*  The methods of a promise, which call a callback with what it settles
 *  with (ITERATION_METHODS call theirs with each element)  */
const SETTLE_METHODS = new Set(["then", "catch"]);

/***************************************************************
 *  A TRANSLATOR handed as a CALLBACK, not called: `keys.map(t)`. The
 *  call it is handed to calls it, and what that call hands it is a
 *  key the source writes nowhere as one:
 *
 *      {how: "elements", method, form, receiver, arg}
 *              each ELEMENT of `receiver` is a key, in every form of
 *              iteration_call(): `keys.map(t)`, `.forEach(t)`,
 *              `.findIndex(t)`, ... (ITERATION_METHODS),
 *              `Array.prototype.map.call(keys, t)`,
 *              `[].forEach.apply(keys, [t])`, `Array.from(keys, t)`,
 *              `Array.fromAsync(keys, t)`
 *      {how: "settled", method, arg}
 *              `promise.then(t)`, `.catch(t)`: what the promise settles
 *              with, which no source writes
 *      null    anything else. A translator handed to a FUNCTION is how
 *              gobj-ui receives one (`{t: t}`, `yui_tabulator_lang(t)`):
 *              that function calls it with keys of its own, read where
 *              it does. A translator with arguments BOUND (`t.bind(null,
 *              k)`, or a const bound to one) is no callback of these:
 *              what it is handed goes after the bound key, as i18next's
 *              options.
 *
 *  `scope` is the chain of ancestors of the call, the call last.
 ***************************************************************/
function translator_callback(call, scope)
{
    let is_translator = (a) => {
        while(a && a.type === "ChainExpression") {
            a = a.expression;
        }
        if(!a || a.type === "SpreadElement") {
            return false;
        }
        let target = callee_of(a, scope);
        return !!target && !target.bound && (target.kind === "t" || (target.kind === "fn"
            && TRANSLATOR_NAMES.has(target.name) && !is_key_function(target)));
    };
    let it = iteration_call(call, scope);
    if(it) {
        return is_translator(it.callback)?
            {how: "elements", method: it.method, form: it.form, receiver: it.receiver, arg: it.callback} : null;
    }
    let c = (call.callee.type === "ChainExpression")? call.callee.expression : call.callee;
    let method = (c.type === "MemberExpression")? member_name(c, scope) : null;
    if(SETTLE_METHODS.has(method)) {
        let arg = call.arguments.find(is_translator);
        return arg? {how: "settled", method, arg} : null;
    }
    return null;
}

/*  Is a function the reader reads (callee_of(): {kind: "fn"}) a key
 *  function of I18N_KEY_FUNCTIONS -- a `tr` of the library that takes
 *  its key elsewhere than first?  */
function is_key_function(target)
{
    let module = lib_module_of(target.url);
    let fns = module? key_fn_index().by_module.get(module) : null;
    return !!fns && fns.has(target.name);
}


                    /***************************
                     *      What a value can be
                     ***************************/


/*  How many STEPS a value is read through (a cycle stops here too), and
 *  how many values one expression may take. Past either the reader GIVES
 *  UP, and says so (give_up()): a key behind a value it does not follow
 *  would go unasked, and the build say OK  */
const MAX_DEPTH = 24;
const MAX_VALUES = 10000;

/*  How far an alias of a FUNCTION (callee_of()) or of a published list
 *  (list_mutations()) is followed past MAX_DEPTH, to see what it ends
 *  in: only an end that can be a translator, a key function or a list
 *  makes the reader give up. Past this, the end is not known  */
const MAX_FOLLOW = 1000;

/***************************************************************
 *  Where the reader GAVE UP on a value: one read through more than
 *  MAX_DEPTH steps, a const that leads back to itself, an expression
 *  that can take more than MAX_VALUES values. A key behind it would go
 *  unasked, so it is a violation, with the file and the line
 *  (collect_used_keys(); the library's own test holds the library to
 *  none). Up to 7.26.42 the reader stopped there in silence: a chain
 *  of 24 aliases of a const asked for nothing, and a chain of consts
 *  that doubles at every step (`{...O, ...O}`) grew without end and
 *  died with a RangeError naming no file.
 *
 *  It is said at the place the value is READ (READ_AT, the outermost
 *  read in progress), with the node it went past: up to gobj-ui
 *  7.26.44 it was said at the deepest link only, which can be in
 *  another file than the read that needed it.
 *
 *  `node` is the value it gave up on, `scope` the chain of its
 *  ancestors (the first one, the module: where it is said).
 ***************************************************************/
const GAVE_UP = new Map();      // the read -> {node, scope, why, past: {node, scope} | null}
const READ_AT = [];             // the reads in progress, the outermost first: {node, scope}

const GIVE_UP_DEEP = `it is read through more than ${MAX_DEPTH} steps (each const, alias, call, ` +
    `property, element and branch of ?: / || / ?? it goes through is one): shorten the chain`;
const GIVE_UP_CYCLE = `it is a const that leads back to itself: break the cycle`;
const GIVE_UP_MANY = `it can take more than ${MAX_VALUES} values: split it`;

function give_up(node, scope, why)
{
    let read = READ_AT[0] || {node, scope};
    if(read.node && !GAVE_UP.has(read.node)) {
        /*  A scope may be a walker's own chain, which goes on changing: copied  */
        GAVE_UP.set(read.node, {node: read.node, scope: [...(read.scope || [])], why,
                                past: (node && node !== read.node)? {node, scope: [...(scope || [])]} : null});
    }
}

/*  Run a read, as the READ every give_up() inside it is said at --
 *  when no read is in progress already  */
function from_read(node, scope, fn)
{
    if(READ_AT.length > 0) {
        return fn();
    }
    READ_AT.push({node, scope});
    try {
        return fn();
    } finally {
        READ_AT.pop();
    }
}

/*  Where the reader gave up so far -- on reads of one parsed file, when
 *  it is given: [{url, line, text, why, past: {url, line, text} | null}]  */
function gave_up(ast = null)
{
    let where = (node, scope) => {
        let program = (scope.length > 0 && typeof scope[0].code === "string")? scope[0] : null;
        return {
            program,
            url: program? (PROGRAM_URL.get(program) || null) : null,
            line: program? line_of(program, node.start) : 0,
            text: program? program.code.slice(node.start, node.end).replace(/\s+/g, " ").slice(0, 80) : ""
        };
    };
    let out = [];
    for(let {node, scope, why, past} of GAVE_UP.values()) {
        let at = where(node, scope);
        if(ast && at.program !== ast) {
            continue;
        }
        let beyond = past? where(past.node, past.scope) : null;
        out.push({url: at.url, line: at.line, text: at.text, why,
                  past: beyond? {url: beyond.url, line: beyond.line, text: beyond.text} : null});
    }
    return out;
}

/***************************************************************
 *  The DEPTH of a read of expand(), and the values kept for reuse.
 *
 *  A read counts its steps from the place the value is read: a const,
 *  a property, an element, the returns of a function called, each
 *  read ONCE and kept, keep the steps they took beside their values
 *  (`steps`), so a later read of them takes those steps again from
 *  where it stands. The verdict on a read is the same whatever was
 *  read before it: up to gobj-ui 7.26.44 a const kept the values of
 *  its FIRST read, cut at the depth that read had reached, so `t(J16);
 *  t(K10)` failed and `t(K10); t(J16)` passed. A read that goes past
 *  MAX_DEPTH is given up as a whole (TooDeep unwinds it to its
 *  outermost frame), and no value read on the way is kept: each is
 *  kept only when it was read to its end.
 *
 *  The place it went past is the same whatever was read before, too:
 *  the first node reached at step MAX_DEPTH + 1 -- a kept read hands
 *  on, for each of its steps, the first node it reached there (up to
 *  gobj-ui 7.26.45 the place was the kept read itself, so `past K10`
 *  or `past K2` depended on what had been read first).
 ***************************************************************/
const FRAMES = [];      // the reads in progress, outermost first: {max, at}

class TooDeep
{
    constructor(node, scope)
    {
        this.node = node;
        this.scope = scope;
    }
}

/*  A step of the read in progress at `depth`: the first one there is
 *  kept in `at[depth]`. Of its scope only the module is kept, which is
 *  all gave_up() reads -- and a walker's own chain goes on changing  */
function note_step(depth, node, scope)
{
    let frame = FRAMES[FRAMES.length - 1];
    if(frame && depth > frame.max) {
        for(let d = frame.max + 1; d <= depth; d++) {
            frame.at[d] = {node, scope: (scope || []).slice(0, 1)};
        }
        frame.max = depth;
    }
}

/*  Is a step past MAX_DEPTH? Inside a read it unwinds the read (TooDeep);
 *  outside one, it is given up here and the caller stops: true  */
function too_deep(depth, node, scope)
{
    note_step(depth, node, scope);
    if(depth <= MAX_DEPTH) {
        return false;
    }
    if(FRAMES.length > 0) {
        throw new TooDeep(node, scope);
    }
    give_up(node, scope, GIVE_UP_DEEP);
    return true;
}

/*  The OUTERMOST read of expand(): the one a TooDeep unwinds to, given
 *  up there (`fallback()` is what it answers then)  */
function outermost_read(node, scope, fn, fallback)
{
    return from_read(node, scope, () => {
        FRAMES.push({max: 0, at: []});
        try {
            return fn();
        } catch(e) {
            if(!(e instanceof TooDeep)) {
                throw e;
            }
            give_up(e.node, e.scope, GIVE_UP_DEEP);
            return fallback();
        } finally {
            FRAMES.pop();
        }
    });
}

/*  What `compute()` answers for `key` of `cache`, read once and kept
 *  with its steps, read at `depth` by `node` (in `scope`)  */
function kept_values(cache, key, depth, node, scope, compute, fallback)
{
    if(FRAMES.length === 0) {
        return outermost_read(node, scope, () => kept_values(cache, key, depth, node, scope, compute, fallback),
                              fallback);
    }
    let known = cache.get(key);
    if(known) {
        let top = FRAMES[FRAMES.length - 1];
        for(let i = Math.max(0, top.max - depth); i < known.steps.length; i++) {
            too_deep(depth + 1 + i, known.steps[i].node, known.steps[i].scope);
        }
        return known.values;
    }
    let frame = {max: depth, at: []};
    FRAMES.push(frame);
    let values;
    try {
        values = compute();
    } finally {
        FRAMES.pop();
    }
    let steps = frame.at.slice(depth + 1, frame.max + 1);
    for(let i = 0; i < steps.length; i++) {
        note_step(depth + 1 + i, steps[i].node, steps[i].scope);
    }
    cache.set(key, {values, steps});
    return values;
}

/***************************************************************
 *  The values an expression can take, as far as the source writes
 *  them out. Each is one of
 *
 *      {kind: "value", node}           an expression it cannot follow
 *                                      further: a literal, an object
 *                                      or array literal, a call (one
 *                                      whose returns mix keys and
 *                                      what the reader cannot follow
 *                                      carries those keys in
 *                                      `partial`: local_call_values())
 *      {kind: "nothing", node}         `undefined`, or the property of
 *                                      an object that has none
 *      {kind: "param", node, binding, path}
 *                                      a parameter of the enclosing
 *                                      function, `path` what is read
 *                                      from it (".title", "[].label",
 *                                      a destructuring included)
 *      {kind: "unknown", node}         a `let`, a `var` (with its
 *                                      `binding`), an import of what
 *                                      the reader does not read, a
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
 *    - a `const`, to its value, read in the scope that declares it,
 *      and what a destructuring reads from it (`const {title} =
 *      opts`, with its default);
 *    - an import of a const, into the module it names, when the
 *      reader reads that module -- a file of the app, a module of
 *      this library (module_export());
 *    - a property of an object literal it reached (`DEFAULTS.ok`; for
 *      a computed one, `NOTES[verdict]`, every value it holds), of a
 *      copy of one (`{...opts}`, `Object.assign({}, opts)`), and an
 *      element of an array literal (`LIST[i]`);
 *    - an ELEMENT of an array literal it reached: the parameter of a
 *      `.map()`, `.forEach()`, ... callback over it, the variable of a
 *      for...of over it (and what a destructuring there reads from
 *      it: `for(const {key} of ROWS)`);
 *    - a parameter, however it is read: optional chaining
 *      (`opts?.title`), `arguments[1]`, an element of a rest
 *      parameter by its index (`rest[0]`); and its default
 *      (`function f(msg = "fallback")`), besides the parameter itself;
 *    - a call of a function the reader reads -- of the module, or
 *      imported from a module it reads, by `.call()` / `.apply()` too
 *      -- whose every return is known (local_call_values());
 *    - Object.freeze(), String(x) and `${x}` (a template that is only
 *      that), which change nothing it reads.
 *
 *  ctx: {scope, via, off}. `off` is set once it left the place it is
 *  read for the declaration of a const: `via` stops growing there.
 ***************************************************************/
function expand(node, ctx, depth = 0)
{
    let unknown = () => [{kind: "unknown", node, scope: ctx.scope, via: ctx.off? ctx.via : [...ctx.via, node],
                          off: ctx.off}];
    if(FRAMES.length === 0) {
        return outermost_read(node, ctx.scope, () => expand(node, ctx, depth), unknown);
    }
    let out = expand_node(node, ctx, depth);
    if(out.length > MAX_VALUES) {
        give_up(node, ctx.scope, GIVE_UP_MANY);
        return unknown();
    }
    return out;
}

function expand_node(node, ctx, depth)
{
    if(!node) {
        return [];
    }
    let via = ctx.off? ctx.via : [...ctx.via, node];
    let here = {scope: ctx.scope, via: via, off: ctx.off};
    let item = (kind, extra) => Object.assign({kind, node, scope: ctx.scope, via, off: ctx.off}, extra);
    if(too_deep(depth, node, ctx.scope)) {
        return [item("unknown")];
    }

    switch(node.type) {
        case "ConditionalExpression":
            return [...expand(node.consequent, here, depth + 1),
                    ...expand(node.alternate, here, depth + 1)];

        case "LogicalExpression":
            return [...(node.operator !== "&&"? expand(node.left, here, depth + 1) : []),
                    ...expand(node.right, here, depth + 1)];

        case "ChainExpression":
            /*  opts?.title, f?.(x): what the expression inside is (or nothing)  */
            return expand(node.expression, here, depth + 1);

        case "Identifier": {
            if(node.name === "undefined") {
                return [item("nothing")];
            }
            if(node.name === "arguments") {
                let a = arguments_binding(ctx.scope);
                if(a) {
                    return [item("unknown", {binding: a})];
                }
            }
            let b = binding_of(node.name, ctx.scope);
            if(!b) {
                return [item("unknown")];
            }
            if(b.kind === "const") {
                return const_values(b, node, ctx.scope, via, depth);
            }
            if(b.kind === "each") {
                let out = elements_of(b.of, {scope: b.scope, via: via, off: true}, depth + 1);
                for(let step of b.steps) {
                    out = out.flatMap((o) => step_values(o, step, node, depth + 1));
                }
                /*  What it cannot follow is the name, where it is read: param_flows() goes on from it  */
                out = out.map((o) => (o.kind === "unknown" && !o.var_root && o.node === node)?
                    Object.assign({}, o, {scope: ctx.scope}) : o);
                return with_default(out, b.default, {scope: b.scope, via: via, off: true}, depth);
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
            if(b.kind === "import") {
                let x = import_target(b);
                if(x && x.kind === "const") {
                    return const_values(x, node, ctx.scope, via, depth);
                }
            }
            return [item("unknown", {binding: b})];
        }

        case "MemberExpression": {
            let step = member_step(node);
            let special = member_values(node, step, ctx, via, item, depth);
            if(special) {
                return special;
            }
            let out = [];
            for(let o of expand(node.object, here, depth + 1)) {
                out.push(...step_values(o, step, node, depth + 1));
            }
            return out;
        }

        case "CallExpression": {
            if(is_object_call(node, "freeze") && node.arguments.length === 1) {
                return expand(node.arguments[0], here, depth + 1);
            }
            if(node.callee.type === "Identifier" && node.callee.name === "String"
                    && node.arguments.length === 1 && binding_of("String", ctx.scope) === null) {
                return expand(node.arguments[0], here, depth + 1);
            }
            let part = array_method_values(node, here, depth);
            if(part) {
                return part;
            }
            let r = local_call_values(node, ctx, via, depth);
            if(r && r.items) {
                return r.items;
            }
            return [item("value", (r && r.partial)? {partial: r.partial} : {})];
        }

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

/***************************************************************
 *  The values of a const (a binding of binding_of(), or a const
 *  module_export() found in another module): its value read where it
 *  is declared, the steps a destructuring reads from it, its default.
 *  `node` reads it, in `scope`, at `depth`.
 *
 *  Its value is read ONCE, without repeats, and kept with the steps it
 *  took (kept_values()): a const is read where it is declared, so what
 *  it holds is the same wherever it is read -- only `via`, the place it
 *  is read from, differs, and it is the same for every value (the
 *  reader leaves the place for the declaration). Up to 7.26.42 a const
 *  was read again at every read, so `const O1 = c()? O0 : {...O0,
 *  ...O0}`, chained, took three times as long at every link (eleven
 *  links, 906 ms) and grew its values until a RangeError. A const met
 *  again while its value is being read leads back to itself: the reader
 *  gives up on it (give_up()).
 ***************************************************************/
const CONST_VALUES = new WeakMap();     // the init of a const -> {values, steps}, `via` left out
const CONST_READING = new Set();        // the inits being read

function const_values(b, node, scope, via, depth)
{
    note_const_array(b);
    let ctx = {scope: b.scope, via: via, off: true};
    let unknown = () => [{kind: "unknown", node: b.init, scope: b.scope, via, off: true}];
    if(!CONST_VALUES.has(b.init) && CONST_READING.has(b.init)) {
        give_up(b.init, b.scope, GIVE_UP_CYCLE);
        return unknown();
    }
    let values = kept_values(CONST_VALUES, b.init, depth, node, scope, () => {
        CONST_READING.add(b.init);
        try {
            return unique_values(expand(b.init, {scope: b.scope, via: [], off: true}, depth + 1));
        } finally {
            CONST_READING.delete(b.init);
        }
    }, () => null);
    if(values === null) {
        return unknown();
    }
    let out = values.map((v) => Object.assign({}, v, {via}));
    for(let step of b.steps || []) {
        out = out.flatMap((o) => step_values(o, step, node, depth + 1));
    }
    return with_default(out, b.default, ctx, depth);
}

/***************************************************************
 *  The values of a name a destructuring declares with a default
 *  (`const [a = "d"] = X`, `const {title = "d"} = opts`): what it
 *  reads, and the default where that can be undefined -- nothing
 *  there (past the end, a hole, a property not written, `undefined`)
 *  or a value that is not written out (a parameter, a call, an
 *  unknown) --, which it then is instead of nothing. Up to gobj-ui
 *  7.26.50 the default was a value wherever it was written, and
 *  `const [a = "d0", b = "d1"] = ["x0", "x1"]; t(b)` asked for "d1",
 *  which no run of the code reaches.
 ***************************************************************/
const NEVER_UNDEFINED = new Set(["Literal", "TemplateLiteral", "ArrayExpression", "ObjectExpression",
                                 "ArrowFunctionExpression", "FunctionExpression", "ClassExpression",
                                 "NewExpression"]);

function with_default(values, dflt, ctx, depth)
{
    if(!dflt) {
        return values;
    }
    let defined = (o) => o.kind === "value" && NEVER_UNDEFINED.has(o.node.type);
    if(values.length > 0 && values.every(defined)) {
        return values;
    }
    return [...values.filter((o) => o.kind !== "nothing"), ...expand(dflt, ctx, depth + 1)];
}

/***************************************************************
 *  The members expand() reads by what their object IS, not by what
 *  it holds: `arguments[1]` (that parameter of the function) and
 *  `ns.NAME` of `import * as ns` (what the module exports as NAME).
 *  null for any other member.
 ***************************************************************/
function member_values(node, step, ctx, via, item, depth)
{
    if(node.object.type !== "Identifier") {
        return null;
    }
    if(node.object.name === "arguments" && node.computed && node.property.type === "Literal"
            && Number.isInteger(node.property.value) && node.property.value >= 0) {
        let a = arguments_binding(ctx.scope);
        if(!a) {
            return null;
        }
        let binding = {kind: "param", fn: a.fn, name: a.name, index: node.property.value, path: "",
                       default: null, rest: false, scope: a.scope};
        return [item("param", {binding, path: ""})];
    }
    if(step.prop === null) {
        return null;
    }
    let b = binding_of(node.object.name, ctx.scope);
    if(!b || b.kind !== "import" || b.imported !== "*") {
        return null;
    }
    let ns = import_target(b);
    let x = (ns && ns.kind === "namespace")? module_export(ns.url, step.prop) : null;
    if(x && x.kind === "const") {
        return const_values(x, node, ctx.scope, via, depth);
    }
    return [item("unknown")];
}

/*  The leaves the reader KNOWS: no key hides behind them  */
const KNOWN = new Set(["key", "nothing", "dom"]);

/***************************************************************
 *  What a call of a function the reader reads (call_kind(): a
 *  function of the module, or one imported from a module the reader
 *  reads, by `.call()` / `.apply()` too) returns:
 *
 *      {items}     every value it returns is known (classify(): a
 *                  key, nothing, DOM): the call is read as those
 *                  values -- `t(pick())`, `pick` returning "a" or
 *                  "b", asks for both
 *      {partial}   some are not (a parameter, a call, data): the
 *                  call stays a value the reader cannot follow, and
 *                  `partial` holds the keys it also returns, for the
 *                  check of a marker that stands on it
 *      null        anything else: a call of something the reader
 *                  does not read, an async function, a generator, a
 *                  function being read already (a recursion)
 ***************************************************************/
function local_call_values(call, ctx, via, depth = 0)
{
    let c = call_kind(call, ctx.scope);
    if(!c || !c.target || c.target.kind !== "fn") {
        return null;
    }
    let r = fn_returns(c.target, call, ctx.scope, depth);
    if(!r) {
        return null;
    }
    if(r.complete) {
        return {items: r.items.map((it) => Object.assign({}, it, {via}))};
    }
    return (r.keys.length > 0)? {partial: r.keys} : null;
}

/***************************************************************
 *  What a function returns, read ONCE: every `return` expanded in
 *  the scope that declares the function -- never in that of a call
 *  of it, which is what makes the answer a property of the function
 *  -- and cached:
 *
 *      -> {items, complete, keys} | null
 *
 *  `complete`: every value is known; `keys`, the keys among them
 *  (those of a call it returns that mixes keys and data included).
 *  A function that is being read already answers null, and a call
 *  of it is a value the reader cannot follow: the reader does not
 *  follow a recursion. So a recursive helper costs one read, not one
 *  per path through it: 7.26.29 read a function again at every call
 *  of it, `label_of(n)` calling itself in two branches took more
 *  than two minutes, and in three it never ended (REV-CLOUD V22).
 *  A function that is not a plain one (async, a generator) is not
 *  followed. A call is a step of the read that makes it, and the
 *  returns are read one step further (kept_values(): the steps they
 *  take are kept with them); up to gobj-ui 7.26.44 a call started
 *  the count again, so thirty nested calls were read through.
 *  `call` makes it, in `scope`, at `depth`.
 ***************************************************************/
const FN_RETURNS = new WeakMap();       // a function -> {values: {items, complete, keys}, steps}
const FN_READING = new Set();

function fn_returns(target, call, scope, depth)
{
    let fn = target.fn;
    if(!FN_RETURNS.has(fn) && (FN_READING.has(fn) || fn.async || fn.generator)) {
        return null;
    }
    return kept_values(FN_RETURNS, fn, depth, call, scope, () => {
        FN_READING.add(fn);
        let items = [];
        try {
            for(let r of returned_values(fn)) {
                let values = expand(r.node, {scope: [...target.scope, fn, ...r.path], via: [], off: true}, depth + 1);
                items = unique_values(items.concat(values));
            }
        } finally {
            FN_READING.delete(fn);
        }
        let leaves = items.map(classify);
        let keys = new Set();
        for(let l of leaves) {
            if(l.kind === "key") {
                keys.add(l.value);
            }
            for(let k of l.partial || []) {
                keys.add(k);
            }
        }
        return {
            items: items,
            complete: leaves.length > 0 && leaves.every((l) => KNOWN.has(l.kind)),
            keys: [...keys]
        };
    }, () => null);
}

/***************************************************************
 *  The values of expand() without repeats: a value is its node, read
 *  as the same kind along the same path. A function that returns the
 *  call of another three times returns ITS values once, not three
 *  copies of them -- copies multiply along a chain of helpers, and
 *  16 of them made 86 million values.
 ***************************************************************/
function unique_values(values)
{
    let seen = new Map();       // node -> Set("<kind> <path>")
    let out = [];
    for(let v of values) {
        let id = `${v.kind} ${v.path || ""} ${v.var_root? JSON.stringify(v.var_root.steps) : ""}`;
        let ids = seen.get(v.node);
        if(!ids) {
            ids = new Set();
            seen.set(v.node, ids);
        }
        if(!ids.has(id)) {
            ids.add(id);
            out.push(v);
        }
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
    } else if(node.computed && static_string(node.property) !== null) {
        name = static_string(node.property);        // x[`a`]
    }
    return {prop: name, computed: !!node.computed};
}

/***************************************************************
 *  The name of the METHOD a member names: member_step()'s, or the one
 *  string a computed name is when the reader follows it to one -- `t[M]`
 *  with `const M = "call"` (an import of one, a chain of them). Up to
 *  gobj-ui 7.26.45 such a `.call` / `.apply` / `.bind` / `.map`, and
 *  `i18next[T]`, were not read. Only for names of methods: a property
 *  read by a computed name reads every property it may be.
 ***************************************************************/
function member_name(node, scope)
{
    let name = member_step(node).prop;
    if(name !== null || !node.computed || !scope
            || (node.property.type !== "Identifier" && node.property.type !== "MemberExpression")) {
        return name;
    }
    let {keys, complete} = static_keys(node.property, scope);
    return (complete && keys.length === 1)? keys[0] : null;
}

/***************************************************************
 *  The arguments of a call as the callee receives them, a SPREAD of an
 *  array the source writes out read as its elements: `t(...["k"])`,
 *  `t(...KEYS)` with `const KEYS = ["k"]`. A spread of anything else
 *  stays where it is: no position from it on is known. Up to gobj-ui
 *  7.26.45 every spread did.
 ***************************************************************/
function written_args(list, scope)
{
    let out = [];
    for(let i = 0; i < list.length; i++) {
        let a = list[i];
        if(a && a.type === "SpreadElement") {
            let elements = written_elements(a.argument, scope);
            if(elements === null) {
                return [...out, ...list.slice(i)];
            }
            out.push(...elements);
        } else {
            out.push(a);
        }
    }
    return out;
}

/***************************************************************
 *  The elements of an array the source writes out, or null: an array
 *  literal (its spreads read by written_args(), a hole is an argument
 *  not given), or a const bound to one with no spread and no hole --
 *  its elements read THROUGH it, as `X[0]`, `X[1]`... (element_ref()),
 *  so each is read where the const is declared --, a `let` of literal
 *  arrays (let_array(), each position any element), or a `.slice()` of
 *  one of those (sliced_elements()).
 ***************************************************************/
function written_elements(n, scope)
{
    if(!n) {
        return null;
    }
    if(n.type === "ArrayExpression") {
        return written_args(n.elements, scope);
    }
    if(n.type === "CallExpression") {
        return sliced_elements(n, scope);
    }
    if(n.type !== "Identifier") {
        return null;
    }
    let array = const_array(n, scope);
    if(!array) {
        /*  A let of literal arrays: each position of its longest array is any element  */
        let a = let_array(binding_of(n.name, scope));
        return a? Array.from({length: Math.max(a.length, 1)}, (_, i) => element_ref(n, i)) : null;
    }
    if(array.elements.some((e) => e === null || e.type === "SpreadElement")) {
        return null;
    }
    return array.elements.map((e, i) => element_ref(n, i));
}

/***************************************************************
 *  `x.at(i)` and `x.slice(a, b)` where x holds an array the source
 *  writes out -- an array literal (a const of one, a branch of `?:`,
 *  an element of another, ...), or a `let` of literal arrays
 *  (let_array()) --: the element, or the part, read from each such
 *  value (array_step()); any other value of x is unknown there. null
 *  when x holds none: the call is read as any other.
 *
 *  `.at()` reads element 0, `.at(i, ...)` element i, and an index not
 *  written out (a variable, a spread) any element; a negative one
 *  counts from the end of an array with no spread. Up to gobj-ui
 *  7.26.48 `X.at(1)` was read as nothing; up to 7.26.50 so were
 *  `X.at()`, `X.at(-1, 0)`, an `.at()` of anything but a name
 *  (`X[0].at(1)`, `X.at(0).at(1)`), a `.slice()` read by its index
 *  (`X.slice(1)[0]`, `const [b] = X.slice(1)`) and the elements of a
 *  `.slice()` walked (`for(const k of X.slice(1))`).
 ***************************************************************/
function array_method_values(call, ctx, depth)
{
    let c = call.callee;
    if(c.type !== "MemberExpression") {
        return null;
    }
    let name = member_step(c).prop;
    let step = (name === "slice")? slice_step(call) : (name === "at")? {at: at_index(call)} : null;
    if(!step) {
        return null;
    }
    let values = expand(c.object, ctx, depth + 1);
    if(!values.some(holds_array)) {
        return null;
    }
    let via = ctx.off? ctx.via : [...ctx.via, call];
    return values.flatMap((o) => holds_array(o)? step_values(o, array_step(o, step), call, depth + 1)
        : [{kind: "unknown", node: call, scope: ctx.scope, via, off: ctx.off}]);
}

/*  A value that is an array the source writes out: an array literal,
 *  or what a `let` of literal arrays holds (let_array())  */
function holds_array(o)
{
    if(o.kind === "value") {
        return o.node.type === "ArrayExpression";
    }
    return o.kind === "unknown" && !!o.var_root && o.var_root.steps.every(is_element_step)
        && !!let_array(o.var_root.binding);
}

/*  The index `.at()` reads: an integer written out (0 for none), or
 *  null for one that is not  */
function at_index(call)
{
    let a = call.arguments[0];
    if(a === undefined) {
        return 0;
    }
    return is_spread(a)? null : literal_integer(a);
}

/*  `.slice(a, b)` as a step: {slice, from, to}, each end an integer
 *  written out, "end" for an end left out, null for one that is not
 *  written out. null for a slice that is no read of a part.  */
function slice_step(call)
{
    if(call.arguments.length > 2 || call.arguments.some(is_spread)) {
        return call.arguments.some(is_spread)? {slice: true, from: null, to: null} : null;
    }
    let bound = (a, dflt) => (a === undefined)? dflt : literal_integer(a);
    return {slice: true, from: bound(call.arguments[0], 0), to: bound(call.arguments[1], "end")};
}

/*  The step `.at()` takes on one value (holds_array()): an index
 *  counted from the start, or any element  */
function array_step(o, step)
{
    if(step.slice) {
        return step;
    }
    let i = step.at;
    if(i === null || o.kind !== "value") {
        return {prop: null, computed: true};
    }
    if(i < 0) {
        if(o.node.elements.some(is_spread)) {
            return {prop: null, computed: true};
        }
        i = o.node.elements.length + i;
        if(i < 0) {
            i = o.node.elements.length;      // nothing there
        }
    }
    return {prop: String(i), computed: true};
}

/***************************************************************
 *  The part of an array literal a slice step reads (slice_step()),
 *  as an array literal of its elements -- made once per array and
 *  part, and read by its index. Only an array read by its index
 *  (is_indexed_array(), is_nested_array()) has a part: of any other,
 *  an end not written out or a spread in it, the part is the whole
 *  array, read by every element -- the array may hold its elements
 *  elsewhere by then (`X.reverse()`).
 ***************************************************************/
const ARRAY_PARTS = new WeakMap();      // an array literal -> Map("from:to" -> its part)

function array_part(array, step, nested)
{
    let els = array.elements;
    let exact = step.from !== null && step.to !== null && !els.some(is_spread)
        && (nested || is_indexed_array(array));
    let key = exact? `${step.from}:${step.to}` : "*";
    let parts = ARRAY_PARTS.get(array);
    if(!parts) {
        parts = new Map();
        ARRAY_PARTS.set(array, parts);
    }
    if(!parts.has(key)) {
        let part = els;
        if(exact) {
            let len = els.length;
            let bound = (v) => (v === "end")? len : (v < 0)? Math.max(len + v, 0) : Math.min(v, len);
            part = els.slice(bound(step.from), bound(step.to));
        }
        let node = {type: "ArrayExpression", elements: part, start: array.start, end: array.end};
        INDEXED_ARRAYS.set(node, exact);
        parts.set(key, node);
    }
    return parts.get(key);
}

/*  An integer written out (`1`, `-1`), or null  */
function literal_integer(n)
{
    if(n && n.type === "UnaryExpression" && n.operator === "-") {
        let v = literal_integer(n.argument);
        return (v !== null)? -v : null;
    }
    return (n && n.type === "Literal" && Number.isInteger(n.value))? n.value : null;
}

/***************************************************************
 *  The elements `X.slice(a, b)` takes from a const array with no
 *  spread and no hole, `a` and `b` integers written out (or left
 *  out): X[a], ..., read through X (element_ref()); of a let of
 *  literal arrays, what a spread of it is (written_elements()). null
 *  for any other call. Up to gobj-ui 7.26.48 `t(...X.slice(1))` read
 *  nothing.
 ***************************************************************/
function sliced_elements(call, scope)
{
    let c = call.callee;
    if(c.type !== "MemberExpression" || member_step(c).prop !== "slice" || c.object.type !== "Identifier"
            || call.arguments.length > 2) {
        return null;
    }
    let array = const_array(c.object, scope);
    if(!array) {
        return written_elements(c.object, scope);       // a let: every element at each position
    }
    if(array.elements.some((e) => e === null || e.type === "SpreadElement")) {
        return null;
    }
    let len = array.elements.length;
    let bound = (a, dflt) => {
        if(a === undefined) {
            return dflt;
        }
        let v = literal_integer(a);
        if(v === null) {
            return null;
        }
        return (v < 0)? Math.max(len + v, 0) : Math.min(v, len);
    };
    let from = bound(call.arguments[0], 0);
    let to = bound(call.arguments[1], len);
    if(from === null || to === null) {
        return null;
    }
    let out = [];
    for(let i = from; i < to; i++) {
        out.push(element_ref(c.object, i));
    }
    return out;
}

/***************************************************************
 *  The array literal a name is a const of, or null: its own value
 *  (`Object.freeze()`d too), an import of one, or a const ALIAS of
 *  one (`const B = A`), followed to its end. Up to gobj-ui 7.26.46 an
 *  alias or an import was a spread of what the source does not write.
 ***************************************************************/
function const_array(n, scope)
{
    let seen = new Set();
    for(;;) {
        let b = binding_of(n.name, scope);
        if(b && b.kind === "import") {
            b = import_target(b);
        }
        if(!b || b.kind !== "const" || (b.steps || []).length > 0 || b.default || !b.init || seen.has(b.init)) {
            return null;
        }
        seen.add(b.init);
        let init = b.init;
        if(is_object_call(init, "freeze") && init.arguments.length === 1) {
            init = init.arguments[0];
        }
        if(init.type === "ArrayExpression") {
            return init;
        }
        if(init.type !== "Identifier") {
            return null;
        }
        n = init;
        scope = b.scope;
    }
}

/***************************************************************
 *  The array literals an element is read from by its index
 *  (step_values()): the value of a const -- written out, or
 *  `Object.freeze()`d -- whose every use is a READ that leaves its
 *  elements where they are (array_only_read()). Any other array is
 *  read by every element written out, at any index: one used in any
 *  other way (written into, handed to a function, kept in an object,
 *  returned, exported to a module that does any of these) may hold
 *  another element by then. Up to gobj-ui 7.26.48 the reader looked
 *  for the WRITES it knew (`X[0] = k`, `.reverse()`, ...) and read by
 *  index whatever it did not see written: `Reflect.set(X, 0, k)`,
 *  `Array.prototype.reverse.call(X)`, `X["re" + "verse"]()`, a write
 *  through `{x: X}` or through the third argument of a `.forEach()`
 *  callback, `for(X[0] of ...)` read the element the source wrote
 *  there, not the one the array held.
 ***************************************************************/
const ARRAY_CONSTS = new WeakMap();    // an array literal -> the binding of the const that holds it
const INDEXED_ARRAYS = new WeakMap();  // an array literal -> whether it is read by its index

function note_const_array(b)
{
    let init = b.init;
    if(init && is_object_call(init, "freeze") && init.arguments.length === 1) {
        init = init.arguments[0];
    }
    if(!init || init.type !== "ArrayExpression" || ARRAY_CONSTS.has(init) || !b.name || !b.scope) {
        return;
    }
    ARRAY_CONSTS.set(init, b);
}

/*  Asked when an index is read, not when the const is: the importers
 *  of an exported array are looked for only then  */
function is_indexed_array(array)
{
    if(!INDEXED_ARRAYS.has(array)) {
        let b = ARRAY_CONSTS.get(array);
        /*  `const [a, b] = [...]`: a literal with no name has no other use  */
        INDEXED_ARRAYS.set(array, !!b && ((b.steps || []).length > 0 || array_only_read(b)));
    }
    return INDEXED_ARRAYS.get(array);
}

/***************************************************************
 *  An array literal written INSIDE another literal -- an element of
 *  an array, the value of a property (`[["foto", "CLS", "photo"]]`,
 *  `{cols: ["a", "b"]}`) --, which is read by its index, as a property
 *  of an object is: no name holds it, so only a read of the literal
 *  around it reaches it, and what is written into it after that is
 *  not seen, as with an object (the README's list of what stays
 *  invisible). Up to gobj-ui 7.26.50 such an array was read by every
 *  element, and a destructuring of it by nothing.
 ***************************************************************/
function is_nested_array(o)
{
    let parent = o.scope[o.scope.length - 1];
    if(!parent) {
        return false;
    }
    return (parent.type === "ArrayExpression" && parent.elements.includes(o.node))
        || (parent.type === "Property" && parent.value === o.node);
}

/*  The methods of an array that read it and write nothing into it.
 *  Those that take a callback hand it the array as their third
 *  argument (the fourth for reduce): a callback that can reach it
 *  that way is not a read.  */
const ARRAY_READERS = new Set(["at", "includes", "indexOf", "lastIndexOf", "join", "slice", "concat", "entries",
                               "keys", "values", "toString", "toLocaleString", "flat", "toReversed", "toSorted",
                               "toSpliced", "with"]);
const ARRAY_CALLBACK_READERS = new Map([
    ["map", 2], ["flatMap", 2], ["forEach", 2], ["filter", 2], ["find", 2], ["findIndex", 2], ["findLast", 2],
    ["findLastIndex", 2], ["some", 2], ["every", 2], ["reduce", 3], ["reduceRight", 3]
]);

/***************************************************************
 *  Every use of the array a const binds (`b`, of binding_of()) is a
 *  read the reader knows: an element or a property read (`X[1]`,
 *  `X.length`), a method of ARRAY_READERS / ARRAY_CALLBACK_READERS
 *  (`X.at(1)`, `X.map((k) => t(k))`, `X.map(t)`), a spread (`t(...X)`,
 *  `[...X]`), the array of an `.apply()` (`f.apply(x, X)`), a
 *  destructuring (`const [a, b] = X`), a for...of / for...in over it,
 *  a test or an operand (`if(X)`, `X === Y`, `${X}`), `Object.freeze(X)`,
 *  `Array.isArray(X)`. A const alias (`const B = X`,
 *  `const F = Object.freeze(X)`) is a read when every use of IT is one.
 *  An export is a read when every module of the run that imports it
 *  (the app's sources, and the library's for an array of the library)
 *  only reads it; a namespace import, a re-export or a dynamic import()
 *  of the module is not. Anything else -- an argument of any other call
 *  (`Reflect.set(X, ...)`, `shuffle(X)`, `F.call(X)`), a value kept,
 *  returned or handed on (`{x: X}`, `return X`, `a || X`, `let L = X`),
 *  a write into it, a method not listed or named by what is no string
 *  written out -- is not.
 ***************************************************************/
let RUN_SOURCES = null;     // the files of the run (collect_used_keys()), where importers are looked for

function array_only_read(b)
{
    let exported = new Set();
    let ok = name_only_read(b.name, b.scope, (w) => w.kind === "const" && w.init === b.init, exported, new Map());
    if(!ok || exported.size === 0) {
        return ok;
    }
    let url = url_of(b.scope);
    if(!url || b.scope.length !== 1) {
        return false;
    }
    return importers_only_read(url, exported);
}

/*  `scope` is the chain down to the scope that declares `name`;
 *  `is_it(binding)` says a binding_of() is the one meant. The names
 *  it is exported as go into `exported`.  */
function name_only_read(name, scope, is_it, exported, seen)
{
    let root = scope[scope.length - 1];
    if(!seen.has(root)) {
        seen.set(root, new Set());
    }
    if(seen.get(root).has(name)) {
        return true;        // an alias met again: its uses are being read
    }
    seen.get(root).add(name);
    let prefix = scope.slice(0, -1);
    let writes = written_members(root);
    for(let {n, ancestors} of (scope_identifiers(root).get(name) || [])) {
        let p = ancestors[ancestors.length - 1];
        if(!is_reference(n, p)) {
            continue;
        }
        let chain = prefix.concat(ancestors);
        let w = binding_of(name, chain);
        if(!w || !is_it(w)) {
            continue;
        }
        let use = use_of(n, ancestors, chain, writes);
        if(use.alias) {
            if(!name_only_read(use.alias.name, use.alias.scope,
                               (x) => x.kind === "const" && x.init === use.alias.init, exported, seen)) {
                return false;
            }
        } else if(use.export) {
            exported.add(use.export);
        } else if(!use.read) {
            return false;
        }
    }
    if(scope.length === 1 && declared_exports(root).has(name)) {
        exported.add(name);
    }
    return true;
}

/*  The names a module exports where it declares them (`export const X`)  */
const DECLARED_EXPORTS = new WeakMap();     // a parsed file -> Set(name)

function declared_exports(program)
{
    let known = DECLARED_EXPORTS.get(program);
    if(!known) {
        known = new Set();
        for(let s of program.body) {
            if(s.type === "ExportNamedDeclaration" && s.declaration && s.declaration.type === "VariableDeclaration") {
                for(let d of s.declaration.declarations) {
                    for(let name of pattern_names(d.id)) {
                        known.add(name);
                    }
                }
            }
        }
        DECLARED_EXPORTS.set(program, known);
    }
    return known;
}

/*  The identifiers of a scope by name, each with the chain from the
 *  scope to its parent: found in one walk, so that asking for every
 *  const array of a module is not quadratic  */
const SCOPE_IDENTIFIERS = new WeakMap();    // a scope -> Map(name -> [{n, ancestors}])

function scope_identifiers(root)
{
    let known = SCOPE_IDENTIFIERS.get(root);
    if(known) {
        return known;
    }
    known = new Map();
    walk(root, (n, ancestors) => {
        if(n.type !== "Identifier") {
            return;
        }
        if(!known.has(n.name)) {
            known.set(n.name, []);
        }
        known.get(n.name).push({n, ancestors: [...ancestors]});
    });
    SCOPE_IDENTIFIERS.set(root, known);
    return known;
}

/*  An identifier that names a binding there, not a property, a key or
 *  a declaration  */
function is_reference(n, p)
{
    if(!p) {
        return false;
    }
    switch(p.type) {
        case "MemberExpression":
            return p.object === n || p.computed;
        case "Property":
            return p.value === n && (p.shorthand || p.key !== n);
        case "MethodDefinition":
        case "PropertyDefinition":
            return p.computed && p.key === n;
        case "VariableDeclarator":
            return p.init === n;
        case "FunctionDeclaration":
        case "FunctionExpression":
        case "ArrowFunctionExpression":
        case "ClassDeclaration":
        case "ClassExpression":
        case "LabeledStatement":
        case "BreakStatement":
        case "ContinueStatement":
        case "ImportSpecifier":
        case "ImportDefaultSpecifier":
        case "ImportNamespaceSpecifier":
        case "CatchClause":
            return p.type === "ArrowFunctionExpression" && p.body === n;
        case "ExportSpecifier":
            return p.local === n;
        case "AssignmentPattern":
            return p.right === n;
        case "ArrayPattern":
        case "ObjectPattern":
        case "RestElement":
            return false;
        default:
            return true;
    }
}

/*  What one use of the array is: {read}, {alias: binding}, {export:
 *  name}, or {} (anything else)  */
function use_of(n, ancestors, chain, writes)
{
    let p = ancestors[ancestors.length - 1];
    let gp = ancestors[ancestors.length - 2];
    let at = (k) => ancestors[ancestors.length - k];
    switch(p.type) {
        case "MemberExpression": {
            if(p.object !== n) {
                return {read: true};        // `Y[X]`: a key
            }
            if(writes.has(p)) {
                return {};
            }
            if(gp && gp.type === "TaggedTemplateExpression" && gp.tag === p) {
                return {};
            }
            if(!gp || gp.type !== "CallExpression" || gp.callee !== p) {
                return {read: true};
            }
            let method = member_step(p).prop;
            if(ARRAY_READERS.has(method)) {
                return {read: true};
            }
            if(ARRAY_CALLBACK_READERS.has(method)) {
                let reach = ARRAY_CALLBACK_READERS.get(method);
                return {read: gp.arguments.every((a) => callback_cannot_reach(a, reach, chain.slice(0, -1)))};
            }
            return {};
        }
        case "SpreadElement":
            return {read: !!gp && /^(CallExpression|NewExpression|ArrayExpression|ObjectExpression)$/.test(gp.type)};
        case "CallExpression": {
            if(p.callee === n) {
                return {};
            }
            let method = (p.callee.type === "MemberExpression")? member_step(p.callee).prop : null;
            if(method === "apply" && p.arguments[1] === n) {
                return {read: true};
            }
            if(p.callee.type === "MemberExpression" && !p.callee.computed && p.callee.object.type === "Identifier"
                    && p.callee.object.name === "Array" && method === "isArray"
                    && binding_of("Array", chain) === null) {
                return {read: true};
            }
            if(is_object_call(p, "freeze") && p.arguments.length === 1 && binding_of("Object", chain) === null) {
                if(gp && gp.type === "ExpressionStatement") {
                    return {read: true};
                }
                return const_alias(gp, at(3), p, chain);
            }
            return {};
        }
        case "VariableDeclarator":
            if(p.id.type === "ArrayPattern" || p.id.type === "ObjectPattern") {
                return {read: true};
            }
            return const_alias(p, gp, n, chain);
        case "AssignmentExpression":
            return {read: p.right === n && p.operator === "="
                          && (p.left.type === "ArrayPattern" || p.left.type === "ObjectPattern")};
        case "ForOfStatement":
        case "ForInStatement":
            return {read: p.right === n};
        case "BinaryExpression":
            return {read: true};
        case "TemplateLiteral":
            return {read: !gp || gp.type !== "TaggedTemplateExpression"};     // a tag is handed the array
        case "UnaryExpression":
            return {read: p.operator !== "delete"};
        case "IfStatement":
        case "WhileStatement":
        case "DoWhileStatement":
        case "ConditionalExpression":
            return {read: p.test === n};
        case "ExportSpecifier":
            return {export: p.exported.name || p.exported.value};
        case "ExportDefaultDeclaration":
            return {export: "default"};
        default:
            return {};
    }
}

/*  `const <name> = <value>`: an alias, whose uses are the array's  */
function const_alias(declarator, declaration, value, chain)
{
    if(!declarator || declarator.type !== "VariableDeclarator" || declarator.init !== value
            || declarator.id.type !== "Identifier" || !declaration || declaration.kind !== "const") {
        return {};
    }
    let name = declarator.id.name;
    let b = binding_of(name, chain);
    if(!b || b.kind !== "const" || b.init !== value) {
        return {};
    }
    return {alias: b};
}

/*  An argument of a method of ARRAY_CALLBACK_READERS that cannot reach
 *  the array: a value that is no function, a function literal that
 *  declares no parameter at `reach` (nor a rest) and reads no
 *  `arguments`, or a translator. A function named by anything else may
 *  take the array and write into it.  */
function callback_cannot_reach(a, reach, scope)
{
    if(a.type === "Literal" || a.type === "ObjectExpression" || a.type === "ArrayExpression"
            || a.type === "TemplateLiteral") {
        return true;        // no function: what it holds is a use of its own
    }
    if(a.type === "ArrowFunctionExpression" || a.type === "FunctionExpression") {
        if(a.params.length > reach || a.params.some((q) => q.type === "RestElement")) {
            return false;
        }
        if(a.type === "ArrowFunctionExpression") {
            return true;
        }
        let uses_arguments = false;
        walk(a.body, (x) => {
            if(x.type === "Identifier" && x.name === "arguments") {
                uses_arguments = true;
            }
        });
        return !uses_arguments;
    }
    let c = callee_of(a, scope);
    return !!c && c.kind === "t";
}

/*  The members a scope writes: the left of an `=` (through any
 *  destructuring), the head of a for...of / for...in that declares
 *  nothing, `x[i]++`, `delete x[i]`. Found in one walk.  */
const WRITTEN_MEMBERS = new WeakMap();  // a scope -> Set(member)

function written_members(root)
{
    let known = WRITTEN_MEMBERS.get(root);
    if(known) {
        return known;
    }
    known = new Set();
    let add = (targets) => {
        for(let t of targets) {
            if(t.type === "MemberExpression") {
                known.add(t);
            }
        }
    };
    walk(root, (n) => {
        if(n.type === "AssignmentExpression") {
            add(write_targets(n.left));
        } else if((n.type === "ForOfStatement" || n.type === "ForInStatement") && n.left.type !== "VariableDeclaration") {
            add(write_targets(n.left));
        } else if(n.type === "UpdateExpression"
                || (n.type === "UnaryExpression" && n.operator === "delete")) {
            add([n.argument]);
        }
    });
    WRITTEN_MEMBERS.set(root, known);
    return known;
}

/***************************************************************
 *  Every module of the run that imports `names` of the module `url`
 *  only reads what it imports (name_only_read()). A namespace import,
 *  a re-export, an `export *` or a dynamic import() of the module is no
 *  read the reader follows. With no run (a test that scans one file),
 *  nothing is known of the importers: false.
 ***************************************************************/
function importers_only_read(url, names)
{
    if(!RUN_SOURCES) {
        return false;
    }
    let files = [...RUN_SOURCES];
    if(lib_module_of(url) || url.href === LIB_INDEX.href) {
        files.push(...lib_sources());
    }
    for(let f of files) {
        if(f.href === url.href) {
            continue;
        }
        let ast = load_ast(f);
        if(!ast) {
            continue;
        }
        for(let imp of module_imports(ast, f)) {
            if(imp.any) {
                return false;       // `import(path)`: any module, this one too
            }
            if(imp.target !== url.href) {
                continue;
            }
            if(imp.whole) {
                return false;
            }
            if(!names.has(imp.imported)) {
                continue;
            }
            if(imp.reexport) {
                return false;
            }
            let again = new Set();      // exported on by the importer: its own importers are not looked for
            let ok = name_only_read(imp.local, [ast], (w) => w.kind === "import" && w.scope.length === 1
                                    && w.imported === imp.imported && module_url(f, w.source)
                                    && module_url(f, w.source).href === url.href, again, new Map());
            if(!ok || again.size > 0) {
                return false;
            }
        }
    }
    return true;
}

/*  What a module takes from others: [{target (href), imported, local,
 *  reexport, whole, any}], `whole` for a namespace, an `export *` or a
 *  dynamic import(), `any` for an import() of a path not written out  */
const MODULE_IMPORTS = new WeakMap();   // a parsed file -> its imports

function module_imports(ast, url)
{
    let known = MODULE_IMPORTS.get(ast);
    if(known) {
        return known;
    }
    known = [];
    let target = (source) => {
        let u = module_url(url, source);
        return u? u.href : null;
    };
    for(let s of ast.body) {
        if(s.type === "ImportDeclaration") {
            for(let sp of s.specifiers) {
                let imported = (sp.type === "ImportSpecifier")? (sp.imported.name || sp.imported.value)
                    : (sp.type === "ImportDefaultSpecifier")? "default" : "*";
                known.push({target: target(s.source.value), imported, local: sp.local.name,
                            reexport: false, whole: imported === "*"});
            }
        } else if(s.type === "ExportAllDeclaration") {
            known.push({target: target(s.source.value), imported: "*", local: null, reexport: true, whole: true});
        } else if(s.type === "ExportNamedDeclaration" && s.source) {
            for(let sp of s.specifiers) {
                known.push({target: target(s.source.value), imported: sp.local.name || sp.local.value, local: null,
                            reexport: true, whole: false});
            }
        }
    }
    walk(ast, (n) => {
        if(n.type === "ImportExpression") {
            let src = static_string(n.source);
            known.push({target: (src !== null)? target(src) : null, imported: "*", local: null, reexport: false,
                        whole: true, any: src === null});
        }
    });
    MODULE_IMPORTS.set(ast, known);
    return known;
}

/*  The modules of this library (src/, its tests left out)  */
let LIB_SOURCES = null;

function lib_sources()
{
    if(!LIB_SOURCES) {
        LIB_SOURCES = [LIB_INDEX, ...source_files(LIB_SRC, null)];
    }
    return LIB_SOURCES;
}

function is_spread(n)
{
    return !!n && n.type === "SpreadElement";
}

/*  `X[i]` for the name X, a node of no source (at the place of X), made
 *  once: what is said about it is said once  */
const ELEMENT_REFS = new WeakMap();     // an Identifier -> [its X[i]]

function element_ref(n, i)
{
    if(!ELEMENT_REFS.has(n)) {
        ELEMENT_REFS.set(n, []);
    }
    let refs = ELEMENT_REFS.get(n);
    if(!refs[i]) {
        refs[i] = {type: "MemberExpression", object: n, computed: true, optional: false,
                   property: {type: "Literal", value: i, raw: String(i), start: n.start, end: n.end},
                   start: n.start, end: n.end};
    }
    return refs[i];
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
 *  the value's own). An element of a rest parameter read by its index
 *  is the parameter at that index (`rest[0]`); any other step of one
 *  is no position a table can name, and the reader cannot follow it.
 ***************************************************************/
function step_values(o, step, node, depth)
{
    let at = node || o.node;
    if(step.each) {
        return element_values(o, depth);
    }
    if(step.slice) {
        if(o.kind === "value" && o.node.type === "ArrayExpression") {
            return [Object.assign({}, o, {node: array_part(o.node, step, is_nested_array(o))})];
        }
        if(o.kind === "nothing") {
            return [Object.assign({}, o, {node: at})];
        }
        return [Object.assign({}, o, {kind: "unknown", binding: null, node: at,
                                      var_root: extend_root(o.var_root, step)})];
    }
    if(o.kind === "param" && o.binding.rest) {
        if(step.computed && step.prop !== null && /^\d+$/.test(step.prop)) {
            let binding = Object.assign({}, o.binding, {index: o.binding.index + Number(step.prop), rest: false});
            return [Object.assign({}, o, {binding, path: "", node: at})];
        }
        return [Object.assign({}, o, {kind: "unknown", var_root: null, node: at})];
    }
    if(o.kind === "param") {
        return [step.prop !== null? Object.assign({}, o, {path: o.path + "." + step.prop, node: at}) :
            Object.assign({}, o, {kind: "unknown", binding: null, var_root: null, node: at})];
    }
    if(o.kind === "value" && o.node.type === "ObjectExpression") {
        return property_values(o, step.prop, depth + 1);
    }
    if(o.kind === "value" && is_object_call(o.node, "assign")) {
        return assigned_properties(o, step, depth + 1);
    }
    if(o.kind === "value" && o.node.type === "ArrayExpression" && (step.computed || array_index(step) !== null)) {
        let i = array_index(step);
        if(i !== null && (is_indexed_array(o.node) || is_nested_array(o))
                && !o.node.elements.slice(0, i + 1).some((e) => e && e.type === "SpreadElement")) {
            return indexed_values(o, i, at, depth + 1);
        }
        return element_values(o, depth + 1);
    }
    if(o.kind === "nothing" || (o.kind === "value" && o.node.type === "Literal")) {
        return [Object.assign({}, o, {kind: "nothing", node: at})];
    }
    return [Object.assign({}, o, {kind: "unknown", binding: null, node: at,
                                  var_root: extend_root(o.var_root, step)})];
}

/***************************************************************
 *  The values one step reads from `Object.assign(target, ...sources)`:
 *  what each argument holds there (a later one wins, so any of them
 *  may be it); an argument that has no such property is no value of
 *  it
 ***************************************************************/
function assigned_properties(o, step, depth)
{
    let out = [];
    let scope = [...o.scope, o.node];
    for(let a of o.node.arguments) {
        if(a.type === "SpreadElement") {
            out.push(Object.assign({}, o, {kind: "unknown", binding: null, var_root: null, node: a}));
            continue;
        }
        for(let v of expand(a, {scope, via: o.via, off: o.off}, depth + 1)) {
            if(v.kind === "nothing" || (v.kind === "value" && v.node.type === "Literal")) {
                continue;
            }
            let r = step_values(v, step, null, depth + 1);
            if(v.kind === "value" && v.node.type === "ObjectExpression") {
                r = r.filter((x) => x.kind !== "nothing");
            }
            out.push(...r);
        }
    }
    if(out.length === 0) {
        out.push(Object.assign({}, o, {kind: "nothing"}));
    }
    return out;
}

/***************************************************************
 *  The values of property `name` of an object literal (`name` null:
 *  of every property), each followed with expand(). A spread is read
 *  for it: an object literal, or a parameter (`{...opts}` holds
 *  opts.title as its title).
 *
 *  An object reached from a declaration (`o.off`: every value it
 *  gives carries the same `via`) is read once per property, without
 *  repeats, and kept with the steps it took -- as a const is
 *  (const_values()): a spread of the same object twice, `{...O, ...O}`,
 *  gives its values once.
 ***************************************************************/
const PROPERTY_VALUES = new WeakMap();  // an object literal -> Map(property -> {values, steps}, `via` left out)

function property_values(o, name, depth)
{
    if(!o.off) {
        return capped(o, property_values_of(o, name, depth));
    }
    let known = PROPERTY_VALUES.get(o.node);
    if(!known) {
        known = new Map();
        PROPERTY_VALUES.set(o.node, known);
    }
    let bare = Object.assign({}, o, {via: []});
    let values = kept_values(known, name, depth, o.node, o.scope,
        () => capped(bare, unique_values(property_values_of(bare, name, depth))),
        () => [Object.assign({}, bare, {kind: "unknown", binding: null, var_root: null})]);
    return values.map((v) => Object.assign({}, v, {via: o.via}));
}

/*  The values of a value, or the reader giving up on it when they are
 *  more than MAX_VALUES  */
function capped(o, values)
{
    if(values.length <= MAX_VALUES) {
        return values;
    }
    give_up(o.node, o.scope, GIVE_UP_MANY);
    return [Object.assign({}, o, {kind: "unknown", binding: null, var_root: null})];
}

function property_values_of(o, name, depth)
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
                } else if(s.kind === "param" && name !== null) {
                    found = true;
                    out.push(...step_values(s, {prop: name, computed: false}, null, depth + 1));
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
 *  The index a step reads, when it is one written out (`X[1]`,
 *  `X["1"]`, ``X[`1`]``), or null
 ***************************************************************/
function array_index(step)
{
    return (step.prop !== null && /^(0|[1-9][0-9]{0,8})$/.test(step.prop))? Number(step.prop) : null;
}

/***************************************************************
 *  The element `i` of an array literal with no spread up to it: that
 *  element followed with expand() -- a hole, or past the end, is
 *  nothing. Up to gobj-ui 7.26.46 `X[1]` read every element of X, and
 *  so did the spread of a const array (written_args()):
 *  `t.apply(null, ["k", "a default value"])` asked for the default
 *  value, and `f.apply(x, [shell, "k"])` gave `shell` to the key
 *  position of a key function. Kept per element, as a property is
 *  (property_values()).
 ***************************************************************/
const INDEXED_VALUES = new WeakMap();   // an array literal -> Map(index -> {values, steps}), `via` left out

function indexed_values(o, i, at, depth)
{
    if(i >= o.node.elements.length || o.node.elements[i] === null) {
        return [Object.assign({}, o, {kind: "nothing", node: at})];
    }
    if(!o.off) {
        return capped(o, indexed_values_of(o, i, depth));
    }
    let known = INDEXED_VALUES.get(o.node);
    if(!known) {
        known = new Map();
        INDEXED_VALUES.set(o.node, known);
    }
    let bare = Object.assign({}, o, {via: []});
    let values = kept_values(known, i, depth, o.node, o.scope,
        () => capped(bare, unique_values(indexed_values_of(bare, i, depth))),
        () => [Object.assign({}, bare, {kind: "unknown", binding: null, var_root: null})]);
    return values.map((v) => Object.assign({}, v, {via: o.via}));
}

function indexed_values_of(o, i, depth)
{
    return expand(o.node.elements[i], {scope: [...o.scope, o.node], via: o.via, off: o.off}, depth + 1);
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
 *  The elements of one value of expand(): see elements_of(). Each
 *  element of a rest parameter is another parameter: no position can
 *  name one, and the reader cannot follow it. The elements of an array
 *  literal (or of a `.map()` of one) reached from a declaration are
 *  read once, without repeats, and kept with the steps they took, as
 *  the properties of an object are (property_values()): `[...A, ...A]`
 *  gives A's once.
 ***************************************************************/
const ELEMENT_VALUES = new WeakMap();   // an array literal or a .map() -> {values, steps}, `via` left out

function element_values(v, depth)
{
    let literal = v.kind === "value" && (v.node.type === "ArrayExpression" || is_mapping(v.node));
    if(!literal) {
        return element_values_of(v, depth);
    }
    if(!v.off) {
        return capped(v, element_values_of(v, depth));
    }
    let bare = Object.assign({}, v, {via: []});
    let values = kept_values(ELEMENT_VALUES, v.node, depth, v.node, v.scope,
        () => capped(bare, unique_values(element_values_of(bare, depth))),
        () => [Object.assign({}, bare, {kind: "unknown", binding: null, var_root: null})]);
    return values.map((x) => Object.assign({}, x, {via: v.via}));
}

function element_values_of(v, depth)
{
    let out = [];
    if(v.kind === "param" && v.binding.rest) {
        out.push(Object.assign({}, v, {kind: "unknown", var_root: null}));
    } else if(v.kind === "param") {
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
    if(v.kind === "param" && v.binding && v.binding.rest) {
        /*  A rest parameter itself: every argument from there on, no position  */
        return Object.assign({}, v, {kind: "unknown", var_root: null});
    }
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
    let strings = string_list(n);
    if(strings) {
        return Object.assign({}, v, {kind: "unknown", strings});
    }
    if(is_dom(n, v.scope)) {
        return Object.assign({}, v, {kind: "dom"});
    }
    return Object.assign({}, v, {kind: "unknown"});
}

/***************************************************************
 *  The text of a string literal or of a template with no `${}`,
 *  or null
 ***************************************************************/
function static_string(n)
{
    if(n && n.type === "Literal" && typeof n.value === "string") {
        return n.value;
    }
    if(n && n.type === "TemplateLiteral" && n.expressions.length === 0) {
        return n.quasis[0].value.cooked;
    }
    return null;
}

/***************************************************************
 *  The strings of an array literal of two or more string literals,
 *  or null. Such an array is no createElement2 spec -- a spec holds
 *  its ATTRS in its second slot, an object -- but a list of strings:
 *  given to t(), the keys it tries in turn (i18next's fallbacks).
 ***************************************************************/
function string_list(n)
{
    if(!n || n.type !== "ArrayExpression" || n.elements.length < 2) {
        return null;
    }
    let out = [];
    for(let el of n.elements) {
        let s = static_string(el);
        if(s === null) {
            return null;
        }
        out.push(s);
    }
    return out;
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
 *  Is a value DOM? An array literal (a createElement2 spec; not a
 *  list of string literals, string_list()), or a call of a DOM
 *  builder: createElement2(), createOneHtml(), html_markup()
 *  imported from gobj-js, text_node() from gobj-ui,
 *  document.createElement() and the like. `scope` is the chain of
 *  ancestors of the node, where its names are resolved.
 ***************************************************************/
function is_dom(n, scope = [])
{
    if(n.type === "ArrayExpression") {
        return !string_list(n);
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
 *  chain of ancestors of the call; `args` the arguments as the
 *  callee receives them (call_kind(): those of `.call()` /
 *  `.apply()`; null, an array the source does not write out). Each
 *  leaf is one of leaves_of(), its `via` starting at the call.
 *
 *  A position the call does not reach (an argument not given) has no
 *  leaf: its default applies. An options object held in a variable,
 *  a spread, a parameter, a copy: followed like any value.
 *
 *  `fallbacks` (the entry's `fallbacks` of the position, or null):
 *  the positions the function reads FIRST, the position itself being
 *  only their fallback (`it.name || it.aria_label || it.id`). An
 *  object that surely gives one of them -- every value it can take
 *  there is a non-empty string -- does not reach the position, and has
 *  no leaf there; any other object (one that may give none of them, a
 *  parameter, data) reaches it.
 ***************************************************************/
function values_at(call, path, scope = [], args = call.arguments, fallbacks = null)
{
    let segs = String(path).split(".");
    let first = segs.shift().match(/^(\d+)(\[\])?$/);
    let at_call = {kind: "unknown", node: call, scope, via: [call], off: false};
    if(!first || !args) {
        return [at_call];
    }
    let idx = Number(first[1]);
    let call_scope = [...scope, call];
    for(let i = 0; i <= idx && i < args.length; i++) {
        if(args[i] && args[i].type === "SpreadElement") {
            return [Object.assign({}, at_call, {node: args[i]})];
        }
    }
    let arg = args[idx];
    if(!arg) {
        return [];
    }
    if(READ_AT.length === 0) {
        return from_read(arg, call_scope, () => values_at(call, path, scope, args, fallbacks));
    }

    let ctx = {scope: call_scope, via: [call], off: false};
    let cur = first[2]? elements_of(arg, ctx, 0) : expand(arg, ctx);
    let parent = String(path).slice(0, String(path).lastIndexOf(".") + 1);
    let shortcuts = (fallbacks || []).map((f) => f.slice(parent.length).split("."));
    for(let [i, seg] of segs.entries()) {
        let m = seg.match(/^([\w$]+)(\[\])?$/);
        if(!m) {
            return [at_call];
        }
        if(i === segs.length - 1 && shortcuts.length > 0) {
            cur = cur.filter((v) => !shortcuts.some((rel) => surely_given(v, rel)));
        }
        let next = [];
        for(let v of cur) {
            if(v.kind === "nothing" || (v.kind === "value" && v.node.type === "Literal")) {
                continue;       // the position is not reached: its default applies
            }
            next.push(...step_values(v, {prop: m[1], computed: false}, null, 0));
        }
        if(m[2]) {
            next = next.flatMap((v) => (v.kind === "nothing")? [] : element_values(v, 0));
        }
        cur = next;
    }
    return cur.map(classify);
}

/*  Does a value surely give a non-empty string at the steps `rel`
 *  (["name"], ["roll", "label"]) -- every value it can take there is
 *  one? Nothing, a parameter, data: not surely.  */
function surely_given(v, rel)
{
    let cur = [v];
    for(let prop of rel) {
        cur = cur.flatMap((o) => (o.kind === "nothing")? [o] : step_values(o, {prop, computed: false}, null, 0));
    }
    return cur.length > 0 && cur.every((x) => classify(x).kind === "key");
}

/*  The `fallbacks` of a position of an entry of I18N_KEY_FUNCTIONS  */
function fallbacks_of(entry, path)
{
    return (entry.fallbacks && entry.fallbacks[path]) || null;
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
 *  What a write TARGET sets -- the left of an `=`, the head of a
 *  for...of / for...in that declares nothing --: each identifier and
 *  each member it holds, through any destructuring (`[k, x.a] = v`,
 *  `({k, y: x.b = "d"} = v)`, `[...rest]`)
 ***************************************************************/
function write_targets(p, out = [])
{
    if(!p) {
        return out;
    }
    switch(p.type) {
        case "Identifier":
        case "MemberExpression":
            out.push(p);
            break;
        case "AssignmentPattern":
            write_targets(p.left, out);
            break;
        case "RestElement":
            write_targets(p.argument, out);
            break;
        case "ArrayPattern":
            for(let e of p.elements) {
                write_targets(e, out);
            }
            break;
        case "ObjectPattern":
            for(let q of p.properties) {
                write_targets((q.type === "RestElement")? q : q.value, out);
            }
            break;
        default:
            break;
    }
    return out;
}

/***************************************************************
 *  Everything a plain `let` / `var` is GIVEN, in the scope that
 *  declares it: the value of each declarator (one with none holds
 *  nothing), and the right side of every `=` to it (`||=`, `??=`,
 *  `&&=` too: the old value stays possible besides). EVERY other
 *  write to it is one whose value the reader does not read, and is
 *  listed in `unknown`: `+=`, `++`, a destructuring assignment
 *  (`[k, x] = v`, `({k} = v)`), the head of a for...of / for...in --
 *  the variable itself (`for(k of v)`), a destructuring of it
 *  (`for([k, x] of v)`, `for({k} of v)`), or a `var` of it declared
 *  again there (`for(var k of v)`) --, and a direct `eval()` in its
 *  scope, which can write any variable there. A `var` declared again
 *  with a value anywhere in its function or module (a block, a
 *  `for(;;)` init, a `switch` case) is one more declarator of it, so
 *  its value is one more value. A name of another binding (shadowing)
 *  is not a write to it.
 *
 *  With `members` (it holds a table, and what is read is a member of
 *  it), also what is written INTO it: `x.a = v`, `x[k] = v`,
 *  `x.a.b = v` (`steps`: from the variable to the member written),
 *  the elements `x.push(v)`, `x.unshift(v)`, `x.splice(i, n, v)`,
 *  `x.fill(v)` give it (a spread: every element of what is spread),
 *  and `Object.assign(x, v)` (v written over x). A `+=` or `++` on a
 *  member, and a member a destructuring or a loop head writes
 *  (`[x.a] = v`, `for(x.a of v)`), is unknown at that member.
 *
 *      -> {values: [{node, scope, steps, spread, into, pick}],
 *          unknown: [{node, steps, scope}]}
 *          `node` null: nothing (a declarator with no value); `into`:
 *          written into the variable, not given to it; `pick`: what a
 *          destructuring declarator reads from its value ({steps,
 *          default}, `let {title} = opts`)
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
    let visit = (n, chain) => {
        let into = (node) => (members? steps_to(node, (id) => is_it(id, chain)) : null);
        /*  `n` writes `target` with a value the reader does not read  */
        let opaque_write = (target) => {
            if(target.type === "Identifier") {
                if(is_it(target, chain)) {
                    unknown.push({node: n, steps: [], scope: chain});
                }
            } else if(target.type === "MemberExpression") {
                let steps = into(target);
                if(steps) {
                    unknown.push({node: n, steps, scope: chain});
                }
            }
        };
        switch(n.type) {
            case "VariableDeclarator":
                if(binding.declarators.includes(n)) {
                    values.push(n.init? {node: n.init, scope: chain, steps: [],
                                         pick: (binding.picks && binding.picks.get(n)) || null}
                                       : {node: null, steps: []});
                }
                break;
            case "AssignmentExpression": {
                let readable = /^(=|\|\|=|\?\?=|&&=)$/.test(n.operator);
                if(n.left.type === "Identifier") {
                    if(is_it(n.left, chain)) {
                        if(readable) {
                            values.push({node: n.right, scope: chain, steps: []});
                        } else {
                            unknown.push({node: n, steps: [], scope: chain});
                        }
                    }
                } else if(n.left.type === "MemberExpression") {
                    let steps = into(n.left);
                    if(steps && readable) {
                        values.push({node: n.right, scope: chain, steps, into: true});
                    } else if(steps) {
                        unknown.push({node: n, steps, scope: chain});
                    }
                } else {
                    /*  A destructuring assignment: `[k, x] = v`, `({k} = v)`  */
                    for(let target of write_targets(n.left)) {
                        opaque_write(target);
                    }
                }
                break;
            }
            case "UpdateExpression":
                if(is_it(n.argument, chain)) {
                    unknown.push({node: n, steps: [], scope: chain});
                } else if(n.argument.type === "MemberExpression") {
                    let steps = into(n.argument);
                    if(steps) {
                        unknown.push({node: n, steps, scope: chain});
                    }
                }
                break;
            case "CallExpression": {
                if(n.callee.type === "Identifier" && n.callee.name === "eval" && !n.optional) {
                    /*  Not run: a direct eval() of the SOURCE writes what its text says, which no
                     *  reader reads (in a module no other binding can be called `eval`); `eval?.()`
                     *  is an indirect one, which runs in the global scope  */
                    unknown.push({node: n, steps: [], scope: chain});
                    break;
                }
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
                            unknown.push({node: a, steps, scope: chain});
                        } else {
                            values.push({node: a, scope: chain, steps, into: true});
                        }
                    }
                }
                break;
            }
            case "ForOfStatement":
            case "ForInStatement":
                /*  Each turn writes an element (a key) into the head  */
                if(n.left.type === "VariableDeclaration") {
                    if(n.left.declarations.some((d) => binding.declarators.includes(d))) {
                        unknown.push({node: n, steps: [], scope: chain});     // `for(var k of v)`: the same var
                    }
                } else {
                    for(let target of write_targets(n.left)) {
                        opaque_write(target);
                    }
                }
                break;
            default:
                break;
        }
    };
    let sites = write_sites(root);
    let named = sites.by_name.get(binding.name) || [];
    let prefix = binding.scope.slice(0, -1);
    for(let i = 0, j = 0; i < named.length || j < sites.evals.length;) {
        let take_named = j >= sites.evals.length || (i < named.length && named[i].order < sites.evals[j].order);
        let site = take_named? named[i++] : sites.evals[j++];
        visit(site.n, prefix.concat(site.chain));
    }
    return {values, unknown};
}

/***************************************************************
 *  The nodes of a scope that can WRITE a variable, by the name of
 *  the variable a write is rooted at (`k = v`, `k.a = v`, `[k] = v`,
 *  `k++`, `k.push(v)`, `Object.assign(k, v)`, `for(k of v)`, a
 *  declarator of `k`), and every direct `eval()`, which can write
 *  any: the only nodes assigned_values() reads. Found in ONE walk of
 *  the scope, and kept: up to gobj-ui 7.26.44 the scope was walked
 *  again for every variable read in it, so a module of 1600 `let`s
 *  took 4 s, and twice as many four times as long.
 *
 *      -> {by_name: Map(name -> [site]), evals: [site]}, each list in
 *         the order of the source; site: {n, chain, order}, `chain`
 *         the nodes from the scope to `n`, both included
 ***************************************************************/
const WRITE_SITES = new WeakMap();      // a scope -> its write sites

function write_sites(root)
{
    let known = WRITE_SITES.get(root);
    if(known) {
        return known;
    }
    let by_name = new Map();
    let evals = [];
    let order = 0;
    let base_name = (target) => {
        while(target && target.type === "MemberExpression") {
            target = target.object;
        }
        return (target && target.type === "Identifier")? target.name : null;
    };
    walk(root, (n, ancestors) => {
        let names = [];
        switch(n.type) {
            case "VariableDeclarator":
                pattern_names(n.id, names);
                break;
            case "AssignmentExpression":
                if(n.left.type === "Identifier" || n.left.type === "MemberExpression") {
                    names.push(base_name(n.left));
                } else {
                    names.push(...write_targets(n.left).map(base_name));
                }
                break;
            case "UpdateExpression":
                names.push(base_name(n.argument));
                break;
            case "CallExpression": {
                if(n.callee.type === "Identifier" && n.callee.name === "eval" && !n.optional) {
                    evals.push({n, chain: [...ancestors, n], order: order++});
                    return;
                }
                let c = n.callee;
                if(c.type === "MemberExpression" && !c.computed && c.property.type === "Identifier"
                        && ELEMENT_WRITERS.has(c.property.name)) {
                    names.push(base_name(c.object));
                } else if(is_object_call(n, "assign") && n.arguments.length > 0) {
                    names.push(base_name(n.arguments[0]));
                }
                break;
            }
            case "ForOfStatement":
            case "ForInStatement":
                if(n.left.type === "VariableDeclaration") {
                    for(let d of n.left.declarations) {
                        pattern_names(d.id, names);
                    }
                } else {
                    names.push(...write_targets(n.left).map(base_name));
                }
                break;
            default:
                return;
        }
        let site = null;
        for(let name of new Set(names)) {
            if(name === null) {
                continue;
            }
            site = site || {n, chain: [...ancestors, n], order: order++};
            if(!by_name.has(name)) {
                by_name.set(name, []);
            }
            by_name.get(name).push(site);
        }
    });
    known = {by_name, evals};
    WRITE_SITES.set(root, known);
    return known;
}

/***************************************************************
 *  The leaves of what is read from a `let` / `var` -- the variable
 *  itself, or a member or an element of it (`root`, a var_root of
 *  expand()): every value it is given (assigned_values()), followed
 *  with expand() and then along the steps of `root`, a `let` met on
 *  the way followed into it.
 *
 *      -> {leaves: [leaf], complete, written, unread: [node],
 *          opaque: [{node, scope}], lets: [binding]}
 *
 *  `complete`: every leaf is known (a literal, a const that is one,
 *  nothing, DOM) and every write was read. `written`: some leaf was
 *  written INTO the variable (`x.a = "k"`, `x.push("k")`), which a
 *  const would not carry to the reader. `unread`: the node of each
 *  value it could not read; `opaque`, each write it could not read
 *  (`k += x`, a for...of over it), where it is (param_flows()).
 *  `lets`: the variables it went through, the first one first.
 ***************************************************************/
function var_leaves(root, seen = new Set(), depth = 0)
{
    if(READ_AT.length === 0) {
        return from_read(root.binding.declarators[0], root.binding.scope, () => var_leaves(root, seen, depth));
    }
    let b = root.binding;
    let steps = root.steps;
    let out = {leaves: [], complete: true, written: false, unread: [], opaque: [], lets: [b]};
    let id = `${b.declarators[0].start}:${b.name}:${JSON.stringify(steps)}`;
    if(seen.has(id)) {
        return out;
    }
    seen.add(id);
    if(depth > MAX_DEPTH) {
        give_up(b.declarators[0], b.scope, GIVE_UP_DEEP);
        out.complete = false;
        out.unread.push(b.declarators[0]);
        return out;
    }
    let {values, unknown} = assigned_values(b, steps.length > 0);
    for(let u of unknown) {
        if(paths_meet(u.steps, steps)) {
            out.complete = false;
            out.unread.push(u.node);
            out.opaque.push({node: u.node, scope: u.scope});
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
        if(v.pick) {
            /*  `let {title = "x"} = opts`: what the pattern reads from the value  */
            for(let step of v.pick.steps) {
                cur = cur.flatMap((o) => step_values(o, step, null, 0));
            }
            cur = with_default(cur, v.pick.default, ctx, 0);
        }
        for(let step of steps.slice(v.steps.length)) {
            cur = cur.flatMap((o) => step_values(o, step, null, 0));
        }
        for(let o of cur) {
            let leaf = classify(o);
            if(leaf.kind === "unknown" && leaf.var_root) {
                let r = var_leaves(leaf.var_root, seen, depth + 1);
                out.leaves.push(...r.leaves);
                out.unread.push(...r.unread);
                out.opaque.push(...r.opaque);
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
 *  The keys an UNMARKED plain `let` / `var` holds -- the variable
 *  itself read where a key is read (a leaf of leaves_of() with a
 *  var_root and no step) -- when every value it is given in its scope
 *  (assigned_values(): its value, every `=`, `||=`, `??=`, `&&=`) is,
 *  as WRITTEN, a string literal or nothing (literal_values()). Such a
 *  variable can only ever hold those literals, so they are the keys of
 *  the place that reads it -- ALL of them: the reading is
 *  flow-insensitive, and a literal an `if` keeps from reaching the
 *  place is asked for too (a sentinel that is no key is `null`). Given
 *  anything else -- a property of a table (`SHORT_MONTHS[m]`), an
 *  element, a call, a parameter, data --, or written in any way the
 *  reader does not read (`+=`, a destructuring, a loop head, a direct
 *  eval(): assigned_values() lists every write), it is not followed
 *  and answers [] -- the invisible case, which fails nothing. (expand()
 *  and var_leaves() read a member of a table as ANY value of it: good
 *  enough for a marker, which names the lists to check against, and
 *  too much to ask the locales for.) One declared by a destructuring,
 *  and a member or an element read from one, are not this: a marker
 *  follows those. Cached per variable.
 *
 *      -> [key]
 ***************************************************************/
const LITERAL_LETS = new WeakMap();     // the first declarator of a variable -> [string] | null

function literal_let_keys(leaf)
{
    if(leaf.kind !== "unknown" || !leaf.var_root) {
        return [];
    }
    let steps = leaf.var_root.steps;
    if(steps.length > 0 && steps.every(is_element_step)) {
        /*  `X[0][1]`, `X.slice(1)[0]`: an element of an element is one of its strings, or nothing  */
        return let_array_literals(leaf.var_root.binding) || [];
    }
    if(steps.length > 0) {
        return [];
    }
    return let_literals(leaf.var_root.binding, new Set()) || [];
}

/*  A step that reads an element: `X[i]`, `X[1]`, an element walked  */
function is_element_step(step)
{
    return !!step.each || !!step.slice || step.computed || array_index(step) !== null;
}

/***************************************************************
 *  The strings an ELEMENT of a plain `let` / `var` can be, when it is
 *  only ever given array literals of literal_values() and elements
 *  that are those (`X[0] = "k"`, `X.push("k")`): every one of them, at
 *  any index -- what a let holds at a place is not known, so `X[1]`
 *  and `t(...X)` read every element (let_array_length()). null for any
 *  other let: given anything else, or written in a way the reader does
 *  not read (assigned_values()). A write the reader does not see
 *  (`Reflect.set(X, 0, k)`, a function it is handed to) adds what it
 *  writes unread. Up to gobj-ui 7.26.48 an element of a let was read
 *  as nothing.
 ***************************************************************/
const LET_ARRAYS = new WeakMap();   // the first declarator of a variable -> {strings, length} | null

function let_array(b)
{
    if(!b || b.kind !== "var" || b.picks.size > 0) {
        return null;
    }
    let first = b.declarators[0];
    if(LET_ARRAYS.has(first)) {
        return LET_ARRAYS.get(first);
    }
    LET_ARRAYS.set(first, null);        // a let met again while it is read adds nothing
    let {values, unknown} = assigned_values(b, true);
    let out = (unknown.length === 0)? {strings: [], length: 0} : null;
    for(let v of values) {
        if(out === null) {
            break;
        }
        if(!v.node) {
            continue;
        }
        if(v.steps.length === 1 && v.steps[0].prop === "length") {
            continue;       // `X.length = n` gives no element, only holes
        }
        let a = (v.steps.length > 0)? null
            : (v.into && v.node.type === "ObjectExpression")? assigned_elements(v.node, v.scope)
            : array_literal_strings(v.node, v.scope);
        if(a) {
            out.length = Math.max(out.length, a.length);
            out.strings.push(...a.strings);
        } else if(v.steps.length === 0) {
            out = null;
        } else if(v.steps.length === 1 && is_element_step(v.steps[0]) && !v.spread) {
            let lits = literal_values(v.node, v.scope, new Set());
            if(lits === null) {
                out = null;
            } else {
                out.strings.push(...lits);
            }
        } else {
            out = null;
        }
    }
    if(out) {
        out.strings = [...new Set(out.strings)];
    }
    LET_ARRAYS.set(first, out);
    return out;
}

/***************************************************************
 *  The strings of the elements of what a value is, when it is written
 *  as nothing but literal arrays: {strings, length}, `length` its
 *  longest array. An array literal of literal_values() (a hole is
 *  nothing), `null` and `undefined` (no element), every branch of `?:`,
 *  `||` and `??` (the right one of `&&`), a const of one -- of the
 *  module or imported. null for anything else. Up to gobj-ui 7.26.50 a
 *  `let` given anything but an array literal was not followed, and
 *  `let X = c()? ["a"] : ["b"]; t(X[0])` asked for nothing.
 ***************************************************************/
function array_literal_strings(n, scope, seen = new Set())
{
    if(!n || seen.has(n)) {
        return null;
    }
    seen.add(n);
    switch(n.type) {
        case "ArrayExpression": {
            let out = {strings: [], length: n.elements.length};
            for(let e of n.elements) {
                let lits = (!e)? [] : is_spread(e)? null : literal_values(e, [...scope, n], new Set());
                if(lits === null) {
                    return null;
                }
                out.strings.push(...lits);
            }
            return out;
        }
        case "Literal":
            return (n.value === null && !n.regex)? {strings: [], length: 0} : null;
        case "ConditionalExpression":
        case "LogicalExpression": {
            let parts = (n.type === "ConditionalExpression")? [n.consequent, n.alternate]
                : (n.operator === "&&")? [n.right] : [n.left, n.right];
            let out = {strings: [], length: 0};
            for(let x of parts) {
                let a = array_literal_strings(x, scope, seen);
                if(!a) {
                    return null;
                }
                out.strings.push(...a.strings);
                out.length = Math.max(out.length, a.length);
            }
            return out;
        }
        case "Identifier": {
            let b = binding_of(n.name, scope);
            if(!b) {
                return (n.name === "undefined")? {strings: [], length: 0} : null;
            }
            if(b.kind === "import") {
                b = import_target(b);
            }
            if(b && b.kind === "const" && b.steps.length === 0 && !b.default) {
                return array_literal_strings(b.init, b.scope, seen);
            }
            return null;
        }
        default:
            return null;
    }
}

/*  The elements `Object.assign(X, {1: "k"})` writes into X, when it
 *  writes literal_values(): {strings, length}, or null  */
function assigned_elements(n, scope)
{
    let out = {strings: [], length: 0};
    for(let p of n.properties) {
        if(p.type !== "Property" || p.kind !== "init" || p.method) {
            return null;
        }
        let lits = literal_values(p.value, [...scope, n], new Set());
        if(lits === null) {
            return null;
        }
        out.strings.push(...lits);
        let i = array_index({prop: prop_name(p)});
        if(i !== null) {
            out.length = Math.max(out.length, i + 1);
        } else if(prop_name(p) === null) {
            return null;        // a computed key the reader does not follow: an index it cannot bound
        }
    }
    return out;
}

function let_array_literals(b)
{
    let a = let_array(b);
    return a? a.strings : null;
}

/***************************************************************
 *  The strings a plain `let` / `var` (binding_of(): {kind: "var"})
 *  can hold, when it is only ever given literal_values(): [string],
 *  or null. `seen` holds the variables on the way: one met again adds
 *  nothing of its own (the frame that met it first adds it), and only
 *  an answer found from no other variable's frame is kept.
 ***************************************************************/
function let_literals(b, seen)
{
    if(b.picks.size > 0) {
        return null;        // a part of what a destructuring reads: no plain variable
    }
    let first = b.declarators[0];
    if(LITERAL_LETS.has(first)) {
        return LITERAL_LETS.get(first);
    }
    if(seen.has(first)) {
        return [];
    }
    let outer = (seen.size === 0);
    seen.add(first);
    let {values, unknown} = assigned_values(b);
    let out = (unknown.length === 0)? [] : null;
    for(let v of values) {
        if(out === null) {
            break;
        }
        if(!v.node) {
            continue;       // declared with no value: undefined
        }
        let lits = literal_values(v.node, v.scope, seen);
        if(lits === null) {
            out = null;
        } else {
            out.push(...lits);
        }
    }
    let result = (out === null)? null : [...new Set(out)];
    if(outer) {
        LITERAL_LETS.set(first, result);
    }
    return result;
}

/***************************************************************
 *  The strings a value IS, when it is written as nothing but
 *  literals: a string literal or a template with no `${}` (an empty
 *  one is nothing), `null` and `undefined` (nothing), every branch of
 *  `?:`, `||` and `??` (the right one of `&&`: the left, when it is the
 *  value, is falsy), a const -- of the module or imported from one the
 *  reader reads -- bound to one of these, a plain `let` that is only
 *  ever one of these (let_literals()). [string], or null for anything
 *  else. `scope` is the chain of ancestors of `n`.
 ***************************************************************/
function literal_values(n, scope, seen, depth = 0)
{
    if(!n) {
        return null;
    }
    if(READ_AT.length === 0) {
        return from_read(n, scope, () => literal_values(n, scope, seen, depth));
    }
    if(depth > MAX_DEPTH) {
        give_up(n, scope, GIVE_UP_DEEP);
        return null;
    }
    let sub = (x, s = scope) => literal_values(x, s, seen, depth + 1);
    switch(n.type) {
        case "Literal":
            if(typeof n.value === "string") {
                return n.value? [n.value] : [];
            }
            return (n.value === null && !n.regex)? [] : null;
        case "TemplateLiteral": {
            if(n.expressions.length > 0) {
                return null;
            }
            let s = n.quasis[0].value.cooked;
            return s? [s] : [];
        }
        case "ConditionalExpression": {
            let a = sub(n.consequent);
            let c = sub(n.alternate);
            return (a && c)? [...a, ...c] : null;
        }
        case "LogicalExpression": {
            let r = sub(n.right);
            if(n.operator === "&&" || r === null) {
                return r;
            }
            let l = sub(n.left);
            return l? [...l, ...r] : null;
        }
        case "Identifier": {
            let b = binding_of(n.name, scope);
            if(!b) {
                return (n.name === "undefined")? [] : null;
            }
            if(b.kind === "const" && b.steps.length === 0) {
                return sub(b.init, b.scope);
            }
            if(b.kind === "import") {
                let x = import_target(b);
                return (x && x.kind === "const" && x.steps.length === 0)? sub(x.init, x.scope) : null;
            }
            if(b.kind === "var") {
                return let_literals(b, seen);
            }
            return null;
        }
        default:
            return null;
    }
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

/***************************************************************
 *  The PARAMETERS a value is built from, through what the reader
 *  does not follow: a call (`k.toLowerCase()`, `fmt(k)`), a
 *  concatenation, a template with `${}`, an iteration of
 *  Object.entries(), a rest parameter read by a computed index,
 *  `arguments`, a part of a parameter an array pattern
 *  destructures. Each name the value is built from is followed to
 *  what binds it: a const to its value, a `let` / `var` into
 *  everything it is given or written, the element of what a
 *  for...of or a callback walks; a parameter of a function around
 *  it is an answer. The property a computed member reads
 *  (`TABLE[k]`) is a lookup, not the value: it is not followed, nor
 *  is the body of a function, nor a number or a boolean (`!k`,
 *  `k++`).
 *
 *      -> [{binding, path, priv}]
 *
 *  `binding` is a parameter (binding_of(): "param", "param_part"),
 *  or an `arguments` (arguments_binding()); `path`, what is read from
 *  it (".title", "[]" an element of it), null when it cannot be said
 *  (through a call, a destructuring, an iteration of entries); `priv`,
 *  read through a gobj's `priv` (`gobj.priv.label`): the gobj's own
 *  state, never a key its caller hands. A METHOD's value comes from
 *  its object when the object comes from somewhere -- `k.trim()` from
 *  k, `priv.errors.get(path)` from the priv (`path` is the key of a
 *  lookup) -- and from its arguments otherwise (`fmt(k)`,
 *  `JSON.stringify(p)`). What a `let` is given and the elements put
 *  in it (`x.push(v)`) are what it holds; a property written into it
 *  (`x.title = v`) is not.
 *
 *  i18n_key_functions.test.js uses it on what the reader stops at,
 *  at the places a key is read: a function that hands a parameter on
 *  that way hands a key no position can name, and the test fails.
 ***************************************************************/
function param_flows(node, scope, seen = new Set(), depth = 0)
{
    /*  Through a call or an iteration a path names no position any more  */
    let unnamed = (flows) => flows.map((f) => (f.path === null)? f : {binding: f.binding, path: null, priv: f.priv});
    if(!node || typeof node.type !== "string") {
        return [];
    }
    if(READ_AT.length === 0) {
        return from_read(node, scope, () => param_flows(node, scope, seen, depth));
    }
    if(depth > MAX_DEPTH) {
        give_up(node, scope, GIVE_UP_DEEP);
        return [];
    }
    let sub = (n, s = scope) => param_flows(n, s, seen, depth + 1);
    switch(node.type) {
        case "Identifier": {
            if(node.name === "arguments") {
                let a = arguments_binding(scope);
                return a? [{binding: a, path: null, priv: false}] : [];
            }
            let b = binding_of(node.name, scope);
            if(!b) {
                return [];
            }
            switch(b.kind) {
                case "param":
                    return [{binding: b, path: b.rest? null : b.path, priv: false}];
                case "param_part":
                    return [{binding: b, path: null, priv: false}];
                case "const":
                    if(FUNCTION_RE.test(b.init.type)) {
                        return [];
                    }
                    return (b.steps.length > 0)? unnamed(sub(b.init, b.scope)) : sub(b.init, b.scope);
                case "each":
                    return sub(b.of, b.scope).map((f) => ({binding: f.binding, priv: f.priv,
                        path: (f.path !== null && b.steps.length === 0)? f.path + "[]" : null}));
                case "each_part":
                    return unnamed(sub(b.of, b.scope));
                case "other":
                    return b.init? unnamed(sub(b.init, b.scope)) : [];
                case "var": {
                    let id = `${b.declarators[0].start}:${b.name}`;
                    if(seen.has(id)) {
                        return [];
                    }
                    seen.add(id);
                    let {values, unknown} = assigned_values(b, true);
                    let out = [];
                    for(let v of values) {
                        /*  What it is given, and the elements put in it (`x.push(v)`); a
                         *  property written into it (`x.title = v`) is not what it is  */
                        if(v.node && (!v.into || (v.steps.length > 0 && v.steps[v.steps.length - 1].each))) {
                            out.push(...(v.into || v.pick? unnamed(sub(v.node, v.scope)) : sub(v.node, v.scope)));
                        }
                    }
                    for(let u of unknown) {
                        if(u.steps.length === 0) {
                            out.push(...unnamed(sub(u.node, u.scope)));
                        }
                    }
                    return out;
                }
                default:
                    return [];
            }
        }
        case "MemberExpression": {
            let step = member_step(node);
            return sub(node.object).map((f) => {
                let priv = f.priv || step.prop === "priv";
                if(f.path === null || step.prop === null || node.computed) {
                    return {binding: f.binding, path: null, priv};
                }
                return {binding: f.binding, path: f.path + "." + step.prop, priv};
            });
        }
        case "CallExpression":
        case "NewExpression": {
            /*  A method's value comes from its object when the object comes
             *  from somewhere (`k.toLowerCase()`; `priv.errors.get(path)` is a
             *  lookup in the gobj's state, `path` only its key); otherwise from
             *  the arguments (`fmt(k)`, `JSON.stringify(p)`, `"x".concat(k)`)  */
            let c = (node.callee.type === "ChainExpression")? node.callee.expression : node.callee;
            if(c.type === "MemberExpression") {
                let from_object = sub(c.object);
                if(from_object.length > 0) {
                    return unnamed(from_object);
                }
            } else if(!FUNCTION_RE.test(c.type) && c.type !== "Identifier") {
                let r = sub(c);
                if(r.length > 0) {
                    return unnamed(r);
                }
            }
            return unnamed(node.arguments.flatMap((a) => sub(a)));
        }
        case "ChainExpression":
            return sub(node.expression);
        case "TemplateLiteral":
            return node.expressions.flatMap((e) => sub(e));
        case "TaggedTemplateExpression":
            return node.quasi.expressions.flatMap((e) => sub(e));
        case "BinaryExpression":
        case "LogicalExpression":
            return [...sub(node.left), ...sub(node.right)];
        case "ConditionalExpression":
            return [...sub(node.consequent), ...sub(node.alternate)];
        case "AssignmentExpression":
            return sub(node.right);
        case "SequenceExpression":
            return sub(node.expressions[node.expressions.length - 1]);
        case "AwaitExpression":
        case "YieldExpression":
        case "SpreadElement":
            return sub(node.argument);
        case "ForOfStatement":
        case "ForInStatement":
            return sub(node.right);
        case "ArrayExpression":
            return node.elements.flatMap((e) => (e? sub(e) : []));
        case "ObjectExpression":
            return node.properties.flatMap((p) => (p.type === "SpreadElement")? sub(p.argument) :
                (p.kind === "init" && !p.method)? sub(p.value) : []);
        default:
            return [];
    }
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
 *
 *  It marks the node that starts right after it, through any
 *  parenthesis: `/\* i18n: data *\/ (a || b)` marks `a || b` (acorn
 *  keeps no node for the parenthesis, so the expression starts after
 *  it), and `/\* i18n: data *\/ (a || b).trim()` the call, which starts
 *  at it.
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
        while(next < ast.code.length && /[\s(]/.test(ast.code[next])) {
            next++;
            if(ast.code[next - 1] === "(") {
                at.set(next, marker);
            }
        }
        all.push(marker);
    }
    return {at, all, errors};
}

/***************************************************************
 *  What an unused marker stands before, said to whoever has to move
 *  it: the code that follows it, and what holds it when that tells
 *  why no key is read there (a declaration, an assignment)
 ***************************************************************/
function marker_misplaced(ast, m)
{
    let found = null;
    walk(ast, (n, ancestors) => {
        if(!found && n.start === m.next && n.type !== "Program") {
            found = {node: n, parent: ancestors[ancestors.length - 1] || null};
        }
    });
    let text = ast.code.slice(m.next, m.next + 60).split("\n")[0].trim();
    let before = text? `\`${text}${text.length >= 60? "..." : ""}\`` : "the end of the file";
    let where = "";
    if(found && found.parent) {
        let p = found.parent;
        if(p.type === "VariableDeclarator" && p.init === found.node) {
            where = ", the value a variable is DECLARED with: mark it where the variable is handed to a place " +
                    "a key is read";
        } else if(p.type === "AssignmentExpression" && p.right === found.node) {
            where = ", a value ASSIGNED: mark it where it is handed to a place a key is read";
        } else if(p.type === "ReturnStatement") {
            where = ", a value RETURNED: mark the call where it is handed to a place a key is read";
        } else if(/^(BinaryExpression|TemplateLiteral)$/.test(p.type)) {
            where = ", inside a concatenation or a template, which the reader does not read into: " +
                    "mark the whole value";
        }
    }
    return `the i18n marker stands before ${before}${where}. A marker marks the value it stands right ` +
           `before, where a key is read: what is handed to t(), an i18n / code / data-i18n* value, or ` +
           `a key position of a key function (an argument, a branch of one, a property value, or the ` +
           `whole call)`;
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
 *  The calls of a file to a key function, however the call reaches
 *  it (call_kind(): an import of a gobj-ui function under any name, a
 *  re-export, an alias, a map, `.call()` / `.apply()`; in the library
 *  module that defines it, the function itself). `table` is
 *  I18N_KEY_FUNCTIONS by default.
 *
 *      -> [{entry, call, scope, args}], `scope` the ancestors of the
 *         call, `args` the arguments the function receives
 ***************************************************************/
const KEY_CALLS = new WeakMap();    // a parsed file -> Map(table -> its key calls)

function key_calls_cached(ast, table)
{
    let per_table = KEY_CALLS.get(ast);
    return (per_table && per_table.has(table))? per_table.get(table) : null;
}

function set_key_calls(ast, table, calls)
{
    if(!KEY_CALLS.has(ast)) {
        KEY_CALLS.set(ast, new Map());
    }
    KEY_CALLS.get(ast).set(table, calls);
}

function key_calls(ast, lib_module, table = I18N_KEY_FUNCTIONS)
{
    program_url(ast, lib_module);
    let known = key_calls_cached(ast, table);
    if(known) {
        return known;
    }
    let out = [];
    walk(ast, (n, ancestors) => {
        if(n.type !== "CallExpression") {
            return;
        }
        ancestors.push(n);
        let c = call_kind(n, ancestors, table) || bind_kind(n, ancestors, table);
        ancestors.pop();
        if(c && c.kind === "key") {
            out.push({entry: c.entry, call: n, scope: ancestors.slice(), args: c.args});
        }
    });
    set_key_calls(ast, table, out);
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
 *  Is a leaf a TRANSLATED text -- a call of a translator
 *  (is_translator_call(): `t("...")`, `i18next.t("...")`, `tr()`, an
 *  alias, `t?.()`, `t.call()`), or a string built from one
 *  (is_translated_text(): `t("k") + ":"`, `t("k").toUpperCase()`)?
 *  At a key position it is a bug of its own: the function translates
 *  it again and marks it data-i18n with the translation, so it never
 *  changes language. What goes there is the key. DOM is no such text,
 *  whatever it holds.
 ***************************************************************/
function is_translation(leaf)
{
    return !!leaf.node && !KNOWN.has(leaf.kind) && is_translated_text(leaf.node, leaf.scope || []);
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
 *       `.map()` / for...of iterates, an import of one, a call of a
 *       function -- of the module or imported -- whose every return
 *       is one), or a plain `let` that is only ever given DOM;
 *    c) a key position of the enclosing table function, handed on
 *       (only in the library: an app's functions are in no table);
 *    d) MARKED where it is handed: `/\* i18n: <NAME>_I18N_KEYS *\/`
 *       (a module publishes those keys) or `/\* i18n: data *\/`.
 *
 *  A TRANSLATED text -- a call of any translator, is_translator_call():
 *  `t("...")`, `tr()`, an alias, `t?.()`, `t.call()`, or a string built
 *  from one, is_translated_text(): `t("k") + ":"` -- fails even when
 *  marked: what goes there is the key (`why: "translated"`). The calls
 *  are found however they reach a key function (key_calls()). `table`
 *  is I18N_KEY_FUNCTIONS by default.
 *
 *  A translator handed as a CALLBACK (translator_callbacks(): `keys.map(t)`,
 *  `promise.then(t)`) is held to the same rule: each element it is
 *  handed is a key position, and so is what a promise settles with --
 *  which no source writes, so it is marked or it fails (`name` "t",
 *  `path` the method it is handed to, `callback` set).
 *
 *      -> [{line, call_line, name, path, text, why, callback}]
 ***************************************************************/
function call_rule_violations(ast, lib_module, table)
{
    let markers = markers_of(ast);
    let out = [];
    let check = (leaves, call, name, path, callback) => {
        for(let leaf of leaves) {
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
                name: name,
                path: path,
                text: ast.code.slice(leaf.node.start, leaf.node.end).slice(0, 120),
                why: why,
                callback: callback || null
            });
        }
    };
    for(let {entry, call, scope, args} of key_calls(ast, lib_module, table)) {
        for(let path of entry.keys) {
            check(values_at(call, path, scope, args, fallbacks_of(entry, path)), call, entry.name, path, null);
        }
    }
    for(let {call, scope, callback} of translator_callbacks(ast, lib_module)) {
        let arg = ast.code.slice(callback.arg.start, callback.arg.end);
        let shown = (callback.form === "from")? `${callback.method}(..., ${arg})` :
            (callback.form === "call")? `.${callback.method}.call(..., ${arg})` :
            (callback.form === "apply")? `.${callback.method}.apply(..., [${arg}])` :
            `.${callback.method}(${arg})`;
        check(callback_leaves(call, callback, scope), call, "t", `${callback.method} callback`,
              {how: callback.how, shown});
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
    let text = v.text.replace(/\s+/g, " ");
    let cb = v.callback;
    if(v.why === "translated") {
        let what = cb? `${cb.shown} hands t() ${text}` : `${v.name}() [${v.path}] is given ${text}`;
        return `${where}: ${what}: a TRANSLATED text where a KEY goes (translated again and ` +
               `marked data-i18n with the translation, it never changes language, and no marker ` +
               `excuses it): hand the key, not t(key)`;
    }
    if(cb && cb.how === "settled") {
        return `${where}: ${cb.shown} hands t() what \`${text}\` settles with, as a key no source ` +
               `writes: mark the call /* i18n: data */ or /* i18n: <NAME>_I18N_KEYS */`;
    }
    if(cb) {
        return `${where}: ${cb.shown} hands t() each element it walks as a key, and the reader cannot ` +
               `follow ${text}: walk a const array (or a published list), or mark the call ` +
               `/* i18n: data */ or /* i18n: <NAME>_I18N_KEYS */`;
    }
    return `${where}: ${v.name}() [${v.path}] is given ${text}, which the reader cannot follow: hand it ` +
           `a literal or a const, or mark it /* i18n: data */ or /* i18n: <NAME>_I18N_KEYS */`;
}


                    /***************************
                     *      Published lists
                     ***************************/


/***************************************************************
 *  The `<NAME>_I18N_KEYS` arrays a module exports, READ, never run:
 *  `export const X = [...]`, `const X = [...]; export {X}`, either
 *  wrapped in Object.freeze(). Each element is a string literal, a
 *  template with no `${}`, or a spread of another array of the same
 *  module read the same way -- a top-level `const`, or a list it
 *  publishes: `[...BASE_I18N_KEYS, "k"]`.
 *
 *      -> {lists: [{name, keys}], errors: [why]}
 *
 *  Anything else so named is an ERROR, never skipped: the keys it
 *  holds would go unasked, and the build say OK. That covers an
 *  export that is not an array of literals (a spread of anything else
 *  included: an import, a `let`, a call), a list declared with `let`
 *  or `var` (it can be given other keys, which nobody reads: up to
 *  7.26.31 it was read, and a `.push()` on it hid keys), and a list
 *  nobody can read: one declared and not exported, one declared
 *  inside a function or a block, one declared by destructuring, one
 *  exported under a name that does not end in _I18N_KEYS. A
 *  re-export (`export {X} from "./y.js"`) is read in its own module.
 *  A list that is MUTATED fails too (list_mutations()).
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

    /*  What a list may spread: a const of the module (a list it publishes is one)  */
    let base_of = (name) => {
        let d = top.get(name);
        if(!d || !d.init || d.kind !== "const") {
            return null;
        }
        return d.init;
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
        if(d.kind !== "const") {
            errors.push(`${exported}: declared with ${d.kind}, which can be given other keys no reader ` +
                        `sees: a published list is an \`export const\` array of literals`);
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

/*  What changes the elements of an array in place  */
const ARRAY_MUTATORS = new Set(["push", "unshift", "splice", "fill", "copyWithin"]);
const OBJECT_MUTATORS = new Set(["assign", "defineProperty", "defineProperties"]);

/***************************************************************
 *  The places a file MUTATES a published list: one of its own
 *  (`lists`, published_lists()) or one it imports (an import whose
 *  name ends in _I18N_KEYS, or such a member of a namespace import:
 *  `import * as M from "./m.js"; M.X_I18N_KEYS`), by its name or
 *  through an ALIAS of it -- a const bound to one (`const a = X`), or
 *  a `let` / `var` given nothing else. A list is read as it is
 *  WRITTEN, so a key it is given later -- `.push()`, `.splice()`,
 *  `.unshift()`, `.fill()`, `X[i] = k`, `X.length = n`,
 *  `Object.assign(X, ...)`, `delete X[i]`, a reassignment -- is asked
 *  for by nobody. (Through a function it is handed to, or by
 *  `Array.prototype.push.call(X, k)`, it is not seen.)
 *
 *      -> [{line, why}]
 ***************************************************************/
function list_mutations(ast, lists = [])
{
    let names = new Set();
    let namespaces = false;
    for(let node of ast.body) {
        let decl = (node.type === "ExportNamedDeclaration")? node.declaration : node;
        if(decl && decl.type === "VariableDeclaration") {
            for(let d of decl.declarations) {
                if(d.id.type === "Identifier" && PUBLISHED_LIST_RE.test(d.id.name)) {
                    names.add(d.id.name);
                }
            }
        }
        if(node.type === "ExportNamedDeclaration" && !node.source) {
            for(let spec of node.specifiers) {
                if(lists.some((l) => l.name === (spec.exported.name || spec.exported.value))) {
                    names.add(spec.local.name);
                }
            }
        }
        if(node.type === "ImportDeclaration") {
            for(let spec of node.specifiers) {
                if(spec.type === "ImportSpecifier" && PUBLISHED_LIST_RE.test(spec.imported.name || spec.imported.value)) {
                    names.add(spec.local.name);
                }
                if(spec.type === "ImportNamespaceSpecifier") {
                    namespaces = true;
                }
            }
        }
    }
    if(names.size === 0 && !namespaces) {
        return [];
    }

    /*
     *  The list a node names, as said in a message, or null: its name
     *  bound at the top of the module, a member of a namespace import,
     *  or an alias of one of those. A chain of aliases is followed past
     *  MAX_DEPTH to its end, and the reader gives up only when a list is
     *  on it: up to gobj-ui 7.26.44 thirty aliases of any array, written
     *  into, failed a module that publishes a list. `far`: where it went
     *  past MAX_DEPTH, where it lost the end (past MAX_FOLLOW, or round
     *  a cycle of lets), and whether it met a list.
     */
    let list_of = (n, chain) => from_read(n, chain, () => {
        let far = {past: null, lost: null, list: false, seen: new Set()};
        let r = list_at(n, chain, 0, far);
        if(far.lost && (far.list || far.lost.why !== GIVE_UP_CYCLE)) {
            give_up(far.lost.node, far.lost.scope, far.lost.why);
            return null;
        }
        if(far.past && (r !== null || far.list)) {
            give_up(far.past.node, far.past.scope, GIVE_UP_DEEP);
            return null;
        }
        return r;
    });
    let list_at = (n, chain, depth, far) => {
        while(n && n.type === "ChainExpression") {
            n = n.expression;
        }
        if(!n) {
            return null;
        }
        if(depth > MAX_DEPTH && !far.past) {
            far.past = {node: n, scope: chain};
        }
        if(depth > MAX_FOLLOW) {
            far.lost = far.lost || {node: n, scope: chain, why: GIVE_UP_DEEP};
            return null;
        }
        if(n.type === "MemberExpression") {
            let step = member_step(n);
            if(step.prop === null || !PUBLISHED_LIST_RE.test(step.prop) || n.object.type !== "Identifier") {
                return null;
            }
            let b = binding_of(n.object.name, chain);
            if(b && b.kind === "import" && b.imported === "*") {
                far.list = true;
                return `${n.object.name}.${step.prop}`;
            }
            return null;
        }
        if(n.type !== "Identifier") {
            return null;
        }
        let b = binding_of(n.name, chain);
        if(!b || !b.scope) {
            return null;
        }
        if(names.has(n.name) && b.scope.length === 1) {
            far.list = true;
            return n.name;
        }
        if(b.kind === "const" && b.steps.length === 0) {
            if(far.seen.has(b.init)) {
                far.lost = far.lost || {node: b.init, scope: b.scope, why: GIVE_UP_CYCLE};
                return null;
            }
            far.seen.add(b.init);
            let inner = list_at(b.init, b.scope, depth + 1, far);
            far.seen.delete(b.init);
            return inner? `${inner} (through its alias \`${n.name}\`)` : null;
        }
        if(b.kind === "var" && b.picks.size === 0) {
            /*  A `let` that is only ever given the list is an alias of it (the
             *  first value asked first: `let out = []` is no alias, and costs
             *  no walk of its scope)  */
            let first = b.declarators[0];
            if(far.seen.has(first)) {
                far.lost = far.lost || {node: first, scope: b.scope, why: GIVE_UP_CYCLE};
                return null;
            }
            far.seen.add(first);
            let inner = null;
            try {
                inner = first.init? list_at(first.init, b.scope, depth + 1, far) : null;
                if(!inner) {
                    return null;
                }
                let {values, unknown} = assigned_values(b);
                if(unknown.length > 0
                        || values.some((v) => !v.node || list_at(v.node, v.scope, depth + 1, far) !== inner)) {
                    return null;
                }
            } finally {
                far.seen.delete(first);
            }
            return `${inner} (through its alias \`${n.name}\`)`;
        }
        return null;
    };
    let out = [];
    let say = (n, name) => {
        out.push({line: line_of(ast, n.start),
                  why: `the published list ${name} is MUTATED (\`${ast.code.slice(n.start, n.end).slice(0, 80)}\`): ` +
                       `it is read as it is written, so what it is given here is asked for by nobody -- ` +
                       `write every key in its array literal`});
    };
    walk(ast, (n, ancestors) => {
        let chain = null;
        let list = (x) => {
            chain = chain || [...ancestors, n];
            return list_of(x, chain);
        };
        let name = null;
        if(n.type === "CallExpression") {
            let c = n.callee;
            if(c.type === "MemberExpression" && !c.computed && ARRAY_MUTATORS.has(c.property.name)) {
                name = list(c.object);
            } else if(c.type === "MemberExpression" && !c.computed && c.object.type === "Identifier"
                    && (c.object.name === "Object" || c.object.name === "Reflect")
                    && (OBJECT_MUTATORS.has(c.property.name) || c.property.name === "set")) {
                name = list(n.arguments[0]);
            }
        } else if(n.type === "AssignmentExpression") {
            if(n.left.type === "MemberExpression") {
                name = list(n.left) || list(n.left.object);
            } else if(n.left.type === "Identifier" && names.has(n.left.name)) {
                /*  The list itself given another value: an alias given one is no mutation  */
                let x = list(n.left);
                name = (x === n.left.name)? x : null;
            }
        } else if(n.type === "UpdateExpression" && n.argument.type === "MemberExpression") {
            name = list(n.argument.object);
        } else if(n.type === "UnaryExpression" && n.operator === "delete" && n.argument.type === "MemberExpression") {
            name = list(n.argument.object);
        }
        if(name) {
            say(n, name);
        }
    });
    return out;
}


                    /***************************
                     *      The scan
                     ***************************/


/***************************************************************
 *  The modules of the library whose `code` properties are i18n keys:
 *  the findings of the schema checks (schema_validate.js) and the
 *  conflicts of an import (schema_import.js), which the schema editor
 *  (c_yui_schema_editor.js, which also writes some) hands to
 *  `t(finding.code)` / `t(conflict.code)`. Anywhere else a `code` is
 *  whatever the code says -- a language (`{code: "en"}`), an error
 *  number --, and no key: up to 7.26.42 every `code` of every file was
 *  read as one, and so was any `add("error", x)`, a `classList.add()`
 *  included. (The checks' own add() is a key function of the table.)
 *  i18n_key_functions.test.js holds the list to the library: a module
 *  that writes a literal `code` is in it, and only those.
 ***************************************************************/
const CODE_KEY_MODULES = new Set(["schema_validate.js", "schema_import.js", "c_yui_schema_editor.js"]);

/***************************************************************
 *  Every place a parsed file READS a key, with the leaves of what
 *  stands there (leaves_of(), values_at()):
 *
 *      -> [{what, node, leaves, entry, path}]
 *
 *  `what` says which place it is:
 *
 *      "t"           the key of a TRANSLATOR call (call_kind(): t(),
 *                    tr(), `i18next.t()`, an alias, `t?.()`,
 *                    `t.call(x, key)`); an array there is the list of
 *                    keys i18next tries in turn, each one a key
 *      "attribute"   setAttribute("data-i18n*", <key>) and
 *                    setAttributeNS(ns, "data-i18n*", <key>), the name a
 *                    literal or a const the reader follows to one
 *      "property"    an `i18n` or `data-i18n*` property of an object
 *                    literal (`{[ATTR]: k}` with ATTR a const bound to
 *                    one), one of ctx.attr_keys, or a `code` in a module
 *                    of CODE_KEY_MODULES
 *      "array"       an element of one of ctx.array_keys
 *      "assignment"  `x.i18n = <key>`, `x["data-i18n-title"] = <key>`,
 *                    `x[ATTR] = <key>`, `el.dataset.i18nTitle = <key>`
 *                    (`dataset.i18nX` IS the attribute data-i18n-x)
 *      "call"        a key position of a key function: `entry` and
 *                    `path` say which
 *      "callback"    a translator handed as a CALLBACK
 *                    (translator_callback(), in `callback`): each element
 *                    of what `keys.map(t)` walks, or what `.then(t)` is
 *                    handed (callback_leaves())
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
    let table = ctx.table || I18N_KEY_FUNCTIONS;
    program_url(ast, ctx.lib_module || null);
    /*  One walk: the key calls and the translators handed as callbacks
     *  are found on the way (key_calls(), translator_callbacks() get them)  */
    let known_calls = key_calls_cached(ast, table);
    let calls = known_calls || [];
    let known_callbacks = CALLBACKS.get(ast) || null;
    let callbacks = known_callbacks || [];
    let out = [];
    let read = (what, node, scope, root) => {
        if(node) {
            out.push({what, node: root, leaves: leaves_of(node, scope, root)});
        }
    };
    let read_t = (node, scope, root) => {
        if(node) {
            out.push({what: "t", node: root, leaves: key_list_leaves(node, scope, root)});
        }
    };
    /*  The names a property or an attribute is given: a literal, or a
     *  const (a branch of them) the reader follows  */
    let names_of = (node, scope) => {
        let s = static_string(node);
        return (s !== null)? [s] : static_keys(node, scope).keys;
    };
    let is_i18n_name = (name) => name === "i18n" || DATA_I18N_ATTR_RE.test(name);
    let codes_are_keys = CODE_KEY_MODULES.has(ctx.lib_module);
    let is_property_key = (x) => is_i18n_name(x) || (x === "code" && codes_are_keys) || attr_keys.has(x);
    walk(ast, (n, ancestors) => {
        switch(n.type) {
            case "CallExpression": {
                ancestors.push(n);
                let c = call_kind(n, ancestors, table) || bind_kind(n, ancestors, table);
                ancestors.pop();
                if(c && c.kind === "key") {
                    /*  A key function (a `tr` of the library too): read where its table says  */
                    if(!known_calls) {
                        calls.push({entry: c.entry, call: n, scope: ancestors.slice(), args: c.args});
                    }
                    break;
                }
                let name = callee_name(n.callee);
                if(c && c.kind === "t") {
                    read_t(c.args? c.args[0] : null, [...ancestors, n], n);
                } else if((name === "setAttribute" && n.arguments.length >= 2)
                        || (name === "setAttributeNS" && n.arguments.length >= 3)) {
                    /*  setAttributeNS(ns, name, value): the same, one argument on  */
                    let at = (name === "setAttributeNS")? 1 : 0;
                    let scope = [...ancestors, n];
                    if(names_of(n.arguments[at], scope).some((x) => DATA_I18N_ATTR_RE.test(x))) {
                        read("attribute", n.arguments[at + 1], scope, n);
                    }
                }
                if(!known_callbacks && may_take_a_callback(n)) {
                    let scope = [...ancestors, n];
                    let cb = translator_callback(n, scope);
                    if(cb) {
                        callbacks.push({call: n, scope, callback: cb});
                    }
                }
                break;
            }
            case "Property": {
                if(ancestors[ancestors.length - 1].type !== "ObjectExpression") {
                    break;      // a destructuring pattern
                }
                let name = prop_name(n);
                let names = null;
                if(name !== null) {
                    if(!is_property_key(name) && !array_keys.has(name)) {
                        break;
                    }
                    names = [name];
                }
                if(!names && !n.computed) {
                    break;
                }
                let scope = [...ancestors, n];
                names = names || names_of(n.key, scope);
                if(names.some(is_property_key)) {
                    read("property", n.value, scope, n);
                }
                if(names.some((x) => array_keys.has(x)) && n.value.type === "ArrayExpression") {
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
                let o = n.left.object;
                let dataset = (o.type === "MemberExpression" && member_step(o).prop === "dataset");
                let fits = (x) => is_i18n_name(x) || (dataset && DATASET_I18N_RE.test(x));
                if(name !== null && !fits(name)) {
                    break;
                }
                if(name === null && !n.left.computed) {
                    break;
                }
                let scope = [...ancestors, n];
                if(name !== null || names_of(n.left.property, scope).some(fits)) {
                    read("assignment", n.right, scope, n);
                }
                break;
            }
            default:
                break;
        }
    });
    if(!known_calls) {
        set_key_calls(ast, table, calls);
    }
    if(!known_callbacks) {
        CALLBACKS.set(ast, callbacks);
    }
    for(let {entry, call, scope, args} of calls) {
        for(let path of entry.keys) {
            out.push({what: "call", node: call, entry, path,
                      leaves: values_at(call, path, scope, args, fallbacks_of(entry, path))});
        }
    }
    for(let {call, scope, callback} of callbacks) {
        out.push({what: "callback", node: call, callback, leaves: callback_leaves(call, callback, scope)});
    }
    return out;
}

/***************************************************************
 *  The translators a parsed file hands as CALLBACKS
 *  (translator_callback()), found by key_places() on its walk or by
 *  a walk of their own, and kept:
 *
 *      -> [{call, scope, callback}], `scope` the ancestors of the call,
 *         the call last
 ***************************************************************/
const CALLBACKS = new WeakMap();    // a parsed file -> its translator callbacks

function translator_callbacks(ast, lib_module = null)
{
    program_url(ast, lib_module);
    if(CALLBACKS.has(ast)) {
        return CALLBACKS.get(ast);
    }
    let out = [];
    walk(ast, (n, ancestors) => {
        if(n.type === "CallExpression" && may_take_a_callback(n)) {
            let scope = [...ancestors, n];
            let cb = translator_callback(n, scope);
            if(cb) {
                out.push({call: n, scope, callback: cb});
            }
        }
    });
    CALLBACKS.set(ast, out);
    return out;
}

/*  Can a call be one translator_callback() looks at: a method of
 *  ITERATION_METHODS, `then` / `catch`, or `Array.from()`?  */
function may_take_a_callback(n)
{
    let c = (n.callee.type === "ChainExpression")? n.callee.expression : n.callee;
    if(c.type !== "MemberExpression" || n.arguments.length === 0) {
        return false;
    }
    let m = member_step(c).prop;
    if(m === null && c.computed) {
        return true;        // a name translator_callback() may follow to one of them
    }
    return ITERATION_METHODS.has(m) || SETTLE_METHODS.has(m) || ARRAY_BUILDERS.has(m) || m === "call" || m === "apply";
}

/***************************************************************
 *  The leaves of what a translator handed as a callback is called
 *  with (translator_callback()): each element of the array, as
 *  leaves_of() reads it, or -- for a promise -- one value the reader
 *  cannot follow, the call. Their `via` starts at the call and at the
 *  translator handed: a marker stands before the call (and so before
 *  the array: `/\* i18n: data *\/ keys.map(t)`) or before the
 *  translator.
 ***************************************************************/
function callback_leaves(call, callback, scope)
{
    let via = [call, callback.arg];
    if(callback.how === "elements") {
        return from_read(callback.receiver, scope,
            () => elements_of(callback.receiver, {scope, via, off: false}, 0).map(classify));
    }
    return [{kind: "unknown", node: call, scope: scope.slice(0, -1), via, off: false}];
}

/***************************************************************
 *  The leaves of the key of a translator call: leaves_of(), but an
 *  array of keys is read as the keys it holds -- `t([k, "fallback"])`,
 *  i18next's list of fallback keys, asks for each
 ***************************************************************/
function key_list_leaves(node, scope, root)
{
    return from_read(node, scope, () => {
        let out = [];
        for(let v of expand(node, {scope, via: [root], off: false})) {
            if(v.kind === "value" && v.node.type === "ArrayExpression") {
                out.push(...element_values(v, 0).map(classify));
            } else {
                out.push(classify(v));
            }
        }
        return out;
    });
}

/***************************************************************
 *  The keys one parsed file asks for.
 *
 *      ctx: {lib_module (its name in src/, or null for an app file),
 *            attr_keys, array_keys (Sets), declared (Set)}
 *      -> {keys: Set, read_keys: Set (those READ, not published by a
 *          list), declared_seen: Set,
 *          lists: [{name, keys}], list_errors: [why],
 *          list_mutations: [{line, why}] (list_mutations()),
 *          marker_refs: [{lists, keys, line, shapes}],
 *          marker_errors: [{line, why}],
 *          translated_errors: [{line, why}]}
 *
 *  Every place a key is read (key_places()) goes through leaves_of(),
 *  so a marker standing there is found: one that marks no such place,
 *  or that is not a marker at all, is an error, which says what it
 *  stands before. So is a DATA marker on what the reader follows to
 *  keys and nothing else (a literal, a const that is one, a `?:`
 *  branch that is one, a call of a function -- of the module, or
 *  imported -- that returns literals): it claims data where the
 *  reader reads a key; and one that would HIDE keys the reader does
 *  not read: a call whose returns mix keys and data, an array of
 *  string literals. Under a LIST marker those keys are asked for and
 *  must be in the lists, and a template with `${}` must have the
 *  shape of a key of them (`shapes`, checked where the lists are
 *  known: shape_owner_check()).
 *
 *  A TRANSLATED text (is_translation()) where a key is read -- given
 *  to t(), to an `i18n` / `data-i18n*` value (a `code` where it is a
 *  key), to a data-i18n* attribute -- is an error, MARKED OR NOT
 *  (`translated_errors`): the place keeps the translation as its key,
 *  and it never changes language. Up to 7.26.41 only a marked one
 *  failed, so `{i18n: t("k")}` passed and `{i18n: /\* i18n: data *\/
 *  t("k")}` did not. At a key position of a key function and at a
 *  translator handed as a callback the rule per call says it
 *  (call_rule_violations()).
 ***************************************************************/

/*  Where key_places() reads a key, as a message says it  */
const PLACE_NAMES = {
    t: "handed to a translator as its key",
    attribute: "given to a data-i18n* attribute",
    property: "given to a property that holds a key (i18n, code, data-i18n*)",
    array: "given as an element of a list of keys",
    assignment: "written to a property that holds a key (i18n, data-i18n*)"
};

function scan_ast(ast, ctx)
{
    program_url(ast, ctx.lib_module || null);
    let keys = new Set();
    let declared_seen = new Set();
    let declared = ctx.declared || new Set();
    let markers = markers_of(ast);
    let var_errors = [];
    let vars_checked = new Set();
    let text_of = (n) => ast.code.slice(n.start, n.end).replace(/\s+/g, " ").slice(0, 80);

    /*
     *  What a leaf holds that the reader does not READ, and a marker
     *  standing on it must answer for: the keys of a call whose
     *  returns mix keys and data (`partial`), the strings of an array
     *  of string literals (`strings`), the shape of a template with
     *  `${}`. Under a list marker the keys are asked for and must be
     *  in the lists, and a template must have the shape of some key of
     *  them; under a data marker, keys the marker would hide fail.
     */
    let answer = (leaf, m) => {
        let held = leaf.partial || leaf.strings || null;
        if(held && held.length > 0) {
            if(m.kind === "lists") {
                for(let k of held) {
                    keys.add(k);
                    m.keys.add(k);
                }
            } else {
                m.hidden.push({leaf, keys: held});
            }
        }
        if(m.kind === "lists" && leaf.kind === "unknown" && leaf.node && leaf.node.type === "TemplateLiteral"
                && leaf.node.expressions.length > 0) {
            m.shapes.push({text: text_of(leaf.node), source: template_shape(leaf.node),
                           bottom: template_bottom(leaf.node)});
        }
    };

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
        let id = `${m.line}:${b.declarators[0].start}:${b.name}:${JSON.stringify(root.steps)}`;
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
        for(let l of r.leaves) {
            answer(l, m);
        }
    };

    /*  `place.what`: the kind of place (key_places()). At a key position of
     *  a key function and at a translator handed as a callback, a
     *  TRANSLATED text is the rule's (call_rule_violations()); anywhere
     *  else it is said here, marked or not (`translated`).  */
    let translated = [];        // [{what, place, leaf, marker}]
    let take = (place) => {
        let what = place.what;
        for(let leaf of place.leaves) {
            if(leaf.kind === "key") {
                keys.add(leaf.value);
            }
            let m = marker_of(leaf, markers);
            if(m) {
                m.used = true;
                if(!m.keys) {
                    m.keys = new Set();
                    m.leaves = [];
                    m.hidden = [];
                    m.shapes = [];
                }
                m.leaves.push(leaf);
                if(leaf.kind === "key") {
                    m.keys.add(leaf.value);
                }
                if(leaf.kind === "unknown" && leaf.var_root) {
                    check_marked_var(leaf, m);
                }
                answer(leaf, m);
            } else if(what !== "call" && what !== "callback") {
                /*  An unmarked `let` that can only hold literals holds keys  */
                for(let k of literal_let_keys(leaf)) {
                    keys.add(k);
                }
            }
            if(what !== "call" && what !== "callback" && is_translation(leaf)) {
                translated.push({what, place: place.node, leaf, marker: m});
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
        take(place);
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
            marker_errors.push({line: m.line, why: marker_misplaced(ast, m)});
            continue;
        }
        if(m.kind === "lists") {
            marker_refs.push({lists: m.lists, keys: [...m.keys], line: m.line, shapes: m.shapes});
            continue;
        }
        if(m.leaves.every((l) => KNOWN.has(l.kind)) && m.keys.size > 0) {
            let held = [...m.keys].map((k) => JSON.stringify(k)).join(", ");
            marker_errors.push({line: m.line, why: `marked as data, but what it marks is the key ` +
                `${held}, which the reader follows: drop the marker (it is no data)`});
            continue;
        }
        for(let h of m.hidden) {
            let held = h.keys.map((k) => JSON.stringify(k)).join(", ");
            let what = text_of(h.leaf.node);
            marker_errors.push({line: m.line, why: h.leaf.strings?
                `marked as data, but what it marks is an array of string literals (${held}), which is no ` +
                `DOM -- a createElement2 spec carries its attrs, an object, in its second slot --: the marker ` +
                `would hide those strings. Hand each key where it is read, or build the DOM` :
                `marked as data, but \`${what}\` can also return the key ${held}: the reader does not read ` +
                `a call whose returns mix keys with what it cannot follow, and the marker would hide that ` +
                `key. Split the branches: hand the key where it is read (a literal, a const) and mark ` +
                `only the data`});
        }
    }

    /*  A TRANSLATED text where a key is read: marked (at the marker's line) or not  */
    let translated_errors = [];
    let said = new Set();
    for(let {what, place, leaf, marker} of translated) {
        /*  A const imported from another file: its text is that file's, and the
         *  line said is the place's, here  */
        let program = (leaf.scope && leaf.scope.length > 0 && typeof leaf.scope[0].code === "string")?
            leaf.scope[0] : ast;
        let text = program.code.slice(leaf.node.start, leaf.node.end).replace(/\s+/g, " ").slice(0, 80);
        let place_line = line_of(ast, place.start);
        let line = marker? marker.line : (program === ast)? line_of(ast, leaf.node.start) : place_line;
        let read_at = (line !== place_line)? ` (read at line ${place_line})` : "";
        let why = marker?
            `marked as ${marker.kind === "data"? "data" : "keys of " + marker.lists.join(", ")}, but ` +
            `\`${text}\` is a TRANSLATED text: where a key is read, the translation is kept as its key ` +
            `and never changes language, and no marker excuses it: hand the key, not t(key)` :
            `\`${text}\` is a TRANSLATED text ${PLACE_NAMES[what] || "where a key is read"}${read_at}: the ` +
            `translation is kept as its key and never changes language: hand the key, not t(key)`;
        if(!said.has(`${line} ${why}`)) {
            said.add(`${line} ${why}`);
            translated_errors.push({line, why});
        }
    }

    return {
        keys,
        read_keys,
        declared_seen,
        lists: published.lists,
        list_errors: published.errors,
        list_mutations: list_mutations(ast, published.lists),
        marker_refs,
        marker_errors,
        translated_errors
    };
}

/***************************************************************
 *  The shape of a template with `${}`: a regex source every string
 *  it can build matches (`monitor ${control}` -> ^monitor [\s\S]*$)
 ***************************************************************/
function template_shape(node)
{
    let esc = (q) => q.value.cooked.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return "^" + node.quasis.map(esc).join("[\\s\\S]*") + "$";
}

/***************************************************************
 *  A template with each `${}` replaced by a character no literal
 *  part holds (`monitor confirm ${control}` -> "monitor confirm \0").
 *  Every string template A builds has the shape of template B exactly
 *  when B's shape matches A's bottom: B's `${}`s must take the \0s,
 *  and what takes a \0 takes any string.
 ***************************************************************/
const TEMPLATE_HOLE = "\u0000";

function template_bottom(node)
{
    return node.quasis.map((q) => q.value.cooked).join(TEMPLATE_HOLE);
}

/***************************************************************
 *  A template marked with lists (`shape`: {text, source, bottom}),
 *  checked against the keys of those lists and every other marked
 *  template (`shapes`, each with its `label` and `line`):
 *
 *      {narrower: null}        some key of the lists has its shape and
 *                              no NARROWER template builds it -- a
 *                              template whose shape lies strictly
 *                              inside this one's
 *      {narrower: shape}       every key of its shape is one of that
 *                              narrower template (`monitor confirm
 *                              ${control}` inside `monitor ${control}`):
 *                              the marker names the other's list
 *      null                    no key of the lists has its shape
 *
 *  A key that a narrower template builds is that template's: the
 *  wider one builds it only when what fills its `${}` carries a
 *  literal part of the narrower one ("confirm start" in `monitor
 *  ${control}`), which code that writes both templates does not do.
 *  So a marker that names the list of the other template fails at
 *  BOTH templates, where up to 7.26.34 only the narrower one failed
 *  ("monitor confirm start" has the shape `^monitor .*$`).
 ***************************************************************/
function shape_owner_check(shape, keys, shapes)
{
    let re = new RegExp(shape.source);
    let own = keys.filter((k) => re.test(k));
    if(own.length === 0) {
        return null;
    }
    let narrower = shapes.filter((u) => u.source !== shape.source && re.test(u.bottom)
                                         && !new RegExp(u.source).test(shape.bottom));
    let free = own.filter((k) => !narrower.some((u) => new RegExp(u.source).test(k)));
    if(free.length > 0) {
        return {narrower: null};
    }
    return {narrower: narrower.find((u) => new RegExp(u.source).test(own[0]))};
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
    RUN_SOURCES = [];
    for(let dir of opts.src) {
        if(existsSync(dir)) {
            RUN_SOURCES.push(...source_files(dir, opts.locales));
        }
    }
    try {
        return collect_run_keys(opts);
    } finally {
        RUN_SOURCES = null;
    }
}

function collect_run_keys(opts)
{
    GAVE_UP.clear();
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
    let excluded = new Set((opts.exclude || []).map((u) => u.href));
    let barrel = barrel_export_map();
    let published = new Map();      // list name -> Set of keys
    let refs = [];                  // [{label, line, lists, keys}]

    let scan = (url, lib_module) => {
        let label = lib_module? `gobj-ui/src/${lib_module}` : relative(process.cwd(), fileURLToPath(url));
        /*  Parsed once: the reader that follows an import into a module
         *  reads the same tree the scan reads  */
        let ast = AST_CACHE.get(url.href) || null;
        if(!ast) {
            try {
                ast = parse_source(readFileSync(url, "utf8"), url);
            } catch(e) {
                AST_CACHE.set(url.href, null);
                fail(`${label} cannot be parsed (${e.message}): the keys it asks for are NOT checked`);
                return [];
            }
            AST_CACHE.set(url.href, ast);
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
        for(let e of r.list_mutations) {
            fail(`${label}:${e.line}: ${e.why}`);
        }
        for(let list of r.lists) {
            if(!published.has(list.name)) {
                published.set(list.name, new Set());
            }
            for(let k of list.keys) {
                published.get(list.name).add(k);
            }
        }
        for(let e of [...r.marker_errors, ...r.translated_errors]) {
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
    let all_shapes = refs.flatMap((ref) => (ref.shapes || []).map((s) =>
        Object.assign({label: ref.label, line: ref.line}, s)));
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
        let them = (ref.lists.length > 1)? "them" : "it";
        for(let shape of ref.shapes || []) {
            let r = shape_owner_check(shape, names.flatMap((name) => [...published.get(name)]), all_shapes);
            if(!r) {
                fail(`${ref.label}:${ref.line}: the i18n marker names ${ref.lists.join(", ")} for ` +
                     `${shape.text}, and no key of ${them} has that shape: publish the keys the template builds`);
            } else if(r.narrower) {
                let u = r.narrower;
                fail(`${ref.label}:${ref.line}: the i18n marker names ${ref.lists.join(", ")} for ` +
                     `${shape.text}, and every key of ${them} with that shape has the shape of a narrower ` +
                     `template, ${u.text} (${u.label}:${u.line}), which builds those keys: name the list ` +
                     `of the keys ${shape.text} builds`);
            }
        }
    }

    /*  Where the reader gave up: a key behind it would go unasked  */
    for(let g of gave_up()) {
        let module = lib_module_of(g.url);
        let label = module? `gobj-ui/src/${module}` : g.url? relative(process.cwd(), fileURLToPath(g.url)) : "?";
        let past = "";
        if(g.past) {
            let past_module = lib_module_of(g.past.url);
            let past_label = past_module? `gobj-ui/src/${past_module}` :
                g.past.url? relative(process.cwd(), fileURLToPath(g.past.url)) : "?";
            past = ` (past \`${g.past.text}\`, ${past_label}:${g.past.line})`;
        }
        fail(`${label}:${g.line}: the reader gave up on \`${g.text}\`${past}, and a key behind it would go ` +
             `unasked: ${g.why}`);
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
 *  `_` is a comment. And the `id` of a menu or a toolbar item with no
 *  `name`, and of a C_YUI_NODE node with no `label`, is a key where the
 *  library names it by it (menu_item_keys(), toolbar_item_keys(),
 *  node_tree_keys()).
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
    menu_item_keys(config, keys, is_key);
    toolbar_item_keys(config, keys, is_key);
    node_tree_keys(config, keys, is_key);
}

/***************************************************************
 *  The `id` of a NODE of a C_YUI_NODE tree with no `label`: the library
 *  names a node `label || id`, and that name is an i18n KEY -- the item
 *  of the parent's navs (child_nav_items(), node_tree_model.js, after
 *  normalize_spec() gave a child with no label its id as one), the
 *  label of the node's own navs and its crumb in a path (c_yui_node.js,
 *  translated with the shell's translator), its node in the site map.
 *  Up to gobj-ui 7.26.41 the validator read a node's `label` and not
 *  the id that stands in for a missing one.
 *
 *  A tree is declared as `{"gclass": "C_YUI_NODE", "kw": {...}}`
 *  wherever the shell declaration holds one (a menu item's `target`, a
 *  route's): its root is the `kw` (its id is `node_id`), the nodes
 *  below it the specs of `children` (`id`), down the whole tree. A
 *  root names itself only on its navs and in a path: one with no
 *  children and no path draws no label. A spec the library refuses --
 *  no `id`, an id with a "/" -- is drawn by nothing.
 ***************************************************************/
function node_tree_keys(config, keys, is_key)
{
    let ask = (v) => {
        if(typeof v === "string" && v && is_key(v)) {
            keys.add(v);
        }
    };
    /*  normalize_spec()'s own test: a label is a non-empty string  */
    let labelled = (spec) => typeof spec.label === "string" && spec.label !== "";
    let read_children = (children) => {
        for(let spec of (Array.isArray(children)? children : [])) {
            if(!spec || typeof spec !== "object" || Array.isArray(spec)
                    || typeof spec.id !== "string" || !spec.id || spec.id.includes("/")) {
                continue;
            }
            if(!labelled(spec)) {
                ask(spec.id);
            }
            read_children(spec.children);
        }
    };
    let walk = (n) => {
        if(Array.isArray(n)) {
            for(let x of n) {
                walk(x);
            }
            return;
        }
        if(!n || typeof n !== "object") {
            return;
        }
        if(n.gclass === "C_YUI_NODE" && n.kw && typeof n.kw === "object" && !Array.isArray(n.kw)) {
            let kw = n.kw;
            let draws = (Array.isArray(kw.children) && kw.children.length > 0) || kw.nav_mode === "path"
                || !!(kw.projection && typeof kw.projection === "object" && kw.projection.path);
            if(draws && !labelled(kw)) {
                ask(kw.node_id);
            }
            read_children(kw.children);
        }
        for(let [k, v] of Object.entries(n)) {
            if(!k.startsWith("_")) {
                walk(v);
            }
        }
    };
    walk(config);
}

/***************************************************************
 *  The `id` of a MENU item that the library names the item by, as a
 *  key, when the item has no `name` -- mirrored from C_YUI_NAV and the
 *  shell, so a key they translate is a key asked for (up to gobj-ui
 *  7.26.41 such an item was named by its raw id, with no key):
 *
 *    - when it has neither a `name` nor an `aria_label`: the name of
 *      the item in every layout -- a tab, an entry of a vertical menu,
 *      a submenu or an icon bar, a card, an accordion head, a crumb
 *      (`name || aria_label || id`: c_yui_nav.js, nav_cards_helpers.js)
 *      -- and its title too, when it has no `tooltip`; the navs its
 *      submenu opens, and the landing of a SECTION INDEX it opens
 *      (`submenu.index`), are labelled the same way (c_yui_shell.js,
 *      shell_section_index.js), so they ask for nothing more;
 *    - when it has no `name`, in a menu drawn as a BREADCRUMB that shows
 *      its labels: the text of the crumb is `name || id`.
 *
 *  And the id of a MENU (`menu.<id>`) drawn as a "submenu" in a zone
 *  that hosts it: that layout heads the nav with its `nav_label`, and
 *  the shell gives a menu none, so the heading is the menu's id, as a
 *  key (render_submenu(), c_yui_nav.js). Up to gobj-ui 7.26.42 the
 *  validator did not ask for it.
 *
 *  The items are those of every menu (`menu.<id>.items`) and of every
 *  submenu of them (`submenu.items`) -- and the rows of the dropdown
 *  action of an entry with no submenu, which the site map draws and
 *  labels as an entry (`name || aria_label || id`, route_map_model.js)
 *  --; a decorative one (`type` "header" or "divider") is named by
 *  nothing of this. A `name`, an `aria_label` or a `tooltip` is read
 *  wherever it stands, above.
 ***************************************************************/
function menu_item_keys(config, keys, is_key)
{
    let menus = (config && config.menu && typeof config.menu === "object")? config.menu : {};
    let zones = (config && config.shell && config.shell.zones && typeof config.shell.zones === "object")?
        config.shell.zones : {};
    let ask = (v) => {
        if(typeof v === "string" && v && is_key(v)) {
            keys.add(v);
        }
    };
    /*  Does a render (`"tabs"` or `{layout, show_label}`) draw a
     *  breadcrumb that shows the labels?  */
    let draws_crumbs = (r) => {
        let cfg = (typeof r === "string")? {layout: r} : r;
        return !!cfg && typeof cfg === "object" && cfg.layout === "breadcrumb" && cfg.show_label !== false;
    };
    let layout_of = (r) => (typeof r === "string")? r : (r && typeof r === "object")? r.layout : null;
    let read_items = (items, crumbs) => {
        for(let it of (Array.isArray(items)? items : [])) {
            if(!it || typeof it !== "object" || it.type === "header" || it.type === "divider") {
                continue;
            }
            /*  The library's own test: `it.name || it.aria_label || it.id`  */
            if(!it.name && (!it.aria_label || crumbs)) {
                ask(it.id);
            }
            let sub = it.submenu;
            if(!sub || typeof sub !== "object" || !Array.isArray(sub.items)) {
                /*  The site map draws the rows of a dropdown action too, named
                 *  as an entry is (route_map_model.js, nav_node_from_item())  */
                let a = it.action;
                if(a && typeof a === "object" && a.type === "dropdown") {
                    read_items(a.items, false);
                }
                continue;
            }
            /*  A submenu is drawn in each zone its `render` names ("*" is no
             *  zone for it)  */
            let render = (sub.render && typeof sub.render === "object")? sub.render : {};
            read_items(sub.items, Object.keys(render).some((z) => z !== "*" && draws_crumbs(render[z])));
        }
    };
    for(let menu_id of Object.keys(menus)) {
        let menu = menus[menu_id];
        if(!menu || typeof menu !== "object") {
            continue;
        }
        /*  A menu is drawn in each zone that hosts it, with that zone's
         *  render, else the render "*", else a vertical menu  */
        let render = (menu.render && typeof menu.render === "object")? menu.render : {};
        let hosts = Object.keys(zones).filter((z) => zones[z] && zones[z].host === `menu.${menu_id}`);
        if(hosts.some((z) => layout_of(render[z] || render["*"]) === "submenu")) {
            ask(menu_id);
        }
        read_items(menu.items, hosts.some((z) => draws_crumbs(render[z] || render["*"])));
    }
}

/***************************************************************
 *  The `id` of a TOOLBAR item that the shell names the item by, as a
 *  key, when the item has neither an `aria_label` nor a `name`
 *  (`aria_label || name || id`, build_toolbar_*() of c_yui_shell.js;
 *  up to gobj-ui 7.26.41 such an item was named by its raw id, with no
 *  key) -- mirrored from the shell:
 *
 *    - an action item (any `type` but "brand", "avatar", "connection");
 *    - the menu a dropdown opens (`action.type` "dropdown"), named as
 *      its trigger, except an avatar's, which the shell names "user
 *      menu" -- and the one a RIGHT-click opens (`context_action`, which
 *      the shell wires on an action item and on a connection), named
 *      the same way (up to gobj-ui 7.26.42 the shell named it by the
 *      raw id, and the validator did not read it);
 *    - each entry of that menu (`action.items`) that is drawn: not a
 *      divider, and with an `action` of its own;
 *    - each row the SITE MAP draws under a toolbar node that is not the
 *      brand -- its `submenu.items`, else the `items` of its dropdown
 *      action, down every level, an entry with no `action` included --,
 *      labelled as the toolbar names a control: `aria_label || name ||
 *      id`, but "user menu" for a row typed "avatar" and "backend
 *      connection" for one typed "connection" (route_map_model.js,
 *      toolbar_item_label()).
 *
 *  A brand is named by its `wordmark`, which it must have to be drawn;
 *  an avatar and a connection button by the shell's own "user menu" and
 *  "backend connection". A `name` or an `aria_label` is read wherever it
 *  stands (keys_from_shell_config()).
 ***************************************************************/
function toolbar_item_keys(config, keys, is_key)
{
    let tb = config && config.toolbar;
    let items = (tb && typeof tb === "object" && Array.isArray(tb.items))? tb.items : [];
    let ask = (v) => {
        if(typeof v === "string" && v && is_key(v)) {
            keys.add(v);
        }
    };
    let nameless = (it) => !it.aria_label && !it.name;
    /*  The rows the site map walks under a node: its `submenu.items`, else
     *  the `items` of a dropdown action (nav_node_from_item())  */
    let map_rows = (it) => {
        if(it.submenu && Array.isArray(it.submenu.items)) {
            return it.submenu.items;
        }
        let a = it.action;
        return (a && typeof a === "object" && a.type === "dropdown" && Array.isArray(a.items))? a.items : [];
    };
    let read_map_rows = (rows) => {
        for(let sub of rows) {
            if(!sub || typeof sub !== "object" || sub.type === "divider" || sub.type === "header") {
                continue;
            }
            if(nameless(sub) && sub.type !== "avatar" && sub.type !== "connection") {
                ask(sub.id);
            }
            read_map_rows(map_rows(sub));
        }
    };
    for(let it of items) {
        if(!it || typeof it !== "object") {
            continue;
        }
        let kind = (it.type === "brand" || it.type === "avatar" || it.type === "connection")? it.type : "action";
        if(kind === "action" && nameless(it)) {
            ask(it.id);
        }
        /*  The menu a click opens, and the one a right-click opens: the
         *  shell wires `context_action` on an action item and a connection  */
        let actions = [it.action];
        if(kind === "action" || kind === "connection") {
            actions.push(it.context_action);
        }
        for(let action of actions) {
            if(!action || typeof action !== "object" || action.type !== "dropdown") {
                continue;
            }
            if(kind !== "avatar" && nameless(it)) {
                ask(it.id);
            }
            for(let sub of (Array.isArray(action.items)? action.items : [])) {
                if(!sub || typeof sub !== "object" || sub.type === "divider"
                        || !sub.action || typeof sub.action !== "object") {
                    continue;
                }
                if(nameless(sub)) {
                    ask(sub.id);
                }
            }
        }
        /*  The brand is the ROOT of the site map, named by its wordmark: no
         *  node of its own, and no rows under it  */
        if(kind !== "brand") {
            read_map_rows(map_rows(it));
        }
    }
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
    CODE_KEY_MODULES,
    gave_up,
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
    call_kind,
    is_translator_call,
    is_translation,
    is_forwarded,
    call_rule_violations,
    call_rule_message,
    param_flows,
    published_lists,
    list_mutations,
    scan_ast,
    collect_used_keys,
    keys_from_shell_config,
    source_files,
    lib_imports,
    find_plural_groups,
    violation_count,
    Abort
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
    /*
     *  No code of the app runs here: the sources are parsed, and the
     *  locales are imported in a process of their own
     *  (import_locales()). So the run ends when its work does, with the
     *  code of its own verdict, and what it wrote reaches a pipe whole.
     */
    try {
        await main();
    } catch(e) {
        if(!(e instanceof Abort)) {
            throw e;
        }
    }
    if(errors > 0) {
        process.exitCode = 1;
    }
}
