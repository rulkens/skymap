import type { TraceReadback } from '../../@types/TraceReadback';
import { f16ToFloat } from '../../../../src/utils/math/f16ToFloat';

/**
 * widenTrace — `TraceReadback` → `Float32Array`, feeding `packLogTraceVoxels`
 * (which takes only Float32Array | Float64Array). f32 passes through with no
 * copy; f16 decodes each raw-bits element via the browser-side `f16ToFloat`
 * — NOT `tools/utils/math/f16BitsToFloat` (same decoder, wrong side of the
 * src/tools line; known backlogged duplication).
 */
export function widenTrace(readback: TraceReadback): Float32Array {
  if (readback.data instanceof Float32Array) return readback.data;
  const widened = new Float32Array(readback.data.length);
  for (let i = 0; i < readback.data.length; i++) {
    widened[i] = f16ToFloat(readback.data[i]!);
  }
  return widened;
}
