// bodies/sgrAStarLensing/vertex.wesl — camera-facing billboard covering
// Sgr A*'s lensing halo. Not a fullscreen triangle: the uniform carries no
// inverse-viewProj, so the quad's perspective-interpolated plane position
// stands in for an unprojected ray (the fragment normalizes it).

import package::lib::sgrAStarLensing::SgrAStarLensingUniforms;
import package::lib::camera::worldToClip;
import package::lib::billboard::quadCorner;

@group(0) @binding(0) var<uniform> u: SgrAStarLensingUniforms;

// Slack on the exact fade-covering radius, so the fragment's fade always
// reaches 0 strictly inside the quad.
const BILLBOARD_MARGIN: f32 = 1.1;

struct VsOut {
  @builtin(position) clip: vec4<f32>,
  // Camera-relative plane position; the fragment renormalizes it.
  @location(0) posRelCamM: vec3<f32>,
};

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> VsOut {
  let toAnchor = u.anchorPosRelCamM;
  let anchorDistM = length(toAnchor);
  // Look-at basis from the anchor direction alone; degenerate only along
  // world +Y, unreachable while the camera looks toward the hole.
  let forward = toAnchor / max(anchorDistM, 1e-6);
  let worldUp = vec3<f32>(0.0, 1.0, 0.0);
  let right = normalize(cross(worldUp, forward));
  let up = cross(forward, right);

  // Half-size arrives finished from the CPU ('lensQuadPlaneRadiusRs', f64):
  // in f32 HERE the b = R·d/sqrt(R^2+d^2) inversion degenerates close-in into
  // a ~5e4x-oversized quad whose interpolation shakes every ray.
  let worldRadiusM = u.schwarzschildRadiusM * u.quadPlaneRadiusRs * BILLBOARD_MARGIN;
  let corner = quadCorner(vi);
  let posRelCamM = toAnchor + right * (corner.x * worldRadiusM) + up * (corner.y * worldRadiusM);

  var out: VsOut;
  out.clip = worldToClip(u.cam, posRelCamM);
  out.posRelCamM = posRelCamM;
  return out;
}
