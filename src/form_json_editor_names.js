/***********************************************************************
 *          form_json_editor_names.js
 *
 *      The NAMES of the buttons vanilla-jsoneditor draws in its menu
 *      (a json field of C_YUI_FORM): in the app's language, and with an
 *      aria-label.
 *
 *      The editor draws them itself, in English, with a `title` and
 *      nothing else: "Format JSON: add proper indentation and new lines
 *      (Ctrl+I)", "Undo (Ctrl+Z)", and three mode buttons whose text is
 *      "text", "tree" and "table" (REV-CLOUD V23.5.6). Two hooks reach
 *      them, and both are needed:
 *
 *        - json_editor_menu_items(), the editor's `onRenderMenu`: the
 *          items it is about to draw, with each title translated (its
 *          shortcut kept) and the mode buttons' text too. Svelte draws
 *          from these, so a button born in a re-render is born named.
 *        - name_json_editor_menu(), after the render, from the form's
 *          FSM: the aria-label of each button, with its key, so
 *          refresh_language() re-translates it, and the state of the
 *          mode buttons (aria-pressed). A menu item has no field for
 *          either.
 *
 *      A button is known by the CLASS the editor gives it (`jse-format`,
 *      `jse-undo`...), never by its English title: a class is what the
 *      editor's own stylesheet relies on. A button not listed here keeps
 *      the editor's words.
 *
 *      Its CONTEXT MENU (`onRenderContextMenu`,
 *      json_editor_context_menu_items()) has no class on its items, so
 *      an item is known by what it IS and where it IS: the icon the
 *      editor draws it with (a FontAwesome name: `paste`, `scissors`),
 *      the column of the menu it stands in, its place in a dropdown
 *      (the main button, the first or the second of its list), the
 *      mode of the editor (tree or table) -- never by its words. Its
 *      text and title go back translated; after the render the same
 *      pass names its buttons, and the arrow of each dropdown, which
 *      the editor draws with no name at all.
 *
 *      Not reached, because the editor gives them no hook: its search
 *      box, its repair messages, the tip at the foot of the context
 *      menu, and its modals (sort, transform). They stay in its
 *      English.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {t} from "i18next";


/***************************************************************
 *              Constants
 ***************************************************************/
/*  The buttons of the menu, by the class the editor gives each.  */
const JSON_EDITOR_BUTTON_KEYS = {
    "jse-expand-all":   "expand all",
    "jse-collapse-all": "collapse all",
    "jse-search":       "search",
    "jse-copy":         "copy",
    "jse-undo":         "undo",
    "jse-redo":         "redo",
    "jse-cancel":       "cancel",
    "jse-format":       "format json",
    "jse-compact":      "compact json",
    "jse-sort":         "sort",
    "jse-transform":    "transform",
    "jse-contextmenu":  "open context menu",
};

/*  Its three MODE buttons share one class (`jse-group-button`) and are
 *  told apart by the mode they switch to: their name, and the short
 *  text they show.  */
const JSON_EDITOR_MODE_NAME_KEYS = {
    text:  "text view",
    tree:  "tree view",
    table: "table view",
};
const JSON_EDITOR_MODE_TEXT_KEYS = {
    text:  "text mode",
    tree:  "tree mode",
    table: "table mode",
};

/*  The class this module adds to a mode button, so that after the
 *  render it is still known by its mode -- its text is translated.  */
const MODE_CLASS = "yui-jse-mode-";

/*  The shortcut at the end of an editor title: "(Ctrl+Shift+Z)".  */
const SHORTCUT = /\((?:Ctrl|Cmd|⌘)[^()]*\)\s*$/;

/*  The CONTEXT MENU, by the icon each item is drawn with (vanilla-
 *  jsoneditor 3.13 builds it with FontAwesome icons, and gives its
 *  items no class). A button of its own: */
const CONTEXT_BUTTON_KEYS = {
    "pen":                   "edit key",
    "paste":                 "paste",
    "clone":                 "duplicate",
    "crop-simple":           "extract",
    "arrow-down-short-wide": "sort",
    "filter":                "transform",
    "trash-can":             "remove",
    "square-caret-up":       "insert before",
    "square-caret-down":     "insert after",
};

/*  A button of the ROW column of the table mode's menu.  */
const CONTEXT_ROW_BUTTON_KEYS = {
    "pen":       "edit row",
    "clone":     "duplicate row",
    "trash-can": "remove row",
};

/*  A dropdown, by the icon of its main button: the main, the first of
 *  its list and the second.  */
const CONTEXT_DROPDOWN_MAIN_KEYS = {
    "pen":      "edit value",
    "scissors": "cut",
    "copy":     "copy",
};
const CONTEXT_DROPDOWN_FIRST_KEYS = {
    "pen":      "edit value",
    "scissors": "cut formatted",
    "copy":     "copy formatted",
};
const CONTEXT_DROPDOWN_SECOND_KEYS = {
    "pen":      "enforce string",
    "scissors": "cut compacted",
    "copy":     "copy compacted",
};

/*  What the tree mode converts a value to, or inserts: the buttons of
 *  its second column, in their order, all with one icon.  */
