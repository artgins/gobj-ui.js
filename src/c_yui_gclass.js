/***********************************************************************
 *          c_yui_gclass.js
 *
 *  What a GClass IS, in zones.
 *
 *  The framework answers `view-gclass` with a full description --
 *  attributes, commands, methods, trace levels and the FSM -- and until
 *  now the only thing that drew it was a JSON tree. Correct, and
 *  unreadable: the one question a reader arrives with ("what does this
 *  gclass DO in the state it is in?") took four expansions to reach.
 *
 *  This viewer lays the same document out by zones, and reads BOTH
 *  dialects of it (the C kernel's and the browser registry's) through
 *  `gclass_view_model.js`, which is where every difference between them
 *  is resolved.
 *
 *  THE MACHINE IS A MATRIX, rows = events and columns = states -- the
 *  shape the FSM is declared in, and the one that survives a gclass
 *  with 12 events and 3 states as well as one with 86 commands and one
 *  state. Two things it says that a JSON dump cannot:
 *
 *      - an EMPTY CELL is information. An event with no action in the
 *        current state is not ignored in Yuneta, it is refused with
 *        "Event NOT DEFINED in state", so the empty cells are the map
 *        of what breaks. They are hatched, never left blank.
 *      - a state nothing declares a way INTO is marked. An action may
 *        jump with `gobj_change_state()` (C_IEVENT_CLI reaches
 *        ST_SESSION that way), and no description can see inside an
 *        action -- so the viewer flags the state instead of drawing
 *        the working half of a gclass as unreachable.
 *
 *  TWO VIEWS over the same document, on the `view_mode` attr:
 *
 *      zones   the layout above.
 *      raw     the description verbatim. It is the authoritative
 *              answer of the backend and is never thrown away.
 *
 *  Container-agnostic, like C_YUI_JSON: the gclass owns the chrome and
 *  the host mounts `$container` wherever it wants (a C_YUI_WINDOW body
 *  on desktop, a dialog on a phone). `yui_gclass_view.js` does both.
 *
 *  DOM is self-describing (UPPER_SNAKE logical classes): GCLASS_VIEWER /
 *  GCLASS_TOOLBAR / GCLASS_SEARCH / GCLASS_VIEW_SWITCH / GCLASS_ZONES /
 *  GCLASS_HEAD / GCLASS_ZONE / GCLASS_ZONE_TITLE / GCLASS_ZONE_BODY /
 *  GCLASS_TABLE / GCLASS_MATRIX / GCLASS_CELL / GCLASS_PUBLISHED /
 *  GCLASS_RAW.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {
    SDATA,
    SDATA_END,
    data_type_t,
    gclass_create,
    gclass_find_by_name,
    log_error,
    gobj_read_pointer_attr,
    gobj_parent,
    gobj_subscribe_event,
    gobj_read_attr,
    gobj_write_attr,
    gobj_read_str_attr,
    gobj_send_event,
    gobj_create_pure_child,
    gobj_start,
    gobj_stop,
    gobj_destroy,
    gobj_is_running,
    gobj_short_name,
    gobj_name,
    clean_name,
    createElement2,
    json_deep_copy,
    refresh_language,
} from "@yuneta/gobj-js";

import {gclass_view_model} from "./gclass_view_model.js";
import {register_c_yui_fsm_graph} from "./c_yui_fsm_graph.js";
import {json_text_dump} from "./json_view_helpers.js";
import {yui_toolbar} from "./yui_toolbar.js";
import {attach_clear} from "./yui_inputs.js";
import {yui_copy_json, yui_button_mark_done} from "./yui_clipboard.js";

import {t} from "i18next";

import "./c_yui_gclass.css";


/***************************************************************
 *              Constants
 ***************************************************************/
const GCLASS_NAME = "C_YUI_GCLASS";

/*
 *  The two views, in switch order.
 */
const VIEWS = [
    {mode: "zones", icon: "yi-table",       key: "zones view"},
    {mode: "raw",   icon: "yi-code",        key: "raw view"},
];

/*
 *  The two ways to read the machine, in switch order.
 *
 *  The matrix leads and stays the default: it is the shape the FSM is
 *  DECLARED in, it reads every gclass the same way, and it is the only
 *  one of the two that can show what is MISSING. The graph answers a
 *  different question -- where does this machine go -- and earns its
 *  place exactly where the matrix is worst: many states, few events
 *  each.
 */
const MACHINE_VIEWS = [
    {mode: "matrix", icon: "yi-table",          key: "matrix view"},
    {mode: "graph",  icon: "yi-hexagon-nodes",  key: "graph view"},
];

/*
 *  Hard cap on the characters the raw view prints. The same guard the
 *  JSON viewer applies one layer down, and announced rather than
 *  applied silently.
 */
const MAX_RAW_CHARS = 2000000;

/*
 *  The zones, in the order they are laid out. `col` is which of the two
 *  columns a zone belongs to on a wide container -- the machine has one
 *  to itself because it is the only zone that grows sideways.
 */
const ZONES = [
    {id: "attrs",    key: "attributes",       col: "left"},
    {id: "commands", key: "commands",         col: "left"},
    {id: "methods",  key: "methods",          col: "left"},
    {id: "traces",   key: "trace levels",     col: "left"},
    {id: "machine",  key: "machine",          col: "right"},
];

/***************************************************************
 *              Data
 ***************************************************************/
const attrs_table = [
/*---------------- Public Attributes ----------------*/
SDATA(data_type_t.DTP_POINTER,  "subscriber",   0,  null,   "Subscriber of output events"),

/*---------------- Config ----------------*/
SDATA(data_type_t.DTP_JSON,     "description",  0,  null,   "The gclass description, as `view-gclass` answers it or `describe_local_gclass()` builds it"),
SDATA(data_type_t.DTP_STRING,   "gclass_name",  0,  "",     "Name to head the view with when the description carries none"),
SDATA(data_type_t.DTP_STRING,   "current_state",0,  "",     "State of the INSTANCE the host is showing, lit in the machine. Empty when the host is not showing one"),
SDATA(data_type_t.DTP_STRING,   "view_mode",    0,  "zones","View: 'zones' or 'raw'"),

/*---------------- UI ----------------*/
SDATA(data_type_t.DTP_POINTER,  "$container",   0,  null,   "HTMLElement root, mounted by the parent"),
SDATA_END()
];

