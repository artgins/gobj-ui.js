/***********************************************************************
 *          c_yui_period.js
 *
 *  The date navigator: pick a GRANULARITY, then walk it.
 *
 *      [ All | Hour | Day | Week | Year | ⋯ | Custom ]
 *          |<   <     Week 27     >   >|
 *              2026-07-13 00:00:00 → 2026-07-19 23:59:59
 *
 *  Two rows, and the second one is the point: once the user says "week",
 *  moving through time is ONE tap — no calendar, no typing two
 *  timestamps that must agree with each other. The calendar is still
 *  there (the label opens it) for the jump that is not one step away.
 *
 *  Container-agnostic, like C_YUI_PAGER: the gclass owns its chrome and
 *  the parent mounts `gobj_read_attr(period, "$container")` wherever it
 *  wants — a modal, a toolbar, a card head.
 *
 *  WHAT IT KNOWS NOTHING ABOUT is what a period is: that lives in
 *  yui_time.js as (unit, count), so an app that wants quarters, semesters,
 *  bimesters or 15-minute buckets DECLARES them:
 *
 *      gobj_create("period", C_YUI_PERIOD, {
 *          periods: ["hour", "day", "week", "month", "year"],
 *          more_periods: ["bimester", "quarter", "semester", "decade"],
 *          rolling: ["1h", "24h", "7d"],
 *          with_span: true,
 *          with_custom: true,
 *          ms: false                       // the consumer's time unit
 *      }, parent);
 *
 *  and gets the arrows, the labels and the calendar for free.
 *
 *  It publishes ONE event:
 *
 *      EV_PERIOD_CHANGED {mode, anchor, from, to}
 *
 *  `from`/`to` are in the CONSUMER's unit (seconds, or milliseconds when
 *  `ms`), 0 meaning "unbounded" — which is exactly how a match condition
 *  reads a missing end, so a query builder can forward them untouched.
 *  A rolling window ("last 24h") deliberately leaves `to` at 0: pinning
 *  it to the instant of the click would freeze a live card.
 *
 *  Modes that are NOT buckets — "span" (everything), "custom" (the host's
 *  own from/to inputs, mounted in the optional `$custom` slot) and the
 *  rolling windows — live in ST_FLAT, where the arrows do not exist. That
 *  is why they are a STATE and not an `if`: an EV_NEXT arriving there is
 *  a bug in the caller, and the FSM says so out loud instead of quietly
 *  doing nothing.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {
    SDATA,
    SDATA_END,
    data_type_t,
    event_flag_t,
    gclass_create,
    log_error,
    createElement2,
    gobj_read_attr,
    gobj_write_attr,
    gobj_read_pointer_attr,
    gobj_read_bool_attr,
    gobj_read_integer_attr,
    gobj_parent,
    gobj_subscribe_event,
    gobj_unsubscribe_event,
    gobj_send_event,
    gobj_publish_event,
    gobj_change_state,
    gobj_short_name,
} from "@yuneta/gobj-js";

import {yui_shell_of} from "./c_yui_shell.js";

import {
    YUI_PERIODS_DEFAULT,
    YUI_ROLLING,
    safe_locale,
    epoch_to_ms,
    period_spec,
    period_start,
    period_shift,
    period_bounds,
    period_bounds_epoch,
    rolling_bounds,
    fmt_epoch,
    period_name,
    period_label,
    day_number,
    start_of_iso_week,
    iso_week,
} from "./yui_time.js";

import i18next, {t} from "i18next";

import "./c_yui_period.css";


/***************************************************************
 *              Constants
 ***************************************************************/
const GCLASS_NAME = "C_YUI_PERIOD";

/*  The modes with no bucket behind them. They share ST_FLAT.  */
const MODE_SPAN = "span";
const MODE_CUSTOM = "custom";

/***************************************************************
 *              Data
 ***************************************************************/
const attrs_table = [
SDATA(data_type_t.DTP_POINTER,  "subscriber",   0,  null,   "Subscriber of output events"),

SDATA(data_type_t.DTP_JSON,     "periods",      0,  null,   "Granularities in the control: ids of yui_time's catalog, or specs {id,unit,count}"),
SDATA(data_type_t.DTP_JSON,     "more_periods", 0,  null,   "Granularities behind the overflow menu (quarter, semester, …)"),
SDATA(data_type_t.DTP_JSON,     "rolling",      0,  null,   "Rolling windows offered as modes: ids of yui_time's YUI_ROLLING"),
SDATA(data_type_t.DTP_BOOLEAN,  "with_span",    0,  false,  "Offer a 'span' mode: no bounds at all"),
SDATA(data_type_t.DTP_BOOLEAN,  "with_custom",  0,  false,  "Offer a 'custom' mode: reveals the $custom slot"),
SDATA(data_type_t.DTP_BOOLEAN,  "with_resolved",0,  true,   "Print the two timestamps the current mode resolves to"),

SDATA(data_type_t.DTP_STRING,   "mode",         0,  "",     "Current mode: a period id, 'span', 'custom' or a rolling id"),
SDATA(data_type_t.DTP_INTEGER,  "anchor",       0,  0,      "Instant the current bucket holds, in MILLISECONDS (0 = now)"),
SDATA(data_type_t.DTP_BOOLEAN,  "ms",           0,  false,  "The CONSUMER keeps its timestamps in milliseconds (else seconds)"),
SDATA(data_type_t.DTP_INTEGER,  "min",          0,  0,      "Oldest instant the data holds, in the consumer's unit (0 = unknown)"),
SDATA(data_type_t.DTP_INTEGER,  "max",          0,  0,      "Newest instant the data holds, in the consumer's unit (0 = unknown)"),

/*  OUTPUT, read-only: the bounds the current mode asks for, in the
 *  consumer's unit, 0 = unbounded. Kept in sync with every change, so a
 *  host that reads the picker when the user confirms a dialog (instead of
 *  reacting to EV_PERIOD_CHANGED) needs no accessor of its own.  */
SDATA(data_type_t.DTP_INTEGER,  "from",         0,  0,      "Current lower bound (read-only output)"),
SDATA(data_type_t.DTP_INTEGER,  "to",           0,  0,      "Current upper bound, inclusive (read-only output)"),

/*---------------- UI ----------------*/
SDATA(data_type_t.DTP_POINTER,  "$container",   0,  null,   "HTMLElement root, mounted by the parent"),
SDATA(data_type_t.DTP_POINTER,  "$custom",      0,  null,   "HTMLElement of the host's own from/to block, shown in 'custom' mode"),
SDATA_END()
];

