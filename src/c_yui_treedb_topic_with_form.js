/***********************************************************************
 *          c_yui_treedb_topic_with_form.js
 *
 *          Table of TreeDB topic with FORM for editing
 *
 *          Copyright (c) 2025-2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/

import {
    SDATA,
    SDATA_END,
    data_type_t,
    event_flag_t,
    gclass_create,
    log_error,
    gobj_read_pointer_attr,
    gobj_subscribe_event,
    gobj_unsubscribe_event,
    gobj_parent,
    sprintf,
    gobj_read_attr,
    json_deep_copy,
    createElement2,
    gobj_send_event,
    clean_name,
    is_array,
    is_string,
    is_object,
    str_in_list,
    getPositionRelativeToBody,
    treedb_get_field_desc,
    treedb_decoder_fkey,
    empty_string,
    is_date,
    kwid_find_one_record,
    treedb_hook_data_size,
    parseBoolean,
    json_size,
    trace_msg,
    log_warning,
    kwid_get_ids,
    gobj_create_pure_child,
    gobj_start,
    gobj_stop,
    gobj_destroy,
    gobj_is_running,
    gclass_find_by_name,
    gobj_write_attr,
    gobj_read_bool_attr,
    gobj_read_integer_attr,
    gobj_read_str_attr,
    gobj_write_bool_attr,
    gobj_publish_event,
    gobj_command,
    gobj_name,
    gobj_short_name,
    refresh_language,
} from "@yuneta/gobj-js";

import {
    yui_shell_confirm_yesnocancel,
    yui_shell_confirm_ok,
    yui_shell_popup_layer,
    yui_shell_show_modal,
} from "./shell_modals.js";

import {
    yui_shell_of,
} from "./c_yui_shell.js";

import {register_c_yui_form} from "./c_yui_form.js";
import {register_c_yui_json} from "./c_yui_json.js";
import {attach_clear} from "./yui_inputs.js";

import {yui_tabulator_lang, yui_tabulator_relocalize} from "./yui_tabulator_i18n.js";

import {t} from "i18next";

import {plan_treedb_writes} from "./treedb_write_plan.js";

import "./c_yui_treedb_topic_with_form.css";
import "./tabulator.css";

import { TabulatorFull as Tabulator } from "tabulator-tables";

/***************************************************************
 *              Constants
 ***************************************************************/
const GCLASS_NAME = "C_YUI_TREEDB_TOPIC_WITH_FORM";

/***************************************************************
 *              Data
 ***************************************************************/
const attrs_table = [
/*---------------- Public Attributes ----------------*/
SDATA(data_type_t.DTP_POINTER,  "subscriber",           0,  null,   "Subscriber of output events"),
SDATA(data_type_t.DTP_STRING,   "treedb_name",          0,  null,   "Remote service treedb name"),
SDATA(data_type_t.DTP_STRING,   "topic_name",           0,  null,   "Topic name"),
SDATA(data_type_t.DTP_POINTER,  "desc",                 0,  null,   "Description of topics"),

/*---------------- Edition Mode ----------------*/
SDATA(data_type_t.DTP_BOOLEAN,  "readonly",             0,  false,  "The topic cannot be written: no edition mode, no new/delete/paste, no in-row icons, and the record form opens without its save toolbar. Set it when the treedb is not the master of its tranger (only the master can write; the yuno refuses otherwise), or when the user lacks the authz"),
SDATA(data_type_t.DTP_BOOLEAN,  "with_edition_mode",    0,  true,   "Enable EDITION mode showing EDIT Button toolbar"),
SDATA(data_type_t.DTP_BOOLEAN,  "with_new_button",      0,  true,   "Button toolbar NEW"),
SDATA(data_type_t.DTP_BOOLEAN,  "with_delete_button",   0,  true,   "Button toolbar DELETE"),
SDATA(data_type_t.DTP_BOOLEAN,  "with_copy_button",     0,  true,   "Button toolbar COPY"),
SDATA(data_type_t.DTP_BOOLEAN,  "with_paste_button",         0,  true,   "Button toolbar PASTE"),
SDATA(data_type_t.DTP_BOOLEAN,  "with_refresh_button",       0,  true,   "Button toolbar REFRESH"),
SDATA(data_type_t.DTP_BOOLEAN,  "with_search_button",        0,  true,   "Button toolbar SEARCH"),
SDATA(data_type_t.DTP_BOOLEAN,  "with_schema_button",        0,  true,   "Button toolbar SCHEMA (show the topic's desc)"),
SDATA(data_type_t.DTP_BOOLEAN,  "with_columns_button",       0,  true,   "Button toolbar COLUMNS (choose which columns the table shows)"),
SDATA(data_type_t.DTP_BOOLEAN,  "with_export_button",        0,  true,   "Button toolbar EXPORT (download as CSV what the table holds)"),
SDATA(data_type_t.DTP_BOOLEAN,  "with_header_filters",       0,  true,   "Per-column filter box in the table header, on the columns a text/number match means something (not hooks, fkeys or json)"),
SDATA(data_type_t.DTP_BOOLEAN,  "with_inline_edit",          0,  true,   "Edit a writable scalar cell in place while in edition mode (the record form keeps the rest)"),
SDATA(data_type_t.DTP_BOOLEAN,  "with_remote_paging",        0,  false,  "Pull the topic a PAGE at a time from the backend (`nodes` from/limit) instead of loading it whole. Needs a backend that pages"),
SDATA(data_type_t.DTP_INTEGER,  "page_size",                 0,  200,    "Rows per page when with_remote_paging. Generous on purpose: a treedb that fits in one page behaves exactly as it did, paginator hidden and every filter seeing every row"),
SDATA(data_type_t.DTP_BOOLEAN,  "with_in_row_edit_icons",    0,  true,   "Add a last column with internal EDIT/DELETE icon"),

SDATA(data_type_t.DTP_BOOLEAN,  "editable",             0,  false,  "Edit state"),

/*---------------- Selection Mode ----------------*/
SDATA(data_type_t.DTP_BOOLEAN,  "with_checkbox",        0,  true,   "Auxiliary first column to select rows"),
SDATA(data_type_t.DTP_BOOLEAN,  "with_radio",           0,  false,  "Auxiliary first column to select one row"),
SDATA(data_type_t.DTP_BOOLEAN,  "broadcast_select_rows_event",   0,  false, "Broadcast select rows event"),
SDATA(data_type_t.DTP_BOOLEAN,  "broadcast_unselect_rows_event", 0,  false, "Broadcast unselect rows event"),

/*---------------- Tabulator Defaults ----------------*/
SDATA(data_type_t.DTP_JSON,     "tabulator_settings",   0,  {
    layout: "fitDataFill",
    columnDefaults: {
        resizable: true
    },
    pagination: true,
    paginationSize: 25,
    paginationSizeSelector: [25, 50, 100, true],
    placeholder: "No data available",   /*  overridden per-language at create  */
    maxHeight: "100%"
}, "Default settings for Tabulator"),

/*---------------- Internal Attributes ----------------*/
SDATA(data_type_t.DTP_POINTER,  "$container",           0,  null,   "HTML container for UI"),
SDATA(data_type_t.DTP_POINTER,  "tabulator",            0,  null,   "Tabulator instance"),
SDATA(data_type_t.DTP_STRING,   "table_id",             0,  null,   "Table div ID"),
SDATA(data_type_t.DTP_STRING,   "toolbar_id",           0,  null,   "Toolbar ID"),
SDATA(data_type_t.DTP_STRING,   "popup_id",             0,  null,   "Edit form popup ID"),

SDATA_END()
];

let PRIVATE_DATA = {
    _pending_pages:     null,       // req_id -> {resolve, reject, timer}
    _page_seq:          0,          // correlation id of a page request
    $container:         null,
    treedb_name:        "",
    topic_name:         "",
    tabulator:          null,
    form:               null,   // hosted C_YUI_FORM child (while dialog open)
    form_modal:         null,   // { close } handle of the adaptive dialog
    schema_gobj:        null,   // hosted C_YUI_JSON child (while schema open)
    schema_modal:       null,   // { close } handle of the schema dialog
    cell_json_gobj:     null,   // hosted C_YUI_JSON child (while a cell is open)
    cell_json_modal:    null,   // { close } handle of the cell dialog
};

let __gclass__ = null;

/*  Where to mount the edit/delete modal.  Under a C_YUI_SHELL use
 *  its popup layer (z 20): the shell confirms live on the modal
 *  layer (z 99), so they always paint above this dialog — a
 *  body-mounted Bulma `.modal` would cover them (the shell is a
 *  stacking context below body-level modals).  The legacy
 *  C_YUI_MAIN "#popup-layer" and document.body (Bulma `.modal` is
 *  position:fixed) remain the shell-less fallbacks. */
function popup_mount_layer(gobj)
{
    let $layer = yui_shell_popup_layer(yui_shell_of(gobj));
    if($layer) {
        return $layer;
    }
    return document.getElementById("popup-layer") || document.body;
}




                    /******************************
                     *      Framework Methods
                     ******************************/




/***************************************************************
 *          Framework Method: Create
 ***************************************************************/
function mt_create(gobj)
{
    let name = clean_name(gobj_name(gobj));
    gobj_write_attr(gobj, "table_id", "table" + name);
    gobj_write_attr(gobj, "toolbar_id", "toolbar" + name);
    gobj_write_attr(gobj, "popup_id", "popup" + name);

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
    /*  The shell publishes the language switch (yui_shell_language_changed):
     *  the column headers re-translate themselves (they carry data-i18n — see
     *  col_label), but Tabulator's OWN chrome is drawn once and needs to be
     *  told.  */
    let shell = yui_shell_of(gobj);
    if(shell) {
        gobj_subscribe_event(shell, "EV_LANGUAGE_CHANGED", {}, gobj);
    }
    create_tabulator(gobj);
}

/***************************************************************
 *          Framework Method: Stop
 ***************************************************************/
function mt_stop(gobj)
{
    let shell = yui_shell_of(gobj);
    if(shell) {
        gobj_unsubscribe_event(shell, "EV_LANGUAGE_CHANGED", {}, gobj);
    }
    close_form_dialog(gobj);
    close_schema_dialog(gobj);
    close_cell_json_dialog(gobj);
    table__destroy(gobj);
}

/***************************************************************
 *          Framework Method: Destroy
 ***************************************************************/
function mt_destroy(gobj)
{
    /*  A destroy with the edit dialog open (e.g. the hosted view is
     *  rebuilt on a transport rebind) must tear the dialog down too:
     *  it unhooks the Escape handler (shell chain or document
     *  listener) and removes the dialog DOM. */
    close_form_dialog(gobj);
    close_schema_dialog(gobj);
    close_cell_json_dialog(gobj);
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
    let webix = {
        "result": 0,
        "comment": "",
        "schema": null,
        "data": null
    };

    let tabulator = gobj_read_attr(gobj, "tabulator");
    webix.data = tabulator.getData();
    return webix;
}




                    /***************************
                     *      Local Methods
                     ***************************/




/************************************************************
 *
 ************************************************************/
// Function to read text from the clipboard
async function readClipboard(gobj)
{
    try {
        const text = await navigator.clipboard.readText();
        let kw = JSON.parse(text);
        gobj_send_event(gobj, "EV_PASTE_ROWS", kw, gobj);
    } catch (error) {
        log_error(`Failed to read clipboard contents: ${error}`);
    }
}

/************************************************************
 *   Build UI
 ************************************************************/
