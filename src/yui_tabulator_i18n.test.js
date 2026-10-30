/***********************************************************************
 *          yui_tabulator_i18n.test.js
 *
 *      The names given AFTER the render to what Tabulator draws for
 *      itself: the header filters and the row-selection boxes carry
 *      an aria-label AND a title, like every control. And the name of
 *      the editor of a cell, asked at the moment of editing.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {describe, it, expect} from "vitest";
import {set_log_callback} from "@yuneta/gobj-js";

import {
    yui_tabulator_name_filters,
    yui_tabulator_name_row_selects,
    yui_tabulator_name_editor,
    yui_tabulator_relocalize,
} from "./yui_tabulator_i18n.js";

/*  An element double: attributes, and the one child a selector finds.  */
function element(child)
{
    const attrs = {};
    return {
        attrs,
        setAttribute: (k, v) => {
            attrs[k] = String(v);
        },
        getAttribute: (k) => (k in attrs) ? attrs[k] : null,
        querySelector: () => child || null,
        querySelectorAll: () => (child ? [child] : []),
    };
}

/*  A column double with its header filter input.  */
function column(title, $input)
{
    const $el = element($input);
    return {
        getElement: () => $el,
        getDefinition: () => ({title: title}),
    };
}

const t = (key, opts) => (key === "filter by column")
    ? `Filtrar por ${opts.column}`
    : (key === "select row" ? "Seleccionar fila" : key);

describe("yui_tabulator_name_filters", () => {
    it("names each header filter with an aria-label and a title", () => {
        const $a = element();
        const $b = element();
        const table = {getColumns: () => [column("Id", $a), column("Name", $b)]};

        yui_tabulator_name_filters(table, t);

        expect($a.attrs["aria-label"]).toBe("Filtrar por Id");
        expect($a.attrs["title"]).toBe("Filtrar por Id");
        expect($b.attrs["aria-label"]).toBe("Filtrar por Name");
        expect($b.attrs["title"]).toBe("Filtrar por Name");
    });

    it("leaves a column without a filter alone", () => {
        const table = {getColumns: () => [column("Id", null)]};
        expect(() => yui_tabulator_name_filters(table, t)).not.toThrow();
    });
});

describe("yui_tabulator_name_row_selects", () => {
    it("renames Tabulator's English box with an aria-label and a title, and their keys", () => {
        const $box = element();
        $box.setAttribute("aria-label", "Select Row");
        const table = {element: element($box)};

        yui_tabulator_name_row_selects(table, t);

        expect($box.attrs["aria-label"]).toBe("Seleccionar fila");
        expect($box.attrs["data-i18n-aria-label"]).toBe("select row");
        expect($box.attrs["title"]).toBe("Seleccionar fila");
        expect($box.attrs["data-i18n-title"]).toBe("select row");
    });

    /*  Up to 7.26.46 the header's box -- which selects every row -- was
     *  named "select row" too.  */
    it("names the header's box for what it does: select all rows", () => {
        const $box = element();
        $box.setAttribute("aria-label", "Select Row");
        $box.closest = (sel) => (sel === ".tabulator-header" ? {} : null);
        const table = {element: element($box)};

        yui_tabulator_name_row_selects(table, (key) => key === "select all rows" ? "Seleccionar todas las filas" : key);

        expect($box.attrs["aria-label"]).toBe("Seleccionar todas las filas");
        expect($box.attrs["data-i18n-aria-label"]).toBe("select all rows");
        expect($box.attrs["title"]).toBe("Seleccionar todas las filas");
        expect($box.attrs["data-i18n-title"]).toBe("select all rows");
    });

    /*  Up to 7.26.46 only Tabulator's English literal was matched, so a
     *  box named once was never named again: a language change through
     *  yui_tabulator_relocalize() (C_YUI_FORM's EV_LANGUAGE_CHANGED) left
     *  it in the old language.  */
    it("names again, in the new language, a box it named before", () => {
        const $box = element();
        $box.setAttribute("aria-label", "Select Row");
        /*  Found again by the mark it left, not by Tabulator's literal  */
        const table = {element: {querySelectorAll: (sel) => (
            sel.includes("Select Row") && $box.attrs["aria-label"] !== "Select Row" &&
            !sel.includes("data-yui-row-select") ? [] : [$box])}};

        yui_tabulator_name_row_selects(table, t);
        expect($box.attrs["aria-label"]).toBe("Seleccionar fila");

        yui_tabulator_name_row_selects(table, (key) => key === "select row" ? "Select the row" : key);
        expect($box.attrs["aria-label"]).toBe("Select the row");
        expect($box.attrs["title"]).toBe("Select the row");
    });
});

