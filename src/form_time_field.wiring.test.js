/***********************************************************************
 *          form_time_field.wiring.test.js
 *
 *      The time field of C_YUI_FORM reads and writes a time column as
 *      the cell editor of a table does (form_time_value.js): an epoch in
 *      SECONDS for an integer column, an ISO text for a string one, and
 *      an empty box for a column that holds no time. Up to gobj-ui
 *      7.26.46 the field read every column with parseInt -- an ISO text
 *      as 2026 SECONDS, in January 1970 --, wrote the epoch into a string
 *      column, and showed a column with no time as January 1970, which a
 *      save then wrote back as 0.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {describe, test, expect, beforeAll, beforeEach} from "vitest";
import {install_dom_double} from "../test/dom_double.js";

install_dom_double();

if(typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class {
        observe() {
        }
        unobserve() {
        }
        disconnect() {
        }
    };
}

const {
    SDATA_END, gclass_create,
    gobj_start_up, gobj_create_yuno, gobj_create_pure_child,
    gobj_start, gobj_send_event, gobj_read_attr,
    set_log_callback,
} = await import("@yuneta/gobj-js");
const {register_c_yui_form} = await import("./c_yui_form.js");

const logged = [];
const saved = [];
let yuno = null;

/*  A local wall time and its epoch, whatever the zone of the run.  */
const WALL = "2026-03-14T09:26:53";
const EPOCH = Math.floor(new Date(WALL).getTime() / 1000);
const ISO = new Date(EPOCH * 1000).toISOString();

const TEMPLATE = {
    as_epoch: {type: "integer", flag: ["writable", "persistent", "time"]},
    as_text:  {type: "string",  flag: ["writable", "persistent", "time"]},
    no_time:  {type: "integer", flag: ["writable", "persistent", "time"]},
};

beforeAll(async () => {
    const i18next = (await import("i18next")).default;
    await i18next.init({lng: "en", resources: {}});
    gobj_start_up(null, null, null, null, null, null, null);
    set_log_callback((level, msg) => {
        logged.push({level: String(level), msg: String(msg)});
    });
    gclass_create("C_TEST_TIME_HOST", [], [["ST_IDLE", []]], {}, 0, [SDATA_END()], {}, 0, 0, 0, 0);
    gclass_create(
        "C_TEST_TIME_APP",
        [["EV_SAVE_RECORD", 0]],
        [["ST_IDLE", [
            ["EV_SAVE_RECORD", (gobj, event, kw) => {
                saved.push(JSON.parse(JSON.stringify(kw)));
                return 0;
            }, null],
        ]]],
        {}, 0, [SDATA_END()], {}, 0, 0, 0, 0
    );
    register_c_yui_form();
    yuno = gobj_create_yuno("form_time_field_yuno", "C_TEST_TIME_HOST", {});
    gobj_start(yuno);
});

beforeEach(() => {
    logged.length = 0;
    saved.length = 0;
});

function errors()
{
    return logged.filter(l => /error/i.test(l.level) || /ERROR/.test(l.msg));
}

function box(form, name)
{
    const $container = gobj_read_attr(form, "$container");
    return Array.from($container.querySelectorAll(".yui-form-data-input"))
        .find(($i) => $i.dataset.treedb_name === name);
}

describe("the time field of a form", () => {
    test("shows each column as the cell editor does, and saves it back as it was", () => {
        const app = gobj_create_pure_child("tapp", "C_TEST_TIME_APP", {}, yuno);
        gobj_start(app);
        const form = gobj_create_pure_child("tform", "C_YUI_FORM", {
            template: TEMPLATE,
            record: {as_epoch: EPOCH, as_text: ISO, no_time: null},
            editable: true,
        }, app);
        gobj_start(form);

        expect(box(form, "as_epoch").value).toBe(WALL);
        expect(box(form, "as_text").value).toBe(WALL);
        expect(box(form, "no_time").value).toBe("");

        gobj_send_event(form, "EV_SAVE_RECORD", {}, form);
        expect(saved.length).toBe(1);
        expect(saved[0].as_epoch).toBe(EPOCH);
        expect(saved[0].as_text).toBe(ISO);
        expect(saved[0].no_time).toBe(null);
        expect(errors()).toEqual([]);
    });
});
