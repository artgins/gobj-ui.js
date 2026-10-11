/***********************************************************************
 *          overlay_marker_after_back.wiring.test.js
 *
 *      An overlay registered while a history.back() of the shell is
 *      still in flight. The common case: a floating window asks about
 *      unsaved changes on Back, and the user answers with a BUTTON
 *      (Cancel). The question's close calls history.back() to retire its
 *      marker -- asynchronous -- and in the same turn the window takes
 *      its entry back with pushState, which is synchronous. The marker
 *      landed before the traversal, the traversal then ran FROM it, and
 *      the window's marker was left orphaned ahead of the question's
 *      dead one.
 *
 *      The history here is a model of a browser's session history: a
 *      list and an index, pushState truncating what is ahead, and
 *      back() traversing on a later task, from whatever entry is current
 *      THEN.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {describe, test, expect, beforeAll, beforeEach} from "vitest";
import {install_dom_double} from "../test/dom_double.js";

install_dom_double();

const {
    SDATA_END, gclass_create,
    gobj_start_up, gobj_create_yuno, gobj_create, gobj_create_service,
    gobj_start, gobj_read_attr, gobj_is_destroying,
    set_log_callback,
} = await import("@yuneta/gobj-js");
const {register_c_yui_shell} = await import("./c_yui_shell.js");
const {register_c_yui_window} = await import("./c_yui_window.js");

const logged = [];
let veto = true;
let warning = null;
let yuno = null;

/*  The session history of one tab. Each entry carries its hash, as a
 *  browser's does: a traversal lands on the entry's hash, and fires a
 *  hashchange after the popstate when that hash is not the one it left.  */
const session = {entries: [{state: null, hash: ""}], index: 0};

function url_hash(url)
{
    return (typeof url === "string" && url.includes("#"))?
        url.slice(url.indexOf("#")) : null;
}

function install_history_model()
{
    session.entries = [{state: null, hash: window.location.hash}];
    session.index = 0;
    window.history = {
        get state() {
            return session.entries[session.index].state;
        },
        get length() {
            return session.entries.length;
        },
        pushState(state, title, url) {
            const h = url_hash(url);
            if(h !== null) {
                window.location.hash = h;
            }
            session.entries.splice(session.index + 1);
            session.entries.push({state: state, hash: window.location.hash});
            session.index++;
        },
        replaceState(state, title, url) {
            const h = url_hash(url);
            if(h !== null) {
                window.location.hash = h;
            }
            session.entries[session.index] = {state: state, hash: window.location.hash};
        },
        back() {
            setTimeout(() => {
                if(session.index > 0) {
                    traverse_to(session.index - 1);
                }
            }, 0);
        },
        forward() {
        },
        go() {
        }
    };
}

function fire_popstate()
{
    const ev = new Event("popstate");
    ev.state = window.history.state;
    window.dispatchEvent(ev);
}

function traverse_to(index)
{
    const left = window.location.hash;
    session.index = index;
    window.location.hash = session.entries[index].hash;
    fire_popstate();
    if(window.location.hash !== left) {
        window.dispatchEvent(new Event("hashchange"));
    }
}

/*  The user's Back: the browser's own traversal.  */
function user_back()
{
    traverse_to(session.index - 1);
}

function next_task()
{
    return new Promise(resolve => setTimeout(resolve, 0));
}

beforeAll(async () => {
    const i18next = (await import("i18next")).default;
    await i18next.init({lng: "en", resources: {}});
    gobj_start_up(null, null, null, null, null, null, null);
    set_log_callback((level, msg) => {
        logged.push({level: String(level), msg: String(msg)});
    });
    gclass_create("C_TEST_MARKER_HOST", [], [["ST_IDLE", []]], {}, 0, [SDATA_END()], {}, 0, 0, 0, 0);
    gclass_create(
        "C_TEST_MARKER_APP",
        [["EV_WINDOW_TO_CLOSE", 0]],
        [["ST_IDLE", [
            ["EV_WINDOW_TO_CLOSE", (gobj, event, kw) => {
                kw.abort_close = veto;
                if(warning) {
                    kw.warning = warning;
                }
                return 0;
            }, null]
        ]]],
        {}, 0, [SDATA_END()], {}, 0, 0, 0, 0
    );
    register_c_yui_shell();
    register_c_yui_window();
    yuno = gobj_create_yuno("marker_yuno", "C_TEST_MARKER_HOST", {});
    gobj_start(yuno);
});

beforeEach(() => {
    logged.length = 0;
    veto = true;
    warning = null;
    install_history_model();
});

function errors()
{
    return logged.filter((l) => l.level === "error" || l.level === "warning").map((l) => l.msg);
}

