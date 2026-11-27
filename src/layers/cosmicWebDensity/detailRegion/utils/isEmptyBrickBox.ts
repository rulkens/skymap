import type { BrickBox } from '../@types/BrickBox';

/** A fade side with nothing in it is an empty box: `hi` at or below `lo` on some axis. */
export function isEmptyBrickBox(box: BrickBox): boolean {
  return box.hi.some((hi, a) => hi <= box.lo[a]!);
}
