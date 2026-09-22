/***********************************************************************
 *          schema_version_bump.test.js
 *
 *      "This topic was written in this session and is not saved."
 *
 *      An edit is a DRAFT (M36 of yunetas' 2026-09-21 review): it moves
 *      no version, and the host's save-schema raises the versions of what
 *      changed. So "written" alone is the whole question -- the version is
 *      no longer measured against a baseline, which is also why the old
 *      "Raise" button and the loop it fed are gone.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {describe, it, expect} from "vitest";
import {topic_is_draft} from "./c_yui_schema_editor.js";

const TOPIC = {id: "device_groups", topic_version: 5};

describe("topic_is_draft", () => {
    it("says nothing about a topic this session never wrote", () => {
        expect(topic_is_draft({written: {}, host_ids: {}}, TOPIC)).toBe(false);
    });

    it("a written topic is a draft, whatever its version says", () => {
        expect(topic_is_draft({written: {device_groups: true}}, TOPIC)).toBe(true);
        expect(topic_is_draft({written: {device_groups: true}},
            {id: "device_groups", topic_version: 6})).toBe(true);
    });

    it("a topic the host names is a draft too (EV_DRAFTS)", () => {
        expect(topic_is_draft({written: {}, host_ids: {device_groups: true}}, TOPIC)).toBe(true);
    });

    it("answers false rather than throwing on a missing half", () => {
        expect(topic_is_draft(null, TOPIC)).toBe(false);
        expect(topic_is_draft({written: {device_groups: true}}, null)).toBe(false);
        expect(topic_is_draft({}, TOPIC)).toBe(false);
    });
});
