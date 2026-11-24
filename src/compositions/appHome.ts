/**
 * APP_HOME: the app composition's home, a static fact so the URL table (`hashParamSources.ts`),
 * read by import in several files, can know home without `SagaContext`. `app.ts` reads it too,
 * so the composition and the bare-URL rule cannot name two different homes. Pure data:
 * `navigateSaga`'s home arm applies the cinema gate.
 */

import type { EngineHomeConfig } from '../@types/engine/EngineHomeConfig';
import { followedBodyHome } from '../utils/scene/followedBodyHome';
import { EARTH_REF } from '../data/selection/earthRef';

export const APP_HOME: EngineHomeConfig = {
  focus: followedBodyHome(EARTH_REF),
  seedSelection: true,
};
