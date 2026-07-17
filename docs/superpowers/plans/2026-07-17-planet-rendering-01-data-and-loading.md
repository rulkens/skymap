# Planet rendering — Plan 01: data model + texture loading

**Spec:** `docs/superpowers/specs/2026-07-17-planet-rendering.md` — this plan
executes §4 (data-model tables), §5 (keyed `bodyTextures` slot family), §6.1
(`composeBodyMvp` grows `T·R·S`), and the §7 Earth-texture-path deletion.
**Sequencing:** first of three plans on one branch/PR
(`…-02-renderers-and-shaders`, `…-03-tools-and-pipeline` follow). Each plan is
independently landable with the suite green after every task.
**Ground preparation:** already implemented + committed (spec §2). This plan
builds on the two-way demand system — `AssetSlot.release()` + `onRelease`
(`@types/loading/AssetSlot.d.ts`), `AssetWiringRow.release?` +
`reevaluateDemand`'s evict edge (`reevaluateDemand.ts:74-88`),
`DemandCtx.cameraPosMpc` (`@types/loading/DemandCtx.d.ts` surface 5) — as
existing seams. No prep tasks.
**Plan style (OVERRIDES upstream `writing-plans`):**
`docs/superpowers/conventions/plan-style.md` — **contract code yes,
implementation code no.** Cite `path:line`, never paste function bodies. Test
names + assertions ARE the acceptance criteria.

## Goal

Grow the body-metadata tables and the texture-loading rail so the renderers in
Plan 02 have (a) a baked `orientation` `Mat3` on every body, (b) the
`BODY_TEXTURE_REGISTRY` / `ROTATION_ELEMENTS` / `SCENE_RINGS` authored tables,
and (c) a keyed, proximity-demanded-and-released `bodyTextures` asset-slot
family that replaces Earth's bespoke single-texture path. No shader or renderer
behaviour changes: `composeBodyMvp` gains the rotation factor but a flat-albedo
sphere is rotation-invariant and Earth's texture is a placeholder until Plan 03,
so this plan is visually identity-safe (spec §6.1).

## Global constraints (house rules — override defaults)

- **Contract code yes, implementation code no.** Pin signatures + test names +
  byte tables; no function bodies.
- **One `type` per file** in `src/@types/`, **one function per file** in
  `src/utils/` — filename = exported symbol. Deep relative imports, no barrels.
- **`type` aliases, never `interface`.**
- **`Vec3`/`Vec2`/`Mat3` aliases** (`src/@types/math/`), never raw tuples.
- **Didactic, timeless comments** — explain _why_ + the alternative; no dates /
  PR refs / history in code comments.
- **Raw-data paths via `rawDataPath()`** — never a literal `data/raw/...` string
  (no raw paths appear in this plan; the rule binds Plan 03).
- **Tests mirror the src tree**; judge every test by `testing.md`'s one question.
  No mirror tests (never build the expected value with the source's own
  formula), no constant/registry restatements, no clamp-boundary tests.
- **Suite stays green** at every task; the final task gates on `npm run
  typecheck` (both tsconfigs) + `npm test`.

---

## Task 1 — `rotationFromIau` + `RotationElements` type + `identityMat3`

**Files:** `src/@types/scene/RotationElements.d.ts` (new),
`src/utils/orbit/rotationFromIau.ts` (new), `src/utils/math/identityMat3.ts`
(new), `tests/utils/orbit/rotationFromIau.test.ts` (new).

**Type (match exactly — spec §4.1):**

```ts
// RotationElements.d.ts   (one type per file)
export type RotationElements = {
  readonly id: string;
  readonly poleRaDeg: number;   // IAU north-pole right ascension, J2000
  readonly poleDecDeg: number;  // IAU north-pole declination, J2000
  readonly primeMeridianDeg: number; // W0 at J2000 epoch
};
```

**Signatures (match exactly):**

```ts
// rotationFromIau.ts   — local body-fixed frame → equatorial world frame
export function rotationFromIau(el: RotationElements): Mat3;
// identityMat3.ts       — shared identity, not re-spelled per caller
export const IDENTITY_MAT3: Readonly<Mat3>;
```