let PRIVATE_DATA = {
    model:      null,   // the view model built from the description
    search:     "",     // current filter term (lower-cased)
    collapsed:  null,   // Set<string> of collapsed zone ids
    machine_view: "matrix", // how the machine zone is read
    graph_gobj: null,   // hosted C_YUI_FSM_GRAPH child (built on first use)
    $zones:     null,   // the scrollable zones body
    $raw:       null,   // the scrollable raw body
    $raw_body:  null,   // the <pre> inside it
    $search:    null,   // the search input
    $mode_btns: null,   // Map<mode, HTMLElement> of the view switch
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

    priv.collapsed = new Set();
    priv.search = "";
    priv.machine_view = "matrix";
    priv.model = gclass_view_model(gobj_read_attr(gobj, "description"));

    build_ui(gobj);
    apply_view_mode(gobj);

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
    render_view(gobj);
}

/***************************************************************
 *          Framework Method: Stop
 ***************************************************************/
function mt_stop(gobj)
{
    /*
     *  The graph child dies with this gobj's RUNNING state, not with
     *  its destruction: gobj_destroy() destroys the children BEFORE
     *  calling mt_destroy(), so tearing it down there arrives after
     *  the framework already destroyed it -- while it was running.
     */
    teardown_graph_child(gobj);
}

/***************************************************************
 *          Framework Method: Destroy
 ***************************************************************/
function mt_destroy(gobj)
{
    destroy_ui(gobj);
}




                    /***************************
                     *      Local Methods
                     ***************************/




/************************************************************
 *   Build UI
 ************************************************************/
function build_ui(gobj)
{
    let priv = gobj.priv;

    let $toolbar = make_toolbar(gobj);

    let $container = createElement2(
        ['div', {class: 'C_YUI_GCLASS GCLASS_VIEWER view-card',
                 style: 'height:100%; display:flex; flex-direction:column;'}, [
            ['div', {class: 'GCLASS_TOOLBAR is-flex-grow-0'}, [$toolbar]],
            ['div', {class: 'GCLASS_ZONES is-flex-grow-1',
                     style: 'flex:1 1 auto; min-height:0; overflow:auto;'}, []],
            ['div', {class: 'GCLASS_RAW is-flex-grow-1 is-hidden',
                     style: 'flex:1 1 auto; min-height:0; overflow:auto;'}, []]
        ]]
    );

    gobj_write_attr(gobj, "$container", $container);
    priv.$zones = $container.querySelector('.GCLASS_ZONES');
    priv.$raw = $container.querySelector('.GCLASS_RAW');
    priv.$search = $container.querySelector('.GCLASS_SEARCH');
    priv.$mode_btns = new Map();
    VIEWS.forEach(function(v) {
        let $btn = $container.querySelector('.GCLASS_VIEW_MODE_' + v.mode.toUpperCase());
        if($btn) {
            priv.$mode_btns.set(v.mode, $btn);
        }
    });

    refresh_language($container, t);
}

/************************************************************
 *   Destroy UI
 ************************************************************/
function destroy_ui(gobj)
{
    let priv = gobj.priv;
    let $container = gobj_read_attr(gobj, "$container");
    if($container) {
        if($container.parentNode) {
            $container.parentNode.removeChild($container);
        }
        gobj_write_attr(gobj, "$container", null);
    }
    priv.$zones = null;
    priv.$raw = null;
    priv.$raw_body = null;
    priv.$search = null;
    priv.$mode_btns = null;
}

/************************************************************
 *   Toolbar: a filter, the view switch and copy.
 ************************************************************/
function make_toolbar(gobj)
{
    let $search_input = createElement2(
        ['input', {class: 'GCLASS_SEARCH input', type: 'text',
                   placeholder: t("search")}, [], {
            input: function(evt) {
                gobj_send_event(gobj, "EV_SEARCH", {text: evt.target.value}, gobj);
            }
        }]);
    let $search_control = createElement2(
        ['div', {class: 'control has-icons-left GCLASS_SEARCH_CONTROL',
                 style: 'max-width:22em;'}, [
            $search_input,
            ['span', {class: 'icon is-left'}, [['i', {class: 'yi-magnifying-glass'}]]]
        ]]);
    attach_clear($search_control, $search_input);

    let right_items = [
        view_mode_switch(gobj),
        icon_button(gobj, "yi-copy", "EV_COPY_ALL", "copy json"),
    ];

    const $toolbar = yui_toolbar({}, [
        ['div', {class: 'yui-horizontal-toolbar-section left is-flex is-align-items-center',
                 style: 'gap:.25rem;'}, [$search_control]],
        ['div', {class: 'yui-horizontal-toolbar-section center'}, []],
        ['div', {class: 'yui-horizontal-toolbar-section right is-flex is-align-items-center',
                 style: 'gap:.25rem;'}, right_items],
    ]);

    refresh_language($toolbar, t);
    return $toolbar;
}

/************************************************************
 *   A single icon toolbar button that fires `event_name`
 ************************************************************/
function icon_button(gobj, icon, event_name, label_key)
{
    return ['button', {class: `button ${event_name}`, style: 'width:2.5em;',
                       title: t(label_key), 'data-i18n-title': label_key,
                       'aria-label': t(label_key), 'data-i18n-aria-label': label_key}, [
        ['span', {class: 'icon'}, [['i', {class: icon}]]]
    ], {
        click: function(evt) {
            evt.stopPropagation();
            gobj_send_event(gobj, event_name, {}, gobj);
        }
    }];
}

/************************************************************
 *   The view switch: one button per view, the current one
 *   marked. Two buttons and not a toggle, for the same reason
 *   the JSON viewer gives three: a control has to say where it
 *   goes, not that it will change something.
 ************************************************************/
