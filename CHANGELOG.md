# Changelog

`@yuneta/gobj-ui` — Yuneta UI library (v2 declarative shell on the GObject-JS
runtime). This file tracks the **v2 line** (`main`); the frozen v1 GClass GUI
stack is maintenance-only and versioned separately (`1.x`, npm dist-tag
`legacy`).

## Unreleased

- **BREAKING(theme): the legacy `__yui_main__` theme path is retired; graphs
  follow the theme LIVE. New `src/yui_theme.js`.** The three G6 components
  asked a legacy C_YUI_MAIN `__yui_main__` service for the theme — read its
  `theme` attr, subscribe to its `EV_THEME`. Nothing ever *wrote* that attr, so
  it answered `"light"` for the life of the app, and no shell published
  `EV_THEME`. Worse, in `C_G6_NODES_TREE` the working mechanism (a
  MutationObserver on `<html data-theme>`) sat in the ELSE of that lookup, so
  merely *having* such a service swapped a live observer for a dead path; and
  `C_YUI_GOBJ_TREE_JS` / `C_YUI_JSON_GRAPH` never watched the theme at all —
  they read it once at build, so toggling to dark with the view open left a
  white canvas on a dark app. `C_YUI_JSON_GRAPH` also looked the service up
  with `verbose=true`, logging *"gobj service not found: __yui_main__"* on
  every mount under C_YUI_SHELL. Now: one `yui_theme.js` (`yui_theme_now()`,
  `yui_is_dark()`, `yui_watch_theme()`), `<html data-theme>` as the single
  source, and the DOM mutation translated into `EV_THEME` so the gclass
  restyles in its ACTION. `C_YUI_GOBJ_TREE_JS` and `C_YUI_JSON_GRAPH` gained
  `EV_THEME` + `ac_theme`; `C_YUI_GOBJ_TREE_JS`'s private `gt_is_dark()` is now
  `yui_is_dark()`. With that, `__yui_main__` has no consumer left in the
  library and the test-app's `C_DEMO_MAIN` is **deleted** — the legacy service
  is gone from v2. `C_YUI_FORM` and `C_YUI_TREEDB_SCHEMA` dropped their own
  hand-rolled copies of the is-dark helper for `yui_is_dark()` (there were
  four); the schema graph, which also read the theme only at build time, now
  watches it and rebuilds. `C_YUI_FORM` deliberately does **not** watch: it
  reads at field-build time and the hosting dialog rebuilds it on every open,
  so re-rendering under the user mid-edit would throw away what they typed. **Migration:** an app registering a `__yui_main__` service
  for gobj-ui's benefit can drop it; set `<html data-theme>` instead (the shell
  toggle already does).
- **fix(gobj-tree): the popover's text was invisible on dark.** Its chrome
  used Bulma scheme vars (so the card went near-black on dark) but the rows it
  renders hardcoded `color:#1A1A1A` for the value and `#6B7280` for the label —
  near-black text on a near-black card, luminance 26 vs 22. The rows now use
  `var(--bulma-text-strong)` / `var(--bulma-text-weak)` like the chrome around
  them, so the popover follows the theme with no redraw (CSS vars flip with
  `<html data-theme>`).

- **fix(treedb-graph): the edition popovers were light-on-white on dark.**
  `create_popover_base()` (the shell behind the node/edge/create/confirm
  popovers) hardcoded `background:#fff` and set no text colour, while the
  labels inside inherit theirs — so once the app went dark the card stayed
  white and its text turned light: invisible. Same for the Cancel button
  (`background:#fff;color:#333`). Both now use Bulma scheme vars. Only reachable
  in `edition` operation mode, which is why the read-only detail popover (a
  different, already theme-aware path) looked fine. *Known gap:* the native
  number input and select inside those popovers keep their light chrome — dark
  text on white, readable but light-themed.

- **fix(json-graph): dark palette for the cards.** Its canvas followed the
  theme but the cards did not: fill, key text and the by-type scalar colours
  were hardcoded for a light card, so on dark they were cream rectangles with a
  dark-green/blue palette sinking into them. New `json_card_style(group, dark)`
  + `type_color(type, dark)`, same visual language as the gobj-tree's
  `role_card_style()` — tinted fill + group-colour border, brightened on dark.
  dict and list share a stroke, so each keeps a `tint` (teal / yellow) to stay
  apart at a glance alongside the dashed/solid border; the light theme renders
  exactly as before. Fixes an edge that drew with `colors.stroke` where the
  palette object no longer had one.

- **BREAKING(window, map, treedb-graph): the legacy `__yui_main__`/`EV_RESIZE`
  path is retired; every window is STARTED.** Windows were created with
  `gobj_create_service` and never started — `c_yuno`'s `mt_play` only starts the
  DEFAULT service, so each one showed up in every trace line as
  `!!C_YUI_WINDOW^<name>`, which is the framework saying the gobj is not
  running. The reason they were never started was circular: `mt_start`
  subscribed to `EV_RESIZE` from a legacy C_YUI_MAIN `__yui_main__` service, so
  `C_YUI_WINDOW` wired its resize natively in `mt_create` to be
  start-independent and nobody bothered starting them. That legacy path is now
  gone — C_YUI_SHELL provides no `__yui_main__`, so it never fired under v2, and
  where an app did provide one it just duplicated the native listener. Every
  window (`setup_dev`, the treedb graph/topics Raw JSON, the map marker, the
  tranger Keys/Raw JSON) is started at its creation site. Removed with it:
  `C_YUI_WINDOW`'s `mt_start`/`mt_stop` (now empty) and its `EV_RESIZE`
  action/event, `C_YUI_MAP`'s (whose `ac_resize` was an empty `// TODO` — the
  real mechanism is its `ResizeObserver`), and `C_YUI_TREEDB_GRAPH`'s (whose
  `ac_resize` only forwarded to `C_G6_NODES_TREE`, which already observes its
  own container). **Migration:** an app that publishes `EV_RESIZE` from a
  `__yui_main__` service can stop — nothing subscribes any more. Reading
  `__yui_main__.theme` is unaffected.
- **feat(window, modal): `title_prefix` — the data half of a title, so titles
  can change language.** Window and dialog titles are nearly always
  "<what> · <kind>" (`raw_tracks · keys`), and every caller composed that into
  one string: `` `${topic} · ${t("keys")}` ``. The result is not an i18n key, so
  i18next answers it with itself and the title stays in the language it was
  built in for the life of the window — the exact trap
  `feedback_i18n_must_be_retranslatable` describes. `title_prefix` (data, never
  translated) now carries the "what", `title` stays the KEY for the "kind", and
  the two render as separate text nodes (`WINDOW_TITLE_PREFIX` +
  `WINDOW_TITLE_KIND`, `MODAL_TITLE_PREFIX` + `MODAL_TITLE_KIND`) so a
  `refresh_language()` re-translates just the kind half. The separator is a CSS
  `::before`, never a text node — `createElement2` trims text nodes and would
  eat the spaces around it. The dock chip joins both halves itself (it paints
  plain text, no `data-i18n`). Migrated: the Keys picker and every Raw JSON
  window/sheet (treedb graph, treedb topics, tranger view).
- **fix(map): the marker window is titled.** `c_yui_map`'s popup window passed
  neither `title` nor `header`, so its bar was empty — and several markers can
  be open at once, with nothing saying which is which. It now carries the
  marker's service name (`title_prefix`), a `yi-location-dot` icon and
  `logical_class: "MAP_MARKER_WINDOW"`.
- **fix(treedb-topics): `TOPICS_LOAD_ERROR` logical class.** The error banner
  was `treedb-load-error` — a logical name in lowercase, which the DOM
  convention reserves for styling. Same fix as the graph's `GRAPH_LOAD_ERROR`.
