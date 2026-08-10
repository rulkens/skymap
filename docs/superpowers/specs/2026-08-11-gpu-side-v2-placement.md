# GPU-side v2 placement — moving the ISM map's CPU placement onto compute

Branch: `spike/dust-seeding` (PR #544, open — see "Relationship to the merge
decision" below). Depends on the dependency trace over
`tools/galaxy-renderer/src/engine/ismMap/` and
`src/services/engine/galaxyGenerator/v2/` cited throughout.

## Goal

The v2 analytic galaxy generator (dust clouds, HII regions, DIG veil) places
its particles on the CPU, seeded from an ISM density map that only exists on
the GPU — every rebuild round-trips two 1536x512 `rgba16float` textures
through `mapAsync` to feed a JS CDF sampler. That round trip is fine for a
single Milky Way baked once; it cannot survive the destination this is phase
1 of — real-time analytic generation for every catalog galaxy on fly-by, at
60fps, with no bake step. This spec moves the **map-dependent** half of v2's
placement into compute passes so the placement-critical path never leaves
the GPU. Readbacks do not disappear: they demote to a debug-gated
diagnostics path (orientation coherence stats, tool overlays), which never
gates a frame.

## Non-goals

- The **map-independent** tiers (`armParticleCloud.ts`, `armSpurParticleCloud.ts`,
  `youngStarChain.ts`, `dustBubblePlacements.ts`, `sfEventCatalog.ts` — roughly
  870 lines) stay CPU. They don't read the map; there is no round trip to cut.
- Folding the galaxy engine into the main app beyond this placement seam —
  the render targets, the tool's own UI, the fluid sim itself — is out of
  scope. This is the placement layer only.
- Per-galaxy instancing / the N-galaxies-at-60fps scheduler is a later phase;
  this spec produces the primitive it needs (placement with zero readback),
  not the scheduler that calls it per catalog galaxy.

## Ground preparation

### Ideal shape

Today the record layout the splat shaders read — 16 f32 lanes per
`GalaxyFieldComponent`, four `vec4`s — has exactly one authority: a comment
block (`src/services/gpu/shaders/milkyWay/field/io.wesl:257-278`) that the
CPU packer (`tools/galaxy-renderer/src/engine/field/packFieldUniforms.ts`,
`packFieldComponents` at line 288) must hand-track. There is no WGSL
`struct` — `comps` is declared `array<vec4<f32>>` at `io.wesl:365`. That was
fine while only one writer (the CPU packer) and one reader (the splat
shaders) existed. A placement compute pass is a second writer of the same
buffer; without a struct neither writer has anything to typecheck against,
and a lane drifting out of sync ships wrong colors or shapes with no error —
the same failure mode `packIsmMapFluidConstants.ts`'s own header calls out
verbatim ("a lane written to the wrong index throws nothing, it just ships
garbage").

The fix already has a house precedent: `ismMapFluidStep.wesl`'s
`IsmMapFluidConstants` struct is the offset authority, and
`packIsmMapFluidConstants.ts` is a hand-written mirror kept honest by
`tests/tools/galaxy-renderer/engine/ismMap/packIsmMapFluidConstants.test.ts`
(reads the `.wesl` source as text, regex-extracts the struct's fields, and
asserts the TS packer writes each at the offset the struct declares — the
same technique `tests/services/gpu/shaders/constants.parity.test.ts` uses for
mirrored scalar consts). The ideal shape for the record layout is the same
move: a `records.wesl` struct becomes the one authority, and
`packFieldUniforms.ts` becomes a parity-tested mirror instead of the sole
source of truth.

### Verdicts

| touchpoint | verdict | blocker |
|---|---|---|
| record layout authority (WGSL struct vs. comment+packer) | bolt-on today, growth once `records.wesl` exists — a compute-authored buffer with no WGSL struct is a second undocumented writer | `io.wesl:365`'s bare `array<vec4<f32>>`, `packFieldUniforms.ts` |
| rebuild triggering placement | growth — `createKeyedRebuild` (`orientationDataRebuild`, `orientationTexRebuild` in `createGalaxyModel.ts`) already resolves a "wanted" predicate to a `build()` closure; a compute-pass encode is just a different closure body at the same seam | none |
| density CDF (prefix sum + binary search) | growth — `buildIsmMapDustCdf`'s annular-sector weighting and `sampleIsmMapDustCdf`'s upper-bound binary search are both algorithms with direct GPU analogues (parallel scan, per-invocation binary search over a storage buffer); no redesign, a re-target | none |
| mass renormalization over survivors | bolt-on — `dustParticleCloud.ts:287-290` sums `p.radius**2` over the CPU array post-filter; there is no GPU reduction primitive in the ISM-map chain to grow from | absent |

### Prep, sequenced before the feature commits

1. **`src/services/gpu/shaders/milkyWay/field/records.wesl` + a parity test**
   (`tests/services/gpu/shaders/records.parity.test.ts`, mirroring
   `packIsmMapFluidConstants.test.ts`'s read-source-as-text-and-diff
   technique) — lands before any placement shader is written, so there is
   never a moment where two writers exist without one documented contract
   between them.
2. **Name the rebuild-encode touchpoints.** `scheduleIsmMapReadback`
   (`createGalaxyModel.ts:419`) and `scheduleOrientationReadback` (`:438`)
   are today's "map landed late, rebuild placement" seam; `rebuildDustMixture`
   (`:524`) and `rebuildHiiIfSeeded` (`:390`) are what they call. The feature
   work is making these resolve to "encode a compute pass into this rebuild's
   encoder" as an alternative body, not a parallel path — no new seam to
   invent.
3. **A reduction primitive** — ring means and post-filter survivor sums, one
   small pass family, self-contained. It has no existing GPU counterpart to
   grow from (verdict above), so it is new, but it is scoped tightly: it
   replaces exactly one CPU write-back, `recomputeIsmMapSeedingMeans`
   (`createGalaxyModel.ts:349`), plus the survivor-sum loop inline in
   `dustParticleCloud.ts:287-290`.

## Design

### Density sampling: GPU CDF, not bounded rejection

**Decision:** density sampling moves as a prefix-sum (scan) pass over the map
channel — area-weighted, reproducing `buildIsmMapDustCdf`'s annular-sector
weighting (`texelArea = 0.5 * dTheta * (rOuter^2 - rInner^2)`,
`src/utils/galaxy/buildIsmMapDustCdf.ts:54`) exactly, not an approximation of
it — followed by a per-slot binary search in the placement shader,
reproducing `sampleIsmMapDustCdf`'s upper-bound search
(`src/utils/galaxy/sampleIsmMapDustCdf.ts:20-29`) over a storage buffer
instead of a `Float32Array`.

**Rejected alternative: bounded rejection sampling.** The dust-seeding spike
tried this first and explicitly replaced it (S1, see
`docs/research/m74-jwst/07-sprite-seeding.md`) — 24-try rejection against a
per-tile density estimate plus grid-max normalization, the same shape
`clusteredDiscPlacement.ts`'s `ARM_FADE_REJECTION_TRIES` (`:30`) still uses
for arm-lane placement. It produced visibly worse placement: exhausting the
budget keeps the last (unweighted) draw, leaking a uniform tail into the
density wherever acceptance runs low, and grid-max normalization wastes
almost every draw once one texel is a hard outlier. The CDF replaced it
specifically to fix this; GPU-siding the placement must preserve that
quality win, not regress to the cheaper primitive because it parallelizes
more obviously. Bounded rejection is simpler to port (no scan pass, no
binary search) — that's the entire case for it, and it's not enough.

### Record layout SSoT: `records.wesl`

```wgsl
// src/services/gpu/shaders/milkyWay/field/records.wesl
struct FieldComponentRec {
  invCovDiagonal: vec3<f32>,
  amplitude: f32,
  invCovOffDiagonal: vec3<f32>,
  boundRadius: f32,
  color: vec3<f32>,
  textureWeight: f32,
  center: vec3<f32>,
  starsWeight: f32,
}
```

Four `vec4`s, matching `io.wesl`'s existing comment-documented layout and
`GalaxyFieldComponent` (`src/@types/galaxy/GalaxyFieldComponent.ts`)
field-for-field — this is a naming pass over the existing bytes, not a
relayout. `io.wesl:365`'s `comps: array<vec4<f32>>` becomes
`comps: array<FieldComponentRec>`; every splat shader that reads `comps[i].xyz`-style
swizzles today keeps working unchanged (a `FieldComponentRec` reinterpreted
as 4 `vec4`s is bit-identical). `packFieldUniforms.ts`'s `packFieldComponents`
(`:288-309`) stops being the layout authority and becomes a mirror the parity
test checks against the struct.

### Rebuild-encode seam

`createKeyedRebuild`'s existing shape (`wanted()` predicate → `build()`
closure, see `orientationTexRebuild` at `createGalaxyModel.ts:484`) is where
placement dispatch attaches. The two readback-triggered rebuilds —
`scheduleIsmMapReadback` (`:419`) and `scheduleOrientationReadback` (`:438`)
— exist today because the map lands asynchronously after the synchronous
build that asked for it; a GPU-side placement pass removes the asynchrony
(the compute pass runs against whatever the ISM-map generator wrote this
rebuild, in the same encoder), so these two functions' CPU-rebuild bodies are
what gets replaced. `rebuildDustMixture` (`:524`) and `rebuildHiiIfSeeded`
(`:390`) are the CPU placement entry points today; GPU-side, the analogous
entry point is "encode `placeDust`/`placeDigVeil` into this rebuild's
encoder," sharing the one-encoder-one-submit discipline
`encodeDustBlurPass`/`encodeCartesianBakePass` already establish
(`createIsmMapOutput.ts:229-246`).

### New shader files (contract only)

```wgsl
// src/services/gpu/shaders/milkyWay/ismMap/ismMapDustCdfScan.wesl
// Prefix-sum over the map's dust channel, area-weighted per
// buildIsmMapDustCdf's annular-sector term. One thread group per ring,
// workgroup-scan within the ring, then a second pass folds ring totals
// into a running offset — exact structure is implementation detail.
@compute @workgroup_size(ISM_MAP_WORKGROUP_SIZE)
fn cs(@builtin(global_invocation_id) id: vec3<u32>) { }
```

```wgsl
// src/services/gpu/shaders/milkyWay/ismMap/placeDust.wesl
// One invocation per dust-particle slot (MAX_PARTICLE_COUNT = 40000 ceiling,
// dustParticleCloud.ts:40). Binary-searches the scanned CDF for this slot's
// texel, draws (radius, angle) inside it via the slot-hash RNG (see RNG
// section below), applies the survival floor (DUST_SURVIVAL_FLOOR_FRAC,
// dustParticleCloud.ts:106) by zeroing amplitude on failure rather than
// compacting the array, and writes one FieldComponentRec.
@compute @workgroup_size(ISM_MAP_WORKGROUP_SIZE)
fn cs(@builtin(global_invocation_id) id: vec3<u32>) { }
```

```wgsl
// src/services/gpu/shaders/milkyWay/ismMap/placeDigVeil.wesl
// Hierarchical complex-then-children placement over the DIG_MAX_COUNT
// (hiiRegions.ts:109) budget, CDF-sampled from the activity channel
// reweighted by arm proximity (armBiasedDensity, hiiRegions.ts:534) rather
// than raw dust — so the scan pass takes a per-texel weight input, not a
// bare channel index, and the arm-proximity envelope becomes a small
// uniform table the scan can evaluate per texel.
@compute @workgroup_size(ISM_MAP_WORKGROUP_SIZE)
fn cs(@builtin(global_invocation_id) id: vec3<u32>) { }
```

```wgsl
// src/services/gpu/shaders/milkyWay/ismMap/ringReduce.wesl
// Two outputs sharing one dispatch shape: (a) per-ring means of a channel
// (replacing recomputeIsmMapSeedingMeans's CPU write-back,
// createGalaxyModel.ts:349), (b) the post-placement survivor R^2 sum
// dustParticleCloud.ts's Larson renormalization needs (:287-290) — both are
// a reduction over the same ISM_MAP_RINGS x ISM_MAP_AZ (or slot-count)
// domain, hence one shared pass family rather than two bespoke ones.
@compute @workgroup_size(ISM_MAP_WORKGROUP_SIZE)
fn cs(@builtin(global_invocation_id) id: vec3<u32>) { }
```

`placeDust`/`placeDigVeil` write directly into the `comps` buffer
(`createGrowOnlyRecordBuffer`'s `GrowOnlyRecordBuffer`,
`tools/galaxy-renderer/src/engine/gpu/createGrowOnlyRecordBuffer.ts`) at this
tier's fixed slot range — the v1 sprite tier's own discipline
(`carveStarLayout.ts`/`carveDustLayout.ts` carve exact counts CPU-side,
`generate.wesl` fills fixed GPU slots, a per-record `alive: bool` marks the
ones a retry budget couldn't place — see `StarRec.alive`,
`generate.wesl:397-527`). `FieldComponentRec` has no boolean lane, so the
GPU-side equivalent is amplitude-as-liveness: a Gaussian splat with
`amplitude = 0` draws nothing, the same practical effect as v1's `alive =
false`, without adding a lane no other consumer needs. `placeDust`/
`placeDigVeil` follow the same shape: the CPU still decides *how many* slots
exist (`MAX_PARTICLE_COUNT`, `HII_MAX_COUNT`, `DIG_MAX_COUNT` are unchanged
ceilings), the GPU decides *where* each slot lands, and a slot that fails the
survival floor zeroes its `amplitude` rather than being compacted out — no
indirect dispatch, matching v1's existing no-indirect-dispatch discipline.

### Renorm: consume-time scale, not baked mass

`dustParticleCloud.ts`'s current renormalization
(`massPerR2 = totalMass / sumR2` at `:290`, `sumR2` summed only over
post-filter survivors at `:287-288`) keeps `dust.tau` exact by redistributing
a cavity-dropped particle's mass share onto the particles that survived.
GPU-side, records carry **raw** `radius`-derived mass with no renorm baked
in; `ringReduce.wesl`'s survivor-sum output becomes a per-tier scale
**uniform**, multiplied in at splat time (`dustMap/fragment.wesl`'s
accumulation, not into the record). This is a real behavior split from the
CPU version — CPU bakes the renorm into each particle's stored amplitude,
GPU applies it as a draw-time multiply — but the two are numerically
identical at steady state, and consume-time multiply is the only shape that
survives records being written by parallel invocations with no shared
running total.

### RNG: slot-hash adoption, and its cost

v2's CPU placement draws from serial per-tier `mulberry32` streams
(`dustParticleCloud.ts:156`, `mulberry32(seed ^ 0x44555354)`) where draw
*order* is load-bearing — `clusteredDiscPlacement.ts`'s header states this
explicitly ("rng draw order is load-bearing — same seed reproduces the same
cloud"), and `applyIsmMapSeeding` (`hiiRegions.ts:411-434`) goes out of its
way to draw a fixed 4 rng calls per region specifically so the placement
slider doesn't perturb draw order. A serial stream has no meaning across
parallel GPU invocations with no defined execution order.

GPU-side placement adopts v1's slot-hash scheme instead:
`genRand(seed, pop, idx, slot)` over `pcg4d`
(`src/services/gpu/shaders/milkyWay/sprites/generate.wesl:164-185`) — a pure
function of `(seed, population, particle index, draw slot)`, stateless and
order-independent, which is exactly what a placement invocation with no
guaranteed dispatch order needs.

**This changes every draw.** The slot-hash scheme does not reproduce the
`mulberry32` stream's output for the same seed — it is a different RNG
touching the density field through a different sampling path. The
calibrated look (`docs/research/m74-jwst/` tuning, the spike's own visual
sign-off) shifts and needs **one recalibration pass** once mechanism parity
is reached. Policy: recalibrate tool-side, once, after the GPU path produces
the same *kind* of placement (CDF-correct, survival-filtered, orientation-
aspected) as the CPU path — not chase pixel-identity against the old
`mulberry32` output, which is an unreachable and pointless target once the
RNG itself has changed.

### Readbacks demote to diagnostics

`createIsmMapReadbacks` (`tools/galaxy-renderer/src/engine/ismMap/createIsmMapReadbacks.ts`)
stays — `IsmMapReadbacks.requestIsmMap`/`requestOrientation` keep copying
`ismMapGenerator.texture`/`orientation.texture` back for the tool's
diagnostics: `orientationCoherenceStats.ts`, `createOrientationDiagnostics.ts`,
and the "seeding" debug view (`ismMapPresent.wesl`, gated behind
`viewIntensity('orientation')` and similar debug-view checks already present
in `createGalaxyModel.ts`). What changes is that nothing on the
placement-critical path — `rebuildDustMixture`, `rebuildHiiIfSeeded` — reads
`readbacks.ismMapData`/`readbacks.orientationData` anymore; those fields
become diagnostics-only inputs, read by report functions
(`reportOrientationDiagnostics`, `:458`) that already exist and already run
off the same readback landing. The `createReadbackQueue`
(`tools/galaxy-renderer/src/engine/gpu/createReadbackQueue.ts`) machinery
itself — the `mapAsync` call at `:77`, the token/supersession discipline — is
untouched; it simply stops being load-bearing for what appears on screen.

## Relationship to the merge decision

PR #544 (the spike's graduation to `main`) is complete and gated on its own
terms — this spec does not add scope to it. Whether GPU-siding v2 placement
becomes a blocking condition of that merge, or lands as the first follow-up
PR once #544 is on `main`, is the user's call to make, not an assumption
this spec bakes in. Both packagings are viable: gating the merge keeps the
CPU-round-trip design from ever landing on `main`, at the cost of delaying an
already-complete, already-visually-approved feature; landing this as a
follow-up ships the spike sooner and treats GPU-siding as what it is — a
performance/architecture rework of a feature whose look is already settled,
not a correctness fix it depends on.

## Testing

- `records.parity.test.ts` — every `FieldComponentRec` field lands at the
  offset `packFieldComponents` writes it to (parity guard, same technique as
  `packIsmMapFluidConstants.test.ts`).
- `ismMapDustCdfScan` — a small fixture map's GPU scan output matches
  `buildIsmMapDustCdf`'s CPU prefix sum within float tolerance (probe-driven,
  not a WGSL unit test framework — see DoD).
- `placeDust`/`placeDigVeil` — deterministic per `(seed, grid)`; component
  count matches the CPU tier's own budget math; survival-floor zeroing is
  observable (a record's `amplitude` reads 0, not absent).
- `ringReduce` — ring means match `ismMapRingMeans`'s CPU output; survivor
  sum matches a CPU recomputation over the same GPU-placed set.
- Gate: `npm run galaxy-renderer:probe` — the only automated path that
  reaches these shaders end to end.

## Definition of done

- `records.wesl` exists and is the layout authority; `packFieldUniforms.ts`
  is a parity-tested mirror, not a second source of truth.
- `rebuildDustMixture`/`rebuildHiiIfSeeded`'s map-dependent paths encode
  compute passes; zero `mapAsync` calls sit on the path from a rebuild to a
  drawn frame.
- The probe is green; all new parity/determinism tests above are green.
- Tool diagnostics (orientation coherence overlay, "seeding" debug view)
  still work, gated behind the same debug-view checks, now reading a
  readback that is provably off the placement path.
- One visual recalibration pass, signed off by the user, closes the RNG-swap
  look shift described above.

## Open questions

- **`applyIsmMapSeeding`'s HII-shell centre override**
  (`hiiRegions.ts:411-434`): GPU-side alongside `placeDigVeil`, or dropped —
  it is a smaller, cheaper effect than the DIG veil and dust tiers, and may
  not earn a third placement shader in this phase.
