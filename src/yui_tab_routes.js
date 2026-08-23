/***********************************************************************
 *          yui_tab_routes.js
 *
 *      A workspace whose tabs are opened at RUNTIME, and the two
 *      decisions its url costs.
 *
 *      The shape is always the same: a workspace home `/<ws>/<home>`
 *      with one tab per thing the operator has opened, at
 *      `/<ws>/<home>/<id>`, and whatever the tab is showing below
 *      that. The agent console does it per node, the treedb browser
 *      per (connection, treedb) — and both learned the same two
 *      lessons, one of them the hard way.
 *
 *      1. ON A COLD LOAD THE TAB'S ROUTE DOES NOT EXIST YET.
 *
 *      It is registered when the tab is opened, so a reload on
 *      `/<ws>/<home>/<id>/<what the tab was showing>` resolves only as
 *      far as the workspace home, and the shell hands the WHOLE rest
 *      over as the subpath: `<id>/<tail>`, not `<id>`. Reading all of
 *      it as the id matches nothing, and an app that then falls back
 *      to its first tab answers a reload with somebody else's default
 *      — which is the one thing a reload must not do. It also hides
 *      itself well: a BARE tab route survives, because there the
 *      subpath IS the id.
 *
 *      `yui_tab_split_subpath()` is that split. Only the id segment is
 *      decoded, and that is not a detail: these ids are composite
 *      (`<node>` + 0x1F + `<yuno>`, `<conn>` + 0x1F + `<treedb>`) and
 *      reach the url percent-encoded, so decoding the whole tail first
 *      would turn an encoded slash inside an id into a separator and
 *      cut it in two.
 *
 *      2. A TAB'S NAV ITEM IS A FIXED ROUTE.
 *
 *      `yui_shell_set_submenu()` registers it in the shell's item
 *      index, and that route is where the tab's view is MOUNTED and
 *      what a deep link resolves to. So the position inside a tab
 *      cannot travel in the item — moving it would move the mount —
 *      and has to be replayed when the tab is entered again.
 *
 *      "Entered again" is the whole subtlety, and it is why
 *      `yui_tab_position_plan()` is a function with tests rather than
 *      three lines inside an action: arriving at the root of the tab
 *      you were ALREADY in is the way OUT of whatever was open (the
 *      view's own back button), and replaying the position there would
 *      make that button do nothing.
 *
 *      WHAT IS NOT HERE: the wiring. One host restores on its
 *      transport's `EV_ON_OPEN`, another normalizes the route as it
 *      arrives, and both are right for what they know about when their
 *      tabs become real. These are the decisions, not the plumbing.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/

/***************************************************************
 *  Decode one url segment, or hand it back as it came.
 *
 *  A malformed percent escape throws, and an id that cannot be
 *  decoded is still better read raw than not read at all: it
 *  simply will not match an open tab, which is the honest answer.
 ***************************************************************/
function yui_tab_decode_id(segment)
{
    try {
        return decodeURIComponent(String(segment || ""));
    } catch(e) {
        return String(segment || "");
    }
}

/***************************************************************
 *  yui_tab_split_subpath(subpath) -> {id, tail}
 *
 *      subpath   what the shell left below the workspace home
 *
 *      `id`      the tab's id, decoded
 *      `tail`    what the tab was showing, untouched — it is the
 *                tab's own business and travels with it
 ***************************************************************/
function yui_tab_split_subpath(subpath)
{
    let sub = String(subpath || "");

    if(!sub) {
        return {id: "", tail: ""};
    }

    let slash = sub.indexOf("/");
    let raw_id = (slash < 0) ? sub : sub.slice(0, slash);
    let tail   = (slash < 0) ? ""  : sub.slice(slash + 1);

    return {id: yui_tab_decode_id(raw_id), tail: tail};
}

/***************************************************************
 *  yui_tab_position_plan(prev_base, base, subpath, remembered)
 *
 *      prev_base   the tab base the previous route resolved to
 *      base        the tab base this route resolves to
 *      subpath     what is left of the url below `base`
 *      remembered  the position last recorded for THIS tab
 *
 *      -> {record, replay}
 *
 *      `record` is the position to remember (null = leave it), and
 *      `replay` the route to normalize to (null = stay). Never both:
 *      a position is either being made or being restored.
 ***************************************************************/
function yui_tab_position_plan(prev_base, base, subpath, remembered)
{
    let inner = String(subpath || "");
    let here = String(base || "");

    if(!here) {
        return {record: null, replay: null};
    }

    /*  Somewhere inside the tab: that IS the position.  */
    if(inner) {
        return {record: `${here}/${inner}`, replay: null};
    }

    /*  At the root of the tab we were already in: the operator walked
     *  UP, on purpose, and that is a position too.  */
    if(prev_base === here) {
        return {record: here, replay: null};
    }

    /*  Entering the tab again: go back to where it was left, if that is
     *  anywhere other than the root it would land on anyway.  */
    let back = String(remembered || "");
    if(back && back !== here) {
        return {record: null, replay: back};
    }

    return {record: null, replay: null};
}


export {
    yui_tab_decode_id,
    yui_tab_split_subpath,
    yui_tab_position_plan,
};