function view_mode_switch(gobj)
{
    let buttons = VIEWS.map(function(v) {
        return ['button', {class: `button GCLASS_VIEW_MODE GCLASS_VIEW_MODE_${v.mode.toUpperCase()}`,
                           type: 'button', style: 'width:2.5em;',
                           title: t(v.key), 'data-i18n-title': v.key,
                           'aria-label': t(v.key), 'data-i18n-aria-label': v.key}, [
            ['span', {class: 'icon'}, [['i', {class: v.icon}]]]
        ], {
            click: function(evt) {
                evt.stopPropagation();
                gobj_send_event(gobj, "EV_SET_VIEW_MODE", {mode: v.mode}, gobj);
            }
        }];
    });

    return ['div', {class: 'buttons has-addons is-flex-wrap-nowrap mb-0 GCLASS_VIEW_SWITCH'},
            buttons];
}

/************************************************************
 *   The current view, normalised. Anything unknown is zones.
 ************************************************************/
function current_view_mode(gobj)
{
    let mode = gobj_read_str_attr(gobj, "view_mode");
    return VIEWS.some((v) => v.mode === mode)? mode: "zones";
}

/************************************************************
 *   Show the chrome of the current view and hide the other's.
 ************************************************************/
function apply_view_mode(gobj)
{
    let priv = gobj.priv;
    let mode = current_view_mode(gobj);

    let bodies = {zones: priv.$zones, raw: priv.$raw};
    for(let [m, $el] of Object.entries(bodies)) {
        if($el) {
            $el.classList.toggle('is-hidden', m !== mode);
        }
    }

    if(priv.$mode_btns) {
        for(let [m, $btn] of priv.$mode_btns) {
            $btn.classList.toggle('is-active', m === mode);
            $btn.setAttribute("aria-pressed", (m === mode)? "true": "false");
        }
    }
}

/************************************************************
 *   Render whichever view is current.
 ************************************************************/
function render_view(gobj)
{
    if(current_view_mode(gobj) === "raw") {
        render_raw(gobj);
    } else {
        render_zones(gobj);
    }
}

/************************************************************
 *   The raw view: the description verbatim, indented four.
 ************************************************************/
function render_raw(gobj)
{
    let priv = gobj.priv;
    let $raw = priv.$raw;
    if(!$raw) {
        return;
    }

    $raw.textContent = "";
    priv.$raw_body = null;

    let description = gobj_read_attr(gobj, "description");
    if(description === null || description === undefined) {
        $raw.appendChild(createElement2(
            ['div', {class: 'GCLASS_EMPTY p-4 has-text-grey',
                     i18n: 'no data'}, t("no data")]));
        return;
    }

    let dump = json_text_dump(description, MAX_RAW_CHARS);
    let children = [
        ['pre', {class: 'GCLASS_RAW_BODY'}, dump.text]
    ];
    if(dump.capped) {
        children.push(
            ['div', {class: 'GCLASS_RAW_CAPPED has-text-grey is-size-7 p-2',
                     i18n: 'text truncated'}, t("text truncated")]);
    }
    if(dump.error) {
        children.push(
            ['div', {class: 'GCLASS_RAW_ERROR has-text-danger is-size-7 p-2'},
             dump.error]);
    }

    let $body = createElement2(['div', {class: 'GCLASS_RAW_WRAP'}, children]);
    $raw.appendChild($body);
    priv.$raw_body = $body.querySelector('.GCLASS_RAW_BODY');
    refresh_language($raw, t);
}

/************************************************************
 *   The zones view.
 ************************************************************/
function render_zones(gobj)
{
    let priv = gobj.priv;
    let $zones = priv.$zones;
    if(!$zones) {
        return;
    }

    /*  The subtree it lives in is about to be thrown away.  */
    teardown_graph_child(gobj);

    $zones.textContent = "";

    let model = priv.model;
    if(!model) {
        $zones.appendChild(createElement2(
            ['div', {class: 'GCLASS_EMPTY p-4 has-text-grey',
                     i18n: 'no data'}, t("no data")]));
        return;
    }

    /*
     *  The machine takes the WHOLE width in graph mode.
     *
     *  Half a column is enough for a matrix, which grows downwards and
     *  scrolls sideways inside its own box. A graph does not: it is
     *  laid out left to right, and 600px of a 1200px viewer is where
     *  six states stop fitting and start being panned. The rest of the
     *  zones then stack in one column under it, which is what they do
     *  on a phone anyway.
     */
    let graph_mode = (priv.machine_view === "graph");
    let left = [];
    let right = [];
    let full = [];

    for(let zone of ZONES) {
        let $zone = build_zone(gobj, zone);
        if(!$zone) {
            continue;
        }
        if(zone.col === "right") {
            if(graph_mode) {
                full.push($zone);
            } else {
                right.push($zone);
            }
        } else {
            left.push($zone);
        }
    }

    let $root = createElement2(
        ['div', {class: 'GCLASS_BODY'}, [
            build_head(gobj, model),
            ['div', {class: 'GCLASS_FULL' + (graph_mode? '': ' is-hidden')}, full],
            ['div', {class: 'GCLASS_COLS' + (graph_mode? ' is-stacked': '')}, [
                ['div', {class: 'GCLASS_COL GCLASS_COL_LEFT'}, left],
                ['div', {class: 'GCLASS_COL GCLASS_COL_RIGHT' +
                                (graph_mode? ' is-hidden': '')}, right]
            ]]
        ]]
    );

    $zones.appendChild($root);
    refresh_language($zones, t);
    apply_search(gobj);
    reveal_current_state(gobj);

    if(priv.machine_view === "graph" && !priv.collapsed.has("machine")) {
        build_graph_child(gobj);
    }
}

/************************************************************
 *   The header: what this gclass is called, and the two
 *   numbers a reader asks for before anything else.
 ************************************************************/
function build_head(gobj, model)
{
    let items = [
        ['span', {class: 'GCLASS_NAME'},
         model.id || gobj_read_str_attr(gobj, "gclass_name") || "?"]
    ];

    if(model.instances !== null) {
        items.push(
            ['span', {class: 'GCLASS_INSTANCES tag'}, [
                ['span', {class: 'GCLASS_INSTANCES_N'}, String(model.instances)],
                ['span', {class: 'GCLASS_INSTANCES_LABEL', i18n: 'instances'},
                 t("instances")]
            ]]);
    }

    for(let flag of model.gcflag) {
        items.push(['span', {class: 'GCLASS_CHIP GCLASS_GCFLAG'}, flag]);
    }

    let current = gobj_read_str_attr(gobj, "current_state");
    if(current) {
        items.push(
            ['span', {class: 'GCLASS_CHIP GCLASS_CURRENT',
                      title: t("current state"),
                      'data-i18n-title': 'current state'}, current]);
    }

    return ['div', {class: 'GCLASS_HEAD'}, items];
}

