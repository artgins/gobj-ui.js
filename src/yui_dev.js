/***********************************************************************
 *          ui_dev.js
 *
 *          Development Tools — yuno monitor / audit console
 *
 *          Copyright (c) 2024-2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {
    gobj_yuno,
    is_string,
    createElement2,
    kw_get_local_storage_value,
    kw_set_local_storage_value,
    gobj_write_attr,
    gobj_command,
    gobj_global_trace_level,
    gobj_global_trace_no_level,
    gobj_get_gclass_trace_level2,
    gclass_find_by_name,
    trace_level_t,
    log_error,
    gobj_create_service,
    gobj_find_service,
    gobj_start,
    set_log_callback,
    set_console_log_enabled,
    gobj_set_trace_machine_format,
} from "@yuneta/gobj-js";

import i18next, {t} from 'i18next';

/***********************************************************************
 *          Traffic model (bounded ring buffer)
 *
 *  Every inter-event message is kept as a lightweight record so view
 *  and filter changes re-render instantly from memory instead of
 *  losing history. Reopening the window repaints the buffer.
 ***********************************************************************/
const TRAFFIC_MAX = 600;            // capped history

let TRAFFIC_LOG = [];               // [{title,event,command,dir,size,ts,kw,jn,hay,$node}]
let SEARCH_TEXT = "";               // session-only free-text filter (not persisted)

/*  Running totals of framework errors/warnings seen since page load (or the
 *  last Clear). Kept apart from TRAFFIC_LOG so the 600-entry cap can't rotate
 *  an error out of the count — the whole point of the status-line tally is to
 *  not lose that signal under a flood of automata/debug lines. */
let LOG_ERR_COUNT = 0;
let LOG_WARN_COUNT = 0;

/*  Field names whose numeric value is a Unix timestamp (seconds). */
const TRAFFIC_TS_FIELDS = {
    "__t__": 1, "__tm__": 1, "tm": 1, "t": 1,
    "from_t": 1, "to_t": 1, "from_tm": 1, "to_tm": 1, "time": 1,
};

/*  Trace toggles.
 *
 *  A chip does ONE thing: it turns trace bits of the runtime on or off
 *  through the yuno's trace commands -- the C kernel's, same names -- and
 *  the yuno persists them (`trace_levels` / `no_trace_levels`). Whether a
 *  message is traced is decided by the gobj that emits it, never by this
 *  window reading messages. The chip's state is READ from the runtime, so
 *  it cannot disagree with what is traced.
 *
 *  [key, label i18n key, title i18n key, state(), toggle()]
 *
 *  `data-label` carries the i18n KEY and not the text: the chips are
 *  repainted from it by `refresh_dev_chrome()` on every toggle, so a
 *  label translated once at build time would come back in English at
 *  the first click.  */
/*  ⚠️  The keys of this window are a BLIND SPOT for a consumer's
 *  `validate-locales`: the table below and the `grp` / `mk_view` /
 *  `mk_expand` / `mk_dir` / `mk_out` helpers pass their key as a
 *  VARIABLE, and `OUT_TITLES` holds three more in a lookup table --
 *  so a scan of `t("…")` sees none of them and reports OK with the
 *  whole window in English. The full set a consumer must define,
 *  kept here so it can be copied:
 *
 *      automata, both, browser console only, clear,
 *      clear captured traffic, collapsed, console, copied, copy,
 *      copy visible traffic to clipboard, creation, data,
 *      dev window and browser console, dev window only, developer,
 *      clear the filter, errors, expand, expanded, filter events / payload,
 *      find, i18n,
 *      i18next debug output, incoming, log, machine trace shape,
 *      metadata, outgoing, output, payload, periodic, schema, show,
 *      show the payload of the traces,
 *      show this section in the expanded view, simple mach,
 *      start / stop, subscriptions,
 *      trace every event of every automaton,
 *      trace subscriptions and publications,
 *      trace the creation and destruction of gobjs,
 *      trace the messages to and from the backend,
 *      trace the periodic timer event,
 *      trace the start and stop of gobjs,
 *      traces, traffic, traffic payload folded,
 *      traffic payload laid out, view, window, yuno monitor
 *
 *  wattyzer and the yunovatios GUIs carry them; check a new consumer
 *  against this list, and confirm it by DUMPING the window.  */
const TRACE_DEFS = [
    ["automata",      "automata",      "trace every event of every automaton",
        automata_state, toggle_automata],
    ["creation",      "creation",      "trace the creation and destruction of gobjs",
        () => global_bit(trace_level_t.TRACE_CREATE_DELETE), () => toggle_global("create_delete")],
    ["start_stop",    "start / stop",  "trace the start and stop of gobjs",
        () => global_bit(trace_level_t.TRACE_START_STOP),    () => toggle_global("start_stop")],
    ["subscriptions", "subscriptions", "trace subscriptions and publications",
        () => global_bit(trace_level_t.TRACE_SUBSCRIPTIONS), () => toggle_global("subscriptions")],
    ["i18n",          "i18n",          "i18next debug output",
        i18n_state, toggle_i18n],
    ["traffic",       "traffic",       "trace the messages to and from the backend",
        traffic_state, toggle_traffic],
    ["periodic",      "periodic",      "trace the periodic timer event",
        periodic_state, toggle_periodic],
];



                    /******************************
                     *      Small helpers
                     ******************************/


/************************************************************
 *  hh:mm:ss.SSS wall-clock of the moment a message arrives.
 ************************************************************/
function traffic_now()
{
    let now = new Date();
    let pad = (num, len) => ('000' + num).slice(len * -1);
    let hours = pad(now.getHours(), 2);
    let minutes = pad(now.getMinutes(), 2);
    let seconds = pad(now.getSeconds(), 2);
    let ms = pad(now.getMilliseconds(), 3);
    return `${hours}:${minutes}:${seconds}.${ms}`;
}

/************************************************************
 *  Human byte size (B / KB / MB).
 ************************************************************/
function traffic_size(n)
{
    n = Number(n) || 0;
    if(n < 1024) {
        return n + " B";
    }
    if(n < 1024 * 1024) {
        return (n / 1024).toFixed(1) + " KB";
    }
    return (n / (1024 * 1024)).toFixed(1) + " MB";
}

/************************************************************
 *  Seconds-since-epoch → ISO string, or null if not a plausible
 *  timestamp (guards against 0 / NaN / out-of-range values).
 ************************************************************/
function traffic_iso(value)
{
    let n = Number(value);
    if(!isFinite(n) || n <= 0) {
        return null;
    }
    try {
        return new Date(n * 1000).toISOString();
    } catch(e) {
        return null;
    }
}

function dir_class(dir)
{
    return (dir === 2) ? "dir-in" : (dir === 3) ? "dir-err" : "dir-out";
}

function dir_arrow(dir)
{
    return (dir === 2) ? "⇠" : (dir === 3) ? "⚠" : "⇢";
}


                    /******************************
                     *      Preferences
                     ******************************/


function dev_num(key, def)
{
    return Number(kw_get_local_storage_value(key, (def === undefined ? 0 : def), false));
}

/*  TRAFFIC and TRACES are two FEEDS, and each carries its own controls.
 *
 *  They used to share one selector, and it steered the wrong one: the four
 *  view modes rewrote the traffic -- down to a bare event name -- while the
 *  trace lines ignored them altogether. Someone who ticks Traffic alone to
 *  read what is going to the backend got a list of event names, and the one
 *  feed whose shape they might want to change did not change.
 *
 *  Both feeds can be on at once, so neither control may borrow the other's:
 *  the traffic's lives in the VIEW group, the traces' in the TRACES row,
 *  beside the chip that picks the machine-trace shape.
 *
 *  The traffic payload is ALWAYS there; the view says whether it is folded.
 *  The old `dev_view_mode` key is left where it is and simply stops being
 *  read (same as SIMPLE_MACH_KEY below).  */
function dev_traffic_view()
{
    let v = kw_get_local_storage_value("dev_traffic_view", "collapsed", false);
    return (v === "expanded") ? "expanded" : "collapsed";
}

/*  Whether the trace's PAYLOAD lines (level `json`: the kw a trace dumps
 *  with ev_kw, or a publication) are shown. Default ON, which is what the
 *  old default view showed.  */
function dev_traces_payload()
{
    return dev_num("dev_traces_payload", 1) ? 1 : 0;
}

