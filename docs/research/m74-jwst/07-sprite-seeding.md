# Map-seeded dust sprites: why high frequencies die, and smarter seeding (2026-08-03)

Analysis of the LIVE dust path on `milky-way-analytic-field` @ `133295cf`
(read-only): `buildDustParticleCloud` → `buildClusteredDiscPlacement`
(`'mapDensity'`) → `dustMap.wesl` splats + baked ridged-noise erosion.
The event-catalog carving path is debug-overlay-only and is NOT analysed here.
Constraint from the user: whatever changes, per-frame cost must not grow.

## The pipeline as built

1. CA output packed to RGBA8 log-polar (az×rings, GPU 768×256), read back once
   per generation → `GalaxySfMap` (8-bit) + `GalaxySfMapOrientation`
   (double-angle × coherence, f32).
2. ≤40k particles in complexes of `1 + 15·clumpiness` children. The COMPLEX
   centre is the only thing that reads the map density: 24 uniform proposals
   over the annulus, rejection-sampled against `gas × oldActivity`
   (normalised by grid max), best-of-24 fallback.
3. The complex frame is rotated toward the orientation field once, at the
   complex centre, coherence-weighted. Children scatter around it as a fixed
   Gaussian (`COMPLEX_SPREAD_PC = 250` σ, × global `elongation` along), radius
   drawn location-blind from R^-2.2 over [15, 200] pc, mass ∝ R² (Larson).
4. `dustMap.wesl` draws one square quad per particle (scalar `boundRadius`)
   into the divisor-res column map; ridged noise (500→62 pc octaves) erodes.

## Why the map's high frequencies don't survive

**M1 — the child scatter is a 250 pc low-pass, and it is map-blind.** Only
~count/children ≈ 4.4k complex sites sample the 196k-texel map; every child
then lands wherever a fixed isotropic-ish Gaussian says, walls or cavities
alike. A 1–2-texel wall convolved with a 250 pc σ blob is gone; a cavity
straddled by a complex gets bridged. This is the dominant loss.

**M2 — the rejection sampler is biased against exactly the structures that
matter.** Thin walls are high-density but tiny-area, so 24 uniform proposals
rarely land on one; complexes that exhaust their tries take the best of 24
uniform probes, which systematically favours broad moderately-bright regions
over sharp ridges. The sampler is only unbiased when acceptance succeeds;
on a sparse high-contrast map (the foam we WANT) the fallback dominates.

**M3 — size and anisotropy are location-blind.** A wall wants splats with
across-σ ≈ wall width (30–80 pc) and long along-σ; a quiet region wants round
blobs. Today a 200 pc round draw can land on a 40 pc wall (blurs it 5×) and a
15 pc draw in open disc (invisible speckle). The global `elongation` knob
cannot express "thin where coherent".

**M4 — orientation is frozen per complex.** Children up to ~500 pc from the
centre inherit one texel's orientation; filament curvature inside a complex is
lost, so even well-placed children cross their own wall.

**M5 — 8-bit saturation flattens placement inside walls.** `oldActivity`'s
EMA pins at 1.0 over active regions (the display-saturation trap sf-map.md
already records); density becomes a plateau there, so placement within a
saturated wall complex is uniform — no ridge-line preference.

## Smarter seeding, in order of leverage (all CPU-build-time; per-frame cost unchanged)

**S1 — replace rejection sampling with an inverse-CDF texel sampler.** Once
per readback, prefix-sum `density × texelArea` over the grid (one pass,
~196k adds; texel area ∝ r² on the uniform log-polar grid — don't skip the
weight or the outer disc over-seeds). Complex placement = one binary search
(~18 steps) + jitter within the texel. Exactly density-proportional — a
one-texel wall gets precisely its fair share — and CHEAPER than today (24
`densityAt` calls each doing its own ring binary-search). Kills M2 outright.
Purity survives: the CDF is data derived from the map argument.

Details that make S1 the right shape here, beyond exactness:

- Draw `u ∈ [0, total)`, upper-bound binary search, then jitter INSIDE the
  texel footprint (uniform in θ, area-uniform in r: `r = sqrt(r0² +
u·(r1²−r0²))`) — reconstructs the map piecewise-constant at its own
  resolution, which is exactly the frequency content being lost today.
