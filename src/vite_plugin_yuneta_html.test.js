/***********************************************************************
 *          vite_plugin_yuneta_html.test.js
 *
 *      The html transform of vite-plugin-yuneta-html.js: the policy is
 *      ALWAYS emitted (connect-src 'self' alone without csp_connect_src,
 *      and without a config.json at all), and the text of config.json is
 *      escaped where it lands in markup.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import {describe, test, expect, vi} from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import {yunetaHtmlPlugin} from "../vite-plugin-yuneta-html.js";

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
            csp_connect_src: ["wss://host:1620", "_comment: why", "https://tiles.example"]
        });
        expect(connect_src(html)).toEqual(["'self'", "wss://host:1620", "https://tiles.example"]);
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

    test("what config.json says is escaped where it lands in markup", () => {
        const html = transform({
            title: "</title><script>x()</script>",
            metadata: {description: '"><b>'},
            csp_connect_src: ['wss://a" onload="x']
        });
        expect(html).not.toContain("<script>");
        expect(html).toContain("&lt;/title&gt;&lt;script&gt;");
        expect(html).not.toContain('content=""><b>"');
        expect(html).not.toContain('wss://a" onload');
    });
});
