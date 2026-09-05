/***********************************************************************
 *          yui_file_field.js
 *
 *      The control that PICKS a file for a treedb `file` column, and the
 *      manifest that carries its bytes beside the record.
 *
 *      A column flagged ['fkey','file'] holds an fkey into the treedb's
 *      system topic `__assets__`: the bytes live on disk under the treedb,
 *      the index in memory, and the record names the asset by its sha256.
 *      So this control does NOT put a file in the record. It keeps the
 *      `File` the person picked and hands up an IDENTITY, and the bytes
 *      travel beside the record in a `__files__` manifest keyed by column.
 *
 *      Three things about that are not obvious and are the whole reason
 *      this module is separate:
 *
 *      - **The file is read at SAVE, not at pick.** An `<input type=file>`
 *        hands over a `File`, which is a REFERENCE and not the bytes.
 *        Picking shows a name and a size and reads nothing, so cancelling
 *        a form does not mean a 40 MB video was read for nothing.
 *      - **A `File` cannot travel in a kw.** A kw is plain json -- the
 *        machine trace serialises it -- and a `File` is a host object. The
 *        form KEEPS it and the host asks for it through a local method.
 *      - **Reading is a promise, so saving stops being synchronous**, and
 *        a resolved promise is an OS notification that must enter the
 *        machine as an EVENT, never as a chain of callbacks. That is the
 *        HOST's business; what lives here is the promise it awaits.
 *
 *      The pure half (manifest, size, sha256, the name of a picked file)
 *      is tested without a DOM; the DOM half builds the control.
 *
 *      Using Bulma Framework (https://bulma.io)
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/

import {
    createElement2, log_error
} from "@yuneta/gobj-js";

import "./yui_file_field.css";

/*
 *  What the treedb's default ceiling accepts, as an `accept` attribute:
 *  a hint to the file dialog, never a check. The check is treedb's, on
 *  the BYTES, at the door -- a browser filter is a convenience and a
 *  client that means to lie walks past it.
 */
const YUI_FILE_ACCEPT = [
    "image/jpeg", "image/png", "image/webp", "image/gif",
    "application/pdf",
    "video/mp4", "video/webm", "video/quicktime", "video/ogg", "video/x-matroska",
    "audio/mpeg", "audio/mp4", "audio/ogg", "audio/wav", "audio/webm", "audio/flac"
].join(",");


                /***************************
                 *      The pure half
                 ***************************/




/***************************************************************************
 *  A size a person reads. Bytes up to 1 KB, then one decimal.
 ***************************************************************************/
function yui_file_size_label(bytes)
{
    let n = Number(bytes);
    if(!isFinite(n) || n < 0) {
        return "";
    }
    if(n < 1024) {
        return `${n} B`;
    }
    const units = ["KB", "MB", "GB", "TB"];
    let i = -1;
    do {
        n = n / 1024;
        i++;
    } while(n >= 1024 && i < units.length - 1);
    return `${n.toFixed(1)} ${units[i]}`;
}

/***************************************************************************
 *  The sha256 of an ArrayBuffer, lowercase hex, or null.
 *
 *  NULL is a legal answer and not a failure: `crypto.subtle` exists only
 *  in a SECURE CONTEXT, so a dev server on plain http has none. Then the
 *  record carries no id and treedb fills it -- the write path hashes what
 *  arrives anyway, because it never trusts the client's id. What the hash
 *  buys here is an integrity check the backend can make (a wrong id with
 *  good bytes is refused), not the identity itself.
 ***************************************************************************/
async function yui_file_sha256(buffer)
{
    const subtle = (typeof crypto !== "undefined") && crypto.subtle;
    if(!subtle) {
        return null;
    }
    try {
        const digest = await subtle.digest("SHA-256", buffer);
        return Array.from(new Uint8Array(digest))
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");
    } catch (e) {
        /*
         *  Said, not swallowed: without this the record simply carries no
         *  id, which is indistinguishable from an insecure context, and
         *  the reason never reaches anybody.
         */
        log_error(`cannot hash the picked file: ${e && e.message? e.message: e}`);
        return null;
    }
}

