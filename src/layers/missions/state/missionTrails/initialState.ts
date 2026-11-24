/**
 * Mission-trails default — OFF; only timeline exhibits turn them on. `nearPlanets` is the
 * Voyager exhibit's alone: everywhere else a trail is the Sun-centred orbit (owner, 2026-11-24).
 */

import type { MissionTrailsSettings } from '../../@types/MissionTrailsSettings';

export const initialState: MissionTrailsSettings = {
  enabled: false,
  nearPlanets: false,
};
