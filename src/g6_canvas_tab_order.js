/***********************************************************************
 *          g6_canvas_tab_order.js
 *
 *          The canvases of a G6 graph in the page's Tab order: the main
 *          one in its place, and NAMED; the other layers out of it.
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
 *          A canvas in the Tab order is a control, and a control has a
 *          name: the main canvas carries a `title` and an `aria-label`,
 *          through t() and each with its key, that say WHICH graph it is
 *          -- the key is the view's, one per gclass ("json graph",
 *          "schema graph"...). From 7.26.28 to 7.26.41 Tab landed on it
 *          and a reader announced nothing. The keys are what a language
 *          switch reaches (refresh_language()), as on any control. It is
 *          a `region`, as maplibre makes its own canvas: a name on an
 *          element with no role is one ARIA forbids, and a reader is not
 *          bound to say it.
 *
 *          And it can be SEEN when it has the focus: G6 writes `outline:
 *          none` on its canvases, inline, so a keyboard that Tabbed onto
 *          the graph had no sign of where it was. The main canvas takes
 *          the `G6_MAIN_CANVAS` class, and g6_canvas_tab_order.css --
 *          imported here, so it comes with the module to every view --
 *          draws a ring on it at `:focus-visible`.
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
import {t} from "i18next";

import "./g6_canvas_tab_order.css";

/************************************************************
 *  Main canvas 0, named by `name_key`, and marked for its
 *  focus ring; every other layer -1. Returns 0, or -1 with the
 *  cause logged.
 ************************************************************/
function set_canvas_tab_order(gobj, graph, name_key)
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
        if(name !== "main") {
            $el.tabIndex = -1;
            continue;
        }
        $el.tabIndex = 0;
        $el.classList.add("G6_MAIN_CANVAS");
        $el.setAttribute("role", "region");
        $el.setAttribute("title", t(name_key));
        $el.setAttribute("data-i18n-title", name_key);
        $el.setAttribute("aria-label", t(name_key));
        $el.setAttribute("data-i18n-aria-label", name_key);
    }
    return ret;
}

/************************************************************
 *  Keep the order, and the name, for the life of `graph`: on
 *  every moment G6 writes its own.
 ************************************************************/
function keep_canvas_tab_order(gobj, graph, name_key)
{
    for(let ev of [GraphEvent.AFTER_CANVAS_INIT, GraphEvent.AFTER_RENDERER_CHANGE]) {
        graph.on(ev, () => {
            set_canvas_tab_order(gobj, graph, name_key);
        });
    }
}

export {
    set_canvas_tab_order,
    keep_canvas_tab_order,
};
