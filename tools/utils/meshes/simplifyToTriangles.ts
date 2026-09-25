/**
 * simplifyToTriangles — meshopt-simplify a merged mesh to a target triangle
 * count, folding its UVs in as an attribute so an atlas seam (duplicate
 * vertices at one position, never sharing a triangle across it) doesn't tear:
 * with no attribute weight, position-only decimation can still let the two
 * sides drift apart and the atlas lookup smear at the join. Vertex data is
 * untouched here — only `indices` shrinks; `writeMeshBinary`'s reorder pass
 * already drops whatever a smaller index buffer leaves unreferenced.
 */

import { MeshoptSimplifier } from 'meshoptimizer';

/** Per-UV-channel weight: 1 keeps a [0, 1]-range UV coordinate as significant
 *  to the error metric as the mesh's own physical extent — meshopt's own
 *  recommendation for an attribute that is itself already unit-scaled. */
const UV_ATTRIBUTE_WEIGHT = 1;

/** meshopt's `target_error` is a fraction of the mesh's extent; 1 already
 *  spans it, so the TARGET INDEX COUNT below is what actually bounds the
 *  result, not this. */
const UNBOUNDED_ERROR = 1;

export async function simplifyToTriangles(
  positions: Float32Array,
  uvs: Float32Array,
  indices: Uint32Array,
  targetTriangles: number,
): Promise<{ indices: Uint32Array; triangleCount: number }> {
  await MeshoptSimplifier.ready;
  // The wasm binding asserts target_index_count <= indices.length; a target
  // ABOVE the source (simplification only ever removes triangles) is a caller
  // mistake the tolerance check downstream should report, not a crash here.
  const targetIndexCount = Math.min(targetTriangles * 3, indices.length);
  // LockBorder pins every open-boundary vertex: the crop rim a terrain hole
  // is eroded against (see HOLE_MASK_ERODE_M in buildMeshes.ts) must not pull
  // inward under decimation, or the mesh's own edge drifts past the hole.
  const [simplified] = MeshoptSimplifier.simplifyWithAttributes(
    indices,
    positions,
    3,
    uvs,
    2,
    [UV_ATTRIBUTE_WEIGHT, UV_ATTRIBUTE_WEIGHT],
    null,
    targetIndexCount,
    UNBOUNDED_ERROR,
    ['LockBorder'],
  );
  return { indices: simplified, triangleCount: simplified.length / 3 };
}
