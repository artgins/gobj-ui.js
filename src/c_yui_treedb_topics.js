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
    gobj_current_state,
    gobj_create_service,
    gobj_create_pure_child,
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
    is_object,
    is_array,
    empty_string,
} from "@yuneta/gobj-js";

import "./c_yui_treedb_topics.css";

import {yui_shell_show_error, yui_shell_show_modal, yui_shell_popup_layer} from "./shell_modals.js";
import {yui_shell_of, yui_shell_set_sub_routes} from "./c_yui_shell.js";

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
SDATA(data_type_t.DTP_BOOLEAN,  "with_cards_landing",0, false,  "Land on a grid of topic cards (list->detail): a card opens its table, with the tabs bar + a back-to-grid button. Off = tabs only (legacy)."),
SDATA(data_type_t.DTP_JSON,     "card_action_routes",0, null,   "Per-card hash-route templates {info, table, graph} with a {topic} placeholder (host-supplied, route-agnostic). Present ⇒ cards show 3 icon actions; absent ⇒ a single card that opens the table."),
SDATA(data_type_t.DTP_JSON,     "landing_routes",   0,  null,   "Host-supplied hashes for the two landing sub-views {cards, schema}; the toggle navigates to them so the landing is URL-addressable (ROUTING.md). Absent ⇒ toggle flips in-view only (legacy)."),
SDATA(data_type_t.DTP_STRING,   "base_route",       0,  "",     "This view's base route (host-supplied); used to declare its sub-routes (topics / info / schema) to the site map (ROUTING.md contributor)."),
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
    _pending_info:      null,   /*  topic whose info panel to show once descs load  */
    _selected_card_topic: null, /*  highlighted topic card in the landing grid  */
    _landing_view:      "cards",/*  landing sub-view: "cards" | "schema"  */
    schema_gobj:        null,   /*  C_YUI_TREEDB_SCHEMA child (built lazily)  */
    json_gobj:          null,   /*  C_YUI_JSON raw-tranger viewer (or null)  */
    json_win:           null,   /*  C_YUI_WINDOW hosting it, desktop (or null)  */
    json_modal:         null,   /*  shell modal hosting it, mobile (or null)  */
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
    /*  Retire our site-map sub-routes so a torn-down view leaves no
     *  stale children in the map (ROUTING.md contributor). */
    let shell = yui_shell_of(gobj);
    if(shell) {
        yui_shell_set_sub_routes(shell, gobj_read_str_attr(gobj, "base_route"), null);
    }
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
                    /*  Back to the topic-cards grid (cards-landing mode only);
                     *  hidden until a topic is open. */
                    ['button', {class: 'button TREEDB_TOPICS_BACK is-hidden',
                                title: t('topics'), 'aria-label': t('topics'),
                                'data-i18n-title': 'topics', 'data-i18n-aria-label': 'topics'}, [
                        ['span', {class: 'icon'}, [['i', {class: 'yi-arrow-left'}]]],
                        ['span', {class: 'is-hidden-mobile', i18n: 'topics'}, 'topics']
                    ], {
                        click: (evt) => {
                            evt.stopPropagation();
                            gobj_send_event(gobj, "EV_BACK_TO_TOPICS", {}, gobj);
                        }
                    }],
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
                    /*  Landing view toggle: cards grid <-> schema graph
                     *  (topics as nodes). Shown only on the landing. */
                    ['button', {class: 'button TREEDB_LANDING_TOGGLE is-hidden',
                                title: t('schema graph'), 'aria-label': t('schema graph'),
                                'data-i18n-title': 'schema graph',
                                'data-i18n-aria-label': 'schema graph'}, [
                        ['span', {class: 'icon'}, [['i', {class: 'yi-hexagon-nodes'}]]],
                        ['span', {class: 'is-hidden-mobile', i18n: 'schema'}, 'schema']
                    ], {
                        click: (evt) => {
                            evt.stopPropagation();
                            gobj_send_event(gobj, "EV_TOGGLE_LANDING_VIEW", {}, gobj);
                        }
                    }],
                ]],
                ['div', {class: `tabs ${gobj_read_attr(gobj, "tabs_style")}`, style: ''}, [
                    ['ul', {}]
                ]],
            ]],
            ['div', {class: 'is-flex-grow-1 sub-container', style: 'height:100%; min-height:0; overflow: auto;'}, [
            ]],
            /*  Cards-landing grid (list->detail): one card per topic, shown on
             *  entry; a click opens the topic's table. Empty/hidden in the
             *  legacy tabs-only mode. Reuses the shell's .yui-nav-cards look. */
            ['div', {class: 'is-flex-grow-1 TREEDB_TOPICS_LANDING is-hidden',
                     style: 'min-height:0; overflow:auto;'}, [
                ['div', {class: 'yui-nav-cards'}, []]
            ]],
            /*  Schema-graph landing (topics as nodes): hosts a C_YUI_TREEDB_SCHEMA
             *  child, built lazily on first toggle. */
            ['div', {class: 'is-flex-grow-1 TREEDB_TOPICS_SCHEMA is-hidden',
                     style: 'min-height:0; overflow:hidden;'}, []],
            /*  Routed topic-info panel (the card's info icon / .../<topic>/info):
             *  a read-only schema view built from the topic's desc. Hidden until
             *  the info route is active. */
            ['div', {class: 'is-flex-grow-1 TREEDB_TOPIC_INFO is-hidden',
                     style: 'min-height:0; overflow:auto;'}, []]
        ]]
    );
    gobj_write_attr(gobj, "$container", $container);
    refresh_language($container, t);
    refresh_toolbar_buttons(gobj);  /*  starts disabled until connected / a tree topic  */

    /*  Cards-landing: present the (still empty) grid from the first paint so
     *  there is no flash of an empty tabs bar while the schema loads. */
    if(gobj_read_bool_attr(gobj, "with_cards_landing")) {
        show_topics_landing(gobj);
    }
}