/************************************************************
 *   One zone: a heading that folds it, and its body.
 *
 *   Every zone is drawn, empty ones included: "this gclass
 *   declares no commands" is an answer, and a zone that
 *   disappears makes the reader wonder whether the viewer
 *   simply failed to draw it.
 ************************************************************/
function build_zone(gobj, zone)
{
    let priv = gobj.priv;
    let model = priv.model;

    let body = null;
    let count = 0;

    switch(zone.id) {
        case "attrs":
            count = model.attrs.length;
            body = build_attrs(model.attrs);
            break;
        case "commands":
            count = model.commands.filter((c) => c.kind === "command").length;
            body = build_commands(model.commands);
            break;
        case "methods":
            count = model.methods.length + model.internal_methods.length;
            body = build_methods(model);
            break;
        case "traces":
            count = model.trace_levels.length;
            body = build_traces(model.trace_levels);
            break;
        case "machine":
            /*  Two numbers, because one of them alone says nothing
             *  about the shape: 13 events across 1 state and 13
             *  across 6 are different machines.  */
            count = model.fsm.states.length? 
                `${model.fsm.states.length} · ${model.fsm.rows.length}`:
                model.fsm.rows.length;
            body = build_machine(gobj, model.fsm);
            break;
        default:
            log_error(`${GCLASS_NAME}: unknown zone '${zone.id}'`);
            return null;
    }

    let collapsed = priv.collapsed.has(zone.id);

    let $toggle = createElement2(
        ['button', {class: 'GCLASS_ZONE_TOGGLE', type: 'button',
                    'aria-expanded': collapsed? 'false': 'true'}, [
            ['span', {class: 'icon GCLASS_ZONE_ARROW'}, [
                ['i', {class: collapsed? 'yi-chevron-right': 'yi-chevron-down'}]
            ]],
            ['span', {class: 'GCLASS_ZONE_TITLE', i18n: zone.key}, t(zone.key)],
            ['span', {class: 'GCLASS_ZONE_COUNT'}, String(count)]
        ], {
            click: function(evt) {
                evt.stopPropagation();
                gobj_send_event(gobj, "EV_TOGGLE_ZONE", {zone: zone.id}, gobj);
            }
        }]);

    return createElement2(
        ['section', {class: `GCLASS_ZONE GCLASS_ZONE_${zone.id.toUpperCase()}` +
                            (collapsed? ' is-collapsed': ''),
                     'data-zone': zone.id}, [
            $toggle,
            ['div', {class: 'GCLASS_ZONE_BODY' + (collapsed? ' is-hidden': '')},
             [body]]
        ]]);
}

/************************************************************
 *   An "empty zone" line. It says WHY it is empty, which is
 *   never the same as saying nothing.
 ************************************************************/
function empty_line(key)
{
    return ['div', {class: 'GCLASS_ZONE_EMPTY', i18n: key}, t(key)];
}

/************************************************************
 *   A table in its own horizontal scroller.
 *
 *   EVERY table, not just the matrix. An attrs table with a
 *   long description is as wide as a matrix with eight states,
 *   and on a phone the one that overflows takes the whole
 *   viewer sideways with it -- the page ends up scrolling, and
 *   the toolbar leaves the screen.
 ************************************************************/
function scroller(table)
{
    return ['div', {class: 'GCLASS_SCROLL'}, [table]];
}

/************************************************************
 *   A row's haystack: what the filter matches against. Built
 *   once, at render, and kept on the element -- filtering a
 *   table by reading its cells back out is how a filter starts
 *   matching the words of the CHROME.
 ************************************************************/
function row_attrs(haystack, extra)
{
    let attrs = {class: 'GCLASS_ROW', 'data-find': String(haystack).toLowerCase()};
    return Object.assign(attrs, extra || {});
}

/************************************************************
 *   Flags, as chips. A flag that changes what a reader may DO
 *   with the attr gets its own class; the rest are quiet.
 ************************************************************/
function flag_chips(flags)
{
    return flags.map(function(flag) {
        let cls = 'GCLASS_CHIP GCLASS_FLAG';
        if(flag.indexOf("PERSIST") >= 0) {
            cls += ' is-persist';
        } else if(flag.indexOf("WR") >= 0) {
            cls += ' is-writable';
        } else if(flag.indexOf("AUTHZ") >= 0) {
            cls += ' is-authz';
        } else if(flag.indexOf("REQUIRED") >= 0) {
            cls += ' is-required';
        }
        return ['span', {class: cls}, flag];
    });
}

/************************************************************
 *   The attrs zone.
 ************************************************************/
function build_attrs(attrs)
{
    if(!attrs.length) {
        return empty_line("no attributes declared");
    }

    let rows = attrs.map(function(a) {
        return ['tr', row_attrs(`${a.id} ${a.type} ${a.flags.join(" ")} ${a.description}`), [
            ['td', {class: 'GCLASS_CELL_KEY'}, a.id],
            ['td', {class: 'GCLASS_CELL_TYPE'}, a.type],
            ['td', {class: 'GCLASS_CELL_FLAGS'}, flag_chips(a.flags)],
            ['td', {class: 'GCLASS_CELL_DEFAULT'}, a.default_value],
            ['td', {class: 'GCLASS_CELL_DESC'}, a.description]
        ]];
    });

    return scroller(['table', {class: 'GCLASS_TABLE GCLASS_TABLE_ATTRS'}, [
        ['thead', {}, [
            ['tr', {}, [
                ['th', {i18n: 'name'}, t("name")],
                ['th', {i18n: 'type'}, t("type")],
                ['th', {i18n: 'flags'}, t("flags")],
                ['th', {i18n: 'default'}, t("default")],
                ['th', {i18n: 'description'}, t("description")]
            ]]
        ]],
        ['tbody', {}, rows]
    ]]);
}

/************************************************************
 *   The commands zone.
 *
 *   A command's parameters ride under it as their own rows,
 *   indented: they are what the reader needs the moment they
 *   decide to run it, and a second click to reach them buys
 *   nothing on a list this short.
 ************************************************************/
