import type { AntiqueLettering } from './AntiqueLettering';

/**
 * How the antique look sets one map name placed by its producer (a town beside
 * its sign, a realm over its ground): its cut, its own size at the label clamp,
 * centred over what it names or set off to the right of a sign, and optionally
 * wider tracking (a great realm's capitals spread across it).
 */
export type AntiquePlaceLettering = {
  readonly cut: AntiqueLettering;
  readonly px: number;
  readonly centred: boolean;
  readonly trackingEm?: number;
};
