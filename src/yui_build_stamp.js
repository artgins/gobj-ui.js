/***********************************************************************
 *          yui_build_stamp.js
 *
 *          Which build is this page, and which build does the server
 *          hand out now.
 *
 *          The build writes its own identity into index.html as
 *
 *              <meta name="yuneta-build" content="<stamp>" data-version="<version>">
 *
 *          (vite-plugin-yuneta-html.js, at build time only). The stamp is
 *          a hash of the NAMES of every file of the bundle, and those
 *          names carry the hash of their content: the same code built
 *          twice gives the same stamp, and any change of a chunk, of a
 *          lazy chunk or of a stylesheet gives another. A build date
 *          would announce a "new version" after every rebuild of
 *          unchanged code, and the deploy round rebuilds every app after
 *          each publication of this library.
 *
 *          The page that runs reads its stamp from its own DOM, where the
 *          meta is never touched again; the deployed one is read from the
 *          text of the same document fetched again. Pure functions: the
 *          gclass that compares them is C_YUI_UPDATE_WATCH.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/

const BUILD_META_NAME = "yuneta-build";

/************************************************************
 *  The build of the page that runs: {stamp, version}, or
 *  null when its document carries no stamp (`vite dev`, or
 *  an app built without the plugin).
 ************************************************************/
function running_build(doc)
{
    if(!doc || typeof doc.querySelector !== "function") {
        return null;
    }
    let $meta = doc.querySelector(`meta[name="${BUILD_META_NAME}"]`);
    if(!$meta) {
        return null;
    }
    let stamp = $meta.getAttribute("content") || "";
    if(!stamp) {
        return null;
    }
    return {
        stamp:   stamp,
        version: $meta.getAttribute("data-version") || ""
    };
}

/************************************************************
 *  The build named by the text of an index.html: {stamp,
 *  version}, or null when the text carries no stamp -- an
 *  error page, a captive portal, or a build older than the
 *  stamp. Null is NOT "another build": a hotel wifi that
 *  answers 200 with its own login page must not tell the
 *  reader to reload into it.
 ************************************************************/
function parse_build(html)
{
    if(typeof html !== "string" || !html) {
        return null;
    }
    let metas = html.match(/<meta\b[^>]*>/gi) || [];
    for(let tag of metas) {
        if(read_html_attr(tag, "name") !== BUILD_META_NAME) {
            continue;
        }
        let stamp = read_html_attr(tag, "content");
        if(!stamp) {
            return null;
        }
        return {
            stamp:   stamp,
            version: read_html_attr(tag, "data-version")
        };
    }
    return null;
}

/************************************************************
 *  The value of one attribute of one tag's text, quoted
 *  with " or ' (the plugin writes ", a minifier may not).
 *  The entities the plugin escapes are read back.
 ************************************************************/
function read_html_attr(tag, name)
{
    let re = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i");
    let m = tag.match(re);
    if(!m) {
        return "";
    }
    let value = (m[2] !== undefined) ? m[2] : m[3];
    return value
        .replace(/&quot;/g, "\"")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&");
}

/************************************************************
 *  The url to ask for the deployed document: the page's own,
 *  without its hash. Every route of these apps is a hash, so
 *  this is the deploy root, whatever path the app is served
 *  under.
 ************************************************************/
function build_page_url(loc)
{
    if(!loc) {
        return "";
    }
    return `${loc.origin || ""}${loc.pathname || "/"}${loc.search || ""}`;
}


export {
    BUILD_META_NAME,
    running_build,
    parse_build,
    build_page_url,
};
