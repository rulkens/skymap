import { HORIZON_ANGLE_MAP } from '../data/horizonAngleMap';

const { minDeg, kneeDeg, kneeByte, maxDeg } = HORIZON_ANGLE_MAP;

/** horizonByteOfAngle — a horizon elevation in degrees to its stored byte, clamped to
 *  the map's range and rounded to the nearest step. Inverse: `horizonAngleOfByte`. */
export function horizonByteOfAngle(deg: number): number {
  const d = Math.min(Math.max(deg, minDeg), maxDeg);
  const byte =
    d <= kneeDeg
      ? ((d - minDeg) / (kneeDeg - minDeg)) * kneeByte
      : kneeByte + ((d - kneeDeg) / (maxDeg - kneeDeg)) * (255 - kneeByte);
  return Math.round(byte);
}
