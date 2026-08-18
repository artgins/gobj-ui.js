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
> **BREAKING (5.0.0):** a **dependency-only major** — no component API moved.
> The peer floors are now `maplibre-gl` `^6.0.0`, `@yuneta/gobj-js` `^7.8.7`,
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

**Contract:**

- Attributes: `subscriber`, `title` (i18n key, optional), `json_data` (initial
  JSON, optional), `$container` (mounted by the parent).
- Input events: `EV_SET_JSON {json}` (replace the whole document; `ST_EMPTY` →
  `ST_READY`), `EV_SUBTREE_LOADED {path, json}` (splice a fetched subtree),
  `EV_SUBTREE_ERROR {path, error}`, plus `EV_REFRESH` / `EV_SHOW` / `EV_HIDE` /
  `EV_LANGUAGE_CHANGED`.
- Output event: `EV_EXPAND_PATH {path, size}` (`EVF_OUTPUT_EVENT`) — the parent
  must declare it in its own FSM (CHILD subscription model).
- Internal (DOM → FSM): `EV_TOGGLE_NODE`, `EV_EXPAND_COLLAPSED`, `EV_SEARCH`,
  `EV_EXPAND_ALL`, `EV_COLLAPSE_ALL`, `EV_COPY_ALL`. Every kw carries only a
  `path` string — never a DOM node or gobj.
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

### C_YUI_TREEDB_SCHEMA — the treedb as a graph of topics (prototype)

A landing view that draws a treedb as a **graph of topics** — one node per
topic, one edge per hook/fkey relationship — built from the schema `descs`
**alone**: no data, no backend calls. It is the "every treedb is a graph" rule
applied to the schema itself, and an alternate landing to the topic cards. A
node click opens that topic's table through a real hash navigation, so the
graph is a navigation surface rather than a picture.

**Contract:**

- Attributes: `subscriber`, `descs` (`{topic_name: desc}`, the schema),
  `node_route` (a hash-route template carrying a `{topic}` placeholder, e.g.
  `#/topics/db/<sel>/{topic}` — a node click resolves it and navigates),
  `system` (include the `__*__` system topics too, default `false`),
  `$container` (mounted by the parent).
- Events: `EV_SHOW`, `EV_REBUILD`, `EV_THEME` (restyle — it repaints the G6
  graph in place, preserving the user's zoom/pan), plus the internal
  `EV_NODE_CLICK` a node click sends into the FSM.

Marked a **prototype**: it is barrel-exported and public from 4.0.0, but its
shape may still move. Renders with `@antv/g6` (no CSS of its own).

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
