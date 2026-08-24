/***********************************************************************
 *          g6_touch_gestures.js
 *
 *          The two gestures a G6 graph needs on a touch screen and
 *          does not have: PINCH to zoom, and LONG PRESS to open the
 *          context menu.
 *
 *          Why this exists
 *          ----------------
 *          G6 v5 draws a graph that reads fine on a phone and cannot
 *          be OPERATED on one.  Two gaps, both structural:
 *
 *          1. `zoom-canvas` binds the WHEEL and nothing else
 *             (`trigger: []`).  There is no wheel on a phone, so the
 *             only zoom is the toolbar's +/- buttons.  G6 does ship a
 *             pinch recogniser, and `zoom-canvas` will use it -- with
 *             `trigger: ['pinch']`, which its `bindEvents` treats as
 *             an ALTERNATIVE to the wheel (`if pinch ... else wheel`),
 *             so opting in costs the mouse.  Worse, its `PinchHandler`
 *             keeps its instance and its callback list in STATICS: on
 *             a page with two graphs the second one registers its
 *             callback against the FIRST one's emitter, so pinching
 *             graph A zooms both and pinching graph B does nothing.
 *             We recognise the gesture ourselves, per graph.
 *
 *          2. The context menu is bound to `contextmenu`, and G6 does
 *             not take that from the DOM: its `BehaviorController`
 *             SYNTHESISES it from `pointerdown` with `button === 2`.
 *             A long press therefore never reaches the plugin on ANY
 *             platform, whatever the browser does with the gesture.
 *             So we synthesise it the same way G6 does, from the same
 *             forwarded event object -- which is why the plugin's
 *             `getItems(e)` receives exactly the shape it expects.
 *
 *          Both are built on ONE per-graph record of the fingers
 *          on the glass, read from the NATIVE touch events -- see
 *          `touch_state_of` for why the pointer stream, which looks
 *          like the right source, is not.  That record is also what
 *          tells `drag-canvas` to stop panning while two fingers are
 *          down (`is_pinching`), the guard G6's own drag-canvas has
 *          and our replacement dropped.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {
    ZoomCanvas,
    CommonEvent,
    ExtensionCategory,
    register,
} from '@antv/g6';


/***************************************************************
 *              Constants
 ***************************************************************/

/*
 *  How long a finger must stay put to mean "context menu", and how
 *  far it may wander first.  500ms is what Android and iOS both use
 *  for their own long press; a shorter one fires while the user is
 *  still deciding whether to pan.
 */
const LONG_PRESS_MS   = 500;
const LONG_PRESS_SLOP = 10;     /* CSS px */


/***************************************************************
 *      Per-graph record of the fingers on the glass
 ***************************************************************/
const __touch_state__ = new WeakMap();

/************************************************************
 *   The touch record of one graph, installing its listeners
 *   the first time it is asked for.
 *
 *   Read from the NATIVE touch events, not from G6's
 *   forwarded pointer stream.
 *
 *   The pointer stream looks like the right source and is
 *   not: @antv/g re-issues pointer ids in the middle of a
 *   two-finger gesture (measured: a pinch that started on
 *   ids 2 and 3 finished on id 1), so anything that keys a
 *   Map on `pointerId` loses one of the two fingers halfway
 *   and reads the gesture as a fraction of what it was.
 *   G6's own `PinchHandler` is built exactly that way.
 *
 *   `event.touches` needs no bookkeeping at all: it IS the
 *   list of fingers currently down, re-stated on every event.
 ************************************************************/
function touch_state_of(graph)
{
    let state = __touch_state__.get(graph);
    if(state) {
        return state;
    }

    state = {
        count:     0,       /* fingers on the glass right now  */
        container: null,
    };
    __touch_state__.set(graph, state);

    let container = graph.getCanvas?.()?.getContainer?.();
    if(!container) {
        return state;       /*  no DOM yet: nothing to listen to  */
    }
    state.container = container;

    let read = (event) => {
        state.count = event.touches? event.touches.length: 0;
    };

    /*  Passive: we never preventDefault here -- the canvas already
     *  carries `touch-action: none`, which is what actually stops
     *  the browser from panning the page under the graph.  */
    container.addEventListener("touchstart",  read, {passive: true});
    container.addEventListener("touchmove",   read, {passive: true});
    container.addEventListener("touchend",    read, {passive: true});
    container.addEventListener("touchcancel", read, {passive: true});

    return state;
}

