import type { SceneBody } from '../../scene/SceneBody';
import type { RotationElements } from '../../scene/RotationElements';
import type { BodyPosition } from './BodyPosition';

export type LayerBody = {
  readonly body: SceneBody;
  readonly position: BodyPosition;
  readonly rotation?: RotationElements;
};
