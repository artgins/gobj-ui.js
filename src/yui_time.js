/***********************************************************************
 *          yui_time.js
 *
 *      Time, without a DOM: epochs, and the algebra of PERIODS.
 *
 *      Two things live here, and they are the two halves of every date
 *      UI the projects keep rewriting:
 *
 *      1) EPOCH <-> the local wall clock. A timestamp travels in the
 *         producer's own unit — seconds, or milliseconds when a topic
 *         says so — and every conversion crosses that `ms` flag. Getting
 *         it wrong puts the same instant on two different clocks in one
 *         screen (it did: a picker asking "from 18:55" local returned
 *         rows a table labelled 16:55).
 *
 *      2) The PERIOD. A period is not an enum of five names: it is a
 *         BUCKET, and a bucket is `count` of a `unit`:
 *
 *              {id: "day",       unit: "day",    count: 1}
 *              {id: "week",      unit: "week",   count: 1}   ISO, Mon-first
 *              {id: "bimester",  unit: "month",  count: 2}
 *              {id: "quarter",   unit: "month",  count: 3}
 *              {id: "semester",  unit: "month",  count: 6}
 *              {id: "decade",    unit: "year",   count: 10}
 *              {id: "15min",     unit: "minute", count: 15}
 *
 *         Given that pair, ONE implementation answers every question a
 *         date navigator asks — where does the bucket holding this
 *         instant start and end, what is the previous/next one, what do
 *         I call it — so an app that wants quarters declares a quarter
 *         instead of asking for a new component.
 *
 *      Buckets are ALIGNED, never "count back from now": months align to
 *      the year (which is why 2, 3, 4, 6 and 12 fall on clean calendar
 *      boundaries), weeks to Monday, hours to local midnight. "Last 7
 *      days" is a different animal — a rolling window — and it is not a
 *      period: see `rolling_bounds()`.
 *
 *      Everything here is LOCAL time (the user reads a local clock) and
 *      DST-safe: it never adds 86400000 ms to cross a day, it builds the
 *      next date from calendar fields and lets the platform do it.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/

/***************************************************************
 *              Constants
 ***************************************************************/
const MS_DAY = 86400000;

/*  The bucket units, smallest first. A spec is one of these plus a
 *  `count`; nothing else is a period.  */
const PERIOD_UNITS = ["minute", "hour", "day", "week", "month", "year"];

/*  The catalog every app starts from. An app is free to declare its own
 *  — the algebra below knows nothing about these ids, only about
 *  (unit, count) — but these are the ones with a NAME, and a named
 *  bucket labels itself better than a range ("Q3 2026", not
 *  "jul – sep 2026").  */
const YUI_PERIODS = {
    minute:   {id: "minute",   unit: "minute", count: 1},
    "5min":   {id: "5min",     unit: "minute", count: 5},
    "15min":  {id: "15min",    unit: "minute", count: 15},
    hour:     {id: "hour",     unit: "hour",   count: 1},
    day:      {id: "day",      unit: "day",    count: 1},
    week:     {id: "week",     unit: "week",   count: 1},
    fortnight:{id: "fortnight",unit: "week",   count: 2},
    month:    {id: "month",    unit: "month",  count: 1},
    bimester: {id: "bimester", unit: "month",  count: 2},
    quarter:  {id: "quarter",  unit: "month",  count: 3},
    semester: {id: "semester", unit: "month",  count: 6},
    year:     {id: "year",     unit: "year",   count: 1},
    decade:   {id: "decade",   unit: "year",   count: 10}
};

/*  The default set of a navigator: the five of the phone apps everybody
 *  knows, plus the hour (a log is read by the hour far more often than
 *  by the year). The rest of the catalog is one config line away.  */
const YUI_PERIODS_DEFAULT = ["hour", "day", "week", "month", "year"];

