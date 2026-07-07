# Changelog

`@yuneta/gobj-ui` — Yuneta UI library (v2 declarative shell on the GObject-JS
runtime). This file tracks the **v2 line** (`main`); the frozen v1 GClass GUI
stack is maintenance-only and versioned separately (`1.x`, npm dist-tag
`legacy`).

## 2.1.15

- **Developer monitor shows the automata + the console, not just traffic.** The
  dev window (`yui_dev.js`) mirrored only inter-event traffic. It now also
  captures every framework log line via gobj-js `set_log_callback` — `log_error`
  / `log_warning` / `log_info` / `log_debug` (and, since the FSM trace runs
  through `log_debug`, the **automata** `mach(...)` transitions when the Automata
  trace is on) — rendered inline in the same timeline, colour-coded by level
  (error red, warning amber, info blue, debug grey). Capture is armed with the
  window (`apply_dev_traces`) and no-ops while it is closed; log rows respect the
  search box (not the in/out/err traffic filters). Requires gobj-js with
  `set_log_callback`.

## 2.1.14

- **fix(treedb): inline error instead of a blocking modal when the schema
  (`descs`) fails to load.** `C_YUI_TREEDB_TOPICS` / `C_YUI_TREEDB_GRAPH` popped
  the app-wide `display_error_message` modal on any command `result < 0`,
  including a `descs` failure (the target is not a treedb, the user has no authz
  for it, or the backend is down) — wedging the whole SPA behind an empty tab. A
  `descs` failure now shows a non-blocking `.notification.is-danger` banner
  inside the view (`show_load_error`, reused so retries don't stack); every other
  command (nodes / create / update / delete — user-initiated) keeps the modal.
  Matters for the multi-backend TreeDB browser (gui_treedb), where a
  mis-configured / unauthorized treedb is a normal, recoverable case rather than
  a fatal app error.

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
