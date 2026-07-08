# Galaxy impostor LOD — baked rgba16float textures from the generated galaxy renderer

**Status:** design sketch (perf + memory implications), 2026-07-08.
**Idea (from Alexander):** galaxies smaller than 128 px on screen render from a
texture baked out of the new GPU galaxy generator; galaxies at or above 128 px
render the full generated 3D point cloud. The baked texture becomes the next
step up from the point renderer and **replaces `proceduralDiskRenderer`**.
Textures are **rgba16float** so they carry linear HDR emission straight through
the existing HDR → tone-map chain.

## Verified current state

The pieces this composes already exist on `main`:

- **Generator**: `src/services/gpu/galaxy/` — two compute pipelines
  (`createGenerationPipelines.ts`, workgroup 256) write stars + dust as 32-byte
  records (`genRecordBytes.ts`) into storage buffers; `encodeGeneration.ts`
  records the dispatches. Budgets come from `splitStarBudget.ts`
  (min 20 000 stars, MW preset 150 000 at medium tier,
  `milkyWayGalaxyParams.ts:63`).
- **Cloud draw**: `milkyWayCloudRenderer.ts` — additive star pass +
  multiplicative-transmittance dust pass, no depth, into the shared HDR target.
  Flux-conserving vertex-stage star culling (`MILKY_WAY_LOD_APPARENT`,
  `milkyWayCalibration.ts:94`) is the proven overdraw lever (#412).
- **HDR chain**: `passes/postProcess.ts` — everything visible accumulates
  additively into one `rgba16float` offscreen, tone-mapped once into the swap
  chain. rgba16float is renderable + sampleable + blendable in base WebGPU
  (the header's rationale, `postProcess.ts:30-38`).
- **LOD ladder today** (`src/data/galaxyLodBands.ts`):
  point < 8 px → procedural disk 8–14 px fade-in → textured photo thumbnail
  24–40 px → hi-res famous 120–160 px. The procedural disk is an *analytic*
  two-exponential brightness profile (`shaders/proceduralDisks/fragment.wesl`)
  — no spiral structure, no bar, no dust.
- **Impostor plumbing**: `instancedQuadRenderer.ts` (shared 64-byte instance
  stride across procedural/textured/quad siblings), oriented-billboard math
  (axisRatio squash + PA rotate) in `proceduralDisks/vertex.wesl`, per-frame
  planner in `proceduralDiskSubsystem.ts`.
- **Texture-array prior art**: `resources/hiResFamousTexture.ts` (fixed-layer
  `texture_2d_array` + LRU-by-recent-px) and `resources/textureAtlas.ts`
  (2048² rgba8 = 16 MiB, 256 × 128² slots, LRU-by-frame).

## Proposed ladder

```
< 8 px          point sprite                        (unchanged)
8 → 128 px      baked-impostor billboard            (replaces proceduralDiskRenderer,
                                                     subsumes? the 24–40 px photo band — open Q1)
120 → 160 px    crossfade impostor → full geometry  (reuse HI_RES band shape)
≥ 128 px        full generated star+dust cloud      (the Milky Way path, per-galaxy)
```

Famous galaxies with curated WebPs / hi-res photos keep their textured path —
a generated cloud is *a* galaxy, not *that* galaxy.

## Key design choice: archetype library, not per-galaxy bakes

A baked texture per catalog galaxy is unbounded (the 8 px+ band holds hundreds
to thousands of galaxies in a dense-field flythrough) and would need runtime
LRU baking like the thumbnail pipeline. But the generator is *procedural*: two
galaxies with the same `GalaxyParams` + seed produce identical images. So bake
a **fixed archetype library** — 5 categories (`classifyHubbleType.ts`) ×
~8–16 seed/arm/bulge variants ≈ **64–128 layers** — face-on, once, and map every
catalog galaxy to a layer by a pure hash of `(colourIndex, absMag, axisRatio,
row index)`. No .bin format bump needed (v6 carries no Hubble type; blue →
spiral-leaning, red → elliptical-leaning is the standard proxy).

Face-on bake + the *existing* billboard orientation math (axisRatio squash, PA
rotate) reproduces exactly the 3D-orientation approximation the procedural disk
uses today — same visual contract, but with real arms/bars instead of a radial
profile. Edge-on dust-lane realism would need 2–3 inclination bakes per
archetype (multiplies layer count); defer.

## Memory

Store as a `texture_2d_array` of 128² rgba16float layers **with a full mip
chain** (the band spans 8→128 px; sampling a 128² texture at 8 px without mips
= additive HDR shimmer). Arrays, not an atlas, because mips bleed across atlas
slot boundaries.

| Resource | Size |
| --- | --- |
| 128² rgba16f layer + mips | 128 KiB × 4/3 ≈ **171 KiB** |
| 64-layer library | ≈ 10.7 MiB |
| 128-layer library | ≈ 21.3 MiB |
| (per-galaxy-unique fallback, 256 layers, LRU) | ≈ 42.7 MiB |
| Bake scratch (32 k-star gen buffer + dust, reused serially) | ≈ 1.3 MiB |
| Full-geometry cache: star+dust buffers per resident galaxy (100 k–400 k × 32 B) | 3–13 MiB each |
| Full-geometry residency cap ×4–8 (LRU-by-recent-px, like hi-res) | ≈ 20–80 MiB |

Net GPU-memory delta vs today: roughly **+30–100 MiB** depending on layer
count, tier-scaled geometry budgets, and residency cap. For comparison the
thumbnail atlas is 16 MiB and the hi-res famous array up to 32 MiB. Desktop:
comfortable. iOS: scale layer count + budgets by tier (base-WebGPU formats
throughout, so no feature-gate risk — but see the iOS invalid-pipeline
gotcha in CLAUDE.md before shipping any new WESL).

The procedural-disk pipeline this replaces holds **no** texture memory, so the
whole table is additive; what's *removed* is only its pipelines + the analytic
fragment ALU.

## Performance

**Bake cost (one-time / amortized).** Per archetype: one generation dispatch
(32 k threads — microseconds) + one star/dust render into a 128² target
(16 k pixels; overdraw serialization is bounded by the tiny target) + a 7-step
mip downsample chain (WebGPU has no auto-mipgen). Well under 1 ms each on
desktop. A 128-layer library bakes in ~a second of GPU time — do it behind the
loading screen or budget 2–4 bakes/frame through a queue
(`galaxyImageQueue.ts` is the prior-art shape). Bake directly into each array
layer's mip 0 (a render-pass color attachment can be a single layer view) — no
copy step.

**Per-frame, impostor band.** Same instanced-quad machinery, same instance
counts, same planner walk — the fragment swaps ~10 ALU ops of analytic profile
for one mipmapped array-texture sample. Net wash to slight win on the GPU. The
dominant cost in this band stays the **CPU planner walk** (~4.2 ms of a 5.1 ms
frame on M1 Max — `backlog/2026-06-30-unify-disk-planner-walks.md`); this
feature adds a reason to do that unification first rather than adding a third
independent walk.

**Per-frame, full-geometry tier.** Each ≥128 px galaxy is the Milky Way path
again: 100 k–400 k additive sprites + dust, with the flux-conserving vertex
cull as the overdraw lever. The MW ships today at acceptable frame cost
(#408/#412); typically 1–3 galaxies exceed 128 px simultaneously. Cap
residency (4–8) and degrade over-cap galaxies to their impostor. Dominant GPU
cost is additive fill when a galaxy spans ~1000 px — same as MW today, same
mitigation. Generation on first approach is a one-off compute dispatch
(<1 ms), hidden inside the 120→160 px crossfade band.

**Pick path.** Impostor pick = the existing procedural pick pipeline
(`pickFragment.wesl` billboard). Full-geometry galaxies need a pick billboard,
not per-star picking — `milkyWayPickRenderer.ts` is exactly that pattern.

## Why rgba16float is the right call (and its one subtlety)

Baking **linear pre-tonemap emission** with the same star/dust shaders + the
same exposure constant means the impostor sample and the live cloud are
numerically the same signal — the 120→160 px crossfade cannot shift brightness
or hue, and there is no double tone-mapping. fp16 range (±65 504) and
~3-decimal precision comfortably cover the accumulation peaks the postProcess
header documents (~few hundred).

The subtlety is **flux calibration at the bottom of the band**: a point
sprite's brightness derives from catalog magnitude; a baked archetype's total
light derives from the generator + exposure. The impostor instance needs a
per-galaxy brightness scale (absMag-derived — already baked into the point
vertex record since #411) multiplying the sampled texel, and the mip chain
must be a plain flux-preserving box filter, so total light is conserved both
across the 8–14 px point↔impostor crossfade and as a galaxy shrinks through
the mip levels.

One compositing simplification: live dust multiplies the framebuffer
(`dst`-factor blend); a baked impostor folds dust extinction into its own RGB
and composites **purely additively** — identical to how the procedural disk
behaves today, so no blend-model change. (Carrying transmittance in alpha for
a dual-blend impostor is possible but is exactly the kind of accidental
complexity to skip.)

## Interaction with renderer unification

The compositor spec (`specs/2026-06-29-renderer-unification-design.md`, plans
01–04 in flight) makes "additive layer into `hdr`" a registry entry and
already contains the "render offscreen, sample back" pattern. The impostor
pass should land as a registry layer and the bake as an offscreen pass —
sequencing this after plan 02 (registry + program) avoids wiring a fifth
bespoke `encode*` by hand and then migrating it.

## Open questions

1. **Fate of the 24–40 px photo-thumbnail band** for anonymous SDSS/DSS
   galaxies: retire in favor of impostors (kills the fixed-cutout quality
   problems in `backlog/2026-06-29-thumbnail-quality-sdss-dss.md` for the
   in-scene path), or keep photos as "real data" and use impostors only
   8→24 px? Famous curated WebP/hi-res stays either way.
2. **Archetype cardinality**: how few layers before the eye spots repeats?
   (Mitigations: per-instance hue from the existing colour-index ramp,
   random flip/rotation, brightness scale — all free in the vertex/fragment.)
3. **Flux calibration constant(s)**: one global bake exposure vs per-category;
   needs the visual gate.
4. **Full-geometry budgets per tier** and the residency cap; whether budget
   scales with apparent size.
5. **Inclination**: accept face-on-squash approximation (status quo) or add
   2–3 baked inclinations per archetype later.
