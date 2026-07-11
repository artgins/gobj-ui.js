# Changelog

`@yuneta/gobj-ui` — Yuneta UI library (v2 declarative shell on the GObject-JS
runtime). This file tracks the **v2 line** (`main`); the frozen v1 GClass GUI
stack is maintenance-only and versioned separately (`1.x`, npm dist-tag
`legacy`).

## Unreleased

- **feat(icons): add `yi-circle-info`, `yi-triangle-exclamation` and
  `yi-circle-exclamation`** to `yui_icons.css` (the info/warning/error
  glyph family). test-app gains a **Modals** chapter (`/modals`)
  exercising every `c_yui_main.js` volatil-modal helper — the blocking
  questions (`get_yesnocancel`/`get_yesno`/`get_ok`) and the typed
  info/warning/error messages — echoing each answer.
- **fix(main): volatil modals close on Escape.** The blocking dialogs
  built by `display_volatil_modal` (`get_yesnocancel` / `get_yesno` /
  `get_ok`, info/warning/error messages) now treat Escape as cancel:
  it clicks the cancel/x affordance when present (keeping the callback
  semantics) and just dismisses a buttonless modal. The listener runs
  in capture phase and only on the top-most open modal, so Escape
  handlers beneath (e.g. the treedb edit dialog's, added in 2.4.0)
  don't also fire — pressing Escape repeatedly could stack a second
  confirm on top of the first. Theming needed no change: the confirm
  already follows light/dark (the earlier "white in dark" report was
  two stacked modal-background overlays dimming a light page).

## 2.4.0

- **fix(form): hosted third-party widgets follow the app theme.** The
  JSON editor (`vanilla-jsoneditor`) was hardcoded to `jse-theme-dark` —
  a black block inside a light form; the class is now set from the app
  theme (explicit `<html data-theme>`, or the OS scheme when absent) at
  field-build time. tom-select (fkey fields) shipped light-only colors —
  pure white in dark theme; a new `c_yui_form.css` maps its control,
  items and dropdown to Bulma CSS vars, so one rule set follows both
  themes. The JSON editor accent color also maps to `--bulma-link`.
  Readonly inputs (e.g. the pkey in update mode) now render visually
  muted instead of looking editable.
- **feat(treedb): edit/create dialog UX.** The dialog title states the
  operation: `new <topic>` on create, `<topic> — <pkey>` on update
  (was the bare topic name in both). Escape closes the dialog through
  the same unsaved-changes guard as the X. On update, focus lands on
  the first editable field instead of the readonly pkey. The Tabulator
  pagination chrome (page-size selector + First/Prev/Next/Last) hides
  while all rows fit in one page — the row-count footer stays.
- **fix(treedb): table toolbar is at most 2 rows on mobile.** Bulma
  `.buttons` wraps internally, stacking the toolbar into 3 rows on
  narrow phones. The record-buttons group now stays on one line and
  scrolls horizontally if it overflows (same distribute-or-scroll
  pattern as the nav icon-bar), so the toolbar is 1 row when
  everything fits and exactly 2 when it doesn't.
- **fix(nav): icon-bar distributes when items fit, scrolls when they
  don't.** `.yui-nav-iconbar` items were `flex: 1 1 0`, so a menu with
  many first-level entries crushed them into the viewport width instead
  of overflowing — on mobile part of the menu was unreachable. Items are
  now `flex: 1 0 auto` (grow to share spare width, never shrink below
  content) and the bar gets `overflow-x: auto`; `justify-content` moves
  from `space-around` to `flex-start` (with overflow, `space-around`
  clips the leading items past the left edge), labels are `nowrap`.

## 2.3.1

- **chore(deps): upgrade `vanilla-jsoneditor` 0.23.8 → 3.12.0.** The
  developer window no longer uses the JSON editor, so the only consumer
  left is `C_YUI_FORM` (dict/blob/list fields in the treedb dialog). The
  upgrade needs a single code change — the constructor moved from
  `new JSONEditor(...)` to the `createJSONEditor(...)` factory (v1.0.0);
  every prop/method we use (`readOnly`, `onChange`, `timestampTag`,
  `.get()`, `.set()`, the `{json}`/`{text}` content shape, the dark-theme
  CSS path) is unchanged. Svelte 5 is bundled (no consumer peer dep); no
  `--jse-*` overrides in the tree. Consumers must bump their own
  `vanilla-jsoneditor` range to `^3.12.0` in lockstep (the constructor is
  gone from 0.23.x). test-app gains an **About** dialog (avatar menu)
  showing the gobj-ui / app / bundled-JSON-editor versions.

## 2.3.0

- **feat(treedb): table headers retranslate on a live language switch.**
  `C_YUI_TREEDB_TOPIC_WITH_FORM` now renders each column title through a
  `titleFormatter` that emits a `<span data-i18n="<col>">` (only for
  translatable columns), so the `refresh_language(document.body)` a host
  runs on a language toggle retranslates the Tabulator headers in place —
  no table rebuild, no per-view event wiring. Untranslated columns keep
  their schema header (same header fallback as the form cascade).

- **feat(form): `C_YUI_FORM` labels use the table-header i18n cascade.**
  New `topic_name` attr: field labels now resolve `'<topic>.<col>' ->
  '<col>' -> header (the same `col_label` cascade the treedb table uses),
  keyed by the shared col id via `label_i18n` so a column translates
  identically in the form and the table (before, the form keyed labels by
  the raw header, so e.g. a table showing translated headers had an
  English form). The treedb host passes `topic_name`; plain templates
  (no topic) fall back to the field name/header unchanged.

- **fix(form): `register_c_yui_form()` is idempotent.** Since the treedb
  host auto-registers `C_YUI_FORM`, an app that ALSO registers it
  explicitly (wattyzer does) logged a red `GClass ALREADY created:
  C_YUI_FORM` on load; the register now returns early if the gclass
  already exists (order-independent).

- **feat(treedb): `C_YUI_TREEDB_TOPIC_WITH_FORM`'s edit/create dialog is
  now a hosted `C_YUI_FORM`** — final step of the single-form
  consolidation: the ~1000-line embedded modal form (its own field
  builder, get/set/clear/validate, form modes, fkey select2, jsoneditor
  wiring) is deleted; the dialog builds a fresh `C_YUI_FORM` child per
  open (schema pruned to editable cols + pkey, fkey options collected
  from the parent's `get_topic_data` — so new parent rows always appear,
  fixing the stale-options bug of the built-once modal) and destroys it
  on close. The form's bottom toolbar acts as the dialog footer; the
  dialog X honours unsaved changes via the `EV_WINDOW_TO_CLOSE` contract
  (confirm before discarding — an old TODO). `EV_SAVE_RECORD` from the
  child arrives already in treedb shape and is routed by its `form_mode`
  to the published `EV_CREATE_RECORD`/`EV_UPDATE_RECORD` (rowid pkeys
  keep the append-on-edit semantics); the close is deferred out of the
  publish stack (never destroy the publisher synchronously). External
  contract unchanged (same input/output events, same `get_topic_data`
  dependency); `register_c_yui_treedb_topic_with_form()` auto-registers
  `C_YUI_FORM` if the app didn't. Row copy/paste keeps its own
  table-level transforms.
  To make the hosted form reach parity, `C_YUI_FORM`'s `jsoneditor` tag
  is now real: it instantiates vanilla-jsoneditor (dark theme,
  timestamp tags, `onChange` → dirty tracking) — before, the div was
  created but no editor ever attached — and free-form `dict`/`object`
  and `array`/`list` cols route to it (values wrapped/unwrapped as
  editor Content), replacing the previous dead ends (an always-empty
  fieldset / a zero-column tabulator); structured `template` and
  `table` flags keep their fieldset/tabulator widgets.
  The test-app gains a **TreeDB chapter**: the real topic gclass against
  an in-memory backend (the view answers `get_topic_data` and echoes
  the published record events back as the backend broadcast), covering
  table render, edit/create dialogs, fkey selects, raw-JSON dict
  editing, unsaved-changes guard and delete.

- **feat(form): `C_YUI_FORM` renders fkey fields and gains create/update
  form modes** — second step of the single-form consolidation (the treedb
  stack's modal form duplicated both features; they now live in the one
  form engine). New attrs:
  - `fkey_options` ({topic_name: [ids or {id} records]}): the host supplies
    the linkable parent rows — the form never queries the backend or its
    parent gobj. fkey cols render as a TomSelect (single pick when the col
    real_type is string, multi for dict/list); values decode from and
    encode to canonical refs "topic^id^hook" (`build_fkey_ref`), riding the
    fkey mapping now carried by gobj-js `field_desc` (needs gobj-js >
    7.7.2). Options are read at build time.
  - `form_mode` ("" | "update" | "create") + `pkey` (default "id"):
    update = pkey readonly; create = pkey editable + required (rowid pkeys
    stay readonly). Applied at build and on every `EV_LOAD_RECORD`; empty
    mode keeps the template-declared behaviour (backward compatible). The
    hardcoded `id` special-cases (clear_data, with-focus) now honour
    `pkey`. Hosts route EV_SAVE_RECORD reading `form_mode` from the src
    gobj.
  Robustness fixes uncovered by the blank create flow: `set_form_values`
  detects an empty record with `Object.keys` (the old `record.length`
  never matched an object) and coalesces `undefined` to `null` so DOM
  value setters never print "undefined"; the native `select` and
  `checkbox` widgets now tag the real control (not their wrapper) as the
  data input — a `role`-style native select was rendering/saving blank —
  and both emit `EV_RECORD_CHANGED` for dirty tracking. The test-app Form
  chapter grows `department`/`teams` fkey fields, an `id` pkey and an
  update/create toggle exercising the whole flow.

- **feat(form): `C_YUI_FORM` action toolbar moved to a horizontal bottom
  bar.** The vertical right-hand toolbar (90px column) is replaced by a
  bottom row — save/undo/clear on the left, copy/paste on the right — the
  first step of the single-form consolidation (C_YUI_FORM becomes the only
  form engine; the modal form inside `C_YUI_TREEDB_TOPIC_WITH_FORM` will be
  replaced by a hosted C_YUI_FORM next). The container switches to a column
  flex (form grows and scrolls, toolbar pinned below); buttons keep the
  icon-always/label-`is-hidden-mobile` convention and now carry
  `title`/`aria-label`. On mobile the bar costs ~42px of height instead of
  90px of width; it wraps (`flex-wrap`) if the host is narrower than the
  button set. DOM contract unchanged (`.yui-toolbar-form`, `.button-save`,
  `.button-undo`).

- **docs(test-app): runnable nav-layouts demo under `test-app/`.** The
  `test-app/` promised by `SHELL.md` §9 now exists: a backend-less Vite app
  that showcases every `C_YUI_NAV` layout on one screen — `vertical`,
  `icon-bar`, `tabs`, `submenu`, `cards` (section-index) + `backbar`,
  `drawer` and `accordion` — plus the per-zone responsive model (same primary
  menu as a left rail on desktop and a bottom icon-bar on mobile), decorative
  `header`/`divider` grouping, the `keep_alive`/`lazy_destroy` lifecycle
  contrast, all four toolbar action types, and a light/dark toggle. All
  navigation is declared in `test-app/src/app_config.json`; each leaf mounts
  `C_TEST_VIEW`, which names the active layout(s) on screen. Two extra
  chapters mount real content components — a **Form** (`C_YUI_FORM` with a
  declarative field template incl. an enum select, an editable record and the
  component's save/undo toolbar, echoing `EV_SAVE_RECORD` as JSON) and a
  **Table** (a Tabulator data table built in the view, with column formatters
  and an app-owned dark theme). `main.js` initialises the shared i18next
  instance and `vite.config.js` dedupes the full shared-lib set, so the form's
  module-level `t()` renders labels instead of blank (the canonical gobj-ui
  dedupe footgun). An `ES/EN` toolbar toggle publishes `EV_TOGGLE_LANGUAGE`;
  `C_DEMO` flips i18next and `refresh_language(document.body, t)` repaints
  every `[data-i18n]` node — nav labels, toolbar, view titles/leads and the
  hosted `C_YUI_FORM` fields/buttons all switch en/es together (English is the
  source; `locales.js` holds the `es` bundle; views translate their own DOM on
  build). Additional chapters mount the rest of the demoable gobj-ui
  components inside a stage, each behind a tiny `C_DEMO_*` wrapper:
  **Chart** (`C_YUI_UPLOT`), **Gobj tree** (`C_YUI_GOBJ_TREE_JS` — the yuno's
  own live gobj tree), **JSON graph** (`C_YUI_JSON_GRAPH`), **Wizard**
  (`C_YUI_WIZARD`), **Pager** (`C_YUI_PAGER`) and **Map** (`C_YUI_MAP`,
  MapLibre — the only one needing network, for basemap tiles). A minimal
  `__yui_main__` service (`C_DEMO_MAIN`) supplies the `EV_RESIZE` the map's
  legacy lineage looks up. TreeDB component views are omitted (they need a
  live treedb backend). `SHELL.md` §9 was updated to describe the shipped app.
  Run: `cd test-app && npm install && npm run dev`.

- **feat(shell/nav): section-index landing (`submenu.index`) + "cards" nav
  layout.** A primary menu item may declare `submenu.index: true` (or
  `{stage: "<stage>"}`): its own route then becomes a real resting,
  deep-linkable route that mounts the submenu as a grid of tappable cards
  (`C_YUI_NAV` layout `"cards"`) in the stage, instead of redirecting to the
  default child. List → detail pattern: tap a card to open the view, browser
  back (or re-tapping the primary item) returns to the index — the landing is
  universal (all breakpoints). Opt-in per submenu:
  sections that don't declare `index` keep the redirect-to-default behaviour
  unchanged; an explicit inline `target` on the item wins over `index`, and
  `submenu.default` becomes inert for sections that opt in.
  `yui_shell_set_submenu()` keeps a mounted index view and the synthesized
  target in sync with the new items. New pure helpers with colocated tests:
  `nav_cards_helpers.js` (card/grid descriptors), `shell_section_index.js`
  (target synthesis).

- **feat(shell/nav): tabs and cards never coexist (index sections) + mobile
  "backbar".** DRY of navigation for `submenu.index` sections: while the
  index is on stage the whole secondary zone collapses (cards ARE the
  navigation — showing the tab strip too duplicated it, on every
  breakpoint); inside a child view the tab strip renders only `>=tablet`,
  and on mobile a new `C_YUI_NAV` layout `"backbar"` — a single
  `← <section>` link back to the index — takes its place. Defaults derive
  from `submenu.index` alone (no consumer config change); override with an
  explicit `show_on` on the submenu render, `index: {backbar: false}`, or
  `index: {backbar: {show_on}}`. Sections without `index` keep their tabs
  on every breakpoint, unchanged. New nav attrs: `show_on` (breakpoint
  visibility classes, re-applied on rebuild) and `back_route`. Plan logic
  in `secondary_nav_renders()` (`shell_section_index.js`, unit-tested).

## 2.2.6

- **fix(shell): mobile nav active item now matches the desktop rail.** The
  bottom icon-bar (`.yui-nav-iconbar`, shown `<desktop`) painted the active
  item as blue *text* on a faint `--bulma-link-light` tint — a low-contrast
  "blue on blue" that diverged from the desktop vertical rail, which uses a
  solid `--bulma-link` background with `--bulma-link-invert` (white) text. The
  icon-bar active/selected rule now uses the same solid-blue background +
  white text, so the primary menu looks identical across breakpoints.

## 2.2.5

- **fix(treedb): topic tables attach Tabulator by ELEMENT, not `#id`
  selector.** `c_yui_treedb_topic_with_form` created its Tabulator with
  `new Tabulator("#<table_id>", …)`, which requires the element to be in
  the DOCUMENT already — a view whose container wasn't mounted yet crashed
  ("Tabulator Creation Error - no element found" followed by an uncaught
  `externalEvents is null` in the `.on()` wiring), and a stale duplicate id
  elsewhere in the page could shadow the right element. The element is now
  resolved inside the view's own `$container` (matching `c_yui_form`'s
  existing element-attach) and its absence is a logged error, not a crash.

