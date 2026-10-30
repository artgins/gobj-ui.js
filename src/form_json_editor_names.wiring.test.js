/***********************************************************************
 *          form_json_editor_names.wiring.test.js
 *
 *      The menu vanilla-jsoneditor draws in a json field of C_YUI_FORM
 *      was English, named by a `title` alone. Now:
 *
 *        - its items go through json_editor_menu_items(), the editor's
 *          onRenderMenu: titles translated (the shortcut kept), the mode
 *          buttons' text translated;
 *        - after each render the form's FSM names the drawn buttons:
 *          aria-label with its key, aria-pressed on the mode buttons;
 *        - a language change makes each editor draw its menu again.
 *
 *      The pure halves are tested on their own; the wiring through the
 *      real C_YUI_FORM and C_YUI_SHELL on a document double, with an
 *      editor double that draws its menu from onRenderMenu, as the real
 *      one does, and again when handed a new one (updateProps).
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {describe, test, expect, beforeAll, afterEach, vi} from "vitest";
import {install_dom_double} from "../test/dom_double.js";

install_dom_double();

if(typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class {
        observe() {
        }
        unobserve() {
        }
        disconnect() {
        }
    };
}

/*  The items the editor hands onRenderMenu in tree mode, as 3.13 builds
 *  them: the class of each button is what this library knows it by.  */
const TREE_MENU = [
    {type: "button", title: "Expand all", className: "jse-expand-all"},
    {type: "button", title: "Collapse all", className: "jse-collapse-all"},
    {type: "separator"},
    {type: "button", title: "Sort", className: "jse-sort"},
    {type: "button", title: "Transform contents (filter, sort, project)", className: "jse-transform"},
    {type: "button", title: "Search (Ctrl+F)", className: "jse-search"},
    {type: "button", title: "Open context menu (Click here, right click on the selection, or use the context menu button or Ctrl+Q)",
        className: "jse-contextmenu"},
    {type: "separator"},
    {type: "button", title: "Undo (Ctrl+Z)", className: "jse-undo"},
    {type: "button", title: "Redo (Ctrl+Shift+Z)", className: "jse-redo"},
    {type: "space"},
    {type: "button", text: "text", title: "Switch to text mode (current mode: tree)",
        className: "jse-group-button jse-first"},
    {type: "button", text: "tree", title: "Switch to tree mode (current mode: tree)",
        className: "jse-group-button  jse-selected"},
    {type: "button", text: "table", title: "Switch to table mode (current mode: tree)",
        className: "jse-group-button jse-last"},
    {type: "button", title: "Something new", className: "jse-something-new"},
];

/*  The CONTEXT menus of 3.13, as it builds them: no class on any item;
 *  an icon (FontAwesome), a place. `convert` picks the tree mode's
 *  second column: converting a selected value (arrows) or inserting
 *  (a plus), with the label to match.  */
const fa = (name) => ({prefix: "fas", iconName: name, icon: [16, 16, [], "", ""]});

