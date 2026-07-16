/***********************************************************************
 *          route_map_model.js
 *
 *          Pure nav-map builder for C_YUI_SHELL's site map (no gobj,
 *          no DOM, no imports) — kept apart so it is trivially
 *          unit-testable, like route_resolver.js.
 *
 *          build_nav_map() turns the shell's declarative surface into
 *          an ordered tree for the site-map viewer / documentation:
 *          toolbar (incl. the account dropdown), EVERY declared menu
 *          (incl. live dynamic tabs), each mounted view's contributed
 *          sub-routes, and the routes declared ONLY in the route table
 *          (config.shell.routes) that no menu item points at — so the
 *          map really is the WHOLE navigation surface, and an orphan
 *          route is visible instead of silently unreachable.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/

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
    /*  Where it is implemented: the view GClass mounted at this route
     *  (and, for an action route, the event it fires) — from item_index. */
    let gclass = "";
    if(route && index[route] && index[route].target) {
        let tgt = index[route].target;
        gclass = tgt.gclass || "";
        if(!event && tgt.kind === "action" && tgt.event) {
            event = tgt.event;
        }
    }
    let node = {
        id:       it.id || "",
        label:    it.name || it.wordmark || it.id || route || "",
        icon:     it.icon || "",
        route:    route,
        event:    event,
        gclass:   gclass,
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
                    gclass:   (e.target && e.target.gclass) || "",
                    kind:     "route",
                    children: []
                });
            }
        }
    }
    return node;
}

/************************************************************
 *  Deep-copy contributed sub-route nodes.
 *
 *  yui_shell_set_sub_routes() stores the CALLER's array by
 *  reference — those objects belong to the mounted view and
 *  outlive this build.  Splicing them into the tree as-is made
 *  build_nav_map() a mutator of its own input: mark_current()
 *  stamped `current: true` on a view-owned object and nothing
 *  ever cleared it, so every later build kept the stale mark and
 *  the map grew a second "you are here" per visited sub-route.
 ************************************************************/
function clone_nodes(nodes)
{
    let out = [];
    for(let n of nodes) {
        if(!n) {
            continue;
        }
        let c = Object.assign({}, n);
        c.children = Array.isArray(n.children) ? clone_nodes(n.children) : [];
        delete c.current;
        out.push(c);
    }
    return out;
}

/************************************************************
 *  Collect every route reachable from the given nodes (recursing
 *  into children, sub-route contributions included).
 ************************************************************/
function collect_routes(nodes, into)
{
    for(let n of nodes) {
        if(!n) {
            continue;
        }
        if(n.route) {
            into[n.route] = true;
        }
        if(Array.isArray(n.children) && n.children.length) {
            collect_routes(n.children, into);
        }
    }
}

/************************************************************
 *  Mark "you are here": the node whose route best matches
 *  current_route — exact hit wins, else the LONGEST declared
 *  route that is a path-prefix of it (the base view of a deep
 *  subpath position).  At most one node is marked.
 ************************************************************/
function mark_current(groups, current_route)
{
    if(!current_route) {
        return;
    }
    let best = null;
    let visit = (n) => {
        if(n.route) {
            if(n.route === current_route) {
                if(!best || best.node.route !== current_route) {
                    best = {node: n, len: n.route.length};
                }
            } else if(current_route.startsWith(n.route + "/") &&
                    (!best || (best.node.route !== current_route &&
                               n.route.length > best.len))) {
                best = {node: n, len: n.route.length};
            }
        }
        if(Array.isArray(n.children)) {
            n.children.forEach(visit);
        }
    };
    for(let g of groups) {
        g.forEach(visit);
    }
    if(best) {
        best.node.current = true;
    }
}

