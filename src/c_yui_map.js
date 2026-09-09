/***********************************************************************
 *          c_yui_map.js
 *
 *          Map Manager
 *
 *          Copyright (c) 2025, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {
    SDATA,
    SDATA_END,
    data_type_t,
    gclass_create,
    log_error,
    is_array,
    createElement2,
    clean_name,
    kw_has_key,
    is_object,
    json_size,
    json_deep_copy,
    gobj_read_pointer_attr,
    gobj_parent,
    gobj_subscribe_event,
    gobj_read_attr,
    gobj_send_event,
    gobj_read_bool_attr,
    gobj_find_service,
    gobj_create_service,
    gobj_start,
    gobj_name,
    gobj_unsubscribe_event,
} from "@yuneta/gobj-js";

import "maplibre-gl/dist/maplibre-gl.css"; // Import MapLibre styles
import * as maplibregl from "maplibre-gl"; // MapLibre GL JS 6 is ESM-only, no default export

import {
    EditControl,
    MarkerControl,
    yui_maplibre_locale,
    yui_maplibre_relocalize
} from "./lib_maplibre.js";

import {t} from "i18next";

import {yui_shell_of} from "./c_yui_shell.js";

import "./c_yui_map.css"; // Must be in index.js ?

/***************************************************************
 *              Constants
 ***************************************************************/
const GCLASS_NAME = "C_YUI_MAP";

/*  How long the cooperative-gesture notice stays up, in ms.  */
const GESTURE_HINT_MS = 2000;

/***************************************************************
 *              Data
 ***************************************************************/
const attrs_table = [
SDATA(data_type_t.DTP_POINTER,  "subscriber",       0,  null,   "Subscriber of output events"),
SDATA(data_type_t.DTP_JSON,     "devices",          "[]", null, "List of devices"),
SDATA(data_type_t.DTP_JSON,     "map_settings",     0,  {
    style: "https://tiles.openfreemap.org/styles/liberty",
    center: [-3.7038, 40.4168],
    zoom: 9.5,
    scrollZoom: true,
    // sprite: 'http://localhost:8029/static/app/images/devices/sprite/device_sprite', // without file extension
},   "Map settings"),
SDATA(data_type_t.DTP_REAL,     "default_longitude",0,  -3.7038, "Default longitude"),
SDATA(data_type_t.DTP_REAL,     "default_latitude", 0,  40.4168, "Default latitude"),
SDATA(data_type_t.DTP_POINTER,  "$map",             0,  null,    "External HTML container"),
SDATA(data_type_t.DTP_STRING,   "label",            0,  "map",   "Label"),
SDATA(data_type_t.DTP_STRING,   "icon",             0,  "yi-location-dot", "Icon class"),
SDATA(data_type_t.DTP_INTEGER,  "width",            0,  400,    "Width of the map"),
SDATA(data_type_t.DTP_INTEGER,  "height",           0,  400,    "Height of the map"),
SDATA(data_type_t.DTP_BOOLEAN,  "dimensions_with_parent_observer", 0, false, "Observe parent dimensions"),
SDATA(data_type_t.DTP_INTEGER,  "timeout_retry",    0,  5,      "Timeout retry in seconds"),
SDATA(data_type_t.DTP_INTEGER,  "timeout_idle",     0,  5,      "Idle timeout in seconds"),
SDATA_END()
];

let PRIVATE_DATA = {
    xmap: null,
    gesture_hint_timer: null,   /*  keeps the gesture notice up long enough  */
    geojson: null,
    resizeObserver: null,
    width: 0,      // map size, data got from resize observer
    height: 0,
    markers: {},
    draggedFeature: null,
};

let __gclass__ = null;




                    /******************************
                     *      Framework Methods
                     ******************************/




/***************************************************************
 *          Framework Method: Create
 ***************************************************************/
