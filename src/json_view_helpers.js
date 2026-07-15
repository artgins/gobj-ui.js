/***********************************************************************
 *          json_view_helpers.js
 *
 *      Pure, testable logic behind C_YUI_JSON (the lazy JSON tree
 *      viewer).  Kept out of the gclass so it can be unit-tested with
 *      no DOM: collapsed-sentinel detection, path (segments) algebra,
 *      search matching, timestamp recognition/formatting and the JSON
 *      type discriminator.
 *
 *      Path convention mirrors the C kernel (kw_collapse / kw_find_path
 *      in kwid.c): segments are joined by the backtick delimiter, arrays
 *      are indexed by their numeric position.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/

/*
 *  Path delimiter, identical to the kernel's `delimiter` in kwid.c.
 */
export const JSON_PATH_DELIMITER = "`";

/************************************************************
 *   JSON type discriminator (viewer vocabulary)
 ************************************************************/
export function json_type(value)
{
    if(value === null) {
        return "null";
    }
    if(Array.isArray(value)) {
        return "array";
    }
    switch(typeof value) {
        case "string":
            return "string";
        case "number":
            return "number";
        case "boolean":
            return "boolean";
        case "object":
            return "object";
        default:
            return "unknown";
    }
}

/************************************************************
 *   Detect a kw_collapse() sentinel.
 *
 *   The kernel replaces an over-limit dict with:
 *          { "__collapsed__": { "path": ..., "size": N } }
 *   and an over-limit array with:
 *          [ { "__collapsed__": { "path": ..., "size": N } } ]
 *
 *   Returns { size, path, is_array } or null.
 ************************************************************/
export function is_collapsed(value)
{
    if(value && typeof value === "object" && !Array.isArray(value)) {
        let keys = Object.keys(value);
        if(keys.length === 1 && keys[0] === "__collapsed__") {
            let c = value.__collapsed__ || {};
            return {size: c.size, path: c.path, is_array: false};
        }
        return null;
    }
    if(Array.isArray(value) && value.length === 1) {
        let e = value[0];
        if(e && typeof e === "object" && !Array.isArray(e) &&
                Object.keys(e).length === 1 && e.__collapsed__)
        {
            let c = e.__collapsed__ || {};
            return {size: c.size, path: c.path, is_array: true};
        }
    }
    return null;
}

/************************************************************
 *   Join / split absolute path segments (kernel convention)
 ************************************************************/
export function seg_join(segments)
{
    return segments.map(function(s) {
        return String(s);
    }).join(JSON_PATH_DELIMITER);
}

export function seg_split(path)
{
    if(path === "" || path === null || path === undefined) {
        return [];
    }
    return path.split(JSON_PATH_DELIMITER);
}

/************************************************************
 *   Walk a JSON tree by absolute segments; undefined if the
 *   path does not resolve.
 ************************************************************/
export function get_by_segments(root, segments)
{
    let v = root;
    for(let seg of segments) {
        if(v === null || v === undefined) {
            return undefined;
        }
        if(Array.isArray(v)) {
            v = v[Number(seg)];
        } else if(typeof v === "object") {
            v = v[seg];
        } else {
            return undefined;
        }
    }
    return v;
}

/************************************************************
 *   Set a value at absolute segments (mutates root).
 *
 *   segments == [] means "replace the whole root" — the caller
 *   must use the RETURNED value in that case (a primitive/array
 *   root cannot be mutated in place).
 ************************************************************/
export function set_by_segments(root, segments, new_value)
{
    if(segments.length === 0) {
        return new_value;
    }
    let parent = get_by_segments(root, segments.slice(0, -1));
    if(parent === null || parent === undefined || typeof parent !== "object") {
        return root;
    }
    let last = segments[segments.length - 1];
    if(Array.isArray(parent)) {
        parent[Number(last)] = new_value;
    } else {
        parent[last] = new_value;
    }
    return root;
}

/************************************************************
 *   Does `value` (or any loaded descendant / its own key)
 *   contain the lower-cased search term?
 *
 *   Collapsed (not-yet-loaded) subtrees can't be searched, so
 *   they never match on content — only their key can match,
 *   which the renderer checks separately.
 ************************************************************/
export function subtree_matches(value, term)
{
    if(!term) {
        return true;
    }
    if(is_collapsed(value)) {
        return false;
    }
    let type = json_type(value);
    if(type === "object") {
        for(let [k, v] of Object.entries(value)) {
            if(String(k).toLowerCase().includes(term)) {
                return true;
            }
            if(subtree_matches(v, term)) {
                return true;
            }
        }
        return false;
    }
    if(type === "array") {
        for(let v of value) {
            if(subtree_matches(v, term)) {
                return true;
            }
        }
        return false;
    }
    return String(value).toLowerCase().includes(term);
}

/************************************************************
 *   Fields whose numeric value is an epoch timestamp.
 *   Mirrors the timestampTag list wired into C_YUI_FORM's
 *   jsoneditor control, so the two viewers agree.
 ************************************************************/
export function is_time_field(field)
{
    return field === "__t__" || field === "__tm__" ||
        field === "tm" || field === "t" || field === "time" ||
        field === "from_t" || field === "to_t" ||
        field === "t_input" || field === "t_output" ||
        field === "from_tm" || field === "to_tm";
}

/************************************************************
 *   Format an epoch value as a local wall-clock string.
 *   Accepts seconds or milliseconds; returns null when the
 *   value is not a usable positive timestamp (0 == "unset").
 ************************************************************/
export function format_epoch(value)
{
    if(typeof value !== "number" || !isFinite(value) || value <= 0) {
        return null;
    }
    let ms = Math.abs(value) < 1e12 ? value * 1000 : value;
    let d = new Date(ms);
    if(isNaN(d.getTime())) {
        return null;
    }
    return d.toLocaleString();
}