/***************************************************************************
 *  base64 of an ArrayBuffer.
 *
 *  In chunks because `String.fromCharCode(...bytes)` spreads the whole
 *  array onto the call stack, and a few hundred KB is already a
 *  RangeError -- which for a file picker is every file that matters.
 ***************************************************************************/
function yui_array_buffer_to_base64(buffer)
{
    const bytes = new Uint8Array(buffer);
    const CHUNK = 0x8000;
    let binary = "";
    for(let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return btoa(binary);
}

/***************************************************************************
 *  Read ONE picked file into what the manifest carries.
 *
 *      -> {content64, content_type, original_name, size, id}
 *
 *  `id` is the sha256 when it could be computed, and "" when it could
 *  not. Nothing else in here is optional: treedb checks the size on the
 *  base64 before decoding it, and the type against the BYTES.
 ***************************************************************************/
async function yui_file_read(file)
{
    const buffer = await file.arrayBuffer();
    const id = await yui_file_sha256(buffer);
    return {
        content64:      yui_array_buffer_to_base64(buffer),
        content_type:   file.type || "",
        original_name:  file.name || "",
        size:           file.size,
        id:             id || ""
    };
}

/***************************************************************************
 *  The write a record with picked files becomes.
 *
 *      picks   {col: read}   what yui_file_read() answered, per column
 *      record  the record the form collected (MODIFIED: each picked
 *              column takes the id, or "" when there is none)
 *
 *      -> {record, __files__}
 *
 *  `__files__` is not a column: it is an instruction to the write path,
 *  consumed and dropped at the door. The bytes never go INSIDE the
 *  column -- a field that CARRIES the bytes and a field that KEEPS them
 *  are one word apart and 460 MB of RAM apart.
 ***************************************************************************/
function yui_files_manifest(picks, record)
{
    const out = record || {};
    const manifest = {};

    Object.keys(picks || {}).forEach((col) => {
        const read = picks[col];
        if(!read) {
            return;
        }
        manifest[col] = {
            content64:      read.content64,
            content_type:   read.content_type,
            original_name:  read.original_name
        };
        /*
         *  The column takes the id, never the bytes. Empty when the
         *  browser could not hash: treedb then fills it from what arrives.
         */
        out[col] = read.id || "";
    });

    return {record: out, __files__: manifest};
}




                /***************************
                 *      The DOM half
                 ***************************/




/***************************************************************************
 *  What the control shows for what the column HOLDS today: the asset id,
 *  shortened. A sha256 in full is 64 characters of noise in a form.
 ***************************************************************************/
function yui_file_id_label(id)
{
    if(!id) {
        return "";
    }
    return (id.length > 16)? `${id.slice(0, 8)}…${id.slice(-4)}`: id;
}

/***************************************************************************
 *  The control for a `file` column.
 *
 *      name        the column
 *      value       the asset id the record holds today ("" when none)
 *      readonly    draw it, do not let it change
 *      on_pick     (file|null) -> void. NULL is "the person cleared it".
 *
 *  Returns the `<div class="control">` content, and hangs the state the
 *  form reads off the returned element:
 *
 *      $control.yui_file        the picked File, or null
 *      $control.yui_file_value  the id the column keeps ("" = cleared)
 *
 *  The `<input type="file">` is hidden and driven by a button, because a
 *  bare file input cannot be styled and says "Sin archivos seleccionados"
 *  in the browser's own language, not the app's.
 ***************************************************************************/
function yui_file_control(gobj, {name, value, readonly, accept, on_pick})
{
    const has_asset = !!value;

    const $input = createElement2(["input", {
        type: "file",
        class: "FILE_INPUT",
        name: `${name}__file`,
        accept: accept || YUI_FILE_ACCEPT,
        hidden: ""
    }]);
    /*
     *  A read-only form must not merely LOOK read-only. Hiding the button
     *  hides the way in for a person and leaves the input enabled, so the
     *  DOM still says the field is writable -- which is what anything
     *  reading the form programmatically believes, and what a form opened
     *  by a click to READ must not say. `disabled` and not `readonly`: the
     *  spec does not list `file` among the types `readonly` applies to.
     */
    if(readonly) {
        $input.disabled = true;
    }

    const $pick = createElement2(["button", {
        type: "button",
        class: "FILE_PICK button is-small",
        "data-i18n-title": "choose a file",
        "aria-label": "choose a file"
    }, [
        ["span", {class: "FILE_PICK_ICON yi-upload"}],
        /*  The label stays: this control is alone in its row, so nothing
         *  competes for the width, and two bare icons side by side read as
         *  the same control.  */
        ["span", {class: "FILE_PICK_LABEL", i18n: "choose a file"}, "choose a file"]
    ]]);

    const $clear = createElement2(["button", {
        type: "button",
        class: "FILE_CLEAR button is-small",
        "data-i18n-title": "remove the file",
        "aria-label": "remove the file"
    }, [
        ["span", {class: "FILE_CLEAR_ICON yi-trash"}]
    ]]);

    const $name = createElement2(["span", {class: "FILE_NAME"}]);
    const $size = createElement2(["span", {class: "FILE_SIZE"}]);
    const $state = createElement2(["span", {class: "FILE_STATE"}]);

    const $control = createElement2(["div", {class: "FILE_FIELD"}, [
        $input, $pick, $name, $size, $state, $clear
    ]]);

    $control.yui_file = null;
    $control.yui_file_value = value || "";

    /*
     *  Three things it can be showing, and they are not the same thing:
     *  the asset the record already names, a file picked and not yet
     *  saved, and nothing at all.
     */
    const render = () => {
        const picked = $control.yui_file;
        const kept = $control.yui_file_value;

        $name.textContent = picked? (picked.name || ""): yui_file_id_label(kept);
        /*  The shortened id is unusable on its own -- it cannot be looked
         *  up, pasted or compared. The whole of it belongs in the tooltip,
         *  which is also where the full NAME of a long picked file goes.  */
        $name.title = picked? (picked.name || ""): (kept || "");
        $size.textContent = picked? yui_file_size_label(picked.size): "";

        $state.className = "FILE_STATE";
        $state.removeAttribute("data-i18n");
        $state.textContent = "";
        if(picked) {
            $state.classList.add("is-picked");
            $state.setAttribute("data-i18n", "not saved yet");
            $state.textContent = "not saved yet";
        } else if(!kept) {
            $state.classList.add("is-empty");
            $state.setAttribute("data-i18n", "no file");
            $state.textContent = "no file";
        }

        $clear.hidden = readonly || (!picked && !kept);
        $pick.hidden = !!readonly;
    };

    if(!readonly) {
        $pick.addEventListener("click", () => {
            $input.click();
        });
        $input.addEventListener("change", () => {
            /*
             *  Picking READS NOTHING. It takes the reference, shows the
             *  name and the size the `File` already carries, and stops.
             */
            const file = ($input.files && $input.files.length)? $input.files[0]: null;
            $control.yui_file = file;
            render();
            if(on_pick) {
                on_pick(file);
            }
        });
        $clear.addEventListener("click", () => {
            $control.yui_file = null;
            $control.yui_file_value = "";
            $input.value = "";
            render();
            if(on_pick) {
                on_pick(null);
            }
        });
    }

    /*
     *  The form writes `yui_file` / `yui_file_value` straight onto the
     *  element -- when it loads a record, when it clears the form -- and
     *  writing a property fires nothing, so it has to be able to say
     *  "now draw what you are holding".
     */
    $control.yui_file_render = render;

    render();

    return {$control, $input, has_asset};
}


export {
    YUI_FILE_ACCEPT,
    yui_file_size_label,
    yui_file_sha256,
    yui_array_buffer_to_base64,
    yui_file_read,
    yui_files_manifest,
    yui_file_id_label,
    yui_file_control
};
