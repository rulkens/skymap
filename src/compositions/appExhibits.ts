/**
 * The exhibits this app composes in: core's rows, then each Layer's, keyed by id. Imported from
 * each Layer's own `exhibits/exhibits.ts` rather than off `APP_COMPOSITION`, whose `layer.ts`
 * rows would pull renderers into every reader and reopen the module-init cycle.
 */

import { CORE_EXHIBITS } from '../data/exhibits/coreExhibits';
import { missionsLayerExhibits } from '../layers/missions/exhibits/exhibits';
import { exhibitsById } from '../utils/exhibits/exhibitsById';

export const APP_EXHIBITS = exhibitsById([...CORE_EXHIBITS, ...missionsLayerExhibits]);
