/***********************************************************************
 *          demo_lead.js
 *
 *      The explanatory paragraph every chapter carries, and what it
 *      becomes on a phone.
 *
 *      These leads are three or four lines of prose.  On a desktop they
 *      cost nothing; on a 360px screen they push the thing the chapter
 *      is actually demonstrating below the fold — the reader scrolls
 *      past an explanation to reach what it explains.
 *
 *      So: shown inline from tablet up, and behind an ⓘ button on
 *      mobile.  The BUTTON carries the i18n KEY, not the translated
 *      text, so the dialog it opens translates at open time and follows
 *      a language change like everything else.
 *
 *      There is no click handler here on purpose.  The affordance is
 *      app chrome, not a per-chapter behaviour: ONE owner (C_DEMO)
 *      delegates the click and opens the dialog, so ten wrappers stay
 *      free of an event, an action and a state apiece.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/

/*  Delegated by C_DEMO; the key(s) travel in a data- attribute because a
 *  kw must be plain JSON and a DOM node is not. */
export const LEAD_INFO_CLASS = "DEMO_LEAD_INFO";

/************************************************************
 *  createElement2 descriptors for a chapter's lead.
 *
 *  `lead` is an i18n key, or an array of them for a paragraph
 *  built from several translatable halves.  Returns an ARRAY of
 *  descriptors — spread it where the paragraph used to be.
 ************************************************************/
export function lead_block(lead, extra_class)
{
    let keys = Array.isArray(lead) ? lead.filter(Boolean) : (lead ? [lead] : []);

    if(!keys.length) {
        return [];
    }

    let paragraph = ["p", {
        class: `DEMO_LEAD content is-hidden-mobile ${extra_class || ""}`.trim(),
        style: "max-width:70ch;"
    }, keys.map((k, i) => ["span", {
        class: i ? "ml-1" : "",
        i18n: k
    }, k])];

    let button = ["button", {
        class: `button is-small is-ghost ${LEAD_INFO_CLASS} is-hidden-tablet`,
        "data-lead": keys.join(""),
        title: "what is this chapter about",
        "data-i18n-title": "what is this chapter about",
        "aria-label": "what is this chapter about",
        "data-i18n-aria-label": "what is this chapter about"
    }, [
        ["span", {class: "icon"}, ["i", {class: "yi-circle-info", "aria-hidden": "true"}]],
        ["span", {i18n: "about this chapter"}, "about this chapter"]
    ]];

    return [paragraph, button];
}

/************************************************************
 *  The keys a clicked ⓘ button carries, in order.
 ************************************************************/
export function lead_keys_of($button)
{
    let raw = $button ? ($button.getAttribute("data-lead") || "") : "";
    return raw.split("").filter((k) => k.length > 0);
}
