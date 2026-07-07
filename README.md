# gobj-ui — Yuneta UI Library

Reusable GUI components for Yuneta GClass front-ends: a declarative shell
(`C_YUI_SHELL`/`NAV`/`PAGER`/`WIZARD`), the legacy GClass GUI stack
(`C_YUI_MAIN`/`WINDOW`/`TABS`/`ROUTING`), TreeDB editors, charts and maps.

Published as `@yuneta/gobj-ui`. Built on top of [`@yuneta/gobj-js`](https://github.com/artgins/gobj-js).

## Two maintained lines

This repository carries **two parallel lines** with different layouts and
consumers. They are independent snapshots (no shared git ancestry):

| Line | Branch | Tag | Layout | Consumed by | How | Status |
|------|--------|-----|--------|-------------|-----|--------|
| **v2** | `main` | `2.0.0`+ | `src/` subdir | **wattyzer** | local `file:` dep on the yunetas submodule | active development |
| **v1** | `v1` | `1.0.0` | `src/` subdir | **estadodelaire**, **hidraulia** | published npm `@yuneta/gobj-ui@^1.0.0` | frozen, maintenance-only |

- **v2 / `main`** is the active development line: the declarative shell on top
  of the legacy stack. It is embedded as a git submodule in **yunetas** at
  `kernel/js/gobj-ui`, and **wattyzer** consumes that checkout as a `file:`
  dependency (`@yuneta/gobj-ui` → `../../../yunetas/kernel/js/gobj-ui`),
  importing by package specifier (`@yuneta/gobj-ui/src/*.js`, exports map
  `"./src/*"`; the `index.js` barrel and the vite plugin stay at the package root).
- **v1 / `v1`** is the frozen legacy-only stack (the declarative shell is not on
  this line). It is **published to npm**; estadodelaire and hidraulia depend on
  `@yuneta/gobj-ui@^1.0.0` from the registry. Land only maintenance fixes here,
  then `npm publish` a new `1.x`.

All new feature work lands on `main`/v2.

## Usage

```bash
# v2 (active): clone yunetas with submodules; wattyzer picks it up via file:
git clone --recurse-submodules <yunetas>
git submodule update --init kernel/js/gobj-ui      # yunetas tracks main/v2

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
tarball; v2 (wattyzer) imports source files by specifier. Rebuild `dist/` to
validate and before publishing a v1 release.

Copyright (c) 2024-2026, ArtGins. All Rights Reserved.
