/***********************************************************************
 *          yui_build_stamp.test.js
 *
 *      The build stamp read back: from the DOM of the page that runs,
 *      from the text of the page the server hands out, and NOT from a
 *      page that carries none (an error page, a captive portal).
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {describe, test, expect} from "vitest";
import {running_build, parse_build, build_page_url} from "./yui_build_stamp.js";

describe("yui_build_stamp", () => {
    test("parse_build reads the stamp and the version", () => {
        const html = '<head><meta charset="utf-8">\n' +
            '<meta name="yuneta-build" content="0123456789abcdef" data-version="2.0.41">\n</head>';
        expect(parse_build(html)).toEqual({stamp: "0123456789abcdef", version: "2.0.41"});
    });

    test("parse_build takes single quotes and any attribute order", () => {
        const html = "<meta data-version='1.0.0' content='abc' name='yuneta-build'>";
        expect(parse_build(html)).toEqual({stamp: "abc", version: "1.0.0"});
    });

    test("a page with no stamp is no build, not another build", () => {
        expect(parse_build("<html><head><title>Hotel wifi</title></head></html>")).toBe(null);
        expect(parse_build('<meta name="yuneta-build" content="">')).toBe(null);
        expect(parse_build("")).toBe(null);
        expect(parse_build(null)).toBe(null);
    });

    test("another meta is not mistaken for the stamp", () => {
        const html = '<meta name="description" content="x"><meta name="yuneta-build" content="s1" data-version="v">';
        expect(parse_build(html)).toEqual({stamp: "s1", version: "v"});
    });

    test("running_build reads the meta of a document", () => {
        const attrs = {content: "s2", "data-version": "3.1.4"};
        const doc = {
            querySelector: (sel) => sel === 'meta[name="yuneta-build"]'
                ? {getAttribute: (k) => attrs[k] || null}
                : null
        };
        expect(running_build(doc)).toEqual({stamp: "s2", version: "3.1.4"});
        expect(running_build({querySelector: () => null})).toBe(null);
        expect(running_build(null)).toBe(null);
    });

    test("build_page_url is the page without its hash", () => {
        expect(build_page_url({origin: "https://a.b", pathname: "/", search: "", hash: "#/x/y"}))
            .toBe("https://a.b/");
        expect(build_page_url({origin: "https://a.b", pathname: "/sub/", search: "?q=1"}))
            .toBe("https://a.b/sub/?q=1");
    });
});