function build_ui(gobj)
{
    function create_table_toolbar()
    {
        // TODO pon autorización, solo si está autorizado a modificar los datos!!!
        // TODO deja que estos botones se queden en el top cuando se hace scroll (clip ?)
        let $table_toolbar = [];
        /*  One plan decides every write affordance (treedb_write_plan.js):
         *  `readonly` is the STATE of the topic and beats each with_* flag,
         *  and stating that in five `!readonly &&` expressions is five places
         *  to forget the sixth.  */
        let plan = write_plan(gobj);
        let with_edition_mode = plan.edition_mode;
        let with_new_button = plan.new_button;
        let with_delete_button = plan.delete_button;
        let with_copy_button = gobj_read_bool_attr(gobj, "with_copy_button");
        let with_paste_button = plan.paste_button;

        let toolbar_id = gobj_read_str_attr(gobj, "toolbar_id");

        if(with_edition_mode) {
            $table_toolbar = createElement2(
                ['div', {id: `${toolbar_id}`, class: 'TREEDB_TABLE_ACTIONS buttons mb-0'}]
            );
            /*  Edit is a MODE TOGGLE, not one more action: it arms/disarms
             *  the buttons that modify the table (new/delete/copy/paste),
             *  which is why it comes first and why delete sits among them
             *  instead of being pushed away from the harmless ones. Do not
             *  reorder this group as if they were peer actions.  */
            let $edit_button = createElement2(
                ['button', {id: ``, class: 'button button-edit-record mr-1'}, [
                    ['i', {class: 'yi-pen'}],
                    ['span',
                        {
                            class: 'is-hidden-mobile', i18n: 'edit', style: 'padding-left:5px;'
                        },
                        'edit'
                    ]
                ], {
                    'click': (event) => {
                        /////////////////////////////////////////////////////
                        //  WARNING
                        //  if do not stop propagation, the event will arrive until body,
                        //  and a auto-closing function will remove is-active class
                        //  and this popup will not open
                        //  (Bulma components that it opens with toggling "is-active" class)
                        /////////////////////////////////////////////////////
                        event.stopPropagation();
                        gobj_send_event(gobj, "EV_EDITION_MODE", {}, gobj);
                    }
                }
            ]);
            $table_toolbar.appendChild($edit_button);

            if(with_new_button) {
                let $new_button = createElement2(
                    ['button', {id: ``, class: 'button button-new-record mr-1', disabled: true}, [
                        ['i', {class: 'yi-plus'}],
                        ['span',
                            {
                                class: 'is-hidden-mobile', i18n: 'new', style: 'padding-left:5px;'
                            },
                            'new'
                        ]
                    ], {
                        'click': (event) => {
                            event.stopPropagation();
                            gobj_send_event(gobj, "EV_NEW_ROW", {}, gobj);
                        }
                    }
                ]);
                $table_toolbar.appendChild($new_button);
            }

            if(with_delete_button) {
                let $delete_button = createElement2(
                    ['button', {id: ``, class: 'button button-delete-record mr-1', disabled: true}, [
                        ['i', {class: 'yi-trash'}],
                        ['span',
                            {
                                class: 'is-hidden-mobile', i18n: 'delete', style: 'padding-left:5px;'
                            },
                            'delete'
                        ]
                    ], {
                        'click': (event) => {
                            event.stopPropagation();
                            // Delete selected rows ({} empty)
                            gobj_send_event(gobj, "EV_DELETE_ROWS", {}, gobj);
                        }
                    }
                ]);
                $table_toolbar.appendChild($delete_button);
            }

            if(with_copy_button) {
                let $copy_button = createElement2(
                    ['button', {id: ``, class: 'button button-copy-record mr-1', disabled: true}, [
                        ['i', {class: 'yi-copy'}],
                        ['span',
                            {
                                class: 'is-hidden-mobile', i18n: 'copy', style: 'padding-left:5px;'
                            },
                            'copy'
                        ]
                    ], {
                        'click': (event) => {
                            event.stopPropagation();
                            // copy selected rows ({} empty)
                            gobj_send_event(gobj, "EV_COPY_ROWS", {}, gobj);
                        }
                    }
                    ]);
                $table_toolbar.appendChild($copy_button);
            }

            if(with_paste_button) {
                let $paste_button = createElement2(
                    ['button', {id: ``, class: 'button button-paste-record mr-1', disabled: true}, [
                        ['i', {class: 'yi-paste'}],
                        ['span',
                            {
                                class: 'is-hidden-mobile', i18n: 'paste', style: 'padding-left:5px;'
                            },
                            'paste'
                        ]
                    ], {
                        'click': async function(event) {
                            event.stopPropagation();
                            await readClipboard(gobj);
                        }
                    }]
                );
                $table_toolbar.appendChild($paste_button);
            }
        }
        return $table_toolbar;
    }

    let $table_toolbar = create_table_toolbar();

    /*----------------------------------------------*
     *  View toolbar: Search, Refresh
     *  Always visible, independent of edition mode
     *----------------------------------------------*/
    let toolbar_id = gobj_read_str_attr(gobj, "toolbar_id");

    /*  The tools of the list (search, refresh) sit apart from the record
     *  actions: actions left, tools right, and on mobile the tools take a
     *  row of their own with the search stretched across it. */
    let $view_toolbar = createElement2(
        ['div', {class: 'TREEDB_TABLE_TOOLS is-flex is-align-items-center'}]
    );

    let with_refresh_button     = gobj_read_bool_attr(gobj, "with_refresh_button");
    let with_search_button      = gobj_read_bool_attr(gobj, "with_search_button");
    let with_schema_button      = gobj_read_bool_attr(gobj, "with_schema_button");
    let with_columns_button     = gobj_read_bool_attr(gobj, "with_columns_button");
    let with_export_button      = gobj_read_bool_attr(gobj, "with_export_button");

    if(with_search_button) {
        let search_id = `${toolbar_id}_search`;
        let $search_box = createElement2(
            ['div', {class: 'TREEDB_TABLE_SEARCH control has-icons-left mr-1'}, [
                ['input', {
                    id: search_id,
                    class: 'input',
                    type: 'text',
                    /*  The placeholder is not a text node, so the
                     *  data-i18n walk cannot reach it — it needs its own
                     *  key or it stays English for good. */
                    placeholder: t('search'),
                    'data-i18n-placeholder': 'search'
                }],
                ['span', {class: 'icon is-left'}, [
                    ['i', {class: 'yi-magnifying-glass'}]
                ]]
            ]]
        );
        let $search_input = $search_box.querySelector(`#${search_id}`);
        /*  NORM clear (✕): dispatches a synthetic `input`, so the tabulator
         *  filter below re-runs (empty term → clearFilter).  */
        attach_clear($search_box, $search_input);
        if($search_input) {
            /*  The DOM handler's only job is to turn the keystroke into an
             *  event: searching is a user action, so it crosses the FSM and
             *  shows up in the `machine` trace like every other one. */
            $search_input.addEventListener('input', (event) => {
                gobj_send_event(
                    gobj,
                    "EV_SEARCH",
                    {text: event.target.value.trim()},
                    gobj
                );
            });
        }
        $view_toolbar.appendChild($search_box);
    }

    if(with_refresh_button) {
        let $refresh = createElement2(
            ['button', {class: 'button mr-1', title: t('refresh'), 'data-i18n-title': 'refresh'}, [
                ['i', {class: 'yi-arrows-rotate'}],
                ['span', {class: 'is-hidden-mobile', i18n: 'refresh', style: 'padding-left:5px;'}, 'refresh']
            ], {
                'click': (event) => {
                    event.stopPropagation();
                    gobj_send_event(gobj, "EV_REFRESH", {}, gobj);
                }
            }]
        );
        $view_toolbar.appendChild($refresh);
    }

    if(with_schema_button) {
        /*  What the columns of this topic ARE: types, flags, fkeys. The
         *  table shows the data; this shows the contract the data answers
         *  to, which is what you need when a value is refused or a link
         *  does not appear. */
        let $schema = createElement2(
            ['button', {class: 'TREEDB_TABLE_SCHEMA button mr-1',
                        title: t('schema'), 'data-i18n-title': 'schema',
                        'aria-label': t('schema'), 'data-i18n-aria-label': 'schema'}, [
                ['i', {class: 'yi-hexagon-nodes'}],
                ['span', {class: 'is-hidden-mobile', i18n: 'schema', style: 'padding-left:5px;'}, 'schema']
            ], {
                'click': (event) => {
                    event.stopPropagation();
                    gobj_send_event(gobj, "EV_SHOW_SCHEMA", {}, gobj);
                }
            }]
        );
        $view_toolbar.appendChild($schema);
    }

    if(with_columns_button) {
        /*  A topic with a dozen columns is wider than the screen, and until
         *  now the reader could not decide WHICH of them to keep: the table
         *  simply scrolled sideways for ever. */
        let $columns = createElement2(
            ['button', {class: 'TREEDB_TABLE_COLUMNS button mr-1',
                        title: t('choose the columns to show'),
                        'data-i18n-title': 'choose the columns to show',
                        'aria-label': t('columns'), 'data-i18n-aria-label': 'columns'}, [
                ['i', {class: 'yi-table'}],
                ['span', {class: 'is-hidden-mobile', i18n: 'columns', style: 'padding-left:5px;'}, 'columns']
            ], {
                'click': (event) => {
                    event.stopPropagation();
                    gobj_send_event(gobj, "EV_OPEN_COLUMNS", {}, gobj);
                }
            }]
        );
        $view_toolbar.appendChild($columns);
    }

    if(with_export_button) {
        /*  What the TABLE holds, filters and column choice applied — not the
         *  topic. A server-side dump of every node is not something this view
         *  can stream, and the title says so. */
        let $export = createElement2(
            ['button', {class: 'TREEDB_TABLE_EXPORT button mr-1',
                        title: t('download the rows loaded in this table as csv'),
                        'data-i18n-title': 'download the rows loaded in this table as csv',
                        'aria-label': t('export'), 'data-i18n-aria-label': 'export'}, [
                ['i', {class: 'yi-download'}],
                ['span', {class: 'is-hidden-mobile', i18n: 'export', style: 'padding-left:5px;'}, 'export']
            ], {
                'click': (event) => {
                    event.stopPropagation();
                    gobj_send_event(gobj, "EV_EXPORT_TABLE", {}, gobj);
                }
            }]
        );
        $view_toolbar.appendChild($export);
    }

    /*----------------------------------------------*
     *  Layout Schema
     *----------------------------------------------*/
    let table_id = gobj_read_str_attr(gobj, "table_id");
    let $container = createElement2(
        ['div', {class: 'C_YUI_TREEDB_TOPIC_WITH_FORM', style: 'height:100%;'}, [
            ['div', {class: 'TREEDB_TABLE_TOOLBAR toolbar_tabulator_table m-1', style: 'display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap;'}],
            ['div',
                {
                    id: `${table_id}`,
                    style: 'margin-top:0px !important;',
                }
            ]
        ]]
    );
    let $toolbar_slot = $container.querySelector('.toolbar_tabulator_table');
    if($table_toolbar instanceof Element) {
        $toolbar_slot.appendChild($table_toolbar);
    } else {
        $toolbar_slot.appendChild(createElement2(['div', {}]));
    }
    $toolbar_slot.appendChild($view_toolbar);

    gobj_write_attr(gobj, "$container", $container);
    refresh_language($container, t);
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

/***************************************************************************
 *  Function to convert dataset (of DOM Element) to plain object
 ***************************************************************************/
function datasetToObject(dataset)
{
    return Object.fromEntries(
        Object.entries(dataset).map(([key, value]) => [key, value])
    );
}

/******************************************************************
 *   i18n label for a schema column.
 *
 *   Key cascade (i18next tries each in order, first hit wins):
 *     1) "<topic_name>.<col.id>"  — per-topic, stable.  Needed
 *        because some col.ids are NOT unique across topics: every
 *        topic has an `id` pkey but its caption differs ("Device
 *        Group" vs "Device" vs "User"…).  A flat `id` key could
 *        only ever be one of them.
 *     2) "<col.id>"               — shared, stable.  Generic
 *        columns (enabled, description, role…) translate once and
 *        apply to every topic; no need to repeat them per topic.
 *     3) defaultValue: col.header || col.id — untranslated column
 *        reads exactly as before (zero regression).
 *
 *   Both key parts are schema **ids**: stable, never reworded
 *   (unlike col.header, which a release may recaption and would
 *   then silently break a header-keyed translation).  So: add a
 *   `topic.col` entry only for the ambiguous ones (the `id`
 *   columns); leave the rest on the flat shared key.
 ******************************************************************/
function col_label(col, topic_name)
{
    let keys = topic_name ? [topic_name + "." + col.id, col.id] : [col.id];
    return t(keys, { defaultValue: col.header || col.id });
}

/******************************************************************
 *   Column-title formatter: render the header as a span carrying
 *   `data-i18n` (the shared col id) so a live language switch —
 *   which calls refresh_language(document.body) — retranslates the
 *   Tabulator headers in place, without rebuilding the table. Only
 *   tag translatable columns; otherwise keep the schema header
 *   (refresh_language would otherwise overwrite it with the raw id).
 *   Tabulator re-runs this on redraw, so the full cascade re-applies.
 ******************************************************************/
function col_title_formatter(gobj, col)
{
    let topic_name = gobj_read_str_attr(gobj, "topic_name");
    return function(cell, formatterParams, onRendered) {
        let text = col_label(col, topic_name);
        let attrs = {};
        const NO_I18N = "\x00";
        if(t(col.id, {defaultValue: NO_I18N}) !== NO_I18N) {
            attrs.i18n = col.id;
        }
        return createElement2(['span', attrs, text]);
    };
}

/******************************************************************
 *   Build table with Tabulator
 *   This fn is called on start and when desc attribute is set.
 *   desc contains the description (columns) of table to create
 ******************************************************************/
function create_tabulator(gobj)
{
    let table_id = gobj_read_str_attr(gobj, "table_id");
    let desc = gobj_read_attr(gobj, "desc");
    let with_header_filters = gobj_read_bool_attr(gobj, "with_header_filters");
    let with_inline_edit = gobj_read_bool_attr(gobj, "with_inline_edit");

    let columns = [];

    /*
     *  Add the checkbox/radio selection column.
     */
    let with_checkbox = gobj_read_bool_attr(gobj, "with_checkbox");
    let with_radio = gobj_read_bool_attr(gobj, "with_radio");
    if(with_checkbox) {
        columns.push({
            formatter: "rowSelection",
            titleFormatter: "rowSelection",
            field: "_check_box_state_",  // WARNING _check_box_state_ widely used
            hozAlign: "center",
            headerHozAlign: "center",
            width: 40,
            visible: false,
            headerSort: false
        });
    } else if(with_radio) {
        columns.push({
            formatter: "rowSelection",
            field: "_check_box_state_",  // WARNING _check_box_state_ widely used
            hozAlign: "center",
            width: 40,
            visible: false,
            headerSort: false
        });
    }

    /*
     *  Cell formatter — called on every cell display.
     *  Tabulator only accepts: string, number, boolean, DOM Node, null, or undefined.
     *  Returning any other object (e.g. Array, plain {}) triggers a console.warn and
     *  renders an empty cell (see tabulator Cell.js _generateContents).
     *  transform__treedb_value_2_table_value() is responsible for the conversion;
     *  it has a final guard that JSON.stringifies any object that slips through.
     */
    function formatter(cell, formatterParams, onRendered)
    {
        let value = cell.getValue();
        let row = cell.getData();
        let field = cell.getField();
        let col = get_schema_col(gobj, field);
        if(col) {
            return transform__treedb_value_2_table_value(gobj, col, value, row, field);
        }
        return "???";
    }

    /*
     *  Click on a JSON-document cell (dict/list/blob/template/…): the cell
     *  can only ever show a truncated preview, so open the whole value in
     *  the viewer. The kw carries the IDENTITY of the cell (row id + col
     *  id), never the value itself — the machine trace dumps the kw.
     */
    function json_cell_click(e, cell)
    {
        if(!cell.getElement().querySelector('.JSON_CELL')) {
            return;     // empty document: nothing to open
        }
        e.stopPropagation();

        let pkey = desc.pkey || "id";
        let row_id = cell.getData()[pkey];
        if(row_id === undefined || row_id === null) {
            log_error(
                `${gobj_short_name(gobj)}: row without pkey '${pkey}',` +
                ` cannot open the json of '${cell.getField()}'`
            );
            return;
        }
        gobj_send_event(
            gobj,
            "EV_SHOW_CELL_JSON",
            {row_id: row_id, col_id: cell.getField()},
            gobj
        );
    }

    /*  A filter box per column, on the columns where a text/number match
     *  MEANS something. A hook holds children, a dict holds a subtree and a
     *  date cell shows a formatted string over an epoch number — matching
     *  the raw value there answers a question nobody asked, so those columns
     *  get no box rather than a box that lies. An fkey does get one: "which
     *  rows point at X" is the question fkey columns exist to answer, and its
     *  value is stringified first because a fkey can arrive as a ref string,
     *  a list of them or a dict.
     */
    /*  A cell you can type into, and the ones you cannot.
     *
     *  Editing in place is for a SCALAR the table can round-trip. A hook
     *  holds children and an fkey IS a link — both are edited by linking,
     *  not by typing — a dict or a list is a document (the form has an
     *  editor for it), and a date cell shows a formatted string over an
     *  epoch, so typing into it would write the string. Those stay with
     *  the form, which is one click away on the same row.
     *
     *  The schema decides the rest: only a column flagged `writable` is
     *  offered, and never the pkey — renaming what a record is KEYED by
     *  is not a field edit.
     */
    const INLINE_EDITABLE = [
        "string", "integer", "real",
        "email", "url", "tel", "id", "hex", "currency", "percent", "uuid"
    ];

    function inline_editor_for(colDef, col, field_desc)
    {
        if(!field_desc.is_writable) {
            return;
        }
        if(col.id === (desc.pkey || "id")) {
            return;
        }

        switch(field_desc.type) {
            case "boolean":
                colDef.editor = "tickCross";
                break;
            case "enum":
                colDef.editor = "list";
                colDef.editorParams = {values: field_desc.enum_list || []};
                break;
            case "integer":
            case "real":
                colDef.editor = "number";
                break;
            default:
                if(!INLINE_EDITABLE.includes(field_desc.type)) {
                    return;
                }
                colDef.editor = "input";
                break;
        }

        /*  A FUNCTION, not a flag: edition mode is toggled on a table that
         *  is already built (ac_edition_mode only shows and hides columns),
         *  so the answer has to be asked for at the moment of the click. */
        colDef.editable = function() {
            return gobj_read_bool_attr(gobj, "editable") &&
                   !gobj_read_bool_attr(gobj, "readonly");
        };
    }

    const FILTERABLE = [
        "string", "integer", "real", "rowid", "uuid", "qualified",
        "email", "url", "tel", "id", "hex", "currency", "percent"
    ];

    function fkey_matches(term, value)
    {
        if(term === "" || term === null || term === undefined) {
            return true;
        }
        if(value === null || value === undefined) {
            return false;
        }
        let text = (typeof value === "string")? value : JSON.stringify(value);
        return text.toLowerCase().includes(String(term).toLowerCase());
    }

    function apply_header_filter(colDef, field_desc)
    {
        switch(field_desc.type) {
            case "boolean":
                colDef.headerFilter = "tickCross";
                colDef.headerFilterParams = {tristate: true};
                break;
            case "enum":
                colDef.headerFilter = "list";
                colDef.headerFilterParams = {
                    values: field_desc.enum_list || [],
                    clearable: true
                };
                break;
            case "fkey":
                colDef.headerFilter = "input";
                colDef.headerFilterFunc = fkey_matches;
                break;
            default:
                if(FILTERABLE.includes(field_desc.type)) {
                    colDef.headerFilter = "input";
                }
                break;
        }

        /*  A column carrying a text box needs room for the box. The table
         *  lays out `fitDataFill`, which sizes a column to its DATA: a
         *  `Role` column holding "root" came out narrower than its own
         *  filter, whose placeholder was cut to "filtrar c". The tick of a
         *  boolean is not a box and stays as narrow as it wants.
         *
         *  150 and not a rounder number: it is what the placeholder needs
         *  in the LONGEST locale ("filtrar columna...", ~18 characters).
         *  The placeholder cannot be shortened per column — it comes from
         *  the shared Tabulator locale, which is exactly what re-renders it
         *  on a language switch; a per-column one would freeze in the
         *  language it was built in.  */
        if(colDef.headerFilter && colDef.headerFilter !== "tickCross") {
            colDef.minWidth = 150;
        }
    }

    for (let i = 0; i < desc.cols.length; i++) {
        let col = desc.cols[i];
        if(!col.id || col.id[0]==='_') {
            continue;
        }

        let hozAlign;
        let vertAlign;
        let sorter = "string";
        let cellClick;
        let colFormatter = formatter;
        let formatterParams;
        const field_desc = treedb_get_field_desc(col);
        if(field_desc.is_hidden) {
            continue;
        }
        switch(field_desc.type) {
            case "hook":
                hozAlign = "center";
                cellClick = function(e, cell) {
                    let target = e.target.closest('.hook_cell');
                    if(!target) {
                        return;
                    }
                    e.stopPropagation();
                    let data = Object.fromEntries(
                        Object.entries(target.dataset).map(([k, v]) => [k, v])
                    );
                    let kw_hook = {};
                    if(data && data.row_id) {
                        let pos = getPositionRelativeToBody(target);
                        kw_hook = {
                            treedb_name: gobj_read_attr(gobj, "treedb_name"),
                            topic_name: gobj_read_attr(gobj, "topic_name"),
                            row_id: data.row_id,
                            col_id: data.col_id,
                            click_x: pos.left,
                            click_y: pos.top
                        };
                    }
                    gobj_send_event(gobj, "EV_SHOW_HOOK_DATA", kw_hook, gobj);
                };
                break;
            case "image":
                hozAlign = "center";
                vertAlign = "middle";
                colFormatter = "image";
                formatterParams = {
                    height: "18px",
                    width: "auto",
                };
                break;
            case "color":
                hozAlign = "center";
                colFormatter = "color";
                break;
            case "object":
            case "dict":
            case "template":
            case "array":
            case "list":
            case "coordinates":
            case "blob":
            case "gbuffer":
                cellClick = json_cell_click;
                break;
            case "boolean":
                hozAlign = "center";
                vertAlign = "middle";
                sorter = "boolean";
                colFormatter = "tickCross";
                break;
            case "integer":
            case "real":
                hozAlign = "right";
                sorter = "number";
                break;
            /*  A rowid is a NUMBER stored as a string key: sorted as text,
             *  "9" lands after "69". Read like the integer it is.  */
            case "rowid":
                hozAlign = "right";
                sorter = "number";
                break;
        }

        let colDef = {
            title: col_label(col, gobj_read_str_attr(gobj, "topic_name")),
            titleFormatter: col_title_formatter(gobj, col),
            field: col.id,
            sorter: sorter,
            hozAlign: hozAlign,
            formatter: colFormatter,
        };
        if(with_header_filters) {
            apply_header_filter(colDef, field_desc);
        }
        if(with_inline_edit) {
            inline_editor_for(colDef, col, field_desc);
        }
        if(vertAlign) {
            colDef.vertAlign = vertAlign;
        }
        if(formatterParams) {
            colDef.formatterParams = formatterParams;
        }
        if(cellClick) {
            colDef.cellClick = cellClick;
        }
        columns.push(colDef);
    }

    /*
     *  Column with operators: edit, delete
     */
    function operateFormatter(cell, formatterParams, onRendered) {
        return [
            '<button class="button without-border px-2 edit">',
                '<i style="" class="yi-pen has-text-link"></i>',
            '</button>',
            '<button class="button without-border px-2 remove">',
                '<i style="" class="yi-trash has-text-danger"></i>',
            '</button>'
        ].join('');
    }

    let with_in_row_edit_icons = write_plan(gobj).in_row_icons;
    if(with_in_row_edit_icons) {
        columns.push({
            field: '_operation',
            title: 'Op',
            hozAlign: 'center',
            frozen: "right",
            visible: false,
            headerSort: false,
            formatter: operateFormatter,
            cellClick: function(e, cell) {
                let row = cell.getRow().getData();
                let index = cell.getRow().getPosition();
                if(e.target.closest('.edit')) {
                    e.stopPropagation();
                    show_edit_form(gobj, row, index);
                } else if(e.target.closest('.remove')) {
                    e.stopPropagation();
                    gobj_send_event(gobj, "EV_DELETE_ROWS", {index: index, row: row}, gobj);
                }
            }
        });
    }

    let pkey = desc.pkey || "id";
    /*  Selection is driven ONLY by the checkbox column, never by clicking
     *  the row: "highlight" keeps the rowSelection checkbox fully working
     *  (it calls toggleSelect() directly) while disabling click-to-select,
     *  so opening the edit (yi-pen) form no longer implicitly ticks the
     *  row. Radio keeps single click-select (its own widget).  */
    let selectable = with_checkbox ? "highlight" : (with_radio ? 1 : false);

    let tabulator_settings = json_deep_copy(gobj_read_attr(gobj, "tabulator_settings"));

    /*  Remote paging: the TABLE pulls, instead of the host pushing the whole
     *  topic down. The page size is generous on purpose — a treedb that fits
     *  in one page behaves exactly as it did before, with the paginator
     *  hidden and every filter seeing every row. Only a topic that does NOT
     *  fit pays for paging, and for that one loading it whole was never an
     *  option anyway.
     *
     *  `filterMode: "local"` says the plain truth: the header filters and the
     *  search box work on the page that is loaded. Same as the tranger
     *  browser's Rows card, and for the same reason — the alternative is
     *  pushing every filter to the backend and changing what "search" means.
     */
    if(gobj_read_bool_attr(gobj, "with_remote_paging")) {
        let page_size = gobj_read_integer_attr(gobj, "page_size") || 200;
        Object.assign(tabulator_settings, {
            pagination:             true,
            paginationMode:         "remote",
            filterMode:             "local",
            paginationSize:         page_size,
            paginationSizeSelector: [50, 100, 200, 500],
            ajaxURL:                "nodes",   /*  dummy: only fires the func  */
            ajaxRequestFunc: function(url, config, params) {
                /*  Widget plumbing, not an action: Tabulator wants a PROMISE
                 *  back — it is a data source. The action is the event this
                 *  parks on. */
                return request_page(gobj, params.page || 1, params.size || page_size);
            }
        });
    }

    Object.assign(tabulator_settings, {
        index: pkey,
        columns: columns,
        selectableRows: selectable,
        /*  Row-count footer (updated on every data change below). */
        footerElement: "<span class='yui-tabulator-rowcount' " +
            "style='display:block;text-align:right;font-size:0.8rem;" +
            "color:#6b7280;padding:0 0.6rem;'></span>",
    });

    /*
     *  Attach by ELEMENT, resolved inside OUR $container — a bare `#id`
     *  selector needs the element to be in the document already (a view
     *  built before being mounted crashes Tabulator: "no element found",
     *  then .on() dies on externalEvents null) and is shadowed by any
     *  stale duplicate id elsewhere in the page.
     */
    let $view_container = gobj_read_attr(gobj, "$container");
    let $table_el = $view_container ?
        $view_container.querySelector(`#${table_id}`) : null;
    if(!$table_el) {
        log_error(`${gobj_short_name(gobj)}: table element '#${table_id}' not found in $container`);
        return;
    }
    /*  Tabulator renders its own chrome — the paginator, the placeholder, the
     *  loading/error notices — and nothing ever passed those through i18n: the
     *  table sat in English inside a Spanish view. Hand it the current
     *  language (every key falls back to what it used to render, so an app
     *  that defines none of them sees no change).  */
    let tabulator = new Tabulator($table_el,
        Object.assign({}, tabulator_settings, yui_tabulator_lang(t), {
            /*  The placeholder ships as an English literal in the settings
             *  default; hand it the current language (falling back to exactly
             *  what it said before for an app that does not define the key).  */
            placeholder: t("no data available", {defaultValue: "No data available"})
        }));

    /*  "highlight" still paints the whole-row hover wash (and a pointer
     *  cursor), which reads as a selection. This table selects only via the
     *  checkbox, so suppress the hover: rows stay visually static, and only
     *  a checkbox-selected row changes colour (see tabulator.css). */
    if(with_checkbox) {
        $table_el.classList.add("yui-no-row-hover");
    }

    /*  Keep the footer in sync with the visible (active) row count,
     *  and hide the pagination chrome while everything fits in one
     *  page (it comes back as soon as a second page exists). */
    /*  `explicit_count` is for the ONE caller that cannot ask the table:
     *  `dataFiltered` is dispatched from INSIDE Tabulator's filter(), which
     *  only RETURNS the surviving rows to the pipeline afterwards — so
     *  `getDataCount("active")` still answers the pre-filter set there and
     *  the footer claimed "5 rows" over four. The event hands us the rows
     *  it just kept; that is the number. Every other caller passes nothing
     *  and the table is asked. The `typeof` guard matters because
     *  `dataProcessed` / `dataChanged` are registered directly and hand a
     *  DATA ARRAY as their first argument.  */
    function update_rowcount(explicit_count) {
        let $rc = tabulator.element &&
            tabulator.element.querySelector(".yui-tabulator-rowcount");
        if(!$rc) {
            return;
        }
        let n = 0;
        if(typeof explicit_count === "number") {
            n = explicit_count;
        } else {
            try {
                n = tabulator.getDataCount("active");
            } catch(e) {
                n = 0;
            }
        }
        $rc.textContent = `${n} ${t("rows")}`;

        /*  Derived from the count and the page size rather than read from
         *  getPageMax(), which is stale in the filter path for the same
         *  reason. getPageSize() throws with pagination off -> one page. */
        let single_page = true;
        try {
            let size = tabulator.getPageSize();
            single_page = !size || n <= size;
        } catch(e) {
            single_page = true;
        }
        tabulator.element.classList.toggle("yui-single-page", single_page);
    }

    tabulator._ready = false;
    tabulator.on("tableBuilt", function() {
        tabulator._ready = true;
        update_rowcount();
        if(tabulator._pendingData !== undefined) {
            tabulator.setData(tabulator._pendingData);
            delete tabulator._pendingData;
        }
    });
    /*  dataProcessed: after load/sort.  dataChanged: rows added/removed/
     *  edited.  dataFiltered: after a filter runs — and that one is the
     *  reason the footer used to LIE. It read "5 Filas" over four visible
     *  rows, because filtering fires its own event and neither of the other
     *  two. Nobody had noticed while the only filter was the global search
     *  box; a filter per column made it a claim you read on every keystroke. */
    tabulator.on("dataProcessed", update_rowcount);
    tabulator.on("dataChanged", update_rowcount);
    /*  A cell edited in place. Announced as ONE FIELD of one record — not
     *  as the row — and that is the whole safety of it: the host writes it
     *  with a partial update and no `autolink`, so nothing but that field
     *  moves. `autolink` wipes a node's links and rebuilds them from the
     *  fkeys the record carries, so sending a row that the table shaped for
     *  DISPLAY would unlink the node and answer success.  */
    tabulator.on("cellEdited", function(cell) {
        let pkey = (gobj_read_attr(gobj, "desc") || {}).pkey || "id";
        let data = cell.getRow().getData();
        let id = data ? data[pkey] : undefined;
        if(id === undefined || id === null) {
            log_error(`${gobj_short_name(gobj)}: edited a row with no '${pkey}'`);
            cell.restoreOldValue();
            return;
        }
        gobj_send_event(
            gobj,
            "EV_CELL_EDITED",
            {
                id:    id,
                field: cell.getField(),
                value: cell.getValue()
            },
            gobj
        );
    });

    tabulator.on("dataFiltered", function(filters, rows) {
        update_rowcount(Array.isArray(rows)? rows.length : undefined);
    });
    tabulator.on("rowSelected", function(row) {
        gobj_send_event(gobj, "EV_SELECT_ROWS", {rows: [row.getData()]}, gobj);
    });
    tabulator.on("rowDeselected", function(row) {
        gobj_send_event(gobj, "EV_UNSELECT_ROWS", {rows: [row.getData()]}, gobj);
    });
    gobj_write_attr(gobj, "tabulator", tabulator);

    refresh_language(gobj_read_attr(gobj, "$container"), t);
}

/************************************************************
 *   Destroy Tabulator instance
 ************************************************************/
function table__destroy(gobj)
{
    let tabulator = gobj_read_attr(gobj, "tabulator");
    if(tabulator) {
        tabulator.destroy();
        gobj_write_attr(gobj, "tabulator", null);
    }
}

/************************************************************
 *  Cell of a col holding a JSON document (dict/list/blob/
 *  template/coordinates/…): a one-line truncated preview,
 *  marked as a link because the click opens the whole value
 *  in a viewer (json_cell_click -> EV_SHOW_CELL_JSON).
 *
 *  An empty document gets no link — there is nothing to open,
 *  and json_cell_click uses its absence to ignore the click.
 *
 *  Built as a DOM node and not as an HTML string: the preview
 *  is raw record data, so it must never be parsed as markup.
 ************************************************************/
function build_json_cell_preview(value)
{
    if(value === null || value === undefined || json_size(value) === 0) {
        return "";
    }

    let text = JSON.stringify(value);
    if(text && text.length > 20) {
        text = text.substring(0, 20) + "…";
    }

    return createElement2(
        ['a', {
            class: 'JSON_CELL',
            title: t('show json'),
            'data-i18n-title': 'show json'
        }, [
            ['span', {class: 'JSON_CELL_ICON icon yi-eye'}],
            ['span', {class: 'JSON_CELL_PREVIEW'}, text]
        ]]
    );
}

/************************************************************
 *  Convert a record column value from backend to frontend
 ************************************************************/
function transform__treedb_value_2_table_value(gobj, col, value, row, field)
{
    let priv = gobj.priv;
    const field_desc = treedb_get_field_desc(col);

    switch(field_desc.type) {
        case "string":
        case "email":   // string subtype — plain text in the cell
        case "tel":     // string subtype — plain text in the cell
        case "url":     // string subtype — plain text in the cell
        case "rowid":       // the record's own key — shown as it comes
        case "qualified":   // idem, the name with its ancestors in front
            break;
        case "integer":
            break;
        case "real":
            break;
        case "boolean":
            // Handled by Tabulator's built-in "tickCross" formatter (see colDef above)
            break;
        case "object":
        case "dict":
        case "template":
        case "array":
        case "list":
        case "coordinates":
        case "blob":
        case "gbuffer":
            value = build_json_cell_preview(value);
            break;

        case "enum":
            switch(field_desc.real_type) {
                case "string":
                    break;
                case "object":
                case "dict":
                case "array":
                case "list":
                    value = JSON.stringify(value);
                    break;
            }
            break;

        case "hook":    // Convert data from backend to frontend TABLE CELL
            let items = treedb_hook_data_size(value);

            if(items > 0) {
                value = [
                    '<a class="hook_cell" ',
                    `data-row_id="${row.id}" `,
                    `data-col_id="${col.id}" > `,
                    '<span style="" class="icon yi-eye"></span>',
                    `<span>[&nbsp;<u>${items}</u>&nbsp;]</span>`,
                    '</a>'
                ].join('');
            } else {
                value = "";
            }
            break;

        case "fkey":    // Convert data from backend to frontend TABLE CELL
            let new_value = [];
            if(value) {
                if(is_string(value)) {
                    let fkey = treedb_decoder_fkey(col, value);
                    if(fkey) {
                        new_value.push(fkey.id);
                    }
                } else if(is_array(value)) {
                    for(let i=0; i<value.length; i++) {
                        let fkey = treedb_decoder_fkey(col, value[i]);
                        if(fkey) {
                            new_value.push(fkey.id);
                        }
                    }
                } else {
                    log_error("fkey type unsupported: " + JSON.stringify(value));
                }
            }

            value = new_value.join(", ");
            break;

        case "now":
        case "time":
            switch(field_desc.real_type) {
                case "string":
                case "integer":
                    value = parseInt(value) || 0;
                    value = new Date(value*1000);

                    const rawLocale = navigator.language;
                    // Playwright Firefox without locale config and some embedded
                    // webviews report navigator.language as the literal string
                    // "undefined" — would throw RangeError in Intl.DateTimeFormat.
                    const userLocale = (typeof rawLocale === "string" && rawLocale && rawLocale !== "undefined")
                        ? rawLocale
                        : undefined;
                    const opts = {
                        day: 'numeric',
                        month: 'short',   // 'long' for full month name, 'short' for abbreviated, 'narrow' for shortest
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                        hour12: true, // Use true for AM/PM or false for 24-hour format, depending on locale preference
                        // timeZoneName: 'short' // Options are 'short' or 'long'
                    };

                    const formatter = new Intl.DateTimeFormat(userLocale, opts);
                    value = '<span class="is-size-7">' + formatter.format(value) + '</span>';
                    break;
            }
            break;

        case "color":
            // Handled by Tabulator's built-in "color" formatter (see colDef above)
            break;

        case "image":
            // Handled by Tabulator's built-in "image" formatter (see colDef above)
            break;

        default:
            log_error(`transform__treedb_value_2_table_value() unhandled type '${field_desc.type}' (real_type='${field_desc.real_type}') for field '${field}', topic ${priv.topic_name}`);
            break;

    }

    // Tabulator only accepts string, number, boolean, DOM Node, null, or undefined.
    // Any other object (Array, plain {}) produces a console.warn and an empty cell.
    // This guard catches cases where the backend sends an unexpected type for a field
    // (e.g. list_dict=1 converting an unset string/enum field to []).
    if(value !== null && value !== undefined && typeof value === "object" && !(value instanceof Node)) {
        log_error(`transform__treedb_value_2_table_value() unexpected object value for field '${field}' (type='${field_desc.type}', real_type='${field_desc.real_type}'): ${JSON.stringify(value)}, topic ${priv.topic_name}`);
        value = JSON.stringify(value);
    }

    return value;
}

/************************************************************
 *  Build the form template from desc.cols: only user-editable
 *  fields reach the form — writable cols, fkeys (linkable) and
 *  the pkey (the hosted C_YUI_FORM's form_mode drives the
 *  pkey's readonly/required state).
 ************************************************************/
function build_form_template(gobj)
{
    let desc = gobj_read_attr(gobj, "desc");
    let template = [];
    for(let col of desc.cols) {
        if(!col.id || col.id.charAt(0) === '_') {
            continue;
        }
        const field_desc = treedb_get_field_desc(col);
        if(field_desc.is_hidden) {
            continue;
        }
        if(field_desc.type === "hook") {
            continue;   // hooks don't appear in forms
        }
        if(!field_desc.is_writable &&
                field_desc.type !== "fkey" && col.id !== desc.pkey) {
            continue;
        }
        template.push(col);
    }
    return template;
}

/************************************************************
 *  Collect the linkable parent rows for every fkey col:
 *  {topic_name: rows}, asked to the topics manager (parent)
 *  with the same command the old embedded form used. Collected
 *  fresh on every dialog open, so new parent rows are always
 *  offered.
 ************************************************************/
function build_fkey_options(gobj)
{
    let desc = gobj_read_attr(gobj, "desc");
    let fkey_options = {};
    for(let col of desc.cols) {
        const field_desc = treedb_get_field_desc(col);
        if(field_desc.type !== "fkey" || !is_object(col.fkey)) {
            continue;
        }
        // HACK we work only with one fkey (same as the whole stack)
        let topic_name = Object.keys(col.fkey)[0];
        if(!topic_name || fkey_options[topic_name] !== undefined) {
            continue;
        }
        let webix = gobj_command(
            gobj_parent(gobj),
            "get_topic_data",
            {topic_name: topic_name},
            gobj
        );
        fkey_options[topic_name] = (webix && is_array(webix.data))? webix.data : [];
    }
    return fkey_options;
}

/************************************************************
 *  Open the edit/create dialog hosting a C_YUI_FORM child.
 *  The child is created fresh on every open (schema and fkey
 *  options are read at its build time) and destroyed on close.
 *  Its EV_SAVE_RECORD (CHILD model) arrives already in treedb
 *  shape — see ac_form_save_record().
 ************************************************************/
function open_form_dialog(gobj, mode, record)
{
    close_form_dialog(gobj);    // only one dialog at a time

    let priv = gobj.priv;
    let desc = gobj_read_attr(gobj, "desc");
    let topic_name = gobj_read_str_attr(gobj, "topic_name");

    let shell = yui_shell_of(gobj);
    if(!shell) {
        log_error(`${gobj_short_name(gobj)}: no shell, cannot open the edit form`);
        return;
    }

    /*  Title says what you are doing: "new <topic>" on create,
     *  "<topic> — <pkey>" on update. */
    let pkey = desc.pkey || "id";
    let title;
    if(mode === "create") {
        title = t("new") + " " + t(topic_name);
    } else {
        let rid = record ? String(record[pkey] ?? "") : "";
        title = t(topic_name) + (empty_string(rid) ? "" : " — " + rid);
    }

    /*  A flex column so the hosted form takes the dialog height: fields
     *  scroll internally and the form's bottom toolbar stays visible. */
    let $body = createElement2(
        ['div', {class: 'TREEDB_FORM_BODY',
                 style: 'display:flex; flex-direction:column; height:100%;'}, []]
    );

    let form_plan = write_plan(gobj);
    let form = gobj_create_pure_child(
        "form_" + clean_name(gobj_name(gobj)),
        "C_YUI_FORM",
        {
            template:       build_form_template(gobj),
            record:         record,
            fkey_options:   build_fkey_options(gobj),
            form_mode:      mode,
            /*  A read-only topic still OPENS its form -- looking at a record
             *  is the point of a replica -- with the cells not editable and
             *  the write half of the toolbar gone. A null plan leaves the
             *  form's own default alone.  */
            ...(form_plan.form_toolbar ? {toolbar: form_plan.form_toolbar} : {}),
            /*  Editing the raw topic record: structured cols
             *  (template / table / coordinates) are raw JSON editors,
             *  not interpreted into sub-widgets (the pre-merge behaviour). */
            render_mode:    "edit",
            pkey:           desc.pkey || "id",
            topic_name:     topic_name,
            editable:       !form_plan.readonly,
            $parent:        $body
        },
        gobj
    );
    priv.form = form;

    let $form_container = gobj_read_attr(form, "$container");
    if($form_container) {
        $form_container.style.flex = "1 1 auto";
        $form_container.style.minHeight = "0";
    }

    /*  The standardized adaptive dialog, like the sibling treedb views: a
     *  centered card with the X at the top-right on desktop, a full-screen
     *  sheet with a back arrow on mobile; Escape / browser Back / backdrop
     *  are wired by the shell. `before_close` preserves the unsaved-changes
     *  guard — it vetoes the dismiss and, on confirm, closes the modal
     *  itself. `on_close` tears the hosted form child down. */
    priv.form_modal = yui_shell_show_modal(shell, $body, {
        dialog:        true,
        logical_class: "TREEDB_FORM_SHEET",
        title:         title,
        t:             t,
        before_close:  function() {
            return form_may_close(gobj);
        },
        on_close:      function() {
            teardown_form_child(gobj);
        }
    });

    gobj_start(form);           // mt_start loads `record` into the form
    refresh_language($body, t); // translate anything the form emitted on start

    /*  Focus the pkey unless the mode made it readonly (update) —
     *  then the first editable field. */
    let $with_focus = $body.querySelector('.with-focus:not([readonly])');
    if(!$with_focus) {
        $with_focus = $body.querySelector(
            'input.input:not([readonly]), textarea, select'
        );
    }
    if($with_focus) {
        $with_focus.focus();
    }
}

/************************************************************
 *  Unsaved-changes guard for the dialog's `before_close` hook.
 *  Returns true to allow the dismiss; false to VETO it (the form
 *  has pending edits) and pop the confirm — which, on "yes",
 *  closes the modal itself (EV_WINDOW_TO_CLOSE contract).
 ************************************************************/
function form_may_close(gobj)
{
    let priv = gobj.priv;
    if(priv.form) {
        let kw = {};
        gobj_send_event(priv.form, "EV_WINDOW_TO_CLOSE", kw, gobj);
        if(kw.abort_close) {
            /*  The message the FORM returned, not a copy of it. The dialog
             *  takes its message as an i18n KEY, so a second literal here is
             *  a second key to define — and the one that was here had never
             *  been defined in any locale, which renders as the English
             *  sentence itself, in every language, for ever. */
            yui_shell_confirm_yesnocancel(
                yui_shell_of(gobj),
                kw.warning || "all changes will be lost",
                {t: t, yes_label: "yes", no_label: "no", cancel_label: "cancel"}
            ).then(function(answer) {
                if(answer === "yes" && priv.form_modal) {
                    priv.form_modal.close();
                }
            });
            return false;
        }
    }
    return true;
}

/************************************************************
 *  Destroy the hosted C_YUI_FORM child. Called from the modal's
 *  on_close — the shell has already removed the dialog DOM and
 *  retired its Escape / history entries.
 ************************************************************/
function teardown_form_child(gobj)
{
    let priv = gobj.priv;
    if(priv.form) {
        if(gobj_is_running(priv.form)) {
            gobj_stop(priv.form);
        }
        gobj_destroy(priv.form);
        priv.form = null;
    }
    priv.form_modal = null;
}

/************************************************************
 *  Force the dialog down (bypasses the unsaved guard): used after a
 *  successful save and on teardown. Closing the modal runs its
 *  on_close, which tears the form child down.
 ************************************************************/
function close_form_dialog(gobj)
{
    let priv = gobj.priv;
    if(priv.form_modal) {
        let modal = priv.form_modal;
        priv.form_modal = null;
        modal.close();          // -> on_close -> teardown_form_child
        return;
    }
    teardown_form_child(gobj);
}

/************************************************************
 *  Show the topic's SCHEMA: its `desc` — pkey, cols, types,
 *  flags and fkey targets — in the standardized adaptive
 *  dialog, rendered by a C_YUI_JSON child. A viewer and not a
 *  <pre> dump because a forty-column topic is only readable
 *  collapsed and searchable.
 *
 *  Read-only and offline: the desc is already in this gobj,
 *  so no command is issued and nothing can be edited here.
 ************************************************************/
function open_schema_dialog(gobj)
{
    close_schema_dialog(gobj);      // only one at a time

    let priv = gobj.priv;

    let desc = gobj_read_attr(gobj, "desc");
    if(!desc) {
        log_error(`${gobj_short_name(gobj)}: no desc, no schema to show`);
        return;
    }

    let shell = yui_shell_of(gobj);
    if(!shell) {
        log_error(`${gobj_short_name(gobj)}: no shell, cannot open the schema view`);
        return;
    }

    let json_view = gobj_create_pure_child(
        "schema_" + clean_name(gobj_name(gobj)),
        "C_YUI_JSON",
        {
            /*  No `title`: the dialog header already titles it. The
             *  viewer's own would land inside the dialog, doubling it. */
        },
        gobj
    );
    if(!json_view) {
        log_error(`${gobj_short_name(gobj)}: cannot create the schema viewer`);
        return;
    }
    priv.schema_gobj = json_view;
    gobj_start(json_view);

    let $box = gobj_read_attr(json_view, "$container");
    if(!$box) {
        log_error(`${gobj_short_name(gobj)}: the schema viewer built no $container`);
        teardown_schema_child(gobj);
        return;
    }

    /*  Title split in two halves: the topic name is DATA (never
     *  translated) and "schema" is the kind (carries its i18n key), so
     *  the header re-translates on a language switch. */
    priv.schema_modal = yui_shell_show_modal(shell, $box, {
        dialog:        true,
        logical_class: "TREEDB_SCHEMA_SHEET",
        title_prefix:  gobj_read_str_attr(gobj, "topic_name"),
        title:         "schema",
        t:             t,
        on_close:      function() {
            teardown_schema_child(gobj);
        }
    });

    /*  EV_SET_JSON and not the `json_data` attr: the attr renders the
     *  tree but leaves the viewer in ST_IDLE, where a click to expand a
     *  node is an event nobody handles. */
    gobj_send_event(json_view, "EV_SET_JSON", {json: desc}, gobj);
}

/************************************************************
 *  Destroy the hosted C_YUI_JSON child. Called from the
 *  schema modal's on_close — the shell has already removed
 *  the dialog DOM and retired its Escape / history entries.
 ************************************************************/
function teardown_schema_child(gobj)
{
    let priv = gobj.priv;
    if(priv.schema_gobj) {
        if(gobj_is_running(priv.schema_gobj)) {
            gobj_stop(priv.schema_gobj);
        }
        gobj_destroy(priv.schema_gobj);
        priv.schema_gobj = null;
    }
    priv.schema_modal = null;
}

/************************************************************
 *  Close the schema dialog (teardown, or a second open).
 *  Closing the modal runs its on_close, which tears the
 *  viewer child down.
 ************************************************************/
function close_schema_dialog(gobj)
{
    let priv = gobj.priv;
    if(priv.schema_modal) {
        let modal = priv.schema_modal;
        priv.schema_modal = null;
        modal.close();          // -> on_close -> teardown_schema_child
        return;
    }
    teardown_schema_child(gobj);
}

/************************************************************
 *  Show the JSON document held by ONE CELL — the value of a
 *  dict/list/object/array/blob/template/coordinates col — in
 *  the standardized adaptive dialog, rendered by a C_YUI_JSON
 *  child. The cell can only show a 20-char preview; this is
 *  where the value is actually readable (collapsed, searchable).
 *
 *  Read-only and offline: the record is already in the table,
 *  so no command is issued and nothing can be edited here (the
 *  edit form remains the way to change the value).
 ************************************************************/
function open_cell_json_dialog(gobj, row_id, col_id)
{
    close_cell_json_dialog(gobj);   // only one at a time

    let priv = gobj.priv;

    let tabulator = gobj_read_attr(gobj, "tabulator");
    if(!tabulator) {
        log_error(`${gobj_short_name(gobj)}: no table, no cell to show`);
        return;
    }
    let row = tabulator.getRow(row_id);
    if(!row) {
        log_error(`${gobj_short_name(gobj)}: row '${row_id}' not found in the table`);
        return;
    }
    let value = row.getData()[col_id];
    if(value === undefined) {
        log_error(`${gobj_short_name(gobj)}: row '${row_id}' has no col '${col_id}'`);
        return;
    }

    let shell = yui_shell_of(gobj);
    if(!shell) {
        log_error(`${gobj_short_name(gobj)}: no shell, cannot open the cell json`);
        return;
    }

    let json_view = gobj_create_pure_child(
        "cell_" + clean_name(gobj_name(gobj)),
        "C_YUI_JSON",
        {
            /*  No `title`: the dialog header already titles it. */
        },
        gobj
    );
    if(!json_view) {
        log_error(`${gobj_short_name(gobj)}: cannot create the cell json viewer`);
        return;
    }
    priv.cell_json_gobj = json_view;
    gobj_start(json_view);

    let $box = gobj_read_attr(json_view, "$container");
    if(!$box) {
        log_error(`${gobj_short_name(gobj)}: the cell json viewer built no $container`);
        teardown_cell_json_child(gobj);
        return;
    }

    /*  Title split in two halves, same contract as the schema dialog: the
     *  record id is DATA (never translated) and the column carries its own
     *  i18n key — the shared `col.id` one, so the header re-translates on a
     *  language switch and reads as the raw id where the app defines no key
     *  (exactly what an untranslated column header already shows). */
    priv.cell_json_modal = yui_shell_show_modal(shell, $box, {
        dialog:        true,
        logical_class: "TREEDB_CELL_JSON_SHEET",
        title_prefix:  String(row_id),
        title:         col_id,
        t:             t,
        on_close:      function() {
            teardown_cell_json_child(gobj);
        }
    });

    /*  EV_SET_JSON and not the `json_data` attr: the attr renders the
     *  tree but leaves the viewer in ST_IDLE, where a click to expand a
     *  node is an event nobody handles. */
    gobj_send_event(json_view, "EV_SET_JSON", {json: value}, gobj);
}

/************************************************************
 *  Destroy the hosted C_YUI_JSON child. Called from the cell
 *  modal's on_close — the shell has already removed the dialog
 *  DOM and retired its Escape / history entries.
 ************************************************************/
function teardown_cell_json_child(gobj)
{
    let priv = gobj.priv;
    if(priv.cell_json_gobj) {
        if(gobj_is_running(priv.cell_json_gobj)) {
            gobj_stop(priv.cell_json_gobj);
        }
        gobj_destroy(priv.cell_json_gobj);
        priv.cell_json_gobj = null;
    }
    priv.cell_json_modal = null;
}

/************************************************************
 *  Close the cell json dialog (teardown, or a second open).
 *  Closing the modal runs its on_close, which tears the
 *  viewer child down.
 ************************************************************/
function close_cell_json_dialog(gobj)
{
    let priv = gobj.priv;
    if(priv.cell_json_modal) {
        let modal = priv.cell_json_modal;
        priv.cell_json_modal = null;
        modal.close();          // -> on_close -> teardown_cell_json_child
        return;
    }
    teardown_cell_json_child(gobj);
}

/************************************************************
 *  True if the topic's pkey col carries the "rowid" flag.
 ************************************************************/
function pkey_is_rowid(gobj)
{
    let desc = gobj_read_attr(gobj, "desc");
    let col_pkey = kwid_find_one_record(
        gobj,
        desc.cols,  // kw
        null,       // ids
        {           // jn_filter
            "id": desc.pkey
        }
    );
    if(!col_pkey) {
        return false;
    }
    return str_in_list(col_pkey.flag, "rowid");
}

/************************************************************
 *  Show the edit "update" form of a row (record)
 *  internally called from the icon edit at Op column
 ************************************************************/
function show_edit_form(gobj, row, index)
{
    /*  a rowid pkey has no "update": every save appends a new
     *  instance (timeranger semantics) — open in create mode  */
    let mode = pkey_is_rowid(gobj)? "create" : "update";
    open_form_dialog(gobj, mode, row);
}

/************************************************************
 *  Show the edit "create" form to a new record
 *  internally called from the top toolbar +New button
 ************************************************************/
function show_create_form(gobj, row)
{
    open_form_dialog(gobj, "create", row);
}

/************************************************************
 *  Return column schema of field id
 ************************************************************/
function get_schema_col(gobj, id)
{
    let desc = gobj_read_attr(gobj, "desc");
    for (let i = 0; i < desc.cols.length; i++) {
        let col = desc.cols[i];
        if(col.id === id) {
            return col;
        }
    }
    return null;
}

/************************************************************
 *  Convert from frontend to backend
 *  operation: "create" "update"
 ************************************************************/
function transform__form_record_2_treedb_record(gobj, kw, operation)
{
    let row = {};

    for(let field_name of Object.keys(kw)) {
        if(empty_string(field_name)) {
            continue;
        }
        let col = get_schema_col(gobj, field_name);
        if(col) {
            let value = kw[field_name];
            row[field_name] = transform__form_value_2_treedb_value(
                gobj, col, value, operation
            );
        }
    }
    return row;
}

/************************************************************
 *  Convert from frontend to backend
 *  operation: "create" "update"
 ************************************************************/
function transform__form_value_2_treedb_value(gobj, col, value, operation)
{
    const field_desc = treedb_get_field_desc(col);

    switch(field_desc.type) {
        case "rowid":
        case "qualified":
            /*  The store hands the key out: a rowid from the topic size, a
             *  qualified id from the parent and the name.  */
            if(operation==="create") {
                value = "";
            }
            break;

        case "string":
        case "email":
        case "password":
        case "url":
        case "image":
        case "tel":
            break;

        case "integer":
            value = parseInt(value) || 0;
            break;
        case "real":
            value = parseFloat(value)  || 0.0;
            break;
        case "boolean":
            value = parseBoolean(value);
            break;

        case "hook":    // Convert data from frontend to backend
            value = null;
            break;

        case "fkey":    // Convert data from frontend to backend
            value = build_fkey_ref(gobj, col, value);
            break;

        case "object":
        case "dict":
        case "template":
            if(is_string(value)) {
                // Come from the form
                try {
                    value = JSON.parse(value);
                } catch (e) {
                    value = {};
                }
            } else if(is_object(value)) {
                // Come from the table
            }
            if(!is_object(value)) {
                value = {};
            }
            break;
        case "array":
        case "list":
            if(is_string(value)) {
                // Come from the form
                try {
                    value = JSON.parse(value);
                } catch (e) {
                    value = [];
                }
            } else if(is_array(value)) {
                // Come from the table
            }
            if(!is_array(value)) {
                value = [];
            }
            break;
        case "coordinates":
        case "blob":
            if(is_string(value)) {
                // Come from the form
                try {
                    value = JSON.parse(value);
                } catch (e) {
                    value = {};
                }

            } else if(is_object(value)) {
                // Come from the table
            } else if(is_array(value)) {
                // Come from the table
            } else {
                value = {};
            }
            break;

        case "enum":
            switch(field_desc.real_type) {
                case "string":
                    if(is_array(value)) {
                        if(value.length > 0) {
                            value = value[0];
                        } else {
                            value = "";
                        }
                    }
                    break;
                case "object":
                case "dict":
                case "array":
                case "list":
                    break;
                default:
                    log_error("col type unknown 6: " + field_desc.real_type);
                    break;
            }
            break;

        case "now":
        case "time":
            switch(field_desc.real_type) {
                case "string":
                    if(value && is_date(value)) {
                        value = value.toISOString();
                    }
                    break;
                case "integer":
                    if(value && is_date(value)) {
                        value = (value.getTime())/1000;
                    }
                    break;
                default:
                    log_error("col type unknown 7: " + field_desc.real_type);
                    break;
            }
            break;

        case "color":
            switch(field_desc.real_type) {
                case "string":
                    // TODO
                    break;
                case "integer":
                    // TODO
                    break;
                default:
                    log_error("col type unknown 7: " + field_desc.real_type);
                    break;
            }
            break;

        default:
            log_error("col type unknown 8: " + field_desc.type);
            break;
    }

    return value;
}

/************************************************************
 *
 ************************************************************/
function fkey_in_col(col, topic_name, hook_name)
{
    let hook_name_ = col.fkey[topic_name];

    if(hook_name === hook_name_) {
        return true;
    }
    return false;
}

/************************************************************
 *
 ************************************************************/
function build_fkey_ref(gobj, col, value)
{
    let refs = null;

    switch(col.type) {
        case "string":
            break;

        case "object":
        case "dict":
            refs = {};
            break;

        case "array":
        case "list":
            refs = [];
            break;

        default:
            log_error("Merde type: " + col.type);
            return null;
    }

    if(is_array(value)) {
        for(let i=0; i<value.length; i++) {
            let v = value[i];
            if(is_string(v)) {
                // HACK we work only with one fkey
                let topic_name = Object.keys(col.fkey)[0]; // Get the first key
                let hook = col.fkey[topic_name];
                switch(col.type) {
                    case "string":
                        return topic_name + "^" + v + "^" + hook;

                    case "object":
                    case "dict":
                        refs[topic_name + "^" + v + "^" + hook] = true;
                        break;

                    case "array":
                    case "list":
                        refs.push(topic_name + "^" + v + "^" + hook);
                        break;
                }

            } else if(is_object(v)) {
                let topic_name = v.topic_name;
                let hook = v.hook_name;
                if(!fkey_in_col(col, topic_name, hook)) {
                    continue;
                }
                switch(col.type) {
                    case "string":
                        return topic_name + "^" + v.id + "^" + hook;

                    case "object":
                    case "dict":
                        refs[topic_name + "^" + v.id + "^" + hook] = true;
                        break;

                    case "array":
                    case "list":
                        refs.push(topic_name + "^" + v.id + "^" + hook);
                        break;
                }
            } else {
                log_error("Merde value1: " + v);
                return null;
            }
        }
    } else {
        log_error("Merde value2: " + value);
        return null;
    }

    return refs;
}

/***************************************************************************
 *  TODO con límite máximo o máximo height o con scroll
 *      en un gobj propio para gestionar los datos en "page"s
 *      que los hook no vengan rellenos si son muchos y que se puedan gestionar
 *      con un gobj
 ***************************************************************************/
function show_dropdown_popup_menu(gobj, x, y, items, callback)
{
    let $element = createElement2([
        'div', {class: 'dropdown popup' }, [
            ['div', {
                    class: 'dropdown-menu', role: 'menu', style: 'min-width:4rem; border: 2px solid var(--bulma-border); padding: 0px;'
                }, [
                ['div', { class: 'dropdown-content', style: 'padding: 0;' }, []]
            ]]
        ], {
            'click': (evt) => {
                evt.stopPropagation();
                destroyModal();
                if(callback) {
                    callback(evt);
                }
            }
        }
    ]);

    const destroyModal = () => {
        $element.classList.remove('is-active');
        $element.parentNode.removeChild($element);
    };

    let $dropdown_content = $element.querySelector('.dropdown-content');

    let ids = kwid_get_ids(gobj, items);
    for(let id of ids) {
        let $item = createElement2(
            ['a', {class: 'dropdown-item flex-horizontal-section', 'data-value':`${id}`, style:'margin:0px;'}, [
                ['span', {i18n: `${id}`}, `${id}`]
            ], {
                'click': (evt) => {
                    evt.stopPropagation();
                    destroyModal();
                    if(callback) {
                        callback(evt, this.dataset.value);
                    }
                }
            }]
        );
        $dropdown_content.appendChild($item);
    }

    refresh_language($element, t);

    /*
     *  Add to popup layer
     */
    popup_mount_layer(gobj).appendChild($element);

    /*
     *  Set position
     */
    $element.style.position = "absolute";
    $element.style.top = y + "px";
    $element.style.left = x + "px";

    /*
     *  Show
     */
    $element.classList.add('is-active');

    /*
     *  Set focus
     */
    let $with_focus = $element.querySelector('.with-focus');
    if($with_focus) {
        $with_focus.focus();
    }
}




/***************************************************************
 *  A read-only topic refuses the write EVENTS too, not only their
 *  buttons. The buttons are gone, but an event can still arrive: a
 *  keyboard path, a hosted form that outlived the flag, a caller that
 *  sends EV_SAVE_RECORD itself. Refusing here is what makes `readonly`
 *  a state of the gclass rather than a way of drawing it -- and it
 *  fails LOUDLY, because an ignored write is how the backend used to
 *  behave and what this whole change exists to stop.
 ***************************************************************/
function write_plan(gobj)
{
    return plan_treedb_writes({
        readonly:               gobj_read_bool_attr(gobj, "readonly"),
        with_edition_mode:      gobj_read_bool_attr(gobj, "with_edition_mode"),
        with_new_button:        gobj_read_bool_attr(gobj, "with_new_button"),
        with_delete_button:     gobj_read_bool_attr(gobj, "with_delete_button"),
        with_paste_button:      gobj_read_bool_attr(gobj, "with_paste_button"),
        with_in_row_edit_icons: gobj_read_bool_attr(gobj, "with_in_row_edit_icons")
    });
}

/***************************************************************
 *  A read-only topic refuses the write EVENTS too, not only their
 *  buttons.
 ***************************************************************/
function refuse_if_readonly(gobj, event)
{
    if(!gobj_read_bool_attr(gobj, "readonly")) {
        return false;
    }
    log_error(`${gobj_short_name(gobj)}: ${event} refused, topic ` +
        `'${gobj_read_str_attr(gobj, "topic_name")}' is READ-ONLY`);
    return true;
}


                    /***************************
                     *      Actions
                     ***************************/




/************************************************************
 *  From external, at the beginning, load all topic data
 ************************************************************/
/***************************************************************
 *  The language changed (the shell publishes it after the app switched).
 *
 *  The column headers carry their key (col_label's title formatter emits a
 *  data-i18n span), so refresh_language() has already re-translated them.
 *  What it cannot reach is what TABULATOR itself renders: its paginator, its
 *  placeholder, its loading/error notices — drawn once, from its own lang
 *  dict. Re-apply it in the new language.
 ***************************************************************/
function ac_language_changed(gobj, event, kw, src)
{
    let tabulator = gobj_read_attr(gobj, "tabulator");
    if(!tabulator) {
        return 0;
    }
    yui_tabulator_relocalize(tabulator, t);
    try {
        tabulator.options.placeholder =
            t("no data available", {defaultValue: "No data available"});
        /*  Re-setting the locale makes Tabulator re-run the title formatter on
         *  the EXISTING header cell, which APPENDS its span to the one already
         *  there ("Device GroupDevice Group"). Rebuilding the columns from
         *  their own definitions renders each header once, from scratch.  */
        tabulator.setColumns(tabulator.getColumnDefinitions());
    } catch(e) {
        log_error(`${gobj_short_name(gobj)}: cannot re-render the table: ${e}`);
        return -1;
    }
    return 0;
}

function ac_load_nodes(gobj, event, kw, src)
{
    let data = kw;
    if(!is_array(data)) {
        log_error("ac_load_nodes(): FormTable, data MUST be an array");
        trace_msg(data);
        return -1;
    }

    let tabulator = gobj_read_attr(gobj, "tabulator");
    if(tabulator) {
        /*
         *  setData: Load data into the table. The old rows will be removed.
         *  Guard: defer until tableBuilt fires if Tabulator isn't ready yet.
         */
        if(tabulator._ready) {
            tabulator.setData(data);
        } else {
            tabulator._pendingData = data;
        }
    }

    /*
     *  TODO situate en el row updated ???
     *  Select only if it has update/create mode
     */
    // if(data.length == 1) {
    //     if(!with_webix_id) {
    //         gobj_send_event(gobj, "EV_RECORD_BY_ID", {id:data[0].id}, gobj);
    //     } else {
    //         gobj_send_event(gobj, "EV_FIRST_RECORD", {}, gobj);
    //     }
    // } else if(data.length > 1) {
    //     if(last_selected_id) {
    //         gobj_send_event(gobj, "EV_RECORD_BY_ID", {id:last_selected_id.id}, gobj);
    //     } else {
    //         gobj_send_event(gobj, "EV_FIRST_RECORD", {}, gobj);
    //     }
    // }

    return 0;
}

/************************************************************
 *  From external, load node created
 ************************************************************/
function ac_load_node_created(gobj, event, kw, src)
{
    let data = kw;
    if(!is_array(data)) {
        log_error("ac_load_node_created(): FormTable, data MUST be an array");
        trace_msg(data);
        return -1;
    }

    let tabulator = gobj_read_attr(gobj, "tabulator");
    if(tabulator) {
        for(let record of data) {
            tabulator.addData([record]); // Add a new row to table
        }
    }

    /*
     *  TODO situate en el row updated ???
     *  Select only if it has update/create mode
     */

    return 0;
}

/************************************************************
 *  From external, load node updated
 ************************************************************/
function ac_load_node_updated(gobj, event, kw, src)
{
    let data = kw;
    if(!is_array(data)) {
        log_error("ac_load_node_updated(): FormTable, data MUST be an array");
        trace_msg(data);
        return -1;
    }

    let tabulator = gobj_read_attr(gobj, "tabulator");
    if(tabulator) {
        for(let record of data) {
            /*
             *  updateData() REJECTS the promise on a row it cannot find and
             *  nobody awaits it, so the rejection surfaces as an unhandled
             *  "Update Error - Unable to find row" that names neither the
             *  gclass nor the topic. Ask first, like ac_node_deleted does.
             *
             *  A table nobody has opened holds NO rows, and a node event for
             *  it is not news: its rows are read when the topic is shown. A
             *  row missing from a table that IS loaded is.
             */
            if(tabulator.getRow(record.id)) {
                tabulator.updateData([record]);
            } else if(tabulator.getDataCount() > 0) {
                log_error(`${gobj_short_name(gobj)}: updated node is not in ` +
                    `the loaded table: ${record.id}`);
            }
        }
    }

    /*
     *  TODO situate en el row updated ???
     *  Select only if it has update/create mode
     */

    return 0;
}

/************************************************************
 *  From external
 ************************************************************/
function ac_node_deleted(gobj, event, kw, src)
{
    let data = kw;
    if(!is_array(data)) {
        log_error("ac_node_deleted(): FormTable, data MUST be an array");
        trace_msg(data);
        return -1;
    }

    let tabulator = gobj_read_attr(gobj, "tabulator");
    //tabulator.deselectRow(); // unselectAll TODO ??? is necessary?

    if(tabulator) {
        for(let record of data) {
            const row = tabulator.getRow(record.id);
            if(row) {
                // Delete the row by pkey value
                tabulator.deleteRow(record.id);
            } else {
                log_error("delete_data: record not found: " + record.id);
            }
        }
    }

    return 0;
}

/************************************************************
 *  General Edit button clicked:
 *  Set/Reset edition mode
 *      In edition mode the general New/Delete buttons are activated,
 *      and the Op column is visible (with row's edit/delete icons)
 ************************************************************/
function ac_edition_mode(gobj, event, kw, src)
{
    if(refuse_if_readonly(gobj, event)) {
        return -1;      /*  Error already logged  */
    }
    let tabulator = gobj_read_attr(gobj, "tabulator");

    /*
     *  Set button states according to editable state
     */
    let editable = gobj_read_bool_attr(gobj, "editable");
    editable = !editable;
    gobj_write_bool_attr(gobj, "editable", editable);

    let $container = gobj_read_attr(gobj, "$container");
    let $button_edit_record = $container.querySelector(`.button-edit-record`);
    let $button_new_record = $container.querySelector(`.button-new-record`);
    let $button_delete_record = $container.querySelector(`.button-delete-record`);
    let $button_copy_record = $container.querySelector(`.button-copy-record`);
    let $button_paste_record = $container.querySelector(`.button-paste-record`);

    if(editable) {
        /*
         *  Set edition mode
         */
        $button_edit_record.classList.add('is-primary');
        $button_new_record.classList.add('is-info');
        $button_delete_record.classList.add('is-danger');

        tabulator.showColumn('_operation');
        tabulator.showColumn('_check_box_state_');

        $button_new_record.removeAttribute("disabled");
        $button_paste_record.removeAttribute("disabled");

        let rows = tabulator.getSelectedData();
        if (rows.length) {
            $button_delete_record.removeAttribute("disabled");
            $button_copy_record.removeAttribute("disabled");
        }

    } else {
        /*
         *  Remove edition mode
         */
        $button_edit_record.classList.remove('is-primary');
        $button_new_record.classList.remove('is-info');
        $button_delete_record.classList.remove('is-danger');

        tabulator.hideColumn('_operation');
        tabulator.hideColumn('_check_box_state_');

        $button_new_record.setAttribute("disabled", true);
        $button_delete_record.setAttribute("disabled", true);
        $button_copy_record.setAttribute("disabled", true);
        $button_paste_record.setAttribute("disabled", true);
    }

    return 0;
}

/************************************************************
 *  From internal
 *  From general top toolbar "New" button
 *  FLow:
 *      - the form will create a new record and save it to the backend,
 *      - the backend will broadcast the new record that will be added to table
 ************************************************************/
function ac_new_row(gobj, event, kw, src)
{
    if(refuse_if_readonly(gobj, event)) {
        return -1;      /*  Error already logged  */
    }
    /*
     *  Build default values. TODO no debería estar en desc configuration?
     */
    let row = {};
    let desc = gobj_read_attr(gobj, "desc");
    for (let i = 0; i < desc.cols.length; i++) {
        let col = desc.cols[i];
        if(!col.id || col.id[0]==='_') {
            continue;
        }

        const field_desc = treedb_get_field_desc(col);
        switch(field_desc.type) {
            case "now":
                row[col.id] =  Math.floor(Date.now() / 1000);
                break;
            case "template":
                if(col.template) {
                    row[col.id] = col.template;
                }
                break;
            default:
                if(field_desc.default_value !== undefined) {
                    row[col.id] = field_desc.default_value;
                }
                break;
        }
    }

    show_create_form(gobj, row);

    return 0;
}

/************************************************************
 *  From internal
 *  - From the general top toolbar "Delete" button
 *      It will use the selected rows to delete them
 *          kw {} empty
 *  - From the column _operation delete icon inside a row
 *      It will delete this one row
 *          kw {index:, row:}
 ************************************************************/
function ac_delete_rows(gobj, event, kw, src)
{
    if(refuse_if_readonly(gobj, event)) {
        return -1;      /*  Error already logged  */
    }
    let tabulator = gobj_read_attr(gobj, "tabulator");

    if(json_size(kw) === 0) {
        /*----------------------------*
         *  Delete selected rows
         *----------------------------*/
        let rows = tabulator.getSelectedData();
        if (!rows.length) {
            yui_shell_confirm_ok(
                yui_shell_of(gobj), 'please select some row',
                {t: t, ok_label: "accept"}
            );
            return 0;
        }

        yui_shell_confirm_yesnocancel(
            yui_shell_of(gobj), 'are you sure',
            {t: t, yes_label: "yes", no_label: "no", cancel_label: "cancel"}
        ).then(function(answer) {
            if(answer === "yes") {
                for(let row of rows) {
                    // TODO why don't send once EV_DELETE_RECORD(S)
                    gobj_publish_event(
                        gobj,
                        "EV_DELETE_RECORD",
                        {
                            topic_name: gobj_read_str_attr(gobj, "topic_name"),
                            record: row
                        }
                    );
                }
            }
        });

    } else {
        /*----------------------------*
         *  Delete one row
         *  {index: , row: }
         *----------------------------*/
        yui_shell_confirm_yesnocancel(
            yui_shell_of(gobj), 'are you sure',
            {t: t, yes_label: "yes", no_label: "no", cancel_label: "cancel"}
        ).then(function(answer) {
            if(answer === "yes") {
                gobj_publish_event(
                    gobj,
                    "EV_DELETE_RECORD",
                    {
                        topic_name: gobj_read_str_attr(gobj, "topic_name"),
                        record: kw.row
                    }
                );
            }
        });
    }

    return 0;
}

/************************************************************
 *  From internal
 ************************************************************/
function ac_copy_rows(gobj, event, kw, src)
{
    let tabulator = gobj_read_attr(gobj, "tabulator");

    /*----------------------------*
     *  Copy selected rows
     *----------------------------*/
    let rows = tabulator.getSelectedData();
    if (!rows.length) {
        yui_shell_confirm_ok(
            yui_shell_of(gobj), 'please select some row',
            {t: t, ok_label: "accept"}
        );
        return 0;
    }

    let copy_rows = [];
    for(let row of rows) {
        let new_row = transform__form_record_2_treedb_record(gobj, row, "create");
        copy_rows.push(new_row);
    }

    let data = {
        treedb_name: gobj_read_str_attr(gobj, "treedb_name"),
        topic_name: gobj_read_str_attr(gobj, "topic_name"),
        rows: copy_rows
    };
    navigator.clipboard.writeText(JSON.stringify(data));

    return 0;
}

/************************************************************
 *  From internal
 ************************************************************/
function ac_paste_rows(gobj, event, kw, src)
{
    if(refuse_if_readonly(gobj, event)) {
        return -1;      /*  Error already logged  */
    }
    /*----------------------------*
     *  Paste rows
     *----------------------------*/
    if(kw.topic_name === gobj_read_str_attr(gobj, "topic_name") &&
            kw.treedb_name === gobj_read_str_attr(gobj, "treedb_name")) {
        for(let row of kw.rows) {
            gobj_publish_event(
                gobj,
                "EV_CREATE_RECORD",
                {
                    topic_name: gobj_read_str_attr(gobj, "topic_name"),
                    record: row
                }
            );
        }
    }

    return 0;
}

/************************************************************
 *  EV_SAVE_RECORD from the hosted C_YUI_FORM: kw is the
 *  record already in treedb shape (the form itself encodes
 *  fkeys, times and numbers). Route by the form's mode.
 ************************************************************/
function ac_form_save_record(gobj, event, kw, src)
{
    if(refuse_if_readonly(gobj, event)) {
        return -1;      /*  Error already logged  */
    }
    let mode = gobj_read_str_attr(src, "form_mode");
    gobj_publish_event(
        gobj,
        (mode === "create")? "EV_CREATE_RECORD" : "EV_UPDATE_RECORD",
        {
            topic_name: gobj_read_str_attr(gobj, "topic_name"),
            record: kw
        }
    );

    /*  we are INSIDE the form's gobj_publish_event stack — never
     *  destroy the publisher synchronously from a subscriber
     *  callback: defer the close  */
    setTimeout(function() {
        close_form_dialog(gobj);
    }, 0);

    return 0;
}

/************************************************************
 *  { rows: [row] }
 ************************************************************/
function ac_select_rows(gobj, event, kw, src)
{
    let tabulator = gobj_read_attr(gobj, "tabulator");
    let $container = gobj_read_attr(gobj, "$container");

    /*
     *  Update button DELETE, only enable if some row is selected
     */
    let $button_delete_record = $container.querySelector(`.button-delete-record`);
    let $button_copy_record = $container.querySelector(`.button-copy-record`);
    if($button_delete_record) {
        let selectedRows = tabulator.getSelectedData();
        if (selectedRows.length && gobj_read_bool_attr(gobj, "editable")) {
            $button_delete_record.removeAttribute("disabled");
            $button_copy_record.removeAttribute("disabled");
        } else {
            $button_delete_record.setAttribute("disabled", true);
            $button_copy_record.setAttribute("disabled", true);
        }
    }

    if(gobj_read_bool_attr(gobj, "broadcast_select_rows_event")) {
        gobj_publish_event(gobj, event, kw);
    }

    return 0;
}

/************************************************************
 *  { rows: [row] }
 ************************************************************/
function ac_unselect_rows(gobj, event, kw, src)
{
    let tabulator = gobj_read_attr(gobj, "tabulator");
    let $container = gobj_read_attr(gobj, "$container");

    /*
     *  Update button DELETE, only enable if some row is selected
     */
    let $button_delete_record = $container.querySelector(`.button-delete-record`);
    let $button_copy_record = $container.querySelector(`.button-copy-record`);
    if($button_delete_record) {
        let selectedRows = tabulator.getSelectedData();
        if (selectedRows.length && gobj_read_bool_attr(gobj, "editable")) {
            $button_delete_record.removeAttribute("disabled");
            $button_copy_record.removeAttribute("disabled");
        } else {
            $button_delete_record.setAttribute("disabled", true);
            $button_copy_record.setAttribute("disabled", true);
        }
    }

    // WARNING with radio, there is no unselect event.
    if(gobj_read_bool_attr(gobj, "broadcast_select_rows_event")) {
        gobj_publish_event(gobj, event, kw);
    }

    return 0;
}

/************************************************************
 *  { locale: "es" }
 ************************************************************/
function ac_change_locale(gobj, event, kw, src)
{
    return 0;
}

/************************************************************
 *   let kw_hook = {
 *      treedb_name:
 *      topic_name:
 *      row_id:
 *      col_id:
 *      click_x:
 *      click_y:
 *  };
 ************************************************************/
function ac_show_hook_data(gobj, event, kw, src)
{
    let webix = gobj_command(gobj_parent(gobj), "get_topic_data", kw, gobj);

    let row = kwid_find_one_record(gobj, webix.data, kw.row_id, null);
    if(row) {
        let cell = row[kw.col_id];
        /*
         *  WARNING TODO hooks can have millions of kids
         */
        show_dropdown_popup_menu(gobj, kw.click_x, kw.click_y, cell);
    }

    return 0;
}

/************************************************************
 *
 ************************************************************/
function ac_refresh(gobj, event, kw, src)
{
    gobj_publish_event(
        gobj,
        "EV_REFRESH_TOPIC",
        {
            topic_name: gobj_read_str_attr(gobj, "topic_name")
        }
    );

    return 0;
}

/************************************************************
 *  Show the JSON document of one cell
 *  {
 *      row_id:
 *      col_id:
 *  }
 ************************************************************/
function ac_show_cell_json(gobj, event, kw, src)
{
    open_cell_json_dialog(gobj, kw.row_id, kw.col_id);

    return 0;
}

/************************************************************
 *  One cell of one record changed. Publish it UP as a field write;
 *  the host owns the treedb command and its options.
 ************************************************************/
function ac_cell_edited(gobj, event, kw, src)
{
    if(refuse_if_readonly(gobj, event)) {
        return -1;      /*  Error already logged  */
    }
    gobj_publish_event(
        gobj,
        "EV_UPDATE_FIELD",
        {
            topic_name: gobj_read_str_attr(gobj, "topic_name"),
            id:         kw.id,
            field:      kw.field,
            value:      kw.value
        }
    );
    return 0;
}

/************************************************************
 *  Show the schema (desc) of this topic
 ************************************************************/
function ac_show_schema(gobj, event, kw, src)
{
    open_schema_dialog(gobj);

    return 0;
}

/************************************************************
 *  Ask the host for one page and park the promise Tabulator wants.
 *
 *  The transport belongs to the HOST, so the request goes up as an event
 *  and the answer comes back down as one; what lives here is only the
 *  promise, keyed by a correlation id the host echoes.
 *
 *  Rejected right away when there is nobody to ask: a request that can
 *  never be answered would leave the table spinning for ever and leak
 *  one entry per attempt. Same for the watchdog — the link can stay up
 *  and the answer still never land.
 ************************************************************/
const PAGE_TIMEOUT_MS = 20000;

function request_page(gobj, page, size)
{
    let priv = gobj.priv;

    return new Promise(function(resolve, reject) {
        if(!priv._pending_pages) {
            priv._pending_pages = {};
        }
        let req_id = `p${++priv._page_seq}`;

        let timer = window.setTimeout(function() {
            gobj_send_event(gobj, "EV_PAGE_TIMEOUT", {req_id: req_id}, gobj);
        }, PAGE_TIMEOUT_MS);

        priv._pending_pages[req_id] = {resolve: resolve, reject: reject, timer: timer};

        gobj_publish_event(
            gobj,
            "EV_REQUEST_PAGE",
            {
                topic_name: gobj_read_str_attr(gobj, "topic_name"),
                req_id:     req_id,
                from:       (page - 1) * size + 1,   /*  `nodes` counts from 1  */
                limit:      size
            }
        );
    });
}

/************************************************************
 *  Settle a parked page request, however it ended.
 ************************************************************/
function settle_page(gobj, req_id, value, error)
{
    let priv = gobj.priv;
    let pend = priv._pending_pages? priv._pending_pages[req_id] : null;
    if(!pend) {
        return;     /*  already settled: a late answer after a timeout  */
    }
    delete priv._pending_pages[req_id];
    if(pend.timer) {
        window.clearTimeout(pend.timer);
    }
    if(error) {
        pend.reject(new Error(error));
        return;
    }
    pend.resolve(value);
}

/************************************************************
 *  Pull the current page again. `replaceData()` re-runs
 *  ajaxRequestFunc for the page the reader is on, so a refresh keeps
 *  their position instead of throwing them back to the first page.
 ************************************************************/
function ac_repull_page(gobj, event, kw, src)
{
    let tabulator = gobj_read_attr(gobj, "tabulator");
    if(!tabulator) {
        return 0;
    }
    try {
        tabulator.replaceData();
    } catch(e) {
        log_error(`${gobj_short_name(gobj)}: cannot re-pull the page: ${e}`);
        return -1;
    }
    return 0;
}

/************************************************************
 *  The host answered a page.
 ************************************************************/
function ac_page_loaded(gobj, event, kw, src)
{
    settle_page(gobj, kw.req_id, {
        data:      is_array(kw.rows)? kw.rows : [],
        last_page: kw.pages || 1,
        last_row:  (typeof kw.total === "number")? kw.total : 0
    }, null);
    return 0;
}

/************************************************************
 *  The host could not answer it.
 ************************************************************/
function ac_page_failed(gobj, event, kw, src)
{
    let why = (kw && kw.error) || "page request failed";
    log_error(`${gobj_short_name(gobj)}: ${why}`);
    settle_page(gobj, kw.req_id, null, why);
    return 0;
}

/************************************************************
 *  Nobody answered in time.
 ************************************************************/
function ac_page_timeout(gobj, event, kw, src)
{
    log_error(`${gobj_short_name(gobj)}: no answer for page request ` +
              `'${kw.req_id}' in ${PAGE_TIMEOUT_MS}ms`);
    settle_page(gobj, kw.req_id, null, "page request timed out");
    return 0;
}

/************************************************************
 *  Filter the loaded rows by a term matched against every non-internal
 *  field. `clearFilter()` with no argument drops only THIS filter: the
 *  per-column header filters are a separate layer and survive, so a
 *  cleared search box does not silently undo them.
 ************************************************************/
function ac_search(gobj, event, kw, src)
{
    let tabulator = gobj_read_attr(gobj, "tabulator");
    if(!tabulator) {
        log_error(`${gobj_short_name(gobj)}: no table to search`);
        return -1;
    }

    let term = ((kw && kw.text) || "").toLowerCase();
    if(!term) {
        tabulator.clearFilter();
        return 0;
    }

    tabulator.setFilter(function(data) {
        return Object.entries(data).some(([key, val]) => {
            if(key.startsWith('_')) {
                return false;
            }
            if(val === null || val === undefined) {
                return false;
            }
            return String(val).toLowerCase().includes(term);
        });
    });

    return 0;
}

/************************************************************
 *  Which columns the table shows: one checkbox per column, the current
 *  visibility ticked. The internal columns (`_check_box_state_`,
 *  `_operation`) are not offered — they are chrome, not data.
 ************************************************************/
function ac_open_columns(gobj, event, kw, src)
{
    let tabulator = gobj_read_attr(gobj, "tabulator");
    if(!tabulator) {
        log_error(`${gobj_short_name(gobj)}: no table, no columns to choose`);
        return -1;
    }

    let shell = yui_shell_of(gobj);
    if(!shell) {
        log_error(`${gobj_short_name(gobj)}: no shell, cannot open the column chooser`);
        return -1;
    }

    let $list = createElement2(['div', {class: 'TREEDB_COLUMNS_LIST'}]);
    let columns = tabulator.getColumns();
    for(let i = 0; i < columns.length; i++) {
        let column = columns[i];
        let field = column.getField();
        if(!field || field[0] === '_') {
            continue;
        }
        let $cb = createElement2(['input', {type: 'checkbox', class: 'mr-2'}]);
        $cb.checked = column.isVisible();
        $cb.addEventListener('change', () => {
            gobj_send_event(
                gobj,
                "EV_TOGGLE_COLUMN",
                {field: field, visible: $cb.checked},
                gobj
            );
        });
        $list.appendChild(createElement2(
            ['label', {class: 'checkbox is-block mb-1 TREEDB_COLUMN_ITEM'}, [
                $cb,
                ['span', {class: 'ml-2'}, column.getDefinition().title || field]
            ]]
        ));
    }

    yui_shell_show_modal(shell, $list, {
        dialog:        true,
        logical_class: "TREEDB_COLUMNS_DIALOG",
        title_prefix:  gobj_read_str_attr(gobj, "topic_name"),
        title:         "columns",
        t:             t
    });

    return 0;
}

/************************************************************
 *  Show / hide one column.
 ************************************************************/
function ac_toggle_column(gobj, event, kw, src)
{
    let tabulator = gobj_read_attr(gobj, "tabulator");
    let field = (kw && kw.field) || "";
    if(!tabulator || !field) {
        log_error(`${gobj_short_name(gobj)}: no column '${field}' to toggle`);
        return -1;
    }

    try {
        if(kw.visible) {
            tabulator.showColumn(field);
        } else {
            tabulator.hideColumn(field);
        }
    } catch(e) {
        log_error(`${gobj_short_name(gobj)}: cannot toggle column '${field}': ${e}`);
        return -1;
    }

    return 0;
}

/************************************************************
 *  Download what the table HOLDS as CSV: the loaded rows, the visible
 *  columns, search and header filters applied — which is what the reader
 *  is looking at. Not the topic: a server-side dump of every node is not
 *  something this view can stream.
 ************************************************************/
function ac_export_table(gobj, event, kw, src)
{
    let tabulator = gobj_read_attr(gobj, "tabulator");
    if(!tabulator) {
        log_error(`${gobj_short_name(gobj)}: no table to export`);
        return -1;
    }

    let name = `${gobj_read_str_attr(gobj, "treedb_name")}-` +
               `${gobj_read_str_attr(gobj, "topic_name")}.csv`;
    name = name.replace(/[^\w.\-]+/g, "_");

    try {
        tabulator.download("csv", name);
    } catch(e) {
        log_error(`${gobj_short_name(gobj)}: CSV export failed: ${e}`);
        return -1;
    }

    return 0;
}

/************************************************************
 *  {
 *      href: href
 *  }
 ************************************************************/
function ac_show(gobj, event, kw, src)
{
    let href = kw.href;

    return 0;
}

/************************************************************
 *
 ************************************************************/
function ac_hide(gobj, event, kw, src)
{
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
            ["EV_LANGUAGE_CHANGED",     ac_language_changed,   null],
            ["EV_LOAD_NODES",           ac_load_nodes,         null],
            ["EV_LOAD_NODE_CREATED",    ac_load_node_created,  null],
            ["EV_LOAD_NODE_UPDATED",    ac_load_node_updated,  null],
            ["EV_NODE_DELETED",         ac_node_deleted,       null],

            ["EV_EDITION_MODE",         ac_edition_mode,       null],
            ["EV_SAVE_RECORD",          ac_form_save_record,   null],

            ["EV_NEW_ROW",              ac_new_row,            null],
            ["EV_DELETE_ROWS",          ac_delete_rows,        null],
            ["EV_SELECT_ROWS",          ac_select_rows,        null],
            ["EV_UNSELECT_ROWS",        ac_unselect_rows,      null],
            ["EV_COPY_ROWS",            ac_copy_rows,          null],
            ["EV_PASTE_ROWS",           ac_paste_rows,         null],
            ["EV_SHOW_HOOK_DATA",       ac_show_hook_data,     null],
            ["EV_SHOW_CELL_JSON",       ac_show_cell_json,     null],
            ["EV_CHANGE_LOCALE",        ac_change_locale,      null],
            ["EV_REFRESH",              ac_refresh,            null],
            ["EV_SHOW_SCHEMA",          ac_show_schema,        null],
            ["EV_CELL_EDITED",          ac_cell_edited,        null],
            ["EV_REPULL_PAGE",          ac_repull_page,        null],
            ["EV_PAGE_LOADED",          ac_page_loaded,        null],
            ["EV_PAGE_FAILED",          ac_page_failed,        null],
            ["EV_PAGE_TIMEOUT",         ac_page_timeout,       null],
            ["EV_SEARCH",               ac_search,             null],
            ["EV_OPEN_COLUMNS",         ac_open_columns,       null],
            ["EV_TOGGLE_COLUMN",        ac_toggle_column,      null],
            ["EV_EXPORT_TABLE",         ac_export_table,       null],
            ["EV_SHOW",                 ac_show,               null],
            ["EV_HIDE",                 ac_hide,               null]
        ]]
    ];

    /*---------------------------------------------*
     *          Events
     *---------------------------------------------*/
    const event_types = [
        ["EV_LANGUAGE_CHANGED",     0],
        ["EV_LOAD_NODES",           0],
        ["EV_LOAD_NODE_CREATED",    0],
        ["EV_LOAD_NODE_UPDATED",    0],
        ["EV_NODE_DELETED",         0],

        ["EV_EDITION_MODE",         0],
        ["EV_SAVE_RECORD",          0],
        ["EV_NEW_ROW",              0],
        ["EV_DELETE_ROWS",          0],
        ["EV_COPY_ROWS",            0],
        ["EV_PASTE_ROWS",           0],
        ["EV_SELECT_ROWS",          event_flag_t.EVF_OUTPUT_EVENT],
        ["EV_UNSELECT_ROWS",        event_flag_t.EVF_OUTPUT_EVENT],
        ["EV_SHOW_HOOK_DATA",       event_flag_t.EVF_OUTPUT_EVENT],
        ["EV_SHOW_CELL_JSON",       0],
        ["EV_CHANGE_LOCALE",        0],
        ["EV_REFRESH",              0],
        ["EV_SHOW_SCHEMA",          0],
        ["EV_CELL_EDITED",          0],
        ["EV_REPULL_PAGE",          0],
        ["EV_PAGE_LOADED",          0],
        ["EV_PAGE_FAILED",          0],
        ["EV_PAGE_TIMEOUT",         0],
        ["EV_UPDATE_FIELD",         event_flag_t.EVF_OUTPUT_EVENT],
        ["EV_REQUEST_PAGE",         event_flag_t.EVF_OUTPUT_EVENT],
        ["EV_SEARCH",               0],
        ["EV_OPEN_COLUMNS",         0],
        ["EV_TOGGLE_COLUMN",        0],
        ["EV_EXPORT_TABLE",         0],

        ["EV_CREATE_RECORD",        event_flag_t.EVF_OUTPUT_EVENT],
        ["EV_UPDATE_RECORD",        event_flag_t.EVF_OUTPUT_EVENT],
        ["EV_DELETE_RECORD",        event_flag_t.EVF_OUTPUT_EVENT],
        ["EV_REFRESH_TOPIC",        event_flag_t.EVF_OUTPUT_EVENT],

        ["EV_SHOW",                 0],
        ["EV_HIDE",                 0]
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
function register_c_yui_treedb_topic_with_form()
{
    /*  the edit/create dialog hosts a C_YUI_FORM child: make sure
     *  its gclass exists even if the app didn't register it  */
    if(!gclass_find_by_name("C_YUI_FORM", false)) {
        register_c_yui_form();
    }
    /*  same for the schema dialog's C_YUI_JSON viewer  */
    if(!gclass_find_by_name("C_YUI_JSON", false)) {
        register_c_yui_json();
    }
    return create_gclass(GCLASS_NAME);
}

export { register_c_yui_treedb_topic_with_form };
