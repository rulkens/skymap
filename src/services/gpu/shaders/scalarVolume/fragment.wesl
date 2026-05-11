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
};

@group(0) @binding(0) var<uniform> u: VolumeUniforms;
@group(0) @binding(1) var volume: texture_3d<f32>;
@group(0) @binding(2) var volumeSampler: sampler;
@group(0) @binding(3) var palette: texture_1d<f32>;
@group(0) @binding(4) var paletteSampler: sampler;

const STEP_COUNT: i32 = 192;
const SATURATION_THRESHOLD: f32 = 0.99;

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

// Ray-vs-axis-aligned-unit-AABB intersection in the cube's LOCAL space
// (the cube spans [0, 1]^3 in local coords).  Returns the (tMin, tMax)
// range along the ray, with tMin clamped to 0 so a ray origin inside
// the cube starts marching from the origin.  If the ray misses the cube
// entirely, returns tMax < tMin and the caller discards.
fn intersectUnitAabb(rayOrigin: vec3<f32>, rayDir: vec3<f32>) -> vec2<f32> {
  let invDir = 1.0 / rayDir;
  let t0 = -rayOrigin * invDir;
  let t1 = (vec3<f32>(1.0) - rayOrigin) * invDir;
  let tMinV = min(t0, t1);
  let tMaxV = max(t0, t1);
  let tMin = max(max(tMinV.x, tMinV.y), tMinV.z);
  let tMax = min(min(tMaxV.x, tMaxV.y), tMaxV.z);
  return vec2<f32>(max(tMin, 0.0), tMax);
}

@fragment
fn fs_main(in: FsIn) -> @location(0) vec4<f32> {
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

  // Fixed-step march from tMin to tMax.  stepLength normalises against
  // STEP_COUNT so opacity is invariant to changes in the constant.
  let stepLength = (tMax - tMin) / f32(STEP_COUNT);
  var accum = vec4<f32>(0.0);
  var t = tMin;
  for (var i = 0; i < STEP_COUNT; i = i + 1) {
    let p = rayOriginLocal + rayDirLocal * t;
    // Sample the 3D texture in [0,1]^3 -- same coordinate system as the
    // local AABB, so 'p' is directly the texture coordinate.
    //
    // Why textureSampleLevel with explicit LOD 0 instead of textureSample:
    // textureSample requires UNIFORM control flow (it computes implicit
    // mipmap derivatives across a quad of fragments), but the early-out
    // 'break' below at saturation makes the loop's iteration count vary
    // across neighbouring fragments — non-uniform.  textureSampleLevel
    // takes an explicit LOD instead of computing one, so it works in
    // non-uniform control flow.  Our 3D texture has only one mip level
    // anyway, so explicit LOD 0 is exactly what we want.
    let sampleValue = textureSampleLevel(volume, volumeSampler, p, 0.0).r;
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
    // Look up colour through the 1D palette LUT.  Same uniformity
    // constraint as the volume sample above.
    let lut = textureSampleLevel(palette, paletteSampler, signedT, 0.0);
    // Per-step alpha = density * stepLength.  This is the discrete form
    // of the optical-depth integral: total opacity along the ray =
    // sum(density * dx) which is path-length-correct (a longer ray
    // through the same density yields proportionally more opacity).
    //
    // The original (buggy) formula was 'lut.a * intensity * stepLength
    // * STEP_COUNT * 0.01', which cancels the '/ STEP_COUNT' inside
    // stepLength and ends up with per-step alpha ∝ total path length.
    // That made the contribution amplitude depend on the ray's full
    // extent, so a long ray (camera far from cube) over-saturated the
    // first sample's RGB (alpha can exceed 1, scaling lut.rgb past
    // unity in the pre-multiply), while a short ray (camera inside)
    // produced smaller per-step contributions and a darker result.
    // The visible symptom: the blob got LIGHTER as the camera entered
    // it.  The fix below makes per-step alpha proportional to the
    // sampled length, and the multi-step composite naturally
    // integrates to the correct total optical depth.
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
    // RGB scaled by exposure, alpha is NOT — the two are decoupled so
    // an HDR-bright cube doesn't also become opaque (which would hide
    // structure behind the front faces).  rgba16float target accepts
    // values > 1; the tonemap pass downstream rolls them off to
    // display gamut, producing the "blow out to white" effect at peak
    // density voxels.
    let contrib = vec4<f32>(lut.rgb * alpha * u.exposure, alpha);
    // Front-to-back over-compositing within this field.
    accum = accum + (1.0 - accum.a) * contrib;
    if (accum.a > SATURATION_THRESHOLD) { break; }
    t = t + stepLength;
  }
  return accum;
}