/*  Rolling windows — NOT periods. They have no bucket and no previous:
 *  they end at `now` and reach back. They earn their place next to the
 *  periods because they are what a live log is actually read with.  */
const YUI_ROLLING = {
    "1h":  {id: "1h",  secs: 3600,               label: "last hour"},
    "6h":  {id: "6h",  secs: 6 * 3600,           label: "last 6h"},
    "24h": {id: "24h", secs: 24 * 3600,          label: "last 24h"},
    "7d":  {id: "7d",  secs: 7 * 24 * 3600,      label: "last 7 days"},
    "30d": {id: "30d", secs: 30 * 24 * 3600,     label: "last 30 days"}
};


                    /***************************
                     *      Locale / i18n
                     ***************************/


/***************************************************************
 *  The locale to format with.
 *
 *  NEVER at module top level, and never `navigator.language` raw:
 *  Firefox can report the literal STRING "undefined", and every Intl
 *  constructor throws RangeError on it — a module that built its
 *  formatter on import took the whole bundle down with it (that is why
 *  gui_agent refuses to import the gobj-ui barrel).
 ***************************************************************/
function safe_locale(locale)
{
    if(typeof locale === "string" && locale && locale !== "undefined") {
        return locale;
    }
    let nav = (typeof navigator !== "undefined") ? navigator.language : null;
    if(typeof nav === "string" && nav && nav !== "undefined") {
        return nav;
    }
    return "en";
}

/***************************************************************
 *  Translate through the APP's translator when it gave us one, and
 *  degrade to the key itself otherwise — interpolating `{{x}}` by hand,
 *  so a label never renders raw mustaches at a caller that has no i18n.
 ***************************************************************/
function tr(t, key, params)
{
    if(typeof t === "function") {
        return t(key, params);
    }
    let s = key;
    for(let k in (params || {})) {
        s = s.replaceAll(`{{${k}}}`, String(params[k]));
    }
    return s;
}

/***************************************************************
 *  Intl formatters, built PER CALL (see safe_locale). They are cheap
 *  next to a repaint, and caching them would need a locale-change hook
 *  the library has no business owning.
 ***************************************************************/
function fmt_intl(date, locale, opts)
{
    try {
        return new Intl.DateTimeFormat(safe_locale(locale), opts).format(date);
    } catch(e) {
        /*  A locale Intl refuses is not worth a broken screen.  */
        return date.toDateString();
    }
}


                    /***************************
                     *      Epoch <-> clock
                     ***************************/


/***************************************************************
 *  Epoch in the producer's unit -> milliseconds, and back.
 *  `ms` true means the value already IS milliseconds.
 ***************************************************************/
function epoch_to_ms(value, ms)
{
    if(!value) {
        return 0;
    }
    return ms ? value : value * 1000;
}

function ms_to_epoch(value_ms, ms)
{
    if(!value_ms) {
        return 0;
    }
    return ms ? value_ms : Math.floor(value_ms / 1000);
}

/***************************************************************
 *  The LOCAL wall-clock string an `<input type="datetime-local">` takes
 *  ("YYYY-MM-DDTHH:MM:SS", which needs step=1 to keep the seconds), and
 *  the parse back. Empty / unparseable -> 0, which is exactly how a
 *  match condition reads an absent bound.
 ***************************************************************/
