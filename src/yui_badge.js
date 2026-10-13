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
 *      role="status" and NOT aria-hidden, deliberately.  The control
 *      carries an explicit aria-label, and an explicit label REPLACES
 *      the element's content for a screen reader -- so a badge inside
 *      it would be silent.  As its own live region it is both read and
 *      announced when the count changes, which is the whole point of a
 *      badge that means "something needs you".  For the same reason a
 *      write that changes nothing touches no DOM: rewriting the same
 *      number would have it announced again on every tick.
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
        class: known ? `${classes} is-${known}` : classes,
        role:  "status"
    };
    if(!text) {
        attrs.hidden = "hidden";
    }
    return ["span", attrs, text_node(text)];
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
    /*  Do not touch the DOM when nothing changed: role="status" is a
     *  live region, and rewriting the same number would have a screen
     *  reader announce it again on every tick. */
    if($badge.textContent === text && !$badge.hasAttribute("hidden")) {
        return;
    }
    $badge.textContent = text;
    $badge.removeAttribute("hidden");
}
