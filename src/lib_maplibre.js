/***********************************************************************
 *          lib_maplibre.js
 *
 *          Utilities for maplibre
 *
 *          Copyright (c) 2025, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {
    duplicate_objects,
    createElement2,
    gobj_send_event,
    parseSVG,
} from "@yuneta/gobj-js";

import {t} from "i18next";

class EditControl {
    constructor(gobj, config = {}) {
        const defaultConfig = {
            showMarkerDrag: false,
        };

        this.config = duplicate_objects(defaultConfig, config);
        this.gobj = gobj; // gobj creating the class
    }
    onAdd(map) {
        this._xmap = map;
        this.$container = createElement2(
            [
                'div',
                {
                    class: 'maplibregl-ctrl maplibregl-ctrl-group',
                },
                [],
                {
                    contextmenu: function(evt) {
                        evt.preventDefault();
                    }
                }
            ]
        );

        this._create_buttons();

        return this.$container;
    }

    onRemove() {
        this.$container.parentNode.removeChild(this.$container);
        this.$btn_marker_drag = undefined;
        this.$container = undefined;
        this._xmap = undefined;
    }

    _create_buttons() {
        if(this.config.showMarkerDrag) {
            this.$btn_marker_drag = createElement2(
                [
                    'button',
                    {
                        class: 'button is-small is-flex is-align-items-center is-justify-content-center',
                        title: t('maplibre.drag_mark'),
                        "data-i18n-title": 'maplibre.drag_mark',
                        "aria-label": t('maplibre.drag_mark'),
                        "data-i18n-aria-label": 'maplibre.drag_mark',
                    },
                    parseSVG(`
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="22" height="22" fill="#CCCCCC"><path d="M273 7c-9.4-9.4-24.6-9.4-33.9 0L167 79c-9.4 9.4-9.4 24.6 0 33.9s24.6 9.4 33.9 0l31-31L232 232 81.9 232l31-31c9.4-9.4 9.4-24.6 0-33.9s-24.6-9.4-33.9 0L7 239c-9.4 9.4-9.4 24.6 0 33.9l72 72c9.4 9.4 24.6 9.4 33.9 0s9.4-24.6 0-33.9l-31-31L232 280l0 150.1-31-31c-9.4-9.4-24.6-9.4-33.9 0s-9.4 24.6 0 33.9l72 72c9.4 9.4 24.6 9.4 33.9 0l72-72c9.4-9.4 9.4-24.6 0-33.9s-24.6-9.4-33.9 0l-31 31L280 280l150.1 0-31 31c-9.4 9.4-9.4 24.6 0 33.9s24.6 9.4 33.9 0l72-72c9.4-9.4 9.4-24.6 0-33.9l-72-72c-9.4-9.4-24.6-9.4-33.9 0s-9.4 24.6 0 33.9l31 31L280 232l0-150.1 31 31c9.4 9.4 24.6 9.4 33.9 0s9.4-24.6 0-33.9L273 7z"/></svg>
                    `),
                    {
                        click: (evt) => {
                            this._toggle_moving_markers();
                            // this._zoomInButton.disabled = isMax;
                            // this._zoomInButton.setAttribute('aria-disabled', isMax.toString());
                        }
                    }
                ]
            );
            this.$container.appendChild(this.$btn_marker_drag);
        }
    }
    _toggle_moving_markers() {
        if(this._enable_moving_markers) {
            this.$btn_marker_drag.querySelector('svg').style.fill = '#CCCCCC';
            this._enable_moving_markers = false;
        } else {
            this.$btn_marker_drag.querySelector('svg').style.fill = "blue";
            this._enable_moving_markers = true;
        }
        gobj_send_event(this.gobj,
            "EV_EDIT_MAP",
            {
                enable_moving_markers: this._enable_moving_markers
            },
            this.gobj
        );
    }
}

class MarkerControl {
    constructor(gobj, config = {}) {
        const defaultConfig = {
            showCenterMap: true,
            showUserLocation: false,
        };

        this.config = duplicate_objects(defaultConfig, config);
        this.gobj = gobj; // gobj creating the class
    }
    onAdd(map) {
        this._xmap = map;
        this.$container = createElement2(
            [
                'div',
                {
                    class: 'maplibregl-ctrl maplibregl-ctrl-group',
                },
                [],
                {
                    contextmenu: function(evt) {
                        evt.preventDefault();
                    }
                }
            ]
        );

        this._create_buttons();

        return this.$container;
    }

    onRemove() {
        this.$container.parentNode.removeChild(this.$container);
        this.$btn_center_map = undefined;
        this.$btn_user_location = undefined;
        this.$container = undefined;
        this._xmap = undefined;
    }

    _create_buttons() {
        if(this.config.showCenterMap) {
            this.$btn_center_map = createElement2(
                [
                    'button',
                    {
                        class: 'button is-small is-flex is-align-items-center is-justify-content-center',
                        title: t('maplibre.center_map'),
                        "data-i18n-title": 'maplibre.center_map',
                        "aria-label": t('maplibre.center_map'),
                        "data-i18n-aria-label": 'maplibre.center_map',
                    },
                    parseSVG(`
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 512" width="22" height="22"><path d="M15 15C24.4 5.7 39.6 5.7 49 15l63 63L112 40c0-13.3 10.7-24 24-24s24 10.7 24 24l0 96c0 13.3-10.7 24-24 24l-96 0c-13.3 0-24-10.7-24-24s10.7-24 24-24l38.1 0L15 49C5.7 39.6 5.7 24.4 15 15zM133.5 243.9C158.6 193.6 222.7 112 320 112s161.4 81.6 186.5 131.9c3.8 7.6 3.8 16.5 0 24.2C481.4 318.4 417.3 400 320 400s-161.4-81.6-186.5-131.9c-3.8-7.6-3.8-16.5 0-24.2zM320 320a64 64 0 1 0 0-128 64 64 0 1 0 0 128zM591 15c9.4-9.4 24.6-9.4 33.9 0s9.4 24.6 0 33.9l-63 63 38.1 0c13.3 0 24 10.7 24 24s-10.7 24-24 24l-96 0c-13.3 0-24-10.7-24-24l0-96c0-13.3 10.7-24 24-24s24 10.7 24 24l0 38.1 63-63zM15 497c-9.4-9.4-9.4-24.6 0-33.9l63-63L40 400c-13.3 0-24-10.7-24-24s10.7-24 24-24l96 0c13.3 0 24 10.7 24 24l0 96c0 13.3-10.7 24-24 24s-24-10.7-24-24l0-38.1L49 497c-9.4 9.4-24.6 9.4-33.9 0zm576 0l-63-63 0 38.1c0 13.3-10.7 24-24 24s-24-10.7-24-24l0-96c0-13.3 10.7-24 24-24l96 0c13.3 0 24 10.7 24 24s-10.7 24-24 24l-38.1 0 63 63c9.4 9.4 9.4 24.6 0 33.9s-24.6 9.4-33.9 0z"/></svg>
                    `),
                    {
                        click: (evt) => {
                            this._toggle_center_map();
                        }
                    }
                ]
            );
            this.$container.appendChild(this.$btn_center_map);
        }

        if(this.config.showUserLocation) {
            this.$btn_user_location = createElement2(
                [
                    'button',
                    {
                        class: 'button is-small is-flex is-align-items-center is-justify-content-center',
                        title: t('maplibre.user_location'),
                        "data-i18n-title": 'maplibre.user_location',
                        "aria-label": t('maplibre.user_location'),
                        "data-i18n-aria-label": 'maplibre.user_location',
                    },
                    parseSVG(`
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="22" height="22" fill="#CCCCCC"><path d="M256 0c17.7 0 32 14.3 32 32l0 34.7C368.4 80.1 431.9 143.6 445.3 224l34.7 0c17.7 0 32 14.3 32 32s-14.3 32-32 32l-34.7 0C431.9 368.4 368.4 431.9 288 445.3l0 34.7c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-34.7C143.6 431.9 80.1 368.4 66.7 288L32 288c-17.7 0-32-14.3-32-32s14.3-32 32-32l34.7 0C80.1 143.6 143.6 80.1 224 66.7L224 32c0-17.7 14.3-32 32-32zM128 256a128 128 0 1 0 256 0 128 128 0 1 0 -256 0zm128-80a80 80 0 1 1 0 160 80 80 0 1 1 0-160z"/></svg>
                    `),
                    {
                        click: (evt) => {
                            this._toggle_user_location();
                        }
                    }
                ]
            );
            this.$container.appendChild(this.$btn_user_location);
        }
    }
    _toggle_center_map() {
        if(this._enable_center_map) {
            // this.$btn_center_map.querySelector('svg').style.fill = '#CCCCCC';
            // this._enable_center_map = false;
        } else {
            // this.$btn_center_map.querySelector('svg').style.fill = "blue";
            // this._enable_center_map = true;
        }
        gobj_send_event(this.gobj,
            "EV_CONTROL_MAP",
            {
                center_map: true, //this._enable_center_map
            },
            this.gobj
        );
    }
    _toggle_user_location() {
        if(this._enable_user_location) {
            this.$btn_user_location.querySelector('svg').style.fill = '#CCCCCC';
            this._enable_user_location = false;
        } else {
            this.$btn_user_location.querySelector('svg').style.fill = "blue";
            this._enable_user_location = true;
        }
        gobj_send_event(this.gobj,
            "EV_CONTROL_MAP",
            {
                user_location: this._enable_user_location,
            },
            this.gobj
        );
    }
}


/***********************************************************************
 *      MAPLIBRE'S OWN CHROME, IN THE APP'S LANGUAGE
 *
 *  Everything maplibre draws with words -- the zoom tooltips, the
 *  geolocate button, the attribution toggle, a popup's close, and the
 *  notice that teaches the Ctrl + wheel gesture -- comes from its
 *  `locale`, an option merged over its own English defaults at
 *  construction. So a map in a Spanish app was saying *"Zoom in"* and
 *  *"Use Ctrl + scroll to zoom the map"*, which is the same rule this
 *  GUI applies to every other string.
 *
 *  Two halves, because maplibre reads its strings ONCE, when each
 *  control builds its DOM:
 *
 *      `yui_maplibre_locale(t)`      the `locale` option, for the map's
 *                                    first paint;
 *      `yui_maplibre_relocalize()`   after a language change, which is
 *                                    the half a `locale` alone cannot
 *                                    do -- it writes the strings into
 *                                    the DOM already drawn, and updates
 *                                    the map's locale so anything built
 *                                    later is right too.
 *
 *  The scale units (`km`, `mi`, `nm`) are symbols and are left alone;
 *  the MapLibre logo keeps its name, which is a brand.
 ***********************************************************************/
