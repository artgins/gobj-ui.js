/***********************************************************************
 *          yui_preferences.js
 *
 *      The Preferences page of an app: what the READER chose for this
 *      browser. Every app shows at least the same three rows, in one
 *      box headed "Appearance":
 *
 *          Theme        light theme | dark theme
 *          Language     the app's languages, each in its own words
 *          Navigation   stacked strips | back to parent | breadcrumb
 *
 *      Two ways to use it:
 *
 *        - C_YUI_PREFERENCES, a whole page: a view the shell mounts at
 *          /preferences. It draws the three rows, then the boxes the app
 *          adds (the `sections` of the setup).
 *        - The parts, for an app whose page has fields of its own with
 *          actions of its own: yui_pref_header(), yui_pref_field(),
 *          yui_pref_segment() and yui_pref_appearance_fields(). The host
 *          declares EV_SET_THEME, EV_SET_LANGUAGE and EV_SET_NAV_MODE
 *          ({value}) and hands them to yui_pref_apply().
 *
 *      The theme and the language are the APP's: it says once, at start
 *      up, how to read them and how to change them, with
 *      yui_preferences_setup(). The navigation is the shell's
 *      (yui_shell_nav_mode / yui_shell_set_nav_mode): every C_YUI_NODE
 *      tree with no mode of its own follows it, and an app with no tree
 *      keeps the choice for the day it has one.
 *
 *      A language is SHOWN and NAMED in its own words ("Español", with
 *      its `lang`): a reader looking for their language finds it in the
 *      language they read, and an app of ten languages needs no key per
 *      language name.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {
    log_error,
    gobj_send_event,
    refresh_language,
} from "@yuneta/gobj-js";

import {t} from "i18next";

import {yui_toolbar_icon} from "./yui_toolbar_icon.js";
import {text_node} from "./yui_text.js";
import {
    yui_shell_of,
    yui_shell_language_changed,
    yui_shell_nav_mode,
    yui_shell_set_nav_mode,
} from "./c_yui_shell.js";

/***************************************************************
 *              Constants
 ***************************************************************/
/*  The keys this module hands to t() as variables (the options of a
 *  segment): published for validate-locales.  */
export const YUI_PREFERENCES_I18N_KEYS = [
    "light theme", "dark theme",
    "stacked strips", "back to parent", "breadcrumb"
];

const THEMES = [
    {value: "light", key: "light theme", icon: "yi-sun"},
    {value: "dark",  key: "dark theme",  icon: "yi-moon"}
];

const NAV_MODE_OPTIONS = [
    {value: "stack", key: "stacked strips", icon: "yi-layer-group"},
    {value: "back",  key: "back to parent", icon: "yi-arrow-left"},
    {value: "path",  key: "breadcrumb",     icon: "yi-route"}
];

/*  What the app said at start up (yui_preferences_setup).  */
let __setup__ = null;




                    /***************************
                     *      Setup
                     ***************************/




/***************************************************************
 *  How this app reads and changes its theme and its language, and
 *  the boxes it adds to the page. Called once, at start up, before
 *  the page is shown:
 *
 *      yui_preferences_setup({
 *          current_theme:    () => "dark",
 *          set_theme:        (value) => {...},
 *          languages:        [{value: "en", text: "English"},
 *                             {value: "es", text: "Español"}],
 *          current_language: () => "es",
 *          set_language:     (value) => {...},    // the app's i18next
 *          sections:         (gobj) => [...],     // optional: boxes
 *      });
 *
 *  set_language() switches the app's i18next; the shell is told after
 *  it (yui_shell_language_changed), so the app does not do it twice.
 ***************************************************************/
function yui_preferences_setup(opts)
{
    let o = opts || {};
    let needed = ["current_theme", "set_theme", "current_language", "set_language"];
    for(let name of needed) {
        if(typeof o[name] !== "function") {
            log_error(`yui_preferences_setup(): '${name}' must be a function`);
            return -1;
        }
    }
    if(!Array.isArray(o.languages) || o.languages.length === 0) {
        log_error(`yui_preferences_setup(): 'languages' must list the app's languages`);
        return -1;
    }
    if(o.sections !== undefined && typeof o.sections !== "function") {
        log_error(`yui_preferences_setup(): 'sections' must be a function`);
        return -1;
    }
    __setup__ = o;
    return 0;
}

/*  What the app said, or null (and an error) when it said nothing.  */
function setup_of(who)
{
    if(!__setup__) {
        log_error(`${who}: no yui_preferences_setup() — the app must call it at start up`);
    }
    return __setup__;
}




                    /***************************
                     *      Parts of the page
                     ***************************/




/***************************************************************
 *  The title of the page and the name of its first box.
 ***************************************************************/
function yui_pref_header()
{
    return ["div", {class: "PREF_HEADER", style: "margin-bottom:0.5rem;"}, [
        ["h1", {class: "PREF_TITLE title is-3 has-text-link", style: "margin-bottom:0.25rem;",
                i18n: "preferences"}, "preferences"],
        ["p", {class: "PREF_SUBTITLE subtitle is-6 has-text-grey", style: "margin-bottom:1rem;",
               i18n: "appearance"}, "appearance"]
    ]];
}

/***************************************************************
 *  A box of fields, as wide as the page reads well.
 ***************************************************************/
function yui_pref_box(fields, extra_class)
{
    return ["div", {class: `PREF_BOX box ${extra_class || ""}`, style: "max-width:540px;"},
        fields];
}

/***************************************************************
 *  One field: its label over its control.
 ***************************************************************/
