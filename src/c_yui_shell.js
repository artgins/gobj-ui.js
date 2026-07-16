/***********************************************************************
 *          c_yui_shell.js
 *
 *      C_YUI_SHELL — Declarative app shell.
 *
 *      Parses a JSON config to build:
 *          - Layers (z-stacked): base, overlay, popup, modal, notification, loading
 *          - Zones (inside base layer): top, top-sub, left, center, right,
 *            bottom-sub, bottom
 *          - Menus (primary + submenus) rendered via C_YUI_NAV — one nav
 *            instance per zone hosting the menu
 *          - Stages: zones declared to host routed view gobjs (typ. center)
 *
 *      Each menu item's `target` declares which gclass to instantiate (or
 *      gobj to reuse) in which stage. Navigating = show the target gobj's
 *      $container in its stage, hide the previous one. Lifecycle per item
 *      decides when the gobj is created/destroyed.
 *
 *      A primary item with `submenu.index` gets a section-index landing:
 *      its own route mounts the submenu as a "cards" C_YUI_NAV in the
 *      stage instead of redirecting to the default child (see
 *      shell_section_index.js for the contract).
 *
 *      Hash-based 2-level routing (#/primary/secondary). No dependency on
 *      C_YUI_ROUTING.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
/* global window, document */

import {
    SDATA, SDATA_END, data_type_t, event_flag_t, gclass_flag_t,
    gclass_create, log_error, log_warning,
    gobj_create, gobj_destroy,
    gobj_start, gobj_stop,
    gobj_parent,
    gobj_gclass_name,
    gobj_publish_event,
    gobj_send_event,
    gobj_subscribe_event,
    gobj_read_attr, gobj_read_pointer_attr, gobj_write_attr,
    createElement2, empty_string, is_object, is_array, is_string,
    refresh_language,
    is_gobj,
} from "@yuneta/gobj-js";

import {
    BULMA_BP_ORDER,
    breakpoints_from_expr,
    bulma_hidden_class,
} from "./shell_show_on.js";

import {
    activate_focus_trap_on,
} from "./shell_focus_trap.js";

import {
    classify_toolbar_item,
    validate_toolbar_item,
} from "./shell_toolbar_helpers.js";

import { resolve_route } from "./route_resolver.js";
import {
    section_index_target,
    secondary_nav_renders,
} from "./shell_section_index.js";

/***************************************************************
 *              Constants
 ***************************************************************/
const GCLASS_NAME = "C_YUI_SHELL";

/*  Last shell created on the page — fallback for yui_shell_of()
 *  when the caller is not a shell descendant (e.g. a floating
 *  C_YUI_WINDOW parented to the app gobj).  Real apps have exactly
 *  one shell; tests that create several get the most recent. */
let __last_shell__ = null;

/*  Zones rendered inside the base layer. */
const ZONE_IDS = ["top", "top-sub", "left", "center", "right", "bottom-sub", "bottom"];

/*  Global stacking layers. */
const LAYER_DEFS = [
    ["base",         1  ],
    ["overlay",      15 ],
    ["popup",        20 ],
    ["modal",        99 ],
    ["notification", 120],
    ["loading",      150]
];

/***************************************************************
 *              Attrs
 ***************************************************************/
const attrs_table = [
SDATA(data_type_t.DTP_POINTER,  "subscriber",     0,  null,  "Subscriber of output events"),

SDATA(data_type_t.DTP_JSON,     "config",         0,  null,  "Shell declarative config (zones, menu, stages, toolbar)"),
SDATA(data_type_t.DTP_STRING,   "default_route",  0,  "",    "Fallback route if hash is empty"),
SDATA(data_type_t.DTP_STRING,   "current_route",  0,  "",    "Current active route"),
SDATA(data_type_t.DTP_BOOLEAN,  "use_hash",       0,  true,  "Bind navigation to window.location.hash"),
SDATA(data_type_t.DTP_POINTER,  "mount_element",  0,  null,  "HTMLElement to mount shell into (default: document.body)"),

SDATA(data_type_t.DTP_POINTER,  "$container",     0,  null,  "Root HTMLElement of the shell"),
SDATA(data_type_t.DTP_POINTER,  "priv",           0,  null,  "Private runtime state (zones/layers/stages/navs)"),
SDATA_END()
];

let PRIVATE_DATA = {};

let __gclass__ = null;




                    /******************************
                     *      Framework Methods
                     ******************************/




/***************************************************************
 *          Framework Method: Create
 ***************************************************************/
function mt_create(gobj)
{
    /*
     *  SERVICE subscription model
     */
    const subscriber = gobj_read_pointer_attr(gobj, "subscriber");
    if(subscriber) {
        gobj_subscribe_event(gobj, null, {}, subscriber);
    }

    /*  Per-instance private state (avoid the gclass-level PRIVATE_DATA). */
    gobj_write_attr(gobj, "priv", {
        zones:           {},
        layers:          {},
        stages:          {},
        navs:            [],
        item_index:      {},
        hash_handler:    null,
        keydown_handler: null,
        /*  Escape priority chain: array of { layer, handler }.  Each
         *  interactive overlay (drawer today, modal/popup tomorrow)
         *  pushes its close handler when it opens and pops it when
         *  it closes.  Escape calls the top handler only — LIFO. */
        escape_stack:    [],
        /*  Overlay history integration (Back button ↔ modals/windows).
         *  Each history-participating overlay (modal, floating window)
         *  pushes a { id, close } record here when it opens, plus a
         *  synthetic browser-history entry (pushState).  The browser Back
         *  button then closes the TOP overlay instead of navigating; and
         *  an overlay dismissed by any other path (X, Escape, backdrop,
         *  code) retires its history entry via history.back().  Gated on
         *  `use_hash` — see push_overlay_history / overlay_dismissed. */
        overlay_stack:   [],
        overlay_seq:     0,
        /*  Count of history.back() calls WE issued to retire a dismissed
         *  overlay; the popstate they trigger is expected and ignored. */
        expected_pops:   0,
        popstate_handler: null,
        /*  Avatar item support — every toolbar item with type:"avatar"
         *  registers its <span> here so refresh_avatars() can repaint
         *  the initials when the host (wattyzer, hidraulia, …) calls
         *  yui_shell_set_avatar_provider() / yui_shell_refresh_avatars().
         *  The provider is a () => string callback owned by the host. */
        avatar_provider: null,
        avatar_nodes:    [],
        /*  Optional i18n translator (t-function) the host registers via
         *  yui_shell_set_translator().  The host translates the static
         *  shell tree by calling refresh_language($container, t) once,
         *  but LAZILY-built DOM (the toolbar dropdown panel) is mounted
         *  on the popup layer, OUTSIDE $container, AFTER that call — so
         *  it would never be translated.  When a translator is set the
         *  shell re-applies it to each freshly built panel. */
        translator:      null,
        /*  Connection-indicator support — every toolbar item with
         *  type:"connection" registers its dot <span> here so
         *  yui_shell_set_connection_state(shell, bool) can repaint the
         *  backend-connected state.  State is host/event-driven (unlike
         *  the avatar provider it is a setter, not a pull callback). */
        conn_nodes:      [],
        /*  Currently open toolbar dropdown panel, if any.  Tracked here
         *  so a second click on any trigger (or programmatic close) can
         *  tear down the previous one through the same code path. */
        active_dropdown: null
    });

    __last_shell__ = gobj;

    build_ui(gobj);
}

/***************************************************************
 *          Framework Method: Start
 ***************************************************************/
function mt_start(gobj)
{
    let config = gobj_read_attr(gobj, "config") || {};
    let priv = gobj_read_attr(gobj, "priv");

    /*  Validate the declarative config before anything reads it. This is a
     *  system boundary (app-supplied JSON); validation makes shape errors
     *  visible loudly instead of producing a half-built shell. */
    if(!validate_config(config)) {
        let $base = priv.layers && priv.layers.base;
        if($base) {
            $base.appendChild(createElement2(
                ["div", {class: "notification is-danger m-4"},
                    ["p", {}, "C_YUI_SHELL: invalid config — see browser console for details"]
                ]
            ));
        }
        return;
    }

    build_item_index(gobj, config);
    instantiate_menus(gobj, config);
    build_toolbar(gobj, config);

    /*  lifecycle: "eager" — preinstantiate views that must exist from boot. */
    preinstantiate_eager_views(gobj);

    if(gobj_read_attr(gobj, "use_hash")) {
        priv.hash_handler = () => {
            let route = hash_to_route(window.location.hash);
            if(!empty_string(route)) {
                navigate_to(gobj, route);
            }
        };
        window.addEventListener("hashchange", priv.hash_handler);

        /*  Back button ↔ overlays.  A synthetic overlay history entry
         *  keeps the same hash, so Back over it fires popstate WITHOUT a
         *  hashchange: close the top overlay and consume the event.  A
         *  real route Back changes the hash and is handled by hash_handler
         *  above (popstate then finds no overlays and does nothing). */
        priv.popstate_handler = () => {
            let p = gobj_read_attr(gobj, "priv");
            if(!p) {
                return;
            }
            if(p.expected_pops > 0) {
                /*  A history.back() we issued to retire a dismissed
                 *  overlay — the teardown already happened. */
                p.expected_pops--;
                return;
            }
            if(p.overlay_stack.length > 0) {
                let entry = p.overlay_stack.pop();
                try {
                    entry.close();
                } catch(e) {
                    log_warning(`C_YUI_SHELL: overlay close on Back failed: ${e}`);
                }
            }
        };
        window.addEventListener("popstate", priv.popstate_handler);
    }

    /*  Global Escape: route to the top handler of the escape stack,
     *  not to a hardcoded "close all drawers".  Modals and popups
     *  push themselves on top of drawers, so Escape closes them
     *  first; second Escape closes the drawer underneath; etc. */
    priv.keydown_handler = ev => {
        if(ev.key !== "Escape" && ev.keyCode !== 27) {
            return;
        }
        if(priv.escape_stack.length === 0) {
            return;
        }
        let top = priv.escape_stack[priv.escape_stack.length - 1];
        ev.preventDefault();
        ev.stopPropagation();
        top.handler();
    };
    window.addEventListener("keydown", priv.keydown_handler);

    let initial = hash_to_route(window.location.hash);
    if(empty_string(initial)) {
        initial = gobj_read_attr(gobj, "default_route") ||
                  (config.shell && config.shell.stages && config.shell.stages.main &&
                      config.shell.stages.main.default_route) || "";
    }
    if(!empty_string(initial)) {
        navigate_to(gobj, initial);
    } else {
        /*  No hash, no default_route, no stage default: tell the user loudly. */
        show_stage_placeholder(
            gobj, "main",
            "C_YUI_SHELL: no route to display (empty hash, no default_route, " +
            "no stages.main.default_route)"
        );
        log_error(
            "C_YUI_SHELL: no initial route — set default_route, " +
            "shell.stages.<name>.default_route, or navigate via hash"
        );
    }
}

/***************************************************************
 *          Framework Method: Stop
 ***************************************************************/
function mt_stop(gobj)
{
    let priv = gobj_read_attr(gobj, "priv");
    if(!priv) {
        return;
    }

    /*  Tear down any toolbar dropdown that was open at stop time so its
     *  document-level mousedown listener and escape-stack entry don't
     *  outlive the shell. */
    close_toolbar_dropdown(gobj);

    if(priv.hash_handler) {
        window.removeEventListener("hashchange", priv.hash_handler);
        priv.hash_handler = null;
    }
    if(priv.popstate_handler) {
        window.removeEventListener("popstate", priv.popstate_handler);
        priv.popstate_handler = null;
    }
    if(priv.keydown_handler) {
        window.removeEventListener("keydown", priv.keydown_handler);
        priv.keydown_handler = null;
    }

    for(let nav of priv.navs) {
        try {
            gobj_stop(nav);
            gobj_destroy(nav);
        } catch(e) {
            log_warning(`C_YUI_SHELL: stop/destroy nav failed: ${e}`);
        }
    }
    priv.navs = [];

    for(let name in priv.stages) {
        let st = priv.stages[name];
        for(let route in st.items) {
            let g = st.items[route];
            try {
                gobj_stop(g);
                gobj_destroy(g);
            } catch(e) {
                log_warning(`C_YUI_SHELL: stop/destroy view '${route}' failed: ${e}`);
            }
        }
        st.items = {};
        st.active_route = null;
    }
}

/***************************************************************
 *          Framework Method: Destroy
 ***************************************************************/