/*  Which SHAPE the machine trace is written in — the two the C kernel
 *  offers, and the chip that swaps them:
 *
 *      1 (default)  one line per transition, event first
 *      0            the legacy three-line shape: the call, the state
 *                   change, and the `<- … ret: N` return
 *
 *  1 because that is what the C kernel defaults to, so a browser yuno and
 *  a node read alike. A CONSTANT and not a
 *  literal in each of the three places that read it (the chip, the chrome
 *  and start up): they have to agree on what "unset" means, or the chip
 *  is born showing the wrong state and its first click does nothing. */
const SIMPLE_MACH_DEFAULT = 1;

/*  A NEW key, deliberately.
 *
 *  The default moved from 0 to 1 in 7.23.34, and a stored preference beats a
 *  default: every browser that had ever clicked the old `Simple mach` chip
 *  carried an explicit 0 and went on reading the legacy shape, so the change
 *  reached nobody who had used the window before. A default that cannot reach
 *  an existing browser is not a default. The old key is left where it is and
 *  simply stops being read. */
const SIMPLE_MACH_KEY = "dev_mach_simple";

function dev_simple_mach()
{
    return dev_num(SIMPLE_MACH_KEY, SIMPLE_MACH_DEFAULT) ? 1 : 0;
}

/*  Where dev output (traffic + all logs + automata) is routed:
 *  "window"  → dev window only  (browser console silenced framework-wide)
 *  "console" → browser console only  (nothing appended to the window)
 *  "both"    → console + window  (default; unchanged from prior behaviour)
 *  The console side of logs is gated in gobj-js (set_console_log_enabled);
 *  the window side is gated here, in info_traffic / info_log. */
function dev_route()
{
    let v = kw_get_local_storage_value("dev_output_route", "both", false);
    return (v === "window" || v === "console") ? v : "both";
}

/*  Push the current route's console decision down to gobj-js. Called from
 *  apply_dev_traces (startup) and whenever the Output selector changes. */
function apply_console_route()
{
    set_console_log_enabled(dev_route() !== "window");
}

/*  Emit one inter-event traffic line to the browser console (routes
 *  "console" and "both"). gobj-js only knows about framework logs, not this
 *  traffic feed, so the console mirror is produced here.
 *
 *  It follows the VIEW, because the window and the console are two sinks of
 *  ONE feed and may not disagree about what they are showing: `expanded`
 *  prints the payload laid out, `collapsed` hands the object to the console
 *  and lets it fold it. The same promise the log filter made in 7.23.33 --
 *  one rule, two sinks -- which the traffic half had never kept. */
function console_traffic(title, jn, direction, size)
{
    let event = (jn && jn.event) ? String(jn.event) : "(no event)";
    let kw = (jn && jn.kw && typeof jn.kw === "object") ? jn.kw : jn;
    let color = (direction === 2) ? "#16a34a" : (direction === 3) ? "#dc2626" : "#2563eb";
    let head = "%c" + dir_arrow(direction) + " " + (title ? "[" + title + "] " : "") + event +
            (size ? "  (" + size + "b)" : "");

    if(dev_traffic_view() === "expanded") {
        let text;
        try {
            text = JSON.stringify(full_sections(kw), null, 4);
        } catch(err) {
            text = String(kw);
        }
        window.console.log(head, "color:" + color, "\n" + text);
        return;
    }

    window.console.log(head, "color:" + color, kw);
}

function set_traffic_view(v)
{
    kw_set_local_storage_value("dev_traffic_view", (v === "expanded") ? "expanded" : "collapsed");
    rerender_all();
    refresh_dev_chrome();
}

function set_output_route(v)
{
    if(v !== "window" && v !== "console" && v !== "both") {
        v = "both";
    }
    kw_set_local_storage_value("dev_output_route", v);
    apply_console_route();
    rerender_all();
    refresh_dev_chrome();
}

function toggle_pref(key, def)
{
    let v = dev_num(key, def) ? 0 : 1;
    kw_set_local_storage_value(key, v);
    rerender_all();
    refresh_dev_chrome();
}

                    /******************************
                     *      Filtering
                     ******************************/


function build_filter_ctx()
{
    return {
        out:            dev_num("dev_filter_out", 1),
        inc:            dev_num("dev_filter_in", 1),
        err:            dev_num("dev_filter_err", 1),
        search:         SEARCH_TEXT,
        payload:        dev_traces_payload(),
    };
}

function entry_hidden(e, ctx)
{
    if(e.kind === "log") {
        /*  A `json` line is a PAYLOAD (the kw the trace dumps with ev_kw or a
         *  publication), and the TRACES row says whether those are wanted.
         *  It used to hang off the traffic view, which is another feed's
         *  control: turning the traffic into names silently took the
         *  traces' payloads away with it.  */
        if(e.level === "json" && !ctx.payload) {
            return true;
        }
        /*  Mirrored console logs respect the search box only — not the
         *  in/out/err traffic filters, which are about DIRECTION and a
         *  log has none. What is traced at all is the runtime's trace
         *  levels, set by the chips: this window never reads a message
         *  to decide whether to show it. */
        return !!(ctx.search && e.hay.indexOf(ctx.search) < 0);
    }
    if(e.dir === 1 && !ctx.out) {
        return true;
    }
    if(e.dir === 2 && !ctx.inc) {
        return true;
    }
    if(e.dir === 3 && !ctx.err) {
        return true;
    }
    if(ctx.search && e.hay.indexOf(ctx.search) < 0) {
        return true;
    }
    return false;
}


                    /******************************
                     *      Style
                     ******************************/


/************************************************************
 *  Inject the monitor stylesheet once. Theme-aware via
 *  <html data-theme>; direction-coloured (out / in / error).
 ************************************************************/