**Behaviour:** `rotationFromIau` builds `R = Rz(90°+α)·Rx(90°−δ)·Rz(W₀)` (spec
§4.1), returning a column-major `Mat3` (`@types/math/Mat3.d.ts` — 9 elements,
`m[c*3+r]`). Pure. `IDENTITY_MAT3` is the flat-body / emissive-body "no facing
modelled" value.

- [x] Add `RotationElements.d.ts` — one `type`, didactic docblock (IAU/WGCCRE
  J2000 mean elements; `Ẇ` rate omitted = the named static-scene clock extension
  point, spec §4.1).
- [x] Add `identityMat3.ts` — the shared `IDENTITY_MAT3` const.
- [x] Add `rotationFromIau.ts`. Didactic docblock: WHY the `Rz·Rx·Rz` composition
  (IAU convention maps a body-fixed frame to the equatorial world frame), WHY a
  baked `Mat3` (composed once per body, so the shader stays a matrix multiply).
- [x] Test `rotationFromIau puts the pole on +z for (α=0, δ=90)` — `poleRaDeg=0,
  poleDecDeg=90, primeMeridianDeg=0`: assert the matrix maps local `+z` (the body
  pole) to world `+z` within tolerance (hand-derived: a pole at the equatorial
  north pole is already `+z`).
- [x] Test `rotationFromIau rotates the prime meridian by W0` — same pole,
  `primeMeridianDeg=90`: assert the local prime-meridian direction (local `+x`)
  maps to world `+y` within tolerance (a 90° W₀ about the pole).
  _(Executed with a correction: at this polar configuration W₀=90 yields +x→−x —
  the +y expectation was an authoring slip; the test asserts +x→+y at W₀=0 and
  +x→−x at W₀=90, per the spec §4.1 formula whose +90° azimuth offset the Saturn
  frame invariant depends on.)_
- [x] `npm test -- rotationFromIau` → green. Commit.

## Task 2 — `ROTATION_ELEMENTS` table + `rotationById`

**Files:** `src/data/bodies/rotationElements.ts` (new),
`tests/data/bodies/rotationElements.test.ts` (new).

**Signatures (match exactly — spec §4.1):**

```ts
export const ROTATION_ELEMENTS: readonly RotationElements[];  // the 13 textured bodies
export function rotationById(id: string): RotationElements;   // findByIdOrThrow wrapper
```

Author the IAU/WGCCRE J2000 pole (RA/Dec) + W₀ for the 13 textured bodies
(Mercury–Neptune, Earth, Moon, Io, Europa, Ganymede, Callisto — spec §3), in the
same human-units + `findByIdOrThrow`-lookup style as `orbitalElements.ts`
(`elementsById` at `src/data/bodies/orbitalElements.ts`). Saturn's pole MUST be
`(α=40.589°, δ=83.537°)` — the exact pole `SATURN_EQUATORIAL_FRAME`
(`orbitPlaneFrames.ts:82`) is built from, so rings + Saturn's moons share one
equatorial frame (spec §4.1, Q9).

- [x] Add `rotationElements.ts` — the 13-row table + `rotationById`. Didactic
  docblock: only the textured bodies need rotation (a flat sphere is
  rotation-invariant); the JPL/WGCCRE provenance; that Saturn's pole is shared
  with `SATURN_EQUATORIAL_FRAME`.
- [x] Test `ROTATION_ELEMENTS has valid structure` — the load-bearing invariants
  only (per `testing.md`, NOT a value restatement): every `id` unique; length 13;
  each `poleDecDeg` in `[-90, 90]`.
- [x] Test `Saturn's rotation pole equals SATURN_EQUATORIAL_FRAME.normal` —
  build the pole unit vector from Saturn's `poleRaDeg`/`poleDecDeg` and assert it
  equals `SATURN_EQUATORIAL_FRAME.normal` within tolerance (the rings/moons
  shared-frame invariant, spec §4.1/§10 — a real cross-table contract, not a
  self-restatement).
- [x] `npm test -- rotationElements` → green. Commit.

## Task 3 — `BodyTextureId` + `BodyTextureSpec` + `BODY_TEXTURE_REGISTRY`

**Files:** `src/@types/data/BodyTextureId.d.ts` (new),
`src/@types/data/RingTextureId.d.ts` (new),
`src/@types/scene/BodyTextureSpec.d.ts` (new),
`src/data/bodies/bodyTextureRegistry.ts` (new),
`tests/data/bodies/bodyTextureRegistry.test.ts` (new).