/************************************************************
 *   Is a two-finger gesture in progress on this graph?
 *
 *   Read by our `drag-canvas` replacement: panning and zooming
 *   the same drag at the same time fights the user for the
 *   camera.
 ************************************************************/
export function is_pinching(graph)
{
    if(!graph) {
        return false;
    }
    let state = __touch_state__.get(graph);
    if(!state) {
        return false;   /*  no touch gesture was ever installed here  */
    }
    return state.count >= 2;
}




                    /***************************
                     *      Pinch to zoom
                     ***************************/




/************************************************************
 *   `zoom-canvas` that also answers the pinch.
 *
 *   The base class keeps the wheel; the pinch is added on top
 *   instead of replacing it, so one build serves the mouse and
 *   the finger.  The scale is ABSOLUTE against the zoom the
 *   gesture started at -- G6's own pinch feeds `zoom()` an
 *   increment per frame, which drifts away from the fingers
 *   over a long gesture.
 ************************************************************/
class ZoomCanvasPinch extends ZoomCanvas
{
    constructor(context, options)
    {
        super(context, options);

        this._pinch_dist0   = 0;
        this._pinch_zoom0   = 1;
        this._on_touch_move = null;

        let {trigger} = this.options;
        if(Array.isArray(trigger) && trigger.includes(CommonEvent.PINCH)) {
            return;     /*  the caller asked for G6's own pinch  */
        }

        let graph = this.context.graph;
        let state = touch_state_of(graph);
        if(!state.container) {
            return;
        }

        this._on_touch_move = (event) => {
            let touches = event.touches;
            if(!touches || touches.length !== 2) {
                /*  Not two fingers (yet, or any more): the next pinch
                 *  measures itself afresh.  */
                this._pinch_dist0 = 0;
                return;
            }
            let dx = touches[0].clientX - touches[1].clientX;
            let dy = touches[0].clientY - touches[1].clientY;
            let dist = Math.sqrt(dx * dx + dy * dy);
            if(dist <= 0) {
                return;
            }
            if(this._pinch_dist0 === 0) {
                /*  First frame of this gesture: remember what it is
                 *  measured against.  */
                this._pinch_dist0 = dist;
                this._pinch_zoom0 = graph.getZoom();
                return;
            }
            this._pinch_to(dist / this._pinch_dist0, touches, event);
        };

        /*
         *  Bound on the CONTAINER and not through `bindEvents()`,
         *  which `update()` runs again on every option change: the
         *  wheel goes through `Shortcut`, which unbinds itself
         *  first, and a listener put straight on an element would
         *  simply pile up.
         */
        state.container.addEventListener(
            "touchmove", this._on_touch_move, {passive: true}
        );
    }

    /************************************************************
     *   Zoom to `scale` times the zoom the pinch started at,
     *   about the midpoint between the two fingers.
     *
     *   ABSOLUTE against the start of the gesture, where G6's
     *   own pinch feeds `zoom()` an increment per frame: an
     *   increment drifts away from the fingers over a long
     *   gesture, and cannot come back when they close again.
     ************************************************************/
    _pinch_to(scale, touches, event)
    {
        if(!this.validate(event)) {
            return;
        }
        let graph  = this.context.graph;
        let state  = touch_state_of(graph);
        let origin = null;

        /*  The camera's origin is measured in the canvas's own
         *  viewport space, which is the container box: the canvas
         *  fills it, so the offset IS the container's corner.  */
        let rect = state.container?.getBoundingClientRect();
        if(rect) {
            origin = [
                (touches[0].clientX + touches[1].clientX) / 2 - rect.left,
                (touches[0].clientY + touches[1].clientY) / 2 - rect.top,
            ];
        }

        /*  `zoomTo` clamps to the graph's own `zoomRange`; no
         *  animation, the fingers are the animation.  */
        graph.zoomTo(this._pinch_zoom0 * scale, false, origin);
        this.options.onFinish?.();
    }

    destroy()
    {
        if(this._on_touch_move) {
            let state = __touch_state__.get(this.context.graph);
            state?.container?.removeEventListener("touchmove", this._on_touch_move);
            this._on_touch_move = null;
        }
        super.destroy();
    }
}

