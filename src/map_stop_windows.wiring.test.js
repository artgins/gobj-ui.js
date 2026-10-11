/***********************************************************************
 *          map_stop_windows.wiring.test.js
 *
 *      C_YUI_MAP opens one C_YUI_WINDOW per marker clicked, as its own
 *      child. A C_YUI_WINDOW has no mt_stop: stopping the map with the
 *      framework's gobj_stop_children() left each one on screen, holding
 *      its service name, so the next click on that marker found the old
 *      window. mt_stop destroys them.
 *
 *      maplibre is replaced by a stand-in: the test is about the gobjs,
 *      not about a map, and node has no WebGL.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {describe, test, expect, beforeAll, vi} from "vitest";
import {install_dom_double} from "../test/dom_double.js";

install_dom_double();

vi.mock("maplibre-gl", () => {
    class Map {
        on() {
        }
        addControl() {
        }
        getCanvasContainer() {
            return {querySelector: () => null};
        }
        remove() {
        }
    }
    class NavigationControl {
    }
    class GeolocateControl {
    }
    class Popup {
    }
    return {Map, NavigationControl, GeolocateControl, Popup};
});

const {
    SDATA, SDATA_END, data_type_t, gclass_create,
    gobj_start_up, gobj_create_yuno, gobj_create, gobj_create_service,
    gobj_start, gobj_stop, gobj_find_service, gobj_is_destroying, gobj_send_event,
    set_log_callback,
} = await import("@yuneta/gobj-js");
const {register_c_yui_window} = await import("./c_yui_window.js");
const {register_c_yui_map} = await import("./c_yui_map.js");

const logged = [];
let yuno = null;

beforeAll(async () => {
    const i18next = (await import("i18next")).default;
    await i18next.init({lng: "en", resources: {}});
    gobj_start_up(null, null, null, null, null, null, null);
    set_log_callback((level, msg) => {
        logged.push({level: String(level), msg: String(msg)});
    });
    gclass_create("C_TEST_MAP_HOST", [], [["ST_IDLE", []]], {}, 0, [SDATA_END()], {}, 0, 0, 0, 0);
    gclass_create(
        "C_TEST_MAP_DEVICE", [], [["ST_IDLE", []]], {}, 0,
        [SDATA(data_type_t.DTP_POINTER, "$container", 0, null, "What its window shows"), SDATA_END()],
        {}, 0, 0, 0, 0
    );
    register_c_yui_window();
    register_c_yui_map();
    yuno = gobj_create_yuno("map_yuno", "C_TEST_MAP_HOST", {});
    gobj_start(yuno);
});

function errors()
{
    return logged.filter((l) => l.level === "error").map((l) => l.msg);
}

describe("C_YUI_MAP stopped with marker windows open", () => {
    test("destroys them, so their service names are free again", () => {
        const host = gobj_create("map_host", "C_TEST_MAP_HOST", {}, yuno);
        gobj_start(host);
        const device = gobj_create_service("dev1", "C_TEST_MAP_DEVICE",
            {$container: document.createElement("div")}, host);
        gobj_start(device);
        const map = gobj_create("map1", "C_YUI_MAP",
            {$map: document.createElement("div")}, host);
        gobj_start(map);
        logged.length = 0;

        gobj_send_marker_click(map, "dev1");
        const win = gobj_find_service("window-map-dev1", false);
        expect(win).toBeTruthy();

        gobj_stop(map);
        expect(gobj_is_destroying(win)).toBe(true);
        expect(gobj_find_service("window-map-dev1", false)).toBe(null);

        /*  Started again, the marker opens a NEW window.  */
        gobj_start(map);
        gobj_send_marker_click(map, "dev1");
        const again = gobj_find_service("window-map-dev1", false);
        expect(again).toBeTruthy();
        expect(again).not.toBe(win);
        expect(errors()).toEqual([]);
    });
});

/*  As the marker's click handler sends it.  */
function gobj_send_marker_click(map, service_name)
{
    return gobj_send_event(map, "EV_MARKER_CLICKED", {gobj_service_name: service_name}, map);
}
