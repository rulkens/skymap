import { describe, it, expect } from 'vitest';
import { captionAnchor } from '../../../src/utils/animation/captionAnchor';

describe('captionAnchor', () => {
  it('splits each anchor into its vertical and horizontal halves', () => {
    expect(captionAnchor('top-left')).toEqual({ vertical: 'top', horizontal: 'left' });
    expect(captionAnchor('top-center')).toEqual({ vertical: 'top', horizontal: 'center' });
    expect(captionAnchor('top-right')).toEqual({ vertical: 'top', horizontal: 'right' });
    expect(captionAnchor('bottom-left')).toEqual({ vertical: 'bottom', horizontal: 'left' });
    expect(captionAnchor('bottom-right')).toEqual({ vertical: 'bottom', horizontal: 'right' });
  });
});