## 2.2.4

- **fix(window): `resolve_manager` writes `null` (not `undefined`) when the
  `manager` service name doesn't resolve** — no more "attr undefined: manager"
  error noise from `gobj_write_attr`.
- **fix(window): `on_close` no longer fires on an aborted close.** It was
  invoked before the `abort_close` check, so a host's close side effect ran
  even when a subscriber (e.g. a form with invalid fields) kept the window
  open. It now runs only when the close actually proceeds (including the
  warning-confirmed path).
- **fix(window): drag/resize `pointerup` guards against a window destroyed
  mid-gesture** (e.g. dock ✕ → `EV_CLOSE_WINDOW`): listeners are removed
  first, then the handler bails on `gobj_is_destroying` before writing attrs
  on a dead gobj.
- **fix(wm): dock root carries the `C_YUI_WINDOW_MANAGER` gclass tag class**,
  matching the Inspector-tagging convention of every other gclass root.
- **fix(wm): dock chips respond to the keyboard.** The chip advertised
  `role="button" tabindex="0"` but had no keydown handler; Enter/Space now
  trigger the same restore/minimize action as a click (Space prevents page
  scroll).
- **fix(dev): log/automata auto-scroll is container-local and respects
  scrollback.** `scrollIntoView` scrolled every scrollable ancestor (moving
  the host page) and yanked the view to the bottom while reading history;
  appends now set `scrollTop` on the logger itself, and only when the user
  was already at/near the bottom.

