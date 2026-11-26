import type { SceneBody } from '../../scene/SceneBody';
import type { RotationElements } from '../../scene/RotationElements';
import type { ShapeModel } from '../../scene/ShapeModel';
import type { BodyPosition } from './BodyPosition';

export type LayerBody = {
  readonly body: SceneBody;
  readonly position: BodyPosition;
  readonly rotation?: RotationElements;
  /** Set when a celestial body is drawn from a mission shape model instead of a sphere.
   *  A `MeshBody` row never sets it: its body already names the mesh. */
  readonly shapeModel?: ShapeModel;
};
