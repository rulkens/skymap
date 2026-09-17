// terrainPickMarker/vertex.wesl — a screen-facing quad around the pick point,
// four strip vertices derived from '@builtin(vertex_index)' alone (no vertex
// buffer). It is a PROXY: the fragment recovers the real sphere from it, so
// this stage only has to cover the silhouette.

import package::devTools::terrainPickMarker::io::MarkerVSOut;
import package::devTools::terrainPickMarker::io::MAX_SIN_THETA;
import package::devTools::terrainPickMarker::io::QUAD_MARGIN;
import package::devTools::terrainPickMarker::io::TerrainPickMarkerUniforms;

@group(0) @binding(0) var<uniform> u: TerrainPickMarkerUniforms;

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> MarkerVSOut {
  // Strip order (0,1,2,3) = (-1,-1), (+1,-1), (-1,+1), (+1,+1).
  let cx = select(-1.0, 1.0, (vi & 1u) == 1u);
  let cy = select(-1.0, 1.0, vi >= 2u);
  // Half-extent of the silhouette cone on the plane through the marker centre:
  // sin(theta) = radius / range, so the cone's radius there is r / cos(theta).
  // Every ray that can hit the sphere crosses the quad, which is all the proxy
  // owes the fragment stage.
  let sinTheta = min(u.radiusM / max(length(u.centreRelEyeM), 1.0e-3), MAX_SIN_THETA);
  let extent = u.radiusM * QUAD_MARGIN / sqrt(1.0 - sinTheta * sinTheta);
  let posRelEyeM = u.centreRelEyeM + u.camRight * (cx * extent) + u.camUp * (cy * extent);

  var out: MarkerVSOut;
  out.clip = u.vp * vec4<f32>(posRelEyeM, 1.0);
  out.rayM = posRelEyeM;
  return out;
}
