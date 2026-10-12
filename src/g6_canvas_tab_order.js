/***********************************************************************
 *          g6_canvas_tab_order.js
 *
 *          The canvases of a G6 graph in the page's Tab order: the main
 *          one in its place, the other layers out of it.
 *
 *          G6 stacks four canvases (background, main, label, transient)
 *          and gives each of them `tabIndex = 1` (configCanvasDom, when it
 *          builds the Canvas and again on a renderer change). A POSITIVE
 *          tabindex goes before every control of the page: Tab from a
 *          graph went to its other canvases, then to the top of the page
 *          and through every control there, and only then to the graph's
 *          own buttons. The main canvas -- the one G6 listens on, and the
 *          one a view puts the keyboard on -- takes 0, so Tab goes from it
 *          to the graph's toolbars and buttons in DOM order; the other
 *          layers receive nothing (`pointer-events: none`) and take -1.
 *
 *          Every view that creates a G6 Graph calls
 *          keep_canvas_tab_order() right after `new Graph()`: the order is
 *          put right each time G6 writes the 1 -- once the canvas is built
 *          (on the first render(), whichever function of the view calls
 *          it), and after a renderer change. One place, so a view with
 *          several render() calls cannot miss the one that builds the
 *          canvas.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {
    gobj_short_name,
    log_error,
} from "@yuneta/gobj-js";

import {GraphEvent} from "@antv/g6";

/************************************************************
 *  Main canvas 0, every other layer -1. Returns 0, or -1 with
 *  the cause logged.
 ************************************************************/
function set_canvas_tab_order(gobj, graph)
{
    let canvas = graph? graph.getCanvas() : null;

    if(!canvas || typeof canvas.getLayers !== "function") {
        log_error(`${gobj_short_name(gobj)}: no canvas to set the Tab order of`);
        return -1;
    }

    let ret = 0;
    let layers = canvas.getLayers() || {};
    for(let name of Object.keys(layers)) {
        let $el = null;
        try {
            $el = layers[name].getContextService().getDomElement();
        } catch(e) {
            $el = null;
        }
        if(!$el) {
            log_error(`${gobj_short_name(gobj)}: canvas layer '${name}' has no element`);
            ret = -1;
            continue;
        }
        $el.tabIndex = (name === "main")? 0 : -1;
    }
    return ret;
}

/************************************************************
 *  Keep the order for the life of `graph`: on every moment G6
 *  writes its own.
 ************************************************************/
function keep_canvas_tab_order(gobj, graph)
{
    for(let ev of [GraphEvent.AFTER_CANVAS_INIT, GraphEvent.AFTER_RENDERER_CHANGE]) {
        graph.on(ev, () => {
            set_canvas_tab_order(gobj, graph);
        });
    }
}

export {
    set_canvas_tab_order,
    keep_canvas_tab_order,
};
