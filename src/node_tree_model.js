/***********************************************************************
 *          node_tree_model.js
 *
 *          Pure helpers for C_YUI_NODE (no gobj, no DOM, no imports) —
 *          kept apart so they are trivially unit-testable, like
 *          route_resolver.js and route_map_model.js.
 *
 *          The model: a navigable position is a NODE, nodes form a
 *          TREE, and the URL is the path of node ids from the tree's
 *          base route down.  A node holds HOW IT WANTS ITS CHILDREN
 *          SEEN (the projection) — so "two levels of menu" stops being
 *          a concept: there is only a parent projecting its children,
 *          recursively, at any depth.
 *
 *          Where the STRUCTURAL tree ends, a node declares a `link`:
 *          a pointer into a data space (a timeranger — millions of raw
 *          records, series/time, key/value) plus the viewer suited to
 *          that shape.  Below a link there are no more nodes: the URL
 *          keeps going, but its tail belongs to the viewer.  That is
 *          the scale boundary — one gobj per structural node is right,
 *          one gobj per meter reading is not.
 *
 *          Validation lives HERE (normalize_spec), once, at the door;
 *          every other helper assumes it received validated data, so
 *          it never has to decide what to do with garbage in silence.
 *          Diagnostics are RETURNED (this file cannot log — it has no
 *          imports by design); C_YUI_NODE logs them.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/

/*  The layouts C_YUI_NAV can render a projection with.  Kept in sync
 *  with SUPPORTED_LAYOUTS in c_yui_nav.js — a projection is just a nav
 *  render config, so an unknown layout is a config error here rather
 *  than a fallback surprise three levels deep in the tree. */
const VALID_LAYOUTS = [
    "vertical", "icon-bar", "tabs", "drawer", "submenu", "accordion", "cards",
    "backbar"
];

/*  A node with no declared projection shows its children as cards: the
 *  drill-down landing is the shape this whole model exists to serve. */
const DEFAULT_INDEX_RENDER = {layout: "cards"};

/************************************************************
 *  "a/b/c" → ["a","b","c"].  Empty segments are dropped, so
 *  a subpath arriving as "/a//b/" behaves like "a/b" (the
 *  shell normalizes routes, but a subpath is a tail it slices
 *  out and a caller may build one by hand).
 ************************************************************/
export function split_subpath(subpath)
{
    if(!subpath) {
        return [];
    }
    return String(subpath).split("/").filter((s) => s.length > 0);
}

/************************************************************
 *  First segment + the rest: {head, tail}.  This is the whole
 *  of how a node decides "is this for me, or for a child?" —
 *  head names the child, tail is that child's own subpath.
 ************************************************************/
export function head_tail(subpath)
{
    let segs = split_subpath(subpath);
    if(segs.length === 0) {
        return {head: "", tail: ""};
    }
    return {head: segs[0], tail: segs.slice(1).join("/")};
}

/************************************************************
 *  base_route + ids → the canonical route of a node.
 *  ("/cards", ["energy","north"]) → "/cards/energy/north"
 ************************************************************/
export function join_route(base_route, ids)
{
    let base = String(base_route || "/");
    if(base.charAt(0) !== "/") {
        base = "/" + base;
    }
    base = base.replace(/\/{2,}/g, "/");
    if(base.length > 1) {
        base = base.replace(/\/+$/, "");
    }
    let tail = (ids || []).filter((s) => s && String(s).length > 0).join("/");
    if(!tail) {
        return base;
    }
    if(base === "/") {
        return "/" + tail;
    }
    return base + "/" + tail;
}

/************************************************************
 *  The render configs a node uses to project its children in
 *  one of the two modes:
 *
 *      "index"  — I am the tip of the path: the projection IS
 *                 the page (a card grid, a list…).
 *      "chrome" — a child of mine is showing: the projection is
 *                 the chrome around it (a tab strip, a backbar).
 *
 *  Accepted shapes of `projection`:
 *      "cards"                        → index cards, no chrome
 *      {layout:"cards", …}            → index only, no chrome
 *      {index:…, chrome:…}            → both, each a render config
 *                                       or an ARRAY of them (that is
 *                                       how tabs>=tablet + backbar
 *                                       <tablet coexist)
 *
 *  Input is assumed validated by normalize_spec().
 ************************************************************/
export function projection_renders(projection, mode)
{
    if(projection === null || projection === undefined || projection === "") {
        if(mode === "index") {
            return [Object.assign({}, DEFAULT_INDEX_RENDER)];
        }
        return [];
    }
    if(typeof projection === "string") {
        if(mode === "index") {
            return [{layout: projection}];
        }
        return [];
    }

    let has_modes = ("index" in projection) || ("chrome" in projection);
    if(!has_modes) {
        if(mode === "index") {
            return [Object.assign({}, projection)];
        }
        return [];
    }

    let raw = projection[mode];
    if(raw === null || raw === undefined) {
        return [];
    }
    if(typeof raw === "string") {
        return [{layout: raw}];
    }

    let list = Array.isArray(raw) ? raw : [raw];
    let out = [];
    for(let r of list) {
        out.push(Object.assign({}, r));
    }
    return out;
}

