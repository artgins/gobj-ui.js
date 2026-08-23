# gobj-ui — Yuneta UI Library

Reusable GUI components for Yuneta GClass front-ends: a declarative shell
(`C_YUI_SHELL`/`NAV`/`PAGER`/`WIZARD`), floating windows
(`C_YUI_WINDOW`/`WINDOW_MANAGER`), TreeDB editors, charts and maps. The
legacy GClass GUI stack (`C_YUI_MAIN`/`TABS`/`ROUTING`) was removed from
this line in `3.0.0` — the frozen v1 npm line still ships it.

Published as `@yuneta/gobj-ui`. Built on top of [`@yuneta/gobj-js`](https://github.com/artgins/gobj-js).

> **Routing & navigation:** every navigable state is a URL. Before adding any
> view or navigable element, read **[`ROUTING.md`](ROUTING.md)** — the shell's
> routing contract (URL = source of truth, push/replace history, the
> position/preference/transient litmus).
>
> **BREAKING (7.0.0):** a **dependency-only major** — no component API moved.
> The `maplibre-gl` peer floor rises to `^6.4.1`, which is where `DOM.sanitize`
> stops leaving dangerous attributes behind when several sit next to each other.
> Raise the range in every consumer that declares maplibre.
>
> **BREAKING (5.0.0):** a **dependency-only major** — no component API moved.
> The peer floors moved to `maplibre-gl` `^6.0.0` (see 7.0.0 above), `@yuneta/gobj-js` `^7.8.7`,
> `i18next` `^26.3.6`, `tom-select` `^2.6.2`, `vanilla-jsoneditor` `^3.13.0`.
> maplibre v6 is ESM-only with no default export, so a consumer imports it as
> `import * as maplibregl`; bundling the map with Vite 8 also means emitting
> maplibre's worker + shared chunk yourself and pointing `setWorkerUrl()` at
> them (Vite cannot statically follow v6's dynamic worker URL, and a `.mjs`
> worker is refused when the host serves it as `application/octet-stream`).
> The test-app's `vite.config.js` (`maplibre_worker_assets`) + `src/main.js`
> are the reference wiring.
>
> **BREAKING (4.0.0):** `yui_shell_navigate(shell, route)` now **pushes** a
> history entry by default; pass `{replace:true}` for a redirect / normalization
> / F5-restore — anything *code* decided rather than the user. It used to replace
> unless given `{push:true}` (still accepted, now redundant). A call left
> unmigrated only leaves a spurious Back entry; the default is the
> failure-tolerant direction, since a forgotten `{push}` silently broke Back.
> See ROUTING.md §7/§9.1.
>
> **BREAKING (4.0.0):** the legacy `__yui_main__` theme/resize service is
> **gone from v2**. Components are self-contained: the theme lives in
> `<html data-theme>` and gclasses follow it through **`src/yui_theme.js`**
> (`yui_theme_now()` / `yui_is_dark()` / `yui_watch_theme(gobj)`, all
> barrel-exported — the watcher translates the DOM mutation *and* the OS
> `prefers-color-scheme` flip into `EV_THEME`); reflow uses each component's
> own `ResizeObserver`. An app that registered a `__yui_main__` service for
> gobj-ui's benefit can delete it; do not re-add one.
>
> **BREAKING (4.0.0):** a window/modal **`title` is now an i18n KEY**,
> rendered with `data-i18n` so it re-translates on language change. Pass the
> key, never `t(key)`, and never compose data into it — the DATA half (a
> topic/service/marker name) travels in the new **`title_prefix`** attr/opt,
> shown before the title and never translated (`C_YUI_WINDOW`,
> `yui_shell_show_modal`, the dock chip). The old `title_fn`/`retitle_modal`
> hooks are removed.
>
> **BREAKING (4.0.0):** **minimize requires a window manager.**
> `C_YUI_WINDOW` paints its minimize button only when the window has a
> `manager` (`C_YUI_WINDOW_MANAGER`): minimize means "send to the dock", and
> without a manager there is nowhere to send it — so `showMin` is now **ignored**
> when there is no manager, and a manager-less window shows only
> maximize/restore + close. The self-contained **"shade"** fallback (roll up to
> the title bar in place) and its `is-shaded` CSS are **removed**; an app that
> relied on shading needs to register a manager.

## Two maintained lines

This repository carries **two parallel lines** with different layouts and
consumers. They are independent snapshots (no shared git ancestry):

| Line | Branch | Tag | Layout | Consumed by | How | Status |
|------|--------|-----|--------|-------------|-----|--------|
| **v2** | `main` | `2.0.0`+ | `src/` subdir | **gui_agent**, **gui_treedb** | local `file:` dep on the yunetas submodule | active development |
| **v2** | `main` | `2.0.0`+ | `src/` subdir | **wattyzer** | published npm `@yuneta/gobj-ui@^5.0.0` (dist-tag `latest`) | active development |
| **v1** | `v1` | `1.0.1` | `src/` subdir | **estadodelaire**, **hidraulia** | published npm `@yuneta/gobj-ui@^1.0.1` (dist-tag `legacy`) | frozen, maintenance-only |

- **v2 / `main`** is the active development line: the declarative shell
  (legacy-stack-free since `3.0.0`). It is embedded as a git submodule in **yunetas** at
  `kernel/js/gobj-ui`, and the in-repo JS yunos
  (**`yunos/js/gui_agent`**, **`yunos/js/gui_treedb`**) consume that checkout as a
  `file:` dependency (`@yuneta/gobj-ui` → `../../../kernel/js/gobj-ui`), importing
  by package specifier (`@yuneta/gobj-ui/src/*.js`, exports map `"./src/*"`; the
  `index.js` barrel and the vite plugin stay at the package root).
  **wattyzer takes the same line from the registry** (since 2026-07-25): the
  published tarball ships `src/`, `index.js` and the vite plugin, so the import
  specifiers are identical — but library work only reaches it after a
  `npm publish` and a range bump on its side. Two consequences worth knowing:
  a fix cannot be validated in wattyzer before it is released, and wattyzer is
  the consumer that proves the **tarball** is complete, not just the checkout.
- **v1 / `v1`** is the frozen legacy-only stack (the declarative shell is not on
  this line). It is **published to npm**; estadodelaire and hidraulia depend on
  `@yuneta/gobj-ui@^1.0.0` from the registry. Land only maintenance fixes here,
  then `npm publish` a new `1.x`.

All new feature work lands on `main`/v2.

## Usage

```bash
# v2 (active): clone yunetas with submodules; the in-repo yunos pick it up via file:
git clone --recurse-submodules <yunetas>
git submodule update --init kernel/js/gobj-ui      # yunetas tracks main/v2

# v2 from the registry (wattyzer, and any out-of-tree consumer)
npm install @yuneta/gobj-ui@^5.0.0

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
tarball; v2 consumers import source files by specifier, whether they resolve
them from the checkout or from the tarball's `src/`. Rebuild `dist/` to
validate and before publishing a release.

## Components

### Site map — `yui_shell_show_route_map`

Every declarative-shell app can render its WHOLE navigation surface —
toolbar + account menu + every declared menu + live dynamic tabs + each
view's contributed sub-routes + the routes declared only in the route table —
as a printable, filterable, clickable tree (a floating `C_YUI_WINDOW`, modal
fallback) that doubles as the app's basic documentation. The current route is
marked "you are here". Wire it from an account-menu entry
(`type:"event"` → `EV_OPEN_SITEMAP`, or a deep-linkable `/sitemap` action
route with `redirect:"back"`) and call
`yui_shell_show_route_map(shell, {t})` from the handler; a second call
toggles it closed. The tree model is `yui_shell_nav_map()` /
`route_map_model.js` (pure, unit-tested). Semantics and the contributor
protocols (`yui_shell_set_sub_routes`, `yui_shell_register_event_handler`)
live in [`ROUTING.md`](ROUTING.md).

### C_YUI_NODE — navigation as a tree of gobjs (prototype)

`C_YUI_SHELL`'s menu tree is **two levels** (a primary item and its
`submenu.items`); a submenu item cannot declare a submenu of its own, so a
section with sub-sections has to flatten everything into one tab strip.

`C_YUI_NODE` is the prototype of the other model: **the gobj tree IS the
navigation tree.** A node is a gobj, the URL is the path of node ids under a
single declared `base_route`, and a parent holds *how it wants its children
seen*:

```json
{
    "gclass": "C_YUI_NODE",
    "kw": {
        "node_id": "cards", "base_route": "/cards",
        "projection": {
            "index":  {"layout": "cards"},
            "chrome": [{"layout": "tabs", "show_on": ">=tablet"},
                       {"layout": "backbar", "show_on": "<tablet"}]
        },
        "content":  {"gclass": "C_MY_LANDING", "kw": {}},
        "children": [
            {"id": "energy", "label": "Energy", "icon": "yi-bolt",
             "projection": {
                 "index":  {"layout": "cards"},
                 "chrome": [{"layout": "tabs", "show_on": ">=tablet"},
                            {"layout": "backbar", "show_on": "<tablet"}]
             },
             "children": [ /* … any depth … */ ]}
        ]
    }
}
```

- **`projection`** is a `C_YUI_NAV` render config (so cards/tabs/vertical/
  icon-bar/backbar and `show_on` all work unchanged) in two modes: `index`
  when the node is the tip of the path — the projection IS the page — and
  `chrome` when a child is showing — the projection is the strip around it.
- **Chrome belongs to the node that declares it — so every branch declares its
  own.** A node's `chrome` strip lists *that* node's children, and its backbar
  goes back to *that* node's route (`back_route = my_route`). A branch that
  declares no `chrome` therefore contributes no strip, and the only ← the user
  can reach is the nearest ancestor that did declare one. Declaring the pair
  **only at the root** is the mistake this rule exists to name: the whole
  subtree then shows one "← root" that says the same thing at every depth,
  instead of one ← per level going up exactly one level. Repeat the same
  `chrome` on every branch that can have a tip below it — that is what
  `test-app`'s `/cards` does, and what makes its ← hierarchical.
- **`content` and `children` are not exclusive**: a section with its own page
  and sub-pages is one node.
- **The route table does not grow.** The host declares ONE route; everything
  below arrives as the shell's `subpath` (ROUTING.md §4), and the tree
  contributes its full shape to the site map via `yui_shell_set_sub_routes`.
- **Two ways to show depth.** Stacked chrome — one strip per ancestor —
  reads well at three levels and eats the screen at five. The other way is
  **`projection.path`**: the trail down to the user as ONE line
  (`{"layout": "breadcrumb"}`), drawn from the tree root whichever node
  declares it, each crumb a link to that level. Declared per branch, so a
  deep corner can trade its strips for a breadcrumb (`chrome_depth: 0` +
  `projection.path`) while the rest of the tree keeps its tabs. Note the
  asymmetry that makes it a third mode and not a layout: `index` and `chrome`
  project a node's CHILDREN; `path` projects the way in.
- **`remember_position` — an item points at where you LEFT that child.**
  Without it a nav item points at the canonical route of its child, so a strip
  of children behaves like a row of tabs that forgets: open a topic inside one,
  move to a sibling, come back, and the tab is at its landing — browser Back
  the only way to what was open. With it, the item carries the tail that was
  last active under that child.

  It stays a **real position**, which is the reason it is done here and not by
  the viewer restoring itself: clicking is a navigation like any other, nothing
  redirects and nothing argues with the url. A bare navigation to a child
  records "its home", so choosing the landing sticks too.

  Off by default: a tree whose children are pages wants the item to BE the
  destination. On for a tree whose children are workspaces with a position
  inside them — the agent console's strip of treedbs, each with its open topic.
  Since 6.2.0.

- **`nav_mode` — the three shapes as one runtime knob.** The two bullets above
  describe what a tree *declares*; `nav_mode` is how a user *chooses* between
  the shapes without the app rewriting anything:

  | mode | what it shows | equivalent declaration |
  |---|---|---|
  | `"stack"` (default) | one strip per ancestor | whatever each branch declares |
  | `"back"` | only the tip's parent, as a `← parent` | `chrome: {"layout":"backbar"}` everywhere + `chrome_depth: 1` |
  | `"path"` | the trail as ONE line | `path: {"layout":"breadcrumb"}` on the root + `chrome_depth: 0` |

  It belongs to the **root** (`yui_node_set_nav_mode(root, "path")`, or
  `"nav_mode"` in its declaration) and the whole tree reads it from there —
  ancestors stacking strips while a descendant drew a breadcrumb would be
  saying the same thing twice in two languages. Set on a middle node it is
  refused, loudly, rather than accepted and ignored.

  A mode **filters the renders as they are asked for; it never rewrites what
  the app declared.** That is what makes `"stack"` an exact restore: a branch
  that declared `vertical` chrome comes back as `vertical`, not as the tabs a
  canonical "stacked" shape would have imposed. The `index` projection is
  never touched by a mode — how a node shows its own children when it IS the
  page is not a statement about depth. Modes are per tree, so an app can run
  `/admin` as a breadcrumb and `/alarms` as a backbar; `test-app`'s node lab
  cycles all three on the live tree.
- **`chrome_depth`** caps the stacked chrome: with every ancestor painting its
  own strip, depth N shows N-1 of them. A node declares how many its corner of
  the tree deserves (`0` = none, omit = all), the **deepest declaration on the
  path wins, and an intermediate node whose only job is to hold that number is
  a legitimate node.
- **Declarative and dynamic are the same code.** The declared `children` attr
  is fed to the same `EV_ADD_NODE` the runtime API uses:

  ```js
  yui_node_add(node, spec, index)      yui_node_remove(node, node_id)
  yui_node_set_projection(node, proj)  yui_node_set_content(node, content)
  yui_node_set_chrome_depth(node, n)   yui_node_tree_version(node)
  yui_node_set_nav_mode(root, mode)    yui_node_nav_mode(node)
  yui_node_find(node, "energy/north")  yui_node_route(node)
  ```

  A node added at runtime is deep-linkable like one declared at boot. Removing
  the branch the user is standing on moves them to the nearest living ancestor
  (`replace`, logged) — with a live tree the ground can disappear under a
  bookmark.

Every move goes through the URL: a projection click publishes
`EV_NAV_CLICKED`, the node turns it into a push navigation, and the shell's
`EV_ROUTE_CHANGED` walks back down the tree as `EV_ACTIVATE`. Back, Forward,
F5 and deep links are therefore correct by construction.

**The root can be a node too** — `config.shell.tree`. Declared there, the
shell stops owning the menu and keeps only the **space** (zones, layers,
stages, toolbar, overlays, theme, breakpoints): the root node's children are
the app's primary options, and it projects them into zones instead of into its
own body.

```json
"shell": {
    "zones": {"top": {"host": "toolbar"}, "left": {"show_on": ">=desktop"},
              "bottom": {"show_on": "<desktop"}, "center": {"host": "stage.main"}},
    "stages": {"main": {"zone": "center", "default_route": "/"}},
    "tree": {
        "base_route": "/", "stage": "main",
        "projection": {
            "index":  [{"zone": "left", "layout": "vertical"},
                       {"zone": "bottom", "layout": "icon-bar"}],
            "chrome": [{"zone": "left", "layout": "vertical"},
                       {"zone": "bottom", "layout": "icon-bar"}]
        },
        "children": [ /* the primary options, and everything under them */ ]
    }
}
```

Note what is NOT there: no zone declares `host: "menu.<id>"`, and there is no
`menu` block at all. A render config with a `zone` mounts through
`yui_shell_zone()` and **persists** — the rail is standing chrome, so it is
built once and told where the user is, not rebuilt per navigation.
`menu.primary.render` always was a per-zone projection; this just gives it an
owner that can hold it.

`shell.tree` synthesizes exactly ONE route entry, flagged `owns_subtree`, which
is the only case where root `/` may match as an ancestor (`route_resolver.js`).
The unknown-route diagnostic is not lost by that: it moves to the node that
actually knows the names of its children. Runnable reference:
`test-app/tree.html` (`_qa_root.mjs`), served beside `index.html` so the two
navigation models can be compared in one browser.

**Where the tree ends.** One gobj per structural node is right; one gobj per
meter reading is not. A node marks the boundary with `link` — a pointer into a
data space (a timeranger: millions of raw records, series/time, key/value) plus
the viewer suited to that shape:

```json
{"id": "m1", "label": "Meter 1",
 "link": {"kind": "tranger", "gclass": "C_MY_TRANGER_VIEW",
          "kw": {"topic": "meters^north^m1"}}}
```

A link node is always the **tip of the structure**: the url keeps going, but
its tail is handed to the viewer as `EV_ROUTE_CHANGED {base, subpath}` — the
same contract the shell gives a view (ROUTING.md §5), so a viewer cannot tell
whether the shell mounted it at a declared route or a node did, deep in a tree.
`base` is the node's canonical route, which is what the viewer builds its own
deep links from. An empty subpath means the viewer's home, which is what makes
Back out of a deep data position land on it. Below a link there are no nodes:
`link` + `children` (or `link` + `content`) is a config error, because a silent
winner in "who owns the subpath" would be the worst outcome.

**The tree is a contract, not runtime state.** Once published, a node's path
is a url a client may have bookmarked, scripted, or been sold as another door
into the system. So there is deliberately **no reparent/move API**: the shape
is versioned (`tree_version` on the root, `yui_node_tree_version()`), and a
rename migrates through `aliases` — the former id keeps resolving and the URL
is rewritten (replace) to the canonical spelling, the same shape as an HTTP
301. Anything a version bump cannot cover is a new tree, declared as such.

Runnable reference: the **Cards** chapter of `test-app` (four levels plus a
panel that mutates the live tree), driven by `test-app/_qa_nodetree.mjs` and
`test-app/_qa_extra.mjs`.

### C_YUI_SERVICE_VIEW — mounting a view that talks to a backend

A view asks the backend for data with `gobj_command(remote, …, src = itself)`,
and `C_IEVENT_CLI` routes the answer back with
`gobj_find_service(gobj_name(src))` — **which only finds registered services**.
Neither host creates one, so a backend-talking view mounted directly at a route
never receives a single answer: it sits empty while the ievent logs *"service
not found"* once per answer. And a route's `target.kw` is static JSON, so it
cannot carry the live transport pointer either.

Two shapes, because the callers are not alike:

```js
/*  A route with NO extras: declare the host, name the view it hosts.  */
{ gclass: "C_YUI_SERVICE_VIEW", kw: {
    view_gclass:  "C_MY_VIEW",
    service_name: "#my-view",          // UNIQUE per mount — see below
    view_kw:      { title: "…" }
}}

/*  A wrapper that keeps its own extras (url segments into the hosted view,
 *  rebinding it when a connection drops): drop only the boilerplate.       */
let view = yui_mount_service_view(gobj, {
    gclass:    "C_YUI_TREEDB_TOPICS",
    name:      service_name(gobj),
    kw:        {...},
    transport: remote            // already resolved (e.g. per connection);
});                              // omit it for "__remote_service__"
```

The hosted gclass must declare the attr the transport is injected under
(`gobj_remote_yuno` by default), build its `$container` in `mt_create`, and flag
`EVF_PUBLIC_EVENT` on whatever arrives from the backend — the ievent drops
events that are not public.

**The service name must be unique per mount**, and a duplicate is dangerous
precisely because it is not fatal: gobj-js logs *"service ALREADY REGISTERED.
Will be UPDATED"* and **rebinds the name**, so two mounts of one route would
cross their answers. Derive it from the route (or from whatever else makes the
mount unique — a connection id, a workspace), never from the gclass alone.

> **Why the hosts do not just create services.** It would make every routed view
> an inter-yuno endpoint by default, against the framework's rule that only
> named services are; most views never talk to a backend; and the collision
> above would become the default failure mode. Opt-in per route instead.
>
> **Known asymmetry, deliberately left alone:** `C_YUI_SHELL` mounts a view with
> `gobj_create()` (a plain child) and `C_YUI_NODE` with
> `gobj_create_pure_child()`. The flag decides whether a gclass that consults
> `gobj_is_pure_child()` sends its output event straight to the parent or
> publishes it. Today nothing consults it *on a view* (only `c_ievent_cli` and
> `c_timer` do, and always about themselves), so the difference has no observed
> consequence — but the same view gclass does get a different flag depending on
> who mounted it. Align it the day it bites, with the case that bit.

### C_YUI_JSON — lazy JSON tree viewer

Indentation follows the house rule: four characters per level, plus a **guide
line per ancestor**. The rows are siblings with growing padding rather than
nested boxes, so the guides are painted as a repeating gradient bounded to
each row's own indentation (`background-size` set per row) — which is why the
hover state must set `background-color`, never the `background` shorthand, or
the guides vanish under the cursor.

A container-agnostic viewer (like `C_YUI_PAGER`): it owns only a toolbar +
scrollable tree body and exposes a `$container` the parent mounts wherever it
wants (a `C_YUI_WINDOW` body, a `yui_shell_show_modal` card, or inline). It is
built to show **arbitrarily large** JSON, so it never assumes the whole
document fits in memory or the DOM.

**Server-driven lazy expansion.** The C kernel's `kw_collapse()` (`kwid.c`,
used by the `print-tranger` command) truncates over-limit dicts/arrays into a
sentinel — `{ "__collapsed__": { "path": …, "size": N } }` (dict) or
`[ { "__collapsed__": … } ]` (array). `C_YUI_JSON` renders each sentinel as an
expandable stub and, when the user opens it, **does not fetch anything itself**:
it publishes `EV_EXPAND_PATH {path, size}` to its subscriber. The subscriber is
the only party that knows the backend (it re-issues `print-tranger path=<path>`
with limits, or any equivalent), and hands the subtree back via
`EV_SUBTREE_LOADED {path, json}`. Only expanded containers are materialised in
the DOM, so the tree stays bounded regardless of document size. With no
sentinels present it degrades to a plain client-side collapsible tree.

**Three views, one document.** The toolbar switch (and the `view_mode` attr,
`"tree"` | `"text"` | `"graph"`) picks which. They answer three different
questions:

| view | question | notes |
|---|---|---|
| `tree` | *where is this value, and what is around it* | the lazy view; the only one that can drill |
| `text` | *what does this document say, verbatim* | `JSON.stringify(…, 4)`, four characters per level |
| `graph` | *what shape is this* | a hosted `C_YUI_JSON_GRAPH` child (AntV/G6) |

- **Neither text nor graph is lazy.** Both show what the client currently
  holds, `__collapsed__` sentinels included, because that is honestly what it
  has. Drill in the tree and they grow with it.
- **The tree-only controls** (search, expand-loaded, collapse-all) hide with
  the tree; copy stays. A control that can answer nothing is worse than an
  absent one. The graph brings its own zoom/centre toolbar.
- **The graph child is built on first entry** into graph mode, never in
  `build_ui`: G6 sizes itself from its container, so a graph created behind
  `is-hidden` comes up 0×0. `register_c_yui_json()` auto-registers
  `C_YUI_JSON_GRAPH` (and that register is idempotent, so an app may also
  register it itself, in either order).

Two layout facts the browser taught this component, both worth keeping:

- In the text view long lines scroll sideways **inside** the viewer
  (`white-space: pre` on a `max-content`-wide `<pre>`), never on the page body:
  in a raw dump the indentation *is* the structure, and a wrapped line restarts
  at column 0 and lies about the depth of everything under it. The `<pre>` must
  be `max-content` wide or the container reports no overflow and the tail of
  every long line is unreachable.
- The graph body carries a **definite `height`** (`24rem`, with
  `flex: 1 1 auto` so a constrained host still wins). Not `min-height`: a
  percentage height does not resolve against a box sized by a minimum, and the
  tree and the text push their own height while a canvas pushes none — so in an
  unconstrained host the graph came up as a 2px hairline.

**Contract:**

- Attributes: `subscriber`, `title` (i18n key, optional — hidden on mobile,
  where the toolbar cannot hold it as well as the buttons), `json_data`
  (initial JSON, optional), `view_mode` (`"tree"` default | `"text"` |
  `"graph"`), `$container` (mounted by the parent).
- Input events: `EV_SET_JSON {json}` (replace the whole document; `ST_EMPTY` →
  `ST_READY`), `EV_SUBTREE_LOADED {path, json}` (splice a fetched subtree),
  `EV_SUBTREE_ERROR {path, error}`, `EV_SET_VIEW_MODE {mode}` (`"tree"` /
  `"text"` / `"graph"`; **no mode advances** to the next view, which is what
  the two-view toggle did when the list was two long), plus `EV_REFRESH` /
  `EV_SHOW` / `EV_HIDE` / `EV_LANGUAGE_CHANGED`.
- Output events: `EV_EXPAND_PATH {path, size}` (`EVF_OUTPUT_EVENT`) — the parent
  must declare it in its own FSM (CHILD subscription model) — and
  `EV_JSON_ITEM_CLICKED`, republished from the graph child so the host has one
  contract and never has to know that child exists (`EVF_NO_WARN_SUBS`: most
  hosts do not care).
- Internal (DOM → FSM): `EV_TOGGLE_NODE`, `EV_EXPAND_COLLAPSED`, `EV_SEARCH`,
  `EV_EXPAND_ALL`, `EV_COLLAPSE_ALL`, `EV_COPY_ALL`. Every kw carries only a
  `path` string — never a DOM node or gobj.
- i18n keys the switch needs: `tree view`, `text view`, `graph view`,
  `text truncated; collapse some branches`. All spelled out inside `t()` in
  `view_label()` — never `t(VIEWS[i].key)`, which no `validate-locales` can
  see (that shipped once, in `7.20.0`).
- Paths use the kernel delimiter (backtick) and index arrays numerically, so a
  path emitted by the viewer round-trips through `kw_find_path` on the backend.

**Backend note.** The Raw JSON feed is `print-tranger`, which serves the tranger
with both dict- and array-drill (via `kw_collapse()`): `c_tranger.c` for a
`C_TRANGER` service, and `C_NODE` (it holds `priv->tranger`) for a **treedb**.
A document that arrives with no `__collapsed__` sentinels is simply rendered
client-side (no lazy drill).

Logical DOM classes: `JSON_VIEWER`, `JSON_TOOLBAR`, `JSON_SEARCH`, `JSON_TREE`,
`JSON_ROW`, `JSON_KEY`, `JSON_VALUE`, `JSON_SUMMARY`, `JSON_COLLAPSED`,
`JSON_TIME`. The gclass imports its own `c_yui_json.css`.

### What a node in the graph is CALLED

`C_G6_NODES_TREE` (the record graph inside `C_YUI_TREEDB_GRAPH`) labels a card
by what NAMES the record, which is not always what KEYS it. A topic whose id
column is flagged `rowid`, `uuid` or `qualified` keys its records by something
that is not the plain name — a counter, a random string, or the name with
every ancestor in front of it — and the name lives in the secondary key the
topic declares (`pkey2s`). `treedb_system_schema` is the case that forced it:
its `topics` and `cols` records are named in `value`, so the graph drew cards
reading `181`, `225`, `193` while they were keyed by rowid, and would read the
whole path now that they are qualified.

The rule is in **`treedb_node_label.js`** (pure, unit-tested): read the pkey
column's flags from the desc; if the key is not the plain name, take the first
`pkey2s` field the record actually carries; otherwise keep the id. **The pkey is never
lost** — it is the card's tooltip, on the chip and on the entity card alike.

It needs the descriptor to carry `pkey2s`, which `tranger2_topic_desc()` only
clones from **SDK > 7.13.0**. Against an older node the desc has no `pkey2s`, the
label falls back to the id, and nothing else changes.

### Which backend a view browses: `source_url`

`C_YUI_TREEDB_TOPICS` takes an optional **`source_url`** string and prints it in
its toolbar, between the left buttons and the *raw json* one. A host passes the
url of the connection the view reads through (`wss://host:port`), and an empty
value renders nothing.

The tab that hosts the view is labelled with the **treedb** name, and a treedb
name is not unique across backends: two tabs reading `treedb_yuneta_agent` are
two different machines, and a wrong assumption there is a write on the wrong
node. The url is what tells them apart, and it does not fit in a tab label —
a tab wide enough for `wss://artgins.yunetacontrol.com:1996` is a tab bar with
room for one tab. So the view carries it, where there is a whole row for it.

The buttons of that toolbar never shrink. When the row runs out of room, the
url is what gives way, cut with an ellipsis, and the whole value stays in the
`title` and the `aria-label`.

### Reading a topic a page at a time

`C_YUI_TREEDB_TOPICS` takes **`with_remote_paging`** (off by default) and
forwards it to every topic table: the table pulls the page it is showing
instead of the host pushing the whole topic down. It needs the SDK's `nodes`
with `from` / `limit` (see `YUNO_TREEDB.md` §5.3).

**The page size is generous on purpose** (`page_size`, 200). A treedb that
fits in one page behaves exactly as it did — paginator hidden, every filter
seeing every row — so nothing that exists today changes. Only a topic that
does NOT fit pays for paging, and for that one loading it whole was never an
option.

**Safe against a backend that cannot page:** it answers the whole list, which
`nodes_answer()` reads as one page. That is the truth, and it is why the table
can ask without knowing what it is talking to.

`filterMode: "local"` says the plain truth: the header filters and the search
box work on the page that is loaded. Same as the tranger browser's Rows card,
and for the same reason — the alternative is pushing every filter to the
backend and changing what "search" means.

Who does what: the transport belongs to the HOST, so the table asks with
`EV_REQUEST_PAGE` and the answer comes back as `EV_PAGE_LOADED`, correlated by
an id echoed in `__md_command__`. **Read that id flat off the command stack**
(`kw_command.req_id`): `C_IEVENT_CLI` EXTRACTS `__md_command__` and pushes it
AS the stack's `kw`, so one level deeper is a level too far — and the symptom
is every request timing out with its answer sitting right there.

The promise Tabulator wants is parked in the table (`ajaxRequestFunc` must
RETURN a promise — it is a data source, not an event), with a watchdog,
because the link can stay up and an answer still never land. A refresh
re-pulls the page the reader is on rather than throwing them back to the
first.

### What a delete takes with it

A treedb delete is not one thing, and these views delete with **`force`**.
`force` on a node does not only remove it: its children are **UNLINKED** —
they survive, loose — and it is cleaned off its parents. So "delete this row"
can mean "detach eleven records from their only parent", and the question that
used to be asked, `are you sure`, said none of it.

The confirmation names what is going (the record's key, or how many) and adds
a line per thing at stake, **each only when there is something at stake** — a
loose record must not be dressed up as a dangerous one:

- *N children will be UNLINKED, not deleted*
- *It will be detached from M parents*

Counted off the record the table already has (`list_dict` fills the hook and
fkey columns), so asking costs no round trip. The counting is
`delete_impact.js`, pure and tested, because the shapes are the fiddly part: a
hook or fkey value arrives as a list of refs, a dict keyed by id, or a single
ref string — and a column can be BOTH hook and fkey, which counts on both
sides, because the delete does both things.

In the graph the node-delete popover carries the same two lines, and the
**unlink** popover carries the reassurance that is its whole point: *neither
record is deleted*. Next to a delete button painted the same red, that is not
obvious.

Three things this cost, worth knowing before composing any message from keys:

- `yui_shell_confirm_*` renders its message **as an i18n key**, so a composed
  sentence can never be one. Pass DOM instead — the helper takes it.
- `createElement2` **trims text nodes**, so a `["span", {}, " "]` separator
  vanishes and the question reads "BorrarDeveloper". Space with CSS.
- a **counted** word carries no `i18n` attribute: `yui_shell_show_modal` calls
  `refresh_language()` on the dialog's content, which re-translates from the
  key alone — without the count — and puts the plural back over the singular.
  Nothing is lost, because a dialog with a backdrop never sees a language
  change.

### Editing a topic table in place

A writable scalar is editable in the table, in edition mode
(`with_inline_edit`, default on). Changing one field used to mean opening the
record form, changing it, saving and closing.

**Which cells, and why not the rest.** The schema decides first: only a column
flagged `writable`, and never the pkey — renaming what a record is KEYED by is
not a field edit. Then the type: a hook holds children and an fkey IS a link,
so both are edited by linking; a dict or a list is a document the form has an
editor for; a date cell shows a formatted string over an epoch, so typing into
it would write the string. Those stay with the form, one click away on the
same row. `boolean` gets a tick, `enum` the list of its own values, numbers a
number editor.

**The write is a partial update with no `autolink`, and that is the whole
safety of it.** `treedb_update_node()` merges (`json_object_update`), so the
fields it does not carry are left alone; `autolink` is the option that wipes a
node's links and rebuilds them from the fkeys the record carries, and on a
partial record it reads that as "no parents", detaches the node and answers
**success**. So a cell edit travels as its own event, `EV_UPDATE_FIELD`, and
not as `EV_UPDATE_RECORD` — that one does send autolink, and may, because the
form hands it the whole record with its fkeys in it. See
`schema_write_options.js` for the rule and why each word of it is there.

`editable` is a **function** on the column, not a flag: edition mode is
toggled on a table that is already built, so the answer has to be asked for at
the moment of the click.

A refused write puts the topic back to what the treedb has. Leaving the typed
value on screen is tolerable for a form, which stays open on the values it
failed with; a cell edited in place would just look saved.

### Reading a topic table: filters, columns, CSV

`C_YUI_TREEDB_TOPIC_WITH_FORM` had one global search box over the loaded rows.
Three tools join it, each behind its own flag, all **on** by default:

| attr | what it adds |
|---|---|
| `with_header_filters` | a filter box in the header of each column a match means something on |
| `with_columns_button` | a dialog that ticks which columns the table shows |
| `with_export_button` | downloads what the table holds as CSV |

**Not every column gets a filter box, on purpose.** A hook holds children, a
dict holds a subtree, and a date cell shows a formatted string over an epoch
number — a text match against the raw value there answers a question nobody
asked, so those columns get no box rather than a box that lies. A `boolean`
gets a tristate tick, an `enum` gets a list of its own values, and an `fkey`
gets a box whose match stringifies the value first, because *which rows point
at X* is the question fkey columns exist to answer and a fkey arrives as a ref
string, a list of them or a dict.

The search box and the header filters are **separate layers**: clearing the
search does not silently drop the column filters. The CSV carries what the
table HOLDS — the loaded rows, the visible columns, both filters applied, which
is what the reader is looking at. It is not the topic: a server-side dump of
every node is not something this view can stream, and the button's title says
so.

Searching is a user action, so it crosses the FSM (`EV_SEARCH`) like the rest;
it used to call `tabulator.setFilter` straight from the DOM handler, where the
`machine` trace could not see it.

### Read-only treedbs: `readonly`

`C_YUI_TREEDB_TOPICS` and `C_YUI_TREEDB_GRAPH` take a **`readonly`** attr; the
topics view propagates it to every topic it builds. It is not one more button
flag: it is the STATE of the treedb and it beats each `with_*` flag at once,
because a treedb whose tranger the yuno does not master answers **every** write
with

```
ERROR -1: <yuno>: treedb '<name>' is READ-ONLY, this yuno is not the master of its tranger
```

(the yuno refuses since SDK 7.13.0), so offering the buttons anyway turns a
fact into an error message per click. Ask the yuno which it is with
`command-yuno id=<yuno> service=<treedb> command=treedb-info`, which answers
`{treedb_name, master, schema_version, topics}` — and remember the flag is per
TREEDB and is runtime state: a yuno is routinely the master of its
`treedb_system_schema` and a replica of a data treedb it shares.

What `readonly` takes away: the edition mode, the *new* / *delete* / *paste*
buttons, the in-row edit icons, and the write half of the record form's toolbar
(`copy` stays — reading a record includes taking it with you) with the cells not
editable. The record form still OPENS: looking is the point of a replica.

In the **graph** it takes away the `edition` operation mode, which is the only
one that draws the create / delete / link affordances — the mode select stops
offering it, and a graph left in edition on a master comes back in `reading` on
a replica (the mode is a persisted preference). The other modes are untouched:
panning, zooming and opening a node are reading.

Two implementation notes worth keeping:

- the decision lives in **`treedb_write_plan.js`** (pure, tested), not in five
  `!readonly && with_x` expressions — five places to forget the sixth;
- and the write **events** are refused as well, in every gclass, with a
  `log_error`. Hiding a button is not the same as refusing a write: an event can
  still arrive from a keyboard path or a form that outlived the flag, and an
  ignored write is exactly the behaviour this whole change exists to stop.

### The graph's viewport toolbar

`C_G6_NODES_TREE` floats a vertical toolbar over the canvas:

| control | what it does |
|---|---|
| zoom in / zoom out | one step of scale |
| **the zoom level** | a readout, not a button — `85%` |
| ── | |
| fit | `fitView()`: the whole graph in the viewport |
| **`1:1`** | `zoomTo(1)`: actual size |
| ── | |
| **fit to selection** | `fit`, for the part that is selected (edition only, disabled while nothing is) |
| ── | |
| full screen | the container, not the camera |

Two of those rows are the answer to a real complaint, and the reasoning
generalises:

- **`1:1` used to be a house**, and the house was the thing people reached for
  when they wanted the graph back. It never gave it to them: the action is
  `zoomTo(1)`, which sets the **scale** and leaves the camera where it was, so
  from a corner of a large graph it answered with the same corner at 100%. A
  house means *the initial extent* in a map and *the starting view* in an
  editor — never a scale — and this one sat directly under `fit`, so the pair
  read as two ways to do one thing. Actual size is **written** in every editor
  that offers it, because there is no glyph anybody recognises for it.
- **the zoom level is shown** because `1:1` is a jump to a number, and a jump
  to a number is only meaningful next to the number you are on.
- **fit to selection** wears the `fit` icon with a marked object inside it,
  drawn rather than borrowed: the two sit next to each other and are the same
  action at two scopes, so they have to read as a family. It appears only in
  edition — a button that can never be enabled is furniture, not a control —
  and is disabled while nothing is selected. `fitView()` has no subset form,
  so the bounds are measured off the elements and the zoom is clamped to the
  graph's own `zoomRange`, the only limit that is not invented here. One card
  filling the view is not a bug: that is what zooming to it means.

The **separators are gaps, not lines**: every item already carries a hairline
against its neighbour, so one more line would not group anything. Full screen
is behind the second one because it is a window control that happens to live in
a camera toolbar.

Both toolbars (this one and the edit one) **follow the theme**. They used to be
pinned to a light background in both themes, with the icon colour pinned dark
so it survived that — two light islands over a dark canvas.

**New keys for consumers: `actual size`, `zoom level`, `zoom to selection`**
(all tooltips, so a host that has not defined them shows the key on hover and
nothing else breaks).

### Tabs opened at runtime, and the two decisions their url costs

`yui_tab_routes.js`. A workspace whose tabs are opened by the operator —
`/<ws>/<home>/<id>`, with whatever the tab is showing below it — pays for that
url twice, and both apps in this family learned the same two lessons, one of
them the hard way.

**`yui_tab_split_subpath(subpath)` → `{id, tail}`.** On a cold load the tab's
route does not exist yet: it is registered when the tab is opened, so a reload
on `/<ws>/<home>/<id>/<tail>` resolves only as far as the workspace home and the
shell hands the WHOLE rest over as the subpath — `<id>/<tail>`, not `<id>`.
Reading all of it as the id matches nothing, and an app that then falls back to
its first tab **answers a reload with somebody else's default**. It hides well:
a bare tab route survives, because there the subpath IS the id, so only the deep
case breaks and only for whoever reloads on one.

Only the id segment is decoded. These ids are composite (`<node>`+`0x1F`+
`<yuno>`, `<conn>`+`0x1F`+`<treedb>`) and reach the url percent-encoded, so
decoding the whole tail first would turn an encoded slash inside an id into a
separator and cut it in two.

**`yui_tab_position_plan(prev_base, base, subpath, remembered)` →
`{record, replay}`.** A tab's nav item is a FIXED route —
`yui_shell_set_submenu()` registers it, and that route is where the view is
mounted — so the position inside a tab cannot travel in the item and has to be
replayed when the tab is entered again. "Entered again" is the whole subtlety:
arriving at the root of the tab you were ALREADY in is the way OUT of whatever
was open, and replaying the position there would make that button do nothing.

**What is NOT here: the wiring.** One host restores on its transport's
`EV_ON_OPEN`, another normalizes the route as it arrives, and both are right for
what they know about when their tabs become real. These are the decisions, not
the plumbing — which is also why they are pure and tested rather than three
lines inside an action.

### Selecting several nodes, and moving them together

In **edition** mode the graph has a real selection, not just "the node you
clicked":

| gesture | what it does |
|---|---|
| click a node | selects it **and opens it**: resize handles, ports, popovers |
| **shift + click** | adds that node to the selection, or takes it out |
| **shift + drag on the canvas** | rubber band: the selection becomes what it enclosed |
| **ctrl/cmd + A** | every node |
| the **fit-to-selection** button | puts the viewport on what is selected |
| drag any selected node | **moves the whole selection**, as one undo |
| **Delete** / **Backspace** | deletes the selection, after a confirmation that counts what it takes |
| **Esc**, or a click on the canvas | clears it |

The keys reach the graph only while the **graph has focus** — G6 gives its
canvas a `tabIndex` of its own — which is what keeps `ctrl+A` inside the find
box a selection of the TEXT and not of every node: the focus is in the input,
and the input is not inside the canvas. They arrive as `EV_KEY_DOWN` and the
action decides, so a key is as visible in the `machine` trace as a click.

Three decisions are worth knowing, because each one is where this could have
gone wrong:

- **G6's `selected` element state IS the selection.** `drag-element` decides
  what a drag moves by asking the graph for it
  (`getElementDataByState('node', 'selected')`), so a set kept anywhere else
  would be a second truth the drag never consults — the ring would say five and
  one would move. It also batches the move, so a group drag is one history
  entry rather than one per node.

- **The ring is painted into the card's own html**, and it had to be. A state
  style paints on a node's KEY SHAPE, and every node here is an `html` node
  whose key shape is a DOM element — the same reason the amber highlight had
  never appeared before `7.3.0`. Selecting with `brush-select` and nothing else
  would have selected correctly and shown **nothing**. The ring is blue and
  drawn OUTSIDE the amber halo, so a node that is both a find match and
  selected wears both; one function composes them (`ring_shadow`), because
  before it each repaint wrote its own flag and erased the other's.

- **The gesture is G6's, the result is an event.** `brush-select` gets an
  `onSelect` that sends `EV_BRUSH_SELECT` with the ids, and the action does the
  work — so a marquee shows up in the `machine` trace like every other action.
  Shift+click is not G6's `click-select` at all: this gclass already owns
  `EV_NODE_CLICK`, and adding a second selection owner outside the FSM is how
  the two end up disagreeing.

Panning gives way while **Shift** is held (`drag-canvas` takes an `enable`
predicate), or the canvas would pan under the rubber band — G6 binds
`drag-canvas` straight to the drag events, and its own docs warn that the two
gestures cannot both be a plain drag.

**A delete says what it takes, whether it is one or twenty.** The Delete key
asks the same question the per-node delete icon asks, built by the same
function: the record's key when there is one, the count when there are more,
and then the two lines that are actually at stake — *N children will be
UNLINKED, not deleted* and *it will be detached from M parents* — where over a
set the numbers are the sums. These views delete with `force`, so an operator
pressing Delete over twelve cards has to read eleven detached children, not
"are you sure". It needs no new keys: the sentence is the one `7.10.0` already
defined. The question has no icon to hang off, so it is asked in the middle of
the graph it is about.

**A marquee selects, it does not open.** Even when it encloses exactly one
node, the handles and ports stay away: `_selected_node_id` means *the node
opened for editing*, and only a click sets it. Everything that hangs off a
single node reads that field, so a multiple selection puts all of it away by
construction rather than by a check in twenty places.

### Finding a node in the graph

`C_YUI_TREEDB_GRAPH` carries a find box in the middle of its toolbar. It
matches the term against the node's **label**, its id and its topic name, puts
every match in the same amber `active` state the topic focus uses, and centres
the viewport on them.

Two details that are not decoration:

- it matches the **label**, not only the id. On a topic keyed by `rowid`,
  `uuid` or `qualified` the id is a counter or a path and the name a human
  knows the record by lives in a secondary key — the same reason `node_label()`
  exists.
- it **says how many** it found. A graph that did not move looks identical
  whether nothing matched or the only match was already on screen, so the count
  is shown next to the box (hidden while the box is empty; a typed term that
  matches nothing shows `0`, which is an answer).

The find and the topic focus **share the highlight**: starting one clears the
other. Two amber sets at once would say nothing about either.

The highlight is painted **into the card's own html**, not with G6's `active`
element state. That state is an amber `stroke` + `halo`, both properties of a
node's KEY SHAPE — and every node here is an `html` node, whose key shape is a
DOM element. There was nothing for either property to paint on, so the amber
had never appeared, for the topic focus either. Only the cards whose state
changes are repainted, and a theme switch carries the highlight across (it
rebuilds every card, and rebuilding them without it would clear what is on
screen).

Wiring: the box sends `EV_FIND_NODES {text}` to the view, which forwards it to
`C_G6_NODES_TREE`; the graph answers `EV_FIND_RESULT {term, matches}`, which the
view declares like every other event its child publishes.

### C_YUI_TREEDB_SCHEMA — the treedb drawn the way its `.c` draws it

A landing view that draws a treedb the way its schema literal draws it in ASCII
(`treedb_schema_*.c`, `treedb_system_schema.c`): **one card per topic**,
listing its fields in schema order, and **one edge per hook**, between the row
that declares the hook and the fkey row of the child it names. The **arrowhead
is on the hook**, the way the `.c` draws it and the way the `↖` of the fkey
mark reads: the reference is held by the child and points at its parent. The
edge itself is declared parent → child, which is what ranks the parent to the
left, first, as the literal lists it. Built from the schema `descs` **alone**:
no data, no backend calls. It is the "every
treedb is a graph" rule applied to the schema itself, and an alternate landing
to the topic cards. A node click opens that topic's table through a real hash
navigation, so the graph is a navigation surface rather than a picture.

The marks are the notation of those `.c` literals, so the drawing and the
source read the same:

| Mark | Meaning |
|------|---------|
| `{}` | dict hook — N unique children |
| `[]` | list hook — n not-unique children |
| `()` | a single child |
| `(↖)` | 1 fkey — 1 parent |
| `[↖]` | n fkeys — n parents |
| `{↖}` | N fkeys — N parents |
| `*` | required |
| `#` | the primary key |

`dict` and `object` are one shape and `list` and `array` are another, exactly
as tr_treedb's hook/fkey switches treat them. A self-referent hook (a tree)
draws as a loop.

**Not to be confused with the node graph** (`C_G6_NODES_TREE`, hosted by
`C_YUI_TREEDB_GRAPH`), which draws the **records**. On a treedb whose records
are schemas — `treedb_system_schema` — that one draws a box per column,
hundreds of them, each labelled by a pkey that is a rowid: a correct picture of
the storage and an unreadable picture of the schema. This view answers the
schema question; that one answers the data question.

The demo `test-app/schema.html` mounts it alone against the real yuneta agent
schema, so the drawing can be held against the ASCII one in its `.c`.

**Contract:**

- Attributes: `subscriber`, `descs` (`{topic_name: desc}`, the schema),
  `node_route` (a hash-route template carrying a `{topic}` placeholder, e.g.
  `#/topics/db/<sel>/{topic}` — a node click resolves it and navigates),
  `system` (include the `__*__` system topics too, default `false`),
  `$container` (mounted by the parent).
- Events: `EV_SHOW`, `EV_REBUILD`, `EV_THEME` (restyle — it repaints the G6
  graph in place, preserving the user's zoom/pan), plus `EV_NODE_CLICK`, which
  a node click sends into the FSM. **With a `node_route` the click IS a
  navigation** and this view makes it. **Without one the click is dropped,
  unless the host asked for it with `with_node_click`** — then it is published
  as `{topic}`, for a host that draws the same picture inside its own screens
  and opens the topic in place, with no hash involved. That host must declare
  `EV_NODE_CLICK` in its own FSM, as with every event a child publishes, which
  is exactly why it is opt-in: the CHILD subscription model subscribes a host
  to ALL of this view's events, so publishing one unasked turns a click into
  "Event NOT DEFINED in state" underneath a host that never wanted it. Since
  6.1.2 (6.1.0 and 6.1.1 published it unconditionally).

Barrel-exported and public from 4.0.0. Renders with `@antv/g6`; the cards are
HTML nodes carrying their own inline colours, so a theme switch repaints them in
place (no CSS of its own).

### C_YUI_SCHEMA_EDITOR — a schema edited as a schema

Every schema a yuno holds lives in its `treedb_system_schema`, stored as data
in three flat topics linked by fkeys: `treedbs` → `topics` → `cols`. That is
the right **storage** and it is not a **screen**. Opened with the ordinary
topic editor, adding one column to one topic means finding it in a table
holding every column of every topic of every treedb the yuno has, composing the
parent fkey by hand, and remembering to raise a `topic_version` that nothing
asks about.

This view puts the schema back together and edits that: **treedb → topics →
columns**, each in its declared `order`, with the storage composed underneath —
the qualified id, the fkey to the parent, the place among the siblings, and the
versions that publish the change.

**The versions are the point, not a detail.** `topic_version` is what publishes
a change of a topic's columns: leave it and the persisted `topic_cols.json`
masks the whole edit — the restart succeeds and nothing moved. `schema_version`
is what publishes the schema as a whole ("the stored one wins on ties, and the
incoming one has to be strictly newer to take over", `c_treedb.c`), and raising
it is safe: re-projection from C compares `c_schema_version`, the version of
the **literal**, precisely so that an edit made here survives every start until
a newer literal arrives. So **every write carries both** and the operator is
never asked to remember either. The banner in the column screen is for the case
where something *else* wrote the topic and left its version alone.

What the screens offer:

| Screen | What it is for |
|--------|----------------|
| treedbs | one card per treedb, with its topic count and its `schema_version` beside the `c_schema_version` it was projected from |
| topics | the topics of one treedb in schema order: pkey, column count, version, system flag |
| columns | the heart. Rows in `order`, **draggable** — `order` is a field, so a drop writes the rows whose place actually changed, two or three and not forty |
| diagram | the treedb **drawn from the records being edited**, through `C_YUI_TREEDB_SCHEMA` |

And what the toolbar offers, each answering a question the storage could not:

- **check** — what the treedb would refuse, from the records alone: a pkey
  naming no column, a hook whose target is missing or is not a fkey, two hooks
  on one fkey, an `enum` flag with no `enum`. Applying a schema is restarting
  the yuno that owns it, so a schema it refuses costs an outage to discover and
  the message lands in that yuno's log, on the node, minutes later.
- **export** — the schema as its **C literal**, ready to paste into the source.
  An edit made here works and lives nowhere the next build knows about;
  `diff-schema` says the two halves drifted, and this is the other half of that
  answer. Escaping crosses two layers and the second is not JSON's:
  `helper_quote2doublequote()` rewrites *every* single quote before the parse,
  so a quote inside a value can only survive as `\u0027`.
- **import** — the writes that make the stored schema equal a pasted one, shown
  as a **plan** before it runs. Import is the one operation here that can delete
  a column, so what is confirmed is what runs.

The **flags** of a column are checkboxes that say what they do, grouped the way
they act and dimmed (never hidden) when they are meaningless on the chosen type:
a flag already set on a column of another type has to stay visible or the next
save drops it silently. `hook` and `fkey` turn each other off, because they are
the two ends of one link.

A **name is not editable**: the store keys a column by its qualified id —
treedb, topic and name — so renaming one is creating another and deleting this
one. The form says so rather than offering a field that quietly does something
else.

**Contract:**

- Attributes: `subscriber`, `gobj_remote_yuno` (the transport — the treedb's
  service, or an adapter that reaches it: this view cannot tell and must not),
  `treedb_name` (the system-schema treedb), `readonly` (this yuno does not
  master the tranger, so it refuses every write), `base_route`, `$container`.
- In: `EV_SHOW` (`{subpath}` — the tail it owns is `<treedb>[/<topic>]` or
  `<treedb>/diagram`), `EV_HIDE`, `EV_TRANSPORT_STATE`, `EV_REFRESH`,
  `EV_LANGUAGE_CHANGED`, `EV_MT_COMMAND_ANSWER`.
- Out: `EV_POSITION_CHANGED` (`{subpath}` — the host writes the url; this view
  navigates nothing itself), `EV_RECORD_WRITTEN` (whoever owns the Apply needs
  to know the yuno has not re-read its schema yet), `EV_SCHEMA_CHECKED`
  (`{errors, warnings, first}` — so the confirmation that restarts the yuno can
  say what it is about to restart onto).
- States, because each is a screen and a set of legal actions: `ST_IDLE`,
  `ST_LOADING`, `ST_EMPTY`, `ST_TREEDBS`, `ST_TOPICS`, `ST_DIAGRAM`,
  `ST_COLUMNS`, `ST_SAVING`.

**Three words decide whether a write does what it says** (`schema_write_options.js`,
and they are tested because getting one wrong costs a store repaired by hand):
a create goes through `update-node` and not `create-node`, because only that
path carries **`autolink`** — and without a link a new column belongs to no
topic. `autolink` rewrites a node's links from the fkey fields the record
carries, so it goes with a create, where the record has one, **and with nothing
else**: on a partial update it finds none, reads that as "no parents", and
detaches the node. Raising a topic's version with it on unlinked that topic
from its treedb, and the write answered success.

The logic is pure and tested apart from the view: `schema_model.js` (the three
lists regrouped — grouping follows the **fkey**, not a split of the qualified
id on `.`, which works right up to the first name that carries one),
`schema_validate.js`, `schema_descs.js`, `schema_to_c.js`, `schema_import.js`,
`schema_flags.js`, `schema_write_options.js`. Since 6.1.0.

**A drag can be undone.** Reordering a column is a WRITE — `order` is a field —
so the drop lands in the store the moment you let go. The toolbar grows an
`Undo the order` button that puts the columns back where they were **before the
dragging started** (remembered once per topic, before the FIRST drag), shown
only while there is somewhere to go back to, spent when used, and dropped by a
refresh. Undoing is another write, like the drag. The host must define the key
`"undo the order"`.

### Frontend view — `setup_frontend_view`

`setup_frontend_view(self)` opens the **gobj tree of the app's own yuno** in a
floating `C_YUI_WINDOW` — the browser-side peer of the Developer window
(`setup_dev` / `build_dev_panel` / `apply_dev_traces` / `dev_window_was_open`,
`yui_dev.js`), and the JS answer to `view-gobj-tree` on a C yuno. Wire it to an
account-menu entry. It returns `null` when the window is already open, so the
host can use it to toggle. The tree is a **pure child of the window**, so every
teardown path (the ✕, or the host destroying the window to toggle the entry
off) takes it down too.

### Toolbar badge — a count pinned to an item's icon

```js
/*  app_config.json — seeds the FIRST paint only  */
{ "id": "alarms", "icon": "yi-triangle-exclamation", "align": "end",
  "aria_label": "alarms", "badge": 0,
  "action": {"type": "navigate", "route": "/alarms"} }

/*  the interface that matters: a count is a RUNTIME fact  */
yui_shell_set_toolbar_item_badge(shell, "alarms", 3);
yui_shell_set_toolbar_item_badge(shell, "alarms", 0);   // clears it
```

An icon-only toolbar button is a link; the badge is what makes it a
**signal**. Without a number, an alarm bell cannot say whether anything needs
you — which is the reason to look at it at all.

Rules baked in, all for the same reason (a badge that lies costs more than no
badge):

- **`0`, `""`, `null` and `false` all clear it.** A badge reading "0" is worse
  than none: it draws the eye to say nothing.
- **Over 99 renders `99+`.** The toolbar is a fixed-width row and a four-digit
  pill pushes its neighbours off a phone screen.
- **A string passes through** for the states that are not counts (`"!"`, `"…"`).
- **Unknown item id is a silent no-op**, so an app whose toolbar has no such
  item does not log an error on every tick of whatever feeds the number.
- Writing the **same** value again touches no DOM: the badge is a
  `role="status"` live region, and rewriting it would have a screen reader
  announce the same number on every tick.

`role="status"` and not `aria-hidden`, deliberately: the button carries an
explicit `aria-label`, and an explicit label **replaces** an element's content
for a screen reader — a badge inside it would otherwise be silent. As its own
live region it is both read and announced when it changes.

> `C_YUI_NAV` items do **not** have this. Its item contract listed `badge` for a
> long time and nothing ever rendered it; the claim is gone. Implement it there
> the day a menu entry needs one.

### Modals — `yui_shell_show_modal` and the `before_close` veto

`yui_shell_show_modal(shell, $box, opts)` is the standard popup: pass
`{dialog:true}` for the adaptive dialog (centered card with the X top-right on
desktop, full-screen sheet with a back arrow on mobile), and the shell wires
Escape / backdrop / browser Back for you. It returns a `close()`.

**`opts.before_close`** guards the dismiss. It is consulted on every
*user-driven* close — Escape, backdrop, the X / back-arrow, browser Back — and
returning **`false` vetoes** it, so the caller can run its own flow instead (the
canonical case is an unsaved-changes prompt that closes the modal itself once
confirmed). On a vetoed browser-Back the history entry is re-armed, so Back
keeps working afterwards. With no guard a modal closes exactly as it always
did, and the returned `close()` always closes **unconditionally** — the veto is
for the user's dismiss, not for the code's.

### Confirmations — and the red one, `yui_shell_confirm_danger`

`yui_shell_confirm_yesno(shell, message, opts)` asks a question and resolves to
a boolean. Its yes is `is-link`, the right colour for *"do you want to
continue"*.

**`yui_shell_confirm_danger(shell, message, opts)`** is the same call with a
**red** confirm button and the error icon (`type: "danger"` by default). Use it
whenever the yes destroys something — deleting an account, dropping a record.
The two must not look alike: the destructive one is precisely the one that must
not be clicked by reflex.

In both, the **safe answer is the last button**, so Escape, the backdrop and
the X all resolve to it.

```js
if(await yui_shell_confirm_danger(shell, t("delete account detail"))) {
    /* only here has the red button been pressed */
}
```

### `C_YUI_FORM` — choosing the bottom toolbar

By default the form shows **save + undo + clear + copy + paste**. The
`toolbar` attr takes the button names you want, in the order you want them:

```js
gobj_create("form", "C_YUI_FORM", {toolbar: ["save"]}, parent);   // one action
gobj_create("form", "C_YUI_FORM", {toolbar: []}, parent);         // no toolbar
```

Save/undo/clear stay on the left of the bar and copy/paste on the right — the
split the layout has always drawn — so dropping a whole group leaves no hole in
the middle, and **a toolbar left with a single group is centred**. An unknown
name is reported, not silently dropped: a typo would otherwise remove the save
button with no trace of why.

### Selecting rows in any table — `yui_table_select.js`

Deleting twenty rows one confirmation at a time is not a workflow. Any view
whose table can remove (or export, or act on) a row eventually needs to do it
to several at once, so the checkbox column, the settings behind it and the bar
that appears while something is ticked live here once:

```js
import {
    yui_selection_column,
    yui_selection_settings,
    yui_selection_bar,
    yui_wire_selection,
    yui_selected_rows,
    yui_clear_selection,
} from "@yuneta/gobj-ui/src/yui_table_select.js";

/*  1. the column, FIRST in the list  */
let columns = [yui_selection_column(), ...my_columns];

/*  2. the settings it needs  */
let table = new Tabulator($div, {...yui_selection_settings(), columns: columns, ...});

/*  3. the bar. Every button's job is to SEND AN EVENT  */
priv.bar = yui_selection_bar(t, {
    name:    "CONNECTIONS",
    actions: [{
        label:    "remove selected",        /*  an i18n KEY  */
        icon:     "yi-trash",
        class:    "is-danger",
        on_click: () => gobj_send_event(gobj, "EV_REMOVE_SELECTED", {}, gobj)
    }],
    on_clear: () => gobj_send_event(gobj, "EV_CLEAR_SELECTION", {}, gobj)
});
$container.appendChild(priv.bar.$el);

/*  4. the table tells the bar how many are ticked  */
yui_wire_selection(table, (n) => gobj_send_event(gobj, "EV_SELECTION_CHANGED",
    {count: n}, gobj));
```

Two decisions are baked in, both learned in the treedb topic table:

- **Selection is driven only by the checkbox** (`selectableRows: "highlight"`),
  never by clicking the row. A row is full of things to click — an editor, an
  icon, a nested table — and click-to-select ticks a row every time you reach
  for one of them.
- **The header checkbox covers the ACTIVE rows**, the ones the filters leave on
  screen (`titleFormatterParams: {rowRange: "active"}`). "Select all" over rows
  nobody can see is how a filtered delete takes the whole topic with it.

The bar takes its words from the HOST's `t` (this library translates through
the app's i18next): the app must define **`"{{n}} selected"`** and
**`"clear selection"`**, and each action's own key. The count is composed at
render time, so `refresh_language()` cannot reach it — call `bar.refresh()`
from the view's `EV_LANGUAGE_CHANGED` action.

`yui_selected_rows(table)` and `yui_clear_selection(table)` answer safely on a
table that is not built yet or is already gone. Clear the selection after
acting on it: the rows it names are no longer there.

**In the treedb topic table** (`C_YUI_TREEDB_TOPIC_WITH_FORM`, and through it
`C_YUI_TREEDB_TOPICS`) the bar is **opt-in**: pass `with_selection_bar: true`.
It is off by default because the bar takes its words from the HOST's i18n, and
a host that has not defined `"{{n}} selected"` and `"clear selection"` renders
the keys. It shows only while the table is in **edition mode** — outside it the
checkbox column is hidden, and a count of rows nobody can see or untick is a
count you cannot act on. The bar carries no action there: the table's own
toolbar already has Delete and Copy, and they act on the selection.

`yui_selection_column({visible: false})` is for a table that reveals the column
only in an edit mode — `C_YUI_TREEDB_TOPIC_WITH_FORM` shows it with
`showColumn("_check_box_state_")`, and takes its `selectableRows` and every
read of its selection from here too. A **radio** column (pick ONE row) is not
this facility: it is `formatter: "rowSelection"` with no `titleFormatter` and
`selectableRows: 1`, and the header checkbox, the count and the bar all mean
nothing there.

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
| DOM built AFTER start up (a node's strips, a dropdown panel) | renders the raw key — indistinguishable from a MISSING key | `yui_shell_translate(shell, $el)` right after building it (below) |

**Carrying the key is not enough for the FIRST render.** A node is born holding
the raw English key, and the app's `refresh_language()` passes only walk what
already exists: the shell tree at start up, `document.body` on a language
switch. Anything built later — a `C_YUI_NODE` strip rendered when you walk into
it, a lazily-built toolbar panel — is reached by neither, so it renders the key:
lower-case English that never changes language, which is exactly what a missing
key looks like. Division of labour:

```js
yui_shell_translate(shell, $el);   // LIBRARY-built DOM, right after building it
```

and **app view gclasses translate their own DOM** — they own a `t`, so they call
`refresh_language($container, t)` at the end of their build (this is why the
shell does not translate a mounted view: see `mount_view` in `c_yui_shell.js`).
`yui_shell_translate` is a no-op when the app registered no translator, so
behaviour is unchanged for apps that never call `yui_shell_set_translator`.

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

### Inputs: a clear (✕) is the norm on free-text fields

Every editable free-text field carries a clear button — a big help on mobile,
and `C_YUI_FORM` wires it into its field factory automatically (text / password
/ url / tel and the text-backed numerics; excluded: color, datetime-local,
readonly). Build a bespoke one-off clear and it will look different from every
other one, so use the helper:

```js
import {attach_clear, refresh_clear} from "@yuneta/gobj-ui";

attach_clear($control, $input, on_clear);   // Bulma .delete inside the control
```

`attach_clear($control, $input, on_clear)` appends a Bulma `.delete` that is
visible only while the field has content, hides itself while the input is
`readonly`/`disabled`, dispatches a **synthetic `input` event** so existing
handlers re-run on their own (which is why a component rarely needs a dedicated
"cleared" event), then refocuses. Its tooltip carries `data-i18n-title` /
`data-i18n-aria-label`, so it re-translates on a language change.

`refresh_clear($input)` re-syncs the button's visibility after a change that
fires **no** `input` event — a value loaded into the form, or `readonly` toggled
by the form mode. No-op on an input that never got a clear.

### Indentation is always FOUR spaces

Anywhere structure is shown as indentation — the site map's tree, `C_YUI_JSON`
and the raw dump behind it, any `JSON.stringify` a view puts on screen — one
level is **four** characters. Not two here and four there: the reader is using
the indentation to see the shape, and a shape that changes width between two
panels of the same app is one more thing to decode.

- `JSON.stringify(value, null, 4)` — never `2`.
- Rendered trees indent in **`ch`** (`padding-left: 4ch`), not `rem`: it
  follows the row's own monospace font, so the guides stay lined up with the
  text they belong to instead of drifting at some zoom level.

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
`WINDOW_CLOSE` / `WINDOW_BODY` / `WINDOW_FOOTER` / `WINDOW_RESIZE` and its
default title bar `WINDOW_TITLE` / `WINDOW_TITLE_PREFIX` / `WINDOW_TITLE_KIND`,
a modal
`MODAL` / `MODAL_BACKDROP` / `MODAL_CONTENT` / `MODAL_HEADER` / `MODAL_BACK` /
`MODAL_TITLE` (+ `MODAL_TITLE_PREFIX` / `MODAL_TITLE_KIND`) / `MODAL_CLOSE` /
`MODAL_BODY`, a confirm `CONFIRM*` and a toast
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
