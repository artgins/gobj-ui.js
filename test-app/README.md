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

### Content views (form & table)

Two chapters mount real data components instead of the placeholder view,
so the demo also shows what goes *inside* a stage:

| Chapter | Component | What it shows |
|---|---|---|
| **Form** (`/form`) | `C_YUI_FORM` (gobj-ui) | A declarative field template (text / number / **enum select** / checkbox), pre-filled with a record and editable via the component's own save/undo/clear toolbar. It publishes `EV_SAVE_RECORD` on save; the wrapper (`C_DEMO_FORM`) echoes the submitted values as JSON below the form. |
| **Table** (`/table`) | Tabulator | A data table built directly in the view (`C_DEMO_TABLE`) — the pattern the yunos use (e.g. gui_agent's node list). Sortable columns, a `%` formatter and a coloured-tag Status formatter; dark theme is handled in `demo.css`. |

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
