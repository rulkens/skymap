// src/services/gpu/shaders/scalarVolume/fragment.wesl
//
// Fragment stage for the scalar volume renderer.  Front-face culling at
// the pipeline level means only back faces of the cube rasterise.  This
// is the production-standard pattern that handles both inside-the-cube
// and outside-the-cube cases without per-frame branching:
//
//   - Camera outside the cube:  back faces are visible behind the front
//     faces, both rasterise; we use back faces because they always exist
//     wherever the cube projects on screen.
//   - Camera inside the cube:   front faces are behind the camera and
//     don't rasterise; back faces are the walls we see, and they cover
//     the whole screen.
//
// In both cases the fragment shader reconstructs the camera ray, finds
// where it enters and exits the cube's local-space AABB, and marches
// front-to-back from entry to exit.  The clamp 'tMin = max(tMin, 0)'
// handles the inside-the-cube case naturally -- the camera starts the
// march from its own position rather than a negative entry point.
//
// We additively blend across multiple fields, so each field's draw
// outputs (rgb * a, a) for over-compositing within ITSELF (front-to-back
// inside the cube), and the pipeline's blend state adds that to the
// HDR target.  Two fields therefore composite as
// 'final = field_A_contribution + field_B_contribution', which is what
// the spec calls for.

import package::lib::camera::CameraUniforms;
import package::lib::util::hash21Hq;
import package::lib::fadeUniforms::FadeUniforms;

struct VolumeUniforms {
  cam: CameraUniforms,
  modelMatrix: mat4x4<f32>,
  invModelMatrix: mat4x4<f32>,
  cameraPosWorld: vec3<f32>,
  intensity: f32,
  densityScale: f32,
  // Per-field contrast — drives applyContrastWindow's deadband
  // width.  1.0 = identity (no deadband, no stretching).  Values > 1
  // widen the deadband around the midpoint (suppressing near-mean
  // noise) AND stretch the surviving range across the full palette,
  // so prominent structure stays visible while the noisy "fog" of
  // mean-ish voxels collapses to transparent.  See the function
  // docblock below for the windowing math.  Orthogonal to
  // intensity: intensity is overall opacity, contrast is which
  // voxels participate.
  contrast: f32,
  // Per-cube center of the contrast window in LUT space [0, 1].
  // Divergent palettes (coolwarm; CF-4) want 0.5 — the cosmic mean
  // sits at the divergent transparent midpoint, the deadband
  // suppresses it symmetrically.  Sequential palettes (inferno;
  // MCPM, log-normalised so voxel value = 0 means void) want 0.0 —
  // voids are the "noise floor" we want to fade out, and the stretch
  // pushes mid-density values toward the bright end of the palette.
  // See applyContrastWindow's docblock for the generalised math; this
  // is the only knob that distinguishes divergent vs sequential
  // contrast behaviour.
  contrastCenter: f32,
  // Spatial envelope edges in normalised local-space distance from
  // the cube center.  The cube's inscribed sphere has radius 1.0;
  // the cube's corners are at √3 ≈ 1.73.  sphericalEnvelope runs a
  // smoothstep from full opacity at envelopeInner to zero at
  // envelopeOuter.  Setting both to a value ≥ √3 keeps the
  // smoothstep pinned at 1.0 throughout the cube (effectively
  // disabling the envelope).  Used to hide the axis-aligned cube
  // silhouette for content-driven cubes whose corner regions are
  // empty / noisy (CF-4 density); debug fixtures opt out via the
  // sentinel so their corner test patterns stay visible.
  envelopeInner: f32,
  envelopeOuter: f32,
  // Per-cube HDR exposure multiplier on the rgb contribution per
  // ray-march step.  Values > 1 push accumulated color past the LUT's
  // brightest entry, producing the "peaks blow out to white" effect
  // once the downstream tonemap pass compresses the rgba16float
  // accumulator back to display gamut.  Decoupled from alpha so a
  // higher exposure brightens the cube without making it more
  // opaque (which would just hide structure behind the front faces).
  // Default 1.0 = pre-HDR behaviour exactly preserved; 3-5 is the
  // useful range for "fiery cosmic-web" looks.
  exposure: f32,
  // User-tunable low-end cutoff in normalised LUT-coordinate space
  // [0, 1].  Voxels with deviation-from-center less than 'trim' get
  // hard-suppressed (visibility = 0).  Equivalent to Polyphorm's
  // 'trim_density' knob but in normalised space rather than raw
  // trace units.  Default 0 = no trim (every voxel contributes to
  // the deadband as set by 'contrast').  Combined with the contrast-
  // derived deadband by taking the max — user can crank trim past
  // contrast's implicit deadband to suppress more, never less.
  trim: f32,
  // Per-draw frame counter (f32 because the uniform is f32-typed
  // throughout — the integer monotonicity is what matters, not the
  // exact value).  Used as a temporal seed for the ray-march jitter
  // hash so the screen-space dither pattern decorrelates frame-to-
  // frame instead of staying locked in screen space.  CPU side
  // wraps at 1e6 to keep the f32 mantissa happy.
  frame: f32,
  // Edge length of one voxel in the cube's LOCAL [0,1]³ space
  // (distance, not a normalised fraction of anything else) —
  // 1 / max(dims), per-cube static.  Task 5's skip march and Task 6's
  // cone-LOD step sizing both size themselves against the data's
  // native resolution.
  voxelSizeLocal: f32,
  // Tangent of one screen pixel's FULL angular width (2*tan(fovY/2)/vh,
  // see scalarVolumeLayer.ts), per-frame. coneLod multiplies this
  // directly by the LOCAL-space march distance 't' — no extra scale
  // term, since the cube's local<->world factor cancels between t and
  // the footprint. Already carries the spec's '2', so coneLod uses
  // 't * pixelConeTan', not '2 * t * pixelConeTan'.
  pixelConeTan: f32,
};

