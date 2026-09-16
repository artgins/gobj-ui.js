/***********************************************************************
 *          yui_row_search.js
 *
 *      IS THIS TERM IN THIS ROW?
 *
 *      The search box of a treedb table looked at the row's values with
 *      `String(val)`, and a treedb row is not flat: an fkey arrives as a
 *      LIST OF OBJECTS `[{id, topic_name, hook_name}]`, and `String()`
 *      of that is `"[object Object]"`.  So looking for the workshop of
 *      a device -- which is where the datum an operator has in mind
 *      lives -- never found anything, and the box gave no hint that it
 *      had looked somewhere else.
 *
 *      THREE RULES, AND THE LAST TWO ARE WHAT MAKE IT USEFUL:
 *
 *      - It walks down lists and objects to a short depth: an fkey is
 *        two levels down and nothing anybody searches for is deeper.
 *      - **Of an fkey only the `id` is looked at.**  `topic_name` and
 *        `hook_name` are the SAME two words on every row, so looking at
 *        them turns the term into a wildcard: searching "devices" would
 *        bring the whole topic.  The `id` is the only thing that names
 *        the linked thing.
 *      - **A hook read as its COUNT is not looked at at all.**  Since
 *        `hook_size` (7.23.163) a topic table loads a hook as
 *        `[{"size": N}]` instead of the id of every child, and that
 *        number is not a value of the row: matching it made "5" answer
 *        every row whose hook happens to hold 5 children, next to the
 *        rows that really say 5.  A count nobody can see in the cell as
 *        text is not what a person typing in a search box is after.
 *
 *      Keys that start with `_` are not looked at on any level: they
 *      belong to the scaffolding (`_check_box_state_`, `_operation`) or
 *      are metadata (`__md_treedb__`), and nobody searches by them.
 *
 *          Copyright (c) 2024-2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/

const MAX_DEPTH = 4;


/***************************************************************
 *  An fkey, as `nodes` answers it with `list_dict`.
 ***************************************************************/
function is_fkey_ref(value)
{
    return !!value
        && typeof value === "object"
        && !Array.isArray(value)
        && ("id" in value)
        && ("topic_name" in value)
        && ("hook_name" in value);
}


/***************************************************************
 *  A hook read with `hook_size`: the COUNT of its children,
 *  `[{"size": N}]`, in the place of the children themselves.
 *  The same shape `delete_impact`'s `ref_count()` reads.
 ***************************************************************/
function is_hook_size(value)
{
    if(!Array.isArray(value) || value.length !== 1) {
        return false;
    }
    const first = value[0];
    return !!first
        && typeof first === "object"
        && !Array.isArray(first)
        && typeof first.size === "number"
        && Object.keys(first).length === 1;
}


/***************************************************************
 *  Does `value` hold the term? The term comes ALREADY in lower
 *  case: whoever searches lowers it once, not once per cell.
 ***************************************************************/
function value_matches(value, term, depth)
{
    if(value === null || value === undefined) {
        return false;
    }
    if(depth > MAX_DEPTH) {
        return false;
    }
    if(is_hook_size(value)) {
        return false;
    }
    if(Array.isArray(value)) {
        return value.some((v) => value_matches(v, term, depth + 1));
    }
    if(typeof value === "object") {
        if(is_fkey_ref(value)) {
            return value_matches(value.id, term, depth + 1);
        }
        return Object.entries(value).some(([key, v]) => {
            if(key.startsWith("_")) {
                return false;
            }
            return value_matches(v, term, depth + 1);
        });
    }
    return String(value).toLowerCase().includes(term);
}


/***************************************************************
 *  Is the term anywhere in this row?
 ***************************************************************/
function row_matches(row, term)
{
    if(!row || typeof row !== "object" || !term) {
        return false;
    }
    return Object.entries(row).some(([key, value]) => {
        if(key.startsWith("_")) {
            return false;
        }
        return value_matches(value, term, 0);
    });
}


export {row_matches, value_matches, is_fkey_ref, is_hook_size};
