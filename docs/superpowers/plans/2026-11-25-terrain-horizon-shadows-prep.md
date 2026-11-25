# Terrain horizon shadows, PR A: ground preparation

> **Spec.** [`2026-11-25-terrain-horizon-shadows-design.md`](../specs/2026-11-25-terrain-horizon-shadows-design.md),
> §9 (Ground preparation), with §5 and §6 for the shapes the prep makes room for.
> **Branch.** `feat/terrain-horizon-shadows-prep`, worktree `.claude/worktrees/horizon-shadows-prep`.
> **Packaging.** This PR lands first and alone. The feature PR
> ([`…-feature.md`](2026-11-25-terrain-horizon-shadows-feature.md)) branches from main after it merges.
> **Execution.** Subagent-driven, lean protocol ([`sdd-execution.md`](../conventions/sdd-execution.md)).

## Strategy

Four commits, one per task, each **behaviour-neutral**. Nothing here adds horizon. Each task removes
a place where a fourth tile product would otherwise be a copied line:

| Task | Joint it creates | Bolt-on it removes |
| ---- | ---------------- | ------------------ |
| 1 | A tile read says `bytes`, `empty`, `missing` or `failed` | every read outcome is `null`, and `null` = failed for the session |
| 2 | Lane rows carry `role`, `binding`, `reservedSlots?` | per-product request lines, fixed bindings, named atlas args |
| 3 | One resolver for standalone products | `nightOf`, and `SurfaceCutTile.night` as its own field |
| 4 | One `composeSurfaceLight` helper | the direct + ambient line in three shaders, ambient folded into `litShade` |

**Neutrality check** (Tasks 2–4; Task 1 has no visual surface). Before Task 2, shoot these hashes
on this worktree's dev server with `npm run shot -- '<url>' --url http://localhost:<port>` and keep
the files under `.claude/desk/prep-baseline/`. After each of Tasks 2–4, shoot them again; every
pair must match within one 8-bit step per channel (Task 4 may move pixels by one step, from
`a*(b+c)` becoming `a*b + a*c`). The time and pose live in the hash:

| Name | What it exercises | Hash |
| ---- | ----------------- | ---- |
| `moon-orbit` | Moon globe (`texturedBody`) at the terminator | `#t=2026-11-17T21:00:00Z&pose=b,moon,1671428.5746436643,-146231.05217461428,449568.6813430785,1724019.9627058222,-150048.47521049468,496213.4461940356,-0.0935358431622793,-0.9953265391079159,0.024002637175518145,0.2723434327631185,-0.04876744286548726,-0.9609634702459621,-0.9576429922861245,0.0833475678338578,-0.27563215026817584` |
| `copernicus` | Moon tiles (`fragmentBare`) | `#t=2026-11-19T04:00:00Z&pose=b,moon,1608473.643784887,-587981.1945280053,290275.1317815381,93023.45730666348,-31727.957511191125,138347.29163551924,-0.34607449984574395,-0.9380424868369218,0.01757081231250831,0.7614252598549945,-0.29175795877019267,-0.5788858843926018,-0.5481459789246587,0.18695878257801585,-0.8152192339522382` |
| `everest` | Earth tiles (`fragmentEarth`: night atlas, clouds) | `#t=2026-11-20T01:12:00Z&pose=b,earth,302026.5799220264,5622188.772926215,2992181.369269421,-15309.381167163592,7862.324646996292,40044.48657617742,0.8856358550179397,-0.25435431727453484,0.38852672184863707,0.30377092775425485,0.9501393880231002,-0.07041567139783671,0.35124401170406044,-0.18038576609836518,-0.9187429562348458` |
| `jezero` | Mars tiles, rover band | `#t=2026-11-20T16:21:00Z&pose=b,mars,691403.5436897384,3139457.9759868933,1068139.0390700782,13398.757351951235,34480.79569896407,48551.77155165493,0.9746901454013925,-0.16237362891140072,-0.15366823058639975,0.042348923322054366,0.809025631138166,-0.5862457648929799,-0.21951238951566024,-0.5649002857103499,-0.795425658407805` |
| `earth-orbit` | Earth globe at a lit limb, terminator in view | `#focus=body-earth&t=2026-11-25T12:00:00Z` |
| `saturn` | `texturedBody` with the ring shadow on the disc | `#focus=body-saturn&t=2026-11-25T12:00:00Z` |

