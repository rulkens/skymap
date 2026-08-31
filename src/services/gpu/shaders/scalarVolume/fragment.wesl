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
import package::lib::volumeRaymarch::localRayFromWorld;
import package::lib::volumeRaymarch::intersectUnitAabb;
import package::lib::volumeRaymarch::sphericalEnvelope;

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

@group(1) @binding(0) var<uniform> fade: FadeUniforms;

const STEP_COUNT: i32 = 128;
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

@fragment
fn fs_main(in: FsIn, @builtin(position) fragCoord: vec4<f32>) -> @location(0) vec4<f32> {
  // Ray setup (world→local reconstruction, AABB intersection) is the
  // shared skeleton in lib::volumeRaymarch — see its docblocks for the
  // normalize-after-invModel landmine.
  let ray = localRayFromWorld(u.invModelMatrix, u.cameraPosWorld, in.worldPos);
  let rayOriginLocal = ray.origin;
  let rayDirLocal = ray.dir;

  let tRange = intersectUnitAabb(rayOriginLocal, rayDirLocal);
  let tMin = tRange.x;
  let tMax = tRange.y;
  if (tMax <= tMin) {
    discard;
  }

  // Fixed-step march from tMin to tMax.  stepLength normalises against
  // STEP_COUNT so opacity is invariant to changes in the constant.
  let stepLength = (tMax - tMin) / f32(STEP_COUNT);
  // Jitter the start offset by [0, stepLength) per fragment to break
  // the visible step-grid moiré that would otherwise slide across the
  // cube during camera motion.  Without jitter, the 192 fixed sample
  // positions along each ray show through as a coherent grid because
  // every pixel uses the same step phase — at high densityScale
  // (MCPM=18, CF-4=20), per-step opacity is large enough to make that
  // grid visible.  Per-fragment jitter decorrelates neighbouring rays:
  // visible aliasing becomes high-frequency grain instead of a moving
  // grid, and the accumulated integral stays unbiased (jitter averages
  // to stepLength/2).  hash21Hq (Dave Hoskins' "Hash without Sine") is
  // used instead of the cheaper sin-based hash21 because the latter's
  // diagonal banding is visible as a stationary screen-space pattern.
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
  let jitterSeed = fragCoord.xy + vec2<f32>(u.frame * 7.13, u.frame * 13.71);
  let jitter = hash21Hq(jitterSeed) * stepLength;
  var accum = vec4<f32>(0.0);
  var t = tMin + jitter;
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
    // Look up colour through the palette LUT (an N x 1 2D texture; see
    // the binding declaration). Same uniformity constraint as the volume
    // sample above, so explicit LOD 0.  The v-coordinate is fixed at 0.5
    // -- the centre of the single texel row -- so clamp-to-edge sampling
    // never bleeds in a neighbouring row.
    let lut = textureSampleLevel(palette, paletteSampler, vec2<f32>(signedT, 0.5), 0.0);
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
