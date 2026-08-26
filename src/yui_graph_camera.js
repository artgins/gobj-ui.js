/***********************************************************************
 *          yui_graph_camera.js
 *
 *  The camera and fold controls a G6 graph puts in a DOM toolbar,
 *  built in ONE place.
 *
 *  This module exists because the same action was drawn three
 *  different ways across sibling views — actual size as a bare
 *  magnifier here and as `1:1` there, fit as `arrows-to-eye` here and
 *  as corner brackets there, fold as chevrons here and as an eye
 *  there.  A user sees two of these graphs side by side in the same
 *  console, so a copied-and-drifted toolbar is not a detail.
 *
 *  The VOCABULARY is not invented here.  It is the one
 *  `c_g6_nodes_tree.js` settled on for the treedb graph, which draws
 *  its toolbar as a G6 plugin over an SVG sprite and therefore cannot
 *  share this code — only its decisions:
 *
 *      zoom in / zoom out      magnifiers
 *      zoom level              a READOUT, because without it "1:1" is
 *                              a jump to a value nobody was told
 *      fit                     corner brackets (`yi-fit`, the same
 *                              path as the sprite's `g6-icon-fit`)
 *      actual size             the WRITTEN `1:1` — the action is
 *                              `zoomTo(1)`, and actual size is written
 *                              in every editor that offers it, never
 *                              drawn, because there is no glyph for it
 *
 *  Fold is the one the treedb graph does not have, so its vocabulary
 *  comes from the other side of the family: the lazy tree viewer's own
 *  toolbar (`c_yui_json.js`) uses chevrons — open pointing down, closed
 *  pointing right — which is also the direction the per-node handles
 *  speak.  An eye means show/hide, which is a different idea.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {createElement2, gobj_send_event} from "@yuneta/gobj-js";

import {t} from "i18next";

import {set_pressed_state} from "./lib_graph.js";


/************************************************************
 *   One icon button that fires `event_name`.
 ************************************************************/
function camera_button(gobj, icon, event_name, label_key, wide, extra_style)
{
    return ['button', {class: `button ${event_name}`, type: 'button',
                       style: {height: wide, width: '2.5em'},
                       title: t(label_key), 'data-i18n-title': label_key,
                       'aria-label': t(label_key), 'data-i18n-aria-label': label_key},
        ['i', {style: 'font-size:1.5em; color:inherit;' + (extra_style || ''),
               class: icon}],
        {
            click: (evt) => {
                evt.stopPropagation();
                gobj_send_event(gobj, event_name, {evt: evt}, gobj);
            }
        }
    ];
}

/************************************************************
 *   The current zoom as a percentage.
 ************************************************************/
export function yui_graph_zoom_text(graph)
{
    if(!graph) {
        return "100%";
    }
    try {
        return Math.round(graph.getZoom() * 100) + "%";
    } catch(e) {
        return "100%";
    }
}

/************************************************************
 *   Repaint the readout of a container that carries one.
 *
 *   Call it from G6's `aftertransform`, which is the ONE hook
 *   that also covers the WHEEL — a camera change that passes
 *   through no action, so repainting from each zoom action
 *   leaves the number lying after every notch.
 ************************************************************/
export function yui_graph_update_zoom($container, graph)
{
    if(!$container) {
        return;
    }
    let $readout = $container.querySelector('.GRAPH_ZOOM_LEVEL');
    if(!$readout) {
        return;     /*  a toolbar without a readout: nobody to report to  */
    }
    $readout.textContent = yui_graph_zoom_text(graph);
}

/************************************************************
 *   The camera cluster: zoom in, zoom out, readout, fit,
 *   actual size.  Returns createElement2 specs, in order.
 *
 *   `wide` is the host toolbar's button height.
 ************************************************************/
