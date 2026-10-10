/***********************************************************************
 *          form_json_field.js
 *
 *      Pure logic of a json field of C_YUI_FORM: what a jsoneditor
 *      holds, read as the value its column stores.
 *
 *      The editor answers its content in one of two shapes -- {json}
 *      (tree mode) or {text} (text mode, whatever the reader typed).
 *      A text that does not parse used to be caught and replaced by
 *      `{}` or `[]`, and SAVED: a trailing comma wiped the column, with
 *      no log and no message. A text that is not json, or json of the
 *      wrong shape (a list in a dict column), is an error now, and the
 *      form refuses to save while a field holds one.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/

/*
 *  The shape a column type stores. A type not listed takes any json.
 */
const SHAPE_OF_TYPE = {
    object:      "dict",
    dict:        "dict",
    template:    "dict",
    array:       "list",
    list:        "list",
    table:       "list",
    coordinates: "container",
};

/************************************************************
 *  The shape `type` stores: "dict", "list", "container" or "any".
 ************************************************************/
export function json_field_shape(type)
{
    return SHAPE_OF_TYPE[type] || "any";
}

/************************************************************
 *  The empty value of a shape: what a blank editor stores.
 ************************************************************/
export function json_field_empty(shape)
{
    if(shape === "list") {
        return [];
    }
    return {};
}

function value_fits(value, shape)
{
    let is_list = Array.isArray(value);
    let is_dict = value !== null && typeof value === "object" && !is_list;
    switch(shape) {
        case "dict":
            return is_dict;
        case "list":
            return is_list;
        case "container":
            return is_dict || is_list;
        default:
            return true;
    }
}

/************************************************************
 *  Parse what a json field holds.
 *
 *  `value` is a json string (what the form reads out of an editor)
 *  or an already parsed value; an editor's content goes through
 *  json_editor_value() first.
 *  Returns {value, error}: `error` is "" when the value is good, else
 *  an i18n key; `value` is then the empty value of the shape and must
 *  NOT be stored.
 *
 *  A blank text is not an error: it is the empty value.
 ************************************************************/
export function parse_json_field(value, type)
{
    let shape = json_field_shape(type);

    if(typeof value === "string") {
        if(value.trim() === "") {
            return {value: json_field_empty(shape), error: ""};
        }
        try {
            value = JSON.parse(value);
        } catch(e) {
            return {value: json_field_empty(shape), error: "invalid json"};
        }
    }

    if(value === undefined) {
        return {value: json_field_empty(shape), error: ""};
    }
    if(!value_fits(value, shape)) {
        return {value: json_field_empty(shape), error: "invalid json"};
    }
    return {value: value, error: ""};
}

/************************************************************
 *  What a jsoneditor content ({text} or {json}) holds, as TEXT:
 *  the text as typed, or the tree-mode json serialized -- which is
 *  what get_form_values() reads out of the editor too. Handing the
 *  tree-mode value back as is made parse_json_field() parse a
 *  string ROOT a second time: "123" was checked as the number 123,
 *  and "abc" as a text that is no json.
 ************************************************************/
export function json_editor_value(content)
{
    if(!content) {
        return undefined;
    }
    if(content.text !== undefined) {
        return content.text;
    }
    if(content.json === undefined) {
        return undefined;
    }
    return JSON.stringify(content.json);
}
