/***********************************************************************
 *          ui_dev.js
 *
 *          Development Tools
 *
 *          Copyright (c) 2024, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {
    gobj_yuno,
    log_error,
    is_string,
    createElement2,
    kw_get_local_storage_value,
    kw_set_local_storage_value,
    gobj_write_attr,
    gobj_create_service,
    trace_json,
} from "@yuneta/gobj-js";

import i18next from 'i18next';

/************************************************************
 *  Field names whose numeric value is a Unix timestamp
 *  (seconds since epoch) — annotate them with an ISO date.
 ************************************************************/
const TRAFFIC_TS_FIELDS = {
    "__t__": 1, "__tm__": 1, "tm": 1, "t": 1,
    "from_t": 1, "to_t": 1, "from_tm": 1, "to_tm": 1, "time": 1,
};

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
 *  Human byte size (B / KB / MB) for the entry header.
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
 *  Inject the traffic-log stylesheet once. Bullet log, not a
 *  JSON editor: theme-aware via <html data-theme>, coloured by
 *  direction (out / in / error) on a left accent bar.
 ************************************************************/
function ensure_traffic_style()
{
    if(document.getElementById('yui-dev-traffic-style')) {
        return;
    }
    let css = `
.TRAFFIC_ENTRY {
    margin: 6px 0;
    padding: 4px 8px;
    border-left: 3px solid #94a3b8;
    border-radius: 3px;
    font-family: "DejaVu Sans Mono", monospace, consolas, monaco;
    font-size: 13px;
    line-height: 1.55;
    background: rgba(0,0,0,0.02);
}
.TRAFFIC_ENTRY.dir-out { border-left-color: #2563eb; }
.TRAFFIC_ENTRY.dir-in  { border-left-color: #059669; }
.TRAFFIC_ENTRY.dir-err { border-left-color: #dc2626; }
.TRAFFIC_HEADER {
    display: flex;
    align-items: baseline;
    gap: 8px;
}
.TRAFFIC_ARROW { font-weight: 700; }
.TRAFFIC_EVENT { font-weight: 700; }
.dir-out .TRAFFIC_ARROW, .dir-out .TRAFFIC_EVENT { color: #2563eb; }
.dir-in  .TRAFFIC_ARROW, .dir-in  .TRAFFIC_EVENT { color: #059669; }
.dir-err .TRAFFIC_ARROW, .dir-err .TRAFFIC_EVENT { color: #dc2626; }
.TRAFFIC_META {
    margin-left: auto;
    opacity: 0.6;
    font-size: 11px;
    white-space: nowrap;
}
.TRAFFIC_KW { margin: 2px 0 0 16px; }
.TRAFFIC_ROW { display: flex; gap: 6px; align-items: baseline; }
.TRAFFIC_BULLET { opacity: 0.45; flex: 0 0 auto; }
.TRAFFIC_KEY { opacity: 0.85; flex: 0 0 auto; }
.TRAFFIC_VAL { word-break: break-word; }
.TRAFFIC_VAL.t-num  { color: #0891b2; }
.TRAFFIC_VAL.t-bool { color: #9333ea; }
.TRAFFIC_VAL.t-null { color: #9333ea; font-style: italic; }
.TRAFFIC_VAL.t-empty { opacity: 0.5; }
.TRAFFIC_TS { opacity: 0.6; margin-left: 8px; }
details.TRAFFIC_NEST > summary {
    cursor: pointer;
    list-style: none;
    display: flex;
    gap: 6px;
    align-items: baseline;
}
details.TRAFFIC_NEST > summary::-webkit-details-marker { display: none; }
.TRAFFIC_NEST_KEY { opacity: 0.85; }
.TRAFFIC_NEST_HINT { opacity: 0.5; margin-left: 4px; }
:root[data-theme="dark"] .TRAFFIC_ENTRY { background: rgba(255,255,255,0.03); }
:root[data-theme="dark"] .TRAFFIC_ENTRY.dir-out { border-left-color: #60a5fa; }
:root[data-theme="dark"] .TRAFFIC_ENTRY.dir-in  { border-left-color: #34d399; }
:root[data-theme="dark"] .TRAFFIC_ENTRY.dir-err { border-left-color: #f87171; }
:root[data-theme="dark"] .dir-out .TRAFFIC_ARROW,
:root[data-theme="dark"] .dir-out .TRAFFIC_EVENT { color: #60a5fa; }
:root[data-theme="dark"] .dir-in .TRAFFIC_ARROW,
:root[data-theme="dark"] .dir-in .TRAFFIC_EVENT { color: #34d399; }
:root[data-theme="dark"] .dir-err .TRAFFIC_ARROW,
:root[data-theme="dark"] .dir-err .TRAFFIC_EVENT { color: #f87171; }
:root[data-theme="dark"] .TRAFFIC_VAL.t-num  { color: #22d3ee; }
:root[data-theme="dark"] .TRAFFIC_VAL.t-bool,
:root[data-theme="dark"] .TRAFFIC_VAL.t-null { color: #c084fc; }
`;
    let $style = document.createElement('style');
    $style.id = 'yui-dev-traffic-style';
    $style.textContent = css;
    document.head.appendChild($style);
}

