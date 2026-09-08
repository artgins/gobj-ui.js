import {describe, it, expect} from "vitest";
import {field_is_readonly} from "./form_field_readonly.js";

describe("field_is_readonly", () => {

    it("a form opened to LOOK has no editable field, fkey included", () => {
        /*  A record opened to be read: the schema does not enter into it. */
        expect(field_is_readonly(true, {type: "fkey", is_writable: false}))
            .toBe(true);
        expect(field_is_readonly(true, {type: "fkey", is_writable: true}))
            .toBe(true);
        expect(field_is_readonly(true, {type: "string", is_writable: true}))
            .toBe(true);
    });

    it("an fkey is EDITABLE without `writable`: a link is edited by linking", () => {
        /*  `treedb_authzs`'s `users.roles` is declared `['fkey']` and
         *  nothing else -- as almost every fkey in the tree is. Reading
         *  that as "not editable" left a user with no way to be given a
         *  role, while the save path was still sending the column. */
        expect(field_is_readonly(false, {type: "fkey", is_writable: false}))
            .toBe(false);
    });

    it("a plain column still needs `writable`", () => {
        expect(field_is_readonly(false, {type: "string", is_writable: false}))
            .toBe(true);
        expect(field_is_readonly(false, {type: "string", is_writable: true}))
            .toBe(false);
        expect(field_is_readonly(false, {type: "enum", is_writable: false}))
            .toBe(true);
    });

    it("a `file` column is NOT covered by the fkey exemption", () => {
        /*  It is an fkey (`['fkey','file']`) but answers `type: "file"`,
         *  and the SDK declares as legal a `file` column that only a load
         *  fills. */
        expect(field_is_readonly(false, {type: "file", is_writable: false, is_file: true}))
            .toBe(true);
        expect(field_is_readonly(false, {type: "file", is_writable: true, is_file: true}))
            .toBe(false);
    });

    it("no descriptor is read-only, not editable", () => {
        /*  Nothing known about a field is not a reason to let it be
         *  written. */
        expect(field_is_readonly(false, undefined)).toBe(true);
        expect(field_is_readonly(false, {})).toBe(true);
    });
});