**Types (match exactly — spec §4.3):**

```ts
// BodyTextureId.d.ts   — registry-derived id union
export type BodyTextureId =
  | 'mercury' | 'venus' | 'earth' | 'mars' | 'jupiter' | 'saturn'
  | 'uranus'  | 'neptune' | 'moon' | 'io' | 'europa' | 'ganymede' | 'callisto';

// RingTextureId.d.ts
export type RingTextureId = 'saturn-ring';

// BodyTextureSpec.d.ts
export type BodyTextureSpec = {
  readonly bodyId: BodyTextureId;
  readonly maxTier: Tier;              // 'small'(2k) | 'medium'(4k) | 'large'(8k)
  readonly provenance: 'sss' | 'usgs' | 'nasa';
  readonly grayscaleTint?: Vec3;       // build-time tint for mono USGS sources
};
```

**Signatures (match exactly):**

```ts
export const BODY_TEXTURE_REGISTRY: Readonly<Record<BodyTextureId, BodyTextureSpec>>;
export function bodyTextureSpec(id: string): BodyTextureSpec | null; // registry lookup
```

`maxTier`: Uranus/Neptune → `'small'`; Venus → `'medium'`; every other →
`'large'` (spec §3/§4.3). `grayscaleTint` on Europa + Callisto only.
`provenance`: `sss` for the SSS planets + Moon; `nasa` for Earth; `usgs` for the
four Galilean moons.

- [x] Add the three `.d.ts` (one type each). `BodyTextureId` docblock: the
  registry-keyed union IS texture identity — a body is textured iff its id keys
  the registry (spec §4.2, no baked `textured` flag).
- [x] Add `bodyTextureRegistry.ts`. Didactic docblock: one table feeds three
  consumers (runtime tier clamp, build tier-set, fetch source-list); a new
  textured body is one row here + its raw-data entries.
- [x] Test `BODY_TEXTURE_REGISTRY structural invariants` — for every entry
  `spec.bodyId === key`; a `grayscaleTint` is present iff the body is Europa or
  Callisto (the mono-USGS-source contract, spec §3); `bodyTextureSpec('earth')`
  is non-null and `bodyTextureSpec('phobos')` is null. (Invariants, not a
  full-table `maxTier` restatement — the ceilings are exercised by Task 7's
  `clampTier` tests.)
- [x] `npm test -- bodyTextureRegistry` → green. Commit.

## Task 4 — `SCENE_RINGS` + `RingSpec` type

**Files:** `src/@types/scene/RingSpec.d.ts` (new),
`src/data/bodies/sceneRings.ts` (new),
`tests/data/bodies/sceneRings.test.ts` (new).

**Type (match exactly — spec §4.4):**

```ts
export type RingSpec = {
  readonly bodyId: BodyTextureId;   // 'saturn' — ring rides its body's orientation + position
  readonly innerRadiusKm: number;   // 74_500  (C-ring inner)
  readonly outerRadiusKm: number;   // 140_220 (A-ring outer)
  readonly textureId: RingTextureId; // 'saturn-ring'
};
```

```ts
export const SCENE_RINGS: readonly RingSpec[];   // just Saturn today
```

