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
  /** Greyscale ground-contact mask, fetched only when the row has a
   *  `contactDecal`; not a `MESH_TEXTURE_SLOTS` entry — the mesh shader never
   *  binds it, only the separate contact-shadows pass does. */
  readonly contactShadow?: ImageBitmap;
  /** R8 terrain-hole mask over the row's `hole` rect (row 0 = north, 255 =
   *  cut), fetched only when the row has one; the surface-tile pass binds it. */
  readonly holeMask?: ImageBitmap;
} & { readonly [K in MeshTextureField]: ImageBitmap };
