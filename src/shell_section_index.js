/***********************************************************************
 *          shell_section_index.js
 *
 *      Pure helper for C_YUI_SHELL: synthesize the stage target of a
 *      section-index landing route.
 *
 *      A level-1 menu item that declares `submenu.index` opts out of
 *      the redirect-to-default-child behaviour: its own route becomes
 *      a real resting, deep-linkable route whose view is the submenu
 *      itself rendered as a "cards" C_YUI_NAV (the shell's view
 *      contract only requires a $container by the end of mt_create,
 *      which C_YUI_NAV already satisfies).  Config:
 *
 *          "submenu": {
 *              "render": { "top-sub": "tabs" },
 *              "index":  true            — landing in stage "main"
 *              "index":  {"stage": "x"}  — landing in stage "x"
 *          }
 *
 *      Precedence: an explicit inline `target` on the item wins (this
 *      helper returns null then).  When the target is synthesized,
 *      `submenu.default` becomes inert for the section: navigate_to()
 *      only redirects to the default child while the entry has NO
 *      target.
 *
 *      Split out of c_yui_shell.js so it can be unit-tested without
 *      a DOM.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/

/************************************************************
 *  Return the synthesized target for `item`'s section route,
 *  or null when the item doesn't opt in.
 ************************************************************/
export function section_index_target(menu_id, item)
{
    if(!item || !item.route || item.target) {
        return null;
    }
    let sub = item.submenu;
    if(!sub || !Array.isArray(sub.items) || !sub.index) {
        return null;
    }
    let index_cfg = (typeof sub.index === "object") ? sub.index : {};
    return {
        stage: index_cfg.stage || "main",
        gclass: "C_YUI_NAV",
        kw: {
            menu_id: `index.${menu_id}.${item.id}`,
            nav_label: item.name || item.id || "",
            menu_items: sub.items,
            layout: "cards",
            level: "secondary"
        }
    };
}
