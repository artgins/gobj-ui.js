/***********************************************************************
 *          shell_toast_once.test.js
 *
 *      A toast that says what one already on screen says is not
 *      stacked under it: one close of the transport settles every
 *      request it cut, each view that asked shows its failure, and
 *      the operator got a column of identical "the connection
 *      dropped" (low of the independent review of the 2nd round).
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {describe, test, expect, beforeEach} from "vitest";
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

    test("the handle of the repeat closes the toast on screen", () => {
        yui_shell_show_error(shell, "the connection dropped");
        const again = yui_shell_show_error(shell, "the connection dropped");
        again.close();
        expect(toasts().length).toBe(0);
    });
});
