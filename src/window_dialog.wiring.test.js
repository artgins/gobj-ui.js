/***********************************************************************
 *          window_dialog.wiring.test.js
 *
 *      A C_YUI_WINDOW is a DIALOG for the keyboard and for a reader:
 *
 *        - it says so (`role="dialog"`), and it has a name: its title,
 *          by `aria-labelledby`, so the name changes language with it;
 *        - it takes the focus when it starts (`focus`: an element, a
 *          selector, a number; by default the window itself) and gives
 *          it back to where it came from when it goes;
 *        - Escape closes it (`keyboard`), the way its ✕ does: through
 *          EV_CLOSE_WINDOW, so EV_WINDOW_TO_CLOSE can still veto or
 *          ask -- but not an Escape that something inside took first;
 *        - a `modal` one blocks the rest of the app: a backdrop in the
 *          shell's dialog layer, `aria-modal`, Tab kept inside.
 *
 *      Up to 7.26.42 `focus`, `modal` and `keyboard` were declared and
 *      did nothing: a window took no focus, closed with no key, kept
 *      nothing in, and had no role.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {describe, test, expect, beforeAll, beforeEach, afterEach} from "vitest";
import {install_dom_double, FakeElement} from "../test/dom_double.js";

install_dom_double();

/*  focus() moves document.activeElement, as in a browser.  */
FakeElement.prototype.focus = function() {
    document.activeElement = this;
};

/*  In the document or not, as a browser answers it.  */
Object.defineProperty(FakeElement.prototype, "isConnected", {
    configurable: true,
    get() {
        let n = this;
        while(n) {
            if(n === document.documentElement) {
                return true;
            }
            n = n.parentNode;
        }
        return false;
    }
});

const {
    SDATA_END, gclass_create, gclass_find_by_name,
    gobj_start_up, gobj_create_yuno, gobj_create, gobj_create_service,
    gobj_start, gobj_read_attr, gobj_is_destroying, gobj_send_event,
    set_log_callback,
} = await import("@yuneta/gobj-js");
const {register_c_yui_shell} = await import("./c_yui_shell.js");
const {register_c_yui_window} = await import("./c_yui_window.js");
const {register_c_yui_window_manager} = await import("./c_yui_window_manager.js");

const logged = [];
const actions_run = [];
let veto = false;
let yuno = null;
let app = null;
let shell = null;
let seq = 0;

/*  A keydown that walks up from its target, as a browser bubbles it,
 *  to the document and the window -- along the path it had when it
 *  was dispatched, as a browser does, even if the target leaves the
 *  document on the way. Something inside may take it first
 *  (`taken(ev)` runs at the target, as a widget's own listener
 *  does).  */
function press(target, key, init, taken)
{
    const ev = Object.assign({
        type: "keydown", key: key, target: target, bubbles: true,
        defaultPrevented: false, stopped: false, isComposing: false,
        shiftKey: false,
        preventDefault() {
            this.defaultPrevented = true;
        },
        stopPropagation() {
            this.stopped = true;
        },
        stopImmediatePropagation() {
            this.stopped = true;
        }
    }, init || {});
    const path = [];
    for(let n = target; n; n = n.parentNode) {
        path.push(n);
    }
    if(taken) {
        taken(ev);
    }
    for(const n of path) {
        if(ev.stopped) {
            break;
        }
        ev.currentTarget = n;
        for(const fn of [...((n.listeners && n.listeners.keydown) || [])]) {
            fn.call(n, ev);
        }
    }
    if(!ev.stopped) {
        document.dispatchEvent(ev);
    }
    if(!ev.stopped) {
        window.dispatchEvent(ev);
    }
    return ev;
}

function errors()
{
    return logged.filter((l) => l.level === "error").map((l) => l.msg);
}

function warnings()
{
    return logged.filter((l) => l.level === "warning").map((l) => l.msg);
}

/*  A window of the app, started: what a host does.  */
function open_window(attrs)
{
    const name = `dwin${++seq}`;
    const win = gobj_create_service(name, "C_YUI_WINDOW", Object.assign({
        subscriber: app,
        title: "demo window",
        body: ["div", {class: "TEST_BODY"}, [
            ["input", {class: "TEST_FIRST", type: "text"}],
            ["textarea", {class: "TEST_TEXT"}],
            ["button", {class: "TEST_BUTTON", type: "button"}, "ok"],
        ]],
    }, attrs || {}), app);
    gobj_start(win);
    return win;
}

function $of(win)
{
    return gobj_read_attr(win, "$container");
}

