# Changelog

`@yuneta/gobj-ui` — Yuneta UI library (v2 declarative shell on the GObject-JS
runtime). This file tracks the **v2 line** (`main`); the frozen v1 GClass GUI
stack is maintenance-only and versioned separately (`1.x`, npm dist-tag
`legacy`).

## 7.18.3

- **fix: and the focus was being taken away again right after.** Focusing the
  canvas on pointerdown is not enough on its own, which a probe made plain: the
  press DOES focus it, and then the browser runs its own focus handling for the
  mousedown — after ours — and a card is not focusable, so it moves the focus
  to `<body>`. The graph went deaf immediately after the click that selected
  something, which is the worst possible moment for it.

  It is put back on `focusout`, and **only when the focus goes nowhere**
  (`relatedTarget` null). A focus moving to a real element — the find box, a
  dialog, the next tab stop — is the user leaving, and is left alone.

  The `click` listener 7.18.2 added is gone: it never fired. Selecting repaints
  the card between the press and the release, so the element the mouseup lands
  on is not the one the mousedown started on and no click is generated at all.

## 7.18.2

- **fix: 7.18.1 put the focus back on the wrong canvas.** A G6 graph stacks
  **four** canvases and gives every one of them a `tabIndex`, so
  `querySelector("canvas")` finds a focusable element that receives nothing:
  only the MAIN layer carries the listeners, and it is the only one G6 leaves
  with pointer events (`configCanvasDom` sets `pointerEvents: none` on the
  rest). Focusing the wrong one looks exactly like focusing the right one and
  delivers no key. It now picks the layer by that property.

  The listener also moves to the **capture** phase and is added on the `click`
  as well as the press: the cards are DOM and may stop a press from bubbling,
  and the browser does its own focus handling on mousedown — after ours — which
  sends the focus to `<body>` when what was pressed cannot take it. A card
  cannot.

  Both were found by measuring instead of reasoning: a probe reporting
  `document.activeElement` and every keydown said `BODY` after a card click and
  showed the Escape arriving at the document with nothing focused. 7.18.1 was
  the right diagnosis of the wrong half.

## 7.18.1

- **fix: after clicking a node, the keys did nothing.** The keyboard reaches
  the graph through G6's canvas, which is the element carrying a `tabIndex` —
  and a card is a DOM element INSIDE the container, so clicking one takes the
  focus off the canvas. Select two nodes by clicking them, press Escape, and
  nothing happened: the most ordinary way there is to reach for that key.

  Found on the deployed app, and only because the test that caught it asked two
  questions instead of one — *did the ring clear?* as well as *did the button
  follow?* The button was right all along; what never arrived was the key. A
  test that had checked only the button would have blamed the button.

  Every pointerdown inside the graph now puts the focus back on the canvas,
  except on what is there to be typed into — the popovers this gclass appends
  to its own container carry inputs, and stealing their focus on pointerdown
  would make them impossible to fill in.

- **fix: full screen is only left when it was entered.** `Escape` asked the
  plugin to exit whether or not anything was in full screen. Harmless as it
  stood (the plugin checks `document.fullscreenElement` and returns), but this
  moved from a listener into an ACTION in `7.17.0`, where anything thrown takes
  the rest of the key with it.

## 7.18.0

- **feat: zoom to the selection.** `fit` gives back the whole graph; with a
  selection there is now the same action for the part of it you are working
  on — a button in the camera group of the toolbar, next to `fit`.

  Its icon is the `fit` brackets **with a marked object inside**, drawn rather
  than borrowed from an icon set: the two sit side by side and are one action
  at two scopes, so they have to read as a family. It appears **only in
  edition**, because that is where a selection can exist and a button that can
  never be enabled is furniture rather than a control, and it is **disabled
  while nothing is selected** — toggled on the element, not by re-rendering the
  toolbar, which would drop every other button's disabled state each time a
  card is ticked.

  The camera move is computed rather than delegated: `fitView()` fits the whole
  graph and has no subset form. The bounds are measured off the elements
  themselves, so a card's real size is what is used and not an assumed one, and
  the zoom is clamped to the graph's own `zoomRange` — the only limit here that
  is not invented. A selection of one card filling the viewport is not a bug:
  that is what zooming to it means, and it is what every editor offering the
  action does.

  **New key for consumers: `zoom to selection`** (a tooltip).

## 7.17.0

- **feat: the selection gets the three keys it was missing.** `7.16.0` gave the
  graph a selection and left it reachable only by pointer. **Esc** clears it,
  **ctrl/cmd+A** takes every node, and **Delete** / **Backspace** deletes it.

  **The delete asks the same question the per-node icon asks**, built by the
  same function rather than a second copy of it: the record's key when it is
  one, the count when there are more, and then the two lines that are actually
  at stake — *N children will be UNLINKED, not deleted*, *it will be detached
  from M parents* — where over a set the numbers are the **sums**. These views
  delete with `force`, so someone pressing Delete over twelve cards has to read
  the eleven children they are about to detach. **No new keys**: this is the
  sentence `7.10.0` already defined, and the single-node path now reads it from
  the same place, so the two cannot drift. The question has no icon to hang
  off, so `show_confirm_popover` learns to centre itself in the graph when it
  is given no anchor — which also replaces a silent `return` on a missing one.

  **The keys reach the graph only while the graph has FOCUS**, G6 giving its
  canvas a `tabIndex`. That is not a detail: it is what keeps `ctrl+A` typed in
  the find box a selection of the text and not of every node in the treedb, and
  it comes for free rather than from a list of element types to ignore.

  They arrive as `EV_KEY_DOWN` and the action decides, so a key is as visible
  in the `machine` trace as a click. The two full-screen keys move into that
  action with them — they were the reason a keydown listener existed at all,
  and they were wired straight to the plugin from the callback, which is the
  one thing this gclass asks every other gesture not to do.

## 7.16.0

- **feat: several nodes can be selected, and they move together.** A treedb
  graph could be rearranged one node at a time and no other way. In **edition**
  mode there is a selection now: **shift+click** adds a node or takes it out,
  **shift+drag on the canvas** is a rubber band, dragging any selected node
  moves the whole set, and a click on the canvas clears it.

  The group move costs nothing to implement and that is the point of how it is
  wired: **G6's `selected` element state IS the selection**, because
  `drag-element` decides what a drag moves by asking the graph for it
  (`getElementDataByState('node', 'selected')`). A set kept anywhere else would
  be a second truth the drag never consults — the ring would say five and one
  would move. G6 also batches the move, so a group drag is **one** history
  entry, not one per node, and `save_geometry` already writes one `__graphs__`
  record per topic, so forty nodes cost the same writes as one.

  **The ring is painted into the card's own html, and it had to be.** A state
  style paints on a node's KEY SHAPE, and every node here is an `html` node
  whose key shape is a DOM element — the same reason the amber highlight had
  never appeared before `7.3.0`. Turning on `brush-select` and nothing else
  would have selected correctly and shown **nothing**: the identical silent
  failure, one release later, in a new place. The ring is blue and drawn
  OUTSIDE the amber halo so a node that is both a find match and selected wears
  both, and one function composes them (`ring_shadow`) — before it, each
  repaint wrote its own flag and erased the other's, which was already a latent
  bug between the find and the click selection.

  **The gesture is G6's, the result is an event.** `brush-select` carries an
  `onSelect`, so the rubber band sends `EV_BRUSH_SELECT` with the ids it
  enclosed and the action does the work — a marquee shows up in the `machine`
  trace like everything else. Shift+click is deliberately **not** G6's
  `click-select`: this gclass already owns `EV_NODE_CLICK`, and a second
  selection owner living outside the FSM is how the two end up disagreeing
  about what is selected.

  Panning gives way while Shift is held (`drag-canvas` takes an `enable`
  predicate) or the canvas pans under the rubber band; G6's own docs warn that
  the two gestures cannot both be a plain drag.

  **A marquee selects, it does not open.** Even enclosing exactly one node, the
  resize handles and ports stay away: `_selected_node_id` means *the node
  opened for editing* and only a click sets it. The twenty-odd places that hang
  off a single node read that field, so a multiple selection puts all of them
  away by construction instead of by a check in each.

  No new i18n keys: a selection has no words.

## 7.15.0

- **feat/fix: the graph's viewport toolbar says what it does.** The button that
  people reach for when they want the graph back was a **house**, and it never
  gave it to them: the action behind it is `zoomTo(1)`, which sets the SCALE
  and leaves the camera where it was — so from a corner of a large graph it
  answered with the same corner at 100%. A house means *the initial extent* in
  a map and *the starting view* in an editor, never a scale, and this one sat
  directly under `fit`, so the two read as two ways of doing one thing and one
  of them lied.

  The action is right, so only what it is called changes: it is **`1:1`** now,
  written and not drawn, which is how every editor that offers actual size
  labels it — there is no glyph anybody recognises for it. `fit` keeps the
  corner-brackets icon it already had, and it is the one that gives the whole
  graph back.

  Around that:

  - **the zoom level is shown** (`85%`, a readout, not a button). `1:1` is a
    jump to a number and only means something next to the number you are on.
    It follows the wheel by patching its own text node, not by re-rendering the
    toolbar — a rebuild would drop the disabled state of the edit buttons on
    every notch.
  - **group separators**, which are GAPS and not lines: every item already
    carries a hairline against its neighbour, so one more line groups nothing.
    Full screen goes behind one of them, being a window control that happens to
    live in a camera toolbar.
  - **both toolbars follow the theme.** They were pinned to a light background
    in BOTH themes, with the icon colour pinned dark so it survived that — two
    light islands sitting over a dark canvas. The tokens flip them now, and the
    fallbacks are the old forced-light values, so a host without Bulma gets
    exactly what it had. Same for the hairlines and the hover, which were a
    hex each.

  `YuiToolbar` grows the three item kinds this needed — `text`, `readout` and
  `separator`. A readout and a separator carry their own class rather than
  `g6-toolbar-item`, which is what G6's own click handler keys off, so they are
  inert by construction instead of by a guard.

  **New keys for consumers: `actual size`, `zoom level`.** Both are tooltips: a
  host that has not defined them shows the key on hover, and nothing else
  changes.

## 7.14.3

- **chore: six actions and methods answer the contract they are written
  against.** The boolean/int trap that cost gobj-js three releases needs two
  halves — someone answering off-contract, and someone comparing that answer
  with a number. An audit of this library's 343 actions and framework methods
  found **no comparison** of the second kind (every numeric comparison here is
  on a count, a length or a coordinate, and `remote_command()` states its own
  `0`/`-1` contract), and **six** answers of the first: a bare `return;` where
  the contract says a number.

  They are `return 0` where the early exit is benign (`C_YUI_NODE.mt_start` on
  a non-root node, `C_YUI_SHELL.mt_stop` with no priv) and `return -1` where it
  is a failure that was already logged (`C_YUI_NODE.mt_start` with no shell to
  route with, `C_YUI_SHELL.mt_start` on an invalid config, and the two
  `ac_mt_command_answer` that catch a malformed answer).

  Nothing changes today — nobody was reading those returns — which is exactly
  why it is worth doing now rather than the day someone does.

## 7.14.2

- **fix: after deleting the selected rows, the selection was still described.**
  A `//tabulator.deselectRow(); // TODO ??? is necessary?` had been sitting in
  `ac_node_deleted` for years. It is not necessary — Tabulator's own SelectRow
  module subscribes to `row-deleting` and deselects the row it is about to
  remove, so a deleted row cannot stay in the selection. But that deselect is
  **silent** (`_deselectRow(row, true)`): no `rowDeselected`, no
  `EV_UNSELECT_ROWS`, so everything the selection drives kept describing rows
  that were gone — the bar saying "3 selected" over a table with none, and
  Delete and Copy still enabled.

  The comment is replaced by the line that WAS missing, and what the selection
  drives is now read from the table in one place (`render_selection_state()`)
  instead of the same block copied into the select and unselect actions.

## 7.14.1

- **fix: the Undo button never appeared.** 7.14.0 dropped the remembered order
  in `build_model()`, and that runs on the record patch after EVERY write — so
  the drag's own answer erased what the undo was about, and the button was
  computed as "nothing to go back to". The order is dropped where it was meant
  to be dropped: when records arrive from the STORE (the initial load and the
  refresh).

## 7.14.0

- **feat: a column drag can be undone.** Dragging a row by its handle is a
  WRITE — `order` is a field of the column, so the drop lands in the store the
  moment you let go — and the only way back was dragging every row to where you
  thought it had been. There is a button now, `Undo the order`, and it puts the
  columns back where they were **before the dragging started**: the order is
  remembered once per topic, before the FIRST drag and not before each one,
  because whoever tries three arrangements wants the one they started from, not
  the third.

  It shows only while there is somewhere to go back to (drag a row back by hand
  and it goes away), it is spent when used, and a **refresh** drops it — what it
  names is what was on screen, and a reload brings the stored order instead.
  Only a refresh: the model is also rebuilt by the patch that follows every
  write, which is precisely when the undo has to survive.

  Undoing is another write, like the drag: the rows whose place changes are
  rewritten, and the versions move with them. It does not pretend nothing
  happened, because something did.

  **The host needs one key: `"undo the order"`.**

## 7.13.6

- **fix: 12rem was not enough for a treedb card** (see 7.13.5): the name
  shares its row with the icon and the card's padding, so it gets some 60px
  less than the card is wide. `14rem` is what puts `treedb_yuneta_agent` on
  one line.

## 7.13.5

- **fix: the schema editor's FORM controls grow with its buttons.** 7.13.4 left
  the labels, inputs, selects, textareas and flag checkboxes of the column and
  topic dialogs at `is-small`/`is-size-7` — a dialog you type into, wearing the
  one size the rest of the editor had just stopped using. They are default size
  now. What stays small is still what is data in bulk: the report tables, the
  crumbs, and the export/import textareas holding a C literal or a JSON dump.

- **fix: a treedb card is wide enough for a treedb name.** The shell's card
  grid starts at `9rem` (144px), and `treedb_yuneta_agent` breaks into three
  lines inside its own card. The editor's grid starts at `14rem` — the name shares its row with the icon and the card's padding, so what it gets is some 60px less than the card, and 12rem still broke it in two. The shell
  default is untouched — it also serves grids of short labels, where 12rem
  would be a lot of air.

