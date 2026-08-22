// labels3d/vertex.wesl — shared world-geometry text vertex stage.
// Generalizes zoneOfAvoidance/label/vertex.wesl's fixed galactic-plane band
// to a per-label arc (any center/plane/radius/repeatCount, read from the
// labels[] storage buffer instead of baked WGSL constants). 'binormal' is
// evaluated ONCE per glyph so every corner shares one flat basis (same
// chording approximation the ZoA path documents).
//
// Sign derivation (load-bearing, see Label3DArcPlacement's docblock): glyphs
// anchor at 'theta = startAngle + repeatAngle - arcRad', not '+', so text
// reads left-to-right rather than mirrored — this depends on the exact
// order of 'binormal = cross(planeNormal, referenceDir)'.

import package::labels3d::io::Uniforms;
import package::labels3d::io::Label3DData;
import package::labels3d::io::VsIn;
import package::labels3d::io::VsOut;
import package::lib::camera::worldToClip;

// Atlas em pixel size — must match 'ATLAS_FONT_SIZE' in src/data/fonts.ts
// (mirrors labels/vertex.wesl's identical constant).
const ATLAS_EM_PX: f32 = 84.0;
const TAU: f32 = 6.283185307179586;

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var<storage, read> labels: array<Label3DData>;

@vertex
fn vs(input: VsIn) -> VsOut {
  let label = labels[input.labelIndex];
  let mpcPerAtlasPx = label.emMpc / ATLAS_EM_PX;

  let binormal = cross(label.planeNormal, label.referenceDir);
  let repeatAngle = f32(input.repeatIndex) * TAU / f32(label.repeatCount);
  let arcRad = input.localOffset.x * mpcPerAtlasPx / label.radiusMpc;
  let theta = label.startAngleRad + repeatAngle - arcRad;
  // Negated to match the atlas Y-down -> world-up convention (labels/vertex.wesl's cornerAtlasPx.y).
  let lat = -input.localOffset.y * mpcPerAtlasPx / label.radiusMpc;

  let dir = cos(theta) * label.referenceDir + sin(theta) * binormal;
  let tangent = -sin(theta) * label.referenceDir + cos(theta) * binormal;
  let xAxis = -tangent;
  let yAxis = label.planeNormal;

  let cornerX = input.corner.x * input.localSize.x * mpcPerAtlasPx;
  let cornerY = input.corner.y * input.localSize.y * mpcPerAtlasPx;
  let center = label.center + label.radiusMpc * (dir + lat * yAxis);
  let world = center + xAxis * cornerX - yAxis * cornerY;

  var out: VsOut;
  out.pos = worldToClip(u.cam, world);
  out.uv = mix(input.uvRect.xy, input.uvRect.zw, input.corner);
  out.color = vec4<f32>(label.color.rgb * label.fadeAlpha, label.color.a * label.fadeAlpha);
  out.fontIndex = input.fontIndex;
  return out;
}
