/**
 * buildSegmentInstances — the CPU-side packing step of the filament
 * renderer: a `FilamentCloud` (strip-of-polyline storage, as decoded
 * from `filaments.bin`) flattened into the per-instance vertex array
 * the instanced-quad line pipeline draws.
 *
 * ### Why its own unit
 *
 * The strip → segment expansion is pure arithmetic over typed arrays —
 * no device, no pipeline, no GPU state.  Keeping it beside the renderer
 * rather than inside it means the layout contract (8 floats per segment,
 * one instance per consecutive vertex pair, strips never bridged) can be
 * exercised directly, without standing up a mock GPUDevice just to reach
 * the arithmetic.  `filamentRenderer` is the only consumer; the two live
 * in the same folder because they are one renderer's concern, split by
 * what needs a GPU and what does not.
 *
 * ### The strip contract
 *
 * A cloud stores N polyline strips back-to-back in one vertex array,
 * with `stripOffsets[s] .. stripOffsets[s+1]` delimiting strip `s`.
 * Segments exist only *within* a strip — the last vertex of strip `s`
 * must never pair with the first of `s + 1`, which is why the inner loop
 * stops at `hi - 1` rather than walking the array linearly.  That also
 * gives the segment count in closed form: summing `(verts - 1)` over
 * strips is `totalVerts - stripCount`.
 */

import type { FilamentCloud } from '../../../../@types/data/filament/FilamentCloud';

/**
 * 8 floats per segment instance: startxyz + startDensity + endxyz + endDensity.
 *
 * Exported because the packer and the pipeline's `arrayStride` are two halves
 * of one contract — the renderer declares a vertex-buffer stride of
 * `FLOATS_PER_SEGMENT * 4` bytes against the array this module packs.  A second
 * copy of the literal in the renderer could drift out of step with the writes
 * here and would only surface as garbled geometry at draw time.
 */
export const FLOATS_PER_SEGMENT = 8;

/**
 * Build a flat per-segment instance array from a `FilamentCloud`.  One
 * instance per consecutive (v_i, v_{i+1}) pair within each strip.
 */
export function buildSegmentInstances(cloud: FilamentCloud): {
  segmentCount: number;
  data: Float32Array;
} {
  // Total segment count = sum over strips of (verts - 1) = totalVerts - stripCount.
  const segmentCount = cloud.vertexCount - cloud.stripCount;
  if (segmentCount <= 0) {
    return { segmentCount: 0, data: new Float32Array(0) };
  }
  const data = new Float32Array(segmentCount * FLOATS_PER_SEGMENT);

  let outIdx = 0;
  for (let s = 0; s < cloud.stripCount; s++) {
    const lo = cloud.stripOffsets[s]!;
    const hi = cloud.stripOffsets[s + 1]!;
    for (let v = lo; v < hi - 1; v++) {
      const a = v * 4;
      const b = (v + 1) * 4;
      data[outIdx + 0] = cloud.vertices[a + 0]!;
      data[outIdx + 1] = cloud.vertices[a + 1]!;
      data[outIdx + 2] = cloud.vertices[a + 2]!;
      data[outIdx + 3] = cloud.vertices[a + 3]!;
      data[outIdx + 4] = cloud.vertices[b + 0]!;
      data[outIdx + 5] = cloud.vertices[b + 1]!;
      data[outIdx + 6] = cloud.vertices[b + 2]!;
      data[outIdx + 7] = cloud.vertices[b + 3]!;
      outIdx += FLOATS_PER_SEGMENT;
    }
  }
  return { segmentCount, data };
}