let PRIVATE_DATA = {
    modes:      null,       /*  every mode of the control, in order  */
    $modes:     null,
    $more:      null,
    $nav:       null,
    $first:     null,
    $prev:      null,
    $next:      null,
    $latest:    null,
    $label:     null,
    $resolved:  null,
    $calendar:  null,       /*  the popover, null when closed  */
    cal_view:   0,          /*  the month/year the popover is BROWSING  */
    on_dismiss: null,       /*  document listener that closes the popover  */
    on_more_dismiss: null,  /*  same, for the overflow menu  */
    modes_ro:   null        /*  ResizeObserver re-checking the strip's fades  */
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

    priv.modes = collect_modes(gobj);

    if(!gobj_read_attr(gobj, "mode")) {
        /*  No mode asked for: the first one of the control.  */
        gobj_write_attr(gobj, "mode", priv.modes.length? priv.modes[0].id : MODE_SPAN);
    }
    if(!gobj_read_integer_attr(gobj, "anchor")) {
        gobj_write_attr(gobj, "anchor", Date.now());
    }

    build_ui(gobj);

    /*
     *  CHILD subscription model
     */
    let subscriber = gobj_read_pointer_attr(gobj, "subscriber");
    if(!subscriber) {
        subscriber = gobj_parent(gobj);
    }
    gobj_subscribe_event(gobj, null, {}, subscriber);
}

/***************************************************************
 *          Framework Method: Start
 ***************************************************************/
function mt_start(gobj)
{
    let priv = gobj.priv;
    let mode = cur_mode(gobj);

    /*  The FSM starts in the first state declared; the mode we start ON
     *  decides whether that is where we belong.  */
    gobj_change_state(gobj, (mode && mode.kind === "bucket")? "ST_BUCKET" : "ST_FLAT");

    /*  The composed labels ("Week 27", month names) are t()-built at render
     *  time, so a language switch must repaint them. Subscribe to the shell
     *  DIRECTLY, like C_YUI_TREEDB_TOPIC_WITH_FORM: a host that mounts a
     *  bare picker gets the repaint without having to forward the event
     *  (a host that forwards anyway just repaints twice, harmlessly).  */
    let shell = yui_shell_of(gobj);
    if(shell) {
        gobj_subscribe_event(shell, "EV_LANGUAGE_CHANGED", {}, gobj);
    }

    /*  The strip's overflow depends on the width the PARENT gives it, which
     *  is unknown until mounted — and changes with the viewport and with the
     *  language. Observe it instead of guessing.  */
    if(typeof ResizeObserver !== "undefined") {
        priv.modes_ro = new ResizeObserver(() => {
            update_modes_fade(gobj);
        });
        priv.modes_ro.observe(priv.$modes);
    }

    /*  Bounds, but NO event: nobody asked for anything yet, and a host
     *  that fires a query on every EV_PERIOD_CHANGED would run one before
     *  the user touched the picker.  */
    refresh_bounds(gobj);
    repaint(gobj);
}

/***************************************************************
 *          Framework Method: Stop
 ***************************************************************/
function mt_stop(gobj)
{
    let priv = gobj.priv;

    let shell = yui_shell_of(gobj);
    if(shell) {
        gobj_unsubscribe_event(shell, "EV_LANGUAGE_CHANGED", {}, gobj);
    }
    if(priv.modes_ro) {
        priv.modes_ro.disconnect();
        priv.modes_ro = null;
    }
    close_calendar(gobj);
    close_more(gobj);
}

/***************************************************************
 *          Framework Method: Destroy
 ***************************************************************/
function mt_destroy(gobj)
{
    close_calendar(gobj);
    close_more(gobj);
}




                    /***************************
                     *      Local Methods
                     ***************************/




/***************************************************************
 *  Every mode the control offers, in the order it shows them:
 *  span, the buckets, the rolling windows, the overflow ones, custom.
 *
 *  A mode is {id, kind, spec}: `kind` is what the FSM cares about
 *  ("bucket" walks, everything else is flat), `spec` is the (unit,count)
 *  of a bucket and null for the rest.
 ***************************************************************/
function collect_modes(gobj)
{
    let modes = [];

    if(gobj_read_bool_attr(gobj, "with_span")) {
        modes.push({id: MODE_SPAN, kind: "flat", spec: null, overflow: false});
    }

    let add_buckets = (list, overflow) => {
        for(let p of (list || [])) {
            let spec = period_spec(p);
            if(!spec) {
                log_error(`${gobj_short_name(gobj)}: not a period: ${JSON.stringify(p)}`);
                continue;
            }
            modes.push({id: spec.id, kind: "bucket", spec: spec, overflow: overflow});
        }
    };

    let periods = gobj_read_attr(gobj, "periods");
    add_buckets((periods && periods.length)? periods : YUI_PERIODS_DEFAULT, false);

    for(let r of (gobj_read_attr(gobj, "rolling") || [])) {
        let roll = (typeof r === "string")? YUI_ROLLING[r] : r;
        if(!roll || !roll.secs) {
            log_error(`${gobj_short_name(gobj)}: not a rolling window: ${JSON.stringify(r)}`);
            continue;
        }
        modes.push({id: roll.id, kind: "rolling", spec: null, roll: roll, overflow: false});
    }

    add_buckets(gobj_read_attr(gobj, "more_periods"), true);

    /*  "custom" is always a valid STATE, even when it gets no button: a range
     *  that matches no bucket — typed by hand, or restored from a saved view —
     *  has to be representable, and falling back to another mode would claim
     *  the user asked for something they did not ("All" highlighted while the
     *  query carries a week). `with_custom` decides whether it is also
     *  OFFERED; without a button it is simply the state where no granularity
     *  is lit and the arrows are dead.  */
    modes.push({
        id:       MODE_CUSTOM,
        kind:     "flat",
        spec:     null,
        overflow: false,
        hidden:   !gobj_read_bool_attr(gobj, "with_custom")
    });

    return modes;
}

function find_mode(gobj, id)
{
    for(let m of gobj.priv.modes) {
        if(m.id === id) {
            return m;
        }
    }
    return null;
}

function cur_mode(gobj)
{
    return find_mode(gobj, gobj_read_attr(gobj, "mode"));
}

