# gobj-ui — nav layouts demo (`test-app`)

A tiny, backend-less app that showcases **every `C_YUI_NAV` menu layout**
of the v2 declarative shell (`C_YUI_SHELL` + `C_YUI_NAV`), and the
**per-zone responsive** model that lets one menu render differently in
different zones and breakpoints.

It is the runnable companion to [`../SHELL.md`](../SHELL.md): the whole
navigation is declared in [`src/app_config.json`](src/app_config.json),
materialised by the shell, and every leaf mounts one small view
(`C_TEST_VIEW`) that names on screen which layout(s) are currently
visible and where.

## Quick start

```bash
cd kernel/js/gobj-ui/test-app
npm install      # installs bulma + file: links to ../ (gobj-ui) and ../../gobj-js
npm run dev      # http://localhost:5173
npm run build    # production bundle (also a fast import/resolve check)
```

No backend, no login, no persistence — it is a pure gobj tree with
hash routing.

## What each part demonstrates

| Layout | Where to see it | How it's configured |
|---|---|---|
| **vertical** | left rail on desktop | `menu.primary.render.left = {layout:"vertical"}` |
| **icon-bar** | bottom bar on mobile (narrow the window) | `menu.primary.render.bottom = {layout:"icon-bar"}` |
| **tabs** | top strip in the **Tabs** chapter | `submenu.render = {"top-sub":"tabs"}` |
| **submenu** | titled list on the right in **Side submenu** | `submenu.render = {"right":"submenu"}` |
| **cards** | grid landing at `/cards` (the **Cards** chapter) | `submenu.index = true` (synthesizes a `layout:"cards"` nav) |
| **backbar** | `← Cards` on mobile inside a card leaf | auto-added by `submenu.index` for `<tablet` |
| **drawer** | off-canvas panel from the toolbar burger | `menu.quick.render = {"overlay":"drawer"}` |
| **accordion** | live embedded nav in the **Accordion** chapter | a `C_YUI_NAV` with `layout:"accordion"` built inside `C_TEST_VIEW` |

### Component views

Beyond the nav-layout chapters, several chapters mount real gobj-ui
components inside a stage, so the demo also shows what goes *inside* a
view. Each is wrapped by a tiny `C_DEMO_*` gclass that builds a card,
creates the component as a pure child, feeds it data and (where the
component publishes events) declares them.