function mt_create(gobj)
{
    let priv = gobj.priv;

    /*
     *  CHILD subscription model
     */
    let subscriber = gobj_read_pointer_attr(gobj, "subscriber");
    if(!subscriber) {
        subscriber = gobj_parent(gobj);
    }
    gobj_subscribe_event(gobj, null, {}, subscriber);

    let map_settings = json_deep_copy(gobj_read_attr(gobj, "map_settings"));

    let $map = gobj_read_attr(gobj, "$map");
    if($map) {
        /*  Tag the external mount so this gclass is identifiable in the Inspector */
        $map.classList.add(GCLASS_NAME);
    }
    Object.assign(map_settings, {
        container: $map,
        /*  THE WHEEL DOES NOT ZOOM; Ctrl + wheel does -- the same
         *  vocabulary as the three graphs (`yui_graph_camera.js`), so a
         *  reader with a map and a graph open does not have to remember
         *  which is which. maplibre calls it `cooperativeGestures`, and
         *  it never blocks a wheel carrying ctrlKey, so a trackpad PINCH
         *  keeps zooming on every platform (a Mac gets Cmd as well, its
         *  own convention, which costs nothing).
         *
         *  HERE and not in the attr's default value: a JSON attr is
         *  replaced WHOLESALE by a host that passes its own, so a
         *  default is a suggestion -- the demo passes `map_settings` and
         *  never saw it. This is the house gesture, not a suggestion.  */
        cooperativeGestures: true,
        /*  maplibre draws words of its own -- the zoom tooltips, the
         *  geolocate button, the attribution toggle and the notice that
         *  teaches the gesture above -- and they came out in ITS
         *  English inside a Spanish app. `locale` is read once, when
         *  each control builds its DOM, so the language CHANGE is the
         *  other half, in ac_language_changed.  */
        locale: yui_maplibre_locale(t),
    });

    /*-----------------------------*
     *  Wrap event handlers
     *-----------------------------*/
    priv.onClick = (ev) => {
        onClick(gobj, ev);
    };
    priv.onMove = (ev) => {
        onMove(gobj, ev);
    };
    priv.onUp = (ev) => {
        onUp(gobj, ev);
    };
    priv.xmouseDown = (ev) => {
        xmouseDown(gobj, ev);
    };
    priv.xtouchStart = (ev) => {
        xtouchStart(gobj, ev);
    };

    /*-----------------------------*
     *      Create the Map
     *-----------------------------*/
    const map = priv.xmap = new maplibregl.Map(map_settings);

    /*  HOW LONG THE NOTICE STAYS UP.
     *
     *  maplibre shows it for 100ms and lets it FADE for a second more
     *  (`transition: opacity 1s ease 1s`). Nothing in this GUI has
     *  transitions, so that fade is cut -- and with it the only thing
     *  that made the notice readable, because 100ms is not reading
     *  time. It is held by the clock instead: on and off at once, and
     *  still in between for as long as it takes to read it.
     *
     *  In maplibre's callback and not through the machine, for the same
     *  reason as the zoom readout: it is not an action, it is the map
     *  acknowledging a gesture it refused, and one wheel fires it
     *  dozens of times.  */
    map.on("cooperativegestureprevented", () => {
        const $s = map.getCanvasContainer()
            .querySelector(".maplibregl-cooperative-gesture-screen");
        if(!$s) {
            return;
        }
        $s.classList.add("MAP_GESTURE_SHOWN");
        if(priv.gesture_hint_timer) {
            clearTimeout(priv.gesture_hint_timer);
        }
        priv.gesture_hint_timer = setTimeout(() => {
            priv.gesture_hint_timer = null;
            $s.classList.remove("MAP_GESTURE_SHOWN");
        }, GESTURE_HINT_MS);
    });

    /*-----------------------------*
     *      Controls
     *-----------------------------*/
    // priv.xmap.setRenderWorldCopies(false);
    map.addControl(new maplibregl.NavigationControl());
    map.addControl(new MarkerControl(gobj, {}), 'top-right');
    map.addControl(new EditControl(gobj, {showMarkerDrag: true}), 'top-right');

    priv.marker_user_position = new maplibregl.GeolocateControl({
        positionOptions: {
            enableHighAccuracy: true
        },
        trackUserLocation: false,
        showUserLocation: true
    });
    map.addControl(
        priv.marker_user_position,
        'top-right'
    );

    /*-----------------------------*
     *  Event handlers
     *-----------------------------*/
    map.on('load', () => {
        gobj_send_event(gobj, "EV_MAP_ON_LOAD", {}, gobj);
    });
    map.on('zoomend', () => {
        // if(priv.marker_user_position) {
        //     priv.marker_user_position._updateMarker(null);
        // }
    });

    /*-----------------------------*
     *  Watch resizer native
     *-----------------------------*/
    /* global ResizeObserver */
    if(gobj_read_bool_attr(gobj, "dimensions_with_parent_observer")) {
        // Create a ResizeObserver
        let $map = gobj_read_attr(gobj, "$map");
        const resizeObserver = priv.resizeObserver = new ResizeObserver(entries => {
            for (let entry of entries) {
                const { width, height } = entry.contentRect; // New dimensions
                priv.width = width;
                priv.height = height;

                if(height) { // update only when is not zero
                    $map.style.width = priv.width + 'px';
                    $map.style.height = priv.height + 'px';
                }

                // Con el timeout se ve de blanco a mapa pintado demasiado
                // gobj.clear_timeout();
                // gobj.set_timeout(20);
            }
        });

        // Observe the element
        resizeObserver.observe($map.parentNode);
    }
}