/************************************************************
 *  Is the backend session live? The Raw JSON viewer issues a remote
 *  print-tranger, so it only makes sense with a session — the remote
 *  (C_IEVENT_CLI) is in ST_SESSION exactly while connected.
 ************************************************************/
function is_connected(gobj)
{
    let remote = gobj_read_pointer_attr(gobj, "gobj_remote_yuno");
    return !!remote && gobj_current_state(remote) === "ST_SESSION";
}

/************************************************************
 *  Enable the "Raw JSON" button only when the backend session is up (it
 *  issues a remote print-tranger). Called at build, on every tab change, and
 *  when the host forwards a transport edge (EV_TRANSPORT_STATE). `connected`
 *  defaults to the live session state; the host passes it explicitly on a
 *  transport edge because the remote's state may not have settled yet. Native
 *  `disabled` dims the button (Bulma) and blocks its click.
 ************************************************************/
function refresh_toolbar_buttons(gobj, connected)
{
    let $container = gobj_read_attr(gobj, "$container");
    if(!$container) {
        return;
    }
    if(typeof connected !== "boolean") {
        connected = is_connected(gobj);
    }
    let $raw = $container.querySelector(".TREEDB_JSON_BTN");
    if($raw) {
        $raw.disabled = !connected;
    }
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
        select_topic_by_id(gobj, id);
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
    /*  Drop its landing card too, if any. */
    let $card = $container.querySelector(
        `.TREEDB_TOPIC_CARD[data-topic-href="${id}"]`);
    if($card && $card.parentNode) {
        $card.parentNode.removeChild($card);
    }
}

/************************************************************
 *  Select a topic: the single entry point for a tab click AND a
 *  landing-card click. Switch locally now (instant, works standalone)
 *  and tell any host so it can mirror the topic into the URL path
 *  (deep-link / reload restore). Optional sub: EVF_NO_WARN_SUBS so
 *  standalone use stays quiet.
 ************************************************************/
function select_topic_by_id(gobj, id)
{
    gobj_send_event(gobj, "EV_SHOW", {href: id}, gobj);
    let topic = id.indexOf("?") >= 0 ? id.split("?")[1] : id;
    gobj_publish_event(gobj, "EV_TOPIC_SELECTED", {topic: topic});
}

/************************************************************
 *  One icon-action anchor of a topic card: a REAL hash link
 *  (deep-linkable, middle-clickable) — the shell routes it on
 *  hashchange, no JS click handler needed.
 ************************************************************/