function ensure_dev_style()
{
    if(document.getElementById('yui-dev-style')) {
        return;
    }
    let css = `
/* -------- layout -------- */
.YDEV_BODY {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    box-sizing: border-box;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
}
.YDEV_LOG { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 6px 10px; }
.YDEV_STATS {
    flex: 0 0 auto; display: flex; flex-wrap: wrap; gap: 14px;
    padding: 6px 10px; border-top: 1px solid rgba(0,0,0,0.1);
    background: rgba(0,0,0,0.03);
    font-family: "DejaVu Sans Mono", monospace; font-size: 11px;
    opacity: 0.9; font-variant-numeric: tabular-nums;
}
/* -------- control bar -------- */
.YDEV_BAR {
    display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px;
    padding: 8px 10px; border-bottom: 1px solid rgba(0,0,0,0.1);
    background: rgba(0,0,0,0.03);
}
.YDEV_GROUP { display: inline-flex; align-items: center; gap: 5px; }
.YDEV_LABEL {
    font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em;
    opacity: 0.5; align-self: center;
}
.YDEV_SEP { width: 1px; align-self: stretch; background: rgba(0,0,0,0.12); }
.YDEV_CHIP {
    font: inherit; font-size: 12px; line-height: 1.4; padding: 3px 9px;
    border: 1px solid rgba(0,0,0,0.18); border-radius: 999px;
    background: transparent; color: inherit; cursor: pointer;
    display: inline-flex; align-items: center; gap: 5px;
}
.YDEV_CHIP:hover { border-color: currentColor; }
.YDEV_CHIP.is-active { background: rgba(37,99,235,0.14); border-color: #2563eb; color: #2563eb; font-weight: 600; }
.YDEV_CHIP.s-out.is-active { background: rgba(37,99,235,0.16); border-color: #2563eb; color: #2563eb; }
.YDEV_CHIP.s-in.is-active  { background: rgba(5,150,105,0.16); border-color: #059669; color: #059669; }
.YDEV_CHIP.s-err.is-active { background: rgba(220,38,38,0.16); border-color: #dc2626; color: #dc2626; }
.YDEV_CHIP[data-dir]:not(.is-active) { opacity: 0.4; text-decoration: line-through; }
.YDEV_SEG { display: inline-flex; border: 1px solid rgba(0,0,0,0.18); border-radius: 7px; overflow: hidden; }
.YDEV_SEG_BTN {
    font: inherit; font-size: 12px; padding: 4px 10px; border: 0;
    border-right: 1px solid rgba(0,0,0,0.12);
    background: transparent; color: inherit; cursor: pointer;
}
.YDEV_SEG_BTN:last-child { border-right: 0; }
.YDEV_SEG_BTN.is-active { background: #2563eb; color: #fff; font-weight: 600; }
.YDEV_SEARCH {
    font: inherit; font-size: 12px; padding: 4px 9px; min-width: 170px;
    border: 1px solid rgba(0,0,0,0.18); border-radius: 7px;
    background: transparent; color: inherit;
}
.YDEV_STAT.s-out { color: #2563eb; } .YDEV_STAT.s-in { color: #059669; } .YDEV_STAT.s-err { color: #dc2626; }
.YDEV_STAT.s-warn { color: #d97706; }
.YDEV_STAT.is-strong { font-weight: 700; }
.YDEV_TITLE { display: flex; align-items: baseline; gap: 8px; }
.YDEV_TITLE_MAIN { font-weight: 700; }
.YDEV_TITLE_SUB { opacity: 0.7; font-size: 12px; }
/* -------- entries (shared) -------- */
.TRAFFIC_ENTRY {
    border-left: 3px solid #94a3b8; border-radius: 3px;
    font-family: "DejaVu Sans Mono", monospace, consolas, monaco; font-size: 13px;
    background: rgba(0,0,0,0.02);
}
.TRAFFIC_ENTRY { margin: 6px 0; padding: 4px 8px; line-height: 1.55; }
.TRAFFIC_ENTRY.dir-out { border-left-color: #2563eb; }
.TRAFFIC_ENTRY.dir-in { border-left-color: #059669; }
.TRAFFIC_ENTRY.dir-err { border-left-color: #dc2626; }
.TRAFFIC_HEADER { display: flex; align-items: baseline; gap: 8px; }
.TRAFFIC_ARROW { font-weight: 700; }
.TRAFFIC_EVENT { font-weight: 700; }
.TRAFFIC_CMD { opacity: 0.75; font-weight: 600; }
.dir-out .TRAFFIC_ARROW, .dir-out .TRAFFIC_EVENT { color: #2563eb; }
.dir-in  .TRAFFIC_ARROW, .dir-in  .TRAFFIC_EVENT { color: #059669; }
.dir-err .TRAFFIC_ARROW, .dir-err .TRAFFIC_EVENT { color: #dc2626; }
.TRAFFIC_META { margin-left: auto; opacity: 0.6; font-size: 11px; white-space: nowrap; }
/*  The indent of a nested block is NOT a hover effect: it used to be given
    only on .TRAFFIC_ENTRY:hover, so moving the cursor across the log made
    every payload under it jump 16px sideways and reflow. A payload being
    read must not move because the pointer passed over it.
    (No backticks in here: this stylesheet is a template literal.)  */
.TRAFFIC_KW { margin: 2px 0 0 16px; }
.TRAFFIC_FULL { margin: 4px 0 0 16px; padding: 6px 8px; font-family: monospace; font-size: 11px; line-height: 1.4; white-space: pre-wrap; word-break: break-word; background: rgba(0,0,0,0.04); border-radius: 4px; overflow-x: auto; }
.TRAFFIC_ROW { display: flex; gap: 6px; align-items: baseline; }
.TRAFFIC_BULLET { opacity: 0.45; flex: 0 0 auto; }
.TRAFFIC_KEY { opacity: 0.85; flex: 0 0 auto; }
.TRAFFIC_VAL { word-break: break-word; }
.TRAFFIC_VAL.t-num  { color: #0891b2; }
.TRAFFIC_VAL.t-bool { color: #9333ea; }
.TRAFFIC_VAL.t-null { color: #9333ea; font-style: italic; }
.TRAFFIC_VAL.t-empty { opacity: 0.5; }
.TRAFFIC_TS { opacity: 0.6; margin-left: 8px; }
details.TRAFFIC_NEST > summary { cursor: pointer; list-style: none; display: flex; gap: 6px; align-items: baseline; }
details.TRAFFIC_NEST > summary::-webkit-details-marker { display: none; }
.TRAFFIC_NEST_KEY { opacity: 0.85; }
.TRAFFIC_NEST_HINT { opacity: 0.5; margin-left: 4px; }
.YDEV_EMPTY { opacity: 0.5; font-size: 12px; padding: 18px 10px; text-align: center; }
/* -------- mirrored console logs (error/warning/info/debug/msg; the automata trace shows as debug) -------- */
.YDEV_LOGROW { display: flex; align-items: baseline; gap: 8px; margin: 1px 0; padding: 2px 8px; border-left: 3px solid #94a3b8; border-radius: 3px; font-family: "DejaVu Sans Mono", monospace, consolas, monaco; font-size: 12px; background: rgba(0,0,0,0.015); }
.YDEV_LOG_LVL { flex: 0 0 auto; text-transform: uppercase; font-size: 9px; font-weight: 700; letter-spacing: 0.04em; opacity: 0.8; min-width: 48px; }
.YDEV_LOG_TXT { flex: 1 1 auto; min-width: 0; white-space: pre-wrap; word-break: break-word; opacity: 0.9; }
.YDEV_LOG_error   { border-left-color: #dc2626; } .YDEV_LOG_error   .YDEV_LOG_LVL { color: #dc2626; }
.YDEV_LOG_warning { border-left-color: #d97706; } .YDEV_LOG_warning .YDEV_LOG_LVL { color: #d97706; }
.YDEV_LOG_info    { border-left-color: #2563eb; } .YDEV_LOG_info    .YDEV_LOG_LVL { color: #2563eb; }
.YDEV_LOG_msg     { border-left-color: #0891b2; } .YDEV_LOG_msg     .YDEV_LOG_LVL { color: #0891b2; }
.YDEV_LOG_debug   { border-left-color: #94a3b8; } .YDEV_LOG_debug   .YDEV_LOG_LVL { color: #94a3b8; } .YDEV_LOG_debug .YDEV_LOG_TXT { opacity: 0.72; }
.YDEV_LOG_json    { border-left-color: #9333ea; align-items: flex-start; } .YDEV_LOG_json .YDEV_LOG_LVL { color: #9333ea; } .YDEV_LOG_json .YDEV_LOG_TXT { font-size: 11px; line-height: 1.35; opacity: 0.8; }
/* -------- dark theme -------- */
:root[data-theme="dark"] .TRAFFIC_FULL { background: rgba(255,255,255,0.05); }
:root[data-theme="dark"] .YDEV_BAR, :root[data-theme="dark"] .YDEV_STATS { background: rgba(255,255,255,0.04); }
:root[data-theme="dark"] .YDEV_SEP { background: rgba(255,255,255,0.14); }
:root[data-theme="dark"] .YDEV_CHIP, :root[data-theme="dark"] .YDEV_SEG, :root[data-theme="dark"] .YDEV_SEARCH { border-color: rgba(255,255,255,0.2); }
:root[data-theme="dark"] .TRAFFIC_ENTRY { background: rgba(255,255,255,0.03); }
:root[data-theme="dark"] .TRAFFIC_ENTRY.dir-out { border-left-color: #60a5fa; }
:root[data-theme="dark"] .TRAFFIC_ENTRY.dir-in { border-left-color: #34d399; }
:root[data-theme="dark"] .TRAFFIC_ENTRY.dir-err { border-left-color: #f87171; }
:root[data-theme="dark"] .dir-out .TRAFFIC_ARROW, :root[data-theme="dark"] .dir-out .TRAFFIC_EVENT { color: #60a5fa; }
:root[data-theme="dark"] .dir-in .TRAFFIC_ARROW,  :root[data-theme="dark"] .dir-in .TRAFFIC_EVENT { color: #34d399; }
:root[data-theme="dark"] .dir-err .TRAFFIC_ARROW, :root[data-theme="dark"] .dir-err .TRAFFIC_EVENT { color: #f87171; }
:root[data-theme="dark"] .YDEV_STAT.s-out { color: #60a5fa; } :root[data-theme="dark"] .YDEV_STAT.s-in { color: #34d399; } :root[data-theme="dark"] .YDEV_STAT.s-err { color: #f87171; }
:root[data-theme="dark"] .YDEV_STAT.s-warn { color: #fbbf24; }
:root[data-theme="dark"] .TRAFFIC_VAL.t-num { color: #22d3ee; }
:root[data-theme="dark"] .TRAFFIC_VAL.t-bool, :root[data-theme="dark"] .TRAFFIC_VAL.t-null { color: #c084fc; }
:root[data-theme="dark"] .YDEV_CHIP.is-active { background: rgba(96,165,250,0.2); border-color: #60a5fa; color: #93c5fd; }
:root[data-theme="dark"] .YDEV_SEG_BTN.is-active { background: #2563eb; color: #fff; }
:root[data-theme="dark"] `;
    let $style = document.createElement('style');
    $style.id = 'yui-dev-style';
    $style.textContent = css;
    document.head.appendChild($style);
}


                    /******************************
                     *      kw bullet rendering
                     ******************************/


/************************************************************
 *  One scalar field as a bullet row: `• key: value`.
 *  Type-coloured; long strings clipped (the whole value is in the Expanded
 *  view); timestamp fields get an ISO annotation.
 ************************************************************/