@group(0) @binding(0) var<uniform> u: VolumeUniforms;
@group(0) @binding(1) var volume: texture_3d<f32>;
@group(0) @binding(2) var volumeSampler: sampler;
// The palette LUT is stored as an N x 1 2D texture, NOT a texture_1d.
// WGSL defines no textureSampleLevel overload for texture_1d (only 2d /
// 2d_array / 3d / cube / depth), so sampling a 1D LUT with an explicit
// LOD is non-portable: Chrome's Tint accepts it leniently, iOS WebKit
// rejects it at compile time, which invalidates this whole pipeline and
// drops every frame's command buffer. An N x 1 2D texture is the
// standard portable idiom for a 1D LUT and keeps hardware linear
// filtering via the sampler.
@group(0) @binding(3) var palette: texture_2d<f32>;
@group(0) @binding(4) var paletteSampler: sampler;
// Max-value pyramid in deviation space (Task 3). No companion sampler --
// unfilterable-float, textureLoad only -- so the skip march below can
// address explicit integer mip texels rather than filter across cells.
@group(0) @binding(5) var maxPyramid: texture_3d<f32>;

@group(1) @binding(0) var<uniform> fade: FadeUniforms;

// Safety cap on loop iterations only (Task 6): step sizing below is
// LOD-driven, not STEP_COUNT/(tMax-tMin), so this no longer sets sample
// density. Invariant that must hold for this to be a true safety cap rather
// than a truncation (fix round 1, task-6-review Important #2): the
// per-iteration step floor below guarantees 't' always reaches 'tMax'
// within STEP_COUNT iterations, at any tier -- the LOD-driven step alone
// could not (256 * voxel-sized steps falls short of a tier-large cube's
// diagonal), which silently dropped the far half of the ray.
const STEP_COUNT: i32 = 256;
const SATURATION_THRESHOLD: f32 = 0.99;
// Coarse-to-fine skip policy (Task 5): two pyramid levels is enough for a
// correct first pass. Level 1 (~16-voxel cells) catches large uniform-void
// regions cheaply; a cell that isn't provably empty there gets one refine
// to level 0 (~8-voxel cells, the pyramid's own base) before the march
// falls through to a normal full-res sample. Finer-grained level policy
// (e.g. an explicit level 2+ tier) is left to a future pass if level 1
// alone proves too coarse to skip meaningfully sized void regions.
const PYRAMID_FINE_LEVEL: i32 = 0;
// Local-space nudge past a skipped cell's exit point, so the next sampled
// position falls strictly inside the NEXT cell rather than landing back on
// the boundary and re-testing the one just skipped. Two orders of magnitude
// below a typical pyramid cell (level 0 spans ~8 * voxelSizeLocal, e.g.
// ~0.06 at dims=128) so it never eats a real step.
const CELL_EXIT_EPS: f32 = 1e-4;
// Pay the pyramid skip check's two texture loads only every Nth iteration:
// near the camera, LOD-0 steps are voxel-sized, so many consecutive steps
// land in the SAME coarse cell and re-testing membership every one of
// them is redundant. A step skipped over by the stride just samples
// normally; correctness only needs skips to be based on a provably-empty
// cell when the check does run.
const SKIP_CHECK_STRIDE: i32 = 4;
// Step length as a multiple of one texel's edge at whatever LOD coneLod
// selects. 1.0 samples once per texel (Nyquist-marginal for a
// box-filtered mip chain); values above 1 take bigger-than-texel steps,
// trading per-step alpha precision for fewer iterations. Tuned against
// the visual checkpoint and perf gate; see task-6-report.md for the
// measured tradeoff.
const STEP_QUALITY: f32 = 2.0;

