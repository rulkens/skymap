/**
 * One name the antique look engraves across the Milky Way seen from outside
 * (`ANTIQUE_MILKY_WAY_NAMES`), centred on a point of the generated disc: on a
 * spiral arm's ridge, so the name lands on the arm the cloud draws, or at a
 * fixed polar place for what the arm model does not carry (spur, bar, bulge, Sun).
 */

import type { AntiqueLettering } from './AntiqueLettering';
import type { LabelAlignY } from './LabelAlignY';

export type AntiqueMilkyWayName = {
  /** Label id, unique across every producer. */
  readonly id: string;
  /** Period Latin, as engraved (capitals take V for U themselves). */
  readonly name: string;
  readonly cut: AntiqueLettering;
  /** Where the name sits on its anchor; centred unless it must clear a name already there. */
  readonly alignY?: LabelAlignY;
  readonly at:
    | {
        /** Index into the generator's arm table (`describeGalaxy`'s `arms`). */
        readonly arm: number;
        readonly radiusKpc: number;
      }
    | {
        /** Galactocentric azimuth in the generator's disc frame: 0 toward +x, 180 at the Sun. */
        readonly azimuthDeg: number;
        readonly radiusKpc: number;
      };
};
