/**
 * transientPositions — objects a Layer positions per frame without a body-table row, as plain
 * module state, like `trajectoryRegistry`. `deriveBodyStates` places them after every body, and
 * every change bumps `version()` so its memo recomputes on a paused clock. The Layer that sets an
 * entry owns it: it deletes the entry once the object is no longer selected or focused, and each
 * live entry costs a position evaluation per frame.
 */
import type { TransientBodyId } from '../../@types/scene/TransientBodyId';
import type { TransientPositioner } from '../../@types/scene/TransientPositioner';

const positioners = new Map<TransientBodyId, TransientPositioner>();
let version = 0;

export const transientPositions = {
  set: (id: TransientBodyId, positioner: TransientPositioner): void => {
    positioners.set(id, positioner);
    version += 1;
  },
  delete: (id: TransientBodyId): void => {
    if (positioners.delete(id)) version += 1;
  },
  entries: (): IterableIterator<[TransientBodyId, TransientPositioner]> => positioners.entries(),
  version: (): number => version,
};
