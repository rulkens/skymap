/**
 * AntiqueUniformInput — one frame's values for the antique look's uniform record
 * (`shaders/antiqueLook/io.wesl` holds the byte map).
 */

import type { ViewProjection } from '../camera/projection/ViewProjection';
import type { AntiquePlateRulings } from './AntiquePlateRulings';
import type { AntiquePlateTune } from './AntiquePlateTune';
import type { Vec3 } from '../math/Vec3';

export type AntiqueUniformInput = {
  /** The output's projection: the target size, and the corner rays `fragment.wesl`'s `viewRay` reads. */
  readonly projection: ViewProjection;
  /** Device px per print unit. */
  readonly unitPx: number;
  /** Body coverage is read off foreground:0's depth, not its alpha: the eye is
   * inside an atmosphere, whose day sky fills that row's alpha (`mask.wesl`). */
  readonly depthCover: boolean;
  /** The relief row holds engraved ground: its body's print code (`antiqueReliefInput`),
   * or null. */
  readonly relief: number | null;
  /** The Moon's own row was drawn this frame and copied into the plate's `moon` layer. */
  readonly moon: boolean;
  /** The overlay row holds this frame's captions. */
  readonly captions: boolean;
  /** The scanned paper tile and stain mask have landed. */
  readonly paper: boolean;
  readonly seed: number;
  /** The plate's ruling frames (`antiquePlateRulings`). */
  readonly rulings: AntiquePlateRulings;
  /** Body hatch direction, screen radians (`terminatorHatchAngle`). */
  readonly hatchAngle: number;
  /** How far the cosmic web is charted, 0..1: the cosmos regime, and 0 with no density drawn. */
  readonly web: number;
  /** The eye, world Mpc: where `web.wesl` finds the Zone of Avoidance's dust wedge. */
  readonly eye: Readonly<Vec3>;
  /** The debug panel's knobs (`antiquePlateTune`). */
  readonly tune: AntiquePlateTune;
  /** How far the Moon is the plate's subject, 0..1 (`antiqueMoonSubject`): the chart's
   * rulings, border keys, numerals, trails and figures fade by it. */
  readonly subject: number;
};
