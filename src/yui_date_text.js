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

/*  The clock is always 24 hours: `hourCycle`, never `hour12: false`,
 *  which some engines read as "h24" and show midnight as 24:00:00.  */
const DATE_TIME_OPTIONS = {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hourCycle: "h23"
};

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
 *  gives the language-free "2026-10-14 15:05:09".
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
    try {
        return new Intl.DateTimeFormat(safe_locale(locale), DATE_TIME_OPTIONS).format(date);
    } catch(e) {
        let pad = (n) => String(n).padStart(2, "0");
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
            `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
    }
}


/***************************************************************
 *              Exports
 ***************************************************************/
export {
    safe_locale,
    fmt_date_time,
};
