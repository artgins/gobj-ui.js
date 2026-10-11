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

/************************************************************
 *  A Tabulator `titleFormatter` that shows the column title as text.
 *
 *  Tabulator puts a STRING title in with innerHTML, so a title taken
 *  from a schema (`header`, which the schema editor writes) is markup
 *  unless the column carries a formatter that returns a Node.
 ************************************************************/
export function text_title_formatter(cell)
{
    return text_node(cell.getValue());
}

/************************************************************
 *  A Tabulator `itemFormatter` for a `list` editor or header filter
 *  that shows each item's label as text.
 *
 *  Tabulator appends what an itemFormatter returns only when it is an
 *  HTMLElement (a Text node would be innerHTML'd as "[object Text]"),
 *  and it puts a bare label in with innerHTML. A label taken from a
 *  schema (`enum_list`) is data, so it goes in a span, as text.
 ************************************************************/
export function text_list_item_formatter(label)
{
    const span = document.createElement("span");
    span.textContent = (label === null || label === undefined) ? "" : String(label);
    return span;
}
