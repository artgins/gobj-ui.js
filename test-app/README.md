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
| **cards** | every level of the **Cards** chapter (`/cards`) | a node's `projection.index` (see the node tree below) |
| **backbar** | `← <level>` on mobile inside any card leaf | a node's `projection.chrome` for `<tablet` |
| **cards** (shell) | grid landing at `/sectionindex` (**Section index**) | `submenu.index = true` (synthesizes a `layout:"cards"` nav) |
| **drawer** | off-canvas panel from the toolbar burger | `menu.quick.render = {"overlay":"drawer"}` |
| **accordion** | live embedded nav in the **Accordion** chapter | a `C_YUI_NAV` with `layout:"accordion"` built inside `C_TEST_VIEW` |

### The node tree — two chapters, one tree (`/cards`, `/crumbs`)

The **Cards** chapter is not a menu: it is a tree of `C_YUI_NODE` gobjs,
the prototype of the model where *the gobj tree IS the navigation tree*.

- **One declared route.** `app_config.json` declares `/cards` and nothing
  else; the shell resolves it and hands the tree everything below as a
  `subpath`, so `#/cards/energy/north/m1` is four levels deep on a route
  table that never grew. Depth is unbounded — compare with the
  **Section index** chapter, which is the shell's own `submenu.index`
  and stops at two levels by construction.
- **A parent holds how it wants its children seen.** `projection` is a
  `C_YUI_NAV` render config, in two modes: `index` (I am the tip — the
  projection is the page) and `chrome` (a child is showing — the
  projection is the strip around it). Energy projects cards + tabs;
  Water projects a vertical list. Same tree, same URLs.
- **A node may have content AND children** (see *Beta*): the content is
  the page, the children are projected under it. One node, not two
  concepts.
- **Three ways to show depth, and the button that cycles them.**
  `nav_mode` on the tree ROOT: `"stack"` (one chrome strip per ancestor),
  `"back"` (only the tip's parent, as a `← parent`) or `"path"` (the trail as
  one breadcrumb line). The panel's **stack, back or path** button walks a
  live tree through the three with a single `yui_node_set_nav_mode(root, mode)`
  — including back to `"stack"`, which restores exactly what each branch
  declared, because a mode filters the renders instead of rewriting them.
  Try it at a leaf: `#/cards/energy/north/m1` shows three strips in `stack`,
  one `← North hall` in `back`, and four crumbs in `path`.
- **Two chapters, so the two shapes can be seen side by side.** **Cards**
  (`/cards`) is the default `stack`; **Breadcrumb** (`/crumbs`) carries the
  *same tree at the same depths* and declares by hand what `nav_mode: "path"`
  does in one word — `chrome_depth: 0` + `projection.path` — which is what
  the mode is made of. They were one chapter with both shapes in different
  branches, which read as inconsistency rather than as a choice.
- **`chrome_depth` caps the stacked chrome.** Every ancestor paints its own
  strip, so depth 4 shows three of them (on mobile they read as a vertical
  breadcrumb of backbars). `energy/north` leaves them stacked;
  `energy/south` declares `chrome_depth: 1` and shows one — compare
  `#/cards/energy/north/m1` with `#/cards/energy/south/m3`.
- **The tree ends at a `link`.** `energy/north`'s meters do not branch:
  they link to a (fake) timeranger and mount `C_DEMO_TRANGER_LINK`, which
  owns the url below them — `#/cards/energy/north/m1/series/kwh_total` is
  three levels of tree and two of data. Back walks out of the data space
  position by position before it walks up the tree.
- **The tree is a contract.** There is no reparent API on purpose: a published
  path is a url. `north` carries `aliases: ["hall1"]`, so
  `#/cards/energy/hall1/m1` still resolves and is rewritten to the canonical
  spelling; the root carries `tree_version`.
- **Declarative == dynamic.** The panel at `/cards` adds, removes and
  re-projects nodes on the LIVE tree through the same runtime API
  (`yui_node_add` / `yui_node_remove` / `yui_node_set_projection`) that
  `mt_create` feeds the declared `children` into. A node added at
  runtime is deep-linkable like any other, and removing the branch you
  are standing on lands you on the nearest living ancestor.

Driven by `_qa_nodetree.mjs` (drill-down, Back, deep link, dead path, the
runtime API and the projection swap) and `_qa_extra.mjs` (`chrome_depth` and
aliases) and `_qa_link.mjs` (the data-space boundary).

### `tree.html` — the root is a node

A second entry point, same bundle, served beside `index.html`. Its
`app_config_tree.json` declares **no `menu` at all**: the shell contributes the
space and `shell.tree` puts a `C_YUI_NODE` where the shell's own root used to
be. The left rail (desktop) and the bottom bar (mobile) are the root
projecting its children into zones; walk into any of them and the same gclass
keeps projecting, at any depth, down to a `link` and its data space.

