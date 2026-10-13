/***********************************************************************
 *          treedb_column_title.wiring.test.js
 *
 *      The header of a column of C_YUI_TREEDB_TOPIC_WITH_FORM is
 *      translated by a CASCADE -- '<topic>.<col>', then '<col>', then
 *      the schema's header -- and carries the key a language change
 *      re-translates it by (data-i18n). Up to 7.26.34 that key was
 *      always the bare '<col>', whatever key had translated it:
 *
 *        (a) a header translated by '<topic>.<col>' alone carried no
 *            key, and stayed in its language;
 *        (b) one translated by both went to the bare column's text.
 *
 *      The apps with a shell did not show it: the view rebuilds its
 *      columns on EV_LANGUAGE_CHANGED, after refresh_language(), and
 *      the formatter runs the cascade again. A refresh_language() alone
 *      did. The twin of C_YUI_FORM's field labels
 *      (form_label_i18n.wiring.test.js).
 *
 *      The real gclass on a document double, with a Tabulator double
 *      that keeps the columns it was built with.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {describe, test, expect, beforeAll, afterEach, vi} from "vitest";
import {install_dom_double} from "../test/dom_double.js";

install_dom_double();

if(typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    };
}

const tables = vi.hoisted(() => []);
vi.mock("tabulator-tables", () => {
    class FakeTabulator {
        constructor($el, settings) {
            this.element = $el;
            this.options = settings;
            this.externalEvents = {events: {}};
            tables.push(this);
            return new Proxy(this, {
                get(target, prop) {
                    if(prop in target) {
                        return target[prop];
                    }
                    return () => [];
                }
            });
        }
        on(ev, fn) {
            (this.externalEvents.events[ev] = this.externalEvents.events[ev] || []).push(fn);
        }
        off(ev) {
            delete this.externalEvents.events[ev];
        }
        destroy() {}
    }
    return {TabulatorFull: FakeTabulator, Tabulator: FakeTabulator};
});

const {
    SDATA_END, gclass_create,
    gobj_start_up, gobj_create_yuno, gobj_create_service, gobj_start,
} = await import("@yuneta/gobj-js");
const {register_c_yui_treedb_topic_with_form} = await import("./c_yui_treedb_topic_with_form.js");

let i18next = null;
let yuno = null;
let seq = 0;

beforeAll(async () => {
    i18next = (await import("i18next")).default;
    await i18next.init({
        lng: "en",
        resources: {
            en: {translation: {
                "users.alias": "User alias",                        // (a)
                "users.title": "User title", "title": "Title",      // (b)
                "email": "E-mail"                                   // the column alone
            }},
            es: {translation: {
                "users.alias": "Alias del usuario",
                "users.title": "Título del usuario", "title": "Título",
                "email": "Correo"
            }}
        }
    });
    gobj_start_up(null, null, null, null, null, null, null);
    gclass_create("C_TEST_TITLE_HOST", [], [["ST_IDLE", []]], {}, 0, [SDATA_END()], {}, 0, 0, 0, 0);
    register_c_yui_treedb_topic_with_form();
    yuno = gobj_create_yuno("column_title_yuno", "C_TEST_TITLE_HOST", {});
    gobj_start(yuno);
});

afterEach(async () => {
    tables.length = 0;
    await i18next.changeLanguage("en");
});

/*  The header a column draws, as Tabulator asks its formatter.  */
function header_of(field)
{
    const view = gobj_create_service(`title_view${++seq}`, "C_YUI_TREEDB_TOPIC_WITH_FORM", {
        treedb_name: "treedb_test",
        topic_name: "users",
        desc: {id: "users", pkey: "id", cols: [
            {id: "id", header: "Id", type: "string", flag: ["persistent", "required"]},
            {id: field, header: field, type: "string", flag: ["persistent"]}
        ]}
    }, yuno);
    gobj_start(view);
    const col = tables[tables.length - 1].options.columns.find((c) => c.field === field);
    expect(typeof col.titleFormatter).toBe("function");
    return col.titleFormatter({});
}

describe("the header of a column changes language by the key that translated it", () => {
    test("(a) translated by '<topic>.<col>' alone", async () => {
        const $h = header_of("alias");
        expect($h.textContent).toBe("User alias");
        expect($h.getAttribute("data-i18n")).toBe("users.alias");
        await i18next.changeLanguage("es");
        expect(i18next.t($h.getAttribute("data-i18n"))).toBe("Alias del usuario");
    });

    test("(b) translated by both: the topic's key, before and after", async () => {
        const $h = header_of("title");
        expect($h.textContent).toBe("User title");
        expect($h.getAttribute("data-i18n")).toBe("users.title");
        await i18next.changeLanguage("es");
        expect(i18next.t($h.getAttribute("data-i18n"))).toBe("Título del usuario");
    });

    test("translated by '<col>' alone, as before", () => {
        const $h = header_of("email");
        expect($h.textContent).toBe("E-mail");
        expect($h.getAttribute("data-i18n")).toBe("email");
    });

    test("translated by nothing: the schema's header, with no key, as before", () => {
        const $h = header_of("zone");
        expect($h.textContent).toBe("zone");
        expect($h.getAttribute("data-i18n")).toBe(null);
    });
});