- **BREAKING(window): `C_YUI_WINDOW` paints its `title` in the title bar, and
  `title` is now an i18n KEY.** `title` only ever reached the dock chip, so a
  window without a hand-rolled `header` painted an EMPTY title bar: the Keys
  picker was anonymous, and the Raw JSON windows looked titled only because
  `C_YUI_JSON` re-titled itself INSIDE the body (doubling the title on mobile,
  where the host dialog draws its own header). The title bar now falls back to
  an `icon`+`title` strip (`WINDOW_TITLE`) when no `header` is given; `header`
  still wins, and stays the way to put more than a title up there (the dev
  monitor's toolbar, its two-line title). Callers that hand-rolled the same
  icon+text strip dropped it (`yui_frontend_view`, the site-map window), and
  the treedb/tranger viewers stopped passing `title` to `C_YUI_JSON` — the
  host titles it. **Migration:** pass `title: "some key"`, not
  `title: t("some key")` — the bar carries the key in `data-i18n` so it
  re-translates on a language change, and the dock chip translates it at
  registration. A composed title (`` `${topic} · ${t("keys")}` ``) is not a key,
  i18next answers it with itself, and it renders unchanged — as before.
- **fix(treedb-graph): "← topics" is pinned outside the scrolling toolbar.**
  It was `unshift`ed into `yui_toolbar()`'s left items, i.e. into the
  horizontally SCROLLING container it shares with layout / operation mode /
  refresh / raw json — so on a narrow viewport the only control that LEAVES the
  view could scroll out of reach. It is now a sibling of the toolbar, pinned
  first in the row (`GRAPH_TOOLBAR_ROW`), like the topics view's back button,
  whose plain non-scrolling strip never moves.
- **fix(treedb-graph): logical DOM class names.** Only the root carried one.
  Added `GRAPH_TOOLBAR_ROW` / `GRAPH_BODY` / `GRAPH_CANVAS` /
  `GRAPH_LAYOUT_LABEL` / `GRAPH_LAYOUT_SELECT` / `GRAPH_MODE_LABEL` /
  `GRAPH_MODE_SELECT` / `GRAPH_MODE_BUTTONS` / `GRAPH_REFRESH` /
  `GRAPH_LOAD_ERROR`, per the repo's uppercase-is-logical convention. This
  renames the lowercase logical names that were doubling as selectors
  (`graph_layout`, `graph_operation_mode`, `mode_buttons`, `treedb-load-error`)
  and the refresh button's `EV_REFRESH_TREEDB` class (an EVENT name used as a
  class); all of them were queried only from within this gclass. The dead
  `toolbar_yui_treedb_graph` (no CSS rule anywhere) is gone, and
  `graph-container` stays — it is a real styling hook (`lib_graph.css`
  `:fullscreen`).
- **feat(dev): `setup_frontend_view(self)` — the gobj tree in a floating
  window, peer of the developer window.** `C_YUI_GOBJ_TREE_JS` (the live gobj
  tree of the own yuno) already existed, but every app had to host it itself,
  and the only in-tree consumer mounted it as a full stage view behind an admin
  menu. The new helper (`src/yui_frontend_view.js`, exported from `index.js`)
  builds it the way `setup_dev` builds the developer monitor: a non-modal
  `C_YUI_WINDOW` named **`Frontend-View-Window`** (title bar + maximize +
  close + resize, `auto_save_size_and_position`, `logical_class`
  `FRONTEND_VIEW_WINDOW`), opting into the dock/taskbar when the app has a
  window manager. Hosts toggle it exactly like the developer window
  (`gobj_find_service("Frontend-View-Window", false)` → destroy, else
  `setup_frontend_view(gobj)`). The tree is created as a **pure child of the
  window**, so every teardown path — the ✕, or the host destroying the window
  to toggle the entry off — takes it down with it; the window body is a
  placeholder because `C_YUI_WINDOW` builds its UI in `mt_create` and cannot be
  handed a gobj that does not exist yet. The window title carries its `i18n`
  key (`"frontend view"`), so it re-translates on a language change; apps
  mounting it must define that key **and** `C_YUI_GOBJ_TREE_JS`'s own keys
  (`layout`, `gclass`, `full name`, `name`, `status`, `state`, `parent`,
  `children`, `(collapsed)`) — the library translates through the app's
  i18next. Wired into the test-app's account menu ("Frontend view", below
  "Developer window").

- **fix(shell): overlay↔history bookkeeping survives navigating with
  overlays open.** The old bookkeeping assumed an overlay's synthetic history
  entry was always ADJACENT to the current one. It isn't once the user
  route-navigates with Back-dismissable overlays open: their entries get
  **buried** beneath the new route entries — and dismissing one (X / Escape /
  code) blindly `history.back()`ed over a REAL route entry, **teleporting the
  user** to the pre-overlay route. The synthetic entry's state marker
  (`{__yui_overlay__: id}`) is now the authority everywhere:
  `overlay_dismissed` only retires the entry when its marker is the *current*
  history entry (adjacent → the back() is invisible), leaving buried entries
  inert (a later Back absorbs them as a same-hash no-op); the popstate handler
  treats only landings on **the marker's own hash** as overlay pops (fragment
  navigations fire popstate too — landings on any other hash belong to the
  hashchange routing); and the shell's silent `replaceState` URL fix-ups
  preserve `history.state` so they can't wipe a live marker (and re-tag the
  marker's recorded hash, which they just rewrote). The route side of the
  rule: **`navigate_to` closes every registered overlay when the RESTING
  route changes** (overlays are transient, ROUTING.md §3/§6) — a transient
  action route or a subpath-only move keeps them open. Verified end-to-end
  (Playwright/Firefox on the test-app, `_qa_routing.mjs` / `_qa_prefs.mjs`):
  classic open→Back-close, X-close in place, stacked overlays + navigate
  (both close, dismissing the buried one does not teleport), Back absorbing
  inert entries, and both action-route flavours (`back` and `stay`).

  Two follow-ups to that pass, each a user-visible break in wattyzer (the
  only consumer with action routes — gui_agent/gui_treedb declare none, which
  is why neither the unit suite nor the test-app caught them):

  - **Back could not close a `redirect:"stay"` modal.** The popstate guard
    matched the hash of the **resting route**, but `stay` is precisely the
    flavour that parks the URL *off* it (`current_route` stays on the view
    underneath, ROUTING.md §7.1) — so every Back over a `stay` modal's marker
    was misread as a route traversal and ignored, leaving the modal
    unclosable by Back (wattyzer's `/about`, `/user/preference`,
    `/connection`). The marker now records the hash it was pushed on and that
    is what the guard compares: stepping off a marker always lands on the
    marker's hash, whatever the resting route is.
  - **The overlay drain skipped every redirect.** It was gated on redirect
    depth 0, so the identical click drained or not depending on whether the
    target redirected: with the site map open, a direct route closed it but a
    submenu default (`/devices` → `/devices/inventory`), an unknown-route
    default or an action's `"<route>"` redirect did not — contradicting the
    rule stated right above. The drain now runs at every depth. The one
    exception is about ORDER, not depth, and is explicit (`no_drain`): a hop
    continuing an action route whose event already fired must not kill the
    overlay that event just opened.

- **fix(shell): action-route `redirect:"back"`/`"none"` restore the URL
  BEFORE firing the event.** Event-first let a handler-opened overlay
  register its synthetic entry on the ACTION hash; the restore then rewrote
  that entry, stranding the action's own route entry below it — closing the
  overlay `history.back()`ed onto that entry and **re-fired the action**:
  wattyzer's site-map window closed and instantly reopened ("the X does
  nothing"). With the restore first (`back` = full re-mount of the previous
  resting view, `none` = `replaceState`), the overlay's entry lands on the
  restored hash and every close path (X / Escape / Back / toggle) is
  invisible. `stay` keeps event-first (the URL must remain on the action
  route); an explicit `"<route>"` keeps event-first too (logout-style
  teardown). ROUTING.md §7.1 documents the ordering.