/************************************************************
 *  One scalar field as a bullet row: `• key: value`.
 *  Value is type-coloured; long strings are clipped (full text
 *  on hover); timestamp fields get an ISO annotation.
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
 *  arrays → a collapsed <details> (metadata / nested payloads
 *  stay folded so the log reads at a glance). Empty containers
 *  render inline instead of an empty collapsible.
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
 *  A whole object/array → an array of bullet nodes (one per
 *  field, array index as the key). Recurses via traffic_value_node.
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

/************************************************************
 *  Append one inter-event message to the traffic logger as a
 *  bullet entry (event headline + kw as a folding bullet list),
 *  replacing the per-message vanilla-jsoneditor. Shared by the
 *  legacy C_YUI_WINDOW (setup_dev) and the modal (build_dev_panel).
 *
 *  direction: 1 outgoing (⇢), 2 incoming (⇠), 3 error (⚠).
 *  When no logger is mounted, fall back to a console dump.
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

    let jn_msg;
    try {
        if(is_string(msg)) {
            jn_msg = JSON.parse(msg);
        } else {
            jn_msg = JSON.parse(JSON.stringify(msg));
        }
    } catch(e) {
        return;
    }

    ensure_traffic_style();

    let dir_cls = (direction === 2) ? "dir-in" : (direction === 3) ? "dir-err" : "dir-out";
    let arrow = (direction === 2) ? "⇠" : (direction === 3) ? "⚠" : "⇢";
    let event_name = (jn_msg && jn_msg.event) ? String(jn_msg.event) : "(no event)";
    let kw = (jn_msg && jn_msg.kw && typeof jn_msg.kw === "object") ? jn_msg.kw : null;

    let children = [
        ['div', {class: 'TRAFFIC_HEADER'}, [
            ['span', {class: 'TRAFFIC_ARROW'}, arrow],
            ['span', {class: 'TRAFFIC_EVENT'}, event_name],
            ['span', {class: 'TRAFFIC_META'}, `${traffic_size(size)} · ${traffic_now()}`],
        ]],
    ];

    if(kw && Object.keys(kw).length > 0) {
        children.push(['div', {class: 'TRAFFIC_KW'}, traffic_bullets(kw)]);
    } else if(!kw) {
        // No kw envelope: fold the whole raw message so nothing is lost.
        children.push(['div', {class: 'TRAFFIC_KW'}, traffic_bullets(jn_msg)]);
    }

    let $item = createElement2(
        ['div', {class: 'TRAFFIC_ENTRY ' + dir_cls, title: title || ''}, children]
    );
    logger.appendChild($item);
    $item.scrollIntoView({block: "end"});
}

/************************************************************
 *
 ************************************************************/
function trace_traffic()
{
    let v = kw_get_local_storage_value("trace_traffic");
    v = Number(v);
    if(v) {
        gobj_write_attr(gobj_yuno(), "trace_inter_event", false);
        v = 0;
    } else {
        gobj_write_attr(gobj_yuno(), "trace_inter_event", true);
        gobj_write_attr(gobj_yuno(), "trace_ievent_callback", info_traffic);
        v = 1;
    }
    kw_set_local_storage_value("trace_traffic", v);
    info_user();
}

