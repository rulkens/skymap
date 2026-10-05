# The `starCatalog` Layer — design spec

Decisions ledger: [`docs/grill-sessions/star-catalog-layer-2026-09-21.md`](../../grill-sessions/star-catalog-layer-2026-09-21.md) (Q1–Q12 plus the refactor-ground checkpoint, signed off 2026-09-21). This spec does not re-litigate those calls; it specifies how they land in code. Cited below as "grill Qn".

Parent: [`2026-09-09-layer-composition-design.md`](2026-09-09-layer-composition-design.md), step (e) of §10, the last stub Layer. This is an addendum to that spec: everything it says about the `Layer` contract, `createLayers`, facts, selection rows and focus ids holds here unless a section below says otherwise. One parent decision is reversed (D6'3, §7 below) and one contract member is replaced (`labels` → `guides`, §2.4).

## 1. What this is

`src/layers/starCatalog/` is formed from its settings-only stub and takes ownership of **every star in the scene**: the Gaia survey (`gaiaStars`, tiered octree bins) and the three seeded catalogs — the famous-star map (`famousStar`), the Sun (`sun`) and the Sgr A\* S-stars (`sStar`). Today those seeded stars are declared, drawn, captioned, picked and carded through body-domain code; after this spec they are stars in the code as they are in the sky (grill Q1, Q5, Q8).

Three things change beyond a move:

- **Identity.** A picked or deep-linked seeded star is a star, not a body: one `starCatalog` `SelectionRef` arm for all four sources, one `StarDetailCard`, one `star-` URL prefix (grill Q5, Q8a, Q9, Q10).
- **Orbit trails become generic core machinery that Layers feed** through a new `Layer.guides` contract member that also absorbs `labels` (grill Q4, Q6, Q7). The S-star conics are the first Layer-fed rows.
- **The god-layer split** the parent spec deferred here (§6.4): `computeStarCut` loses its pure-or-mutating flag; the Layer's `frame` is the one fade advance.

Packaging (grill Q12): **two PRs**. PR 1 is ground preparation, four behaviour-neutral commits (§3). PR 2 is the Layer (§4–§9). Each gets its own plan.

## 2. Data delta

Contract shapes only. Files are named where the name is the contract.

### 2.1 Registry

`S_STAR_ENTRY` and `SUN_ENTRY` retype from `body` to `starCatalog`, keeping `Source.SStar = 28` and `Source.Sun = 26`. Both become `SeededStarCatalogSourceEntry` rows (`binBaseName: null`) beside `FAMOUS_STAR_ENTRY`; `GAIA_STARS_ENTRY` is unchanged. `StarCatalogId` grows to four members by derivation off the registry, and `starCatalogs.items` (already a total record derived from `SOURCE_ENTRIES`) grows with it, so the Sun and the S-stars get item toggles in the Stars panel for free. The Sun keeps its own row rather than joining the famous table because "famous stars off" must leave the descent's aim point on screen, and because future Sun-only drawing (its own pass, overlays) routes by a seed-row field, never by an `id === 'sun'` branch in a shared loop (grill Q8).

`Source.SgrAStar = 27` stays a body: it is drawn by the body pipeline and is not a star.

> Reversed by `2026-09-22-black-holes-layer-design.md` §1.

```ts
// src/layers/starCatalog/sources/ — one row per file + the rows array
export const STAR_CATALOG_SOURCE_ROWS = [GAIA_STARS_ENTRY, FAMOUS_STAR_ENTRY, SUN_ENTRY, S_STAR_ENTRY] as const;

// Layer-private, total over the seeded ids: a new seeded source is a compile error
// until it has a seed table. Seed tables STAY in src/data/ (data is data).
export type SeededStarCatalogSourceType = 'famousStar' | 'sun' | 'sStar';
export const SEEDED_STAR_CATALOGS: Readonly<Record<SeededStarCatalogSourceType, readonly StarBody[]>>;
```

The Sun leaves `SCENE_STARS` (the famous table) for its own one-row table; `SCENE_S_STARS` is unchanged. Consequences: `sceneAnchors`' `row.id === SUN_ENTRY.id` special case and the "index 0 is the Sun" status of the famous table are deleted; `visibleStars` gates per source with no `GATE_BY_STAR_ID` exemption table.

### 2.2 Selection

```ts
// src/@types/engine/SelectionRef.d.ts — the `star` arm is REPLACED
| { readonly type: 'starCatalog'; readonly source: StarCatalogSourceType; readonly index: number }

// src/@types/engine/SelectionRow.d.ts — the row arm
| {
    readonly type: 'starCatalog';
    readonly source: StarCatalogSourceType;
    readonly index: number;        // seed-table index (seeded) or bin-stable index (Gaia)
    readonly id: string | null;    // durable seed id; null for Gaia
    readonly label: string;
    readonly positionMpc: Vec3;
    readonly radiusM: number;
    readonly absMag?: number;
    readonly bpRp?: number;
  }
```

One arm for all four sources, mirroring `galaxyCatalog` (grill Q8a). The pick texture already packs exactly this pair: `(Source.FamousStar | Sun | SStar, seedIndex)` for seeded stars and `(Source.GaiaStars, binIndex)` for the survey. Every consumer of the `star` arm renames; no consumer gains a branch.

Greenfield wanted two arms (a tier-scoped survey ref and a durable seeded ref). Ruled one arm at the checkpoint: seeded sources are not tiered, so the index-instability hazard the split defends exists only for Gaia, and exists today. The durable id lives on the row and in the URL, not in the ref.

### 2.3 The InfoCard view-model

```ts
// src/@types/engine/StarInfo.d.ts — replaces FieldStarInfo. Core, not the Layer's own
// @types/: FocusableTarget's core-wide union names it and core's buildFocusable/refOf
// produce and consume it, so shelving it under layers/ would make core import a Layer
// type — a boundary the Layer ratchet forbids.
export type StarInfo = {
  readonly type: 'starCatalog';
  readonly source: StarCatalogSourceType;
  readonly index: number;
  readonly id: string | null;
  readonly displayName: string;
  readonly x: number; readonly y: number; readonly z: number;
  readonly distancePc: number;
  // No radiusM: a consumer that needs the star's size reads the SelectionRow's
  // own field (the sphere-size input already lives there for every arm).
  readonly detail: StarInfoDetail;
};

// keyed by SHAPE, not source (greenfield, adopted): the card renders what the block is
export type StarInfoDetail =
  | { readonly kind: 'photometry'; /* Gaia bin fields: absMag, bpRp, parallax… */ }
  | { readonly kind: 'curated'; readonly meta: FamousStarMetaEntry }
  | { readonly kind: 'orbit'; /* the S-star orbit block: period, periapsis, eccentricity… */ }
  | { readonly kind: 'none' };
```

One `buildFocusable` arm, one `StarDetailCard` (plus its compact twin) replacing `FieldStarDetailCard`; `BodyDetailCard` loses its famous eyebrow, meta-sidecar lookup, S-star orbit block and `FAMOUS_STAR_IDS` import (grill Q10). The Sun's curated entry rides the same sidecar, built from its own seed file (`data/seeds/sun.seed.json`), so it is `detail.kind: 'curated'` like any other seeded star.

### 2.4 The contract

```ts
// src/@types/engine/layer/LayerGuides.d.ts — REPLACES LayerLabels (grill Q7, flat)
export type LayerGuides = {
  readonly screenLabels?: readonly LayerScreenLabel[];
  readonly worldLabels?: readonly Label3DProducer[];
  readonly orbitTrails?: readonly OrbitalElements[];
};

// Layer.d.ts
guides?(runtime: Runtime): LayerGuides;   // `labels?` is deleted

// src/layers/starCatalog/@types/StarCatalogFacts.d.ts
export type StarCatalogFacts = { readonly famousStarsMeta: readonly FamousStarMetaEntry[] };

// EngineState — composed at createLayers, walked by orbitTrailsPass
readonly orbitTrailRows: readonly OrbitalElements[];   // [...CORE_TRAIL_ELEMENTS, ...layers.flatMap(guides.orbitTrails)]
```

Orbit-trail rows are static `OrbitalElements`, as `worldLabels` producers are static: the pass already propagates every conic per frame and only needs the focus body's position. The star Layer's `guides.orbitTrails` is **derived** from its seeded catalogs' orbit drivers, not hand-listed (greenfield, adopted).

### 2.5 The camera joint

```ts
// src/utils/camera/focusDriverId.ts — replaces the `row.type === 'body'` camera gates
export function focusDriverId(row: SelectionRow | null): string | null;
// body → row.id; starCatalog → row.id (null for Gaia); every other arm → null
```

`liveBodyPosition`, `bodyMovesThisFrame`, the follow driver in `cameraDrivers`, `approachTiltedPose`, `runFrame`'s focused-body distance publish and `stepCameraRuntime`'s `focusBodyId` ask "does this row carry an id the position table drives", which is what each of them meant. `focusFraming` and `pivotFraming` read the seed table for a size, so they keep switching on the arm; the star arm's case reads `radiusM` off the row. Focusing S2 keeps following its orbit through the existing body-state map (grill Q11). Greenfield's `sampleMpc` closure on the row is the end state when the body Layer forms and positions compose at boot; a stars-only sampler now would be a second path beside the body one.

## 3. Ground preparation — PR 1

Refactor-ground checkpoint ran 2026-09-21 with a greenfield cross-check (fresh subagent, data requirements only). Verdicts per touchpoint:

| Touchpoint | Verdict | Blocker today | Joint |
|---|---|---|---|
| Orbit trails walk a static table | bolt-on | `orbitTrailsPass.ts` loops `TRAIL_ELEMENTS` | composed `state.orbitTrailRows` |
| Labels contract has no orbit slot | bolt-on | `Layer.d.ts` `labels` only | `Layer.guides` |
| Camera gates on ref type | bolt-on | six sites gate on `row.type === 'body'` (§2.5) | `focusDriverId` |
| `computeStarCut` pure/mutating by flag | bolt-on | `computeStarCut.ts` `advanceFades: boolean` | pure walk + separate advance |
| `orbitTrails` settings in the body Layer | misplaced | `layers/body/state/orbitTrails/` | core cluster |
| Registry row, selection row, fade row, facts, captions, InfoCard arm, pick rows, targets | growth | seams exist | none |

Two existing bolt-ons are **deleted by the feature**, not prepped: the body selection row's seeded-star branch and `visibleStars`' Sun/S-star exemption table.

**Four commits, in this order, each behaviour-neutral and pixel-identical:**

1. **`Layer.guides` replaces `labels`.** `LayerGuides` lands, `LayerLabels` is deleted, `galaxyCatalog` / `zoneOfAvoidance` / `constellations` rename their member and declaration file. `createLayers` composes `state.orbitTrailRows` from core's rows plus every Layer's `guides.orbitTrails`; `orbitTrailsPass` walks the roster instead of `TRAIL_ELEMENTS`. With no Layer contributing yet the roster equals the table.
2. **`orbitTrails` settings cluster moves from `layers/body/state/` to core**, because the machinery (pass, renderer, fade row in `wiring/fadeLayers.ts`) is core. Settings root unchanged in shape.
3. **`focusDriverId`** lands and the six camera gates call it. Only body rows have a driver id yet, so nothing changes.
4. **`computeStarCut` splits** into a pure read and `advanceStarFades`, called from `runFrame` where `computeStarCut(state, views, true)` is called today; both halves take the frame's `views` (the view-rigs prep's `views[0]`-is-anchor contract, unchanged). `advanceStarFades` walks the octree and steps every catalog's ramps, leaving each catalog's active list as the frame's drawn set; the pure `computeStarCut` emits that list for the main view and walks fresh, at full opacity, only for a capture face. The `advanceFades` flag, `advanceStarCut` and `PreparedStarCut.anyNodeFading` go (the vote is `advanceStarFades`'s return); `readStarCut` and every capture-face read stay pure via the per-ctx memo.

