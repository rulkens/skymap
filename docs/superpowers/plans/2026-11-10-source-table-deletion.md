# Source-table deletion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this
> plan task-by-task, under the lean protocol in `docs/superpowers/conventions/sdd-execution.md`. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete `src/data/source.ts`: every source is named by its entry's string `id` in the registry, refs,
asset keys, counts, pick codes, tools and the workbench preset.

**Architecture:** Four green commits. Task 1 flips the meaning in one small diff: `Source`'s values become the
entries' ids (`SDSS: 'sdss'`), so every code-keyed record, ref and asset key is id-keyed from then on. Tasks
2-4 then delete what the flip made redundant: the rows tuple and `code` (2), the `SourceType` family and the
id↔code translators (3), and the `Source.X` spellings with the table itself (4). Task 5 is the before/after
evidence.

**Tech Stack:** TypeScript, Vitest, the tools catalog pipeline (`npm run build-all`).

**Spec:** `docs/superpowers/specs/2026-11-10-source-table-deletion-design.md`.

**Precondition:** the prep PR (`completed/2026-11-10-source-table-deletion-prep.md`) is merged; this branch starts from
main after it.

## Global Constraints

- No new `CORE_ALLOWED` row. Task 3 deletes `'utils/galaxyCatalogIdOf'`.
- A Layer never names `SourceId` (it derives from the composed registry, which imports the Layers' rows). A
  Layer file uses its own id type (`GalaxyCatalogId`, `StarCatalogId`, `SeededStarCatalogId`, `BodySourceId`,
  `BlackHoleId`, `CosmicWebDensityFieldId`) when the value is its own source, else `string`. Core uses
  `SourceId` or `string`. Each Layer id type derives from that Layer's own rows, never from the registry.
- No change to any shipped `.bin`, URL grammar (`sdss-`, `pgc-`, famous id, `pos@`, `star-`) or localStorage
  key. Visibility already keys by id.
- File moves (none planned) would go through `npm run move-files`. The Task 4 substitution is a literal text
  substitution (spec §4.7), run by a throwaway script outside the repo, never committed; no ts-morph script.
- The mcpm-workbench preset stores ids; a numeric `sources` array fails with exactly:
  `"<field>" holds numeric source codes from before source ids — re-export the preset from the current workbench`
- Comments per `docs/superpowers/conventions/comments.md`. Delete comments that explain the code↔id split
  rather than rewording them.

## Review Focus

1. **A catalog's asset key now collides with another Layer's string key.** `concatUniqueRows('createLayers:
   asset keys', …)` (`src/services/engine/phases/createLayers.ts:166`) throws at boot; Task 1's dev-server
   boot is the check, since no test composes the full app's asset rows.
2. **The `.bin` output changes.** Parsers and `buildAllBins` bucket by `ParsedRecord.source`; Task 1 and Task
   4 each compare `build-all` checksums against the baseline taken before Task 1.
3. **The Labels panel and anything iterating `SOURCE_IDS` reorder.** Integer keys iterated ascending; string
   keys iterate in `appSources.ts` spread order. Task 5's before/after shot shows it; the user rules on it
   (spec §9.1).
4. **A hand-edited old preset loads half-valid.** Task 1's test covers an all-numeric array; a mixed array
   (`['sdss', 3]`) must fail on the number with the unknown-id message, not load.
5. **A `#focus=sdss-…` or `pgc-…` link resolves to a different galaxy.** `encodeGalaxyId` compares the source
   against SDSS; after Task 4 it compares against `'sdss'`. The existing round-trip parity test covers it;
   Task 5 shoots M31 and an SDSS galaxy link.

---

### Task 1: `Source` values become the entries' ids

**Files:**

- Modify: `src/data/source.ts` (every value, and the header)
- Modify: `tools/mcpm-workbench/src/state/importParams.ts:88-102`, `exportParams.ts:49,64,73` (if a type
  needs it)
- Modify: tests that assert a numeric code (`tests/sources.test.ts`, and whatever else the suite flags)
- Modify: any file the typecheck flags for treating a code as a number
- Test: `tests/tools/mcpm-workbench/state/importParams.test.ts`

**Interfaces:**

- Produces: `Source.<Member>` is its entry's id literal (`Source.SDSS === 'sdss'`,
  `Source.GaiaStars === 'gaiaStars'`). So `SourceType` is the id union, `APP_SOURCE_REGISTRY` is keyed by id,
  and so is every asset key, ref and count built from a `Source` value. Later tasks rely on this.