Shoot with `--hide-ui --png --size 1280x720 --dpr 1`: without `--hide-ui` the settings panel's toggles
animate and differ between two identical shots.

---

### Task 1: a tile read says what happened

`review: yes` (archive format semantics)

**Files:**
- Create: `src/layers/body/surfaceTiles/stream/@types/TileRead.d.ts`
- Modify: `src/layers/body/surfaceTiles/stream/@types/SurfaceTileSource.d.ts`,
  `src/layers/body/surfaceTiles/stream/load/createArchiveTileSource.ts:57-83`,
  `src/layers/body/surfaceTiles/stream/load/fetchSurfaceTileBitmap.ts`,
  `src/layers/body/surfaceTiles/stream/load/fetchHeightTile.ts`,
  `src/layers/body/surfaceTiles/stream/@types/SurfaceTileLaneSpec.d.ts`,
  `src/layers/body/surfaceTiles/stream/data/surfaceTileLaneSpecs.ts`,
  `src/layers/body/surfaceTiles/stream/subsystems/surfaceTileStream.ts:166-197, 200-226`,
  `src/layers/body/surfaceTiles/stream/@types/SurfaceTileResidency.d.ts`,
  `src/layers/body/surfaceTiles/plan/subsystems/planSurfaceTiles.ts:83-91`
- Test: `tests/layers/body/surfaceTiles/stream/load/createArchiveTileSource.test.ts`,
  `tests/tools/utils/textures/packSurfaceTileLevels.test.ts`,
  `tests/layers/body/surfaceTiles/plan/subsystems/planSurfaceTiles.test.ts`

**Interfaces (produces):**

```ts
export type TileRead =
  | { readonly kind: 'bytes'; readonly bytes: Uint8Array<ArrayBuffer> }
  | { readonly kind: 'empty' } // a zero-length index entry: baked, and deliberately nothing
  | { readonly kind: 'missing' } // not in the index
  | { readonly kind: 'failed' }; // non-206, short body, timeout, network error

// SurfaceTileSource
readonly readTile: (tile: SurfaceTileId) => Promise<TileRead>;
// SurfaceTileLaneSpec.fetch
(tile: SurfaceTileId, source: SurfaceTileSource) => Promise<SurfaceTilePayload | 'empty' | null>;
// SurfaceTileResidency, new member
isEmpty(tile: SurfaceTileId): boolean;
```

Rules:
- A zero-length entry answers `'empty'` **without a fetch** (a `Range: bytes=o-(o-1)` request is invalid).
- The lane fetchers decode `'bytes'`, pass `'empty'` through, and map `'missing'`/`'failed'` to `null`,
  so today's session-long failure rule (`tileStreamSubsystem.ts:94-95`) is unchanged.
- On `'empty'` the lane records the key in its own `empty` set and uploads nothing. The generic
  `tileStreamSubsystem` is untouched: `'empty'` is a non-null payload to it.
- `planSurfaceTiles` skips an empty tile before the `hasFailed` line: not touched, not requested, not
  a miss. Its slot is never touched again, so LRU reclaims it. No slot-release API is added.
- Albedo, height and night never produce `'empty'` (no zero-byte files exist), so nothing visible
  changes.

- [ ] Tests in `createArchiveTileSource.test.ts`: `zero-length entry reads empty without fetching`
      (assert `{ kind: 'empty' }` and zero `fetch` calls), `key absent from the index reads missing`,
      `a 404 reads failed`, `an aborted fetch reads failed`, `a short body reads failed`. Existing
      byte-read tests move to `{ kind: 'bytes' }`.
