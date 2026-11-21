/***********************************************************************
 *          yui_date_text.js
 *
 *      A moment as a VIEW shows it as text, and the locale to show it
 *      in. A module of its own, with no i18n key, on purpose: the views
 *      that show a time (C_YUI_FORM, C_YUI_TREEDB_TOPIC_WITH_FORM,
 *      C_YUI_JSON, C_YUI_UPLOT) import it, and validate-locales follows
 *      the modules an app mounts -- importing yui_time.js for this made
 *      every app that shows a time owe the keys of the period picker
 *      (gobj-ui 7.26.52). yui_time.js re-exports both.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {log_warning} from "@yuneta/gobj-js";

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

/*  The locales Intl refused, said once each.  */
const __refused_locales__ = new Set();

/***************************************************************
 *  An Intl.DateTimeFormat of `locale` with `options`. A locale
 *  Intl refuses (a malformed tag: "en_US") falls back to the
 *  environment's -- what Intl itself gives for a well-formed
 *  one it does not know ("xx") -- and is said in a WARNING, once
 *  per locale. fmt_date_time() and the ticks of a uPlot time axis
 *  (yui_uplot_time.js) both go through it, so they fall back the
 *  same way.
 ***************************************************************/
function date_time_format(locale, options)
{
    let loc = safe_locale(locale);
    try {
        return new Intl.DateTimeFormat(loc, options);
    } catch(e) {
        if(!__refused_locales__.has(loc)) {
            __refused_locales__.add(loc);
            log_warning(`date_time_format: locale '${loc}' refused by Intl (${e}), using the environment's`);
        }
        return new Intl.DateTimeFormat(undefined, options);
    }
}

/*  The clock is always 24 hours: `hourCycle`, never `hour12: false`,
 *  which some engines read as "h24" and show midnight as 24:00:00.  */
const DATE_TIME_OPTIONS = {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hourCycle: "h23"
};

/*  The formatters of fmt_date_time(), by locale and time zone. A
 *  filter over a time column formats every row on every keystroke,
 *  and building an Intl.DateTimeFormat costs some 20 times what one
 *  format() costs. A formatter keeps the time zone it was built in,
 *  so the key carries the zone's offsets in January and in July: a
 *  zone that changes under the page (TZ in node, the system's in a
 *  browser) gets a new one. Plain Dates, not Intl: nothing of Intl
 *  is built at module top level (see safe_locale).  */
const __date_time_formatters__ = new Map();
const JANUARY = new Date(Date.UTC(2026, 0, 1));
const JULY = new Date(Date.UTC(2026, 6, 1));

function date_time_formatter(locale)
{
    let loc = safe_locale(locale);
    let key = `${loc}|${JANUARY.getTimezoneOffset()}|${JULY.getTimezoneOffset()}`;
    let f = __date_time_formatters__.get(key);
    if(!f) {
        f = date_time_format(loc, DATE_TIME_OPTIONS);
        __date_time_formatters__.set(key, f);
    }
    return f;
}

/***************************************************************
 *  A moment as a VIEW shows it as text: the day, the month and the
 *  year, then the clock of 24 hours with its seconds, in the APP's
 *  language -- `locale` is the language t() answers in (the views
 *  pass `i18next.language`), never the browser's:
 *
 *      fmt_date_time(d, "es")  ->  "14 oct 2026, 15:05:09"
 *      fmt_date_time(d, "en")  ->  "Oct 14, 2026, 15:05:09"
 *
 *  "" for anything that is not a valid Date. A locale Intl refuses
 *  writes in the environment's (date_time_format). The formatter is
 *  built once per locale and time zone (date_time_formatter).
 *
 *  The time cells of C_YUI_FORM and C_YUI_TREEDB_TOPIC_WITH_FORM and
 *  the reading C_YUI_JSON writes beside a time field all come from
 *  here, so the same moment reads the same in the three.
 ***************************************************************/
function fmt_date_time(date, locale)
{
    if(!(date instanceof Date) || isNaN(date.getTime())) {
        return "";
    }
    return date_time_formatter(locale).format(date);
}


/***************************************************************
 *              Exports
 ***************************************************************/
export {
    safe_locale,
    date_time_format,
    fmt_date_time,
};
