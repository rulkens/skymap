/**
 * coreExhibits — core's takeover exhibits. One exhibit per file beside this one: each carries its
 * own settings, pose and copy. `APP_EXHIBIT_REGISTRY` folds these with every Layer's rows.
 */

import { cosmicFlows } from '../../compositions/exhibits/cosmicFlows';
import { cosmicWeb } from '../../compositions/exhibits/cosmicWeb';
import { zoneOfAvoidance } from '../../compositions/exhibits/zoneOfAvoidance';
import type { Exhibit } from '../../@types/exhibits/Exhibit';

export const CORE_EXHIBITS: readonly Exhibit[] = [cosmicFlows, cosmicWeb, zoneOfAvoidance];
