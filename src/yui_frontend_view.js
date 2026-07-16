/***********************************************************************
 *          yui_frontend_view.js
 *
 *          Frontend view — the gobj tree of the own yuno in a
 *          floating window, peer of the developer window (yui_dev.js).
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {
    createElement2,
    gobj_create_service,
    gobj_create_pure_child,
    gobj_find_service,
    gobj_read_attr,
    gobj_start_tree,
    log_error,
} from "@yuneta/gobj-js";

/*  Service name of the window. The host toggles the entry by looking
 *  it up, exactly as it does with "Developer-Window". */
const WIN_NAME = "Frontend-View-Window";


                    /******************************
                     *      Public API
                     ******************************/


/************************************************************
 *  Open the gobj tree (C_YUI_GOBJ_TREE_JS) inside a non-modal
 *  C_YUI_WINDOW (title bar + maximize + close + resize), the
 *  same shape as the developer window.
 *
 *  Shell-agnostic: the legacy C_YUI_MAIN shell has a
 *  '#top-layer' stacking element; the new C_YUI_SHELL does not.
 *  We pass that element when present, otherwise null — C_YUI_WINDOW
 *  falls back to document.body by contract.
 *
 *  Returns the window gobj, or null.
 ************************************************************/
function setup_frontend_view(self)
{
    if(gobj_find_service(WIN_NAME, false)) {
        return null;
    }

    /*  The tree is created AFTER the window, as a pure child of it, so
     *  every teardown path (the ✕, or the host destroying the window to
     *  toggle the entry off) takes the tree down with it. That is why
     *  the body is this placeholder: C_YUI_WINDOW builds its UI in
     *  mt_create, so it cannot be handed a gobj that does not exist yet. */
    let $body = createElement2(
        ["div", {class: "YFRONT_BODY",
            style: "height:100%; display:flex; flex-direction:column;"}, []]
    );

    let win = gobj_create_service(
        WIN_NAME,
        "C_YUI_WINDOW",
        {
            $parent: (typeof document !== "undefined" &&
                document.getElementById("top-layer")) || null,
            subscriber: null,
            modal: false,
            showMax: true,
            showFooter: false,
            resizable: true,
            center: false,
            auto_save_size_and_position: true,
            width: 900,
            height: 640,
            logical_class: "FRONTEND_VIEW_WINDOW",
            title: "frontend view",
            icon: "yi-hexagon-nodes",
            body: $body,
            /*  Opt into the dock/taskbar if the app provides one. `|| null`
             *  because gobj_find_service returns undefined when absent, and
             *  an undefined attr value logs "attr undefined: manager" (apps
             *  without a window manager, e.g. wattyzer). null = no dock. */
            manager: gobj_find_service("__window_manager__", false) || null,
        },
        self
    );
    if(!win) {
        log_error("yui_frontend_view: cannot create the frontend-view window");
        return null;
    }

    /*  The window is mounted by its mt_create, so $body is already live
     *  DOM here: the tree's own mt_start (build_graph + load_tree) and its
     *  ResizeObserver need the canvas attached to measure it. */
    let tree = gobj_create_pure_child("frontend_view_tree", "C_YUI_GOBJ_TREE_JS", {}, win);
    let $tree = gobj_read_attr(tree, "$container");
    if(!$tree) {
        log_error("yui_frontend_view: C_YUI_GOBJ_TREE_JS without $container");
        return win;
    }
    $body.appendChild($tree);

    gobj_start_tree(win);

    return win;
}

export {setup_frontend_view};
