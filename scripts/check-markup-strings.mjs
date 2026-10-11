#!/usr/bin/env node
/***********************************************************************
 *          check-markup-strings.mjs
 *
 *      createElement2() reads a plain string that starts with '<' as
 *      html (gobj-js), so whether a string RUNS depends on its content,
 *      not on who wrote it. The way out is to say markup out loud --
 *      html_markup('<i class="yi-copy"></i>') -- and, once every
 *      deliberate markup does, to turn on set_strings_are_text(true),
 *      where a plain string is always text.
 *
 *      This check finds, in the CONTENT of a createElement2()
 *      description (`[tag, attrs, content]`) and in its list of
 *      children:
 *
 *        literal    a string literal that starts with '<': deliberate
 *                   markup, to be wrapped in html_markup().
 *        built      a template with ${...} or a '+' concatenation that
 *                   starts with '<': markup BUILT WITH VALUES. If a value
 *                   is data, that is the hole; build the element with
 *                   createElement2() and pass the value as text.
 *        in-list    a string that starts with '<' inside a LIST of
 *                   children: since gobj-js 7.26.2 a string there is
 *                   text, so it renders as the literal tags.
 *        list-head  a list of children whose FIRST item is a string that
 *                   starts with '<': createElement2() reads such a list as
 *                   one description, so the string would be its tag.
 *
 *      A ternary or a `||`/`&&` in the content is checked branch by
 *      branch; `'<b>'.concat(x)` counts as built; a computed tag is
 *      taken when the attrs slot is an object literal.
 *
 *      What it cannot see: a VARIABLE or a function result holding a
 *      string (its type is not known before running); a description
 *      built piece by piece (push() into an array that is later the
 *      content); a computed tag with an attrs slot that is not an object
 *      literal; markup given to innerHTML, or to a widget (Tabulator,
 *      G6), which are other sinks. set_strings_are_text(true) logs, once
 *      at run time, every string that reaches createElement2() starting
 *      with '<': that is the other half of the check.
 *
 *      Usage (from the package root):
 *          node scripts/check-markup-strings.mjs [dir|file ...]   # default: src
 *      Exit 1 when anything is found.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {readFileSync, readdirSync, statSync, realpathSync} from "node:fs";
import {join, relative} from "node:path";
import {fileURLToPath} from "node:url";
import {parse} from "acorn";

const TAG_RE = /^[a-z][a-z0-9-]*$/;
const SKIP_DIRS = new Set(["node_modules", "dist", ".git", "build", "_build"]);

function list_files(path, out)
{
    let st = statSync(path);
    if(st.isDirectory()) {
        for(const name of readdirSync(path)) {
            if(SKIP_DIRS.has(name)) {
                continue;
            }
            list_files(join(path, name), out);
        }
    } else if(/\.(js|mjs)$/.test(path) && !/\.test\.(js|mjs)$/.test(path)) {
        out.push(path);
    }
    return out;
}

function is_string_literal(n)
{
    return n && n.type === "Literal" && typeof n.value === "string";
}

function static_string(n)
{
    if(is_string_literal(n)) {
        return n.value;
    }
    if(n && n.type === "TemplateLiteral" && n.expressions.length === 0) {
        return n.quasis[0].value.cooked;
    }
    return null;
}

function starts_with_markup(s)
{
    return typeof s === "string" && s.trim().startsWith("<");
}

/*  The leftmost string of a '+' chain, the head of a template, or the
 *  receiver of a '.concat()'.  */
function built_markup(n)
{
    if(!n) {
        return false;
    }
    if(n.type === "CallExpression" && n.callee.type === "MemberExpression" &&
            !n.callee.computed && n.callee.property.name === "concat") {
        let head = n.callee.object;
        let s = static_string(head);
        if(s !== null) {
            return starts_with_markup(s);
        }
        return built_markup(head);
    }
    if(n.type === "TemplateLiteral" && n.expressions.length > 0) {
        return starts_with_markup(n.quasis[0].value.cooked);
    }
    if(n.type === "BinaryExpression" && n.operator === "+") {
        let left = n;
        while(left.type === "BinaryExpression" && left.operator === "+") {
            left = left.left;
        }
        let s = static_string(left);
        if(s !== null) {
            return starts_with_markup(s);
        }
        return left.type === "TemplateLiteral" && starts_with_markup(left.quasis[0].value.cooked);
    }
    return false;
}

/*  [tag, attrs, content, events?]: a tag and an attrs slot. A literal
 *  tag must look like one; a computed tag (a variable, a ternary) is
 *  taken when the attrs slot is an object literal, which is what makes
 *  the array a description and not some other triple.  */
