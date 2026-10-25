/***********************************************************************
 *          vite-plugin-yuneta-licenses.test.js
 *
 *      The licenses.txt of an app: which packages it lists (those whose
 *      code is in the bundle) and what it takes from each, on fixture
 *      packages written to a temp dir.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {describe, test, expect} from "vitest";
import {mkdtempSync, mkdirSync, writeFileSync} from "node:fs";
import {join, dirname, sep} from "node:path";
import {tmpdir} from "node:os";
import {
    package_root_of,
    declared_license,
    source_url,
    bundled_module_ids,
    build_licenses_text,
    yunetaLicensesPlugin
} from "./vite-plugin-yuneta-licenses.js";

function write_files(dir, files)
{
    for(const [name, content] of Object.entries(files)) {
        let file = join(dir, name);
        mkdirSync(dirname(file), {recursive: true});
        writeFileSync(file, content);
    }
}

/*  An app with its node_modules: {path: content}  */
function app(files)
{
    let dir = mkdtempSync(join(tmpdir(), "lic-"));
    write_files(dir, files);
    return dir;
}

const NM = `${sep}node_modules${sep}`;

describe("package_root_of", () => {
    test("a module of a package is mapped to the package's root", () => {
        expect(package_root_of(`/app${NM}tabulator-tables/dist/js/x.js`)).toBe(`/app${NM}tabulator-tables`);
    });
    test("a scoped package takes two segments", () => {
        expect(package_root_of(`/app${NM}@antv/g6/lib/index.js`)).toBe(`/app${NM}@antv/g6`);
    });
    test("a package nested in another one is the innermost", () => {
        expect(package_root_of(`/app${NM}a/node_modules/b/i.js`.replaceAll("/", sep)))
            .toBe(`/app${NM}a${NM}b`.replaceAll("/", sep));
    });
    test("a query and a virtual marker are dropped", () => {
        expect(package_root_of(`\0/app${NM}bulma/css/bulma.css?inline`)).toBe(`/app${NM}bulma`);
    });
    test("the app's own code is no package", () => {
        expect(package_root_of("/app/src/main.js")).toBe(null);
        expect(package_root_of(`/app${NM}`)).toBe(null);
    });
});

describe("declared_license", () => {
    test("the forms of package.json", () => {
        expect(declared_license({license: "MIT"})).toBe("MIT");
        expect(declared_license({license: "(MIT OR Apache-2.0)"})).toBe("(MIT OR Apache-2.0)");
        expect(declared_license({license: {type: "BSD-3-Clause"}})).toBe("BSD-3-Clause");
        expect(declared_license({licenses: [{type: "MIT"}, {type: "GPL-2.0"}]})).toBe("MIT OR GPL-2.0");
        expect(declared_license({})).toBe("(none declared)");
    });
});

describe("source_url", () => {
    test("the forms of repository and homepage, as https", () => {
        expect(source_url({repository: "git+https://github.com/antvis/G6.git"})).toBe("https://github.com/antvis/G6");
        expect(source_url({repository: {type: "git", url: "git://github.com/x/y.git"}})).toBe("https://github.com/x/y");
        expect(source_url({repository: "git@github.com:a/b.git"})).toBe("https://github.com/a/b");
        expect(source_url({repository: "github:foo/bar"})).toBe("https://github.com/foo/bar");
        expect(source_url({repository: "foo/bar"})).toBe("https://github.com/foo/bar");
        expect(source_url({homepage: "https://bulma.io"})).toBe("https://bulma.io");
        expect(source_url({})).toBe("");
    });
});

describe("code a package ships inside its own files", () => {
    test("is listed as that package, with no warning", () => {
        let dir = app({
            "node_modules/@antv/layout/package.json":
                JSON.stringify({name: "@antv/layout", version: "2.0.0", license: "MIT",
                                repository: "git+https://github.com/antvis/layout.git"}),
            "node_modules/@antv/layout/LICENSE": "layout's license",
            "node_modules/@antv/layout/lib/node_modules/d3-force/src/x.js": "",
            "node_modules/@antv/layout/lib/node_modules/@antv/expr/dist/e.js": "",
        });
        let warnings = [];
        let text = build_licenses_text(
            [join(dir, "node_modules/@antv/layout/lib/node_modules/d3-force/src/x.js"),
             join(dir, "node_modules/@antv/layout/lib/node_modules/@antv/expr/dist/e.js")],
            {}, [], w => warnings.push(w)
        );
        expect(warnings).toEqual([]);
        expect(text).toContain("@antv/layout 2.0.0");
        expect(text).toContain("Source: https://github.com/antvis/layout");
        expect(text).toContain("layout's license");
        expect(text.match(/^@antv\/layout 2\.0\.0$/gm).length).toBe(1);
    });
});

