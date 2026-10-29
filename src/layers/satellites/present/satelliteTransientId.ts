import type { TransientBodyId } from '../../../@types/scene/TransientBodyId';

/** satelliteTransientId — the `transientPositions` key a followed satellite is posed from. */
export function satelliteTransientId(noradId: number): TransientBodyId {
  return `transient:satellite-${noradId}`;
}
