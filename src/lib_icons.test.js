/***********************************************************************
 *          lib_icons.test.js
 *
 *      Unit tests for the user icons of lib_icons: the svg rebuilt from
 *      its shapes, the mask url, and the registry that turns the nodes
 *      of __icons__ into `yi-u-<id>` rules.
 *
 *      The suite runs in node, with no DOMParser: the sanitizer is
 *      tested on its PARSED half (rebuild_svg_from_shapes) with trees
 *      built here, and the registry gets a DOMParser double that hands
 *      those same trees back.
 *      Run with: npm test
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {test, expect, beforeAll} from "vitest";
import {install_dom_double} from "../test/dom_double.js";

install_dom_double();

const {
    rebuild_svg_from_shapes,
    svg_mask_url,
    yui_user_icon_class,
    yui_icons_is_svg_field,
    yui_icons_set_user,
    yui_icons_put_user,
    yui_icons_remove_user,
    yui_icons_list,
    USER_ICON_PREFIX,
    ICONS_TOPIC,
} = await import("./lib_icons.js");

/*
 *  An element as rebuild_svg_from_shapes() reads it: a DOM element has
 *  more, and these are the only parts it touches.
 */
function el(name, attrs, children)
{
    attrs = attrs || {};
    return {
        localName: name,
        attributes: Object.entries(attrs).map(([k, v]) => {
            let i = k.indexOf(":");
            return {
                name: k,
                localName: i >= 0? k.substring(i + 1) : k,
                prefix: i >= 0? k.substring(0, i) : null,
                value: v
            };
        }),
        children: children || [],
        getAttribute(n) {
            return Object.prototype.hasOwnProperty.call(attrs, n)? attrs[n] : null;
        },
        getElementsByTagName() {
            return [];
        }
    };
}

const BOLT = el("svg", {xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 24 24"}, [
    el("path", {d: "M13 2L3 14h9l-1 8 10-12h-9l1-8z"})
]);

test("a plain icon comes back as its shapes, in a clean svg", () => {
    let r = rebuild_svg_from_shapes(BOLT);
    expect(r.error).toBeUndefined();
    expect(r.svg).toBe(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">' +
        '<path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"></path></svg>'
    );
    expect(r.dropped).toEqual([]);
});

/*
 *  What a hostile svg carries is LEFT OUT and named, never copied: it is
 *  written by whoever can write a node and drawn on every page.
 */
test("script, foreignObject, image, use and handlers are dropped", () => {
    let svg = el("svg", {viewBox: "0 0 10 10", onload: "alert(1)"}, [
        el("script", {}, []),
        el("foreignObject", {}, [el("div")]),
        el("image", {"xlink:href": "http://x/y.png"}),
        el("use", {href: "#a"}),
        el("path", {d: "M0 0h10v10z", onclick: "alert(2)", "xlink:href": "javascript:alert(3)"})
    ]);
    let r = rebuild_svg_from_shapes(svg);
    expect(r.svg).toBe(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">' +
        '<path d="M0 0h10v10z"></path></svg>'
    );
    expect(r.dropped).toEqual(expect.arrayContaining([
        "script", "foreignObject", "image", "use", "@onclick", "@xlink:href", "@onload"
    ]));
    expect(r.svg).not.toMatch(/alert|script|href/);
});

test("a value that is a url, or could close its quote, is dropped", () => {
    let svg = el("svg", {viewBox: "0 0 10 10"}, [
        el("rect", {x: "0", y: "0", width: "10", height: "10",
                    fill: "url(#grad)", stroke: '"/><script>'})
    ]);
    let r = rebuild_svg_from_shapes(svg);
    expect(r.svg).toBe(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">' +
        '<rect x="0" y="0" width="10" height="10"></rect></svg>'
    );
    expect(r.dropped).toEqual(expect.arrayContaining(["@fill", "@stroke"]));
});

