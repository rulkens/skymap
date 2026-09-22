// domeResample.wesl -- equidistant-fisheye resample of the five dome-cube
// faces into one image. Per-fragment: a grid of sub-pixel taps, each one
// NDC -> direction via the dome frame's fisheye formula -> argmax over
// DOME_FACES for the face + its uv -> one texture_2d_array sample; the taps
// average into the output pixel. See the dome-fisheye plan's 'Dome frame'
// table for the derivation; DOME_FACES here is the WGSL twin of
// 'src/data/rendering/domeFaces.ts' (pinned by domeFaces.parity.test.ts).

import package::lib::fullscreenTri::fullscreenVertex;
import package::lib::fullscreenTri::FullscreenOut;

@group(0) @binding(0) var faces: texture_2d_array<f32>;
@group(0) @binding(1) var faceSampler: sampler;

// Column-major, one face per row of this table: (right, up, forward) as
// three columns, literal numbers only -- domeFaces.parity.test.ts text-pins
// this against the TS table.
const DOME_FACES = array<mat3x3<f32>, 5>(
  mat3x3<f32>(1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0),
  mat3x3<f32>(0.0, 0.0, 1.0, 0.0, 1.0, 0.0, -1.0, 0.0, 0.0),
  mat3x3<f32>(0.0, 0.0, -1.0, 0.0, 1.0, 0.0, 1.0, 0.0, 0.0),
  mat3x3<f32>(-1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, -1.0),
  mat3x3<f32>(1.0, 0.0, 0.0, 0.0, 0.0, -1.0, 0.0, 1.0, 0.0),
);

// The fisheye output is a MINIFICATION of every face: N/pi output px per
// radian against a face's N/2 on axis and N/(2 cos^2) off axis, a 1.6x to
// 3x shrink. One bilinear tap under-samples that, and a floor-sized star
// (1.5 face px) then pulses as the camera moves it across the output grid.
// A 3x3 box of taps over the pixel footprint covers the whole shrink range.
const TAPS_PER_AXIS: u32 = 3u;

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> FullscreenOut {
  return fullscreenVertex(vi);
}

fn sampleFisheye(ndc: vec2<f32>) -> vec3<f32> {
  let r = length(ndc);
  if (r > 1.0) {
    return vec3<f32>(0.0);
  }

  var dir: vec3<f32>;
  if (r == 0.0) {
    dir = vec3<f32>(0.0, 1.0, 0.0);
  } else {
    let theta = r * 1.5707963267948966;
    let sinT = sin(theta);
    let cosT = cos(theta);
    dir = vec3<f32>(sinT * (ndc.x / r), cosT, -sinT * (ndc.y / r));
  }

  // Runtime-indexed loop over a function-scope copy: indexing the module
  // 'const' array directly is not portable across WGSL compilers.
  var facesTable = DOME_FACES;
  var bestFace = 0u;
  var bestForward = -3.4e38;
  for (var i = 0u; i < 5u; i = i + 1u) {
    let forward = dot(dir, facesTable[i][2]);
    if (forward > bestForward) {
      bestForward = forward;
      bestFace = i;
    }
  }

  let face = facesTable[bestFace];
  let right = face[0];
  let up = face[1];
  let forward = face[2];
  let s = dot(dir, right) / dot(dir, forward);
  let t = dot(dir, up) / dot(dir, forward);
  let uv = vec2<f32>((s + 1.0) / 2.0, (1.0 - t) / 2.0);

  return textureSampleLevel(faces, faceSampler, uv, i32(bestFace), 0.0).rgb;
}

@fragment
fn fs(in: FullscreenOut) -> @location(0) vec4<f32> {
  // One output pixel's footprint in NDC, taken from the interpolated uv's
  // screen derivatives; read here, in uniform control flow, before any
  // branch. uv.y runs opposite to NDC y, hence the sign on the second axis.
  let pxNdc = vec2<f32>(2.0 * dpdx(in.uv.x), -2.0 * dpdy(in.uv.y));
  let centre = vec2<f32>(in.uv.x * 2.0 - 1.0, 1.0 - in.uv.y * 2.0);

  let taps = f32(TAPS_PER_AXIS);
  var sum = vec3<f32>(0.0);
  for (var j = 0u; j < TAPS_PER_AXIS; j = j + 1u) {
    for (var i = 0u; i < TAPS_PER_AXIS; i = i + 1u) {
      let offset = (vec2<f32>(f32(i), f32(j)) + 0.5) / taps - 0.5;
      sum = sum + sampleFisheye(centre + offset * pxNdc);
    }
  }
  return vec4<f32>(sum / (taps * taps), 1.0);
}
