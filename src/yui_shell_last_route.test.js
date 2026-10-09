/*
 *  yui_shell_last_route_under() / yui_shell_last_route_outside():
 *  the two questions asked of the shell's memory of visited routes.
 *  They read only `priv.route_mru`, so a bare object stands in for
 *  the shell.
 */
import {describe, it, expect} from "vitest";
import {
    yui_shell_last_route_under,
    yui_shell_last_route_outside,
} from "./c_yui_shell.js";

function shell(mru)
{
    return {priv: {route_mru: mru}};
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
