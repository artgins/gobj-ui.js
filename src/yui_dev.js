/***********************************************************************
 *          ui_dev.js
 *
 *          Development Tools
 *
 *          Copyright (c) 2024-2026, ArtGins.
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
    gobj_command,
    gobj_global_trace_level,
    gobj_get_gclass_trace_level2,
    trace_level_t,
} from "@yuneta/gobj-js";

import i18next from 'i18next';

import { JSONEditor } from 'vanilla-jsoneditor';
import "vanilla-jsoneditor/themes/jse-theme-dark.css";

/************************************************************
 *
 ************************************************************/
function info_traffic(title, msg, direction, size)
{
    // Render into the traffic logger if it is present (old shell:
    // inside C_YUI_WINDOW; new shell: inside the build_dev_panel()
    // modal). Otherwise just dump to the console.
    if(!document.getElementById('developer-traffic-logger')) {
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
    } catch (e) {
        return;
    }

    let content = {
        text: undefined,
        json: jn_msg
    };

    function formatCurrentTime() {
        let now = new Date();

        // Pad single digit numbers with a leading zero
        let pad = (num, size) => ('000' + num).slice(size * -1);

        let hours = pad(now.getHours(), 2);
        let minutes = pad(now.getMinutes(), 2);
        let seconds = pad(now.getSeconds(), 2);
        let milliseconds = pad(now.getMilliseconds(), 4);

        // Format to hh:mm:ss .SSSS
        return `${hours}:${minutes}:${seconds} .${milliseconds}`;
    }

    let element = document.getElementById('developer-traffic-logger');
    if(element) {
        let style = "background-color:#3883FA;";
        if(direction === 2) {
            style += "color:yellow;";
        } else if(direction === 3) {
            style += "color:red;";
        } else {
            style += "color:white;";
        }

        let $item = createElement2(
            ['div', {class: 'mt-4'}, [
                ['div', {class: 'is-flex with-border is-justify-content-space-between', style: style}, [
                    ['div', {class: 'p-1'}, title],
                    ['div', {class: 'p-1'}, `(${size} bytes)`],
                    ['div', {class: 'p-1'}, formatCurrentTime()]
                ]],
                ['div', {class: 'x-jsoneditor jse-theme-dark'}, []],
            ]]
        );
        let $target = $item.querySelector('.x-jsoneditor');
        let font_family = "DejaVu Sans Mono, monospace, consolas, monaco";
        let sz = 15;
        $target.style.setProperty('--jse-font-size-mono', sz + 'px');
        $target.style.setProperty('--jse-font-family-mono', font_family);

        document.getElementById("developer-traffic-logger").appendChild($item);

        let editor = new JSONEditor({
            target: $target,
            props: {
                content: content,
                readOnly: true,
                timestampTag: function ({field, value, path}) {
                    if (field === '__t__' || field === '__tm__' || field === 'tm' ||
                        field === 'from_t' || field === 'to_t' || field === 't' ||
                        field === 'from_tm' || field === 'to_tm' || field === 'time'
                    ) {
                        return true;
                    }
                    return false;
                },
                timestampFormat: function ({field, value, path}) {
                    if (field === '__t__' || field === '__tm__' || field === 'tm' ||
                        field === 'from_t' || field === 'to_t' || field === 't' ||
                        field === 'from_tm' || field === 'to_tm' || field === 'time'
                    ) {
                        return new Date(value * 1000).toISOString();
                    }
                    return null;
                },
            }
        });
        editor.expand(path => path.length < 2);

        element.scrollIntoView({block: "end"});
    }
}

/************************************************************
 *  A button turns trace bits of the runtime on or off through the
 *  yuno's trace commands (the C kernel's, same names), and the yuno
 *  persists them (`trace_levels`). What is on is READ from the runtime.
 ************************************************************/
function yuno_trace_command(command, kw)
{
    let r = gobj_command(gobj_yuno(), command, kw, gobj_yuno());
    if(!r || r.result < 0) {
        log_error(`yui_dev: ${command} ${JSON.stringify(kw)}: ${r ? r.comment : "no answer"}`);
    }
    info_user();
}

function global_bit(bit)
{
    return (gobj_global_trace_level() & bit) ? 1 : 0;
}

