/** The Layer's exhibit rows, read by `layer.ts` and `appExhibits`. */

import { solarSystem } from './solarSystem/solarSystem';
import type { Exhibit } from '../../../@types/exhibits/Exhibit';

export const bodyLayerExhibits: readonly Exhibit[] = [solarSystem];
