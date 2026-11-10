import type { ClaimTimestampWrites } from '../../../../@types/gpu/timing/ClaimTimestampWrites';
import type { FieldFramePlan } from '../@types/FieldFramePlan';
import type { FieldTargetId } from '../@types/FieldTargetId';

/**
 * One compute timing slot bracketing every pass the plan encodes: the first
 * pass to ask writes the begin tick, `plan.encodes.at(-1)` the end tick, a
 * single-pass plan both. The claim is lazy and made once, at the first ask,
 * since claiming marks the slot live (`ClaimTimestampWrites`). The compute
 * and render descriptors are structurally one shape, so no cast is needed.
 */
export function spanTimestampWrites(
  claim: ClaimTimestampWrites,
  plan: FieldFramePlan,
): (id: FieldTargetId) => GPURenderPassTimestampWrites | undefined {
  const last = plan.encodes.at(-1);
  let claimed: GPUComputePassTimestampWrites | undefined | null = null;
  return (id) => {
    const first = claimed === null;
    if (claimed === null) claimed = claim().timestampWrites;
    if (claimed === undefined) return undefined;
    const isLast = id === last;
    if (!first && !isLast) return undefined;
    return {
      querySet: claimed.querySet,
      ...(first ? { beginningOfPassWriteIndex: claimed.beginningOfPassWriteIndex } : {}),
      ...(isLast ? { endOfPassWriteIndex: claimed.endOfPassWriteIndex } : {}),
    };
  };
}
