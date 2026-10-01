/**
 * simplifyToTriangles — meshopt-simplify a merged mesh to a target triangle
 * count, folding its UVs in as an attribute so an atlas seam (duplicate
 * vertices at one position, never sharing a triangle across it) doesn't tear:
 * with no attribute weight, position-only decimation can still let the two
 * sides drift apart and the atlas lookup smear at the join.
 */

import { MeshoptSimplifier } from 'meshoptimizer';

/** meshopt's own recommendation: weight a unit-scaled [0, 1] UV as significant
 *  as the mesh's own physical extent. */
const UV_ATTRIBUTE_WEIGHT = 1;

/** 1 already spans the mesh's extent, so TARGET INDEX COUNT below is what
 *  actually bounds the result. */
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
  // LockBorder pins every open-boundary vertex: a crop's cut edge must not
  // pull inward under decimation, or the mesh's own silhouette shrinks.
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
