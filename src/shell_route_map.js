/***********************************************************************
 *          shell_route_map.js
 *
 *      "Site map" viewer for a C_YUI_SHELL app: renders the current
 *      registered route tree (declared nav + dynamic submenus) as a
 *      printable, clickable tree — the filesystem-like map of the SPA
 *      (see ROUTING.md). Every leaf is a real hash link, so the map
 *      doubles as a jump table. A Print button prints just the tree.
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
import {yui_shell_route_map} from "./c_yui_shell.js";

import i18next from "i18next";


/***************************************************************
 *  Build a nested tree from the flat route list. Each node:
 *  {seg, route, label, registered, target, children:{seg:node}}.
 *  Intermediate path segments with no registered route of their
 *  own become structural nodes (no link).
 ***************************************************************/
function build_route_tree(routes)
{
    let root = {seg: "", route: "/", label: "/", registered: false, children: {}};
    for(let r of routes) {
        if(r.route === "/") {
            root.registered = true;
            root.target = r.target;
            root.label = r.label;
            continue;
        }
        let parts = r.route.split("/").filter((s) => s.length > 0);
        let node = root;
        let acc = "";
        for(let p of parts) {
            acc += "/" + p;
            if(!node.children[p]) {
                node.children[p] = {
                    seg: p, route: acc, label: p, registered: false, children: {}
                };
            }
            node = node.children[p];
        }
        node.registered = true;
        node.target = r.target;
        node.label = r.label;
    }
    return root;
}

/***************************************************************
 *  Render one tree node as an <li> (with a nested <ul> for children).
 *  A registered route is a real hash link; a structural node is plain.
 ***************************************************************/
function render_node(node)
{
    let children = Object.keys(node.children)
        .sort()
        .map((k) => render_node(node.children[k]));

    let $label;
    let seg_text = node.seg || "/";
    if(node.registered) {
        $label = createElement2(
            ["a", {class: "ROUTEMAP_LINK", href: "#" + node.route,
                   title: node.route}, [
                ["span", {class: "ROUTEMAP_SEG"}, seg_text],
                ["span", {class: "ROUTEMAP_NAME", i18n: node.label}, node.label]
            ]]
        );
    } else {
        $label = createElement2(
            ["span", {class: "ROUTEMAP_STRUCT"}, seg_text]
        );
    }

    let kids = children.length
        ? [createElement2(["ul", {class: "ROUTEMAP_UL"}, children])]
        : [];
    return createElement2(["li", {class: "ROUTEMAP_LI"}, [$label].concat(kids)]);
}


/***************************************************************
 *  Show the site-map modal.
 ***************************************************************/
export function yui_shell_show_route_map(shell, opts)
{
    let t = (opts && opts.t) || i18next.t.bind(i18next);
    let routes = yui_shell_route_map(shell);
    let tree = build_route_tree(routes);

    let $tree = createElement2(
        ["div", {class: "ROUTEMAP_TREE"}, [
            createElement2(["ul", {class: "ROUTEMAP_UL ROUTEMAP_ROOT"},
                [render_node(tree)]])
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

    /*  Print just the tree: a body class scopes the @media print rules
     *  in shell_route_map.css to hide everything else. */
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
    /*  A link click jumps to that route. Close the modal FIRST (so its
     *  overlay history entry is retired cleanly while it is still the top
     *  entry), then navigate on the next tick — pushing the route on top of
     *  a settled history, not tangled with the overlay's synthetic entry. */
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
