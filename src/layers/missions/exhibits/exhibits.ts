/** The Layer's exhibit rows, read by `layer.ts` and `appExhibits`. */

import { voyagerMissions } from './voyagerMissions/voyagerMissions';
import type { Exhibit } from '../../../@types/exhibits/Exhibit';

export const missionsLayerExhibits: readonly Exhibit[] = [voyagerMissions];
