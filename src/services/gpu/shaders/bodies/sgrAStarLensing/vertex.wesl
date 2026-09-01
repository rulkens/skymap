// bodies/sgrAStarLensing/vertex.wesl — camera-facing billboard covering
// Sgr A*'s lensing halo. Not a fullscreen triangle: the locked 144-byte
// 'SgrAStarLensingUniforms' carries no inverse-viewProj/camera basis, so a
// flat quad's exact perspective-interpolated plane position stands in for
// an unprojected ray (the fragment normalizes it) — the quad's own basis is
// a look-at built from 'anchorPosRelCamM' alone.

import package::lib::sgrAStarLensing::SgrAStarLensingUniforms;
import package::lib::camera::worldToClip;
import package::lib::billboard::quadCorner;

@group(0) @binding(0) var<uniform> u: SgrAStarLensingUniforms;

// Half-size as a multiple of the LUT's max impact parameter — margin past
// the fragment's matching edge fade so the two can't drift apart.
const BILLBOARD_MARGIN: f32 = 1.5;

struct VsOut {
  @builtin(position) clip: vec4<f32>,
  // Camera-relative billboard-plane position, perspective-interpolated
  // (the fragment renormalizes after interpolation).
  @location(0) posRelCamM: vec3<f32>,
};

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> VsOut {
  let toAnchor = u.anchorPosRelCamM;
  let anchorDistM = length(toAnchor);
  // Look-at basis from the anchor direction alone; degenerate only along
  // world +Y, unreachable while the camera looks toward the hole ('enabled').
  let forward = toAnchor / max(anchorDistM, 1e-6);
  let worldUp = vec3<f32>(0.0, 1.0, 0.0);
  let right = normalize(cross(worldUp, forward));
  let up = cross(forward, right);

  let worldRadiusM = u.schwarzschildRadiusM * u.lutMaxImpactParamRs * BILLBOARD_MARGIN;
  let corner = quadCorner(vi);
  let posRelCamM = toAnchor + right * (corner.x * worldRadiusM) + up * (corner.y * worldRadiusM);

  var out: VsOut;
  out.clip = worldToClip(u.cam, posRelCamM);
  out.posRelCamM = posRelCamM;
  return out;
}
