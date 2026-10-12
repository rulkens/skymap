import { describe, expect, it } from 'vitest';
import { focusShotUrl } from '../../../src/utils/palette/focusShotUrl';

describe('focusShotUrl', () => {
  // The bug this guards: a shot is filed under its card id, so a path built
  // from the focus id 404s.
  it('resolves a focus id to the file named by its card id', () => {
    expect(focusShotUrl('blackhole-sgr-a-star')).toMatch(/\.webp$/);
  });

  it('returns undefined for a focus id no featured card names', () => {
    expect(focusShotUrl('galaxy-cluster-no-such-thing')).toBeUndefined();
  });
});