- **feat(site map): complete tree, "you are here", sound toggling.** The nav
  map builder moved to `route_map_model.js` (pure, unit-tested) and now
  covers the WHOLE surface: **every** declared menu (not just `primary`;
  extra menus render as labelled groups) and an **"other routes"** group for
  routes declared only in the route table (root `/`, URL-only action routes)
  that no menu item points at — an orphan route is now visible instead of
  silently unreachable. The viewer marks the current route's row **"you are
  here"** (auto-scrolled into view), toggles correctly in the modal fallback
  too, and jumps **natively**: clicking a route lets the browser navigate and
  the resting-route drain closes the window (the old close-then-deferred-
  navigate raced the dismissal's `history.back()` and could land back where
  it started); a subpath/action jump keeps the map open as a navigation
  panel; clicking the current route closes it. The test-app account menu now
  ships a "Site map" entry wired as a `/sitemap` action route
  (`redirect:"back"`, the wattyzer idiom) — the offline QA surface for this
  whole flow (`_qa_sitemap.mjs`).

- **fix(site map): config comments are not routes; "you are here" is
  singular; the brand can hold it.** Three defects in the new map, all found
  reviewing it:
  - JSON has no comments, so these configs annotate `shell.routes` with
    sibling `_name_comment` **string** keys (the established idiom, used by
    the test-app and wattyzer). The shell indexed **every** key of the table,
    building a route entry whose target was the comment TEXT — harmless while
    nothing enumerated the index, but the map's new "other routes" group
    rendered it as a clickable row that redirects to the default, and
    `resolve_route` would have matched it. A route **is** a path: only `"/…"`
    keys are indexed now, and a non-object target under one is an error, not
    a silent skip.
  - `yui_shell_set_sub_routes` stores the **caller's** node objects by
    reference, and the builder spliced them straight in — so marking the
    current node **mutated a view-owned object that nothing ever cleared**.
    Every later build kept the stale mark: two `ROUTEMAP_HERE` badges, and
    `scroll_to_current` scrolling to the wrong one. Contributed nodes are
    cloned; `build_nav_map` is pure again, as documented.
  - the **brand** was the one rendered node in neither `toolbar`, `nav` nor
    `other`, so an app whose brand routes home (`/`) could never show "you
    are here" at all. It is marked last, so a menu item on the same route
    still wins.

- **fix(shell): route normalization.** Hashes come from the outside world —
  typed URLs, shared links, old bookmarks. `#/a/b/` (trailing slash) missed the
  route index entirely (the ancestor walk pops a real segment first), silently
  landing on the unknown-route default instead of `/a/b`. Every route entering
  the shell is now canonicalized (`normalize_route` in `route_resolver.js`:
  leading `/`, duplicate slashes collapsed, trailing slashes stripped, root
  kept) before resolution, and the URL is rewritten to the canonical form.

- **fix(shell): redirect loops fail loudly.** A config cycle (submenu default →
  unknown route → default route → …) recursed `navigate_to` to a stack
  overflow, killing the app with a mute `RangeError`. Redirect recursion is now
  capped (depth 8): the loop logs the offending route and shows the stage
  placeholder instead.

- **fix(gobj-tree): lower-case its i18n keys.** `c_yui_gobj_tree_js` was the
  only module asking i18next for capitalised keys (`t("Close")`, `t("GClass")`,
  `t("Status")`, …). Keys are lower-case by convention, so **no consumer could
  define them without failing its own locale validator** — they rendered raw, in
  every language. Now `close` / `gclass` / `status` / …, which every app already
  defines for the common ones. No consumer defined the capitalised forms, so
  nothing breaks; an app mounting this view must define `gclass`, `full name`,
  `parent`, `children`, `(collapsed)` and `layout`.

- **feat(index): export the site-map API from the barrel.**
  `yui_shell_show_route_map` and `yui_shell_register_event_handler` were only
  reachable via deep `./src/…` imports, so a consumer of the `index.js` barrel
  (wattyzer) could not mount the site map at all. Both are part of the public
  surface now.

- **fix(treedb-topics): readable toolbar on mobile.** The toolbar never holds
  more than two buttons at once (back|schema-toggle left, raw-json right), so
  the labels now stay on mobile instead of collapsing to bare icons — `←` and
  `👁` side by side read as the same control. The raw-json button also moved
  last with `margin-left:auto`, so it sits flush right, away from the back
  arrow, in both the landing and topic states. A deliberate exception to the
  icon-only-on-mobile rule, noted in the code; the graph toolbar has many more
  controls and keeps `is-hidden-mobile`.

- **BREAKING(shell): `yui_shell_navigate()` now PUSHES by default.** It used to
  replace unless the caller passed `{push:true}`; it now creates a Back entry
  unless the caller passes `{replace:true}`. `{push:true}` stays accepted (now
  redundant) so migrated call sites keep documenting their intent. **Migration:**
  any call that is a redirect / normalization / F5-restore — anything CODE
  decided rather than the user — must add `{replace:true}`, otherwise it leaves
  a spurious Back entry. Calls that are genuine user moves need no change and
  gain working Back/Forward. In-tree consumers (gui_treedb, gui_agent, wattyzer)
  are migrated. Rationale and the per-caller inventory: `ROUTING.md` §7/§9.1.

- **feat(shell): event → handler-gclass registry for the site map.** New
  `yui_shell_register_event_handler(shell, event, gclass)`: a gclass that handles
  a toolbar/account action event self-declares, so the site map stamps the
  handler gclass on action-event nodes too (the shell can't know the runtime
  subscriber statically). gui_treedb's `C_TREEDB_APP` registers its account/
  toolbar events, so those rows now show `C_TREEDB_APP`.

- **feat(shell): site-map rows show route + gclass + event.** Every item now
  documents where it is implemented — its hash route, the view **GClass** mounted
  there (resolved from the route index; contributed sub-routes carry their own),
  and the action **event** it fires — as distinct pills. The filter matches these
  too (search by gclass name).

- **feat(shell): site-map match counter + window title.** The filter shows a live
  match count beside it, and the site-map window now has a title bar (icon +
  "Site map") — `C_YUI_WINDOW`'s `title` attr is only the dock-chip label, so the
  header content is passed explicitly.

- **feat(shell): search filter in the site-map tree.** A filter box collapses
  the route tree to matching nodes plus their ancestor path (and a matched
  node's whole subtree); it matches the visible row text (name + route + event,
  so it honours the current language), highlights self-matches, and clears via
  the standard ✕.

