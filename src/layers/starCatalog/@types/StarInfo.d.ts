/**
 * StarInfo — a selected star as its card's target, the one shape every star
 * reaches, survey or seeded; the star kind's `toFocusable` derives it from the
 * stored row, which carries the famous-star sidecar.
 */

import type { StarCatalogSourceType } from './StarCatalogSourceType';
import type { StarInfoDetail } from './StarInfoDetail';

export type StarInfo = {
  /** Union tag — what every card-target lookup keys on. */
  readonly type: 'starCatalog';
  readonly source: StarCatalogSourceType;
  /** Seed-table index, or the bin-stable record index for a survey star. */
  readonly index: number;
  /** Durable seed id; null for a survey star, which has none. */
  readonly id: string | null;
  /** Headline shown in the InfoCard: the seed label, or 'Field star'. */
  readonly displayName: string;
  /** Heliocentric world position (Mpc), for camera framing. */
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Distance from the Sun in parsecs (length of positionMpc, Mpc → pc). */
  readonly distancePc: number;
  readonly detail: StarInfoDetail;
};