The shell knows exactly one route, `/`. Everything else —
`#/energy/north/m2/kv/voltage_l1` — is subpath. Driven by `_qa_root.mjs`.

Keep both: while the model settles, the two navigation models must be
comparable in the same browser.

### A chapter's lead on a phone

The explanatory paragraph every chapter carries is three or four lines: free on
a desktop, the whole fold on a 360px screen — the reader would scroll past an
explanation to reach the thing it explains. `demo_lead.js` builds it as prose
from tablet up and an **ⓘ button** on mobile, which opens the standard adaptive
dialog (a sheet on a phone).

The button carries the i18n **key**, not the translated text, so the dialog
translates at open time and follows a language change. And the click is
delegated **once**, by `C_DEMO`: the affordance is app chrome, not a
per-chapter behaviour, so a dozen wrappers stay free of an event, an action and
a state apiece. Driven by `_qa_lead.mjs` in both viewports.

### Leaving a chapter is tested too

Every `C_DEMO_*` wrapper creates and starts a component as a pure child, so
every one of them must stop it in `mt_stop`: `gobj_destroy()` destroys the
children BEFORE `mt_destroy`, and destroying a RUNNING gobj is an error. That
stayed invisible while every chapter was `keep_alive` — the views were never
destroyed. The first `lazy_destroy` chapter (`/jsontree`) surfaced it at once.
`_qa_teardown.mjs` walks in and out of every chapter twice, so the way OUT is
covered as well as the way in.

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
| **JSON tree** (`/jsontree`) | `C_YUI_JSON` | The lazy JSON tree viewer, on a deliberately deep value: four characters of indentation per level and a guide line per ancestor, the same as the site map. The document arrives as `EV_SET_JSON` — the `json_data` attr only pre-fills the first render and leaves the machine in `ST_EMPTY`. Offline. |
| **JSON graph** (`/json`) | `C_YUI_JSON_GRAPH` | An arbitrary JSON value as a hierarchical G6 graph (objects/arrays as group nodes, scalars as typed rows). Publishes `EV_JSON_ITEM_CLICKED`. Offline. |
| **Wizard** (`/wizard`) | `C_YUI_WIZARD` | A multi-step wizard (title + "N / M" + Back/Next→Confirm). Steps via `EV_SET_STEPS`; publishes `EV_STEP_SHOWN` / `EV_WIZARD_DONE` / `EV_WIZARD_CANCEL`. Offline. |
| **Pager** (`/pager`) | `C_YUI_PAGER` | A drill-down page stack ("← title" header). Push pages with the button, pop with "←"; publishes `EV_PAGE_SHOWN` / `EV_PAGE_DISCARD` / `EV_PAGER_EXIT`. Offline. |
| **Map** (`/map`) | `C_YUI_MAP` (MapLibre) | A basemap with Spanish-city markers. Differs from the others: it renders into an external pre-sized `$map` (no `$container`). **Needs network** for the basemap tiles (`tiles.openfreemap.org`); offline it degrades to a blank map with controls. |
| **Treedb** (`/treedb`) | `C_YUI_TREEDB_TOPIC_WITH_FORM` | The real treedb topic table + its hosted `C_YUI_FORM` edit dialog, against an **in-memory backend**: the wrapper plays the `C_YUI_TREEDB_TOPICS` role (feeds `EV_LOAD_NODES`, answers `get_topic_data` for fkey options, applies and echoes the published `EV_CREATE/UPDATE/DELETE_RECORD`). Pkey follows the `form_mode` contract, fkeys are TomSelects fed with sibling-topic rows, the dict col edits as raw JSON. Offline. |
| **Modals** (`/modals`) | `shell_modals.js` helpers | The shell modal helpers, one button each: Promise-based icon-centric confirms (`yui_shell_confirm_ok/yesno/yesnocancel` — Enter answers the primary, Escape dismisses with the safe default) and auto-dismiss notifications (`yui_shell_show_info/warning/error`). Answers are echoed below the buttons. Offline. |
| **Windows** (`/windows`) | `C_YUI_WINDOW` + `C_YUI_WINDOW_MANAGER` | Floating windows (drag / resize / maximize / minimize) opted into the dock via their `manager` attr (`__window_manager__` service, created in `main.js`). The dock mounts **inline** into the card's `DEMO_WINDOWS_DOCK` strip (floating fallback while the strip isn't in the DOM). Open windows float over the other chapters; on mobile a window becomes a full-screen sheet. Offline. |

Components are self-contained: they follow the theme through
`yui_theme.js` (`<html data-theme>`, no service to ask) and reflow via
their own `ResizeObserver`. The legacy `__yui_main__` service those
paths used to require is gone from v2 — do not register one.

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
| `src/c_demo_modals.js` | the **Modals** chapter — the `shell_modals.js` confirms + notifications |
| `src/c_demo_windows.js` | the **Windows** chapter — `C_YUI_WINDOW`s + the `C_YUI_WINDOW_MANAGER` dock |
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
