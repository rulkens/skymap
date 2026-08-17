// dustMap/vertex.wesl — silhouette-quad vertex stage for the dust column-
// accumulation pass: one instanced quad per dust component, same geometry
// as fieldSplat/vertex.wesl (lib/splatSilhouette) — a dust component is a
// Gaussian with a boundRadius like any emission component, so the same
// per-axis tangent-cone footprint applies unchanged.

import package::milkyWay::field::dustMap::io::DustMapOut;
import package::lib::billboard::quadCorner;
import package::lib::splatSilhouette::splatNdc;
import package::milkyWay::field::io::u;
import package::milkyWay::field::io::comps;

@vertex
fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) inst: u32) -> DustMapOut {
  let corner = quadCorner(vi);
  // counts.y is dustOffset (== the emission count, since dust is appended
  // last — see io.wesl's layout comment): this draw's own instance index is
  // relative to the dust slice, not 'comps' as a whole.
  let dustOffset = u32(u.counts.y);
  let compIndex = dustOffset + inst;
  let center = comps[compIndex].center;
  let r = comps[compIndex].boundRadius;

  let eye = u.eye.xyz;
  let camRight = u.camRight.xyz;
  let camUp = u.camUp.xyz;
  let camFwd = u.camFwd.xyz;
  let tanHalfFov = u.params.x;
  let aspect = u.params.y;
  let shift = u.params.z;

  // View-space offset of the centre: zv along the gaze, xv/yv across it.
  let rel = center - eye;
  let zv = dot(rel, camFwd);
  let xv = dot(rel, camRight);
  let yv = dot(rel, camUp);

  var out: DustMapOut;
  out.inst = inst;
  let ndc = splatNdc(corner, xv, yv, zv, r, tanHalfFov, aspect, shift, u.perf.x);
  out.pos = vec4<f32>(ndc, 0.0, 1.0);
  out.ndc = ndc;
  return out;
}
