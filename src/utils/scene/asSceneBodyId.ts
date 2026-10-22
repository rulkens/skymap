/**
 * asSceneBodyId — stamps an authored id as a `SceneBodyId`. Only row makers and
 * the static body tables call it: an id read from a URL, an action or a UI
 * field goes through `isSceneBodyId` instead, which checks before it narrows.
 */

import type { SceneBodyId } from '../../@types/scene/SceneBodyId';

export function asSceneBodyId(id: string): SceneBodyId {
  return id as SceneBodyId;
}
