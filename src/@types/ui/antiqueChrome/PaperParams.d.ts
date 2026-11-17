import type { HexString } from '../../math/HexString';

/**
 * PaperParams — laid paper, in CSS px. Rag fibre is fine noise (`grain`), toning is
 * slow mottle (`mottle`), each swinging the paper up to its strength toward `tone`
 * (the paper's brown) or away from it; the mould's wires print as faint `tone` lines,
 * close `wirePitch` across and sparse `chainPitch` along. `size` is the tile. Read by
 * `paperTileSvg`; the tablets and cartouches take its grain.
 */
export type PaperParams = {
  readonly size: number;
  readonly tone: HexString;
  readonly grain: number;
  readonly grainStrength: number;
  readonly mottle: number;
  readonly mottleStrength: number;
  readonly wirePitch: number;
  readonly wireAlpha: number;
  readonly chainPitch: number;
  readonly chainAlpha: number;
};