test("an icon drawn with strokes keeps the root's stroke and fill", () => {
    let svg = el("svg", {viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
                         "stroke-width": "2", "stroke-linecap": "round"}, [
        el("g", {}, [el("line", {x1: "1", y1: "1", x2: "23", y2: "23"})])
    ]);
    let r = rebuild_svg_from_shapes(svg);
    expect(r.svg).toBe(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" ' +
        'stroke="currentColor" stroke-width="2" stroke-linecap="round">' +
        '<g><line x1="1" y1="1" x2="23" y2="23"></line></g></svg>'
    );
});

test("the box comes from width and height when there is no viewBox", () => {
    let svg = el("svg", {width: "32", height: "16"}, [el("circle", {cx: "8", cy: "8", r: "8"})]);
    expect(rebuild_svg_from_shapes(svg).svg).toMatch(/viewBox="0 0 32 16"/);
});

test("what cannot be drawn is refused, saying why", () => {
    expect(rebuild_svg_from_shapes(el("svg", {}, [el("path", {d: "M0 0"})])).error)
        .toBe("svg without size");
    expect(rebuild_svg_from_shapes(el("svg", {viewBox: "0 0 1 1"}, [el("g")])).error)
        .toBe("svg without shapes");
    expect(rebuild_svg_from_shapes(el("html")).error).toBe("not an svg document");
});

/*
 *  The mask url is written into a stylesheet: nothing in it may end the
 *  string or the url.
 */
test("the mask url encodes what could end it", () => {
    let url = svg_mask_url('<svg a="1">)</svg>\n');
    expect(url.startsWith('url("data:image/svg+xml,')).toBe(true);
    expect(url.endsWith('")')).toBe(true);
    let body = url.slice('url("'.length, -'")'.length);
    expect(body).not.toMatch(/["\n\\]/);
});

test("a user icon lives in its own namespace", () => {
    expect(USER_ICON_PREFIX).toBe("yi-u-");
    expect(yui_user_icon_class("transformer")).toBe("yi-u-transformer");
    expect(yui_icons_is_svg_field(ICONS_TOPIC, "svg")).toBe(true);
    expect(yui_icons_is_svg_field("device_types", "svg")).toBe(false);
    expect(yui_icons_is_svg_field(ICONS_TOPIC, "id")).toBe(false);
});

/*
 *  The registry. Its DOMParser is a double that answers with the trees
 *  above, keyed by the text it is given.
 */
const TREES = {
    "bolt": BOLT,
    "box": el("svg", {viewBox: "0 0 2 2"}, [el("rect", {width: "2", height: "2"})]),
    "empty": el("svg", {viewBox: "0 0 2 2"}, [])
};

beforeAll(() => {
    globalThis.DOMParser = class {
        parseFromString(text) {
            return {documentElement: TREES[text] || el("parsererror")};
        }
    };
});

function user_css()
{
    let style = document.getElementById("yui-user-icons");
    return style? style.textContent : "";
}

test("the nodes of __icons__ become yi-u- rules, the bad ones left out", () => {
    let n = yui_icons_set_user([
        {id: "bolt", svg: "bolt"},
        {id: "box", svg: "box"},
        {id: "Bad Name", svg: "box"},
        {id: "nothing", svg: "empty"},
        {id: "junk", svg: "<not svg"}
    ]);
    expect(n).toBe(2);
    let css = user_css();
    expect(css).toMatch(/\.yi-u-bolt::before \{/);
    expect(css).toMatch(/\.yi-u-box::before \{/);
    expect(css).not.toMatch(/nothing|junk|Bad/);

    let users = yui_icons_list().filter(icon => icon.user).map(icon => icon.name);
    expect(users).toEqual(["yi-u-bolt", "yi-u-box"]);
});

test("a write puts or takes away one icon", () => {
    yui_icons_set_user([{id: "bolt", svg: "bolt"}]);

    expect(yui_icons_put_user({id: "box", svg: "box"})).toBe(true);
    expect(user_css()).toMatch(/\.yi-u-box::before/);

    /*  An update that broke the drawing takes the old one away.  */
    expect(yui_icons_put_user({id: "box", svg: "empty"})).toBe(false);
    expect(user_css()).not.toMatch(/\.yi-u-box::before/);

    yui_icons_remove_user("bolt");
    expect(user_css()).toBe("");
    expect(yui_icons_list().filter(icon => icon.user)).toEqual([]);
});
