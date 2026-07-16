/***********************************************************************
 *          shell_route_map.js
 *
 *      "Site map" viewer for a C_YUI_SHELL app: renders the WHOLE
 *      navigation surface — the toolbar (including the account menu),
 *      the primary menu and its live dynamic tabs — as a printable,
 *      clickable tree, in DECLARATION order (see ROUTING.md). It is
 *      meant to double as the app's basic documentation: each entry
 *      shows its icon, name, the hash route it navigates to (a live
 *      link) or the action event it fires.
 *
 *      Usage (e.g. from an "Account → Site map" menu action):
 *          import {yui_shell_show_route_map} from
 *              "@yuneta/gobj-ui/src/shell_route_map.js";
 *          yui_shell_show_route_map(shell, {t});
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import "./shell_route_map.css";

import {createElement2, refresh_language} from "@yuneta/gobj-js";

import {yui_shell_show_modal} from "./shell_modals.js";
import {yui_shell_nav_map} from "./c_yui_shell.js";

import i18next from "i18next";


/***************************************************************
 *  Render one nav node as an <li> (with a nested <ul> for children),
 *  preserving the given order. A node with a `route` is a live hash
 *  link; a node with an `event` is an action (shown, not fired); a
 *  structural/group node is plain text.
 ***************************************************************/
function render_node(node)
{
    let row = [];
    if(node.icon && /^yi-[a-z0-9-]+$/.test(node.icon)) {
        row.push(["span", {class: "icon ROUTEMAP_ICON"},
            [["i", {class: node.icon}]]]);
    }
    row.push(["span", {class: "ROUTEMAP_NAME", i18n: node.label}, node.label]);
    if(node.route) {
        row.push(["code", {class: "ROUTEMAP_ROUTE"}, node.route]);
    } else if(node.event) {
        row.push(["span", {class: "ROUTEMAP_EVENT tag is-light is-small"},
            node.event]);
    }

    let $row;
    if(node.route) {
        $row = createElement2(
            ["a", {class: "ROUTEMAP_LINK ROUTEMAP_ROW", href: "#" + node.route,
                   title: node.route}, row]);
    } else {
        $row = createElement2(
            ["span", {class: "ROUTEMAP_ROW ROUTEMAP_STRUCT"}, row]);
    }

    let kids = (node.children && node.children.length)
        ? [createElement2(["ul", {class: "ROUTEMAP_UL"},
            node.children.map(render_node)])]
        : [];
    return createElement2(["li", {class: "ROUTEMAP_LI"}, [$row].concat(kids)]);
}


/***************************************************************
 *  Show the site-map modal.
 ***************************************************************/
export function yui_shell_show_route_map(shell, opts)
{
    let t = (opts && opts.t) || i18next.t.bind(i18next);
    let map = yui_shell_nav_map(shell);

    /*  A synthetic root: the app (brand), then the Toolbar branch
     *  (account menu included) and the primary-nav branches — all in
     *  declaration order. */
    let root = {
        label:    map.brand.label || "app",
        icon:     "",
        route:    map.brand.route || "",
        event:    "",
        children: [
            {label: "toolbar", icon: "", route: "", event: "",
             kind: "group", children: map.toolbar}
        ].concat(map.nav)
    };

    let $tree = createElement2(
        ["div", {class: "ROUTEMAP_TREE"}, [
            createElement2(["ul", {class: "ROUTEMAP_UL ROUTEMAP_ROOT"},
                [render_node(root)]])
        ]]
    );

    let $body = createElement2(
        ["div", {class: "C_YUI_SHELL_ROUTEMAP ROUTEMAP_BODY"}, [
            ["p", {class: "ROUTEMAP_HINT is-size-7 mb-2", i18n: "site map hint"},
                t("site map hint", {defaultValue:
                    "Every reachable position of the app is a URL. Click to jump."})],
            $tree,
            ["div", {class: "ROUTEMAP_ACTIONS"}, [
                ["button", {class: "button is-small ROUTEMAP_PRINT",
                            i18n: "print"}, t("print", {defaultValue: "Print"})]
            ]]
        ]]
    );

    let modal = yui_shell_show_modal(shell, $body, {
        dialog:        true,
        logical_class: "ROUTEMAP_SHEET",
        title:         t("site map", {defaultValue: "Site map"}),
        t:             t
    });

    /*  Print just the tree (a body class scopes the @media print rules). */
    let $print = $body.querySelector(".ROUTEMAP_PRINT");
    if($print) {
        $print.addEventListener("click", function() {
            document.body.classList.add("routemap-printing");
            try {
                window.print();
            } finally {
                document.body.classList.remove("routemap-printing");
            }
        });
    }

    /*  A route link jumps there. Close the modal FIRST (retires its
     *  overlay history entry while it is the top entry), then navigate on
     *  the next tick — so the route is pushed onto settled history, not
     *  tangled with the overlay's synthetic entry. Action nodes (no route)
     *  are documentation only and do not fire. */
    $body.addEventListener("click", function(ev) {
        let $link = ev.target && ev.target.closest &&
            ev.target.closest(".ROUTEMAP_LINK");
        if(!$link) {
            return;
        }
        ev.preventDefault();
        let href = $link.getAttribute("href");
        if(modal && typeof modal.close === "function") {
            modal.close();
        }
        if(href && typeof window !== "undefined") {
            setTimeout(function() {
                window.location.hash = href;
            }, 0);
        }
    });

    refresh_language($body, t);
    return modal;
}
