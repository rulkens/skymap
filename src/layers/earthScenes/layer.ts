/**
 * The earthScenes Layer: a bodies-only Layer. It declares the Earth scene
 * rows; core still draws them.
 */

import { defineLayer } from '../../services/engine/layer/defineLayer';
import { EARTH_SCENES_BODY_ROWS } from './bodies/earthScenesBodyRows';

export const earthScenesLayer = defineLayer({
  name: 'earthScenes',
  bodies: EARTH_SCENES_BODY_ROWS,
  create: () => undefined,
  destroy: () => {},
  passes: () => [],
});
