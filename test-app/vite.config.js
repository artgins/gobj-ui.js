/***********************************************************************
 *          vite.config.js
 *
 *          Build config for the gobj-ui declarative-shell demo.
 *
 *          Resolution mirrors the in-repo consumers (gui_agent /
 *          gui_treedb / wattyzer):
 *            - @yuneta/gobj-js -> the sibling submodule SOURCE
 *              (src/index.js), not its built dist/, so the demo always
 *              tracks the current kernel source.
 *            - @yuneta/gobj-ui -> this repo's ROOT (the parent dir), so
 *              package sub-paths (/src/*.js, /src/*.css) resolve to the
 *              source you are editing, not a published tarball.
 *          Both are also `file:` deps in package.json so npm installs
 *          the peer libs (bulma).
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import { defineConfig } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { readFileSync } from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/*  Versions shown in the "About" dialog, read from package.json at build. */
const read_version = (rel) => {
    try {
        return JSON.parse(readFileSync(path.resolve(__dirname, rel), "utf8")).version;
    } catch(e) {
        return "?";
    }
};

/*
 *  Resolve the INSTALLED version of a dependency (not the semver range), so
 *  the About dialog reports what actually shipped. gobj-ui bundles its own
 *  copy of the shared libs, so a package may live in either node_modules —
 *  prefer the test-app's, fall back to gobj-ui's.
 */
const dep_version = (name) => {
    for(const base of ["node_modules", "../node_modules"]) {
        const v = read_version(`${base}/${name}/package.json`);
        if(v !== "?") {
            return v;
        }
    }
    return "?";
};

/*
 *  Full package list for the About dialog: the app, the gobj framework, then
 *  every third-party runtime library the demo (and the gobj-ui components it
 *  mounts) pull in, plus the build tool. Read at build time so it stays in
 *  lockstep with what is installed.
 */
const pkg_versions = [
    {name: "App (test-app)",     version: read_version("package.json")},
    {name: "@yuneta/gobj-js",    version: read_version("../../gobj-js/package.json")},
    {name: "@yuneta/gobj-ui",    version: read_version("../package.json")},
    {name: "@antv/g6",           version: dep_version("@antv/g6")},
    {name: "bulma",              version: dep_version("bulma")},
    {name: "i18next",            version: dep_version("i18next")},
    {name: "luxon",              version: dep_version("luxon")},
    {name: "maplibre-gl",        version: dep_version("maplibre-gl")},
    {name: "tabulator-tables",   version: dep_version("tabulator-tables")},
    {name: "tom-select",         version: dep_version("tom-select")},
    {name: "uplot",              version: dep_version("uplot")},
    {name: "vanilla-jsoneditor", version: dep_version("vanilla-jsoneditor")},
    {name: "vite (build)",       version: dep_version("vite")},
];

/*
 *  maplibre-gl 6 loads its Web Worker at run time with
 *  `new Worker(new URL(`./${workerFile}`, import.meta.url), {type:'module'})`,
 *  where `workerFile` is a VARIABLE (dev/prod ternary). Vite/rolldown (Vite 8)
 *  can only auto-emit a worker when that `new URL()` first argument is a static
 *  string literal, so with v6 the worker is NOT emitted into the production
 *  bundle — dev works only because node_modules is served as-is. Left alone,
 *  the built app requests the worker and it is missing.
 *
 *  So we emit the worker AND the shared chunk it imports at build time (read
 *  from node_modules, kept in lockstep with the installed version). Two twists:
 *
 *    - Rename .mjs -> .js. Static hosts (the target nginx) serve .mjs as
 *      application/octet-stream, and browsers refuse a module worker / module
 *      import without a JS MIME type (verified: Firefox blocks the .mjs worker).
 *      .js is served as text/javascript everywhere. The worker's own
 *      `import "./maplibre-gl-shared.mjs"` is rewritten to match.
 *    - Point maplibre at the .js worker via setWorkerUrl() in src/main.js
 *      (prod only), since maplibre's built-in resolver hardcodes the .mjs name.
 */
const maplibre_worker_assets = () => {
    const dist = path.resolve(__dirname, "../node_modules/maplibre-gl/dist");
    return {
        name: "maplibre-worker-assets",
        apply: "build",
        generateBundle() {
            const worker = readFileSync(path.join(dist, "maplibre-gl-worker.mjs"), "utf8")
                .replaceAll("maplibre-gl-shared.mjs", "maplibre-gl-shared.js")
                .replace(/\n?\/\/# sourceMappingURL=.*$/, "");
            const shared = readFileSync(path.join(dist, "maplibre-gl-shared.mjs"), "utf8")
                .replace(/\n?\/\/# sourceMappingURL=.*$/, "");
            this.emitFile({
                type: "asset",
                fileName: "assets/maplibre-gl-worker.js",
                source: worker,
            });
            this.emitFile({
                type: "asset",
                fileName: "assets/maplibre-gl-shared.js",
                source: shared,
            });
        },
    };
};

export default defineConfig({
    plugins: [maplibre_worker_assets()],
    define: {
        __PKG_VERSIONS__: JSON.stringify(pkg_versions),
    },
    resolve: {
        preserveSymlinks: true,
        /*
         *  preserveSymlinks:true makes Vite load DUPLICATE module instances
         *  for the symlinked `file:` dep (@yuneta/gobj-ui). gobj-ui ships its
         *  OWN node_modules copy of every shared third-party lib below, so a
         *  future demo view that imports one of them would otherwise bind a
         *  second, uninitialised copy (a module-level singleton like
         *  i18next's `t()` then renders blank). Dedupe the full set up front —
         *  mirror wattyzer/gui/vite.config.js — so adding such a view "just
         *  works". Harmless for libs not yet installed.
         */
        dedupe: [
            "i18next",
            "@antv/g6",
            "maplibre-gl",
            "tabulator-tables",
            "tom-select",
            "uplot",
            "vanilla-jsoneditor",
        ],
        alias: [
            {
                find: "@yuneta/gobj-js",
                replacement: path.resolve(__dirname, "../../gobj-js/src/index.js"),
            },
            {
                find: /^@yuneta\/gobj-ui($|\/)/,
                replacement: path.resolve(__dirname, "..") + "/",
            },
            /*
             *  maplibre-gl 6 is ESM-only. The old v5 CSP-build alias +
             *  setWorkerUrl() workaround is gone (the `-csp` bundles it aliased
             *  to no longer exist). v6 no longer inlines the worker as a blob
             *  string; it loads a separate real file at run time via
             *  `new URL(<variable>, import.meta.url)` — see the
             *  maplibre_worker_assets() plugin below for why that still needs
             *  help under Vite 8.
             */
        ],
    },
    server: {
        watch: {
            usePolling: true,
            interval: 300
        }
    }
});
