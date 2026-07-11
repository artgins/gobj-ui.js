/***********************************************************************
 *          c_demo_modals.js
 *
 *      C_DEMO_MODALS — the volatil-modal helpers of c_yui_main.js as a
 *      live view. One button per helper: the blocking questions
 *      (get_yesnocancel / get_yesno / get_ok — Enter answers yes,
 *      Escape cancels/dismisses without stacking) and the typed
 *      messages (display_info/warning/error_message, tinted round
 *      icon + accent-colored accept). Each answer is echoed below
 *      the buttons. No child gobj: the helpers are plain functions
 *      that mount a Bulma modal on the popup layer and destroy it
 *      on answer.
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
    createElement2,
    refresh_language,
} from "@yuneta/gobj-js";

import {
    get_yesnocancel,
    get_yesno,
    get_ok,
    display_info_message,
    display_warning_message,
    display_error_message,
} from "@yuneta/gobj-ui/src/c_yui_main.js";

import {t} from "i18next";


/***************************************************************
 *              Constants
 ***************************************************************/
const GCLASS_NAME = "C_DEMO_MODALS";

/*  One entry per helper: button spec + the call it demonstrates. */
const TRIGGERS = [
    {
        id: "yesnocancel", label: "yes / no / cancel", icon: "yi-question",
        run: (echo) => {
            get_yesnocancel("All changes will be lost. Are you sure?", (answer) => {
                echo(`get_yesnocancel -> "${answer}"`);
            });
        }
    },
    {
        id: "yesno", label: "yes / no", icon: "yi-question",
        run: (echo) => {
            get_yesno(t("Delete the selected records?"), (answer) => {
                echo(`get_yesno -> "${answer}"`);
            });
        }
    },
    {
        id: "ok", label: "ok", icon: "yi-square-check",
        run: (echo) => {
            get_ok(t("Operation completed."), (answer) => {
                echo(`get_ok -> "${answer}"`);
            });
        }
    },
    {
        id: "info", label: "info", icon: "yi-circle-info",
        run: (echo) => {
            display_info_message(null, t("This node runs release 7.7.2."), () => {
                echo("display_info_message -> accepted");
            });
        }
    },
    {
        id: "warning", label: "warning", icon: "yi-triangle-exclamation",
        run: (echo) => {
            display_warning_message(null, t("The connection is unstable."), () => {
                echo("display_warning_message -> accepted");
            });
        }
    },
    {
        id: "error", label: "error", icon: "yi-circle-exclamation",
        run: (echo) => {
            display_error_message(null, t("The yuno did not answer."), () => {
                echo("display_error_message -> accepted");
            });
        }
    },
];


/***************************************************************
 *              Attrs
 ***************************************************************/
const attrs_table = [
SDATA(data_type_t.DTP_POINTER,  "subscriber",   0,  null,   "Subscriber of output events"),

SDATA(data_type_t.DTP_STRING,   "title",        0,  "Modals", "Card title"),
SDATA(data_type_t.DTP_STRING,   "lead",         0,  "",     "Explanatory paragraph"),
SDATA(data_type_t.DTP_POINTER,  "$container",   0,  null,   "Root HTMLElement (shell contract)"),
SDATA_END()
];

let PRIVATE_DATA = {
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
 *  Build the card: header + one button per helper + echo line.
 ***************************************************************/
function build_ui(gobj)
{
    let title = gobj_read_attr(gobj, "title") || "Modals";
    let lead  = gobj_read_attr(gobj, "lead")  || "";

    let head = [
        ["h1", {class: "DEMO_TITLE title is-3 mb-2", i18n: title}, title]
    ];
    if(lead) {
        head.push(["p", {class: "DEMO_LEAD content", i18n: lead, style: "max-width:60ch;"}, lead]);
    }

    let buttons = [];
    for(let trig of TRIGGERS) {
        buttons.push(
            ["button", {
                class: "DEMO_MODALS_TRIGGER button",
                "data-trigger": trig.id,
                title: trig.label,
                "aria-label": trig.label
            }, [
                ["i", {class: trig.icon, "aria-hidden": "true"}],
                ["span", {class: "is-hidden-mobile", i18n: trig.label,
                          style: "padding-left:5px;"}, trig.label]
            ]]
        );
    }

    let $c = createElement2(
        ["div", {class: "C_DEMO_MODALS DEMO_CARD view-card"}, [
            ["div", {class: "DEMO_HEAD"}, head],
            ["div", {class: "DEMO_MODALS_TRIGGERS buttons"}, buttons],
            ["p", {class: "DEMO_MODALS_RESULT is-size-7 has-text-grey"}, "—"]
        ]]
    );

    const echo = (text) => {
        let $r = $c.querySelector(".DEMO_MODALS_RESULT");
        if($r) {
            $r.textContent = text;
        }
    };
    for(let trig of TRIGGERS) {
        let $btn = $c.querySelector(`[data-trigger="${trig.id}"]`);
        if($btn) {
            $btn.addEventListener("click", () => {
                trig.run(echo);
            });
        }
    }

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
function register_c_demo_modals()
{
    return create_gclass(GCLASS_NAME);
}

export {register_c_demo_modals};
