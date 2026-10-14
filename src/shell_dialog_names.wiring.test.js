/***********************************************************************
 *          shell_dialog_names.wiring.test.js
 *
 *      Every dialog of the shell has a NAME for a reader: a modal is
 *      named by its title (the two halves, `title_prefix` and `title`,
 *      so the name changes language with it), or by its message when a
 *      plain one has nothing else; a question is named by its title and
 *      described by its message, or named by its message when it has
 *      no title. Up to 7.26.42 they were `role="dialog"` with no name:
 *      a reader said "dialog" and nothing else.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {describe, test, expect, beforeAll, beforeEach} from "vitest";
import {install_dom_double} from "../test/dom_double.js";

install_dom_double();

const {
    SDATA_END, gclass_create,
    gobj_start_up, gobj_create_yuno, gobj_create, gobj_start,
    set_log_callback,
} = await import("@yuneta/gobj-js");
const {register_c_yui_shell} = await import("./c_yui_shell.js");
const {
    yui_shell_show_modal,
    yui_shell_confirm_yesno,
} = await import("./shell_modals.js");

const logged = [];
let shell = null;

/*  The nodes a reader computes the name (or the description) of
 *  `$dialog` from: those its `attr` lists, all in its own tree.  */
function named_by($dialog, attr)
{
    const ids = ($dialog.getAttribute(attr) || "").split(/\s+/).filter(Boolean);
    return ids.map((id) => {
        const $n = $dialog.querySelector(`#${id}`);
        expect(!!$n, `${attr} points at '${id}', which is not in the dialog`).toBe(true);
        return $n;
    });
}

function warnings()
{
    return logged.filter((l) => l.level === "warning").map((l) => l.msg);
}

beforeAll(async () => {
    const i18next = (await import("i18next")).default;
    await i18next.init({lng: "en", resources: {}});
    gobj_start_up(null, null, null, null, null, null, null);
    set_log_callback((level, msg) => {
        logged.push({level: String(level), msg: String(msg)});
    });
    gclass_create("C_TEST_NAMES_HOST", [], [["ST_IDLE", []]], {}, 0, [SDATA_END()], {}, 0, 0, 0, 0);
    register_c_yui_shell();
    const yuno = gobj_create_yuno("names_yuno", "C_TEST_NAMES_HOST", {});
    gobj_start(yuno);
    shell = gobj_create("nshell", "C_YUI_SHELL",
        {config: {shell: {}}, default_route: "/home"}, yuno);
    gobj_start(shell);
});

beforeEach(() => {
    logged.length = 0;
});

describe("a modal of the shell is named", () => {
    test("by the two halves of its title, the kind half carrying its key", () => {
        const $box = document.createElement("div");
        const handle = yui_shell_show_modal(shell, $box,
            {dialog: true, title: "keys", title_prefix: "raw_tracks", logical_class: "NAMED_SHEET"});
        const $modal = document.querySelector(".NAMED_SHEET");

        const [$prefix, $kind] = named_by($modal, "aria-labelledby");
        expect($prefix.classList.contains("MODAL_TITLE_PREFIX")).toBe(true);
        expect($prefix.textContent).toBe("raw_tracks");
        expect($kind.classList.contains("MODAL_TITLE_KIND")).toBe(true);
        expect($kind.dataset.i18n || $kind.getAttribute("i18n")).toBe("keys");
        expect(named_by($modal, "aria-labelledby").length).toBe(2);
        /*  A form or a document is no description: read it as it is.  */
        expect($modal.getAttribute("aria-describedby")).toBe(null);
        handle.close();
    });

    test("with a title and no dialog chrome, by a title only a reader sees", () => {
        const $box = document.createElement("div");
        const handle = yui_shell_show_modal(shell, $box,
            {title: "preferences", logical_class: "PLAIN_SHEET"});
        const $modal = document.querySelector(".PLAIN_SHEET");

        const [$kind] = named_by($modal, "aria-labelledby");
        expect($kind.textContent).toBe("preferences");
        expect($kind.closest(".MODAL_TITLE").classList.contains("is-sr-only")).toBe(true);
        handle.close();
    });

    test("with a message and no title, by its message", () => {
        const handle = yui_shell_show_modal(shell, "nothing to show",
            {logical_class: "MESSAGE_SHEET"});
        const $modal = document.querySelector(".MESSAGE_SHEET");

        const [$msg] = named_by($modal, "aria-labelledby");
        expect($msg.textContent).toBe("nothing to show");
        handle.close();
    });

    test("with nothing to be named by: said", () => {
        const handle = yui_shell_show_modal(shell, document.createElement("div"),
            {logical_class: "NAMELESS_SHEET"});
        const $modal = document.querySelector(".NAMELESS_SHEET");
        expect($modal.getAttribute("aria-labelledby")).toBe(null);
        expect(warnings().some((w) => w.includes("no name"))).toBe(true);
        handle.close();
    });
});

describe("a question of the shell", () => {
    test("is named by its title and described by its message", async () => {
        const answer = yui_shell_confirm_yesno(shell, "all changes will be lost",
            {title: "unsaved changes", logical_class: "TITLED_QUESTION"});
        const $q = document.querySelector(".TITLED_QUESTION");

        const [$title] = named_by($q, "aria-labelledby");
        expect($title.classList.contains("CONFIRM_TITLE")).toBe(true);
        expect($title.dataset.i18n || $title.getAttribute("i18n")).toBe("unsaved changes");
        const [$body] = named_by($q, "aria-describedby");
        expect($body.textContent).toBe("all changes will be lost");

        $q.querySelector(".CONFIRM_CLOSE").click();
        expect(await answer).toBe(false);
    });

    test("with no title, is named by its message", async () => {
        const answer = yui_shell_confirm_yesno(shell, "delete it?",
            {logical_class: "BARE_QUESTION"});
        const $q = document.querySelector(".BARE_QUESTION");

        const [$body] = named_by($q, "aria-labelledby");
        expect($body.textContent).toBe("delete it?");
        expect($q.getAttribute("aria-describedby")).toBe(null);

        $q.querySelector(".CONFIRM_CLOSE").click();
        await answer;
    });
});
