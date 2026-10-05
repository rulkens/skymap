/**
 * StarInfo — a selected star as a resolved focusable target, the one arm of
 * `FocusableTarget` every star reaches, survey or seeded; `buildFocusable`
 * derives it from the stored `SelectionRow` plus the famous-star sidecar.
 * Core, not the star Layer's `@types/`: core's `FocusableTarget`/`refOf`
 * name and produce it, so shelving it under `layers/` would import a Layer.
 */

import type { StarCatalogSourceType } from '../data/starCatalog/StarCatalogSourceType';
import type { StarInfoDetail } from './StarInfoDetail';

export type StarInfo = {
  /** Union tag — what every FocusableTarget table / guard keys on. */
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
