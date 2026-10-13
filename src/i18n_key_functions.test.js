/***********************************************************************
 *          i18n_key_functions.test.js
 *
 *      Holds the library to what a consumer's validate-locales can see.
 *
 *      A key reaches the app's locales only by a path the validator
 *      reads: a literal (`t("save")`, `i18n: "save"`), a const it follows
 *      to one, a literal handed to a function of I18N_KEY_FUNCTIONS at one
 *      of its key positions, or an exported `<NAME>_I18N_KEYS` list of the
 *      module. Anything else -- a key in a `let`, a table, a computed name
 *      -- renders raw and never changes language, with the build green.
 *      That shipped (REV-CLOUD V20.5.1: "expand loaded", "click to load",
 *      "please select some row", ...).
 *
 *      So, read as syntax trees with the validator's own reader:
 *
 *        - the table names functions that exist where it says, with
 *          positions it can follow;
 *        - the table is COMPLETE (REV-CLOUD V21.4.1): every function that
 *          hands one of its parameters -- or what it reads from one -- to a
 *          place a key is read is in it, when something calls it by name;
 *          one nothing calls by name (an FSM action, a callback) marks what
 *          it hands on. The search runs to a fixpoint, and fails naming the
 *          entry to add;
 *        - the table is CORRECT (V22): the same search started from no
 *          table finds every entry, at every position, with the same
 *          `exported` -- an entry nothing forwards to fails;
 *        - a parameter handed on through what no position can name (V22:
 *          `k.toLowerCase()`, a concatenation, `Object.entries(opts)`, a
 *          rest parameter walked, `arguments[i]`, an array pattern) fails,
 *          unless it is marked where it is handed;
 *        - THE RULE, per call, in every module: each value a key position
 *          of a key function can take is a string literal (or nothing, or
 *          DOM), a const the reader follows to one, a key position of the
 *          enclosing table function handed on, or it is MARKED where it is
 *          handed -- a comment `i18n: <NAME>_I18N_KEYS` (the module
 *          publishes those keys) or `i18n: data` (no key a list can hold).
 *          Anything else fails, naming the file and the line; so does a
 *          translated text -- t("..."), tr(), an alias of t -- marked or
 *          not;
 *        - every marker is one and stands where a key is read; the lists
 *          it names are published by its module or one it imports; the
 *          keys it marks that can be read are in them -- a marked `let`
 *          included (or a member or an element read from one), whose
 *          every literal is read, and which fails when it holds nothing
 *          but literals (a const not written as one); a `data` marker on
 *          what the reader follows to keys fails (V21.4.2), and so does
 *          one that would hide a key (V22: a call mixing keys and data, an
 *          array of string literals);
 *        - every published list is readable (an `export const` array of
 *          literals), never mutated, lower-case ASCII, has no duplicate
 *          and no stale key;
 *        - a list a module derives from its SOURCE (a table, a default, a
 *          value it returns or assigns) covers it (COVERAGE), the source
 *          read with the validator's reader -- a const followed, a `let`
 *          into everything it is given -- and a value it cannot follow
 *          there fails, with the file and the line, unless the entry
 *          names it as data; every other list is named by at least one
 *          marker: no list is an orphan;
 *        - every key of every list is PINNED: dropping it from the list
 *          fails COVERAGE or the marker check, or the module reads it
 *          anyway (REV-CLOUD V20: 17 keys were pinned by nothing).
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {describe, test, expect} from "vitest";
import {readFileSync, readdirSync, existsSync} from "node:fs";
import {dirname, join} from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";

import {I18N_KEY_FUNCTIONS} from "./i18n_key_functions.js";
import {
    parse_source,
    walk,
    line_of,
    binding_of,
    source_keys,
    var_leaves,
    leaves_of,
    values_at,
    markers_of,
    marker_of,
    key_calls,
    key_places,
    call_kind,
    is_translation,
    call_rule_violations,
    param_flows,
    published_lists,
    list_mutations,
    scan_ast,
    lib_imports
} from "../scripts/validate-locales.mjs";

const SRC = dirname(fileURLToPath(import.meta.url));

const MODULES = readdirSync(SRC)
    .filter((f) => f.endsWith(".js") && !f.endsWith(".test.js"))
    .sort();

/*  A module's code parsed, knowing its name (for the messages) and its
 *  file (an import of a sibling is followed there)  */
function parse_as(code, module)
{
    let ast = parse_source(code, pathToFileURL(join(SRC, module)));
    Object.defineProperty(ast, "module", {value: module, enumerable: false});
    return ast;
}

const AST = new Map();
function ast_of(module)
{
    if(!AST.has(module)) {
        AST.set(module, parse_as(readFileSync(join(SRC, module), "utf8"), module));
    }
    return AST.get(module);
}

/*  Every list the library publishes: name -> {module, keys}  */
function all_lists()
{
    let out = new Map();
    for(let module of MODULES) {
        for(let list of published_lists(ast_of(module)).lists) {
            out.set(list.name, {module, keys: list.keys});
        }
    }
    return out;
}

function rule_report(ast, module, table)
{
    return call_rule_violations(ast, module, table).map((v) =>
        `${module}:${v.line}${v.call_line !== v.line? ` (call at ${v.call_line})` : ""} ` +
        `${v.name}() [${v.path}]: ${v.text.replace(/\s+/g, " ")}` +
        (v.why === "translated"? " -- a TRANSLATED text where a key goes: hand the key" : ""));
}

function declares_function(ast, name)
{
    let found = false;
    walk(ast, (n) => {
        if(n.type === "FunctionDeclaration" && n.id && n.id.name === name) {
            found = true;
        } else if(n.type === "VariableDeclarator" && n.id.type === "Identifier" && n.id.name === name
                && n.init && /Function/.test(n.init.type)) {
            found = true;
        }
    });
    return found;
}

function exported_names(ast)
{
    let names = new Set();
    for(let node of ast.body) {
        if(node.type !== "ExportNamedDeclaration" || node.source) {
            continue;
        }
        if(node.declaration) {
            if(node.declaration.id) {
                names.add(node.declaration.id.name);
            }
            for(let d of node.declaration.declarations || []) {
                names.add(d.id.name);
            }
        }
        for(let s of node.specifiers) {
            names.add(s.exported.name || s.exported.value);
        }
    }
    return names;
}

/*
 *  What a SOURCE of a list holds, read with the validator's own reader
 *  in the scope each value is written in: a const is followed to its
 *  value, a `let` into everything it is given (source_keys()).
 *
 *      {keys: [string], unread: [{where, text, holds}]}
 *
 *  `unread` is every value the reader cannot follow there (a
 *  parameter, a call, data), as the place it is read ("<file>:<line>"
 *  and its text) and, when that is a `let`, `holds`: the value inside
 *  it that stops the reader. A list derived from a source with such a
 *  value fails its COVERAGE, unless the entry names that text as data.
 */
function new_source()
{
    return {keys: [], unread: []};
}

function text_of(ast, n)
{
    return ast.code.slice(n.start, n.end).replace(/\s+/g, " ").slice(0, 120);
}

function read_source(src, ast, node, scope)
{
    let r = source_keys(node, scope);
    src.keys.push(...r.keys);
    let label = ast.module || "(source)";
    for(let u of r.unread) {
        src.unread.push({
            where: `${label}:${line_of(ast, u.at.start)}`,
            text: text_of(ast, u.at),
            holds: (u.node !== u.at)? `${text_of(ast, u.node)} (line ${line_of(ast, u.node.start)})` : null
        });
    }
    return src;
}

function merged(...sources)
{
    let out = new_source();
    for(let s of sources) {
        out.keys.push(...s.keys);
        out.unread.push(...s.unread);
    }
    out.keys = [...new Set(out.keys)];
    return out;
}

function is_named_property(n, field)
{
    return n.type === "Property" && !n.computed && (n.key.name === field || n.key.value === field);
}

/*  The first declarator of `name` in the module, with its ancestors  */
function declarator_of(ast, name)
{
    let found = null;
    walk(ast, (n, ancestors) => {
        if(!found && n.type === "VariableDeclarator" && n.id.type === "Identifier" && n.id.name === name) {
            found = {decl: n, scope: [...ancestors, n]};
        }
    });
    if(!found || !found.decl.init) {
        throw new Error(`no const ${name} with a value`);
    }
    return found;
}

/*
 *  What a TABLE of a module holds, read from its declaration (never
 *  run): the first `const <name>` of the module. With `field`, the
 *  values of every property of that name in it; without, every value
 *  it holds (not its property names), into nested objects and arrays.
 */
function table_strings(ast, name, field)
{
    let src = new_source();
    let {decl, scope} = declarator_of(ast, name);
    if(field) {
        /*  A row given by name (`"spiral": SPIRAL_ROW`) or a table spread
         *  in (`...EXTRA_LAYOUTS`) is followed to its const; one that
         *  cannot be followed fails, as an unread value.  */
        let unread = (node) => {
            src.unread.push({
                where: `${ast.module || "(source)"}:${line_of(ast, node.start)}`,
                text: text_of(ast, node),
                holds: null
            });
        };
        let const_of = (node) => {
            let found = null;
            try {
                found = declarator_of(ast, node.name);
            } catch(e) {
                return null;
            }
            let declaration = found.scope[found.scope.length - 2];
            if(!declaration || declaration.kind !== "const") {
                return null;
            }
            return found;
        };
        let read_row = (node, chain) => {
            if(node.type === "Identifier") {
                let found = const_of(node);
                if(!found || found.decl.init.type !== "ObjectExpression") {
                    unread(node);
                    return;
                }
                read_row(found.decl.init, found.scope);
                return;
            }
            if(node.type !== "ObjectExpression") {
                unread(node);
                return;
            }
            walk(node, (n, ancestors) => {
                if(is_named_property(n, field) && ancestors[ancestors.length - 1].type === "ObjectExpression") {
                    read_source(src, ast, n.value, [...ancestors, n]);
                }
            }, [...chain]);
        };
        let read_rows = (node, chain) => {
            if(node.type === "Identifier") {
                let found = const_of(node);
                if(!found) {
                    unread(node);
                    return;
                }
                read_rows(found.decl.init, found.scope);
            } else if(node.type === "CallExpression" && node.callee.type === "MemberExpression"
                    && node.callee.object.name === "Object" && node.callee.property.name === "freeze") {
                read_rows(node.arguments[0], [...chain, node]);
            } else if(node.type === "ObjectExpression") {
                for(let p of node.properties) {
                    if(p.type === "SpreadElement") {
                        read_rows(p.argument, [...chain, node, p]);
                    } else {
                        read_row(p.value, [...chain, node, p]);
                    }
                }
            } else if(node.type === "ArrayExpression") {
                for(let el of node.elements) {
                    if(!el) {
                        continue;
                    }
                    if(el.type === "SpreadElement") {
                        read_rows(el.argument, [...chain, node, el]);
                    } else {
                        read_row(el, [...chain, node]);
                    }
                }
            } else {
                unread(node);
            }
        };
        read_rows(decl.init, scope);
        return src;
    }
    let read_table = (node, chain) => {
        if(node.type === "ObjectExpression") {
            for(let p of node.properties) {
                if(p.type === "SpreadElement") {
                    read_source(src, ast, p.argument, [...chain, node, p]);
                } else {
                    read_table(p.value, [...chain, node, p]);
                }
            }
        } else if(node.type === "ArrayExpression") {
            for(let el of node.elements) {
                if(el) {
                    read_table(el.type === "SpreadElement"? el.argument : el, [...chain, node]);
                }
            }
        } else if(node.type === "CallExpression" && node.callee.type === "MemberExpression"
                && node.callee.object.name === "Object" && node.callee.property.name === "freeze") {
            read_table(node.arguments[0], [...chain, node]);
        } else {
            read_source(src, ast, node, chain);
        }
    };
    read_table(decl.init, scope);
    return src;
}

