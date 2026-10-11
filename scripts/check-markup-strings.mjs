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
import {join, relative, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {parse} from "acorn";

const TAG_RE = /^[a-z][a-z0-9-]*$/i;
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

/*  String methods that keep the head of their receiver (a markup head
 *  stays a markup head through them). Not replace()/replaceAll(): they
 *  can take the head away ('<b>x</b>'.replace(/<[^>]+>/g, '') is text),
 *  see replaced().  */
const HEAD_KEEPING_METHODS = new Set([
    "trim", "trimStart", "trimEnd", "toString", "valueOf", "normalize",
    "toLowerCase", "toUpperCase", "padEnd", "concat"
]);

/*  The ones with no argument that give a static value from a static
 *  receiver: '<b>s</b>'.toUpperCase() is a literal, not built markup.  */
const PURE_METHODS = new Set([
    "trim", "trimStart", "trimEnd", "toString", "valueOf", "normalize",
    "toLowerCase", "toUpperCase"
]);

/*  replace()/replaceAll() on a receiver that is static and with static
 *  arguments is computed, so a tag stripped away is seen as stripped.
 *  Anything else keeps the receiver's head and is no longer static: a
 *  receiver that carries data stays BUILT markup through them, and so
 *  does a static one whose replacement is data
 *  ('<b>NAME</b>'.replace('NAME', name)).  */
function replaced(method, head, args)
{
    if(head.complete && args.length === 2) {
        let pattern = null;
        if(args[0].type === "Literal" && args[0].regex) {
            try {
                pattern = new RegExp(args[0].regex.pattern, args[0].regex.flags);
            } catch(e) {
                pattern = null;
            }
        } else if(is_string_literal(args[0])) {
            pattern = args[0].value;
        }
        let replacement = leading(args[1]);
        if(pattern !== null && replacement && replacement.complete) {
            try {
                return {text: String.prototype[method].call(head.text, pattern, replacement.text),
                        complete: true};
            } catch(e) {
                /*  replaceAll() with a regex that is not global throws:
                 *  so does the code, the check need not know what it gives. */
            }
        }
    }
    return {text: head.text, complete: false};
}

function concat_parts(parts)
{
    /*  parts: [{text, complete}] in order. The leading text runs while
     *  the parts are static.  */
    let text = "";
    for(const p of parts) {
        if(p === null) {
            return {text, complete: false};
        }
        text += p.text;
        if(!p.complete) {
            return {text, complete: false};
        }
    }
    return {text, complete: true};
}

function template_parts(quasis, expressions, raw)
{
    let parts = [];
    for(let i = 0; i < quasis.length; i++) {
        let q = quasis[i].value;
        parts.push({text: raw ? q.raw : (q.cooked ?? ""), complete: true});
        if(i < expressions.length) {
            parts.push(leading(expressions[i]));
        }
    }
    return parts;
}

/*  The text an expression STARTS with, as far as it is static:
 *  {text, complete} (complete: the whole value is static), or null when
 *  it starts with something the check cannot see.  */
function leading(n)
{
    if(!n) {
        return null;
    }
    if(is_string_literal(n)) {
        return {text: n.value, complete: true};
    }
    if(n.type === "TemplateLiteral") {
        return concat_parts(template_parts(n.quasis, n.expressions, false));
    }
    if(n.type === "TaggedTemplateExpression") {
        let tag = n.tag;
        if(tag.type === "MemberExpression" && !tag.computed &&
                tag.object.type === "Identifier" && tag.object.name === "String" &&
                tag.property.name === "raw") {
            return concat_parts(template_parts(n.quasi.quasis, n.quasi.expressions, true));
        }
        return null;
    }
    if(n.type === "BinaryExpression" && n.operator === "+") {
        let operands = [];
        let flatten = (e) => {
            if(e.type === "BinaryExpression" && e.operator === "+") {
                flatten(e.left);
                flatten(e.right);
            } else {
                operands.push(e);
            }
        };
        flatten(n);
        return concat_parts(operands.map(leading));
    }
    if(n.type === "SequenceExpression") {
        return leading(n.expressions[n.expressions.length - 1]);
    }
    if(n.type === "CallExpression" && n.callee.type === "MemberExpression" &&
            !n.callee.computed) {
        let method = n.callee.property.name;
        let receiver = n.callee.object;
        if(method === "join" && receiver.type === "ArrayExpression") {
            let sep = n.arguments.length ? leading(n.arguments[0]) : {text: ",", complete: true};
            let parts = [];
            receiver.elements.forEach((el, k) => {
                if(k > 0) {
                    parts.push(sep);
                }
                parts.push(leading(el));
            });
            return concat_parts(parts);
        }
        if(method === "replace" || method === "replaceAll") {
            let head = leading(receiver);
            if(head === null) {
                return null;
            }
            return replaced(method, head, n.arguments);
        }
        if(HEAD_KEEPING_METHODS.has(method)) {
            let head = leading(receiver);
            if(head === null) {
                return null;
            }
            if(method === "concat") {
                return concat_parts([head, ...n.arguments.map(leading)]);
            }
            if(head.complete && PURE_METHODS.has(method) && n.arguments.length === 0) {
                return {text: String.prototype[method].call(head.text), complete: true};
            }
            /*  The head is kept; the whole is no longer known to be static.  */
            return {text: head.text, complete: false};
        }
        return null;
    }
    return null;
}

/*  Markup BUILT with values: its static head starts with '<' and it is
 *  not static as a whole.  */
function built_markup(n)
{
    let head = leading(n);
    return !!head && !head.complete && starts_with_markup(head.text);
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
    if(n.type === "SequenceExpression") {
        check_content(n.expressions[n.expressions.length - 1], findings, file, src, where);
        return;
    }
    let head = leading(n);
    if(head && head.complete && starts_with_markup(head.text)) {
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
            let lead = leading(content.elements[0]);
            let head = (lead && lead.complete)? lead.text : null;
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
        const path = resolve(root, t);      // an absolute path stays absolute
        try {
            statSync(path);
        } catch(e) {
            console.error(`check-markup-strings: no such file or directory: ${t}`);
            process.exit(2);
        }
        list_files(path, files);
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