/************************************************************
 *  build_nav_map({config, item_index, sub_routes, event_handlers,
 *                 current_route}) →
 *      { brand:{label,route,current?}, toolbar:[node…], nav:[node…],
 *        other:[node…] }
 *  where a node is {id,label,icon,route,event,gclass,kind,
 *  children[], current?}.  `route` is a navigable hash (or "");
 *  `event` is the action it fires; `gclass` is the view GClass
 *  mounted at that route or the self-declared handler(s) of the
 *  event (where it is implemented).
 *
 *  - `nav` walks EVERY declared menu in declaration order: the
 *    `primary` menu contributes its items flat (the common case);
 *    any other menu contributes a group node labelled by its key.
 *  - `other` lists the routes declared only in the route table
 *    (config.shell.routes) that no rendered node covers — root "/",
 *    URL-only action routes, toolbar-less forms.  Brand-covered
 *    and menu-covered routes are excluded.
 *  - the node whose route best matches `current_route` is marked
 *    `current: true` ("you are here") — the brand included, since it
 *    renders as the tree's root row.
 *
 *  PURE: the returned tree is built fresh every call, contributed
 *  sub-route nodes included (they are cloned, never spliced in by
 *  reference — see clone_nodes).  Nothing the caller passed in is
 *  mutated, so repeated builds cannot accumulate state.
 ************************************************************/
function build_nav_map(input)
{
    let config = (input && input.config) || {};
    let index = (input && input.item_index) || {};
    let sub = (input && input.sub_routes) || {};
    let handlers = (input && input.event_handlers) || {};
    let current_route = (input && input.current_route) || "";

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

    /*  Every declared menu, in declaration order.  `primary` stays flat
     *  (backwards-compatible single-menu shape); any additional menu is
     *  wrapped in a group node so its origin stays visible. */
    let nav = [];
    let menus = config.menu || {};
    for(let menu_id of Object.keys(menus)) {
        let m = menus[menu_id];
        if(!m || !Array.isArray(m.items)) {
            continue;
        }
        let nodes = [];
        for(let it of m.items) {
            let n = nav_node_from_item(it, index);
            if(n) {
                nodes.push(n);
            }
        }
        if(menu_id === "primary") {
            nav = nav.concat(nodes);
        } else if(nodes.length) {
            nav.push({
                id: menu_id, label: menu_id, icon: "", route: "", event: "",
                gclass: "", kind: "group", children: nodes
            });
        }
    }

    /*  Enrich the tree: merge each mounted view's declared sub-routes into
     *  its base-route node, and stamp the handler gclass on action-event
     *  nodes (where the action is implemented). */
    let enrich = (node) => {
        if(node.route && Array.isArray(sub[node.route]) && sub[node.route].length) {
            node.children = (node.children || []).concat(
                clone_nodes(sub[node.route]));
        }
        if(node.event && !node.gclass &&
                Array.isArray(handlers[node.event]) && handlers[node.event].length) {
            node.gclass = handlers[node.event].join(", ");
        }
        if(Array.isArray(node.children)) {
            node.children.forEach(enrich);
        }
    };
    toolbar.forEach(enrich);
    nav.forEach(enrich);

    /*  Routes declared in the index that no rendered node covers —
     *  root "/", route-table-only action routes, toolbar-less forms.
     *  Declaration (insertion) order, like everything else. */
    let covered = {};
    if(brand.route) {
        covered[brand.route] = true;
    }
    collect_routes(toolbar, covered);
    collect_routes(nav, covered);
    let other = [];
    for(let r of Object.keys(index)) {
        if(covered[r]) {
            continue;
        }
        let e = index[r];
        let tgt = (e && e.target) || null;
        other.push({
            id:       (e && e.item && e.item.id) || "",
            label:    (e && e.item && (e.item.name || e.item.id)) || r,
            icon:     (e && e.item && e.item.icon) || "",
            route:    r,
            event:    (tgt && tgt.kind === "action" && tgt.event) || "",
            gclass:   (tgt && tgt.gclass) || "",
            kind:     (tgt && tgt.kind === "action") ? "action-route" : "route",
            children: []
        });
    }
    other.forEach(enrich);

    /*  The brand is rendered as the tree's ROOT row (shell_route_map),
     *  so it is markable like any other route — and it is the only
     *  rendered node in neither group, which left an app whose brand
     *  routes home unable to show "you are here" at all.  Marked LAST:
     *  a menu item declaring the same route is the more useful hit, and
     *  the first exact match wins.                                      */
    mark_current([toolbar, nav, other, [brand]], current_route);

    return {brand: brand, toolbar: toolbar, nav: nav, other: other};
}

export { build_nav_map };
