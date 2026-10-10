/*
 *  yui_shell_last_route_under() / yui_shell_last_route_outside():
 *  the two questions asked of the shell's memory of visited routes.
 *  They read only `priv.route_mru`, so a bare object stands in for
 *  the shell.
 */
import {describe, it, expect, vi} from "vitest";

/*  yui_shell_previous_route() reads the shell's `current_route` attr;
 *  the stand-in carries it in `attrs`.  */
vi.mock("@yuneta/gobj-js", async (importOriginal) => {
    const orig = await importOriginal();
    return {
        ...orig,
        gobj_read_attr: (gobj, name) => (gobj && gobj.attrs && name in gobj.attrs)?
            gobj.attrs[name]: orig.gobj_read_attr(gobj, name),
    };
});

import {
    yui_shell_last_route_under,
    yui_shell_last_route_outside,
    yui_shell_previous_route,
} from "./c_yui_shell.js";

function shell(mru, current)
{
    return {
        priv: {route_mru: mru},
        attrs: {current_route: current === undefined? mru[mru.length - 1] || "": current},
    };
}

describe("yui_shell_last_route_outside", () => {
    it("answers the view the reader came from", () => {
        const s = shell(["/devices/list", "/devices/map/table", "/devices/detail/E1"]);
        expect(yui_shell_last_route_outside(s, "/devices/detail")).toBe("/devices/map/table");
    });

    it("skips every record of the same view, not only the current one", () => {
        const s = shell(["/alarms", "/devices/detail/E1", "/devices/detail/E2"]);
        expect(yui_shell_last_route_outside(s, "/devices/detail")).toBe("/alarms");
    });

    it("answers the bare route of a view too", () => {
        const s = shell(["/devices/map", "/devices/detail"]);
        expect(yui_shell_last_route_outside(s, "/devices/detail")).toBe("/devices/map");
    });

    it("does not take a sibling that only shares a prefix for a child", () => {
        const s = shell(["/devices/detailed", "/devices/detail/E1"]);
        expect(yui_shell_last_route_outside(s, "/devices/detail")).toBe("/devices/detailed");
    });

    it("answers empty when the page never left the view", () => {
        expect(yui_shell_last_route_outside(shell(["/devices/detail/E1"]), "/devices/detail")).toBe("");
        expect(yui_shell_last_route_outside(shell([]), "/devices/detail")).toBe("");
        expect(yui_shell_last_route_outside(null, "/devices/detail")).toBe("");
        expect(yui_shell_last_route_outside(shell(["/x"]), "")).toBe("");
    });
});

describe("yui_shell_last_route_under", () => {
    it("answers the deepest recent position under a route, or the route", () => {
        const s = shell(["/graph/users", "/alarms"]);
        expect(yui_shell_last_route_under(s, "/graph")).toBe("/graph/users");
        expect(yui_shell_last_route_under(s, "/cards")).toBe("/cards");
    });
});

describe("yui_shell_previous_route", () => {
    it("answers the route before the current one, as browser Back does", () => {
        const s = shell(["/topics", "/topics/device_types", "/topics/devices"]);
        expect(yui_shell_previous_route(s)).toBe("/topics/device_types");
    });

    it("goes back to the previous record, not past it", () => {
        const s = shell(["/map/table", "/detail/E1", "/detail/E2"]);
        expect(yui_shell_previous_route(s)).toBe("/detail/E1");
    });

    it("goes back DOWN after a breadcrumb took the reader up", () => {
        const s = shell(["/schemas/db", "/schemas/db/users", "/schemas/db/users/cols", "/schemas/db"]);
        expect(yui_shell_previous_route(s)).toBe("/schemas/db/users/cols");
    });

    it("answers empty when the page has not moved", () => {
        expect(yui_shell_previous_route(shell(["/detail/E1"]))).toBe("");
        expect(yui_shell_previous_route(shell([]))).toBe("");
        expect(yui_shell_previous_route(null)).toBe("");
    });
});
