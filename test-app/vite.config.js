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

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
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
        ],
    },
    server: {
        watch: {
            usePolling: true,
            interval: 300
        }
    }
});