function card_action_anchor(logical_class, icon, i18n_key, href)
{
    return ['a', {
        class:                  logical_class,
        href:                   href,
        title:                  t(i18n_key),
        'aria-label':           t(i18n_key),
        'data-i18n-title':      i18n_key,
        'data-i18n-aria-label': i18n_key
    }, [
        ['span', {class: 'icon'}, [['i', {class: icon, 'aria-hidden': 'true'}]]]
    ]];
}

/************************************************************
 *  Add one topic card to the cards-landing grid (list->detail).
 *  With `card_action_routes` (host-supplied templates) the card
 *  shows three hash-routed icons — info / table / graph. Without,
 *  it falls back to a single card that opens the table (same id
 *  contract as the tab, `<gobj>?<topic>`).
 ************************************************************/
function add_topic_card(gobj, id, text, icon)
{
    let $container = gobj_read_attr(gobj, "$container");
    let $grid = $container.querySelector(".TREEDB_TOPICS_LANDING .yui-nav-cards");
    if(!$grid) {
        return;
    }

    let routes = gobj_read_attr(gobj, "card_action_routes");
    if(!is_object(routes)) {
        /*  Legacy single-action card: the whole card opens the table. */
        let $card = createElement2(
            ['a', {class: 'yui-nav-item yui-nav-card TREEDB_TOPIC_CARD',
                   href: '#', 'data-topic-href': id,
                   'aria-label': text, 'data-i18n-aria-label': text}, [
                ['span', {class: 'icon is-medium'}, [['i', {class: icon || 'yi-table',
                    'aria-hidden': 'true'}]]],
                ['span', {class: 'yui-nav-label', i18n: text}, text]
            ]]
        );
        $card.addEventListener("click", function(ev) {
            ev.preventDefault();
            select_topic_by_id(gobj, id);
        });
        $grid.appendChild($card);
        refresh_language($card, t);
        return;
    }

    /*  Three-icon card: info / table / graph, all real hash anchors.
     *  {topic} in each template is the raw topic name (identifier-safe,
     *  matching the tab/host `<base_route>/<topic>` convention). */
    let topic = id.indexOf("?") >= 0 ? id.split("?")[1] : id;
    let fill = (tpl) => String(tpl || "").replace("{topic}", topic);

    let actions = [];
    if(routes.info) {
        actions.push(card_action_anchor(
            "TREEDB_CARD_INFO", "yi-circle-info", "info", fill(routes.info)));
    }
    if(routes.table) {
        actions.push(card_action_anchor(
            "TREEDB_CARD_TABLE", "yi-table", "table", fill(routes.table)));
    }
    if(routes.graph) {
        actions.push(card_action_anchor(
            "TREEDB_CARD_GRAPH", "yi-hexagon-nodes", "graph", fill(routes.graph)));
    }

    let $card = createElement2(
        ['div', {class: 'TREEDB_TOPIC_CARD', 'data-topic': topic}, [
            ['span', {class: 'TREEDB_TOPIC_CARD_NAME', i18n: text}, text],
            ['div', {class: 'TREEDB_TOPIC_CARD_ACTIONS'}, actions]
        ]]
    );
    if(gobj.priv._selected_card_topic === topic) {
        $card.classList.add("is-selected");
    }
    /*  A click anywhere on the card selects it (highlight). A click that
     *  ALSO lands on an icon still runs the icon's hash navigation (we don't
     *  preventDefault) — "click outside = select, click an icon = select +
     *  enter". Selection crosses the FSM like every action. */
    $card.addEventListener("click", function() {
        gobj_send_event(gobj, "EV_SELECT_TOPIC_CARD", {topic: topic}, gobj);
    });
    $grid.appendChild($card);
    refresh_language($card, t);
}

/************************************************************
 *  Cards-landing mode: show the topic-cards grid (the section
 *  index), hide the tabs bar + the topic table, hide the back
 *  button. Deactivate any active tab so nothing looks selected.
 ************************************************************/
