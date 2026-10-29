import type { TiltMemory } from '../../@types/camera/TiltMemory';
import type { PositionedId } from '../../@types/scene/PositionedId';

/** Once per frame with the tilt's host; a DIFFERENT host wipes the tilt (ruling 18), null keeps it. */
export function notedTiltMemory(prev: TiltMemory, hostId: PositionedId | null): TiltMemory {
  if (hostId === null || hostId === prev.hostId) return prev;
  const wipe = prev.hostId !== null;
  return { hostId, rememberedTiltRad: wipe ? 0 : prev.rememberedTiltRad };
}