/************************************************************
 *   Register once, over the built-in `zoom-canvas`, so every
 *   graph (tree, json, treedb, editor) pinches without
 *   touching its behaviors list.
 ************************************************************/
let __zoom_canvas_patched__ = false;

export function ensure_pinch_zoom_patch()
{
    if(__zoom_canvas_patched__) {
        return;
    }
    register(ExtensionCategory.BEHAVIOR, 'zoom-canvas', ZoomCanvasPinch);
    __zoom_canvas_patched__ = true;
}




                    /***************************
                     *      Long press
                     ***************************/




/************************************************************
 *   Make a long press open the context menu.
 *
 *   Returns the function that uninstalls it.
 *
 *   The menu the press opens is whatever the `contextmenu`
 *   plugin builds: we re-emit G6's own forwarded event under
 *   the name the plugin listens for, so `getItems(e)` and
 *   `enable(e)` see the same object a right-click would give
 *   them -- same `target`, same `targetType`, same `client`.
 ************************************************************/
export function install_long_press_contextmenu(graph)
{
    if(!graph) {
        return () => {};
    }

    let state = touch_state_of(graph);
    let pending = null;         /* {timer, x, y, event} */

    let cancel = () => {
        if(pending) {
            clearTimeout(pending.timer);
            pending = null;
        }
    };

    let fire = (event) => {
        pending = null;

        /*
         *  The tap that ENDS the long press would reach the plugin's
         *  own `document` click listener and hide the menu the press
         *  just opened -- a right click never produces a `click`, so
         *  the plugin has no reason to guard against it.  Swallow
         *  that one click in the CAPTURE phase, where document sees
         *  it before anything else does.
         */
        let swallow = (evt) => {
            evt.stopPropagation();
            document.removeEventListener("click", swallow, true);
        };
        document.addEventListener("click", swallow, true);
        setTimeout(() => {
            document.removeEventListener("click", swallow, true);
        }, 1000);

        /*
         *  And the browser's own long-press menu, which would open on
         *  top of ours.  One shot: a later right click must keep
         *  reaching the plugin.
         */
        let container = graph.getCanvas?.()?.getContainer?.();
        if(container) {
            container.addEventListener("contextmenu", (evt) => {
                evt.preventDefault();
            }, {once: true, capture: true});
        }

        graph.emit(`${event.targetType}:${CommonEvent.CONTEXT_MENU}`, event);
        graph.emit(CommonEvent.CONTEXT_MENU, event);
    };

    let on_down = (event) => {
        cancel();
        if(event.pointerType !== "touch") {
            return;     /*  a mouse holding its button is not a menu  */
        }
        if(state.count > 1) {
            return;     /*  two fingers: that is the pinch  */
        }
        let x = event.client?.x;
        let y = event.client?.y;
        if(x === undefined || y === undefined) {
            return;
        }
        /*
         *  The event object is reused by @antv/g between dispatches,
         *  so what the timer must carry is a COPY -- by the time it
         *  fires, the live object describes the pointerup.
         */
        let frozen = Object.assign({}, event);
        pending = {
            x: x,
            y: y,
            timer: setTimeout(() => {
                fire(frozen);
            }, LONG_PRESS_MS),
        };
    };

    let on_move = (event) => {
        if(!pending) {
            return;
        }
        if(state.count > 1) {
            cancel();
            return;
        }
        let x = event.client?.x;
        let y = event.client?.y;
        if(x === undefined || y === undefined) {
            return;
        }
        if(Math.abs(x - pending.x) > LONG_PRESS_SLOP ||
                Math.abs(y - pending.y) > LONG_PRESS_SLOP) {
            cancel();
        }
    };

    graph.on(CommonEvent.POINTER_DOWN, on_down);
    graph.on(CommonEvent.POINTER_MOVE, on_move);
    graph.on(CommonEvent.POINTER_UP,   cancel);

    return () => {
        cancel();
        graph.off(CommonEvent.POINTER_DOWN, on_down);
        graph.off(CommonEvent.POINTER_MOVE, on_move);
        graph.off(CommonEvent.POINTER_UP,   cancel);
    };
}