/************************************************************
 *  Children → C_YUI_NAV `menu_items`.  The nav is the renderer
 *  of every projection (cards, tabs, vertical, backbar…), so a
 *  projection is DRY with the shell's own menus: same item
 *  contract, same click event, same i18n and icon handling.
 *
 *  `route_of(id)` returns the canonical route of a child — the
 *  node supplies it, so this file stays route-agnostic.
 ************************************************************/
export function child_nav_items(children, route_of)
{
    let items = [];
    for(let c of (children || [])) {
        let item = {
            id:    c.id,
            name:  c.label || c.id,
            route: route_of(c.id)
        };
        if(c.icon) {
            item.icon = c.icon;
        }
        if(c.tooltip) {
            item.tooltip = c.tooltip;
        }
        if(c.disabled) {
            item.disabled = true;
        }
        items.push(item);
    }
    return items;
}

/************************************************************
 *  Does the ancestor at `distance` from the tip paint its chrome?
 *
 *  `depth` is the effective `chrome_depth` of the active path: the
 *  number of chrome strips painted ABOVE the current position.
 *  `null` means unlimited — every ancestor paints, which is the
 *  recursion in its raw form and stacks one strip per level.
 *
 *  distance 1 is the tip's own parent, so `depth: 1` leaves exactly
 *  one strip and `depth: 0` leaves none.
 ************************************************************/
export function chrome_visible(distance, depth)
{
    if(depth === null || depth === undefined) {
        return true;
    }
    return distance <= depth;
}

/************************************************************
 *  Validate + fill one node spec.  Returns the normalized spec,
 *  or null when it is unusable; every rejection pushes a
 *  human-readable line into `errors` (the caller logs them —
 *  this file has no imports).  `where` is a path-ish label used
 *  to locate the offending node in the message.
 *
 *  Recursive: children are normalized too, so ONE call at the
 *  door validates a whole declared tree.
 ************************************************************/
