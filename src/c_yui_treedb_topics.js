/***********************************************************************
 *          c_yui_treedb_topics.js
 *
 *          Management of TreeDB's topics with Bulma tabs
 *
 *          Copyright (c) 2025, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/

import {
    SDATA,
    SDATA_END,
    data_type_t,
    event_flag_t,
    kw_flag_t,
    gclass_create,
    log_error,
    gobj_read_pointer_attr,
    gobj_subscribe_event,
    gobj_unsubscribe_event,
    gobj_parent,
    sprintf,
    gobj_name,
    gobj_find_child,
    gobj_read_attr,
    createElement2,
    kw_get_dict_value,
    kw_get_str,
    gobj_send_event,
    gobj_publish_event,
    gobj_write_attr,
    gobj_short_name,
    gobj_read_str_attr,
    gobj_read_bool_attr,
    gobj_start,
    gobj_stop,
    gobj_create_service,
    gobj_command,
    gobj_match_children,
    msg_iev_get_stack,
    kw_get_dict, gobj_stop_children,
    refresh_language,
    gobj_destroy,
    is_gobj,
    gobj_is_destroying,
    log_warning,
    gclass_find_by_name,
    clean_name,
} from "@yuneta/gobj-js";

import {yui_shell_show_error, yui_shell_show_modal, yui_shell_popup_layer} from "./shell_modals.js";
import {yui_shell_of} from "./c_yui_shell.js";

import {t} from "i18next";

/***************************************************************
 *              Constants
 ***************************************************************/
const GCLASS_NAME = "C_YUI_TREEDB_TOPICS";

/***************************************************************
 *              Data
 ***************************************************************/
const attrs_table = [
SDATA(data_type_t.DTP_POINTER,  "subscriber",       0,  null,   "Subscriber of output events"),
SDATA(data_type_t.DTP_POINTER,  "gobj_remote_yuno", 0,  null,   "Remote yuno for data fetching"),
SDATA(data_type_t.DTP_STRING,   "treedb_name",      0,  null,   "Remote TreeDB service name"),
SDATA(data_type_t.DTP_JSON,     "descs",            0,  null,   "Description of topics"),
SDATA(data_type_t.DTP_BOOLEAN,  "system",           0,  false,  "Manage system topics (true) or user topics (false)"),
SDATA(data_type_t.DTP_STRING,   "tabs_style",       0,  "is-toggle is-fullwidth", "Bulma tab styling"),
SDATA(data_type_t.DTP_POINTER,  "$container",       0,  null,   "Root HTML element, show/hide managed by external routing"),
SDATA(data_type_t.DTP_POINTER,  "$current_item",    0,  null,   "Currently selected item"),
SDATA(data_type_t.DTP_STRING,   "last_selection",   0,  null,   "Last href selection"),
SDATA_END()
];

let PRIVATE_DATA = {
    $container:         null,
    treedb_name:        "",
    gobj_remote_yuno:   null,
    descs:              null,
    _topics_subscribed: {},
    selected_topic:     "",     /*  the currently shown topic tab (for jtree)  */
    json_gobj:          null,   /*  C_YUI_JSON viewer (raw tranger / jtree)  */
    json_win:           null,   /*  C_YUI_WINDOW hosting it, desktop (or null)  */
    json_modal:         null,   /*  shell modal hosting it, mobile (or null)  */
    json_mode:          "",     /*  "tranger" | "jtree": what the viewer shows  */
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
    build_ui(gobj);

    /*
     *  CHILD subscription model
     */
    let subscriber = gobj_read_pointer_attr(gobj, "subscriber");
    if(!subscriber) {
        subscriber = gobj_parent(gobj);
    }
    gobj_subscribe_event(gobj, null, {}, subscriber);
}

/***************************************************************
 *          Framework Method: Start
 ***************************************************************/
function mt_start(gobj)
{
    request_treedb_descs(gobj);
}

/***************************************************************
 *          Framework Method: Stop
 ***************************************************************/
function mt_stop(gobj)
{
    close_json_viewer(gobj);
    gobj_stop_children(gobj);
}

/***************************************************************
 *          Framework Method: Destroy
 ***************************************************************/
function mt_destroy(gobj)
{
    destroy_ui(gobj);
}

/************************************************************
 *      Framework Method command
 ************************************************************/
function mt_command_parser(gobj, command, kw, src)
{
    switch(command) {
        case "help":
            return cmd_help(gobj, command, kw, src);
        case "get_topic_data":
            return cmd_get_topic_data(gobj, command, kw, src);
        default:
            log_error("Command not found: %s", command);
            return {
                "result": -1,
                "comment": sprintf("Command not found: %s", command),
                "schema": null,
                "data": null
            };
    }
}



                    /***************************
                     *      Commands
                     ***************************/




/************************************************************
 *
 ************************************************************/
function cmd_help(gobj, cmd, kw, src)
{
    return {
        "result": 0,
        "comment": "",
        "schema": null,
        "data": null
    };
}

/************************************************************
 *
 ************************************************************/
function cmd_get_topic_data(gobj, cmd, kw, src)
{
    let topic_name = kw.topic_name;

    let gobj_topic_form = gobj_find_child(gobj,
        {
            __gobj_name__: `${gobj_name(gobj)}?${topic_name}`
        }
    );

    if(!gobj_topic_form) {
        return {
            "result": -1,
            "comment": sprintf("gobj child %s not found", topic_name),
            "schema": null,
            "data": null
        };
    }

    return gobj_command(gobj_topic_form, cmd, kw, gobj);
}




                    /***************************
                     *      Local Methods
                     ***************************/




/************************************************************
 *   Build UI
 ************************************************************/
