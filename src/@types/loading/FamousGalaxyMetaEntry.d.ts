import type { FamousCalibration } from './FamousCalibration';

/** One famous-galaxy metadata record, indexed by its local position in famous.bin. */
export type FamousGalaxyMetaEntry = {
  id: string;
  names: string[];
  /**
   * Curated human-friendly display name (e.g. `"Andromeda Galaxy"`).
   * Mirrors the optional field on the seed entry.  Absent for most
   * entries — the famous-label producer falls back to `names`/`id`.
   */
  commonName?: string;
  description: string;
  type: string;
  /**
   * Hand-authored placement calibration for this galaxy's thumbnail.
   * Absent for most entries — the render path uses catalog geometry
   * (axisRatio, positionAngleDeg) unchanged when this field is missing.
   */
  calibration?: FamousCalibration;
};
