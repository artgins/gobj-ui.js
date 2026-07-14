/***********************************************************************
 *          yui_time.test.js
 *
 *      The period algebra, without a DOM.
 *
 *      Everything here is built from LOCAL calendar fields
 *      (`new Date(y, m, d)`), never from a UTC literal, so the suite says
 *      the same thing in every timezone the developers and CI happen to
 *      sit in.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {describe, it, expect} from "vitest";

import {
    epoch_to_ms,
    ms_to_epoch,
    epoch_to_local_input,
    local_input_to_epoch,
    fmt_epoch,
    iso_week,
    period_spec,
    period_start,
    period_shift,
    period_bounds,
    period_bounds_epoch,
    rolling_bounds,
    is_current_period,
    infer_period,
    period_label,
    YUI_PERIODS
} from "./yui_time.js";

/*  A translator that answers with the key, interpolated — what i18next
 *  does for a MISSING key, so the labels are asserted at their worst.  */
const t = (key, params) => {
    let s = key;
    for(let k in (params || {})) {
        s = s.replaceAll(`{{${k}}}`, String(params[k]));
    }
    return s;
};

const local = (y, m, d, h, mi, s) => new Date(y, m, d, h || 0, mi || 0, s || 0).getTime();

describe("epoch <-> clock", () => {
    it("crosses the ms flag both ways", () => {
        expect(epoch_to_ms(1500, false)).toBe(1500000);
        expect(epoch_to_ms(1500, true)).toBe(1500);
        expect(ms_to_epoch(1500999, false)).toBe(1500);
        expect(ms_to_epoch(1500999, true)).toBe(1500999);
    });

    it("reads back the string a datetime-local gives", () => {
        let ts = local(2026, 6, 14, 18, 55, 7);            /*  14 jul 2026  */
        let s = epoch_to_local_input(ts / 1000, false);
        expect(s).toBe("2026-07-14T18:55:07");
        expect(local_input_to_epoch(s, false)).toBe(ts / 1000);
    });

    it("keeps the milliseconds of a ms topic in a cell, and not in the picker", () => {
        let ts = local(2026, 6, 14, 18, 55, 7) + 42;
        expect(fmt_epoch(ts, true)).toBe("2026-07-14 18:55:07.042");
        expect(epoch_to_local_input(ts, true)).toBe("2026-07-14T18:55:07");
    });

    it("reads an empty / unparseable bound as unset", () => {
        expect(local_input_to_epoch("", false)).toBe(0);
        expect(local_input_to_epoch("not a date", false)).toBe(0);
        expect(epoch_to_local_input(0, false)).toBe("");
        expect(fmt_epoch(0, false)).toBe("");
    });
});

describe("ISO weeks", () => {
    it("puts 1 jan 2026 (a Thursday) in week 1", () => {
        expect(iso_week(new Date(2026, 0, 1))).toEqual({week: 1, year: 2026});
    });

    it("gives the WEEK-year, not the calendar year, on 1 jan 2027 (a Friday)", () => {
        /*  It closes week 53 of 2026: a label saying "week 1 2027" would
         *  name a week that starts three days LATER.  */
        expect(iso_week(new Date(2027, 0, 1))).toEqual({week: 53, year: 2026});
    });

    it("starts the week on Monday", () => {
        /*  13 jul 2026 is a Monday, 19 jul the Sunday that closes it.  */
        expect(iso_week(new Date(2026, 6, 13)).week).toBe(29);
        expect(iso_week(new Date(2026, 6, 19)).week).toBe(29);
        expect(iso_week(new Date(2026, 6, 20)).week).toBe(30);
    });
});

