import type { VolumePyramidFormat } from '../../@types/data/volume/VolumePyramidFormat';
import { VOLUME_PYRAMID_DATA_PREFIX } from '../../data/volume/volumePyramidDataPrefix';

/** Level 0's brick archive, shared by the builder and the runtime. Omit `part` for the index. */
export function volumeBrickArchivePath(
  id: string,
  format: VolumePyramidFormat,
  part?: number,
): string {
  const base = `${VOLUME_PYRAMID_DATA_PREFIX}/${id}.${format}.L0`;
  return part === undefined ? `${base}.idx` : `${base}.p${part}.pack`;
}