describe("an overlay registered while a back() of ours is in flight", () => {
    test("the window's marker lands where it belongs, and the next Back closes it", async () => {
        const app = gobj_create("mapp", "C_TEST_MARKER_APP", {}, yuno);
        gobj_start(app);
        const shell = gobj_create("mshell", "C_YUI_SHELL",
            {config: {shell: {}}, default_route: "/home", subscriber: app}, app);
        gobj_start(shell);
        logged.length = 0;     /*  the shell's own start: no route table here  */
        install_history_model();

        const win = gobj_create_service("mwin", "C_YUI_WINDOW",
            {subscriber: app, header: "x", body: ["div", {}, "body"]}, app);
        gobj_start(win);
        expect(session.entries.length).toBe(2);
        warning = "unsaved changes";

        /*  Back: the window asks.  */
        user_back();
        expect(gobj_is_destroying(win)).toBe(false);
        const question = shell.priv.overlay_stack[0];
        expect(question).toBeTruthy();
        expect(window.history.state).toEqual({__yui_overlay__: question.id});

        /*  The user answers with the Cancel BUTTON, not with Back.  */
        const $cancel = document.querySelector('.CONFIRM_BTN[data-modal-button-value="cancel"]');
        expect($cancel).toBeTruthy();
        $cancel.click();
        await next_task();
        await next_task();

        const entry = gobj_read_attr(win, "back_overlay");
        expect(entry).toBeTruthy();
        expect(shell.priv.overlay_stack).toEqual([entry]);
        expect(shell.priv.expected_pops).toBe(0);
        /*  One route entry and the window's marker, current: nothing
         *  orphaned ahead, no dead question's marker under it.  */
        expect(session.entries.length).toBe(2);
        expect(window.history.state).toEqual({__yui_overlay__: entry.id});

        /*  And the user's next Back is the window's, not swallowed.  */
        veto = false;
        warning = null;
        user_back();
        expect(gobj_is_destroying(win)).toBe(true);
        expect(shell.priv.overlay_stack).toEqual([]);
        expect(errors()).toEqual([]);
    });

    test("an overlay closed before its marker was pushed leaves no marker", async () => {
        const app = gobj_create("mapp2", "C_TEST_MARKER_APP", {}, yuno);
        gobj_start(app);
        const shell = gobj_create("mshell2", "C_YUI_SHELL",
            {config: {shell: {}}, default_route: "/home", subscriber: app}, app);
        gobj_start(shell);
        logged.length = 0;
        install_history_model();

        const {yui_shell_register_overlay, yui_shell_overlay_dismissed} =
            await import("./c_yui_shell.js");
        const first = yui_shell_register_overlay(shell, () => {});
        expect(session.entries.length).toBe(2);
        yui_shell_overlay_dismissed(shell, first);       // back() in flight
        const second = yui_shell_register_overlay(shell, () => {});
        expect(second.marker_pending).toBe(true);
        yui_shell_overlay_dismissed(shell, second);      // gone before its marker
        await next_task();
        await next_task();

        expect(shell.priv.overlay_stack).toEqual([]);
        expect(shell.priv.expected_pops).toBe(0);
        expect(session.entries.length).toBe(2);           // the dead first marker, ahead
        expect(session.index).toBe(0);
        expect(window.history.state).toBe(null);
        expect(errors()).toEqual([]);
    });

    test("a user Back queued after ours is the user's: it closes the next overlay", async () => {
        const app = gobj_create("mapp3", "C_TEST_MARKER_APP", {}, yuno);
        gobj_start(app);
        const shell = gobj_create("mshell3", "C_YUI_SHELL",
            {config: {shell: {}}, default_route: "/home", subscriber: app}, app);
        gobj_start(shell);
        logged.length = 0;
        install_history_model();

        const {yui_shell_register_overlay, yui_shell_overlay_dismissed} =
            await import("./c_yui_shell.js");
        let closed_a = 0;
        const a = yui_shell_register_overlay(shell, () => { closed_a++; });
        const b = yui_shell_register_overlay(shell, () => {});
        expect(session.entries.length).toBe(3);
        yui_shell_overlay_dismissed(shell, b);        // our back(), in flight
        await next_task();                            // ours lands first...
        expect(shell.priv.expected_pops).toBe(0);
        user_back();                                  // ... then the user's
        expect(closed_a).toBe(1);
        expect(shell.priv.overlay_stack).toEqual([]);
        expect(errors()).toEqual([]);
        expect(a).toBeTruthy();
    });

    test("a back() of ours that never lands does not swallow the next Back", async () => {
        const app = gobj_create("mapp4", "C_TEST_MARKER_APP", {}, yuno);
        gobj_start(app);
        const shell = gobj_create("mshell4", "C_YUI_SHELL",
            {config: {shell: {}}, default_route: "/home", subscriber: app}, app);
        gobj_start(shell);
        logged.length = 0;
        install_history_model();
        window.location.hash = "#/home";

        const {yui_shell_register_overlay, yui_shell_overlay_dismissed} =
            await import("./c_yui_shell.js");
        const first = yui_shell_register_overlay(shell, () => {});
        window.history.back = () => {};               // the browser drops it
        yui_shell_overlay_dismissed(shell, first);
        expect(shell.priv.expected_pops).toBe(1);
        let closed = 0;
        const second = yui_shell_register_overlay(shell, () => { closed++; },
            {keep_on_navigate: true});
        expect(second.marker_pending).toBe(true);

        /*  A navigation: the hash moves (a new entry, as a link does), our
         *  back() will never land.  */
        window.history.pushState(null, "", "#/other");
        window.dispatchEvent(new Event("hashchange"));
        expect(shell.priv.expected_pops).toBe(0);
        expect(second.marker_pending).toBe(false);
        expect(window.history.state).toEqual({__yui_overlay__: second.id});

        /*  The next Back is the user's, and it closes the overlay.  */
        logged.length = 0;
        user_back();
        expect(closed).toBe(1);
        expect(errors()).toEqual([]);
    });

    test("mt_stop forgets the landings it can no longer hear", async () => {
        const app = gobj_create("mapp5", "C_TEST_MARKER_APP", {}, yuno);
        gobj_start(app);
        const shell = gobj_create("mshell5", "C_YUI_SHELL",
            {config: {shell: {}}, default_route: "/home", subscriber: app}, app);
        gobj_start(shell);
        install_history_model();
        const {yui_shell_register_overlay, yui_shell_overlay_dismissed} =
            await import("./c_yui_shell.js");
        const {gobj_stop} = await import("@yuneta/gobj-js");
        const first = yui_shell_register_overlay(shell, () => {});
        window.history.back = () => {};
        yui_shell_overlay_dismissed(shell, first);
        yui_shell_register_overlay(shell, () => {});
        gobj_stop(shell);
        expect(shell.priv.expected_pops).toBe(0);
        expect(shell.priv.pending_markers).toEqual([]);
    });

    test("a dropped back() and a Back to another hash: the waiting overlay is not closed, no orphan marker", async () => {
        const app = gobj_create("mapp6", "C_TEST_MARKER_APP", {}, yuno);
        gobj_start(app);
        const shell = gobj_create("mshell6", "C_YUI_SHELL",
            {config: {shell: {}}, default_route: "/home", subscriber: app}, app);
        gobj_start(shell);
        window.location.hash = "#/prev";
        install_history_model();
        window.history.pushState(null, "", "#/home");    // a route entry

        const {yui_shell_register_overlay, yui_shell_overlay_dismissed} =
            await import("./c_yui_shell.js");
        const first = yui_shell_register_overlay(shell, () => {});
        window.history.back = () => {};               // the browser drops it
        yui_shell_overlay_dismissed(shell, first);
        expect(shell.priv.expected_pops).toBe(1);
        let closed = 0;
        const second = yui_shell_register_overlay(shell, () => { closed++; },
            {keep_on_navigate: true});
        expect(second.marker_pending).toBe(true);

        /*  The reader goes back two entries at once (a long press on Back,
         *  history.go(-2)): from the dead marker straight to #/prev, a hash
         *  that is not the landing ours expected.  */
        traverse_to(0);
        expect(window.location.hash).toBe("#/prev");
        expect(closed).toBe(0);
        expect(shell.priv.overlay_stack).toEqual([second]);
        expect(second.marker_pending).toBe(false);
        expect(window.history.state).toEqual({__yui_overlay__: second.id});
        expect(second.hash).toBe("#/prev");

        /*  And its marker is a real one: the next Back closes it.  */
        user_back();
        expect(closed).toBe(1);
        expect(shell.priv.overlay_stack).toEqual([]);
    });

    test("a button close after a replace navigation lands where expected, without a 'dropped' warning", async () => {
        const app = gobj_create("mapp7", "C_TEST_MARKER_APP", {}, yuno);
        gobj_start(app);
        const shell = gobj_create("mshell7", "C_YUI_SHELL",
            {config: {shell: {}}, default_route: "/home", subscriber: app}, app);
        gobj_start(shell);
        window.location.hash = "#/home";
        install_history_model();

        const {yui_shell_register_overlay, yui_shell_overlay_dismissed} =
            await import("./c_yui_shell.js");
        const entry = yui_shell_register_overlay(shell, () => {}, {keep_on_navigate: true});
        /*  The view under it writes its position into the URL with replace:
         *  the marker's own entry moves to another hash.  */
        window.history.replaceState(window.history.state, "", "#/home/pos");
        logged.length = 0;

        yui_shell_overlay_dismissed(shell, entry);    // the close button
        await next_task();
        await next_task();
        expect(shell.priv.expected_pops).toBe(0);
        expect(window.location.hash).toBe("#/home");
        expect(logged.some((l) => l.msg.includes("did not land"))).toBe(false);
    });
});

