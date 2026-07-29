/***********************************************************************
 *          c_demo_node_lab.js
 *
 *      C_DEMO_NODE_LAB — the "dynamic" half of the node-tree chapter.
 *
 *      It is mounted as the CONTENT of the tree's root node, so it
 *      renders above the root's card grid (a node with content AND
 *      children is one node, not two concepts).  Its buttons mutate
 *      the LIVE tree through the same runtime API the declared
 *      app_config.json goes through at boot — that is the whole point
 *      of the chapter: there is no config path and runtime path, there
 *      is one API with two callers.
 *
 *      Every button is an EVENT (house rule: a click IS an action, the
 *      DOM is just another operating system), so the `machine` trace
 *      shows the tree being reshaped.
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
    gobj_gclass_name,
    gobj_read_attr,
    gobj_read_pointer_attr,
    gobj_write_attr,
    gobj_subscribe_event,
    gobj_send_event,
    createElement2,
} from "@yuneta/gobj-js";

import {lead_block} from "./demo_lead.js";

import {
    yui_node_add,
    yui_node_remove,
    yui_node_set_projection,
    yui_node_set_chrome_depth,
} from "@yuneta/gobj-ui/src/c_yui_node.js";


/***************************************************************
 *              Constants
 ***************************************************************/
const GCLASS_NAME = "C_DEMO_NODE_LAB";

/*  The two ways of showing depth, as a live choice.  Both are ONE
 *  knob on the ROOT node: `path` draws the trail from the tree root
 *  whoever declares it, and chrome_depth 0 there caps the stacked
 *  strips of the WHOLE subtree (the deepest declaration on the path
 *  wins, and no child declares one).  So switching the whole tree's
 *  navigation is two calls on a single node. */
const NAV_MODES = [
    {
        id: "cards + tabs",
        chrome_depth: -1,
        projection: {
            index: {layout: "cards"},
            chrome: [
                {layout: "tabs", show_on: ">=tablet"},
                {layout: "backbar", show_on: "<tablet"}
            ]
        }
    },
    {
        id: "breadcrumb",
        chrome_depth: 0,
        projection: {
            index: {layout: "cards"},
            path: {layout: "breadcrumb"}
        }
    }
];

/*  The projections the demo cycles through, in order. */
const PROJECTIONS = [
    {
        id: "cards + tabs",
        value: {
            index: {layout: "cards"},
            chrome: [
                {layout: "tabs", show_on: ">=tablet"},
                {layout: "backbar", show_on: "<tablet"}
            ]
        }
    },
    {
        id: "vertical",
        value: {
            index: {layout: "vertical"},
            chrome: {layout: "vertical"}
        }
    },
    {
        id: "icon-bar",
        value: {
            index: {layout: "icon-bar"},
            chrome: {layout: "backbar"}
        }
    }
];


/***************************************************************
 *              Attrs
 ***************************************************************/
const attrs_table = [
SDATA(data_type_t.DTP_POINTER,  "subscriber",   0,  null,   "Subscriber of output events"),

SDATA(data_type_t.DTP_STRING,   "title",        0,  "",     "Panel title"),
SDATA(data_type_t.DTP_STRING,   "lead",         0,  "",     "Explanatory paragraph"),
SDATA(data_type_t.DTP_POINTER,  "$container",   0,  null,   "Root HTMLElement (node content contract)"),
SDATA_END()
];

