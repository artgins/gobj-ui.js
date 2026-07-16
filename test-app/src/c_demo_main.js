/***********************************************************************
 *          c_demo_main.js
 *
 *      C_DEMO_MAIN — a minimal stand-in for the legacy "__yui_main__"
 *      service. Some legacy components look it up with
 *      gobj_find_service("__yui_main__") and read its `theme` attr to
 *      pick a light/dark variant; the declarative shell provides no such
 *      service, so this tiny one does. Registering it also silences the
 *      "gobj service not found: __yui_main__" log those components emit
 *      when it is absent.
 *
 *      It used to publish EV_RESIZE on window `resize` for components to
 *      subscribe to. That path is gone: every one of them (C_YUI_WINDOW,
 *      C_YUI_MAP, the graph) now takes the browser's resize/ResizeObserver
 *      directly — start-independent, and one mechanism instead of two.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {
    SDATA, SDATA_END, data_type_t,
    gclass_create, log_error,
} from "@yuneta/gobj-js";


/***************************************************************
 *              Constants
 ***************************************************************/
const GCLASS_NAME = "C_DEMO_MAIN";


/***************************************************************
 *              Attrs
 ***************************************************************/
const attrs_table = [
/*  Legacy components (C_YUI_MAP) read `__yui_main__.theme` to pick a
 *  light/dark variant; declare it so the read doesn't log "attr NOT FOUND". */
SDATA(data_type_t.DTP_STRING,  "theme",  0,  "light",  "Active theme (light|dark)"),
SDATA_END()
];

let PRIVATE_DATA = {
};

let __gclass__ = null;




                    /******************************
                     *      Framework Methods
                     ******************************/




/*  No framework methods: this service is a `theme` attr holder, nothing
 *  more. */




                    /***************************
                     *      Actions
                     ***************************/




/***************************************************************
 *              FSM
 ***************************************************************/
const gmt = {
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
function register_c_demo_main()
{
    return create_gclass(GCLASS_NAME);
}

export {register_c_demo_main};
