/***********************************************************************
 *          g6_nodes_tree_i18n_keys.test.js
 *
 *      The keys of c_g6_nodes_tree.js that reach t() as DATA or as an
 *      ARGUMENT -- the shape tables, the labels and buttons of the
 *      popovers, the names of the floating buttons, the shell's error
 *      messages -- are invisible to a consumer's validate-locales, which
 *      only sees `t('<literal>')` and the `data-i18n*` / `i18n:` forms.
 *      So the view publishes them in G6_NODES_TREE_I18N_KEYS, and a key
 *      missing from that list renders raw in every language with the
 *      validator green ("some records were gone
 *      before the delete").
 *
 *      The module is read as a syntax tree, so every CALL is checked,
 *      not only the tables: a key handed to one of those helpers and
 *      not published fails here, and so does a new helper that hands
 *      t() a variable this test does not know the source of.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {describe, test, expect} from "vitest";
import {readFileSync} from "node:fs";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";
import {parse} from "acorn";

const SRC = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "c_g6_nodes_tree.js"), "utf8");
const AST = parse(SRC, {ecmaVersion: "latest", sourceType: "module"});

function array_of(name)
{
    const m = SRC.match(new RegExp(`(?:export\\s+)?const ${name} = \\[([^\\]]*)\\]`));
    expect(m, name).toBeTruthy();
    return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

/*  The helpers that hand t() a key they were given, and which argument
 *  carries it. A call passes a literal (it must be published) or the
 *  parameter of another of these (it passes the key through).  */
const KEY_ARGS = {
    create_form_label:      [1],
    create_floating_icon:   [4],
    show_dual_icons:        [3, 5],
    show_confirm_popover:   [3],
    yui_shell_show_error:   [1],
};

/*  The functions that call t() with something other than a literal,
 *  each with the place its keys come from:
 *    create_form_label, create_floating_icon: an argument (KEY_ARGS);
 *    name_form_control: the `data-i18n` create_form_label wrote;
 *    create_form_select, create_form_button_row: an `i18n:` property.  */
const VARIABLE_T_CALLERS = [
    "create_floating_icon",
    "create_form_button_row",
    "create_form_label",
    "create_form_select",
    "name_form_control",
];

/*  The tables whose items reach `i18n:` through a `.map()`: the first
 *  test of this file checks that their keys are published.  */
const KEY_TABLES = ["NODE_SHAPES", "PORT_SHAPES"];

/*  Every node of the tree, with the stack of the nodes above it.  */
function each_node(node, visit, stack = [])
{
    visit(node, stack);
    stack.push(node);
    for(const k of Object.keys(node)) {
        const v = node[k];
        if(Array.isArray(v)) {
            for(const c of v) {
                if(c && typeof c.type === "string") {
                    each_node(c, visit, stack);
                }
            }
        } else if(v && typeof v.type === "string") {
            each_node(v, visit, stack);
        }
    }
    stack.pop();
}

function is_string_literal(n)
{
    if(!n) {
        return false;
    }
    if(n.type === "Literal" && typeof n.value === "string") {
        return true;
    }
    return n.type === "TemplateLiteral" && n.expressions.length === 0;
}

function literal_value(n)
{
    if(n.type === "Literal") {
        return n.value;
    }
    return n.quasis[0].value.cooked;
}

function is_function(n)
{
    return n.type === "FunctionDeclaration" || n.type === "FunctionExpression" ||
        n.type === "ArrowFunctionExpression";
}

function has_param(fn, name)
{
    return fn.params.some((p) => p.type === "Identifier" && p.name === name);
}

/*  The innermost function above, that declares `name` as a parameter.  */
function function_with_param(stack, name)
{
    for(let i = stack.length - 1; i >= 0; i--) {
        if(is_function(stack[i]) && has_param(stack[i], name)) {
            return {fn: stack[i], parent: stack[i - 1]};
        }
    }
    return null;
}

function enclosing_declaration(stack)
{
    for(let i = stack.length - 1; i >= 0; i--) {
        if(stack[i].type === "FunctionDeclaration") {
            return stack[i].id.name;
        }
    }
    return "<module>";
}

function line_of(n)
{
    return SRC.slice(0, n.start).split("\n").length;
}

/*  A key handed on by name is the parameter of one of the KEY_ARGS
 *  helpers (passed through), or the item of a KEY_TABLES `.map()`.  */
