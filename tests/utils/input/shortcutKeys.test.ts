import { describe, expect, it } from 'vitest';

import { shortcutKeys } from '../../../src/utils/input/shortcutKeys';

describe('shortcutKeys', () => {
  it('splits on commas, but a comma that is the key itself stays a key', () => {
    expect(shortcutKeys('command+k,ctrl+k')).toEqual(['command+k', 'ctrl+k']);
    expect(shortcutKeys(',')).toEqual([',']);
    expect(shortcutKeys('.,,')).toEqual(['.', ',']);
  });
});