/***************************************************************
 *  The application changed language: maplibre's own words are
 *  rewritten in place, and the map's locale with them so a
 *  control or a popup built later is right too.
 ***************************************************************/
function ac_language_changed(gobj, event, kw, src)
{
    let priv = gobj.priv;

    if(priv.xmap) {
        yui_maplibre_relocalize(priv.xmap, t);
    }
    return 0;
}

/***************************************************************
 *          Framework Method: Start
 *
 *  The application's LANGUAGE: what maplibre draws with words is
 *  built from its `locale` when each control builds its DOM, so
 *  `refresh_language()` -- which reaches what carries an i18n key
 *  in OUR dom -- cannot touch any of it. The shell says when the
 *  language changed and this view rewrites those strings.
 ***************************************************************/
function mt_start(gobj)
{
    let shell = yui_shell_of(gobj);
    if(shell) {
        gobj_subscribe_event(shell, "EV_LANGUAGE_CHANGED", {}, gobj);
    }
    return 0;
}

/***************************************************************
 *          Framework Method: Stop
 ***************************************************************/
function mt_stop(gobj)
{
    let shell = yui_shell_of(gobj);
    if(shell) {
        gobj_unsubscribe_event(shell, "EV_LANGUAGE_CHANGED", {}, gobj);
    }
    return 0;
}

/***************************************************************
 *          Framework Method: Destroy
 ***************************************************************/
function mt_destroy(gobj)
{
    let priv = gobj.priv;

    if(priv.gesture_hint_timer) {
        clearTimeout(priv.gesture_hint_timer);
        priv.gesture_hint_timer = null;
    }
    if(priv.resizeObserver) {
        priv.resizeObserver.disconnect();
        priv.resizeObserver = null;
    }
    if(priv.xmap) {
        priv.xmap.remove();
        priv.xmap = null;
    }
}




                    /***************************
                     *      Local Methods
                     ***************************/




/************************************************************
 *
 ************************************************************/
