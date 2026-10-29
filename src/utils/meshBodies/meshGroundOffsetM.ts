import { MESH_ASSETS } from '../../data/bodies/meshAssets.generated';

// The bake decides where a mesh's origin sits relative to its wheels, so the
// lift is READ from the generated table rather than eyeballed — a re-bake that
// moves the origin must move the rover with it, or it sinks or floats.
export function meshGroundOffsetM(meshKey: string): number {
  const asset = MESH_ASSETS[meshKey];
  if (!asset) throw new Error(`meshGroundOffsetM: no MESH_ASSETS entry for meshKey '${meshKey}'`);
  return asset.groundOffsetM;
}