function traffic_scalar_row(key, value)
{
    let cls;
    let text;
    if(value === null) {
        cls = "t-null";
        text = "null";
    } else if(typeof value === "boolean") {
        cls = "t-bool";
        text = value ? "true" : "false";
    } else if(typeof value === "number") {
        cls = "t-num";
        text = String(value);
    } else {
        cls = "t-str";
        text = String(value);
    }

    if(text.length > 200) {
        text = text.slice(0, 200) + "…";
    }

    /*  No `title` with the full text: a tooltip that pops over the log while
        it is being read is what this window had too much of, and the whole
        value is one click away in the Expanded view. On a value SHORTER than
        the clip -- almost all of them -- it repeated the visible text anyway.  */
    let val_children = [
        ['span', {class: 'TRAFFIC_VAL ' + cls}, text],
    ];
    if((key in TRAFFIC_TS_FIELDS) && typeof value === "number") {
        let iso = traffic_iso(value);
        if(iso) {
            val_children.push(['span', {class: 'TRAFFIC_TS'}, iso]);
        }
    }

    return ['div', {class: 'TRAFFIC_ROW'}, [
        ['span', {class: 'TRAFFIC_BULLET'}, '•'],
        ['span', {class: 'TRAFFIC_KEY'}, key + ':'],
        ['span', {}, val_children],
    ]];
}

/*  What a FOLDED object says about itself, the way a browser console says it:
 *  its first fields rather than a count. `{5}` is true and tells the reader
 *  nothing -- a list of twelve column descriptors was twelve identical `{5}`,
 *  and finding the one for `tags` meant opening them one at a time. The
 *  console prints `Object { header: "id", fillspace: 18, … }` and that is the
 *  idea copied here.
 *
 *  Strings are QUOTED, unlike the expanded rows: in one line of several
 *  fields the quotes are what separate a value from the next key.
 *  A nested container is not entered -- it says `{…}` / `[…]` -- because a
 *  preview that recursed would be as long as the thing it previews.
 *
 *  The count is not lost: it stays in the tooltip, for an object whose first
 *  fields do not fit.  */
const PREVIEW_MAX_KEYS = 4;
const PREVIEW_MAX_CHARS = 90;
const PREVIEW_MAX_VALUE = 28;

function preview_scalar(v)
{
    if(v === null) {
        return "null";
    }
    if(typeof v === "string") {
        let text = (v.length > PREVIEW_MAX_VALUE) ?
            v.slice(0, PREVIEW_MAX_VALUE) + "…" : v;
        return '"' + text + '"';
    }
    if(typeof v === "object") {
        return Array.isArray(v) ? "[…]" : "{…}";
    }
    return String(v);
}

function object_preview(obj, count)
{
    let keys = Object.keys(obj);
    let parts = [];
    let used = 0;

    for(let k of keys) {
        if(parts.length >= PREVIEW_MAX_KEYS) {
            break;
        }
        let part = k + ": " + preview_scalar(obj[k]);
        /*  Stop at the width, but never with an empty preview: one field
            too wide still says more than a number.  */
        if(parts.length > 0 && used + part.length > PREVIEW_MAX_CHARS) {
            break;
        }
        parts.push(part);
        used += part.length + 2;
    }

    if(parts.length < count) {
        parts.push("…");
    }

    return "{" + parts.join(", ") + "}";
}

/************************************************************
 *  One field of any type. Scalars → a bullet row; objects and
 *  arrays → a collapsed <details> so metadata / nested payloads
 *  stay folded. Empty containers render inline.
 ************************************************************/
function traffic_value_node(key, value)
{
    if(value === null || typeof value !== "object") {
        return traffic_scalar_row(key, value);
    }

    let is_arr = Array.isArray(value);
    let count = is_arr ? value.length : Object.keys(value).length;
    if(count === 0) {
        return ['div', {class: 'TRAFFIC_ROW'}, [
            ['span', {class: 'TRAFFIC_BULLET'}, '•'],
            ['span', {class: 'TRAFFIC_KEY'}, key + ':'],
            ['span', {class: 'TRAFFIC_VAL t-empty'}, is_arr ? '[ ]' : '{ }'],
        ]];
    }

    let hint = is_arr ? `[${count}]` : object_preview(value, count);
    return ['details', {class: 'TRAFFIC_NEST'}, [
        ['summary', {}, [
            ['span', {class: 'TRAFFIC_BULLET'}, '▸'],
            ['span', {class: 'TRAFFIC_NEST_KEY'}, key],
            ['span', {class: 'TRAFFIC_NEST_HINT'}, hint],
        ]],
        ['div', {class: 'TRAFFIC_KW'}, traffic_bullets(value)],
    ]];
}

/************************************************************
 *  A whole object/array → an array of bullet nodes.
 ************************************************************/
function traffic_bullets(obj)
{
    let out = [];
    if(Array.isArray(obj)) {
        for(let i = 0; i < obj.length; i++) {
            out.push(traffic_value_node(String(i), obj[i]));
        }
    } else {
        for(let k of Object.keys(obj)) {
            out.push(traffic_value_node(k, obj[k]));
        }
    }
    return out;
}


                    /******************************
                     *      Entry rendering (per view)
                     ******************************/


function event_spans(e)
{
    let spans = [['span', {class: 'TRAFFIC_ARROW'}, dir_arrow(e.dir)],
                 ['span', {class: 'TRAFFIC_EVENT'}, e.event]];
    if(e.command) {
        spans.push(['span', {class: 'TRAFFIC_CMD'}, e.command]);
    }
    return spans;
}


function render_detailed(e)
{
    let head = event_spans(e);
    head.push(['span', {class: 'TRAFFIC_META'}, `${traffic_size(e.size)} · ${e.ts}`]);

    let children = [['div', {class: 'TRAFFIC_HEADER'}, head]];
    let kw = e.kw;
    if(kw && Object.keys(kw).length > 0) {
        children.push(['div', {class: 'TRAFFIC_KW'}, traffic_bullets(kw)]);
    } else if(!kw) {
        children.push(['div', {class: 'TRAFFIC_KW'}, traffic_bullets(e.jn)]);
    }
    return createElement2(['div', {class: 'TRAFFIC_ENTRY ' + dir_class(e.dir)}, children]);
}

/*  Whether an Expanded-view section is shown (persisted toggles). schema
 *  defaults OFF (rarely wanted); data + metadata default as noted. */
function full_show(key)
{
    let def = (key === "dev_full_data") ? 1 : 0;
    return !!dev_num(key, def);
}

/*  Filter a payload's top-level keys for the Expanded view: the `schema`
 *  and `data` keys and the `__…__` metadata markers are each shown only
 *  when their toggle is on; everything else is always kept. */
function full_sections(payload)
{
    if(!payload || typeof payload !== "object" || Array.isArray(payload)) {
        return payload;
    }
    let show_schema = full_show("dev_full_schema");
    let show_data = full_show("dev_full_data");
    let show_meta = full_show("dev_full_meta");
    let out = {};
    for(let k of Object.keys(payload)) {
        if(k === "schema") {
            if(show_schema) { out[k] = payload[k]; }
            continue;
        }
        if(k === "data") {
            if(show_data) { out[k] = payload[k]; }
            continue;
        }
        if(/^__.*__$/.test(k)) {
            if(show_meta) { out[k] = payload[k]; }
            continue;
        }
        out[k] = payload[k];
    }
    return out;
}

/*  Full view: the message payload pretty-printed and fully expanded
 *  (nothing folded) — for reading / copying a whole payload. The
 *  schema / data / metadata sections are toggled by the Expand chips. */
function render_full(e)
{
    let head = event_spans(e);
    head.push(['span', {class: 'TRAFFIC_META'}, `${traffic_size(e.size)} · ${e.ts}`]);

    let payload = full_sections(e.kw ? e.kw : e.jn);
    let text;
    try {
        text = JSON.stringify(payload, null, 4);
    } catch(err) {
        text = String(payload);
    }
    let children = [
        ['div', {class: 'TRAFFIC_HEADER'}, head],
        ['pre', {class: 'TRAFFIC_FULL'}, text],
    ];
    return createElement2(['div', {class: 'TRAFFIC_ENTRY ' + dir_class(e.dir)}, children]);
}