const CONTEXT_TARGET_KEYS = {
    "0": "structure",
    "1": "object",
    "2": "array",
    "3": "value",
};
const TARGET_ICONS = ["arrow-right-arrow-left", "plus"];

/*  The labels heading a column.  */
const CONTEXT_LABEL_KEYS = {
    convert: "convert to",
    insert:  "insert",
    cell:    "table cell",
    row:     "table row",
};




                    /***************************
                     *      Local Methods
                     ***************************/




function has_key(table, name)
{
    return Object.prototype.hasOwnProperty.call(table, name);
}

/*  The listed class among `classes` (a className string or a list).  */
function button_class(classes)
{
    let list = Array.isArray(classes)? classes : String(classes || "").split(/\s+/);
    return list.find((c) => has_key(JSON_EDITOR_BUTTON_KEYS, c)) || "";
}

/*  The mode an item of the editor switches to, "" when it is none.  */
function mode_of_item(item)
{
    let classes = String(item.className || "").split(/\s+/);
    if(classes.indexOf("jse-group-button") < 0) {
        return "";
    }
    return has_key(JSON_EDITOR_MODE_NAME_KEYS, item.text)? item.text : "";
}

/*  The FontAwesome name of an item's icon, "" without one.  */
function icon_of(item)
{
    return (item && item.icon && typeof item.icon.iconName === "string")?
        item.icon.iconName : "";
}

/*  An item with its name: the text a reader sees and its title, which
 *  keeps the editor's shortcut after it. `name` is translated.  */
function named_item(item, name)
{
    let m = SHORTCUT.exec(String(item.title || ""));
    return Object.assign({}, item, {
        text: name,
        title: m? `${name} ${m[0].trim()}` : name
    });
}

/*  A dropdown of the context menu: its main button and its list, by
 *  the icon of the main one. One the module does not know comes back
 *  as it came.  */
function context_dropdown(item)
{
    let icon = icon_of(item.main);
    if(!has_key(CONTEXT_DROPDOWN_MAIN_KEYS, icon)) {
        return item;
    }
    let list = Array.isArray(item.items)? item.items : [];
    return Object.assign({}, item, {
        main: named_item(item.main, t(CONTEXT_DROPDOWN_MAIN_KEYS[icon])),
        items: list.map(function(it, i) {
            if(!it || it.type !== "button") {
                return it;
            }
            if(i === 0) {
                return named_item(it, t(CONTEXT_DROPDOWN_FIRST_KEYS[icon]));
            }
            if(i === 1) {
                return named_item(it, t(CONTEXT_DROPDOWN_SECOND_KEYS[icon]));
            }
            return it;
        })
    });
}

/*  A button of the context menu that stands on its own, by its icon;
 *  in the row column of the table mode, by the row's own table.  */
function context_button(item, row_column)
{
    let icon = icon_of(item);
    if(row_column && has_key(CONTEXT_ROW_BUTTON_KEYS, icon)) {
        return named_item(item, t(CONTEXT_ROW_BUTTON_KEYS[icon]));
    }
    if(has_key(CONTEXT_BUTTON_KEYS, icon)) {
        return named_item(item, t(CONTEXT_BUTTON_KEYS[icon]));
    }
    return item;
}

/*  A column of the context menu. What its label says depends on where
 *  it is: in the table mode, the first column is the cell's and the
 *  second the row's; in the tree mode, a column whose buttons all carry
 *  a target's icon converts (arrows) or inserts (a plus), and its
 *  buttons are the targets, in their order.  */
function context_column(item, table, index)
{
    let list = Array.isArray(item.items)? item.items : [];
    let buttons = list.filter((it) => it && it.type === "button");
    let targets = !table && buttons.length > 0 &&
        buttons.every((it) => TARGET_ICONS.indexOf(icon_of(it)) >= 0);
    let row_column = table && index === 1;

    let label_kind = "";
    if(table) {
        label_kind = (index === 0)? "cell" : (index === 1? "row" : "");
    } else if(targets) {
        label_kind = (icon_of(buttons[0]) === "plus")? "insert" : "convert";
    }

    let target = 0;
    let insert_row = 0;
    return Object.assign({}, item, {items: list.map(function(it) {
        if(!it || typeof it !== "object") {
            return it;
        }
        if(it.type === "label") {
            return label_kind?
                Object.assign({}, it, {text: t(CONTEXT_LABEL_KEYS[label_kind])}) : it;
        }
        if(it.type === "dropdown-button") {
            return context_dropdown(it);
        }
        if(it.type !== "button") {
            return it;
        }
        if(targets) {
            return named_item(it, t(CONTEXT_TARGET_KEYS[String(target++)]));
        }
        if(row_column && icon_of(it) === "plus") {
            /*  The row's two inserts share one icon: before, then after.  */
            return named_item(it, t(insert_row++ === 0?
                CONTEXT_BUTTON_KEYS["square-caret-up"] : CONTEXT_BUTTON_KEYS["square-caret-down"]));
        }
        return context_button(it, row_column);
    })});
}

/*  An item of the context menu, as it comes: a row, a dropdown, a
 *  button, a separator (as it came).  */
