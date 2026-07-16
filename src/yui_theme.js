/***********************************************************************
 *          yui_theme.js
 *
 *      The app's light/dark theme, and how a gclass follows it.
 *
 *      The theme lives in ONE place: the `data-theme` attribute of
 *      <html> (the Bulma convention, set by the shell's theme toggle).
 *      Reading it is the only way to know the current theme; there is
 *      no service to ask.
 *
 *      Components used to ask a legacy C_YUI_MAIN "__yui_main__"
 *      service instead — read its `theme` attr, subscribe to its
 *      EV_THEME. That path was retired: nothing ever WROTE that attr,
 *      so it answered "light" for the life of the app, and no shell
 *      published EV_THEME. C_YUI_SHELL has no such service at all.
 *
 *      A theme change is a DOM mutation — an OS notification — so it
 *      enters the machine as an event: yui_watch_theme() translates
 *      the mutation into EV_THEME and the gclass's action does the
 *      restyling. Nothing happens in the observer callback itself.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {
    gobj_send_event,
    gobj_is_destroying,
} from "@yuneta/gobj-js";


/************************************************************
 *   The active theme: "dark" | "light".
 *
 *   <html data-theme> when the app sets it, else the OS
 *   preference, else light.
 ************************************************************/
function yui_theme_now()
{
    if(typeof document === "undefined") {
        return "light";
    }
    let attr = document.documentElement.getAttribute("data-theme");
    if(attr === "dark" || attr === "light") {
        return attr;
    }
    if(typeof window !== "undefined" && window.matchMedia) {
        return window.matchMedia("(prefers-color-scheme: dark)").matches
            ? "dark" : "light";
    }
    return "light";
}

/************************************************************
 *   True when the app renders dark.
 ************************************************************/
function yui_is_dark()
{
    return yui_theme_now() === "dark";
}

/************************************************************
 *   Follow the theme: watch <html data-theme> and send `event`
 *   (default EV_THEME, kw {theme}) to `gobj` on every change,
 *   so the gclass restyles in its ACTION — the observer only
 *   translates the notification.
 *
 *   The gclass must declare `event` in its FSM, and must
 *   disconnect the returned observer in mt_destroy:
 *
 *       priv.theme_observer = yui_watch_theme(gobj);
 *       ...
 *       if(priv.theme_observer) {
 *           priv.theme_observer.disconnect();
 *           priv.theme_observer = null;
 *       }
 *
 *   Watches BOTH sources: <html data-theme> (a MutationObserver)
 *   and the OS preference (matchMedia prefers-color-scheme, which
 *   is the live source while the attribute is absent — the
 *   "system" theme).
 *
 *   Returns a handle with disconnect(), or null where there is
 *   no DOM.
 ************************************************************/
function yui_watch_theme(gobj, event = "EV_THEME")
{
    if(typeof MutationObserver === "undefined" || typeof document === "undefined") {
        return null;
    }

    let $html = document.documentElement;
    let last = yui_theme_now();

    let notify = function() {
        let theme = yui_theme_now();
        /*  data-theme can be rewritten with the same value (a re-render,
         *  another observer); only a real change is an event. */
        if(theme === last) {
            return;
        }
        last = theme;
        if(gobj_is_destroying(gobj)) {
            return;
        }
        gobj_send_event(gobj, event, {theme: theme}, gobj);
    };

    let mo = new MutationObserver(notify);
    mo.observe($html, {attributes: true, attributeFilter: ["data-theme"]});

    /*  The "system" theme: with data-theme ABSENT, yui_theme_now()
     *  answers from the OS preference (and Bulma follows it via
     *  prefers-color-scheme), so an OS auto-switch (sunset) IS a theme
     *  change — without this listener the CSS would flip while every
     *  canvas kept its old palette, the exact bug class the attribute
     *  observer kills.  notify() dedupes, so when the app pins
     *  data-theme this listener never fires an event (the attribute
     *  wins inside yui_theme_now). */
    let mql = null;
    if(typeof window !== "undefined" && window.matchMedia) {
        mql = window.matchMedia("(prefers-color-scheme: dark)");
        if(typeof mql.addEventListener === "function") {
            mql.addEventListener("change", notify);
        } else {
            mql = null;
        }
    }

    /*  One handle, one disconnect() — same contract as a bare
     *  MutationObserver, covering both sources. */
    return {
        disconnect: function() {
            mo.disconnect();
            if(mql) {
                mql.removeEventListener("change", notify);
                mql = null;
            }
        }
    };
}


export {
    yui_theme_now,
    yui_is_dark,
    yui_watch_theme,
};