/***************************************************************
 *  The locale the picker FORMATS with: the app's language — the one
 *  t() answers in — so "Semana" never sits next to "July 2026" (a
 *  browser in one language under a UI switched to another mixes the
 *  two otherwise). safe_locale falls back to the browser's when
 *  i18next has no language yet, and guards Firefox's literal
 *  "undefined" string.
 ***************************************************************/
function ui_locale()
{
    return safe_locale(i18next.language);
}

/***************************************************************
 *  The i18n name of a mode, for the segmented control.
 ***************************************************************/
function mode_name(mode)
{
    if(!mode) {
        return "";
    }
    if(mode.kind === "rolling") {
        return t(mode.roll.label || mode.id);
    }
    if(mode.kind === "bucket") {
        return period_name(mode.spec, t);
    }
    return t(mode.id);                      /*  span / custom  */
}

/***************************************************************
 *  The newest instant the navigator may reach, in MILLISECONDS.
 *
 *  `now`, unless the data ends earlier: walking a key that stops in
 *  march into "next month" ten times only paints empty buckets, and the
 *  "latest" arrow would land nowhere near the last record.
 ***************************************************************/
function limit_ms(gobj)
{
    let now = Date.now();
    let max = gobj_read_integer_attr(gobj, "max");
    if(!max) {
        return now;
    }
    let max_ms = epoch_to_ms(max, gobj_read_bool_attr(gobj, "ms"));
    return Math.min(max_ms, now);
}

/***************************************************************
 *  The bounds the current mode asks for, in the CONSUMER's unit
 *  (0 = unbounded). This is the whole payload of EV_PERIOD_CHANGED.
 ***************************************************************/
function cur_bounds(gobj)
{
    let mode = cur_mode(gobj);
    let ms = gobj_read_bool_attr(gobj, "ms");

    if(!mode || mode.id === MODE_SPAN) {
        return {from: 0, to: 0};
    }
    if(mode.kind === "rolling") {
        return rolling_bounds(mode.roll, ms);
    }
    if(mode.kind === "bucket") {
        return period_bounds_epoch(mode.spec, gobj_read_integer_attr(gobj, "anchor"), ms);
    }
    /*  custom: the host owns the values in its $custom slot; the picker
     *  claims no bounds of its own.  */
    return {from: 0, to: 0};
}

/***************************************************************
 *  Publish the bounds as ATTRS, for the host that reads the picker when
 *  its dialog is confirmed instead of reacting to every keystroke of the
 *  navigator.
 ***************************************************************/
function refresh_bounds(gobj)
{
    let b = cur_bounds(gobj);
    gobj_write_attr(gobj, "from", b.from);
    gobj_write_attr(gobj, "to", b.to);
    return b;
}

/***************************************************************
 *  Tell the world where we are. The kw is plain JSON on purpose (the
 *  machine trace dumps it, and a DOM node in there would break the very
 *  trace the FSM exists to feed).
 ***************************************************************/
function publish_period(gobj)
{
    let b = refresh_bounds(gobj);
    gobj_publish_event(gobj, "EV_PERIOD_CHANGED", {
        mode:   gobj_read_attr(gobj, "mode"),
        anchor: gobj_read_integer_attr(gobj, "anchor"),
        from:   b.from,
        to:     b.to
    });
}


/*---------------------------------------------*
 *              UI
 *---------------------------------------------*/

/***************************************************************
 *  The chrome, built once: the segmented control, the overflow menu
 *  and the navigator. What CHANGES on every mode/anchor lives in
 *  repaint().
 ***************************************************************/
function build_ui(gobj)
{
    let priv = gobj.priv;

    priv.$modes = createElement2(
        ["div", {class: "buttons has-addons is-flex-wrap-nowrap mb-0 YUI_PERIOD_MODES"}, []]);

    for(let mode of priv.modes) {
        if(mode.overflow || mode.hidden) {
            continue;
        }
        priv.$modes.appendChild(build_mode_button(gobj, mode));
    }

    /*  Scroll plumbing, not an action: it changes nothing outside the strip.
     *  The fade classes are the "there is more" hint a 4px scrollbar fails
     *  to give on a phone.  */
    priv.$modes.addEventListener("scroll", () => {
        update_modes_fade(gobj);
    }, {passive: true});

    /*  The strip SCROLLS when the granularities do not fit (see the css), and
     *  a scrolling box CLIPS what hangs out of it — so the overflow menu is a
     *  sibling of the strip, not a member of it.  */
    let $modes_row = createElement2(
        ["div", {class: "is-flex is-align-items-center mb-0 YUI_PERIOD_MODES_ROW"},
            [priv.$modes]]);

    if(priv.modes.some((m) => m.overflow)) {
        $modes_row.appendChild(build_more_menu(gobj));
    }

    /*  |<  <   LABEL   >  >|  — the two ends and the two steps. The ends are
     *  what makes a long key navigable at all: the oldest record of a topic
     *  can be years back, and stepping there one bucket at a time is not a
     *  navigation, it is a punishment.  */
    priv.$first = nav_button(gobj, "YUI_PERIOD_FIRST", "yi-backward-step", "oldest period",
        () => gobj_send_event(gobj, "EV_FIRST", {}, gobj));
    priv.$prev = nav_button(gobj, "YUI_PERIOD_PREV", "yi-chevron-left", "previous period",
        () => gobj_send_event(gobj, "EV_PREV", {}, gobj));
    priv.$next = nav_button(gobj, "YUI_PERIOD_NEXT", "yi-chevron-right", "next period",
        () => gobj_send_event(gobj, "EV_NEXT", {}, gobj));
    priv.$latest = nav_button(gobj, "YUI_PERIOD_LATEST", "yi-forward-step", "latest period",
        () => gobj_send_event(gobj, "EV_LATEST", {}, gobj));

    /*  The label is the biggest thing on screen and it is a BUTTON: it says
     *  where you are ("Yesterday", "Week 27", "July") and it opens the
     *  calendar. Everything else in the row is chrome around it.  */
    /*  The small calendar glyph is the AFFORDANCE: nothing else says "this
     *  opens a calendar" before the first click — desktop has a tooltip,
     *  a phone has neither hover nor title.  */
    priv.$label = createElement2(
        ["button", {class: "button is-ghost YUI_PERIOD_LABEL", type: "button",
                    title: t("pick a date"), "aria-label": t("pick a date"),
                    "data-i18n-title": "pick a date", "data-i18n-aria-label": "pick a date"},
            [["span", {class: "icon YUI_PERIOD_LABEL_ICON"},
                [["i", {class: "yi-calendar-days"}]]],
             ["span", {class: "YUI_PERIOD_LABEL_TEXT"}, ""]]
        ]);
    priv.$label.addEventListener("click", () => {
        gobj_send_event(gobj, "EV_PICK_DATE", {}, gobj);
    });

    /*  What the label RESOLVES to. A name is for the user; the two timestamps
     *  below it are what the query actually carries, and the user is entitled
     *  to see them before asking for them.  */
    /*  A host that puts the resolved range in its OWN (editable) inputs asks
     *  for it to be left out — the same two timestamps twice, one of them
     *  read-only, is noise.  */
    if(gobj_read_bool_attr(gobj, "with_resolved")) {
        priv.$resolved = createElement2(
            ["p", {class: "has-text-centered is-family-monospace YUI_PERIOD_RESOLVED"}, ""]);
    }

    /*  NO `is-flex` here, and that is not a style choice: `.is-flex` and
     *  `.is-hidden` are BOTH `!important` in Bulma, and is-flex wins — the
     *  navigator stayed on screen in the modes that have nothing to walk,
     *  offering arrows for a period that did not exist. The row is laid out
     *  from the css instead (no !important), so `is-hidden` can win.  */
    priv.$nav = createElement2(
        ["div", {class: "mt-2 YUI_PERIOD_NAV"},
            [priv.$first, priv.$prev, priv.$label, priv.$next, priv.$latest]]);

    let $container = createElement2(
        ["div", {class: `${GCLASS_NAME} YUI_PERIOD`}, [$modes_row, priv.$nav]]);
    if(priv.$resolved) {
        $container.appendChild(priv.$resolved);
    }

    let $custom = gobj_read_pointer_attr(gobj, "$custom");
    if($custom) {
        $container.appendChild($custom);
    }

    gobj_write_attr(gobj, "$container", $container);
}