function show_topics_landing(gobj)
{
    let $container = gobj_read_attr(gobj, "$container");
    if(!$container) {
        return;
    }
    let $tabs = $container.querySelector(".tabs");
    let $sub = $container.querySelector(".sub-container");
    let $landing = $container.querySelector(".TREEDB_TOPICS_LANDING");
    let $schema = $container.querySelector(".TREEDB_TOPICS_SCHEMA");
    let $info = $container.querySelector(".TREEDB_TOPIC_INFO");
    let $back = $container.querySelector(".TREEDB_TOPICS_BACK");
    let $toggle = $container.querySelector(".TREEDB_LANDING_TOGGLE");
    if($tabs) {
        $tabs.classList.add("is-hidden");
    }
    if($sub) {
        $sub.classList.add("is-hidden");
    }
    if($info) {
        $info.classList.add("is-hidden");
    }
    if($back) {
        $back.classList.add("is-hidden");
    }
    /*  Cards grid vs schema graph — the two landing sub-views. */
    let schema_mode = gobj.priv._landing_view === "schema";
    if($toggle) {
        $toggle.classList.remove("is-hidden");   /*  the toggle lives on the landing  */
        $toggle.classList.toggle("is-primary", schema_mode);
    }
    if(schema_mode) {
        if($landing) {
            $landing.classList.add("is-hidden");
        }
        /*  Reveal the pane BEFORE building: G6 renders at 0×0 in a
         *  display:none container. */
        if($schema) {
            $schema.classList.remove("is-hidden");
        }
        build_schema_child(gobj);
        if(gobj.priv.schema_gobj) {
            gobj_send_event(gobj.priv.schema_gobj, "EV_SHOW", {}, gobj);
        }
    } else {
        if($schema) {
            $schema.classList.add("is-hidden");
        }
        if($landing) {
            $landing.classList.remove("is-hidden");
        }
    }

    /*  Hide the currently shown topic content + deactivate its tab. */
    let $current_item = gobj_read_attr(gobj, "$current_item");
    if($current_item) {
        $current_item.classList.remove("is-active");
        let gobj2 = $current_item.gobj;
        if(gobj2) {
            let $child = gobj_read_attr(gobj2, "$container");
            if($child) {
                $child.classList.add("is-hidden");
            }
        }
    }
}

/************************************************************
 *  Lazily build the schema-graph child (C_YUI_TREEDB_SCHEMA) into
 *  the landing's schema pane. It draws the treedb as topics+links
 *  from `descs` (already loaded) and navigates on a node click via
 *  the table hash route.
 ************************************************************/
function build_schema_child(gobj)
{
    let priv = gobj.priv;
    if(priv.schema_gobj) {
        return;
    }
    /*  Wait for the schema: on a deep-link/F5 to `.../schema` the route
     *  arrives before `descs` load. Building now would render an empty
     *  graph that never refreshes; process_treedb_descs re-shows the
     *  landing once descs arrive, which calls us again. */
    if(!is_object(gobj_read_attr(gobj, "descs"))) {
        return;
    }
    if(gclass_find_by_name("C_YUI_TREEDB_SCHEMA") === null) {
        log_error(`${gobj_short_name(gobj)}: C_YUI_TREEDB_SCHEMA not registered by the app`);
        return;
    }
    let $container = gobj_read_attr(gobj, "$container");
    let $pane = $container && $container.querySelector(".TREEDB_TOPICS_SCHEMA");
    if(!$pane) {
        return;
    }
    let routes = gobj_read_attr(gobj, "card_action_routes");
    let node_route = (is_object(routes) && routes.table) ? routes.table : "";

    let schema = gobj_create_pure_child(
        "schema_" + clean_name(gobj_name(gobj)),
        "C_YUI_TREEDB_SCHEMA",
        {
            subscriber: gobj,
            descs:      gobj_read_attr(gobj, "descs"),
            node_route: node_route,
            system:     gobj_read_bool_attr(gobj, "system")
        },
        gobj
    );
    if(!schema) {
        log_error(`${gobj_short_name(gobj)}: cannot create the schema view`);
        return;
    }
    priv.schema_gobj = schema;
    let $sc = gobj_read_attr(schema, "$container");
    if($sc) {
        $pane.appendChild($sc);
    }
    gobj_start(schema);
}

