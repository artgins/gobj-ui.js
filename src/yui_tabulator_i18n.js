/***********************************************************************
 *          yui_tabulator_i18n.js
 *
 *      The strings TABULATOR renders on its own — the paginator ("Page
 *      Size", "First", "Prev", "Next", "Last"), the placeholder ("No Data
 *      Available"), the loading/error notices — through the app's i18n.
 *
 *      They are not built by any gclass, so nothing here or in an app ever
 *      passed them through t(): a table sat in English inside an otherwise
 *      Spanish view, and a language switch did not touch it.
 *
 *      Two calls:
 *
 *          new Tabulator($el, {..., ...yui_tabulator_lang(t)});
 *          yui_tabulator_relocalize(table, t);   // on a language change
 *
 *      Every key carries an English `defaultValue`, so an app that does not
 *      define it renders exactly what Tabulator rendered before — the
 *      keys are an OPPORTUNITY to translate, never a requirement.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {log_warning} from "@yuneta/gobj-js";


/*  Tabulator re-renders the parts it owns only when the locale NAME changes:
 *  setLocale() with the name already in force is a no-op, so re-registering
 *  fresh strings under "default" left the paginator in the old language. Each
 *  application of a language therefore gets its own name.  */
let __lang_seq__ = 0;

function next_lang_name()
{
    return `yui-${++__lang_seq__}`;
}

/***************************************************************
 *  Tabulator's own strings, in the CURRENT language.
 *
 *  ONE lang dict (not one per locale): the app owns the locales and hands us
 *  only its live `t`, so a language change rebuilds the dict and re-applies
 *  it under a fresh name (yui_tabulator_relocalize).
 ***************************************************************/
function yui_tabulator_lang(t)
{
    let name = next_lang_name();
    let langs = {};
    langs[name] = tabulator_strings(t);
    return {
        locale: name,
        langs:  langs
    };
}

function tabulator_strings(t)
{
    let tr = (key, def) => t(key, {defaultValue: def});

    return {
        data: {
            loading: tr("loading", "Loading"),
            error:   tr("error", "Error")
        },
        pagination: {
            page_size:   tr("page size", "Page Size"),
            page_title:  tr("show page", "Show Page"),
            first:       tr("first", "First"),
            first_title: tr("first page", "First Page"),
            last:        tr("last", "Last"),
            last_title:  tr("last page", "Last Page"),
            prev:        tr("prev", "Prev"),
            prev_title:  tr("prev page", "Prev Page"),
            next:        tr("next", "Next"),
            next_title:  tr("next page", "Next Page"),
            all:         tr("all", "All")
        },
        headerFilters: {
            default: tr("filter column", "filter column...")
        }
    };
}

/***************************************************************
 *  Put an EXISTING table in the current language: rebuild the strings and
 *  re-apply the locale, which is what makes Tabulator re-render the parts
 *  it owns (the paginator above all — it is drawn once, at build).
 *
 *  Silent no-op on a table that is gone: a language switch races nothing,
 *  but a view torn down mid-switch must not log a failure it cannot act on.
 ***************************************************************/
function yui_tabulator_relocalize(table, t)
{
    if(!table) {
        return;
    }
    try {
        let name = next_lang_name();
        let strings = tabulator_strings(t);

        /*  Tabulator DEEP-CLONES options.langs into its localize module when
         *  the table is built, and never looks at the option again: writing a
         *  new language there and calling setLocale() only earned a
         *  "Matching locale not found, using default: yui-5" — and the
         *  paginator it was meant to translate stayed in the old language.
         *  Install it where the module actually reads it. The option is still
         *  written, so a table rebuilt from its options keeps the language.  */
        table.options.langs = table.options.langs || {};
        table.options.langs[name] = strings;

        let localize = table.modules && table.modules.localize;
        if(localize && typeof localize.installLang === "function") {
            localize.installLang(name, strings);
        } else {
            log_warning(`yui_tabulator_relocalize: no localize module: ` +
                        `Tabulator's own chrome stays in the old language`);
        }

        table.setLocale(name);      /*  a NEW name: this is what re-renders  */
    } catch(e) {
        log_warning(`yui_tabulator_relocalize: table gone: ${e}`);
    }
}

export {
    yui_tabulator_lang,
    yui_tabulator_relocalize,
};