## 2.2.3

- **fix(packaging): `@yuneta/gobj-js` peer/dev range bumped `^7.3.4` →
  `^7.7.0`.** Since 2.1.15 `yui_dev.js` imports `set_log_callback` and
  `gobj_set_trace_machine_format`, which only exist in gobj-js ≥ 7.7.0; a
  consumer resolving gobj-js 7.4–7.6 satisfied the declared range but failed
  at import time (missing named export). No code changes.

## 2.2.2

- **fix(shell): remove the previous view's `$container` on `lazy_destroy`.**
  The shell appends a view's `$container` to the stage on mount
  (`build_view_gobj`), but the `lazy_destroy` exit path only
  stopped/destroyed the gobj — a view that doesn't remove its own container
  in `mt_destroy` leaked a hidden copy in the stage on every revisit, and
  any fixed DOM id inside it shadowed the fresh instance's (e.g. a
  Tabulator attached by `#id` selector built its table inside the stale
  hidden container, so the visible view showed no table). The shell now
  removes the container symmetrically after `gobj_destroy`; views that
  already self-remove are unaffected.

## 2.2.1

- **fix(dev): Copy export no longer prints `undefined` for log rows.** The dev
  monitor's *Copy* button serializes the visible timeline (`traffic_to_text`),
  but mirrored log/automata entries (`kind: "log"`) have no `event`/`kw`, so
  every one of them exported as `⇢ undefined` with an empty payload. They now
  serialize as `<ts> <level>: <text>`, matching what the panel shows.