struct FsIn {
  @location(0) localPos: vec3<f32>,
  @location(1) worldPos: vec3<f32>,
};

// Windowing transform for the per-step voxel sample.  Returns a
// (signedT, visibility) pair packed into a vec2:
//
//   .x → LUT coordinate to sample the palette at, in [0, 1].
//   .y → per-step opacity multiplier, in [0, 1].
//
// The transform centres a *deadband* on 0.5 (the divergent-palette
// midpoint) and stretches the surviving range out to fill [0, 1] of
// the palette.  Deadband width is 1 - 1/contrast, so:
//
//   contrast = 1.0 → deadband = 0.0 (identity — every voxel
//                                    contributes, mapped 1:1 to LUT).
//   contrast = 2.0 → deadband = 0.5 (voxels within 50% of mean
//                                    fully suppressed; rest stretched).
//   contrast = 4.0 → deadband = 0.75 (only the densest peaks and
//                                     emptiest voids survive).
//
// Compared to the older gamma-style remap, this transform separates
// the two effects users actually want from a "contrast" slider:
// (1) hide the noise floor, (2) make remaining structure pop.  The
// gamma curve coupled them implicitly via the LUT's alpha, but for
// divergent palettes (V-shaped alpha) cranking gamma also amplified
// the near-mean noise that already had nonzero alpha — exactly the
// "more noise, not more structure" symptom this replaces.
//
// Generalised for arbitrary 'center' in [0, 1].  For divergent palettes
// (CF-4, coolwarm) the meaningful zero sits at LUT t=0.5, so center=0.5
// and dev measures distance from the midpoint symmetrically — both ends
// of the palette light up.  For sequential palettes (MCPM, inferno) the
// meaningful zero sits at LUT t=0 (transparent void), so center=0.0
// and dev measures distance from the low end — only the high end of
// the palette lights up, voids stay transparent.
//
// halfRange normalises dev so deadband math is independent of where the
// center is: a 50% deadband is always "the half of the palette closest
// to the center".  At center=0.5, halfRange=0.5; at center=0 or 1,
// halfRange=1.0.
//
// signedT folds the stretched coord back around the center so the
// stretch direction is correct: at center=0.5 voxels above the
// midpoint stretch toward t=1, voxels below stretch toward t=0; at
// center=0 every voxel is above the center so they all stretch
// monotonically toward t=1.
fn applyContrastWindow(sampleValue: f32, contrast: f32, center: f32, trim: f32) -> vec2<f32> {
  let halfRange = max(center, 1.0 - center);
  let dev = abs(sampleValue - center) / max(halfRange, 1e-3);
  // Deadband from contrast's implicit floor, OR'd with the explicit
  // trim cutoff (max takes whichever is stricter).
  let contrastDeadband = clamp(1.0 - 1.0 / max(contrast, 1e-3), 0.0, 0.9);
  let trimDeadband = clamp(trim, 0.0, 0.95);
  let deadband = max(contrastDeadband, trimDeadband);
  let stretched = clamp(
    (dev - deadband) / max(1.0 - deadband, 1e-3),
    0.0,
    1.0,
  );
  let signedT = center + sign(sampleValue - center) * stretched * halfRange;
  let visibility = smoothstep(deadband - 0.05, deadband + 0.05, dev);
  return vec2<f32>(signedT, visibility);
}

