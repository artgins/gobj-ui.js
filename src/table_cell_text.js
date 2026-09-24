/****************************************************************************
 *          table_cell_text.js
 *
 *          What a treedb table cell hands Tabulator.
 *
 *          Tabulator assigns a formatter's STRING result with `innerHTML`
 *          (only its own `plaintext` formatter escapes), so a record's text
 *          returned as a string is parsed as markup: `a<b and c>d` showed
 *          as `ad`, and a field holding `<img src=x onerror=...>` ran it in
 *          the operator's browser. Record
 *          data goes in as a TEXT NODE, and a cell built around it as DOM,
 *          never as an HTML string with the data interpolated.
 *
 *          Pure but for the `document` it is handed, so it is tested
 *          without one.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ****************************************************************************/

/************************************************************
 *  A value shown as text, whatever characters it holds
 ************************************************************/
function cell_text(value, doc = globalThis.document)
{
    if(value === null || value === undefined) {
        return "";
    }
    return doc.createTextNode(String(value));
}

/************************************************************
 *  The hook cell, as a createElement2 spec: the row id is an
 *  attribute VALUE, never text spliced into markup (an id holding
 *  a `"` cut the attribute and lost the rest of the id)
 ************************************************************/
function hook_cell_spec(row_id, col_id, items, title, title_key)
{
    return ['a', {
        class: 'HOOK_CELL hook_cell',
        title: title,
        'data-i18n-title': title_key,
        'aria-label': title,
        'data-i18n-aria-label': title_key,
        'data-row_id': String(row_id),
        'data-col_id': String(col_id)
    }, [
        ['span', {class: 'icon yi-eye'}],
        ['u', {class: 'HOOK_CELL_COUNT'}, `[ ${items} ]`]
    ]];
}

export {cell_text, hook_cell_spec};
