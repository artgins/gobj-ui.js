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
  (frozen legacy stack, maintenance-only, with no consumer left: the last
  two apps moved to v2 on 2026-10-13 and 2026-10-15).
- **Every app takes this package from the npm REGISTRY.** Since 2026-08-03
  there is no `file:` consumer left: the first application moved on
  2026-07-25 and the in-repo `yunos/js/*` yunos (gui_agent, gui_treedb)
  followed, as did the other applications. **So a local edit here reaches no app until it is
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
  its own `deploy.sh` (the node that serves them comes from the environment:
  `DEMO_SSH_HOST=<node> ./deploy.sh`); both are the SAME bundle. Install it
  with npm 11: npm
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
  the two moved together (a history it cannot read refuses the app). A TEMPLATE (the `gui/` of yunetas' project templates,
  `utils/c/yuno-skeleton/skeletons/project_base/gui`) is a target with no
  host: its ranges are raised and `check_project_gui.sh` builds an app from
  it. `--check` only reads back; `--only <name>` does one;
  `--no-wait` skips the registry. The round commits nothing: each consumer's
  commit (its `package.json` AND its `package-lock.json`, which the install
  rewrites -- every app commits its lockfile since 2026-10-22, except the
  demo, see below --, its CHANGELOG line, and a tag where the repo tags its
  versions) is made after it.
  **The demo is built into the runner, not a line of its manifest**, and that
  is deliberate: it is the one surface that needs no registry (it consumes the
  working tree), so it falls outside the rhythm of the others and was skipped
  twice — a config nobody can forget to fill in is the fix. It is the one
  app with NO lockfile in git, on purpose (`test-app/.gitignore` lists
  `package-lock.json`): its gobj-ui and gobj-js are `file:` links to the
  working trees, which a lockfile cannot pin, and the lockfile would change
  with every version of either. **And it deploys only from a clean tree at
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

## The v2 line, version by version: what each round taught

Moved here from the yunetas `CLAUDE.md` on 2026-11-22 (it had grown past the
instruction-file limit there). It is the history of this repo, and its lessons
are about this code: G6, touch gestures, toolbars. The four framework
contracts that came out of the 7.23.x round (how a host retires a hosted
child) stay in the yunetas `CLAUDE.md`, because they govern every gclass that
hosts a child, not only this library's. The full detail of every version is in
`CHANGELOG.md`.

