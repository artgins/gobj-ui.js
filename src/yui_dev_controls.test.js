/***********************************************************************
 *          yui_dev_controls.test.js
 *
 *          Every control of the Developer window is NAMED, and every
 *          name changes language (nine buttons had a
 *          `title` and no `aria-label` -- simple mach, the three of
 *          Output, the three of Expand, copy and clear).
 *
 *          A button that shows text is named by the key of that text
 *          and described by its title; one that shows only a glyph is
 *          named by its title. And every key the window asks for, or
 *          carries for a language switch, is in YUI_DEV_I18N_KEYS --
 *          the list a consumer's validate-locales reads, because most of
 *          them reach t() by variable and no scan of the source sees
 *          them.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {describe, it, expect, beforeAll} from "vitest";
import {install_dom_double} from "../test/dom_double.js";

let i18next;
let refresh_language;
let build_dev_panel;
let YUI_DEV_I18N_KEYS;
let $panel;

/*  Every key t() was asked for: the English catalog is empty, so each
 *  one is a miss, and i18next reports it.  */
const asked = new Set();

const KEY_ATTRS = ["data-i18n", "data-i18n-title", "data-i18n-aria-label",
                   "data-i18n-placeholder", "data-label"];

beforeAll(async () => {
    install_dom_double();
    const gobj_js = await import("@yuneta/gobj-js");
    refresh_language = gobj_js.refresh_language;
    ({build_dev_panel, YUI_DEV_I18N_KEYS} = await import("./yui_dev.js"));

    /*  The panel hands the yuno its traffic sink, as in an app.  */
    const {SDATA, SDATA_END, data_type_t, gclass_create, gobj_start_up,
           gobj_create_yuno} = gobj_js;
    gobj_start_up(null, null, null, null, null, null, null);
    gclass_create(
        "C_TEST_DEV_YUNO", [], [["ST_IDLE", []]], {}, 0,
        [SDATA(data_type_t.DTP_POINTER, "trace_ievent_callback", 0, null, ""), SDATA_END()],
        {}, 0, 0, 0, 0
    );
    gobj_create_yuno("dev_yuno", "C_TEST_DEV_YUNO", {});

    /*  Spanish is the key with a mark, so a name that did not follow
     *  the switch is told apart from one that did.  */
    const es = {};
    for(const k of YUI_DEV_I18N_KEYS) {
        es[k] = `«${k}»`;
    }
    i18next = (await import("i18next")).default;
    await i18next.init({
        lng: "en", fallbackLng: false,
        saveMissing: true,
        missingKeyHandler: (lngs, ns, key) => {
            asked.add(key);
        },
        resources: {en: {translation: {}}, es: {translation: es}},
    });

    $panel = build_dev_panel().$el;
    document.body.appendChild($panel);
});

function controls()
{
    return $panel.querySelectorAll("button, input, select, textarea");
}

describe("the Developer window's controls", () => {
    it("has the controls this test reads", () => {
        expect(controls().length).toBeGreaterThan(20);
    });

    it("names every control, and every name carries its key", () => {
        const unnamed = [];
        for(const $c of controls()) {
            const title_key = $c.getAttribute("data-i18n-title");
            const aria_key = $c.getAttribute("data-i18n-aria-label");
            if(!title_key || !aria_key || !$c.getAttribute("title") ||
                    !$c.getAttribute("aria-label")) {
                unnamed.push($c.getAttribute("data-i18n") || title_key || $c.tagName);
            }
        }
        expect(unnamed).toEqual([]);
    });

    it("names a button by the text it shows, a glyph by its title", () => {
        const wrong = [];
        for(const $c of $panel.querySelectorAll("button")) {
            const shown = $c.getAttribute("data-i18n");
            const want = shown || $c.getAttribute("data-i18n-title");
            if($c.getAttribute("data-i18n-aria-label") !== want) {
                wrong.push(`${want}: ${$c.getAttribute("data-i18n-aria-label")}`);
            }
        }
        expect(wrong).toEqual([]);
    });

    it("names the nine buttons that had no name", () => {
        const sel = [
            '[data-toggle="automata-simple"]',
            '[data-output="window"]', '[data-output="console"]', '[data-output="both"]',
            '[data-expand="dev_full_schema"]', '[data-expand="dev_full_data"]',
            '[data-expand="dev_full_meta"]',
        ];
        const $nine = sel.map((s) => $panel.querySelector(s));
        for(const label of ["copy", "clear"]) {
            $nine.push([...$panel.querySelectorAll("button")]
                .find(($b) => $b.getAttribute("data-i18n") === label));
        }
        expect($nine.every(Boolean)).toBe(true);
        for(const $b of $nine) {
            const key = $b.getAttribute("data-i18n");
            expect($b.getAttribute("aria-label"), key).toBe(i18next.t(key));
            expect($b.getAttribute("data-i18n-aria-label"), key).toBe(key);
            expect($b.getAttribute("data-i18n-title"), key).toBeTruthy();
        }
        /*  Three chips, three names: their title is one sentence.  */
        const expand = $nine.slice(4, 7).map(($b) => $b.getAttribute("aria-label"));
        expect(new Set(expand).size).toBe(3);
    });

    it("renames every control on a language switch", async () => {
        await i18next.changeLanguage("es");
        try {
            refresh_language($panel, i18next.t);
            const stale = [];
            for(const $c of controls()) {
                const tk = $c.getAttribute("data-i18n-title");
                const ak = $c.getAttribute("data-i18n-aria-label");
                if($c.getAttribute("title") !== `«${tk}»`) {
                    stale.push(`title ${tk}`);
                }
                if($c.getAttribute("aria-label") !== `«${ak}»`) {
                    stale.push(`aria-label ${ak}`);
                }
            }
            expect(stale).toEqual([]);
        } finally {
            await i18next.changeLanguage("en");
            refresh_language($panel, i18next.t);
        }
    });

    it("publishes every key it asks for or carries", () => {
        const published = new Set(YUI_DEV_I18N_KEYS);
        const carried = new Set();
        const walk = ($n) => {
            for(const a of KEY_ATTRS) {
                const k = $n.getAttribute(a);
                if(k) {
                    carried.add(k);
                }
            }
            for(const $c of $n.children) {
                walk($c);
            }
        };
        walk($panel);
        expect(asked.size).toBeGreaterThan(20);
        const missing = [...new Set([...asked, ...carried])]
            .filter((k) => !published.has(k)).sort();
        expect(missing).toEqual([]);
    });
});
