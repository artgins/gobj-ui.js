/***********************************************************************
 *          c_demo_wizard.js
 *
 *      C_DEMO_WIZARD — a wizard view for the demo. Hosts the gobj-ui
 *      component C_YUI_WIZARD (Pattern B: title + "N / M" + Back/Next,
 *      Confirm on the last step). Steps are fed up-front with
 *      EV_SET_STEPS; here each step's content is a plain createElement2
 *      array (no gobj), so with linear:false Next advances immediately —
 *      no backend. The wizard publishes EV_STEP_SHOWN / EV_WIZARD_DONE /
 *      EV_WIZARD_CANCEL; we declare all three and echo the outcome.
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
    gobj_create_pure_child, gobj_start, gobj_send_event,
    createElement2,
    refresh_language,
} from "@yuneta/gobj-js";

import {t} from "i18next";


/***************************************************************
 *              Constants
 ***************************************************************/
const GCLASS_NAME = "C_DEMO_WIZARD";

const STEPS = [
    {id: "s1", title: "Choose a source",
     content: ["div", {class: "p-3"},
        "Step 1 — pick where the data comes from. In a real wizard this step's content is a gobj (e.g. a C_YUI_FORM) that validates before Next."]},
    {id: "s2", title: "Configure",
     content: ["div", {class: "p-3"},
        "Step 2 — set options. Use Back / Next to move; the \"N / M\" counter tracks progress."]},
    {id: "s3", title: "Review & confirm",
     content: ["div", {class: "p-3"},
        "Step 3 (last) — the primary button becomes Confirm. Pressing it publishes EV_WIZARD_DONE to the host."]},
];


/***************************************************************
 *              Attrs
 ***************************************************************/
const attrs_table = [
SDATA(data_type_t.DTP_POINTER,  "subscriber",   0,  null,   "Subscriber of output events"),

SDATA(data_type_t.DTP_STRING,   "title",        0,  "Wizard", "Card title"),
SDATA(data_type_t.DTP_STRING,   "lead",         0,  "",     "Explanatory paragraph"),
SDATA(data_type_t.DTP_POINTER,  "$container",   0,  null,   "Root HTMLElement (shell contract)"),
SDATA_END()
];

let PRIVATE_DATA = {
    wizard: null,
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
    let $holder = $c ? $c.querySelector(".DEMO_WIZARD_HOLDER") : null;

    let wizard = gobj_create_pure_child(
        "demo_wizard_widget",
        "C_YUI_WIZARD",
        {linear: false},
        gobj
    );
    priv.wizard = wizard;

    let $wiz = gobj_read_attr(wizard, "$container");
    if($wiz && $holder) {
        $holder.appendChild($wiz);
        gobj_start(wizard);
        gobj_send_event(wizard, "EV_SET_STEPS", {steps: STEPS}, gobj);
    } else {
        log_error(`${GCLASS_NAME}: C_YUI_WIZARD has no $container`);
    }
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
 *  Build the card: header + a boxed holder for the wizard.
 ***************************************************************/
function build_ui(gobj)
{
    let title = gobj_read_attr(gobj, "title") || "Wizard";
    let lead  = gobj_read_attr(gobj, "lead")  || "";

    let head = [
        ["h1", {class: "DEMO_TITLE title is-3 mb-2", i18n: title}, title]
    ];
    if(lead) {
        head.push(["p", {class: "DEMO_LEAD content", i18n: lead, style: "max-width:60ch;"}, lead]);
    }

    let $c = createElement2(
        ["div", {class: "C_DEMO_WIZARD DEMO_CARD view-card"}, [
            ["div", {class: "DEMO_HEAD"}, head],
            ["div", {class: "DEMO_WIZARD_HOLDER box p-2", style: "max-width:560px;"}, []],
            ["p", {class: "DEMO_WIZARD_RESULT is-size-7 has-text-grey"}, "—"]
        ]]
    );
    gobj_write_attr(gobj, "$container", $c);
    refresh_language($c, t);
}

/***************************************************************
 *  Show a short outcome line under the wizard.
 ***************************************************************/
function set_result(gobj, text)
{
    let $c = gobj_read_attr(gobj, "$container");
    if($c) {
        let $r = $c.querySelector(".DEMO_WIZARD_RESULT");
        if($r) {
            $r.textContent = text;
        }
    }
}




                    /***************************
                     *      Actions
                     ***************************/




function ac_step_shown(gobj, event, kw, src)
{
    set_result(gobj, `step ${(kw && kw.id) || ""} shown`);
    return 0;
}

function ac_wizard_done(gobj, event, kw, src)
{
    set_result(gobj, "Wizard confirmed (EV_WIZARD_DONE)");
    return 0;
}

function ac_wizard_cancel(gobj, event, kw, src)
{
    set_result(gobj, "Wizard cancelled (EV_WIZARD_CANCEL)");
    return 0;
}




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
            ["EV_STEP_SHOWN",     ac_step_shown,     null],
            ["EV_WIZARD_DONE",    ac_wizard_done,    null],
            ["EV_WIZARD_CANCEL",  ac_wizard_cancel,  null]
        ]]
    ];

    const event_types = [
        ["EV_STEP_SHOWN",     0],
        ["EV_WIZARD_DONE",    0],
        ["EV_WIZARD_CANCEL",  0]
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
function register_c_demo_wizard()
{
    return create_gclass(GCLASS_NAME);
}

export {register_c_demo_wizard};