function mt_destroy(gobj)
{
    /*  Defensive: tests sometimes call gobj_destroy without a prior
     *  gobj_stop.  In normal lifecycle mt_stop already closed the
     *  dropdown; calling close_toolbar_dropdown here is idempotent
     *  (it returns early when nothing is open) and prevents a
     *  dangling document mousedown listener / escape-stack entry
     *  when stop is skipped. */
    close_toolbar_dropdown(gobj);

    let $container = gobj_read_attr(gobj, "$container");
    if($container && $container.parentNode) {
        $container.parentNode.removeChild($container);
    }
    gobj_write_attr(gobj, "$container", null);
    gobj_write_attr(gobj, "priv", null);

    if(__last_shell__ === gobj) {
        __last_shell__ = null;
    }
}




                    /***************************
                     *      Local Methods
                     ***************************/




/************************************************************
 *  Validate the declarative config (system boundary: app JSON).
 *
 *  Reports every missing/wrong field via log_error so a malformed
 *  config fails loudly instead of producing an empty/broken shell.
 *  Returns true iff the config is structurally usable.
 ************************************************************/
function validate_config(config)
{
    let ok = true;

    if(!is_object(config)) {
        log_error("C_YUI_SHELL: config must be a JSON object");
        return false;
    }
    if(!is_object(config.shell)) {
        log_error("C_YUI_SHELL: config.shell is missing or not an object");
        return false;
    }

    let shell_cfg = config.shell;
    if(shell_cfg.zones !== undefined && !is_object(shell_cfg.zones)) {
        log_error("C_YUI_SHELL: config.shell.zones must be an object");
        ok = false;
    }
    if(shell_cfg.stages !== undefined && !is_object(shell_cfg.stages)) {
        log_error("C_YUI_SHELL: config.shell.stages must be an object");
        ok = false;
    }

    let zones_cfg = is_object(shell_cfg.zones) ? shell_cfg.zones : {};
    /*  host syntax: must be one of "toolbar", "menu.<id>", "stage.<id>". */
    let HOST_RE = /^(?:toolbar|menu\.\S+|stage\.\S+)$/;
    for(let zid in zones_cfg) {
        if(ZONE_IDS.indexOf(zid) < 0) {
            log_error(
                `C_YUI_SHELL: unknown zone '${zid}' in config.shell.zones; ` +
                `valid zones: ${ZONE_IDS.join(", ")}`
            );
            ok = false;
            continue;
        }
        let z = zones_cfg[zid];
        if(z && typeof z.host === "string" && z.host.length > 0 &&
                !HOST_RE.test(z.host))
        {
            log_error(
                `C_YUI_SHELL: zone '${zid}' has invalid host '${z.host}'; ` +
                `must match 'toolbar', 'menu.<id>' or 'stage.<id>'`
            );
            ok = false;
        }
    }

    let stages_cfg = is_object(shell_cfg.stages) ? shell_cfg.stages : {};
    for(let sname in stages_cfg) {
        let st = stages_cfg[sname];
        if(!is_object(st)) {
            log_error(`C_YUI_SHELL: config.shell.stages.${sname} must be an object`);
            ok = false;
            continue;
        }
        let zone = st.zone || "center";
        if(ZONE_IDS.indexOf(zone) < 0) {
            log_error(
                `C_YUI_SHELL: stage '${sname}' references unknown zone '${zone}'`
            );
            ok = false;
            continue;
        }
        /*  zone must actually be declared in shell.zones — catches typos
         *  like stages.main.zone = "centre" that pass the ZONE_IDS test
         *  by accident. */
        if(!Object.prototype.hasOwnProperty.call(zones_cfg, zone)) {
            log_warning(
                `C_YUI_SHELL: stage '${sname}' references zone '${zone}' ` +
                `which is not declared in config.shell.zones — it will be ` +
                `created with default attributes`
            );
        }
    }

    if(config.menu !== undefined && !is_object(config.menu)) {
        log_error("C_YUI_SHELL: config.menu must be an object");
        ok = false;
    }
    if(config.toolbar !== undefined) {
        /*  toolbar = { zone?, aria_label?, items[] } — see SHELL.md §3.4. */
        if(!is_object(config.toolbar)) {
            log_error("C_YUI_SHELL: config.toolbar must be an object");
            ok = false;
        } else if(config.toolbar.items !== undefined &&
                  !is_array(config.toolbar.items)) {
            log_error("C_YUI_SHELL: config.toolbar.items must be an array");
            ok = false;
        } else if(is_array(config.toolbar.items)) {
            /*  Per-item shape check: brand needs logo+wordmark, dropdown
             *  needs items[], action.type must be one of the known set,
             *  etc.  Surfaced as warnings (additive contract: legacy
             *  configs without `type` keep working as type:"action"). */
            for(let it of config.toolbar.items) {
                let r = validate_toolbar_item(it);
                if(!r.ok) {
                    for(let w of r.warnings) {
                        log_warning(`C_YUI_SHELL: ${w}`);
                    }
                }
            }
        }
    }

    /*  Route uniqueness: a route declared in two different menus is a
     *  source of subtle bugs (build_item_index has a "first wins"
     *  rule, so the second declaration is silently shadowed).  Warn
     *  loudly. */
    if(is_object(config.menu)) {
        let route_owner = {};
        for(let menu_id in config.menu) {
            let m = config.menu[menu_id];
            if(!m || !is_array(m.items)) {
                continue;
            }
            for(let it of m.items) {
                check_route_unique(route_owner, it, menu_id);
                if(it.submenu && is_array(it.submenu.items)) {
                    for(let sub of it.submenu.items) {
                        check_route_unique(route_owner, sub, menu_id);
                    }
                }
            }
        }
    }

    return ok;
}

/************************************************************
 *  Helper for validate_config — only warn when TWO different
 *  menus both declare a `target` for the same route.  Items
 *  without a `target` are just navigators (they delegate to
 *  whichever menu owns the route) and do not compete, so the
 *  legitimate "menu A navigates / menu B owns" pattern stays
 *  silent.
 ************************************************************/
function check_route_unique(route_owner, item, menu_id)
{
    if(!item || empty_string(item.route)) {
        return;
    }
    if(!item.target) {
        return;
    }
    let route = item.route;
    if(route_owner[route] !== undefined && route_owner[route] !== menu_id) {
        log_warning(
            `C_YUI_SHELL: route '${route}' has a target in menu ` +
            `'${menu_id}' AND in menu '${route_owner[route]}' — the ` +
            `second target is shadowed (build_item_index keeps the ` +
            `first entry that owns a target)`
        );
        return;
    }
    route_owner[route] = menu_id;
}

/************************************************************
 *  Build the DOM: layers → base → zones
 ************************************************************/
function build_ui(gobj)
{
    let priv = gobj_read_attr(gobj, "priv");
    let config = gobj_read_attr(gobj, "config") || {};
    let shell_cfg = config.shell || {};

    /*  Root */
    let $container = createElement2(
        ["div", {class: "C_YUI_SHELL yui-shell"}]
    );

    /*  Build layers */
    for(let [id, z] of LAYER_DEFS) {
        let $layer = createElement2(
            ["div", {class: `yui-layer yui-layer-${id}`, style: `z-index:${z};`}]
        );
        $container.appendChild($layer);
        priv.layers[id] = $layer;
    }

    /*  Base layer holds the grid of zones */
    let $base = priv.layers.base;
    $base.classList.add("yui-base-grid");

    let zones_cfg = shell_cfg.zones || {};

    for(let id of ZONE_IDS) {
        let $z = createElement2(
            ["div", {class: `yui-zone yui-zone-${id}`,
                     "data-zone": id,
                     style: `grid-area: ${zone_grid_area(id)};`}]
        );
        apply_show_on($z, (zones_cfg[id] && zones_cfg[id].show_on) || "");
        priv.zones[id] = $z;
        $base.appendChild($z);
    }

    /*  Register stages: zones hosting routed gobjs.
     *  Declared via zones[zone].host === "stage.<name>" or shell.stages.<name>.zone === <zone>.
     */
    let stages_cfg = shell_cfg.stages || {};
    for(let stage_name in stages_cfg) {
        let zone = stages_cfg[stage_name].zone || "center";
        priv.stages[stage_name] = {
            el: priv.zones[zone],
            items: {},
            active_route: null
        };
        if(priv.zones[zone]) {
            priv.zones[zone].classList.add("yui-stage", `yui-stage-${stage_name}`);
        }
    }
    /*  Infer main stage from center zone host if not explicitly declared. */
    for(let id in zones_cfg) {
        let host = zones_cfg[id].host || "";
        let m = /^stage\.(.+)$/.exec(host);
        if(m) {
            let name = m[1];
            if(!priv.stages[name]) {
                priv.stages[name] = { el: priv.zones[id], items: {}, active_route: null };
                if(priv.zones[id]) {
                    priv.zones[id].classList.add("yui-stage", `yui-stage-${name}`);
                }
            }
        }
    }
    if(!priv.stages.main && priv.zones.center) {
        priv.stages.main = { el: priv.zones.center, items: {}, active_route: null };
        priv.zones.center.classList.add("yui-stage", "yui-stage-main");
    }

    /*  Mount */
    let $mount = gobj_read_attr(gobj, "mount_element") || document.body;
    $mount.appendChild($container);

    gobj_write_attr(gobj, "$container", $container);
}

/************************************************************
 *  Translate zone id to grid-area name
 ************************************************************/
function zone_grid_area(zone_id)
{
    switch(zone_id) {
        case "top":        return "top";
        case "top-sub":    return "topsub";
        case "left":       return "left";
        case "center":     return "center";
        case "right":      return "right";
        case "bottom-sub": return "botsub";
        case "bottom":     return "bottom";
    }
    return "";
}

/************************************************************
 *  Translate "show_on" expression to Bulma is-hidden-* classes.
 *      ">=desktop"   → hide on touch
 *      "<desktop"    → hide on desktop+
 *      ">=tablet"    → hide on mobile
 *      "<tablet"     → hide on tablet+
 *      "mobile|tablet" → list form (OR of breakpoints)
 *      ""            → always visible
 ************************************************************/
function apply_show_on($el, expr)
{
    if(empty_string(expr)) {
        return;
    }
    let visible = breakpoints_from_expr(expr);
    for(let bp of BULMA_BP_ORDER) {
        if(!visible[bp]) {
            $el.classList.add(bulma_hidden_class(bp));
        }
    }
    $el.setAttribute("data-show-on", expr);
}

/************************************************************
 *  Precompute: route → { item, parent_item, stage, target }
 ************************************************************/
function build_item_index(gobj, config)
{
    let priv = gobj_read_attr(gobj, "priv");
    priv.item_index = {};

    let menus = (config.menu) || {};
    for(let menu_id in menus) {
        let menu = menus[menu_id];
        let items = (menu && menu.items) || [];
        for(let item of items) {
            if(item.route) {
                /*  Section-index landing (submenu.index): the section
                 *  route gets a synthesized target — the submenu itself
                 *  rendered as a "cards" C_YUI_NAV in the stage — so it
                 *  becomes a real resting, deep-linkable route instead
                 *  of redirecting to the default child (navigate_to()
                 *  only redirects while the entry has NO target).
                 *  Explicit inline targets keep precedence (the helper
                 *  returns null then). */
                let target = item.target || section_index_target(menu_id, item);

                /*  A later menu must NOT clobber an earlier entry that
                 *  has a valid target with one that has none.  This is
                 *  the common case where a `quick` drawer just reuses
                 *  routes declared (with target) in `primary.submenu`.
                 *  Rule: prefer the first entry with a target. */
                let prev = priv.item_index[item.route];
                if(!prev || (!prev.target && target)) {
                    priv.item_index[item.route] = {
                        item: item,
                        parent_item: null,
                        stage: target && target.stage || null,
                        target: target,
                        menu_id: menu_id
                    };
                }
            }
            let sub = item.submenu;
            if(sub && is_array(sub.items)) {
                for(let sub_item of sub.items) {
                    if(sub_item.route) {
                        let prev = priv.item_index[sub_item.route];
                        if(!prev || (!prev.target && sub_item.target)) {
                            priv.item_index[sub_item.route] = {
                                item: sub_item,
                                parent_item: item,
                                stage: sub_item.target && sub_item.target.stage || null,
                                target: sub_item.target || null,
                                menu_id: menu_id
                            };
                        }
                    }
                }
            }
        }
    }

    /*  Explicit route table: authoritative source for routes that are
     *  not a left-menu item — action routes (kind:"action"), forms
     *  reachable only from the toolbar/dropdown, and the root "/".
     *  Toolbar/dropdown items just carry action:{type:"navigate",
     *  route}; their TARGET (view gclass, or kind:"action" event +
     *  redirect) lives here so the route resolves by URL on reload /
     *  deep-link.  Same precedence as menus: only fill or upgrade an
     *  entry without a target — never clobber a menu's own target.   */
    let routes = (config.shell && config.shell.routes) || {};
    for(let route in routes) {
        let t = routes[route] || null;
        let prev = priv.item_index[route];
        if(!prev || (!prev.target && t)) {
            priv.item_index[route] = {
                item: (prev && prev.item) || null,
                parent_item: (prev && prev.parent_item) || null,
                stage: (t && t.stage) || null,
                target: t,
                menu_id: (prev && prev.menu_id) || ""
            };
        }
    }
}

