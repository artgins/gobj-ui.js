/***********************************************************************
 *          c_yui_node.js
 *
 *      C_YUI_NODE — a navigable position, and the whole navigation
 *      model in one recursive gclass.
 *
 *      THE MODEL
 *      ---------
 *      A node is a gobj.  Nodes form a TREE (the gobj tree IS the
 *      navigation tree — no parallel structure), and the URL is the
 *      path of node ids from the tree's `base_route` down:
 *
 *          #/cards/energy/north/m1
 *           \____/\____________/
 *            base   node ids
 *
 *      Every node holds HOW IT WANTS ITS CHILDREN SEEN — the
 *      `projection` (cards, tabs, vertical, backbar…, per breakpoint),
 *      and how it wants the WAY IN shown: `projection.path` draws the
 *      trail down to the user as one breadcrumb line, the alternative
 *      to stacking one chrome strip per level.
 *      That is the piece that removes "two levels of menu" as a
 *      concept: there is no primary/secondary nav, there is a parent
 *      projecting its children, recursively, at any depth.  Rendering
 *      is DRY: a projection IS a C_YUI_NAV render config, so every
 *      level reuses the same renderer, the same item contract, the
 *      same i18n and the same click event as the shell's own menus.
 *
 *      A node may have CONTENT (a gclass to mount), CHILDREN, or both:
 *      a section with its own page and sub-pages is one node with
 *      both, not two concepts.
 *
 *      DECLARATIVE == DYNAMIC
 *      ----------------------
 *      The runtime API is the contract; the declared `children` attr
 *      is only its first caller.  mt_create does not build the tree
 *      by a private path — it sends itself one EV_ADD_NODE per
 *      declared child, exactly what yui_node_add() does at 3pm with
 *      the app running.  If the boot path could build something the
 *      API cannot, that would be an API bug, not a difference between
 *      "config" and "runtime".
 *
 *      THE ROOT
 *      --------
 *      The root node is where the shell's own root used to be: its
 *      children are the app's primary options, and it projects them
 *      into ZONES of the space (a left rail, a bottom bar) instead of
 *      into its own body — a render config with a `zone` is mounted
 *      through yui_shell_zone().  That is the only asymmetry in the
 *      model, and it is not an exception to it: `menu.primary.render`
 *      always was a per-zone projection, it just had no owner that
 *      could hold it.  Declared as `config.shell.tree`, which
 *      synthesizes ONE route entry owning the whole url space.
 *
 *      WHERE THE TREE ENDS
 *      -------------------
 *      One gobj per structural node is right; one gobj per meter
 *      reading is not.  A node marks the boundary with `link`: a
 *      pointer into a data space (a timeranger — millions of raw
 *      records, series/time, key/value) plus the viewer suited to that
 *      shape.  A link node is ALWAYS the tip of the structural path:
 *      the url keeps going, but the tail is handed to the viewer as
 *      `EV_ROUTE_CHANGED {base, subpath}` — the SAME contract the shell
 *      gives a view (ROUTING.md §5), so a viewer cannot tell whether it
 *      was mounted by the shell at a declared route or by a node deep
 *      in a tree.  Below a link there are no nodes, and declaring
 *      `children` there is a config error.
 *
 *      ROUTING (see ROUTING.md)
 *      ------------------------
 *      The tree owns everything below `base_route` through the
 *      shell's `subpath`: ONE declared route, arbitrary depth.  Clicks
 *      never mutate the view — a projection click publishes
 *      EV_NAV_CLICKED, the node turns it into a URL change (push), and
 *      the shell's EV_ROUTE_CHANGED walks back down the tree as
 *      EV_ACTIVATE.  Intent → URL → view, so Back/Forward, F5 and deep
 *      links are correct by construction.
 *
 *      Only the ROOT node (the one whose parent is not a C_YUI_NODE)
 *      talks to the shell: it subscribes to EV_ROUTE_CHANGED, resolves
 *      the subpath and activates the branch.  Inner nodes only ever
 *      hear their parent.
 *
 *      A path segment that names no living child is not silently
 *      swallowed: it logs and the URL is rewritten (replace) to the
 *      deepest living ancestor — the tree is dynamic, so the ground
 *      CAN disappear under a bookmark.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {
    SDATA,
    SDATA_END,
    data_type_t,
    event_flag_t,
    gclass_create,
    gclass_find_by_name,
    log_error,
    log_warning,
    gobj_create_pure_child,
    gobj_destroy,
    gobj_start,
    gobj_stop,
    gobj_is_running,
    gobj_parent,
    gobj_gclass_name,
    gobj_read_attr,
    gobj_read_bool_attr,
    gobj_read_pointer_attr,
    gobj_write_attr,
    gobj_subscribe_event,
    gobj_unsubscribe_event,
    gobj_send_event,
    gobj_change_state,
    gobj_current_state,
    createElement2,
    empty_string,
    is_array,
} from "@yuneta/gobj-js";

import {
    split_subpath,
    head_tail,
    join_route,
    projection_renders,
    child_nav_items,
    nav_route_with_tail,
    chrome_visible,
    normalize_spec,
    is_nav_mode,
    nav_mode_renders,
    nav_mode_depth,
    NAV_MODES,
} from "./node_tree_model.js";

import {
    yui_shell_of,
    yui_shell_zone,
    yui_shell_navigate,
    yui_shell_set_sub_routes,
    yui_shell_translate,
} from "./c_yui_shell.js";

import "./c_yui_node.css";


/***************************************************************
 *              Constants
 ***************************************************************/
const GCLASS_NAME = "C_YUI_NODE";

/*  Internal children are named apart from node children, whose gobj
 *  name IS their node id (so the `machine` trace reads like the URL). */
const CONTENT_NAME = "__content__";
const NAV_PREFIX   = "__nav_";


/***************************************************************
 *              Attrs
 ***************************************************************/