describe("bucket alignment", () => {
    const at = local(2026, 6, 14, 18, 55, 7);             /*  Tue 14 jul 2026  */

    it("floors a day to local midnight", () => {
        expect(period_start("day", at).getTime()).toBe(local(2026, 6, 14));
    });

    it("floors a week to its Monday", () => {
        expect(period_start("week", at).getTime()).toBe(local(2026, 6, 13));
    });

    it("floors a month to the 1st", () => {
        expect(period_start("month", at).getTime()).toBe(local(2026, 6, 1));
    });

    it("aligns a quarter to the calendar year: jul -> Q3 starts 1 jul", () => {
        expect(period_start("quarter", at).getTime()).toBe(local(2026, 6, 1));
        expect(period_start("quarter", local(2026, 4, 30)).getTime()).toBe(local(2026, 3, 1));
    });

    it("aligns a semester: jul -> H2 starts 1 jul", () => {
        expect(period_start("semester", at).getTime()).toBe(local(2026, 6, 1));
        expect(period_start("semester", local(2026, 5, 30)).getTime()).toBe(local(2026, 0, 1));
    });

    it("aligns a bimester to the year: jul -> jul+aug", () => {
        let b = period_bounds("bimester", at);
        expect(b.from).toBe(local(2026, 6, 1));
        expect(b.to).toBe(local(2026, 8, 1) - 1);
    });

    it("aligns a decade to 2020, not to 2021", () => {
        expect(period_start("decade", at).getTime()).toBe(local(2020, 0, 1));
    });

    it("aligns a 15min bucket to the quarter of the hour", () => {
        expect(period_start("15min", at).getTime()).toBe(local(2026, 6, 14, 18, 45));
    });

    it("aligns a 6h bucket to local midnight: 18:55 sits in the 18:00 one", () => {
        let six = {id: "6h", unit: "hour", count: 6};
        expect(period_start(six, at).getTime()).toBe(local(2026, 6, 14, 18));
        expect(period_start(six, local(2026, 6, 14, 5, 59)).getTime())
            .toBe(local(2026, 6, 14, 0));
    });
});

describe("bucket bounds", () => {
    it("closes the bucket on its LAST millisecond, not on the next one's first", () => {
        /*  Both ends of a match condition are inclusive: an exclusive end
         *  swallows the record that landed exactly on the boundary.  */
        let b = period_bounds("day", local(2026, 6, 14, 10));
        expect(b.from).toBe(local(2026, 6, 14));
        expect(b.to).toBe(local(2026, 6, 15) - 1);
    });

    it("hands the bounds over in the consumer's unit", () => {
        let s = period_bounds_epoch("day", local(2026, 6, 14, 10), false);
        expect(s.from).toBe(local(2026, 6, 14) / 1000);
        expect(s.to).toBe(local(2026, 6, 15) / 1000 - 1);

        let m = period_bounds_epoch("day", local(2026, 6, 14, 10), true);
        expect(m.to).toBe(local(2026, 6, 15) - 1);
    });

    it("gives a month its own length, february included", () => {
        expect(period_bounds("month", local(2024, 1, 10)).to)
            .toBe(local(2024, 2, 1) - 1);                 /*  2024 is a leap year  */
        expect(period_bounds("month", local(2026, 1, 10)).to)
            .toBe(local(2026, 2, 1) - 1);
    });
});

describe("stepping", () => {
    it("steps a month by the CALENDAR, not by 30 days", () => {
        /*  31 jan + 1 month is february, not "3 march".  */
        let feb = period_shift("month", local(2026, 0, 31, 23), 1);
        expect(feb).toBe(local(2026, 1, 1));
    });

    it("crosses the year in both directions", () => {
        expect(period_shift("month", local(2026, 11, 15), 1)).toBe(local(2027, 0, 1));
        expect(period_shift("month", local(2026, 0, 15), -1)).toBe(local(2025, 11, 1));
        expect(period_shift("quarter", local(2026, 11, 15), 1)).toBe(local(2027, 0, 1));
    });

    it("steps a day to the next LOCAL midnight — every day of the year", () => {
        /*  The DST trap: a day that adds 86400000 ms lands at 23:00 or at
         *  01:00 the two days a year the clock moves. Walking a whole year
         *  catches it in any timezone that has DST at all.  */
        let d = local(2026, 0, 1);
        for(let i = 0; i < 365; i++) {
            let next = period_shift("day", d, 1);
            let as_date = new Date(next);
            expect(as_date.getHours()).toBe(0);
            expect(as_date.getMinutes()).toBe(0);
            expect(period_bounds("day", d).to).toBe(next - 1);
            d = next;
        }
        expect(new Date(d).getFullYear()).toBe(2027);
    });

    it("steps a week to a Monday, always", () => {
        let d = local(2026, 0, 5);                        /*  a Monday  */
        for(let i = 0; i < 60; i++) {
            d = period_shift("week", d, 1);
            expect(new Date(d).getDay()).toBe(1);
            expect(new Date(d).getHours()).toBe(0);
        }
    });
});

