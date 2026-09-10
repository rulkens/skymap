/**
 * EARTH_HOME — the app's `EngineHomeConfig`. `pose`/`seedSelection` stay
 * functions because boot instant, orientation basis, and cinema's URL read
 * exist only once `wireInput` runs. Cinema seeds `focus` only (migrated
 * from `wireInput`) — `select` draws the InfoCard ring, which cinema hides.
 */

import type { EngineHomeConfig } from '../@types/engine/EngineHomeConfig';
import { computeInitialCamera, DEFAULT_FOV_Y_RAD } from '../services/engine/camera/cameraFraming';
import { followedBodyHome } from '../utils/scene/followedBodyHome';
import { EARTH_REF } from '../data/selection/earthRef';
import { isCinemaMode } from '../utils/url/isCinemaMode';

export const EARTH_HOME: EngineHomeConfig = {
  pose: ({ simDays, frameBasis }) =>
    computeInitialCamera({ fovYRad: DEFAULT_FOV_Y_RAD, simDays, frameBasis }),
  focus: followedBodyHome(EARTH_REF),
  seedSelection: () => !isCinemaMode(),
};
