import type { BodyState } from '../../../src/@types/scene/BodyState';
import type { CelestialBody } from '../../../src/@types/scene/CelestialBody';

/** A fixture body with the pose `seededBodyStates` pins it to. */
export type SeededBody = CelestialBody & Pick<BodyState, 'positionMpc' | 'orientation'>;