function decod_coordinates(gobj, coordinates)
{
    let longitude = 0;
    let latitude = 0;

    if(is_array(coordinates) && coordinates.length >=2) {
        /*
         *  We use GeoJSON order: [lng,lat]
         *
         *  "geometry": {
         *      "type": "Point",
         *      "coordinates": [0, 0]
         *  }
         *
         *  WARNING Google Maps is [lat, lng]
         */
        longitude = coordinates[0];
        latitude = coordinates[1];
    } else if(is_object(coordinates)) {
        try {
            coordinates = coordinates.geometry.coordinates;
            longitude = coordinates[0];
            latitude = coordinates[1];
        } catch (e) {
            log_error(e);
        }
    }

    if (latitude > 90 || latitude < -90) {
        // TODO check form, avoid to save invalid coordinates
        latitude = 0;
        longitude = 0;
    }

    longitude = parseFloat(longitude);
    latitude = parseFloat(latitude);
    if(isNaN(longitude)) {
        longitude = 0;
    }
    if(isNaN(latitude)) {
        latitude = 0;
    }
    return {
        lng: longitude,
        lat: latitude
    };
}

/************************************************************
 *
 ************************************************************/
function get_coordinates(gobj, device)
{
    /*
     *  Coordinates can be set in device.settings or in device
     *  If devices.settings are null then get it from device
     */
    let coordinates = decod_coordinates(gobj, device.settings?.coordinates);
    if(coordinates.lng === 0 && coordinates.lat === 0) {
        coordinates = decod_coordinates(gobj, device.coordinates);
    }
    if(coordinates.lng === 0 && coordinates.lat === 0) {
        coordinates.lng = gobj_read_attr(gobj, "default_longitude");
        coordinates.lat = gobj_read_attr(gobj, "default_latitude");
    }

    return coordinates;
}

/************************************************************
 *
 ************************************************************/
function center_map(gobj, set)
{
    let priv = gobj.priv;

    const devices = gobj_read_attr(gobj, "devices");
    const bounds = new maplibregl.LngLatBounds();

    if(json_size(devices)===0) {
        return;
    }

    for(let device of devices) {
        let coords = get_coordinates(gobj, device);
        bounds.extend(coords);
    }

    priv.xmap.fitBounds(bounds, {
        padding: 50, // Padding around the edges in pixels
        animate: true, // Smooth transition to the new view
        maxZoom: 15    // Optional: Limit zoom level
    });
}

/************************************************************
 *
 ************************************************************/
function get_marker_id(id)
{
    return 'marker-' + clean_name(id);
}

/************************************************************
 *
 ************************************************************/
function devices2geojson(gobj, devices)
{
    let features = [];
    let geojson = {
        "type": "FeatureCollection",
        "features": features
    };

    for(let device of devices) {
        if(device.hide) {
            continue;
        }
        let coords = get_coordinates(gobj, device);

        // device.image = "http://localhost:8029/static/app/images/devices/enchufe.png";

        let feature = {
            "type": "Feature",
            "id": device.id,
            "geometry": {
                "type": "Point",
                "coordinates": [coords.lng, coords.lat] // GeoJSON order: lng,lat
            },
            "properties": {
                id: device.id,
                name: device.name,
                image: device.image,
                /*
                 *  A REAL boolean. Four style expressions test this with
                 *  ['case', ...], and maplibre asserts a STRICT boolean
                 *  there, so null, absent, or the 1/0 a backend may send all
                 *  fail the assertion. The consequences are not cosmetic:
                 *  the point paints with the property default instead of
                 *  green/red, and the cluster accumulator turns NULL, which
                 *  the cluster colour compares against point_count -- never
                 *  equal, so the whole cluster stays red as if something were
                 *  disconnected.
                 */
                connected: !!device.connected,
                gobj_service_name: device.gobj_service_name,
            }
        };
        features.push(feature);
    }

    return geojson;
}

/************************************************************
 *  Called from map.on('load',)
 ************************************************************/
