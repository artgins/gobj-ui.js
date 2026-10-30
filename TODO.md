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
> `2.6.0`, §1.3 done on 2026-10-13 (an application on v2), §1.4
> executed in `3.0.0` with the user's go-ahead (2026-07-11).

### 1.1. ~~Migrate `C_YUI_TABS` off `EV_ROUTING_CHANGED`~~ — obsolete

Nothing in `src/` or `test-app/` references `EV_ROUTING_CHANGED`
anymore, and no in-org app registers `C_YUI_TABS` / `C_YUI_ROUTING`
/ `C_YUI_MAIN` (checked 2026-07-11 across `yunos/js/*`, the
consumer applications and the test-app).  Nothing to migrate.

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

### 1.3. ~~Migrate a v1 application's `gui/` to the shell~~ — done on 2026-10-13

> **Done**: the v1 freeze was lifted and the application moved to v2
> (`^7.26.31`), with its own plan in its `gui/` directory.
> The gaps it found were fixed here, not patched around in `gui/`:
> a menu entry carries a badge with a tone (`7.26.30`,
> `yui_shell_set_nav_item_badge()`); a window lives in the shell's
> overlay layer, not on the body above the whole shell (`7.26.31`);
> Tabulator's filters and boxes and the fields of `C_YUI_FORM` carry a
> title (`7.26.31`). The last v1 consumer followed on 2026-10-15. The
> original checklist is kept below, with the app's names made generic.

The companion application repo is the canonical app on top of
`gobj-ui`.  Replace its bootstrap:

- `gui/src/main.js`: drop `register_c_yui_main / register_c_yui_routing`,
  add `register_c_yui_shell / register_c_yui_nav` and registrations
  for every `c_ui_*` gclass.
- `gui/src/c_yuneta_gui.js`: replace its custom shell wiring with a
  declarative `app_config.json` next to it.  Each `c_ui_*` gclass
  becomes a `target.gclass` with the appropriate `lifecycle`:
    - `c_ui_alarms` → `keep_alive`.
    - `c_ui_device_*` (one per device type) → `keep_alive` per
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
npm line serves no application since 2026-10-15.

---

## 2. The graph's Save writes a `__graphs__` record per topic — CLOSED in `7.23.186`

> **Status: CLOSED.** `save_geometry()` compares what the view holds
> against what the backend has (`graph_save_plan.js`, and
> `priv._saved_graph_properties` as the baseline) and publishes only for
> the topics that differ; `save_topic_graph_properties()` carries the same
> guard, so the delete path is covered too. The history plugin was not
> touched: Undo and Redo go on reading their own stacks. The account below
> is the original finding, kept as history.

**Was open.** `save_geometry()` (`src/c_g6_nodes_tree.js`) walks
`priv._graph_properties` and publishes an `EV_UPDATE_NODE` for EVERY
topic the view has loaded, whatever moved.  So moving one node and
pressing Save appends one record per topic to `__graphs__`, and all
but one of them say exactly what the record under them said.

Measured on a staging node (2026-09-20, `gui_treedb` against the agent's
treedb): one node of `public_services` moved, **five records written,
four of them identical** to the ones below (`yunos`, `binaries`,
`configurations`, `realms`).

The Save button is `disabled` while nothing has moved, so the
zero-move case cannot happen; this is the one-topic case.

**The fix belongs here, not in treedb.**  `treedb_update_node()` saves
whatever it is handed, on purpose: deciding whether a write is worth
making is the caller's judgement, and the caller is the one that knows
what the person moved.  So compare each `_graph_properties[topic]`
with what the view already holds and publish only for the topics that
changed; `save_topic_graph_properties()` already writes one topic
alone, so only the comparison is missing.

The comparison is on the view's own properties, which carry no `time`
column, so the treedb `now` stamp (yunetas `038208f16`, a writable
`now` column is stamped on every update) does not interfere: after it,
the four no-op records differ in `time` and are no longer identical on
disk, but they are still four writes that change nothing.

---

## Acknowledged debt (not blocking anything)

- **Focus-trap unit tests use hand-rolled DOM stubs.**  Stubs cover
  every branch of the trap (Tab / Shift+Tab / non-Tab / focus-from-
  outside / release idempotency / missing panel / empty panel / LIFO
  stacking).  One real edge case has appeared (7.26.43): a control that
  is not drawn (`display:none`, the adaptive dialog's back arrow on a
  laptop) took the focus and no dialog could be reached from the
  keyboard.  It is covered with a `getClientRects` stub plus a check in
  Chromium; a stub cannot tell what CSS hides, so a change of the trap's
  "drawn" test is checked in a real browser.  Switch to `jsdom` or
  `happy-dom` if another such case appears (Shadow DOM, `inert`, native
  `<dialog>`, `tabindex` derived from CSS, etc.).

- **The banners of `set_submit_state()` / `set_active_state()` name the
  wrong colours.**  They say green and orange; `lib_graph.css`, which is
  what actually paints, gives them orange (`#fa8c16`, pending changes) and
  violet (`#722ed1`, undo/redo).  The doc page (`api/gobj-ui/dom.md`) was
  corrected at `7.23.12`; the source comments were left alone in that round
  because editing the file would have moved the line anchors the published
  doc links point at, and they are pinned to the tag.  Fix them in the next
  round that changes `lib_graph.js` for a real reason, and repin.
