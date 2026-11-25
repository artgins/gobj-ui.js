/***********************************************************************
 *          yui_icons.test.js
 *
 *      The icon set (yui_icons.css): every icon is 1em TALL. The box of
 *      a glyph wider than tall is as wide as the glyph, so that
 *      `mask-size: contain` never draws it smaller than the others.
 *      And the masks a widget needs without a class (the paginator)
 *      are custom properties that the classes read too.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {test, expect} from "vitest";
import fs from "node:fs";

const CSS = fs.readFileSync(new URL("./yui_icons.css", import.meta.url), "utf8");

/*  {name: [width, height]} of every icon drawn with a viewBox.  */
function icons()
{
    let out = {};
    let re = /\n\.(yi-[a-z0-9-]+)::before \{\n([^}]*)\}/g;
    let m;
    while((m = re.exec(CSS)) !== null) {
        let body = m[2];
        let vb = /viewBox='([-\d. ]+)'/.exec(body);
        if(!vb) {
            continue;
        }
        let [, , w, h] = vb[1].trim().split(/\s+/).map(Number);
        out[m[1]] = [w, h];
    }
    return out;
}

/*  The masks given by custom property: {name: viewBox [w, h]}.  */
function properties()
{
    let out = {};
    let re = /\n {4}--(yi-[a-z0-9-]+): url\("[^"]*viewBox='([-\d. ]+)'/g;
    let m;
    while((m = re.exec(CSS)) !== null) {
        let [, , w, h] = m[2].trim().split(/\s+/).map(Number);
        out[m[1]] = [w, h];
    }
    return out;
}

/*  {name: width} from the rules that set only a width.  */
function widths()
{
    let out = {};
    let re = /((?:\.yi-[a-z0-9-]+::before,?\s*)+)\{\s*width: ([\d.]+)em;\s*\}/g;
    let m;
    while((m = re.exec(CSS)) !== null) {
        for(const name of m[1].match(/yi-[a-z0-9-]+/g)) {
            out[name] = Number(m[2]);
        }
    }
    return out;
}

test("the set is read: icons, and the box of the wide ones", () => {
    expect(Object.keys(icons()).length).toBeGreaterThan(100);
    expect(Object.keys(widths()).length).toBeGreaterThan(20);
});

test("every glyph wider than tall has a box as wide as it is", () => {
    let all = {...icons(), ...properties()};
    let w = widths();
    let wrong = [];
    for(const [name, [vw, vh]] of Object.entries(all)) {
        let want = vw > vh ? vw / vh : undefined;
        if(w[name] !== want) {
            wrong.push(`${name}: viewBox ${vw}x${vh}, width ${w[name] ?? "1 (the base)"}, ` +
                       `wants ${want ?? "1 (the base)"}`);
        }
    }
    expect(wrong).toEqual([]);
});

test("a width rule names icons that exist", () => {
    let all = {...icons(), ...properties()};
    let unknown = Object.keys(widths()).filter((name) => !all[name]);
    expect(unknown).toEqual([]);
});

test("the paginator's masks are properties, and their classes read them", () => {
    for(const name of ["yi-backward-step", "yi-chevron-left", "yi-chevron-right", "yi-forward-step"]) {
        expect(properties()[name]).toBeDefined();
        let rule = new RegExp(`\\n\\.${name}::before \\{\\n {4}-webkit-mask-image: var\\(--${name}\\);` +
                              `\\n {4}mask-image: var\\(--${name}\\);\\n\\}`);
        expect(CSS).toMatch(rule);
    }
});