function yui_pref_field(label_key, control, extra_class)
{
    return ["div", {class: `PREF_FIELD field ${extra_class || ""}`,
                    style: "margin-bottom:1.25rem;"}, [
        ["label", {class: "PREF_LABEL label", i18n: label_key}, label_key],
        ["div", {class: "PREF_CONTROL control"}, [control]]
    ]];
}

/***************************************************************
 *  A segmented choice: one button per option, the current one
 *  marked (`is-primary is-selected`). An option is
 *
 *      {value, key, icon}    the label and the name are the key
 *      {value, text, lang}   the label and the name are the text,
 *                            which is data (a language's own name)
 *
 *  A click sends `event_name` {value} to `gobj`: the click is an OS
 *  notification, the change is an action of the host.
 ***************************************************************/
function yui_pref_segment(gobj, event_name, options, current, extra_class)
{
    let buttons = options.map(function(opt) {
        let active = (opt.value === current);
        let cls = "PREF_SEGMENT_ITEM button" + (active ? " is-primary is-selected" : "");
        let kids = [];
        if(opt.icon) {
            kids.push(["span", {class: "icon"}, [yui_toolbar_icon(opt.icon)]]);
        }
        let attrs = {type: "button", class: cls, "aria-pressed": active ? "true" : "false"};
        if(opt.key) {
            kids.push(["span", {class: "PREF_SEGMENT_TEXT",
                                i18n: /* i18n: YUI_PREFERENCES_I18N_KEYS */ opt.key}, opt.key]);
            attrs.title = t(/* i18n: YUI_PREFERENCES_I18N_KEYS */ opt.key);
            attrs["data-i18n-title"] = opt.key;
            attrs["aria-label"] = t(/* i18n: YUI_PREFERENCES_I18N_KEYS */ opt.key);
            attrs["data-i18n-aria-label"] = opt.key;
        } else {
            kids.push(["span", {class: "PREF_SEGMENT_TEXT", lang: opt.lang || opt.value},
                       text_node(opt.text)]);
            attrs.title = opt.text;
            attrs["aria-label"] = opt.text;
            attrs.lang = opt.lang || opt.value;
        }
        return ["button", attrs, kids, {
            click: function() {
                gobj_send_event(gobj, event_name, {value: opt.value}, gobj);
            }
        }];
    });
    return ["div", {class: `PREF_SEGMENT buttons has-addons ${extra_class || ""}`}, buttons];
}

/***************************************************************
 *  The three rows every app shows: theme, language, navigation.
 *  Their clicks send EV_SET_THEME / EV_SET_LANGUAGE /
 *  EV_SET_NAV_MODE {value} to `gobj`.
 ***************************************************************/
function yui_pref_appearance_fields(gobj)
{
    let setup = setup_of("yui_pref_appearance_fields()");
    if(!setup) {
        return [];  // Error already logged
    }
    let shell = yui_shell_of(gobj);
    let languages = setup.languages.map((l) => ({value: l.value, text: l.text, lang: l.value}));

    return [
        yui_pref_field("theme",
            yui_pref_segment(gobj, "EV_SET_THEME", THEMES, setup.current_theme(), "PREF_THEME"),
            "PREF_THEME_FIELD"),
        yui_pref_field("language",
            /*  The languages are the app's, each named in its own words: data  */
            yui_pref_segment(gobj, "EV_SET_LANGUAGE", /* i18n: data */ languages,
                             setup.current_language(),
                             "PREF_LANGUAGE"),
            "PREF_LANGUAGE_FIELD"),
        yui_pref_field("navigation",
            yui_pref_segment(gobj, "EV_SET_NAV_MODE", NAV_MODE_OPTIONS,
                             shell ? yui_shell_nav_mode(shell) : "stack", "PREF_NAVIGATION"),
            "PREF_NAVIGATION_FIELD")
    ];
}

/***************************************************************
 *  The extra boxes of the app (its `sections`), or none.
 ***************************************************************/
function yui_pref_sections(gobj)
{
    let setup = setup_of("yui_pref_sections()");
    if(!setup || !setup.sections) {
        return [];
    }
    let boxes = setup.sections(gobj);
    return Array.isArray(boxes) ? boxes : [];
}




                    /***************************
                     *      Applying a choice
                     ***************************/




/***************************************************************
 *  Apply one of the three choices: EV_SET_THEME, EV_SET_LANGUAGE
 *  or EV_SET_NAV_MODE, with its {value}. The host calls it from
 *  its action and draws its page again: which option is marked is
 *  markup, which no refresh_language() moves.
 ***************************************************************/
function yui_pref_apply(gobj, event, kw)
{
    let setup = setup_of("yui_pref_apply()");
    if(!setup) {
        return -1;  // Error already logged
    }
    let value = (kw && kw.value) || "";
    let shell = yui_shell_of(gobj);

    switch(event) {
        case "EV_SET_THEME":
            setup.set_theme(value);
            return 0;

        case "EV_SET_LANGUAGE":
            setup.set_language(value);
            if(shell) {
                yui_shell_language_changed(shell);
            } else {
                refresh_language(document.body, t);
            }
            return 0;

        case "EV_SET_NAV_MODE":
            if(!shell) {
                log_error(`yui_pref_apply(): no shell, the navigation cannot change`);
                return -1;
            }
            return yui_shell_set_nav_mode(shell, value);

        default:
            log_error(`yui_pref_apply(): '${event}' is not a preference`);
            return -1;
    }
}

export {
    yui_preferences_setup,
    yui_pref_header,
    yui_pref_box,
    yui_pref_field,
    yui_pref_segment,
    yui_pref_appearance_fields,
    yui_pref_sections,
    yui_pref_apply,
};