function build_ui(gobj)
{
    /*----------------------------------------------*
     *  Layout Schema
     *----------------------------------------------*/
    let $container = createElement2(
        ['div', {class: `C_YUI_TREEDB_TOPICS ${gobj_read_attr(gobj, "treedb_name")}`, style: 'height:100%; display:flex; flex-direction:column;'}, [
            ['div', {class: 'is-flex-grow-0'}, [
                ['div', {class: 'is-flex is-align-items-center TREEDB_TOPICS_TOOLBAR',
                         style: 'gap:.25rem; padding:.25rem .25rem;'}, [
                    /*  Inspect the treedb's raw tranger json (whole service,
                     *  print-tranger, lazy drill).  */
                    ['button', {class: 'button TREEDB_JSON_BTN',
                                title: t('raw json'), 'aria-label': t('raw json'),
                                'data-i18n-title': 'raw json', 'data-i18n-aria-label': 'raw json'}, [
                        ['span', {class: 'icon'}, [['i', {class: 'yi-eye'}]]],
                        ['span', {class: 'is-hidden-mobile', i18n: 'raw json'}, 'raw json']
                    ], {
                        click: (evt) => {
                            evt.stopPropagation();
                            gobj_send_event(gobj, "EV_OPEN_JSON", {}, gobj);
                        }
                    }],
                    /*  The selected topic's logical tree (jtree, non-collapsed:
                     *  a client-side collapsible tree, no server drill).  */
                    ['button', {class: 'button ml-1 TREEDB_JTREE_BTN',
                                title: t('tree json'), 'aria-label': t('tree json'),
                                'data-i18n-title': 'tree json', 'data-i18n-aria-label': 'tree json'}, [
                        ['span', {class: 'icon'}, [['i', {class: 'yi-hexagon-nodes'}]]],
                        ['span', {class: 'is-hidden-mobile', i18n: 'tree json'}, 'tree json']
                    ], {
                        click: (evt) => {
                            evt.stopPropagation();
                            gobj_send_event(gobj, "EV_OPEN_JTREE", {}, gobj);
                        }
                    }],
                ]],
                ['div', {class: `tabs ${gobj_read_attr(gobj, "tabs_style")}`, style: ''}, [
                    ['ul', {}]
                ]],
            ]],
            ['div', {class: 'is-flex-grow-1 sub-container', style: 'height:100%; min-height:0; overflow: auto;'}, [
            ]]
        ]]
    );
    gobj_write_attr(gobj, "$container", $container);
    refresh_language($container, t);
    refresh_jtree_button(gobj);     /*  starts disabled until a tree topic is shown  */
}

/************************************************************
 *  Enable the "Tree JSON" button only for a hierarchical topic (one with a
 *  self-referent hook) — a flat topic has no tree to draw. Called at build
 *  time and on every tab change. Native `disabled` both dims the button
 *  (Bulma) and blocks its click, so open_json_viewer's guard is a backstop.
 ************************************************************/
function refresh_jtree_button(gobj)
{
    let $container = gobj_read_attr(gobj, "$container");
    if(!$container) {
        return;
    }
    let $btn = $container.querySelector(".TREEDB_JTREE_BTN");
    if(!$btn) {
        return;
    }
    let topic = gobj.priv.selected_topic || "";
    let descs = gobj_read_attr(gobj, "descs") || {};
    $btn.disabled = !self_hook_of(descs[topic], topic);
}

/************************************************************
 *   Show a non-blocking inline error banner at the top of the view
 *   (used when the treedb schema `descs` cannot load). Reuses a single
 *   banner so retries don't stack.
 ************************************************************/
function show_load_error(gobj, message)
{
    let $container = gobj_read_attr(gobj, "$container");
    if(!$container) {
        return;
    }
    let $err = $container.querySelector(".treedb-load-error");
    if(!$err) {
        $err = createElement2(
            ["div", {class: "notification is-danger is-light m-3 treedb-load-error"}, []]
        );
        $container.insertBefore($err, $container.firstChild);
    }
    let treedb = gobj_read_attr(gobj, "treedb_name") || "";
    $err.textContent = (treedb ? `${treedb}: ` : "") + (message || "cannot load treedb");
}

/************************************************************
 *   Destroy UI
 ************************************************************/
function destroy_ui(gobj)
{
    let $container = gobj_read_attr(gobj, "$container");
    if($container) {
        if($container.parentNode) {
            $container.parentNode.removeChild($container);
        }
        gobj_write_attr(gobj, "$container", null);
    }
}

/************************************************************
 *   Add tab
 ************************************************************/
function add_tab(gobj, gobj2, id, text, icon)
{
    let $container = gobj_read_attr(gobj, "$container");
    let $tabs = $container.querySelector('ul');

    /*
     *  Create li a
     */
    let $item = createElement2(
        ['li', {class: ''}, [ // is-active
            ['a', {href: id}]
        ]]
    );
    $tabs.appendChild($item);
    $item.gobj = gobj2; // Cross-reference

    /*
     *  TAB: Add icon/text to a
     */
    let $a = $item.querySelector('a');

    /*
     *  Add icon
     */
    if(icon) {
        $a.appendChild(
            createElement2(
                ['span', {class: 'icon is-small is-hidden-mobile'},
                    ['i', {class: `${icon}`}]
                ]
            )
        );
    }

    /*
     *  TAB: Add text
     */
    $a.appendChild(
        createElement2(['span', {i18n: text, class: ''}, text])
    );

    /*
     *  Translate the tab NOW.  The span carries data-i18n but its
     *  initial text is the raw key (the topic_name).  Tabs are built
     *  lazily when topic descriptions arrive from the backend —
     *  AFTER the host's one-time refresh_language($container,t) —
     *  so without this they stay as raw keys ("device_groups", …).
     *  `t` is the i18next translator already imported here.
     */
    refresh_language($a, t);

    /*
     *  Self-contained tab navigation.  The `href` is kept only as a
     *  stable id (remove_tab selects by it); intercept the click so
     *  we do NOT mutate window.location.hash.  Historically this
     *  component relied on the legacy C_YUI_MAIN/C_YUI_ROUTING host
     *  catching `#<gobj>?<topic>` and sending EV_SHOW back; under the
     *  new C_YUI_SHELL no host does that and the bogus hash would be
     *  rejected by the shell router.  Dispatching EV_SHOW to self
     *  works under any host (old or new).
     */
    $a.addEventListener("click", function(ev) {
        ev.preventDefault();
        /*  Switch locally now (instant, works standalone) … */
        gobj_send_event(gobj, "EV_SHOW", {href: id}, gobj);
        /*  … and tell any host so it can mirror the topic into the
         *  URL path (deep-link / reload restore).  Optional sub:
         *  EVF_NO_WARN_SUBS so standalone use stays quiet. */
        let topic = id.indexOf("?") >= 0 ? id.split("?")[1] : id;
        gobj_publish_event(gobj, "EV_TOPIC_SELECTED", {topic: topic});
    });

    /*
     *  SUB-CONTAINER, add child content
     */
    let $sub_container = $container.querySelector('.sub-container');

    let $child_content = gobj_read_attr(gobj2, "$container");
    $child_content.classList.add("is-hidden");
    $sub_container.appendChild($child_content);
}

