/***********************************************************************
 *          priv_declared.test.js
 *
 *      Every function that reads `priv` must have declared it.
 *
 *      WHY THIS IS A TEST AND NOT A REVIEW HABIT: a missing
 *      `let priv = gobj.priv;` is a ReferenceError that throws only
 *      when its LINE runs, and the line that reads `priv` is usually
 *      the first line of a path nobody walks every day. One shipped in
 *      `ac_form_save_record()` (7.23.64, the "form is busy while it
 *      reads the picked files" guard) and it meant that for three
 *      releases NO record could be saved from a treedb form dialog, in
 *      any consumer — the record travelled, the action threw before
 *      writing it, and the dialog just stayed open.
 *
 *      The rule is the one every gclass of this repo already follows:
 *      the function that uses `priv` opens with `let priv = gobj.priv;`,
 *      or takes it as an argument, or is nested inside one that did.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {describe, it, expect} from "vitest";
import {readdirSync, readFileSync} from "node:fs";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

const SRC = dirname(fileURLToPath(import.meta.url));


/***************************************************************
 *  The source with its comments blanked out, line count kept.
 *
 *  A doc block that SHOWS the idiom (`priv.theme_observer = ...`)
 *  is not a use of it, and every early version of this check
 *  reported four of those before the one real bug.
 ***************************************************************/
function without_comments(src)
{
    let out = "";
    let i = 0;
    let state = "code";     /*  code | line | block | s | d | t  */

    while(i < src.length) {
        const c = src[i];
        const d = src[i + 1];

        if(state === "code") {
            if(c === "/" && d === "/") {
                state = "line";
                i += 2;
                continue;
            }
            if(c === "/" && d === "*") {
                state = "block";
                out += "  ";
                i += 2;
                continue;
            }
            if(c === "'") {
                state = "s";
            } else if(c === '"') {
                state = "d";
            } else if(c === "`") {
                state = "t";
            }
            out += c;
            i++;
            continue;
        }

        if(state === "line") {
            if(c === "\n") {
                state = "code";
                out += c;
            }
            i++;
            continue;
        }

        if(state === "block") {
            if(c === "*" && d === "/") {
                state = "code";
                out += "  ";
                i += 2;
                continue;
            }
            out += (c === "\n") ? "\n" : " ";
            i++;
            continue;
        }

        /*  Inside a string: it ends at its own quote, and a backslash
         *  escapes whatever follows.  */
        if(c === "\\") {
            out += "  ";
            i += 2;
            continue;
        }
        if((state === "s" && c === "'") || (state === "d" && c === '"')
                || (state === "t" && c === "`")) {
            state = "code";
        }
        out += c;
        i++;
    }

    return out;
}


/***************************************************************
 *  Every top-level function of a file, as {name, line, params,
 *  body}. A nested function belongs to the body of the one that
 *  holds it, which is what lets it use the parent's `priv`.
 ***************************************************************/
function top_level_functions(src)
{
    const lines = src.split("\n");
    const starts = [];
    for(let i = 0; i < lines.length; i++) {
        if(/^(?:async )?function\s+\w+/.test(lines[i])) {
            starts.push(i);
        }
    }
    starts.push(lines.length);

    const out = [];
    for(let k = 0; k < starts.length - 1; k++) {
        const a = starts[k];
        const m = /^(?:async )?function\s+(\w+)\s*\(([^)]*)/.exec(lines[a]);
        if(!m) {
            continue;
        }
        out.push({
            name:   m[1],
            line:   a + 1,
            params: m[2],
            body:   lines.slice(a, starts[k + 1]).join("\n"),
        });
    }
    return out;
}


describe("every function that reads `priv` declares it", () => {

    it("no bare `priv.` without `priv =` in the same function", () => {
        const files = readdirSync(SRC)
            .filter((f) => f.endsWith(".js") && !f.endsWith(".test.js"));
        expect(files.length).toBeGreaterThan(10);

        const offenders = [];
        for(const f of files) {
            const src = without_comments(readFileSync(join(SRC, f), "utf8"));
            for(const fn of top_level_functions(src)) {
                if(/(?<![.\w])priv(?![\w])/.test(fn.params)) {
                    continue;   /*  it takes priv as an argument  */
                }
                const uses = /(?<![.\w])priv\s*\./.test(fn.body);
                const declared = /(?<![.\w])priv\s*=[^=]/.test(fn.body);
                if(uses && !declared) {
                    offenders.push(`${f}:${fn.line} ${fn.name}()`);
                }
            }
        }

        expect(offenders).toEqual([]);
    });

    it("the checker sees a missing declaration", () => {
        /*  The guard needs its own guard: a check that cannot fail is
         *  a check nobody can trust.  */
        const src = [
            "function ac_broken(gobj, event, kw, src)",
            "{",
            "    if(priv.reading_files) {",
            "        return -1;",
            "    }",
            "    return 0;",
            "}",
        ].join("\n");
        const fns = top_level_functions(without_comments(src));
        expect(fns.length).toBe(1);
        expect(/(?<![.\w])priv\s*\./.test(fns[0].body)).toBe(true);
        expect(/(?<![.\w])priv\s*=[^=]/.test(fns[0].body)).toBe(false);
    });

    it("a doc block that shows the idiom is not a use of it", () => {
        const src = [
            "/*  priv.theme_observer = yui_watch_theme(gobj);  */",
            "function yui_is_dark()",
            "{",
            "    return yui_theme_now() === 'dark';",
            "}",
        ].join("\n");
        const fns = top_level_functions(without_comments(src));
        expect(fns.length).toBe(1);
        expect(/(?<![.\w])priv\s*\./.test(fns[0].body)).toBe(false);
    });

    it("`gobj.priv.x` is not a bare `priv`", () => {
        const src = [
            "function reads_through_gobj(gobj)",
            "{",
            "    return gobj.priv.something;",
            "}",
        ].join("\n");
        const fns = top_level_functions(without_comments(src));
        expect(/(?<![.\w])priv\s*\./.test(fns[0].body)).toBe(false);
    });
});
