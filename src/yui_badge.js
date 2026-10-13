/***********************************************************************
 *          yui_badge.js
 *
 *      The BADGE: the little count a control carries -- unread
 *      notifications, active alarms.  The toolbar items of C_YUI_SHELL
 *      and the menu items of C_YUI_NAV build and paint theirs here, so
 *      the two follow the same rules and cannot drift apart:
 *
 *      EMPTY IS 0, "" AND null ALIKE (false and undefined too): a badge
 *      reading "0" is worse than no badge -- it draws the eye to say
 *      nothing.  A count is only worth a pixel when there IS something.
 *
 *      CAPPED AT 99+: a badge sits in a row of fixed width (the app bar,
 *      a bottom icon bar), and a four digit pill pushes the items next
 *      to it off a phone screen.  A string passes through, for the
 *      states that are not counts ("!", "…").
 *
 *      ALWAYS RENDERED, hidden when empty, so the runtime setters have a
 *      node to write into and never rebuild the control that holds it.
 *
 *      PART OF THE CONTROL'S NAME (name_control_with_badge()).  The
 *      control carries an explicit aria-label, and an explicit label
 *      REPLACES the element's content for a screen reader -- so a badge
 *      inside it is silent, and inside a <button> (the toolbar, an
 *      accordion head) its children are not even in the tree.  The
 *      control is labelled by ITSELF (its aria-label, which
 *      refresh_language() re-translates) and by the badge: the name is
 *      "Alarms 3" while there is a count, "Alarms" while there is none,
 *      with nothing composed in javascript that a language switch would
 *      leave behind.
 *
 *      NOT a live region any more.  Up to 7.26.34 the badge was its own
 *      role="status", and that said "3" with no word of what has three;
 *      hidden while empty, it was not in the tree when the first count
 *      arrived, so 0 -> 1 was most likely never said; and inside a
 *      <button> it was not there at all.  The change is said by the
 *      shell, in one live region of its own that is always there, with
 *      the name of the item: "Alarms, 3" (yui_shell_set_nav_item_badge,
 *      yui_shell_set_toolbar_item_badge).  A write that changes nothing
 *      still touches no DOM.
 *
 *      A TONE, optional: one of BADGE_TONES, drawn as Bulma's
 *      `is-<tone>` on the badge.  It says HOW BAD the count is -- the
 *      alarms of an app coloured by the worst state among them.  No
 *      tone is the default look (the danger colour: a badge exists to
 *      pull the eye).  An unknown tone is the caller's error: it is
 *      logged, and the default look is drawn instead.
 *
 *      The text is a Text node, never a string: a value that came from
 *      outside must not reach createElement2() as markup.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {log_error} from "@yuneta/gobj-js";

import {text_node} from "./yui_text.js";


/***************************************************************
 *              Constants
 ***************************************************************/
export const BADGE_TONES = Object.freeze([
    "danger", "warning", "info", "success", "primary", "link"
]);

/*  Unique ids for the badges and the controls they name: the
 *  aria-labelledby of a control points at two of them.  */
let __badge_seq__ = 0;


/************************************************************
 *  The text a badge shows for `value`, "" when it shows none.
 ************************************************************/
export function badge_text(value)
{
    if(value === null || value === undefined || value === false) {
        return "";
    }
    if(typeof value === "number") {
        if(!isFinite(value) || value <= 0) {
            return "";
        }
        return (value > 99) ? "99+" : String(Math.floor(value));
    }
    return String(value).trim();
}

/************************************************************
 *  The tone to draw: `tone` when it is one of BADGE_TONES, ""
 *  (the default look) when it is empty.  Anything else is logged,
 *  naming `who`, and answers "".
 ************************************************************/
export function badge_tone(tone, who)
{
    if(tone === undefined || tone === null || tone === "") {
        return "";
    }
    if(BADGE_TONES.indexOf(tone) < 0) {
        log_error(
            `${who}: unknown badge tone '${tone}', drawn with the default look ` +
            `(the tones: ${BADGE_TONES.join(", ")})`
        );
        return "";
    }
    return tone;
}

/************************************************************
 *  The createElement2() description of a badge.  `classes` are
 *  the host's (its logical name, `yui-badge` for the look, and
 *  where it sits); `who` names the item in the log of an unknown
 *  tone.
 ************************************************************/
export function badge_node(value, tone, classes, who)
{
    let text = badge_text(value);
    let known = badge_tone(tone, who);
    let attrs = {
        class: known ? `${classes} is-${known}` : classes
    };
    if(!text) {
        attrs.hidden = "hidden";
    }
    return ["span", attrs, text_node(text)];
}

/************************************************************
 *  Make the count part of the NAME of the control that carries
 *  the badge: its `aria-labelledby` points at the control itself
 *  and at the badge.
 *
 *  The control keeps its `aria-label` and its
 *  data-i18n-aria-label: a self-reference reads the aria-label,
 *  so the name is the translated label followed by the badge's
 *  text -- "Alarms 3" -- or the label alone while the badge is
 *  empty. A painted count is in the name at once, and a language
 *  switch re-translates the label as it always did.
 *
 *  Both are createElement2() descriptions, before anything is
 *  built: `control_attrs` (the attrs of the <a> or <button>, which
 *  must carry its aria-label) gets an `id` when it has none, and
 *  the `aria-labelledby`; `badge` (what badge_node() answered)
 *  gets its `id`.
 ************************************************************/
export function name_control_with_badge(control_attrs, badge)
{
    let seq = ++__badge_seq__;
    if(!control_attrs.id) {
        control_attrs.id = `yui-badged-${seq}`;
    }
    let badge_attrs = badge[1];
    badge_attrs.id = `yui-badge-${seq}`;
    control_attrs["aria-labelledby"] = `${control_attrs.id} ${badge_attrs.id}`;
}

/************************************************************
 *  Write a badge that is already in the DOM, as badge_node()
 *  draws it.  `tone` is one badge_tone() answered: the setter
 *  checks it once for all the badges it paints.
 ************************************************************/
export function paint_badge($badge, value, tone)
{
    for(let known of BADGE_TONES) {
        let cls = `is-${known}`;
        if(known === tone) {
            if(!$badge.classList.contains(cls)) {
                $badge.classList.add(cls);
            }
        } else if($badge.classList.contains(cls)) {
            $badge.classList.remove(cls);
        }
    }

    let text = badge_text(value);
    if(!text) {
        $badge.textContent = "";
        $badge.setAttribute("hidden", "hidden");
        return;
    }
    /*  Do not touch the DOM when nothing changed: whatever feeds the
     *  number ticks, and a rewrite is a mutation for every observer of
     *  the tree (and was an announcement while the badge was a live
     *  region). */
    if($badge.textContent === text && !$badge.hasAttribute("hidden")) {
        return;
    }
    $badge.textContent = text;
    $badge.removeAttribute("hidden");
}
