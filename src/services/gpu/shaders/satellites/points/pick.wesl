// satellites/points/pick.wesl — the dots' pick stamp on the overlay pick target: the same
// placement as the draw, a round footprint of 'sizePx' (set wider than the dot for picking), and
// no stamp where Earth or another resolved body stands in front (the occluder spheres; the pick
// has no scene depth to sample).

import package::satellites::points::io::SatelliteInstance;
import package::satellites::points::io::SatelliteUniforms;
import package::satellites::points::io::PickOut;
import package::satellites::points::project::projectSatellite;
import package::lib::billboard::quadCorner;
import package::lib::billboard::expandBillboardScreen;
import package::lib::trailOcclusion::trailClearance;

@group(0) @binding(2) var<uniform> u: SatelliteUniforms;

const W_EPS: f32 = 0.01;
// Mid-range in either depth convention, so every caption stamp (pinned at the near end) out-picks
// a dot it overlaps.
const PICK_DEPTH: f32 = 0.5;

@vertex
fn vsPick(@builtin(vertex_index) vid: u32, sat: SatelliteInstance) -> PickOut {
  var out: PickOut;
  let p = projectSatellite(u, sat);
  if (p.centre.w < W_EPS || u.classOpacity[min(sat.classCode, 2u)] <= 0.0) {
    return out;
  }
  let corner = quadCorner(vid);
  let offset = expandBillboardScreen(u.cam, p.centre, u.sizePx, corner);
  out.clip = vec4<f32>(p.centre.xy + offset, PICK_DEPTH * p.centre.w, p.centre.w);
  out.relKm = p.relKm;
  out.corner = corner;
  out.word = u.pickBase + sat.catalogIndex;
  return out;
}

@fragment
fn fsPick(in: PickOut) -> @location(0) u32 {
  let clear = trailClearance(in.relKm, in.clip.xy);
  if (dot(in.corner, in.corner) > 1.0 || clear < 0.5) {
    discard;
  }
  return in.word;
}
