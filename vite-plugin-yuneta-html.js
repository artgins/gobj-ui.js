/***********************************************************************
 *          vite-plugin-yuneta-html.js
 *
 *          Vite plugin for Yuneta GUI projects.
 *          Reads config.json and injects:
 *            - <title> from config.title
 *            - <meta> tags from config.metadata
 *            - Content-Security-Policy from config.csp_connect_src
 *              (always emitted: connect-src 'self' alone when the
 *              list is missing, with a warning; an entry that is
 *              not one CSP source -- a `;`, `,` or space -- is refused)
 *            - at build time only, the build stamp read by
 *              C_YUI_UPDATE_WATCH (src/yui_build_stamp.js):
 *                <meta name="yuneta-build" content="<stamp>" data-version="<version>">
 *              <stamp> is a hash of the names of every file of the
 *              bundle -- names that carry the hash of their content --
 *              so the same code built twice has the same stamp;
 *              <version> is the app's package.json version
 *
 *          The title, the metadata and the policy are written before
 *          Vite's own transforms ("pre"); the stamp needs the finished
 *          bundle, so it is written into the emitted index.html in
 *          generateBundle, after every other plugin ("post").
 *
 *          Usage in vite.config.js:
 *            import { yunetaHtmlPlugin } from "@yuneta/gobj-ui/vite-plugin-yuneta-html.js";
 *            plugins: [ yunetaHtmlPlugin({ defaultTitle: "My App" }) ]
 *
 *          Copyright (c) 2025-2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import fs from "fs";
import path from "path";
import {createHash} from "crypto";

/*  config.json is build input, but its text lands inside markup.  */
function escape_html(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

/**
 *  @param {object} [options]
 *  @param {string} [options.defaultTitle]  - Fallback title if config.json is missing
 *  @param {string} [options.configPath]    - Path to config.json (default: ./config.json)
 */
export function yunetaHtmlPlugin(options = {}) {
    const defaultTitle = options.defaultTitle || "Yuneta GUI";

    return {
        name: "yuneta-html-transform",
        transformIndexHtml: {
            order: "pre",
            handler(html) {
                const configPath = options.configPath ||
                    path.resolve(process.cwd(), "config.json");

                /*  Without a config.json the page still gets its policy
                 *  (connect-src 'self' only): it used to get none at all.  */
                let config = {};
                if (!fs.existsSync(configPath)) {
                    console.error("⚠️ config.json not found at", configPath);
                } else {
                    config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
                }

                /*------------------------------------------*
                 *  Title
                 *------------------------------------------*/
                const title = config.title || defaultTitle;

                /*------------------------------------------*
                 *  Metadata
                 *------------------------------------------*/
                let metadataHtml = "";
                if (config.metadata) {
                    for (const [key, value] of Object.entries(config.metadata)) {
                        if (value) {
                            metadataHtml += `  <meta name="${escape_html(key)}" content="${escape_html(value)}">\n`;
                        }
                    }
                }

                /*------------------------------------------*
                 *  Content-Security-Policy
                 *
                 *  Build the CSP <meta> tag from config.
                 *  csp_connect_src is an array of origins.
                 *  Entries starting with "_comment" are
                 *  ignored (documentation hints).
                 *
                 *  ⚠ The emitted policy pins `script-src 'self'` —
                 *  *no* inline <script>, no eval, no `data:` script
                 *  imports, no Function() constructor.  Consumers
                 *  that need to run JS before the bundle (anti-FOUC,
                 *  theme bootstrap, feature detection) must put the
                 *  script in `gui/public/<name>.js` and reference it
                 *  with `<script src="/<name>.js">`.  Same-origin URL
                 *  satisfies 'self'; an inline block does not.
                 *
                 *  See `wattyzer/gui/public/anti-fouc.js` for the
                 *  canonical pre-paint pattern (theme bootstrap from
                 *  localStorage + matchMedia fallback).
                 *
                 *  Style is more permissive ('unsafe-inline'): Bulma
                 *  / view templates need it for inline `style=` and
                 *  injected style blocks.  Don't loosen the script
                 *  side without a strong reason.
                 *------------------------------------------*/
                /*  A config with no csp_connect_src used to get NO policy
                 *  at all, silently. It gets the same policy with
                 *  connect-src 'self' only, and a warning.  */
                let cspHtml = "";
                {
                    let origins = [];
                    if (Array.isArray(config.csp_connect_src)) {
                        /*  Escaped: an origin lands inside the content="..."
                         *  attribute, where a quote would end it.  */
                        origins = config.csp_connect_src
                            .filter(s => typeof s === "string" && !s.startsWith("_comment"))
                            .filter(s => {
                                /*  One SOURCE of the CSP grammar: a `;` would
                                 *  open a new directive (`wss://a; base-uri *`),
                                 *  and a `,` or a space would add sources the
                                 *  entry does not name.  */
                                if (/[;,\s]/.test(s)) {
                                    console.error(
                                        `❌ csp_connect_src entry refused, not a single source: ${JSON.stringify(s)}`
                                    );
                                    return false;
                                }
                                return true;
                            })
                            .map(escape_html);
                    } else {
                        console.warn(
                            "⚠️ config.json has no csp_connect_src array: " +
                            "the Content-Security-Policy allows connect-src 'self' only"
                        );
                    }

                    const connectSrc = ["'self'", ...origins].join("\n            ");

                    cspHtml = `<meta http-equiv="Content-Security-Policy"
        content="default-src 'self';
          script-src 'self';
          style-src 'self' 'unsafe-inline';
          connect-src ${connectSrc};
          worker-src 'self' blob:;
          child-src 'self' blob:;
          img-src 'self' data: blob:;
          media-src 'self' data: blob:;
          font-src 'self' data:;">`;
                /*  media-src: a treedb `file` column shows video and audio
                 *  too (yui_asset.js). A picked file is previewed from a
                 *  blob: url and a stored one arrives as a data: url when
                 *  no web server signs one. Without the directive both fell
                 *  back to default-src 'self' and the browser refused them,
                 *  while the same bytes as an image or a PDF showed.  */
                }

                /*------------------------------------------*
                 *  Apply replacements
                 *------------------------------------------*/
                return html
                    .replace("<title></title>", `<title>${escape_html(title)}</title>`)
                    .replace("<!-- METADATA_PLACEHOLDER -->", metadataHtml)
                    .replace("<!-- CSP_PLACEHOLDER -->", cspHtml);
            }
        },

        /*------------------------------------------*
         *  Build stamp (see the header)
         *
         *  The names of the bundle's files are known
         *  only once it is complete. A source map is
         *  left out: with `sourcemap: "hidden"` its
         *  name only repeats its chunk's.
         *------------------------------------------*/
        generateBundle: {
            order: "post",
            handler(output_options, bundle) {
                const names = Object.keys(bundle)
                    .filter(name => !name.endsWith(".map") && !name.endsWith(".html"))
                    .sort();
                const pages = Object.keys(bundle).filter(name => name.endsWith(".html"));
                if (names.length === 0 || pages.length === 0) {
                    console.error("❌ yuneta-build-stamp: no bundle or no page, no build stamp written");
                    return;
                }
                const stamp = createHash("sha256")
                    .update(names.join("\n"))
                    .digest("hex")
                    .slice(0, 16);

                let version = "";
                const pkgPath = path.resolve(process.cwd(), "package.json");
                if (fs.existsSync(pkgPath)) {
                    version = JSON.parse(fs.readFileSync(pkgPath, "utf-8")).version || "";
                }
                const meta = `<meta name="yuneta-build" content="${stamp}" ` +
                    `data-version="${escape_html(version)}">`;

                for (const name of pages) {
                    const page = bundle[name];
                    const html = String(page.source);
                    if (!html.includes("</head>")) {
                        console.error(`❌ yuneta-build-stamp: ${name} has no </head>, no build stamp written`);
                        continue;
                    }
                    page.source = html.replace("</head>", `  ${meta}\n  </head>`);
                }
            }
        }
    };
}

