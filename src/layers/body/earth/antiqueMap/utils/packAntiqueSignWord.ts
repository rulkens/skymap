/**
 * packAntiqueSignWord — a sign's style word (`antiqueEarthMapFormat.ts`): size in
 * quarter units, kind, the level it fades in at and, if set, the one it fades out
 * at. Shared by the bake's hills and the runtime's towns, so both read alike.
 */

import { SIGN_SIZE_SCALE } from '../data/antiqueEarthMapFormat';

export function packAntiqueSignWord(sign: {
  readonly sizeUnits: number;
  readonly kind: number;
  readonly level: number;
  readonly untilLevel?: number;
}): number {
  const size = Math.min(255, Math.max(0, Math.round(sign.sizeUnits * SIGN_SIZE_SCALE)));
  const until = (sign.untilLevel ?? 0) & 15;
  return (size | ((sign.kind & 255) << 8) | ((sign.level & 15) << 16) | (until << 20)) >>> 0;
}
