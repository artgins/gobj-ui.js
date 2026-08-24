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
 *   A refresh button, for the graphs that offer one.
 ************************************************************/
export function yui_graph_refresh_item(gobj, wide)
{
    return camera_button(gobj, "yi-arrows-rotate", "EV_REFRESH", "refresh", wide);
}
