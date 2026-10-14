/***********************************************************************
 *          uplot_ink.test.js
 *
 *      The axes of a chart carry the ink of the theme -- the Y axis
 *      too. uPlot always draws one (its setDefaults() makes axes[1]
 *      whether it was given or not, with its own black), and
 *      C_YUI_UPLOT inked only the axes it was handed: by default one,
 *      the X. In the dark scheme the values of every Y axis of the
 *      library were black on near-black (a user's report, the cards of
 *      estadodelaire).
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {describe, test, expect, beforeAll, beforeEach, afterEach, vi} from "vitest";
import {install_dom_double} from "../test/dom_double.js";

install_dom_double();

/*  What C_YUI_UPLOT hands to uPlot, kept by the stand-in.  */
let given = null;
vi.mock("uplot", () => ({
    default: class {
        constructor(opts) {
            given = opts;
            this.series = [{}];
        }
        setSize() {
        }
        addSeries() {
        }
        redraw() {
        }
        destroy() {
        }
    }
}));

const {
    gobj_start_up, gobj_create_yuno, gobj_create_pure_child, gclass_create,
    set_log_callback, SDATA_END,
} = await import("@yuneta/gobj-js");
const {register_c_yui_uplot} = await import("./c_yui_uplot.js");
const {
    yui_uplot_axes, yui_uplot_axis_ink, yui_uplot_grid_ink,
} = await import("./yui_uplot_ink.js");

const logged = [];
let yuno = null;

beforeAll(() => {
    gobj_start_up(null, null, null, null, null, null, null);
    set_log_callback((level, msg) => {
        logged.push({level: String(level), msg: String(msg)});
    });
    gclass_create("C_TEST_INK_HOST", [], [["ST_IDLE", []]], {}, 0, [SDATA_END()], {}, 0, 0, 0, 0);
    register_c_yui_uplot();
    yuno = gobj_create_yuno("ink_yuno", "C_TEST_INK_HOST", {});
});

beforeEach(() => {
    logged.length = 0;
    given = null;
});

afterEach(() => {
    document.documentElement.removeAttribute("data-theme");
});

describe("yui_uplot_axes()", () => {
    test("gives the X and the Y axes, the two uPlot draws", () => {
        expect(yui_uplot_axes([{}]).length).toBe(2);
        expect(yui_uplot_axes(undefined).length).toBe(2);
        expect(yui_uplot_axes([]).length).toBe(2);
        expect(yui_uplot_axes([{}, {}, {scale: "%"}]).length).toBe(3);
    });

    test("inks each one with the theme, read when uPlot draws", () => {
        const axes = yui_uplot_axes([{}]);
        for(const a of axes) {
            expect(a.stroke).toBe(yui_uplot_axis_ink);
            expect(a.grid.stroke).toBe(yui_uplot_grid_ink);
            expect(a.ticks.stroke).toBe(yui_uplot_grid_ink);
        }
        document.documentElement.setAttribute("data-theme", "light");
        expect(axes[1].stroke()).toBe("#2e333d");
        document.documentElement.setAttribute("data-theme", "dark");
        expect(axes[1].stroke()).toBe("#c7cdd8");
    });

    test("keeps what the host gave, and does not touch its objects", () => {
        const mine = [{stroke: "red", grid: {show: false}}];
        const axes = yui_uplot_axes(mine);
        expect(axes[0].stroke).toBe("red");
        expect(axes[0].grid).toEqual({stroke: yui_uplot_grid_ink, show: false});
        expect(mine).toEqual([{stroke: "red", grid: {show: false}}]);
    });
});

describe("C_YUI_UPLOT", () => {
    test("hands uPlot a Y axis with the ink of the theme", () => {
        gobj_create_pure_child("ink_chart", "C_YUI_UPLOT", {}, yuno);
        expect(given).toBeTruthy();
        expect(given.axes.length).toBe(2);
        expect(given.axes[1].stroke).toBe(yui_uplot_axis_ink);
        expect(given.axes[1].grid.stroke).toBe(yui_uplot_grid_ink);
        expect(logged.filter((l) => /error/i.test(l.level))).toEqual([]);
    });
});