function build_mode_button(gobj, mode)
{
    let $btn = createElement2(
        ["button", {class: `button YUI_PERIOD_MODE YUI_PERIOD_MODE_${mode.id.toUpperCase()}`,
                    type: "button"},
            [["span", {class: "YUI_PERIOD_MODE_TEXT"}, mode_name(mode)]]
        ]);
    $btn.addEventListener("click", () => {
        gobj_send_event(gobj, "EV_SET_MODE", {mode: mode.id}, gobj);
    });
    mode.$btn = $btn;
    return $btn;
}

/***************************************************************
 *  The overflow menu: the granularities an app enabled but that would
 *  push the control off a phone screen (quarter, semester, decade…).
 ***************************************************************/
function build_more_menu(gobj)
{
    let priv = gobj.priv;

    let $items = createElement2(["div", {class: "dropdown-content YUI_PERIOD_MORE_ITEMS"}, []]);
    for(let mode of priv.modes) {
        if(!mode.overflow) {
            continue;
        }
        let $item = createElement2(
            ["a", {class: `dropdown-item YUI_PERIOD_MODE ` +
                          `YUI_PERIOD_MODE_${mode.id.toUpperCase()}`, href: "#"},
                [["span", {class: "YUI_PERIOD_MODE_TEXT"}, mode_name(mode)]]
            ]);
        $item.addEventListener("click", (ev) => {
            ev.preventDefault();
            close_more(gobj);
            gobj_send_event(gobj, "EV_SET_MODE", {mode: mode.id}, gobj);
        });
        mode.$btn = $item;
        $items.appendChild($item);
    }

    let $trigger = createElement2(
        ["button", {class: "button YUI_PERIOD_MORE_BTN", type: "button",
                    title: t("more periods"), "aria-label": t("more periods"),
                    "data-i18n-title": "more periods", "data-i18n-aria-label": "more periods"},
            [["span", {class: "icon"}, [["i", {class: "yi-ellipsis"}]]]]
        ]);

    priv.$more = createElement2(
        ["div", {class: "dropdown is-right YUI_PERIOD_MORE"},
            [
                ["div", {class: "dropdown-trigger"}, [$trigger]],
                ["div", {class: "dropdown-menu"}, [$items]]
            ]
        ]);

    $trigger.addEventListener("click", () => {
        if(priv.$more.classList.contains("is-active")) {
            close_more(gobj);
        } else {
            open_more(gobj);
        }
    });

    return priv.$more;
}

/***************************************************************
 *  The overflow menu dismisses like the calendar popover: anything
 *  outside closes it, Escape included — and that Escape stops there
 *  (capture phase), for the same reason as the calendar's: one
 *  Escape, one thing closed. Without this the menu only closed by
 *  re-clicking the trigger, and on a phone its open items sat over
 *  the navigator swallowing taps meant for the label.
 ***************************************************************/
function open_more(gobj)
{
    let priv = gobj.priv;
    if(!priv.$more) {
        return;
    }
    close_calendar(gobj);                   /*  one popover at a time  */
    priv.$more.classList.add("is-active");

    if(priv.on_more_dismiss) {
        return;
    }
    priv.on_more_dismiss = (ev) => {
        if(ev.type === "keydown") {
            if(ev.key !== "Escape") {
                return;
            }
            ev.preventDefault();
            ev.stopPropagation();
        }
        if(ev.type === "pointerdown" && priv.$more.contains(ev.target)) {
            return;
        }
        close_more(gobj);
    };
    document.addEventListener("pointerdown", priv.on_more_dismiss, true);
    document.addEventListener("keydown", priv.on_more_dismiss, true);
}

function close_more(gobj)
{
    let priv = gobj.priv;

    if(priv.on_more_dismiss) {
        document.removeEventListener("pointerdown", priv.on_more_dismiss, true);
        document.removeEventListener("keydown", priv.on_more_dismiss, true);
        priv.on_more_dismiss = null;
    }
    if(priv.$more) {
        priv.$more.classList.remove("is-active");
    }
}

function nav_button(gobj, logical, icon, key, on_click)
{
    let $btn = createElement2(
        ["button", {class: `button is-ghost ${logical}`, type: "button",
                    title: t(key), "aria-label": t(key),
                    "data-i18n-title": key, "data-i18n-aria-label": key},
            [["span", {class: "icon"}, [["i", {class: icon}]]]]
        ]);
    $btn.addEventListener("click", on_click);
    return $btn;
}

/***************************************************************
 *  Paint what the state says: which mode is active, what the navigator
 *  is parked on, and which arrows lead anywhere.
 *
 *  Bulma's helpers carry !important, so visibility is a CLASS
 *  (`is-hidden`) — an inline style.display would lose to them.
 ***************************************************************/