/************************************************************
 *   Destroy UI
 ************************************************************/
function remove_tab(gobj, gobj2, id)
{
    let $container = gobj_read_attr(gobj, "$container");
    let $a = $container.querySelector(`a[href="${id}"]`);
    if($a) {
        let $li = $a.parentNode;
        if($li) {
            $li.classList.remove('is-active');
            if($li.parentNode) {
                $li.parentNode.removeChild($li);
            }
        }
    }
    let $child_content = gobj_read_attr(gobj2, "$container");
    if($child_content && $child_content.parentNode) {
        $child_content.parentNode.removeChild($child_content);
    }
}

/************************************************************
 *  Command to remote service
 ************************************************************/
function request_treedb_descs(gobj)
{
    let gobj_remote_yuno = gobj_read_pointer_attr(gobj, "gobj_remote_yuno");
    if(!gobj_remote_yuno) {
        log_error(`${gobj_short_name(gobj)}: No gobj_remote_yuno defined`);
        return;
    }

    let command = "descs";
    let treedb_name = gobj_read_str_attr(gobj, "treedb_name");
    let kw = {
        service: treedb_name,
        treedb_name: treedb_name
    };

    let ret = gobj_command(
        gobj_remote_yuno,
        command,
        kw,
        gobj
    );
    if(ret) {
        log_error(ret);
    }
}

/************************************************************
 *  Response of remote command
 ************************************************************/
function process_treedb_descs(gobj)
{
    /*
     *  descs is a dict: { __snaps__: {…}, roles: {…}, users: {…} }
     *  Create a topic_form for each topic
     *  Add a Bulma tab for each topic
     */
    let gobj_remote_yuno = gobj_read_pointer_attr(gobj, "gobj_remote_yuno");
    let descs = gobj_read_attr(gobj, "descs");
    let system = gobj_read_bool_attr(gobj, "system");
    let treedb_name = gobj_read_str_attr(gobj, "treedb_name");
    for(const [key, desc] of Object.entries(descs)) {
        if(system) {
        } else {
            if(key.substring(0, 2) === "__") {
                continue;
            }
        }

        let kw_topic_form = {
            subscriber: gobj,  // HACK get all output events

            // TODO set according the authz
            //with_edit_button: true,
            with_new_button: true,
            with_delete_button: true,

            treedb_name: treedb_name,
            topic_name: key,
            desc: desc
        };

        let id = `${gobj_name(gobj)}?${desc.topic_name}`;
        let gobj_topic_form = gobj_create_service(
            id,
            "C_YUI_TREEDB_TOPIC_WITH_FORM",
            kw_topic_form,
            gobj
        );

        // TODO get icon from remote config
        add_tab(gobj, gobj_topic_form, id, key, "yi-table");

        gobj_start(gobj_topic_form);
    }

    /*
     *  Activate the selection: in-memory last_selection if set
     *  (intra-session tab change), else the persisted topic from a
     *  previous page load, else null → ac_show selects the first
     *  tab.  ac_show falls back to first if the href has no tab
     *  (e.g. the persisted topic no longer exists in the schema).
     */
    let href = gobj_read_str_attr(gobj, "last_selection");
    if(!href) {
        try {
            let topic = window.localStorage.getItem(
                `yui_treedb_topics:${gobj_name(gobj)}`
            );
            if(topic) {
                href = `${gobj_name(gobj)}?${topic}`;
            }
        } catch(e) {
            // localStorage unavailable — fall through to first tab
        }
    }
    gobj_send_event(
        gobj,
        "EV_SHOW",
        {
            href: href
        },
        gobj
    );

    /*
     *  Subscribe events to manage Ui_treedb_topic_form kids
     *  and get data
     */
    let kids = gobj_match_children(
        gobj,
        {
            __gclass_name__: "C_YUI_TREEDB_TOPIC_WITH_FORM"
        }
    );
    for(let i=0; i<kids.length; i++) {
        let kid = kids[i];
        let topic_name = gobj_read_attr(kid, "topic_name");
        get_nodes(gobj, topic_name);
    }
}

/************************************************************
 *
 ************************************************************/
function get_nodes(gobj, topic_name)
{
    let priv = gobj.priv;
    const treedb_name = priv.treedb_name;

    subscribe_treedb(gobj, topic_name);

    /*
     *  Get data
     */
    treedb_nodes(
        gobj,
        treedb_name,
        topic_name,
        {
            list_dict: true
        }
    );
}

/************************************************************
 *
 ************************************************************/
