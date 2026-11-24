import { SCENE_EARTH } from '../bodies/sceneEarth';
import type { BodyRef } from '../../@types/engine/selection/BodyRef';

/** EARTH_REF — Earth's body ref, the focus of `EARTH_HOME`. */
export const EARTH_REF = { type: 'body', id: SCENE_EARTH.id } as const satisfies BodyRef;
