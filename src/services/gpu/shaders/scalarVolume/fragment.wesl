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
  // Per-field contrast.  Applied as a gamma-style remap of the LUT
  // sample coordinate around the 0.5 pivot:
  //
  //   t' = 0.5 + sign(t - 0.5) * pow(abs(t - 0.5) * 2, 1/contrast) * 0.5
  //
  // contrast = 1.0 → identity.  contrast > 1.0 pushes mid-tones toward
  // the extremes (more visible structure for divergent palettes
  // centered on the cosmic mean).  contrast < 1.0 compresses toward
  // the midpoint.  Orthogonal to `intensity`: intensity controls how
  // OPAQUE the volume is overall, contrast controls how MUCH of the
  // dynamic range gets pushed to the saturated ends of the palette.
  contrast: f32,
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
    // Apply the per-field contrast remap around the 0.5 pivot.  See
    // VolumeUniforms.contrast for the formula's rationale.  Branching
    // on contrast == 1.0 would be a tiny perf win but breaks the
    // uniform-control-flow contract that lets us use textureSampleLevel
    // a few lines down; the math is cheap enough to run unconditionally.
    let centered = sampleValue - 0.5;
    let contrastedT = clamp(
      0.5 + sign(centered) * pow(abs(centered) * 2.0, 1.0 / u.contrast) * 0.5,
      0.0,
      1.0,
    );
    // Look up colour through the 1D palette LUT.  Same uniformity
    // constraint, same fix.
    let lut = textureSampleLevel(palette, paletteSampler, contrastedT, 0.0);
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
    // ScalarCube.densityScale for the rationale; values in the [1, 10]
    // range are typical (1.0 = no scaling for already-normalised data,
    // 5.0 = lift a sparse Gaussian into a saturating regime).
    let alpha = lut.a * u.intensity * u.densityScale * stepLength;
    let contrib = vec4<f32>(lut.rgb * alpha, alpha);
    // Front-to-back over-compositing within this field.
    accum = accum + (1.0 - accum.a) * contrib;
    if (accum.a > SATURATION_THRESHOLD) { break; }
    t = t + stepLength;
  }
  return accum;
}
