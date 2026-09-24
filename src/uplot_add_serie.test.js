/***********************************************************************
 *          uplot_add_serie.test.js
 *
 *      C_YUI_UPLOT's EV_ADD_SERIE gives a series the palette's stroke
 *      and fill only when the host gave none. It did it through
 *      kw_get_str(KW_CREATE), which reads a stroke that is a FUNCTION
 *      (uPlot takes one, and a gradient) as a value of the wrong type:
 *      since gobj-js 7.25.5, which logs that as C does, every series
 *      added with one logged an error.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {describe, test, expect, beforeAll, beforeEach, vi} from "vitest";
import {install_dom_double} from "../test/dom_double.js";

install_dom_double();

/*  uPlot draws on a canvas the document double does not have: the
 *  chart gets a stand-in, and the test writes its own over it.  */
vi.mock("uplot", () => ({
    default: class {
        constructor() {
            this.series = [{}];
        }
        setSize() {}
        addSeries() {}
        destroy() {}
    }
}));

const {
    gobj_start_up, gobj_create_yuno, gobj_create_pure_child, gclass_create,
    gobj_send_event, gobj_write_attr, set_log_callback, SDATA_END,
} = await import("@yuneta/gobj-js");
const {register_c_yui_uplot} = await import("./c_yui_uplot.js");

const logged = [];
let yuno = null;

beforeAll(() => {
    gobj_start_up(null, null, null, null, null, null, null);
    set_log_callback((level, msg) => {
        logged.push({level: String(level), msg: String(msg)});
    });
    gclass_create("C_TEST_UPLOT_HOST", [], [["ST_IDLE", []]], {}, 0, [SDATA_END()], {}, 0, 0, 0, 0);
    register_c_yui_uplot();
    yuno = gobj_create_yuno("uplot_yuno", "C_TEST_UPLOT_HOST", {});
});

beforeEach(() => {
    logged.length = 0;
});

let seq = 0;

/*  The chart, with uPlot replaced by what EV_ADD_SERIE asks of it.  */
function build()
{
    const chart = gobj_create_pure_child(`chart_${++seq}`, "C_YUI_UPLOT", {}, yuno);
    const added = [];
    gobj_write_attr(chart, "uplot", {
        series: [{}],
        addSeries: (kw) => {
            added.push(kw);
        }
    });
    logged.length = 0;
    return {chart, added};
}

describe("EV_ADD_SERIE", () => {

    test("a series with no colours takes the palette's", () => {
        const {chart, added} = build();
        gobj_send_event(chart, "EV_ADD_SERIE", {id: "a", label: "A"}, chart);
        expect(added.length).toBe(1);
        expect(typeof added[0].stroke).toBe("string");
        expect(added[0].stroke.length).toBeGreaterThan(0);
        expect(logged.filter((l) => l.level === "error")).toEqual([]);
    });

    test("a stroke and a fill that are functions are kept, and nothing is logged", () => {
        const {chart, added} = build();
        const stroke = () => "red";
        const fill = () => "pink";
        gobj_send_event(chart, "EV_ADD_SERIE", {id: "b", stroke, fill}, chart);
        expect(added[0].stroke).toBe(stroke);
        expect(added[0].fill).toBe(fill);
        expect(logged.filter((l) => l.level === "error")).toEqual([]);
    });
});