function build_commands(commands)
{
    if(!commands.length) {
        return empty_line("no commands declared");
    }

    let rows = [];
    for(let c of commands) {
        if(c.kind === "section") {
            rows.push(['tr', row_attrs(c.label, {class: 'GCLASS_ROW GCLASS_CMD_SECTION'}), [
                ['td', {colspan: '2'}, c.label]
            ]]);
            continue;
        }

        let name_items = [['span', {class: 'GCLASS_CMD_NAME'}, c.id]];
        for(let alias of c.alias) {
            name_items.push(['span', {class: 'GCLASS_CHIP GCLASS_ALIAS'}, alias]);
        }
        name_items = name_items.concat(flag_chips(c.flags));

        rows.push(['tr', row_attrs(`${c.id} ${c.alias.join(" ")} ${c.description}`), [
            ['td', {class: 'GCLASS_CELL_KEY'}, name_items],
            ['td', {class: 'GCLASS_CELL_DESC'}, c.description]
        ]]);

        for(let p of c.parameters) {
            rows.push(['tr', row_attrs(`${c.id} ${p.id} ${p.description}`,
                                       {class: 'GCLASS_ROW GCLASS_CMD_PARAM'}), [
                ['td', {class: 'GCLASS_CELL_KEY'}, [
                    ['span', {class: 'GCLASS_PARAM_MARK'}, "↳"],
                    ['span', {class: 'GCLASS_PARAM_NAME'}, p.id],
                    ['span', {class: 'GCLASS_PARAM_TYPE'}, p.type]
                ].concat(flag_chips(p.flags))],
                ['td', {class: 'GCLASS_CELL_DESC'}, p.description]
            ]]);
        }
    }

    return scroller(['table', {class: 'GCLASS_TABLE GCLASS_TABLE_COMMANDS'}, [
        ['tbody', {}, rows]
    ]]);
}

/************************************************************
 *   The methods zone: the ones the gclass IMPLEMENTS.
 *
 *   A table of every possible method, mostly empty, tells the
 *   reader nothing -- so both sides send only what is wired,
 *   and this draws them as chips.
 ************************************************************/
function build_methods(model)
{
    if(!model.methods.length && !model.internal_methods.length) {
        return empty_line("no methods declared");
    }

    let blocks = [];
    if(model.methods.length) {
        blocks.push(['div', {class: 'GCLASS_CHIPS'},
            model.methods.map((m) =>
                ['span', row_attrs(m, {class: 'GCLASS_CHIP GCLASS_METHOD'}), m])]);
    }
    if(model.internal_methods.length) {
        blocks.push(['div', {class: 'GCLASS_SUBTITLE', i18n: 'internal methods'},
                     t("internal methods")]);
        blocks.push(['div', {class: 'GCLASS_CHIPS'},
            model.internal_methods.map((m) =>
                ['span', row_attrs(m, {class: 'GCLASS_CHIP GCLASS_METHOD'}), m])]);
    }

    return ['div', {class: 'GCLASS_METHODS'}, blocks];
}

/************************************************************
 *   The trace levels zone.
 ************************************************************/
function build_traces(levels)
{
    if(!levels.length) {
        return empty_line("no trace levels declared");
    }

    let rows = levels.map(function(l) {
        return ['tr', row_attrs(`${l.id} ${l.description}`), [
            ['td', {class: 'GCLASS_CELL_KEY'}, l.id],
            ['td', {class: 'GCLASS_CELL_DESC'}, l.description]
        ]];
    });

    return scroller(['table', {class: 'GCLASS_TABLE GCLASS_TABLE_TRACES'}, [
        ['tbody', {}, rows]
    ]]);
}

/************************************************************
 *   The machine: the matrix, then what it publishes.
 ************************************************************/
function build_machine(gobj, fsm)
{
    let priv = gobj.priv;

    if(!fsm.states.length) {
        return empty_line("no machine declared");
    }

    if(priv.machine_view === "graph") {
        /*  An empty mount: the child is created AFTER this subtree is
         *  in the document, because G6 sizes itself from its container
         *  and one that is still detached measures 0x0.  */
        return ['div', {class: 'GCLASS_MACHINE'}, [
            machine_view_switch(gobj),
            ['div', {class: 'GCLASS_GRAPH_MOUNT'}, []]
        ]];
    }

    let current = gobj_read_str_attr(gobj, "current_state");
    let unreachable = new Set(fsm.unreachable);

    let head_cells = [
        ['th', {class: 'GCLASS_MX_CORNER', i18n: 'event'}, t("event")]
    ];
    for(let state of fsm.states) {
        let cls = 'GCLASS_MX_STATE';
        let items = [['span', {class: 'GCLASS_MX_STATE_NAME'}, state.name]];

        if(state.name === current) {
            cls += ' is-current';
        }
        if(unreachable.has(state.name)) {
            cls += ' is-unreachable';
            items.push(['span', {class: 'GCLASS_MX_MARK',
                                 title: t("state with no declared entry"),
                                 'data-i18n-title': 'state with no declared entry',
                                 'aria-label': t("state with no declared entry"),
                                 'data-i18n-aria-label': 'state with no declared entry'},
                        "⚠"]);
        }
        head_cells.push(['th', {class: cls}, items]);
    }

    let body_rows = fsm.rows.map(function(row) {
        let cells = [
            ['td', {class: 'GCLASS_MX_EVENT'},
             [['span', {}, row.event]].concat(event_flag_chips(row.flags))]
        ];
        row.cells.forEach(function(cell, i) {
            let state = fsm.states[i];
            let is_current = (state && state.name === current);

            if(!cell) {
                cells.push(['td', {class: 'GCLASS_MX_CELL is-none' +
                                          (is_current? ' is-current': ''),
                                   title: t("not declared in this state"),
                                   'data-i18n-title': 'not declared in this state'},
                            "·"]);
                return;
            }

            let items = [];
            if(cell.action) {
                items.push(['span', {class: 'GCLASS_MX_ACTION'}, cell.action]);
            } else if(cell.has_action) {
                /*  The C side cannot name an action: `states2json()`
                 *  writes the literal "action" for all of them. A mark
                 *  is the honest drawing of "there is one".  */
                items.push(['span', {class: 'GCLASS_MX_ACTION is-unnamed',
                                     title: t("action"),
                                     'data-i18n-title': 'action'}, "●"]);
            } else {
                /*  Declared with NO action and no next state --
                 *  `{EV_TX_READY, 0, 0}`, four of them in C_WEBSOCKET.
                 *  It is not the same as an empty cell (which throws)
                 *  and it is not an action either: the event is legal
                 *  here and deliberately does nothing. Drawing it as a
                 *  mark claimed an action the gclass never declared.  */
                items.push(['span', {class: 'GCLASS_MX_ACTION is-none-action',
                                     title: t("accepted with no action"),
                                     'data-i18n-title': 'accepted with no action'},
                            "—"]);
            }
            if(cell.next_state) {
                items.push(['span', {class: 'GCLASS_MX_ARROW'}, "▸"]);
                items.push(['span', {class: 'GCLASS_MX_NEXT'}, cell.next_state]);
            }

            cells.push(['td', {class: 'GCLASS_MX_CELL' +
                                      (is_current? ' is-current': '')}, items]);
        });

        return ['tr', row_attrs(`${row.event} ${row.cells.map(
            (c) => c? `${c.action} ${c.next_state}`: "").join(" ")}`), cells];
    });

    let blocks = [
        machine_view_switch(gobj),
        scroller(['table', {class: 'GCLASS_TABLE GCLASS_MATRIX'}, [
            ['thead', {}, [['tr', {}, head_cells]]],
            ['tbody', {}, body_rows]
        ]])
    ];

    blocks.push(build_legend(fsm, current));

    if(fsm.published.length) {
        blocks.push(['div', {class: 'GCLASS_SUBTITLE', i18n: 'publishes'},
                     t("publishes")]);
        blocks.push(['div', {class: 'GCLASS_CHIPS GCLASS_PUBLISHED'},
            fsm.published.map(function(p) {
                return ['span', row_attrs(p.event, {class: 'GCLASS_PUB_ROW'}), [
                    ['span', {class: 'GCLASS_CHIP GCLASS_PUB_EVENT'}, p.event]
                ].concat(event_flag_chips(p.flags))];
            })]);
    }

    return ['div', {class: 'GCLASS_MACHINE'}, blocks];
}