function trace_states()
{
    let automata = 0;
    if(global_bit(trace_level_t.TRACE_MACHINE)) {
        automata = global_bit(trace_level_t.TRACE_EV_KW) ? 2 : 1;
    }
    return {
        automata: automata,
        creation: global_bit(trace_level_t.TRACE_CREATE_DELETE),
        start_stop: global_bit(trace_level_t.TRACE_START_STOP),
        subscriptions: global_bit(trace_level_t.TRACE_SUBSCRIPTIONS),
        i18n: Number(kw_get_local_storage_value("trace_i18n", 0, false)) ? 1 : 0,
        traffic: gobj_get_gclass_trace_level2("C_IEVENT_CLI").includes("ievents") ? 1 : 0,
    };
}

function trace_counters()
{
    let st = trace_states();
    return [
        `Automata: ${st.automata}`,
        `Creation: ${st.creation}`,
        `Start/Stop: ${st.start_stop}`,
        `Subscriptions: ${st.subscriptions}`,
        `I18n: ${st.i18n}`,
        `Traffic: ${st.traffic}`,
    ];
}

/************************************************************
 *  Traffic is C_IEVENT_CLI's own level `ievents`.
 ************************************************************/
function trace_traffic()
{
    yuno_trace_command("set-gclass-trace",
        {gclass_name: "C_IEVENT_CLI", level: "ievents", set: trace_states().traffic ? 0 : 1});
}

/************************************************************
 *  0 → 1 (machine) → 2 (machine + kw of each event) → 0
 ************************************************************/
function trace_automata()
{
    let v = trace_states().automata;
    if(v === 0) {
        yuno_trace_command("set-global-trace", {level: "machine", set: 1});
    } else if(v === 1) {
        yuno_trace_command("set-global-trace", {level: "ev_kw", set: 1});
    } else {
        yuno_trace_command("set-global-trace", {level: "ev_kw", set: 0});
        yuno_trace_command("set-global-trace", {level: "machine", set: 0});
    }
}

/************************************************************
 *
 ************************************************************/
function trace_creation()
{
    yuno_trace_command("set-global-trace",
        {level: "create_delete", set: trace_states().creation ? 0 : 1});
}

/************************************************************
 *
 ************************************************************/
function trace_start_stop()
{
    yuno_trace_command("set-global-trace",
        {level: "start_stop", set: trace_states().start_stop ? 0 : 1});
}

/************************************************************
 *
 ************************************************************/
function trace_subscriptions()
{
    yuno_trace_command("set-global-trace",
        {level: "subscriptions", set: trace_states().subscriptions ? 0 : 1});
}

/************************************************************
 *  No trace of the runtime: i18next's own debug switch.
 ************************************************************/
function trace_i18n()
{
    let v = trace_states().i18n ? 0 : 1;
    i18next.options.debug = v?true:false;
    kw_set_local_storage_value("trace_i18n", v);
    info_user();
}

/************************************************************
 *
 ************************************************************/
function info_user()
{
    let $info = document.getElementById("developer-window-info");
    if(!$info) {
        return;
    }

    // Build with DOM instead of innerHTML
    $info.replaceChildren();
    trace_counters().forEach(text => {
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
 *  Wire the traffic sink and i18n debug.  Call it once at app
 *  startup.  The trace levels themselves are persisted and
 *  restored by the yuno (see gobj-js C_YUNO).
 ************************************************************/
function apply_dev_traces()
{
    /*  The trace LEVELS are the yuno's, restored by its mt_create from
     *  what the user persisted. Here only where the traffic goes.  */
    gobj_write_attr(gobj_yuno(), "trace_ievent_callback", info_traffic);
    i18next.options.debug = trace_states().i18n ? true : false;
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

        let estados = trace_counters().map(txt => `<div>${txt}</div>`).join("");

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
 *    - dispose: call it from the modal's on_close (kept for the
 *               contract; the traces outlive the panel).
 *
 *  Backwards compatible: setup_dev() (old shell, C_YUI_WINDOW) is
 *  untouched; the trace_* helpers and info_traffic are shared.
 ************************************************************/
function build_dev_panel()
{
    let mk_btn = (label, fn) => ['button', {
        class: 'button is-small',
    }, label, {
        click: (evt) => {
            evt.stopPropagation();
            fn();
        }
    }];

    let counters = trace_counters().map(txt => ['div', {style: 'padding:0 8px;'}, txt]);

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

    /*  Nothing to undo: the trace levels are the yuno's, persisted.  */
    let dispose = function() {
    };

    return {$el: $el, dispose: dispose};
}

export {info_traffic, setup_dev, build_dev_panel, apply_dev_traces, dev_window_was_open};
