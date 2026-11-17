import type { Vec3 } from '../../../@types/math/Vec3';
import type { SatelliteProfileId } from '../points/@types/SatelliteProfileId';

/** The tunable tint of each satellite group, linear RGB. */
export type SatelliteColors = Readonly<Record<SatelliteProfileId, Vec3>>;