## 2.2.0

Requires gobj-js **7.7.0** (`set_log_callback`, `gobj_set_trace_machine_format`,
`trace_json` routed to the log sink).

- **Developer monitor: full console + automata, not just traffic.** The dev
  window (`yui_dev.js`) now captures every framework log line via gobj-js
  `set_log_callback` — `log_error` / `log_warning` / `log_info` / `log_debug`
  (and, since the FSM trace runs through `log_debug`, the **automata** `mach(...)`
  transitions when the Automata trace is on) — rendered inline in the same
  timeline, colour-coded by level (error red, warning amber, info blue, debug
  grey). Capture is armed with the window (`apply_dev_traces`) and no-ops while
  closed; a re-entrancy guard prevents recursive capture; log rows respect the
  search box (not the in/out/err traffic filters).
- **"Simple mach" — compact automata view.** A Traces chip toggles the FSM trace
  between verbose (`mach(gclass^name), st:…, ev:…, ac:…, from(…)` + return line)
  and a compact one-liner `🔄 EVENT dst STATE from src` (no return line),
  mirroring the C kernel's `trace_machine_format` via
  `gobj_set_trace_machine_format`. Persisted (`dev_automata_simple`). Nesting
  stays tab-indented (`pre-wrap` preserves the framework's `tab()`), so it reads
  like the C console.
- **Event payloads (kw) in the monitor.** At Automata level 2 the FSM dumps the
  event `kw` via `trace_json`, now routed through the log sink and rendered as a
  purple-tagged `JSON` row, pretty-printed (capped at 4k) next to the transition
  that dumped it — instead of console-only. Traffic entries already showed their
  kw as folding bullets; this brings the same visibility to the automata.
- **fix(treedb): inline error instead of a blocking modal on a `descs` failure.**
  `C_YUI_TREEDB_TOPICS` / `C_YUI_TREEDB_GRAPH` popped the app-wide
  `display_error_message` modal on any command `result < 0`, including a `descs`
  failure (the target is not a treedb, the user has no authz for it, or the
  backend is down) — wedging the whole SPA behind an empty tab. A `descs` failure
  now shows a non-blocking `.notification.is-danger` banner inside the view
  (`show_load_error`, reused so retries don't stack); every other command
  (nodes / create / update / delete — user-initiated) keeps the modal. Matters
  for the multi-backend TreeDB browser (gui_treedb), where a mis-configured /
  unauthorized treedb is a normal, recoverable case rather than a fatal app
  error.

## 2.1.13

- **fix(shell): lighter dialog backdrop.** The adaptive dialog's `.modal-background`
  used Bulma's default 0.86 scrim, which blacked out the page behind a popup.
  Drop it to `rgba(10,10,10,0.4)` — dims for focus without hiding the context.

## 2.1.12

- **feat(shell): standardized adaptive dialog for single "window / popup" views.**
  `yui_shell_show_modal` gained an opt-in `dialog: true` (+ `title`, `t`) mode: a
  centered card with the close **X at the top-right** on desktop, and a
  **full-screen sheet with a back arrow at the top-left** on mobile (≤768px, the
  shell-wide breakpoint). A header bar carries the title and both dismiss
  controls; CSS shows the right one per breakpoint and both call `close()`, so the
  app's `on_close` still owns navigation (typically `history.back()`) — gobj-ui
  stays routing-agnostic. Styles live in `c_yui_shell.css` (`.yui-dialog*`).
  Consumers: gui_agent About, wattyzer About + Connection.

## 2.1.11

- **fix(dev): "attr undefined: manager" when opening the Developer window without
  a window manager.** `setup_dev` created the `C_YUI_WINDOW` with
  `manager: gobj_find_service("__window_manager__", false)`, which is `undefined`
  in apps that don't register a manager (e.g. wattyzer) — and an `undefined` attr
  value logs `attr undefined: manager` in gobj-js. Coerce to `null` (`|| null`) so
  it reads as "no dock". Harmless before (the window still worked), just noisy;
  gui_agent was unaffected because it registers `__window_manager__`.

## 2.1.10

- **feat(dev): Copy button.** The Developer monitor's control bar gained a **Copy**
  action (new **Log** group, beside **Clear**) that copies the currently-visible
  traffic to the clipboard — it honours the active filters/search, so you get
  exactly what's on screen. Each entry is a header line (time · direction · title ·
  event/command) followed by its pretty-printed payload. Insecure-context fallback
  included; the button flashes "Copied".
- **feat(dev): Expanded view + section toggles.** New **Expanded** option in the
  **View** selector renders each message's payload as fully-expanded pretty JSON in
  a `<pre>` (nothing folded, unlike Detailed's collapsible tree). When Expanded is
  active, an **Expand** group appears with **Schema / Data / Metadata** toggles that
  filter the payload's top-level sections (`schema`, `data`, and the `__…__`
  metadata markers) — schema off by default (rarely wanted), data on, metadata off.
  Choices persist like the other view prefs.

## 2.1.9

- **feat(window): configurable dock placement.** `C_YUI_WINDOW_MANAGER` gained a
  `dock_mode` attr — `floating` (default, the legacy detached bar pinned to a
  corner via `dock_corner`), `inline` (a full-width taskbar row mounted inside a
  layout container named by `inline_selector`), or `responsive` (floating on wide
  viewports, inline on narrow ones per `responsive_query`, default
  `max-width: 768px`). Responsive watches a `matchMedia` and re-homes the dock
  when the breakpoint flips (listener torn down in `mt_destroy`). The inline host
  resolves lazily at placement time, so a shell built after the manager starts is
  handled gracefully — the dock falls back to floating-hidden until its zone
  exists, then re-homes on the first window register / breakpoint change. Motive:
  on mobile the floating bar covered the app's bottom menu; inline mode lets it
  live above the menu instead. CSS split into a shared base + `.yui-dock--floating`
  (+ corner classes) + `.yui-dock--inline` (flat, full-width, no shadow).
- **feat(table): global Tabulator theme fixes.** New `src/tabulator.css` collects
  the cross-app Tabulator styling — the dark-theme tree-control repaint (Tabulator
  hardcodes the +/- box to `#333`, invisible on a dark wash) and a reusable
  active-row highlight `.tabulator-row.yui-row-active` (green wash + left accent,
  theme-aware). Tabulator is a first-class element across the yunos, so these live
  in the library rather than duplicated per app. Import after `tabulator_bulma.css`.

## 2.1.8

- **fix(window): minimize now actually hides the window.** `minimize_entry`
  set `element.style.display = 'none'` (inline, no `!important`), but the window
  container carries Bulma's `is-flex` helper (`display: flex !important`), which
  won the cascade — so clicking minimize did nothing (the `EV_MINIMIZE_WINDOW`
  event reached the manager and ran, but the window stayed visible). Hide with
  `setProperty('display','none','important')` and restore with
  `removeProperty('display')`. (Close/maximize were unaffected — they never
  touch `display`.) Diagnosed from a live FSM trace.

## 2.1.7

- **fix(window): self-healing dock.** `C_YUI_WINDOW_MANAGER` now re-attaches
  its dock element to `document.body` whenever a window registers, if the dock
  got detached (e.g. a shell that replaced `document.body`'s children after the
  dock was first mounted at startup). Without this, minimizing a window sent it
  to a dock that was no longer in the DOM — the window vanished with no visible
  chip to restore it. (Minimize routing itself is verified end-to-end.)

## 2.1.6

- **feat(window): per-type icon on the dock chip.** C_YUI_WINDOW gained an
  `icon` attr (a `yi-*` class name or inline SVG) that travels in
  `EV_REGISTER_WINDOW`; the dock chip renders it in place of the status dot
  (minimized state is still conveyed by the dimmed chip). The Developer monitor
  registers with `yi-terminal`. Windows without an icon keep the green/grey dot.

## 2.1.5

- **feat(window): dock bottom-left + per-chip close.** The window-manager dock
  now anchors bottom-left (was bottom-centred). Each dock chip gained a **✕**
  that closes its window from the taskbar: the chip sends the window a new
  `EV_CLOSE_WINDOW` event, running the same teardown as the title-bar close
  (publish `EV_WINDOW_TO_CLOSE`, `on_close`, stop/destroy) → `EV_UNREGISTER_WINDOW`
  removes the chip. The chip became a `div` (role=button) hosting the label +
  close button; the label area still toggles minimize/restore.

## 2.1.4

- **feat(window): C_YUI_WINDOW_MANAGER — dock / taskbar.** New light gclass
  (`register_c_yui_window_manager`, exported from `index.js`) that registers
  open windows and renders a theme-aware dock strip (one chip per window,
  green dot = visible, grey = minimized, blue = active/raised). C_YUI_WINDOW
  opts in via a new `manager` attr (a gobj or a service name) plus a `title`
  attr for the chip: on create it REGISTERs, on destroy UNREGISTERs, its
  **minimize** button sends the window to the dock (instead of shading in
  place), and any pointer press FOCUSes it (raise z-order + highlight chip).
  Clicking a chip is a taskbar toggle (restore+focus / minimize). The manager
  never owns window lifecycle — it only toggles `$container` display/z-index;
  closing stays the window's own ✕. Orthogonal to C_YUI_PAGER (they compose:
  a window may host a pager). Wired into gui_agent: a `__window_manager__`
  service is created at startup and the Developer monitor opts in. Without a
  manager, C_YUI_WINDOW minimize falls back to the self-contained shade.

