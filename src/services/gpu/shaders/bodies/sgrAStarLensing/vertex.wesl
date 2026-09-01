// bodies/sgrAStarLensing/vertex.wesl — camera-facing billboard covering
// Sgr A*'s visible lensing halo.
//
// Not a literal fullscreen triangle: the locked 144-byte
// 'SgrAStarLensingUniforms' (Task 10) carries no inverse-viewProj and no
// camera-right/up basis, so there is no way to unproject a screen uv into a
// world ray the way 'atmosphere/shell/fragment.wesl''s 'insideRayDir' does.
// A world-space billboard sidesteps that: each fragment's
// perspective-interpolated position on the flat quad IS the exact point
// where the camera ray through that pixel crosses the plane, so the
// fragment recovers its own ray direction by normalizing the interpolated
// position — no inverse matrix needed. The quad's basis is built from
// 'anchorPosRelCamM' alone (a look-at billboard, no separate camera basis
// input either) — see 'vs' below.

import package::lib::sgrAStarLensing::SgrAStarLensingUniforms;
import package::lib::camera::worldToClip;
import package::lib::billboard::quadCorner;

@group(0) @binding(0) var<uniform> u: SgrAStarLensingUniforms;

// Billboard half-size, as a multiple of the LUT's own max sampled impact
// parameter ('u.lutMaxImpactParamRs') — generous margin so the
// escape/annulus classification never runs off the quad's rasterized edge
// under normal (non-2-r_s-floor) viewing. The fragment's own edge fade reads
// 'u.lutMaxImpactParamRs' directly, so this margin and that fade can't drift
// apart into a visible seam.
const BILLBOARD_MARGIN: f32 = 1.5;

struct VsOut {
  @builtin(position) clip: vec4<f32>,
  // Camera-relative world position of this point on the billboard PLANE,
  // perspective-interpolated across the quad — not yet normalized; the
  // fragment renormalizes after interpolation (interpolating a direction
  // linearly and normalizing afterward is the house rule after any
  // matrix/interpolation transform).
  @location(0) posRelCamM: vec3<f32>,
};

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> VsOut {
  let toAnchor = u.anchorPosRelCamM;
  let anchorDistM = length(toAnchor);
  // Look-at billboard basis from the anchor direction alone (no separate
  // camera-right/up uniform — see the module header). Degenerate only when
  // the anchor sits exactly along world +Y, unreachable while the camera is
  // actually looking toward the black hole (this layer's 'enabled' gate).
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