/*  A mirrored framework log line (error/warning/info/debug/msg). */
function render_log(e)
{
    let $row = createElement2(
        ['div', {class: 'YDEV_LOGROW YDEV_LOG_' + e.level}, [
            ['span', {class: 'YDEV_LOG_LVL'}, e.level],
            ['span', {class: 'YDEV_LOG_TXT'}, ''],
            ['span', {class: 'TRAFFIC_META'}, e.ts],
        ]]
    );

    /*  The text is assigned AFTER, and that is the whole point.
     *
     *  createElement2() TRIMS a string content -- it has to, to decide
     *  whether the string is HTML by looking at its first character -- and
     *  the machine trace's leading spaces are its NESTING: gobj-js prefixes
     *  every line with `tab()`, two spaces per level of __inside__, so an
     *  event sent from inside another one's action is indented under it.
     *  Passed through createElement2 that indentation was eaten, and the
     *  window showed a flat column where the console showed a tree. */
    let $txt = $row.querySelector('.YDEV_LOG_TXT');
    if($txt) {
        $txt.textContent = e.text;
    }

    return $row;
}

/*  A TRAFFIC entry always shows its payload -- folded (`collapsed`, the
 *  bullets) or laid out (`expanded`, the JSON). A trace line is written by
 *  the runtime and is painted as it comes; what shapes it is the TRACES row
 *  (the machine-trace format chip and the payload chip), not this.  */
function render_entry(e)
{
    if(e.kind === "log") {
        return render_log(e);
    }
    if(dev_traffic_view() === "expanded") {
        return render_full(e);
    }
    return render_detailed(e);
}


                    /******************************
                     *      Log painting
                     ******************************/


function clear_traffic()
{
    TRAFFIC_LOG.length = 0;
    LOG_ERR_COUNT = 0;
    LOG_WARN_COUNT = 0;
    let logger = document.getElementById('developer-traffic-logger');
    if(logger) {
        logger.replaceChildren();
    }
    update_stats();
}

/*  Full repaint from the buffer (view / filter changes, reopen). */
function rerender_all()
{
    let logger = document.getElementById('developer-traffic-logger');
    if(!logger) {
        return;
    }
    ensure_dev_style();
    let ctx = build_filter_ctx();
    let frag = document.createDocumentFragment();
    let shown = 0;
    for(let e of TRAFFIC_LOG) {
        e.$node = null;
        if(!entry_hidden(e, ctx)) {
            let node = render_entry(e);
            e.$node = node;
            frag.appendChild(node);
            shown++;
        }
    }
    logger.replaceChildren(frag);
    if(shown === 0) {
        logger.appendChild(make_placeholder());
    }
    logger.scrollTop = logger.scrollHeight;
    update_stats();
}

/*  The empty state, which has to say WHICH empty it is.  */
function make_placeholder()
{
    let $empty = document.createElement('div');
    $empty.className = 'YDEV_EMPTY';
    $empty.textContent = placeholder_text();
    return $empty;
}

function placeholder_text()
{
    if(TRAFFIC_LOG.length) {
        return "No messages match the current filters.";
    }
    return "Waiting for activity — console logs and errors show automatically; " +
        "enable Traffic or Automata for more.";
}

/*  Keep whatever placeholder is on screen TRUTHFUL.
 *
 *  A line that arrives and is filtered out changes the answer without
 *  changing the screen: the buffer stops being empty, so "Waiting for
 *  activity — enable Automata for more" becomes a lie, and the window reads
 *  as "nothing is happening, your traces are off" while it is in fact hiding
 *  36 of them. Measured on a yuno with one timer and the Periodic filter on,
 *  which is now the default: the status line said `0/36 shown · 36 hidden`
 *  and the panel said there was no activity. */
function refresh_placeholder()
{
    let logger = document.getElementById('developer-traffic-logger');
    if(!logger) {
        return;
    }
    let ph = logger.querySelector('.YDEV_EMPTY');
    if(!ph) {
        return;
    }
    let text = placeholder_text();
    if(ph.textContent !== text) {
        ph.textContent = text;
    }
}

/*  Live counters in the status strip. */
function update_stats()
{
    let $s = document.getElementById('ydev-stats');
    if(!$s) {
        return;
    }
    let ctx = build_filter_ctx();
    let total = TRAFFIC_LOG.length;
    let shown = 0, out = 0, inc = 0, err = 0, hidden = 0, bytes = 0;
    for(let e of TRAFFIC_LOG) {
        bytes += e.size || 0;
        if(e.dir === 1) {
            out++;
        } else if(e.dir === 2) {
            inc++;
        } else if(e.dir === 3) {
            err++;
        }
        if(entry_hidden(e, ctx)) {
            hidden++;
        } else {
            shown++;
        }
    }
    $s.replaceChildren();
    /*  Errors/warnings first — the signal you don't want to miss. Session
     *  totals (see LOG_ERR_COUNT), bold when non-zero so they stand out. */
    let cells = [
        [`✖ ${LOG_ERR_COUNT} err`, 's-err' + (LOG_ERR_COUNT ? ' is-strong' : '')],
        [`▲ ${LOG_WARN_COUNT} warn`, 's-warn' + (LOG_WARN_COUNT ? ' is-strong' : '')],
        [`${shown}/${total} shown`, ''],
        [`⇢ ${out}`, 's-out'],
        [`⇠ ${inc}`, 's-in'],
        [`⚠ ${err}`, 's-err'],
        [`⊘ ${hidden} hidden`, ''],
        [`${traffic_size(bytes)}`, ''],
    ];
    cells.forEach(([text, cls]) => {
        let d = document.createElement('span');
        d.className = 'YDEV_STAT' + (cls ? ' ' + cls : '');
        d.textContent = text;
        $s.appendChild(d);
    });
}

/************************************************************
 *  Append a row and follow the tail — but only when the user is
 *  already at (or near) the bottom; a reader scrolled up into the
 *  backlog must not be yanked down. Container-local on purpose:
 *  scrollIntoView also scrolls the host page's ancestors.
 ************************************************************/
function append_and_follow(logger, node)
{
    let at_bottom =
        logger.scrollHeight - logger.scrollTop - logger.clientHeight < 40;
    logger.appendChild(node);
    if(at_bottom) {
        logger.scrollTop = logger.scrollHeight;
    }
}

/************************************************************
 *  Keep one entry in the bounded buffer, dropping the oldest
 *  (and its row, if painted).
 ************************************************************/
function push_entry(entry)
{
    TRAFFIC_LOG.push(entry);
    if(TRAFFIC_LOG.length > TRAFFIC_MAX) {
        let old = TRAFFIC_LOG.shift();
        if(old.$node && old.$node.parentNode) {
            old.$node.parentNode.removeChild(old.$node);
        }
    }
}

/************************************************************
 *  Append one inter-event message. Kept in a bounded buffer so
 *  view/filter switches repaint from memory. Shared by the legacy
 *  C_YUI_WINDOW (setup_dev) and the modal (build_dev_panel).
 *
 *  direction: 1 outgoing (⇢), 2 incoming (⇠), 3 error (⚠).
 *  With no logger mounted, fall back to a console dump.
 ************************************************************/
function info_traffic(title, msg, direction, size)
{
    if(!size) {
        size = 0;
    }

    let jn;
    try {
        jn = is_string(msg) ? JSON.parse(msg) : JSON.parse(JSON.stringify(msg));
    } catch(e) {
        return;
    }

    let route = dev_route();

    let event = (jn && jn.event) ? String(jn.event) : "(no event)";
    let kw = (jn && jn.kw && typeof jn.kw === "object") ? jn.kw : null;
    let command = (kw && typeof kw.command === "string") ? kw.command : "";

    let hay = "";
    try {
        hay = (event + " " + command + " " + (kw ? JSON.stringify(kw) : "")).toLowerCase();
    } catch(e) {
        hay = (event + " " + command).toLowerCase();
    }

    let entry = {
        title: title || "", event: event, command: command,
        dir: direction, size: size, ts: traffic_now(),
        kw: kw, jn: jn, hay: hay, $node: null,
    };

    push_entry(entry);

    /*  ONE rule, two sinks. The filter used to be asked by the window only,
     *  and the console printed the very line the window had just hidden:
     *  hide the outgoing half, or type something in FIND, and the traffic
     *  went on arriving in the pane beside it. The answer is computed once,
     *  here, and both sinks obey it.  */
    let hidden = entry_hidden(entry, build_filter_ctx());

    /*  Console side (routes "console" / "both"), which has no window to
     *  depend on: it prints whether or not the monitor is mounted.  */
    if(route !== "window" && !hidden) {
        console_traffic(title, jn, direction, size);
    }

    /*  Window side: the entry is buffered above whatever happens, so the
     *  window shows what arrived before it was opened. Painted only when the
     *  window is mounted and not routed to the console only. */
    let logger = document.getElementById('developer-traffic-logger');
    if(!logger || route === "console") {
        return;
    }
    ensure_dev_style();

    if(!hidden) {
        let node = render_entry(entry);
        entry.$node = node;
        /*  Drop the "no traffic yet" placeholder before the first row. */
        let ph = logger.querySelector('.YDEV_EMPTY');
        if(ph) {
            ph.remove();
        }
        append_and_follow(logger, node);
    } else {
        refresh_placeholder();  /*  hidden, but the buffer is no longer empty  */
    }
    update_stats();
}