const attrs_table = [
SDATA(data_type_t.DTP_POINTER,  "subscriber",   0,  null,   "Subscriber of output events"),

SDATA(data_type_t.DTP_STRING,   "node_id",      0,  "",     "Id of this node — it IS its url segment (immutable)"),
SDATA(data_type_t.DTP_STRING,   "label",        0,  "",     "Human label (i18n key); falls back to node_id"),
SDATA(data_type_t.DTP_STRING,   "icon",         0,  "",     "Icon css class"),
SDATA(data_type_t.DTP_STRING,   "tooltip",      0,  "",     "Tooltip/aria label (i18n key)"),
SDATA(data_type_t.DTP_BOOLEAN,  "disabled",     0,  false,  "Rendered but not navigable"),
SDATA(data_type_t.DTP_INTEGER,  "chrome_depth", 0,  -1,     "Chrome strips painted above the tip; -1 = inherit, 0 = none"),
SDATA(data_type_t.DTP_JSON,     "aliases",      0,  null,   "Former ids of this node — old urls keep resolving (rewritten)"),
SDATA(data_type_t.DTP_JSON,     "projection",   0,  null,   "How this node shows its children: layout | {index,chrome}"),
SDATA(data_type_t.DTP_JSON,     "content",      0,  null,   "{gclass, kw} mounted when this node is the tip of the path"),
SDATA(data_type_t.DTP_JSON,     "link",         0,  null,   "{kind, gclass, kw} — structure ends here; the viewer owns the subpath"),
SDATA(data_type_t.DTP_JSON,     "children",     0,  null,   "Declared child specs — the first caller of the runtime API"),

SDATA(data_type_t.DTP_STRING,   "base_route",   0,  "",     "ROOT only: the declared route the whole tree hangs from"),
SDATA(data_type_t.DTP_STRING,   "tree_version", 0,  "",     "ROOT only: version of the tree CONTRACT (its paths are public urls)"),
SDATA(data_type_t.DTP_STRING,   "nav_mode",     0,  "stack","ROOT only: how the way in is shown — stack|back|path"),
SDATA(data_type_t.DTP_BOOLEAN,  "remember_position", 0, false, "A nav item points at WHERE THE OPERATOR LEFT that child, not at its bare route: the tail last active under each child is remembered and appended. For a tree whose children are workspaces with a position inside them (a treedb and its open topic); off for one whose children are pages, where the item IS the destination"),

SDATA(data_type_t.DTP_POINTER,  "$container",   0,  null,   "Root HTMLElement (shell view contract)"),
SDATA_END()
];

let PRIVATE_DATA = {
    children:       null,   /*  child NODE gobjs, in order              */
    navs:           null,   /*  live C_YUI_NAV gobjs inside my own body  */
    zone_navs:      null,   /*  navs projected into the SPACE, by key     */
    zone_sig:       null,   /*  their last item signature                 */
    content_gobj:   null,
    active_child:   null,   /*  child NODE gobj currently on the path    */
    remembered:     null,   /*  child id -> tail last active under it     */
    chrome_depth:   null,   /*  effective for the active path (null = all) */
    distance:       0,      /*  segments from me down to the tip           */
    chain:          null,   /*  nodes from my child down to the tip        */
    is_root:        false,
    $chrome:        null,
    $body:          null
};

let __gclass__ = null;




                    /******************************
                     *      Framework Methods
                     ******************************/




/***************************************************************
 *          Framework Method: Create
 ***************************************************************/
function mt_create(gobj)
{
    let priv = gobj.priv;

    /*
     *  CHILD subscription model
     */
    let subscriber = gobj_read_pointer_attr(gobj, "subscriber");
    if(!subscriber) {
        subscriber = gobj_parent(gobj);
    }
    gobj_subscribe_event(gobj, null, {}, subscriber);

    priv.children = [];
    priv.remembered = {};
    priv.navs = [];
    priv.zone_navs = {};
    priv.zone_sig = {};

    let parent = gobj_parent(gobj);
    priv.is_root = !parent || gobj_gclass_name(parent) !== GCLASS_NAME;

    if(empty_string(gobj_read_attr(gobj, "node_id"))) {
        log_error(`${GCLASS_NAME}: created without 'node_id' — the id IS the url segment`);
    }
    if(priv.is_root && empty_string(gobj_read_attr(gobj, "base_route"))) {
        log_error(`${GCLASS_NAME}: root node created without 'base_route'`);
    }

    build_ui(gobj);

    /*
     *  The declared tree is not a privileged path: it is a caller of
     *  the same runtime API, one EV_ADD_NODE per child.
     */
    let declared = gobj_read_attr(gobj, "children");
    if(declared !== null && declared !== undefined) {
        if(!is_array(declared)) {
            log_error(`${GCLASS_NAME} '${node_path_str(gobj)}': 'children' must be an array`);
        } else {
            for(let spec of declared) {
                gobj_send_event(gobj, "EV_ADD_NODE", {spec: spec}, gobj);
            }
        }
    }
}

/***************************************************************
 *          Framework Method: Start
 ***************************************************************/
function mt_start(gobj)
{
    let priv = gobj.priv;

    for(let child of priv.children) {
        if(!gobj_is_running(child)) {
            gobj_start(child);
        }
    }

    if(!priv.is_root) {
        return;
    }

    /*
     *  Only the root talks to the shell.  Subscribing in mt_start keeps
     *  it symmetric with the unsubscribe in mt_stop; the shell mounts a
     *  view (create → appendChild → start) and only THEN broadcasts
     *  EV_ROUTE_CHANGED, so this still precedes the first broadcast.
     */
    let shell = yui_shell_of(gobj);
    if(!shell) {
        log_error(`${GCLASS_NAME}: no shell — the tree cannot route`);
        return;
    }
    gobj_subscribe_event(shell, "EV_ROUTE_CHANGED", {}, gobj);
    publish_sub_routes(gobj);
}

/***************************************************************
 *          Framework Method: Stop
 ***************************************************************/
function mt_stop(gobj)
{
    let priv = gobj.priv;

    if(priv.is_root) {
        let shell = yui_shell_of(gobj);
        if(shell) {
            gobj_unsubscribe_event(shell, "EV_ROUTE_CHANGED", {}, gobj);
            yui_shell_set_sub_routes(shell, gobj_read_attr(gobj, "base_route"), null);
        }
    }

    deactivate(gobj);

    /*  Symmetric with mt_start: what this node started, it stops —
     *  the framework destroys children, and destroying a RUNNING gobj
     *  is an error. */
    if(priv.content_gobj && gobj_is_running(priv.content_gobj)) {
        gobj_stop(priv.content_gobj);
    }
    for(let key of Object.keys(priv.zone_navs)) {
        let nav = priv.zone_navs[key];
        if(gobj_is_running(nav)) {
            gobj_stop(nav);
        }
    }
    for(let child of priv.children) {
        if(gobj_is_running(child)) {
            gobj_stop(child);
        }
    }
}

/***************************************************************
 *          Framework Method: Destroy
 ***************************************************************/
function mt_destroy(gobj)
{
    let priv = gobj.priv;

    /*  gobj_destroy() destroys the children BEFORE calling mt_destroy,
     *  so the content and the projection navs are already gone: reaching
     *  for them here only logs "gobj NULL or DESTROYED".  Drop the
     *  references and own nothing but the DOM. */
    priv.content_gobj = null;
    priv.navs = [];
    priv.zone_navs = {};
    priv.zone_sig = {};
    priv.active_child = null;

    let $c = gobj_read_attr(gobj, "$container");
    if($c && $c.parentNode) {
        $c.parentNode.removeChild($c);
    }
    gobj_write_attr(gobj, "$container", null);
}




                    /***************************
                     *      Local Methods
                     ***************************/




/************************************************************
 *  Build the (empty) DOM skeleton.  Inner DOM is built when the
 *  node is activated and torn down when it leaves the path, so
 *  an inactive branch costs one empty <div>.
 ************************************************************/
function build_ui(gobj)
{
    let priv = gobj.priv;
    let node_id = gobj_read_attr(gobj, "node_id");

    let $container = createElement2(
        ["div", {class: `${GCLASS_NAME} NODE_VIEW`, "data-node-id": node_id}, [
            ["div", {class: "NODE_CHROME"}],
            ["div", {class: "NODE_BODY"}]
        ]]
    );
    priv.$chrome = $container.querySelector(".NODE_CHROME");
    priv.$body   = $container.querySelector(".NODE_BODY");

    gobj_write_attr(gobj, "$container", $container);
}

