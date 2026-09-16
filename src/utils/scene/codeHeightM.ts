import { HEIGHT_CODE_OFFSET_M, HEIGHT_CODE_STEP_M } from '../../data/scene/heightTileFormat';

/** codeHeightM — Terrain-RGB code to f32 metres. The fround is part of the
 *  format: the bake and both decoders must land on the same float per code. */
export function codeHeightM(code: number): number {
  return Math.fround(HEIGHT_CODE_OFFSET_M + code * HEIGHT_CODE_STEP_M);
}
