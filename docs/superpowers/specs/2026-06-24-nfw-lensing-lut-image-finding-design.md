# NFW gravitational-lensing image-finding via a precomputed 2D LUT

**Status:** design / awaiting plan. The shared-`LensingUniforms` extraction has
landed, but in a *split* form (see "Architecture fit" — lensing co-hosts the
`@group(3)` focus group for points + pick, with a standalone BGL reserved for the
volume raymarch). This spec lands for the **points + pick** pipelines
independently; wiring the LUT into the MCPM volume raymarch rides the later
volume-lensing phase.

**Goal:** Render the *correct* NFW multi-image structure (primary + inner /
counter image) with physically-accurate magnification, without per-vertex
root-finding, by precomputing the inverse of the NFW lens equation into a 2D
texture LUT on the CPU and sampling it in the points vertex stage.

## Why this exists

The lensing prototype draws each source as two quads: a primary image
(`vertex_index` 0..5) and a counter-image (6..11). The counter-image placement
and the magnification are currently the **SIS** closed-form result, hard-coded
in `points/vertex.wesl`:

```
let thetaC = bestDelta - bestBeta;          // counter exists when δ > β
dirImage = bestDirLens*cos(thetaC) - bestTangent*sin(thetaC);
lensMu = bestDelta / bestBeta - 1.0;        // SIS counter magnification
```

These are exact for SIS because its deflection `δ = θ_E` is **constant**, so
`dθ/dβ = 1`, the lens equation `β = θ − θ_E` inverts in closed form, and the
inner image sits cleanly at `θ = θ_E − β`.

The NFW profile breaks all three assumptions: its deflection `δ(β)` rises to a
peak near the scale radius then falls as `~ln(x)/x`. Applying the SIS counter
formula to NFW therefore:

- places a counter quad wherever `δ(β) > β` — an annulus that does **not**
  correspond to a real NFW image (the visible "second set of points" artifact);
- reports the wrong magnification (`1 + δ/β` is not the NFW `μ`).

A real NFW lens has a **radial critical curve** in addition to the tangential
one and can produce up to **three** images. Recovering them means inverting
`β = θ − α(θ)`, which has no closed form. This spec is how we do that
inversion cheaply.

The immediate, separate stopgap (shipped ahead of this spec) is to render the
**primary image only** in NFW mode — correct as far as it goes, but no inner
image and an approximate magnification. This spec supersedes that stopgap.

## Why not in-shader root-finding

Inverting `β = θ − α(θ)` per vertex would mean a Newton/bisection loop (3–5
iterations) **per vertex per lens per frame** — branchy, divergent, and run
across ~2.5M points × N lenses × 2 quads. The inversion is the expensive part
and it does not change frame-to-frame for a given `(source position, strength)`
pair. So we precompute it **once on the CPU** and reduce the shader to a single
texture fetch — which is also *cheaper* than today's analytic `nfwShape`
(`log`/`acos`/`sqrt` per vertex).

## The dimensionless lens equation

Work in scale-radius units so a single table is universal (independent of
camera, cluster, and zoom). For a source behind one NFW lens, with
`D_l` = eye→lens distance, `r_s` = scale radius (Mpc), and the per-source
distance factor `distFactor = D_ls/D_s`:

- image position (dimensionless): `x = θ · D_l / r_s`
- source position (dimensionless): `y = β · D_l / r_s`
- reduced strength (dimensionless): `s = strength · distFactor · D_l / r_s`

where `strength` is the peak angular deflection (the UI-exaggerated knob, same
as SIS mode). The angular lens equation `β = θ − strength·distFactor·nfwShape(θ·D_l/r_s)`
multiplied through by `D_l/r_s` becomes:

```
y = x − s · nfwShape(x)
```

`nfwShape(x)` is exactly the peak-normalised Wright & Brainerd shape already in
`lib/lensing.wesl`. Given `(y, s)`, solve for all real `x`. Each solution is a
signed image position: `x > 0` is the same side of the lens centre as the
source (the primary, outer image), `x < 0` is the opposite side (the
counter-image). All images lie on the source–lens line, so the shader places
each by rotating `dirLens` toward the tangent by the signed angle
`θ = x · r_s / D_l`.

### Magnification