beforeAll(async () => {
    const i18next = (await import("i18next")).default;
    await i18next.init({lng: "en", resources: {}});
    gobj_start_up(null, null, null, null, null, null, null);
    set_log_callback((level, msg) => {
        logged.push({level: String(level), msg: String(msg)});
    });
    gclass_create("C_TEST_DLG_HOST", [], [["ST_IDLE", []]], {}, 0, [SDATA_END()], {}, 0, 0, 0, 0);
    gclass_create(
        "C_TEST_DLG_APP",
        [["EV_WINDOW_TO_CLOSE", 0]],
        [["ST_IDLE", [
            ["EV_WINDOW_TO_CLOSE", (gobj, event, kw) => {
                kw.abort_close = veto;
                return 0;
            }, null]
        ]]],
        {}, 0, [SDATA_END()], {}, 0, 0, 0, 0
    );
    register_c_yui_shell();
    register_c_yui_window();
    register_c_yui_window_manager();

    /*  Which actions of the window ran, by event: the machine's view.  */
    const gclass = gclass_find_by_name("C_YUI_WINDOW", false);
    for(const st of gclass.dl_states) {
        for(const a of st.dl_actions) {
            const action = a.action;
            a.action = (gobj, event, kw, src) => {
                actions_run.push({event: event, kw: JSON.parse(JSON.stringify(kw || {}))});
                return action(gobj, event, kw, src);
            };
        }
    }

    yuno = gobj_create_yuno("dlg_yuno", "C_TEST_DLG_HOST", {});
    gobj_start(yuno);
    app = gobj_create("dapp", "C_TEST_DLG_APP", {}, yuno);
    gobj_start(app);
    shell = gobj_create("dshell", "C_YUI_SHELL",
        {config: {shell: {}}, default_route: "/home", subscriber: app}, app);
    gobj_start(shell);
});

beforeEach(() => {
    logged.length = 0;
    actions_run.length = 0;
    veto = false;
    document.activeElement = document.body;
});

/*  Nothing but what a test asks for is logged as an error.  */
afterEach(() => {
    expect(errors()).toEqual([]);
});

describe("a window is a dialog, with a name", () => {
    test("role=dialog, named by its title, focusable itself", () => {
        const win = open_window({title_prefix: "#7"});
        const $c = $of(win);

        expect($c.getAttribute("role")).toBe("dialog");
        expect($c.getAttribute("aria-modal")).toBe(null);
        expect($c.getAttribute("tabindex")).toBe("-1");

        /*  Named by its two halves, the data and the kind: a reader
         *  joins them with a space, and the kind half carries its key,
         *  so the name changes language.  */
        const ids = ($c.getAttribute("aria-labelledby") || "").split(" ").filter(Boolean);
        expect(ids.length).toBe(2);
        const $prefix = $c.querySelector(`#${ids[0]}`);
        const $kind = $c.querySelector(`#${ids[1]}`);
        expect(!!$prefix && !!$kind, "both halves exist").toBe(true);
        expect($prefix.classList.contains("WINDOW_TITLE_PREFIX")).toBe(true);
        expect($prefix.textContent).toBe("#7");
        expect($kind.classList.contains("WINDOW_TITLE_KIND")).toBe(true);
        expect($kind.getAttribute("i18n") || $kind.dataset.i18n).toBe("demo window");
        expect(!!$kind.closest(".WINDOW_HEADER"), "the halves of the title bar").toBe(true);
    });

    test("with a header of its own, the name is still its title", () => {
        const win = open_window({header: ["span", {class: "TEST_TOOLBAR"}, "tools"]});
        const $c = $of(win);

        const id = $c.getAttribute("aria-labelledby");
        expect(id).toBeTruthy();
        const $kind = $c.querySelector(`#${id}`);
        expect(!!$kind, "the title node exists").toBe(true);
        expect($kind.textContent).toBe("demo window");
        expect($kind.closest(".WINDOW_TITLE").classList.contains("is-sr-only")).toBe(true);
        expect(!!$c.querySelector(".TEST_TOOLBAR"), "the header of its own is there").toBe(true);
    });
});

