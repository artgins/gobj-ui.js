import {describe, it, expect} from "vitest";
import {nodes_answer} from "./nodes_answer.js";

describe("nodes_answer", () => {
    it("reads the plain list an unpaged backend answers", () => {
        let a = nodes_answer([{id: "a"}, {id: "b"}]);
        expect(a.rows.length).toBe(2);
        expect(a.total).toBe(2);
        expect(a.pages).toBe(1);
        expect(a.paged).toBe(false);
    });

    it("reads the envelope a paged backend answers", () => {
        let a = nodes_answer({total_rows: 120, pages: 3, data: [{id: "a"}]});
        expect(a.rows.length).toBe(1);
        expect(a.total).toBe(120);
        expect(a.pages).toBe(3);
        expect(a.paged).toBe(true);
    });

    it("an empty page still reports the true total", () => {
        let a = nodes_answer({total_rows: 120, pages: 3, data: []});
        expect(a.rows).toEqual([]);
        expect(a.total).toBe(120);
        expect(a.paged).toBe(true);
    });

    it("an empty list is not a page", () => {
        let a = nodes_answer([]);
        expect(a.rows).toEqual([]);
        expect(a.total).toBe(0);
        expect(a.paged).toBe(false);
    });

    it("falls back to the row count when the envelope omits its totals", () => {
        let a = nodes_answer({data: [{id: "a"}, {id: "b"}]});
        expect(a.total).toBe(2);
        expect(a.pages).toBe(1);
        expect(a.paged).toBe(true);
    });

    it("gives no rows for anything it does not recognise", () => {
        for(let bad of [null, undefined, 0, "x", {}, {data: "nope"}]) {
            let a = nodes_answer(bad);
            expect(a.rows).toEqual([]);
            expect(a.total).toBe(0);
            expect(a.paged).toBe(false);
        }
    });
});