- Rejection's bias GROWS with map contrast (acceptance rate = mean/max; a
  good foam map is high-contrast by definition, so the best-of-24 fallback —
  a blob-favouring argmax of uniform probes — dominates). CDF accuracy is
  contrast-independent: the better the CA output, the worse rejection gets.
- The `maxSfMapDustDensity` full-grid scan becomes the prefix-sum pass; the
  grid-max normalisation and its landmine comment disappear (a CDF needs no
  normalisation). `total === 0` falls back to `'smoothDisc'` like today.
- FIXED rng draws per complex (rejection consumes 2–48, so one knob change
  re-rolls every downstream complex; the draw order is load-bearing per
  `clusteredDiscPlacement.ts`'s own header). Placements move continuously
  under tuning instead of scrambling.
- Optional: stratified draws `u_k = (k + rng())/K · total` — even coverage
  along walls instead of Poisson clumps (attacks the "maximum-variance
  placement" shot noise the branch docs name). Alias table is the O(1)
  escalation if complex counts ever grow 100×; unnecessary at ~4.4k.
- Accumulate the sum in f64 (plain JS number), store Float32Array (~768 KB,
  rebuilt per readback, not per frame).

**S2 — children trace the filament instead of a blind Gaussian.** Walk
children from the complex centre in arc steps along the locally RE-SAMPLED
orientation (±along the double-angle direction, one orientation read per
child — nearest-texel, trivial), with across-jitter σ tied to wall width
(small, or ∝ (1 − coherence)). Complexes become short streamline segments —
beads strung along walls, following curvature — instead of blobs straddling
them. Kills M1 and M4. Cost: one extra map read per child (~40k reads,
microseconds against the gaussians already drawn).

**S3 — let the map set child size, aspect, and survival.** Per child, read
density + coherence at its own position: density below a floor (cavity) →
drop or fade the child (renormalise the Larson mass budget afterwards so
`dust.tau` stays honest); coherence high → across-σ small, along-σ long;
coherence low → round, allow the larger radius draws. Keep the R^-2.2 draw as
the isotropic base so the measured size function still anchors the
population. Kills M3 and stops cavity bridging from the residual scatter.

**S4 — sample the map directly in the fragment for the top octave (the
fidelity ceiling).** 40k sprites cannot reconstruct a 196k-texel field; the
packed map is ALREADY GPU-resident. Add one log-polar read of it in the
dust-map consumers (world → ring/az is an `atan2` + `log` per fragment, at
divisor resolution — cheap) and use it as the HIGH-PASS modulation on the
splat-accumulated column: `column × f(mapDetail)` where the detail term is
the map divided by a pre-blurred copy of itself (one small extra texture, or
a mip level) so the splats keep owning the low/mid frequencies and nothing
is double-counted. Sub-texel detail stays with the baked ridged noise, which
already exists for exactly this role. This is the only option that captures
ALL the map's frequency content, and it adds instances: zero.
Try it in the JWST/dustPresent view first — it is the view being compared
against M74 — before wiring it into the attenuation read.

**S5 — only if S1–S3 raise elongation: oriented quads.** `splatNdc` sizes a
SQUARE from scalar `boundRadius = max(σ)`, so an elongated splat rasterises
fragments ∝ along² and wastes ∝ elongation. Before pushing aspect ratios past
~2–3, size the quad per-axis from the covariance (an OBB in the vertex
shader) so fragment cost tracks along×across. This is the one place the
fidelity work could silently cost per-frame time; gate it with `npm run perf`
before/after per the perf skill.

**S6 — if wall placement still looks plateau-flat after S1–S3:** the fix is
at the PACK, not the sampler — log-encode or rescale `oldActivity` so walls
keep gradient (same landmine as the dust-channel sketch's clamp note), or
widen the readback to 16-bit. 8-bit is fine once the channel isn't pinned.

## Is the structure tensor the right orientation source?

Verdict: keep the concept and the machinery, repoint the input; one causal
replacement candidate waits in the wings. Perf is not a factor (three small
one-shot passes). Its junction behaviour is a FEATURE: coherence drops at
wall Y-junctions and in isotropic blobs, which is exactly where S3 should
render round splats.

Structural weaknesses (all input-side, not tensor-side):

1. It differentiates `oldActivity`, whose EMA pins at 1.0 over active
   regions — and flat-white ≡ black to a structure tensor (zero gradient,
   coherence 0) exactly on the structures that need orientation. A starved
   input, not an estimator defect (sf-map.md's display-saturation trap).
2. Ridge crests are gradient nulls — centreline orientation comes entirely
   from the blur window, weakest where S2's streamlines need it most.
3. It re-estimates, with blur-smearing, information the automaton had.

Three moves, in order:

- **Now**: coherence-0 fallback = the analytic shear direction (azimuthal
  rotated by local winding, from `sfMapShear`) instead of the unwound disc
  frame — spurs are shear-stretched, so this is the correct prior where the
  tensor abstains.
- **When the dust channel lands**: repoint the tensor at the dust channel —
  thin density ridges with two-sided gradients are its best-case input, and
  the saturation blindness disappears.
- **Eventually**: the pack's UNUSED ALPHA channel can carry a causal
  orientation — at ignition the cell knows which neighbour lit it (or use
  the `age` channel as a time-of-arrival field: its gradient is the front
  direction, well-defined at crests where the density gradient is null).
  Zero passes, no blur; the tensor demotes to a validation overlay via the
  existing crossfade debug views.

Decide "drop it" on measurement, not taste: `orientationDeltaStats` + the
orientation debug view already exist. Low mean |delta| with near-zero
coherence over the grid (which the saturation trap predicts today) indicts
the INPUT, not oriented splats — S2/S3's gains all assume a usable
orientation field.

## 2D map → 3D placement: the column invariant

Treat the map as COLUMN density Σ(r,θ) and lift with a normalised vertical
profile about the warped surface:

```
(r, θ)  ← inverse-CDF over density × texelArea          (S1)
y       ← warpHeight(r, θ) + hz(r, local map state) × profileDraw()
frame   ← warpSurfaceFrame(r, θ) rotated to orientation (exists)
```

Because the profile integrates to 1, the face-on column is INVARIANT to the
vertical model — seeding fidelity (S1–S4) and the 3D lift are fully
decoupled; neither can break the other. The vertical model only shows
edge-on, in parallax, and from inside the disc (the MW goal).

What makes `hz` real rather than a slab:

1. **Height anti-correlates with density** — cold dense material settles
   (molecular/filament layer ~50–75 pc; diffuse dust 2–3× higher; bulk
   anchor is the existing `heightRatio` 0.35). `hz ∝ 1/(1 + k·density·coherence)`:
   walls hug the midplane, haze puffs. Edge-on this is the sharp dark rift
   in a softer layer; face-on it is correct parallax layering.
2. **Flare**: `hz(r)` grows outward — one multiplier.
3. **Activity puff (optional, default off)**: heavier-tailed profile draw
   (exponential) where `recentSf` is high — build-time proxy for
   fountain/chimney venting (supernovae doc §5).

Per-cloud flattening (`CLOUD_POLE_RATIO`) is the cloud's own geometry and
stays; the LAYER thickness lives in the complex/child vertical draws
(today's `sigmaZComplex`), which is currently a uniform slab: one global σ,
constant child pole scatter, no density–height coupling, no flare.

**Checkpoint for the branch agent (INFERRED from reading, verify):**
`placeMapDensityComplex` builds its centre as `[x, gaussian·σz, z]` —
`warpHeight` is never added (the frame is warp-aware, the position is not).
Arm-lane complexes DO inherit warp through the ridge point, so with a
non-zero warp, map-seeded dust sits flat while arm clouds bend — the same
fan-apart failure class analytic-field.md records for the emission shear.

Perf: one `warpHeight` call + one modified σ per particle, build-time only.

## Sequencing and how this meets the dust-channel sketch

S1→S2→S3 are self-contained CPU changes, individually toggleable, testable in
the tool's debug-view crossfade against the map overlay; S4 is a shader
change with a natural first home in the JWST view; S5/S6 are gated
follow-ups. When the CA grows the conserved dust channel
([06-ca-dust-channel-sketch.md](06-ca-dust-channel-sketch.md)), only the density
callback changes (`dust` channel instead of `gas × oldActivity`) — the CDF
sampler, streamline children and per-child modulation all carry over
unchanged. That decoupling is the argument for doing the seeding work first:
it improves fidelity now and becomes the delivery mechanism for the rims and
cavities later.
