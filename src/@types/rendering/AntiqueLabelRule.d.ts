/**
 * How the antique look names one label producer's labels (`ANTIQUE_LABEL_RULES`,
 * keyed by the producer's `label` entry). A c.1690 plate knows a handful of
 * objects per category, so a category either keeps what the table does not
 * name (stars, constellations) or hides it (galaxies, structures, moons).
 */

import type { AntiqueLettering } from './AntiqueLettering';

export type AntiqueLabelRule = {
  /** What a label whose id `names` does not list does: keep its own text, or hide. */
  readonly unlisted: 'keep' | 'hide';
  /** The cut the producer's labels take. */
  readonly lettering: AntiqueLettering;
  /** Label id → a different cut, where a producer mixes tiers (planets among moons). */
  readonly letteringOf?: Readonly<Record<string, AntiqueLettering>>;
  /** Label id → its period name, or null to hide it. */
  readonly names: Readonly<Record<string, string | null>>;
  /** The producer's caption priority under the look, replacing its own (`CAPTION_PRIORITY_SCALE` bands). */
  readonly priority?: number;
  /** Label ids named only in the cosmos regime, past `ANTIQUE_REGIME_MPC[1]` (`label2DDirector`). */
  readonly cosmosOnly?: readonly string[];
};
