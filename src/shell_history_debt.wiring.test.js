/***********************************************************************
 *          shell_history_debt.wiring.test.js
 *
 *      What a shell that stops with overlays up leaves in the browser
 *      history, and who takes it off. Its markers (and the action entry
 *      of a `stay` route under one) are dead once it stops: a Back onto
 *      one closes nothing. Up to gobj-ui 7.26.48 they stayed, and every
 *      logout with an overlay up left more dead Backs (two per cycle with
 *      a question over a panel). The stopped shell moves no history -- it
 *      would not hear the landing --; the next shell takes them off at its
 *      start, with one history.go(-n) heard by its own expected_pops.
 *
 *      The history here is a model of a browser's session history with
 *      the Navigation API: a list and an index, each entry with a key that
 *      a replaceState keeps and a push makes new, pushState truncating
 *      what is ahead, and a traversal (back(), go()) run on a later task
 *      from whatever entry is current THEN, announced by a
 *      `currententrychange` (with the entry it came FROM) before its
 *      popstate, as Chromium and Firefox do. Each entry belongs to a
 *      document: a reload makes every entry the new document's (both
 *      browsers say `sameDocument` of all of them after F5), and a
 *      cross-document navigation with replace keeps the entry's key
 *      for a NEW document, the entries under it staying the old one's.
 *      Real browsers: qa-history cases (h) to (n).
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {describe, test, expect, beforeAll, beforeEach, afterEach} from "vitest";
import {install_dom_double} from "../test/dom_double.js";

install_dom_double();

const {
    SDATA, SDATA_END, data_type_t, gclass_create, gobj_write_attr,
    gobj_start_up, gobj_create_yuno, gobj_create, gobj_start, gobj_stop,
    gobj_destroy, gobj_is_running,
    set_log_callback,
} = await import("@yuneta/gobj-js");
const {register_c_yui_shell, yui_shell_unpark_route, yui_shell_register_overlay,
       yui_shell_overlay_dismissed} = await import("./c_yui_shell.js");
const {yui_shell_show_modal, yui_shell_confirm_yesno} = await import("./shell_modals.js");

const logged = [];
let yuno = null;
let key_seq = 0;
const shells = [];

const session = {entries: [], index: 0, gos: [], doc: 1, nav_listeners: []};

function url_hash(url)
{
    return (typeof url === "string" && url.includes("#"))?
        url.slice(url.indexOf("#")) : null;
}

function new_entry(state, hash)
{
    key_seq++;
    return {state: state, hash: hash, key: `k${key_seq}`, doc: session.doc};
}

function install_history_model(with_navigation)
{
    session.doc++;
    session.entries = [new_entry(null, window.location.hash)];
    session.index = 0;
    session.gos = [];
    session.nav_listeners = [];
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
            session.entries.push(new_entry(state, window.location.hash));
            session.index++;
        },
        replaceState(state, title, url) {
            const h = url_hash(url);
            if(h !== null) {
                window.location.hash = h;
            }
            const e = session.entries[session.index];
            e.state = state;
            e.hash = window.location.hash;
        },
        back() {
            this.go(-1);
        },
        forward() {
            this.go(1);
        },
        go(delta) {
            session.gos.push(delta);
            setTimeout(() => {
                const to = session.index + delta;
                if(to >= 0 && to < session.entries.length) {
                    traverse_to(to);
                }
            }, 0);
        }
    };
    if(with_navigation) {
        window.navigation = {
            get currentEntry() {
                const e = session.entries[session.index];
                return {key: e.key, index: session.index, sameDocument: true};
            },
            entries() {
                const doc = session.entries[session.index].doc;
                return session.entries.map((e, i) => ({
                    key: e.key, index: i, url: `http://localhost/${e.hash}`,
                    sameDocument: e.doc === doc
                }));
            },
            addEventListener(type, fn) {
                session.nav_listeners.push({type, fn});
            },
            removeEventListener(type, fn) {
                session.nav_listeners = session.nav_listeners.filter(
                    (l) => !(l.type === type && l.fn === fn));
            }
        };
    } else {
        delete window.navigation;
    }
}

function traverse_to(index)
{
    const left = window.location.hash;
    const from = {key: session.entries[session.index].key, index: session.index};
    session.index = index;
    for(const l of session.nav_listeners.slice()) {
        if(l.type === "currententrychange") {
            l.fn({type: "currententrychange", navigationType: "traverse", from: from});
        }
    }
    window.location.hash = session.entries[index].hash;
    /*  The hashchange is queued BEFORE the popstate runs: a traversal
     *  the popstate handler starts lands after it (both browsers).  */
    if(session.entries[index].hash !== left) {
        setTimeout(() => {
            window.dispatchEvent(new Event("hashchange"));
        }, 0);
    }
    const ev = new Event("popstate");
    ev.state = window.history.state;
    window.dispatchEvent(ev);
}

