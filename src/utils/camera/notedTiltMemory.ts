import type { SceneBodyId } from '../../@types/scene/SceneBodyId';
import type { TiltMemory } from '../../@types/camera/TiltMemory';
import type { PlaceId } from '../../@types/scene/PlaceId';

/** Once per frame with the tilt's host; a DIFFERENT host wipes the tilt (ruling 18), null keeps it. */
export function notedTiltMemory(
  prev: TiltMemory,
  hostId: SceneBodyId | PlaceId | null,
): TiltMemory {
  if (hostId === null || hostId === prev.hostId) return prev;
  const wipe = prev.hostId !== null;
  return { hostId, rememberedTiltRad: wipe ? 0 : prev.rememberedTiltRad };
}