## 2.1.3

- **feat(window): redesigned C_YUI_WINDOW chrome + mobile sheet.** The window
  title bar dropped the saturated Bulma `has-background-info` blue with forced
  black text for a neutral, **theme-aware** bar (`--bulma-scheme-main-bis` /
  `--bulma-text-strong`, injected once via `ensure_window_style`). The
  max/close pair became a proper window-control cluster in crisp inline SVG
  (`currentColor`): **minimize** (rolls the window up to its title bar — a
  self-contained "shade", `showMin` attr), **maximize/restore** (glyph swaps
  with state), **close** (red on hover). Below the Bulma mobile breakpoint
  (≤ 768 px) a window is now a **full-screen sheet**: fills the viewport, no
  border-radius/shadow, drag and resize disabled, larger tap targets, maximize
  hidden. Only consumer today is the Developer monitor, so blast radius is that
  window. C_YUI_WINDOW and C_YUI_PAGER stay orthogonal (floating chrome vs
  page-stack) and compose; a window-manager/dock is a possible next step.

## 2.1.2

- **feat(dev): Developer window is now a yuno monitor.** `yui_dev.js` was
  reworked from a raw traffic dumper into a control/monitoring/audit console
  around a bounded in-memory buffer (last 600 messages), so view and filter
  changes repaint instantly from memory and reopening the window restores
  history:
  - **View selector (persistent):** `Detailed` (folding bullet payload),
    `Compact` (one line + inline summary), `Name only` (event name + time).
    The last choice is saved (`dev_view_mode`).
  - **Filters:** per-direction chips (outgoing / incoming / errors), a
    free-text search over event + command + payload, and a **Hide periodic**
    toggle that folds away recurring chatter — events matching
    `PERIODIC|TIMEOUT|HEARTBEAT|PING` or any signature seen ≥ 5 times (polls,
    heartbeats) — so the async detail is not drowned out. Off by default;
    all persistent (`dev_hide_periodic`, `dev_filter_*`).
  - **Per-event mute (persistent):** hover ⊘ on any entry to silence that
    event/command signature; muted signatures show as removable chips
    (`dev_muted_events`).
  - **Stateful trace toggles + live stats strip:** trace chips light up when
    active (Automata shows its level); a footer strip shows shown/total,
    per-direction counts, hidden count and total bytes.
  - Theme-aware chrome; the whole console moved into the window **body** (the
    C_YUI_WINDOW header/footer are single-row) with a title in the header.

