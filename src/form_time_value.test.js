import {describe, it, expect} from "vitest";
import {date_to_datetime_local, datetime_local_to_epoch} from "./form_time_value.js";

describe("form_time_value", () => {

    it("an epoch with seconds survives a round trip through the input", () => {
        /*  M26 of the 2026-09-21 review: the input was written without
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
});