/*  Re-entrancy guard: rendering a captured log line must not itself capture
 *  the logs it emits (that would recurse). */
let __in_info_log__ = false;

/************************************************************
 *  Mirror one framework log line into the monitor, alongside the
 *  inter-event traffic. level ∈ error|warning|info|debug|msg — the automata
 *  (FSM) trace arrives here too, as `debug`. No-op while the window is closed
 *  (the line already went to the browser console).
 ************************************************************/
function info_log(level, msg, hora)
{
    if(__in_info_log__) {
        return;
    }
    /*  Tally errors/warnings for the status line, always — before any routing
     *  or window-open guard, so the count reflects the whole session even
     *  while the window is closed or output is routed to the console. */
    if(level === "error") {
        LOG_ERR_COUNT++;
    } else if(level === "warning") {
        LOG_WARN_COUNT++;
    }
    __in_info_log__ = true;
    try {
        let lvl = level || "debug";
        let text;
        if(lvl === "json") {
            try {
                text = JSON.stringify(msg, null, 4);
            } catch(e) {
                text = String(msg);
            }
            if(text.length > 4000) {
                text = text.slice(0, 4000) + "\n…(truncated)";
            }
        } else {
            text = is_string(msg) ? msg : String(msg);
        }
        /*  The time the line was WRITTEN, which the backlog replayed to a
         *  late sink makes different from now: `hora` is gobj-js's local
         *  timestamp (YYYY-MM-DDTHH:MM:SS.mmm±hhmm).  */
        let ts = (is_string(hora) && hora.length >= 23) ? hora.slice(11, 23) : traffic_now();
        let entry = {
            kind: "log", level: lvl, text: text,
            dir: 0, size: 0, ts: ts,
            hay: (lvl + " " + text).toLowerCase(), $node: null,
        };
        /*  Buffered always: the window shows what the app logged before it
         *  was opened. Painted only when mounted and not routed to the
         *  console only (the line already reached the console).  */
        push_entry(entry);
        let logger = document.getElementById('developer-traffic-logger');
        if(!logger || dev_route() === "console") {
            update_stats();
            return;
        }
        ensure_dev_style();
        if(!entry_hidden(entry, build_filter_ctx())) {
            let node = render_entry(entry);
            entry.$node = node;
            let ph = logger.querySelector('.YDEV_EMPTY');
            if(ph) {
                ph.remove();
            }
            append_and_follow(logger, node);
        } else {
            refresh_placeholder();  /*  hidden, but the buffer is no longer empty  */
        }
        update_stats();
    } finally {
        __in_info_log__ = false;
    }
}


                    /******************************
                     *      Trace toggles
                     ******************************/


/*  Send one of the yuno's trace commands; a refusal is said.  */
function yuno_trace_command(command, kw)
{
    let r = gobj_command(gobj_yuno(), command, kw, gobj_yuno());
    if(!r || r.result < 0) {
        log_error(`yui_dev: ${command} ${JSON.stringify(kw)}: ${r ? r.comment : "no answer"}`);
    }
    refresh_dev_chrome();
}

function global_bit(bit)
{
    return (gobj_global_trace_level() & bit) ? 1 : 0;
}

const GLOBAL_TRACE_BITS = {
    "machine":       trace_level_t.TRACE_MACHINE,
    "ev_kw":         trace_level_t.TRACE_EV_KW,
    "create_delete": trace_level_t.TRACE_CREATE_DELETE,
    "start_stop":    trace_level_t.TRACE_START_STOP,
    "subscriptions": trace_level_t.TRACE_SUBSCRIPTIONS,
};

function toggle_global(level)
{
    yuno_trace_command("set-global-trace",
        {level: level, set: global_bit(GLOBAL_TRACE_BITS[level]) ? 0 : 1});
}

/*  Automata cycles 0 → 1 (machine) → 2 (machine + the kw of each event) → 0. */
function automata_state()
{
    if(!global_bit(trace_level_t.TRACE_MACHINE)) {
        return 0;
    }
    return global_bit(trace_level_t.TRACE_EV_KW) ? 2 : 1;
}

function toggle_automata()
{
    let v = automata_state();
    if(v === 0) {
        yuno_trace_command("set-global-trace", {level: "machine", set: 1});
    } else if(v === 1) {
        yuno_trace_command("set-global-trace", {level: "ev_kw", set: 1});
    } else {
        yuno_trace_command("set-global-trace", {level: "ev_kw", set: 0});
        yuno_trace_command("set-global-trace", {level: "machine", set: 0});
    }
}

/*  Traffic is C_IEVENT_CLI's own level, as `set-gclass-trace
 *  gclass=C_IEVENT_CLI level=ievents` on a node. */
function traffic_state()
{
    /*  An app with no websocket registers no C_IEVENT_CLI: nothing to trace,
     *  and nothing wrong with that, so ask before reading its levels.  */
    if(!gclass_find_by_name("C_IEVENT_CLI")) {
        return 0;
    }
    return gobj_get_gclass_trace_level2("C_IEVENT_CLI").includes("ievents") ? 1 : 0;
}

function toggle_traffic()
{
    if(!gclass_find_by_name("C_IEVENT_CLI")) {
        log_error("yui_dev: no C_IEVENT_CLI in this app, there is no traffic to trace");
        return;
    }
    yuno_trace_command("set-gclass-trace",
        {gclass_name: "C_IEVENT_CLI", level: "ievents", set: traffic_state() ? 0 : 1});
}

/*  Periodic is EV_TIMEOUT_PERIODIC and nothing else: the global level
 *  `timer_periodic`. main() silences it with the NO-trace of the same
 *  level, which wins over the trace, so the chip moves both. */
function periodic_state()
{
    let on = gobj_global_trace_level() & trace_level_t.TRACE_TIMER_PERIODIC;
    let off = gobj_global_trace_no_level() & trace_level_t.TRACE_TIMER_PERIODIC;
    return (on && !off) ? 1 : 0;
}

function toggle_periodic()
{
    let v = periodic_state() ? 0 : 1;
    yuno_trace_command("set-global-trace", {level: "timer_periodic", set: v});
    yuno_trace_command("set-global-no-trace", {level: "timer_periodic", set: v ? 0 : 1});
}

/*  I18n is no trace of the runtime: i18next's own debug switch, kept in
 *  the browser as it always was. */
function i18n_state()
{
    return Number(kw_get_local_storage_value("trace_i18n", 0, false)) ? 1 : 0;
}

function toggle_i18n()
{
    let v = i18n_state() ? 0 : 1;
    i18next.options.debug = v ? true : false;
    kw_set_local_storage_value("trace_i18n", v);
    refresh_dev_chrome();
}


                    /******************************
                     *      Chrome (controls)
                     ******************************/


/*  Sync every control's visual state -- the trace chips from the
 *  runtime, the rest from persisted prefs -- plus the stats strip. Idempotent; null-guarded so
 *  it is safe to call whether or not the window is mounted. */
function refresh_dev_chrome()
{
    document.querySelectorAll('.YDEV_CHIP[data-trace]').forEach(($b) => {
        let key = $b.getAttribute('data-trace');
        let def = TRACE_DEFS.find((d) => d[0] === key);
        let label = t($b.getAttribute('data-label') || '');
        let v = def ? def[3]() : 0;
        $b.textContent = (key === "automata" && v > 0) ? (label + " " + v) : label;
        $b.classList.toggle('is-active', v > 0);
    });

    let view = dev_traffic_view();
    document.querySelectorAll('.YDEV_SEG_BTN[data-view]').forEach(($b) => {
        $b.classList.toggle('is-active', $b.getAttribute('data-view') === view);
    });

    let route = dev_route();
    document.querySelectorAll('.YDEV_SEG_BTN[data-output]').forEach(($b) => {
        $b.classList.toggle('is-active', $b.getAttribute('data-output') === route);
    });

    /*  The Expand section toggles only apply to the Expanded view — show
     *  the group only there, and reflect each toggle's persisted state. */
    let $eg = document.getElementById('ydev-expand-grp');
    if($eg) {
        $eg.style.display = (view === 'expanded') ? '' : 'none';
    }
    document.querySelectorAll('.YDEV_CHIP[data-expand]').forEach(($b) => {
        $b.classList.toggle('is-active', full_show($b.getAttribute('data-expand')));
    });

    document.querySelectorAll('.YDEV_CHIP[data-dir]').forEach(($b) => {
        $b.classList.toggle('is-active', !!dev_num($b.getAttribute('data-dir'), 1));
    });

    document.querySelectorAll('.YDEV_CHIP[data-toggle="automata-simple"]').forEach(($b) => {
        $b.classList.toggle('is-active', !!dev_simple_mach());
    });

    document.querySelectorAll('.YDEV_CHIP[data-toggle="traces-payload"]').forEach(($b) => {
        $b.classList.toggle('is-active', !!dev_traces_payload());
    });

    update_stats();
}

