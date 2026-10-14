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

    /*  The template grammar defaults a spec with no real type to
     *  `string`: "time.writable" was read as an ISO text, so the
     *  test-app's appointment showed no time and a save wrote null
     *  (gobj-ui 7.26.47 and 7.26.48).  */
    test("a spec with no real type (\"time.writable\") is an epoch; \"string.time\" is a text", () => {
        const app = gobj_create_pure_child("tapp2", "C_TEST_TIME_APP", {}, yuno);
        gobj_start(app);
        const form = gobj_create_pure_child("tform2", "C_YUI_FORM", {
            template: {
                bare:    "time.writable",
                as_text: "string.time.writable",
                as_int:  "integer.time.writable",
            },
            record: {bare: EPOCH, as_text: ISO, as_int: EPOCH},
            editable: true,
        }, app);
        gobj_start(form);

        expect(box(form, "bare").value).toBe(WALL);
        expect(box(form, "as_text").value).toBe(WALL);
        expect(box(form, "as_int").value).toBe(WALL);

        gobj_send_event(form, "EV_SAVE_RECORD", {}, form);
        expect(saved.length).toBe(1);
        expect(saved[0].bare).toBe(EPOCH);
        expect(saved[0].as_text).toBe(ISO);
        expect(saved[0].as_int).toBe(EPOCH);
        expect(errors()).toEqual([]);
    });

    /*  The red outline is for the eye only: up to gobj-ui 7.26.48 a field
     *  Save refused -- here a date with a part cleared -- carried no
     *  aria-invalid, and its line was not the box's description.  */
    test("a date with a part cleared is said invalid to a reader, and the line describes it", () => {
        const app = gobj_create_pure_child("tapp3", "C_TEST_TIME_APP", {}, yuno);
        gobj_start(app);
        const form = gobj_create_pure_child("tform3", "C_YUI_FORM", {
            template: TEMPLATE,
            record: {as_epoch: EPOCH, as_text: ISO, no_time: null},
            editable: true,
        }, app);
        gobj_start(form);

        const $box = box(form, "as_epoch");
        $box.value = "";
        Object.defineProperty($box, "validity", {
            configurable: true,
            value: {badInput: true, valid: false, valueMissing: false}
        });
        Object.defineProperty($box, "validationMessage", {
            configurable: true, value: "Please enter a valid date and time."
        });
        $box.dispatchEvent({type: "invalid"});
        expect($box.classList.contains("is-danger")).toBe(true);
        expect($box.getAttribute("aria-invalid")).toBe("true");
        const $help = $box.parentNode.querySelector(".help");
        expect($help.textContent).toBe("Please enter a valid date and time.");
        expect($help.id).toBeTruthy();
        expect($box.getAttribute("aria-describedby")).toBe($help.id);

        Object.defineProperty($box, "validity", {
            configurable: true, value: {badInput: false, valid: true, valueMissing: false}
        });
        $box.value = WALL;
        $box.dispatchEvent({type: "blur"});
        expect($box.classList.contains("is-danger")).toBe(false);
        expect($box.getAttribute("aria-invalid")).toBe(null);
        expect($help.textContent).toBe("");
        expect(errors()).toEqual([]);
    });
});

/*  Chromium and Firefox write a `datetime-local` value without its
 *  seconds when they are :00: "…T02:30:00" reads back "…T02:30".  */
function with_browser_box(fn)
{
    const create = document.createElement;
    document.createElement = function(tag) {
        const el = create.call(document, tag);
        if(String(tag).toLowerCase() === "input") {
            let raw = "";
            Object.defineProperty(el, "value", {
                configurable: true,
                get: () => raw,
                set: (v) => {
                    raw = (v === null || v === undefined)? "" :
                        String(v).replace(/^(\d{4}-\d\d-\d\dT\d\d:\d\d):00$/, "$1");
                },
            });
        }
        return el;
    };
    try {
        fn();
    } finally {
        document.createElement = create;
    }
}

function in_madrid(fn)
{
    const tz = process.env.TZ;
    process.env.TZ = "Europe/Madrid";
    try {
        fn();
    } finally {
        if(tz === undefined) {
            delete process.env.TZ;
        } else {
            process.env.TZ = tz;
        }
    }
}