/************************************************************
 *
 ************************************************************/
function trace_automata()
{
    let v = kw_get_local_storage_value("trace_automata");
    v = Number(v);
    if(v===0) {
        v = 1;
    } else if(v===1) {
        v = 2;
    } else {
        v = 0;
    }
    gobj_write_attr(gobj_yuno(), "tracing", v);
    kw_set_local_storage_value("trace_automata", v);
    info_user();
}

/************************************************************
 *
 ************************************************************/
function trace_creation()
{
    let v = kw_get_local_storage_value("trace_creation");
    v = Number(v);
    if(v===0) {
        v = 1;
    } else {
        v = 0;
    }
    gobj_write_attr(gobj_yuno(), "trace_creation", v);
    kw_set_local_storage_value("trace_creation", v);
    info_user();
}

/************************************************************
 *
 ************************************************************/
function trace_start_stop()
{
    let v = kw_get_local_storage_value("trace_start_stop");
    v = Number(v);
    if(v===0) {
        v = 1;
    } else {
        v = 0;
    }
    gobj_write_attr(gobj_yuno(), "trace_start_stop", v);
    kw_set_local_storage_value("trace_start_stop", v);
    info_user();
}

/************************************************************
 *
 ************************************************************/
function trace_subscriptions()
{
    let v = kw_get_local_storage_value("trace_subscriptions");
    v = Number(v);
    if(v===0) {
        v = 1;
    } else {
        v = 0;
    }
    gobj_write_attr(gobj_yuno(), "trace_subscriptions", v);
    kw_set_local_storage_value("trace_subscriptions", v);
    info_user();
}

/************************************************************
 *
 ************************************************************/
function trace_i18n()
{
    let v = kw_get_local_storage_value("trace_i18n");
    v = Number(v);
    if(v===0) {
        v = 1;
    } else {
        v = 0;
    }
    i18next.options.debug = v?true:false;
    kw_set_local_storage_value("trace_i18n", v);
    info_user();
}

/************************************************************
 *
 ************************************************************/
function set_no_poll()
{
    let v = kw_get_local_storage_value("no_poll");
    v = Number(v);
    if(v) {
        v = 0;
    } else {
        v = 1;
    }
    gobj_write_attr(gobj_yuno(), "no_poll", v);
    kw_set_local_storage_value("no_poll", v);
    info_user();
}

/************************************************************
 *
 ************************************************************/
function info_user()
{
    let $info = document.getElementById("developer-window-info");

    let traffic = Number(kw_get_local_storage_value("trace_traffic", 0, false));
    let trace = Number(kw_get_local_storage_value("trace_automata", 0, false));
    let creation = Number(kw_get_local_storage_value("trace_creation", 0, false));
    let start_stop = Number(kw_get_local_storage_value("trace_start_stop", 0, false));
    let subscriptions = Number(kw_get_local_storage_value("trace_subscriptions", 0, false));

    let i18n = Number(kw_get_local_storage_value("trace_i18n", 0, false));
    let no_poll = Number(kw_get_local_storage_value("no_poll", 0, false));

    // Code repeated
    // Build with DOM instead of innerHTML to prevent any XSS via localStorage values
    $info.replaceChildren();
    [
        `Automata: ${trace}`,
        `Creation: ${creation}`,
        `Start/Stop: ${start_stop}`,
        `Subscriptions: ${subscriptions}`,
        `I18n: ${i18n}`,
        `Traffic: ${traffic}`,
        `No poll: ${no_poll}`,
    ].forEach(text => {
        const div = document.createElement('div');
        div.textContent = text;
        $info.appendChild(div);
    });
}

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
 *  Single source of truth for "localStorage flag → effect";
 *  setup_dev() and build_dev_panel() reuse it instead of each
 *  re-applying a partial subset.
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
}