For an axisymmetric lens the magnification factors into tangential and radial
eigenvalues:

```
μ(x, s) = 1 / | (y/x) · (dy/dx) |,   with   dy/dx = 1 − s · nfwShape'(x)
```

`nfwShape'` is taken numerically (central difference) during LUT generation —
no analytic derivative needed. `μ` diverges at the critical curves; it is
clamped to `MU_MAX` (the existing finite-source cap) when baking, so the
texture holds finite values.

## The 2D LUT

A texture indexed by `(y, s)` storing, per cell, the rendered image set:

| channel | meaning |
| --- | --- |
| `x_primary` | signed dimensionless position of the outer image (always present) |
| `mu_primary` | clamped magnification of the primary |
| `x_counter` | signed position of the brightest secondary image (0 ⇒ none) |
| `mu_counter` | clamped magnification of the counter (0 ⇒ none) |

Four f32 channels → one `rgba32float` texel per `(y, s)`. The primary always
exists (for `s` below the critical value it is simply `x ≈ y`, `μ ≈ 1`); the
counter exists only when `y` is inside the radial caustic.

**Generation (CPU, once at startup):** for each grid cell `(y, s)`, sample
`y(x) = x − s·nfwShape(x)` densely over `x`, bracket sign changes to find all
roots, refine by bisection, compute `μ` at each root, then select the outer
root as primary and the brightest opposite-side root as counter. NFW's third
image (when present) is dropped to fit the two-quad budget — `log()` how often
that happens so the truncation is visible, not silent.

**Axes / ranges (calibration sub-task):**
- `y ∈ [0, y_max]`: beyond the outermost caustic only the primary survives with
  `x → y`, `μ → 1`, so `y_max` of a few units suffices.
- `s ∈ [0, s_max]`: `s = strength·distFactor·D_l/r_s`, and `D_l/r_s` can reach
  ~10³ for a distant cluster with a sub-Mpc `r_s`, so `s` spans a wide range
  and the `s`-axis should be **log-scaled**. The exact `s_max` and resolution
  are tuned against the runtime range of `strength` (slider max × significance)
  and the visible caustic sharpness. This is the one genuinely empirical part of
  the work.

**Storage:** an `N×M` `texture_2d<f32>` (e.g. 256 × 64 to start). Never
`texture_1d` even for a 1-D slice — iOS/WebKit rejects `texture_1d` sampling and
silently drops the whole frame (see CLAUDE.md). Bilinear sampling smooths the
magnification spikes at caustics, which is acceptable given the `MU_MAX` clamp.

**Filtering caveat (resolve in the plan):** a `linear` sampler on an
`rgba32float` texture requires the `float32-filterable` device feature, which is
**not** universal (and WebKit is strict). Three options, cheapest first: (a)
store the LUT as `rgba16float` and sample `linear` (half precision is plenty for
clamped deflections/magnifications — likely the default); (b) request
`float32-filterable` at device creation and keep `rgba32float`; (c) keep
`rgba32float` with a `non-filtering` sampler and do bilinear by hand via four
`textureLoad`s. Pick (a) unless 16-bit precision proves visibly insufficient at a
caustic.

## Shader integration

In `points/vertex.wesl`, per source per dominant lens (NFW mode only — SIS keeps
its analytic path):

1. compute `y = β·D_l/r_s` and `s = strength·distFactor·D_l/r_s`;
2. map `(y, s)` to texture UVs (log-map the `s` axis to match generation);
3. `textureSampleLevel` the LUT once;
4. primary quad: `θ = x_primary · r_s / D_l`; `dirImage = dirLens·cos(θ) + tangent·sin(θ)`; intensity ×= `mu_primary`;
5. counter quad: if `x_counter == 0` (no secondary) cull the quad via the
   existing degenerate-clip early-out; else `θ = x_counter · r_s / D_l` (signed,
   so a negative `x_counter` rotates to the opposite side) and intensity ×= `mu_counter`.

This unifies primary and counter — both become "rotate `dirLens` by
`x·r_s/D_l`" — and deletes the SIS-specific counter branch for NFW. The
multi-lens summation for the primary is unchanged; the LUT resolves the
**dominant** lens's image structure (the one already chosen for the counter).

## Architecture fit

