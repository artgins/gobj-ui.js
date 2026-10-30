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
let render_name;

beforeAll(async () => {
    install_dom_double();
    ({entry_shown_lines, render_detailed, render_name} = await import("./yui_dev.js"));
});

function painted(kw)
{
    return render_detailed({
        kind: "traffic", dir: "in", event: "EV_MT_COMMAND_ANSWER",
        title: "hub_yuno", ts: "09:04:11.914", size: 1473431, kw: kw,
    });
}

describe("entry_shown_lines", () => {
    it("copies a closed branch as its one-line summary", () => {
        const $e = painted({
            result: 0,
            comment: "db_history^4620: 500 nodes",
            data: {places: [1, 2, 3], families: [4], devices: [5, 6]},
        });
        expect(entry_shown_lines($e)).toEqual([
            "    • result: 0",
            "    • comment: db_history^4620: 500 nodes",
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

describe("render_name (the line view)", () => {
    it("paints the head of the message alone, in one row", () => {
        const $e = render_name({
            kind: "traffic", dir: "in", event: "EV_YUNO_STATS", command: "",
            title: "gui_agent_yuno <== wss://cc:1996", ts: "09:19:03.421", size: 1024,
            kw: {result: 0, data: {yuno_id: "4046", kind: "cpu"}},
        });
        expect($e.classList.contains("TRAFFIC_NAME")).toBe(true);
        expect($e.querySelector(".TRAFFIC_EVENT").textContent).toBe("EV_YUNO_STATS");
        expect($e.querySelector(".TRAFFIC_KW")).toBe(null);
        expect($e.querySelector(".TRAFFIC_FULL")).toBe(null);
        expect(entry_shown_lines($e)).toEqual([]);
    });
});