- **fix(shell): site map opens in a resizable window; dark-mode event badges
  legible.** The site-map viewer now hosts its tree in a floating, resizable,
  maximisable `C_YUI_WINDOW` (toggles; a modal is the fallback when
  `C_YUI_WINDOW` isn't registered) so it can be viewed larger; Print clones the
  tree off-screen so it prints alone. The action-event badges no longer use
  Bulma's `is-light` tag — explicit theme-aware colours keep them readable in
  dark mode.

- **feat(shell): sub-route contributor protocol — the site map shows view-owned
  deep levels.** New `yui_shell_set_sub_routes(shell, base_route, nodes)`: a
  mounted view declares the dynamic children of its base route (topics, `/info`,
  `/schema`, focus topics — subpaths that are not declared routes) into a shell
  registry the site map merges at render time (pull-at-render, so an unmounted
  view's children vanish automatically). `C_YUI_TREEDB_TOPICS` and
  `C_YUI_TREEDB_GRAPH` contribute theirs (host-supplied `base_route`, cleared on
  `mt_stop`), so the map is now the *complete* tree. See ROUTING.md §5.4.

- **feat(shell): push/replace navigation, a site-map viewer, and a routed
  treedb schema landing (ROUTING.md).** Landed the routing contract's mechanics
  (see `ROUTING.md`): `yui_shell_navigate(shell, route, {push:true})` now creates
  a real browser Back entry (routes through `location.hash`); without `{push}` it
  replaces as before, so existing callers are unchanged. New
  `yui_shell_nav_map(shell)` exposes the **whole navigation surface** — the
  toolbar (incl. the account dropdown), the primary menu and its live dynamic
  tabs — as an ordered tree (declaration order, never alphabetised); each node
  carries its icon, name, hash route or action event.
  `shell_route_map.js` / `yui_shell_show_route_map` render it as a **printable,
  clickable site map** meant to double as the app's basic documentation.
  `C_YUI_TREEDB_TOPICS`'s schema landing is now URL-addressable: a new
  `landing_routes` attr makes the cards↔schema toggle a push navigation
  (`.../db/<sel>/schema`), driven by `EV_SET_LANDING_VIEW`; the bare tab resets to
  cards, so F5/Back/deep-link work. `build_schema_child` waits for `descs` (F5 to
  `/schema` no longer renders an empty graph).

- **feat(treedb): schema-graph landing (prototype).** New gclass
  `C_YUI_TREEDB_SCHEMA` draws the treedb as a **graph of topics** — one G6 node
  per topic, one edge per `hook`/`fkey` relationship — from the schema `descs`
  alone (no data, no backend calls; left-to-right dagre following parent→child).
  A node click opens that topic's table via a host-supplied `node_route` hash
  (deep-linkable, Back-friendly). `C_YUI_TREEDB_TOPICS` hosts it as an alternate
  landing: a toolbar toggle (`EV_TOGGLE_LANDING_VIEW`) switches the landing
  between the cards grid and the schema graph; the child is built lazily on
  first switch. Prototype scope: nodes + relationship edges + click-to-open (no
  theme-change re-render or live schema edits yet).

- **feat(treedb): a "← topics" button in the graph view.** `C_YUI_TREEDB_GRAPH`
  gains an optional `back_route` attr; when set (host-supplied), the toolbar
  shows a real hash-link "← topics" button back to the topics grid — symmetric
  with the topics view's own back button, for a graph reached from a topic
  card's graph icon. Empty ⇒ no button (e.g. wattyzer).

- **feat(treedb): graph focuses a topic; info panel shows topic metadata.**
  The topic card's **graph** icon now deep-links to `#/graphs/db/<sel>/<topic>`:
  `C_YUI_TREEDB_GRAPH` forwards the segment (`EV_SET_FOCUS_TOPIC`) to
  `C_G6_NODES_TREE`, which highlights every node of that topic (a new amber
  `active` node state) and centres the viewport on them (`focusElement`),
  deferring until the graph data has loaded (F5-safe). The graph's URL segment
  is now the focus topic; the operation mode is no longer routed (it stays a
  persisted UI control). The routed **info panel** now leads with topic
  **metadata** — version (emphasised), system flag, pkey, tkey — above the
  columns table.

- **feat(treedb): topic cards gain 3 hash-routed actions + a routed info panel.**
  Building on the cards landing, each topic card can now carry three real
  `<a href="#…">` icon actions — **info / table / graph** — via the new
  `card_action_routes` attr on `C_YUI_TREEDB_TOPICS` (host-supplied templates
  with a `{topic}` placeholder, so the library stays route-agnostic). The
  **info** action opens a routed, read-only **schema panel** (pkey + columns
  with type and key relationship, from the topic `desc`); it is deep-linkable
  (`EV_SHOW_TOPIC_INFO`, replayed once the schema loads on an F5). Absent the
  attr, the card keeps its single "open the table" behaviour. A click anywhere
  on a card selects it (single-selection highlight, `EV_SELECT_TOPIC_CARD`):
  clicking outside the icons just selects, clicking an icon selects and enters.

- **feat(treedb): optional topic-cards landing (list → detail).**
  `C_YUI_TREEDB_TOPICS` gains `with_cards_landing` (default `false`, so existing
  consumers are unchanged). When on, entering the view shows a grid of topic
  cards (reusing the shell's `.yui-nav-cards` look) instead of opening a topic
  table straight away; clicking a card opens that topic's table with the tabs
  bar kept for quick switching plus a back-to-grid button (`EV_BACK_TO_TOPICS`).
  The card click and the tab click share one entry point (`select_topic_by_id`).
  A deep-linked topic (host `EV_SHOW` with `?<topic>`, e.g. F5 on a topic URL)
  still opens straight into detail; a plain entry lands on the grid, and the
  persisted last-topic is not auto-restored in this mode. Back publishes
  `EV_TOPIC_SELECTED` with an empty topic so a host can drop the `<topic>` URL
  segment.

- **fix(treedb): row selection is checkbox-only; no hover wash.**
  `C_YUI_TREEDB_TOPIC_WITH_FORM`'s table used `selectableRows:true`, so clicking
  anywhere on a row — including the edit (yi-pen) button — implicitly ticked its
  *Select Row* checkbox, and hovering washed the row with a highlight that read
  as a selection. It now uses `selectableRows:"highlight"`, which disables
  click-to-select while keeping the checkbox column fully functional (the
  `rowSelection` formatter toggles selection directly), so opening the edit form
  no longer selects the row. A reusable `yui-no-row-hover` modifier on the
  `.tabulator` element (in `tabulator.css`) suppresses the whole-row hover wash
  and pointer cursor for unselected rows in every theme; only a checkbox-selected
  row changes colour. Scoped to this table — other tables' hover is untouched.

- **feat(form): `C_YUI_FORM` regains the "edit" vs "exec" render modes.** A new
  `render_mode` attr (`"exec"` default, `"edit"`) controls how the three
  *structured* column types are rendered. `"exec"` **interprets** them into
  sub-widgets — `template`→nested sub-form (`fieldset`), `table`→Tabulator grid,
  `coordinates`→map picker. `"edit"` shows them as **raw JSON editors**, the way
  the pre-merge `C_YUI_TREEDB_TOPIC_WITH_FORM` field builder did (a regression
  from the single-form consolidation, commit `0823563`, which kept only the
  exec dispatch). Everything else (scalars, `enum`→select, `fkey`→select2, plain
  `dict/array/blob`→jsoneditor) is identical in both modes. The load/save
  conversions (`treedb_value_2_form_value` / `form_value_2_treedb_value`) are
  mode-aware so the raw JSON round-trips. `C_YUI_TREEDB_TOPIC_WITH_FORM` now
  hosts the form with `render_mode:"edit"` — editing a topic record (e.g.
  `device_types`) again shows its `template`/`table`/`coordinates` columns as
  JSON editors instead of interpreting the stored schema into live widgets. This
  also sidesteps the malformed-`enum_list` crash below for `device_types`: that
  `enum` only existed as an interpreted sub-field of the template, which "edit"
  mode no longer expands.

- **fix(form): a malformed enum no longer crashes the whole form.**
  `C_YUI_FORM`'s `select` / `select2` branches assumed `options` was always an
  array; an `enum` column whose `enum_list` was missing or non-array threw
  `options.map is not a function` and aborted building the entire record dialog
  (seen editing a `device_types` row). They now render an empty select and
  `log_error` the offending field (topic/type/real_type) instead of crashing.
  Pre-existing since the v2 src move; unrelated to the clear-button/modal work
  below.

- **feat(inputs): clear (✕) is now the NORM on every editable free-text
  field.** Standardized on the existing `attach_clear()` helper
  (`yui_inputs.js`, Bulma `.delete` that appears only while the field has
  content, dispatches a synthetic `input` so existing handlers re-run, then
  refocuses). Wired it into `C_YUI_FORM`'s field factory so **every** form
  field (text / password / url / tel and the text-backed numerics) carries the
  ✕ (excluded: color, datetime-local, readonly) — a big help on mobile. Three
  bespoke one-off clears were replaced with the helper for a single consistent
  look: `C_YUI_JSON`'s toolbar search (its `EV_CLEAR_SEARCH` event was dropped —
  the synthetic `input` re-fires `EV_SEARCH`), the `C_YUI_TREEDB_TOPIC_WITH_FORM`
  table search, and `C_YUI_FORM`'s geolocation field (which now also correctly
  re-fires `EV_RECORD_CHANGED` on clear — previously it left the record model
  stale). The ✕ now hides itself while an input is `readonly`/`disabled`, and a
  new `refresh_clear($input)` re-evaluates it after a **programmatic** change
  (value loaded, `readonly` toggled). This fixes the pkey (`id`) field: it is
  built `readonly` from the schema but `apply_form_mode` makes it editable in
  "create" mode, so it now gets the ✕ there (and stays without one in "update",
  where it is readonly); loaded values also show the ✕ immediately instead of
  only after an edit. The ✕ is now gated on `:focus-within` (`yui_inputs.css`):
  it appears only on the field that currently holds focus for editing, not on
  every populated field at once — on an edit form full of pre-filled values that
  otherwise lit up an ✕ on every text field. Content-presence is still tracked
  in JS (`is-visible`); focus decides whether it actually shows.

- **feat(shell modal): `before_close` guard on `yui_shell_show_modal`.** A new
  optional `opts.before_close` is consulted on every user-driven dismiss
  (Escape, backdrop, the X / back-arrow, browser Back); returning `false` vetoes
  the close so the caller can run its own flow (e.g. an unsaved-changes prompt
  that closes the modal itself on confirm). On a vetoed browser-Back the history
  entry is re-armed. Absent guard ⇒ closes exactly as before, so existing
  callers are unaffected. The returned `close()` still closes unconditionally.

- **refactor(treedb form): edit/create dialog uses the standardized adaptive
  dialog.** `C_YUI_TREEDB_TOPIC_WITH_FORM` dropped its hand-rolled Bulma
  `modal-card` (with the old `delete is-large` × and the dead
  `modal-is-responsive` CSS) for `yui_shell_show_modal({dialog:true})`, matching
  its sibling treedb views: centered card with the X top-right on desktop, a
  full-screen sheet with a back arrow on mobile, and Escape / browser Back /
  backdrop wired by the shell. The unsaved-changes guard is preserved via the
  new `before_close` hook (`TREEDB_FORM_SHEET`, widened to 50rem on desktop). A
  shell is now required (as the sibling dialogs already assume).

- **fix(toolbar): stop leaking a ResizeObserver per `yui_toolbar`, and make the
  scroll arrows reliable.** The horizontal toolbar observed `document.body` for
  resizes; because `<body>` lives for the whole page, the observer's callback
  pinned the toolbar's container (and its detached subtree) in memory for the
  page lifetime — one leaked observer per toolbar ever built. It now observes
  its own container, which is garbage-collected with the subtree and
  self-`disconnect()`s once detached. This also fixes the arrows frequently
  never appearing: inserting the toolbar changes `<body>` content but not its
  size, so the body observer often never fired; observing the container
  delivers an initial callback on layout and fires on width changes. Other
  toolbar polish: scroll step is now ~80% of the visible width (was a barely
  perceptible 20px), the arrows use the repo `yi-chevron-*` icon set (colored
  via `currentColor`, theme-aware) instead of a raw inline SVG with a hardcoded
  fill, hidden arrows toggle `display:''`/`none` so the CSS flex-centering
  reasserts, and the buttons gain `type="button"` + translatable
  `title`/`aria-label`. The arrows start hidden and the detach cleanup only
  fires once the toolbar has actually been live, so a non-scrollable toolbar
  never shows a stray arrow before its first layout. No API change
  (`yui_toolbar(attrs, items)`, CSS classes and export are unchanged; the
  caller's `attrs` object is no longer mutated).

- **feat(shell): browser Back closes modals and floating windows.** Overlays
  now integrate with browser history. Opening a shell modal
  (`yui_shell_show_modal`), a confirm dialog (`yui_shell_confirm_*`) or a
  floating `C_YUI_WINDOW` (one without a dock `manager`) pushes a synthetic
  history entry (same hash, so routing is untouched); the browser Back button
  then closes the top-most overlay instead of navigating the underlying view.
  Closing an overlay by any other path (X, Escape, backdrop, code) retires that
  history entry via `history.back()`, so a later Back navigates normally with no
  phantom step. Previously Back was a no-op on overlays and could strand an open
  modal/window over a changed route. New shell API
  `yui_shell_register_overlay` / `yui_shell_overlay_dismissed`; new
  `C_YUI_WINDOW` attr `back_dismissable` (default `true`, ignored for
  dock-managed windows). Gated on the shell's `use_hash`; dock-managed windows
  keep their persistent-workspace behavior.

- **feat(dev window): "Output" selector — Window / Console / Both.** The
  developer monitor can now route all its output (inter-event traffic + every
  framework log + the automata/FSM trace) to the dev window only, the browser
  console only, or both (default, unchanged). Persisted in `localStorage`
  (`dev_output_route`) and honoured across refreshes. "Window only" silences
  the browser console via gobj-js's new `set_console_log_enabled`; "Console
  only" stops mirroring into the window; traffic gains a clean one-line console
  form. Note: "Window only" gates the console framework-wide, so with the
  window closed nothing reaches the console — that is the literal meaning of
  the choice (default is Both).

- **feat(treedb views): disable the "Raw JSON" button while disconnected.** The
  "Raw JSON" button (`C_YUI_TREEDB_TOPICS` + `C_YUI_TREEDB_GRAPH`) issues a
  remote `print-tranger`, so it only makes sense with a live backend session —
  it is now disabled while the session is down and re-enabled on reconnect. The
  library view can't watch the `C_IEVENT_CLI` itself (subscribing there forwards
  upstream and breaks the session), so the host forwards the transport edges as
  a new `EV_TRANSPORT_STATE` event, which a view opts into by declaring it
  (`gobj_has_event` guard). Initial state is read from the remote's
  `ST_SESSION` at build.

- **fix(treedb JSON viewer): stop the C_YUI_JSON before destroying it.**
  Closing the Raw JSON viewer (in `C_YUI_TREEDB_TOPICS` and
  `C_YUI_TREEDB_GRAPH`) destroyed the still-running viewer gobj directly, so
  `gobj_destroy()` raised the `destroying` flag before it could stop it —
  logging *"Destroying a RUNNING gobj"* + *"gobj NULL or DESTROYED"* and
  skipping the viewer's `mt_stop` — on every close. Now stops first, then
  destroys (both the dismiss and the teardown paths). Same fix as the Keys
  picker earlier.

- **feat(dev window): error / warning totals in the status line.** The status
  strip now leads with `✖ N err` and `▲ N warn` — running totals of framework
  errors and warnings since page load (or the last Clear), bold when non-zero.
  Kept in dedicated counters (not scanned from the traffic buffer) so the
  600-entry cap can't rotate an error out of the count under a flood of
  automata/debug lines. Reset by Clear.

- **feat(C_YUI_JSON): lazy JSON tree viewer for large tranger/treedb dumps.** A
  container-agnostic component (`register_c_yui_json`) that renders arbitrarily
  large JSON via server-driven lazy expansion: it understands the kernel's
  `kw_collapse()` `__collapsed__` sentinels (emitted by `print-tranger`) and,
  when the user opens one, publishes `EV_EXPAND_PATH {path,size}` to its
  subscriber (which owns the backend) instead of fetching itself; the subtree
  returns via `EV_SUBTREE_LOADED`. Only expanded containers hit the DOM, so the
  tree stays bounded regardless of document size. With no sentinels it degrades
  to a plain client-side collapsible tree (search / expand / collapse / copy,
  timestamp tagging, i18n). Documented in the README.

- **feat(treedb views): "Raw JSON" button over C_YUI_JSON.**
  `C_YUI_TREEDB_GRAPH` and `C_YUI_TREEDB_TOPICS` each get a "Raw JSON" toolbar
  button that opens the treedb's tranger (via C_NODE `print-tranger`, lazy
  drill) in the new C_YUI_JSON viewer; a consumer that mounts these views must
  `register_c_yui_json()`. (An earlier "Tree JSON" button — a per-topic `jtree`
  view — was dropped before release: it only applied to self-referent tree
  topics and added little over the raw dump.)

