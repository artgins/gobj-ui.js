/***********************************************************************
 *          validate-locales.test.js
 *
 *      The i18n check every app runs from its prebuild: what it demands
 *      and what it leaves alone, on fixture apps written to a temp dir.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {describe, test, expect} from "vitest";
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, cpSync, symlinkSync} from "node:fs";
import {join, dirname} from "node:path";
import {tmpdir} from "node:os";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "validate-locales.mjs");
const PKG = dirname(dirname(SCRIPT));

function locale(code, dict)
{
    let body = Object.entries(dict).map(([k, v]) => `        ${JSON.stringify(k)}: ${JSON.stringify(v)},`);
    return `const ${code} = {\n    translation: {\n${body.join("\n")}\n    }\n};\nexport {${code}};\n`;
}

/*  An app: {path: content}, run from its directory (`sub` of the temp dir)  */
function run(files, args = [], sub = "", script = SCRIPT, node_args = [], env = process.env)
{
    let dir = mkdtempSync(join(tmpdir(), "vl-"));
    write_files(dir, files);
    let r = spawnSync(process.execPath, [...node_args, script, ...args],
        {cwd: join(dir, sub), encoding: "utf8", env});
    return {status: r.status, out: r.stdout + r.stderr, dir};
}

function write_files(dir, files)
{
    for(let [path, content] of Object.entries(files)) {
        mkdirSync(dirname(join(dir, path)), {recursive: true});
        writeFileSync(join(dir, path), content);
    }
}

/*  A copy of this package (script, src, barrel), to run on a library
 *  that is not the working tree: `mutate(src_dir)` edits it  */
function library_copy(mutate)
{
    let lib = mkdtempSync(join(tmpdir(), "vl-lib-"));
    cpSync(join(PKG, "scripts", "validate-locales.mjs"), join(lib, "scripts", "validate-locales.mjs"));
    cpSync(join(PKG, "index.js"), join(lib, "index.js"));
    cpSync(join(PKG, "src"), join(lib, "src"), {recursive: true,
        filter: (path) => !/\.test\.js$/.test(path)});
    symlinkSync(join(PKG, "node_modules"), join(lib, "node_modules"));
    if(mutate) {
        mutate(join(lib, "src"));
    }
    return join(lib, "scripts", "validate-locales.mjs");
}

const BOTH = (dict) => ({
    "src/locales/en.js": locale("en", dict),
    "src/locales/es.js": locale("es", dict)
});