function subscribe_treedb(gobj, topic_name)
{
    let priv = gobj.priv;
    const gobj_remote_yuno = priv.gobj_remote_yuno;
    const treedb_name = priv.treedb_name;

    /*
     *  Avoid repetitions of subscribings
     */
    if(priv._topics_subscribed[topic_name]) {
        return;
    }
    priv._topics_subscribed[topic_name] = true;

    gobj_subscribe_event(
        gobj_remote_yuno,
        "EV_TREEDB_NODE_CREATED",
        {
            __service__: treedb_name,
            __filter__: {
                "treedb_name": treedb_name,
                "topic_name": topic_name
            }
        },
        gobj
    );
    gobj_subscribe_event(
        gobj_remote_yuno,
        "EV_TREEDB_NODE_UPDATED",
        {
            __service__: treedb_name,
            __filter__: {
                "treedb_name": treedb_name,
                "topic_name": topic_name
            }
        },
        gobj
    );
    gobj_subscribe_event(
        gobj_remote_yuno,
        "EV_TREEDB_NODE_DELETED",
        {
            __service__: treedb_name,
            __filter__: {
                "treedb_name": treedb_name,
                "topic_name": topic_name
            }
        },
        gobj
    );
}

/************************************************************
 *
 ************************************************************/
function unsubscribe_treedb(gobj, topic_name)
{
    let priv = gobj.priv;
    const gobj_remote_yuno = priv.gobj_remote_yuno;
    const treedb_name = priv.treedb_name;

    /*
     *  Avoid repetitions of unsubscribings
     */
    if(!priv._topics_subscribed[topic_name]) {
        return;
    }
    priv._topics_subscribed[topic_name] = false;

    gobj_unsubscribe_event(gobj_remote_yuno,
        "EV_TREEDB_NODE_CREATED",
        {
            __service__: treedb_name,
            __filter__: {
                "treedb_name": treedb_name,
                "topic_name": topic_name
            }
        },
        gobj
    );
    gobj_unsubscribe_event(gobj_remote_yuno,
        "EV_TREEDB_NODE_UPDATED",
        {
            __service__: treedb_name,
            __filter__: {
                "treedb_name": treedb_name,
                "topic_name": topic_name
            }
        },
        gobj
    );
    gobj_unsubscribe_event(gobj_remote_yuno,
        "EV_TREEDB_NODE_DELETED",
        {
            __service__: treedb_name,
            __filter__: {
                "treedb_name": treedb_name,
                "topic_name": topic_name
            }
        },
        gobj
    );
}

/********************************************
 *
 ********************************************/
function get_gobj_formtable(gobj, topic_name)
{
    let kids = gobj_match_children(
        gobj,
        {
            __gclass_name__: "C_YUI_TREEDB_TOPIC_WITH_FORM"
        }
    );

    for(let i=0; i<kids.length; i++) {
        let kid = kids[i];
        let topic_name_ = gobj_read_attr(kid, "topic_name");
        if(topic_name_ === topic_name) {
            return kid;
        }
    }

    return null;
}

/************************************************************
 *  Command to remote service
 ************************************************************/
function treedb_nodes(gobj, treedb_name, topic_name, options)
{
    let command = "nodes";

    let gobj_remote_yuno = gobj_read_pointer_attr(gobj, "gobj_remote_yuno");
    let kw = {
        service: treedb_name,
        treedb_name: treedb_name,
        topic_name: topic_name,
        options: options || {}
    };

    kw.__md_command__ = { // Data to be returned
        topic_name: topic_name,
    };

    // TODO review msg_iev_write_key(kw, "__topic_name__", topic_name);

    let ret = gobj_command(
        gobj_remote_yuno,
        command,
        kw,
        gobj
    );
    if(ret) {
        log_error(ret);
    }
}

/************************************************************
 *  Command to remote service
 ************************************************************/
function treedb_create_node(gobj, treedb_name, topic_name, record, options)
{
    let command = "create-node";

    let gobj_remote_yuno = gobj_read_pointer_attr(gobj, "gobj_remote_yuno");
    let kw = {
        service: treedb_name,
        treedb_name: treedb_name,
        topic_name: topic_name,
        record: record,
        options: options || {}
    };

    kw.__md_command__ = { // Data to be returned
        topic_name: topic_name,
    };
    // TODO review msg_iev_write_key(kw, "__topic_name__", topic_name);

    let ret = gobj_command(
        gobj_remote_yuno,
        command,
        kw,
        gobj
    );
    if(ret) {
        log_error(ret);
    }
}

/************************************************************
 *  Command to remote service
 ************************************************************/
function treedb_update_node(gobj, treedb_name, topic_name, record, options)
{
    let command = "update-node";

    let gobj_remote_yuno = gobj_read_pointer_attr(gobj, "gobj_remote_yuno");
    let kw = {
        service: treedb_name,
        treedb_name: treedb_name,
        topic_name: topic_name,
        record: record,
        options: options || {}
    };

    kw.__md_command__ = { // Data to be returned
        topic_name: topic_name,
    };
    // TODO review msg_iev_write_key(kw, "__topic_name__", topic_name);

    let ret = gobj_command(
        gobj_remote_yuno,
        command,
        kw,
        gobj
    );
    if(ret) {
        log_error(ret);
    }
}

/************************************************************
 *  Command to remote service
 ************************************************************/
function treedb_delete_node(gobj, treedb_name, topic_name, record, options)
{
    let command = "delete-node";

    let gobj_remote_yuno = gobj_read_pointer_attr(gobj, "gobj_remote_yuno");
    let kw = {
        service: treedb_name,
        treedb_name: treedb_name,
        topic_name: topic_name,
        record: record,
        options: options || {}
    };

    kw.__md_command__ = { // Data to be returned
        topic_name: topic_name,
    };
    // TODO review msg_iev_write_key(kw, "__topic_name__", topic_name);

    let ret = gobj_command(
        gobj_remote_yuno,
        command,
        kw,
        gobj
    );
    if(ret) {
        log_error(ret);
    }
}

/************************************************************
 *  True on a phone-width viewport (Bulma's mobile breakpoint).
 ************************************************************/
function is_mobile()
{
    return typeof window !== "undefined" && window.innerWidth <= 768;
}

/************************************************************
 *  JSON viewer (a single C_YUI_JSON in a window/modal) with two feeds:
 *      mode "tranger" -> print-tranger of the whole service (lazy drill),
 *      mode "jtree"   -> the selected topic's logical tree (one-shot).
 *  Reused across modes: each open sets the mode and re-fetches (EV_SET_JSON
 *  replaces the content). CHILD model: it publishes EV_EXPAND_PATH to us.
 ************************************************************/
