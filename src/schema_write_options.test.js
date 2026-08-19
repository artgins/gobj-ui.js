/***********************************************************************
 *          schema_write_options.test.js
 *
 *      The three words that decide whether a schema write does what it
 *      says, pinned.
 *
 *      This file exists because of one afternoon: `autolink` on a
 *      partial update detached a topic from its treedb — the version
 *      was raised, the write answered success, and the topic vanished
 *      from the schema. Nothing in the answer said so.
 ***********************************************************************/
import { describe, test, expect } from "vitest";
import { write_command, write_options } from "./schema_write_options.js";


describe("which command performs which write", () => {
    test("a create goes through update-node, NOT create-node", () => {
        /*  Only the update path carries `autolink`, and without a link a
            new column belongs to no topic.  */
        expect(write_command("create")).toBe("update-node");
    });

    test("an update goes through update-node", () => {
        expect(write_command("update")).toBe("update-node");
    });

    test("a delete goes through delete-node", () => {
        expect(write_command("delete")).toBe("delete-node");
    });
});

describe("autolink goes with a create and with nothing else", () => {
    test("a create asks for it — its record carries the fkey", () => {
        const o = write_options("create");
        expect(o.autolink).toBe(true);
        expect(o.create).toBe(true);
    });

    test("an update NEVER asks for it", () => {
        /*  The editor writes only what changed, so an update carries no
            fkey — and autolink reads an absent fkey as "no parents".  */
        expect(write_options("update").autolink).toBeUndefined();
        expect(write_options("update").create).toBeUndefined();
    });

    test("a delete never asks for it either", () => {
        expect(write_options("delete").autolink).toBeUndefined();
    });
});

describe("the rest", () => {
    test("a delete forces: a column is pointed at by its own topic", () => {
        expect(write_options("delete")).toEqual({force: true});
    });

    test("reads come back as dicts, so a write answers in the same shape", () => {
        expect(write_options("create").list_dict).toBe(true);
        expect(write_options("update").list_dict).toBe(true);
    });

    test("an unknown op is treated as an update — the safe one", () => {
        expect(write_options("")).toEqual({list_dict: true});
        expect(write_options(undefined).autolink).toBeUndefined();
    });
});
