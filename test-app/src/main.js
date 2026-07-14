/***********************************************************************
 *          main.js
 *
 *      gobj-ui declarative-shell demo — entry point.
 *
 *      Wires the gobj-js kernel + the v2 shell/nav stack, registers the
 *      single demo view, and starts a yuno whose default service (C_DEMO)
 *      hosts the shell. All navigation structure lives in app_config.json.
 *
 *      Import policy: pull the specific gobj-ui modules (shell + nav),
 *      NOT the @yuneta/gobj-ui/index.js barrel — the barrel transitively
 *      loads chart/map components whose module-top-level code touches
 *      Intl/navigator and is irrelevant here. Same pattern as the yunos.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {
    gobj_start_up,
    gobj_create_yuno,
    gobj_create_default_service,
    gobj_create_service,
    gobj_start,
    gobj_play,
    register_c_yuno,
    register_c_timer,
} from "@yuneta/gobj-js";

import {register_c_yui_shell}        from "@yuneta/gobj-ui/src/c_yui_shell.js";
import {register_c_yui_nav}          from "@yuneta/gobj-ui/src/c_yui_nav.js";
import {register_c_yui_form}         from "@yuneta/gobj-ui/src/c_yui_form.js";
import {register_c_yui_uplot}        from "@yuneta/gobj-ui/src/c_yui_uplot.js";
import {register_c_yui_gobj_tree_js} from "@yuneta/gobj-ui/src/c_yui_gobj_tree_js.js";
import {register_c_yui_json_graph}   from "@yuneta/gobj-ui/src/c_yui_json_graph.js";
import {register_c_yui_wizard}       from "@yuneta/gobj-ui/src/c_yui_wizard.js";
import {register_c_yui_pager}        from "@yuneta/gobj-ui/src/c_yui_pager.js";
import {register_c_yui_period}       from "@yuneta/gobj-ui/src/c_yui_period.js";
import {register_c_yui_map}          from "@yuneta/gobj-ui/src/c_yui_map.js";
import {register_c_yui_window}       from "@yuneta/gobj-ui/src/c_yui_window.js";
import {register_c_yui_window_manager}
                                     from "@yuneta/gobj-ui/src/c_yui_window_manager.js";
import {register_c_yui_treedb_topic_with_form}
    from "@yuneta/gobj-ui/src/c_yui_treedb_topic_with_form.js";

import {register_c_demo}        from "./c_demo.js";
import {register_c_demo_main}   from "./c_demo_main.js";
import {register_c_test_view}   from "./c_test_view.js";
import {register_c_demo_form}   from "./c_demo_form.js";
import {register_c_demo_table}  from "./c_demo_table.js";
import {register_c_demo_treedb} from "./c_demo_treedb.js";
import {register_c_demo_chart}  from "./c_demo_chart.js";
import {register_c_demo_tree}   from "./c_demo_tree.js";
import {register_c_demo_json}   from "./c_demo_json.js";
import {register_c_demo_wizard} from "./c_demo_wizard.js";
import {register_c_demo_pager}  from "./c_demo_pager.js";
import {register_c_demo_period} from "./c_demo_period.js";
import {register_c_demo_map}    from "./c_demo_map.js";
import {register_c_demo_modals} from "./c_demo_modals.js";
import {register_c_demo_windows} from "./c_demo_windows.js";

import {setup_locale} from "./locales.js";

/*  maplibre-gl: the vite.config alias routes "maplibre-gl" to the CSP build,
 *  whose worker is a separate real file (not an inline-blob string the bundler
 *  would re-serialise and break in Firefox). Point the singleton at the
 *  emitted worker asset once, before any C_YUI_MAP is created. */
import maplibregl from "maplibre-gl";
import maplibre_worker_url from "maplibre-gl/dist/maplibre-gl-csp-worker.js?url";

import "bulma/css/bulma.css";
import "@yuneta/gobj-ui/src/c_yui_shell.css";
import "@yuneta/gobj-ui/src/yui_icons.css";
import "./demo.css";

import app_config from "./app_config.json";


/***************************************************************
 *          main()
 ***************************************************************/
function main()
{
    /*  CSP build needs its worker URL before the first map is created */
    maplibregl.setWorkerUrl(maplibre_worker_url);

    /*  Register gclasses  */
    register_c_yuno();
    register_c_timer();

    register_c_yui_shell();
    register_c_yui_nav();
    register_c_yui_form();
    register_c_yui_treedb_topic_with_form();
    register_c_yui_uplot();
    register_c_yui_gobj_tree_js();
    register_c_yui_json_graph();
    register_c_yui_wizard();
    register_c_yui_pager();
    register_c_yui_period();
    register_c_yui_map();
    register_c_yui_window();     // host for the developer window (account menu)
    register_c_yui_window_manager(); // dock/taskbar for windows (Windows chapter)

    register_c_demo();
    register_c_demo_main();
    register_c_test_view();
    register_c_demo_form();
    register_c_demo_table();
    register_c_demo_treedb();
    register_c_demo_chart();
    register_c_demo_tree();
    register_c_demo_json();
    register_c_demo_wizard();
    register_c_demo_pager();
    register_c_demo_period();
    register_c_demo_map();
    register_c_demo_modals();
    register_c_demo_windows();

    /*  i18n (en/es). C_YUI_FORM, the shell and the views translate their
     *  DOM through i18next's module-level t(); this inits the shared
     *  instance (single copy via vite.config.js dedupe). English is the
     *  source (keys = English strings), so t() returns labels verbatim in
     *  en and the es bundle translates them. */
    setup_locale("en");

    /*  Start yuneta (no persistence backend: this demo keeps no state) */
    gobj_start_up(
        null,   // jn_global_settings
        null,   // load_persistent_attrs
        null,   // save_persistent_attrs
        null,   // remove_persistent_attrs
        null,   // list_persistent_attrs
        null,   // global_command_parser_fn
        null    // global_stats_parser_fn
    );

    let yuno = gobj_create_yuno(
        "demo_yuno",
        "C_YUNO",
        {
            yuno_name:    "gobj-ui nav layouts demo",
            yuno_role:    "gobj_ui_demo",
            yuno_version: "1.0.0"
        }
    );

    gobj_create_default_service(
        "demo",
        "C_DEMO",
        {
            config:   app_config,
            use_hash: true
        },
        yuno
    );

    /*  Minimal "__yui_main__" service: legacy components (C_YUI_MAP) look
     *  it up to subscribe to EV_RESIZE. A registered service satisfies the
     *  lookup (no "service not found" log) and gives the map real reflow. */
    gobj_create_service("__yui_main__", "C_DEMO_MAIN", {}, yuno);

    /*  Window manager (dock/taskbar). A named service so C_YUI_WINDOW
     *  hosts (the Windows chapter, the Developer window) opt in via
     *  gobj_find_service("__window_manager__"). The dock mounts INLINE
     *  into the Windows chapter's DEMO_WINDOWS_DOCK strip; while that
     *  strip is not in the DOM it falls back to a floating bar
     *  (bottom-left) by the manager's own contract. */
    gobj_create_service(
        "__window_manager__",
        "C_YUI_WINDOW_MANAGER",
        {
            dock_mode:       "inline",
            inline_selector: ".DEMO_WINDOWS_DOCK"
        },
        yuno
    );

    gobj_start(yuno);
    gobj_play(yuno);
}


/***************************************************************
 *          Bootstrap on window load
 ***************************************************************/
window.addEventListener("load", function() {
    main();
});
