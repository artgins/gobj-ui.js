/*
 *  gobj-ui replaces G6's built-in drag-canvas and zoom-canvas on purpose;
 *  G6's register() warned "has been registered before" for each, on every
 *  page load, in every app that draws a graph.
 */
import {describe, it, expect, vi, afterEach} from "vitest";
import {ExtensionCategory, getExtension} from "@antv/g6";
import {ensure_drag_canvas_patch} from "./g6_drag_canvas_touch.js";
import {ensure_pinch_zoom_patch} from "./g6_touch_gestures.js";
import {replace_g6_behavior} from "./g6_replace_behavior.js";

afterEach(() => {
    vi.restoreAllMocks();
});

describe("replacing G6's built-in behaviors", () => {
    it("puts gobj-ui's drag-canvas and zoom-canvas in place, with no warning", () => {
        const builtin_drag = getExtension(ExtensionCategory.BEHAVIOR, "drag-canvas");
        const builtin_zoom = getExtension(ExtensionCategory.BEHAVIOR, "zoom-canvas");
        const warn = vi.spyOn(console, "warn");
        ensure_drag_canvas_patch();
        ensure_pinch_zoom_patch();
        const said = warn.mock.calls.map((c) => String(c[0]));
        expect(said.filter((m) => m.includes("registered before"))).toEqual([]);
        const drag = getExtension(ExtensionCategory.BEHAVIOR, "drag-canvas");
        const zoom = getExtension(ExtensionCategory.BEHAVIOR, "zoom-canvas");
        expect(drag).not.toBe(builtin_drag);
        expect(zoom).not.toBe(builtin_zoom);
        expect(Object.getPrototypeOf(drag)).toBe(builtin_drag);
        expect(Object.getPrototypeOf(zoom)).toBe(builtin_zoom);
    });

    it("registers a type G6 does not have", () => {
        class Probe {}
        replace_g6_behavior("gobj-ui-probe-behavior", Probe);
        expect(getExtension(ExtensionCategory.BEHAVIOR, "gobj-ui-probe-behavior")).toBe(Probe);
    });
});