function user_back()
{
    traverse_to(session.index - 1);
}

function user_forward()
{
    traverse_to(session.index + 1);
}

/*  A navigation to another document with replace (location.replace):
 *  the entry keeps its key and is a new document's, and the entries
 *  under it are no longer the current document's.  */
function cross_document_replace(hash)
{
    session.doc++;
    const e = session.entries[session.index];
    e.doc = session.doc;
    e.state = null;
    e.hash = hash;
    window.location.hash = hash;
}

function next_task()
{
    return new Promise(resolve => setTimeout(resolve, 0));
}

async function settle()
{
    for(let i = 0; i < 4; i++) {
        await next_task();
    }
}

beforeAll(async () => {
    const i18next = (await import("i18next")).default;
    await i18next.init({lng: "en", resources: {}});
    gobj_start_up(null, null, null, null, null, null, null);
    set_log_callback((level, msg) => {
        logged.push({level: String(level), msg: String(msg)});
    });
    gclass_create("C_TEST_DEBT_HOST", [], [["ST_IDLE", []]], {}, 0, [SDATA_END()], {}, 0, 0, 0, 0);
    gclass_create(
        "C_TEST_DEBT_VIEW", [], [["ST_IDLE", []]], {
            mt_create: (gobj) => {
                gobj_write_attr(gobj, "$container", document.createElement("div"));
            }
        }, 0, [
            SDATA(data_type_t.DTP_POINTER, "$container", 0, null, "view root"),
            SDATA(data_type_t.DTP_POINTER, "subscriber", 0, null, "subscriber"),
            SDATA_END()
        ], {}, 0, 0, 0, 0
    );
    register_c_yui_shell();
    yuno = gobj_create_yuno("debt_yuno", "C_TEST_DEBT_HOST", {});
    gobj_start(yuno);
});

beforeEach(() => {
    logged.length = 0;
});

afterEach(async () => {
    await settle();
    for(const sh of shells.splice(0)) {
        if(gobj_is_running(sh)) {
            gobj_stop(sh);
        }
        gobj_destroy(sh);
    }
    /*  What a test left for the next shell is not the next test's.  */
    install_history_model(true);
    const sh = new_shell();
    await settle();
    gobj_stop(sh);
    gobj_destroy(sh);
    shells.splice(0);
    window.location.hash = "";
});

function routed_config()
{
    const target = {stage: "main", gclass: "C_TEST_DEBT_VIEW", kw: {}};
    return {
        shell: {
            zones: {center: {host: "stage.main"}},
            stages: {main: {zone: "center", default_route: "/home"}}
        },
        menu: {
            primary: {
                items: [
                    {id: "prev", route: "/prev", target: target},
                    {id: "home", route: "/home", target: target},
                    {id: "prefs", route: "/prefs",
                        target: {kind: "action", event: "EV_OPEN_PREFS", redirect: "stay"}}
                ]
            }
        }
    };
}

let seq = 0;
function new_shell()
{
    seq++;
    const app = gobj_create(`dapp${seq}`, "C_TEST_DEBT_HOST", {}, yuno);
    gobj_start(app);
    const shell = gobj_create(`dshell${seq}`, "C_YUI_SHELL",
        {config: routed_config(), subscriber: app}, app);
    gobj_start(shell);
    shells.push(shell);
    return shell;
}

function stop_shell(shell)
{
    gobj_stop(shell);
    gobj_destroy(shell);
    shells.splice(shells.indexOf(shell), 1);
}

/*  The test app declares no route event: what the shell says is what
 *  these tests read.  */
function shell_warnings()
{
    return logged.filter((l) => l.level === "warning" || l.level === "error")
        .map((l) => l.msg).filter((m) => m.includes("C_YUI_SHELL"));
}

