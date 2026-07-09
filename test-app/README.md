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
| `src/c_test_view.js` | the one view every leaf mounts; self-describes the active layout |
| `src/demo.css` | app-owned styling for the view card only (never shell chrome) |
| `vite.config.js` | resolves `@yuneta/gobj-js` and `@yuneta/gobj-ui` to local source |

## Extending it

- **Add a layout variant**: change a chapter's `submenu.render` (e.g.
  `{"right":"vertical"}` instead of `submenu`) and reload.
- **Add a component view**: point a leaf's `target.gclass` at any gclass
  exposing a `$container`. If it imports a shared third-party lib
  (i18next, @antv/g6, uplot, …), add that lib to `resolve.dedupe` in
  `vite.config.js` — see the note there.

Copyright (c) 2026, ArtGins. All Rights Reserved.