function epoch_to_local_input(value, ms)
{
    if(!value) {
        return "";
    }
    let d = new Date(epoch_to_ms(value, ms));
    let pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
           `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function local_input_to_epoch(v, ms)
{
    if(!v) {
        return 0;
    }
    let parsed = Date.parse(v);
    if(Number.isNaN(parsed)) {
        return 0;
    }
    return ms_to_epoch(parsed, ms);
}

/***************************************************************
 *  A timestamp for a table cell: the local wall clock, space-separated,
 *  keeping the milliseconds when the producer bothered to send them (a
 *  topic that sets sf_t_ms usually appends several records inside the
 *  same second, and a column that hides that shows a column of ties).
 ***************************************************************/
function fmt_epoch(value, ms)
{
    if(!value) {
        return "";
    }
    try {
        let s = epoch_to_local_input(value, ms).replace("T", " ");
        if(ms) {
            s += `.${String(value % 1000).padStart(3, "0")}`;
        }
        return s;
    } catch(e) {
        return String(value);
    }
}


                    /***************************
                     *      Calendar atoms
                     ***************************/


/***************************************************************
 *  The day number of a date, counting local calendar days from
 *  1970-01-01. Built from the FIELDS (Date.UTC of y/m/d), never from
 *  the timestamp: a DST day is 23 or 25 hours long, so dividing a local
 *  epoch by 86400000 drifts a day twice a year.
 ***************************************************************/
function day_number(d)
{
    return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / MS_DAY);
}

function date_from_day_number(n)
{
    let d = new Date(n * MS_DAY);
    /*  Back to LOCAL midnight of that calendar day.  */
    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/***************************************************************
 *  The Monday of the week a date falls in (ISO: the week starts on
 *  Monday, and Sunday closes it).
 ***************************************************************/
function start_of_iso_week(d)
{
    let day = d.getDay();                   /*  0 = Sunday  */
    let back = (day === 0) ? 6 : (day - 1);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() - back);
}

/***************************************************************
 *  The ISO week a date belongs to: {week, year}. The YEAR is the ISO
 *  week-year, not the calendar year — 2026-12-31 lives in week 1 of
 *  2027, and a label that said "week 1 2026" would name a week six
 *  months away.
 ***************************************************************/
function iso_week(d)
{
    /*  The Thursday of this week decides the year (ISO-8601).  */
    let monday = start_of_iso_week(d);
    let thursday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 3);
    let jan1 = new Date(thursday.getFullYear(), 0, 1);
    let week = Math.floor((day_number(thursday) - day_number(jan1)) / 7) + 1;
    return {week: week, year: thursday.getFullYear()};
}

/***************************************************************
 *  The index of the ISO week a date falls in, counting weeks from the
 *  Monday of the epoch week. It is what aligns a MULTI-week bucket (a
 *  fortnight) to a Monday instead of to whatever day 1970-01-01 was.
 ***************************************************************/
function week_index(d)
{
    /*  1970-01-01 was a Thursday, so its Monday sits 3 days earlier.  */
    return Math.floor((day_number(start_of_iso_week(d)) + 3) / 7);
}


                    /***************************
                     *      Period algebra
                     ***************************/


/***************************************************************
 *  Normalize whatever a caller hands us into a spec: an id of the
 *  catalog, or a spec of its own. Returns null for anything that is not
 *  a bucket (a "span" / "custom" mode of a navigator has no algebra).
 ***************************************************************/
function period_spec(period)
{
    if(!period) {
        return null;
    }
    let spec = (typeof period === "string") ? YUI_PERIODS[period] : period;
    if(!spec || !spec.unit) {
        return null;
    }
    if(PERIOD_UNITS.indexOf(spec.unit) < 0) {
        return null;
    }
    let count = parseInt(spec.count, 10);
    if(!(count > 0)) {
        count = 1;
    }
    return {id: spec.id || spec.unit, unit: spec.unit, count: count};
}

/***************************************************************
 *  The START of the bucket that holds `anchor_ms`, as a local Date.
 *
 *  Alignment is what makes a bucket a bucket. Each unit floors against
 *  the natural origin of the unit above it, so the boundaries are the
 *  ones a human already has in their head:
 *
 *      minute  -> the hour        (a 15min bucket starts at :00/:15/:30/:45)
 *      hour    -> local midnight  (a 6h bucket starts at 00/06/12/18)
 *      day     -> 1970-01-01      (count=1 is the plain day; a 10-day
 *                                  bucket has no calendar origin to
 *                                  align to, so it aligns to the epoch)
 *      week    -> the epoch week, Monday-first (ISO)
 *      month   -> January         (which is why 2/3/4/6/12 give calendar
 *                                  bimesters, quarters and semesters)
 *      year    -> year 0          (a decade starts at 2020, not 2021)
 ***************************************************************/
function period_start(period, anchor_ms)
{
    let spec = period_spec(period);
    if(!spec) {
        return null;
    }
    let d = new Date(anchor_ms);
    let n = spec.count;

    switch(spec.unit) {
        case "minute": {
            let m = Math.floor(d.getMinutes() / n) * n;
            return new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), m);
        }
        case "hour": {
            let h = Math.floor(d.getHours() / n) * n;
            return new Date(d.getFullYear(), d.getMonth(), d.getDate(), h);
        }
        case "day": {
            let idx = Math.floor(day_number(d) / n) * n;
            return date_from_day_number(idx);
        }
        case "week": {
            let idx = Math.floor(week_index(d) / n) * n;
            /*  Week 0 is the epoch's Monday, 1969-12-29.  */
            return date_from_day_number(idx * 7 - 3);
        }
        case "month": {
            let mi = d.getFullYear() * 12 + d.getMonth();
            let s = Math.floor(mi / n) * n;
            return new Date(Math.floor(s / 12), s % 12, 1);
        }
        case "year": {
            let y = Math.floor(d.getFullYear() / n) * n;
            return new Date(y, 0, 1);
        }
        default:
            return null;
    }
}

/***************************************************************
 *  The start of the bucket `delta` buckets away (delta may be negative).
 *  Calendar arithmetic, never millisecond arithmetic: `new Date(y, m+3, 1)`
 *  overflows the year by itself, and stepping a day across a DST change
 *  keeps landing on midnight.
 ***************************************************************/
function period_shift(period, anchor_ms, delta)
{
    let spec = period_spec(period);
    if(!spec) {
        return anchor_ms;
    }
    let s = period_start(spec, anchor_ms);
    let step = spec.count * (delta || 0);

    switch(spec.unit) {
        case "minute":
            return new Date(s.getFullYear(), s.getMonth(), s.getDate(),
                            s.getHours(), s.getMinutes() + step).getTime();
        case "hour":
            return new Date(s.getFullYear(), s.getMonth(), s.getDate(),
                            s.getHours() + step).getTime();
        case "day":
            return new Date(s.getFullYear(), s.getMonth(), s.getDate() + step).getTime();
        case "week":
            return new Date(s.getFullYear(), s.getMonth(), s.getDate() + step * 7).getTime();
        case "month":
            return new Date(s.getFullYear(), s.getMonth() + step, 1).getTime();
        case "year":
            return new Date(s.getFullYear() + step, 0, 1).getTime();
        default:
            return anchor_ms;
    }
}

/***************************************************************
 *  The bucket holding `anchor_ms`, as {from, to} in MILLISECONDS.
 *
 *  `to` is INCLUSIVE — the last millisecond of the bucket, not the first
 *  of the next one. Both ends of a match condition are inclusive, and an
 *  exclusive end handed to one silently swallows the record that landed
 *  exactly on the boundary.
 ***************************************************************/
function period_bounds(period, anchor_ms)
{
    let spec = period_spec(period);
    if(!spec) {
        return {from: 0, to: 0};
    }
    let from = period_start(spec, anchor_ms).getTime();
    let next = period_shift(spec, anchor_ms, 1);
    return {from: from, to: next - 1};
}

/***************************************************************
 *  The same bucket, in the unit the CONSUMER speaks (a tranger topic
 *  keeps its timestamps in seconds, unless its system_flag says
 *  milliseconds). This is the function a query builder calls.
 ***************************************************************/
function period_bounds_epoch(period, anchor_ms, ms)
{
    let b = period_bounds(period, anchor_ms);
    if(!b.from) {
        return {from: 0, to: 0};
    }
    return {from: ms_to_epoch(b.from, ms), to: ms_to_epoch(b.to, ms)};
}

/***************************************************************
 *  A ROLLING window: `secs` back from now. Not a bucket — it has no
 *  previous and no next, it just ends at `now`.
 *
 *  The `to` end is left OPEN (0). An iterator with no upper bound keeps
 *  matching the records that land while the card is on screen; pinning
 *  it to "now" would freeze the window at the instant the user clicked.
 ***************************************************************/
function rolling_bounds(rolling, ms, now_ms)
{
    let r = (typeof rolling === "string") ? YUI_ROLLING[rolling] : rolling;
    if(!r || !r.secs) {
        return {from: 0, to: 0};
    }
    let now = (now_ms === undefined) ? Date.now() : now_ms;
    return {from: ms_to_epoch(now - r.secs * 1000, ms), to: 0};
}

/***************************************************************
 *  Is this the LAST bucket — the one `now` falls in? It is what greys
 *  out the "next" arrow, and what tells the navigator it is already home.
 ***************************************************************/
function is_current_period(period, anchor_ms, now_ms)
{
    let spec = period_spec(period);
    if(!spec) {
        return false;
    }
    let now = (now_ms === undefined) ? Date.now() : now_ms;
    let a = period_start(spec, anchor_ms);
    let b = period_start(spec, now);
    return !!a && !!b && a.getTime() === b.getTime();
}

/***************************************************************
 *  Recognize the bucket a {from, to} pair came from, so a range that
 *  travelled through a URL, a saved view or a backend answer comes back
 *  as the period the user picked instead of as a hand-typed range.
 *
 *  `from`/`to` are in the CONSUMER's unit (`ms`), and so is the
 *  comparison — that is the whole trap: a bucket ends on the last
 *  MILLISECOND (…23:59:59.999), and a consumer that keeps seconds stored
 *  it truncated (…23:59:59). Comparing in milliseconds, a week saved by a
 *  seconds-based topic came back as "no bucket at all", every time.
 *
 *  Only an EXACT match counts: both ends must land on the bucket's own
 *  boundaries, as that consumer would have written them. `candidates` are
 *  ids/specs, tried in order. Returns {period, anchor} (anchor in ms) or
 *  null.
 ***************************************************************/
function infer_period(from, to, candidates, ms)
{
    if(!from || !to || to <= from) {
        return null;
    }
    let from_ms = epoch_to_ms(from, ms);

    for(let candidate of (candidates || Object.keys(YUI_PERIODS))) {
        let spec = period_spec(candidate);
        if(!spec) {
            continue;
        }
        let b = period_bounds_epoch(spec, from_ms, ms);
        if(b.from === from && b.to === to) {
            return {period: spec, anchor: from_ms};
        }
    }
    return null;
}


                    /***************************
                     *      Period labels
                     ***************************/


/***************************************************************
 *  The name of a GRANULARITY (what the segmented control shows):
 *  the spec's own id as an i18n key, so an app that declares
 *  {id: "quarter"} gets "Trimestre" the moment it adds the key.
 ***************************************************************/
function period_name(period, t)
{
    let spec = period_spec(period);
    if(!spec) {
        return tr(t, String((period && period.id) || period || ""));
    }
    return tr(t, spec.id);
}

/***************************************************************
 *  The name of the bucket a navigator is PARKED on: what goes between
 *  the two arrows.
 *
 *      day        -> "Today" / "Yesterday" / "13 jul 2026"
 *      week       -> "Week 27"           (+ year when it is not this one)
 *      month      -> "July"              (+ year when it is not this one)
 *      quarter    -> "Q3 2026"           (unit month, count 3)
 *      semester   -> "H2 2026"           (unit month, count 6)
 *      year       -> "2026"
 *      decade     -> "2020 – 2029"
 *      any other  -> the bucket's own edges: "1 jul – 31 aug 2026"
 *
 *  The named ones are named because a range reads worse than a name;
 *  everything an app invents falls back to the range, which is always
 *  true and never wrong.
 ***************************************************************/
function period_label(period, anchor_ms, t, locale)
{
    let spec = period_spec(period);
    if(!spec) {
        return "";
    }
    let loc = safe_locale(locale);
    let start = period_start(spec, anchor_ms);
    let end = new Date(period_bounds(spec, anchor_ms).to);
    let now = new Date();
    let this_year = start.getFullYear() === now.getFullYear();

    if(spec.unit === "day" && spec.count === 1) {
        let diff = day_number(start) - day_number(now);
        if(diff === 0) {
            return tr(t, "today");
        }
        if(diff === -1) {
            return tr(t, "yesterday");
        }
        if(diff === 1) {
            return tr(t, "tomorrow");
        }
        return fmt_intl(start, loc, this_year
            ? {day: "numeric", month: "short"}
            : {day: "numeric", month: "short", year: "numeric"});
    }

    if(spec.unit === "hour" && spec.count === 1) {
        let hh = fmt_intl(start, loc, {hour: "2-digit", minute: "2-digit"});
        if(day_number(start) === day_number(now)) {
            return hh;
        }
        return `${hh} · ${fmt_intl(start, loc, {day: "numeric", month: "short"})}`;
    }

    if(spec.unit === "week" && spec.count === 1) {
        /*  The two weeks a human never calls by their number.  */
        let away = week_index(start) - week_index(now);
        if(away === 0) {
            return tr(t, "this week");
        }
        if(away === -1) {
            return tr(t, "last week");
        }
        let w = iso_week(start);
        return (w.year === now.getFullYear())
            ? tr(t, "week {{n}}", {n: w.week})
            : tr(t, "week {{n}} {{y}}", {n: w.week, y: w.year});
    }

    if(spec.unit === "month" && spec.count === 1) {
        return fmt_intl(start, loc, this_year
            ? {month: "long"}
            : {month: "long", year: "numeric"});
    }

    if(spec.unit === "month" && (spec.count === 3 || spec.count === 6)) {
        let n = Math.floor(start.getMonth() / spec.count) + 1;
        let key = (spec.count === 3) ? "quarter {{n}} {{y}}" : "semester {{n}} {{y}}";
        return tr(t, key, {n: n, y: start.getFullYear()});
    }

    if(spec.unit === "year") {
        if(spec.count === 1) {
            return String(start.getFullYear());
        }
        return `${start.getFullYear()} – ${end.getFullYear()}`;
    }

    /*  Anything else — a bimester, a fortnight, a 10-day bucket, whatever
     *  an app declares — says exactly what it spans.  */
    let opts = (spec.unit === "minute" || spec.unit === "hour")
        ? {day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"}
        : {day: "numeric", month: "short"};

    if(start.getFullYear() !== end.getFullYear()) {
        let y_opts = Object.assign({year: "numeric"}, opts);
        return `${fmt_intl(start, loc, y_opts)} – ${fmt_intl(end, loc, y_opts)}`;
    }
    let span = `${fmt_intl(start, loc, opts)} – ${fmt_intl(end, loc, opts)}`;
    return this_year ? span : `${span} ${start.getFullYear()}`;
}

export {
    MS_DAY,
    PERIOD_UNITS,
    YUI_PERIODS,
    YUI_PERIODS_DEFAULT,
    YUI_ROLLING,

    safe_locale,
    epoch_to_ms,
    ms_to_epoch,
    epoch_to_local_input,
    local_input_to_epoch,
    fmt_epoch,

    day_number,
    start_of_iso_week,
    iso_week,

    period_spec,
    period_start,
    period_shift,
    period_bounds,
    period_bounds_epoch,
    rolling_bounds,
    is_current_period,
    infer_period,
    period_name,
    period_label
};
