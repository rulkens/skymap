/** The world arm's row — the ladder's floor: nothing to climb to, and no host body its numbers hang off. */
import type { RungRow } from '../../../../@types/camera/RungRow';

export const absoluteRung: RungRow<'absolute'> = {
  kind: 'absolute',
  host: () => null,
  emptyMemory: null,
  /** Identity while the drain still owns the world arm's register; it moves here next. */
  step: (_memory, tilt, framed) => ({ pose: framed.pose, memory: null, tilt }),
};