## 7.13.4

- **fix: the schema editor's buttons and icons are the size of buttons.** Every
  control in `C_YUI_SCHEMA_EDITOR` was `is-small` — the toolbar (Diagrama,
  Comprobar, Exportar, Importar, Nuevo topic, Recargar), the back button, the
  per-row edit/delete icons (`is-small` twice: the button AND the icon inside
  it), the version-bump button, the drag handle, and the buttons of the column,
  topic, export and import dialogs. Next to the card's own toolbar, which is
  default-sized, they read as a different, lesser control set, and the row icons
  were a 12px target.

  All of them are default size now. The standing rule in this repo is default
  or larger; `is-small` on a button is not a style choice here, it is a defect.
  What stays small is text that is DATA in bulk — the report tables, the export
  and import textareas holding a C literal or a JSON dump — where fitting more
  on screen is the whole point.

## 7.13.3

- **fix: our Tabulator fixes were being emitted BEFORE the theme they fix.**
  `c_yui_form.js` imported `./tabulator.css` and then
  `tabulator-tables/dist/css/tabulator_bulma.css`, so in the bundle the theme
  landed last and won every tie — and a "fix on top of the theme" that does not
  out-specify it is nothing but a tie. That is why 7.13.1 and 7.13.2 both left
  the filter border exactly as it was, in both themes: the rule was right and
  never applied. The imports are the other way round now, which is the actual
  fix; the whole of `tabulator.css` was in the same position.

## 7.13.2

- **fix: that hairline rule never LANDED.** `tabulator_bulma.css` paints the
  filter border at `.tabulator .tabulator-header .tabulator-col
  .tabulator-header-filter input` — one class more than the selector 7.13.1
  used — so the cascade kept the theme's `#dbdbdb` and the box looked exactly
  as before, in both themes. The selector carries `.tabulator-col` now, which
  is the whole fix. Caught by reading the COMPUTED border on the deployed
  console instead of trusting the stylesheet.

## 7.13.1

- **fix: the filter box hairline is neutral, so it is quiet in BOTH themes.**
  7.13.0 gave it `--bulma-border`, and that token does not flip with the theme
  here: it stays `#dbdbdb`, a hairline over white and a bright line over
  near-black — the same shouting, one theme along. A translucent mid-grey
  (`rgba(128,128,128,.35)`) reads the same over both and needs no per-theme
  rule. Caught on the deployed console with the theme switched.

## 7.13.0

- **feat: the treedb topic table can show the selection bar
  (`with_selection_bar`, off by default).** With 200 rows to a page, the
  checkboxes that answer "how many did I tick?" are not all on screen, and
  nothing else answered it: the toolbar buttons only go enabled or disabled.
  The bar says the count and offers the way out; it carries no action, because
  Delete and Copy are already in the toolbar above it and act on the selection.

  It shows only while the table is in **edition mode** — outside it the checkbox
  column is hidden, and a count of rows nobody can see or untick is a count you
  cannot act on. The selection itself is left alone: coming back to edition
  finds it, and the bar recounts from the table.

  **Off by default on purpose.** The bar takes its words from the HOST's
  i18n, so a host that turns it on must define `"{{n}} selected"` and
  `"clear selection"` — a host that has not would render the keys.
  `C_YUI_TREEDB_TOPICS` forwards the flag to every topic table it builds.

- **fix: the header filter box is furniture again, not an open editor.** It
  shared its rules with the cell editor, and an editor is a MODE — one cell,
  while you type into it, deliberately the brightest thing on screen. A filter
  box is permanent and there is one per column, so a header of eight columns
  drew eight hard boxes across the top of every table, **link-blue** in dark
  theme. Now a hairline in the theme's weakest border colour with no wash of
  its own, and only the FOCUSED one takes the link border — the one you are
  typing in.

## 7.12.0

- **feat/fix: the treedb topic table uses the shared selection facility — and
  its "select all" stops reaching past the filters.** That table is where both
  of the facility's decisions were learned, and it was the one table not
  applying the second one. Its header checkbox carried no `rowRange`, which in
  Tabulator means `selectRow(undefined)` → **every row loaded**, the ones the
  header filters hide included. The button next to it DELETES. Filter a topic
  down to the three rows you mean, tick the header, press Delete, and the
  confirmation is about every row in the page.

  It now ticks the **active** rows, the ones on screen. The column, the
  `selectableRows` value and every read of the selection come from
  `yui_table_select.js`, so the two decisions live in one place instead of
  two. The column stays hidden until edit mode (`showColumn`) and keeps its
  40px: that part is the table's own design.

  `yui_selection_column()` takes `visible` for exactly that case. The RADIO
  column stays where it was: picking one row is a different widget, and the
  header checkbox, the count and the bar all mean nothing there.

## 7.11.1

- **fix: the selection bar is not there when nothing is selected.** It carried
  `is-flex` AND `is-hidden`, and every Bulma helper is `!important`: two
  equally-weighted declarations, decided by the stylesheet's order — `is-flex`
  wins, so the bar sat under every table saying "0 selected". The layout is
  inline now (a plain declaration, which `is-hidden !important` beats whenever
  the class is on) and only `is-hidden` toggles. Caught on the deployed app;
  jsdom cannot catch it, it does not load Bulma.

## 7.11.0

- **feat: selecting rows is a facility now, not a thing each table reinvents
  (`yui_table_select.js`).** A table that can remove a row is eventually asked
  to remove twenty, and doing it one confirmation at a time is not a workflow.
  The checkbox column, the settings behind it, and the bar that appears while
  something is ticked ("3 selected", the actions, a way out) are one module:
  `yui_selection_column()`, `yui_selection_settings()`, `yui_selection_bar()`,
  `yui_wire_selection()`, `yui_selected_rows()`, `yui_clear_selection()`.

  Two decisions travel with it, both learned in the treedb topic table.
  Selection is driven **only by the checkbox** (`selectableRows: "highlight"`),
  never by clicking the row — a row is full of things to click, and
  click-to-select ticks it every time you reach for one of them. And the header
  checkbox covers the **active** rows, the ones the filters leave on screen:
  "select all" over rows nobody can see is how a filtered delete takes the whole
  topic with it.

  The bar translates through the HOST's `t`, so the app owns the keys — it needs
  `"{{n}} selected"` and `"clear selection"` — and it exposes `refresh()`,
  because a count composed at render time cannot re-translate itself.

  No existing behaviour moves: this is a new module nothing imported yet.

## 7.10.5

- **fix: the GeoJSON owes maplibre a real boolean.** `devices2geojson` copied
  `device.connected` into the feature properties verbatim. Four style
  expressions test that property with `['case', ...]`, and maplibre asserts a
  **strict** boolean there — so a device carrying `null`, carrying nothing, or
  carrying the `1`/`0` a backend may send fails the assertion.

  Reproduced against maplibre's own expression engine
  (`@maplibre/maplibre-gl-style-spec`, the same `createExpression` the worker
  runs). With `connected` null:

  ```
  clusterProperties map    ['+', ['case', ['get','connected'], 1, 0]]
      -> "Expected value to be of type boolean, but found null instead."
      -> returns NULL, so the cluster property is null
  clusterProperties reduce ['+', ['accumulated'], ['get','connected']]
      -> "Expected value to be of type number, but found null instead."
  ```

  **The damage is not the console.** A null accumulator poisons the cluster,
  and the cluster colour compares it against `point_count` — never equal, so
  the cluster paints **red**, as if a device were down. The unclustered point
  and its label lose their colour expression too and fall back to the property
  default, black, instead of green or red. The map was reporting a state that
  was not true.

  `connected` is now `!!device.connected`, which also makes the `1`/`0` case
  work rather than merely stop erroring: absent means not connected, and it
  says so.

- **fix: `get_coordinates` asks for `settings` instead of assuming it.** It
  read `device.settings.coordinates` while its own comment says `settings` may
  be null — a TypeError that would unwind out of `devices2geojson`.

Both ship on the frozen v1 line as `1.0.3`, where estadodelaire hit them.

## 7.10.4

- **fix: the map asks for its source, it does not guess it from the style.**
  `C_YUI_MAP`'s refresh guarded itself with `map.isStyleLoaded()` and then
  called `map.getSource('devices').setData(...)`. The style is the wrong
  milestone: `devices` is added by `load_devices()` on the map `load` event,
  and `load` fires **one render frame after** `isStyleLoaded()` turns true. A
  refresh landing in that frame threw *"can't access property setData,
  map.getSource(...) is undefined"* — and the throw is not contained: it
  unwinds through `gobj_publish_event` and aborts the publisher's own loop, so
  the caller stops processing the rest of its batch.

  Measured against maplibre-gl 5.24.0 in Firefox: style + tiles take 577-934 ms
  and the dangerous window is **exactly one frame**, 10-42 ms, on every run —
  cold cache, warm cache and a `display:none` container alike.

  Testing the style was wrong in the other direction too. `style.loaded()`
  requires every tile manager to be loaded, so it goes back to FALSE while new
  tiles come in: once the map was up, every refresh during a pan or a zoom was
  silently dropped and the devices stopped moving until the tiles settled.

  Nothing is lost by skipping — `load_devices()` reads the same `devices` attr
  when it runs. Found on estadodelaire, which consumes the v1 line; the same
  fix ships there as `1.0.2`.

## 7.10.3

- **fix: the singular still lost.** `yui_shell_show_modal` calls
  `refresh_language()` on the dialog's content, which re-translates anything
  carrying an `i18n` attribute — calling `t()` **without the count** and
  putting the plural straight back over the singular. A counted word cannot be
  re-translated from its key alone, so it carries no `i18n` attribute. Nothing
  is lost: a dialog with a backdrop never sees a language change.

## 7.10.2

- **fix: "detached from 1 parents".** The counted words take a `count`, so
  i18next picks the singular; the plural stays on the BASE key, which is what
  the locale validators look for (they know nothing of `_one` / `_other`), so
  a consumer only has to add the singular. Safe against a language switch
  because this is a MODAL — a dialog with a backdrop never sees one, the
  language button is behind it.

  New keys: `parents_one`, `children will be unlinked, not deleted_one`.

## 7.10.1

- **fix: the composed question lost its spaces.** `createElement2` TRIMS text
  nodes, so the `["span", {}, " "]` separators vanished and the question read
  "BorrarDeveloper". Each line is a flex row with a **gap** now: spacing is CSS
  anywhere text is composed from keys.

## 7.10.0

