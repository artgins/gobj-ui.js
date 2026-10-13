# CLAUDE.md

Guidance for Claude Code (claude.ai/code) when working in this repo.

## ⚠️ First step: read the yunetas CLAUDE.md

**Before doing anything in this repo, read the yunetas SDK's `CLAUDE.md`.**
This repo is normally checked out as the `kernel/js/gobj-ui` git submodule of
yunetas, so it lives at `/yuneta/development/yunetas/CLAUDE.md` (standalone
clone: `github.com/artgins/yunetas`, `CLAUDE.md` at the root). It carries the
framework-wide rules that also govern this codebase: always-braces, no silent
errors, gobj-js gotchas, JS GUI conventions (logical DOM class names, no
transitions, icon-only mobile buttons, Bulma `!important`, `yui_icons`), and
the two-line consumption model of this very repo. This file only adds the
gobj-ui-specific layer on top.

## A control without a name is a bug: `title` + `aria-label`, always

This library draws controls for six apps, so a control it leaves unnamed is
unnamed in all of them. Every `input`, `select`, `textarea`, `button` — or
anything that behaves as one — carries BOTH attributes, each through `t()` and
each with its key (`data-i18n-title`, `data-i18n-aria-label`), written where
the control is built. A floor, not a preference.

Two cases the rule reaches that no attribute can:

- **What a widget draws for itself** — Tabulator's header filters and its
  row-selection checkbox, Tom Select's box in front of the `<select>` it hides
  — is named AFTER the render, and again on every rebuild (`columnsLoaded`,
  `renderComplete`). A name written onto a widget's DOM is a race with the
  next render.
- **An `<option>`** is text like any other: `data-i18n`, with `value` kept
  explicit.

⚠️ **A key that arrives as a VARIABLE is invisible to a scan of the source**
— an unmarked `let`, a parameter, a computed string, a local alias of
`t()`. A `const` is followed, and so is a const table: `t(LABELS[x])` asks
the locales for every value of `LABELS`. Every consumer's
`validate-locales` reads the modules the app mounts, so two things keep the
keys of this library visible to it (since `7.26.28`):

- **A key handed to a FUNCTION is read where it is handed.**
  `I18N_KEY_FUNCTIONS` (`src/i18n_key_functions.js`) names every function that
  receives a key, and at which argument or property. At those positions the
  validator reads a string literal, or a `const` bound to one; DOM there (an
  array spec, `createElement2()`, `text_node()`, a const or a `let` only ever
  given one) is no key. A function that hands one of its parameters -- or what
  it reads from one -- to `t()`, an `i18n` / `code` / `data-i18n*` value or a
  key position of the table goes in the table, or what it is given is
  invisible again. Since `7.26.29` the test FINDS every such function and
  fails until it is there; one that nothing calls by name (an FSM action, a
  callback) marks what it hands on instead, and a path through a gobj's
  `priv` is no position.
