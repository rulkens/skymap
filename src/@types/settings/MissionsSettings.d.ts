/**
 * MissionsSettings — the sampled craft. A timeline exhibit seeds `speed` at 1× and the takeover
 * bracket restores it on exit.
 */

import type { MissionCraftSettings } from './MissionCraftSettings';

export type MissionsSettings = {
  /** A `SAMPLED_BODIES` id whose mission trail and caption stay full strength while the other
   *  sampled craft dim; null = no emphasis. */
  readonly craft: string | null;
  /** The `MISSION_SPEEDS` factor the mission clock plays at; snapshots carry it, the URL does not. */
  speed: number;
  /** One row per `SAMPLED_BODY_IDS` craft, complete: a write never creates a row. */
  readonly items: Readonly<Record<string, MissionCraftSettings>>;
};
