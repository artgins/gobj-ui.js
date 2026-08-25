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
 *             ONE finger has to serve three commands -- move the
 *             node, act on it, open its menu -- so the press is
 *             arbitrated, and arbitrated at the RELEASE:
 *
 *                 moved                -> drag
 *                 still, let go fast   -> the element's own action
 *                 still, held >= 500ms -> the context menu
 *
 *             A menu opened on a TIMER instead cannot be arbitrated
 *             at all: it opens while `drag-element` is already
 *             carrying the node, so the same press means both things
 *             and the user gets a menu over a card running away
 *             underneath it.  `classify_press` is where the three
 *             live, and it is pure.
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

import {press_moved, classify_press, LONG_PRESS_MS} from "./press_arbiter.js";


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
        multi:     false,   /* two or more were down in THIS gesture */
        container: null,
        /*  A long press fired, and the click that @antv/g makes out
         *  of the same pointerup has not been answered yet.  */
        long_press_click: false,
    };
    __touch_state__.set(graph, state);

    let container = graph.getCanvas?.()?.getContainer?.();
    if(!container) {
        return state;       /*  no DOM yet: nothing to listen to  */
    }
    state.container = container;

    let read = (event) => {
        state.count = event.touches? event.touches.length: 0;
        if(state.count >= 2) {
            /*  Sticky until the LAST finger goes: a pinch releases its
             *  two fingers one at a time, and the release of the first
             *  one must not be read as the end of a press.  */
            state.multi = true;
        } else if(state.count === 0) {
            state.multi = false;
        }
    };

    /*  Passive: we never preventDefault here -- the canvas already
     *  carries `touch-action: none`, which is what actually stops
     *  the browser from panning the page under the graph.  */
    container.addEventListener("touchstart",  read, {passive: true});
    container.addEventListener("touchmove",   read, {passive: true});
    container.addEventListener("touchend",    read, {passive: true});
    container.addEventListener("touchcancel", read, {passive: true});

    /*
     *  The browser opens its OWN menu on a long press, and it opens it
     *  while the finger is still down -- on top of whatever the graph
     *  is about to do with the same press.  Refuse it for as long as
     *  there is a finger on the glass.
     *
     *  This costs the graph nothing: G6 reads no `contextmenu` from
     *  the DOM at all (it synthesises its own from `pointerdown` with
     *  `button === 2`), so a real right click keeps working with its
     *  DOM event refused -- and it is not refused here anyway, because
     *  a mouse leaves `count` at zero.
     */
    container.addEventListener("contextmenu", (event) => {
        if(state.count > 0) {
            event.preventDefault();
        }
    }, {capture: true});

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
 *   Is the click being dispatched right now the tail of a long
 *   press?  Answers true ONCE, to the first asker.
 *
 *   @antv/g does not take `click` from the DOM either: it makes
 *   one out of the pointerdown/pointerup pair itself, inside
 *   the same `onPointerUp` that just fed us the release.  So
 *   the press that opened the menu goes on to click whatever it
 *   opened the menu ON -- selecting the node, or worse, dropping
 *   a selection of several -- unless the handler asks.
 ************************************************************/
export function consume_long_press_click(graph)
{
    if(!graph) {
        return false;
    }
    let state = __touch_state__.get(graph);
    if(!state || !state.long_press_click) {
        return false;
    }
    state.long_press_click = false;
    return true;
}

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
 *
 *   `options.enable(event)` decides, at the DOWN, whether this
 *   press is even a candidate.  Pass the plugin's own predicate:
 *   a press on the empty canvas would otherwise arm a menu the
 *   plugin then refuses to show, and swallow the click that
 *   would have cleared the selection.
 ************************************************************/
