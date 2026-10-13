# Bake the angular weight, delete the runtime bias bakes

**Ruling:** `docs/research/2026-10-08-galaxy-octree-streaming.md` §11, "Ruled 2026-10-13". Only
`AngularReweight` ships; the Schechter and 1/V_max computations stay available in the bake behind a
flag; the runtime loses the bias subsystem, both workers, the splice path and two dropdown modes.
Prep PR ahead of the GLADE-on-octree slice.

**Ground preparation:** none needed — this plan _is_ the prep: a deletion plus one format column.

## Contract

### SKMP v10 — byte 55 becomes `angularWeight`

| Offset | Column          | Store | Notes                                                                                   |
| ------ | --------------- | ----- | --------------------------------------------------------------------------------------- |
| 54     | flags           | u8    | unchanged (`orientationIsFallback` bit 0, `diameterIsFallback` bit 1, mass bit 2)       |
| 55     | `angularWeight` | u8    | was reserved/zero. `0` decodes as `1.0`, so a cloud that never baked a weight is unweighted |

Record size stays 64 B. `VERSION` 9 → 10, `GALAXY_CATALOG_DATA_PREFIX` → `galaxy-catalog/v10`.

Weight codec (two files, `src/utils/galaxy/`):

```ts
/** w ∈ [0.1, 10] → 1..255; exactly 128 for 1.0. */
export function encodeAngularWeight(w: number): number; // clamp(round(128 + 127·log10(w)), 1, 255)
/** 0 → 1.0 (unset); otherwise 10^((raw − 128) / 127). */
export function decodeAngularWeight(raw: number): number;
```

### Vertex record — 14 slots → 12

| Slot | Location | Field                                  |
| ---- | -------- | -------------------------------------- |
| 0–2  | 0        | xyz                                    |
| 3    | 1        | magnitude                              |
| 4    | 2        | colorIndex                             |
| 5    | 3        | axisRatio (sign = orientation fallback)|
| 6–7  | 4        | paCos, paSin                           |
| 8    | 5        | radiusMpc (sign = diameter fallback)   |
| 9    | 6        | angularWeight (decoded, f32)           |
| 10   | 7        | absMag                                 |
| 11   | 8        | sbAmp                                  |

`vMaxWeight` and `schechterRatio` are gone. The 192-byte uniform block keeps its layout; only
`biasMode`'s values change.

### `BiasMode`

```ts
export const BiasMode = { None: 0, VolumeLimited: 1, AngularReweight: 2 } as const;
```

Shader: `let angularMult = select(1.0, p.angularWeight, u.biasMode == 2u);` and the mode-1 gate
unchanged. The default stays `AngularReweight`.

### Build flag

`npm run build-tiers -- --bias-weight angular|schechter|vmax|none` (default `angular`). Weights are
computed **once per source over the full cross-matched record set, after local-volume overrides**,
and follow each record through `selectTierRecords` by identity, so every tier of a source carries
the same per-galaxy weight.

```ts
// tools/catalog/bias/bakeBiasWeights.ts
export type BiasWeightKind = 'angular' | 'schechter' | 'vmax' | 'none';
export function bakeBiasWeights(
  records: ParsedRecord[],
  cloud: GalaxyCatalog, // recordsToCloud(records, overrides) — same order as `records`
  source: SourceType,
  kind: BiasWeightKind,
): Map<ParsedRecord, number>;
```

## Tasks

### Task 1: weight codec

**Files:** `src/utils/galaxy/encodeAngularWeight.ts` (new), `src/utils/galaxy/decodeAngularWeight.ts`
(new), `tests/utils/galaxy/encodeAngularWeight.test.ts` (new).

- [ ] Tests: `1.0 encodes to exactly 128 and decodes back to exactly 1`; `0.1 → 1, 10 → 255, and
      values outside clamp to those`; `raw 0 decodes to 1`; `encode is monotone over [0.1, 10]`.
- [ ] Implement per the contract. Commit.

### Task 2: SKMP v10 `review: yes`

