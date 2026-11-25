/** MissionsSettings — the craft captions' switch. */

import type { MissionCraftSettings } from './MissionCraftSettings';

export type MissionsSettings = {
  /** One row per item of the `missions` label entry (the one `craft` item), complete: a write
   *  never creates a row. */
  readonly items: Readonly<Record<string, MissionCraftSettings>>;
};
