import {describe, it, expect} from "vitest";
import {cell_text, hook_cell_spec} from "./table_cell_text.js";

/*  A document double: the library has no DOM test (see yui_clipboard.test.js)  */
const doc = {
    createTextNode: (text) => ({nodeType: 3, textContent: text})
};

describe("table_cell_text", () => {

    it("record text is a text node, markup included", () => {
        /*  M31: Tabulator puts a string through innerHTML  */
        const node = cell_text("limit a<b and c>d", doc);
        expect(node.nodeType).toBe(3);
        expect(node.textContent).toBe("limit a<b and c>d");
        expect(cell_text('<img src=x onerror=alert(1)>', doc).textContent)
            .toBe('<img src=x onerror=alert(1)>');
    });

    it("numbers and booleans are shown as text too, nothing is empty", () => {
        expect(cell_text(0, doc).textContent).toBe("0");
        expect(cell_text(false, doc).textContent).toBe("false");
        expect(cell_text(null, doc)).toBe("");
        expect(cell_text(undefined, doc)).toBe("");
    });

    it("the hook cell carries the row id whole, quote included", () => {
        const spec = hook_cell_spec(
            'es"madrid', "users", 3, "ver registros enlazados", "show linked records"
        );
        expect(spec[0]).toBe("a");
        expect(spec[1]["data-row_id"]).toBe('es"madrid');
        expect(spec[1]["data-col_id"]).toBe("users");
        expect(spec[1].title).toBe("ver registros enlazados");
        expect(spec[1]["aria-label"]).toBe("ver registros enlazados");
        expect(spec[1]["data-i18n-title"]).toBe("show linked records");
        expect(spec[1]["data-i18n-aria-label"]).toBe("show linked records");
    });
});
