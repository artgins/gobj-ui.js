/***********************************************************************
 *          vite-plugin-yuneta-licenses.js
 *
 *          Vite plugin for Yuneta GUI projects: at build time it writes
 *          `licenses.txt` beside the bundle, with the license of every
 *          package whose code is IN the bundle.
 *
 *          An app is closed or open, but the code of others inside its
 *          bundle is distributed to every browser that loads it, and its
 *          licenses (MIT, BSD, ISC, Apache-2.0, CC BY ...) ask for their
 *          notices to go with it. A minifier drops most of them (the
 *          attribution of the Font Awesome icons of yui_icons.css never
 *          reached a bundle; Vite 8 drops even the /*! comments), so the
 *          notices are gathered here instead,
 *          from the packages themselves.
 *
 *          Which packages: the modules of the emitted chunks that render
 *          some code (a module tree-shaken to nothing is not in the
 *          bundle, and neither is its license), plus the stylesheets
 *          they import. Each module is mapped to the package that holds
 *          it under node_modules/; the app's own sources are not listed.
 *
 *          What of each package: its name, version, declared license
 *          and source url, and the text of every LICENSE / LICENCE / COPYING /
 *          NOTICE / THIRD-PARTY-NOTICES file at its root -- which is how
 *          the notices that a package carries for code of others inside
 *          it (sprintf.js in gobj-js, Font Awesome in gobj-ui) come along.
 *          A package with no license file is listed with what its
 *          package.json declares, and warned about.
 *
 *          Usage in vite.config.js:
 *            import {yunetaLicensesPlugin} from "@yuneta/gobj-ui/vite-plugin-yuneta-licenses.js";
 *            plugins: [yunetaHtmlPlugin({...}), yunetaLicensesPlugin()]
 *
 *          Options:
 *            fileName: the name of the file in the bundle ("licenses.txt")
 *            extra:    [{name, license, text}] for code of others that is
 *                      not a package (vendored into the app's sources)
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import fs from "fs";
import path from "path";

const LICENSE_FILE_RE = /^(licen[cs]e|copying|notice|third[-_]party[-_]notices?)([._-].*)?$/i;
const STYLESHEET_RE = /\.(css|scss|sass|less|styl)$/i;
const RULE = "-".repeat(78);

/*
 *  The root of the package that holds `id`, or null when it is not under
 *  node_modules/ (the app's own code). The LAST node_modules/ of the path
 *  is the one that holds it, and a scoped package takes two segments.
 */
export function package_root_of(id)
{
    let file = String(id).replace(/^\0/, "").split("?")[0];
    let marker = `${path.sep}node_modules${path.sep}`;
    let at = file.lastIndexOf(marker);
    if(at < 0) {
        return null;
    }
    let rest = file.slice(at + marker.length).split(path.sep);
    let segments = rest[0].startsWith("@")? 2 : 1;
    if(rest.length <= segments) {
        return null;
    }
    return file.slice(0, at + marker.length) + rest.slice(0, segments).join(path.sep);
}

/*
 *  The license a package.json declares, as text: "MIT", the SPDX
 *  expression, or the old {type} / [{type}] forms joined with OR
 */
export function declared_license(pkg)
{
    let lic = pkg.license || pkg.licenses;
    if(!lic) {
        return "(none declared)";
    }
    if(typeof lic === "string") {
        return lic;
    }
    if(Array.isArray(lic)) {
        return lic.map(l => (typeof l === "string")? l : (l.type || "?")).join(" OR ");
    }
    return lic.type || "?";
}

/*
 *  Where the source of a package is: its repository, else its homepage,
 *  as an https url when it is one in disguise ("git+https://...git",
 *  "github:owner/repo"). Empty when the package says neither.
 */
