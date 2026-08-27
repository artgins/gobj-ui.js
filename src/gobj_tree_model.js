/***********************************************************************
 *          gobj_tree_model.js
 *
 *          The gobj tree of a yuno, as plain data.
 *
 *          The view (C_YUI_GOBJ_TREE_JS) draws NODE DESCRIPTORS, never
 *          gobjs. There are two producers of a descriptor, because the
 *          view has to show the gobjs of the BACKEND too:
 *
 *            - describe_js_gobj()      the gobj tree of THIS browser yuno
 *            - describe_backend_tree() the answer of the backend command
 *                                      `view-gobj-tree` of another yuno
 *
 *          Both answer the SAME shape, and that shape is the backend's:
 *          the field names are the ones `gobj2json()` writes in
 *          `kernel/c/gobj-c/src/gobj.c` (fullname, shortname, gclass,
 *          name, parent, state, running, playing, service, disabled,
 *          volatil, bottom_gobj, gobj_flags, commands, gobj_trace_level).
 *          Anything the browser runtime cannot answer is simply absent,
 *          and every reader here treats absent as "not known", never as
 *          false.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {
    gobj_gclass_name,
    gobj_name,
    gobj_short_name,
    gobj_full_name,
    gobj_parent,
    gobj_current_state,
    gobj_is_running,
    gobj_is_playing,
    gobj_is_service,
    gobj_is_pure_child,
    gobj_is_volatil,
    gobj_bottom_gobj,
} from "@yuneta/gobj-js";


                    /******************************
                     *      Roles and status
                     ******************************/


/*  What a node IS. One value: a gobj is drawn once, so it gets one
 *  colour. The order is the order of specificity, and the yuno wins
 *  over everything because the root is the yuno by construction.  */
const ROLES = ["yuno", "service", "volatil", "pure", "child"];

/*  What a node is DOING. `disabled` is not one of these -- a disabled
 *  gobj is still stopped or running, so it travels as its own mark.  */
const STATUSES = ["stopped", "running", "playing"];


/************************************************************
 *  The role of a node: "yuno" | "service" | "volatil" | "pure" | "child"
 ************************************************************/
function node_role(d)
{
    if(!d) {
        return "child";
    }
    if(d.is_yuno) {
        return "yuno";
    }
    if(d.service) {
        return "service";
    }
    if(d.volatil) {
        return "volatil";
    }
    if(d.pure_child) {
        return "pure";
    }
    return "child";
}

/************************************************************
 *  What the node is doing: "stopped" | "running" | "playing"
 ************************************************************/
function node_status(d)
{
    if(!d || !d.running) {
        return "stopped";
    }
    return d.playing? "playing": "running";
}

/*
 *  What the status LOOKS like, before any word is read.
 *
 *  The transport vocabulary, because it is Yuneta's own: a yuno is RUN
 *  (the process), PLAYED (the services) and PAUSED, so play / pause /
 *  stop are not a metaphor here, they are the three verbs.
 *
 *  A coloured dot was the whole encoding before, and a dot has one
 *  SHAPE: telling "running" from "stopped" meant telling green from
 *  red, at 10px, which is no distinction at all for a reader who does
 *  not see colour -- and stopped is the state that matters.
 *
 *  U+FE0E asks for the TEXT presentation: bare, several of these
 *  render as colour emoji on some platforms, which would make the
 *  glyph the loudest thing on a card.
 */
const STATUS_SYMBOLS = {
    "playing": "\u25B6\uFE0E",     /*  play                */
    "running": "\u2016",           /*  paused: two bars    */
    "stopped": "\u25A0\uFE0E",     /*  stop                */
};

const DISABLED_SYMBOL = "\u2298";  /*  a slashed circle    */

/************************************************************
 *  The symbol of a node's status, which is what the reader
 *  actually sees first. `disabled` overrides the rest: a
 *  disabled gobj is not going to run whatever it is doing now.
 ************************************************************/
function node_status_symbol(d)
{
    if(d && d.disabled) {
        return DISABLED_SYMBOL;
    }
    return STATUS_SYMBOLS[node_status(d)] || STATUS_SYMBOLS.stopped;
}

/************************************************************
 *  The i18n key of the status, which is NOT the status itself:
 *  a gobj that runs and does not play is PAUSED to the reader,
 *  and "running" alone never said which of the two it was.
 ************************************************************/
function node_status_key(d)
{
    switch(node_status(d)) {
        case "playing":
            return "playing";
        case "running":
            return "running (paused)";
        default:
            return "stopped";
    }
}


                    /******************************
                     *      Producers
                     ******************************/


/************************************************************
 *  A descriptor of a LIVE gobj of this browser yuno, children
 *  included (the whole subtree, depth-first).
 *
 *  `is_root` marks the yuno itself: the JS runtime has no
 *  gobj_flag_yuno test of its own.
 ************************************************************/