export function normalize_spec(spec, errors, where)
{
    let at = where || "/";

    if(!spec || typeof spec !== "object" || Array.isArray(spec)) {
        errors.push(`node spec at '${at}' is not an object`);
        return null;
    }

    let id = spec.id;
    if(typeof id !== "string" || id.length === 0) {
        errors.push(`node at '${at}' has no 'id' (the id IS the url segment)`);
        return null;
    }
    if(id.indexOf("/") >= 0) {
        errors.push(`node id '${id}' at '${at}' contains '/' — an id is ONE url segment`);
        return null;
    }

    let out = {
        id:      id,
        label:   (typeof spec.label === "string" && spec.label) ? spec.label : id,
        icon:    (typeof spec.icon === "string") ? spec.icon : "",
        tooltip: (typeof spec.tooltip === "string") ? spec.tooltip : "",
        disabled: !!spec.disabled,
        /*  -1 = not declared here (the path inherits it).  A node whose
         *  only job is to cap the stacked chrome of its subtree is a
         *  legitimate, and expected, intermediate node. */
        chrome_depth: -1,
        aliases: [],
        projection: null,
        content: null,
        link: null,
        children: []
    };

    if(spec.chrome_depth !== undefined && spec.chrome_depth !== null) {
        let d = spec.chrome_depth;
        /*  -1 is this function's OWN "not declared" output: each level of
         *  the tree re-normalizes the children the level above handed it,
         *  so normalize_spec has to accept what it produces. */
        if(typeof d !== "number" || d < -1 || Math.floor(d) !== d) {
            errors.push(
                `node '${at}${id}': 'chrome_depth' must be an integer >= 0 ` +
                `(0 = no chrome strip, omit it to inherit)`
            );
            return null;
        }
        out.chrome_depth = d;
    }

    /*  The tree is a CONTRACT: its paths are urls a client may hold.
     *  An id therefore never changes — a rename ships the old id as an
     *  alias, and the old url keeps resolving (rewritten to the
     *  canonical one), which is what makes a version bump migratable. */
    if(spec.aliases !== undefined && spec.aliases !== null) {
        if(!Array.isArray(spec.aliases)) {
            errors.push(`node '${at}${id}': 'aliases' must be an array of ids`);
            return null;
        }
        for(let a of spec.aliases) {
            if(typeof a !== "string" || a.length === 0 || a.indexOf("/") >= 0) {
                errors.push(
                    `node '${at}${id}': alias '${a}' is not a valid id ` +
                    `(one url segment)`
                );
                return null;
            }
            out.aliases.push(a);
        }
    }

    let proj_errors = validate_projection(spec.projection, `${at}${id}`);
    if(proj_errors.length) {
        for(let e of proj_errors) {
            errors.push(e);
        }
        return null;
    }
    if(spec.projection !== undefined) {
        out.projection = spec.projection;
    }

    if(spec.content !== undefined && spec.content !== null) {
        let c = spec.content;
        if(typeof c !== "object" || Array.isArray(c)) {
            errors.push(`node '${at}${id}': 'content' must be an object {gclass, kw?}`);
            return null;
        }
        if(typeof c.gclass !== "string" || c.gclass.length === 0) {
            errors.push(`node '${at}${id}': 'content.gclass' is required`);
            return null;
        }
        out.content = {
            gclass: c.gclass,
            kw:     (c.kw && typeof c.kw === "object") ? c.kw : {}
        };
    }

    /*  A link is where structure stops and data begins: it mounts a
     *  viewer and OWNS everything below it in the url.  It therefore
     *  cannot also be a branch (children) or carry a separate content —
     *  declaring both is a contradiction about who owns the subpath,
     *  and a silent winner would be the worst outcome. */
    if(spec.link !== undefined && spec.link !== null) {
        let l = spec.link;
        if(typeof l !== "object" || Array.isArray(l)) {
            errors.push(`node '${at}${id}': 'link' must be an object {kind, gclass, kw?}`);
            return null;
        }
        if(typeof l.kind !== "string" || l.kind.length === 0) {
            errors.push(
                `node '${at}${id}': 'link.kind' is required — name the data ` +
                `space it points into (e.g. "tranger")`
            );
            return null;
        }
        if(typeof l.gclass !== "string" || l.gclass.length === 0) {
            errors.push(
                `node '${at}${id}': 'link.gclass' is required — the viewer ` +
                `suited to that data`
            );
            return null;
        }
        if(out.content) {
            errors.push(
                `node '${at}${id}': declares both 'link' and 'content' — a ` +
                `link IS the node's content`
            );
            return null;
        }
        out.link = {
            kind:   l.kind,
            gclass: l.gclass,
            kw:     (l.kw && typeof l.kw === "object") ? l.kw : {}
        };
    }

    if(spec.children !== undefined && spec.children !== null) {
        if(!Array.isArray(spec.children)) {
            errors.push(`node '${at}${id}': 'children' must be an array`);
            return null;
        }
        if(out.link && spec.children.length) {
            errors.push(
                `node '${at}${id}': declares both 'link' and 'children' — ` +
                `below a link the url belongs to the viewer, not to nodes`
            );
            return null;
        }
        let seen = {};
        for(let child of spec.children) {
            let n = normalize_spec(child, errors, `${at}${id}/`);
            if(!n) {
                return null;
            }
            if(seen[n.id]) {
                errors.push(
                    `node '${at}${id}': duplicated child id '${n.id}' — ` +
                    `sibling ids are url segments and must be unique`
                );
                return null;
            }
            seen[n.id] = true;
            out.children.push(n);
        }
    }

    return out;
}

/************************************************************
 *  Shape check of a `projection` value.  Returns an array of
 *  error lines (empty when valid).
 ************************************************************/
function validate_projection(projection, at)
{
    let errors = [];

    if(projection === undefined || projection === null) {
        return errors;
    }
    if(typeof projection === "string") {
        if(VALID_LAYOUTS.indexOf(projection) < 0) {
            errors.push(`node '${at}': unknown projection layout '${projection}'`);
        }
        return errors;
    }
    if(typeof projection !== "object" || Array.isArray(projection)) {
        errors.push(`node '${at}': 'projection' must be a string or an object`);
        return errors;
    }

    let has_modes = ("index" in projection) || ("chrome" in projection);
    if(!has_modes) {
        check_render(projection, at, "projection", errors);
        return errors;
    }
    for(let mode of ["index", "chrome"]) {
        if(!(mode in projection)) {
            continue;
        }
        let raw = projection[mode];
        if(raw === null || raw === undefined) {
            continue;
        }
        let list = Array.isArray(raw) ? raw : [raw];
        for(let r of list) {
            if(typeof r === "string") {
                if(VALID_LAYOUTS.indexOf(r) < 0) {
                    errors.push(`node '${at}': unknown ${mode} layout '${r}'`);
                }
                continue;
            }
            check_render(r, at, `projection.${mode}`, errors);
        }
    }
    return errors;
}

/************************************************************
 *  One render config: {layout, icon_pos?, show_label?, show_on?}
 ************************************************************/
function check_render(render, at, what, errors)
{
    if(!render || typeof render !== "object" || Array.isArray(render)) {
        errors.push(`node '${at}': '${what}' must be an object {layout, …}`);
        return;
    }
    if(typeof render.layout !== "string" || render.layout.length === 0) {
        errors.push(`node '${at}': '${what}' has no 'layout'`);
        return;
    }
    if(VALID_LAYOUTS.indexOf(render.layout) < 0) {
        errors.push(`node '${at}': unknown ${what} layout '${render.layout}'`);
    }
}

export { VALID_LAYOUTS };
