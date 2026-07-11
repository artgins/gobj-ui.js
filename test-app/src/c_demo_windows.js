/***********************************************************************
 *          c_demo_windows.js
 *
 *      C_DEMO_WINDOWS — floating windows + dock for the demo. Each
 *      press of "new window" spawns a C_YUI_WINDOW child (draggable
 *      titlebar, resizable edges, maximize, minimize) opted into the
 *      app's C_YUI_WINDOW_MANAGER service ("__window_manager__",
 *      created in main.js) via its `manager` attr: minimize rolls the
 *      window to a dock chip, a pointer press raises/focuses it, ✕
 *      closes it (the window destroys itself and unregisters).
 *
 *      The manager mounts its dock INLINE into this card's
 *      DEMO_WINDOWS_DOCK strip (main.js passes it as inline_selector),
 *      so the demo shows the dock without covering the shell's mobile
 *      icon-bar; while the strip is not in the DOM the manager falls
 *      back to a floating dock (bottom-left) by contract.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {
    SDATA, SDATA_END, data_type_t,
    gclass_create, log_error,
    gobj_parent,
    gobj_read_attr, gobj_read_pointer_attr, gobj_write_attr,
    gobj_subscribe_event,
    gobj_create, gobj_start,
    gobj_find_service,
    createElement2,
    refresh_language,
} from "@yuneta/gobj-js";

import {t} from "i18next";


/***************************************************************
 *              Constants
 ***************************************************************/
const GCLASS_NAME = "C_DEMO_WINDOWS";

const WINDOW_ICONS = ["yi-terminal", "yi-gear", "yi-eye", "yi-envelope"];


/***************************************************************
 *              Attrs
 ***************************************************************/
const attrs_table = [
SDATA(data_type_t.DTP_POINTER,  "subscriber",   0,  null,   "Subscriber of output events"),

SDATA(data_type_t.DTP_STRING,   "title",        0,  "Windows", "Card title"),
SDATA(data_type_t.DTP_STRING,   "lead",         0,  "",     "Explanatory paragraph"),
SDATA(data_type_t.DTP_POINTER,  "$container",   0,  null,   "Root HTMLElement (shell contract)"),
SDATA_END()
];

let PRIVATE_DATA = {
    counter: 0,
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
    let subscriber = gobj_read_pointer_attr(gobj, "subscriber");
    if(!subscriber) {
        subscriber = gobj_parent(gobj);
    }
    gobj_subscribe_event(gobj, null, {}, subscriber);

    build_ui(gobj);
}

/***************************************************************
 *          Framework Method: Start
 ***************************************************************/
function mt_start(gobj)
{
}

/***************************************************************
 *          Framework Method: Stop
 ***************************************************************/
function mt_stop(gobj)
{
}

/***************************************************************
 *          Framework Method: Destroy
 ***************************************************************/
function mt_destroy(gobj)
{
    let $c = gobj_read_attr(gobj, "$container");
    if($c && $c.parentNode) {
        $c.parentNode.removeChild($c);
    }
    gobj_write_attr(gobj, "$container", null);
}




                    /***************************
                     *      Local Methods
                     ***************************/




/***************************************************************
 *  Spawn one numbered window as a child of this view (the view
 *  is keep_alive, so open windows survive navigating away —
 *  normal window behaviour). The window subscribes nothing back
 *  (subscriber: null) and opts into the dock via `manager`.
 ***************************************************************/