function describe_js_gobj(target_gobj, is_root)
{
    if(!target_gobj) {
        return null;
    }

    let parent_gobj = gobj_parent(target_gobj);
    let bottom = gobj_bottom_gobj(target_gobj);

    let d = {
        gclass:     gobj_gclass_name(target_gobj) || "",
        name:       gobj_name(target_gobj) || "",
        shortname:  gobj_short_name(target_gobj) || "",
        fullname:   gobj_full_name(target_gobj) || "",
        parent:     parent_gobj? (gobj_short_name(parent_gobj) || ""): "",
        state:      gobj_current_state(target_gobj) || "",
        running:    !!gobj_is_running(target_gobj),
        playing:    !!gobj_is_playing(target_gobj),
        service:    !!gobj_is_service(target_gobj),
        volatil:    !!gobj_is_volatil(target_gobj),
        pure_child: !!gobj_is_pure_child(target_gobj),

        /*  gobj-js exports no gobj_is_disabled() (the function exists,
         *  the export list does not carry it), so the flag is read from
         *  the instance the way gobj_enable/gobj_disable write it. The
         *  backend answers the same name in `view-gobj-tree`.  */
        disabled:   !!target_gobj.disabled,

        bottom_gobj: bottom? (gobj_short_name(bottom) || ""): "",
        commands:   !!(target_gobj.gclass && target_gobj.gclass.command_table),
        is_yuno:    !!is_root,
        children:   [],
    };

    let children = target_gobj.dl_children || [];
    for(let child of children) {
        let cd = describe_js_gobj(child, false);
        if(cd) {
            d.children.push(cd);
        }
    }

    return d;
}

/************************************************************
 *  A descriptor from ONE node of the `view-gobj-tree` answer
 *  of a backend yuno.
 *
 *  `shortname` is the key the node hangs from in that answer;
 *  the node itself repeats it, so the argument is only the
 *  fallback for a filtered answer that dropped the field.
 ************************************************************/
function describe_backend_node(shortname, node, is_root)
{
    if(!node || typeof node !== "object") {
        return null;
    }

    let flags = Array.isArray(node.gobj_flags)? node.gobj_flags: [];
    let has = (flag) => flags.indexOf(flag) !== -1;

    let d = {
        gclass:     node.gclass || "",
        name:       node.name || "",
        shortname:  node.shortname || shortname || "",
        fullname:   node.fullname || "",
        parent:     node.parent || "",
        state:      node.state || "",
        running:    !!node.running,
        playing:    !!node.playing,
        service:    !!node.service || has("gobj_flag_service") ||
                        has("gobj_flag_default_service"),
        volatil:    !!node.volatil || has("gobj_flag_volatil"),
        pure_child: has("gobj_flag_pure_child"),
        disabled:   !!node.disabled,
        bottom_gobj: node.bottom_gobj || "",
        commands:   !!node.commands,
        gobj_flags: flags,
        gobj_trace_level: Array.isArray(node.gobj_trace_level)?
                            node.gobj_trace_level: [],
        is_yuno:    (is_root !== undefined)?
                        !!is_root: has("gobj_flag_yuno"),
        children:   [],
    };

    let children = (node.children && typeof node.children === "object")?
        node.children: null;
    if(children) {
        for(let key of Object.keys(children)) {
            let cd = describe_backend_node(key, children[key], false);
            if(cd) {
                d.children.push(cd);
            }
        }
    }

    return d;
}

/************************************************************
 *  The whole `view-gobj-tree` answer -> the root descriptor.
 *
 *  That answer is a dict of ONE key (the shortname of the gobj
 *  the command was asked about) even though it is shaped as a
 *  dict all the way down. Returns null for anything else, and
 *  the caller reports it: an empty tree and a malformed answer
 *  must not look the same.
 ************************************************************/
function describe_backend_tree(data)
{
    if(!data || typeof data !== "object" || Array.isArray(data)) {
        return null;
    }
    let keys = Object.keys(data);
    if(keys.length === 0) {
        return null;
    }
    return describe_backend_node(keys[0], data[keys[0]], true);
}


                    /******************************
                     *      Readouts
                     ******************************/


/************************************************************
 *  The i18n key of a role. Two of the five roles are not the
 *  word the reader wants ("pure" and "volatil" alone say
 *  nothing), so the map is explicit.
 ************************************************************/
function role_i18n_key(role)
{
    switch(role) {
        case "yuno":
            return "yuno";
        case "service":
            return "service";
        case "volatil":
            return "volatil child";
        case "pure":
            return "pure child";
        default:
            return "child";
    }
}

/************************************************************
 *  The marks a node carries besides its role: what the reader
 *  would otherwise have to open the popover to learn.
 *
 *  Returns i18n KEYS, in a fixed order, so the card and the
 *  popover cannot disagree about what a node is.
 ************************************************************/
