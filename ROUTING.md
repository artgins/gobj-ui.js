# Routing & Navigation — the contract for the declarative shell

This is the **single source of truth** for how navigation works in a
`C_YUI_SHELL` Single-Page Application (gui_treedb, gui_agent, wattyzer, …), and
the rules every new visual element MUST follow. A SPA has to *simulate* a
Multi-Page Application: every point in the app is reachable by a URL, the path
the user walked is recorded so Back/Forward work, and reloading or sharing a URL
lands on exactly the same place.

If you are adding anything a user can *see* or *reach*, read the **Litmus**
(§3) and the **Implementer checklist** (§8). Everything else is the *why*.

---

## 1. The model (axioms)

1. **The URL is the single source of truth for *where the user is*.** Every
   visible position derives from the URL. A state that is not encoded in the URL
   does not exist for Back/Forward, reload, bookmark, or share — it is invisible
   to the mechanism that makes a SPA feel like an MPA.

2. **The route tree is a filesystem tree.** Routes are paths:
   `/<workspace>/<section>/<item>/<subitem>…`. Every navigable node has a path,
   and paths nest exactly like directories. A parent path is a real, resting
   place; a child path is reachable directly (deep link) *and* by walking in.

3. **Navigation flows one way: intent → URL → view.** A click, a tab, a toggle
   never mutates the view directly. It changes the **URL**; the shell's
   hashchange handler then mounts/updates the view. Browser Back/Forward use the
   *same* code path, so they are correct by construction — you never write
   "handle Back" logic, you just make every move go through the URL.

4. **History is the browser's stack (LIFO).** Back pops the most-recent entry,
   Forward re-pushes it. `window.history` **is** that stack. Do **not** build a
   parallel route-history stack in a gclass or in localStorage. (The one
   auxiliary stack the shell keeps — the *overlay* stack, §6 — is a different
   concern layered on top, not route history.)

---

## 2. push vs replace vs touch-nothing

Every URL change is one of three kinds. Choosing the wrong one is the most
common routing bug (it silently breaks Back).

| Situation | History op | Why |
|---|---|---|
| The user **moves to a new place** (opens a tab, a topic, a card, toggles a landing view) | **push** | Adds an entry so Back returns to where they were. |
| A **redirect / normalize / restore** (unknown route → default, submenu parent → its default child, F5 re-landing on the last tab, "reflect a state we're already in") | **replace** | Must NOT add a bogus entry the user never chose. |
| **Reacting to a hashchange** the browser already made (an `<a href="#…">` click, a Back/Forward) | **touch nothing** | The entry already exists; just mount the view. |

**Rule of thumb:** if a human deliberately chose to go there, it's a **push**.
If code decided for them (to fix up or restore the URL), it's a **replace**.

---

## 3. The Litmus — which bucket is a state in?

Before adding any visual state, classify it. This decides where it lives.

| Bucket | Question it answers | Where it lives | Examples |
|---|---|---|---|
| **Position** | "*What* am I looking at?" | **The URL. Always.** | which workspace, which tab (incl. the connections/picker tab), which topic, the table-vs-info-vs-schema landing, a focused node |
| **Preference** | "*How* do I like it shown?" | **localStorage** (`SDF_PERSIST` attr) — **not** the URL | graph layout, graph operation-mode, theme, table page-size, column widths |
| **Transient / overlay** | "A thing floating *over* the page right now" | **in-view state + the overlay stack** (§6) — never a route | a modal, the raw-JSON viewer, a popover, a hover/selection highlight |

Corollaries:
- **No side-channel may decide *position*.** localStorage may at most *mirror*
  the URL for convenience; it must never be the authority for where the user is.
  (An `active_tabs`-style memory that the URL doesn't reflect is a bug — it
  desyncs Back and excludes whatever it forgot to record.)
- A preference is safe in localStorage precisely because losing it on another
  device/browser is harmless; a position is not — it must survive a shared link.

---

## 4. The route tree

- **Declared routes** come from three sources, merged into one flat index
  (`priv.item_index`, keyed by route):
  1. the static nav tree (`config.menu`) — primary items and submenu children;
  2. the explicit route table (`config.shell.routes`) — action routes, root `/`,
     toolbar-only forms;
  3. **dynamic submenus** (`yui_shell_set_submenu`) — runtime tabs (e.g. one per
     open treedb), added/pruned as state changes.
- **Resolution is longest-declared-prefix** (`route_resolver.js`): a request for
  `/a/b/c/d` mounts the view declared at the deepest matching ancestor (say
  `/a/b`) and hands it the trailing **`subpath`** (`c/d`). Root `/` matches only
  exactly, never as a catch-all.
- A **view owns its dynamic deeper levels via the `subpath`**, not via declared
  routes. The shell does NOT inject the subpath into the view's `kw` (strict
  SDATA validation). Instead it broadcasts it (§5), and the view maps
  `subpath ↔ its own state`. This is how a treedb view owns
  `…/db/<sel>/<topic>[/info|/schema]` without declaring runtime segments.
- **Section-index landing:** a primary item with `submenu.index` gets a
  synthesized target so its own route is a real resting "cards" page; without
  `index`, a submenu parent **redirects** (replace) to `submenu.default` or its
  first routable child.

---

## 5. How a view participates

The shell emits two events (both carry the full picture):

- `EV_ROUTE_REQUESTED {route, from}` — an audit witness, published *before* any
  work, for every requested route (including redirects and failures).
