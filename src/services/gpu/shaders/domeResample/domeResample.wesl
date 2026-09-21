// domeResample.wesl -- equidistant-fisheye resample of the five dome-cube
// faces into one image. Per-fragment: NDC from uv, direction from the dome
// frame's fisheye formula, argmax over DOME_FACES for the face + its uv,
// then one texture_2d_array sample. See the dome-fisheye plan's 'Dome frame'
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

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> FullscreenOut {
  return fullscreenVertex(vi);
}

@fragment
fn fs(in: FullscreenOut) -> @location(0) vec4<f32> {
  let ndc = vec2<f32>(in.uv.x * 2.0 - 1.0, 1.0 - in.uv.y * 2.0);
  let r = length(ndc);
  if (r > 1.0) {
    return vec4<f32>(0.0, 0.0, 0.0, 1.0);
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

  return vec4<f32>(textureSampleLevel(faces, faceSampler, uv, i32(bestFace), 0.0).rgb, 1.0);
}
