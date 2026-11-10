# Source-table deletion — prep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this
> plan task-by-task, under the lean protocol in `docs/superpowers/conventions/sdd-execution.md`. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the three galaxy- and star-only pieces of core into the Layers that own them, so the feature PR
can delete the `Source` table without any core file naming a Layer's id type.

**Architecture:** Three move-only commits, each removing a bolt-on named in the spec's §3.2. Behaviour is
unchanged. Each commit adds no `CORE_ALLOWED` row and no type-ownership exception; prep 3 removes one row.

**Tech Stack:** TypeScript, Vitest, `npm run move-files`.

**Spec:** `docs/superpowers/specs/2026-11-10-source-table-deletion-design.md` (§3.4 is this plan).

## Global Constraints

- Every move goes through `npm run move-files` (`--dry` first). Never `git mv` plus hand-edited imports, and no
  ad-hoc ts-morph scripts.
- move-files does not rewrite non-import path strings, and may not rewrite `vi.mock('…')` specifiers. After each
  move, grep `src tools tests packages docs` for the old path and fix what it finds by hand.
- No new `CORE_ALLOWED` row in `tests/conventions/layerImportBoundary.test.ts`.
- A Layer never imports `src/compositions/` or `src/data/sourceEntries.ts` (which re-reads the composition).
  Inside `galaxyCatalog` read `GALAXY_CATALOG_SOURCE_RECORD` / `galaxyEntryOf`, inside `starCatalog`
  `STAR_CATALOG_SOURCE_ROWS` / `STAR_CATALOG_SOURCE_RECORD`.
- No change to any `#focus=` id (`sdss-`, `pgc-`, famous id, `pos@`, `star-`), shipped data file or
  localStorage key.
- Comments per `docs/superpowers/conventions/comments.md`: a moved file's header names its new home only if it
  named the old one.

## Review Focus

1. **A palette alias pick focuses the same galaxy as before.** A 2MRS or GLADE alias row must still yield
   `pgc-<n>`: `buildAliasIndex` calls `encodeGalaxyId` with the same arguments `actionForRow` used to. Task 2
   pins it in `buildAliasIndex.test.ts`.
2. **The card's "type" line is unchanged** for SDSS, 2MRS, GLADE and the famous galaxies after `galaxyType`
   narrows. The existing `galaxyType.test.ts` cases cover the arms; Task 1 keeps them all.
3. **The website's object catalogue still lists the seeded stars and the Sun.**
   `packages/website/src/data/objectCatalogue.ts` imports `SEEDED_STAR_CATALOGS_BY_SOURCE`; Task 3 runs the
   website typecheck.
4. **The website docs pages still link to live files.** `docsGuideFacts.ts` and `docsReferenceFacts.ts` carry
   `${REPO_BLOB}/src/...` strings that move-files never rewrites.
5. **`wireInput.test.ts` still mocks the real module.** Its `vi.mock` names `buildGalaxyInfo` by path; a stale
   path makes the mock silently inert.

---

### Task 1: Galaxy-only core files move into `galaxyCatalog`

**Files:**