/*  Serialize the currently-visible (filtered) traffic to plain text:
 *  one header line per entry (time · direction · title · event/command)
 *  followed by its pretty-printed payload. Honours the active filters and
 *  search so the copy matches exactly what is on screen. */
function traffic_to_text()
{
    let ctx = build_filter_ctx();
    let out = [];
    for(let e of TRAFFIC_LOG) {
        if(entry_hidden(e, ctx)) {
            continue;
        }
        if(e.kind === "log") {
            /*  Mirrored log/automata line: no event/kw — serialize as shown. */
            out.push(`${e.ts} ${e.level}: ${e.text}`);
            out.push("");
            continue;
        }
        let head = `${e.ts} ${dir_arrow(e.dir)} ` +
            `${e.title ? "[" + e.title + "] " : ""}${e.event}` +
            `${e.command ? " " + e.command : ""}`;
        out.push(head);
        let payload = e.kw ? e.kw : e.jn;
        try {
            out.push(JSON.stringify(payload, null, 4));
        } catch(err) {
            out.push(String(payload));
        }
        out.push("");
    }
    return out.join("\n");
}

/*  Copy text to the clipboard, with a fallback for insecure contexts. */
function dev_copy_text(text)
{
    if(navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text).catch(() => {
            dev_fallback_copy(text);
        });
    }
    dev_fallback_copy(text);
    return Promise.resolve();
}

function dev_fallback_copy(text)
{
    let ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    try {
        document.execCommand("copy");
    } catch(e) {
        /*  nothing else to try  */
    }
    document.body.removeChild(ta);
}

/*  The control bar: trace toggles, view selector, direction
 *  filters, free-text search, copy, clear. Returns an element. */
function build_control_bar()
{
    let trace_chips = TRACE_DEFS.map(([key, label_key, title_key, state, toggle]) => ['button', {
        class: 'YDEV_CHIP', 'data-trace': key, 'data-label': label_key,
        'data-i18n': label_key, type: 'button',
        title: t(title_key), 'data-i18n-title': title_key,
        'aria-label': t(label_key), 'data-i18n-aria-label': label_key,
    }, t(label_key), {
        click: (ev) => {
            ev.stopPropagation();
            toggle();
        }
    }]);

    /*  Compact automata format (like the C kernel's trace_machine_format==1):
     *  one short line per transition, no return line. Applies to the FSM trace
     *  emitted while Automata is on. */
    let simple_mach = ['button', {
        class: 'YDEV_CHIP', 'data-toggle': 'automata-simple', type: 'button',
        title: t('machine trace shape'), 'data-i18n-title': 'machine trace shape',
        'data-i18n': 'simple mach',
    }, t('simple mach'), {
        click: (ev) => {
            ev.stopPropagation();
            let v = dev_simple_mach() ? 0 : 1;
            kw_set_local_storage_value(SIMPLE_MACH_KEY, v);
            gobj_set_trace_machine_format(v);
            refresh_dev_chrome();
        }
    }];

    /*  The TRACES feed's payload: the `json` lines a trace dumps (an ev_kw,
     *  a publication). It used to be taken away by the TRAFFIC view being
     *  set to names -- another feed's control -- so nothing said where the
     *  payloads had gone. Here it says it.  */
    let traces_payload = ['button', {
        class: 'YDEV_CHIP', 'data-toggle': 'traces-payload', type: 'button',
        title: t('show the payload of the traces'),
        'data-i18n-title': 'show the payload of the traces',
        'data-i18n': 'payload',
        'aria-label': t('payload'), 'data-i18n-aria-label': 'payload',
    }, t('payload'), {
        click: (ev) => {
            ev.stopPropagation();
            kw_set_local_storage_value("dev_traces_payload", dev_traces_payload() ? 0 : 1);
            rerender_all();
            refresh_dev_chrome();
        }
    }];

    /*  The TRAFFIC feed's own control, and it only says how much room its
     *  payload takes: the payload is always there. What shapes a TRACE is
     *  in the TRACES row (the machine-trace chip and `payload`), because
     *  both feeds can be on at once and neither may steer the other.  */
    let VIEW_TITLES = {
        collapsed: 'traffic payload folded',
        expanded:  'traffic payload laid out',
    };
    let mk_view = (v, label) => ['button', {
        class: 'YDEV_SEG_BTN', 'data-view': v, type: 'button',
        title: t(VIEW_TITLES[v]), 'data-i18n-title': VIEW_TITLES[v],
        'data-i18n': label,
        'aria-label': t(label), 'data-i18n-aria-label': label,
    }, t(label), {
        click: (ev) => {
            ev.stopPropagation();
            set_traffic_view(v);
        }
    }];

    let view_seg = ['div', {class: 'YDEV_SEG', id: 'ydev-seg'}, [
        mk_view('collapsed', 'collapsed'),
        mk_view('expanded', 'expanded'),
    ]];

    /*  Output routing: send traffic + all logs + automata to the dev window,
     *  the browser console, or both. */
    let OUT_TITLES = {
        window:  'dev window only',
        console: 'browser console only',
        both:    'dev window and browser console',
    };
    let mk_out = (v, label) => ['button', {
        class: 'YDEV_SEG_BTN', 'data-output': v, type: 'button',
        title: t(OUT_TITLES[v]), 'data-i18n-title': OUT_TITLES[v],
        'data-i18n': label,
    }, t(label), {
        click: (ev) => {
            ev.stopPropagation();
            set_output_route(v);
        }
    }];
    let output_seg = ['div', {class: 'YDEV_SEG', id: 'ydev-output'}, [
        mk_out('window', 'window'),
        mk_out('console', 'console'),
        mk_out('both', 'both'),
    ]];

    /*  Expanded-view section toggles (only meaningful in the 'expanded'
     *  traffic view; the group is shown/hidden by refresh_dev_chrome). */
    /*  The title says WHAT it does and not which section: composing
     *  `'Show ' + label + '...'` gives a string that is no i18n key, so
     *  it could never re-translate -- and the button's own label is the
     *  section anyway.  */
    let mk_expand = (key, label) => ['button', {
        class: 'YDEV_CHIP', 'data-expand': key, type: 'button',
        title: t('show this section in the expanded view'),
        'data-i18n-title': 'show this section in the expanded view',
        'data-i18n': label,
    }, t(label), {
        click: (ev) => {
            ev.stopPropagation();
            toggle_pref(key, (key === 'dev_full_data') ? 1 : 0);
        }
    }];
    let expand_grp = ['div', {class: 'YDEV_GROUP', id: 'ydev-expand-grp'}, [
        ['span', {class: 'YDEV_LABEL', 'data-i18n': 'expand'}, t('expand')],
        mk_expand('dev_full_schema', 'schema'),
        mk_expand('dev_full_data', 'data'),
        mk_expand('dev_full_meta', 'metadata'),
    ]];

    let mk_dir = (dir, glyph, key, title) => ['button', {
        class: 'YDEV_CHIP s-' + dir, 'data-dir': key, type: 'button',
        title: t(title), 'data-i18n-title': title,
    }, glyph, {
        click: (ev) => {
            ev.stopPropagation();
            toggle_pref(key, 1);
        }
    }];

    let dir_chips = [
        mk_dir('out', '⇢', 'dev_filter_out', 'outgoing'),
        mk_dir('in', '⇠', 'dev_filter_in', 'incoming'),
        mk_dir('err', '⚠', 'dev_filter_err', 'errors'),
    ];

    let search = ['input', {
        class: 'YDEV_SEARCH', type: 'search', 'data-role': 'search',
        placeholder: t('filter events / payload'),
        'data-i18n-placeholder': 'filter events / payload',
        title: t('filter events / payload'), 'data-i18n-title': 'filter events / payload',
        'aria-label': t('filter events / payload'), 'data-i18n-aria-label': 'filter events / payload',
    }, '', {
        input: (ev) => {
            SEARCH_TEXT = String(ev.target.value || '').toLowerCase().trim();
            rerender_all();
        }
    }];

    /*  Its own button: a `type=search` input shows a clear cross in some
     *  browsers only (not in Firefox).  */
    let search_clear = ['button', {
        class: 'YDEV_CHIP YDEV_SEARCH_CLEAR', type: 'button',
        title: t('clear the filter'), 'data-i18n-title': 'clear the filter',
        'aria-label': t('clear the filter'), 'data-i18n-aria-label': 'clear the filter',
    }, '✕', {
        click: (ev) => {
            ev.stopPropagation();
            let $bar = ev.currentTarget.closest('.YDEV_BAR');
            let $input = $bar ? $bar.querySelector('.YDEV_SEARCH') : null;
            if($input) {
                $input.value = '';
                $input.focus();
            }
            SEARCH_TEXT = '';
            rerender_all();
        }
    }];

    let copy = ['button', {class: 'YDEV_CHIP', type: 'button',
        title: t('copy visible traffic to clipboard'),
        'data-i18n-title': 'copy visible traffic to clipboard',
        'data-i18n': 'copy'}, t('copy'), {
        click: (ev) => {
            ev.stopPropagation();
            let btn = ev.currentTarget;
            dev_copy_text(traffic_to_text()).then(() => {
                let prev = btn.textContent;
                btn.textContent = t('copied');
                setTimeout(() => { btn.textContent = prev; }, 1000);
            });
        }
    }];

    let clear = ['button', {class: 'YDEV_CHIP', type: 'button',
        title: t('clear captured traffic'),
        'data-i18n-title': 'clear captured traffic',
        'data-i18n': 'clear'}, t('clear'), {
        click: (ev) => {
            ev.stopPropagation();
            clear_traffic();
        }
    }];

    let grp = (label, items) => ['div', {class: 'YDEV_GROUP'},
        [['span', {class: 'YDEV_LABEL', 'data-i18n': label}, t(label)], ...items]];
    let sep = () => ['span', {class: 'YDEV_SEP'}, ''];

    return createElement2(['div', {class: 'YDEV_BAR'}, [
        grp('traces', [...trace_chips, simple_mach, traces_payload]), sep(),
        grp('output', [output_seg]), sep(),
        grp('view', [view_seg]), expand_grp, sep(),
        grp('show', dir_chips), sep(),
        grp('find', [search, search_clear]), sep(),
        grp('log', [copy, clear]),
    ]]);
}

