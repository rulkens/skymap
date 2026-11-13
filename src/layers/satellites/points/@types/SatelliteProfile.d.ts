import type { Vec3 } from '../../../../@types/math/Vec3';
import type { SatelliteProfileId } from './SatelliteProfileId';

/** How one group of satellites looks: its tint, how much sunlight it catches, whether it has panels to flash. */
export type SatelliteProfile = {
  readonly id: SatelliteProfileId;
  readonly label: string;
  /** Linear RGB. */
  readonly color: Vec3;
  readonly areaM2: number;
  /** 0 = no panels to flash. */
  readonly glintGain: number;
};
