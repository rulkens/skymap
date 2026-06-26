/**
 * captionAnchor — split a `CaptionPosition` into its vertical and horizontal
 * halves so the overlay can place the caption block and, in the same breath,
 * derive its text alignment.
 *
 * Text alignment is NOT a separate authored field: it simply follows the
 * horizontal half (`left` / `center` / `right`), so a right-anchored caption
 * right-aligns for free. Keeping the derivation here — one split of the
 * hyphenated literal — is the whole reason `BeatCaption` needs only a single
 * `position` rather than a position-plus-alignment pair.
 */

import type { CaptionPosition } from '../../@types/animation/tour/CaptionPosition';

export function captionAnchor(position: CaptionPosition): {
  vertical: 'top' | 'bottom';
  horizontal: 'left' | 'center' | 'right';
} {
  const [vertical, horizontal] = position.split('-') as [
    'top' | 'bottom',
    'left' | 'center' | 'right',
  ];
  return { vertical, horizontal };
}