function tree_context_menu(convert)
{
    const I = convert ? "Convert to:" : "Insert:";
    const target = convert ? fa("arrow-right-arrow-left") : fa("plus");
    return [
        {type: "row", items: [
            {type: "button", icon: fa("pen"), text: "Edit key", title: "Edit the key (Double-click on the key)"},
            {type: "dropdown-button", width: "11em",
                main: {type: "button", icon: fa("pen"), text: "Edit object",
                    title: "Edit the value (Double-click on the value)"},
                items: [
                    {type: "button", icon: fa("pen"), text: "Edit object",
                        title: "Edit the value (Double-click on the value)"},
                    {type: "button", icon: fa("square"), text: "Enforce string",
                        title: "Enforce keeping the value as string when it contains a numeric value"}
                ]}
        ]},
        {type: "separator"},
        {type: "row", items: [
            {type: "dropdown-button", width: "10em",
                main: {type: "button", icon: fa("scissors"), text: "Cut",
                    title: "Cut selected contents, formatted with indentation (Ctrl+X)"},
                items: [
                    {type: "button", icon: fa("scissors"), text: "Cut formatted",
                        title: "Cut selected contents, formatted with indentation (Ctrl+X)"},
                    {type: "button", icon: fa("scissors"), text: "Cut compacted",
                        title: "Cut selected contents, without indentation (Ctrl+Shift+X)"}
                ]},
            {type: "dropdown-button", width: "12em",
                main: {type: "button", icon: fa("copy"), text: "Copy",
                    title: "Copy selected contents, formatted with indentation (Ctrl+C)"},
                items: [
                    {type: "button", icon: fa("copy"), text: "Copy formatted",
                        title: "Copy selected contents, formatted with indentation (Ctrl+C)"},
                    {type: "button", icon: fa("copy"), text: "Copy compacted",
                        title: "Copy selected contents, without indentation (Ctrl+Shift+C)"}
                ]},
            {type: "button", icon: fa("paste"), text: "Paste", title: "Paste clipboard contents (Ctrl+V)"}
        ]},
        {type: "separator"},
        {type: "row", items: [
            {type: "column", items: [
                {type: "button", icon: fa("clone"), text: "Duplicate", title: "Duplicate selected contents (Ctrl+D)"},
                {type: "button", icon: fa("crop-simple"), text: "Extract", title: "Extract selected contents"},
                {type: "button", icon: fa("arrow-down-short-wide"), text: "Sort", title: "Sort array or object contents"},
                {type: "button", icon: fa("filter"), text: "Transform",
                    title: "Transform array or object contents (filter, sort, project)"},
                {type: "button", icon: fa("trash-can"), text: "Remove", title: "Remove selected contents (Delete)"}
            ]},
            {type: "column", items: [
                {type: "label", text: I},
                {type: "button", icon: target, text: "Structure", title: I + " structure like the first item in the array"},
                {type: "button", icon: target, text: "Object", title: I + " object"},
                {type: "button", icon: target, text: "Array", title: I + " array"},
                {type: "button", icon: target, text: "Value", title: I + " value"}
            ]}
        ]},
        {type: "separator"},
        {type: "row", items: [
            {type: "button", icon: fa("square-caret-up"), text: "Insert before",
                title: "Select area before current entry to insert or paste contents"},
            {type: "button", icon: fa("square-caret-down"), text: "Insert after",
                title: "Select area after current entry to insert or paste contents"}
        ]}
    ];
}

function table_context_menu()
{
    return [
        {type: "separator"},
        {type: "row", items: [
            {type: "column", items: [
                {type: "label", text: "Table cell:"},
                {type: "dropdown-button", width: "11em",
                    main: {type: "button", icon: fa("pen"), text: "Edit",
                        title: "Edit the value (Double-click on the value)"},
                    items: [
                        {type: "button", icon: fa("pen"), text: "Edit", title: "Edit the value (Double-click on the value)"},
                        {type: "button", icon: fa("square-check"), text: "Enforce string",
                            title: "Enforce keeping the value as string when it contains a numeric value"}
                    ]},
                {type: "dropdown-button", width: "10em",
                    main: {type: "button", icon: fa("scissors"), text: "Cut",
                        title: "Cut selected contents, formatted with indentation (Ctrl+X)"},
                    items: [
                        {type: "button", icon: fa("scissors"), text: "Cut formatted", title: "(Ctrl+X)"},
                        {type: "button", icon: fa("scissors"), text: "Cut compacted", title: "(Ctrl+Shift+X)"}
                    ]},
                {type: "dropdown-button", width: "12em",
                    main: {type: "button", icon: fa("copy"), text: "Copy",
                        title: "Copy selected contents, formatted with indentation (Ctrl+C)"},
                    items: [
                        {type: "button", icon: fa("copy"), text: "Copy formatted", title: "(Ctrl+C)"},
                        {type: "button", icon: fa("copy"), text: "Copy compacted", title: "(Ctrl+Shift+C)"}
                    ]},
                {type: "button", icon: fa("paste"), text: "Paste", title: "Paste clipboard contents (Ctrl+V)"},
                {type: "button", icon: fa("trash-can"), text: "Remove", title: "Remove selected contents (Delete)"}
            ]},
            {type: "column", items: [
                {type: "label", text: "Table row:"},
                {type: "button", icon: fa("pen"), text: "Edit row", title: "Edit the current row"},
                {type: "button", icon: fa("clone"), text: "Duplicate row", title: "Duplicate the current row (Ctrl+D)"},
                {type: "button", icon: fa("plus"), text: "Insert before", title: "Insert a row before the current row"},
                {type: "button", icon: fa("plus"), text: "Insert after", title: "Insert a row after the current row"},
                {type: "button", icon: fa("trash-can"), text: "Remove row", title: "Remove current row"}
            ]}
        ]}
    ];
}

