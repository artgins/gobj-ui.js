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
    gobj_start,
    gobj_play,
    register_c_yuno,
    register_c_timer,
} from "@yuneta/gobj-js";

import {register_c_yui_shell} from "@yuneta/gobj-ui/src/c_yui_shell.js";
import {register_c_yui_nav}   from "@yuneta/gobj-ui/src/c_yui_nav.js";
import {register_c_yui_form}  from "@yuneta/gobj-ui/src/c_yui_form.js";

import {register_c_demo}       from "./c_demo.js";
import {register_c_test_view}  from "./c_test_view.js";
import {register_c_demo_form}  from "./c_demo_form.js";
import {register_c_demo_table} from "./c_demo_table.js";

import {setup_locale} from "./locales.js";

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
    /*  Register gclasses  */
    register_c_yuno();
    register_c_timer();

    register_c_yui_shell();
    register_c_yui_nav();
    register_c_yui_form();

    register_c_demo();
    register_c_test_view();
    register_c_demo_form();
    register_c_demo_table();

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

    gobj_start(yuno);
    gobj_play(yuno);
}


/***************************************************************
 *          Bootstrap on window load
 ***************************************************************/
window.addEventListener("load", function() {
    main();
});
