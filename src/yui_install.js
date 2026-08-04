/***********************************************************************
 *          yui_install.js
 *
 *      Can this app be installed, and has anyone offered?
 *
 *      Chrome decides on its own whether to show its install banner, and
 *      the heuristic behind that decision is not ours to read: once the
 *      mini-infobar has been dismissed — or once the app has been
 *      installed and removed — the browser goes quiet on this origin for
 *      about three months. The app then LOOKS uninstallable when it is
 *      only unadvertised, and the way in is buried in the browser menu.
 *
 *      So the browser's own banner is refused and the event it came with
 *      is kept. Asking becomes the app's job, at a moment the app
 *      chooses, and prompt() on that saved event opens the real system
 *      dialog — the same one, just not on Chrome's schedule.
 *
 *      THE EVENT ARRIVES BEFORE THIS BUNDLE IS PARSED, and one nobody
 *      caught cannot be asked for back. So the catching is done by a
 *      tiny script the app serves from `public/install-prompt.js` and
 *      loads with `<script src>` — NOT inline: every SPA here ships a
 *      CSP with `script-src 'self'`, which drops an inline block without
 *      running it and without failing loudly.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {
    log_error,
    kw_get_local_storage_value,
    kw_set_local_storage_value,
} from "@yuneta/gobj-js";

import {yui_shell_confirm_yesno} from "./shell_modals.js";

/*  Where the early script leaves the event, and the name it re-emits
 *  under. Both are part of the contract with public/install-prompt.js.  */
const STASH = "__yuneta_install__";
const SIGNAL = "yuneta:installable";

/*  "We already asked" — per browser, not per session: asking once a
 *  launch is nagging, and the answer rarely changes within a day.  */
const ASKED_KEY = "install_asked";

const listeners = new Set();

const S = {
    installed: false,   /*  seen installed, this session  */
    asking:    false,   /*  a dialog is up  */
};

/***************************************************************
 *      Tell me when the offer changes.
 *      Returns the unsubscribe function.
 ***************************************************************/
function yui_install_subscribe(fn)
{
    listeners.add(fn);
    return function unsubscribe() {
        listeners.delete(fn);
    };
}

function emit()
{
    for(const fn of listeners) {
        try {
            fn();
        } catch(e) {
            log_error(`yui_install: listener failed: ${e}`);
        }
    }
}

/***************************************************************
 *      The deferred event, stashed by the early script. It is
 *      single-use: once prompt() has been called the browser
 *      will not honour it again, so it is dropped there.
 ***************************************************************/
function deferred()
{
    return window[STASH] || null;
}

/***************************************************************
 *      Are we already running as an installed app? Two answers,
 *      because neither is complete alone: the display mode is
 *      what the launcher gives us, and the flag is what we
 *      learned by installing during this very session (the
 *      window we are in was opened as a tab and does not change
 *      mode).
 ***************************************************************/
function yui_install_is_installed()
{
    if(S.installed) {
        return true;
    }
    try {
        return !!(window.matchMedia &&
            window.matchMedia("(display-mode: standalone)").matches);
    } catch(e) {
        return false;
    }
}

/***************************************************************
 *      Is there a REAL install to offer? Never true on a browser
 *      that does not do this (Firefox, Safari): there is no
 *      event to save, so nothing is promised that cannot be
 *      delivered.
 ***************************************************************/
function yui_install_can()
{
    return !!deferred() && !yui_install_is_installed();
}

/***************************************************************
 *      Open the system install dialog.
 *
 *      MUST be reached from a user gesture, and NOTHING may be
 *      awaited between the gesture and prompt(): the browser
 *      drops transient activation and refuses to open. Calling
 *      it from the .then() of a click-resolved promise is still
 *      a microtask, which keeps the activation — an await on
 *      anything slower does not.
 *
 *      Resolves "accepted", "dismissed", or null when there was
 *      nothing to prompt with. A dismissal is not final: Chrome
 *      offers again on a later visit.
 ***************************************************************/
function yui_install_prompt()
{
    const ev = deferred();
    if(!ev) {
        return Promise.resolve(null);
    }
    window[STASH] = null;

    let choice;
    try {
        ev.prompt();
        choice = ev.userChoice;
    } catch(e) {
        log_error(`yui_install: prompt() failed: ${e}`);
        emit();
        return Promise.resolve(null);
    }

    return Promise.resolve(choice).then(function(res) {
        const outcome = res? res.outcome : null;
        if(outcome === "accepted") {
            S.installed = true;
        }
        emit();
        return outcome;
    }, function(e) {
        log_error(`yui_install: userChoice failed: ${e}`);
        emit();
        return null;
    });
}

/***************************************************************
 *      Start listening. Call once at boot, after the shell
 *      exists. The event itself is caught by the early script
 *      and re-emitted under our own name, which is what we pick
 *      up here.
 ***************************************************************/
function yui_install_start_watch()
{
    window.addEventListener(SIGNAL, function() {
        emit();
    });
    /*  Installed from the browser menu, or from our dialog. Either way
     *  the offer is over and every trace of it goes.  */
    window.addEventListener("appinstalled", function() {
        S.installed = true;
        window[STASH] = null;
        emit();
    });
}

/***************************************************************
 *      Ask, once, when there is something to ask about.
 *
 *      Chrome does not decide an origin is installable the
 *      instant the page loads, so this usually has nothing to
 *      work with yet; it then waits for the offer and asks when
 *      it lands.
 *
 *      `opts.t` is the app's translator, `opts.message` the
 *      question. Answering either way — or dismissing — spends
 *      the one ask; the browser menu is still there, and the
 *      app can call yui_install_prompt() from a button of its
 *      own whenever it likes.
 ***************************************************************/
function yui_install_ask_once(shell, opts)
{
    opts = opts || {};

    if(!shell) {
        log_error("yui_install_ask_once(): no shell");
        return;
    }
    if(kw_get_local_storage_value(ASKED_KEY, false, false)) {
        return;                     /*  once is once  */
    }

    const ask = function() {
        if(S.asking || !yui_install_can()) {
            return;
        }
        S.asking = true;
        kw_set_local_storage_value(ASKED_KEY, true);

        yui_shell_confirm_yesno(shell, opts.message || "Install this app?", {
            t:         opts.t,
            yes_label: opts.yes_label || "install",
            no_label:  opts.no_label  || "not now"
        }).then(function(yes) {
            S.asking = false;
            if(yes) {
                /*  No await before this: see yui_install_prompt().  */
                yui_install_prompt();
            }
        });
    };

    if(yui_install_can()) {
        ask();
        return;
    }

    const unsubscribe = yui_install_subscribe(function() {
        if(yui_install_can()) {
            unsubscribe();
            ask();
        }
    });
}

export {
    yui_install_start_watch,
    yui_install_subscribe,
    yui_install_can,
    yui_install_is_installed,
    yui_install_prompt,
    yui_install_ask_once,
};