/************************************************************
 *  Open the developer panel inside a non-modal C_YUI_WINDOW
 *  (title bar + maximize + close + resize).
 *
 *  Shell-agnostic: the legacy C_YUI_MAIN shell has a
 *  '#top-layer' stacking element; the new C_YUI_SHELL does not.
 *  We pass that element when present, otherwise null — and
 *  C_YUI_WINDOW falls back to document.body by contract.  So the
 *  new shell gets the same windowed dev panel instead of the
 *  floating build_dev_panel() box.  Legacy behaviour is
 *  unchanged (when '#top-layer' exists it is still used).
 ************************************************************/
function setup_dev(self, show)
{
    let traffic = Number(kw_get_local_storage_value("trace_traffic", 0, false));
    let trace = Number(kw_get_local_storage_value("trace_automata", 0, false));
    let creation = Number(kw_get_local_storage_value("trace_creation", 0, false));
    let start_stop = Number(kw_get_local_storage_value("trace_start_stop", 0, false));
    let subscriptions = Number(kw_get_local_storage_value("trace_subscriptions", 0, false));
    let i18n = Number(kw_get_local_storage_value("trace_i18n", 0, false));
    let no_poll = Number(kw_get_local_storage_value("no_poll", 0, false));

    if(show) {
        const $dev_toolbar = createElement2(
            ['div', {class: 'buttons'}, [
                ['button', {
                    class: 'button',
                }, 'Automata', {
                    click: (evt) => {
                        evt.stopPropagation();
                        trace_automata();
                    }
                }],
                ['button', {
                    class: 'button',
                }, 'Creation', {
                    click: (evt) => {
                        evt.stopPropagation();
                        trace_creation();
                    }
                }],
                ['button', {
                    class: 'button',
                }, 'Star/Stop', {
                    click: (evt) => {
                        evt.stopPropagation();
                        trace_start_stop();
                    }
                }],
                ['button', {
                    class: 'button',
                }, 'Subscriptions', {
                    click: (evt) => {
                        evt.stopPropagation();
                        trace_subscriptions();
                    }
                }],
                ['button', {
                    class: 'button',
                }, 'I18n', {
                    click: (evt) => {
                        evt.stopPropagation();
                        trace_i18n();
                    }
                }],
                ['button', {
                    class: 'button',
                }, 'Traffic', {
                    click: (evt) => {
                        evt.stopPropagation();
                        trace_traffic();
                    }
                }],
                ['button', {
                    class: 'button',
                }, 'No Poll', {
                    click: (evt) => {
                        evt.stopPropagation();
                        set_no_poll();
                    }
                }],
                ['button', {
                    class: 'button',
                }, 'Clear Traffic', {
                    click: (evt) => {
                        evt.stopPropagation();
                        document.getElementById("developer-traffic-logger").innerHTML = "";
                    }
                }],
            ]]
        );

        // TODO repon la position
        // onViewResize: function() {
        //     var record = filter_dict(this.config, self.config.traffic_window_position);
        //     gobj_update_writable_attrs({traffic_window_position: record});
        //     gobj_save_persistent_attrs();
        // },
        // onViewMoveEnd: function() {
        //     var record = filter_dict(this.config, self.config.traffic_window_position);
        //     gobj_update_writable_attrs({traffic_window_position: record});
        //     gobj_save_persistent_attrs();
        // }

        // Code repeated
        let estados = `
        <div>Automata: ${trace}</div>
        <div>Creation: ${creation}</div>
        <div>Start/Stop: ${start_stop}</div>
        <div>Subscriptions: ${subscriptions}</div>
        <div>I18n: ${i18n}</div>
        <div>Traffic: ${traffic}</div>
        <div>No poll: ${no_poll}</div>`;

        gobj_create_service(
            "Developer-Window",
            "C_YUI_WINDOW",
            {
                $parent: document.getElementById('top-layer') || null,
                subscriber: null,
                showMax: true,
                modal: false,
                header: $dev_toolbar,
                auto_save_size_and_position: true,
                center: false,
                // resizable: false,
                body: '<div style="overflow:scroll;height:100%;"><div id="developer-traffic-logger" style="margin-left:10px;margin-right:10px;"/></div>',
                footer: `<div id="developer-window-info" class="is-flex is-justify-content-space-between" style="gap:1.25rem;white-space:nowrap;">${estados}</div>`,
                on_close: function() {
                    kw_set_local_storage_value("open_developer_window", 0);
                }
            },
            self
        );

        kw_set_local_storage_value("open_developer_window", 1);

    }

    apply_dev_traces();
}

