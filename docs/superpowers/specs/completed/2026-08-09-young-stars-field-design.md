# YOUNG STARS field — chains over a sim-side stars tracer

Decisions: [`docs/grill-sessions/young-stars-field-2026-08-09.md`](../../grill-sessions/young-stars-field-2026-08-09.md) (Q1–Q6).
Evidence: [`docs/research/m74-jwst/10-young-star-placement.md`](../../research/m74-jwst/10-young-star-placement.md),
[`11-young-star-clustering.md`](../../research/m74-jwst/11-young-star-clustering.md).
Branch: `spike/dust-seeding` (PR #544); prep and feature land as separate
commits on this branch, no separate PRs.

## Goal

Replace the scattered one-splat-per-seed YOUNG STARS tier with:

1. a **stars channel** in the fluid ISM map — deposited at SF events,
   advected with the existing flow, decaying over the measured ~50–100 Myr
   dissolution clock — as the placement field;
2. **chain components** laid along every arm and spur (the ridge walk),
   whose fragments modulate by that channel plus the existing star-grain
   texture.

Fixes, by construction: center skew (chains span the arm's own envelope,
not the 1/r²-biased event draw), radius-blind sizing (across-sigma tracks
`armCrossSigma`'s width law), the close-zoom crater (no scattered
fullscreen-quad stacks; overlap bounded at 2–3 chain neighbours), and the
reference mismatch (clumps born in clearings, sheared into chains,
anti-correlated with dust at clump scale — the measured behaviour).

## 1. Stars tracer (fluid sim)

`ismMapFluidStep.wesl`'s y lane (`eventAge`, a write-only clock in the
fluid generator) is rebuilt as `stars`:

```wgsl
// per step, per texel:
stars_next = advected(stars) * starsDecay          // same semi-Lagrangian
           + starsDeposit * gasHere * eventStamp;  // sample gas/dust ride
```

- **Deposit** while an event's stamp covers the texel, proportional to the
  local gas (SF converts gas to stars; the impulse-duration multiplicity is
  absorbed into the `starsDeposit` calibration constant).
- **Advect** exactly as gas/dust advect — clumps shear into chains instead
  of staying stamped circles.
- **Decay** per step; the slider maps to the ~50–100 Myr structural
  dissolution clock in step units.
- `activity`/`gas`/`dust` updates are untouched. The **automaton**
  generator is untouched entirely — its `eventAge` is load-bearing
  (refractory gating, ignition dust floor); only its pack's output label
  changes, keeping `exp(-age/12)` as that generator's documented
  approximation of `stars`.
- `ismMapFluidPack.wesl` y becomes a straight, unclamped copy (like the
  dust lane; the palette scales for display).

New `GalaxyIsmMapFluidParams` fields (defaults in
`defaultGalaxyIsmMapFluidParams.ts`, `??`-guarded at point of use, sliders
in the FLUID panel): `starsDeposit`, `starsDecay`.

## 2. Rename: the y family becomes `stars` (same commit as §1)

State lane, packed lane, `GalaxyIsmMap.ts` contract table (the one
documented authority), CPU structs (`IsmMapDensityTexel`,
`sampleGalaxyIsmMap`, `decodeIsmMapTexels`), `IsmMapChannelWeights.
recentSfWeight → starsWeight`, `RenderSettings.ismMapRecentSfWeight →
ismMapStarsWeight` (second legacy-key shim in `parseGalaxyPreset.ts`),
debug slider "ISM map · stars", palette info text. After this commit the
quantity has one name at every surface.

