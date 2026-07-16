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
     toolbar-only forms. **A route key is a path: only `"/…"` keys are
     indexed.** JSON has no comments, so these configs annotate the table with
     sibling `_name_comment` string keys (the established idiom) — they are
     skipped, not turned into routes. A non-object target under a `"/…"` key
     is a config error and says so;
  3. **dynamic submenus** (`yui_shell_set_submenu`) — runtime tabs (e.g. one per
     open treedb), added/pruned as state changes.
- **Resolution is longest-declared-prefix** (`route_resolver.js`): a request for
  `/a/b/c/d` mounts the view declared at the deepest matching ancestor (say
  `/a/b`) and hands it the trailing **`subpath`** (`c/d`). Root `/` matches only
  exactly, never as a catch-all.
- **Routes are normalized before resolution** (`normalize_route`): leading `/`
  ensured, duplicate slashes collapsed, trailing slashes stripped (root `/`
  kept). Hashes come from the outside world — a shared link typed as `#/a/b/`
  resolves like `#/a/b`, and the URL is rewritten to the canonical form.
  Redirect recursion (submenu default → unknown → default → …) is capped: a
  config cycle logs an error and shows a placeholder instead of overflowing
  the stack.
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
4. **Declare your deep sub-routes to the site map** (optional but encouraged): a
   view that owns dynamic subpaths (topics, `/info`, `/schema`, focus topics)
   calls `yui_shell_set_sub_routes(shell, base_route, nodes)` when they become
   known (e.g. after its schema loads), and clears them on `mt_stop`
   (`…, null`). `nodes` is an ordered `[{route, label, icon?, children?}]`
   (full hashless routes). The site map (§site map) then shows the *complete*
   tree, not just the declared skeleton. It is a **pull-at-render registry**:
   the map reads it live, so an unmounted view's children vanish automatically.
   The view still stays route-agnostic — it builds the full routes from its
   host-supplied `base_route`. The registry holds the caller's array **by
   reference**, but the map builder copies those nodes before rendering, so
   the view's own objects are never written to — they are input, not state.
