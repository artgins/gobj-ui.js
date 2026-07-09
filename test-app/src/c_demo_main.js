/***********************************************************************
 *          c_demo_main.js
 *
 *      C_DEMO_MAIN — a minimal stand-in for the legacy "__yui_main__"
 *      service. Some legacy components (e.g. C_YUI_MAP) look up
 *      gobj_find_service("__yui_main__") to subscribe to its EV_RESIZE
 *      and reflow on window resize. The declarative shell does not
 *      provide it, so this tiny service does: it publishes EV_RESIZE on
 *      window `resize`. Registering a "__yui_main__" service also
 *      silences the "gobj service not found: __yui_main__" log those
 *      components emit when it is absent.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {
    SDATA, SDATA_END, data_type_t,
    event_flag_t,
    gclass_create, log_error,
    gobj_publish_event,
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
    on_resize: null,
};

let __gclass__ = null;




                    /******************************
                     *      Framework Methods
                     ******************************/




/***************************************************************
 *          Framework Method: Start
 ***************************************************************/
function mt_start(gobj)
{
    let priv = gobj.priv;

    priv.on_resize = function() {
        gobj_publish_event(gobj, "EV_RESIZE", {
            width:  window.innerWidth,
            height: window.innerHeight
        });
    };
    window.addEventListener("resize", priv.on_resize);
}

/***************************************************************
 *          Framework Method: Stop
 ***************************************************************/
function mt_stop(gobj)
{
    let priv = gobj.priv;

    if(priv.on_resize) {
        window.removeEventListener("resize", priv.on_resize);
        priv.on_resize = null;
    }
}




                    /***************************
                     *      Actions
                     ***************************/




/***************************************************************
 *              FSM
 ***************************************************************/
const gmt = {
    mt_start:  mt_start,
    mt_stop:   mt_stop
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

    /*  EV_RESIZE is an optional-subscriber output event (the map may or
     *  may not be mounted), so tag it NO_WARN_SUBS. */
    const event_types = [
        ["EV_RESIZE",  event_flag_t.EVF_OUTPUT_EVENT | event_flag_t.EVF_NO_WARN_SUBS]
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
