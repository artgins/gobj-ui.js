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
 *                          a string there is a key. DOM is an array (a
 *                          createElement2 spec; an array of string
 *                          literals is none), a call of createElement2(),
 *                          createOneHtml() or html_markup() of gobj-js, of
 *                          text_node() of gobj-ui, of document.createElement()
 *                          and the like, a const bound to one, a plain `let`
 *                          only ever given one -- known by where it comes
 *                          from, never by a variable's name.
 *
 *          What is read at a position: a string literal, a template with
 *          no `${}`, every branch of a `?:`, `||`, `??` (the right one of
 *          `&&`), and what the reader follows -- a const to its value (what
 *          a destructuring reads from it too), an import of a const or a
 *          function of a module the reader reads, a property of a const
 *          object or of a copy of one (`{...o}`), the element of a const
 *          array a `.map()` or a for...of walks (and what a destructuring
 *          reads from it), String(x) and `${x}` as x, the default of a
 *          parameter, a call of a function -- of the module or imported --
 *          whose every return is one of these (read once; a recursion is
 *          not followed). A `let`, a parameter or data is not read: its
 *          keys are published in an exported `<NAME>_I18N_KEYS` array (an
 *          `export const`, never mutated), and the call is MARKED with a
 *          comment right before what it hands over, `i18n: <NAME>_I18N_KEYS`
 *          (the list) or `i18n: data` (no key a list can hold). A marked
 *          `let` is held to its marker: every literal it is given is read
 *          and must be in the list, and one given nothing but literals fails
 *          (write it as a const, which the reader follows). A `data` marker
 *          on what the reader follows to keys and nothing else -- a
 *          literal, a const or a branch that is one, a call that returns
 *          literals -- fails too: it claims data where the reader reads a
 *          key; and so does one that would hide a key the reader does not
 *          read: a call whose returns mix keys with data, an array of
 *          string literals.
 *
 *          A call reaches a function of this table however it names it:
 *          its name, an import under any name, a re-export, a const alias,
 *          a map (`API.info(...)`), `.call()`, `.apply()`.
 *
 *          The rule, per CALL: a key position given anything else than a
 *          literal (or DOM, or nothing), a const the reader follows, a key
 *          position of the enclosing table function handed on, or a marked
 *          value fails, with the file and the line; a TRANSLATED text --
 *          t("..."), tr(), an alias of t, `t?.()`, `t.call()` -- fails even
 *          marked (it would be translated again, and never change
 *          language). A test (i18n_key_functions.test.js) holds the library
 *          to it, and validate-locales an app's own code. Publishing a list
 *          exempts no module.
 *
 *          The table is COMPLETE and CORRECT, and the same test proves both
 *          (REV-CLOUD V21.4.1, V22): it finds every function of the library
 *          that hands one of its parameters -- or what it reads from one:
 *          `opts.title`, `opts?.title`, a destructured `{label}` (in the
 *          parameter or in the body), each `items[].name`, `arguments[1]`,
 *          `rest[0]`, a copy `{...opts}` -- to a translator, to an `i18n`,
 *          `code` or `data-i18n*` value (`el.dataset.i18nTitle` included),
 *          or to a key position of a function of this table, and fails on
 *          a function missing here; and the same search, started from NO
 *          table, must find every entry here, at every position, with the
 *          same `exported`: an entry nothing forwards to fails. A function
 *          that hands a parameter on through what no position can name --
 *          `k.toLowerCase()`, a concatenation or a template, an iteration
 *          of `Object.entries(opts)`, a rest parameter walked, `arguments`
 *          by a computed index, a parameter an array pattern destructures
 *          -- fails too, unless it marks it where it hands it.
 *          One called by name goes here, with that position. One nothing
 *          calls by name -- an FSM action, a callback, a method -- has no
 *          call to read: it marks what it hands on, where it hands it. What
 *          a gobj keeps in its `priv`, and what is read from a parameter
 *          `gobj` (its attrs), is its own state, never a position.
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
    /*  nav_cards_helpers.js -- a nav item's name, tooltip and aria label  */
    {module: "nav_cards_helpers.js", name: "card_descriptor", exported: true,
        keys: ["0.name", "0.tooltip", "0.aria_label"]},
    {module: "nav_cards_helpers.js", name: "cards_grid_descriptor", exported: true,
        keys: ["0[].name", "0[].tooltip", "0[].aria_label"]},
    /*  yui_gclass_view.js -- the dialog's title is the gclass name  */
    {module: "yui_gclass_view.js", name: "open_gclass_view", exported: true, keys: ["1"]},

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
    {module: "c_yui_period.js", name: "mode_name", exported: false,
        keys: ["0.id", "0.roll.label", "0.spec", "0.spec.id"]},
    {module: "c_yui_period.js", name: "build_mode_button", exported: false,
        keys: ["1.id", "1.roll.label", "1.spec", "1.spec.id"]},
    {module: "yui_table_select.js", name: "paint_label", exported: false, keys: ["1"]},
    {module: "c_yui_form.js", name: "cell_icon", exported: false, keys: ["1"]},
    {module: "c_yui_form.js", name: "name_form_control", exported: false, keys: ["1.label_i18n", "1.label"]},
    {module: "c_yui_form.js", name: "create_form_field", exported: false,
        keys: ["4.label_i18n", "4.label", "4.options", "4.options[]"]},
    {module: "c_yui_treedb_graph.js", name: "step_button", exported: false, keys: ["2"]},
    {module: "c_yui_treedb_graph.js", name: "layout_step_button", exported: false, keys: ["3"]},
    {module: "c_yui_treedb_graph.js", name: "answer_print_tranger_refused", exported: false,
        keys: ["2.i18n", "2.error"]},
    {module: "c_yui_treedb_topics.js", name: "answer_print_tranger_refused", exported: false,
        keys: ["2.i18n", "2.error"]},
    {module: "c_yui_treedb_topics.js", name: "card_action_anchor", exported: false, keys: ["2"]},
    {module: "c_yui_treedb_topics.js", name: "push_meta", exported: false, keys: ["0"]},
    {module: "c_yui_treedb_topics.js", name: "relation", exported: false, keys: ["1"]},
    {module: "c_yui_treedb_topics.js", name: "add_tab", exported: false, keys: ["3"]},
    {module: "c_yui_treedb_topics.js", name: "add_topic_card", exported: false, keys: ["2"]},
    {module: "c_yui_treedb_topics.js", name: "show_topic_info", exported: false, keys: ["1"]},
    {module: "c_yui_treedb_topics.js", name: "build_topic_info_panel", exported: false, keys: ["2"]},
    {module: "c_yui_treedb_topic_with_form.js", name: "confirm_then", exported: false, keys: ["1"]},
    {module: "c_yui_treedb_topic_with_form.js", name: "present_json_popup", exported: false,
        keys: ["1", "2.title"]},
    {module: "c_yui_treedb_topic_with_form.js", name: "col_title_formatter", exported: false, keys: ["1.id"]},
    {module: "c_yui_treedb_topic_with_form.js", name: "open_cell_json_dialog", exported: false, keys: ["2"]},
    {module: "c_yui_treedb_topic_with_form.js", name: "open_cell_file_dialog", exported: false, keys: ["2"]},
    {module: "c_yui_treedb_topic_with_form.js", name: "open_hook_choice_dialog", exported: false,
        keys: ["1[].topic_name"]},
    {module: "c_yui_schema_editor.js", name: "show_notice", exported: false, keys: ["1", "2"]},
    {module: "c_yui_schema_editor.js", name: "toolbar_button", exported: false, keys: ["2"]},
    {module: "c_yui_schema_editor.js", name: "row_icon", exported: false, keys: ["3"]},
    {module: "c_yui_schema_editor.js", name: "name_control", exported: false, keys: ["1"]},
    {module: "c_yui_schema_editor.js", name: "named", exported: false, keys: ["1"]},
    {module: "c_yui_schema_editor.js", name: "name_attrs", exported: false, keys: ["0"]},
    {module: "c_yui_schema_editor.js", name: "field", exported: false, keys: ["2", "4"]},
    {module: "c_yui_schema_editor.js", name: "row", exported: false, keys: ["0"]},
    {module: "c_yui_schema_editor.js", name: "confirm_then", exported: false, keys: ["1"]},
    {module: "c_yui_schema_editor.js", name: "end_writes", exported: false, keys: ["1"]},
    {module: "c_yui_schema_editor.js", name: "open_dialog", exported: false, keys: ["1", "2"]},
    {module: "c_yui_schema_editor.js", name: "refuse_bad_name", exported: false, keys: ["1"]},
    {module: "c_yui_schema_editor.js", name: "open_card", exported: false, keys: ["4[].i18n"]},
    {module: "c_yui_schema_editor.js", name: "open_report", exported: false,
        keys: ["1[].severity", "1[].code"]},
    {module: "c_yui_schema_editor.js", name: "render_import_plan", exported: false,
        keys: ["1.conflicts[].code", "1.writes[].op"]},
    {module: "schema_validate.js", name: "add", exported: false, keys: ["1"]},
    {module: "c_g6_nodes_tree.js", name: "create_floating_icon", exported: true, keys: ["4"]},
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
    /*  c_yui_nav.js -- the items of a menu: the app's nav declaration  */
    {module: "c_yui_nav.js", name: "item_li", exported: false, keys: ["1.name", "1.tooltip", "1.aria_label"]},
    {module: "c_yui_nav.js", name: "item_iconbar", exported: false, keys: ["1.name", "1.tooltip", "1.aria_label"]},
    {module: "c_yui_nav.js", name: "render_vertical", exported: false,
        keys: ["1[].name", "1[].tooltip", "1[].aria_label"]},
    {module: "c_yui_nav.js", name: "render_icon_bar", exported: false,
        keys: ["1[].name", "1[].tooltip", "1[].aria_label"]},
    {module: "c_yui_nav.js", name: "render_tabs", exported: false,
        keys: ["1[].name", "1[].tooltip", "1[].aria_label"]},
    {module: "c_yui_nav.js", name: "render_cards", exported: false,
        keys: ["1[].name", "1[].tooltip", "1[].aria_label"]},
    {module: "c_yui_nav.js", name: "render_submenu", exported: false,
        keys: ["1[].name", "1[].tooltip", "1[].aria_label"]},
    {module: "c_yui_nav.js", name: "render_drawer", exported: false,
        keys: ["1[].name", "1[].tooltip", "1[].aria_label"]},
    {module: "c_yui_nav.js", name: "render_breadcrumb", exported: false, keys: ["1[].name", "1[].id"]},
    {module: "c_yui_nav.js", name: "render_accordion", exported: false,
        keys: ["1[].name", "1[].submenu.items[].name", "1[].submenu.items[].tooltip",
               "1[].submenu.items[].aria_label"]},
    /*  c_yui_shell.js -- the toolbar items: the app's shell declaration  */
    {module: "c_yui_shell.js", name: "build_toolbar", exported: false,
        keys: ["1.toolbar.aria_label", "1.toolbar.items[].name", "1.toolbar.items[].aria_label",
               "1.toolbar.items[].tooltip", "1.toolbar.items[].wordmark"]},
    {module: "c_yui_shell.js", name: "build_toolbar_action_item", exported: false,
        keys: ["1.name", "1.aria_label", "1.tooltip"]},
    {module: "c_yui_shell.js", name: "build_toolbar_brand_item", exported: false,
        keys: ["1.name", "1.aria_label", "1.tooltip", "1.wordmark"]},
    {module: "c_yui_shell.js", name: "build_toolbar_avatar_item", exported: false,
        keys: ["1.name", "1.aria_label", "1.tooltip"]},
    {module: "c_yui_shell.js", name: "build_toolbar_connection_item", exported: false,
        keys: ["1.name", "1.aria_label", "1.tooltip"]},
    {module: "c_yui_shell.js", name: "handle_toolbar_action", exported: false, keys: ["1.name", "1.aria_label"]},
    {module: "c_yui_shell.js", name: "toggle_toolbar_dropdown", exported: false, keys: ["1.name", "1.aria_label"]},
    {module: "c_yui_shell.js", name: "open_toolbar_dropdown", exported: false, keys: ["1.name", "1.aria_label"]},
    {module: "c_yui_shell.js", name: "build_dropdown_row", exported: false, keys: ["1.name", "1.aria_label"]},
    /*  shell_route_map.js -- a node of the route map  */
    {module: "shell_route_map.js", name: "render_node", exported: false, keys: ["0.label"]},
]);
