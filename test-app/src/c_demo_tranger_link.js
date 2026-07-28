/***********************************************************************
 *          c_demo_tranger_link.js
 *
 *      C_DEMO_TRANGER_LINK — what sits at the END of the structural
 *      tree: a stand-in for a timeranger viewer.
 *
 *      It is mounted by a `C_YUI_NODE` that declares a `link`, which
 *      makes that node the tip of the structure and hands this view
 *      everything left of the url as `EV_ROUTE_CHANGED {base,
 *      subpath}` — the same contract the shell gives a view, so this
 *      gclass has no idea it lives inside a tree.
 *
 *      That is the scale boundary made visible: one gobj per
 *      structural node is right, one gobj per record is not.  A
 *      million rows are a data space with a viewer, not a million
 *      nodes; the url keeps addressing positions inside it
 *      (`<mode>` and `<mode>/<key>` here), the tree just stops
 *      owning them.
 *
 *      No backend: the rows are generated, the point is the routing
 *      contract, not the data.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {
    SDATA,
    SDATA_END,
    data_type_t,
    gclass_create,
    log_error,
    gobj_parent,
    gobj_read_attr,
    gobj_read_pointer_attr,
    gobj_write_attr,
    gobj_subscribe_event,
    gobj_send_event,
    createElement2,
} from "@yuneta/gobj-js";

import {
    yui_shell_of,
    yui_shell_navigate,
} from "@yuneta/gobj-ui/src/c_yui_shell.js";


/***************************************************************
 *              Constants
 ***************************************************************/
const GCLASS_NAME = "C_DEMO_TRANGER_LINK";

/*  The shapes a timeranger is read as — each deserves its own
 *  viewer; here they are three renderings of the same fake rows. */
const MODES = [
    {id: "series", label: "series/time", icon: "yi-calendar-days"},
    {id: "kv",     label: "key/value",   icon: "yi-table"},
    {id: "raw",    label: "raw records", icon: "yi-terminal"}
];

const KEYS = ["kwh_total", "kwh_p1", "voltage_l1"];


/***************************************************************
 *              Attrs
 ***************************************************************/
const attrs_table = [
SDATA(data_type_t.DTP_POINTER,  "subscriber",   0,  null,   "Subscriber of output events"),

SDATA(data_type_t.DTP_STRING,   "topic",        0,  "",     "Timeranger topic this node links to"),
SDATA(data_type_t.DTP_INTEGER,  "records",      0,  0,      "Record count, for the header"),
SDATA(data_type_t.DTP_POINTER,  "$container",   0,  null,   "Root HTMLElement (node content contract)"),
SDATA_END()
];

