# Constants files carry a `.constants.ts` suffix, grouped by the thing they describe

**Readiness:** `ready`. Ruled 2026-11-03. Runs as its own PRs after Layer M1
(`docs/superpowers/plans/completed/2026-11-02-layer-m1-moves.md`) lands, so the renames don't collide with the
batch moves.

## Rulings

- A constants file is named `<thing>.constants.ts` (`flowField.constants.ts`), the website's
  `<Name>.constants.ts` pattern brought to `src/` and `tools/`. The suffix still says "constant"
  where the folder can't be seen: a diff, a search hit, an import line.
- One file holds the constants of **one thing**. That replaces one-constant-per-file for `data/`;
  a module-wide bag of unrelated constants is not allowed.
- The `data/` role folder stays (ADR 0014); the suffix is added to it, not instead of it.
- Scope: `src/` and `tools/`. The website keeps its own rule (`componentFilePurity.test.ts`).

## Ratchet

A convention test fails when a file under any `data/` folder exports a function: `data/` holds
constants and tables only. The 49 offenders today (e.g. `flowFieldMetaFromCube`, sent back in #1006)
start allow-listed, and the list only shrinks: each moves to the `utils/` beside it.

## Open for the PR

- **Grouping pass.** Which of the ~340 `data/` files (303 in `src/data/`, 12 in Layer `data/`, 29 in
  `tools/`) merge into one `<thing>.constants.ts`, and under what name. Propose the map in the first PR.
- **Tables.** Whether a large lookup table (a catalog-id list, slider-field rows) is a `.constants.ts`
  or keeps a plain name.
- **Docs.** CLAUDE.md's one-symbol-per-file line and `src/layers/README.md`'s `data/` row change in
  the same PR.
- `move-files` renames each file; merging two constant files into one is a hand edit plus importer
  repoints through `npm run refactor`.
