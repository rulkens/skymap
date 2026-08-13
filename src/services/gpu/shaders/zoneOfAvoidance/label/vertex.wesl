// zoneOfAvoidance/label/vertex.wesl — curved on-band lettering vertex stage.
//
// Each glyph is a WORLD-FIXED quad on the band's galactic-plane circle at
// radius 'labelRadiusMpc' — NOT a billboard, no camera read anywhere below.
// Arc length / radius = angle: 'localOffset.x' (a Mpc-equivalent pen offset
// baked once at construction) divides by the per-frame 'labelRadiusMpc'
// uniform to get the glyph's arc-angle offset from its repeat's base
// longitude. 'bandAxes' is evaluated ONCE per glyph (from 'galacticLonRad'
// plus that one arc offset) — every corner of one glyph then shares the
// SAME tangent/normal basis, which is what makes the quad FLAT: the true
// arc curves away from it by ~localSize.x^2 / (8 * labelRadiusMpc), the
// spec's flagged, accepted chording approximation (escalate to subdivided
// strips only if a visual pass actually shows it).
//
// ## bandAxes sign derivation
//
// 'tangent' is the direction of INCREASING galactic longitude:
// d/dl [cos(l)*GAL_X_EQ + sin(l)*GAL_Y_EQ] = -sin(l)*GAL_X_EQ + cos(l)*GAL_Y_EQ.
// A camera near the world origin looking radially OUTWARD at a point on the
// band (forward = bandDir(l), up = GAL_Z_EQ, the same up every consumer of
// GAL_Z_EQ treats as the pole) has camera-right = cross(forward, up), which
// works out to exactly '-tangent' for this basis (GAL_X_EQ x GAL_Y_EQ =
// GAL_Z_EQ, i.e. right-handed). So placing glyphs with INCREASING pen-x at
// DECREASING longitude — 'lonRad = galacticLonRad - arcRad' below — is what
// keeps the text reading left-to-right instead of mirrored for that camera.
// 'normal' is the fixed North-Galactic-Pole direction: the b-derivative of
// the galactic unit sphere at b=0 collapses to exactly GAL_Z_EQ regardless
// of longitude, so it needs no per-glyph recomputation.

import package::zoneOfAvoidance::label::io::Uniforms;
import package::zoneOfAvoidance::label::io::VsIn;
import package::zoneOfAvoidance::label::io::VsOut;
import package::lib::camera::worldToClip;
import package::lib::util::GAL_X_EQ;
import package::lib::util::GAL_Y_EQ;
import package::lib::util::GAL_Z_EQ;

@group(0) @binding(0) var<uniform> u: Uniforms;

struct BandAxes {
  tangent: vec3<f32>,
  normal: vec3<f32>,
};

// Camera-independent tangent/normal basis at one galactic longitude on the
// band's plane circle. Mirrors 'lib::orientation::diskAxes' — pure trig
// from a scalar input, no camera parameter — but stays local to this
// module (single consumer today; promote to lib/orientation.wesl on a
// second one, per lib/util.wesl's promotion convention).
fn bandAxes(galacticLonRad: f32) -> BandAxes {
  var axes: BandAxes;
  axes.tangent = -sin(galacticLonRad) * GAL_X_EQ + cos(galacticLonRad) * GAL_Y_EQ;
  axes.normal = GAL_Z_EQ;
  return axes;
}

// World-space unit direction toward galactic longitude 'galacticLonRad' at
// latitude 0 — the point on the plane circle 'bandAxes' is tangent to.
fn bandDir(galacticLonRad: f32) -> vec3<f32> {
  return cos(galacticLonRad) * GAL_X_EQ + sin(galacticLonRad) * GAL_Y_EQ;
}

@vertex
fn vs(input: VsIn) -> VsOut {
  // Anchor arc position (see module header): only 'localOffset' feeds this,
  // never 'corner' — every corner of one glyph shares the same longitude.
  let arcRad = input.localOffset.x / u.labelRadiusMpc;
  let lonRad = input.galacticLonRad - arcRad;
  // Latitude offset from the galactic plane, same small-angle treatment
  // (negated to match the atlas's Y-down -> world-up convention every
  // other label shader applies — see labels/vertex.wesl's cornerAtlasPx.y).
  let latRad = -input.localOffset.y / u.labelRadiusMpc;

  let axes = bandAxes(lonRad);
  let xAxis = -axes.tangent;
  let yAxis = axes.normal;

  // Flat-tangent-plane placement: the anchor lifts off the plane circle by
  // 'latRad' along yAxis (exact at latRad=0, the accepted small-angle
  // approximation otherwise — every repeat's baseline sits ON the plane),
  // and the corner spread across the glyph's own w/h is a further flat
  // offset in the SAME plane, not re-projected onto the sphere per corner.
  let center = u.labelRadiusMpc * (bandDir(lonRad) + latRad * yAxis);
  let cornerX = input.corner.x * input.localSize.x;
  let cornerY = input.corner.y * input.localSize.y;
  let world = center + xAxis * cornerX - yAxis * cornerY;

  var out: VsOut;
  out.pos = worldToClip(u.cam, world);
  out.uv = mix(input.uvRect.xy, input.uvRect.zw, input.corner);
  return out;
}