No deletion audit on PR 1 (prep-PR rule); the audit runs once at PR 2's `/feature-done`.

Shape tensions priced at the checkpoint and ruled: one ref arm (§2.2), `focusDriverId` over a row sampler (§2.5), one `star-` URL prefix with a boot assert over the greenfield's `gaia:` / `star:` pair (§6).

## 4. The Layer — PR 2

Folder layout per `src/layers/README.md`; `galaxyCatalog` is the template at every member.

| Member | Content |
|---|---|
| `layer.ts` | `defineLayer` with `name: 'starCatalog'`, facts seed `{ famousStarsMeta: [] }`, `targets: [starAggregatesTarget]`, `ui: [{ slot: 'main', content: StarsSectionContainer }]` |
| `create.ts` / `destroy.ts` | mint and release `StarCatalogRuntime`: the survey store (today `ResolveDeps.stars`), the four renderers, the cut memo, the meta slot |
| `frame.ts` | the one mutating fade advance (`advanceStarFades`) returning `{ awake: anyNodeFading, settling: … }`; `runFrame`'s `starFadeAnimating` special case is deleted. Shipped as: a `scope: 'once'` `FrameContentPlanner` row, after #805 retired `Layer.frame` |
| `settings` | `state/starCatalogs/` as today; the `items` record now has four keys by derivation |
| `sources/` | the four rows, `STAR_CATALOG_SOURCE_ROWS` |
| `load/` | `starCatalogSlot`, `famousStarsMetaSlot` (publishes the fact via `deps.publish`), their fetchers, the asset rows |
| `passes/` | `starCatalogPass`, `starAggregatesPass`, `starUpsamplePass` (survey), `starPointsPass`, `starSpheresPass`, `fieldStarSpherePass` (near-field) |
| `render/` | `starCatalogRenderer`, `starCatalogPickRenderer`, `starRenderer`, `starPointRenderer`, `cut/` (pure walk, memo, `starCatalogVisible`), `visibleStars`, `positionedVisibleStars`, `partitionStarsByResolution` |
| `present/` | fade rows (survey rows + `starCatalogLabel`), the caption producer, `starCatalogSelectionRow`, `starCatalogGuides` |
| `guides` | `screenLabels`: one NEAR0-slab producer over the seeded stars with the `star` caption kind; `orbitTrails`: the S-star element rows |
| `selection` | one `SelectionKindRow` for `type: 'starCatalog'`, `pickSources: [gaiaStars, famousStar, sun, sStar]` |
| `@types/` | `StarCatalogRuntime`, `StarInfo`, `StarInfoDetail`, `StarCatalogFacts`, and the star-only types moved from `src/@types/` (the `rendering/Star*` and `starCatalog*Renderer` families, `PreparedStarCut`, `PreparedStarSource`, `PositionedStar`, `SStarSeed`, `FamousStarsPayload`, …). `StarCatalogId`, `StarCatalog`, `StarCatalogReq`, `FamousStarMetaEntry` and `StarBody` keep core homes while core imports them |

