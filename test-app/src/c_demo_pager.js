/***********************************************************************
 *          c_demo_pager.js
 *
 *      C_DEMO_PAGER — a pager view for the demo. Hosts the gobj-ui
 *      component C_YUI_PAGER (Pattern A: a "← title" header that stacks
 *      panels; no confirm/cancel chrome — content auto-saves). Pages are
 *      pushed with EV_PUSH_PAGE; each page here is a plain createElement2
 *      array with a button that pushes the next page, so you can drill in
 *      and use the built-in "←" to pop back. No backend. The pager
 *      publishes EV_PAGE_SHOWN / EV_PAGE_DISCARD / EV_PAGER_EXIT.
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
const GCLASS_NAME = "C_DEMO_PAGER";


/***************************************************************
 *              Attrs
 ***************************************************************/
const attrs_table = [
SDATA(data_type_t.DTP_POINTER,  "subscriber",   0,  null,   "Subscriber of output events"),

SDATA(data_type_t.DTP_STRING,   "title",        0,  "Pager", "Card title"),
SDATA(data_type_t.DTP_STRING,   "lead",         0,  "",     "Explanatory paragraph"),
SDATA(data_type_t.DTP_POINTER,  "$container",   0,  null,   "Root HTMLElement (shell contract)"),
SDATA_END()
];

let PRIVATE_DATA = {
    pager: null,
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
    let $holder = $c ? $c.querySelector(".DEMO_PAGER_HOLDER") : null;

    let pager = gobj_create_pure_child(
        "demo_pager_widget",
        "C_YUI_PAGER",
        {root_title: "Items", back_on_root: false},
        gobj
    );
    priv.pager = pager;

    let $pg = gobj_read_attr(pager, "$container");
    if($pg && $holder) {
        $holder.appendChild($pg);
        gobj_start(pager);
        gobj_send_event(pager, "EV_PUSH_PAGE", {
            id: "root", title: "Items", content: page_content(gobj, "detail", "Open item detail →")
        }, gobj);
    } else {
        log_error(`${GCLASS_NAME}: C_YUI_PAGER has no $container`);
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
 *  Content for a page: a line of text + a button that pushes the
 *  next page (drill down). The last level omits the button.
 ***************************************************************/
function page_content(gobj, next_id, btn_label)
{
    let children = [
        ["p", {class: "mb-3"},
            next_id === "detail"
                ? "Root level. Push a page to drill down; the \"←\" in the header pops back."
                : "A deeper page. Use the header \"←\" to go back one level."]
    ];
    if(next_id) {
        children.push(
            ["button", {class: "button is-small is-link"}, btn_label, {
                click: function(evt) {
                    evt.stopPropagation();
                    let priv = gobj.priv;
                    if(priv.pager) {
                        let deeper = next_id === "detail" ? "sub" : null;
                        gobj_send_event(priv.pager, "EV_PUSH_PAGE", {
                            id: next_id,
                            title: next_id === "detail" ? "Item detail" : "Sub-detail",
                            content: page_content(gobj, deeper, "Go deeper →")
                        }, gobj);
                    }
                }
            }]
        );
    }
    return ["div", {class: "p-3"}, children];
}

/***************************************************************
 *  Build the card: header + a boxed holder for the pager.
 ***************************************************************/
function build_ui(gobj)
{
    let title = gobj_read_attr(gobj, "title") || "Pager";
    let lead  = gobj_read_attr(gobj, "lead")  || "";

    let head = [
        ["h1", {class: "DEMO_TITLE title is-3 mb-2", i18n: title}, title]
    ];
    if(lead) {
        head.push(["p", {class: "DEMO_LEAD content", i18n: lead, style: "max-width:60ch;"}, lead]);
    }

    let $c = createElement2(
        ["div", {class: "C_DEMO_PAGER DEMO_CARD view-card"}, [
            ["div", {class: "DEMO_HEAD"}, head],
            ["div", {class: "DEMO_PAGER_HOLDER box p-2",
                     style: "max-width:560px; min-height:220px;"}, []]
        ]]
    );
    gobj_write_attr(gobj, "$container", $c);
    refresh_language($c, t);
}




                    /***************************
                     *      Actions
                     ***************************/




function ac_page_shown(gobj, event, kw, src)
{
    return 0;
}

function ac_page_discard(gobj, event, kw, src)
{
    return 0;
}

function ac_pager_exit(gobj, event, kw, src)
{
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
            ["EV_PAGE_SHOWN",    ac_page_shown,    null],
            ["EV_PAGE_DISCARD",  ac_page_discard,  null],
            ["EV_PAGER_EXIT",    ac_pager_exit,    null]
        ]]
    ];

    const event_types = [
        ["EV_PAGE_SHOWN",    0],
        ["EV_PAGE_DISCARD",  0],
        ["EV_PAGER_EXIT",    0]
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
function register_c_demo_pager()
{
    return create_gclass(GCLASS_NAME);
}

export {register_c_demo_pager};
