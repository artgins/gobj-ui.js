/***********************************************************************
 *          shell_toast_once.test.js
 *
 *      A toast that says what one already on screen says is not
 *      stacked under it: one close of the transport settles every
 *      request it cut, each view that asked shows its failure, and
 *      the operator got a column of identical "the connection
 *      dropped" (low of the independent review of the 2nd round).
 *
 *      And a repeat is a caller of its own (third independent
 *      review): its handle and its time are its own, and the toast
 *      stays while any caller still holds it.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {describe, test, expect, beforeEach, afterEach, vi} from "vitest";
import {install_dom_double} from "../test/dom_double.js";

install_dom_double();

const {
    yui_shell_show_error,
    yui_shell_show_info,
} = await import("./shell_modals.js");

let shell = null;

function toasts()
{
    return shell.priv.layers.notification.children;
}

beforeEach(() => {
    shell = {priv: {layers: {notification: document.createElement("div")}}};
});

describe("one toast per message on screen", () => {

    test("the same error twice is ONE toast", () => {
        yui_shell_show_error(shell, "the connection dropped");
        yui_shell_show_error(shell, "the connection dropped");
        yui_shell_show_error(shell, "the connection dropped");
        expect(toasts().length).toBe(1);
    });

    test("different messages, or kinds, still stack", () => {
        yui_shell_show_error(shell, "the connection dropped");
        yui_shell_show_error(shell, "the connection dropped during the write");
        yui_shell_show_info(shell, "the connection dropped");
        expect(toasts().length).toBe(3);
    });

    test("closing the one on screen: the next one is shown", () => {
        const first = yui_shell_show_error(shell, "the connection dropped");
        first.close();
        expect(toasts().length).toBe(0);
        yui_shell_show_error(shell, "the connection dropped");
        expect(toasts().length).toBe(1);
    });

    test("the toast goes when EVERY handle of it is closed", () => {
        const first = yui_shell_show_error(shell, "the connection dropped");
        const again = yui_shell_show_error(shell, "the connection dropped");
        again.close();
        expect(toasts().length).toBe(1);    /*  the first still holds it  */
        first.close();
        expect(toasts().length).toBe(0);
    });
});

/*
 *  The third independent review: a repeat was handed the FIRST toast's
 *  handle and timer. A repeat asking `timeout: 0` was dismissed on the
 *  first one's timer, and closing one caller's handle closed the toast
 *  another caller was still showing.
 */
describe("a repeat is its own caller", () => {

    beforeEach(() => {
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    test("a repeat asking timeout 0 is not dismissed on the first one's timer", () => {
        yui_shell_show_error(shell, "the connection dropped", {timeout: 1000});
        const sticky = yui_shell_show_error(shell, "the connection dropped", {timeout: 0});
        vi.advanceTimersByTime(5000);
        expect(toasts().length).toBe(1);
        sticky.close();
        expect(toasts().length).toBe(0);
    });

    test("closing the first caller's handle leaves the repeat's toast up", () => {
        const first = yui_shell_show_error(shell, "the connection dropped", {timeout: 0});
        yui_shell_show_error(shell, "the connection dropped", {timeout: 3000});
        first.close();
        expect(toasts().length).toBe(1);
        vi.advanceTimersByTime(3000);
        expect(toasts().length).toBe(0);
    });

    test("the longest time wins, as a restart did", () => {
        yui_shell_show_error(shell, "the connection dropped", {timeout: 1000});
        vi.advanceTimersByTime(800);
        yui_shell_show_error(shell, "the connection dropped", {timeout: 1000});
        vi.advanceTimersByTime(500);
        expect(toasts().length).toBe(1);
        vi.advanceTimersByTime(500);
        expect(toasts().length).toBe(0);
    });

    test("the operator's close takes it down for every caller", () => {
        const first = yui_shell_show_error(shell, "the connection dropped", {timeout: 0});
        const again = yui_shell_show_error(shell, "the connection dropped", {timeout: 0});
        toasts()[0].querySelector(".TOAST_CLOSE").click();
        expect(toasts().length).toBe(0);
        first.close();
        again.close();
        yui_shell_show_error(shell, "the connection dropped", {timeout: 0});
        expect(toasts().length).toBe(1);
    });
});
