import {
  HEIGHT_CODE_MAX,
  HEIGHT_CODE_OFFSET_M,
  HEIGHT_CODE_STEP_M,
} from '../../data/scene/heightTileFormat';

/** heightCode — metres to the 24-bit Terrain-RGB code; throws rather than clamp,
 *  since a clamped post would silently disagree with the header bounds. */
export function heightCode(heightM: number): number {
  const code = Math.round((heightM - HEIGHT_CODE_OFFSET_M) / HEIGHT_CODE_STEP_M);
  if (!Number.isFinite(code) || code < 0 || code > HEIGHT_CODE_MAX) {
    throw new Error(`heightCode: ${heightM} m is outside the Terrain-RGB range`);
  }
  return code;
}