function repaint(gobj)
{
    let priv = gobj.priv;
    let mode = cur_mode(gobj);

    for(let m of priv.modes) {
        if(!m.$btn) {
            continue;
        }
        m.$btn.classList.toggle("is-active", m === mode);
        m.$btn.classList.toggle("is-link", m === mode && !m.overflow);
    }
    if(mode && mode.$btn) {
        scroll_mode_into_view(gobj, mode.$btn);
    }
    if(priv.$more) {
        /*  An overflow granularity in use must SAY so on the trigger: the
         *  control shows no active segment otherwise, and the user cannot
         *  tell a quarter from a month by the arrows alone.  */
        priv.$more.classList.toggle("is-link", !!(mode && mode.overflow));
    }

    /*  The navigator STAYS, disabled, in the modes with nothing to walk: it
     *  used to disappear, and every mode change re-flowed the whole card under
     *  the cursor. A control that greys out says "not now"; one that vanishes
     *  makes you re-find everything else.  */
    let is_bucket = !!(mode && mode.kind === "bucket");
    priv.$nav.classList.toggle("yui-period-nav-off", !is_bucket);
    priv.$label.disabled = !is_bucket;

    let $custom = gobj_read_pointer_attr(gobj, "$custom");
    if($custom) {
        $custom.classList.toggle("is-hidden", !(mode && mode.id === MODE_CUSTOM));
    }

    let ms = gobj_read_bool_attr(gobj, "ms");

    /*  The flat modes have no bucket to name, but they still ASK for
     *  something, and the user is entitled to read it.  */
    if(!is_bucket) {
        priv.$first.disabled = true;
        priv.$prev.disabled = true;
        priv.$next.disabled = true;
        priv.$latest.disabled = true;

        let $text = priv.$label.querySelector(".YUI_PERIOD_LABEL_TEXT");
        if($text) {
            /*  No bucket, so no date to name — and naming one anyway ("Today")
             *  next to a mode that asks for EVERYTHING would be a lie.  */
            $text.textContent = "—";
        }

        if(!priv.$resolved) {
            return;
        }
        if(mode && mode.kind === "rolling") {
            let r = cur_bounds(gobj);
            priv.$resolved.textContent = `${fmt_epoch(r.from, ms)} → …`;
        } else if(mode && mode.id === MODE_CUSTOM) {
            priv.$resolved.textContent = t("the range typed below");
        } else {
            priv.$resolved.textContent = t("no time limits");
        }
        return;
    }

    let anchor = gobj_read_integer_attr(gobj, "anchor");
    let $text = priv.$label.querySelector(".YUI_PERIOD_LABEL_TEXT");
    if($text) {
        $text.textContent = period_label(mode.spec, anchor, t, ui_locale());
    }

    if(priv.$resolved) {
        let b = period_bounds_epoch(mode.spec, anchor, ms);
        priv.$resolved.textContent = `${fmt_epoch(b.from, ms)} → ${fmt_epoch(b.to, ms)}`;
    }

    let limit = limit_ms(gobj);
    let at_end = period_start(mode.spec, anchor).getTime() >=
                 period_start(mode.spec, limit).getTime();
    priv.$next.disabled = at_end;
    priv.$latest.disabled = at_end;

    let min = gobj_read_integer_attr(gobj, "min");
    if(min) {
        let min_ms = epoch_to_ms(min, ms);
        let at_start = period_start(mode.spec, anchor).getTime() <=
                       period_start(mode.spec, min_ms).getTime();
        priv.$prev.disabled = at_start;
        priv.$first.disabled = at_start;
    } else {
        /*  The data's extent is unknown (an old backend, a key nobody has
         *  reported yet): there is no oldest bucket to jump to, so the jump
         *  is dead — but stepping back is not.  */
        priv.$prev.disabled = false;
        priv.$first.disabled = true;
    }
}


/***************************************************************
 *  Bring the active granularity inside the visible part of the strip.
 *
 *  The strip only overflows on a narrow screen, and there the active mode
 *  can sit past either edge — "Custom" at the right, "Hour" at the left of
 *  a strip the user already pushed. Scrolling the CONTAINER (not
 *  scrollIntoView, which walks up and drags the page/dialog with it) is the
 *  only part of this that must not be guessed.
 ***************************************************************/
function scroll_mode_into_view(gobj, $btn)
{
    let $m = gobj.priv.$modes;
    if(!$m || $m.scrollWidth <= $m.clientWidth + 1) {
        return;
    }
    /*  Rects, NOT offsetLeft: the strip is not a positioned element, so the
     *  button's offsetParent is some ancestor of it and offsetLeft would be
     *  measured from the wrong origin.  */
    let strip = $m.getBoundingClientRect();
    let btn = $btn.getBoundingClientRect();
    let left = btn.left - strip.left + $m.scrollLeft;
    let right = left + btn.width;
    if(left < $m.scrollLeft) {
        $m.scrollLeft = left;
    } else if(right > $m.scrollLeft + $m.clientWidth) {
        $m.scrollLeft = right - $m.clientWidth;
    }
}

/***************************************************************
 *  The "there is more" hint of the scrolling strip: fade the edge
 *  that hides content. Only the classes live here; the mask is css.
 ***************************************************************/
function update_modes_fade(gobj)
{
    let $m = gobj.priv.$modes;
    if(!$m) {
        return;
    }
    let overflow = $m.scrollWidth > $m.clientWidth + 1;
    let at_start = $m.scrollLeft <= 1;
    let at_end = $m.scrollLeft + $m.clientWidth >= $m.scrollWidth - 1;
    $m.classList.toggle("yui-period-fade-left", overflow && !at_start);
    $m.classList.toggle("yui-period-fade-right", overflow && !at_end);
}


/*---------------------------------------------*
 *              The calendar popover
 *---------------------------------------------*/

/***************************************************************
 *  Which grid the popover shows is decided by the bucket's UNIT: you
 *  pick a quarter by pointing at a month, and a decade by pointing at a
 *  year — a day grid would be asking the wrong question.
 ***************************************************************/
function grid_kind(spec)
{
    if(spec.unit === "year") {
        return "years";
    }
    if(spec.unit === "month") {
        return "months";
    }
    return "days";
}