function load_devices(gobj)
{
    let priv = gobj.priv;

    let map = priv.xmap;
    let devices = gobj_read_attr(gobj, "devices");
    const geojson_data = priv.geojson = devices2geojson(gobj, devices);

    map.addSource('devices', {
        type: 'geojson',
        data: geojson_data,
        cluster: true,
        clusterMaxZoom: 14, // Max zoom to cluster points on
        clusterRadius: 50,  // Radius of each cluster when clustering points (defaults to 50)
        clusterProperties: {
            connected: ['+', ['case', ['get', 'connected'], 1, 0]]
        }
    });

    // Add cluster circles
    map.addLayer({
        id: 'clusters',
        type: 'circle',
        source: 'devices',
        filter: ['has', 'point_count'],
        paint: {
            'circle-color': [
                'case',
                ['==', ['get', 'connected'], ['get', 'point_count']], 'green',
                'red'
            ],
            'circle-radius': [
                'step',
                ['get', 'point_count'],
                20, 10, 30, 50, 40
            ]
        }
    });

    // Add cluster count labels
    map.addLayer({
        id: 'cluster-count',
        type: 'symbol',
        source: 'devices',
        filter: ['has', 'point_count'],
        layout: {
            /*  The mark travels INSIDE the count, not as a second symbol
             *  layer on the same point: two symbols on one feature is a
             *  placement question (and the badge lost it), while a
             *  `concat` is just the label this cluster has.  */
            'text-field': ['case',
                ['<', ['get', 'connected'], ['get', 'point_count']],
                ['concat', ['get', 'point_count_abbreviated'], ' !'],
                ['get', 'point_count_abbreviated']
            ],
            'text-font': ['Noto Sans Regular'],
            'text-size': 14
        },
        /*  It had no paint at all, which is maplibre's black -- on the
         *  red circle of a cluster that is 5.25:1 and on the green one
         *  4.09, both of them a number read at a glance. White with a
         *  dark halo is 5.14 and 4.0 with the halo behind it, and it is
         *  the same ink whatever colour the cluster takes.  */
        paint: {
            'text-color': '#ffffff',
            'text-halo-color': 'rgba(0,0,0,0.35)',
            'text-halo-width': 1
        }
    });

    // Add unclustered points
    map.addLayer({
        id: 'unclustered-text',
        type: 'symbol',
        source: 'devices',
        filter: ['!', ['has', 'point_count']],
        layout: {
            'text-field': ['get', 'name'],
            'text-font': ['Noto Sans Regular'],
            'text-size': 12,
            'text-offset': [0, -2.5],
            'text-anchor': 'top'
        },
        paint: {
            /*  A label on a MAP is not text on a page: what is behind it
             *  is a tile, and a tile is any colour there is. `green` and
             *  `red` measured 4.48 and 3.48 on the beige of a typical
             *  street tile -- and over water, forest or an aerial layer
             *  the number means nothing at all. The colours are the
             *  stronger pair (4.69 / 5.66 on that beige), and the HALO
             *  is what actually carries them: it is drawn around every
             *  glyph, so the label reads on whatever the tile is.  */
            'text-color': [
                'case',
                ['get', 'connected'], '#1e7a3c',
                '#b3243a'
            ],
            'text-halo-color': '#ffffff',
            'text-halo-width': 1.4
        }
    });

    map.addLayer({
        id: 'unclustered-point',
        type: 'circle',
        source: 'devices',
        filter: ['!', ['has', 'point_count']],
        paint: {
            'circle-color': [
                'case',
                ['get', 'connected'], 'green',
                'red'
            ],
            'circle-radius': 14,
            'circle-stroke-width': 1,
            'circle-stroke-color': '#fff'
        }
    });

    /*  The state is a SHAPE too, and not only a colour.
     *
     *  Connected and disconnected were told apart by green vs red
     *  alone -- in the circles as in the labels -- and that is the one
     *  pair colour blindness does not read; in greyscale the two discs
     *  are the same disc. A device that is DOWN carries an exclamation
     *  mark on it, and a CLUSTER with something down carries the same
     *  mark as a badge at its corner (its middle is taken by the
     *  count). One glyph, legible without colour at any zoom, drawn
     *  with the font the style already loads -- no image to fetch, so
     *  it works offline like the rest of the chapter.
     *
     *  Added last, so they draw over the circles they mark.  */
    map.addLayer({
        id: 'unclustered-alert',
        type: 'symbol',
        source: 'devices',
        filter: ['all', ['!', ['has', 'point_count']], ['!', ['get', 'connected']]],
        layout: {
            'text-field': '!',
            'text-font': ['Noto Sans Regular'],
            'text-size': 18,
            'text-allow-overlap': true,
            'text-ignore-placement': true
        },
        paint: {
            'text-color': '#ffffff',
            'text-halo-color': 'rgba(0,0,0,0.45)',
            'text-halo-width': 1
        }
    });

    center_map(gobj);

    // inspect a cluster on click
    map.on('click', 'clusters', async (e) => {
        const features = map.queryRenderedFeatures(e.point, {
            layers: ['clusters']
        });
        const clusterId = features[0].properties.cluster_id;
        const zoom = await map.getSource('devices').getClusterExpansionZoom(clusterId);
        map.easeTo({
            center: features[0].geometry.coordinates,
            zoom
        });
    });

    map.on('mouseenter', 'clusters', () => {
        map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', 'clusters', () => {
        map.getCanvas().style.cursor = '';
    });

    // Handle mouseenter to show popup
    map.on('mouseenter', 'unclustered-point', (e) => {
        // Change the cursor to a pointer
        map.getCanvas().style.cursor = 'pointer';
    });

    // Handle mouseleave to hide popup
    map.on('mouseleave', 'unclustered-point', () => {
        map.getCanvas().style.cursor = '';
    });

    // Handle click event to show popup
    map.on('click', 'unclustered-point', priv.onClick);

    return 0;
}