- **A key handed by table or variable is PUBLISHED by its module**, in an
  exported `<NAME>_I18N_KEYS` array of literals that the validator reads and
  asks the locales for (only 17 of the 96 modules of `src/` publish one
  today: `grep -n '^export const [A-Z0-9_]*_I18N_KEYS' src/*.js`), and the
  call that hands it is MARKED `/* i18n: <NAME>_I18N_KEYS */`. What arrives
  as data no locale can list (a topic name, a backend's comment) is marked
  `/* i18n: data */`. A marked plain `let` is followed — every value it is
  given is asked for, and must be in the lists the marker names — and one
  that only ever holds literals fails (*"make it a const"*). Every key of
  every list is PINNED: a `COVERAGE` entry of `src/i18n_key_functions.test.js`
  derives the list from the module's source, or a marker check fails without
  the key, or the module reads it anyway; a key that only its list holds
  fails that test.

`src/i18n_key_functions.test.js` fails on an unmarked call that gives a key
position anything but a literal (or DOM), a `const` bound to one, or a key
position of the enclosing function handed on; on a translated text there,
`t("k")`, even marked (it is translated again and never changes language:
hand the key); and on a `data` marker over what the reader follows to keys
(a literal, a const or branch that is one, a call of a module function that
returns literals). Since `7.26.29` `validate-locales` holds an APP's own code
to the same rule, with the file and the line. It parses the sources and never
runs them; a locale is parsed and then imported, so its top-level code runs.
`acorn` is a dependency of this package since `7.26.29`, not a
devDependency: the published scripts need it at run time.

The full rule, with what does NOT count as a name, is in the README
("Conventions"). The check is not a grep: **dump `title`/`aria-label` from the
DEPLOYED DOM and switch language.**

## This repo in the yunetas ecosystem

- Two maintained lines: **`main`/v2** (declarative shell
  `C_YUI_SHELL/NAV/PAGER/WIZARD` — all new work lands here) and **`v1`**
  (frozen legacy stack, maintenance-only; hidraulia consumes the published
  npm `@yuneta/gobj-ui@^1.x` -- estadodelaire moved to v2 on 2026-10-13, and
  hidraulia is next).
- **Every app takes this package from the npm REGISTRY.** Since 2026-08-03
  there is no `file:` consumer left: wattyzer moved on 2026-07-25 and the
  in-repo `yunos/js/*` yunos (gui_agent, gui_treedb) followed, as did the
  three yunovatios GUIs. **So a local edit here reaches no app until it is
  published** — that is the whole point of the model, and it is the thing to
  remember when a change "does not show up": publish, then raise the range in
  each consumer. The **tarball** is therefore on the critical path, not just
  `dist/`: `files:` must keep shipping `src/`, `index.js` and the vite plugin,
  because v2 consumers import by specifier (`@yuneta/gobj-ui/src/*.js`).
- **`test-app/` is the exception, and that is what it is FOR.** It depends on
  `"@yuneta/gobj-ui": "file:.."` (and on gobj-js the same way), so it runs the
  working tree with no publish. Try a change there — `npm run dev` — before
  spending a version on it. It deploys to `demo.yuneta.io` (the public demo
  linked from doc.yuneta.io) and to `niyamaka.com` (the mobile-test host) with
  its own `deploy.sh`; both are the SAME bundle. Install it with npm 11: npm
  10.9 fails on its `file:` dependencies (`Cannot read properties of null
  (reading 'edgesOut')`, a bug of npm's peer resolution).
- **A published version reaches an app only through the deploy round, and the
  round is a command**: `npm run deploy-round`. It waits for the registry to
  SERVE the version (a publish returning is not that — a consumer installed in
  that window silently keeps the version before), then per app raises the
  range, installs, builds, deploys, and READS BACK the entry bundle each host
  serves. `--check` only reads back; `--only <name>` does one; `--no-wait`
  skips the registry.
  **The demo is built into the runner, not a line of its manifest**, and that
  is deliberate: it is the one surface that needs no registry (it consumes the
  working tree), so it falls outside the rhythm of the others and was skipped
  twice — a config nobody can forget to fill in is the fix. The other
  consumers are private repos, so they come from
  `~/.yuneta/gobj-ui-consumers.json` (see `scripts/gobj-ui-consumers.example.json`)
  and nothing about them is committed here.
- The yunetas submodule tracks `main`/v2. To ship: commit on the right branch
  here, `npm publish` when releasing, then **bump the `kernel/js/gobj-ui`
  submodule pointer in yunetas** (v2 only).
- This package installs its own copies of shared third-party libs (i18next,
  @antv/g6, maplibre-gl, tabulator-tables, tom-select, uplot,
  vanilla-jsoneditor) — consumers must `resolve.dedupe` them in their vite
  config or module-level singletons render blank.
- Validate any change with `npm install && npm run build && npm test`.
