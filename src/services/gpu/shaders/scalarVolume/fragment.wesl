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
import package::lib::fadeUniforms::FadeUniforms;
import package::lib::volumeRaymarch::localRayFromWorld;
import package::lib::volumeRaymarch::intersectAabb;
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
  // Divergent palettes (coolwarm) want 0.5 — the cosmic mean
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
  // empty / noisy; a cube that instead wants its corners visible
  // (e.g. to verify axis alignment) opts out via the sentinel.
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
  // Extra cut above the contrast deadband, in [0, 0.95]: the fraction
  // of what survives that deadband which is also hard-suppressed.
  // 0 = contrast's deadband alone.
  trim: f32,
  // Index into the jitter sequence: the engine frame index, so every
  // view of one frame (all five dome faces) shares a phase.  The CPU
  // wraps it at 1e6 (a multiple of the mask's slice count), so the
  // integer is exact in f32.
  jitterIndex: f32,
  // March steps per ray (an integer, exact in f32).
  steps: f32,
  gain: f32,
  _pad0: f32,
  baseVoxelMpc: f32,
  // The stored box inside the native grid's [0,1]³ (GpuVolume.nativeBox).
  nativeBoxOffset: vec3<f32>,
  nativeBoxScale: vec3<f32>,
};

@group(0) @binding(0) var<uniform> uniforms: VolumeUniforms;
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
// r8unorm blue-noise ranks: size wide, slices × size tall (see the jitter below).
@group(0) @binding(5) var jitterMask: texture_2d<f32>;

@group(1) @binding(0) var<uniform> fade: FadeUniforms;

// The detail region (DetailRegionDraw): boxes in the stored box's local [0,1]³, the texture
// repeat-sampled at local · texScale. vec3 alignment alone places every member (no pad members).
struct RegionUniforms {
  settledLo: vec3<f32>, voxelMpc: f32,
  settledHi: vec3<f32>, fadeW: f32,
  texScale: vec3<f32>,
  intoLo: vec3<f32>,
  intoHi: vec3<f32>,
  outLo: vec3<f32>,
  outHi: vec3<f32>,
};
@group(2) @binding(0) var<uniform> region: RegionUniforms;
@group(2) @binding(1) var regionTex: texture_3d<f32>;
@group(2) @binding(2) var regionSampler: sampler;
override REGION: u32 = 0u;   // 0 base only, 1 steady, 2 fading
// The "Colour by level" debug view: each step shaded by where it read, at twice the palette's luminance.
// Off compiles it out. DENSITY_LEVEL_LEGEND's hexes in linear light, in its order (settled, into,
// out, base mip 0, 1, 2+): the order is the `level` index below.
override LEVELS: bool = false;
const LEVEL_TINTS = array<vec3<f32>, 6>(
  vec3<f32>(0.871, 0.776, 0.054), vec3<f32>(0.791, 0.347, 0.0), vec3<f32>(0.604, 0.191, 0.386),
  vec3<f32>(0.0, 0.342, 0.171), vec3<f32>(0.093, 0.456, 0.815), vec3<f32>(0.0, 0.168, 0.445),
);

const SATURATION_THRESHOLD: f32 = 0.99;

struct FsIn {
  @location(0) localPos: vec3<f32>,
  @location(1) worldPos: vec3<f32>,
};