function variable_key_is_known(stack, name)
{
    const found = function_with_param(stack, name);
    if(!found) {
        return false;
    }
    if(found.fn.type === "FunctionDeclaration" && KEY_ARGS[found.fn.id.name]) {
        return true;
    }
    const call = found.parent;
    return !!(call && call.type === "CallExpression" && call.arguments[0] === found.fn &&
        call.callee.type === "MemberExpression" &&
        call.callee.property.name === "map" &&
        call.callee.object.type === "Identifier" &&
        KEY_TABLES.includes(call.callee.object.name));
}

describe("c_g6_nodes_tree publishes the keys it hands to t() as data", () => {
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

    test("every function that hands t() a variable is one whose keys are checked here", () => {
        const callers = new Set();
        each_node(AST, (n, stack) => {
            if(n.type === "CallExpression" && n.callee.type === "Identifier" &&
                    n.callee.name === "t" && !is_string_literal(n.arguments[0])) {
                callers.add(enclosing_declaration(stack));
            }
        });
        /*  A new one fails here: teach KEY_ARGS (or the `i18n:` check
         *  below) where its keys come from, and publish them.  */
        expect([...callers].sort()).toEqual(VARIABLE_T_CALLERS);
    });

    test("every key handed to those helpers by argument is published", () => {
        const published = new Set(array_of("G6_NODES_TREE_I18N_KEYS"));
        const missing = [];
        const unknowable = [];
        let calls = 0;
        each_node(AST, (n, stack) => {
            if(n.type !== "CallExpression" || n.callee.type !== "Identifier" ||
                    !KEY_ARGS[n.callee.name]) {
                return;
            }
            calls++;
            for(const i of KEY_ARGS[n.callee.name]) {
                const arg = n.arguments[i];
                if(is_string_literal(arg)) {
                    if(!published.has(literal_value(arg))) {
                        missing.push(`${n.callee.name}('${literal_value(arg)}') :${line_of(n)}`);
                    }
                } else if(!(arg && arg.type === "Identifier" &&
                        variable_key_is_known(stack, arg.name))) {
                    unknowable.push(`${n.callee.name} argument ${i} :${line_of(n)}`);
                }
            }
        });
        expect(calls).toBeGreaterThan(10);
        expect(missing).toEqual([]);
        expect(unknowable).toEqual([]);
    });

    test("an `i18n:` property is a literal, or a key the checks above reach", () => {
        const unknowable = [];
        each_node(AST, (n, stack) => {
            if(n.type !== "Property" || n.shorthand || n.key.type !== "Identifier" ||
                    n.key.name !== "i18n" || stack[stack.length - 1].type !== "ObjectExpression") {
                return;
            }
            if(is_string_literal(n.value)) {
                return;     /* validate-locales reads `i18n: '<key>'` */
            }
            if(!(n.value.type === "Identifier" && variable_key_is_known(stack, n.value.name))) {
                unknowable.push(`i18n: ${SRC.slice(n.value.start, n.value.end)} :${line_of(n)}`);
            }
        });
        expect(unknowable).toEqual([]);
    });

    test("a toolbar item's `title_key` is the key of its `title`", () => {
        /*  toolbar_item_html() writes `title` as the name and
         *  `title_key` as its data-i18n-title / -aria-label: two
         *  writings of one key, which must not drift apart. Every
         *  object with a `title: t('<key>')` is a toolbar item here.  */
        const prop = (obj, name) => obj.properties.find((p) => p.type === "Property" &&
            !p.computed && p.key.type === "Identifier" && p.key.name === name);
        const bad = [];
        let items = 0;
        each_node(AST, (n) => {
            if(n.type !== "ObjectExpression") {
                return;
            }
            const title = prop(n, "title");
            const key = prop(n, "title_key");
            if(!title && !key) {
                return;
            }
            const is_t = title && title.value.type === "CallExpression" &&
                title.value.callee.type === "Identifier" && title.value.callee.name === "t" &&
                is_string_literal(title.value.arguments[0]);
            if(!is_t) {
                return;     /* not a translated title: nothing to key */
            }
            items++;
            const want = literal_value(title.value.arguments[0]);
            if(!key || !is_string_literal(key.value) || literal_value(key.value) !== want) {
                bad.push(`title: t('${want}') without title_key '${want}' :${line_of(n)}`);
            }
        });
        expect(items).toBeGreaterThan(15);
        expect(bad).toEqual([]);
    });

    test("the published list holds the keys a review found missing", () => {
        const published = new Set(array_of("G6_NODES_TREE_I18N_KEYS"));
        for(const key of ["some records were gone before the delete",
                          "node properties", "delete node", "edge properties",
                          "unlink", "link to hook", "port properties"]) {
            expect(published.has(key), key).toBe(true);
        }
    });
});
