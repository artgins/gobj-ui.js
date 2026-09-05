/***********************************************************************
 *          yui_file_field.test.js
 *
 *      The pure half of the `file` column control: the manifest that
 *      carries the bytes BESIDE the record, the base64 that must survive
 *      a file worth picking, and the hash that is allowed to be absent.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import { test, expect } from "vitest";
import {
    yui_file_size_label,
    yui_array_buffer_to_base64,
    yui_files_manifest,
    yui_file_id_label
} from "./yui_file_field.js";


/***************************************************************
 *  The manifest
 ***************************************************************/
test("the bytes go BESIDE the record, and the column takes the id", () => {
    const picks = {
        foto: {
            content64: "AAA=",
            content_type: "image/png",
            original_name: "dev-1.png",
            size: 2,
            id: "a".repeat(64)
        }
    };
    const {record, __files__} = yui_files_manifest(picks, {id: "dev-1", name: "one"});

    expect(record.foto).toBe("a".repeat(64));
    expect(record.content64).toBeUndefined();
    expect(record.__files__).toBeUndefined();
    expect(__files__.foto.content64).toBe("AAA=");
    expect(__files__.foto.original_name).toBe("dev-1.png");
    /*  size is treedb's to measure, never the client's to declare  */
    expect(__files__.foto.size).toBeUndefined();
    expect(record.id).toBe("dev-1");
});

test("no hash: the column goes empty and treedb fills the id", () => {
    const picks = {foto: {content64: "AAA=", content_type: "", original_name: "x", size: 2, id: ""}};
    const {record, __files__} = yui_files_manifest(picks, {id: "dev-1"});
    expect(record.foto).toBe("");
    expect(__files__.foto.content64).toBe("AAA=");
});

test("two columns in one record make two entries", () => {
    const picks = {
        foto: {content64: "AA==", content_type: "image/png", original_name: "a", size: 1, id: "1"},
        qr:   {content64: "BB==", content_type: "image/jpeg", original_name: "b", size: 1, id: "2"}
    };
    const {record, __files__} = yui_files_manifest(picks, {id: "dev-2"});
    expect(Object.keys(__files__).sort()).toEqual(["foto", "qr"]);
    expect(record.foto).toBe("1");
    expect(record.qr).toBe("2");
});

test("nothing picked leaves the record alone and the manifest empty", () => {
    const {record, __files__} = yui_files_manifest({}, {id: "dev-1", foto: "kept"});
    expect(record.foto).toBe("kept");
    expect(Object.keys(__files__)).toHaveLength(0);
});

test("a null pick is not an entry", () => {
    const {__files__} = yui_files_manifest({foto: null}, {id: "dev-1"});
    expect(Object.keys(__files__)).toHaveLength(0);
});


/***************************************************************
 *  base64
 ***************************************************************/
test("base64 survives a buffer that would blow the call stack spread", () => {
    /*
     *  String.fromCharCode(...bytes) is a RangeError well under this, and
     *  a few hundred KB is every file a picker is for.
     */
    const buffer = new Uint8Array(300 * 1024);
    for(let i = 0; i < buffer.length; i++) {
        buffer[i] = i % 256;
    }
    const b64 = yui_array_buffer_to_base64(buffer.buffer);
    expect(b64.length).toBe(Math.ceil(buffer.length / 3) * 4);
    /*  and it round-trips  */
    const back = atob(b64);
    expect(back.length).toBe(buffer.length);
    expect(back.charCodeAt(0)).toBe(0);
    expect(back.charCodeAt(257)).toBe(1);
});

test("an empty buffer is an empty string, not a crash", () => {
    expect(yui_array_buffer_to_base64(new Uint8Array(0).buffer)).toBe("");
});


/***************************************************************
 *  Labels
 ***************************************************************/
test("a size a person reads", () => {
    expect(yui_file_size_label(0)).toBe("0 B");
    expect(yui_file_size_label(512)).toBe("512 B");
    expect(yui_file_size_label(1024)).toBe("1.0 KB");
    expect(yui_file_size_label(1536)).toBe("1.5 KB");
    expect(yui_file_size_label(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(yui_file_size_label(-1)).toBe("");
    expect(yui_file_size_label("nope")).toBe("");
});

test("a sha256 is shortened, a short id is not", () => {
    const sha = "afbcdae99c628ddb7b12813d4ffced63cb6a1c6f52dcdbcef4e641dbe96debb6";
    expect(yui_file_id_label(sha)).toBe("afbcdae9…ebb6");
    expect(yui_file_id_label("short")).toBe("short");
    expect(yui_file_id_label("")).toBe("");
});
