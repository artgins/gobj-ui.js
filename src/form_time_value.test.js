import {describe, it, expect} from "vitest";
import {
    date_to_datetime_local, datetime_local_to_epoch, time_value_to_date, epoch_to_time_value, time_value_to_text
} from "./form_time_value.js";

describe("form_time_value", () => {

    it("an epoch with seconds survives a round trip through the input", () => {
        /*  The input was written without
         *  seconds, so every save of ANY field moved a writable time
         *  column back up to 59 s. */
        const epoch = 1790000037;   // :37 seconds
        const shown = date_to_datetime_local(new Date(epoch * 1000));
        expect(datetime_local_to_epoch(shown)).toBe(epoch);
    });

    it("an empty input is null, not NaN", () => {
        expect(datetime_local_to_epoch("")).toBe(null);
    });

    it("no date shows as an empty input", () => {
        expect(date_to_datetime_local(null)).toBe("");
        expect(date_to_datetime_local(new Date(NaN))).toBe("");
    });

    it("a time column is read and written by its type, and no time is null", () => {
        const epoch = 1790000037;
        const iso = new Date(epoch * 1000).toISOString();
        expect(time_value_to_date(epoch, "integer").getTime()).toBe(epoch * 1000);
        expect(time_value_to_date(iso, "string").getTime()).toBe(epoch * 1000);
        expect(time_value_to_date(null, "integer")).toBe(null);
        expect(time_value_to_date("", "string")).toBe(null);
        expect(time_value_to_date("not a time", "string")).toBe(null);
        expect(epoch_to_time_value(epoch, "integer")).toBe(epoch);
        expect(epoch_to_time_value(epoch, "string")).toBe(iso);
        expect(epoch_to_time_value(null, "string")).toBe(null);
        expect(epoch_to_time_value("already text", "string")).toBe("already text");
    });

    it("a time cell shows the local clock, and what is not a time as it is", () => {
        const wall = "2026-03-14T09:26:53";
        const epoch = Math.floor(new Date(wall).getTime() / 1000);
        expect(time_value_to_text(epoch, "integer", "es")).toBe("14 mar 2026, 09:26:53");
        expect(time_value_to_text(null, "integer")).toBe("");
        expect(time_value_to_text("garbage", "string")).toBe("garbage");
    });
});
