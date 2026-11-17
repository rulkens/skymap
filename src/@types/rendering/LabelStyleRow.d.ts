import type { FontId } from '../data/FontId';
import type { Vec4 } from '../math/Vec4';

/** One row of `LABEL_STYLES`: how every label of a kind looks and where it sits. */
export type LabelStyleRow = {
  readonly font: FontId;
  /** Straight RGBA. */
  readonly color: Vec4;
  readonly outline: { readonly color: Vec4; readonly emFrac: number };
  /** The em height in world Mpc, fixed or a multiple of the subject's radius; its screen size is
   *  then clamped to `LABEL_TEXT_PX`. */
  readonly textHeight: { readonly mpc: number } | { readonly timesRadius: number };
  /** Fades in over the subject's apparent diameter, px, unless the subject is hovered or selected. */
  readonly appear?: { readonly fromPx: number; readonly bandPx: number };
  readonly placement: 'centre' | 'above';
  /** For 'above': the text sits `radii` subject angular radii above the subject's centre, and at
   *  least `minPx` up. Today's rule is 1.5 diameters and 28 px, so captions use { radii: 3, minPx: 28 }. */
  readonly lift?: { readonly radii: number; readonly minPx: number };
  /** A line from the subject's rim (plus `gapPx`) or its centre to just under the text. */
  readonly leader?: {
    readonly from: 'rim' | 'centre';
    readonly gapPx: number;
    readonly widthPx: number;
    /** Absent = the label's own colour. */
    readonly color?: Vec4;
  };
  readonly priority: number;
};