/************************************************************
 *  The tree's root node (the one whose parent is not a node).
 ************************************************************/
function tree_root_of(gobj)
{
    let g = gobj;
    while(true) {
        let parent = gobj_parent(g);
        if(!parent || gobj_gclass_name(parent) !== GCLASS_NAME) {
            return g;
        }
        g = parent;
    }
}

/************************************************************
 *  The navigation mode in force for this node.
 *
 *  It is ONE knob per tree, held by the root: a tree whose ancestors
 *  stacked strips while a descendant drew a breadcrumb would be
 *  showing the way in twice, in two languages.  Descendants read it
 *  from the root rather than keeping a copy, so a node added at
 *  runtime is born in the mode the tree is already in.
 ************************************************************/
function nav_mode_of(gobj)
{
    let mode = gobj_read_attr(tree_root_of(gobj), "nav_mode") || "stack";

    if(!is_nav_mode(mode)) {
        log_error(
            `${GCLASS_NAME} '${node_path_str(gobj)}': unknown nav_mode ` +
            `'${mode}' — expected one of ${NAV_MODES.join("|")}`
        );
        return "stack";
    }
    return mode;
}

/************************************************************
 *  Node ids from the root DOWN TO this node, root excluded
 *  (the root's own segment is already inside base_route).
 ************************************************************/
function node_ids(gobj)
{
    let ids = [];
    let g = gobj;
    while(true) {
        let parent = gobj_parent(g);
        if(!parent || gobj_gclass_name(parent) !== GCLASS_NAME) {
            break;
        }
        ids.unshift(gobj_read_attr(g, "node_id"));
        g = parent;
    }
    return ids;
}

/************************************************************
 *  Canonical route of a node — the URL that lands exactly here.
 ************************************************************/
function route_of(gobj)
{
    let root = tree_root_of(gobj);
    return join_route(gobj_read_attr(root, "base_route"), node_ids(gobj));
}

/************************************************************
 *  Human path for logs: "<base>/a/b".
 ************************************************************/
function node_path_str(gobj)
{
    return route_of(gobj);
}

/************************************************************
 *  Child node by id, or null.
 ************************************************************/
function find_child(gobj, node_id)
{
    for(let child of gobj.priv.children) {
        if(gobj_read_attr(child, "node_id") === node_id) {
            return child;
        }
    }
    return null;
}

/************************************************************
 *  Child node whose FORMER id is `node_id`, or null.
 *
 *  The tree's paths are a contract — a url a client may have
 *  bookmarked, scripted or been sold as a door into the system.
 *  So an id is never rewritten in place: a rename ships the old
 *  id in `aliases`, the old url keeps resolving, and the shell
 *  rewrites it to the canonical one.  That is what makes a
 *  version bump migratable instead of breaking.
 ************************************************************/
function find_child_by_alias(gobj, node_id)
{
    for(let child of gobj.priv.children) {
        let aliases = gobj_read_attr(child, "aliases");
        if(is_array(aliases) && aliases.indexOf(node_id) >= 0) {
            return child;
        }
    }
    return null;
}

/************************************************************
 *  Is this node the boundary between structure and data?
 ************************************************************/
function has_link(gobj)
{
    let link = gobj_read_attr(gobj, "link");
    return !!(link && link.gclass);
}

/************************************************************
 *  What this node mounts when it is the tip: its link's viewer
 *  (the data case) or its content (the structural case).
 ************************************************************/
function view_spec(gobj)
{
    let link = gobj_read_attr(gobj, "link");
    if(link && link.gclass) {
        return link;
    }
    return gobj_read_attr(gobj, "content");
}

/************************************************************
 *  Effective chrome depth for the active path: the DEEPEST
 *  declaration wins (a node close to the leaf knows better how
 *  much chrome its corner deserves than the root does), falling
 *  back to what the parent handed down, then to unlimited.
 *
 *  This is why an intermediate node may exist for no other
 *  reason than to hold this number.
 ************************************************************/
function resolve_path_info(gobj, subpath, inherited)
{
    let effective = (typeof inherited === "number") ? inherited : null;

    let mode = nav_mode_of(gobj);

    let own = gobj_read_attr(gobj, "chrome_depth");
    if(typeof own === "number" && own >= 0) {
        effective = own;
    }
    if(has_link(gobj)) {
        return {distance: 0, chrome_depth: nav_mode_depth(effective, mode), chain: []};
    }

    /*  Distance is counted in STRUCTURAL segments: the tail a viewer
     *  owns below a link is url, not tree, and counting it would push
     *  every ancestor out of a chrome_depth budget it never spent. */
    let distance = 0;
    let chain = [];
    let g = gobj;
    for(let seg of split_subpath(subpath)) {
        let child = find_child(g, seg) || find_child_by_alias(g, seg);
        if(!child) {
            break;
        }
        distance++;
        chain.push(child);
        let declared = gobj_read_attr(child, "chrome_depth");
        if(typeof declared === "number" && declared >= 0) {
            effective = declared;
        }
        g = child;
        if(has_link(child)) {
            break;
        }
    }
    return {
        distance: distance,
        chrome_depth: nav_mode_depth(effective, mode),
        chain: chain
    };
}

/************************************************************
 *  Resolve a path of ids ("a/b/c") from `node` downwards.
 *  Returns the deepest LIVING node plus the segments that did
 *  not resolve — the caller decides what a dead tail means.
 ************************************************************/
function walk_path(node, path)
{
    let segs = split_subpath(path);
    let g = node;
    let i = 0;
    while(i < segs.length) {
        let next = find_child(g, segs[i]);
        if(!next) {
            break;
        }
        g = next;
        i++;
    }
    return {node: g, missing: segs.slice(i)};
}

/************************************************************
 *  Translate a subtree this node just built.
 *
 *  A node renders its chrome WHEN YOU WALK INTO IT, long after
 *  the host's one-shot refresh_language over the shell tree, and
 *  its zone navs are appended into shell zones, outside this
 *  node's own $container.  Neither pass reaches them, so without
 *  this every strip renders its raw i18n key: `treedb`,
 *  `central database`, `data` in lower-case English next to a
 *  translated menu — which reads as a MISSING key and sent more
 *  than one person looking for the wrong bug.
 *
 *  This is library-built DOM, so it goes through the shell's
 *  registered translator.  What a node MOUNTS is not ours: an app
 *  view gclass translates its own DOM.
 ************************************************************/
function translate_own_dom(gobj, $el)
{
    if(!$el) {
        return;
    }
    yui_shell_translate(yui_shell_of(gobj), $el);
}

/************************************************************
 *  Destroy the C_YUI_NAV gobjs rendering this node's projection.
 ************************************************************/
function clear_navs(gobj)
{
    let priv = gobj.priv;
    for(let nav of priv.navs) {
        if(gobj_is_running(nav)) {
            gobj_stop(nav);
        }
        gobj_destroy(nav);
    }
    priv.navs = [];
}

