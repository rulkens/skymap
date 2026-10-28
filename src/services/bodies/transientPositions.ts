/**
 * transientPositions — objects a Layer positions per frame without a body-table row, as plain
 * module state, like `trajectoryRegistry`. `deriveBodyStates` places them after every body, and
 * every change bumps `version()` so its memo recomputes on a paused clock. Bounded: the oldest
 * entry goes first, so a Layer registering each object it is asked about cannot grow it forever.
 */
import type { TransientBodyId } from '../../@types/scene/TransientBodyId';
import type { TransientPositioner } from '../../@types/scene/TransientPositioner';

const MAX_ENTRIES = 16;
const positioners = new Map<TransientBodyId, TransientPositioner>();
let version = 0;

export const transientPositions = {
  set: (id: TransientBodyId, positioner: TransientPositioner): void => {
    positioners.delete(id);
    positioners.set(id, positioner);
    if (positioners.size > MAX_ENTRIES) positioners.delete(positioners.keys().next().value!);
    version += 1;
  },
  delete: (id: TransientBodyId): void => {
    if (positioners.delete(id)) version += 1;
  },
  entries: (): IterableIterator<[TransientBodyId, TransientPositioner]> => positioners.entries(),
  version: (): number => version,
};
