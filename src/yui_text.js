/***********************************************************************
 *          yui_text.js
 *
 *      DATA as text for createElement2().
 *
 *      createElement2() takes a string content that starts with '<' for
 *      MARKUP and parses it (that is how a component passes an inline
 *      icon). So a value that came from outside -- a backend answer, a
 *      treedb node, a name somebody typed, a frame of the traffic -- must
 *      never go in as a bare string: "<img src=x onerror=...>" would run.
 *      It goes in as a Text node, which is always text.
 *
 *      Trimmed like createElement2() trims a string, so the change of
 *      form does not change what is shown. A Text node under an
 *      `i18n`/`data-i18n` element is still re-translated by
 *      refresh_language(), which sets textContent.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/

/************************************************************
 *  A Text node with `value` as its text ("" for null/undefined).
 ************************************************************/
export function text_node(value)
{
    if(value === null || value === undefined) {
        return document.createTextNode("");
    }
    return document.createTextNode(String(value).trim());
}