/************************************************************
 *  Render this node's projection of its children, in one mode:
 *      "index"  — I am the tip: the projection is the page.
 *      "chrome" — a child is showing: the projection is its chrome.
 ************************************************************/
function render_projection(gobj, mode, $where, active_route, active_id, zones_only)
{
    let priv = gobj.priv;

    if(!priv.children.length) {
        return;
    }
    let renders = nav_mode_renders(gobj_read_attr(gobj, "projection"),
        nav_mode_of(gobj), mode, priv.is_root);
    if(!renders.length) {
        return;
    }

    let my_route = route_of(gobj);
    let base = my_route === "/" ? "" : my_route;
    let specs = [];
    for(let child of priv.children) {
        specs.push({
            id:       gobj_read_attr(child, "node_id"),
            label:    gobj_read_attr(child, "label"),
            icon:     gobj_read_attr(child, "icon"),
            tooltip:  gobj_read_attr(child, "tooltip"),
            disabled: gobj_read_attr(child, "disabled")
        });
    }
    /*  A nav item points at the child's canonical route, or — when this
     *  tree remembers — at where the operator left that child. Same
     *  contract either way: what the item carries is a real position,
     *  so clicking it is a navigation and not a restore that would then
     *  have to argue with the url.  */
    let remember = gobj_read_bool_attr(gobj, "remember_position");
    let items = child_nav_items(specs, (id) => {
        let route = `${base}/${id}`;
        return remember ? nav_route_with_tail(route, priv.remembered[id]) : route;
    });

    let i = 0;
    for(let render of renders) {
        /*  A projection with a `zone` goes into the SPACE (the root
         *  rail/bar), not into this node's body — and it PERSISTS.  It
         *  is the app's standing chrome: rebuilding it on every
         *  navigation would throw away its scroll and blink the rail,
         *  so it is created once and told where the user is. */
        if(render.zone) {
            project_into_zone(gobj, render, items, active_route, active_id);
            i++;
            continue;
        }
        if(zones_only) {
            i++;
            continue;
        }
        let $target = $where;
        let nav = gobj_create_pure_child(
            `${NAV_PREFIX}${mode}_${i}__`,
            "C_YUI_NAV",
            {
                menu_id:      `node.${my_route}`,
                nav_label:    gobj_read_attr(gobj, "label") || gobj_read_attr(gobj, "node_id"),
                menu_items:   items,
                layout:       render.layout,
                zone:         render.zone || "",
                icon_pos:     render.icon_pos || "top",
                show_label:   render.show_label !== false,
                show_on:      render.show_on || "",
                level:        render.zone ? "primary" : "secondary",
                /*  A backbar goes UP: back to this node's own index. */
                back_route:   (render.layout === "backbar") ? my_route : "",
                active_route: active_route || ""
            },
            gobj
        );
        gobj_start(nav);
        let $nav = gobj_read_attr(nav, "$container");
        if($nav) {
            $target.appendChild($nav);
            translate_own_dom(gobj, $nav);
        }
        priv.navs.push(nav);
        i++;
    }
}

/************************************************************
 *  Project into a zone of the SPACE, once, and keep it.
 *
 *  Rebuilt only when the children actually changed (the runtime
 *  API added or removed one); otherwise the nav is just told the
 *  new position, which is what C_YUI_NAV's EV_ROUTE_CHANGED is
 *  for.  Unknown zone: nothing is built rather than mounted
 *  nowhere — a menu that silently vanishes is the worse failure.
 ************************************************************/
function project_into_zone(gobj, render, items, active_route, active_id)
{
    let priv = gobj.priv;
    let key = `${render.zone}|${render.layout}|${render.show_on || ""}`;
    /*  The route is part of it: with `remember_position` an item's id
     *  never changes while its destination does, so a signature of ids
     *  alone would leave a persisted zone nav pointing at where the
     *  operator was three navigations ago.  */
    let sig = items.map((it) => `${it.id}=${it.route}`).join(",");
    let nav = priv.zone_navs[key];

    if(!nav) {
        let $zone = yui_shell_zone(yui_shell_of(gobj), render.zone);
        if(!$zone) {
            return;   /*  Error already logged  */
        }
        nav = gobj_create_pure_child(
            `${NAV_PREFIX}zone_${render.zone}_${render.layout}__`,
            "C_YUI_NAV",
            {
                menu_id:     `node.${route_of(gobj)}`,
                nav_label:   gobj_read_attr(gobj, "label") || gobj_read_attr(gobj, "node_id"),
                menu_items:  items,
                zone:        render.zone,
                layout:      render.layout,
                icon_pos:    render.icon_pos || "left",
                show_label:  render.show_label !== false,
                show_on:     render.show_on || "",
                level:       "primary"
            },
            gobj
        );
        gobj_start(nav);
        let $nav = gobj_read_attr(nav, "$container");
        if($nav) {
            $zone.appendChild($nav);
            translate_own_dom(gobj, $nav);
        }
        priv.zone_navs[key] = nav;
        priv.zone_sig[key] = sig;
    } else if(priv.zone_sig[key] !== sig) {
        gobj_send_event(nav, "EV_SET_ITEMS", {items: items}, gobj);
        /*  EV_SET_ITEMS rebuilt the nav's DOM: translate it again. */
        translate_own_dom(gobj, gobj_read_attr(nav, "$container"));
        priv.zone_sig[key] = sig;
    }

    gobj_send_event(nav, "EV_ROUTE_CHANGED", {
        route: active_route || "",
        item:  {id: active_id || ""}
    }, gobj);
}

/************************************************************
 *  Mount this node's own content (lazily, once).  A node with
 *  content AND children shows the content first and projects
 *  its children under it.
 ************************************************************/
function mount_content(gobj)
{
    let priv = gobj.priv;
    let content = view_spec(gobj);

    if(!content || !content.gclass) {
        return null;
    }
    if(priv.content_gobj) {
        return priv.content_gobj;
    }
    if(!gclass_find_by_name(content.gclass)) {
        log_error(
            `${GCLASS_NAME} '${node_path_str(gobj)}': content gclass ` +
            `'${content.gclass}' is not registered`
        );
        return null;
    }

    let view = gobj_create_pure_child(
        CONTENT_NAME, content.gclass, content.kw || {}, gobj
    );
    gobj_start(view);
    priv.content_gobj = view;
    return view;
}

/************************************************************
 *  Tear down the mounted content, orderly: a RUNNING gobj must
 *  be stopped before it is destroyed.
 ************************************************************/
function destroy_content(gobj)
{
    let priv = gobj.priv;

    if(!priv.content_gobj) {
        return;
    }
    if(gobj_is_running(priv.content_gobj)) {
        gobj_stop(priv.content_gobj);
    }
    gobj_destroy(priv.content_gobj);
    priv.content_gobj = null;
}

/************************************************************
 *  Paint state ST_SELF: I am the tip of the path.
 ************************************************************/
