import type { FadeIdentity } from '../../animation/FadeIdentity';
import type { SceneBody } from '../../scene/SceneBody';

/** A scene body some show entry's `bodies` lists, with every identity that covers it: the
 * frame admits it while each of them hands a value above 0. */
export type CoveredSceneBody = {
  readonly body: SceneBody;
  readonly coveredBy: readonly FadeIdentity[];
};
