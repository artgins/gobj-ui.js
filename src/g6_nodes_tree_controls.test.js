/***********************************************************************
 *          g6_nodes_tree_controls.test.js
 *
 *      The buttons C_G6_NODES_TREE draws as `div`s -- the six floating
 *      icons beside a selection (node and edge gear and trash, link,
 *      port gear), the ✕ of the detail popover and the items of its two
 *      G6 toolbars -- are buttons for the keyboard and for a language
 *      switch too. They had a translated title and
 *      aria-label and nothing else: no role, no tabindex, no key, so
 *      they could not be reached without a pointer and kept the
 *      language they were drawn in.
 *
 *      Enter and Space must do exactly what the click does: they CLICK
 *      the element, and the key stops there, because the graph's
 *      container forwards every keydown to G6. And the click does one
 *      thing (V20.5 #7): it SENDS an input event of the gclass, with
 *      the plain identity of what the button belongs to; the action
 *      does the work, where the `machine` trace sees it.
 *
 *      A POINTER press does not take the focus (preventDefault on
 *      pointerdown): a button that took it and was then removed left
 *      the focus on <body> in Firefox, and the graph deaf (V20.5 #1).
 *
 *      A DISABLED item says so to the keyboard and to a reader too
 *      (V20.5 #5, third pass): `aria-disabled` and out of the Tab
 *      order, from its first render and through every
 *      disableElements / enableElements; a TOGGLE says its state in
 *      `aria-pressed`; and a rebuild gives the focus back to the same
 *      CONTROL, whatever state it shows (enter → exit full screen).
 *
 *      The double delivers an event to its target only; dispatch()
 *      below bubbles it the way a browser does, so a toolbar item's
 *      key reaches the toolbar's delegated listener and its click
 *      reaches G6's own handler.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {describe, test, expect, beforeAll, beforeEach} from "vitest";
import {install_dom_double, FakeElement} from "../test/dom_double.js";

install_dom_double();

const {
    SDATA_END, gclass_create, gobj_start_up, gobj_create_yuno,
    refresh_language, set_log_callback,
} = await import("@yuneta/gobj-js");
const {
    create_floating_icon, create_detail_close, toolbar_item_html, YuiToolbar,
} = await import("./c_g6_nodes_tree.js");
const {disableElements, enableElements} = await import("./lib_graph.js");

let i18next = null;

/*  What reached the sink's machine, in order.  */
const received = [];
const logged = [];
let sink = null;

/*  A DOM event as the browser dispatches it: at the target, then up
 *  its ancestors, until a listener stops it.  */
function dispatch(target, type, init)
{
    const ev = Object.assign({
        type: type, target: target,
        prevented: false, stopped: false,
        preventDefault() {
            this.prevented = true;
        },
        stopPropagation() {
            this.stopped = true;
        },
    }, init || {});
    for(let n = target; n && !ev.stopped; n = n.parentNode) {
        ev.currentTarget = n;
        for(const fn of [...((n.listeners && n.listeners[type]) || [])]) {
            fn.call(n, ev);
        }
    }
    return ev;
}

/*  A browser's click() bubbles; the double's does not.  */
FakeElement.prototype.click = function() {
    dispatch(this, "click");
};

/*  A browser's focus() moves document.activeElement; the double's
 *  does nothing.  */
FakeElement.prototype.focus = function() {
    document.activeElement = this;
};

beforeAll(async () => {
    i18next = (await import("i18next")).default;
    await i18next.init({lng: "en", resources: {
        en: {translation: {
            "node properties": "Node properties", "close": "Close", "zoom in": "Zoom in",
        }},
        es: {translation: {
            "node properties": "Propiedades del nodo", "close": "Cerrar", "zoom in": "Acercar",
        }},
    }});
    gobj_start_up(null, null, null, null, null, null, null);
    set_log_callback((level, msg) => {
        logged.push({level: String(level), msg: String(msg)});
    });
    const events = ["EV_TOGGLE_NODE_POPOVER", "EV_CLOSE_NODE_DETAIL"];
    gclass_create(
        "C_TEST_CONTROLS_SINK",
        events.map((e) => [e, 0]),
        [["ST_IDLE", events.map((e) => [e, (gobj, ev, kw) => {
            received.push({event: ev, kw: kw});
            return 0;
        }, null])]],
        {}, 0, [SDATA_END()], {}, 0, 0, 0, 0
    );
    sink = gobj_create_yuno("controls_yuno", "C_TEST_CONTROLS_SINK", {});
});