describe("navigation state", () => {
    it("knows the bucket `now` falls in", () => {
        let now = local(2026, 6, 14, 18, 0);
        expect(is_current_period("day", local(2026, 6, 14, 3), now)).toBe(true);
        expect(is_current_period("day", local(2026, 6, 13, 3), now)).toBe(false);
        expect(is_current_period("month", local(2026, 6, 1), now)).toBe(true);
        expect(is_current_period("year", local(2026, 0, 1), now)).toBe(true);
        expect(is_current_period("year", local(2025, 0, 1), now)).toBe(false);
    });

    it("leaves a rolling window's end OPEN", () => {
        let now = local(2026, 6, 14, 18, 0);
        let r = rolling_bounds("24h", false, now);
        expect(r.from).toBe((now - 24 * 3600 * 1000) / 1000);
        expect(r.to).toBe(0);
    });
});

describe("recognizing a range", () => {
    it("brings a round-tripped range back as the period it was", () => {
        let b = period_bounds("quarter", local(2026, 6, 14));
        let got = infer_period(b.from, b.to, ["day", "week", "month", "quarter", "year"], true);
        expect(got.period.id).toBe("quarter");
        expect(period_bounds(got.period, got.anchor)).toEqual(b);
    });

    it("recognizes a bucket a SECONDS consumer stored, .999 and all", () => {
        /*  The bucket ends at …23:59:59.999; a seconds topic wrote
         *  …23:59:59. Compared in milliseconds, the week it saved came back
         *  as a hand-typed range and the granularity fell to "All".  */
        let b = period_bounds_epoch("week", local(2026, 6, 14), false);
        let got = infer_period(b.from, b.to, ["day", "week", "month", "year"], false);
        expect(got).not.toBe(null);
        expect(got.period.id).toBe("week");
        expect(period_bounds_epoch(got.period, got.anchor, false)).toEqual(b);
    });

    it("refuses a range that is not a bucket", () => {
        let from = local(2026, 6, 14, 3, 12);
        let to = local(2026, 6, 18, 9, 40);
        expect(infer_period(from, to, ["day", "week", "month"], true)).toBe(null);
        expect(infer_period(0, 0, ["day"], true)).toBe(null);
    });

    it("does not confuse a month with a bucket that merely starts with it", () => {
        let month = period_bounds("month", local(2026, 6, 14));
        expect(infer_period(month.from, month.to, ["quarter"], true)).toBe(null);
    });
});

describe("labels", () => {
    it("names the day the way a human does", () => {
        let now = Date.now();
        expect(period_label("day", now, t)).toBe("today");
        expect(period_label("day", period_shift("day", now, -1), t)).toBe("yesterday");
    });

    it("names the two weeks a human never calls by their number", () => {
        let now = Date.now();
        expect(period_label("week", now, t)).toBe("this week");
        expect(period_label("week", period_shift("week", now, -1), t)).toBe("last week");
    });

    it("numbers any other week, and adds the year only when it is not this one", () => {
        let now = Date.now();
        let back = period_shift("week", now, -3);
        expect(period_label("week", back, t))
            .toBe(`week ${iso_week(new Date(back)).week}`);
        /*  14 jul 2019 was a SUNDAY: it closes week 28, it does not open 29.  */
        expect(period_label("week", local(2019, 6, 14), t)).toBe("week 28 2019");
    });

    it("names a quarter and a semester by their number", () => {
        expect(period_label("quarter", local(2026, 6, 14), t)).toBe("quarter 3 2026");
        expect(period_label("semester", local(2026, 6, 14), t)).toBe("semester 2 2026");
        expect(period_label("quarter", local(2026, 0, 5), t)).toBe("quarter 1 2026");
    });

    it("names a year, and spans a decade", () => {
        expect(period_label("year", local(2025, 3, 1), t)).toBe("2025");
        expect(period_label("decade", local(2026, 3, 1), t)).toBe("2020 – 2029");
    });

    it("falls back to the bucket's own edges for anything an app invents", () => {
        let ten_days = {id: "10d", unit: "day", count: 10};
        let label = period_label(ten_days, local(2019, 6, 14), t);
        /*  No name to give it: it says what it spans, and it says the year
         *  because the year is not this one.  */
        expect(label).toContain("–");
        expect(label).toContain("2019");
    });

    it("says nothing about a mode that is not a bucket", () => {
        expect(period_label(null, Date.now(), t)).toBe("");
        expect(period_spec("span")).toBe(null);
        expect(period_spec({id: "custom"})).toBe(null);
    });
});

describe("the catalog", () => {
    it("declares every named bucket as (unit, count)", () => {
        for(let id in YUI_PERIODS) {
            let spec = period_spec(id);
            expect(spec).not.toBe(null);
            expect(spec.count).toBeGreaterThan(0);
        }
    });
});