function open_json_viewer(gobj, mode, topic)
{
    let priv = gobj.priv;

    if(mode === "jtree" && !topic) {
        yui_shell_show_error(yui_shell_of(gobj), "select a topic first", {t: t});
        return;
    }
    /*  jtree only means something for a hierarchical topic (one with a
     *  self-referent hook). For a flat topic there is no tree to draw and the
     *  backend would answer "What hook?" — say so plainly and don't open an
     *  empty viewer. */
    if(mode === "jtree") {
        let descs = gobj_read_attr(gobj, "descs") || {};
        if(!self_hook_of(descs[topic], topic)) {
            yui_shell_show_error(yui_shell_of(gobj),
                `'${topic}' is not hierarchical (no self-referent hook)`, {t: t});
            return;
        }
    }
    priv.json_mode = mode;

    /*  Already open: just switch the feed.  */
    if(priv.json_win || priv.json_modal) {
        fetch_json(gobj, mode, topic);
        return;
    }

    if(gclass_find_by_name("C_YUI_JSON") === null) {
        log_error(`${gobj_short_name(gobj)}: C_YUI_JSON not registered by the app`);
        yui_shell_show_error(yui_shell_of(gobj), "raw json viewer unavailable", {t: t});
        return;
    }

    let mobile = is_mobile();
    let shell = yui_shell_of(gobj);

    let jv = gobj_create_service(
        `treedb-topics-json-${clean_name(gobj_name(gobj))}`,
        "C_YUI_JSON",
        {
            subscriber: gobj,       /*  publishes EV_EXPAND_PATH to us  */
            title:      "raw json"
        },
        gobj
    );
    if(!jv) {
        log_error(`${gobj_short_name(gobj)}: cannot create the JSON viewer`);
        return;
    }
    priv.json_gobj = jv;
    gobj_start(jv);
    let $box = gobj_read_pointer_attr(jv, "$container");

    if(mobile) {
        if(!shell) {
            log_error(`${gobj_short_name(gobj)}: no shell, cannot open the JSON sheet`);
            close_json_viewer(gobj);
            return;
        }
        priv.json_modal = yui_shell_show_modal(shell, $box, {
            dialog:        true,
            logical_class: "TREEDB_JSON_SHEET",
            title:         `${priv.treedb_name} · ${t("raw json")}`,
            t:             t,
            on_close: () => {
                if(gobj_is_destroying(gobj)) {
                    return;
                }
                gobj_send_event(gobj, "EV_JSON_CLOSED", {}, gobj);
            }
        });
    } else {
        let $win_parent = (shell && yui_shell_popup_layer(shell)) ||
            (typeof document !== "undefined" && document.getElementById("top-layer")) ||
            null;

        priv.json_win = gobj_create_service(
            `treedb-topics-jsonwin-${clean_name(gobj_name(gobj))}`,
            "C_YUI_WINDOW",
            {
                $parent:    $win_parent,
                subscriber: null,
                modal:      false,
                showMax:    true,
                showFooter: false,
                resizable:  true,
                center:     true,
                auto_save_size_and_position: true,
                width:      640,
                height:     620,
                logical_class: "TREEDB_JSON_WINDOW",
                title:      `${priv.treedb_name} · ${t("raw json")}`,
                icon:       "yi-eye",
                body:       $box,
                manager:    null,
                on_close: () => {
                    if(gobj_is_destroying(gobj)) {
                        return;
                    }
                    gobj_send_event(gobj, "EV_JSON_CLOSED", {}, gobj);
                }
            },
            gobj
        );
        if(!priv.json_win) {
            log_error(`${gobj_short_name(gobj)}: cannot create the JSON window`);
            close_json_viewer(gobj);
            return;
        }
    }

    fetch_json(gobj, mode, topic);
}

/************************************************************
 *  Issue the first fetch for a viewer mode.
 ************************************************************/
function fetch_json(gobj, mode, topic)
{
    if(mode === "jtree") {
        request_jtree(gobj, topic);
    } else {
        request_print_tranger(gobj, "");
    }
}

/************************************************************
 *  Close the JSON viewer (user dismiss / teardown).
 ************************************************************/
function close_json_viewer(gobj)
{
    let priv = gobj.priv;
    let jv = priv.json_gobj;
    let win = priv.json_win;
    let modal = priv.json_modal;

    priv.json_gobj = null;
    priv.json_win = null;
    priv.json_modal = null;

    if(win && is_gobj(win)) {
        try {
            gobj_destroy(win);
        } catch(e) {
            log_warning(`${gobj_short_name(gobj)}: already gone: ${e}`);
        }
    }
    if(modal && typeof modal.close === "function") {
        try {
            modal.close();
        } catch(e) {
            log_warning(`${gobj_short_name(gobj)}: already gone: ${e}`);
        }
    }
    if(jv && is_gobj(jv)) {
        try {
            /*  STOP, then destroy — the viewer was STARTED in open_json_viewer.
             *  gobj_destroy() raises the `destroying` flag before it can stop a
             *  running gobj, so destroying it straight logs "Destroying a
             *  RUNNING gobj" + "gobj NULL or DESTROYED" and skips its mt_stop. */
            gobj_stop(jv);
            gobj_destroy(jv);
        } catch(e) {
            log_warning(`${gobj_short_name(gobj)}: already gone: ${e}`);
        }
    }
}

/************************************************************
 *  Fetch the treedb's raw tranger (or one subtree when `path` is set),
 *  collapsed at 100 so a huge tranger stays a small payload of
 *  `__collapsed__` stubs the viewer expands on demand.
 ************************************************************/
