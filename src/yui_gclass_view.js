/***********************************************************************
 *          yui_gclass_view.js
 *
 *          The gclass viewer: what a GClass IS, in a window.
 *
 *          The framework had no such viewer. The C kernel answers
 *          `view-gclass` with a full description (attrs, commands,
 *          methods, FSM) and the only reader of it was a terminal.
 *          This one draws that same document with C_YUI_JSON, so the
 *          FSM of a gclass is a graph and its attrs table is a tree,
 *          and it takes the document from either side:
 *
 *            - a gclass of the browser yuno  -> describe_local_gclass()
 *            - a gclass of a backend yuno    -> `opts.description`, the
 *                                               answer of `view-gclass`
 *
 *          One window at a time per host: the caller keeps the handle
 *          and closes it, the way the treedb graph keeps its raw-JSON
 *          viewer.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {
    clean_name,
    gclass_find_by_name,
    gobj_create_service,
    gobj_destroy,
    gobj_find_service,
    gobj_is_running,
    gobj_name,
    gobj_read_pointer_attr,
    gobj_short_name,
    gobj_start,
    gobj_stop,
    is_gobj,
    log_error,
    log_warning,
} from "@yuneta/gobj-js";

import {describe_local_gclass} from "./gclass_describe.js";
import {yui_shell_show_error, yui_shell_show_modal, yui_shell_popup_layer} from "./shell_modals.js";
import {yui_shell_of} from "./c_yui_shell.js";

import {t} from "i18next";


/************************************************************
 *  Can this app show a gclass at all?
 *
 *  The viewer is C_YUI_JSON, and an app registers only the
 *  gclasses it mounts. The caller asks this BEFORE drawing a
 *  button, so an app that does not carry the viewer shows no
 *  control instead of a control that fails.
 ************************************************************/
function gclass_view_available()
{
    return !!gclass_find_by_name("C_YUI_JSON", false);
}


/************************************************************
 *  Open the viewer on `gclass_name`.
 *
 *  opts:
 *      description   the document to draw. Omitted, it is
 *                    built from the browser registry.
 *      title_prefix  what the window says before the gclass
 *                    name (the yuno it belongs to).
 *      on_close      called when the reader dismisses it.
 *
 *  Returns a handle for close_gclass_view(), or null (and a
 *  logged reason) when there is nothing to show.
 ************************************************************/
