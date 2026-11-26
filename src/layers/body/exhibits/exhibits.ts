/** The Layer's exhibit rows, read by `layer.ts` and `appExhibits`. */

import { qq8Flyby } from './qq8Flyby/qq8Flyby';
import { solarSystem } from './solarSystem/solarSystem';
import type { Exhibit } from '../../../@types/exhibits/Exhibit';

export const bodyLayerExhibits = [solarSystem, qq8Flyby] as const satisfies readonly Exhibit[];
