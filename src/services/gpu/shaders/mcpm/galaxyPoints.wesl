// mcpm/galaxyPoints.wesl — the catalog points as small additive dots, the workbench's
// Galaxies layer: the fit and the data the sim traces, visible in one frame. A diagnostic
// layer, NOT a port of skymap's runtime pointRenderer: no billboards, thumbnails or LOD.
//
// The three lanes are declared here rather than imported from io.wesl because a VERTEX
// stage cannot bind read_write storage, which is what io's contract makes them. Only the
// shared McpmCamera keeps this pass and the raymarch on the same pixels — see camera.wesl.

import package::mcpm::camera::McpmCamera;
import package::mcpm::camera::voxelToNdc;

struct OverlayParams {
  // Multiplying a raw weight by this gives mean 1 across the data rows
  // (deriveAgentWeights normalises their mean to 1e6 / nDataPoints).
  weightScale: f32,
  intensity: f32,
  // Screen-constant, not world-constant: the layer answers "where are the galaxies",
  // which a dot shrinking into invisibility with distance would stop doing.
  radiusPx: f32,
};

@group(0) @binding(0) var<uniform> cam: McpmCamera;
@group(1) @binding(0) var<storage, read> pointX: array<f32>;
@group(1) @binding(1) var<storage, read> pointY: array<f32>;
@group(1) @binding(2) var<storage, read> pointZ: array<f32>;
@group(1) @binding(3) var<storage, read> pointWeight: array<f32>;
@group(1) @binding(4) var<uniform> overlay: OverlayParams;

const POINT_COLOR: vec3<f32> = vec3<f32>(0.45, 0.75, 1.0);
// The weights are log-mass, so mean-relative spread is narrow; squaring widens it enough
// that massive galaxies read brighter without flat dots elsewhere. Floor keeps every
// catalog point visible; the cap keeps a giant from blooming under additive blend.
const WEIGHT_CONTRAST: f32 = 2.0;
const INTENSITY_FLOOR: f32 = 0.06;
const INTENSITY_CAP: f32 = 6.0;

struct PointVsOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) offset: vec2<f32>,
  @location(1) intensity: f32,
};

@vertex
fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> PointVsOut {
  var corners = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, -1.0), vec2<f32>(-1.0, 1.0),
    vec2<f32>(-1.0, 1.0), vec2<f32>(1.0, -1.0), vec2<f32>(1.0, 1.0)
  );
  let corner = corners[vi];
  let ndc = voxelToNdc(cam, vec3<f32>(pointX[ii], pointY[ii], pointZ[ii]));

  var out: PointVsOut;
  out.offset = corner;
  let wNorm = max(pointWeight[ii] * overlay.weightScale, 0.0);
  // The user knob folds in HERE, not in the fragment: OverlayParams is bound
  // VERTEX-visible only (the lanes beside it cannot be read by a fragment stage).
  out.intensity =
    overlay.intensity * clamp(pow(wNorm, WEIGHT_CONTRAST), INTENSITY_FLOOR, INTENSITY_CAP);
  // Pushing z outside [0, 1] is the only way a vertex stage can drop a primitive, and a
  // point behind the eye has to be dropped: its ndc lanes are sign-flipped garbage.
  if (ndc.z <= 0.0) {
    out.pos = vec4<f32>(0.0, 0.0, 2.0, 1.0);
    return out;
  }
  // 'half' would be a WGSL reserved word.
  let halfPx = vec2<f32>(
    overlay.radiusPx * 2.0 / cam.screenWidth,
    overlay.radiusPx * 2.0 / cam.screenHeight);
  out.pos = vec4<f32>(ndc.xy + corner * halfPx, 0.0, 1.0);
  return out;
}

@fragment
fn fs(input: PointVsOut) -> @location(0) vec4<f32> {
  // Round and soft-edged: a hard square this small reads as noise over the trace.
  let r2 = dot(input.offset, input.offset);
  let a = input.intensity * clamp(1.0 - r2, 0.0, 1.0);
  // Premultiplied — the pass blends one/one, so the alpha lane is carried but never read.
  return vec4<f32>(POINT_COLOR * a, a);
}
