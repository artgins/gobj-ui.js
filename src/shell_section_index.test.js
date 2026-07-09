/***********************************************************************
 *          shell_section_index.test.js
 *
 *      Unit tests for the section-index target synthesis.
 ***********************************************************************/
import { test, expect } from "vitest";
import {
    section_index_target,
    secondary_nav_renders,
} from "./shell_section_index.js";


const SUB_ITEMS = [
    {id: "insights", name: "insights", route: "/reports/insights"},
    {id: "budgets",  name: "budgets",  route: "/reports/budgets"},
];

function reports_item(extra_sub, extra_item)
{
    return Object.assign({
        id: "reports",
        name: "reports",
        route: "/reports",
        submenu: Object.assign({
            render: {"top-sub": "tabs"},
            items: SUB_ITEMS,
        }, extra_sub || {}),
    }, extra_item || {});
}


/***************************************************************
 *  Opt-in gate
 ***************************************************************/
test("no submenu.index → null (redirect-to-default preserved)", () => {
    expect(section_index_target("primary", reports_item())).toBe(null);
});

test("index=false → null", () => {
    expect(section_index_target("primary", reports_item({index: false}))).toBe(null);
});

test("item without route → null", () => {
    let item = reports_item({index: true});
    delete item.route;
    expect(section_index_target("primary", item)).toBe(null);
});

test("explicit inline target wins over index", () => {
    let item = reports_item(
        {index: true},
        {target: {stage: "main", gclass: "C_APP_VIEW"}}
    );
    expect(section_index_target("primary", item)).toBe(null);
});

test("submenu without items array → null", () => {
    let item = reports_item({index: true});
    item.submenu.items = null;
    expect(section_index_target("primary", item)).toBe(null);
});

test("no submenu at all → null", () => {
    expect(section_index_target("primary", {id: "x", route: "/x"})).toBe(null);
});


/***************************************************************
 *  Synthesis
 ***************************************************************/
test("index=true synthesizes a cards C_YUI_NAV target in stage 'main'", () => {
    let t = section_index_target("primary", reports_item({index: true}));
    expect(t).not.toBe(null);
    expect(t.stage).toBe("main");
    expect(t.gclass).toBe("C_YUI_NAV");
    expect(t.kw.layout).toBe("cards");
    expect(t.kw.level).toBe("secondary");
    expect(t.kw.menu_id).toBe("index.primary.reports");
    expect(t.kw.nav_label).toBe("reports");
    /*  Same array reference: a later yui_shell_set_submenu() refresh
     *  of kw.menu_items must be observable by the next mount. */
    expect(t.kw.menu_items).toBe(SUB_ITEMS);
});

test("index={stage} overrides the stage", () => {
    let t = section_index_target("primary", reports_item({index: {stage: "aux"}}));
    expect(t.stage).toBe("aux");
});

test("nav_label falls back to the item id", () => {
    let item = reports_item({index: true});
    delete item.name;
    let t = section_index_target("primary", item);
    expect(t.kw.nav_label).toBe("reports");
});


/***************************************************************
 *  secondary_nav_renders
 ***************************************************************/
test("no index → the declared render, unchanged, alone", () => {
    let renders = secondary_nav_renders(reports_item(), {layout: "tabs"});
    expect(renders).toEqual([{layout: "tabs"}]);
});

test("index → tabs constrained to >=tablet + mobile backbar", () => {
    let renders = secondary_nav_renders(
        reports_item({index: true}), {layout: "tabs"}
    );
    expect(renders.length).toBe(2);
    expect(renders[0]).toEqual({layout: "tabs", show_on: ">=tablet"});
    expect(renders[1]).toEqual({
        layout: "backbar",
        show_on: "<tablet",
        back_route: "/reports"
    });
});

test("explicit show_on on the declared render wins", () => {
    let renders = secondary_nav_renders(
        reports_item({index: true}), {layout: "tabs", show_on: ">=desktop"}
    );
    expect(renders[0].show_on).toBe(">=desktop");
});

test("index {backbar:false} suppresses the backbar", () => {
    let renders = secondary_nav_renders(
        reports_item({index: {backbar: false}}), {layout: "tabs"}
    );
    expect(renders.length).toBe(1);
    expect(renders[0].show_on).toBe(">=tablet");
});

test("index {backbar:{show_on}} tunes the backbar breakpoints", () => {
    let renders = secondary_nav_renders(
        reports_item({index: {backbar: {show_on: "<desktop"}}}),
        {layout: "tabs"}
    );
    expect(renders[1].show_on).toBe("<desktop");
});

test("string layout shorthand is normalized", () => {
    let renders = secondary_nav_renders(reports_item(), "tabs");
    expect(renders).toEqual([{layout: "tabs"}]);
});

test("input render object is not mutated", () => {
    let declared = {layout: "tabs"};
    secondary_nav_renders(reports_item({index: true}), declared);
    expect(declared).toEqual({layout: "tabs"});
});
