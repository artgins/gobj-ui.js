/***********************************************************************
 *          fmt_date_time.test.js
 *
 *      fmt_date_time() of yui_time.js: a moment as a view shows it as
 *      text -- day, short month, year, and a clock of 24 hours with its
 *      seconds -- in the language it is given (the app's), and the two
 *      readers built on it: time_value_to_text() (the time cells of the
 *      forms and the treedb tables) and format_epoch() (the reading
 *      C_YUI_JSON writes beside a time field).
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {describe, test, expect} from "vitest";
import {set_log_callback} from "@yuneta/gobj-js";
import {fmt_date_time, safe_locale} from "./yui_time.js";
import {time_value_to_text} from "./form_time_value.js";
import {format_epoch} from "./json_view_helpers.js";
import {yui_uplot_fmt_date} from "./yui_uplot_time.js";

const D = new Date(2026, 9, 14, 15, 5, 9);

describe("fmt_date_time", () => {
    test("es and en, 24 hours", () => {
        expect(fmt_date_time(D, "es")).toBe("14 oct 2026, 15:05:09");
        expect(fmt_date_time(D, "en")).toBe("Oct 14, 2026, 15:05:09");
        /*  A region does not bring back the 12 hours of en-US.  */
        expect(fmt_date_time(D, "en-US")).toBe("Oct 14, 2026, 15:05:09");
        expect(fmt_date_time(D, "es-ES")).toBe("14 oct 2026, 15:05:09");
    });

    test("midnight is 00, never 24 nor 12 a. m.; noon is 12, with no p. m.", () => {
        const midnight = new Date(2026, 9, 14, 0, 0, 0);
        const noon = new Date(2026, 9, 14, 12, 0, 0);
        const last = new Date(2026, 9, 14, 23, 59, 59);
        expect(fmt_date_time(midnight, "es")).toBe("14 oct 2026, 00:00:00");
        expect(fmt_date_time(midnight, "en")).toBe("Oct 14, 2026, 00:00:00");
        expect(fmt_date_time(noon, "es")).toBe("14 oct 2026, 12:00:00");
        expect(fmt_date_time(noon, "en")).toBe("Oct 14, 2026, 12:00:00");
        expect(fmt_date_time(last, "en")).toBe("Oct 14, 2026, 23:59:59");
    });

    test("the hour that repeats in autumn reads 02:30 in both passes", () => {
        const tz = process.env.TZ;
        process.env.TZ = "Europe/Madrid";
        try {
            /*  00:30Z and 01:30Z on 2026-10-25 are both 02:30 in Madrid.  */
            expect(fmt_date_time(new Date(1792888200 * 1000), "es")).toBe("25 oct 2026, 02:30:00");
            expect(fmt_date_time(new Date(1792891800 * 1000), "es")).toBe("25 oct 2026, 02:30:00");
            expect(fmt_date_time(new Date(1792895400 * 1000), "es")).toBe("25 oct 2026, 03:30:00");
        } finally {
            if(tz === undefined) {
                delete process.env.TZ;
            } else {
                process.env.TZ = tz;
            }
        }
    });

    test("no date is no text", () => {
        expect(fmt_date_time(null, "es")).toBe("");
        expect(fmt_date_time(undefined, "es")).toBe("");
        expect(fmt_date_time(new Date("not a date"), "es")).toBe("");
        expect(fmt_date_time(1792888200, "es")).toBe("");
        expect(fmt_date_time("2026-10-14", "es")).toBe("");
    });

    test("no language, or Firefox's literal \"undefined\", is the fallback of safe_locale", () => {
        const fallback = fmt_date_time(D, safe_locale(undefined));
        expect(fallback).toMatch(/15:05:09/);
        expect(fmt_date_time(D, undefined)).toBe(fallback);
        expect(fmt_date_time(D, "undefined")).toBe(fallback);
        expect(fmt_date_time(D, "")).toBe(fallback);
    });

    test("a locale Intl refuses writes in the environment's, as one it does not know, and says so once", () => {
        const warnings = [];
        set_log_callback((level, msg) => {
            if(String(level) === "warning" && /date_time_format/.test(String(msg))) {
                warnings.push(String(msg));
            }
        });
        try {
            const env = fmt_date_time(D, "xx");     /*  well-formed, unknown: Intl's own fallback  */
            expect(env).toBe(new Intl.DateTimeFormat(undefined, {
                day: "numeric", month: "short", year: "numeric",
                hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
            }).format(D));
            expect(warnings).toEqual([]);
            expect(fmt_date_time(D, "xx_YY")).toBe(env);
            expect(fmt_date_time(D, "xx_YY")).toBe(env);
            expect(fmt_date_time(D, "zz_ZZ")).toBe(env);
            expect(warnings.length).toBe(2);
            expect(warnings[0]).toMatch(/'xx_YY'/);
            expect(warnings[1]).toMatch(/'zz_ZZ'/);

            /*  The axis of a chart falls back the same way, and says it once.  */
            const month = yui_uplot_fmt_date(() => "yy_QQ")("{MMM}");
            expect(month(D)).toBe(new Intl.DateTimeFormat(undefined, {month: "short"}).format(D));
            expect(month(D)).toBe(new Intl.DateTimeFormat(undefined, {month: "short"}).format(D));
            expect(warnings.length).toBe(3);
            expect(warnings[2]).toMatch(/'yy_QQ'/);
        } finally {
            set_log_callback(null);
        }
    });
});

