/** The Layer's exhibit rows, read by `layer.ts` and `appExhibits`. */

import { observableUniverse } from './observableUniverse/observableUniverse';
import type { Exhibit } from '../../../@types/exhibits/Exhibit';

export const cosmicHorizonLayerExhibits = [
  observableUniverse,
] as const satisfies readonly Exhibit[];