function yui_maplibre_locale(t)
{
    return {
        "NavigationControl.ZoomIn": t("zoom in"),
        "NavigationControl.ZoomOut": t("zoom out"),
        "NavigationControl.ResetBearing": t("drag to rotate the map, click to reset north"),
        "GeolocateControl.FindMyLocation": t("find my location"),
        "GeolocateControl.LocationNotAvailable": t("location not available"),
        "AttributionControl.ToggleAttribution": t("toggle attribution"),
        "AttributionControl.MapFeedback": t("map feedback"),
        "FullscreenControl.Enter": t("enter fullscreen"),
        "FullscreenControl.Exit": t("exit fullscreen"),
        "Popup.Close": t("close popup"),
        "Map.Title": t("map"),
        "Marker.Title": t("map marker"),
        "CooperativeGesturesHandler.WindowsHelpText": t("use ctrl + scroll to zoom the map"),
        "CooperativeGesturesHandler.MacHelpText": t("use cmd + scroll to zoom the map"),
        "CooperativeGesturesHandler.MobileHelpText": t("use two fingers to move the map"),
    };
}

/*  One drawn control: its tooltip and its aria-label say the same
 *  thing, and a screen reader needs the second even when the first is
 *  what a pointer finds.  */
function label_ctrl($root, selector, text)
{
    if(!$root || !text) {
        return;
    }
    for(const $el of $root.querySelectorAll(selector)) {
        $el.setAttribute("title", text);
        $el.setAttribute("aria-label", text);
    }
}

