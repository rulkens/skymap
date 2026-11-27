import type { BrickBox } from './BrickBox';

/** The fade (spec §8): `into` and `out` both contain the settled box and meet only in it. A side
 *  with nothing to fade is an empty box. */
export type DetailRegionFade = {
  readonly into: BrickBox;
  readonly out: BrickBox;
  readonly w: number;
};