- `EV_ROUTE_CHANGED {route, base, subpath, item, parent_item, stage, menu_id}` —
  published after the view for `base` is mounted/shown. `base` is the declared
  route the view is keyed by; `subpath` is the view's dynamic tail.

**A view's contract:**
1. On `EV_ROUTE_CHANGED` for *its* `base`, apply `subpath` to its own state
   (show that topic / info / schema / focus). An **empty** subpath means "the
   view's home" — reset to it (this is what makes Back from a deep sub-state
   return to the landing).
2. When the user changes the view's own position, **navigate** (push) so the URL
   and history reflect it — never just mutate `priv` and re-render. Emitting an
   intent the host turns into a route is fine; silent in-view state is not.
3. Stay **route-agnostic** if you are a reusable library gclass: take
   host-supplied hash templates (e.g. `card_action_routes`, `back_route`) or
   publish an intent; let the host own the concrete paths.

---

## 6. Overlays (modals, popups, floating windows)

Overlays are **not** route nodes — they float above the resting route. The shell
integrates them with Back via a **synthetic history entry** (`pushState` with the
same hash) and an **overlay stack**:

- On open: `yui_shell_register_overlay(shell, close_fn)` pushes a synthetic entry
  + stack frame. Browser **Back** pops the stack and runs `close_fn` (closes the
  top overlay instead of navigating the route).
- On close by any other path (X / Escape / backdrop / code): call
  `yui_shell_overlay_dismissed(shell, overlay)` so the shell retires the matching
  synthetic entry.
- Escape is a separate LIFO (`yui_shell_push_escape` / `pop_escape`) so the
  top-most overlay closes first.

Use this for every modal/popup. Never encode an overlay as a route (a
deep-linkable modal is an *action route* with `redirect:"stay"`, a deliberate,
rare exception — see the shell's action-route handling).

---

## 7. The navigation APIs

- **Nav items** (`C_YUI_NAV`) never navigate themselves: they publish
  `EV_NAV_CLICKED`; the shell turns it into a URL change (a **push**). Rendered as
  `<a href="#route">` for accessibility/middle-click, `preventDefault`-ed on
  normal click.
- **Raw hash anchors** `<a href="#route">` (e.g. topic-card icons) — the browser
  pushes on click; the shell routes on `hashchange`. Deep-linkable and
  Back-friendly for free. Prefer these for in-content navigation.
- **Programmatic** — from a controller that decides to move the user:
  `yui_shell_navigate(shell, route)`. Treat this as a **push** (a real move). For
  a **replace** (redirect / normalize / restore), use the replace variant / an
  explicit `{replace:true}` option so no bogus Back entry is created.
- **Back/Forward** need no code: they change the hash, the shell re-routes
  through the same path, views react to `EV_ROUTE_CHANGED` (including an empty
  `subpath` → view home).

---

## 8. Implementer checklist (every new visual element)

- [ ] Is it **position**? → give it a **URL segment** and make reaching it a
  **push** navigation. Reachable by direct link and restored on F5.
- [ ] Is it **preference**? → `SDF_PERSIST` localStorage attr, not the URL.
- [ ] Is it **transient/overlay**? → in-view state + register it on the overlay
  stack (§6). No route.
- [ ] Does the state come from a `subpath`? → react to `EV_ROUTE_CHANGED`, and
  reset to **home on an empty subpath**.
- [ ] Are you a reusable library view? → stay **route-agnostic** (host-supplied
  templates / intents), never hardcode app paths.
- [ ] Never let a **side-channel** (localStorage, a `priv` flag) be the authority
  for *where the user is*.
- [ ] Never mutate the view and re-render as a substitute for navigating.

---

## 9. Current conformance debt

The shell's engine (route index, resolution, `subpath`, overlay stack, the
nav-click → `location.hash` push path) already implements this contract. The
following are known **non-conformances** to fix *against* this document; each
names the norm it breaks.

1. **`yui_shell_navigate` uses `replaceState`, not push** (breaks §2/§7).
   Programmatic navigations (a topic-tab selection routed through the host, etc.)
   don't create a Back entry, so Back can't traverse them — while raw-anchor
   navigations (card icons) do. Fix: `yui_shell_navigate` pushes (route through
   `location.hash` like nav clicks); add a `yui_shell_redirect` / `{replace}` for
   the redirect/restore call sites, and audit every existing caller across
   consumers.
2. **Position tracked in a side-channel that excludes the picker** (breaks §3
   corollary). `active_tabs` records only `/<ws>/db/<sel>`, never
   `/<ws>/connections`, so re-entering a workspace skips the Connections tab.
   Fix: the URL is the authority for the resting tab (picker included);
   `active_tabs` may only mirror it.
3. **The Topics "Schema" landing is in-view state with no route** (breaks §1/§3).
   `EV_TOGGLE_LANDING_VIEW` flips a `priv` flag only. Fix: route it as
   `/topics/db/<sel>/schema`; the toggle becomes a push navigation, `apply_seg`
   maps `schema`, F5/Back work.
4. Graph `operation_mode` / `layout` live in localStorage only — **acceptable**
   under §3 (they are *preferences*), listed only to record the deliberate
   decision.

---

*Home of this contract: `kernel/js/gobj-ui/ROUTING.md`. Keep it in sync with the
shell and publish the chapter to doc.yuneta.io when the debt in §9 is paid.*
