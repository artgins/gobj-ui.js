/***********************************************************************
 *          yui_dev_copy.test.js
 *
 *          What "copy" of the Developer window puts on the clipboard in
 *          the FOLDED view: the payload as it is on screen -- a closed
 *          branch as its one-line summary, an opened one with its
 *          content -- and not the whole payload laid out, which for a
 *          list-map answer was 1.4 MB of text.
 *
 *          The summary has no blanks after the commas because the screen
 *          has none: createElement2 trims every text node, the preview's
 *          ", " tokens included.  The copy is what is seen.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {describe, it, expect, beforeAll} from "vitest";
import {install_dom_double} from "../test/dom_double.js";

let entry_shown_lines;
let render_detailed;

beforeAll(async () => {
    install_dom_double();
    ({entry_shown_lines, render_detailed} = await import("./yui_dev.js"));
});

function painted(kw)
{
    return render_detailed({
        kind: "traffic", dir: "in", event: "EV_MT_COMMAND_ANSWER",
        title: "central_yuno", ts: "09:04:11.914", size: 1473431, kw: kw,
    });
}

describe("entry_shown_lines", () => {
    it("copies a closed branch as its one-line summary", () => {
        const $e = painted({
            result: 0,
            comment: "db_history_ce^1620: 524 nodos",
            data: {places: [1, 2, 3], families: [4], devices: [5, 6]},
        });
        expect(entry_shown_lines($e)).toEqual([
            "    • result: 0",
            "    • comment: db_history_ce^1620: 524 nodos",
            "    ▸ data {places:[…],families:[…],devices:[…]}",
        ]);
    });

    it("copies an OPENED branch with its content, four characters in", () => {
        const $e = painted({result: 0, data: {count: 2, rows: [7, 8]}});
        const $details = $e.querySelector("details");
        $details.open = true;
        expect(entry_shown_lines($e)).toEqual([
            "    • result: 0",
            "    ▾ data {count:2,rows:[…]}",
            "        • count: 2",
            "        ▸ rows [2]",
        ]);
    });
});