/*  Every button of a context menu, in the order it draws them, as
 *  {text, title} -- a dropdown's main, then its list.  */
function context_buttons(items)
{
    const out = [];
    const walk = (it) => {
        if(!it) {
            return;
        }
        if(it.type === "button") {
            out.push({text: it.text, title: it.title});
        } else if(it.type === "label") {
            out.push({label: it.text});
        } else if(it.type === "dropdown-button") {
            walk(it.main);
            (it.items || []).forEach(walk);
        } else if(it.type === "row" || it.type === "column") {
            (it.items || []).forEach(walk);
        }
    };
    items.forEach(walk);
    return out;
}

/*  The editor: draws its menu from what onRenderMenu answers, into a
 *  `.jse-menu` of its target, and again when handed a new one.  */
const editors = vi.hoisted(() => []);
vi.mock("vanilla-jsoneditor", () => ({
    createJSONEditor: (opts) => {
        const ed = {
            target: opts.target,
            props: Object.assign({}, opts.props),
            content: {text: ""},
            draws: 0,
            draw() {
                const items = this.props.onRenderMenu
                    ? this.props.onRenderMenu(TREE_MENU.map((i) => Object.assign({}, i)), {mode: "tree"})
                    : TREE_MENU;
                const $menu = document.createElement("div");
                $menu.className = "jse-menu";
                for(const item of items) {
                    if(item.type !== "button") {
                        continue;
                    }
                    const $b = document.createElement("button");
                    $b.className = `jse-button ${item.className}`;
                    $b.setAttribute("title", item.title);
                    $b.textContent = item.text || "";
                    $menu.appendChild($b);
                }
                const $old = this.target.querySelector(".jse-menu");
                if($old) {
                    $old.remove();
                }
                this.target.appendChild($menu);
                this.draws++;
            },
            updateProps(props) {
                Object.assign(this.props, props);
                this.draw();
            },
            /*  A right click: the popup, inside its own element, from what
             *  onRenderContextMenu answers -- a dropdown as the editor
             *  draws it, its main button and the arrow that opens it.  */
            open_context_menu(mode) {
                const make = mode === "table" ? table_context_menu() : tree_context_menu(true);
                const items = this.props.onRenderContextMenu
                    ? this.props.onRenderContextMenu(make, {mode: mode}) : make;
                const $menu = document.createElement("div");
                $menu.className = "jse-contextmenu";
                const button = (item) => {
                    const $b = document.createElement("button");
                    $b.className = "jse-context-menu-button";
                    $b.setAttribute("title", item.title || "");
                    $b.textContent = item.text || "";
                    return $b;
                };
                const walk = (it) => {
                    if(!it) {
                        return;
                    }
                    if(it.type === "button") {
                        $menu.appendChild(button(it));
                    } else if(it.type === "dropdown-button") {
                        const $d = document.createElement("div");
                        $d.className = "jse-dropdown-button";
                        $d.appendChild(button(it.main));
                        const $open = document.createElement("button");
                        $open.setAttribute("data-type", "jse-open-dropdown");
                        $d.appendChild($open);
                        $menu.appendChild($d);
                        (it.items || []).forEach(walk);
                    } else if(it.type === "row" || it.type === "column") {
                        (it.items || []).forEach(walk);
                    }
                };
                items.forEach(walk);
                this.target.appendChild($menu);
                return $menu;
            },
            get() {
                return this.content;
            },
            set(content) {
                this.content = content;
            },
            destroy() {
            },
        };
        ed.draw();
        editors.push(ed);
        return ed;
    },
}));

const {
    SDATA_END, gclass_create,
    gobj_start_up, gobj_create_yuno, gobj_create, gobj_create_pure_child,
    gobj_start, gobj_read_attr,
    set_log_callback,
} = await import("@yuneta/gobj-js");
const {register_c_yui_shell, yui_shell_set_translator, yui_shell_language_changed} =
    await import("./c_yui_shell.js");
const {register_c_yui_form} = await import("./c_yui_form.js");
const {json_editor_menu_items, json_editor_context_menu_items, name_json_editor_menu} =
    await import("./form_json_editor_names.js");