let PRIVATE_DATA = {
    base:   "",     /*  canonical route of the node that links here  */
    mode:   "",
    key:    ""
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




/************************************************************
 *  Shell skeleton; the body is redrawn per position.
 ************************************************************/
function build_ui(gobj)
{
    let $container = createElement2(
        ["div", {class: `${GCLASS_NAME} TRANGER_CARD p-4`}, [
            ["div", {class: "TRANGER_HEAD mb-3"}],
            ["div", {class: "TRANGER_MODES buttons mb-3"}],
            ["div", {class: "TRANGER_BODY"}]
        ]]
    );

    $container.addEventListener("click", (ev) => {
        let $btn = ev.target.closest("[data-mode], [data-key]");
        if(!$btn) {
            return;
        }
        ev.preventDefault();
        /*  A click is an ACTION: it enters the machine, which turns it
         *  into a URL change — never into a direct re-render. */
        gobj_send_event(gobj, "EV_POSITION_CLICKED", {
            mode: $btn.getAttribute("data-mode") || "",
            key:  $btn.getAttribute("data-key") || ""
        }, gobj);
    });

    gobj_write_attr(gobj, "$container", $container);
}

/************************************************************
 *  Rows of a fake timeranger read — enough to look like data.
 ************************************************************/
function fake_rows(key, count)
{
    let rows = [];
    for(let i = 0; i < count; i++) {
        rows.push({
            t: `2026-07-28T${String(6 + i).padStart(2, "0")}:00:00`,
            k: key,
            v: (1200 + i * 37.5).toFixed(1)
        });
    }
    return rows;
}

/************************************************************
 *  Draw the position the url points at.
 ************************************************************/
function render(gobj)
{
    let priv = gobj.priv;
    let $c = gobj_read_attr(gobj, "$container");

    if(!$c) {
        log_error(`${GCLASS_NAME}: no $container`);
        return;
    }

    let topic = gobj_read_attr(gobj, "topic") || "?";
    let records = gobj_read_attr(gobj, "records") || 0;

    let $head = $c.querySelector(".TRANGER_HEAD");
    $head.replaceChildren(createElement2(
        ["div", {}, [
            ["h1", {class: "title is-5 TRANGER_TITLE"}, topic],
            /*  Two keys, not one composed string: each half must be able
             *  to change language on its own.  createElement2 TRIMS text
             *  nodes, so the gap between them is CSS (ml-1), never a
             *  literal space. */
            ["p", {class: "TRANGER_LEAD"}, [
                ["span", {i18n: "the structural tree stops here"},
                    "The structural tree stops here."],
                ["span", {class: "ml-1",
                          i18n: "below this node there are no gobjs: it is a data space with a viewer, and the url keeps addressing positions inside it"},
                    "Below this node there are no gobjs: it is a data space " +
                    "with a viewer, and the url keeps addressing positions " +
                    "inside it."]
            ]],
            ["p", {class: "TRANGER_STATS is-size-7 mt-2"},
                `${records.toLocaleString("en")} records · base ${priv.base} · ` +
                `subpath "${[priv.mode, priv.key].filter(Boolean).join("/")}"`]
        ]]
    ));

    let $modes = $c.querySelector(".TRANGER_MODES");
    $modes.replaceChildren(...MODES.map((m) => createElement2(
        ["button", {
            class: `button TRANGER_MODE${priv.mode === m.id ? " is-link" : ""}`,
            "data-mode": m.id,
            title: m.label,
            "data-i18n-title": m.label,
            "aria-label": m.label,
            "data-i18n-aria-label": m.label
        }, [
            ["span", {class: "icon"}, ["i", {class: m.icon, "aria-hidden": "true"}]],
            ["span", {i18n: m.label}, m.label]
        ]]
    )));

    let $body = $c.querySelector(".TRANGER_BODY");
    if(!priv.mode) {
        $body.replaceChildren(createElement2(
            ["p", {class: "TRANGER_EMPTY has-text-grey",
                   i18n: "pick how to read this topic"},
                "Pick how to read this topic."]
        ));
        return;
    }

    let keys = MODES.some((m) => m.id === priv.mode) ? KEYS : [];
    let $keys = createElement2(["div", {class: "TRANGER_KEYS buttons are-small mb-3"},
        keys.map((k) => ["button", {
            class: `button TRANGER_KEY${priv.key === k ? " is-link" : ""}`,
            "data-key": k
        }, k])
    ]);

    let rows = fake_rows(priv.key || KEYS[0], 6);
    let $rows = createElement2(["table", {class: "table is-fullwidth is-narrow TRANGER_ROWS"}, [
        ["tbody", {}, rows.map((r) =>
            ["tr", {}, [
                ["td", {class: "is-family-monospace is-size-7"}, r.t],
                ["td", {class: "is-family-monospace is-size-7"}, r.k],
                ["td", {class: "is-family-monospace is-size-7 has-text-right"}, r.v]
            ]]
        )]
    ]]);

    $body.replaceChildren($keys, $rows);
}




                    /***************************
                     *      Actions
                     ***************************/




/************************************************************
 *  The node that links here handed us our position.  An EMPTY
 *  subpath means "the viewer's home" (ROUTING.md §5.1) — it is
 *  what makes Back out of a deep data position land here.
 ************************************************************/
function ac_route_changed(gobj, event, kw, src)
{
    let priv = gobj.priv;
    let segs = String(kw.subpath || "").split("/").filter((s) => s.length > 0);

    priv.base = kw.base || "";
    priv.mode = segs[0] || "";
    priv.key  = segs[1] || "";

    render(gobj);
    return 0;
}

/************************************************************
 *  A position inside the data space was chosen: navigate, so
 *  the url records it and Back works.  Routes are built from
 *  the host-supplied `base` — this view hardcodes no path.
 ************************************************************/
function ac_position_clicked(gobj, event, kw, src)
{
    let priv = gobj.priv;

    if(!priv.base) {
        log_error(`${GCLASS_NAME}: no base route yet — nothing to navigate from`);
        return -1;
    }
    let shell = yui_shell_of(gobj);
    if(!shell) {
        log_error(`${GCLASS_NAME}: no shell to navigate with`);
        return -1;
    }

    let mode = kw.mode || priv.mode;
    let key  = kw.mode ? "" : (kw.key || "");
    let tail = [mode, key].filter(Boolean).join("/");

    yui_shell_navigate(shell, tail ? `${priv.base}/${tail}` : priv.base);
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
            ["EV_ROUTE_CHANGED",        ac_route_changed,       null],
            ["EV_POSITION_CLICKED",     ac_position_clicked,    null]
        ]]
    ];

    /*---------------------------------------------*
     *          Events
     *---------------------------------------------*/
    const event_types = [
        ["EV_ROUTE_CHANGED",        0],
        ["EV_POSITION_CLICKED",     0]
    ];

    __gclass__ = gclass_create(
        gclass_name,
        event_types,
        states,
        gmt,
        0,  // lmt,
        attrs_table,
        PRIVATE_DATA,
        0,  // authz_table,
        0,  // command_table,
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
function register_c_demo_tranger_link()
{
    return create_gclass(GCLASS_NAME);
}

export { register_c_demo_tranger_link };
