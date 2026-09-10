/** EARTH_HOME — the app's `EngineHomeConfig`, pure data (`wireInput` applies the cinema gate). */

import type { EngineHomeConfig } from '../../@types/engine/EngineHomeConfig';
import { followedBodyHome } from '../../utils/scene/followedBodyHome';
import { EARTH_REF } from './earthRef';

export const EARTH_HOME: EngineHomeConfig = {
  focus: followedBodyHome(EARTH_REF),
  seedSelection: true,
};
