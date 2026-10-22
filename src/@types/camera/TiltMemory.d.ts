import type { SceneBodyId } from '../scene/SceneBodyId';
import type { PlaceId } from '../scene/PlaceId';

/** The remembered tilt (ruling 12) and the host it belongs to — keyed by HOST, never by frame (see `RungRow.step`). */
export type TiltMemory = {
  readonly hostId: SceneBodyId | PlaceId | null;
  /** Radians, un-mapped through the band weight; 0 until a tilt/look drag sets it. */
  readonly rememberedTiltRad: number;
};