Shaders stay under `src/services/gpu/shaders/`. Seed tables (`sceneStars`, `sceneSStars`, `sceneSun`, `sStarElements`, `famousStars.generated`, `sun.generated`) stay under `src/data/`; `orbitalElements.ts` keeps importing the S-star rows from data for `POSITION_DRIVERS`, so no `data/ → layers/` edge exists. The rows are declared once (in data) and read twice (positions at import time, trails via the guide) **until the body Layer forms** and positions compose at boot too (grill Q6). That is body's ground prep; the rows will already sit where it needs them.

`ResolveDeps.stars` dissolves into a runtime argument of the moved selection row, as constellations did for its slot. `engine.meta.famousStars`, `engineFamousStarsMetaReported` and the `meta` member (if the star entry was its last) are deleted; `selectFamousStarsMeta` reads `state.engine.starCatalog.famousStarsMeta ?? []` (grill Q3).

## 5. Captions

The seeded-star rows leave `sceneBodyLabels`; core keeps Earth, the planets, Sgr A\* and the mesh bodies. The Layer's `screenLabels` producer registers on the NEAR0 slab, uses the `star` caption kind and the existing `captionFadeRules.star` rule (which already reads the star settings), and lands after core's producers, which the equal-prominence tiebreak wants. `CaptionKind`, `CAPTION_PRIORITY` and `CAPTION_FADE_RULES` stay core as shared vocabulary (grill Q2; the constellations ruling).

