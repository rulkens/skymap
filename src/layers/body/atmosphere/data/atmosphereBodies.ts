/** ATMOSPHERE_BODIES — the scene bodies with an `ATMOSPHERE_PARAMS` row: the only ones that can draw an atmosphere. */

import type { EarthBody } from '../../../../@types/scene/EarthBody';
import type { PlanetBody } from '../../../../@types/scene/PlanetBody';
import { SCENE_EARTH } from '../../../../data/bodies/sceneEarth';
import { SCENE_PLANETS } from '../../../../data/bodies/scenePlanets';
import { ATMOSPHERE_PARAMS } from './atmosphereParams';

export const ATMOSPHERE_BODIES: readonly (EarthBody | PlanetBody)[] = [
  SCENE_EARTH,
  ...SCENE_PLANETS,
].filter((body) => ATMOSPHERE_PARAMS[body.id] !== undefined);