function render_self(gobj)
{
    let priv = gobj.priv;

    clear_navs(gobj);
    priv.$chrome.replaceChildren();
    priv.$body.replaceChildren();

    let view = mount_content(gobj);
    if(view) {
        let $v = gobj_read_attr(view, "$container");
        if($v) {
            /*  A LINK's viewer IS the page and must be BOUNDED by the
             *  body; a plain content is a header above the index and
             *  keeps its natural height.  Two boxes, so two classes. */
            let $slot = createElement2(["div", {class: has_link(gobj)
                ? "NODE_CONTENT NODE_CONTENT_LINK" : "NODE_CONTENT"}]);
            $slot.appendChild($v);
            priv.$body.appendChild($slot);
        }
    }

    render_path(gobj, priv.$chrome);

    if(priv.children.length) {
        let $index = createElement2(["div", {class: "NODE_INDEX"}]);
        priv.$body.appendChild($index);
        render_projection(gobj, "index", $index, "", "");
        /*  The zone projection is standing chrome: it lives across states,
         *  so its chrome renders must be refreshed here too or the rail
         *  would keep highlighting the child we just left.  ZONES ONLY —
         *  a body-bound chrome render drawn next to the index would be
         *  the same children listed twice on one screen. */
        render_projection(gobj, "chrome", $index, "", "", true);
        return;
    }

    if(!view) {
        let $empty = createElement2(
            ["div", {class: "NODE_EMPTY", i18n: "nothing here yet"},
                "Nothing here yet."]
        );
        priv.$body.appendChild($empty);
        translate_own_dom(gobj, $empty);
    }
}

/************************************************************
 *  Paint state ST_CHILD: a child of mine is on the path.
 ************************************************************/
function render_child(gobj, child)
{
    let priv = gobj.priv;

    clear_navs(gobj);
    priv.$chrome.replaceChildren();
    priv.$body.replaceChildren();

    /*  Every ancestor painting its own chrome stacks one strip per
     *  level.  `chrome_depth` is how a node caps that for its corner
     *  of the tree (see resolve_chrome_depth). */
    if(chrome_visible(priv.distance, priv.chrome_depth)) {
        render_projection(gobj, "chrome", priv.$chrome, route_of(child),
            gobj_read_attr(child, "node_id"));
    }
    render_path(gobj, priv.$chrome);

    let $slot = createElement2(["div", {class: "NODE_CHILD"}]);
    let $child = gobj_read_attr(child, "$container");
    if($child) {
        $slot.appendChild($child);
    }
    priv.$body.appendChild($slot);
}

/************************************************************
 *  Render the trail down to where the user is, as one line.
 *
 *  The other two projections show a node's CHILDREN; this one shows
 *  the PATH, so its items are me plus the chain below me — which is
 *  why it is rendered by ONE node (whoever declares it) instead of
 *  by every ancestor.  Same item contract as any other nav, so the
 *  crumbs click and translate like everything else.
 ************************************************************/
function render_path(gobj, $where)
{
    let priv = gobj.priv;
    let renders = nav_mode_renders(gobj_read_attr(gobj, "projection"),
        nav_mode_of(gobj), "path", priv.is_root);

    if(!renders.length) {
        return;
    }

    /*  From the TREE ROOT down to the tip, not from here: a trail that
     *  starts halfway ("South hall › Meter 3") answers the question it
     *  was drawn to answer only by half.  The declaring node decides
     *  HOW its corner shows the way in; it does not decide where the
     *  way in starts. */
    let path = [];
    let g = gobj;
    while(g) {
        path.unshift(g);
        let parent = gobj_parent(g);
        g = (parent && gobj_gclass_name(parent) === GCLASS_NAME) ? parent : null;
    }
    let items = path.concat(priv.chain || []).map((node) => ({
        id:    gobj_read_attr(node, "node_id"),
        name:  gobj_read_attr(node, "label") || gobj_read_attr(node, "node_id"),
        icon:  gobj_read_attr(node, "icon") || "",
        route: route_of(node)
    }));
    let tip = items[items.length - 1];

    let i = 0;
    for(let render of renders) {
        let nav = gobj_create_pure_child(
            `${NAV_PREFIX}path_${i}__`,
            "C_YUI_NAV",
            {
                menu_id:      `node.path.${route_of(gobj)}`,
                nav_label:    gobj_read_attr(gobj, "label") || "",
                menu_items:   items,
                layout:       render.layout,
                icon_pos:     render.icon_pos || "left",
                show_label:   render.show_label !== false,
                show_on:      render.show_on || "",
                level:        "secondary",
                active_route: tip.route
            },
            gobj
        );
        gobj_start(nav);
        let $nav = gobj_read_attr(nav, "$container");
        if($nav) {
            $where.appendChild($nav);
            translate_own_dom(gobj, $nav);
        }
        priv.navs.push(nav);
        i++;
    }
}

/************************************************************
 *  Leave the path: tear down my rendering and my active child's.
 ************************************************************/
function deactivate(gobj)
{
    let priv = gobj.priv;

    if(priv.active_child) {
        gobj_send_event(priv.active_child, "EV_DEACTIVATE", {}, gobj);
        priv.active_child = null;
    }
    clear_navs(gobj);
    if(priv.$chrome) {
        priv.$chrome.replaceChildren();
    }
    if(priv.$body) {
        priv.$body.replaceChildren();
    }
}

/************************************************************
 *  Enter (or re-enter) the path with `subpath` as my tail.
 *  Returns the new state name.
 ************************************************************/
function activate(gobj, subpath, inherited_depth)
{
    let priv = gobj.priv;
    let {head, tail} = head_tail(subpath);

    let info = resolve_path_info(gobj, subpath, inherited_depth);
    priv.distance = info.distance;
    priv.chrome_depth = info.chrome_depth;
    priv.chain = info.chain;

    /*  WHERE THE OPERATOR IS INSIDE THIS CHILD, recorded before anything
     *  is drawn, because the strip drawn on this very activation is the
     *  one that has to point back here.
     *
     *  An empty tail is recorded too, and that is not the same as not
     *  recording: navigating to a child's bare route IS the operator
     *  choosing its home, and the item must stop pointing at the topic
     *  they left three navigations ago.  */
    if(head) {
        priv.remembered[head] = tail || "";
    }

    /*  Structure ends here: whatever is left of the url is data, and it
     *  belongs to the viewer.  Re-render only the first time — paging
     *  through data must not rebuild the DOM under the viewer. */
    if(has_link(gobj)) {
        if(!priv.content_gobj || gobj_current_state(gobj) !== "ST_SELF") {
            if(priv.active_child) {
                gobj_send_event(priv.active_child, "EV_DEACTIVATE", {}, gobj);
                priv.active_child = null;
            }
            render_self(gobj);
        }
        forward_subpath(gobj, subpath);
        return "ST_SELF";
    }

    if(!head) {
        if(priv.active_child) {
            gobj_send_event(priv.active_child, "EV_DEACTIVATE", {}, gobj);
            priv.active_child = null;
        }
        render_self(gobj);
        return "ST_SELF";
    }

    let child = find_child(gobj, head);
    if(!child) {
        /*  A FORMER id: the url is still part of the contract, it just
         *  is not the canonical spelling any more.  Rewrite it (replace
         *  — code decided) and carry on; the route change that follows
         *  re-enters here on the canonical path. */
        let renamed = find_child_by_alias(gobj, head);
        if(renamed) {
            let shell = yui_shell_of(gobj);
            if(shell) {
                let canonical = tail ?
                    `${route_of(renamed)}/${tail}` : route_of(renamed);
                yui_shell_navigate(shell, canonical, {replace: true});
            }
            child = renamed;
        }
    }
    if(!child) {
        /*  The ground moved under a bookmark (or a typo): land on the
         *  deepest living ancestor — me — and say so.  CODE decided the
         *  move, so it is a replace (ROUTING.md §2). */
        log_warning(
            `${GCLASS_NAME} '${node_path_str(gobj)}': no child '${head}' — ` +
            `falling back to this node`
        );
        let shell = yui_shell_of(gobj);
        if(shell) {
            yui_shell_navigate(shell, route_of(gobj), {replace: true});
        }
        if(priv.active_child) {
            gobj_send_event(priv.active_child, "EV_DEACTIVATE", {}, gobj);
            priv.active_child = null;
        }
        render_self(gobj);
        return "ST_SELF";
    }

    if(priv.active_child && priv.active_child !== child) {
        gobj_send_event(priv.active_child, "EV_DEACTIVATE", {}, gobj);
    }
    priv.active_child = child;
    render_child(gobj, child);
    gobj_send_event(child, "EV_ACTIVATE", {
        subpath: tail,
        chrome_depth: priv.chrome_depth
    }, gobj);
    return "ST_CHILD";
}