export function source_url(pkg)
{
    let repo = pkg.repository;
    let url = (typeof repo === "string")? repo : (repo && repo.url) || pkg.homepage || "";
    url = String(url).trim()
        .replace(/^git\+/, "")
        .replace(/^git:\/\//, "https://")
        .replace(/^git@github\.com:/, "https://github.com/")
        .replace(/\.git$/, "");
    let short = url.match(/^(github|gitlab|bitbucket):(.+)$/);
    if(short) {
        url = `https://${short[1]}.${short[1] === "bitbucket"? "org" : "com"}/${short[2]}`;
    } else if(/^[\w.-]+\/[\w.-]+$/.test(url)) {
        url = `https://github.com/${url}`;
    }
    return url;
}

/*
 *  The ids of the modules that put something in the bundle
 */
export function bundled_module_ids(bundle)
{
    let ids = new Set();
    for(const out of Object.values(bundle)) {
        if(out.type !== "chunk") {
            continue;
        }
        let modules = out.modules || {};
        let module_ids = out.moduleIds || Object.keys(modules);
        for(const id of module_ids) {
            let clean = String(id).split("?")[0];
            let rendered = modules[id]? modules[id].renderedLength : 1;
            if(rendered > 0 || STYLESHEET_RE.test(clean)) {
                ids.add(id);
            }
        }
    }
    return ids;
}

/*
 *  The text of licenses.txt for the packages of `ids`. `warn` is told of
 *  a package with no license file.
 */
export function build_licenses_text(ids, app, extra = [], warn = console.warn)
{
    let roots = new Set();
    for(const id of ids) {
        let root = package_root_of(id);
        if(root) {
            roots.add(root);
        }
    }

    let packages = new Map();
    for(const start of roots) {
        /*
         *  A directory under node_modules/ with no package.json is code a
         *  package ships inside its own files (@antv/layout carries d3-force
         *  and others in lib/node_modules/): it is listed as that package.
         */
        let root = start;
        while(root && !fs.existsSync(path.join(root, "package.json"))) {
            let marker = `${path.sep}node_modules${path.sep}`;
            root = package_root_of(root.slice(0, root.lastIndexOf(marker)));
        }
        if(!root) {
            warn(`yuneta-licenses: no package.json for ${start}, not listed`);
            continue;
        }
        let pkg_path = path.join(root, "package.json");
        let pkg = JSON.parse(fs.readFileSync(pkg_path, "utf-8"));
        let key = `${pkg.name}@${pkg.version}`;
        if(packages.has(key)) {
            continue;
        }
        let files = fs.readdirSync(root)
            .filter(name => LICENSE_FILE_RE.test(name) && fs.statSync(path.join(root, name)).isFile())
            .sort((a, b) => {
                let rank = (n) => /^licen[cs]e|^copying/i.test(n)? 0 : 1;
                return (rank(a) - rank(b)) || a.localeCompare(b);
            });
        if(files.length === 0) {
            warn(`yuneta-licenses: ${key} carries no license file; listed with its declared license only`);
        }
        packages.set(key, {
            name: pkg.name,
            version: pkg.version,
            license: declared_license(pkg),
            source: source_url(pkg),
            texts: files.map(name => fs.readFileSync(path.join(root, name), "utf-8").trimEnd())
        });
    }

    let sorted = [...packages.values()].sort((a, b) => a.name.localeCompare(b.name));

    let out = [];
    out.push("Licenses of the software in this application");
    out.push("=".repeat(44));
    out.push("");
    out.push(`${app.name || "This application"}${app.version? " " + app.version : ""} includes the software ` +
             "below, each part under its own license.");
    out.push("This file is written at build time from the code that is in the bundle.");
    out.push("");

    for(const p of sorted) {
        out.push(RULE);
        out.push(`${p.name} ${p.version}`);
        out.push(`License: ${p.license}`);
        if(p.source) {
            out.push(`Source: ${p.source}`);
        }
        out.push(RULE);
        if(p.texts.length === 0) {
            out.push("(The package carries no license file.)");
        }
        for(const text of p.texts) {
            out.push(text);
            out.push("");
        }
        out.push("");
    }
    for(const e of extra) {
        out.push(RULE);
        out.push(e.name);
        out.push(`License: ${e.license || "?"}`);
        out.push(RULE);
        out.push(String(e.text || "").trimEnd());
        out.push("");
        out.push("");
    }
    return out.join("\n");
}

/**
 *  @param {object} [options]
 *  @param {string} [options.fileName]  - The file in the bundle (default licenses.txt)
 *  @param {Array}  [options.extra]     - [{name, license, text}] not from a package
 */
export function yunetaLicensesPlugin(options = {})
{
    const fileName = options.fileName || "licenses.txt";
    const extra = options.extra || [];

    return {
        name: "yuneta-licenses",
        apply: "build",
        generateBundle: {
            order: "post",
            handler(output_options, bundle) {
                let app = {};
                let pkg_path = path.resolve(process.cwd(), "package.json");
                if(fs.existsSync(pkg_path)) {
                    app = JSON.parse(fs.readFileSync(pkg_path, "utf-8"));
                }
                let ids = bundled_module_ids(bundle);
                if(ids.size === 0) {
                    console.error("❌ yuneta-licenses: no module in the bundle, no licenses file written");
                    return;
                }
                this.emitFile({
                    type: "asset",
                    fileName: fileName,
                    source: build_licenses_text(ids, app, extra)
                });
            }
        }
    };
}
