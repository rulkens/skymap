import type { SceneBodyId } from '../../@types/scene/SceneBodyId';
import { asSceneBodyId } from '../../utils/scene/asSceneBodyId';

/** The terrain hosts a person can stand on (R4): the bodies whose ground streams as height tiles. */
export const SKY_HOSTS: ReadonlySet<SceneBodyId> = new Set([
  asSceneBodyId('earth'),
  asSceneBodyId('mars'),
]);
