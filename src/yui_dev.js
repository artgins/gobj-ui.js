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
    gobj_create_service,
    gobj_find_service,
    set_log_callback,
    gobj_set_trace_machine_format,
    trace_json,
} from "@yuneta/gobj-js";

import i18next from 'i18next';

/***********************************************************************
 *          Traffic model (bounded ring buffer)
 *
 *  Every inter-event message is kept as a lightweight record so view
 *  and filter changes re-render instantly from memory instead of
 *  losing history. Reopening the window repaints the buffer.
 ***********************************************************************/
const TRAFFIC_MAX = 600;            // capped history
const PERIODIC_THRESHOLD = 5;       // a signature seen >= N times reads as recurring
const PERIODIC_RE = /PERIODIC|TIMEOUT|HEARTBEAT|PING/i;

let TRAFFIC_LOG = [];               // [{title,event,command,sig,dir,size,ts,kw,jn,hay,$node}]
let TRAFFIC_COUNTS = new Map();     // signature -> occurrences (for periodic detection)
let SEARCH_TEXT = "";               // session-only free-text filter (not persisted)

/*  Field names whose numeric value is a Unix timestamp (seconds). */
const TRAFFIC_TS_FIELDS = {
    "__t__": 1, "__tm__": 1, "tm": 1, "t": 1,
    "from_t": 1, "to_t": 1, "from_tm": 1, "to_tm": 1, "time": 1,
};

