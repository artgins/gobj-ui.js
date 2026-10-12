/***********************************************************************
 *          g6_nodes_tree_i18n_keys.test.js
 *
 *      The shape tables of c_g6_nodes_tree.js reach t() as DATA, so the
 *      view publishes their keys in G6_NODES_TREE_I18N_KEYS, which a
 *      consumer's validate-locales asks the locales for. A shape added to
 *      a table and not to the list would render raw in every language.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {describe, test, expect} from "vitest";
import {readFileSync} from "node:fs";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

const SRC = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "c_g6_nodes_tree.js"), "utf8");

function array_of(name)
{
    const m = SRC.match(new RegExp(`(?:export\\s+)?const ${name} = \\[([^\\]]*)\\]`));
    expect(m, name).toBeTruthy();
    return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

describe("c_g6_nodes_tree publishes the keys of its shape tables", () => {
    test("every node and port shape is in G6_NODES_TREE_I18N_KEYS", () => {
        const published = new Set(array_of("G6_NODES_TREE_I18N_KEYS"));
        for(const shape of [...array_of("NODE_SHAPES"), ...array_of("PORT_SHAPES")]) {
            expect(published.has(shape), shape).toBe(true);
        }
    });

    test("a form control is named by the label before it, and an option carries its key", () => {
        expect(SRC).toMatch(/function name_form_control\(parent, control\)/);
        expect(SRC).toMatch(/o\.setAttribute\('data-i18n', opt\.i18n\)/);
        expect(SRC).not.toMatch(/label: t\('/);
    });
});