- **feat: a delete says what it takes with it.** The question was `are you
  sure` — the same words for one loose record and for twelve with children
  hanging off them. And these views delete with **`force`**, which on a treedb
  node does not only remove it: its children are **UNLINKED** (they survive,
  loose) and it is cleaned off its parents. An operator could detach eleven
  records believing they had removed one.

  The confirmation now names what is going (the record's key, or how many),
  and says the two things that are at stake, each only when there is
  something at stake — a loose record must not be dressed up as a dangerous
  one:

  - *N children will be UNLINKED, not deleted*
  - *It will be detached from M parents*

  Counted off the record the table already has (`list_dict` fills the hook and
  fkey columns), so asking costs no round trip. The counting is a pure, tested
  helper (`delete_impact.js`) because the shapes are the fiddly part: a hook or
  fkey value arrives as a list of refs, a dict keyed by id, or a single ref
  string, and a column can be BOTH hook and fkey — which counts on both sides,
  because the delete does both things.

  In the graph, the node-delete popover gains the same two lines, and the
  **unlink** popover gains the reassurance that is its whole point: *neither
  record is deleted*. Next to a delete button painted the same red, that is
  not obvious.

  Built as DOM rather than a string in the table's dialog, and that is forced
  rather than chosen: `yui_shell_confirm_*` renders its message AS AN I18N KEY,
  so a composed sentence could never be one. Each translatable half carries its
  own key and the numbers sit between them as data — which is also the only way
  the question survives a language switch.

  New keys for consumers: `records`, `parents`,
  `children will be unlinked, not deleted`, `it will be detached from`,
  `neither record is deleted`.

## 7.9.2

- **fix: the paginator hid itself on every FULL page.** Whether there is more
  was derived from the row count against the page size — which is right for
  local pagination and nonsense for remote: 50 rows of a 50-row page reads as
  "it all fits" and it does not. Remote paging asks `getPageMax()`, which is
  the `last_page` the answer carried.

- **fix: the row count said "50 rows" of a topic with 114.** With remote
  paging the count is the PAGE, so the footer says `50 / 114` when there is
  more behind it.

## 7.9.1

- **fix: a page answer never found the table that asked for it.** The
  correlation id rides in `__md_command__`, and `C_IEVENT_CLI` **extracts**
  that object and pushes it as the command stack's `kw` — so `kw_command` IS
  it, and reading `kw_command.__md_command__.req_id` was one level too deep.
  Every page request timed out with the answer sitting right there.

  **No git tag on purpose**: it was published from a working tree that was
  never committed on its own, and a tag pointing at the commit that also
  carries 7.9.2 would claim a source it does not have.

## 7.9.0

- **feat: a topic table can pull its rows a PAGE at a time**
  (`with_remote_paging` on `C_YUI_TREEDB_TOPICS`, forwarded to every topic
  table; off by default). The SDK's `nodes` takes `from` / `limit` and answers
  `{total_rows, pages, data}`; the table asks for the page it is showing
  instead of the host pushing the whole topic down.

  **The page size is generous on purpose** (200): a treedb that fits in one
  page behaves exactly as it did — paginator hidden, every filter seeing every
  row — so nothing that exists today changes. Only a topic that does NOT fit
  pays for paging, and for that one loading it whole was never an option.

  `filterMode: "local"` says the plain truth: the header filters and the
  search box work on the page that is loaded. Same as the tranger browser's
  Rows card, and for the same reason — the alternative is pushing every filter
  to the backend and changing what "search" means.

  **Safe against a backend that cannot page:** it answers the whole list,
  which the table reads as one page. That is the truth, and it is why the
  table can ask without knowing what it is talking to.

  Who does what: the transport belongs to the HOST, so the table asks with
  `EV_REQUEST_PAGE` and the answer comes back as `EV_PAGE_LOADED`, correlated
  by an id echoed in `__md_command__`. The promise Tabulator wants is parked
  in the table (`ajaxRequestFunc` must RETURN a promise — it is a data source,
  not an event), with a watchdog, because the link can stay up and an answer
  still never land. A refresh is a re-pull of the page the reader is on, not a
  jump back to the first.

## 7.8.1

- **fix: the topic table reads the SHAPE of a `nodes` answer.** `nodes` now
  answers a plain list, or — when asked for a page — the
  `{total_rows, pages, data}` envelope (SDK `c_node.c`). Both shapes are alive
  at once and will be for a long time: this SPA talks to backends the operator
  configures, and an older one answers the plain list whatever is asked of it.
  The view read the answer as an array, so the day a backend upgraded it would
  have rendered an object's keys as rows — a break that looks like a bug in
  the app.

  The reading is a pure, tested helper (`nodes_answer.js`), because it is
  exactly the sort of thing that cannot be exercised until the other side
  moves.

## 7.8.0

- **feat: edit a cell in place.** Changing one field meant opening the record
  form, changing it, saving and closing — four clicks for a word. A writable
  scalar is editable in the table now, in edition mode (`with_inline_edit`).

  Which cells: the schema decides (`writable` only, never the pkey — renaming
  what a record is KEYED by is not a field edit) and the type decides the
  rest. A hook holds children and an fkey IS a link, so both are edited by
  linking; a dict or a list is a document the form has an editor for; a date
  cell shows a formatted string over an epoch, so typing into it would write
  the string. Those stay with the form, one click away on the same row.
  `boolean` gets a tick, `enum` the list of its own values, numbers a number
  editor.

  **The write is a PARTIAL update with no `autolink`, and that is the whole
  safety of it.** `treedb_update_node()` merges (`json_object_update`), so the
  fields it does not carry are left alone; `autolink` is what wipes a node's
  links to rebuild them from the fkeys the record carries, and on a partial
  record it reads that as "no parents", DETACHES the node and answers success.
  So a cell edit travels as its own event (`EV_UPDATE_FIELD`) rather than
  reusing `EV_UPDATE_RECORD`, which does send autolink and may — the form
  hands it the whole record with its fkeys in it.

  `editable` is a FUNCTION on the column, not a flag: edition mode is toggled
  on a table that is already built, so the answer has to be asked for at the
  moment of the click.

- **fix: a refused write left the table showing what the operator typed.**
  Tolerable for a form, which stays open on the values it failed with; not for
  a cell edited in place, which looks saved. A refused `update-node` /
  `create-node` now puts the topic back to what the treedb actually has.

## 7.7.1

- **fix: marking a field wrong recursed for ever.** `checkValidity()` FIRES
  the `invalid` event, and the new one-place marker was what that event's
  handler calls: each asked the other until the page filled with "too much
  recursion". Reading `validity.valid` asks the same question and fires
  nothing. (The code this replaced was safe by accident — it never asked.)

## 7.7.0

- **fix: pressing Save on a form with a bad field did nothing at all.** The
  branch that refuses the save set `abort_close` and `warning` on the CLICK's
  own kw, which nobody reads — that pair belongs to the close path. The button
  simply looked broken.

  It calls `reportValidity()` now, which fires `invalid` on EVERY bad field
  (so all of them are marked, not just the one last touched) and puts the
  caret and the viewport on the first — on a long form, the difference between
  "it did nothing" and "it is that one, up there".

- **fix: the validation message was the browser's, in the browser's
  language.** `input.validationMessage` gave a Spanish form on an English
  Firefox "Please fill out this field." and no i18n could reach it. The empty
  required field — by far the common case — has its own key now; the rest
  still falls back to the browser, whose wording for a bad pattern or an
  out-of-range number is better than anything generic.

- **fix: two dialogs of the editing flow were untranslatable, and one was a
  duplicate.** `yui_shell_confirm_*` renders its message as an i18n KEY, so
  the English sentences passed in were keys nobody had defined: they render as
  themselves, in every language, and **no locale validator can see a key that
  travels as data**. They are keys now (`all changes will be lost`), and the
  unsaved-changes confirm takes the message the FORM returned instead of
  keeping a second copy of it.

  New keys to define in consumers: `this field is required`,
  `all changes will be lost`.

- **refactor: one place marks a field wrong.** The same three lines lived in
  the `invalid` and `blur` handlers of every field kind
  (`mark_field_validity()`).

## 7.6.1

- **fix: fitting a wide fan produced a hairline.** A schema treedb is one topic
  and a hundred columns, and dagre spreads it far enough that fitting lands at
  about 0.2 zoom — technically the whole graph, and worth nothing. The fit
  stops at a legible zoom and centres instead: you read a part, and the minimap
  such a graph always has says where that part is.

## 7.6.0

- **feat: a graph laid out by us opens WHOLE.** dagre spreads a 126-node
  treedb over some 19000px and the camera stays wherever it was, so "opens
  laid out" still meant eight cards in the top-left corner and no reason to
  think there were 118 more. The view is fitted after an automatic layout —
  and only after an automatic one: a saved arrangement includes where its
  owner was looking.

## 7.5.7

- **fix: the dagre default, and this time the actual cause.** Every node of
  every treedb was answering "I have a saved position" — 126 of 126 — and none
  of them did. `get_node_graph_props()` hands back the record's own
  `_geometry` object when it has one, and a treedb hands back `{}` for a
  record nobody ever moved; the two `kw_get_int(..., KW_CREATE)` on the next
  lines then WRITE the invented cascade coordinates into it. The check was
  reading data the node-creation loop had fabricated a moment earlier.

  Whether a node arrived placed is counted **at creation, before those two
  lines**, and the layout decision reads the counters. Worth keeping in mind
  beyond this fix: after a graph is built, `record._geometry` is not evidence
  of anything a human did.

  (7.5.5 claimed this fix and did not have it; 7.5.6 was the instrumentation
  that found the cause. Neither carries a git tag — 7.5.6 was published from a
  working tree that was never committed on its own.)

## 7.5.5

- **fix (incomplete — see 7.5.7): a majority of placed nodes, not one.** One
  stored coordinate was being read as "somebody arranged this treedb", and the
  first node examined carried `{x: 100, y: 100}` — the first cascade slot. The
  majority test is right and stays; what was still wrong is where the answer
  came from.

  (7.5.3 and 7.5.4 were instrumentation and carry no git tag: they were
  published from working trees that were never committed on their own. Three
  guesses were wrong before the cause came out, which is the lesson already
  written down: pull the real value out before theorising about it.)

## 7.5.2

- **fix: the dagre default still never fired.** "Has anybody arranged this
  treedb?" was answered by the mere PRESENCE of a geometry object — and a
  treedb hands back `_geometry: {}` for a record nobody ever moved. An empty
  object, and an object all the same, so every graph looked arranged and kept
  its cascade. A saved position now has to carry an `x` or a `y`; the same
  tightening applies to a `__graphs__` node entry, which can hold a port size
  and no coordinates at all.

## 7.5.1

- **fix: the dagre default never fired.** The guard asked `priv.layout`
  whether the user had a preference, and **`gobj_write_attr()` writes the
  private field of the same name too** — so the moment `select_layout()`
  resolved the empty preference to `manual` and stored it, `priv.layout` read
  "manual" and the guard bailed every time. A private field is not a record of
  what the HOST asked for; the asked-for value is captured in `mt_create`,
  before anything can overwrite it.

## 7.5.0

- **feat: a treedb nobody has arranged opens laid out, not piled up.**
  `manual` means "leave every node where it was put", and where none was put
  it means a cascade — `get_default_ne_xy()` walks x and y together, so a
  treedb opened for the first time was a diagonal pile of cards (126 of them
  on a real one) and the only way out was knowing to pick a layout by hand.
  `manual` is the right default only once there ARE saved positions to leave
  alone.

  So: no saved geometry and no preference of the user's ⇒ **dagre**. The pick
  is deliberately NOT persisted — it is a default, not a choice, and the
  moment somebody drags one node the geometry exists and `manual` becomes
  right again by itself. Saved positions are read from `__graphs__` and from
  the legacy `_geometry` on the record alike.

  The decision can only be made once the records and `__graphs__` are in, so
  it runs there, and the child tells the toolbar (`EV_LAYOUT_AUTOSET`) —
  whose select was filled before the data arrived and was still claiming
  `manual`.

  **7.5.0 shipped this not working, and it took two more releases to land —
  both worth reading, because both traps are general.**

## 7.4.5

- **fix: the minimap was instantiated, bound, and never painted.** It was added
  once the node count was known — which is AFTER the last draw. The plugin
  builds its canvas on its first render and renders off the graph's draw
  events, so it sat there fully registered with no container in the DOM at
  all, and nothing anywhere said so: the failure was a `.then()` away from any
  console error, since an exception in a promise chain is not a console error
  and not a pageerror.

  The decision moved to BEFORE the draws — the node count is already known
  there, the records having just become nodes — so the minimap rides the two
  draws and the layout that follow. The call is guarded, so a future failure
  says so instead of simply not appearing.

  (7.4.3 and 7.4.4 were steps of this hunt: an explicit `graph.draw()` after
  adding, which fires too early to help, and a round of instrumentation.
  **7.4.4 carries no git tag on purpose** — it was published from a working
  tree that was never committed on its own, and a tag pointing anywhere else
  would claim a source it does not have.)

## 7.4.2

- **fix: the focused legend entry hid its own swatch.** A solid `is-primary`
  fill sat right behind the colour chip, swallowing the one thing the entry
  exists to show. `is-light` marks it just as clearly and leaves the colour
  readable.

## 7.4.1

- **fix: a legend click moved the URL and focused nothing.** It only ANNOUNCED
  the topic. The host mirrors that announcement into the route and remembers
  the segment it just wrote, so the route change it causes comes back deduped
  and nobody ever applied the focus. The action applies it first and announces
  second — the contract the topics view already keeps, where clicking a topic
  shows it and says so.

## 7.4.0

- **feat: a legend that says which colour is which topic — and focuses it.**
  A node's port colour encodes the topic it links to; that is a deliberate,
  functional cue, and nothing on screen said what any colour meant.
  `C_YUI_TREEDB_GRAPH` gets a legend strip (toolbar toggle): one swatch per
  topic, in the colour the graph child assigned it.

  It is a strip and not an overlay because it is opened to be READ against the
  graph, and an overlay would cover the thing it explains. Each entry is a
  button: it focuses that topic, and the focused one clears it. The focus
  travels UP as `EV_TOPIC_SELECTED`, the same way a topic card's graph icon
  travels, so the host turns it into the URL and what you are looking at stays
  linkable.

- **feat: a minimap, from `minimap_min_nodes` (30) nodes on.** A minimap of a
  graph that already fits on screen is decoration; one of two hundred cards is
  the only way to know where you are. So it is not a preference to find and
  set — it appears when there is something to be lost in, and leaves when
  there is not.

  Its shapes are drawn by hand, a block in the topic's colour. G6's minimap
  clones each element's KEY SHAPE, and every node here is an `html` node —
  the same reason the `active` state never painted (7.3.0). At minimap scale
  a card is a rectangle anyway.

## 7.3.0

- **fix: the graph highlight never actually appeared.** `EV_FOCUS_TOPIC` has
  been setting G6's `active` element state since the topic-cards landing, and
  the state is defined as an amber `stroke` + `halo` — properties of a node's
  KEY SHAPE. Every node in this graph is an `html` node, whose key shape is a
  DOM element, so there was nothing for either property to paint on. The topic
  focus centred the viewport and highlighted nothing; the find box inherited
  the same silence.

  The highlight is drawn into the card's own html now (amber border + halo),
  which is where these nodes are drawn at all. Only the cards whose state
  CHANGES are repainted — the ones losing it and the ones gaining it — so the
  graph is not rebuilt per keystroke, and the find box rate-limits its input
  on top of that.

  A theme switch carries the highlight across: it rebuilds every card, and
  rebuilding them without it would silently clear the focus on screen.

- **refactor: one place decides a node's html.** The three treedb tiers
  (hierarchical / extended / child) were chosen inline inside the theme
  refresh; `node_innerHTML_of()` holds that choice now, for the theme refresh
  and the highlight alike.

## 7.2.5

- **fix: the footer STILL lied under a filter.** Subscribing to `dataFiltered`
  (7.2.4) was not enough: Tabulator dispatches that event from inside its own
  `filter()`, which only RETURNS the surviving rows to the pipeline
  afterwards — so `getDataCount("active")` answers the pre-filter set there.
  The event hands the rows it just kept; that is the number the footer takes
  now. Whether the paginator is drawn is derived from the same count, since
  `getPageMax()` is stale in that path for the identical reason.

## 7.2.4

- **fix: the row-count footer lied under a filter.** It read "5 Filas" over
  four visible rows: filtering fires `dataFiltered`, and the footer was hooked
  only to `dataProcessed` and `dataChanged` — and `dataProcessed` fires on
  `setData`, not on a filter. Nobody had noticed while the only filter was the
  global search box; a filter per column turned it into a claim you read on
  every keystroke. (Incomplete — see 7.2.5.)

## 7.2.3

- **fix: the filter placeholder still did not fit.** 7.2.2's `minWidth` of 120
  left "filtrar columna..." cut to "filtrar colum...". It is 150 now, which is
  what the placeholder needs in the LONGEST locale — the measure that decides,
  since the width cannot follow the language.

  The placeholder cannot be shortened per column instead: it comes from the
  shared Tabulator locale, which is exactly what re-renders it on a language
  switch, so a per-column one would freeze in the language it was built in.

## 7.2.2

- **fix: a filtered column now has room for its filter.** The table lays out
  `fitDataFill`, which sizes a column to its DATA, so a `Role` column holding
  "root" came out narrower than the box it had just been given and the
  placeholder read "filtrar c". Columns carrying a text or list filter get a
  `minWidth`; a boolean's tick is not a box and stays as narrow as it wants.

## 7.2.1

- **fix: the graph's match count showed with an empty find box.** Its element
  carried `is-hidden is-flex`, and both Bulma helpers are `!important`, so the
  winner is whichever lands later in the stylesheet — not the one the code
  toggles. The layout is an inline `display:flex` now, which loses to
  `is-hidden` and applies the moment it is removed.

## 7.2.0

- **feat: find a node in the graph.** A treedb graph of a few hundred records
  had no way in but reading every card. `C_YUI_TREEDB_GRAPH` gets a find box:
  it matches the term against the node's label, id and topic, highlights every
  match with the amber `active` state and centres on them.

  It matches the **label** and not only the id, because a topic keyed by
  `rowid` / `uuid` / `qualified` is keyed by a counter or a path while the name
  a human knows is in a secondary key. And it **says how many** it found: a
  graph that did not move looks the same whether nothing matched or the match
  was already on screen.

  The find shares the highlight with the topic focus — one clears the other,
  since two amber sets at once say nothing about either.

  New events: `EV_FIND_NODES` (view and `C_G6_NODES_TREE`) and the graph's
  `EV_FIND_RESULT {term, matches}`.

## 7.1.0

- **feat: a topic table you can actually read.** `C_YUI_TREEDB_TOPIC_WITH_FORM`
  had a single global search box, while the tranger browser next door — the
  read-only one — had per-column filters, a column chooser and a CSV export.
  The richer table was the one that cannot write. Three flags close the gap,
  all default `true`: `with_header_filters`, `with_columns_button`,
  `with_export_button`.

  The filter boxes are **not** put on every column. A hook holds children, a
  dict holds a subtree, a date cell shows a formatted string over an epoch: a
  text match against the raw value there is a box that lies, so those columns
  get none. `boolean` gets a tristate tick, `enum` a list of its own values,
  and `fkey` a box that stringifies the value first — *which rows point at X*
  is what an fkey column is for.

  Search and header filters are separate layers (`clearFilter()` with no
  argument drops only the search), and the CSV carries what the table HOLDS:
  loaded rows, visible columns, both filters applied.

- **fix: searching crosses the FSM.** The search input called
  `tabulator.setFilter` directly from its DOM handler, so the one action a
  reader performs most often was invisible to the `machine` trace. It is
  `EV_SEARCH` now, like every other action in the view.

## 7.0.1

- **docs: say why `unsubscribe_treedb()` has no caller.** It reads like dead
  code and it is not. A topic subscribed once stays subscribed for the life of
  the view, and the whole set goes when the view and its transport are
  destroyed — nothing leaks, so no caller is owed on that account. What the
  function holds is the exact shape the remote subscription was made with (the
  three events, `__service__`, the treedb+topic filter), and a remote
  unsubscribe only lands if it matches the subscribe verbatim.

## 7.0.0

**BREAKING (dependency only — no API moved).** The `maplibre-gl` peer floor
rises from `^6.1.0` to `^6.4.1`. Raise the range in every consumer that
declares maplibre; nothing in this library's own contract changed.

- **chore: maplibre-gl `^6.4.1`.** 6.4.1 fixes `DOM.sanitize` leaving dangerous
  attributes behind when several of them sit next to each other: the function
  iterated a live `NamedNodeMap` while removing from it, so each removal skipped
  the attribute right after it and an `ontoggle` could survive the scrub. A
  floor is what stops a consumer from resolving to a version without that fix,
  so the floor is what moves.

  The one place on this line that mounts a map is the demo `test-app`, whose
  `maplibre_worker_assets` plugin reads the worker out of `node_modules` in
  lockstep with the installed version — it now ships the 6.4.1 worker.

## 6.3.2

- **fix: the schema diagram's arrows point at the parent, not at the child.**
  `C_YUI_TREEDB_SCHEMA` exists to draw a treedb the way its `.c` literal draws
  it in ASCII, and the `.c` puts the arrowhead on the parent's HOOK row: the
  reference is the child's fkey and it points up at the parent — which is what
  the `↖` in the `(↖)` / `[↖]` / `{↖}` marks the same view prints has always
  said. The graph drew it the other way round, hook pointing at fkey, so the
  drawing and the source it claims to mirror disagreed about who references
  whom.

  The edge is still declared parent -> child, because that is what ranks the
  parent first under left-to-right dagre, the order the literal lists them in.
  Only the marker moved: `startArrow` instead of `endArrow`.

## 6.3.1

- **fix: the schema diagram keeps the size it was drawn at.** Selecting
  Diagram in `C_YUI_TREEDB_SCHEMA` drew the graph at its own scale and then, a
  frame later, zoomed it to the container. The reader saw one size and got
  another, and which one they ended up with depended on how many topics the
  treedb had.

  The `fitView()` after `render()` is gone, and `EV_SHOW` now calls `resize()`
  instead of `fitView()`: the canvas still follows the container — G6 draws at
  0×0 while `display:none`, so that part is needed — but the camera does not
  move, so the scale and the user's pan/zoom survive being hidden and shown
  again.

## 6.3.0

- **feat: a topics view can say which backend it browses (`source_url`).**
  `C_YUI_TREEDB_TOPICS` takes an optional url and prints it in its toolbar. The
  tab that hosts the view is labelled with the TREEDB name, and a treedb name is
  not unique across backends: two tabs reading `treedb_yuneta_agent` are two
  different machines, and telling them apart was left to whoever opened them.

  It goes in the toolbar and not in the tab label because a tab wide enough for
  `wss://artgins.yunetacontrol.com:1996` is a tab bar with room for one tab. The
  buttons of the toolbar never shrink now, so the url is what gives way when the
  row runs out of room — cut with an ellipsis, whole in the `title` and the
  `aria-label`. An empty value renders nothing, so every host that does not pass
  it sees the toolbar it had.

## 6.2.1

- **fix: the remembered item is highlighted again.** `C_YUI_NAV` marks the
  active item by EXACT route, and 6.2.0 moved where an item points without
  moving the `active_route` the nav is told about — so with
  `remember_position` on, the child you were inside was never marked. One
  function decides both now.

## 6.2.0

- **feat: `C_YUI_NODE` can remember where you left each child
  (`remember_position`).** A nav item pointed at the canonical route of its
  child, so a strip of children behaved like a row of tabs that forgets: open a
  topic inside one, move to a sibling, come back — and the tab is at its
  landing, with browser Back the only way to what was open. Reported from the
  agent console's Schemas workspace, where the strip really is a row of tabs.

  With the attr on, the item points at the child's route plus the tail last
  active under it. It stays a real position, so clicking is a navigation like
  any other: nothing redirects, nothing argues with the url, and a bare
  navigation to a child records "its home" and the item follows. Off by default
  — a tree whose children are pages wants the item to BE the destination.

  A zone-projected nav is rebuilt from a signature of its items; that signature
  now carries each item's route, because with this attr an id never moves while
  its destination does.

## 6.1.2

- **fix: publishing a node click is OPT-IN (`with_node_click`).** 6.1.1 made
  `C_YUI_TREEDB_SCHEMA` publish `EV_NODE_CLICK` whenever it had no
  `node_route`, which is right for the host that wants it and wrong for
  everyone else: the CHILD subscription model subscribes a host to ALL of a
  child's events, so an event published unasked turns a click into "Event NOT
  DEFINED in state" in hosts that never wanted one. Two of them ship in this
  repo — `C_YUI_TREEDB_TOPICS`, which mounts this view as its schema landing
  and passes a route only when the app gave it one, and the offline demo, whose
  subscriber is the yuno. Both are back to dropping the click; the schema
  editor asks for it and declares the event.

## 6.1.1

What running 6.1.0 against a real yuno found. Nothing consumed it in
between; this is the schema editor as it should have shipped.

- **fix: `autolink` goes with a CREATE and with nothing else.** It
  rewrites a node's links from the fkey fields the record carries, so on
  a PARTIAL update — which is every update this editor makes, since it
  writes only what changed — it finds none and reads that as "no
  parents". Raising a topic's `topic_version` therefore DETACHED that
  topic from its treedb: the version moved, the write answered success,
  and the topic disappeared from the schema. The store had to be
  repaired by hand with `link-nodes`. The rule now lives in
  `schema_write_options.js`, pure and tested, next to why a create goes
  through `update-node` at all (only that path carries `autolink`, and
  without a link a new column belongs to no topic).

- **fix: an unset `blob` column comes back as `{}`, and that is not a
  value.** Read as one, a 4-topic schema exported 1229 lines of empty
  objects — and `'hook': {}` in a literal is a hook the treedb builds
  and nothing writes. `is_empty_value()` answers it once, for the
  export, the desc, the import plan and the row that drew an arrow
  pointing at nothing. The topic record's own `_geometry` is storage
  too, and does not travel; a column NAMED `_geometry` is a real column
  and stays.

- **fix: an empty number field is ABSENT, not zero.** A new column left
  with no `fillspace` stored 0, so the schema default of 10 never
  applied.

- **feat: a name that is not unique carries its id.** A store can hold
  two generations of one schema — the projector never deletes, so a
  treedb re-keyed by a newer SDK keeps its rowid-keyed rows beside the
  qualified ones, both children of the same treedb with the same name.
  Drawn as two identical rows that behave differently that reads as a
  bug; the id is shown, and it is what the url carries, so the row that
  was clicked is the row that opens.

- **feat: `yi-grip-vertical` and `yi-database`.** Both were referenced
  and neither existed, which renders as a solid black square.

## 6.1.0

The schema an operator edits, edited as a schema.

- **feat: `C_YUI_SCHEMA_EDITOR`.** Every schema a yuno holds lives in its
  `treedb_system_schema`, stored as data in three flat topics linked by fkeys —
  `treedbs` → `topics` → `cols`. That is the right storage and the wrong screen:
  adding one column to one topic meant finding it in a table holding every
  column of every topic of every treedb the yuno has, composing the parent fkey
  by hand, and remembering to raise a `topic_version` that nothing asks about.
  The new view puts the schema back together and edits that — treedb → topics →
  columns in declared order, with the qualified id, the fkey, the place among
  the siblings and the versions composed underneath.

  **The versions are the point.** `topic_version` is what publishes a change of
  a topic's columns; leave it and the persisted `topic_cols.json` masks the
  whole edit, the restart succeeds and nothing moved. `schema_version` is what
  publishes the schema as a whole, and raising it is safe because re-projection
  from C compares `c_schema_version`, the version of the literal
  (`c_treedb.c`). Every write carries both.

  Also in the view: **columns reorder by dragging** (`order` is a field, so a
  drop writes only the rows whose place actually changed); the **flags** as
  checkboxes that say what they do, with `hook` and `fkey` turning each other
  off; the treedb **drawn from the records being edited**; **check**, which
  reports what the treedb would refuse before the restart that finds out;
  **export** as the C literal, because an edit made here works and lives
  nowhere the next build knows about; and **import** as a plan shown before it
  runs, since it is the one operation here that can delete a column.

  The logic is pure and tested apart from the view: `schema_model`,
  `schema_validate`, `schema_descs`, `schema_to_c`, `schema_import`,
  `schema_flags` — 118 tests.

- **feat: `C_YUI_TREEDB_SCHEMA` publishes a node click when it has no
  `node_route`.** With a route the click IS a navigation and that view still
  makes it. Without one it used to be dropped; it is published now, because it
  is still an action and it belongs to whoever mounted the view — the schema
  editor draws the same picture inside its own screens, where a topic opens in
  place and no hash is involved. A host that subscribes must declare
  `EV_NODE_CLICK` in its own FSM, as with every event a child publishes.

## 6.0.0

A dependency-only major, like 5.0.0: no API moved and nothing this library
exports changed shape. The peer floor for `@yuneta/gobj-js` goes to
**`^7.13.2`**, because everything below only works with it.

- **feat: a `qualified` pkey is a key the store hands out, and it is not the
  label.** The SDK re-keyed the `topics` and `cols` topics of
  `treedb_system_schema`: they used to carry a rowid, they now carry the
  qualified name — the id of the parent, a dot, and the record's own name
  (`treedb_yunovatioscodb.yunos.yuno_role`). Three places had to learn the
  word, and each was wrong in a different way without it:

  - `treedb_node_label.js` labelled by the secondary key when the pkey was
    `rowid` or `uuid`. A qualified id does name the record, but it names every
    ancestor with it, and a card wants the leaf. The pkey stays as the
    tooltip, as it already did.
  - `C_YUI_FORM` made the pkey writable and **required** on create for
    anything that was not a rowid, so creating a column asked the operator to
    type `treedb.topic.column` by hand. A qualified key is composed by the
    store from the record's fkey and its name: readonly on create, blanked on
    the way out, and hidden as a table column.
  - an existing row of a rowid-keyed topic opens in **create** mode, because a
    rowid pkey has no update — which is why saving a column used to append a
    second one under the same name instead of changing it. A qualified pkey is
    stable, so the row opens for **update** and the edit lands on the node it
    came from.

  Against an SDK that still keys those topics by rowid nothing changes: the
  flag is simply absent and every path above takes its previous branch.

  **It needs gobj-js `>= 7.13.2`**, which is why this is a major. The flag
  becomes a `type` in `treedb_field_types`, a list gobj-js owns; on an older
  runtime the word is missing, `field_desc.type` stays at the plain `string`,
  and the three paths above take a branch that asks the operator to type
  `treedb.topic.column` by hand. It fails quietly, so the floor says it
  instead.

## 5.17.0

- **feat: the schema landing draws the schema, not dots.** `C_YUI_TREEDB_SCHEMA`
  drew one 40px circle per topic with its name underneath — which answered
  neither of the two questions a schema is opened for: what a topic holds, and
  what links to what. It now draws what the `.c` literals draw in ASCII
  (`treedb_schema_*.c`, `treedb_system_schema.c`): one CARD per topic listing
  its fields in schema order, and one edge per hook, leaving the row that
  declares the hook and landing on the fkey row of the child it names.

  The marks are the notation of those literals, so the drawing and the source
  read the same: `{}` dict hook, `[]` list hook, `()` single child, `(↖)` /
  `[↖]` / `{↖}` fkeys, `*` required, `#` the pkey. `dict` and `object` are one
  shape and `list` and `array` are another, exactly as tr_treedb's hook/fkey
  switches treat them.

  The edge endpoints are read from the declarations, not guessed:
  `'hook': {'yunos': 'realm_id'}` names both ends, and the backend fills the
  reciprocal `fkey` mapping at treedb_open, so a schema whose parent declares no
  hook still draws its edge. A self-referent hook (a tree) draws as a loop
  instead of being dropped.

  Nothing is asked of the backend: it is still built from `descs` alone, no data
  and no round trip. A theme switch repaints the cards in place — they are HTML,
  so their colours live in their markup — keeping the user's zoom, pan and any
  dragged node.

  Why it matters: the node graph next door (`C_G6_NODES_TREE`) draws RECORDS, so
  on `treedb_system_schema` — whose records ARE schemas — it draws one box per
  column, hundreds of them, each labelled by a pkey that is a rowid. That is a
  correct picture of the storage and an unreadable picture of the schema. This
  view answers the schema question; that one answers the data question.

- **feat: the node graph labels a record by its NAME, not by its rowid.**
  `C_G6_NODES_TREE` drew every card with `record.id`. A topic whose id column
  is flagged `rowid` or `uuid` keys its records by a value nobody reads — that
  is the point of those flags — and the name lives in the secondary key the
  topic declares. On `treedb_system_schema` that meant a graph of cards reading
  "181", "225", "193".

  The new `node_label()` (`treedb_node_label.js`, pure and unit-tested) reads
  the pkey column's flags from the desc and, when the key is synthetic, takes
  the first `pkey2s` field that the record actually carries. The pkey is never
  lost: it stays as the card's tooltip, on both the chip and the entity card.

  Declarative, not guessed — but it needs the descriptor to CARRY `pkey2s`,
  which `tranger2_topic_desc()` did not clone at **SDK 7.13.0** or earlier. Against an
  older node the desc has no `pkey2s` and the label falls back to the id, which
  is exactly the previous behaviour.

- **test-app: a third entry point, `schema.html`**, mounting
  `C_YUI_TREEDB_SCHEMA` alone against the real yuneta agent schema
  (`src/schema_yuneta_agent.json`, extracted from
  `treedb_schema_yuneta_agent.c` with the fkey mappings the backend derives).
  It exists so the rendered graph can be held against the reference ASCII
  drawing in that `.c` — offline, no backend, both themes.

## 5.16.0

- **feat: `readonly` on the treedb GRAPH.** `C_YUI_TREEDB_GRAPH` takes the same
  `readonly` attr the topics editor got in 5.15.0, and it is the other half of
  the same fact: only the **master** of a treedb's tranger can write, and every
  write against a replica comes back as an error toast.

  In the graph the whole write surface hangs off ONE mode: `edition` is the only
  operation mode that draws the create / delete / link affordances. So
  `readonly` drops it from the mode select, and — because the mode is a
  PERSISTED user preference — a graph left in edition on a master comes back in
  `reading` on a replica instead of opening with buttons that cannot work.

  The five write events (`EV_CREATE_NODE`, `EV_UPDATE_NODE`, `EV_DELETE_NODE`,
  `EV_LINK_NODES`, `EV_UNLINK_NODES`) are refused too, with a `log_error` naming
  the treedb. That gate is not redundant with the missing button: the G6 child
  raises the same events from its undo/redo history and from saving the node
  GEOMETRY, neither of which goes through the toolbar.

- **feat: the graph reports its writes with `EV_RECORD_WRITTEN`**, the event
  `C_YUI_TREEDB_TOPICS` has published since 5.14.0, now raised by
  `C_YUI_TREEDB_GRAPH` as well when the yuno accepts a `create-node`,
  `update-node`, `delete-node`, `link-nodes` or `unlink-nodes`.

  A host that edits a SCHEMA is not finished when the record is written — the
  yuno still has to be restarted to re-read it — and it cannot learn this from
  the treedb's own `EV_TREEDB_NODE_*` events, which arrive for every writer and
  would have it answering its own writes in a loop. Without this, a schema
  changed in the graph left the host showing no pending work at all.

  The kw gains a `command` field in **both** gclasses (additive): in a graph a
  LINK is as much a write as a record is, and `{topic_name, record, created}`
  cannot describe one.

  One topic is deliberately **not** reported: `__graphs__`, which the graph
  writes itself — one record per topic — every time the layout is saved. That
  is the view's own bookkeeping, and reporting it would tell a schema editor
  that the schema changed because somebody dragged a node.

- **fix: an updated node the table never loaded threw an unhandled rejection.**
  `C_YUI_TREEDB_TOPIC_WITH_FORM` fed every `EV_LOAD_NODE_UPDATED` straight to
  Tabulator's `updateData()`, which REJECTS on a row it cannot find — and
  nobody awaits it, so it surfaced as a bare *"Update Error - Unable to find
  row"* naming neither the gclass nor the topic. It asks for the row first now,
  the way the delete path already did: a table nobody has opened holds no rows
  and the event is not news (its rows are read when the topic is shown), while
  a row missing from a LOADED table is logged.

  It took a second view writing to the same treedb to surface: a topic editor
  alone only ever hears about the records it just wrote itself.

## 5.15.0

- **feat: `readonly` on the treedb editor.** `C_YUI_TREEDB_TOPICS` (and the
  per-topic `C_YUI_TREEDB_TOPIC_WITH_FORM`) take a `readonly` attr, propagated
  to every topic: no edition mode, no *new* / *delete* / *paste*, no in-row edit
  icons, and the record form opens with its cells not editable and only `copy`
  on the toolbar. The form still opens — looking at a record is the point of a
  replica.

  It exists because only the **master** of a treedb's tranger can write, and
  the yuno refuses otherwise (SDK 7.13.0, `treedb-info` answers whether it is).
  Until now the editor offered every write affordance on a replica and turned
  each click into an error toast — and before the yuno refused, into a row that
  looked saved and was already lost.

  Two things this is careful about:

  - the decision is one pure, tested function (`treedb_write_plan.js`, 9 tests)
    instead of five `!readonly && with_x` expressions scattered through a DOM
    builder — which is five places to forget the sixth. It also replaces the
    `// TODO set according the authz` that had the write buttons hardcoded to
    `true`;
  - and the write **events** are refused too, in both gclasses, with a
    `log_error` naming the treedb. Hiding a button is not refusing a write: the
    event can still arrive from a keyboard path or a form that outlived the
    flag, and silently ignoring it is the behaviour this change exists to stop.

## 5.14.2

- **fix: four registration guards that could never fire.** They were written
  against a contract the runtime did not keep — `gclass_find_by_name()` answers
  `undefined`, not `null`, for a name it does not hold (fixed at its own layer in
  gobj-js 7.12.0) — so `=== null` was always false and `!== null` always true:

  | Site | Was | Meant to |
  |---|---|---|
  | `c_yui_treedb_topics.js` (schema landing) | `=== null` | refuse to build the graph and say *"C_YUI_TREEDB_SCHEMA not registered by the app"* |
  | `c_yui_treedb_topics.js` (raw JSON) | `=== null` | same, for `C_YUI_JSON` |
  | `c_yui_treedb_graph.js` (raw JSON) | `=== null` | same |
  | `shell_route_map.js` (site map) | `!== null` | **use** `C_YUI_WINDOW` only when the app registered it |

  The first three left a missing gclass to surface one frame later as *"can't
  access property jn_attrs, e is null"* — thrown by the code using the gobj
  `gobj_create` had refused to build, an error naming neither the gclass nor the
  app that forgot to register it. The fourth is the dangerous one: it took the
  *preferred* branch and tried to build a floating window out of a gclass that
  was not there, where the fallback overlay was sitting right below.

  All four are truthiness tests now, which read correctly against **any**
  gobj-js: this release does not raise the peer floor, and does not need
  7.12.0 to be right.

## 5.14.1

- **fix: `C_YUI_TREEDB_TOPIC_WITH_FORM` knows the `rowid` type.** A topic keyed
  by rowid — which is how the `__system__` treedb stores a schema since SDK
  7.13.0 (`topics` and `cols` carry the `rowid` flag on `id`, the name living in
  the `value` pkey2) — logged
  *"transform\_\_treedb\_value\_2\_table\_value() unhandled type 'rowid'"*
  once per cell, on every render of exactly the two topics a schema editor
  exists to edit. The value passed through and the form worked; it was noise,
  and noise that hid whatever real error came after it.

  The column also reads like the number it is now: right-aligned and sorted
  numerically, because sorted as text `"9"` lands after `"69"`.

  The same switch still has no case for `uuid`, `password` and other scalar
  types nobody has met yet. They are deliberately left out: each needs its own
  decision (a password must NOT be rendered as it comes), and inventing them
  blind is how a hash ends up in a table cell.

## 5.14.0

- **feat: `C_YUI_TREEDB_TOPICS` publishes `EV_RECORD_WRITTEN`.** The view
  refreshes itself from the treedb's own `EV_TREEDB_NODE_*`, which arrive for
  every writer. That says nothing a host can act on: a schema editor, where
  changing a column also has to raise the versions that publish the change,
  cannot use them without answering its own writes in a loop. The new event
  says the one thing those cannot — THIS view has just written THIS record, and
  it succeeded — carrying `{treedb_name, topic_name, record, created}`.

  (Backfilled: 5.14.0 shipped without this entry.)

## 5.13.0

- **feat: `C_YUI_TREEDB_TOPIC_WITH_FORM` opens a cell's JSON.** Clicking a cell
  of a col that holds a JSON document — `dict`, `list`, `object`, `array`,
  `blob`, `template`, `coordinates`, `gbuffer` — shows the whole value in the
  standardized adaptive dialog, rendered by a hosted `C_YUI_JSON`.

  The cell has only ever shown the first 20 characters of `JSON.stringify()`,
  which for the fields that carry the actual configuration of a node is a
  preview of the opening brace. The value was reachable only by opening the
  edit form, which needs edition mode and offers a raw text editor for
  something you just wanted to read. The viewer is read-only, collapsed and
  searchable, issues no command, and touches no backend: the record is already
  in the table.

  The click crosses the machine (`EV_SHOW_CELL_JSON {row_id, col_id}`), like
  every other action of this view; the kw carries the IDENTITY of the cell and
  never the value, so the trace stays readable. A cell whose document is empty
  gets no link and ignores the click.

  The preview is now built as a DOM node (`JSON_CELL` / `JSON_CELL_ICON` /
  `JSON_CELL_PREVIEW`) instead of a bare string: record data is no longer
  parsed as markup on its way into the cell. The link title carries the
  `show json` i18n key.

## 5.12.0

- **feat: `C_YUI_TREEDB_TOPIC_WITH_FORM` shows the topic's schema.** A new
  toolbar button (`with_schema_button`, on by default) opens the topic's
  `desc` — pkey, cols, types, flags and fkey targets — in the standardized
  adaptive dialog, rendered by a hosted `C_YUI_JSON`.

  The table shows the data; this shows the contract the data answers to, which
  is what you need when a value is refused, a link does not appear, or a
  column is read-only for a reason nobody remembers. It was reachable before
  only by reading the backend's schema by hand.

  A viewer and not a `<pre>` dump: a forty-column topic is legible collapsed
  and searchable, and it is exactly what the JSON viewer already does. The
  desc is already in the gobj, so the dialog issues no command and touches no
  backend. The click crosses the machine (`EV_SHOW_SCHEMA`), like every other
  action of this view.

  `register_c_yui_treedb_topic_with_form()` now auto-registers `C_YUI_JSON`
  when the app has not, the same courtesy it already did for `C_YUI_FORM`, and
  `register_c_yui_json()` became idempotent so an app that registers it
  explicitly — in whatever order — no longer trips *"GClass ALREADY created"*.

## 5.11.1

- **fix: `yui_shell_confirm_danger()` is exported from the package root.** Its
  three siblings — `confirm_ok`, `confirm_yesno`, `confirm_yesnocancel` — were
  all in the barrel, and the destructive one was not. So the dialog this
  library's own comment tells you to use for *"this deletes an account"*, the
  one with the red button and the safe answer last, was the single one that
  `import { … } from "@yuneta/gobj-ui"` resolved to `undefined`.

  A missing export fails at the call, not at the import, so it reads as a bug
  in the caller. The only consumer had reached for the deep import
  (`@yuneta/gobj-ui/src/shell_modals.js`) and moved on, which is exactly how an
  omission like this survives: the workaround works, and it works quietly.

  Deep imports keep working — the `./src/*` exports map is unchanged — so this
  breaks nothing and only widens what the barrel offers.

  Found while writing the gobj-ui API reference for doc.yuneta.io.

## 5.11.0

- **feat: `yui_install.js` — offer the PWA install, on the app's schedule.**
  Chrome shows its own install banner on a heuristic nobody can read, and once
  the mini-infobar has been dismissed — or the app installed and removed — it
  goes quiet on that origin for about three months. The app then LOOKS
  uninstallable when it is only unadvertised, and the way in is buried in the
  browser menu.

  So the banner is refused and the event kept: `yui_install_ask_once()` asks
  with the family's own dialog, once per browser, and `yui_install_prompt()`
  opens the real system dialog from a button whenever the app likes.
  `yui_install_can()` is false on a browser that never offered (Firefox,
  Safari), so nothing is promised that cannot be delivered.

  **The event arrives before the bundle is parsed**, and one nobody caught
  cannot be asked for back, so the catching belongs in a tiny script the app
  serves from `public/install-prompt.js` and loads with `<script src>` — never
  inline, which every SPA's `script-src 'self'` would drop without a word.

  Ported from yunomúsica, which had it first.

## 5.10.0

- **feat: `yui_button_mark_done()` / `yui_button_unmark()`** — show a button as
  done (check glyph + a caller-supplied label) and put it back. The copy
  helpers give no sign of their own, and a clipboard that works silently reads
  exactly like one that failed.

  The TIMING deliberately stays out of the library: the view arms its own
  `C_TIMER` and calls `yui_button_unmark()` from the timeout action, so going
  back is an FSM transition that shows in the machine trace instead of a
  `setTimeout` nobody can see. gobj-ui owns the look, the view owns the when.

## 5.9.0

- **feat: shared clipboard helpers, so any table can hand over its rows.**
  `yui_clipboard.js` adds `yui_copy_text()`, `yui_copy_json()`,
  `yui_table_rows()` and `yui_copy_table_json()`. A table that wires the last
  one copies **what the user is looking at**: the selected rows when there is
  a selection, otherwise every row the current filters leave on screen, in the
  order shown.

  Four views had each grown their own copy code and it had drifted: two of
  them wrote unindented JSON, and two reported nothing at all when the write
  failed. The shared helpers indent four spaces — the width the rest of the
  family uses to show structure — and log on every failing path.

  They also handle what a bare `navigator.clipboard.writeText()` does not: the
  API is absent in an insecure context (plain http, some embedded webviews)
  and REJECTS when the document has lost focus, which is easy to trigger from
  the very click asking for the copy. A hidden-textarea copy covers both
  instead of failing silently.

## 5.8.2

- **fix(shell): a toolbar dropdown no longer opens off-screen.** The panel
  was anchored to one edge of its trigger — `right` for a `navbar-end`
  item, `left` otherwise — and only the anchored edge was guarded against
  the viewport. A right-aligned panel whose trigger sits near the LEFT of
  the bar therefore hung off the left side, which is what *every*
  `navbar-end` trigger does under `dir="rtl"`: in Arabic the language menu
  opened at `left:-60px` with its first characters unreachable. The panel
  is now measured once it is in the DOM and clamped inside the viewport on
  both edges. Positions in LTR are unchanged.

## 5.8.1

- **fix(treedb table): the search stretches on mobile, and its placeholder
  finally speaks the user's language.** The toolbar already put the record
  actions left and the tools (search + refresh) right, wrapping to a second
  row on a phone -- but that second row kept its natural width, so the search,
  the most used control of the two, stayed the narrowest thing on screen with
  dead space beside it. The tools group now takes the full row and the search
  takes what the refresh does not.

  The width moves from an inline `style` to a rule, because an inline
  `max-width` wins over any class and no media query could have widened it.

  The placeholder was the literal `'search...'`: a placeholder is not a text
  node, so `refresh_language()` could never reach it and it stayed English in
  every language. It now carries `data-i18n-placeholder`.

  New logical class names on the blocks -- `TREEDB_TABLE_TOOLBAR`,
  `TREEDB_TABLE_ACTIONS`, `TREEDB_TABLE_TOOLS`, `TREEDB_TABLE_SEARCH` -- so
  the bar is identifiable in the inspector and stylable without leaning on
  Bulma's utility classes.


## 5.8.0

- **feat(modals): `yui_shell_confirm_danger()` — a destructive confirmation
  whose button is RED.** `yui_shell_confirm_yesno()` puts its yes in `is-link`,
  which is the right colour for *"do you want to continue"* and the wrong one
  for *"this deletes an account"*: the two read the same at a glance, and the
  destructive one is precisely the one that must not be clicked by reflex.

  Defaults to `type: "danger"` (the tinted error icon), and the safe answer is
  the LAST button, so Escape, the backdrop and the X all resolve to it. Returns
  a `Promise<boolean>` that is true only if the red button was pressed.


## 5.7.0 / 5.7.1 / 5.7.2

- **feat(`C_YUI_FORM`): the bottom toolbar is configurable — `toolbar` attr.**
  A list of button names, in the order you want them: `["save"]` for a dialog
  with one action, `[]` for no toolbar at all, and the default is the five it
  has always shown, so nothing moves for a caller that says nothing.

  It exists because the toolbar was hardcoded. A three-field sign-up dialog
  with a single action still got **save + undo + clear + copy + paste**, and
  the only way out was to stop using this gclass and hand-build the form —
  which is exactly what one consumer had just done.

  Save/undo/clear stay on the left of the bar and copy/paste on the right, the
  split the layout has always drawn, so dropping one whole group leaves no hole
  in the middle. An unknown name is **reported and not silently dropped**: a
  typo in the list would otherwise remove the save button with no trace of why.

  The choice lives in `form_toolbar_plan.js` as a pure function, tested apart
  from the DOM (`plan_toolbar`).

  **A toolbar with a single group is centred** (5.7.2). With `space-between` and one
  group the button sits against a border with the whole gap on the other side.
  The choice is made here and not in the caller's CSS because the class that
  spreads them is a Bulma helper, and those carry `!important`: an app rule
  cannot win against it.

  `set_changed_stated()` no longer assumes save and undo are both there
  (5.7.1). They
  were looked up and used without a guard, so the first change typed into a
  form that had dropped one died with *"can't access property setAttribute, a
  is null"* — found by the consumer's own QA the moment the attr was used.


## 5.6.0

- **feat(`C_YUI_SHELL`): a toolbar item can carry a badge.** `badge` on the item
  seeds the first paint and
  **`yui_shell_set_toolbar_item_badge(shell, item_id, value)`** moves it — which
  is the interface that matters, because a count is a runtime fact. An icon-only
  toolbar button is a link; the badge is what makes it a signal, and an alarm
  bell without a number cannot say whether anything needs you.

  `0` / `""` / `null` / `false` clear it (a badge reading "0" draws the eye to
  say nothing); over 99 renders `99+` (the toolbar is a fixed-width row and a
  four-digit pill pushes its neighbours off a phone screen); a string passes
  through for states that are not counts. An unknown item id is a silent no-op,
  and re-writing the same value touches no DOM — the badge is a `role="status"`
  live region and would otherwise be announced again on every tick. It is
  `role="status"` rather than `aria-hidden` because the button has an explicit
  `aria-label`, which REPLACES its content for a screen reader: a badge inside
  it would be silent.

  Anchored to the icon, not to the button — with its label on, the button is
  wide and a badge in its corner would float away from the glyph it counts.

- **docs(`C_YUI_NAV`): stop advertising a `badge` that never existed.** The item
  contract had listed it for a long time and NOTHING rendered it anywhere in the
  library, so it read as an available feature. The toolbar has one now; a menu
  item still does not.


## 5.5.0

- **feat: `C_YUI_SERVICE_VIEW` + `yui_mount_service_view()` — mounting a view
  that talks to a backend.** A view asks for data with
  `gobj_command(remote, …, src = itself)`, and `C_IEVENT_CLI` routes the answer
  back with `gobj_find_service(gobj_name(src))` — which only finds REGISTERED
  services. Neither host creates one (`C_YUI_SHELL` uses `gobj_create()`,
  `C_YUI_NODE` `gobj_create_pure_child()`), so such a view never received a
  single answer: it sat empty while the ievent logged "service not found" once
  per answer. The second half of the same problem: a route's `target.kw` is
  static JSON and cannot carry the live transport pointer.

  Both halves had been written **four separate times in three repos**
  (`c_treedb_view.js`, `c_wz_treedb.js`, `c_yv_treedb.js`,
  `c_yv_service_view.js`), each header explaining the same thing. Two shapes,
  because the callers are not alike: `yui_mount_service_view(host, spec)` for a
  wrapper that keeps its own extras on top (bridging url segments into the
  hosted view, rebinding it when a connection drops — app/route logic that does
  not belong in the library), and the `C_YUI_SERVICE_VIEW` gclass for a route
  with no extras at all.

  Deliberately NOT done: making the hosts create services. That would make every
  routed view an inter-yuno endpoint by default — against the framework's own
  rule that only named services are — and a name collision does not fail loudly:
  gobj-js logs "service ALREADY REGISTERED. Will be UPDATED" and REBINDS, so two
  mounts of one route would silently cross their answers. Opt-in per route
  instead.

- **fix(`C_YUI_NODE`): the tree's chrome strips render in the app's language.**
  A node renders its strips WHEN YOU WALK INTO IT — long after the app's
  one-shot `refresh_language()` over the shell tree — and its zone navs are
  appended into shell zones, outside the node's own `$container`. Neither pass
  reached them, so every strip showed its raw i18n key: `treedb`,
  `central database`, `data` in lower-case English next to a fully translated
  menu. That is indistinguishable from a MISSING key, so it reads as an
  untranslated app rather than as an unapplied translation, and it sent more
  than one person looking for the wrong bug. The strips already carried their
  keys (`C_YUI_NAV` tags every label); nobody applied the translator to them.

- **feat(`C_YUI_SHELL`): `yui_shell_translate(shell, $el)`.** Applies the
  registered translator to a freshly built subtree. The rule it names: DOM the
  LIBRARY builds after start up goes through here; APP view gclasses translate
  their own DOM (they own a `t`). The shell already did this ad hoc in three
  places (the mounted section index, the toolbar dropdown panel, an
  `EV_SET_ITEMS` rebuild) — those now call the helper, and `C_YUI_NODE` uses it
  for its strips and its empty-node notice. No-op without a registered
  translator, so nothing changes for an app that never calls
  `yui_shell_set_translator`.


## 5.4.0

- **feat(`C_YUI_NODE`): `nav_mode` — the three ways of showing the way in, as
  one knob.** A tree can now be asked for stacked strips (`"stack"`, the
  default and what it declares), a single `← parent` (`"back"`), or the trail
  as one breadcrumb line (`"path"`), at runtime:
  `yui_node_set_nav_mode(root, "path")`, or `"nav_mode"` in the root's
  declaration. `yui_node_nav_mode(node)` reads it.

  The shapes were all expressible before — `back` is `chrome_depth: 1` plus a
  `backbar` chrome on every branch, `path` is `projection.path` on the root
  plus `chrome_depth: 0` — but only by **rewriting the declarations**, and
  only the app knew which rewrite meant which shape. Two consequences made
  that the wrong place: `back` is not a root-level edit (projections do not
  inherit, so every branch had to be rewritten), and going back was lossy —
  restoring "stacked" meant re-imposing a canonical shape, so a branch that
  declared `vertical` chrome came back as tabs.

  So a mode is a **filter applied when the renders are asked for**, never a
  rewrite: `"stack"` is an exact restore by construction, per branch,
  including layouts the modes never mention. The `index` projection is
  untouched by every mode — how a node shows its children when it IS the page
  is not a statement about depth. The knob is **root-only** (a tree stacking
  strips at one level and drawing a breadcrumb at another would say the same
  thing twice, in two languages); on a middle node the call is refused with a
  log, not silently ignored. Modes are per tree, so an app can run `/admin` as
  a breadcrumb and `/alarms` as a backbar.

  `test-app`'s node lab cycles the three on the live tree (it cycled two
  before, by rewriting projections).

