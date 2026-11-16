// domeResample/fragment.wesl — equidistant-fisheye resample of the five
// dome-cube faces into one image. Per-fragment: a grid of sub-pixel taps,
// each one NDC -> direction via the dome frame's fisheye formula -> argmax
// over DOME_FACES for the face + its uv -> one texture_2d_array sample;
// the taps average into the output pixel. The sampled texture and its
// sampler are fragment-only resources (the vertex stage reads neither), so
// both bindings live here rather than in io.wesl.

import package::domeResample::io::DOME_FACES;
import package::domeResample::io::TAPS_PER_AXIS;
import package::lib::fullscreenTri::FullscreenOut;

@group(0) @binding(0) var faces: texture_2d_array<f32>;
@group(0) @binding(1) var faceSampler: sampler;

fn sampleFisheye(ndc: vec2<f32>) -> vec3<f32> {
  let ndcRadius = length(ndc);
  if (ndcRadius > 1.0) {
    return vec3<f32>(0.0);
  }

  var dir: vec3<f32>;
  if (ndcRadius == 0.0) {
    dir = vec3<f32>(0.0, 1.0, 0.0);
  } else {
    let theta = ndcRadius * 1.5707963267948966;
    let sinT = sin(theta);
    let cosT = cos(theta);
    dir = vec3<f32>(sinT * (ndc.x / ndcRadius), cosT, -sinT * (ndc.y / ndcRadius));
  }

  // Runtime-indexed loop over a function-scope copy: indexing the module
  // 'const' array directly is not portable across WGSL compilers.
  var facesTable = DOME_FACES;
  var bestFace = 0u;
  var bestForward = -3.4e38;
  for (var faceIndex = 0u; faceIndex < 5u; faceIndex = faceIndex + 1u) {
    let forward = dot(dir, facesTable[faceIndex][2]);
    if (forward > bestForward) {
      bestForward = forward;
      bestFace = faceIndex;
    }
  }

  let face = facesTable[bestFace];
  let right = face[0];
  let up = face[1];
  let forward = face[2];
  let rightCoord = dot(dir, right) / dot(dir, forward);
  let upCoord = dot(dir, up) / dot(dir, forward);
  let uv = vec2<f32>((rightCoord + 1.0) / 2.0, (1.0 - upCoord) / 2.0);

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
  for (var tapRow = 0u; tapRow < TAPS_PER_AXIS; tapRow = tapRow + 1u) {
    for (var tapColumn = 0u; tapColumn < TAPS_PER_AXIS; tapColumn = tapColumn + 1u) {
      let offset = (vec2<f32>(f32(tapColumn), f32(tapRow)) + 0.5) / taps - 0.5;
      sum = sum + sampleFisheye(centre + offset * pxNdc);
    }
  }
  return vec4<f32>(sum / (taps * taps), 1.0);
}
