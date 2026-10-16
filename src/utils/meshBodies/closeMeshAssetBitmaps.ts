import { MESH_TEXTURE_SLOTS } from '../../data/mesh/meshTextureSlots';
import type { MeshAsset } from '../../@types/data/mesh/MeshAsset';

/** Close every decoded bitmap a `MeshAsset` carries; its geometry is GC-managed. */
export function closeMeshAssetBitmaps(asset: MeshAsset): void {
  for (const { field } of MESH_TEXTURE_SLOTS) asset[field].close();
  asset.contactShadow?.close();
}
