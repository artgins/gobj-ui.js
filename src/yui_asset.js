/*
 *  The bytes a treedb node owns but cannot hold -- a photo, a plan, a clip.
 *
 *  A node names its asset with an FKEY, and the BACKEND decides how the
 *  bytes travel: a signed url when a web server sits in front of the store,
 *  the bytes inline when there is none (the SDK's `C_ASSETS get-asset`).
 *  That is why a consumer has ONE code path, and why a node with no web
 *  server in front of it still shows its images instead of showing nothing.
 *
 *  WHAT THIS MODULE DOES NOT DO IS TALK TO THE BACKEND.  Asking is an
 *  ACTION and belongs in the view's own FSM; these are the two ends of it:
 *  read the id out of the fkey before asking, and turn the answer into an
 *  element afterwards.
 *
 *  Using Bulma Framework (https://bulma.io)
 */

import {
    createElement2
} from "@yuneta/gobj-js";

import "./yui_asset.css";

/*
 *  A treedb fkey is `topic^id^hook`, and a column holds either one of them
 *  (a single-valued fkey, like a device's photo) or a list (an array fkey,
 *  like the plans of a bay).  An expanded ref -- what `refs` options give
 *  back -- is an object carrying the id instead.
 */
function ref_to_id(ref)
{
    if(!ref) {
        return null;
    }
    if(typeof ref === "string") {
        const parts = ref.split("^");
        return parts.length >= 2? parts[1]: null;
    }
    if(typeof ref === "object" && typeof ref.id === "string") {
        return ref.id;
    }
    return null;
}

/***************************************************************************
 *  Every asset id a column names, in order. Always an array, possibly empty.
 ***************************************************************************/
function yui_asset_ids(ref)
{
    if(Array.isArray(ref)) {
        return ref.map(ref_to_id).filter((id) => !!id);
    }
    const id = ref_to_id(ref);
    return id? [id]: [];
}

/***************************************************************************
 *  The first asset id a column names, or null.
 ***************************************************************************/
function yui_asset_id(ref)
{
    const ids = yui_asset_ids(ref);
    return ids.length? ids[0]: null;
}

/***************************************************************************
 *  Turn a `get-asset` answer into something an element can load.
 *
 *  Returns null when the answer carries neither -- which the caller must
 *  treat as "missing", never as an empty src: an <img src=""> reloads the
 *  PAGE in some browsers.
 ***************************************************************************/
function yui_asset_src(answer)
{
    if(!answer) {
        return null;
    }
    if(answer.mode === "url" && answer.url) {
        return answer.url;
    }
    if(answer.mode === "inline" && answer.content64) {
        const ct = answer.content_type || "application/octet-stream";
        return `data:${ct};base64,${answer.content64}`;
    }
    return null;
}

/***************************************************************************
 *  The marker for an asset that is not there.
 *
 *  A missing image used to leave a broken box and no word about it, which
 *  is indistinguishable from a slow one and from a bug.  This says so, and
 *  it says WHICH: `detail` is data (a name, a path) and is never
 *  translated, while the label carries its i18n key so a language change
 *  re-translates it.
 ***************************************************************************/
function yui_asset_missing(detail, opts = {})
{
    const key = opts.key || "asset not available";
    const children = [
        ["span", {class: "ASSET_MISSING_ICON yi-triangle-exclamation"}],
        /*
         *  createElement2() translates the content itself when it is given
         *  `i18n`, so the KEY is what goes in -- passing t(key) would
         *  translate it twice and, worse, freeze it: refresh_language()
         *  only re-translates a node that carries its key.
         */
        ["span", {class: "ASSET_MISSING_LABEL", i18n: key}, key]
    ];
    if(detail) {
        children.push(["span", {class: "ASSET_MISSING_DETAIL"}, String(detail)]);
    }
    /*
     *  The tooltip is the DETAIL when there is one -- a name or a path,
     *  which is data and must never be translated -- and the label
     *  otherwise, through `data-i18n-title` so it follows the language.
     */
    const attrs = {class: `ASSET_MISSING ${opts.class || ""}`.trim()};
    if(detail) {
        attrs.title = String(detail);
    } else {
        attrs["data-i18n-title"] = key;
    }
    return createElement2(["div", attrs, children]);
}

/***************************************************************************
 *  The element for one asset.
 *
 *  The KIND comes from the content type the backend stored, not from the
 *  name a person typed: video and audio are assets too, and an <img> whose
 *  src is a film shows the broken box this module exists to remove.
 *
 *  `detail` is what the missing marker shows -- pass the original name or
 *  the source path, the thing a person can act on.
 ***************************************************************************/
function yui_asset_element(answer, opts = {})
{
    const src = yui_asset_src(answer);
    if(!src) {
        return yui_asset_missing(opts.detail, opts);
    }

    const ct = (answer.content_type || "").toLowerCase();
    const cls = `ASSET_MEDIA ${opts.class || ""}`.trim();

    let el;
    if(ct.startsWith("video/")) {
        el = createElement2(["video", {class: cls, controls: "", preload: "metadata"}]);
    } else if(ct.startsWith("audio/")) {
        el = createElement2(["audio", {class: cls, controls: "", preload: "metadata"}]);
    } else {
        el = createElement2(["img", {class: cls, loading: "lazy"}]);
        el.alt = opts.alt || opts.detail || "";
    }
    el.src = src;

    /*
     *  A url can 403 (expired signature), a blob can be gone from the
     *  store, a codec can be unsupported. Whatever the reason, the element
     *  is REPLACED by the marker: leaving the dead one in place is the
     *  silent gap this module was written to stop.
     */
    el.onerror = () => {
        const $marker = yui_asset_missing(opts.detail, opts);
        if(el.parentNode) {
            el.parentNode.replaceChild($marker, el);
        }
    };

    return el;
}

export {
    yui_asset_id,
    yui_asset_ids,
    yui_asset_src,
    yui_asset_element,
    yui_asset_missing
};