/*  01:30Z and 00:30Z on 2026-10-25 are both 02:30 in Madrid: the
 *  second and the first pass of the hour the clocks go back. A wall
 *  time read back is the FIRST one.  */
const SECOND_PASS = Date.UTC(2026, 9, 25, 1, 30, 0) / 1000;
const FIRST_PASS = SECOND_PASS - 3600;
const SECOND_PASS_S = Date.UTC(2026, 9, 25, 1, 30, 15) / 1000;

describe("a time in the repeated hour of autumn, saved with nothing touched", () => {
    test("goes back as the record had it: integer, string, template spec, with and without seconds", () => {
        in_madrid(() => {
            with_browser_box(() => {
                const app = gobj_create_pure_child("tapp4", "C_TEST_TIME_APP", {}, yuno);
                gobj_start(app);
                const form = gobj_create_pure_child("tform4", "C_YUI_FORM", {
                    template: {
                        when:   {type: "integer", flag: ["writable", "persistent", "time"]},
                        when_s: {type: "string",  flag: ["writable", "persistent", "time"]},
                        bare:   "time.writable",
                        secs:   "time.writable",
                    },
                    record: {
                        when: SECOND_PASS,
                        when_s: new Date(SECOND_PASS * 1000).toISOString(),
                        bare: SECOND_PASS,
                        secs: SECOND_PASS_S,
                    },
                    editable: true,
                }, app);
                gobj_start(form);

                expect(box(form, "when").value).toBe("2026-10-25T02:30");
                expect(box(form, "secs").value).toBe("2026-10-25T02:30:15");
                expect(gobj_read_attr(form, "edited")).toBe(false);

                gobj_send_event(form, "EV_SAVE_RECORD", {}, form);
                expect(saved.length).toBe(1);
                expect(saved[0].when).toBe(SECOND_PASS);
                expect(saved[0].when_s).toBe("2026-10-25T01:30:00.000Z");
                expect(saved[0].bare).toBe(SECOND_PASS);
                expect(saved[0].secs).toBe(SECOND_PASS_S);
                expect(errors()).toEqual([]);
            });
        });
    });

    test("a box the reader changed is read, and a record loaded after another one is ITS value", () => {
        in_madrid(() => {
            with_browser_box(() => {
                const app = gobj_create_pure_child("tapp5", "C_TEST_TIME_APP", {}, yuno);
                gobj_start(app);
                const form = gobj_create_pure_child("tform5", "C_YUI_FORM", {
                    template: {when: "time.writable", other: "time.writable"},
                    record: {when: SECOND_PASS, other: SECOND_PASS},
                    editable: true,
                }, app);
                gobj_start(form);

                /*  The same wall time, the other instant: the box shows
                 *  the same text, and the save must be the NEW record's.  */
                gobj_send_event(form, "EV_LOAD_RECORD", {when: FIRST_PASS, other: null}, form);
                expect(box(form, "when").value).toBe("2026-10-25T02:30");
                expect(box(form, "other").value).toBe("");
                gobj_send_event(form, "EV_SAVE_RECORD", {}, form);
                expect(saved[0].when).toBe(FIRST_PASS);
                expect(saved[0].other).toBe(null);

                gobj_send_event(form, "EV_LOAD_RECORD", {when: SECOND_PASS, other: SECOND_PASS}, form);
                box(form, "when").value = "2026-10-25T04:00:00";
                box(form, "other").value = "";
                gobj_send_event(form, "EV_SAVE_RECORD", {}, form);
                expect(saved[1].when).toBe(Date.UTC(2026, 9, 25, 3, 0, 0) / 1000);
                expect(saved[1].other).toBe(null);

                /*  Cleared by the form's own Clear: nothing kept.  */
                gobj_send_event(form, "EV_LOAD_RECORD", {when: SECOND_PASS, other: SECOND_PASS}, form);
                gobj_send_event(form, "EV_CLEAR_RECORD", {}, form);
                gobj_send_event(form, "EV_SAVE_RECORD", {}, form);
                expect(saved[2].when).toBe(null);
                expect(saved[2].other).toBe(null);
                expect(errors()).toEqual([]);
            });
        });
    });
});