Radii stay in km (native unit), resolved to Mpc at draw time like `radiusKm`.
The ring reuses Saturn's baked `orientation` + `positionMpc` — no plane frame
stored here (spec §4.4: the ring plane IS the body's equatorial plane).

- [x] Add `RingSpec.d.ts` + `sceneRings.ts`. Didactic docblock: Saturn only
  (Uranus near-black, Jupiter gossamer — spec §8); no separate plane frame.
- [x] Test `SCENE_RINGS structural invariants` — Saturn's `bodyId` is a
  `BODY_TEXTURE_REGISTRY` key; `innerRadiusKm < outerRadiusKm`; `textureId ===
  'saturn-ring'`.
- [x] `npm test -- sceneRings` → green. Commit.

## Task 5 — Bake `orientation` onto `PlanetBody` / `EarthBody` in the makers

**Files:** `src/@types/scene/PlanetBody.d.ts` (modify — add `orientation`),
`src/@types/scene/EarthBody.d.ts` (modify — add `orientation`, DELETE
`textureUrl`), `src/data/bodies/makers/heliocentricPlanet.ts` (modify),
`src/data/bodies/makers/satelliteBody.ts` (modify),
`src/data/bodies/sceneEarth.ts` (modify),
`tests/data/bodies/scenePlanets.test.ts` + `tests/data/bodies/sceneBodies.test.ts`
(modify if present).

**Type change (match exactly — spec §4.2):**

```ts
// PlanetBody.d.ts  (add one field)
readonly orientation: Mat3;   // local → equatorial-world rotation, baked from ROTATION_ELEMENTS
// EarthBody.d.ts   (add orientation, DELETE textureUrl)
readonly orientation: Mat3;
//  readonly textureUrl: string;   ← removed (spec §7: Earth joins the R2 texture family)
```

**Behaviour:** each maker (`heliocentricPlanet`, `satelliteBody`, `sceneEarth`)
sets `orientation = rotationFromIau(rotationById(id))` when the id keys
`BODY_TEXTURE_REGISTRY`, else `IDENTITY_MAT3` (irregular moons + Titan are
rotation-invariant, so identity is the honest "no facing modelled" value — spec
§4.2). `BodySpec` is unchanged (orientation is derived by id, not authored).
`sceneEarth.ts` drops `textureUrl: '/images/earth/blue-marble-4k.jpg'`.

Use `bodyTextureSpec(id)` (Task 3) as the "is textured?" predicate so the maker
reads the registry, not a second list.

- [x] Add `orientation: Mat3` to `PlanetBody.d.ts`; add `orientation`, remove
  `textureUrl` from `EarthBody.d.ts`. Update the `EarthBody` docblock (Blue
  Marble now rides the `bodyTextures` family, not a per-body URL).
- [x] Update the three makers to bake `orientation` via the registry-keyed
  choice above. Didactic comment at the choice site: identity for
  non-registry bodies (rotation-invariant flat spheres).
  _(Executed with a shared `orientationForBody.ts` helper instead of a
  triplicated ternary — single choice site. `earthTextureFetcher` bridges on an
  inlined URL literal until Task 10 deletes it.)_
- [x] Test `scenePlanets bake IAU orientation for textured bodies` — Saturn's
  `orientation` equals `rotationFromIau(rotationById('saturn'))` (component-wise;
  this pins the maker wired the registry, not a formula mirror — the expectation
  comes from the authored table via the util, exercising the wiring), and
  Phobos's `orientation` equals `IDENTITY_MAT3` (an irregular moon gets identity).
- [x] Test `SCENE_EARTH carries a baked orientation and no textureUrl` — `SCENE_EARTH.orientation`
  equals `rotationFromIau(rotationById('earth'))`; `'textureUrl' in SCENE_EARTH === false`.
- [x] Delete any test asserting `SCENE_EARTH.textureUrl` (the removed field).
- [x] `npm test -- scenePlanets sceneBodies sceneEarth` → green. Commit.

## Task 6 — `composeBodyMvp` grows the `orientation` param (`T·R·S`) + all callers

**Files:** `src/utils/camera/composeBodyMvp.ts` (modify),
`tests/utils/camera/composeBodyMvp.test.ts` (new or modify),
`src/services/engine/frame/passes/earthLayer.ts` (modify),
`src/services/engine/frame/passes/planetsLayer.ts` (modify),
`src/services/engine/frame/passes/starSpheresLayer.ts` (modify),
their layer tests (modify).

**Signature (match exactly — spec §6.1):**

```ts
export function composeBodyMvp(
  foregroundVp: Float64Array,
  bodyPosMpc: Readonly<Vec3>,
  renderOrigin: Readonly<Vec3>,
  radiusMpc: number,
  orientation: Readonly<Mat3>,   // NEW — R, embedded in a mat4 between T and S
): Float32Array;
```

**Behaviour:** the f64 model becomes `T · R · S` (translate · rotate · scale),
`orientation` embedded as the rotation block of a `mat4d` between the existing
translate + scale (`composeBodyMvp.ts:69-76`). Everything else — the f64
compose-before-narrow seam — is unchanged. `Mat3` is column-major
(`Mat3.d.ts`); the embed must place columns correctly (a transposed embed would
mirror every textured body — verify with the round-trip test).

**Callers:** `earthLayer` / `planetsLayer` pass the body's baked `orientation`;
`starSpheresLayer` passes `IDENTITY_MAT3` (emissive, rotation-invariant — spec
§6.1). The flat planets now carry a real rotation in their MVP, but a solid
albedo sphere renders identically under rotation, so this is visually
identity-safe (spec §6.1); Earth's placeholder texture makes its rotation inert
until Plan 03.

- [x] Grow `composeBodyMvp`'s signature + the `T·R·S` compose. Didactic comment:
  WHY `R` sits between `T` and `S` (rotate the unit sphere, then scale, then
  translate — a column vector transforms `T·R·S·v`), and the column-major embed
  note. _(Embed is a hand-written mat4 rotation block — wgpu-matrix's mat3 is a
  padded 12-element layout incompatible with the tight 9-element `Mat3`.)_
- [x] Update `earthLayer` / `planetsLayer` to pass `body.orientation`;
  `starSpheresLayer` to pass `IDENTITY_MAT3`.
- [x] Test `composeBodyMvp with a non-identity orientation projects the rotated
  surface direction` — construct a simple f64 VP (`mat4d.perspective ∘
  mat4d.lookAt`) + a 90°-about-`+z` orientation; take a body-local `+x` surface
  point, project it through the returned MVP, and assert it lands where the
  independently-rotated world direction (local `+x` → world `+y`) projects (a
  round-trip against a constructed VP — the forward projection is computed
  independently of the util, so not a mirror; mirrors the `composeOrbitConic`
  test shape at `tests/utils/camera/composeOrbitConic.test.ts`). _(Confirmed to
  fail against the pre-change impl.)_
- [x] Test `composeBodyMvp with IDENTITY_MAT3 matches the pre-rotation MVP` — for
  identity orientation the output equals a fresh compose with no rotation
  (regression that the star-sphere path is unchanged; assert element-wise within
  f32 tolerance against a hand-built `T·S`-only reference VP·model, computed
  independently).
- [x] Update the three layer tests to pass the new argument (and assert
  `starSpheresLayer` forwards `IDENTITY_MAT3`, planets forward the body
  orientation).
- [x] `npm test -- composeBodyMvp earthLayer planetsLayer starSpheresLayer` →
  green. Commit.

## Task 7 — `BodyTextureReq` + `tierToTexturePx` + `clampTier`

**Files:** `src/@types/loading/BodyTextureReq.d.ts` (new),
`src/utils/math/tierToTexturePx.ts` (new), `src/utils/math/clampTier.ts` (new),
`tests/utils/math/tierToTexturePx.test.ts` (new),
`tests/utils/math/clampTier.test.ts` (new).

**Types / signatures (match exactly — spec §5):**

```ts
// BodyTextureReq.d.ts
export type BodyTextureReq = { readonly bodyId: BodyTextureId; readonly tier: Tier };

// tierToTexturePx.ts   — small→2048, medium→4096, large→8192
export function tierToTexturePx(tier: Tier): number;

// clampTier.ts         — min under the small < medium < large order
export function clampTier(tier: Tier, ceiling: Tier): Tier;
```

- [x] Add `BodyTextureReq.d.ts` (one type).
- [x] Add `tierToTexturePx.ts` + `clampTier.ts`. Didactic docblocks: the tier →
  pixel mapping is the fetch filename contract; `clampTier` never upscales.
- [x] Test `tierToTexturePx maps each tier` — `small→2048, medium→4096,
  large→8192` (hand values — the on-disk filename contract).
- [x] Test `clampTier caps to the ceiling` — `clampTier('large', 'small') ===
  'small'` (Uranus ceiling) and `clampTier('small', 'large') === 'small'` (never
  upscales). These are NOT clamp-boundary tests — `small`/`large` are
  observationally distinct on either side of the cap.
- [x] `npm test -- tierToTexturePx clampTier` → green. Commit.

## Task 8 — `bodyTextureFetcher`

**Files:** `src/services/loading/fetchers/bodyTextureFetcher.ts` (new),
`tests/services/loading/fetchers/bodyTextureFetcher.test.ts` (new).

**Signature (match exactly — spec §5.2):**

```ts
export const bodyTextureFetcher: Fetcher<ImageBitmap, BodyTextureReq>;
//  body:  fetch(dataUrl(`images/textures/${bodyId}-${tierToTexturePx(tier)}.jpg`))
//  ring:  fetch(dataUrl(`images/textures/saturn-ring-${tierToTexturePx(tier)}.png`))  (PNG for alpha)
//     → createImageBitmap(await res.blob())
```

Mirrors `earthTextureFetcher.ts` (the fetcher being deleted in Task 10): threads
the slot's `AbortSignal`, throws on non-ok. `dataUrl` resolves under
`VITE_DATA_BASE_URL` (R2 in prod, `public/data/` in dev). The ring request
(`bodyId: 'saturn-ring'`) fetches the `.png`; every other id fetches `.jpg`.

- [x] Add `bodyTextureFetcher.ts`. Didactic docblock: tier-sized filename via
  `tierToTexturePx`; PNG-for-alpha only on the ring strip; silent-optional-asset
  posture (a 404 flows to the slot's `error` state, renderer keeps its
  placeholder — same as `earthTextureFetcher`).
  _(BodyTextureReq.bodyId widened to `BodyTextureId | RingTextureId` so the ring
  request typechecks — matches Task 10's family Map keys.)_
- [x] Test `bodyTextureFetcher requests the tier-sized JPG url` — stub
  `globalThis.fetch` (returning a blob + a stubbed `createImageBitmap`); call
  with `{ bodyId: 'mars', tier: 'small' }`; assert the fetched URL ends with
  `images/textures/mars-2048.jpg`. (Behaviour through the public surface — the
  filename contract, not a source grep.)
- [x] Test `bodyTextureFetcher requests the ring PNG` — `{ bodyId: 'saturn-ring',
  tier: 'large' }` → URL ends with `images/textures/saturn-ring-8192.png`.
- [x] `npm test -- bodyTextureFetcher` → green. Commit.

## Task 9 — `bodyTextureLoadRadius`

**Files:** `src/services/engine/frame/bodyTextureLoadRadius.ts` (new),
`tests/services/engine/frame/bodyTextureLoadRadius.test.ts` (new).

**Signature (match exactly — spec §5.3):**

```ts
export function loadRadiusMpc(id: BodyTextureId): number;
```

**Behaviour:** `radiusKm · KM_TO_MPC · LOAD_RADIUS_BODY_RADII` for the body's
`SCENE_BODIES` radius — a bigger body starts loading from farther out. Derived
from `SCENE_BODIES` (so a moved/added body carries its own radius; the
`FOREGROUND_MAX_DISTANCE_MPC` precedent), with a single generous
`LOAD_RADIUS_BODY_RADII` const (fetch of an 8 k JPG needs descent lead time —
the deleted `EARTH_TEXTURE_MAX_DISTANCE_MPC` argument, now per-body).

- [ ] Add `bodyTextureLoadRadius.ts` — `loadRadiusMpc` + the
  `LOAD_RADIUS_BODY_RADII` const. Didactic docblock: derived per-body from the
  body radius (not a hand-typed literal); WHY generous (descent lead time).
- [ ] Test `loadRadiusMpc scales with body radius` — `loadRadiusMpc('jupiter') >
  loadRadiusMpc('mercury')` (a monotonic property vs the seeded radii, not a
  value pin), and both are positive + finite.
- [ ] `npm test -- bodyTextureLoadRadius` → green. Commit.

## Task 10 — Keyed `bodyTextures` slot family: mint, demand, release; delete Earth's path

**Files:**
`src/@types/engine/state/EngineAssetSlots.d.ts` (modify — add the family Map),
`src/@types/loading/AssetKey.d.ts` (modify — union the family keys),
`src/services/engine/wiring/slotFor.ts` (modify — route family keys),
`src/services/engine/wiring/bodyTextureSlotRegistry.ts` (new — mint + commit
dispatch), `src/services/engine/phases/initGpu.ts` (modify — mint the family),
`src/services/engine/wiring/assetWiring.ts` (modify — add `bodyTextureRow`
family, DELETE the `earthTexture` row + import),
`src/services/engine/wiring/reevaluateDemand.ts` (modify — stale-tier release for
the family), `src/services/engine/engine.ts` (modify — remove earthTexture
seed/teardown if present),
**deletions (grep-gated):** `src/services/loading/slots/earthTextureSlot.ts`,
`src/services/loading/fetchers/earthTextureFetcher.ts`,
`public/images/earth/blue-marble-4k.jpg`;
**tests:** `tests/services/engine/wiring/bodyTextureSlotRegistry.test.ts` (new),
`tests/services/engine/wiring/assetWiring.test.ts` /
`reevaluateDemand.test.ts` (modify), `tests/services/engine/phases/initGpu.destroyReachability.test.ts`
(modify).

**State shape (match exactly — spec §5):**

```ts
// EngineAssetSlots grows a keyed family (mirrors `.points`):
bodyTextures: Map<BodyTextureId | RingTextureId, AssetSlot<ImageBitmap, BodyTextureReq>>;

// AssetKey unions the family keys so a wiring row's `key` routes through slotFor:
//   | BodyTextureId | RingTextureId
```

**Wiring row (match exactly — spec §5.3), generated per body/ring, mirroring
`pointRow` (`assetWiring.ts:110-124`):**

```ts
function bodyTextureRow(id: BodyTextureId | RingTextureId): AssetWiringRow {
  return {
    key: id,
    built: 'external',                         // minted in initGpu, like point rows
    factory: externalFactory,
    req: (tier) => ({ bodyId: id, tier: clampTier(tier, ceilingOf(id)) }),
    demand:  (ctx) => distanceMpc(ctx.cameraPosMpc, bodyPosOf(id)) < loadRadiusMpc(id),
    release: (ctx) => distanceMpc(ctx.cameraPosMpc, bodyPosOf(id)) > 2 * loadRadiusMpc(id),
  };
}
```

- `bodyPosOf(id)` reads the body's `positionMpc` from `SCENE_BODIES` (the
  ring uses Saturn's position). `ceilingOf(id)` is `BODY_TEXTURE_REGISTRY`'s
  `maxTier` (the ring uses Saturn's).
- **Hysteresis** is why `release` is separate from `!demand` (load inside
  `loadRadius`, evict outside `2·loadRadius` — spec §5.3, `AssetWiringRow`
  docblock). `release` → `slot.release()` → the `onRelease` hook drops the GPU
  texture.

**Minting + commit dispatch (`bodyTextureSlotRegistry.ts`, mirroring
`wireGalaxyCatalogSourceSlot` in `galaxyCatalogSourceRegistry.ts`):** one
`createAssetSlot<ImageBitmap, BodyTextureReq>` per `BodyTextureId` + the ring
key, written into `state.assetSlots.bodyTextures`, each with a `commit` that
dispatches by key and an `onRelease` that frees the committed texture. **In this
plan the only resident commit target is `earthRenderer.setTexture` (key
`'earth'`); every other key's commit is a documented no-op until Plan 02 adds
`texturedBodyRenderer` / `ringRenderer`.** Commit re-checks the renderer handle
for null (destroy race), same posture as `wireGalaxyCatalogSourceSlot`.

**Stale-tier release (`reevaluateDemand.ts`, spec §5.4):** the `bodyTextures`
family gets one extra evict condition in the demand loop — a `ready` slot whose
last-committed request tier ≠ `req(state.tier).tier` is `slot.release()`d and
re-demands at the new (clamped) tier on next approach. This lives in the loop
where `slotFor(state, key)` + `state.tier` are already in hand (a
`release: (ctx)=>boolean` can't see the slot); it is the SAME `slot.release()` →
idle → re-demand machinery as the distance edge, not a second mechanism (spec
§5.4).

**Deletions:** `earthTextureSlot.ts`, `earthTextureFetcher.ts`, the
`earthTexture` `ASSET_WIRING` row + its import + `EARTH_TEXTURE_MAX_DISTANCE_MPC`,
the `earthTexture` field on `EngineAssetSlots`, the `'earthTexture'` member of
`AssetKey`, and the committed `public/images/earth/blue-marble-4k.jpg`. Earth now
loads through the family as key `'earth'`.

- [ ] Add `bodyTextures` to `EngineAssetSlots.d.ts` (docblock: keyed family
  mirroring `.points`, per-body proximity-gated + released); union the family
  keys into `AssetKey.d.ts` (docblock: the asset set widens with the body
  textures); route family keys in `slotFor.ts` to
  `state.assetSlots.bodyTextures.get(key)`.
- [ ] Add `bodyTextureSlotRegistry.ts` (mint + per-key commit dispatch +
  `onRelease`), mint the family in `initGpu.ts` beside the foreground renderers.
  Didactic module header: mirrors `wireGalaxyCatalogSourceSlot`; commit routes
  `'earth'` now, other keys extend in Plan 02.
- [ ] Add the `bodyTextureRow` family (`...ALL_BODY_TEXTURE_KEYS.map(bodyTextureRow)`)
  to `ASSET_WIRING`; DELETE the `earthTexture` row + import +
  `EARTH_TEXTURE_MAX_DISTANCE_MPC`.
- [ ] Add the `bodyTextures` stale-tier release condition to
  `reevaluateDemand.ts` (documented as one release concept with the distance
  edge, spec §5.4).
- [ ] Delete `earthTextureSlot.ts`, `earthTextureFetcher.ts`, the `earthTexture`
  `EngineAssetSlots` field + `AssetKey` member, and
  `public/images/earth/blue-marble-4k.jpg`; remove any `engine.ts` seed/teardown
  of the old slot.
- [ ] Test `bodyTextureRow demand/release encodes hysteresis` — with a stub
  `DemandCtx` whose `cameraPosMpc` sits (a) inside `loadRadiusMpc(id)` → `demand`
  true, `release` false; (b) between `loadRadius` and `2·loadRadius` → BOTH false
  (the gap `!demand` could not encode); (c) beyond `2·loadRadius` → `demand`
  false, `release` true. Hand-place the camera relative to a known body position.
- [ ] Test `bodyTextureSlotRegistry mints one slot per textured body + the ring`
  — after minting, `state.assetSlots.bodyTextures` has a slot for every
  `BodyTextureId` and `'saturn-ring'`; the `'earth'` slot's commit calls
  `earthRenderer.setTexture` (spy renderer). Structural, no pipeline restatement.
- [ ] Test `reevaluateDemand releases a stale-tier bodyTextures slot` — a `ready`
  slot committed at `medium` with `state.tier === 'small'` (whose clamped `req`
  tier differs) is released; a slot whose committed tier already matches is left
  alone.
- [ ] **Grep gate — no references left:** a repo search for `earthTextureSlot`,
  `earthTextureFetcher`, `EARTH_TEXTURE_MAX_DISTANCE_MPC`, and `.textureUrl`
  returns ZERO hits outside this plan/spec (spec §12). (Main thread runs the
  search — `feedback_bg_subagents_no_npm`.)
- [ ] `npm test -- bodyTextureSlotRegistry assetWiring reevaluateDemand initGpu`
  → green. Commit.

## Task 11 — Full gate

**Files:** none new — the plan-01 gate.

- [ ] `npm run typecheck` (both src + tools tsconfigs) → clean (proves nothing
  imports a deleted Earth-texture symbol).
- [ ] `npm test` (full suite) → green.
- [ ] Commit.

---

## Self-review

### Spec-coverage map

| Spec section | Task(s) |
|---|---|
| §4.1 rotation elements + `rotationFromIau` | T1, T2 |
| §4.2 body `orientation` baked; Earth loses `textureUrl` | T5 |
| §4.3 `BODY_TEXTURE_REGISTRY` + ids | T3 |
| §4.4 `SCENE_RINGS` | T4 |
| §5 keyed `bodyTextures` family, demand + release + tier clamp | T7, T8, T9, T10 |
| §5.4 stale-tier release edge | T10 |
| §6.1 `composeBodyMvp` `T·R·S` + callers | T6 |
| §7 Earth texture-path deletion | T10 |

### Deferred to Plan 02 (called out so no dangling reference lands here)

The `bodyTextureSlotRegistry` commit dispatch routes only `'earth'` in this
plan; `texturedBodyRenderer` / `ringRenderer` commit targets + mip generation
arrive in Plan 02, which extends the same dispatch (§5.1). Non-Earth textures
demanded before Plan 03's assets exist error harmlessly to the slot's `error`
state (the silent-optional-asset posture).

### Placeholder scan

None. Every task has concrete files, signatures/byte-tables, and test names.
