/**
 * exhibitRegistry — the palette's four takeover exhibits, assembled. One
 * exhibit per file beside this one: each carries its own settings, pose and
 * copy, and the only thing that lives here is which ids exist. `ExhibitId`
 * makes the record exhaustive, so a new id fails to compile until its file is
 * written.
 */

import { cosmicFlows } from './cosmicFlows';
import { cosmicWeb } from './cosmicWeb';
import { observableUniverse } from './observableUniverse';
import { solarSystem } from './solarSystem';
import { zoneOfAvoidance } from './zoneOfAvoidance';
import type { Exhibit } from '../../@types/exhibits/Exhibit';
import type { ExhibitId } from '../../@types/exhibits/ExhibitId';

export const exhibitRegistry: Record<ExhibitId, Exhibit> = {
  cosmicFlows,
  cosmicWeb,
  solarSystem,
  zoneOfAvoidance,
  observableUniverse,
};
