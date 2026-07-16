/***********************************************************************
 *          @yuneta/gobj-ui/index.js  (v2 / main line)
 *
 *          Yuneta UI Library - Reusable GUI components.
 *
 *          Barrel re-exports for the v2 source, which lives in src/.
 *          This is the canonical line, embedded as the yunetas submodule
 *          kernel/js/gobj-ui and consumed by wattyzer via a file: dep.
 *
 *          Copyright (c) 2024-2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/

/*
 *  Components
 */
export { register_c_yui_window } from "./src/c_yui_window.js";
export { register_c_yui_window_manager } from "./src/c_yui_window_manager.js";
export { register_c_yui_pager } from "./src/c_yui_pager.js";
export { register_c_yui_wizard } from "./src/c_yui_wizard.js";
export { register_c_yui_form } from "./src/c_yui_form.js";
export { register_c_yui_map } from "./src/c_yui_map.js";
export { register_c_yui_uplot } from "./src/c_yui_uplot.js";
export { register_c_yui_json_graph } from "./src/c_yui_json_graph.js";
export { register_c_yui_json } from "./src/c_yui_json.js";
export { register_c_yui_gobj_tree_js } from "./src/c_yui_gobj_tree_js.js";

/*
 *  Declarative shell + menu navigation (new in v7.4)
 */
export {
    register_c_yui_shell,
    yui_shell_navigate,
    yui_shell_open_drawer,
    yui_shell_close_drawer,
    yui_shell_toggle_drawer,
    yui_shell_push_escape,
    yui_shell_pop_escape,
    yui_shell_set_avatar_provider,
    yui_shell_refresh_avatars,
    yui_shell_set_translator,
    yui_shell_set_connection_state,
    yui_shell_set_toolbar_item_icon,
    yui_shell_close_dropdown,
    yui_shell_register_event_handler,
} from "./src/c_yui_shell.js";
export { register_c_yui_nav } from "./src/c_yui_nav.js";
/*
 *  Site map: the whole navigation surface (toolbar + account menu +
 *  nav + dynamic tabs + view-contributed sub-routes) as a clickable,
 *  printable tree — the app's basic documentation (ROUTING.md).
 */
export { yui_shell_show_route_map } from "./src/shell_route_map.js";
export {
    yui_shell_show_info,
    yui_shell_show_warning,
    yui_shell_show_error,
    yui_shell_show_modal,
    yui_shell_confirm_ok,
    yui_shell_confirm_yesno,
    yui_shell_confirm_yesnocancel,
} from "./src/shell_modals.js";

/*
 *  TreeDB components
 */
export { register_c_yui_treedb_topics } from "./src/c_yui_treedb_topics.js";
export { register_c_yui_treedb_topic_with_form } from "./src/c_yui_treedb_topic_with_form.js";
export { register_c_yui_treedb_graph } from "./src/c_yui_treedb_graph.js";
export { register_c_g6_nodes_tree } from "./src/c_g6_nodes_tree.js";

/*
 *  Date navigator: granularity + arrows + calendar (C_YUI_PERIOD), on
 *  top of the period algebra of yui_time (unit + count, so an app gets
 *  quarters, semesters or bimesters by declaring them).
 */
export { register_c_yui_period } from "./src/c_yui_period.js";
export {
    YUI_PERIODS,
    YUI_PERIODS_DEFAULT,
    YUI_ROLLING,
    safe_locale,
    epoch_to_ms,
    ms_to_epoch,
    epoch_to_local_input,
    local_input_to_epoch,
    fmt_epoch,
    iso_week,
    period_spec,
    period_start,
    period_shift,
    period_bounds,
    period_bounds_epoch,
    rolling_bounds,
    is_current_period,
    infer_period,
    period_name,
    period_label,
} from "./src/yui_time.js";

/*
 *  Libraries and utilities
 */
export { addClasses, removeClasses, toggleClasses, removeChildElements, disableElements, enableElements, set_submit_state, set_cancel_state, set_active_state, getStrokeColor } from "./src/lib_graph.js";
export { inject_svg_icons } from "./src/lib_icons.js";
export { EditControl, MarkerControl } from "./src/lib_maplibre.js";
export { yui_toolbar } from "./src/yui_toolbar.js";
export { yui_theme_now, yui_is_dark, yui_watch_theme } from "./src/yui_theme.js";
export { attach_clear, refresh_clear } from "./src/yui_inputs.js";
export { info_traffic, setup_dev, build_dev_panel, apply_dev_traces, dev_window_was_open } from "./src/yui_dev.js";
export { setup_frontend_view } from "./src/yui_frontend_view.js";

/*
 *  CSS - import these in your main entry point
 *  Example:
 *    import "gobj-ui/src/c_yui_shell.css";     // declarative shell
 *    import "gobj-ui/src/c_yui_map.css";
 *    import "gobj-ui/src/yui_toolbar.css";
 *    import "gobj-ui/src/lib_graph.css";
 *    import "gobj-ui/src/yui_icons.css";
 */