function request_print_tranger(gobj, path)
{
    let priv = gobj.priv;
    let remote = gobj_read_pointer_attr(gobj, "gobj_remote_yuno");
    if(!remote) {
        log_error(`${gobj_short_name(gobj)}: No gobj_remote_yuno defined`);
        let jv = priv.json_gobj;
        if(path && jv && is_gobj(jv) && !gobj_is_destroying(jv)) {
            gobj_send_event(jv, "EV_SUBTREE_ERROR",
                {path: path, error: t("no session")}, gobj);
        }
        return;
    }
    let ret = gobj_command(remote, "print-tranger",
        {
            service:     priv.treedb_name,
            expanded:    1,
            lists_limit: 100,
            dicts_limit: 100,
            path:        path || ""
        }, gobj);
    if(ret) {
        log_error(ret);
    }
}

/************************************************************
 *  The self-referent hook of a topic — the link that makes the topic a tree,
 *  and the `hook` the backend `jtree` command needs. Returns the hook name, or
 *  "" when the topic is not hierarchical.
 *
 *  In a topic descriptor (`desc.cols`, a list of column descriptors) a tree
 *  shows up as an fkey column pointing back to the SAME topic:
 *      col.fkey = { <parent_topic>: <hook_name> }
 *  When the parent topic is this topic, <hook_name> is the hook to traverse.
 *  (e.g. device_groups.group_parent: fkey {device_groups: "device_groups"}.)
 ************************************************************/
function self_hook_of(desc, topic)
{
    if(!desc || !Array.isArray(desc.cols) || !topic) {
        return "";
    }
    for(let col of desc.cols) {
        if(!col.fkey || typeof col.fkey !== "object") {
            continue;
        }
        if(Object.prototype.hasOwnProperty.call(col.fkey, topic)) {
            let hook = col.fkey[topic];
            if(hook) {
                return hook;
            }
        }
    }
    return "";
}

/************************************************************
 *  Fetch the logical tree of one topic (jtree, non-collapsed). The viewer
 *  renders it as a client-side collapsible tree (no server drill).
 ************************************************************/
function request_jtree(gobj, topic)
{
    let priv = gobj.priv;
    let remote = gobj_read_pointer_attr(gobj, "gobj_remote_yuno");
    if(!remote) {
        log_error(`${gobj_short_name(gobj)}: No gobj_remote_yuno defined`);
        return;
    }
    /*  jtree needs the topic's self-referent hook; without it the backend
     *  answers "What hook?". open_json_viewer already guarded a non-tree
     *  topic, so an empty hook here is a real error, not a user miss. */
    let descs = gobj_read_attr(gobj, "descs") || {};
    let hook = self_hook_of(descs[topic], topic);
    if(!hook) {
        log_error(`${gobj_short_name(gobj)}: topic '${topic}' has no self-referent hook`);
        return;
    }
    let ret = gobj_command(remote, "jtree",
        {
            service:     priv.treedb_name,
            treedb_name: priv.treedb_name,
            topic_name:  topic,
            hook:        hook
        }, gobj);
    if(ret) {
        log_error(ret);
    }
}




                    /***************************
                     *      Actions
                     ***************************/




/************************************************************
 *  Remote response
 ************************************************************/
function ac_mt_command_answer(gobj, event, kw, src)
{
    let webix_msg = kw;

    let result;
    let comment;
    let schema;
    let data;

    try {
        result = webix_msg.result;
        comment = webix_msg.comment;
        schema = webix_msg.schema;
        data = webix_msg.data;
    } catch (e) {
        log_error(e);
        return;
    }
    let __command__  = msg_iev_get_stack(gobj, kw, "command_stack", true);
    let command = kw_get_str(gobj, __command__, "command", "", kw_flag_t.KW_REQUIRED);
    let kw_command = kw_get_dict(gobj, __command__, "kw", {}, kw_flag_t.KW_REQUIRED);

    /*
     *  The JSON viewer's two feeds: `print-tranger` (whole tranger, lazy drill
     *  by echoed `path`) and `jtree` (the selected topic's logical tree,
     *  non-collapsed, one-shot). Handled before the generic error path, which
     *  returns early.
     */
    if(command === "print-tranger" || command === "jtree") {
        let jv = gobj.priv.json_gobj;
        if(!jv || !is_gobj(jv) || gobj_is_destroying(jv)) {
            return 0;   /*  viewer closed before its answer landed: benign  */
        }
        let path = kw_get_str(gobj, kw_command, "path", "", 0);
        if(result < 0) {
            if(command === "print-tranger" && path) {
                gobj_send_event(jv, "EV_SUBTREE_ERROR",
                    {path: path, error: comment || "print-tranger failed"}, gobj);
            } else {
                yui_shell_show_error(yui_shell_of(gobj),
                    comment || `${command} failed`, {t: t});
            }
            return 0;
        }
        if(command === "print-tranger" && path) {
            gobj_send_event(jv, "EV_SUBTREE_LOADED", {path: path, json: data}, gobj);
        } else {
            gobj_send_event(jv, "EV_SET_JSON", {json: data}, gobj);
        }
        return 0;
    }

    if(result < 0) {
        if(command === "descs") {
            /*  The schema couldn't load (not a treedb, no authz for it, backend
             *  down…). Show an inline banner in the view rather than a blocking
             *  app-modal that wedges the whole SPA behind an empty tab. */
            show_load_error(gobj, t(comment));
        } else {
            yui_shell_show_error(yui_shell_of(gobj), comment, {t: t});
        }
        return 0;
    }

    switch(command) {
        case "descs":
            if(result >= 0) {
                gobj_write_attr(gobj, "descs", data);
                process_treedb_descs(gobj);
            }
            break;

        case "nodes":
            let topic_name = kw_get_str(gobj, kw_command, "topic_name", "", kw_flag_t.KW_REQUIRED);
            if(result >= 0) {
                let gobj_topic_form = gobj_find_child(gobj, {
                    __gobj_name__: `${gobj_name(gobj)}?${topic_name}`
                });
                gobj_send_event(
                    gobj_topic_form,
                    "EV_LOAD_NODES",
                    data,
                    gobj
                );
            }
            break;

        case "create-node":
        case "update-node":
        case "delete-node":
            // Don't process by here, process on subscribed events.
            break;

        default:
            log_error(`${gobj_short_name(gobj)} Command unknown: ${command}`);
    }

    return 0;
}