- Move: `src/utils/math/galaxyType.ts` → `src/layers/galaxyCatalog/records/utils/galaxyType.ts`
- Move: `src/utils/math/galaxyTypeFromColor.ts`, `galaxyTypeFromBminusJ.ts`, `galaxyTypeFromJminusK.ts` →
  `src/layers/galaxyCatalog/records/utils/` (after the move their only importer is `galaxyType`; checked
  2026-11-10, so they move under the spec's §3.4 rule)
- Move: `src/@types/data/galaxyCatalog/GalaxyTypeInfo.d.ts`, `GalaxyTypeMags.d.ts` →
  `src/layers/galaxyCatalog/records/@types/`
- Move: `src/services/engine/helpers/buildGalaxyInfo.ts` →
  `src/layers/galaxyCatalog/records/present/buildGalaxyInfo.ts`
- Move: `src/data/galaxyCatalog/sourceClass.ts` → `src/layers/galaxyCatalog/records/data/sourceClass.ts`
- Move: `src/data/galaxyCatalog/galaxyCatalogFluxLimits.ts` →
  `src/layers/galaxyCatalog/records/data/galaxyCatalogFluxLimits.ts`
- Move: `src/@types/engine/GalaxyInfo.d.ts` → `src/layers/galaxyCatalog/records/@types/GalaxyInfo.d.ts`
- Tests that move with them: `tests/utils/math/galaxyType*.test.ts` (4 files),
  `tests/services/engine/helpers/buildGalaxyInfoBySource.test.ts`, `tests/data/galaxyCatalog/sourceClass.test.ts`
  → the mirrored `tests/layers/galaxyCatalog/records/...` paths
- Modify: `src/utils/math/index.ts` (drop the four `galaxyType*` lines)
- Modify: `tests/services/engine/phases/wireInput.test.ts:34` (the `vi.mock` path, if move-files left it)
- Modify: `packages/website/src/data/docsGuideFacts.ts:788,804,820,828,884` (the `buildGalaxyInfo` URL strings)
- Modify: `src/compositions/README.md:36` (the `galaxyType` row)

**Interfaces:**

- Produces: `galaxyType(source: GalaxyCatalogSourceType, mags: GalaxyTypeMags): GalaxyTypeInfo` at the new path.
  `buildGalaxyInfo`, `sourceClassLabel`, `galaxyCatalogFluxLimit`, `galaxyCatalogSchechter` keep their names
  and signatures, except that a `source: SourceType` parameter narrows to `GalaxyCatalogSourceType` (from
  `src/layers/galaxyCatalog/@types/GalaxyCatalogSourceType.d.ts`) wherever every caller already holds it.
  Where a tools caller only holds `SourceType` (`tools/parsers/*`, `tools/catalog/bias/*`,
  `tools/filaments/buildFilaments.ts`), leave that parameter as `SourceType`: the feature plan narrows it with
  `ParsedRecord.source`.

- [x] **Step 1: Remove the four `galaxyType*` re-exports from `src/utils/math/index.ts`** and point their
      importers at the files directly (only `buildGalaxyInfo.ts:25-45` imports `galaxyType` through the
      barrel). Do this first, so move-files never rewrites a core barrel line into a Layer path.
- [x] **Step 2: Write the manifest and dry-run it.** One `moves.json` with every move above, sources and their
      tests:
      `npm run move-files -- --manifest <scratch>/moves.json --dry` → lists each move, no unresolved findings.
- [x] **Step 3: Apply.** `npm run move-files -- --manifest <scratch>/moves.json`. Exit 1 means the moves are
      written: fix each `file:line` it lists, don't re-run.
- [x] **Step 4: Grep the old paths** (`utils/math/galaxyType`, `engine/helpers/buildGalaxyInfo`,
      `data/galaxyCatalog/sourceClass`, `data/galaxyCatalog/galaxyCatalogFluxLimits`, `engine/GalaxyInfo`,
      `galaxyCatalog/GalaxyType`) across `src tools tests packages docs` and fix the strings: the `vi.mock` in
      `wireInput.test.ts`, the five URLs in `docsGuideFacts.ts`, any doc mention.
- [x] **Step 5: Cut the composition reads.** `buildGalaxyInfo.ts:16,88,248` and
      `galaxyCatalogFluxLimits.ts:9,15,26` read `APP_SOURCE_REGISTRY`; read the Layer's own entry instead
      (`galaxyEntryOf` at `records/utils/galaxyEntryOf.ts`, or `GALAXY_CATALOG_SOURCE_RECORD`). The
      `no file under src/layers imports src/compositions` sweep fails until this is done.
- [x] **Step 6: Narrow `galaxyType`'s parameter** to `GalaxyCatalogSourceType` and delete the switch arms for
      non-galaxy members (the switch stays exhaustive over the galaxy members). Narrow the other moved
      functions per the Interfaces block. No new test: the compiler checks exhaustiveness and the moved
      `galaxyType.test.ts` keeps every existing case.
- [x] **Step 7: Update the ledger row.** `src/compositions/README.md:36`: the `galaxyType` switch now lives in
      `src/layers/galaxyCatalog/records/utils/galaxyType.ts`; status DONE (it moved out of core), noting that
      the per-entry colour-index fact is backlogged.
- [x] **Step 8: Verify.** `npm run typecheck`, then
      `npx vitest run tests/conventions tests/layers/galaxyCatalog tests/services/engine` → all green.
- [x] **Step 9: Commit** — "galaxyType, buildGalaxyInfo, sourceClass and flux limits move into galaxyCatalog".

### Task 2: Alias rows carry their focus id; `encodeGalaxyId` moves into `galaxyCatalog`

**Files:**

- Modify: `src/@types/engine/AliasIndexEntry.d.ts` (replace `source` with `focusId`)
- Modify: `src/layers/galaxyCatalog/aliases/load/buildAliasIndex.ts:20`
- Modify: `src/utils/palette/actionForRow.ts:8,22-37` (and its header line 4-5)
- Move: `src/services/url/encodeGalaxyId.ts` → `src/layers/galaxyCatalog/selection/utils/encodeGalaxyId.ts`
  (plus its test mirror, if one exists)
- Modify: `packages/website/src/data/docsReferenceFacts.ts:256` (the URL string)
- Test: `tests/layers/galaxyCatalog/aliases/load/buildAliasIndex.test.ts`,
  `tests/utils/palette/actionForRow.test.ts`, `tests/utils/palette/rankPaletteMatches.test.ts:33`,
  `tests/components/CommandPalette/CommandPalette.test.ts:25`

**Interfaces:**

- Produces:

```ts
// src/@types/engine/AliasIndexEntry.d.ts
export type AliasIndexEntry = {
  pgc: number;
  names: readonly string[];
  /** The `#focus=` id a pick of this row navigates to, filled in by `buildAliasIndex`. */
  focusId: string;
};
```

- `source` goes: no core file reads it (checked 2026-11-10: `rankPaletteMatches`, `selectors`,
  `CommandPalette`, `usePaletteSearch` never touch it; only test fixtures write it).
- `actionForRow`'s `alias` arm returns `{ kind: 'focus', focusId: row.entry.focusId }`.

- [x] **Step 1: Write the failing test** in `buildAliasIndex.test.ts`:
      `it('gives each row the focus id the galaxy deep-links by')` — a pgc-claiming non-SDSS record holding
      `pgc-123` yields an entry with `focusId: 'pgc-123'`. Change the existing fixtures from `source` to
      `focusId`.
- [x] **Step 2: Run it** — `npx vitest run tests/layers/galaxyCatalog/aliases` → FAIL (`focusId` undefined).
- [x] **Step 3: Change the type, then fill `focusId`** in `buildAliasIndex` with
      `encodeGalaxyId({ source: record.source, famousId: null, objId: pgc, ra: 0, dec: 0, distMpc: 0 })`, so
      the `pgc-` grammar keeps its one home. Move the comment at `actionForRow.ts:29-30` about bigint along
      with it.
- [x] **Step 4: Point `actionForRow` at `row.entry.focusId`** and drop its `encodeGalaxyId` import. Fix the
      three test fixtures that build `AliasIndexEntry` (`source: Source.Glade` → `focusId: 'pgc-…'`).
- [x] **Step 5: Move `encodeGalaxyId`.** Its importers are now only `galaxyCatalogSelectionRow.ts` and
      `buildAliasIndex.ts`, both in the Layer:
      `npm run move-files -- src/services/url/encodeGalaxyId.ts src/layers/galaxyCatalog/selection/utils/encodeGalaxyId.ts --dry`,
      then without `--dry`. Grep `services/url/encodeGalaxyId` and fix `docsReferenceFacts.ts:256` by hand.
- [x] **Step 6: Verify.** `npm run typecheck`, then
      `npx vitest run tests/conventions tests/layers/galaxyCatalog tests/utils/palette tests/components/CommandPalette`
      → green, the new test included.
- [x] **Step 7: Commit** — "Palette alias rows carry their focus id; encodeGalaxyId moves into galaxyCatalog".

### Task 3: `SEEDED_STAR_CATALOGS_BY_SOURCE` moves into `starCatalog`

**Files:**

- Move: `src/data/bodies/seededStarCatalogsBySource.ts` →
  `src/layers/starCatalog/seededStars/data/seededStarCatalogsBySource.ts`
- Move: `src/@types/data/starCatalog/SeededStarCatalogRow.d.ts` → `src/layers/starCatalog/seededStars/@types/`
  (after the move only the Layer imports it; the type-ownership sweep demands it)
- Modify: `tests/conventions/layerImportBoundary.test.ts:90` (delete the `'data/bodies/seededStarCatalogsBySource'`
  row)
- Modify: `src/compositions/README.md:33` (drop the file from the `starCatalog` id-domain row)
- Check: `packages/website/src/data/objectCatalogue.ts:10` (an import; move-files rewrites it)

**Interfaces:**

- Produces: `SEEDED_STAR_CATALOGS_BY_SOURCE` at the new path, same name, same type
  (`ReadonlyMap<StarCatalogSourceType, SeededStarCatalogRow>`), same contents.
- `src/@types/data/starCatalog/SeededStarCatalogId.d.ts` and `src/data/bodies/seededStarCatalogs.ts` stay in
  core: `seededStarCatalogs.ts` is not part of this move, so `SeededStarCatalogId` keeps a core importer and
  its `CORE_ALLOWED` row.

- [x] **Step 1: Move both files in one manifest**, `--dry` first, then applied.
- [x] **Step 2: Cut the composition read.** The moved file builds its map from `SOURCE_ENTRIES`
      (`src/data/sourceEntries.ts`, which reads `APP_SOURCE_REGISTRY`); build it from the Layer's own
      `STAR_CATALOG_SOURCE_ROWS` (`src/layers/starCatalog/sources/starCatalogSourceRows.ts`) instead, same
      filter (`binBaseName === null`).
- [x] **Step 3: Delete the `CORE_ALLOWED` row** and update the ledger row at `src/compositions/README.md:33`
      (the `every ALLOWED file is a row of the composition ledger` test checks the two agree).
- [x] **Step 4: Verify.** `npm run typecheck` (it covers the website), then
      `npx vitest run tests/conventions tests/layers/starCatalog` → green. No new test: a move.
- [x] **Step 5: Commit** — "SEEDED_STAR_CATALOGS_BY_SOURCE moves into starCatalog".

---

## Definition of Done

- **Deliverables:** the files listed under Tasks 1-3 live at their new paths; `src/utils/math/index.ts` has no
  `galaxyType*` line; `AliasIndexEntry` has `focusId` and no `source`; `CORE_ALLOWED` has one row fewer.
- **Observable behaviour (manual, one dev-server pass):** the galaxy card for M31 and for an SDSS galaxy shows
  the same type line, source label and AGN/DESI class line as on main; a palette search for a PGC alias name
  (e.g. "Sombrero") focuses the same galaxy as on main; the Stars section and a `#focus=star-…` link work.
- **No grep hit** for any old path in `src tools tests packages docs` (besides `docs/superpowers/**` history).
- **Deferral boundary:** no `Source` or `SourceType` removal, no id re-keying, no `galaxyType` redesign (the
  per-entry colour fact is backlogged), `famousDisplayName` and `seededStarCatalogs.ts` stay where they are.
- PR body names the destination folders (spec §8).