beforeEach(() => {
    received.length = 0;
    logged.length = 0;
    document.activeElement = document.body;
});

const BUILDERS = {
    "a floating icon": {
        build: () => create_floating_icon("gear", "#1890ff", 0, 0, "node properties",
            sink, "EV_TOGGLE_NODE_POPOVER", {node_id: "node-a"}),
        sent: {event: "EV_TOGGLE_NODE_POPOVER", kw: {node_id: "node-a"}},
    },
    "the detail popover's close": {
        build: () => create_detail_close(sink, "#64748b", "node-a"),
        sent: {event: "EV_CLOSE_NODE_DETAIL", kw: {node_id: "node-a"}},
    },
};

/*  A key press on `el`, inside a host that records what reaches it.  */
function press(el, key)
{
    const host = document.createElement("div");
    const reached = [];
    host.addEventListener("keydown", (e) => {
        reached.push(e.key);
    });
    host.appendChild(el);
    const ev = dispatch(el, "keydown", {key: key});
    return {ev, reached};
}

describe("C_G6_NODES_TREE draws its div buttons as buttons", () => {
    for(const [what, {build, sent}] of Object.entries(BUILDERS)) {
        describe(what, () => {
            test("is a button a keyboard can reach", () => {
                const el = build();
                expect(el.getAttribute("role")).toBe("button");
                expect(el.getAttribute("tabindex")).toBe("0");
            });

            test("is named, and each name carries its key", () => {
                const el = build();
                const key = el.getAttribute("data-i18n-title");
                expect(key).toBeTruthy();
                expect(el.getAttribute("data-i18n-aria-label")).toBe(key);
                expect(el.getAttribute("title")).toBe(i18next.t(key));
                expect(el.getAttribute("aria-label")).toBe(i18next.t(key));
                expect(el.getAttribute("title")).not.toBe(key);
            });

            test("a click SENDS its event to the gobj, with the identity, once", () => {
                const el = build();
                const ev = dispatch(el, "click");
                expect(received).toEqual([sent]);
                /*  Stopped, as it always was: the press is the button's,
                 *  not the canvas's under it.  */
                expect(ev.stopped).toBe(true);
            });

            test("each click sends its own copy of the identity", () => {
                const el = build();
                el.click();
                received[0].kw.node_id = "changed by an action";
                el.click();
                expect(received[1]).toEqual(sent);
            });

            test("Enter and Space CLICK it, and the key goes no further", () => {
                for(const key of ["Enter", " "]) {
                    const {ev, reached} = press(build(), key);
                    expect(ev.prevented, key).toBe(true);
                    expect(ev.stopped, key).toBe(true);
                    expect(reached, key).toEqual([]);
                }
                /*  The same path as the pointer: one event per key.  */
                expect(received).toEqual([sent, sent]);
            });

            test("any other key is the graph's", () => {
                for(const key of ["Escape", "Delete", "a", "Tab"]) {
                    const {ev, reached} = press(build(), key);
                    expect(ev.prevented, key).toBe(false);
                    expect(reached, key).toEqual([key]);
                }
                expect(received).toEqual([]);
            });

            test("a pointer press does not take the focus", () => {
                const el = build();
                const ev = dispatch(el, "pointerdown");
                expect(ev.prevented).toBe(true);
                /*  Only the default: the press still reaches the
                 *  container, whose capture listener focuses the canvas.  */
                expect(ev.stopped).toBe(false);
                expect(received).toEqual([]);
            });

            test("a language switch renames it", async () => {
                const el = build();
                const key = el.getAttribute("data-i18n-title");
                const english = el.getAttribute("title");
                await i18next.changeLanguage("es");
                try {
                    refresh_language(el, i18next.t);
                    expect(el.getAttribute("title")).toBe(i18next.t(key));
                    expect(el.getAttribute("aria-label")).toBe(i18next.t(key));
                    expect(el.getAttribute("title")).not.toBe(english);
                } finally {
                    await i18next.changeLanguage("en");
                }
                refresh_language(el, i18next.t);
                expect(el.getAttribute("title")).toBe(english);
            });
        });
    }

    test("the floating icon is named by the key it is given", () => {
        const el = create_floating_icon("gear", "#1890ff", 0, 0, "node properties",
            sink, "EV_TOGGLE_NODE_POPOVER", {node_id: "x"});
        expect(el.getAttribute("data-i18n-title")).toBe("node properties");
        expect(el.getAttribute("title")).toBe("Node properties");
    });

    test("the close keeps the class its stylesheet finds it by", () => {
        const el = create_detail_close(sink, "#64748b", "x");
        expect(el.classList.contains("g6-detail-close")).toBe(true);
        expect(el.getAttribute("data-i18n-title")).toBe("close");
    });
});

