// terrainPickMarker/vertex.wesl — a screen-facing quad around the pick point,
// four strip vertices derived from '@builtin(vertex_index)' alone (no vertex
// buffer). It is a PROXY: the fragment recovers the real sphere from it, so
// this stage only has to cover the silhouette.

import package::devTools::terrainPickMarker::io::MarkerVSOut;
import package::devTools::terrainPickMarker::io::MAX_SIN_THETA;
import package::devTools::terrainPickMarker::io::QUAD_MARGIN;
import package::devTools::terrainPickMarker::io::TerrainPickMarkerUniforms;

@group(0) @binding(0) var<uniform> uniforms: TerrainPickMarkerUniforms;

@vertex
fn vs(@builtin(vertex_index) vertexIndex: u32) -> MarkerVSOut {
  // Strip order (0,1,2,3) = (-1,-1), (+1,-1), (-1,+1), (+1,+1).
  let cornerX = select(-1.0, 1.0, (vertexIndex & 1u) == 1u);
  let cornerY = select(-1.0, 1.0, vertexIndex >= 2u);
  // Half-extent of the silhouette cone on the plane through the marker centre:
  // sin(theta) = radius / range, so the cone's radius there is r / cos(theta).
  // Every ray that can hit the sphere crosses the quad, which is all the proxy
  // owes the fragment stage.
  let sinTheta = min(uniforms.radiusM / max(length(uniforms.centreRelEyeM), 1.0e-3), MAX_SIN_THETA);
  let extent = uniforms.radiusM * QUAD_MARGIN / sqrt(1.0 - sinTheta * sinTheta);
  let posRelEyeM = uniforms.centreRelEyeM + uniforms.camRight * (cornerX * extent) + uniforms.camUp * (cornerY * extent);

  var out: MarkerVSOut;
  out.clip = uniforms.vp * vec4<f32>(posRelEyeM, 1.0);
  out.rayM = posRelEyeM;
  return out;
}