export function yui_graph_camera_items(gobj, graph, wide)
{
    return [
        camera_button(gobj, "yi-magnifying-glass-plus", "EV_ZOOM_IN", "zoom in", wide),
        camera_button(gobj, "yi-magnifying-glass-minus", "EV_ZOOM_OUT", "zoom out", wide),
        ['span', {class: 'GRAPH_ZOOM_LEVEL is-flex is-align-items-center px-2 has-text-grey',
                  style: 'font-size:.85rem; min-width:3.5em; justify-content:center;',
                  title: t('zoom level'), 'data-i18n-title': 'zoom level'},
         yui_graph_zoom_text(graph)],
        camera_button(gobj, "yi-fit", "EV_CENTER", "auto fit", wide),
        /*  Written, not drawn — see the header.  */
        ['button', {class: 'button EV_ZOOM_RESET', type: 'button',
                    style: {height: wide, width: '2.5em'},
                    title: t('actual size'), 'data-i18n-title': 'actual size',
                    'aria-label': t('actual size'), 'data-i18n-aria-label': 'actual size'},
         ['span', {style: 'font-weight:700;'}, '1:1'],
         {
             click: (evt) => {
                 evt.stopPropagation();
                 gobj_send_event(gobj, "EV_ZOOM_RESET", {evt: evt}, gobj);
             }
         }]
    ];
}

/************************************************************
 *   The fold pair: expand all, collapse all.  Chevrons, the
 *   open one rotated down — the same pair the lazy tree
 *   viewer's toolbar uses, and the same direction the
 *   per-node handles speak.
 ************************************************************/
export function yui_graph_fold_items(gobj, wide)
{
    return [
        camera_button(gobj, "yi-chevron-right", "EV_EXPAND_ALL", "expand all", wide,
            ' transform: rotate(90deg);'),
        camera_button(gobj, "yi-chevron-right", "EV_COLLAPSE_ALL", "collapse all", wide),
    ];
}

/************************************************************
 *   The ANCHOR toggle: pick one element and every camera move
 *   from then on leaves it in the MIDDLE.
 *
 *   Why it exists: a graph that fits on screen is unreadable at
 *   the zoom that makes it fit, and the zoom that makes it
 *   readable does not fit -- so the useful view is always a
 *   fraction of the document, and which fraction is the whole
 *   question.  Without an anchor, `1:1` lands wherever the
 *   layout's origin happens to be and the reader hunts for the
 *   node they were looking at.
 *
 *   Crosshairs and not a thumbtack.  A tack says "do not move
 *   this", which is what a pinned NODE would mean in a graph you
 *   can drag nodes around in; this pins the CAMERA to a target,
 *   which is what a crosshair says and what every map that
 *   offers it draws.  It is also in the icon set already, and a
 *   `yi-*` class that is not is a black square.
 *
 *   Three states, because two would not say what a press does:
 *
 *      off      no target; the camera behaves as it always did
 *      arming   waiting for you to click the element you mean
 *      on       locked; every zoom re-centres on it
 ************************************************************/
export function yui_graph_anchor_item(gobj, wide)
{
    return camera_button(gobj, "yi-location-crosshairs", "EV_TOGGLE_ANCHOR",
                         "anchor view", wide);
}

/************************************************************
 *   Paint the anchor button.  `state` is "off" | "arming" | "on".
 *
 *   Both live states look PRESSED, because both are states the
 *   control is IN rather than actions; what separates them is the
 *   colour, and only the waiting one takes a palette colour --
 *   it is the one that needs the reader to do something next.
 ************************************************************/
export function yui_graph_update_anchor($container, state)
{
    if(!$container) {
        return;
    }
    let $btn = $container.querySelector('.EV_TOGGLE_ANCHOR');
    if(!$btn) {
        return;     /*  a toolbar without the control: nothing to paint  */
    }
    /*
     *  PRESSED is "on", and only "on": pressed is the state the control
     *  is IN, and while it is arming it is not in that state yet, it is
     *  asking for something. That gets the attention colour instead --
     *  which also keeps the two off each other, since an orange glyph on
     *  the pressed fill is orange on near-white in dark and unreadable.
     */
    set_pressed_state($container, '.EV_TOGGLE_ANCHOR', state === "on");
    $btn.classList.toggle('color_pending_state', state === "arming");
    $btn.setAttribute("aria-pressed", (state === "on")? "true": "false");

    let key = (state === "arming")? "click the element to centre on"
            : (state === "on")? "centred: click to release"
            : "anchor view";
    $btn.setAttribute("title", t(key));
    $btn.setAttribute("data-i18n-title", key);
    $btn.setAttribute("aria-label", t(key));
    $btn.setAttribute("data-i18n-aria-label", key);
}