/***************************************************************
 *  Browsing the grid (‹ July 2026 ›) is PLUMBING, not an action — it
 *  changes nothing outside the popover. PICKING is the action, and it
 *  leaves through EV_DATE_PICKED like everything else.
 ***************************************************************/
function open_calendar(gobj)
{
    let priv = gobj.priv;
    let mode = cur_mode(gobj);
    if(!mode || mode.kind !== "bucket") {
        return;
    }
    close_calendar(gobj);
    close_more(gobj);                       /*  one popover at a time  */

    priv.cal_view = gobj_read_integer_attr(gobj, "anchor");

    priv.$calendar = createElement2(["div", {class: "box p-2 YUI_PERIOD_CALENDAR"}, []]);
    render_calendar(gobj);

    priv.$nav.appendChild(priv.$calendar);

    /*  Anything outside closes it, Escape included — and the Escape that
     *  closes the popover STOPS THERE. We listen in the capture phase, so we
     *  run before whatever hosts us: without swallowing it, the same keypress
     *  travelled on to the shell's escape chain and closed the whole dialog
     *  the calendar was opened from. One Escape, one thing closed.  */
    priv.on_dismiss = (ev) => {
        if(ev.type === "keydown") {
            if(ev.key !== "Escape") {
                return;
            }
            ev.preventDefault();
            ev.stopPropagation();
        }
        if(ev.type === "pointerdown" && priv.$calendar && priv.$calendar.contains(ev.target)) {
            return;
        }
        if(ev.type === "pointerdown" && priv.$label.contains(ev.target)) {
            return;
        }
        close_calendar(gobj);
    };
    document.addEventListener("pointerdown", priv.on_dismiss, true);
    document.addEventListener("keydown", priv.on_dismiss, true);
}

function close_calendar(gobj)
{
    let priv = gobj.priv;

    if(priv.on_dismiss) {
        document.removeEventListener("pointerdown", priv.on_dismiss, true);
        document.removeEventListener("keydown", priv.on_dismiss, true);
        priv.on_dismiss = null;
    }
    if(priv.$calendar) {
        priv.$calendar.remove();
        priv.$calendar = null;
    }
}

function render_calendar(gobj)
{
    let priv = gobj.priv;
    let mode = cur_mode(gobj);
    if(!priv.$calendar || !mode || mode.kind !== "bucket") {
        return;
    }
    let kind = grid_kind(mode.spec);
    let view = new Date(priv.cal_view);
    let locale = ui_locale();

    let step_view = (delta) => {
        let d = new Date(priv.cal_view);
        if(kind === "days") {
            priv.cal_view = new Date(d.getFullYear(), d.getMonth() + delta, 1).getTime();
        } else if(kind === "months") {
            priv.cal_view = new Date(d.getFullYear() + delta, 0, 1).getTime();
        } else {
            priv.cal_view = new Date(d.getFullYear() + delta * 12, 0, 1).getTime();
        }
        render_calendar(gobj);
    };

    let heading;
    if(kind === "days") {
        heading = new Intl.DateTimeFormat(locale, {month: "long", year: "numeric"}).format(view);
    } else if(kind === "months") {
        heading = String(view.getFullYear());
    } else {
        let base = Math.floor(view.getFullYear() / 12) * 12;
        heading = `${base} – ${base + 11}`;
    }

    let $back = nav_button(gobj, "YUI_PERIOD_CAL_PREV", "yi-chevron-left", "previous period",
        () => step_view(-1));
    let $fwd = nav_button(gobj, "YUI_PERIOD_CAL_NEXT", "yi-chevron-right", "next period",
        () => step_view(1));

    let $head = createElement2(
        ["div", {class: "is-flex is-align-items-center is-justify-content-space-between " +
                        "mb-2 YUI_PERIOD_CAL_HEAD"},
            [$back,
             ["span", {class: "has-text-weight-semibold YUI_PERIOD_CAL_TITLE"}, heading],
             $fwd]
        ]);

    let $grid = (kind === "days")? build_days_grid(gobj, view, locale)
              : (kind === "months")? build_months_grid(gobj, view, locale)
              : build_years_grid(gobj, view);

    let $today = createElement2(
        ["button", {class: "button is-ghost mt-2 YUI_PERIOD_CAL_TODAY", type: "button"},
            [["span", {"data-i18n": "today"}, t("today")]]
        ]);
    $today.addEventListener("click", () => {
        gobj_send_event(gobj, "EV_DATE_PICKED", {anchor: Date.now()}, gobj);
    });

    priv.$calendar.replaceChildren($head, $grid, $today);
}

function cell_button(gobj, label, anchor_ms, selected, logical, aria)
{
    /*  `aria` is the full name of the instant ("14 July 2026"): the visible
     *  label is a bare number, which a screen reader hears with no month or
     *  year around it.  */
    let $btn = createElement2(
        /*  The ONE place `is-small` is earned: 42 cells in a popover.  */
        ["button", {class: `button is-small ${selected? "is-link" : "is-ghost"} ${logical}`,
                    type: "button", style: "width:100%;",
                    title: aria || "", "aria-label": aria || ""}, String(label)]);
    $btn.addEventListener("click", () => {
        gobj_send_event(gobj, "EV_DATE_PICKED", {anchor: anchor_ms}, gobj);
    });
    return $btn;
}

/***************************************************************
 *  Hovering a cell previews the BUCKET a click would pick: a week
 *  rings its whole row, a quarter its three months — what you are
 *  about to get, before committing. Pointer plumbing, not an
 *  action: it changes nothing outside the popover.
 ***************************************************************/
function wire_bucket_preview(spec, cells)
{
    for(let c of cells) {
        c.$btn.addEventListener("mouseenter", () => {
            let b = period_bounds(spec, c.ts);
            for(let o of cells) {
                o.$btn.classList.toggle("yui-period-preview",
                    o.ts >= b.from && o.ts <= b.to);
            }
        });
        c.$btn.addEventListener("mouseleave", () => {
            for(let o of cells) {
                o.$btn.classList.remove("yui-period-preview");
            }
        });
    }
}

/***************************************************************
 *  The day grid: Monday-first (ISO, like the week bucket), the days of
 *  the neighbouring months greyed but LIVE — clicking one is how you
 *  reach the last week of the previous month without going back first.
 ***************************************************************/
