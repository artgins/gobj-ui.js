/***********************************************************************
 *          form_time_cell_editor.test.js
 *
 *      The cell editor of a time column of C_YUI_FORM's tables. Up to
 *      gobj-ui 7.26.45 it was Tabulator's `datetime` with a `format`,
 *      which needs luxon -- nobody gives gobj-ui luxon: it opened empty,
 *      said so in the console, and threw when committed.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {describe, test, expect} from "vitest";
import {install_dom_double} from "../test/dom_double.js";

install_dom_double();

const {
    form_time_cell_editor, time_to_datetime_local, datetime_local_to_time,
} = await import("./form_time_cell_editor.js");
const {date_to_datetime_local} = await import("./form_time_value.js");

/*  A local wall time and its epoch, whatever the zone of the run.  */
const WALL = "2026-03-14T09:26:53";
const EPOCH = Math.floor(new Date(WALL).getTime() / 1000);

function open_editor(value, real_type, params)
{
    const said = {success: [], cancel: 0, rendered: null};
    const cell = {
        getValue: () => value,
        getType: () => "cell",
    };
    const $input = form_time_cell_editor(real_type)(
        cell,
        (fn) => {
            said.rendered = fn;
        },
        (v) => {
            said.success.push(v);
            return true;
        },
        () => {
            said.cancel++;
        },
        params || {}
    );
    return {$input, said};
}

function key(name)
{
    return {
        type: "keydown", key: name,
        stopPropagation() {}, stopImmediatePropagation() {}, preventDefault() {},
    };
}

