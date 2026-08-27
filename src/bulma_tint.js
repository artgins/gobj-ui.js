/***********************************************************************
 *          bulma_tint.js
 *
 *      Bulma's "soften this colour" modifier, applied so that it cannot
 *      be applied alone.
 *
 *      WHY THIS IS A FUNCTION AND NOT A STRING.  'light' is one of
 *      Bulma's colours, so `is-light` is BOTH a colour and the modifier
 *      that softens another one.  A compound selector may match the same
 *      class twice, so `.tag.is-light.is-light` matches an element that
 *      carries the class ONCE -- and that rule sets the text to
 *      var(--bulma-light-light-invert-l), WHICH BULMA NEVER DEFINES:
 *      referenced four times in bulma.css, declared zero times.  The
 *      colour declaration is then invalid while the background still
 *      resolves, so what is left on screen is a pill with no readable
 *      label.
 *
 *      Two selectors of Bulma 1 reach that undefined variable:
 *
 *          .tag.is-light.is-light
 *          .notification.is-light.is-light
 *
 *      It cost three unreadable chips in the schema editor -- the topic
 *      count, the schema version, and every column flag with no colour of
 *      its own ('writable', 'image', 'wild'...).  They read as empty
 *      pills, which looks like a bug in the DATA and is a missing CSS
 *      variable.
 *
 *      The neutral chip is a bare element with no modifier at all: it
 *      takes --bulma-background-l and --bulma-text-l, follows the theme
 *      and stays legible in both.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/

/*
 *  Bulma's colours, minus 'light' -- which is exactly the one that must
 *  never be softened with itself.
 */
const TINTABLE = [
    "primary", "link", "info", "success", "warning",
    "danger", "black", "dark", "white", "text", "ghost"
];

/***************************************************************
 *  A softened colour, or nothing.
 *
 *      yui_tint("warning")     -> "is-warning is-light"
 *      yui_tint("is-warning")  -> "is-warning is-light"
 *      yui_tint("light")       -> ""     (there is nothing to soften)
 *      yui_tint("")            -> ""
 *      yui_tint(undefined)     -> ""
 *
 *  Anything it does not recognise comes back empty rather than being
 *  passed through: a class this function cannot vouch for is exactly the
 *  case it exists to stop.
 ***************************************************************/
function yui_tint(colour)
{
    if(typeof colour !== "string") {
        return "";
    }
    const name = colour.trim().replace(/^is-/, "");
    if(TINTABLE.indexOf(name) < 0) {
        return "";
    }
    return `is-${name} is-light`;
}

export {yui_tint, TINTABLE};