- **style(C_YUI_JSON): viewer font set to `1em`** (inherits the host font)
  for readability of the raw tranger dumps, and the **"expand all"** toolbar
  icon is now the chevron rotated down (open state) instead of a plus — so it
  mirrors the per-node toggle and "collapse all" (chevron pointing right).

- **fix(period): the label is the loudest thing in the navigator again.** It
  is a `.button` INSIDE `.YUI_PERIOD_NAV`, so the three-class rule that sizes
  the arrows outranked the two-class label rule and pinned the label to the
  arrows' `1.25rem` — the row rendered flat, nothing standing out, the opposite
  of what it is for. The label rule now matches through the navigator too
  (measured: label 21.6px vs arrows 20px, as designed).

- **fix(period): the first granularities were unreachable on a phone.** The
  segmented strip was centred (`justify-content: center`), and a centred flex
  row that overflows spills out of **both** ends — but `scrollLeft` cannot go
  negative, so the buttons painted off the left edge ("All", "Hour") could not
  be scrolled to by any swipe: the browser exposed only half the overflow
  (measured at 360px: first button at `-28px`, `maxScroll` 28 of 57). The strip
  now uses `justify-content: safe center`, which centres it while it fits and
  falls back to start-alignment the moment it does not. The active granularity
  also scrolls itself into view on repaint, so a mode living at either end
  ("Custom") is visible when the picker opens.