// A box's span along the ray, ended at tGate: past it a pixel spans more than one native voxel,
// so the base serves it. A zero-sized box gives an empty span, never a match (tests are half-open).
fn regionSpan(origin: vec3<f32>, dir: vec3<f32>, boxLo: vec3<f32>, boxHi: vec3<f32>, tGate: f32) -> vec2<f32> {
  let hit = intersectAabb(origin, dir, boxLo, boxHi);
  return vec2<f32>(hit.x, min(hit.y, tGate));
}

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
// (coolwarm) the meaningful zero sits at LUT t=0.5, so center=0.5
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
  // Trim cuts a fraction of what survives contrast's deadband, so it
  // bites from just above 0.
  let contrastDeadband = clamp(1.0 - 1.0 / max(contrast, 1e-3), 0.0, 0.9);
  let trimDeadband = clamp(trim, 0.0, 0.95);
  let deadband = contrastDeadband + trimDeadband * (1.0 - contrastDeadband);
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
  let ray = localRayFromWorld(uniforms.invModelMatrix, uniforms.cameraPosWorld, in.worldPos);
  let rayOriginLocal = ray.origin;
  let rayDirLocal = ray.dir;

  let tRange = intersectAabb(rayOriginLocal, rayDirLocal, vec3<f32>(0.0), vec3<f32>(1.0));
  let tMin = tRange.x;
  let tMax = tRange.y;
  if (tMax <= tMin) {
    discard;
  }

  // Fixed-step march from tMin to tMax.  stepLength normalises against
  // the step count so opacity is invariant to it.
  let stepLength = (tMax - tMin) / uniforms.steps;
  // Jitter the start offset by [0, stepLength) per fragment: with one shared
  // step phase the sample positions show as a coherent grid that slides
  // across the cube in motion (per-step opacity at densityScale 18 is
  // large enough to see it). Jitter turns that into grain and keeps the
  // integral unbiased.
  //
  // The offset comes from a blue-noise mask (64² per slice, slices stacked
  // vertically): each slice is spatially blue and each pixel's run through
  // the slices is spread out, so the progressive running mean of
  // consecutive frames converges in a few samples. The frame index picks
  // the slice, so the grain still changes every frame in motion. The
  // temporal kernel is toroidal: any run of `slices` consecutive frames
  // reads each slice once, so no per-cycle shift is needed.
  let maskDims = textureDimensions(jitterMask);
  let slices = maskDims.y / maskDims.x;
  let frame = u32(uniforms.jitterIndex);
  let texel = vec2<u32>(fragCoord.xy) % vec2<u32>(maskDims.x);
  let maskValue = textureLoad(jitterMask, vec2<u32>(texel.x, (frame % slices) * maskDims.x + texel.y), 0).r;
  let jitter = maskValue * stepLength;
  // The camera is the ray origin, so local distance t times |M·dir| is world distance and one
  // pixel spans t·|M·dir| / (pxPerRad·baseVoxelMpc) base voxels: its log2 is the LOD.
  let mpcPerT = length((uniforms.modelMatrix * vec4<f32>(rayDirLocal, 0.0)).xyz);
  let lodOffset = log2(mpcPerT / (uniforms.cam.pxPerRad * uniforms.baseVoxelMpc));
  var settledSpan = vec2<f32>(0.0);
  var intoSpan = vec2<f32>(0.0);
  var outSpan = vec2<f32>(0.0);
  if (REGION != 0u) {
    let tGate = uniforms.cam.pxPerRad * region.voxelMpc / mpcPerT;
    settledSpan = regionSpan(rayOriginLocal, rayDirLocal, region.settledLo, region.settledHi, tGate);
    if (REGION == 2u) {
      intoSpan = regionSpan(rayOriginLocal, rayDirLocal, region.intoLo, region.intoHi, tGate);
      outSpan = regionSpan(rayOriginLocal, rayDirLocal, region.outLo, region.outHi, tGate);
    }
  }
  // Opacity and the envelope stay in native-grid units, so a cropped box looks like the whole grid.
  let nativeStepLength = stepLength * length(uniforms.nativeBoxScale * rayDirLocal);
  let maxLod = f32(textureNumLevels(volume) - 1u);
  var accum = vec4<f32>(0.0);
  var rayDistance = tMin + jitter;
  for (var stepIndex = 0; stepIndex < i32(uniforms.steps); stepIndex = stepIndex + 1) {
    // Local [0,1]^3 is the stored box, so 'samplePos' is directly the texture coordinate.
    let samplePos = rayOriginLocal + rayDirLocal * rayDistance;
    // Explicit LOD: the saturation 'break' below makes control flow non-uniform, where
    // textureSample's implicit derivatives are undefined. One volume read, two only in a fading
    // shell; the region's texels are valid only inside its boxes.
    var sampleValue: f32;
    var level = 0u;
    if (REGION != 0u && rayDistance >= settledSpan.x && rayDistance < settledSpan.y) {
      sampleValue = textureSampleLevel(regionTex, regionSampler, samplePos * region.texScale, 0.0).r;
    } else {
      let lod = clamp(log2(max(rayDistance, 1e-6)) + lodOffset, 0.0, maxLod);
      sampleValue = textureSampleLevel(volume, volumeSampler, samplePos, lod).r;
      level = 3u + min(u32(round(lod)), 2u);
      // The fading shells: the region at fadeW in `into`, 1 − fadeW in `out`. Both contain the
      // settled box and meet only in it, so a sample here lies in at most one.
      if (REGION == 2u) {
        let inInto = rayDistance >= intoSpan.x && rayDistance < intoSpan.y;
        let inOut = rayDistance >= outSpan.x && rayDistance < outSpan.y;
        if (inInto || inOut) {
          let regionValue = textureSampleLevel(regionTex, regionSampler, samplePos * region.texScale, 0.0).r;
          sampleValue = mix(sampleValue, regionValue, select(1.0 - region.fadeW, region.fadeW, inInto));
          level = select(2u, 1u, inInto);
        }
      }
    }
    // The region takes the base tier's gain too (owner ruling 2026-11-27): the look is tuned to it.
    sampleValue = min(sampleValue * uniforms.gain, 1.0);
    // Window the sample around the 0.5 midpoint: high contrast widens
    // the deadband (suppressing near-mean noise) AND stretches the
    // surviving range across the full palette.  Returns (signedT,
    // visibility); see applyContrastWindow's docblock for the math
    // and the "why not gamma" rationale.
    let window = applyContrastWindow(sampleValue, uniforms.contrast, uniforms.contrastCenter, uniforms.trim);
    let signedT = window.x;
    let visibility = window.y;
    // Look up colour through the palette LUT (an N x 1 2D texture; see
    // the binding declaration), one mip, so explicit LOD 0.  The v-coordinate is fixed at 0.5
    // -- the centre of the single texel row -- so clamp-to-edge sampling
    // never bleeds in a neighbouring row.
    let lut = textureSampleLevel(palette, paletteSampler, vec2<f32>(signedT, 0.5), 0.0);
    // Per-step alpha = density * nativeStepLength.  This is the discrete form
    // of the optical-depth integral: total opacity along the ray =
    // sum(density * dx) which is path-length-correct (a longer ray
    // through the same density yields proportionally more opacity).
    // Per-step alpha must not scale with the ray's whole extent, or the
    // blob gets lighter as the camera enters it.
    //
    // The DENSITY_SCALE constant tunes how aggressive the opacity is
    // per native-grid unit.  The native grid spans [0,1]^3 so a full
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
    // lut.a * intensity * densityScale * nativeStepLength:
    //   - visibility from the contrast window, fading out near-mean
    //     voxels (problem 1: "contrast was amplifying noise").
    //   - sphericalEnvelope fading out the cube corners (problem 2:
    //     "the cube silhouette is visible").  Cubes that don't want
    //     this set both envelope edges past √3 and the multiplier is
    //     pinned to 1.0 — same shader path, no branching.
    let envelope = sphericalEnvelope(uniforms.nativeBoxOffset + samplePos * uniforms.nativeBoxScale,
                                     uniforms.envelopeInner, uniforms.envelopeOuter);
    let alpha = lut.a * uniforms.intensity * uniforms.densityScale * nativeStepLength
              * visibility * envelope;
    // Bright-end-weighted exposure boost.  An earlier draft scaled
    // every voxel uniformly by exposure (rgb * alpha * uniforms.exposure),
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
    // divergent palettes (coolwarm, contrastCenter=0.5) it ramps in
    // symmetrically toward both palette extremes.  Mid-tones near the
    // center get highlightGain ≈ 1.0 (no boost), so the warm gradient
    // stays LDR-bounded; only peaks push past the LUT's brightest
    // entry into the "blow out to white" regime that the rgba16float
    // target + tonemap pass produce.
    let halfRange = max(uniforms.contrastCenter, 1.0 - uniforms.contrastCenter);
    let dev = abs(signedT - uniforms.contrastCenter) / max(halfRange, 1e-3);
    let blowout = smoothstep(0.5, 1.0, dev);
    let highlightGain = 1.0 + blowout * max(uniforms.exposure - 1.0, 0.0);
    var rgb = lut.rgb * alpha * highlightGain;
    if (LEVELS) {
      rgb = LEVEL_TINTS[level] * (2.0 * dot(lut.rgb, vec3<f32>(0.2126, 0.7152, 0.0722))) * alpha;
    }
    let contrib = vec4<f32>(rgb, alpha);
    // Front-to-back over-compositing within this field.
    accum = accum + (1.0 - accum.a) * contrib;
    if (accum.a > SATURATION_THRESHOLD) { break; }
    rayDistance = rayDistance + stepLength;
  }
  // Apply the per-field fade opacity. Multiplying the entire vec4
  // (rgb * a, a) by a scalar preserves the premultiplied-alpha
  // invariant (output stays in the (rgb * faded_a, faded_a) shape
  // the additive blend expects). The volume's per-step alpha
  // composition is unchanged — we just dim the final integrated
  // result.
  return accum * fade.opacity;
}
