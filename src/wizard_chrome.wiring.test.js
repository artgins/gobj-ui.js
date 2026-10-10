/***********************************************************************
 *          wizard_chrome.wiring.test.js
 *
 *      C_YUI_WIZARD's chrome (title, primary button) is rewritten on
 *      every step change, after the host's one-time refresh_language().
 *      It stamped a bare `i18n` attribute (which refresh_language does
 *      not read) and put the raw key in the text: the title never went
 *      through t(), and on the last step the button read `confirm`
 *      while its `data-i18n` still said `next`, so a language switch
 *      relabelled it "Next".
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {describe, test, expect, beforeAll} from "vitest";
import {install_dom_double} from "../test/dom_double.js";

install_dom_double();

const {
    SDATA_END, gclass_create,
    gobj_start_up, gobj_create_yuno, gobj_create,
    gobj_start, gobj_send_event, gobj_read_attr,
} = await import("@yuneta/gobj-js");
const {register_c_yui_wizard} = await import("./c_yui_wizard.js");

let yuno = null;
let i18next = null;

beforeAll(async () => {
    i18next = (await import("i18next")).default;
    await i18next.init({lng: "en", resources: {
        en: {translation: {"step one": "Step one", "next": "Next", "confirm": "Confirm"}},
        es: {translation: {"step one": "Paso uno", "next": "Siguiente", "confirm": "Confirmar"}},
    }});
    gobj_start_up(null, null, null, null, null, null, null);
    gclass_create("C_TEST_WIZ_HOST", [], [["ST_IDLE", []]], {}, 0, [SDATA_END()], {}, 0, 0, 0, 0);
    gclass_create(
        "C_TEST_WIZ_APP",
        [["EV_STEP_SHOWN", 0], ["EV_WIZARD_DONE", 0]],
        [["ST_IDLE", [
            ["EV_STEP_SHOWN", () => 0, null],
            ["EV_WIZARD_DONE", () => 0, null],
        ]]],
        {}, 0, [SDATA_END()], {}, 0, 0, 0, 0
    );
    register_c_yui_wizard();
    yuno = gobj_create_yuno("wizard_yuno", "C_TEST_WIZ_HOST", {});
    gobj_start(yuno);
});

describe("C_YUI_WIZARD chrome", () => {
    test("title and primary label are translated and keep their key", async () => {
        const app = gobj_create("wapp", "C_TEST_WIZ_APP", {}, yuno);
        const wiz = gobj_create("wiz", "C_YUI_WIZARD", {linear: false}, app);
        gobj_send_event(wiz, "EV_SET_STEPS", {steps: [
            {id: "a", title: "step one", content: ["div", {}, "A"]},
            {id: "b", title: "step one", content: ["div", {}, "B"]},
        ]}, app);

        const $c = gobj_read_attr(wiz, "$container");
        const $title = $c.querySelector(".yui-wizard-title");
        const $primary = $c.querySelector(".yui-wizard-primary");
        const $plabel = $c.querySelector(".yui-wizard-primary-label");

        expect($title.textContent).toBe("Step one");
        expect($title.getAttribute("data-i18n")).toBe("step one");
        expect($plabel.textContent).toBe("Next");

        gobj_send_event(wiz, "EV_NEXT", {}, app);
        expect($plabel.textContent).toBe("Confirm");
        expect($plabel.getAttribute("data-i18n")).toBe("confirm");
        expect($primary.getAttribute("aria-label")).toBe("Confirm");
        expect($primary.getAttribute("data-i18n-aria-label")).toBe("confirm");
        expect($primary.getAttribute("data-i18n-title")).toBe("confirm");

        /*  What refresh_language() reads on a language switch: the key of
         *  the CURRENT label, not the one the button was built with.  */
        await i18next.changeLanguage("es");
        try {
            expect(i18next.t($plabel.getAttribute("data-i18n"))).toBe("Confirmar");
            expect(i18next.t($title.getAttribute("data-i18n"))).toBe("Paso uno");
        } finally {
            await i18next.changeLanguage("en");
        }
    });
});