describe("the focus", () => {
    test("goes to the window when it starts, and back to the opener when it closes", () => {
        const $opener = document.createElement("button");
        document.body.appendChild($opener);
        $opener.focus();

        const win = open_window();
        expect(document.activeElement === $of(win), "the focus is on $of(win)").toBe(true);

        $of(win).querySelector(".WINDOW_CLOSE").click();
        expect(gobj_is_destroying(win)).toBe(true);
        expect(document.activeElement === $opener, "the focus is on $opener").toBe(true);
        $opener.remove();
    });

    test("`focus` picks what takes it: a selector, a number, an element", () => {
        const w1 = open_window({focus: ".TEST_BUTTON"});
        expect(document.activeElement === $of(w1).querySelector(".TEST_BUTTON"), "the focus is on the button").toBe(true);

        const w2 = open_window({focus: 1});
        expect(document.activeElement === $of(w2).querySelector(".TEST_TEXT"), "the focus is on the second control").toBe(true);

        const $own = document.createElement("input");
        const w3 = open_window({body: $own, focus: $own});
        expect(document.activeElement === $own, "the focus is on $own").toBe(true);

        for(const w of [w1, w2, w3]) {
            $of(w).querySelector(".WINDOW_CLOSE").click();
        }
    });

    test("a `focus` that names nothing is said, and the window takes it", () => {
        const win = open_window({focus: ".NOT_THERE"});
        expect(document.activeElement === $of(win), "the focus is on $of(win)").toBe(true);
        expect(warnings().some((w) => w.includes(".NOT_THERE"))).toBe(true);
        $of(win).querySelector(".WINDOW_CLOSE").click();
    });

    test("a window that closes while the focus is elsewhere leaves it there", () => {
        const $opener = document.createElement("button");
        const $elsewhere = document.createElement("input");
        document.body.appendChild($opener);
        document.body.appendChild($elsewhere);
        $opener.focus();

        const win = open_window();
        $elsewhere.focus();
        gobj_send_event(win, "EV_CLOSE_WINDOW", {}, win);
        expect(gobj_is_destroying(win)).toBe(true);
        expect(document.activeElement === $elsewhere, "the focus is on $elsewhere").toBe(true);
        $opener.remove();
        $elsewhere.remove();
    });
});

describe("a window the reader did not open", () => {
    /*  What the browser says of the moment: `isActive` is true only in
     *  answer to a press or a key of the reader (a user activation).  */
    function with_activation(is_active, fn)
    {
        const had = Object.getOwnPropertyDescriptor(navigator, "userActivation");
        Object.defineProperty(navigator, "userActivation", {
            value: {isActive: is_active, hasBeenActive: is_active},
            configurable: true, writable: true
        });
        try {
            fn();
        } finally {
            if(had) {
                Object.defineProperty(navigator, "userActivation", had);
            } else {
                delete navigator.userActivation;
            }
        }
    }

    test("one the app restores at start up leaves the focus where it is", () => {
        const $page = document.createElement("input");
        document.body.appendChild($page);
        $page.focus();

        with_activation(false, () => {
            const win = open_window();
            expect(document.activeElement === $page, "the focus stays in the page").toBe(true);
            $of(win).querySelector(".WINDOW_CLOSE").click();
        });
        with_activation(true, () => {
            const win = open_window();
            expect(document.activeElement === $of(win), "opened by the reader, it takes it").toBe(true);
            $of(win).querySelector(".WINDOW_CLOSE").click();
        });
        $page.remove();
    });

    test("a modal one takes the focus all the same: nothing else can be used", () => {
        with_activation(false, () => {
            const win = open_window({modal: true});
            expect($of(win).contains(document.activeElement), "the focus is in the modal").toBe(true);
            $of(win).querySelector(".WINDOW_CLOSE").click();
        });
    });
});

describe("Escape", () => {
    test("closes the window the way its ✕ does: EV_CLOSE_WINDOW, vetoable", () => {
        const win = open_window();
        const $input = $of(win).querySelector(".TEST_FIRST");
        $input.focus();

        veto = true;
        let ev = press($input, "Escape");
        expect(gobj_is_destroying(win)).toBe(false);
        expect(ev.defaultPrevented).toBe(true);
        expect(ev.stopped).toBe(true);
        expect(actions_run.filter((a) => a.event === "EV_CLOSE_WINDOW"))
            .toEqual([{event: "EV_CLOSE_WINDOW", kw: {key: "Escape"}}]);

        veto = false;
        press($input, "Escape");
        expect(gobj_is_destroying(win)).toBe(true);
    });

    test("with `keyboard: false` it is not the window's: it goes on", () => {
        const win = open_window({keyboard: false});
        const $button = $of(win).querySelector(".TEST_BUTTON");
        const ev = press($button, "Escape");
        expect(gobj_is_destroying(win)).toBe(false);
        expect(ev.defaultPrevented).toBe(false);
        expect(ev.stopped).toBe(false);
        expect(actions_run.filter((a) => a.event === "EV_CLOSE_WINDOW")).toEqual([]);
        $of(win).querySelector(".WINDOW_CLOSE").click();
    });

    test("an Escape that something inside took first does not close it", () => {
        const win = open_window();
        const $c = $of(win);
        const $input = $c.querySelector(".TEST_FIRST");

        /*  A widget used it (a menu, a search box closed).  */
        press($input, "Escape", {}, (ev) => ev.preventDefault());
        /*  An input method composing.  */
        press($input, "Escape", {isComposing: true});
        /*  A cell editor that went with the key: Tabulator cancels the
         *  edit by removing the box the key was typed in, and says
         *  nothing else.  */
        const $cell = document.createElement("div");
        const $editor = document.createElement("input");
        $cell.appendChild($editor);
        $c.querySelector(".TEST_BODY").appendChild($cell);
        $editor.focus();
        press($editor, "Escape", {}, () => {
            $cell.removeChild($editor);
            document.activeElement = document.body;     /*  as a browser does  */
        });
        /*  The focus went with the editor: the window takes it back, so
         *  the next Escape is still heard.  */
        expect(document.activeElement === $c, "the window took the focus back").toBe(true);
        /*  A search box with text: the browser clears it with Escape.  */
        const $search = document.createElement("input");
        $search.setAttribute("type", "search");
        $search.value = "abc";
        $c.querySelector(".TEST_BODY").appendChild($search);
        press($search, "Escape");
        /*  A text editor: a textarea, a contenteditable.  */
        press($c.querySelector(".TEST_TEXT"), "Escape");
        const $editable = document.createElement("div");
        $editable.isContentEditable = true;
        $c.querySelector(".TEST_BODY").appendChild($editable);
        press($editable, "Escape");

        expect(gobj_is_destroying(win)).toBe(false);
        expect(actions_run.filter((a) => a.event === "EV_CLOSE_WINDOW")).toEqual([]);
        $c.querySelector(".WINDOW_CLOSE").click();
    });
});