describe("what the views read through it", () => {
    const epoch = Math.floor(D.getTime() / 1000);

    test("time_value_to_text: an epoch, an ISO text, no time, not a time", () => {
        expect(time_value_to_text(epoch, "integer", "es")).toBe("14 oct 2026, 15:05:09");
        expect(time_value_to_text(D.toISOString(), "string", "en")).toBe("Oct 14, 2026, 15:05:09");
        expect(time_value_to_text(null, "integer", "es")).toBe("");
        expect(time_value_to_text(undefined, "integer", "es")).toBe("");
        expect(time_value_to_text("", "string", "es")).toBe("");
        expect(time_value_to_text("garbage", "string", "es")).toBe("garbage");
    });

    test("format_epoch: seconds and milliseconds read the same", () => {
        expect(format_epoch(epoch, "es")).toBe("14 oct 2026, 15:05:09");
        expect(format_epoch(epoch * 1000 + 999, "en")).toBe("Oct 14, 2026, 15:05:09");
        expect(format_epoch(0, "es")).toBe(null);
        expect(format_epoch(null, "es")).toBe(null);
    });
});

describe("the moments uPlot writes (yui_uplot_time.js)", () => {
    let lng = "es";
    const fmt = (tpl) => yui_uplot_fmt_date(() => lng)(tpl);
    const AFTERNOON = new Date(2026, 9, 14, 15, 5, 9, 374);
    const MIDNIGHT = new Date(2026, 9, 14, 0, 0, 0);

    test("the legend reads as every other view: fmt_date_time()", () => {
        const legend = fmt("{YYYY}-{MM}-{DD} {h}:{mm}{aa}");
        lng = "es";
        expect(legend(AFTERNOON)).toBe("14 oct 2026, 15:05:09");
        lng = "en";
        expect(legend(AFTERNOON)).toBe("Oct 14, 2026, 15:05:09");
        expect(legend(MIDNIGHT)).toBe("Oct 14, 2026, 00:00:00");
    });

    test("the ticks of uPlot's own templates: 24 hours, the language's names and order", () => {
        lng = "es";
        expect(fmt("{h}{aa}")(AFTERNOON)).toBe("15:00");
        expect(fmt("{h}{aa}")(MIDNIGHT)).toBe("00:00");
        expect(fmt("{h}:{mm}{aa}")(AFTERNOON)).toBe("15:05");
        expect(fmt(":{ss}")(AFTERNOON)).toBe(":09");
        expect(fmt(":{ss}.{fff}")(AFTERNOON)).toBe(":09.374");
        expect(fmt("{M}/{D}")(AFTERNOON)).toBe("14/10");
        expect(fmt("\n{M}/{D}/{YY} {h}:{mm}{aa}")(AFTERNOON)).toBe("\n14/10/26 15:05");
        expect(fmt("{MMM}")(AFTERNOON)).toBe("oct");
        expect(fmt("\n{YYYY}")(AFTERNOON)).toBe("\n2026");
        lng = "en";
        expect(fmt("{M}/{D}")(AFTERNOON)).toBe("10/14");
        expect(fmt("{MMM}")(AFTERNOON)).toBe("Oct");
        expect(fmt("{h}:{mm}{aa}")(AFTERNOON)).toBe("15:05");
    });

    test("an unknown token is left as text; Firefox's \"undefined\" is no language", () => {
        lng = "es";
        expect(fmt("{nope} {HH}")(AFTERNOON)).toBe("{nope} 15");
        lng = "undefined";
        expect(fmt("{h}:{mm}{aa}")(AFTERNOON)).toBe("15:05");
    });
});
