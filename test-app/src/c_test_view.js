/***********************************************************************
 *          c_test_view.js
 *
 *      C_TEST_VIEW — the single view gclass every menu leaf of the
 *      demo mounts. It exposes a $container (the hard contract of
 *      C_YUI_SHELL) and renders a card that names, on screen, which
 *      nav layout(s) are currently visible and where — so the demo is
 *      self-describing as you navigate.
 *
 *      Two extras make the shell's behaviour observable:
 *          - an "instance #" counter (monotonic per created gobj), so
 *            keep_alive vs lazy_destroy is visible: revisiting a
 *            keep_alive leaf keeps its number, a lazy_destroy leaf gets
 *            a fresh one.
 *          - an optional embedded accordion: when kw.nav_items is set
 *            the card hosts a live C_YUI_NAV rendered as "accordion"
 *            (a primary-zone layout that can't appear as a submenu).
 *            Its clicks arrive here as EV_NAV_CLICKED and we route them
 *            by setting the hash, exactly as the shell would.
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
    gobj_create_pure_child, gobj_start,
    gobj_name,
    createElement2,
} from "@yuneta/gobj-js";


/***************************************************************
 *              Constants
 ***************************************************************/
const GCLASS_NAME = "C_TEST_VIEW";

let __instance_counter__ = 0;


/***************************************************************
 *              Attrs
 ***************************************************************/
const attrs_table = [
SDATA(data_type_t.DTP_POINTER,  "subscriber",   0,  null,   "Subscriber of output events"),

SDATA(data_type_t.DTP_STRING,   "title",        0,  "View", "Card title"),
SDATA(data_type_t.DTP_STRING,   "lead",         0,  "",     "Explanatory paragraph"),
SDATA(data_type_t.DTP_JSON,     "badges",       0,  null,   "Array of 'zone: layout' badge strings"),
SDATA(data_type_t.DTP_JSON,     "nav_items",    0,  null,   "When set, embed a live accordion C_YUI_NAV built from these items"),
SDATA(data_type_t.DTP_POINTER,  "$container",   0,  null,   "Root HTMLElement (shell contract)"),
SDATA(data_type_t.DTP_INTEGER,  "instance_id",  0,  0,      "Monotonic id of this instance"),
SDATA_END()
];

let PRIVATE_DATA = {};
let __gclass__ = null;




                    /******************************
                     *      Framework Methods
                     ******************************/




/***************************************************************
 *          Framework Method: Create
 ***************************************************************/
function mt_create(gobj)
{
    /*
     *  CHILD subscription model
     */
    let subscriber = gobj_read_pointer_attr(gobj, "subscriber");
    if(!subscriber) {
        subscriber = gobj_parent(gobj);
    }
    gobj_subscribe_event(gobj, null, {}, subscriber);

    let id = ++__instance_counter__;
    gobj_write_attr(gobj, "instance_id", id);
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
 *  Build the demo card.
 ***************************************************************/
function build_ui(gobj)
{
    let title  = gobj_read_attr(gobj, "title") || "View";
    let lead   = gobj_read_attr(gobj, "lead")  || "";
    let badges = gobj_read_attr(gobj, "badges");
    let id     = gobj_read_attr(gobj, "instance_id");

    let header = [
        ["h1", {class: "DEMO_TITLE title is-3 mb-2"}, title]
    ];
    if(lead) {
        header.push(
            ["p", {class: "DEMO_LEAD content", style: "max-width:60ch;"}, lead]
        );
    }
    if(Array.isArray(badges) && badges.length > 0) {
        let tags = [];
        for(let b of badges) {
            tags.push(["span", {class: "tag is-info is-light mr-2 mb-2"}, String(b)]);
        }
        header.push(["div", {class: "DEMO_BADGES tags"}, tags]);
    }

    let children = [
        ["div", {class: "DEMO_HEAD"}, header]
    ];

    /*  Optional embedded accordion illustration (see file header). */
    let nav_items = gobj_read_attr(gobj, "nav_items");
    let $accordion = null;
    if(Array.isArray(nav_items) && nav_items.length > 0) {
        children.push(
            ["div", {class: "DEMO_ACCORDION_HOLDER box p-2", style: "max-width:22rem;"}, []]
        );
    }

    children.push(
        ["p", {class: "DEMO_META is-size-7 has-text-grey mt-auto"},
            `gobj: ${gobj_name(gobj)}  ·  instance #${id}`
        ]
    );

    let $c = createElement2(
        ["div", {class: "C_TEST_VIEW DEMO_CARD view-card"}, children]
    );
    gobj_write_attr(gobj, "$container", $c);

    /*  The accordion nav is a real gobj: create it after $container
     *  exists, mount it into the holder, then start it (pure children
     *  are not auto-started). Its clicks reach us as EV_NAV_CLICKED. */
    if(Array.isArray(nav_items) && nav_items.length > 0) {
        let nav = gobj_create_pure_child(
            "demo_accordion",
            "C_YUI_NAV",
            {
                menu_id:    "demo.accordion",
                menu_items: nav_items,
                layout:     "accordion",
                level:      "primary",
                show_label: true
            },
            gobj
        );
        let $nav = gobj_read_attr(nav, "$container");
        let $holder = $c.querySelector(".DEMO_ACCORDION_HOLDER");
        if($nav && $holder) {
            $holder.appendChild($nav);
            gobj_start(nav);
        } else {
            log_error(`${GCLASS_NAME}: embedded accordion nav has no $container`);
        }
    }
}




                    /***************************
                     *      Actions
                     ***************************/




/***************************************************************
 *  A leaf of the embedded accordion was clicked. The nav never
 *  navigates on its own (it emits the intent); route it the same
 *  way the shell does under use_hash — set the location hash and
 *  let C_YUI_SHELL's hashchange listener resolve it.
 ***************************************************************/
function ac_nav_clicked(gobj, event, kw, src)
{
    let route = kw && kw.route;
    if(route) {
        window.location.hash = "#" + route;
    }
    return 0;
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
     *---------------------------------------------*/
    const states = [
        ["ST_IDLE", [
            ["EV_NAV_CLICKED",  ac_nav_clicked,  null]
        ]]
    ];

    /*---------------------------------------------*
     *          Events
     *---------------------------------------------*/
    const event_types = [
        ["EV_NAV_CLICKED",  0]
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
function register_c_test_view()
{
    return create_gclass(GCLASS_NAME);
}

export {register_c_test_view};