/*  Back from here to the first entry, counting the DEAD Backs: a landing
 *  on an entry that no live overlay owns and that is on the same hash as
 *  the one left (nothing on screen changes).  */
async function count_backs_to_start(open_overlay)
{
    let backs = 0;
    let dead = 0;
    while(session.index > 0) {
        const hash = window.location.hash;
        const was_open = open_overlay();
        user_back();
        await settle();
        backs++;
        if(window.location.hash === hash && was_open === open_overlay()) {
            dead++;
        }
    }
    return {backs, dead};
}

describe("a shell stopped with overlays up leaves its markers to the next one", () => {
    test("three logouts with a question over a panel: the next shell takes the dead markers off", async () => {
        window.location.hash = "#/prev";
        install_history_model(true);
        window.history.pushState(null, "", "#/home");
        let shell = new_shell();
        let open = null;

        for(let cycle = 0; cycle < 3; cycle++) {
            const panel = yui_shell_register_overlay(shell, () => {
                open = null;
            }, {keep_on_navigate: true});
            expect(panel).not.toBe(null);
            open = panel;
            await settle();
            yui_shell_confirm_yesno(shell, "log out?");    // answered by the stop
            expect(session.entries.length).toBeGreaterThanOrEqual(4);
            stop_shell(shell);
            /*  The stopped shell moves nothing.  */
            expect(session.gos).toEqual([]);
            open = null;
            shell = new_shell();
            await settle();
            /*  ONE traversal took both dead markers off.  */
            expect(session.gos).toEqual([-2]);
            expect(session.entries[session.index].hash).toBe("#/home");
            expect(session.index).toBe(1);
            session.gos = [];
        }
        const panel = yui_shell_register_overlay(shell, () => {
            open = null;
        });
        open = panel;
        expect(session.index).toBe(2);
        const r = await count_backs_to_start(() => open !== null);
        expect(r).toEqual({backs: 2, dead: 0});
        expect(open).toBe(null);
        expect(shell_warnings()).toEqual([]);
    });

    test("an overlay opened while the dead markers go waits for the landing", async () => {
        window.location.hash = "#/home";
        install_history_model(true);
        let shell = new_shell();
        yui_shell_show_modal(shell, "the sheet", {dialog: true, title: "settings"});
        stop_shell(shell);

        shell = new_shell();
        let closed = 0;
        /*  In the same turn as the start: the go(-1) is in flight.  */
        const panel = yui_shell_register_overlay(shell, () => {
            closed++;
        });
        expect(panel.marker_pending).toBe(true);
        expect(session.entries.length).toBe(2);
        await settle();
        expect(panel.marker_pending).toBe(false);
        expect(session.index).toBe(1);
        expect(window.history.state.__yui_overlay__).toBe(panel.id);

        user_back();
        await settle();
        expect(closed).toBe(1);
        expect(session.index).toBe(0);
        expect(shell_warnings()).toEqual([]);
    });

    test("the action entry of a `stay` route parked under an overlay goes too", async () => {
        window.location.hash = "#/prev";
        install_history_model(true);
        window.history.pushState(null, "", "#/home");
        let shell = new_shell();
        /*  A click on the action route: a push, then the action opens the
         *  overlay, and its close takes the URL off the route.  */
        window.history.pushState(null, "", "#/prefs");
        window.dispatchEvent(new Event("hashchange"));
        yui_shell_show_modal(shell, "the prefs", {
            dialog: true, title: "preferences",
            on_close: () => {
                yui_shell_unpark_route("/prefs");
            }
        });
        expect(session.entries.map(e => e.hash)).toEqual(["#/prev", "#/home", "#/prefs", "#/prefs"]);
        stop_shell(shell);
        expect(window.location.hash).toBe("#/home");    // rewritten in place (7.26.48)

        shell = new_shell();
        await settle();
        expect(session.gos).toEqual([-2]);
        expect(session.index).toBe(1);
        expect(window.location.hash).toBe("#/home");
        user_back();
        await settle();
        expect(window.location.hash).toBe("#/prev");
        expect(shell_warnings()).toEqual([]);
    });

    test("a back() of the stopped shell still in flight is adopted, not run over", async () => {
        window.location.hash = "#/home";
        install_history_model(true);
        let shell = new_shell();
        const first = yui_shell_register_overlay(shell, () => {});
        /*  Closed by a control of its own: its back() is in flight when
         *  the shell stops, in the same turn.  */
        yui_shell_overlay_dismissed(shell, first);
        expect(session.gos).toEqual([-1]);
        stop_shell(shell);

        shell = new_shell();
        let closed = 0;
        const panel = yui_shell_register_overlay(shell, () => {
            closed++;
        });
        expect(panel.marker_pending).toBe(true);
        await settle();
        /*  No second traversal: the dead marker was the one the back()
         *  took off.  */
        expect(session.gos).toEqual([-1]);
        expect(session.index).toBe(1);
        expect(window.history.state.__yui_overlay__).toBe(panel.id);
        user_back();
        await settle();
        expect(closed).toBe(1);
        expect(session.index).toBe(0);
        expect(shell_warnings()).toEqual([]);
    });

    test("nothing goes past an entry of the reader's", async () => {
        window.location.hash = "#/home";
        install_history_model(true);
        let shell = new_shell();
        yui_shell_register_overlay(shell, () => {}, {keep_on_navigate: true});
        /*  A link with the panel up: the marker is buried under it.  */
        window.history.pushState(null, "", "#/prev");
        window.dispatchEvent(new Event("hashchange"));
        await settle();
        stop_shell(shell);
        shell = new_shell();
        await settle();
        expect(session.gos).toEqual([]);
        expect(session.index).toBe(2);
        expect(shell_warnings()).toEqual([]);
    });

    test("an entry a deep link rewrites to the resting route is no longer dead", async () => {
        window.location.hash = "#/home";
        install_history_model(true);
        let shell = new_shell();
        yui_shell_register_overlay(shell, () => {});
        /*  The URL left on the action route (an app that does not unpark),
         *  and a stop: the marker is dead.  */
        window.history.replaceState(window.history.state, "", "#/prefs");
        stop_shell(shell);

        /*  The next shell reads #/prefs with no resting view: it rewrites
         *  that entry to the resting route and pushes the action again.  */
        shell = new_shell();
        await settle();
        expect(session.entries.map(e => e.hash)).toEqual(["#/home", "#/home", "#/prefs"]);
        expect(session.gos).toEqual([]);
        /*  The overlay of the action, and a logout with it up.  */
        yui_shell_show_modal(shell, "the prefs", {
            dialog: true, title: "preferences",
            on_close: () => {
                yui_shell_unpark_route("/prefs");
            }
        });
        stop_shell(shell);

        /*  Its marker and the action entry are dead; the entry under them
         *  is the resting view, and stays.  */
        shell = new_shell();
        await settle();
        expect(session.gos).toEqual([-2]);
        expect(session.index).toBe(1);
        expect(shell_warnings()).toEqual([]);
    });

    /*  location.replace() to another page and back to the app keeps
     *  the key of the entry it replaced: the new document sits on the
     *  key of a dead marker, and the entries under it are the earlier
     *  document's. Up to gobj-ui 7.26.50 the new shell took that key
     *  for dead and went back into them: the earlier document was
     *  loaded again.  */
    test("a dead key a later document sits on is not followed into the document before it", async () => {
        window.location.hash = "#/prev";
        install_history_model(true);
        window.history.pushState(null, "", "#/home");
        let shell = new_shell();
        yui_shell_register_overlay(shell, () => {}, {keep_on_navigate: true});
        await settle();
        yui_shell_confirm_yesno(shell, "leave?");
        expect(session.entries.length).toBe(4);
        stop_shell(shell);
        cross_document_replace("#/elsewhere");
        cross_document_replace("#/home");

        shell = new_shell();
        await settle();
        expect(session.gos).toEqual([]);
        expect(session.index).toBe(3);

        /*  Nor when a Back of the reader's lands on it.  */
        window.history.pushState(null, "", "#/prev");
        window.dispatchEvent(new Event("hashchange"));
        await settle();
        user_back();
        await settle();
        expect(session.gos).toEqual([]);
        expect(session.index).toBe(3);
        expect(window.location.hash).toBe("#/home");
        expect(shell_warnings()).toEqual([]);
    });

    /*  A login page between the logout and the login, and the reader
     *  goes somewhere in it: an entry of the reader's over the dead
     *  markers, and the next shell starts on it. Up to gobj-ui 7.26.50
     *  nothing took them off: two dead Backs under it.  */
    test("a Back that lands on dead entries under a later one takes them off; Forward skips them", async () => {
        window.location.hash = "#/prev";
        install_history_model(true);
        window.history.pushState(null, "", "#/home");
        let shell = new_shell();
        yui_shell_register_overlay(shell, () => {}, {keep_on_navigate: true});
        await settle();
        yui_shell_confirm_yesno(shell, "log out?");
        stop_shell(shell);
        window.history.pushState(null, "", "#/prev");

        shell = new_shell();
        await settle();
        expect(session.gos).toEqual([]);
        expect(session.index).toBe(4);

        user_back();
        await settle();
        expect(session.gos).toEqual([-2]);
        expect(session.index).toBe(1);
        expect(window.location.hash).toBe("#/home");

        /*  Forward goes over them to the reader's entry, not onto them,
         *  and not back down.  */
        user_forward();
        await settle();
        expect(session.gos).toEqual([-2, 2]);
        expect(session.index).toBe(4);
        expect(window.location.hash).toBe("#/prev");

        user_back();
        await settle();
        expect(session.index).toBe(1);
        const r = await count_backs_to_start(() => false);
        expect(r).toEqual({backs: 1, dead: 0});
        expect(window.location.hash).toBe("#/prev");
        expect(shell_warnings()).toEqual([]);
    });

    /*  The dead entries on another hash than the live one under them:
     *  the landing on them is not navigated -- it would fire the
     *  action again and bring the preferences up.  */
    test("a Back over dead entries of an action route does not run the action", async () => {
        window.location.hash = "#/prev";
        install_history_model(true);
        window.history.pushState(null, "", "#/home");
        let shell = new_shell();
        window.history.pushState(null, "", "#/prefs");
        window.dispatchEvent(new Event("hashchange"));
        yui_shell_show_modal(shell, "the prefs", {dialog: true, title: "preferences"});
        expect(session.entries.map(e => e.hash)).toEqual(["#/prev", "#/home", "#/prefs", "#/prefs"]);
        /*  An app that does not unpark: the URL stays on the action.  */
        stop_shell(shell);
        window.history.pushState(null, "", "#/prev");
        shell = new_shell();
        await settle();
        expect(session.gos).toEqual([]);
        const actions = () => logged.filter((l) => l.msg.includes("EV_OPEN_PREFS")).length;
        const before = actions();

        user_back();
        await settle();
        expect(session.gos).toEqual([-2]);
        expect(session.index).toBe(1);
        expect(window.location.hash).toBe("#/home");
        expect(actions()).toBe(before);
        expect(shell_warnings()).toEqual([]);
    });

    test("a Forward onto dead entries with nothing of the reader's above them moves nothing", async () => {
        window.location.hash = "#/prev";
        install_history_model(true);
        window.history.pushState(null, "", "#/home");
        let shell = new_shell();
        yui_shell_register_overlay(shell, () => {}, {keep_on_navigate: true});
        await settle();
        yui_shell_confirm_yesno(shell, "log out?");
        stop_shell(shell);
        shell = new_shell();
        await settle();
        expect(session.gos).toEqual([-2]);
        expect(session.index).toBe(1);

        user_forward();
        await settle();
        user_forward();
        await settle();
        expect(session.gos).toEqual([-2]);
        expect(session.index).toBe(3);

        /*  Back from there goes down to the reader's entry in ONE.  */
        user_back();
        await settle();
        expect(session.gos).toEqual([-2, -1]);
        expect(session.index).toBe(1);
        expect(window.location.hash).toBe("#/home");
        expect(shell_warnings()).toEqual([]);
    });

    test("without the Navigation API nothing moves, as before", async () => {
        window.location.hash = "#/home";
        install_history_model(false);
        let shell = new_shell();
        yui_shell_show_modal(shell, "the sheet", {dialog: true, title: "settings"});
        stop_shell(shell);
        shell = new_shell();
        await settle();
        expect(session.gos).toEqual([]);
        expect(session.entries.length).toBe(2);
        expect(shell_warnings()).toEqual([]);
    });
});