> Reversed by `2026-09-22-black-holes-layer-design.md` §1.

## 6. Durable focus ids

The `starCatalog` row claims the `star-` prefix. Decode: an all-digits remainder is a Gaia bin index; anything else is a seed id looked up across `SEEDED_STAR_CATALOGS`. Encode: `star-<index>` for Gaia, `star-<seedId>` for seeded stars (`star-sirius`, `star-s2`, `star-sun`). One boot assert: no seed id is all digits (grill Q9, checkpoint). Bare `sirius` links break; no authored tour or clip uses one.

Parent D6'1 rides: a Gaia deep link defers via `focusId.decode` returning null until the bin lands, so the `NOT_YET_LOADED.star` probe in `watchFocusTweenSaga` is deleted and a star deep link selects when its bin commits, as a galaxy link does. Seeded ids decode immediately.

## 7. D6'3 reversed for the seeded stars

Parent D6'3 said "a pick source is decoded by the Layer that owns the object's identity, not the one that draws it" and listed `famousStar` under the body row. The user ruled (grill Q5) that identity follows the physics: the seeded stars' identity **is** star identity, so the drawing Layer and the identity Layer are the same Layer and the rule needs no exception. The body row drops `FamousStar` and `SStar` from its `pickSources` and its seeded-star lookup branch. The principle stands; only its example was wrong.

## 8. Behaviour changes

Everything else is pixel-identical. The user-visible changes, all ruled:

- The Stars panel gains item toggles for the Sun (which had none) and the S-stars (whose toggle leaves the Bodies panel). Each source gates itself.
- A click on a famous star, the Sun or an S-star opens `StarDetailCard` with the source-appropriate detail block, instead of `BodyDetailCard`.
- Deep links: `star-sirius`, `star-s2`, `star-sun`; a Gaia link selects when its bin lands.
- The S-star orbit trails and the camera follow of a focused S-star are unchanged by construction (roster equals the old table; `focusDriverId` finds the same driver).
- The Solar System exhibit's per-exhibit pickable-kinds gate now keeps every star pickable rather than only the survey bin: the Sun's dot is a `starCatalog` row like any other seeded star, so the gate has no way to admit `gaiaStars` while excluding `famousStar`/`sun`/`sStar` — one arm, one kind, no partial membership.

