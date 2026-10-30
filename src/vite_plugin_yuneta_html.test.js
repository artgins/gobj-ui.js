/***********************************************************************
 *          vite_plugin_yuneta_html.test.js
 *
 *      The html transform of vite-plugin-yuneta-html.js: the policy is
 *      ALWAYS emitted (connect-src 'self' alone without csp_connect_src,
 *      and without a config.json at all), and the text of config.json is
 *      escaped where it lands in markup. And the build stamp written
 *      into the emitted index.html: the same bundle, the same stamp.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {describe, test, expect, vi} from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import {yunetaHtmlPlugin} from "../vite-plugin-yuneta-html.js";
import {parse_build} from "./yui_build_stamp.js";

const HTML = "<head><title></title>\n<!-- METADATA_PLACEHOLDER -->\n<!-- CSP_PLACEHOLDER --></head>";

function transform(config)
{
    let configPath = path.join(os.tmpdir(), `yuneta-html-${process.pid}-${Math.random()}.json`);
    if(config !== undefined) {
        fs.writeFileSync(configPath, JSON.stringify(config));
    }
    const plugin = yunetaHtmlPlugin({defaultTitle: "Fallback", configPath});
    try {
        return plugin.transformIndexHtml.handler(HTML);
    } finally {
        if(config !== undefined) {
            fs.unlinkSync(configPath);
        }
    }
}

function connect_src(html)
{
    let m = html.match(/connect-src ([^;]*);/);
    return m? m[1].split(/\s+/).filter(Boolean) : null;
}

describe("vite-plugin-yuneta-html", () => {
    test("a declared csp_connect_src goes into connect-src, comments left out", () => {
        const html = transform({
            title: "App",
            csp_connect_src: ["wss://host:7301", "_comment: why", "https://tiles.example"]
        });
        expect(connect_src(html)).toEqual(["'self'", "wss://host:7301", "https://tiles.example"]);
        expect(html).toContain("<title>App</title>");
    });

    test("no csp_connect_src: the policy is still there, connect-src 'self' only", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        const html = transform({title: "App"});
        expect(connect_src(html)).toEqual(["'self'"]);
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });

    test("no config.json: the policy is still there, with the fallback title", () => {
        const err = vi.spyOn(console, "error").mockImplementation(() => {});
        const html = transform(undefined);
        expect(connect_src(html)).toEqual(["'self'"]);
        expect(html).toContain("<title>Fallback</title>");
        err.mockRestore();
    });

    test("an entry that is not a single source is refused, the rest kept", () => {
        const err = vi.spyOn(console, "error").mockImplementation(() => {});
        const html = transform({
            title: "App",
            csp_connect_src: [
                "wss://a:1; base-uri *", "wss://b, wss://c", "wss://d wss://e",
                "wss://ok:7301"
            ]
        });
        expect(connect_src(html)).toEqual(["'self'", "wss://ok:7301"]);
        expect(html).not.toContain("base-uri");
        expect(err).toHaveBeenCalledTimes(3);
        err.mockRestore();
    });

    test("what config.json says is escaped where it lands in markup", () => {
        const html = transform({
            title: "</title><script>x()</script>",
            metadata: {description: '"><b>'},
            csp_connect_src: ['wss://a"onload="x']
        });
        expect(html).not.toContain("<script>");
        expect(html).toContain("&lt;/title&gt;&lt;script&gt;");
        expect(html).not.toContain('content=""><b>"');
        expect(html).not.toContain('wss://a"onload');
    });
});

function stamped(names)
{
    const bundle = {"index.html": {source: "<html><head><title>x</title></head><body></body></html>"}};
    for(const name of names) {
        bundle[name] = {source: ""};
    }
    yunetaHtmlPlugin({}).generateBundle.handler({}, bundle);
    return parse_build(String(bundle["index.html"].source));
}

describe("vite-plugin-yuneta-html: the build stamp", () => {
    test("the emitted page carries the stamp and the app's version", () => {
        const build = stamped(["assets/index-AAAA.js", "assets/index-BBBB.css"]);
        expect(build.stamp).toMatch(/^[0-9a-f]{16}$/);
        const pkg = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "package.json"), "utf-8"));
        expect(build.version).toBe(pkg.version);
    });

    test("the same files give the same stamp, in any order; the maps do not count", () => {
        const a = stamped(["assets/a-1.js", "assets/b-2.css"]);
        const b = stamped(["assets/b-2.css", "assets/a-1.js", "assets/a-1.js.map"]);
        expect(b.stamp).toBe(a.stamp);
    });

    test("one changed chunk gives another stamp", () => {
        const a = stamped(["assets/a-1.js", "assets/lazy-1.js"]);
        const b = stamped(["assets/a-1.js", "assets/lazy-2.js"]);
        expect(b.stamp).not.toBe(a.stamp);
    });
});
