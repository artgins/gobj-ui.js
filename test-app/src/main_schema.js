/***********************************************************************
 *          main_schema.js
 *
 *      Third entry point of the demo: THE SCHEMA IS A DRAWING.
 *
 *      Mounts C_YUI_TREEDB_SCHEMA on its own, with no shell and no
 *      backend, against the REAL schema of the yuneta agent
 *      (`schema_yuneta_agent.json`, extracted from
 *      yunos/c/yuno_agent/src/treedb_schema_yuneta_agent.c with the
 *      fkey mappings the backend derives at treedb_open).
 *
 *      That file carries the reference drawing: an ASCII box per topic,
 *      its fields inside, an arrow per hook. This page exists so the
 *      rendered graph can be held against it — same topics, same
 *      fields, same arrows, same marks — offline and in one click.
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
    gobj_read_attr,
    gobj_send_event,
    register_c_yuno,
    register_c_timer,
} from "@yuneta/gobj-js";

import {register_c_yui_treedb_schema} from "@yuneta/gobj-ui/src/c_yui_treedb_schema.js";

import {setup_locale} from "./locales.js";

import "bulma/css/bulma.css";
import "@yuneta/gobj-ui/src/c_yui_shell.css";
import "@yuneta/gobj-ui/src/yui_icons.css";
import "./demo.css";

import descs from "./schema_yuneta_agent.json";


/***************************************************************
 *          Data
 ***************************************************************/
let schema_gobj = null;


/***************************************************************
 *          The theme switch, so the cards can be checked in
 *          both — they are HTML, so their colours live in
 *          their markup and only ac_theme repaints them.
 ***************************************************************/
function toggle_theme()
{
    let root = document.documentElement;
    let dark = (root.getAttribute("data-theme") === "dark");
    root.setAttribute("data-theme", dark? "light" : "dark");
    if(schema_gobj) {
        gobj_send_event(
            schema_gobj, "EV_THEME", {theme: dark? "light" : "dark"}, schema_gobj
        );
    }
}


/***************************************************************
 *          main()
 ***************************************************************/
function main()
{
    register_c_yuno();
    register_c_timer();
    register_c_yui_treedb_schema();

    setup_locale();

    gobj_start_up(null, null, null);

    let yuno = gobj_create_yuno("schema_demo", "C_YUNO", {});

    document.documentElement.setAttribute("data-theme", "light");

    let $bar = document.createElement("div");
    $bar.className = "SCHEMA_DEMO_BAR";
    $bar.style.cssText =
        "display:flex; align-items:center; gap:12px; padding:8px 12px;";
    let $title = document.createElement("strong");
    $title.textContent = "treedb_yuneta_agent";
    let $theme = document.createElement("button");
    $theme.className = "button SCHEMA_DEMO_THEME";
    $theme.textContent = "theme";
    $theme.addEventListener("click", toggle_theme);
    $bar.appendChild($title);
    $bar.appendChild($theme);
    document.body.appendChild($bar);

    let $pane = document.createElement("div");
    $pane.className = "SCHEMA_DEMO_PANE";
    $pane.style.cssText = "position:absolute; inset:44px 0 0 0;";
    document.body.appendChild($pane);

    schema_gobj = gobj_create_default_service(
        "schema",
        "C_YUI_TREEDB_SCHEMA",
        {
            subscriber: yuno,
            descs:      descs,
            node_route: "",
        },
        yuno
    );

    /*  A default service is started by the yuno's own play — starting
     *  it here too is what the "GObj ALREADY RUNNING" error names.  */
    gobj_start(yuno);
    gobj_play(yuno);

    let $sc = gobj_read_attr(schema_gobj, "$container");
    if($sc) {
        $pane.appendChild($sc);
        gobj_send_event(schema_gobj, "EV_SHOW", {}, schema_gobj);
    }
}

main();
