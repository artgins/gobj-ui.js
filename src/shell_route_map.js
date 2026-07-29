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
import {attach_clear} from "./yui_inputs.js";

import i18next from "i18next";

const WIN_NAME = "shell-route-map-window";

/*  Reference rows — a route's second and third entry point: a drawer
 *  entry, a toolbar SHORTCUT.  Shown by default: they are one line
 *  each, and they are exactly what someone auditing the navigation
 *  came to see ("which quick links does this app define?").  What was
 *  ever noisy is the repeated SUBTREE, and that is gone for good
 *  (dedupe_subtrees) rather than hidden behind a switch.  The toggle
 *  stays for reading the bare structure, and remembers the choice for
 *  this page. */
let __show_refs__ = true;

/*  Modal fallback currently open (the window flavour is a service and
 *  is found by name; the modal is not, so it is tracked here to make
 *  the second call a TOGGLE for both flavours). */
let __open_modal__ = null;

/*  Bring the "you are here" row into view once the map is mounted. */
function scroll_to_current($body)
{
    let $cur = $body.querySelector(".ROUTEMAP_CURRENT");
    if($cur && typeof $cur.scrollIntoView === "function") {
        $cur.scrollIntoView({block: "center"});
    }
}


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
    /*  Documentation columns: route + implementing gclass + action event. */
    if(node.route) {
        row.push(["code", {class: "ROUTEMAP_ROUTE"}, node.route]);
    }
    if(node.gclass) {
        row.push(["span", {class: "ROUTEMAP_GCLASS",
            title: "gclass", "data-i18n-title": "gclass"},
            node.gclass]);
    }
    if(node.event) {
        row.push(["span", {class: "ROUTEMAP_EVENT"}, node.event]);
    }
    /*  A reference: this route's structure is drawn under whichever
     *  surface owns it (the model's dedupe keeps one subtree per
     *  route).  Still a live link — it just does not repeat the
     *  branch. */
    if(node.ref) {
        row.push(["span", {class: "ROUTEMAP_REF", i18n: "shown above",
            title: "shown above", "data-i18n-title": "shown above"},
            "shown above"]);
    }

    /*  "You are here" — the node whose route best matches the current
     *  one (marked by the model; at most one). */
    if(node.current) {
        row.push(["span", {class: "ROUTEMAP_HERE", i18n: "you are here"},
            "you are here"]);
    }

    let row_class = (node.current ? " ROUTEMAP_CURRENT" : "") +
                    (node.ref ? " ROUTEMAP_IS_REF" : "");
    let $row;
    if(node.route) {
        $row = createElement2(
            ["a", {class: "ROUTEMAP_LINK ROUTEMAP_ROW" + row_class,
                   href: "#" + node.route,
                   title: node.route}, row]);
    } else {
        $row = createElement2(
            ["span", {class: "ROUTEMAP_ROW ROUTEMAP_STRUCT" + row_class}, row]);
    }

    let kids = (node.children && node.children.length)
        ? [createElement2(["ul", {class: "ROUTEMAP_UL"},
            node.children.map(render_node)])]
        : [];
    return createElement2(["li", {class: "ROUTEMAP_LI"}, [$row].concat(kids)]);
}

/***************************************************************
 *  Filter a rendered <li>: visible when its own row matches `q`, when
 *  an ancestor matched (show the whole subtree of a match), or when a
 *  descendant matches (keep the ancestor path). Empty `q` shows all.
 *  Matches against the visible row text (name + route + event), so it
 *  honours the current translation. Returns whether the <li> is shown.
 *
 *  `show_refs` off hides the reference rows — the second and third
 *  place a route is reachable from, which carry no structure. They are
 *  hidden by DEFAULT: in an app with a drawer and an account menu they
 *  are a third of the map, and what a reader comes here for is the
 *  structure. A ref stays hidden even inside a matched subtree — an
 *  ancestor match must not smuggle it back in — and a group left with
 *  nothing but refs collapses with them, since a group is only ever
 *  shown by what it contains.
 ***************************************************************/
