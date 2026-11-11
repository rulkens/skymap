/**
 * milkyWayInverseModelCached — world → Milky Way model space, the inverse of
 * `milkyWayModelCached`, memoised beside it because the placement never
 * changes. The cloud's eye (`milkyWayCamPosModel`) and the field's camera
 * (`deriveFieldView`) both go through this one matrix, so the two frames
 * can't disagree. Returns the SAME `Float32Array` every call; don't mutate it.
 */
import { mat4 } from 'wgpu-matrix';
import { milkyWayModelCached } from './milkyWayModelCached';

let cached: Float32Array | null = null;

export function milkyWayInverseModelCached(): Float32Array {
  cached ??= mat4.inverse(milkyWayModelCached()) as Float32Array;
  return cached;
}
