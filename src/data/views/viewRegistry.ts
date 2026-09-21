/**
 * viewRegistry — the palette's four takeover views, assembled. One view per
 * file beside this one: each carries its own settings, pose and copy, and the
 * only thing that lives here is which ids exist. `ViewId` makes the record
 * exhaustive, so a new id fails to compile until its file is written.
 */

import { cosmicFlows } from './cosmicFlows';
import { cosmicWeb } from './cosmicWeb';
import { observableUniverse } from './observableUniverse';
import { solarSystem } from './solarSystem';
import { zoneOfAvoidance } from './zoneOfAvoidance';
import type { View } from '../../@types/views/View';
import type { ViewId } from '../../@types/views/ViewId';

export const viewRegistry: Record<ViewId, View> = {
  cosmicFlows,
  cosmicWeb,
  solarSystem,
  zoneOfAvoidance,
  observableUniverse,
};
