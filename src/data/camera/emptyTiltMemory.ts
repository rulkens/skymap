import type { TiltMemory } from '../../@types/camera/TiltMemory';

/** The engine's boot value; immutable, so one shared object is fine. */
export const EMPTY_TILT_MEMORY: TiltMemory = { hostId: null, rememberedTiltRad: 0 };
