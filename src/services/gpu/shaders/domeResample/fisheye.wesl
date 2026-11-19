// domeResample/fisheye.wesl — which dome-cube face an output position looks
// into, and where on it: NDC -> direction via the dome frame's equidistant
// fisheye formula -> argmax over DOME_FACES for the face and its uv. Shared by
// every resample of a per-face texture (the colour image, the occlusion mask),
// so two resamples can never disagree about which face holds a pixel.

import package::domeResample::io::DOME_FACES;

struct FaceTap {
  // False outside the fisheye circle, where no face holds the position.
  inside: bool,
  layer: i32,
  uv: vec2<f32>,
};

fn fisheyeFaceTap(ndc: vec2<f32>) -> FaceTap {
  let ndcRadius = length(ndc);
  if (ndcRadius > 1.0) {
    return FaceTap(false, 0, vec2<f32>(0.0));
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
  return FaceTap(
    true,
    i32(bestFace),
    vec2<f32>((rightCoord + 1.0) / 2.0, (1.0 - upCoord) / 2.0),
  );
}