/************************************************************
 *   Put `node_id` back in the middle of the viewport.
 *
 *   Called AFTER the camera moved, never instead of moving it:
 *   the zoom is what the reader asked for, the centring is what
 *   keeps the thing they are reading under their eyes.
 *
 *   The translate is computed and applied HERE rather than
 *   delegated to `graph.focusElement()`, which is the obvious
 *   call and does NOT work on these graphs. Measured: it
 *   resolves, having computed the very offset wanted -- `[0,
 *   306]` for a card 306px above centre -- and the camera does
 *   not move. `getPosition()` reads the same before and after,
 *   and so does the card's box on screen. Three public calls do
 *   move it, so that is what is used.
 *
 *   Guarded on every side because it runs on every wheel notch:
 *   a graph mid-rebuild, an anchor whose node went away with a
 *   fold, a G6 missing one of these calls -- none of those is
 *   an error worth a log line per notch, they are all "there is
 *   nothing to centre right now".
 ************************************************************/
const __centring__ = new WeakMap();

export async function yui_graph_center_on(graph, node_id)
{
    if(!graph || !node_id) {
        return false;
    }

    /*
     *  ONE centring at a time, per graph.
     *
     *  This runs on every zoom notch, and one run is several awaited
     *  camera moves. A wheel gesture is a BURST of notches, so without
     *  this the runs overlap: each one measures a position another one
     *  is in the middle of changing, and they walk the camera around
     *  instead of converging -- which reads as a graph that pans and
     *  never centres.
     *
     *  A request that arrives mid-run is not dropped, it is remembered:
     *  the last one wins and runs once at the end, which is the only
     *  one whose answer is still true.
     */
    let st = __centring__.get(graph);
    if(st && st.running) {
        st.again = node_id;
        return true;
    }
    __centring__.set(graph, {running: true, again: null});

    try {
        if(typeof graph.getElementData === "function" && !graph.getElementData(node_id)) {
            return false;
        }
        if(typeof graph.getElementPosition !== "function" ||
                typeof graph.getViewportByCanvas !== "function" ||
                typeof graph.getCanvasCenter !== "function" ||
                typeof graph.translateTo !== "function") {
            return false;
        }

        /*
         *  MEASURE, MOVE, MEASURE AGAIN -- up to three times.
         *
         *  Not the arithmetic anybody would write first, and the reason
         *  is worth keeping. The obvious call is `graph.focusElement()`,
         *  which computes the very offset wanted and then does not move
         *  the camera at all: measured on the JSON graph it resolves
         *  with `getPosition()` reading identical before and after.
         *  `translateBy()` (a RELATIVE transform) behaves the same way.
         *  `translateTo()` (ABSOLUTE) does move it -- and the units of
         *  its argument are not viewport pixels at any zoom but 1, so
         *  one shot lands short or long by a factor nobody should have
         *  to name.
         *
         *  Probing for that factor gives noise: the camera settles
         *  asynchronously, so a position read straight after a
         *  translate is a value halfway through. AWAITING each move and
         *  measuring again needs no factor at all -- the direction is
         *  right, so the residual falls to nothing in two or three
         *  passes, and a graph whose maths change under us keeps
         *  working.
         *
         *  The 1px floor is what stops it converging forever on the
         *  rounding.
         */
        for(let i = 0; i < 3; i++) {
            let at = graph.getViewportByCanvas(graph.getElementPosition(node_id));
            let want = graph.getCanvasCenter();
            let dx = want[0] - at[0];
            let dy = want[1] - at[1];

            if(Math.abs(dx) < 1 && Math.abs(dy) < 1) {
                break;
            }
            let pos = graph.getPosition();
            await graph.translateTo([pos[0] + dx, pos[1] + dy]);
        }
        return true;
    } catch(e) {
        return false;   /*  the element is gone, or the graph is between renders  */
    } finally {
        let pending = __centring__.get(graph);
        __centring__.set(graph, {running: false, again: null});
        if(pending && pending.again) {
            yui_graph_center_on(graph, pending.again);
        }
    }
}

/************************************************************
 *   A refresh button, for the graphs that offer one.
 ************************************************************/
export function yui_graph_refresh_item(gobj, wide)
{
    return camera_button(gobj, "yi-arrows-rotate", "EV_REFRESH", "refresh", wide);
}