function filter_li($li, q, ancestor_match, show_refs)
{
    let $row = $li.querySelector(":scope > .ROUTEMAP_ROW");
    let text = $row ? ($row.textContent || "").toLowerCase() : "";
    let hidden_ref = !show_refs &&
        !!($row && $row.classList.contains("ROUTEMAP_IS_REF"));
    let self_match = q === "" || text.indexOf(q) >= 0;
    let show_all = (ancestor_match || self_match) && !hidden_ref;

    let any_child = false;
    let $ul = $li.querySelector(":scope > ul");
    if($ul) {
        let kids = $ul.children;
        for(let i = 0; i < kids.length; i++) {
            if(filter_li(kids[i], q, show_all, show_refs)) {
                any_child = true;
            }
        }
    }

    let is_group = !!($row && $row.classList.contains("ROUTEMAP_STRUCT"));
    let had_children = !!($ul && $ul.children.length);

    /*  Hiding references removes NOISE, never a navigation surface.  A
     *  whole menu whose entries are all references — a drawer that
     *  reaches the same routes as the primary nav — would otherwise
     *  vanish heading and all, and the map would be quietly lying about
     *  what the app has.  So when hiding would empty a group, its
     *  entries are shown anyway: one line each, still without the
     *  repeated subtree, which is the part that was actually noisy. */
    if(is_group && had_children && !any_child && !show_refs) {
        let kids = $ul.children;
        for(let i = 0; i < kids.length; i++) {
            if(filter_li(kids[i], q, show_all, true)) {
                any_child = true;
            }
        }
    }

    /*  A group is only ever shown by what it contains.  While a search
     *  is running its own heading may still match — a query that finds
     *  a name must not come back empty. */
    let visible = (is_group && had_children)
        ? (any_child || (q !== "" && self_match))
        : ((show_all || any_child) && !hidden_ref);
    $li.style.display = visible ? "" : "none";
    if($row) {
        $row.classList.toggle("ROUTEMAP_MATCH", q !== "" && self_match && visible);
    }
    return visible;
}

/***************************************************************
 *  Build the site-map body (tree + hint + print), and wire the
 *  print button and the link-jump behaviour.  Links navigate
 *  natively; the shell's transient-overlay drain closes the host
 *  on a resting-route change.  `on_jump()` closes the host for the
 *  one click that navigates nowhere (the current route).
 ***************************************************************/