- [ ] Test in `packSurfaceTileLevels.test.ts`: `a zero-byte tile file packs as a zero-length entry`
      (the packer already sizes by `statSync` at `packSurfaceTileLevels.ts:49`; this pins it, no
      packer change).
- [ ] Test in `planSurfaceTiles.test.ts`: `an empty tile is neither touched, requested nor counted a
      miss` (a stub residency whose `isEmpty` is true for one requested tile).
- [ ] Implement; `npm test -- createArchiveTileSource packSurfaceTileLevels planSurfaceTiles surfaceTileStream` passes.
- [ ] Commit: `refactor(surface-tiles): tile reads say bytes, empty, missing or failed`.

---

### Task 2: lane rows carry role, binding and reserved slots

**Files:**
- Modify: `src/layers/body/surfaceTiles/stream/@types/SurfaceTileLaneSpec.d.ts`,
  `src/layers/body/surfaceTiles/stream/data/surfaceTileLaneSpecs.ts`,
  `src/layers/body/surfaceTiles/plan/subsystems/derivePlannerParams.ts:41-58`,
  `src/layers/body/surfaceTiles/patch/@types/SurfaceTileDrawArgs.d.ts`,
  `src/layers/body/surfaceTiles/patch/render/surfaceTileRenderer.ts:86-111, 315-337`,
  `src/layers/body/surfaceTiles/patch/passes/surfaceTilesPass.ts:39-43, 70-74, 108-112`,
  `src/layers/body/surfaceTiles/patch/render/surfaceTileShaderVariants.ts` (comment only),
  the `nightLights` effect type that carries `atlasView` today (find it from
  `surfaceTileRenderer.ts:321`), `src/@types/rendering/TextureAtlasConfig.d.ts` or the atlas
  creation site in `surfaceTileStream.ts` (for `reservedSlots`)
- Test: `tests/layers/body/surfaceTiles/plan/subsystems/derivePlannerParams.test.ts`,
  `tests/layers/body/surfaceTiles/stream/subsystems/surfaceTileStream.test.ts`

**Interfaces (produces):**

```ts
// SurfaceTileLaneSpec gains
readonly role: 'gates-cut' | 'standalone';
readonly binding: number;        // the tile pipeline's @binding for this product's atlas
readonly reservedSlots?: number; // slots [0, n) never allocated to a tile; default 0

// SurfaceTileDrawArgs: surfaceAtlasView + heightAtlasView + nightLights.atlasView become
readonly atlasViews: Readonly<Record<SurfaceTileProduct, GPUTextureView>>;
```

Row values: `albedo` `gates-cut`, binding 5 · `height` `gates-cut`, binding 2 · `night`
`standalone`, binding 10.

