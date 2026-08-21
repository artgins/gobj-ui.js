/***********************************************************************
 *          nodes_answer.js
 *
 *      What the `nodes` command answered, whatever shape it came in.
 *
 *      A treedb lives in memory on the backend, so walking it is not
 *      what costs: serializing every node, pushing it through a
 *      websocket and parsing it here is. So `nodes` learned to answer a
 *      PAGE, with the contract `list-keys` of C_TRANGER already used:
 *
 *          no `limit`  ->  the plain list it has always answered
 *          a `limit`   ->  {total_rows, pages, data}
 *
 *      Both shapes are alive at once and will be for a long time: the
 *      SPA talks to backends the operator configures, and an older one
 *      answers the plain list whatever this app asks for. So the shape
 *      is read, never assumed — a view that indexed `data` as an array
 *      would render an object's keys as rows the day a backend
 *      upgraded, which is the kind of break that looks like a bug in
 *      the app.
 *
 *      Pure and tested, because this is exactly the sort of thing that
 *      cannot be exercised until the other side moves.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/

/***************************************************************
 *  nodes_answer(data) -> {rows, total, pages, paged}
 *
 *  `rows` is always an array, so a caller never has to ask which
 *  shape it got. `paged` says whether the backend answered a page,
 *  which is the one thing a caller may legitimately care about (it is
 *  what tells a pager it has something to page).
 ***************************************************************/
function nodes_answer(data)
{
    if(Array.isArray(data)) {
        return {
            rows:  data,
            total: data.length,
            pages: 1,
            paged: false
        };
    }

    if(data && typeof data === "object" && Array.isArray(data.data)) {
        let rows = data.data;
        let total = (typeof data.total_rows === "number")? data.total_rows : rows.length;
        let pages = (typeof data.pages === "number" && data.pages > 0)? data.pages : 1;
        return {
            rows:  rows,
            total: total,
            pages: pages,
            paged: true
        };
    }

    /*  Anything else — null, an error body, a shape nobody has seen — is
     *  no rows. The caller renders an empty table, which is honest, and
     *  the command answer's own `result` is what says something failed. */
    return {
        rows:  [],
        total: 0,
        pages: 1,
        paged: false
    };
}


export {nodes_answer};
