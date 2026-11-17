import type { AntiqueLettering } from './AntiqueLettering';

/**
 * How the antique look sets one map name placed by its producer (a town beside
 * its sign, a realm over its ground, a crater beside its rim): its cut, its own
 * size at the label clamp (unless its producer clamps it), centred over what it
 * names or aligned as its producer set it, and optionally wider tracking (a great
 * realm's capitals spread across it).
 */
export type AntiquePlaceLettering = {
  readonly cut: AntiqueLettering;
  readonly px: number;
  readonly centred: boolean;
  readonly trackingEm?: number;
};