describe("validate-locales", () => {
    test("a clean app passes, and says what it counted", () => {
        let r = run({...BOTH({"save": "Save"}), "src/main.js": `t("save");`});
        expect(r.status).toBe(0);
        expect(r.out).toMatch(/OK \(2 locales x 1 keys, 1 used in the source\)/);
    });

    test("the locale rules: ASCII, lower-case, symmetric, no duplicate", () => {
        let r = run({
            "src/locales/en.js": locale("en", {"Save": "Save", "a—b": "x", "only en": "x"}),
            "src/locales/es.js": locale("es", {"Save": "Guardar", "a—b": "x"})
                .replace('"Save": "Guardar",', '"Save": "Guardar",\n        "Save": "Otra",'),
            "src/main.js": ``
        });
        expect(r.status).toBe(1);
        expect(r.out).toMatch(/non-lower-case key: "Save"/);
        expect(r.out).toMatch(/non-ASCII key: "a—b"/);
        expect(r.out).toMatch(/\[es\] missing key present in \[en\]: "only en"/);
        expect(r.out).toMatch(/\[es\] DUPLICATE key/);
    });

    test("the keys of the source, in every form it asks for one", () => {
        let r = run({...BOTH({}), "src/main.js": [
            `t('label') + ':';`,                    // the RESULT concatenated: a key (V17)
            `t("kind_" + kind);`,                   // built by concatenation: not
            `tr("tr key", "Default");`,
            `x = {i18n: "i18n key"};`,
            `x = {"data-i18n-placeholder": "placeholder key"};`,
            "x = `<b data-i18n-title=\"${k}\">`;",  // interpolated: not
            `add("error", "finding key", a);`,      // an app's add(): no schema check (below)
            `x = {code: "code key"};`,              // an app's code: no key (below)
            `x = {app_title: "app title key", welcome_features: ["feat a", "feat b"]};`,
            `el.setAttribute('data-i18n-title', 'attribute key');`,
            `t("don't stop");`,                     // an apostrophe inside double quotes
            "t(`template key`);",                   // a template with no ${}
            "t(`built ${x}`);",                     // ...and one with: not
            `/* t("in a comment") */`
        ].join("\n")});
        expect(r.status).toBe(1);
        for(let k of ["label", "tr key", "i18n key", "placeholder key",
                      "attribute key", "don't stop", "template key"]) {
            expect(r.out).toContain(`defined in NO locale: ${JSON.stringify(k)}`);
        }
        /*  The orchestrator's attributes are not known without the app's package.json  */
        for(let k of ["kind_", "${k}", "in a comment", "app title key", "feat a", "don", "finding key", "code key"]) {
            expect(r.out).not.toContain(`defined in NO locale: ${JSON.stringify(k)}`);
        }
    });

    test("a `code` is a key only where the library makes one: an app's codes and add() calls ask for nothing", () => {
        let r = run({...BOTH({}), "src/main.js": [
            `const LANGS = [{code: "en", name: "English"}, {code: "es", name: "Spanish"}];`,
            `$el.classList.add("error", "has-text-danger");`,
            `let saved = {code: t("a saved key")};`
        ].join("\n")});
        expect(r.status).toBe(1);
        expect(r.out).toContain(`defined in NO locale: "a saved key"`);
        for(let k of ["en", "es", "has-text-danger"]) {
            expect(r.out).not.toContain(`defined in NO locale: ${JSON.stringify(k)}`);
        }
        expect(r.out).not.toMatch(/TRANSLATED/);
        /*  ...and declared in the app's package.json, its `code` is a key again  */
        let d = run({...BOTH({}), "package.json": JSON.stringify({"validate-locales": {attr_keys: ["code"]}}),
            "src/main.js": `const LANGS = [{code: "a declared code key"}];`});
        expect(d.out).toContain(`defined in NO locale: "a declared code key"`);
    });

    test("what is particular to an app is declared in its package.json, not in the script", () => {
        let r = run({...BOTH({}),
            "package.json": JSON.stringify({"validate-locales": {
                attr_keys: ["app_title"], array_keys: ["welcome_features"]}}),
            "src/main.js": `x = {app_title: "app title key", welcome_features: ["feat a", 'feat b']};`});
        expect(r.status).toBe(1);
        for(let k of ["app title key", "feat a", "feat b"]) {
            expect(r.out).toContain(`defined in NO locale: ${JSON.stringify(k)}`);
        }
        let bad = run({...BOTH({}), "package.json": JSON.stringify({"validate-locales": {attr_keys: ["a b"]}}),
            "src/main.js": ``});
        expect(bad.status).toBe(1);
        expect(bad.out).toMatch(/attr_keys must be a list of property names/);
    });

    test("plurals: each locale carries the categories of its language", () => {
        let ok = run({
            "src/locales/en.js": locale("en", {"songs_one": "1 song", "songs_other": "{{count}} songs"}),
            "src/locales/ru.js": locale("ru", {"songs_one": "a", "songs_few": "b", "songs_many": "c", "songs_other": "d"}),
            "src/locales/zh.js": locale("zh", {"songs_other": "e", "songs_zero": "none"}),
            "src/main.js": `t("songs", {count: n});`
        });
        expect(ok.status).toBe(0);
        expect(ok.out).toMatch(/1 plural/);

        let bad = run({
            "src/locales/en.js": locale("en", {"songs_one": "1", "songs_other": "n"}),
            "src/locales/ru.js": locale("ru", {"songs_one": "a", "songs_other": "d"}),
            "src/locales/zh.js": locale("zh", {"songs_one": "x", "songs_other": "e"}),
            "src/main.js": ``
        });
        expect(bad.status).toBe(1);
        expect(bad.out).toMatch(/\[ru\] plural "songs" lacks the form "few"/);
        expect(bad.out).toMatch(/\[ru\] plural "songs" lacks the form "many"/);
        expect(bad.out).toMatch(/\[zh\] plural "songs" has a form "one" its language never uses/);
    });

    test("a language menu: the endonym of a locale is a literal, any other text a key", () => {
        let named = (code, name) => locale(code, {}).replace(`translation:`, `name: ${JSON.stringify(name)}, translation:`);
        let r = run({
            "src/locales/en.js": named("en", "english"),
            "src/locales/es.js": named("es", "español"),
            "src/locales/zh.js": named("zh", "中文"),
            "src/main.js": ``,
            "src/app_config.json": JSON.stringify({
                languages: [{name: "中文"}, {name: "español"}, {name: "configuración"}, {name: "english key"}]})});
        expect(r.status).toBe(1);
        expect(r.out).toContain(`defined in NO locale: "english key"`);
        expect(r.out).toContain(`defined in NO locale: "configuración"`);   // a literal that forgot its key
        expect(r.out).not.toContain(`"中文"`);
        expect(r.out).not.toContain(`NO locale: "español"`);
    });

    test("a key that only ends like a plural form is a key; ordinals by their own categories", () => {
        let r = run({...BOTH({"pick_one": "Pick one", "place_ordinal_one": "1st", "place_ordinal_two": "2nd",
                              "place_ordinal_few": "3rd", "place_ordinal_other": "th"}),
            "src/main.js": `t("pick_one"); t("place", {count: n, ordinal: true});`});
        expect(r.out).not.toMatch(/plural "pick"/);
        expect(r.out).not.toContain(`NO locale: "pick_one"`);
        /*  Spanish ordinals have "other" only: the English forms are extra there  */
        expect(r.out).toMatch(/\[es\] ordinal "place" has a form "one" its language never uses/);
    });

    test("a module's published keys (*_I18N_KEYS) are asked for when it is mounted", () => {
        let r = run({...BOTH({}), "src/main.js": `import {x} from "@yuneta/gobj-ui/src/yui_dev.js";`});
        expect(r.status).toBe(1);
        expect(r.out).toContain(`defined in NO locale: "trace the periodic timer event"`);
    });

    test("an attr_keys name no source uses is a typo, and fails", () => {
        let r = run({...BOTH({}),
            "package.json": JSON.stringify({"validate-locales": {attr_keys: ["app_tittle"]}}),
            "src/main.js": `x = {app_title: "x"};`});
        expect(r.status).toBe(1);
        expect(r.out).toMatch(/names "app_tittle", which no source uses/);
    });

    test("tests, specs and other locales/ directories are not read; .mjs is", () => {
        let r = run({...BOTH({}),
            "src/main.js": ``,
            "src/__tests__/a.js": `t("in a test dir");`,
            "src/x.spec.js": `t("in a spec");`,
            "src/other/locales/zz.js": `t("in another locales dir");`,
            "src/tool.mjs": `t("in a module");`});
        expect(r.out).toContain(`NO locale: "in a module"`);
        for(let k of ["in a test dir", "in a spec", "in another locales dir"]) {
            expect(r.out).not.toContain(JSON.stringify(k));
        }
    });

    test("the source is read recursively, and a dynamic import of the library is followed", () => {
        let r = run({...BOTH({}),
            "src/main.js": ``,
            "src/views/deep/view.js": `t("deep key"); import("@yuneta/gobj-ui/src/c_yui_schema_editor.js");`,
            "src/views/deep/view.test.js": `t("test key");`});
        expect(r.status).toBe(1);
        expect(r.out).toContain(`defined in NO locale: "deep key"`);
        expect(r.out).toContain(`defined in NO locale: "in the hook map of"`);
        expect(r.out).not.toContain(`"test key"`);
    });

    test("a locale of a region (pt-br.js), and a file that only looks like one", () => {
        let r = run({
            "src/locales/en.js": locale("en", {"save": "Save"}),
            "src/locales/pt-br.js": locale("ptBR", {"save": "Salvar"}),
            "src/locales/ui.js": `export const helper = 1;\n`,
            "src/locales/app.js": `window.x = 1;\n`,     // needs a browser: said, not a crash
            "src/main.js": `t("save");`
        });
        expect(r.status).toBe(0);
        expect(r.out).toMatch(/OK \(2 locales/);
        expect(r.out).toMatch(/ui\.js exports no \{ui\}.*skipped/);
        expect(r.out).toMatch(/app\.js cannot be loaded here.*skipped/);
    });

    test("the shell declaration: its lower-case fields are keys, a literal is not", () => {
        let r = run({...BOTH({}), "src/main.js": ``, "src/app_config.json": JSON.stringify({
            toolbar: [{name: "menu key", tooltip: "ES/EN", aria_label: "aria key"}],
            routes: [{kw: {title: "title key", subtitle: "subtitle key"}, label: "label key"}],
            _comment: {name: "commented"},
            wordmark: "brand"
        })});
        expect(r.status).toBe(1);
        for(let k of ["menu key", "aria key", "title key", "subtitle key", "label key"]) {
            expect(r.out).toContain(`defined in NO locale: ${JSON.stringify(k)}`);
        }
        for(let k of ["ES/EN", "commented", "brand"]) {
            expect(r.out).not.toContain(`defined in NO locale: ${JSON.stringify(k)}`);
        }
    });

    test("the gobj-ui modules the app mounts are scanned, deep and through the barrel", () => {
        let deep = run({...BOTH({}),
            "src/main.js": `import {x} from "@yuneta/gobj-ui/src/c_yui_schema_editor.js";`});
        expect(deep.status).toBe(1);
        expect(deep.out).toContain(`defined in NO locale: "in the hook map of"`);

        let barrel = run({...BOTH({}),
            "src/main.js": `import {register_c_yui_schema_editor} from "@yuneta/gobj-ui";`});
        expect(barrel.out).toContain(`defined in NO locale: "in the hook map of"`);

        let missing = run({...BOTH({}), "src/main.js": `import {x} from "@yuneta/gobj-ui/src/no_such.js";`});
        expect(missing.status).toBe(1);
        expect(missing.out).toMatch(/modules of gobj-ui not found .*no_such\.js/);
    });

    test("a key handed to a gobj-ui function is asked for, where the table says it goes", () => {
        let r = run({...BOTH({}), "src/main.js": [
            `import {yui_shell_show_error, yui_shell_confirm_danger} from "@yuneta/gobj-ui/src/shell_modals.js";`,
            `import {yui_shell_show_info as info} from "@yuneta/gobj-ui";`,
            `yui_shell_show_error(shell, "error key", {t: t});`,
            `yui_shell_show_error(shell, ok ? "branch a" : "branch b");`,
            `yui_shell_show_error(shell, comment || "fallback key");`,
            `yui_shell_confirm_danger(shell, $msg, {confirm_label: "label key", title: "title key"});`,
            `yui_shell_confirm_danger(shell, $msg, Object.assign(opts, {cancel_label: "assigned key"}));`,
            `info(shell, "aliased key");`,
            `yui_shell_show_error(shell, variable_key);`,
            `function icon_button(a, b, c, d) {}`,
            `icon_button(1, 2, 3, "not the library's");`      // an app function of the same name
        ].join("\n")});
        expect(r.status).toBe(1);
        for(let k of ["error key", "branch a", "branch b", "fallback key", "label key", "title key",
                      "assigned key", "aliased key"]) {
            expect(r.out).toContain(`defined in NO locale: ${JSON.stringify(k)}`);
        }
        expect(r.out).not.toContain(`"not the library's"`);
        expect(r.out).not.toContain(`"variable_key"`);
    });

    test("a key a mounted module hands to its own helper is asked for (expand loaded)", () => {
        let app = (dict) => ({...BOTH(dict),
            "src/main.js": `import {register_c_yui_json} from "@yuneta/gobj-ui/src/c_yui_json.js";`});
        let without = run(app({}));
        expect(without.status).toBe(1);
        for(let k of ["expand loaded", "copy json", "click to load"]) {
            expect(without.out).toContain(`defined in NO locale: ${JSON.stringify(k)}`);
        }
        let with_it = run(app({"expand loaded": "Expand loaded"}));
        expect(with_it.out).not.toContain(`NO locale: "expand loaded"`);
        expect(with_it.out).toContain(`NO locale: "copy json"`);
    });

    test("a locale that cannot be parsed, or holds a translation and cannot load, FAILS", () => {
        let broken = run({
            "src/locales/en.js": locale("en", {"save": "Save"}),
            "src/locales/es.js": locale("es", {"save": "Guardar"}).replace(`"save": "Guardar",`, `"save": "Guardar",,,`),
            "src/main.js": `t("save");`
        });
        expect(broken.status).toBe(1);
        expect(broken.out).toMatch(/es\.js cannot be parsed .*its language is NOT validated/);

        let needs_a_browser = run({
            "src/locales/en.js": locale("en", {"save": "Save"}),
            "src/locales/es.js": `window.x = 1;\n` + locale("es", {"save": "Guardar"}),
            "src/main.js": `t("save");`
        });
        expect(needs_a_browser.status).toBe(1);
        expect(needs_a_browser.out).toMatch(/es\.js exports es and cannot be loaded/);

        let misnamed = run({
            "src/locales/en.js": locale("en", {"save": "Save"}),
            "src/locales/es.js": locale("spanish", {"save": "Guardar"}),
            "src/main.js": `t("save");`
        });
        expect(misnamed.status).toBe(1);
        expect(misnamed.out).toMatch(/es\.js holds a translation dict but exports no \{es\}/);

        /*  A helper with a locale's name is still said and skipped  */
        let helper = run({...BOTH({"save": "Save"}),
            "src/locales/app.js": `window.x = 1;\n`,
            "src/main.js": `t("save");`});
        expect(helper.status).toBe(0);
        expect(helper.out).toMatch(/app\.js cannot be loaded here.*skipped/);
    });

    test("a published list is read as data, in the shapes the reader knows, never run", () => {
        let r = run({...BOTH({}), "src/main.js": [
            `export const A_I18N_KEYS = Object.freeze(["frozen key"]);`,
            `const B_I18N_KEYS = ["exported later"]; export {B_I18N_KEYS};`,
            `const local_list = ["renamed on export"]; export {local_list as C_I18N_KEYS};`,
            "export const F_I18N_KEYS = [`template key`];",
            `export const G_I18N_KEYS = ["a ] bracket", "after the bracket"];`,
            `export const lower_i18n_keys = ["lower-case name"];`,
            `throw new Error("never run");`
        ].join("\n")});
        expect(r.status).toBe(1);
        for(let k of ["frozen key", "exported later", "renamed on export",
                      "template key", "a ] bracket", "after the bracket", "lower-case name"]) {
            expect(r.out).toContain(`defined in NO locale: ${JSON.stringify(k)}`);
        }
        expect(r.out).not.toMatch(/never run/);
    });

    test("REV-CLOUD V22: a published list is an export const, and one that is MUTATED fails", () => {
        let r = run({...BOTH({"let key": "L", "var key": "V", "in it": "I"}), "src/main.js": [
            `export let D_I18N_KEYS = ["let key"];`,
            `export var E_I18N_KEYS = ["var key"];`,
            `let late = ["in it"]; export {late as H_I18N_KEYS};`,
            `export const X_I18N_KEYS = ["in it"];`,
            `X_I18N_KEYS.push("pushed key");`,
            `X_I18N_KEYS.splice(0, 0, "spliced key");`,
            `X_I18N_KEYS.unshift("unshifted key");`,
            `X_I18N_KEYS[3] = "indexed key";`,
            `X_I18N_KEYS.length = 0;`,
            `Object.assign(X_I18N_KEYS, ["assigned key"]);`,
            `function f(X_I18N_KEYS) { X_I18N_KEYS.push("a parameter, not the list"); }`
        ].join("\n"), "src/other.js": [
            `import {X_I18N_KEYS as LIST} from "./main.js";`,
            `LIST.push("pushed elsewhere");`
        ].join("\n")});
        expect(r.status).toBe(1);
        expect(r.out).toMatch(/src\/main\.js: the published list D_I18N_KEYS: declared with let, which can be given other keys no reader sees: a published list is an `export const` array of literals/);
        expect(r.out).toMatch(/E_I18N_KEYS: declared with var/);
        expect(r.out).toMatch(/H_I18N_KEYS: declared with let/);
        for(let [line, what] of [[5, "X_I18N_KEYS.push"], [6, "X_I18N_KEYS.splice"], [7, "X_I18N_KEYS.unshift"],
                                 [8, "X_I18N_KEYS\\[3\\] ="], [9, "X_I18N_KEYS.length ="], [10, "Object.assign\\(X_I18N_KEYS"]]) {
            expect(r.out).toMatch(new RegExp(`src/main\\.js:${line}: the published list X_I18N_KEYS is MUTATED \\(\`${what}`));
        }
        expect(r.out).toMatch(/src\/other\.js:2: the published list LIST is MUTATED \(`LIST\.push\("pushed elsewhere"\)`\)/);
        expect(r.out).not.toMatch(/main\.js:11:/);
    });

    test("a list no consumer can read FAILS, naming the file and the list (app code too)", () => {
        let r = run({...BOTH({}), "src/lists.js": [
            `const NOT_EXPORTED_I18N_KEYS = ["unpublished"];`,
            `export const {DESTRUCTURED_I18N_KEYS} = TABLES;`,
            `function f() { const INSIDE_I18N_KEYS = ["inside"]; return INSIDE_I18N_KEYS; }`,
            `const RENAMED_I18N_KEYS = ["renamed"]; export {RENAMED_I18N_KEYS as keys_of_mine};`
        ].join("\n"), "src/main.js": ``});
        expect(r.status).toBe(1);
        expect(r.out).toMatch(/src\/lists\.js: the published list NOT_EXPORTED_I18N_KEYS: not exported/);
        expect(r.out).toMatch(/src\/lists\.js: the published list DESTRUCTURED_I18N_KEYS: declared by destructuring/);
        expect(r.out).toMatch(/src\/lists\.js: the published list INSIDE_I18N_KEYS: declared inside a function/);
        expect(r.out).toMatch(/src\/lists\.js: the published list RENAMED_I18N_KEYS: exported as keys_of_mine/);
    });

    test("a published list that cannot be read FAILS, naming the file and the export", () => {
        let r = run({...BOTH({}), "src/lists.js": [
            `export const VAR_I18N_KEYS = [some_key, "b"];`,
            "export const TPL_I18N_KEYS = [`built ${x}`];",
            `export const CALL_I18N_KEYS = make_keys();`,
            `export const SPREAD_I18N_KEYS = [...OTHER];`,
            `export function FN_I18N_KEYS() { return []; }`
        ].join("\n"), "src/main.js": ``});
        expect(r.status).toBe(1);
        for(let name of ["VAR_I18N_KEYS", "TPL_I18N_KEYS", "CALL_I18N_KEYS", "SPREAD_I18N_KEYS", "FN_I18N_KEYS"]) {
            expect(r.out).toMatch(new RegExp(`src/lists\\.js: the published list ${name}: .*NOT asked for`));
        }
    });

    test("a source file that cannot be parsed FAILS: its keys would go unchecked", () => {
        let r = run({...BOTH({}), "src/main.js": `t("a" ;`});
        expect(r.status).toBe(1);
        expect(r.out).toMatch(/src\/main\.js cannot be parsed .*NOT checked/);
    });

    test("plurals: only a bare base or an `_other` makes a group a plural", () => {
        /*  An enumeration is not a plural  */
        let steps = run({...BOTH({"step_one": "Step one", "step_two": "Step two", "step_three": "Step three"}),
            "src/main.js": `t("step_one"); t("step_two"); t("step_three");`});
        expect(steps.status).toBe(0);
        expect(steps.out).not.toMatch(/plural "step"/);
        expect(steps.out).not.toMatch(/NO locale/);

        /*  A form asked for by its own name, a bare base beside it  */
        let pick = run({...BOTH({"pick": "Pick", "pick_one": "Pick one"}),
            "src/main.js": `t("pick"); t("pick_one");`});
        expect(pick.status).toBe(0);
        expect(pick.out).not.toContain(`NO locale: "pick_one"`);

        /*  ...and a form nobody defined is still reported  */
        let missing = run({...BOTH({"pick": "Pick", "pick_one": "Pick one"}),
            "src/main.js": `t("pick_few");`});
        expect(missing.status).toBe(1);
        expect(missing.out).toContain(`NO locale: "pick_few"`);
    });

    test("a const is followed to its value; so is a const table, and the array a .map() walks", () => {
        let r = run({...BOTH({}), "src/main.js": [
            `import {yui_shell_show_error} from "@yuneta/gobj-ui/src/shell_modals.js";`,
            `const KEY = "const key";`,
            `const TABLE = {a: "table key"};`,
            `const KINDS = ["kind a", "kind b"];`,
            `t(KEY);`,
            `t(TABLE.a);`,
            `yui_shell_show_error(shell, KEY + "!");`,          // built: not
            `x = KINDS.map((k) => ({value: k, i18n: k}));`,
            `function f(KEY) { t(KEY); }`,                     // a parameter: not the const
            `let mutable = "let key"; mutable = kw.other; t(mutable);`   // a let given data too: not
        ].join("\n")});
        expect(r.status).toBe(1);
        for(let k of ["const key", "table key", "kind a", "kind b"]) {
            expect(r.out).toContain(`defined in NO locale: ${JSON.stringify(k)}`);
        }
        expect(r.out).not.toContain(`"let key"`);
        expect(r.out).not.toContain(`"const key!"`);
    });

    test("the markers: each one is one, stands where a key is read, and names a list it can check", () => {
        let r = run({...BOTH({"listed": "Listed", "own key": "Own"}), "src/main.js": [
            `export const MY_VIEW_I18N_KEYS = ["listed"];`,
            `const OWN = "own key";`,
            `t(/* i18n: MY_VIEW_I18N_KEYS */ key_from_somewhere);`,     // fine
            `t(/* i18n: data */ comment);`,                              // fine
            `t(/* i18n: MY_VIEW_I18N_KEYS */ OWN);`,                     // "own key" is not in the list
            `t(/* i18n: NO_SUCH_I18N_KEYS */ k);`,                       // no such list
            `t(/* i18n: dato */ k);`,                                    // no marker
            `let x = /* i18n: data */ 1;`                                // marks no place a key is read
        ].join("\n")});
        expect(r.status).toBe(1);
        expect(r.out).toMatch(/src\/main\.js:5: "own key" is marked as a key of MY_VIEW_I18N_KEYS, and is not in it/);
        expect(r.out).toMatch(/src\/main\.js:6: the i18n marker names NO_SUCH_I18N_KEYS, a list no module the app mounts publishes/);
        expect(r.out).toMatch(/src\/main\.js:7: "i18n: dato" is no i18n marker/);
        expect(r.out).toMatch(/src\/main\.js:8: the i18n marker stands before `1;`, the value a variable is DECLARED with: mark it where the variable is handed to a place a key is read/);
        expect(r.out).not.toMatch(/main\.js:3:|main\.js:4:/);
    });

    test("a let a marker stands before is held to the marker: what it is given is read", () => {
        let r = run({...BOTH({"listed": "Listed", "one": "1", "two": "2"}), "src/main.js": [
            `export const MY_VIEW_I18N_KEYS = ["listed"];`,
            `function f(x) {`,
            `    let k = x.label || "listed";`,
            `    if(x.flag) {`,
            `        k = "not listed";`,
            `    }`,
            `    t(/* i18n: MY_VIEW_I18N_KEYS */ k);`,
            `}`,
            `function g(x) {`,
            `    let only = x? "one" : "two";`,
            `    t(/* i18n: data */ only);`,
            `}`
        ].join("\n")});
        expect(r.status).toBe(1);
        expect(r.out).toContain(`defined in NO locale: "not listed"`);
        expect(r.out).toMatch(/src\/main\.js:7: "not listed" is marked as a key of MY_VIEW_I18N_KEYS, and is not in it/);
        expect(r.out).toMatch(/src\/main\.js:11: `only` is a let \(line 10\) that only ever holds literals \("one", "two"\): make it a const/);
    });

    test("REV-CLOUD V20 (js3_v lists #1): a member or an element of a marked let table is read too", () => {
        let r = run({...BOTH({"listed": "Listed", "in a table": "x", "pushed": "x"}), "src/main.js": [
            `export const MY_VIEW_I18N_KEYS = ["listed"];`,
            `let LABELS = {a: "listed", b: "in a table"};`,
            `function f(k) { return t(/* i18n: MY_VIEW_I18N_KEYS */ LABELS[k]); }`,
            `let LIST = [];`,
            `LIST.push("pushed", "not defined anywhere");`,
            `function g() { LIST.forEach((x) => t(/* i18n: MY_VIEW_I18N_KEYS */ x)); }`
        ].join("\n")});
        expect(r.status).toBe(1);
        expect(r.out).toMatch(/src\/main\.js:3: `LABELS` is a let \(line 2\) that only ever holds literals \("listed", "in a table"\): make it a const/);
        expect(r.out).toContain(`defined in NO locale: "not defined anywhere"`);
        expect(r.out).toMatch(/src\/main\.js:6: "pushed" is marked as a key of MY_VIEW_I18N_KEYS, and is not in it/);
    });

    test("REV-CLOUD V20 (js2_va #1): a literal branch added to a key the library reads is asked for", () => {
        let decl = `    const title = (mode === "create")? "new" : ((mode === "view")? "view" : "edit");`;
        let mutated = library_copy((src) => {
            let path = join(src, "c_yui_treedb_topic_with_form.js");
            let code = readFileSync(path, "utf8");
            expect(code).toContain(decl);
            writeFileSync(path, code.replace(decl,
                `    const title = (mode === "clone")? "a brand new clone title" :\n` +
                `        (mode === "create")? "new" : ((mode === "view")? "view" : "edit");`));
        });
        let app = {...BOTH({}),
            "src/main.js": `import {register_c_yui_treedb_topic_with_form} from "@yuneta/gobj-ui/src/c_yui_treedb_topic_with_form.js";`};
        let r = run(app, [], "", mutated);
        expect(r.status).toBe(1);
        expect(r.out).toContain(`defined in NO locale: "a brand new clone title"`);
        expect(run(app).out).not.toContain(`"a brand new clone title"`);
    });

    test("a locale that exports its own name, or a default, IS a locale: failing to load it FAILS", () => {
        let own_name = run({
            "src/locales/en.js": locale("en", {"hello": "Hello"}),
            "src/locales/es.js": `const translation = {"hello": "Hola"}; foo(); export const es = {translation};\n`,
            "src/main.js": `t("hello");`
        });
        expect(own_name.status).toBe(1);
        expect(own_name.out).toMatch(/es\.js exports es and cannot be loaded \(foo is not defined\): its language is NOT validated/);

        let by_default = run({
            "src/locales/en.js": locale("en", {"hello": "Hello"}),
            "src/locales/es.js": `const translation = make(); export default {translation};\n`,
            "src/main.js": `t("hello");`
        });
        expect(by_default.status).toBe(1);
        expect(by_default.out).toMatch(/es\.js has a default export and cannot be loaded/);
    });

    test("run through a symlinked package with --preserve-symlinks-main: it still RUNS", () => {
        let files = {
            "src/locales/en.js": locale("en", {"save": "Save"}),
            "src/locales/es.js": locale("es", {"save": "Guardar"}).replace(`"save": "Guardar",`, `"save": "Guardar",,,`),
            "src/main.js": `t("save");`
        };
        let dir = mkdtempSync(join(tmpdir(), "vl-link-"));
        write_files(dir, files);
        mkdirSync(join(dir, "node_modules", "@yuneta"), {recursive: true});
        symlinkSync(PKG, join(dir, "node_modules", "@yuneta", "gobj-ui"));
        let script = join("node_modules", "@yuneta", "gobj-ui", "scripts", "validate-locales.mjs");
        for(let how of [{args: ["--preserve-symlinks-main"], env: process.env},
                        {args: [], env: {...process.env, NODE_OPTIONS: "--preserve-symlinks-main"}},
                        {args: [], env: process.env}]) {
            let r = spawnSync(process.execPath, [...how.args, script], {cwd: dir, encoding: "utf8", env: how.env});
            expect(r.status).toBe(1);
            expect(r.stdout + r.stderr).toMatch(/es\.js cannot be parsed .*its language is NOT validated/);
        }
    });

    test("REV-CLOUD V20.5: a const key a mounted module hands to its helper is asked for", () => {
        let call = `"TREEDB_CARD_TABLE", "yi-table", "table", fill(routes.table)`;
        let mutated = library_copy((src) => {
            let path = join(src, "c_yui_treedb_topics.js");
            let code = readFileSync(path, "utf8");
            expect(code).toContain(call);
            writeFileSync(path, code
                .replace(call, call.replace(`"table"`, "TABLE_KEY"))
                .replace(`const GCLASS_NAME = "C_YUI_TREEDB_TOPICS";`,
                         `const GCLASS_NAME = "C_YUI_TREEDB_TOPICS";\nconst TABLE_KEY = "a brand new card key";`));
        });
        let app = {...BOTH({}),
            "src/main.js": `import {register_c_yui_treedb_topics} from "@yuneta/gobj-ui/src/c_yui_treedb_topics.js";`};
        let r = run(app, [], "", mutated);
        expect(r.status).toBe(1);
        expect(r.out).toContain(`defined in NO locale: "a brand new card key"`);
        expect(run(app).out).not.toContain(`"a brand new card key"`);
    });

    test("REV-CLOUD V21.4.3: the rule per call holds the app's own code, with the file and the line", () => {
        let r = run({...BOTH({"install this app": "x", "k": "x", "t": "x", "saved": "x"}), "src/main.js": [
            `import {yui_shell_show_error, yui_shell_show_modal} from "@yuneta/gobj-ui/src/shell_modals.js";`,
            `import {yui_install_ask_once} from "@yuneta/gobj-ui/src/yui_install.js";`,
            `import {createElement2} from "@yuneta/gobj-js";`,
            `import i18next from "i18next";`,
            `let msg = "saved";`,
            `yui_shell_show_error(shell, msg);`,                                     // 6: a let
            `function warn(k) { yui_shell_show_error(shell, k); }`,                   // 7: a wrapper of its own
            `yui_shell_show_error(shell, "save " + what);`,                          // 8: built
            `let opts = {title: "t"};`,
            `yui_shell_show_modal(shell, "k", opts);`,                                // 10: an options variable
            `yui_install_ask_once(shell, {message: t("install this app")});`,         // 11: translated
            `yui_install_ask_once(shell, {message: i18next.t("install this app")});`, // 12: translated
            `yui_shell_show_error(shell, /* i18n: data */ t("k"));`,                  // 13: translated, marked
            `yui_shell_show_error(shell, /* i18n: data */ comment);`,                 // fine
            `yui_install_ask_once(shell, {message: "install this app"});`,           // fine: the key
        ].join("\n")});
        expect(r.status).toBe(1);
        let lines = (re) => r.out.split("\n").filter((l) => re.test(l)).map((l) => Number(l.match(/main\.js:(\d+)/)[1]));
        expect(lines(/which the reader cannot follow/)).toEqual([6, 7, 8, 10]);
        expect(lines(/a TRANSLATED text where a KEY goes/)).toEqual([11, 12, 13]);
        expect(r.out).toContain(`src/main.js:6: yui_shell_show_error() [1] is given msg, which the reader cannot follow`);
        expect(r.out).toContain(`src/main.js:11: yui_install_ask_once() [1.message] is given t("install this app"): ` +
            `a TRANSLATED text where a KEY goes`);
    });

    test("REV-CLOUD V21.4.3: DOM at a key position is no key -- known by where it comes from, not by a name", () => {
        let ok = run({...BOTH({"title key": "x"}), "src/main.js": [
            `import {yui_shell_show_modal, yui_shell_show_error} from "@yuneta/gobj-ui/src/shell_modals.js";`,
            `import {createElement2, html_markup} from "@yuneta/gobj-js";`,
            `import {text_node} from "@yuneta/gobj-ui/src/yui_text.js";`,
            `const $box = createElement2(["div", {}, "x"]);`,
            `yui_shell_show_modal(shell, $box, {title: "title key"});`,
            `yui_shell_show_modal(shell, createElement2(["p", {}, "x"]));`,
            `yui_shell_show_error(shell, [["span", {}, "a spec"]]);`,
            `yui_shell_show_error(shell, text_node(name));`,
            `yui_shell_show_error(shell, html_markup("<b>x</b>"));`,
            `yui_shell_show_error(shell, document.createElement("div"));`,
            `let $msg = null;`,
            `if(x) { $msg = createElement2(["div", {}, "x"]); }`,
            `yui_shell_show_error(shell, $msg);`,
            `function build() { return createElement2(["div"]); }`,
            `yui_shell_show_error(shell, build());`
        ].join("\n")});
        expect(ok.out).not.toMatch(/cannot follow/);       // (its locales lack the library's keys: no OK)

        let not_dom = run({...BOTH({}), "src/main.js": [
            `import {yui_shell_show_error} from "@yuneta/gobj-ui/src/shell_modals.js";`,
            `function createElement2(x) { return x; }`,                   // the app's own, not gobj-js's
            `yui_shell_show_error(shell, createElement2("a key?"));`,
            `yui_shell_show_error(shell, $box);`,                          // a name says nothing
            `let $mixed = createElement2(["div"]);`,
            `$mixed = "a literal";`,
            `yui_shell_show_error(shell, $mixed);`                         // a let not only given DOM
        ].join("\n")});
        expect(not_dom.status).toBe(1);
        expect(not_dom.out).toMatch(/main\.js:3: yui_shell_show_error\(\) \[1\] is given createElement2\("a key\?"\)/);
        expect(not_dom.out).toMatch(/main\.js:4: yui_shell_show_error\(\) \[1\] is given \$box/);
        expect(not_dom.out).toMatch(/main\.js:7: yui_shell_show_error\(\) \[1\] is given \$mixed/);
    });

    test("REV-CLOUD V21.4.2: a data marker on what the reader follows to keys FAILS", () => {
        let r = run({...BOTH({"accepted": "x", "x": "x", "k": "x", "fallback": "x"}), "src/main.js": [
            `import {yui_shell_show_info} from "@yuneta/gobj-ui/src/shell_modals.js";`,
            `function pick() { return ok? "accepted" : "x"; }`,
            `const K = "k";`,
            `yui_shell_show_info(shell, /* i18n: data */ pick());`,                 // 4: the review's repro
            `yui_shell_show_info(shell, /* i18n: data */ "x");`,                    // 5: a literal
            `yui_shell_show_info(shell, /* i18n: data */ K);`,                      // 6: a const
            `yui_shell_show_info(shell, ok? /* i18n: data */ "x" : comment);`,      // 7: a branch that is one
            "t(/* i18n: data */ `x`);",                                             // 8: at t() too
            `yui_shell_show_info(shell, /* i18n: data */ comment || "fallback");`,  // fine: comment is data
            `yui_shell_show_info(shell, /* i18n: data */ reply.comment);`           // fine
        ].join("\n")});
        expect(r.status).toBe(1);
        let lines = r.out.split("\n").filter((l) => /marked as data, but/.test(l))
            .map((l) => Number(l.match(/main\.js:(\d+)/)[1]));
        expect(lines).toEqual([4, 5, 6, 7, 8]);
        expect(r.out).toContain(`src/main.js:4: marked as data, but what it marks is the key "accepted", "x", ` +
            `which the reader follows: drop the marker (it is no data)`);
        /*  ...and without the marker, what pick() returns is asked for  */
        let read = run({...BOTH({}), "src/main.js": [
            `import {yui_shell_show_info} from "@yuneta/gobj-ui/src/shell_modals.js";`,
            `function pick() { return ok? "picked a" : "picked b"; }`,
            `yui_shell_show_info(shell, pick());`
        ].join("\n")});
        expect(read.out).toContain(`defined in NO locale: "picked a"`);
        expect(read.out).toContain(`defined in NO locale: "picked b"`);
        expect(read.out).not.toMatch(/cannot follow/);
    });

    test("REV-CLOUD V21.4.6: a published list may spread an array of its own module", () => {
        let r = run({...BOTH({}), "src/lists.js": [
            `const COMMON = ["common key"];`,
            `export const A_I18N_KEYS = [...COMMON, "a key"];`,
            `export const B_I18N_KEYS = Object.freeze([...A_I18N_KEYS, "b key"]);`,
            `let MUTABLE = ["let key"];`,
            `export const C_I18N_KEYS = [...MUTABLE];`,
            `import {IMPORTED} from "./other.js";`,
            `export const D_I18N_KEYS = [...IMPORTED, "d key"];`,
            `export const E_I18N_KEYS = [...F_I18N_KEYS];`,
            `export const F_I18N_KEYS = [...E_I18N_KEYS];`
        ].join("\n"), "src/main.js": ``});
        expect(r.status).toBe(1);
        for(let k of ["common key", "a key", "b key"]) {
            expect(r.out).toContain(`defined in NO locale: ${JSON.stringify(k)}`);
        }
        expect(r.out).toMatch(/the published list C_I18N_KEYS: element 0 spreads MUTABLE, which is neither a const of the module nor a list it publishes/);
        expect(r.out).toMatch(/the published list D_I18N_KEYS: element 0 spreads IMPORTED/);
        expect(r.out).toMatch(/the published list E_I18N_KEYS: element 0 spreads F_I18N_KEYS, element 0 spreads E_I18N_KEYS/);
        expect(r.out).not.toContain(`"let key"`);
        expect(r.out).not.toContain(`"d key"`);
    });

    test("7.26.29: keys written as members, through String() and `${x}`, defaults, calls of module functions", () => {
        let r = run({...BOTH({}), "src/main.js": [
            `attrs.i18n = "member key";`,
            `attrs["data-i18n-title"] = "title member key";`,
            `const K = "string key"; t(String(K));`,
            "const K2 = \"template key\"; t(`${K2}`);",
            `function f(msg = "default key") { return t(msg); }`,
            `function pick() { return "returned key"; } t(pick());`,
            `function data_of(x) { return x.label; } t(data_of(y));`,          // returns a parameter: not followed
            `for(const {key} of [{key: "destructured key"}]) { t(key); }`
        ].join("\n")});
        expect(r.status).toBe(1);
        for(let k of ["member key", "title member key", "string key", "template key", "default key",
                      "returned key", "destructured key"]) {
            expect(r.out).toContain(`defined in NO locale: ${JSON.stringify(k)}`);
        }
    });

    test("--src and --locales: code and catalogs shared by several apps", () => {
        let r = run({
            "common/src/locales/en.js": locale("en", {"shared": "Shared", "own": "Own"}),
            "common/src/locales/es.js": locale("es", {"shared": "Compartido", "own": "Propio"}),
            "common/src/view.js": `t("shared");`,
            "app/src/main.js": `t("own"); t("not defined");`
        }, ["--src", "../common/src", "--locales", "../common/src/locales"], "app");
        expect(r.status).toBe(1);
        expect(r.out).toContain(`defined in NO locale: "not defined"`);
        expect(r.out).not.toContain(`"shared"`);
        expect(r.out).not.toContain(`"own"`);
        expect(r.out).toMatch(/no .*app_config\.json: no shell keys checked/);
    });

    test("REV-CLOUD V22.1: a recursive helper does not hang the build, and its data is data", () => {
        let label_of = (branches) => [
            `function label_of(n) {`,
            `    if(n.alias) { return label_of(n.alias); }`,
            `    if(n.parent) { return label_of(n.parent); }`,
            ...(branches > 2? [`    if(n.other) { return label_of(n.other); }`] : []),
            `    return n.name;`,
            `}`
        ];
        for(let branches of [2, 3]) {
            let lines = [`import {yui_shell_show_info} from "@yuneta/gobj-ui/src/shell_modals.js";`,
                         ...label_of(branches),
                         `$el.textContent = t(label_of(node));`,
                         `yui_shell_show_info(shell, label_of(node));`];
            let t0 = Date.now();
            let r = run({...BOTH({}), "src/main.js": lines.join("\n")});
            expect(Date.now() - t0).toBeLessThan(10000);
            expect(r.out).toContain(`src/main.js:${lines.length}: yui_shell_show_info() [1] is given label_of(node), ` +
                                    `which the reader cannot follow`);
            let marked = lines.slice(0, -1).concat([`yui_shell_show_info(shell, /* i18n: data */ label_of(node));`]);
            let m = run({...BOTH({}), "src/main.js": marked.join("\n")});
            expect(m.out).not.toMatch(/main\.js/);
        }
    });

    test("a const is read once: a chain of them that triples at every link is read fast, and its keys asked", () => {
        let chain = (n, first, link, read) => {
            let lines = [first];
            for(let i = 1; i <= n; i++) {
                lines.push(link(i));
            }
            lines.push(read(n));
            return lines.join("\n");
        };
        let objects = chain(11, `const O0 = {title: "an object chain key"};`,
            (i) => `const O${i} = c()? O${i - 1} : {...O${i - 1}, ...O${i - 1}, ...O${i - 1}};`,
            (n) => `t(O${n}.title);`);
        let arrays = chain(11, `const A0 = ["an array chain key"];`,
            (i) => `const A${i} = c()? A${i - 1} : [...A${i - 1}, ...A${i - 1}, ...A${i - 1}];`,
            (n) => `t(A${n}[0]);`);
        for(let main of [objects, arrays]) {
            let t0 = Date.now();
            let r = run({...BOTH({}), "src/main.js": main});
            expect(Date.now() - t0).toBeLessThan(5000);
            expect(r.status).toBe(1);
            expect(r.out).toMatch(/defined in NO locale: "an (object|array) chain key"/);
            expect(r.out).not.toMatch(/RangeError|gave up/);
        }
    });

    test("where the reader gives up on a value it FAILS, with the file and the line: a key behind it is never skipped in silence", () => {
        let chain = (n, first, link, read) => {
            let lines = [first];
            for(let i = 1; i <= n; i++) {
                lines.push(link(i));
            }
            lines.push(read(n));
            return lines.join("\n");
        };
        let cases = [
            /*  doubles at every link: up to 7.26.42 a RangeError naming no file  */
            [chain(12, `const O0 = {title: "a doubled key"};`,
                (i) => `const O${i} = c()? O${i - 1} : {...O${i - 1}, ...O${i - 1}};`, (n) => `t(O${n}.title);`),
             "src/main.js:2: the reader gave up on `O0`, and a key behind it would go unasked: it is more than " +
             "24 steps deep (a chain of consts, aliases or calls that long): shorten the chain"],
            /*  up to 7.26.42 it asked for nothing, and passed  */
            [chain(24, `const K0 = "an alias key";`, (i) => `const K${i} = K${i - 1};`, (n) => `t(K${n});`),
             "src/main.js:1: the reader gave up on `\"an alias key\"`"],
            /*  up to 7.26.42 it asked for every key but the last one, and passed without it  */
            [chain(12, `const K0 = "a far key";`, (i) => `const K${i} = c()? K${i - 1} : "a near key ${i}";`,
                (n) => `t(K${n});`),
             "src/main.js:1: the reader gave up on `\"a far key\"`"],
            [`const a = c()? a : "a looping key";\nt(a);`,
             "src/main.js:1: the reader gave up on `c()? a : \"a looping key\"`, and a key behind it would go " +
             "unasked: it is a const that leads back to itself: break the cycle"],
            /*  an alias of t that far is no translator any more: up to 7.26.42 its key went unasked  */
            [chain(24, `const T0 = t;`, (i) => `const T${i} = T${i - 1};`,
                (n) => `T${n}("a key handed to a far alias of t");`),
             "src/main.js:1: the reader gave up on `t`"]
        ];
        for(let [main, said] of cases) {
            let r = run({...BOTH({}), "src/main.js": main});
            expect(r.status).toBe(1);
            expect(r.out).toContain(said);
            expect(r.out).not.toMatch(/RangeError/);
        }
    });

    test("REV-CLOUD V22.3: an import is followed into the module it names -- the data marker on it too", () => {
        let r = run({...BOTH({"accepted": "x", "an imported const": "x", "renamed": "x"}),
            "src/labels.js": [
                `export function pick() { return "accepted"; }`,
                `export const KEY = "an imported const";`,
                `function chosen() { return "renamed"; }`,
                `export {chosen as choose};`
            ].join("\n"),
            "src/again.js": `export {pick as pick_again} from "./labels.js";`,
            "src/main.js": [
                `import {yui_shell_show_info} from "@yuneta/gobj-ui/src/shell_modals.js";`,
                `import {pick, KEY, choose} from "./labels.js";`,
                `import {pick_again} from "./again.js";`,
                `yui_shell_show_info(shell, /* i18n: data */ pick());`,           // 4
                `t(/* i18n: data */ KEY);`,                                       // 5
                `yui_shell_show_info(shell, /* i18n: data */ choose());`,         // 6
                `yui_shell_show_info(shell, /* i18n: data */ pick_again());`      // 7
            ].join("\n")});
        expect(r.status).toBe(1);
        let lines = r.out.split("\n").filter((l) => /marked as data, but/.test(l))
            .map((l) => Number(l.match(/main\.js:(\d+)/)[1]));
        expect(lines).toEqual([4, 5, 6, 7]);
        expect(r.out).toContain(`src/main.js:4: marked as data, but what it marks is the key "accepted"`);
        /*  ...and read unmarked: the keys are asked for, and the rule passes  */
        let read = run({...BOTH({}), "src/labels.js": `export function pick() { return "picked elsewhere"; }`,
            "src/main.js": [`import {yui_shell_show_info} from "@yuneta/gobj-ui/src/shell_modals.js";`,
                            `import {pick} from "./labels.js";`,
                            `yui_shell_show_info(shell, pick());`].join("\n")});
        expect(read.out).toContain(`defined in NO locale: "picked elsewhere"`);
        expect(read.out).not.toMatch(/cannot follow/);
    });

    test("REV-CLOUD V22.3: a data marker hides no key -- a mixed call, an array of strings -- and attaches through ( )", () => {
        let r = run({...BOTH({"a mixed key": "x", "a fallback": "x"}), "src/main.js": [
            `import {yui_shell_show_info} from "@yuneta/gobj-ui/src/shell_modals.js";`,
            `function label(kw) { return kw.ok? "a mixed key" : kw.comment; }`,
            `yui_shell_show_info(shell, /* i18n: data */ label(kw));`,                 // 3
            `yui_shell_show_info(shell, /* i18n: data */ ["a mixed key", "x"]);`,      // 4
            `yui_shell_show_info(shell, /* i18n: data */ (kw.comment || "a fallback"));`,
            `t(/* i18n: data */ (kw.a || kw.b));`
        ].join("\n")});
        expect(r.status).toBe(1);
        expect(r.out).toMatch(/src\/main\.js:3: marked as data, but `label\(kw\)` can also return the key "a mixed key": .*Split the branches/);
        expect(r.out).toMatch(/src\/main\.js:4: marked as data, but what it marks is an array of string literals \("a mixed key", "x"\), which is no DOM/);
        expect(r.out).not.toMatch(/main\.js:[56]:/);
    });

    test("REV-CLOUD V22.4: a translated text fails at a key position, marked too, whatever the translator is called", () => {
        let r = run({...BOTH({"saved": "x"}), "src/main.js": [
            `import {yui_shell_show_info} from "@yuneta/gobj-ui/src/shell_modals.js";`,
            `import {t as tt} from "i18next";`,
            `const translate = tt;`,
            `function tr(k) { return tt(k); }`,
            `yui_shell_show_info(shell, tr("saved"));`,                               // 5: unmarked
            `yui_shell_show_info(shell, /* i18n: data */ tr("saved"));`,              // 6
            `yui_shell_show_info(shell, /* i18n: data */ translate("saved"));`,       // 7
            `yui_shell_show_info(shell, /* i18n: data */ tt("saved"));`,              // 8
            `yui_shell_show_info(shell, /* i18n: data */ tt?.("saved"));`,            // 9
            `yui_shell_show_info(shell, /* i18n: data */ tt.call(null, "saved"));`    // 10
        ].join("\n")});
        expect(r.status).toBe(1);
        let lines = r.out.split("\n").filter((l) => /a TRANSLATED text where a KEY goes/.test(l))
            .map((l) => Number(l.match(/main\.js:(\d+)/)[1]));
        expect(lines).toEqual([5, 6, 7, 8, 9, 10]);
        expect(r.out).toContain("no marker excuses it): hand the key, not t(key)");
        expect(r.out).not.toMatch(/cannot follow/);       // a translated text is no value "it cannot follow"
    });

    test("REV-CLOUD V22.2/4: what is read now -- a key function however it is called, the new places, the new forms", () => {
        let r = run({...BOTH({}),
            "src/say.js": `export {yui_shell_show_info as say} from "@yuneta/gobj-ui/src/shell_modals.js";`,
            "src/api.js": [`import {yui_shell_show_info} from "@yuneta/gobj-ui/src/shell_modals.js";`,
                           `export const API2 = {info: yui_shell_show_info};`].join("\n"),
            "src/main.js": [
                `import {yui_shell_show_info} from "@yuneta/gobj-ui/src/shell_modals.js";`,
                `import {say} from "./say.js";`,
                `import {API2} from "./api.js";`,
                `API2.info(shell, "an imported map key");`,
                `const show = yui_shell_show_info;`,
                `const API = {info: yui_shell_show_info};`,
                `const ATTR = "data-i18n-title";`,
                `const PROP = "data-i18n";`,
                `const OPTS = {title: "an optional key"};`,
                `const {label} = {label: "a destructured key"};`,
                `show(shell, "an alias key");`,
                `API.info(shell, "a map key");`,
                `yui_shell_show_info.call(null, shell, "a call key");`,
                `say(shell, "a re-exported key");`,
                `t(["a first key", "a fallback key"]);`,
                `el.dataset.i18nTitle = "a dataset key";`,
                `el.setAttribute(ATTR, "a const attribute key");`,
                `let attrs = {[PROP]: "a computed property key"};`,
                `t(OPTS?.title);`,
                `t(label);`
            ].join("\n")});
        for(let k of ["an alias key", "a map key", "an imported map key", "a call key", "a re-exported key", "a first key",
                      "a fallback key", "a dataset key", "a const attribute key", "a computed property key",
                      "an optional key", "a destructured key"]) {
            expect(r.out).toContain(`defined in NO locale: ${JSON.stringify(k)}`);
        }
        /*  ...and the per-call rule holds them: an alias given a let  */
        let rule = run({...BOTH({"k": "x"}), "src/main.js": [
            `import {yui_shell_show_info} from "@yuneta/gobj-ui/src/shell_modals.js";`,
            `const show = yui_shell_show_info;`,
            `let k = "k";`,
            `show(shell, k);`
        ].join("\n")});
        expect(rule.out).toContain(`src/main.js:4: yui_shell_show_info() [1] is given k, which the reader cannot follow`);
    });

    test("REV-CLOUD V22.6: a list marker over a template: the list is asked for, and must hold a key of its shape", () => {
        let files = (list) => ({...BOTH({"monitor start": "x", "monitor stop": "x", "other": "x"}), "src/main.js": [
            `import {yui_shell_confirm_yesno} from "@yuneta/gobj-ui/src/shell_modals.js";`,
            `export const MONITOR_I18N_KEYS = ${JSON.stringify(list)};`,
            `function confirm(control) {`,
            `    let label = \`monitor \${control}\`;`,
            `    yui_shell_confirm_yesno(shell, "other", {yes_label: /* i18n: MONITOR_I18N_KEYS */ label});`,
            `    t(/* i18n: MONITOR_I18N_KEYS */ \`monitor \${control}\`);`,
            `}`
        ].join("\n")});
        let ok = run(files(["monitor start", "monitor stop"]));
        expect(ok.out).not.toMatch(/main\.js/);
        let wrong = run(files(["other"]));
        expect(wrong.status).toBe(1);
        expect(wrong.out).toContain("src/main.js:5: the i18n marker names MONITOR_I18N_KEYS for `monitor ${control}`, " +
                                    "and no key of it has that shape: publish the keys the template builds");
        expect(wrong.out).toContain("src/main.js:6: the i18n marker names MONITOR_I18N_KEYS for `monitor ${control}`");
        let missing = run({...files(["monitor start", "monitor gone"])});
        expect(missing.out).toContain(`defined in NO locale: "monitor gone"`);     // every key of the list is asked for
    });

    test("REV-CLOUD V23.5.1: a translator handed as a callback, a destructured one, setAttributeNS", () => {
        let r = run({...BOTH({}),
            "src/lists.js": `export const LISTED_I18N_KEYS = ["a listed key"];`,
            "src/main.js": [
                `import i18next from "i18next";`,
                `import {LISTED_I18N_KEYS} from "./lists.js";`,
                `const {t: tt} = i18next;`,
                `const KINDS = ["kind a", "kind b"];`,
                `KINDS.map(t);`,                                                    // 5
                `["literal a", "literal b"].forEach(i18next.t);`,
                `LISTED_I18N_KEYS.map(t);`,
                `Array.from(["from a"], t);`,
                `tt("a destructured key");`,
                `function f({t: translate}) { return translate("a parameter's key"); }`,
                `el.setAttributeNS(null, "data-i18n-title", "an ns attribute key");`,
                `let rows = kw.rows;`,
                `rows.map(t);`,                                                     // 13: fails
                `fetch_label().then(t);`,                                           // 14: fails
                `/* i18n: data */ rows.map(t);`,
                `fetch_label().then(/* i18n: data */ t);`,
                `x.map((k) => k).filter(Boolean);`
            ].join("\n")});
        expect(r.status).toBe(1);
        for(let k of ["kind a", "kind b", "literal a", "literal b", "a listed key", "from a",
                      "a destructured key", "a parameter's key", "an ns attribute key"]) {
            expect(r.out).toContain(`defined in NO locale: ${JSON.stringify(k)}`);
        }
        let lines = r.out.split("\n").filter((l) => /src\/main\.js:\d+: \S+ hands t\(\)/.test(l))
            .map((l) => Number(l.match(/main\.js:(\d+)/)[1]));
        expect(lines).toEqual([13, 14]);
        expect(r.out).toContain("src/main.js:13: .map(t) hands t() each element it walks as a key, and the " +
            "reader cannot follow rows: walk a const array (or a published list), or mark the call");
        expect(r.out).toContain("src/main.js:14: .then(t) hands t() what `fetch_label().then(t)` settles with, " +
            "as a key no source writes: mark the call");
    });

    test("REV-CLOUD V23.5.1: a data marker over a TRANSLATED text built from t() fails: hand the key", () => {
        let r = run({...BOTH({"saved": "x"}), "src/main.js": [
            `import {yui_shell_show_info} from "@yuneta/gobj-ui/src/shell_modals.js";`,
            `import {createElement2} from "@yuneta/gobj-js";`,
            `yui_shell_show_info(shell, /* i18n: data */ t("saved") + ":");`,            // 3
            `yui_shell_show_info(shell, /* i18n: data */ t("saved").toUpperCase());`,    // 4
            `yui_shell_show_info(shell, t("saved") + ":");`,                             // 5: unmarked too
            `t(/* i18n: data */ t("saved") + "!");`,                                     // 6: at t()
            "x = {i18n: /* i18n: data */ `${t(\"saved\")}:`};",                           // 7: an i18n value
            `yui_shell_show_info(shell, /* i18n: data */ comment + ":");`,               // data: fine
            `yui_shell_show_info(shell, /* i18n: data */ createElement2(["p", {}, t("saved")]));`,  // DOM: fine
            `yui_shell_show_info(shell, /* i18n: data */ kw.comment || "saved");`        // fine
        ].join("\n")});
        expect(r.status).toBe(1);
        let rule = r.out.split("\n").filter((l) => /a TRANSLATED text where a KEY goes/.test(l))
            .map((l) => Number(l.match(/main\.js:(\d+)/)[1]));
        expect(rule).toEqual([3, 4, 5]);
        expect(r.out).toContain(`src/main.js:3: yui_shell_show_info() [1] is given t("saved") + ":": a TRANSLATED text`);
        let marked = r.out.split("\n").filter((l) => /is a TRANSLATED text: where a key is read/.test(l))
            .map((l) => Number(l.match(/main\.js:(\d+)/)[1]));
        expect(marked).toEqual([6, 7]);
        expect(r.out).toContain("src/main.js:6: marked as data, but `t(\"saved\") + \"!\"` is a TRANSLATED text: " +
            "where a key is read, the translation is kept as its key and never changes language, and no marker " +
            "excuses it: hand the key, not t(key)");
        expect(r.out).not.toMatch(/main\.js:(8|9|10):/);
        expect(r.out).not.toMatch(/cannot follow/);
    });

    test("REV-CLOUD V23.5.2: a published list mutated through an alias or a namespace import FAILS", () => {
        let r = run({...BOTH({"in it": "x"}), "src/main.js": [
            `export const X_I18N_KEYS = ["in it"];`,
            `const alias = X_I18N_KEYS;`,
            `alias.push("through a const alias");`,                                         // 3
            `function f() { const inner = alias; inner.splice(0, 0, "two aliases deep"); }`, // 4
            `let held = X_I18N_KEYS;`,
            `held.push("through a let given nothing else");`,                               // 6
            `let copy = X_I18N_KEYS;`,
            `copy = copy.slice();`,
            `copy.push("a copy, not the list");`,
            `Array.prototype.push.call(X_I18N_KEYS, "not seen: a documented limit");`,
            `function g(list) { list.push("not seen: through a parameter"); }`,
            `g(X_I18N_KEYS);`
        ].join("\n"), "src/other.js": [
            `import * as M from "./main.js";`,
            `M.X_I18N_KEYS.push("through a namespace");`,                                  // 2
            `M.X_I18N_KEYS[1] = "indexed through a namespace";`,                           // 3
            `const n = M.X_I18N_KEYS;`,
            `n.length = 0;`                                                                 // 5
        ].join("\n")});
        expect(r.status).toBe(1);
        let lines = (file) => r.out.split("\n").filter((l) => l.includes(`src/${file}:`) && /is MUTATED/.test(l))
            .map((l) => Number(l.match(/\.js:(\d+)/)[1]));
        expect(lines("main.js")).toEqual([3, 4, 6]);
        expect(lines("other.js")).toEqual([2, 3, 5]);
        expect(r.out).toContain("src/main.js:3: the published list X_I18N_KEYS (through its alias `alias`) is MUTATED");
        expect(r.out).toContain("src/main.js:4: the published list X_I18N_KEYS (through its alias `alias`) " +
            "(through its alias `inner`) is MUTATED");
        expect(r.out).toContain("src/other.js:2: the published list M.X_I18N_KEYS is MUTATED");
        expect(r.out).toContain("src/other.js:5: the published list M.X_I18N_KEYS (through its alias `n`) is MUTATED");
    });

    test("REV-CLOUD V23.5: an UNMARKED let that only ever holds literals is followed; one given anything else is not", () => {
        let keys = ["let key one", "let key two", "a const key", "an attr let key", "another attr let key",
                    "an i18n let key", "an or-assigned key", "a dataset let key"];
        let files = (dict) => ({...BOTH(dict), "src/main.js": [
            `const K = "a const key";`,
            `function f(x, kw, el) {`,
            `    let state_key = (x === 1)? "let key one" : "let key two";`,
            `    if(kw.z) {`,
            `        state_key = K;`,
            `    }`,
            `    el.textContent = t(state_key);`,                                  // at t()
            `    let attr_key;`,
            `    if(x) {`,
            `        attr_key = "an attr let key";`,
            `    } else {`,
            `        attr_key = "another attr let key";`,
            `    }`,
            `    el.setAttribute("data-i18n-title", attr_key);`,                   // at a data-i18n* attribute
            `    var ds_key = "a dataset let key";`,
            `    el.dataset.i18nAriaLabel = ds_key;`,                              // a var, at dataset.i18n*
            `    let i18n_key = "an i18n let key";`,
            `    if(kw.empty) {`,
            `        i18n_key = null;`,
            `    }`,
            `    i18n_key ||= "an or-assigned key";`,
            `    return ["span", {i18n: i18n_key}];`,                              // at an i18n attr
            `}`,
            `function g(kw) {`,
            `    let mixed = "a mixed let key";`,
            `    if(kw.y) {`,
            `        mixed = kw.label;`,                                           // given a variable
            `    }`,
            `    let grown = "a grown key";`,
            `    grown += "!";`,                                                   // a write it cannot read
            `    let walked = "a walked key";`,
            `    for(walked of kw.list) {`,
            `        use(walked);`,
            `    }`,
            `    return [t(mixed), t(grown), t(walked)];`,
            `}`
        ].join("\n")});
        let r = run(files({}));
        expect(r.status).toBe(1);
        for(let k of keys) {
            expect(r.out).toContain(`defined in NO locale: ${JSON.stringify(k)}`);
        }
        for(let k of ["a mixed let key", "a grown key", "a walked key"]) {
            expect(r.out).not.toContain(JSON.stringify(k));
        }
        expect(r.out).not.toMatch(/make it a const/);           // no new failure for an unmarked let
        let ok = run(files(Object.fromEntries(keys.map((k) => [k, "x"]))));
        expect(ok.out).toMatch(/OK \(2 locales x 8 keys, 8 used in the source\)/);
        expect(ok.status).toBe(0);
    });

    test("REV-CLOUD V23.5.3: a marker naming the list of a NARROWER template fails at both templates", () => {
        let files = (wide, narrow, lists) => ({
            ...BOTH({"monitor start": "x", "monitor stop": "x", "monitor confirm start": "x",
                     "monitor confirm stop": "x", "other": "x"}),
            "src/main.js": [
                `import {yui_shell_confirm_yesno} from "@yuneta/gobj-ui/src/shell_modals.js";`,
                ...lists,
                `function confirm(control) {`,
                `    let label = \`monitor \${control}\`;`,
                `    yui_shell_confirm_yesno(shell, "other", {yes_label: /* i18n: ${wide} */ label});`,
                `    t(/* i18n: ${narrow} */ \`monitor confirm \${control}\`);`,
                `}`
            ].join("\n")});
        let two_lists = [`export const MONITOR_I18N_KEYS = ["monitor start", "monitor stop"];`,
                         `export const CONFIRM_I18N_KEYS = ["monitor confirm start", "monitor confirm stop"];`];
        let ok = run(files("MONITOR_I18N_KEYS", "CONFIRM_I18N_KEYS", two_lists));
        expect(ok.out).not.toMatch(/main\.js/);

        /*  The wide template marked with the narrow one's list: every key
         *  of its shape there is the narrower template's  */
        let wide = run(files("CONFIRM_I18N_KEYS", "CONFIRM_I18N_KEYS", two_lists));
        expect(wide.status).toBe(1);
        expect(wide.out).toContain("src/main.js:6: the i18n marker names CONFIRM_I18N_KEYS for `monitor ${control}`, " +
            "and every key of it with that shape has the shape of a narrower template, `monitor confirm ${control}` " +
            "(src/main.js:7), which builds those keys: name the list of the keys `monitor ${control}` builds");

        /*  Both swapped: both fail  */
        let swapped = run(files("CONFIRM_I18N_KEYS", "MONITOR_I18N_KEYS", two_lists));
        expect(swapped.out).toMatch(/src\/main\.js:6: .*narrower template/);
        expect(swapped.out).toMatch(/src\/main\.js:7: .*no key of it has that shape/);

        /*  One list holding both families is no swap: the wide template
         *  has keys of its own there  */
        let one = run(files("ALL_I18N_KEYS", "ALL_I18N_KEYS",
            [`export const ALL_I18N_KEYS = ["monitor start", "monitor stop", "monitor confirm start", "monitor confirm stop"];`]));
        expect(one.out).not.toMatch(/main\.js/);
    });

    test("REV-CLOUD V24.5.1: every write to an unmarked let counts -- the review's probe asks for no sentinel", () => {
        let r = run({...BOTH({"save": "x"}), "src/main.js": [
            `export function rows_a(el, rows) {`,
            `    let key = "-";`,
            `    for([key, label] of rows) {`,                  // the review's probe
            `        el.setAttribute("data-i18n", key);`,
            `    }`,
            `}`,
            `export function rows_b(rows) {`,
            `    let key = "-";`,
            `    for({key} of rows) {`,
            `        t(key);`,
            `    }`,
            `}`,
            `export function rows_c(obj) {`,
            `    let key = "-";`,
            `    for([key] in obj) {`,
            `        t(key);`,
            `    }`,
            `}`,
            `export function rows_d(rows) {`,
            `    var key = "-";`,
            `    for(var key of rows) {`,
            `    }`,
            `    return t(key);`,
            `}`,
            `export function rows_e(rows, row) {`,
            `    let key = "-";`,
            `    [key, x] = rows;`,
            `    ({key} = row);`,
            `    return t(key);`,
            `}`,
            `var mod_key = "-";`,
            `if(kw.c) {`,
            `    var mod_key = kw.data;`,                      // a module var given more in a block
            `}`,
            `t(mod_key);`,
            `var head_key = "-";`,
            `for(var head_key of kw.rows) {`,
            `}`,
            `t(head_key);`,
            `export function flow(c) {`,
            `    let k = null;`,                               // the sentinel that is never asked for
            `    if(c) {`,
            `        k = "save";`,
            `    }`,
            `    return k? t(k) : "";`,
            `}`
        ].join("\n")});
        expect(r.out).not.toContain(`"-"`);
        expect(r.out).toMatch(/OK \(2 locales x 1 keys, 1 used in the source\)/);
        expect(r.status).toBe(0);
        /*  ...and the rule stays flow-INSENSITIVE: a literal an `if` excludes is asked for  */
        let flow = run({...BOTH({"save": "x"}), "src/main.js": [
            `export function flow(c) {`,
            `    let k = "-";`,
            `    if(c) {`,
            `        k = "save";`,
            `    }`,
            `    return (k !== "-")? t(k) : "";`,
            `}`
        ].join("\n")});
        expect(flow.status).toBe(1);
        expect(flow.out).toContain(`key used in the source but defined in NO locale: "-"`);
    });

    test("REV-CLOUD V24.5.2: a TRANSLATED text where a key is read fails, marked or not, with the file and the line", () => {
        let r = run({...BOTH({"saved": "x", "fallback": "x"}), "src/main.js": [
            `import {createElement2} from "@yuneta/gobj-js";`,
            `x = {i18n: t("saved")};`,                                       // 2
            `el.setAttribute("data-i18n-title", t("saved"));`,               // 3
            `t(t("saved") + "!");`,                                          // 4
            `el.dataset.i18nAriaLabel = tr("saved");`,                       // 5
            `x["data-i18n"] = t("saved");`,                                  // 6
            `t([t("saved"), "fallback"]);`,                                  // 7
            `const LABEL = t("saved");`,                                     // 8
            `el.setAttribute("data-i18n", LABEL);`,                          // 9: read here
            `x = {i18n: /* i18n: data */ t("saved")};`,                      // 10: marked, as before
            `x = {i18n: createElement2(["p", {}, t("saved")])};`,            // DOM: fine
            `let held = t("saved");`,
            `x = {i18n: held};`                                              // a let: the documented limit
        ].join("\n")});
        expect(r.status).toBe(1);
        let lines = r.out.split("\n").filter((l) => /is a TRANSLATED text/.test(l))
            .map((l) => Number(l.match(/main\.js:(\d+)/)[1]));
        expect(lines).toEqual([2, 3, 4, 5, 6, 7, 8, 10]);
        expect(r.out).toContain("src/main.js:2: `t(\"saved\")` is a TRANSLATED text given to a property that holds a " +
            "key (i18n, code, data-i18n*): the translation is kept as its key and never changes language: hand the " +
            "key, not t(key)");
        expect(r.out).toContain("src/main.js:3: `t(\"saved\")` is a TRANSLATED text given to a data-i18n* attribute:");
        expect(r.out).toContain("src/main.js:8: `t(\"saved\")` is a TRANSLATED text given to a data-i18n* attribute " +
            "(read at line 9):");
        expect(r.out).toContain("src/main.js:10: marked as data, but `t(\"saved\")` is a TRANSLATED text:");
        expect(r.out).not.toMatch(/main\.js:(11|12|13):/);
    });

    test("REV-CLOUD V24.5 Info: findIndex, findLastIndex, .call() / .apply(), Array.fromAsync(); a bound t's arguments are no keys", () => {
        let r = run({...BOTH({}), "src/main.js": [
            `import {yui_shell_show_info} from "@yuneta/gobj-ui/src/shell_modals.js";`,
            `const K = ["a findindex key"];`,
            `K.findIndex(t);`,
            `["a findlastindex key"].findLastIndex(t);`,
            `Array.prototype.map.call(["a call key"], t);`,
            `[].forEach.apply(["an apply key"], [t]);`,
            `Array.fromAsync(["a from async key"], t);`,
            `Array.prototype.forEach.call(["a callback's key"], (k) => t(k));`,
            `const tk = t.bind(null, "a bound key");`,
            `tk("not a key: an option");`,
            `["not a key: an element"].map(tk);`,
            `const show = yui_shell_show_info.bind(null, shell);`,
            `show("a bound function key");`,
            `let rows = kw.rows;`,
            `Array.prototype.map.call(rows, t);`,                            // 15: fails
            `show(kw.message);`                                              // 16: fails
        ].join("\n")});
        expect(r.status).toBe(1);
        for(let k of ["a findindex key", "a findlastindex key", "a call key", "an apply key", "a from async key",
                      "a callback's key", "a bound function key", "a bound key"]) {     // read where it is bound
            expect(r.out).toContain(`defined in NO locale: ${JSON.stringify(k)}`);
        }
        expect(r.out).not.toMatch(/not a key/);
        expect(r.out).toContain("src/main.js:15: .map.call(..., t) hands t() each element it walks as a key, and " +
            "the reader cannot follow rows: walk a const array (or a published list), or mark the call");
        expect(r.out).toContain("src/main.js:16: yui_shell_show_info() [1] is given kw.message, which the reader " +
            "cannot follow");
    });

    test("the arguments a `.bind()` binds to a key function, or to t(), are read at their positions", () => {
        let r = run({...BOTH({}), "src/main.js": [
            `import {yui_shell_show_info, yui_shell_confirm_ok} from "@yuneta/gobj-ui/src/shell_modals.js";`,
            `const say = yui_shell_show_info.bind(null, shell, "a bound message key");`,
            `say();`,
            `const ask = yui_shell_confirm_ok.bind(null, shell, "a bound question key", {title: "a bound title key"});`,
            `const later = yui_shell_show_info.bind(null, shell).bind(null, "a twice bound key");`,
            `const tk = t.bind(null, "a key bound to t");`,
            `const tn = t.bind(i18next);`,
            `function relay(msg) {`,
            `    return yui_shell_show_info.bind(null, shell, msg);`,            // 9: fails, as unbound
            `}`,
            `function relay_marked(msg) {`,
            `    return yui_shell_show_info.bind(null, shell, /* i18n: data */ msg);`,
            `}`,
            `const many = yui_shell_show_info.bind(null, ...ARGS);`              // 14: fails
        ].join("\n")});
        expect(r.status).toBe(1);
        for(let k of ["a bound message key", "a bound question key", "a bound title key", "a twice bound key",
                      "a key bound to t"]) {
            expect(r.out).toContain(`defined in NO locale: ${JSON.stringify(k)}`);
        }
        expect(r.out).toContain("src/main.js:9: yui_shell_show_info() [1] is given msg, which the reader cannot follow");
        expect(r.out).toContain("src/main.js:14: yui_shell_show_info() [1] is given ...ARGS, which the reader cannot follow");
        expect(r.out).not.toMatch(/main\.js:(2|3|4|5|6|7|12):/);
    });

    test("a card is named `name || aria_label || id`: its id is a key only for a card with neither", () => {
        let r = run({...BOTH({}), "src/main.js": [
            `import {card_descriptor, cards_grid_descriptor} from "@yuneta/gobj-ui/src/nav_cards_helpers.js";`,
            `card_descriptor({id: "a named card id", name: "a card name key"});`,
            `card_descriptor({id: "an aria card id", aria_label: "a card aria key"});`,
            `card_descriptor({id: "a bare card id"});`,
            `card_descriptor({id: row.id, name: "an ok key"});`,                 // no violation: it has a name
            `card_descriptor({id: "a maybe named card id", name: row.name});`,   // 6: the name may be empty
            `cards_grid_descriptor([{id: "a named grid id", name: "a grid name key"}, {id: "a bare grid id"},`,
            `                       {id: "an empty named grid id", name: ""}]);`,
            `const CARD = {id: "a const card id", name: "a const card name key"};`,
            `card_descriptor(CARD);`,
            `card_descriptor({...CARD, id: "a spread card id"});`,
            `card_descriptor(c() ? {id: "a branch card id", name: "a branch name key"} : {id: "a bare branch id"});`
        ].join("\n")});
        expect(r.status).toBe(1);
        for(let k of ["a card name key", "a card aria key", "a bare card id", "an ok key", "a maybe named card id",
                      "a grid name key", "a bare grid id", "an empty named grid id", "a const card name key",
                      "a branch name key", "a bare branch id"]) {
            expect(r.out).toContain(`defined in NO locale: ${JSON.stringify(k)}`);
        }
        for(let k of ["a named card id", "an aria card id", "a named grid id", "a const card id", "a spread card id",
                      "a branch card id"]) {
            expect(r.out).not.toContain(`defined in NO locale: ${JSON.stringify(k)}`);
        }
        expect(r.out).toContain("src/main.js:6: card_descriptor() [0.name] is given row.name, which the reader cannot follow");
        expect(r.out).not.toMatch(/main\.js:5:/);
    });

    test("a menu item with no `name` is named by its key: the `id` the library falls back to is asked for", () => {
        let config = {
            shell: {zones: {left: {host: "menu.primary"}, top: {host: "menu.crumbs"},
                            bottom: {host: "menu.quiet"}}},
            menu: {
                primary: {
                    render: {left: "vertical"},
                    items: [
                        {id: "a nameless item", route: "/a", icon: "yi-house"},      // name || aria_label || id
                        {id: "an aria item", aria_label: "an aria key", route: "/b"},
                        {id: "a named item", name: "a name key", route: "/c"},
                        {type: "header", id: "a header id"},
                        {type: "divider", id: "a divider id"},
                        {id: "a section", route: "/s", submenu: {index: true, items: [
                            {id: "a nameless sub", route: "/s/x"},
                            {id: "an aria sub", aria_label: "an aria sub key", route: "/s/y"}
                        ]}},
                        {id: "an indexed aria item", aria_label: "an indexed aria key", route: "/t",     // its landing:
                         submenu: {index: true, items: [{id: "a named sub", name: "a sub name key", route: "/t/x"}]}},
                                                                                // name || aria_label || id
                        {id: "a targeted section", aria_label: "a targeted aria key", route: "/u", target: {},
                         submenu: {index: true, items: []}},
                        {id: "a crumbs section", name: "a crumbs section key", route: "/v", submenu: {
                            render: {"top-sub": "breadcrumb"},
                            items: [{id: "a sub crumb", aria_label: "a sub crumb aria key", route: "/v/x"}]
                        }},
                        {id: "a dropdown entry", name: "a dropdown entry key", route: "/w", action: {   // the site map
                            type: "dropdown", items: [                                                // draws its rows
                                {id: "a nameless dropdown row"},
                                {id: "an aria dropdown row", aria_label: "an aria dropdown row key"}
                            ]}},
                        {id: "both", name: "both key", route: "/z", submenu: {items: [{id: "z1", name: "z1 key"}]},
                         action: {type: "dropdown", items: [{id: "a shadowed row"}]}}   // the map walks the submenu
                    ]
                },
                crumbs: {
                    render: {"*": {layout: "breadcrumb"}},
                    items: [{id: "a crumb", aria_label: "a crumb aria key", route: "/k"}]      // text: name || id
                },
                quiet: {
                    render: {bottom: {layout: "breadcrumb", show_label: false}},
                    items: [{id: "a quiet crumb", aria_label: "a quiet aria key", route: "/q"}]
                }
            }
        };
        let r = run({...BOTH({}), "src/main.js": ``, "src/app_config.json": JSON.stringify(config)});
        expect(r.status).toBe(1);
        for(let k of ["a nameless item", "a section", "a nameless sub", "a crumb", "a sub crumb",
                      "a nameless dropdown row", "an aria key", "a name key", "an aria sub key", "a crumb aria key",
                      "a quiet aria key", "an aria dropdown row key", "an indexed aria key"]) {
            expect(r.out).toContain(`defined in NO locale: ${JSON.stringify(k)}`);
        }
        for(let k of ["an aria item", "a named item", "a header id", "a divider id", "an aria sub", "a named sub",
                      "a targeted section", "a quiet crumb", "a crumbs section", "a dropdown entry",
                      "an aria dropdown row", "a shadowed row", "an indexed aria item"]) {
            expect(r.out).not.toContain(`defined in NO locale: ${JSON.stringify(k)}`);
        }
    });

    test("a menu drawn as a `submenu` is headed by its id, a key: the id is asked for", () => {
        let config = {
            shell: {zones: {left: {host: "menu.a side menu"}, top: {host: "menu.a star menu"},
                            bottom: {host: "menu.a vertical menu"}}},
            menu: {
                "a side menu": {render: {left: "submenu"}, items: [{id: "a", name: "an a key", route: "/a"}]},
                "a star menu": {render: {"*": {layout: "submenu"}}, items: [{id: "b", name: "a b key", route: "/b"}]},
                "a vertical menu": {render: {bottom: "vertical"}, items: [{id: "c", name: "a c key", route: "/c"}]},
                "an unhosted menu": {render: {left: "submenu"}, items: [{id: "d", name: "a d key", route: "/d"}]},
                "a menu with a submenu": {render: {left: "vertical"}, items: [
                    {id: "e", name: "an e key", route: "/e", submenu: {render: {left: "submenu"},     // headed by
                        items: [{id: "e1", name: "an e1 key", route: "/e/1"}]}}                         // its entry
                ]}
            }
        };
        let r = run({...BOTH({}), "src/main.js": ``, "src/app_config.json": JSON.stringify(config)});
        expect(r.status).toBe(1);
        for(let k of ["a side menu", "a star menu", "an a key", "a b key", "an e key"]) {
            expect(r.out).toContain(`defined in NO locale: ${JSON.stringify(k)}`);
        }
        for(let k of ["a vertical menu", "an unhosted menu", "a menu with a submenu", "e"]) {
            expect(r.out).not.toContain(`defined in NO locale: ${JSON.stringify(k)}`);
        }
    });

    test("a toolbar item with neither `aria_label` nor `name` is named by its key: its `id` is asked for", () => {
        let config = {
            toolbar: {items: [
                {id: "a nameless action", icon: "yi-gear", action: {type: "event", event: "EV_X"}},  // aria_label || name || id
                {id: "an aria action", aria_label: "an action aria key", action: {type: "event", event: "EV_X"}},
                {id: "a named action", name: "an action name key", action: {type: "event", event: "EV_X"}},
                {id: "a nameless menu", icon: "yi-bars", action: {type: "dropdown", items: [
                    {id: "a nameless entry", icon: "yi-flag", action: {type: "event", event: "EV_Y"}},
                    {id: "a named entry", name: "an entry name key", action: {type: "event", event: "EV_Y"}},
                    {id: "a divider entry", type: "divider"},
                    {id: "an entry with no action"},                     // not drawn; the site map labels it
                    {id: "a parent entry", name: "a parent entry key", action: {type: "dropdown", items: [
                        {id: "a nested entry"}                           // the site map walks every level
                    ]}}
                ]}},
                {id: "a brand", type: "brand", logo: "/l.svg", wordmark: "Brand"},
                {id: "a brand menu", type: "brand", logo: "/l.svg", wordmark: "Brand",
                 action: {type: "dropdown", items: [                                                 // its menu: the id
                     {id: "a brand entry", action: {type: "event", event: "EV_Z"}},
                     {id: "a brand entry with no action"}                // drawn by neither
                 ]}},
                {id: "an avatar", type: "avatar", action: {type: "dropdown", items: [                // "user menu"
                    {id: "an avatar entry", action: {type: "event", event: "EV_LOGOUT"}},
                    {id: "an avatar-typed entry", type: "avatar"}        // the site map: "user menu"
                ]}},
                {id: "a connection", type: "connection"}                                             // "backend connection"
            ]}
        };
        let r = run({...BOTH({}), "src/main.js": ``, "src/app_config.json": JSON.stringify(config)});
        expect(r.status).toBe(1);
        for(let k of ["a nameless action", "a nameless menu", "a nameless entry", "an entry with no action",
                      "a nested entry", "a brand menu", "a brand entry", "an avatar entry",
                      "an action aria key", "an action name key", "an entry name key", "a parent entry key"]) {
            expect(r.out).toContain(`defined in NO locale: ${JSON.stringify(k)}`);
        }
        for(let k of ["an aria action", "a named action", "a named entry", "a divider entry", "a parent entry",
                      "a brand", "Brand", "a brand entry with no action", "an avatar", "an avatar-typed entry",
                      "a connection"]) {
            expect(r.out).not.toContain(`defined in NO locale: ${JSON.stringify(k)}`);
        }
    });

    test("the menu a right-click opens (`context_action`) is read like the one a click opens", () => {
        let config = {
            toolbar: {items: [
                {id: "a nameless dot", type: "connection", context_action: {type: "dropdown", items: [
                    {id: "a nameless context entry", action: {type: "event", event: "EV_X"}},
                    {id: "an undrawn context entry"}                                     // no action
                ]}},
                {id: "a named action", aria_label: "a named action key", action: {type: "event", event: "EV_Y"},
                 context_action: {type: "dropdown", items: [
                     {id: "a named context entry", name: "a context entry key", action: {type: "event", event: "EV_Z"}}
                 ]}},
                {id: "an avatar", type: "avatar", context_action: {type: "dropdown", items: [  // not wired:
                    {id: "an avatar context entry", action: {type: "event", event: "EV_W"}}  // drawn by nothing
                ]}}
            ]}
        };
        let r = run({...BOTH({}), "src/main.js": ``, "src/app_config.json": JSON.stringify(config)});
        expect(r.status).toBe(1);
        for(let k of ["a nameless dot", "a nameless context entry", "a named action key", "a context entry key"]) {
            expect(r.out).toContain(`defined in NO locale: ${JSON.stringify(k)}`);
        }
        for(let k of ["an undrawn context entry", "a named action", "a named context entry", "an avatar",
                      "an avatar context entry"]) {
            expect(r.out).not.toContain(`defined in NO locale: ${JSON.stringify(k)}`);
        }
    });

    test("a C_YUI_NODE node with no `label` is named by its key: its `id` is asked for", () => {
        let node = (kw) => ({stage: "main", gclass: "C_YUI_NODE", kw: kw});
        let config = {
            menu: {primary: {items: [
                {id: "tree", name: "tree", route: "/tree", target: node({
                    node_id: "a nameless root", base_route: "/tree",       // drawn: the label of its navs
                    children: [
                        {id: "a labelled node", label: "a node label key", children: [
                            {id: "a nameless leaf", content: {gclass: "C_DEMO"}},   // label || id
                            {id: "a/refused id"},                                   // normalize_spec refuses it
                            {id: "an empty label", label: ""}
                        ]},
                        {id: "a nameless branch", children: [
                            {id: "a deep labelled leaf", label: "a deep label key", content: {gclass: "C_DEMO"}}
                        ]}
                    ]
                })},
                {id: "labelled", name: "labelled", route: "/l", target: node({
                    node_id: "a labelled root", label: "a root label key", base_route: "/l",
                    children: [{id: "a labelled child", label: "a child label key", content: {gclass: "C_DEMO"}}]
                })}
            ]}},
            shell: {routes: {
                "/e": {target: node({node_id: "an empty root", base_route: "/e"})},           // draws no label
                "/p": {target: node({node_id: "a path root", base_route: "/p", nav_mode: "path"})}
            }}
        };
        let r = run({...BOTH({}), "src/main.js": ``, "src/app_config.json": JSON.stringify(config)});
        expect(r.status).toBe(1);
        for(let k of ["a nameless root", "a nameless leaf", "an empty label", "a nameless branch", "a path root",
                      "a node label key", "a deep label key", "a root label key", "a child label key"]) {
            expect(r.out).toContain(`defined in NO locale: ${JSON.stringify(k)}`);
        }
        for(let k of ["a labelled node", "a/refused id", "a deep labelled leaf", "a labelled root", "a labelled child",
                      "an empty root"]) {
            expect(r.out).not.toContain(`defined in NO locale: ${JSON.stringify(k)}`);
        }
    });
});