function yui_maplibre_relocalize(map, t)
{
    if(!map || typeof map.getContainer !== "function") {
        return;
    }
    const strings = yui_maplibre_locale(t);

    /*  The map's own table first: a control added later (or a popup
     *  opened later) reads it when it builds itself.  */
    try {
        map._locale = Object.assign({}, map._locale, strings);
    } catch(e) {
        /*  a maplibre that keeps its locale elsewhere: the DOM below
         *  still gets translated, which is what is on screen  */
    }

    const $c = map.getContainer();
    label_ctrl($c, ".maplibregl-ctrl-zoom-in", strings["NavigationControl.ZoomIn"]);
    label_ctrl($c, ".maplibregl-ctrl-zoom-out", strings["NavigationControl.ZoomOut"]);
    label_ctrl($c, ".maplibregl-ctrl-compass", strings["NavigationControl.ResetBearing"]);
    label_ctrl($c, ".maplibregl-ctrl-geolocate", strings["GeolocateControl.FindMyLocation"]);
    label_ctrl($c, ".maplibregl-ctrl-attrib-button", strings["AttributionControl.ToggleAttribution"]);
    label_ctrl($c, ".maplibregl-ctrl-fullscreen", strings["FullscreenControl.Enter"]);
    label_ctrl($c, ".maplibregl-popup-close-button", strings["Popup.Close"]);

    /*  The notice of the cooperative gesture: two lines, one for a
     *  pointer and one for a finger, built by `_setupUI()` as
     *  `.maplibregl-desktop-message` / `.maplibregl-mobile-message`.  */
    const mac = (typeof navigator !== "undefined" &&
                 (navigator.userAgent || "").includes("Mac"));
    const $desktop = $c.querySelector(".maplibregl-desktop-message");
    if($desktop) {
        $desktop.textContent = mac
            ? strings["CooperativeGesturesHandler.MacHelpText"]
            : strings["CooperativeGesturesHandler.WindowsHelpText"];
    }
    const $mobile = $c.querySelector(".maplibregl-mobile-message");
    if($mobile) {
        $mobile.textContent = strings["CooperativeGesturesHandler.MobileHelpText"];
    }
}

//=======================================================================
//      Expose the class via the global object
//=======================================================================
export {
    EditControl,
    MarkerControl,
    yui_maplibre_locale,
    yui_maplibre_relocalize
};
