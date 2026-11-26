// dustMap/vertex.wesl — silhouette-quad vertex stage for the dust column-
// accumulation pass: one instanced quad per dust component, same geometry
// as fieldSplat/vertex.wesl (lib/splatSilhouette) — a dust component is a
// Gaussian with a boundRadius like any emission component, so the same
// per-axis tangent-cone footprint applies unchanged.

import package::milkyWay::field::dustMap::io::DustMapOut;
import package::lib::billboard::quadCorner;
import package::lib::splatSilhouette::splatNdc;
import package::milkyWay::field::io::uniforms;
import package::milkyWay::field::io::comps;

@vertex
fn vs(@builtin(vertex_index) vertexIndex: u32, @builtin(instance_index) inst: u32) -> DustMapOut {
  let corner = quadCorner(vertexIndex);
  // counts.y is dustOffset (== the emission count, since dust is appended
  // last — see io.wesl's layout comment): this draw's own instance index is
  // relative to the dust slice, not 'comps' as a whole.
  let dustOffset = u32(uniforms.counts.y);
  let compIndex = dustOffset + inst;
  let center = comps[compIndex].center;
  let boundRadius = comps[compIndex].boundRadius;

  let eye = uniforms.eye.xyz;
  let camRight = uniforms.camRight.xyz;
  let camUp = uniforms.camUp.xyz;
  let camFwd = uniforms.camFwd.xyz;

  // View-space offset of the centre: viewDepth along the gaze, viewX/viewY across it.
  let rel = center - eye;
  let viewDepth = dot(rel, camFwd);
  let viewX = dot(rel, camRight);
  let viewY = dot(rel, camUp);

  var out: DustMapOut;
  out.inst = inst;
  let ndc = splatNdc(corner, viewX, viewY, viewDepth, boundRadius, uniforms.frustum, uniforms.perf.x);
  out.pos = vec4<f32>(ndc, 0.0, 1.0);
  out.ndc = ndc;
  return out;
}