/************************************************************
 *  Cards-landing mode: enter a topic (hide the grid, show the
 *  tabs bar + the topic table + the back button). No-op unless
 *  the landing is enabled.
 ************************************************************/
function show_topic_detail(gobj)
{
    if(!gobj_read_bool_attr(gobj, "with_cards_landing")) {
        return;
    }
    let $container = gobj_read_attr(gobj, "$container");
    if(!$container) {
        return;
    }
    let $tabs = $container.querySelector(".tabs");
    let $sub = $container.querySelector(".sub-container");
    let $landing = $container.querySelector(".TREEDB_TOPICS_LANDING");
    let $schema = $container.querySelector(".TREEDB_TOPICS_SCHEMA");
    let $info = $container.querySelector(".TREEDB_TOPIC_INFO");
    let $back = $container.querySelector(".TREEDB_TOPICS_BACK");
    let $toggle = $container.querySelector(".TREEDB_LANDING_TOGGLE");
    if($landing) {
        $landing.classList.add("is-hidden");
    }
    if($schema) {
        $schema.classList.add("is-hidden");
    }
    if($info) {
        $info.classList.add("is-hidden");
    }
    if($toggle) {
        $toggle.classList.add("is-hidden");   /*  landing-only  */
    }
    if($tabs) {
        $tabs.classList.remove("is-hidden");
    }
    if($sub) {
        $sub.classList.remove("is-hidden");
    }
    if($back) {
        $back.classList.remove("is-hidden");
    }
}

/************************************************************
 *  Cards-landing mode: show the routed topic-info panel (the card's
 *  info icon / .../<topic>/info) — a read-only schema view built from
 *  the topic's desc. Hide the grid, tabs and table; show the back
 *  button. If the schema has not arrived yet, remember the topic and
 *  replay once descs load (deep-link / F5 on an info URL).
 ************************************************************/
function show_topic_info(gobj, topic)
{
    let priv = gobj.priv;
    if(empty_string(topic)) {
        show_topics_landing(gobj);
        return;
    }
    let descs = gobj_read_attr(gobj, "descs");
    if(!descs) {
        priv._pending_info = topic;   /*  wait for the schema  */
        return;
    }
    let desc = descs[topic];
    if(!is_object(desc)) {
        /*  Unknown topic (stale deep-link): fall back to the grid. */
        log_error(`${gobj_short_name(gobj)}: info for unknown topic '${topic}'`);
        show_topics_landing(gobj);
        return;
    }

    let $container = gobj_read_attr(gobj, "$container");
    let $info = $container && $container.querySelector(".TREEDB_TOPIC_INFO");
    if(!$info) {
        return;
    }
    build_topic_info_panel(gobj, $info, topic, desc);
    refresh_language($info, t);

    let $tabs = $container.querySelector(".tabs");
    let $sub = $container.querySelector(".sub-container");
    let $landing = $container.querySelector(".TREEDB_TOPICS_LANDING");
    let $schema = $container.querySelector(".TREEDB_TOPICS_SCHEMA");
    let $back = $container.querySelector(".TREEDB_TOPICS_BACK");
    let $toggle = $container.querySelector(".TREEDB_LANDING_TOGGLE");
    if($landing) {
        $landing.classList.add("is-hidden");
    }
    if($schema) {
        $schema.classList.add("is-hidden");
    }
    if($toggle) {
        $toggle.classList.add("is-hidden");
    }
    if($tabs) {
        $tabs.classList.add("is-hidden");
    }
    if($sub) {
        $sub.classList.add("is-hidden");
    }
    if($info) {
        $info.classList.remove("is-hidden");
    }
    if($back) {
        $back.classList.remove("is-hidden");
    }
}

/************************************************************
 *  Build the read-only topic-info panel from a topic desc: the
 *  topic name, its pkey, and a table of columns (name / type /
 *  key relationship). Everything is guarded — a malformed desc
 *  renders a shorter panel, never throws.
 ************************************************************/
