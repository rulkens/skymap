// Scalar volume fragment. Front-face culling rasterises only back faces, which exist wherever
// the cube projects, camera inside it or out, so neither case needs a branch. Each fragment
// rebuilds the camera ray, clips it to the local [0,1]³ AABB (intersectAabb clamps tMin to 0
// inside the cube) and marches front to back.
//
// Output is premultiplied (rgb·a, a), over-composited within this field; the pipeline blends
// fields additively into the HDR target, so two fields sum.

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
  // applyContrastWindow's deadband width, 1 = identity. Intensity is overall opacity; this picks
  // which voxels take part.
  contrast: f32,
  // The window's centre in LUT space: 0.5 for divergent palettes, 0 for sequential (MCPM:
  // 0 = void).
  contrastCenter: f32,
  // sphericalEnvelope edges, in local distance from the centre (inscribed sphere 1, corners √3);
  // both ≥ √3 disables it.
  envelopeInner: f32,
  envelopeOuter: f32,
  // HDR boost on rgb only (more alpha would hide structure), weighted to the palette's extremes.
  exposure: f32,
  // Extra cut in [0, 0.95]: the fraction of what survives the contrast deadband also suppressed.
  trim: f32,
  // The engine frame index, shared by every view of a frame (all dome faces). The CPU wraps it at
  // 1e6, a multiple of the mask's slice count, so it is exact in f32.
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
// The palette LUT is an N x 1 2D texture, never texture_1d: WGSL has no textureSampleLevel for
// texture_1d, and iOS WebKit rejects it at compile time (dropping every frame), unlike Tint.
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
// The "Colour by level" debug view: each step shaded by where it read, at twice the palette's
// luminance; off compiles it out. DENSITY_LEVEL_LEGEND's hexes in linear light, in its order
// (settled, into, out, base mip 0, 1, 2+), which is the `level` index below.
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

// Returns (LUT coordinate, per-step visibility). A deadband of width 1 − 1/contrast, widened by
// trim, is suppressed around `center` and the rest stretched across the palette on its own side;
// halfRange makes the deadband a fraction of the palette whatever the centre.
fn applyContrastWindow(sampleValue: f32, contrast: f32, center: f32, trim: f32) -> vec2<f32> {
  let halfRange = max(center, 1.0 - center);
  let dev = abs(sampleValue - center) / max(halfRange, 1e-3);
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
  // lib::volumeRaymarch carries the normalize-after-invModel landmine.
  let ray = localRayFromWorld(uniforms.invModelMatrix, uniforms.cameraPosWorld, in.worldPos);
  let rayOriginLocal = ray.origin;
  let rayDirLocal = ray.dir;

  let tRange = intersectAabb(rayOriginLocal, rayDirLocal, vec3<f32>(0.0), vec3<f32>(1.0));
  let tMin = tRange.x;
  let tMax = tRange.y;
  if (tMax <= tMin) {
    discard;
  }

  let stepLength = (tMax - tMin) / uniforms.steps;
  // Jitter the start by [0, stepLength), or one shared step phase shows as a grid sliding across
  // the cube. Blue-noise mask (64² slices stacked vertically), slice picked by frame and toroidal
  // in time: any `slices` consecutive frames read each slice once, so the running mean converges.
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
    // The window's centre is the contrastCenter uniform.
    let window = applyContrastWindow(sampleValue, uniforms.contrast, uniforms.contrastCenter, uniforms.trim);
    let signedT = window.x;
    let visibility = window.y;
    // v = 0.5, the single texel row's centre, so clamp-to-edge never bleeds in a neighbour.
    let lut = textureSampleLevel(palette, paletteSampler, vec2<f32>(signedT, 0.5), 0.0);
    // Alpha ∝ nativeStepLength: the discrete optical-depth integral, path-length correct. Scaling
    // it with the ray's whole extent would lighten the blob as the camera enters it.
    let envelope = sphericalEnvelope(uniforms.nativeBoxOffset + samplePos * uniforms.nativeBoxScale,
                                     uniforms.envelopeInner, uniforms.envelopeOuter);
    let alpha = lut.a * uniforms.intensity * uniforms.densityScale * nativeStepLength
              * visibility * envelope;
    // Exposure only past dev 0.5 from the centre: a uniform boost reads as a brightness slider,
    // this lets just the peaks blow past the LUT into the tonemapped white.
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
  // A scalar on the whole premultiplied vec4 keeps the shape the additive blend expects.
  return accum * fade.opacity;
}
