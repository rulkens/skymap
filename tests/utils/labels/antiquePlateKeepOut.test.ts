/**
 * antiquePlateKeepOut — the cartouche and the open panels stay reserved for
 * labels until Tab hides the UI, which withdraws both.
 */
import { describe, expect, it } from 'vitest';
import { antiquePlateKeepOut } from '../../../src/utils/labels/antiquePlateKeepOut';

describe('antiquePlateKeepOut', () => {
  const navigation = { x0: 0, y0: 240, x1: 290, y1: 880 };
  const cartouche = { x0: 1200, y0: 30, x1: 1550, y1: 400 };

  it('keeps names off the cartouche and the open panels, and frees both when the UI is hidden', () => {
    const shown = antiquePlateKeepOut([1600, 900], false, [navigation], cartouche).keepOut;
    expect(shown).toEqual([navigation, cartouche]);
    expect(antiquePlateKeepOut([1600, 900], true, [navigation], cartouche).keepOut).toEqual([]);
  });
});