function build_topic_info_panel(gobj, $info, topic, desc)
{
    while($info.firstChild) {
        $info.removeChild($info.firstChild);
    }

    let pkey = desc.pkey || "";

    /*  Topic metadata (version matters to the operator): version /
     *  system / pkey / tkey. Each row is shown only when its value is
     *  present; the version is emphasised as a tag. */
    let fmt_flag = (v) => {
        if(is_array(v)) {
            return v.join(", ");
        }
        if(is_object(v)) {
            return Object.keys(v).join(", ");
        }
        return (v === undefined || v === null) ? "" : String(v);
    };
    let $meta = [];
    let push_meta = (key, value, highlight) => {
        if(value === undefined || value === null || value === "") {
            return;
        }
        let $val = highlight
            ? ["span", {class: "tag is-info"}, `${value}`]
            : ["code", {}, `${value}`];
        $meta.push(
            ["tr", {}, [
                ["th", {i18n: key, style: "width:11rem;"}, key],
                ["td", {}, [$val]]
            ]]
        );
    };
    push_meta("version", desc.topic_version, true);
    push_meta("system", fmt_flag(desc.system_flag));
    push_meta("pkey", pkey);
    push_meta("tkey", desc.tkey);

    let $rows = [];
    let cols = is_array(desc.cols) ? desc.cols : [];
    for(let col of cols) {
        if(!col || !col.id || col.id.charAt(0) === "_") {
            continue;
        }
        let type = col.type || (is_array(col.flag) ? col.flag.join(", ") : (col.flag || ""));
        let rel = "";
        if(col.id === pkey) {
            rel = "pkey";
        } else if(is_object(col.fkey)) {
            rel = "→ " + Object.keys(col.fkey).join(", ");
        } else if(is_object(col.hook)) {
            rel = "hook → " + Object.keys(col.hook).join(", ");
        }
        $rows.push(
            ["tr", {}, [
                ["td", {}, [["code", {}, `${col.id}`]]],
                ["td", {}, `${type}`],
                ["td", {}, `${rel}`]
            ]]
        );
    }

    let $panel = createElement2(
        ["div", {class: "TREEDB_TOPIC_INFO_CARD content"}, [
            ["h3", {class: "TREEDB_TOPIC_INFO_TITLE title is-5"}, [
                ["span", {class: "icon-text"}, [
                    ["span", {class: "icon"}, [["i", {class: "yi-circle-info"}]]],
                    ["span", {i18n: `${topic}`}, `${topic}`]
                ]]
            ]],
            ["table", {class: "table is-narrow TREEDB_TOPIC_INFO_META mb-4"}, [
                ["tbody", {}, $meta]
            ]],
            ["h4", {class: "title is-6 mb-2", i18n: "columns"}, "columns"],
            ["table", {class: "table is-fullwidth is-striped is-narrow"}, [
                ["thead", {}, [
                    ["tr", {}, [
                        ["th", {i18n: "column"}, "column"],
                        ["th", {i18n: "type"}, "type"],
                        ["th", {i18n: "key"}, "key"]
                    ]]
                ]],
                ["tbody", {}, $rows]
            ]]
        ]]
    );
    $info.appendChild($panel);
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
        add_topic_card(gobj, id, key, "yi-table");

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
    if(gobj_read_bool_attr(gobj, "with_cards_landing")) {
        /*  Cards-landing: the grid IS the entry point, so DON'T auto-restore
         *  the persisted topic — only honour an explicit deep-link (a host
         *  EV_SHOW / EV_SHOW_TOPIC_INFO carrying a topic arrived while descs
         *  were loading). No topic in flight ⇒ land on the grid. */
        if(gobj.priv._pending_info) {
            let ti = gobj.priv._pending_info;
            gobj.priv._pending_info = null;
            show_topic_info(gobj, ti);
        } else if(href && href.indexOf("?") >= 0) {
            gobj_send_event(gobj, "EV_SHOW", {href: href}, gobj);
        } else {
            show_topics_landing(gobj);
        }
    } else {
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
    }

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

    /*  Declare our view-owned sub-routes to the site map now the schema
     *  is known (ROUTING.md contributor). */
    register_sub_routes(gobj);
}

/************************************************************
 *  Declare this view's deep, view-owned sub-routes to the site map:
 *  the schema landing, and per-topic table + info. Route-agnostic
 *  except for the host-supplied `base_route`. Cleared on stop.
 ************************************************************/
