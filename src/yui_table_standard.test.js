/***********************************************************************
 *          yui_table_standard.test.js
 *
 *      The standard table (yui_table_standard.js): a filter on every
 *      column that holds data, the paginator always with every row
 *      loaded, and the row count of the footer in the table's locale.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {describe, test, expect} from "vitest";
import {install_dom_double} from "../test/dom_double.js";

install_dom_double();

import {
    YUI_TABLE_FILTER_MIN_WIDTH,
    yui_table_paging,
    yui_table_filters,
    yui_tree_filter,
    yui_table_wire,
} from "./yui_table_standard.js";

describe("the paging", () => {
    test("is local, always on, with the standard sizes", () => {
        let s = yui_table_paging();
        expect(s.pagination).toBe(true);
        expect(s.paginationMode).toBe("local");
        expect(s.paginationSize).toBe(25);
        expect(s.paginationSizeSelector).toEqual([25, 50, 100, true]);
        expect(typeof s.paginationCounter).toBe("function");
    });

    test("a size of its own is offered by the selector", () => {
        let s = yui_table_paging({size: 10});
        expect(s.paginationSize).toBe(10);
        expect(s.paginationSizeSelector).toEqual([10, 25, 50, 100, true]);
    });

    test("the sizes of the host are kept, and not shared between tables", () => {
        let a = yui_table_paging({size: 50, sizes: [50, 200, true]});
        expect(a.paginationSizeSelector).toEqual([50, 200, true]);
        let b = yui_table_paging();
        b.paginationSizeSelector.push(7);
        expect(yui_table_paging().paginationSizeSelector).toEqual([25, 50, 100, true]);
    });
});

describe("the row count", () => {
    function page_module(word)
    {
        let bindings = [];
        return {
            bindings: bindings,
            table: {
                modules: {
                    localize: {
                        langBind(path, cb) {
                            bindings.push(path);
                            cb(word);
                        }
                    }
                }
            }
        };
    }

    test("says every active row, all pages together, in the table's language", () => {
        let counter = yui_table_paging().paginationCounter;
        let page = page_module("filas");
        let $el = counter.call(page, 25, 26, 2, 113, 5);
        expect($el.textContent).toBe("113 filas");
        expect(page.bindings).toEqual(["pagination|counter|rows"]);
    });

    test("an empty table says 0", () => {
        let counter = yui_table_paging().paginationCounter;
        let $el = counter.call(page_module("rows"), 25, 0, 1, 0, 0);
        expect($el.textContent).toBe("0 rows");
    });

    test("is a node, never a string Tabulator would put in as html", () => {
        let counter = yui_table_paging().paginationCounter;
        let $el = counter.call(page_module("rows"), 25, 1, 1, 3, 1);
        expect(typeof $el).toBe("object");
        expect($el.className).toBe("YUI_TABLE_COUNT");
    });

    test("without a localize module it still counts, in English", () => {
        let counter = yui_table_paging().paginationCounter;
        let $el = counter.call({}, 25, 1, 1, 3, 1);
        expect($el.textContent).toBe("3 rows");
    });
});

describe("the filters", () => {
    test("a column of data gets a text box, and room for it", () => {
        let [c] = yui_table_filters([{title: "Name", field: "name"}]);
        expect(c.headerFilter).toBe("input");
        expect(c.minWidth).toBe(YUI_TABLE_FILTER_MIN_WIDTH);
    });

    test("a width set by the host is kept", () => {
        let [a, b] = yui_table_filters([
            {field: "a", width: 110},
            {field: "b", minWidth: 220},
        ]);
        expect(a.headerFilter).toBe("input");
        expect(a.minWidth).toBeUndefined();
        expect(a.width).toBe(110);
        expect(b.minWidth).toBe(220);
    });

    test("a tick gets a three-state tick", () => {
        let [c] = yui_table_filters([{field: "enabled", formatter: "tickCross"}]);
        expect(c.headerFilter).toBe("tickCross");
        expect(c.headerFilterParams).toEqual({tristate: true});
    });

    test("a column that says something keeps it", () => {
        let own = {field: "kind", headerFilter: "list", headerFilterParams: {values: ["a"]}};
        let off = {field: "user_id", headerFilter: false};
        let [a, b] = yui_table_filters([own, off]);
        expect(a).toBe(own);
        expect(b).toBe(off);
    });

    test("a control is not filtered: no field, or a control formatter", () => {
        let none = {title: "", formatter: () => "x"};
        let select = {field: "_select", formatter: "rowSelection"};
        let [a, b] = yui_table_filters([none, select]);
        expect(a.headerFilter).toBeUndefined();
        expect(b.headerFilter).toBeUndefined();
    });

    test("the groups are walked, and nothing is changed in place", () => {
        let inner = {field: "x"};
        let group = {title: "G", columns: [inner]};
        let [g] = yui_table_filters([group]);
        expect(g.columns[0].headerFilter).toBe("input");
        expect(inner.headerFilter).toBeUndefined();
        expect(group.columns[0]).toBe(inner);
    });

    test("not a list: given back as it is", () => {
        expect(yui_table_filters(null)).toBe(null);
    });
});

describe("the filter of a tree", () => {
    const node = {
        host: "artgins",
        _children: [
            {label: "yuneta_agent"},
            {label: "controlcenter", _children: [{label: "auth_bff"}]},
        ]
    };
    const f = yui_tree_filter((d) => d.label || d.host);

    test("a row passes on its own text, in any case", () => {
        expect(f("ArtG", null, node)).toBe(true);
        expect(f("agent", null, node._children[0])).toBe(true);
    });

    test("a parent passes when a descendant matches, at any depth", () => {
        expect(f("control", null, node)).toBe(true);
        expect(f("bff", null, node)).toBe(true);
    });

    test("a row that does not match, with no descendant that does, fails", () => {
        expect(f("mqtt", null, node)).toBe(false);
        expect(f("control", null, node._children[0])).toBe(false);
    });

    test("an empty term passes everything", () => {
        expect(f("", null, node)).toBe(true);
        expect(f("   ", null, node)).toBe(true);
        expect(f(null, null, node)).toBe(true);
    });

    test("another child field, and a text_of that throws", () => {
        let g = yui_tree_filter((d) => d.name, "kids");
        expect(g("b", null, {name: "a", kids: [{name: "b"}]})).toBe(true);
        let bad = yui_tree_filter(() => {
            throw new Error("x");
        });
        expect(bad("a", null, {})).toBe(false);
    });

    test("with yui_table_filters, the column gets its text box", () => {
        let [c] = yui_table_filters([{field: "id", headerFilterFunc: f}]);
        expect(c.headerFilter).toBe("input");
        expect(c.headerFilterFunc).toBe(f);
    });
});

describe("the wiring", () => {
    test("names the filters when the table is built and on every rebuild", () => {
        let events = {};
        let table = {
            on(name, fn) {
                events[name] = fn;
            }
        };
        yui_table_wire(table, (k) => k);
        expect(Object.keys(events).sort()).toEqual(["columnsLoaded", "tableBuilt"]);
    });

    test("a table that is not there is ignored", () => {
        expect(() => yui_table_wire(null, (k) => k)).not.toThrow();
    });
});
