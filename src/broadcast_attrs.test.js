/***********************************************************************
 *          broadcast_attrs.test.js
 *
 *      A `broadcast_<x>_event` attr gates the publish of EV_<X>,
 *      and NOTHING ELSE gates it.
 *
 *      WHY THIS IS A TEST: the two attrs come in pairs that differ by
 *      one word, and the guard is a string. `ac_unselect_rows()` read
 *      "broadcast_select_rows_event" -- the SELECT one -- so a host
 *      that asked only for the unselect got nothing, and a host that
 *      asked only for the select got both. The attr was declared, the
 *      event was declared, the action was wired, and the whole path
 *      typechecks: the only thing wrong was one word inside a string,
 *      in a branch no test walks and no host turns on today.
 *
 *      The rule, stated once: every attr named `broadcast_<x>_event`
 *      is read by name, and the publish it guards is of EV_<X>.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {describe, it, expect} from "vitest";
import {readdirSync, readFileSync} from "node:fs";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

const SRC = dirname(fileURLToPath(import.meta.url));

const SOURCES = readdirSync(SRC)
    .filter((f) => f.endsWith(".js") && !f.endsWith(".test.js"))
    .map((f) => [f, readFileSync(join(SRC, f), "utf8")]);


/***************************************************************
 *  The body of the function holding `index`, by brace depth.
 ***************************************************************/
function enclosing_function(src, index)
{
    let start = src.lastIndexOf("\nfunction ", index);
    if(start < 0) {
        return "";
    }
    let open = src.indexOf("{", start);
    if(open < 0 || open > index) {
        return "";
    }
    let depth = 0;
    for(let k = open; k < src.length; k++) {
        if(src[k] === "{") {
            depth++;
        } else if(src[k] === "}") {
            depth--;
            if(depth === 0) {
                return src.slice(open, k + 1);
            }
        }
    }
    return "";
}


describe("broadcast_<x>_event attrs", function() {
    it("every one of them is read by its own name", function() {
        let unread = [];
        for(const [file, src] of SOURCES) {
            const attrs = [...src.matchAll(
                /^SDATA\(\s*data_type_t\.DTP_BOOLEAN\s*,\s*"(broadcast_[a-z0-9_]+_event)"/gmi
            )].map((m) => m[1]);
            for(const attr of new Set(attrs)) {
                if(!src.includes(`gobj_read_bool_attr(gobj, "${attr}")`)) {
                    unread.push(`${file}: ${attr}`);
                }
            }
        }
        expect(unread).toEqual([]);
    });

    it("the publish each one guards is of the event it names", function() {
        let wrong = [];
        for(const [file, src] of SOURCES) {
            const attrs = [...src.matchAll(
                /^SDATA\(\s*data_type_t\.DTP_BOOLEAN\s*,\s*"(broadcast_[a-z0-9_]+_event)"/gmi
            )].map((m) => m[1]);
            for(const attr of new Set(attrs)) {
                /*  broadcast_unselect_rows_event -> EV_UNSELECT_ROWS  */
                const event = "EV_" + attr
                    .replace(/^broadcast_/, "")
                    .replace(/_event$/, "")
                    .toUpperCase();
                const guard = `gobj_read_bool_attr(gobj, "${attr}")`;
                let at = src.indexOf(guard);
                if(at < 0) {
                    continue;   /*  the first test already reports it  */
                }
                /*  The action publishes `event`, the variable the FSM
                 *  handed it -- so what proves the pairing is the
                 *  event the FSM routes to this action.  */
                const body = enclosing_function(src, at);
                const action = src.slice(0, at).match(
                    /\nfunction (ac_[a-z0-9_]+)\s*\(/g
                );
                const name = action? action[action.length - 1].trim()
                    .replace(/^function /, "").replace(/\s*\($/, "") : "";
                const routed = new RegExp(
                    `\\["${event}"\\s*,\\s*${name}\\s*,`
                ).test(src);
                const publishes = /gobj_publish_event\(gobj, event, kw\)/.test(body);
                if(!(name && publishes && routed)) {
                    wrong.push(`${file}: ${attr} does not gate ${event}`);
                }
            }
        }
        expect(wrong).toEqual([]);
    });
});