function register_sub_routes(gobj)
{
    let shell = yui_shell_of(gobj);
    let base = gobj_read_str_attr(gobj, "base_route");
    if(!shell || empty_string(base)) {
        return;
    }
    let system = gobj_read_bool_attr(gobj, "system");
    let descs = gobj_read_attr(gobj, "descs");
    let nodes = [];
    if(is_object(gobj_read_attr(gobj, "landing_routes"))) {
        nodes.push({route: base + "/schema", label: "schema",
                    icon: "yi-hexagon-nodes", gclass: "C_YUI_TREEDB_SCHEMA"});
    }
    if(is_object(descs)) {
        for(let topic of Object.keys(descs)) {
            if(!system && topic.substring(0, 2) === "__") {
                continue;
            }
            nodes.push({
                route:    base + "/" + topic,
                label:    topic,
                icon:     "yi-table",
                gclass:   GCLASS_NAME,
                children: [
                    {route: base + "/" + topic + "/info", label: "info",
                     icon: "yi-circle-info", gclass: GCLASS_NAME}
                ]
            });
        }
    }
    yui_shell_set_sub_routes(shell, base, nodes);
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
 *  JSON viewer (a single C_YUI_JSON in a window/modal): print-tranger of the
 *  whole service (lazy drill). CHILD model: the viewer publishes
 *  EV_EXPAND_PATH to us.
 ************************************************************/
function open_json_viewer(gobj)
{
    let priv = gobj.priv;

    /*  Already open: just re-fetch.  */
    if(priv.json_win || priv.json_modal) {
        request_print_tranger(gobj, "");
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

    request_print_tranger(gobj, "");
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
     *  The JSON viewer's feed: `print-tranger` (whole tranger, lazy drill by
     *  echoed `path`). Handled before the generic error path, which returns
     *  early.
     */
    if(command === "print-tranger") {
        let jv = gobj.priv.json_gobj;
        if(!jv || !is_gobj(jv) || gobj_is_destroying(jv)) {
            return 0;   /*  viewer closed before its answer landed: benign  */
        }
        let path = kw_get_str(gobj, kw_command, "path", "", 0);
        if(result < 0) {
            if(path) {
                gobj_send_event(jv, "EV_SUBTREE_ERROR",
                    {path: path, error: comment || "print-tranger failed"}, gobj);
            } else {
                yui_shell_show_error(yui_shell_of(gobj),
                    comment || "print-tranger failed", {t: t});
            }
            return 0;
        }
        if(path) {
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

    /*  Cards-landing: a show without a concrete `?<topic>` means "enter the
     *  workspace" — land on the grid instead of auto-opening the first tab.
     *  The bare tab route is always the CARDS sub-view (schema has its own
     *  `.../schema` route), so reset it here — this is what makes Back from
     *  the schema landing return to the cards. */
    if(gobj_read_bool_attr(gobj, "with_cards_landing") &&
            (!href || href.indexOf("?") < 0)) {
        gobj.priv._landing_view = "cards";
        show_topics_landing(gobj);
        refresh_toolbar_buttons(gobj);
        return 0;
    }

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
        /*  A concrete topic is open: leave the cards grid for the detail
         *  (tabs bar + table + back button). No-op in tabs-only mode. */
        show_topic_detail(gobj);
    }

    refresh_toolbar_buttons(gobj);  /*  the new tab may or may not be a tree  */
    return 0;
}

/************************************************************
 *  Show the routed topic-info panel (card info icon / .../<topic>/info).
 ************************************************************/
function ac_show_topic_info(gobj, event, kw, src)
{
    show_topic_info(gobj, kw && kw.topic);
    return 0;
}

/************************************************************
 *  Highlight the clicked topic card in the landing grid (single
 *  selection). Visual only — navigation, when the click was on an
 *  icon, is the anchor's own hash routing.
 ************************************************************/
function ac_select_topic_card(gobj, event, kw, src)
{
    let topic = kw && kw.topic;
    gobj.priv._selected_card_topic = topic || null;
    let $container = gobj_read_attr(gobj, "$container");
    if(!$container) {
        return 0;
    }
    $container.querySelectorAll(".TREEDB_TOPIC_CARD").forEach(function($c) {
        $c.classList.toggle("is-selected", $c.dataset.topic === topic);
    });
    return 0;
}

/************************************************************
 *  Toggle the landing between the cards grid and the schema graph.
 *  The landing is a POSITION, so this NAVIGATES (a real hash push via
 *  the host-supplied `landing_routes`) rather than mutating in-view
 *  state — the route change then drives the switch (EV_SET_LANDING_VIEW),
 *  so it is URL-addressable, F5-safe and Back-friendly (ROUTING.md §3).
 *  Falls back to an in-view flip only when no routes were supplied.
 ************************************************************/
function ac_toggle_landing_view(gobj, event, kw, src)
{
    let priv = gobj.priv;
    let target = (priv._landing_view === "schema") ? "cards" : "schema";
    let routes = gobj_read_attr(gobj, "landing_routes");
    let href = is_object(routes) ? routes[target] : null;
    if(href && typeof window !== "undefined") {
        window.location.hash = href;   /*  push; route drives the switch  */
        return 0;
    }
    /*  Legacy: no routes → flip in-view (not URL-addressable). */
    set_landing_view(gobj, target);
    return 0;
}

/************************************************************
 *  Set the landing sub-view ("cards" | "schema") and render it.
 *  Driven by the route (EV_SET_LANDING_VIEW) or the legacy toggle.
 ************************************************************/
function set_landing_view(gobj, view)
{
    gobj.priv._landing_view = (view === "schema") ? "schema" : "cards";
    show_topics_landing(gobj);   /*  syncs the toggle + shows the pane  */
}

/************************************************************
 *  Route → landing sub-view (.../db/<sel>/schema or bare tab).
 ************************************************************/
function ac_set_landing_view(gobj, event, kw, src)
{
    set_landing_view(gobj, kw && kw.view);
    return 0;
}

/************************************************************
 *  Back from a topic to the cards-landing grid (the section index).
 ************************************************************/
function ac_back_to_topics(gobj, event, kw, src)
{
    show_topics_landing(gobj);
    /*  Tell the host the topic segment is gone so a reload re-lands on the
     *  grid (empty topic ⇒ the host drops the <topic> from the URL). */
    gobj_publish_event(gobj, "EV_TOPIC_SELECTED", {topic: ""});
    return 0;
}

/************************************************************
 *  The host (C_TREEDB_VIEW) forwards the backend transport edges here so the
 *  toolbar can disable the JSON viewers the moment the session drops (and
 *  re-enable them on reconnect) — the library view must not subscribe to the
 *  C_IEVENT_CLI itself (that forwards the subscription upstream and breaks
 *  the session).
 ************************************************************/
function ac_transport_state(gobj, event, kw, src)
{
    refresh_toolbar_buttons(gobj, !!(kw && kw.connected));
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
    open_json_viewer(gobj);
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
            ["EV_EXPAND_PATH",          ac_json_expand_path,        null],
            ["EV_JSON_CLOSED",          ac_json_closed,             null],
            ["EV_SHOW",                 ac_show,                    null],
            ["EV_SHOW_TOPIC_INFO",      ac_show_topic_info,         null],
            ["EV_SELECT_TOPIC_CARD",    ac_select_topic_card,       null],
            ["EV_TOGGLE_LANDING_VIEW",  ac_toggle_landing_view,     null],
            ["EV_SET_LANDING_VIEW",     ac_set_landing_view,        null],
            ["EV_HIDE",                 ac_hide,                    null],
            ["EV_BACK_TO_TOPICS",       ac_back_to_topics,          null],
            ["EV_TRANSPORT_STATE",      ac_transport_state,         null],
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
        ["EV_EXPAND_PATH",          0],
        ["EV_JSON_CLOSED",          0],
        ["EV_SHOW",                 0],
        ["EV_SHOW_TOPIC_INFO",      0],
        ["EV_SELECT_TOPIC_CARD",    0],
        ["EV_TOGGLE_LANDING_VIEW",  0],
        ["EV_SET_LANDING_VIEW",     0],
        ["EV_HIDE",                 0],
        ["EV_BACK_TO_TOPICS",       0],
        ["EV_TRANSPORT_STATE",      0],
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
