import type { SceneBody } from '../../scene/SceneBody';
import type { Vec3 } from '../../math/Vec3';

/** A scene body paired with the position this frame's body snapshot resolves for it. */
export type PositionedSceneBody = {
  readonly body: SceneBody;
  readonly positionMpc: Readonly<Vec3>;
};
