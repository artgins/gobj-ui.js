/***********************************************************************
 *          yui_data_color.js
 *
 *      A colour read from DATA, checked before it goes into markup.
 *
 *      A card of the treedb graph is html, and the colour a user gave it
 *      (a `__graphs__` record) is written into its `style="..."`. A value
 *      like `red" onmouseover="...` would leave the attribute and run.
 *      Only the plain colour syntaxes pass -- hex, the rgb()/hsl()
 *      functions, a name -- and the browser, where it can, also checks
 *      that it is a colour.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/

const DATA_COLOR_RE = /^(#[0-9a-f]{3,8}|(rgb|rgba|hsl|hsla)\([0-9.,%\s/+-]+\)|[a-z]+)$/i;

/************************************************************
 *  `value` when it is a css colour, else null.
 ************************************************************/
export function css_color_or_null(value)
{
    if(typeof value !== "string" || !DATA_COLOR_RE.test(value)) {
        return null;
    }
    if(typeof CSS !== "undefined" && CSS && typeof CSS.supports === "function") {
        if(!CSS.supports("color", value)) {
            return null;
        }
    }
    return value;
}
