/**
 * MeshAsset — the runtime decoded shape of a `.mesh` file plus its baked
 * textures. Mirrors `FilamentCloud`'s role for the filament format:
 * de-interleaved SoA typed arrays ready for `device.queue.writeBuffer`.
 */
import type { MeshTextureField } from './MeshTextureField';

export type MeshAsset = {
  readonly boundingRadiusM: number;
  readonly vertexCount: number;
  readonly indexCount: number;
  readonly positions: Float32Array; // vertexCount * 3
  readonly normals: Float32Array; // vertexCount * 3
  readonly tangents: Float32Array; // vertexCount * 4, w = handedness
  readonly uvs: Float32Array; // vertexCount * 2
  readonly indices: Uint32Array; // indexCount
} & { readonly [K in MeshTextureField]: ImageBitmap };