/*  The values written as a property `field` of an object, anywhere,
 *  every branch of each (`label: x || "app"`)  */
function property_keys(ast, field)
{
    let src = new_source();
    walk(ast, (n, ancestors) => {
        if(is_named_property(n, field) && ancestors[ancestors.length - 1].type === "ObjectExpression") {
            read_source(src, ast, n.value, [...ancestors, n]);
        }
    });
    return src;
}

/*  What a function of the module RETURNS, every branch of each
 *  `return` (not those of a function nested in it)  */
function returned_strings(ast, name)
{
    let src = new_source();
    let fn = null;
    let outer = null;
    walk(ast, (n, ancestors) => {
        if(!fn && n.type === "FunctionDeclaration" && n.id && n.id.name === name) {
            fn = n;
            outer = [...ancestors, n];
        }
    });
    if(!fn) {
        throw new Error(`no function ${name}`);
    }
    walk(fn.body, (n, ancestors) => {
        if(n.type === "ReturnStatement" && n.argument
                && !ancestors.slice(outer.length).some((a) => /Function/.test(a.type))) {
            read_source(src, ast, n.argument, [...ancestors, n]);
        }
    }, outer);
    return src;
}

/*  What the module GIVES to a variable or a property `name`:
 *  `let name = v`, `name = v`, `x.name = v`, every branch of `v`  */
function assigned_strings(ast, name)
{
    let src = new_source();
    walk(ast, (n, ancestors) => {
        if(n.type === "VariableDeclarator" && n.id.type === "Identifier" && n.id.name === name && n.init) {
            read_source(src, ast, n.init, [...ancestors, n]);
        } else if(n.type === "AssignmentExpression") {
            let l = n.left;
            let named = (l.type === "Identifier" && l.name === name)
                || (l.type === "MemberExpression" && !l.computed && l.property.name === name);
            if(named) {
                read_source(src, ast, n.right, [...ancestors, n]);
            }
        }
    });
    return src;
}

/*  What is given as argument `index` of every call of `callee`  */
function call_strings(ast, callee, index)
{
    let src = new_source();
    walk(ast, (n, ancestors) => {
        if(n.type === "CallExpression" && n.callee.type === "Identifier" && n.callee.name === callee
                && n.arguments[index]) {
            read_source(src, ast, n.arguments[index], [...ancestors, n]);
        }
    });
    return src;
}

/*  The defaults of the attrs whose name matches `re` (SDATA(type, name, flag, default, ...))  */
function attr_defaults(ast, re)
{
    let src = new_source();
    walk(ast, (n, ancestors) => {
        if(n.type === "CallExpression" && n.callee.type === "Identifier" && n.callee.name === "SDATA"
                && n.arguments[1] && re.test(String(n.arguments[1].value)) && n.arguments[3]) {
            read_source(src, ast, n.arguments[3], [...ancestors, n]);
        }
    });
    return src;
}

/*
 *  The lists a module derives from its SOURCE -- a table, a default, a
 *  literal it returns or assigns -- each one held to it, so a key added
 *  there without the list fails here (a literal, a const, a `let` the
 *  reader follows), and so does a key dropped from the list. `from`
 *  reads that source (a source(): its keys, and what it cannot read);
 *  `data` names, by the text of the place it is read, each value of it
 *  that is not a key of the list and cannot be read -- with why. Any
 *  other value the reader cannot follow fails the coverage, naming the
 *  file and the line, and so does a `data` entry that names nothing.
 *  `test` names the test file that holds the list instead (it lives in
 *  a module this test does not own).
 */
const COVERAGE = [
    {module: "c_yui_gclass.js", list: "C_YUI_GCLASS_I18N_KEYS",
        from: (ast) => merged(table_strings(ast, "VIEWS", "key"), table_strings(ast, "MACHINE_VIEWS", "key"),
                              table_strings(ast, "ZONES", "key"))},
    {module: "c_yui_gobj_tree_js.js", list: "C_YUI_GOBJ_TREE_JS_I18N_KEYS",
        from: (ast) => table_strings(ast, "LAYOUTS", "key")},
    {module: "c_yui_period.js", list: "C_YUI_PERIOD_I18N_KEYS",
        from: (ast) => merged(table_strings(ast, "MODE_SPAN"), table_strings(ast, "MODE_CUSTOM"))},
    {module: "yui_time.js", list: "YUI_TIME_I18N_KEYS",
        from: (ast) => merged(table_strings(ast, "YUI_PERIODS", "id"), table_strings(ast, "YUI_ROLLING", "label"))},
    {module: "schema_flags.js", list: "SCHEMA_FLAGS_I18N_KEYS",
        from: (ast) => merged(table_strings(ast, "FLAG_GROUPS"), table_strings(ast, "FLAG_CATALOG", "desc"),
                              property_keys(ast, "group"))},
    {module: "schema_import.js", list: "SCHEMA_IMPORT_I18N_KEYS",
        from: (ast) => property_keys(ast, "op")},
    {module: "c_yui_treedb_graph.js", list: "C_YUI_TREEDB_GRAPH_I18N_KEYS",
        from: (ast) => table_strings(ast, "NODE_MODE_LABELS")},
    {module: "c_yui_wizard.js", list: "C_YUI_WIZARD_I18N_KEYS",
        from: (ast) => attr_defaults(ast, /_label$/)},
    {module: "shell_modals.js", list: "SHELL_MODALS_I18N_KEYS",
        from: (ast) => table_strings(ast, "DEFAULT_LABEL")},
    {module: "yui_install.js", list: "YUI_INSTALL_I18N_KEYS",
        from: (ast) => table_strings(ast, "DEFAULT_ASK")},
    /*  The severities the checks of schema_validate.js write, which the
     *  editor's report translates  */
    {module: "c_yui_schema_editor.js", list: "C_YUI_SCHEMA_EDITOR_I18N_KEYS",
        from: () => call_strings(ast_of("schema_validate.js"), "add", 0)},
    {module: "c_yui_form.js", list: "C_YUI_FORM_I18N_KEYS",
        from: (ast) => merged(returned_strings(ast, "field_validation_key"), assigned_strings(ast, "warning")),
        data: {"$input.yui_json_error": "the json field's own error: FORM_JSON_FIELD_I18N_KEYS (form_json_field.js)"}},
    {module: "form_json_field.js", list: "FORM_JSON_FIELD_I18N_KEYS",
        from: (ast) => property_keys(ast, "error")},
    {module: "shell_route_map.js", list: "SHELL_ROUTE_MAP_I18N_KEYS",
        from: (ast) => property_keys(ast, "label"),
        data: {"map.brand.label": "the app's brand label: its shell declaration, which validate-locales reads"}},
    {module: "wizard_helpers.js", list: "WIZARD_HELPERS_I18N_KEYS",
        from: (ast) => assigned_strings(ast, "primary_label"),
        data: {"opts.confirm_label": "the host's own label, a key of the host",
               "opts.next_label": "the host's own label, a key of the host"}},
    {module: "c_g6_nodes_tree.js", list: "G6_NODES_TREE_I18N_KEYS",
        from: (ast) => merged(table_strings(ast, "NODE_SHAPES"), table_strings(ast, "PORT_SHAPES")),
        test: "g6_nodes_tree_i18n_keys.test.js"},
    {module: "yui_dev.js", list: "YUI_DEV_I18N_KEYS",
        test: "yui_dev_controls.test.js"},
];

/*
 *  What is wrong with the coverage of a list: a value of its source
 *  the reader cannot follow and the entry does not name as data, a
 *  `data` entry that names nothing, a key of the source the list
 *  lacks. `ast` is the module's (a mutated copy, in a test).
 */
function missing_from_list(entry, lists, ast = ast_of(entry.module))
{
    let list = lists.get(entry.list);
    if(!list || list.module !== entry.module) {
        return [`${entry.module} publishes no ${entry.list}`];
    }
    let src = entry.from(ast);
    let data = entry.data || {};
    let wrong = [];
    let named = new Set();
    for(let u of src.unread) {
        if(Object.prototype.hasOwnProperty.call(data, u.text)) {
            named.add(u.text);
            continue;
        }
        wrong.push(`${u.where}: ${entry.list} is derived from this source, and the reader cannot ` +
                   `follow ${u.text}${u.holds? `, which holds ${u.holds}` : ""}: write the key as a ` +
                   `literal or a const, or name it as data in its COVERAGE entry`);
    }
    for(let text of Object.keys(data)) {
        if(!named.has(text)) {
            wrong.push(`${entry.module} ${entry.list}: COVERAGE names ${JSON.stringify(text)} as data, ` +
                       `and its source reads no such value`);
        }
    }
    let published = new Set(list.keys);
    for(let k of new Set(src.keys)) {
        if(!published.has(k)) {
            wrong.push(`${entry.module} ${entry.list}: ${JSON.stringify(k)} is in its source, not in the list`);
        }
    }
    return wrong;
}

/*
 *  The keys of the lists that nothing PINS. A key the module reads
 *  anyway reaches a consumer without its list. Any other one reaches
 *  it ONLY through the list, so dropping it from the list must fail a
 *  check here: the list's COVERAGE, or the marker check -- a key a
 *  marker follows (a const, a marked `let`), when no other list that
 *  marker names holds it. `coverage` is COVERAGE, or part of it (to
 *  test this check).
 */
const SCANS = new Map();
function scan_of(module)
{
    if(!SCANS.has(module)) {
        SCANS.set(module, scan_ast(ast_of(module), {lib_module: module}));
    }
    return SCANS.get(module);
}

function unpinned_keys(lists, coverage)
{
    let pinned = new Set();     // "<list> <key>"
    let whole = new Set();      // the lists a test of their own holds
    for(let entry of coverage) {
        if(entry.test) {
            whole.add(entry.list);
        }
        if(entry.from) {
            for(let k of entry.from(ast_of(entry.module)).keys) {
                pinned.add(`${entry.list} ${k}`);
            }
        }
    }
    for(let module of MODULES) {
        for(let ref of scan_of(module).marker_refs) {
            for(let k of ref.keys) {
                let holders = ref.lists.filter((name) => lists.has(name) && lists.get(name).keys.includes(k));
                if(holders.length === 1) {
                    pinned.add(`${holders[0]} ${k}`);
                }
            }
        }
    }
    let out = [];
    for(let [name, list] of lists) {
        if(whole.has(name)) {
            continue;
        }
        let read = scan_of(list.module).read_keys;
        for(let k of list.keys) {
            if(!read.has(k) && !pinned.has(`${name} ${k}`)) {
                out.push(`${list.module} ${name}: ${JSON.stringify(k)} reaches a consumer only ` +
                         `through this list, and dropping it from the list fails no check`);
            }
        }
    }
    return out;
}

/*  A copy of the lists with one key dropped from one of them  */
function with_key_dropped(lists, name, key)
{
    let copy = new Map(lists);
    let list = lists.get(name);
    copy.set(name, {module: list.module, keys: list.keys.filter((k) => k !== key)});
    return copy;
}