const ES = {
    "expand all": "desplegar todo",
    "collapse all": "plegar todo",
    "sort": "Ordenar",
    "transform": "Transformar",
    "search": "buscar",
    "open context menu": "Abrir el menú contextual",
    "undo": "Deshacer",
    "redo": "Rehacer",
    "text view": "Vista de texto",
    "tree view": "Vista de árbol",
    "table view": "Vista de tabla",
    "text mode": "texto",
    "tree mode": "árbol",
    "table mode": "tabla",
    "edit key": "Editar clave",
    "edit value": "Editar valor",
    "enforce string": "Forzar texto",
    "cut": "Cortar",
    "cut formatted": "Cortar con formato",
    "cut compacted": "Cortar compactado",
    "copy": "Copiar",
    "copy formatted": "Copiar con formato",
    "copy compacted": "Copiar compactado",
    "paste": "Pegar",
    "duplicate": "Duplicar",
    "extract": "Extraer",
    "remove": "Quitar",
    "convert to": "Convertir en:",
    "insert": "Insertar:",
    "structure": "Estructura",
    "object": "Objeto",
    "array": "Lista",
    "value": "Valor",
    "insert before": "Insertar antes",
    "insert after": "Insertar después",
    "table cell": "Celda:",
    "table row": "Fila:",
    "edit row": "Editar fila",
    "duplicate row": "Duplicar fila",
    "remove row": "Quitar fila",
    "more options": "Más opciones",
};

const logged = [];
let i18next = null;
let yuno = null;
let seq = 0;

beforeAll(async () => {
    i18next = (await import("i18next")).default;
    await i18next.init({lng: "en", resources: {es: {translation: ES}}});
    gobj_start_up(null, null, null, null, null, null, null);
    set_log_callback((level, msg) => {
        logged.push({level: String(level), msg: String(msg)});
    });
    gclass_create("C_TEST_JSE_HOST", [], [["ST_IDLE", []]], {}, 0, [SDATA_END()], {}, 0, 0, 0, 0);
    gclass_create(
        "C_TEST_JSE_APP",
        [["EV_RECORD_CHANGED", 0], ["EV_SAVE_RECORD", 0]],
        [["ST_IDLE", [
            ["EV_RECORD_CHANGED", () => 0, null],
            ["EV_SAVE_RECORD", () => 0, null],
        ]]],
        {}, 0, [SDATA_END()], {}, 0, 0, 0, 0
    );
    register_c_yui_shell();
    register_c_yui_form();
    yuno = gobj_create_yuno("jse_names_yuno", "C_TEST_JSE_HOST", {});
    gobj_start(yuno);
});

afterEach(async () => {
    editors.length = 0;
    logged.length = 0;
    await i18next.changeLanguage("en");
});

function errors()
{
    return logged.filter((l) => l.level === "error").map((l) => l.msg);
}

/*  A posted event is delivered on the next turn of the loop.  */
function next_turn()
{
    return new Promise((resolve) => setTimeout(resolve, 0));
}

function button($menu, cls)
{
    return $menu.querySelector(`.${cls}`);
}

describe("json_editor_menu_items(): what the editor draws", () => {
    test("titles translated, the shortcut kept; the mode buttons' name and text", async () => {
        await i18next.changeLanguage("es");
        const items = json_editor_menu_items(TREE_MENU);
        const by = (cls) => items.find((i) => String(i.className || "").includes(cls));

        expect(by("jse-undo").title).toBe("Deshacer (Ctrl+Z)");
        expect(by("jse-redo").title).toBe("Rehacer (Ctrl+Shift+Z)");
        expect(by("jse-search").title).toBe("buscar (Ctrl+F)");
        expect(by("jse-sort").title).toBe("Ordenar");
        expect(by("jse-contextmenu").title).toBe("Abrir el menú contextual");

        const tree = items.find((i) => i.text === "árbol");
        expect(tree.title).toBe("Vista de árbol");
        expect(tree.className).toContain("yui-jse-mode-tree");
        expect(tree.className).toContain("jse-selected");       // the editor's state is kept

        /*  What it does not know, and what is no button, as it came.  */
        expect(by("jse-something-new")).toBe(TREE_MENU[TREE_MENU.length - 1]);
        expect(items[2]).toBe(TREE_MENU[2]);
    });
});

