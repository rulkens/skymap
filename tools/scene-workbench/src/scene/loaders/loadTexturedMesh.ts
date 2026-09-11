import type { GpuContext } from '../../../../../src/@types/rendering/GpuContext';
import type { MeshGpuAsset } from '../../render/renderResources';
import { uploadTexturedMesh } from '../../render/uploadTexturedMesh';
import { readMeshGlb } from '../readMeshGlb';

/**
 * The `mesh` row of `ASSET_LOADERS` — decode `mesh.glb`, decode its embedded
 * atlas, upload both. `image.bytes` views the whole GLB, so nothing here may
 * outlive the upload: the download stays resident with it.
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
  const asset = uploadTexturedMesh(gpu, geometry, image);
  image.close(); // copyExternalImageToTexture has already taken the pixels
  return asset;
}
