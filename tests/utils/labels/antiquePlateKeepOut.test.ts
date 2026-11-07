/**
 * antiquePlateKeepOut — the cartouche's corner stays reserved for labels
 * until Tab hides the UI, which also withdraws the cartouche itself.
 */
import { describe, expect, it } from 'vitest';
import { antiquePlateKeepOut } from '../../../src/utils/labels/antiquePlateKeepOut';

describe('antiquePlateKeepOut', () => {
  it('reserves the title cartouche, and frees its corner when the UI is hidden', () => {
    expect(antiquePlateKeepOut([1600, 900], false).keepOut.length).toBeGreaterThan(0);
    expect(antiquePlateKeepOut([1600, 900], true).keepOut).toEqual([]);
  });
});
