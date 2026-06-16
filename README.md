# lib-yui — Yuneta UI Library

Reusable GUI components for Yuneta GClass front-ends: a declarative shell
(`C_YUI_SHELL`/`NAV`/`PAGER`/`WIZARD`), the legacy GClass GUI stack
(`C_YUI_MAIN`/`WINDOW`/`TABS`/`ROUTING`), TreeDB editors, charts and maps.

Published as `@yuneta/gobj-ui`. Built on top of [`@yuneta/gobj-js`](https://github.com/artgins/gobj-js.js).

## Two maintained lines

This repository carries **two parallel lines** with different layouts and
consumers. They are independent snapshots (no shared git ancestry):

| Line | Branch | Tag | Layout | Consumers | Status |
|------|--------|-----|--------|-----------|--------|
| **v2** | `main` | `2.0.0` | flat (`*.js` at root) | **wattyzer** | active development |
| **v1** | `v1` | `1.0.0` | `src/` subdir | **estadodelaire**, **hidraulia** | frozen, maintenance-only |

- **v2 / `main`** is the active development line: the declarative shell on top
  of the legacy stack. It is embedded as a git submodule in **wattyzer** at
  `gui/src/lib-yui` and consumed as plain source via relative imports.
- **v1 / `v1`** is the frozen legacy-only stack (the declarative shell is not on
  this line). It is embedded as a git submodule in **yunetas** at
  `kernel/js/lib-yui`; estadodelaire and hidraulia resolve `@yuneta/gobj-ui`
  there through an npm `file:` dependency. Land only maintenance fixes here.

All new feature work lands on `main`/v2.

## Usage as a submodule

```bash
# clone a superproject with its submodules
git clone --recurse-submodules <superproject>
# or, after a plain clone:
git submodule update --init kernel/js/lib-yui      # yunetas (v1)
git submodule update --init gui/src/lib-yui         # wattyzer (main/v2)
```

Edit lib-yui from the superproject checkout, commit on the appropriate line in
this repo, then bump the submodule pointer in the superproject.

## Build & test

```bash
npm install
npm run build      # vite -> dist/ (ES/CJS/UMD/IIFE, min + non-min)
npm test           # vitest (v2/main only; v1 has no test target)
```

`dist/` is gitignored. Consumers that import the package root (`@yuneta/gobj-ui`)
resolve to `dist/lib-yui.es.js` via the exports map, so rebuild `dist/` after
updating the v1 submodule.

Copyright (c) 2024-2026, ArtGins. All Rights Reserved.
