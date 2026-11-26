import type { VolumePyramidFormatRow } from '../../@types/data/volume/VolumePyramidFormatRow';
import { VOLUME_PYRAMID_FORMATS } from '../../data/volume/volumePyramidFormats';

export function pickVolumePyramidFormat(features: ReadonlySet<string>): VolumePyramidFormatRow {
  const row = VOLUME_PYRAMID_FORMATS.find((r) => r.features.every((f) => features.has(f)));
  if (!row) throw new Error('pickVolumePyramidFormat: no format row accepts this device');
  return row;
}
