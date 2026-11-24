/**
 * APP_HOME: the app composition's home, a static fact so the URL table (`hashParamSources.ts`),
 * read by import in several files, can know home without `SagaContext`. `app.ts` reads it too,
 * so the composition and the bare-URL rule cannot name two different homes.
 */

import type { EngineHomeConfig } from '../@types/engine/EngineHomeConfig';
import { EARTH_HOME } from '../data/selection/earthHome';

export const APP_HOME: EngineHomeConfig = EARTH_HOME;