**The one functional consumer moves off the lane first**: the HII shell
map-seeding CDF (`hiiRegions.ts`, `texel.recentSf`) switches to
`texel.activity` — the short-memory EMA of the same event stamps — so
shells keep their fresh-site preference instead of sampling 20–100 Myr
drifted material. (The historical objection was to the `gas ×` product,
not to activity alone; `GalaxyHiiTuning.ismMapSeeding`'s doc updates.)

## 3. Chain producer (`v2/youngStarChain.ts`, new)

Built against post-prep architecture (`sampleArmRidgeNodes`, P1):

```ts
buildYoungStarChain(geometry, tuning, seed): readonly GalaxyFieldComponent[]
// for arm of [...geometry.arms, ...buildArmSpurs(geometry, tuning.arms.spurs, seed)]:
//   nodes = sampleArmRidgeNodes(geometry, arm, count)   // P1: {logR, radius, center, spacing, frame, mod}
//   per node:
//     sigmas = { along:  spacing * OVERLAP,
//                across: young.width * armCrossSigma(radius, geometry, tuning),
//                pole:   pcToUnits(YOUNG_SCALE_HEIGHT_PC) }        // ~100 pc const
//     flux_k ∝ spacing * mod        // arm's own intensity law; normalized so
//                                    // Σ flux_k = brightness * YOUNG_FLUX_REF
//     component = { amplitude: flux_k / (TAU_ROOT3 * σalong*σacross*σpole),
//                   ...inverseCovarianceFromFrame(frame, sigmas),
//                   color: YOUNG_BLUE, center, boundRadius,
//                   textureWeight: -young.texture,   // star-grain branch (exists)
//                   starsWeight:   young.mapDepth }  // NEW lane, packs to comps[4i+3].w
```

- Total tier flux = `brightness × YOUNG_FLUX_REF` (free-standing constant;
  the pivot to `clusterFluxSum` is the one-line anchor swap, Q3).
- Weak arms get proportionally faint chains through `mod` (fade × clump ×
  survival, mean-normalized) — same law the ridge chain renders with.
- Component count capped well inside the comps budget (~≤512 total);
  deterministic per seed; pure.
- Called from `buildHiiRegions` (the components ride the HII pass, whose
  draw already enables texture modulation).

**Deleted in the same commit:** `buildBlueAssociations`' scattered
placement, `selectAssociationSeeds`' association use, the seed-position
drift machinery (`driftedAssociationSeed` et al.) where the young tier was
its only position consumer — DIG keeps consuming event _counts_ only.

## 4. Tier tuning reshape

`hii.associations` (`GalaxyHiiAssociationsTuning`) →
`hii.youngStars` (`GalaxyYoungStarsTuning`):

```ts
export type GalaxyYoungStarsTuning = {
  readonly enabled: boolean;
  readonly brightness: number; // total tier flux (the ONE flux knob)
  readonly width: number; // ribbon across-sigma as a fraction of armCrossSigma
  readonly mapDepth: number; // 0 = smooth ribbon, 1 = fully stars-map clumped
  readonly contrast: number; // gamma shaping the stars read; flux-neutral (mean-normalized)
  readonly texture: number; // star-grain weight (unchanged semantics)
};
```

Dies: `complexes`, `coherence`, `armBias`, `sizeScale`, `elongation`.
Wire migration renames the bag and drops dead fields
(`migrateGalaxyFieldTuningWire`, `liftHiiShells` precedent).
`HiiSection.tsx`'s YOUNG STARS group swaps to the five sliders.

## 5. Shader read (`splat.wesl`)

Inside the existing negative-`textureWeight` (star-grain) branch:

```wgsl
if (g3.w > 0.0) {                       // starsWeight = mapDepth
  let uvv = ismMapUv(p);                // P2: shared with dustDetailMultiplier
  if (uvv.z > 0.0) {
    let stars = textureSampleLevel(ismMapTex, ismMapSmp, uvv.xy, 0.0).y;
    let shaped = pow(max(stars, 0.0), u.youngStars.x) * u.youngStars.y; // gamma, 1/meanNorm
    term = term * mix(1.0, shaped, g3.w);
  }
}
```

- New `FieldUniforms` row `youngStars = (contrastGamma, invMeanNorm,
spare, spare)` — io.wesl layout + `packFieldUniforms` update together.
- `invMeanNorm` is CPU-computed at map readback: 1 / (texel-area-weighted
  mean of `pow(stars, gamma)`), memoized per (map, gamma) — the contrast
  knob restructures without draining flux (Q3's mean-1 contract).
- Importing `ismMapUv` pulls bindings 3/7/8 into the splat pipeline via
  `layout: 'auto'`; `createGalaxyEngine` adds the same three resources to
  the splat bind group it already hands the dustMap pass.
- Per-fragment cost: one 2D fetch inside a branch only young components
  take; the grain fetches are unchanged.

## Ground preparation

Verdicts from the refactor-ground pass (checkpointed 2026-08-09):

- **P1 (prep commit): extract `sampleArmRidgeNodes`** from `pushArmRidges`
  (`galaxyFieldMixture.ts:704–739`) — the chain producer would otherwise be
  the third hand-rolled ridge walk and second copy of the
  fade×clump×survival law. Behavior-neutral; pinned by existing digests.
- **P2 (prep commit): extract `ismMapUv`** inside `dustDetail.wesl`
  (currently inlined at lines 54–61) — the stars read would otherwise copy
  the world→log-polar math. Linked-WGSL-equivalent.
- Everything else is growth at existing seams: spare `g3.w` lane
  (io.wesl:214; packer `base+15` literal 0), a new `FieldUniforms` row,
  fluid-params fields with `??` guards, the tuning-bag migration, splat
  bind-group entries, the one-line CDF weight switch.

## Out of scope (recorded in the grill doc)

- Event-CDF texel-area bug (1/r² center loading) — backlog; dust/DIG/HII
  still consume events and fixing it re-distributes the calibrated map.
- Bright-knot population (a second, sparser chain) — only if tracer clumps
  don't read as discrete clusters.
- Flux anchor pivot c→a — one line, when the look graduates.
- Quad caps for the remaining full-res HII tiers — orthogonal perf work.

## Testing

- P1: existing arm-field digests must stay byte-identical.
- Chain producer: deterministic per seed; Σ node flux equals the tier
  budget; across-sigma tracks `armCrossSigma` (growing with radius); spur
  records produce chain nodes.
- Migration: old wire with `associations` bag lifts to `youngStars`,
  dead fields dropped; both preset shims (`ismMapRecentWeight`,
  `ismMapRecentSfWeight`) land on `ismMapStarsWeight`.
- Seeding switch: shell CDF weights by `activity`; a map with disjoint
  activity/stars support places shells on the activity support.
- Gates: full suite + `npm run galaxy-renderer:probe` (only automated path
  reaching the sim shaders).