/************************************************************
 *  For each menu declared: for each zone hosting it, create
 *  a C_YUI_NAV that renders it with that zone's style.
 ************************************************************/
function instantiate_menus(gobj, config)
{
    let priv = gobj_read_attr(gobj, "priv");
    let zones_cfg = (config.shell && config.shell.zones) || {};
    let menus = config.menu || {};

    /*  Invert zones_cfg: which zones host "menu.<id>" */
    let zones_for_menu = {};
    for(let zone_id in zones_cfg) {
        let host = zones_cfg[zone_id].host || "";
        let m = /^menu\.(.+)$/.exec(host);
        if(m) {
            let menu_id = m[1];
            (zones_for_menu[menu_id] = zones_for_menu[menu_id] || []).push(zone_id);
        }
    }

    /*  Drawer menus are overlays: they don't need a host in the zone grid.
     *  Any menu with render[zone].layout === "drawer" is instantiated too;
     *  instantiate_nav_in_zone() will mount it on the overlay layer.       */
    for(let menu_id in menus) {
        let r = (menus[menu_id] && menus[menu_id].render) || {};
        for(let zone_id in r) {
            let cfg = r[zone_id];
            let layout = is_string(cfg) ? cfg : (cfg && cfg.layout);
            if(layout === "drawer") {
                let list = (zones_for_menu[menu_id] = zones_for_menu[menu_id] || []);
                if(list.indexOf(zone_id) < 0) {
                    list.push(zone_id);
                }
            }
        }
    }

    for(let menu_id in zones_for_menu) {
        let menu = menus[menu_id];
        if(!menu) {
            continue;
        }
        for(let zone_id of zones_for_menu[menu_id]) {
            instantiate_nav_in_zone(gobj, menu, menu_id, zone_id, "primary");
        }
    }

    /*  Secondary navs: create one per primary-style menu item that
     *  declares a submenu with its own render block, for every zone
     *  listed in `submenu.render`.  Initially hidden, shown when the
     *  owning primary item becomes active.
     *
     *  We walk every menu mounted via a zone host of the form
     *  "menu.<id>" — not just menus.primary.  The synthesized
     *  sub_menu_id is `secondary.<menu_id>.<item.id>` so two
     *  menus can have items with the same id without colliding. */
    for(let menu_id in zones_for_menu) {
        let menu = menus[menu_id];
        if(!menu || !is_array(menu.items)) {
            continue;
        }
        for(let item of menu.items) {
            let sub = item.submenu;
            if(!sub || !is_array(sub.items)) {
                continue;
            }
            let render_by_zone = sub.render || {};
            for(let zone_id in render_by_zone) {
                if(zone_id === "*") {
                    continue;
                }
                let layout = render_by_zone[zone_id];
                if(!priv.zones[zone_id]) {
                    log_warning(
                        `C_YUI_SHELL: submenu of '${menu_id}.${item.id}' ` +
                        `renders in unknown zone '${zone_id}'`
                    );
                    continue;
                }
                /*  Index sections (submenu.index) get a render PLAN:
                 *  the declared nav constrained to ">=tablet" plus a
                 *  mobile "backbar" (← <section>) — tabs and cards
                 *  never coexist, and a child view on mobile offers
                 *  the way back instead of a duplicated tab strip. */
                let renders = secondary_nav_renders(item, render_to_obj(layout));
                let sub_menu_id = `secondary.${menu_id}.${item.id}`;
                for(let render_cfg of renders) {
                    let submenu_def = {
                        items: sub.items,
                        render: { [zone_id]: render_cfg }
                    };
                    let nav = instantiate_nav_in_zone(
                        gobj, submenu_def, sub_menu_id, zone_id, "secondary",
                        item.name || ""
                    );
                    /*  Hidden until owning primary is active. */
                    let $c = gobj_read_attr(nav, "$container");
                    if($c) {
                        $c.classList.add("is-hidden");
                    }
                }
            }
        }
    }
}

/*  Accept shorthand "tabs"|"vertical"|... as well as object form */
function render_to_obj(layout)
{
    if(is_string(layout)) {
        return { layout: layout };
    }
    if(is_object(layout)) {
        return layout;
    }
    return { layout: "vertical" };
}

function instantiate_nav_in_zone(gobj, menu, menu_id, zone_id, level, nav_label)
{
    let priv = gobj_read_attr(gobj, "priv");
    let render_cfg = (menu.render && (menu.render[zone_id] || menu.render["*"])) ||
                     { layout: "vertical" };
    if(is_string(render_cfg)) {
        render_cfg = { layout: render_cfg };
    }

    let layout = render_cfg.layout || "vertical";
    /*  A backbar shares menu_id and zone with the nav it complements —
     *  suffix the gobj name to avoid a sibling-name collision. */
    let nav_name = `nav_${menu_id.replace(/\./g, "_")}_${zone_id}` +
                   (layout === "backbar" ? "_backbar" : "");
    let nav = gobj_create(
        nav_name,
        "C_YUI_NAV",
        {
            menu_id:     menu_id,
            nav_label:   nav_label || "",
            menu_items:  menu.items || [],
            zone:        zone_id,
            layout:      layout,
            icon_pos:    render_cfg.icon_pos || default_icon_pos(zone_id),
            show_label:  render_cfg.show_label !== false,
            level:       level,
            show_on:     render_cfg.show_on || "",
            back_route:  render_cfg.back_route || "",
            shell:       gobj
        },
        gobj
    );

    /*  Drawers are position:fixed full-screen overlays: mount them on the
     *  overlay layer, not inside the zone grid cell (which may be display:
     *  none at some breakpoints and would hide the drawer).  The zone still
     *  serves as a declarative anchor in the config. */
    let $c = gobj_read_attr(nav, "$container");
    if($c) {
        if(layout === "drawer" && priv.layers.overlay) {
            priv.layers.overlay.appendChild($c);
        } else if(priv.zones[zone_id]) {
            priv.zones[zone_id].appendChild($c);
        }
    }

    /*  The CHILD subscription model in C_YUI_NAV.mt_create already
     *  subscribes the parent (us) to EV_NAV_CLICKED, so no explicit
     *  call is needed here. */

    gobj_start(nav);
    priv.navs.push(nav);
    return nav;
}

function default_icon_pos(zone_id)
{
    if(zone_id === "bottom" || zone_id === "top") {
        return "top";
    }
    if(zone_id === "left" || zone_id === "right") {
        return "left";
    }
    if(zone_id === "top-sub" || zone_id === "bottom-sub") {
        return "left";
    }
    return "left";
}

/************************************************************
 *  Hash <-> route
 ************************************************************/