/************************************************************
 *  Parent (routing) inform us that we go showing
 *
 *      {
 *          href: href
 *      }
 *
 *  WARNING href is the full path,
 *  the path relative to this gobj is the right part of split href by '?'
 ************************************************************/
function ac_show(gobj, event, kw, src)
{
    let href = kw.href;

    let $container = gobj_read_attr(gobj, "$container");
    let $current_item = gobj_read_attr(gobj, "$current_item");
    let $a = $container.querySelector(`a[href="${href}"]`);
    if($a) {
        /*
         *  href pointing to inside gobj (with ? right part)
         */
        if($current_item && $current_item !== $a.parentNode) {
            $current_item.classList.remove('is-active');
            /*
             *  ac_show is the single owner of the tab switch: a
             *  self-contained tab click sends only EV_SHOW (no
             *  EV_HIDE from a host router), so hide the previously
             *  shown topic content here or it stays visible.
             */
            let prev = $current_item.gobj;
            if(prev) {
                let $prev = gobj_read_attr(prev, "$container");
                if($prev) {
                    $prev.classList.add("is-hidden");
                }
            }
        }
        $current_item = $a.parentNode;
        gobj_write_attr(gobj, "$current_item", $current_item);
        $current_item.classList.add('is-active');
    } else {
        /*
         *  href pointing without ? right part, select the first item
         */
        if(!$current_item) {
            // Get the first item
            $current_item = $container.querySelector(`li`);
            gobj_write_attr(gobj, "$current_item", $current_item);
        }
        if($current_item) {
            $current_item.classList.add('is-active');
        }
    }

    /*
     *  Save last selection, the topics can be not arrived yet.
     *  Also persist the topic so a full page reload (the gobj is
     *  recreated, last_selection is lost) restores the same tab.
     *  Keyed by the stable gobj name so it is per-treedb/per-view.
     */
    gobj_write_attr(gobj, "last_selection", href);
    if(href && href.indexOf("?") >= 0) {
        let topic = href.split("?")[1];
        gobj.priv.selected_topic = topic;   /*  for the jtree viewer  */
        try {
            window.localStorage.setItem(
                `yui_treedb_topics:${gobj_name(gobj)}`, topic
            );
        } catch(e) {
            // localStorage unavailable (privacy mode) — non-fatal
        }
    }

    /*
     *  Show sub-container
     */
    if($current_item) {
        let gobj2 = $current_item.gobj;
        if(gobj2) {
            let $sub_container = gobj_read_attr(gobj2, "$container");
            if($sub_container) {
                $sub_container.classList.remove("is-hidden");
            }
            gobj_send_event(gobj2, "EV_SHOW", kw, gobj);
        }
    }

    refresh_jtree_button(gobj);     /*  the new tab may or may not be a tree  */
    return 0;
}

/************************************************************
 *   Parent (routing) inform us that we go hidden
 ************************************************************/
function ac_hide(gobj, event, kw, src)
{
    /*
     *  Deactivate tab
     */
    let $current_item = gobj_read_attr(gobj, "$current_item");
    if($current_item) {
        $current_item.classList.remove('is-active');
    }

    /*
     *  Hide sub-container
     */
    if($current_item) {
        let gobj2 = $current_item.gobj;
        if(gobj2) {
            let $sub_container = gobj_read_attr(gobj2, "$container");
            if($sub_container) {
                $sub_container.classList.add("is-hidden");
            }
            gobj_send_event(gobj2, "EV_HIDE", {}, gobj);
        }
    }
    return 0;
}

/********************************************
 *  Remote subscription response
 ********************************************/
function ac_treedb_node_created(gobj, event, kw, src)
{
    let treedb_name = kw_get_str(gobj, kw, "treedb_name", "", 0);
    let topic_name = kw_get_str(gobj, kw, "topic_name", "", 0);
    let node = kw_get_dict_value(gobj, kw, "node", null, 0);

    if(treedb_name === gobj_read_str_attr(gobj, "treedb_name")) {
        let gobj_formtable = get_gobj_formtable(gobj, topic_name);
        gobj_send_event(
            gobj_formtable,
            "EV_LOAD_NODE_CREATED",
            [node],
            gobj
        );
    }

    return 0;
}

/********************************************
 *  Remote subscription response
 ********************************************/
function ac_treedb_node_updated(gobj, event, kw, src)
{
    let treedb_name = kw_get_str(gobj, kw, "treedb_name", "", 0);
    let topic_name = kw_get_str(gobj, kw, "topic_name", "", 0);
    let node = kw_get_dict_value(gobj, kw, "node", null, 0);

    if(treedb_name === gobj_read_str_attr(gobj, "treedb_name")) {
        let gobj_formtable = get_gobj_formtable(gobj, topic_name);
        gobj_send_event(
            gobj_formtable,
            "EV_LOAD_NODE_UPDATED",
            [node],
            gobj
        );
    }

    return 0;
}

/********************************************
 *  Remote subscription response
 ********************************************/
function ac_treedb_node_deleted(gobj, event, kw, src)
{
    let treedb_name = kw_get_str(gobj, kw, "treedb_name", "", 0);
    let topic_name = kw_get_str(gobj, kw, "topic_name", "", 0);
    let node = kw_get_dict_value(gobj, kw, "node", null, 0);

    if(treedb_name === gobj_read_str_attr(gobj, "treedb_name")) {
        let gobj_formtable = get_gobj_formtable(gobj, topic_name);
        gobj_send_event(
            gobj_formtable,
            "EV_NODE_DELETED",
            [node],
            gobj
        );
    }

    return 0;
}

/********************************************
 *  Event from formtable
 *  kw: {
 *      topic_name,
 *      record
 *  }
 ********************************************/