function spawn_window(gobj)
{
    let priv = gobj.priv;
    priv.counter++;
    let n = priv.counter;
    let k = (n - 1) % 6;
    let icon = WINDOW_ICONS[(n - 1) % WINDOW_ICONS.length];

    /*  Cascade away from the card (its "new window" button must stay
     *  clickable under the spawned windows); on narrow viewports drop
     *  to the lower half and clamp the width to the screen. */
    let vw = window.innerWidth;
    let vh = window.innerHeight;
    let wide = vw >= 1024;
    let win_w = Math.min(380, vw - 24);
    let x = wide ? 400 + k * 36 : 12 + k * 20;
    let y = wide ? 90 + k * 32 : Math.round(vh * 0.40) + k * 24;

    let win = gobj_create(
        `demo_window_${n}`,
        "C_YUI_WINDOW",
        {
            subscriber: null,
            title: `${t("window")} ${n}`,
            icon: icon,
            header: ['span', {class: 'px-2 has-text-weight-semibold'},
                `${t("window")} ${n}`],
            body: ['div', {class: 'p-3'}, [
                ['p', {class: 'mb-2'},
                    t("A plain C_YUI_WINDOW. Drag the titlebar, resize the edges.")],
                ['p', {class: 'is-size-7 has-text-grey'},
                    t("Minimize docks it as a chip; a press raises it; the x closes it.")]
            ]],
            x: x,
            y: y,
            width: win_w,
            height: 240,
            center: false,
            showFooter: false,
            modal: false,
            manager: gobj_find_service("__window_manager__", false) || null,
        },
        gobj
    );
    gobj_start(win);
    set_result(gobj, `${t("window")} ${n} ${t("opened")}`);
}

/***************************************************************
 *  Build the card: header + "new window" button + inline dock
 *  strip (the window manager mounts its chips here) + echo line.
 ***************************************************************/
function build_ui(gobj)
{
    let title = gobj_read_attr(gobj, "title") || "Windows";
    let lead  = gobj_read_attr(gobj, "lead")  || "";

    let head = [
        ["h1", {class: "DEMO_TITLE title is-3 mb-2", i18n: title}, title]
    ];
    if(lead) {
        head.push(["p", {class: "DEMO_LEAD content", i18n: lead, style: "max-width:60ch;"}, lead]);
    }

    let $c = createElement2(
        ["div", {class: "C_DEMO_WINDOWS DEMO_CARD view-card"}, [
            ["div", {class: "DEMO_HEAD"}, head],
            ["div", {class: "DEMO_WINDOWS_ACTIONS buttons"}, [
                ["button", {
                    class: "DEMO_WINDOWS_NEW button",
                    title: "new window",
                    "aria-label": "new window"
                }, [
                    ["i", {class: "yi-plus", "aria-hidden": "true"}],
                    ["span", {class: "is-hidden-mobile", i18n: "new window",
                              style: "padding-left:5px;"}, "new window"]
                ], {
                    click: function(evt) {
                        evt.stopPropagation();
                        spawn_window(gobj);
                    }
                }]
            ]],
            ["p", {class: "DEMO_WINDOWS_DOCK_LABEL is-size-7 has-text-grey mb-1",
                   i18n: "Dock (minimized windows land here):"},
                "Dock (minimized windows land here):"],
            ["div", {class: "DEMO_WINDOWS_DOCK box p-2 mb-2",
                     style: "min-height:3rem;"}, []],
            ["p", {class: "DEMO_WINDOWS_RESULT is-size-7 has-text-grey"}, "—"]
        ]]
    );

    gobj_write_attr(gobj, "$container", $c);
    refresh_language($c, t);
}

/***************************************************************
 *  Show a short outcome line under the dock.
 ***************************************************************/
function set_result(gobj, text)
{
    let $c = gobj_read_attr(gobj, "$container");
    if($c) {
        let $r = $c.querySelector(".DEMO_WINDOWS_RESULT");
        if($r) {
            $r.textContent = text;
        }
    }
}




                    /***************************
                     *      Actions
                     ***************************/




/***************************************************************
 *              FSM
 ***************************************************************/
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

    const states = [
        ["ST_IDLE", [
        ]]
    ];

    const event_types = [
    ];

    __gclass__ = gclass_create(
        gclass_name,
        event_types,
        states,
        gmt,
        0,  // lmt
        attrs_table,
        PRIVATE_DATA,
        0,  // authz_table
        0,  // command_table
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
function register_c_demo_windows()
{
    return create_gclass(GCLASS_NAME);
}

export {register_c_demo_windows};
