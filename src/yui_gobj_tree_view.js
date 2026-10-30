/***********************************************************************
 *          yui_gobj_tree_view.js
 *
 *          The gobj tree of a yuno (C_YUI_GOBJ_TREE_JS) in a window of
 *          its own -- a sheet on a phone -- for a HOST that is not the
 *          Frontend view: typically one showing the tree of a BACKEND
 *          yuno (`source: "remote"`), which has to answer what the tree
 *          asks for (see the header of c_yui_gobj_tree_js.js).
 *
 *          The tree is a child of the host and publishes to it, so the
 *          host's FSM declares the four remote output events. The window
 *          is only its frame.
 *
 *              let handle = open_gobj_tree_view(gobj, {
 *                  name:         "gate_energy-4046",
 *                  source:       "remote",
 *                  yuno_name:    "gate_energy^4046",
 *                  title_prefix: "gate_energy^4046",
 *                  title:        "gobj tree",            // an i18n KEY
 *                  $header:      $status,                // optional
 *                  on_close:     () => gobj_send_event(gobj, "EV_VIEW_CLOSED", {}, gobj),
 *              });
 *              ...
 *              gobj_send_event(handle.tree, "EV_LOAD_TREE", {tree: answer.data}, gobj);
 *              ...
 *              close_gobj_tree_view(handle);   // in mt_stop
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {
    clean_name,
    createElement2,
    gobj_create,
    gobj_create_service,
    gobj_destroy,
    gobj_find_service,
    gobj_is_running,
    gobj_read_pointer_attr,
    gobj_short_name,
    gobj_start,
    gobj_stop,
    is_gobj,
    log_error,
    log_warning,
} from "@yuneta/gobj-js";

import {yui_shell_show_modal} from "./shell_modals.js";
import {yui_shell_of} from "./c_yui_shell.js";

import {t} from "i18next";


/************************************************************
 *  Open the tree.
 *
 *  opts:
 *      name          what tells this tree from another one of the
 *                    same host: it names the window and the tree,
 *                    and the tree keeps the reader's arrangement
 *                    (layout, folds, camera) under it.
 *      source        "local" | "remote" (the tree's attr).
 *      yuno_name     remote: the name the yuno is shown by.
 *      title         an i18n KEY, the kind of window.
 *      title_prefix  the DATA half of the title (the yuno).
 *      $header       an element shown above the tree (a status
 *                    line of the host), or nothing.
 *      on_close      called when the reader dismisses it (✕).
 *
 *  Returns {tree, win, modal}, or null (logged).
 ************************************************************/