describe("name_json_editor_menu(): the drawn buttons", () => {
    test("an aria-label with its key, and aria-pressed on the mode buttons", async () => {
        await i18next.changeLanguage("es");
        const $editor = document.createElement("div");
        const $menu = document.createElement("div");
        $menu.className = "jse-menu";
        for(const cls of ["jse-undo", "jse-group-button yui-jse-mode-tree jse-selected",
                          "jse-group-button yui-jse-mode-table", "jse-something-new"]) {
            const $b = document.createElement("button");
            $b.className = `jse-button ${cls}`;
            $menu.appendChild($b);
        }
        $editor.appendChild($menu);

        expect(name_json_editor_menu($editor)).toBe(3);
        const $undo = button($menu, "jse-undo");
        expect($undo.getAttribute("aria-label")).toBe("Deshacer");
        expect($undo.getAttribute("data-i18n-aria-label")).toBe("undo");
        const $tree = button($menu, "yui-jse-mode-tree");
        expect($tree.getAttribute("aria-label")).toBe("Vista de árbol");
        expect($tree.getAttribute("data-i18n-aria-label")).toBe("tree view");
        expect($tree.getAttribute("aria-pressed")).toBe("true");
        expect(button($menu, "yui-jse-mode-table").getAttribute("aria-pressed")).toBe("false");
        expect(button($menu, "jse-something-new").getAttribute("aria-label")).toBe(null);
    });
});

describe("json_editor_context_menu_items(): the context menu, by icon and place", () => {
    test("the tree mode's menu, converting a value", async () => {
        await i18next.changeLanguage("es");
        const items = json_editor_context_menu_items(tree_context_menu(true), {mode: "tree"});
        expect(context_buttons(items)).toEqual([
            {text: "Editar clave", title: "Editar clave"},
            {text: "Editar valor", title: "Editar valor"},              // "Edit object" too
            {text: "Editar valor", title: "Editar valor"},
            {text: "Forzar texto", title: "Forzar texto"},
            {text: "Cortar", title: "Cortar (Ctrl+X)"},
            {text: "Cortar con formato", title: "Cortar con formato (Ctrl+X)"},
            {text: "Cortar compactado", title: "Cortar compactado (Ctrl+Shift+X)"},
            {text: "Copiar", title: "Copiar (Ctrl+C)"},
            {text: "Copiar con formato", title: "Copiar con formato (Ctrl+C)"},
            {text: "Copiar compactado", title: "Copiar compactado (Ctrl+Shift+C)"},
            {text: "Pegar", title: "Pegar (Ctrl+V)"},
            {text: "Duplicar", title: "Duplicar (Ctrl+D)"},
            {text: "Extraer", title: "Extraer"},
            {text: "Ordenar", title: "Ordenar"},
            {text: "Transformar", title: "Transformar"},
            {text: "Quitar", title: "Quitar"},
            {label: "Convertir en:"},
            {text: "Estructura", title: "Estructura"},
            {text: "Objeto", title: "Objeto"},
            {text: "Lista", title: "Lista"},
            {text: "Valor", title: "Valor"},
            {text: "Insertar antes", title: "Insertar antes"},
            {text: "Insertar después", title: "Insertar después"},
        ]);
    });

    test("the tree mode's menu, inserting: the label says so, by the icon", async () => {
        await i18next.changeLanguage("es");
        const items = json_editor_context_menu_items(tree_context_menu(false), {mode: "tree"});
        const labels = context_buttons(items).filter((b) => b.label);
        expect(labels).toEqual([{label: "Insertar:"}]);
    });

    test("the table mode's menu: the cell and the row", async () => {
        await i18next.changeLanguage("es");
        const items = json_editor_context_menu_items(table_context_menu(), {mode: "table"});
        expect(context_buttons(items)).toEqual([
            {label: "Celda:"},
            {text: "Editar valor", title: "Editar valor"},
            {text: "Editar valor", title: "Editar valor"},
            {text: "Forzar texto", title: "Forzar texto"},
            {text: "Cortar", title: "Cortar (Ctrl+X)"},
            {text: "Cortar con formato", title: "Cortar con formato (Ctrl+X)"},
            {text: "Cortar compactado", title: "Cortar compactado (Ctrl+Shift+X)"},
            {text: "Copiar", title: "Copiar (Ctrl+C)"},
            {text: "Copiar con formato", title: "Copiar con formato (Ctrl+C)"},
            {text: "Copiar compactado", title: "Copiar compactado (Ctrl+Shift+C)"},
            {text: "Pegar", title: "Pegar (Ctrl+V)"},
            {text: "Quitar", title: "Quitar"},
            {label: "Fila:"},
            {text: "Editar fila", title: "Editar fila"},
            {text: "Duplicar fila", title: "Duplicar fila (Ctrl+D)"},
            {text: "Insertar antes", title: "Insertar antes"},
            {text: "Insertar después", title: "Insertar después"},
            {text: "Quitar fila", title: "Quitar fila"},
        ]);
    });

    test("what it does not know comes back as it came, never mislabelled", () => {
        const odd = {type: "button", icon: fa("rocket"), text: "Launch", title: "Launch it"};
        const plain = {type: "button", text: "No icon", title: "No icon at all"};
        const items = json_editor_context_menu_items([odd, plain, {type: "separator"}], {mode: "tree"});
        expect(items[0]).toBe(odd);
        expect(items[1]).toBe(plain);
        expect(json_editor_context_menu_items(undefined, {})).toBe(undefined);
    });
});

