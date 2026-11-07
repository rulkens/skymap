import type { LabelAlignX } from '../../../../@types/rendering/LabelAlignX';

/**
 * Where and how strongly one antique place name shows this frame: its anchor in
 * device px (y down; the text's vertical centre), the side the text runs from it, its
 * size in px and its fade target.
 */
export type AntiqueNamePlacement = {
  readonly xPx: number;
  readonly yPx: number;
  readonly alignX: LabelAlignX;
  readonly px: number;
  readonly alpha: number;
  /** How far up or down it may still move: a sea's or Terra's inside its extent, a crater's
   * beside its rim. */
  readonly slackPx?: number;
};