- [ ] **Step 1: Take the baselines, before any edit.**
  - Shots: `npm run shot -- '<link>' --url <your server>` for M31 (`#focus=m31`), Sirius, Mars, an SDSS galaxy
    `#focus=sdss-…` link, and the Labels panel open. Save them to the SDD workspace as `before-*.png`.
  - Bins: the worktree's `data/raw/` holds only the tracked folders, so first symlink each raw folder it
    lacks from the main checkout (`ln -s /Users/rulkens/Development/js/skymap/data/raw/<dir> data/raw/<dir>`).
    Then run `npx tsx tools/catalog/buildAllBins.ts --out-dir <SDD workspace>/bins-before` (not
    `npm run build-all`, which also rewrites `public/data`'s manifest, and `public/data` is a symlink into
    the main checkout). Save `find <dir> -name '*.bin' -exec shasum {} + | sed 's#<dir>/##' | sort` as
    `bins-before.txt`. Later parity runs build into `bins-after` the same way and diff the two lists.
- [ ] **Step 2: Generate the member→id map** from the entries (each entry has `code: Source.<Member>` and its
      `id`) with a throwaway script, and rewrite `src/data/source.ts` so each member's value is its id string.
      Fix its header (it falsely says the codes are baked into every `.bin`): it is now a transitional alias
      table, deleted in Task 4.
- [ ] **Step 3: Write the failing tests** in `importParams.test.ts`:
  - `it('rejects a preset whose sources are numbers, asking for a re-export')` — `sources: [1, 3]` throws an
    error whose message equals the Global Constraints text for that field.
  - `it('rejects a mixed sources array on its number')` — `sources: ['sdss', 3]` throws.
  - Change the existing fixtures from numbers to ids.
- [ ] **Step 4: Run them** — `npx vitest run tests/tools/mcpm-workbench/state/importParams.test.ts` → the two
      new tests FAIL.
- [ ] **Step 5: Make `optionalSourceList` accept ids only**: an all-number array fails with the re-export
      message, any other non-member fails with the existing unknown-id message.
- [ ] **Step 6: `npm run typecheck` and fix each place that used a code as a number** (arithmetic, a typed
      array slot, a `typeof … === 'number'` test on a source). Report each one in the commit body: none was
      found by grep, so each is news.
- [ ] **Step 7: Full suite.** `npm test`; fix the tests that pinned numeric codes or code-sorted order, by
      asserting the id (never by re-pinning a number).
- [ ] **Step 8: Boot check.** Start the dev server; the app boots with no `createLayers: asset keys` error, and
      M31, Sirius and Mars focus.
- [ ] **Step 9: Bin parity.** Rebuild into `bins-after` as in Step 1; its checksum list equals `bins-before.txt`.
- [ ] **Step 10: Commit** — "Source's values become the entries' ids".

### Task 2: A Layer's `sources` is an array of entries; `code` goes

**Files:**

- Modify: `src/@types/engine/layer/Layer.d.ts:36-39`, `src/@types/data/SourceRecordOf.d.ts`,
  `src/utils/data/sourceRecordOf.ts`, `src/@types/data/SourceEntryBase.d.ts` (drop `code`, fix the `id`
  comment)
- Modify: the 14 rows files, `src/layers/*/sources/*SourceRows.ts`, and the per-Layer records
  `galaxyCatalog/sources/galaxyCatalogSourceRecord.ts`, `starCatalog/sources/starCatalogSourceRecord.ts`
- Modify: all 34 entry files under `src/layers/*/sources/` (drop `code:`)
- Modify: the `.code` readers: `src/layers/body/selection/present/bodyCodeOf.ts:13`,
  `src/layers/starCatalog/controls/ui/StarsSectionContainer.tsx:66`,
  `src/layers/galaxyCatalog/records/load/flatGalaxyRecordSource.ts:26`, `galaxyCatalogAssetRows.ts:21`,
  `wireGalaxyCatalogSourceSlot.ts:36`, `src/layers/starCatalog/seededStars/data/seededStarCatalogsBySource.ts`
- Modify: the Layer id types that read `[number][1]['id']` (`blackHoles/@types/BlackHoleId.d.ts`,
  `cosmicWebDensity/@types/CosmicWebDensityFieldId.d.ts`, and any sibling the typecheck finds)
- Modify: `src/utils/picking/catalogPickCodes.ts`, `src/@types/engine/selection/CatalogPickCodes.d.ts`, and
  its four callers in `src/layers/{body,starCatalog,galaxyCatalog,structure}/create.ts`
- Modify: `defineLayer`, `instantiateLayer`, `createLayers` wherever the new bound needs it
- Test: `tests/conventions/sourceRegistryCoverage.test.ts` (keep, adapt)

**Interfaces:**