/*
 *  The FORWARDERS: the functions of the library that hand one of their
 *  parameters on to a place a key is read (key_places(): a translator
 *  call -- t(), tr(), an alias, `.call()` --, an `i18n`, `code` or
 *  `data-i18n*` value -- a property, setAttribute(), `x.i18n = ...`,
 *  `el.dataset.i18nTitle = ...` --, a key position of a function of the
 *  table): the parameter itself or what is read from it (`opts.title`,
 *  `opts?.title`, a destructured `{label}` -- in the parameter or in the
 *  body --, each `items[].name`, `arguments[1]`, `rest[0]`, a copy
 *  `{...opts}`), directly or through a `let` it is given to. What their
 *  callers give there is a key the validator reads ONLY when the
 *  function is in I18N_KEY_FUNCTIONS: up to 7.26.28 39 were not (the
 *  review named 17 of them), 6 entries lacked positions, and a literal
 *  handed to one would have gone unasked (REV-CLOUD V21.4.1).
 *
 *    - A forwarder called by NAME -- in its module, or exported -- goes
 *      in the table, with that position.
 *    - One that nothing calls by name -- an FSM action (the framework
 *      calls it with an event's kw), a callback, a method -- has no call
 *      a reader can read: what it hands on is MARKED where it hands it,
 *      like any other value the reader cannot follow.
 *    - What a gobj keeps in its `priv` is its own state: a caller hands
 *      the gobj, never what its priv holds. A path through the priv of
 *      a parameter is no position of the function.
 *    - A parameter handed on through what NO position can name (V22) --
 *      a key transformed (`k.toLowerCase()`, a concatenation, a template),
 *      an iteration of `Object.entries(opts)`, a rest parameter walked or
 *      read by a computed index, `arguments` --, unmarked, is OPAQUE: the
 *      callers' keys reach no reader. It is restructured (the key handed
 *      on as it arrives, the function then in the table) or marked.
 *
 *  The search runs to a fixpoint: a function that hands a parameter to
 *  a key position of a forwarder it found is a forwarder too. Each round
 *  reads the library again with the table of the round before (a `tr`
 *  of the table is a key function, read at its positions, and not a
 *  translator); `table` is where it starts: the real table, to find what
 *  it lacks, or none at all, to find what the library ALONE says
 *  (correctness).
 *
 *      -> {missing: [{module, name, exported, keys, line}],
 *          unmarked: [{module, name, how, pos, line}],
 *          opaque: [{module, name, pos, line, text}],
 *          found: [{module, name, exported, keys}]}
 *
 *  `missing`: what the table lacks, each function with the positions it
 *  lacks and the first line that hands one. `unmarked`: a forwarder
 *  nothing calls by name that hands a parameter on unmarked. `opaque`:
 *  a function that hands a parameter on unmarked through what no
 *  position can name. `found`: every forwarder and position the last
 *  round found, the table aside.
 */
