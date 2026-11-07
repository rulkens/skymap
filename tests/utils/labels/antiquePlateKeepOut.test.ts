/**
 * antiquePlateKeepOut — the cartouche's corner stays reserved for labels
 * until Tab hides the UI, which also withdraws the cartouche itself; open
 * panels are kept clear too, and the reservation follows the cartouche when a
 * panel moves it to another corner.
 */
import { describe, expect, it } from 'vitest';
import { antiquePlateKeepOut } from '../../../src/utils/labels/antiquePlateKeepOut';

describe('antiquePlateKeepOut', () => {
  it('reserves the title cartouche, and frees its corner when the UI is hidden', () => {
    expect(antiquePlateKeepOut([1600, 900], false, []).keepOut.length).toBeGreaterThan(0);
    expect(antiquePlateKeepOut([1600, 900], true, []).keepOut).toEqual([]);
  });

  it('keeps names off open panels and reserves the corner the cartouche moved to', () => {
    const navigation = { x0: 0, y0: 240, x1: 290, y1: 880 };
    const { keepOut } = antiquePlateKeepOut([1600, 900], false, [navigation]);
    expect(keepOut).toContainEqual(navigation);
    const cartouche = keepOut.find((r) => r !== navigation)!;
    expect(cartouche.x0).toBeGreaterThan(800);
  });
});
