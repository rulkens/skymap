import type { BodyId } from '../data/body/BodyId';

/** The remembered tilt (ruling 12) and the host it belongs to — keyed by HOST, never by frame (see `RungRow.step`). */
export type TiltMemory = {
  readonly hostId: BodyId | null;
  /** Radians, un-mapped through the band weight; 0 until a tilt/look drag sets it. */
  readonly rememberedTiltRad: number;
};
