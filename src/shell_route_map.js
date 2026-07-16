/***********************************************************************
 *          shell_route_map.js
 *
 *      "Site map" viewer for a C_YUI_SHELL app: renders the WHOLE
 *      navigation surface — the toolbar (including the account menu),
 *      the primary menu, its live dynamic tabs, and each view's
 *      declared sub-routes (topics / info / schema / focus topics) —
 *      as a printable, clickable tree, in DECLARATION order (see
 *      ROUTING.md). Meant to double as the app's basic documentation.
 *      Hosted in a resizable C_YUI_WINDOW (a modal is the fallback when
 *      C_YUI_WINDOW is not registered).
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

import {
    createElement2,
    refresh_language,
    gobj_create_service,
    gobj_find_service,
    gobj_start,
    gobj_send_event,
    is_gobj,
    gclass_find_by_name,
    log_error,
} from "@yuneta/gobj-js";

import {yui_shell_show_modal, yui_shell_popup_layer} from "./shell_modals.js";
import {yui_shell_nav_map} from "./c_yui_shell.js";

import i18next from "i18next";

const WIN_NAME = "shell-route-map-window";


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
        row.push(["span", {class: "ROUTEMAP_EVENT"}, node.event]);
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
 *  Build the site-map body (tree + hint + print), and wire the
 *  print button and the link-jump behaviour. `on_jump()` is called
 *  after a link is clicked (to close the host window/modal), then the
 *  hash navigation runs on the next tick.
 ***************************************************************/
function build_body(shell, t, on_jump)
{
    let map = yui_shell_nav_map(shell);
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

    /*  Print only the tree: clone it into an off-screen print area so
     *  the @media print rules can hide everything else, regardless of
     *  where the window/modal is mounted. */
    let $print = $body.querySelector(".ROUTEMAP_PRINT");
    if($print) {
        $print.addEventListener("click", function() {
            let $area = document.createElement("div");
            $area.className = "routemap-print-area";
            $area.appendChild($tree.cloneNode(true));
            document.body.appendChild($area);
            document.body.classList.add("routemap-printing");
            try {
                window.print();
            } finally {
                document.body.classList.remove("routemap-printing");
                if($area.parentNode) {
                    $area.parentNode.removeChild($area);
                }
            }
        });
    }

    /*  A route link jumps there: close the host first (retires its Back
     *  entry cleanly), then navigate on the next tick. Action nodes (no
     *  route) are documentation only and do not fire. */
    $body.addEventListener("click", function(ev) {
        let $link = ev.target && ev.target.closest &&
            ev.target.closest(".ROUTEMAP_LINK");
        if(!$link) {
            return;
        }
        ev.preventDefault();
        let href = $link.getAttribute("href");
        if(typeof on_jump === "function") {
            on_jump();
        }
        if(href && typeof window !== "undefined") {
            setTimeout(function() {
                window.location.hash = href;
            }, 0);
        }
    });

    refresh_language($body, t);
    return $body;
}


/***************************************************************
 *  Show the site map. Toggles: a second call closes the open one.
 ***************************************************************/
export function yui_shell_show_route_map(shell, opts)
{
    let t = (opts && opts.t) || i18next.t.bind(i18next);

    /*  Toggle: an open site-map window → close it. */
    let existing = gobj_find_service(WIN_NAME, false);
    if(existing && is_gobj(existing)) {
        gobj_send_event(existing, "EV_CLOSE_WINDOW", {}, shell);
        return null;
    }

    /*  Preferred: a resizable, maximisable floating window. */
    if(gclass_find_by_name("C_YUI_WINDOW") !== null) {
        let win_ref = {gobj: null};
        let $body = build_body(shell, t, function() {
            if(win_ref.gobj && is_gobj(win_ref.gobj)) {
                gobj_send_event(win_ref.gobj, "EV_CLOSE_WINDOW", {}, shell);
            }
        });
        let $parent = yui_shell_popup_layer(shell) ||
            (typeof document !== "undefined" &&
                document.getElementById("top-layer")) || null;
        let win = gobj_create_service(WIN_NAME, "C_YUI_WINDOW", {
            $parent:    $parent,
            subscriber: null,
            modal:      false,
            showMax:    true,
            showFooter: false,
            resizable:  true,
            center:     true,
            auto_save_size_and_position: true,
            width:      780,
            height:     640,
            logical_class: "ROUTEMAP_WINDOW",
            title:      t("site map", {defaultValue: "Site map"}),
            icon:       "yi-bars",
            body:       $body,
            manager:    null
        }, shell);
        if(!win) {
            log_error("C_YUI_SHELL: cannot create the site-map window");
            return null;
        }
        win_ref.gobj = win;
        gobj_start(win);
        return win;
    }

    /*  Fallback: a modal (no C_YUI_WINDOW registered). */
    let modal_ref = {modal: null};
    let $body = build_body(shell, t, function() {
        if(modal_ref.modal && typeof modal_ref.modal.close === "function") {
            modal_ref.modal.close();
        }
    });
    modal_ref.modal = yui_shell_show_modal(shell, $body, {
        dialog:        true,
        logical_class: "ROUTEMAP_SHEET",
        title:         t("site map", {defaultValue: "Site map"}),
        t:             t
    });
    return modal_ref.modal;
}
