import type { BrickBox } from './BrickBox';

/** The fade (spec §8): `into` and `out` both contain the settled box and meet only in it. A side
 *  with nothing to fade is null: `out` on a first fill, `into` after a far jump. */
export type DetailRegionFade = {
  readonly into: BrickBox | null;
  readonly out: BrickBox | null;
  readonly w: number;
};
