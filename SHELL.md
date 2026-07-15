# `C_YUI_SHELL` + `C_YUI_NAV` — Declarative shell

Application-level presentation and navigation system for Yuneta GUIs.
Replaced the legacy `C_YUI_MAIN` + `C_YUI_ROUTING` pair (removed in
`3.0.0`; the frozen v1 npm line still ships them) with a couple of
GClasses driven by a JSON document in the Yuneta configuration style.

- Built with **Vite** (same as the rest of `gobj-ui`).
- Backed by **Bulma** (`.menu`, `.tabs`, `.level`, `.navbar`,
  `is-hidden-*` helpers). No JS framework is introduced; everything is
  DOM + GObj.
- Designed to be folded into `libyui` once validation is complete.

---

## 0. Philosophy — declarative first

The shell is the practical expression of a wider Yuneta-side stance:
**apps describe what they want; the framework decides how to paint
it.**

  1. **The application declares** in `app_config.json`: zones, menus,
     toolbar items, view bindings, breakpoints, hover tooltips.
  2. **`gobj-ui` materialises** the DOM and owns *all* CSS for shell
     chrome (toolbar, drawers, dropdowns, navs).  Apps do not poke
     into the shell's elements; they do not ship media queries that
     target shell selectors.
  3. **Imperative helpers are escape hatches** — `yui_shell_set_avatar_provider`,
     `yui_shell_refresh_avatars`, `yui_shell_close_dropdown`, etc.
     They exist for the cases the declarative shape can't reach
     (e.g. host-owned data like the user's initials).  They are not
     the default path.

When you reach for a feature, climb this ladder in order:

  a. Can it be expressed by extending the JSON contract (a new field
     or a new `type`/`action.type` value)?  Do that.
  b. If not, can a small public helper in `gobj-ui` cover it without
     leaking DOM details to the host?  Add the helper.
  c. Touching app DOM/CSS directly is a last resort and signals a
     gap in (a) or (b) that should be filed back upstream.

The reverse migration is the litmus test: every time wattyzer or
another consumer can delete an `install_*()` patch or a CSS selector
keyed on `data-toolbar-item-id`, the shell got better at its job.

---

## 1. Goals

1. **Declarative**: the screen split and the menu tree are described in
   a JSON document, not in imperative JavaScript.
2. **Per-zone responsive**: be able to say *"the primary menu lives in
   `left` on desktop and in `bottom` on mobile"* without duplicating the
   menu definition or breaking the panels' internal state.
3. **Two-level navigation**: primary options + sub-options, mapped to
   hash routes (`#/primary/secondary`).  Apps that need a third level
   of grouping inside the secondary use `type:"header"` / `type:"divider"`
   decorative items (§3.5) — visual chunking without a third nav level.
4. **Pluggable per-zone rendering**: the same menu option must be able
   to render differently depending on where it lands (vertical icon +
   label in `left`; icon-over-label in `bottom`; horizontal tabs in
   `top-sub`; vertical list in `right`; etc.).
5. **Each view is a gobj with its own `$container`**: the shell does
   not know what is inside — it just mounts it, shows it, and hides
   it. Navigating means *"show a gobj in its zone and hide the one
   that was there"*.
6. **Per-option lifecycle**: `eager` / `keep_alive` / `lazy_destroy`,
   to balance the cost of rebuilding against RAM usage.
7. **No regressions on `gobj-ui`**: existing components were left
   untouched while the shell proved itself.  (Historical constraint:
   once every consumer had migrated, `C_YUI_MAIN` / `C_YUI_ROUTING` /
   `C_YUI_TABS` were removed in `3.0.0`.)

---

## 2. Model

Three orthogonal concepts:

- **Layer** — Z-stacked plane (full-screen). Defined planes:
  - `base` — main layout (zones).
  - `overlay` — off-canvas drawer, large dropdowns.
  - `popup` — tooltips / context menus.
  - `modal` — blocking dialogs.
  - `notification` — toasts.
  - `loading` — global spinner.
- **Zone** — region inside `base`. There are 7 fixed zones laid out on
  a CSS grid:
  ```
  +-------------------- top --------------------+
  |      | +------- top-sub --------+ |        |
  | left | |......... center .......| |  right |
  +----------------- bottom-sub ----------------+
  +------------------- bottom ------------------+
  ```
  `top-sub` bands the **content column** (above `center`), not
  the full width: on desktop the secondary nav (tabs) does not
  overlap the `left` primary menu, which keeps full height. On
  mobile `left`/`right` are hidden and collapse to 0, so
  `top-sub`/`center` span the whole width. `bottom-sub` and
  `bottom` remain full-width rows (unchanged).
  A zone can *host* (`host`) a menu, a toolbar, or a *stage*. It is
  hidden per breakpoint via the `show_on` operator.
- **Stage** — zone marked as a container of routed gobjs. The most
  common one is `main` mounted on `center`. There can be several
  (e.g. a `right` configured as a stage for an independent detail
  panel).

### What goes in each zone

| Zone         | Typical use                                            |
|--------------|--------------------------------------------------------|
| `top`        | fixed toolbar (logo, theme, language, user)            |
| `top-sub`    | submenu rendered as `tabs` on mobile                   |
| `left`       | primary menu rendered as `vertical` on desktop         |
| `center`     | primary **stage**: active gobj                         |
| `right`      | submenu as `vertical` on desktop, or a secondary stage |
| `bottom-sub` | secondary toolbar or tabs on mobile                    |
| `bottom`     | primary menu rendered as `icon-bar` on mobile          |

### The navigation tree vs. the route index

People say *"the route tree"*, but that name hides that there are **two
distinct artifacts**, joined by the `route` string:

1. **The navigation tree** — declarative, hierarchical, lives in
   `app_config.json`. This is the part that is actually a *tree*:
   `menu.<id>` → `items[]` → (optional) `submenu` → `items[]`. Fixed at
   **two routable levels** (see §3.3 / §3.5).
2. **The route index** — flat, built at runtime. On startup the shell
   *flattens* the navigation tree into a `Map`:
   `"/path"` → `{ item, parent_item, target, stage, menu_id }`. This is
   what `yui_shell_navigate()` / `hashchange` looks up. It is **not** a
   tree — it is a lookup table (see §4 step 1).

The `route` (`"/dash/ov"`) is **not the destination**. It is the
flattened key that links a tree node to its index entry and to the URL
hash. The destination is `target → gclass` mounted on a `stage`.

```
NAVIGATION TREE  (config, hierarchical)        ROUTE INDEX  (runtime, flat)
─────────────────────────────────────          ───────────────────────────
app_config.json
└─ menu
   ├─ primary
   │  ├─ "dash"  route:/dash   (container, ─┐
   │  │          no target)                 │  /dash        → target:∅
   │  │  └─ submenu                          │                 (redirects to
   │  │     ├─ "ov"     /dash/ov  ───────────┼─► /dash/ov     → C_TEST_VIEW
   │  │     │           target,stage:main    │                  @main keep_alive
   │  │     └─ "alerts" /dash/alerts ────────┼─► /dash/alerts → C_TEST_VIEW
   │  │                 target,stage:main    │                  @main lazy_destroy
   │  └─ "settings" /settings ───────────────┼─► /settings    → C_TEST_VIEW
   │                 target,stage:main       │                  @main keep_alive
   └─ quick
      └─ "q-ov" route:/dash/ov  ─────────────┘  (same key → same index
                                                 entry → reuses the one
                                                 instance, no duplicate)
```

Runtime resolution of one navigation:

```
click ─► EV_NAV_CLICKED{route} ─► lookup route in the route index
                                     │
                     ┌───────────────┴────────────────┐
               target is ∅                       gobj already
               (container)                       mounted in stage?
                     │                                 │
            redirect to 1st child          yes ─► reuse ($container.show)
            or submenu.default             no  ─► gobj_create(target.gclass)
                                                  in target.stage, start
                                                  │
                                       EV_ROUTE_CHANGED{route,item,stage}
```

Terminology used in this document:

| Loose name        | What it actually is                          | Precise term         |
|-------------------|----------------------------------------------|----------------------|
| "the route tree"  | `menu.*.items[].submenu` in the config       | **navigation tree**  |
| "the routes"      | the flat `route → {...}` `Map` at runtime    | **route index**      |
| "open a route"    | `route → target → gobj @ stage`              | **mount / binding**  |

Orthogonal to all of the above are **zones** (CSS grid regions) and
**stages** (zones that host routed gobjs) — they share the `shell`
config block but are not part of the navigation tree.
`C_YUI_PAGER` / `C_YUI_WIZARD` are **outside** the tree as well: they
are stacked navigators a view mounts *inside* its own stage; they have
no entry in the route index (see §6).

---

## 3. Configuration JSON

Minimal schema:

```json
{
  "shell": {
    "zones":  { ... how zones are used ...   },
    "stages": { ... which stages exist ...   }
  },
  "menu": {
    "primary": { "render": { ... }, "items": [ ... ] }
  },
  "toolbar": { "zone": "top", "items": [ ... ] }
}
```

### 3.1 `shell.zones`

Each zone may declare:

- `host`: which content it receives. Values:
  - `"menu.<id>"` — render that menu in this zone.
  - `"stage.<name>"` — the zone is a stage for routed gobjs.
  - `"toolbar"` — the zone hosts the toolbar defined under `toolbar`.
- `show_on`: Bulma breakpoint expression. Accepted forms:
  - `"mobile"`, `"tablet"`, `"desktop"`, `"widescreen"`, `"fullhd"`
  - `">=desktop"`, `"<tablet"`, `"<=tablet"`, `">mobile"`, `">fullhd"` (→ ∅)
  - Combinable with `|`: `"mobile|tablet"`, `">=desktop|mobile"`

The shell translates the expression into a set of **custom CSS classes**
that hide the zone per breakpoint. Bulma only ships "up-to" helpers
(`is-hidden-tablet`, `is-hidden-desktop`) — to be able to say *"hidden
only on tablet"* `gobj-ui` adds these classes in `c_yui_shell.css`:

| Class                          | Hidden when                 |
|--------------------------------|-----------------------------|
| `.yui-hidden-mobile`           | `<769 px`                   |
| `.yui-hidden-tablet-only`      | `769–1023 px`               |
| `.yui-hidden-desktop-only`     | `1024–1215 px`              |
| `.yui-hidden-widescreen-only`  | `1216–1407 px`              |
| `.yui-hidden-fullhd`           | `≥1408 px`                  |

No classes outside this table are expected in `show_on`. The parser is
pure and is covered by `tests/shell_show_on.test.mjs` (`npm test` in
`gobj-ui/`).

Example:

```json
"zones": {
  "top":     { "host": "toolbar",        "show_on": ">=tablet" },
  "left":    { "host": "menu.primary",   "show_on": ">=desktop" },
  "bottom":  { "host": "menu.primary",   "show_on": "<desktop"  },
  "top-sub": { "host": "menu.secondary", "show_on": "<desktop"  },
  "right":   { "host": "menu.secondary", "show_on": ">=desktop" },
  "center":  { "host": "stage.main" }
}
```

> The same primary-menu option is instantiated twice (in `left` and in
> `bottom`) and shown/hidden via CSS. This avoids moving DOM nodes when
> crossing breakpoints, which would break their internal state.

### 3.2 `shell.stages`

```json
"stages": {
  "main": { "zone": "center", "default_route": "/dash/ov" }
}
```

- `zone` — host zone (must exist).
- `default_route` — initial route when the hash is empty.

A stage is inferred automatically when a zone declares
`"host": "stage.<name>"`, so `shell.stages` may be omitted when there
is only one main stage named `main` in `center`.

### 3.3 `menu.<id>`

```json
"primary": {
  "render": {
    "left":   { "layout": "vertical", "icon_pos": "left", "show_label": true },
    "bottom": { "layout": "icon-bar", "icon_pos": "top",  "show_label": true }
  },
  "items": [ ... ]
}
```

- `render[zone]` — how the menu is rendered when it appears in `zone`.
  - `layout`: `vertical` | `icon-bar` | `tabs` | `drawer` | `submenu` |
    `accordion`.
  - `icon_pos`: `left` | `right` | `top` | `bottom`.
  - `show_label`: boolean.
  - Shortcut: in `submenu.render` the bare layout string (`"tabs"`) is
    accepted instead of an object.
- `items[]` — options.

### 3.4 `toolbar`

**Cheatsheet — three orthogonal axes per item:**

| Axis | Field | Values | Effect |
|---|---|---|---|
| Form | `type` | `"brand"` · `"avatar"` · `"connection"` · *omitted (action)* | Renderer kind |
| Behaviour | `action.type` | `"navigate"` · `"drawer"` · `"event"` · `"dropdown"` | What the click does |
| Secondary | `context_action` | same shape as `action` | Right-click (contextmenu) behaviour |
| Visibility | `show_on` | `">=tablet"` · `"<desktop"` · `"*"` · ... | Per-item breakpoint |

- **`type:"connection"`** — a small status dot reflecting the backend
  connection. The host drives the state with
  `yui_shell_set_connection_state(shell, bool)` (event-driven setter,
  not a pull provider like avatar): call it `true` on `EV_ON_OPEN`,
  `false` on `EV_ON_CLOSE`/transport errors. CSS owns the look
  (`.yui-toolbar-conn.is-connected` / `.is-disconnected`). Optional
  `action` (left-click) and `context_action` (right-click) honored —
  e.g. right-click to open a dev panel.
- **`context_action`** (any item kind) — optional secondary action
  fired on right-click (`contextmenu`, `preventDefault`ed). Same
  object shape and `action.type` set as `action`.

Compose freely — `type:"avatar"` + `action:{type:"dropdown",items:[…]}`
is the canonical user menu.  Dropdown sub-items reuse the same
`action.type` set (no nested dropdowns).  Brand items render as a
passive `<div>` when `action` is omitted (focus-skipped, no click);
include an `action` (typically `navigate`) to make the brand
clickable.  Avatar items ignore `icon` and `name` — the badge text
comes from the host-registered provider; use `aria_label` for the
menu label.

```json
"toolbar": {
  "zone": "top",
  "aria_label": "App toolbar",
  "items": [
    { "id": "burger", "icon": "icon-menu",
      "show_on": "<desktop",
      "aria_label": "Open menu",
      "action": { "type": "drawer", "op": "toggle", "menu_id": "quick" } },
    { "id": "brand",  "type": "brand",
      "logo": "/wattyzer-mark.svg", "wordmark": "Wattyzer",
      "action": { "type": "navigate", "route": "/welcome" } },
    { "id": "home",   "icon": "icon-home",  "name": "Home",
      "action": { "type": "navigate", "route": "/dash/ov" } },
    { "id": "search", "icon": "icon-search",
      "show_on": ">=tablet",
      "action": { "type": "event", "event": "EV_OPEN_SEARCH" } },
    { "id": "user",   "type": "avatar",  "align": "end",
      "aria_label": "User menu",
      "action": {
        "type": "dropdown",
        "items": [
          { "id": "profile",  "name": "My profile", "icon": "icon-user",
            "action": { "type": "navigate", "route": "/account/profile" } },
          { "type": "divider" },
          { "id": "theme",    "name": "Theme",     "icon": "icon-moon",
            "action": { "type": "event", "event": "EV_CYCLE_THEME" } },
          { "id": "lang",     "name": "Language",  "icon": "icon-translate",
            "action": { "type": "event", "event": "EV_CYCLE_LANGUAGE" } },
          { "type": "divider" },
          { "id": "logout",   "name": "Logout",    "icon": "icon-logout",
            "action": { "type": "event", "event": "EV_LOGOUT" } }
        ]
      } }
  ]
}
```

- `zone` — host zone. Defaults to the first zone in `shell.zones` that
  declares `"host": "toolbar"`.
- `items[].type`:
  - omitted / `"action"` (default) — icon and/or label that fires
    `action.type` on click.
  - `"brand"` — logo + wordmark. Required: `logo` (image URL) and
    `wordmark` (text). Optional `alt` (defaults to `wordmark`) and
    `action` (typically `navigate`); without an action the brand
    renders as a passive `<div>` (not focusable).
  - `"avatar"` — circular initials badge. The text is supplied at
    runtime by a host-registered provider:
    ```js
    yui_shell_set_avatar_provider(shell, () => "JD");
    yui_shell_refresh_avatars(shell);   // re-paint after a change
    ```
    `gobj-ui` never reads the user model directly; the host owns it.
- `items[].action.type`:
  - `"navigate"` → `{ route }` — delegated to the shell (respects
    `use_hash`).
  - `"drawer"`   → `{ op: "toggle" | "open" | "close", menu_id? }` —
    opens/closes the nav with `layout:"drawer"` whose `menu_id`
    matches.
  - `"event"`    → `{ event, kw? }` — `gobj_publish_event` from the
    shell.
  - `"dropdown"` → `{ items[] }` — opens a panel anchored to the
    trigger button on the `popup` layer. Each entry is either a
    `{ "type": "divider" }` separator or a sub-item with its own
    `action` (`navigate` / `drawer` / `event` — nested dropdowns
    are not supported). Sub-items accept `show_on` for parity with
    toolbar items. The panel is dismissed by Escape, click outside
    the panel, navigation, or by activating any sub-item; programmatic
    close is also available via `yui_shell_close_dropdown(shell)`.
- `items[].show_on` — Bulma breakpoint expression (same syntax as
  `shell.zones[id].show_on`). Hides individual items per breakpoint
  without needing a separate zone. Also valid on dropdown sub-items.
- `items[].align`: `"start"` (default) or `"end"` (right-align). The
  alignment also drives the dropdown panel anchor (right-aligned for
  end items, left-aligned for start items).
- `aria_label` per item is used as the `<button>`'s `aria-label`.

### 3.5 `items[]` — option structure

```json
{
  "id": "ov",
  "name": "Overview",
  "icon": "icon-eye",
  "route": "/dash/ov",
  "disabled": false,
  "badge": "3",
  "target": {
    "stage": "main",
    "gclass": "C_DASHBOARD_OVERVIEW",
    "kw": { "refresh_ms": 5000 },
    "lifecycle": "keep_alive"
  },
  "submenu": {
    "render": { "top-sub": "tabs", "right": "vertical" },
    "default": "/dash/ov/overview",
    "items": [ ... ]
  }
}
```

- `route` — hash route to associate.
- `target` — what to show when the route is activated:
  - `gclass` — GClass to instantiate.
  - `kw` — initial attributes.
  - `name` — gobj name (optional, derived from the route).
  - `gobj` — alternative: reuse a preexisting gobj by name.
  - `stage` — where to mount it (defaults to `main`).
  - `lifecycle`: `eager` | `keep_alive` | `lazy_destroy`.
- `submenu` — when declared, the item becomes a *container*: its bare
  route redirects to the first navigable sub-item (or to `submenu.default`
  if set).  Decorative entries (§3.5) carry no `route` and are skipped
  by this fallback, so a header may safely sit at position 0.
  Sub-items declare their own `target`.

#### Decorative items inside a submenu — `type:"header"` / `type:"divider"`

When a secondary nav has many leaves, group them visually with two
non-interactive item kinds. The shell's route indexer ignores them
(no `route`, no `target`); the renderers in `vertical`, `submenu`,
`drawer` and `accordion` paint them; `tabs` and `icon-bar` silently
drop them — there is no room for section labels in those compact
layouts.

```json
"submenu": {
  "render": { "top-sub": "tabs", "right": "vertical" },
  "items": [
    { "type": "header",  "name": "account" },
    { "id": "profile",  "name": "my profile",
      "route": "/system/account/profile",
      "target": { "stage": "main", "gclass": "C_TEST_VIEW",
                  "kw": { "title": "my profile" } } },
    { "id": "sessions", "name": "sessions",
      "route": "/system/account/sessions",
      "target": { "stage": "main", "gclass": "C_TEST_VIEW",
                  "kw": { "title": "sessions" } } },
    { "type": "divider" },
    { "type": "header",  "name": "infrastructure" },
    { "id": "tariffs",  "name": "tariffs",
      "route": "/system/infra/tariffs",
      "target": { "stage": "main", "gclass": "C_TEST_VIEW",
                  "kw": { "title": "tariffs" } } }
  ]
}
```

Field rules:

- `type: "header"` — required `name` (translatable, emitted with
  `data-i18n`). Renders as a small-caps section label, no anchor.
- `type: "divider"` — no other fields. Renders as a 1 px horizontal
  rule, `role="separator"`, `aria-hidden="true"`.

Both kinds carry no `route`/`target`/`submenu`, so they are skipped
by `enter_route`, by the route index, and by the click handler
(`closest("[data-route]")` returns nothing).

This lets an app keep a flat 2-level navigation tree (one of the
shell's deliberate constraints, see §1 goal #3) while still
expressing more than two levels of *meaning* — the third level is
purely visual chunking inside the secondary nav.

### 3.6 `menu.<id>.render[zone].layout` — when each layout is appropriate

| Layout       | Best zone(s)         | Renders header/divider? | Notes                                  |
|--------------|----------------------|-------------------------|----------------------------------------|
| `vertical`   | `left`, `right`      | yes                     | Bulma `.menu`. Default secondary.       |
| `submenu`    | `right`, `top-sub`   | yes                     | Vertical list with a heading on top.    |
| `drawer`     | `overlay` (off-canvas)| yes (delegates to vertical) | Toggled by toolbar burger.        |
| `accordion`  | `left`               | yes (in inner items)    | Collapsible groups; first-level entries are sections, not decorations. |
| `tabs`       | `top-sub`            | no — silently dropped   | Horizontal strip; no room for labels.   |
| `icon-bar`   | `bottom`             | no — silently dropped   | Mobile primary; one slot per icon.      |

---

## 4. Lifecycle

When a route is activated, the shell:

1. Looks the entry up in its `route → { item, parent_item, target,
   stage }` index.
2. Hides the previous gobj's `$container` in that stage (`is-hidden`).
3. If the previous item had `lifecycle: "lazy_destroy"`, destroys it.
4. If the new one does not yet exist, creates it with `target.gclass`
   + `target.kw`, appends it to the stage's DOM, and starts it.
5. Removes `is-hidden` from the new one, publishes `EV_ROUTE_CHANGED`,
   and synchronises the hash.

`lifecycle` modes:

| Mode            | Created     | On exit                      | Use case                                       |
|-----------------|-------------|------------------------------|------------------------------------------------|
| `keep_alive`    | 1st visit   | hidden (state preserved)     | heavy views or views with half-filled forms    |
| `lazy_destroy`  | 1st visit   | destroyed                    | occasional views, avoids accumulating RAM      |
| `eager`         | at startup  | hidden                       | views that must "be there" from the beginning  |

Recommended default: `keep_alive`.

---

## 5. Navigation

- **Two-level hash routing**: the shell installs a `hashchange`
  listener. Any click on `C_YUI_NAV` changes `window.location.hash`
  and the shell reacts.
- **Programmatic**: `yui_shell_navigate(shell_gobj, "/dash/ov")`.
- **View-owned dynamic subroute (3rd, runtime level)**: a route that
  *extends* a declared one (`/a/b/c` under declared `/a/b`) mounts the
  declared ancestor's view and is **not** rejected. The view is keyed
  and reused by the BASE route (a subpath change does **not** rebuild
  it); the full path goes to the hash / `current_route`. The view
  receives the trailing `subpath` via `EV_ROUTE_CHANGED` and drives
  changes with `yui_shell_navigate(shell, "<base>/<seg>")`. This is
  how a content view exposes a deep-linkable, reload-surviving 3rd
  level (e.g. the treedb topic) without declaring runtime-only
  segments in `app_config`. (The 2-level *menu* contract is
  unchanged — this is view-internal, not a nav level.)
- **Unknown route → default**: a route that is neither declared nor a
  subpath of a declared route (stale bookmark, foreign hash) redirects
  to the default route (`default_route` attr or
  `shell.stages.main.default_route`). Only a route whose *default
  itself* is unresolvable shows the loud misconfig placeholder.
- **Outgoing event**: `EV_ROUTE_CHANGED` (with `route` full path,
  `base` declared route, `subpath` trailing view-owned part, `item`,
  `parent_item`, `stage`, `menu_id`). Navs consume it to mark the
  active item; views subscribe to react to subpath changes.
- **Back button closes overlays** (`use_hash` only): a modal
  (`yui_shell_show_modal`), a confirm dialog (`yui_shell_confirm_*`)
  and a floating `C_YUI_WINDOW` (no dock `manager`) register with the
  shell on open, which pushes a *synthetic* history entry — same hash,
  so routing is untouched. The browser Back button then closes the
  top-most overlay instead of navigating the underlying view; a second
  Back (no overlay left) is a normal route Back. When an overlay closes
  by any other path (X, Escape, backdrop, code) it retires its history
  entry via `history.back()`, so history never drifts and a later Back
  navigates normally. The mechanism reuses the same LIFO discipline as
  the Escape chain; dock-managed windows are persistent workspace
  surfaces and opt out (attr `back_dismissable`, default `true`).
  Overlays register via `yui_shell_register_overlay(shell, close_fn)`
  and retire via `yui_shell_overlay_dismissed(shell, handle)` — the
  built-in modal/window helpers do this for you.

---

## 6. GClasses

### `C_YUI_SHELL`

| Attribute        | Type        | Description                                              |
|------------------|-------------|----------------------------------------------------------|
| `config`         | JSON        | The JSON document described above                        |
| `default_route`  | string      | Fallback when the hash is empty and no `stages.*.default_route` is set |
| `current_route`  | string      | Read-only: active route                                  |
| `use_hash`       | bool        | If `true`, syncs `window.location.hash`                  |
| `mount_element`  | HTMLElement | Where to mount the shell (default `document.body`)       |
| `$container`     | HTMLElement | Shell root                                               |

Published events:
- `EV_ROUTE_REQUESTED` — `{ route, from }`. **Audit witness**:
  published as the very first thing in `navigate_to()`, **before**
  any validation or DOM work, so the FSM trace and any external
  auditor see every navigation intent — including rerouted submenu
  defaults and routes that ultimately fail. Subscribers are
  optional (the event carries `EVF_NO_WARN_SUBS`).
- `EV_ROUTE_CHANGED` — `{ route, item, parent_item, stage }`. The
  fact event, published after a navigation has fully succeeded:
  the previous view is hidden, the new view is mounted/shown, the
  stage's `active_route` is updated.

The pair *requested ↔ changed* is the canonical Yuneta way to
audit a gobj's behaviour: every intent is recorded regardless of
outcome, and every successful state transition has its own event.

Public helpers (import from `@yuneta/gobj-ui`):
- `yui_shell_set_connection_state(shell, connected)` — paint every
  `type:"connection"` toolbar dot connected/disconnected. Call from
  the app's transport handlers (`EV_ON_OPEN` → `true`, close/errors →
  `false`).
- `yui_shell_navigate(shell, route)` — programmatic navigation.
- `yui_shell_open_drawer(shell, menu_id?)`,
  `yui_shell_close_drawer(shell, menu_id?)`,
  `yui_shell_toggle_drawer(shell, menu_id?)` — act on the
  `C_YUI_NAV` with `layout:"drawer"` whose `menu_id` matches (all of
  them when `menu_id` is omitted). The shell also closes them on
  `Escape` by default. While a drawer is open the shell installs a
  focus-trap on its panel: `Tab` / `Shift+Tab` cycle inside, and on
  close the focus is restored to whichever element triggered the
  open.

### Modal / notification API

The shell paints into `priv.layers.notification` and
`priv.layers.modal`. Two naming conventions:

- `yui_shell_show_*` — non-blocking notifications/modal. Returns a
  `{ close() }` handle so the caller can dismiss programmatically.
- `yui_shell_confirm_*` — blocking dialog. Returns a Promise that
  resolves with the user's choice.

```js
import {
    yui_shell_show_info, yui_shell_show_warning, yui_shell_show_error,
    yui_shell_show_modal,
    yui_shell_confirm_ok, yui_shell_confirm_yesno, yui_shell_confirm_yesnocancel,
} from "@yuneta/gobj-ui";

/*  Toasts (Bulma .notification, auto-dismiss after 5 s). */
yui_shell_show_info(shell,    "Hello");
yui_shell_show_warning(shell, "Watch out");
yui_shell_show_error(shell,   "Boom");

/*  Non-blocking modal (Bulma .modal-content + .box).  Click on
 *  background, the close button or Escape close it.  `content` may
 *  be an HTMLElement (mounted as-is).  opts: { dismiss_on_background,
 *  with_close_button, on_close }.  with_close_button:false omits the
 *  external floating Bulma `.modal-close` (for content that provides
 *  its own in-box close, e.g. a C_YUI_PAGER header); Escape and the
 *  backdrop still close.  on_close() fires once after the modal is
 *  removed by ANY path (programmatic, Escape, backdrop, X) — use it
 *  to destroy a gobj you mounted inside. */
let { close } = yui_shell_show_modal(shell, $el, { on_close: cleanup });

/*  Blocking dialogs.  Escape, the close button, and click on the
 *  background all resolve with the LAST button's value (cancel/no/
 *  ok by convention — the safe-default action). */
await yui_shell_confirm_ok(shell, "Saved.");
let yes = await yui_shell_confirm_yesno(shell, "Discard changes?");
let r   = await yui_shell_confirm_yesnocancel(shell, "Save before close?");
//   r === "yes" | "no" | "cancel"
```

Every modal/dialog automatically:
- pushes a close handler onto the Escape priority chain (§11),
- installs a focus-trap on the modal card (Tab cycles inside,
  Shift+Tab cycles backwards, focus is restored on close),
- removes itself from the DOM when closed.

The legacy `display_*` / `get_yes*` helpers were removed with
`c_yui_main.js` in `3.0.0` (see §10); their icon-centric card design
lives on in the `yui_shell_confirm_*` dialogs.

### Internationalisation

The shell does **not** own i18n. Every translatable text node it
renders (menu labels, secondary-nav heading, toolbar buttons) is
emitted with `data-i18n="<canonical English key>"` via
`createElement2`'s `i18n` attribute. To switch languages, use the
canonical helper from `@yuneta/gobj-js`:

```js
import { refresh_language } from "@yuneta/gobj-js";
import i18next, { t } from "i18next";

i18next.changeLanguage("es");
refresh_language(shell.$container, t);
```

Apps that already configure i18next get the
shell labels switched for free; apps without i18next can pass any
`(key) => string` function as `t`.

### `C_YUI_NAV`

Instantiated by the shell (one per *menu, zone* pair). End users do
not normally create it directly. The nav **does not** navigate: it
publishes the intent and the shell routes.

Published events:
- `EV_NAV_CLICKED` — `{ route, item_id, zone, level }`. The shell is
  subscribed and decides whether to change the hash or call
  `navigate_to` directly.
- `EV_DRAWER_CLOSE_REQUESTED` — `{ menu_id }`. Published by drawer
  navs when the backdrop is clicked; the shell's
  `ac_drawer_close_requested` runs the canonical close path.

Notable attributes: `menu_items`, `zone`, `layout`, `icon_pos`,
`show_label`, `level` (`primary` | `secondary`), `shell`,
`nav_label` (human-readable label used by the secondary navs as
their heading and `aria-label`; the shell fills it from the parent
item's `name`).

### Secondary nav `menu_id`

The shell auto-instantiates a level-2 nav for every primary-style
menu item that declares a `submenu` with its own `render` block —
not just `menu.primary`. The synthesised `menu_id` for a secondary
nav is `secondary.<owning_menu_id>.<item.id>`, so two primary-style
menus may have items with the same id without colliding (e.g.
`secondary.primary.dash` and `secondary.admin.dash` are independent
navs that flip visibility based on the active route's owning menu).

### i18n

The nav has no `translate` attr — it does not translate text
itself. Labels are emitted with `data-i18n` and a single
`refresh_language` call on the shell's `$container` re-translates
every nav at once.

### `C_YUI_PAGER`

Drill-down navigation **stack** (Pattern A: settings-style,
mobile-first). Container-agnostic: it owns *only* the navigation
chrome (a `<- title` header + a body that stacks panels). The
parent mounts `gobj_read_attr(pager, "$container")` wherever it
wants — inside a `C_YUI_WINDOW` body, a Bulma `modal-card` body, or
inline — and feeds content with `EV_PUSH_PAGE`. **No Confirm/Cancel
chrome on purpose**: the content panel auto-saves itself (e.g.
`C_YUI_FORM`); `<- back` only navigates.

Subscription model: **CHILD** (created with a parent; the parent —
or an explicit `subscriber` attr — receives the output events).

Input events:
- `EV_PUSH_PAGE` — `{ id, title, content, discardable? }`. `content`
  is a gobj exposing a `$container` attr, an `HTMLElement`, or a
  `createElement2()` spec (array).
- `EV_POP_PAGE` / `EV_BACK` — pop the top page; popping past the
  root emits `EV_PAGER_EXIT` when `back_on_root` is `true`.
- `EV_REPLACE_PAGE` — `{ id, title, content, discardable? }`,
  swaps the top page (same depth).
- `EV_DISCARD_PAGE` — emit `EV_PAGE_DISCARD` for the top page.
- `EV_SHOW` / `EV_HIDE` / `EV_REFRESH` / `EV_RESIZE` — chrome
  show/hide/relabel; forwarded to the top page when it is a gobj.

Published events:
- `EV_PAGE_SHOWN` — `{ id, depth }` (informational, no-warn).
- `EV_PAGE_DISCARD` — `{ id }`. The page/parent decides what
  discard means (e.g. a form does `EV_UNDO_RECORD` then the host
  pops). The pager only exposes the hook.
- `EV_PAGER_EXIT` — back was pressed on the root; the host
  (window / modal) should close.

Notable attributes: `subscriber`, `root_title`, `back_on_root`
(default `true`), `with_discard` (default `false`; the per-page
`discard` affordance only shows when this is `true` **and** the
pushed page set `discardable:true`), `$container` (internal, the
node the parent mounts).

Header affordance by depth: a deeper page shows a **back arrow**
(`yi-arrow-left`, pops); the **root** page with `back_on_root`
shows a **close cross** (`yi-xmark`, emits `EV_PAGER_EXIT`).
`yi-arrow-left` / `yi-arrow-right` were added to
`yui_icons.css` for this (the set is small — verify a glyph is
defined there before using it). The
`pager_header_model` exposes this as `back_kind`
(`"back"|"close"|"none"`).

Host note: the close affordance lives **inside** the popup (the
pager header). When hosting in `yui_shell_show_modal`, pass
`with_close_button: false` so the external floating Bulma
`.modal-close` is omitted and the pager's in-box cross is the only
close (Escape and the backdrop still close). When mounted inside a
Bulma `modal-card`, hide the `modal-card-head` to avoid a double
header. On mobile a full-screen sheet is recommended; on desktop a
centred card/box. No transitions on push/pop by design.

### `C_YUI_WIZARD`

Multi-step wizard (Pattern B: forward/back with a final confirm).
Same container-agnostic philosophy as `C_YUI_PAGER` and the same
**CHILD** subscription model. Unlike the pager, a wizard **does**
confirm at the end. The parent supplies all steps up-front; the
gclass owns the title / `N / M` counter / Back / Next(Confirm)
chrome and shows one step at a time.

Input events:
- `EV_SET_STEPS` — `{ steps: [ { id, title, content } ] }`.
  `content` is a gobj exposing `$container`, an `HTMLElement`, or a
  `createElement2()` spec.
- `EV_NEXT` — validate (if `linear`) then advance; on the last
  step it confirms.
- `EV_PREV` — previous step (no validation).
- `EV_GOTO` — `{ idx }`, jump to a step (no validation).
- `EV_STEP_VALID` — `{ ...kw }` the current step accepted; the
  wizard accumulates `kw` and advances/confirms.
- `EV_STEP_INVALID` — `{ msg }` the step rejected; the wizard
  stays put (the step shows its own error).
- `EV_CANCEL` — host asked to cancel → emits `EV_WIZARD_CANCEL`.
- `EV_SHOW` / `EV_HIDE` / `EV_REFRESH` / `EV_RESIZE` — forwarded
  to the current step when it is a gobj.

Published events:
- `EV_STEP_VALIDATE` — sent to the current step's gobj before
  advancing in a `linear` wizard; the step must answer
  `EV_STEP_VALID` / `EV_STEP_INVALID`.
- `EV_STEP_SHOWN` — `{ idx, id }` (informational, no-warn).
- `EV_WIZARD_DONE` — `{ kw, by_step }`. `kw` is the flat merge of
  every step's validated kw; `by_step` keeps them keyed by step id.
- `EV_WIZARD_CANCEL` — emitted on `EV_CANCEL`.

Validation contract: in a `linear` wizard every step whose
`content` is a gobj **must** handle `EV_STEP_VALIDATE` and reply
`EV_STEP_VALID`/`EV_STEP_INVALID`. Steps that are plain elements,
and non-linear wizards, skip validation and advance immediately.

Notable attributes: `subscriber`, `confirm_label` (default
`"confirm"`), `next_label` (`"next"`), `back_label` (`"back"`),
`allow_back` (default `true`), `linear` (default `true`),
`$container` (internal). Same modal-card host note as
`C_YUI_PAGER` (hide `modal-card-head`; full-screen sheet on
mobile; no transitions).

---

## 7. Integration in an app

```js
import {
    register_c_yui_shell,
    register_c_yui_nav,
} from "@yuneta/gobj-ui";
import "@yuneta/gobj-ui/src/c_yui_shell.css";
import "bulma/css/bulma.css";
import app_config from "./app_config.json";

register_c_yui_shell();
register_c_yui_nav();
/*  also: register_c_<your_view>() for every gclass referenced in target.gclass */

gobj_create_default_service(
    "shell",
    "C_YUI_SHELL",
    { config: app_config, use_hash: true },
    yuno
);
```

Every view GClass must expose a `$container` attribute holding a root
`HTMLElement`; the shell takes care of appending it to the stage and
managing its visibility.

---

## 8. Solution vs. the original requirements

| Requirement                                              | How it is covered                                             |
|----------------------------------------------------------|---------------------------------------------------------------|
| Declarative, Yuneta-style JSON                           | `config` attribute holding a JSON of `shell`/`menu`/`toolbar` |
| Layers + working zones                                   | 6 fixed layers + 7 zones in a grid                            |
| Two-level primary menu                                   | `menu.primary.items[].submenu.items[]`                        |
| Three-level *meaning* without a third nav level          | `type:"header"` / `type:"divider"` decorative items inside `submenu.items[]` (§3.5) |
| Primary in `left` on desktop and `bottom` on mobile      | `"host": "menu.primary"` in both, with opposite `show_on`     |
| Icon + label; different per zone                         | `render[zone]` with `layout` + `icon_pos` + `show_label`      |
| Submenu as tabs **or** as a side submenu                 | `submenu.render[zone]` set to `"tabs"` / `"vertical"` / etc.  |
| Fixed toolbar at top or bottom                           | `shell.zones.top.host = "toolbar"` (or `bottom`)              |
| Built on top of Bulma helpers                            | `.menu`, `.tabs`, `.level`, `is-hidden-*`; our own CSS only for `icon-bar`, `drawer`, `accordion`, and the per-breakpoint hiders |
| Vite-compatible                                          | Same flow as the rest of `gobj-ui`                            |
| Drop-in for libyui later                                 | Re-exported from `index.js`                                   |

---

## 9. Test app

A runnable, backend-less **layout catalog** lives in `test-app/`. It is
the practical companion to this document: every `C_YUI_NAV` layout on
one screen, driven entirely by `test-app/src/app_config.json`. See
[`test-app/README.md`](test-app/README.md). Quick start:

```
cd kernel/js/gobj-ui/test-app
npm install
npm run dev        # http://localhost:5173
```

Every leaf mounts one small view (`C_TEST_VIEW`) that names on screen
which layout(s) are visible and where, and prints an `instance #`
counter so `keep_alive` vs `lazy_destroy` is observable.

### The test-app navigation tree, flattened

A concrete instance of the §2 model on the shipping
`test-app/src/app_config.json` — a pure 2-level menu with inline
`target`s and toolbar actions of type `navigate` / `event` / `drawer` /
`dropdown` (no `shell.routes`, no `target.kind` — those are not part of
this engine; see the wattyzer routing-contract doc for the extended
variant). One primary menu renders **vertical** in `left` (desktop) and
**icon-bar** in `bottom` (mobile); each chapter demonstrates one
secondary layout.

```
NAVIGATION TREE  (app_config.json)                ROUTE INDEX  (runtime, flat)
─────────────────────────────────────            ──────────────────────────────────────────
toolbar (zone:top)                                path            target / effect
  burger ─── drawer toggle menu_id:quick          ──────────────  ────────────────────────────
  brand ──── navigate /tabs                       /tabs           ∅  → redirect to /tabs/a
  lang ───── event EV_TOGGLE_LANGUAGE (*)         /tabs/a         C_TEST_VIEW @main keep_alive
  theme ──── event EV_TOGGLE_THEME    (*)         /tabs/b         C_TEST_VIEW @main keep_alive
  user ───── dropdown { navigate, event }
                                                  /tabs/c         C_TEST_VIEW @main lazy_destroy
menu.primary (left:vertical / bottom:icon-bar)    /submenu        ∅  → redirect to /submenu/profile
  "tabs"      /tabs      (container)               /submenu/profile  C_TEST_VIEW @main keep_alive
   └─ submenu render {top-sub: tabs}               /submenu/sessions C_TEST_VIEW @main keep_alive
      ├─ "a"  /tabs/a    ├─ "b" /tabs/b            /submenu/tokens   C_TEST_VIEW @main keep_alive
      └─ "c"  /tabs/c                              /cards          C_YUI_NAV @main (cards landing)
  "submenu"   /submenu   (container)               /cards/alpha …  C_TEST_VIEW @main keep_alive
   └─ submenu render {right: submenu}             /accordion      C_TEST_VIEW @main keep_alive
      header/divider + profile/sessions/tokens                     (embeds a live accordion nav)
  "cards"     /cards     (index landing)          /form           C_DEMO_FORM @main keep_alive
   └─ submenu {render:{top-sub:tabs}, index:true}  /table          C_DEMO_TABLE @main keep_alive
      └─ alpha/beta/gamma/delta
  "accordion" /accordion ─── target inline        (*) toolbar action:"event" → publishes the
  "form"      /form      ─── target C_DEMO_FORM        event (theme toggle), NO route, NO index
  "table"     /table     ─── target C_DEMO_TABLE
                                                  menu.quick (drawer overlay, burger)
                                                   q-* → reuse the primary-menu route entries
                                                   (no own target)
```

What this example demonstrates that the generic §2 picture only states:

- **Every layout in one app**: `vertical` + `icon-bar` (primary, two
  zones), `tabs` (`/tabs`), `submenu` (`/submenu`), `cards` +
  `backbar` (`/cards`, via `submenu.index`), `drawer` (burger →
  `menu.quick`), and `accordion` (embedded in the `/accordion` view,
  since accordion is a primary-zone layout — its bodies are the routable
  2nd level, so it can't be a 3rd-level submenu).
- **Component views, not just layouts**: several chapters mount real
  gobj-ui components inside a stage — `C_YUI_FORM` (`/form`), a Tabulator
  table (`/table`), `C_YUI_UPLOT` (`/chart`), `C_YUI_GOBJ_TREE_JS`
  (`/tree`, the yuno's own live gobj tree), `C_YUI_JSON_GRAPH` (`/json`),
  `C_YUI_WIZARD` (`/wizard`), `C_YUI_PAGER` (`/pager`) and `C_YUI_MAP`
  (`/map`, MapLibre — the only chapter needing network, for basemap
  tiles) — showing what goes *inside* a stage, not only how navs render.
  Each is wrapped by a tiny `C_DEMO_*` gclass. `main.js` initialises the
  shared i18next instance (deduped in `vite.config.js`) so `C_YUI_FORM`'s
  module-level `t()` doesn't render blank; a minimal `__yui_main__`
  service (`c_demo_main.js`) supplies the `EV_RESIZE` the map's legacy
  lineage expects. (TreeDB component views are not demoed — they need a
  live treedb backend.)
- **Localisation (es/en)**: the toolbar `ES/EN` button publishes
  `EV_TOGGLE_LANGUAGE`; `C_DEMO` flips i18next and repaints every
  `[data-i18n]` node via `refresh_language(document.body, t)`. English
  is the source (keys = English strings), `es` translates them
  (`locales.js`), and the views translate their own DOM on build — so
  the shell chrome, view titles/leads and the hosted `C_YUI_FORM` all
  switch language together.
- **Container redirect**: `/tabs` and `/submenu` have no own target, so
  the bare route redirects to the first navigable child; `/cards` opts
  out with `submenu.index` and becomes a resting cards landing.
- **Lifecycle contrast**: `/tabs/a` and `/tabs/b` are `keep_alive`
  (their `instance #` survives a revisit); `/tabs/c` is `lazy_destroy`
  (a fresh instance each time).
- **Toolbar action vocabulary**: `navigate` (brand), `event`
  (theme — no route, no index entry), `drawer` (burger) and `dropdown`
  (avatar). (This is the engine's built-in set; the wattyzer doc's
  `kind:"action"` is a *different*, vendored extension that turns a
  *route* into transient event wiring — do not conflate them.)
- **`menu.quick` route reuse**: the drawer items carry only a `route`
  and no `target`; they resolve to the same index entries as the
  primary menu, so the existing instance is reused — no duplicate gobj.

---

## 10. The legacy stack (`C_YUI_MAIN` / `C_YUI_ROUTING`) — removed in `3.0.0`

The legacy stack coexisted with the shell while consumers migrated
(this section used to document the coexistence and drift policy).
As of `3.0.0` the migration is complete and `c_yui_main.js`/`.css`,
`c_yui_routing.js`/`.css`, `c_yui_tabs.js`, `themes.js` and
`ytable.js`/`.css` are **removed from this line**.  The frozen **v1
npm line** (`@yuneta/gobj-ui@^1.x`, dist-tag `legacy`) still ships
them for estadodelaire/hidraulia.

What replaced each piece on `main`:

- Shell + routing: `C_YUI_SHELL` + `C_YUI_NAV` (this document).
- `display_*` / `get_yes*` volatil modals: `yui_shell_show_*` /
  `yui_shell_confirm_*` (§4 modal API).  The `2.5.0` icon-centric
  card design was ported into the shell confirms before the removal
  (tinted round type icon, narrow rounded card, centered buttons,
  `opts.type`: question/success/info/warning/error).
- The component gclasses (`C_YUI_TREEDB_*`, `C_YUI_WINDOW`) resolve
  the shell per call with `yui_shell_of(gobj)` and mount popups on
  the shell layers (`yui_shell_popup_layer`).  Hosting them assumes
  a `C_YUI_SHELL` on the page; without one the confirms degrade to
  a `log_warning` plus the safe-default answer.

### Implemented ✓ in this pass

- Zones + `show_on` with the operators `>=`, `<=`, `<`, `>`,
  enumeration, and `|`. Pure parser, unit-tested (`npm test`).
- Automatic inference of the `main` stage from `"host":
  "stage.<name>"`.
- All 6 menu layouts (`vertical`, `icon-bar`, `tabs`, `drawer`,
  `submenu`, `accordion`), with auto-expansion of the active branch
  on accordion when the route changes.
- Decorative `type:"header"` / `type:"divider"` items inside
  secondary navs (§3.5) — visual chunking of long submenus without
  introducing a third routing level.
- Off-canvas drawer: mounted on the `overlay` layer (not inside the
  zone grid), closed on backdrop click and on `Escape`, public API
  `yui_shell_{open,close,toggle}_drawer`, focus-trap with
  Tab/Shift-Tab cycling and focus restoration.
- `lifecycle: eager | keep_alive | lazy_destroy`, with the first one
  preinstantiating the views at startup.
- **Declarative toolbar** (`toolbar.items[]` with `navigate`,
  `drawer`, `event`, and `dropdown` actions; `type: "brand"` and
  `type: "avatar"` item kinds; per-item `show_on`).
- Single router: the nav publishes `EV_NAV_CLICKED`, the shell
  routes.
- Canonical i18n: every translatable text node carries
  `data-i18n="<canonical key>"`; apps switch language by calling
  `refresh_language(shell.$container, t)` from `@yuneta/gobj-js`,
  the same helper `c_yui_main.js` uses.
- Accessibility: `role="navigation"` on navs, `role="dialog"` +
  `aria-modal` on drawers, `aria-expanded` / `aria-controls` on the
  accordion, `aria-disabled` + `tabindex="-1"` on disabled items,
  `:focus-visible` on every interactive control.
- Loud failure when no route is available: `log_error` + a placeholder
  visible in the stage instead of a blank screen.
- Hard contract: when a view does not expose `$container`, the shell
  logs an error and destroys the half-built gobj.

### Migration track — closed

The retirement plan lived in `TODO.md` §1 (inventory → consumer
migration → removal); it completed with the `3.0.0` removal above.

---

## 11. Escape priority chain

The shell maintains a **single, ordered stack** of close handlers,
one entry per open overlay (drawer today, modal/popup when #4
lands, custom app overlays via the public API). `Escape` calls the
**top** entry only and consumes the event (preventDefault +
stopPropagation), so a modal opened over a drawer closes first;
the second `Escape` closes the drawer.

LIFO ordering naturally matches the z-index layering most apps
use:

```
loading       (no Escape — full-screen blocking spinner)
modal         (z-index 99)
popup         (z-index 20)
overlay       (z-index 15)  ← drawer lives here
base          (z-index  1)  ← never on the Escape stack
```

The drawer integration is built in: `yui_shell_open_drawer` /
`toggle_drawer` push their close handler; `yui_shell_close_drawer`,
the backdrop click, and `Escape` itself all funnel through the
same close path (`close_drawer_one`) which removes
`is-active`, releases the focus-trap, and pops the stack entry.

The backdrop click is routed via `EV_DRAWER_CLOSE_REQUESTED` from
the nav to the shell, not by mutating the DOM directly — that
guarantees the focus-trap and stack stay in sync regardless of
which path closed the drawer.

### Public API (for custom overlays)

```js
import { yui_shell_push_escape, yui_shell_pop_escape } from "@yuneta/gobj-ui";

let close_modal = () => my_modal.close();
yui_shell_push_escape(shell, "modal", close_modal);
//   ... when the modal closes by any path (Escape, overlay click,
//   programmatic close, ...) the same handler must also pop:
yui_shell_pop_escape(shell, close_modal);
```

`layer` is a free-form tag (e.g. `"modal"`, `"popup"`,
`"overlay"`). It is informational today (the LIFO ordering is what
drives priority); keep it accurate so the FSM trace is readable.

