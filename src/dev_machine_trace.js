/***********************************************************************
 *          dev_machine_trace.js
 *
 *          Reading a MACHINE trace line back.
 *
 *          The developer window mirrors the runtime's log, and the
 *          `machine` trace is most of what lands there once it is on.
 *          Those lines arrive as text, so to the window they were just
 *          "a debug log" -- which is why its `Periodic` filter could
 *          not touch them: the filter works on a signature, and every
 *          mirrored log carried the same one (`log:debug`).
 *
 *          This gives a machine line back its EVENT, which is the only
 *          thing that says whether it is noise. Both formats gobj-js
 *          emits (`gobj_set_trace_machine_format`):
 *
 *            0  verbose  "🔄 mach(C_TIMER^t), st: ST_IDLE, ev: EV_TIMEOUT, ac: …"
 *                        "<- mach(C_TIMER^t), st: ST_IDLE, ev: EV_TIMEOUT, ret: 0"
 *            1  compact  "🔄 EV_TIMEOUT C_TIMER^t ST_IDLE from C_TIMER^t"
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/


/*  The verbose format names itself; the compact one does not.  */
const MACHINE_MARK_RE = /\bmach\(/;

/*  Verbose: the event is the `ev:` field.  */
const EVENT_FIELD_RE = /\bev:\s*([A-Za-z0-9_]+)/;

/*  Compact: the event is the first token, behind the emoji. Anchored,
 *  so a line that merely MENTIONS an event ("subscribed to EV_X") is
 *  not mistaken for a transition.  */
const EVENT_HEAD_RE = /^\s*\S{0,4}\s*(EV_[A-Za-z0-9_]+)(?=\s|$)/;

/*  What "recurring" means by name. The count-based half of the filter
 *  lives in the window, which is the only thing that can count.  */
const PERIODIC_EVENT_RE = /PERIODIC|TIMEOUT|HEARTBEAT|PING|POLL/i;


/************************************************************
 *  The event of a machine trace line, or "" when the line is
 *  not one.
 *
 *  "" is also the answer for a machine line that carries no
 *  event -- a state change ("new st(…), prev st(…)") -- and
 *  that is right: what it reports is not repetitive.
 ************************************************************/
function machine_event_of(text)
{
    if(typeof text !== "string" || text.length === 0) {
        return "";
    }

    if(MACHINE_MARK_RE.test(text)) {
        let m = EVENT_FIELD_RE.exec(text);
        return m? m[1]: "";
    }

    let m = EVENT_HEAD_RE.exec(text);
    return m? m[1]: "";
}

/************************************************************
 *  Is this event one of the ones that arrive by themselves,
 *  for ever, and say nothing about what the app is doing?
 ************************************************************/
function is_periodic_event(event_name)
{
    if(!event_name) {
        return false;
    }
    return PERIODIC_EVENT_RE.test(event_name);
}

/************************************************************
 *  The signature of a mirrored log line: what the window
 *  counts it under and what its filters match on.
 *
 *  A machine line is signed by its EVENT, so a hundred
 *  EV_TIMEOUTs are one recurring thing rather than a hundred
 *  anonymous debug lines. Everything else is signed by its
 *  level, as before.
 ************************************************************/
function log_signature(level, text)
{
    let event = machine_event_of(text);
    if(event) {
        return "mach:" + event;
    }
    return "log:" + (level || "debug");
}

/************************************************************
 *  May the periodic filter hide this log line?
 *
 *  Only a machine transition, and only below warning level.
 *  An ERROR that names EV_TIMEOUT -- "Event NOT DEFINED in
 *  state", which is exactly the loud one the framework wants
 *  seen -- must never disappear because of the word in it.
 ************************************************************/
function log_is_periodic(level, text)
{
    if(level === "error" || level === "warning") {
        return false;
    }
    return is_periodic_event(machine_event_of(text));
}

export {
    machine_event_of,
    is_periodic_event,
    log_signature,
    log_is_periodic,
};