function open_gobj_tree_view(host, opts)
{
    opts = opts || {};

    if(!host || !opts.name) {
        log_error(`yui_gobj_tree_view: open without a host or a name`);
        return null;
    }
    let name = clean_name(opts.name);

    let tree = gobj_create(
        `gobj-tree-${name}`,
        "C_YUI_GOBJ_TREE_JS",
        {
            source:     opts.source || "local",
            yuno_name:  opts.yuno_name || "",
            subscriber: host,
        },
        host
    );
    if(!tree) {
        log_error(`${gobj_short_name(host)}: cannot create the gobj tree '${name}'`);
        return null;
    }

    /*  CREATED, not started: its mt_start builds the graph, which
     *  measures a canvas and observes its size -- it has to be in the
     *  document, and the window below is what puts it there.  */
    let $tree = gobj_read_pointer_attr(tree, "$container");
    let $box = createElement2(
        ["div", {class: "GOBJ_TREE_VIEW_BODY",
                 style: "height:100%; display:flex; flex-direction:column; min-height:0;"}, []]
    );
    if(opts.$header) {
        $box.appendChild(opts.$header);
    }
    let $grow = createElement2(
        ["div", {class: "GOBJ_TREE_VIEW_TREE", style: "flex:1 1 auto; min-height:0;"}, []]
    );
    $grow.appendChild($tree);
    $box.appendChild($grow);

    let handle = {tree: tree, win: null, modal: null};

    /*  The ✕ path. `close_window()` calls this and THEN destroys the
     *  window, so the window (or the sheet) is cleared FIRST, and the
     *  tree -- which is not the window's child -- is taken down here,
     *  or it stays alive and running with nobody to see it.  */
    let on_close = () => {
        handle.win = null;
        handle.modal = null;
        close_gobj_tree_view(handle);

        if(typeof opts.on_close === "function") {
            opts.on_close();
        }
    };

    if(is_mobile()) {
        let shell = yui_shell_of(host);
        if(!shell) {
            log_error(`${gobj_short_name(host)}: no shell, cannot open the gobj tree sheet`);
            close_gobj_tree_view(handle);
            return null;
        }
        handle.modal = yui_shell_show_modal(shell, /* i18n: data */ $box, {
            dialog:        true,
            logical_class: "GOBJ_TREE_VIEW_SHEET",
            title_prefix:  opts.title_prefix || "",
            title:         opts.title || "",
            t:             t,
            on_close:      on_close,
        });
        gobj_start(tree);   /*  mounted: now it can measure itself  */
        return handle;
    }

    handle.win = gobj_create_service(
        `gobj-tree-win-${name}`,
        "C_YUI_WINDOW",
        {
            $parent:    (typeof document !== "undefined" &&
                         document.getElementById("top-layer")) || null,
            subscriber: null,
            modal:      false,
            showMax:    true,
            showFooter: false,
            resizable:  true,
            center:     true,
            auto_save_size_and_position: true,
            width:      960,
            height:     680,
            logical_class: "GOBJ_TREE_VIEW_WINDOW",
            title_prefix: opts.title_prefix || "",
            title:      opts.title || "",
            icon:       "yi-hexagon-nodes",
            body:       $box,
            manager:    gobj_find_service("__window_manager__", false) || null,
            on_close:   on_close,
        },
        host
    );
    if(!handle.win) {
        log_error(`${gobj_short_name(host)}: cannot create the gobj tree window '${name}'`);
        close_gobj_tree_view(handle);
        return null;
    }
    gobj_start(handle.win);
    gobj_start(tree);       /*  mounted: now it can measure itself  */

    return handle;
}

/************************************************************
 *  Close whatever open_gobj_tree_view() opened. Safe on null
 *  and on a handle whose window the reader already dismissed.
 ************************************************************/
function close_gobj_tree_view(handle)
{
    if(!handle) {
        return;
    }

    let tree = handle.tree;
    let win = handle.win;
    let modal = handle.modal;

    handle.tree = null;
    handle.win = null;
    handle.modal = null;

    if(win && is_gobj(win)) {
        try {
            /*  STOP, then destroy: gobj_destroy() of a running gobj
             *  logs and skips mt_stop. The ✕ path already stopped it.  */
            if(gobj_is_running(win)) {
                gobj_stop(win);
            }
            gobj_destroy(win);
        } catch(e) {
            log_warning(`yui_gobj_tree_view: window already gone: ${e}`);
        }
    }
    if(modal && typeof modal.close === "function") {
        try {
            modal.close();
        } catch(e) {
            log_warning(`yui_gobj_tree_view: sheet already gone: ${e}`);
        }
    }
    if(tree && is_gobj(tree)) {
        try {
            if(gobj_is_running(tree)) {
                gobj_stop(tree);
            }
            gobj_destroy(tree);
        } catch(e) {
            log_warning(`yui_gobj_tree_view: tree already gone: ${e}`);
        }
    }
}

/************************************************************
 *  A window is not a sheet: below this width there is no room
 *  for a title bar the reader can drag.
 ************************************************************/
function is_mobile()
{
    return typeof window !== "undefined" && window.innerWidth <= 768;
}

export {
    open_gobj_tree_view,
    close_gobj_tree_view,
};