5. **Declare who handles an action event** (optional): a gclass that handles a
   toolbar/account action event calls `yui_shell_register_event_handler(shell,
   event, gclass)` once (next to its `gobj_subscribe_event`), so the site map
   shows *where* the action is implemented. Same pull-at-render registry idea as
   §5.4 — the shell can't know the runtime subscriber statically, so the handler
   self-declares.

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
- **Navigating with a non-modal overlay open** (a floating window — modals
  can't co-occur with nav clicks): a change of **resting route** closes every
  registered overlay — an overlay is *transient* (§3) and does not outlive
  the view it floats above. A **transient action route** (§7.1) or a
  **subpath-only** move keeps them open (the site map exploits this: it stays
  up while you drill subpaths). This holds **however the shell got there** —
  a submenu default, an unknown-route default and an action's `"<route>"`
  redirect land the user on a different resting view just as a direct route
  does, so they drain too. The bookkeeping stays sound through the
  synthetic entries' state markers: a closed overlay's entry is left
  **inert** when it is not the current one — dismissal never
  `history.back()`s over real route entries (doing so used to teleport the
  user back to the pre-overlay route) — and a later Back absorbs an inert
  entry as a same-hash no-op.
- **What counts as "Back over an overlay"** is the **marker's own hash**, not
  the resting route's. A marker is pushed with the same hash as the entry
  below it, so stepping off it always lands on that hash — while an action
  route (§7.1) can legitimately park the URL *off* the resting route, which
  is why matching on the resting route left `stay` modals unclosable by Back.

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
  `yui_shell_navigate(shell, route)` **pushes** (creates a Back entry via the
  hash). That is the default because it is the safe one: a forgotten `{push}`
  used to silently break Back, whereas a forgotten `{replace}` merely leaves one
  extra history entry. Pass `{replace:true}` when **code** decided the move —
  redirects, normalizations, submenu-parent → default child, F5-restores.
  `{push:true}` is redundant but still accepted, so a call site may state its
  intent explicitly. **Rule of thumb (§2): a human chose it → default; code
  chose it → `{replace:true}`.**
- **Back/Forward** need no code: they change the hash, the shell re-routes
  through the same path, views react to `EV_ROUTE_CHANGED` (including an empty
  `subpath` → view home).

### 7.1 Action routes — a route that *fires an event* instead of mounting a view

A route whose target is `{"kind": "action", "event": "EV_…", "redirect": "…"}`
(declared in `config.shell.routes`, or as an item's `target`) makes the shell
**publish that event** instead of mounting a view. The route is **transient**:
no view is mounted and `current_route` stays on the underlying resting view.

**Two ways to wire an action, and they are not interchangeable:**

| | `action: {type:"event", event:"EV_…"}` on the item | an **action route** + `action: {type:"navigate", route:"/…"}` |
|---|---|---|
| Has a URL | no | **yes** |
| Deep-linkable / bookmarkable | no | **yes** (the user can type the hash) |
| Appears in the site map as a route | no (only as an event) | yes |
| Use it for | a pure command with nothing to link to (toggle theme, toggle language) | an action a user may want to *reach by URL* (About, Preferences, a dev panel) |

Both are supported. **Pick one idiom per app and keep the menu consistent** —
gui_agent and gui_treedb wire their account menus with `type:"event"`; wattyzer
routes everything (`/about`, `/devtools`, `/sitemap`). A menu that mixes them
reads as an accident.

**`redirect` — what the URL does after the event fires:**

| `redirect` | What the shell does | Use for |
|---|---|---|
| `"back"` | Restore the **previous resting view route** (URL included), **then** fire the event. The URL never lingers on the action route. | A **floating window / panel** the app opens itself (`/devtools`, `/sitemap`). |
| `"stay"` | Fire the event first and **keep the URL on this route** so it is deep-linkable. The URL is *not* restored. | A **modal the app closes through a helper that puts the URL back** (see the trap below). |
| `"<route>"` | Fire the event, then navigate to that route. | `logout → "/"`. |
| `"none"` / `""` | `replaceState` the URL back to the previous resting route, **then** fire the event. The app takes over. | The app tears the shell down itself (logout). |

> **Ordering matters** for `back`/`none`: the URL is restored **before** the
> event fires, so an overlay opened by the handler registers its synthetic
> history entry on the *restored* hash. (Event-first left the entry on the
> action hash; closing the overlay then `history.back()`ed onto the action's
> own stranded route entry and **re-fired it** — the "site-map window won't
> close" loop.)

> **The `stay` trap — this is the one that bites.** `stay` does **not** restore
> the URL: *"the app's overlay close path is responsible for `history.back()`"*
> (`c_yui_shell.js`). So `stay` is only correct when whatever opens the overlay
> also takes the URL back off the route on close. wattyzer's `open_route_modal`
> does exactly that (its `on_close` calls `history.back()`), which is why
> `/about` and `/user/preference` are `stay`. A view opened by a plain helper —
> e.g. `yui_shell_show_route_map`, which just builds a `C_YUI_WINDOW` and
> registers it on the overlay stack (§6) — has **no such hook**: with `stay` the
> window closes and the URL sits on `/sitemap` forever, pointing at nothing.
> Use `back` for those. **Rule of thumb: `stay` only if the opener owns the
> URL on close; otherwise `back`.**

Browser **Back still closes a `stay` overlay** (§6): the shell matches the
overlay marker's own hash, so the URL sitting off the resting route — the
whole point of `stay` — does not blind it. The test-app's `/prefs` entry is
the reference wiring (`redirect:"stay"` + an `on_close` that `history.back()`s
off the route, wattyzer's `open_route_modal` idiom); `_qa_prefs.mjs` drives
open / Back / X / Escape / deep-link against it.

Deep-linking straight onto a `stay` route (or reloading on it) is handled: the
shell mounts the default view underneath first, then re-pushes the hash on top,
so a later close → Back lands on the default instead of exiting the app.

The rest of the configuration vocabulary — `zones`, `stages`, `menu`, `toolbar`,
`items[]`, `lifecycle` (`eager` / `keep_alive` / `lazy_destroy`), the
`submenu.index` / `submenu.default` pair — is **not** repeated here: it lives in
[`SHELL.md`](SHELL.md) §3. Read it before adding a route. In particular
`submenu.index` decides whether a primary's own route is a real resting page or
**redirects** to a child, which is the difference between `/system` (index: it
stays) and `/devices` (no index: it redirects to its first child).

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

## 9. Conformance status

The shell's engine (route index, resolution, `subpath`, overlay stack, the
nav-click → `location.hash` push path) implements this contract.

1. **push vs replace on programmatic navigation** — **done**. Every consumer is
   explicit and the default is now **push**; `{replace:true}` marks the
   code-decided moves. Per consumer:
   - **gui_treedb** — user moves (topic/mode select, ← topics, "manage
     connections") push; its four `c_app.js` fix-ups (deselected tab, F5
     re-land, deep-link auto-open, workspace → first tab) are `{replace:true}`.
   - **gui_agent** — audited: it has no programmatic user moves at all (its
     moves are nav clicks, which push through the shell). All three sites are
     redirects and carry `{replace:true}`.
   - **wattyzer** — user moves (device/monitoring card → history, history ←
     realtime, treedb topic/mode select) push; `nav_back_or_default()`'s
     root fallback is `{replace:true}`.

   Note the asymmetry that justifies the default: a forgotten `{push}` silently
   broke Back (the bug this debt was about), while a forgotten `{replace}` only
   leaves a redundant history entry. The default is the failure-tolerant one.
2. **Connections tab as a remembered position** — **fixed** (gui_treedb): the
   picker is recorded as a first-class active position (`CONNECTIONS_TAB`
   sentinel), so re-entering a workspace returns to it; `active_tabs` now mirrors
   the URL instead of excluding the picker.
3. **Topics "Schema" landing is a route** — **fixed**:
   `/topics/db/<sel>/schema`; the toggle is a push navigation (host-supplied
   `landing_routes`), `apply_seg` maps `schema` → `EV_SET_LANDING_VIEW`, the bare
   tab route resets to cards, so F5/Back/deep-link all work.
4. Graph `operation_mode` / `layout` live in localStorage only — **acceptable**
   under §3 (they are *preferences*), recorded here as a deliberate decision.

A **site-map viewer** (`shell_route_map.js`, `yui_shell_show_route_map`, on
`yui_shell_nav_map` — pure builder in `route_map_model.js`, unit-tested)
renders the WHOLE navigation surface (§4) — toolbar + account menu + **every**
declared menu + dynamic tabs, in declaration order — as a printable,
clickable, filterable map that doubles as the app's basic documentation.
Views that use the sub-route contributor protocol (§5.4) also appear with
their deep levels (topics, `/info`, `/schema`, focus topics); routes declared
**only in the route table** (root `/`, URL-only action routes) get their own
"other routes" group, so the map is the *complete* tree and an orphan route is
visible instead of silently unreachable. The row of the route the user is on
is marked **"you are here"** and scrolled into view. Clicking a route
navigates natively: a resting-route change closes the map through the
overlay drain (§6), a subpath/action jump keeps it open as a navigation
panel, and clicking the current route just closes it.

---

*Home of this contract: `kernel/js/gobj-ui/ROUTING.md` — this file **is** the
published chapter (doc.yuneta.io/routing includes it from here, so there is no
copy to drift), alongside [`SHELL.md`](SHELL.md) at doc.yuneta.io/shell. Keep it
in sync with the shell: an edit here ships on the next `docs/doc.yuneta.io/deploy.sh`.*
