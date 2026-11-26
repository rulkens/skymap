import type { VolumePyramidFormat } from '../../@types/data/volume/VolumePyramidFormat';
import { VOLUME_PYRAMID_DATA_PREFIX } from '../../data/volume/volumePyramidDataPrefix';

/** The sidecar is `${VOLUME_PYRAMID_DATA_PREFIX}/${id}.json`. */
export function volumePyramidLevelPath(
  id: string,
  format: VolumePyramidFormat,
  level: 1 | 2 | 3,
): string {
  return `${VOLUME_PYRAMID_DATA_PREFIX}/${id}.${format}.L${level}.bin`;
}