// Spatial envelope: smoothstep falloff in local-space cube
// coordinates, used to fade the cube's corner regions to invisible
// so the axis-aligned silhouette of the bounding box doesn't show.
// localPos is the per-step sample point in [0, 1]^3, inner and
// outer are normalised distances from the cube center where the
// inscribed sphere has radius 1.0 (so corners sit at √3 ≈ 1.73).
//
// When inner >= outer (the degenerate "no envelope" case using the
// sentinel inner == outer >= √3), smoothstep returns 0 throughout
// the cube because dev never exceeds either edge, and the function
// returns 1.0 — visually identical to no envelope at all.  No
// branching needed.
fn sphericalEnvelope(localPos: vec3<f32>, inner: f32, outer: f32) -> f32 {
  // Center the cube on the origin in cube-space, scale by 2 so the
  // inscribed sphere has radius 1.0 (matches the convention used by
  // the per-cube envelopeInner/envelopeOuter uniforms).
  let radius = length(localPos - vec3<f32>(0.5)) * 2.0;
  return 1.0 - smoothstep(inner, outer, radius);
}

// Ray-vs-axis-aligned-local-space-AABB slab test against an arbitrary box,
// shared by intersectUnitAabb below (the whole cube) and pyramidCellQuery
// further down (a single skip-march cell) -- same math, different bounds.
// Returns the (tMin, tMax) range along the ray; if the ray misses the box
// entirely, tMax < tMin.
fn intersectLocalAabb(rayOrigin: vec3<f32>, rayDir: vec3<f32>, boxMin: vec3<f32>, boxMax: vec3<f32>) -> vec2<f32> {
  let invDir = 1.0 / rayDir;
  let t0 = (boxMin - rayOrigin) * invDir;
  let t1 = (boxMax - rayOrigin) * invDir;
  let tMinV = min(t0, t1);
  let tMaxV = max(t0, t1);
  let tMin = max(max(tMinV.x, tMinV.y), tMinV.z);
  let tMax = min(min(tMaxV.x, tMaxV.y), tMaxV.z);
  return vec2<f32>(tMin, tMax);
}

// Ray-vs-axis-aligned-unit-AABB intersection in the cube's LOCAL space
// (the cube spans [0, 1]^3 in local coords).  Returns the (tMin, tMax)
// range along the ray, with tMin clamped to 0 so a ray origin inside
// the cube starts marching from the origin.  If the ray misses the cube
// entirely, returns tMax < tMin and the caller discards.
fn intersectUnitAabb(rayOrigin: vec3<f32>, rayDir: vec3<f32>) -> vec2<f32> {
  let t = intersectLocalAabb(rayOrigin, rayDir, vec3<f32>(0.0), vec3<f32>(1.0));
  return vec2<f32>(max(t.x, 0.0), t.y);
}

