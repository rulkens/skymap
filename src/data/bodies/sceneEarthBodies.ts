/**
 * SCENE_EARTH_BODIES — the composed Earth rows as a list: one in the app, none in a composition
 * without the body Layer. Core tables fold over it so they load with no Earth; `SCENE_EARTH`
 * is the one-row projection for code that may assume Earth exists.
 */

import type { EarthBody } from '../../@types/scene/EarthBody';
import { isEarthBody } from '../../utils/scene/isEarthBody';
import { APP_BODY_REGISTRY } from '../../compositions/appBodies';

export const SCENE_EARTH_BODIES: readonly EarthBody[] = APP_BODY_REGISTRY.map(
  (row) => row.body,
).filter(isEarthBody);
