import type { GpuContext } from '../../../../../src/@types/rendering/GpuContext';
import type { MeshGpuAsset } from '../../render/renderResources';
import { uploadTexturedMesh } from '../../render/uploadTexturedMesh';
import { readMeshGlb } from '../readMeshGlb';

/**
 * The `mesh` row of `ASSET_LOADERS` — decode `mesh.glb`, decode its embedded
 * atlas, upload both. `image.bytes` views the whole GLB: keeping any of the
 * geometry past the upload would keep the download resident too.
 */
export async function loadTexturedMesh(
  gpu: GpuContext,
  buffer: ArrayBuffer,
): Promise<MeshGpuAsset> {
  const geometry = await readMeshGlb(buffer);
  // The cast, as in `packMeshGlb`: `BlobPart` pins the backing buffer to
  // `ArrayBuffer`, the geometry shape takes TS's default `ArrayBufferLike`.
  const image = await createImageBitmap(
    new Blob([geometry.image.bytes as Uint8Array<ArrayBuffer>], { type: geometry.image.mimeType }),
  );
  return uploadTexturedMesh(gpu, geometry, image);
}
