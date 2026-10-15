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

This library draws controls for seven apps, so a control it leaves unnamed is
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

**Every key must be visible to `validate-locales`** (`scripts/validate-locales.mjs`,
published with this package and run by every app's `prebuild`). A key reaches
`t()` -- or a key position of a function listed in `I18N_KEY_FUNCTIONS`
(`src/i18n_key_functions.js`) -- as a string literal or a `const` bound to one.
A key handed by table or variable is PUBLISHED by its module (`export const
<NAME>_I18N_KEYS = [...]`) and the call is marked `/* i18n: <NAME>_I18N_KEYS
*/`; data no locale can list is marked `/* i18n: data */`. A translated text is
never handed where a key is read. A function of this library that hands a
parameter on to a translator or a key position goes in the table; the table
test finds the ones missing.

**The rule in full is written ONCE, in the README** ("Conventions": *A control
without a name is a bug* and *i18n: a string must be able to CHANGE
language*): what the validator reads, what it refuses, the markers, the
`fallbacks` of the table, where it gives up (it fails, never silently), and
what stays invisible to it by decision. Change the rule there and only there;
this file and the yunetas `CLAUDE.md` used to carry copies, and the three
drifted apart every round. The check is not a grep: **dump `title`/`aria-label`
from the DEPLOYED DOM and switch language.**

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
  range -- and the app's own version, its third number, in the same edit (a
  new range is a new bundle, and an "About" that shows one number for five
  bundles names none of them) --, installs, builds, TESTS (the app's `npm
  test`, or the command its manifest entry names; red = not deployed),
  deploys, and READS BACK the entry bundle each host serves. Every step's
  output goes to the console as it comes (a warning of a step that exits 0
  was swallowed). A range it cannot raise safely -- not a `^` of the version's
  major, or an app version that is not x.y.z -- refuses the app instead of
  deploying it unraised. Every `package.json` of an app is checked before any
  is written, so a refusal leaves the app as it was; a range AHEAD of the
  version is refused (a stale sibling tree lowered it); a registry serving a
  newer version than the tree stops the round; a range found already raised
  raises the app's version unless the git history of its `package.json` shows
  the two moved together (a history it cannot read refuses the app). A TEMPLATE (`wattyzer/templates/js_gui`) is a target
  with no host: its ranges are raised and its `generate.sh --check` builds an
  app from it. `--check` only reads back; `--only <name>` does one;
  `--no-wait` skips the registry. The round commits nothing: each consumer's
  commit (and its CHANGELOG line, and a tag where the repo tags its versions)
  is made after it.
  **The demo is built into the runner, not a line of its manifest**, and that
  is deliberate: it is the one surface that needs no registry (it consumes the
  working tree), so it falls outside the rhythm of the others and was skipped
  twice — a config nobody can forget to fill in is the fix. **And it deploys only from a clean tree at
  `origin/main`** (7.26.55+), of this repo AND of the sibling `../gobj-js`,
  whose `src/` it bundles: a dirty or unpushed tree prints `NOT DEPLOYED`
  and the round exits 1. Commit and push both before the round; it has no
  option to skip the check. To deploy only the demo: `--only test-app`. The other
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
