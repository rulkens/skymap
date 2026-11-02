import type { TransientBodyId } from '../../../@types/scene/TransientBodyId';

/** satelliteTransientId — the `poseId` a followed satellite is placed and posed under. */
export function satelliteTransientId(noradId: number): TransientBodyId {
  return `transient:satellite-${noradId}`;
}