**Files:** `src/data/galaxyCatalog/galaxyCatalogFormat.ts`, `src/@types/data/galaxyCatalog/GalaxyCatalog.d.ts`,
`src/data/galaxyCatalog/emptyGalaxyCatalog.ts` (or wherever `emptyGalaxyCatalog` lives),
`src/data/galaxyCatalog/galaxyCatalogTransfer.ts` (only if it lists columns by hand),
`tools/famous/buildFamous.ts`, `tests/data/galaxyCatalog/galaxyCatalogFormat.test.ts` (or the
format's existing test file), `docs/DATA.md`.

- [ ] Add `angularWeight: Uint8Array` to `GalaxyCatalog` and the spec entry
      `{ column: 'u8', components: 1, disk: { kind: 'field', offset: 55 } }` after `diameterIsFallback`;
      drop the "byte 55 is reserved" comment. Bump `VERSION` and the prefix.
- [ ] Every place that builds a `GalaxyCatalog` by hand (`emptyGalaxyCatalog`, `buildFamous`'s cloud,
      test fixtures the typecheck flags) allocates the column; zeros are the correct famous value.
- [ ] Test: extend the format round-trip to assert `angularWeight` survives encode → decode; extend
      the version test so a v9 header is rejected with the regenerate message.
- [ ] `docs/DATA.md`: the binary-format paragraph names v10 and byte 55; the tier-build section
      documents `--bias-weight`. Commit.

### Task 3: bake computes the weight `review: yes`

**Files:** `src/services/engine/bake/computeAngularWeights.ts` → `tools/catalog/bias/computeAngularWeights.ts`,
`src/services/engine/bake/computeSchechterRatios.ts` → `tools/catalog/bias/computeSchechterRatios.ts`,
`src/@types/engine/ComputeAngularWeightsInput.d.ts` → `tools/@types/catalog/ComputeAngularWeightsInput.d.ts`,
`src/@types/engine/ComputeSchechterRatiosInput.d.ts` → `tools/@types/catalog/ComputeSchechterRatiosInput.d.ts`,
`tools/catalog/bias/bakeBiasWeights.ts` (new), `tools/catalog/buildAllBins.ts`,
`tests/tools/catalog/bias/bakeBiasWeights.test.ts` (new), the moved tests.

- [ ] Move the four files with
      `npm run move-files -- --manifest <moves.json>` (`--dry` first), then grep for the old paths.
      Their tests travel with them into `tests/tools/catalog/bias/`.
      `tests/services/engine/bake/computeAngularWeights.rebake.test.ts`: delete if it exercises the
      runtime re-bake, keep (moved) only if it tests the pure function.
- [ ] `bakeBiasWeights` per the contract: `angular` → `computeAngularWeights`, `schechter` →
      `computeSchechterRatios`, `vmax` → `vMaxWeight` per record as
      `buildPointInterleavedBuffer.ts:300-315` does today (read it before deleting it in Task 5),
      `none` → every record 1.
- [ ] `buildAllBins.ts`: parse `--bias-weight` beside the other flags (`readArgs`,
      `buildAllBins.ts:346`); in the per-source loop (`buildAllBins.ts:856`) bake the weights from
      `recordsToCloud(records, overrides)` once per source before the tier loop; `recordsToCloud`
      takes the map and writes `encodeAngularWeight(weights.get(rec) ?? 1)` into `angularWeight`.
- [ ] Test `bakeBiasWeights`: `'none' maps every record to 1`; `'angular' weights a record in the
      denser of two HEALPix cells below 1 and the sparser above 1` (two clusters of synthetic
      records at one distance); `a weight follows its record through selectTierRecords` (bake on
      the full set, select a tier, every selected record's weight equals the full-set bake).
- [ ] Commit.

### Task 4: delete the runtime bias machinery

**Files (delete):** `src/layers/galaxyCatalog/subsystems/biasCorrectionSubsystem.ts`,
`src/layers/galaxyCatalog/subsystems/bake/computeAngularWeights.worker.ts`,
`src/layers/galaxyCatalog/subsystems/bake/computeSchechterRatios.worker.ts`,
`src/@types/engine/subsystems/BiasCorrectionSubsystem.d.ts`, `BiasCorrectionDeps.d.ts`,
`SchechterRunner.d.ts`, `AngularRunner.d.ts`, `src/@types/engine/BuildPointInterleavedBufferMode.d.ts`,
`tests/layers/galaxyCatalog/subsystems/biasCorrectionSubsystem.test.ts`,
`tests/layers/galaxyCatalog/frame.biasReconcile.test.ts`.
**Files (modify):** `src/layers/galaxyCatalog/render/catalogStore.ts` (splice/clear/callbacks,
`catalogStore.ts:168-200, 301-370, 470-474`), `src/layers/galaxyCatalog/@types/CatalogStore.d.ts`,
`src/layers/galaxyCatalog/render/galaxyPointRenderer.ts:296-300`, `src/@types/rendering/GalaxyPointRenderer.d.ts:32-46`,
`src/layers/galaxyCatalog/@types/GalaxyCatalogRuntime.d.ts:54-56`, `src/layers/galaxyCatalog/create.ts:52,135,139`,
`src/layers/galaxyCatalog/frame.ts:84-87`, `tests/layers/galaxyCatalog/render/catalogStore.test.ts:299-460`,
the fixtures in `tests/layers/galaxyCatalog/frame.{aliasIndexReconcile,memberCountReconcile,settlingVote}.test.ts`,
`tests/services/engine/phases/initGpu.hdrCapabilityWiring.test.ts:334`,
`tests/services/engine/wiring/makeReconcileEffects.test.ts:63-71`.

- [ ] Delete the files, remove the store's bias surface and the renderer passthroughs, the runtime's
      two members and `frame`'s reconcile; drop the fixture fields. `cloneGalaxyCatalogForTransfer`
      stays: the interleave worker still uses it (`catalogStore.ts:93`).
- [ ] No new test: a deletion. Commit.

### Task 5: 12-slot record, interleave reads the baked weight `review: yes`

**Files:** `src/layers/galaxyCatalog/render/galaxyPointVertexLayout.ts`,
`src/services/engine/bake/buildPointInterleavedBuffer.ts`, `src/@types/engine/BuildPointInterleavedBufferInput.d.ts`
(drop `mode`), `BuildPointInterleavedBufferResult.d.ts` (drop any Schechter/`nRef` carry-over nothing reads),
`src/services/gpu/shaders/galaxyCatalog/points/io.wesl` (`PerVertex`, the Malmquist comment block),
`src/services/gpu/shaders/galaxyCatalog/points/vertex.wesl:196-214`, `src/data/galaxyCatalog/biasMode.ts`,
`src/@types/data/galaxyCatalog/BiasMode.d.ts`, `src/@types/rendering/GalaxyPointDrawSettings.d.ts:30-32`,
`tests/layers/galaxyCatalog/render/galaxyPointVertexLayout.test.ts`,
`tests/services/engine/bake/buildPointInterleavedBuffer.test.ts`, `docs/RENDERER.md:20`.

- [ ] Layout per the contract table; the pick pipeline shares `GALAXY_POINT_VERTEX_ATTRIBUTES`, so
      it follows. Shader `PerVertex` locations 6–8 renumber; delete the two `select`s and the
      `vMaxWeight`/`schechterRatio` inputs; `biasMode == 2u` for the angular multiply. The uniform
      struct and `packGalaxyPointUniforms` keep their bytes; rewrite the comment so the
      `apparentMagLimit`/`schechter*` words read as padding kept for offset stability.
- [ ] `buildPointInterleavedBuffer` writes `decodeAngularWeight(cloud.angularWeight[i])` to slot 9;
      the `mode` switch, the Schechter bake call, `nRef` and the `vMaxWeight` call go.
      `galaxyCatalogFluxLimit`/`galaxyCatalogSchechter` remain for the tools.
- [ ] Tests: layout test asserts 12 slots / 48-byte stride and the location table; interleave test
      asserts slot 9 equals the decoded weight of the input column (raw 128 → 1, raw 255 → 10).
- [ ] Commit.

### Task 6: dropdown, docs, website

**Files:** `src/layers/galaxyCatalog/ui/GalaxiesSection.tsx:229-246`, `tests/layers/galaxyCatalog/ui/GalaxiesSection.test.ts`,
`packages/website/src/data/docsSettings.ts:199-203`, `packages/website/src/data/docsGuideFacts.ts:1010`,
`packages/website/src/data/docsScienceFacts.ts:214`, `docs/science.md:22-32`.

- [ ] Three options in the dropdown (None, Volume-limited, Angular re-weight); the comment about
      future disabled options goes. `docsSettings.options` lists the same three
      (`tests/packages/website/docsReference.test.ts:169` parses them from the component).
- [ ] Guide fact 1010 and science fact 214 describe the weight as baked at build time with the
      Schechter and 1/V_max alternatives as build flags; `docs/science.md` "Survey bias" likewise,
      linking `tools/catalog/bias/computeAngularWeights.ts`.
- [ ] No new test: the docs reference test already pins the options. Commit.

## Definition of Done

- **Deliverables:** `encodeAngularWeight` / `decodeAngularWeight`; SKMP v10 with `angularWeight` at
  byte 55 under `galaxy-catalog/v10`; `tools/catalog/bias/` holding both computations and
  `bakeBiasWeights`; `--bias-weight` on `build-tiers`; `BiasMode` with three values; a 12-slot vertex
  record; no `biasCorrectionSubsystem`, no bake workers, no splice surface.
- **Observable:** with freshly built v10 bins, GLADE at the default setting shows no pencil-beam jets
  beyond ~600 Mpc (the angular weight is in force at upload, no toggle needed); switching to
  "None — raw catalogue" brings the jets back; a tier switch no longer runs a bake.
- **Data:** the sandbox has no raw catalogs; the user runs `npm run build-tiers` and
  `npm run build-famous`, then the R2 sync per `docs/DEPLOY.md`, before the app can load v10.
- **Deferred:** the octree column for the galaxy family (the GLADE slice); the reserved uniform words;
  `tools/filaments` and the mcpm workbench, which compute their own weights.
