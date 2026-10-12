/***********************************************************************
 *          i18n_key_functions.js
 *
 *          The gobj-ui functions that RECEIVE an i18n key as an
 *          argument, and where it goes. Pure data: no import, no code.
 *
 *          A key handed to a function -- `yui_shell_show_error(shell,
 *          "the connection dropped")`, `icon_button(gobj, "yi-copy",
 *          "EV_COPY_ALL", "copy json")` -- reaches t() inside the function,
 *          by a parameter, where no scan of `t("...")` can see it. Up to
 *          gobj-ui 7.26.27 such a key was invisible to validate-locales,
 *          and several shipped untranslated (REV-CLOUD V20.5.1). This table
 *          names every such function: validate-locales reads the string
 *          literals given at these positions as keys the source asks for,
 *          in the app's own source and in the gobj-ui modules it mounts.
 *
 *          An entry:
 *
 *              module      the src/ module that defines the function
 *              name        its name
 *              exported    true: an app or another module imports it, and
 *                          every call bound to that import is read;
 *                          false: a helper of its own module, read there
 *              keys        where the keys are, one string per position:
 *                            "1"            the second argument
 *                            "2.title"      property `title` of an object
 *                                           literal given as the third
 *                            "1.actions[].label"
 *                                           `label` of each object literal
 *                                           of the array `actions`
 *                          A position may also hold DOM or nothing: only
 *                          a string there is a key.
 *
 *          What is read at a position: a string literal, a template with
 *          no `${}`, every branch of a `?:`, `||`, `??` (the right one of
 *          `&&`), and what the reader follows -- a const to its value, a
 *          property of a const object, the element of a const array a
 *          `.map()` or a for...of walks. A `let`, a parameter or data is
 *          not read: its keys are published in an exported
 *          `<NAME>_I18N_KEYS` array, and the call is MARKED with a comment
 *          right before what it hands over, `i18n: <NAME>_I18N_KEYS` (the
 *          list) or `i18n: data` (no key a list can hold). A marked `let`
 *          is held to its marker: every literal it is given is read and
 *          must be in the list, and one given nothing but literals fails
 *          (write it as a const, which the reader follows).
 *
 *          A test (i18n_key_functions.test.js) holds the library to it,
 *          per CALL: a key position given anything else than a literal, a
 *          const the reader follows, a key position of the enclosing
 *          table function handed on, or a marked value fails, with the
 *          file and the line. Publishing a list exempts no module.
 *
 *          A function added to the library that hands one of its
 *          parameters to t(), to `i18n`, or to a `data-i18n*` attribute
 *          goes in this table.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/

export const I18N_KEY_FUNCTIONS = Object.freeze([
    /*
     *  Exported: an app calls them
     */
    /*  shell_modals.js -- a string message IS a key (DOM is drawn as it is)  */
    {module: "shell_modals.js", name: "yui_shell_show_info",    exported: true, keys: ["1"]},
    {module: "shell_modals.js", name: "yui_shell_show_warning", exported: true, keys: ["1"]},
    {module: "shell_modals.js", name: "yui_shell_show_error",   exported: true, keys: ["1"]},
    {module: "shell_modals.js", name: "yui_shell_show_modal",   exported: true, keys: ["1", "2.title"]},
    {module: "shell_modals.js", name: "yui_shell_confirm_ok",   exported: true,
        keys: ["1", "2.title", "2.ok_label"]},
    {module: "shell_modals.js", name: "yui_shell_confirm_yesno", exported: true,
        keys: ["1", "2.title", "2.yes_label", "2.no_label"]},
    {module: "shell_modals.js", name: "yui_shell_confirm_danger", exported: true,
        keys: ["1", "2.title", "2.confirm_label", "2.cancel_label"]},
    {module: "shell_modals.js", name: "yui_shell_confirm_yesnocancel", exported: true,
        keys: ["1", "2.title", "2.yes_label", "2.no_label", "2.cancel_label"]},
    /*  yui_install.js  */
    {module: "yui_install.js", name: "yui_install_ask_once", exported: true,
        keys: ["1.message", "1.yes_label", "1.no_label"]},
    /*  yui_table_select.js -- the actions of the selection bar  */
    {module: "yui_table_select.js", name: "yui_selection_bar", exported: true,
        keys: ["1.actions[].label"]},
    /*  yui_asset.js -- the marker of a missing asset  */
    {module: "yui_asset.js", name: "yui_asset_missing", exported: true, keys: ["1.key"]},
    {module: "yui_asset.js", name: "yui_asset_element", exported: true, keys: ["1.key"]},
    /*  table_cell_text.js -- the tooltip key of a hook cell  */
    {module: "table_cell_text.js", name: "hook_cell_spec", exported: true, keys: ["4"]},
    /*  yui_time.js -- a granularity names itself by its id  */
    {module: "yui_time.js", name: "period_name", exported: true, keys: ["0", "0.id"]},

    /*
     *  Helpers of their own module
     */
    {module: "shell_modals.js", name: "show_notification", exported: false, keys: ["2"]},
    {module: "shell_modals.js", name: "build_dialog", exported: false,
        keys: ["1", "2[].label", "3.title"]},
    {module: "yui_time.js", name: "tr", exported: false, keys: ["1"]},
    {module: "yui_tabulator_i18n.js", name: "tr", exported: false, keys: ["0"]},
    {module: "yui_toolbar.js", name: "arrow_button", exported: false, keys: ["2"]},
    {module: "yui_graph_camera.js", name: "camera_button", exported: false, keys: ["3"]},
    {module: "c_yui_json.js", name: "icon_button", exported: false, keys: ["3"]},
    {module: "c_yui_json_pad.js", name: "pad_button", exported: false, keys: ["3"]},
    {module: "c_yui_json_pad.js", name: "build_pane", exported: false, keys: ["2"]},
    {module: "c_yui_gclass.js", name: "icon_button", exported: false, keys: ["3"]},
    {module: "c_yui_gclass.js", name: "empty_line", exported: false, keys: ["0"]},
    {module: "c_yui_gclass.js", name: "build_zone", exported: false, keys: ["1.key"]},
    {module: "c_yui_period.js", name: "nav_button", exported: false, keys: ["3"]},
    {module: "c_yui_period.js", name: "mode_name", exported: false, keys: ["0.id", "0.roll.label"]},
    {module: "c_yui_form.js", name: "cell_icon", exported: false, keys: ["1"]},
    {module: "c_yui_treedb_graph.js", name: "step_button", exported: false, keys: ["2"]},
    {module: "c_yui_treedb_graph.js", name: "layout_step_button", exported: false, keys: ["3"]},
    {module: "c_yui_treedb_graph.js", name: "answer_print_tranger_refused", exported: false,
        keys: ["2.i18n"]},
    {module: "c_yui_treedb_topics.js", name: "answer_print_tranger_refused", exported: false,
        keys: ["2.i18n"]},
    {module: "c_yui_treedb_topics.js", name: "card_action_anchor", exported: false, keys: ["2"]},
    {module: "c_yui_treedb_topics.js", name: "push_meta", exported: false, keys: ["0"]},
    {module: "c_yui_treedb_topics.js", name: "relation", exported: false, keys: ["1"]},
    {module: "c_yui_treedb_topic_with_form.js", name: "confirm_then", exported: false, keys: ["1"]},
    {module: "c_yui_treedb_topic_with_form.js", name: "present_json_popup", exported: false,
        keys: ["2.title"]},
    {module: "c_yui_schema_editor.js", name: "show_notice", exported: false, keys: ["1"]},
    {module: "c_yui_schema_editor.js", name: "toolbar_button", exported: false, keys: ["2"]},
    {module: "c_yui_schema_editor.js", name: "row_icon", exported: false, keys: ["3"]},
    {module: "c_yui_schema_editor.js", name: "name_control", exported: false, keys: ["1"]},
    {module: "c_yui_schema_editor.js", name: "named", exported: false, keys: ["1"]},
    {module: "c_yui_schema_editor.js", name: "name_attrs", exported: false, keys: ["0"]},
    {module: "c_yui_schema_editor.js", name: "field", exported: false, keys: ["2", "4"]},
    {module: "c_yui_schema_editor.js", name: "row", exported: false, keys: ["0"]},
    {module: "c_yui_schema_editor.js", name: "confirm_then", exported: false, keys: ["1"]},
    {module: "c_yui_schema_editor.js", name: "end_writes", exported: false, keys: ["1"]},
    {module: "c_yui_schema_editor.js", name: "open_dialog", exported: false, keys: ["2"]},
    {module: "c_g6_nodes_tree.js", name: "create_floating_icon", exported: false, keys: ["4"]},
    {module: "c_g6_nodes_tree.js", name: "show_dual_icons", exported: false, keys: ["3", "5"]},
    {module: "c_g6_nodes_tree.js", name: "create_form_label", exported: false, keys: ["1"]},
    {module: "c_g6_nodes_tree.js", name: "create_form_select", exported: false, keys: ["1[].i18n"]},
    {module: "c_g6_nodes_tree.js", name: "create_form_button_row", exported: false, keys: ["1[].i18n"]},
    {module: "c_g6_nodes_tree.js", name: "show_confirm_popover", exported: false, keys: ["3"]},
    {module: "yui_dev.js", name: "mk_view", exported: false, keys: ["1"]},
    {module: "yui_dev.js", name: "mk_out", exported: false, keys: ["1"]},
    {module: "yui_dev.js", name: "mk_expand", exported: false, keys: ["1"]},
    {module: "yui_dev.js", name: "mk_dir", exported: false, keys: ["3"]},
    {module: "yui_dev.js", name: "grp", exported: false, keys: ["0"]},
    {module: "yui_dev.js", name: "grp_scroll", exported: false, keys: ["0"]},
]);
