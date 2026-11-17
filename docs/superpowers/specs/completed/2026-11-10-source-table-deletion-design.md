# The `Source` table goes: sources are named by their entry's id — design

**Status:** design, awaiting approval. Written against `main` at `14cff2b5d`.

**Ground preparation:** produced by `refactor-ground` at a 2026-11-10 checkpoint and signed off in ask Qfx7
(§3). The prep ships as its own PR before the feature PR.

**Consumes no backlog item.** The stream was ruled 2026-11-05 as the third leg of the selection-kind-facts
work (spec `completed/2026-11-05-selection-kind-facts-design.md`, which put it out of scope) and was never
backlogged. The adjacent findings in §3.6 are added to the backlog in this spec's commit.

---

## 1. Purpose

`src/data/source.ts` is a hand-numbered table of all 34 data sources (`Source.SDSS = 1` … `SmallBody = 38`).
Its header says the values are "baked into every .bin". They are not. The galaxy `.bin` v10 record has no
source field: a file's source comes from its filename (`binBaseName`). No other format, URL or store that
persists anything carries a `Source` number either. The one exception is the mcpm-workbench preset JSON,
which users download.

So the number is a second name for every source. Each entry already has a readable `id` (`'sdss'`,
`'gaiaStars'`), and visibility, pick codes and asset demand already key by it. The number survives as a key
because it came first. It forces id↔number translators (`galaxyCatalogIdOf`, `catalogPickCodes`, four
visibility sites). It also forces a core table that every new source must edit, against ADR 0013 ("nothing
hand-written in core").

## 2. Goals, non-goals, anti-goals

**Goals**

- Every source is named by its entry's `id`, everywhere: registry key, refs, asset keys, counts, the
  workbench preset.
- `src/data/source.ts`, `SourceType`, `GalaxyCatalogSourceType`, `StarCatalogSourceType`, every entry's
  `code` field and the id↔number translators are deleted.
- After the prep, no core file switches over individual galaxy or star catalogs.
- Adding a source is one entry in its Layer's `sources/`, and nothing in core changes.

**Non-goals**

- Durable cross-session ids (J8). Refs stay positional `{ source, index }`, as ruled 2026-11-05.
- Renaming ids for consistent casing (`'galaxy-cluster'` against `'gaiaStars'`). See §3.6.
- The entry's `type` discriminator and the per-Layer id unions are unchanged.
- PR #932 (GLADE octree) is ignored, as ruled 2026-11-02. Its core octree files on main only get the
  type swap.

**Anti-goals**

- No branded id type and no registry object with methods (§3.3).
- No numeric fallback key kept "just in case": nothing on disk reads it.

## 3. Ground preparation

### 3.1 Ideal diff for a new source (after prep and feature)

One `<NAME>_ENTRY` file in the owning Layer's `sources/`, and one element in that Layer's rows array. The
registry, the Layer's id union, pick codes, visibility and asset keys all follow from the entry's `id`.
Today the same source also needs a new number in `source.ts` and the same number repeated in the entry's
`code`. A galaxy catalog also needs a new arm in core's `galaxyType` switch.

### 3.2 Verdicts at checkpoint (ground-check page, 2026-11-10)

| Touchpoint                                             | Verdict    | Joint                                                     |
| ------------------------------------------------------ | ---------- | --------------------------------------------------------- |
| `Layer.sources`, `APP_SOURCE_REGISTRY`, entry `code`   | growth     | The registry already has an id on every entry             |
| Refs, `sourceCounts`, `SourceCountReport`, `AssetKey`  | growth     | Type swap to the id                                       |
| `galaxyType`, `buildGalaxyInfo`, `sourceClass` in core | **bolt-on** | Core can't name `GalaxyCatalogId` → prep 1               |
| Palette alias arm calls `encodeGalaxyId` in core       | **bolt-on** | The alias row doesn't carry its focus id → prep 2        |
| `SEEDED_STAR_CATALOGS_BY_SOURCE` in `src/data/bodies/` | **bolt-on** | A single-Layer table living in core → prep 3             |
| Tests (770 refs in 136 files), tools (38 refs)         | growth     | Literal substitution                                      |

The three bolt-ons share one cause: with `SourceType` gone, a core file that branches on particular
catalogs would have to name a Layer's id type. That would need a new `CORE_ALLOWED` row, which is ruled
out. The cure is to move the branching into the Layer that owns those catalogs.

### 3.3 Greenfield cross-check

A fresh agent derived the shapes from the requirements alone. It agreed on string ids owned by Layers,
positional refs `{ source: SourceId; index }`, id-keyed counts and an id-keyed preset that is validated on
import.

It diverged in three places:

- It proposed a registry object (`get`/`has`/`byPickCode`) with a branded `SourceId`. **Rejected:** a plain
  `as const` record keyed by id already narrows (`APP_SOURCE_REGISTRY.sdss.type === 'galaxyCatalog'`)
  without casts. Pick codes already come from the runtime allocator (#1057). A brand adds a concept that the
  derived literal union already covers.
- It proposed namespaced asset keys (`src:sdss#2`). **Rejected,** given the uniqueness guard in §4.4: today
  the merged key space has no collision, and the guard turns any future one into a boot failure.
- It proposed per-catalog behaviour as a strategy object on the entry. **Deferred:** prep 1 moves
  `galaxyType` as-is (ruled Qfx7). A colour-index fact per entry is backlogged (§3.6).

### 3.4 Prep refactors (own PR, before the feature)

All moves go through `npm run move-files`. Each prep is one commit, and destinations follow ADR 0014 (concern
modules with role subfolders). Each commit removes the core files it moves from `CORE_ALLOWED` and from the
type-ownership sweep. It adds no rows.

1. **Galaxy-only core files move into `galaxyCatalog`.** These are `src/utils/math/galaxyType.ts`,
   `src/services/engine/helpers/buildGalaxyInfo.ts`, `src/data/galaxyCatalog/sourceClass.ts`,
   `src/data/galaxyCatalog/galaxyCatalogFluxLimits.ts` (tools read it under the S2 ruling) and
   `src/@types/engine/GalaxyInfo.d.ts`, plus their tests. In the moved files, parameters narrow from
   `SourceType` to `GalaxyCatalogSourceType`, so `galaxyType`'s 34-arm switch shrinks to the galaxy arms.
   `galaxyType` leaves the `utils/math` barrel. The colour helpers it calls (`galaxyTypeFromColor`,
   `galaxyTypeFromBminusJ`) move only if the Layer becomes their sole importer.
2. **Alias rows carry their focus id.** `AliasIndexEntry` gains `focusId: string`. `buildAliasIndex` (Layer)
   fills it in with `encodeGalaxyId`, `actionForRow` reads `row.entry.focusId`, and `encodeGalaxyId` moves to
   `galaxyCatalog/selection/utils/`. If nothing in core then reads `AliasIndexEntry.source`, it goes too.
3. **`SEEDED_STAR_CATALOGS_BY_SOURCE` moves into `starCatalog/seededStars/`.**

### 3.5 Packaging

Ruled Qfx7: prep as its own PR, merged first, then the feature PR. The feature branch starts from main after
the prep merges.

### 3.6 Adjacent findings (to the backlog in this spec's commit)

- `src/utils/math/index.ts` is a barrel file, against the no-barrel convention.
- `SourceId` names two unrelated types: `src/@types/data/SourceId.d.ts` and `src/@types/input/SourceId.d.ts`.
- Source ids mix casing (`'galaxy-cluster'`, `'small-body'` against `'gaiaStars'`). Visibility and links
  store them, so renaming them is a link-compat question of its own.
- `encodeGalaxyId` hard-codes `sdss-`, where each entry's `durableId.prefix` already holds the prefix (J8
  territory).
- `galaxyType` as a colour-index fact on each galaxy-catalog entry, replacing the moved switch.

## 4. The design (post-prep architecture)

### 4.1 Identity

`SourceId` (`src/@types/data/SourceId.d.ts`) stays the literal union derived from the registry's entries.
Each Layer's own id type follows its own rows, never the composed registry: `GalaxyCatalogId`,
`StarCatalogId`, `BodySourceId`, `BlackHoleId` and `CosmicWebDensityFieldId` (the last two since #1098).
Core sees `SourceId` or a plain `string`.

### 4.2 The Layer contract and the registry

```ts
// src/@types/engine/layer/Layer.d.ts
Sources extends readonly SourceEntry[] = readonly SourceEntry[],
```

- A Layer's rows are an array of entries: `[SDSS_ENTRY, TWO_MRS_ENTRY, …] as const satisfies readonly
  SourceEntry[]`.
- `sourceRecordOf(rows)` keys each entry by `entry.id`.
- `APP_SOURCE_REGISTRY` satisfies `Readonly<Record<SourceId, SourceEntry>>`.
- Per-Layer records (`GALAXY_CATALOG_SOURCE_RECORD`, `STAR_CATALOG_SOURCE_RECORD`) key by id the same way.
- `SourceEntryBase.code` is deleted from the type and from all 34 entries.
- `defineLayer`, `instantiateLayer` and `createLayers` follow the new bound.

The registry's key order becomes the spread order in `appSources.ts` (Layer order), where it used to be
ascending code. `SOURCE_ENTRIES`, `SOURCE_IDS` and anything that iterates them follow (§9).

### 4.3 Refs, counts, seeded stars

- `GalaxyCatalogRef.source: GalaxyCatalogId`, `StarCatalogRef.source: StarCatalogId`,
  `SeededStarRef.source: SeededStarCatalogId`.
- `SourceCountReport.source` and `CoreEngineSliceState.sourceCounts` key by `SourceId`.
- `SEEDED_STAR_CATALOGS_BY_SOURCE` is keyed by id.
- `galaxyCatalogIdOf` and the visibility translations (`catalogStore.ts`, `StarsSectionContainer.tsx`,
  `fieldStarSpherePass.ts`, `hiResFamousSubsystem.ts`) are deleted: the ref already holds the id.

### 4.4 Asset keys

`AssetKey` narrows to `string`. galaxyCatalog, starCatalog and cosmicWebDensity key their rows by the entry
id, and `companionOf` names an id.

A galaxy catalog's key changes from `1` to `'sdss'`, so it now shares one key space with every string key.
That is already guarded: `createLayers.ts:166` composes the rows through
`concatUniqueRows('createLayers: asset keys', (row) => String(row.key), …)`, which throws at boot on a
duplicate (and already treated `1` and `'1'` as one key). The `String()` goes once `AssetKey` is `string`.
No new assert. (Corrected at plan time, 2026-11-10: the first draft asked for one.)

### 4.5 Pick codes

`catalogPickCodes` takes the entries themselves (`readonly { id: K }[]`), with no tuple. `pickCodeOf(id)` and
`catalogOfPickCode(code)` keep their meaning, keyed by id. Callers: `bodyCodeOf`, `planetsPass`,
`bodyGlintsPass`, `earthPass`, `starCatalog/create`, `produceFamousGalaxyLabels`.

### 4.6 Tools

- `ParsedRecord.source` becomes the galaxy-catalog id. The parsers (`sdssCsv`, `glade`, `twoMrs`,
  `milliquas`, `desiPatches`) and `buildAllBins`' bucketing follow. Nothing written changes: the `.bin`
  output is byte-identical (§6).
- **The mcpm-workbench preset stores `sources` as ids** (ruled Qfx7: break). `importParams` accepts only
  known ids. An array of numbers fails with a message saying the preset predates source ids and must be
  re-exported. No number→id map is kept.
- `estimateLog10StellarMass.ts` and `buildFilaments.ts` switch on ids.

### 4.7 Tests and the mechanical rewrite

`Source.<Member>` becomes the member's id literal. The member→id map is generated from the entries before
`source.ts` is deleted, and applied as a literal text substitution. That is not a symbol rename, so neither
`refactor rename` nor move-files fits. Typecheck and the full suite verify it. Imports of `data/source` that
the substitution empties are removed.

### 4.8 Deletions and doc fixes

- **Files deleted:** `src/data/source.ts`, `src/@types/data/SourceType.d.ts`, `GalaxyCatalogSourceType.d.ts`,
  `StarCatalogSourceType.d.ts` and `src/utils/galaxyCatalogIdOf.ts`.
- **Stale comments fixed:** `tools/famous/buildFamous.ts:258-262`, the `sourceClass.ts` header and the
  `appSources.ts` header.
- **ADR 0013:** a dated note under its implementation notes, saying the `Source` enum was deleted by this
  spec.
- **`AssetKey.d.ts` header:** drop "or the numeric `Source` code".

## 5. Constraints

- No new `CORE_ALLOWED` rows. The prep only removes rows.
- No change to any shipped data file, URL grammar (`sdss-`, `pgc-`, famous id, `pos@`, `star-`) or
  localStorage key.
- Files that move use `move-files`. Generated files that emit import paths as strings
  (`buildSpacecraftTracks.ts`) get checked by hand.

## 6. Testing

- **Existing tests:** rewritten per §4.7, and the full suite stays green.
- **Asset-key collisions:** the existing `concatUniqueRows` guard throws at boot; the dev-server boot after
  the id switch shows that today's keys don't collide.
- **Registry by identity:** `sourceRegistryCoverage.test.ts` keeps "every Layer row is the registry's entry
  at its id". After the re-key, a duplicate id collapses two rows, and this test fails on it.
- **Workbench import:** a numeric `sources` array is rejected with the re-export message.
- **Bin parity:** `npm run build-all` before and after the feature produces byte-identical `public/data/*.bin`
  (checksums compared). This guards the parser and bucketing change.
- **Visual:** shot the deep links for a galaxy (M31), a star (Sirius) and a body (Mars), and the Labels panel,
  before and after.

## 7. Open

None.

## 8. Left to the builder

- Exact destination folders inside `galaxyCatalog` and `starCatalog` for the prep moves, per ADR 0014. They
  go in the PR body.
- Whether the colour helpers move with `galaxyType` (prep 1 rule).
- Commit split inside the feature PR. The type switch is wide, so one atomic switch commit plus a separate
  test-rewrite commit is fine, as long as the PR is green.

## 9. Calls made in writing (check these)

1. **Registry order becomes Layer order.** Today the Labels panel and `SOURCE_IDS` follow the numeric code;
   after the re-key they follow `appSources.ts`'s spread order. If the panel's order matters, it should come
   from an explicit order on the panel, not from the key order. The before/after shot will show the
   difference.
2. **Asset keys stay bare ids**, not namespaced, relying on the existing uniqueness guard.
3. **The workbench preset error** asks for a re-export and does not migrate the file.