/*  The attributes of the first tag of `html`, entities decoded.  */
function attrs_of(html)
{
    const decode = (v) => v.replace(/&lt;/g, "<").replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
    const tag = html.match(/^<[a-z]+([^>]*)>/i);
    const out = {};
    for(const m of tag[1].matchAll(/([\w:-]+)(?:="([^"]*)")?/g)) {
        out[m[1]] = (m[2] === undefined)? "" : decode(m[2]);
    }
    return out;
}

/*  The double builds no element out of markup: the toolbar's
 *  innerHTML is read here into elements, one per top-level tag, the
 *  way a browser would give them to the toolbar's listeners.  */
function parse_into($el, html)
{
    for(const c of [...$el.childNodes]) {
        $el.removeChild(c);
    }
    for(const m of html.matchAll(/<div[^>]*>/g)) {
        const el = document.createElement("div");
        for(const [k, v] of Object.entries(attrs_of(m[0]))) {
            el.setAttribute(k, v);
        }
        $el.appendChild(el);
    }
}

describe("the toolbar items are buttons too", () => {
    test("an item: role, tabindex, and its name carries its key", () => {
        const a = attrs_of(toolbar_item_html({
            id: "g6-icon-zoom-in", value: "zoom-in", className: "EV_ZOOM_IN",
            title: "Zoom in", title_key: "zoom in",
        }));
        expect(a.role).toBe("button");
        expect(a.tabindex).toBe("0");
        expect(a.title).toBe("Zoom in");
        expect(a["aria-label"]).toBe("Zoom in");
        expect(a["data-i18n-title"]).toBe("zoom in");
        expect(a["data-i18n-aria-label"]).toBe("zoom in");

        const text = attrs_of(toolbar_item_html({
            text: "1:1", value: "reset", title: "Actual size", title_key: "actual size",
        }));
        expect(text.role).toBe("button");
        expect(text.tabindex).toBe("0");
        expect(text["data-i18n-title"]).toBe("actual size");
    });

    test("the readout and the separator are not buttons", () => {
        const read = attrs_of(toolbar_item_html({
            readout: true, className: "G6_ZOOM_LEVEL", text: "100%",
            title: "Zoom level", title_key: "zoom level",
        }));
        expect(read.role).toBeUndefined();
        expect(read.tabindex).toBeUndefined();
        expect(read["data-i18n-title"]).toBe("zoom level");
        const sep = attrs_of(toolbar_item_html({separator: true}));
        expect(sep.role).toBeUndefined();
        expect(sep.tabindex).toBeUndefined();
    });

    test("a disabled item is out of the Tab order and says it is disabled", () => {
        const off = attrs_of(toolbar_item_html({
            id: "g6-icon-save", value: "save", className: "EV_SAVE_GRAPH",
            title: "Save", title_key: "save", disabled: true,
        }));
        expect(off.disabled).toBe("");
        expect(off["aria-disabled"]).toBe("true");
        expect(off.tabindex).toBe("-1");
        /*  What enableElements() gives back.  */
        expect(off["data-enabled-tabindex"]).toBe("0");

        const on = attrs_of(toolbar_item_html({
            id: "g6-icon-save", value: "save", title: "Save", title_key: "save",
        }));
        expect(on.disabled).toBeUndefined();
        expect(on["aria-disabled"]).toBeUndefined();
        expect(on.tabindex).toBe("0");
    });

    test("a toggle says its state in aria-pressed; a plain button says none", () => {
        const pressed = attrs_of(toolbar_item_html({
            value: "anchor", title: "A", title_key: "anchor view", pressed: true,
        }));
        expect(pressed["aria-pressed"]).toBe("true");
        const released = attrs_of(toolbar_item_html({
            value: "selection-mode", title: "S", title_key: "selection mode", pressed: false,
        }));
        expect(released["aria-pressed"]).toBe("false");
        const plain = attrs_of(toolbar_item_html({
            value: "zoom-in", title: "Z", title_key: "zoom in",
        }));
        expect(plain["aria-pressed"]).toBeUndefined();
    });

    test("data-control names the control: its `control`, or its value", () => {
        expect(attrs_of(toolbar_item_html({
            value: "request-fullscreen", control: "fullscreen", title: "F", title_key: "enter full screen",
        }))["data-control"]).toBe("fullscreen");
        expect(attrs_of(toolbar_item_html({
            value: "zoom-in", title: "Z", title_key: "zoom in",
        }))["data-control"]).toBe("zoom-in");
    });

    test("a key carries no markup into the attribute", () => {
        const a = attrs_of(toolbar_item_html({
            value: "v", title: "t", title_key: '"><img src=x>',
        }));
        expect(a["data-i18n-title"]).toBe('"><img src=x>');
        expect(toolbar_item_html({value: "v", title: "t", title_key: "<img>"})
            .includes("<img")).toBe(false);
    });
});

