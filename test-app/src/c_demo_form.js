/***********************************************************************
 *          c_demo_form.js
 *
 *      C_DEMO_FORM — a form view for the layouts demo. It hosts the real
 *      gobj-ui form component, C_YUI_FORM, as a pure child: the form is
 *      declared by a field template (object → form fields), pre-filled
 *      with a record, and editable with the component's own save/undo/
 *      clear toolbar. C_YUI_FORM publishes EV_SAVE_RECORD on save (its
 *      only OUTPUT event); we catch it and echo the submitted values as
 *      JSON below the form, so the round-trip is visible without a
 *      backend.
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
    refresh_language,
} from "@yuneta/gobj-js";

import {t} from "i18next";


/***************************************************************
 *              Constants
 ***************************************************************/
const GCLASS_NAME = "C_DEMO_FORM";

/*  Field template — one field per widget C_YUI_FORM can render, so the
 *  chapter is a catalogue of every supported field type. Each value is
 *  either a dot-token spec consumed by template_get_field_desc()
 *  (real_type . field_type . attributes) or the object form (needed to
 *  carry an enum option list). "writable" makes the field editable.
 *
 *  type -> widget produced by C_YUI_FORM:
 *    string/email/url/tel/password/percent/currency -> <input> (type varies)
 *    integer/real                                    -> numeric <input>
 *    color                                           -> <input type=color>
 *    time                                            -> <input type=datetime-local>
 *    coordinates                                     -> lng,lat input + geolocate
 *    boolean                                         -> checkbox
 *    enum (real_type string)                         -> native <select>
 *    enum (real_type array)                          -> TomSelect multi-select
 *  (textarea is not reachable from a field template, and date/uuid/gbuffer
 *  have no renderer, so they are intentionally omitted.) */
const FORM_TEMPLATE = {
    /*  text-like inputs  */
    name:       "string.writable",
    email:      "email.writable",
    website:    "url.writable",
    phone:      "tel.writable",
    password:   "password.writable",

    /*  numeric inputs  */
    age:        "integer.writable",
    rating:     "real.writable",
    progress:   "percent.writable",
    salary:     "currency.writable",

    /*  special-purpose inputs  */
    color:      "color.writable",
    appointment:"time.writable",
    location:   "coordinates.writable",

    /*  boolean  */
    active:     "boolean.writable",

    /*  enum, single choice -> native select  */
    role:   {id: "role", header: "role", type: "string",
             flag: ["enum", "writable"], enum: ["admin", "operator", "viewer"]},

    /*  enum, multiple choice -> TomSelect (select2)  */
    skills: {id: "skills", header: "skills", type: "array",
             flag: ["enum", "writable"],
             enum: ["c", "javascript", "python", "rust", "go"]},

    /*  free text (plain input; multiline textarea is not template-reachable)  */
    notes:      "string.writable",
};

const FORM_RECORD = {
    name:        "Ada Lovelace",
    email:       "ada@yuneta.io",
    website:     "https://yuneta.io",
    phone:       "+34 600 123 456",
    password:    "s3cr3t",
    age:         36,
    rating:      4.5,
    progress:    80,
    salary:      52000,
    color:       "#3b82f6",
    appointment: 1783675800,          // epoch seconds (~2026-07-10T09:30 UTC)
    location:    [-3.7038, 40.4168],  // GeoJSON order [lng, lat] — Madrid
    active:      false,
    role:        "operator",
    skills:      ["javascript", "python"],
    notes:       "Edit a field and press Save — the JSON below updates.",
};


/***************************************************************
 *              Attrs
 ***************************************************************/
const attrs_table = [
SDATA(data_type_t.DTP_POINTER,  "subscriber",   0,  null,   "Subscriber of output events"),

SDATA(data_type_t.DTP_STRING,   "title",        0,  "Form", "Card title"),
SDATA(data_type_t.DTP_STRING,   "lead",         0,  "",     "Explanatory paragraph"),
SDATA(data_type_t.DTP_POINTER,  "$container",   0,  null,   "Root HTMLElement (shell contract)"),
SDATA_END()
];

let PRIVATE_DATA = {
    form: null,
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
    let priv = gobj.priv;

    /*
     *  CHILD subscription model
     */
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

    if(priv.form) {
        gobj_start(priv.form);
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
 *  Build the card: header + hosted C_YUI_FORM + a JSON echo panel.
 ***************************************************************/
function build_ui(gobj)
{
    let priv  = gobj.priv;
    let title = gobj_read_attr(gobj, "title") || "Form";
    let lead  = gobj_read_attr(gobj, "lead")  || "";

    /*  The form component is a pure child; it builds its own DOM in its
     *  mt_create, so its $container exists right after this call. */
    let form = gobj_create_pure_child(
        "demo_form_widget",
        "C_YUI_FORM",
        {
            template: FORM_TEMPLATE,
            record:   FORM_RECORD,
            editable: true
        },
        gobj
    );
    priv.form = form;
    let $form = gobj_read_attr(form, "$container");

    let head = [
        ["h1", {class: "DEMO_TITLE title is-3 mb-2", i18n: title}, title]
    ];
    if(lead) {
        head.push(["p", {class: "DEMO_LEAD content", i18n: lead, style: "max-width:60ch;"}, lead]);
    }

    let $c = createElement2(
        ["div", {class: "C_DEMO_FORM DEMO_CARD view-card"}, [
            ["div", {class: "DEMO_HEAD"}, head],
            ["div", {class: "DEMO_FORM_HOST box p-2",
                     style: "max-width:640px;"}, []],
            ["div", {class: "DEMO_FORM_RESULT", style: "max-width:640px;"}, [
                ["p", {class: "is-size-7 has-text-grey mb-1",
                       i18n: "Last saved record:"}, "Last saved record:"],
                ["pre", {class: "DEMO_FORM_JSON is-size-7",
                         style: "max-width:640px; overflow:auto;"},
                    "(press Save)"]
            ]]
        ]]
    );

    let $host = $c.querySelector(".DEMO_FORM_HOST");
    if($form && $host) {
        $host.appendChild($form);
    } else {
        log_error(`${GCLASS_NAME}: C_YUI_FORM has no $container`);
    }

    gobj_write_attr(gobj, "$container", $c);

    /*  Translate this view's own DOM to the current language (the hosted
     *  C_YUI_FORM translates its own fields/buttons through the same t). */
    refresh_language($c, t);
}




                    /***************************
                     *      Actions
                     ***************************/




/***************************************************************
 *  C_YUI_FORM published EV_SAVE_RECORD (kw = the submitted values).
 *  Echo them into the JSON panel.
 ***************************************************************/
function ac_save_record(gobj, event, kw, src)
{
    let $c = gobj_read_attr(gobj, "$container");
    if($c) {
        let $json = $c.querySelector(".DEMO_FORM_JSON");
        if($json) {
            $json.textContent = JSON.stringify(kw || {}, null, 2);
        }
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

    /*  C_YUI_FORM (child) publishes EV_SAVE_RECORD to us (CHILD model). */
    const states = [
        ["ST_IDLE", [
            ["EV_SAVE_RECORD",  ac_save_record,  null]
        ]]
    ];

    const event_types = [
        ["EV_SAVE_RECORD",  0]
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
function register_c_demo_form()
{
    return create_gclass(GCLASS_NAME);
}

export {register_c_demo_form};