const PRIV_PATH_RE = /^\.priv(?:[.[]|$)/;

function handed_params(leaf)
{
    if(leaf.kind === "param") {
        return [leaf];
    }
    if(leaf.kind === "unknown" && leaf.var_root) {
        return var_leaves(leaf.var_root).leaves.filter((l) => l.kind === "param");
    }
    return [];
}

/*  The parameters a leaf hands on through what no position can name
 *  (param_flows()), a `let` it holds followed into what it is given  */
function opaque_params(leaf)
{
    if(leaf.kind !== "unknown") {
        return [];
    }
    if(!leaf.var_root) {
        return param_flows(leaf.node, leaf.scope || []);
    }
    let r = var_leaves(leaf.var_root);
    let out = [];
    for(let l of r.leaves) {
        if(l.kind === "unknown" && !l.var_root) {
            out.push(...param_flows(l.node, l.scope || []));
        }
    }
    for(let o of r.opaque) {
        out.push(...param_flows(o.node, o.scope || []));
    }
    return out;
}

/*  Is `fn` called by its name in the module (a call that resolves to it)?  */
function is_called_by_name(ast, fn)
{
    let called = false;
    walk(ast, (n, ancestors) => {
        if(called || n.type !== "CallExpression" || n.callee.type !== "Identifier") {
            return;
        }
        let b = binding_of(n.callee.name, [...ancestors, n]);
        if(!b) {
            return;
        }
        if((b.kind === "function" && b.fn === fn) || (b.kind === "const" && b.init === fn)
                || (b.kind === "var" && b.declarators.some((d) => d.init === fn))) {
            called = true;
        }
    });
    return called;
}

/*  How a function is written: one the table can name ("declaration",
 *  "variable": bound to a name), or what else it is  */
function declared_as(ast, fn)
{
    if(fn.type === "FunctionDeclaration") {
        return "declaration";
    }
    let how = "a function expression";
    walk(ast, (n, ancestors) => {
        if(n !== fn) {
            return;
        }
        let parent = ancestors[ancestors.length - 1];
        if(parent.type === "VariableDeclarator" && parent.init === fn && parent.id.type === "Identifier") {
            how = "variable";
        } else if(parent.type === "Property" || parent.type === "MethodDefinition") {
            how = "a method";
        } else if(parent.type === "CallExpression" || parent.type === "NewExpression") {
            how = "a callback";
        }
    });
    return how;
}

/*  A flow of param_flows() out of a gobj's OWN state: the parameter
 *  `gobj` of a gclass function (what is read from it, through a call
 *  too -- gobj_read_attr(gobj, "title") -- is its attrs, set by whoever
 *  created it), or a path through a `priv`. No caller hands a key that
 *  way.  */
function is_gobj_state(f)
{
    if(f.priv || (f.path !== null && /\.priv(?:[.[]|$)/.test(f.path))) {
        return true;
    }
    let b = f.binding;
    let p = (b.kind === "arguments")? null : b.fn.params[b.index];
    if(p && p.type === "AssignmentPattern") {
        p = p.left;
    }
    return !!p && p.type === "Identifier" && p.name === "gobj";
}

/*  The parameter a flow of param_flows() comes from, and what is read
 *  from it when that can be said  */
function flow_position(f)
{
    let b = f.binding;
    if(b.kind === "arguments") {
        return "arguments";
    }
    return `${b.index}${f.path || ""}`;
}

function find_forwarders(modules = MODULES, asts = ast_of, table = I18N_KEY_FUNCTIONS)
{
    let start = table.map((e) => Object.assign({}, e, {keys: [...e.keys]}));
    let named = new Map();          // a function node -> {by_name, how}
    let round_table = start;
    let found = new Map();          // "<module> <name>" -> {module, name, exported, keys}
    let first_line = new Map();     // "<module> <name> <pos>" -> line
    let unmarked = new Map();       // "<module>:<line> <pos>" -> {...}
    let opaque = new Map();         // "<module>:<line> <pos>" -> {...}
    let signature = (entries) => entries.map((e) => `${e.module} ${e.name} [${[...e.keys].sort()}]`).sort().join("\n");
    let seen = new Set();
    for(let round = 0; round < 32; round++) {
        found = new Map();
        first_line = new Map();
        unmarked = new Map();
        opaque = new Map();
        for(let module of modules) {
            let ast = asts(module);
            let markers = markers_of(ast);
            let exported = exported_names(ast);
            let by_name_of = (b) => {
                if(!named.has(b.fn)) {
                    let how = declared_as(ast, b.fn);
                    let by_name = !!b.name && (how === "declaration" || how === "variable")
                        && (exported.has(b.name) || is_called_by_name(ast, b.fn));
                    named.set(b.fn, {by_name, how});
                }
                return named.get(b.fn);
            };
            for(let place of key_places(ast, {lib_module: module, table: round_table})) {
                let place_line = line_of(ast, place.node.start);
                for(let leaf of place.leaves) {
                    if(marker_of(leaf, markers)) {
                        continue;
                    }
                    for(let p of handed_params(leaf)) {
                        if(PRIV_PATH_RE.test(p.path)) {
                            continue;
                        }
                        let b = p.binding;
                        let pos = `${b.index}${p.path}`;
                        let line = line_of(ast, leaf.node.start);    // the place it is handed to
                        let {by_name, how} = by_name_of(b);
                        if(!by_name) {
                            unmarked.set(`${module}:${line} ${pos}`, {module, name: b.name, how, pos, line});
                            continue;
                        }
                        let id = `${module} ${b.name} ${pos}`;
                        if(!first_line.has(id) || line < first_line.get(id)) {
                            first_line.set(id, line);
                        }
                        let key = `${module} ${b.name}`;
                        if(!found.has(key)) {
                            found.set(key, {module, name: b.name, exported: exported.has(b.name), keys: []});
                        }
                        if(!found.get(key).keys.includes(pos)) {
                            found.get(key).keys.push(pos);
                        }
                    }
                    if(is_translation(leaf)) {
                        continue;       // the rule test says what is wrong with it
                    }
                    for(let f of opaque_params(leaf)) {
                        if(is_gobj_state(f)) {
                            continue;
                        }
                        let pos = flow_position(f);
                        opaque.set(`${module}:${place_line} ${pos}`, {
                            module, name: f.binding.name, pos, line: place_line,
                            text: ast.code.slice(leaf.node.start, leaf.node.end).replace(/\s+/g, " ").slice(0, 80)
                        });
                    }
                }
            }
        }
        /*  The next round's table: where it started, and what this one found  */
        let next = start.map((e) => Object.assign({}, e, {keys: [...e.keys]}));
        for(let f of found.values()) {
            let e = next.find((x) => x.module === f.module && x.name === f.name);
            if(!e) {
                next.push({module: f.module, name: f.name, exported: f.exported, keys: [...f.keys]});
            } else {
                for(let k of f.keys) {
                    if(!e.keys.includes(k)) {
                        e.keys.push(k);
                    }
                }
            }
        }
        let sig = signature(next);
        if(sig === signature(round_table) || seen.has(sig)) {
            round_table = next;
            break;
        }
        seen.add(sig);
        round_table = next;
    }

    let missing = [];
    for(let entry of round_table) {
        let real = table.find((e) => e.module === entry.module && e.name === entry.name);
        let keys = entry.keys.filter((k) => !real || !real.keys.includes(k));
        if(keys.length === 0) {
            continue;
        }
        let lines = keys.map((k) => first_line.get(`${entry.module} ${entry.name} ${k}`) || 0);
        missing.push({module: entry.module, name: entry.name, exported: entry.exported, keys,
                      line: Math.min(...lines), in_table: !!real});
    }
    return {missing, unmarked: [...unmarked.values()], opaque: [...opaque.values()], found: [...found.values()]};
}

function forwarders_report(found)
{
    let out = [];
    for(let m of found.missing) {
        out.push(`${m.module}:${m.line} ${m.name}() hands [${m.keys.join(", ")}] to a place a key is read: ` +
                 (m.in_table? `add the position(s) to its entry of I18N_KEY_FUNCTIONS` :
                  `name it in I18N_KEY_FUNCTIONS -- {module: "${m.module}", name: "${m.name}", ` +
                  `exported: ${m.exported}, keys: ${JSON.stringify(m.keys)}}`));
    }
    for(let u of found.unmarked) {
        out.push(`${u.module}:${u.line} ${u.name || "a function"} (${u.how}, which nothing calls by name) ` +
                 `hands its parameter [${u.pos}] to a place a key is read, unmarked: no caller can be ` +
                 `read, so mark what it is where it hands it`);
    }
    for(let o of found.opaque || []) {
        out.push(`${o.module}:${o.line} ${o.name || "a function"}() hands its parameter [${o.pos}] to a place ` +
                 `a key is read through \`${o.text}\`, which no position can name: hand the key on as it ` +
                 `arrives (the function then goes in the table), or mark it where it hands it`);
    }
    return out;
}

/*
 *  The table is CORRECT: every entry, at every position, is a hand-off
 *  the library itself shows -- the search started from NO table finds
 *  it, with the same `exported`. An entry nothing forwards to would make
 *  the validator read keys where no key goes, and a wrong `exported`
 *  hides the calls of another module. (Up to 7.26.31 the test proved
 *  only that the table was complete: an extra entry passed it.)
 */
function table_errors(found, table = I18N_KEY_FUNCTIONS)
{
    let out = [];
    for(let e of table) {
        let f = found.find((x) => x.module === e.module && x.name === e.name);
        for(let k of e.keys) {
            if(!f || !f.keys.includes(k)) {
                out.push(`${e.module} ${e.name} [${k}]: no hand-off the search finds -- the function does not ` +
                         `hand that position to a place a key is read: drop it from I18N_KEY_FUNCTIONS, or ` +
                         `write the hand-off in a form the reader follows`);
            }
        }
        if(f && f.exported !== e.exported) {
            out.push(`${e.module} ${e.name}: \`exported: ${e.exported}\`, and the module ` +
                     `${f.exported? "exports" : "does not export"} it`);
        }
    }
    return out;
}


describe("I18N_KEY_FUNCTIONS: the table", () => {
    test("every entry names a function of its module, at positions that can be followed", () => {
        let wrong = [];
        let exported_seen = new Set();
        for(let e of I18N_KEY_FUNCTIONS) {
            let where = `${e.module} ${e.name}`;
            if(!existsSync(join(SRC, e.module))) {
                wrong.push(`${where}: no such module`);
                continue;
            }
            let ast = ast_of(e.module);
            if(!declares_function(ast, e.name)) {
                wrong.push(`${where}: the module declares no such function`);
            }
            if(typeof e.exported !== "boolean") {
                wrong.push(`${where}: \`exported\` is not a boolean`);
            }
            if(e.exported) {
                if(!exported_names(ast).has(e.name)) {
                    wrong.push(`${where}: marked exported, and the module does not export it`);
                }
                if(exported_seen.has(e.name)) {
                    wrong.push(`${where}: an exported name is matched by NAME, and it is twice in the table`);
                }
                exported_seen.add(e.name);
            }
            if(!Array.isArray(e.keys) || e.keys.length === 0) {
                wrong.push(`${where}: no key position`);
                continue;
            }
            for(let k of e.keys) {
                if(!/^\d+(\[\])?(\.[\w$]+(\[\])?)*$/.test(k)) {
                    wrong.push(`${where}: key position ${JSON.stringify(k)} cannot be followed`);
                }
            }
        }
        expect(wrong).toEqual([]);
    });
});

describe("REV-CLOUD V21.4.1: every forwarder is in the table", () => {
    test("every function that hands a parameter to a place a key is read, in every module", () => {
        expect(forwarders_report(find_forwarders())).toEqual([]);
    });

    test("REV-CLOUD V22: the table is CORRECT -- every entry is a hand-off the library shows", () => {
        expect(table_errors(find_forwarders(MODULES, ast_of, []).found)).toEqual([]);
    });

    test("the search finds what it should, and nothing else", () => {
        let code = [
            `import {yui_shell_show_error} from "./shell_modals.js";`,
            `function say(gobj, key) { return ["p", {i18n: key}, t(key)]; }`,           // hands 1
            `function told(gobj, opts) { yui_shell_show_error(shell, opts.message); }`, // hands 1.message
            `function relay(gobj, k) { return say(gobj, k); }`,                         // through say: 1
            `function own(gobj) { let priv = gobj.priv; return t(priv.label); }`,       // the gobj's own state
            `function as_dom(gobj, $node) { yui_shell_show_error(shell, $node); }`,      // a string there is a key
            `function by_let(gobj, it) { let label = it.name || ""; return {i18n: label}; }`,
            `function by_pattern(gobj, {title, label = "fallback"}) { return t(title); }`,
            `function ac_show(gobj, event, kw, src) { yui_shell_show_error(shell, kw.comment); }`,
            `function ac_marked(gobj, event, kw, src) { return t(/* i18n: data */ kw.comment); }`,
            `say(); told(); relay(); own(); as_dom(); by_let(); by_pattern();`
        ].join("\n");
        let ast = parse_as(code, "x.js");
        let found = find_forwarders(["x.js"], () => ast);
        let got = Object.fromEntries(found.missing.map((m) => [m.name, m.keys.sort()]));
        expect(got).toEqual({
            say: ["1"], told: ["1.message"], relay: ["1"], as_dom: ["1"],
            by_let: ["1.name"], by_pattern: ["1.title"]
        });
        expect(found.unmarked.map((u) => `${u.name} ${u.pos}`)).toEqual(["ac_show 2.comment"]);

        /*  ...and named in the table, they are found no more  */
        let table = [...I18N_KEY_FUNCTIONS,
                     ...found.missing.map((m) => ({module: "x.js", name: m.name, exported: false, keys: m.keys}))];
        expect(find_forwarders(["x.js"], () => ast, table).missing).toEqual([]);
    });

    test("the functions the review named are found, with the table as it was", () => {
        let names = ["name_form_control", "create_form_field", "item_li", "item_iconbar",
                     "build_toolbar_action_item", "build_toolbar_brand_item", "build_toolbar_avatar_item",
                     "build_toolbar_connection_item", "open_toolbar_dropdown", "build_dropdown_row",
                     "col_title_formatter", "add_tab", "add_topic_card", "build_topic_info_panel",
                     "card_descriptor", "render_node"];
        let before = I18N_KEY_FUNCTIONS.filter((e) => !names.includes(e.name));
        let found = find_forwarders(MODULES, ast_of, before);
        let missing = new Set(found.missing.map((m) => m.name));
        for(let name of names) {
            expect(missing.has(name), name).toBe(true);
        }
        /*  The seventeenth, an FSM action, is not called by name: it is marked where it
         *  hands its kw on, and without the marks it is reported  */
        let module = "c_yui_window_manager.js";
        let code = readFileSync(join(SRC, module), "utf8");
        expect(find_forwarders([module], () => ast_of(module)).unmarked).toEqual([]);
        let unmarked = parse_as(code.replace(/\/\* i18n: data \*\/ /g, ""), module);
        expect(find_forwarders([module], () => unmarked).unmarked.map((u) => u.name))
            .toContain("ac_register_window");
    });
});

describe("the rule, per call: a key position gets what the validator can read, or a marker", () => {
    test("every call of a key function, in every module of the library", () => {
        let wrong = [];
        for(let module of MODULES) {
            wrong.push(...rule_report(ast_of(module), module));
        }
        expect(wrong).toEqual([]);
    });

    test("every marker is one, stands where a key is read, and names lists its module can reach", () => {
        let lists = all_lists();
        let wrong = [];
        for(let module of MODULES) {
            let ast = ast_of(module);
            let r = scan_ast(ast, {lib_module: module});
            for(let e of r.marker_errors) {
                wrong.push(`${module}:${e.line}: ${e.why}`);
            }
            let reach = new Set([module, ...lib_imports(ast, new Map(), module)]);
            for(let ref of r.marker_refs) {
                let keys = new Set();
                for(let name of ref.lists) {
                    let list = lists.get(name);
                    if(!list) {
                        wrong.push(`${module}:${ref.line}: the marker names ${name}, which no module publishes`);
                        continue;
                    }
                    if(!reach.has(list.module)) {
                        wrong.push(`${module}:${ref.line}: the marker names ${name} of ${list.module}, ` +
                                   `which this module does not import (a consumer would not read it)`);
                    }
                    for(let k of list.keys) {
                        keys.add(k);
                    }
                }
                for(let k of ref.keys) {
                    if(!keys.has(k)) {
                        wrong.push(`${module}:${ref.line}: ${JSON.stringify(k)} is marked as a key of ` +
                                   `${ref.lists.join(", ")}, and is not in it`);
                    }
                }
            }
        }
        expect(wrong).toEqual([]);
    });
});

describe("the reader the rule and the validator share", () => {
    let module = "c_yui_treedb_topics.js";      // card_action_anchor: [2]
    let rule = (code) => rule_report(parse_source(code), module);
    let keys = (code) => [...scan_ast(parse_source(code), {lib_module: module}).keys];

    test("literals, branches, nothing", () => {
        expect(rule(`card_action_anchor(a, b, ok ? "x" : "y"); card_action_anchor(a, b, c || "z");`))
            .toEqual([`${module}:1 card_action_anchor() [2]: c`]);
        expect(rule(`card_action_anchor(a, b); card_action_anchor(a, b, null); card_action_anchor(a, b, flag && "w");`))
            .toEqual([]);
    });

    test("a const is followed -- and its key SEEN -- in the scope that declares it", () => {
        let code = [
            `const TABLE_KEY = "a brand new card key";`,
            `const PICK = {ok: "picked key", no: null};`,
            `function f(TABLE_KEY_2) { card_action_anchor(a, b, TABLE_KEY); card_action_anchor(a, b, PICK.ok); }`,
            `function g(TABLE_KEY) { card_action_anchor(a, b, TABLE_KEY); }`,          // a parameter shadows it
            `function h() { let x = "let key"; card_action_anchor(a, b, x); }`,        // a let is not followed
        ].join("\n");
        expect(rule(code)).toEqual([
            `${module}:4 card_action_anchor() [2]: TABLE_KEY`,
            `${module}:5 card_action_anchor() [2]: x`
        ]);
        expect(keys(code)).toEqual(expect.arrayContaining(["a brand new card key", "picked key"]));
        expect(keys(code)).not.toContain("let key");
    });

    test("an element of a const array: .map() and for...of; every value of a computed member", () => {
        let code = [
            `const SHAPES = ["square", "circle"];`,
            `const NOTES = {a: "note a", b: "note b"};`,
            `const ROWS = [{key: "row a"}, {key: "row b"}];`,
            `function f(v) {`,
            `    t(NOTES[v]);`,
            `    for(const row of ROWS) { card_action_anchor(a, b, row.key); }`,
            `    return SHAPES.map((shape) => ({value: shape, i18n: shape}));`,
            `}`
        ].join("\n");
        expect(rule(code)).toEqual([]);
        expect(keys(code).sort()).toEqual(["circle", "note a", "note b", "row a", "row b", "square"]);
    });

    test("a marker covers what stands right after it: an argument, a branch, the whole call", () => {
        expect(rule([
            `card_action_anchor(a, b, /* i18n: data */ comment);`,
            `card_action_anchor(a, b, ok ? "x" : /* i18n: data */ comment);`,
            `/* i18n: data */ card_action_anchor(a, b, comment);`,
            `card_action_anchor(a, b, ok ? /* i18n: data */ "x" : comment);`,    // marks "x", not comment
        ].join("\n"))).toEqual([`${module}:4 card_action_anchor() [2]: comment`]);

        let r = scan_ast(parse_source([
            `card_action_anchor(a, b, /* i18n: datum */ comment);`,
            `let x = /* i18n: data */ 1;`,
            `card_action_anchor(a, b, /* i18n: C_YUI_FOO_I18N_KEYS */ ok ? "listed" : comment);`
        ].join("\n")), {lib_module: module});
        expect(r.marker_errors.map((e) => e.line)).toEqual([1, 2]);
        expect(r.marker_errors[0].why).toMatch(/is no i18n marker/);
        expect(r.marker_errors[1].why).toMatch(/^the i18n marker stands before `1;`, the value a variable is DECLARED with/);
        expect(r.marker_refs).toEqual([{lists: ["C_YUI_FOO_I18N_KEYS"], keys: ["listed"], line: 3, shapes: []}]);
    });

    test("a let or var a marker stands before is HELD to it: everything it is given is read", () => {
        let r = scan_ast(parse_source([
            `export const C_YUI_FOO_I18N_KEYS = ["listed", "listed too"];`,
            `function f(x) {`,
            `    let k = x.label || "listed";`,
            `    if(x.other) {`,
            `        k = "a new literal";`,
            `    }`,
            `    card_action_anchor(a, b, /* i18n: C_YUI_FOO_I18N_KEYS */ k);`,
            `}`,
            `function g(state) {`,
            `    let only = state? "one" : "two";`,
            `    if(state === 3) {`,
            `        only = "three";`,
            `    }`,
            `    t(/* i18n: C_YUI_FOO_I18N_KEYS */ only);`,
            `}`,
            `function h(x) {`,
            `    var v = "listed too";`,
            `    var w = v;`,
            `    t(/* i18n: data */ w);`,
            `}`,
            `function shadowed(x) {`,
            `    let s = x.name;`,
            `    function inner(s) { s = "a parameter of another function"; }`,
            `    for(s of x.list) { use(s); }`,
            `    t(/* i18n: C_YUI_FOO_I18N_KEYS */ s);`,
            `}`
        ].join("\n")), {lib_module: module});

        /*  Each literal it is given is a key asked for, and must be in the list named  */
        expect(r.keys.has("a new literal")).toBe(true);
        expect(r.marker_refs.find((ref) => ref.line === 7).keys.sort()).toEqual(["a new literal", "listed"]);

        /*  One given nothing but literals -- through another let too -- is a const not written as one  */
        expect(r.marker_errors.map((e) => e.line)).toEqual([14, 19]);
        expect(r.marker_errors[0].why).toBe('`only` is a let (line 10) that only ever holds literals ' +
            '("one", "two", "three"): make it a const, which the reader follows, and drop the marker');
        expect(r.marker_errors[1].why).toMatch(/^`w` is a var \(line 18\) that only ever holds literals \("listed too"\)/);
        expect(["one", "two", "three", "listed too"].every((k) => r.keys.has(k))).toBe(true);

        /*  A write it cannot read (a for...of over it) keeps it unknown;
         *  another binding of the same name is not a write to it  */
        expect(r.marker_refs.find((ref) => ref.line === 25).keys).toEqual([]);
        expect(r.keys.has("a parameter of another function")).toBe(false);
    });

    test("REV-CLOUD V20 (js3_v lists #1): a marker on a member or an element of a let follows the let", () => {
        let scan = (lines) => scan_ast(parse_source([`export const X_I18N_KEYS = ["in it"];`, ...lines].join("\n")),
            {lib_module: "x.js"});
        let whys = (r) => r.marker_errors.map((e) => `${e.line}: ${e.why}`);
        let marked = (r, line) => r.marker_refs.find((ref) => ref.line === line).keys.sort();

        /*  The review's repro: a let table, a let array walked, a let read from one  */
        let r = scan([
            `let LABELS = {a: "in it", b: "a brand new let-table key"};`,
            `function f(k) { return t(/* i18n: X_I18N_KEYS */ LABELS[k]); }`,
            `let LIST = ["in it", "a brand new let-array key"];`,
            `function g() { LIST.forEach((x) => t(/* i18n: X_I18N_KEYS */ x)); }`,
            `let picked = LIST[0];`,
            `function h() { t(/* i18n: X_I18N_KEYS */ picked); }`,
        ]);
        expect(["a brand new let-table key", "a brand new let-array key"].every((k) => r.keys.has(k))).toBe(true);
        expect(whys(r)).toEqual([
            '3: `LABELS` is a let (line 2) that only ever holds literals ("in it", "a brand new let-table key"): ' +
                'make it a const, which the reader follows, and drop the marker',
            '5: `LIST` is a let (line 4) that only ever holds literals ("in it", "a brand new let-array key"): ' +
                'make it a const, which the reader follows, and drop the marker',
            '7: `picked` is a let (line 6) that only ever holds literals ("in it", "a brand new let-array key"), ' +
                'through the let `LIST` (line 4): make them consts, which the reader follows, and drop the marker'
        ]);

        /*  A table that also holds data, or is written INTO: each literal is
         *  read and must be in the list, and no "make it a const" (a const
         *  would not carry what is written into it)  */
        let d = scan([
            `let LABELS = {a: "in it", b: "table key"};`,
            `function f(x, k) { if(x) { LABELS = x.labels; } t(/* i18n: X_I18N_KEYS */ LABELS[k]); }`,
            `let PUSHED = [];`,
            `PUSHED.push("pushed key");`,
            `function g() { for(const x of PUSHED) { t(/* i18n: X_I18N_KEYS */ x); } }`,
            `let NAMED = {a: "in it"};`,
            `NAMED.b = "member key";`,
            `Object.assign(NAMED, {a: "assigned key"});`,
            `function h(k) { t(/* i18n: X_I18N_KEYS */ NAMED[k]); }`,
            `function i() { t(/* i18n: X_I18N_KEYS */ NAMED.c); }`,
        ]);
        expect(whys(d)).toEqual([]);
        expect(marked(d, 3)).toEqual(["in it", "table key"]);
        expect(marked(d, 6)).toEqual(["pushed key"]);
        expect(marked(d, 10)).toEqual(["assigned key", "in it", "member key"]);
        expect(marked(d, 11)).toEqual([]);     // NAMED.c: no write reaches it

        /*  The same for a key position of a key function, and a parameter of
         *  the same name is not the let  */
        let k = scan_ast(parse_source([
            `import {yui_shell_confirm_ok} from "./shell_modals.js";`,
            `export const X_I18N_KEYS = ["in it"];`,
            `let opts = {title: "a let option"};`,
            `function f(shell) { yui_shell_confirm_ok(shell, "in it", /* i18n: X_I18N_KEYS */ opts); }`,
            `let LIST = ["in it", "shadowed"];`,
            `function g(LIST) { LIST.forEach((x) => t(/* i18n: X_I18N_KEYS */ x)); }`,
        ].join("\n")), {lib_module: module});
        expect(k.keys.has("a let option")).toBe(true);
        expect(k.keys.has("shadowed")).toBe(false);
        expect(whys(k)).toEqual(['4: `opts` is a let (line 3) that only ever holds literals ("a let option"): ' +
            'make it a const, which the reader follows, and drop the marker']);
    });

    test("a key position of the enclosing table function is handed on", () => {
        let code = [
            `function answer_print_tranger_refused(gobj, x, kw) { card_action_anchor(a, b, kw.i18n); }`,
            `function other(gobj, x, kw) { card_action_anchor(a, b, kw.i18n); }`
        ].join("\n");
        expect(rule(code)).toEqual([`${module}:2 card_action_anchor() [2]: kw.i18n`]);
    });

    test("options, spreads and Object.assign", () => {
        let src = parse_source([
            `import {yui_shell_confirm_danger} from "./shell_modals.js";`,
            `const BASE = {cancel_label: "base cancel"};`,
            `yui_shell_confirm_danger(shell, "m", Object.assign(opts, {confirm_label: "d"}));`,
            `yui_shell_confirm_danger(shell, "m", {...BASE, title: "t"});`
        ].join("\n"));
        let calls = key_calls(src, "some_module.js");
        let at = (i, path) => values_at(calls[i].call, path, calls[i].scope)
            .map((l) => l.kind === "key"? l.value : l.kind);
        expect(at(0, "2.confirm_label")).toEqual(["unknown", "d"]);     // `opts` may hold one too
        expect(at(1, "2.cancel_label")).toEqual(["base cancel"]);
        expect(at(1, "2.title")).toEqual(["t"]);
        expect(leaves_of(parse_source(`x;`).body[0].expression).map((l) => l.kind)).toEqual(["unknown"]);
    });
});

describe("REV-CLOUD V21.4.2-3: the data marker is a claim; DOM is no key; a translated text is no key", () => {
    let module = "x.js";
    let head = [
        `import {yui_shell_show_info, yui_shell_show_modal} from "./shell_modals.js";`,
        `import {createElement2} from "@yuneta/gobj-js";`
    ];
    let scan = (lines) => scan_ast(parse_as([...head, ...lines].join("\n"), module), {lib_module: module});
    let rule = (lines) => rule_report(parse_as([...head, ...lines].join("\n"), module), module);

    test("the review's repro: a data marker on a call that returns a literal FAILS", () => {
        let r = scan([
            `function pick() { return "a literal behind a call"; }`,
            `yui_shell_show_info(shell, /* i18n: data */ pick());`
        ]);
        expect(r.marker_errors.map((e) => `${e.line}: ${e.why}`)).toEqual([
            '4: marked as data, but what it marks is the key "a literal behind a call", which the reader ' +
                'follows: drop the marker (it is no data)'
        ]);
        /*  ...and the call is READ: unmarked, it passes the rule and its key is asked for  */
        let unmarked = [`function pick() { return "a literal behind a call"; }`,
                        `yui_shell_show_info(shell, pick());`];
        expect(rule(unmarked)).toEqual([]);
        expect(scan(unmarked).keys.has("a literal behind a call")).toBe(true);
    });

    test("a data marker on data, or on data with a literal fallback, is legal", () => {
        let r = scan([
            `function f(kw) { yui_shell_show_info(shell, /* i18n: data */ kw.comment || "fallback key"); }`,
            `function g(kw) { return t(/* i18n: data */ kw.comment); }`,
            `function h(x) { return x.label; }`,
            `yui_shell_show_info(shell, /* i18n: data */ h(y));`          // returns a parameter: not followed
        ]);
        expect(r.marker_errors).toEqual([]);
        expect(r.keys.has("fallback key")).toBe(true);
    });

    test("DOM at a key position passes the rule; a name proves nothing", () => {
        expect(rule([
            `const $box = createElement2(["div"]);`,
            `yui_shell_show_modal(shell, $box);`,
            `yui_shell_show_modal(shell, ["div", {}, "a spec"]);`,
            `let $msg = null;`,
            `if(x) { $msg = createElement2(["p"]); }`,
            `yui_shell_show_info(shell, $msg);`
        ])).toEqual([]);
        expect(rule([
            `yui_shell_show_modal(shell, $box);`,
            `let $mixed = createElement2(["p"]);`,
            `$mixed = "a key in the let";`,
            `yui_shell_show_info(shell, $mixed);`
        ])).toEqual([`${module}:3 yui_shell_show_modal() [1]: $box`, `${module}:6 yui_shell_show_info() [1]: $mixed`]);
    });

    test("a translated text at a key position FAILS, marked or not", () => {
        expect(rule([
            `yui_shell_show_info(shell, t("saved"));`,
            `yui_shell_show_info(shell, /* i18n: data */ i18next.t("saved"));`
        ])).toEqual([
            `${module}:3 yui_shell_show_info() [1]: t("saved") -- a TRANSLATED text where a key goes: hand the key`,
            `${module}:4 yui_shell_show_info() [1]: i18next.t("saved") -- a TRANSLATED text where a key goes: hand the key`
        ]);
    });
});

describe("REV-CLOUD V20.5 repro, on the real module", () => {
    let original = readFileSync(join(SRC, "c_yui_treedb_topics.js"), "utf8");
    let call = `actions.push(card_action_anchor(\n            "TREEDB_CARD_TABLE", "yi-table", "table", fill(routes.table)));`;

    test("the call it mutates is there", () => {
        expect(original).toContain(call);
    });

    test("a const key handed to card_action_anchor is READ: the validator asks for it", () => {
        let mutated = original.replace(call, call.replace(`"table"`, "TABLE_KEY"))
            .replace(`const GCLASS_NAME = "C_YUI_TREEDB_TOPICS";`,
                     `const GCLASS_NAME = "C_YUI_TREEDB_TOPICS";\nconst TABLE_KEY = "a brand new card key";`);
        let ast = parse_source(mutated);
        expect(rule_report(ast, "c_yui_treedb_topics.js")).toEqual([]);
        expect(scan_ast(ast, {lib_module: "c_yui_treedb_topics.js"}).keys.has("a brand new card key")).toBe(true);
    });

    test("a key it cannot read, unmarked, FAILS with the file and the line", () => {
        let mutated = original.replace(call, `let table_key = "table";\n        ` +
            call.replace(`"table"`, "table_key"));
        let ast = parse_source(mutated);
        let line = mutated.slice(0, mutated.indexOf("table_key,")).split("\n").length;
        expect(rule_report(ast, "c_yui_treedb_topics.js"))
            .toEqual([`c_yui_treedb_topics.js:${line} (call at ${line - 1}) card_action_anchor() [2]: table_key`]);

        /*  ...and the module publishing a list does not exempt it any more  */
        let listed = mutated.replace(`const GCLASS_NAME = "C_YUI_TREEDB_TOPICS";`,
            `const GCLASS_NAME = "C_YUI_TREEDB_TOPICS";\nexport const C_YUI_TREEDB_TOPICS_I18N_KEYS = ["table"];`);
        expect(rule_report(parse_source(listed), "c_yui_treedb_topics.js").length).toBe(1);

        /*  A marker naming the list is what ties the call to it  */
        let marked = listed.replace("table_key,", "/* i18n: C_YUI_TREEDB_TOPICS_I18N_KEYS */ table_key,");
        expect(rule_report(parse_source(marked), "c_yui_treedb_topics.js")).toEqual([]);
    });
});

describe("REV-CLOUD V20 (js2_va #1): a marker on a let does not let it pass unread", () => {
    let original = readFileSync(join(SRC, "c_yui_treedb_topic_with_form.js"), "utf8");
    let decl = `    const title = (mode === "create")? "new" : ((mode === "view")? "view" : "edit");`;
    let use = `        title:         title,`;
    let lib_module = "c_yui_treedb_topic_with_form.js";
    let scan = (code) => scan_ast(parse_source(code), {lib_module});

    test("what it mutates is there", () => {
        expect(original).toContain(decl);
        expect(original).toContain(use);
    });

    test("the review's repro: a new literal branch on the marked let FAILS", () => {
        /*  The let and its marker, as they were, plus the review's branch  */
        let mutated = original
            .replace(decl, `    let title = (mode === "clone")? "a brand new clone title" :\n` +
                           `        (mode === "create")? "new" : ((mode === "view")? "view" : "edit");`)
            .replace(use, `        title:         /* i18n: C_YUI_TREEDB_TOPIC_WITH_FORM_I18N_KEYS */ title,`)
            .replace(`const GCLASS_NAME = "C_YUI_TREEDB_TOPIC_WITH_FORM";`,
                     `const GCLASS_NAME = "C_YUI_TREEDB_TOPIC_WITH_FORM";\n` +
                     `export const C_YUI_TREEDB_TOPIC_WITH_FORM_I18N_KEYS = ["new", "view", "edit"];`);
        let r = scan(mutated);
        expect(r.keys.has("a brand new clone title")).toBe(true);
        expect(r.marker_errors.map((e) => e.why)).toEqual([expect.stringMatching(
            /^`title` is a let \(line \d+\) that only ever holds literals \("a brand new clone title", "new", "view", "edit"\): make it a const/)]);

        /*  ...and a let that also holds data: the new literal must be in the list  */
        let mixed = mutated.replace(`(mode === "clone")? "a brand new clone title" :`,
            `(mode === "clone")? "a brand new clone title" : (mode === "custom")? priv.custom_title :`);
        let m = scan(mixed);
        expect(m.marker_errors).toEqual([]);
        let ref = m.marker_refs.find((x) => x.lists.includes("C_YUI_TREEDB_TOPIC_WITH_FORM_I18N_KEYS"));
        expect(ref.keys).toContain("a brand new clone title");
        let listed = new Set(m.lists.find((l) => l.name === "C_YUI_TREEDB_TOPIC_WITH_FORM_I18N_KEYS").keys);
        expect(ref.keys.filter((k) => !listed.has(k))).toEqual(["a brand new clone title"]);
    });

    test("the module as it is now: a const, and a new branch is READ", () => {
        let mutated = original.replace(decl,
            `    const title = (mode === "clone")? "a brand new clone title" :\n` +
            `        (mode === "create")? "new" : ((mode === "view")? "view" : "edit");`);
        let r = scan(mutated);
        expect(r.keys.has("a brand new clone title")).toBe(true);
        expect(r.marker_errors).toEqual([]);

        let camera = readFileSync(join(SRC, "yui_graph_camera.js"), "utf8");
        let key = `    const key = (state === "arming")? "click the element to centre on"`;
        expect(camera).toContain(key);
        let c = scan_ast(parse_source(camera.replace(key,
            `    const key = (state === "pinned")? "a brand new camera key"\n            : (state === "arming")? "click the element to centre on"`)),
            {lib_module: "yui_graph_camera.js"});
        expect(c.keys.has("a brand new camera key")).toBe(true);
    });
});

describe("the published *_I18N_KEYS lists", () => {
    test("every list is readable (exported, an array of literals), lower-case ASCII, with no duplicate", () => {
        let wrong = [];
        for(let module of MODULES) {
            let r = published_lists(ast_of(module));
            for(let why of r.errors) {
                wrong.push(`${module}: ${why}`);
            }
            for(let list of r.lists) {
                let seen = new Set();
                for(let k of list.keys) {
                    if(!/^[\x20-\x7e]+$/.test(k) || k !== k.toLowerCase()) {
                        wrong.push(`${module} ${list.name}: ${JSON.stringify(k)} is no key a validated locale can hold`);
                    }
                    if(seen.has(k)) {
                        wrong.push(`${module} ${list.name}: ${JSON.stringify(k)} twice`);
                    }
                    seen.add(k);
                }
            }
        }
        expect(wrong).toEqual([]);
    });

    test("no stale key: each one is written elsewhere in its module", () => {
        let wrong = [];
        for(let module of MODULES) {
            let ast = ast_of(module);
            let lists = published_lists(ast).lists;
            if(lists.length === 0) {
                continue;
            }
            /*  The ranges of the lists themselves: a key there proves nothing  */
            let ranges = [];
            walk(ast, (n) => {
                if(n.type === "VariableDeclarator" && n.id.type === "Identifier"
                        && /_I18N_KEYS$/i.test(n.id.name) && n.init) {
                    ranges.push([n.init.start, n.init.end]);
                }
            });
            let inside = (n) => ranges.some(([a, b]) => n.start >= a && n.end <= b);
            let literals = new Set();
            walk(ast, (n) => {
                if(inside(n)) {
                    return;
                }
                if(n.type === "Literal" && typeof n.value === "string") {
                    literals.add(n.value);
                } else if(n.type === "TemplateLiteral" && n.expressions.length === 0) {
                    literals.add(n.quasis[0].value.cooked);
                }
            });
            for(let list of lists) {
                for(let k of list.keys) {
                    if(!literals.has(k)) {
                        wrong.push(`${module} ${list.name}: ${JSON.stringify(k)} is written nowhere else in the module`);
                    }
                }
            }
        }
        expect(wrong).toEqual([]);
    });

    test("a list derived from a table covers it", () => {
        let lists = all_lists();
        let wrong = [];
        for(let entry of COVERAGE) {
            if(entry.from) {
                wrong.push(...missing_from_list(entry, lists));
            }
            if(entry.test) {
                let path = join(SRC, entry.test);
                if(!existsSync(path) || !readFileSync(path, "utf8").includes(entry.list)) {
                    wrong.push(`${entry.list}: its test ${entry.test} does not hold it`);
                }
            }
        }
        expect(wrong).toEqual([]);
    });

    test("no orphan list: each one is covered here or named by a marker", () => {
        let named = new Set(COVERAGE.map((e) => e.list));
        for(let module of MODULES) {
            for(let ref of scan_ast(ast_of(module), {lib_module: module}).marker_refs) {
                for(let name of ref.lists) {
                    named.add(name);
                }
            }
        }
        let orphans = [...all_lists()].filter(([name]) => !named.has(name))
            .map(([name, list]) => `${list.module}: ${name} is named by no marker and covered by no test`);
        expect(orphans).toEqual([]);
    });

    test("every key of every list is PINNED: dropping it fails a check, or the module reads it anyway", () => {
        expect(unpinned_keys(all_lists(), COVERAGE)).toEqual([]);
    });

    test("the pin check fails when it should (REV-CLOUD V20, js2_va #2)", () => {
        let lists = all_lists();

        /*  Without the coverage this round added, the keys the review found
         *  pinned by nothing are reported, each one  */
        let added = ["C_YUI_FORM_I18N_KEYS", "FORM_JSON_FIELD_I18N_KEYS", "SHELL_ROUTE_MAP_I18N_KEYS",
                     "WIZARD_HELPERS_I18N_KEYS", "C_YUI_SCHEMA_EDITOR_I18N_KEYS"];
        let report = unpinned_keys(lists, COVERAGE.filter((e) => !added.includes(e.list)));
        let reported = (name, key) => report.some((line) => line.includes(`${name}: ${JSON.stringify(key)} `));
        for(let [name, key] of [
            ["FORM_JSON_FIELD_I18N_KEYS", "invalid json"],
            ["SHELL_ROUTE_MAP_I18N_KEYS", "toolbar"],
            ["SHELL_ROUTE_MAP_I18N_KEYS", "other routes"],
            ["WIZARD_HELPERS_I18N_KEYS", "confirm"],
            ["WIZARD_HELPERS_I18N_KEYS", "next"],
            ["C_YUI_SCHEMA_EDITOR_I18N_KEYS", "error"],
            ["C_YUI_SCHEMA_EDITOR_I18N_KEYS", "warning"]
        ]) {
            expect(reported(name, key), `${name} ${key}`).toBe(true);
        }

        /*  ...and with it, the review's repro -- a key dropped from its
         *  list -- fails the coverage of that list  */
        /*  "app" (the route map's root when the app names no brand) is pinned
         *  twice since V21.4.1: the marker moved to the call of render_node()
         *  follows the `let root` it marks, and the list must hold its label  */
        expect(reported("SHELL_ROUTE_MAP_I18N_KEYS", "app")).toBe(false);
        let route_map_refs = scan_of("shell_route_map.js").marker_refs
            .filter((ref) => ref.lists.includes("SHELL_ROUTE_MAP_I18N_KEYS"));
        expect(route_map_refs.flatMap((ref) => ref.keys)).toContain("app");
        /*  ...and "this field is required" since V22: field_validation_key()
         *  returns it OR the json field's own error, and the list marker on
         *  the `let key` that holds the call holds that key to its lists  */
        expect(reported("C_YUI_FORM_I18N_KEYS", "this field is required")).toBe(false);
        let form_refs = scan_of("c_yui_form.js").marker_refs
            .filter((ref) => ref.lists.includes("C_YUI_FORM_I18N_KEYS"));
        expect(form_refs.flatMap((ref) => ref.keys)).toContain("this field is required");

        for(let [name, key] of [
            ["C_YUI_FORM_I18N_KEYS", "this field is required"],
            ["C_YUI_SCHEMA_EDITOR_I18N_KEYS", "error"],
            ["C_YUI_SCHEMA_EDITOR_I18N_KEYS", "warning"],
            ["SHELL_ROUTE_MAP_I18N_KEYS", "other routes"],
            ["WIZARD_HELPERS_I18N_KEYS", "next"],
            ["FORM_JSON_FIELD_I18N_KEYS", "invalid json"]
        ]) {
            let entry = COVERAGE.find((e) => e.list === name);
            expect(missing_from_list(entry, with_key_dropped(lists, name, key))).toEqual([
                `${entry.module} ${name}: ${JSON.stringify(key)} is in its source, not in the list`
            ]);
        }

        /*  The rest of the review's 17 keys have no list any more: the
         *  module reads them where it writes them  */
        let reads = (module, key) => scan_of(module).read_keys.has(key);
        for(let [module, key] of [
            ["c_yui_nav.js", "navigation"],
            ["c_yui_pager.js", "close"],
            ["c_yui_schema_editor.js", "delete this column?"],
            ["c_yui_treedb_topic_with_form.js", "view"],
            ["c_yui_window.js", "restore"],
            ["yui_graph_camera.js", "click the element to centre on"],
            ["yui_graph_camera.js", "centred: click to release"],
            ["yui_table_select.js", "clear selection"]
        ]) {
            expect(reads(module, key), `${module} ${key}`).toBe(true);
        }
    });

    test("the coverage and orphan checks fail when they should", () => {
        let lists = all_lists();
        /*  A row added to a table, its key not to the list  */
        let entry = COVERAGE.find((e) => e.list === "C_YUI_GOBJ_TREE_JS_I18N_KEYS");
        let ast = parse_as(readFileSync(join(SRC, entry.module), "utf8")
            .replace(`const LAYOUTS = {`, `const LAYOUTS = {\n    "spiral": {key: "spiral layout"},`), entry.module);
        expect(entry.from(ast).keys).toContain("spiral layout");
        expect(missing_from_list(entry, lists, ast)).toEqual([
            `${entry.module} ${entry.list}: "spiral layout" is in its source, not in the list`
        ]);

        /*  A marked key that is not in the list it names  */
        let r = scan_ast(parse_source([
            `export const X_I18N_KEYS = ["in it"];`,
            `const K = "not in it";`,
            `t(/* i18n: X_I18N_KEYS */ K);`
        ].join("\n")), {lib_module: "x.js"});
        expect(r.marker_refs).toEqual([{lists: ["X_I18N_KEYS"], keys: ["not in it"], line: 3, shapes: []}]);
    });
});

describe("REV-CLOUD V20 (js3_v lists #2): a COVERAGE source is read the way the validator reads", () => {
    let lists = all_lists();
    let form = COVERAGE.find((e) => e.list === "C_YUI_FORM_I18N_KEYS");
    let route_map = COVERAGE.find((e) => e.list === "SHELL_ROUTE_MAP_I18N_KEYS");
    let mutated = (module, edits) => {
        let code = readFileSync(join(SRC, module), "utf8");
        for(let [a, b] of edits) {
            expect(code, `${module}: ${a}`).toContain(a);
            code = code.replace(a, b);
        }
        return parse_as(code, module);
    };
    let missing = `    if(v && v.valueMissing) {`;
    let decl = `function field_validation_key($input)`;
    let other_routes = `    if(Array.isArray(map.other) && map.other.length) {`;

    test("the review's repro: a const the function returns, a const label it pushes -- each FAILS", () => {
        let ast = mutated(form.module, [
            [missing, `    if(v && v.typeMismatch) {\n        return TYPE_MISMATCH_KEY;\n    }\n${missing}`],
            [decl, `const TYPE_MISMATCH_KEY = "a brand new type mismatch key";\n${decl}`]
        ]);
        expect(missing_from_list(form, lists, ast)).toEqual([
            `c_yui_form.js C_YUI_FORM_I18N_KEYS: "a brand new type mismatch key" is in its source, not in the list`
        ]);

        let map = mutated(route_map.module, [
            [other_routes, `    children.push({label: SHORTCUTS_GROUP, icon: "", route: "", event: "", children: []});\n` +
                           other_routes],
            [`function build_body(shell, t)`,
             `const SHORTCUTS_GROUP = "a brand new shortcuts group";\nfunction build_body(shell, t)`]
        ]);
        expect(missing_from_list(route_map, lists, map)).toEqual([
            `shell_route_map.js SHELL_ROUTE_MAP_I18N_KEYS: "a brand new shortcuts group" is in its source, not in the list`
        ]);
    });

    test("a let is followed into everything it is given; a value it cannot follow FAILS, with the line", () => {
        let ast = mutated(form.module, [
            [missing, `    let k = "a let key";\n    if(v && v.badInput) {\n        k = "a let key too";\n    }\n` +
                      `    if(v && v.typeMismatch) {\n        return k;\n    }\n${missing}`]
        ]);
        expect(missing_from_list(form, lists, ast)).toEqual([
            `c_yui_form.js C_YUI_FORM_I18N_KEYS: "a let key" is in its source, not in the list`,
            `c_yui_form.js C_YUI_FORM_I18N_KEYS: "a let key too" is in its source, not in the list`
        ]);

        let code = readFileSync(join(SRC, form.module), "utf8");
        let unread = mutated(form.module, [
            [missing, `    if(v && v.typeMismatch) {\n        return $input.dataset.key;\n    }\n` +
                      `    let w = $input.custom || "this field is required";\n    if(v && v.patternMismatch) {\n` +
                      `        return w;\n    }\n${missing}`]
        ]);
        let line = code.slice(0, code.indexOf(missing)).split("\n").length;
        expect(missing_from_list(form, lists, unread)).toEqual([
            `c_yui_form.js:${line + 1}: C_YUI_FORM_I18N_KEYS is derived from this source, and the reader ` +
                `cannot follow $input.dataset.key: write the key as a literal or a const, or name it as data ` +
                `in its COVERAGE entry`,
            `c_yui_form.js:${line + 5}: C_YUI_FORM_I18N_KEYS is derived from this source, and the reader ` +
                `cannot follow w, which holds $input.custom (line ${line + 3}): write the key as a literal or a ` +
                `const, or name it as data in its COVERAGE entry`
        ]);
    });

    test("a value named as data that the source no longer reads is stale, and FAILS", () => {
        let entry = Object.assign({}, form, {data: Object.assign({"$input.gone": "nothing reads it"}, form.data)});
        expect(missing_from_list(entry, lists)).toEqual([
            `c_yui_form.js C_YUI_FORM_I18N_KEYS: COVERAGE names "$input.gone" as data, and its source reads no such value`
        ]);
        let none = Object.assign({}, form, {data: {}});
        expect(missing_from_list(none, lists)).toEqual([expect.stringMatching(
            /^c_yui_form\.js:\d+: C_YUI_FORM_I18N_KEYS is derived from this source, and the reader cannot follow \$input\.yui_json_error:/)]);
    });
});

describe("REV-CLOUD V22.1: a recursive helper is read once, and never hangs the reader", () => {
    let module = "x.js";
    let head = [`import {yui_shell_show_info} from "./shell_modals.js";`];
    let rule = (lines) => rule_report(parse_as([...head, ...lines].join("\n"), module), module);
    let scan = (lines) => scan_ast(parse_as([...head, ...lines].join("\n"), module), {lib_module: module});

    /*  The review's case, verbatim: 7.26.28 read it in 12 ms, 7.26.29 in
     *  more than two minutes (x3 per level of MAX_DEPTH), and with three
     *  recursive ifs it never ended  */
    let label_of = (branches) => [
        `function label_of(n) {`,
        `    if(n.alias) { return label_of(n.alias); }`,
        `    if(n.parent) { return label_of(n.parent); }`,
        ...(branches > 2? [`    if(n.other) { return label_of(n.other); }`] : []),
        `    return n.name;`,
        `}`
    ];

    test("the review's case (two and three recursive branches): fast, and `n.name` is data", () => {
        for(let branches of [2, 3]) {
            let t0 = Date.now();
            let lines = [...label_of(branches),
                         `export function f($el, node, shell) {`,
                         `    $el.textContent = t(label_of(node));`,
                         `    yui_shell_show_info(shell, label_of(node));`,
                         `}`];
            let at = 1 + lines.indexOf(`    yui_shell_show_info(shell, label_of(node));`) + 1;
            expect(rule(lines)).toEqual([`${module}:${at} yui_shell_show_info() [1]: label_of(node)`]);
            let marked = lines.map((l) => l.replace("yui_shell_show_info(shell, label_of(node))",
                                                    "yui_shell_show_info(shell, /* i18n: data */ label_of(node))"));
            expect(rule(marked)).toEqual([]);
            expect(scan(marked).marker_errors).toEqual([]);
            expect(Date.now() - t0).toBeLessThan(2000);
        }
    });

    test("a recursion is not followed, whatever it returns; a helper called on many paths is read once", () => {
        /*  Returns only literals, through itself: the reader does not follow
         *  a recursion, so the call is a value it cannot follow  */
        expect(rule([`function up(n) { if(n.parent) { return up(n.parent); } return "root"; }`,
                     `yui_shell_show_info(shell, up(node));`]))
            .toEqual([`${module}:3 yui_shell_show_info() [1]: up(node)`]);
        /*  Mutual recursion, the same  */
        expect(rule([`function a(n) { return n? b(n.x) : "from a"; }`,
                     `function b(n) { return n? a(n.y) : "from b"; }`,
                     `yui_shell_show_info(shell, a(node));`]).length).toBe(1);

        /*  A fan: 16 helpers, each calling the next in three branches. Read
         *  at every call, as 7.26.29 did, it is 3^16 reads  */
        let fan = [];
        for(let i = 0; i < 16; i++) {
            fan.push(`function h${i}(c) { if(c === 1) { return h${i + 1}(c); } ` +
                     `if(c === 2) { return h${i + 1}(c); } return h${i + 1}(c); }`);
        }
        fan.push(`function h16(c) { return c? "deep key" : "other deep key"; }`);
        let t0 = Date.now();
        let r = scan([...fan, `t(h0(1));`]);
        expect(Date.now() - t0).toBeLessThan(2000);
        expect(r.keys.has("deep key") && r.keys.has("other deep key")).toBe(true);
    });
});

describe("REV-CLOUD V22.2: what the search for forwarders sees, and what fails it", () => {
    let module = "x.js";
    let found_in = (lines) => {
        let ast = parse_as(lines.join("\n"), module);
        return find_forwarders([module], () => ast, []);
    };
    let keys_of = (found) => Object.fromEntries(found.found.map((f) => [f.name, f.keys.slice().sort()]));

    test("the forms it follows: each one is a position of the function", () => {
        let found = found_in([
            `import i18next from "i18next";`,
            `import {t as tt} from "i18next";`,
            `const ATTR = "data-i18n-title";`,
            `const PROP = "data-i18n";`,
            `export function f_opt(gobj, opts) { return t(opts?.title); }`,
            `export function f_args(gobj) { return t(arguments[1]); }`,
            `export function f_alias(gobj, k) { const translate = t; return translate(k); }`,
            `export function f_import(gobj, k) { return tt(k); }`,
            `export function f_optcall(gobj, k) { return t?.(k); }`,
            `export function f_call(gobj, k) { return t.call(null, k); }`,
            `export function f_bind(gobj, k) { const tb = i18next.t.bind(i18next); return tb(k); }`,
            `export function f_destr(gobj, opts) { const {title} = opts; let {label} = opts; return [t(title), t(label)]; }`,
            `export function f_copy(gobj, opts) { const o = {...opts}; const p = Object.assign({}, opts); return [t(o.title), t(p.label)]; }`,
            `export function f_rest(gobj, ...rest) { return t(rest[0]); }`,
            `export function f_list(gobj, k) { return t([k, "a fallback key"]); }`,
            `export function f_dataset(gobj, el, k) { el.dataset.i18nTitle = k; }`,
            `export function f_attr(gobj, el, k) { el.setAttribute(ATTR, k); }`,
            `export function f_prop(gobj, k) { return {[PROP]: k}; }`,
        ]);
        expect(found.opaque).toEqual([]);
        expect(keys_of(found)).toEqual({
            f_opt: ["1.title"], f_args: ["1"], f_alias: ["1"], f_import: ["1"], f_optcall: ["1"],
            f_call: ["1"], f_bind: ["1"], f_destr: ["1.label", "1.title"], f_copy: ["1.label", "1.title"],
            f_rest: ["1"], f_list: ["1"], f_dataset: ["2"], f_attr: ["2"], f_prop: ["1"]
        });
        let r = scan_ast(parse_as(`export function f(gobj, k) { return t([k, "a fallback key"]); }`, module),
                         {lib_module: module});
        expect(r.keys.has("a fallback key")).toBe(true);     // an array given to t() is a list of KEYS
    });

    test("what no position can name FAILS, named, with the file and the line -- unless it is marked", () => {
        let lines = [
            `export function o_lower(gobj, k) { return t(k.toLowerCase()); }`,
            `export function o_entries(gobj, opts) { Object.entries(opts).forEach(([k, v]) => t(v)); }`,
            `export function o_rest(gobj, ...rest) { rest.forEach((x) => t(x)); }`,
            `export function o_concat(gobj, k) { return {i18n: "prefix " + k}; }`,
            `export function o_index(gobj, i) { return t(arguments[i]); }`,
            `export function o_array(gobj, [a, b]) { return t(a); }`,
            `export function o_let(gobj, k) { let x = "a"; x += k; return t(x); }`,
            `export function o_own(gobj) { return t(gobj_read_attr(gobj, "title").trim()); }`,  // the gobj's own state
            `export function o_priv(gobj, ctx) { return t(ctx.gobj.priv.label.trim()); }`,      // a priv
        ];
        let found = found_in(lines);
        expect(found.opaque.map((o) => `${o.name} ${o.line} ${o.pos}`)).toEqual([
            "o_lower 1 1", "o_entries 2 1", "o_rest 3 1", "o_concat 4 1", "o_index 5 arguments",
            "o_array 6 1", "o_let 7 1"
        ]);
        expect(forwarders_report(found)[0]).toBe("x.js:1 o_lower() hands its parameter [1] to a place a key " +
            "is read through `k.toLowerCase()`, which no position can name: hand the key on as it arrives (the " +
            "function then goes in the table), or mark it where it hands it");
        /*  ...and marked where it hands it, it passes  */
        let marked = found_in([
            `export function o_lower(gobj, k) { return t(/* i18n: data */ k.toLowerCase()); }`,
            `export function o_entries(gobj, opts) { Object.entries(opts).forEach(([k, v]) => t(/* i18n: data */ v)); }`
        ]);
        expect(marked.opaque).toEqual([]);
    });

    test("the table is checked for CORRECTNESS, not only for completeness: an extra entry fails", () => {
        let found = find_forwarders(MODULES, ast_of, []).found;
        let extra = [...I18N_KEY_FUNCTIONS.filter((e) => e.name !== "yui_shell_show_info"),
            {module: "shell_modals.js", name: "yui_shell_show_info", exported: true, keys: ["1", "2.extra"]},
            {module: "shell_modals.js", name: "yui_shell_show_warning", exported: false, keys: ["1"]},
            {module: "c_yui_nav.js", name: "no_such_forwarder", exported: false, keys: ["0"]}];
        let errors = table_errors(found, extra);
        expect(errors).toEqual(expect.arrayContaining([
            expect.stringMatching(/^shell_modals\.js yui_shell_show_info \[2\.extra\]: no hand-off the search finds/),
            "shell_modals.js yui_shell_show_warning: `exported: false`, and the module exports it",
            expect.stringMatching(/^c_yui_nav\.js no_such_forwarder \[0\]: no hand-off the search finds/)
        ]));
        /*  ...as the real table was, before V22: an action label that went
         *  through a DOM property, a flag that hid an export  */
        expect(table_errors(found)).toEqual([]);
    });
});

describe("REV-CLOUD V22.3-4: the data marker hides no key; one notion of a translator", () => {
    let module = "x.js";
    let head = [`import {yui_shell_show_info} from "./shell_modals.js";`,
                `import {t as tt} from "i18next";`];
    let scan = (lines) => scan_ast(parse_as([...head, ...lines].join("\n"), module), {lib_module: module});
    let rule = (lines) => rule_report(parse_as([...head, ...lines].join("\n"), module), module);
    let whys = (r) => r.marker_errors.map((e) => `${e.line}: ${e.why}`);

    test("a data marker on a call that MIXES a key with data fails: split the branches", () => {
        let r = scan([`function label(kw) { return kw.ok? "a mixed key" : kw.comment; }`,
                      `yui_shell_show_info(shell, /* i18n: data */ label(kw));`,
                      `yui_shell_show_info(shell, /* i18n: data */ kw.comment || "a split key");`]);
        expect(whys(r)).toEqual([expect.stringMatching(
            /^4: marked as data, but `label\(kw\)` can also return the key "a mixed key": .* Split the branches/)]);
        expect(r.keys.has("a split key")).toBe(true);
        /*  Under a list marker, that key is asked for and must be in the list  */
        let l = scan([`export const X_I18N_KEYS = ["in it"];`,
                      `function label(kw) { return kw.ok? "a mixed key" : kw.comment; }`,
                      `yui_shell_show_info(shell, /* i18n: X_I18N_KEYS */ label(kw));`]);
        expect(l.marker_refs).toEqual([{lists: ["X_I18N_KEYS"], keys: ["a mixed key"], line: 5, shapes: []}]);
    });

    test("a data marker on an array of strings fails: it is no DOM", () => {
        let r = scan([`yui_shell_show_info(shell, /* i18n: data */ ["a key", "another key"]);`,
                      `yui_shell_show_info(shell, /* i18n: data */ ["div", {}, "a spec is DOM"]);`]);
        expect(whys(r)).toEqual([expect.stringMatching(
            /^3: marked as data, but what it marks is an array of string literals \("a key", "another key"\), which is no DOM/)]);
        expect(rule([`yui_shell_show_info(shell, ["a key", "another key"]);`]))
            .toEqual([`${module}:3 yui_shell_show_info() [1]: ["a key", "another key"]`]);
    });

    test("a marker attaches through a parenthesis, and one that attaches nowhere says what it stands before", () => {
        let r = scan([`yui_shell_show_info(shell, /* i18n: data */ (kw.comment || "a fallback in parens"));`,
                      `function f(kw) { return t(/* i18n: data */ (kw.a || kw.b)); }`,
                      `let x = /* i18n: data */ kw.comment;`,
                      `x = /* i18n: data */ kw.other;`,
                      `function g() { return /* i18n: data */ kw.third; }`,
                      `t("a" + /* i18n: data */ kw.fourth);`]);
        expect(r.keys.has("a fallback in parens")).toBe(true);
        expect(whys(r)).toEqual([
            expect.stringMatching(/^5: the i18n marker stands before `kw\.comment;`, the value a variable is DECLARED with/),
            expect.stringMatching(/^6: the i18n marker stands before `kw\.other;`, a value ASSIGNED/),
            expect.stringMatching(/^7: the i18n marker stands before `kw\.third; }`, a value RETURNED/),
            expect.stringMatching(/^8: the i18n marker stands before `kw\.fourth\);`, inside a concatenation/)
        ]);
    });

    test("a translated text at a key position fails, MARKED too, whatever the translator is called", () => {
        let lines = [
            `const translate = t;`,
            `function tr(k) { return t(k); }`,
            `yui_shell_show_info(shell, /* i18n: data */ tr("saved"));`,
            `yui_shell_show_info(shell, /* i18n: data */ translate("saved"));`,
            `yui_shell_show_info(shell, /* i18n: data */ tt("saved"));`,
            `yui_shell_show_info(shell, /* i18n: data */ t?.("saved"));`,
            `yui_shell_show_info(shell, /* i18n: data */ t.call(null, "saved"));`,
            `yui_shell_show_info(shell, tr("saved"));`
        ];
        expect(rule(lines)).toEqual([
            [5, `tr("saved")`], [6, `translate("saved")`], [7, `tt("saved")`], [8, `t?.("saved")`],
            [9, `t.call(null, "saved")`], [10, `tr("saved")`]
        ].map(([n, text]) => `${module}:${n} yui_shell_show_info() [1]: ${text} -- a TRANSLATED text where a key goes: hand the key`));
    });

    test("a key function is read however it is called: an alias, a map, .call(), .apply()", () => {
        let r = scan([`const show = yui_shell_show_info;`,
                      `const API = {info: yui_shell_show_info};`,
                      `show(shell, "an alias key");`,
                      `API.info(shell, "a map key");`,
                      `yui_shell_show_info.call(null, shell, "a call key");`,
                      `yui_shell_show_info.apply(null, [shell, "an apply key"]);`]);
        for(let k of ["an alias key", "a map key", "a call key", "an apply key"]) {
            expect(r.keys.has(k), k).toBe(true);
        }
        expect(rule([`const show = yui_shell_show_info;`, `let k = "a let key";`, `show(shell, k);`]))
            .toEqual([`${module}:5 yui_shell_show_info() [1]: k`]);
    });

    test("REV-CLOUD V22.5: no published list of the library is a let, and none is mutated", () => {
        let wrong = [];
        for(let module of MODULES) {
            let ast = ast_of(module);
            for(let e of list_mutations(ast, published_lists(ast).lists)) {
                wrong.push(`${module}:${e.line}: ${e.why}`);
            }
        }
        expect(wrong).toEqual([]);
        let r = published_lists(parse_source(`export let A_I18N_KEYS = ["a"];`));
        expect(r.errors).toEqual(["A_I18N_KEYS: declared with let, which can be given other keys no reader sees: " +
                                  "a published list is an `export const` array of literals"]);
        expect(list_mutations(parse_source(`export const B_I18N_KEYS = ["b"];\nB_I18N_KEYS.push("c");`),
                              [{name: "B_I18N_KEYS", keys: ["b"]}]).map((e) => e.line)).toEqual([2]);
    });
});
