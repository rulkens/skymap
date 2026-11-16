// fieldSplat/vertex.wesl — silhouette-quad vertex stage for the primary
// field emission pass. Passes capHalfNdc = 0.0 as a LITERAL rather than
// reading uniforms.perf.x: the quad cap (the quad-cap lever) is an HII-only knob (io.wesl's
// perf.x doc) and this pass's own header always packs it 0, so the literal
// makes that dead weight visible at the call site instead of only in a
// header comment. No near-fade either (contrast hiiSplat/vertex.wesl): the
// primary's disc/bulge components have a boundRadius the eye is ALWAYS
// inside at any interesting pose, so fading here would black the galaxy.

import package::milkyWay::field::fieldSplat::io::FieldSplatOut;
import package::lib::billboard::quadCorner;
import package::lib::splatSilhouette::splatNdc;
import package::milkyWay::field::io::uniforms;
import package::milkyWay::field::io::comps;

@vertex
fn vs(@builtin(vertex_index) vertexIndex: u32, @builtin(instance_index) inst: u32) -> FieldSplatOut {
  let corner = quadCorner(vertexIndex);
  let center = comps[inst].center;
  let boundRadius = comps[inst].boundRadius;

  let eye = uniforms.eye.xyz;
  let camRight = uniforms.camRight.xyz;
  let camUp = uniforms.camUp.xyz;
  let camFwd = uniforms.camFwd.xyz;

  // View-space offset of the centre: viewDepth along the gaze, viewX/viewY across it.
  let rel = center - eye;
  let viewDepth = dot(rel, camFwd);
  let viewX = dot(rel, camRight);
  let viewY = dot(rel, camUp);

  var out: FieldSplatOut;
  out.inst = inst;

  let ndc = splatNdc(corner, viewX, viewY, viewDepth, boundRadius, uniforms.frustum, 0.0);
  out.pos = vec4<f32>(ndc, 0.0, 1.0);
  out.ndc = ndc;
  return out;
}
