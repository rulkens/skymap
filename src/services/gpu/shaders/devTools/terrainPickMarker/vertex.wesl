// terrainPickMarker/vertex.wesl — a screen-facing quad around the pick point,
// four strip vertices derived from '@builtin(vertex_index)' alone (no vertex
// buffer). It is a PROXY: the fragment recovers the real sphere from it, so
// this stage only has to cover the silhouette.

import package::devTools::terrainPickMarker::io::MarkerVSOut;
import package::devTools::terrainPickMarker::io::QUAD_MARGIN;
import package::devTools::terrainPickMarker::io::TerrainPickMarkerUniforms;

@group(0) @binding(0) var<uniform> u: TerrainPickMarkerUniforms;

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> MarkerVSOut {
  // Strip order (0,1,2,3) = (-1,-1), (+1,-1), (-1,+1), (+1,+1).
  let cx = select(-1.0, 1.0, (vi & 1u) == 1u);
  let cy = select(-1.0, 1.0, vi >= 2u);
  let extent = u.radiusM * QUAD_MARGIN;
  let posRelEyeM = u.centreRelEyeM + u.camRight * (cx * extent) + u.camUp * (cy * extent);

  var out: MarkerVSOut;
  out.clip = u.vp * vec4<f32>(posRelEyeM, 1.0);
  out.rayM = posRelEyeM;
  return out;
}