/************************************************************
 *   Matrix or graph, for the machine zone alone.
 *
 *   It lives INSIDE the zone and not in the toolbar: it
 *   changes one zone, and a control that changes one thing
 *   belongs beside that thing. The zone heading cannot hold it
 *   either -- the heading is itself a button, and a button
 *   inside a button is not a control, it is a bug.
 ************************************************************/
function machine_view_switch(gobj)
{
    let priv = gobj.priv;

    let buttons = MACHINE_VIEWS.map(function(v) {
        let on = (priv.machine_view === v.mode);
        return ['button', {class: 'button is-small GCLASS_MACHINE_VIEW ' +
                                  `GCLASS_MACHINE_VIEW_${v.mode.toUpperCase()}` +
                                  (on? ' is-active': ''),
                           type: 'button',
                           'aria-pressed': on? 'true': 'false',
                           title: t(v.key), 'data-i18n-title': v.key,
                           'aria-label': t(v.key), 'data-i18n-aria-label': v.key}, [
            ['span', {class: 'icon'}, [['i', {class: v.icon}]]]
        ], {
            click: function(evt) {
                evt.stopPropagation();
                gobj_send_event(gobj, "EV_SET_MACHINE_VIEW",
                    {mode: v.mode}, gobj);
            }
        }];
    });

    return ['div', {class: 'GCLASS_MACHINE_SWITCH buttons has-addons mb-0'},
            buttons];
}

/************************************************************
 *   What the drawing means. Only the parts that are ON the
 *   screen: a legend for a mark nobody drew is noise.
 ************************************************************/
function build_legend(fsm, current)
{
    let items = [];

    items.push(['span', {class: 'GCLASS_LEGEND_ITEM'}, [
        ['i', {class: 'GCLASS_LEGEND_SWATCH is-none'}],
        ['span', {i18n: 'not declared in this state'}, t("not declared in this state")]
    ]]);

    /*  Only if there is one on screen: a legend for a mark nobody drew
     *  is noise, and most gclasses declare no actionless event.  */
    let has_actionless = fsm.rows.some(
        (row) => row.cells.some((cell) => cell && !cell.has_action)
    );
    if(has_actionless) {
        items.push(['span', {class: 'GCLASS_LEGEND_ITEM'}, [
            ['i', {class: 'GCLASS_LEGEND_SWATCH is-none-action'}, "—"],
            ['span', {i18n: 'accepted with no action'},
             t("accepted with no action")]
        ]]);
    }

    if(current && fsm.states.some((s) => s.name === current)) {
        items.push(['span', {class: 'GCLASS_LEGEND_ITEM'}, [
            ['i', {class: 'GCLASS_LEGEND_SWATCH is-current'}],
            ['span', {i18n: 'current state'}, t("current state")]
        ]]);
    }

    if(fsm.unreachable.length) {
        items.push(['span', {class: 'GCLASS_LEGEND_ITEM'}, [
            ['i', {class: 'GCLASS_LEGEND_SWATCH is-unreachable'}, "⚠"],
            ['span', {i18n: 'state with no declared entry'},
             t("state with no declared entry")]
        ]]);
    }

    return ['div', {class: 'GCLASS_LEGEND'}, items];
}

/************************************************************
 *   Event flags, as chips. Only the ones that say something
 *   about the event itself.
 ************************************************************/
function event_flag_chips(flags)
{
    return flags.filter((f) => f.indexOf("OUTPUT") >= 0 || f.indexOf("PUBLIC") >= 0)
        .map(function(flag) {
            let cls = 'GCLASS_CHIP GCLASS_EVFLAG';
            if(flag.indexOf("OUTPUT") >= 0) {
                cls += ' is-output';
            } else {
                cls += ' is-public';
            }
            return ['span', {class: cls}, flag.replace("EVF_", "")];
        });
}

/************************************************************
 *   Scroll the matrix so the lit column is on screen.
 *
 *   The reader opened this viewer from a gobj that is in one
 *   particular state, and a matrix wide enough to need a
 *   scroller starts at ITS left edge -- which is where that
 *   state usually is not. Only when it is off screen, and only
 *   as far as it takes: a matrix that jumped every render
 *   would fight the reader who scrolled it somewhere else.
 ************************************************************/
