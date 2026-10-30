/***********************************************************************
 *          yui_selector.js
 *
 *      A NAME IS DATA, NOT A SELECTOR.
 *
 *      A gobj name, a topic, a route, a key: any of them may hold a
 *      character that means something to CSS. Pasted into a selector,
 *      it changes what the selector says or breaks it:
 *
 *        - `~ + > space` are combinators: `#a~b` is "a b after an #a",
 *          and the lookup answers null;
 *        - `.` `#` `:` `[` start another simple selector: `#a.b` is the
 *          element #a with the class b;
 *        - `%` `^` `"` `\` and the rest make it INVALID: querySelector
 *          THROWS a SyntaxError, out of whatever action was running.
 *
 *      The gobj tree found its canvas with
 *      `querySelector("#" + id)`, and gui_agent named the window
 *      `node~key` -- every open logged "no canvas mount" and the
 *      canvas never resized; a `^` in the key (`%5E`) threw out of
 *      mt_start and left an orphan window behind it.
 *
 *      So data reaches a selector in one of two ways only:
 *
 *        find_by_id($root, id)   the element below $root whose id is
 *                                `id` -- no selector is built at all.
 *                                It works in a tree that is not in the
 *                                document yet, where getElementById()
 *                                answers null.
 *
 *        css_string(value)       the value written inside a DOUBLE
 *                                quoted CSS string, for an attribute
 *                                selector:
 *                                  '[data-x="' + css_string(v) + '"]'
 *
 *      `CSS.escape()` is not used: it does not exist in node, where the
 *      wiring tests run, and inside a quoted string only the quote, the
 *      backslash and the control characters have to be escaped.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/

/************************************************************
 *  The element below `$root` (not `$root` itself, as with
 *  querySelector) whose id is exactly `id`, or null.
 ************************************************************/
export function find_by_id($root, id)
{
    if(!$root || typeof $root.querySelectorAll !== "function") {
        return null;
    }
    if(id === null || id === undefined || id === "") {
        return null;
    }
    let wanted = String(id);
    for(let $el of $root.querySelectorAll("[id]")) {
        if($el.id === wanted) {
            return $el;
        }
    }
    return null;
}

/************************************************************
 *  `value` as the body of a double-quoted CSS string.
 *
 *  The quote and the backslash take a backslash; a control
 *  character (a newline ends a CSS string, it is a parse
 *  error inside one) is written as its hex escape, which a
 *  space ends so the next character is never read as hex.
 ************************************************************/
export function css_string(value)
{
    return String(value)
        .replace(/[\\"]/g, "\\$&")
        .replace(/[\u0000-\u001f\u007f]/g,
            (c) => "\\" + c.charCodeAt(0).toString(16) + " ");
}
