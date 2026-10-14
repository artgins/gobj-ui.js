/***********************************************************************
 *          validate-locales.mjs
 *
 *          The guard of the demo -- and it is the consumer that mounts
 *          EVERY gadget of the library, so it is the first place a key the
 *          library asks for should be caught.
 *
 *          This app inverts the convention of the other consumers, on
 *          purpose: **English is the source**, so a key IS the English
 *          string the UI ships, and the catalog is ONE file
 *          (src/locales.js) with two bundles, not a locales/ directory.
 *          That is all this script does on its own: it loads that catalog.
 *          What the source ASKS for is read by the published reader of the
 *          library (scripts/validate-locales.mjs, collect_used_keys()), so
 *          the demo sees what every app sees: t() and every place a key is
 *          written, the consts it follows, the key functions of
 *          I18N_KEY_FUNCTIONS, the published *_I18N_KEYS lists, the
 *          markers, and the shell declarations. Up to gobj-ui 7.26.27 it
 *          kept a regex copy of its own, which saw none of that and said
 *          OK with a dozen library keys untranslated.
 *
 *          Its rules, against that catalog:
 *
 *            1. No duplicate key in a bundle (an object literal keeps the
 *               LAST one and says nothing).
 *            2. Every key the source asks for -- the app's own views, the
 *               gobj-ui modules it MOUNTS, the shell declarations -- is in
 *               the `es` bundle: a key missing there renders in English and
 *               never changes language.
 *            3. Every key a gobj-ui module asks for is in the `en` bundle
 *               too. The library's keys are lower-case ASCII, not English
 *               display text ("zoom in", "quarter {{n}} {{y}}"), so they
 *               need an English entry; the demo's own keys ARE their
 *               English text and fall back to themselves.
 *
 *          Keys are NOT required to be lower-case or ASCII here: they are
 *          English prose (Title Case and typography included). For the
 *          same reason a value of the shell declarations is a key when it
 *          has a letter to translate (`ES/EN` is a symbol, not prose).
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {readFileSync} from "fs";
import {
    parse_source,
    prop_name,
    collect_used_keys,
    violation_count,
    Abort
} from "../../scripts/validate-locales.mjs";

const SRC = new URL("../src/", import.meta.url);
const CATALOG = new URL("locales.js", SRC);

let errors = 0;

function fail(msg)
{
    process.stderr.write(`validate-locales: ${msg}\n`);
    errors++;
}

/***************************************************************
 *  The two bundles of src/locales.js, read from the SOURCE (never
 *  imported: it pulls in i18next, which expects a browser):
 *  {es: [keys], en: [keys]}, in the order written, so a duplicate
 *  shows.
 ***************************************************************/
function catalog_keys()
{
    let ast;
    try {
        ast = parse_source(readFileSync(CATALOG, "utf8"));
    } catch(e) {
        fail(`src/locales.js cannot be parsed (${e.message})`);
        return {es: [], en: []};
    }
    let out = {};
    for(let node of ast.body) {
        if(node.type !== "VariableDeclaration") {
            continue;
        }
        for(let d of node.declarations) {
            let m = d.id.type === "Identifier" && d.id.name.match(/^(es|en)_translation$/);
            if(!m) {
                continue;
            }
            if(!d.init || d.init.type !== "ObjectExpression") {
                fail(`src/locales.js: ${d.id.name} is not an object literal`);
                continue;
            }
            out[m[1]] = d.init.properties.map((p) => {
                let name = (p.type === "Property")? prop_name(p) : null;
                if(name === null) {
                    fail(`src/locales.js: ${d.id.name} holds an entry that is not a plain key`);
                }
                return name;
            }).filter((k) => k !== null);
        }
    }
    for(let code of ["es", "en"]) {
        if(!out[code]) {
            fail(`src/locales.js: no ${code}_translation bundle`);
            out[code] = [];
        }
    }
    return out;
}

function main()
{
    let bundles = catalog_keys();
    let es = new Set(bundles.es);
    let en = new Set(bundles.en);
    for(let code of ["es", "en"]) {
        let seen = new Set();
        for(let k of bundles[code]) {
            if(seen.has(k)) {
                fail(`[${code}] DUPLICATE key (the later one silently wins): ${JSON.stringify(k)}`);
            }
            seen.add(k);
        }
    }

    let {keys, lib_keys} = collect_used_keys({
        src: [SRC],
        locales: null,
        exclude: [CATALOG],
        config: [new URL("app_config.json", SRC), new URL("app_config_tree.json", SRC)],
        config_key: (value) => /[a-z]/.test(value),
        attr_keys: [],
        array_keys: []
    });
    errors += violation_count();

    for(let k of [...keys].sort()) {
        if(!es.has(k)) {
            fail(`key used but NOT translated in [es]: ${JSON.stringify(k)}`);
        }
    }
    for(let k of [...lib_keys].sort()) {
        if(!en.has(k)) {
            fail(`a key of the library with NO English text in [en]: ${JSON.stringify(k)}`);
        }
    }

    if(errors > 0) {
        /*  exitCode, not process.exit(): a long list written to a pipe is
         *  still on its way, and process.exit() cuts it short  */
        process.stderr.write(`validate-locales: ${errors} violation(s), see above\n`);
        process.exitCode = 1;
        return;
    }
    process.stdout.write(`validate-locales: OK (${es.size} es keys, ${en.size} en keys, ` +
        `${keys.size} used in the source, ${lib_keys.size} of them by the library)\n`);
}

try {
    main();
} catch(e) {
    /*  A fatal problem of the setup: already said, exitCode already 1  */
    if(!(e instanceof Abort)) {
        throw e;
    }
}