/************************************************************
 *  Find the device in devices
 ************************************************************/
function find_device(gobj, id)
{
    let devices = gobj_read_attr(gobj, "devices");
    for(let i = 0; i < devices.length; i++) {
        let device = devices[i];
        if(device.id === id) {
            return device;
        }
    }

    log_error(`find_device: device not found ${id}`);
    return null;
}

/************************************************************
 *  Event handler for click
 ************************************************************/
function onClick(gobj, e)
{
    let priv = gobj.priv;

    const map = priv.xmap;

    // Get feature properties and coordinates
    const coordinates = e.features[0].geometry.coordinates.slice();
    const properties = e.features[0].properties;

    /*  A marker may or may not be backed by a gobj service. Only look it up
     *  when the feature carries a name (verbose=false: a marker without a
     *  service is a normal case handled by the popup branch below, not an
     *  error). gobj_find_service() would otherwise crash on undefined. */
    const gobj_service = properties.gobj_service_name
        ? gobj_find_service(properties.gobj_service_name, false)
        : null;
    if(gobj_service) {
        let name = clean_name(gobj_name(gobj_service));
        let window_service_name = `window-map-${name}`;

        let popupContent = createElement2(
            ['div',
                {
                    class: 'xmap columns m-0 p-0 is-flex-wrap-wrap',
                },
                gobj_read_attr(gobj_service, "$container")
            ]
        );

        let gobj_window = gobj_create_service(
            window_service_name,
            "C_YUI_WINDOW",
            {
                $parent: document.getElementById('top-layer'),
                width: 700,
                height: 500,
                auto_save_size_and_position: false,
                center: true,
                showMax: false,
                content_size: true,
                /*  The marker's own name: this window is one marker's
                 *  detail, and several can be open at once, so the bar
                 *  must say WHICH. It is DATA, so it travels in
                 *  title_prefix (never translated) — in `title` it
                 *  would get a data-i18n and a marker named like a
                 *  locale key ("status") would render translated. */
                title_prefix: gobj_name(gobj_service),
                title: "",
                icon: "yi-location-dot",
                logical_class: "MAP_MARKER_WINDOW",
                body: popupContent
            },
            gobj
        );
        if(!gobj_window) {
            log_error(`${gobj_name(gobj)}: cannot create the marker window`);
            return;
        }
        gobj_start(gobj_window);

    } else {
        // Initialize a popup
        const popup = new maplibregl.Popup({
            closeButton: true,
            closeOnClick: true, // Automatically close when clicking elsewhere
            closeOnMove: true,
            anchor: 'center',
            maxWidth: 'none',
        });

        const popupContent = `
            <b>${properties.name}</b><br>Id: ${properties.id}
        `;
        popup.setLngLat(coordinates).setHTML(popupContent).addTo(map);
    }
}