function reveal_current_state(gobj)
{
    let priv = gobj.priv;
    let $zones = priv.$zones;
    if(!$zones) {
        return;
    }

    let $th = $zones.querySelector('.GCLASS_MX_STATE.is-current');
    if(!$th || typeof $th.closest !== "function") {
        return;
    }
    let $scroll = $th.closest('.GCLASS_SCROLL');
    if(!$scroll) {
        return;
    }

    let cell = $th.getBoundingClientRect();
    let box = $scroll.getBoundingClientRect();
    if(cell.right > box.right) {
        $scroll.scrollLeft += (cell.right - box.right) + 12;
    } else if(cell.left < box.left) {
        $scroll.scrollLeft -= (box.left - cell.left) + 12;
    }
}

/************************************************************
 *   Build the hosted graph child on its mount.
 *
 *   Here, and never in build_machine: the mount has to be in
 *   the document before the child starts, and the child is
 *   started last for the same reason -- mt_start builds the
 *   G6 graph and measures the canvas.
 ************************************************************/
function build_graph_child(gobj)
{
    let priv = gobj.priv;
    let $zones = priv.$zones;

    if(!$zones) {
        return false;
    }

    let $mount = $zones.querySelector('.GCLASS_GRAPH_MOUNT');
    if(!$mount) {
        return false;   /*  the matrix is showing: nothing to mount  */
    }

    let graph = gobj_create_pure_child(
        "fsm_" + clean_name(gobj_name(gobj)),
        "C_YUI_FSM_GRAPH",
        {
            fsm:           priv.model? priv.model.fsm: null,
            current_state: gobj_read_str_attr(gobj, "current_state"),
        },
        gobj
    );
    if(!graph) {
        log_error(`${gobj_short_name(gobj)}: cannot create the machine graph`);
        return false;
    }

    let $box = gobj_read_attr(graph, "$container");
    if(!$box) {
        log_error(`${gobj_short_name(gobj)}: the machine graph built no $container`);
        gobj_destroy(graph);
        return false;
    }

    $mount.appendChild($box);
    priv.graph_gobj = graph;
    gobj_start(graph);
    return true;
}

/************************************************************
 *   Destroy the hosted graph child, if any.
 ************************************************************/
function teardown_graph_child(gobj)
{
    let priv = gobj.priv;

    if(priv.graph_gobj) {
        if(gobj_is_running(priv.graph_gobj)) {
            gobj_stop(priv.graph_gobj);
        }
        gobj_destroy(priv.graph_gobj);
        priv.graph_gobj = null;
    }
}

/************************************************************
 *   Apply the current filter to what is drawn.
 *
 *   Rows carry their own haystack (`data-find`), so this hides
 *   rows and never re-renders: a filter that rebuilt the view
 *   would lose the scroll position on every keystroke.
 ************************************************************/
function apply_search(gobj)
{
    let priv = gobj.priv;
    let $zones = priv.$zones;
    if(!$zones) {
        return;
    }

    let term = priv.search;

    $zones.querySelectorAll('.GCLASS_ZONE').forEach(function($zone) {
        let $rows = $zone.querySelectorAll('[data-find]');
        let visible = 0;

        $rows.forEach(function($row) {
            let hit = !term || $row.getAttribute('data-find').indexOf(term) >= 0;
            $row.classList.toggle('is-hidden', !hit);
            if(hit) {
                visible++;
            }
        });

        /*  A zone whose every row is filtered out reads as broken
         *  unless it says what happened.  */
        let $none = $zone.querySelector('.GCLASS_ZONE_NO_MATCH');
        let show_none = (term && $rows.length > 0 && visible === 0);
        if(show_none && !$none) {
            let $body = $zone.querySelector('.GCLASS_ZONE_BODY');
            if($body) {
                $body.appendChild(createElement2(
                    ['div', {class: 'GCLASS_ZONE_EMPTY GCLASS_ZONE_NO_MATCH',
                             i18n: 'no matches'}, t("no matches")]));
            }
        } else if(!show_none && $none) {
            $none.parentNode.removeChild($none);
        }
    });
}




                    /***************************
                     *      Actions
                     ***************************/




/************************************************************
 *   EV_SET_DESCRIPTION {description, current_state}
 ************************************************************/
function ac_set_description(gobj, event, kw, src)
{
    let priv = gobj.priv;
    let description = kw.description;

    if(description === undefined) {
        log_error(`${GCLASS_NAME}: EV_SET_DESCRIPTION without a description`);
        return -1;
    }

    gobj_write_attr(gobj, "description",
        (description === null)? null: json_deep_copy(description));
    if(typeof kw.current_state === "string") {
        gobj_write_attr(gobj, "current_state", kw.current_state);
    }

    priv.model = gclass_view_model(gobj_read_attr(gobj, "description"));
    render_view(gobj);
    return 0;
}

/************************************************************
 *   EV_SET_VIEW_MODE {mode}
 ************************************************************/
function ac_set_view_mode(gobj, event, kw, src)
{
    let mode = kw.mode;

    if(!VIEWS.some((v) => v.mode === mode)) {
        log_error(`${GCLASS_NAME}: unknown view_mode '${mode}'`);
        return -1;
    }
    if(mode === current_view_mode(gobj)) {
        return 0;
    }

    gobj_write_attr(gobj, "view_mode", mode);
    apply_view_mode(gobj);
    render_view(gobj);
    return 0;
}

/************************************************************
 *   EV_TOGGLE_ZONE {zone}
 ************************************************************/
