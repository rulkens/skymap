# Structure audit — import matrix and quality audits over `src/`

`npm run structure-audit` scans `src/` and writes one self-contained page to `tools/structure-audit/out/structureAudit.html`
(gitignored). Open it in a browser. It exists to replace "the structure feels tangled" with a
picture: which area imports which, where the cycles are, where mutable state sits outside Redux
Toolkit, and where the CLAUDE.md conventions are not yet met.

```bash
npm run structure-audit
open tools/structure-audit/out/structureAudit.html
```

Takes a few seconds; the two jscpd passes are most of it.

## What the page shows

| Tab               | Source            | Meaning                                                                                                                                                                                                           |
| ----------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Layering          | relative imports  | 43×43 area matrix, rows import columns. Areas sit in six **proposed** tiers; an import from a lower tier into a higher one gets a red ring. Every area has a tier dropdown, so the tiers can be argued with live. |
| Against the grain | same              | The red-ringed area pairs, expandable to the exact file pairs. Three rules: downward import, core → Layer (anything but `compositions/`), Layer → Layer.                                                          |
| Cycles            | Tarjan SCC        | Strongly connected file sets. Type-only imports count, so a cycle is a module-graph fact even if it never bites at runtime.                                                                                       |
| State             | regex             | Module-level `let`, module-level `Map`/`Set` (lookup / cache / mutable), factory closure cells, RTK slices, React hooks, classes.                                                                                 |
| Conventions       | regex             | `interface` (target zero), `index.ts` barrels, multi-export files under `utils/` and `@types/`, exported types outside `@types/` and `*/types/` (component `Props` exempt).                                       |
| Tests             | path mirror       | Whether a `src/` file has a `tests/` twin at the mirrored path. Presence, not coverage.                                                                                                                           |
| Stability         | area edges        | Martin's instability `I = Ce / (Ca + Ce)` per area. High `Ca` and high `Ce` together is the refactor target.                                                                                                      |
| Dead code         | import specifiers | Exports nothing in `src/` imports. "Test-only" when only `tests/` or `tools/` import them. Whole-file lists first.                                                                                                |
| Duplication       | jscpd             | Exact token clones at two thresholds (8 lines / 60 tokens, 5 lines / 40 tokens). Identifiers count, so a copy with one rename is missed: real duplication is higher.                                              |
| Hubs              | file edges        | Top fan-in and fan-out files.                                                                                                                                                                                     |

## What it cannot see

- Shader `package::` imports and `?static` suffixes (the WESL linker's graph, not TypeScript's).
- String-literal paths, `import.meta.glob`, and anything under `tools/` or `tests/` as an importer of `src/` beyond the dead-export check.
- Whether an import is _right_. It only reports whether an import agrees with the tiers you set.

## Areas and tiers

An area is a top-level `src/` folder, split one level deeper for `services/`, `services/engine/`
and `layers/` (`areaOf.ts`). The tier assignment in `tierOf.ts` is a proposal from the 2026-09-20
grill session and has **not** been ratified; the ratchet test that would enforce it does not exist
yet. Change `tierOf.ts` once the arrangement is agreed, then write the ratchet.

## Heuristics, honestly

Every list under State and Conventions is a regex over source lines, not a type-checked analysis.
A module-level `const x = new Map(...)` named in upper case or typed `ReadonlyMap` counts as a
lookup; a `WeakMap` or anything with `cache` in its name counts as a cache; the rest is "mutable".
A "closure cell" is a `let` indented exactly two spaces, which in this codebase's formatting means
directly inside a top-level function body. Read the lists as pointers, then open the file.