```ts
// src/@types/engine/layer/Layer.d.ts
Sources extends readonly SourceEntry[] = readonly SourceEntry[],

// src/@types/data/SourceRecordOf.d.ts
export type SourceRecordOf<Rows extends readonly SourceEntry[]> = {
  readonly [E in Rows[number] as E['id']]: E;
};

// src/utils/data/sourceRecordOf.ts
export function sourceRecordOf<const Rows extends readonly SourceEntry[]>(rows: Rows): SourceRecordOf<Rows>;

// src/utils/picking/catalogPickCodes.ts
export function catalogPickCodes<K extends string>(
  entries: readonly { readonly id: K }[],
  pickCode: (pickSourceId: string) => number,
): CatalogPickCodes<K>;
// CatalogPickCodes<K extends string>; structure passes STRUCTURE_IDS.map((id) => ({ id }))
```

- A rows file becomes `[SDSS_ENTRY, TWO_MRS_ENTRY, …] as const satisfies readonly SourceEntry[]`.
- `appSources.ts` keeps its spreads; `satisfies Readonly<Record<SourceType, SourceEntry>>` still holds (Task 3
  swaps it to `SourceId`).

- [x] **Step 1: Change the contract types and `sourceRecordOf`** per the Interfaces block.
- [x] **Step 2: Rewrite the 14 rows files and two records** to entry arrays; drop `code` from the type and
      the 34 entries; point the `.code` readers at `.id`.
- [x] **Step 3: Switch `catalogPickCodes`** and its four callers; update its header and `CatalogPickCodes`'s
      (no more "`Source` value").
- [x] **Step 4: Adapt `sourceRegistryCoverage.test.ts`** so it still asserts "every Layer row is the
      registry's entry at its id". Check it can fail: temporarily give two entries the same id, see it go red,
      revert. No new test: the compiler checks the rest.
- [x] **Step 5: Verify.** `npm run typecheck`, `npm test` → green.
- [x] **Step 6: Commit** — "A Layer's sources are its entries, keyed by id; the code field goes".

### Task 3: The `SourceType` family and the id↔code translators go

**Files:**

- Delete: `src/@types/data/SourceType.d.ts`, `src/layers/galaxyCatalog/@types/GalaxyCatalogSourceType.d.ts`,
  `src/layers/starCatalog/@types/StarCatalogSourceType.d.ts`, `src/utils/galaxyCatalogIdOf.ts` (and its test)
- Modify: every importer of those (≈ 31 Layer files, 26 core files, 21 tools files, plus tests), per the Global
  Constraints rule for which id type to use
- Modify: the refs: `GalaxyCatalogRef.source: GalaxyCatalogId`
  (`src/layers/galaxyCatalog/selection/@types/GalaxyCatalogRef.d.ts:9`), `StarCatalogRef.source: StarCatalogId`,
  `SeededStarRef.source: SeededStarCatalogId`
- Modify: `src/@types/engine/layer/SourceCountReport.d.ts:9`, `src/@types/store/CoreEngineSliceState.d.ts:36`
  (`Partial<Record<SourceId, number>>`)
- Modify: `src/@types/loading/AssetKey.d.ts` (`= string`; drop "or the numeric `Source` code" from its header),
  `src/services/engine/phases/createLayers.ts:166` (`(row) => row.key`, no `String()`)
- Modify: `tools/parsers/common.ts:25` (`ParsedRecord.source: GalaxyCatalogId`), the parsers and
  `tools/catalog/buildAllBins.ts` bucketing, `tools/catalog/estimateLog10StellarMass.ts`,
  `tools/filaments/buildFilaments.ts`, the workbench's `WORKBENCH_SOURCES` and preset types
- Modify: the translators that become identities, deleting the translation:
  `galaxyCatalog/records/utils/visibleCatalogsOf.ts:18`, `records/load/wireGalaxyCatalogSourceSlot.ts:57`,
  `hiResFamous/subsystems/hiResFamousSubsystem.ts:110`, `lod/subsystems/diskPlannerWalk.ts:85`,
  `pointSprites/render/catalogStore.ts`, `starCatalog/controls/ui/StarsSectionContainer.tsx:66`,
  `StarsSection.tsx:118`, and the field-star visibility read in `fieldStarSpherePass.ts`
- Modify: `galaxyCatalog/records/utils/galaxyEntryOf.ts` (`source: string`),
  `starCatalog/seededStars/data/seededStarCatalogsBySource.ts` (keyed by `SeededStarCatalogId`)
- Modify: `src/compositions/appSources.ts` (`satisfies Readonly<Record<SourceId, SourceEntry>>`)
- Modify: `tests/conventions/layerImportBoundary.test.ts` (delete `'utils/galaxyCatalogIdOf': 3`),
  `src/compositions/README.md:32` (drop `galaxyCatalogIdOf.ts` from the row)