function ac_toggle_zone(gobj, event, kw, src)
{
    let priv = gobj.priv;
    let zone = kw.zone;

    if(!ZONES.some((z) => z.id === zone)) {
        log_error(`${GCLASS_NAME}: unknown zone '${zone}'`);
        return -1;
    }

    let collapsed = !priv.collapsed.has(zone);
    if(collapsed) {
        priv.collapsed.add(zone);
    } else {
        priv.collapsed.delete(zone);
    }

    /*
     *  The DOM is folded in place, never re-rendered: a rebuild would
     *  throw away the hosted graph and its camera every time somebody
     *  folded an unrelated zone.
     */
    let $zone = priv.$zones?
        priv.$zones.querySelector(`.GCLASS_ZONE[data-zone="${zone}"]`): null;
    if(!$zone) {
        log_error(`${GCLASS_NAME}: zone '${zone}' is not drawn`);
        return -1;
    }

    $zone.classList.toggle('is-collapsed', collapsed);

    let $body = $zone.querySelector('.GCLASS_ZONE_BODY');
    if($body) {
        $body.classList.toggle('is-hidden', collapsed);
    }

    let $toggle = $zone.querySelector('.GCLASS_ZONE_TOGGLE');
    if($toggle) {
        $toggle.setAttribute("aria-expanded", collapsed? "false": "true");
    }

    let $arrow = $zone.querySelector('.GCLASS_ZONE_ARROW i');
    if($arrow) {
        $arrow.className = collapsed? 'yi-chevron-right': 'yi-chevron-down';
    }

    /*  A graph built inside a folded zone measures 0x0 and keeps that
     *  size for good, so it is built when the zone opens and dropped
     *  when it closes.  */
    if(zone === "machine" && priv.machine_view === "graph") {
        if(collapsed) {
            teardown_graph_child(gobj);
        } else if(!priv.graph_gobj) {
            build_graph_child(gobj);
        }
    }

    return 0;
}

/************************************************************
 *   EV_SET_MACHINE_VIEW {mode}
 ************************************************************/
function ac_set_machine_view(gobj, event, kw, src)
{
    let priv = gobj.priv;
    let mode = kw.mode;

    if(!MACHINE_VIEWS.some((v) => v.mode === mode)) {
        log_error(`${GCLASS_NAME}: unknown machine view '${mode}'`);
        return -1;
    }
    if(mode === priv.machine_view) {
        return 0;
    }

    priv.machine_view = mode;
    render_zones(gobj);
    return 0;
}

/************************************************************
 *   EV_SEARCH {text}
 ************************************************************/
function ac_search(gobj, event, kw, src)
{
    let priv = gobj.priv;
    priv.search = String(kw.text || "").trim().toLowerCase();
    apply_search(gobj);
    return 0;
}

/************************************************************
 *   EV_COPY_ALL -- the description, as the backend answered it.
 ************************************************************/
function ac_copy_all(gobj, event, kw, src)
{
    let description = gobj_read_attr(gobj, "description");
    let $container = gobj_read_attr(gobj, "$container");

    if(description === null || description === undefined) {
        return 0;
    }

    yui_copy_json(description);

    if($container) {
        let $btn = $container.querySelector('.EV_COPY_ALL');
        if($btn) {
            yui_button_mark_done($btn, t("copied"));
        }
    }
    return 0;
}

/************************************************************
 *   EV_LANGUAGE_CHANGED -- re-translate chrome + re-render
 *
 *   The tables are BUILT with t(): their headers and their
 *   empty lines carry keys, but the matrix draws state and
 *   event names that are not translatable and legend text that
 *   is. Re-rendering is the only way both end up in the same
 *   language.
 ************************************************************/
function ac_language_changed(gobj, event, kw, src)
{
    let priv = gobj.priv;
    let $container = gobj_read_attr(gobj, "$container");

    if($container) {
        refresh_language($container, t);
        if(priv.$search) {
            priv.$search.setAttribute("placeholder", t("search"));
        }
        apply_view_mode(gobj);
    }
    render_view(gobj);
    return 0;
}

/************************************************************
 *   EV_REFRESH
 ************************************************************/
function ac_refresh(gobj, event, kw, src)
{
    render_view(gobj);
    return 0;
}

/************************************************************
 *   EV_SHOW / EV_HIDE -- host visibility
 ************************************************************/
function ac_show(gobj, event, kw, src)
{
    let $container = gobj_read_attr(gobj, "$container");
    if($container) {
        $container.classList.remove('is-hidden');
    }
    return 0;
}

function ac_hide(gobj, event, kw, src)
{
    let $container = gobj_read_attr(gobj, "$container");
    if($container) {
        $container.classList.add('is-hidden');
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
    mt_create:  mt_create,
    mt_start:   mt_start,
    mt_stop:    mt_stop,
    mt_destroy: mt_destroy,
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
            ["EV_SET_DESCRIPTION",  ac_set_description,     null],
            ["EV_SET_VIEW_MODE",    ac_set_view_mode,       null],
            ["EV_TOGGLE_ZONE",      ac_toggle_zone,         null],
            ["EV_SET_MACHINE_VIEW", ac_set_machine_view,    null],
            ["EV_SEARCH",           ac_search,              null],
            ["EV_COPY_ALL",         ac_copy_all,            null],
            ["EV_LANGUAGE_CHANGED", ac_language_changed,    null],
            ["EV_REFRESH",          ac_refresh,             null],
            ["EV_SHOW",             ac_show,                null],
            ["EV_HIDE",             ac_hide,                null]
        ]]
    ];

    /*---------------------------------------------*
     *          Events
     *---------------------------------------------*/
    const event_types = [
        ["EV_SET_DESCRIPTION",  0],
        ["EV_SET_VIEW_MODE",    0],
        ["EV_TOGGLE_ZONE",      0],
        ["EV_SET_MACHINE_VIEW", 0],
        ["EV_SEARCH",           0],
        ["EV_COPY_ALL",         0],
        ["EV_LANGUAGE_CHANGED", 0],
        ["EV_REFRESH",          0],
        ["EV_SHOW",             0],
        ["EV_HIDE",             0]
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
function register_c_yui_gclass()
{
    /*  Idempotent: yui_gclass_view.js registers this gclass for any
     *  host that offers a "view gclass" control, so an app that also
     *  registers it explicitly must not trip "GClass ALREADY created".  */
    if(gclass_find_by_name(GCLASS_NAME, false)) {
        return 0;
    }
    /*  The machine's graph view hosts a C_YUI_FSM_GRAPH child: make
     *  sure its gclass exists even if the app never registered it.  */
    if(!gclass_find_by_name("C_YUI_FSM_GRAPH", false)) {
        register_c_yui_fsm_graph();
    }
    return create_gclass(GCLASS_NAME);
}

export { register_c_yui_gclass };