/*  Trace toggles: [localStorage key, display label, handler]. */
const TRACE_DEFS = [
    ["trace_automata",      "Automata",      trace_automata],
    ["trace_creation",      "Creation",      trace_creation],
    ["trace_start_stop",    "Start/Stop",    trace_start_stop],
    ["trace_subscriptions", "Subscriptions", trace_subscriptions],
    ["trace_i18n",          "I18n",          trace_i18n],
    ["trace_traffic",       "Traffic",       trace_traffic],
    ["no_poll",             "No Poll",       set_no_poll],
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

/************************************************************
 *  Clip a string for inline display (full text kept elsewhere).
 ************************************************************/
function traffic_clip(s, n)
{
    s = String(s);
    return s.length > n ? s.slice(0, n) + "…" : s;
}

/************************************************************
 *  A scalar rendered as a short inline token (for summaries).
 ************************************************************/
function traffic_scalar_text(v)
{
    if(v === null) {
        return "null";
    }
    if(typeof v === "string") {
        return traffic_clip(v, 40);
    }
    return String(v);
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

function dev_view()
{
    let v = kw_get_local_storage_value("dev_view_mode", "detailed", false);
    return (v === "compact" || v === "name" || v === "full") ? v : "detailed";
}

function dev_hide_periodic()
{
    return dev_num("dev_hide_periodic", 0) ? true : false;
}

function dev_muted()
{
    let a = kw_get_local_storage_value("dev_muted_events", [], false);
    if(!Array.isArray(a)) {
        a = [];
    }
    return new Set(a);
}

function dev_set_muted(set)
{
    kw_set_local_storage_value("dev_muted_events", Array.from(set));
}

function set_view(v)
{
    kw_set_local_storage_value("dev_view_mode", v);
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

function mute_signature(sig)
{
    let set = dev_muted();
    set.add(sig);
    dev_set_muted(set);
    rerender_all();
    refresh_dev_chrome();
}

function unmute_signature(sig)
{
    let set = dev_muted();
    set.delete(sig);
    dev_set_muted(set);
    rerender_all();
    refresh_dev_chrome();
}


                    /******************************
                     *      Filtering
                     ******************************/


/*  Signature identifies a "kind" of message. Command answers share
 *  the generic EV_MT_COMMAND event, so fold the command in to tell
 *  a get-stats poll apart from a user action. */
function traffic_signature(event, command)
{
    return command ? (event + " · " + command) : event;
}

function traffic_is_periodic(sig)
{
    if(PERIODIC_RE.test(sig)) {
        return true;
    }
    return (TRAFFIC_COUNTS.get(sig) || 0) >= PERIODIC_THRESHOLD;
}

function build_filter_ctx()
{
    return {
        out:            dev_num("dev_filter_out", 1),
        inc:            dev_num("dev_filter_in", 1),
        err:            dev_num("dev_filter_err", 1),
        muted:          dev_muted(),
        hide_periodic:  dev_hide_periodic(),
        search:         SEARCH_TEXT,
    };
}

function entry_hidden(e, ctx)
{
    if(e.kind === "log") {
        /*  Mirrored console logs respect the search box only — not the
         *  in/out/err/periodic traffic filters. */
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
    if(ctx.muted.has(e.sig)) {
        return true;
    }
    if(ctx.hide_periodic && traffic_is_periodic(e.sig)) {
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
.YDEV_MUTED {
    display: flex; flex-wrap: wrap; gap: 6px; align-items: center;
    padding: 4px 10px; border-bottom: 1px solid rgba(0,0,0,0.08); font-size: 12px;
}
.YDEV_MUTED:empty { display: none; }
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
.YDEV_CHIP[data-toggle="periodic"].is-active { background: rgba(217,119,6,0.16); border-color: #d97706; color: #b45309; font-weight: 600; }
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
.YDEV_MUTED_CHIP {
    font: inherit; font-family: "DejaVu Sans Mono", monospace; font-size: 12px;
    display: inline-flex; align-items: center; gap: 6px; padding: 2px 8px;
    border: 1px solid rgba(217,119,6,0.5); border-radius: 999px;
    background: rgba(217,119,6,0.12); color: #b45309; cursor: pointer;
}
.YDEV_STAT.s-out { color: #2563eb; } .YDEV_STAT.s-in { color: #059669; } .YDEV_STAT.s-err { color: #dc2626; }
.YDEV_TITLE { display: flex; align-items: baseline; gap: 8px; }
.YDEV_TITLE_MAIN { font-weight: 700; }
.YDEV_TITLE_SUB { opacity: 0.7; font-size: 12px; }
/* -------- entries (shared) -------- */
.TRAFFIC_ENTRY, .TRAFFIC_LINE, .TRAFFIC_NAME {
    border-left: 3px solid #94a3b8; border-radius: 3px;
    font-family: "DejaVu Sans Mono", monospace, consolas, monaco; font-size: 13px;
    background: rgba(0,0,0,0.02);
}
.TRAFFIC_ENTRY { margin: 6px 0; padding: 4px 8px; line-height: 1.55; }
.TRAFFIC_LINE  { margin: 2px 0; padding: 2px 8px; display: flex; align-items: baseline; gap: 8px; }
.TRAFFIC_NAME  { margin: 1px 0; padding: 1px 8px; display: flex; align-items: baseline; gap: 8px; background: transparent; }
.TRAFFIC_ENTRY.dir-out, .TRAFFIC_LINE.dir-out, .TRAFFIC_NAME.dir-out { border-left-color: #2563eb; }
.TRAFFIC_ENTRY.dir-in,  .TRAFFIC_LINE.dir-in,  .TRAFFIC_NAME.dir-in  { border-left-color: #059669; }
.TRAFFIC_ENTRY.dir-err, .TRAFFIC_LINE.dir-err, .TRAFFIC_NAME.dir-err { border-left-color: #dc2626; }
.TRAFFIC_HEADER { display: flex; align-items: baseline; gap: 8px; }
.TRAFFIC_ARROW { font-weight: 700; }
.TRAFFIC_EVENT { font-weight: 700; }
.TRAFFIC_CMD { opacity: 0.75; font-weight: 600; }
.dir-out .TRAFFIC_ARROW, .dir-out .TRAFFIC_EVENT { color: #2563eb; }
.dir-in  .TRAFFIC_ARROW, .dir-in  .TRAFFIC_EVENT { color: #059669; }
.dir-err .TRAFFIC_ARROW, .dir-err .TRAFFIC_EVENT { color: #dc2626; }
.TRAFFIC_SUMMARY { opacity: 0.6; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1 1 auto; min-width: 0; }
.TRAFFIC_META { margin-left: auto; opacity: 0.6; font-size: 11px; white-space: nowrap; }
.TRAFFIC_MUTE { border: 0; background: transparent; color: inherit; cursor: pointer; opacity: 0; font-size: 12px; padding: 0 2px; flex: 0 0 auto; }
.TRAFFIC_ENTRY:hover .TRAFFIC_MUTE, .TRAFFIC_LINE:hover .TRAFFIC_MUTE, .TRAFFIC_NAME:hover .TRAFFIC_MUTE { opacity: 0.5; }
.TRAFFIC_MUTE:hover { opacity: 1 !important; color: #d97706; }
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
:root[data-theme="dark"] .TRAFFIC_ENTRY, :root[data-theme="dark"] .TRAFFIC_LINE { background: rgba(255,255,255,0.03); }
:root[data-theme="dark"] .TRAFFIC_ENTRY.dir-out, :root[data-theme="dark"] .TRAFFIC_LINE.dir-out, :root[data-theme="dark"] .TRAFFIC_NAME.dir-out { border-left-color: #60a5fa; }
:root[data-theme="dark"] .TRAFFIC_ENTRY.dir-in,  :root[data-theme="dark"] .TRAFFIC_LINE.dir-in,  :root[data-theme="dark"] .TRAFFIC_NAME.dir-in  { border-left-color: #34d399; }
:root[data-theme="dark"] .TRAFFIC_ENTRY.dir-err, :root[data-theme="dark"] .TRAFFIC_LINE.dir-err, :root[data-theme="dark"] .TRAFFIC_NAME.dir-err { border-left-color: #f87171; }
:root[data-theme="dark"] .dir-out .TRAFFIC_ARROW, :root[data-theme="dark"] .dir-out .TRAFFIC_EVENT { color: #60a5fa; }
:root[data-theme="dark"] .dir-in .TRAFFIC_ARROW,  :root[data-theme="dark"] .dir-in .TRAFFIC_EVENT { color: #34d399; }
:root[data-theme="dark"] .dir-err .TRAFFIC_ARROW, :root[data-theme="dark"] .dir-err .TRAFFIC_EVENT { color: #f87171; }
:root[data-theme="dark"] .YDEV_STAT.s-out { color: #60a5fa; } :root[data-theme="dark"] .YDEV_STAT.s-in { color: #34d399; } :root[data-theme="dark"] .YDEV_STAT.s-err { color: #f87171; }
:root[data-theme="dark"] .TRAFFIC_VAL.t-num { color: #22d3ee; }
:root[data-theme="dark"] .TRAFFIC_VAL.t-bool, :root[data-theme="dark"] .TRAFFIC_VAL.t-null { color: #c084fc; }
:root[data-theme="dark"] .YDEV_CHIP.is-active { background: rgba(96,165,250,0.2); border-color: #60a5fa; color: #93c5fd; }
:root[data-theme="dark"] .YDEV_SEG_BTN.is-active { background: #2563eb; color: #fff; }
:root[data-theme="dark"] .YDEV_CHIP[data-toggle="periodic"].is-active { background: rgba(217,119,6,0.24); border-color: #f59e0b; color: #fbbf24; }
:root[data-theme="dark"] .YDEV_MUTED_CHIP { border-color: rgba(245,158,11,0.5); background: rgba(245,158,11,0.16); color: #fbbf24; }
`;
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
 *  Type-coloured; long strings clipped (full text on hover);
 *  timestamp fields get an ISO annotation.
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

    let full = text;
    if(text.length > 200) {
        text = text.slice(0, 200) + "…";
    }

    let val_children = [
        ['span', {class: 'TRAFFIC_VAL ' + cls, title: full}, text],
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

    let hint = is_arr ? `[${count}]` : `{${count}}`;
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


/*  A small mute affordance that silences this signature (persistent). */
function mute_button(sig)
{
    return ['button', {class: 'TRAFFIC_MUTE', type: 'button', title: 'Mute ' + sig}, '⊘', {
        click: (ev) => {
            ev.stopPropagation();
            ev.preventDefault();
            mute_signature(sig);
        }
    }];
}

function event_spans(e)
{
    let spans = [['span', {class: 'TRAFFIC_ARROW'}, dir_arrow(e.dir)],
                 ['span', {class: 'TRAFFIC_EVENT'}, e.event]];
    if(e.command) {
        spans.push(['span', {class: 'TRAFFIC_CMD'}, e.command]);
    }
    return spans;
}

/*  One-line summary of the kw for the compact view. */
function compact_summary(kw)
{
    if(!kw) {
        return "";
    }
    let parts = [];
    if("result" in kw) {
        parts.push("result=" + traffic_scalar_text(kw.result));
    }
    if(typeof kw.comment === "string" && kw.comment) {
        parts.push(traffic_clip(kw.comment, 80));
    }
    if(!parts.length) {
        let n = 0;
        for(let k of Object.keys(kw)) {
            if(k === "command") {
                continue;
            }
            let v = kw[k];
            if(v === null || typeof v !== "object") {
                parts.push(k + "=" + traffic_scalar_text(v));
                if(++n >= 3) {
                    break;
                }
            }
        }
    }
    return traffic_clip(parts.join("  ·  "), 140);
}

function render_detailed(e)
{
    let head = event_spans(e);
    head.push(mute_button(e.sig));
    head.push(['span', {class: 'TRAFFIC_META'}, `${traffic_size(e.size)} · ${e.ts}`]);

    let children = [['div', {class: 'TRAFFIC_HEADER'}, head]];
    let kw = e.kw;
    if(kw && Object.keys(kw).length > 0) {
        children.push(['div', {class: 'TRAFFIC_KW'}, traffic_bullets(kw)]);
    } else if(!kw) {
        children.push(['div', {class: 'TRAFFIC_KW'}, traffic_bullets(e.jn)]);
    }
    return createElement2(['div', {class: 'TRAFFIC_ENTRY ' + dir_class(e.dir), title: e.title}, children]);
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
    head.push(mute_button(e.sig));
    head.push(['span', {class: 'TRAFFIC_META'}, `${traffic_size(e.size)} · ${e.ts}`]);

    let payload = full_sections(e.kw ? e.kw : e.jn);
    let text;
    try {
        text = JSON.stringify(payload, null, 2);
    } catch(err) {
        text = String(payload);
    }
    let children = [
        ['div', {class: 'TRAFFIC_HEADER'}, head],
        ['pre', {class: 'TRAFFIC_FULL'}, text],
    ];
    return createElement2(['div', {class: 'TRAFFIC_ENTRY ' + dir_class(e.dir), title: e.title}, children]);
}

function render_compact(e)
{
    let kids = event_spans(e);
    kids.push(['span', {class: 'TRAFFIC_SUMMARY'}, compact_summary(e.kw)]);
    kids.push(mute_button(e.sig));
    kids.push(['span', {class: 'TRAFFIC_META'}, `${traffic_size(e.size)} · ${e.ts}`]);
    return createElement2(['div', {class: 'TRAFFIC_LINE ' + dir_class(e.dir), title: e.title}, kids]);
}

function render_name(e)
{
    let kids = event_spans(e);
    kids.push(mute_button(e.sig));
    kids.push(['span', {class: 'TRAFFIC_META'}, e.ts]);
    return createElement2(['div', {class: 'TRAFFIC_NAME ' + dir_class(e.dir), title: e.title}, kids]);
}

/*  A mirrored framework log line (error/warning/info/debug/msg). */
function render_log(e)
{
    return createElement2(
        ['div', {class: 'YDEV_LOGROW YDEV_LOG_' + e.level, title: e.level}, [
            ['span', {class: 'YDEV_LOG_LVL'}, e.level],
            ['span', {class: 'YDEV_LOG_TXT'}, e.text],
            ['span', {class: 'TRAFFIC_META'}, e.ts],
        ]]
    );
}

function render_entry(e)
{
    if(e.kind === "log") {
        return render_log(e);
    }
    let view = dev_view();
    if(view === "full") {
        return render_full(e);
    }
    if(view === "compact") {
        return render_compact(e);
    }
    if(view === "name") {
        return render_name(e);
    }
    return render_detailed(e);
}


                    /******************************
                     *      Log painting
                     ******************************/


function clear_traffic()
{
    TRAFFIC_LOG.length = 0;
    TRAFFIC_COUNTS.clear();
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
        let $empty = document.createElement('div');
        $empty.className = 'YDEV_EMPTY';
        $empty.textContent = TRAFFIC_LOG.length
            ? "No messages match the current filters."
            : "Waiting for activity — console logs and errors show automatically; enable Traffic or Automata for more.";
        logger.appendChild($empty);
    }
    logger.scrollTop = logger.scrollHeight;
    update_stats();
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
    let cells = [
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
 *  Append one inter-event message. Kept in a bounded buffer so
 *  view/filter switches repaint from memory. Shared by the legacy
 *  C_YUI_WINDOW (setup_dev) and the modal (build_dev_panel).
 *
 *  direction: 1 outgoing (⇢), 2 incoming (⇠), 3 error (⚠).
 *  With no logger mounted, fall back to a console dump.
 ************************************************************/
function info_traffic(title, msg, direction, size)
{
    let logger = document.getElementById('developer-traffic-logger');
    if(!logger) {
        trace_json(msg);
        return;
    }

    if(!size) {
        size = 0;
    }

    let jn;
    try {
        jn = is_string(msg) ? JSON.parse(msg) : JSON.parse(JSON.stringify(msg));
    } catch(e) {
        return;
    }

    ensure_dev_style();

    let event = (jn && jn.event) ? String(jn.event) : "(no event)";
    let kw = (jn && jn.kw && typeof jn.kw === "object") ? jn.kw : null;
    let command = (kw && typeof kw.command === "string") ? kw.command : "";
    let sig = traffic_signature(event, command);

    let hay = "";
    try {
        hay = (event + " " + command + " " + (kw ? JSON.stringify(kw) : "")).toLowerCase();
    } catch(e) {
        hay = (event + " " + command).toLowerCase();
    }

    let entry = {
        title: title || "", event: event, command: command, sig: sig,
        dir: direction, size: size, ts: traffic_now(),
        kw: kw, jn: jn, hay: hay, $node: null,
    };

    TRAFFIC_LOG.push(entry);
    TRAFFIC_COUNTS.set(sig, (TRAFFIC_COUNTS.get(sig) || 0) + 1);

    /*  When a signature just crosses the "recurring" threshold and
     *  the periodic filter is on, its earlier entries must disappear
     *  too — a full repaint is the correct, simple answer. */
    let crossed = dev_hide_periodic() && (TRAFFIC_COUNTS.get(sig) === PERIODIC_THRESHOLD);

    if(TRAFFIC_LOG.length > TRAFFIC_MAX) {
        let old = TRAFFIC_LOG.shift();
        let c = (TRAFFIC_COUNTS.get(old.sig) || 0) - 1;
        if(c <= 0) {
            TRAFFIC_COUNTS.delete(old.sig);
        } else {
            TRAFFIC_COUNTS.set(old.sig, c);
        }
        if(old.$node && old.$node.parentNode) {
            old.$node.parentNode.removeChild(old.$node);
        }
    }

    if(crossed) {
        rerender_all();
    } else if(!entry_hidden(entry, build_filter_ctx())) {
        let node = render_entry(entry);
        entry.$node = node;
        /*  Drop the "no traffic yet" placeholder before the first row. */
        let ph = logger.querySelector('.YDEV_EMPTY');
        if(ph) {
            ph.remove();
        }
        logger.appendChild(node);
        node.scrollIntoView({block: "end"});
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
    let logger = document.getElementById('developer-traffic-logger');
    if(!logger) {
        return;
    }
    __in_info_log__ = true;
    try {
        ensure_dev_style();
        let lvl = level || "debug";
        let text;
        if(lvl === "json") {
            try {
                text = JSON.stringify(msg, null, 2);
            } catch(e) {
                text = String(msg);
            }
            if(text.length > 4000) {
                text = text.slice(0, 4000) + "\n…(truncated)";
            }
        } else {
            text = is_string(msg) ? msg : String(msg);
        }
        let entry = {
            kind: "log", level: lvl, text: text,
            dir: 0, size: 0, ts: traffic_now(),
            sig: "log:" + lvl, hay: (lvl + " " + text).toLowerCase(), $node: null,
        };
        TRAFFIC_LOG.push(entry);
        if(TRAFFIC_LOG.length > TRAFFIC_MAX) {
            let old = TRAFFIC_LOG.shift();
            if(old.kind !== "log") {
                let c = (TRAFFIC_COUNTS.get(old.sig) || 0) - 1;
                if(c <= 0) {
                    TRAFFIC_COUNTS.delete(old.sig);
                } else {
                    TRAFFIC_COUNTS.set(old.sig, c);
                }
            }
            if(old.$node && old.$node.parentNode) {
                old.$node.parentNode.removeChild(old.$node);
            }
        }
        if(!entry_hidden(entry, build_filter_ctx())) {
            let node = render_entry(entry);
            entry.$node = node;
            let ph = logger.querySelector('.YDEV_EMPTY');
            if(ph) {
                ph.remove();
            }
            logger.appendChild(node);
            node.scrollIntoView({block: "end"});
        }
        update_stats();
    } finally {
        __in_info_log__ = false;
    }
}


                    /******************************
                     *      Trace toggles
                     ******************************/


function trace_traffic()
{
    let v = Number(kw_get_local_storage_value("trace_traffic"));
    if(v) {
        gobj_write_attr(gobj_yuno(), "trace_inter_event", false);
        v = 0;
    } else {
        gobj_write_attr(gobj_yuno(), "trace_inter_event", true);
        gobj_write_attr(gobj_yuno(), "trace_ievent_callback", info_traffic);
        v = 1;
    }
    kw_set_local_storage_value("trace_traffic", v);
    refresh_dev_chrome();
}

function trace_automata()
{
    let v = Number(kw_get_local_storage_value("trace_automata"));
    if(v === 0) {
        v = 1;
    } else if(v === 1) {
        v = 2;
    } else {
        v = 0;
    }
    gobj_write_attr(gobj_yuno(), "tracing", v);
    kw_set_local_storage_value("trace_automata", v);
    refresh_dev_chrome();
}

function trace_creation()
{
    let v = Number(kw_get_local_storage_value("trace_creation"));
    v = v === 0 ? 1 : 0;
    gobj_write_attr(gobj_yuno(), "trace_creation", v);
    kw_set_local_storage_value("trace_creation", v);
    refresh_dev_chrome();
}

function trace_start_stop()
{
    let v = Number(kw_get_local_storage_value("trace_start_stop"));
    v = v === 0 ? 1 : 0;
    gobj_write_attr(gobj_yuno(), "trace_start_stop", v);
    kw_set_local_storage_value("trace_start_stop", v);
    refresh_dev_chrome();
}

function trace_subscriptions()
{
    let v = Number(kw_get_local_storage_value("trace_subscriptions"));
    v = v === 0 ? 1 : 0;
    gobj_write_attr(gobj_yuno(), "trace_subscriptions", v);
    kw_set_local_storage_value("trace_subscriptions", v);
    refresh_dev_chrome();
}

function trace_i18n()
{
    let v = Number(kw_get_local_storage_value("trace_i18n"));
    v = v === 0 ? 1 : 0;
    i18next.options.debug = v ? true : false;
    kw_set_local_storage_value("trace_i18n", v);
    refresh_dev_chrome();
}

function set_no_poll()
{
    let v = Number(kw_get_local_storage_value("no_poll"));
    v = v ? 0 : 1;
    gobj_write_attr(gobj_yuno(), "no_poll", v);
    kw_set_local_storage_value("no_poll", v);
    refresh_dev_chrome();
}


                    /******************************
                     *      Chrome (controls)
                     ******************************/


/*  Sync every control's visual state from persisted prefs, plus the
 *  muted-events row and the stats strip. Idempotent; null-guarded so
 *  it is safe to call whether or not the window is mounted. */
function refresh_dev_chrome()
{
    document.querySelectorAll('.YDEV_CHIP[data-trace]').forEach(($b) => {
        let key = $b.getAttribute('data-trace');
        let label = $b.getAttribute('data-label') || '';
        let v = dev_num(key, 0);
        $b.textContent = (key === "trace_automata" && v > 0) ? (label + " " + v) : label;
        $b.classList.toggle('is-active', v > 0);
    });

    let view = dev_view();
    document.querySelectorAll('.YDEV_SEG_BTN[data-view]').forEach(($b) => {
        $b.classList.toggle('is-active', $b.getAttribute('data-view') === view);
    });

    /*  The Expand section toggles only apply to the Expanded view — show
     *  the group only there, and reflect each toggle's persisted state. */
    let $eg = document.getElementById('ydev-expand-grp');
    if($eg) {
        $eg.style.display = (view === 'full') ? '' : 'none';
    }
    document.querySelectorAll('.YDEV_CHIP[data-expand]').forEach(($b) => {
        $b.classList.toggle('is-active', full_show($b.getAttribute('data-expand')));
    });

    document.querySelectorAll('.YDEV_CHIP[data-dir]').forEach(($b) => {
        $b.classList.toggle('is-active', !!dev_num($b.getAttribute('data-dir'), 1));
    });

    document.querySelectorAll('.YDEV_CHIP[data-toggle="periodic"]').forEach(($b) => {
        $b.classList.toggle('is-active', dev_hide_periodic());
    });

    document.querySelectorAll('.YDEV_CHIP[data-toggle="automata-simple"]').forEach(($b) => {
        $b.classList.toggle('is-active', !!dev_num('dev_automata_simple', 0));
    });

    let $m = document.getElementById('ydev-muted');
    if($m) {
        $m.replaceChildren();
        let set = dev_muted();
        if(set.size) {
            let $lbl = document.createElement('span');
            $lbl.className = 'YDEV_LABEL';
            $lbl.textContent = 'Muted';
            $m.appendChild($lbl);
            set.forEach((sig) => {
                $m.appendChild(createElement2(
                    ['button', {class: 'YDEV_MUTED_CHIP', type: 'button', title: 'Unmute'},
                        '⊘ ' + sig + '  ✕', {
                        click: (ev) => {
                            ev.stopPropagation();
                            unmute_signature(sig);
                        }
                    }]
                ));
            });
        }
    }

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
        let head = `${e.ts} ${dir_arrow(e.dir)} ` +
            `${e.title ? "[" + e.title + "] " : ""}${e.event}` +
            `${e.command ? " " + e.command : ""}`;
        out.push(head);
        let payload = e.kw ? e.kw : e.jn;
        try {
            out.push(JSON.stringify(payload, null, 2));
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

/*  The control bar: trace toggles, view selector, direction /
 *  periodic filters, free-text search, copy, clear. Returns an element. */
function build_control_bar()
{
    let trace_chips = TRACE_DEFS.map(([key, label, fn]) => ['button', {
        class: 'YDEV_CHIP', 'data-trace': key, 'data-label': label, type: 'button',
    }, label, {
        click: (ev) => {
            ev.stopPropagation();
            fn();
        }
    }]);

    /*  Compact automata format (like the C kernel's trace_machine_format==1):
     *  one short line per transition, no return line. Applies to the FSM trace
     *  emitted while Automata is on. */
    let simple_mach = ['button', {
        class: 'YDEV_CHIP', 'data-toggle': 'automata-simple', type: 'button',
        title: 'Compact automata format (one line per transition, like C)',
    }, 'Simple mach', {
        click: (ev) => {
            ev.stopPropagation();
            let v = dev_num('dev_automata_simple', 0) ? 0 : 1;
            kw_set_local_storage_value('dev_automata_simple', v);
            gobj_set_trace_machine_format(v);
            refresh_dev_chrome();
        }
    }];

    let mk_view = (v, label) => ['button', {class: 'YDEV_SEG_BTN', 'data-view': v, type: 'button'}, label, {
        click: (ev) => {
            ev.stopPropagation();
            set_view(v);
        }
    }];

    let view_seg = ['div', {class: 'YDEV_SEG', id: 'ydev-seg'}, [
        mk_view('detailed', 'Detailed'),
        mk_view('full', 'Expanded'),
        mk_view('compact', 'Compact'),
        mk_view('name', 'Name only'),
    ]];

    /*  Expanded-view section toggles (only meaningful in the 'full' view;
     *  the group is shown/hidden by refresh_dev_chrome). */
    let mk_expand = (key, label) => ['button', {
        class: 'YDEV_CHIP', 'data-expand': key, type: 'button',
        title: 'Show ' + label + ' in the Expanded view',
    }, label, {
        click: (ev) => {
            ev.stopPropagation();
            toggle_pref(key, (key === 'dev_full_data') ? 1 : 0);
        }
    }];
    let expand_grp = ['div', {class: 'YDEV_GROUP', id: 'ydev-expand-grp'}, [
        ['span', {class: 'YDEV_LABEL'}, 'Expand'],
        mk_expand('dev_full_schema', 'Schema'),
        mk_expand('dev_full_data', 'Data'),
        mk_expand('dev_full_meta', 'Metadata'),
    ]];

    let mk_dir = (dir, glyph, key, title) => ['button', {
        class: 'YDEV_CHIP s-' + dir, 'data-dir': key, type: 'button', title: title,
    }, glyph, {
        click: (ev) => {
            ev.stopPropagation();
            toggle_pref(key, 1);
        }
    }];

    let dir_chips = [
        mk_dir('out', '⇢', 'dev_filter_out', 'Outgoing'),
        mk_dir('in', '⇠', 'dev_filter_in', 'Incoming'),
        mk_dir('err', '⚠', 'dev_filter_err', 'Errors'),
    ];

    let periodic_chip = ['button', {
        class: 'YDEV_CHIP', 'data-toggle': 'periodic', type: 'button',
        title: 'Hide recurring / periodic events (polls, heartbeats)',
    }, '⊘ Periodic', {
        click: (ev) => {
            ev.stopPropagation();
            toggle_pref('dev_hide_periodic', 0);
        }
    }];

    let search = ['input', {
        class: 'YDEV_SEARCH', type: 'search', placeholder: 'filter events / payload…', 'data-role': 'search',
    }, '', {
        input: (ev) => {
            SEARCH_TEXT = String(ev.target.value || '').toLowerCase().trim();
            rerender_all();
        }
    }];

    let copy = ['button', {class: 'YDEV_CHIP', type: 'button', title: 'Copy visible traffic to clipboard'}, 'Copy', {
        click: (ev) => {
            ev.stopPropagation();
            let btn = ev.currentTarget;
            dev_copy_text(traffic_to_text()).then(() => {
                let prev = btn.textContent;
                btn.textContent = 'Copied';
                setTimeout(() => { btn.textContent = prev; }, 1000);
            });
        }
    }];

    let clear = ['button', {class: 'YDEV_CHIP', type: 'button', title: 'Clear captured traffic'}, 'Clear', {
        click: (ev) => {
            ev.stopPropagation();
            clear_traffic();
        }
    }];

    let grp = (label, items) => ['div', {class: 'YDEV_GROUP'}, [['span', {class: 'YDEV_LABEL'}, label], ...items]];
    let sep = () => ['span', {class: 'YDEV_SEP'}, ''];

    return createElement2(['div', {class: 'YDEV_BAR'}, [
        grp('Traces', [...trace_chips, simple_mach]), sep(),
        grp('View', [view_seg]), expand_grp, sep(),
        grp('Show', [...dir_chips, periodic_chip]), sep(),
        grp('Find', [search]), sep(),
        grp('Log', [copy, clear]),
    ]]);
}

/*  The window title strip (draggable header of C_YUI_WINDOW). */
function build_title_header()
{
    return createElement2(['div', {class: 'YDEV_TITLE'}, [
        ['span', {class: 'YDEV_TITLE_MAIN'}, 'Developer'],
        ['span', {class: 'YDEV_TITLE_SUB'}, 'yuno monitor · traffic & traces'],
    ]]);
}

/*  The monitor body: control bar + muted row + log + stats strip. */
function build_dev_body()
{
    return createElement2(['div', {class: 'YDEV_BODY'}, [
        build_control_bar(),
        ['div', {class: 'YDEV_MUTED', id: 'ydev-muted'}, []],
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
 *  Apply ALL persisted developer-trace flags to the running
 *  yuno.  Independent of the dev window — call it once at app
 *  startup so a refresh keeps logging whatever was enabled.
 ************************************************************/
function apply_dev_traces()
{
    let traffic       = Number(kw_get_local_storage_value("trace_traffic", 0, false));
    let trace         = Number(kw_get_local_storage_value("trace_automata", 0, false));
    let creation      = Number(kw_get_local_storage_value("trace_creation", 0, false));
    let start_stop    = Number(kw_get_local_storage_value("trace_start_stop", 0, false));
    let subscriptions = Number(kw_get_local_storage_value("trace_subscriptions", 0, false));
    let i18n          = Number(kw_get_local_storage_value("trace_i18n", 0, false));
    let no_poll       = Number(kw_get_local_storage_value("no_poll", 0, false));

    if(traffic) {
        gobj_write_attr(gobj_yuno(), "trace_inter_event", true);
        gobj_write_attr(gobj_yuno(), "trace_ievent_callback", info_traffic);
    } else {
        gobj_write_attr(gobj_yuno(), "trace_inter_event", false);
    }
    gobj_write_attr(gobj_yuno(), "tracing", trace);
    gobj_write_attr(gobj_yuno(), "trace_creation", creation);
    gobj_write_attr(gobj_yuno(), "trace_start_stop", start_stop);
    gobj_write_attr(gobj_yuno(), "trace_subscriptions", subscriptions);
    gobj_write_attr(gobj_yuno(), "no_poll", no_poll);
    i18next.options.debug = i18n ? true : false;

    /*  Compact vs verbose automata trace format (persisted). */
    gobj_set_trace_machine_format(
        Number(kw_get_local_storage_value("dev_automata_simple", 0, false)) ? 1 : 0);

    /*  Mirror the browser console (log_error/warning/info/debug/msg — the
     *  automata FSM trace arrives as debug) into the monitor. info_log no-ops
     *  while the window is closed, so this is safe to leave armed. */
    set_log_callback(info_log);
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

        gobj_create_service(
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
                title: "Developer",
                icon: "yi-terminal",
                /*  Opt into the dock/taskbar if the app provides one. `|| null`
                 *  because gobj_find_service returns undefined when absent, and
                 *  an undefined attr value logs "attr undefined: manager" (apps
                 *  without a window manager, e.g. wattyzer). null = no dock. */
                manager: gobj_find_service("__window_manager__", false) || null,
                on_close: function() {
                    kw_set_local_storage_value("open_developer_window", 0);
                }
            },
            self
        );

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
 *    - dispose: stops the inter-event traffic trace; call it from
 *               the modal's on_close.
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

    let dispose = function() {
        gobj_write_attr(gobj_yuno(), "trace_inter_event", false);
    };

    return {$el: $el, dispose: dispose};
}

export {info_traffic, setup_dev, build_dev_panel, apply_dev_traces, dev_window_was_open};