| Chapter | Component | What it shows |
|---|---|---|
| **Form** (`/form`) | `C_YUI_FORM` | A declarative field template (text / number / **enum select** / checkbox), pre-filled and editable via the component's own save/undo/clear toolbar. Publishes `EV_SAVE_RECORD`; the wrapper echoes the submitted JSON. |
| **Table** (`/table`) | Tabulator | A data table built directly in the view — the pattern the yunos use (e.g. gui_agent's node list). Sortable columns, a `%` formatter and a coloured-tag Status formatter; dark theme handled in `demo.css`. |
| **Chart** (`/chart`) | `C_YUI_UPLOT` | A uPlot time-series (two series, unix-epoch-seconds x-axis). Series added with `EV_ADD_SERIE`, rows with `EV_LOAD_DATA`. Offline. |
| **Gobj tree** (`/tree`) | `C_YUI_GOBJ_TREE_JS` | The **live gobj tree of this very yuno** drawn with G6 — self-referential (yuno → shell → navs/views → the tree component itself). No data, no backend. |
| **JSON graph** (`/json`) | `C_YUI_JSON_GRAPH` | An arbitrary JSON value as a hierarchical G6 graph (objects/arrays as group nodes, scalars as typed rows). Publishes `EV_JSON_ITEM_CLICKED`. Offline. |
| **Wizard** (`/wizard`) | `C_YUI_WIZARD` | A multi-step wizard (title + "N / M" + Back/Next→Confirm). Steps via `EV_SET_STEPS`; publishes `EV_STEP_SHOWN` / `EV_WIZARD_DONE` / `EV_WIZARD_CANCEL`. Offline. |
| **Pager** (`/pager`) | `C_YUI_PAGER` | A drill-down page stack ("← title" header). Push pages with the button, pop with "←"; publishes `EV_PAGE_SHOWN` / `EV_PAGE_DISCARD` / `EV_PAGER_EXIT`. Offline. |
| **Map** (`/map`) | `C_YUI_MAP` (MapLibre) | A basemap with Spanish-city markers. Differs from the others: it renders into an external pre-sized `$map` (no `$container`). **Needs network** for the basemap tiles (`tiles.openfreemap.org`); offline it degrades to a blank map with controls. |
| **Treedb** (`/treedb`) | `C_YUI_TREEDB_TOPIC_WITH_FORM` | The real treedb topic table + its hosted `C_YUI_FORM` edit dialog, against an **in-memory backend**: the wrapper plays the `C_YUI_TREEDB_TOPICS` role (feeds `EV_LOAD_NODES`, answers `get_topic_data` for fkey options, applies and echoes the published `EV_CREATE/UPDATE/DELETE_RECORD`). Pkey follows the `form_mode` contract, fkeys are TomSelects fed with sibling-topic rows, the dict col edits as raw JSON. Offline. |

`C_YUI_MAP` (and other legacy components) look up a `__yui_main__`
service to subscribe to its `EV_RESIZE`. The declarative shell doesn't
provide one, so `c_demo_main.js` registers a minimal `__yui_main__`
(`C_DEMO_MAIN`) that publishes `EV_RESIZE` on window resize — this both
gives the map real reflow and silences the "service not found" log.

Not demoed (need a live backend/treedb, out of scope here):
`C_YUI_TREEDB_TOPICS` / `C_YUI_TREEDB_GRAPH` / `C_G6_NODES_TREE`.

Because `C_YUI_FORM` (and the shell) translate their DOM through
i18next's module-level `t()`, `main.js` initialises the shared i18next
instance once (no resources — labels are already English). That
instance is a **single copy** only thanks to `resolve.dedupe` in
`vite.config.js`; without it the form would bind an uninitialised second
i18next and render blank labels — the canonical gobj-ui dedupe footgun.

Plus, without being a "layout":

- **Responsive per-zone** — the *same* `menu.primary` is a vertical
  left rail on desktop and a bottom icon-bar on mobile (`show_on` on the
  `left` / `bottom` zones). Resize the window across the Bulma `desktop`
  breakpoint to watch it move.
- **Decorative grouping** — the Side submenu uses `type:"header"` /
  `type:"divider"` items to chunk the list (`Account` / `Security`)
  without a third nav level. `tabs` and `cards` silently drop these.
- **Lifecycle** — the Tabs chapter mixes `keep_alive` (Tab A/B keep
  their `instance #` on revisit) and `lazy_destroy` (Tab C gets a fresh
  instance every time). The number is printed at the bottom of each card.
- **Toolbar actions** — `navigate`, `event` (theme toggle), `drawer`
  (burger) and a `dropdown` (avatar menu), plus a `brand` and an
  `avatar` item.
- **Light / dark** — the toolbar moon toggles Bulma's `data-theme` on
  `<html>` (handled by the root `C_DEMO` service).
- **Localisation (es / en)** — the toolbar `ES/EN` button publishes
  `EV_TOGGLE_LANGUAGE`; `C_DEMO` flips i18next and calls
  `refresh_language(document.body, t)` to repaint every `[data-i18n]`
  node (nav labels, toolbar, view titles/leads, the hosted `C_YUI_FORM`
  fields/buttons). English is the source (keys = English strings), the
  `es` bundle in `locales.js` translates them, and views translate
  themselves on build so navigating while in Spanish stays Spanish.
  Technical tokens (badges, table column headers, the `gobj:` line) stay
  English on purpose.

## Why accordion is embedded rather than a chapter's submenu

`accordion` is a **primary-zone** layout: its first-level entries are
collapsible *sections* and their bodies are the routable *second-level*
items. The shell's navigation is deliberately two levels deep, so an
accordion can't sit as a third-level submenu. The Accordion chapter
therefore builds a real `C_YUI_NAV` (`layout:"accordion"`) *inside* its
view as a live illustration; its clicks arrive as `EV_NAV_CLICKED` and
the view routes them by setting the hash — exactly what the shell does.

## Files

| File | Role |
|---|---|
| `src/main.js` | registers gclasses, boots the yuno, creates the `C_DEMO` default service |
| `src/c_demo.js` | root service: hosts `C_YUI_SHELL`, owns theme + avatar provider |
| `src/app_config.json` | the entire declarative nav (zones, stages, toolbar, menus) |
| `src/c_test_view.js` | the layout-showcase view most leaves mount; self-describes the active layout |
| `src/c_demo_form.js` | the **Form** chapter — hosts `C_YUI_FORM` + echoes the saved record |
| `src/c_demo_table.js` | the **Table** chapter — a Tabulator data table |
| `src/c_demo_chart.js` | the **Chart** chapter — hosts `C_YUI_UPLOT` |
| `src/c_demo_tree.js` | the **Gobj tree** chapter — hosts `C_YUI_GOBJ_TREE_JS` |
| `src/c_demo_json.js` | the **JSON graph** chapter — hosts `C_YUI_JSON_GRAPH` |
| `src/c_demo_wizard.js` | the **Wizard** chapter — hosts `C_YUI_WIZARD` |
| `src/c_demo_pager.js` | the **Pager** chapter — hosts `C_YUI_PAGER` |
| `src/c_demo_map.js` | the **Map** chapter — hosts `C_YUI_MAP` (MapLibre) |
| `src/c_demo_treedb.js` | the **Treedb** chapter — hosts `C_YUI_TREEDB_TOPIC_WITH_FORM` over an in-memory backend |
| `src/c_demo_main.js` | minimal `__yui_main__` service (EV_RESIZE) for the map |
| `src/locales.js` | i18next setup + the `es` translation bundle (en/es toggle) |
| `src/demo.css` | app-owned styling for the view cards + table dark theme (never shell chrome) |
| `vite.config.js` | resolves `@yuneta/gobj-js` and `@yuneta/gobj-ui` to local source |

## Extending it

- **Add a layout variant**: change a chapter's `submenu.render` (e.g.
  `{"right":"vertical"}` instead of `submenu`) and reload.
- **Add a component view**: point a leaf's `target.gclass` at any gclass
  exposing a `$container`. If it imports a shared third-party lib
  (i18next, @antv/g6, uplot, …), add that lib to `resolve.dedupe` in
  `vite.config.js` — see the note there.

Copyright (c) 2026, ArtGins. All Rights Reserved.
