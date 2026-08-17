// zoneOfAvoidance/label/vertex.wesl — curved on-band lettering vertex
// stage. Each glyph is a world-fixed quad on the band's galactic-plane
// circle (radius 'labelRadiusMpc') — no camera read anywhere below.
// bandAxes is evaluated ONCE per glyph so every corner shares one flat
// basis (the spec's flagged, accepted chording approximation).
// Sign derivation (load-bearing): camera-right for an observer near the
// origin looking outward at bandDir(l) works out to '-tangent'
// (GAL_X_EQ x GAL_Y_EQ = GAL_Z_EQ, right-handed), so glyphs anchor at
// 'galacticLonRad - arcRad' (not '+') to read left-to-right, not mirrored.

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

// Camera-independent basis at one longitude, mirrors diskAxes (lib/orientation.wesl)
// but stays local (single consumer; promote there on a second — lib/util.wesl's convention).
fn bandAxes(galacticLonRad: f32) -> BandAxes {
  var axes: BandAxes;
  axes.tangent = -sin(galacticLonRad) * GAL_X_EQ + cos(galacticLonRad) * GAL_Y_EQ;
  axes.normal = GAL_Z_EQ;
  return axes;
}

// World direction toward (galacticLonRad, lat=0) — the point bandAxes is tangent to.
fn bandDir(galacticLonRad: f32) -> vec3<f32> {
  return cos(galacticLonRad) * GAL_X_EQ + sin(galacticLonRad) * GAL_Y_EQ;
}

@vertex
fn vs(input: VsIn) -> VsOut {
  // Only 'localOffset' feeds the anchor longitude, never 'corner' — keeps
  // one glyph on one flat basis (see module header).
  let arcRad = input.localOffset.x / u.labelRadiusMpc;
  let lonRad = input.galacticLonRad - arcRad;
  // Negated to match the atlas Y-down -> world-up convention (labels/vertex.wesl's cornerAtlasPx.y).
  let latRad = -input.localOffset.y / u.labelRadiusMpc;

  let axes = bandAxes(lonRad);
  let xAxis = -axes.tangent;
  let yAxis = axes.normal;

  let center = u.labelRadiusMpc * (bandDir(lonRad) + latRad * yAxis);
  let cornerX = input.corner.x * input.localSize.x;
  let cornerY = input.corner.y * input.localSize.y;
  let world = center + xAxis * cornerX - yAxis * cornerY;

  var out: VsOut;
  out.pos = worldToClip(u.cam, world);
  out.uv = mix(input.uvRect.xy, input.uvRect.zw, input.corner);
  return out;
}
