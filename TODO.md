# `gobj-ui` shell — pending work

Living TODO for the declarative shell.  Everything originally on
this list (the new shell + nav, escape stack, modal/notification
API, generalised secondary-nav loop, validator, Playwright e2e on
three browsers) is **done**, shipped in `7.3.1` (2026-04-30) and
published as `@yuneta/gobj-ui@7.3.1` and `@yuneta/gobj-js@7.3.1`
on npmjs.com.

`CHANGELOG.md` carries the full feature list under `## v7.3.1`.

---

## 1. Migrate legacy GUIs off `C_YUI_MAIN` / `C_YUI_ROUTING` — CLOSED

> **Status: CLOSED in `3.0.0`.**  §1.1 obsolete, §1.2 done in
> `2.6.0`, §1.3 superseded (estadodelaire lives on npm v1), §1.4
> executed in `3.0.0` with the user's go-ahead (2026-07-11).

### 1.1. ~~Migrate `C_YUI_TABS` off `EV_ROUTING_CHANGED`~~ — obsolete

Nothing in `src/` or `test-app/` references `EV_ROUTING_CHANGED`
anymore, and no in-org app registers `C_YUI_TABS` / `C_YUI_ROUTING`
/ `C_YUI_MAIN` (checked 2026-07-11 across `yunos/js/*`, wattyzer
and the test-app).  Nothing to migrate.

### 1.2. ~~Migrate the in-tree `display_*` / `get_yes*` consumers~~ — done in `2.6.0`

`c_yui_treedb_topics.js`, `c_yui_treedb_graph.js`,
`c_yui_treedb_topic_with_form.js` and `c_yui_window.js` now use the
shell helpers (`yui_shell_show_error`, `yui_shell_confirm_*`) and no
longer import `c_yui_main.js`, so v2 app bundles stop dragging in
`c_yui_main.css`.  The shell is resolved per call with
`yui_shell_of(gobj)` (nearest `C_YUI_SHELL` ancestor, else the last
shell created on the page).  The treedb edit dialog mounts on the
shell's popup layer (`yui_shell_popup_layer`) and rides the shell
Escape chain, LIFO with the confirms.

The test-app Modals chapter kept demoing the legacy helpers next to
the shell ones until §1.4 removed them (it now demos the shell
helpers only).

`c_g6_nodes_tree.js`, `c_yui_form.js` and `yui_dev.js` (listed as
"likely" in the original checklist) were already clean.

### 1.3. Migrate `estadodelaire/gui` to the shell — first real-world test

> **Superseded in practice**: estadodelaire consumes the **published
> npm v1 line** (`@yuneta/gobj-ui@^1.x`, frozen), not this `main`
> checkout — migrating it means moving it to v2, a project decision
> of its own.  The checklist below is kept as the reference plan for
> that migration if it is ever decided.

The companion repo `artgins/estadodelaire` is the canonical app on
top of `gobj-ui`.  Replace its bootstrap:

- `gui/src/main.js`: drop `register_c_yui_main / register_c_yui_routing`,
  add `register_c_yui_shell / register_c_yui_nav` and registrations
  for every `c_ui_*` gclass.
- `gui/src/c_yuneta_gui.js`: replace its custom shell wiring with a
  declarative `app_config.json` next to it.  Each `c_ui_*` gclass
  becomes a `target.gclass` with the appropriate `lifecycle`:
    - `c_ui_alarms` → `keep_alive`.
    - `c_ui_device_sonda` / `c_ui_device_termod` → `keep_alive` per
      device id.
    - `c_ui_historical_chart` → `lazy_destroy`.
    - `c_ui_monitoring` / `c_ui_monitoring_group` → `keep_alive`.
    - `c_ui_todo` / `c_yui_gobj_tree_js` → `lazy_destroy`.
- **Verify CSS class scope.**  `c_yui_shell.css` defines generic
  selectors (`.yui-toolbar`, `.yui-stage > *`, `.yui-zone-center > *`,
  `.yui-nav-iconbar .yui-nav-item.is-active`, etc.).  Confirm none
  collide with classes used by the `c_ui_*` views.  If they do, add
  the `.yui-shell` ancestor selector to scope shell rules.
- Verify on real screen sizes (mobile / tablet / desktop) per the
  layout matrix in `SHELL.md`.
- Confirm the live language switch using existing locales/flags
  (`gui/src/locales/`).
- **If a feature gap appears**, capture it as a follow-up here
  **before continuing**.  Do not patch around it ad-hoc inside
  `gui/`.

### 1.4. ~~Delete `C_YUI_MAIN` and `C_YUI_ROUTING`~~ — done in `3.0.0`

Removed `c_yui_main.js`/`.css`, `c_yui_routing.js`/`.css`,
`c_yui_tabs.js`, plus the equally consumer-less `themes.js` and
`ytable.js`/`.css`; exports dropped from `index.js`; SHELL.md §10
rewritten (coexistence/drift policy retired) and the old §12
"don't import both css" limitation deleted; README updated.  The
`2.5.0` icon-centric volatil design was ported into
`yui_shell_confirm_*` (tinted type icon, `opts.type`) before the
removal, so the redesign survives in the blessed API.  The test-app
Modals chapter now demos the shell helpers only.

**Done (1 as a whole, 2026-07-11):** `gobj-ui` `main` no longer
ships the legacy stack and no consumer references it; the frozen v1
npm line still serves estadodelaire/hidraulia.

---

## Acknowledged debt (not blocking anything)

- **Focus-trap unit tests use hand-rolled DOM stubs.**  Stubs cover
  every branch of the trap (Tab / Shift+Tab / non-Tab / focus-from-
  outside / release idempotency / missing panel / empty panel / LIFO
  stacking).  Switch to `jsdom` or `happy-dom` only if a real edge
  case appears (Shadow DOM, `inert`, native `<dialog>`, `tabindex`
  derived from CSS, etc.).
