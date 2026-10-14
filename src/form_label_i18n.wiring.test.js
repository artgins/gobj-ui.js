/***********************************************************************
 *          form_label_i18n.wiring.test.js
 *
 *      The label of a field of a C_YUI_FORM is translated by a
 *      CASCADE -- '<topic>.<col>', then '<col>', then the header -- and
 *      re-translated on a language change by the key its node carries
 *      (data-i18n on the <label>, data-i18n-aria-label / -title on the
 *      control). Up to 7.26.34 that key was chosen by asking only the
 *      bare '<col>':
 *
 *        (a) a label translated by '<topic>.<col>' alone carried its own
 *            TRANSLATED text as the key, and never changed language;
 *        (b) one translated by both switched to the bare '<col>' text at
 *            the first language change.
 *
 *      Driven through the real gclass on a document double, switching
 *      the language with i18next and refresh_language(), as an app does.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {describe, test, expect, beforeAll, afterEach, vi} from "vitest";
import {install_dom_double} from "../test/dom_double.js";

install_dom_double();

if(typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class {
        observe() {
        }
        unobserve() {
        }
        disconnect() {
        }
    };
}

/*  No json field here, but the module imports the editor.  */
vi.mock("vanilla-jsoneditor", () => ({
    createJSONEditor: () => ({
        get() {
            return {text: ""};
        },
        set() {
        },
        destroy() {
        },
    }),
}));

const {
    SDATA_END, gclass_create,
    gobj_start_up, gobj_create_yuno, gobj_create_pure_child,
    gobj_start, gobj_read_attr, refresh_language,
} = await import("@yuneta/gobj-js");
const {register_c_yui_form} = await import("./c_yui_form.js");

let i18next = null;
let yuno = null;
let seq = 0;

beforeAll(async () => {
    i18next = (await import("i18next")).default;
    await i18next.init({
        lng: "en",
        resources: {
            en: {translation: {
                "devices.alias": "Device alias",
                "groups.title":  "Group title",
                "title":         "Title"
            }},
            es: {translation: {
                "devices.alias": "Alias del equipo",
                "groups.title":  "Título del grupo",
                "title":         "Título"
            }}
        }
    });
    gobj_start_up(null, null, null, null, null, null, null);
    gclass_create("C_TEST_LABEL_HOST", [], [["ST_IDLE", []]], {}, 0, [SDATA_END()], {}, 0, 0, 0, 0);
    gclass_create(
        "C_TEST_LABEL_APP",
        [["EV_RECORD_CHANGED", 0]],
        [["ST_IDLE", [["EV_RECORD_CHANGED", () => 0, null]]]],
        {}, 0, [SDATA_END()], {}, 0, 0, 0, 0
    );
    register_c_yui_form();
    yuno = gobj_create_yuno("form_label_yuno", "C_TEST_LABEL_HOST", {});
    gobj_start(yuno);
});

afterEach(async () => {
    await i18next.changeLanguage("en");
});

/*  A form of `topic` with one writable column `col`, built in English.  */
function build(topic, col)
{
    const app = gobj_create_pure_child(`lapp${++seq}`, "C_TEST_LABEL_APP", {}, yuno);
    gobj_start(app);
    const form = gobj_create_pure_child(`lform${seq}`, "C_YUI_FORM", {
        template: [
            {id: "id", header: "id", type: "string", flag: ["persistent", "required"]},
            {id: col, header: col, type: "string", flag: ["persistent", "writable"]},
        ],
        topic_name: topic,
        record: {id: "a", [col]: "x"},
        render_mode: "edit",
        editable: true,
    }, app);
    gobj_start(form);
    const $c = gobj_read_attr(form, "$container");
    const $label = $c.querySelector(`label[for="${col}"]`);
    const $input = $c.querySelector(`input[name="${col}"]`);
    expect(!!$label).toBe(true);
    expect(!!$input).toBe(true);
    return {$c, $label, $input};
}

/*  What an app does on a language change.  */
async function switch_to_spanish($c)
{
    await i18next.changeLanguage("es");
    refresh_language($c, i18next.t.bind(i18next));
}

/*  The text refresh_language() writes into a node that carries
 *  data-i18n: t(<that key>). Asked directly, because the document
 *  double's text nodes have no `nodeValue`, which is what it writes
 *  (the attributes -- aria-label, title -- it rewrites in the double
 *  too, and those are read from the control).  */
function retranslated($el)
{
    return i18next.t($el.getAttribute("data-i18n"));
}

describe("the label of a field changes language by the key that translated it", () => {
    test("(a) translated by '<topic>.<col>' alone", async () => {
        const {$c, $label, $input} = build("devices", "alias");
        expect($label.textContent).toBe("Device alias");
        expect($label.getAttribute("data-i18n")).toBe("devices.alias");
        expect($input.getAttribute("data-i18n-aria-label")).toBe("devices.alias");

        await switch_to_spanish($c);
        expect(retranslated($label)).toBe("Alias del equipo");
        expect($input.getAttribute("aria-label")).toBe("Alias del equipo");
        expect($input.getAttribute("title")).toBe("Alias del equipo");
    });

    test("(b) translated by '<topic>.<col>' and by '<col>': the topic's wins, before and after", async () => {
        const {$c, $label, $input} = build("groups", "title");
        expect($label.textContent).toBe("Group title");
        expect($label.getAttribute("data-i18n")).toBe("groups.title");

        await switch_to_spanish($c);
        expect(retranslated($label)).toBe("Título del grupo");
        expect($input.getAttribute("aria-label")).toBe("Título del grupo");
    });

    test("translated by '<col>' alone, as before", async () => {
        const {$c, $label} = build("other", "title");
        expect($label.textContent).toBe("Title");
        expect($label.getAttribute("data-i18n")).toBe("title");

        await switch_to_spanish($c);
        expect(retranslated($label)).toBe("Título");
    });

    test("translated by nothing: the header, as before", () => {
        const {$label} = build("other", "zone");
        expect($label.textContent).toBe("zone");
        expect($label.getAttribute("data-i18n")).toBe("zone");
    });
});
