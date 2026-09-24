import {describe, it, expect} from "vitest";
import {
    track_form_write,
    settle_form_write,
    abandon_form_writes,
} from "./form_writes_in_flight.js";

describe("form writes in flight", () => {

    it("a write answered is settled; the others stay", () => {
        const in_flight = {};
        track_form_write(in_flight, 1, "users");
        track_form_write(in_flight, 2, "roles");
        settle_form_write(in_flight, 1, "users");
        expect(abandon_form_writes(in_flight)).toEqual([
            {form_write: 2, topic_name: "roles"},
        ]);
    });

    it("two forms, each at its serial 1: two writes, not one", () => {
        /*  Each topic's form counts its serials from 1. Keyed by the serial
         *  alone, the answer of one form settled the other's write, and a
         *  transport closing then left that one busy for ever.  */
        const in_flight = {};
        track_form_write(in_flight, 1, "users");
        track_form_write(in_flight, 1, "roles");
        settle_form_write(in_flight, 1, "users");
        expect(abandon_form_writes(in_flight)).toEqual([
            {form_write: 1, topic_name: "roles"},
        ]);
    });

    it("the transport closes: every write in flight is abandoned, once", () => {
        /*  The form of each one is answered EV_WRITE_REFUSED by the host
         *  and stays open on what was typed; before, it stayed busy for
         *  ever, because nobody answered a write whose answer was lost.  */
        const in_flight = {};
        track_form_write(in_flight, 3, "users");
        track_form_write(in_flight, 4, "roles");
        const abandoned = abandon_form_writes(in_flight);
        expect(abandoned).toEqual([
            {form_write: 3, topic_name: "users"},
            {form_write: 4, topic_name: "roles"},
        ]);
        expect(abandon_form_writes(in_flight)).toEqual([]);
    });

    it("a cell edited in place (no serial) is not a form write", () => {
        const in_flight = {};
        track_form_write(in_flight, 0, "users");
        track_form_write(in_flight, undefined, "users");
        expect(abandon_form_writes(in_flight)).toEqual([]);
    });

    it("no map: nothing to do", () => {
        expect(() => track_form_write(null, 1, "x")).not.toThrow();
        expect(() => settle_form_write(null, 1, "x")).not.toThrow();
        expect(abandon_form_writes(null)).toEqual([]);
    });
});