function hash_to_route(hash)
{
    if(!hash) {
        return "";
    }
    let s = String(hash).replace(/^#/, "");
    if(s.charAt(0) !== "/") {
        s = "/" + s;
    }
    return s;
}

function route_to_hash(route)
{
    if(!route) {
        return "";
    }
    let s = route.charAt(0) === "/" ? route : "/" + route;
    return "#" + s;
}

/************************************************************
 *  Navigate: make `route` active
 ************************************************************/
function navigate_to(gobj, route)
{
    let priv = gobj_read_attr(gobj, "priv");

    /*  Audit witness: publish the navigation intent FIRST, before any
     *  validation or DOM work. This guarantees that the FSM trace and
     *  any subscribed auditor see every requested route — including
     *  rerouted submenu defaults and routes that ultimately fail. */
    gobj_publish_event(gobj, "EV_ROUTE_REQUESTED", {
        route: route,
        from:  gobj_read_attr(gobj, "current_route") || ""
    });

    if(empty_string(route)) {
        log_error("C_YUI_SHELL: navigate_to called with empty route");
        return;
    }
    let entry = priv.item_index[route];

    /*  Route level 1 only: if it has a submenu, navigate to its default subitem.
     *  Skip decorative items (`type:"header"`, `type:"divider"`) — they have
     *  no `route`, so the first *navigable* child is used as the fallback.
     *  Done on the EXACT entry, BEFORE the ancestor walk, so a submenu
     *  parent (e.g. `/system`) is never swallowed by the root `/`.       */
    if(entry && !entry.target && entry.item && entry.item.submenu) {
        let sub = entry.item.submenu;
        let first_routable = sub.items && sub.items.find(it => it && it.route);
        let default_sub = sub.default || (first_routable && first_routable.route);
        if(default_sub) {
            return navigate_to(gobj, default_sub);
        }
    }

    /*  Pure resolution: exact target, or nearest declared ancestor
     *  (`/a/b/c` under declared `/a/b`) + the trailing `subpath`.
     *  See resolve_route() for the contract (root `/` only matches
     *  exactly, never as an ancestor catch-all).                       */
    let r = resolve_route(priv.item_index, route);
    entry = r.entry;
    let matched_route = r.matched_route;
    let subpath = r.subpath;

    if(!entry || !entry.target) {
        /*  Unknown route → fall back to the default route (standard
         *  SPA behaviour).  Resilient to stale/foreign hashes:
         *  bookmarks, old deep links, or a legacy component that
         *  wrote `#<gobj>?<sub>` into the URL before navigation was
         *  made self-contained.  Only dead-end in a placeholder when
         *  the default is itself unresolvable (a real misconfig).   */
        let config = gobj_read_attr(gobj, "config") || {};
        let def = gobj_read_attr(gobj, "default_route") ||
                  (config.shell && config.shell.stages &&
                   config.shell.stages.main &&
                   config.shell.stages.main.default_route) || "";
        if(!empty_string(def) && def !== route) {
            log_warning(
                `C_YUI_SHELL: unknown route '${route}', ` +
                `redirecting to default '${def}'`
            );
            return navigate_to(gobj, def);
        }
        log_error(`C_YUI_SHELL: no target for route '${route}'`);
        show_stage_placeholder(
            gobj, "main",
            `C_YUI_SHELL: route '${route}' is not declared in any menu item`
        );
        return;
    }

    /*  Action route (target.kind:"action") — fires an event.  Most
     *  flavours are TRANSIENT (no view mounted, current_route not set
     *  to it).
     *  redirect:
     *    "<route>" → go there afterwards (e.g. logout → "/").
     *    "back"    → return to the previous resting view route.
     *    "none"/"" → no navigation; just restore the URL to the
     *                previous resting route (the app takes over —
     *                e.g. logout tears the shell down itself).
     *    "stay"    → OVERLAY action: fire the event (the app opens a
     *                modal/overlay) and KEEP the URL on this route so
     *                it is deep-linkable / bookmarkable.  The URL is
     *                NOT restored; no view is mounted and
     *                current_route stays on the underlying resting
     *                view (the overlay floats above it).  The app's
     *                overlay close path is responsible for
     *                history.back() so leaving it returns to that
     *                resting route.  A direct deep-link / reload onto
     *                this route has no resting view yet: mount the
     *                default underneath first (that replaceState's the
     *                URL to the default), then re-push this hash so a
     *                later close → back lands on the default instead
     *                of exiting the app.
     *  EV_ROUTE_REQUESTED was already published above, so an auditor
     *  sees the action route intent too.                              */
    if(entry.target.kind === "action") {
        let t = entry.target;
        if(!empty_string(t.event)) {
            gobj_publish_event(gobj, t.event, t.kw || {});
        }
        let config = gobj_read_attr(gobj, "config") || {};
        let prev = (priv.stages && priv.stages.main &&
                    priv.stages.main.active_route) ||
                   gobj_read_attr(gobj, "default_route") ||
                   (config.shell && config.shell.stages &&
                    config.shell.stages.main &&
                    config.shell.stages.main.default_route) || "/";
        let redirect = t.redirect;
        if(redirect === "stay") {
            if(gobj_read_attr(gobj, "use_hash")) {
                let has_resting = !!(priv.stages && priv.stages.main &&
                                     priv.stages.main.active_route);
                if(!has_resting && prev && prev !== route) {
                    /*  Deep-link / reload straight onto the overlay
                     *  route: bring up the default view underneath,
                     *  then push this hash back on top so close→back
                     *  returns to the default. */
                    navigate_to(gobj, prev);
                    let h = route_to_hash(route);
                    try {
                        window.history.pushState(null, "", h);
                    } catch(e) {
                        window.location.hash = h;
                    }
                }
                /*  else: reached via a click that already pushed this
                 *  hash — leave the URL exactly as the user sees it. */
            }
            return;
        }
        if(empty_string(redirect) || redirect === "none") {
            if(gobj_read_attr(gobj, "use_hash")) {
                let h = route_to_hash(prev);
                try {
                    window.history.replaceState(null, "", h);
                } catch(e) {
                    window.location.hash = h;
                }
            }
            return;
        }
        if(redirect === "back") {
            redirect = prev;
        }
        if(redirect === route) {
            log_error(
                `C_YUI_SHELL: action route '${route}' redirects to itself`
            );
            return;
        }
        return navigate_to(gobj, redirect);
    }

    /*  A fresh navigation clears any placeholder shown earlier. */
    clear_stage_placeholder(gobj, entry.stage || "main");

    let stage_name = entry.stage || "main";
    let stage = priv.stages[stage_name];
    if(!stage) {
        log_error(`C_YUI_SHELL: stage '${stage_name}' not declared`);
        return;
    }

    /*  View instances are keyed by the BASE (declared) route so a
     *  subpath-only change reuses the same view (no rebuild). */
    let prev_route = stage.active_route;
    if(prev_route && prev_route !== matched_route) {
        let prev_gobj = stage.items[prev_route];
        let $prev = null;
        if(prev_gobj) {
            $prev = gobj_read_attr(prev_gobj, "$container");
            if($prev) {
                $prev.classList.add("is-hidden");
            }
        }
        /*  lazy_destroy: drop previous on exit */
        let prev_entry = priv.item_index[prev_route];
        if(prev_entry && prev_entry.target && prev_entry.target.lifecycle === "lazy_destroy") {
            try {
                gobj_stop(prev_gobj);
                gobj_destroy(prev_gobj);
            } catch(e) {
                log_warning(`C_YUI_SHELL: lazy_destroy of '${prev_route}' failed: ${e}`);
            }
            /*  The shell appended $container on mount (build_view_gobj), so
             *  remove it symmetrically here: a view that doesn't remove its
             *  own container in mt_destroy would otherwise leak a hidden
             *  copy in the stage on every revisit — and any fixed DOM id
             *  inside it then shadows the fresh instance's.  */
            if($prev && $prev.parentNode) {
                $prev.parentNode.removeChild($prev);
            }
            delete stage.items[prev_route];
        }
    }

    /*  Show or create current (keyed by base route) */
    let cur = stage.items[matched_route];
    if(!cur) {
        cur = build_view_gobj(gobj, entry, matched_route, stage);
        if(!cur) {
            return;
        }
        stage.items[matched_route] = cur;
    }
    let $c = gobj_read_attr(cur, "$container");
    if($c) {
        $c.classList.remove("is-hidden");
    }

    stage.active_route = matched_route;
    gobj_write_attr(gobj, "current_route", route);

    /*  Show/hide secondary navs according to parent item */
    update_secondary_nav_visibility(gobj, entry);

    /*  Any drawer that triggered (or merely sits open during) the navigation
     *  is a transient overlay — closing it after the route change avoids it
     *  sitting on top of the new view. */
    close_all_drawers(gobj);

    /*  Same logic for an open toolbar dropdown — once the navigation lands
     *  on a new view, the panel is stale.  No-op when nothing is open. */
    close_toolbar_dropdown(gobj);

    /*  Update hash silently */
    if(gobj_read_attr(gobj, "use_hash")) {
        let target_hash = route_to_hash(route);
        if(window.location.hash !== target_hash) {
            /*  Using history.replaceState avoids extra hashchange fire. */
            try {
                window.history.replaceState(null, "", target_hash);
            } catch(e) {
                window.location.hash = target_hash;
            }
        }
    }

    /*  Broadcast.  `menu_id` carries the owning primary menu so
     *  primary navs can short-circuit when the route belongs to a
     *  different menu — without it, two primary-style menus that
     *  share an item id (legitimate per TODO #5) cross-highlight
     *  each other. */
    gobj_publish_event(gobj, "EV_ROUTE_CHANGED", {
        route: route,
        base: matched_route,
        subpath: subpath,
        item: entry.item,
        parent_item: entry.parent_item,
        stage: stage_name,
        menu_id: entry.menu_id || ""
    });
}

function build_view_gobj(gobj, entry, route, stage)
{
    let target = entry.target;
    /*  The deep-link tail is NOT injected into kw: gobj_create2
     *  validates kw against the view's SDATA strictly, so an extra
     *  key breaks every view that doesn't declare it.  The shell
     *  already broadcasts `subpath` in EV_ROUTE_CHANGED right after
     *  mount (and on every later subpath-only change) — that single
     *  mechanism is how a view owns its dynamic 3rd level.           */
    let kw = target.kw || {};
    let name = target.name || `view_${safe_id(route)}`;

    let view;
    try {
        view = gobj_create(name, target.gclass, kw, gobj);
    } catch(e) {
        log_error(`C_YUI_SHELL: gobj_create failed for ${target.gclass}: ${e}`);
        return null;
    }

    /*  Hard contract: every view gclass MUST expose a $container
     *  HTMLElement by the time mt_create returns.  If not, the shell
     *  cannot mount or hide it — abort cleanly.  */
    let $view = gobj_read_attr(view, "$container");
    if(!$view) {
        log_error(
            `C_YUI_SHELL: gclass '${target.gclass}' does not expose $container; ` +
            `the view is unusable — check its mt_create`
        );
        try {
            gobj_destroy(view);
        } catch(e) {
            log_warning(`C_YUI_SHELL: cleanup gobj_destroy failed for ${target.gclass}: ${e}`);
        }
        return null;
    }
    stage.el.appendChild($view);
    gobj_start(view);

    /*  App view gclasses translate their own DOM; a section-index view
     *  (synthesized "cards" C_YUI_NAV) is SHELL-owned DOM built after
     *  the host's one-shot refresh_language — apply the registered
     *  translator, same policy as lazily-built dropdown panels. */
    let priv = gobj_read_attr(gobj, "priv");
    if(priv && typeof priv.translator === "function" &&
            target.gclass === "C_YUI_NAV") {
        refresh_language($view, priv.translator);
    }
    return view;
}

function safe_id(s)
{
    return String(s).replace(/[^a-zA-Z0-9_]/g, "_").replace(/^_+|_+$/g, "");
}

/************************************************************
 *  Toolbar — a small declarative bar mounted in whichever zone
 *  declares `host: "toolbar"`.
 *
 *  Item kinds (`type`):
 *      "brand"  — logo (img) + wordmark (text); typically anchors a
 *                 navigate action to the home route.
 *      "avatar" — circular initials populated by an app-registered
 *                 provider callback (yui_shell_set_avatar_provider).
 *      "action" — default; icon and/or label that triggers an action.
 *
 *  Action types (item.action.type):
 *      navigate { type:"navigate", route }
 *      drawer   { type:"drawer",   op:"toggle"|"open"|"close", menu_id? }
 *      event    { type:"event",    event, kw? }
 *      dropdown { type:"dropdown", items[] }    (toolbar-only)
 *
 *  Per-item `show_on` is honoured: each rendered item is wrapped with
 *  the same Bulma-helper logic as zones.
 ************************************************************/
function build_toolbar(gobj, config)
{
    let tb = config && config.toolbar;
    if(!tb || !is_array(tb.items)) {
        return;
    }

    let priv = gobj_read_attr(gobj, "priv");
    let zone_id = tb.zone || find_toolbar_zone(config);
    let $zone = priv.zones[zone_id];
    if(!$zone) {
        log_warning(`C_YUI_SHELL: toolbar target zone '${zone_id}' not found`);
        return;
    }

    /*  Drop any avatar-node references from a previous build.  Today
     *  build_toolbar runs once per shell, but resetting here keeps
     *  avatar_nodes in sync if a future rebuild path is added (mt_start
     *  is the only caller now; a hot-reload helper would stale-leak
     *  every span without this). */
    priv.avatar_nodes = [];
    priv.conn_nodes = [];

    /*  Toolbar labels follow the same i18n contract as nav labels:
     *  every translatable text node carries `i18n: <canonical key>`,
     *  which createElement2 maps to `data-i18n` on the rendered
     *  element.  Apps swap languages by calling
     *  refresh_language(shell.$container, t) — no DOM rebuild here. */
    let toolbar_aria = tb.aria_label || "Toolbar";
    let $bar = createElement2(
        ["nav", {class: "yui-toolbar navbar",
                 role: "navigation",
                 "aria-label": toolbar_aria,
                 "data-i18n-aria-label": toolbar_aria},
            [
                ["div", {class: "navbar-brand yui-toolbar-start"}],
                ["div", {class: "navbar-end   yui-toolbar-end"}]
            ]
        ]
    );
    let $start = $bar.querySelector(".yui-toolbar-start");
    let $end   = $bar.querySelector(".yui-toolbar-end");

    for(let it of tb.items) {
        let parent = (it.align === "end") ? $end : $start;
        let kind = classify_toolbar_item(it);

        let $item;
        if(kind === "brand") {
            $item = build_toolbar_brand_item(gobj, it);
        } else if(kind === "avatar") {
            $item = build_toolbar_avatar_item(gobj, it);
        } else if(kind === "connection") {
            $item = build_toolbar_connection_item(gobj, it);
        } else {
            $item = build_toolbar_action_item(gobj, it);
        }
        if(!$item) {
            continue;
        }
        /*  Per-item visibility: same syntax/parser as zones. */
        apply_show_on($item, it.show_on || "");
        parent.appendChild($item);
    }

    $zone.appendChild($bar);
}

/************************************************************
 *  Renderer for the default ("action") item kind.
 ************************************************************/
function build_toolbar_action_item(gobj, it)
{
    let children = [];
    if(!empty_string(it.icon)) {
        children.push(["span", {class: "icon"},
            ["i", {class: it.icon, "aria-hidden": "true"}]]);
    }
    if(!empty_string(it.name)) {
        children.push(["span", {class: "yui-toolbar-item-label", i18n: it.name},
            it.name]);
    }

    let aria_key = it.aria_label || it.name || it.id || "";
    let i18n_aria = it.aria_label || it.name;
    let btn_attrs = {
        class: "navbar-item yui-toolbar-item is-unselectable",
        type: "button",
        "data-toolbar-item-id": it.id || "",
        "aria-label": aria_key
    };
    if(i18n_aria) {
        btn_attrs["data-i18n-aria-label"] = i18n_aria;
    }
    let action_type = (it.action && it.action.type) || "";
    if(action_type === "dropdown") {
        btn_attrs["aria-haspopup"] = "menu";
        btn_attrs["aria-expanded"] = "false";
    }
    /*  Hover tooltip: prefer explicit `tooltip`, fall back to
     *  `aria_label` (usually the same intent — e.g. "Search (Ctrl+F)").
     *  Skip when both empty so we don't emit `title=""` noise.
     *  Mirror the value in `data-i18n-title` so refresh_language()
     *  can re-translate the tooltip on language switch. */
    let tip = it.tooltip || it.aria_label;
    if(tip) {
        btn_attrs.title = tip;
        btn_attrs["data-i18n-title"] = tip;
    }
    let $item = createElement2(
        ["button", btn_attrs, children]
    );
    $item.addEventListener("click", ev => {
        ev.preventDefault();
        handle_toolbar_action(gobj, it, $item);
    });
    attach_context_action(gobj, $item, it);
    return $item;
}

/************************************************************
 *  Renderer for type:"brand".  Always logo (img) + wordmark
 *  (text).  Action defaults to navigate to the host's home
 *  route; if missing, the brand is a passive label.
 ************************************************************/
function build_toolbar_brand_item(gobj, it)
{
    if(empty_string(it.logo) || empty_string(it.wordmark)) {
        log_warning(
            `C_YUI_SHELL: toolbar brand item '${it.id||"?"}' missing ` +
            `logo and/or wordmark — skipped`
        );
        return null;
    }
    let alt = it.alt || it.wordmark || "";
    let aria_key = it.aria_label || it.wordmark || it.id || "";
    let i18n_aria = it.aria_label || it.wordmark;
    let attrs = {
        class: "navbar-item yui-toolbar-item yui-toolbar-brand is-unselectable",
        "data-toolbar-item-id": it.id || "",
        "aria-label": aria_key
    };
    if(i18n_aria) {
        attrs["data-i18n-aria-label"] = i18n_aria;
    }
    let action_type = (it.action && it.action.type) || "";
    let tag = "button";
    if(action_type === "dropdown") {
        attrs["aria-haspopup"] = "menu";
        attrs["aria-expanded"] = "false";
    }
    if(action_type === "") {
        /*  Passive brand: no action — render a div so it is not
         *  keyboard-focused and screen readers don't announce a
         *  pressable control. */
        tag = "div";
    } else {
        attrs.type = "button";
    }
    let $item = createElement2([tag, attrs, [
        ["img", {class: "yui-toolbar-brand-logo",
                 src: it.logo, alt: alt}],
        ["span", {class: "yui-toolbar-brand-wordmark", i18n: it.wordmark},
            it.wordmark]
    ]]);
    if(action_type !== "") {
        $item.addEventListener("click", ev => {
            ev.preventDefault();
            handle_toolbar_action(gobj, it, $item);
        });
    }
    return $item;
}

/************************************************************
 *  Renderer for type:"avatar".  The <span> that holds the
 *  initials is registered in priv.avatar_nodes so a single
 *  refresh_avatars() call repaints every avatar after the host
 *  swaps the provider.
 ************************************************************/
function build_toolbar_avatar_item(gobj, it)
{
    let priv = gobj_read_attr(gobj, "priv");
    let aria_key = it.aria_label || it.name || it.id || "User menu";
    let i18n_aria = it.aria_label || it.name || "User menu";
    let action_type = (it.action && it.action.type) || "";
    let attrs = {
        class: "navbar-item yui-toolbar-item yui-toolbar-avatar is-unselectable",
        type: "button",
        "data-toolbar-item-id": it.id || "",
        "aria-label": aria_key,
        "data-i18n-aria-label": i18n_aria
    };
    if(action_type === "dropdown") {
        attrs["aria-haspopup"] = "menu";
        attrs["aria-expanded"] = "false";
    }
    let tip = it.tooltip || it.aria_label;
    if(tip) {
        attrs.title = tip;
        attrs["data-i18n-title"] = tip;
    }
    let $initials = createElement2(["span", {class: "yui-avatar"}, ""]);
    let $item = createElement2(["button", attrs, [$initials]]);
    if(action_type !== "") {
        $item.addEventListener("click", ev => {
            ev.preventDefault();
            handle_toolbar_action(gobj, it, $item);
        });
    }
    /*  Register and paint once with whatever provider exists today
     *  (host may register it later via yui_shell_set_avatar_provider). */
    priv.avatar_nodes.push($initials);
    paint_avatar(priv, $initials);
    return $item;
}

/*  Read initials from the registered provider (if any) and write them
 *  into a single avatar node.  The provider is a host-supplied callback
 *  () => string; gobj-ui never reaches into localStorage or app attrs. */
function paint_avatar(priv, $node)
{
    let provider = priv && priv.avatar_provider;
    let s = "";
    if(typeof provider === "function") {
        try {
            s = String(provider() || "");
        } catch(e) {
            log_warning(`C_YUI_SHELL: avatar provider threw: ${e}`);
            s = "";
        }
    }
    $node.textContent = s;
}

function refresh_avatars(gobj)
{
    let priv = gobj_read_attr(gobj, "priv");
    if(!priv || !is_array(priv.avatar_nodes)) {
        return;
    }
    for(let $n of priv.avatar_nodes) {
        paint_avatar(priv, $n);
    }
}

/************************************************************
 *  Wire an optional secondary (right-click) action on a
 *  toolbar item.  Same action shape as `action`; used e.g. by
 *  the connection indicator to open a dev panel on right-click.
 ************************************************************/
function attach_context_action(gobj, $item, it)
{
    if(!it || !it.context_action) {
        return;
    }
    $item.addEventListener("contextmenu", ev => {
        ev.preventDefault();
        handle_toolbar_action(
            gobj, {id: it.id, action: it.context_action}, $item
        );
    });
}

/************************************************************
 *  Renderer for type:"connection" — a small status dot that
 *  reflects the backend connection.  The host drives the state
 *  via yui_shell_set_connection_state(shell, bool); the dot
 *  <span> is registered in priv.conn_nodes.  Optional `action`
 *  (left-click) and `context_action` (right-click) are honored.
 ************************************************************/
function build_toolbar_connection_item(gobj, it)
{
    let priv = gobj_read_attr(gobj, "priv");
    let aria_key  = it.aria_label || it.name || it.id || "backend connection";
    let i18n_aria = it.aria_label || it.name || "backend connection";
    let attrs = {
        class: "navbar-item yui-toolbar-item yui-toolbar-conn " +
               "is-unselectable is-disconnected",
        type: "button",
        "data-toolbar-item-id": it.id || "",
        "aria-label": aria_key,
        "data-i18n-aria-label": i18n_aria
    };
    let tip = it.tooltip || it.aria_label;
    if(tip) {
        attrs.title = tip;
        attrs["data-i18n-title"] = tip;
    }
    let $dot  = createElement2(["span", {class: "yui-conn-dot"}, ""]);
    let $item = createElement2(["button", attrs, [$dot]]);
    let action_type = (it.action && it.action.type) || "";
    if(action_type !== "") {
        $item.addEventListener("click", ev => {
            ev.preventDefault();
            handle_toolbar_action(gobj, it, $item);
        });
    }
    attach_context_action(gobj, $item, it);
    priv.conn_nodes.push($item);
    return $item;
}

function find_toolbar_zone(config)
{
    let zones = (config && config.shell && config.shell.zones) || {};
    for(let z in zones) {
        if(zones[z].host === "toolbar") {
            return z;
        }
    }
    return "top";
}

function handle_toolbar_action(gobj, item, $trigger)
{
    let action = (item && item.action) || {};
    switch(action.type) {
        case "navigate":
            if(!empty_string(action.route)) {
                if(gobj_read_attr(gobj, "use_hash")) {
                    let h = route_to_hash(action.route);
                    if(window.location.hash !== h) {
                        window.location.hash = h;   /*  fires hashchange  */
                    } else {
                        /*  Same hash: hashchange won't fire — navigate
                         *  explicitly so a re-click still acts (e.g.
                         *  toggling a redirect:"stay" overlay whose URL
                         *  is already this route).  Mirrors
                         *  ac_nav_clicked. */
                        navigate_to(gobj, action.route);
                    }
                } else {
                    navigate_to(gobj, action.route);
                }
            }
            break;
        case "drawer": {
            let op = action.op || "toggle";
            let menu_id = action.menu_id || null;
            if(op === "open") {
                open_drawer(gobj, menu_id);
            }
            else if(op === "close") {
                close_drawer(gobj, menu_id);
            }
            else {
                toggle_drawer(gobj, menu_id);
            }
            break;
        }
        case "event":
            /*  Publish whatever event name the JSON requested.  The shell
             *  is created with gcflag_no_check_output_events so it acts as
             *  an intermediate that forwards arbitrary user-defined events
             *  without each app having to extend our event_types table. */
            if(!empty_string(action.event)) {
                gobj_publish_event(gobj, action.event, action.kw || {});
            }
            break;
        case "dropdown":
            toggle_toolbar_dropdown(gobj, item, action, $trigger);
            break;
        default:
            log_warning(
                `C_YUI_SHELL: toolbar item '${item.id||"?"}' has no/unknown action.type`
            );
    }
}

/************************************************************
 *  Toolbar dropdown — open/close a panel anchored to the
 *  trigger button.  One dropdown at a time: a second click on
 *  any trigger first closes whatever was open, even if the
 *  trigger differs.
 ************************************************************/
function toggle_toolbar_dropdown(gobj, item, action, $trigger)
{
    let priv = gobj_read_attr(gobj, "priv");
    if(!priv) {
        return;
    }
    let already_open = priv.active_dropdown &&
                       priv.active_dropdown.__yui_trigger__ === $trigger;
    close_toolbar_dropdown(gobj);
    if(already_open) {
        return;
    }
    open_toolbar_dropdown(gobj, item, action, $trigger);
}

function open_toolbar_dropdown(gobj, item, action, $trigger)
{
    let priv = gobj_read_attr(gobj, "priv");
    if(!priv || !priv.layers || !priv.layers.popup) {
        return;
    }

    /*  The panel mounts on priv.layers.popup, a sibling of the shell's
     *  $container, and is (re)built lazily on every open — AFTER the
     *  host's one-time refresh_language($container, t).  So its i18n
     *  text nodes (item names, aria) would never be translated: fine
     *  in English where key == text, broken in any other locale.
     *  The fix is below: when the host has registered a translator
     *  (yui_shell_set_translator), re-apply it to the freshly built
     *  $panel.  Rebuilt per open ⇒ a later language switch is picked
     *  up the next time the dropdown opens. */
    let aria_key = item && (item.aria_label || item.name || item.id) || "Menu";
    let i18n_aria = (item && (item.aria_label || item.name)) || "Menu";
    let $panel = createElement2(["div", {
        class: "yui-toolbar-dropdown-panel",
        role: "menu",
        "aria-label": aria_key,
        "data-i18n-aria-label": i18n_aria,
        "data-toolbar-dropdown-for": (item && item.id) || ""
    }]);

    let raw_items = is_array(action.items) ? action.items : [];
    for(let i = 0; i < raw_items.length; i++) {
        let sub = raw_items[i];
        let $row = build_dropdown_row(gobj, sub, i);
        if(!$row) {
            continue;
        }
        apply_show_on($row, (sub && sub.show_on) || "");
        $panel.appendChild($row);
    }

    /*  Position fixed-anchored to the trigger.  Right-aligned when the
     *  trigger sits in the navbar-end half of the bar (heuristic:
     *  .navbar-end ancestor); otherwise left-aligned.  This keeps the
     *  panel inside the viewport for both burger-side and user-side
     *  triggers without app-level CSS hacks. */
    let rect = $trigger.getBoundingClientRect();
    let style_parts = ["position:fixed",
                       `top:${Math.round(rect.bottom)}px`];
    let in_end = !!$trigger.closest(".navbar-end");
    if(in_end) {
        let right = window.innerWidth - rect.right;
        style_parts.push(`right:${Math.max(0, Math.round(right))}px`);
    } else {
        style_parts.push(`left:${Math.max(0, Math.round(rect.left))}px`);
    }
    $panel.setAttribute("style", style_parts.join(";"));

    priv.layers.popup.appendChild($panel);

    /*  Translate the lazily-built panel (see the note above). */
    if(typeof priv.translator === "function") {
        refresh_language($panel, priv.translator);
    }

    /*  Click-outside (capture-phase mousedown) closes the dropdown.
     *  Capture phase so a click on a sibling toolbar trigger lands
     *  here BEFORE that trigger's own handler runs and reopens us. */
    let backdrop = ev => {
        if($panel.contains(ev.target)) {
            return;
        }
        if($trigger && $trigger.contains(ev.target)) {
            return;     /*  trigger click toggles via its own handler  */
        }
        close_toolbar_dropdown(gobj);
    };
    document.addEventListener("mousedown", backdrop, true);

    /*  Scroll/resize: the panel anchor was frozen at open time from
     *  getBoundingClientRect(); any layout shift drifts it from the
     *  trigger.  Match native <select> UX and dismiss on either.
     *  Capture-phase + passive scroll so we hear all scrollers (any
     *  ancestor, not just window) without blocking them. */
    let dismiss = () => close_toolbar_dropdown(gobj);
    document.addEventListener("scroll", dismiss, {capture: true, passive: true});
    window.addEventListener("resize", dismiss);

    let close_fn = () => close_toolbar_dropdown(gobj);
    $panel.__yui_close_handler__   = close_fn;
    $panel.__yui_backdrop_handler__ = backdrop;
    $panel.__yui_dismiss_handler__  = dismiss;
    $panel.__yui_trigger__          = $trigger || null;
    push_escape(gobj, "popup", close_fn);

    /*  Focus trap inside the panel — same module modals/drawers use. */
    $panel.__yui_focus_release__ = activate_focus_trap_on($panel);

    if($trigger) {
        $trigger.setAttribute("aria-expanded", "true");
    }
    priv.active_dropdown = $panel;
}

function close_toolbar_dropdown(gobj)
{
    let priv = gobj_read_attr(gobj, "priv");
    if(!priv) {
        return;
    }
    let $panel = priv.active_dropdown;
    if(!$panel) {
        return;
    }
    if($panel.__yui_focus_release__) {
        $panel.__yui_focus_release__();
        $panel.__yui_focus_release__ = null;
    }
    if($panel.__yui_close_handler__) {
        pop_escape(gobj, $panel.__yui_close_handler__);
        $panel.__yui_close_handler__ = null;
    }
    if($panel.__yui_backdrop_handler__) {
        document.removeEventListener("mousedown",
                                     $panel.__yui_backdrop_handler__, true);
        $panel.__yui_backdrop_handler__ = null;
    }
    if($panel.__yui_dismiss_handler__) {
        document.removeEventListener("scroll",
                                     $panel.__yui_dismiss_handler__,
                                     {capture: true});
        window.removeEventListener("resize", $panel.__yui_dismiss_handler__);
        $panel.__yui_dismiss_handler__ = null;
    }
    if($panel.__yui_trigger__) {
        $panel.__yui_trigger__.setAttribute("aria-expanded", "false");
        $panel.__yui_trigger__ = null;
    }
    if($panel.parentNode) {
        $panel.parentNode.removeChild($panel);
    }
    priv.active_dropdown = null;
}

function build_dropdown_row(gobj, sub, idx)
{
    if(!sub || typeof sub !== "object") {
        return null;
    }
    if(sub.type === "divider") {
        return createElement2(["div", {
            class: "yui-toolbar-dropdown-divider",
            role: "separator"
        }]);
    }
    if(!sub.action || typeof sub.action !== "object") {
        log_warning(
            `C_YUI_SHELL: dropdown item [${idx}] '${sub.id||"?"}' has no action — skipped`
        );
        return null;
    }
    let children = [];
    if(!empty_string(sub.icon)) {
        children.push(["span", {class: "icon"},
            ["i", {class: sub.icon, "aria-hidden": "true"}]]);
    }
    if(!empty_string(sub.name)) {
        children.push(["span", {class: "yui-toolbar-dropdown-label",
                                i18n: sub.name}, sub.name]);
    }
    let aria_key = sub.aria_label || sub.name || sub.id || "";
    let i18n_aria = sub.aria_label || sub.name;
    let attrs = {
        class: "yui-toolbar-dropdown-item",
        type: "button",
        role: "menuitem",
        "data-dropdown-item-id": sub.id || "",
        "aria-label": aria_key
    };
    if(i18n_aria) {
        attrs["data-i18n-aria-label"] = i18n_aria;
    }
    let $btn = createElement2(["button", attrs, children]);
    $btn.addEventListener("click", ev => {
        ev.preventDefault();
        /*  Close BEFORE dispatching: navigate may rebuild stage,
         *  event may open a modal — either way the dropdown should
         *  not linger on top.  Nested dropdowns are rejected by
         *  validate_dropdown_action so we don't recurse here. */
        close_toolbar_dropdown(gobj);
        handle_toolbar_action(gobj, sub, $btn);
    });
    return $btn;
}

/************************************************************
 *  Create all views whose item declares lifecycle:"eager".
 *  They are mounted hidden; navigate_to() will reveal them.
 ************************************************************/
function preinstantiate_eager_views(gobj)
{
    let priv = gobj_read_attr(gobj, "priv");
    for(let route in priv.item_index) {
        let entry = priv.item_index[route];
        let t = entry.target;
        if(!t || t.lifecycle !== "eager") {
            continue;
        }
        let stage_name = entry.stage || "main";
        let stage = priv.stages[stage_name];
        if(!stage) {
            log_warning(`C_YUI_SHELL: eager view ${route} has no stage '${stage_name}'`);
            continue;
        }
        if(stage.items[route]) {
            continue;          /*  already built */
        }
        let view = build_view_gobj(gobj, entry, route, stage);
        if(!view) {
            continue;
        }
        stage.items[route] = view;
        let $c = gobj_read_attr(view, "$container");
        if($c) {
            $c.classList.add("is-hidden");
        }
    }
}

/************************************************************
 *  Drawer API — toggle/open/close a nav rendered with
 *  layout:"drawer".  menu_id is optional; if omitted, acts on
 *  the first drawer found.
 ************************************************************/
function drawers(gobj, menu_id)
{
    let priv = gobj_read_attr(gobj, "priv");
    let out = [];
    for(let nav of priv.navs) {
        if(gobj_read_attr(nav, "layout") !== "drawer") {
            continue;
        }
        if(menu_id && gobj_read_attr(nav, "menu_id") !== menu_id) {
            continue;
        }
        let $c = gobj_read_attr(nav, "$container");
        if($c) {
            out.push($c);
        }
    }
    return out;
}

/************************************************************
 *  Escape priority chain helpers — push/pop a {layer, handler}
 *  record on `priv.escape_stack`.  Escape calls the top entry
 *  only and consumes the event; LIFO ordering naturally matches
 *  the z-index layering most apps use (drawer at the bottom,
 *  modal on top, popup on top of that).
 ************************************************************/
function push_escape(gobj, layer, handler)
{
    let priv = gobj_read_attr(gobj, "priv");
    if(!priv || !priv.escape_stack) {
        return;
    }
    priv.escape_stack.push({ layer: layer, handler: handler });
}

function pop_escape(gobj, handler)
{
    let priv = gobj_read_attr(gobj, "priv");
    if(!priv || !priv.escape_stack) {
        return;
    }
    let idx = priv.escape_stack.findIndex(e => e.handler === handler);
    if(idx >= 0) {
        priv.escape_stack.splice(idx, 1);
    }
}

/************************************************************
 *  Overlay history integration — Back button ↔ modals/windows.
 *
 *  An overlay that wants the browser Back button to close it (modal,
 *  floating window) registers on open with push_overlay_history and
 *  calls overlay_dismissed when it closes by ANY other path.
 *
 *  On open we push a synthetic history entry that keeps the current
 *  hash, so routing is untouched.  The two close paths converge on the
 *  same overlay_stack, and membership in it disambiguates which one ran:
 *
 *    - Back pressed  → popstate pops the entry and calls entry.close();
 *      the browser already dropped the history entry, so the later
 *      overlay_dismissed finds the entry gone and does nothing.
 *    - X/Escape/code → the overlay's close runs first (entry still on
 *      the stack), overlay_dismissed removes it and history.back()s to
 *      retire the still-present browser entry (that popstate is counted
 *      in expected_pops and ignored).
 *
 *  Gated on `use_hash`: an app that manages its own routing gets no
 *  synthetic entries — a stray history.back() there could exit it.
 ************************************************************/
function push_overlay_history(gobj, close)
{
    let priv = gobj_read_attr(gobj, "priv");
    if(!priv || !priv.overlay_stack || !gobj_read_attr(gobj, "use_hash")) {
        return null;
    }
    let entry = { id: ++priv.overlay_seq, close: close };
    priv.overlay_stack.push(entry);
    try {
        window.history.pushState({ __yui_overlay__: entry.id }, "");
    } catch(e) {
        /*  pushState failed (rare): drop the entry so overlay_dismissed
         *  won't later history.back() past a real route. */
        priv.overlay_stack.pop();
        log_warning(`C_YUI_SHELL: overlay pushState failed: ${e}`);
        return null;
    }
    return entry;
}

function overlay_dismissed(gobj, entry)
{
    let priv = gobj_read_attr(gobj, "priv");
    if(!priv || !priv.overlay_stack || !entry) {
        return;
    }
    let idx = priv.overlay_stack.indexOf(entry);
    if(idx < 0) {
        /*  Already removed by the popstate handler (closed via Back). */
        return;
    }
    priv.overlay_stack.splice(idx, 1);
    /*  Only history.back() when this was the TOP entry: a non-LIFO
     *  dismissal (a lower overlay closed under a higher one) must not
     *  pop past the higher overlay's still-present entry.  Overlays
     *  close LIFO in practice; a non-top one just leaves an inert entry
     *  the next Back will absorb harmlessly. */
    if(idx === priv.overlay_stack.length) {
        priv.expected_pops++;
        try {
            window.history.back();
        } catch(e) {
            priv.expected_pops--;
            log_warning(`C_YUI_SHELL: overlay history.back() failed: ${e}`);
        }
    }
}

/*  Per-drawer open/close.  The escape-stack entry and the focus-
 *  trap release function are parked on the $drawer DOM element so
 *  any close path (Escape, backdrop click, toolbar action, public
 *  yui_shell_close_drawer) tears them down through the same code.
 *
 *  The actual focus-trap is the generic helper from
 *  shell_focus_trap.js — same module modals/popups use. */
function open_drawer_one(gobj, $c)
{
    if($c.classList.contains("is-active")) {
        return;
    }
    let close_fn = () => close_drawer_one(gobj, $c);
    $c.__yui_close_handler__ = close_fn;
    push_escape(gobj, "overlay", close_fn);
    $c.classList.add("is-active");
    let panel = $c.querySelector(".yui-drawer-panel") || $c;
    $c.__yui_focus_release__ = activate_focus_trap_on(panel);
}

function close_drawer_one(gobj, $c)
{
    if(!$c.classList.contains("is-active")) {
        return;
    }
    $c.classList.remove("is-active");
    if($c.__yui_focus_release__) {
        $c.__yui_focus_release__();
        $c.__yui_focus_release__ = null;
    }
    if($c.__yui_close_handler__) {
        pop_escape(gobj, $c.__yui_close_handler__);
        $c.__yui_close_handler__ = null;
    }
}

function open_drawer(gobj, menu_id)
{
    for(let $c of drawers(gobj, menu_id)) {
        open_drawer_one(gobj, $c);
    }
}

function close_drawer(gobj, menu_id)
{
    for(let $c of drawers(gobj, menu_id)) {
        close_drawer_one(gobj, $c);
    }
}

function toggle_drawer(gobj, menu_id)
{
    for(let $c of drawers(gobj, menu_id)) {
        if($c.classList.contains("is-active")) {
            close_drawer_one(gobj, $c);
        } else {
            open_drawer_one(gobj, $c);
        }
    }
}

function close_all_drawers(gobj)
{
    let priv = gobj_read_attr(gobj, "priv");
    if(!priv) {
        return;
    }
    for(let nav of priv.navs) {
        if(gobj_read_attr(nav, "layout") !== "drawer") {
            continue;
        }
        let $c = gobj_read_attr(nav, "$container");
        if(!$c) {
            continue;
        }
        close_drawer_one(gobj, $c);
    }
}

/************************************************************
 *  Render a visible placeholder in a stage (used when we have
 *  nothing to show, e.g. no default route configured).
 ************************************************************/
function show_stage_placeholder(gobj, stage_name, message)
{
    let priv = gobj_read_attr(gobj, "priv");
    let stage = priv.stages[stage_name];
    if(!stage || !stage.el) {
        return;
    }
    clear_stage_placeholder(gobj, stage_name);
    let $msg = createElement2(
        ["div", {class: "yui-shell-placeholder notification is-warning is-light m-4"},
            ["p", {class: "is-size-6"}, message]
        ]
    );
    stage.el.appendChild($msg);
}

function clear_stage_placeholder(gobj, stage_name)
{
    let priv = gobj_read_attr(gobj, "priv");
    let stage = priv.stages[stage_name];
    if(!stage || !stage.el) {
        return;
    }
    let $old = stage.el.querySelector(":scope > .yui-shell-placeholder");
    if($old) {
        $old.parentNode.removeChild($old);
    }
}

function update_secondary_nav_visibility(gobj, entry)
{
    let priv = gobj_read_attr(gobj, "priv");
    /*  shell.routes entries (root, forms, action routes) have no menu
     *  item — entry.item / entry.parent_item are null.  No active
     *  primary then: the secondary zone collapses (has_secondary
     *  below is false), which is correct for a standalone route. */
    let active_primary_id = (entry.parent_item && entry.parent_item.id)
        || (entry.item && entry.item.id)
        || "";
    let owning_menu_id = entry.menu_id || "";
    let target_secondary_id = `secondary.${owning_menu_id}.${active_primary_id}`;

    /*  Does the ACTIVE primary actually have a submenu?  Decided from
     *  the config (the item tree), NOT from whether a secondary nav
     *  gobj has been instantiated — those are created lazily, so on a
     *  route with no submenu (e.g. Monitor) there may be zero
     *  secondary navs and a nav-derived check would never collapse
     *  the zone (empty white strip under the toolbar). */
    let active_primary = entry.parent_item || entry.item || null;

    /*  At the section-index route itself (a level-1 item with
     *  submenu.index) the cards ARE the navigation: showing the tab
     *  strip too would duplicate it (confusing — either tabs or
     *  cards, never both).  Collapse the secondary zone there. */
    let at_section_index = !!(
        !entry.parent_item &&
        active_primary &&
        active_primary.submenu &&
        active_primary.submenu.index
    );

    let has_secondary = !at_section_index && !!(
        active_primary &&
        active_primary.submenu &&
        Array.isArray(active_primary.submenu.items) &&
        active_primary.submenu.items.some(it => it && it.route)
    );

    /*  Collapse every zone that hosts menu.secondary when the active
     *  route has no submenu; reveal them otherwise.  Zone set comes
     *  from the declared config, so it works before any secondary
     *  nav exists. */
    let config = gobj_read_attr(gobj, "config") || {};
    let zones_cfg = (config.shell && config.shell.zones) || {};
    for(let z in zones_cfg) {
        if(zones_cfg[z] && zones_cfg[z].host === "menu.secondary") {
            let $z = priv.zones[z];
            if($z) {
                $z.classList.toggle("is-hidden", !has_secondary);
            }
        }
    }

    for(let nav of priv.navs) {
        let level = gobj_read_attr(nav, "level");
        if(level !== "secondary") {
            continue;
        }
        let nav_menu_id = gobj_read_attr(nav, "menu_id") || "";
        if(!nav_menu_id.startsWith("secondary.")) {
            continue;
        }
        let $c = gobj_read_attr(nav, "$container");
        if(!$c) {
            continue;
        }
        if(nav_menu_id === target_secondary_id && has_secondary) {
            $c.classList.remove("is-hidden");
        } else {
            $c.classList.add("is-hidden");
        }
    }
}




                    /***************************
                     *      Actions
                     ***************************/




/************************************************************
 *  Click-through from a C_YUI_NAV child: we own routing here.
 ************************************************************/
function ac_nav_clicked(gobj, event, kw, src)
{
    let route = (kw && kw.route) || "";
    if(empty_string(route)) {
        return 0;
    }

    /*  When hash routing is on, let the hash drive navigate_to() — that
     *  way back/forward buttons and programmatic hash changes all flow
     *  through the same code path.  Otherwise call navigate_to directly. */
    if(gobj_read_attr(gobj, "use_hash")) {
        let target_hash = route_to_hash(route);
        if(window.location.hash !== target_hash) {
            window.location.hash = target_hash;  /*  fires hashchange */
        } else {
            /*  Same hash: hashchange won't fire — navigate explicitly. */
            navigate_to(gobj, route);
        }
    } else {
        navigate_to(gobj, route);
    }
    return 0;
}

/************************************************************
 *  Drawer backdrop click on a C_YUI_NAV child: the nav publishes
 *  this so the shell can close the drawer through the canonical
 *  flow (DOM + focus-trap + escape-stack pop) instead of mutating
 *  the DOM directly from the nav.
 ************************************************************/
function ac_drawer_close_requested(gobj, event, kw, src)
{
    let menu_id = (kw && kw.menu_id) || "";
    close_drawer(gobj, menu_id);
    return 0;
}

/************************************************************
 *  Close 'x' on a closable tab (from a C_YUI_NAV child).  The
 *  shell does not own the item set — re-publish so the app (which
 *  owns the underlying data, e.g. the selected-nodes list) removes
 *  the item and calls yui_shell_set_submenu() with the new list.
 ************************************************************/
function ac_nav_item_close(gobj, event, kw, src)
{
    gobj_publish_event(gobj, "EV_NAV_ITEM_CLOSE", {
        item_id: (kw && kw.item_id) || "",
        route:   (kw && kw.route) || "",
        menu_id: (kw && kw.menu_id) || "",
        zone:    (kw && kw.zone) || ""
    });
    return 0;
}

/************************************************************
 *  Runtime nav API (Yuneta philosophy: the app_config path is the
 *  first, startup caller of the very same machinery — build_item_index
 *  + instantiate + set items; this is its dynamic counterpart).
 *
 *  yui_shell_set_submenu(shell, parent_item_id, items) replaces the
 *  items of a primary item's submenu (its secondary nav) at runtime
 *  and re-registers their routes so navigation resolves.  Item
 *  descriptors may carry { id, name, icon, route, class, closable,
 *  target:{stage,gclass,kw,lifecycle} }.  Routes present before but
 *  absent now are pruned (index entry removed, mounted view destroyed).
 ************************************************************/
function find_secondary_nav(priv, parent_item_id)
{
    let suffix = "." + parent_item_id;
    for(let nav of priv.navs) {
        let menu_id = gobj_read_attr(nav, "menu_id") || "";
        if(menu_id.startsWith("secondary.") && menu_id.endsWith(suffix)) {
            /*  A backbar shares the menu_id but renders no items —
             *  EV_SET_ITEMS must reach the item-based nav. */
            if(gobj_read_attr(nav, "layout") === "backbar") {
                continue;
            }
            return nav;
        }
    }
    return null;
}

function find_primary_item(shell_gobj, menu_id, item_id)
{
    let config = gobj_read_attr(shell_gobj, "config") || {};
    let menu = (config.menu && config.menu[menu_id]) || null;
    if(menu && is_array(menu.items)) {
        for(let it of menu.items) {
            if(it && it.id === item_id) {
                return it;
            }
        }
    }
    return null;
}

/*  Drop a route from the index and destroy any mounted view for it. */
function prune_route(shell_gobj, route)
{
    let priv = gobj_read_attr(shell_gobj, "priv");
    delete priv.item_index[route];
    for(let stage_name in priv.stages) {
        let stage = priv.stages[stage_name];
        let view = stage.items && stage.items[route];
        if(!view) {
            continue;
        }
        let $c = gobj_read_attr(view, "$container");
        if($c) {
            $c.classList.add("is-hidden");
        }
        try {
            gobj_stop(view);
            gobj_destroy(view);
        } catch(e) {
            log_warning(`C_YUI_SHELL: prune_route destroy '${route}' failed: ${e}`);
        }
        delete stage.items[route];
        if(stage.active_route === route) {
            stage.active_route = "";
        }
    }
}

function yui_shell_set_submenu(shell_gobj, parent_item_id, items)
{
    let priv = gobj_read_attr(shell_gobj, "priv");
    if(!priv) {
        return -1;
    }
    let nav = find_secondary_nav(priv, parent_item_id);
    if(!nav) {
        log_warning(
            `C_YUI_SHELL: yui_shell_set_submenu — no secondary nav for '${parent_item_id}'`
        );
        return -1;
    }
    items = is_array(items) ? items : [];

    /*  Resolve owning menu_id + primary item from the nav's synthesized
     *  id "secondary.<menu_id>.<parent_item_id>", so registered routes
     *  highlight correctly and keep this secondary nav visible. */
    let nav_menu_id = gobj_read_attr(nav, "menu_id") || "";
    let m = /^secondary\.(.+)\.([^.]+)$/.exec(nav_menu_id);
    let owning_menu_id = m ? m[1] : "";
    let parent_item = find_primary_item(shell_gobj, owning_menu_id, parent_item_id);

    /*  Track the routes THIS submenu owns dynamically, so we only prune
     *  our own previous routes — never the static config routes (e.g. a
     *  base "/console/agent" landing declared in app_config).  */
    priv.dynamic_routes = priv.dynamic_routes || {};
    let prev_routes = priv.dynamic_routes[parent_item_id] || [];
    let new_routes = [];
    let new_set = {};
    for(let it of items) {
        if(it && it.route) {
            new_routes.push(it.route);
            new_set[it.route] = true;
        }
    }
    for(let route of prev_routes) {
        if(!new_set[route]) {
            prune_route(shell_gobj, route);
        }
    }

    /*  Register / refresh routes for the new items. */
    for(let it of items) {
        if(!it || !it.route) {
            continue;
        }
        priv.item_index[it.route] = {
            item: it,
            parent_item: parent_item,
            stage: (it.target && it.target.stage) || null,
            target: it.target || null,
            menu_id: owning_menu_id
        };
    }
    priv.dynamic_routes[parent_item_id] = new_routes;

    /*  Push the new items into the nav (rebuilds its DOM in place). */
    gobj_send_event(nav, "EV_SET_ITEMS", {items: items}, shell_gobj);

    /*  Section-index landing (submenu.index): keep the synthesized
     *  target and any mounted index view (a "cards" C_YUI_NAV in the
     *  stage) in sync with the new items — otherwise a later mount,
     *  or the already mounted view, would render the stale set. */
    if(parent_item && parent_item.route &&
            parent_item.submenu && parent_item.submenu.index) {
        let entry = priv.item_index[parent_item.route];
        if(entry && entry.target &&
                entry.target.gclass === "C_YUI_NAV" && entry.target.kw) {
            entry.target.kw.menu_items = items;
        }
        for(let stage_name in priv.stages) {
            let stage = priv.stages[stage_name];
            let view = stage.items && stage.items[parent_item.route];
            if(view) {
                gobj_send_event(view, "EV_SET_ITEMS", {items: items}, shell_gobj);
                /*  EV_SET_ITEMS rebuilt the DOM: re-apply the translator
                 *  (shell-owned DOM, same policy as build_view_gobj). */
                let $view = gobj_read_attr(view, "$container");
                if($view && typeof priv.translator === "function") {
                    refresh_language($view, priv.translator);
                }
            }
        }
    }
    return 0;
}

/***************************************************************
 *              FSM
 ***************************************************************/
/*---------------------------------------------*
 *          Global methods table
 *---------------------------------------------*/
const gmt = {
    mt_create:  mt_create,
    mt_start:   mt_start,
    mt_stop:    mt_stop,
    mt_destroy: mt_destroy
};

function create_gclass(gclass_name)
{
    if(__gclass__) {
        log_error(`GClass ALREADY created: ${gclass_name}`);
        return -1;
    }

    const states = [
        ["ST_IDLE", [
            /*  Navigation requests flow through EV_NAV_CLICKED (emitted
             *  by child C_YUI_NAVs) and through the window.hashchange
             *  listener (see mt_start).  The shell is the sole router.  */
            ["EV_NAV_CLICKED",            ac_nav_clicked,            null],
            /*  Drawer backdrop close (from a C_YUI_NAV child whose
             *  layout is "drawer"). */
            ["EV_DRAWER_CLOSE_REQUESTED", ac_drawer_close_requested, null],
            /*  Close 'x' on a closable tab (from a child C_YUI_NAV);
             *  re-published for the app. */
            ["EV_NAV_ITEM_CLOSE",         ac_nav_item_close,         null]
        ]]
    ];

    const event_types = [
        ["EV_NAV_CLICKED",            0],
        ["EV_DRAWER_CLOSE_REQUESTED", 0],
        ["EV_NAV_ITEM_CLOSE",         event_flag_t.EVF_OUTPUT_EVENT
                                     |event_flag_t.EVF_PUBLIC_EVENT
                                     |event_flag_t.EVF_NO_WARN_SUBS],
        /*  Audit witness: every navigation attempt publishes this BEFORE
         *  any work is done, so the FSM trace records intent regardless
         *  of whether the route resolves successfully.  Pairs with
         *  EV_ROUTE_CHANGED (the corresponding fact event). */
        ["EV_ROUTE_REQUESTED",        event_flag_t.EVF_OUTPUT_EVENT
                                     |event_flag_t.EVF_PUBLIC_EVENT
                                     |event_flag_t.EVF_NO_WARN_SUBS],
        ["EV_ROUTE_CHANGED",          event_flag_t.EVF_OUTPUT_EVENT
                                     |event_flag_t.EVF_PUBLIC_EVENT
                                     |event_flag_t.EVF_NO_WARN_SUBS],

        /*  The language changed (the app switched it and called
         *  yui_shell_language_changed).  refresh_language() re-translates
         *  every node that CARRIES its key, but a view that COMPOSED a string
         *  with t() at render time — a title, a row counter, a Tabulator
         *  header or paginator — holds no key and cannot be reached that way.
         *  So the fact is published: such a view subscribes to its shell and
         *  re-renders its own translated parts.  */
        ["EV_LANGUAGE_CHANGED",       event_flag_t.EVF_OUTPUT_EVENT
                                     |event_flag_t.EVF_PUBLIC_EVENT
                                     |event_flag_t.EVF_NO_WARN_SUBS]
    ];

    __gclass__ = gclass_create(
        gclass_name,
        event_types,
        states,
        gmt,
        0,                          /* lmt */
        attrs_table,
        PRIVATE_DATA,
        0,                          /* authz_table */
        0,                          /* command_table */
        0,                          /* s_user_trace_level */
        gclass_flag_t.gcflag_no_check_output_events
    );
    if(!__gclass__) {
        return -1;
    }
    return 0;
}

function register_c_yui_shell()
{
    return create_gclass(GCLASS_NAME);
}

/***************************************************************
 *  Public helpers — exported alongside register_c_yui_shell().
 *  Not gclass methods, no banner needed; left grouped at the
 *  bottom of the file to keep the skeleton layout intact.
 ***************************************************************/

/************************************************************
 *  Resolve the shell that governs `gobj`: the nearest
 *  C_YUI_SHELL ancestor, else the last shell created on the
 *  page (apps have exactly one).  Null when no shell exists —
 *  callers must degrade loudly (shell_modals logs a warning
 *  and resolves the safe default).
 ************************************************************/
function yui_shell_of(gobj)
{
    let g = gobj;
    while(g) {
        if(gobj_gclass_name(g) === GCLASS_NAME) {
            return g;
        }
        g = gobj_parent(g);
    }
    return __last_shell__;
}

/************************************************************
 *  Programmatic navigation.
 *
 *  `opts.push:true` — the user MOVED somewhere new: change the URL via
 *  the hash so the browser records a Back entry (routed through the same
 *  hashchange path as a nav click). Use for genuine navigations
 *  (selecting a tab/topic, opening a section) so Back/Forward traverse
 *  them.
 *
 *  Default (no opts / `opts.replace`) — REPLACE: sync the URL without a
 *  Back entry. Use for redirects, normalizations and F5-restores. This
 *  is the historical behaviour, so existing callers are unchanged; new
 *  code should be explicit (see ROUTING.md §2/§7).
 ************************************************************/
function yui_shell_navigate(shell_gobj, route, opts)
{
    if(opts && opts.push && gobj_read_attr(shell_gobj, "use_hash")) {
        let target_hash = route_to_hash(route);
        if(window.location.hash !== target_hash) {
            /*  Push a real history entry; the hashchange handler mounts. */
            window.location.hash = target_hash;
            return;
        }
        /*  Same hash — hashchange won't fire; fall through to mount. */
    }
    navigate_to(shell_gobj, route);
}

/************************************************************
 *  One node of the nav map from a declared config item, in
 *  DECLARATION ORDER (never sorted). Recurses into static submenus
 *  and toolbar dropdowns, and merges the LIVE dynamic submenu tabs
 *  (added at runtime via yui_shell_set_submenu) by parent id.
 ************************************************************/
function nav_node_from_item(it, index)
{
    if(!it || it.type === "divider" || it.type === "header") {
        return null;
    }
    let action = it.action || {};
    let route = it.route ||
        (action.type === "navigate" ? action.route : "") || "";
    let event = (action.type === "event") ? action.event : "";
    let node = {
        id:       it.id || "",
        label:    it.name || it.wordmark || it.id || route || "",
        icon:     it.icon || "",
        route:    route,
        event:    event,
        kind:     it.type || (route ? "route" : (event ? "action" :
                  (action.type || "item"))),
        children: []
    };

    /*  Static submenu (declared) and toolbar dropdown (the account menu). */
    let sub_items = (it.submenu && Array.isArray(it.submenu.items)) ?
        it.submenu.items :
        ((action.type === "dropdown" && Array.isArray(action.items)) ?
            action.items : null);
    if(sub_items) {
        for(let s of sub_items) {
            let n = nav_node_from_item(s, index);
            if(n) {
                node.children.push(n);
            }
        }
    }

    /*  Live dynamic submenu children (runtime tabs) — item_index entries
     *  whose parent is this item, in item_index (insertion) order, minus
     *  any already added statically. */
    if(it.id && index) {
        for(let r of Object.keys(index)) {
            let e = index[r];
            if(e && e.parent_item && e.parent_item.id === it.id &&
                    !node.children.some((c) => c.route === r)) {
                node.children.push({
                    id:       (e.item && e.item.id) || "",
                    label:    (e.item && e.item.name) || r,
                    icon:     (e.item && e.item.icon) || "",
                    route:    r,
                    event:    "",
                    kind:     "route",
                    children: []
                });
            }
        }
    }
    return node;
}

/************************************************************
 *  Nav map — the WHOLE navigation surface as an ordered tree, for a
 *  "site map" / documentation viewer: the toolbar (incl. the account
 *  dropdown) and the primary menu (incl. live dynamic tabs), in
 *  declaration order (never alphabetised). Returns:
 *      { brand:{label,route}, toolbar:[node…], nav:[node…] }
 *  where a node is {id,label,icon,route,event,kind,children[]}.
 *  `route` is a navigable hash (or ""); `event` is the action it
 *  fires. NOTE: view-owned deep levels (a topic, /info, /schema) are
 *  subpaths a view owns, not declared routes, so they are not listed
 *  — this is the navigable skeleton.
 ************************************************************/
function yui_shell_nav_map(shell_gobj)
{
    let priv = gobj_read_attr(shell_gobj, "priv");
    let index = (priv && priv.item_index) || {};
    let config = gobj_read_attr(shell_gobj, "config") || {};

    let brand = {label: "", route: ""};
    let toolbar = [];
    let tb = config.toolbar && Array.isArray(config.toolbar.items) ?
        config.toolbar.items : [];
    for(let it of tb) {
        if(it && it.type === "brand") {
            let a = it.action || {};
            brand = {
                label: it.wordmark || it.alt || it.id || "",
                route: it.route || (a.type === "navigate" ? a.route : "") || ""
            };
            continue;
        }
        let n = nav_node_from_item(it, index);
        if(n) {
            toolbar.push(n);
        }
    }

    let nav = [];
    let prim = config.menu && config.menu.primary &&
        Array.isArray(config.menu.primary.items) ?
        config.menu.primary.items : [];
    for(let it of prim) {
        let n = nav_node_from_item(it, index);
        if(n) {
            nav.push(n);
        }
    }

    return {brand: brand, toolbar: toolbar, nav: nav};
}

/*  Drawer helpers — toggle the off-canvas nav from the outside
 *  (e.g. a hamburger button in the toolbar).  menu_id is optional. */
function yui_shell_open_drawer(shell_gobj, menu_id)    { open_drawer(shell_gobj, menu_id);   }
function yui_shell_close_drawer(shell_gobj, menu_id)   { close_drawer(shell_gobj, menu_id);  }
function yui_shell_toggle_drawer(shell_gobj, menu_id)  { toggle_drawer(shell_gobj, menu_id); }

/*  Escape priority chain — public API used by overlays that the
 *  shell does not own (modals from #4, future popups, custom
 *  app-level overlays).  Drawer integration is built in.
 *
 *      let close_fn = () => my_modal.close();
 *      yui_shell_push_escape(shell, "modal", close_fn);
 *      // ... when the modal closes by any path, also call:
 *      yui_shell_pop_escape(shell, close_fn);
 *
 *  `layer` is a free-form tag (e.g. "modal", "popup", "overlay").
 *  Today it is informational; the LIFO ordering of the stack is
 *  what determines Escape priority — and naturally matches the
 *  z-index layering most apps use (drawer < popup < modal). */
function yui_shell_push_escape(shell_gobj, layer, handler)
{
    push_escape(shell_gobj, layer, handler);
}
function yui_shell_pop_escape(shell_gobj, handler)
{
    pop_escape(shell_gobj, handler);
}

/*  Overlay history integration — public API for overlays the shell does
 *  not own (modals from shell_modals.js, floating C_YUI_WINDOW popups).
 *
 *      let overlay = yui_shell_register_overlay(shell, close_fn);
 *      // ... when the overlay closes by ANY non-Back path, also call:
 *      yui_shell_overlay_dismissed(shell, overlay);
 *
 *  `close_fn` is what the Back button invokes to tear the overlay down.
 *  Returns null when history integration is off (no shell / use_hash) —
 *  callers just skip the paired yui_shell_overlay_dismissed then. */
function yui_shell_register_overlay(shell_gobj, close_fn)
{
    return push_overlay_history(shell_gobj, close_fn);
}
function yui_shell_overlay_dismissed(shell_gobj, overlay)
{
    overlay_dismissed(shell_gobj, overlay);
}

/************************************************************
 *  Avatar provider — toolbar items with type:"avatar" call the
 *  registered provider whenever the shell paints initials.  The
 *  provider is a free-form () => string callback owned by the
 *  host (wattyzer/hidraulia/estadodelaire), so gobj-ui never
 *  reaches into localStorage or app-specific attrs.  Setting the
 *  provider repaints existing avatars in-place; calling
 *  yui_shell_refresh_avatars() repaints without changing the
 *  provider (e.g. after the user updates their profile name).
 ************************************************************/
function yui_shell_set_avatar_provider(shell_gobj, provider)
{
    let priv = gobj_read_attr(shell_gobj, "priv");
    if(!priv) {
        return;
    }
    priv.avatar_provider = (typeof provider === "function") ? provider : null;
    refresh_avatars(shell_gobj);
}

function yui_shell_refresh_avatars(shell_gobj)
{
    refresh_avatars(shell_gobj);
}

/************************************************************
 *  Register the host's i18n translator (a t-function:
 *  key => translated string).  The host still translates the
 *  static shell tree itself via refresh_language($container, t);
 *  this is only so the shell can translate DOM it builds LAZILY
 *  and OUTSIDE $container — today the toolbar dropdown panel.
 *  Optional: with no translator the panel renders raw keys
 *  (the previous behaviour).
 ************************************************************/
function yui_shell_set_translator(shell_gobj, t)
{
    let priv = gobj_read_attr(shell_gobj, "priv");
    if(!priv) {
        return;
    }
    priv.translator = (typeof t === "function") ? t : null;
}

/************************************************************
 *  The app switched the language: re-translate the whole document (every
 *  node carrying data-i18n / data-i18n-title / data-i18n-aria-label) and
 *  PUBLISH the fact, so the views that build DOM imperatively — Tabulator
 *  headers and paginators, composed titles, row counters — can re-render
 *  what no attribute can reach.
 *
 *  The app remains the owner of the locales: it switches its i18next and
 *  calls this. The shell only fans the fact out.
 ************************************************************/
function yui_shell_language_changed(shell_gobj)
{
    if(!shell_gobj || !is_gobj(shell_gobj)) {
        return;
    }
    let priv = gobj_read_attr(shell_gobj, "priv");
    if(priv && typeof priv.translator === "function") {
        refresh_language(document.body, priv.translator);
    }
    gobj_publish_event(shell_gobj, "EV_LANGUAGE_CHANGED", {});
}

/************************************************************
 *  Set the backend-connection state painted by every
 *  type:"connection" toolbar item.  Host/event-driven: the
 *  app calls this from its transport handlers (EV_ON_OPEN →
 *  true, EV_ON_CLOSE / errors → false).  Toggles the
 *  is-connected / is-disconnected classes; CSS owns the look.
 ************************************************************/
function yui_shell_set_connection_state(shell_gobj, connected)
{
    let priv = gobj_read_attr(shell_gobj, "priv");
    if(!priv || !is_array(priv.conn_nodes)) {
        return;
    }
    let on = !!connected;
    for(let $n of priv.conn_nodes) {
        $n.classList.toggle("is-connected", on);
        $n.classList.toggle("is-disconnected", !on);
    }
}

/************************************************************
 *  Swap the icon of a toolbar item at runtime (host-driven,
 *  like the avatar/connection helpers).  Used e.g. for a
 *  theme toggle that shows a sun in light / moon in dark.
 *  `icon_class` fully replaces the <i> class.
 ************************************************************/
function yui_shell_set_toolbar_item_icon(shell_gobj, item_id, icon_class)
{
    let $container = gobj_read_attr(shell_gobj, "$container");
    if(!$container || empty_string(item_id) || empty_string(icon_class)) {
        return;
    }
    let $i = $container.querySelector(
        `[data-toolbar-item-id="${item_id}"] .icon i`
    );
    if($i) {
        $i.className = icon_class;
    }
}

/************************************************************
 *  Programmatic close of any open toolbar dropdown.  Useful for
 *  external triggers (e.g. EV_LOGOUT firing from elsewhere) that
 *  want to dismiss whatever menu is on screen.
 ************************************************************/
function yui_shell_close_dropdown(shell_gobj)
{
    close_toolbar_dropdown(shell_gobj);
}

/*  Note: there is no shell-level language switch helper.  Every
 *  translatable text node rendered by the shell and its navs is
 *  tagged with `data-i18n` (the canonical English key).  Apps swap
 *  language by calling
 *      refresh_language(shell_$container, t)
 *  from `@yuneta/gobj-js`, exactly like `c_yui_main.js` does in
 *  `change_language()`.  The shell does not own that flow — with
 *  one exception: DOM the shell builds LAZILY and OUTSIDE
 *  $container (the toolbar dropdown panel) is unreachable by that
 *  call, so the app registers its translator via
 *  yui_shell_set_translator() and the shell re-applies it per
 *  panel build. */

export {
    register_c_yui_shell,
    yui_shell_of,
    yui_shell_navigate,
    yui_shell_nav_map,
    yui_shell_open_drawer,
    yui_shell_close_drawer,
    yui_shell_toggle_drawer,
    yui_shell_push_escape,
    yui_shell_pop_escape,
    yui_shell_register_overlay,
    yui_shell_overlay_dismissed,
    yui_shell_set_avatar_provider,
    yui_shell_refresh_avatars,
    yui_shell_set_translator,
    yui_shell_language_changed,
    yui_shell_set_connection_state,
    yui_shell_set_toolbar_item_icon,
    yui_shell_close_dropdown,
    yui_shell_set_submenu
};