/*  A YuiToolbar in a container with a canvas, on the real G6 base
 *  class: its onClick records the values G6's own handler hands it.  */
async function toolbar_with(items)
{
    const $container = document.createElement("div");
    const $canvas = document.createElement("canvas");
    $canvas.isConnected = true;
    $container.appendChild($canvas);
    const reached = [];
    $container.addEventListener("keydown", (e) => {
        reached.push(e.key);
    });
    const clicked = [];
    const state = {items: items};
    const toolbar = new YuiToolbar(
        {canvas: {getContainer: () => $container}},
        {
            getItems: () => state.items,
            onClick: (value) => {
                clicked.push(value);
            },
        }
    );
    /*  The first rebuild is still to come (an await away): read it.  */
    Object.defineProperty(toolbar.$element, "innerHTML", {
        configurable: true,
        set(html) {
            parse_into(this, String(html));
        },
        get() {
            return "";
        },
    });
    await toolbar.update({});
    const item = (value) => toolbar.$element.querySelectorAll(".g6-toolbar-item")
        .find((el) => el.getAttribute("value") === value) || null;
    return {$container, $canvas, toolbar, clicked, reached, state, item};
}

const ITEMS = [
    {id: "g6-icon-zoom-in", value: "zoom-in", className: "EV_ZOOM_IN", title: "Zoom in", title_key: "zoom in"},
    {readout: true, className: "G6_ZOOM_LEVEL", text: "100%", title: "Zoom level", title_key: "zoom level"},
    {separator: true},
    {id: "g6-icon-anchor", value: "anchor", className: "EV_TOGGLE_ANCHOR", title: "Anchor", title_key: "anchor view"},
    {id: "g6-icon-save", value: "save", className: "EV_SAVE_GRAPH", title: "Save", title_key: "save", disabled: true},
];