function is_description(n)
{
    if(!n || n.type !== "ArrayExpression" || n.elements.length < 3 || n.elements.length > 4) {
        return false;
    }
    let tag = n.elements[0];
    let attrs = n.elements[1];
    if(!tag || !attrs) {
        return false;
    }
    if(is_string_literal(tag)) {
        if(!TAG_RE.test(tag.value)) {
            return false;
        }
        return attrs.type === "ObjectExpression" || attrs.type === "Identifier" ||
            attrs.type === "MemberExpression" || attrs.type === "CallExpression" ||
            attrs.type === "ConditionalExpression" ||
            (attrs.type === "Literal" && attrs.value === null);
    }
    if(tag.type === "SpreadElement" || tag.type === "ArrayExpression" ||
            tag.type === "ObjectExpression" || tag.type === "Literal") {
        return false;
    }
    return attrs.type === "ObjectExpression";
}

function walk(node, visit)
{
    if(!node || typeof node.type !== "string") {
        return;
    }
    visit(node);
    for(const key of Object.keys(node)) {
        if(key === "loc" || key === "start" || key === "end") {
            continue;
        }
        let v = node[key];
        if(Array.isArray(v)) {
            for(const c of v) {
                if(c && typeof c.type === "string") {
                    walk(c, visit);
                }
            }
        } else if(v && typeof v.type === "string") {
            walk(v, visit);
        }
    }
}

function check_content(n, findings, file, src, where)
{
    if(!n) {
        return;
    }
    if(n.type === "ConditionalExpression") {
        check_content(n.consequent, findings, file, src, where);
        check_content(n.alternate, findings, file, src, where);
        return;
    }
    if(n.type === "LogicalExpression") {
        check_content(n.left, findings, file, src, where);
        check_content(n.right, findings, file, src, where);
        return;
    }
    let s = static_string(n);
    if(s !== null && starts_with_markup(s)) {
        findings.push({file, line: n.loc.start.line, rule: where === "list" ? "in-list" : "literal",
            text: src.slice(n.start, Math.min(n.end, n.start + 90))});
        return;
    }
    if(built_markup(n)) {
        findings.push({file, line: n.loc.start.line, rule: "built",
            text: src.slice(n.start, Math.min(n.end, n.start + 90))});
    }
}

function check_file(file, root)
{
    const src = readFileSync(file, "utf8");
    let ast;
    try {
        ast = parse(src, {ecmaVersion: "latest", sourceType: "module", locations: true,
            allowHashBang: true, allowAwaitOutsideFunction: true});
    } catch(e) {
        console.error(`${relative(root, file)}: cannot parse: ${e.message}`);
        return [{file, line: 0, rule: "parse", text: e.message}];
    }
    const findings = [];
    const rel = relative(root, file);
    walk(ast, (n) => {
        if(!is_description(n)) {
            return;
        }
        let content = n.elements[2];
        if(content && content.type === "ArrayExpression" && content.elements.length > 0) {
            let head = static_string(content.elements[0]);
            if(head !== null && starts_with_markup(head)) {
                /*  createElement2() reads a list that starts with a string
                 *  as ONE description: '<b>' would be its tag.  */
                findings.push({file: rel, line: content.loc.start.line, rule: "list-head",
                    text: src.slice(content.start, Math.min(content.end, content.start + 90))});
            } else if(head === null) {
                for(const child of content.elements) {
                    check_content(child, findings, rel, src, "list");
                }
            }
        } else {
            check_content(content, findings, rel, src, "slot");
        }
    });
    return findings;
}

export {check_file};

/*  Run as a command (not imported by a test). Both sides through
 *  realpath: argv[1] keeps a symlinked path, import.meta.url does not.  */
if(process.argv[1] &&
        realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])) {
    main();
}

function main()
{
    const root = process.cwd();
    const targets = process.argv.slice(2).length ? process.argv.slice(2) : ["src"];
    let files = [];
    for(const t of targets) {
        list_files(join(root, t), files);
    }

    let all = [];
    for(const f of files) {
        all = all.concat(check_file(f, root));
    }

    const by_rule = {};
    for(const f of all) {
        by_rule[f.rule] = (by_rule[f.rule] || 0) + 1;
        console.log(`${f.file}:${f.line}: ${f.rule}: ${f.text.replace(/\s+/g, " ")}`);
    }
    if(all.length) {
        console.log(`\ncheck-markup-strings: ${all.length} found ` +
            `(${Object.entries(by_rule).map(([k, v]) => `${k} ${v}`).join(", ")}) in ${files.length} files`);
        process.exit(1);
    }
    console.log(`check-markup-strings: OK (${files.length} files)`);
}
