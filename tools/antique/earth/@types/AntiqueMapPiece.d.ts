import type { BakedFill } from './BakedFill';
import type { BakedStrip } from './BakedStrip';
import type { BakedSign } from './BakedSign';

/** What one source of the antique Earth map (realms, rivers, molehills, towns)
 * contributes; `buildAntiqueEarth` concatenates the pieces in source order, so
 * each source's signs keep their own painter order and later sources paint over. */
export type AntiqueMapPiece = {
  readonly fill?: BakedFill;
  readonly strips?: readonly BakedStrip[];
  readonly signs?: readonly BakedSign[];
};