let PRIVATE_DATA = {
    dyn_seq:    0,      /*  monotonic id source for added nodes     */
    dyn_ids:    null,   /*  ids this panel added, in order          */
    proj_idx:   0,
    nav_idx:    0
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

    priv.dyn_ids = [];

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
 *  The node this panel is the content of.
 ************************************************************/
function host_node(gobj)
{
    let parent = gobj_parent(gobj);

    if(!parent || gobj_gclass_name(parent) !== "C_YUI_NODE") {
        log_error(`${GCLASS_NAME}: must be mounted as the content of a C_YUI_NODE`);
        return null;
    }
    return parent;
}

/************************************************************
 *  Build the panel.  Buttons keep their label at every width
 *  (the row holds three short ones), plus an icon each.
 ************************************************************/
function build_ui(gobj)
{
    let title = gobj_read_attr(gobj, "title") || "Node tree";
    let lead  = gobj_read_attr(gobj, "lead") || "";

    let $container = createElement2(
        ["div", {class: `${GCLASS_NAME} LAB_CARD p-4`}, [
            ["h1", {class: "title is-5 LAB_TITLE", i18n: title}, title],
            ...lead_block(lead, "LAB_LEAD mb-3"),
            ["div", {class: "LAB_ACTIONS buttons"}, [
                button_descriptor("LAB_ADD", "yi-plus", "add node"),
                button_descriptor("LAB_REMOVE", "yi-trash", "remove last added"),
                button_descriptor("LAB_PROJECTION", "yi-table", "cycle projection"),
                button_descriptor("LAB_NAV_MODE", "yi-arrows-rotate", "tabs or breadcrumb")
            ]],
            ["p", {class: "LAB_STATUS is-size-7"}, ""]
        ]]
    );

    $container.addEventListener("click", (ev) => {
        let $btn = ev.target.closest("button[data-action]");
        if(!$btn) {
            return;
        }
        ev.preventDefault();
        /*  A click is an ACTION: it enters the machine, it does not
         *  call a function behind the FSM's back. */
        gobj_send_event(gobj, $btn.getAttribute("data-action"), {}, gobj);
    });

    gobj_write_attr(gobj, "$container", $container);
}

function button_descriptor(logical_class, icon, label)
{
    let action = {
        LAB_ADD:        "EV_ADD_CLICKED",
        LAB_REMOVE:     "EV_REMOVE_CLICKED",
        LAB_PROJECTION: "EV_PROJECTION_CLICKED",
        LAB_NAV_MODE:   "EV_NAV_MODE_CLICKED"
    }[logical_class];

    return ["button", {
        class: `button ${logical_class}`,
        "data-action": action,
        title: label,
        "data-i18n-title": label,
        "aria-label": label,
        "data-i18n-aria-label": label
    }, [
        ["span", {class: "icon"}, ["i", {class: icon, "aria-hidden": "true"}]],
        ["span", {i18n: label}, label]
    ]];
}

/************************************************************
 *  One-line report of what the last action did.
 ************************************************************/
function set_status(gobj, text)
{
    let $c = gobj_read_attr(gobj, "$container");
    let $status = $c ? $c.querySelector(".LAB_STATUS") : null;

    if(!$status) {
        log_error(`${GCLASS_NAME}: LAB_STATUS not found`);
        return;
    }
    $status.textContent = text;
}




                    /***************************
                     *      Actions
                     ***************************/




/************************************************************
 *  Add a child to the live tree — same API the declared
 *  app_config.json used at boot.
 ************************************************************/
function ac_add_clicked(gobj, event, kw, src)
{
    let priv = gobj.priv;
    let node = host_node(gobj);

    if(!node) {
        return -1;   /*  Error already logged  */
    }

    let n = ++priv.dyn_seq;
    let id = `dyn${n}`;
    yui_node_add(node, {
        id:    id,
        label: `Dynamic ${n}`,
        icon:  "yi-square",
        content: {
            gclass: "C_TEST_VIEW",
            kw: {
                title: `Dynamic ${n}`,
                lead:  "This node did not exist when the app booted. It was " +
                       "added through the same runtime API the declared tree " +
                       "goes through — and it is deep-linkable like any other.",
                badges: ["runtime", "same API as app_config.json"]
            }
        }
    });
    priv.dyn_ids.push(id);
    set_status(gobj, `+ ${id}`);
    return 0;
}

/************************************************************
 *  Remove the last node this panel added.
 ************************************************************/
function ac_remove_clicked(gobj, event, kw, src)
{
    let priv = gobj.priv;
    let node = host_node(gobj);

    if(!node) {
        return -1;   /*  Error already logged  */
    }
    if(!priv.dyn_ids.length) {
        set_status(gobj, "nothing added yet");
        return 0;
    }

    let id = priv.dyn_ids.pop();
    yui_node_remove(node, id);
    set_status(gobj, `- ${id}`);
    return 0;
}

/************************************************************
 *  Cycle how the root node projects its children.  The URL
 *  does not move: the projection is HOW you see the children,
 *  not WHERE you are.
 ************************************************************/
function ac_projection_clicked(gobj, event, kw, src)
{
    let priv = gobj.priv;
    let node = host_node(gobj);

    if(!node) {
        return -1;   /*  Error already logged  */
    }

    priv.proj_idx = (priv.proj_idx + 1) % PROJECTIONS.length;
    let projection = PROJECTIONS[priv.proj_idx];
    yui_node_set_projection(node, projection.value);
    set_status(gobj, `projection: ${projection.id}`);
    return 0;
}


/************************************************************
 *  Switch the whole subtree between stacked chrome and a
 *  breadcrumb — the same two declarations the two chapters ship
 *  statically, applied to the live tree.
 ************************************************************/
function ac_nav_mode_clicked(gobj, event, kw, src)
{
    let priv = gobj.priv;
    let node = host_node(gobj);

    if(!node) {
        return -1;   /*  Error already logged  */
    }

    priv.nav_idx = (priv.nav_idx + 1) % NAV_MODES.length;
    let mode = NAV_MODES[priv.nav_idx];
    yui_node_set_projection(node, mode.projection);
    yui_node_set_chrome_depth(node, mode.chrome_depth);
    set_status(gobj, `navigation: ${mode.id}`);
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
            ["EV_ADD_CLICKED",          ac_add_clicked,         null],
            ["EV_REMOVE_CLICKED",       ac_remove_clicked,      null],
            ["EV_PROJECTION_CLICKED",   ac_projection_clicked,  null],
            ["EV_NAV_MODE_CLICKED",     ac_nav_mode_clicked,    null]
        ]]
    ];

    /*---------------------------------------------*
     *          Events
     *---------------------------------------------*/
    const event_types = [
        ["EV_ADD_CLICKED",          0],
        ["EV_REMOVE_CLICKED",       0],
        ["EV_PROJECTION_CLICKED",   0],
        ["EV_NAV_MODE_CLICKED",     0]
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
function register_c_demo_node_lab()
{
    return create_gclass(GCLASS_NAME);
}

export { register_c_demo_node_lab };
