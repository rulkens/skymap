# Volumetric effects — shared raymarching framework

**Status:** Foundational rendering spec for three concrete consumers in the cosmic-zoom tour.
**Required for:** [Shell 1 — Solar System (Sun corona / photosphere)](../shells/01-solar-system.md), [Shell 6 — Virgo Supercluster (X-ray cluster halos)](../shells/06-virgo-supercluster.md), [Shell 7 — Laniakea (CF-4 dark-matter density volume + flow vectors)](../shells/07-laniakea.md).
**Related:** [`00-scale-architecture.md`](./00-scale-architecture.md) (per-shell projections + coordinate frames), [`../../specs/2026-05-07-cf4-dark-matter-volume-render-design.md`](../../specs/2026-05-07-cf4-dark-matter-volume-render-design.md) (the original CF-4 raymarcher design this generalises).

This is the most technical doc in the rendering set. It centralises the raymarching math because three different shells need it, and divergence between them would mean re-debugging the same precision and compositing pitfalls three times. A shared skeleton — with **per-effect specialisation in the density-and-shading function only** — lets each effect concentrate on its hero visual rather than its plumbing.

Project memory `feedback_wgsl_meticulous.md` applies in spades: raymarchers fail silently in many ways (wrong ray frame, wrong sample step, wrong opacity correction, wrong blend mode), and confidence in shader code without a visual side-by-side comparison has burnt us before. Every code sketch here is **reference**, not copy-paste production code; expect to iterate against the dev server.

---

## 1. Common framework

All three volumetric consumers share the same compute pattern:

1. A fullscreen (or proxy-geometry) fragment pass casts a ray from the camera through each pixel.
2. The ray is intersected against a bounding volume (sphere, AABB).
3. Within the intersected interval the shader walks the ray in `N` steps, evaluating a **density function** and a **transfer function** at each step.
4. Samples are composited front-to-back into colour and transmittance, with early-out at low transmittance.
5. The result is written into the per-shell colour attachment with a chosen blend mode.

The three consumers differ only in:

- **Density source.** Analytic radial falloff (Sun corona) vs. analytic Gaussian (X-ray halos) vs. sampled 3D texture (CF-4 DM).
- **Bounding geometry.** Sphere imposter (Sun, X-ray) vs. world-AABB (CF-4).
- **Step count.** ~24 (Sun) vs. analytic single-eval (X-ray, via closed-form Gaussian line integral) vs. 64–128 adaptive (CF-4).
- **Transfer function.** Per-effect colour ramp; common interface.
- **Blend mode.** Additive (Sun, X-ray); premultiplied alpha (CF-4, where internal occlusion is part of the look).

The shared skeleton lives in a WESL module (`src/services/gpu/shaders/lib/volumetric.wesl`) exposing ray-AABB / ray-sphere intersection, opacity correction, and a front-to-back compositor template. Each effect's `.wesl` imports the helpers and supplies `sample_density(p)` and `transfer(d) -> vec4<f32>`. WESL's `?static` import + literal `package::` prefix conventions apply (project memory `project_wesl_conversion.md`); the helper module is a true library, not a one-fn-one-file.

When one effect changes the compositor (e.g., depth-aware clipping for CF-4) the library changes and all three consumers re-link. Effect-specific tweaks stay in the consumer file. Same separation as the existing `pointRenderer` against `lib/cameraUniforms.wesl`.

---

## 2. Raymarching basics in WGSL

### 2.1 Reconstructing world-space rays

For a fullscreen pass the vertex shader emits the four NDC corners; the fragment reconstructs a world-space ray:

```wgsl
let ndc        = vec4<f32>(in.uv * 2.0 - 1.0, 0.0, 1.0);
let world_h    = uniforms.inv_view_proj * ndc;
let ray_origin = uniforms.camera_pos_shell;
let ray_dir    = normalize(world_h.xyz / world_h.w - ray_origin);
```

**Critical:** `inv_view_proj` and `camera_pos_shell` must both be in the **shell-relative frame** described in [`00-scale-architecture.md`](./00-scale-architecture.md) §"Floating origin in detail." Mixing absolute heliocentric Mpc into one and shell-local AU into the other silently produces a wrong ray with no compile error and a black screen — the classic "I see nothing" volumetric debugging hole.

### 2.2 Intersection and march

Closed-form intersections live in `volumetric.wesl`:

```wgsl
fn intersect_aabb(ro: vec3<f32>, rd: vec3<f32>, box_min: vec3<f32>, box_max: vec3<f32>) -> vec2<f32> {
  let inv_rd = 1.0 / rd;
  let t1 = (box_min - ro) * inv_rd;
  let t2 = (box_max - ro) * inv_rd;
  let tmin = min(t1, t2);
  let tmax = max(t1, t2);
  return vec2<f32>(max(max(tmin.x, tmin.y), tmin.z), min(min(tmax.x, tmax.y), tmax.z));
}
```

We **always clamp `t_enter = max(t_enter, 0.0)`** so that a camera *inside* the bounding volume marches forward, not backwards through the volume (which would mirror the result — silent failure mode #2).

The march loop:

```wgsl
let t_start = max(t_range.x, 0.0);
let dt      = (t_range.y - t_start) / f32(STEP_COUNT);
var color         = vec3<f32>(0.0);
var transmittance = 1.0;

for (var i = 0u; i < STEP_COUNT; i = i + 1u) {
  let t = t_start + dt * (f32(i) + 0.5);     // half-step centres — kills banding
  let p = ray_origin + ray_dir * t;
  let s = transfer(sample_density(p));        // premultiplied
  let a = 1.0 - pow(1.0 - s.a, dt / REF_STEP_LEN);   // opacity correction
  color         = color + transmittance * s.rgb * (a / max(s.a, 1e-6));
  transmittance = transmittance * (1.0 - a);
  if (transmittance < 0.005) { break; }
}
return vec4<f32>(color, 1.0 - transmittance);
```

Three details that bit us before and need explicit calling-out:

- **Half-step sample positions.** Sampling at edges visibly bands when the volume has high-frequency content. Half-step is the standard fix and costs nothing.
- **`pow`-form opacity correction.** Without it, a 64-step march and a 128-step march of the same volume produce different brightness and adaptive step counts (Section 6) flicker. The `pow` form is more correct than the linear `dt / REF_STEP_LEN` scaling in the original CF-4 spec; we adopt it across all three consumers in the shared library.
- **Early-out at 0.005, not zero.** Below 0.5 % transmittance, contribution is below the 8-bit display threshold — continuing wastes ALU.

---

## 3. Per-effect specifications

### 3a. Sun corona / photosphere (Shell 1)

**Bounding geometry:** the camera sits inside or near a sphere of radius `~1.5 R_sun` (≈ 0.007 AU) during the dolly-in (`T+0:01 → T+0:06`); fullscreen raymarch applies. After `T+0:06` the Sun is small on screen and an imposter quad with a baked corona ring is more efficient.

**Density function — analytic.** A `1/r²` corona falloff between photosphere and corona radius, modulated by 3D simplex noise:

```wgsl
fn sample_density(p_au: vec3<f32>) -> f32 {
  let r = length(p_au);
  let r_photo  = 0.00465;       // 1 R_sun in AU
  let r_corona = 0.007;         // 1.5 R_sun
  if (r < r_photo) { return 10.0; }    // inside photosphere — opaque-ish; ray terminates next step
  let radial = 1.0 / max((r / r_photo) * (r / r_photo), 1.0);
  let noise  = simplex3(p_au * 800.0);
  return radial * (0.7 + 0.3 * noise) * smoothstep(r_corona, r_photo, r);
}
```

The `smoothstep` ensures a graceful taper at the corona edge — no hard ring. One noise octave only; tune amplitude rather than stack frequencies.

**Transfer function.** Two-stop ramp from corona orange (`#ffd58a`) to warm white (`#fff4d6`).

**Step count.** `STEP_COUNT = 24`, `REF_STEP_LEN = 0.0005 AU`. Small in world units but dominant on screen — err on more samples.

**Imposter swap at `T+0:06`.** Single quad with a baked NASA SDO photo + corona ring sprite. Both code paths share the transfer function so colour matches across the swap. Verified by frame-diff at `T+0:05.9` vs `T+0:06.1`; a per-pixel delta > 5 % across the Sun is a regression.

### 3b. X-ray cluster halo (Shell 6)

**Bounding geometry:** one camera-facing sphere imposter quad per cluster, sized to `2 × 5σ` (covers > 99.99 % of the Gaussian). At Virgo's `σ = 0.6 Mpc` this is a 6 Mpc quad — small in screen-space at most camera positions.

**No march.** For a 3D isotropic Gaussian density, the line integral along any ray is itself a Gaussian in the perpendicular distance from the centre. We replace the loop with a single closed-form eval — 1 `exp` per fragment beats 32:

```wgsl
fn analytic_gaussian_los(ro: vec3<f32>, rd: vec3<f32>, center: vec3<f32>, sigma: f32) -> f32 {
  let oc = center - ro;
  let t  = dot(oc, rd);
  if (t < 0.0) { return 0.0; }              // cluster behind camera
  let perp_sq = dot(oc, oc) - t * t;
  return sigma * 2.5066283 * exp(-perp_sq / (2.0 * sigma * sigma));   // sqrt(2π) precomputed
}
```

**Transfer function.** Two-stop ramp from edge crimson (`#a01818`) to core orange (`#ff5a3c`), multiplied by a per-cluster `peak_density` uniform and a small 3D-noise sample (the 64³ R8 texture from Shell 6's design) at ~5 % amplitude. Without the noise, halos read as decals not gas.

**Compositing.** Additive only (`src=ONE, dst=ONE`). No depth read or write. Galaxy points draw on top in a later pass and naturally occlude. Brightness is `dt`-invariant by construction since there is no march.

### 3c. CF-4 dark-matter density volume (Shell 7)

The only true raymarcher of the three — density source is a sampled 3D texture, no closed form. Full design in [`../../specs/2026-05-07-cf4-dark-matter-volume-render-design.md`](../../specs/2026-05-07-cf4-dark-matter-volume-render-design.md); this section captures only what changes when we adopt the shared framework.

**Bounding geometry:** AABB of the CF-4 cube in shell-7 world coordinates. Fullscreen fragment pass — at Shell 7's range the cube covers most of the screen, so fullscreen is cheaper than proxy geometry.

**Density function:**

```wgsl
fn sample_density(p_world: vec3<f32>) -> f32 {
  let p_cf4 = (uniforms.world_to_cf4 * vec4<f32>(p_world, 1.0)).xyz;
  if (length(p_cf4 - uniforms.observer_voxel) > 128.0) { return 0.0; }   // half-box clip
  let delta = textureSampleLevel(field, samp, p_cf4 / 256.0, 0.0).r;
  return log(max(1.0 + delta, 1e-6));
}
```

**Transfer function.** Five-stop ramp per Shell 7 §4.1 (deep void → indigo → luminous purple → warm orange → white-hot). Inline in WGSL; no LUT texture.

**Step count — adaptive.** Default 96 (desktop) / 48 (mobile). Set per-frame from the engine, not baked into the shader. See Section 6.

**Compositing.** Premultiplied alpha into the shell-7 colour attachment. Galaxy points draw afterwards with their own alpha and naturally appear in front. Depth-aware ray clipping is deferred to v2.

### 3d. Optional — flow-vector field (Shell 7)

Not strictly volumetric — instanced 3D arrow glyphs, opaque mesh per instance, regular forward-rendered pass. Reads the 32³ subsampled velocity field, draws ~32 768 arrows with `length ∝ speed` and `colour ∝ speed`. Composites **after** the DM density so arrows are unambiguously in front. Shares only the world→CF-4 transform helper with the volumetric path.

---

## 4. Transfer functions — shared utility

Standard interface:

```wgsl
fn transfer(d: f32) -> vec4<f32>;       // returns premultiplied alpha
```

Premultiplied input lets the compositor in §2.2 stay agnostic to the transfer's internals. The library provides a `ramp2(d, c0, c1, a_max)` two-stop helper (Sun, X-ray) and a `rampN(d, stops)` for multi-stop ramps (CF-4). The library does not impose an input-range convention — each consumer documents its `density →` units in its own `.wesl` header (Sun: raw radial density; X-ray: integrated optical depth; CF-4: `log(1+δ)`).

---

## 5. Compositing — blend modes, depth, ordering

| Effect | Blend src | Blend dst | Writes depth | Reads depth |
|--------|-----------|-----------|--------------|-------------|
| Sun corona raymarch | `ONE` | `ONE_MINUS_SRC_ALPHA` (premul) | no | yes (clipped at photosphere imposter depth) |
| Sun imposter (post-`T+0:06`) | `ONE` | `ONE_MINUS_SRC_ALPHA` | yes | yes |
| X-ray cluster halos | `ONE` | `ONE` (additive) | no | no |
| CF-4 DM density | `ONE` | `ONE_MINUS_SRC_ALPHA` (premul) | no | no (v1) |

The only depth-writer is the post-`T+0:06` Sun imposter — at that point the Sun is a small bright billboard and points/labels behind it should be occluded. The other volumetrics are explicit emission; they blend into existing pixels and let later passes draw on top.

**Per-shell render order:**
- **Shell 1:** clear → orbital lines → planet billboards → asteroid haze → Kuiper haze → **Sun corona (raymarch or imposter)** → bloom post → labels.
- **Shell 6:** clear → distant point cloud → **X-ray halos (additive)** → near point cloud (within halo region) → cluster markers → filaments → labels → GA arrow.
- **Shell 7:** clear → **CF-4 DM density (premul)** → galaxy points (low alpha) → flow vectors → cosmography markers → labels.

Volumetrics draw early; opaque content draws later in front. This avoids the harder problem of interleaving translucent volume samples with point billboards on a per-fragment basis.

**Shell crossfades.** Each shell's volumetric draws into its own colour attachment; the compositor blends with `fadeAlpha` per [`00-scale-architecture.md`](./00-scale-architecture.md). No inter-shell depth resolve in v1 — the outer shell may visually punch through the inner shell's volumetric, but at typical 1–2 s transition durations this has not been a visible problem in mockups.

---

## 6. Performance — budgets and LOD

Total per-shell budgets are set in [`00-scale-architecture.md`](./00-scale-architecture.md). Volumetric shares:

| Shell | Volumetric budget | Strategy at budget |
|-------|--------------------|--------------------|
| 1 | 0.6 ms (raymarch) → 0.05 ms (imposter) | Swap to imposter at ~50 px apparent Sun size |
| 6 | 0.4 ms total for ~150 cluster halos | Analytic single-eval; no march loop |
| 7 | 4 ms desktop, 0 ms mobile (fallback) | Adaptive step count + half-res offscreen |

**Skip when off-shell.** The shared raymarcher is gated by `fadeAlphaAt`. When `fadeAlpha < 0.001` the pass does not encode at all — no clear, no draw. The CF-4 pass in particular is expensive; running it during shells 1–6 would burn 4 ms per frame for nothing.

**Lower step count when off-centre.** For CF-4, when the camera is outside the cube the marched intervals are shorter on average and fewer samples suffice:

```ts
const stepCount = camDistFromCubeCenter < cf4.boxHalfSize ? 128 : 96;
```

The opacity correction in §2.2 keeps the visual constant across step counts.

**Half-res offscreen + upscale.** For CF-4's mobile fallback (and as a desktop knob if profiling demands), render into a half-res colour target and bilinearly upsample. The volume is intrinsically smooth so the upsample artefact is invisible. Cuts fragment cost by 4× at the price of one blit. Not applied to Sun (low pixel coverage) or X-ray halos (already analytic-cheap).

**Off-screen culling for X-ray halos.** Each cluster's imposter quad does a vertex-shader frustum test and emits a degenerate triangle when off-screen. With ~150 clusters and typical Shell 6 framing, ~10–20 are on-screen at once.

---

## 7. Bind groups — and the `layout:'auto'` trap

Per project memory `feedback_webgpu_auto_layout_trap.md`, **WebGPU `layout:'auto'` derives bind-group layouts per pipeline.** A bind group built for one pipeline is invalid for another, even if binding slots look identical. Sun and X-ray are simple enough that they only ever bind to one pipeline — `layout:'auto'` is fine. CF-4 is consumed by the density renderer and (potentially) future debug pickers and demands an **explicit `GPUBindGroupLayout`** declared once and shared:

```ts
// src/services/gpu/cf4DensityBindGroupLayout.ts — declared once, exported.
export const CF4_DENSITY_BIND_GROUP_LAYOUT_DESCRIPTOR: GPUBindGroupLayoutDescriptor = {
  entries: [
    { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
    { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float', viewDimension: '3d' } },
    { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
  ],
};
```

Any consumer builds its pipeline with `layout: device.createPipelineLayout({ bindGroupLayouts: [explicitLayout] })` and the same bind group is valid against all of them.

**Sharing buffers across pipelines is fine.** What's *not* fine is reusing a bind group built for pipeline A with pipeline B. Shell 6's X-ray halo pipeline and point pipeline share the same camera uniform *buffer* but build their own *bind groups* against it.

The CF-4 density texture is created `format: 'r16float'`, dimension `'3d'`, size `[256, 256, 256]`, populated via `device.queue.writeTexture(...)` in one shot at construction. The `Uint16Array` from the `.bin` file is the raw f16 payload — no per-voxel conversion. Total upload ≈ 32 MB; happens once at Shell 7 first-activation.

---

## 8. WGSL code sketches

Reference sketches; pseudocode tightened with WGSL syntax. Match against actual shader files during implementation, and **verify visually** before claiming any of them work.

### 8.1 Shared library (`lib/volumetric.wesl`)

```wgsl
// Static-import only. Consumers do:
//   import package::lib::volumetric::{intersect_aabb, intersect_sphere, analytic_gaussian_los};

fn intersect_aabb(ro: vec3<f32>, rd: vec3<f32>, box_min: vec3<f32>, box_max: vec3<f32>) -> vec2<f32> { ... }
fn intersect_sphere(ro: vec3<f32>, rd: vec3<f32>, center: vec3<f32>, radius: f32) -> vec2<f32> { ... }
fn analytic_gaussian_los(ro: vec3<f32>, rd: vec3<f32>, center: vec3<f32>, sigma: f32) -> f32 { ... }
fn ramp2(d: f32, c0: vec3<f32>, c1: vec3<f32>, a_max: f32) -> vec4<f32> { ... }
```

WGSL has no function pointers, so the marching loop is documented as a copy-paste template (§2.2) rather than a library callable. Acceptable trade-off for shader code.

### 8.2 Reference soft-blend (host-side)

```ts
// Premultiplied alpha (Sun raymarch, CF-4):
const premul: GPUBlendState = {
  color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
  alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
};

// Additive (X-ray halos):
const additive: GPUBlendState = {
  color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
  alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
};
```

---

## 9. Mobile fallback

Mobile GPUs (Apple A15 / Adreno 730 class) cannot afford a full raymarch in any of the three shells without dropping below 30 fps. Per-consumer fallback:

| Effect | Mobile fallback |
|--------|-----------------|
| Sun corona raymarched | Skip the raymarch entirely; use the imposter quad path for the full duration of Shell 1 (no swap). The dolly-in beat loses procedural detail; the imposter's baked NASA SDO photo is still convincing at small angular size. |
| Sun inside-photosphere dwell (`T+0:05`) | Replace with a fullscreen warm-yellow gradient + bloom. Lose granulation. Documented mobile degradation. |
| X-ray cluster halos | Replace with a flat screen-space radial-gradient sprite per cluster, fixed angular extent (~12° at closest approach). Reads as "lens flare" but preserves the warm-glow-around-Virgo cue. |
| CF-4 DM density | **Disabled.** Replace with a static all-sky background tint (a baked Mollweide of the cube's max-projection) at low alpha. Flow vectors stay (they are cheap), and the cosmography markers stay. Shell 7's narrative still works without the volume. |

Gated by the existing `gpu.tier` runtime detection in `src/services/gpu/`. The fallback flag flows through engine settings into each per-shell renderer's `render()` call.

---

## 10. Test criteria

The standard "pure logic gets unit tests; GPU code gets visual review" split applies. Volumetric code lives almost entirely in WGSL where vitest cannot reach, so the test surface is small and the visual surface is large. Per project memory `feedback_wgsl_meticulous.md` — **do not ship shader confidence without a visual check.**

**Unit-testable:**
- `intersect_aabb` and `intersect_sphere` JS reference implementations in `src/utils/math/raycastIntersections.ts` (kept in sync with the WGSL by inspection): axis-aligned, oblique, inside-the-box, parallel-to-face, missed rays.
- Opacity correction formula: a JS port of `pow(1 - α, dt / ref)`, tested for invariance — a fixed analytic density should integrate to within 1 % across `STEP_COUNT ∈ {32, 64, 128, 256}`.
- Transfer function colour ramps: golden-image tests on the JS port at `t ∈ {0, 0.25, 0.5, 0.75, 1}` against hard-coded expected RGB.
- World→CF-4-voxel transform: anchored against Virgo and Coma per the existing CF-4 spec.

**Renderer construction:**
- Each renderer instantiates against the project's existing test WebGPU device wrapper without throwing. Uniform buffer sizes asserted. The explicit CF-4 bind-group layout asserted against the pipeline's expected layout — a `BindGroupLayout` mismatch is the exact failure the project memory warns about.

**Visual verification (manual, dev server):**
- **Sun corona at `T+0:05`:** photosphere fills frame; visible granulation; no banding; corona blends into bloom. Side-by-side against a NASA SDO reference photo.
- **Sun raymarch → imposter swap at `T+0:06`:** capture frames at `T+0:05.9` and `T+0:06.1`; per-pixel colour delta < 5 %.
- **X-ray halo over Virgo at `T+1:01`:** halo parallaxes against the background point cloud (reads as 3D, not decal); core saturates; edges fall off softly with no hard `5σ` cutoff visible; ~5 % noise modulation visible but subtle. Colour matches the design palette.
- **X-ray halo viewed at angle:** rotating the camera around a halo should not change its shape. If it does, the imposter quad isn't camera-facing — vertex-shader bug.
- **CF-4 DM density at Shell 7 entry (`T+1:07`):** Laniakea blob centred toward (RA, Dec) ≈ (160°, −60°), distance ~80 Mpc. Local Void as a transparent / cool-tinted gap toward (l, b) ≈ (60°, +20°). Great Attractor in Hydra-Centaurus at ~50 Mpc. Volume fades out beyond ~half-box; no hard cube edge.
- **CF-4 step-count invariance:** `STEP_COUNT` toggled between 64 / 96 / 128 should change pixel brightness by < 5 %. Larger drift means the opacity correction is wrong.
- **Crossfade Shell 6 → Shell 7:** the X-ray halo on Virgo and the CF-4 density blob over Virgo overlap during the 1–2 s crossfade without colour or position discontinuity.
- **Mobile fallback parity (real device):** none of the three fallbacks crash; each shell still narratively reads.

**Performance verification:** per-shell GPU timestamp queries through the existing profile harness. CF-4 raymarch ≤ 4 ms at desktop default `STEP_COUNT`. X-ray halo composite ≤ 0.4 ms across all visible clusters. Sun raymarch ≤ 0.6 ms during the dwell beat; imposter ≤ 0.05 ms after. No frame > 16.6 ms during full Shell 7 traversal.

---

## 11. Files touched

**New:**

```
src/services/gpu/shaders/lib/volumetric.wesl     — shared raymarch helpers (intersect_*, analytic_gaussian_los, ramp builders)
src/services/gpu/shaders/sunCorona.wesl          — Shell 1 corona / photosphere raymarch + imposter
src/services/gpu/shaders/xrayHalos.wesl          — Shell 6 cluster halo analytic shader
src/services/gpu/shaders/cf4Density.wesl         — Shell 7 CF-4 raymarcher (replaces .wgsl version once WESL conversion lands)
src/services/gpu/sunCoronaRenderer.ts            — Shell 1 dual-mode pipeline (raymarch + imposter swap)
src/services/gpu/xrayHalosRenderer.ts            — Shell 6 cluster halo pipeline
src/services/gpu/cf4DensityBindGroupLayout.ts    — explicit GPUBindGroupLayoutDescriptor for CF-4 (avoids the layout:'auto' trap)
src/services/gpu/sunNoiseTexture.ts              — 64³ R8 simplex-noise upload (reused by sun + xray noise modulation)
src/utils/math/raycastIntersections.ts           — JS reference implementations for unit tests
src/utils/math/opacityCorrection.ts              — JS port of pow-form correction for invariance tests
tests/utils/math/raycastIntersections.test.ts
tests/utils/math/opacityCorrection.test.ts
tests/services/gpu/sunCoronaRenderer.test.ts
tests/services/gpu/xrayHalosRenderer.test.ts
```

**Modified:**

```
src/services/gpu/cf4DensityRenderer.ts           — adopt shared library; switch to explicit bind-group layout; switch to pow-form opacity correction
src/services/gpu/shaders/cf4Density.wgsl         — extract intersect_aabb / opacity correction into shared lib (eventually replaced by .wesl)
src/services/engine/runFrame.ts                  — Shell 1 / 6 / 7 wire the new renderers into per-shell render passes
src/data/defaults.ts                             — DEFAULT_CF4_STEP_COUNT_DESKTOP, DEFAULT_CF4_STEP_COUNT_MOBILE
src/hooks/useEngineSettings.ts                   — quality knobs (volumetricQuality: 'high' | 'medium' | 'off')
```

The WESL conversion in `project_wesl_conversion.md` is in flight; new shaders are written `.wesl` from the start, and the existing `cf4Density.wgsl` migrates opportunistically alongside this work. The shared `volumetric.wesl` library is the natural unit for that conversion — three pipelines consume it and benefit most from WESL's static-import system.