**`main`** (the v2 line, tag `2.0.0`+) is the line of active development:
the declarative shell (`C_YUI_SHELL/NAV/PAGER/WIZARD`; the
legacy stack `C_YUI_MAIN/TABS/ROUTING` was removed from this line in `3.0.0`).
Every npm-published release is git-tagged (backfilled 2026-07-17); `4.0.0`
carries five BREAKING contract changes, and `5.0.0` is a **dependency-only
major** (no API moved) that raises the peer floors — gobj-js `>= 7.8.7`,
`maplibre-gl ^6.0.0` (ESM-only), i18next `^26.3.6`, tom-select `^2.6.2`,
vanilla-jsoneditor `^3.13.0`. `6.0.0` is another dependency-only major (peer
floor gobj-js `^7.13.2`, for the qualified pkey); `6.1.x` added
`C_YUI_SCHEMA_EDITOR`, the schema editor the agent console's Schemas
workspace lands on, and made the schema view's node click opt-in
(`with_node_click`) after 6.1.1 published it under hosts that never asked;
`6.2.x` lets a `C_YUI_NODE` tree remember where each child was left
(`remember_position`), so a strip of children stops behaving like a row of
tabs that forgets; `6.3.0` gives `C_YUI_TREEDB_TOPICS` a `source_url` it
prints in its toolbar, because a tab labelled with a treedb name does not
say which BACKEND that treedb is on; `6.3.x` stops the schema diagram
rescaling itself the moment it appears and turns its arrowheads round to
land on the parent's hook, where the `.c` literal and the `↖` of the fkey
mark put them. `7.0.0` is a third dependency-only major, raising the
`maplibre-gl` floor to `^6.4.1` — where `DOM.sanitize` stops skipping the
attribute after each one it removes. `7.1.x`–`7.10.x` is the treedb GUI
round: the topic table gets per-column filters, a column chooser, a CSV
export and in-place editing of a writable scalar; the graph gets a find box,
a topic-colour legend and a minimap, and opens a treedb nobody has arranged
in `dagre` instead of a diagonal pile; a topic can be pulled a PAGE at a
time (`with_remote_paging`, needs the SDK's paged `nodes`); and a delete
finally says what it takes with it, which with `force` is every child
UNLINKED. `7.11.x`-`7.14.x` adds the shared row-selection facility
(`yui_table_select.js`: a tri-state parent checkbox, a selection bar, and
bulk removal, taken by the treedb topic table behind `with_selection_bar`),
gives a schema column drag an Undo, and sizes the schema editor's controls
like controls instead of `is-small`. `7.15.x`-`7.19.x` is the graph round
(multi-selection, `1:1` in place of a house, the camera saying its zoom) and
the URL-as-position round. `7.20.x`-`7.23.x` is the JSON viewer: it reads
the same document three ways — the lazy tree, the raw text, and a graph —
and the three graphs of the library (`C_G6_NODES_TREE`,
`C_YUI_JSON_GRAPH`, `C_YUI_GOBJ_TREE_JS`) end it speaking ONE toolbar
vocabulary, built in `yui_graph_camera.js`. `7.23.9` makes those same three
graphs OPERABLE on a touch screen — pinch, a long press that opens the
context menu, touch-sized targets behind `(pointer: coarse)`, and the two
floating toolbars folded behind one button on a narrow container — which
cost two facts about G6 that its documentation does not carry: **it never
reads the DOM's `contextmenu` event** (it synthesises the event from
`pointerdown` with `button === 2`, so a long press reaches the plugin on no
platform), and **`@antv/g` re-issues pointer ids mid-gesture**, so a
two-finger gesture tracked by `pointerId` — which is how G6's own
`PinchHandler` tracks it — loses a finger halfway. Read `event.touches`.
`7.23.10` is the treedb graph's edition mode, and its lesson is one line:
**a G6 behavior's `enable` REPLACES the default, it does not add to it** —
the edition `drag-canvas` was given one so it would stand aside for Shift,
which silently dropped G6's `targetType === 'canvas'` test, so every drag of
a card panned the canvas as well as moving the card. Two more in the same
place: the history plugin was tied to a MOMENT of the load rather than to
the mode (so Undo was dead whenever edition was entered from the mode
selector, while Save still lit), and G6's `brush-select` keeps the
`selected` state itself — rewriting every element's state on every canvas
click, behind the gclass that owns the selection. `7.23.11` gives that
graph's multi-selection a way in for a finger: both its gestures hang off
Shift, so Shift becomes a **mode** in the edit toolbar (a tap picks, a
canvas drag is the band, panning stands aside while it is on) — a button
rather than a heuristic, because a gesture cannot be two things and the
toolbar has to say which one the graph is listening for. New consumer i18n
key `selection mode`, added in the five locale dirs. `7.23.12` makes that
toggle look PRESSED instead of wearing one of the toolbar's palette colours
(new `set_pressed_state()`): each of those names a KIND of action, so a
STATE painted with one of them put undo/redo's violet on the button next to
undo. `7.23.13` makes that graph's two SELECTS speak the app's language:
they rendered their raw names (`reading`, `edition`, `dagre`) in every
language because neither went through `t()` at all — and translating an
`<option>` means setting its `value` explicitly, or the FSM is told to enter
a mode called *"Edición"*. `7.23.14` is the one that lets a FINGER move a
node at all, and both halves are worth knowing: G6 puts `touch-action:
none` on its canvas and **nothing** on its HTML nodes, so a drag that began
on a card was a page scroll (two `pointermove`s, then `pointercancel`, the
node stopped ~20px in); and a long press fired on a TIMER cannot arbitrate
a gesture, because when it fires the gesture is not over — the press is
decided at the RELEASE now (moved → drag, still and quick → the element's
action, still and held → the menu), with the same 10px slop G6 gives its
own `dragstartDistanceThreshold`. A third thing hid behind those two:
`click` is not taken from the DOM either — `@antv/g`'s `onPointerUp`
synthesises one — so swallowing the DOM click never stopped the element's
own action. `7.23.15` gives that press its only feedback: a 15ms haptic
tick at the 500ms mark, a NOTICE rather than the decision — a finger that
buzzes and then carries the node away still gets its drag. `7.23.16` is a
one-line CSS fix with a lesson worth keeping: **a `yui_toolbar()` alone in
its row cannot show this class of bug.** Nothing competes for the width, so
nothing shrinks — and the moment a pinned control shares the row, the
toolbar's `min-width: auto` (its CONTENT minimum, because its sections are
`flex-shrink: 0`) makes it refuse to shrink, so it is pushed out of the row
and the arrow at its right edge lands outside whatever clips the view. Test
a shared row, not a bare one.