- **fix(period): the overflow menu dismisses like a popover.** It only
  closed by re-clicking its `⋯` trigger: no outside-click dismiss, no
  Escape, and it stayed open when a mode was picked from the segmented
  control — on a phone its open items sat over the navigator swallowing
  taps meant for the label. It now uses the calendar popover's own dismiss
  pattern (capture-phase listener; the Escape that closes it stops there),
  closes on any `EV_SET_MODE`, and calendar/menu close each other (one
  popover at a time).

- **fix(period): the calendar formats in the APP's language.** Month
  names, weekday initials and the parked-bucket label were built with
  `navigator.language`, so a UI switched to Spanish showed "July 2026 ·
  M T W T F S S" inside an otherwise-Spanish dialog (and vice versa). All
  Intl formatting now follows i18next's active language, falling back to
  the browser's when i18next has none.

- **feat(period): calendar polish.** (1) The label carries a small
  calendar glyph — the affordance that it opens one (a phone has neither
  hover underline nor tooltip). (2) Hovering a cell previews the BUCKET a
  click would pick with a quiet inset ring: a week rings its whole row, a
  quarter its three months. (3) In week mode the day grid gains an ISO
  week-number gutter, and the number is clickable (it IS the name of what
  a click picks). (4) Every cell carries `title`/`aria-label` with the
  full instant ("14 July 2026") — the visible label is a bare number a
  screen reader hears without month or year. (5) When the granularity
  strip overflows, the hiding edge fades out (scroll + ResizeObserver
  toggling mask classes) — a 4px scrollbar is invisible to a thumb.

- **fix(period): the picker re-translates itself.** `C_YUI_PERIOD` declared
  the `EV_LANGUAGE_CHANGED` handler but relied on the HOST to forward the
  event, an obligation the README never stated (and an inconsistency:
  `C_YUI_TREEDB_TOPIC_WITH_FORM` subscribes itself). A bare picker mounted by
  a README-faithful consumer kept "Week 27"/month names frozen in the old
  language. It now subscribes itself to the shell in `mt_start` (a host that
  forwards anyway just repaints twice, harmlessly); README documents it.
  Also: the missing period keys (`minute`, `5min`, `15min`, `fortnight`,
  `last 6h`, `last 30 days`) added to the test-app bundles, the day-step test
  made honest in timezones whose DST transition happens AT midnight
  (America/Santiago: the first instant of that day IS 01:00 — assert bucket
  contiguity, not `hour === 0`), and the week-label test made deterministic
  across a year boundary.

- **fix(treedb-graph): the treedb-wide LINKED/UNLINKED subscription is
  dropped with the last topic.** It was armed once and never released, so it
  outlived every view of the treedb and kept pushing events whose handler
  discarded them. It now rides the per-topic subscriptions: last topic out,
  links subscription out (and back on the next subscribe).