describe("a json field of C_YUI_FORM", () => {
    function build(parent)
    {
        const app = gobj_create_pure_child(`jse_app${++seq}`, "C_TEST_JSE_APP", {}, parent || yuno);
        gobj_start(app);
        const form = gobj_create_pure_child(`jse_form${seq}`, "C_YUI_FORM", {
            template: [
                {id: "id", header: "id", type: "string", flag: ["persistent", "required"]},
                {id: "settings", header: "settings", type: "dict", flag: ["persistent", "writable"]},
            ],
            record: {id: "a", settings: {}},
            render_mode: "edit",
            editable: true,
        }, app);
        gobj_start(form);
        expect(editors.length).toBe(1);
        return {form, editor: editors[0]};
    }

    test("names its menu after the render, through the FSM", async () => {
        const {editor} = build();
        const $menu = editor.target.querySelector(".jse-menu");
        /*  Drawn translated at once; named on the next turn, when the
         *  event the render posted is handled.  */
        expect(button($menu, "jse-undo").getAttribute("title")).toBe("undo (Ctrl+Z)");
        expect(button($menu, "jse-undo").getAttribute("aria-label")).toBe(null);
        await next_turn();
        expect(button($menu, "jse-undo").getAttribute("aria-label")).toBe("undo");
        expect(button($menu, "jse-undo").getAttribute("data-i18n-aria-label")).toBe("undo");
        expect(button($menu, "yui-jse-mode-tree").getAttribute("aria-pressed")).toBe("true");
        expect(errors()).toEqual([]);
    });

    test("names its context menu when it opens: its buttons, and the arrow of a dropdown", async () => {
        await i18next.changeLanguage("es");
        const {editor} = build();
        const $menu = editor.open_context_menu("tree");
        const $cut = [...$menu.querySelectorAll(".jse-context-menu-button")]
            .find(($b) => $b.textContent === "Cortar");
        expect(!!$cut).toBe(true);                             // drawn translated at once
        expect($cut.getAttribute("title")).toBe("Cortar (Ctrl+X)");
        await next_turn();
        expect($cut.getAttribute("aria-label")).toBe("Cortar");
        const $arrows = $menu.querySelectorAll('button[data-type="jse-open-dropdown"]');
        expect($arrows.length).toBe(3);
        for(const $a of $arrows) {
            expect($a.getAttribute("title")).toBe("Más opciones");
            expect($a.getAttribute("aria-label")).toBe("Más opciones");
            expect($a.getAttribute("data-i18n-aria-label")).toBe("more options");
        }
        expect(errors()).toEqual([]);
    });

    test("draws its menu again in the new language when the shell says it changed", async () => {
        const shell = gobj_create(`jse_shell${++seq}`, "C_YUI_SHELL",
            {config: {shell: {}}, use_hash: false}, yuno);
        gobj_start(shell);
        logged.length = 0;      /*  the shell's own start: no route table here  */
        const {editor} = build(shell);
        await next_turn();
        const draws = editor.draws;

        await i18next.changeLanguage("es");
        yui_shell_set_translator(shell, i18next.t.bind(i18next));
        yui_shell_language_changed(shell);
        expect(editor.draws).toBe(draws + 1);

        await next_turn();
        const $menu = editor.target.querySelector(".jse-menu");
        expect(button($menu, "jse-undo").getAttribute("title")).toBe("Deshacer (Ctrl+Z)");
        expect(button($menu, "jse-undo").getAttribute("aria-label")).toBe("Deshacer");
        const $tree = button($menu, "yui-jse-mode-tree");
        expect($tree.textContent).toBe("árbol");
        expect($tree.getAttribute("aria-label")).toBe("Vista de árbol");
        expect(errors()).toEqual([]);
    });
});