function ac_create_record(gobj, event, kw, src)
{
    let treedb_name = gobj_read_str_attr(gobj, "treedb_name");
    let topic_name = gobj_read_attr(src, "topic_name");
    let record = kw.record;

    let options = {
        list_dict: true,
        create: true,
        autolink: true
    };

    return treedb_update_node( // HACK use the powerful update_node
        gobj,
        treedb_name,
        topic_name,
        record,
        options
    );
}

/********************************************
 *  Event from formtable
 *  kw: {
 *      topic_name,
 *      record
 *  }
 ********************************************/
function ac_update_record(gobj, event, kw, src)
{
    let treedb_name = gobj_read_str_attr(gobj, "treedb_name");
    let topic_name = gobj_read_attr(src, "topic_name");
    let record = kw.record;

    let options = {
        list_dict: true,
        autolink: true
    };

    return treedb_update_node(
        gobj,
        treedb_name,
        topic_name,
        record,
        options
    );
}

/********************************************
 *  Event from formtable
 *  kw: {
 *      topic_name,
 *      record
 *  }
 ********************************************/
function ac_delete_record(gobj, event, kw, src)
{
    let treedb_name = gobj_read_str_attr(gobj, "treedb_name");
    let topic_name = gobj_read_attr(src, "topic_name");
    let record = kw.record;
    let options = {
        force: true
    };

    return treedb_delete_node(
        gobj,
        treedb_name,
        topic_name,
        record,
        options
    );
}

/********************************************
 *  Event from formtable
 *  kw: {
 *      topic_name,
 *  }
 ********************************************/
function ac_refresh_topic(gobj, event, kw, src)
{
    let options = {
        list_dict: true
    };

    let treedb_name = gobj_read_str_attr(gobj, "treedb_name");

    treedb_nodes(
        gobj,
        treedb_name,
        kw.topic_name,
        options
    );

    return 0;
}

/********************************************
 *  Open the raw-tranger JSON viewer (whole service).
 ********************************************/
function ac_open_json(gobj, event, kw, src)
{
    open_json_viewer(gobj, "tranger", null);
    return 0;
}

/********************************************
 *  Open the logical-tree (jtree) JSON of the selected topic.
 ********************************************/
function ac_open_jtree(gobj, event, kw, src)
{
    open_json_viewer(gobj, "jtree", gobj.priv.selected_topic || "");
    return 0;
}

/********************************************
 *  The viewer asked to load a collapsed subtree (tranger mode only):
 *  re-issue print-tranger for that path.
 ********************************************/
function ac_json_expand_path(gobj, event, kw, src)
{
    request_print_tranger(gobj, (kw && kw.path) || "");
    return 0;
}

/********************************************
 *  The JSON viewer was dismissed / torn down: release it, clear refs.
 ********************************************/
function ac_json_closed(gobj, event, kw, src)
{
    let priv = gobj.priv;
    let jv = priv.json_gobj;
    priv.json_gobj = null;
    priv.json_win = null;
    priv.json_modal = null;
    if(jv && is_gobj(jv)) {
        try {
            /*  STOP before destroy — the viewer was STARTED in open_json_viewer
             *  (see close_json_viewer for the full rationale). */
            gobj_stop(jv);
            gobj_destroy(jv);
        } catch(e) {
            log_warning(`${gobj_short_name(gobj)}: already gone: ${e}`);
        }
    }
    return 0;
}




                    /***************************
                     *          FSM
                     ***************************/




/*---------------------------------------------*
 *          Global methods table
 *---------------------------------------------*/
const gmt = {
    mt_create:          mt_create,
    mt_start:           mt_start,
    mt_stop:            mt_stop,
    mt_destroy:         mt_destroy,
    mt_command_parser:  mt_command_parser,
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
            ["EV_MT_COMMAND_ANSWER",    ac_mt_command_answer,       null],
            ["EV_TREEDB_NODE_CREATED",  ac_treedb_node_created,     null],
            ["EV_TREEDB_NODE_UPDATED",  ac_treedb_node_updated,     null],
            ["EV_TREEDB_NODE_DELETED",  ac_treedb_node_deleted,     null],
            ["EV_CREATE_RECORD",        ac_create_record,           null],
            ["EV_UPDATE_RECORD",        ac_update_record,           null],
            ["EV_DELETE_RECORD",        ac_delete_record,           null],
            ["EV_REFRESH_TOPIC",        ac_refresh_topic,           null],
            ["EV_OPEN_JSON",            ac_open_json,               null],
            ["EV_OPEN_JTREE",           ac_open_jtree,              null],
            ["EV_EXPAND_PATH",          ac_json_expand_path,        null],
            ["EV_JSON_CLOSED",          ac_json_closed,             null],
            ["EV_SHOW",                 ac_show,                    null],
            ["EV_HIDE",                 ac_hide,                    null],
        ]]
    ];

    /*---------------------------------------------*
     *          Events
     *---------------------------------------------*/
    const event_types = [
        ["EV_MT_COMMAND_ANSWER",    event_flag_t.EVF_PUBLIC_EVENT],
        ["EV_TREEDB_NODE_CREATED",  event_flag_t.EVF_PUBLIC_EVENT],
        ["EV_TREEDB_NODE_UPDATED",  event_flag_t.EVF_PUBLIC_EVENT],
        ["EV_TREEDB_NODE_DELETED",  event_flag_t.EVF_PUBLIC_EVENT],
        ["EV_CREATE_RECORD",        0],
        ["EV_UPDATE_RECORD",        0],
        ["EV_DELETE_RECORD",        0],
        ["EV_REFRESH_TOPIC",        0],
        ["EV_OPEN_JSON",            0],
        ["EV_OPEN_JTREE",           0],
        ["EV_EXPAND_PATH",          0],
        ["EV_JSON_CLOSED",          0],
        ["EV_SHOW",                 0],
        ["EV_HIDE",                 0],
        ["EV_TOPIC_SELECTED",
            event_flag_t.EVF_OUTPUT_EVENT | event_flag_t.EVF_NO_WARN_SUBS]
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
function register_c_yui_treedb_topics()
{
    return create_gclass(GCLASS_NAME);
}

export { register_c_yui_treedb_topics };
