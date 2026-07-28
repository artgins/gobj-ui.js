/***********************************************************************
 *          main_tree.js
 *
 *      Second entry point of the demo: THE ROOT IS A NODE.
 *
 *      `app_config_tree.json` declares no `menu` at all.  The shell
 *      contributes the SPACE — zones, layers, stages, toolbar,
 *      overlays, theme, breakpoints — and `config.shell.tree` puts a
 *      C_YUI_NODE where the shell's own root used to be: its children
 *      are the primary options, projected into the left rail (desktop)
 *      and the bottom bar (mobile), and every level below is the same
 *      gclass doing the same thing.
 *
 *      One route entry ('/') owns the whole url space, so nothing below
 *      it is declared anywhere — including the two levels that belong
 *      to a timeranger viewer past the tree's edge.
 *
 *      Served side by side with index.html (the shell-menu demo) so the
 *      two models can be compared in the same browser.
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
import {register_c_yui_node}  from "@yuneta/gobj-ui/src/c_yui_node.js";

import {register_c_demo}              from "./c_demo.js";
import {register_c_test_view}         from "./c_test_view.js";
import {register_c_demo_tranger_link} from "./c_demo_tranger_link.js";

import {setup_locale} from "./locales.js";

import "bulma/css/bulma.css";
import "@yuneta/gobj-ui/src/c_yui_shell.css";
import "@yuneta/gobj-ui/src/yui_icons.css";
import "./demo.css";

import app_config from "./app_config_tree.json";


/***************************************************************
 *          main()
 ***************************************************************/
function main()
{
    register_c_yuno();
    register_c_timer();
    register_c_yui_shell();
    register_c_yui_nav();
    register_c_yui_node();

    register_c_demo();
    register_c_test_view();
    register_c_demo_tranger_link();

    setup_locale("en");

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
        "tree_yuno",
        "C_YUNO",
        {
            yuno_name:    "gobj-ui root-is-a-node demo",
            yuno_role:    "gobj_ui_tree_demo",
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
