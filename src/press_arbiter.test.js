/***********************************************************************
 *          press_arbiter.test.js
 ***********************************************************************/
import {describe, it, expect} from "vitest";
import {
    LONG_PRESS_MS,
    LONG_PRESS_SLOP,
    press_moved,
    classify_press,
} from "./press_arbiter.js";

const at = (x, y, t0) => ({x: x, y: y, t0: t0});

describe("press_moved", () => {
    it("a finger that stays inside the slop has not moved", () => {
        let p = at(100, 100, 0);
        expect(press_moved(p, 100, 100)).toBe(false);
        expect(press_moved(p, 100 + LONG_PRESS_SLOP, 100)).toBe(false);
        expect(press_moved(p, 100, 100 - LONG_PRESS_SLOP)).toBe(false);
    });

    it("one pixel past the slop, in either axis, is a move", () => {
        let p = at(100, 100, 0);
        expect(press_moved(p, 100 + LONG_PRESS_SLOP + 1, 100)).toBe(true);
        expect(press_moved(p, 100, 100 + LONG_PRESS_SLOP + 1)).toBe(true);
    });

    it("no press, no move", () => {
        expect(press_moved(null, 100, 100)).toBe(false);
    });
});

describe("classify_press", () => {
    it("a press that moved is a drag, however long it was held", () => {
        let p = at(100, 100, 0);
        expect(classify_press(p, 400, 100, 10)).toBe("drag");
        expect(classify_press(p, 400, 100, 10 * LONG_PRESS_MS)).toBe("drag");
    });

    it("still and let go quickly is a tap", () => {
        let p = at(100, 100, 1000);
        expect(classify_press(p, 100, 100, 1000)).toBe("tap");
        expect(classify_press(p, 105, 103, 1000 + LONG_PRESS_MS - 1)).toBe("tap");
    });

    it("still and held to the threshold is the menu", () => {
        let p = at(100, 100, 1000);
        expect(classify_press(p, 100, 100, 1000 + LONG_PRESS_MS)).toBe("long");
        expect(classify_press(p, 108, 100, 9000)).toBe("long");
    });

    it("a long hold that ends somewhere else is still a drag", () => {
        /*  The finger that thought about the menu and then carried the
         *  node is carrying the node: the release is what decides, and
         *  the release is far away.  */
        let p = at(100, 100, 0);
        expect(classify_press(p, 260, 340, 3000)).toBe("drag");
    });

    it("no press to arbitrate", () => {
        expect(classify_press(null, 0, 0, 0)).toBe("none");
    });
});
