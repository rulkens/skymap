// earthSurfaceTile/vertex.wesl — precision derivation, over budget on that
// basis. Vertex-pulling stage for the instanced surface-tile draw:
// '@builtin(vertex_index)' alone addresses every drawn corner (mesh
// resolution is fixed per frame, so 'tileSlot'/'localVertex' need no prefix
// sum -- see the renderer's module header), reading 'nodeParams[tileSlot]'
// (placement) and 'tileVerts[node.vertexBase + localVertex]' (geometry).
//
// 'node.originRelCamMpc' already folds in Earth's orientation + radius +
// position, minus the camera, composed in f64 CPU-side. Only the per-vertex
// mesh delta (small by construction -- relative to the tile's own origin
// direction) is rotated + scaled HERE in f32, safe because both operands
// are already small. 'u.vp' is a camera-relative view-projection with no
// large translation left to cancel (the 'rebaseViewProj.ts' /
// 'composeBodyMvp.ts' f64-compose-then-narrow-once discipline, applied
// ONCE per frame at the call site, never per tile).
//
// 'NodeParams' carries no separate origin-direction field, only the
// already-world-composed 'originRelCamMpc' -- so the Earth-LOCAL
// (unrotated) direction 'originLocal + delta' 'normalLocal' needs is
// recovered by inverting the SHARED per-frame rotation against the
// vertex's reconstructed distance from Earth's centre: 'transpose(rot) *
// (worldPosRelCam + camPosRelBodyMpc)'. Both operands are Earth-radius
// scale, never AU-scale, so this stays f32-safe -- the same magnitude
// argument that makes 'originRelCamMpc' itself safe to narrow once.
// Forwarded RAW/unnormalized, as earth/vertex.wesl forwards its local
// position; the fragment renormalizes after interpolation.

import package::bodies::earthSurfaceTile::io::VSOut;
import package::bodies::earthSurfaceTile::io::NodeParams;
import package::bodies::earthSurfaceTile::io::TileVertex;
import package::bodies::earthSurfaceTile::io::SurfaceTileUniforms;

@group(0) @binding(0) var<uniform> u: SurfaceTileUniforms;
@group(0) @binding(1) var<storage, read> nodeParams: array<NodeParams>;
@group(0) @binding(2) var<storage, read> tileVerts: array<TileVertex>;

@vertex
fn vs(@builtin(vertex_index) vertexIndex: u32) -> VSOut {
  let tileSlot = vertexIndex / u.vertsPerTile;
  let localVertex = vertexIndex % u.vertsPerTile;
  let node = nodeParams[tileSlot];
  let tv = tileVerts[node.vertexBase + localVertex];

  let deltaWorld = u.radiusMpc
    * (u.rotCol0 * tv.position.x + u.rotCol1 * tv.position.y + u.rotCol2 * tv.position.z);
  let worldPosRelCam = node.originRelCamMpc + deltaWorld;

  var out: VSOut;
  out.clip = u.vp * vec4<f32>(worldPosRelCam, 1.0);
  out.uv = tv.uv;
  // f32-safe ONLY because a tile exists here at all implies the camera is
  // near Earth (the tile subsystem that produces 'nodeParams' only engages
  // at low altitude -- see the renderer's draw() comment). A far camera
  // would make 'camPosRelBodyMpc' AU-scale again, and this sum would
  // collapse toward 'camPosRelBodyMpc' alone -- every drawn tile's normal
  // flattening to the same direction (uniform flat shading, not a crash).
  let toCentreLocal = worldPosRelCam + u.camPosRelBodyMpc;
  out.normalLocal = vec3<f32>(
    dot(u.rotCol0, toCentreLocal),
    dot(u.rotCol1, toCentreLocal),
    dot(u.rotCol2, toCentreLocal),
  );
  out.tangent = tv.tangent;
  out.atlasUvOrigin = node.atlasUvOrigin;
  out.atlasUvScale = node.atlasUvScale;
  return out;
}
