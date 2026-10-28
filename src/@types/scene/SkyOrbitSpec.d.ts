import type { Vec3 } from '../math/Vec3';
import type { OrbitPlaneFrame } from './OrbitPlaneFrame';
import type { PositionedId } from './PositionedId';

/**
 * An orbit as an astrometrist publishes it, against the plane of the sky at its
 * focus: angles in the astrometric sense (Ω a position angle North through East,
 * i against a left-handed North, East, away basis), times in Julian years.
 */
export type SkyOrbitSpec = {
  readonly id: string;
  readonly focusId: PositionedId;
  /** The sky plane at the focus: `planeFrameFromPole(ra, dec)`, normal away from us. */
  readonly plane: OrbitPlaneFrame;
  readonly semiMajorMpc: number;
  readonly eccentricity: number;
  readonly inclinationDeg: number;
  readonly ascendingNodeDeg: number;
  readonly argPeriapsisDeg: number;
  readonly periapsisEpochYr: number;
  readonly periodYr: number;
  /** Dim linear-RGB trail tint. */
  readonly color: Vec3;
};
