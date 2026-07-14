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

### i18n: a string must be able to CHANGE language, not just be translated once

Passing a string through `t()` is **not** enough. `refresh_language()` only
re-translates a node that **carries its key**, so anything a view composed with
`t()` at render time stays in the old language for the rest of its life. Three
shapes, and the fix for each:

| Shape | Symptom | Fix |
|---|---|---|
| Text built with `t()` | never changes language | `i18n` / `data-i18n` on the element (`["span", {i18n: "rows"}, t("rows")]`) |
| A composed string (`` `${key} · ${t(mode)}` ``) | carries no key at all | split it: the translatable halves get their own key. (Note `createElement2` **trims** text nodes — space a `·` separator with CSS, not with spaces.) |
| `title` / `aria-label` set with `t()` | tooltip stuck in the old language | `data-i18n-title` / `data-i18n-aria-label` |
| Anything a WIDGET renders (a Tabulator header, its paginator, a formatter) | drawn once; no attribute reaches it | subscribe to the shell and re-render (below) |

**The contract.** The app owns the locales: it switches its i18next and calls

```js
yui_shell_language_changed(shell);   // c_yui_shell.js
```

which re-translates the document and publishes **`EV_LANGUAGE_CHANGED`**. Any
view that builds DOM imperatively subscribes to its shell (`yui_shell_of(gobj)`)
and re-renders in the ACTION — a language change is an OS notification like any
other, so it crosses the FSM, never a raw `i18next.on("languageChanged")`.

**Tabulator** renders its own chrome (the paginator, the placeholder, the
loading/error notices) and it never went through i18n. Use:

```js
new Tabulator($el, {...settings, ...yui_tabulator_lang(t)});   // at build
yui_tabulator_relocalize(table, t);                            // on the event
```

Every key falls back to the English string Tabulator used to render
(`defaultValue`), so an app that defines none of them sees no change. Two traps
the implementation already handles: `setLocale()` with the locale name already
in force is a **no-op** (hence a fresh name per switch), and re-applying a locale
makes Tabulator re-run a title formatter on the EXISTING header cell, which
**appends** to it — rebuild the columns from their definitions.

**A missing key is invisible:** i18next answers an unknown key **with the key
itself**, so it renders (lower-case English) and simply never changes language.
A **duplicate** key in a locale file is silent too — an object literal keeps the
last one. Both are caught by the apps' `scripts/validate-locales.mjs`, which
also scans the gobj-ui modules the app mounts: **the library translates through
the APP's i18next**, so every key it asks for must be defined by the app.

### Dates: never hand-roll them again

Every date UI in the projects had grown its own copy of the same two things —
"epoch → the local wall clock" and "what are the bounds of this week" — and the
copies disagreed (one rendered UTC, another local; one closed a range on the
next bucket's first instant, another on its last). Both now live here, and
nothing else should.

**`yui_time.js` — the pure half** (no DOM, no dependency):

- `epoch_to_local_input` / `local_input_to_epoch` / `fmt_epoch` / `epoch_to_ms`
  / `ms_to_epoch` — every conversion crosses the producer's unit flag
  (`ms`: seconds unless a topic's `system_flag` says milliseconds).
- `period_bounds` / `period_shift` / `period_start` / `period_label` /
  `infer_period` / `is_current_period` — the algebra of **periods**.

A period is **`(unit, count)`**, not a name from a fixed list:

```js
{id: "quarter",  unit: "month",  count: 3}    // and semester is count 6,
{id: "bimester", unit: "month",  count: 2}    // bimester 2, decade year×10,
{id: "15min",    unit: "minute", count: 15}   // …
```

so an app that reports by quarter DECLARES a quarter — it does not ask for a new
component. `YUI_PERIODS` is the catalog of the named ones; anything an app
invents labels itself by its own edges (`1 jul – 31 aug 2026`).

Three invariants worth knowing before touching it:

- **Buckets are aligned**, never counted back from now: months to the year (so
  2/3/4/6/12 fall on calendar boundaries), weeks to Monday (ISO), hours to local
  midnight. A window that ends at `now` is a **rolling** window (`YUI_ROLLING`),
  a different animal — it has no previous, and its upper end stays **open**.
- **The upper bound is inclusive** — the bucket's last millisecond, not the next
  one's first. Both ends of a match condition are inclusive, and an exclusive end
  handed to one silently swallows the record that landed on the boundary.
- **Stepping is calendar arithmetic**, never `+86400000`: a DST day is 23 or 25
  hours long, and `31 jan + 1 month` is february, not "3 march".

**`C_YUI_PERIOD` — the UI half**: a granularity strip + `‹ label › >|` + a
calendar on the label (day / month / year grid, chosen by the granularity's own
unit). It publishes `EV_PERIOD_CHANGED {mode, anchor, from, to}` and mirrors
`from`/`to` in read-only attrs, in the consumer's unit, `0` = unbounded. Modes
that cannot be walked (`span`, `custom`, a rolling window) live in `ST_FLAT`, so
an arrow arriving there fails loudly. `with_custom` reveals a `$custom` slot the
HOST fills (its own from/to inputs): the component shows and hides it with the
mode, the host owns what is in it. Reference consumer: the Rows options of
`gui_treedb`'s `C_TRANGER_VIEW`; live demo in `test-app` (chapter **Period**).

The library asks the APP's i18next for its keys, so a consumer must define them
(`day`, `week`, `quarter`, `today`, `week {{n}}`, `quarter {{n}} {{y}}`,
`previous period`, …) — copy the block from `test-app/src/locales.js`, which is
the complete one: it is the only consumer that declares every mode, `rolling`
included (`last 24h`, `last 7 days`), and a missing key is **invisible** —
i18next answers it with the key itself.
The picker subscribes ITSELF to the shell's `EV_LANGUAGE_CHANGED` (its labels
are composed at render time), so a host has nothing to forward — a host that
forwards the event anyway just repaints it twice, harmlessly. All Intl
formatting (month names, weekday initials, the parked-bucket label) follows
i18next's ACTIVE language, not `navigator.language` — the calendar never mixes
scripts with the UI around it.

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