function build_days_grid(gobj, view, locale)
{
    let mode = cur_mode(gobj);
    let anchor = gobj_read_integer_attr(gobj, "anchor");
    let sel = period_bounds(mode.spec, anchor);

    /*  The week-number gutter earns its place only when the bucket IS a
     *  week: the number is then the NAME of what a click picks.  */
    let with_weeks = (mode.spec.unit === "week");
    let columns = with_weeks
        ? "grid-template-columns:2.5ch repeat(7, 1fr);"
        : "grid-template-columns:repeat(7, 1fr);";

    let first = new Date(view.getFullYear(), view.getMonth(), 1);
    let start = start_of_iso_week(first);
    let today = day_number(new Date());

    let $rows = [];
    let cells = [];

    let $dow = [];
    if(with_weeks) {
        $dow.push(["div", {class: "YUI_PERIOD_CAL_DOW"}, ""]);
    }
    for(let i = 0; i < 7; i++) {
        let d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
        $dow.push(["div", {class: "has-text-centered is-size-7 has-text-grey YUI_PERIOD_CAL_DOW"},
            new Intl.DateTimeFormat(locale, {weekday: "narrow"}).format(d)]);
    }
    $rows.push(["div", {class: "YUI_PERIOD_CAL_WEEK",
                        style: `display:grid; ${columns} gap:2px;`},
        $dow]);

    let day_name = new Intl.DateTimeFormat(locale,
        {day: "numeric", month: "long", year: "numeric"});

    for(let w = 0; w < 6; w++) {
        let $cells = [];
        if(with_weeks) {
            let monday = new Date(start.getFullYear(), start.getMonth(),
                                  start.getDate() + w * 7);
            let wk = iso_week(monday).week;
            let wk_name = t("week {{n}}", {n: wk});
            let $wk = createElement2(
                ["button", {class: "button is-small is-ghost is-size-7 has-text-grey " +
                                   "YUI_PERIOD_CAL_WEEKNUM",
                            type: "button", style: "width:100%;",
                            title: wk_name, "aria-label": wk_name}, String(wk)]);
            $wk.addEventListener("click", () => {
                gobj_send_event(gobj, "EV_DATE_PICKED", {anchor: monday.getTime()}, gobj);
            });
            $cells.push($wk);
        }
        for(let i = 0; i < 7; i++) {
            let d = new Date(start.getFullYear(), start.getMonth(),
                             start.getDate() + w * 7 + i);
            let ts = d.getTime();
            /*  Selected = this day falls INSIDE the current bucket, so a
             *  week bucket lights its whole row and a 15-minute one lights
             *  the single day that holds it.  */
            let selected = ts >= sel.from && ts <= sel.to;
            let $btn = cell_button(gobj, d.getDate(), ts, selected, "YUI_PERIOD_CAL_DAY",
                                   day_name.format(d));
            if(d.getMonth() !== view.getMonth()) {
                $btn.classList.add("has-text-grey-light");
            }
            if(day_number(d) === today) {
                $btn.classList.add("has-text-weight-bold", "YUI_PERIOD_CAL_TODAY_CELL");
            }
            cells.push({ts: ts, $btn: $btn});
            $cells.push($btn);
        }
        $rows.push(["div", {class: "YUI_PERIOD_CAL_WEEK",
                            style: `display:grid; ${columns} gap:2px;`},
            $cells]);
    }

    wire_bucket_preview(mode.spec, cells);
    return createElement2(["div", {class: "YUI_PERIOD_CAL_GRID"}, $rows]);
}

function build_months_grid(gobj, view, locale)
{
    let mode = cur_mode(gobj);
    let sel = period_bounds(mode.spec, gobj_read_integer_attr(gobj, "anchor"));

    let short_name = new Intl.DateTimeFormat(locale, {month: "short"});
    let full_name = new Intl.DateTimeFormat(locale, {month: "long", year: "numeric"});

    let cells = [];
    let $cells = [];
    for(let m = 0; m < 12; m++) {
        let d = new Date(view.getFullYear(), m, 1);
        let ts = d.getTime();
        let selected = ts >= sel.from && ts <= sel.to;
        let $btn = cell_button(gobj, short_name.format(d), ts, selected,
                               "YUI_PERIOD_CAL_MONTH", full_name.format(d));
        cells.push({ts: ts, $btn: $btn});
        $cells.push($btn);
    }
    wire_bucket_preview(mode.spec, cells);
    return createElement2(
        ["div", {class: "YUI_PERIOD_CAL_GRID",
                 style: "display:grid; grid-template-columns:repeat(3, 1fr); gap:4px;"},
            $cells]);
}

function build_years_grid(gobj, view)
{
    let mode = cur_mode(gobj);
    let sel = period_bounds(mode.spec, gobj_read_integer_attr(gobj, "anchor"));

    let base = Math.floor(view.getFullYear() / 12) * 12;
    let cells = [];
    let $cells = [];
    for(let i = 0; i < 12; i++) {
        let d = new Date(base + i, 0, 1);
        let ts = d.getTime();
        let selected = ts >= sel.from && ts <= sel.to;
        let $btn = cell_button(gobj, base + i, ts, selected,
                               "YUI_PERIOD_CAL_YEAR", String(base + i));
        cells.push({ts: ts, $btn: $btn});
        $cells.push($btn);
    }
    wire_bucket_preview(mode.spec, cells);
    return createElement2(
        ["div", {class: "YUI_PERIOD_CAL_GRID",
                 style: "display:grid; grid-template-columns:repeat(3, 1fr); gap:4px;"},
            $cells]);
}




                    /***************************
                     *      Actions
                     ***************************/




/***************************************************************
 *  A granularity was chosen. The anchor SURVIVES the change — switching
 *  from "week 27" to "month" must land on the month that holds week 27,
 *  not jump back to today: the user is looking at march for a reason.
 ***************************************************************/
function ac_set_mode(gobj, event, kw, src)
{
    let mode = find_mode(gobj, kw.mode);
    if(!mode) {
        log_error(`${gobj_short_name(gobj)}: unknown mode: ${kw.mode}`);
        return -1;
    }
    close_calendar(gobj);
    close_more(gobj);
    gobj_write_attr(gobj, "mode", mode.id);

    /*  A rolling window is always "now", and coming back from one with a
     *  stale anchor would silently show an old bucket.  */
    if(mode.kind === "rolling") {
        gobj_write_attr(gobj, "anchor", Date.now());
    }

    gobj_change_state(gobj, (mode.kind === "bucket")? "ST_BUCKET" : "ST_FLAT");
    repaint(gobj);
    publish_period(gobj);
    return 0;
}

/***************************************************************
 *
 ***************************************************************/