function open_gclass_view(host, gclass_name, opts)
{
    opts = opts || {};

    if(!host || !gclass_name) {
        log_error(`yui_gclass_view: open without a host or a gclass name`);
        return null;
    }

    let shell = yui_shell_of(host);

    if(!gclass_view_available()) {
        log_error(`${gobj_short_name(host)}: C_YUI_JSON not registered by the app`);
        yui_shell_show_error(shell, "gclass viewer unavailable", {t: t});
        return null;
    }

    let description = opts.description || describe_local_gclass(gclass_name);
    if(!description) {
        /*  Not an error: a gclass of a BACKEND yuno is not in this
         *  registry and never will be. It is the caller's job to bring
         *  the description; say which gclass could not be found.  */
        log_warning(`${gobj_short_name(host)}: gclass not registered here: ${gclass_name}`);
        yui_shell_show_error(shell, "gclass not registered in this yuno", {t: t});
        return null;
    }

    let jv = gobj_create_service(
        `gclass-view-${clean_name(gobj_name(host))}`,
        "C_YUI_JSON",
        {
            /*  No `title`: the host titles it -- the window's title bar
             *  on desktop, the dialog's header on mobile. The viewer's
             *  own title would land INSIDE that host, doubling it.  */
            json_data:  description,
            subscriber: null,
        },
        host
    );
    if(!jv) {
        log_error(`${gobj_short_name(host)}: cannot create the gclass viewer`);
        return null;
    }

    /*  CREATED, not started. `mt_create` builds the DOM; `mt_start`
     *  RENDERS it -- and the viewer's graph view measures a canvas and
     *  puts a ResizeObserver on it, both of which need the element to be
     *  in the document. The window below is what puts it there, so the
     *  start goes after the window, at the bottom of this function.
     *
     *  Starting it here worked for as long as the reader had last used
     *  the tree view: the graph is built on first entry, which was after
     *  the window. The moment the viewer REMEMBERED the graph view, it
     *  built it inside mt_start, detached, found no mount, attached no
     *  observer -- and the canvas kept its birth size for the life of
     *  the window while the window resized around it.  */
    let handle = {json_gobj: jv, win: null, modal: null};
    let $box = gobj_read_pointer_attr(jv, "$container");

    let on_close = () => {
        if(typeof opts.on_close === "function") {
            opts.on_close();
        }
    };

    if(is_mobile()) {
        if(!shell) {
            log_error(`${gobj_short_name(host)}: no shell, cannot open the gclass sheet`);
            close_gclass_view(handle);
            return null;
        }
        handle.modal = yui_shell_show_modal(shell, $box, {
            dialog:        true,
            logical_class: "GCLASS_VIEW_SHEET",
            title_prefix:  opts.title_prefix || "",
            title:         gclass_name,
            t:             t,
            on_close:      on_close,
        });
        gobj_start(jv);     /*  mounted: now it can measure itself  */
        return handle;
    }

    let $win_parent = window_layer_of(host, shell);

    handle.win = gobj_create_service(
        `gclass-win-${clean_name(gobj_name(host))}`,
        "C_YUI_WINDOW",
        {
            $parent:    $win_parent,
            subscriber: null,
            modal:      false,
            showMax:    true,
            showFooter: false,
            resizable:  true,
            center:     true,
            auto_save_size_and_position: true,
            width:      720,
            height:     640,
            logical_class: "GCLASS_VIEW_WINDOW",
            title_prefix: opts.title_prefix || "",
            title:      gclass_name,
            icon:       "yi-code",
            body:       $box,
            /*  The same dock the other windows are on: raising a window
             *  is the manager's job, and a viewer registered nowhere
             *  cannot come to the front when the reader clicks it. `||
             *  null` because gobj_find_service answers undefined when
             *  absent, and an undefined attr logs "attr undefined".  */
            manager:    gobj_find_service("__window_manager__", false) || null,
            on_close:   on_close,
        },
        host
    );
    if(!handle.win) {
        log_error(`${gobj_short_name(host)}: cannot create the gclass window`);
        close_gclass_view(handle);
        return null;
    }
    gobj_start(handle.win);
    gobj_start(jv);         /*  mounted: now it can measure itself  */

    return handle;
}

/************************************************************
 *  Close whatever open_gclass_view() opened. Safe on null and
 *  on a handle whose window the reader already dismissed.
 ************************************************************/
function close_gclass_view(handle)
{
    if(!handle) {
        return;
    }

    let jv = handle.json_gobj;
    let win = handle.win;
    let modal = handle.modal;

    handle.json_gobj = null;
    handle.win = null;
    handle.modal = null;

    if(win && is_gobj(win)) {
        try {
            /*  STOP, then destroy: gobj_destroy() raises the `destroying`
             *  flag before it can stop a running gobj, so destroying it
             *  straight logs two errors and skips mt_stop. The ✕ path
             *  already stopped it (close_window) -- hence the guard.  */
            if(gobj_is_running(win)) {
                gobj_stop(win);
            }
            gobj_destroy(win);
        } catch(e) {
            log_warning(`yui_gclass_view: window already gone: ${e}`);
        }
    }
    if(modal && typeof modal.close === "function") {
        try {
            modal.close();
        } catch(e) {
            log_warning(`yui_gclass_view: modal already gone: ${e}`);
        }
    }
    if(jv && is_gobj(jv)) {
        try {
            if(gobj_is_running(jv)) {
                gobj_stop(jv);
            }
            gobj_destroy(jv);
        } catch(e) {
            log_warning(`yui_gclass_view: viewer already gone: ${e}`);
        }
    }
}

/************************************************************
 *  Where to mount the window: the SAME element the caller's
 *  own window hangs from.
 *
 *  Not a preference -- a requirement. z-index only orders
 *  siblings of one stacking context, so a viewer opened from a
 *  window on `body` and mounted in the shell's popup layer
 *  lands BEHIND its opener whatever number it is given, and
 *  the button reads as one that did nothing.
 ************************************************************/
function window_layer_of(host, shell)
{
    let $c = gobj_read_pointer_attr(host, "$container");
    if($c && typeof $c.closest === "function") {
        let $win = $c.closest(".C_YUI_WINDOW");
        if($win && $win.parentNode) {
            return $win.parentNode;
        }
    }

    return (typeof document !== "undefined" &&
            document.getElementById("top-layer")) ||
        (shell && yui_shell_popup_layer(shell)) ||
        null;
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
    gclass_view_available,
    open_gclass_view,
    close_gclass_view,
};
