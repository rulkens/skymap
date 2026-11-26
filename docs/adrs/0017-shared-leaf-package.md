# ADR 0017 — Code the App and a Tool App Both Use Lives in One Leaf Package, `packages/shared`

- **Status:** Accepted
- **Date:** 2026-11-26
- **Decision-makers:** Alexander Rulkens (with Claude)
- **Supersedes:** —
- **Superseded by:** —
- **Related:** backlog item [packages split](../backlog/2026-09-19-packages-split.md) ·
  [`packages/shared/README.md`](../../packages/shared/README.md) ·
  guard test `tests/conventions/sharedPackageBoundary.test.ts`

## Context

The MCPM workbench (`tools/mcpm-workbench`) is to become a package of its own. It imports 80
modules straight from the app's `src/`: math helpers and types, form components, the GPU device,
the data manifest loader, the design tokens. Moved as it stood, the new package would depend on all
of `src/` through deep `../../` imports and gain nothing (the backlog item's "hard part").

Closing those 80 imports over `src/`, minus the galaxy-catalog Layer and composition files and the
MCPM shaders, gives 90 files, of which 20 only the workbench reaches. The other 70 are used by the
app as well, and by the other workbenches, the website and the desktop app. None of them imports a
Layer, a composition, the store or the engine.

## Decision

**Code that the app and a tool app both use lives in one workspace package, `packages/shared`. It
is a leaf: it imports only itself and npm packages. Consumers import it by relative path.**

- Files keep their sub-path: `src/utils/math/cross3.ts` is `packages/shared/src/utils/math/cross3.ts`.
  Its tests mirror it under `packages/shared/tests/` and run in the root suite.
- `sharedPackageBoundary.test.ts` fails on any relative import, `composes` or `@import` in
  `packages/shared/src/` that resolves outside it. Its allowlist is empty.
- Nobody imports `@skymap/shared` by name. The `package.json` exists so npm knows the workspace and
  its peer dependencies (`react`, `classnames`).

Not decided here: moving the workbench itself, and where code only one tool app uses should live.

## Alternatives rejected

- **An import alias for `src/`** (`@app/utils/...`). It changes the spelling, not the dependency:
  every file of `src/` stays reachable and nothing marks where a tool may stop.
- **Three packages by kind** (math, ui, gpu). Three sets of tsconfig, vitest, eslint and convention
  rows, and no consumer needs one without the others.
- **Imports by package name.** Inside a worktree without its own install, a package name resolves to
  the main checkout's copy, so a branch would silently build against main's code. The same rule
  governs `packages/move-files` (`docs/superpowers/plans/completed/2026-11-04-move-files-package.md`,
  Global Constraints).

## Consequences

### Positive

- Of the workbench's 80 imports from `src/`, 45 now point into the leaf; the other 35 are the 16
  below and 19 workbench-only helpers, all of which move with the workbench or stay listed.
- The leaf rule is a test, not a habit, so the package cannot grow back into `src/`.

### Negative

- 16 workbench imports stay in `src/`: the 12 MCPM shaders, held there by the single WESL package
  root (layer-composition spec, `docs/superpowers/specs/2026-09-09-layer-composition-design.md`
  §12), and 4 galaxy-catalog Layer and composition files. When the workbench moves, they become an
  explicit exception list that only shrinks.
- Workbench-only helpers (the `Select` component and `formControl.module.css`, 14 icons, `cssVar`,
  `withAxis`, `uniformInSphere`) stay in `src/` until the workbench moves.

### Neutral / forward-looking

- The app's `src/` imports `packages/shared` like any other consumer; nothing in `src/` is barred
  from doing so.
- Code another tool app shares with the app joins the package the same way: move it with its whole
  closure, or keep it in its consumer.

## References

- Backlog: `docs/backlog/2026-09-19-packages-split.md`.