function ac_prev(gobj, event, kw, src)
{
    let mode = cur_mode(gobj);
    gobj_write_attr(gobj, "anchor",
        period_shift(mode.spec, gobj_read_integer_attr(gobj, "anchor"), -1));
    close_calendar(gobj);
    repaint(gobj);
    publish_period(gobj);
    return 0;
}

/***************************************************************
 *
 ***************************************************************/
function ac_next(gobj, event, kw, src)
{
    let mode = cur_mode(gobj);
    gobj_write_attr(gobj, "anchor",
        period_shift(mode.spec, gobj_read_integer_attr(gobj, "anchor"), 1));
    close_calendar(gobj);
    repaint(gobj);
    publish_period(gobj);
    return 0;
}

/***************************************************************
 *  Home: the bucket holding the newest thing there is to look at.
 ***************************************************************/
function ac_latest(gobj, event, kw, src)
{
    gobj_write_attr(gobj, "anchor", limit_ms(gobj));
    close_calendar(gobj);
    repaint(gobj);
    publish_period(gobj);
    return 0;
}

/***************************************************************
 *  The other end: the bucket holding the OLDEST thing there is. It only
 *  exists when the host said where the data starts (`min`) — without it
 *  there is no "first", and the button is dead rather than lying.
 ***************************************************************/
function ac_first(gobj, event, kw, src)
{
    let min = gobj_read_integer_attr(gobj, "min");
    if(!min) {
        log_error(`${gobj_short_name(gobj)}: EV_FIRST with no known start of data`);
        return -1;
    }
    gobj_write_attr(gobj, "anchor", epoch_to_ms(min, gobj_read_bool_attr(gobj, "ms")));
    close_calendar(gobj);
    repaint(gobj);
    publish_period(gobj);
    return 0;
}

/***************************************************************
 *
 ***************************************************************/
function ac_pick_date(gobj, event, kw, src)
{
    if(gobj.priv.$calendar) {
        close_calendar(gobj);
        return 0;
    }
    open_calendar(gobj);
    return 0;
}

/***************************************************************
 *  A cell of the calendar was clicked: it names an INSTANT, and the
 *  bucket that holds it is the one we move to.
 ***************************************************************/
function ac_date_picked(gobj, event, kw, src)
{
    let anchor = parseInt(kw.anchor, 10);
    if(Number.isNaN(anchor)) {
        log_error(`${gobj_short_name(gobj)}: EV_DATE_PICKED without an anchor`);
        return -1;
    }
    gobj_write_attr(gobj, "anchor", anchor);
    close_calendar(gobj);
    repaint(gobj);
    publish_period(gobj);
    return 0;
}

/***************************************************************
 *  The HOST changed what the picker is pointing at: its time unit (`ms`),
 *  or the extent of the data (`min`/`max`) — a Rows dialog that switches
 *  from the `t` axis to `tm` is looking at the same key through a
 *  different clock, with a different span.
 *
 *  The attrs are the host's to write; this is how it says "now re-read
 *  them". Without it the arrows would still be armed against the OLD
 *  extent, and the bounds published in the OLD unit.
 ***************************************************************/
function ac_refresh(gobj, event, kw, src)
{
    let mode = cur_mode(gobj);
    if(!mode) {
        log_error(`${gobj_short_name(gobj)}: unknown mode: ${gobj_read_attr(gobj, "mode")}`);
        return -1;
    }

    /*  The host may have written `mode` too — it is an attr, and a re-aimed
     *  picker usually lands on a different one. Deliberately SILENT: it
     *  publishes nothing, because nobody asked for a query yet; the host is
     *  re-arming the picker, not answering with it.  */
    gobj_change_state(gobj, (mode.kind === "bucket")? "ST_BUCKET" : "ST_FLAT");

    close_calendar(gobj);
    refresh_bounds(gobj);
    repaint(gobj);
    return 0;
}

/***************************************************************
 *  The app switched language. Every label here is composed at build
 *  time (a month name, "Week 27") and carries no key, so `refresh_language`
 *  cannot reach it: it has to be re-rendered.
 ***************************************************************/
function ac_language_changed(gobj, event, kw, src)
{
    let priv = gobj.priv;

    for(let mode of priv.modes) {
        if(!mode.$btn) {
            continue;
        }
        let $text = mode.$btn.querySelector(".YUI_PERIOD_MODE_TEXT");
        if($text) {
            $text.textContent = mode_name(mode);
        }
    }
    repaint(gobj);
    if(priv.$calendar) {
        render_calendar(gobj);
    }
    return 0;
}

/***************************************************************
 *              FSM
 ***************************************************************/
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
     *
     *  ST_BUCKET   a period is selected: it can be walked.
     *  ST_FLAT     span / custom / a rolling window: there is nothing to
     *              walk, and an arrow arriving here is a caller's bug —
     *              the FSM says so instead of no-op'ing.
     *---------------------------------------------*/
    const states = [
        ["ST_BUCKET", [
            ["EV_SET_MODE",             ac_set_mode,            null],
            ["EV_PREV",                 ac_prev,                null],
            ["EV_NEXT",                 ac_next,                null],
            ["EV_FIRST",                ac_first,               null],
            ["EV_LATEST",               ac_latest,              null],
            ["EV_PICK_DATE",            ac_pick_date,           null],
            ["EV_DATE_PICKED",          ac_date_picked,         null],
            ["EV_REFRESH",              ac_refresh,             null],
            ["EV_LANGUAGE_CHANGED",     ac_language_changed,    null]
        ]],
        ["ST_FLAT", [
            ["EV_SET_MODE",             ac_set_mode,            null],
            ["EV_REFRESH",              ac_refresh,             null],
            ["EV_LANGUAGE_CHANGED",     ac_language_changed,    null]
        ]]
    ];

    /*---------------------------------------------*
     *          Events
     *---------------------------------------------*/
    const event_types = [
        ["EV_SET_MODE",             0],
        ["EV_PREV",                 0],
        ["EV_NEXT",                 0],
        ["EV_FIRST",                0],
        ["EV_LATEST",               0],
        ["EV_PICK_DATE",            0],
        ["EV_DATE_PICKED",          0],
        ["EV_REFRESH",              0],
        ["EV_LANGUAGE_CHANGED",     0],
        ["EV_PERIOD_CHANGED",       event_flag_t.EVF_OUTPUT_EVENT]
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
function register_c_yui_period()
{
    return create_gclass(GCLASS_NAME);
}

export {register_c_yui_period};
