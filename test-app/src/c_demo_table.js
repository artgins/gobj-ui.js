/***********************************************************************
 *          c_demo_table.js
 *
 *      C_DEMO_TABLE — a data-table view for the layouts demo. Mounts a
 *      real Tabulator with static rows, mirroring how the yunos build
 *      tables (a Tabulator instance owned by a view gobj, e.g.
 *      gui_agent's C_NODES). Shows sortable columns, a couple of
 *      formatters and row selection — no backend, the data is inline.
 *
 *      Tabulator must be created in mt_start (not mt_create): the shell
 *      appends the view's $container to the stage and only then calls
 *      gobj_start, so the mount node is in the document by mt_start.
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
    gobj_name,
    createElement2,
} from "@yuneta/gobj-js";

import {TabulatorFull as Tabulator} from "tabulator-tables";
import "tabulator-tables/dist/css/tabulator.min.css";
import "tabulator-tables/dist/css/tabulator_bulma.css";
import "@yuneta/gobj-ui/src/tabulator.css";   // shared theme fixes (dark, active row)


/***************************************************************
 *              Constants
 ***************************************************************/
const GCLASS_NAME = "C_DEMO_TABLE";

let __instance_counter__ = 0;

/*  Inline sample data — pretend these are managed yunos on a node. */
const SAMPLE_ROWS = [
    {id: 1, role: "mqtt_broker",   name: "broker^main",    version: "7.7.2", cpu: 3,  status: "running"},
    {id: 2, role: "yuno_agent",    name: "agent^local",    version: "7.7.2", cpu: 1,  status: "running"},
    {id: 3, role: "emailsender",   name: "email^out",      version: "7.6.7", cpu: 0,  status: "stopped"},
    {id: 4, role: "treedb",        name: "treedb^graph",   version: "7.7.2", cpu: 2,  status: "running"},
    {id: 5, role: "prot_http_sr",  name: "http^public",    version: "7.7.1", cpu: 5,  status: "running"},
    {id: 6, role: "logcenter",     name: "logs^central",   version: "7.5.13", cpu: 0, status: "paused"},
];


/***************************************************************
 *              Attrs
 ***************************************************************/
const attrs_table = [
SDATA(data_type_t.DTP_POINTER,  "subscriber",   0,  null,   "Subscriber of output events"),

SDATA(data_type_t.DTP_STRING,   "title",        0,  "Table", "Card title"),
SDATA(data_type_t.DTP_STRING,   "lead",         0,  "",      "Explanatory paragraph"),
SDATA(data_type_t.DTP_POINTER,  "$container",   0,  null,    "Root HTMLElement (shell contract)"),
SDATA_END()
];

let PRIVATE_DATA = {
    table_id:  "",
    tabulator: null,
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

    priv.table_id = "demo_table_" + (++__instance_counter__);
    build_ui(gobj);
}

/***************************************************************
 *          Framework Method: Start
 ***************************************************************/
function mt_start(gobj)
{
    let priv = gobj.priv;

    let table = new Tabulator("#" + priv.table_id, {
        layout:         "fitColumns",
        height:         "100%",
        placeholder:    "no rows",
        selectableRows: 1,
        columnDefaults: {headerHozAlign: "left", resizable: false},
        initialSort:    [{column: "id", dir: "asc"}],
        columns: [
            {title: "#",       field: "id",      width: 60, hozAlign: "right"},
            {title: "Role",    field: "role",    minWidth: 140},
            {title: "Name",    field: "name",    minWidth: 150},
            {title: "Version", field: "version", width: 110},
            {title: "CPU",     field: "cpu",     width: 90, hozAlign: "right",
                formatter: cell => `${cell.getValue()} %`},
            {title: "Status",  field: "status",  width: 130, formatter: status_formatter},
        ],
    });
    table.on("tableBuilt", () => table.setData(SAMPLE_ROWS));
    priv.tabulator = table;
}

/***************************************************************
 *          Framework Method: Stop
 ***************************************************************/
function mt_stop(gobj)
{
    let priv = gobj.priv;

    if(priv.tabulator) {
        priv.tabulator.destroy();
        priv.tabulator = null;
    }
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
 *  A coloured Bulma tag per status.
 ***************************************************************/
function status_formatter(cell)
{
    let v = String(cell.getValue() || "");
    let cls = v === "running" ? "is-success"
        : (v === "stopped" ? "is-danger" : "is-warning");
    return `<span class="tag ${cls} is-light">${v}</span>`;
}

/***************************************************************
 *  Build the card: header + a full-height Tabulator holder.
 ***************************************************************/
function build_ui(gobj)
{
    let priv  = gobj.priv;
    let title = gobj_read_attr(gobj, "title") || "Table";
    let lead  = gobj_read_attr(gobj, "lead")  || "";

    let head = [
        ["h1", {class: "DEMO_TITLE title is-3 mb-2"}, title]
    ];
    if(lead) {
        head.push(["p", {class: "DEMO_LEAD content", style: "max-width:60ch;"}, lead]);
    }

    let $c = createElement2(
        ["div", {class: "C_DEMO_TABLE DEMO_CARD view-card"}, [
            ["div", {class: "DEMO_HEAD"}, head],
            ["div", {class: "DEMO_TABLE_HOLDER", style: "flex:1; min-height:0;"},
                [["div", {id: priv.table_id, class: "DEMO_TABLE_EL"}]]
            ]
        ]]
    );
    gobj_write_attr(gobj, "$container", $c);
}




                    /***************************
                     *      Actions
                     ***************************/




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

    const states = [
        ["ST_IDLE", []]
    ];

    const event_types = [];

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
function register_c_demo_table()
{
    return create_gclass(GCLASS_NAME);
}

export {register_c_demo_table};
