/**
 * coreExhibits — core's takeover exhibits. One exhibit per file beside this one: each carries its
 * own settings, pose and copy. `APP_EXHIBITS` folds these with every Layer's rows.
 */

import { cosmicFlows } from './cosmicFlows';
import { cosmicWeb } from './cosmicWeb';
import { observableUniverse } from './observableUniverse';
import { zoneOfAvoidance } from './zoneOfAvoidance';
import type { Exhibit } from '../../@types/exhibits/Exhibit';

export const CORE_EXHIBITS: readonly Exhibit[] = [
  cosmicFlows,
  cosmicWeb,
  zoneOfAvoidance,
  observableUniverse,
];