/************************************************************
 *  Hand the data tail to the viewer, in the SAME shape the shell
 *  gives a view (ROUTING.md §5): `base` is this node's canonical
 *  route — what the viewer builds its own deep links from — and
 *  `subpath` is its tail, empty meaning "the viewer's home".
 *
 *  A viewer behind a link therefore cannot tell whether the shell
 *  mounted it at a declared route or a node did, deep in a tree.
 *  It MUST declare EV_ROUTE_CHANGED: a data space with no
 *  addressable position inside it would not need a link at all.
 ************************************************************/
function forward_subpath(gobj, subpath)
{
    let priv = gobj.priv;

    if(!priv.content_gobj) {
        return;   /*  Error already logged by mount_content()  */
    }
    let base = route_of(gobj);
    gobj_send_event(priv.content_gobj, "EV_ROUTE_CHANGED", {
        route:   subpath ? `${base}/${subpath}` : base,
        base:    base,
        subpath: subpath || ""
    }, gobj);
}

/************************************************************
 *  Repaint after the tree changed under me, without moving the
 *  user: same state, fresh projection.
 ************************************************************/
function repaint(gobj)
{
    let priv = gobj.priv;
    let state = gobj_current_state(gobj);

    if(state === "ST_SELF") {
        render_self(gobj);
        return;
    }
    if(state === "ST_CHILD" && priv.active_child) {
        render_child(gobj, priv.active_child);
    }
}

/************************************************************
 *  Contribute the whole tree to the shell's site map (ROUTING
 *  §5.4) — a pull-at-render registry, so the map shows every
 *  level instead of one declared route.
 ************************************************************/
function publish_sub_routes(gobj)
{
    let priv = gobj.priv;

    if(!priv.is_root) {
        return;
    }
    let shell = yui_shell_of(gobj);
    if(!shell) {
        return;
    }
    yui_shell_set_sub_routes(
        shell, gobj_read_attr(gobj, "base_route"), sub_route_nodes(gobj)
    );
}

function sub_route_nodes(gobj)
{
    let nodes = [];
    for(let child of gobj.priv.children) {
        nodes.push({
            route:    route_of(child),
            label:    gobj_read_attr(child, "label") || gobj_read_attr(child, "node_id"),
            icon:     gobj_read_attr(child, "icon") || "",
            children: sub_route_nodes(child)
        });
    }
    return nodes;
}

/************************************************************
 *  Tell the root the shape changed (site map + any host), by
 *  bubbling one event up the gobj tree.  Sent, not published:
 *  the root's parent is the SHELL, whose FSM must not receive
 *  events of a gclass it does not know about.
 ************************************************************/
function notify_tree_changed(gobj)
{
    let parent = gobj_parent(gobj);
    if(parent && gobj_gclass_name(parent) === GCLASS_NAME) {
        gobj_send_event(parent, "EV_NODE_TREE_CHANGED", {}, gobj);
        return;
    }
    publish_sub_routes(gobj);
}




                    /***************************
                     *      Actions
                     ***************************/




/************************************************************
 *  The shell moved the URL (root only).
 ************************************************************/
function ac_route_changed(gobj, event, kw, src)
{
    let base = kw.base || "";
    let my_base = gobj_read_attr(gobj, "base_route");

    if(base !== my_base) {
        /*  Another view owns the URL now.  A keep_alive tree stays
         *  created but must not keep painting a stale branch. */
        deactivate(gobj);
        gobj_change_state(gobj, "ST_OFF");
        return 0;
    }

    gobj_change_state(gobj, activate(gobj, kw.subpath || "", null));
    return 0;
}

/************************************************************
 *  My parent put me on the path.
 ************************************************************/
function ac_activate(gobj, event, kw, src)
{
    gobj_change_state(gobj, activate(gobj, kw.subpath || "", kw.chrome_depth));
    return 0;
}

/************************************************************
 *  My parent took me off the path.
 ************************************************************/
function ac_deactivate(gobj, event, kw, src)
{
    deactivate(gobj);
    gobj_change_state(gobj, "ST_OFF");
    return 0;
}

/************************************************************
 *  A projection was clicked.  The node never navigates itself
 *  by mutating state: it changes the URL and lets the route
 *  come back down (ROUTING.md §1.3).
 ************************************************************/
function ac_nav_clicked(gobj, event, kw, src)
{
    let route = kw.route || "";

    if(empty_string(route)) {
        log_error(`${GCLASS_NAME} '${node_path_str(gobj)}': EV_NAV_CLICKED without route`);
        return -1;
    }
    let shell = yui_shell_of(gobj);
    if(!shell) {
        log_error(`${GCLASS_NAME} '${node_path_str(gobj)}': no shell to navigate to '${route}'`);
        return -1;
    }
    yui_shell_navigate(shell, route);
    return 0;
}

/************************************************************
 *  Runtime API: add a child.  Same path the declared tree takes.
 ************************************************************/
