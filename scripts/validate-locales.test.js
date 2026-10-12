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
import {mkdtempSync, mkdirSync, writeFileSync} from "node:fs";
import {join, dirname} from "node:path";
import {tmpdir} from "node:os";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "validate-locales.mjs");

function locale(code, dict)
{
    let body = Object.entries(dict).map(([k, v]) => `        ${JSON.stringify(k)}: ${JSON.stringify(v)},`);
    return `const ${code} = {\n    translation: {\n${body.join("\n")}\n    }\n};\nexport {${code}};\n`;
}

/*  An app: {path: content}, run from its directory (`sub` of the temp dir)  */
function run(files, args = [], sub = "")
{
    let dir = mkdtempSync(join(tmpdir(), "vl-"));
    for(let [path, content] of Object.entries(files)) {
        mkdirSync(dirname(join(dir, path)), {recursive: true});
        writeFileSync(join(dir, path), content);
    }
    let r = spawnSync(process.execPath, [SCRIPT, ...args], {cwd: join(dir, sub), encoding: "utf8"});
    return {status: r.status, out: r.stdout + r.stderr};
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
            `/* t("in a comment") */`
        ].join("\n")});
        expect(r.status).toBe(1);
        for(let k of ["label", "tr key", "i18n key", "placeholder key", "finding key", "code key",
                      "app title key", "feat a", "feat b"]) {
            expect(r.out).toContain(`defined in NO locale: ${JSON.stringify(k)}`);
        }
        for(let k of ["kind_", "${k}", "in a comment"]) {
            expect(r.out).not.toContain(`defined in NO locale: ${JSON.stringify(k)}`);
        }
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