**Interfaces:**

- Consumes: Task 1's id-valued `Source`, Task 2's entry rows.
- Produces: no `SourceType`, `GalaxyCatalogSourceType` or `StarCatalogSourceType` anywhere. `Source` itself still
  exists (Task 4 deletes it); its values now type as the Layer id literals.

- [ ] **Step 1: Swap the types**, Layer by Layer, then core, then tools; `npm run typecheck` after each Layer
      keeps the fallout local.
- [ ] **Step 2: Delete each translator** listed above. Where the code mapped a ref's source to an id to test
      visibility, the ref's `source` is the id: test it directly.
- [ ] **Step 3: `AssetKey = string`** and drop the `String()` in `createLayers`.
- [ ] **Step 4: Delete the four files**, the `CORE_ALLOWED` row and the ledger mention.
- [ ] **Step 5: Verify.** `npm run typecheck`, `npm test` → green. `grep -rn "SourceType\|galaxyCatalogIdOf" src
      tools tests packages` → only `docs/` history. No new test: a type swap and identity deletions.
- [ ] **Step 6: Commit** — "Sources are typed by their ids; the SourceType family and its translators go".

### Task 4: `Source.X` becomes the id literal; `src/data/source.ts` is deleted

**Files:**

- Delete: `src/data/source.ts`
- Modify: every file importing `data/source` (≈ 137 tests, plus the remaining src/tools/packages files)
- Modify (stale comments): `tools/famous/buildFamous.ts:258-262`, the
  `galaxyCatalog/records/data/sourceClass.ts` header, the `src/compositions/appSources.ts` header (keyed by
  entry id; key order is the spread order, which the Labels panel follows), `src/@types/data/SourceId.d.ts`
  ("string twin of the numeric Source code"), `src/@types/engine/selection/CatalogPickCodes.d.ts`
- Modify: `docs/adrs/0013-registries-built-from-layer-contributions.md` (a dated implementation note: the
  `Source` enum was deleted on 2026-11-xx by this spec; sources are named by their entry's id)

**Interfaces:**

- Consumes: Task 1's member→id values (the table itself is the map).

- [ ] **Step 1: Substitute.** A throwaway script outside the repo reads the member→id map from
      `src/data/source.ts` and, **only in files that import from `data/source`**, replaces `Source.<Member>`
      with `'<id>'` and removes the emptied import. Run `npm run format`.
- [ ] **Step 2: Delete `src/data/source.ts`.** `grep -rn "data/source'" src tools tests packages` → nothing.
- [ ] **Step 3: Fix the stale comments and add the ADR 0013 note.**
      `grep -rniE "Source (code|enum)|numeric Source|Source\.[A-Z]" src tools tests packages` → nothing left that
      describes the deleted table.
- [ ] **Step 4: Verify.** `npm run typecheck`, `npm test` → green; bin parity as in Task 1 Step 9 → equal to
      `bins-before.txt`.
- [ ] **Step 5: Commit** — "The Source table is deleted; sources are named by their ids".

### Task 5: Before/after evidence

**Files:** none (SDD workspace only); remove the `data/raw/` symlinks Task 1 added.

- [ ] **Step 1: Shoot the five Task 1 links again** as `after-*.png`.
- [ ] **Step 2: Compare** each pair. The galaxy, star and body shots match. The Labels panel may reorder (spec
      §9.1); note the old and new order.
- [ ] **Step 3: Hand the pairs to the user** as one dash `check` question per pair (the Labels panel one says
      whether the order changed), with the deep link. The user keeps the verdict.

---

## Definition of Done

- **Deliverables:** `src/data/source.ts`, `SourceType.d.ts`, `GalaxyCatalogSourceType.d.ts`,
  `StarCatalogSourceType.d.ts` and `galaxyCatalogIdOf.ts` are gone; no entry has `code`; `Layer.sources` is
  `readonly SourceEntry[]`; `AssetKey` is `string`; the workbench preset stores ids; ADR 0013 has its note;
  `CORE_ALLOWED` has no `galaxyCatalogIdOf` row.
- **Observable behaviour (manual):** M31, an SDSS `#focus=sdss-…` link, Sirius and Mars focus and show the same
  card as before; the Labels panel lists every source (order per the user's ruling); the workbench imports a
  freshly exported preset and refuses an old numeric one with the re-export message.
- **Evidence:** `build-all` checksums equal before and after; before/after shot pairs signed off.
- **Deferral boundary:** no id renames for casing, no durable ids (J8), no `galaxyType` redesign, no
  `encodeGalaxyId` prefix change, no explicit Labels panel order (unless the user rules for one at Task 5), no
  fix for the two types both named `SourceId` (backlogged).