## 2.1.1

- **feat(dev): bullet traffic log.** The Developer window's traffic view
  (`yui_dev.js` `info_traffic`) no longer instantiates one `vanilla-jsoneditor`
  per inter-event message — a heavy tree editor that forced a dark theme and
  read poorly as a log. Each message now renders as a compact bullet entry:
  a one-line header (direction arrow ⇢/⇠/⚠, bold event name, size, time) over a
  direction-coloured accent bar, with the `kw` as a folding bullet list —
  scalars inline and type-coloured, objects/arrays collapsed (`<details>`) so
  metadata and nested payloads stay folded until clicked. Timestamp fields get
  an ISO annotation; long strings are clipped (full text on hover). Theme-aware
  via `<html data-theme>`. Shared by both the legacy `C_YUI_WINDOW` (`setup_dev`)
  and the modal (`build_dev_panel`); `vanilla-jsoneditor` is dropped from this
  file (still used by the treedb/form gclasses).

## 2.1.0

- **feat(shell): runtime nav API.** `C_YUI_SHELL` can now mutate its navigation
  at runtime: dynamic submenu items (`yui_shell_set_submenu`), per-tab state
  and a tab close affordance (`EV_NAV_ITEM_CLOSE`). Enables consumers to build
  data-driven tab sets (e.g. one tab per selected item) on top of the static
  `app_config.json` menu.
