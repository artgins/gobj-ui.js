/***********************************************************************
 *          lib_maplibre_relocalize.test.js
 *
 *      After a language change, yui_maplibre_relocalize() rewrites the
 *      words maplibre drew from its locale. Two of them maplibre writes
 *      ONCE and never again: the aria-label of the map's canvas
 *      (`Map.Title`, a region a keyboard focuses) and of a default
 *      marker (`Marker.Title`). Up to 7.26.34 they stayed in the
 *      language the map was built in -- "Mapa" in an English app after
 *      a switch. A name an app gave a marker is its
 *      own, and is left alone.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {describe, test, expect, beforeAll} from "vitest";
import {install_dom_double} from "../test/dom_double.js";

install_dom_double();

const {yui_maplibre_locale, yui_maplibre_relocalize} = await import("./lib_maplibre.js");

let i18next = null;

beforeAll(async () => {
    i18next = (await import("i18next")).default;
    await i18next.init({
        lng: "es",
        resources: {
            es: {translation: {"map": "Mapa", "map marker": "Marcador del mapa"}},
            en: {translation: {"map": "Map", "map marker": "Map marker"}}
        }
    });
});

/*  A map built in Spanish, as maplibre leaves it: its locale table, and
 *  the names it wrote from it.  */
function spanish_map()
{
    const $c = document.createElement("div");
    const $canvas = document.createElement("canvas");
    $canvas.className = "maplibregl-canvas";
    $canvas.setAttribute("aria-label", "Mapa");
    $c.appendChild($canvas);

    const $default = document.createElement("div");
    $default.className = "maplibregl-marker";
    $default.setAttribute("aria-label", "Marcador del mapa");
    $c.appendChild($default);

    const $own = document.createElement("div");
    $own.className = "maplibregl-marker";
    $own.setAttribute("aria-label", "Sensor 7");
    $c.appendChild($own);

    const map = {
        _locale: yui_maplibre_locale(i18next.getFixedT("es")),
        getContainer: () => $c,
    };
    return {map, $canvas, $default, $own};
}

describe("the names maplibre writes once", () => {
    test("follow a language change: the canvas and a default marker", () => {
        const {map, $canvas, $default, $own} = spanish_map();
        yui_maplibre_relocalize(map, i18next.getFixedT("en"));

        expect($canvas.getAttribute("aria-label")).toBe("Map");
        expect($default.getAttribute("aria-label")).toBe("Map marker");
        expect($own.getAttribute("aria-label")).toBe("Sensor 7");     // the app's own
        expect(map._locale["Map.Title"]).toBe("Map");

        /*  And back, from what the last switch wrote.  */
        yui_maplibre_relocalize(map, i18next.getFixedT("es"));
        expect($canvas.getAttribute("aria-label")).toBe("Mapa");
        expect($default.getAttribute("aria-label")).toBe("Marcador del mapa");
    });
});