## 9. Testing

Judged by "fails on a real bug nothing else catches":

- PR 1: `createLayers` composes `orbitTrailRows` in order and throws on nothing new; `focusDriverId` per arm; `computeStarCut` is pure across two calls with the same ctx (the memo test) and `advanceStarFades` advances exactly once per frame (the double-advance class the flag guarded against). The `starCatalogVisible` delegation tests in the pass tests are untouched by PR 1 and leave with PR 2, when the passes move into the Layer.
- PR 2: focus-id claim/decode/encode round-trips per source plus the all-digits boot assert; `visibleStars` per-source gating with no exemption; `StarInfo.detail` shape per source; the selection row's `pickSources` disjointness at boot (existing assert); `selectFamousStarsMeta` before and after the fact publishes.

Gates: `npm run build` on both compositions, the suite green, a visual pass on the main app (stars, trails, captions, the four cards, the three deep links). Perf gate: not needed; no renderer path changes.

## 10. Backlog consumed

- `docs/backlog/2026-08-20-star-catalog-layer-god-layer-split.md` (whole; PR 1 commit 4 + PR 2 `frame`).
- `docs/backlog/2026-07-29-near-field-stars-body-vs-star-domain.md` (whole; PR 2).
- The star half of `docs/backlog/2026-07-30-meta-getters-belong-on-the-data-stores.md` (PR 2; the item is rewritten to its remaining half).

Adjacent findings, backlogged with PR 2 unless promoted: `SCENE_BODIES` mixes stars into the body table (stars leave it with the feature; occluder and apparent-size readers need checking); `ORBIT_REACH_BY_REGION` is precomputed from the static table rather than the roster; `starRenderer`'s single-uniform once-per-frame caveat.

## 11. Non-goals

- Sun-specific rendering. The row is shaped so a future Sun pass routes by a seed-row field; nothing is drawn differently here.
- Composing positions (`POSITION_DRIVERS`) at boot. Body's ground prep.
- A row `sampleMpc` closure replacing the body-state map. Body's end state.
- Two-arm selection or `gaia:` / `star:` prefixes. Priced and declined.
- The v1 sprite-star bag under `galaxyGenerator/v1/`, which is not a star catalog.

## 12. Decision log

| # | Decision | Ruling | Where |
|---|---|---|---|
| S1 | Layer extent | All stars: survey + famous + Sun + S-stars, draw pipeline included | grill Q1 |
| S2 | Captions | Seeded-star rows leave `sceneBodyLabels` for the Layer's producer | grill Q2 |
| S3 | Famous meta | Layer fact, slice action deleted | grill Q3 |
| S4 | Orbit trails | Generic core machinery a Layer feeds; S-stars belong to the star Layer | grill Q4 |
| S5 | Identity | Seeded stars get star identity; **reverses parent D6'3's example** | grill Q5, §7 |
| S6 | Feeding mechanism | Contract member for trails; rows declared once in data, positions keep importing until body forms | grill Q6 |
| S7 | Contract shape | `Layer.guides { screenLabels, worldLabels, orbitTrails }` flat, replacing `labels` | grill Q7 |
| S8 | The Sun | Its own seeded row, code 26 kept, own toggle | grill Q8 |
| S9 | Ref shape | One `starCatalog` arm `{ source, index }` | grill Q8a, checkpoint |
| S10 | URL ids | `star-<seedId>` / `star-<index>`, one prefix, boot assert | grill Q9, checkpoint |
| S11 | Card | One `StarInfo` with `detail` keyed by shape, one `StarDetailCard` | grill Q10 |
| S12 | Camera | `focusDriverId` on the row; sampler deferred to body | grill Q11, checkpoint |
| S13 | Packaging | Prep PR then feature PR; no deletion audit on prep | grill Q12 |

## 13. Docs to update when this ships

- `src/layers/README.md`: `labels?` row becomes `guides?`; status line moves `starCatalog` to formed.
- Parent spec: §10(e) marks `starCatalog` done; D6'3's example corrected with a pointer to §7 here.
- `docs/BACKLOG.md`: the three consumed items removed; the adjacent findings added if not promoted.
- The star landmine notes in memory (seed-table ordering, two tables never merged) still hold and are restated in `starPickId`'s successor.