/*  The window title strip (draggable header of C_YUI_WINDOW). */
function build_title_header()
{
    return createElement2(['div', {class: 'YDEV_TITLE'}, [
        ['span', {class: 'YDEV_TITLE_MAIN', 'data-i18n': 'developer'}, t('developer')],
        ['span', {class: 'YDEV_TITLE_SUB', 'data-i18n': 'yuno monitor'},
         t('yuno monitor')],
    ]]);
}

/*  The monitor body: control bar + log + stats strip. */
function build_dev_body()
{
    return createElement2(['div', {class: 'YDEV_BODY'}, [
        build_control_bar(),
        ['div', {class: 'YDEV_LOG', id: 'developer-traffic-logger'}, []],
        ['div', {class: 'YDEV_STATS', id: 'ydev-stats'}, []],
    ]]);
}


                    /******************************
                     *      Public API
                     ******************************/


/************************************************************
 *  Was the developer window open last session?  setup_dev()
 *  persists open_developer_window (1 on open, 0 on close), so
 *  the host can reopen it on refresh and keep collecting
 *  traffic/traces it had enabled.
 ************************************************************/
function dev_window_was_open()
{
    return Number(kw_get_local_storage_value("open_developer_window", 0, false))
        ? true : false;
}

/************************************************************
 *  Wire the developer window's sinks and the browser-side prefs.
 *  Call it once at app startup.
 *
 *  The TRACE LEVELS are not here: the yuno restores the ones the user
 *  persisted in its own mt_create (`trace_levels` / `no_trace_levels`),
 *  as a C yuno does. What is left is where the output goes.
 ************************************************************/
function apply_dev_traces()
{
    /*  The traffic trace of C_IEVENT_CLI lands in this window.  */
    gobj_write_attr(gobj_yuno(), "trace_ievent_callback", info_traffic);

    i18next.options.debug = i18n_state() ? true : false;

    /*  Which shape the machine trace is written in (persisted). */
    gobj_set_trace_machine_format(dev_simple_mach());

    /*  Mirror the browser console (log_error/warning/info/debug/msg — the
     *  automata FSM trace arrives as debug) into the monitor. info_log no-ops
     *  while the window is closed, so this is safe to leave armed. */
    set_log_callback(info_log);

    /*  Honour the persisted Window / Console / Both routing at startup so a
     *  refresh keeps the console silenced when "Window only" was chosen. */
    apply_console_route();
}

/************************************************************
 *  Open the developer monitor inside a non-modal C_YUI_WINDOW
 *  (title bar + maximize + close + resize).
 *
 *  Shell-agnostic: the legacy C_YUI_MAIN shell has a
 *  '#top-layer' stacking element; the new C_YUI_SHELL does not.
 *  We pass that element when present, otherwise null — C_YUI_WINDOW
 *  falls back to document.body by contract.
 ************************************************************/
function setup_dev(self, show)
{
    if(show) {
        ensure_dev_style();

        let win = gobj_create_service(
            "Developer-Window",
            "C_YUI_WINDOW",
            {
                $parent: document.getElementById('top-layer') || null,
                subscriber: null,
                showMax: true,
                modal: false,
                header: build_title_header(),
                body: build_dev_body(),
                showFooter: false,
                auto_save_size_and_position: true,
                center: false,
                title: "developer",
                icon: "yi-terminal",
                /*  Opt into the dock/taskbar if the app provides one. `|| null`
                 *  because gobj_find_service returns undefined when absent, and
                 *  an undefined attr value logs "attr undefined: manager" (apps
                 *  without a window manager, e.g. wattyzer). null = no dock. */
                manager: gobj_find_service("__window_manager__", false) || null,
                /*  A monitor is watched WHILE navigating: closing it on every
                 *  route change made it useless for the one job it has.  A
                 *  dock-managed window is outside the drain already; this is
                 *  the same for an app with no dock. */
                keep_on_navigate: true,
                on_close: function() {
                    kw_set_local_storage_value("open_developer_window", 0);
                }
            },
            self
        );
        /*  c_yuno's mt_play only starts the DEFAULT service, so a service
         *  created here is ours to start; unstarted, it shows up in every
         *  trace line as `!!C_YUI_WINDOW^Developer-Window`. */
        gobj_start(win);

        kw_set_local_storage_value("open_developer_window", 1);

        /*  Mounted synchronously above; paint state + buffered history
         *  on the next tick to be safe against mount ordering. */
        setTimeout(() => {
            refresh_dev_chrome();
            rerender_all();
        }, 0);
    }

    apply_dev_traces();
}

/************************************************************
 *  Build the developer monitor as a self-contained DOM subtree,
 *  to be mounted by the new declarative shell via
 *  yui_shell_show_modal (no C_YUI_WINDOW, no 'top-layer').
 *
 *  Returns { $el, dispose }:
 *    - $el:     the panel element (control bar + log + stats).
 *    - dispose: call it from the modal's on_close (kept for the
 *               contract; the traces outlive the panel).
 ************************************************************/
function build_dev_panel()
{
    ensure_dev_style();

    let dark = (typeof document !== "undefined") &&
        document.documentElement.getAttribute("data-theme") === "dark";
    let surface = dark ? "#1f2733" : "#ffffff";
    let fg = dark ? "#e8eaed" : "#0f172a";
    let bd = dark ? "#3a4250" : "#cbd5e1";

    let $el = createElement2(
        ['div', {
            class: 'yui-dev-panel',
            style:
                'display:flex;flex-direction:column;box-sizing:border-box;' +
                'width:100%;height:min(72vh,720px);max-height:82vh;' +
                'background:' + surface + ';color:' + fg + ';' +
                'border:1px solid ' + bd + ';border-radius:10px;' +
                'box-shadow:0 10px 30px rgba(0,0,0,0.35);overflow:hidden;',
        }, [build_dev_body()]]
    );

    apply_dev_traces();

    setTimeout(() => {
        refresh_dev_chrome();
        rerender_all();
    }, 0);

    /*  Nothing to undo: a trace level is the yuno's state, persisted,
     *  and it is not tied to this panel being open.  */
    let dispose = function() {
    };

    return {$el: $el, dispose: dispose};
}

export {info_traffic, setup_dev, build_dev_panel, apply_dev_traces, dev_window_was_open};
