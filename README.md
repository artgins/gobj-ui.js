# gobj-ui — Yuneta UI Library

Reusable GUI components for Yuneta GClass front-ends: a declarative shell
(`C_YUI_SHELL`/`NAV`/`PAGER`/`WIZARD`), floating windows
(`C_YUI_WINDOW`/`WINDOW_MANAGER`), TreeDB editors, charts and maps. The
legacy GClass GUI stack (`C_YUI_MAIN`/`TABS`/`ROUTING`) was removed from
this line in `3.0.0` — the frozen v1 npm line still ships it.

Published as `@yuneta/gobj-ui`. Built on top of [`@yuneta/gobj-js`](https://github.com/artgins/gobj-js).

## Two maintained lines

This repository carries **two parallel lines** with different layouts and
consumers. They are independent snapshots (no shared git ancestry):

| Line | Branch | Tag | Layout | Consumed by | How | Status |
|------|--------|-----|--------|-------------|-----|--------|
| **v2** | `main` | `2.0.0`+ | `src/` subdir | **wattyzer** | local `file:` dep on the yunetas submodule | active development |
| **v1** | `v1` | `1.0.0` | `src/` subdir | **estadodelaire**, **hidraulia** | published npm `@yuneta/gobj-ui@^1.0.0` | frozen, maintenance-only |

- **v2 / `main`** is the active development line: the declarative shell
  (legacy-stack-free since `3.0.0`). It is embedded as a git submodule in **yunetas** at
  `kernel/js/gobj-ui`, and **wattyzer** consumes that checkout as a `file:`
  dependency (`@yuneta/gobj-ui` → `../../../yunetas/kernel/js/gobj-ui`),
  importing by package specifier (`@yuneta/gobj-ui/src/*.js`, exports map
  `"./src/*"`; the `index.js` barrel and the vite plugin stay at the package root).
- **v1 / `v1`** is the frozen legacy-only stack (the declarative shell is not on
  this line). It is **published to npm**; estadodelaire and hidraulia depend on
  `@yuneta/gobj-ui@^1.0.0` from the registry. Land only maintenance fixes here,
  then `npm publish` a new `1.x`.

All new feature work lands on `main`/v2.

## Usage

```bash
# v2 (active): clone yunetas with submodules; wattyzer picks it up via file:
git clone --recurse-submodules <yunetas>
git submodule update --init kernel/js/gobj-ui      # yunetas tracks main/v2

# v1 (frozen): consumers just install the published package
npm install @yuneta/gobj-ui@^1.0.0
```

Edit v2 from the yunetas `kernel/js/gobj-ui` checkout, commit on `main` in this
repo, then bump that submodule pointer in yunetas. For v1, work from a `v1`
checkout and publish.

## Build & test

```bash
npm install
npm run build      # vite -> dist/ (ES/CJS/UMD/IIFE, min + non-min)
npm test           # vitest (v2/main only; v1 has no test target)
```

`dist/` is gitignored. v1 consumers get `dist/` from the **published** npm
tarball; v2 (wattyzer) imports source files by specifier. Rebuild `dist/` to
validate and before publishing a v1 release.

## Conventions

### Logical class names on important DOM blocks

When a gclass builds DOM, tag its elements so the tree is self-describing in
the browser Inspector:

- **Root of the view:** the `GCLASS_NAME` class **plus** a logical card name,
  e.g. `class="C_AGENT_CONSOLE CONSOLE_CARD view-card"`.
- **Every meaningful child** (status line, response panel, input row, input,
  button, list…) gets a logical class **prefixed by the view/feature name**:
  `CONSOLE_STATUS`, `CONSOLE_COMMENT`, `CONSOLE_RESPONSE`, `CONSOLE_INPUT_ROW`,
  `CONSOLE_INPUT`, `CONSOLE_EXEC`, …

**Casing: `UPPER_SNAKE`, exactly like the gclass names** — `CONSOLE_COMMENT`,
never `console-comment`. CSS/styling classes stay lowercase (`view-card`,
`is-size-7`), so in a `class` attribute the case alone tells the two
namespaces apart: **uppercase = logical block name, lowercase = styling**.
Keep the existing Bulma/utility classes and **prepend** the logical name(s).

**Logical names are independent of whatever CSS class names each app uses.**
They form their own namespace: they identify blocks, they don't style them,
and they are tied to no CSS framework or app stylesheet. Each app keeps its
own styling classes alongside them — restyling or swapping the CSS layer never
renames a logical class, and adding a logical class never requires a CSS rule.

**Why:** a bare `<pre class="is-size-7 mb-2">` is unidentifiable in devtools —
you can't tell it's "the comment line". These are primarily debug aids, but
they **may** double as real CSS hooks; styling them is fine when useful.

#### Naming a window / modal from the app: `logical_class`

The library's own chrome carries its block names — a window is tagged
`WINDOW_HEADER` / `WINDOW_CONTROLS` / `WINDOW_MIN` / `WINDOW_MAX` /
`WINDOW_CLOSE` / `WINDOW_BODY` / `WINDOW_FOOTER` / `WINDOW_RESIZE`, a modal
`MODAL` / `MODAL_BACKDROP` / `MODAL_CONTENT` / `MODAL_HEADER` / `MODAL_BACK` /
`MODAL_TITLE` / `MODAL_CLOSE` / `MODAL_BODY`, a confirm `CONFIRM*` and a toast
`TOAST*`.

Those names identify the *kind* of block, not the *instance*: every window in
the app is a `C_YUI_WINDOW`, every popup is a `MODAL`. To target **one**
exactly, the caller passes its own name:

```js
gobj_create_service("keys", "C_YUI_WINDOW",
    {logical_class: "TRANGER_KEYS_WINDOW", ...}, gobj);

yui_shell_show_modal(shell, $box,
    {logical_class: "TRANGER_KEYS_SHEET", dialog: true, ...});

yui_shell_confirm_yesno(shell, msg, {logical_class: "...", ...});
```

It lands on the root element, alongside `C_YUI_WINDOW` / `MODAL` / `CONFIRM`.

Copyright (c) 2024-2026, ArtGins. All Rights Reserved.
