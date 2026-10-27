import type { SceneBodyId } from '../scene/SceneBodyId';
import type { CameraDofRow } from './CameraDofRow';

/** The orientation pipeline as three comparable DOF rows, plus the band context they are measured in. */
export type CameraDofAngles = {
  /** The engaged body when the stored frame is a body arm, else the roster nearest. */
  readonly bodyId: SceneBodyId | null;
  readonly hOverR: number | null;
  readonly heading: CameraDofRow;
  readonly tilt: CameraDofRow;
  readonly roll: CameraDofRow;
};