function ac_add_node(gobj, event, kw, src)
{
    let priv = gobj.priv;
    let errors = [];
    let spec = normalize_spec(kw.spec, errors, `${node_path_str(gobj)}/`);

    if(!spec) {
        for(let e of errors) {
            log_error(`${GCLASS_NAME}: ${e}`);
        }
        return -1;
    }
    if(find_child(gobj, spec.id)) {
        log_error(
            `${GCLASS_NAME} '${node_path_str(gobj)}': child '${spec.id}' ` +
            `already exists — sibling ids are url segments`
        );
        return -1;
    }

    /*  A DTP_JSON attr rejects null (json2data FAILED), so a node
     *  without projection/content simply does not declare them. */
    let kw_child = {
        node_id:  spec.id,
        label:    spec.label,
        icon:     spec.icon,
        tooltip:  spec.tooltip,
        disabled: spec.disabled,
        chrome_depth: spec.chrome_depth,
        children: spec.children
    };
    if(spec.aliases && spec.aliases.length) {
        kw_child.aliases = spec.aliases;
    }
    if(spec.projection) {
        kw_child.projection = spec.projection;
    }
    if(spec.content) {
        kw_child.content = spec.content;
    }
    if(spec.link) {
        kw_child.link = spec.link;
    }
    let child = gobj_create_pure_child(spec.id, GCLASS_NAME, kw_child, gobj);

    let index = (typeof kw.index === "number") ? kw.index : priv.children.length;
    if(index < 0) {
        index = 0;
    }
    if(index > priv.children.length) {
        index = priv.children.length;
    }
    priv.children.splice(index, 0, child);

    if(gobj_is_running(gobj)) {
        gobj_start(child);
    }
    repaint(gobj);
    notify_tree_changed(gobj);
    return 0;
}

/************************************************************
 *  Runtime API: remove a child (and its whole subtree).
 ************************************************************/
function ac_remove_node(gobj, event, kw, src)
{
    let priv = gobj.priv;
    let node_id = kw.node_id || "";
    let child = find_child(gobj, node_id);

    if(!child) {
        log_error(
            `${GCLASS_NAME} '${node_path_str(gobj)}': cannot remove '${node_id}' — no such child`
        );
        return -1;
    }

    /*  Removing the branch the user is standing on: move them to the
     *  nearest living ancestor (me) BEFORE the gobj dies. */
    let was_active = (priv.active_child === child);
    if(was_active) {
        gobj_send_event(child, "EV_DEACTIVATE", {}, gobj);
        priv.active_child = null;
    }

    let idx = priv.children.indexOf(child);
    priv.children.splice(idx, 1);
    if(gobj_is_running(child)) {
        gobj_stop(child);
    }
    gobj_destroy(child);

    if(was_active) {
        let shell = yui_shell_of(gobj);
        if(shell) {
            yui_shell_navigate(shell, route_of(gobj), {replace: true});
        }
        gobj_change_state(gobj, "ST_SELF");
        render_self(gobj);
    } else {
        repaint(gobj);
    }
    notify_tree_changed(gobj);
    return 0;
}

/************************************************************
 *  Runtime API: change how I show my children.
 ************************************************************/
function ac_set_projection(gobj, event, kw, src)
{
    let errors = [];
    /*  Validate through the same door as a whole spec: a projection
     *  swap must not be the one path that accepts garbage. */
    let probe = normalize_spec(
        {id: gobj_read_attr(gobj, "node_id"), projection: kw.projection},
        errors, `${node_path_str(gobj)}`
    );
    if(!probe) {
        for(let e of errors) {
            log_error(`${GCLASS_NAME}: ${e}`);
        }
        return -1;
    }

    gobj_write_attr(gobj, "projection", kw.projection || {});
    repaint(gobj);
    return 0;
}

/************************************************************
 *  Runtime API: change how much stacked chrome my corner shows.
 *
 *  Declarative == dynamic: `chrome_depth` is how a branch trades
 *  stacked strips for something else, so it has to be reachable
 *  at runtime like every other part of the shape.  Paired with
 *  EV_SET_PROJECTION this is what lets an app offer "tabs or
 *  breadcrumb" as a live choice.
 ************************************************************/
function ac_set_chrome_depth(gobj, event, kw, src)
{
    let depth = kw.chrome_depth;

    if(typeof depth !== "number" || depth < -1 || Math.floor(depth) !== depth) {
        log_error(
            `${GCLASS_NAME} '${node_path_str(gobj)}': chrome_depth must be an ` +
            `integer >= 0 (or -1 to inherit) — got '${depth}'`
        );
        return -1;
    }
    gobj_write_attr(gobj, "chrome_depth", depth);

    /*  The depth is resolved along the ACTIVE PATH, so the node that
     *  re-renders it is the one the shell is talking to: ask the tree
     *  root to re-apply the current route rather than repainting only
     *  from here, which would leave the ancestors' strips behind. */
    let shell = yui_shell_of(gobj);
    if(shell) {
        yui_shell_navigate(shell, gobj_read_attr(shell, "current_route") ||
            route_of(gobj), {replace: true});
    }
    return 0;
}

/************************************************************
 *  Runtime API: change how this TREE shows the way in.
 *
 *  One knob for the whole tree, and deliberately root-only: the
 *  mode answers "how deep am I and how do I get back", a question
 *  that has one answer per tree.  Set on a middle node it would
 *  silently do nothing (descendants read the root's), and a knob
 *  that accepts a call and ignores it is worse than one that
 *  refuses it.
 *
 *  Nothing declared is rewritten — the mode filters the renders as
 *  they are asked for — so going back to "stack" restores exactly
 *  what the app declared, per branch, including layouts this mode
 *  never mentions.
 ************************************************************/
function ac_set_nav_mode(gobj, event, kw, src)
{
    let priv = gobj.priv;
    let mode = kw.nav_mode || "";

    if(!is_nav_mode(mode)) {
        log_error(
            `${GCLASS_NAME} '${node_path_str(gobj)}': unknown nav_mode ` +
            `'${mode}' — expected one of ${NAV_MODES.join("|")}`
        );
        return -1;
    }
    if(!priv.is_root) {
        log_error(
            `${GCLASS_NAME} '${node_path_str(gobj)}': nav_mode belongs to the ` +
            `tree ROOT — set it there, the whole tree reads it`
        );
        return -1;
    }
    gobj_write_attr(gobj, "nav_mode", mode);

    /*  Same reason as EV_SET_CHROME_DEPTH: what changes is the shape
     *  of the ACTIVE PATH, whose strips are painted by the ancestors,
     *  so the tree is asked to re-apply the current route instead of
     *  repainting one node. */
    let shell = yui_shell_of(gobj);
    if(shell) {
        yui_shell_navigate(shell, gobj_read_attr(shell, "current_route") ||
            route_of(gobj), {replace: true});
    }
    return 0;
}

/************************************************************
 *  Runtime API: change (or set) my content.
 ************************************************************/
function ac_set_content(gobj, event, kw, src)
{
    let priv = gobj.priv;
    let errors = [];
    let probe = normalize_spec(
        {id: gobj_read_attr(gobj, "node_id"), content: kw.content},
        errors, `${node_path_str(gobj)}`
    );
    if(!probe) {
        for(let e of errors) {
            log_error(`${GCLASS_NAME}: ${e}`);
        }
        return -1;
    }

    destroy_content(gobj);
    gobj_write_attr(gobj, "content", probe.content || {});
    repaint(gobj);
    return 0;
}

/************************************************************
 *  A descendant changed shape; keep bubbling to the root, which
 *  owns the site-map contribution.
 ************************************************************/
function ac_tree_changed(gobj, event, kw, src)
{
    notify_tree_changed(gobj);
    return 0;
}




                    /***************************
                     *      Public API
                     ***************************/




