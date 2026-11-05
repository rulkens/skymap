import type { SelectionRef } from '../../@types/engine/SelectionRef';
import { SCENE_EARTH } from '../bodies/sceneEarth';

/**
 * EARTH_REF — the one shared identity for "home". Both the `goHome` saga (when a
 * user asks to fly home) and the bootstrap seed (cold boot lands on the home
 * state) pin the select + focus slots to this exact ref, so there is a single
 * definition of what home selects rather than two hand-built `{ type: 'body',
 * id: 'earth' }` literals drifting apart. It keys the static `SCENE_BODIES`
 * table the same way any body ref does.
 */
export const EARTH_REF = { type: 'body', id: SCENE_EARTH.id } as const satisfies SelectionRef;