- **docs(`C_YUI_NODE`): chrome belongs to the node that declares it, so every
  branch declares its own.** The library was already right — a node's backbar
  is built with `back_route = my_route` — but nothing said the rule, and the
  README's own example showed the shape that breaks it: the pair
  `tabs@>=tablet` + `backbar@<tablet` on the root, and a child with only an
  `index`. Copied as-is (yunovatios' `/admin` did), a subtree ends up with a
  single ← that belongs to the root and reads "← root" at every depth, instead
  of one ← per level going up one level. The rule is now a bullet in the
  README, the example declares the chrome on its child too, and SHELL.md's
  layout table has a `backbar` row that names it. `test-app`'s `/cards` was
  already the correct demonstration.


## 5.3.3

- **fix(`C_YUI_NODE`): a `link` node's viewer was given a box sized by its own
  content, not by the body.** `.NODE_CONTENT` is `flex: 0 0 auto` — right for
  a plain `content`, which is a header above the index projection and keeps
  its natural height, and wrong for a `link`, whose viewer IS the page. Sized
  by content it overflows its host instead of shrinking, which breaks the
  whole promise of a link: *a viewer cannot tell whether the shell mounted it
  at a declared route or a node did*. It could tell — the shell's stage bounds
  the height and the node did not.

  What made it more than a cosmetic overflow is what a viewer does with that
  box. `C_G6_NODES_TREE` MEASURES its own container to size its canvas, and
  documents the invariant it relies on: *"setSize does not change the observed
  box, so there is no feedback loop"*. That is true exactly while somebody
  bounds the height — under a link, nobody did, so the canvas grew the box it
  had just measured, the `ResizeObserver` saw the change and measured again,
  larger. The graph rendered slowly and appeared to expand without end, with
  the content pushed into a corner of a canvas hundreds of pixels taller than
  the viewport.

  A link's slot now carries `NODE_CONTENT_LINK` (`flex: 1 1 auto;
  min-height: 0`), the same box the stage gives a shell-mounted view. Verified
  in a real browser rather than in jsdom, which has no layout: before, the
  canvas was 1058px tall inside a 762px body and every ancestor's `scrollHeight`
  exceeded its box; after, the canvas is 714px and `box === scroll` at every
  level.


## 5.3.2

- **fix: `keep_on_navigate` never reached the overlay stack.**
  `push_overlay_history()` was given the option and dropped it on the floor,
  so the entry never carried the flag and `drain_overlays()` closed every
  panel anyway. The site map still closed on the first row click in an app
  with no window manager — 5.3.1 fixed a different bug on the same line and
  left this one standing.
  It shipped twice unrun for one reason worth writing down: the only app that
  opens the site map has a **window manager**, and a dock-managed window
  registers no overlay at all. The feature was verified in the one
  configuration where it is not used. `_qa_routing` now drives the shell
  contract directly — a panel and a plain overlay, one navigation, one closed
  and one not.


## 5.3.1

- **fix: the site map closed on navigation in any app without a window
  manager, and logged an error on every open.** `gobj_find_service()` answers
  **undefined** for an absent service, not null. Handing that to a
  DTP_POINTER attr fails the whole kw — so `manager: undefined` did not just
  print "attr undefined: manager", it took `keep_on_navigate` down with it:
  the window registered as a plain transient overlay and the resting-route
  drain closed it on the first row click. One cause, both symptoms.
  `yui_dev.js` already documented this exact trap and guarded with `|| null`;
  the site map does the same now.
- **fix(dev window): a monitor is watched WHILE navigating.** The developer
  window closed on every route change, which made it useless for the one job
  it has. It declares `keep_on_navigate` now — the behaviour a dock-managed
  window already had, for apps with no dock.


## 5.3.0

- **feat(shell): `remember_section_position` — a menu click returns to where
  you were in that section.** Walking four levels into a section and then
  visiting another one lost the position: coming back landed on the section
  root, because that is what its menu item points at. Opt-in
  (`shell.remember_section_position`, default off — five apps ship on the
  current behaviour). The restore is a PUSH: the user chose to go there, only
  which spot inside was decided for them, so Back undoes it. The memory
  MIRRORS the url and never commands it (ROUTING §3): page-lifetime, not
  localStorage; the section root counts as a position, so deliberately resting
  there is what you come back to; a remembered route that no longer resolves is
  dropped; and only a MENU CLICK consults it — typed urls, deep links,
  Back/Forward and `yui_shell_navigate` are untouched — and only a click that
  ENTERS the section from OUTSIDE it. From inside, the click means the route it
  names: the mobile backbar of a `submenu.index` section ("← Section index")
  was being sent straight back to the leaf it was leaving, so the control
  looked dead.
- **demo(test-app): a chapter's lead becomes an ⓘ button on mobile.** Three or
  four lines of explanation cost nothing on a desktop and cost the fold on a
  phone — the reader scrolled past the explanation to reach what it explains.
  Prose from tablet up, a button below it, opening the standard adaptive dialog.
  The button carries the i18n KEY so the dialog translates at open time, and the
  click is delegated ONCE by the app's root service instead of giving a dozen
  wrappers an event, an action and a state apiece for the same affordance.
- **feat(`C_YUI_NODE`): `yui_node_set_chrome_depth()`.** `chrome_depth` was
  declarable but not reachable at runtime, which broke the rule the tree is
  built on — whatever the config can say, the API must be able to change. With
  `yui_node_set_projection` it is what lets an app offer "stacked tabs or
  breadcrumb" as a live choice, and it is TWO calls on ONE node: `path` draws
  from the tree root whoever declares it, and `chrome_depth: 0` there caps the
  strips of the whole subtree. Re-renders through the shell (a replace to the
  current route) because the depth is resolved along the active PATH —
  repainting only from the changed node would leave the ancestors' strips
  behind.
- **feat: `projection.path` — a breadcrumb, the second way to show depth.**
  Every ancestor painting its own chrome stacks one strip per level: fine at
  three, a wall at five, and a branch that caps the stacking (`chrome_depth`)
  then has nothing left saying where the user is — the URL knows, the screen
  does not. A node can now declare `projection.path` (`{"layout":
  "breadcrumb"}`) and get the trail as one line instead. It is a THIRD
  projection mode, not another layout, because of what it projects: `index`
  and `chrome` show a node's CHILDREN, `path` shows the way in — drawn from
  the tree ROOT down to the tip whichever node declares it, since a trail that
  starts halfway answers half the question. Each crumb is a live link to that
  level, with the tip marked, and `C_YUI_NAV` grew a `breadcrumb` layout
  (Bulma's markup, the same item/click/i18n contract as every other layout) so
  the node reuses the one renderer like it does for cards and tabs. The two
  modes sit side by side in the test-app: `/cards/energy/north` stacks strips,
  `/cards/energy/south` shows a breadcrumb, same tree and same URLs.

- **feat(shell): the site map can hide its reference rows, and never hides a
  navigation surface.** With one subtree per route, the second and third place
  a route is reachable from render as references carrying no structure. A
  `show references` toggle sits next to the filter (remembered for the page
  session) for reading the bare structure. It is **on by default**: a drawer
  entry and a toolbar shortcut are one line each, and they are exactly what
  someone auditing the navigation came for — what was ever noisy is the
  repeated SUBTREE, and that is gone for good rather than switched off. Two
  rules keep it honest: a reference stays hidden inside a matched subtree (an
  ancestor match must not smuggle it back), and hiding never EMPTIES a menu —
  a drawer whose entries all repeat the primary nav keeps its rows, or the map
  would quietly lie about what the app has. While a search is running a
  matching group heading still shows: a query that finds a name must not come
  back empty.
- **feat(`C_YUI_JSON`): depth guides, like the site map's.** Four characters
  of indentation carry the structure but stop being followable past level two
  without a line to follow. The viewer's rows are SIBLINGS with growing
  padding, not nested boxes, so there is no element to hang a `border-left`
  on: the guides are a repeating gradient bounded per row by
  `background-size`, one line per ancestor level, in a `--json-guide` variable
  shaded for both themes. The hover rule had to move from the `background`
  shorthand to `background-color` — the shorthand resets `background-image`,
  which would have wiped the guides on the one row the reader is pointing at.
  Demoed at `/jsontree` in the test-app: the component had no demo anywhere,
  which is a poor place to leave something whose whole job is to be read.
- **fix(shell): the site map's indentation guides were nearly invisible.**
  `1px dotted` in the weak border colour disappeared against the panel, which
  is a problem now that the map is four and five levels deep: at that depth
  the eye follows the guide, not the offset. Solid, in the stronger border
  shade — still chrome, but followable. Both are Bulma vars, so it re-shades
  itself in the dark theme instead of turning into a black hairline.
- **Indentation is four spaces, everywhere structure is shown as
  indentation.** The site map's tree and `C_YUI_JSON` indented in `rem` and
  dumped JSON with two; the raw view behind the same viewer disagreed with the
  tree in front of it. Now `JSON.stringify(v, null, 4)` throughout (viewer,
  dev panel, demos) and rendered trees indent in **`ch`** — four characters of
  the row's own monospace font, so the guides stay lined up with the text they
  belong to at any zoom. Written down in the README's conventions.

- **fix(shell): the site map leads with the STRUCTURE.** The toolbar group
  rendered before the nav, which put a shortcut ("Go to Cards", an
  account-menu entry) above the section it points at. Once each subtree is
  drawn once, that shortcut is a reference — so the FIRST `/cards` a reader
  met had no tree under it and the real one was thirty rows down. It also made
  the reference's own "shown above" a lie, since the owner was below it.
  Order is now nav → toolbar → other routes.
- **fix(shell): the site map drew a route's whole subtree once per surface.**
  A route reachable from the primary menu, a drawer and the account dropdown
  got three rows — and each repeated its entire branch. Bearable when a section
  had four children; noise once a `C_YUI_NODE` tree hangs there with fourteen,
  three times over. Every surface still shows its row, but only ONE carries the
  children: the first occurrence in the nav, then `other`, then the toolbar —
  the nav is where the structure lives, and hanging the tree off a toolbar
  shortcut would bury it inside the account menu. The rest render as
  references (live links marked "shown above", no branch), and **"you are
  here" never lands on a reference** — it marks the occurrence that owns the
  structure, which is also what stopped it appearing inside the account menu.
- **feat(shell): the site map is a NAVIGATION PANEL — every row click keeps it
  open, and it joins the dock.** Half its rows closed the window and half did
  not: a resting-route change was drained as a transient overlay (§6), while a
  subpath or action jump left it up. The same gesture meant two different
  things depending on which row you hit, and the useful behaviour was the
  accidental one. The map now opts into `C_YUI_WINDOW_MANAGER` when the app
  has one (minimise, restore and focus it like any other window), and declares
  the new `keep_on_navigate` when it does not — a window/overlay flag that
  opts OUT of the resting-route drain because it is a panel, not something
  floating above one view. `yui_shell_register_overlay()` takes the flag in an
  `opts` argument; the drain keeps survivors in their stack order so Escape
  still closes overlays in the order the user built them. Clicking the row you
  are already on no longer closes the panel either. **"You are here" follows
  the URL** while the panel is open (same exact-then-longest-prefix rule as
  the model), instead of pointing at wherever the user was when they opened
  it. Consequence of the dock, and deliberate: a dock-managed window registers
  no back-overlay, so **browser Back navigates instead of closing the map** —
  it is a workspace surface now, closed by the X, the dock or the toggle.

- **feat: `C_YUI_NODE` — a navigable position as a gobj, and navigation as a
  tree of them (PROTOTYPE).** The shell's menu tree is capped at two levels
  (`build_item_index` walks `item` + `item.submenu.items` and stops), which is
  why a section with sub-sections has to flatten its options into one tab
  strip. `C_YUI_NODE` models the other shape: *the gobj tree IS the navigation
  tree*, the URL is the path of node ids below a single declared
  `base_route`, and each node holds **how it wants its children seen**
  (`projection`, a `C_YUI_NAV` render config in two modes — `index` when the
  node is the tip, `chrome` when a child is showing). There is no
  primary/secondary nav any more, only a parent projecting its children,
  recursively, at any depth. A node may carry `content`, `children` or both.
  The declared `children` attr is **not** a privileged path: `mt_create` feeds
  it to the same `EV_ADD_NODE` the runtime API uses, so declarative and
  dynamic are the same code — `yui_node_add` / `yui_node_remove` /
  `yui_node_set_projection` / `yui_node_set_content` reshape a live tree, and
  a node added at 3pm is deep-linkable like one declared at boot. Routing
  stays inside the ROUTING.md contract: clicks publish `EV_NAV_CLICKED` and
  become a URL push, the shell's `EV_ROUTE_CHANGED` walks back down as
  `EV_ACTIVATE`, and the tree contributes its whole shape to the site map
  (`yui_shell_set_sub_routes`). A path segment naming no living child logs and
  rewrites the URL (replace) to the deepest living ancestor — with a dynamic
  tree the ground really can disappear under a bookmark. The shell is
  **untouched**: this rides on one declared route and its `subpath`.
  Demonstrated in the test-app's **Cards** chapter (four levels + a panel that
  mutates the live tree), driven by `_qa_nodetree.mjs` / `_qa_extra.mjs`.
  Two consequences of the model are wired in from the start:
    - **`chrome_depth`** — every ancestor painting its own chrome stacks one
      strip per level, which at depth 4 is three strips. A node declares how
      many its corner of the tree deserves (`0` none, omit = all) and the
      DEEPEST declaration on the path wins, so an intermediate node whose only
      job is to hold that number is a legitimate node.
    - **`link` — where the structural tree ends.** One gobj per structural
      node is right; one gobj per meter reading is not. A node declares a
      `link` ({kind, gclass, kw}) into a data space — a timeranger: millions
      of raw records, series/time, key/value — and mounts the viewer suited
      to that shape. It is then always the tip of the structure: the url
      keeps going, but its tail reaches the viewer as `EV_ROUTE_CHANGED
      {base, subpath}`, the same contract the shell gives a view, so a viewer
      is agnostic about being inside a tree. `link` + `children` (or
      `content`) is a config error. Without this the tree would answer a data
      url by rewriting it away as a dead path.
    - **the tree is a CONTRACT, so there is no reparent API.** A published
      path is a url a client may hold; the shape is versioned
      (`tree_version` + `yui_node_tree_version()`) and a rename migrates
      through `aliases` — the former id still resolves and the URL is
      rewritten (replace) to the canonical spelling, like an HTTP 301.
  `submenu.index` (what wattyzer `/reports` runs today) is untouched and keeps
  its own demo at `/sectionindex`: while the model settles, the two coexist —
  there is no converter and no migration of the five consumers.
- **feat(shell): `config.shell.tree` — the ROOT can be a node, and then the
  shell is only the space.** The menu was the last thing the shell owned that
  the model says belongs to the tree: an app's primary options are just the
  root's children, and `menu.primary.render` (a layout per zone) always was a
  projection without an owner that could hold it. Declared as `shell.tree`, the
  root C_YUI_NODE projects its children into ZONES through the new
  `yui_shell_zone()` — a render config may carry `zone`, and such a projection
  PERSISTS (the rail is standing chrome: built once, then told where the user
  is, never rebuilt per navigation). The shell keeps what it is good at: zones,
  layers, stages, toolbar, overlays, theme, breakpoints. It synthesizes exactly
  one route entry for the tree, flagged `owns_subtree` — the single opt-in case
  where root `/` may match as an ancestor (`route_resolver.js`), so an app can
  have ONE declared route and unbounded depth. That does not lose the
  unknown-route diagnostic, it moves it to the node that knows its children's
  names. Comment keys (`_name_comment`, the established JSON idiom) are
  stripped before the tree block becomes a gobj's kw. Runnable reference:
  `test-app/tree.html` + `_qa_root.mjs`, served beside `index.html` so both
  navigation models can be compared in one browser.
- **fix(nav): a `C_YUI_NAV` created already knowing its active route never
  highlighted it.** `apply_active_route()` ran only from `rebuild()`, so the
  `active_route` passed at creation was ignored; the shell never noticed
  because it always follows creation with an `EV_ROUTE_CHANGED` that
  re-applies it. Any other host — a `C_YUI_NODE` building the chrome for the
  child it is about to show — got an unmarked strip. It is applied at the end
  of `build_ui()` now (and dropped from `rebuild()`, which calls `build_ui`).
- **feat(icons): `yi-bolt` and `yi-droplet`.** Two more mask rules in
  `yui_icons.css`. Energy and water are two of the meter families the AMR
  apps read, and an undefined `yi-*` renders as a solid black square.


## 5.2.1

- **`C_YUI_TREEDB_SCHEMA`: clicking a node threw `ReferenceError:
  gobj_send_event is not defined`.** The module calls it to publish
  `EV_NODE_CLICK`, but never imported it, so the schema-graph landing broke on
  the first click on a topic node — in every consumer, the reference
  `gui_treedb` included. It was the only such omission in the package.

## 5.2.0

- **feat(shell): toolbar dropdown items can mark the ACTIVE option
  (`selected`).** A dropdown that *chooses* something — theme, language — had
  no way to show what is currently chosen: the panel rendered a flat list, so
  the user had to change the value to find out what it already was. Items now
  accept `selected: true`, which adds `is-selected`, `aria-checked="true"`, a
  trailing check, and switches the row's `role` to `menuitemradio`.

  The check element is always rendered and only hidden by CSS, so moving the
  selection never changes a row's width and the list does not jump.

  No new API to keep it in sync: the panel is rebuilt from the live config
  object on **every open**, so an app marks the active option by setting the
  flag on the config it already passed to the shell.

- **feat(shell): dropdown items accept an `image` glyph.** The `yi-*` set is
  CSS masks and therefore strictly **monochrome**, which cannot express a flag
  per language. `image` takes a URL or a `data:` URI and renders as `<img src>`
  — deliberately **not** as markup: an SVG loaded through `<img>` cannot run
  script, so the field stays safe even if a caller later feeds it a value that
  came from a backend. An API that took markup would be one refactor away from
  an XSS. Declaring both `icon` and `image` warns at validation; `image` wins.

- **feat(icons): `yi-check`.** The set only had `yi-square-check` (a boxed
  check), which reads as a checkbox rather than as "this is the one". Needed
  for the selection mark above.

- **feat(icons): `yi-upload`.** The set had `download` but not its pair, so an
  import/upload control had to borrow another glyph (`gui_treedb`'s Settings
  wore the same `yi-plus` on "Add connection" and "Import" — two buttons that
  become indistinguishable once the labels drop on mobile).

## 5.1.0

- **feat(icons): `yi-chevron-down` and `yi-chevron-up`.** The set only had
  `chevron-left` / `chevron-right`, and a `yi-*` class with no mask rule
  renders as a solid black square — so a disclosure control (folded `>` /
  unfolded `v`) had no icon to point at. Added as deliberate mask rules next
  to the other chevrons. First consumer: the fold/unfold chevron of the
  connections table in `gui_treedb`'s Settings.

## 5.0.1

- **fix(tabulator): the cell editor is legible again — it was shrinking and
  dimming on edit.** Two independent causes, both in `src/tabulator.css`:
  Tabulator builds its editor as a bare `<input>`, which inherits no
  typography from the cell, so the browser default (13.33px Arial) took over
  and the value visibly shrank and changed face the moment the cell entered
  edit mode (the theme's `.tabulator-editing {padding: 0}` shifted it
  sideways too). The editor controls — and the header-filter ones — now
  inherit `font-family`/`font-size` and restore the cell's 4px padding,
  filling the cell box. In dark theme the editor painted
  `--bulma-body-color`, the *dimmed* body text (l:71%), over a near-black
  wash; it now uses `--bulma-text-strong` (l:93%) over an elevated
  `--bulma-grey-darker` field with a link-coloured border, so the open field
  stands out from both row parities (l:9% odd / l:14% even). The
  `[data-theme=system]` block carried no editor rules at all — an app on the
  system theme with a dark OS got black-on-dark — and now mirrors the dark
  ones.

- **docs: wattyzer now consumes this line from the npm registry**, not as a
  `file:` dep on the yunetas submodule (`@yuneta/gobj-ui@^5.0.0`). The v2 line
  therefore has two consumption modes: the in-repo yunos (`gui_agent`,
  `gui_treedb`) still resolve the checkout, so library work reaches them
  immediately, while wattyzer only sees it after a publish. Practical
  consequence recorded in `README.md` / `CLAUDE.md`: the **published tarball**
  is on a consumer's critical path now, so `files:` must keep shipping `src/`,
  `index.js` and `vite-plugin-yuneta-html.js` — a change that only works from
  the checkout is a broken release.

## 5.0.0

**BREAKING — a dependency-only major.** No component API moved in this release:
both bullets below are peer-range changes, headlined by `maplibre-gl` going
ESM-only in v6. A consumer already on the 4.0.0 contract only has to raise its
own dependency floors.

- **BREAKING(deps): the remaining peer floors move to the versions this release
  is built and tested against** — `@yuneta/gobj-js` `^7.8.0` → `^7.8.7`,
  `i18next` `^26.0.7` → `^26.3.6`, `tom-select` `^2.6.0` → `^2.6.2`,
  `vanilla-jsoneditor` `^3.12.0` → `^3.13.0`. The floors were trailing what is
  actually in use: the in-repo yunos (`gui_agent`, `gui_treedb`) already sit at
  these versions, and because consumers must `resolve.dedupe` this list, the
  consumer's copy **is** the library's copy — so the declared floor has to name
  the version the suite ran against, not the oldest one that once worked. No
  API surface moved in any of the four. The test-app follows on `playwright`
  `^1.62.0` and `vite` `^8.1.5`.

- **BREAKING(deps): `maplibre-gl` peerDependency bumped to `^6.0.0`.** v6 is
  ESM-only with no default export, so consumers must `import * as maplibregl`.
  `C_YUI_MAP` migrated accordingly; the map API surface it uses (`Map`,
  `NavigationControl`, `GeolocateControl`, `LngLatBounds`, `Popup`, `Marker`,
  single-arg `GeoJSONSource.setData`, awaited `getClusterExpansionZoom`) is
  unchanged. A consumer that bundles the map with Vite 8 must also emit
  maplibre's worker + shared chunk itself and point `setWorkerUrl()` at them —
  Vite/rolldown cannot statically follow v6's dynamic
  `new Worker(new URL(<variable>, import.meta.url))`, and a `.mjs` worker is
  refused by browsers when the static host serves it as
  `application/octet-stream`. The test-app's `vite.config.js`
  (`maplibre_worker_assets`) + `src/main.js` are the reference wiring.

## 4.0.0

**BREAKING — five contract changes in one major.** Read the five `BREAKING`
bullets below before upgrading; the headline is that `yui_shell_navigate()` now
**pushes** history by default. Requires `@yuneta/gobj-js` **>= 7.8.0** (the
site-map filter's placeholder re-translates through its new
`data-i18n-placeholder` support). `C_YUI_TREEDB_SCHEMA` is barrel-exported from
this release (still marked a prototype — its shape may move).

- **feat(treedb-schema): `C_YUI_TREEDB_SCHEMA` is barrel-exported.** The
  schema-graph landing was reachable only by its deep module path, so it was the
  one component absent from `index.js` and from the README. It is public contract
  from this major (documented with its attrs and events), while staying marked a
  **prototype**: it is new, and its shape may still move. Apps that import it by
  deep path — `gui_treedb` does, deliberately, like every other component it
  loads, to keep the barrel's `uplot` import out of its bundle — are unaffected.

- **docs(readme): the public surface that shipped undocumented.** The
  `minimize`-needs-a-manager BREAKING had no README callout (4 of the 5 did);
  `yui_shell_show_modal`'s new `before_close` veto, `setup_frontend_view`, and
  the `attach_clear()` / `refresh_clear()` clear-(✕) norm were documented only in
  this changelog. The npm `description` still advertised the legacy GClass stack
  that `3.0.0` **removed**, and the consumer table listed only wattyzer for v2
  (the in-repo `gui_agent` / `gui_treedb` consume it the same way).

- **fix(shell, nav): private state stops being a public attribute.**
  `C_YUI_SHELL` and `C_YUI_NAV` declared `SDATA(DTP_POINTER, "priv", …)` and
  reached it with `gobj_read_attr(gobj, "priv")` — a category error: attributes
  are the gclass's PUBLIC interface, so the two gclasses were publishing their
  own private state (anyone could `gobj_write_attr(gobj, "priv", …)`, and
  `gobj_read_attrs(gobj, -1)` dumped it). They were the only two gclasses in
  the codebase doing it; every other one uses `gobj.priv`.
  The root cause was a misreading recorded in the code itself — *"Per-instance
  private state (avoid the gclass-level PRIVATE_DATA)"*: `PRIVATE_DATA` is
  **not** shared between instances, `gobj_create` does
  `this.priv = json_deep_copy(gclass.priv)`, exactly like C's `PRIVATE_DATA`
  struct. The state moves back to `PRIVATE_DATA`, the `priv` attr is **gone**
  from both attr tables, and every access is the canonical
  `let priv = gobj.priv;` (44 sites, incl. `shell_modals.js`). The `|| {}`
  fallbacks went with it: `gobj.priv` is always an object.
  **BREAKING** only for code reading `gobj_read_attr(shell, "priv")` — that was
  never a supported interface (a gclass `.h`/module exposes attrs, commands,
  events, local methods and stats; private state is none of those).
- **fix(shell): the `stay` contract could re-fire its own action route — new
  `yui_shell_unpark_route(route)` + restore-then-event on deep-link.** Two
  review findings on the same contract. (1) The reference `stay` wiring (an
  unconditional `history.back()` in the modal's `on_close`) broke when the
  shell's overlay DRAIN closed the modal during a navigation: the URL had
  already moved, so the back() landed on the stranded action entries and
  re-fired the action — the modal reopened and the navigation was hijacked.
  `yui_shell_unpark_route(route)` (barrel-exported) is the guarded
  replacement: it back()s only while the URL still sits on the route; the
  test-app's `/prefs` adopts it and ROUTING.md §7.1 now prescribes it.
  (2) Deep-linking/reloading onto a `stay` route fired the event BEFORE the
  underneath-mount fix-up, burying the overlay marker (rewritten to the
  resting hash) under the re-pushed action hash: the first Back kept the
  modal open while the URL flipped underneath, and the second re-fired the
  action. The fix-up now runs restore-then-event, like `back`/`none`, so the
  history gets the exact click shape (`[resting, action, marker]`) and ONE
  Back closes the modal. `_qa_prefs.mjs` grew both scenarios
  (back-after-deep-link, drain-no-refire).
- **fix(shell): a `back`/`none` action-route click no longer leaves a
  duplicate history entry.** The click pushed the action hash and the restore
  then `replaceState`d that entry to the previous resting route — two
  adjacent identical entries, one dead Back press per click. The click entry
  points (toolbar + nav) now detect URL-restoring action routes
  (`route_restores_url`) and navigate directly, skipping the push;
  `_qa_prefs.mjs` asserts the history grows by exactly the overlay marker.
- **fix(shell): declared route keys are normalized at index time.** Requests
  were normalized (`hash_to_route` / `navigate_to`) but the index keys were
  not, so a route declared `"/reports/"` (trailing/doubled slash) never
  matched its own clicks and the menu item was unnavigable. `build_item_index`
  and `yui_shell_set_submenu` now index the canonical form.
- **fix(shell): a route-table key holding an OBJECT but missing its leading
  `/` now logs instead of being silently dropped** (the silent path made a
  mistyped key read as "the menu entry doesn't work"). The `_name_comment`
  string idiom stays silent as designed.
- **fix(window-manager): the dock chip label re-translates.** The chip was
  painted once with the composed, already-translated title, so it kept the
  registration language for its whole life (the one gap left by
  `title_prefix`). `EV_REGISTER_WINDOW` now carries the split halves
  (`title_key`/`title_kind_text`/`title_prefix`); the chip renders the DATA
  half plain and the KIND half with `data-i18n` (CSS `·` separator, like the
  title bar), and the tooltip carries `data-i18n-title` when there is no
  DATA half. Needs gobj-js ≥ the `data-i18n-placeholder` release for the
  route-map filter (see below) but degrades gracefully.
- **fix(gobj-tree, json-graph): a theme change keeps the camera.** `ac_theme`
  rebuilt with the default fit-whole-view, throwing away the user's zoom/pan
  mid-inspection; both now refresh with `{preserve_view: true}`
  (`refresh_json` learned the option, mirroring `refresh_tree`).
- **fix(treedb-schema): a theme change keeps the camera here too.** The last
  canvas still doing the whole-rebuild-on-restyle: `ac_theme` called
  `build_graph`, which destroys the G6 instance and ends on
  `render().then(fitView)` — with `zoom-canvas`/`drag-canvas` on, the user
  lost zoom, pan and every dragged node. The theme-dependent styles moved to
  `node_style(dark)`/`edge_style(dark)` (one place, used at build AND on
  switch) and `ac_theme` now restyles the LIVE graph
  (`setTheme` + `setNode` + `setEdge` + `draw()`), rebuilding only when there
  is no graph to restyle (the "no topics" empty state). `EV_REBUILD` (fresh
  schema = new data) still rebuilds.
- **fix(theme): `yui_watch_theme` also watches the OS preference.** With
  `data-theme` absent (the "system" theme, declared by the `color-scheme`
  matrix), an OS auto-switch flipped the CSS but fired no `EV_THEME`, leaving
  every canvas on the old palette — the exact bug class the watcher exists to
  kill. It now listens to `matchMedia("(prefers-color-scheme: dark)")` too
  (deduped, so a pinned attribute never double-fires) and returns a single
  handle whose `disconnect()` tears down both sources.
- **fix(site map): the fallback sheet title re-translates** (it passed
  `t("site map")` — the translation — as the modal's `title`, so the
  data-i18n key was a translated string that never re-translated); the
  `gclass` column tooltip gained `data-i18n-title`; the filter placeholder
  re-translates via gobj-js's new `data-i18n-placeholder` support.
- **fix(map): the marker window title is DATA** — the marker's name now
  travels as `title_prefix` (never translated) instead of `title`, where a
  marker named like a locale key ("status") would have rendered translated.
- **fix(treedb-topics, treedb-graph): the JSON-viewer window is STOPPED
  before destroy** in the programmatic close path (topic switch / teardown),
  like the viewer beside it — destroying a running gobj logs two errors and
  skips `mt_stop`.
- **chore(index): barrel-export `yui_shell_set_sub_routes` (README documented
  it as the contributor protocol's other half), `yui_shell_register_overlay` /
  `yui_shell_overlay_dismissed` (ROUTING.md §6 documents them) and
  `yui_shell_unpark_route`.**
- **docs(changelog): backfill — the site-map tree fills its window with flex
  instead of a fixed 68vh** (CSS-only follow-up of the site-map viewer that
  had no bullet).
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
  `yui_is_dark()`, `yui_watch_theme()`, exported from the `index.js` barrel),
  `<html data-theme>` as the single
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
  different, already theme-aware path) looked fine.

- **fix(shell, treedb-graph): native controls follow the theme —
  `color-scheme` at `:root`.** The number input and select inside the graph's
  edition popovers styled only their border, so they fell back to the browser
  default (white + black) and stayed light inside a dark popover; they now take
  Bulma scheme vars. But their ORNAMENTS — spinner arrows, the select chevron,
  scrollbars — are drawn by the browser from `color-scheme`, never from
  background/color, and nothing declared it. `c_yui_shell.css` now does, keyed
  off the same `[data-theme]` Bulma switches on: `light` / `dark` explicitly,
  and `light dark` (follow the OS) when the attribute is absent — the "system"
  theme, where Bulma renders per `prefers-color-scheme`; pinning `light` there
  would force light controls inside a system-dark app. This reaches every
  native control in an app importing `c_yui_shell.css`, which is the point.

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
