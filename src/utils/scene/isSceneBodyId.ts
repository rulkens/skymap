/**
 * isSceneBodyId — is `s` the id of a body in `SCENE_BODIES`? The guard for a
 * raw string crossing into scene code (an action payload, a focus id, a UI
 * field), so a typo is rejected where it enters rather than at a Map lookup.
 */

import { SCENE_BODIES } from '../../data/bodies/sceneBodies';
import type { SceneBodyId } from '../../@types/scene/SceneBodyId';

const SCENE_BODY_IDS: ReadonlySet<string> = new Set(SCENE_BODIES.map((body) => body.id));

export function isSceneBodyId(s: string): s is SceneBodyId {
  return SCENE_BODY_IDS.has(s);
}
