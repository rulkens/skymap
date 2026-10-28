import type { BodyRuntime } from '../../@types/BodyRuntime';
import type { SurfaceTileDebugSnapshot } from '../../@types/SurfaceTileDebugSnapshot';

/** The DebugPanel's tile readout: residency from the stream, the rest from the last plan. */
export function surfaceTileDebugSnapshotOf(
  tiles: BodyRuntime['surfaceTiles'],
): SurfaceTileDebugSnapshot {
  const { lastPlan, cut, subCamera } = tiles.plan;
  const plan = lastPlan === null ? null : { ...lastPlan, cutCount: cut.length };
  return { ...tiles.stream.debugStats(), plan, subCamera };
}