// Looks up the pyramid cell at mip 'level' containing local-space position
// 'p'.  Returns (cellMaxDev, exitT): the cell's stored max deviation (see
// VolumeUniforms/binding-5 doc comments -- deviation space, not raw value),
// and the ray's exit parameter through THAT CELL's own bounds (a slab test
// bounded to the cell, not the whole cube, via intersectLocalAabb above).
fn pyramidCellQuery(p: vec3<f32>, level: i32, rayOrigin: vec3<f32>, rayDir: vec3<f32>) -> vec2<f32> {
  let dimsU = textureDimensions(maxPyramid, level);
  let dims = vec3<f32>(dimsU);
  let cellI = clamp(vec3<i32>(floor(p * dims)), vec3<i32>(0), vec3<i32>(dimsU) - vec3<i32>(1));
  let maxDev = textureLoad(maxPyramid, cellI, level).r;
  let cellMin = vec3<f32>(cellI) / dims;
  let cellMax = cellMin + 1.0 / dims;
  let exitT = intersectLocalAabb(rayOrigin, rayDir, cellMin, cellMax).y;
  return vec2<f32>(maxDev, exitT);
}

// Cone-footprint LOD (Task 6): the mip level whose texel size best matches
// one screen pixel's footprint at march distance 't' (LOCAL-space).
// coneDiameter is that footprint's local-space diameter; dividing by
// voxelSizeLocal (level 0's texel size) and taking log2 gives "how many
// texel-doublings fit" -- exactly a mip level.
fn coneLod(t: f32, pixelConeTan: f32, voxelSizeLocal: f32, maxLevel: f32) -> f32 {
  let coneDiameter = t * pixelConeTan;
  return clamp(log2(coneDiameter / max(voxelSizeLocal, 1e-6)), 0.0, maxLevel);
}