function build_body(shell, t)
{
    let map = yui_shell_nav_map(shell);

    /*  STRUCTURE FIRST.  The nav leads, then the toolbar, then the
     *  route-table leftovers.  The toolbar used to come first, which
     *  put a shortcut ("Go to Cards", an account-menu entry) above the
     *  section it points at: with one subtree per route the shortcut
     *  renders as a reference, so the first /cards a reader met had no
     *  tree under it and the real one was thirty rows down.  It also
     *  made the reference's own "shown above" a lie — the owner was
     *  BELOW it.  Leading with the structure fixes both. */
    let children = [].concat(map.nav);
    if(Array.isArray(map.toolbar) && map.toolbar.length) {
        children.push({label: "toolbar", icon: "", route: "", event: "",
            kind: "group", children: map.toolbar});
    }
    /*  Routes declared only in the route table (config.shell.routes)
     *  that no menu/toolbar item points at — root "/", URL-only action
     *  routes.  Rendered last, as their own group. */
    if(Array.isArray(map.other) && map.other.length) {
        children.push({label: "other routes", icon: "", route: "", event: "",
            kind: "group", children: map.other});
    }
    let root = {
        label:    map.brand.label || "app",
        icon:     "",
        route:    map.brand.route || "",
        event:    "",
        current:  !!map.brand.current,
        children: children
    };

    let $tree = createElement2(
        ["div", {class: "ROUTEMAP_TREE"}, [
            createElement2(["ul", {class: "ROUTEMAP_UL ROUTEMAP_ROOT"},
                [render_node(root)]])
        ]]
    );

    /*  Search filter: matching nodes plus their ancestor path (and the
     *  matched node's whole subtree) stay visible; the rest collapse. */
    let $search = createElement2(
        ["input", {class: "input is-small ROUTEMAP_SEARCH", type: "text",
                   placeholder: t("filter", {defaultValue: "Filter…"}),
                   "data-i18n-placeholder": "filter",
                   "aria-label": t("filter", {defaultValue: "Filter"}),
                   "data-i18n-aria-label": "filter"}]
    );
    let $search_ctrl = createElement2(
        ["div", {class: "control ROUTEMAP_SEARCH_CTRL"}, [$search]]
    );
    attach_clear($search_ctrl, $search);

    /*  Live match counter next to the filter. */
    let $count_n = createElement2(["span", {class: "ROUTEMAP_COUNT_N"}, ""]);
    let $count = createElement2(
        ["span", {class: "ROUTEMAP_COUNT is-size-7 has-text-grey is-hidden"},
            [$count_n, ["span", {i18n: "matches"}, "matches"]]]
    );
    /*  References are hidden by default and revealed by this toggle.
     *  Remembered for the page session (not localStorage): it is a
     *  reading preference of the panel, not a position (ROUTING.md §3),
     *  and it costs nothing to be back at the useful default tomorrow. */
    let $refs_input = createElement2(
        ["input", {class: "ROUTEMAP_REFS_INPUT", type: "checkbox"}]
    );
    if(__show_refs__) {
        $refs_input.checked = true;
    }
    let $refs_toggle = createElement2(
        ["label", {class: "checkbox is-size-7 ROUTEMAP_REFS_TOGGLE",
                   title: "show references", "data-i18n-title": "show references"},
            [$refs_input, ["span", {class: "ml-1", i18n: "show references"},
                "show references"]]]
    );

    let $search_row = createElement2(
        ["div", {class: "ROUTEMAP_SEARCH_ROW mb-2"},
            [$search_ctrl, $count, $refs_toggle]]
    );

    let apply_filter = function() {
        let q = ($search.value || "").trim().toLowerCase();
        let $root_li = $tree.querySelector(".ROUTEMAP_ROOT > li");
        if($root_li) {
            filter_li($root_li, q, false, __show_refs__);
        }
        if(q === "") {
            $count.classList.add("is-hidden");
        } else {
            $count_n.textContent = $tree.querySelectorAll(".ROUTEMAP_MATCH").length;
            $count.classList.remove("is-hidden");
        }
    };

    $search.addEventListener("input", apply_filter);
    $refs_input.addEventListener("change", function() {
        __show_refs__ = !!$refs_input.checked;
        apply_filter();
    });

    /*  Nothing to toggle in an app where every route is reachable from
     *  exactly one place. */
    if($tree.querySelectorAll(".ROUTEMAP_IS_REF").length === 0) {
        $refs_toggle.classList.add("is-hidden");
    }

    /*  Apply the default (references hidden) before the panel is shown,
     *  so it is never painted once with them and once without. */
    apply_filter();

    let $body = createElement2(
        ["div", {class: "C_YUI_SHELL_ROUTEMAP ROUTEMAP_BODY"}, [
            ["p", {class: "ROUTEMAP_HINT is-size-7 mb-2", i18n: "site map hint"},
                t("site map hint", {defaultValue:
                    "Every reachable position of the app is a URL. Click to jump."})],
            $search_row,
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

    /*  A route link jumps there NATIVELY (browser push + hashchange, no
     *  preventDefault) and the map STAYS OPEN — every row, not just the
     *  subpath ones.  It is a navigation panel: the user opens it to
     *  move around, and having half the rows close it under them made
     *  the same gesture mean two different things.  The window is
     *  either dock-managed or registered with `keep_on_navigate`, so
     *  the shell's transient-overlay drain leaves it alone.
     *  Action nodes (no route) are documentation only and do not fire. */

    /*  "You are here" has to follow the url now that the panel outlives
     *  the navigation, or it would keep pointing at where the user was
     *  when they opened it.  Self-detaching: the panel's DOM is owned by
     *  the window/modal that hosts it, and this helper has no hook into
     *  their teardown — once the body leaves the document the listener
     *  retires itself instead of leaking one per open. */
    let on_hash = function() {
        if(typeof document === "undefined" || !$body.isConnected) {
            if(typeof window !== "undefined") {
                window.removeEventListener("hashchange", on_hash);
            }
            return;
        }
        mark_current_row($body, window.location.hash, t);
    };
    if(typeof window !== "undefined") {
        window.addEventListener("hashchange", on_hash);
    }

    refresh_language($body, t);
    return $body;
}

/***************************************************************
 *  Move the "you are here" mark to the row that best matches
 *  `hash`: an exact route wins, else the LONGEST declared route
 *  that is a path-prefix of it (the base view of a deep subpath
 *  position).  Same rule as the model's mark_current(), applied
 *  to the rendered rows so the open panel stays truthful.
 ***************************************************************/
function mark_current_row($body, hash, t)
{
    let route = String(hash || "").replace(/^#/, "");
    let $best = null;
    let best_len = -1;

    for(let $a of $body.querySelectorAll(".ROUTEMAP_LINK")) {
        let r = String($a.getAttribute("href") || "").replace(/^#/, "");
        if(!r) {
            continue;
        }
        if(r === route) {
            $best = $a;
            break;
        }
        if(route.indexOf(r + "/") === 0 && r.length > best_len) {
            $best = $a;
            best_len = r.length;
        }
    }

    for(let $marked of $body.querySelectorAll(".ROUTEMAP_CURRENT")) {
        $marked.classList.remove("ROUTEMAP_CURRENT");
    }
    if(!$best) {
        return;
    }
    $best.classList.add("ROUTEMAP_CURRENT");

    /*  One badge, moved — never a second one left behind on the row the
     *  user came from. */
    let $badge = $body.querySelector(".ROUTEMAP_HERE");
    if(!$badge) {
        $badge = createElement2(
            ["span", {class: "ROUTEMAP_HERE", i18n: "you are here"},
                t ? t("you are here") : "you are here"]);
    }
    $best.appendChild($badge);
}


/***************************************************************
 *  Show the site map. Toggles: a second call closes the open one.
 ***************************************************************/
export function yui_shell_show_route_map(shell, opts)
{
    let t = (opts && opts.t) || i18next.t.bind(i18next);

    /*  Toggle: an open site-map window/modal → close it. */
    let existing = gobj_find_service(WIN_NAME, false);
    if(existing && is_gobj(existing)) {
        gobj_send_event(existing, "EV_CLOSE_WINDOW", {}, shell);
        return null;
    }
    if(__open_modal__) {
        let m = __open_modal__;
        __open_modal__ = null;
        if(typeof m.close === "function") {
            m.close();
        }
        return null;
    }

    /*  Preferred: a resizable, maximisable floating window. */
    if(gclass_find_by_name("C_YUI_WINDOW") !== null) {
        let win_ref = {gobj: null};
        let $body = build_body(shell, t);
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
            title:      "site map",
            icon:       "yi-bars",
            body:       $body,
            /*  A workspace surface, not a thing floating over one view:
             *  it joins the dock when the app has one (minimise, restore,
             *  focus like any other window).  Without a dock it stays a
             *  floating overlay, and `keep_on_navigate` gives it the same
             *  survives-navigation behaviour there. */
            manager:    gobj_find_service("__window_manager__", false),
            keep_on_navigate: true
        }, shell);
        if(!win) {
            log_error("C_YUI_SHELL: cannot create the site-map window");
            return null;
        }
        win_ref.gobj = win;
        gobj_start(win);
        scroll_to_current($body);
        return win;
    }

    /*  Fallback: a modal (no C_YUI_WINDOW registered). */
    let modal_ref = {modal: null};
    let $body = build_body(shell, t);
    modal_ref.modal = yui_shell_show_modal(shell, $body, {
        dialog:        true,
        logical_class: "ROUTEMAP_SHEET",
        /*  The KEY, not t(key): the modal renders `title` with
         *  data-i18n, so a pre-translated string would become the
         *  "key" and never re-translate. */
        title:         "site map",
        t:             t,
        on_close:      function() { __open_modal__ = null; }
    });
    __open_modal__ = modal_ref.modal;
    scroll_to_current($body);
    return modal_ref.modal;
}