describe("bundled_module_ids", () => {
    test("a module tree-shaken to nothing is left out, a stylesheet is kept", () => {
        let bundle = {
            "index.js": {
                type: "chunk",
                moduleIds: ["/a/x.js", "/a/shaken.js", "/a/style.css"],
                modules: {
                    "/a/x.js": {renderedLength: 10},
                    "/a/shaken.js": {renderedLength: 0},
                    "/a/style.css": {renderedLength: 0}
                }
            },
            "index.css": {type: "asset", source: "body{}"}
        };
        expect([...bundled_module_ids(bundle)].sort()).toEqual(["/a/style.css", "/a/x.js"]);
    });
    test("a chunk with no module details keeps every id", () => {
        let bundle = {"a.js": {type: "chunk", moduleIds: ["/a/y.js"]}};
        expect([...bundled_module_ids(bundle)]).toEqual(["/a/y.js"]);
    });
});

describe("build_licenses_text", () => {
    test("every package once, sorted, with all its license files", () => {
        let dir = app({
            "node_modules/zeta/package.json": JSON.stringify({name: "zeta", version: "1.0.0", license: "MIT"}),
            "node_modules/zeta/LICENSE": "MIT text of zeta\n",
            "node_modules/zeta/a.js": "",
            "node_modules/zeta/b.js": "",
            "node_modules/@yuneta/gobj-ui/package.json":
                JSON.stringify({name: "@yuneta/gobj-ui", version: "7.28.0", license: "MIT"}),
            "node_modules/@yuneta/gobj-ui/LICENSE": "MIT text of gobj-ui",
            "node_modules/@yuneta/gobj-ui/THIRD-PARTY-NOTICES": "Font Awesome Free ... CC BY 4.0",
            "node_modules/@yuneta/gobj-ui/src/yui_icons.css": "",
            "node_modules/apache/package.json": JSON.stringify({name: "apache", version: "2.0.0", license: "Apache-2.0"}),
            "node_modules/apache/LICENSE.txt": "Apache text",
            "node_modules/apache/NOTICE": "Apache NOTICE text",
            "node_modules/apache/i.js": "",
        });
        let ids = [
            join(dir, "node_modules/zeta/a.js"),
            join(dir, "node_modules/zeta/b.js"),
            join(dir, "node_modules/@yuneta/gobj-ui/src/yui_icons.css"),
            join(dir, "node_modules/apache/i.js"),
            join(dir, "src/main.js"),
        ];
        let text = build_licenses_text(ids, {name: "my-app", version: "1.2.3"}, [], () => {});

        expect(text).toContain("my-app 1.2.3 includes the software below");
        let names = [...text.matchAll(/^(\S+) (\d+\.\d+\.\d+)$/gm)].map(m => m[1]);
        expect(names).toEqual(["@yuneta/gobj-ui", "apache", "zeta"]);
        expect(text.match(/MIT text of zeta/g).length).toBe(1);
        expect(text).toContain("Font Awesome Free ... CC BY 4.0");
        expect(text).toContain("License: Apache-2.0");
        expect(text.indexOf("Apache text")).toBeLessThan(text.indexOf("Apache NOTICE text"));
        expect(text).not.toContain("main.js");
    });

    test("a package with no license file is listed, and warned about", () => {
        let dir = app({
            "node_modules/bare/package.json": JSON.stringify({name: "bare", version: "0.1.0", license: "ISC"}),
            "node_modules/bare/i.js": "",
        });
        let warnings = [];
        let text = build_licenses_text([join(dir, "node_modules/bare/i.js")], {}, [], w => warnings.push(w));
        expect(text).toContain("bare 0.1.0");
        expect(text).toContain("License: ISC");
        expect(text).toContain("(The package carries no license file.)");
        expect(warnings.length).toBe(1);
        expect(warnings[0]).toContain("bare@0.1.0");
    });

    test("code of others that is no package goes in through `extra`", () => {
        let text = build_licenses_text([], {name: "x"}, [{name: "vendored.js", license: "MIT", text: "its text"}]);
        expect(text).toContain("vendored.js\nLicense: MIT");
        expect(text).toContain("its text");
    });
});

describe("yunetaLicensesPlugin", () => {
    test("it emits licenses.txt at build time only", () => {
        let dir = app({
            "package.json": JSON.stringify({name: "spa", version: "0.1.0"}),
            "node_modules/one/package.json": JSON.stringify({name: "one", version: "1.0.0", license: "MIT"}),
            "node_modules/one/LICENSE": "one's license",
            "node_modules/one/i.js": "",
        });
        let plugin = yunetaLicensesPlugin();
        expect(plugin.apply).toBe("build");

        let emitted = [];
        let cwd = process.cwd();
        process.chdir(dir);
        try {
            plugin.generateBundle.handler.call(
                {emitFile: (f) => emitted.push(f)},
                {},
                {"i.js": {type: "chunk", moduleIds: [join(dir, "node_modules/one/i.js")],
                          modules: {[join(dir, "node_modules/one/i.js")]: {renderedLength: 3}}}}
            );
        } finally {
            process.chdir(cwd);
        }
        expect(emitted.length).toBe(1);
        expect(emitted[0].fileName).toBe("licenses.txt");
        expect(emitted[0].source).toContain("spa 0.1.0 includes");
        expect(emitted[0].source).toContain("one's license");
    });
});
