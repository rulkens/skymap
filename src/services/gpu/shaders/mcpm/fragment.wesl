// mcpm/fragment.wesl — raymarch of the sim's trace grid under Polyphorm's transfer
// function. The buffer is sampled in place through grid.wesl's manual trilinear; there
// is no copy into a texture and no packing step.
//
// Everything is in VOXEL space, the frame sampleTrace and the agents share: the grid
// AABB is [0, dims]. 'stepVoxels = 1.0' is FORK PARITY exactly — the obliquity divide at
// the step below gives every ray the fork's own sample count, one per axis-aligned slab
// (main.cpp:711-731), at any view angle. The fork's closing 'fragment.rgb *= 2.0' is
// dropped as a plain scale on rgb: exposure = 2 in the blit reproduces it.
// DIVERGENCE: no trim box; the workbench's grid box is the crop.

import package::mcpm::grid::gridDims;
import package::mcpm::grid::sampleTrace;
import package::mcpm::vertex::McpmVsOut;

// group(0) and group(1) are io.wesl's contract, reached through grid.wesl — 'sim' for
// the dims, slot 2 for the trace buffer. This pass adds group(2) of its own; the camera
// arrives pre-resolved (basis vectors already scaled by tan(fovY/2) and aspect) so the
// fragment never needs a matrix inverse.
struct TraceView {
  camVoxel: vec3<f32>,
  trimDensity: f32,
  camForward: vec3<f32>,
  sampleWeight: f32,
  camRight: vec3<f32>,
  opticalThickness: f32,
  camUp: vec3<f32>,
  stepVoxels: f32,
  maxSteps: u32,
};

@group(2) @binding(0) var<uniform> view: TraceView;
@group(2) @binding(1) var palette: texture_2d<f32>;
@group(2) @binding(2) var paletteSampler: sampler;

const SATURATION: f32 = 0.99;

// ps_volume_trace.wgsl:132 with its only caller's slope of 1.0.
fn remap(v: f32) -> f32 {
  return 1.0 - exp(-v);
}

// Ray against the grid box in voxel space. '.x' is the entry t clamped to 0 so a camera
// inside the grid marches from its own position; '.y' is the exit. Miss when .y <= .x.
fn intersectGrid(o: vec3<f32>, d: vec3<f32>) -> vec2<f32> {
  let invD = 1.0 / d;
  let t0 = -o * invD;
  let t1 = (vec3<f32>(gridDims()) - o) * invD;
  let lo = min(t0, t1);
  let hi = max(t0, t1);
  let entry = max(max(max(lo.x, lo.y), lo.z), 0.0);
  return vec2<f32>(entry, min(min(hi.x, hi.y), hi.z));
}

@fragment
fn fs(input: McpmVsOut) -> @location(0) vec4<f32> {
  let ndc = vec2<f32>(input.uv.x * 2.0 - 1.0, 1.0 - input.uv.y * 2.0);
  let dir = normalize(view.camForward + view.camRight * ndc.x + view.camUp * ndc.y);
  let span = intersectGrid(view.camVoxel, dir);
  if (span.y <= span.x) {
    return vec4<f32>(0.0);
  }

  // Step one slab, not one voxel of ray: the fork's slabs are axis-aligned, so a ray
  // crosses dims[dominant axis] of them whatever its angle. Dividing by the dominant
  // component undoes the obliquity a fixed ray-length step would over-sample (up to
  // 1.73x); dir is normalized, so that component is at least 1/sqrt(3).
  let stepLength = max(view.stepVoxels / max(max(abs(dir.x), abs(dir.y)), abs(dir.z)), 1e-3);
  var accum = vec4<f32>(0.0);
  // Half a step in, so the first sample sits at the centre of the first voxel of path
  // rather than on the box face where the trilinear is half outside the grid.
  var t = span.x + stepLength * 0.5;
  for (var i = 0u; i < view.maxSteps; i = i + 1u) {
    if (t >= span.y) {
      break;
    }
    let density = sampleTrace(view.camVoxel + dir * t);
    if (density > view.trimDensity) {
      // ps_volume_trace.wgsl:163-191, verbatim: the palette carries colour only, alpha
      // is opticalThickness x r (the LUT's own baked alpha ramp is deliberately unused).
      let r = remap((density - view.trimDensity) * view.sampleWeight);
      let rgb = textureSampleLevel(palette, paletteSampler, vec2<f32>(r, 0.5), 0.0).rgb;
      let a = view.opticalThickness * r;
      // Front-to-back 'over', premultiplied — the same operator as the fork's
      // back-to-front ALPHA blend state over its slab stack, walked the other way.
      accum = accum + (1.0 - accum.a) * vec4<f32>(rgb * a, a);
      if (accum.a > SATURATION) {
        break;
      }
    }
    t = t + stepLength;
  }
  return accum;
}