describe("yui_tabulator_name_editor", () => {
    /*  Tabulator calls a FUNCTION editorParams with the cell when it starts
     *  editing it, and every built-in editor writes the elementAttributes
     *  it answers onto the box it draws (the editable
     *  cells had no name).  */
    it("names the editor after the column, asked at the moment of editing", () => {
        let lang = "en";
        const names = {en: "Value", es: "Valor"};
        const def = {field: "value", editor: "input", editorParams: {selectContents: true}};
        yui_tabulator_name_editor(def, () => names[lang]);

        expect(typeof def.editorParams).toBe("function");
        let params = def.editorParams({});
        expect(params.selectContents).toBe(true);           // what it had stays
        expect(params.elementAttributes).toEqual({"aria-label": "Value", title: "Value"});

        lang = "es";                                        // a language change
        params = def.editorParams({});
        expect(params.elementAttributes).toEqual({"aria-label": "Valor", title: "Valor"});
    });

    it("keeps a function editorParams, and a name the column gave itself", () => {
        const def = {
            editor: "list",
            editorParams: (cell) => ({values: cell.values,
                elementAttributes: {"aria-label": "its own", maxlength: "3"}})
        };
        yui_tabulator_name_editor(def, () => "Kind");
        const params = def.editorParams({values: ["a", "b"]});
        expect(params.values).toEqual(["a", "b"]);
        expect(params.elementAttributes).toEqual(
            {"aria-label": "its own", title: "Kind", maxlength: "3"});
    });

    it("leaves a column without an editor, and a name it cannot give, alone", () => {
        const plain = {field: "x"};
        yui_tabulator_name_editor(plain, () => "X");
        expect(plain.editorParams).toBe(undefined);

        const def = {editor: "input", editorParams: {a: 1}};
        yui_tabulator_name_editor(def, () => "");
        expect(def.editorParams({})).toEqual({a: 1});
    });
});

describe("yui_tabulator_relocalize", () => {
    /*  A table double: what the localize module is given, and the
     *  locale it is set to.  */
    function table()
    {
        const installed = {};
        const tb = {
            options: {},
            installed,
            locale: null,
            modules: {localize: {installLang: (name, strings) => {
                installed[name] = strings;
            }}},
            setLocale: (name) => {
                tb.locale = name;
            },
            getColumns: () => [],
            element: element(null),
        };
        return tb;
    }

    it("hands the column titles to the locale, where Tabulator binds them", () => {
        const tb = table();
        yui_tabulator_relocalize(tb, t, {device_id: "Id dispositivo", value: "Valor"});
        expect(tb.locale).toBeTruthy();
        expect(tb.installed[tb.locale].columns).toEqual(
            {device_id: "Id dispositivo", value: "Valor"});
        expect(tb.installed[tb.locale].pagination).toBeTruthy();
    });

    it("without titles, the locale carries none, as before", () => {
        const tb = table();
        yui_tabulator_relocalize(tb, t);
        expect(tb.installed[tb.locale].columns).toBe(undefined);
    });

    /*  A column double, a group when it has `columns`.  */
    function col(def, subs)
    {
        return {
            getDefinition: () => def,
            getSubColumns: () => subs || [],
        };
    }

    /*  Tabulator binds a title to the locale by `field`, and a GROUP has
     *  none: its title stayed in the language the table was built in,
     *  and nothing said so. A group given a `field` is bound like any
     *  other column (checked on Tabulator 6.6 in a browser).  */
    it("a column group with no field is said; one with a field is a title like any other", () => {
        const warned = [];
        set_log_callback((level, msg) => {
            if(String(level) === "warning") {
                warned.push(String(msg));
            }
        });
        try {
            const a = col({field: "a", title: "A"});
            const b = col({field: "b", title: "B"});
            const tb = table();
            tb.getColumns = (structured) => structured ?
                [col({field: "x", title: "X"}), col({title: "Sizes", columns: [{}, {}]}, [a, b])] : [];
            yui_tabulator_relocalize(tb, t, {x: "Equis", a: "A es", b: "B es"});
            expect(warned.filter((m) => m.includes("'Sizes'") && m.includes("no field")).length).toBe(1);

            warned.length = 0;
            const named = table();
            named.getColumns = (structured) => structured ?
                [col({title: "Sizes", field: "sizes", columns: [{}, {}]}, [a, b])] : [];
            yui_tabulator_relocalize(named, t, {sizes: "Tallas", a: "A es", b: "B es"});
            expect(warned).toEqual([]);
            expect(named.installed[named.locale].columns.sizes).toBe("Tallas");

            /*  Without titles nothing is asked of the columns.  */
            yui_tabulator_relocalize(tb, t);
            expect(warned).toEqual([]);
        } finally {
            set_log_callback(null);
        }
    });
});
