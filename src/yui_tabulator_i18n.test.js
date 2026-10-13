/***********************************************************************
 *          yui_tabulator_i18n.test.js
 *
 *      The names given AFTER the render to what Tabulator draws for
 *      itself: the header filters and the row-selection boxes carry
 *      an aria-label AND a title, like every control.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {describe, it, expect} from "vitest";

import {
    yui_tabulator_name_filters,
    yui_tabulator_name_row_selects,
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
});