@fragment
fn fs_main(in: FsIn, @builtin(position) fragCoord: vec4<f32>) -> @location(0) vec4<f32> {
  // Reconstruct the camera-to-fragment ray in WORLD space, then transform
  // into the cube's LOCAL space (where the AABB is the unit cube).
  //
  // Critical: normalize rayDirLocal AFTER the inverse-model transform.  The
  // model matrix scales the unit cube up to its world size (e.g. 200 Mpc),
  // so invModel scales directions DOWN by the same factor.  A world-space
  // unit direction becomes magnitude ~1/scale in local space.  If we leave
  // it unnormalized, the AABB-intersection 't' is in those tiny-direction
  // units (tMax ≈ scale, not ≈ 1), and stepLength = (tMax-tMin)/N becomes
  // huge — per-step alpha saturates in 1–2 samples and the order-of-
  // accumulation effect makes inside views look BRIGHTER than outside ones
  // (peak hits first → instant saturation in peak colour, no attenuation).
  // Normalizing here puts 't' in local-space distance units, so the unit
  // cube spans t ∈ [0, √3] at most and per-step opacity stays in a sane
  // regime (≈0.005 at peak with our default intensity, totaling ≈1).
  let rayOriginLocal = (u.invModelMatrix * vec4<f32>(u.cameraPosWorld, 1.0)).xyz;
  let rayDirWorld = normalize(in.worldPos - u.cameraPosWorld);
  let rayDirLocal = normalize((u.invModelMatrix * vec4<f32>(rayDirWorld, 0.0)).xyz);

  let tRange = intersectUnitAabb(rayOriginLocal, rayDirLocal);
  let tMin = tRange.x;
  let tMax = tRange.y;
  if (tMax <= tMin) {
    discard;
  }

  // Cone-LOD honest step sizing (Task 6): step length now tracks the
  // texel size of whatever mip the cone footprint selects at the CURRENT
  // march distance (computed fresh each iteration below), not a fixed
  // (tMax-tMin)/STEP_COUNT that oversampled short rays and undersampled
  // long ones regardless of what was actually on screen.
  let maxLevel = f32(textureNumLevels(volume)) - 1.0;

  // Jitter the start offset by [0, stepLength) per fragment to break
  // the visible step-grid moiré that would otherwise slide across the
  // cube during camera motion. Sized against the step length AT THE
  // RAY'S ENTRY POINT (t = tMin) -- the only one known before the loop
  // starts; later steps recompute their own length dynamically.  Without
  // jitter, the fixed sample positions along each ray show through as a
  // coherent grid because every pixel uses the same step phase — at high
  // densityScale (MCPM=18, CF-4=20), per-step
  // opacity is large enough to make that grid visible. Per-fragment
  // jitter decorrelates neighbouring rays: visible aliasing becomes
  // high-frequency grain instead of a moving grid, and the accumulated
  // integral stays unbiased (jitter averages to stepLength/2). hash21Hq
  // (Dave Hoskins' "Hash without Sine") is used instead of the cheaper
  // sin-based hash21 because the latter's diagonal banding is visible as
  // a stationary screen-space pattern.
  //
  // Temporal seed: offsetting the hash input by frame * irrational
  // constants decorrelates the dither pattern frame-to-frame, so the
  // residual grain looks like film noise rather than a stationary
  // screen-space pattern the eye can latch onto.  Without TAA this
  // produces visible shimmer when stationary — accepted tradeoff,
  // because the alternative (no temporal seed) means the same screen
  // pixel always picks the same step phase, which is exactly the
  // failure mode the user reported.  The constants 7.13 / 13.71 are
  // arbitrary irrationals that don't share factors with anything in
  // the hash mixer.
  let entryLod = coneLod(tMin, u.pixelConeTan, u.voxelSizeLocal, maxLevel);
  let entryStepLength = u.voxelSizeLocal * exp2(entryLod) * STEP_QUALITY;
  let jitterSeed = fragCoord.xy + vec2<f32>(u.frame * 7.13, u.frame * 13.71);
  let jitter = hash21Hq(jitterSeed) * entryStepLength;

  // TF-adaptive empty-space skip cutoff (Task 5), derived once per fragment
  // from the SAME live contrast/trim uniforms applyContrastWindow uses per
  // step -- mirrored, not shared, because the pyramid's precomputed max is
  // compared against this threshold directly (deviation space), while
  // applyContrastWindow compares a fresh per-voxel dev every step. Slider
  // changes retune both identically with no rebuild, since neither reads
  // anything baked at bake time except the pyramid's raw deviation values.
  let contrastDeadband = clamp(1.0 - 1.0 / max(u.contrast, 1e-3), 0.0, 0.9);
  let trimDeadband = clamp(u.trim, 0.0, 0.95);
  let deadband = max(contrastDeadband, trimDeadband);
  // Same floor applyContrastWindow's smoothstep uses (line ~191): a cell
  // whose stored MAX dev is still below this is PROVABLY all-zero-
  // visibility, so skipping it changes nothing about the accumulated
  // integral -- the omitted samples would have contributed zero opacity.
  let skipCutoff = deadband - 0.05;
  let coarseLevel = min(1, i32(textureNumLevels(maxPyramid)) - 1);

  var accum = vec4<f32>(0.0);
  var t = tMin + jitter;
  var i = 0;
  loop {
    if (i >= STEP_COUNT || t >= tMax) { break; }
    let p = rayOriginLocal + rayDirLocal * t;
    let lod = coneLod(t, u.pixelConeTan, u.voxelSizeLocal, maxLevel);
    let lodStepLength = u.voxelSizeLocal * exp2(lod) * STEP_QUALITY;
    // Per-iteration step floor (fix round 1, task-6-review Important #2): a
    // no-op whenever the LOD step already fits the iterations left before
    // STEP_COUNT, so it doesn't reintroduce distance-independent
    // oversampling near the camera. It only grows the step as the budget
    // runs low, which is exactly when it must -- guaranteeing 't' reaches
    // 'tMax' by the last iteration instead of the cap truncating the ray.
    // 'STEP_COUNT - i' is >= 1 here (the loop guard above already excluded
    // i >= STEP_COUNT).
    let remainingSteps = f32(STEP_COUNT - i);
    let stepLength = max(lodStepLength, (tMax - t) / remainingSteps);

    // Coarse-to-fine skip: consult the max pyramid before paying for a
    // full-res sample, throttled to every SKIP_CHECK_STRIDEth iteration
    // (see its doc comment above) rather than every one. A cell below
    // skipCutoff at EITHER level provably contributes zero, so we jump
    // straight to that cell's ray-exit point instead of full-res-sampling
    // through it one step at a time.
    var skip = false;
    var skipExitT = t;
    if (i % SKIP_CHECK_STRIDE == 0) {
      let coarse = pyramidCellQuery(p, coarseLevel, rayOriginLocal, rayDirLocal);
      if (coarse.x < skipCutoff) {
        skip = true;
        skipExitT = coarse.y;
      } else if (coarseLevel != PYRAMID_FINE_LEVEL) {
        let fine = pyramidCellQuery(p, PYRAMID_FINE_LEVEL, rayOriginLocal, rayDirLocal);
        if (fine.x < skipCutoff) {
          skip = true;
          skipExitT = fine.y;
        }
      }
    }
    if (skip) {
      // Jump straight to the cell's exit point (plus the epsilon nudge),
      // then re-add THIS RAY's own jitter fraction of the LOD-sized step
      // (fix round 1, task-6-review Important #3). Without it, every ray
      // that skips the same pyramid cell lands on that cell's exit plane at
      // an identical 't', re-synchronising rays the entry jitter had
      // decorrelated -- since stepLength varies smoothly with 't', they'd
      // then stay phase-correlated for the rest of the march, showing up as
      // stationary banding on the pyramid-cell lattice. Salting the hash by
      // 'i' keeps successive skips on the SAME ray from reusing one offset.
      // Correctness is unaffected: skipCutoff already proved the omitted
      // span contributes zero opacity regardless of where within
      // [skipExitT, skipExitT + lodStepLength) the next sample lands.
      let skipJitter = hash21Hq(jitterSeed + vec2<f32>(f32(i) * 3.17, f32(i) * 5.91));
      t = skipExitT + CELL_EXIT_EPS + skipJitter * lodStepLength;
      i = i + 1;
      continue;
    }

    // Sample the 3D texture in [0,1]^3 -- same coordinate system as the
    // local AABB, so 'p' is directly the texture coordinate.
    //
    // Why textureSampleLevel with an explicit LOD instead of textureSample:
    // textureSample requires UNIFORM control flow (it computes implicit
    // mipmap derivatives across a quad of fragments), but the early-out
    // 'break' below at saturation makes the loop's iteration count vary
    // across neighbouring fragments — non-uniform.  textureSampleLevel
    // takes an explicit LOD instead of computing one, so it works in
    // non-uniform control flow.  'lod' here is the cone-footprint LOD
    // computed above, not a hardcoded 0 -- see coneLod's doc comment.
    let sampleValue = textureSampleLevel(volume, volumeSampler, p, lod).r;
    // Window the sample around the 0.5 midpoint: high contrast widens
    // the deadband (suppressing near-mean noise) AND stretches the
    // surviving range across the full palette.  Returns (signedT,
    // visibility); see applyContrastWindow's docblock for the math
    // and the "why not gamma" rationale.  Always runs even at
    // contrast=1 (identity) — branching would break the uniform-
    // control-flow contract that lets us call textureSampleLevel
    // below.
    let window = applyContrastWindow(sampleValue, u.contrast, u.contrastCenter, u.trim);
    let signedT = window.x;
    let visibility = window.y;
    // Look up colour through the palette LUT (an N x 1 2D texture; see
    // the binding declaration). Same uniformity constraint as the volume
    // sample above, so explicit LOD 0.  The v-coordinate is fixed at 0.5
    // -- the centre of the single texel row -- so clamp-to-edge sampling
    // never bleeds in a neighbouring row.
    let lut = textureSampleLevel(palette, paletteSampler, vec2<f32>(signedT, 0.5), 0.0);
    // Per-step alpha = density * stepLength.  This is the discrete form
    // of the optical-depth integral: total opacity along the ray =
    // sum(density * dx), path-length-correct regardless of how dx
    // varies -- since Task 6, stepLength is THIS iteration's own
    // cone-LOD length, not a ray-global constant, so a coarser step at
    // high LOD contributes proportionally more per sample.
    //
    // The DENSITY_SCALE constant tunes how aggressive the opacity is
    // per local-space unit.  Local space spans [0,1]^3 so a full
    // diagonal ray has length √3 ≈ 1.73; at lut.a=0.9, intensity=0.5,
    // DENSITY_SCALE=1 we get N·(0.9·0.5·√3/N) ≈ 0.78 of opacity which
    // reads as "saturated through the dense centre" — a reasonable
    // starting point.  Tune in the smoke test if voids feel too thick
    // or peaks too thin.
    // densityScale is the per-cube knob that maps the data's natural
    // dynamic range onto "saturate at intensity=1.0".  See
    // VolumeFieldDefaults.densityScale for the rationale; values in
    // the [1, 10] range are typical (1.0 = no scaling for already-
    // normalised data, 5.0 = lift a sparse Gaussian into a saturating
    // regime).
    //
    // Two extra multipliers on top of the canonical
    // lut.a * intensity * densityScale * stepLength:
    //   - visibility from the contrast window, fading out near-mean
    //     voxels (problem 1: "contrast was amplifying noise").
    //   - sphericalEnvelope fading out the cube corners (problem 2:
    //     "the cube silhouette is visible").  Cubes that don't want
    //     this set both envelope edges past √3 and the multiplier is
    //     pinned to 1.0 — same shader path, no branching.
    let envelope = sphericalEnvelope(p, u.envelopeInner, u.envelopeOuter);
    let alpha = lut.a * u.intensity * u.densityScale * stepLength
              * visibility * envelope;
    // Bright-end-weighted exposure boost.  An earlier draft scaled
    // every voxel uniformly by exposure (rgb * alpha * u.exposure),
    // which brightened the mid-tone "warm" band just as much as the
    // peaks — so the peaks never visually stood out as HDR blow-out
    // even though their accumulated rgb did exceed 1.0.  The
    // perceptual problem: the user sees the WHOLE cube get brighter
    // and reads it as "brightness slider", not "peaks blow to white".
    //
    // The weighted formula concentrates the boost at the extremes
    // (far from the contrastCenter):
    //   highlightGain = 1 + smoothstep(0.5, 1.0, dev) * (exposure - 1)
    // For sequential palettes (MCPM, contrastCenter=0) the boost
    // ramps in over signedT > 0.5 and peaks at signedT = 1.0; for
    // divergent palettes (CF-4, contrastCenter=0.5) it ramps in
    // symmetrically toward both palette extremes.  Mid-tones near the
    // center get highlightGain ≈ 1.0 (no boost), so the warm gradient
    // stays LDR-bounded; only peaks push past the LUT's brightest
    // entry into the "blow out to white" regime that the rgba16float
    // target + tonemap pass produce.
    let halfRange = max(u.contrastCenter, 1.0 - u.contrastCenter);
    let dev = abs(signedT - u.contrastCenter) / max(halfRange, 1e-3);
    let blowout = smoothstep(0.5, 1.0, dev);
    let highlightGain = 1.0 + blowout * max(u.exposure - 1.0, 0.0);
    let contrib = vec4<f32>(lut.rgb * alpha * highlightGain, alpha);
    // Front-to-back over-compositing within this field.
    accum = accum + (1.0 - accum.a) * contrib;
    if (accum.a > SATURATION_THRESHOLD) { break; }
    i = i + 1;
    t = t + stepLength;
  }
  // Apply the per-field fade opacity. Multiplying the entire vec4
  // (rgb * a, a) by a scalar preserves the premultiplied-alpha
  // invariant (output stays in the (rgb * faded_a, faded_a) shape
  // the additive blend expects). The volume's per-step alpha
  // composition is unchanged — we just dim the final integrated
  // result.
  return accum * fade.opacity;
}
