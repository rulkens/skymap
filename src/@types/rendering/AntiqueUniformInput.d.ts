/**
 * AntiqueUniformInput — one frame's values for the antique look's uniform record
 * (`shaders/antiqueLook/io.wesl` holds the byte map).
 */

import type { ViewCornerRays } from '../camera/projection/ViewCornerRays';
import type { AntiqueRulings } from './AntiqueRulings';
import type { Size } from './Size';

export type AntiqueUniformInput = {
  /** Target size in device px. */
  readonly size: Size;
  /** Device px per print unit. */
  readonly unitPx: number;
  /** foreground:0 holds this frame's bodies. */
  readonly bodies: boolean;
  /** Body coverage is read off foreground:0's depth, not its alpha: the eye is
   * inside an atmosphere, whose day sky fills that row's alpha (`cover.wesl`). */
  readonly depthCover: boolean;
  /** The overlay row holds this frame's captions. */
  readonly captions: boolean;
  /** The scanned paper tile and stain mask have landed. */
  readonly paper: boolean;
  readonly rays: ViewCornerRays;
  readonly seed: number;
  /** One RA / Dec ruling interval for the whole plate, degrees (`antiqueGraticuleSteps`). */
  readonly rulings: AntiqueRulings;
  /** Body hatch direction, screen radians (`terminatorHatchAngle`). */
  readonly hatchAngle: number;
  /** How far the cosmic web is charted, 0..1: the cosmos regime, and 0 with no density drawn. */
  readonly web: number;
};
