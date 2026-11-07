/**
 * AntiqueUniformInput — one frame's values for the antique look's uniform record
 * (`shaders/antiqueLook/io.wesl` holds the byte map).
 */

import type { ViewCornerRays } from '../camera/projection/ViewCornerRays';
import type { Size } from './Size';

export type AntiqueUniformInput = {
  /** Target size in device px. */
  readonly size: Size;
  /** Device px per print unit. */
  readonly unitPx: number;
  /** foreground:0 holds this frame's bodies. */
  readonly bodies: boolean;
  /** The overlay row holds this frame's captions. */
  readonly captions: boolean;
  /** The scanned paper tile and stain mask have landed. */
  readonly paper: boolean;
  readonly rays: ViewCornerRays;
  readonly seed: number;
  /** One RA / Dec ruling interval for the whole plate, degrees (`antiqueGraticuleSteps`). */
  readonly rulings: { readonly raDeg: number; readonly decDeg: number };
};
