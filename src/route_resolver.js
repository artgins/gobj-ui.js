/***********************************************************************
 *          route_resolver.js
 *
 *          Pure route resolver for C_YUI_SHELL (no gobj, no DOM,
 *          no imports) — kept apart so it is trivially unit-testable.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/

/************************************************************
 *  resolve_route — given the route table (`item_index`) and a
 *  requested route, return { entry, matched_route, subpath }:
 *
 *   - exact hit with a target          → that entry, subpath "".
 *   - no exact target → walk ancestors (`/a/b/c` → `/a/b`),
 *     return the nearest ancestor that HAS a target plus the
 *     trailing `subpath` ("c", or "b/c"); lets a declared view
 *     own a deeper, dynamic, deep-linkable level without
 *     declaring runtime-only segments in app_config.
 *   - root `/` is NEVER an ancestor catch-all (it only matches
 *     exactly): otherwise every typo route would silently mount
 *     the home view and the unknown-route diagnostic would die.
 *   - nothing matched                  → entry as found (may be
 *     null or a targetless submenu parent), subpath "".
 ************************************************************/
/************************************************************
 *  normalize_route — canonical form of a route: leading "/",
 *  duplicate slashes collapsed, trailing slashes stripped
 *  (root "/" stays "/").  Routes arrive from the outside
 *  world (typed URLs, shared links, old bookmarks): "#/a/b/"
 *  must resolve like "#/a/b" instead of missing the index
 *  and falling into the unknown-route redirect.
 ************************************************************/
function normalize_route(route)
{
    if(!route) {
        return "";
    }
    let s = String(route).replace(/\/{2,}/g, "/");
    if(s.charAt(0) !== "/") {
        s = "/" + s;
    }
    if(s.length > 1) {
        s = s.replace(/\/+$/, "");
    }
    return s;
}

function resolve_route(item_index, route)
{
    let entry = item_index[route];
    let matched_route = route;
    let subpath = "";

    if(!entry || !entry.target) {
        let parts = route.split("/").filter(s => s.length > 0);
        while(parts.length > 0 && (!entry || !entry.target)) {
            parts.pop();
            let cand = "/" + parts.join("/");
            if(cand === "/") {
                break;
            }
            let e = item_index[cand];
            if(e && e.target) {
                entry = e;
                matched_route = cand;
                subpath = route.slice(cand.length).replace(/^\/+/, "");
            }
        }
    }

    return { entry: entry, matched_route: matched_route, subpath: subpath };
}

export { resolve_route, normalize_route };
