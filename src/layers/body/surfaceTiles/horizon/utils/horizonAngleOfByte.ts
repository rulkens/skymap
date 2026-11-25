import { HORIZON_ANGLE_MAP } from '../data/horizonAngleMap';

const { minDeg, kneeDeg, kneeByte, maxDeg } = HORIZON_ANGLE_MAP;

/** horizonAngleOfByte — a stored horizon byte back to degrees; the TS twin of
 *  `horizonAngleOfUnorm` in `lib/horizonAngleMap.wesl`. */
export function horizonAngleOfByte(byte: number): number {
  return byte <= kneeByte
    ? minDeg + (byte / kneeByte) * (kneeDeg - minDeg)
    : kneeDeg + ((byte - kneeByte) / (255 - kneeByte)) * (maxDeg - kneeDeg);
}
