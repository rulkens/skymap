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

// Slack on the exactly-computed fade-covering plane radius below — only
// float rounding to absorb, so the fragment's fade always reaches 0 strictly
// inside the quad.
const BILLBOARD_MARGIN: f32 = 1.1;

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

  // Cover impact parameters out to the fragment's fade end: a fragment at
  // plane radius R (anchor distance d) rides a ray with impact parameter
  // b = R·d/sqrt(R^2 + d^2), so R = b·d/sqrt(d^2 - b^2). The layer caps
  // 'edgeFadeEndRs' at 0.6·d (in r_s), bounding this stretch at 1.25 — but
  // its lutMax floor can exceed d during a close descent, where the max()
  // degenerates the sqrt and R blows up to an effectively fullscreen quad:
  // exactly the right limit there (everything on screen is strongly lensed),
  // clip does the bounding.
  let dRs = anchorDistM / u.schwarzschildRadiusM;
  let fadeEndRs = u.edgeFadeEndRs;
  let planeRadiusRs = fadeEndRs * dRs / sqrt(max(dRs * dRs - fadeEndRs * fadeEndRs, 1e-6));
  let worldRadiusM = u.schwarzschildRadiusM * planeRadiusRs * BILLBOARD_MARGIN;
  let corner = quadCorner(vi);
  let posRelCamM = toAnchor + right * (corner.x * worldRadiusM) + up * (corner.y * worldRadiusM);

  var out: VsOut;
  out.clip = worldToClip(u.cam, posRelCamM);
  out.posRelCamM = posRelCamM;
  return out;
}