- **feat(inputs): `attach_clear()`.** Reusable helper
  (`src/yui_inputs.{js,css}`, exported from `index.js`) that adds a Bulma
  `.delete` clear (✕) button to any `.control` wrapping an `<input>`, shown
  only while the field has content; clears, refocuses and dispatches a
  synthetic `input` event on click. Its CSS scopes under `.control.has-clear`
  so it wins over Bulma's `.delete` regardless of stylesheet load order.
- **feat: gclass-root debug classes.** Each gclass root container is tagged
  with its `GCLASS_NAME` class (and the non-`$container` roots too), and the
  `$root`/`$layout` refs were unified to `$container` — a consistent DOM hook
  for debugging and CSS.
- **feat(icons): `yi-terminal` glyph.** FontAwesome 6 free-solid "terminal"
  (`>_` prompt) added to `yui_icons.css`, for CLI/console affordances.
- **refactor: source layout.** Moved sources under `src/` to mirror the v1
  layout; the package exports map resolves `./src/*`.

## 2.0.0

- Initial **v2** line: the declarative shell stack
  (`C_YUI_SHELL` / `C_YUI_NAV` / `C_YUI_PAGER` / `C_YUI_WIZARD`) on top of the
  legacy GObject-JS runtime. Consumed locally (via a `file:` dependency) by
  wattyzer and the in-repo `gui_agent`/`gui_treedb` yunos. The frozen v1 stack
  (`C_YUI_MAIN` / `WINDOW` / `TABS` / `ROUTING` + TreeDB editors + charts/maps)
  remains available as `@yuneta/gobj-ui@^1.x` on the npm registry.
