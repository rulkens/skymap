import type { BodyId } from '../data/body/BodyId';

/** The remembered tilt (ruling 12) and the host it belongs to. NOT the body arm's:
 *  the WORLD arm reads it, so keying it by the pose frame would wipe it on disengage. */
export type TiltMemory = {
  readonly hostId: BodyId | null;
  /** Radians, un-mapped through the band weight; 0 until a tilt/look drag sets it. */
  readonly rememberedTiltRad: number;
};
