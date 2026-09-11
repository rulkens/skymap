/**
 * meshVertexSlots — the mesh-body vertex layout: one buffer slot per
 * de-interleaved attribute array, in `@location` order.
 *
 * `decodeMesh` splits the file's 48-byte interleaved stride into the SoA arrays
 * of `MeshAsset`. The renderer's pipeline descriptor and its upload path both
 * read this table, so they cannot disagree about a stride, a location or a
 * format.
 */

import type { MeshAsset } from '../../@types/data/mesh/MeshAsset';

export const MESH_VERTEX_SLOTS = [
  { field: 'positions', bytes: 12, format: 'float32x3' },
  { field: 'normals', bytes: 12, format: 'float32x3' },
  { field: 'tangents', bytes: 16, format: 'float32x4' }, // w = handedness
  { field: 'uvs', bytes: 8, format: 'float32x2' },
] as const satisfies readonly {
  field: keyof MeshAsset;
  bytes: number;
  format: GPUVertexFormat;
}[];