Lensing did **not** end up in a single shared bind group. The extraction split
it into two homes, and the LUT follows the same split — one texture object,
referenced from both groups, exactly how the lens *buffer* is shared today:

- **Points + pick** read lensing from the **`@group(3)` focus group**
  (`focusUniforms` BGL), which already carries `@binding(0)` focus +
  `@binding(1)` the lensing buffer. Extend that BGL with two **VERTEX-visible**
  entries — `@binding(2)` the LUT `texture_2d<f32>` and `@binding(3)` a clamped,
  linear `sampler` — and add them to the single shared focus bind group. Group 3
  is the only group the secondary pick renderers (structure rings, Milky-Way)
  don't declare, so this ripples to nothing else; the impostor-disk pipelines
  inherit the entries unused (as they already do the lensing buffer). The
  deflection is read in the vertex stage, so VERTEX visibility suffices here.

- **The MCPM volume raymarch** (deferred to the volume-lensing phase) reads the
  same LUT in its **fragment** stage via the standalone `lensingUniforms` BGL
  (`VERTEX|FRAGMENT`). When that phase lands, extend *that* BGL with the texture
  + sampler (fragment-visible) and bind the same texture object. Nothing in the
  points/pick landing depends on it.

This still reverses the prototype's original reason for staying analytic
(avoiding a texture+sampler on the shared *pick* pipeline): the cost is one pair
of bindings on a group the pick pass already carries, not a per-renderer burden.

The LUT texture is uploaded once at startup (it is dimensionless and universal);
it never re-uploads on camera move, zoom, or strength change, because `strength`
and `r_s` enter only through the per-source `(y, s)` computation, not the table.

## Multi-lens and image-count caps (carried forward, stated explicitly)

- **Two quads per source.** NFW's third (radial) image is dropped. A future
  extension could widen the draw to three quads.
- **Single-lens LUT.** The table solves one lens's image structure exactly; the
  N-lens problem stays the existing summed-primary + dominant-lens-counter
  approximation (the exact N-lens inversion is `2^N`).
- **Caustic smoothing.** Bilinear LUT sampling rounds off the magnification
  divergence; bounded by `MU_MAX`.

## Out of scope (deferred)

- The third NFW image (needs a third quad).
- Per-lens `r_s` from a real mass–concentration relation (currently one shared
  `lensScaleRadiusMpc`); the LUT is already `r_s`-agnostic via the `s` axis, so
  this is independent.
- Time-delay / arc morphology — we render point images, not extended arcs.

## Open questions / calibration

1. `s`-axis range and scaling (log base, `s_max`) — the one empirical tuning
   task; validate against the runtime `strength`/`r_s` range.
2. LUT resolution (`256×64`?) vs caustic sharpness — bump until the ring/arc
   reads cleanly, watch texture-cache cost.
3. Whether to fold SIS into the same LUT for uniformity (cheap, closed-form) or
   keep SIS on its existing analytic branch. Default: keep SIS analytic.

## Implementation sketch (files)

- `tools/`/`src/utils/lensing/buildNfwLensLut.ts` — pure CPU generator:
  `(resolution, sMax) → Float32Array` (rgba32float texels), via root-find + `μ`.
  Unit-tested against known limits (`s→0 ⇒ x≈y, μ≈1`; super-critical `s` ⇒ two
  opposite-side images).
- `src/services/gpu/resources/createNfwLensLutTexture.ts` — upload the
  `Float32Array` into an `N×M rgba32float texture_2d` + sampler; expose the one
  texture object for the focus bind group now (and the standalone lensing group
  in the later volume phase).
- extend `bindGroupLayouts/focusUniforms.ts` (the points/pick home) with the
  `@binding(2)` texture + `@binding(3)` sampler entries, and
  `createFocusUniformBuffer.ts` to put them in the shared focus bind group. The
  standalone `bindGroupLayouts/lensingUniforms.ts` gains the matching
  fragment-visible entries only when the volume-lensing phase wires the raymarch.
- `points/vertex.wesl` — declare `@group(3) @binding(2)` the LUT texture +
  `@binding(3)` the sampler, sample once for the dominant NFW lens, and replace
  the SIS counter branch for NFW. (The volume fragment declares its own copy
  against the standalone group in the later phase.)
- a small `?gpuLensLut` debug overlay (optional) to visualise the table.