function node_badge_keys(d)
{
    let badges = [];
    if(!d) {
        return badges;
    }

    let role = node_role(d);
    if(role !== "child") {
        badges.push(role_i18n_key(role));
    }

    if(d.disabled) {
        badges.push("disabled");
    }
    if(d.bottom_gobj) {
        badges.push("bottom");
    }
    if(d.commands) {
        badges.push("commands");
    }

    return badges;
}

/************************************************************
 *  The vocabulary of this view, translated.
 *
 *  Written as literal t("...") calls and not as t(key): a key
 *  reached through a variable is invisible to the locale
 *  validator, which is how a fixed vocabulary ships in one
 *  language and never changes it.
 ************************************************************/
function node_labels(t)
{
    if(typeof t !== "function") {
        t = (k) => k;
    }
    return {
        role: {
            "yuno":          t("yuno"),
            "service":       t("service"),
            "volatil child": t("volatil child"),
            "pure child":    t("pure child"),
            "child":         t("child"),
        },
        /*  The precise words, for the popover, which has room.  */
        status: {
            "playing":           t("playing"),
            "running (paused)":  t("running (paused)"),
            "stopped":           t("stopped"),
        },
        /*  The glanceable ones, for the pill on the card, which has
         *  not: "Ejecutando (en pausa)" pushes the FSM state off its
         *  own row. The colour carries the rest, and the pill's
         *  `title` says it in full.  */
        status_short: {
            "playing":  t("playing"),
            "running":  t("running"),
            "stopped":  t("stopped"),
        },
        badge: {
            "yuno":          t("yuno"),
            "service":       t("service"),
            "volatil child": t("volatil child"),
            "pure child":    t("pure child"),
            "disabled":      t("disabled"),
            "bottom":        t("bottom"),
            "commands":      t("commands"),
        },
        field: {
            gclass:      t("gclass"),
            name:        t("name"),
            full_name:   t("full name"),
            role:        t("role"),
            status:      t("status"),
            fsm_state:   t("fsm state"),
            disabled:    t("disabled"),
            parent:      t("parent"),
            bottom_gobj: t("bottom gobj"),
            commands:    t("commands"),
            traces:      t("traces"),
            flags:       t("flags"),
            children:    t("children"),
            yes:         t("yes"),
            collapsed:   t("(collapsed)"),
        },
    };
}

/************************************************************
 *  The rows of the popover: [label, value], both translated.
 *
 *  `t` is the app's translator -- the library has none of its
 *  own. Values that are a fixed vocabulary (the role, the
 *  status, yes) go through it too; free text does not.
 ************************************************************/
function node_info_rows(d, t)
{
    let rows = [];
    if(!d) {
        return rows;
    }
    let L = node_labels(t);
    let f = L.field;

    rows.push([f.gclass, d.gclass || "\u2014"]);
    rows.push([f.name,   d.name   || "\u2014"]);

    if(d.fullname && d.fullname !== d.shortname) {
        rows.push([f.full_name, d.fullname]);
    }

    rows.push([f.role,   L.role[role_i18n_key(node_role(d))]]);
    rows.push([
        f.status,
        node_status_symbol(d) + " " + L.status[node_status_key(d)]
    ]);
    /*  NOT `state`: both rows read "Estado" in Spanish, side by side,
     *  one saying "Parado" and the other "ST_IDLE". They are different
     *  questions -- what the gobj is DOING, and where its machine IS.  */
    rows.push([f.fsm_state, d.state || "\u2014"]);

    if(d.disabled) {
        rows.push([f.disabled, f.yes]);
    }
    if(d.parent) {
        rows.push([f.parent, d.parent]);
    }
    if(d.bottom_gobj) {
        rows.push([f.bottom_gobj, d.bottom_gobj]);
    }
    if(d.commands) {
        rows.push([f.commands, f.yes]);
    }
    if(Array.isArray(d.gobj_trace_level) && d.gobj_trace_level.length > 0) {
        rows.push([f.traces, d.gobj_trace_level.join(", ")]);
    }
    if(Array.isArray(d.gobj_flags) && d.gobj_flags.length > 0) {
        rows.push([f.flags, d.gobj_flags.join(", ")]);
    }

    let kids = Array.isArray(d.children)? d.children.length: 0;
    if(kids > 0) {
        rows.push([
            f.children,
            d.is_collapsed? (kids + " " + f.collapsed): String(kids)
        ]);
    }

    return rows;
}

export {
    ROLES,
    STATUSES,
    STATUS_SYMBOLS,
    node_role,
    node_status,
    node_status_key,
    node_status_symbol,
    node_badge_keys,
    node_labels,
    node_info_rows,
    role_i18n_key,
    describe_js_gobj,
    describe_backend_node,
    describe_backend_tree,
};
