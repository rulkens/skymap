import {
  GRS_L2_DRIFT_DEG_PER_DAY,
  GRS_L2_REF_DEG,
  GRS_L2_REF_JD,
} from '../../data/bodies/jupiterGrsLongitude';

/** The Great Red Spot's System II longitude on `jd`, degrees west in [0, 360). */
export function grsSystemIILongitudeDeg(jd: number): number {
  const l2 = GRS_L2_REF_DEG + GRS_L2_DRIFT_DEG_PER_DAY * (jd - GRS_L2_REF_JD);
  return ((l2 % 360) + 360) % 360;
}
