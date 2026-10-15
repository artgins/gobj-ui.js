/***********************************************************************
 *          yui_uplot_time.js
 *
 *      The texts uPlot writes for a moment -- the ticks of a time axis
 *      and the reading of the legend -- in the APP's language, with a
 *      clock of 24 hours, as every other time a gobj-ui view shows
 *      (fmt_date_time of yui_date_text.js).
 *
 *      uPlot writes them from templates of its own, in English and
 *      12 hours: "3pm", "3:05pm", "10/14" (month first), "Oct", and
 *      "2026-10-14 3:05pm" in the legend. Its `fmtDate` option takes
 *      the template and returns the function that writes a Date with
 *      it; this one is given to it:
 *
 *          legend  "{YYYY}-{MM}-{DD} {h}:{mm}{aa}" -> fmt_date_time()
 *                                                     "14 oct 2026, 15:05:09"
 *          "{h}{aa}"        "3pm"     -> "15:00"
 *          "{h}:{mm}{aa}"   "3:05pm"  -> "15:05"
 *          "{M}/{D}"        "10/14"   -> es "14/10", en "10/14"
 *          "{M}/{D}/{YY}"   "10/14/26"-> es "14/10/26", en "10/14/26"
 *          "{MMM}"          "Oct"     -> es "oct", en "Oct"
 *
 *      The language is asked for on every call, so a redraw after a
 *      language change writes the new one (C_YUI_UPLOT redraws its
 *      axes on EV_LANGUAGE_CHANGED).
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {fmt_date_time, safe_locale, date_time_format} from "./yui_date_text.js";

/*  The legend's stamp, as uPlot 1.6 writes it (_timeSeriesStamp).  */
const LEGEND_STAMP = "{YYYY}-{MM}-{DD} {h}:{mm}{aa}";

const pad2 = (n) => String(n).padStart(2, "0");

/*  Intl formatters by locale and options: a redraw writes a dozen
 *  ticks, and a formatter is not cheap to build.  */
const __formatters__ = new Map();

function intl(locale, opts)
{
    let key = locale + "|" + JSON.stringify(opts);
    let f = __formatters__.get(key);
    if(!f) {
        f = date_time_format(locale, opts);
        __formatters__.set(key, f);
    }
    return f;
}

/*  A template fragment that has no word for a language is rewritten
 *  whole: the order of day and month is the language's.  */
const WHOLE = [
    ["{M}/{D}/{YY}", (d, loc) => intl(loc, {day: "numeric", month: "numeric", year: "2-digit"}).format(d)],
    ["{M}/{D}",      (d, loc) => intl(loc, {day: "numeric", month: "numeric"}).format(d)],
    ["{h}{aa}",      (d) => `${pad2(d.getHours())}:00`],
];

const TOKENS = {
    YYYY: (d) => String(d.getFullYear()),
    YY:   (d) => String(d.getFullYear()).slice(2),
    MMMM: (d, loc) => intl(loc, {month: "long"}).format(d),
    MMM:  (d, loc) => intl(loc, {month: "short"}).format(d),
    MM:   (d) => pad2(d.getMonth() + 1),
    M:    (d) => String(d.getMonth() + 1),
    DD:   (d) => pad2(d.getDate()),
    D:    (d) => String(d.getDate()),
    WWWW: (d, loc) => intl(loc, {weekday: "long"}).format(d),
    WWW:  (d, loc) => intl(loc, {weekday: "short"}).format(d),
    HH:   (d) => pad2(d.getHours()),
    H:    (d) => String(d.getHours()),
    hh:   (d) => pad2(d.getHours()),
    h:    (d) => pad2(d.getHours()),
    AA:   () => "",
    aa:   () => "",
    a:    () => "",
    mm:   (d) => pad2(d.getMinutes()),
    m:    (d) => String(d.getMinutes()),
    ss:   (d) => pad2(d.getSeconds()),
    s:    (d) => String(d.getSeconds()),
    fff:  (d) => String(d.getMilliseconds()).padStart(3, "0"),
};

/***************************************************************
 *  A template -> its parts: literal text, or a function of
 *  (date, locale).
 ***************************************************************/
function template_parts(tpl)
{
    let parts = [];
    let rest = String(tpl);
    while(rest.length > 0) {
        let whole = WHOLE.find(([frag]) => rest.startsWith(frag));
        if(whole) {
            parts.push(whole[1]);
            rest = rest.slice(whole[0].length);
            continue;
        }
        let m = /^\{([a-z]+)\}/i.exec(rest);
        if(m && TOKENS[m[1]]) {
            parts.push(TOKENS[m[1]]);
            rest = rest.slice(m[0].length);
            continue;
        }
        let next = rest.indexOf("{", 1);
        let text = (next < 0)? rest : rest.slice(0, next);
        parts.push(text);
        rest = rest.slice(text.length);
    }
    return parts;
}

/***************************************************************
 *  uPlot's `fmtDate` option. `get_locale` answers the app's
 *  language at the moment of the call (the views pass
 *  `() => i18next.language`).
 ***************************************************************/
function yui_uplot_fmt_date(get_locale)
{
    let locale = () => safe_locale(typeof get_locale === "function"? get_locale() : null);
    return function(tpl) {
        if(tpl === LEGEND_STAMP) {
            return (date) => fmt_date_time(date, locale());
        }
        let parts = template_parts(tpl);
        return function(date) {
            let loc = locale();
            let out = "";
            for(let part of parts) {
                out += (typeof part === "string")? part : part(date, loc);
            }
            return out;
        };
    };
}

export {yui_uplot_fmt_date};
