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
            `add("error", "finding key", a);`,
            `x = {code: "code key"};`,
            `x = {app_title: "app title key", welcome_features: ["feat a", "feat b"]};`,
            `el.setAttribute('data-i18n-title', 'attribute key');`,
            `t("don't stop");`,                     // an apostrophe inside double quotes
            "t(`template key`);",                   // a template with no ${}
            "t(`built ${x}`);",                     // ...and one with: not
            `/* t("in a comment") */`
        ].join("\n")});
        expect(r.status).toBe(1);
        for(let k of ["label", "tr key", "i18n key", "placeholder key", "finding key", "code key",
                      "attribute key", "don't stop", "template key"]) {
            expect(r.out).toContain(`defined in NO locale: ${JSON.stringify(k)}`);
        }
        /*  The orchestrator's attributes are not known without the app's package.json  */
        for(let k of ["kind_", "${k}", "in a comment", "app title key", "feat a", "don"]) {
            expect(r.out).not.toContain(`defined in NO locale: ${JSON.stringify(k)}`);
        }
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

    test("a published list is read in every shape, never run", () => {
        let r = run({...BOTH({}), "src/main.js": [
            `export const A_I18N_KEYS = Object.freeze(["frozen key"]);`,
            `const B_I18N_KEYS = ["exported later"]; export {B_I18N_KEYS};`,
            `const local_list = ["renamed on export"]; export {local_list as C_I18N_KEYS};`,
            `export let D_I18N_KEYS = ["let key"];`,
            `export var E_I18N_KEYS = ["var key"];`,
            "export const F_I18N_KEYS = [`template key`];",
            `export const G_I18N_KEYS = ["a ] bracket", "after the bracket"];`,
            `export const lower_i18n_keys = ["lower-case name"];`,
            `throw new Error("never run");`
        ].join("\n")});
        expect(r.status).toBe(1);
        for(let k of ["frozen key", "exported later", "renamed on export", "let key", "var key",
                      "template key", "a ] bracket", "after the bracket", "lower-case name"]) {
            expect(r.out).toContain(`defined in NO locale: ${JSON.stringify(k)}`);
        }
        expect(r.out).not.toMatch(/never run/);
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
            `let mutable = "let key"; t(mutable);`             // a let: not
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
        expect(r.out).toMatch(/src\/main\.js:8: the i18n marker stands before no place a key is read/);
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
});
