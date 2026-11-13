import type { TransientBodyId } from '../../../../@types/scene/TransientBodyId';

/** asteroidTransientId — the `poseId` a followed asteroid is placed and posed under. */
export function asteroidTransientId(number: number): TransientBodyId {
  return `transient:asteroid-${number}`;
}