/************************************************************
 *  The runtime API.  Every call is an event: the machine trace
 *  IS the audit log of how the tree got its shape.
 ************************************************************/
function yui_node_add(node, spec, index)
{
    return gobj_send_event(node, "EV_ADD_NODE", {spec: spec, index: index}, node);
}

function yui_node_remove(node, node_id)
{
    return gobj_send_event(node, "EV_REMOVE_NODE", {node_id: node_id}, node);
}

function yui_node_set_projection(node, projection)
{
    return gobj_send_event(node, "EV_SET_PROJECTION", {projection: projection}, node);
}

function yui_node_set_content(node, content)
{
    return gobj_send_event(node, "EV_SET_CONTENT", {content: content}, node);
}

function yui_node_set_chrome_depth(node, depth)
{
    return gobj_send_event(node, "EV_SET_CHROME_DEPTH",
        {chrome_depth: depth}, node);
}

/************************************************************
 *  The tree's navigation mode: "stack" | "back" | "path".
 *  Send it to the ROOT — the whole tree reads it from there.
 ************************************************************/
function yui_node_set_nav_mode(node, mode)
{
    return gobj_send_event(node, "EV_SET_NAV_MODE", {nav_mode: mode}, node);
}

function yui_node_nav_mode(node)
{
    return gobj_read_attr(tree_root_of(node), "nav_mode") || "stack";
}

/************************************************************
 *  Resolve a path of ids from a node ("" = the node itself).
 *  Returns null when any segment is missing — callers that mean
 *  "the deepest living one" must say so.
 ************************************************************/
function yui_node_find(node, path)
{
    let r = walk_path(node, path);
    if(r.missing.length) {
        return null;
    }
    return r.node;
}

/************************************************************
 *  Canonical route of a node — for a host building shortcuts
 *  (toolbar quick links) without hardcoding paths.
 ************************************************************/
function yui_node_route(node)
{
    return route_of(node);
}

/************************************************************
 *  Version of the tree CONTRACT this node belongs to.
 *
 *  There is deliberately NO reparent/move API: once published, a
 *  node's path is a url someone may depend on, so the shape is a
 *  versioned contract, not runtime state.  Renames migrate
 *  through `aliases`; anything a version bump cannot cover is a
 *  new tree, declared as such.
 ************************************************************/
function yui_node_tree_version(node)
{
    return gobj_read_attr(tree_root_of(node), "tree_version") || "";
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

/***************************************************************
 *          Create the GClass
 ***************************************************************/
function create_gclass(gclass_name)
{
    if(__gclass__) {
        log_error(`GClass ALREADY created: ${gclass_name}`);
        return -1;
    }

    /*---------------------------------------------*
     *          States
     *
     *  ST_OFF   — not on the active path (nothing painted).
     *  ST_SELF  — I am the tip: my content and/or my index
     *             projection of my children.
     *  ST_CHILD — a child of mine is on the path: my chrome
     *             projection plus that child's body.
     *
     *  The mutation events are legal in every state on purpose:
     *  the tree is dynamic, so a node can gain or lose children
     *  while nobody is looking at it.
     *---------------------------------------------*/
    const states = [
        ["ST_OFF", [
            ["EV_ROUTE_CHANGED",        ac_route_changed,       null],
            ["EV_ACTIVATE",             ac_activate,            null],
            ["EV_ADD_NODE",             ac_add_node,            null],
            ["EV_REMOVE_NODE",          ac_remove_node,         null],
            ["EV_SET_PROJECTION",       ac_set_projection,      null],
            ["EV_SET_CHROME_DEPTH",     ac_set_chrome_depth,    null],
            ["EV_SET_NAV_MODE",         ac_set_nav_mode,        null],
            ["EV_SET_CONTENT",          ac_set_content,         null],
            ["EV_NODE_TREE_CHANGED",    ac_tree_changed,        null]
        ]],
        ["ST_SELF", [
            ["EV_ROUTE_CHANGED",        ac_route_changed,       null],
            ["EV_ACTIVATE",             ac_activate,            null],
            ["EV_DEACTIVATE",           ac_deactivate,          null],
            ["EV_NAV_CLICKED",          ac_nav_clicked,         null],
            ["EV_ADD_NODE",             ac_add_node,            null],
            ["EV_REMOVE_NODE",          ac_remove_node,         null],
            ["EV_SET_PROJECTION",       ac_set_projection,      null],
            ["EV_SET_CHROME_DEPTH",     ac_set_chrome_depth,    null],
            ["EV_SET_NAV_MODE",         ac_set_nav_mode,        null],
            ["EV_SET_CONTENT",          ac_set_content,         null],
            ["EV_NODE_TREE_CHANGED",    ac_tree_changed,        null]
        ]],
        ["ST_CHILD", [
            ["EV_ROUTE_CHANGED",        ac_route_changed,       null],
            ["EV_ACTIVATE",             ac_activate,            null],
            ["EV_DEACTIVATE",           ac_deactivate,          null],
            ["EV_NAV_CLICKED",          ac_nav_clicked,         null],
            ["EV_ADD_NODE",             ac_add_node,            null],
            ["EV_REMOVE_NODE",          ac_remove_node,         null],
            ["EV_SET_PROJECTION",       ac_set_projection,      null],
            ["EV_SET_CHROME_DEPTH",     ac_set_chrome_depth,    null],
            ["EV_SET_NAV_MODE",         ac_set_nav_mode,        null],
            ["EV_SET_CONTENT",          ac_set_content,         null],
            ["EV_NODE_TREE_CHANGED",    ac_tree_changed,        null]
        ]]
    ];

    /*---------------------------------------------*
     *          Events
     *---------------------------------------------*/
    const event_types = [
        ["EV_ROUTE_CHANGED",        0],
        ["EV_ACTIVATE",             0],
        ["EV_DEACTIVATE",           0],
        ["EV_NAV_CLICKED",          0],
        ["EV_ADD_NODE",             0],
        ["EV_REMOVE_NODE",          0],
        ["EV_SET_PROJECTION",       0],
        ["EV_SET_CHROME_DEPTH",     0],
        ["EV_SET_NAV_MODE",         0],
        ["EV_SET_CONTENT",          0],
        ["EV_NODE_TREE_CHANGED",    0]
    ];

    __gclass__ = gclass_create(
        gclass_name,
        event_types,
        states,
        gmt,
        0,  // lmt,
        attrs_table,
        PRIVATE_DATA,
        0,  // authz_table,
        0,  // command_table,
        0,  // s_user_trace_level
        0   // gclass_flag
    );

    if(!__gclass__) {
        return -1;
    }

    return 0;
}

/***************************************************************
 *          Register GClass
 ***************************************************************/
function register_c_yui_node()
{
    return create_gclass(GCLASS_NAME);
}

export {
    register_c_yui_node,
    yui_node_add,
    yui_node_remove,
    yui_node_set_projection,
    yui_node_set_content,
    yui_node_set_chrome_depth,
    yui_node_set_nav_mode,
    yui_node_nav_mode,
    yui_node_find,
    yui_node_route,
    yui_node_tree_version
};
