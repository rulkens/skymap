/** The world arm's row — the ladder's floor: nothing to climb to, and no host body its numbers hang off. */
import type { RungRow } from '../../../../@types/camera/RungRow';

export const absoluteRung: RungRow<'absolute'> = {
  kind: 'absolute',
  host: () => null,
};
