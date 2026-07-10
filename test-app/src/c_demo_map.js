/***********************************************************************
 *          c_demo_map.js
 *
 *      C_DEMO_MAP — a map view for the demo. Hosts the gobj-ui component
 *      C_YUI_MAP (MapLibre). This one differs from the other wrappers:
 *      C_YUI_MAP has no $container — it renders into an external, already
 *      sized `$map` element that must be in the DOM BEFORE gobj_create.
 *      So mt_start builds the sized $map div, appends it, then creates
 *      the component. A few static devices become map markers.
 *
 *      NETWORK: the default basemap style pulls tiles from
 *      tiles.openfreemap.org — the demo run needs network (and, if a CSP
 *      is added, that host allow-listed). Offline it degrades to a blank
 *      map with controls.
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
    createElement2,
    refresh_language,
} from "@yuneta/gobj-js";

import {t} from "i18next";


/***************************************************************
 *              Constants
 ***************************************************************/
const GCLASS_NAME = "C_DEMO_MAP";

let __instance_counter__ = 0;

const MAP_SETTINGS = {
    style: "https://tiles.openfreemap.org/styles/liberty",
    center: [-3.7038, 40.4168],   // [lng, lat] — Madrid
    zoom: 5,
    scrollZoom: true
};

/*  Static devices → markers. coordinates are [lng, lat]. `connected` feeds
 *  C_YUI_MAP's style expressions (marker/cluster colour); without it maplibre
 *  warns "expected number, found null". No gobj_service_name here, so a marker
 *  click shows the plain name/id popup (the window branch needs a service). */
const DEVICES = [
    {id: "madrid",    name: "Madrid",    connected: true,  settings: {coordinates: [-3.7038, 40.4168]}},
    {id: "barcelona", name: "Barcelona", connected: true,  settings: {coordinates: [ 2.1734, 41.3851]}},
    {id: "sevilla",   name: "Sevilla",   connected: false, settings: {coordinates: [-5.9845, 37.3891]}},
    {id: "bilbao",    name: "Bilbao",    connected: true,  settings: {coordinates: [-2.9350, 43.2630]}}
];


/***************************************************************
 *              Attrs
 ***************************************************************/
const attrs_table = [
SDATA(data_type_t.DTP_POINTER,  "subscriber",   0,  null,   "Subscriber of output events"),

SDATA(data_type_t.DTP_STRING,   "title",        0,  "Map",  "Card title"),
SDATA(data_type_t.DTP_STRING,   "lead",         0,  "",     "Explanatory paragraph"),
SDATA(data_type_t.DTP_POINTER,  "$container",   0,  null,   "Root HTMLElement (shell contract)"),
SDATA_END()
];

let PRIVATE_DATA = {
    map: null,
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
    let priv = gobj.priv;
    let $c = gobj_read_attr(gobj, "$container");
    let $holder = $c ? $c.querySelector(".DEMO_MAP_HOLDER") : null;
    if(!$holder) {
        log_error(`${GCLASS_NAME}: no map holder`);
        return;
    }

    /*  C_YUI_MAP renders into this external, pre-sized, in-DOM element. */
    let $map = createElement2(
        ["div", {class: "DEMO_MAP_EL",
                 id: "demo_map_" + (++__instance_counter__),
                 style: "width:100%; height:100%;"}]
    );
    $holder.appendChild($map);

    priv.map = gobj_create_pure_child(
        "demo_map_widget",
        "C_YUI_MAP",
        {
            $map:         $map,
            devices:      DEVICES,
            map_settings: MAP_SETTINGS
        },
        gobj
    );
    gobj_start(priv.map);
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
 *  Build the card: header + a full-height holder for the map.
 ***************************************************************/
function build_ui(gobj)
{
    let title = gobj_read_attr(gobj, "title") || "Map";
    let lead  = gobj_read_attr(gobj, "lead")  || "";

    let head = [
        ["h1", {class: "DEMO_TITLE title is-3 mb-2", i18n: title}, title]
    ];
    if(lead) {
        head.push(["p", {class: "DEMO_LEAD content", i18n: lead, style: "max-width:60ch;"}, lead]);
    }

    let $c = createElement2(
        ["div", {class: "C_DEMO_MAP DEMO_CARD view-card"}, [
            ["div", {class: "DEMO_HEAD"}, head],
            ["div", {class: "DEMO_MAP_HOLDER",
                     style: "flex:1; min-height:0; border-radius:0.5rem; overflow:hidden;"}, []]
        ]]
    );
    gobj_write_attr(gobj, "$container", $c);
    refresh_language($c, t);
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
        ["ST_IDLE", []]
    ];

    const event_types = [];

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
function register_c_demo_map()
{
    return create_gclass(GCLASS_NAME);
}

export {register_c_demo_map};
