/***********************************************************************
 *          yui_toolbar_icon.js
 *
 *      The one size of the glyphs of a row of controls, and the
 *      `<i>` that draws one at it.
 *
 *      A module of its own, with no key and no CSS, so that a view
 *      can take the size without taking the toolbar widget. In
 *      7.32.7 C_YUI_NAV imported it from yui_toolbar.js, and every
 *      app that mounts a nav had to define the keys of the toolbar's
 *      scroll arrows ("scroll left", "scroll right"), which
 *      validate-locales reads in every module the app imports.
 *      yui_toolbar.js exports the two names too, as before.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/

/************************************************************
 *  ONE size for every glyph of a view's toolbar, in `rem`.
 *
 *  It lives here because it belongs to the TOOLBAR and not to
 *  any one view: it was born in the graph rows (7.23.86) and the
 *  JSON viewer beside them still drew 16px, which is the same
 *  drift one level up.
 *
 *  `rem` and not `em` is the whole lesson: `em` is measured
 *  against the button, so one declaration draws three icons --
 *  `1.5em` is 24px in a plain button, 18px in an `is-small`
 *  chip, and a labelled button that declares nothing keeps the
 *  inherited 16px. `rem` is measured against the page, so a
 *  chip deliberately shorter than a button still carries the
 *  same glyph.
 *
 *  20px against a row's 16px text: an icon-only button is
 *  legible at half its 40px height, and beside a label the
 *  glyph reads as a marker rather than as a second word. The
 *  app BAR is a different band and keeps its own, bigger size
 *  (`.yui-toolbar-item .icon`, 1.35rem on 44px items).
 *
 *  It is also the size of the glyphs of the TABS and of the
 *  MENU entries (C_YUI_NAV, the topic tabs of
 *  C_YUI_TREEDB_TOPICS), and of the paginator of a table on a
 *  phone (tabulator.css). Up to 7.32.6 a tab took the 16px of
 *  its text, and right under a toolbar its icons read as
 *  smaller than the toolbar's. The rows of a tab or a menu
 *  entry are 24px of line, so the glyph changes no height.
 ************************************************************/
const YUI_TOOLBAR_ICON_SIZE = "1.25rem";

/*  The `<i>` spec of a toolbar glyph, at that one size. The
 *  glyph is decoration: the control around it carries the name.  */
function yui_toolbar_icon(icon_class, extra_style)
{
    return ['i', {
        class: icon_class,
        'aria-hidden': 'true',
        style: `font-size:${YUI_TOOLBAR_ICON_SIZE}; line-height:1; color:inherit;` +
               (extra_style || ''),
    }];
}

export {yui_toolbar_icon, YUI_TOOLBAR_ICON_SIZE};