/************************************************************
 *  Build the developer panel as a self-contained DOM subtree,
 *  to be mounted by the new declarative shell via
 *  yui_shell_show_modal (no C_YUI_WINDOW, no 'top-layer').
 *
 *  Returns { $el, dispose }:
 *    - $el:     the panel element (header tabs + traffic logger
 *               body + footer counters).
 *    - dispose: stops the inter-event traffic trace; call it from
 *               the modal's on_close.
 *
 *  Backwards compatible: setup_dev() (old shell, C_YUI_WINDOW) is
 *  untouched; the trace_* helpers and info_traffic are shared.
 ************************************************************/
function build_dev_panel()
{
    let traffic = Number(kw_get_local_storage_value("trace_traffic", 0, false));
    let trace = Number(kw_get_local_storage_value("trace_automata", 0, false));
    let creation = Number(kw_get_local_storage_value("trace_creation", 0, false));
    let start_stop = Number(kw_get_local_storage_value("trace_start_stop", 0, false));
    let subscriptions = Number(kw_get_local_storage_value("trace_subscriptions", 0, false));
    let i18n = Number(kw_get_local_storage_value("trace_i18n", 0, false));
    let no_poll = Number(kw_get_local_storage_value("no_poll", 0, false));

    let mk_btn = (label, fn) => ['button', {
        class: 'button is-small',
    }, label, {
        click: (evt) => {
            evt.stopPropagation();
            fn();
        }
    }];

    let counters = [
        `Automata: ${trace}`, `Creation: ${creation}`,
        `Start/Stop: ${start_stop}`, `Subscriptions: ${subscriptions}`,
        `I18n: ${i18n}`, `Traffic: ${traffic}`, `No poll: ${no_poll}`,
    ].map(txt => ['div', {style: 'padding:0 8px;'}, txt]);

    // The shell modal drops content into a transparent, unsized
    // Bulma .modal-content; the panel must be its own opaque,
    // sized window box. Theme-aware (read <html data-theme>).
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
                'box-shadow:0 10px 30px rgba(0,0,0,0.35);' +
                'padding:14px;overflow:hidden;' +
                'font-family:-apple-system,BlinkMacSystemFont,' +
                "'Segoe UI',Roboto,Helvetica,Arial,sans-serif;",
        }, [
            ['div', {
                class: 'buttons',
                style: 'flex:0 0 auto;display:flex;flex-wrap:wrap;' +
                    'gap:6px;margin:0 0 8px 0;',
            }, [
                mk_btn('Automata', trace_automata),
                mk_btn('Creation', trace_creation),
                mk_btn('Star/Stop', trace_start_stop),
                mk_btn('Subscriptions', trace_subscriptions),
                mk_btn('I18n', trace_i18n),
                mk_btn('Traffic', trace_traffic),
                mk_btn('No Poll', set_no_poll),
                mk_btn('Clear Traffic', () => {
                    let l = document.getElementById("developer-traffic-logger");
                    if(l) {
                        l.innerHTML = "";
                    }
                }),
            ]],
            ['div', {
                style: 'flex:1 1 auto;min-height:0;overflow:auto;',
            }, [
                ['div', {id: 'developer-traffic-logger',
                    style: 'margin:0 4px;'}, []],
            ]],
            ['div', {
                id: 'developer-window-info',
                class: 'is-flex is-justify-content-space-between',
                style: 'flex:0 0 auto;border-top:1px solid ' + bd +
                    ';padding-top:6px;margin-top:6px;font-size:12px;' +
                    'opacity:0.85;flex-wrap:nowrap;gap:1.25rem;white-space:nowrap;',
            }, counters],
        ]]
    );

    apply_dev_traces();

    let dispose = function() {
        // Stop feeding traffic into a detached DOM.
        gobj_write_attr(gobj_yuno(), "trace_inter_event", false);
    };

    return {$el: $el, dispose: dispose};
}

export {info_traffic, setup_dev, build_dev_panel, apply_dev_traces, dev_window_was_open};
