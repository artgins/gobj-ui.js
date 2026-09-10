/***********************************************************************
 *          yui_json_pad.js
 *
 *          JSON viewer -- a blank C_YUI_JSON_PAD in a floating window,
 *          to paste JSON from outside and read it with the library's own
 *          viewer.  Peer of the frontend view (yui_frontend_view.js), and
 *          opened the same way: an entry of the account menu.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {
    createElement2,
    gclass_find_by_name,
    gobj_create_service,
    gobj_create_pure_child,
    gobj_find_service,
    gobj_read_attr,
    gobj_start_tree,
    log_error,
} from "@yuneta/gobj-js";

import {register_c_yui_json_pad} from "./c_yui_json_pad.js";

/*  Service name of the window. The host toggles the entry by looking
 *  it up, exactly as it does with "Frontend-View-Window". */
const WIN_NAME = "Json-Viewer-Window";


                    /******************************
                     *      Public API
                     ******************************/


/************************************************************
 *  Open a blank JSON pad (C_YUI_JSON_PAD) inside a non-modal
 *  C_YUI_WINDOW, the same shape as the frontend view.
 *
 *  Self-contained: it registers C_YUI_JSON_PAD (and the
 *  C_YUI_JSON it hosts) if the app did not, so an app gets the
 *  viewer with one menu entry and one action.
 *
 *  Returns the window gobj, or null.
 ************************************************************/
function setup_json_pad(self)
{
    if(gobj_find_service(WIN_NAME, false)) {
        return null;
    }
    if(!gclass_find_by_name("C_YUI_JSON_PAD", false)) {
        register_c_yui_json_pad();
    }

    /*  The pad is created AFTER the window, as a pure child of it, so
     *  every teardown path (the ✕, or the host destroying the window to
     *  toggle the entry off) takes the pad down with it -- which is why
     *  the body is a placeholder: C_YUI_WINDOW builds its UI in
     *  mt_create, before the pad exists. */
    let $body = createElement2(
        ["div", {class: "YJSONPAD_BODY",
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
            logical_class: "JSON_VIEWER_WINDOW",
            title: "json viewer",
            icon: "yi-code",
            body: $body,
            /*  `|| null`: an undefined attr value logs "attr undefined:
             *  manager" in an app without a window manager.  */
            manager: gobj_find_service("__window_manager__", false) || null,
        },
        self
    );
    if(!win) {
        log_error("yui_json_pad: cannot create the json-viewer window");
        return null;
    }

    /*  The window is mounted by its mt_create, so $body is live DOM here:
     *  the viewer's graph measures its canvas when it is first shown.  */
    let pad = gobj_create_pure_child("json_pad", "C_YUI_JSON_PAD", {}, win);
    let $pad = pad? gobj_read_attr(pad, "$container") : null;
    if(!$pad) {
        log_error("yui_json_pad: C_YUI_JSON_PAD without $container");
        return win;
    }
    $body.appendChild($pad);

    gobj_start_tree(win);

    return win;
}

export {setup_json_pad};