/************************************************************
 *  Event handlers for dragging
 ************************************************************/
function onMove(gobj, e)
{
    let priv = gobj.priv;

    const coords = e.lngLat;

    // Update the Point feature in `geojson` coordinates
    // and call setData to the source layer `point` on it.
    let device = find_device(gobj, priv.draggedFeature.properties.id);
    if(device) {
        device.settings.coordinates = [coords.lng, coords.lat];
        gobj_send_event(gobj, "EV_REFRESH", {}, gobj);
    }
}

function onUp(gobj, e)
{
    let priv = gobj.priv;

    const coords = e.lngLat;
    const map = priv.xmap;

    // Unbind mouse/touch events
    map.off('mousemove', priv.onMove);
    map.off('touchmove', priv.onMove);

    let coordinates = {};
    coordinates.latitude = coords.lat;
    coordinates.longitude = coords.lng;

    const gobj_service = gobj_find_service(
        priv.draggedFeature.properties.gobj_service_name,
        true
    );
    if(gobj_service) {
        gobj_send_event(gobj_service, "EV_SET_COORDINATES", coordinates, gobj);
    }
}

function xmouseDown(gobj, e)
{
    let priv = gobj.priv;

    // Prevent the default map drag behavior.
    e.preventDefault();

    // Save what feature is moving
    priv.draggedFeature = e.features[0];

    const map = priv.xmap;
    map.on('mousemove', priv.onMove);
    map.once('mouseup', priv.onUp);
}

function xtouchStart(gobj, e)
{
    let priv = gobj.priv;

    if (e.points.length !== 1) {
        return;
    }

    // Prevent the default map drag behavior.
    e.preventDefault();

    // Save what feature is moving
    priv.draggedFeature = e.features[0];

    const map = priv.xmap;
    map.on('touchmove', priv.onMove);
    map.once('touchend', priv.onUp);
}




                /***************************
                 *      Actions
                 ***************************/




/************************************************************
 *
 ************************************************************/
function ac_edit_map(gobj, event, kw, src)
{
    let priv = gobj.priv;

    const map = priv.xmap;
    if(kw_has_key(kw, 'enable_moving_markers')) {
        const set = kw.enable_moving_markers;

        if(set) {
            map.on('mousedown', 'unclustered-point', priv.xmouseDown);
            map.on('touchstart', 'unclustered-point', priv.xtouchStart);
            map.off('click', 'unclustered-point', priv.onClick);

        } else {
            map.off('mousedown', 'unclustered-point', priv.xmouseDown);
            map.off('touchstart', 'unclustered-point', priv.xtouchStart);
            map.on('click', 'unclustered-point', priv.onClick);
        }
    }
    return 0;
}

/************************************************************
 *  Orders (internal click) from control buttons in the map
 ************************************************************/
function ac_control_map(gobj, event, kw, src)
{
    let priv = gobj.priv;

    if(kw_has_key(kw, 'center_map')) {
        const set = kw.center_map;
        center_map(gobj, set);
    }

    if(kw_has_key(kw, 'user_location')) {
        const set = kw.user_location;
        if(set) {
            if(navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        const latitude = position.coords.latitude;
                        const longitude = position.coords.longitude;
                        priv.maker_user_location = new maplibregl.Marker()
                            .setLngLat([longitude, latitude])
                            .addTo(priv.xmap);
                        priv.xmap.setCenter([longitude, latitude]);
                    },
                    (error) => {

                    }
                );
            }

        } else {
            if(priv.maker_user_location) {
                priv.maker_user_location.remove();
                priv.maker_user_location = undefined;
            }
        }
        center_map(gobj);
    }

    return 0;
}

