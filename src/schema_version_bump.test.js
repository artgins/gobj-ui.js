/***********************************************************************
 *          schema_version_bump.test.js
 *
 *      "This topic was written and its version did not move."
 *
 *      THE RULE MEASURES AGAINST A BASELINE, AND THE BASELINE MUST NOT
 *      MOVE WITH IT.  It used to be re-taken inside build_model(), which
 *      runs again on the patch after EVERY write -- so it came back as
 *      the version the write had just raised, the rule read TRUE for a
 *      topic whose version HAD moved, and the banner that says so
 *      offered a Raise button that wrote another version and was
 *      measured against itself again.
 *
 *      The banner could not be dismissed.  One operator pressed it
 *      thirty-three times on a single column delete, and that is why
 *      schema versions climbed by tens with the schema unchanged.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {describe, it, expect} from "vitest";
import {needs_version_bump} from "./c_yui_schema_editor.js";

const TOPIC = {id: "device_groups", topic_version: 5};

describe("needs_version_bump", () => {
    it("says nothing about a topic this session never wrote", () => {
        expect(needs_version_bump({}, {device_groups: 5}, TOPIC)).toBe(false);
    });

    it("asks for the bump when the version sits where it was found", () => {
        expect(needs_version_bump({device_groups: true}, {device_groups: 5}, TOPIC))
            .toBe(true);
    });

    it("STOPS asking once the version has moved past the baseline", () => {
        /*  The case the loop got wrong: the write raised it to 6 and the
         *  baseline still says 5, so there is nothing left to raise.  */
        expect(needs_version_bump(
            {device_groups: true}, {device_groups: 5}, {id: "device_groups", topic_version: 6}
        )).toBe(false);
    });

    it("compares as text, so 5 and '5' are the same version", () => {
        expect(needs_version_bump(
            {device_groups: true}, {device_groups: "5"}, TOPIC
        )).toBe(true);
        expect(needs_version_bump(
            {device_groups: true}, {device_groups: 5}, {id: "device_groups", topic_version: "5"}
        )).toBe(true);
    });

    it("answers false rather than throwing on a missing half", () => {
        expect(needs_version_bump(null, {device_groups: 5}, TOPIC)).toBe(false);
        expect(needs_version_bump({device_groups: true}, null, TOPIC)).toBe(false);
        expect(needs_version_bump({device_groups: true}, {device_groups: 5}, null)).toBe(false);
    });

    it("a topic with no baseline entry is not owed a bump", () => {
        expect(needs_version_bump({device_groups: true}, {}, TOPIC)).toBe(false);
    });
});

describe("the loop it came from", () => {
    /*
     *  What the editor does per bump: raise the version by one. With the
     *  baseline left alone, ONE press settles it; with the baseline
     *  re-taken each time -- the old bug -- it never settles.
     */
    function press_raise(state) {
        return {written: state.written, baseline: state.baseline,
                topic: {id: "t", topic_version: Number(state.topic.topic_version) + 1}};
    }

    it("settles after a single press", () => {
        let st = {written: {t: true}, baseline: {t: 5}, topic: {id: "t", topic_version: 5}};
        expect(needs_version_bump(st.written, st.baseline, st.topic)).toBe(true);
        st = press_raise(st);
        expect(needs_version_bump(st.written, st.baseline, st.topic)).toBe(false);
    });

    it("never settles if the baseline is re-taken with the version", () => {
        let st = {written: {t: true}, baseline: {t: 5}, topic: {id: "t", topic_version: 5}};
        let presses = 0;
        while(needs_version_bump(st.written, st.baseline, st.topic) && presses < 40) {
            st = press_raise(st);
            st.baseline = {t: st.topic.topic_version};   /*  the bug  */
            presses++;
        }
        expect(presses).toBe(40);       /*  it ran to the guard: no way out  */
    });
});