describe("a time column's cell editor", () => {
    test("shows an epoch in seconds as a local time, to the second", () => {
        const {$input} = open_editor(EPOCH, "integer");
        expect($input.type).toBe("datetime-local");
        expect($input.getAttribute("step")).toBe("1");
        expect($input.value).toBe(WALL);
    });

    test("gives back an epoch in seconds", () => {
        const {$input, said} = open_editor(EPOCH, "integer");
        $input.value = "2026-03-14T10:00:00";
        $input.dispatchEvent(key("Enter"));
        expect(said.success).toEqual([Math.floor(new Date("2026-03-14T10:00:00").getTime() / 1000)]);
    });

    test("an ISO text column stays an ISO text", () => {
        const iso = new Date(EPOCH * 1000).toISOString();
        const {$input, said} = open_editor(iso, "string");
        expect($input.value).toBe(WALL);
        $input.value = "2026-03-14T10:00:00";
        $input.dispatchEvent(key("Enter"));
        expect(said.success).toEqual([new Date("2026-03-14T10:00:00").toISOString()]);
    });

    test("an unchanged value is a cancel, and so is Escape", () => {
        const a = open_editor(EPOCH, "integer");
        a.$input.dispatchEvent(key("Enter"));
        expect(a.said.success).toEqual([]);
        expect(a.said.cancel).toBe(1);

        const b = open_editor(EPOCH, "integer");
        b.$input.value = "2026-03-14T10:00:00";
        b.$input.dispatchEvent(key("Escape"));
        expect(b.said.success).toEqual([]);
        expect(b.said.cancel).toBe(1);
    });

    test("an empty cell opens empty, and emptied commits null", () => {
        const {$input, said} = open_editor(EPOCH, "integer");
        $input.value = "";
        $input.dispatchEvent(key("Enter"));
        expect(said.success).toEqual([null]);
        expect(open_editor(null, "integer").$input.value).toBe("");
        expect(open_editor(undefined, "string").$input.value).toBe("");
    });

    test("writes the attributes it is given: the column's name", () => {
        const {$input} = open_editor(EPOCH, "integer", {
            elementAttributes: {"aria-label": "since", title: "since"}
        });
        expect($input.getAttribute("aria-label")).toBe("since");
        expect($input.getAttribute("title")).toBe("since");
    });

    test("the conversions are each other's inverse", () => {
        expect(datetime_local_to_time(time_to_datetime_local(EPOCH, "integer"), "integer")).toBe(EPOCH);
        expect(time_to_datetime_local(EPOCH, "integer")).toBe(date_to_datetime_local(new Date(EPOCH * 1000)));
    });

    /*  A box with a part of its date cleared answers `value ""`, as an
     *  empty one does, and only `validity.badInput` tells them apart.
     *  Up to 7.26.46 both were committed as null: one Backspace and
     *  Enter erased the stored time.  */
    function half_typed($input)
    {
        $input.value = "";
        Object.defineProperty($input, "validity", {
            configurable: true,
            value: {badInput: true, valid: false}
        });
    }

    test("an incomplete date is not committed by Enter: the editor stays open, said invalid", () => {
        const {$input, said} = open_editor(EPOCH, "integer");
        half_typed($input);
        $input.dispatchEvent(key("Enter"));
        expect(said.success).toEqual([]);
        expect(said.cancel).toBe(0);
        expect($input.getAttribute("aria-invalid")).toBe("true");

        /*  Completed, it commits.  */
        Object.defineProperty($input, "validity", {configurable: true, value: {badInput: false, valid: true}});
        $input.value = "2026-03-14T10:00:00";
        $input.dispatchEvent({type: "input"});
        expect($input.getAttribute("aria-invalid")).toBe(null);
        $input.dispatchEvent(key("Enter"));
        expect(said.success).toEqual([Math.floor(new Date("2026-03-14T10:00:00").getTime() / 1000)]);
    });

    test("an incomplete date left by a blur is a cancel: the stored time stays", () => {
        const {$input, said} = open_editor(EPOCH, "integer");
        half_typed($input);
        $input.dispatchEvent({type: "blur", relatedTarget: {}});
        expect(said.success).toEqual([]);
        expect(said.cancel).toBe(1);
    });

    test("a box emptied part by part is no longer said invalid, with no `input`", () => {
        const {$input, said} = open_editor(EPOCH, "integer");
        half_typed($input);
        $input.dispatchEvent(key("Enter"));
        expect($input.getAttribute("aria-invalid")).toBe("true");

        /*  The other parts cleared: still "" -- no value changed, so
         *  Chromium fires no `input` --, and no longer badInput.  */
        Object.defineProperty($input, "validity", {configurable: true, value: {badInput: false, valid: true}});
        $input.dispatchEvent({type: "keyup", key: "Backspace"});
        expect($input.getAttribute("aria-invalid")).toBe(null);
        $input.dispatchEvent(key("Enter"));
        expect(said.success).toEqual([null]);
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
                    raw = String(v).replace(/^(\d{4}-\d\d-\d\dT\d\d:\d\d):00$/, "$1");
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

describe("a time on the hour, as the browser writes it", () => {
    test("Enter with nothing changed is a cancel, in the repeated hour of autumn too", () => {
        const tz = process.env.TZ;
        process.env.TZ = "Europe/Madrid";
        try {
            /*  01:30Z on 2026-10-25 is 02:30 of the SECOND pass in Madrid:
             *  read back as a wall time it is the first one, an hour
             *  earlier.  */
            const epoch = Date.UTC(2026, 9, 25, 1, 30, 0) / 1000;
            for(const [value, real_type] of [
                [epoch, "integer"],
                [new Date(epoch * 1000).toISOString(), "string"],
                [Math.floor(new Date("2026-03-14T09:26:00").getTime() / 1000), "integer"],
            ]) {
                with_browser_box(() => {
                    const {$input, said} = open_editor(value, real_type);
                    expect($input.value).toMatch(/T\d\d:\d\d$/);
                    $input.dispatchEvent(key("Enter"));
                    expect(said.success).toEqual([]);
                    expect(said.cancel).toBe(1);
                });
            }
        } finally {
            if(tz === undefined) {
                delete process.env.TZ;
            } else {
                process.env.TZ = tz;
            }
        }
    });
});