- **feat(period): a date navigator, and the algebra under it
  (`C_YUI_PERIOD` + `yui_time.js`).** Picking a range was two
  `datetime-local` inputs that had to agree with each other; it is now a
  granularity plus a big `|< < LABEL > >|` navigator — pick "week", then walk.
  The label is the control: it says where you are in words a human uses
  ("Today", "Yesterday", "This week", "Last week", "Week 27", "July", "2025"),
  it opens a calendar (a day / month / year grid, chosen by the granularity's
  own unit), and under it the two timestamps the bucket RESOLVES to are always
  printed — a name is for the user, the query carries instants. `|<` and `>|`
  jump to the oldest and newest buckets the data actually holds (`min`/`max`),
  and an arrow that could only paint empty buckets greys itself out.

  A period is **not an enum of five names**: it is `(unit, count)`. So the same
  component gives an app quarters, semesters, bimesters, fortnights, decades or
  15-minute buckets by DECLARING them — nothing is added to the component:

  ```js
  gobj_create("period", C_YUI_PERIOD, {
      periods:      ["hour", "day", "week", "month", "year"],
      more_periods: ["bimester", "quarter", "semester", "decade"],  // overflow menu
      rolling:      ["1h", "24h", "7d"],   // NOT buckets: they end at `now`
      with_span:    true,                  // "All": no bounds
      with_custom:  true,                  // reveals the host's own from/to slot
      ms:           false                  // the consumer's time unit
  }, parent);
  ```

  It publishes `EV_PERIOD_CHANGED {mode, anchor, from, to}` and keeps `from`/`to`
  as read-only attrs, both in the CONSUMER's unit (seconds, or milliseconds),
  `0` meaning unbounded — the shape a query builder already speaks. Buckets that
  can be walked live in `ST_BUCKET` and the flat modes in `ST_FLAT`, so an arrow
  arriving where there is nothing to walk fails loudly instead of no-op'ing.

  `yui_time.js` is the pure half (no DOM, no dependency, no library): epoch
  conversions that cross the seconds/milliseconds flag, and the algebra —
  `period_bounds` / `period_shift` / `period_label` / `infer_period`. Buckets are
  ALIGNED (months to the year, weeks to Monday/ISO, hours to local midnight),
  the upper bound is INCLUSIVE (the last millisecond, not the first of the next
  bucket — an exclusive end swallows the record that lands on the boundary), and
  every step is calendar arithmetic, never `+86400000` (a DST day is 23 or 25
  hours long). Covered by 35 tests, green in UTC, `Europe/Madrid` and
  `Pacific/Chatham`.

  It also replaces the three copies of "epoch → local wall clock" that had grown
  in the tree (gui_treedb's `tranger_helpers.js` now delegates here). New icons:
  `yi-calendar-days`, `yi-chevron-left`, `yi-chevron-right`, `yi-forward-step`,
  `yi-ellipsis`.

- **fix(period): a bucket saved by a SECONDS consumer never came back as one.**
  `infer_period()` compared in milliseconds, but a bucket ends on its last
  millisecond (`…23:59:59.999`) and a consumer that keeps seconds stored that end
  TRUNCATED (`…23:59:59`) — so the exact match never fired, and every saved week
  reopened as a hand-typed range with no granularity lit. It now takes the
  consumer's unit (`infer_period(from, to, candidates, ms)`) and compares the
  bounds as that consumer would have written them.

- **fix(period): "custom" is a STATE, not just a button.** With `with_custom:
  false` the mode disappeared entirely, so a range matching no bucket had nothing
  to be — it fell back to another mode (*"unknown mode: custom"*, and "All" lit
  while the query carried a week). The state always exists; `with_custom` only
  decides whether it is also OFFERED as a button. Without one it is simply the
  state where no granularity is lit and the arrows are dead.

- **fix(tabulator-i18n): the language it was handed never reached it.** Tabulator
  DEEP-CLONES `options.langs` into its localize module when the table is built and
  never reads the option again, so registering a fresh language there and calling
  `setLocale()` only earned a *"Matching locale not found, using default: yui-5"* —
  and the chrome it was meant to translate (the paginator above all) stayed in the
  old language. `yui_tabulator_relocalize()` now installs the strings where the
  module actually reads them (`localize.installLang`).

- **feat(period): `with_resolved`, and a label that is just the label.** The
  read-only "from → to" line is now optional: a host that shows the same range in
  its OWN editable inputs (gui_treedb does) asks for it to be left out instead of
  printing the two timestamps twice. The calendar icon inside the label is gone —
  clicking it did exactly what clicking the label does.

- **fix(period): `.is-flex` beat `.is-hidden`, so the arrows survived the modes
  that have nothing to walk.** Both Bulma helpers are `!important` and is-flex
  wins, so a navigator built with `is-flex` and hidden with `is-hidden` stayed on
  screen in "All" / "Custom" — offering `< >` for a period that did not exist.
  The row is laid out from the component's own css now, where `is-hidden` can
  win. Its calendar also SWALLOWS the Escape that closes it (capture phase,
  `stopPropagation`): the keypress used to travel on to the shell's escape chain
  and close the whole dialog underneath.

- **fix(test-app): the language toggle repainted attributes but published
  nothing.** It called `refresh_language(document.body, t)` directly, so any
  label a view COMPOSED with `t()` — a month name, "Week 27", a Tabulator
  header — stayed in the old language for the life of the view. It now calls
  `yui_shell_language_changed(shell)`, which repaints the attributes AND
  publishes `EV_LANGUAGE_CHANGED`, the contract every consumer is told to use.
  The demo gained a **Period** chapter (two navigators, different granularity
  sets, echoing the timestamps each bucket resolves to).

- **fix(tabulator): the cell editor was invisible in dark mode.** Tabulator gives
  its editor input no colour of its own, so it inherited the browser default —
  BLACK text on the dark cell: the value disappeared the moment you clicked into
  it and came back when the field lost focus (which is why a screenshot never
  showed it). The editor, the header-filter inputs and their placeholders are
  themed now.

- **feat(shell): the language switch is a fact the shell PUBLISHES.**
  `refresh_language()` re-translates every node that CARRIES its key, but a view
  that composed a string with `t()` at render time — a Tabulator header, a
  paginator, a row counter, a title — holds no key and cannot be reached that
  way, so it stayed in the old language for the rest of its life. The app now
  switches its i18next and calls **`yui_shell_language_changed(shell)`**; the
  shell re-translates the document and publishes **`EV_LANGUAGE_CHANGED`**, and
  any view (this library's or an app's) subscribes and re-renders what no
  attribute can reach. One contract, instead of an event per app.
- **feat(tabulator): Tabulator's own chrome goes through i18n**
  (`yui_tabulator_i18n.js`). The paginator ("Page Size", "First", "Prev",
  "Next", "Last"), the placeholder and the loading/error notices are rendered by
  Tabulator itself and never passed through `t()`: a table sat in English inside
  a Spanish view. `yui_tabulator_lang(t)` hands a table its language at build and
  `yui_tabulator_relocalize(table, t)` puts it in the new one — under a FRESH
  locale name each time, because `setLocale()` with the name already in force is
  a no-op and the paginator is drawn once. Every key falls back to the English
  string Tabulator used to render (`defaultValue`), so an app that defines none
  of them sees no change.
- **fix(treedb-table): the table view follows a language switch.** It relocalizes
  its Tabulator, re-translates its placeholder, and rebuilds its columns from
  their own definitions — re-applying the locale makes Tabulator re-run the title
  formatter on the EXISTING header cell, which appends ("Device GroupDevice
  Group"). Its `clear search` / `refresh` tooltips were raw English literals (not
  even `t()`); they carry `data-i18n-title` now.
- **fix(inputs): the clear (✕) button's tooltip could not be re-translated.**
  `attach_clear()` set `title` / `aria-label` from `t()` at build time — invisible
  to `refresh_language()` — so the tooltip stayed in the old language for the life
  of the input (seen in gui_agent: "Limpiar" on an English UI). It carries
  `data-i18n-title` / `data-i18n-aria-label` now.
- **fix(form): the tom-select clear button asked for a CAPITALIZED i18n key**
  (`Remove all selected options`). Keys are lower-case by convention — the apps'
  `validate-locales` enforces it — so no locale could legally define it and it
  rendered as its own key.
- **feat(icons): `yi-pause`, `yi-play`, `yi-download`, `yi-link`.** Four
  deliberate mask rules added to `yui_icons.css` — the set is a small CSS-mask
  family, not FontAwesome, so a `yi-*` class it does not define renders as a
  solid black square. Consumed by gui_treedb's Live pause/resume, the card CSV
  export and the card share link.

- **feat(treedb-graph): the Graph follows links made by ANOTHER operator.**
  `C_YUI_TREEDB_GRAPH` subscribed to `EV_TREEDB_NODE_CREATED/UPDATED/DELETED`
  but never to `EV_TREEDB_NODE_LINKED` / `EV_TREEDB_NODE_UNLINKED`, so an open
  Graph kept drawing stale edges until it was reloaded. It consumes them now.

  Why the existing node events could not cover it: an edge **is a fkey of the
  CHILD** (link-saves-child), and the backend's backward-compatible path
  announces a link as an `EV_TREEDB_NODE_UPDATED` of the **PARENT** — whose
  fkeys did not change, so the tree's fkey diff correctly found nothing to do.
  On a link/unlink the view now re-reads the CHILD (new `node` command) and
  feeds it to `C_G6_NODES_TREE` as `EV_NODE_UPDATED`: its old-vs-new fkey diff
  is what draws or clears exactly the edge that moved, so the tree stays the
  single owner of the edge model. The PARENT is re-read too — its hook (the
  children list, what the hook-data viewer shows) changed in memory even
  though it was never saved. Topics not loaded in the graph are not re-read.

  **Requires the backend service to be configured with `with_link_events`**
  (`C_NODE`, `SDF_RD`, default **false**). Note it is an either/or in the
  backend: with link events ON, a link/unlink no longer publishes the parent's
  `EV_TREEDB_NODE_UPDATED` — so enabling it on a treedb that also serves a v1
  SPA changes what that SPA receives. Left off by default for exactly that
  reason; no behaviour changes for a backend that does not publish them.

- **feat(dom): logical class names on windows, modals, confirms and toasts —
  plus a `logical_class` parameter.** The library's chrome now follows the
  repo's DOM convention (uppercase = logical block, lowercase = styling):
  `WINDOW_HEADER/CONTROLS/MIN/MAX/CLOSE/BODY/FOOTER/RESIZE`,
  `MODAL[_BACKDROP|_CONTENT|_HEADER|_BACK|_TITLE|_CLOSE|_BODY]`, `CONFIRM*`,
  `TOAST*`. Those name the *kind* of block; to reference **one** window/popup
  exactly, the caller now passes its own name — a `logical_class` attr on
  `C_YUI_WINDOW` and a `logical_class` option on `yui_shell_show_modal()` /
  `yui_shell_confirm_*()` — which lands on the root element. Existing styling
  classes are kept and the logical names are prepended, so no CSS or internal
  `querySelector` changes.

- **BREAKING(window): minimize requires a window manager.** `C_YUI_WINDOW`'s
  minimize button is painted only when the window has a `manager`
  (`C_YUI_WINDOW_MANAGER`) — minimize means "send to the dock", and without a
  manager there is nowhere to send it. The self-contained "shade" (roll up to
  the title bar in place) fallback and its `is-shaded` CSS are **removed**;
  `showMin` is ignored when there is no manager. A manager-less window now
  shows only maximize/restore + close.

- **feat(icons): `yi-plug` / `yi-plug-slash`** — hand-drawn CSS-mask glyphs
  (connect / disconnect), first consumer: gui_treedb's Settings
  connect/disconnect button.

## 3.0.0

**BREAKING: the legacy GClass GUI stack is removed from this line**
(TODO §1.4; every in-org consumer had already migrated — the frozen v1
npm line, dist-tag `legacy`, still ships it for estadodelaire/hidraulia).

- **Removed**: `c_yui_main.js`/`.css` (C_YUI_MAIN + the `display_*` /
  `get_yes*` volatil helpers), `c_yui_routing.js`/`.css`,
  `c_yui_tabs.js`, and the equally consumer-less `themes.js` and
  `ytable.js`/`.css`. Their exports are gone from the `index.js`
  barrel. SHELL.md §10 rewritten (coexistence/drift policy retired;
  the old §12 "don't import both css" limitation deleted), README
  updated.
- **feat(shell): the confirms adopt the icon-centric design** ported
  from the 2.5.0 volatil redesign before deleting it: a narrow rounded
  card with a tinted round icon of the type, optional capitalized
  title, centered message/buttons, X top-right; `build_dialog` gains
  `opts.type` (`question`/`success`/`info`/`warning`/`error`, `danger`
  aliases error; confirms default to `question`, `yui_shell_confirm_ok`
  to `success`) and focuses the primary button so Enter answers it —
  same Promise/Escape-chain/focus-trap contract, CSS in
  `c_yui_shell.css` (`.yui-confirm`, Bulma vars, light+dark).
- **test-app: the Modals chapter demos the shell helpers only** (the
  legacy trigger group is gone with the helpers).

## 2.6.1

- **fix: 2.6.0 dropped shared CSS the apps relied on.** `c_yui_main.css`
  reached every v2 bundle through the gclasses' `c_yui_main.js` import
  that 2.6.0 removed — and it carried rules that were never
  legacy-specific: the whole generic Tabulator theming (column
  separator, frozen columns, light striping/hover, `[data-theme=dark]`
  and `[data-theme=system]` blocks), the responsive edit-dialog card
  (`modal-is-responsive`), the `without-border` / `strong-shadow` /
  `overscroll-contain` / `flex-horizontal-section` utilities, the
  horizontal toolbar section and the mobile Bulma-columns rule.
  Deployed symptom: gui_agent / gui_treedb tables lost their dark
  theming and striping. Each rule moved to the stylesheet of the module
  that uses it, self-contained via that module's own JS import:
  - Tabulator theming → `tabulator.css` (now also imported by
    `c_yui_form.js` and `c_yui_treedb_topic_with_form.js`, the two
    Tabulator builders — consumers need no explicit import).
  - `modal-is-responsive` + `without-border` →
    `c_yui_treedb_topic_with_form.css`.
  - `strong-shadow` + `without-border` → new `c_yui_window.css`
    (imported by `c_yui_window.js`).
  - `overscroll-contain` → `c_yui_form.css`.
  - `.yui-horizontal-toolbar-section` → `yui_toolbar.css`.
  - mobile `.column` edge-to-edge → `c_yui_shell.css`.
  `c_yui_main.css` keeps the legacy-only rules (layers, volatil modals,
  theme classes) — legacy-stack apps are unaffected.

## 2.6.0

- **feat(shell): the component gclasses migrate to the shell modal
  helpers (TODO §1.2).** `C_YUI_TREEDB_TOPICS` / `C_YUI_TREEDB_GRAPH`
  (command-error message) and `C_YUI_TREEDB_TOPIC_WITH_FORM` /
  `C_YUI_WINDOW` (delete/dirty-guard/close-warning confirms) now call
  `yui_shell_show_error` / `yui_shell_confirm_yesnocancel` /
  `yui_shell_confirm_ok` instead of the legacy `display_error_message`
  / `get_yesnocancel` / `get_ok`, and no longer import `c_yui_main.js`
  — shell apps stop bundling the legacy stack's JS+CSS. Button labels
  keep the historical i18n keys (`yes`/`no`/`cancel`/`accept`), so
  existing app locales translate unchanged. The legacy helpers stay
  shipped and unchanged for legacy-stack apps (drift policy,
  SHELL.md §10).
- **feat(shell): `yui_shell_of(gobj)`** — resolve the shell that
  governs a gobj: nearest `C_YUI_SHELL` ancestor, else the last shell
  created on the page (real apps have exactly one), else null. New
  export of `c_yui_shell.js`; the layer accessors in `shell_modals.js`
  are null-shell safe (warning + safe-default resolution).
- **feat(shell): `yui_shell_popup_layer(shell)`** (shell_modals.js) —
  public accessor for the popup layer (z 20). The treedb edit dialog
  mounts there instead of `document.body`: a body-mounted Bulma
  `.modal` painted **above** the shell's modal layer and blocked the
  confirms' pointer events (the shell is its own stacking context).
- **fix(treedb): the edit dialog rides the shell Escape chain.** Its
  Escape handler is pushed on `yui_shell_push_escape` (popped on
  close), LIFO with the shell confirms — Escape on an open confirm
  cancels only the confirm and can no longer re-enter the dialog's own
  document listener (the legacy stacking bug, now structurally
  impossible under a shell). The document listener remains as the
  shell-less fallback. `mt_destroy` now tears an open dialog down
  (a transport rebind used to leak the dialog DOM and its Escape
  handler).
- **test-app: the Modals chapter demos both families** — a "shell
  helpers" group (`yui_shell_confirm_*` + `yui_shell_show_*` resolved
  from the chapter's gobj via `yui_shell_of`) above the legacy volatil
  group, echoing each Promise answer.

## 2.5.0

- **feat(main): redesigned volatil modals.** `display_volatil_modal`
  (the `get_yesnocancel`/`get_yesno`/`get_ok` questions and the typed
  info/warning/error messages) drops the raw-Bulma look — huge `.title`
  question text, 640px card, saturated full-width colored header — for
  an icon-centric layout: a narrow rounded card (max 26rem), a tinted
  round icon of the type (question/success/info/warning/error, the new
  `yi-*` glyphs), an optional capitalized title, normal-size message and
  centered buttons; the accept button of the typed messages follows the
  type accent (info blue / warning amber / error red). Everything maps
  to Bulma vars so one rule set follows light and dark; the overlay dim
  is softened (45%) so stacked confirms no longer black the page out.
  API unchanged (`title`/`msg`/`type`/`x_close`/`buttons`); `type`
  gains `question` (used by the yes/no questions) and `success`
  (`get_ok`), `danger` stays an alias of `error`. No animations, per
  the house rule.
- **test-app: Windows chapter** (`/windows`, `C_DEMO_WINDOWS`) — the
  last offline coverage gap: floating `C_YUI_WINDOW`s opted into a
  `C_YUI_WINDOW_MANAGER` dock (`__window_manager__` service). The dock
  mounts inline into the chapter's card (floating fallback while the
  card isn't in the DOM); spawn/drag/resize/maximize, minimize-to-chip,
  raise-on-press, close-unregisters; on mobile a window is a
  full-screen sheet. With this every offline-capable gobj-ui gclass is
  exercised by the demo (the treedb trio + `C_G6_NODES_TREE` still
  need a live backend).
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