Rules:
- `derivePlannerParams`: a `gates-cut` product requests in the bands where **every** gates-cut product
  is built (today's albedo-and-height line); a `standalone` product requests in the bands where its
  own `builtFrom` exists (today's night line). Iterate `SURFACE_TILE_PRODUCTS`; no product named.
- The renderer builds the atlas entries from the rows: each product's `binding` → `atlasViews[product]`,
  kept only where the variant's binding list (or the shared vertex list, for height's 2) names it.
  Binding visibility stays as today.
- The pass fills `atlasViews` completely, with each product's fallback: night falls back to
  `earthRenderer.getMapView('night')`, as at `surfaceTilesPass.ts:72-73`. The draw is still skipped
  when albedo or height has no atlas (`:39-43`).
- `reservedSlots` is plumbed to the slot pool so slots `[0, n)` are never handed out; every
  existing row leaves it unset.
- A deeper level cap is not a row field: a standalone product's cap is its bands' deepest `max`
  (Task 3).

- [ ] Shoot the baseline set (Strategy table), including the two authored hashes.
- [ ] Test in `derivePlannerParams.test.ts`: `a standalone product requests only in bands that
      build it` (a band with albedo+height but no night: night's `requestBands` excludes it,
      albedo's includes it) and `gates-cut products request only where all gating products are
      built`. Existing tests stay green unchanged.
- [ ] Test in `surfaceTileStream.test.ts`: `a lane never allocates its reserved slots` (a test lane
      spec with `reservedSlots: 1`: no allocation returns slot 0).
- [ ] Implement; targeted tests pass; `npm run typecheck:fast` clean.
- [ ] Re-shoot the set; every pair matches.
- [ ] Commit: `refactor(surface-tiles): lane rows carry role, binding and reserved slots`.

---

### Task 3: one resolver for standalone products

**Files:**
- Create: `src/layers/body/surfaceTiles/plan/@types/StandaloneProduct.d.ts`,
  `src/layers/body/surfaceTiles/plan/@types/StandaloneRect.d.ts`,
  `src/layers/body/surfaceTiles/plan/subsystems/resolveStandaloneRect.ts`
- Modify: `src/layers/body/surfaceTiles/plan/@types/SurfaceCutTile.d.ts:29-31`,
  `src/layers/body/surfaceTiles/plan/subsystems/cutSurfaceTiles.ts:113-116, 326-338` and the
  leaf construction that sets `night`, `src/layers/body/surfaceTiles/patch/render/surfaceTileRenderer.ts`
  (the instance packing that reads `tile.night`, near `:247-287`), and every other reader of
  `.night` on a cut tile (`git grep -nE "\.night\b" -- src/layers/body/surfaceTiles`)
- Test: `tests/layers/body/surfaceTiles/plan/subsystems/resolveStandaloneRect.test.ts` (create),
  `tests/layers/body/surfaceTiles/plan/subsystems/cutSurfaceTiles.test.ts`

**Interfaces (produces):**

```ts
export type StandaloneProduct = Exclude<
  SurfaceTileProduct,
  /* the gates-cut products */ 'albedo' | 'height'
>; // derive it from the lane rows' `role` if the type system allows; else this literal, with a
//    compile-time check against SURFACE_TILE_LANE_SPECS

export type StandaloneRect =
  | Pick<ResolvedTileResidency, 'atlasUvOrigin' | 'atlasUvScale'>
  | 'empty' // the walk met an empty tile: the product's sentinel
  | null; // nothing resident, or the product has no bands

export function resolveStandaloneRect(input: {
  readonly product: StandaloneProduct;
  readonly z: number;
  readonly x: number;
  readonly y: number;
  readonly maxLevel: number; // the deepest max of the product's request bands; < 0 → null
  readonly baseLevel: number;
  readonly residentSlot: (tile: SurfaceTileId) => ResidentLookupResult;
  readonly isEmpty: (tile: SurfaceTileId) => boolean;
}): StandaloneRect;

// SurfaceCutTile: `night` becomes
readonly standalone: Readonly<Record<StandaloneProduct, StandaloneRect>>;
```

Rules: the walk starts at `min(z, maxLevel)` and climbs as `nightOf` does today
(`cutSurfaceTiles.ts:326-338`); an empty tile met at any level **stops the walk** with `'empty'`,
even when a coarser ancestor is resident; a resident tile gives its flattened sub-rect
(`flattenAtlasRect`). Night never meets `'empty'`, so the renderer still maps `null` → `NO_NIGHT_RECT`.
`cutSurfaceTiles`' input gains `isEmpty` beside `residentSlot`; `planSurfaceTiles` passes
`residency.isEmpty` (or `() => false` for a non-engaged body, as it does for `residentSlot`).

- [ ] Tests in `resolveStandaloneRect.test.ts`: `an own empty tile stops at empty even with a
      resident ancestor`; `an empty ancestor stops the walk at empty`; `a resident ancestor gives
      the flattened sub-rect` (assert origin/scale for a leaf two levels below); `the walk starts at
      maxLevel`; `maxLevel < 0 gives null`.
- [ ] `cutSurfaceTiles.test.ts`: the night assertions move to `standalone.night`; no new test.
- [ ] Implement; targeted tests pass; typecheck clean.
- [ ] Re-shoot the set; every pair matches.
- [ ] Commit: `refactor(surface-tiles): one resolver for standalone products`.

---

### Task 4: one surface-light helper

`review: yes` (shaders)

**Files:**
- Create: `src/services/gpu/shaders/lib/surfaceLight.wesl`
- Modify: `src/services/gpu/shaders/bodies/surfaceTile/fragmentBare.wesl:36`,
  `src/services/gpu/shaders/bodies/surfaceTile/fragmentEarth.wesl:71`,
  `src/services/gpu/shaders/bodies/earth/fragment.wesl:136` (and its header formula at `:15`),
  `src/services/gpu/shaders/lib/bodyLighting.wesl:34-39`,
  `src/services/gpu/shaders/bodies/texturedBody/fragment.wesl:120-127`
- Test: none new. A WGSL helper of one line has no failure mode the shots miss; the neutrality
  shots are the check.

**Interfaces (produces):**

```wgsl
// lib/surfaceLight.wesl
fn composeSurfaceLight(directLit: vec3<f32>, ambientLit: vec3<f32>,
                       sunVisibility: f32, skyVisibility: f32) -> vec3<f32>
// = directLit * sunVisibility + ambientLit * skyVisibility

// lib/bodyLighting.wesl gains (AMBIENT keeps its name: eight comments cite it;
// litShade stays, = AMBIENT + bodyDirectShade(n, l))
fn bodyDirectShade(normalLocal: vec3<f32>, sunDirLocal: vec3<f32>) -> f32 // (1 - AMBIENT) * lambert
```

Rules:
- The three tile/Earth lines become `composeSurfaceLight(direct * uniforms.sunIrradiance,
  uniforms.ambientLight * <albedo>, 1.0, 1.0)`. Cloud shadow keeps dimming `direct` first, as today.
- `texturedBody`: `colour = composeSurfaceLight(albedo * bodyDirectShade(n, sunDir) * limb,
  albedo * AMBIENT * limb, sunVis, 1.0)`, where `sunVis` is today's ring visibility, now passed
  as the visibility argument instead of scaling `sunDirLocal` (same product, since Lambert is linear
  in the light vector's length).
- `planet/fragment.wesl:54` keeps calling `litShade`; nothing else moves.
- Load the `wesl-shaders` skill before editing; check every `import package::lib::…` resolves.

- [ ] Implement; `npm run typecheck:fast` and `npm test -- weslStaticPlugin weslNames` pass.
- [ ] Re-shoot the set; every pair within one step (the Saturn shot proves the ring term moved intact).
- [ ] Commit: `refactor(shaders): one composeSurfaceLight; texturedBody splits ambient`.

---

## Review Focus

- **An empty read must never become a failure.** A reviewer should check that `'empty'` never
  reaches `failedKeys` and is never refetched (Task 1's planner test).
- **The night fallback moved.** Earth's tile night atlas still falls back to the global night map
  when no night tile is resident (Task 2's `everest` shot at night side, plus the code path).
- **Bindings per variant.** A binding the variant does not declare must not be in the bind group
  (WebGPU rejects extra entries); Task 2's shots on both variants (`copernicus`, `everest`) cover it.
- **Ring shadow on `texturedBody`.** Task 4 moves the ring term; the `saturn` shot covers it.
- **`StandaloneProduct` drift.** Adding a product must force a decision on its role; Task 3's
  compile-time check covers it.

## Definition of Done

- **Deliverables:** `TileRead`, `SurfaceTileResidency.isEmpty`, lane rows with `role`/`binding`/
  `reservedSlots?`, `SurfaceTileDrawArgs.atlasViews`, `resolveStandaloneRect`,
  `SurfaceCutTile.standalone`, `lib/surfaceLight.wesl` (`composeSurfaceLight`),
  `bodyDirectShade`.
- **Observable:** the six neutrality pairs match (within one step); Earth night lights on tiles at
  the night side; Saturn's ring shadow on its disc.
- **Deferred:** everything horizon (the feature PR); no slot-release API; the albedo-only debug rows
  and the effect-combo shader variants (backlogged).
