/***********************************************************************
 *          form_json_field.test.js
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {describe, it, expect} from "vitest";
import {parse_json_field, json_field_shape, json_editor_value} from "./form_json_field.js";

describe("parse_json_field", () => {
    it("a text that does not parse is an error, never an empty dict to store", () => {
        expect(parse_json_field('{"a": 1,}', "dict")).toEqual({value: {}, error: "invalid json"});
        expect(parse_json_field(json_editor_value({text: '[1, 2'}), "list")).toEqual({value: [], error: "invalid json"});
        expect(parse_json_field('{"x": }', "template").error).toBe("invalid json");
        expect(parse_json_field('nope', "blob").error).toBe("invalid json");
    });

    it("json of the wrong shape is an error", () => {
        expect(parse_json_field('[1]', "dict").error).toBe("invalid json");
        expect(parse_json_field('{"a": 1}', "list").error).toBe("invalid json");
        expect(parse_json_field('null', "dict").error).toBe("invalid json");
        expect(parse_json_field('3', "coordinates").error).toBe("invalid json");
    });

    it("good json comes back parsed", () => {
        expect(parse_json_field('{"a": 1}', "dict")).toEqual({value: {a: 1}, error: ""});
        expect(parse_json_field(json_editor_value({json: [1, 2]}), "table")).toEqual({value: [1, 2], error: ""});
        expect(parse_json_field('[0, 1]', "coordinates")).toEqual({value: [0, 1], error: ""});
        expect(parse_json_field('"s"', "blob")).toEqual({value: "s", error: ""});
        expect(parse_json_field({text: 1}, "dict")).toEqual({value: {text: 1}, error: ""});
    });

    it("a blank editor is the empty value, not an error", () => {
        expect(parse_json_field("", "dict")).toEqual({value: {}, error: ""});
        expect(parse_json_field(json_editor_value({text: "  "}), "list")).toEqual({value: [], error: ""});
    });

    it("shapes", () => {
        expect(json_field_shape("object")).toBe("dict");
        expect(json_field_shape("table")).toBe("list");
        expect(json_field_shape("blob")).toBe("any");
    });

    it("a tree-mode string root is read as the string it is, as the save reads it", () => {
        expect(json_editor_value({json: "123"})).toBe('"123"');
        expect(parse_json_field(json_editor_value({json: "123"}), "blob")).toEqual({value: "123", error: ""});
        expect(parse_json_field(json_editor_value({json: "abc"}), "blob")).toEqual({value: "abc", error: ""});
    });
});
