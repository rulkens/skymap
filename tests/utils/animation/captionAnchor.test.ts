import { describe, it, expect } from 'vitest';
import { captionAnchor } from '../../../src/utils/animation/captionAnchor';
import type { CaptionPosition } from '../../../src/@types/animation/tour/CaptionPosition';

describe('captionAnchor', () => {
  it('splits each anchor into its vertical and horizontal halves', () => {
    expect(captionAnchor('top-left')).toEqual({ vertical: 'top', horizontal: 'left' });
    expect(captionAnchor('top-center')).toEqual({ vertical: 'top', horizontal: 'center' });
    expect(captionAnchor('top-right')).toEqual({ vertical: 'top', horizontal: 'right' });
    expect(captionAnchor('bottom-left')).toEqual({ vertical: 'bottom', horizontal: 'left' });
    expect(captionAnchor('bottom-right')).toEqual({ vertical: 'bottom', horizontal: 'right' });
  });

  it('horizontal half doubles as the text alignment for every anchor', () => {
    // This is the load-bearing property: the overlay sets text-align directly
    // from `horizontal`, which is why a caption needs only `position` and never
    // a separate alignment field. A right anchor must yield right alignment.
    const cases: ReadonlyArray<[CaptionPosition, 'left' | 'center' | 'right']> = [
      ['bottom-left', 'left'],
      ['top-center', 'center'],
      ['bottom-right', 'right'],
    ];
    for (const [position, align] of cases) {
      expect(captionAnchor(position).horizontal).toBe(align);
    }
  });
});