function context_item(item, table)
{
    if(!item || typeof item !== "object") {
        return item;
    }
    if(item.type === "row") {
        let column = 0;
        let list = Array.isArray(item.items)? item.items : [];
        return Object.assign({}, item, {items: list.map(function(it) {
            if(it && it.type === "column") {
                return context_column(it, table, column++);
            }
            return context_item(it, table);
        })});
    }
    if(item.type === "dropdown-button") {
        return context_dropdown(item);
    }
    if(item.type === "button") {
        return context_button(item, false);
    }
    return item;
}

/*  The mode of a rendered button, by the class json_editor_menu_items()
 *  gave its item.  */
function mode_of_button($b)
{
    for(let c of $b.classList) {
        if(c.indexOf(MODE_CLASS) === 0) {
            let mode = c.slice(MODE_CLASS.length);
            if(has_key(JSON_EDITOR_MODE_NAME_KEYS, mode)) {
                return mode;
            }
        }
    }
    return "";
}




                    /***************************
                     *      Public
                     ***************************/




/************************************************************
 *  The editor's `onRenderMenu`: the items it is about to draw,
 *  translated. A title keeps the editor's shortcut after the
 *  translated name ("Deshacer (Ctrl+Z)"); a mode button gets its
 *  mode's name as title and its short text translated, and a class
 *  that says its mode. Anything else is returned as it came.
 *
 *  Pure: what it answers is data for the editor to draw.
 ************************************************************/
export function json_editor_menu_items(items)
{
    if(!Array.isArray(items)) {
        return items;
    }
    return items.map(function(item) {
        if(!item || item.type !== "button") {
            return item;
        }
        let mode = mode_of_item(item);
        if(mode) {
            return Object.assign({}, item, {
                className: `${item.className} ${MODE_CLASS}${mode}`,
                title: t(JSON_EDITOR_MODE_NAME_KEYS[mode]),
                text: t(JSON_EDITOR_MODE_TEXT_KEYS[mode])
            });
        }
        let cls = button_class(item.className);
        if(!cls) {
            return item;
        }
        let m = SHORTCUT.exec(String(item.title || ""));
        let name = t(JSON_EDITOR_BUTTON_KEYS[cls]);
        return Object.assign({}, item, {title: m? `${name} ${m[0].trim()}` : name});
    });
}

/************************************************************
 *  The editor's `onRenderContextMenu`: the items it is about to
 *  draw, translated -- each known by its icon and its place, never
 *  by its words (context_item()). Anything the module does not
 *  know comes back as it came: a newer editor that moves an item
 *  leaves it in English, it does not mislabel it.
 *
 *  Pure: what it answers is data for the editor to draw.
 ************************************************************/
export function json_editor_context_menu_items(items, context)
{
    if(!Array.isArray(items)) {
        return items;
    }
    let table = !!(context && context.mode === "table");
    return items.map((item) => context_item(item, table));
}

/************************************************************
 *  Name the buttons of a rendered editor's menu: an aria-label
 *  with its key (data-i18n-aria-label, so a language change
 *  reaches it), and aria-pressed on the mode buttons -- the
 *  selected one is the mode on screen (`jse-selected`). Run
 *  after every render of the menu: a re-render may draw new
 *  buttons, which carry none of it.
 ************************************************************/
export function name_json_editor_menu($editor)
{
    if(!$editor || typeof $editor.querySelectorAll !== "function") {
        return 0;
    }
    let named = 0;
    for(let $b of $editor.querySelectorAll(".jse-menu button")) {
        let mode = mode_of_button($b);
        const key = mode?
            JSON_EDITOR_MODE_NAME_KEYS[mode] :
            JSON_EDITOR_BUTTON_KEYS[button_class([...$b.classList])];
        if(!key) {
            continue;   // a button of the editor's own this module does not know
        }
        $b.setAttribute("aria-label", t(key));
        $b.setAttribute("data-i18n-aria-label", key);
        if(mode) {
            $b.setAttribute("aria-pressed",
                $b.classList.contains("jse-selected")? "true" : "false");
        }
        named++;
    }

    /*  Its context menu, while it is open (a popup the editor draws in
     *  its own element). Its buttons carry the text and the title
     *  json_editor_context_menu_items() gave them, in the language of
     *  this moment -- the menu closes on the first press outside it, so
     *  it is never on screen across a language change: the aria-label
     *  is that text. The arrow that opens a dropdown carries nothing at
     *  all, and is named here, with its key.  */
    const MORE = "more options";
    for(let $b of $editor.querySelectorAll("div.jse-contextmenu button")) {
        if($b.getAttribute("data-type") === "jse-open-dropdown") {
            $b.setAttribute("title", t(MORE));
            $b.setAttribute("data-i18n-title", MORE);
            $b.setAttribute("aria-label", t(MORE));
            $b.setAttribute("data-i18n-aria-label", MORE);
            named++;
            continue;
        }
        let text = ($b.textContent || "").trim();
        if(text) {
            $b.setAttribute("aria-label", text);
            named++;
        }
    }
    return named;
}
