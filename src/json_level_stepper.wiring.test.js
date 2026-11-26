/***********************************************************************
 *          json_level_stepper.wiring.test.js
 *
 *      The tree of C_YUI_JSON opens and folds one LEVEL at a time
 *      (EV_EXPAND_LEVEL / EV_COLLAPSE_LEVEL), beside the pair that does
 *      it all at once (EV_EXPAND_ALL / EV_COLLAPSE_ALL):
 *
 *        - `+` opens every loaded container of the shallowest level
 *          that still has one closed;
 *        - `-` folds the deepest level open in sight, and everything
 *          under it.
 *
 *      Asked for on the json popup of a treedb cell: from a closed
 *      document, one press shows the fields of each entry with their
 *      own containers still closed.
 *
 *      Driven through the real gclass on a document double.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {test, expect, beforeAll, beforeEach} from "vitest";
import {install_dom_double} from "../test/dom_double.js";

install_dom_double();

if(!globalThis.ResizeObserver) {
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
    SDATA_END, gclass_create, gobj_start_up, gobj_create_yuno, gobj_create,
    gobj_create_pure_child, gobj_start, gobj_read_attr, gobj_send_event,
    set_log_callback,
} = await import("@yuneta/gobj-js");
const {register_c_yui_json} = await import("./c_yui_json.js");

const logged = [];
let yuno = null;
let seq = 0;

/*  The shape of a template_settings cell: entries of fields, some of
 *  them containers in turn.  */
const DOC = {
    template_version: {type: "integer", default: 1, flag: ["persistent", "writable"]},
    top_measures: {type: "array", default: ["temperature"], flag: ["persistent", "writable", "enum"]},
    coordinates: {type: "dict", default: {geometry: {type: "Point", coordinates: [0, 0]}}},
    note: "a leaf at the top",
};

beforeAll(async () => {
    const i18next = (await import("i18next")).default;
    await i18next.init({lng: "en", resources: {}});
    gobj_start_up(null, null, null, null, null, null, null);
    set_log_callback((level, msg) => {
        logged.push({level: String(level), msg: String(msg)});
    });
    gclass_create("C_TEST_LEVEL_HOST", [], [["ST_IDLE", []]], {}, 0, [SDATA_END()], {}, 0, 0, 0, 0);
    gclass_create(
        "C_TEST_LEVEL_APP",
        [["EV_EXPAND_PATH", 0]],
        [["ST_IDLE", [["EV_EXPAND_PATH", () => 0, null]]]],
        {}, 0, [SDATA_END()], {}, 0, 0, 0, 0
    );
    register_c_yui_json();
    yuno = gobj_create_yuno("level_yuno", "C_TEST_LEVEL_HOST", {});
    gobj_start(yuno);
});

beforeEach(() => {
    logged.length = 0;
});

function new_viewer(doc)
{
    const app = gobj_create_pure_child(`level_app_${++seq}`, "C_TEST_LEVEL_APP", {}, yuno);
    gobj_start(app);
    const viewer = gobj_create(`level_json_${seq}`, "C_YUI_JSON", {view_mode: "tree"}, app);
    gobj_start(viewer);
    gobj_send_event(viewer, "EV_SET_JSON", {json: doc}, app);
    return viewer;
}

/*  The keys of the container rows on screen that are open  */
function open_keys(viewer)
{
    const $c = gobj_read_attr(viewer, "$container");
    return Array.from($c.querySelectorAll(".JSON_CONTAINER"))
        .filter(($r) => $r.querySelector(".JSON_TOGGLE").classList.contains("is-open"))
        .map(($r) => $r.querySelector(".JSON_KEY").textContent);
}

/*  How many rows the tree shows  */
function row_count(viewer)
{
    return gobj_read_attr(viewer, "$container").querySelectorAll(".JSON_ROW").length;
}

function step(viewer, event)
{
    gobj_send_event(viewer, event, {}, viewer);
}

function errors()
{
    return logged.filter((l) => l.level === "error").map((l) => l.msg);
}

test("`+` opens one level at a time, `-` folds the deepest one", () => {
    const v = new_viewer(DOC);
    expect(open_keys(v)).toEqual([]);
    expect(row_count(v)).toBe(4);

    step(v, "EV_EXPAND_LEVEL");
    expect(open_keys(v)).toEqual(["template_version", "top_measures", "coordinates"]);

    step(v, "EV_EXPAND_LEVEL");
    expect(open_keys(v)).toEqual(["template_version", "flag", "top_measures", "default", "flag",
                                  "coordinates", "default"]);

    step(v, "EV_EXPAND_LEVEL");
    expect(open_keys(v)).toContain("geometry");

    step(v, "EV_COLLAPSE_LEVEL");
    expect(open_keys(v)).toEqual(["template_version", "flag", "top_measures", "default", "flag",
                                  "coordinates", "default"]);

    step(v, "EV_COLLAPSE_LEVEL");
    step(v, "EV_COLLAPSE_LEVEL");
    expect(open_keys(v)).toEqual([]);
    expect(row_count(v)).toBe(4);
    expect(errors()).toEqual([]);
});

test("`+` opens the shallowest level that still has a container closed", () => {
    const v = new_viewer(DOC);
    /*  The reader opened one branch by hand, two levels deep.  */
    gobj_send_event(v, "EV_TOGGLE_NODE", {path: "coordinates"}, v);
    expect(open_keys(v)).toEqual(["coordinates"]);

    step(v, "EV_EXPAND_LEVEL");
    expect(open_keys(v)).toEqual(["template_version", "top_measures", "coordinates"]);
});

test("`-` folds what is in sight, not a branch hidden under a closed one", () => {
    const v = new_viewer(DOC);
    step(v, "EV_EXPAND_LEVEL");
    step(v, "EV_EXPAND_LEVEL");
    /*  Close `coordinates` by hand: its open `default` is out of sight.  */
    gobj_send_event(v, "EV_TOGGLE_NODE", {path: "coordinates"}, v);

    step(v, "EV_COLLAPSE_LEVEL");
    expect(open_keys(v)).toEqual(["template_version", "top_measures"]);
});

test("a step with nothing to step does nothing, and says no error", () => {
    const v = new_viewer({a: 1, b: "x"});
    step(v, "EV_EXPAND_LEVEL");
    step(v, "EV_COLLAPSE_LEVEL");
    expect(row_count(v)).toBe(2);
    expect(errors()).toEqual([]);
});

test("the stepper is a tree control: it hides with the tree", () => {
    const v = new_viewer(DOC);
    const $c = gobj_read_attr(v, "$container");
    const $minus = $c.querySelector(".EV_COLLAPSE_LEVEL");
    const $plus = $c.querySelector(".EV_EXPAND_LEVEL");
    expect($minus.querySelector("i.yi-square-minus")).not.toBe(null);
    expect($plus.querySelector("i.yi-square-plus")).not.toBe(null);
    expect($minus.getAttribute("aria-label")).toBe("collapse one level");
    expect($plus.getAttribute("data-i18n-aria-label")).toBe("expand one level");

    gobj_send_event(v, "EV_SET_VIEW_MODE", {mode: "text"}, v);
    expect($minus.classList.contains("is-hidden")).toBe(true);
    expect($plus.classList.contains("is-hidden")).toBe(true);
    gobj_send_event(v, "EV_SET_VIEW_MODE", {mode: "tree"}, v);
    expect($plus.classList.contains("is-hidden")).toBe(false);
});
