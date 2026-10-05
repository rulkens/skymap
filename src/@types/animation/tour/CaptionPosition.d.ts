/**
 * CaptionPosition — where a tour beat's caption anchors on screen.
 *
 * A closed union of the five usable anchors. `bottom-center` is deliberately
 * absent: the tour's navigation cluster lives there, so a caption can never
 * share that slot. The author picks the anchor that dodges the beat's bright
 * subject (M87's glow sits centre-left, so its beat anchors bottom-right); text
 * alignment is NOT a separate field — it is derived from the horizontal half of
 * the anchor (`captionAnchor`), so a right anchor right-aligns with no extra
 * authoring.
 */

export type CaptionPosition =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right';