describe("a modal window", () => {
    test("blocks the rest: a backdrop in the dialog layer, aria-modal, no dock", () => {
        const dock = gobj_create_service("dlg_dock", "C_YUI_WINDOW_MANAGER", {}, app);
        gobj_start(dock);
        logged.length = 0;

        const win = open_window({modal: true, manager: dock});
        const $c = $of(win);
        expect($c.getAttribute("aria-modal")).toBe("true");

        const $lock = $c.parentNode;
        expect($lock.classList.contains("WINDOW_MODAL_LOCK")).toBe(true);
        expect(!!$lock.querySelector(".WINDOW_MODAL_BACKDROP"), "a backdrop").toBe(true);
        expect($lock.parentNode === shell.priv.layers.modal, "the lock is in the modal layer").toBe(true);

        /*  It does not go to the dock: there is no getting back from it.  */
        expect(dock.priv.windows.length).toBe(0);
        expect($c.querySelector(".WINDOW_MIN").style.cssText).toContain("display:none");
        expect(warnings().some((w) => w.includes("modal") && w.includes("dock"))).toBe(true);

        /*  A press on the backdrop closes nothing.  */
        $lock.querySelector(".WINDOW_MODAL_BACKDROP").click();
        expect(gobj_is_destroying(win)).toBe(false);

        press($c.querySelector(".TEST_BUTTON"), "Escape");
        expect(gobj_is_destroying(win)).toBe(true);
        expect($lock.parentNode === null, "the lock went with the window").toBe(true);
    });

    test("keeps Tab inside, and gives the focus back when it goes", () => {
        const $opener = document.createElement("button");
        document.body.appendChild($opener);
        $opener.focus();

        const win = open_window({modal: true});
        const $c = $of(win);
        expect(document.activeElement === $c, "the focus is on $c").toBe(true);

        const $last = $c.querySelector(".TEST_BUTTON");
        $last.focus();
        const tab = press(document.activeElement, "Tab");
        expect(tab.defaultPrevented).toBe(true);
        expect($c.contains(document.activeElement)).toBe(true);
        expect(document.activeElement !== $last, "the focus left the last control").toBe(true);

        $c.querySelector(".WINDOW_CLOSE").click();
        expect(document.activeElement === $opener, "the focus is on $opener").toBe(true);
        $opener.remove();
    });
});

describe("a window of the dock", () => {
    test("minimized, the focus goes to its chip; brought back from it, into the window", () => {
        const dock = gobj_create_service("dlg_dock2", "C_YUI_WINDOW_MANAGER", {}, app);
        gobj_start(dock);
        const win = open_window({manager: dock});
        const $c = $of(win);
        expect(document.activeElement === $c, "the window took the focus").toBe(true);

        $c.querySelector(".WINDOW_MIN").click();
        const $toggle = dock.priv.windows[0].$chip.querySelector(".DOCK_CHIP_TOGGLE");
        expect(document.activeElement === $toggle,
            "the focus is on the way back, not lost with the hidden window").toBe(true);

        $toggle.click();
        expect(document.activeElement === $c, "the window brought back has it").toBe(true);

        $c.querySelector(".WINDOW_CLOSE").click();
        expect(gobj_is_destroying(win)).toBe(true);
    });
});