export function install_long_press_contextmenu(graph, options)
{
    if(!graph) {
        return () => {};
    }

    let enable  = options?.enable;
    let state   = touch_state_of(graph);
    let pending = null;         /* {x, y, t0, event, tick} */

    let disarm = () => {
        if(pending) {
            clearTimeout(pending.tick);
            pending = null;
        }
    };

    /*
     *  The one thing deciding at the RELEASE costs: while the finger
     *  is down, nothing on the screen says the menu is now what
     *  letting go would give you.  A tick of haptics says it.
     *
     *  It is a NOTICE, not the decision -- the arbitration is still
     *  entirely in `on_up`.  So a finger that buzzes and then carries
     *  the node away gets its drag, exactly as if it had never
     *  buzzed; the tick only reports what the press is worth at the
     *  moment it crosses the line.  (Where there is no vibrator --
     *  iOS Safari, a desktop -- `vibrate` is simply absent and this
     *  is a no-op.)
     */
    let announce = () => {
        if(!pending) {
            return;
        }
        if(state.multi) {
            return;
        }
        navigator.vibrate?.(15);
    };

    let fire = (event) => {
        /*
         *  The click @antv/g is about to make out of this same
         *  pointerup belongs to the press, and the press has already
         *  been spent on the menu.
         */
        state.long_press_click = true;
        setTimeout(() => {
            state.long_press_click = false;
        }, 0);

        /*
         *  That click also reaches the plugin's own `document`
         *  listener, which hides the menu the press just opened -- a
         *  right click never produces a `click`, so the plugin has no
         *  reason to guard against it.  Swallow that one click in the
         *  CAPTURE phase, where document sees it before anything else
         *  does.
         */
        let swallow = (evt) => {
            evt.stopPropagation();
            document.removeEventListener("click", swallow, true);
        };
        document.addEventListener("click", swallow, true);
        setTimeout(() => {
            document.removeEventListener("click", swallow, true);
        }, 1000);

        graph.emit(`${event.targetType}:${CommonEvent.CONTEXT_MENU}`, event);
        graph.emit(CommonEvent.CONTEXT_MENU, event);
    };

    let on_down = (event) => {
        disarm();
        if(event.pointerType !== "touch") {
            return;     /*  a mouse holding its button is not a menu  */
        }
        if(state.count > 1 || state.multi) {
            return;     /*  two fingers: that is the pinch  */
        }
        if(enable && !enable(event)) {
            return;     /*  nothing here has a menu to open  */
        }
        let x = event.client?.x;
        let y = event.client?.y;
        if(x === undefined || y === undefined) {
            return;
        }
        /*
         *  The event object is reused by @antv/g between dispatches,
         *  so what the release must answer with is a COPY -- by then
         *  the live object describes the pointerup, and the menu is
         *  about what was PRESSED.
         */
        pending = {
            x:     x,
            y:     y,
            t0:    Date.now(),
            event: Object.assign({}, event),
            tick:  setTimeout(announce, LONG_PRESS_MS),
        };
    };

    let on_move = (event) => {
        if(!pending) {
            return;
        }
        if(state.count > 1 || state.multi) {
            disarm();
            return;
        }
        let x = event.client?.x;
        let y = event.client?.y;
        if(x === undefined || y === undefined) {
            return;
        }
        if(press_moved(pending, x, y)) {
            disarm();   /*  the finger is carrying the node  */
        }
    };

    let on_up = (event) => {
        let press = pending;
        if(press) {
            clearTimeout(press.tick);
        }
        pending = null;
        if(!press) {
            return;
        }
        if(state.multi) {
            return;     /*  a finger of a pinch, not a press  */
        }
        let x = event.client?.x;
        let y = event.client?.y;
        if(x === undefined) {
            x = press.x;
        }
        if(y === undefined) {
            y = press.y;
        }
        if(classify_press(press, x, y, Date.now()) !== "long") {
            return;     /*  a drag, or a tap: both are already served  */
        }
        fire(press.event);
    };

    /*  The gesture can also end without a release: the browser takes
     *  the touch away (a system gesture, a call), and the press must
     *  not survive it into the next one.  */
    let on_touch_cancel = () => {
        disarm();
    };
    state.container?.addEventListener("touchcancel", on_touch_cancel);

    graph.on(CommonEvent.POINTER_DOWN, on_down);
    graph.on(CommonEvent.POINTER_MOVE, on_move);
    graph.on(CommonEvent.POINTER_UP,   on_up);

    return () => {
        disarm();
        state.container?.removeEventListener("touchcancel", on_touch_cancel);
        graph.off(CommonEvent.POINTER_DOWN, on_down);
        graph.off(CommonEvent.POINTER_MOVE, on_move);
        graph.off(CommonEvent.POINTER_UP,   on_up);
    };
}