describe("YuiToolbar: the keyboard reaches G6's own click handler", () => {
    test("Enter and Space press the focused item, once each, and stop there", async () => {
        const {clicked, reached, item} = await toolbar_with(ITEMS);
        for(const key of ["Enter", " "]) {
            const ev = dispatch(item("zoom-in"), "keydown", {key: key});
            expect(ev.prevented, key).toBe(true);
            expect(ev.stopped, key).toBe(true);
        }
        expect(clicked).toEqual(["zoom-in", "zoom-in"]);
        expect(reached).toEqual([]);
    });

    test("any other key goes on to the graph's container", async () => {
        const {clicked, reached, item} = await toolbar_with(ITEMS);
        for(const key of ["Escape", "Delete", "Tab"]) {
            const ev = dispatch(item("anchor"), "keydown", {key: key});
            expect(ev.prevented, key).toBe(false);
        }
        expect(reached).toEqual(["Escape", "Delete", "Tab"]);
        expect(clicked).toEqual([]);
    });

    test("a disabled item takes the key and does nothing", async () => {
        const {clicked, reached, item} = await toolbar_with(ITEMS);
        const ev = dispatch(item("save"), "keydown", {key: "Enter"});
        expect(ev.prevented).toBe(true);
        expect(clicked).toEqual([]);
        expect(reached).toEqual([]);
    });

    test("a pointer press on an item does not take the focus; elsewhere it is left alone", async () => {
        const {toolbar, item} = await toolbar_with(ITEMS);
        expect(dispatch(item("zoom-in"), "pointerdown").prevented).toBe(true);
        const readout = toolbar.$element.querySelector(".G6_ZOOM_LEVEL");
        expect(dispatch(readout, "pointerdown").prevented).toBe(false);
    });

    test("a rebuild gives the focus back to the item of the same value", async () => {
        const {toolbar, item} = await toolbar_with(ITEMS);
        const before = item("anchor");
        before.focus();
        await toolbar.update({});
        const after = item("anchor");
        expect(after).not.toBe(before);
        expect(document.activeElement === after, "the focus is on after").toBe(true);
    });

    test("a rebuild without that item gives the focus to the canvas", async () => {
        const {toolbar, state, $canvas, item} = await toolbar_with(ITEMS);
        item("anchor").focus();
        state.items = ITEMS.filter((it) => it.value !== "anchor");
        await toolbar.update({});
        expect(document.activeElement === $canvas, "the focus is on $canvas").toBe(true);
    });

    test("a rebuild leaves alone a focus that was not on an item", async () => {
        const {toolbar} = await toolbar_with(ITEMS);
        const $find = document.createElement("input");
        $find.focus();
        await toolbar.update({});
        expect(document.activeElement === $find, "the focus is on $find").toBe(true);
    });

    test("a rebuild that changes the item's state keeps the focus on that control", async () => {
        const enter = {id: "g6-icon-fullscreen", value: "request-fullscreen", control: "fullscreen",
                       className: "EV_REQUEST_FULLSCREEN", title: "Enter", title_key: "enter full screen"};
        const exit = {id: "g6-icon-fullscreen-exit", value: "exit-fullscreen", control: "fullscreen",
                      className: "EV_EXIT_FULLSCREEN", title: "Exit", title_key: "exit full screen"};
        const {toolbar, state, item} = await toolbar_with([ITEMS[0], enter]);
        item("request-fullscreen").focus();
        state.items = [ITEMS[0], exit];
        await toolbar.update({});
        expect(document.activeElement === item("exit-fullscreen"),
            "the focus is on exit full screen").toBe(true);
    });

    test("a disabled item is not a Tab stop, and gets its place back when enabled", async () => {
        const {toolbar, item} = await toolbar_with(ITEMS);
        const $tb = toolbar.$element;
        expect(item("save").getAttribute("tabindex")).toBe("-1");
        expect(item("save").getAttribute("aria-disabled")).toBe("true");

        enableElements($tb, ".EV_SAVE_GRAPH");
        expect(item("save").hasAttribute("disabled")).toBe(false);
        expect(item("save").getAttribute("aria-disabled")).toBe(null);
        expect(item("save").getAttribute("tabindex")).toBe("0");
        expect(item("save").getAttribute("data-enabled-tabindex")).toBe(null);

        disableElements($tb, ".EV_ZOOM_IN");
        expect(item("zoom-in").hasAttribute("disabled")).toBe(true);
        expect(item("zoom-in").getAttribute("aria-disabled")).toBe("true");
        expect(item("zoom-in").getAttribute("tabindex")).toBe("-1");
        /*  Twice is still once: the tabindex it had is not lost.  */
        disableElements($tb, ".EV_ZOOM_IN");
        enableElements($tb, ".EV_ZOOM_IN");
        expect(item("zoom-in").getAttribute("tabindex")).toBe("0");
        expect(item("zoom-in").getAttribute("aria-disabled")).toBe(null);
    });

    test("a toolbar that goes away hands the focus to the canvas", async () => {
        const {toolbar, $canvas, item} = await toolbar_with(ITEMS);
        item("zoom-in").focus();
        toolbar.destroy();
        expect(document.activeElement === $canvas, "the focus is on $canvas").toBe(true);
    });
});

describe("disableElements / enableElements on any control", () => {
    test("a native button without a tabindex gets none back", () => {
        const $box = document.createElement("div");
        const $btn = document.createElement("button");
        $btn.className = "X";
        $box.appendChild($btn);
        disableElements($box, ".X");
        expect($btn.getAttribute("aria-disabled")).toBe("true");
        expect($btn.getAttribute("tabindex")).toBe("-1");
        enableElements($box, ".X");
        expect($btn.hasAttribute("disabled")).toBe(false);
        expect($btn.getAttribute("aria-disabled")).toBe(null);
        expect($btn.hasAttribute("tabindex")).toBe(false);
    });

    test("enabling what was never disabled leaves its tabindex alone", () => {
        const $box = document.createElement("div");
        const $el = document.createElement("div");
        $el.className = "X";
        $el.setAttribute("tabindex", "0");
        $box.appendChild($el);
        enableElements($box, ".X");
        expect($el.getAttribute("tabindex")).toBe("0");
        expect($el.getAttribute("aria-disabled")).toBe(null);
    });
});