/************************************************************
 *  Event from map when is ready (loaded)
 ************************************************************/
function ac_map_on_load(gobj, event, kw, src)
{
    load_devices(gobj);
    return 0;
}

/************************************************************
 *
 ************************************************************/
function ac_refresh(gobj, event, kw, src)
{
    let priv = gobj.priv;
    let devices = gobj_read_attr(gobj, "devices");

    let map = priv.xmap;

    /*
     *  Ask for the source, do not infer it from the style. 'devices' is added
     *  by load_devices() on the map 'load' event, which is a LATER milestone:
     *  isStyleLoaded() is already true one render frame before 'load' fires,
     *  and getSource() is undefined in that frame. Nothing is lost by
     *  skipping, load_devices() reads the same attr.
     *
     *  Testing the style was also wrong the other way: it goes back to false
     *  while new tiles load, so every refresh during a pan or a zoom was
     *  silently dropped and the devices stopped moving.
     */
    const source = map.getSource('devices');
    if(!source) {
        return 0;
    }

    source.setData(devices2geojson(gobj, devices));
    return 0;
}

/************************************************************
 *
 ************************************************************/
function ac_select(gobj, event, kw, src)
{
    return 0;
}

/************************************************************
 *
 ************************************************************/
function ac_show(gobj, event, kw, src)
{
    let priv = gobj.priv;

    if(gobj_read_bool_attr(gobj, "dimensions_with_parent_observer")) {
        let $map = gobj_read_attr(gobj, "$map");
        $map.style.width = priv.width + 'px';
        $map.style.height = priv.height + 'px';
    }

    return 0;
}

/************************************************************
 *
 ************************************************************/
function ac_hide(gobj, event, kw, src)
{
    return 0;
}




                    /***************************
                     *          FSM
                     ***************************/




/*---------------------------------------------*
 *          Global methods table
 *---------------------------------------------*/
const gmt = {
    mt_create:  mt_create,
    mt_start:   mt_start,
    mt_stop:    mt_stop,
    mt_destroy: mt_destroy
};

/***************************************************************
 *          Create the GClass
 ***************************************************************/
function create_gclass(gclass_name)
{
    if(__gclass__) {
        log_error(`GClass ALREADY created: ${gclass_name}`);
        return -1;
    }

    /*---------------------------------------------*
     *          States
     *---------------------------------------------*/
    const states = [
        ["ST_IDLE", [
            ["EV_LANGUAGE_CHANGED",         ac_language_changed,    null],
            ["EV_EDIT_MAP",                 ac_edit_map,            null],
            ["EV_CONTROL_MAP",              ac_control_map,         null],
            ["EV_MAP_ON_LOAD",              ac_map_on_load,         null],
            ["EV_REFRESH",                  ac_refresh,             null],
            ["EV_SELECT",                   ac_select,              null],
            ["EV_SHOW",                     ac_show,                null],
            ["EV_HIDE",                     ac_hide,                null]
        ]]
    ];

    /*---------------------------------------------*
     *          Events
     *---------------------------------------------*/
    const event_types = [
        ["EV_LANGUAGE_CHANGED",         0],
        ["EV_EDIT_MAP",                 0],
        ["EV_CONTROL_MAP",              0],
        ["EV_MAP_ON_LOAD",              0],
        ["EV_REFRESH",                  0],
        ["EV_SELECT",                   0],
        ["EV_SHOW",                     0],
        ["EV_HIDE",                     0]
    ];

    __gclass__ = gclass_create(
        gclass_name,
        event_types,
        states,
        gmt,
        0,  // lmt,
        attrs_table,
        PRIVATE_DATA,
        0,  // authz_table,
        0,  // command_table,
        0,  // s_user_trace_level
        0   // gclass_flag
    );

    if(!__gclass__) {
        return -1;
    }

    return 0;
}

/***************************************************************
 *          Register GClass
 ***************************************************************/
function register_c_yui_map()
{
    return create_gclass(GCLASS_NAME);
}

export { register_c_yui_map };
